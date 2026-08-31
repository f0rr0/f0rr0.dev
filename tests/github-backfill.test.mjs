import { describe, expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  backfillArgumentsFrom,
  backfillRetryWaitMillisecondsFrom,
  runBeforeDeadline,
} from "../scripts/backfill-github-activity.ts";
import {
  GITHUB_BACKFILL_WORKER_BATCH_SIZE,
  githubBackfillCompletionFrom,
  githubBackfillDiscoveryCompleteFrom,
  githubBackfillExitCodeFrom,
  githubBackfillOutcomeFrom,
  githubBackfillProcessingMadeProgress,
  githubBackfillProcessingCountsFrom,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core.ts";

const now = new Date("2026-08-29T15:00:00.000Z");

const discoveryInventory = (overrides = {}) => ({
  direct: { complete: true, unavailableRepositories: 0 },
  pullRequests: { complete: true, unavailablePullRequests: 0 },
  ...overrides,
});

const auditResult = (status, earliestRetryAt) => ({
  pipeline: { earliestRetryAt },
  status,
});

describe("GitHub history backfill requests", () => {
  test("rejects duplicate and unknown command arguments", () => {
    expect(() =>
      backfillArgumentsFrom(["--account", "f0rr0", "--account", "f0rr0"])
    ).toThrow("arguments are invalid");
    expect(() => backfillArgumentsFrom(["--unexpected", "value"])).toThrow(
      "arguments are invalid"
    );
  });

  test("uses the maximum batch size accepted by every configurable worker stage", () => {
    expect(GITHUB_BACKFILL_WORKER_BATCH_SIZE).toBe(8);
  });

  test("exits successfully only after discovery and every scoped audit settle", () => {
    const complete = githubBackfillCompletionFrom({
      auditStatuses: [
        "stored_projection_verified",
        "stored_projection_verified",
      ],
      boundedDiscoveryComplete: true,
    });
    expect(complete).toEqual({ complete: true, pipelineSettled: true });
    expect(githubBackfillExitCodeFrom(complete)).toBe(0);

    for (const incomplete of [
      githubBackfillCompletionFrom({
        auditStatuses: ["stored_projection_verified"],
        boundedDiscoveryComplete: false,
      }),
      ...["pipeline_incomplete", "mismatch", "inconclusive"].map((status) =>
        githubBackfillCompletionFrom({
          auditStatuses: ["stored_projection_verified", status],
          boundedDiscoveryComplete: true,
        })
      ),
      githubBackfillCompletionFrom({
        auditStatuses: [],
        boundedDiscoveryComplete: true,
      }),
    ]) {
      expect(incomplete.complete).toBe(false);
      expect(githubBackfillExitCodeFrom(incomplete)).toBe(1);
    }
  });

  test("distinguishes a finished traversal with explicit coverage gaps", () => {
    const complete = { complete: true, pipelineSettled: true };
    expect(githubBackfillOutcomeFrom(complete, 0)).toBe("complete");
    expect(githubBackfillOutcomeFrom(complete, 2)).toBe("completed_with_gaps");
    expect(
      githubBackfillOutcomeFrom({ complete: false, pipelineSettled: false }, 2)
    ).toBe("incomplete");
    expect(() => githubBackfillOutcomeFrom(complete, -1)).toThrow(
      "coverage gap count"
    );
  });

  test("reports traversal completion separately from explicit coverage gaps", () => {
    expect(githubBackfillDiscoveryCompleteFrom([discoveryInventory()])).toBe(
      true
    );
    expect(githubBackfillDiscoveryCompleteFrom([])).toBe(false);
    expect(
      githubBackfillDiscoveryCompleteFrom([
        discoveryInventory({ direct: null }),
      ])
    ).toBe(false);
    expect(
      githubBackfillDiscoveryCompleteFrom([
        discoveryInventory({
          direct: { complete: true, unavailableRepositories: 1 },
        }),
      ])
    ).toBe(true);
    expect(
      githubBackfillDiscoveryCompleteFrom([
        discoveryInventory({
          pullRequests: { complete: true, unavailablePullRequests: 1 },
        }),
      ])
    ).toBe(true);
    expect(
      githubBackfillDiscoveryCompleteFrom([
        discoveryInventory({ direct: { complete: false } }),
      ])
    ).toBe(false);
    expect(
      githubBackfillDiscoveryCompleteFrom([
        discoveryInventory({ pullRequests: { complete: false } }),
      ])
    ).toBe(false);
  });

  test("reports disjoint outcomes across every stage including PR reconciliation", () => {
    expect(
      githubBackfillProcessingCountsFrom({
        aliases: 7,
        canonicalizationAttempts: 9,
        canonicalized: 8,
        commits: {
          claimed: 4,
          completed: 1,
          deferred: 1,
          failed: 3,
          unavailable: 1,
        },
        observations: {
          claimed: 2,
          completed: 2,
          deferred: 0,
          failed: 0,
          unavailable: 0,
        },
        pullRequestDiscovery: {
          claimed: 3,
          completed: 1,
          deferred: 2,
          failed: 2,
          unavailable: 0,
        },
        pullRequests: {
          claimed: 5,
          completed: 2,
          deferred: 1,
          failed: 3,
          unavailable: 1,
        },
        pullRequestSignals: {
          claimed: 2,
          completed: 1,
          deferred: 0,
          failed: 0,
          unavailable: 0,
        },
        summaries: {
          claimed: 4,
          completed: 2,
          deferred: 1,
          failed: 2,
          unavailable: 0,
        },
      })
    ).toEqual({
      aliases: 7,
      canonicalizationAttempts: 9,
      canonicalized: 8,
      claimed: 20,
      deferred: 5,
      failed: 3,
      processed: 9,
      unavailable: 2,
    });
  });

  test("keeps draining when canonicalization progresses without queue claims", () => {
    expect(
      githubBackfillProcessingMadeProgress({
        canonicalizationAttempts: 1,
        claimed: 0,
      })
    ).toBe(true);
    expect(
      githubBackfillProcessingMadeProgress({
        canonicalizationAttempts: 0,
        claimed: 1,
      })
    ).toBe(true);
    expect(
      githubBackfillProcessingMadeProgress({
        canonicalizationAttempts: 0,
        claimed: 0,
      })
    ).toBe(false);
  });

  test("waits for a scoped retry only when it fits inside the hard budget", () => {
    const nowAt = Date.parse("2026-08-30T00:00:00.000Z");
    expect(
      backfillRetryWaitMillisecondsFrom(
        [auditResult("pipeline_incomplete", "2026-08-30T00:15:00.000Z")],
        nowAt + 60 * 60 * 1000,
        nowAt
      )
    ).toBe(15 * 60 * 1000);
    expect(
      backfillRetryWaitMillisecondsFrom(
        [auditResult("pipeline_incomplete", "2026-08-29T23:59:00.000Z")],
        nowAt + 60 * 60 * 1000,
        nowAt
      )
    ).toBe(1000);
    expect(
      backfillRetryWaitMillisecondsFrom(
        [auditResult("pipeline_incomplete", "2026-08-30T00:59:45.000Z")],
        nowAt + 60 * 60 * 1000,
        nowAt
      )
    ).toBeNull();
    expect(
      backfillRetryWaitMillisecondsFrom(
        [auditResult("mismatch", "2026-08-30T00:15:00.000Z")],
        nowAt + 60 * 60 * 1000,
        nowAt
      )
    ).toBeNull();
  });

  test("retries an inconclusive projection read with bounded backoff", () => {
    const nowAt = Date.parse("2026-08-30T00:00:00.000Z");
    const audits = [auditResult("inconclusive", null)];
    expect(
      backfillRetryWaitMillisecondsFrom(audits, nowAt + 60_000, nowAt, 0)
    ).toBe(2000);
    expect(
      backfillRetryWaitMillisecondsFrom(audits, nowAt + 60_000, nowAt, 1)
    ).toBe(5000);
    expect(
      backfillRetryWaitMillisecondsFrom(audits, nowAt + 60_000, nowAt, 2)
    ).toBe(10_000);
    expect(
      backfillRetryWaitMillisecondsFrom(audits, nowAt + 60_000, nowAt, 3)
    ).toBeNull();
  });

  test("ends an in-flight stage at the selected wall-clock deadline", async () => {
    const startedAt = Date.now();
    await expect(
      runBeforeDeadline(delay(1000), startedAt + 25)
    ).rejects.toThrow("deadline");
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test("normalizes one bounded inclusive UTC range", () => {
    const request = githubBackfillRequestFrom(
      {
        account: "all",
        endDate: "2026-08-29",
        repositoryId: "123456789",
        startDate: "2026-08-01",
      },
      now
    );

    expect(request).toMatchObject({
      accounts: ["f0rr0", "yuppiestechdev"],
      endDate: "2026-08-29",
      repositoryId: "123456789",
      startDate: "2026-08-01",
    });
    expect(request?.sinceAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(request?.untilAt).toEqual(new Date("2026-08-29T23:59:59.999Z"));
  });

  test("accepts one account and an unfiltered repository set", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-29",
          repositoryId: "",
          startDate: "2026-08-29",
        },
        now
      )
    ).toMatchObject({ accounts: ["f0rr0"], repositoryId: null });
  });

  test("accepts at most 31 commit days per invocation", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-31",
          repositoryId: "",
          startDate: "2026-08-01",
        },
        new Date("2026-08-31T15:00:00.000Z")
      )
    ).not.toBeNull();
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-29",
          repositoryId: "",
          startDate: "2024-01-01",
        },
        now
      )
    ).toBeNull();
  });

  test("bounds broad provider discovery while allowing older repository recovery", () => {
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
    ).toMatchObject({ repositoryId: "123456789" });
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-07-29",
          repositoryId: "",
          startDate: "2026-06-29",
        },
        now
      )
    ).not.toBeNull();
  });

  test("accepts GitHub's documented final timestamp day", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2099-12-31",
          repositoryId: "",
          startDate: "2099-12-31",
        },
        new Date("2100-01-01T00:00:00.000Z")
      )
    ).toMatchObject({
      sinceAt: new Date("2099-12-31T00:00:00.000Z"),
      untilAt: new Date("2099-12-31T23:59:59.999Z"),
    });
  });

  test("rejects malformed, future, and reversed ranges", () => {
    const requests = [
      { endDate: "2026-08-29", startDate: "2026-08-30" },
      { endDate: "2026-08-30", startDate: "2026-08-29" },
      { endDate: "2026-02-30", startDate: "2026-02-01" },
    ];
    for (const request of requests) {
      expect(
        githubBackfillRequestFrom(
          {
            account: "f0rr0",
            repositoryId: "",
            ...request,
          },
          now
        )
      ).toBeNull();
    }
  });

  test("rejects unknown accounts and unsafe repository selectors", () => {
    expect(
      githubBackfillRequestFrom(
        {
          account: "octocat",
          endDate: "2026-08-29",
          repositoryId: "123",
          startDate: "2026-08-01",
        },
        now
      )
    ).toBeNull();
    expect(
      githubBackfillRequestFrom(
        {
          account: "f0rr0",
          endDate: "2026-08-29",
          repositoryId: "private/repository",
          startDate: "2026-08-01",
        },
        now
      )
    ).toBeNull();
  });
});
