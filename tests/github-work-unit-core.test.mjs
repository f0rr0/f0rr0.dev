import { describe, expect, test } from "bun:test";

import {
  chooseEffectivePullRequest,
  githubLogicalChangeKey,
  projectGitHubWorkUnits,
  stableTopologicalOrder,
} from "../src/lib/github-work-unit-core.ts";
import { digestGitHubWorkUnitOutcome } from "../src/lib/github-work-unit-summary.ts";

const trackedIds = new Set(["100"]);
const sha = (character) => character.repeat(40);
const baseSha = sha("a");
const headSha = sha("b");

const file = (filename, additions = 1, deletions = 0, overrides = {}) => ({
  additions,
  binary: false,
  deletions,
  filename,
  patch: [
    "@@ -1 +1 @@",
    ...Array.from({ length: deletions }, (_, index) => `-old-${index}`),
    ...Array.from({ length: additions }, (_, index) => `+${filename}-${index}`),
  ].join("\n"),
  patchComplete: true,
  previousFilename: null,
  status: "modified",
  ...overrides,
});

const change = (character, overrides = {}) => {
  const fileFacts = overrides.fileFacts ?? [file(`src/${character}.ts`)];
  const additions =
    overrides.additions ??
    fileFacts.reduce((total, item) => total + item.additions, 0);
  const deletions =
    overrides.deletions ??
    fileFacts.reduce((total, item) => total + item.deletions, 0);
  return {
    additions,
    authorUserId: "100",
    contentObservedAt: "2026-08-30T12:10:00.000Z",
    deletions,
    enrichmentComplete: true,
    fileFacts,
    fileFactsComplete: true,
    mergedPullRequestLanding: false,
    logicalActivityAt: "2026-08-30T12:00:00.000Z",
    logicalRepositoryId: "1",
    logicalSha: sha(character),
    parentCount: 1,
    parentLogicalKeys: [],
    providerFileCapReached: false,
    pullRequestCoverageComplete: true,
    repositoryId: "1",
    sha: sha(character),
    summaryFileFacts: fileFacts,
    ...overrides,
  };
};

const repository = (id = "1", overrides = {}) => ({
  defaultBranch: "main",
  headGenerationComplete: true,
  id,
  visibility: "public",
  ...overrides,
});

const ref = (refName, memberLogicalKeys, overrides = {}) => ({
  branchLineageId: "11111111-1111-4111-8111-111111111111",
  complete: true,
  contentObservedAt: "2026-08-30T12:11:00.000Z",
  headSha,
  memberLogicalKeys,
  refName,
  repositoryId: "1",
  ...overrides,
});

const pullRequest = (nodeId, memberLogicalKeys, overrides = {}) => ({
  authorUserId: "100",
  baseRepositoryId: "1",
  baseSha,
  contentObservedAt: "2026-08-30T12:12:00.000Z",
  createdAt: "2026-08-29T12:00:00.000Z",
  headSha,
  memberLogicalKeys,
  membershipComplete: true,
  netOutcome: null,
  netOutcomeOwnedCompletely: true,
  nodeId,
  snapshotKind: "current",
  state: "open",
  ...overrides,
});

const projection = (overrides = {}) =>
  projectGitHubWorkUnits({
    changes: [],
    pullRequests: [],
    refs: [],
    repositories: [repository()],
    trackedAuthorUserIds: trackedIds,
    ...overrides,
  });

const logicalKeyFrom = (item) =>
  githubLogicalChangeKey(item.logicalRepositoryId, item.logicalSha);

describe("deterministic GitHub work ownership", () => {
  test("excludes merges, zero diffs, and foreign-authored commits before grouping direct work", () => {
    const first = change("c", {
      fileFacts: [file("src/shared.ts", 2, 1)],
      logicalActivityAt: "2026-08-30T10:00:00.000Z",
    });
    const second = change("d", {
      fileFacts: [file("src/shared.ts", 3, 0), file("src/new.ts", 1, 0)],
      logicalActivityAt: "2026-08-30T11:00:00.000Z",
      parentLogicalKeys: [
        githubLogicalChangeKey(first.logicalRepositoryId, first.logicalSha),
      ],
    });
    const merge = change("e", { parentCount: 2 });
    const empty = change("f", {
      additions: 0,
      deletions: 0,
      fileFacts: [],
    });
    const foreign = change("1", { authorUserId: "200" });
    const keys = [first, second, merge, empty, foreign].map((item) =>
      githubLogicalChangeKey(item.logicalRepositoryId, item.logicalSha)
    );

    const units = projection({
      changes: [second, merge, first, empty, foreign],
      refs: [ref("refs/heads/main", keys)],
    });

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      activityDay: "2026-08-30",
      attributionMode: "canonical_owned_composite",
      identityKey: "canonical:1:2026-08-30",
      kind: "canonical_day",
      facts: {
        additions: 6,
        deletions: 1,
        fileCount: 2,
        memberCount: 2,
      },
    });
    expect(units[0].members).toEqual([
      {
        logicalKey: logicalKeyFrom(first),
        logicalRepositoryId: first.logicalRepositoryId,
        logicalSha: first.logicalSha,
        position: 0,
      },
      {
        logicalKey: logicalKeyFrom(second),
        logicalRepositoryId: second.logicalRepositoryId,
        logicalSha: second.logicalSha,
        position: 1,
      },
    ]);
  });

  test("uses effective PR ownership before canonical or side refs and ranks duplicate PRs predictably", () => {
    const work = change("c");
    const key = githubLogicalChangeKey(
      work.logicalRepositoryId,
      work.logicalSha
    );
    const foreignMerged = pullRequest("PR_foreign_merged", [key], {
      authorUserId: "200",
      snapshotKind: "final",
      state: "merged",
    });
    const trackedOpen = pullRequest("PR_tracked_open", [key]);
    const ignoredHistorical = pullRequest("PR_old_version", [key], {
      snapshotKind: "final",
      state: "open",
    });

    expect(
      chooseEffectivePullRequest(
        [ignoredHistorical, trackedOpen, foreignMerged],
        trackedIds
      )?.nodeId
    ).toBe("PR_foreign_merged");

    const units = projection({
      changes: [work],
      pullRequests: [trackedOpen, ignoredHistorical, foreignMerged],
      refs: [ref("refs/heads/main", [key]), ref("refs/heads/topic", [key])],
    });

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      attributionMode: "foreign_pr_contribution",
      identityKey: "pr:PR_foreign_merged",
      kind: "pull_request",
      pullRequestNodeId: "PR_foreign_merged",
    });

    const earlierForeign = pullRequest("PR_foreign", [key], {
      authorUserId: "200",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    expect(
      chooseEffectivePullRequest([earlierForeign, trackedOpen], trackedIds)
        ?.nodeId
    ).toBe("PR_tracked_open");
  });

  test("projects complete provider evidence when aggregate and file counters drift", () => {
    const ledgerFile = file("src/provider-ledger.ts", 3, 4);
    const work = change("2", {
      additions: 5,
      deletions: 7,
      fileFacts: [ledgerFile],
    });
    const key = logicalKeyFrom(work);

    const [unit] = projection({
      changes: [work],
      pullRequests: [
        pullRequest("PR_provider_ledger_drift", [key], {
          netOutcomeOwnedCompletely: false,
          snapshotKind: "final",
          state: "merged",
        }),
      ],
    });

    expect(unit).toMatchObject({
      attributionMode: "tracked_authored_pr",
      facts: {
        additions: 5,
        deletions: 7,
        fileCount: 1,
        memberCount: 1,
      },
      identityKey: "pr:PR_provider_ledger_drift",
      kind: "pull_request",
    });
  });

  test("fails closed until lower-priority negatives and the canonical branch are complete", () => {
    const work = change("c");
    const key = githubLogicalChangeKey(
      work.logicalRepositoryId,
      work.logicalSha
    );
    const side = ref("refs/heads/topic-z", [key]);

    expect(
      projection({
        changes: [{ ...work, pullRequestCoverageComplete: false }],
        refs: [side],
      })
    ).toEqual([]);
    expect(
      projection({
        changes: [work],
        refs: [side],
        repositories: [repository("1", { defaultBranch: null })],
      })
    ).toEqual([]);
    const sideUnits = projection({
      changes: [work],
      refs: [
        side,
        ref("refs/heads/topic-a", [key], {
          branchLineageId: "22222222-2222-4222-8222-222222222222",
        }),
        ref("refs/tags/v1", [key]),
      ],
    });
    expect(sideUnits).toHaveLength(1);
    expect(sideUnits[0]).toMatchObject({
      attributionMode: "branch_owned_composite",
      branchLineageId: "22222222-2222-4222-8222-222222222222",
      identityKey: "branch:22222222-2222-4222-8222-222222222222",
      kind: "branch",
    });
  });

  test("gives a removed PR member to a complete current side ref", () => {
    const work = change("c", { mergedPullRequestLanding: true });
    const key = logicalKeyFrom(work);

    const units = projection({
      changes: [work],
      refs: [ref("refs/heads/topic", [key])],
    });

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      identityKey: "branch:11111111-1111-4111-8111-111111111111",
      kind: "branch",
    });
  });

  test("gives a removed member with only an unmerged PR association to canonical work", () => {
    const work = change("c", { mergedPullRequestLanding: false });
    const key = logicalKeyFrom(work);

    const units = projection({
      changes: [work],
      refs: [ref("refs/heads/main", [key])],
    });

    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({
      identityKey: "canonical:1:2026-08-30",
      kind: "canonical_day",
    });
  });

  test("withholds a same-repository merged-PR landing from canonical work", () => {
    const work = change("c", { mergedPullRequestLanding: true });
    const key = logicalKeyFrom(work);

    expect(
      projection({
        changes: [work],
        refs: [ref("refs/heads/main", [key])],
      })
    ).toEqual([]);
  });

  test("keeps partition-independent PR prose identity and activity anchor across a rewrite", () => {
    const netOutcome = {
      complete: true,
      files: [file("src/outcome.ts", 5, 2)],
      providerFileCapReached: false,
    };
    const oldFirst = change("c", {
      logicalActivityAt: "2026-08-29T09:00:00.000Z",
    });
    const oldSecond = change("d", {
      logicalActivityAt: "2026-08-30T10:00:00.000Z",
      parentLogicalKeys: [
        githubLogicalChangeKey(
          oldFirst.logicalRepositoryId,
          oldFirst.logicalSha
        ),
      ],
    });
    const oldKeys = [oldFirst, oldSecond].map((item) =>
      githubLogicalChangeKey(item.logicalRepositoryId, item.logicalSha)
    );
    const [before] = projection({
      changes: [oldSecond, oldFirst],
      pullRequests: [pullRequest("PR_stable", oldKeys, { netOutcome })],
    });
    const expectedOutcome = digestGitHubWorkUnitOutcome({
      diff: {
        additions: 5,
        deletions: 2,
        fileLedgerComplete: true,
        files: netOutcome.files.map((item) => ({
          additions: item.additions,
          deletions: item.deletions,
          filename: item.filename,
          patch: { body: item.patch, kind: "text" },
          previousFilename: item.previousFilename,
          status: item.status,
        })),
        providerFileCapReached: false,
      },
      mode: "net",
    });
    expect(expectedOutcome.ok).toBe(true);
    expect(before.outcomeDigest).toBe(expectedOutcome.digest);

    const replacement = change("e", {
      fileFacts: [file("src/repartitioned.ts", 4, 1)],
      logicalActivityAt: "2026-08-31T15:00:00.000Z",
    });
    const replacementKey = githubLogicalChangeKey(
      replacement.logicalRepositoryId,
      replacement.logicalSha
    );
    const [after] = projection({
      changes: [replacement],
      priorActivityAnchors: [
        {
          activityAnchorAt: before.activityAnchorAt,
          identityKey: before.identityKey,
          outcomeDigest: before.outcomeDigest,
        },
      ],
      pullRequests: [
        pullRequest("PR_stable", [replacementKey], { netOutcome }),
      ],
    });

    expect(after.identityKey).toBe(before.identityKey);
    expect(after.outcomeDigest).toBe(before.outcomeDigest);
    expect(after.membershipDigest).not.toBe(before.membershipDigest);
    expect(after.facts.memberCount).toBe(1);
    expect(after.activityAt).toBe(before.activityAt);
  });

  test("uses an explicitly cached outcome without conflating it with a missing cache entry", () => {
    const work = change("7");
    const key = logicalKeyFrom(work);
    const input = {
      changes: [work],
      pullRequests: [],
      refs: [ref("refs/heads/main", [key])],
      repositories: [repository()],
      trackedAuthorUserIds: trackedIds,
    };
    const [calculated] = projectGitHubWorkUnits(input);
    const { identityKey } = calculated;
    const cachedDigest = "f".repeat(64);

    expect(calculated.outcomeDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(calculated.outcomeDigest).not.toBe(cachedDigest);
    expect(
      projectGitHubWorkUnits(input, undefined, {
        outcomeDigests: new Map([[identityKey, cachedDigest]]),
      })[0].outcomeDigest
    ).toBe(cachedDigest);
    expect(
      projectGitHubWorkUnits(input, undefined, {
        outcomeDigests: new Map([[identityKey, null]]),
      })[0].outcomeDigest
    ).toBeNull();
    expect(
      projectGitHubWorkUnits(input, undefined, {
        outcomeDigests: new Map([["canonical:other:2026-08-30", null]]),
      })[0].outcomeDigest
    ).toBe(calculated.outcomeDigest);
  });

  test("uses only owned commit evidence when a tracked-authored PR includes collaborator work", () => {
    const owned = change("c", {
      fileFacts: [file("src/owned.ts", 2, 1)],
    });
    const key = logicalKeyFrom(owned);
    const [unit] = projection({
      changes: [owned],
      pullRequests: [
        pullRequest("PR_collaborative", [key], {
          netOutcome: {
            complete: true,
            files: [file("src/whole-pr.ts", 20, 10)],
            providerFileCapReached: false,
          },
          netOutcomeOwnedCompletely: false,
        }),
      ],
    });
    const ownedOutcome = digestGitHubWorkUnitOutcome({
      changes: [
        {
          additions: 2,
          deletions: 1,
          fileLedgerComplete: true,
          files: [
            {
              additions: 2,
              deletions: 1,
              filename: "src/owned.ts",
              patch: { body: owned.fileFacts[0].patch, kind: "text" },
              previousFilename: null,
              status: "modified",
            },
          ],
          providerFileCapReached: false,
        },
      ],
      mode: "composite",
    });

    expect(ownedOutcome.ok).toBe(true);
    expect(unit).toMatchObject({
      attributionMode: "tracked_authored_pr",
      outcomeDigest: ownedOutcome.digest,
    });
  });

  test("renders private work only as safe days and omits unknown visibility", () => {
    const publicWork = change("c");
    const privateWork = change("d", {
      logicalRepositoryId: "2",
      repositoryId: "2",
    });
    const unknownWork = change("e", {
      logicalRepositoryId: "3",
      repositoryId: "3",
    });
    const units = projection({
      changes: [unknownWork, privateWork, publicWork],
      refs: [
        ref("refs/heads/main", [logicalKeyFrom(publicWork)]),
        ref("refs/heads/main", [logicalKeyFrom(privateWork)], {
          repositoryId: "2",
        }),
        ref("refs/heads/main", [logicalKeyFrom(unknownWork)], {
          repositoryId: "3",
        }),
      ],
      repositories: [
        repository("1"),
        repository("2", { visibility: "private" }),
        repository("3", { visibility: null }),
      ],
    });

    expect(units.map((unit) => unit.repositoryId)).toEqual(["1", "2"]);
  });

  test("is replay-stable for out-of-order evidence and rejects cyclic ancestry", () => {
    const ancestor = change("c", {
      logicalActivityAt: "2026-08-30T10:00:00.000Z",
    });
    const ancestorKey = githubLogicalChangeKey(
      ancestor.logicalRepositoryId,
      ancestor.logicalSha
    );
    const descendant = change("d", {
      logicalActivityAt: "2026-08-30T11:00:00.000Z",
      parentLogicalKeys: [ancestorKey],
    });
    const descendantKey = githubLogicalChangeKey(
      descendant.logicalRepositoryId,
      descendant.logicalSha
    );
    const main = ref("refs/heads/main", [ancestorKey, descendantKey]);
    const forward = projection({
      changes: [ancestor, descendant],
      refs: [main],
    });
    const reverse = projection({
      changes: [descendant, ancestor],
      refs: [main],
    });

    expect(reverse).toEqual(forward);
    expect(() =>
      stableTopologicalOrder([
        { logicalKey: ancestorKey, parentLogicalKeys: [descendantKey] },
        { logicalKey: descendantKey, parentLogicalKeys: [ancestorKey] },
      ])
    ).toThrow("cycle");
  });
});
