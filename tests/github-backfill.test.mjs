import { describe, expect, test } from "bun:test";

import { backfillArgumentsFrom } from "../scripts/backfill-github-activity.ts";
import {
  GITHUB_BACKFILL_WORKER_BATCH_SIZE,
  githubBackfillProcessingCountsFrom,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core.ts";

const now = new Date("2026-08-29T15:00:00.000Z");

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

  test("reports disjoint outcomes across every stage including PR reconciliation", () => {
    expect(
      githubBackfillProcessingCountsFrom({
        aliases: 7,
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
      claimed: 20,
      deferred: 5,
      failed: 3,
      processed: 9,
      unavailable: 2,
    });
  });

  test("normalizes one arbitrary inclusive UTC range", () => {
    const request = githubBackfillRequestFrom(
      {
        account: "all",
        endDate: "2026-08-29",
        repositoryId: "123456789",
        startDate: "2026-07-01",
      },
      now
    );

    expect(request).toMatchObject({
      accounts: ["f0rr0", "yuppiestechdev"],
      endDate: "2026-08-29",
      repositoryId: "123456789",
      startDate: "2026-07-01",
    });
    expect(request?.sinceAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
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

  test("accepts a range longer than 366 days without splitting it", () => {
    const request = githubBackfillRequestFrom(
      {
        account: "f0rr0",
        endDate: "2026-08-29",
        repositoryId: "",
        startDate: "2024-01-01",
      },
      now
    );

    expect(request).toMatchObject({
      endDate: "2026-08-29",
      startDate: "2024-01-01",
    });
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
