import { describe, expect, test } from "bun:test";

import {
  githubActivityAuditArgumentsFrom,
  githubActivityAuditExitCodeFromStatus,
} from "../scripts/audit-github-activity.ts";
import {
  auditPublicGitHubActivityDays,
  buildGitHubActivityAuditReport,
  githubActivityAuditEvidenceFingerprint,
  githubActivityAuditRequestFrom,
  scopePublicGitHubActivityDays,
} from "../src/lib/github-activity-audit.ts";

const now = new Date("2026-08-30T12:00:00.000Z");

const request = githubActivityAuditRequestFrom(
  {
    account: "f0rr0",
    endDate: "2026-08-30",
    startDate: "2026-08-01",
  },
  now
);

if (request === null) {
  throw new Error("The GitHub activity audit test request is invalid.");
}

const repository = {
  avatarUrl: null,
  key: "repository-one",
  label: "f0rr0/example",
  url: "https://github.com/f0rr0/example",
};

const commit = {
  additions: 10,
  changedFiles: 2,
  committedAt: "2026-08-30T10:00:00.000Z",
  deletions: 3,
  headline: "Add an audit contract",
  id: "00000000-0000-4000-8000-000000000001",
  languages: [],
  providerFileCapReached: false,
  summary: null,
};

const healthyDay = {
  day: "2026-08-30",
  items: [
    {
      commit,
      id: commit.id,
      kind: "commit",
      occurredAt: commit.committedAt,
      repository,
    },
  ],
  totals: {
    additions: 10,
    deletions: 3,
    issuesOpened: 0,
    repositories: 1,
  },
};

const healthyCommitEvidence = {
  activityPublicId: commit.id,
  additions: 10,
  canonicalPublicId: null,
  canonicalizedAt: new Date("2026-08-30T10:01:00.000Z"),
  changedFiles: 2,
  deletions: 3,
  enrichmentState: "complete",
  hiddenAt: null,
  parentShas: ["a".repeat(40)],
  publishedAt: new Date("2026-08-30T10:02:00.000Z"),
  pullRequestDiscoveryState: "complete",
  substantiveLoc: 13,
  summaryComplete: true,
};

const emptyPipelineEvidence = {
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
};

describe("GitHub activity audit", () => {
  test("requires an explicit account and an inclusive window of at most 31 days", () => {
    expect(
      githubActivityAuditArgumentsFrom([
        "--account",
        "f0rr0",
        "--start-date",
        "2026-08-01",
        "--end-date",
        "2026-08-30",
      ])
    ).toEqual({
      account: "f0rr0",
      endDate: "2026-08-30",
      startDate: "2026-08-01",
    });
    expect(() =>
      githubActivityAuditArgumentsFrom([
        "--account",
        "f0rr0",
        "--account",
        "f0rr0",
      ])
    ).toThrow("arguments are invalid");
    expect(
      githubActivityAuditRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-30",
          startDate: "2026-07-30",
        },
        now
      )
    ).toBeNull();
    expect(
      githubActivityAuditRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-30",
          repositoryId: "123456789",
          startDate: "2026-08-01",
        },
        now
      )
    ).toMatchObject({ repositoryId: "123456789" });
  });

  test("scopes rendered work and recomputes totals without unrelated repositories", () => {
    const otherCommit = {
      ...commit,
      additions: 4,
      deletions: 1,
      id: "00000000-0000-4000-8000-000000000002",
    };
    const scoped = scopePublicGitHubActivityDays(
      [
        {
          ...healthyDay,
          items: [
            ...healthyDay.items,
            {
              commit: otherCommit,
              id: otherCommit.id,
              kind: "commit",
              occurredAt: otherCommit.committedAt,
              repository: { ...repository, key: "repository-two" },
            },
          ],
          totals: {
            additions: 14,
            deletions: 4,
            issuesOpened: 0,
            repositories: 2,
          },
        },
      ],
      new Set([commit.id])
    );

    expect(scoped).toEqual([healthyDay]);
  });

  test("verifies exact day totals and one repository-group count", () => {
    expect(auditPublicGitHubActivityDays([healthyDay])).toEqual(
      expect.arrayContaining([
        { id: "day_addition_totals", ok: true, violations: 0 },
        { id: "day_deletion_totals", ok: true, violations: 0 },
        { id: "day_repository_totals", ok: true, violations: 0 },
      ])
    );

    const badDay = {
      ...healthyDay,
      totals: { ...healthyDay.totals, additions: 11, repositories: 2 },
    };
    expect(auditPublicGitHubActivityDays([badDay])).toEqual(
      expect.arrayContaining([
        { id: "day_addition_totals", ok: false, violations: 1 },
        { id: "day_repository_totals", ok: false, violations: 1 },
      ])
    );
  });

  test("treats published merge milestones and duplicate work as projection failures", () => {
    const invalidDay = {
      ...healthyDay,
      items: [
        ...healthyDay.items,
        healthyDay.items[0],
        {
          id: "legacy-pr",
          kind: "pull-request-merged",
          occurredAt: "2026-08-30T11:00:00.000Z",
          repository,
        },
      ],
    };
    const checks = auditPublicGitHubActivityDays([invalidDay]);
    expect(checks).toEqual(
      expect.arrayContaining([
        {
          id: "no_pull_request_merge_milestones",
          ok: false,
          violations: 1,
        },
        { id: "unique_work_sources", ok: false, violations: 1 },
      ])
    );
  });

  test("verifies rendered sources through the canonical non-merge gate", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 4,
      projectionDays: [healthyDay],
      projectionError: null,
    });

    expect(report).toMatchObject({
      coverage: {
        evidence: "stored_postgresql_rows",
        providerCompleteness: "not_assessed",
      },
      inventory: { legacyPullRequestMilestonesExcluded: 4 },
      projection: {
        expectedActivitySources: 1,
        renderedActivitySources: 1,
      },
      status: "stored_projection_verified",
    });
    expect(report.coverage.statement).toContain(
      "Provider completeness is not assessed"
    );
  });

  test("compares the global projection while keeping inventory account-scoped", () => {
    const otherAccountCommit = {
      ...commit,
      id: "00000000-0000-4000-8000-000000000002",
    };
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id, otherAccountCommit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [
        {
          ...healthyDay,
          items: [
            ...healthyDay.items,
            {
              commit: otherAccountCommit,
              id: otherAccountCommit.id,
              kind: "commit",
              occurredAt: otherAccountCommit.committedAt,
              repository,
            },
          ],
          totals: {
            additions: 20,
            deletions: 6,
            issuesOpened: 0,
            repositories: 1,
          },
        },
      ],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.inventory.commitsObserved).toBe(1);
    expect(report.projection).toMatchObject({
      expectedActivitySources: 2,
      renderedActivitySources: 2,
    });
  });

  test("compares every rendered source instead of hiding unexpected rows", () => {
    const unexpectedCommit = {
      ...commit,
      id: "00000000-0000-4000-8000-000000000002",
    };
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [
        {
          ...healthyDay,
          items: [
            ...healthyDay.items,
            {
              commit: unexpectedCommit,
              id: unexpectedCommit.id,
              kind: "commit",
              occurredAt: unexpectedCommit.committedAt,
              repository,
            },
          ],
          totals: {
            additions: 20,
            deletions: 6,
            issuesOpened: 0,
            repositories: 1,
          },
        },
      ],
      projectionError: null,
    });

    expect(report.status).toBe("mismatch");
    expect(report.checks).toContainEqual({
      id: "exact_stored_activity_sources",
      ok: false,
      violations: 1,
    });
    expect(report.projection.renderedActivitySources).toBe(2);
  });

  test("marks projection query failures inconclusive with exit code 2", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [],
      projectionError: { code: "08006", name: "DatabaseError" },
    });

    expect(report.status).toBe("inconclusive");
    expect(report.diagnostics.projectionError).toEqual({
      code: "08006",
      name: "DatabaseError",
    });
    expect(githubActivityAuditExitCodeFromStatus(report.status)).toBe(2);
    expect(githubActivityAuditExitCodeFromStatus("mismatch")).toBe(1);
    expect(
      githubActivityAuditExitCodeFromStatus("stored_projection_verified")
    ).toBe(0);
  });

  test("fingerprints stored evidence independent of row order", () => {
    const secondCommit = {
      ...healthyCommitEvidence,
      activityPublicId: "00000000-0000-4000-8000-000000000003",
    };
    const forward = {
      commits: [healthyCommitEvidence, secondCommit],
      globalProjectionSourceIds: [secondCommit.activityPublicId, commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
    };
    const reversed = {
      ...forward,
      commits: forward.commits.toReversed(),
      globalProjectionSourceIds: forward.globalProjectionSourceIds.toReversed(),
    };

    expect(githubActivityAuditEvidenceFingerprint(forward)).toBe(
      githubActivityAuditEvidenceFingerprint(reversed)
    );
    expect(
      githubActivityAuditEvidenceFingerprint({
        ...forward,
        commits: [
          healthyCommitEvidence,
          { ...secondCommit, summaryComplete: false },
        ],
      })
    ).not.toBe(githubActivityAuditEvidenceFingerprint(forward));
    expect(
      githubActivityAuditEvidenceFingerprint({
        ...forward,
        globalProjectionSourceIds: [commit.id],
      })
    ).not.toBe(githubActivityAuditEvidenceFingerprint(forward));
  });

  test("reports a mismatch when an uncanonicalized commit reaches the projection", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [{ ...healthyCommitEvidence, canonicalizedAt: null }],
      globalProjectionSourceIds: [],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [healthyDay],
      projectionError: null,
    });

    expect(report.status).toBe("mismatch");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        { id: "canonical_commit_gate", ok: false, violations: 1 },
        { id: "exact_stored_activity_sources", ok: false, violations: 1 },
      ])
    );
  });

  test("fails readiness when stored work is still waiting for the pipeline", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [
        {
          ...healthyCommitEvidence,
          activityPublicId: null,
          canonicalizedAt: null,
          publishedAt: null,
          pullRequestDiscoveryState: "pending",
          summaryComplete: false,
        },
      ],
      globalProjectionSourceIds: [],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [],
      projectionError: null,
    });

    expect(report.status).toBe("pipeline_incomplete");
    expect(report.pipeline).toMatchObject({
      unsettledCommits: 1,
      unsettledIssues: 0,
    });
  });

  test("settles a projection with an explicit terminal PR-discovery gap", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [
        {
          ...healthyCommitEvidence,
          pullRequestDiscoveryState: "unavailable",
        },
      ],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [healthyDay],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.coverage.gaps).toMatchObject({
      pullRequestDiscoveryUnavailable: 1,
      total: 1,
    });
    expect(report.pipeline).toMatchObject({
      pullRequestDiscoveryIncomplete: 0,
      unsettledCommits: 0,
    });
  });

  test("settles missing commit enrichment as a visible coverage gap", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [
        {
          ...healthyCommitEvidence,
          activityPublicId: null,
          additions: null,
          canonicalizedAt: null,
          changedFiles: null,
          deletions: null,
          enrichmentState: "unavailable",
          parentShas: null,
          publishedAt: null,
          substantiveLoc: null,
          summaryComplete: false,
        },
      ],
      globalProjectionSourceIds: [],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.coverage.gaps).toMatchObject({
      commitEnrichmentUnavailable: 1,
      total: 1,
    });
    expect(report.pipeline).toMatchObject({
      enrichmentIncomplete: 0,
      unsettledCommits: 0,
    });
  });

  test("keeps every scoped retryable queue state pipeline-incomplete with its earliest retry", () => {
    const earliestRetryAt = new Date("2026-08-30T12:05:00.000Z");
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      pipelineEvidence: {
        ...emptyPipelineEvidence,
        earliestRetryAt,
        pullRequestMembershipsPending: 1,
        pullRequestReconciliationsPending: 1,
        pullRequestSignalsPending: 1,
        pushObservationsPending: 1,
        summaryAttemptsPending: 1,
      },
      projectionDays: [healthyDay],
      projectionError: null,
    });

    expect(report.status).toBe("pipeline_incomplete");
    expect(report.pipeline).toMatchObject({
      earliestRetryAt: earliestRetryAt.toISOString(),
      pullRequestMembershipsPending: 1,
      pullRequestReconciliationsPending: 1,
      pullRequestSignalsPending: 1,
      pushObservationsPending: 1,
      summaryAttemptsPending: 1,
    });
  });

  test("reports terminal queue failures as gaps without keeping the pipeline alive", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [healthyCommitEvidence],
      globalProjectionSourceIds: [commit.id],
      issues: [],
      legacyPullRequestMilestones: 0,
      pipelineEvidence: {
        ...emptyPipelineEvidence,
        pullRequestMembershipsUnavailable: 1,
        pullRequestReconciliationsUnavailable: 1,
        pullRequestSignalsUnavailable: 1,
        pushObservationsUnavailable: 1,
      },
      projectionDays: [healthyDay],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.coverage.gaps).toEqual({
      commitEnrichmentUnavailable: 0,
      pullRequestDiscoveryUnavailable: 0,
      pullRequestMembershipsUnavailable: 1,
      pullRequestReconciliationsUnavailable: 1,
      pullRequestSignalsUnavailable: 1,
      pushObservationsUnavailable: 1,
      summaryAttemptsUnavailable: 0,
      total: 4,
    });
    expect(report.pipeline.earliestRetryAt).toBeNull();
  });

  test("settles a terminal summary failure as a coverage gap", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [
        {
          ...healthyCommitEvidence,
          publishedAt: null,
          summaryComplete: false,
          summaryUnavailable: true,
        },
      ],
      globalProjectionSourceIds: [],
      issues: [],
      legacyPullRequestMilestones: 0,
      pipelineEvidence: {
        ...emptyPipelineEvidence,
        summaryAttemptsUnavailable: 1,
      },
      projectionDays: [],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.coverage.gaps).toMatchObject({
      summaryAttemptsUnavailable: 1,
      total: 1,
    });
    expect(report.pipeline).toMatchObject({
      summaryAttemptsPending: 0,
      summaryIncomplete: 0,
      unsettledCommits: 0,
    });
  });

  test("does not wait for irrelevant PR discovery on excluded integration commits", () => {
    const report = buildGitHubActivityAuditReport(request, {
      commits: [
        {
          ...healthyCommitEvidence,
          canonicalPublicId: null,
          parentShas: ["a".repeat(40), "b".repeat(40)],
          publishedAt: null,
          pullRequestDiscoveryState: "pending",
          summaryComplete: false,
        },
      ],
      globalProjectionSourceIds: [],
      issues: [],
      legacyPullRequestMilestones: 0,
      projectionDays: [],
      projectionError: null,
    });

    expect(report.status).toBe("stored_projection_verified");
    expect(report.pipeline).toMatchObject({
      integrationCommitsExcluded: 1,
      unsettledCommits: 0,
    });
  });
});
