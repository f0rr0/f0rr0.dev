const COMMIT_SHA = /^[a-f0-9]{40}$/;
const EVENT_ID = /^\d{1,64}$/;
const GITHUB_DELIVERY_ID =
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const PULL_REQUEST_ACTION = /^[a-z][a-z_]{0,39}$/;
const REPOSITORY_FULL_NAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/;
const ZERO_SHA = "0".repeat(40);

export const TRACKED_GITHUB_ACCOUNTS = ["f0rr0", "yuppiestechdev"] as const;

export type TrackedGitHubAccount = (typeof TRACKED_GITHUB_ACCOUNTS)[number];

export const TRACKED_GITHUB_USER_IDS = {
  f0rr0: "8574219",
  yuppiestechdev: "99666891",
} as const satisfies Record<TrackedGitHubAccount, string>;

type JsonObject = Record<string, unknown>;

export interface GitHubRepository {
  fullName: string;
  id: string;
}

export interface GitHubRepositoryFacts extends GitHubRepository {
  defaultBranch: string | null;
  htmlUrl: string | null;
  ownerAvatarUrl: string | null;
  ownerId: string | null;
  ownerLogin: string;
  ownerType: "Organization" | "User" | null;
  pushedAt: string | null;
  visibility: "internal" | "private" | "public" | null;
}

/** Complete summary context available only from a repository inventory. */
export interface GitHubRepositoryInventoryFacts extends GitHubRepositoryFacts {
  description: string | null;
  homepageUrl: string | null;
  topics: readonly string[];
}

interface GitHubRefSignal {
  afterSha: string | null;
  beforeSha: string | null;
  forced: boolean;
  operation: "create" | "delete" | "update";
  refName: string;
  repository: GitHubRepositoryFacts;
}

export interface GitHubHeadSignal extends GitHubRefSignal {
  kind: "head";
}

export interface GitHubTagSignal extends GitHubRefSignal {
  kind: "tag";
}

export type GitHubWebhookRefSignal = GitHubHeadSignal | GitHubTagSignal;

export interface GitHubBranchLineageRef {
  active: boolean;
  branchLineageId: string;
  headSha: string;
  refName: string;
}

export interface GitHubBranchLineageTip {
  headSha: string;
  refName: string;
}

export const planGitHubBranchLineages = (
  existingRefs: readonly GitHubBranchLineageRef[],
  incomingRefs: readonly GitHubBranchLineageTip[],
  createLineage: () => string
): ReadonlyMap<string, string> => {
  const refs = new Map(existingRefs.map((ref) => [ref.refName, { ...ref }]));
  const planned = new Map<string, string>();
  const activeLineageCounts = () => {
    const counts = new Map<string, number>();
    for (const ref of refs.values()) {
      if (ref.active) {
        counts.set(
          ref.branchLineageId,
          (counts.get(ref.branchLineageId) ?? 0) + 1
        );
      }
    }
    return counts;
  };

  for (const incoming of [...incomingRefs].toSorted((left, right) =>
    left.refName < right.refName ? -1 : left.refName > right.refName ? 1 : 0
  )) {
    const previous = refs.get(incoming.refName);
    const [peerLineage] = [...refs.values()]
      .filter(
        (ref) =>
          ref.refName !== incoming.refName && ref.headSha === incoming.headSha
      )
      .map((ref) => ref.branchLineageId)
      .toSorted();
    const previousIsSoleActiveLineage =
      previous !== undefined &&
      (activeLineageCounts().get(previous.branchLineageId) ?? 0) <= 1;
    const branchLineageId =
      previous?.headSha === incoming.headSha
        ? [previous.branchLineageId, peerLineage]
            .filter((value): value is string => value !== undefined)
            .toSorted()[0]
        : (peerLineage ??
          (previousIsSoleActiveLineage
            ? previous.branchLineageId
            : createLineage()));
    if (branchLineageId === undefined || branchLineageId.length === 0) {
      throw new Error("A GitHub head lineage could not be assigned.");
    }
    planned.set(incoming.refName, branchLineageId);
    refs.set(incoming.refName, {
      active: true,
      branchLineageId,
      headSha: incoming.headSha,
      refName: incoming.refName,
    });
  }
  return planned;
};

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

export const githubCommitReferenceValuesFrom = (
  commit: GitHubCommit,
  firstObservedAt: Date
) => ({
  author: commit.author,
  authorUserId: TRACKED_GITHUB_USER_IDS[commit.author],
  committedAt: new Date(commit.committedAt),
  firstObservedAt,
  message: commit.message,
  repositoryId: commit.repositoryId,
  sha: commit.sha,
});

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
  /**
   * GitHub's observed integration-commit candidate.
   * `undefined` means the versioned REST representation omitted the field;
   * `null` means no candidate exists. Durable merge identity must be verified
   * from GraphQL `PullRequest.mergeCommit` before it is treated as authoritative.
   */
  mergeCommitSha: string | null | undefined;
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
  repository: GitHubRepository;
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

const optionalRepositoryDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return { valid: true, value: null } as const;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return { valid: false, value: null } as const;
    }
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime())
      ? ({ valid: false, value: null } as const)
      : ({ valid: true, value: date.toISOString() } as const);
  }
  const date = normalizedDate(value);
  return { valid: date !== null, value: date } as const;
};

export const repositoryIdFrom = (value: unknown) => {
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

export const trackedGitHubAccountFromUserId = (
  value: unknown
): TrackedGitHubAccount | null => {
  const userId = repositoryIdFrom(value);
  return userId === null
    ? null
    : (TRACKED_GITHUB_ACCOUNTS.find(
        (account) => TRACKED_GITHUB_USER_IDS[account] === userId
      ) ?? null);
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
  if (value === undefined) {
    return { valid: true, value: undefined } as const;
  }
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

export const repositoryFullNameFrom = (value: unknown) => {
  const fullName = normalizedText(value, 200);
  return fullName !== null && REPOSITORY_FULL_NAME.test(fullName)
    ? fullName
    : null;
};

export const repositoryFrom = (value: unknown): GitHubRepository | null => {
  if (!isObject(value)) {
    return null;
  }

  const id = repositoryIdFrom(value.id);
  const fullName = repositoryFullNameFrom(value.full_name ?? value.name);
  if (id === null || fullName === null) {
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

const gitRefPathFrom = (value: unknown, maximumLength = 1000) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    return null;
  }
  if (
    value === "@" ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("@{")
  ) {
    return null;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 32 ||
      codePoint === 127 ||
      "~^:?*[\\".includes(character)
    ) {
      return null;
    }
  }
  const components = value.split("/");
  return components.some(
    (component) =>
      component.length === 0 ||
      component.startsWith(".") ||
      component.endsWith(".lock")
  )
    ? null
    : value;
};

const optionalDefaultBranchFrom = (value: unknown) => {
  if (value === null || value === undefined) {
    return { valid: true, value: null } as const;
  }
  const branch = gitRefPathFrom(value, 255);
  return { valid: branch !== null, value: branch } as const;
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
  const defaultBranch = optionalDefaultBranchFrom(value.default_branch);
  const pushedAt = optionalRepositoryDate(value.pushed_at);
  if (
    owner === null ||
    !defaultBranch.valid ||
    !pushedAt.valid ||
    !visibility.valid
  ) {
    return null;
  }
  const expectedHtmlUrl = `https://github.com/${repository.fullName}`;
  const htmlUrl = value.html_url === expectedHtmlUrl ? expectedHtmlUrl : null;

  return {
    ...repository,
    defaultBranch: defaultBranch.value,
    htmlUrl,
    ...owner,
    pushedAt: pushedAt.value,
    visibility: visibility.visibility,
  };
};

const inventoryTextFrom = (value: unknown, maximumLength: number) => {
  if (value === null) {
    return { valid: true, value: null } as const;
  }
  if (typeof value !== "string" || value.length > maximumLength) {
    return { valid: false, value: null } as const;
  }
  return { valid: true, value: normalizedText(value, maximumLength) } as const;
};

const inventoryTopicsFrom = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 20) {
    return null;
  }
  const topics = new Set<string>();
  for (const topic of value) {
    if (typeof topic !== "string" || topic.length > 50) {
      return null;
    }
    const normalized = normalizedText(topic, 50);
    if (normalized === null || normalized !== topic) {
      return null;
    }
    topics.add(normalized);
  }
  return [...topics].toSorted();
};

/** Parses the complete repository shape returned by GitHub inventory APIs. */
export const repositoryInventoryFactsFrom = (
  value: unknown
): GitHubRepositoryInventoryFacts | null => {
  if (!isObject(value)) {
    return null;
  }
  const repository = repositoryFactsFrom(value);
  const description = inventoryTextFrom(value.description, 1000);
  const homepageUrl = inventoryTextFrom(value.homepage, 2000);
  const topics = inventoryTopicsFrom(value.topics);
  if (
    repository === null ||
    !description.valid ||
    !homepageUrl.valid ||
    topics === null
  ) {
    return null;
  }
  return {
    ...repository,
    description: description.value,
    homepageUrl: homepageUrl.value,
    topics,
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
  const authorLogin = githubLoginFrom(value.user.login);
  const authorUserId = repositoryIdFrom(value.user.id);
  const account = trackedGitHubAccountFromUserId(authorUserId);
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
  const authorUserId = repositoryIdFrom(value.user.id);
  const authorAccount = trackedGitHubAccountFromUserId(authorUserId);
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
  // Before a pull request is merged, GitHub's legacy REST field identifies a
  // synthetic test merge commit. It is not stable integration evidence and
  // must never enter durable merge identity state.
  const mergeCommitSha = stateFacts.merged
    ? optionalCommitSha(value.merge_commit_sha)
    : ({ valid: true, value: null } as const);
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
  if (trackedGitHubAccountFromUserId(rawIssue.user.id) !== account) {
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
  return { action, number, repository };
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

const webhookRefFrom = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const headPrefix = "refs/heads/";
  const tagPrefix = "refs/tags/";
  const kind = value.startsWith(headPrefix)
    ? ("head" as const)
    : value.startsWith(tagPrefix)
      ? ("tag" as const)
      : null;
  if (kind === null) {
    return null;
  }
  const prefix = kind === "head" ? headPrefix : tagPrefix;
  return gitRefPathFrom(value.slice(prefix.length)) === null
    ? null
    : { kind, refName: value };
};

const refOperationFrom = (
  beforeSha: string | null,
  afterSha: string | null
) => {
  if (beforeSha === null) {
    return afterSha === null ? null : ("create" as const);
  }
  return afterSha === null ? ("delete" as const) : ("update" as const);
};

const webhookRefTransitionFrom = (value: JsonObject) => {
  const rawBeforeSha = commitShaFrom(value.before);
  const rawAfterSha = commitShaFrom(value.after);
  if (
    rawBeforeSha === null ||
    rawAfterSha === null ||
    typeof value.created !== "boolean" ||
    typeof value.deleted !== "boolean" ||
    typeof value.forced !== "boolean"
  ) {
    return null;
  }
  const beforeSha = rawBeforeSha === ZERO_SHA ? null : rawBeforeSha;
  const afterSha = rawAfterSha === ZERO_SHA ? null : rawAfterSha;
  const operation = refOperationFrom(beforeSha, afterSha);
  if (
    operation === null ||
    value.created !== (operation === "create") ||
    value.deleted !== (operation === "delete") ||
    (value.forced && operation !== "update")
  ) {
    return null;
  }
  return { afterSha, beforeSha, forced: value.forced, operation };
};

export const githubWebhookRefSignalFrom = (
  value: unknown
): GitHubWebhookRefSignal | null => {
  if (!isObject(value)) {
    return null;
  }
  const repository = repositoryFactsFrom(value.repository);
  const ref = webhookRefFrom(value.ref);
  const transition = webhookRefTransitionFrom(value);
  if (repository === null || ref === null || transition === null) {
    return null;
  }
  return {
    kind: ref.kind,
    refName: ref.refName,
    repository,
    ...transition,
  };
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
  isObject(value) ? trackedGitHubAccountFromUserId(value.id) : null;
