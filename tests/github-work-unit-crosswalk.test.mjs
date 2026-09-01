import { describe, expect, test } from "bun:test";

import { buildGitHubWorkUnitCrosswalk } from "../src/lib/github-work-unit-crosswalk.ts";

const sha = (character) => character.repeat(40);
const logicalKey = (repositoryId, character) =>
  `${repositoryId}/${sha(character)}`;
const trackedUserId = "8574219";

const change = ({
  activityAt = "2026-08-02T12:00:00.000Z",
  additions = 1,
  character,
  deletions = 0,
  mergedPullRequestLanding = false,
  parentCount = 1,
  repositoryId = "1",
}) => ({
  additions,
  authorUserId: trackedUserId,
  contentObservedAt: activityAt,
  deletions,
  enrichmentComplete: true,
  fileFacts:
    additions + deletions === 0
      ? []
      : [
          {
            additions,
            binary: false,
            deletions,
            filename: `${character}.ts`,
            patch: null,
            patchComplete: true,
            previousFilename: null,
            status: "modified",
          },
        ],
  fileFactsComplete: true,
  mergedPullRequestLanding,
  logicalActivityAt: activityAt,
  logicalRepositoryId: repositoryId,
  logicalSha: sha(character),
  parentCount,
  parentLogicalKeys: [],
  providerFileCapReached: false,
  pullRequestCoverageComplete: true,
  repositoryId,
  sha: sha(character),
});

const pullRequest = ({
  authorUserId = trackedUserId,
  baseRepositoryId = "1",
  createdAt = "2026-08-02T08:00:00.000Z",
  memberLogicalKeys = [],
  membershipComplete = true,
  nodeId,
}) => ({
  authorUserId,
  baseRepositoryId,
  baseSha: sha("0"),
  contentObservedAt: createdAt,
  createdAt,
  headSha: sha("f"),
  memberLogicalKeys,
  membershipComplete,
  netOutcome: null,
  netOutcomeOwnedCompletely: false,
  nodeId,
  snapshotKind: "current",
  state: "open",
});

const unit = ({ identityKey, kind, members, repositoryId = "1" }) => ({
  activityAnchorAt: "2026-08-03T12:00:00.000Z",
  activityAt: "2026-08-03T12:00:00.000Z",
  activityDay: "2026-08-03",
  attributionMode:
    kind === "pull_request"
      ? "tracked_authored_pr"
      : kind === "canonical_day"
        ? "canonical_owned_composite"
        : "branch_owned_composite",
  branchLineageId: kind === "branch" ? identityKey.slice(7) : null,
  contentObservedAt: "2026-08-03T12:00:00.000Z",
  facts: {
    additions: members.length,
    deletions: 0,
    fileCount: members.length,
    languages: null,
    memberCount: members.length,
  },
  factsDigest: "1".repeat(64),
  firstActivityAt: "2026-08-03T12:00:00.000Z",
  identityKey,
  kind,
  lastActivityAt: "2026-08-03T12:00:00.000Z",
  members: members.map((key, position) => {
    const [logicalRepositoryId, logicalSha] = key.split("/");
    return {
      logicalKey: key,
      logicalRepositoryId,
      logicalSha,
      position,
    };
  }),
  membershipDigest: "2".repeat(64),
  newestCommitRepositoryId: repositoryId,
  newestCommitSha: members.at(-1)?.split("/")[1] ?? sha("0"),
  outcomeDigest: null,
  pullRequestNodeId: kind === "pull_request" ? identityKey.slice(3) : null,
  repositoryId,
  visibility: repositoryId === "3" ? "private" : "public",
});

const snapshot = () => {
  const changes = [
    change({ character: "a", repositoryId: "1" }),
    change({
      activityAt: "2026-08-03T12:00:00.000Z",
      character: "b",
      repositoryId: "2",
    }),
    change({
      activityAt: "2026-08-04T12:00:00.000Z",
      character: "c",
      repositoryId: "3",
    }),
    change({ character: "d", parentCount: 2, repositoryId: "1" }),
    change({ additions: 0, character: "e", repositoryId: "1" }),
    change({ character: "6", repositoryId: "1" }),
    change({
      character: "7",
      mergedPullRequestLanding: true,
      repositoryId: "1",
    }),
    change({ character: "8", repositoryId: "4" }),
    change({ character: "9", repositoryId: "2" }),
    change({
      activityAt: "2026-07-31T23:59:59.000Z",
      character: "f",
      repositoryId: "1",
    }),
  ];
  const excludedChanges = [
    {
      logicalKey: logicalKey("1", "6"),
      reason: "no_current_owner",
      repositoryId: "1",
      sha: sha("6"),
    },
    {
      logicalKey: logicalKey("1", "7"),
      reason: "merged_pr_landing",
      repositoryId: "1",
      sha: sha("7"),
    },
    {
      logicalKey: logicalKey("4", "8"),
      reason: "repository_visibility_unknown",
      repositoryId: "4",
      sha: sha("8"),
    },
  ];
  return {
    input: {
      changes,
      pullRequests: [
        pullRequest({
          memberLogicalKeys: [logicalKey("1", "a")],
          nodeId: "PR_1",
        }),
        pullRequest({ nodeId: "PR_2" }),
        pullRequest({
          memberLogicalKeys: [logicalKey("1", "e")],
          nodeId: "PR_zero_diff",
        }),
        pullRequest({
          baseRepositoryId: "4",
          memberLogicalKeys: [logicalKey("4", "8")],
          nodeId: "PR_visibility_gap",
        }),
        pullRequest({ authorUserId: "99", nodeId: "PR_foreign" }),
        pullRequest({ membershipComplete: false, nodeId: "PR_incomplete" }),
        pullRequest({
          createdAt: "2026-07-31T23:59:59.000Z",
          nodeId: "PR_outside",
        }),
      ],
      refs: [],
      repositories: [
        {
          defaultBranch: "main",
          headGenerationComplete: true,
          id: "1",
          visibility: "public",
        },
        {
          defaultBranch: "main",
          headGenerationComplete: true,
          id: "2",
          visibility: "public",
        },
        {
          defaultBranch: "main",
          headGenerationComplete: true,
          id: "3",
          visibility: "private",
        },
        {
          defaultBranch: "main",
          headGenerationComplete: true,
          id: "4",
          visibility: null,
        },
      ],
      trackedAuthorUserIds: new Set([trackedUserId]),
    },
    excludedChanges,
    exclusionReasonCounts: {
      merged_pr_landing: 1,
      canonical_branch_unknown: 0,
      head_generation_incomplete: 0,
      no_current_owner: 1,
      pull_request_coverage_incomplete: 0,
      repository_visibility_unknown: 1,
    },
    units: [
      unit({
        identityKey: "pr:PR_1",
        kind: "pull_request",
        members: [logicalKey("1", "a")],
      }),
      unit({
        identityKey: "canonical:2:2026-08-03",
        kind: "canonical_day",
        members: [logicalKey("2", "b"), logicalKey("2", "9")],
        repositoryId: "2",
      }),
      unit({
        identityKey: "branch:lineage-3",
        kind: "branch",
        members: [logicalKey("3", "c")],
        repositoryId: "3",
      }),
    ],
  };
};

describe("GitHub work-unit crosswalk", () => {
  test("reports scoped counts and actionable diagnostics by stable ID", () => {
    const report = buildGitHubWorkUnitCrosswalk(snapshot(), {
      since: "2026-08-01",
      until: "2026-08-08",
    });

    expect(report.categories.trackedChangeCandidates.count).toBe(9);
    expect(report.categories.eligibleTrackedChanges.count).toBe(7);
    expect(report.categories.integrationMerges).toEqual({
      count: 1,
      ids: [logicalKey("1", "d")],
    });
    expect(report.categories.zeroDiffOrIneligibleChanges).toEqual({
      count: 1,
      ids: [logicalKey("1", "e")],
    });
    expect(report.categories.projectedPullRequestUnits.ids).toEqual([
      "pr:PR_1",
    ]);
    expect(report.categories.projectedCanonicalUnits.ids).toEqual([
      "canonical:2:2026-08-03",
    ]);
    expect(report.categories.projectedBranchUnits.ids).toEqual([
      "branch:lineage-3",
    ]);
    expect(report.categories.projectedOwnedChanges.count).toBe(4);
    expect(report.categories.associatedOrRemovedUnreachableChanges.ids).toEqual(
      [logicalKey("1", "6"), logicalKey("1", "7")]
    );
    expect(
      report.categories.authoredPullRequestsWithoutOwnedCurrentMember
    ).toEqual({ count: 1, ids: ["PR_2"] });
    expect(report.categories.visibilityGaps).toEqual({
      count: 1,
      ids: ["4"],
    });
    expect(report.policyExclusions).toEqual({
      count: 2,
      ids: [logicalKey("1", "6"), logicalKey("1", "7")],
      idsByReason: {
        merged_pr_landing: {
          count: 1,
          ids: [logicalKey("1", "7")],
        },
        no_current_owner: {
          count: 1,
          ids: [logicalKey("1", "6")],
        },
      },
      reasonCounts: {
        merged_pr_landing: 1,
        no_current_owner: 1,
      },
    });
    expect(report.coverageGaps.reasonCounts).toEqual({
      canonical_branch_unknown: 0,
      head_generation_incomplete: 0,
      pull_request_coverage_incomplete: 0,
      repository_visibility_unknown: 1,
    });
    expect(report.invariants).toEqual({
      failures: ["projection_coverage_gap", "repository_visibility_gap"],
      passed: false,
    });
    expect(report.version).toBe(2);
  });

  test("treats deterministic policy exclusions as complete coverage", () => {
    const report = buildGitHubWorkUnitCrosswalk(snapshot(), {
      repositories: [{ fullName: "f0rr0/example", id: "1" }],
      since: "2026-08-01",
      until: "2026-08-08",
    });

    expect(report.policyExclusions).toMatchObject({
      count: 2,
      ids: [logicalKey("1", "6"), logicalKey("1", "7")],
      reasonCounts: { merged_pr_landing: 1, no_current_owner: 1 },
    });
    expect(report.coverageGaps).toMatchObject({ count: 0, ids: [] });
    expect(report.invariants).toMatchObject({ failures: [], passed: true });
  });

  test("fails coverage for each blocking exclusion reason", () => {
    const blockingReasons = [
      "canonical_branch_unknown",
      "head_generation_incomplete",
      "pull_request_coverage_incomplete",
      "repository_visibility_unknown",
    ];
    for (const reason of blockingReasons) {
      const evidence = snapshot();
      evidence.excludedChanges = evidence.excludedChanges
        .filter((change) => change.repositoryId === "1")
        .map((change) =>
          change.logicalKey === logicalKey("1", "6")
            ? { ...change, reason }
            : change
        );
      const report = buildGitHubWorkUnitCrosswalk(evidence, {
        repositories: [{ fullName: "f0rr0/example", id: "1" }],
        since: "2026-08-01",
        until: "2026-08-08",
      });

      expect(report.coverageGaps.reasonCounts[reason]).toBe(1);
      expect(report.invariants.failures).toEqual(["projection_coverage_gap"]);
    }
  });

  test("applies the half-open UTC interval and repository filter to member ownership", () => {
    const report = buildGitHubWorkUnitCrosswalk(snapshot(), {
      repositories: [{ fullName: "private/example", id: "3" }],
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-08T00:00:00.000+00:00",
    });

    expect(report.filters).toEqual({
      changeClock: "logical_activity_at",
      interval: "[since,until)",
      pullRequestClock: "created_at",
      repositories: [{ fullName: "private/example", id: "3" }],
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-08T00:00:00.000Z",
    });
    expect(report.categories.trackedChangeCandidates).toEqual({
      count: 1,
      ids: [logicalKey("3", "c")],
    });
    expect(report.categories.projectedBranchUnits).toEqual({
      count: 1,
      ids: ["branch:lineage-3"],
    });
    expect(report.categories.projectedCanonicalUnits.count).toBe(0);
    expect(report.categories.projectedPullRequestUnits.count).toBe(0);
    expect(report.invariants.passed).toBe(true);
  });

  test("rejects ambiguous time zones and duplicate repository IDs", () => {
    expect(() =>
      buildGitHubWorkUnitCrosswalk(snapshot(), {
        since: "2026-08-01T00:00:00",
        until: "2026-08-08T00:00:00Z",
      })
    ).toThrow(TypeError);
    expect(() =>
      buildGitHubWorkUnitCrosswalk(snapshot(), {
        repositories: [
          { fullName: "first/example", id: "1" },
          { fullName: "renamed/example", id: "1" },
        ],
        since: "2026-08-01",
        until: "2026-08-08",
      })
    ).toThrow(TypeError);
  });
});
