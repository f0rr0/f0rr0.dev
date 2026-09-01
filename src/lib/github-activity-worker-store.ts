import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountCheckpoints,
  githubCommitPullRequestAssociations,
  githubCommits,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestSignals,
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
} from "@/db/schema";
import type {
  GitHubActivityCommitReference,
  GitHubActivityCommitSource,
  GitHubActivityPushObservationSource,
} from "@/lib/github-activity-processor";
import { validateGitHubPushObservationCommitShas } from "@/lib/github-activity-processor";
import {
  githubActivityRetryAt,
  githubPrReconciliationCutoff,
  nextGitHubPullRequestReconciliationAt,
} from "@/lib/github-activity-worker-core";
import { githubWorkUnitFileFactsFrom } from "@/lib/github-change-evidence";
import type { GitHubFileChangeEvidence } from "@/lib/github-change-evidence";
import { trackedGitHubAccountFrom } from "@/lib/github-commits-core";
import type {
  GitHubPullRequest,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import {
  githubPullRequestStateFrom,
  persistPullRequestSnapshotInTransaction,
} from "@/lib/github-pull-request-store";
import type { StoredPullRequestSnapshot } from "@/lib/github-pull-request-store";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

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
        historySinceAt:
          sql`coalesce(${githubPushObservations.historySinceAt}, ${githubAccountCheckpoints.refBackfillSinceAt})`.mapWith(
            githubAccountCheckpoints.refBackfillSinceAt
          ),
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
        desc(githubPushObservations.observedAt),
        asc(githubPushObservations.leaseUntil),
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
      .orderBy(
        desc(githubCommits.firstObservedAt),
        desc(githubCommits.committedAt),
        asc(githubCommits.sha)
      )
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
      factsVerifiedAt: now,
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
        factsVerifiedAt: now,
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
  now = new Date()
): Promise<boolean> =>
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
      return false;
    }
    await persistRepositoryEvidence(
      transaction,
      source,
      commit.repositoryId,
      now
    );
    const fileFacts = githubWorkUnitFileFactsFrom(source.commit.files);
    await transaction
      .update(githubCommits)
      .set({
        additions: source.commit.stats.additions,
        authoredAt: new Date(source.authoredAt),
        authorUserId: source.authorUserId,
        changedFiles: source.commit.files.length,
        committerAt: new Date(source.committerAt),
        committerUserId: source.committerUserId,
        committedAt: new Date(source.committerAt),
        deletions: source.commit.stats.deletions,
        enrichmentError: null,
        enrichmentLeaseToken: null,
        enrichmentLeaseUntil: null,
        enrichmentState: "complete",
        fileFacts,
        fileFactsComplete: !source.commit.providerFileCapReached,
        message: source.commit.message,
        parentShas: source.commit.parents,
        providerFileCapReached: source.commit.providerFileCapReached,
        repository: source.repository.fullName,
        repositoryOwnerAvatarUrl: source.repository.avatarUrl,
        repositoryOwnerLogin: source.repository.ownerLogin,
        repositoryOwnerType: source.repository.ownerType,
        repositoryPrivate: source.repository.private,
      })
      .where(
        and(
          commitIdentity(commit),
          eq(githubCommits.enrichmentState, "processing"),
          eq(githubCommits.enrichmentLeaseToken, commit.leaseToken)
        )
      );
    return true;
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
      .orderBy(
        desc(githubCommits.firstObservedAt),
        desc(githubCommits.committedAt),
        asc(githubCommits.sha)
      )
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
        desc(githubPullRequestSignals.observedAt),
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
        {
          authority: "authoritative",
          reconciliationLeaseUntil: options.reconciliationLeaseUntil,
          refreshMembership: options.refreshMembership === true,
        },
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
        { authority: "observed", refreshMembership: true },
        now
      );
    }
    await transaction
      .delete(githubCommitPullRequestAssociations)
      .where(
        and(
          eq(
            githubCommitPullRequestAssociations.commitRepositoryId,
            commit.repositoryId
          ),
          eq(githubCommitPullRequestAssociations.commitSha, commit.sha)
        )
      );
    const associatedPullRequestNodeIds = [
      ...new Set(pullRequests.map(({ nodeId }) => nodeId)),
    ];
    if (associatedPullRequestNodeIds.length > 0) {
      await transaction.insert(githubCommitPullRequestAssociations).values(
        associatedPullRequestNodeIds.map((pullRequestNodeId) => ({
          commitRepositoryId: commit.repositoryId,
          commitSha: commit.sha,
          pullRequestNodeId,
        }))
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
        desc(githubPullRequests.providerUpdatedAt),
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
            lte(githubPullRequests.nextReconcileAt, now)
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
      .select({
        commitCount: githubPullRequestVersions.commitCount,
        headSha: githubPullRequestVersions.headSha,
        id: githubPullRequestVersions.id,
      })
      .from(githubPullRequestVersions)
      .where(eq(githubPullRequestVersions.id, stored.versionId))
      .for("update");
    if (version === undefined) {
      return false;
    }
    const completeMembershipIsValid =
      membershipComplete &&
      version.commitCount !== null &&
      commitShas.length === version.commitCount &&
      new Set(commitShas).size === commitShas.length &&
      headSha === version.headSha &&
      (version.commitCount === 0 || commitShas.at(-1) === version.headSha);
    if (!completeMembershipIsValid) {
      await transaction
        .update(githubPullRequestVersions)
        .set({ membershipComplete: false })
        .where(eq(githubPullRequestVersions.id, stored.versionId));
      return false;
    }
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
    return true;
  });

export const persistGitHubPullRequestDiff = async (
  stored: StoredPullRequestSnapshot,
  expectedBaseSha: string,
  expectedHeadSha: string,
  files: readonly GitHubFileChangeEvidence[]
) => {
  if (
    stored.expectedChangedFiles === null ||
    files.length !== stored.expectedChangedFiles
  ) {
    return false;
  }
  const fileFacts = githubWorkUnitFileFactsFrom(files);
  return await getDatabase().transaction(async (transaction) => {
    const [version] = await transaction
      .select({
        baseSha: githubPullRequestVersions.baseSha,
        headSha: githubPullRequestVersions.headSha,
        isCurrent: githubPullRequestVersions.isCurrent,
        pullRequestNodeId: githubPullRequestVersions.pullRequestNodeId,
      })
      .from(githubPullRequestVersions)
      .where(eq(githubPullRequestVersions.id, stored.versionId))
      .for("update");
    if (
      version === undefined ||
      !version.isCurrent ||
      version.pullRequestNodeId !== stored.pullRequestNodeId ||
      version.baseSha !== expectedBaseSha ||
      version.headSha !== expectedHeadSha
    ) {
      return false;
    }
    const [updated] = await transaction
      .update(githubPullRequestVersions)
      .set({ fileFacts, fileFactsComplete: true })
      .where(
        and(
          eq(githubPullRequestVersions.id, stored.versionId),
          eq(githubPullRequestVersions.baseSha, expectedBaseSha),
          eq(githubPullRequestVersions.headSha, expectedHeadSha),
          eq(githubPullRequestVersions.isCurrent, true)
        )
      )
      .returning({ id: githubPullRequestVersions.id });
    return updated !== undefined;
  });
};

export const completeGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  pullRequest: GitHubPullRequest,
  now = new Date()
) =>
  await getDatabase().transaction(async (transaction) => {
    const state = githubPullRequestStateFrom(pullRequest);
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
