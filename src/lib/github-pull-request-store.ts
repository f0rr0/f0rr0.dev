import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import { githubPullRequestMemberships, githubPullRequests } from "@/db/schema";
import { githubPullRequestSnapshotDisposition } from "@/lib/github-activity-worker-core";
import type {
  GitHubPullRequest,
  GitHubRepository,
  TrackedGitHubAccount,
} from "@/lib/github-commits-core";
import { upsertGitHubRepositories } from "@/lib/github-repository-store";
import { requestGitHubWorkUnitProjection } from "@/lib/github-work-unit-projection-state";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const RECONCILIATION_LEASE_MS = 5 * 60 * 1000;

export interface StoredPullRequestSnapshot {
  baseRepositoryId: string;
  baseSha: string;
  commitRepositoryId: string;
  diffRefreshRequired: boolean;
  expectedChangedFiles: number | null;
  membershipRefreshRequired: boolean;
  pullRequestNodeId: string;
  retryLifecycleReset: boolean;
  snapshotChanged: boolean;
  versionId: string;
}

interface PersistPullRequestSnapshotOptions {
  authority: "authoritative" | "observed";
  existingOnly?: boolean;
  reconciliationLeaseUntil?: Date;
  refreshMembership?: boolean;
}

export const githubPullRequestStateFrom = (pullRequest: GitHubPullRequest) =>
  pullRequest.merged ? ("merged" as const) : pullRequest.state;

const terminalAtFrom = (
  pullRequest: GitHubPullRequest,
  state: "closed" | "merged" | "open"
) => {
  const value =
    state === "merged" ? pullRequest.mergedAt : pullRequest.closedAt;
  if (state !== "open" && value === null) {
    throw new Error("A terminal GitHub pull request has no terminal time.");
  }
  return value === null ? null : new Date(value);
};

const isTerminalPromotion = (
  storedState: string,
  observedState: "closed" | "merged" | "open"
) =>
  (observedState === "closed" && storedState === "open") ||
  (observedState === "merged" && storedState !== "merged");

// oxlint-disable-next-line complexity -- One row lock owns the complete PR/version state transition.
export const persistPullRequestSnapshotInTransaction = async (
  transaction: DatabaseTransaction,
  account: TrackedGitHubAccount,
  pullRequest: GitHubPullRequest,
  options: PersistPullRequestSnapshotOptions,
  now: Date
): Promise<StoredPullRequestSnapshot | null> => {
  const [existing] = await transaction
    .select({
      additions: githubPullRequests.additions,
      baseRepositoryId: githubPullRequests.baseRepositoryId,
      baseSha: githubPullRequests.baseSha,
      changedFiles: githubPullRequests.changedFiles,
      commitCount: githubPullRequests.commitCount,
      deletions: githubPullRequests.deletions,
      headRepositoryId: githubPullRequests.headRepositoryId,
      headSha: githubPullRequests.headSha,
      mergeSha: githubPullRequests.mergeSha,
      mergeShaVerifiedAt: githubPullRequests.mergeShaVerifiedAt,
      providerUpdatedAt: githubPullRequests.providerUpdatedAt,
      repositoryId: githubPullRequests.repositoryId,
      state: githubPullRequests.state,
      snapshotId: githubPullRequests.snapshotId,
      fileFactsComplete: githubPullRequests.fileFactsComplete,
      fileFactCount: sql<number>`coalesce(jsonb_array_length(${githubPullRequests.fileFacts}), 0)::integer`,
      membershipComplete: githubPullRequests.membershipComplete,
      membershipCount: sql<number>`(select count(*)::integer from ${githubPullRequestMemberships} where ${githubPullRequestMemberships.versionId} = ${githubPullRequests.snapshotId})`,
      membershipHeadSha: sql<
        string | null
      >`(select ${githubPullRequestMemberships.commitSha} from ${githubPullRequestMemberships} where ${githubPullRequestMemberships.versionId} = ${githubPullRequests.snapshotId} order by ${githubPullRequestMemberships.position} desc limit 1)`,
    })
    .from(githubPullRequests)
    .where(eq(githubPullRequests.nodeId, pullRequest.nodeId))
    .for("update");
  const providerUpdatedAt = new Date(pullRequest.providerUpdatedAt);
  const authoritative = options.authority === "authoritative";
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
  if (existing === undefined && options.existingOnly === true) {
    return null;
  }

  const repositories = new Map<string, GitHubRepository>();
  for (const repository of [
    pullRequest.repository,
    pullRequest.baseRepository,
    pullRequest.headRepository,
  ]) {
    if (repository !== null) {
      repositories.set(repository.id, repository);
    }
  }
  await upsertGitHubRepositories(transaction, [...repositories.values()], now);

  const observedState = githubPullRequestStateFrom(pullRequest);
  const terminalAt = terminalAtFrom(pullRequest, observedState);
  const terminalPromotion =
    existing !== undefined &&
    disposition === "equal_observed" &&
    isTerminalPromotion(existing.state, observedState);
  const state =
    disposition === "equal_observed" && !terminalPromotion
      ? (existing?.state ?? observedState)
      : observedState;
  const mergeShaResolved =
    authoritative &&
    state === "merged" &&
    pullRequest.mergeCommitSha !== undefined;
  const existingMergeShaResolved =
    existing?.mergeShaVerifiedAt !== null &&
    existing?.mergeShaVerifiedAt !== undefined;
  const mergeSha =
    state === "merged"
      ? mergeShaResolved
        ? (pullRequest.mergeCommitSha ?? null)
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
  const projectionEvidenceChanged =
    existing !== undefined &&
    (existing.headSha !== pullRequest.headSha ||
      existing.baseSha !== pullRequest.baseSha ||
      existing.baseRepositoryId !== pullRequest.baseRepository.id ||
      (pullRequest.headRepository !== null &&
        existing.headRepositoryId !== pullRequest.headRepository.id) ||
      existing.repositoryId !== pullRequest.repository.id ||
      existing.state !== state);
  const mergeLandingChanged =
    existing !== undefined &&
    (existing.mergeSha !== mergeSha ||
      (existing.mergeShaVerifiedAt === null) !== (mergeShaVerifiedAt === null));
  const persistedEvidenceChanged =
    projectionEvidenceChanged || mergeLandingChanged;
  const retryLifecycleReset =
    existing !== undefined &&
    (disposition === "newer" || persistedEvidenceChanged);
  const retryLifecycleUpdate = retryLifecycleReset
    ? {
        nextReconcileAt: options.reconciliationLeaseUntil ?? now,
        reconcileAttempts: 0,
        reconcileError: null,
      }
    : {};
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
    providerUpdatedAt,
    state,
    terminalAt,
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

  if (
    disposition === "equal_observed" &&
    existing !== undefined &&
    (existing.headSha !== pullRequest.headSha ||
      existing.baseSha !== pullRequest.baseSha)
  ) {
    await transaction
      .update(githubPullRequests)
      .set({ nextReconcileAt: now })
      .where(eq(githubPullRequests.nodeId, pullRequest.nodeId));
    return null;
  }

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
  } else if (disposition === "newer" || disposition === "equal_authoritative") {
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
      .set({
        additions: pullRequest.additions ?? existing.additions,
        changedFiles: pullRequest.changedFiles ?? existing.changedFiles,
        commitCount: pullRequest.commitCount ?? existing.commitCount,
        deletions: pullRequest.deletions ?? existing.deletions,
        headRepositoryId:
          pullRequest.headRepository?.id ?? existing.headRepositoryId,
        ...(terminalPromotion
          ? {
              closedAt: mutable.closedAt,
              mergedAt: mutable.mergedAt,
              mergeSha,
              mergeShaVerifiedAt,
              state,
              terminalAt,
            }
          : {}),
        ...retryLifecycleUpdate,
      })
      .where(
        and(
          eq(githubPullRequests.nodeId, pullRequest.nodeId),
          eq(githubPullRequests.providerUpdatedAt, existing.providerUpdatedAt)
        )
      );
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
              new Date(now.getTime() + RECONCILIATION_LEASE_MS)
            )
          )
        )
      );
  }

  const expectedMembershipCount = mutableUpdate.commitCount ?? null;
  const expectedChangedFiles = mutableUpdate.changedFiles ?? null;
  const commitRepositoryId =
    mutableUpdate.headRepositoryId ?? pullRequest.repository.id;
  // A fresh token fences workers even for A -> B -> A and base-only changes.
  const evidenceChanged =
    existing === undefined ||
    existing.snapshotId === null ||
    existing.headSha !== pullRequest.headSha ||
    existing.baseSha !== pullRequest.baseSha ||
    existing.baseRepositoryId !== pullRequest.baseRepository.id ||
    (existing.headRepositoryId ?? existing.repositoryId) !==
      commitRepositoryId ||
    existing.commitCount !== expectedMembershipCount ||
    existing.changedFiles !== expectedChangedFiles;
  const versionId = evidenceChanged ? randomUUID() : existing.snapshotId;
  if (versionId === null || versionId === undefined) {
    throw new Error("Missing PR snapshot identity.");
  }
  const storedMembershipComplete =
    !evidenceChanged &&
    existing.membershipComplete &&
    expectedMembershipCount !== null &&
    existing.membershipCount === expectedMembershipCount &&
    (expectedMembershipCount === 0
      ? existing.membershipHeadSha === null
      : existing.membershipHeadSha === pullRequest.headSha);
  const storedDiffComplete =
    !evidenceChanged &&
    existing.fileFactsComplete &&
    expectedChangedFiles !== null &&
    existing.fileFactCount === expectedChangedFiles;
  const membershipRefreshRequired =
    evidenceChanged ||
    (existing?.membershipComplete && !storedMembershipComplete) ||
    (options.refreshMembership === true && !storedMembershipComplete);
  const diffRefreshRequired =
    expectedChangedFiles !== null && !storedDiffComplete;
  if (
    evidenceChanged &&
    existing?.snapshotId !== undefined &&
    existing.snapshotId !== null
  ) {
    await transaction
      .delete(githubPullRequestMemberships)
      .where(eq(githubPullRequestMemberships.versionId, existing.snapshotId));
  }
  await transaction
    .update(githubPullRequests)
    .set({
      snapshotId: versionId,
      ...(evidenceChanged ||
      existing === undefined ||
      providerUpdatedAt > existing.providerUpdatedAt ||
      projectionEvidenceChanged
        ? { snapshotObservedAt: now }
        : {}),
      ...(evidenceChanged ? { fileFacts: null } : {}),
      fileFactsComplete: storedDiffComplete,
      membershipComplete: storedMembershipComplete,
      mergeSnapshot: state === "merged",
    })
    .where(eq(githubPullRequests.nodeId, pullRequest.nodeId));
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
              new Date(now.getTime() + RECONCILIATION_LEASE_MS)
            )
          )
        )
      );
  }

  const projectionInputChanged =
    persistedEvidenceChanged ||
    evidenceChanged ||
    (existing?.membershipComplete && !storedMembershipComplete) ||
    (existing?.fileFactsComplete && !storedDiffComplete);
  if (projectionInputChanged) {
    await requestGitHubWorkUnitProjection(transaction, [
      pullRequest.baseRepository.id,
    ]);
  }

  return {
    baseRepositoryId: pullRequest.baseRepository.id,
    baseSha: pullRequest.baseSha,
    commitRepositoryId,
    diffRefreshRequired,
    expectedChangedFiles,
    membershipRefreshRequired,
    pullRequestNodeId: pullRequest.nodeId,
    retryLifecycleReset,
    snapshotChanged: projectionInputChanged,
    versionId,
  };
};
