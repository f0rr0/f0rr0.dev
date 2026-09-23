import { describe, expect, test } from "bun:test";

import type { GitHubCommit } from "../src/lib/github-commits-core.ts";
import type { ClaimedGitHubRefRepair } from "../src/lib/github-ref-membership-store.ts";
import { validateGitHubRefRepairSource } from "../src/lib/github-ref-membership-store.ts";

const sha = (character: string) => character.repeat(40);
const branchLineageId = "10000000-0000-4000-8000-000000000001";

const activeRepair: Extract<ClaimedGitHubRefRepair, { active: true }> = {
  account: "f0rr0",
  active: true,
  attemptCount: 1,
  branchLineageId,
  coverageSinceAt: new Date("2026-08-01T00:00:00.000Z"),
  desiredHeadSha: sha("b"),
  leaseToken: "00000000-0000-4000-8000-000000000001",
  observedAt: new Date("2026-09-01T00:00:00.000Z"),
  refName: "refs/heads/main",
  repository: "f0rr0/example",
  repositoryId: "1",
};

const trackedCommit = (commitSha = sha("c")): GitHubCommit => ({
  author: "f0rr0",
  committedAt: "2026-08-31T12:00:00.000Z",
  message: "Implement current behavior",
  repository: "f0rr0/example",
  repositoryId: "1",
  sha: commitSha,
  url: `https://github.com/f0rr0/example/commit/${commitSha}`,
});

describe("GitHub ref repair source validation", () => {
  test("accepts the tracked-author intersection of complete reachability", () => {
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a"), sha("c"), sha("b")],
        commits: [trackedCommit()],
      });
    }).not.toThrow();
  });

  test("rejects a partial head or tracked commit outside reachability", () => {
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a")],
        commits: [],
      });
    }).toThrow(TypeError);
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a"), sha("b")],
        commits: [trackedCommit()],
      });
    }).toThrow(TypeError);
  });
});
