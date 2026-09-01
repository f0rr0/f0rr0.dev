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
import {
  fetchGitHub,
  GitHubRequestDeadlineError,
  GitHubResponseError,
  githubApiUrl,
} from "@/lib/github-api";
import type {
  GitHubCommit,
  GitHubPullRequest,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  repositoryFullNameFrom,
  repositoryIdFrom,
} from "@/lib/github-commits-core";
import { persistGitHubCommitReferences } from "@/lib/github-commits-store";
import type { StoredPullRequestSnapshot } from "@/lib/github-pull-request-store";

const PULL_REQUEST_PROCESSING_BATCH_SIZE = 10;
const DEADLINE_MARGIN_MS = 30_000;
const AUTHORED_PULL_REQUEST_PAGE_SIZE = 100;
const PERMANENT_RESOURCE_STATUSES = new Set([403, 404, 410, 422]);

const AUTHORED_PULL_REQUESTS_QUERY = `query AuthoredPullRequests($login: String!, $cursor: String, $pageSize: Int!) {
  user(login: $login) {
    login
    pullRequests(
      first: $pageSize
      after: $cursor
      orderBy: { field: UPDATED_AT, direction: DESC }
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

export interface GitHubPullRequestBackfillCandidate extends GitHubActivityPullRequestReference {
  nodeId: string;
  providerUpdatedAt: string;
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

const mergeGitHubPullRequestBackfillCandidates = (
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
 * progress checks make a mutable or incomplete connection fail closed. The
 * updated-time ordering lets a bounded history run stop at its lower bound.
 */
// oxlint-disable eslint/complexity -- Every page, identity, count, progress, and cursor invariant fails closed independently.
export const collectGitHubAuthoredPullRequestBackfillCandidates =
  async (input: {
    account: TrackedGitHubAccount;
    deadlineAt: number;
    token: string;
    updatedSinceAt: Date;
  }): Promise<GitHubAuthoredPullRequestBackfillCandidateCollection> => {
    if (Number.isNaN(input.updatedSinceAt.getTime())) {
      throw new RangeError(
        "The GitHub authored pull request activity cutoff is invalid."
      );
    }
    const candidates = new Map<string, GitHubPullRequestBackfillCandidate>();
    const visitedCursors = new Set<string>();
    let cursor: string | null = null;
    let expectedTotal: number | null = null;
    let pages = 0;
    let observedNodes = 0;
    let previousUpdatedAt = Number.POSITIVE_INFINITY;

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
      let reachedCutoff = false;
      for (const candidate of pageCandidates) {
        const updatedAt = new Date(candidate.providerUpdatedAt).getTime();
        if (updatedAt > previousUpdatedAt) {
          throw new TypeError(
            "GitHub returned authored pull requests outside descending updated order."
          );
        }
        previousUpdatedAt = updatedAt;
        if (updatedAt < input.updatedSinceAt.getTime()) {
          reachedCutoff = true;
          continue;
        }
        mergeGitHubPullRequestBackfillCandidates(candidates, [candidate]);
      }
      observedNodes += nodes.length;
      pages += 1;

      if (reachedCutoff) {
        return {
          pages,
          pullRequests: [...candidates.values()],
          totalCount: expectedTotal,
        };
      }

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

export type GitHubPullRequestBackfillStopReason =
  | "complete"
  | "deadline"
  | "provider_retry";

export interface GitHubPullRequestBackfillResult {
  authoredPullRequestPages: number;
  authoredPullRequestsLifetime: number;
  commits: number;
  complete: boolean;
  duplicateCommits: number;
  memberships: number;
  pullRequests: number;
  repositories: number;
  retryAt: Date | null;
  scannedPullRequests: number;
  selectedAuthoredPullRequests: number;
  skippedPullRequests: number;
  stopReason: GitHubPullRequestBackfillStopReason;
  unavailablePullRequests: number;
}

interface PreparedPullRequest {
  commits: readonly GitHubCommit[];
  membership: GitHubActivityPullRequestMembershipSource;
  snapshot: GitHubActivityPullRequestSnapshot;
}

const emptyResult = (): GitHubPullRequestBackfillResult => ({
  authoredPullRequestPages: 0,
  authoredPullRequestsLifetime: 0,
  commits: 0,
  complete: true,
  duplicateCommits: 0,
  memberships: 0,
  pullRequests: 0,
  repositories: 0,
  retryAt: null,
  scannedPullRequests: 0,
  selectedAuthoredPullRequests: 0,
  skippedPullRequests: 0,
  stopReason: "complete",
  unavailablePullRequests: 0,
});

const isDeadlineError = (error: unknown) =>
  error instanceof GitHubRequestDeadlineError;

const permanentlyUnavailableResource = (error: unknown) =>
  error instanceof GitHubResponseError &&
  !error.retryable &&
  PERMANENT_RESOURCE_STATUSES.has(error.status);

const pullRequestEvidenceIsUnavailable = (error: unknown) => {
  if (permanentlyUnavailableResource(error)) {
    return true;
  }
  if (error instanceof GitHubGraphQlResponseError) {
    return !error.retryable || error.kind === "unresolved_merge_commit";
  }
  return (
    error instanceof ActivityProcessingError &&
    (error.code === "source_incomplete" || error.code === "source_invalid")
  );
};

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
}) =>
  input.commits.some(
    (commit) =>
      commit.author === input.account &&
      withinInclusiveWindow(commit, input.sinceAt, input.untilAt)
  );

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

const persistPreparedPullRequestsWithGaps = async (
  prepared: readonly PreparedPullRequest[],
  account: TrackedGitHubAccount,
  result: GitHubPullRequestBackfillResult
) => {
  for (const item of prepared) {
    try {
      await persistPreparedPullRequests([item], account, result);
    } catch (error) {
      if (pullRequestEvidenceIsUnavailable(error)) {
        result.unavailablePullRequests += 1;
        continue;
      }
      throw error;
    }
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
      expectedBaseSha: snapshot.pullRequest.baseSha,
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

type GitHubPullRequestBackfillProgressReporter = (
  result: Readonly<GitHubPullRequestBackfillResult>
) => void;

const ignorePullRequestBackfillProgress = () => null;

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
    onProgress: GitHubPullRequestBackfillProgressReporter;
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
        const value = await preparePullRequest({
          account: input.account,
          candidate,
          deadlineAt: input.deadlineAt,
          sinceAt: input.sinceAt,
          token: input.token,
          untilAt: input.untilAt,
        });
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
        if (pullRequestEvidenceIsUnavailable(error)) {
          result.unavailablePullRequests += 1;
          continue;
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
    await persistPreparedPullRequestsWithGaps(unmerged, input.account, result);
    const merged = prepared.filter(
      ({ snapshot }) => snapshot.pullRequest.merged
    );
    if (merged.length > 0) {
      try {
        await persistPreparedPullRequestsWithGaps(
          await withResolvedMergeCommits(merged, input.token, input.deadlineAt),
          input.account,
          result
        );
      } catch (error) {
        if (isDeadlineError(error)) {
          return { reason: "deadline", retryAt: null };
        }
        if (pullRequestEvidenceIsUnavailable(error)) {
          for (const item of merged) {
            try {
              await persistPreparedPullRequestsWithGaps(
                await withResolvedMergeCommits(
                  [item],
                  input.token,
                  input.deadlineAt
                ),
                input.account,
                result
              );
            } catch (candidateError) {
              if (isDeadlineError(candidateError)) {
                return { reason: "deadline", retryAt: null };
              }
              if (pullRequestEvidenceIsUnavailable(candidateError)) {
                result.unavailablePullRequests += 1;
                continue;
              }
              const candidateRetry = providerRetryFrom(candidateError);
              if (candidateRetry !== null) {
                return {
                  reason: "provider_retry",
                  retryAt: candidateRetry.retryAt,
                };
              }
              throw candidateError;
            }
          }
        } else {
          const retry = providerRetryFrom(error);
          if (retry !== null) {
            return { reason: "provider_retry", retryAt: retry.retryAt };
          }
          throw error;
        }
      }
    }
    if (interrupted !== null) {
      input.onProgress({ ...result });
      return interrupted;
    }
    input.onProgress({ ...result });
  }
  return null;
};

/** Discovers only authored PRs; current-head commits find associated PRs later. */
export const backfillGitHubPullRequests = async (input: {
  account: TrackedGitHubAccount;
  deadlineAt: number;
  onProgress?: GitHubPullRequestBackfillProgressReporter;
  repositoryId: string | null;
  sinceAt: Date;
  token: string;
  untilAt: Date;
}): Promise<GitHubPullRequestBackfillResult> => {
  if (
    !Number.isFinite(input.deadlineAt) ||
    Number.isNaN(input.sinceAt.getTime()) ||
    Number.isNaN(input.untilAt.getTime()) ||
    input.sinceAt > input.untilAt
  ) {
    throw new RangeError("The GitHub pull request backfill window is invalid.");
  }
  const result = emptyResult();
  const onProgress = input.onProgress ?? ignorePullRequestBackfillProgress;
  let authored: GitHubAuthoredPullRequestBackfillCandidateCollection;
  try {
    authored = await collectGitHubAuthoredPullRequestBackfillCandidates({
      account: input.account,
      deadlineAt: input.deadlineAt,
      token: input.token,
      updatedSinceAt: input.sinceAt,
    });
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
  const candidates = authored.pullRequests
    .filter(
      (candidate) =>
        input.repositoryId === null ||
        candidate.repositoryId === input.repositoryId
    )
    .toSorted(comparePullRequestCandidates);
  result.authoredPullRequestPages = authored.pages;
  result.authoredPullRequestsLifetime = authored.totalCount;
  result.selectedAuthoredPullRequests = candidates.length;
  result.repositories = new Set(
    candidates.map((candidate) => candidate.repositoryId)
  ).size;
  onProgress({ ...result });
  const interrupted = await processPullRequestCandidates(
    candidates,
    { ...input, onProgress },
    result
  );
  if (interrupted !== null) {
    return stop(result, interrupted.reason, interrupted.retryAt);
  }
  return result;
};
