import { DatabaseConfigurationError, isDatabaseConfigured } from "@/db/client";
import { fetchGitHub, githubApiUrl, nextGitHubPage } from "@/lib/github-api";
import {
  authenticatedGitHubAccountFrom,
  commitFromGitHub,
  githubEventFrom,
  TRACKED_GITHUB_ACCOUNTS,
} from "@/lib/github-commits-core";
import type {
  GitHubCommit,
  GitHubPush,
  GitHubPushCommit,
  GitHubRepository,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  CheckpointConflictError,
  persistAccountSync,
  persistGitHubCommits,
  readGitHubAccountCheckpoint,
} from "@/lib/github-commits-store";

const ACCOUNT_TOKEN_VARIABLES = {
  f0rr0: "GITHUB_F0RR0_TOKEN",
  yuppiestechdev: "GITHUB_YUPPIESTECHDEV_TOKEN",
} as const satisfies Record<TrackedGitHubAccount, string>;
const CHECKPOINT_ATTEMPTS = 3;
const COMMIT_FETCH_CONCURRENCY = 8;
const EVENT_PAGES = 3;
const GITHUB_PAGE_SIZE = 100;
const MAX_COMMIT_PAGES = 30;
const ZERO_SHA = "0".repeat(40);

type JsonObject = Record<string, unknown>;

export interface GitHubAccountSyncResult {
  account: TrackedGitHubAccount;
  checkpointChanged: boolean;
  commits: number;
  events: number;
}

export interface GitHubSyncResult {
  accounts: number;
  checkpoints: number;
  commits: number;
  events: number;
}

export class GitHubSyncConfigurationError extends Error {
  constructor(variable: string) {
    super(`${variable} is not configured.`);
    this.name = "GitHubSyncConfigurationError";
  }
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const tokenFor = (account: TrackedGitHubAccount) => {
  const variable = ACCOUNT_TOKEN_VARIABLES[account];
  const token = process.env[variable]?.trim();
  if (token === undefined || token.length === 0) {
    throw new GitHubSyncConfigurationError(variable);
  }
  return token;
};

const repositoryPath = (repository: GitHubRepository, suffix: string) => {
  const [owner, name, ...rest] = repository.fullName.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new Error("Invalid GitHub repository name.");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    name
  )}/${suffix}`;
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

const fetchCommit = async (
  repository: GitHubRepository,
  sha: string,
  pushedBy: TrackedGitHubAccount,
  token: string
) => {
  const { payload } = await fetchJson(
    githubApiUrl(
      repositoryPath(repository, `commits/${encodeURIComponent(sha)}`)
    ),
    token
  );
  const commit = commitFromGitHub(payload, repository, pushedBy);
  if (commit === null) {
    throw new TypeError("GitHub returned an invalid commit response.");
  }
  return commit;
};

const fetchInBatches = async <Input, Output>(
  values: readonly Input[],
  transform: (value: Input) => Promise<Output>
) => {
  const output: Output[] = [];
  for (
    let offset = 0;
    offset < values.length;
    offset += COMMIT_FETCH_CONCURRENCY
  ) {
    output.push(
      ...(await Promise.all(
        values.slice(offset, offset + COMMIT_FETCH_CONCURRENCY).map(transform)
      ))
    );
  }
  return output;
};

const fetchComparison = async (push: GitHubPush, token: string) => {
  let url: URL | null = githubApiUrl(
    repositoryPath(
      push.repository,
      `compare/${encodeURIComponent(push.before)}...${encodeURIComponent(
        push.head
      )}`
    )
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));

  const commits: unknown[] = [];
  for (let page = 0; url !== null && page < MAX_COMMIT_PAGES; page += 1) {
    const { payload, response } = await fetchJson(url, token);
    if (!isObject(payload) || !Array.isArray(payload.commits)) {
      throw new TypeError("GitHub returned an invalid comparison response.");
    }
    commits.push(...payload.commits);
    url = nextGitHubPage(response);
  }
  if (url !== null) {
    throw new Error("GitHub comparison exceeded the pagination safety limit.");
  }
  return commits;
};

const fetchNewBranchCommits = async (push: GitHubPush, token: string) => {
  const commits: unknown[] = [];
  let url: URL | null = githubApiUrl(
    repositoryPath(push.repository, "commits")
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("sha", push.head);

  for (
    let page = 0;
    url !== null &&
    page < MAX_COMMIT_PAGES &&
    (push.size === null || commits.length < push.size);
    page += 1
  ) {
    const { payload, response } = await fetchJson(url, token);
    if (!Array.isArray(payload)) {
      throw new TypeError("GitHub returned an invalid commit-list response.");
    }
    commits.push(...payload);
    url = nextGitHubPage(response);
  }
  if (url !== null && (push.size === null || commits.length < push.size)) {
    throw new Error(
      "GitHub commit history exceeded the pagination safety limit."
    );
  }
  return push.size === null ? commits : commits.slice(0, push.size);
};

const commitsFromApiValues = (values: readonly unknown[], push: GitHubPush) => {
  const commits: GitHubCommit[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const commit = commitFromGitHub(value, push.repository, push.pushedBy);
    if (commit === null) {
      throw new TypeError("GitHub returned an invalid commit in a push.");
    }
    if (!seen.has(commit.sha)) {
      commits.push(commit);
      seen.add(commit.sha);
    }
  }
  return commits;
};

const collectPushCommits = async (push: GitHubPush, token: string) => {
  if (push.size === 0) {
    return [];
  }

  if (push.size === null || push.commits.length < push.size) {
    const values =
      push.before === ZERO_SHA
        ? await fetchNewBranchCommits(push, token)
        : await fetchComparison(push, token);
    const commits = commitsFromApiValues(values, push);
    if (push.size !== null && commits.length < push.size) {
      throw new Error("GitHub did not return every commit in the push.");
    }
    return commits;
  }

  const embedded: GitHubCommit[] = [];
  const missing: GitHubPushCommit[] = [];
  for (const reference of push.commits) {
    if (reference.commit === null) {
      missing.push(reference);
    } else {
      embedded.push(reference.commit);
    }
  }
  const fetched = await fetchInBatches(
    missing,
    async ({ sha }) =>
      await fetchCommit(push.repository, sha, push.pushedBy, token)
  );
  return [...embedded, ...fetched];
};

const collectNewEvents = async (
  account: TrackedGitHubAccount,
  token: string,
  checkpoint: string | null
) => {
  let url: URL | null = githubApiUrl(
    `/users/${encodeURIComponent(account)}/events`
  );
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));

  let checkpointFound = checkpoint === null;
  let latestEventId: string | null = null;
  let events = 0;
  const pushes: GitHubPush[] = [];

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
      if (event.id === checkpoint) {
        checkpointFound = true;
        break;
      }
      events += 1;
      if (event.push !== null) {
        pushes.push(event.push);
      }
    }

    if (checkpointFound && checkpoint !== null) {
      break;
    }
    url = nextGitHubPage(response);
  }

  if (checkpoint !== null && latestEventId !== null && !checkpointFound) {
    const error = new Error(
      `The saved GitHub event for ${account} is no longer present in the event feed.`
    );
    error.name = "GitHubEventGapError";
    throw error;
  }

  return {
    events,
    latestEventId: latestEventId ?? checkpoint,
    pushes,
  };
};

export const syncGitHubAccount = async (
  account: TrackedGitHubAccount
): Promise<GitHubAccountSyncResult> => {
  const token = tokenFor(account);
  await assertTokenIdentity(account, token);

  for (let attempt = 0; attempt < CHECKPOINT_ATTEMPTS; attempt += 1) {
    const checkpoint = await readGitHubAccountCheckpoint(account);
    const collected = await collectNewEvents(
      account,
      token,
      checkpoint?.latestEventId ?? null
    );
    const commits = (
      await fetchInBatches(
        collected.pushes,
        async (push) => await collectPushCommits(push, token)
      )
    ).flat();

    try {
      const persisted = await persistAccountSync({
        account,
        commits,
        expectedCheckpoint: checkpoint,
        latestEventId: collected.latestEventId,
      });
      return {
        account,
        checkpointChanged:
          collected.latestEventId !== (checkpoint?.latestEventId ?? null),
        commits: persisted,
        events: collected.events,
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

  const results: GitHubAccountSyncResult[] = [];
  for (const account of TRACKED_GITHUB_ACCOUNTS) {
    results.push(await syncGitHubAccount(account));
  }

  return {
    accounts: results.length,
    checkpoints: results.filter((result) => result.checkpointChanged).length,
    commits: results.reduce((total, result) => total + result.commits, 0),
    events: results.reduce((total, result) => total + result.events, 0),
  };
};

export const syncGitHubWebhookPush = async (push: GitHubPush) => {
  const needsGitHubRequest =
    push.size === null ||
    push.commits.length < push.size ||
    push.commits.some((commit) => commit.commit === null);
  const commits = needsGitHubRequest
    ? await collectPushCommits(push, tokenFor(push.pushedBy))
    : push.commits.flatMap(({ commit }) => (commit === null ? [] : [commit]));
  return await persistGitHubCommits(commits);
};
