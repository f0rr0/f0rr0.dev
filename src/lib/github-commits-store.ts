import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountCheckpoints,
  githubCommits,
  githubIssues,
  githubPublicFeedHead,
  githubPullRequests,
  githubPullRequestSignals,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubRepositoryRefs,
  githubWebhookDeliveries,
} from "@/db/schema";
import {
  githubCommitReferenceValuesFrom,
  planGitHubBranchLineages,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type {
  GitHubCommit,
  GitHubEvent,
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestEventSignal,
  GitHubPush,
  GitHubRepository,
  GitHubRepositoryFacts,
  GitHubHeadSignal,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import { persistPullRequestSnapshotInTransaction } from "@/lib/github-pull-request-store";
import {
  upsertGitHubRepositories,
  upsertGitHubRepository,
} from "@/lib/github-repository-store";
import { requestGitHubWorkUnitProjection } from "@/lib/github-work-unit-projection-state";

export class CheckpointConflictError extends Error {
  constructor() {
    super("The GitHub event checkpoint changed during synchronization.");
    this.name = "CheckpointConflictError";
  }
}

export interface GitHubAccountCheckpoint {
  eventsEtag: string | null;
  eventsLastAttemptedAt: Date | null;
  eventsLastSucceededAt: Date | null;
  eventsNextPollAt: Date | null;
  latestEventId: string | null;
  paused: boolean;
  refBackfillSinceAt: Date;
}

export interface GitHubEventPollStart {
  checkpoint: GitHubAccountCheckpoint;
  shouldPoll: boolean;
}

export type GitHubRepositoryRefKind = GitHubRepositoryRefSnapshot["kind"];

export interface GitHubRefReconciliationLease {
  cursorRepositoryId: string | null;
  kind: GitHubRepositoryRefKind;
  leaseToken: string;
  nextPage: number | null;
  scanStartedAt: Date | null;
}

export interface GitHubIntakeResult {
  issues: number;
  knownCommits: number;
  pullRequests: number;
  pushes: number;
}

export interface GitHubWebhookIntakeResult extends GitHubIntakeResult {
  duplicate: boolean;
  ignored: boolean;
  paused: boolean;
}

export interface GitHubRepositoryRefSnapshot {
  headSha: string;
  kind: "head" | "tag";
  refName: string;
}

export interface GitHubRepositoryRefIntakeResult {
  knownCommits: number;
  pushes: number;
  refs: number;
}

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export const isGitHubAccountPaused = (
  checkpoint: GitHubAccountCheckpoint | null
) => checkpoint?.paused === true;

export const readGitHubAccountCheckpoint = async (
  account: TrackedGitHubAccount
): Promise<GitHubAccountCheckpoint | null> => {
  const [checkpoint] = await getDatabase()
    .select({
      eventsEtag: githubAccountCheckpoints.eventsEtag,
      eventsLastAttemptedAt: githubAccountCheckpoints.eventsLastAttemptedAt,
      eventsLastSucceededAt: githubAccountCheckpoints.eventsLastSucceededAt,
      eventsNextPollAt: githubAccountCheckpoints.eventsNextPollAt,
      latestEventId: githubAccountCheckpoints.latestEventId,
      paused: githubAccountCheckpoints.paused,
      refBackfillSinceAt: githubAccountCheckpoints.refBackfillSinceAt,
    })
    .from(githubAccountCheckpoints)
    .where(eq(githubAccountCheckpoints.account, account))
    .limit(1);
  return checkpoint ?? null;
};

export const beginGitHubEventPoll = async (
  account: TrackedGitHubAccount,
  attemptedAt = new Date()
): Promise<GitHubEventPollStart> =>
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .insert(githubAccountCheckpoints)
      .values({ account })
      .onConflictDoNothing({ target: githubAccountCheckpoints.account });
    const minimumPreviousAttemptAt = new Date(attemptedAt.getTime() - 60_000);
    const selection = {
      eventsEtag: githubAccountCheckpoints.eventsEtag,
      eventsLastAttemptedAt: githubAccountCheckpoints.eventsLastAttemptedAt,
      eventsLastSucceededAt: githubAccountCheckpoints.eventsLastSucceededAt,
      eventsNextPollAt: githubAccountCheckpoints.eventsNextPollAt,
      latestEventId: githubAccountCheckpoints.latestEventId,
      paused: githubAccountCheckpoints.paused,
      refBackfillSinceAt: githubAccountCheckpoints.refBackfillSinceAt,
    } as const;
    const [started] = await transaction
      .update(githubAccountCheckpoints)
      .set({ eventsLastAttemptedAt: attemptedAt })
      .where(
        and(
          eq(githubAccountCheckpoints.account, account),
          eq(githubAccountCheckpoints.paused, false),
          or(
            isNull(githubAccountCheckpoints.eventsNextPollAt),
            lte(githubAccountCheckpoints.eventsNextPollAt, attemptedAt)
          ),
          or(
            isNull(githubAccountCheckpoints.eventsLastAttemptedAt),
            lte(
              githubAccountCheckpoints.eventsLastAttemptedAt,
              minimumPreviousAttemptAt
            )
          )
        )
      )
      .returning(selection);
    if (started !== undefined) {
      return { checkpoint: started, shouldPoll: true };
    }
    const [checkpoint] = await transaction
      .select(selection)
      .from(githubAccountCheckpoints)
      .where(eq(githubAccountCheckpoints.account, account))
      .limit(1);
    if (checkpoint === undefined) {
      throw new Error("The GitHub account checkpoint could not be created.");
    }
    return { checkpoint, shouldPoll: false };
  });

const persistIssue = async (
  transaction: DatabaseTransaction,
  issue: GitHubIssue,
  observedAt: Date
) => {
  await upsertGitHubRepository(transaction, issue.repository, observedAt);
  const [insertedIssue] = await transaction
    .insert(githubIssues)
    .values({
      account: issue.account,
      authorLogin: issue.authorLogin,
      authorUserId: issue.authorUserId,
      createdAt: new Date(issue.createdAt),
      firstObservedAt: observedAt,
      nodeId: issue.nodeId,
      number: issue.number,
      repositoryId: issue.repository.id,
      titleSnapshot: issue.title,
      urlSnapshot: issue.url,
    })
    .onConflictDoNothing({ target: githubIssues.nodeId })
    .returning({ nodeId: githubIssues.nodeId });
  if (insertedIssue === undefined) {
    return false;
  }

  if (issue.repository.visibility !== null) {
    const [head] = await transaction
      .update(githubPublicFeedHead)
      .set({
        feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
        headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
        lastPublishedAt: observedAt,
        orderingRevision: sql`${githubPublicFeedHead.orderingRevision} + 1`,
      })
      .where(eq(githubPublicFeedHead.id, true))
      .returning({ id: githubPublicFeedHead.id });
    if (head === undefined) {
      throw new Error("The GitHub public feed head is unavailable.");
    }
  }
  return true;
};

interface PushObservationInput {
  observedAt: Date;
  providerCreatedAt: Date | null;
  push: GitHubPush;
  source: "events" | "refs" | "webhook";
  sourceId: string;
}

// oxlint-disable-next-line eslint/max-classes-per-file -- Durable intake exposes distinct optimistic-lock and evidence errors.
class GitHubPushObservationEvidenceConflictError extends Error {
  constructor() {
    super("Conflicting GitHub push evidence was observed.");
    this.name = "GitHubPushObservationEvidenceConflictError";
  }
}

const pushObservationIdentityKey = (input: {
  afterSha: string;
  beforeSha: string;
  refName: string;
  repositoryId: string;
}) =>
  JSON.stringify([
    input.repositoryId,
    input.refName,
    input.beforeSha,
    input.afterSha,
  ]);

const pushInputIdentityKey = (input: PushObservationInput) =>
  pushObservationIdentityKey({
    afterSha: input.push.head,
    beforeSha: input.push.before,
    refName: input.push.ref,
    repositoryId: input.push.repository.id,
  });

const pushSourceIdentityKey = (input: { source: string; sourceId: string }) =>
  JSON.stringify([input.source, input.sourceId]);

const isOrderedSubsequence = (
  candidate: readonly string[],
  complete: readonly string[]
) => {
  let offset = 0;
  for (const sha of candidate) {
    const index = complete.indexOf(sha, offset);
    if (index === -1) {
      return false;
    }
    offset = index + 1;
  }
  return true;
};

const PUSH_COMMIT_INSERT_BATCH = 1000;

export interface GitHubCommitReferenceIntakeResult {
  duplicates: number;
  inserted: number;
}

/** Inserts independently discovered commit references for normal worker enrichment. */
export const persistGitHubCommitReferences = async (input: {
  commits: readonly GitHubCommit[];
  observedAt?: Date;
}): Promise<GitHubCommitReferenceIntakeResult> => {
  const observedAt = input.observedAt ?? new Date();
  if (Number.isNaN(observedAt.getTime())) {
    throw new RangeError("The GitHub commit observation time is invalid.");
  }
  const commits = new Map<string, GitHubCommit>();
  for (const commit of input.commits) {
    const committedAt = new Date(commit.committedAt);
    if (Number.isNaN(committedAt.getTime())) {
      throw new TypeError("A GitHub commit reference has an invalid date.");
    }
    const identity = `${commit.repositoryId}:${commit.sha}`;
    const existing = commits.get(identity);
    if (
      existing !== undefined &&
      (existing.author !== commit.author ||
        existing.committedAt !== commit.committedAt ||
        existing.message !== commit.message ||
        existing.repository !== commit.repository)
    ) {
      throw new TypeError("GitHub returned conflicting commit references.");
    }
    commits.set(identity, commit);
  }
  if (commits.size === 0) {
    return { duplicates: 0, inserted: 0 };
  }

  return await getDatabase().transaction(async (transaction) => {
    const repositories = new Map<string, GitHubRepository>();
    for (const commit of commits.values()) {
      repositories.set(commit.repositoryId, {
        fullName: commit.repository,
        id: commit.repositoryId,
      });
    }
    await upsertGitHubRepositories(
      transaction,
      [...repositories.values()],
      observedAt
    );

    let inserted = 0;
    const values = [...commits.values()];
    for (
      let offset = 0;
      offset < values.length;
      offset += PUSH_COMMIT_INSERT_BATCH
    ) {
      const rows = await transaction
        .insert(githubCommits)
        .values(
          values
            .slice(offset, offset + PUSH_COMMIT_INSERT_BATCH)
            .map((commit) =>
              githubCommitReferenceValuesFrom(commit, observedAt)
            )
        )
        .onConflictDoNothing({
          target: [githubCommits.repositoryId, githubCommits.sha],
        })
        .returning({ sha: githubCommits.sha });
      inserted += rows.length;
    }
    return { duplicates: input.commits.length - inserted, inserted };
  });
};

// oxlint-disable-next-line eslint/complexity -- Conflict promotion validates each independent evidence invariant before mutation.
const insertPushObservations = async (
  transaction: DatabaseTransaction,
  inputs: readonly PushObservationInput[]
) => {
  if (inputs.length === 0) {
    return { duplicates: 0, knownCommits: 0, pushes: 0 };
  }
  if (
    new Set(inputs.map(pushInputIdentityKey)).size !== inputs.length ||
    new Set(inputs.map(pushSourceIdentityKey)).size !== inputs.length
  ) {
    throw new GitHubPushObservationEvidenceConflictError();
  }

  const repositories = new Map<string, GitHubRepository>();
  for (const { push } of inputs) {
    if (!repositories.has(push.repository.id)) {
      repositories.set(push.repository.id, push.repository);
    }
  }
  const observedAt = inputs[0]?.observedAt ?? new Date();
  await upsertGitHubRepositories(
    transaction,
    [...repositories.values()],
    observedAt
  );

  const inserted = await transaction
    .insert(githubPushObservations)
    .values(
      inputs.map((input) => {
        const complete = input.push.size === 0;
        return {
          account: input.push.pushedBy,
          afterSha: input.push.head,
          beforeSha: input.push.before,
          completedAt: complete ? input.observedAt : null,
          expectedCommitCount: input.push.size,
          observedAt: input.observedAt,
          providerCreatedAt: input.providerCreatedAt,
          refName: input.push.ref,
          repositoryId: input.push.repository.id,
          repositoryNameSnapshot: input.push.repository.fullName,
          source: input.source,
          sourceId: input.sourceId,
          state: complete ? "complete" : "pending",
        };
      })
    )
    .onConflictDoNothing()
    .returning({
      id: githubPushObservations.id,
      source: githubPushObservations.source,
      sourceId: githubPushObservations.sourceId,
    });
  const inputsBySource = new Map(
    inputs.map((input) => [pushSourceIdentityKey(input), input])
  );
  const commitRows = inserted.flatMap(({ id, source, sourceId }) => {
    const input = inputsBySource.get(
      pushSourceIdentityKey({ source, sourceId })
    );
    if (input === undefined) {
      throw new Error("A persisted GitHub push observation lost its source.");
    }
    return input.push.commitShas.map((sha, position) => ({
      observationId: id,
      position,
      repositoryId: input.push.repository.id,
      sha,
    }));
  });
  const insertedSources = new Set(inserted.map(pushSourceIdentityKey));
  const duplicateInputs = inputs.filter(
    (input) => !insertedSources.has(pushSourceIdentityKey(input))
  );
  let promoted = 0;
  let promotedCommitCount = 0;
  if (duplicateInputs.length > 0) {
    const conflicts = await transaction
      .select({
        afterSha: githubPushObservations.afterSha,
        beforeSha: githubPushObservations.beforeSha,
        expectedCommitCount: githubPushObservations.expectedCommitCount,
        id: githubPushObservations.id,
        providerCreatedAt: githubPushObservations.providerCreatedAt,
        refName: githubPushObservations.refName,
        repositoryId: githubPushObservations.repositoryId,
        source: githubPushObservations.source,
        sourceId: githubPushObservations.sourceId,
      })
      .from(githubPushObservations)
      .where(
        or(
          ...duplicateInputs.flatMap((input) => [
            and(
              eq(githubPushObservations.source, input.source),
              eq(githubPushObservations.sourceId, input.sourceId)
            ),
            and(
              eq(githubPushObservations.repositoryId, input.push.repository.id),
              eq(githubPushObservations.refName, input.push.ref),
              eq(githubPushObservations.beforeSha, input.push.before),
              eq(githubPushObservations.afterSha, input.push.head),
              ne(githubPushObservations.source, "backfill")
            ),
          ])
        )
      )
      .for("update");
    const conflictIds = conflicts.map(({ id }) => id);
    const storedCommitRows =
      conflictIds.length === 0
        ? []
        : await transaction
            .select({
              observationId: githubPushObservationCommits.observationId,
              position: githubPushObservationCommits.position,
              repositoryId: githubPushObservationCommits.repositoryId,
              sha: githubPushObservationCommits.sha,
            })
            .from(githubPushObservationCommits)
            .where(
              inArray(githubPushObservationCommits.observationId, conflictIds)
            )
            .orderBy(
              asc(githubPushObservationCommits.observationId),
              asc(githubPushObservationCommits.position)
            );
    const commitsByObservation = new Map<string, string[]>();
    const conflictsById = new Map(
      conflicts.map((conflict) => [conflict.id, conflict])
    );
    for (const row of storedCommitRows) {
      const commits = commitsByObservation.get(row.observationId) ?? [];
      if (
        row.position !== commits.length ||
        conflictsById.get(row.observationId)?.repositoryId !== row.repositoryId
      ) {
        throw new GitHubPushObservationEvidenceConflictError();
      }
      commits.push(row.sha);
      commitsByObservation.set(row.observationId, commits);
    }
    const byPush = new Map(
      conflicts.map((conflict) => [
        pushObservationIdentityKey(conflict),
        conflict,
      ])
    );
    const bySource = new Map(
      conflicts.map((conflict) => [pushSourceIdentityKey(conflict), conflict])
    );

    for (const input of duplicateInputs) {
      const sourceConflict = bySource.get(pushSourceIdentityKey(input));
      const pushConflict = byPush.get(pushInputIdentityKey(input));
      if (
        (sourceConflict !== undefined &&
          pushConflict !== undefined &&
          sourceConflict.id !== pushConflict.id) ||
        (sourceConflict !== undefined &&
          pushObservationIdentityKey(sourceConflict) !==
            pushInputIdentityKey(input))
      ) {
        throw new GitHubPushObservationEvidenceConflictError();
      }
      const conflict = pushConflict ?? sourceConflict;
      if (conflict === undefined) {
        throw new GitHubPushObservationEvidenceConflictError();
      }
      const exact =
        input.push.size !== null &&
        input.push.commitShas.length === input.push.size;
      const storedCommits = commitsByObservation.get(conflict.id) ?? [];
      if (
        (input.push.size !== null &&
          conflict.expectedCommitCount !== null &&
          input.push.size !== conflict.expectedCommitCount) ||
        (exact &&
          !isOrderedSubsequence(storedCommits, input.push.commitShas)) ||
        (!exact &&
          storedCommits.length > 0 &&
          input.push.commitShas.length > 0 &&
          !isOrderedSubsequence(storedCommits, input.push.commitShas) &&
          !isOrderedSubsequence(input.push.commitShas, storedCommits))
      ) {
        throw new GitHubPushObservationEvidenceConflictError();
      }
      if (conflict.source !== "refs" || !exact) {
        continue;
      }

      const complete = input.push.size === 0;
      await transaction
        .update(githubPushObservations)
        .set({
          account: input.push.pushedBy,
          attemptCount: 0,
          completedAt: complete ? input.observedAt : null,
          errorCode: null,
          expectedCommitCount: input.push.size,
          leaseToken: null,
          leaseUntil: null,
          providerCreatedAt:
            input.providerCreatedAt ?? conflict.providerCreatedAt,
          state: complete ? "complete" : "pending",
        })
        .where(eq(githubPushObservations.id, conflict.id));
      await transaction
        .delete(githubPushObservationCommits)
        .where(eq(githubPushObservationCommits.observationId, conflict.id));
      if (input.push.commitShas.length > 0) {
        await transaction.insert(githubPushObservationCommits).values(
          input.push.commitShas.map((sha, position) => ({
            observationId: conflict.id,
            position,
            repositoryId: input.push.repository.id,
            sha,
          }))
        );
      }
      promoted += 1;
      promotedCommitCount += input.push.commitShas.length;
    }
  }
  for (
    let offset = 0;
    offset < commitRows.length;
    offset += PUSH_COMMIT_INSERT_BATCH
  ) {
    await transaction
      .insert(githubPushObservationCommits)
      .values(commitRows.slice(offset, offset + PUSH_COMMIT_INSERT_BATCH));
  }
  return {
    duplicates: inputs.length - inserted.length - promoted,
    knownCommits: commitRows.length + promotedCommitCount,
    pushes: inserted.length + promoted,
  };
};

const ZERO_SHA = "0".repeat(40);

const refObservationSourceId = (input: {
  afterSha: string;
  beforeSha: string;
  refName: string;
  repositoryId: string;
}) =>
  `ref:${createHash("sha256")
    .update(
      [input.repositoryId, input.refName, input.beforeSha, input.afterSha].join(
        "\0"
      )
    )
    .digest("hex")}`;

// oxlint-disable-next-line eslint/max-classes-per-file -- Lease loss is recoverable and must remain distinguishable by callers.
class GitHubRefReconciliationLeaseLostError extends Error {
  constructor() {
    super("The GitHub ref reconciliation lease was lost.");
    this.name = "GitHubRefReconciliationLeaseLostError";
  }
}

const refCheckpointColumns = (kind: GitHubRepositoryRefKind) =>
  kind === "head"
    ? {
        cursor: githubAccountCheckpoints.headRefCursorRepositoryId,
        cycleStartedAt: githubAccountCheckpoints.headRefCycleStartedAt,
        lastAttemptedAt: githubAccountCheckpoints.headRefLastAttemptedAt,
        lastSucceededAt: githubAccountCheckpoints.headRefLastSucceededAt,
        leaseToken: githubAccountCheckpoints.headRefLeaseToken,
        leaseUntil: githubAccountCheckpoints.headRefLeaseUntil,
        nextPage: githubAccountCheckpoints.headRefNextPage,
        scanStartedAt: githubAccountCheckpoints.headRefScanStartedAt,
      }
    : {
        cursor: githubAccountCheckpoints.tagRefCursorRepositoryId,
        cycleStartedAt: githubAccountCheckpoints.tagRefCycleStartedAt,
        lastAttemptedAt: githubAccountCheckpoints.tagRefLastAttemptedAt,
        lastSucceededAt: githubAccountCheckpoints.tagRefLastSucceededAt,
        leaseToken: githubAccountCheckpoints.tagRefLeaseToken,
        leaseUntil: githubAccountCheckpoints.tagRefLeaseUntil,
        nextPage: githubAccountCheckpoints.tagRefNextPage,
        scanStartedAt: githubAccountCheckpoints.tagRefScanStartedAt,
      };

const refLeaseValues = (
  kind: GitHubRepositoryRefKind,
  input: { leaseToken: string | null; leaseUntil: Date | null }
) =>
  kind === "head"
    ? {
        headRefLeaseToken: input.leaseToken,
        headRefLeaseUntil: input.leaseUntil,
      }
    : {
        tagRefLeaseToken: input.leaseToken,
        tagRefLeaseUntil: input.leaseUntil,
      };

export const acquireGitHubRefReconciliationLease = async (input: {
  account: TrackedGitHubAccount;
  kind: GitHubRepositoryRefKind;
  leaseDurationMs: number;
  now?: Date;
}): Promise<GitHubRefReconciliationLease | null> => {
  if (
    !Number.isSafeInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 1000 ||
    input.leaseDurationMs > 300_000
  ) {
    throw new RangeError("The GitHub ref lease duration is invalid.");
  }
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + input.leaseDurationMs);
  const leaseToken = randomUUID();
  const columns = refCheckpointColumns(input.kind);
  return await getDatabase().transaction(async (transaction) => {
    await transaction
      .insert(githubAccountCheckpoints)
      .values({ account: input.account })
      .onConflictDoNothing({ target: githubAccountCheckpoints.account });
    const attemptedValues =
      input.kind === "head"
        ? {
            headRefCycleStartedAt: sql`coalesce(${columns.cycleStartedAt}, ${sql.param(now, columns.cycleStartedAt)})`,
            headRefLastAttemptedAt: now,
          }
        : {
            tagRefCycleStartedAt: sql`coalesce(${columns.cycleStartedAt}, ${sql.param(now, columns.cycleStartedAt)})`,
            tagRefLastAttemptedAt: now,
          };
    const [leased] = await transaction
      .update(githubAccountCheckpoints)
      .set({
        ...attemptedValues,
        ...refLeaseValues(input.kind, { leaseToken, leaseUntil }),
      })
      .where(
        and(
          eq(githubAccountCheckpoints.account, input.account),
          eq(githubAccountCheckpoints.paused, false),
          or(isNull(columns.leaseUntil), lte(columns.leaseUntil, now))
        )
      )
      .returning({
        cursorRepositoryId: columns.cursor,
        nextPage: columns.nextPage,
        scanStartedAt: columns.scanStartedAt,
      });
    if (leased === undefined) {
      return null;
    }
    if ((leased.nextPage === null) !== (leased.scanStartedAt === null)) {
      throw new Error("The GitHub ref scan checkpoint is inconsistent.");
    }
    return { ...leased, kind: input.kind, leaseToken };
  });
};

const updateLeasedRefCheckpoint = async (
  transaction: DatabaseTransaction,
  input: {
    account: TrackedGitHubAccount;
    cursorRepositoryId: string;
    kind: GitHubRepositoryRefKind;
    leaseToken: string;
    nextPage: number | null;
    scanStartedAt: Date | null;
  }
) => {
  const columns = refCheckpointColumns(input.kind);
  const progressValues =
    input.kind === "head"
      ? {
          headRefCursorRepositoryId: input.cursorRepositoryId,
          headRefNextPage: input.nextPage,
          headRefScanStartedAt: input.scanStartedAt,
        }
      : {
          tagRefCursorRepositoryId: input.cursorRepositoryId,
          tagRefNextPage: input.nextPage,
          tagRefScanStartedAt: input.scanStartedAt,
        };
  const updated = await transaction
    .update(githubAccountCheckpoints)
    .set(progressValues)
    .where(
      and(
        eq(githubAccountCheckpoints.account, input.account),
        eq(columns.leaseToken, input.leaseToken)
      )
    )
    .returning({ account: githubAccountCheckpoints.account });
  if (updated.length !== 1) {
    throw new GitHubRefReconciliationLeaseLostError();
  }
};

const refKindRepositoryValues = (
  kind: GitHubRepositoryRefKind,
  reconciledAt: Date
) =>
  kind === "head"
    ? { headsLastReconciledAt: reconciledAt }
    : { tagsLastReconciledAt: reconciledAt };

const refKindRepositoryColumn = (kind: GitHubRepositoryRefKind) =>
  kind === "head"
    ? githubRepositories.headsLastReconciledAt
    : githubRepositories.tagsLastReconciledAt;

const canonicalHeadRefName = (defaultBranch: string | null) =>
  defaultBranch === null ? null : `refs/heads/${defaultBranch}`;

const initialRefProjectionRelevance = (
  ref: GitHubRepositoryRefSnapshot,
  canonicalRefName: string | null,
  establishingBaseline: boolean
) =>
  ref.kind === "head" &&
  (ref.refName === canonicalRefName || !establishingBaseline);

const incomingCanonicalRefCondition = (canonicalRefName: string | null) =>
  canonicalRefName === null
    ? sql`false`
    : sql`excluded.ref_name = ${canonicalRefName}`;

export const persistGitHubRepositoryRefPage = async (input: {
  account: TrackedGitHubAccount;
  complete: boolean;
  kind: GitHubRepositoryRefKind;
  leaseToken: string;
  nextPage: number | null;
  observedAt: Date;
  refs: readonly GitHubRepositoryRefSnapshot[];
  repository: GitHubRepositoryFacts;
  scanStartedAt: Date;
}): Promise<GitHubRepositoryRefIntakeResult> => {
  if (
    input.refs.some((ref) => ref.kind !== input.kind) ||
    input.complete !== (input.nextPage === null) ||
    (!input.complete && input.nextPage !== null && input.nextPage < 2)
  ) {
    throw new RangeError("The GitHub reference page state is invalid.");
  }
  const refNames = input.refs.map((ref) => ref.refName);
  if (new Set(refNames).size !== refNames.length) {
    throw new TypeError("The GitHub reference page contains duplicates.");
  }

  // oxlint-disable-next-line eslint/complexity -- One transaction owns stale-scan rejection, lineage assignment, ref publication, and its checkpoint.
  return await getDatabase().transaction(async (transaction) => {
    await upsertGitHubRepository(
      transaction,
      input.repository,
      input.observedAt
    );
    const existingHeadLineages =
      input.kind === "head"
        ? await transaction
            .select({
              active: githubRepositoryRefs.active,
              branchLineageId: githubRepositoryRefs.branchLineageId,
              headSha: githubRepositoryRefs.headSha,
              refName: githubRepositoryRefs.refName,
            })
            .from(githubRepositoryRefs)
            .where(
              and(
                eq(githubRepositoryRefs.repositoryId, input.repository.id),
                eq(githubRepositoryRefs.kind, "head")
              )
            )
        : [];
    const plannedLineages = planGitHubBranchLineages(
      existingHeadLineages.flatMap((ref) =>
        ref.branchLineageId === null
          ? []
          : [{ ...ref, branchLineageId: ref.branchLineageId }]
      ),
      input.kind === "head" ? input.refs : [],
      randomUUID
    );
    const [repositoryState] = await transaction
      .select({
        lastReconciledAt: refKindRepositoryColumn(input.kind),
      })
      .from(githubRepositories)
      .where(eq(githubRepositories.id, input.repository.id))
      .limit(1);
    if (repositoryState === undefined) {
      throw new Error("The GitHub repository checkpoint could not be read.");
    }
    const establishingBaseline = repositoryState.lastReconciledAt === null;
    const existing =
      refNames.length === 0
        ? []
        : await transaction
            .select({
              active: githubRepositoryRefs.active,
              branchLineageId: githubRepositoryRefs.branchLineageId,
              headSha: githubRepositoryRefs.headSha,
              lastObservedAt: githubRepositoryRefs.lastObservedAt,
              projectionRelevant: githubRepositoryRefs.projectionRelevant,
              refName: githubRepositoryRefs.refName,
            })
            .from(githubRepositoryRefs)
            .where(
              and(
                eq(githubRepositoryRefs.repositoryId, input.repository.id),
                inArray(githubRepositoryRefs.refName, refNames)
              )
            );
    const incomingHeads = [...new Set(input.refs.map((ref) => ref.headSha))];
    const knownHeads =
      incomingHeads.length === 0
        ? []
        : await transaction
            .select({ headSha: githubRepositoryRefs.headSha })
            .from(githubRepositoryRefs)
            .where(
              and(
                eq(githubRepositoryRefs.repositoryId, input.repository.id),
                eq(githubRepositoryRefs.active, true),
                inArray(githubRepositoryRefs.headSha, incomingHeads)
              )
            );
    const existingByName = new Map(existing.map((ref) => [ref.refName, ref]));
    const knownActiveHeads = new Set(knownHeads.map((ref) => ref.headSha));
    const canonicalRefName = canonicalHeadRefName(
      input.repository.defaultBranch
    );
    const isCanonicalIncomingRef =
      incomingCanonicalRefCondition(canonicalRefName);
    const incomingProjectionInputChanged =
      input.kind === "head" &&
      input.refs.some((ref) => {
        const previous = existingByName.get(ref.refName);
        if (
          previous !== undefined &&
          previous.lastObservedAt > input.scanStartedAt
        ) {
          return false;
        }
        const branchLineageId = plannedLineages.get(ref.refName);
        if (branchLineageId === undefined) {
          throw new Error("A GitHub head lineage was not planned.");
        }
        if (previous === undefined) {
          return initialRefProjectionRelevance(
            ref,
            canonicalRefName,
            establishingBaseline
          );
        }
        const nextProjectionRelevant =
          previous.projectionRelevant ||
          !previous.active ||
          previous.headSha !== ref.headSha ||
          ref.refName === canonicalRefName;
        return (
          nextProjectionRelevant &&
          (!previous.projectionRelevant ||
            !previous.active ||
            previous.headSha !== ref.headSha ||
            previous.branchLineageId !== branchLineageId)
        );
      });
    const observedRanges = new Set<string>();
    const observations: PushObservationInput[] = [];
    for (const ref of input.refs) {
      const previous = existingByName.get(ref.refName);
      if (
        previous !== undefined &&
        (previous.lastObservedAt > input.scanStartedAt ||
          (previous.active && previous.headSha === ref.headSha))
      ) {
        knownActiveHeads.add(ref.headSha);
        continue;
      }
      const beforeSha = previous?.active === true ? previous.headSha : ZERO_SHA;
      const range = `${beforeSha}:${ref.headSha}`;
      if (
        !establishingBaseline &&
        !knownActiveHeads.has(ref.headSha) &&
        !observedRanges.has(range)
      ) {
        observations.push({
          observedAt: input.observedAt,
          providerCreatedAt: null,
          push: {
            before: beforeSha,
            commitShas: [],
            head: ref.headSha,
            pushedBy: input.account,
            ref: ref.refName,
            repository: input.repository,
            size: null,
          },
          source: "refs",
          sourceId: refObservationSourceId({
            afterSha: ref.headSha,
            beforeSha,
            refName: ref.refName,
            repositoryId: input.repository.id,
          }),
        });
        observedRanges.add(range);
      }
      knownActiveHeads.add(ref.headSha);
    }

    const persisted = await insertPushObservations(transaction, observations);
    if (input.refs.length > 0) {
      await transaction
        .insert(githubRepositoryRefs)
        .values(
          input.refs.map((ref) => ({
            active: true,
            branchLineageId:
              ref.kind === "head"
                ? (plannedLineages.get(ref.refName) ??
                  (() => {
                    throw new Error("A GitHub head lineage was not planned.");
                  })())
                : null,
            firstObservedAt: input.scanStartedAt,
            headSha: ref.headSha,
            kind: ref.kind,
            lastObservedAt: input.scanStartedAt,
            projectionRelevant: initialRefProjectionRelevance(
              ref,
              canonicalRefName,
              establishingBaseline
            ),
            refName: ref.refName,
            repositoryId: input.repository.id,
          }))
        )
        .onConflictDoUpdate({
          set: {
            active: true,
            branchLineageId: sql`excluded.branch_lineage_id`,
            headSha: sql`excluded.head_sha`,
            kind: sql`excluded.kind`,
            lastObservedAt: input.scanStartedAt,
            projectionRelevant: sql`CASE
              WHEN excluded.kind <> 'head' THEN false
              WHEN ${githubRepositoryRefs.projectionRelevant} THEN true
              WHEN NOT ${githubRepositoryRefs.active}
                OR ${githubRepositoryRefs.headSha} <> excluded.head_sha
              THEN true
              WHEN ${isCanonicalIncomingRef} THEN true
              ELSE false
            END`,
            repairLeaseToken: sql`CASE
              WHEN excluded.kind = 'head'
                AND (
                  NOT ${githubRepositoryRefs.active}
                  OR ${githubRepositoryRefs.headSha} <> excluded.head_sha
                  OR ${githubRepositoryRefs.branchLineageId} IS DISTINCT FROM excluded.branch_lineage_id
                )
              THEN NULL
              ELSE ${githubRepositoryRefs.repairLeaseToken}
            END`,
            repairLeaseUntil: sql`CASE
              WHEN excluded.kind = 'head'
                AND (
                  NOT ${githubRepositoryRefs.active}
                  OR ${githubRepositoryRefs.headSha} <> excluded.head_sha
                  OR ${githubRepositoryRefs.branchLineageId} IS DISTINCT FROM excluded.branch_lineage_id
                )
              THEN NULL
              ELSE ${githubRepositoryRefs.repairLeaseUntil}
            END`,
          },
          setWhere: lte(
            githubRepositoryRefs.lastObservedAt,
            input.scanStartedAt
          ),
          target: [
            githubRepositoryRefs.repositoryId,
            githubRepositoryRefs.refName,
          ],
        });
    }
    const deactivated = input.complete
      ? await transaction
          .update(githubRepositoryRefs)
          .set({
            active: false,
            lastObservedAt: input.scanStartedAt,
            repairLeaseToken: null,
            repairLeaseUntil: null,
          })
          .where(
            and(
              eq(githubRepositoryRefs.repositoryId, input.repository.id),
              eq(githubRepositoryRefs.kind, input.kind),
              eq(githubRepositoryRefs.active, true),
              lt(githubRepositoryRefs.lastObservedAt, input.scanStartedAt)
            )
          )
          .returning({
            projectionRelevant: githubRepositoryRefs.projectionRelevant,
          })
      : [];
    if (input.complete) {
      await transaction
        .update(githubRepositories)
        .set(refKindRepositoryValues(input.kind, input.observedAt))
        .where(eq(githubRepositories.id, input.repository.id));
    }
    await updateLeasedRefCheckpoint(transaction, {
      account: input.account,
      cursorRepositoryId: input.repository.id,
      kind: input.kind,
      leaseToken: input.leaseToken,
      nextPage: input.nextPage,
      scanStartedAt: input.complete ? null : input.scanStartedAt,
    });
    const headProjectionInputChanged =
      input.kind === "head" &&
      ((input.complete && establishingBaseline) ||
        incomingProjectionInputChanged ||
        deactivated.some((ref) => ref.projectionRelevant));
    if (headProjectionInputChanged) {
      await requestGitHubWorkUnitProjection(transaction);
    }
    return {
      knownCommits: persisted.knownCommits,
      pushes: persisted.pushes,
      refs: input.refs.length,
    };
  });
};

export const skipGitHubRefRepository = async (input: {
  account: TrackedGitHubAccount;
  kind: GitHubRepositoryRefKind;
  leaseToken: string;
  repositoryId: string;
}) => {
  await getDatabase().transaction(async (transaction) => {
    await updateLeasedRefCheckpoint(transaction, {
      account: input.account,
      cursorRepositoryId: input.repositoryId,
      kind: input.kind,
      leaseToken: input.leaseToken,
      nextPage: null,
      scanStartedAt: null,
    });
  });
};

export const finishGitHubRefReconciliationLease = async (input: {
  account: TrackedGitHubAccount;
  complete: boolean;
  kind: GitHubRepositoryRefKind;
  leaseToken: string;
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  const columns = refCheckpointColumns(input.kind);
  const completionValues =
    input.kind === "head"
      ? {
          ...(input.complete
            ? {
                headRefCursorRepositoryId: null,
                headRefCycleStartedAt: null,
                headRefNextPage: null,
                headRefScanStartedAt: null,
              }
            : {}),
          headRefLastSucceededAt: now,
        }
      : {
          ...(input.complete
            ? {
                tagRefCursorRepositoryId: null,
                tagRefCycleStartedAt: null,
                tagRefNextPage: null,
                tagRefScanStartedAt: null,
              }
            : {}),
          tagRefLastSucceededAt: now,
        };
  const updated = await getDatabase()
    .update(githubAccountCheckpoints)
    .set({
      ...completionValues,
      ...refLeaseValues(input.kind, { leaseToken: null, leaseUntil: null }),
    })
    .where(
      and(
        eq(githubAccountCheckpoints.account, input.account),
        eq(columns.leaseToken, input.leaseToken)
      )
    )
    .returning({ account: githubAccountCheckpoints.account });
  if (updated.length !== 1) {
    throw new GitHubRefReconciliationLeaseLostError();
  }
};

export const releaseGitHubRefReconciliationLease = async (input: {
  account: TrackedGitHubAccount;
  kind: GitHubRepositoryRefKind;
  leaseToken: string;
}) => {
  const columns = refCheckpointColumns(input.kind);
  await getDatabase()
    .update(githubAccountCheckpoints)
    .set(refLeaseValues(input.kind, { leaseToken: null, leaseUntil: null }))
    .where(
      and(
        eq(githubAccountCheckpoints.account, input.account),
        eq(columns.leaseToken, input.leaseToken)
      )
    );
};

export interface WebhookDeliveryInput {
  account: TrackedGitHubAccount | null;
  action: string | null;
  deliveryId: string;
  event: string;
  repositoryId: string | null;
}

const insertWebhookDelivery = async (
  transaction: DatabaseTransaction,
  input: WebhookDeliveryInput
) => {
  const [inserted] = await transaction
    .insert(githubWebhookDeliveries)
    .values({
      accepted: false,
      account: input.account,
      action: input.action,
      deliveryId: input.deliveryId,
      event: input.event,
      repositoryId: input.repositoryId,
    })
    .onConflictDoNothing({ target: githubWebhookDeliveries.deliveryId })
    .returning({ deliveryId: githubWebhookDeliveries.deliveryId });
  if (inserted !== undefined) {
    return { accepted: false, inserted: true };
  }
  const [existing] = await transaction
    .select({ accepted: githubWebhookDeliveries.accepted })
    .from(githubWebhookDeliveries)
    .where(eq(githubWebhookDeliveries.deliveryId, input.deliveryId))
    .limit(1);
  if (existing === undefined) {
    throw new Error("The GitHub webhook delivery could not be deduplicated.");
  }
  return { accepted: existing.accepted, inserted: false };
};

const markWebhookDeliveryAccepted = async (
  transaction: DatabaseTransaction,
  input: WebhookDeliveryInput,
  accepted: boolean
) => {
  await transaction
    .update(githubWebhookDeliveries)
    .set({
      accepted,
      account: input.account,
      action: input.action,
      repositoryId: input.repositoryId,
    })
    .where(eq(githubWebhookDeliveries.deliveryId, input.deliveryId));
};

const upsertPullRequest = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  observedAt: Date
) => {
  const stored = await persistPullRequestSnapshotInTransaction(
    transaction,
    account,
    pullRequest,
    { authority: "observed" },
    observedAt
  );
  return stored?.snapshotChanged ?? false;
};

const TERMINAL_PULL_REQUEST_EVENT_ACTIONS = new Set(["closed", "merged"]);

const signalKnownPullRequestReconciliation = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount,
  signal: GitHubPullRequestEventSignal,
  occurredAt: Date,
  observedAt: Date
) => {
  const [known] = await transaction
    .select({
      nodeId: githubPullRequests.nodeId,
      providerUpdatedAt: githubPullRequests.providerUpdatedAt,
      repositoryId: githubPullRequests.repositoryId,
      state: githubPullRequests.state,
    })
    .from(githubPullRequests)
    .where(
      and(
        eq(githubPullRequests.account, account),
        eq(githubPullRequests.repositoryId, signal.repository.id),
        eq(githubPullRequests.number, signal.number)
      )
    )
    .for("update");
  if (known === undefined) {
    return false;
  }
  if (occurredAt < known.providerUpdatedAt) {
    return false;
  }

  const promoteToProvisionalClosed =
    TERMINAL_PULL_REQUEST_EVENT_ACTIONS.has(signal.action) &&
    known.state === "open";
  const retryEvidenceImproved =
    occurredAt > known.providerUpdatedAt ||
    TERMINAL_PULL_REQUEST_EVENT_ACTIONS.has(signal.action);
  await transaction
    .update(githubPullRequests)
    .set({
      nextReconcileAt: observedAt,
      ...(retryEvidenceImproved
        ? { reconcileAttempts: 0, reconcileError: null }
        : {}),
      ...(promoteToProvisionalClosed
        ? {
            closedAt: occurredAt,
            state: "closed" as const,
            terminalAt: occurredAt,
          }
        : {}),
    })
    .where(
      and(
        eq(githubPullRequests.account, account),
        eq(githubPullRequests.nodeId, known.nodeId)
      )
    );
  if (promoteToProvisionalClosed) {
    await requestGitHubWorkUnitProjection(transaction);
  }
  return true;
};

const persistPullRequestSignal = async (
  transaction: DatabaseTransaction,
  input: {
    account: TrackedGitHubAccount;
    eventId: string;
    observedAt: Date;
    occurredAt: Date;
    signal: GitHubPullRequestEventSignal;
  }
) => {
  await transaction
    .insert(githubPullRequestSignals)
    .values({
      account: input.account,
      action: input.signal.action,
      eventId: input.eventId,
      number: input.signal.number,
      observedAt: input.observedAt,
      occurredAt: input.occurredAt,
      repositoryId: input.signal.repository.id,
      repositoryNameSnapshot: input.signal.repository.fullName,
    })
    .onConflictDoNothing({
      target: [
        githubPullRequestSignals.account,
        githubPullRequestSignals.eventId,
      ],
    });
};

const lockWebhookAccount = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount
) => {
  await transaction
    .insert(githubAccountCheckpoints)
    .values({ account })
    .onConflictDoNothing({ target: githubAccountCheckpoints.account });
  const [checkpoint] = await transaction
    .select({ paused: githubAccountCheckpoints.paused })
    .from(githubAccountCheckpoints)
    .where(eq(githubAccountCheckpoints.account, account))
    .for("update");
  if (checkpoint === undefined) {
    throw new Error("The GitHub account checkpoint could not be locked.");
  }
  return checkpoint.paused;
};

const duplicateWebhookResult = (
  accepted: boolean
): GitHubWebhookIntakeResult => ({
  duplicate: true,
  ignored: !accepted,
  issues: 0,
  knownCommits: 0,
  paused: false,
  pullRequests: 0,
  pushes: 0,
});

export const persistIgnoredGitHubWebhookDelivery = async (
  input: WebhookDeliveryInput
): Promise<GitHubWebhookIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const receipt = await insertWebhookDelivery(transaction, input);
    return receipt.inserted
      ? {
          duplicate: false,
          ignored: true,
          issues: 0,
          knownCommits: 0,
          paused: false,
          pullRequests: 0,
          pushes: 0,
        }
      : duplicateWebhookResult(receipt.accepted);
  });

export const persistGitHubWebhookHeadSignal = async (
  deliveryId: string,
  signal: GitHubHeadSignal
): Promise<GitHubWebhookIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const delivery = {
      account: null,
      action: signal.operation,
      deliveryId,
      event: "push",
      repositoryId: signal.repository.id,
    } as const;
    const receipt = await insertWebhookDelivery(transaction, delivery);
    if (!receipt.inserted) {
      return duplicateWebhookResult(receipt.accepted);
    }

    const observedAt = new Date();
    await upsertGitHubRepository(transaction, signal.repository, observedAt);
    if (signal.operation === "delete") {
      await transaction
        .update(githubRepositoryRefs)
        .set({
          active: false,
          lastObservedAt: observedAt,
          repairLeaseToken: null,
          repairLeaseUntil: null,
        })
        .where(
          and(
            eq(githubRepositoryRefs.repositoryId, signal.repository.id),
            eq(githubRepositoryRefs.refName, signal.refName),
            eq(githubRepositoryRefs.kind, "head")
          )
        );
    } else {
      const headSha = signal.afterSha;
      if (headSha === null) {
        throw new Error("An active GitHub head signal has no head SHA.");
      }
      const existingHeadLineages = await transaction
        .select({
          active: githubRepositoryRefs.active,
          branchLineageId: githubRepositoryRefs.branchLineageId,
          headSha: githubRepositoryRefs.headSha,
          refName: githubRepositoryRefs.refName,
        })
        .from(githubRepositoryRefs)
        .where(
          and(
            eq(githubRepositoryRefs.repositoryId, signal.repository.id),
            eq(githubRepositoryRefs.kind, "head")
          )
        );
      const branchLineageId = planGitHubBranchLineages(
        existingHeadLineages.flatMap((ref) =>
          ref.branchLineageId === null
            ? []
            : [{ ...ref, branchLineageId: ref.branchLineageId }]
        ),
        [{ headSha, refName: signal.refName }],
        randomUUID
      ).get(signal.refName);
      if (branchLineageId === undefined) {
        throw new Error("A GitHub webhook head lineage was not planned.");
      }
      await transaction
        .insert(githubRepositoryRefs)
        .values({
          active: true,
          branchLineageId,
          firstObservedAt: observedAt,
          headSha,
          kind: "head",
          lastObservedAt: observedAt,
          projectionRelevant: true,
          refName: signal.refName,
          repositoryId: signal.repository.id,
        })
        .onConflictDoUpdate({
          set: {
            active: true,
            branchLineageId,
            headSha,
            lastObservedAt: observedAt,
            projectionRelevant: true,
            repairLeaseToken: sql`CASE
              WHEN NOT ${githubRepositoryRefs.active}
                OR ${githubRepositoryRefs.headSha} <> ${headSha}
                OR ${githubRepositoryRefs.branchLineageId} IS DISTINCT FROM ${branchLineageId}
              THEN NULL
              ELSE ${githubRepositoryRefs.repairLeaseToken}
            END`,
            repairLeaseUntil: sql`CASE
              WHEN NOT ${githubRepositoryRefs.active}
                OR ${githubRepositoryRefs.headSha} <> ${headSha}
                OR ${githubRepositoryRefs.branchLineageId} IS DISTINCT FROM ${branchLineageId}
              THEN NULL
              ELSE ${githubRepositoryRefs.repairLeaseUntil}
            END`,
          },
          target: [
            githubRepositoryRefs.repositoryId,
            githubRepositoryRefs.refName,
          ],
        });
    }
    await markWebhookDeliveryAccepted(transaction, delivery, true);
    await requestGitHubWorkUnitProjection(transaction);
    return {
      duplicate: false,
      ignored: false,
      issues: 0,
      knownCommits: 0,
      paused: false,
      pullRequests: 0,
      pushes: 1,
    };
  });

export const persistGitHubWebhookIssue = async (
  deliveryId: string,
  issue: GitHubIssue
): Promise<GitHubWebhookIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const delivery = {
      account: issue.account,
      action: "opened",
      deliveryId,
      event: "issues",
      repositoryId: issue.repository.id,
    } as const;
    const receipt = await insertWebhookDelivery(transaction, delivery);
    if (!receipt.inserted) {
      return duplicateWebhookResult(receipt.accepted);
    }
    if (await lockWebhookAccount(transaction, issue.account)) {
      await markWebhookDeliveryAccepted(transaction, delivery, false);
      return {
        duplicate: false,
        ignored: true,
        issues: 0,
        knownCommits: 0,
        paused: true,
        pullRequests: 0,
        pushes: 0,
      };
    }
    const inserted = await persistIssue(transaction, issue, new Date());
    await markWebhookDeliveryAccepted(transaction, delivery, true);
    return {
      duplicate: false,
      ignored: false,
      issues: inserted ? 1 : 0,
      knownCommits: 0,
      paused: false,
      pullRequests: 0,
      pushes: 0,
    };
  });

export const persistGitHubWebhookPullRequest = async (
  deliveryId: string,
  account: TrackedGitHubAccount | null,
  pullRequest: GitHubPullRequest
): Promise<GitHubWebhookIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const initialDelivery = {
      account,
      action: pullRequest.action,
      deliveryId,
      event: "pull_request",
      repositoryId: pullRequest.repository.id,
    } as const;
    const receipt = await insertWebhookDelivery(transaction, initialDelivery);
    if (!receipt.inserted) {
      return duplicateWebhookResult(receipt.accepted);
    }

    let resolvedAccount = account;
    if (resolvedAccount === null) {
      const [knownPullRequest] = await transaction
        .select({ account: githubPullRequests.account })
        .from(githubPullRequests)
        .where(eq(githubPullRequests.nodeId, pullRequest.nodeId))
        .limit(1);
      resolvedAccount = trackedGitHubAccountFrom(knownPullRequest?.account);
    }
    if (resolvedAccount === null) {
      return {
        duplicate: false,
        ignored: true,
        issues: 0,
        knownCommits: 0,
        paused: false,
        pullRequests: 0,
        pushes: 0,
      };
    }
    const delivery = { ...initialDelivery, account: resolvedAccount };
    if (await lockWebhookAccount(transaction, resolvedAccount)) {
      await markWebhookDeliveryAccepted(transaction, delivery, false);
      return {
        duplicate: false,
        ignored: true,
        issues: 0,
        knownCommits: 0,
        paused: true,
        pullRequests: 0,
        pushes: 0,
      };
    }
    const changed = await upsertPullRequest(
      transaction,
      resolvedAccount,
      pullRequest,
      new Date()
    );
    await markWebhookDeliveryAccepted(transaction, delivery, true);
    return {
      duplicate: false,
      ignored: false,
      issues: 0,
      knownCommits: 0,
      paused: false,
      pullRequests: changed ? 1 : 0,
      pushes: 0,
    };
  });

const updateCheckpoint = async (
  transaction: DatabaseTransaction,
  input: {
    account: TrackedGitHubAccount;
    eventsEtag?: string | null;
    eventsNextPollAt?: Date | null;
    expectedCheckpoint: GitHubAccountCheckpoint | null;
    gap: {
      expectedEventId: string;
      oldestAvailableEventId: string;
    } | null;
    latestEventId: string | null;
  },
  now: Date
) => {
  const gapValues =
    input.gap === null
      ? {}
      : {
          gapDetectedAt: now,
          gapExpectedEventId: input.gap.expectedEventId,
          gapOldestAvailableEventId: input.gap.oldestAvailableEventId,
          gapState: "detected" as const,
        };
  if (input.expectedCheckpoint === null) {
    const inserted = await transaction
      .insert(githubAccountCheckpoints)
      .values({
        account: input.account,
        eventsEtag: input.eventsEtag ?? null,
        eventsLastAttemptedAt: now,
        eventsLastSucceededAt: now,
        eventsNextPollAt: input.eventsNextPollAt ?? null,
        latestEventId: input.latestEventId,
        ...gapValues,
      })
      .onConflictDoNothing({ target: githubAccountCheckpoints.account })
      .returning({ account: githubAccountCheckpoints.account });
    if (inserted.length !== 1) {
      throw new CheckpointConflictError();
    }
    return;
  }

  const checkpointCondition =
    input.expectedCheckpoint.latestEventId === null
      ? isNull(githubAccountCheckpoints.latestEventId)
      : eq(
          githubAccountCheckpoints.latestEventId,
          input.expectedCheckpoint.latestEventId
        );
  const pollAttemptCondition =
    input.expectedCheckpoint.eventsLastAttemptedAt === null
      ? isNull(githubAccountCheckpoints.eventsLastAttemptedAt)
      : eq(
          githubAccountCheckpoints.eventsLastAttemptedAt,
          input.expectedCheckpoint.eventsLastAttemptedAt
        );
  const updated = await transaction
    .update(githubAccountCheckpoints)
    .set({
      eventsEtag: input.eventsEtag ?? null,
      eventsLastAttemptedAt:
        input.expectedCheckpoint.eventsLastAttemptedAt ?? now,
      eventsLastSucceededAt: now,
      ...(input.eventsNextPollAt === undefined
        ? {}
        : { eventsNextPollAt: input.eventsNextPollAt }),
      latestEventId: input.latestEventId,
      ...gapValues,
    })
    .where(
      and(
        eq(githubAccountCheckpoints.account, input.account),
        checkpointCondition,
        pollAttemptCondition,
        eq(githubAccountCheckpoints.paused, input.expectedCheckpoint.paused)
      )
    )
    .returning({ account: githubAccountCheckpoints.account });
  if (updated.length !== 1) {
    throw new CheckpointConflictError();
  }
};

export const persistAccountIntake = async (input: {
  account: TrackedGitHubAccount;
  events: readonly GitHubEvent[];
  eventsEtag?: string | null;
  eventsNextPollAt?: Date | null;
  expectedCheckpoint: GitHubAccountCheckpoint | null;
  gap: {
    expectedEventId: string;
    oldestAvailableEventId: string;
  } | null;
  latestEventId: string | null;
}): Promise<GitHubIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const result: GitHubIntakeResult = {
      issues: 0,
      knownCommits: 0,
      pullRequests: 0,
      pushes: 0,
    };
    const pushInputs = input.events.flatMap((event) =>
      event.push === null
        ? []
        : [
            {
              observedAt: now,
              providerCreatedAt: new Date(event.occurredAt),
              push: event.push,
              source: "events" as const,
              sourceId: event.id,
            },
          ]
    );
    const persistedPushes = await insertPushObservations(
      transaction,
      pushInputs
    );
    result.knownCommits = persistedPushes.knownCommits;
    result.pushes = persistedPushes.pushes;
    for (const event of input.events) {
      if (event.issue !== null) {
        if (event.issue.account !== input.account) {
          throw new Error(
            "A GitHub issue was attributed to the wrong account."
          );
        }
        if (await persistIssue(transaction, event.issue, now)) {
          result.issues += 1;
        }
      }
      if (event.pullRequest !== null) {
        let pullRequestAccount =
          event.pullRequest.authorAccount === input.account
            ? input.account
            : null;
        if (event.pullRequest.authorAccount === null) {
          const [knownPullRequest] = await transaction
            .select({ account: githubPullRequests.account })
            .from(githubPullRequests)
            .where(
              and(
                eq(githubPullRequests.account, input.account),
                eq(githubPullRequests.nodeId, event.pullRequest.nodeId)
              )
            )
            .limit(1);
          pullRequestAccount = trackedGitHubAccountFrom(
            knownPullRequest?.account
          );
        }
        if (
          pullRequestAccount !== null &&
          (await upsertPullRequest(
            transaction,
            pullRequestAccount,
            event.pullRequest,
            now
          ))
        ) {
          result.pullRequests += 1;
        }
      }
      if (event.pullRequestSignal !== undefined) {
        const occurredAt = new Date(event.occurredAt);
        const known = await signalKnownPullRequestReconciliation(
          transaction,
          input.account,
          event.pullRequestSignal,
          occurredAt,
          now
        );
        if (known) {
          result.pullRequests += 1;
        } else {
          await persistPullRequestSignal(transaction, {
            account: input.account,
            eventId: event.id,
            observedAt: now,
            occurredAt,
            signal: event.pullRequestSignal,
          });
        }
      }
    }

    await updateCheckpoint(transaction, input, now);
    return result;
  });
