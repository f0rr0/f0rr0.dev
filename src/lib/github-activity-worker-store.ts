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
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubSummaryAttempts,
} from "@/db/schema";
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
  githubPullRequestSnapshotDisposition,
  githubPrReconciliationCutoff,
  githubSummaryCanPublish,
  nextGitHubPullRequestReconciliationAt,
} from "@/lib/github-activity-worker-core";
import type { GitHubExactDiffDigest } from "@/lib/github-activity-worker-core";
import { trackedGitHubAccountFrom } from "@/lib/github-commits-core";
import type {
  GitHubPullRequest,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_DEFER_MS = 15 * 60 * 1000;
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

const dueAt = (now: Date, requested: Date | null = null) =>
  requested !== null && requested > now
    ? requested
    : new Date(now.getTime() + DEFAULT_DEFER_MS);

export interface ClaimedGitHubPushObservation {
  account: TrackedGitHubAccount;
  afterSha: string;
  beforeSha: string;
  expectedCommitCount: number | null;
  historySinceAt: Date;
  historyUntilAt: Date | null;
  id: string;
  knownShas: readonly string[];
  leaseToken: string;
  observedAt: Date;
  refName: string;
  repository: string;
  repositoryId: string;
}

export interface ClaimedGitHubCommit extends GitHubActivityCommitReference {
  leaseToken: string;
}

export interface ClaimedGitHubPullRequestDiscovery extends GitHubActivityCommitReference {
  leaseToken: string;
}

export interface HydratedGitHubCommit {
  activityPublicId: string;
  revision: number;
}

export interface StoredPullRequestSnapshot {
  commitRepositoryId: string;
  membershipRefreshRequired: boolean;
  pullRequestNodeId: string;
  versionId: string;
}

export interface DueGitHubPullRequest {
  account: TrackedGitHubAccount;
  lastReconciledAt: Date | null;
  leaseUntil: Date;
  membershipComplete: boolean;
  nodeId: string;
  number: number;
  repository: string;
  repositoryId: string;
  versionObservedAt: Date | null;
}

export interface ClaimedGitHubSummary extends GitHubActivityCommitReference {
  activityPublicId: string;
  leaseToken: string;
  revision: number;
}

const isActiveAccount = (
  account: string,
  activeAccounts: readonly TrackedGitHubAccount[]
): account is TrackedGitHubAccount =>
  activeAccounts.some((candidate) => candidate === account);

export const claimGitHubPushObservations = async (
  limit: number,
  activeAccounts: readonly TrackedGitHubAccount[],
  now = new Date()
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
        beforeSha: githubPushObservations.beforeSha,
        expectedCommitCount: githubPushObservations.expectedCommitCount,
        historySinceAt: sql<Date>`coalesce(${githubPushObservations.historySinceAt}, ${githubAccountCheckpoints.refBackfillSinceAt})`,
        historyUntilAt: githubPushObservations.historyUntilAt,
        id: githubPushObservations.id,
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
          errorCode: null,
          leaseToken,
          leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
          state: "processing",
        })
        .where(
          and(
            observationIdentity(candidate),
            eq(githubPushObservations.state, candidate.state),
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
        ...candidate,
        account: candidate.account,
        knownShas: known.map(({ sha }) => sha),
        leaseToken,
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
      leaseUntil: dueAt(now, retryAt),
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
  now = new Date()
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
        committedAt: githubCommits.committedAt,
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
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
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
      enrichmentLeaseUntil: dueAt(now, retryAt),
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
  now = new Date()
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
        committedAt: githubCommits.committedAt,
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
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
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
      pullRequestDiscoveryLeaseUntil: dueAt(now, retryAt),
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
      nextReconcileAt: githubPullRequests.nextReconcileAt,
      nodeId: githubPullRequests.nodeId,
      providerUpdatedAt: githubPullRequests.providerUpdatedAt,
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
    mergeSha: pullRequest.mergeCommitSha,
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
      .set(mutableUpdate)
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
          ? mutableUpdate
          : {
              additions: pullRequest.additions ?? existing.additions,
              changedFiles: pullRequest.changedFiles ?? existing.changedFiles,
              commitCount: pullRequest.commitCount ?? existing.commitCount,
              deletions: pullRequest.deletions ?? existing.deletions,
              headRepositoryId:
                pullRequest.headRepository?.id ?? existing.headRepositoryId,
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
  if (pullRequest.mergeCommitSha !== null) {
    await transaction
      .update(githubCommits)
      .set({ canonicalizedAt: null })
      .where(
        and(
          eq(githubCommits.repositoryId, pullRequest.repository.id),
          eq(githubCommits.sha, pullRequest.mergeCommitSha)
        )
      );
  }
  return {
    commitRepositoryId:
      pullRequest.headRepository?.id ??
      existing?.headRepositoryId ??
      pullRequest.repository.id,
    membershipRefreshRequired,
    pullRequestNodeId: pullRequest.nodeId,
    versionId,
  };
};

export const persistGitHubPullRequestSnapshot = async (
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  options: { refreshMembership?: boolean } = {},
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
  limit = 25,
  now = new Date()
): Promise<readonly DueGitHubPullRequest[]> => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
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
        lastReconciledAt: githubPullRequests.lastReconciledAt,
        membershipComplete: githubPullRequestVersions.membershipComplete,
        nextReconcileAt: githubPullRequests.nextReconcileAt,
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
        .set({ nextReconcileAt: leaseUntil })
        .where(
          and(
            eq(githubPullRequests.nodeId, candidate.nodeId),
            eq(githubPullRequests.nextReconcileAt, candidate.nextReconcileAt)
          )
        )
        .returning({ nodeId: githubPullRequests.nodeId });
      if (updated !== undefined) {
        claimed.push({
          account: candidate.account as TrackedGitHubAccount,
          lastReconciledAt: candidate.lastReconciledAt,
          leaseUntil,
          membershipComplete: candidate.membershipComplete ?? false,
          nodeId: candidate.nodeId,
          number: candidate.number,
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
        nextReconcileAt: nextGitHubPullRequestReconciliationAt(state, now),
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

    if (
      state === "merged" &&
      pullRequest.mergedAt !== null &&
      trackedGitHubAccountFrom(pullRequest.author) !== null
    ) {
      await transaction
        .insert(githubPublicActivities)
        .values({
          kind: "pull_request",
          occurredAt: new Date(pullRequest.mergedAt),
          publishedAt: now,
          repositoryId: pullRequest.repository.id,
          sourceNodeId: pullRequest.nodeId,
        })
        .onConflictDoNothing({
          target: [
            githubPublicActivities.kind,
            githubPublicActivities.repositoryId,
            githubPublicActivities.sourceNodeId,
          ],
        });
    }
    return true;
  });

export const deferGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  retryAt: Date | null,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequests)
    .set({ nextReconcileAt: dueAt(now, retryAt) })
    .where(
      and(
        eq(githubPullRequests.nodeId, due.nodeId),
        eq(githubPullRequests.nextReconcileAt, due.leaseUntil)
      )
    );
};

export const stopGitHubPullRequestReconciliation = async (
  due: DueGitHubPullRequest,
  now = new Date()
) => {
  await getDatabase()
    .update(githubPullRequests)
    .set({ lastReconciledAt: now, nextReconcileAt: null })
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

const comparableCommitHeadline = (message: string | null) => {
  const headline = message?.split("\n", 1)[0]?.trim();
  if (headline === undefined || headline.length === 0) {
    return null;
  }
  return headline.replace(/\s+\(#[1-9]\d*\)$/u, "");
};

interface AuthoredRewriteCandidate {
  authoredAt: Date | null;
  authorUserId: string | null;
  committedAt: Date;
  committerAt: Date | null;
  firstObservedAt: Date;
  fullMessage: string | null;
  parentShas: readonly string[] | null;
  publicId: string;
  sha: string;
}

const authoredRewriteOrder = (commit: AuthoredRewriteCandidate) =>
  (commit.committerAt ?? commit.committedAt).getTime();

const compareAuthoredRewriteCandidates = (
  left: AuthoredRewriteCandidate,
  right: AuthoredRewriteCandidate
) => {
  const byCommitter = authoredRewriteOrder(left) - authoredRewriteOrder(right);
  if (byCommitter !== 0) {
    return byCommitter;
  }
  const byObservation =
    left.firstObservedAt.getTime() - right.firstObservedAt.getTime();
  if (byObservation !== 0) {
    return byObservation;
  }
  if (left.sha === right.sha) {
    return 0;
  }
  return left.sha < right.sha ? -1 : 1;
};

const canonicalizeAuthoredRewriteLineage = async (
  transaction: DatabaseTransaction,
  repositoryId: string,
  candidate: AuthoredRewriteCandidate,
  now: Date,
  allowedMemberMergeSha: string | null = null
) => {
  if (
    candidate.authorUserId === null ||
    candidate.authoredAt === null ||
    candidate.fullMessage === null ||
    candidate.parentShas === null ||
    candidate.parentShas.length > 1
  ) {
    return { aliases: 0, candidateAliased: false };
  }
  const lineage = await transaction
    .select({
      authoredAt: githubCommits.authoredAt,
      authorUserId: githubCommits.authorUserId,
      committedAt: githubCommits.committedAt,
      committerAt: githubCommits.committerAt,
      firstObservedAt: githubCommits.firstObservedAt,
      fullMessage: githubCommits.fullMessage,
      parentShas: githubCommits.parentShas,
      publicId: githubPublicActivities.publicId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .innerJoin(githubPublicActivities, commitActivityIdentity)
    .where(
      and(
        eq(githubCommits.repositoryId, repositoryId),
        eq(githubCommits.authorUserId, candidate.authorUserId),
        eq(githubCommits.authoredAt, candidate.authoredAt),
        eq(githubCommits.fullMessage, candidate.fullMessage),
        eq(githubCommits.enrichmentState, "complete"),
        inArray(githubCommits.pullRequestDiscoveryState, [
          "complete",
          "unavailable",
        ]),
        isNonMergeCommit,
        isNull(githubPublicActivities.canonicalPublicId),
        isNull(githubPublicActivities.hiddenAt),
        or(
          allowedMemberMergeSha === null
            ? undefined
            : eq(githubCommits.sha, allowedMemberMergeSha),
          sql<boolean>`NOT EXISTS (
            SELECT 1
            FROM ${githubPullRequests} AS rewrite_merge_pr
            WHERE rewrite_merge_pr.repository_id = ${githubCommits.repositoryId}
              AND rewrite_merge_pr.merge_sha = ${githubCommits.sha}
              AND rewrite_merge_pr.state = 'merged'
          )`
        )
      )
    )
    .orderBy(asc(githubCommits.sha))
    .for("update");
  if (lineage.length < 2) {
    return { aliases: 0, candidateAliased: false };
  }

  const winner = lineage.toSorted(compareAuthoredRewriteCandidates).at(-1);
  if (winner === undefined) {
    throw new Error("The authored rewrite lineage has no canonical commit.");
  }
  const losers = lineage.filter(({ publicId }) => publicId !== winner.publicId);
  const loserPublicIds = losers.map(({ publicId }) => publicId);

  await transaction.execute(sql`
    WITH RECURSIVE rewrite_alias_descendants AS (
      SELECT alias_activity.public_id
      FROM ${githubPublicActivities} AS alias_activity
      WHERE alias_activity.canonical_public_id IN (
        ${sql.join(
          loserPublicIds.map((publicId) => sql`${publicId}`),
          sql`, `
        )}
      )
      UNION
      SELECT child_activity.public_id
      FROM ${githubPublicActivities} AS child_activity
      INNER JOIN rewrite_alias_descendants AS parent_activity
        ON child_activity.canonical_public_id = parent_activity.public_id
    )
    UPDATE ${githubPublicActivities} AS rewrite_alias
    SET
      alias_evidence = COALESCE(rewrite_alias.alias_evidence, '{}'::jsonb)
        || jsonb_build_object(
          'canonicalRetargetReason', 'same_authored_rewrite',
          'canonicalRetargetedFrom', rewrite_alias.canonical_public_id
        ),
      canonical_public_id = ${winner.publicId}
    WHERE rewrite_alias.public_id IN (
      SELECT public_id FROM rewrite_alias_descendants
    )
      AND rewrite_alias.public_id <> ${winner.publicId}
  `);

  let aliases = 0;
  for (const loser of losers) {
    if (
      await setCanonicalAlias(
        transaction,
        loser.publicId,
        winner.publicId,
        "same_authored_rewrite",
        {
          authoredAt: candidate.authoredAt.toISOString(),
          authorUserId: candidate.authorUserId,
          canonicalCommitterAt: (
            winner.committerAt ?? winner.committedAt
          ).toISOString(),
          sourceSha: winner.sha,
        },
        now
      )
    ) {
      aliases += 1;
    }
  }
  await transaction
    .update(githubCommits)
    .set({ canonicalizedAt: now })
    .where(
      and(
        eq(githubCommits.repositoryId, repositoryId),
        inArray(
          githubCommits.activityPublicId,
          lineage.map(({ publicId }) => publicId)
        )
      )
    );
  await publishCompletedSummaryForCommit(
    transaction,
    repositoryId,
    winner.sha,
    now
  );
  return {
    aliases,
    candidateAliased: candidate.publicId !== winner.publicId,
  };
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
        authoredAt: githubCommits.authoredAt,
        authorUserId: githubCommits.authorUserId,
        changeFingerprint: githubCommits.changeFingerprint,
        committedAt: githubCommits.committedAt,
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
        const rewrite = await canonicalizeAuthoredRewriteLineage(
          transaction,
          repositoryId,
          { ...candidate, sha },
          now,
          sha
        );
        if (rewrite.aliases > 0) {
          return {
            aliased: rewrite.candidateAliased,
            aliases: rewrite.aliases,
            publicId: candidate.publicId,
          };
        }
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

    const rewrite = await canonicalizeAuthoredRewriteLineage(
      transaction,
      repositoryId,
      { ...candidate, sha },
      now
    );
    if (rewrite.aliases > 0) {
      return {
        aliased: rewrite.candidateAliased,
        aliases: rewrite.aliases,
        publicId: candidate.publicId,
      };
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
        authoredAt: githubCommits.authoredAt,
        authorUserId: githubCommits.authorUserId,
        canonicalPublicId: githubPublicActivities.canonicalPublicId,
        committerAt: githubCommits.committerAt,
        firstObservedAt: githubCommits.firstObservedAt,
        fullMessage: githubCommits.fullMessage,
        parentShas: githubCommits.parentShas,
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
    const cherryPickSource = /cherry picked from commit ([a-f0-9]{40})/iu.exec(
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
      const sameAuthorSingleParent =
        candidate.parentShas?.length === 1 &&
        copy.parentShas?.length === 1 &&
        candidate.authorUserId !== null &&
        candidate.authorUserId === copy.authorUserId;
      const sameAuthoredCommit =
        sameAuthorSingleParent &&
        candidate.authoredAt !== null &&
        copy.authoredAt !== null &&
        candidate.authoredAt.getTime() === copy.authoredAt.getTime() &&
        candidate.fullMessage !== null &&
        candidate.fullMessage === copy.fullMessage;
      const candidateHeadline = comparableCommitHeadline(candidate.fullMessage);
      const copyHeadline = comparableCommitHeadline(copy.fullMessage);
      const sameHeadlineCommit =
        sameAuthorSingleParent &&
        candidateHeadline !== null &&
        candidateHeadline === copyHeadline;
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
        !sameAuthoredCommit &&
        !sameHeadlineCommit &&
        sharedPullRequest === undefined
      ) {
        continue;
      }
      const reason = directMergeParent
        ? "direct_parent_merge"
        : explicitCherryPick
          ? "cherry_pick"
          : sameAuthoredCommit
            ? "same_authored_exact_copy"
            : sameHeadlineCommit
              ? "same_author_headline_exact_copy"
              : "pr_history_exact_copy";
      const aliased = await setCanonicalAlias(
        transaction,
        candidate.publicId,
        canonicalPublicId,
        reason,
        {
          fingerprint: candidate.changeFingerprint,
          fingerprintComplete: true,
          authoredAt: sameAuthoredCommit
            ? candidate.authoredAt?.toISOString()
            : null,
          directMergeParent,
          headline:
            !sameAuthoredCommit && sameHeadlineCommit
              ? candidateHeadline
              : null,
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
  now = new Date()
) => {
  const candidates = await getDatabase()
    .select({
      repositoryId: githubCommits.repositoryId,
      sha: githubCommits.sha,
    })
    .from(githubCommits)
    .innerJoin(githubPublicActivities, commitActivityIdentity)
    .where(
      and(
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
  now = new Date()
) => {
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
  now = new Date()
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
        completedAt: now,
        errorCode: "lease_expired",
        leaseToken: null,
        leaseUntil: null,
        state: "indeterminate",
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
        author: githubCommits.author,
        committedAt: githubCommits.committedAt,
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
          eq(githubPublicActivities.kind, "commit"),
          isNull(githubPublicActivities.canonicalPublicId),
          isNull(githubPublicActivities.hiddenAt),
          inArray(githubCommits.author, [...activeAccounts]),
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
          author,
          committedAt: candidate.committedAt.toISOString(),
          leaseToken,
          message: candidate.message,
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

export const failGitHubSummaryAttempt = async (
  attempt: ClaimedGitHubSummary,
  errorCode: string,
  now = new Date()
) => {
  await getDatabase()
    .update(githubSummaryAttempts)
    .set({
      completedAt: now,
      errorCode,
      leaseToken: null,
      leaseUntil: null,
      state: "failed",
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
      attemptedAt: null,
      errorCode: null,
      leaseToken: null,
      leaseUntil: null,
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
