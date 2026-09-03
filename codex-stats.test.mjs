import { describe, expect, test } from "bun:test";

import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
  createCodexProfileRequest,
  validateCodexAuthJson,
} from "./src/lib/codex/stats.ts";

const profile = (lifetimeTokens, dailyUsageBuckets, stats = {}) => {
  let cumulativeTokens = 0;
  return {
    metadata: { generated_at: "must-not-survive" },
    profile: { username: "must-not-survive" },
    stats: {
      cumulative_daily_usage_buckets: dailyUsageBuckets?.map((bucket) => ({
        ...bucket,
        tokens: (cumulativeTokens += bucket.tokens),
      })),
      current_streak_days: 2,
      daily_usage_buckets: dailyUsageBuckets,
      fast_mode_usage_percentage: 8,
      lifetime_tokens: lifetimeTokens,
      longest_running_turn_sec: 90,
      longest_streak_days: 2,
      most_used_reasoning_effort: "high",
      peak_daily_tokens: 50,
      total_skills_used: 40,
      total_threads: 10,
      top_invocations: [{ plugin_name: "must-not-survive" }],
      unique_skills_used: 20,
      weekly_usage_buckets: [
        { start_date: "2026-01-26", tokens: lifetimeTokens },
      ],
      ...stats,
    },
  };
};

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

const requireStats = (stats) => {
  if (stats === null) {
    throw new Error("Expected public Codex statistics.");
  }
  return stats;
};

describe("public Codex statistics", () => {
  test("whitelists upstream data and combines accounts", () => {
    const first = createCodexAccountSnapshot(
      profile(80, [
        { start_date: "2026-01-29", tokens: 30 },
        { start_date: "2026-01-30", tokens: 50 },
      ]),
      limits
    );
    const second = createCodexAccountSnapshot(
      profile(70, [{ start_date: "2026-01-30", tokens: 70 }], {
        current_streak_days: 1,
        fast_mode_usage_percentage: 7,
        longest_streak_days: 1,
        most_used_reasoning_effort: "max",
        peak_daily_tokens: 70,
        total_skills_used: 60,
        total_threads: 20,
        unique_skills_used: 12,
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

    const stats = requireStats(
      buildPublicCodexStats(
        [
          {
            snapshot: first,
          },
          {
            snapshot: second,
          },
        ],
        new Date("2026-01-30T12:00:00Z")
      )
    );
    expect(stats.totals.lifetimeTokens).toEqual({
      partial: false,
      value: 150,
    });
    expect(stats.totals.todayTokens.value).toBe(120);
    expect(stats.totals.totalSkillsUsed).toEqual({
      partial: false,
      value: 100,
    });
    expect(stats.totals.totalThreads).toEqual({ partial: false, value: 30 });
    expect(stats.activity.daily.values).toHaveLength(365);
    expect(stats.activity.daily.partial).toBe(false);
    expect(stats.activity.daily.values.at(-1)).toEqual({
      day: "2026-01-30",
      tokens: 120,
    });
    expect(stats.activity.weekly.values.at(-1)).toEqual({
      day: "2026-01-30",
      tokens: 150,
    });
    expect(stats.activity.weekly.values).toHaveLength(365);
    expect(stats.activity.weekly.partial).toBe(false);
    expect(stats.activity.cumulative.values.at(-1)).toEqual({
      day: "2026-01-30",
      tokens: 150,
    });
    expect(stats.activity.cumulative.partial).toBe(false);
    expect(stats.busiestDay).toEqual({
      day: "2026-01-30",
      partial: false,
      tokens: 120,
    });
    expect(stats.highlights).toEqual({
      currentStreakDays: { partial: false, value: 2 },
      longestStreakDays: { partial: false, value: 2 },
      peakDailyTokens: { partial: false, value: 120 },
    });
    expect(stats.insights).toEqual({
      fastModeUsagePercent: { maximum: 8, minimum: 7, partial: false },
      reasoningEfforts: { partial: false, values: ["high", "max"] },
      skillsExplored: { maximum: 32, minimum: 20, partial: false },
    });
    expect(stats.primaryLimit).toEqual({
      planType: "pro",
      usedPercent: 50,
    });
    expect(JSON.stringify(stats)).not.toContain("Spark");

    const partial = requireStats(
      buildPublicCodexStats(
        [
          {
            snapshot: first,
          },
        ],
        new Date("2026-01-30T12:00:00Z"),
        2
      )
    );
    expect(partial.totals.lifetimeTokens.partial).toBe(true);
    expect(partial.highlights.currentStreakDays.partial).toBe(true);
    expect(partial.primaryLimit).toBeNull();

    expect(
      requireStats(
        buildPublicCodexStats(
          [{ snapshot: first }],
          new Date("2026-02-02T12:00:00Z")
        )
      ).highlights.currentStreakDays.value
    ).toBe(0);

    const empty = createCodexAccountSnapshot(profile(0, []), limits);
    expect(
      requireStats(
        buildPublicCodexStats(
          [
            {
              snapshot: empty,
            },
          ],
          new Date("2026-01-30T12:00:00Z")
        )
      ).totals.todayTokens.value
    ).toBe(0);

    expect(() => {
      validateCodexAuthJson('{"OPENAI_API_KEY":"secret"}');
    }).toThrow();

    const request = createCodexProfileRequest(
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: {
          access_token: "access-token",
          account_id: "account-id",
          refresh_token: "refresh-token",
        },
      }),
      "codex-user-agent"
    );
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://chatgpt.com/backend-api/wham/profiles/me"
    );
    expect(Object.fromEntries(request.headers)).toEqual({
      authorization: "Bearer access-token",
      "chatgpt-account-id": "account-id",
      "user-agent": "codex-user-agent",
    });
  });
});
