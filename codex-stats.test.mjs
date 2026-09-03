import { describe, expect, test } from "bun:test";

import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
  validateCodexAuthJson,
} from "./src/lib/codex/stats.ts";

const usage = (lifetimeTokens, dailyUsageBuckets, summary = {}) => ({
  accountId: "must-not-survive",
  dailyUsageBuckets,
  summary: {
    currentStreakDays: 3,
    lifetimeTokens,
    longestRunningTurnSec: 90,
    longestStreakDays: 8,
    peakDailyTokens: 80,
    ...summary,
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
      usage(200, [{ startDate: "2026-01-30", tokens: 70 }], {
        currentStreakDays: 5,
        longestStreakDays: 7,
        peakDailyTokens: 100,
      }),
      {
        ...limits,
        rateLimitsByLimitId: {
          codex: {
            ...limits.rateLimits,
            primary: { ...limits.rateLimits.primary, usedPercent: 75 },
          },
          codex_bengalfox: {
            ...limits.rateLimits,
            limitId: "codex_bengalfox",
            limitName: "GPT-5.3-Codex-Spark",
            primary: { ...limits.rateLimits.primary, usedPercent: 99 },
          },
        },
      }
    );
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("must-not-survive");
    expect(serialized).not.toContain("private");
    expect(first.limits[0]?.name).toBe("Codex");

    const stats = buildPublicCodexStats(
      [
        {
          snapshot: first,
        },
        {
          snapshot: second,
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
    expect(stats?.highlights).toEqual({
      currentStreakDays: { partial: false, value: 5 },
      longestStreakDays: { partial: false, value: 8 },
      peakDailyTokens: { partial: false, value: 100 },
    });
    expect(stats?.primaryLimit).toEqual({
      planType: "pro",
      usedPercent: 50,
    });
    expect(JSON.stringify(stats)).not.toContain("Spark");

    const partial = buildPublicCodexStats(
      [
        {
          snapshot: first,
        },
      ],
      new Date("2026-01-30T12:00:00Z"),
      2
    );
    expect(partial?.totals.lifetimeTokens.partial).toBe(true);
    expect(partial?.highlights.currentStreakDays.partial).toBe(true);

    const empty = createCodexAccountSnapshot(usage(0, []), limits);
    expect(
      buildPublicCodexStats(
        [
          {
            snapshot: empty,
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
