import { describe, expect, test } from "bun:test";

import {
  backfillArgumentsFrom,
  requireBackfillEnvironment,
  runGitHubBackfillFactualDrain,
  runGitHubBackfillDiscovery,
} from "../scripts/backfill-github-activity.ts";
import {
  githubBackfillDiscoveryReportFrom,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core.ts";

const now = new Date("2026-08-29T15:00:00.000Z");

const request = githubBackfillRequestFrom(
  {
    account: "f0rr0",
    endDate: "2026-08-29",
    repositoryId: "",
    startDate: "2026-08-01",
  },
  now
);

if (request === null) {
  throw new Error("The test backfill request is invalid.");
}

const completePullRequests = (overrides = {}) => ({
  complete: true,
  retryAt: null,
  stopReason: "complete",
  unavailablePullRequests: 0,
  ...overrides,
});

const completeRepositoryInventory = (overrides = {}) => ({
  complete: true,
  retryAt: null,
  stopReason: "complete",
  ...overrides,
});

const completeCurrentHeads = (overrides = {}) => ({
  claimedRefs: 0,
  complete: true,
  completedGenerations: 0,
  deferredRefs: 0,
  deletedGenerations: 0,
  insertedCommits: 0,
  memberCommits: 0,
  remainingRefs: 0,
  retryAt: null,
  staleRefs: 0,
  stopReason: "complete",
  ...overrides,
});

const emptyPendingFactualWork = (overrides = {}) => ({
  commitEnrichment: 0,
  commitPullRequests: 0,
  pullRequestReconciliation: 0,
  pullRequestSignals: 0,
  pushObservations: 0,
  total: 0,
  ...overrides,
});

const completeFactualDrain = (overrides = {}) => ({
  claimed: 0,
  complete: true,
  completed: 0,
  passes: 0,
  pending: emptyPendingFactualWork(),
  projectionRuns: 1,
  retryAt: null,
  stopReason: "complete",
  unavailable: 0,
  ...overrides,
});

const emptyWorkerStage = (overrides = {}) => ({
  claimed: 0,
  completed: 0,
  deferred: 0,
  failed: 0,
  unavailable: 0,
  ...overrides,
});

const workerResult = (overrides = {}) => ({
  commits: emptyWorkerStage(),
  deadlineReached: false,
  observations: emptyWorkerStage(),
  projection: null,
  pullRequests: emptyWorkerStage(),
  pullRequestDiscovery: emptyWorkerStage(),
  pullRequestSignals: emptyWorkerStage(),
  refs: emptyWorkerStage(),
  summaries: emptyWorkerStage(),
  ...overrides,
});

const accountInventory = (overrides = {}) => ({
  account: "f0rr0",
  identity: { complete: true, retryAt: null, stopReason: "complete" },
  pullRequests: completePullRequests(),
  repositoryInventory: completeRepositoryInventory(),
  ...overrides,
});

const inventory = (overrides = {}) => ({
  accounts: [accountInventory()],
  currentHeads: completeCurrentHeads(),
  factualDrain: completeFactualDrain(),
  ...overrides,
});

const command = [
  "--account",
  "f0rr0",
  "--start-date",
  "2026-08-01",
  "--end-date",
  "2026-08-29",
];

describe("GitHub factual history backfill", () => {
  test("defaults to the hard 30-minute cap and rejects larger budgets", () => {
    expect(backfillArgumentsFrom(command).maximumMinutes).toBe(30);
    expect(
      backfillArgumentsFrom([...command, "--maximum-minutes", "30"])
        .maximumMinutes
    ).toBe(30);
    expect(() =>
      backfillArgumentsFrom([...command, "--maximum-minutes", "31"])
    ).toThrow(RangeError);
  });

  test("keeps command and environment validation minimal", () => {
    expect(() =>
      backfillArgumentsFrom([...command, "--account", "f0rr0"])
    ).toThrow(TypeError);
    expect(() => {
      requireBackfillEnvironment(request, {
        DATABASE_URL: "postgresql://activity.example/database",
        GITHUB_F0RR0_TOKEN: "token",
      });
    }).not.toThrow();
    expect(() => {
      requireBackfillEnvironment(request, {
        DATABASE_URL: "postgresql://activity.example/database",
      });
    }).toThrow();
  });

  test("normalizes one bounded UTC scope and requires old runs to be sharded", () => {
    expect(request).toMatchObject({
      accounts: ["f0rr0"],
      endDate: "2026-08-29",
      repositoryId: null,
      startDate: "2026-08-01",
    });
    expect(request.sinceAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(request.untilAt).toEqual(new Date("2026-08-29T23:59:59.999Z"));
    const oldScope = {
      account: "f0rr0",
      endDate: "2026-07-28",
      startDate: "2026-06-28",
    };
    expect(
      githubBackfillRequestFrom({ ...oldScope, repositoryId: "" }, now)
    ).toBeNull();
    expect(
      githubBackfillRequestFrom({ ...oldScope, repositoryId: "123456789" }, now)
    ).not.toBeNull();
  });

  test("reports complete traversal separately from explicit PR gaps", () => {
    expect(
      githubBackfillDiscoveryReportFrom({
        deadlineAt: now.getTime(),
        inventory: inventory(),
      })
    ).toMatchObject({
      complete: true,
      coverageGaps: { total: 0 },
      interruptions: [],
      outcome: "complete",
    });

    const withGaps = githubBackfillDiscoveryReportFrom({
      deadlineAt: now.getTime(),
      inventory: inventory({
        accounts: [
          accountInventory({
            pullRequests: completePullRequests({
              unavailablePullRequests: 2,
            }),
          }),
        ],
      }),
    });
    expect(withGaps).toMatchObject({
      complete: true,
      coverageGaps: { total: 2 },
      outcome: "completed_with_gaps",
    });

    expect(
      githubBackfillDiscoveryReportFrom({
        deadlineAt: now.getTime(),
        inventory: inventory({
          factualDrain: completeFactualDrain({ unavailable: 2 }),
        }),
      })
    ).toMatchObject({
      complete: true,
      coverageGaps: { factualWorker: 2, total: 2 },
      outcome: "completed_with_gaps",
    });
  });

  test("reports account retries and global ref deferrals distinctly", () => {
    const retryAt = new Date("2026-08-29T15:05:00.000Z");
    const report = githubBackfillDiscoveryReportFrom({
      deadlineAt: now.getTime() + 30 * 60_000,
      inventory: inventory({
        accounts: [
          accountInventory({
            pullRequests: completePullRequests({
              complete: false,
              retryAt,
              stopReason: "provider_retry",
            }),
          }),
        ],
      }),
    });
    expect(report).toMatchObject({
      complete: false,
      interruptions: [
        {
          account: "f0rr0",
          retryAt: retryAt.toISOString(),
          stage: "pull_requests",
          stopReason: "provider_retry",
        },
      ],
      outcome: "incomplete",
    });

    const deferredHeads = githubBackfillDiscoveryReportFrom({
      deadlineAt: now.getTime() + 30 * 60_000,
      inventory: inventory({
        currentHeads: completeCurrentHeads({
          complete: false,
          remainingRefs: 1,
          retryAt,
          stopReason: "deferred",
        }),
      }),
    });
    expect(deferredHeads.interruptions).toEqual([
      {
        account: null,
        retryAt: retryAt.toISOString(),
        stage: "current_heads",
        stopReason: "deferred",
      },
    ]);

    const deferredFactualWork = githubBackfillDiscoveryReportFrom({
      deadlineAt: now.getTime() + 30 * 60_000,
      inventory: inventory({
        factualDrain: completeFactualDrain({
          complete: false,
          pending: emptyPendingFactualWork({
            commitPullRequests: 1,
            total: 1,
          }),
          retryAt,
          stopReason: "deferred",
        }),
      }),
    });
    expect(deferredFactualWork.interruptions).toEqual([
      {
        account: null,
        retryAt: retryAt.toISOString(),
        stage: "factual_drain",
        stopReason: "deferred",
      },
    ]);
  });

  test("repairs current heads once before factual PR discovery", async () => {
    const calls = [];
    const discovered = await runGitHubBackfillDiscovery(
      {
        deadlineAt: now.getTime() + 30 * 60_000,
        environment: { GITHUB_F0RR0_TOKEN: "token" },
        request,
      },
      {
        assertIdentity: async () => {
          calls.push("identity");
        },
        discoverCurrentHeads: async () => {
          calls.push("current_heads");
          return completeCurrentHeads({ completedGenerations: 1 });
        },
        discoverPullRequests: async () => {
          calls.push("pull_requests");
          return completePullRequests();
        },
        drainFactual: async () => {
          calls.push("factual_drain");
          return completeFactualDrain();
        },
        loadRepositoryInventory: async () => {
          calls.push("repository_inventory");
          return [];
        },
        lowerRefCoverage: async (accounts, sinceAt) => {
          calls.push("lower_ref_coverage");
          expect(accounts).toEqual(["f0rr0"]);
          expect(sinceAt).toEqual(request.sinceAt);
        },
      }
    );

    expect(calls).toEqual([
      "identity",
      "repository_inventory",
      "lower_ref_coverage",
      "current_heads",
      "pull_requests",
      "factual_drain",
    ]);
    expect(discovered.currentHeads?.completedGenerations).toBe(1);
    expect(
      githubBackfillDiscoveryReportFrom({
        deadlineAt: now.getTime() + 30 * 60_000,
        inventory: discovered,
      }).outcome
    ).toBe("complete");
  });

  test("does not let PR pagination starve unfinished current-head repair", async () => {
    let pullRequestsCalled = false;
    const discovered = await runGitHubBackfillDiscovery(
      {
        deadlineAt: now.getTime() + 30 * 60_000,
        environment: { GITHUB_F0RR0_TOKEN: "token" },
        request,
      },
      {
        assertIdentity: async () => null,
        discoverCurrentHeads: async () =>
          completeCurrentHeads({
            complete: false,
            remainingRefs: 2,
            stopReason: "deadline",
          }),
        discoverPullRequests: async () => {
          pullRequestsCalled = true;
          return completePullRequests();
        },
        drainFactual: async () => completeFactualDrain(),
        loadRepositoryInventory: async () => [],
        lowerRefCoverage: async () => null,
      }
    );

    expect(pullRequestsCalled).toBe(false);
    expect(discovered.accounts[0]?.pullRequests).toBeNull();
    expect(discovered.currentHeads?.remainingRefs).toBe(2);
  });

  test("does not rerun ref repair after an incomplete PR traversal", async () => {
    let refPasses = 0;
    const discovered = await runGitHubBackfillDiscovery(
      {
        deadlineAt: now.getTime() + 30 * 60_000,
        environment: { GITHUB_F0RR0_TOKEN: "token" },
        request,
      },
      {
        assertIdentity: async () => null,
        discoverCurrentHeads: async () => {
          refPasses += 1;
          return completeCurrentHeads();
        },
        discoverPullRequests: async () =>
          completePullRequests({
            complete: false,
            stopReason: "deadline",
          }),
        drainFactual: async () => completeFactualDrain(),
        loadRepositoryInventory: async () => [],
        lowerRefCoverage: async () => null,
      }
    );

    expect(refPasses).toBe(1);
    expect(discovered.accounts[0]?.pullRequests?.complete).toBe(false);
  });

  test("does not lower ref coverage until daily repository inventory is complete", async () => {
    const unavailable = new Error("Inventory refresh is in progress.");
    unavailable.name = "GitHubRepositoryInventoryUnavailableError";
    let currentHeadsCalled = false;
    let coverageLowered = false;
    const discovered = await runGitHubBackfillDiscovery(
      {
        deadlineAt: now.getTime() + 30 * 60_000,
        environment: { GITHUB_F0RR0_TOKEN: "token" },
        request,
      },
      {
        assertIdentity: async () => null,
        discoverCurrentHeads: async () => {
          currentHeadsCalled = true;
          return completeCurrentHeads();
        },
        discoverPullRequests: async () => completePullRequests(),
        drainFactual: async () => completeFactualDrain(),
        loadRepositoryInventory: async () => {
          throw unavailable;
        },
        lowerRefCoverage: async () => {
          coverageLowered = true;
        },
      }
    );

    expect(currentHeadsCalled).toBe(false);
    expect(coverageLowered).toBe(false);
    expect(discovered.accounts[0]).toMatchObject({
      pullRequests: null,
      repositoryInventory: {
        complete: false,
        retryAt: null,
        stopReason: "deferred",
      },
    });
    expect(
      githubBackfillDiscoveryReportFrom({
        deadlineAt: now.getTime() + 30 * 60_000,
        inventory: discovered,
      }).interruptions
    ).toEqual([
      {
        account: "f0rr0",
        retryAt: null,
        stage: "repository_inventory",
        stopReason: "deferred",
      },
    ]);
  });

  test("drains facts without summaries, refs, or repeated projections", async () => {
    const workerOptions = [];
    let projectionRuns = 0;
    const result = await runGitHubBackfillFactualDrain(
      {
        accounts: ["f0rr0"],
        deadlineAt: Date.now() + 60_000,
        request,
      },
      {
        readBacklog: async () => ({
          pending: emptyPendingFactualWork(),
          retryAt: null,
          unavailable: 0,
        }),
        refreshProjection: async () => {
          projectionRuns += 1;
          return {};
        },
        runWorker: async (options) => {
          workerOptions.push(options);
          return workerResult({
            observations: emptyWorkerStage({ claimed: 1, completed: 1 }),
          });
        },
      }
    );

    expect(result).toMatchObject({
      claimed: 1,
      complete: true,
      completed: 1,
      passes: 1,
      projectionRuns: 1,
      stopReason: "complete",
    });
    expect(projectionRuns).toBe(1);
    expect(workerOptions).toHaveLength(1);
    expect(workerOptions[0]).toMatchObject({
      accounts: ["f0rr0"],
      includeProjection: false,
      includeRefs: false,
      includeSummaries: false,
      scope: {
        repositoryId: null,
        sinceAt: request.sinceAt,
        untilAt: request.untilAt,
      },
    });
  });

  test("returns a durable factual deferral without sleeping or generating summaries", async () => {
    const retryAt = new Date(Date.now() + 15 * 60_000);
    let workerPasses = 0;
    let projectionRuns = 0;
    const result = await runGitHubBackfillFactualDrain(
      {
        accounts: ["f0rr0"],
        deadlineAt: Date.now() + 60_000,
        request,
      },
      {
        readBacklog: async () => ({
          pending: emptyPendingFactualWork({
            commitEnrichment: 1,
            total: 1,
          }),
          retryAt,
          unavailable: 0,
        }),
        refreshProjection: async () => {
          projectionRuns += 1;
          return {};
        },
        runWorker: async (options) => {
          workerPasses += 1;
          expect(options.includeProjection).toBe(false);
          expect(options.includeSummaries).toBe(false);
          return workerResult({
            commits: emptyWorkerStage({
              claimed: 1,
              deferred: 1,
              failed: 1,
            }),
          });
        },
      }
    );

    expect(workerPasses).toBe(1);
    expect(projectionRuns).toBe(0);
    expect(result).toMatchObject({
      claimed: 1,
      complete: false,
      pending: { commitEnrichment: 1, total: 1 },
      retryAt,
      stopReason: "deferred",
    });
  });

  test("continues with ready work after one claim defers", async () => {
    let backlogReads = 0;
    let workerPasses = 0;
    const result = await runGitHubBackfillFactualDrain(
      {
        accounts: ["f0rr0"],
        deadlineAt: Date.now() + 60_000,
        request,
      },
      {
        readBacklog: async () => {
          backlogReads += 1;
          return backlogReads === 1
            ? {
                pending: emptyPendingFactualWork({
                  commitEnrichment: 1,
                  total: 1,
                }),
                retryAt: null,
                unavailable: 0,
              }
            : {
                pending: emptyPendingFactualWork(),
                retryAt: null,
                unavailable: 0,
              };
        },
        refreshProjection: async () => ({}),
        runWorker: async () => {
          workerPasses += 1;
          return workerResult({
            commits:
              workerPasses === 1
                ? emptyWorkerStage({ claimed: 1, deferred: 1, failed: 1 })
                : emptyWorkerStage({ claimed: 1, completed: 1 }),
          });
        },
      }
    );

    expect(result).toMatchObject({
      claimed: 2,
      complete: true,
      completed: 1,
      passes: 2,
      projectionRuns: 1,
      stopReason: "complete",
    });
    expect(workerPasses).toBe(2);
  });

  test("stops without spinning when no ready work can be claimed", async () => {
    let workerPasses = 0;
    const result = await runGitHubBackfillFactualDrain(
      {
        accounts: ["f0rr0"],
        deadlineAt: Date.now() + 60_000,
        request,
      },
      {
        readBacklog: async () => ({
          pending: emptyPendingFactualWork({
            pullRequestReconciliation: 1,
            total: 1,
          }),
          retryAt: null,
          unavailable: 0,
        }),
        refreshProjection: async () => ({}),
        runWorker: async () => {
          workerPasses += 1;
          return workerResult();
        },
      }
    );

    expect(result).toMatchObject({
      claimed: 0,
      complete: false,
      passes: 1,
      retryAt: null,
      stopReason: "deferred",
    });
    expect(workerPasses).toBe(1);
  });
});
