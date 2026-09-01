import { createHash } from "node:crypto";

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
import {
  persistGitHubPullRequestBackfillDigest,
  readGitHubPullRequestBackfillDigest,
} from "@/lib/github-backfill-store";
import type {
  GitHubCommit,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  commitShaFrom,
  repositoryFullNameFrom,
  repositoryIdFrom,
} from "@/lib/github-commits-core";
import { persistGitHubCommitReferences } from "@/lib/github-commits-store";
import type { StoredPullRequestSnapshot } from "@/lib/github-pull-request-store";

const PULL_REQUEST_PROCESSING_BATCH_SIZE = 10;
const DEADLINE_MARGIN_MS = 30_000;
const AUTHORED_PULL_REQUEST_PAGE_SIZE = 100;
const PERMANENT_RESOURCE_STATUSES = new Set([403, 404, 410, 422]);
const PULL_REQUEST_BACKFILL_RECIPE = "authored-pull-requests-v1";

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
        baseRefOid
        commits { totalCount }
        headRefOid
        id
        number
        state
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
  baseSha: string;
  commitCount: number;
  headSha: string;
  nodeId: string;
  providerUpdatedAt: string;
  state: "closed" | "merged" | "open";
}

export interface GitHubAuthoredPullRequestBackfillCandidateCollection {
  pages: number;
  pullRequests: readonly GitHubPullRequestBackfillCandidate[];
  totalCount: number;
}

const pullRequestNodeIdFrom = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 100 &&
  !/\s/u.test(value)
    ? value
    : null;

const pullRequestStateFrom = (
  value: unknown
): GitHubPullRequestBackfillCandidate["state"] | null => {
  switch (value) {
    case "CLOSED": {
      return "closed";
    }
    case "MERGED": {
      return "merged";
    }
    case "OPEN": {
      return "open";
    }
    default: {
      return null;
    }
  }
};

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
  const nodeId = pullRequestNodeIdFrom(value.id);
  const providerUpdatedAt =
    typeof value.updatedAt === "string"
      ? new Date(value.updatedAt)
      : new Date(Number.NaN);
  const baseSha = commitShaFrom(value.baseRefOid);
  const headSha = commitShaFrom(value.headRefOid);
  const commitCount = isObject(value.commits)
    ? nonNegativeIntegerFrom(value.commits.totalCount)
    : null;
  const state = pullRequestStateFrom(value.state);
  if (
    typeof value.author.login !== "string" ||
    value.author.login.toLowerCase() !== account ||
    repositoryId === null ||
    repository === null ||
    number === null ||
    nodeId === null ||
    baseSha === null ||
    headSha === null ||
    commitCount === null ||
    state === null ||
    Number.isNaN(providerUpdatedAt.getTime()) ||
    value.url !== `https://github.com/${repository}/pull/${String(number)}`
  ) {
    throw new TypeError("GitHub returned an invalid authored pull request.");
  }
  return {
    account,
    baseSha,
    commitCount,
    headSha,
    nodeId,
    number,
    providerUpdatedAt: providerUpdatedAt.toISOString(),
    repository,
    repositoryId,
    state,
  } satisfies GitHubPullRequestBackfillCandidate;
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
    const observedNodeIds = new Set<string>();
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
      const pageCandidates = nodes.map((node) =>
        authoredPullRequestCandidateFrom(node, input.account)
      );
      let reachedCutoff = false;
      for (const candidate of pageCandidates) {
        if (observedNodeIds.has(candidate.nodeId)) {
          throw new TypeError(
            "GitHub returned invalid authored pull request pagination."
          );
        }
        observedNodeIds.add(candidate.nodeId);
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
        candidates.set(candidate.nodeId, candidate);
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
  reusedPullRequests: number;
  retryAt: Date | null;
  scannedPullRequests: number;
  selectedAuthoredPullRequests: number;
  skippedPullRequests: number;
  stopReason: GitHubPullRequestBackfillStopReason;
  unavailablePullRequests: number;
}

interface PreparedPullRequest {
  commits: readonly GitHubCommit[];
  inWindow: boolean;
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
  reusedPullRequests: 0,
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
      { existingOnly: !item.inWindow, refreshMembership: true }
    );
    if (stored === null) {
      result.skippedPullRequests += 1;
      continue;
    }
    const commits = item.inWindow
      ? await persistGitHubCommitReferences({ commits: item.commits })
      : { duplicates: 0, inserted: 0 };
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
    if (membership.refreshed) {
      result.memberships += 1;
    }
    if (item.inWindow) {
      result.commits += commits.inserted;
      result.duplicateCommits += commits.duplicates;
      result.pullRequests += 1;
    } else {
      result.skippedPullRequests += 1;
    }
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
}): Promise<PreparedPullRequest> => {
  const snapshot = await fetchGitHubPullRequestRestSnapshotWithToken(
    input.candidate,
    input.token,
    { deadlineAt: input.deadlineAt }
  );
  const { pullRequest } = snapshot;
  const state: GitHubPullRequestBackfillCandidate["state"] = pullRequest.merged
    ? "merged"
    : pullRequest.state;
  if (
    pullRequest.baseSha !== input.candidate.baseSha ||
    pullRequest.commitCount !== input.candidate.commitCount ||
    pullRequest.headSha !== input.candidate.headSha ||
    pullRequest.nodeId !== input.candidate.nodeId ||
    pullRequest.number !== input.candidate.number ||
    pullRequest.providerUpdatedAt !== input.candidate.providerUpdatedAt ||
    pullRequest.repository.fullName !== input.candidate.repository ||
    pullRequest.repository.id !== input.candidate.repositoryId ||
    state !== input.candidate.state
  ) {
    throw new GitHubGraphQlResponseError("partial_response", {
      retryable: true,
    });
  }
  const commitRepository =
    pullRequest.headRepository ?? pullRequest.baseRepository;
  const membership = await fetchGitHubPullRequestMembershipWithToken(
    input.candidate,
    snapshot.expectedCommitCount,
    input.token,
    {
      commitRepository,
      deadlineAt: input.deadlineAt,
      expectedBaseSha: pullRequest.baseSha,
      expectedHeadSha: pullRequest.headSha,
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
  return {
    commits,
    inWindow: githubPullRequestBelongsInBackfillWindow({
      account: input.account,
      commits,
      sinceAt: input.sinceAt,
      untilAt: input.untilAt,
    }),
    membership,
    snapshot,
  };
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

export const githubPullRequestBackfillDigestFrom = (input: {
  account: TrackedGitHubAccount;
  candidates: readonly GitHubPullRequestBackfillCandidate[];
  repositoryId: string | null;
  sinceAt: Date;
  untilAt: Date;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        account: input.account,
        candidates: input.candidates
          .toSorted(comparePullRequestCandidates)
          .map((candidate) => [
            candidate.nodeId,
            candidate.repositoryId,
            candidate.repository,
            candidate.number,
            candidate.providerUpdatedAt,
            candidate.baseSha,
            candidate.headSha,
            candidate.commitCount,
            candidate.state,
          ]),
        recipe: PULL_REQUEST_BACKFILL_RECIPE,
        repositoryId: input.repositoryId,
        sinceAt: input.sinceAt.toISOString(),
        untilAt: input.untilAt.toISOString(),
      })
    )
    .digest("hex");

const processPullRequestCandidates = async (
  candidates: readonly GitHubPullRequestBackfillCandidate[],
  input: {
    account: TrackedGitHubAccount;
    deadlineAt: number;
    onProgress: GitHubPullRequestBackfillProgressReporter;
    persistPrepared: typeof persistPreparedPullRequestsWithGaps;
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
        prepared.push(value);
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
    if (unmerged.length > 0) {
      await input.persistPrepared(unmerged, input.account, result);
    }
    const merged = prepared.filter(
      ({ snapshot }) => snapshot.pullRequest.merged
    );
    if (merged.length > 0) {
      try {
        await input.persistPrepared(
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
              await input.persistPrepared(
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
interface GitHubPullRequestBackfillDependencies {
  persistDigest: typeof persistGitHubPullRequestBackfillDigest;
  persistPrepared: typeof persistPreparedPullRequestsWithGaps;
  readDigest: typeof readGitHubPullRequestBackfillDigest;
}

const productionBackfillDependencies: GitHubPullRequestBackfillDependencies = {
  persistDigest: persistGitHubPullRequestBackfillDigest,
  persistPrepared: persistPreparedPullRequestsWithGaps,
  readDigest: readGitHubPullRequestBackfillDigest,
};

export const backfillGitHubPullRequests = async (
  input: {
    account: TrackedGitHubAccount;
    deadlineAt: number;
    onProgress?: GitHubPullRequestBackfillProgressReporter;
    repositoryId: string | null;
    sinceAt: Date;
    token: string;
    untilAt: Date;
  },
  dependencies: GitHubPullRequestBackfillDependencies = productionBackfillDependencies
): Promise<GitHubPullRequestBackfillResult> => {
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
  if (candidates.length === 0) {
    return result;
  }
  const digest = githubPullRequestBackfillDigestFrom({
    ...input,
    candidates,
  });
  if ((await dependencies.readDigest(input.account)) === digest) {
    result.reusedPullRequests = candidates.length;
    onProgress({ ...result });
    return result;
  }
  const interrupted = await processPullRequestCandidates(
    candidates,
    { ...input, onProgress, persistPrepared: dependencies.persistPrepared },
    result
  );
  if (interrupted !== null) {
    return stop(result, interrupted.reason, interrupted.retryAt);
  }
  if (result.unavailablePullRequests === 0) {
    await dependencies.persistDigest({ account: input.account, digest });
  }
  return result;
};
