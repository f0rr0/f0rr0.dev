import { DatabaseConfigurationError, isDatabaseConfigured } from "@/db/client";
import { fetchGitHub, githubApiUrl, nextGitHubPage } from "@/lib/github-api";
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
  isGitHubAccountPaused,
  persistAccountIntake,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";
import {
  hydrateSparseGitHubPullRequestEvents,
  reconcileAccessibleGitHubRepositoryRefs,
} from "@/lib/github-reconciliation";

const ACCOUNT_TOKEN_VARIABLES = {
  f0rr0: "GITHUB_F0RR0_TOKEN",
  yuppiestechdev: "GITHUB_YUPPIESTECHDEV_TOKEN",
} as const satisfies Record<TrackedGitHubAccount, string>;
const CHECKPOINT_ATTEMPTS = 3;
const EVENT_PAGES = 3;
const GITHUB_PAGE_SIZE = 100;

export interface GitHubAccountSyncResult {
  account: TrackedGitHubAccount;
  checkpointChanged: boolean;
  events: number;
  gapRecorded: boolean;
  issues: number;
  knownCommits: number;
  paused: boolean;
  pullRequests: number;
  pushes: number;
  refs: number;
  repositories: number;
}

export interface GitHubSyncResult {
  accounts: number;
  checkpoints: number;
  events: number;
  failedAccounts: readonly {
    account: TrackedGitHubAccount;
    error: string;
  }[];
  gaps: number;
  issues: number;
  knownCommits: number;
  paused: number;
  pullRequests: number;
  pushes: number;
  refs: number;
  repositories: number;
}

export class GitHubSyncConfigurationError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured.`);
    this.name = "GitHubSyncConfigurationError";
  }
}

const tokenFor = (account: TrackedGitHubAccount) => {
  const variable = ACCOUNT_TOKEN_VARIABLES[account];
  const token = process.env[variable]?.trim();
  if (token === undefined || token.length === 0) {
    throw new GitHubSyncConfigurationError(variable);
  }
  return token;
};

const fetchJson = async (url: URL, token: string) => {
  const response = await fetchGitHub(url, { token });
  return { payload: (await response.json()) as unknown, response };
};

const assertTokenIdentity = async (
  account: TrackedGitHubAccount,
  token: string
) => {
  const { payload } = await fetchJson(githubApiUrl("/user"), token);
  if (authenticatedGitHubAccountFrom(payload) !== account) {
    throw new Error(
      `${ACCOUNT_TOKEN_VARIABLES[account]} is not authenticated as ${account}.`
    );
  }
};

interface CollectedGitHubEvents {
  events: readonly GitHubEvent[];
  gap: {
    expectedEventId: string;
    oldestAvailableEventId: string;
  } | null;
  latestEventId: string | null;
}

export const collectGitHubEvents = async (
  account: TrackedGitHubAccount,
  token: string,
  checkpoint: string | null
): Promise<CollectedGitHubEvents> => {
  let url: URL | null = githubApiUrl(
    `/users/${encodeURIComponent(account)}/events`
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));

  let checkpointFound = checkpoint === null;
  let latestEventId: string | null = null;
  let oldestAvailableEventId: string | null = null;
  const events: GitHubEvent[] = [];

  for (let page = 0; url !== null && page < EVENT_PAGES; page += 1) {
    const { payload, response } = await fetchJson(url, token);
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
  return {
    events,
    gap,
    latestEventId: latestEventId ?? checkpoint,
  };
};

export const syncGitHubAccount = async (
  account: TrackedGitHubAccount
): Promise<GitHubAccountSyncResult> => {
  let token: string | null = null;

  for (let attempt = 0; attempt < CHECKPOINT_ATTEMPTS; attempt += 1) {
    const checkpoint = await readGitHubAccountCheckpoint(account);
    if (isGitHubAccountPaused(checkpoint)) {
      return {
        account,
        checkpointChanged: false,
        events: 0,
        gapRecorded: false,
        issues: 0,
        knownCommits: 0,
        paused: true,
        pullRequests: 0,
        pushes: 0,
        refs: 0,
        repositories: 0,
      };
    }
    if (token === null) {
      token = tokenFor(account);
      await assertTokenIdentity(account, token);
    }
    const collected = await collectGitHubEvents(
      account,
      token,
      checkpoint?.latestEventId ?? null
    );
    const events = await hydrateSparseGitHubPullRequestEvents(
      collected.events,
      token
    );

    try {
      const persisted = await persistAccountIntake({
        account,
        events,
        expectedCheckpoint: checkpoint,
        gap: collected.gap,
        latestEventId: collected.latestEventId,
      });
      const refs = await reconcileAccessibleGitHubRepositoryRefs(
        account,
        token
      );
      return {
        account,
        checkpointChanged:
          collected.latestEventId !== (checkpoint?.latestEventId ?? null),
        events: collected.events.length,
        gapRecorded: collected.gap !== null,
        issues: persisted.issues,
        knownCommits: persisted.knownCommits + refs.knownCommits,
        paused: false,
        pullRequests: persisted.pullRequests,
        pushes: persisted.pushes + refs.pushes,
        refs: refs.refs,
        repositories: refs.repositories,
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

export const syncGitHubAccounts = async (): Promise<GitHubSyncResult> => {
  if (!isDatabaseConfigured()) {
    throw new DatabaseConfigurationError();
  }

  const settled = await Promise.allSettled(
    TRACKED_GITHUB_ACCOUNTS.map(async (account) => ({
      account,
      result: await syncGitHubAccount(account),
    }))
  );
  const results = settled.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value.result] : []
  );
  const failedAccounts = settled.flatMap((outcome, index) => {
    if (outcome.status === "fulfilled") {
      return [];
    }
    return [
      {
        account: TRACKED_GITHUB_ACCOUNTS[index],
        error:
          outcome.reason instanceof Error
            ? outcome.reason.name.slice(0, 80)
            : "UnknownError",
      },
    ];
  });

  return {
    accounts: results.length,
    checkpoints: results.filter((result) => result.checkpointChanged).length,
    events: results.reduce((total, result) => total + result.events, 0),
    failedAccounts,
    gaps: results.filter((result) => result.gapRecorded).length,
    issues: results.reduce((total, result) => total + result.issues, 0),
    knownCommits: results.reduce(
      (total, result) => total + result.knownCommits,
      0
    ),
    paused: results.filter((result) => result.paused).length,
    pullRequests: results.reduce(
      (total, result) => total + result.pullRequests,
      0
    ),
    pushes: results.reduce((total, result) => total + result.pushes, 0),
    refs: results.reduce((total, result) => total + result.refs, 0),
    repositories: results.reduce(
      (total, result) => total + result.repositories,
      0
    ),
  };
};
