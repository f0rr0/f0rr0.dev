import { describe, expect, test } from "bun:test";

import {
  GitHubRequestDeadlineError,
  GitHubResponseError,
} from "../src/lib/github-api.ts";
import { backfillGitHubCurrentRefGenerations } from "../src/lib/github-direct-backfill.ts";

const sha = (character) => character.repeat(40);
const retryAt = new Date("2026-09-01T00:15:00.000Z");

const activeRepair = (overrides = {}) => ({
  account: "f0rr0",
  active: true,
  attemptCount: 1,
  branchLineageId: "10000000-0000-4000-8000-000000000001",
  coverageSinceAt: new Date("2026-08-01T00:00:00.000Z"),
  desiredHeadSha: sha("a"),
  leaseToken: "20000000-0000-4000-8000-000000000001",
  observedAt: new Date("2026-09-01T00:00:00.000Z"),
  refName: "refs/heads/main",
  repository: "f0rr0/example",
  repositoryId: "1",
  ...overrides,
});

const deletedRepair = {
  ...activeRepair({
    branchLineageId: "10000000-0000-4000-8000-000000000002",
    leaseToken: "20000000-0000-4000-8000-000000000002",
    refName: "refs/heads/deleted",
  }),
  account: null,
  active: false,
  coverageSinceAt: null,
};

const source = (reference) => ({
  commitShas: [reference.headSha],
  commits: [
    {
      author: "f0rr0",
      committedAt: "2026-08-20T00:00:00.000Z",
      message: "Implement ref repair",
      repository: reference.repository,
      repositoryId: reference.repositoryId,
      sha: reference.headSha,
      url: `https://github.com/${reference.repository}/commit/${reference.headSha}`,
    },
  ],
});

const dependencies = (overrides = {}) => ({
  claim: async () => [],
  completeActive: async () => ({
    generation: 1,
    insertedCommits: 1,
    memberCount: 1,
    stale: false,
  }),
  completeDeleted: async () => ({ stale: false }),
  defer: async () => retryAt,
  fetch: async (reference) => source(reference),
  readBacklog: async () => ({ remaining: 0, retryAt: null }),
  release: async () => null,
  ...overrides,
});

describe("GitHub current-head generation backfill", () => {
  test("drains only claimed desired generations and checkpoints each result", async () => {
    const claims = [[activeRepair(), deletedRepair], []];
    const completed = [];
    const deleted = [];
    const result = await backfillGitHubCurrentRefGenerations(
      {
        deadlineAt: Date.now() + 60_000,
        repositoryId: null,
      },
      dependencies({
        claim: async () => claims.shift() ?? [],
        completeActive: async (repair, membership) => {
          completed.push([repair.refName, membership.commitShas]);
          return {
            generation: 4,
            insertedCommits: 1,
            memberCount: 1,
            stale: false,
          };
        },
        completeDeleted: async (repair) => {
          deleted.push(repair.refName);
          return { stale: false };
        },
      })
    );

    expect(result).toMatchObject({
      claimedRefs: 2,
      complete: true,
      completedGenerations: 1,
      deletedGenerations: 1,
      insertedCommits: 1,
      memberCommits: 1,
      remainingRefs: 0,
      stopReason: "complete",
    });
    expect(completed).toEqual([
      ["refs/heads/main", [activeRepair().desiredHeadSha]],
    ]);
    expect(deleted).toEqual(["refs/heads/deleted"]);
  });

  test("persists provider deferral and releases unstarted claims immediately", async () => {
    const first = activeRepair();
    const second = activeRepair({
      desiredHeadSha: sha("b"),
      leaseToken: "20000000-0000-4000-8000-000000000003",
      refName: "refs/heads/next",
    });
    const released = [];
    const deferred = [];
    const result = await backfillGitHubCurrentRefGenerations(
      {
        deadlineAt: Date.now() + 60_000,
        repositoryId: null,
      },
      dependencies({
        claim: async () => [first, second],
        defer: async (repair, code, requestedRetryAt) => {
          deferred.push([repair.refName, code, requestedRetryAt]);
          return retryAt;
        },
        fetch: async () => {
          throw new GitHubResponseError(429, {
            retryable: true,
            retryAt,
          });
        },
        readBacklog: async () => ({ remaining: 2, retryAt }),
        release: async (repair) => {
          released.push(repair.refName);
        },
      })
    );

    expect(result).toMatchObject({
      claimedRefs: 2,
      complete: false,
      deferredRefs: 1,
      remainingRefs: 2,
      retryAt,
      stopReason: "provider_retry",
    });
    expect(deferred).toEqual([["refs/heads/main", "github_429", retryAt]]);
    expect(released).toEqual(["refs/heads/next"]);
  });

  test("releases the current batch when one ref reaches the deadline", async () => {
    const first = activeRepair();
    const second = activeRepair({
      leaseToken: "20000000-0000-4000-8000-000000000004",
      refName: "refs/heads/next",
    });
    const released = [];
    const result = await backfillGitHubCurrentRefGenerations(
      {
        deadlineAt: Date.now() + 60_000,
        repositoryId: null,
      },
      dependencies({
        claim: async () => [first, second],
        fetch: async () => {
          throw new GitHubRequestDeadlineError();
        },
        readBacklog: async () => ({ remaining: 2, retryAt: null }),
        release: async (repair) => {
          released.push(repair.refName);
        },
      })
    );

    expect(result).toMatchObject({
      complete: false,
      remainingRefs: 2,
      stopReason: "deadline",
    });
    expect(released).toEqual(["refs/heads/main", "refs/heads/next"]);
  });

  test("does not spin when all remaining generations are durably deferred", async () => {
    let claims = 0;
    const result = await backfillGitHubCurrentRefGenerations(
      {
        deadlineAt: Date.now() + 60_000,
        repositoryId: "1",
      },
      dependencies({
        claim: async (input) => {
          claims += 1;
          expect(input.repositoryId).toBe("1");
          return [];
        },
        readBacklog: async (input) => {
          expect(input.repositoryId).toBe("1");
          return { remaining: 1, retryAt };
        },
      })
    );

    expect(claims).toBe(1);
    expect(result).toMatchObject({
      claimedRefs: 0,
      complete: false,
      remainingRefs: 1,
      retryAt,
      stopReason: "deferred",
    });
  });
});
