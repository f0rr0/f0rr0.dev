import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import type { getDatabase } from "@/db/client";
import {
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestVersions,
} from "@/db/schema";
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
    if (existing.headSha !== pullRequest.headSha) {
      if (terminalPromotion) {
        await requestGitHubWorkUnitProjection(transaction);
      }
      return null;
    }
  }

  const [version] = await transaction
    .select({
      baseSha: githubPullRequestVersions.baseSha,
      commitCount: githubPullRequestVersions.commitCount,
      fileFactCount: sql<number>`coalesce(jsonb_array_length(${githubPullRequestVersions.fileFacts}), 0)::integer`,
      fileFactsComplete: githubPullRequestVersions.fileFactsComplete,
      headRepositoryId: githubPullRequestVersions.headRepositoryId,
      id: githubPullRequestVersions.id,
      isCurrent: githubPullRequestVersions.isCurrent,
      membershipComplete: githubPullRequestVersions.membershipComplete,
      membershipCount: sql<number>`(
        SELECT count(*)::integer
        FROM ${githubPullRequestMemberships}
        WHERE ${githubPullRequestMemberships.versionId} = ${githubPullRequestVersions.id}
      )`,
      membershipHeadSha: sql<string | null>`(
        SELECT ${githubPullRequestMemberships.commitSha}
        FROM ${githubPullRequestMemberships}
        WHERE ${githubPullRequestMemberships.versionId} = ${githubPullRequestVersions.id}
        ORDER BY ${githubPullRequestMemberships.position} DESC
        LIMIT 1
      )`,
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
        mergeSnapshot: state === "merged",
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
    const versionUpdate =
      disposition === "equal_observed"
        ? {
            commitCount: pullRequest.commitCount ?? version.commitCount,
            isCurrent: true,
            ...(terminalPromotion ? { mergeSnapshot: state === "merged" } : {}),
          }
        : {
            baseRefName: pullRequest.baseRef,
            baseRepositoryId: pullRequest.baseRepository.id,
            baseSha: pullRequest.baseSha,
            commitCount: pullRequest.commitCount ?? version.commitCount,
            headRefName: pullRequest.headRef,
            headRepositoryId:
              pullRequest.headRepository?.id ?? version.headRepositoryId,
            isCurrent: true,
            mergeSnapshot: state === "merged",
            ...(providerUpdatedAt > version.providerUpdatedAt ||
            projectionEvidenceChanged
              ? { observedAt: now }
              : {}),
            providerUpdatedAt,
          };
    await transaction
      .update(githubPullRequestVersions)
      .set(versionUpdate)
      .where(eq(githubPullRequestVersions.id, version.id));
  }
  if (versionId === undefined) {
    throw new Error("The GitHub pull request version is unavailable.");
  }

  const expectedMembershipCount =
    pullRequest.commitCount ?? version?.commitCount ?? null;
  const commitRepositoryId =
    pullRequest.headRepository?.id ??
    existing?.headRepositoryId ??
    pullRequest.repository.id;
  const storedMembershipCompleteFlag = version?.membershipComplete ?? false;
  const storedMembershipComplete =
    storedMembershipCompleteFlag &&
    expectedMembershipCount !== null &&
    version.membershipCount === expectedMembershipCount &&
    version.baseSha === pullRequest.baseSha &&
    (version.headRepositoryId ?? pullRequest.repository.id) ===
      commitRepositoryId &&
    (expectedMembershipCount === 0
      ? version.membershipHeadSha === null
      : version.membershipHeadSha === pullRequest.headSha);
  const storedMembershipInvalid =
    storedMembershipCompleteFlag && !storedMembershipComplete;
  if (storedMembershipInvalid) {
    await transaction
      .update(githubPullRequestVersions)
      .set({ membershipComplete: false })
      .where(eq(githubPullRequestVersions.id, versionId));
  }
  const membershipRefreshRequired =
    version === undefined ||
    storedMembershipInvalid ||
    (options.refreshMembership === true && !storedMembershipComplete);
  const expectedChangedFiles =
    pullRequest.changedFiles ?? existing?.changedFiles ?? null;
  const storedDiffComplete =
    version !== undefined &&
    version.fileFactsComplete &&
    expectedChangedFiles !== null &&
    version.fileFactCount === expectedChangedFiles &&
    version.baseSha === pullRequest.baseSha;
  const diffRefreshRequired =
    expectedChangedFiles !== null && !storedDiffComplete;
  if (
    version !== undefined &&
    version.fileFactsComplete &&
    !storedDiffComplete
  ) {
    await transaction
      .update(githubPullRequestVersions)
      .set({ fileFactsComplete: false })
      .where(eq(githubPullRequestVersions.id, versionId));
  }
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
    version === undefined ||
    !version.isCurrent ||
    storedMembershipInvalid ||
    (version.fileFactsComplete && !storedDiffComplete);
  if (projectionInputChanged) {
    await requestGitHubWorkUnitProjection(transaction);
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
