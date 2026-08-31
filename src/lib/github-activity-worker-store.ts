import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  eq,
  gte,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountCheckpoints,
  githubCommits,
  githubPublicActivities,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestSignals,
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubSummaryAttempts,
} from "@/db/schema";
import { invalidateGitHubPullRequestDerivedAliases } from "@/lib/github-activity-alias-store";
import type {
  GitHubActivityCommitReference,
  GitHubActivityCommitSource,
  GitHubActivityPushObservationSource,
} from "@/lib/github-activity-processor";
import { validateGitHubPushObservationCommitShas } from "@/lib/github-activity-processor";
import {
  deriveCommitLanguages,
  PUBLIC_COMMIT_SUMMARY_RECIPE,
  substantiveCommitLoc,
} from "@/lib/github-activity-public-summary";
import {
  githubCommitActivityOccurredAt,
  githubActivityRetryAt,
  githubPullRequestSnapshotDisposition,
  githubPrReconciliationCutoff,
  githubSummaryCanPublish,
  nextGitHubPullRequestReconciliationAt,
} from "@/lib/github-activity-worker-core";
import type { GitHubExactDiffDigest } from "@/lib/github-activity-worker-core";
import { GitHubRequestDeadlineError } from "@/lib/github-api";
import {
  TRACKED_GITHUB_ACCOUNTS,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type {
  GitHubPullRequest,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const isNonMergeCommit = sql<boolean>`
  ${githubCommits.parentShas} IS NOT NULL
  AND jsonb_array_length(${githubCommits.parentShas}) <= 1
`;
const commitActivityIdentity = and(
  eq(githubPublicActivities.kind, "commit"),
  eq(githubCommits.activityPublicId, githubPublicActivities.publicId),
  eq(githubCommits.repositoryId, githubPublicActivities.repositoryId),
  eq(githubCommits.sha, githubPublicActivities.sourceNodeId)
);

const commitIdentity = (commit: { repositoryId: string; sha: string }) =>
  and(
    eq(githubCommits.repositoryId, commit.repositoryId),
    eq(githubCommits.sha, commit.sha)
  );

const observationIdentity = (observation: { id: string }) =>
  eq(githubPushObservations.id, observation.id);

const dueAt = (
  attemptCount: number,
  now: Date,
  requested: Date | null = null
) => githubActivityRetryAt(attemptCount, now, requested);

const GITHUB_EVIDENCE_RECOVERY_CONSTRAINT =
  "github_pull_requests_verified_merge_sha";
const GITHUB_EVIDENCE_RECOVERY_LOCK = "github-evidence-recovery-v1";
export const GITHUB_EVIDENCE_RECOVERY_CONFIRMATION =
  "REPAIR_GITHUB_EVIDENCE_V1";

export interface GitHubEvidenceRecoveryPlan {
  aliasesToClear: number;
  canonicalizedCommitsToReset: number;
  commitActivitiesToUnpublish: number;
  commitsToRediscoverPullRequests: number;
  constraintInstalled: boolean;
  pullRequestsToReconcile: number;
  summariesToRequeue: number;
  unverifiedMergeShasToClear: number;
}

export interface GitHubEvidenceRecoveryResult {
  plan: GitHubEvidenceRecoveryPlan;
  repairedAt: string | null;
  status: "already_applied" | "applied";
}

const appliedGitHubEvidenceRecoveryPlan = (): GitHubEvidenceRecoveryPlan => ({
  aliasesToClear: 0,
  canonicalizedCommitsToReset: 0,
  commitActivitiesToUnpublish: 0,
  commitsToRediscoverPullRequests: 0,
  constraintInstalled: true,
  pullRequestsToReconcile: 0,
  summariesToRequeue: 0,
  unverifiedMergeShasToClear: 0,
});

const invalidGitHubMergeEvidence = sql<boolean>`NOT (
  (${githubPullRequests.mergeSha} IS NULL AND ${githubPullRequests.mergeShaVerifiedAt} IS NULL)
  OR (
    ${githubPullRequests.state} = 'merged'
    AND ${githubPullRequests.mergeShaVerifiedAt} IS NOT NULL
  )
)`;

const legacyGitHubCanonicalAlias = and(
  eq(githubPublicActivities.kind, "commit"),
  or(
    isNotNull(githubPublicActivities.aliasEvidence),
    isNotNull(githubPublicActivities.aliasReason),
    isNotNull(githubPublicActivities.canonicalPublicId),
    isNotNull(githubPublicActivities.hiddenAt)
  )
);

const currentNoncompleteCommitSummary = and(
  inArray(githubSummaryAttempts.state, [
    "pending",
    "failed",
    "indeterminate",
    "processing",
  ]),
  sql<boolean>`EXISTS (
    SELECT 1
    FROM ${githubPublicActivities} AS recovery_activity
    WHERE recovery_activity.public_id = ${githubSummaryAttempts.activityPublicId}
      AND recovery_activity.revision = ${githubSummaryAttempts.revision}
      AND recovery_activity.kind = 'commit'
  )`
);

const githubEvidenceRecoveryConstraintInstalled = async (
  transaction: DatabaseTransaction
) => {
  const [row] = await transaction.execute<{ installed: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = ${GITHUB_EVIDENCE_RECOVERY_CONSTRAINT}
        AND conrelid = 'github_pull_requests'::regclass
    ) AS installed
  `);
  return row?.installed ?? false;
};

const githubEvidenceRecoveryPlanInTransaction = async (
  transaction: DatabaseTransaction
): Promise<GitHubEvidenceRecoveryPlan> => {
  const [unverifiedMergeShas] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubPullRequests)
    .where(invalidGitHubMergeEvidence);
  const [aliases] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubPublicActivities)
    .where(legacyGitHubCanonicalAlias);
  const [canonicalizedCommits] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubCommits)
    .where(isNotNull(githubCommits.canonicalizedAt));
  const [publishedCommitActivities] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubPublicActivities)
    .where(
      and(
        legacyGitHubCanonicalAlias,
        isNotNull(githubPublicActivities.publishedAt)
      )
    );
  const [commits] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubCommits)
    .where(eq(githubCommits.enrichmentState, "complete"));
  const [pullRequests] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubPullRequests);
  const [summaries] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubSummaryAttempts)
    .where(currentNoncompleteCommitSummary);

  return {
    aliasesToClear: aliases?.value ?? 0,
    canonicalizedCommitsToReset: canonicalizedCommits?.value ?? 0,
    commitActivitiesToUnpublish: publishedCommitActivities?.value ?? 0,
    commitsToRediscoverPullRequests: commits?.value ?? 0,
    constraintInstalled:
      await githubEvidenceRecoveryConstraintInstalled(transaction),
    pullRequestsToReconcile: pullRequests?.value ?? 0,
    summariesToRequeue: summaries?.value ?? 0,
    unverifiedMergeShasToClear: unverifiedMergeShas?.value ?? 0,
  };
};

/**
 * Previews the one-time repair without claiming work or mutating source rows.
 * Counts describe the shared database, not a repository-scoped backfill.
 */
export const inspectGitHubEvidenceRecovery = async () =>
  await getDatabase().transaction(githubEvidenceRecoveryPlanInTransaction);

/**
 * Completes the post-deploy evidence migration if its constraint marker is
 * absent. The catalog fast path keeps this safe to call at every worker start.
 *
 * Invalidates legacy merge evidence and every projection derived from it.
 * The transaction preserves commits, PR snapshots, memberships, and summaries;
 * workers rebuild the canonical/public projection from authoritative evidence.
 */
export const ensureGitHubEvidenceIntegrity = async (
  now = new Date(),
  options: { deadlineAt?: number } = {}
): Promise<GitHubEvidenceRecoveryResult> => {
  if (Number.isNaN(now.getTime())) {
    throw new TypeError("The GitHub evidence repair timestamp is invalid.");
  }
  if (
    options.deadlineAt !== undefined &&
    (!Number.isFinite(options.deadlineAt) || options.deadlineAt <= Date.now())
  ) {
    throw new GitHubRequestDeadlineError();
  }

  return await getDatabase().transaction(async (transaction) => {
    if (options.deadlineAt !== undefined) {
      const remainingMilliseconds = Math.floor(options.deadlineAt - Date.now());
      if (remainingMilliseconds < 1) {
        throw new GitHubRequestDeadlineError();
      }
      const timeout = `${String(remainingMilliseconds)}ms`;
      await transaction.execute(sql`
        SELECT
          set_config('lock_timeout', ${timeout}, true),
          set_config('statement_timeout', ${timeout}, true)
      `);
    }
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${GITHUB_EVIDENCE_RECOVERY_LOCK}, 0))`
    );
    if (await githubEvidenceRecoveryConstraintInstalled(transaction)) {
      return {
        plan: appliedGitHubEvidenceRecoveryPlan(),
        repairedAt: null,
        status: "already_applied",
      };
    }
    const plan = await githubEvidenceRecoveryPlanInTransaction(transaction);

    await transaction
      .update(githubPullRequests)
      .set({ mergeSha: null, mergeShaVerifiedAt: null })
      .where(invalidGitHubMergeEvidence);
    await transaction
      .update(githubPublicActivities)
      .set({
        aliasEvidence: null,
        aliasReason: null,
        canonicalPublicId: null,
        hiddenAt: null,
        publishedAt: null,
      })
      .where(legacyGitHubCanonicalAlias);
    await transaction
      .update(githubCommits)
      .set({
        canonicalizedAt: null,
        pullRequestDiscoveryAttempts: 0,
        pullRequestDiscoveryError: null,
        pullRequestDiscoveryLeaseToken: null,
        pullRequestDiscoveryLeaseUntil: now,
        pullRequestDiscoveryState: "pending",
      })
      .where(eq(githubCommits.enrichmentState, "complete"));
    await transaction.update(githubPullRequests).set({
      nextReconcileAt: now,
      reconcileAttempts: 0,
      reconcileError: null,
    });
    await transaction
      .update(githubSummaryAttempts)
      .set({
        attemptCount: 0,
        attemptedAt: null,
        completedAt: null,
        errorCode: null,
        inputHash: null,
        leaseToken: null,
        leaseUntil: null,
        model: null,
        state: "pending",
        summaryHeadline: null,
        summaryShort: null,
      })
      .where(currentNoncompleteCommitSummary);
    await transaction.execute(sql`
      ALTER TABLE "github_pull_requests"
      ADD CONSTRAINT "github_pull_requests_verified_merge_sha"
      CHECK (
        (merge_sha IS NULL AND merge_sha_verified_at IS NULL)
        OR (
          state = 'merged'
          AND merge_sha_verified_at IS NOT NULL
        )
      )
    `);

    return {
      plan,
      repairedAt: now.toISOString(),
      status: "applied",
    };
  });
};

/** Manual repair entry point guarded by an explicit workflow confirmation. */
export const repairLegacyGitHubEvidence = async (
  confirmation: string,
  now = new Date()
): Promise<GitHubEvidenceRecoveryResult> => {
  if (confirmation !== GITHUB_EVIDENCE_RECOVERY_CONFIRMATION) {
    throw new TypeError("The GitHub evidence repair confirmation is invalid.");
  }
  return await ensureGitHubEvidenceIntegrity(now);
};

export interface ClaimedGitHubPushObservation {
  account: TrackedGitHubAccount;
  attemptCount: number;
  afterSha: string;
  beforeSha: string;
  expectedCommitCount: number | null;
  historySinceAt: Date;
  historyUntilAt: Date | null;
  id: string;
  knownShas: readonly string[];
  leaseToken: string;
  observedAt: Date;
  priorAttemptCount: number;
  priorErrorCode: string | null;
  priorRetryAt: Date | null;
  priorState: "deferred" | "pending";
  refName: string;
  repository: string;
  repositoryId: string;
}

export interface ClaimedGitHubCommit extends GitHubActivityCommitReference {
  attemptCount: number;
  leaseToken: string;
  priorAttemptCount: number;
  priorErrorCode: string | null;
  priorRetryAt: Date | null;
}

export interface ClaimedGitHubPullRequestDiscovery extends GitHubActivityCommitReference {
  attemptCount: number;
  leaseToken: string;
  priorAttemptCount: number;
  priorErrorCode: string | null;
  priorRetryAt: Date | null;
}

export interface HydratedGitHubCommit {
  activityPublicId: string;
  revision: number;
}

export interface StoredPullRequestSnapshot {
  baseRepositoryId: string;
  commitRepositoryId: string;
  membershipRefreshRequired: boolean;
  pullRequestNodeId: string;
  retryLifecycleReset: boolean;
  versionId: string;
}

export interface DueGitHubPullRequest {
  account: TrackedGitHubAccount;
  attemptCount: number;
  createdAt: Date;
  lastReconciledAt: Date | null;
  leaseUntil: Date;
  membershipComplete: boolean;
  nodeId: string;
  number: number;
  priorAttemptCount: number;
  priorErrorCode: string | null;
  priorRetryAt: Date;
  repository: string;
  repositoryId: string;
  versionObservedAt: Date | null;
}

export interface ClaimedGitHubSummary extends GitHubActivityCommitReference {
  activityPublicId: string;
  attemptCount: number;
  leaseToken: string;
  priorAttemptCount: number;
  priorAttemptedAt: Date | null;
  priorErrorCode: string | null;
  priorRetryAt: Date | null;
  revision: number;
}

export interface ClaimedGitHubPullRequestSignal {
  account: TrackedGitHubAccount;
  action: string;
  attemptCount: number;
  id: string;
  leaseToken: string;
  number: number;
  priorAttemptCount: number;
  priorErrorCode: string | null;
  priorRetryAt: Date | null;
  repository: string;
  repositoryId: string;
}

export interface GitHubActivityWorkerScope {
  repositoryId: string | null;
  sinceAt: Date;
  untilAt: Date;
}

export const githubCommitInWorkerScope = (
  scope: GitHubActivityWorkerScope | undefined
) => {
  if (scope === undefined) {
    return sql<boolean>`true`;
  }
  const occurredAt = sql<Date>`coalesce(
    ${githubCommits.committerAt},
    ${githubCommits.committedAt}
  )`;
  const repositoryScope =
    scope.repositoryId === null
      ? undefined
      : sql<boolean>`(
          ${githubCommits.repositoryId} = ${scope.repositoryId}
          OR EXISTS (
            SELECT 1
            FROM ${githubPullRequestMemberships}
            INNER JOIN ${githubPullRequestVersions}
              ON ${githubPullRequestVersions.id} = ${githubPullRequestMemberships.versionId}
            INNER JOIN ${githubPullRequests}
              ON ${githubPullRequests.nodeId} = ${githubPullRequestVersions.pullRequestNodeId}
            WHERE ${githubPullRequestVersions.isCurrent} = true
              AND ${githubPullRequestVersions.membershipComplete} = true
              AND ${githubPullRequests.repositoryId} = ${scope.repositoryId}
              AND ${githubPullRequestMemberships.commitRepositoryId} = ${githubCommits.repositoryId}
              AND ${githubPullRequestMemberships.commitSha} = ${githubCommits.sha}
          )
        )`;
  return and(
    sql<boolean>`${occurredAt} >= ${scope.sinceAt.toISOString()}::timestamptz`,
    sql<boolean>`${occurredAt} <= ${scope.untilAt.toISOString()}::timestamptz`,
    repositoryScope
  );
};

// Intake can be stored after the provider event happened. Scope inboxes by the
// provider timestamp when it exists, falling back to the local observation
// timestamp, so a historical run neither misses delayed evidence nor drains
// unrelated later inbox rows.
export const githubPushObservationInWorkerScope = (
  scope: GitHubActivityWorkerScope | undefined
) =>
  scope === undefined
    ? undefined
    : and(
        sql<boolean>`coalesce(
          ${githubPushObservations.providerCreatedAt},
          ${githubPushObservations.observedAt}
        ) >= ${scope.sinceAt.toISOString()}::timestamptz`,
        sql<boolean>`coalesce(
          ${githubPushObservations.providerCreatedAt},
          ${githubPushObservations.observedAt}
        ) <= ${scope.untilAt.toISOString()}::timestamptz`,
        scope.repositoryId === null
          ? undefined
          : eq(githubPushObservations.repositoryId, scope.repositoryId)
      );

export const githubPullRequestSignalInWorkerScope = (
  scope: GitHubActivityWorkerScope | undefined
) =>
  scope === undefined
    ? undefined
    : and(
        gte(githubPullRequestSignals.occurredAt, scope.sinceAt),
        lte(githubPullRequestSignals.occurredAt, scope.untilAt),
        scope.repositoryId === null
          ? undefined
          : eq(githubPullRequestSignals.repositoryId, scope.repositoryId)
      );

export const githubPullRequestInWorkerScope = (
  scope: GitHubActivityWorkerScope | undefined
) =>
  scope === undefined
    ? undefined
    : and(
        gte(githubPullRequests.providerUpdatedAt, scope.sinceAt),
        scope.repositoryId === null
          ? undefined
          : sql<boolean>`(
              ${githubPullRequests.repositoryId} = ${scope.repositoryId}
              OR ${githubPullRequests.headRepositoryId} = ${scope.repositoryId}
              OR EXISTS (
                SELECT 1
                FROM ${githubPullRequestMemberships}
                INNER JOIN ${githubPullRequestVersions}
                  ON ${githubPullRequestVersions.id} = ${githubPullRequestMemberships.versionId}
                WHERE ${githubPullRequestVersions.pullRequestNodeId} = ${githubPullRequests.nodeId}
                  AND ${githubPullRequestVersions.isCurrent} = true
                  AND ${githubPullRequestVersions.membershipComplete} = true
                  AND ${githubPullRequestMemberships.commitRepositoryId} = ${scope.repositoryId}
              )
            )`
      );

const isActiveAccount = (
  account: string,
  activeAccounts: readonly TrackedGitHubAccount[]
): account is TrackedGitHubAccount =>
  activeAccounts.some((candidate) => candidate === account);

export const claimGitHubPushObservations = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly ClaimedGitHubPushObservation[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub observation claim limit is invalid.");
  }
  if (activeAccounts.length === 0) {
    return [];
  }
  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        account: githubPushObservations.account,
        afterSha: githubPushObservations.afterSha,
        attemptCount: githubPushObservations.attemptCount,
        beforeSha: githubPushObservations.beforeSha,
        errorCode: githubPushObservations.errorCode,
        expectedCommitCount: githubPushObservations.expectedCommitCount,
        historySinceAt: sql<Date>`coalesce(${githubPushObservations.historySinceAt}, ${githubAccountCheckpoints.refBackfillSinceAt})`,
        historyUntilAt: githubPushObservations.historyUntilAt,
        id: githubPushObservations.id,
        leaseUntil: githubPushObservations.leaseUntil,
        observedAt: githubPushObservations.observedAt,
        refName: githubPushObservations.refName,
        repository: githubPushObservations.repositoryNameSnapshot,
        repositoryId: githubPushObservations.repositoryId,
        state: githubPushObservations.state,
      })
      .from(githubPushObservations)
      .innerJoin(
        githubAccountCheckpoints,
        eq(githubAccountCheckpoints.account, githubPushObservations.account)
      )
      .where(
        and(
          inArray(githubPushObservations.account, [...activeAccounts]),
          githubPushObservationInWorkerScope(scope),
          or(
            and(
              inArray(githubPushObservations.state, ["pending", "deferred"]),
              or(
                isNull(githubPushObservations.leaseUntil),
                lte(githubPushObservations.leaseUntil, now)
              )
            ),
            and(
              eq(githubPushObservations.state, "processing"),
              lte(githubPushObservations.leaseUntil, now)
            )
          )
        )
      )
      .orderBy(
        sql`CASE WHEN ${githubPushObservations.state} = 'pending' THEN 0 ELSE 1 END`,
        asc(githubPushObservations.leaseUntil),
        asc(githubPushObservations.observedAt),
        asc(githubPushObservations.id)
      )
      .limit(limit);

    const claimed: ClaimedGitHubPushObservation[] = [];
    for (const candidate of candidates) {
      if (!isActiveAccount(candidate.account, activeAccounts)) {
        continue;
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubPushObservations)
        .set({
          attemptCount: candidate.attemptCount + 1,
          errorCode: null,
          leaseToken,
          leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
          state: "processing",
        })
        .where(
          and(
            observationIdentity(candidate),
            eq(githubPushObservations.state, candidate.state),
            eq(githubPushObservations.attemptCount, candidate.attemptCount),
            or(
              isNull(githubPushObservations.leaseUntil),
              lte(githubPushObservations.leaseUntil, now)
            )
          )
        )
        .returning({ id: githubPushObservations.id });
      if (updated === undefined) {
        continue;
      }
      const known = await transaction
        .select({
          position: githubPushObservationCommits.position,
          sha: githubPushObservationCommits.sha,
        })
        .from(githubPushObservationCommits)
        .where(eq(githubPushObservationCommits.observationId, candidate.id))
        .orderBy(asc(githubPushObservationCommits.position));
      claimed.push({
        account: candidate.account,
        afterSha: candidate.afterSha,
        attemptCount: candidate.attemptCount + 1,
        beforeSha: candidate.beforeSha,
        expectedCommitCount: candidate.expectedCommitCount,
        historySinceAt: candidate.historySinceAt,
        historyUntilAt: candidate.historyUntilAt,
        id: candidate.id,
        knownShas: known.map(({ sha }) => sha),
        leaseToken,
        observedAt: candidate.observedAt,
        priorAttemptCount: candidate.attemptCount,
        priorErrorCode: candidate.errorCode,
        priorRetryAt: candidate.leaseUntil,
        priorState: candidate.state === "pending" ? "pending" : "deferred",
        refName: candidate.refName,
        repository: candidate.repository,
        repositoryId: candidate.repositoryId,
      });
    }
    return claimed;
  });
};

export const completeGitHubPushObservation = async (
  observation: ClaimedGitHubPushObservation,
  source: GitHubActivityPushObservationSource,
  now = new Date()
) => {
  validateGitHubPushObservationCommitShas(observation, source.commitShas);
  const sourceShas = new Set(source.commitShas);
  if (
    source.commits.some(
      (commit) =>
        commit.repositoryId !== observation.repositoryId ||
        !sourceShas.has(commit.sha)
    )
  ) {
    throw new Error("A pushed commit escaped its durable observation.");
  }
  return await getDatabase().transaction(async (transaction) => {
    const [locked] = await transaction
      .select({ id: githubPushObservations.id })
      .from(githubPushObservations)
      .where(
        and(
          observationIdentity(observation),
          eq(githubPushObservations.state, "processing"),
          eq(githubPushObservations.leaseToken, observation.leaseToken)
        )
      )
      .for("update");
    if (locked === undefined) {
      return { insertedCommits: 0, stale: true };
    }

    await transaction
      .delete(githubPushObservationCommits)
      .where(eq(githubPushObservationCommits.observationId, observation.id));
    if (source.commitShas.length > 0) {
      await transaction.insert(githubPushObservationCommits).values(
        source.commitShas.map((sha, position) => ({
          observationId: observation.id,
          position,
          repositoryId: observation.repositoryId,
          sha,
        }))
      );
    }
    const inserted =
      source.commits.length === 0
        ? []
        : await transaction
            .insert(githubCommits)
            .values(
              source.commits.map((commit) => ({
                author: commit.author,
                committedAt: new Date(commit.committedAt),
                firstObservedAt: observation.observedAt,
                message: commit.message,
                repository: commit.repository,
                repositoryId: commit.repositoryId,
                sha: commit.sha,
              }))
            )
            .onConflictDoNothing({
              target: [githubCommits.repositoryId, githubCommits.sha],
            })
            .returning({ sha: githubCommits.sha });
    await transaction
      .update(githubPushObservations)
      .set({
        completedAt: now,
        errorCode: null,
        leaseToken: null,
        leaseUntil: null,
        state: "complete",
      })
      .where(
        and(
          observationIdentity(observation),
          eq(githubPushObservations.state, "processing"),
          eq(githubPushObservations.leaseToken, observation.leaseToken)
        )
      );
    return { insertedCommits: inserted.length, stale: false };
  });
};

export const deferGitHubPushObservation = async (
  observation: ClaimedGitHubPushObservation,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPushObservations)
    .set({
      errorCode,
      leaseToken: null,
      leaseUntil: dueAt(observation.attemptCount, now, retryAt),
      state: "deferred",
    })
    .where(
      and(
        observationIdentity(observation),
        eq(githubPushObservations.state, "processing"),
        eq(githubPushObservations.leaseToken, observation.leaseToken)
      )
    );
};

export const releaseGitHubPushObservation = async (
  observation: ClaimedGitHubPushObservation
) => {
  await getDatabase()
    .update(githubPushObservations)
    .set({
      attemptCount: observation.priorAttemptCount,
      errorCode: observation.priorErrorCode,
      leaseToken: null,
      leaseUntil: observation.priorRetryAt,
      state: observation.priorState,
    })
    .where(
      and(
        observationIdentity(observation),
        eq(githubPushObservations.state, "processing"),
        eq(githubPushObservations.leaseToken, observation.leaseToken)
      )
    );
};

export const markGitHubPushObservationUnavailable = async (
  observation: ClaimedGitHubPushObservation,
  errorCode: string,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPushObservations)
    .set({
      completedAt: now,
      errorCode,
      leaseToken: null,
      leaseUntil: null,
      state: "unavailable",
    })
    .where(
      and(
        observationIdentity(observation),
        eq(githubPushObservations.state, "processing"),
        eq(githubPushObservations.leaseToken, observation.leaseToken)
      )
    );
};

export const claimGitHubCommitsForEnrichment = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly ClaimedGitHubCommit[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub commit claim limit is invalid.");
  }
  if (activeAccounts.length === 0) {
    return [];
  }
  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        author: githubCommits.author,
        attemptCount: githubCommits.enrichmentAttempts,
        committedAt: githubCommits.committedAt,
        errorCode: githubCommits.enrichmentError,
        leaseUntil: githubCommits.enrichmentLeaseUntil,
        message: githubCommits.message,
        repository: githubCommits.repository,
        repositoryId: githubCommits.repositoryId,
        sha: githubCommits.sha,
        state: githubCommits.enrichmentState,
      })
      .from(githubCommits)
      .where(
        and(
          inArray(githubCommits.author, [...activeAccounts]),
          githubCommitInWorkerScope(scope),
          or(
            and(
              eq(githubCommits.enrichmentState, "pending"),
              or(
                isNull(githubCommits.enrichmentLeaseUntil),
                lte(githubCommits.enrichmentLeaseUntil, now)
              )
            ),
            and(
              eq(githubCommits.enrichmentState, "processing"),
              lte(githubCommits.enrichmentLeaseUntil, now)
            )
          )
        )
      )
      .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha))
      .limit(limit);
    const claimed: ClaimedGitHubCommit[] = [];
    for (const candidate of candidates) {
      const account = trackedGitHubAccountFrom(candidate.author);
      if (account === null || !isActiveAccount(account, activeAccounts)) {
        continue;
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubCommits)
        .set({
          enrichmentAttempts: candidate.attemptCount + 1,
          enrichmentError: null,
          enrichmentLeaseToken: leaseToken,
          enrichmentLeaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
          enrichmentState: "processing",
        })
        .where(
          and(
            commitIdentity(candidate),
            eq(githubCommits.enrichmentState, candidate.state),
            or(
              isNull(githubCommits.enrichmentLeaseUntil),
              lte(githubCommits.enrichmentLeaseUntil, now)
            )
          )
        )
        .returning({ sha: githubCommits.sha });
      if (updated !== undefined) {
        claimed.push({
          author: account,
          attemptCount: candidate.attemptCount + 1,
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
          priorAttemptCount: candidate.attemptCount,
          priorErrorCode: candidate.errorCode,
          priorRetryAt: candidate.leaseUntil,
          repository: candidate.repository,
          repositoryId: candidate.repositoryId,
          sha: candidate.sha,
        });
      }
    }
    return claimed;
  });
};

const persistRepositoryEvidence = async (
  transaction: DatabaseTransaction,
  source: GitHubActivityCommitSource,
  repositoryId: string,
  now: Date
) => {
  await transaction
    .insert(githubRepositories)
    .values({
      description: source.repository.description,
      firstObservedAt: now,
      fullName: source.repository.fullName,
      homepageUrl: source.repository.homepageUrl,
      htmlUrl: `https://github.com/${source.repository.fullName}`,
      id: repositoryId,
      lastObservedAt: now,
      ownerAvatarUrl: source.repository.avatarUrl,
      ownerLogin: source.repository.ownerLogin,
      ownerType: source.repository.ownerType,
      topics: source.repository.topics,
      visibility: source.repository.private ? "private" : "public",
    })
    .onConflictDoUpdate({
      set: {
        description: source.repository.description,
        fullName: source.repository.fullName,
        homepageUrl: source.repository.homepageUrl,
        htmlUrl: `https://github.com/${source.repository.fullName}`,
        lastObservedAt: now,
        ownerAvatarUrl: source.repository.avatarUrl,
        ownerLogin: source.repository.ownerLogin,
        ownerType: source.repository.ownerType,
        topics: source.repository.topics,
        visibility: source.repository.private ? "private" : "public",
      },
      target: githubRepositories.id,
    });
};

export const completeGitHubCommitEnrichment = async (
  commit: ClaimedGitHubCommit,
  source: GitHubActivityCommitSource,
  fingerprint: GitHubExactDiffDigest,
  now = new Date()
): Promise<HydratedGitHubCommit | null> =>
  await getDatabase().transaction(async (transaction) => {
    const [locked] = await transaction
      .select({ repositoryId: githubCommits.repositoryId })
      .from(githubCommits)
      .where(
        and(
          commitIdentity(commit),
          eq(githubCommits.enrichmentState, "processing"),
          eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
        )
      )
      .for("update");
    if (locked === undefined) {
      return null;
    }
    await persistRepositoryEvidence(
      transaction,
      source,
      commit.repositoryId,
      now
    );
    const languages = deriveCommitLanguages(source.commit.files);
    const substantiveLoc = substantiveCommitLoc(source.commit.files);
    await transaction
      .update(githubCommits)
      .set({
        additions: source.commit.stats.additions,
        authoredAt: new Date(source.authoredAt),
        authorUserId: source.authorUserId,
        canonicalizedAt: null,
        changedFiles: source.commit.files.length,
        changeFingerprint: fingerprint.digest,
        committerAt: new Date(source.committerAt),
        committerUserId: source.committerUserId,
        committedAt: new Date(source.committerAt),
        deletions: source.commit.stats.deletions,
        enrichmentError: null,
        enrichmentLeaseToken: null,
        enrichmentLeaseUntil: null,
        enrichmentState: "complete",
        fingerprintComplete: fingerprint.complete,
        fullMessage: source.commit.message,
        languages,
        parentShas: source.commit.parents,
        providerFileCapReached: source.commit.providerFileCapReached,
        repository: source.repository.fullName,
        repositoryOwnerAvatarUrl: source.repository.avatarUrl,
        repositoryOwnerLogin: source.repository.ownerLogin,
        repositoryOwnerType: source.repository.ownerType,
        repositoryPrivate: source.repository.private,
        substantiveLoc,
        treeSha: source.commit.treeSha,
      })
      .where(
        and(
          commitIdentity(commit),
          eq(githubCommits.enrichmentState, "processing"),
          eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
        )
      );
    if (fingerprint.complete) {
      await transaction
        .update(githubCommits)
        .set({ canonicalizedAt: null })
        .where(
          and(
            eq(githubCommits.repositoryId, commit.repositoryId),
            eq(githubCommits.changeFingerprint, fingerprint.digest),
            eq(githubCommits.fingerprintComplete, true),
            eq(githubCommits.enrichmentState, "complete")
          )
        );
    }
    const [activity] = await transaction
      .insert(githubPublicActivities)
      .values({
        kind: "commit",
        occurredAt: githubCommitActivityOccurredAt(source),
        repositoryId: commit.repositoryId,
        sourceNodeId: commit.sha,
      })
      .onConflictDoUpdate({
        set: { occurredAt: githubCommitActivityOccurredAt(source) },
        target: [
          githubPublicActivities.kind,
          githubPublicActivities.repositoryId,
          githubPublicActivities.sourceNodeId,
        ],
      })
      .returning({
        publicId: githubPublicActivities.publicId,
        revision: githubPublicActivities.revision,
      });
    if (activity === undefined) {
      throw new Error("The GitHub commit activity could not be persisted.");
    }
    await transaction
      .update(githubCommits)
      .set({ activityPublicId: activity.publicId })
      .where(commitIdentity(commit));
    return {
      activityPublicId: activity.publicId,
      revision: activity.revision,
    };
  });

export const deferGitHubCommitEnrichment = async (
  commit: ClaimedGitHubCommit,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      enrichmentError: errorCode,
      enrichmentLeaseToken: null,
      enrichmentLeaseUntil: dueAt(commit.attemptCount, now, retryAt),
      enrichmentState: "pending",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.enrichmentState, "processing"),
        eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
      )
    );
};

export const releaseGitHubCommitEnrichment = async (
  commit: ClaimedGitHubCommit
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      enrichmentAttempts: commit.priorAttemptCount,
      enrichmentError: commit.priorErrorCode,
      enrichmentLeaseToken: null,
      enrichmentLeaseUntil: commit.priorRetryAt,
      enrichmentState: "pending",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.enrichmentState, "processing"),
        eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
      )
    );
};

export const markGitHubCommitUnavailable = async (
  commit: ClaimedGitHubCommit,
  errorCode: string
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      enrichmentError: errorCode,
      enrichmentLeaseToken: null,
      enrichmentLeaseUntil: null,
      enrichmentState: "unavailable",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.enrichmentState, "processing"),
        eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
      )
    );
};

export const claimGitHubCommitsForPullRequestDiscovery = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly ClaimedGitHubPullRequestDiscovery[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub PR discovery claim limit is invalid.");
  }
  if (activeAccounts.length === 0) {
    return [];
  }
  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        author: githubCommits.author,
        attemptCount: githubCommits.pullRequestDiscoveryAttempts,
        committedAt: githubCommits.committedAt,
        errorCode: githubCommits.pullRequestDiscoveryError,
        leaseUntil: githubCommits.pullRequestDiscoveryLeaseUntil,
        message: githubCommits.message,
        repository: githubCommits.repository,
        repositoryId: githubCommits.repositoryId,
        sha: githubCommits.sha,
        state: githubCommits.pullRequestDiscoveryState,
      })
      .from(githubCommits)
      .where(
        and(
          inArray(githubCommits.author, [...activeAccounts]),
          githubCommitInWorkerScope(scope),
          eq(githubCommits.enrichmentState, "complete"),
          or(
            and(
              eq(githubCommits.pullRequestDiscoveryState, "pending"),
              or(
                isNull(githubCommits.pullRequestDiscoveryLeaseUntil),
                lte(githubCommits.pullRequestDiscoveryLeaseUntil, now)
              )
            ),
            and(
              eq(githubCommits.pullRequestDiscoveryState, "processing"),
              lte(githubCommits.pullRequestDiscoveryLeaseUntil, now)
            )
          )
        )
      )
      .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha))
      .limit(limit);
    const claimed: ClaimedGitHubPullRequestDiscovery[] = [];
    for (const candidate of candidates) {
      const author = trackedGitHubAccountFrom(candidate.author);
      if (author === null || !isActiveAccount(author, activeAccounts)) {
        continue;
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubCommits)
        .set({
          pullRequestDiscoveryAttempts: candidate.attemptCount + 1,
          pullRequestDiscoveryError: null,
          pullRequestDiscoveryLeaseToken: leaseToken,
          pullRequestDiscoveryLeaseUntil: new Date(
            now.getTime() + DEFAULT_LEASE_MS
          ),
          pullRequestDiscoveryState: "processing",
        })
        .where(
          and(
            commitIdentity(candidate),
            eq(githubCommits.pullRequestDiscoveryState, candidate.state),
            or(
              isNull(githubCommits.pullRequestDiscoveryLeaseUntil),
              lte(githubCommits.pullRequestDiscoveryLeaseUntil, now)
            )
          )
        )
        .returning({ sha: githubCommits.sha });
      if (updated !== undefined) {
        claimed.push({
          author,
          attemptCount: candidate.attemptCount + 1,
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
          priorAttemptCount: candidate.attemptCount,
          priorErrorCode: candidate.errorCode,
          priorRetryAt: candidate.leaseUntil,
          repository: candidate.repository,
          repositoryId: candidate.repositoryId,
          sha: candidate.sha,
        });
      }
    }
    return claimed;
  });
};

export const deferGitHubPullRequestDiscovery = async (
  commit: ClaimedGitHubPullRequestDiscovery,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      pullRequestDiscoveryError: errorCode,
      pullRequestDiscoveryLeaseToken: null,
      pullRequestDiscoveryLeaseUntil: dueAt(commit.attemptCount, now, retryAt),
      pullRequestDiscoveryState: "pending",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.pullRequestDiscoveryState, "processing"),
        eq(githubCommits.pullRequestDiscoveryLeaseToken, commit.leaseToken)
      )
    );
};

export const releaseGitHubPullRequestDiscovery = async (
  commit: ClaimedGitHubPullRequestDiscovery
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      pullRequestDiscoveryAttempts: commit.priorAttemptCount,
      pullRequestDiscoveryError: commit.priorErrorCode,
      pullRequestDiscoveryLeaseToken: null,
      pullRequestDiscoveryLeaseUntil: commit.priorRetryAt,
      pullRequestDiscoveryState: "pending",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.pullRequestDiscoveryState, "processing"),
        eq(githubCommits.pullRequestDiscoveryLeaseToken, commit.leaseToken)
      )
    );
};

export const markGitHubPullRequestDiscoveryUnavailable = async (
  commit: ClaimedGitHubPullRequestDiscovery,
  errorCode: string
) => {
  await getDatabase()
    .update(githubCommits)
    .set({
      pullRequestDiscoveryError: errorCode,
      pullRequestDiscoveryLeaseToken: null,
      pullRequestDiscoveryLeaseUntil: null,
      pullRequestDiscoveryState: "unavailable",
    })
    .where(
      and(
        commitIdentity(commit),
        eq(githubCommits.pullRequestDiscoveryState, "processing"),
        eq(githubCommits.pullRequestDiscoveryLeaseToken, commit.leaseToken)
      )
    );
};

export const claimGitHubPullRequestSignals = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly ClaimedGitHubPullRequestSignal[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub PR signal claim limit is invalid.");
  }
  if (activeAccounts.length === 0) {
    return [];
  }
  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        account: githubPullRequestSignals.account,
        action: githubPullRequestSignals.action,
        attemptCount: githubPullRequestSignals.attemptCount,
        errorCode: githubPullRequestSignals.errorCode,
        id: githubPullRequestSignals.id,
        leaseUntil: githubPullRequestSignals.leaseUntil,
        number: githubPullRequestSignals.number,
        repository: githubPullRequestSignals.repositoryNameSnapshot,
        repositoryId: githubPullRequestSignals.repositoryId,
        state: githubPullRequestSignals.state,
      })
      .from(githubPullRequestSignals)
      .where(
        and(
          inArray(githubPullRequestSignals.account, [...activeAccounts]),
          githubPullRequestSignalInWorkerScope(scope),
          or(
            and(
              eq(githubPullRequestSignals.state, "pending"),
              or(
                isNull(githubPullRequestSignals.leaseUntil),
                lte(githubPullRequestSignals.leaseUntil, now)
              )
            ),
            and(
              eq(githubPullRequestSignals.state, "processing"),
              lte(githubPullRequestSignals.leaseUntil, now)
            )
          )
        )
      )
      .orderBy(
        sql`CASE WHEN ${githubPullRequestSignals.state} = 'pending' THEN 0 ELSE 1 END`,
        asc(githubPullRequestSignals.leaseUntil),
        asc(githubPullRequestSignals.observedAt),
        asc(githubPullRequestSignals.id)
      )
      .limit(limit);
    const claimed: ClaimedGitHubPullRequestSignal[] = [];
    for (const candidate of candidates) {
      const account = trackedGitHubAccountFrom(candidate.account);
      if (account === null || !isActiveAccount(account, activeAccounts)) {
        continue;
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubPullRequestSignals)
        .set({
          attemptCount: candidate.attemptCount + 1,
          errorCode: null,
          leaseToken,
          leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
          state: "processing",
        })
        .where(
          and(
            eq(githubPullRequestSignals.id, candidate.id),
            eq(githubPullRequestSignals.state, candidate.state),
            or(
              isNull(githubPullRequestSignals.leaseUntil),
              lte(githubPullRequestSignals.leaseUntil, now)
            )
          )
        )
        .returning({ id: githubPullRequestSignals.id });
      if (updated !== undefined) {
        claimed.push({
          account,
          action: candidate.action,
          attemptCount: candidate.attemptCount + 1,
          id: candidate.id,
          leaseToken,
          number: candidate.number,
          priorAttemptCount: candidate.attemptCount,
          priorErrorCode: candidate.errorCode,
          priorRetryAt: candidate.leaseUntil,
          repository: candidate.repository,
          repositoryId: candidate.repositoryId,
        });
      }
    }
    return claimed;
  });
};

const pullRequestSignalLease = (signal: ClaimedGitHubPullRequestSignal) =>
  and(
    eq(githubPullRequestSignals.id, signal.id),
    eq(githubPullRequestSignals.state, "processing"),
    eq(githubPullRequestSignals.leaseToken, signal.leaseToken)
  );

export const completeGitHubPullRequestSignal = async (
  signal: ClaimedGitHubPullRequestSignal,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequestSignals)
    .set({
      completedAt: now,
      errorCode: null,
      leaseToken: null,
      leaseUntil: null,
      state: "complete",
    })
    .where(pullRequestSignalLease(signal));
};

export const deferGitHubPullRequestSignal = async (
  signal: ClaimedGitHubPullRequestSignal,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequestSignals)
    .set({
      errorCode,
      leaseToken: null,
      leaseUntil: dueAt(signal.attemptCount, now, retryAt),
      state: "pending",
    })
    .where(pullRequestSignalLease(signal));
};

export const releaseGitHubPullRequestSignal = async (
  signal: ClaimedGitHubPullRequestSignal
) => {
  await getDatabase()
    .update(githubPullRequestSignals)
    .set({
      attemptCount: signal.priorAttemptCount,
      errorCode: signal.priorErrorCode,
      leaseToken: null,
      leaseUntil: signal.priorRetryAt,
      state: "pending",
    })
    .where(pullRequestSignalLease(signal));
};

export const markGitHubPullRequestSignalUnavailable = async (
  signal: ClaimedGitHubPullRequestSignal,
  errorCode: string,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequestSignals)
    .set({
      completedAt: now,
      errorCode,
      leaseToken: null,
      leaseUntil: null,
      state: "unavailable",
    })
    .where(pullRequestSignalLease(signal));
};

const pullRequestState = (pullRequest: GitHubPullRequest) =>
  pullRequest.merged ? ("merged" as const) : pullRequest.state;

const terminalAtFrom = (pullRequest: GitHubPullRequest) => {
  if (pullRequest.mergedAt !== null) {
    return new Date(pullRequest.mergedAt);
  }
  return pullRequest.closedAt === null ? null : new Date(pullRequest.closedAt);
};

const persistRepositoryReference = async (
  transaction: DatabaseTransaction,
  repository: GitHubRepositoryFacts,
  now: Date
) => {
  await transaction
    .insert(githubRepositories)
    .values({
      firstObservedAt: now,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      id: repository.id,
      lastObservedAt: now,
      ownerAvatarUrl: repository.ownerAvatarUrl,
      ownerId: repository.ownerId,
      ownerLogin: repository.ownerLogin,
      ownerType: repository.ownerType,
      visibility: repository.visibility,
    })
    .onConflictDoUpdate({
      set: {
        fullName: repository.fullName,
        htmlUrl: sql`coalesce(excluded.html_url, ${githubRepositories.htmlUrl})`,
        lastObservedAt: now,
        ownerAvatarUrl: sql`coalesce(excluded.owner_avatar_url, ${githubRepositories.ownerAvatarUrl})`,
        ownerId: sql`coalesce(excluded.owner_id, ${githubRepositories.ownerId})`,
        ownerLogin: sql`coalesce(excluded.owner_login, ${githubRepositories.ownerLogin})`,
        ownerType: sql`coalesce(excluded.owner_type, ${githubRepositories.ownerType})`,
        visibility: sql`coalesce(excluded.visibility, ${githubRepositories.visibility})`,
      },
      target: githubRepositories.id,
    });
};

// oxlint-disable-next-line complexity -- This transaction guards one versioned PR state transition.
const persistPullRequestSnapshotInTransaction = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  refreshMembership: boolean,
  authoritative: boolean,
  reconciliationLeaseUntil: Date | null,
  now: Date
): Promise<StoredPullRequestSnapshot | null> => {
  const [existing] = await transaction
    .select({
      additions: githubPullRequests.additions,
      changedFiles: githubPullRequests.changedFiles,
      commitCount: githubPullRequests.commitCount,
      deletions: githubPullRequests.deletions,
      headRepositoryId: githubPullRequests.headRepositoryId,
      headSha: githubPullRequests.headSha,
      lastReconciledAt: githubPullRequests.lastReconciledAt,
      mergeSha: githubPullRequests.mergeSha,
      mergeShaVerifiedAt: githubPullRequests.mergeShaVerifiedAt,
      nextReconcileAt: githubPullRequests.nextReconcileAt,
      nodeId: githubPullRequests.nodeId,
      providerUpdatedAt: githubPullRequests.providerUpdatedAt,
      repositoryId: githubPullRequests.repositoryId,
      state: githubPullRequests.state,
    })
    .from(githubPullRequests)
    .where(eq(githubPullRequests.nodeId, pullRequest.nodeId))
    .for("update");
  const providerUpdatedAt = new Date(pullRequest.providerUpdatedAt);
  const disposition =
    existing === undefined
      ? null
      : githubPullRequestSnapshotDisposition(
          existing.providerUpdatedAt,
          providerUpdatedAt,
          authoritative
        );
  if (disposition === "stale") {
    return null;
  }
  await persistRepositoryReference(
    transaction,
    pullRequest.baseRepository,
    now
  );
  if (pullRequest.headRepository !== null) {
    await persistRepositoryReference(
      transaction,
      pullRequest.headRepository,
      now
    );
  }
  const state = pullRequestState(pullRequest);
  const mergeShaResolved =
    state === "merged" && pullRequest.mergeCommitSha !== undefined;
  const resolvedMergeSha = mergeShaResolved
    ? (pullRequest.mergeCommitSha ?? null)
    : null;
  const existingMergeShaResolved =
    existing?.mergeShaVerifiedAt !== null &&
    existing?.mergeShaVerifiedAt !== undefined;
  const mergeSha =
    state === "merged"
      ? mergeShaResolved
        ? resolvedMergeSha
        : existingMergeShaResolved
          ? (existing?.mergeSha ?? null)
          : null
      : null;
  const mergeShaVerifiedAt =
    state === "merged"
      ? mergeShaResolved
        ? now
        : (existing?.mergeShaVerifiedAt ?? null)
      : null;
  const canonicalEvidenceChanged =
    existing !== undefined &&
    (existing.headSha !== pullRequest.headSha ||
      (pullRequest.headRepository !== null &&
        existing.headRepositoryId !== pullRequest.headRepository.id) ||
      existing.repositoryId !== pullRequest.repository.id ||
      existing.mergeSha !== mergeSha ||
      (existing.mergeShaVerifiedAt === null) !==
        (mergeShaVerifiedAt === null) ||
      existing.state !== state);
  const retryLifecycleReset =
    existing !== undefined &&
    (disposition === "newer" || canonicalEvidenceChanged);
  const retryLifecycleUpdate = retryLifecycleReset
    ? {
        nextReconcileAt: reconciliationLeaseUntil ?? now,
        reconcileAttempts: 0,
        reconcileError: null,
      }
    : {};
  if (canonicalEvidenceChanged) {
    await invalidateGitHubPullRequestDerivedAliases(
      transaction,
      pullRequest.nodeId
    );
  }
  const mutable = {
    additions: pullRequest.additions,
    baseRefName: pullRequest.baseRef,
    baseRepositoryId: pullRequest.baseRepository.id,
    baseSha: pullRequest.baseSha,
    body: pullRequest.body,
    changedFiles: pullRequest.changedFiles,
    closedAt:
      pullRequest.closedAt === null ? null : new Date(pullRequest.closedAt),
    commitCount: pullRequest.commitCount,
    deletions: pullRequest.deletions,
    draft: pullRequest.draft,
    headRefName: pullRequest.headRef,
    headRepositoryId: pullRequest.headRepository?.id ?? null,
    headSha: pullRequest.headSha,
    mergedAt:
      pullRequest.mergedAt === null ? null : new Date(pullRequest.mergedAt),
    mergeSha,
    mergeShaVerifiedAt,
    providerFileCapReached: false,
    providerUpdatedAt,
    state,
    terminalAt: terminalAtFrom(pullRequest),
    title: pullRequest.title,
    url: pullRequest.url,
  } as const;
  const mutableUpdate = {
    ...mutable,
    additions: pullRequest.additions ?? existing?.additions,
    changedFiles: pullRequest.changedFiles ?? existing?.changedFiles,
    commitCount: pullRequest.commitCount ?? existing?.commitCount,
    deletions: pullRequest.deletions ?? existing?.deletions,
    headRepositoryId:
      pullRequest.headRepository?.id ?? existing?.headRepositoryId,
  };

  if (existing === undefined) {
    await transaction.insert(githubPullRequests).values({
      ...mutable,
      account,
      authorLogin: pullRequest.author,
      authorUserId: pullRequest.authorUserId,
      bodySnapshot: pullRequest.body,
      createdAt: new Date(pullRequest.createdAt),
      nextReconcileAt: now,
      nodeId: pullRequest.nodeId,
      number: pullRequest.number,
      repositoryId: pullRequest.repository.id,
      titleSnapshot: pullRequest.title,
    });
  } else if (disposition === "newer") {
    await transaction
      .update(githubPullRequests)
      .set({ ...mutableUpdate, ...retryLifecycleUpdate })
      .where(
        and(
          eq(githubPullRequests.nodeId, pullRequest.nodeId),
          eq(githubPullRequests.providerUpdatedAt, existing.providerUpdatedAt)
        )
      );
  } else {
    await transaction
      .update(githubPullRequests)
      .set(
        authoritative
          ? { ...mutableUpdate, ...retryLifecycleUpdate }
          : {
              additions: pullRequest.additions ?? existing.additions,
              changedFiles: pullRequest.changedFiles ?? existing.changedFiles,
              commitCount: pullRequest.commitCount ?? existing.commitCount,
              deletions: pullRequest.deletions ?? existing.deletions,
              headRepositoryId:
                pullRequest.headRepository?.id ?? existing.headRepositoryId,
              ...retryLifecycleUpdate,
            }
      )
      .where(
        and(
          eq(githubPullRequests.nodeId, pullRequest.nodeId),
          eq(githubPullRequests.providerUpdatedAt, existing.providerUpdatedAt)
        )
      );
    if (!authoritative) {
      await transaction
        .update(githubPullRequests)
        .set({ nextReconcileAt: now })
        .where(
          and(
            eq(githubPullRequests.nodeId, pullRequest.nodeId),
            or(
              isNull(githubPullRequests.nextReconcileAt),
              gt(
                githubPullRequests.nextReconcileAt,
                new Date(now.getTime() + DEFAULT_LEASE_MS)
              )
            )
          )
        );
      if (existing.headSha !== pullRequest.headSha) {
        return null;
      }
    }
  }

  const [version] = await transaction
    .select({
      commitCount: githubPullRequestVersions.commitCount,
      headRepositoryId: githubPullRequestVersions.headRepositoryId,
      id: githubPullRequestVersions.id,
      isCurrent: githubPullRequestVersions.isCurrent,
      membershipComplete: githubPullRequestVersions.membershipComplete,
      providerUpdatedAt: githubPullRequestVersions.providerUpdatedAt,
    })
    .from(githubPullRequestVersions)
    .where(
      and(
        eq(githubPullRequestVersions.pullRequestNodeId, pullRequest.nodeId),
        eq(githubPullRequestVersions.headSha, pullRequest.headSha)
      )
    )
    .limit(1);
  let versionId = version?.id;
  if (version === undefined) {
    await transaction
      .update(githubPullRequestVersions)
      .set({ isCurrent: false })
      .where(
        and(
          eq(githubPullRequestVersions.pullRequestNodeId, pullRequest.nodeId),
          eq(githubPullRequestVersions.isCurrent, true)
        )
      );
    const [inserted] = await transaction
      .insert(githubPullRequestVersions)
      .values({
        baseRefName: pullRequest.baseRef,
        baseRepositoryId: pullRequest.baseRepository.id,
        baseSha: pullRequest.baseSha,
        commitCount: pullRequest.commitCount,
        headRefName: pullRequest.headRef,
        headRepositoryId:
          pullRequest.headRepository?.id ?? existing?.headRepositoryId,
        headSha: pullRequest.headSha,
        isCurrent: true,
        mergeSnapshot: pullRequest.merged,
        observedAt: now,
        providerUpdatedAt,
        pullRequestNodeId: pullRequest.nodeId,
      })
      .returning({ id: githubPullRequestVersions.id });
    if (inserted === undefined) {
      throw new Error("The GitHub pull request version could not be stored.");
    }
    versionId = inserted.id;
  } else if (providerUpdatedAt >= version.providerUpdatedAt) {
    if (!version.isCurrent) {
      await transaction
        .update(githubPullRequestVersions)
        .set({ isCurrent: false })
        .where(
          and(
            eq(githubPullRequestVersions.pullRequestNodeId, pullRequest.nodeId),
            eq(githubPullRequestVersions.isCurrent, true)
          )
        );
    }
    await transaction
      .update(githubPullRequestVersions)
      .set({
        baseRefName: pullRequest.baseRef,
        baseRepositoryId: pullRequest.baseRepository.id,
        baseSha: pullRequest.baseSha,
        commitCount: pullRequest.commitCount ?? version.commitCount,
        headRefName: pullRequest.headRef,
        headRepositoryId:
          pullRequest.headRepository?.id ?? version.headRepositoryId,
        isCurrent: true,
        mergeSnapshot: pullRequest.merged,
        observedAt: now,
        providerUpdatedAt,
      })
      .where(eq(githubPullRequestVersions.id, version.id));
  }
  if (versionId === undefined) {
    throw new Error("The GitHub pull request version is unavailable.");
  }
  const membershipRefreshRequired =
    version === undefined || (refreshMembership && !version.membershipComplete);
  if (membershipRefreshRequired && existing !== undefined) {
    await transaction
      .update(githubPullRequests)
      .set({ nextReconcileAt: now })
      .where(
        and(
          eq(githubPullRequests.nodeId, pullRequest.nodeId),
          or(
            isNull(githubPullRequests.nextReconcileAt),
            gt(
              githubPullRequests.nextReconcileAt,
              new Date(now.getTime() + DEFAULT_LEASE_MS)
            )
          )
        )
      );
  }
  if (typeof resolvedMergeSha === "string") {
    await transaction
      .update(githubCommits)
      .set({ canonicalizedAt: null })
      .where(
        and(
          eq(githubCommits.repositoryId, pullRequest.repository.id),
          eq(githubCommits.sha, resolvedMergeSha)
        )
      );
  }
  return {
    baseRepositoryId: pullRequest.repository.id,
    commitRepositoryId:
      pullRequest.headRepository?.id ??
      existing?.headRepositoryId ??
      pullRequest.repository.id,
    membershipRefreshRequired,
    pullRequestNodeId: pullRequest.nodeId,
    retryLifecycleReset,
    versionId,
  };
};

export const persistGitHubPullRequestSnapshot = async (
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  options: {
    reconciliationLeaseUntil?: Date;
    refreshMembership?: boolean;
  } = {},
  now = new Date()
) =>
  await getDatabase().transaction(
    async (transaction) =>
      await persistPullRequestSnapshotInTransaction(
        transaction,
        account,
        pullRequest,
        options.refreshMembership === true,
        true,
        options.reconciliationLeaseUntil ?? null,
        now
      )
  );

export const completeGitHubPullRequestDiscovery = async (
  commit: ClaimedGitHubPullRequestDiscovery,
  pullRequests: readonly GitHubPullRequest[],
  now = new Date()
) =>
  await getDatabase().transaction(async (transaction) => {
    const [locked] = await transaction
      .select({ sha: githubCommits.sha })
      .from(githubCommits)
      .where(
        and(
          commitIdentity(commit),
          eq(githubCommits.pullRequestDiscoveryState, "processing"),
          eq(githubCommits.pullRequestDiscoveryLeaseToken, commit.leaseToken)
        )
      )
      .for("update");
    if (locked === undefined) {
      return false;
    }
    for (const pullRequest of pullRequests) {
      await persistPullRequestSnapshotInTransaction(
        transaction,
        commit.author,
        pullRequest,
        true,
        false,
        null,
        now
      );
    }
    const [completed] = await transaction
      .update(githubCommits)
      .set({
        pullRequestDiscoveryError: null,
        pullRequestDiscoveryLeaseToken: null,
        pullRequestDiscoveryLeaseUntil: null,
        pullRequestDiscoveryState: "complete",
      })
      .where(
        and(
          commitIdentity(commit),
          eq(githubCommits.pullRequestDiscoveryState, "processing"),
          eq(githubCommits.pullRequestDiscoveryLeaseToken, commit.leaseToken)
        )
      )
      .returning({ sha: githubCommits.sha });
    return completed !== undefined;
  });

export const claimDueGitHubPullRequests = async (
  account: TrackedGitHubAccount,
  maximumAgeDays: number,
  limit = 4,
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly DueGitHubPullRequest[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub pull request claim limit is invalid.");
  }
  const reconciliationCutoff = githubPrReconciliationCutoff(
    maximumAgeDays,
    now
  );
  const ageCondition =
    reconciliationCutoff === null
      ? undefined
      : gte(githubPullRequests.createdAt, reconciliationCutoff);
  return await getDatabase().transaction(async (transaction) => {
    const candidates = await transaction
      .select({
        account: githubPullRequests.account,
        attemptCount: githubPullRequests.reconcileAttempts,
        createdAt: githubPullRequests.createdAt,
        lastReconciledAt: githubPullRequests.lastReconciledAt,
        membershipComplete: githubPullRequestVersions.membershipComplete,
        nextReconcileAt: githubPullRequests.nextReconcileAt,
        reconcileError: githubPullRequests.reconcileError,
        nodeId: githubPullRequests.nodeId,
        number: githubPullRequests.number,
        repository: githubRepositories.fullName,
        repositoryId: githubPullRequests.repositoryId,
        state: githubPullRequests.state,
        versionObservedAt: githubPullRequestVersions.observedAt,
      })
      .from(githubPullRequests)
      .innerJoin(
        githubRepositories,
        eq(githubRepositories.id, githubPullRequests.repositoryId)
      )
      .leftJoin(
        githubPullRequestVersions,
        and(
          eq(
            githubPullRequestVersions.pullRequestNodeId,
            githubPullRequests.nodeId
          ),
          eq(githubPullRequestVersions.isCurrent, true)
        )
      )
      .where(
        and(
          eq(githubPullRequests.account, account),
          githubPullRequestInWorkerScope(scope),
          isNotNull(githubPullRequests.nextReconcileAt),
          lte(githubPullRequests.nextReconcileAt, now),
          or(
            and(eq(githubPullRequests.state, "open"), ageCondition),
            inArray(githubPullRequests.state, ["closed", "merged"])
          )
        )
      )
      .orderBy(
        asc(githubPullRequests.nextReconcileAt),
        asc(githubPullRequests.createdAt),
        asc(githubPullRequests.nodeId)
      )
      .limit(limit);
    const claimed: DueGitHubPullRequest[] = [];
    for (const candidate of candidates) {
      if (candidate.nextReconcileAt === null) {
        continue;
      }
      const leaseUntil = new Date(now.getTime() + DEFAULT_LEASE_MS);
      const [updated] = await transaction
        .update(githubPullRequests)
        .set({
          nextReconcileAt: leaseUntil,
          reconcileAttempts: candidate.attemptCount + 1,
          reconcileError: null,
        })
        .where(
          and(
            eq(githubPullRequests.nodeId, candidate.nodeId),
            eq(githubPullRequests.reconcileAttempts, candidate.attemptCount),
            eq(githubPullRequests.nextReconcileAt, candidate.nextReconcileAt)
          )
        )
        .returning({ nodeId: githubPullRequests.nodeId });
      if (updated !== undefined) {
        claimed.push({
          account: candidate.account as TrackedGitHubAccount,
          attemptCount: candidate.attemptCount + 1,
          createdAt: candidate.createdAt,
          lastReconciledAt: candidate.lastReconciledAt,
          leaseUntil,
          membershipComplete: candidate.membershipComplete ?? false,
          nodeId: candidate.nodeId,
          number: candidate.number,
          priorAttemptCount: candidate.attemptCount,
          priorErrorCode: candidate.reconcileError,
          priorRetryAt: candidate.nextReconcileAt,
          repository: candidate.repository,
          repositoryId: candidate.repositoryId,
          versionObservedAt: candidate.versionObservedAt,
        });
      }
    }
    return claimed;
  });
};

export const persistGitHubPullRequestMembership = async (
  stored: StoredPullRequestSnapshot,
  headSha: string,
  commitShas: readonly string[],
  membershipComplete: boolean
) =>
  await getDatabase().transaction(async (transaction) => {
    const [version] = await transaction
      .select({ id: githubPullRequestVersions.id })
      .from(githubPullRequestVersions)
      .where(eq(githubPullRequestVersions.id, stored.versionId))
      .for("update");
    if (version === undefined) {
      return false;
    }
    if (!membershipComplete) {
      await transaction
        .update(githubPullRequestVersions)
        .set({ membershipComplete: false })
        .where(eq(githubPullRequestVersions.id, stored.versionId));
      return false;
    }
    await invalidateGitHubPullRequestDerivedAliases(
      transaction,
      stored.pullRequestNodeId
    );
    await transaction
      .delete(githubPullRequestMemberships)
      .where(eq(githubPullRequestMemberships.versionId, stored.versionId));
    if (commitShas.length > 0) {
      await transaction.insert(githubPullRequestMemberships).values(
        commitShas.map((sha, position) => ({
          commitRepositoryId: stored.commitRepositoryId,
          commitSha: sha,
          isHead: sha === headSha,
          position,
          versionId: stored.versionId,
        }))
      );
    }
    await transaction
      .update(githubPullRequestVersions)
      .set({ membershipComplete: true })
      .where(eq(githubPullRequestVersions.id, stored.versionId));
    if (commitShas.length > 0) {
      await transaction
        .update(githubCommits)
        .set({ canonicalizedAt: null })
        .where(
          and(
            eq(githubCommits.repositoryId, stored.commitRepositoryId),
            inArray(githubCommits.sha, [...new Set(commitShas)])
          )
        );
    }
    return true;
  });

export const completeGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  pullRequest: GitHubPullRequest,
  now = new Date()
) =>
  await getDatabase().transaction(async (transaction) => {
    const state = pullRequestState(pullRequest);
    const [updated] = await transaction
      .update(githubPullRequests)
      .set({
        lastReconciledAt: now,
        nextReconcileAt: nextGitHubPullRequestReconciliationAt(
          state,
          now,
          due.createdAt
        ),
        reconcileAttempts: 0,
        reconcileError: null,
      })
      .where(
        and(
          eq(githubPullRequests.nodeId, due.nodeId),
          eq(githubPullRequests.nextReconcileAt, due.leaseUntil)
        )
      )
      .returning({ nodeId: githubPullRequests.nodeId });
    if (updated === undefined) {
      return false;
    }

    return true;
  });

export const deferGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequests)
    .set({
      nextReconcileAt: dueAt(due.attemptCount, now, retryAt),
      reconcileError: errorCode,
    })
    .where(
      and(
        eq(githubPullRequests.nodeId, due.nodeId),
        eq(githubPullRequests.nextReconcileAt, due.leaseUntil)
      )
    );
};

export const releaseGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest
) => {
  await getDatabase()
    .update(githubPullRequests)
    .set({
      nextReconcileAt: due.priorRetryAt,
      reconcileAttempts: due.priorAttemptCount,
      reconcileError: due.priorErrorCode,
    })
    .where(
      and(
        eq(githubPullRequests.nodeId, due.nodeId),
        eq(githubPullRequests.nextReconcileAt, due.leaseUntil)
      )
    );
};

export const stopGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  errorCode: string,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequests)
    .set({
      lastReconciledAt: now,
      nextReconcileAt: null,
      reconcileError: errorCode,
    })
    .where(
      and(
        eq(githubPullRequests.nodeId, due.nodeId),
        eq(githubPullRequests.nextReconcileAt, due.leaseUntil)
      )
    );
};

const canonicalSourceForPullRequest = async (
  transaction: DatabaseTransaction,
  pullRequestNodeId: string,
  excludedSha: string
) => {
  const [integrationIsMember] = await transaction
    .select({ versionId: githubPullRequestMemberships.versionId })
    .from(githubPullRequestMemberships)
    .innerJoin(
      githubPullRequestVersions,
      eq(githubPullRequestVersions.id, githubPullRequestMemberships.versionId)
    )
    .where(
      and(
        eq(githubPullRequestVersions.pullRequestNodeId, pullRequestNodeId),
        eq(githubPullRequestVersions.isCurrent, true),
        eq(githubPullRequestVersions.mergeSnapshot, true),
        eq(githubPullRequestVersions.membershipComplete, true),
        eq(githubPullRequestMemberships.commitSha, excludedSha)
      )
    )
    .limit(1);
  if (integrationIsMember !== undefined) {
    return { integrationIsMember: true, source: null } as const;
  }
  const [source] = await transaction
    .select({
      publicId: githubPublicActivities.publicId,
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubPullRequestMemberships)
    .innerJoin(
      githubPullRequestVersions,
      eq(githubPullRequestVersions.id, githubPullRequestMemberships.versionId)
    )
    .innerJoin(
      githubCommits,
      and(
        eq(
          githubCommits.repositoryId,
          githubPullRequestMemberships.commitRepositoryId
        ),
        eq(githubCommits.sha, githubPullRequestMemberships.commitSha)
      )
    )
    .innerJoin(githubPublicActivities, commitActivityIdentity)
    .where(
      and(
        eq(githubPullRequestVersions.pullRequestNodeId, pullRequestNodeId),
        eq(githubPullRequestVersions.isCurrent, true),
        eq(githubPullRequestVersions.mergeSnapshot, true),
        eq(githubPullRequestVersions.membershipComplete, true),
        eq(githubCommits.enrichmentState, "complete"),
        isNonMergeCommit,
        ne(githubCommits.sha, excludedSha),
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt)
      )
    )
    .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha));
  return {
    integrationIsMember: false,
    source: source ?? null,
  } as const;
};

const pullRequestMembershipsForCommit = async (
  transaction: DatabaseTransaction,
  repositoryId: string,
  sha: string
) => {
  const rows = await transaction
    .select({
      nodeId: githubPullRequestVersions.pullRequestNodeId,
      versionId: githubPullRequestVersions.id,
    })
    .from(githubPullRequestMemberships)
    .innerJoin(
      githubPullRequestVersions,
      eq(githubPullRequestVersions.id, githubPullRequestMemberships.versionId)
    )
    .where(
      and(
        eq(githubPullRequestMemberships.commitRepositoryId, repositoryId),
        eq(githubPullRequestMemberships.commitSha, sha),
        eq(githubPullRequestVersions.membershipComplete, true)
      )
    );
  const memberships = new Map<string, Set<string>>();
  for (const { nodeId, versionId } of rows) {
    const versions = memberships.get(nodeId) ?? new Set<string>();
    versions.add(versionId);
    memberships.set(nodeId, versions);
  }
  return memberships;
};

const setCanonicalAlias = async (
  transaction: DatabaseTransaction,
  candidatePublicId: string,
  canonicalPublicId: string,
  reason: string,
  evidence: Readonly<Record<string, unknown>>,
  now: Date
) => {
  const [updated] = await transaction
    .update(githubPublicActivities)
    .set({
      aliasEvidence: evidence,
      aliasReason: reason,
      canonicalPublicId,
      hiddenAt: now,
    })
    .where(
      and(
        eq(githubPublicActivities.publicId, candidatePublicId),
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt)
      )
    )
    .returning({ publicId: githubPublicActivities.publicId });
  if (updated === undefined) {
    return false;
  }
  await transaction
    .update(githubSummaryAttempts)
    .set({
      completedAt: now,
      errorCode: "canonical_alias",
      leaseToken: null,
      leaseUntil: null,
      state: "indeterminate",
    })
    .where(
      and(
        eq(githubSummaryAttempts.activityPublicId, candidatePublicId),
        inArray(githubSummaryAttempts.state, ["pending", "processing"])
      )
    );
  return true;
};

const publishCompletedSummaryForCommit = async (
  transaction: DatabaseTransaction,
  repositoryId: string,
  sha: string,
  now: Date
) => {
  const [ready] = await transaction
    .select({ publicId: githubPublicActivities.publicId })
    .from(githubCommits)
    .innerJoin(githubPublicActivities, commitActivityIdentity)
    .innerJoin(
      githubSummaryAttempts,
      and(
        eq(
          githubSummaryAttempts.activityPublicId,
          githubPublicActivities.publicId
        ),
        eq(githubSummaryAttempts.revision, githubPublicActivities.revision),
        eq(githubSummaryAttempts.state, "complete")
      )
    )
    .where(
      and(
        eq(githubCommits.repositoryId, repositoryId),
        eq(githubCommits.sha, sha),
        isNotNull(githubCommits.canonicalizedAt),
        isNonMergeCommit,
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt)
      )
    )
    .limit(1);
  if (ready !== undefined) {
    await transaction
      .update(githubPublicActivities)
      .set({ publishedAt: now })
      .where(
        and(
          eq(githubPublicActivities.publicId, ready.publicId),
          isNull(githubPublicActivities.publishedAt)
        )
      );
  }
};

const markGitHubCommitCanonicalized = async (
  transaction: DatabaseTransaction,
  repositoryId: string,
  sha: string,
  now: Date
) => {
  await transaction
    .update(githubCommits)
    .set({ canonicalizedAt: now })
    .where(
      and(
        eq(githubCommits.repositoryId, repositoryId),
        eq(githubCommits.sha, sha)
      )
    );
  await publishCompletedSummaryForCommit(transaction, repositoryId, sha, now);
};

export const canonicalizeGitHubCommitActivity = async (
  repositoryId: string,
  sha: string,
  now = new Date()
) =>
  // oxlint-disable-next-line complexity -- Evidence classes deliberately fail open independently.
  await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${repositoryId}, 0))`
    );
    const [candidate] = await transaction
      .select({
        changeFingerprint: githubCommits.changeFingerprint,
        committerAt: githubCommits.committerAt,
        fingerprintComplete: githubCommits.fingerprintComplete,
        firstObservedAt: githubCommits.firstObservedAt,
        fullMessage: githubCommits.fullMessage,
        parentShas: githubCommits.parentShas,
        publicId: githubPublicActivities.publicId,
      })
      .from(githubCommits)
      .innerJoin(githubPublicActivities, commitActivityIdentity)
      .where(
        and(
          eq(githubCommits.repositoryId, repositoryId),
          eq(githubCommits.sha, sha),
          eq(githubCommits.enrichmentState, "complete"),
          inArray(githubCommits.pullRequestDiscoveryState, [
            "complete",
            "unavailable",
          ]),
          isNull(githubPublicActivities.canonicalPublicId),
          isNull(githubPublicActivities.hiddenAt)
        )
      )
      .for("update");
    if (candidate === undefined) {
      return { aliased: false, aliases: 0, publicId: null };
    }

    const mergePullRequests = await transaction
      .select({ nodeId: githubPullRequests.nodeId })
      .from(githubPullRequests)
      .where(
        and(
          eq(githubPullRequests.repositoryId, repositoryId),
          eq(githubPullRequests.mergeSha, sha),
          isNotNull(githubPullRequests.mergeShaVerifiedAt),
          eq(githubPullRequests.state, "merged")
        )
      )
      .orderBy(
        asc(githubPullRequests.createdAt),
        asc(githubPullRequests.nodeId)
      );
    for (const pullRequest of mergePullRequests) {
      const mergeEvidence = await canonicalSourceForPullRequest(
        transaction,
        pullRequest.nodeId,
        sha
      );
      if (mergeEvidence.integrationIsMember) {
        await markGitHubCommitCanonicalized(
          transaction,
          repositoryId,
          sha,
          now
        );
        return { aliased: false, aliases: 0, publicId: candidate.publicId };
      }
      if (mergeEvidence.source !== null) {
        const { source } = mergeEvidence;
        const parentCount = candidate.parentShas?.length ?? 0;
        const reason = parentCount > 1 ? "regular_merge" : "squash_merge";
        const aliased = await setCanonicalAlias(
          transaction,
          candidate.publicId,
          source.publicId,
          reason,
          {
            membershipComplete: true,
            mergeSha: sha,
            pullRequestNodeId: pullRequest.nodeId,
            sourceSha: source.sha,
          },
          now
        );
        await markGitHubCommitCanonicalized(
          transaction,
          repositoryId,
          sha,
          now
        );
        return {
          aliased,
          aliases: aliased ? 1 : 0,
          publicId: candidate.publicId,
        };
      }
    }

    if (
      !candidate.fingerprintComplete ||
      candidate.changeFingerprint === null
    ) {
      await markGitHubCommitCanonicalized(transaction, repositoryId, sha, now);
      return { aliased: false, aliases: 0, publicId: candidate.publicId };
    }
    const copies = await transaction
      .select({
        canonicalPublicId: githubPublicActivities.canonicalPublicId,
        committerAt: githubCommits.committerAt,
        firstObservedAt: githubCommits.firstObservedAt,
        publicId: githubPublicActivities.publicId,
        sha: githubCommits.sha,
      })
      .from(githubCommits)
      .innerJoin(githubPublicActivities, commitActivityIdentity)
      .where(
        and(
          eq(githubCommits.repositoryId, repositoryId),
          eq(githubCommits.changeFingerprint, candidate.changeFingerprint),
          eq(githubCommits.fingerprintComplete, true),
          eq(githubCommits.enrichmentState, "complete"),
          isNonMergeCommit,
          or(
            isNull(githubPublicActivities.hiddenAt),
            isNotNull(githubPublicActivities.canonicalPublicId)
          ),
          or(
            isNull(githubPublicActivities.canonicalPublicId),
            sql<boolean>`EXISTS (
              SELECT 1
              FROM ${githubPublicActivities} AS canonical_activity
              INNER JOIN ${githubCommits} AS canonical_commit
                ON canonical_commit.activity_public_id = canonical_activity.public_id
                AND canonical_commit.repository_id = canonical_activity.repository_id
                AND canonical_commit.sha = canonical_activity.source_node_id
              WHERE canonical_activity.public_id = ${githubPublicActivities.canonicalPublicId}
                AND canonical_activity.kind = 'commit'
                AND canonical_activity.canonical_public_id IS NULL
                AND canonical_activity.hidden_at IS NULL
                AND canonical_commit.parent_shas IS NOT NULL
                AND jsonb_array_length(canonical_commit.parent_shas) <= 1
            )`
          )
        )
      )
      .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha));
    const cherryPickSource =
      /^\(cherry picked from commit ([a-f0-9]{40})\)\r?$/imu.exec(
        candidate.fullMessage ?? ""
      )?.[1];
    const candidatePullRequests = await pullRequestMembershipsForCommit(
      transaction,
      repositoryId,
      sha
    );
    for (const copy of copies) {
      if (copy.sha === sha) {
        continue;
      }
      const canonicalPublicId = copy.canonicalPublicId ?? copy.publicId;
      if (canonicalPublicId === candidate.publicId) {
        continue;
      }
      const explicitCherryPick = copy.sha === cherryPickSource;
      const directMergeParent =
        (candidate.parentShas?.length ?? 0) > 1 &&
        candidate.parentShas?.includes(copy.sha) === true;
      const candidateOrder =
        candidate.committerAt?.getTime() ?? candidate.firstObservedAt.getTime();
      const copyOrder =
        copy.committerAt?.getTime() ?? copy.firstObservedAt.getTime();
      if (
        !explicitCherryPick &&
        !directMergeParent &&
        (copyOrder > candidateOrder ||
          (copyOrder === candidateOrder &&
            (copy.firstObservedAt > candidate.firstObservedAt ||
              (copy.firstObservedAt.getTime() ===
                candidate.firstObservedAt.getTime() &&
                copy.sha > sha))))
      ) {
        continue;
      }
      const copyPullRequests = await pullRequestMembershipsForCommit(
        transaction,
        repositoryId,
        copy.sha
      );
      const sharedPullRequest = [...candidatePullRequests].find(
        ([nodeId, candidateVersions]) => {
          const copyVersions = copyPullRequests.get(nodeId);
          return (
            copyVersions !== undefined &&
            [...candidateVersions].every(
              (versionId) => !copyVersions.has(versionId)
            )
          );
        }
      )?.[0];
      if (
        !explicitCherryPick &&
        !directMergeParent &&
        sharedPullRequest === undefined
      ) {
        continue;
      }
      const reason = directMergeParent
        ? "direct_parent_merge"
        : explicitCherryPick
          ? "cherry_pick"
          : "pr_history_exact_copy";
      const aliased = await setCanonicalAlias(
        transaction,
        candidate.publicId,
        canonicalPublicId,
        reason,
        {
          fingerprint: candidate.changeFingerprint,
          fingerprintComplete: true,
          directMergeParent,
          pullRequestNodeId: sharedPullRequest ?? null,
          sourceSha: copy.sha,
        },
        now
      );
      await markGitHubCommitCanonicalized(transaction, repositoryId, sha, now);
      return {
        aliased,
        aliases: aliased ? 1 : 0,
        publicId: candidate.publicId,
      };
    }
    await markGitHubCommitCanonicalized(transaction, repositoryId, sha, now);
    return { aliased: false, aliases: 0, publicId: candidate.publicId };
  });

export const canonicalizePendingGitHubActivities = async (
  limit = 8,
  now = new Date(),
  activeAccounts: readonly TrackedGitHubAccount[] = TRACKED_GITHUB_ACCOUNTS,
  scope?: GitHubActivityWorkerScope
) => {
  if (activeAccounts.length === 0) {
    return 0;
  }
  const candidates = await getDatabase()
    .select({
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .innerJoin(githubPublicActivities, commitActivityIdentity)
    .where(
      and(
        inArray(githubCommits.author, [...activeAccounts]),
        githubCommitInWorkerScope(scope),
        eq(githubCommits.enrichmentState, "complete"),
        inArray(githubCommits.pullRequestDiscoveryState, [
          "complete",
          "unavailable",
        ]),
        isNull(githubCommits.canonicalizedAt),
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt)
      )
    )
    .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha))
    .limit(limit);
  let aliased = 0;
  for (const candidate of candidates) {
    const result = await canonicalizeGitHubCommitActivity(
      candidate.repositoryId,
      candidate.sha,
      now
    );
    aliased += result.aliases;
  }
  return aliased;
};

export const ensureGitHubSummaryAttempt = async (
  activityPublicId: string,
  now = new Date()
) =>
  await getDatabase().transaction(async (transaction) => {
    const [activity] = await transaction
      .select({
        publicId: githubPublicActivities.publicId,
        revision: githubPublicActivities.revision,
      })
      .from(githubPublicActivities)
      .innerJoin(githubCommits, commitActivityIdentity)
      .where(
        and(
          eq(githubPublicActivities.publicId, activityPublicId),
          isNull(githubPublicActivities.canonicalPublicId),
          isNull(githubPublicActivities.hiddenAt),
          isNonMergeCommit
        )
      )
      .limit(1);
    if (activity === undefined) {
      return false;
    }
    const [inserted] = await transaction
      .insert(githubSummaryAttempts)
      .values({
        activityPublicId,
        createdAt: now,
        recipe: PUBLIC_COMMIT_SUMMARY_RECIPE,
        revision: activity.revision,
      })
      .onConflictDoNothing({
        target: [
          githubSummaryAttempts.activityPublicId,
          githubSummaryAttempts.revision,
        ],
      })
      .returning({ activityPublicId: githubSummaryAttempts.activityPublicId });
    return inserted !== undefined;
  });

export const ensureMissingGitHubSummaryAttempts = async (
  limit = 50,
  now = new Date(),
  activeAccounts: readonly TrackedGitHubAccount[] = TRACKED_GITHUB_ACCOUNTS,
  scope?: GitHubActivityWorkerScope
) => {
  if (activeAccounts.length === 0) {
    return 0;
  }
  const rows = await getDatabase()
    .select({ publicId: githubPublicActivities.publicId })
    .from(githubPublicActivities)
    .innerJoin(githubCommits, commitActivityIdentity)
    .leftJoin(
      githubSummaryAttempts,
      and(
        eq(
          githubSummaryAttempts.activityPublicId,
          githubPublicActivities.publicId
        ),
        eq(githubSummaryAttempts.revision, githubPublicActivities.revision)
      )
    )
    .where(
      and(
        eq(githubPublicActivities.kind, "commit"),
        inArray(githubCommits.author, [...activeAccounts]),
        githubCommitInWorkerScope(scope),
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt),
        isNull(githubSummaryAttempts.activityPublicId),
        eq(githubCommits.enrichmentState, "complete"),
        isNotNull(githubCommits.canonicalizedAt),
        isNonMergeCommit
      )
    )
    .orderBy(asc(githubCommits.firstObservedAt), asc(githubCommits.sha))
    .limit(limit);
  let inserted = 0;
  for (const { publicId } of rows) {
    if (await ensureGitHubSummaryAttempt(publicId, now)) {
      inserted += 1;
    }
  }
  return inserted;
};

export const claimGitHubSummaryAttempts = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date(),
  scope?: GitHubActivityWorkerScope
): Promise<readonly ClaimedGitHubSummary[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new RangeError("The GitHub summary claim limit is invalid.");
  }
  if (activeAccounts.length === 0) {
    return [];
  }
  return await getDatabase().transaction(async (transaction) => {
    await transaction
      .update(githubSummaryAttempts)
      .set({
        errorCode: "lease_expired",
        leaseToken: null,
        leaseUntil: null,
        state: "pending",
      })
      .where(
        and(
          eq(githubSummaryAttempts.state, "processing"),
          lte(githubSummaryAttempts.leaseUntil, now)
        )
      );
    const candidates = await transaction
      .select({
        activityPublicId: githubSummaryAttempts.activityPublicId,
        attemptCount: githubSummaryAttempts.attemptCount,
        attemptedAt: githubSummaryAttempts.attemptedAt,
        author: githubCommits.author,
        committedAt: githubCommits.committedAt,
        errorCode: githubSummaryAttempts.errorCode,
        leaseUntil: githubSummaryAttempts.leaseUntil,
        message: githubCommits.message,
        repository: githubCommits.repository,
        repositoryId: githubCommits.repositoryId,
        revision: githubSummaryAttempts.revision,
        sha: githubCommits.sha,
      })
      .from(githubSummaryAttempts)
      .innerJoin(
        githubPublicActivities,
        and(
          eq(
            githubPublicActivities.publicId,
            githubSummaryAttempts.activityPublicId
          ),
          eq(githubPublicActivities.revision, githubSummaryAttempts.revision)
        )
      )
      .innerJoin(githubCommits, commitActivityIdentity)
      .where(
        and(
          eq(githubSummaryAttempts.state, "pending"),
          or(
            isNull(githubSummaryAttempts.leaseUntil),
            lte(githubSummaryAttempts.leaseUntil, now)
          ),
          eq(githubPublicActivities.kind, "commit"),
          isNull(githubPublicActivities.canonicalPublicId),
          isNull(githubPublicActivities.hiddenAt),
          inArray(githubCommits.author, [...activeAccounts]),
          githubCommitInWorkerScope(scope),
          eq(githubCommits.enrichmentState, "complete"),
          isNotNull(githubCommits.canonicalizedAt),
          isNonMergeCommit
        )
      )
      .orderBy(
        asc(githubSummaryAttempts.createdAt),
        asc(githubSummaryAttempts.activityPublicId)
      )
      .limit(limit);
    const claimed: ClaimedGitHubSummary[] = [];
    for (const candidate of candidates) {
      const author = trackedGitHubAccountFrom(candidate.author);
      if (author === null || !isActiveAccount(author, activeAccounts)) {
        continue;
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubSummaryAttempts)
        .set({
          attemptCount: candidate.attemptCount + 1,
          attemptedAt: now,
          errorCode: null,
          leaseToken,
          leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
          state: "processing",
        })
        .where(
          and(
            eq(
              githubSummaryAttempts.activityPublicId,
              candidate.activityPublicId
            ),
            eq(githubSummaryAttempts.revision, candidate.revision),
            eq(githubSummaryAttempts.state, "pending")
          )
        )
        .returning({
          activityPublicId: githubSummaryAttempts.activityPublicId,
        });
      if (updated !== undefined) {
        claimed.push({
          activityPublicId: candidate.activityPublicId,
          attemptCount: candidate.attemptCount + 1,
          author,
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
          priorAttemptCount: candidate.attemptCount,
          priorAttemptedAt: candidate.attemptedAt,
          priorErrorCode: candidate.errorCode,
          priorRetryAt: candidate.leaseUntil,
          repository: candidate.repository,
          repositoryId: candidate.repositoryId,
          revision: candidate.revision,
          sha: candidate.sha,
        });
      }
    }
    return claimed;
  });
};

export interface CompletedGitHubSummary {
  headline: string;
  inputHash: string;
  model: string;
  recipe: string;
  short: string;
}

export const completeGitHubSummaryAttempt = async (
  attempt: ClaimedGitHubSummary,
  summary: CompletedGitHubSummary,
  now = new Date()
) =>
  await getDatabase().transaction(async (transaction) => {
    const [activity] = await transaction
      .select({
        canonicalPublicId: githubPublicActivities.canonicalPublicId,
        canonicalizedAt: githubCommits.canonicalizedAt,
        hiddenAt: githubPublicActivities.hiddenAt,
        publicId: githubPublicActivities.publicId,
        revision: githubPublicActivities.revision,
      })
      .from(githubPublicActivities)
      .innerJoin(githubCommits, commitActivityIdentity)
      .where(
        and(
          eq(githubPublicActivities.publicId, attempt.activityPublicId),
          eq(githubPublicActivities.revision, attempt.revision),
          eq(githubPublicActivities.kind, "commit"),
          isNonMergeCommit
        )
      )
      .for("update");
    const [updated] = await transaction
      .update(githubSummaryAttempts)
      .set({
        completedAt: now,
        errorCode: null,
        inputHash: summary.inputHash,
        leaseToken: null,
        leaseUntil: null,
        model: summary.model,
        recipe: summary.recipe,
        state: "complete",
        summaryHeadline: summary.headline,
        summaryShort: summary.short,
      })
      .where(
        and(
          eq(githubSummaryAttempts.activityPublicId, attempt.activityPublicId),
          eq(githubSummaryAttempts.revision, attempt.revision),
          eq(githubSummaryAttempts.state, "processing"),
          eq(githubSummaryAttempts.leaseToken, attempt.leaseToken)
        )
      )
      .returning({ activityPublicId: githubSummaryAttempts.activityPublicId });
    if (updated === undefined) {
      return false;
    }
    if (
      activity !== undefined &&
      githubSummaryCanPublish({
        activityRevision: activity.revision,
        attemptRevision: attempt.revision,
        canonicalized: activity.canonicalizedAt !== null,
        canonicalPublicId: activity.canonicalPublicId,
        hidden: activity.hiddenAt !== null,
      })
    ) {
      await transaction
        .update(githubPublicActivities)
        .set({ publishedAt: now })
        .where(
          and(
            eq(githubPublicActivities.publicId, attempt.activityPublicId),
            isNull(githubPublicActivities.publishedAt)
          )
        );
    }
    return true;
  });

export const deferGitHubSummaryAttempt = async (
  attempt: ClaimedGitHubSummary,
  errorCode: string,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubSummaryAttempts)
    .set({
      errorCode,
      leaseToken: null,
      leaseUntil: dueAt(attempt.attemptCount, now, retryAt),
      state: "pending",
    })
    .where(
      and(
        eq(githubSummaryAttempts.activityPublicId, attempt.activityPublicId),
        eq(githubSummaryAttempts.revision, attempt.revision),
        eq(githubSummaryAttempts.state, "processing"),
        eq(githubSummaryAttempts.leaseToken, attempt.leaseToken)
      )
    );
};

export const markGitHubSummaryAttemptIndeterminate = async (
  attempt: ClaimedGitHubSummary,
  errorCode: string
) => {
  await getDatabase()
    .update(githubSummaryAttempts)
    .set({
      errorCode,
      leaseToken: null,
      leaseUntil: null,
      state: "indeterminate",
    })
    .where(
      and(
        eq(githubSummaryAttempts.activityPublicId, attempt.activityPublicId),
        eq(githubSummaryAttempts.revision, attempt.revision),
        eq(githubSummaryAttempts.state, "processing"),
        eq(githubSummaryAttempts.leaseToken, attempt.leaseToken)
      )
    );
};

export const releaseGitHubSummaryAttempt = async (
  attempt: ClaimedGitHubSummary
) => {
  await getDatabase()
    .update(githubSummaryAttempts)
    .set({
      attemptCount: attempt.priorAttemptCount,
      attemptedAt: attempt.priorAttemptedAt,
      errorCode: attempt.priorErrorCode,
      leaseToken: null,
      leaseUntil: attempt.priorRetryAt,
      state: "pending",
    })
    .where(
      and(
        eq(githubSummaryAttempts.activityPublicId, attempt.activityPublicId),
        eq(githubSummaryAttempts.revision, attempt.revision),
        eq(githubSummaryAttempts.state, "processing"),
        eq(githubSummaryAttempts.leaseToken, attempt.leaseToken)
      )
    );
};
