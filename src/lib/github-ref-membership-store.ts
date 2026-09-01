import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  eq,
  gt,
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
  githubRefGenerations,
  githubRefMemberships,
  githubRepositories,
  githubRepositoryRefs,
} from "@/db/schema";
import type {
  GitHubActivityPushObservationSource,
  GitHubCurrentRefMembershipReference,
} from "@/lib/github-activity-processor";
import { githubActivityRetryAt } from "@/lib/github-activity-worker-core";
import {
  TRACKED_GITHUB_USER_IDS,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import { requestGitHubWorkUnitProjection } from "@/lib/github-work-unit-projection-state";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/u;

interface GitHubRefRepairIdentity {
  attemptCount: number;
  branchLineageId: string;
  desiredHeadSha: string;
  leaseToken: string;
  observedAt: Date;
  refName: string;
  repository: string;
  repositoryId: string;
}

export interface ClaimedActiveGitHubRefRepair extends GitHubRefRepairIdentity {
  account: TrackedGitHubAccount;
  active: true;
  coverageSinceAt: Date;
}

export interface ClaimedDeletedGitHubRefRepair extends GitHubRefRepairIdentity {
  account: null;
  active: false;
  coverageSinceAt: null;
}

export type ClaimedGitHubRefRepair =
  | ClaimedActiveGitHubRefRepair
  | ClaimedDeletedGitHubRefRepair;

export interface GitHubRefRepairCompletion {
  generation: number | null;
  insertedCommits: number;
  memberCount: number;
  stale: boolean;
}

export const githubCurrentRefMembershipReferenceFrom = (
  repair: ClaimedActiveGitHubRefRepair
): GitHubCurrentRefMembershipReference => ({
  account: repair.account,
  coverageSinceAt: repair.coverageSinceAt,
  headSha: repair.desiredHeadSha,
  observedAt: repair.observedAt,
  refName: repair.refName,
  repository: repair.repository,
  repositoryId: repair.repositoryId,
});

const repairIdentity = (repair: GitHubRefRepairIdentity) =>
  and(
    eq(githubRepositoryRefs.repositoryId, repair.repositoryId),
    eq(githubRepositoryRefs.refName, repair.refName),
    eq(githubRepositoryRefs.kind, "head"),
    eq(githubRepositoryRefs.repairLeaseToken, repair.leaseToken)
  );

const availableLease = (now: Date) =>
  or(
    isNull(githubRepositoryRefs.repairLeaseToken),
    lte(githubRepositoryRefs.repairLeaseUntil, now)
  );

const desiredRefNeedsRepair = (coverageSinceAt: Date | null) =>
  or(
    and(
      eq(githubRepositoryRefs.active, true),
      eq(githubRepositoryRefs.projectionRelevant, true),
      or(
        isNull(githubRefGenerations.headSha),
        ne(githubRefGenerations.headSha, githubRepositoryRefs.headSha),
        ne(
          githubRefGenerations.branchLineageId,
          githubRepositoryRefs.branchLineageId
        ),
        coverageSinceAt === null
          ? undefined
          : gt(githubRefGenerations.coverageSinceAt, coverageSinceAt)
      )
    ),
    and(
      eq(githubRepositoryRefs.active, false),
      isNotNull(githubRefGenerations.headSha)
    )
  );

const eligibleRefRepair = (input: {
  activeRepairsEnabled: boolean;
  coverageSinceAt: Date | null;
  repositoryId?: string | null;
}) =>
  and(
    eq(githubRepositoryRefs.kind, "head"),
    desiredRefNeedsRepair(input.coverageSinceAt),
    input.activeRepairsEnabled
      ? undefined
      : eq(githubRepositoryRefs.active, false),
    input.repositoryId === undefined || input.repositoryId === null
      ? undefined
      : eq(githubRepositoryRefs.repositoryId, input.repositoryId)
  );

const validLimit = (limit: number) => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError(
      "GitHub ref repair claim limit must be between 1 and 100."
    );
  }
  return limit;
};

/**
 * Expands durable current-ref coverage without changing an account's pause
 * state. Repeating the same or a newer request is a no-op.
 */
export const lowerGitHubRefBackfillSinceAt = async (
  accounts: readonly TrackedGitHubAccount[],
  sinceAt: Date
) => {
  const uniqueAccounts = [...new Set(accounts)];
  if (
    uniqueAccounts.length === 0 ||
    uniqueAccounts.some((account) => trackedGitHubAccountFrom(account) === null)
  ) {
    throw new TypeError("GitHub ref coverage accounts are invalid.");
  }
  if (Number.isNaN(sinceAt.getTime())) {
    throw new RangeError("The GitHub ref coverage start is invalid.");
  }

  await getDatabase()
    .insert(githubAccountCheckpoints)
    .values(
      uniqueAccounts.map((account) => ({
        account,
        refBackfillSinceAt: sinceAt,
      }))
    )
    .onConflictDoUpdate({
      set: {
        refBackfillSinceAt: sql`least(${githubAccountCheckpoints.refBackfillSinceAt}, excluded.ref_backfill_since_at)`,
      },
      target: githubAccountCheckpoints.account,
    });
};

/**
 * Claims only desired heads whose last complete reachability generation is
 * stale, plus deleted heads whose complete generation still exists.
 */
export const claimGitHubRefRepairs = async (input: {
  limit: number;
  now?: Date;
  repositoryId?: string | null;
}): Promise<readonly ClaimedGitHubRefRepair[]> => {
  const now = input.now ?? new Date();
  const limit = validLimit(input.limit);

  return await getDatabase().transaction(async (transaction) => {
    const checkpoints = await transaction
      .select({
        account: githubAccountCheckpoints.account,
        coverageSinceAt: githubAccountCheckpoints.refBackfillSinceAt,
      })
      .from(githubAccountCheckpoints)
      .where(eq(githubAccountCheckpoints.paused, false))
      .orderBy(asc(githubAccountCheckpoints.refBackfillSinceAt));
    const checkpoint = checkpoints
      .map((row) => ({
        account: trackedGitHubAccountFrom(row.account),
        coverageSinceAt: row.coverageSinceAt,
      }))
      .find(
        (
          row
        ): row is {
          account: TrackedGitHubAccount;
          coverageSinceAt: Date;
        } => row.account !== null
      );

    const candidates = await transaction
      .select({
        active: githubRepositoryRefs.active,
        attemptCount: githubRepositoryRefs.repairAttempts,
        branchLineageId: githubRepositoryRefs.branchLineageId,
        desiredHeadSha: githubRepositoryRefs.headSha,
        observedAt: githubRepositoryRefs.lastObservedAt,
        refName: githubRepositoryRefs.refName,
        repository: githubRepositories.fullName,
        repositoryId: githubRepositoryRefs.repositoryId,
      })
      .from(githubRepositoryRefs)
      .innerJoin(
        githubRepositories,
        eq(githubRepositories.id, githubRepositoryRefs.repositoryId)
      )
      .leftJoin(
        githubRefGenerations,
        and(
          eq(
            githubRefGenerations.repositoryId,
            githubRepositoryRefs.repositoryId
          ),
          eq(githubRefGenerations.refName, githubRepositoryRefs.refName)
        )
      )
      .where(
        and(
          availableLease(now),
          eligibleRefRepair({
            activeRepairsEnabled: checkpoint !== undefined,
            coverageSinceAt: checkpoint?.coverageSinceAt ?? null,
            repositoryId: input.repositoryId,
          })
        )
      )
      .orderBy(
        desc(
          sql<number>`CASE
            WHEN ${githubRepositories.defaultBranch} IS NOT NULL
              AND ${githubRepositoryRefs.refName} = 'refs/heads/' || ${githubRepositories.defaultBranch}
            THEN 1
            ELSE 0
          END`
        ),
        desc(githubRepositoryRefs.lastObservedAt),
        asc(githubRepositoryRefs.repositoryId),
        asc(githubRepositoryRefs.refName)
      )
      .limit(limit);

    const claimed: ClaimedGitHubRefRepair[] = [];
    for (const candidate of candidates) {
      if (claimed.length >= limit) {
        break;
      }
      if (candidate.active && checkpoint === undefined) {
        continue;
      }
      if (candidate.branchLineageId === null) {
        throw new Error("A GitHub head has no branch lineage.");
      }
      const leaseToken = randomUUID();
      const [updated] = await transaction
        .update(githubRepositoryRefs)
        .set({
          repairAttempts: candidate.attemptCount + 1,
          repairLeaseToken: leaseToken,
          repairLeaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
        })
        .where(
          and(
            eq(githubRepositoryRefs.repositoryId, candidate.repositoryId),
            eq(githubRepositoryRefs.refName, candidate.refName),
            eq(githubRepositoryRefs.kind, "head"),
            eq(githubRepositoryRefs.active, candidate.active),
            eq(githubRepositoryRefs.headSha, candidate.desiredHeadSha),
            availableLease(now)
          )
        )
        .returning({ repositoryId: githubRepositoryRefs.repositoryId });
      if (updated === undefined) {
        continue;
      }
      const common = {
        attemptCount: candidate.attemptCount + 1,
        branchLineageId: candidate.branchLineageId,
        desiredHeadSha: candidate.desiredHeadSha,
        leaseToken,
        observedAt: candidate.observedAt,
        refName: candidate.refName,
        repository: candidate.repository,
        repositoryId: candidate.repositoryId,
      };
      if (!candidate.active) {
        claimed.push({
          ...common,
          account: null,
          active: false,
          coverageSinceAt: null,
        });
      } else if (checkpoint !== undefined) {
        claimed.push({
          ...common,
          account: checkpoint.account,
          active: true,
          coverageSinceAt: checkpoint.coverageSinceAt,
        });
      }
    }
    return claimed;
  });
};

export interface GitHubRefRepairBacklog {
  remaining: number;
  retryAt: Date | null;
}

/** Reads durable desired generations that have not reached a complete match. */
export const readGitHubRefRepairBacklog = async (input: {
  now?: Date;
  repositoryId?: string | null;
}): Promise<GitHubRefRepairBacklog> => {
  const now = input.now ?? new Date();
  return await getDatabase().transaction(
    async (transaction) => {
      const checkpointRows = await transaction
        .select({
          account: githubAccountCheckpoints.account,
          coverageSinceAt: githubAccountCheckpoints.refBackfillSinceAt,
        })
        .from(githubAccountCheckpoints)
        .where(eq(githubAccountCheckpoints.paused, false))
        .orderBy(asc(githubAccountCheckpoints.refBackfillSinceAt));
      const checkpoint = checkpointRows
        .map((row) => ({
          account: trackedGitHubAccountFrom(row.account),
          coverageSinceAt: row.coverageSinceAt,
        }))
        .find((row) => row.account !== null);
      const rows = await transaction
        .select({ retryAt: githubRepositoryRefs.repairLeaseUntil })
        .from(githubRepositoryRefs)
        .leftJoin(
          githubRefGenerations,
          and(
            eq(
              githubRefGenerations.repositoryId,
              githubRepositoryRefs.repositoryId
            ),
            eq(githubRefGenerations.refName, githubRepositoryRefs.refName)
          )
        )
        .where(
          eligibleRefRepair({
            activeRepairsEnabled: checkpoint !== undefined,
            coverageSinceAt: checkpoint?.coverageSinceAt ?? null,
            repositoryId: input.repositoryId,
          })
        );
      const retryTimes = rows.flatMap(({ retryAt }) =>
        retryAt !== null && retryAt > now ? [retryAt.getTime()] : []
      );
      return {
        remaining: rows.length,
        retryAt:
          rows.length > 0 && retryTimes.length === rows.length
            ? new Date(Math.min(...retryTimes))
            : null,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
};

export const validateGitHubRefRepairSource = (
  repair: ClaimedActiveGitHubRefRepair,
  source: GitHubActivityPushObservationSource
) => {
  const reachableShas = new Set(source.commitShas);
  if (
    reachableShas.size !== source.commitShas.length ||
    source.commitShas.some((sha) => !SHA.test(sha)) ||
    (source.commitShas.length > 0 &&
      source.commitShas.at(-1) !== repair.desiredHeadSha)
  ) {
    throw new TypeError("GitHub returned invalid current ref reachability.");
  }

  const trackedShas = new Set<string>();
  for (const commit of source.commits) {
    if (
      !Object.hasOwn(TRACKED_GITHUB_USER_IDS, commit.author) ||
      commit.repositoryId !== repair.repositoryId ||
      commit.repository !== repair.repository ||
      !reachableShas.has(commit.sha) ||
      trackedShas.has(commit.sha) ||
      !SHA.test(commit.sha) ||
      Number.isNaN(new Date(commit.committedAt).getTime())
    ) {
      throw new TypeError("GitHub returned invalid tracked ref membership.");
    }
    trackedShas.add(commit.sha);
  }
};

/**
 * Atomically replaces the last complete generation after persisting any newly
 * discovered tracked commit references. A changed desired tip makes the result
 * stale and leaves the previous generation visible.
 */
export const completeGitHubRefRepair = async (
  repair: ClaimedActiveGitHubRefRepair,
  source: GitHubActivityPushObservationSource,
  now = new Date()
): Promise<GitHubRefRepairCompletion> => {
  validateGitHubRefRepairSource(repair, source);
  return await getDatabase().transaction(async (transaction) => {
    const [desired] = await transaction
      .select({
        active: githubRepositoryRefs.active,
        branchLineageId: githubRepositoryRefs.branchLineageId,
        headSha: githubRepositoryRefs.headSha,
      })
      .from(githubRepositoryRefs)
      .where(repairIdentity(repair))
      .for("update");
    if (
      desired === undefined ||
      !desired.active ||
      desired.branchLineageId !== repair.branchLineageId ||
      desired.headSha !== repair.desiredHeadSha
    ) {
      await transaction
        .update(githubRepositoryRefs)
        .set({ repairLeaseToken: null, repairLeaseUntil: null })
        .where(repairIdentity(repair));
      return {
        generation: null,
        insertedCommits: 0,
        memberCount: 0,
        stale: true,
      };
    }

    const inserted =
      source.commits.length === 0
        ? []
        : await transaction
            .insert(githubCommits)
            .values(
              source.commits.map((commit) => ({
                author: commit.author,
                authorUserId: TRACKED_GITHUB_USER_IDS[commit.author],
                committedAt: new Date(commit.committedAt),
                firstObservedAt: repair.observedAt,
                message: commit.message,
                repositoryId: commit.repositoryId,
                sha: commit.sha,
              }))
            )
            .onConflictDoNothing({
              target: [githubCommits.repositoryId, githubCommits.sha],
            })
            .returning({ sha: githubCommits.sha });

    const [previous] = await transaction
      .select({
        generation: githubRefGenerations.generation,
      })
      .from(githubRefGenerations)
      .where(
        and(
          eq(githubRefGenerations.repositoryId, repair.repositoryId),
          eq(githubRefGenerations.refName, repair.refName)
        )
      )
      .for("update");
    const generation = (previous?.generation ?? 0) + 1;
    if (previous === undefined) {
      await transaction.insert(githubRefGenerations).values({
        branchLineageId: repair.branchLineageId,
        completedAt: now,
        coverageSinceAt: repair.coverageSinceAt,
        generation,
        headSha: repair.desiredHeadSha,
        refName: repair.refName,
        repositoryId: repair.repositoryId,
      });
    } else {
      await transaction
        .delete(githubRefMemberships)
        .where(
          and(
            eq(githubRefMemberships.repositoryId, repair.repositoryId),
            eq(githubRefMemberships.refName, repair.refName)
          )
        );
      await transaction
        .update(githubRefGenerations)
        .set({
          branchLineageId: repair.branchLineageId,
          completedAt: now,
          coverageSinceAt: repair.coverageSinceAt,
          generation,
          headSha: repair.desiredHeadSha,
        })
        .where(
          and(
            eq(githubRefGenerations.repositoryId, repair.repositoryId),
            eq(githubRefGenerations.refName, repair.refName)
          )
        );
    }

    if (source.commits.length > 0) {
      const commitsBySha = new Map(
        source.commits.map((commit) => [commit.sha, commit])
      );
      const memberships = source.commitShas.flatMap((sha, position) => {
        const commit = commitsBySha.get(sha);
        return commit === undefined
          ? []
          : [
              {
                commitRepositoryId: commit.repositoryId,
                commitSha: sha,
                generation,
                position,
                refName: repair.refName,
                repositoryId: repair.repositoryId,
              },
            ];
      });
      await transaction.insert(githubRefMemberships).values(memberships);
    }
    await transaction
      .update(githubRepositoryRefs)
      .set({
        repairAttempts: 0,
        repairError: null,
        repairLeaseToken: null,
        repairLeaseUntil: null,
      })
      .where(repairIdentity(repair));
    await requestGitHubWorkUnitProjection(transaction);
    return {
      generation,
      insertedCommits: inserted.length,
      memberCount: source.commits.length,
      stale: false,
    };
  });
};

/** Removes a deleted head's complete generation and its cascading members. */
export const completeGitHubRefDeletion = async (
  repair: ClaimedDeletedGitHubRefRepair
): Promise<{ stale: boolean }> =>
  await getDatabase().transaction(async (transaction) => {
    const [desired] = await transaction
      .select({ active: githubRepositoryRefs.active })
      .from(githubRepositoryRefs)
      .where(repairIdentity(repair))
      .for("update");
    if (desired === undefined || desired.active) {
      await transaction
        .update(githubRepositoryRefs)
        .set({ repairLeaseToken: null, repairLeaseUntil: null })
        .where(repairIdentity(repair));
      return { stale: true };
    }
    await transaction
      .delete(githubRefGenerations)
      .where(
        and(
          eq(githubRefGenerations.repositoryId, repair.repositoryId),
          eq(githubRefGenerations.refName, repair.refName)
        )
      );
    await transaction
      .update(githubRepositoryRefs)
      .set({
        repairAttempts: 0,
        repairError: null,
        repairLeaseToken: null,
        repairLeaseUntil: null,
      })
      .where(repairIdentity(repair));
    await requestGitHubWorkUnitProjection(transaction);
    return { stale: false };
  });

/** Defers a retry while preserving the lease token as the not-before guard. */
export const deferGitHubRefRepair = async (
  repair: ClaimedGitHubRefRepair,
  errorCode: string,
  requestedRetryAt: Date | null,
  now = new Date()
) => {
  const normalizedError = errorCode.trim().slice(0, 80);
  if (
    normalizedError.length === 0 ||
    (requestedRetryAt !== null && Number.isNaN(requestedRetryAt.getTime()))
  ) {
    throw new TypeError("GitHub ref repair retry state is invalid.");
  }
  const retryAt = githubActivityRetryAt(
    repair.attemptCount,
    now,
    requestedRetryAt
  );
  await getDatabase()
    .update(githubRepositoryRefs)
    .set({
      repairError: normalizedError,
      repairLeaseUntil: retryAt,
    })
    .where(repairIdentity(repair));
  return retryAt;
};

/** Releases an unstarted/deadline-limited claim without recording a failure. */
export const releaseGitHubRefRepair = async (
  repair: ClaimedGitHubRefRepair
) => {
  await getDatabase()
    .update(githubRepositoryRefs)
    .set({
      repairAttempts: Math.max(0, repair.attemptCount - 1),
      repairLeaseToken: null,
      repairLeaseUntil: null,
    })
    .where(repairIdentity(repair));
};
