import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubCommits,
  githubIssues,
  githubPublicActivities,
  githubPullRequests,
  githubPullRequestMemberships,
  githubPullRequestSignals,
  githubPullRequestVersions,
  githubPushObservations,
  githubSummaryAttempts,
} from "@/db/schema";
import type { GitHubActivityCursor } from "@/lib/github-activity-cursor";
import { readPublicGitHubActivityPage } from "@/lib/github-activity-store";
import type {
  PublicGitHubActivityDay,
  PublicGitHubActivityItem,
} from "@/lib/github-activity-types";
import {
  githubCommitInWorkerScope,
  githubPullRequestInWorkerScope,
  githubPullRequestSignalInWorkerScope,
  githubPushObservationInWorkerScope,
} from "@/lib/github-activity-worker-store";
import {
  repositoryIdFrom,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAXIMUM_GITHUB_ACTIVITY_AUDIT_DAYS = 31;

export interface GitHubActivityAuditRequest {
  account: TrackedGitHubAccount;
  endDate: string;
  repositoryId: string | null;
  sinceAt: Date;
  snapshotAt: Date;
  startDate: string;
  untilAt: Date;
}

const utcDayFrom = (value: unknown) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

export const githubActivityAuditRequestFrom = (
  value: unknown,
  now = new Date()
): GitHubActivityAuditRequest | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  const account = trackedGitHubAccountFrom(input.account);
  const rawRepositoryId =
    typeof input.repositoryId === "string" ? input.repositoryId.trim() : "";
  const repositoryId =
    rawRepositoryId.length === 0 ? null : repositoryIdFrom(rawRepositoryId);
  const sinceAt = utcDayFrom(input.startDate);
  const endDay = utcDayFrom(input.endDate);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  if (
    account === null ||
    sinceAt === null ||
    endDay === null ||
    sinceAt > endDay ||
    endDay > today ||
    (rawRepositoryId.length > 0 && repositoryId === null)
  ) {
    return null;
  }
  const days = Math.floor((endDay.getTime() - sinceAt.getTime()) / DAY_MS) + 1;
  if (days > MAXIMUM_GITHUB_ACTIVITY_AUDIT_DAYS) {
    return null;
  }
  return {
    account,
    endDate: endDay.toISOString().slice(0, 10),
    repositoryId,
    sinceAt,
    snapshotAt: new Date(now),
    startDate: sinceAt.toISOString().slice(0, 10),
    untilAt: new Date(endDay.getTime() + DAY_MS - 1),
  };
};

export interface GitHubActivityProjectionCheck {
  id: string;
  ok: boolean;
  violations: number;
}

interface FlattenedPublicItem {
  additions: number;
  deletions: number;
  id: string;
  issue: boolean;
  repositoryKey: string;
}

const flattenedPublicItems = (
  item: PublicGitHubActivityItem
): readonly FlattenedPublicItem[] => {
  if (item.kind === "commit") {
    return [
      {
        additions: item.commit.additions,
        deletions: item.commit.deletions,
        id: item.commit.id,
        issue: false,
        repositoryKey: item.repository.key,
      },
    ];
  }
  if (item.kind === "pull-request-commits") {
    return item.commits.map((commit) => ({
      additions: commit.additions,
      deletions: commit.deletions,
      id: commit.id,
      issue: false,
      repositoryKey: item.repository.key,
    }));
  }
  return [
    {
      additions: 0,
      deletions: 0,
      id: item.id,
      issue: true,
      repositoryKey: item.repository.key,
    },
  ];
};

export const auditPublicGitHubActivityDays = (
  days: readonly PublicGitHubActivityDay[]
): readonly GitHubActivityProjectionCheck[] => {
  let additionTotalViolations = 0;
  let deletionTotalViolations = 0;
  let duplicateDayViolations = 0;
  let duplicateSourceViolations = 0;
  let issueTotalViolations = 0;
  let mergeMilestoneViolations = 0;
  let invalidKindViolations = 0;
  let repositoryTotalViolations = 0;
  const seenDays = new Set<string>();
  const seenSources = new Set<string>();

  for (const day of days) {
    if (seenDays.has(day.day)) {
      duplicateDayViolations += 1;
    }
    seenDays.add(day.day);
    const flattened: FlattenedPublicItem[] = [];
    for (const item of day.items) {
      const { kind } = item as { kind?: unknown };
      if (
        kind === "pull_request" ||
        kind === "pull-request" ||
        kind === "pull-request-merged"
      ) {
        mergeMilestoneViolations += 1;
        continue;
      }
      if (
        kind !== "commit" &&
        kind !== "pull-request-commits" &&
        kind !== "issue-opened"
      ) {
        invalidKindViolations += 1;
        continue;
      }
      flattened.push(...flattenedPublicItems(item));
    }
    for (const item of flattened) {
      if (seenSources.has(item.id)) {
        duplicateSourceViolations += 1;
      }
      seenSources.add(item.id);
    }
    const additions = flattened.reduce(
      (total, item) => total + item.additions,
      0
    );
    const deletions = flattened.reduce(
      (total, item) => total + item.deletions,
      0
    );
    const issues = flattened.filter((item) => item.issue).length;
    const repositories = new Set(flattened.map((item) => item.repositoryKey))
      .size;
    additionTotalViolations += Number(additions !== day.totals.additions);
    deletionTotalViolations += Number(deletions !== day.totals.deletions);
    issueTotalViolations += Number(issues !== day.totals.issuesOpened);
    repositoryTotalViolations += Number(
      repositories !== day.totals.repositories
    );
  }

  return [
    {
      id: "no_pull_request_merge_milestones",
      ok: mergeMilestoneViolations === 0,
      violations: mergeMilestoneViolations,
    },
    {
      id: "allowed_activity_kinds",
      ok: invalidKindViolations === 0,
      violations: invalidKindViolations,
    },
    {
      id: "unique_days",
      ok: duplicateDayViolations === 0,
      violations: duplicateDayViolations,
    },
    {
      id: "unique_work_sources",
      ok: duplicateSourceViolations === 0,
      violations: duplicateSourceViolations,
    },
    {
      id: "day_addition_totals",
      ok: additionTotalViolations === 0,
      violations: additionTotalViolations,
    },
    {
      id: "day_deletion_totals",
      ok: deletionTotalViolations === 0,
      violations: deletionTotalViolations,
    },
    {
      id: "day_issue_totals",
      ok: issueTotalViolations === 0,
      violations: issueTotalViolations,
    },
    {
      id: "day_repository_totals",
      ok: repositoryTotalViolations === 0,
      violations: repositoryTotalViolations,
    },
  ];
};

interface StoredCommitAuditRow {
  activityPublicId: string | null;
  additions: number | null;
  canonicalPublicId: string | null;
  canonicalizedAt: Date | null;
  changedFiles: number | null;
  deletions: number | null;
  enrichmentState: string;
  enrichmentRetryAt?: Date | null;
  hiddenAt: Date | null;
  parentShas: readonly string[] | null;
  publishedAt: Date | null;
  pullRequestDiscoveryState: string;
  pullRequestDiscoveryRetryAt?: Date | null;
  substantiveLoc: number | null;
  summaryAttemptExists?: boolean;
  summaryComplete: boolean;
  summaryUnavailable?: boolean;
}

interface StoredIssueAuditRow {
  activityPublicId: string | null;
  canonicalPublicId: string | null;
  hiddenAt: Date | null;
  publishedAt: Date | null;
}

export interface GitHubActivityAuditEvidence {
  commits: readonly StoredCommitAuditRow[];
  globalProjectionSourceIds: readonly string[];
  issues: readonly StoredIssueAuditRow[];
  legacyPullRequestMilestones: number;
  pipelineEvidence?: GitHubActivityAuditPipelineEvidence;
  projectionDays: readonly PublicGitHubActivityDay[];
  projectionError: GitHubActivityAuditProjectionError | null;
}

export interface GitHubActivityAuditProjectionError {
  code: string | null;
  name: string;
}

export interface GitHubActivityAuditPipelineEvidence {
  earliestRetryAt: Date | null;
  pullRequestMembershipsPending: number;
  pullRequestMembershipsUnavailable: number;
  pullRequestReconciliationsPending: number;
  pullRequestReconciliationsUnavailable: number;
  pullRequestSignalsPending: number;
  pullRequestSignalsUnavailable: number;
  pushObservationsPending: number;
  pushObservationsUnavailable: number;
  summaryAttemptsPending: number;
  summaryAttemptsUnavailable: number;
}

const emptyPipelineEvidence = (): GitHubActivityAuditPipelineEvidence => ({
  earliestRetryAt: null,
  pullRequestMembershipsPending: 0,
  pullRequestMembershipsUnavailable: 0,
  pullRequestReconciliationsPending: 0,
  pullRequestReconciliationsUnavailable: 0,
  pullRequestSignalsPending: 0,
  pullRequestSignalsUnavailable: 0,
  pushObservationsPending: 0,
  pushObservationsUnavailable: 0,
  summaryAttemptsPending: 0,
  summaryAttemptsUnavailable: 0,
});

const publishedWithinSnapshot = (publishedAt: Date | null, snapshotAt: Date) =>
  publishedAt !== null && publishedAt <= snapshotAt;

const commitPassesCanonicalGate = (
  commit: StoredCommitAuditRow,
  snapshotAt: Date
) =>
  commit.activityPublicId !== null &&
  publishedWithinSnapshot(commit.publishedAt, snapshotAt) &&
  commit.hiddenAt === null &&
  commit.canonicalPublicId === null &&
  commit.canonicalizedAt !== null &&
  commit.canonicalizedAt <= snapshotAt &&
  commit.parentShas !== null &&
  commit.parentShas.length <= 1;

const issuePassesPublicGate = (issue: StoredIssueAuditRow, snapshotAt: Date) =>
  issue.activityPublicId !== null &&
  publishedWithinSnapshot(issue.publishedAt, snapshotAt) &&
  issue.hiddenAt === null &&
  issue.canonicalPublicId === null;

const commitSourceComplete = (commit: StoredCommitAuditRow) =>
  commit.additions !== null &&
  commit.changedFiles !== null &&
  commit.deletions !== null &&
  commit.substantiveLoc !== null &&
  commit.summaryComplete;

const publicSourceIds = (days: readonly PublicGitHubActivityDay[]) =>
  days.flatMap((day) =>
    day.items.flatMap((item) => flattenedPublicItems(item).map(({ id }) => id))
  );

export const scopePublicGitHubActivityDays = (
  days: readonly PublicGitHubActivityDay[],
  sourceIds: ReadonlySet<string>
) =>
  days.flatMap((day) => {
    const items: PublicGitHubActivityItem[] = [];
    for (const item of day.items) {
      if (item.kind === "commit") {
        if (sourceIds.has(item.commit.id)) {
          items.push(item);
        }
        continue;
      }
      if (item.kind === "pull-request-commits") {
        const commits = item.commits.filter((commit) =>
          sourceIds.has(commit.id)
        );
        if (commits.length > 0) {
          items.push({ ...item, commits });
        }
        continue;
      }
      if (sourceIds.has(item.id)) {
        items.push(item);
      }
    }
    if (items.length === 0) {
      return [];
    }
    const flattened = items.flatMap((item) => flattenedPublicItems(item));
    return [
      {
        ...day,
        items,
        totals: {
          additions: flattened.reduce(
            (total, item) => total + item.additions,
            0
          ),
          deletions: flattened.reduce(
            (total, item) => total + item.deletions,
            0
          ),
          issuesOpened: flattened.filter((item) => item.issue).length,
          repositories: new Set(flattened.map((item) => item.repositoryKey))
            .size,
        },
      },
    ];
  });

const setDifferenceSize = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
) => [...left].filter((value) => !right.has(value)).length;

export interface GitHubActivityAuditReport {
  checks: readonly GitHubActivityProjectionCheck[];
  coverage: {
    evidence: "stored_postgresql_rows";
    gaps: {
      commitEnrichmentUnavailable: number;
      pullRequestDiscoveryUnavailable: number;
      pullRequestMembershipsUnavailable: number;
      pullRequestReconciliationsUnavailable: number;
      pullRequestSignalsUnavailable: number;
      pushObservationsUnavailable: number;
      summaryAttemptsUnavailable: number;
      total: number;
    };
    providerCompleteness: "not_assessed";
    statement: string;
  };
  diagnostics: {
    projectionError: GitHubActivityAuditProjectionError | null;
  };
  inventory: {
    commitsObserved: number;
    issuesObserved: number;
    legacyPullRequestMilestonesExcluded: number;
  };
  pipeline: {
    aliasesExcluded: number;
    canonicalizationPending: number;
    earliestRetryAt: string | null;
    enrichmentIncomplete: number;
    integrationCommitsExcluded: number;
    projectionReadyButUnpublished: number;
    publishedButGated: number;
    pullRequestDiscoveryIncomplete: number;
    pullRequestMembershipsPending: number;
    pullRequestReconciliationsPending: number;
    pullRequestSignalsPending: number;
    pushObservationsPending: number;
    summaryIncomplete: number;
    summaryAttemptsPending: number;
    unsettledCommits: number;
    unsettledIssues: number;
  };
  projection: {
    days: number;
    expectedActivitySources: number;
    renderedActivitySources: number;
  };
  scope: {
    account: TrackedGitHubAccount;
    endDate: string;
    repositoryId: string | null;
    snapshotAt: string;
    startDate: string;
  };
  status: GitHubActivityAuditStatus;
  version: 1;
}

export type GitHubActivityAuditStatus =
  | "inconclusive"
  | "mismatch"
  | "pipeline_incomplete"
  | "stored_projection_verified";

export const buildGitHubActivityAuditReport = (
  request: GitHubActivityAuditRequest,
  evidence: GitHubActivityAuditEvidence
): GitHubActivityAuditReport => {
  const { snapshotAt } = request;
  const pipelineEvidence = evidence.pipelineEvidence ?? emptyPipelineEvidence();
  const stableCommits = evidence.commits.filter((commit) =>
    commitPassesCanonicalGate(commit, snapshotAt)
  );
  const expectedIds = new Set(evidence.globalProjectionSourceIds);
  const renderedIds = new Set(publicSourceIds(evidence.projectionDays));
  const sourceCompletenessViolations = stableCommits.filter(
    (commit) => !commitSourceComplete(commit)
  ).length;
  const exactProjectionViolations =
    setDifferenceSize(expectedIds, renderedIds) +
    setDifferenceSize(renderedIds, expectedIds);
  const canonicalGateViolations = evidence.commits.filter(
    (commit) =>
      commit.activityPublicId !== null &&
      renderedIds.has(commit.activityPublicId) &&
      !commitPassesCanonicalGate(commit, snapshotAt)
  ).length;
  const integrationCommitViolations = evidence.commits.filter(
    (commit) =>
      commit.activityPublicId !== null &&
      renderedIds.has(commit.activityPublicId) &&
      commit.parentShas !== null &&
      commit.parentShas.length > 1
  ).length;
  const checks = [
    {
      id: "public_projection_readable",
      ok: evidence.projectionError === null,
      violations: evidence.projectionError === null ? 0 : 1,
    },
    ...auditPublicGitHubActivityDays(evidence.projectionDays),
    {
      id: "exact_stored_activity_sources",
      ok: exactProjectionViolations === 0,
      violations: exactProjectionViolations,
    },
    {
      id: "canonical_commit_gate",
      ok: canonicalGateViolations === 0,
      violations: canonicalGateViolations,
    },
    {
      id: "no_integration_commits",
      ok: integrationCommitViolations === 0,
      violations: integrationCommitViolations,
    },
    {
      id: "complete_published_commit_sources",
      ok: sourceCompletenessViolations === 0,
      violations: sourceCompletenessViolations,
    },
  ] satisfies readonly GitHubActivityProjectionCheck[];
  const projectionReadyButUnpublished = evidence.commits.filter(
    (commit) =>
      commit.activityPublicId !== null &&
      commit.publishedAt === null &&
      commit.hiddenAt === null &&
      commit.canonicalPublicId === null &&
      commit.canonicalizedAt !== null &&
      commit.canonicalizedAt <= snapshotAt &&
      commit.parentShas !== null &&
      commit.parentShas.length <= 1 &&
      commitSourceComplete(commit)
  ).length;
  const publishedButGated = evidence.commits.filter(
    (commit) =>
      publishedWithinSnapshot(commit.publishedAt, snapshotAt) &&
      !commitPassesCanonicalGate(commit, snapshotAt)
  ).length;
  const unsettledCommits = evidence.commits.filter((commit) => {
    if (commit.enrichmentState === "unavailable") {
      return false;
    }
    if (commit.enrichmentState !== "complete" || commit.parentShas === null) {
      return true;
    }
    if (
      commit.parentShas.length > 1 ||
      commit.canonicalPublicId !== null ||
      commit.hiddenAt !== null
    ) {
      return false;
    }
    if (
      commit.pullRequestDiscoveryState !== "complete" &&
      commit.pullRequestDiscoveryState !== "unavailable"
    ) {
      return true;
    }
    if (commit.summaryUnavailable === true) {
      return false;
    }
    return !(
      commitPassesCanonicalGate(commit, snapshotAt) &&
      commitSourceComplete(commit)
    );
  }).length;
  const unsettledIssues = evidence.issues.filter(
    (issue) =>
      issue.canonicalPublicId === null &&
      issue.hiddenAt === null &&
      !issuePassesPublicGate(issue, snapshotAt)
  ).length;
  const retryableQueueItems =
    pipelineEvidence.pullRequestMembershipsPending +
    pipelineEvidence.pullRequestReconciliationsPending +
    pipelineEvidence.pullRequestSignalsPending +
    pipelineEvidence.pushObservationsPending +
    pipelineEvidence.summaryAttemptsPending;
  const gaps = {
    commitEnrichmentUnavailable: evidence.commits.filter(
      (commit) => commit.enrichmentState === "unavailable"
    ).length,
    pullRequestDiscoveryUnavailable: evidence.commits.filter(
      (commit) => commit.pullRequestDiscoveryState === "unavailable"
    ).length,
    pullRequestMembershipsUnavailable:
      pipelineEvidence.pullRequestMembershipsUnavailable,
    pullRequestReconciliationsUnavailable:
      pipelineEvidence.pullRequestReconciliationsUnavailable,
    pullRequestSignalsUnavailable:
      pipelineEvidence.pullRequestSignalsUnavailable,
    pushObservationsUnavailable: pipelineEvidence.pushObservationsUnavailable,
    summaryAttemptsUnavailable: pipelineEvidence.summaryAttemptsUnavailable,
  };
  const totalGaps =
    gaps.commitEnrichmentUnavailable +
    gaps.pullRequestDiscoveryUnavailable +
    gaps.pullRequestMembershipsUnavailable +
    gaps.pullRequestReconciliationsUnavailable +
    gaps.pullRequestSignalsUnavailable +
    gaps.pushObservationsUnavailable +
    gaps.summaryAttemptsUnavailable;
  const projectionMatches = checks.every((check) => check.ok);
  let status: GitHubActivityAuditStatus = "inconclusive";
  if (evidence.projectionError === null) {
    status = "mismatch";
    if (projectionMatches) {
      status =
        unsettledCommits + unsettledIssues + retryableQueueItems === 0
          ? "stored_projection_verified"
          : "pipeline_incomplete";
    }
  }

  return {
    checks,
    coverage: {
      evidence: "stored_postgresql_rows",
      gaps: { ...gaps, total: totalGaps },
      providerCompleteness: "not_assessed",
      statement:
        request.repositoryId === null
          ? "Provider completeness is not assessed. The projection comparison is global while pipeline inventory is scoped to the requested account. This audit only verifies evidence already stored in PostgreSQL; deleted or rewritten refs and events never observed by this system can be absent."
          : "Provider completeness is not assessed. Projection and pipeline evidence are scoped to the requested account, repository, and window. This audit only verifies evidence already stored in PostgreSQL; deleted or rewritten refs and events never observed by this system can be absent.",
    },
    diagnostics: { projectionError: evidence.projectionError },
    inventory: {
      commitsObserved: evidence.commits.length,
      issuesObserved: evidence.issues.length,
      legacyPullRequestMilestonesExcluded: evidence.legacyPullRequestMilestones,
    },
    pipeline: {
      aliasesExcluded: evidence.commits.filter(
        (commit) => commit.canonicalPublicId !== null
      ).length,
      canonicalizationPending: evidence.commits.filter(
        (commit) =>
          commit.canonicalizedAt === null &&
          commit.canonicalPublicId === null &&
          commit.hiddenAt === null &&
          commit.parentShas !== null &&
          commit.parentShas.length <= 1
      ).length,
      earliestRetryAt: pipelineEvidence.earliestRetryAt?.toISOString() ?? null,
      enrichmentIncomplete: evidence.commits.filter(
        (commit) =>
          commit.enrichmentState === "pending" ||
          commit.enrichmentState === "processing"
      ).length,
      integrationCommitsExcluded: evidence.commits.filter(
        (commit) => commit.parentShas !== null && commit.parentShas.length > 1
      ).length,
      projectionReadyButUnpublished,
      publishedButGated,
      pullRequestDiscoveryIncomplete: evidence.commits.filter(
        (commit) =>
          commit.pullRequestDiscoveryState === "pending" ||
          commit.pullRequestDiscoveryState === "processing"
      ).length,
      pullRequestMembershipsPending:
        pipelineEvidence.pullRequestMembershipsPending,
      pullRequestReconciliationsPending:
        pipelineEvidence.pullRequestReconciliationsPending,
      pullRequestSignalsPending: pipelineEvidence.pullRequestSignalsPending,
      pushObservationsPending: pipelineEvidence.pushObservationsPending,
      summaryIncomplete: evidence.commits.filter(
        (commit) =>
          !commit.summaryComplete && commit.summaryUnavailable !== true
      ).length,
      summaryAttemptsPending: pipelineEvidence.summaryAttemptsPending,
      unsettledCommits,
      unsettledIssues,
    },
    projection: {
      days: evidence.projectionDays.length,
      expectedActivitySources: expectedIds.size,
      renderedActivitySources: renderedIds.size,
    },
    scope: {
      account: request.account,
      endDate: request.endDate,
      repositoryId: request.repositoryId,
      snapshotAt: snapshotAt.toISOString(),
      startDate: request.startDate,
    },
    status,
    version: 1,
  };
};

const commitActivityIdentity = and(
  eq(githubPublicActivities.kind, "commit"),
  eq(githubPublicActivities.repositoryId, githubCommits.repositoryId),
  eq(githubPublicActivities.sourceNodeId, githubCommits.sha)
);

const issueActivityIdentity = and(
  eq(githubPublicActivities.kind, "issue"),
  eq(githubPublicActivities.repositoryId, githubIssues.repositoryId),
  eq(githubPublicActivities.sourceNodeId, githubIssues.nodeId)
);

interface AuditRetryRow {
  retryAt: Date | null;
  state: string;
}

interface AuditPullRequestPipelineRow {
  lastReconciledAt: Date | null;
  membershipComplete: boolean | null;
  membershipCount: number;
  membershipExpectedCount: number | null;
  membershipHeadMatches: boolean;
  nextReconcileAt: Date | null;
  reconcileError: string | null;
  versionObservedAt: Date | null;
}

const commitHasRetryablePullRequestDiscovery = (commit: StoredCommitAuditRow) =>
  commit.enrichmentState === "complete" &&
  (commit.parentShas === null || commit.parentShas.length <= 1) &&
  (commit.pullRequestDiscoveryState === "pending" ||
    commit.pullRequestDiscoveryState === "processing");

const commitNeedsImmediatePipelineWork = (commit: StoredCommitAuditRow) =>
  commit.enrichmentState === "complete" &&
  commit.parentShas !== null &&
  commit.parentShas.length <= 1 &&
  commit.canonicalPublicId === null &&
  commit.hiddenAt === null &&
  (commit.pullRequestDiscoveryState === "complete" ||
    commit.pullRequestDiscoveryState === "unavailable") &&
  (commit.canonicalizedAt === null ||
    (!commit.summaryComplete &&
      commit.summaryUnavailable !== true &&
      commit.summaryAttemptExists !== true));

const commitRetryDatesFrom = (
  commits: readonly StoredCommitAuditRow[],
  snapshotAt: Date
) => {
  const retryDates: Date[] = [];
  for (const commit of commits) {
    if (
      commit.enrichmentState === "pending" ||
      commit.enrichmentState === "processing"
    ) {
      retryDates.push(commit.enrichmentRetryAt ?? snapshotAt);
      continue;
    }
    if (commitHasRetryablePullRequestDiscovery(commit)) {
      retryDates.push(commit.pullRequestDiscoveryRetryAt ?? snapshotAt);
      continue;
    }
    if (commitNeedsImmediatePipelineWork(commit)) {
      retryDates.push(snapshotAt);
    }
  }
  return retryDates;
};

const retryQueueEvidenceFrom = (
  rows: readonly AuditRetryRow[],
  snapshotAt: Date
) => {
  const pending = rows.filter(({ state }) =>
    ["pending", "processing", "deferred"].includes(state)
  );
  return {
    pending: pending.length,
    retryDates: pending.map(({ retryAt }) => retryAt ?? snapshotAt),
    unavailable: rows.length - pending.length,
  };
};

const pullRequestPipelineEvidenceFrom = (
  rows: readonly AuditPullRequestPipelineRow[],
  snapshotAt: Date
) => {
  let pullRequestMembershipsPending = 0;
  let pullRequestMembershipsUnavailable = 0;
  let pullRequestReconciliationsPending = 0;
  let pullRequestReconciliationsUnavailable = 0;
  const retryDates: Date[] = [];
  for (const pullRequest of rows) {
    const membershipIncomplete =
      pullRequest.membershipComplete !== true ||
      pullRequest.membershipExpectedCount === null ||
      pullRequest.membershipCount !== pullRequest.membershipExpectedCount ||
      !pullRequest.membershipHeadMatches;
    if (membershipIncomplete) {
      if (pullRequest.nextReconcileAt === null) {
        pullRequestMembershipsUnavailable += 1;
      } else {
        pullRequestMembershipsPending += 1;
      }
    }
    const observedAfterReconciliation =
      pullRequest.versionObservedAt !== null &&
      (pullRequest.lastReconciledAt === null ||
        pullRequest.versionObservedAt > pullRequest.lastReconciledAt);
    const reconciliationPending =
      pullRequest.nextReconcileAt !== null &&
      (pullRequest.reconcileError !== null ||
        pullRequest.nextReconcileAt <= snapshotAt ||
        membershipIncomplete ||
        observedAfterReconciliation);
    if (reconciliationPending) {
      pullRequestReconciliationsPending += 1;
      retryDates.push(pullRequest.nextReconcileAt ?? snapshotAt);
    } else if (
      pullRequest.nextReconcileAt === null &&
      pullRequest.reconcileError !== null
    ) {
      pullRequestReconciliationsUnavailable += 1;
    }
  }
  return {
    pullRequestMembershipsPending,
    pullRequestMembershipsUnavailable,
    pullRequestReconciliationsPending,
    pullRequestReconciliationsUnavailable,
    retryDates,
  };
};

const earliestDateFrom = (dates: readonly Date[]) => {
  let earliest: Date | null = null;
  for (const date of dates) {
    if (earliest === null || date < earliest) {
      earliest = date;
    }
  }
  return earliest;
};

const pipelineEvidenceFrom = (
  commits: readonly StoredCommitAuditRow[],
  pushObservationRows: readonly AuditRetryRow[],
  pullRequestSignalRows: readonly AuditRetryRow[],
  pullRequestRows: readonly AuditPullRequestPipelineRow[],
  summaryAttemptRows: readonly AuditRetryRow[],
  snapshotAt: Date
): GitHubActivityAuditPipelineEvidence => {
  const pushObservations = retryQueueEvidenceFrom(
    pushObservationRows,
    snapshotAt
  );
  const pullRequestSignals = retryQueueEvidenceFrom(
    pullRequestSignalRows,
    snapshotAt
  );
  const pullRequests = pullRequestPipelineEvidenceFrom(
    pullRequestRows,
    snapshotAt
  );
  const summaryAttempts = retryQueueEvidenceFrom(
    summaryAttemptRows,
    snapshotAt
  );
  return {
    earliestRetryAt: earliestDateFrom([
      ...commitRetryDatesFrom(commits, snapshotAt),
      ...pushObservations.retryDates,
      ...pullRequestSignals.retryDates,
      ...pullRequests.retryDates,
      ...summaryAttempts.retryDates,
    ]),
    pullRequestMembershipsPending: pullRequests.pullRequestMembershipsPending,
    pullRequestMembershipsUnavailable:
      pullRequests.pullRequestMembershipsUnavailable,
    pullRequestReconciliationsPending:
      pullRequests.pullRequestReconciliationsPending,
    pullRequestReconciliationsUnavailable:
      pullRequests.pullRequestReconciliationsUnavailable,
    pullRequestSignalsPending: pullRequestSignals.pending,
    pullRequestSignalsUnavailable: pullRequestSignals.unavailable,
    pushObservationsPending: pushObservations.pending,
    pushObservationsUnavailable: pushObservations.unavailable,
    summaryAttemptsPending: summaryAttempts.pending,
    summaryAttemptsUnavailable: summaryAttempts.unavailable,
  };
};

const readStoredEvidence = async (
  request: GitHubActivityAuditRequest
): Promise<
  Omit<GitHubActivityAuditEvidence, "projectionDays" | "projectionError">
> => {
  const database = getDatabase();
  const summaryComplete = sql<boolean>`exists (
    select 1
    from ${githubSummaryAttempts}
    where ${githubSummaryAttempts.activityPublicId} = ${githubPublicActivities.publicId}
      and ${githubSummaryAttempts.revision} <= ${githubPublicActivities.revision}
      and ${githubSummaryAttempts.state} = 'complete'
      and ${githubSummaryAttempts.summaryHeadline} is not null
      and ${githubSummaryAttempts.summaryShort} is not null
  )`;
  const summaryAttemptExists = sql<boolean>`exists (
    select 1
    from ${githubSummaryAttempts}
    where ${githubSummaryAttempts.activityPublicId} = ${githubPublicActivities.publicId}
      and ${githubSummaryAttempts.revision} = ${githubPublicActivities.revision}
  )`;
  const summaryUnavailable = sql<boolean>`exists (
    select 1
    from ${githubSummaryAttempts}
    where ${githubSummaryAttempts.activityPublicId} = ${githubPublicActivities.publicId}
      and ${githubSummaryAttempts.revision} = ${githubPublicActivities.revision}
      and ${githubSummaryAttempts.state} in ('failed', 'indeterminate')
  )`;
  const workerScope = {
    repositoryId: request.repositoryId,
    sinceAt: request.sinceAt,
    untilAt: request.untilAt,
  };
  const issueRepositoryScope =
    request.repositoryId === null
      ? undefined
      : eq(githubIssues.repositoryId, request.repositoryId);
  const activityRepositoryScope =
    request.repositoryId === null
      ? undefined
      : eq(githubPublicActivities.repositoryId, request.repositoryId);
  const stableGlobalProjectionActivity = and(
    inArray(githubPublicActivities.kind, ["commit", "issue"]),
    isNotNull(githubPublicActivities.publishedAt),
    lte(githubPublicActivities.publishedAt, request.snapshotAt),
    isNull(githubPublicActivities.hiddenAt),
    isNull(githubPublicActivities.canonicalPublicId),
    gte(githubPublicActivities.occurredAt, request.sinceAt),
    lte(githubPublicActivities.occurredAt, request.untilAt),
    sql<boolean>`(
      ${githubPublicActivities.kind} <> 'commit'
      OR EXISTS (
        SELECT 1
        FROM ${githubCommits}
        WHERE ${githubCommits.activityPublicId} = ${githubPublicActivities.publicId}
          AND ${githubCommits.repositoryId} = ${githubPublicActivities.repositoryId}
          AND ${githubCommits.sha} = ${githubPublicActivities.sourceNodeId}
          AND ${githubCommits.canonicalizedAt} IS NOT NULL
          AND ${githubCommits.canonicalizedAt} <= ${request.snapshotAt.toISOString()}::timestamptz
          AND ${githubCommits.parentShas} IS NOT NULL
          AND jsonb_array_length(${githubCommits.parentShas}) <= 1
      )
    )`
  );
  const [
    commits,
    issues,
    legacyPullRequestRows,
    globalProjectionRows,
    pushObservationRows,
    pullRequestSignalRows,
    pullRequestRows,
    summaryAttemptRows,
  ] = await Promise.all([
    database
      .select({
        activityPublicId: githubPublicActivities.publicId,
        additions: githubCommits.additions,
        canonicalPublicId: githubPublicActivities.canonicalPublicId,
        canonicalizedAt: githubCommits.canonicalizedAt,
        changedFiles: githubCommits.changedFiles,
        deletions: githubCommits.deletions,
        enrichmentState: githubCommits.enrichmentState,
        enrichmentRetryAt: githubCommits.enrichmentLeaseUntil,
        hiddenAt: githubPublicActivities.hiddenAt,
        parentShas: githubCommits.parentShas,
        publishedAt: githubPublicActivities.publishedAt,
        pullRequestDiscoveryState: githubCommits.pullRequestDiscoveryState,
        pullRequestDiscoveryRetryAt:
          githubCommits.pullRequestDiscoveryLeaseUntil,
        substantiveLoc: githubCommits.substantiveLoc,
        summaryAttemptExists,
        summaryComplete,
        summaryUnavailable,
      })
      .from(githubCommits)
      .leftJoin(githubPublicActivities, commitActivityIdentity)
      .where(
        and(
          eq(githubCommits.author, request.account),
          githubCommitInWorkerScope(workerScope)
        )
      ),
    database
      .select({
        activityPublicId: githubPublicActivities.publicId,
        canonicalPublicId: githubPublicActivities.canonicalPublicId,
        hiddenAt: githubPublicActivities.hiddenAt,
        publishedAt: githubPublicActivities.publishedAt,
      })
      .from(githubIssues)
      .leftJoin(githubPublicActivities, issueActivityIdentity)
      .where(
        and(
          eq(githubIssues.account, request.account),
          issueRepositoryScope,
          gte(githubIssues.createdAt, request.sinceAt),
          lte(githubIssues.createdAt, request.untilAt)
        )
      ),
    database
      .select({ publicId: githubPublicActivities.publicId })
      .from(githubPublicActivities)
      .innerJoin(
        githubPullRequests,
        and(
          eq(githubPublicActivities.kind, "pull_request"),
          eq(
            githubPublicActivities.repositoryId,
            githubPullRequests.repositoryId
          ),
          eq(githubPublicActivities.sourceNodeId, githubPullRequests.nodeId)
        )
      )
      .where(
        and(
          eq(githubPullRequests.account, request.account),
          activityRepositoryScope,
          gte(githubPublicActivities.occurredAt, request.sinceAt),
          lte(githubPublicActivities.occurredAt, request.untilAt),
          lte(githubPublicActivities.publishedAt, request.snapshotAt),
          isNull(githubPublicActivities.hiddenAt),
          isNull(githubPublicActivities.canonicalPublicId)
        )
      ),
    request.repositoryId === null
      ? database
          .select({ publicId: githubPublicActivities.publicId })
          .from(githubPublicActivities)
          .where(stableGlobalProjectionActivity)
      : Promise.resolve([]),
    database
      .select({
        retryAt: githubPushObservations.leaseUntil,
        state: githubPushObservations.state,
      })
      .from(githubPushObservations)
      .where(
        and(
          eq(githubPushObservations.account, request.account),
          githubPushObservationInWorkerScope(workerScope),
          inArray(githubPushObservations.state, [
            "pending",
            "processing",
            "deferred",
            "unavailable",
          ])
        )
      ),
    database
      .select({
        retryAt: githubPullRequestSignals.leaseUntil,
        state: githubPullRequestSignals.state,
      })
      .from(githubPullRequestSignals)
      .where(
        and(
          eq(githubPullRequestSignals.account, request.account),
          githubPullRequestSignalInWorkerScope(workerScope),
          inArray(githubPullRequestSignals.state, [
            "pending",
            "processing",
            "unavailable",
          ])
        )
      ),
    database
      .select({
        lastReconciledAt: githubPullRequests.lastReconciledAt,
        membershipComplete: githubPullRequestVersions.membershipComplete,
        membershipCount: sql<number>`(
          SELECT count(*)::integer
          FROM ${githubPullRequestMemberships}
          WHERE ${githubPullRequestMemberships.versionId} = ${githubPullRequestVersions.id}
        )`,
        membershipExpectedCount: githubPullRequestVersions.commitCount,
        membershipHeadMatches: sql<boolean>`
          coalesce(${githubPullRequestVersions.commitCount} = 0, false)
          OR coalesce((
            SELECT ${githubPullRequestMemberships.commitSha} = ${githubPullRequestVersions.headSha}
            FROM ${githubPullRequestMemberships}
            WHERE ${githubPullRequestMemberships.versionId} = ${githubPullRequestVersions.id}
            ORDER BY ${githubPullRequestMemberships.position} DESC
            LIMIT 1
          ), false)
        `,
        nextReconcileAt: githubPullRequests.nextReconcileAt,
        reconcileError: githubPullRequests.reconcileError,
        versionObservedAt: githubPullRequestVersions.observedAt,
      })
      .from(githubPullRequests)
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
          eq(githubPullRequests.account, request.account),
          githubPullRequestInWorkerScope(workerScope)
        )
      ),
    database
      .select({
        retryAt: githubSummaryAttempts.leaseUntil,
        state: githubSummaryAttempts.state,
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
          eq(githubCommits.author, request.account),
          githubCommitInWorkerScope(workerScope),
          inArray(githubSummaryAttempts.state, [
            "pending",
            "processing",
            "failed",
            "indeterminate",
          ]),
          eq(githubPublicActivities.kind, "commit"),
          isNull(githubPublicActivities.canonicalPublicId),
          isNull(githubPublicActivities.hiddenAt),
          eq(githubCommits.enrichmentState, "complete"),
          isNotNull(githubCommits.canonicalizedAt),
          sql<boolean>`${githubCommits.parentShas} IS NOT NULL
              AND jsonb_array_length(${githubCommits.parentShas}) <= 1`
        )
      ),
  ]);
  const scopedProjectionSourceIds = [
    ...commits
      .filter((commit) => commitPassesCanonicalGate(commit, request.snapshotAt))
      .map((commit) => commit.activityPublicId),
    ...issues
      .filter((issue) => issuePassesPublicGate(issue, request.snapshotAt))
      .map((issue) => issue.activityPublicId),
  ].filter((publicId): publicId is string => publicId !== null);
  const pipelineEvidence = pipelineEvidenceFrom(
    commits,
    pushObservationRows,
    pullRequestSignalRows,
    pullRequestRows,
    summaryAttemptRows,
    request.snapshotAt
  );
  return {
    commits,
    globalProjectionSourceIds:
      request.repositoryId === null
        ? globalProjectionRows.map(({ publicId }) => publicId)
        : scopedProjectionSourceIds,
    issues,
    legacyPullRequestMilestones: legacyPullRequestRows.length,
    pipelineEvidence,
  };
};

const readProjectionDays = async (
  request: GitHubActivityAuditRequest,
  sourceIds: ReadonlySet<string> | null
) => {
  const snapshotAt = request.snapshotAt.toISOString();
  let beforeDay = new Date(request.untilAt.getTime() + 1)
    .toISOString()
    .slice(0, 10);
  const days = new Map<string, PublicGitHubActivityDay>();
  const maximumPages = Math.ceil(MAXIMUM_GITHUB_ACTIVITY_AUDIT_DAYS / 14) + 1;
  for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
    const cursor: GitHubActivityCursor = {
      beforeDay,
      snapshotAt,
      version: 1,
    };
    const page = await readPublicGitHubActivityPage(cursor, 14);
    if (page.days.length === 0) {
      break;
    }
    for (const day of page.days) {
      if (day.day >= request.startDate && day.day <= request.endDate) {
        days.set(day.day, day);
      }
    }
    const oldestDay = page.days.at(-1)?.day;
    if (oldestDay === undefined || oldestDay <= request.startDate) {
      break;
    }
    beforeDay = oldestDay;
  }
  const projectionDays = [...days.values()].toSorted((left, right) =>
    right.day.localeCompare(left.day)
  );
  return sourceIds === null
    ? projectionDays
    : scopePublicGitHubActivityDays(projectionDays, sourceIds);
};

type StoredGitHubActivityAuditEvidence = Omit<
  GitHubActivityAuditEvidence,
  "projectionDays" | "projectionError"
>;

const scopedProjectionSourceIds = (
  evidence: StoredGitHubActivityAuditEvidence
) =>
  new Set(
    [...evidence.commits, ...evidence.issues]
      .map(({ activityPublicId }) => activityPublicId)
      .filter((publicId): publicId is string => publicId !== null)
  );

const serializedDate = (value: Date | null) => value?.toISOString() ?? null;

export const githubActivityAuditEvidenceFingerprint = (
  evidence: StoredGitHubActivityAuditEvidence
) =>
  JSON.stringify({
    commits: evidence.commits
      .map((commit) =>
        JSON.stringify({
          activityPublicId: commit.activityPublicId,
          additions: commit.additions,
          canonicalPublicId: commit.canonicalPublicId,
          canonicalizedAt: serializedDate(commit.canonicalizedAt),
          changedFiles: commit.changedFiles,
          deletions: commit.deletions,
          enrichmentState: commit.enrichmentState,
          enrichmentRetryAt: serializedDate(commit.enrichmentRetryAt ?? null),
          hiddenAt: serializedDate(commit.hiddenAt),
          parentShas: commit.parentShas,
          publishedAt: serializedDate(commit.publishedAt),
          pullRequestDiscoveryState: commit.pullRequestDiscoveryState,
          pullRequestDiscoveryRetryAt: serializedDate(
            commit.pullRequestDiscoveryRetryAt ?? null
          ),
          substantiveLoc: commit.substantiveLoc,
          summaryAttemptExists: commit.summaryAttemptExists ?? false,
          summaryComplete: commit.summaryComplete,
          summaryUnavailable: commit.summaryUnavailable ?? false,
        })
      )
      .toSorted(),
    issues: evidence.issues
      .map((issue) =>
        JSON.stringify({
          activityPublicId: issue.activityPublicId,
          canonicalPublicId: issue.canonicalPublicId,
          hiddenAt: serializedDate(issue.hiddenAt),
          publishedAt: serializedDate(issue.publishedAt),
        })
      )
      .toSorted(),
    globalProjectionSourceIds: evidence.globalProjectionSourceIds.toSorted(),
    legacyPullRequestMilestones: evidence.legacyPullRequestMilestones,
    pipelineEvidence: {
      ...(evidence.pipelineEvidence ?? emptyPipelineEvidence()),
      earliestRetryAt: serializedDate(
        evidence.pipelineEvidence?.earliestRetryAt ?? null
      ),
    },
  });

export const runGitHubActivityAudit = async (
  request: GitHubActivityAuditRequest
): Promise<GitHubActivityAuditReport> => {
  let lastStored = await readStoredEvidence(request);
  let lastProjectionDays: readonly PublicGitHubActivityDay[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = lastStored;
    try {
      lastProjectionDays = await readProjectionDays(
        request,
        request.repositoryId === null ? null : scopedProjectionSourceIds(before)
      );
    } catch (error) {
      const rawCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null;
      return buildGitHubActivityAuditReport(request, {
        ...before,
        projectionDays: [],
        projectionError: {
          code:
            rawCode !== null && /^[A-Za-z0-9_-]{1,64}$/.test(rawCode)
              ? rawCode
              : null,
          name:
            error instanceof Error &&
            /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(error.name)
              ? error.name
              : "UnknownProjectionError",
        },
      });
    }
    const after = await readStoredEvidence(request);
    lastStored = after;
    if (
      githubActivityAuditEvidenceFingerprint(before) ===
      githubActivityAuditEvidenceFingerprint(after)
    ) {
      return buildGitHubActivityAuditReport(request, {
        ...after,
        projectionDays: lastProjectionDays,
        projectionError: null,
      });
    }
  }
  return buildGitHubActivityAuditReport(request, {
    ...lastStored,
    projectionDays: lastProjectionDays,
    projectionError: {
      code: null,
      name: "ConcurrentStoredEvidenceChange",
    },
  });
};
