import { setTimeout as delay } from "node:timers/promises";

import {
  ActivityProcessingError,
  fetchGitHubPullRequestMembershipWithToken,
  fetchGitHubPullRequestRestSnapshotWithToken,
  GitHubGraphQlResponseError,
  githubGraphQlPayloadFrom,
  resolveGitHubPullRequestMergeCommits,
} from "@/lib/github-activity-processor";
import type {
  GitHubActivityPullRequestMembershipSource,
  GitHubActivityPullRequestReference,
  GitHubActivityPullRequestSnapshot,
} from "@/lib/github-activity-processor";
import {
  persistGitHubPullRequestMembership,
  persistGitHubPullRequestSnapshot,
} from "@/lib/github-activity-worker-store";
import type { StoredPullRequestSnapshot } from "@/lib/github-activity-worker-store";
import {
  fetchGitHub,
  GitHubRequestDeadlineError,
  GitHubResponseError,
  githubApiUrl,
  nextGitHubPage,
} from "@/lib/github-api";
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  repositoryFullNameFrom,
  repositoryIdFrom,
} from "@/lib/github-commits-core";
import { persistGitHubCommitReferences } from "@/lib/github-commits-store";
import { collectAccessibleGitHubRepositories } from "@/lib/github-reconciliation";

const GITHUB_PAGE_SIZE = 100;
const PULL_REQUEST_PROCESSING_BATCH_SIZE = 10;
const DEADLINE_MARGIN_MS = 30_000;
const RATE_LIMIT_RESET_PADDING_MS = 1000;
const AUTHORED_PULL_REQUEST_PAGE_SIZE = 100;

const AUTHORED_PULL_REQUESTS_QUERY = `query AuthoredPullRequests($login: String!, $cursor: String, $pageSize: Int!) {
  user(login: $login) {
    login
    pullRequests(
      first: $pageSize
      after: $cursor
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        id
        number
        updatedAt
        url
        author { login }
        repository { databaseId nameWithOwner }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const repositoryApiPath = (repository: string, suffix: string) => {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || name === undefined || rest.length > 0) {
    throw new TypeError("GitHub returned an invalid repository name.");
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonNegativeIntegerFrom = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const positiveIntegerFrom = (value: unknown) => {
  const integer = nonNegativeIntegerFrom(value);
  return integer !== null && integer > 0 ? integer : null;
};

const deadlineReached = (deadlineAt: number) =>
  Date.now() + DEADLINE_MARGIN_MS >= deadlineAt;

const providerRetryFrom = (error: unknown) => {
  if (
    error instanceof GitHubResponseError &&
    (error.retryable || error.status === 404)
  ) {
    return { retryAt: error.retryAt };
  }
  if (error instanceof GitHubGraphQlResponseError && error.retryable) {
    return { retryAt: error.retryAt };
  }
  return null;
};

const withProviderRetryWait = async <Value>(
  operation: () => Promise<Value>,
  input: {
    deadlineAt: number;
    onRateLimitWait?: (retryAt: Date) => void;
  }
) => {
  while (true) {
    try {
      return await operation();
    } catch (error) {
      const retry = providerRetryFrom(error);
      if (retry?.retryAt === null || retry === null) {
        throw error;
      }
      const waitMilliseconds = Math.max(
        0,
        retry.retryAt.getTime() - Date.now() + RATE_LIMIT_RESET_PADDING_MS
      );
      if (
        Date.now() + waitMilliseconds + DEADLINE_MARGIN_MS >=
        input.deadlineAt
      ) {
        throw error;
      }
      input.onRateLimitWait?.(retry.retryAt);
      await delay(waitMilliseconds);
    }
  }
};

export interface GitHubPullRequestBackfillCandidate extends GitHubActivityPullRequestReference {
  nodeId: string;
  providerUpdatedAt: string;
}

export interface GitHubPullRequestBackfillCandidateCollection {
  complete: boolean;
  pullRequests: readonly GitHubPullRequestBackfillCandidate[];
}

export interface GitHubAuthoredPullRequestBackfillCandidateCollection {
  pages: number;
  pullRequests: readonly GitHubPullRequestBackfillCandidate[];
  totalCount: number;
}

const authoredPullRequestCandidateFrom = (
  value: unknown,
  account: TrackedGitHubAccount
) => {
  if (
    !isObject(value) ||
    !isObject(value.author) ||
    !isObject(value.repository)
  ) {
    throw new TypeError("GitHub returned an invalid authored pull request.");
  }
  const repositoryId = repositoryIdFrom(value.repository.databaseId);
  const repository = repositoryFullNameFrom(value.repository.nameWithOwner);
  const number = positiveIntegerFrom(value.number);
  const nodeId =
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    !/\s/u.test(value.id)
      ? value.id
      : null;
  const providerUpdatedAt =
    typeof value.updatedAt === "string"
      ? new Date(value.updatedAt)
      : new Date(Number.NaN);
  if (
    typeof value.author.login !== "string" ||
    value.author.login.toLowerCase() !== account ||
    repositoryId === null ||
    repository === null ||
    number === null ||
    nodeId === null ||
    Number.isNaN(providerUpdatedAt.getTime()) ||
    value.url !== `https://github.com/${repository}/pull/${String(number)}`
  ) {
    throw new TypeError("GitHub returned an invalid authored pull request.");
  }
  return {
    account,
    nodeId,
    number,
    providerUpdatedAt: providerUpdatedAt.toISOString(),
    repository,
    repositoryId,
  } satisfies GitHubPullRequestBackfillCandidate;
};

const samePullRequestIdentity = (
  left: GitHubPullRequestBackfillCandidate,
  right: GitHubPullRequestBackfillCandidate
) =>
  left.account === right.account &&
  left.nodeId === right.nodeId &&
  left.number === right.number &&
  left.repository === right.repository &&
  left.repositoryId === right.repositoryId;

export const mergeGitHubPullRequestBackfillCandidates = (
  candidates: Map<string, GitHubPullRequestBackfillCandidate>,
  incoming: readonly GitHubPullRequestBackfillCandidate[]
) => {
  for (const candidate of incoming) {
    const existing = candidates.get(candidate.nodeId);
    if (
      existing !== undefined &&
      !samePullRequestIdentity(existing, candidate)
    ) {
      throw new TypeError("GitHub returned conflicting pull requests.");
    }
    if (
      existing === undefined ||
      candidate.providerUpdatedAt > existing.providerUpdatedAt
    ) {
      candidates.set(candidate.nodeId, candidate);
    }
  }
  return candidates;
};

/**
 * Independently enumerates PRs authored by the tracked account. Unlike
 * `/user/repos`, this connection includes PRs whose base is an unrelated
 * public repository. The cursor is intentionally unbounded; total and unique
 * progress checks make a mutable or incomplete connection fail closed.
 */
// oxlint-disable eslint/complexity -- Every page, identity, count, progress, and cursor invariant fails closed independently.
export const collectGitHubAuthoredPullRequestBackfillCandidates =
  async (input: {
    account: TrackedGitHubAccount;
    deadlineAt: number;
    token: string;
  }): Promise<GitHubAuthoredPullRequestBackfillCandidateCollection> => {
    const candidates = new Map<string, GitHubPullRequestBackfillCandidate>();
    const visitedCursors = new Set<string>();
    let cursor: string | null = null;
    let expectedTotal: number | null = null;
    let pages = 0;
    let observedNodes = 0;

    while (true) {
      if (deadlineReached(input.deadlineAt)) {
        throw new GitHubRequestDeadlineError();
      }
      const response = await fetchGitHub(githubApiUrl("/graphql"), {
        body: JSON.stringify({
          query: AUTHORED_PULL_REQUESTS_QUERY,
          variables: {
            cursor,
            login: input.account,
            pageSize: AUTHORED_PULL_REQUEST_PAGE_SIZE,
          },
        }),
        deadlineAt: input.deadlineAt,
        method: "POST",
        token: input.token,
      });
      const payload = await githubGraphQlPayloadFrom(response);
      const user = isObject(payload.data) ? payload.data.user : null;
      const connection = isObject(user) ? user.pullRequests : null;
      const totalCount = isObject(connection)
        ? nonNegativeIntegerFrom(connection.totalCount)
        : null;
      const nodes = isObject(connection) ? connection.nodes : null;
      const pageInfo = isObject(connection) ? connection.pageInfo : null;
      if (
        !isObject(user) ||
        typeof user.login !== "string" ||
        user.login.toLowerCase() !== input.account ||
        !Array.isArray(nodes) ||
        nodes.length > AUTHORED_PULL_REQUEST_PAGE_SIZE ||
        !isObject(pageInfo) ||
        typeof pageInfo.hasNextPage !== "boolean" ||
        totalCount === null ||
        (expectedTotal !== null && totalCount !== expectedTotal) ||
        observedNodes + nodes.length > totalCount
      ) {
        throw new TypeError(
          "GitHub returned an invalid authored pull request connection."
        );
      }
      expectedTotal ??= totalCount;
      const previousSize = candidates.size;
      const pageCandidates = nodes.map((node) =>
        authoredPullRequestCandidateFrom(node, input.account)
      );
      mergeGitHubPullRequestBackfillCandidates(candidates, pageCandidates);
      observedNodes += nodes.length;
      pages += 1;

      if (!pageInfo.hasNextPage) {
        if (
          observedNodes !== expectedTotal ||
          candidates.size !== expectedTotal
        ) {
          throw new TypeError(
            "GitHub returned incomplete authored pull request pagination."
          );
        }
        return {
          pages,
          pullRequests: [...candidates.values()],
          totalCount: expectedTotal,
        };
      }

      const nextCursor = pageInfo.endCursor;
      if (
        nodes.length === 0 ||
        candidates.size === previousSize ||
        typeof nextCursor !== "string" ||
        nextCursor.length === 0 ||
        nextCursor.length > 2048 ||
        visitedCursors.has(nextCursor)
      ) {
        throw new TypeError(
          "GitHub returned invalid authored pull request pagination."
        );
      }
      visitedCursors.add(nextCursor);
      cursor = nextCursor;
    }
  };
// oxlint-enable eslint/complexity

const pullRequestCandidateFromListValue = (
  value: unknown,
  input: {
    account: TrackedGitHubAccount;
    repository: GitHubRepositoryFacts;
  }
) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const root = value as Record<string, unknown>;
  const {
    html_url: htmlUrl,
    node_id: nodeId,
    number,
    updated_at: providerUpdatedAt,
  } = root;
  const updatedAt =
    typeof providerUpdatedAt === "string"
      ? new Date(providerUpdatedAt)
      : new Date(Number.NaN);
  if (
    !Number.isSafeInteger(number) ||
    Number(number) < 1 ||
    typeof nodeId !== "string" ||
    nodeId.length === 0 ||
    nodeId.length > 100 ||
    Number.isNaN(updatedAt.getTime()) ||
    htmlUrl !==
      `https://github.com/${input.repository.fullName}/pull/${String(number)}`
  ) {
    return null;
  }
  return {
    account: input.account,
    nodeId,
    number: Number(number),
    providerUpdatedAt: updatedAt.toISOString(),
    repository: input.repository.fullName,
    repositoryId: input.repository.id,
  } satisfies GitHubPullRequestBackfillCandidate;
};

const validateNextPullRequestPage = (
  next: URL,
  currentPage: number,
  repository: GitHubRepositoryFacts
) => {
  if (
    next.pathname !== repositoryApiPath(repository.fullName, "/pulls") ||
    next.searchParams.get("direction") !== "desc" ||
    next.searchParams.get("page") !== String(currentPage + 1) ||
    next.searchParams.get("per_page") !== String(GITHUB_PAGE_SIZE) ||
    next.searchParams.get("sort") !== "updated" ||
    next.searchParams.get("state") !== "all"
  ) {
    throw new TypeError("GitHub returned invalid pull request pagination.");
  }
};

/** Enumerates every PR because Git commit timestamps can be arbitrary. */
export const collectGitHubPullRequestBackfillCandidates = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  onRateLimitWait?: (retryAt: Date) => void;
  repository: GitHubRepositoryFacts;
  token: string;
}): Promise<GitHubPullRequestBackfillCandidateCollection> => {
  let url: URL | null = githubApiUrl(
    repositoryApiPath(input.repository.fullName, "/pulls")
  );
  url.searchParams.set("direction", "desc");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(GITHUB_PAGE_SIZE));
  url.searchParams.set("sort", "updated");
  url.searchParams.set("state", "all");
  const pullRequests = new Map<string, GitHubPullRequestBackfillCandidate>();
  const visited = new Set<string>();
  let previousUpdatedAt = Number.POSITIVE_INFINITY;
  let page = 1;

  while (url !== null) {
    if (deadlineReached(input.deadlineAt)) {
      return { complete: false, pullRequests: [...pullRequests.values()] };
    }
    if (visited.has(url.href)) {
      throw new TypeError("GitHub returned cyclic pull request pagination.");
    }
    visited.add(url.href);
    const requestUrl = url;
    const response = await withProviderRetryWait(
      async () =>
        await fetchGitHub(requestUrl, {
          deadlineAt: input.deadlineAt,
          token: input.token,
        }),
      input
    );
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new TypeError("GitHub returned an invalid pull request page.");
    }

    for (const value of payload) {
      const candidate = pullRequestCandidateFromListValue(value, input);
      if (candidate === null) {
        throw new TypeError("GitHub returned an invalid pull request page.");
      }
      const updatedAt = new Date(candidate.providerUpdatedAt).getTime();
      if (updatedAt > previousUpdatedAt) {
        throw new TypeError(
          "GitHub returned pull requests outside descending updated order."
        );
      }
      previousUpdatedAt = updatedAt;
      const existing = pullRequests.get(candidate.nodeId);
      if (
        existing !== undefined &&
        (existing.number !== candidate.number ||
          existing.repositoryId !== candidate.repositoryId)
      ) {
        throw new TypeError("GitHub returned conflicting pull requests.");
      }
      pullRequests.set(candidate.nodeId, candidate);
    }
    const next = nextGitHubPage(response);
    if (next !== null) {
      validateNextPullRequestPage(next, page, input.repository);
      page += 1;
    }
    url = next;
  }
  return { complete: true, pullRequests: [...pullRequests.values()] };
};

export type GitHubPullRequestBackfillStopReason =
  | "complete"
  | "deadline"
  | "provider_retry";

export interface GitHubPullRequestBackfillResult {
  authoredPullRequestPages: number;
  authoredPullRequests: number;
  commits: number;
  complete: boolean;
  duplicateCommits: number;
  memberships: number;
  pullRequests: number;
  repositories: number;
  retryAt: Date | null;
  scannedPullRequests: number;
  skippedPullRequests: number;
  stopReason: GitHubPullRequestBackfillStopReason;
}

interface PreparedPullRequest {
  commits: readonly GitHubCommit[];
  membership: GitHubActivityPullRequestMembershipSource;
  snapshot: GitHubActivityPullRequestSnapshot;
}

const emptyResult = (): GitHubPullRequestBackfillResult => ({
  authoredPullRequestPages: 0,
  authoredPullRequests: 0,
  commits: 0,
  complete: true,
  duplicateCommits: 0,
  memberships: 0,
  pullRequests: 0,
  repositories: 0,
  retryAt: null,
  scannedPullRequests: 0,
  skippedPullRequests: 0,
  stopReason: "complete",
});

const isDeadlineError = (error: unknown) =>
  error instanceof GitHubRequestDeadlineError;

const withinInclusiveWindow = (
  commit: GitHubCommit,
  sinceAt: Date,
  untilAt: Date
) => {
  const committedAt = new Date(commit.committedAt).getTime();
  return committedAt >= sinceAt.getTime() && committedAt <= untilAt.getTime();
};

export const githubPullRequestBelongsInBackfillWindow = (input: {
  account: TrackedGitHubAccount;
  commits: readonly GitHubCommit[];
  pullRequest: Pick<GitHubPullRequest, "authorAccount" | "mergedAt">;
  sinceAt: Date;
  untilAt: Date;
}) => {
  const mergedAt =
    input.pullRequest.mergedAt === null
      ? null
      : new Date(input.pullRequest.mergedAt);
  return (
    input.commits.some(
      (commit) =>
        commit.author === input.account &&
        withinInclusiveWindow(commit, input.sinceAt, input.untilAt)
    ) ||
    (input.pullRequest.authorAccount === input.account &&
      mergedAt !== null &&
      mergedAt >= input.sinceAt &&
      mergedAt <= input.untilAt)
  );
};

const withResolvedMergeCommits = async (
  prepared: readonly PreparedPullRequest[],
  token: string,
  deadlineAt: number
) => {
  const merged = prepared.filter(({ snapshot }) => snapshot.pullRequest.merged);
  const resolutions = await resolveGitHubPullRequestMergeCommits(
    merged.map(({ snapshot }) => snapshot.pullRequest.nodeId),
    token,
    { deadlineAt }
  );
  const mergeCommitShas = new Map(
    resolutions.map(({ mergeCommitSha, nodeId }) => [nodeId, mergeCommitSha])
  );
  return prepared.map((item) => {
    if (!item.snapshot.pullRequest.merged) {
      return item;
    }
    const mergeCommitSha = mergeCommitShas.get(
      item.snapshot.pullRequest.nodeId
    );
    if (!mergeCommitShas.has(item.snapshot.pullRequest.nodeId)) {
      throw new GitHubGraphQlResponseError("unresolved_merge_commit", {
        retryable: true,
      });
    }
    return {
      ...item,
      snapshot: {
        ...item.snapshot,
        pullRequest: { ...item.snapshot.pullRequest, mergeCommitSha },
      },
    };
  });
};

export const persistGitHubPullRequestBackfillMembership = async (input: {
  commitShas: readonly string[];
  headSha: string;
  membershipComplete: boolean;
  persist?: typeof persistGitHubPullRequestMembership;
  stored: StoredPullRequestSnapshot;
}) => {
  if (!input.stored.membershipRefreshRequired) {
    return { complete: true, refreshed: false } as const;
  }
  const persist = input.persist ?? persistGitHubPullRequestMembership;
  return {
    complete: await persist(
      input.stored,
      input.headSha,
      input.commitShas,
      input.membershipComplete
    ),
    refreshed: true,
  } as const;
};

const persistPreparedPullRequests = async (
  prepared: readonly PreparedPullRequest[],
  account: TrackedGitHubAccount,
  result: GitHubPullRequestBackfillResult
) => {
  for (const item of prepared) {
    const stored = await persistGitHubPullRequestSnapshot(
      account,
      item.snapshot.pullRequest,
      { refreshMembership: true }
    );
    if (stored === null) {
      result.skippedPullRequests += 1;
      continue;
    }
    const commits = await persistGitHubCommitReferences({
      commits: item.commits,
    });
    const membership = await persistGitHubPullRequestBackfillMembership({
      commitShas: item.membership.commitShas,
      headSha: item.snapshot.pullRequest.headSha,
      membershipComplete: item.membership.membershipComplete,
      stored,
    });
    if (!membership.complete) {
      throw new ActivityProcessingError(
        "source_incomplete",
        "GitHub pull request membership was not persisted completely."
      );
    }
    result.commits += commits.inserted;
    result.duplicateCommits += commits.duplicates;
    if (membership.refreshed) {
      result.memberships += 1;
    }
    result.pullRequests += 1;
  }
};

const preparePullRequest = async (input: {
  account: TrackedGitHubAccount;
  candidate: GitHubPullRequestBackfillCandidate;
  deadlineAt: number;
  sinceAt: Date;
  token: string;
  untilAt: Date;
}): Promise<PreparedPullRequest | null> => {
  const snapshot = await fetchGitHubPullRequestRestSnapshotWithToken(
    input.candidate,
    input.token,
    { deadlineAt: input.deadlineAt }
  );
  const commitRepository =
    snapshot.pullRequest.headRepository ?? snapshot.pullRequest.baseRepository;
  const membership = await fetchGitHubPullRequestMembershipWithToken(
    input.candidate,
    snapshot.expectedCommitCount,
    input.token,
    {
      commitRepository,
      deadlineAt: input.deadlineAt,
      expectedHeadSha: snapshot.pullRequest.headSha,
    }
  );
  if (!membership.membershipComplete) {
    throw new ActivityProcessingError(
      "source_incomplete",
      "GitHub returned incomplete pull request membership."
    );
  }
  const commits = membership.commits.filter(
    (commit) =>
      commit.author === input.account &&
      withinInclusiveWindow(commit, input.sinceAt, input.untilAt)
  );
  return githubPullRequestBelongsInBackfillWindow({
    account: input.account,
    commits,
    pullRequest: snapshot.pullRequest,
    sinceAt: input.sinceAt,
    untilAt: input.untilAt,
  })
    ? { commits, membership, snapshot }
    : null;
};

const stop = (
  result: GitHubPullRequestBackfillResult,
  reason: Exclude<GitHubPullRequestBackfillStopReason, "complete">,
  retryAt: Date | null = null
) => ({
  ...result,
  complete: false,
  retryAt,
  stopReason: reason,
});

interface PullRequestProcessingInterruption {
  reason: "deadline" | "provider_retry";
  retryAt: Date | null;
}

const comparePullRequestCandidates = (
  left: GitHubPullRequestBackfillCandidate,
  right: GitHubPullRequestBackfillCandidate
) => {
  const leftRepositoryId = BigInt(left.repositoryId);
  const rightRepositoryId = BigInt(right.repositoryId);
  if (leftRepositoryId !== rightRepositoryId) {
    return leftRepositoryId < rightRepositoryId ? -1 : 1;
  }
  if (left.number !== right.number) {
    return left.number - right.number;
  }
  return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0;
};

const processPullRequestCandidates = async (
  candidates: readonly GitHubPullRequestBackfillCandidate[],
  input: {
    account: TrackedGitHubAccount;
    deadlineAt: number;
    onRateLimitWait?: (retryAt: Date) => void;
    sinceAt: Date;
    token: string;
    untilAt: Date;
  },
  result: GitHubPullRequestBackfillResult
): Promise<PullRequestProcessingInterruption | null> => {
  for (
    let offset = 0;
    offset < candidates.length;
    offset += PULL_REQUEST_PROCESSING_BATCH_SIZE
  ) {
    const prepared: PreparedPullRequest[] = [];
    let interrupted: PullRequestProcessingInterruption | null = null;
    for (const candidate of candidates.slice(
      offset,
      offset + PULL_REQUEST_PROCESSING_BATCH_SIZE
    )) {
      if (deadlineReached(input.deadlineAt)) {
        interrupted = { reason: "deadline", retryAt: null };
        break;
      }
      result.scannedPullRequests += 1;
      try {
        const value = await withProviderRetryWait(
          async () =>
            await preparePullRequest({
              account: input.account,
              candidate,
              deadlineAt: input.deadlineAt,
              sinceAt: input.sinceAt,
              token: input.token,
              untilAt: input.untilAt,
            }),
          input
        );
        if (value === null) {
          result.skippedPullRequests += 1;
        } else {
          prepared.push(value);
        }
      } catch (error) {
        if (isDeadlineError(error)) {
          interrupted = { reason: "deadline", retryAt: null };
          break;
        }
        const retry = providerRetryFrom(error);
        if (retry !== null) {
          interrupted = {
            reason: "provider_retry",
            retryAt: retry.retryAt,
          };
          break;
        }
        throw error;
      }
    }

    const unmerged = prepared.filter(
      ({ snapshot }) => !snapshot.pullRequest.merged
    );
    await persistPreparedPullRequests(unmerged, input.account, result);
    const merged = prepared.filter(
      ({ snapshot }) => snapshot.pullRequest.merged
    );
    if (merged.length > 0) {
      try {
        await persistPreparedPullRequests(
          await withProviderRetryWait(
            async () =>
              await withResolvedMergeCommits(
                merged,
                input.token,
                input.deadlineAt
              ),
            input
          ),
          input.account,
          result
        );
      } catch (error) {
        if (isDeadlineError(error)) {
          return { reason: "deadline", retryAt: null };
        }
        const retry = providerRetryFrom(error);
        if (retry !== null) {
          return { reason: "provider_retry", retryAt: retry.retryAt };
        }
        throw error;
      }
    }
    if (interrupted !== null) {
      return interrupted;
    }
  }
  return null;
};

// oxlint-disable-next-line complexity -- Provider retries, deadlines, stale snapshots, and partial batches fail closed distinctly.
export const backfillGitHubPullRequests = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  onRateLimitWait?: (retryAt: Date) => void;
  repositoryId: string | null;
  sinceAt: Date;
  token: string;
  untilAt: Date;
}): Promise<GitHubPullRequestBackfillResult> => {
  if (
    Number.isNaN(input.sinceAt.getTime()) ||
    Number.isNaN(input.untilAt.getTime()) ||
    input.sinceAt > input.untilAt
  ) {
    throw new RangeError("The GitHub pull request backfill window is invalid.");
  }
  const result = emptyResult();
  let repositories: readonly GitHubRepositoryFacts[];
  try {
    repositories = await withProviderRetryWait(
      async () =>
        await collectAccessibleGitHubRepositories(
          input.token,
          input.repositoryId,
          { deadlineAt: input.deadlineAt }
        ),
      input
    );
  } catch (error) {
    if (isDeadlineError(error)) {
      return stop(result, "deadline");
    }
    const retry = providerRetryFrom(error);
    if (retry !== null) {
      return stop(result, "provider_retry", retry.retryAt);
    }
    throw error;
  }

  const authoredCandidates = new Map<
    string,
    GitHubPullRequestBackfillCandidate
  >();
  if (input.repositoryId === null) {
    try {
      const authored = await withProviderRetryWait(
        async () =>
          await collectGitHubAuthoredPullRequestBackfillCandidates({
            account: input.account,
            deadlineAt: input.deadlineAt,
            token: input.token,
          }),
        input
      );
      result.authoredPullRequestPages = authored.pages;
      result.authoredPullRequests = authored.totalCount;
      mergeGitHubPullRequestBackfillCandidates(
        authoredCandidates,
        authored.pullRequests
      );
    } catch (error) {
      if (isDeadlineError(error)) {
        return stop(result, "deadline");
      }
      const retry = providerRetryFrom(error);
      if (retry !== null) {
        return stop(result, "provider_retry", retry.retryAt);
      }
      throw error;
    }

    // Repository-scoped Action runs can shard the affiliated inventory when it
    // is large. Authored PRs in unaffiliated repositories have no equivalent
    // shard, so persist them before the potentially long per-repository scan.
    const accessibleRepositoryIds = new Set(
      repositories.map((repository) => repository.id)
    );
    const externalCandidates = [...authoredCandidates.values()]
      .filter(
        (candidate) => !accessibleRepositoryIds.has(candidate.repositoryId)
      )
      .toSorted(comparePullRequestCandidates);
    for (const candidate of externalCandidates) {
      authoredCandidates.delete(candidate.nodeId);
    }
    result.repositories += new Set(
      externalCandidates.map((candidate) => candidate.repositoryId)
    ).size;
    const interrupted = await processPullRequestCandidates(
      externalCandidates,
      input,
      result
    );
    if (interrupted !== null) {
      return stop(result, interrupted.reason, interrupted.retryAt);
    }
  }

  for (const repository of repositories) {
    if (deadlineReached(input.deadlineAt)) {
      return stop(result, "deadline");
    }
    let candidates: GitHubPullRequestBackfillCandidateCollection;
    try {
      candidates = await withProviderRetryWait(
        async () =>
          await collectGitHubPullRequestBackfillCandidates({
            account: input.account,
            deadlineAt: input.deadlineAt,
            onRateLimitWait: input.onRateLimitWait,
            repository,
            token: input.token,
          }),
        input
      );
    } catch (error) {
      if (isDeadlineError(error)) {
        return stop(result, "deadline");
      }
      const retry = providerRetryFrom(error);
      if (retry !== null) {
        return stop(result, "provider_retry", retry.retryAt);
      }
      throw error;
    }
    result.repositories += 1;
    const repositoryCandidates = new Map<
      string,
      GitHubPullRequestBackfillCandidate
    >();
    mergeGitHubPullRequestBackfillCandidates(
      repositoryCandidates,
      candidates.pullRequests
    );
    for (const candidate of authoredCandidates.values()) {
      if (candidate.repositoryId === repository.id) {
        mergeGitHubPullRequestBackfillCandidates(repositoryCandidates, [
          candidate,
        ]);
        authoredCandidates.delete(candidate.nodeId);
      }
    }
    const interrupted = await processPullRequestCandidates(
      [...repositoryCandidates.values()].toSorted(comparePullRequestCandidates),
      input,
      result
    );
    if (interrupted !== null) {
      return stop(result, interrupted.reason, interrupted.retryAt);
    }
    if (!candidates.complete) {
      return stop(result, "deadline");
    }
  }

  if (authoredCandidates.size > 0) {
    throw new TypeError(
      "GitHub returned an authored pull request outside the reconciled repository inventory."
    );
  }
  return result;
};
