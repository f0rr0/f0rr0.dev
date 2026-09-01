import { DatabaseConfigurationError, isDatabaseConfigured } from "@/db/client";
import { env } from "@/env";
import {
  fetchGitHub,
  githubApiUrl,
  githubNextPollAtFrom,
  githubResponseEtagFrom,
  nextGitHubPage,
} from "@/lib/github-api";
import {
  authenticatedGitHubAccountFrom,
  githubEventFrom,
  TRACKED_GITHUB_ACCOUNTS,
} from "@/lib/github-commits-core";
import type {
  GitHubEvent,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  CheckpointConflictError,
  beginGitHubEventPoll,
  isGitHubAccountPaused,
  persistAccountIntake,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";
import type { GitHubRepositoryRefKind } from "@/lib/github-commits-store";
import { reconcileGitHubRepositoryRefBatch } from "@/lib/github-ref-reconciliation-batch";

const ACCOUNT_TOKEN_VARIABLES = {
  f0rr0: "GITHUB_F0RR0_TOKEN",
  yuppiestechdev: "GITHUB_YUPPIESTECHDEV_TOKEN",
} as const satisfies Record<TrackedGitHubAccount, string>;
const CHECKPOINT_ATTEMPTS = 3;
const EVENT_PAGES = 3;
const GITHUB_PAGE_SIZE = 100;

interface FailedGitHubAccount {
  account: TrackedGitHubAccount;
  error: string;
}

export interface GitHubAccountSyncResult {
  account: TrackedGitHubAccount;
  checkpointChanged: boolean;
  deferred: boolean;
  events: number;
  gapRecorded: boolean;
  issues: number;
  knownCommits: number;
  notModified: boolean;
  paused: boolean;
  pullRequests: number;
  pushes: number;
}

export interface GitHubSyncResult {
  accounts: number;
  checkpoints: number;
  deferred: number;
  events: number;
  failedAccounts: readonly FailedGitHubAccount[];
  gaps: number;
  issues: number;
  knownCommits: number;
  notModified: number;
  paused: number;
  pullRequests: number;
  pushes: number;
}

export interface GitHubAccountRefReconciliationResult {
  account: TrackedGitHubAccount;
  complete: boolean;
  kind: GitHubRepositoryRefKind;
  knownCommits: number;
  pages: number;
  paused: boolean;
  pushes: number;
  refs: number;
  repositories: number;
}

export interface GitHubRefReconciliationResult {
  accounts: number;
  complete: boolean;
  failedAccounts: readonly FailedGitHubAccount[];
  knownCommits: number;
  kind: GitHubRepositoryRefKind;
  pages: number;
  paused: number;
  pushes: number;
  refs: number;
  repositories: number;
}

class GitHubSyncConfigurationError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured.`);
    this.name = "GitHubSyncConfigurationError";
  }
}

const tokenFor = (account: TrackedGitHubAccount) => {
  const variable = ACCOUNT_TOKEN_VARIABLES[account];
  const token = env[variable]?.trim();
  if (token === undefined || token.length === 0) {
    throw new GitHubSyncConfigurationError(variable);
  }
  return token;
};

interface GitHubCronRequestOptions {
  deadlineAt?: number;
}

const settleTrackedGitHubAccounts = async <Result>(
  action: (account: TrackedGitHubAccount) => Promise<Result>
): Promise<{
  failedAccounts: readonly FailedGitHubAccount[];
  results: readonly Result[];
}> => {
  const settled = await Promise.allSettled(TRACKED_GITHUB_ACCOUNTS.map(action));
  const results: Result[] = [];
  const failedAccounts: FailedGitHubAccount[] = [];

  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
      continue;
    }
    const account = TRACKED_GITHUB_ACCOUNTS[index];
    if (account === undefined) {
      throw new Error("A GitHub account result has no tracked account.");
    }
    failedAccounts.push({
      account,
      error:
        outcome.reason instanceof Error
          ? outcome.reason.name.slice(0, 80)
          : "UnknownError",
    });
  }

  return { failedAccounts, results };
};

const fetchJson = async (
  url: URL,
  token: string,
  options: GitHubCronRequestOptions = {}
) => {
  const response = await fetchGitHub(url, {
    deadlineAt: options.deadlineAt,
    token,
  });
  return { payload: (await response.json()) as unknown, response };
};

export const assertGitHubTokenIdentity = async (
  account: TrackedGitHubAccount,
  token: string,
  options: GitHubCronRequestOptions = {}
) => {
  const { payload } = await fetchJson(githubApiUrl("/user"), token, options);
  if (authenticatedGitHubAccountFrom(payload) !== account) {
    throw new Error(
      `${ACCOUNT_TOKEN_VARIABLES[account]} is not authenticated as ${account}.`
    );
  }
};

interface CollectedGitHubEvents {
  etag: string | null;
  events: readonly GitHubEvent[];
  gap: {
    expectedEventId: string;
    oldestAvailableEventId: string;
  } | null;
  latestEventId: string | null;
  nextPollAt: Date;
  notModified: boolean;
}

// oxlint-disable-next-line eslint/complexity -- Bounded pagination, checkpoint gaps, 304 handling, and provider poll timing fail independently.
export const collectGitHubEvents = async (
  account: TrackedGitHubAccount,
  token: string,
  checkpoint: string | null,
  etag: string | null = null,
  options: GitHubCronRequestOptions = {}
): Promise<CollectedGitHubEvents> => {
  let url: URL | null = githubApiUrl(
    `/users/${encodeURIComponent(account)}/events`
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));

  let checkpointFound = checkpoint === null;
  let latestEventId: string | null = null;
  let oldestAvailableEventId: string | null = null;
  let responseEtag: string | null = null;
  let nextPollAt: Date | null = null;
  const events: GitHubEvent[] = [];

  for (let page = 0; url !== null && page < EVENT_PAGES; page += 1) {
    const response = await fetchGitHub(url, {
      deadlineAt: options.deadlineAt,
      ifNoneMatch: page === 0 ? etag : null,
      token,
    });
    if (page === 0) {
      nextPollAt = githubNextPollAtFrom(response);
    }
    if (response.status === 304) {
      if (nextPollAt === null) {
        throw new Error("GitHub returned no event poll interval.");
      }
      return {
        etag,
        events: [],
        gap: null,
        latestEventId: checkpoint,
        nextPollAt,
        notModified: true,
      };
    }
    const payload = (await response.json()) as unknown;
    if (page === 0) {
      responseEtag = githubResponseEtagFrom(response);
    }
    if (!Array.isArray(payload)) {
      throw new TypeError("GitHub returned an invalid event response.");
    }

    for (const value of payload) {
      const event = githubEventFrom(value, account);
      if (event === null) {
        throw new TypeError("GitHub returned an invalid account event.");
      }
      latestEventId ??= event.id;
      oldestAvailableEventId = event.id;
      if (event.id === checkpoint) {
        checkpointFound = true;
        break;
      }
      events.push(event);
    }

    if (checkpointFound && checkpoint !== null) {
      break;
    }
    url = nextGitHubPage(response);
  }

  const gap =
    checkpoint !== null &&
    latestEventId !== null &&
    oldestAvailableEventId !== null &&
    !checkpointFound
      ? {
          expectedEventId: checkpoint,
          oldestAvailableEventId,
        }
      : null;
  if (nextPollAt === null) {
    throw new Error("GitHub returned no event poll interval.");
  }
  return {
    etag: responseEtag,
    events,
    gap,
    latestEventId: latestEventId ?? checkpoint,
    nextPollAt,
    notModified: false,
  };
};

export const syncGitHubAccount = async (
  account: TrackedGitHubAccount,
  options: GitHubCronRequestOptions = {}
): Promise<GitHubAccountSyncResult> => {
  let token: string | null = null;

  for (let attempt = 0; attempt < CHECKPOINT_ATTEMPTS; attempt += 1) {
    const started = await beginGitHubEventPoll(account);
    const { checkpoint } = started;
    if (isGitHubAccountPaused(checkpoint)) {
      return {
        account,
        checkpointChanged: false,
        deferred: false,
        events: 0,
        gapRecorded: false,
        issues: 0,
        knownCommits: 0,
        notModified: false,
        paused: true,
        pullRequests: 0,
        pushes: 0,
      };
    }
    if (!started.shouldPoll) {
      return {
        account,
        checkpointChanged: false,
        deferred: true,
        events: 0,
        gapRecorded: false,
        issues: 0,
        knownCommits: 0,
        notModified: false,
        paused: false,
        pullRequests: 0,
        pushes: 0,
      };
    }
    if (token === null) {
      token = tokenFor(account);
      await assertGitHubTokenIdentity(account, token, options);
    }
    const collected = await collectGitHubEvents(
      account,
      token,
      checkpoint.latestEventId,
      checkpoint.eventsEtag,
      options
    );
    try {
      const persisted = await persistAccountIntake({
        account,
        events: collected.events,
        eventsEtag: collected.etag,
        eventsNextPollAt: collected.nextPollAt,
        expectedCheckpoint: checkpoint,
        gap: collected.gap,
        latestEventId: collected.latestEventId,
      });
      return {
        account,
        checkpointChanged:
          collected.latestEventId !== (checkpoint?.latestEventId ?? null),
        deferred: false,
        events: collected.events.length,
        gapRecorded: collected.gap !== null,
        issues: persisted.issues,
        knownCommits: persisted.knownCommits,
        notModified: collected.notModified,
        paused: false,
        pullRequests: persisted.pullRequests,
        pushes: persisted.pushes,
      };
    } catch (error) {
      if (
        !(error instanceof CheckpointConflictError) ||
        attempt === CHECKPOINT_ATTEMPTS - 1
      ) {
        throw error;
      }
    }
  }

  throw new Error("GitHub checkpoint retry budget exhausted.");
};

export const syncGitHubAccounts = async (
  options: GitHubCronRequestOptions = {}
): Promise<GitHubSyncResult> => {
  if (!isDatabaseConfigured()) {
    throw new DatabaseConfigurationError();
  }

  const { failedAccounts, results } = await settleTrackedGitHubAccounts(
    async (account) => await syncGitHubAccount(account, options)
  );

  return {
    accounts: results.length,
    checkpoints: results.filter((result) => result.checkpointChanged).length,
    deferred: results.filter((result) => result.deferred).length,
    events: results.reduce((total, result) => total + result.events, 0),
    failedAccounts,
    gaps: results.filter((result) => result.gapRecorded).length,
    issues: results.reduce((total, result) => total + result.issues, 0),
    knownCommits: results.reduce(
      (total, result) => total + result.knownCommits,
      0
    ),
    notModified: results.filter((result) => result.notModified).length,
    paused: results.filter((result) => result.paused).length,
    pullRequests: results.reduce(
      (total, result) => total + result.pullRequests,
      0
    ),
    pushes: results.reduce((total, result) => total + result.pushes, 0),
  };
};

export const reconcileGitHubAccountRefs = async (
  account: TrackedGitHubAccount,
  options: {
    deadlineAt: number;
    forceInventoryRefresh?: boolean;
    kind: GitHubRepositoryRefKind;
    repositoryLimit: number;
  }
): Promise<GitHubAccountRefReconciliationResult> => {
  const checkpoint = await readGitHubAccountCheckpoint(account);
  if (isGitHubAccountPaused(checkpoint)) {
    return {
      account,
      complete: true,
      kind: options.kind,
      knownCommits: 0,
      pages: 0,
      paused: true,
      pushes: 0,
      refs: 0,
      repositories: 0,
    };
  }
  const token = tokenFor(account);
  await assertGitHubTokenIdentity(account, token, options);
  return {
    account,
    kind: options.kind,
    paused: false,
    ...(await reconcileGitHubRepositoryRefBatch({
      account,
      deadlineAt: options.deadlineAt,
      forceInventoryRefresh: options.forceInventoryRefresh,
      kind: options.kind,
      repositoryLimit: options.repositoryLimit,
      token,
    })),
  };
};

export const reconcileGitHubRefs = async (options: {
  deadlineAt: number;
  forceInventoryRefresh?: boolean;
  kind: GitHubRepositoryRefKind;
  repositoryLimit: number;
}): Promise<GitHubRefReconciliationResult> => {
  if (!isDatabaseConfigured()) {
    throw new DatabaseConfigurationError();
  }
  const { failedAccounts, results } = await settleTrackedGitHubAccounts(
    async (account) => await reconcileGitHubAccountRefs(account, options)
  );
  return {
    accounts: results.length,
    complete:
      failedAccounts.length === 0 && results.every((result) => result.complete),
    failedAccounts,
    knownCommits: results.reduce(
      (total, result) => total + result.knownCommits,
      0
    ),
    kind: options.kind,
    pages: results.reduce((total, result) => total + result.pages, 0),
    paused: results.filter((result) => result.paused).length,
    pushes: results.reduce((total, result) => total + result.pushes, 0),
    refs: results.reduce((total, result) => total + result.refs, 0),
    repositories: results.reduce(
      (total, result) => total + result.repositories,
      0
    ),
  };
};
