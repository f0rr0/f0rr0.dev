import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubCommits,
  githubPullRequests,
  githubPullRequestSignals,
  githubPushObservations,
  githubRepositories,
} from "@/db/schema";
import {
  GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
  githubPrReconciliationCutoff,
} from "@/lib/github-activity-worker-core";
import {
  githubCommitInWorkerScope,
  githubPullRequestInWorkerScope,
  githubPullRequestSignalInWorkerScope,
  githubPushObservationInWorkerScope,
} from "@/lib/github-activity-worker-store";
import type { GitHubActivityWorkerScope } from "@/lib/github-activity-worker-store";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";

export interface GitHubFactualWorkerBacklog {
  pending: {
    commitEnrichment: number;
    commitPullRequests: number;
    pullRequestReconciliation: number;
    pullRequestSignals: number;
    pushObservations: number;
    total: number;
  };
  retryAt: Date | null;
  unavailable: number;
}

const retryAtFrom = (rows: readonly { retryAt: Date | null }[], now: Date) => {
  const future = rows.flatMap(({ retryAt }) =>
    retryAt !== null && retryAt > now ? [retryAt.getTime()] : []
  );
  return rows.length > 0 && future.length === rows.length
    ? new Date(Math.min(...future))
    : null;
};

/** Reads nonterminal factual worker state without claiming routine capacity. */
export const readGitHubFactualWorkerBacklog = async (input: {
  accounts: readonly TrackedGitHubAccount[];
  now?: Date;
  scope: GitHubActivityWorkerScope;
}): Promise<GitHubFactualWorkerBacklog> => {
  if (input.accounts.length === 0) {
    throw new RangeError("The GitHub factual backlog account scope is empty.");
  }
  const now = input.now ?? new Date();
  const reconciliationCutoff = githubPrReconciliationCutoff(
    GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS,
    now
  );
  const accounts = [...input.accounts];

  return await getDatabase().transaction(
    async (transaction) => {
      const observations = await transaction
        .select({
          retryAt: githubPushObservations.leaseUntil,
          state: githubPushObservations.state,
        })
        .from(githubPushObservations)
        .where(
          and(
            inArray(githubPushObservations.account, accounts),
            githubPushObservationInWorkerScope(input.scope),
            inArray(githubPushObservations.state, [
              "pending",
              "deferred",
              "processing",
              "unavailable",
            ])
          )
        );
      const commits = await transaction
        .select({
          enrichmentRetryAt: githubCommits.enrichmentLeaseUntil,
          enrichmentState: githubCommits.enrichmentState,
          pullRequestRetryAt: githubCommits.pullRequestDiscoveryLeaseUntil,
          pullRequestState: githubCommits.pullRequestDiscoveryState,
        })
        .from(githubCommits)
        .where(
          and(
            inArray(githubCommits.author, accounts),
            githubCommitInWorkerScope(input.scope),
            or(
              inArray(githubCommits.enrichmentState, [
                "pending",
                "processing",
                "unavailable",
              ]),
              and(
                eq(githubCommits.enrichmentState, "complete"),
                inArray(githubCommits.pullRequestDiscoveryState, [
                  "pending",
                  "processing",
                  "unavailable",
                ])
              )
            )
          )
        );
      const signals = await transaction
        .select({
          retryAt: githubPullRequestSignals.leaseUntil,
          state: githubPullRequestSignals.state,
        })
        .from(githubPullRequestSignals)
        .where(
          and(
            inArray(githubPullRequestSignals.account, accounts),
            githubPullRequestSignalInWorkerScope(input.scope),
            inArray(githubPullRequestSignals.state, [
              "pending",
              "deferred",
              "processing",
              "unavailable",
            ])
          )
        );
      const pullRequests = await transaction
        .select({
          attempts: githubPullRequests.reconcileAttempts,
          error: githubPullRequests.reconcileError,
          retryAt: githubPullRequests.nextReconcileAt,
        })
        .from(githubPullRequests)
        .innerJoin(
          githubRepositories,
          eq(githubRepositories.id, githubPullRequests.repositoryId)
        )
        .where(
          and(
            inArray(githubPullRequests.account, accounts),
            githubPullRequestInWorkerScope(input.scope),
            or(
              and(
                eq(githubPullRequests.state, "open"),
                reconciliationCutoff === null
                  ? undefined
                  : gte(githubPullRequests.createdAt, reconciliationCutoff)
              ),
              inArray(githubPullRequests.state, ["closed", "merged"])
            ),
            or(
              and(
                isNotNull(githubPullRequests.nextReconcileAt),
                or(
                  lte(githubPullRequests.nextReconcileAt, now),
                  gt(githubPullRequests.reconcileAttempts, 0),
                  isNotNull(githubPullRequests.reconcileError)
                )
              ),
              and(
                isNull(githubPullRequests.nextReconcileAt),
                isNotNull(githubPullRequests.reconcileError)
              )
            )
          )
        );

      const pendingObservations = observations.filter(
        ({ state }) => state !== "unavailable"
      );
      const pendingEnrichment = commits.filter(
        ({ enrichmentState }) =>
          enrichmentState === "pending" || enrichmentState === "processing"
      );
      const pendingCommitPullRequests = commits.filter(
        ({ enrichmentState, pullRequestState }) =>
          enrichmentState === "complete" &&
          (pullRequestState === "pending" || pullRequestState === "processing")
      );
      const pendingSignals = signals.filter(
        ({ state }) => state !== "unavailable"
      );
      const pendingPullRequests = pullRequests.filter(
        ({ retryAt }) => retryAt !== null
      );
      const retryRows = [
        ...pendingObservations.map(({ retryAt }) => ({ retryAt })),
        ...pendingEnrichment.map(({ enrichmentRetryAt }) => ({
          retryAt: enrichmentRetryAt,
        })),
        ...pendingCommitPullRequests.map(({ pullRequestRetryAt }) => ({
          retryAt: pullRequestRetryAt,
        })),
        ...pendingSignals.map(({ retryAt }) => ({ retryAt })),
        ...pendingPullRequests.map(({ retryAt }) => ({ retryAt })),
      ];
      const pending = {
        commitEnrichment: pendingEnrichment.length,
        commitPullRequests: pendingCommitPullRequests.length,
        pullRequestReconciliation: pendingPullRequests.length,
        pullRequestSignals: pendingSignals.length,
        pushObservations: pendingObservations.length,
        total: retryRows.length,
      };
      const unavailable =
        observations.filter(({ state }) => state === "unavailable").length +
        commits.filter(
          ({ enrichmentState }) => enrichmentState === "unavailable"
        ).length +
        commits.filter(
          ({ enrichmentState, pullRequestState }) =>
            enrichmentState === "complete" && pullRequestState === "unavailable"
        ).length +
        signals.filter(({ state }) => state === "unavailable").length +
        pullRequests.filter(
          ({ error, retryAt }) => error !== null && retryAt === null
        ).length;
      return {
        pending,
        retryAt: retryAtFrom(retryRows, now),
        unavailable,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
};
