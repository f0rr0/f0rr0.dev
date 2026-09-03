import { describe, expect, test } from "bun:test";

import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
  createCodexProfileRequest,
  validateCodexAuthJson,
} from "./src/lib/codex/stats.ts";

const profile = (lifetimeTokens, dailyUsageBuckets, stats = {}) => ({
  metadata: { generated_at: "must-not-survive" },
  profile: { username: "must-not-survive" },
  stats: {
    current_streak_days: 3,
    daily_usage_buckets: dailyUsageBuckets,
    lifetime_tokens: lifetimeTokens,
    longest_running_turn_sec: 90,
    longest_streak_days: 8,
    peak_daily_tokens: 80,
    total_threads: 999,
    top_invocations: [{ plugin_name: "must-not-survive" }],
    ...stats,
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
      profile(100, [
        { start_date: "2026-01-29", tokens: 30 },
        { start_date: "2026-01-30", tokens: 50 },
      ]),
      limits
    );
    const second = createCodexAccountSnapshot(
      profile(200, [{ start_date: "2026-01-30", tokens: 70 }], {
        current_streak_days: 5,
        longest_streak_days: 7,
        peak_daily_tokens: 100,
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

    const empty = createCodexAccountSnapshot(profile(0, []), limits);
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
