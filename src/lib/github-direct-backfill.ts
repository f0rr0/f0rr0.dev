import {
  ActivityProcessingError,
  fetchGitHubCurrentRefMembership,
  GitHubGraphQlResponseError,
} from "@/lib/github-activity-processor";
import {
  GitHubRequestDeadlineError,
  GitHubResponseError,
} from "@/lib/github-api";
import {
  claimGitHubRefRepairs,
  completeGitHubRefDeletion,
  completeGitHubRefRepair,
  deferGitHubRefRepair,
  githubCurrentRefMembershipReferenceFrom,
  readGitHubRefRepairBacklog,
  releaseGitHubRefRepair,
} from "@/lib/github-ref-membership-store";
import type { ClaimedGitHubRefRepair } from "@/lib/github-ref-membership-store";

const DEADLINE_MARGIN_MS = 30_000;
const DEFAULT_CLAIM_LIMIT = 8;

export type GitHubCurrentHeadBackfillStopReason =
  | "complete"
  | "deadline"
  | "deferred"
  | "provider_retry";

export interface GitHubCurrentHeadBackfillResult {
  claimedRefs: number;
  complete: boolean;
  completedGenerations: number;
  deferredRefs: number;
  deletedGenerations: number;
  insertedCommits: number;
  memberCommits: number;
  remainingRefs: number;
  retryAt: Date | null;
  staleRefs: number;
  stopReason: GitHubCurrentHeadBackfillStopReason;
}

interface GitHubCurrentHeadBackfillDependencies {
  claim: typeof claimGitHubRefRepairs;
  completeActive: typeof completeGitHubRefRepair;
  completeDeleted: typeof completeGitHubRefDeletion;
  defer: typeof deferGitHubRefRepair;
  fetch: typeof fetchGitHubCurrentRefMembership;
  readBacklog: typeof readGitHubRefRepairBacklog;
  release: typeof releaseGitHubRefRepair;
}

const productionDependencies: GitHubCurrentHeadBackfillDependencies = {
  claim: claimGitHubRefRepairs,
  completeActive: completeGitHubRefRepair,
  completeDeleted: completeGitHubRefDeletion,
  defer: deferGitHubRefRepair,
  fetch: fetchGitHubCurrentRefMembership,
  readBacklog: readGitHubRefRepairBacklog,
  release: releaseGitHubRefRepair,
};

const emptyResult = (): GitHubCurrentHeadBackfillResult => ({
  claimedRefs: 0,
  complete: false,
  completedGenerations: 0,
  deferredRefs: 0,
  deletedGenerations: 0,
  insertedCommits: 0,
  memberCommits: 0,
  remainingRefs: 0,
  retryAt: null,
  staleRefs: 0,
  stopReason: "deferred",
});

const deadlineReached = (deadlineAt: number) =>
  Date.now() + DEADLINE_MARGIN_MS >= deadlineAt;

const providerRetryAtFrom = (error: unknown) => {
  if (error instanceof GitHubResponseError && error.retryable) {
    return { retryAt: error.retryAt };
  }
  if (error instanceof GitHubGraphQlResponseError && error.retryable) {
    return { retryAt: error.retryAt };
  }
  return null;
};

const errorCode = (error: unknown) => {
  if (error instanceof ActivityProcessingError) {
    return error.code;
  }
  if (error instanceof GitHubResponseError) {
    return `github_${String(error.status)}`;
  }
  if (error instanceof GitHubGraphQlResponseError) {
    return `github_graphql_${error.kind}`;
  }
  return error instanceof Error ? error.name.slice(0, 80) : "unknown_error";
};

const releaseRepairs = async (
  repairs: readonly ClaimedGitHubRefRepair[],
  dependencies: GitHubCurrentHeadBackfillDependencies
) => {
  for (const repair of repairs) {
    await dependencies.release(repair);
  }
};

const stoppedResult = (
  result: GitHubCurrentHeadBackfillResult,
  input: {
    remainingRefs: number;
    retryAt?: Date | null;
    stopReason: Exclude<GitHubCurrentHeadBackfillStopReason, "complete">;
  }
): GitHubCurrentHeadBackfillResult => ({
  ...result,
  complete: false,
  remainingRefs: input.remainingRefs,
  retryAt: input.retryAt ?? null,
  stopReason: input.stopReason,
});

/**
 * Drains only stale projection-relevant desired heads. Each successful ref is
 * atomically checkpointed as a complete generation before another is claimed.
 */
export const backfillGitHubCurrentRefGenerations = async (
  input: {
    claimLimit?: number;
    deadlineAt: number;
    repositoryId: string | null;
  },
  dependencies: GitHubCurrentHeadBackfillDependencies = productionDependencies
): Promise<GitHubCurrentHeadBackfillResult> => {
  const claimLimit = input.claimLimit ?? DEFAULT_CLAIM_LIMIT;
  if (
    !Number.isSafeInteger(claimLimit) ||
    claimLimit < 1 ||
    claimLimit > 100 ||
    !Number.isFinite(input.deadlineAt)
  ) {
    throw new RangeError(
      "The GitHub current-head backfill bounds are invalid."
    );
  }
  const result = emptyResult();

  while (!deadlineReached(input.deadlineAt)) {
    const claims = await dependencies.claim({
      limit: claimLimit,
      repositoryId: input.repositoryId,
    });
    result.claimedRefs += claims.length;
    if (claims.length === 0) {
      const backlog = await dependencies.readBacklog({
        repositoryId: input.repositoryId,
      });
      if (backlog.remaining === 0) {
        return {
          ...result,
          complete: true,
          remainingRefs: 0,
          retryAt: null,
          stopReason: "complete",
        };
      }
      return stoppedResult(result, {
        remainingRefs: backlog.remaining,
        retryAt: backlog.retryAt,
        stopReason: "deferred",
      });
    }

    for (const [index, repair] of claims.entries()) {
      if (deadlineReached(input.deadlineAt)) {
        await releaseRepairs(claims.slice(index), dependencies);
        const backlog = await dependencies.readBacklog({
          repositoryId: input.repositoryId,
        });
        return stoppedResult(result, {
          remainingRefs: backlog.remaining,
          stopReason: "deadline",
        });
      }
      try {
        if (!repair.active) {
          const completion = await dependencies.completeDeleted(repair);
          if (completion.stale) {
            result.staleRefs += 1;
            await releaseRepairs(claims.slice(index + 1), dependencies);
            const backlog = await dependencies.readBacklog({
              repositoryId: input.repositoryId,
            });
            return stoppedResult(result, {
              remainingRefs: backlog.remaining,
              retryAt: backlog.retryAt,
              stopReason: "deferred",
            });
          }
          result.deletedGenerations += 1;
          continue;
        }

        const source = await dependencies.fetch(
          githubCurrentRefMembershipReferenceFrom(repair),
          { deadlineAt: input.deadlineAt }
        );
        const completion = await dependencies.completeActive(repair, source);
        if (completion.stale) {
          result.staleRefs += 1;
          await releaseRepairs(claims.slice(index + 1), dependencies);
          const backlog = await dependencies.readBacklog({
            repositoryId: input.repositoryId,
          });
          return stoppedResult(result, {
            remainingRefs: backlog.remaining,
            retryAt: backlog.retryAt,
            stopReason: "deferred",
          });
        }
        result.completedGenerations += 1;
        result.insertedCommits += completion.insertedCommits;
        result.memberCommits += completion.memberCount;
      } catch (error) {
        if (error instanceof GitHubRequestDeadlineError) {
          await dependencies.release(repair);
          await releaseRepairs(claims.slice(index + 1), dependencies);
          const backlog = await dependencies.readBacklog({
            repositoryId: input.repositoryId,
          });
          return stoppedResult(result, {
            remainingRefs: backlog.remaining,
            stopReason: "deadline",
          });
        }
        const providerRetry = providerRetryAtFrom(error);
        const retryAt = await dependencies.defer(
          repair,
          errorCode(error),
          providerRetry?.retryAt ?? null
        );
        result.deferredRefs += 1;
        await releaseRepairs(claims.slice(index + 1), dependencies);
        const backlog = await dependencies.readBacklog({
          repositoryId: input.repositoryId,
        });
        return stoppedResult(result, {
          remainingRefs: backlog.remaining,
          retryAt,
          stopReason: providerRetry === null ? "deferred" : "provider_retry",
        });
      }
    }
  }

  const backlog = await dependencies.readBacklog({
    repositoryId: input.repositoryId,
  });
  return stoppedResult(result, {
    remainingRefs: backlog.remaining,
    stopReason: "deadline",
  });
};
