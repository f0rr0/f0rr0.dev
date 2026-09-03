import { describe, expect, test } from "bun:test";

import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
  validateCodexAuthJson,
} from "./src/lib/codex/stats.ts";

const usage = (lifetimeTokens, dailyUsageBuckets) => ({
  accountId: "must-not-survive",
  dailyUsageBuckets,
  summary: {
    currentStreakDays: 3,
    lifetimeTokens,
    longestRunningTurnSec: 90,
    longestStreakDays: 8,
    peakDailyTokens: 80,
  },
});

const limits = {
  rateLimitResetCredits: { availableCount: 2, internalId: "private" },
  rateLimits: {
    limitId: "codex",
    limitName: "Codex",
    planType: "pro",
    primary: {
      resetsAt: 1_800_000_000,
      usedPercent: 25,
      windowDurationMins: 300,
    },
    secondary: null,
  },
  rateLimitsByLimitId: null,
  upsell: "must-not-survive",
};

describe("public Codex statistics", () => {
  test("whitelists upstream data and combines accounts", () => {
    const first = createCodexAccountSnapshot(
      usage(100, [
        { startDate: "2026-01-29", tokens: 30 },
        { startDate: "2026-01-30", tokens: 50 },
      ]),
      limits
    );
    const second = createCodexAccountSnapshot(
      usage(200, [{ startDate: "2026-01-30", tokens: 70 }]),
      limits
    );
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("must-not-survive");
    expect(serialized).not.toContain("private");
    expect(first.limits[0]?.name).toBe("Codex");

    const stats = buildPublicCodexStats(
      [
        {
          id: "one",
          label: "One",
          snapshot: first,
          snapshotAt: new Date("2026-01-30T11:50:00Z"),
        },
        {
          id: "two",
          label: "Two",
          snapshot: second,
          snapshotAt: new Date("2026-01-30T11:55:00Z"),
        },
      ],
      new Date("2026-01-30T12:00:00Z")
    );
    expect(stats?.totals.lifetimeTokens).toEqual({
      partial: false,
      value: 300,
    });
    expect(stats?.totals.todayTokens.value).toBe(120);
    expect(stats?.busiestDay).toEqual({
      day: "2026-01-30",
      partial: false,
      tokens: 120,
    });
    expect(stats?.accounts).toHaveLength(2);

    const partial = buildPublicCodexStats(
      [
        {
          id: "one",
          label: "One",
          snapshot: first,
          snapshotAt: new Date("2026-01-30T11:50:00Z"),
        },
      ],
      new Date("2026-01-30T12:00:00Z"),
      2
    );
    expect(partial?.accountCount).toBe(2);
    expect(partial?.totals.lifetimeTokens.partial).toBe(true);

    const empty = createCodexAccountSnapshot(usage(0, []), limits);
    expect(
      buildPublicCodexStats(
        [
          {
            id: "empty",
            label: "Empty",
            snapshot: empty,
            snapshotAt: new Date("2026-01-30T12:00:00Z"),
          },
        ],
        new Date("2026-01-30T12:00:00Z")
      )?.totals.todayTokens.value
    ).toBe(0);

    expect(() => {
      validateCodexAuthJson('{"OPENAI_API_KEY":"secret"}');
    }).toThrow();
  });
});
