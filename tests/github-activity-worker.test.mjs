import { describe, expect, test } from "bun:test";

import {
  boundedWorkerLimit,
  exactGitHubDiffDigest,
  githubCommitActivityOccurredAt,
  githubPullRequestSnapshotDisposition,
  githubPrReconciliationCutoff,
  githubPrReconciliationMaximumAgeDays,
  githubSummaryCanPublish,
  GITHUB_EXACT_DIFF_DIGEST_RECIPE,
  nextGitHubPullRequestReconciliationAt,
  workerDeadlineReached,
} from "../src/lib/github-activity-worker-core.ts";

const commit = (files, overrides = {}) => {
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  return {
    committedAt: "2026-08-28T00:00:00.000Z",
    files,
    message: "fix: preserve the exact change",
    parents: ["a".repeat(40)],
    providerFileCapReached: false,
    sha: "b".repeat(40),
    stats: { additions, deletions, total: additions + deletions },
    ...overrides,
  };
};

const file = (patch, overrides = {}) => ({
  additions: 1,
  deletions: 1,
  filename: "src/example.ts",
  patch,
  previousFilename: null,
  status: "modified",
  ...overrides,
});

describe("GitHub exact diff digest", () => {
  test("ignores hunk coordinates but preserves stable context", () => {
    const first = exactGitHubDiffDigest(
      commit([
        file(
          "@@ -10,3 +10,3 @@ run()\n unchanged before\n-oldValue\n+newValue\n unchanged after"
        ),
      ])
    );
    const rebased = exactGitHubDiffDigest(
      commit([
        file(
          "@@ -900,3 +912,3 @@ run()\n unchanged before\n-oldValue\n+newValue\n unchanged after"
        ),
      ])
    );

    expect(first).toEqual(rebased);
    expect(first.complete).toBe(true);
    expect(first.recipe).toBe(GITHUB_EXACT_DIFF_DIGEST_RECIPE);

    const differentContext = exactGitHubDiffDigest(
      commit([
        file(
          "@@ -900,3 +912,3 @@ run()\n different context\n-oldValue\n+newValue\n other context"
        ),
      ])
    );
    expect(differentContext.digest).not.toBe(first.digest);
  });

  test("preserves changed-line order, whitespace, and no-newline markers", () => {
    const base = exactGitHubDiffDigest(
      commit([
        file(
          "@@ -1 +1 @@\n-oldValue\n\\ No newline at end of file\n+newValue\n\\ No newline at end of file"
        ),
      ])
    );
    const whitespaceChanged = exactGitHubDiffDigest(
      commit([file("@@ -1 +1 @@\n-oldValue\n+ newValue")])
    );
    const orderChanged = exactGitHubDiffDigest(
      commit([file("@@ -1 +1 @@\n+newValue\n-oldValue")])
    );

    expect(base.complete).toBe(true);
    expect(whitespaceChanged.complete).toBe(true);
    expect(orderChanged.complete).toBe(true);
    expect(whitespaceChanged.digest).not.toBe(base.digest);
    expect(orderChanged.digest).not.toBe(base.digest);
  });

  test("is stable across file order and excludes commit identity", () => {
    const alpha = file("@@ -1 +1 @@\n-oldA\n+newA", {
      filename: "src/a.ts",
    });
    const beta = file("@@ -1 +1 @@\n-oldB\n+newB", {
      filename: "src/b.ts",
    });
    const first = exactGitHubDiffDigest(commit([beta, alpha]));
    const second = exactGitHubDiffDigest(
      commit([alpha, beta], {
        message: "a rewritten commit",
        parents: ["c".repeat(40)],
        sha: "d".repeat(40),
      })
    );

    expect(first).toEqual(second);
  });

  test("marks partial provider evidence and counter mismatches incomplete", () => {
    expect(exactGitHubDiffDigest(commit([])).complete).toBe(false);
    expect(exactGitHubDiffDigest(commit([file(null)])).complete).toBe(false);
    expect(
      exactGitHubDiffDigest(
        commit([file("@@ -1 +1 @@\n-oldValue\n+newValue")], {
          providerFileCapReached: true,
        })
      ).complete
    ).toBe(false);
    expect(
      exactGitHubDiffDigest(
        commit([file("@@ -1 +1,2 @@\n-oldValue\n+newValue", { additions: 2 })])
      ).complete
    ).toBe(false);
  });
});

describe("GitHub activity worker bounds", () => {
  test("accepts only deliberately small batches", () => {
    expect(boundedWorkerLimit()).toBe(2);
    expect(boundedWorkerLimit(8)).toBe(8);
    expect(() => boundedWorkerLimit(0)).toThrow("batch size");
    expect(() => boundedWorkerLimit(9)).toThrow("batch size");
  });

  test("uses a deterministic wall-clock deadline", () => {
    expect(workerDeadlineReached(1000, 10_000, 10_999)).toBe(false);
    expect(workerDeadlineReached(1000, 10_000, 11_000)).toBe(true);
  });

  test("orders commits by committer time and stops terminal PR polling", () => {
    expect(
      githubCommitActivityOccurredAt({
        authoredAt: "2026-08-01T10:00:00.000Z",
        committerAt: "2026-08-03T12:00:00.000Z",
      }).toISOString()
    ).toBe("2026-08-03T12:00:00.000Z");
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(nextGitHubPullRequestReconciliationAt("merged", now)).toBeNull();
    expect(nextGitHubPullRequestReconciliationAt("closed", now)).toBeNull();
    expect(
      nextGitHubPullRequestReconciliationAt("open", now)?.toISOString()
    ).toBe("2026-08-28T15:00:00.000Z");
  });

  test("parses the bounded PR reconciliation horizon", () => {
    expect(githubPrReconciliationMaximumAgeDays()).toBe(30);
    expect(githubPrReconciliationMaximumAgeDays(" 45 ")).toBe(45);
    expect(githubPrReconciliationMaximumAgeDays("infinity")).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(githubPrReconciliationMaximumAgeDays(" Infinity ")).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(() => githubPrReconciliationMaximumAgeDays("0")).toThrow(
      "positive integer"
    );
    expect(() => githubPrReconciliationMaximumAgeDays("all")).toThrow(
      "positive integer"
    );
    const now = new Date("2026-08-28T12:00:00.000Z");
    expect(githubPrReconciliationCutoff(30, now)?.toISOString()).toBe(
      "2026-07-29T12:00:00.000Z"
    );
    expect(
      githubPrReconciliationCutoff(Number.MAX_SAFE_INTEGER, now)
    ).toBeNull();
  });

  test("keeps a one-shot summary unpublished while canonicalization is dirty", () => {
    const current = {
      activityRevision: 1,
      attemptRevision: 1,
      canonicalPublicId: null,
      hidden: false,
    };
    expect(githubSummaryCanPublish({ ...current, canonicalized: false })).toBe(
      false
    );
    expect(githubSummaryCanPublish({ ...current, canonicalized: true })).toBe(
      true
    );
    expect(
      githubSummaryCanPublish({
        ...current,
        canonicalized: true,
        canonicalPublicId: "canonical-id",
        hidden: true,
      })
    ).toBe(false);
  });

  test("lets authoritative REST settle same-second close and synchronize races", () => {
    const providerSecond = new Date("2026-08-28T12:00:00.000Z");
    expect(
      githubPullRequestSnapshotDisposition(
        providerSecond,
        providerSecond,
        false
      )
    ).toBe("equal_observed");
    expect(
      githubPullRequestSnapshotDisposition(providerSecond, providerSecond, true)
    ).toBe("equal_authoritative");
  });
});
