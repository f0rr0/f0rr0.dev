const COMMIT_SHA = /^[a-f0-9]{40}$/;
const EVENT_ID = /^\d{1,64}$/;
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const GITHUB_WEBHOOK_COMMIT_LIMIT = 2048;
const REPOSITORY_FULL_NAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/;
const ZERO_SHA = "0".repeat(40);

export const TRACKED_GITHUB_ACCOUNTS = ["f0rr0", "yuppiestechdev"] as const;

export type TrackedGitHubAccount = (typeof TRACKED_GITHUB_ACCOUNTS)[number];

type JsonObject = Record<string, unknown>;

export interface GitHubRepository {
  fullName: string;
  id: string;
}

export interface GitHubCommit {
  committedAt: string;
  message: string;
  pushedBy: TrackedGitHubAccount;
  repository: string;
  repositoryId: string;
  sha: string;
  url: string;
}

export interface GitHubPushCommit {
  commit: GitHubCommit | null;
  sha: string;
}

export interface GitHubPush {
  before: string;
  commits: GitHubPushCommit[];
  head: string;
  pushedBy: TrackedGitHubAccount;
  repository: GitHubRepository;
  size: number | null;
}

export interface GitHubEvent {
  id: string;
  push: GitHubPush | null;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizedText = (value: unknown, maximumLength: number) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized.slice(0, maximumLength);
};

const normalizedDate = (value: unknown) => {
  const text = normalizedText(value, 40);
  if (text === null) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const repositoryIdFrom = (value: unknown) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d{1,32}$/.test(value)) {
    return value;
  }
  return null;
};

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

export const trackedGitHubAccountFrom = (
  value: unknown
): TrackedGitHubAccount | null => {
  const login = normalizedText(value, 39)?.toLowerCase();
  return TRACKED_GITHUB_ACCOUNTS.find((account) => account === login) ?? null;
};

export const commitShaFrom = (value: unknown) => {
  const sha = typeof value === "string" ? value.toLowerCase() : "";
  return COMMIT_SHA.test(sha) ? sha : null;
};

export const repositoryFrom = (value: unknown): GitHubRepository | null => {
  if (!isObject(value)) {
    return null;
  }

  const id = repositoryIdFrom(value.id);
  const fullName = normalizedText(value.full_name ?? value.name, 200);
  if (
    id === null ||
    fullName === null ||
    !REPOSITORY_FULL_NAME.test(fullName)
  ) {
    return null;
  }

  return { fullName, id };
};

const expectedCommitUrl = (repository: GitHubRepository, sha: string) =>
  `https://github.com/${repository.fullName}/commit/${sha}`;

export const commitFromGitHub = (
  value: unknown,
  repository: GitHubRepository,
  pushedBy: TrackedGitHubAccount
): GitHubCommit | null => {
  if (!isObject(value) || !isObject(value.commit)) {
    return null;
  }

  const sha = commitShaFrom(value.sha);
  const message =
    typeof value.commit.message === "string"
      ? normalizedText(value.commit.message.split(/\r?\n/, 1)[0], 240)
      : null;
  const committedAt = normalizedDate(
    (isObject(value.commit.author) ? value.commit.author.date : undefined) ??
      (isObject(value.commit.committer)
        ? value.commit.committer.date
        : undefined)
  );
  if (sha === null || message === null || committedAt === null) {
    return null;
  }

  const url = expectedCommitUrl(repository, sha);
  if (value.html_url !== url) {
    return null;
  }

  return {
    committedAt,
    message,
    pushedBy,
    repository: repository.fullName,
    repositoryId: repository.id,
    sha,
    url,
  };
};

const commitFromWebhook = (
  value: unknown,
  repository: GitHubRepository,
  pushedBy: TrackedGitHubAccount
): GitHubPushCommit | null => {
  if (!isObject(value)) {
    return null;
  }

  const sha = commitShaFrom(value.id ?? value.sha);
  if (sha === null) {
    return null;
  }

  const message =
    typeof value.message === "string"
      ? normalizedText(value.message.split(/\r?\n/, 1)[0], 240)
      : null;
  const committedAt = normalizedDate(value.timestamp);
  const commit =
    message === null || committedAt === null
      ? null
      : {
          committedAt,
          message,
          pushedBy,
          repository: repository.fullName,
          repositoryId: repository.id,
          sha,
          url: expectedCommitUrl(repository, sha),
        };

  return { commit, sha };
};

const commitReferenceFrom = (value: unknown): GitHubPushCommit | null => {
  if (!isObject(value)) {
    return null;
  }
  const sha = commitShaFrom(value.sha ?? value.id);
  return sha === null ? null : { commit: null, sha };
};

const uniqueCommitReferences = (
  values: readonly unknown[],
  normalize: (value: unknown) => GitHubPushCommit | null
) => {
  const commits: GitHubPushCommit[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const commit = normalize(value);
    if (commit !== null && !seen.has(commit.sha)) {
      commits.push(commit);
      seen.add(commit.sha);
    }
  }
  return commits;
};

export const githubEventFrom = (
  value: unknown,
  account: TrackedGitHubAccount
): GitHubEvent | null => {
  if (!isObject(value) || !EVENT_ID.test(String(value.id))) {
    return null;
  }

  const actor = isObject(value.actor)
    ? trackedGitHubAccountFrom(value.actor.login)
    : null;
  if (actor !== account) {
    return null;
  }

  const id = String(value.id);
  if (value.type !== "PushEvent") {
    return { id, push: null };
  }
  if (!isObject(value.payload)) {
    return null;
  }

  const repository = repositoryFrom(value.repo);
  const before = commitShaFrom(value.payload.before);
  const head = commitShaFrom(value.payload.head);
  const ref = normalizedText(value.payload.ref, 300);
  const rawCommits = Array.isArray(value.payload.commits)
    ? value.payload.commits
    : [];
  const commits = uniqueCommitReferences(rawCommits, commitReferenceFrom);
  const size = nonNegativeInteger(value.payload.size);
  if (repository === null || before === null || head === null || ref === null) {
    return null;
  }

  return {
    id,
    push:
      head === ZERO_SHA || !ref.startsWith("refs/heads/")
        ? null
        : { before, commits, head, pushedBy: account, repository, size },
  };
};

export const pushFromWebhook = (value: unknown): GitHubPush | null => {
  if (!isObject(value) || value.deleted === true) {
    return null;
  }

  const sender = isObject(value.sender)
    ? trackedGitHubAccountFrom(value.sender.login)
    : null;
  const pusher = isObject(value.pusher)
    ? trackedGitHubAccountFrom(value.pusher.name)
    : null;
  const pushedBy = sender ?? pusher;
  const repository = repositoryFrom(value.repository);
  const before = commitShaFrom(value.before);
  const head = commitShaFrom(value.after);
  const ref = normalizedText(value.ref, 300);
  if (
    pushedBy === null ||
    repository === null ||
    before === null ||
    head === null ||
    ref === null ||
    !ref.startsWith("refs/heads/") ||
    head === ZERO_SHA
  ) {
    return null;
  }

  const rawCommits = Array.isArray(value.commits) ? value.commits : [];
  const commits = uniqueCommitReferences(rawCommits, (commit) =>
    commitFromWebhook(commit, repository, pushedBy)
  );
  const explicitSize = nonNegativeInteger(value.size);
  const size =
    explicitSize ??
    (rawCommits.length >= GITHUB_WEBHOOK_COMMIT_LIMIT ? null : commits.length);

  return { before, commits, head, pushedBy, repository, size };
};

export const authenticatedGitHubAccountFrom = (value: unknown) =>
  isObject(value) && GITHUB_LOGIN.test(String(value.login))
    ? trackedGitHubAccountFrom(value.login)
    : null;
