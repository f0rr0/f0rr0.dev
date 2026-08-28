const COMMIT_SHA = /^[a-f0-9]{40}$/;
const EVENT_ID = /^\d{1,64}$/;
const GITHUB_DELIVERY_ID =
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const GITHUB_WEBHOOK_COMMIT_LIMIT = 2048;
const PULL_REQUEST_ACTION = /^[a-z][a-z_]{0,39}$/;
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

export interface GitHubRepositoryFacts extends GitHubRepository {
  htmlUrl: string | null;
  ownerAvatarUrl: string | null;
  ownerId: string | null;
  ownerLogin: string;
  ownerType: "Organization" | "User" | null;
  visibility: "internal" | "private" | "public" | null;
}

export interface GitHubIssue {
  account: TrackedGitHubAccount;
  authorLogin: string;
  authorUserId: string;
  createdAt: string;
  nodeId: string;
  number: number;
  repository: GitHubRepositoryFacts;
  title: string;
  url: string;
}

export interface GitHubCommit {
  author: TrackedGitHubAccount;
  committedAt: string;
  message: string;
  repository: string;
  repositoryId: string;
  sha: string;
  url: string;
}

export interface GitHubPush {
  before: string;
  commitShas: readonly string[];
  head: string;
  pushedBy: TrackedGitHubAccount;
  ref: string;
  repository: GitHubRepository;
  size: number | null;
}

export interface GitHubPullRequest {
  action: string;
  additions: number | null;
  author: string;
  authorAccount: TrackedGitHubAccount | null;
  authorUserId: string;
  baseRef: string;
  baseRepository: GitHubRepositoryFacts;
  baseSha: string;
  body: string | null;
  changedFiles: number | null;
  closedAt: string | null;
  commitCount: number | null;
  createdAt: string;
  draft: boolean;
  deletions: number | null;
  headRef: string;
  headRepository: GitHubRepositoryFacts | null;
  headSha: string;
  id: string;
  mergeCommitSha: string | null;
  merged: boolean;
  mergedAt: string | null;
  nodeId: string;
  number: number;
  providerUpdatedAt: string;
  repository: GitHubRepositoryFacts;
  state: "closed" | "open";
  title: string;
  url: string;
}

export interface GitHubPullRequestWebhookObservation {
  account: TrackedGitHubAccount | null;
  pullRequest: GitHubPullRequest;
}

export interface GitHubPullRequestEventSignal {
  action: string;
  number: number;
  repositoryId: string;
}

export interface GitHubEvent {
  issue: GitHubIssue | null;
  occurredAt: string;
  id: string;
  push: GitHubPush | null;
  pullRequest: GitHubPullRequest | null;
  pullRequestSignal?: GitHubPullRequestEventSignal;
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

const optionalDate = (value: unknown) => {
  if (value === null) {
    return { valid: true, value: null } as const;
  }
  const date = normalizedDate(value);
  return { valid: date !== null, value: date } as const;
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

const positiveInteger = (value: unknown) => {
  const integer = nonNegativeInteger(value);
  return integer !== null && integer > 0 ? integer : null;
};

const optionalNonNegativeInteger = (value: unknown) => {
  if (value === null || value === undefined) {
    return { valid: true, value: null } as const;
  }
  const integer = nonNegativeInteger(value);
  return { valid: integer !== null, value: integer } as const;
};

export const trackedGitHubAccountFrom = (
  value: unknown
): TrackedGitHubAccount | null => {
  const login = normalizedText(value, 39)?.toLowerCase();
  return TRACKED_GITHUB_ACCOUNTS.find((account) => account === login) ?? null;
};

const githubLoginFrom = (value: unknown) => {
  const login = normalizedText(value, 39)?.toLowerCase();
  return login !== undefined && login !== null && GITHUB_LOGIN.test(login)
    ? login
    : null;
};

const githubActorLoginFrom = (value: unknown) => {
  const login = normalizedText(value, 100)?.toLowerCase();
  return login !== undefined &&
    /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?|[a-z\d](?:[a-z\d-]*[a-z\d])?\[bot\])$/i.test(
      login
    )
    ? login
    : null;
};

export const commitShaFrom = (value: unknown) => {
  const sha = typeof value === "string" ? value.toLowerCase() : "";
  return COMMIT_SHA.test(sha) ? sha : null;
};

const optionalCommitSha = (value: unknown) => {
  if (value === null) {
    return { valid: true, value: null } as const;
  }
  const sha = commitShaFrom(value);
  return { valid: sha !== null, value: sha } as const;
};

export const githubDeliveryIdFrom = (value: unknown) => {
  const deliveryId =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return GITHUB_DELIVERY_ID.test(deliveryId) ? deliveryId : null;
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

const safeAvatarUrlFrom = (value: unknown) => {
  const avatarUrl = normalizedText(value, 2000);
  if (avatarUrl === null) {
    return null;
  }
  try {
    const url = new URL(avatarUrl);
    return url.protocol === "https:" &&
      url.hostname === "avatars.githubusercontent.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const repositoryOwnerFactsFrom = (value: JsonObject, fullName: string) => {
  const ownerFromName = githubLoginFrom(fullName.split("/", 1)[0]);
  if (ownerFromName === null) {
    return null;
  }
  const owner = isObject(value.owner) ? value.owner : null;
  const observedLogin = owner === null ? null : githubLoginFrom(owner.login);
  if (observedLogin !== null && observedLogin !== ownerFromName) {
    return null;
  }
  return {
    ownerAvatarUrl: owner === null ? null : safeAvatarUrlFrom(owner.avatar_url),
    ownerId: owner === null ? null : repositoryIdFrom(owner.id),
    ownerLogin: observedLogin ?? ownerFromName,
    ownerType:
      owner?.type === "Organization"
        ? ("Organization" as const)
        : owner?.type === "User"
          ? ("User" as const)
          : null,
  };
};

const repositoryVisibilityFrom = (
  value: JsonObject
): {
  valid: boolean;
  visibility: "internal" | "private" | "public" | null;
} => {
  const explicit =
    value.visibility === "internal" ||
    value.visibility === "private" ||
    value.visibility === "public"
      ? value.visibility
      : null;
  const visibility =
    explicit ??
    (typeof value.private === "boolean"
      ? value.private
        ? "private"
        : "public"
      : null);
  return {
    valid:
      typeof value.private !== "boolean" ||
      visibility === null ||
      value.private === (visibility !== "public"),
    visibility,
  };
};

export const repositoryFactsFrom = (
  value: unknown
): GitHubRepositoryFacts | null => {
  const repository = repositoryFrom(value);
  if (repository === null || !isObject(value)) {
    return null;
  }

  const owner = repositoryOwnerFactsFrom(value, repository.fullName);
  const visibility = repositoryVisibilityFrom(value);
  if (owner === null || !visibility.valid) {
    return null;
  }
  const expectedHtmlUrl = `https://github.com/${repository.fullName}`;
  const htmlUrl = value.html_url === expectedHtmlUrl ? expectedHtmlUrl : null;

  return {
    ...repository,
    htmlUrl,
    ...owner,
    visibility: visibility.visibility,
  };
};

const repositoryFactsFromEvent = (event: JsonObject) => {
  const repository = repositoryFrom(event.repo);
  if (repository === null || !isObject(event.repo)) {
    return null;
  }
  const ownerLogin = githubLoginFrom(repository.fullName.split("/", 1)[0]);
  if (ownerLogin === null) {
    return null;
  }
  const eventOrganization = isObject(event.org) ? event.org : null;
  const organizationLogin = githubLoginFrom(eventOrganization?.login);
  const owner =
    eventOrganization !== null && organizationLogin === ownerLogin
      ? { ...eventOrganization, type: "Organization" }
      : {
          avatar_url: `https://avatars.githubusercontent.com/${ownerLogin}`,
          login: ownerLogin,
        };
  const visibility =
    typeof event.public === "boolean"
      ? event.public
        ? "public"
        : "private"
      : undefined;
  return repositoryFactsFrom({
    ...event.repo,
    full_name: repository.fullName,
    html_url: `https://github.com/${repository.fullName}`,
    owner,
    ...(visibility === undefined
      ? {}
      : { private: visibility !== "public", visibility }),
  });
};

export const issueFromGitHub = (
  value: unknown,
  repository: GitHubRepositoryFacts
): GitHubIssue | null => {
  if (!isObject(value) || !isObject(value.user) || "pull_request" in value) {
    return null;
  }
  const account = trackedGitHubAccountFrom(value.user.login);
  const authorLogin = githubLoginFrom(value.user.login);
  const authorUserId = repositoryIdFrom(value.user.id);
  const createdAt = normalizedDate(value.created_at);
  const nodeId = normalizedText(value.node_id, 128);
  const number = positiveInteger(value.number);
  const title =
    typeof value.title === "string" && value.title.trim().length > 0
      ? value.title
      : null;
  if (
    account === null ||
    authorLogin === null ||
    authorUserId === null ||
    createdAt === null ||
    nodeId === null ||
    number === null ||
    title === null
  ) {
    return null;
  }
  const url = `https://github.com/${repository.fullName}/issues/${number}`;
  if (value.html_url !== url) {
    return null;
  }
  return {
    account,
    authorLogin,
    authorUserId,
    createdAt,
    nodeId,
    number,
    repository,
    title,
    url,
  };
};

const expectedCommitUrl = (repository: GitHubRepository, sha: string) =>
  `https://github.com/${repository.fullName}/commit/${sha}`;

export const commitFromGitHub = (
  value: unknown,
  repository: GitHubRepository
): GitHubCommit | null => {
  if (!isObject(value) || !isObject(value.commit)) {
    throw new TypeError("GitHub returned an invalid commit response.");
  }

  const sha = commitShaFrom(value.sha);
  const message =
    typeof value.commit.message === "string"
      ? (normalizedText(value.commit.message.split(/\r?\n/, 1)[0], 240) ?? "")
      : null;
  const committedAt = normalizedDate(
    (isObject(value.commit.author) ? value.commit.author.date : undefined) ??
      (isObject(value.commit.committer)
        ? value.commit.committer.date
        : undefined)
  );
  if (sha === null || message === null || committedAt === null) {
    throw new TypeError("GitHub returned an invalid commit response.");
  }

  const url = expectedCommitUrl(repository, sha);
  if (value.html_url !== url) {
    throw new TypeError("GitHub returned an invalid commit response.");
  }

  if (value.author === null) {
    return null;
  }
  if (!isObject(value.author) || typeof value.author.login !== "string") {
    throw new TypeError("GitHub returned an invalid commit response.");
  }
  const authoredBy = trackedGitHubAccountFrom(value.author.login);
  if (authoredBy === null) {
    return null;
  }

  return {
    author: authoredBy,
    committedAt,
    message,
    repository: repository.fullName,
    repositoryId: repository.id,
    sha,
    url,
  };
};

const commitReferenceFrom = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  return commitShaFrom(value.sha ?? value.id);
};

const uniqueCommitReferences = (values: readonly unknown[]) => {
  const commits: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const sha = commitReferenceFrom(value);
    if (sha !== null && !seen.has(sha)) {
      commits.push(sha);
      seen.add(sha);
    }
  }
  return commits;
};

const pullRequestIdFrom = (value: unknown) => repositoryIdFrom(value);

const requiredDate = (value: unknown) => normalizedDate(value);

const pullRequestBranchesFrom = (
  value: JsonObject,
  repository: GitHubRepository
) => {
  const { base, head } = value;
  if (!isObject(base) || !isObject(head)) {
    return null;
  }
  const baseRef = normalizedText(base.ref, 300);
  const baseRepository = repositoryFactsFrom(base.repo);
  const baseSha = commitShaFrom(base.sha);
  const headRef = normalizedText(head.ref, 300);
  const headRepository =
    head.repo === null ? null : repositoryFactsFrom(head.repo);
  const headSha = commitShaFrom(head.sha);
  if (baseRef === null) {
    return null;
  }
  if (baseRepository === null || baseRepository.id !== repository.id) {
    return null;
  }
  if (baseSha === null || headRef === null || headSha === null) {
    return null;
  }
  if (head.repo !== null && headRepository === null) {
    return null;
  }
  return {
    baseRef,
    baseRepository,
    baseSha,
    headRef,
    headRepository,
    headSha,
  };
};

const pullRequestStateFrom = (
  value: JsonObject,
  closedAt: { value: string | null },
  mergedAt: { value: string | null }
) => {
  const { draft, merged: explicitMerged } = value;
  const state =
    value.state === "open"
      ? ("open" as const)
      : value.state === "closed"
        ? ("closed" as const)
        : null;
  if (
    state === null ||
    typeof draft !== "boolean" ||
    (explicitMerged !== undefined && typeof explicitMerged !== "boolean")
  ) {
    return null;
  }
  const merged =
    typeof explicitMerged === "boolean"
      ? explicitMerged
      : mergedAt.value !== null;
  if (
    [
      typeof explicitMerged === "boolean" &&
        explicitMerged !== (mergedAt.value !== null),
      merged && (mergedAt.value === null || state !== "closed"),
      !merged && mergedAt.value !== null,
      state === "closed" && closedAt.value === null,
      state === "open" && closedAt.value !== null,
    ].some(Boolean)
  ) {
    return null;
  }
  return { draft, merged, state };
};

const requiredPullRequestScalarsFrom = (input: {
  body: string | null | undefined;
  createdAt: string | null;
  id: string | null;
  nodeId: string | null;
  number: number | null;
  providerUpdatedAt: string | null;
  title: string | null;
}) => {
  if (
    input.id === null ||
    input.nodeId === null ||
    input.number === null ||
    input.body === undefined ||
    input.createdAt === null ||
    input.providerUpdatedAt === null ||
    input.title === null
  ) {
    return null;
  }
  return {
    body: input.body,
    createdAt: input.createdAt,
    id: input.id,
    nodeId: input.nodeId,
    number: input.number,
    providerUpdatedAt: input.providerUpdatedAt,
    title: input.title,
  };
};

export const pullRequestFromGitHub = (
  value: unknown,
  repository: GitHubRepository,
  actionValue: unknown = "observed"
): GitHubPullRequest | null => {
  if (!isObject(value) || !isObject(value.user)) {
    return null;
  }

  const author = githubActorLoginFrom(value.user.login);
  const authorAccount = trackedGitHubAccountFrom(value.user.login);
  const authorUserId = repositoryIdFrom(value.user.id);
  if (author === null || authorUserId === null) {
    return null;
  }
  const action = normalizedText(actionValue, 40)?.toLowerCase() ?? "";
  const additions = optionalNonNegativeInteger(value.additions);
  const id = pullRequestIdFrom(value.id);
  const nodeId = normalizedText(value.node_id, 100);
  const number = positiveInteger(value.number);
  const title =
    typeof value.title === "string" && value.title.trim().length > 0
      ? value.title
      : null;
  const body =
    value.body === null
      ? null
      : typeof value.body === "string"
        ? value.body
        : undefined;
  const createdAt = requiredDate(value.created_at);
  const closedAt = optionalDate(value.closed_at);
  const mergedAt = optionalDate(value.merged_at);
  const providerUpdatedAt = requiredDate(value.updated_at);
  const commitCount = nonNegativeInteger(value.commits);
  const changedFiles = optionalNonNegativeInteger(value.changed_files);
  const deletions = optionalNonNegativeInteger(value.deletions);
  const branches = pullRequestBranchesFrom(value, repository);
  const stateFacts = pullRequestStateFrom(value, closedAt, mergedAt);
  const mergeCommitSha = optionalCommitSha(value.merge_commit_sha);
  const required = requiredPullRequestScalarsFrom({
    body,
    createdAt,
    id,
    nodeId,
    number,
    providerUpdatedAt,
    title,
  });

  if (branches === null || stateFacts === null || required === null) {
    return null;
  }
  const expectedUrl = `https://github.com/${repository.fullName}/pull/${required.number}`;

  if (
    [
      !PULL_REQUEST_ACTION.test(action),
      !additions.valid,
      !closedAt.valid,
      !mergedAt.valid,
      value.commits !== undefined && commitCount === null,
      !changedFiles.valid,
      !deletions.valid,
      !mergeCommitSha.valid,
      value.html_url !== expectedUrl,
    ].some(Boolean)
  ) {
    return null;
  }

  return {
    action,
    additions: additions.value,
    author,
    authorAccount,
    authorUserId,
    baseRef: branches.baseRef,
    baseRepository: branches.baseRepository,
    baseSha: branches.baseSha,
    body: required.body,
    changedFiles: changedFiles.value,
    closedAt: closedAt.value,
    commitCount,
    createdAt: required.createdAt,
    draft: stateFacts.draft,
    deletions: deletions.value,
    headRef: branches.headRef,
    headRepository: branches.headRepository,
    headSha: branches.headSha,
    id: required.id,
    mergeCommitSha: mergeCommitSha.value,
    merged: stateFacts.merged,
    mergedAt: mergedAt.value,
    nodeId: required.nodeId,
    number: required.number,
    providerUpdatedAt: required.providerUpdatedAt,
    repository: branches.baseRepository,
    state: stateFacts.state,
    title: required.title,
    url: expectedUrl,
  };
};

const issueEventFrom = (
  value: JsonObject,
  account: TrackedGitHubAccount,
  id: string,
  occurredAt: string
): GitHubEvent | null => {
  if (!isObject(value.payload)) {
    return null;
  }
  const repository = repositoryFactsFromEvent(value);
  if (repository === null) {
    return null;
  }
  const action = normalizedText(value.payload.action, 40)?.toLowerCase();
  if (action === undefined || !PULL_REQUEST_ACTION.test(action)) {
    return null;
  }
  if (action !== "opened") {
    return { id, issue: null, occurredAt, pullRequest: null, push: null };
  }
  const rawIssue = value.payload.issue;
  if (!isObject(rawIssue) || !isObject(rawIssue.user)) {
    return null;
  }
  const authorLogin = githubLoginFrom(rawIssue.user.login);
  if (authorLogin === null) {
    return null;
  }
  if (trackedGitHubAccountFrom(authorLogin) !== account) {
    return { id, issue: null, occurredAt, pullRequest: null, push: null };
  }
  const issue = issueFromGitHub(rawIssue, repository);
  if (issue === null) {
    return null;
  }
  return {
    id,
    issue,
    occurredAt,
    pullRequest: null,
    push: null,
  };
};

const sparsePullRequestRepositoryFrom = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  const url = normalizedText(value.url, 2000);
  if (url === null || !url.startsWith("https://api.github.com/repos/")) {
    return null;
  }
  const fullName = url.slice("https://api.github.com/repos/".length);
  const repository = repositoryFrom({ id: value.id, name: fullName });
  const repositoryName = normalizedText(value.name, 100);
  if (
    repository === null ||
    repositoryName === null ||
    repositoryName !== repository.fullName.split("/")[1] ||
    url !== `https://api.github.com/repos/${repository.fullName}`
  ) {
    return null;
  }
  return repository;
};

const sparsePullRequestBranchIsValid = (
  value: unknown,
  expectedRepository: GitHubRepository | null
) => {
  if (!isObject(value)) {
    return false;
  }
  const repository =
    value.repo === null ? null : sparsePullRequestRepositoryFrom(value.repo);
  if (
    normalizedText(value.ref, 300) === null ||
    commitShaFrom(value.sha) === null ||
    (value.repo !== null && repository === null)
  ) {
    return false;
  }
  return (
    expectedRepository === null ||
    (repository !== null && repository.id === expectedRepository.id)
  );
};

const sparsePullRequestEventSignalFrom = (
  payload: JsonObject,
  repository: GitHubRepository
): GitHubPullRequestEventSignal | null => {
  if (!isObject(payload.pull_request)) {
    return null;
  }
  const value = payload.pull_request;
  const action = normalizedText(payload.action, 40)?.toLowerCase() ?? "";
  const payloadNumber = positiveInteger(payload.number);
  const number = positiveInteger(value.number);
  const id = pullRequestIdFrom(value.id);
  const expectedUrl =
    number === null
      ? null
      : `https://api.github.com/repos/${repository.fullName}/pulls/${number}`;
  if (
    !PULL_REQUEST_ACTION.test(action) ||
    payloadNumber === null ||
    number === null ||
    payloadNumber !== number ||
    id === null ||
    expectedUrl === null ||
    value.url !== expectedUrl ||
    !sparsePullRequestBranchIsValid(value.base, repository) ||
    !sparsePullRequestBranchIsValid(value.head, null)
  ) {
    return null;
  }
  return { action, number, repositoryId: repository.id };
};

const pullRequestEventFrom = (
  value: JsonObject,
  id: string,
  occurredAt: string
): GitHubEvent | null => {
  if (!isObject(value.payload)) {
    return null;
  }
  const repository = repositoryFrom(value.repo);
  if (repository === null) {
    return null;
  }
  const rawPullRequest = value.payload.pull_request;
  if (isObject(rawPullRequest) && "user" in rawPullRequest) {
    const pullRequest = pullRequestFromGitHub(
      rawPullRequest,
      repository,
      value.payload.action
    );
    if (pullRequest === null) {
      return null;
    }
    return {
      id,
      issue: null,
      occurredAt,
      // Persistence admits a foreign-authored PR only when its stable node ID is
      // already known through a tracked commit. Retaining it here lets a tracked
      // maintainer's terminal event schedule the final reconciliation.
      pullRequest,
      push: null,
    };
  }

  const pullRequestSignal = sparsePullRequestEventSignalFrom(
    value.payload,
    repository
  );
  if (pullRequestSignal === null) {
    return null;
  }
  return {
    id,
    issue: null,
    occurredAt,
    pullRequest: null,
    pullRequestSignal,
    push: null,
  };
};

const pushEventFrom = (
  value: JsonObject,
  account: TrackedGitHubAccount,
  id: string,
  occurredAt: string
): GitHubEvent | null => {
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
  const commitShas = uniqueCommitReferences(rawCommits);
  const size = nonNegativeInteger(value.payload.size);
  if (
    repository === null ||
    before === null ||
    head === null ||
    ref === null ||
    (size !== null && commitShas.length > size)
  ) {
    return null;
  }

  return {
    id,
    issue: null,
    occurredAt,
    pullRequest: null,
    push:
      head === ZERO_SHA || !ref.startsWith("refs/heads/")
        ? null
        : {
            before,
            commitShas,
            head,
            pushedBy: account,
            ref,
            repository,
            size,
          },
  };
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
  const occurredAt = normalizedDate(value.created_at);
  if (actor !== account || occurredAt === null) {
    return null;
  }
  const id = String(value.id);
  if (value.type === "IssuesEvent") {
    return issueEventFrom(value, account, id, occurredAt);
  }
  if (value.type === "PullRequestEvent") {
    return pullRequestEventFrom(value, id, occurredAt);
  }
  if (value.type === "PushEvent") {
    return pushEventFrom(value, account, id, occurredAt);
  }
  return { id, issue: null, occurredAt, pullRequest: null, push: null };
};

export const pushFromWebhook = (value: unknown): GitHubPush | null => {
  if (!isObject(value) || value.deleted === true) {
    return null;
  }

  const rawSender = value.sender;
  const hasSender = isObject(rawSender);
  const sender = hasSender ? trackedGitHubAccountFrom(rawSender.login) : null;
  const pusher = isObject(value.pusher)
    ? trackedGitHubAccountFrom(value.pusher.name)
    : null;
  // GitHub's authenticated sender is authoritative when present. A foreign
  // sender must not be replaced by the less authoritative pusher name.
  const pushedBy = hasSender ? sender : pusher;
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
  const commitShas = uniqueCommitReferences(rawCommits);
  const explicitSize = nonNegativeInteger(value.size);
  const size =
    explicitSize ??
    (rawCommits.length >= GITHUB_WEBHOOK_COMMIT_LIMIT
      ? null
      : commitShas.length);

  if (size !== null && commitShas.length > size) {
    return null;
  }

  return { before, commitShas, head, pushedBy, ref, repository, size };
};

export const pullRequestFromWebhook = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  const repository = repositoryFrom(value.repository);
  if (repository === null) {
    return null;
  }
  return pullRequestFromGitHub(value.pull_request, repository, value.action);
};

export const issueActionFromWebhook = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  const action = normalizedText(value.action, 40)?.toLowerCase() ?? null;
  return action !== null && PULL_REQUEST_ACTION.test(action) ? action : null;
};

export const issueFromWebhook = (value: unknown): GitHubIssue | null => {
  if (!isObject(value) || issueActionFromWebhook(value) !== "opened") {
    return null;
  }
  const repository = repositoryFactsFrom(value.repository);
  return repository === null ? null : issueFromGitHub(value.issue, repository);
};

export const pullRequestObservationFromWebhook = (
  value: unknown
): GitHubPullRequestWebhookObservation | null => {
  if (!isObject(value)) {
    return null;
  }
  const pullRequest = pullRequestFromWebhook(value);
  if (pullRequest === null) {
    return null;
  }
  return { account: pullRequest.authorAccount, pullRequest };
};

export const authenticatedGitHubAccountFrom = (value: unknown) =>
  isObject(value) && GITHUB_LOGIN.test(String(value.login))
    ? trackedGitHubAccountFrom(value.login)
    : null;
