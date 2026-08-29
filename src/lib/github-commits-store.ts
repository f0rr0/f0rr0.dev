import { createHash } from "node:crypto";

import {
  and,
  eq,
  gt,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubAccountCheckpoints,
  githubIssues,
  githubPublicActivities,
  githubPullRequests,
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubRepositoryRefs,
  githubWebhookDeliveries,
} from "@/db/schema";
import { trackedGitHubAccountFrom } from "@/lib/github-commits-core";
import type {
  GitHubEvent,
  GitHubIssue,
  GitHubPullRequest,
  GitHubPullRequestEventSignal,
  GitHubPush,
  GitHubRepository,
  GitHubRepositoryFacts,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";

export class CheckpointConflictError extends Error {
  constructor() {
    super("The GitHub event checkpoint changed during synchronization.");
    this.name = "CheckpointConflictError";
  }
}

export interface GitHubAccountCheckpoint {
  latestEventId: string | null;
  paused: boolean;
  refBackfillSinceAt: Date;
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
      latestEventId: githubAccountCheckpoints.latestEventId,
      paused: githubAccountCheckpoints.paused,
      refBackfillSinceAt: githubAccountCheckpoints.refBackfillSinceAt,
    })
    .from(githubAccountCheckpoints)
    .where(eq(githubAccountCheckpoints.account, account))
    .limit(1);
  return checkpoint ?? null;
};

const upsertRepository = async (
  transaction: DatabaseTransaction,
  repository: GitHubRepository,
  observedAt: Date
) => {
  const facts =
    "ownerLogin" in repository ? (repository as GitHubRepositoryFacts) : null;
  await transaction
    .insert(githubRepositories)
    .values({
      firstObservedAt: observedAt,
      fullName: repository.fullName,
      htmlUrl: facts?.htmlUrl ?? null,
      id: repository.id,
      lastObservedAt: observedAt,
      ownerAvatarUrl: facts?.ownerAvatarUrl ?? null,
      ownerId: facts?.ownerId ?? null,
      ownerLogin: facts?.ownerLogin ?? null,
      ownerType: facts?.ownerType ?? null,
      visibility: facts?.visibility ?? null,
    })
    .onConflictDoUpdate({
      set: {
        fullName: repository.fullName,
        htmlUrl: sql`coalesce(excluded.html_url, ${githubRepositories.htmlUrl})`,
        lastObservedAt: observedAt,
        ownerAvatarUrl: sql`coalesce(excluded.owner_avatar_url, ${githubRepositories.ownerAvatarUrl})`,
        ownerId: sql`coalesce(excluded.owner_id, ${githubRepositories.ownerId})`,
        ownerLogin: sql`coalesce(excluded.owner_login, ${githubRepositories.ownerLogin})`,
        ownerType: sql`coalesce(excluded.owner_type, ${githubRepositories.ownerType})`,
        visibility: sql`coalesce(excluded.visibility, ${githubRepositories.visibility})`,
      },
      setWhere: lte(githubRepositories.lastObservedAt, observedAt),
      target: githubRepositories.id,
    });
};

const persistIssue = async (
  transaction: DatabaseTransaction,
  issue: GitHubIssue,
  observedAt: Date
) => {
  await upsertRepository(transaction, issue.repository, observedAt);
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

  const [activity] = await transaction
    .insert(githubPublicActivities)
    .values({
      kind: "issue",
      occurredAt: new Date(issue.createdAt),
      publishedAt: observedAt,
      repositoryId: issue.repository.id,
      sourceNodeId: issue.nodeId,
    })
    .returning({ publicId: githubPublicActivities.publicId });
  if (activity === undefined) {
    throw new Error("The GitHub issue activity could not be persisted.");
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

const PUSH_COMMIT_INSERT_BATCH = 1000;

const insertPushObservations = async (
  transaction: DatabaseTransaction,
  inputs: readonly PushObservationInput[]
) => {
  if (inputs.length === 0) {
    return { duplicates: 0, knownCommits: 0, pushes: 0 };
  }

  const repositories = new Map<string, GitHubRepository>();
  for (const { push } of inputs) {
    if (!repositories.has(push.repository.id)) {
      repositories.set(push.repository.id, push.repository);
    }
  }
  const observedAt = inputs[0]?.observedAt ?? new Date();
  await transaction
    .insert(githubRepositories)
    .values(
      [...repositories.values()].map((repository) => ({
        firstObservedAt: observedAt,
        fullName: repository.fullName,
        id: repository.id,
        lastObservedAt: observedAt,
      }))
    )
    .onConflictDoUpdate({
      set: {
        fullName: sql`excluded.full_name`,
        lastObservedAt: sql`excluded.last_observed_at`,
      },
      setWhere: lte(githubRepositories.lastObservedAt, observedAt),
      target: githubRepositories.id,
    });

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
      sourceId: githubPushObservations.sourceId,
    });
  const inputsBySourceId = new Map(
    inputs.map((input) => [input.sourceId, input])
  );
  const commitRows = inserted.flatMap(({ id, sourceId }) => {
    const input = inputsBySourceId.get(sourceId);
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
    duplicates: inputs.length - inserted.length,
    knownCommits: commitRows.length,
    pushes: inserted.length,
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

export const persistGitHubRepositoryRefs = async (input: {
  account: TrackedGitHubAccount;
  observedAt: Date;
  refs: readonly GitHubRepositoryRefSnapshot[];
  repository: GitHubRepositoryFacts;
}): Promise<GitHubRepositoryRefIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    await upsertRepository(transaction, input.repository, input.observedAt);
    const existing = await transaction
      .select({
        active: githubRepositoryRefs.active,
        headSha: githubRepositoryRefs.headSha,
        lastObservedAt: githubRepositoryRefs.lastObservedAt,
        refName: githubRepositoryRefs.refName,
      })
      .from(githubRepositoryRefs)
      .where(eq(githubRepositoryRefs.repositoryId, input.repository.id));
    const existingByName = new Map(existing.map((ref) => [ref.refName, ref]));
    const knownActiveHeads = new Set(
      existing.filter((ref) => ref.active).map((ref) => ref.headSha)
    );
    const observedRanges = new Set<string>();
    const observations: PushObservationInput[] = [];

    for (const ref of input.refs) {
      const previous = existingByName.get(ref.refName);
      if (
        previous !== undefined &&
        (previous.lastObservedAt > input.observedAt ||
          (previous.active && previous.headSha === ref.headSha))
      ) {
        knownActiveHeads.add(ref.headSha);
        continue;
      }
      const beforeSha = previous?.active === true ? previous.headSha : ZERO_SHA;
      const range = `${beforeSha}:${ref.headSha}`;
      if (!knownActiveHeads.has(ref.headSha) && !observedRanges.has(range)) {
        const push: GitHubPush = {
          before: beforeSha,
          commitShas: [],
          head: ref.headSha,
          pushedBy: input.account,
          ref: ref.refName,
          repository: input.repository,
          size: null,
        };
        observations.push({
          observedAt: input.observedAt,
          providerCreatedAt: null,
          push,
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
            firstObservedAt: input.observedAt,
            headSha: ref.headSha,
            kind: ref.kind,
            lastObservedAt: input.observedAt,
            refName: ref.refName,
            repositoryId: input.repository.id,
          }))
        )
        .onConflictDoUpdate({
          set: {
            active: true,
            headSha: sql`excluded.head_sha`,
            kind: sql`excluded.kind`,
            lastObservedAt: input.observedAt,
          },
          setWhere: lte(githubRepositoryRefs.lastObservedAt, input.observedAt),
          target: [
            githubRepositoryRefs.repositoryId,
            githubRepositoryRefs.refName,
          ],
        });
    }

    const currentRefNames = input.refs.map((ref) => ref.refName);
    await transaction
      .update(githubRepositoryRefs)
      .set({ active: false, lastObservedAt: input.observedAt })
      .where(
        and(
          eq(githubRepositoryRefs.repositoryId, input.repository.id),
          eq(githubRepositoryRefs.active, true),
          lte(githubRepositoryRefs.lastObservedAt, input.observedAt),
          ...(currentRefNames.length === 0
            ? []
            : [notInArray(githubRepositoryRefs.refName, currentRefNames)])
        )
      );

    return {
      knownCommits: persisted.knownCommits,
      pushes: persisted.pushes,
      refs: input.refs.length,
    };
  });

const insertPushObservation = async (
  transaction: DatabaseTransaction,
  input: PushObservationInput
): Promise<GitHubWebhookIntakeResult> => {
  const result = await insertPushObservations(transaction, [input]);
  return {
    duplicate: result.duplicates === 1,
    ignored: false,
    issues: 0,
    knownCommits: result.knownCommits,
    paused: false,
    pullRequests: 0,
    pushes: result.pushes,
  };
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

const pullRequestState = (pullRequest: GitHubPullRequest) =>
  pullRequest.merged ? ("merged" as const) : pullRequest.state;

const upsertPullRequest = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  observedAt: Date
) => {
  await upsertRepository(transaction, pullRequest.repository, observedAt);
  if (pullRequest.headRepository !== null) {
    await upsertRepository(transaction, pullRequest.headRepository, observedAt);
  }

  const providerUpdatedAt = new Date(pullRequest.providerUpdatedAt);
  const state = pullRequestState(pullRequest);
  const terminalTimestamp =
    state === "merged"
      ? pullRequest.mergedAt
      : state === "closed"
        ? pullRequest.closedAt
        : null;
  if (state !== "open" && terminalTimestamp === null) {
    throw new Error("A terminal GitHub pull request has no terminal time.");
  }
  const terminalAt =
    terminalTimestamp === null ? null : new Date(terminalTimestamp);
  const mutableValues = {
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
    nextReconcileAt: observedAt,
    providerUpdatedAt,
    state,
    terminalAt,
    title: pullRequest.title,
    url: pullRequest.url,
  } as const;
  const [changed] = await transaction
    .insert(githubPullRequests)
    .values({
      ...mutableValues,
      account,
      authorLogin: pullRequest.author,
      authorUserId: pullRequest.authorUserId,
      bodySnapshot: pullRequest.body,
      createdAt: new Date(pullRequest.createdAt),
      nodeId: pullRequest.nodeId,
      number: pullRequest.number,
      repositoryId: pullRequest.repository.id,
      titleSnapshot: pullRequest.title,
    })
    .onConflictDoUpdate({
      set: {
        ...mutableValues,
        additions: sql`coalesce(excluded.additions, ${githubPullRequests.additions})`,
        changedFiles: sql`coalesce(excluded.changed_files, ${githubPullRequests.changedFiles})`,
        commitCount: sql`coalesce(excluded.commit_count, ${githubPullRequests.commitCount})`,
        deletions: sql`coalesce(excluded.deletions, ${githubPullRequests.deletions})`,
        headRepositoryId: sql`coalesce(excluded.head_repository_id, ${githubPullRequests.headRepositoryId})`,
      },
      setWhere: lt(githubPullRequests.providerUpdatedAt, providerUpdatedAt),
      target: githubPullRequests.nodeId,
    })
    .returning({ nodeId: githubPullRequests.nodeId });
  if (changed === undefined) {
    if (state !== "open") {
      const promotableStoredState =
        state === "merged"
          ? or(
              eq(githubPullRequests.state, "open"),
              eq(githubPullRequests.state, "closed")
            )
          : eq(githubPullRequests.state, "open");
      const [promoted] = await transaction
        .update(githubPullRequests)
        .set({
          closedAt: mutableValues.closedAt,
          mergedAt: mutableValues.mergedAt,
          mergeSha: mutableValues.mergeSha,
          nextReconcileAt: observedAt,
          state,
          terminalAt,
        })
        .where(
          and(
            eq(githubPullRequests.nodeId, pullRequest.nodeId),
            eq(githubPullRequests.providerUpdatedAt, providerUpdatedAt),
            promotableStoredState
          )
        )
        .returning({ nodeId: githubPullRequests.nodeId });
      if (promoted !== undefined) {
        return true;
      }
    }
    await transaction
      .update(githubPullRequests)
      .set({ nextReconcileAt: observedAt })
      .where(
        and(
          eq(githubPullRequests.nodeId, pullRequest.nodeId),
          eq(githubPullRequests.providerUpdatedAt, providerUpdatedAt),
          or(
            isNull(githubPullRequests.nextReconcileAt),
            gt(
              githubPullRequests.nextReconcileAt,
              new Date(observedAt.getTime() + 5 * 60 * 1000)
            )
          )
        )
      );
    return false;
  }

  await transaction
    .update(githubPullRequestVersions)
    .set({ isCurrent: false })
    .where(
      and(
        eq(githubPullRequestVersions.pullRequestNodeId, pullRequest.nodeId),
        eq(githubPullRequestVersions.isCurrent, true),
        ne(githubPullRequestVersions.headSha, pullRequest.headSha)
      )
    );
  await transaction
    .insert(githubPullRequestVersions)
    .values({
      baseRefName: pullRequest.baseRef,
      baseRepositoryId: pullRequest.baseRepository.id,
      baseSha: pullRequest.baseSha,
      commitCount: pullRequest.commitCount,
      headRefName: pullRequest.headRef,
      headRepositoryId: pullRequest.headRepository?.id ?? null,
      headSha: pullRequest.headSha,
      isCurrent: true,
      mergeSnapshot: pullRequest.merged,
      observedAt,
      providerUpdatedAt,
      pullRequestNodeId: pullRequest.nodeId,
    })
    .onConflictDoUpdate({
      set: {
        baseRefName: pullRequest.baseRef,
        baseRepositoryId: pullRequest.baseRepository.id,
        baseSha: pullRequest.baseSha,
        commitCount: sql`coalesce(excluded.commit_count, ${githubPullRequestVersions.commitCount})`,
        headRefName: pullRequest.headRef,
        headRepositoryId: sql`coalesce(excluded.head_repository_id, ${githubPullRequestVersions.headRepositoryId})`,
        isCurrent: true,
        mergeSnapshot: pullRequest.merged,
        observedAt,
        providerUpdatedAt,
      },
      target: [
        githubPullRequestVersions.pullRequestNodeId,
        githubPullRequestVersions.headSha,
      ],
    });
  return true;
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
  await transaction
    .update(githubPullRequests)
    .set({
      nextReconcileAt: observedAt,
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
  return true;
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

export const persistGitHubWebhookPush = async (
  deliveryId: string,
  push: GitHubPush
): Promise<GitHubWebhookIntakeResult> =>
  await getDatabase().transaction(async (transaction) => {
    const delivery = {
      account: push.pushedBy,
      action: null,
      deliveryId,
      event: "push",
      repositoryId: push.repository.id,
    } as const;
    const receipt = await insertWebhookDelivery(transaction, delivery);
    if (!receipt.inserted) {
      return duplicateWebhookResult(receipt.accepted);
    }
    if (await lockWebhookAccount(transaction, push.pushedBy)) {
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
    const persisted = await insertPushObservation(transaction, {
      observedAt: new Date(),
      providerCreatedAt: null,
      push,
      source: "webhook",
      sourceId: deliveryId,
    });
    await markWebhookDeliveryAccepted(transaction, delivery, true);
    return { ...persisted, duplicate: false };
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
  const updated = await transaction
    .update(githubAccountCheckpoints)
    .set({ latestEventId: input.latestEventId, ...gapValues })
    .where(
      and(
        eq(githubAccountCheckpoints.account, input.account),
        checkpointCondition,
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
      if (
        event.pullRequestSignal !== undefined &&
        (await signalKnownPullRequestReconciliation(
          transaction,
          input.account,
          event.pullRequestSignal,
          new Date(event.occurredAt),
          now
        ))
      ) {
        result.pullRequests += 1;
      }
    }

    await updateCheckpoint(transaction, input, now);
    return result;
  });
