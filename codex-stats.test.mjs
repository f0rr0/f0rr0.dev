import { describe, expect, test } from "bun:test";

import { activityIntensity } from "./src/components/codex-activity.tsx";
import {
  buildPublicCodexStats,
  createCodexAccountSnapshot,
  validateCodexAuthJson,
} from "./src/lib/codex/stats.ts";
import { fetchCodexAccountSnapshot } from "./src/lib/codex/sync.ts";

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
      most_used_reasoning_effort_percentage: 50,
      peak_daily_tokens: 50,
      total_skills_used: 40,
      total_threads: 10,
      top_invocations: [
        {
          plugin_id: "must-not-survive",
          plugin_name: "github",
          skill_name: null,
          type: "plugin",
          usage_count: 10,
        },
      ],
      unique_skills_used: 20,
      ...stats,
    },
  };
};

const usage = (usedPercent = 25) => ({
  internal: "must-not-survive",
  plan_type: "pro",
  rate_limit: {
    primary_window: {
      limit_window_seconds: 18_000,
      used_percent: usedPercent,
    },
  },
});

const requireStats = (stats) => {
  if (stats === null) {
    throw new Error("Expected public Codex statistics.");
  }
  return stats;
};

describe("public Codex statistics", () => {
  test("whitelists upstream data and combines accounts", () => {
    expect(activityIntensity(0, 1, 1000)).toBe(0);
    expect(activityIntensity(10, 1, 1000)).toBeCloseTo(1 / 3);
    expect(activityIntensity(1000, 1, 1000)).toBe(1);

    const first = createCodexAccountSnapshot(
      profile(80, [
        { start_date: "2026-01-29", tokens: 30 },
        { start_date: "2026-01-30", tokens: 50 },
      ]),
      usage()
    );
    const second = createCodexAccountSnapshot(
      profile(
        80,
        [
          { start_date: "2026-01-28", tokens: 10 },
          { start_date: "2026-01-30", tokens: 70 },
        ],
        {
          current_streak_days: 1,
          fast_mode_usage_percentage: 7,
          longest_streak_days: 1,
          most_used_reasoning_effort: "max",
          most_used_reasoning_effort_percentage: 40,
          peak_daily_tokens: 70,
          top_invocations: [
            {
              plugin_id: "different-id",
              plugin_name: "github",
              skill_name: null,
              type: "plugin",
              usage_count: 7,
            },
            {
              plugin_name: null,
              skill_name: "next-best-practices",
              type: "skill",
              usage_count: 9,
            },
          ],
          total_skills_used: 60,
          total_threads: 20,
          unique_skills_used: 12,
        }
      ),
      usage(75)
    );
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("must-not-survive");
    expect(serialized).not.toContain("internal");

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
      value: 160,
    });
    expect(stats.totals.todayTokens.value).toBe(120);
    expect(stats.totals.totalSkillsUsed).toEqual({
      partial: false,
      value: 100,
    });
    expect(stats.totals.totalThreads).toEqual({ partial: false, value: 30 });
    expect(stats.activity.daily.values).toHaveLength(364);
    expect(stats.activity.daily.partial).toBe(false);
    expect(stats.activity.daily.values[0]?.day).toBe("2025-02-02");
    expect(
      stats.activity.daily.values.find(({ day }) => day === "2026-01-30")
    ).toEqual({
      day: "2026-01-30",
      tokens: 120,
    });
    expect(stats.activity.daily.values.at(-1)).toEqual({
      day: "2026-01-31",
      tokens: 0,
    });
    expect(stats.activity.weekly.values[0]?.day).toBe("2025-02-02");
    expect(
      stats.activity.weekly.values.find(({ day }) => day === "2026-01-25")
    ).toEqual({
      day: "2026-01-25",
      tokens: 160,
    });
    expect(stats.activity.weekly.values).toHaveLength(364);
    expect(stats.activity.weekly.partial).toBe(false);
    expect(stats.activity.cumulative.values.at(-1)).toEqual({
      day: "2026-01-31",
      tokens: 160,
    });
    expect(stats.activity.cumulative.partial).toBe(false);
    expect(stats.busiestDay).toEqual({
      day: "2026-01-30",
      partial: false,
      tokens: 120,
    });
    expect(stats.highlights).toEqual({
      currentStreakDays: { partial: false, value: 3 },
      longestStreakDays: { partial: false, value: 3 },
      peakDailyTokens: { partial: false, value: 120 },
    });
    expect(stats.insights).toEqual({
      fastModeUsagePercent: { maximum: 8, minimum: 7, partial: false },
      reasoningEfforts: { partial: false, values: ["high", "max"] },
      reasoningEffortPercent: {
        maximum: 50,
        minimum: 40,
        partial: false,
      },
      skillsExplored: { maximum: 32, minimum: 20, partial: false },
      topTools: [
        {
          kind: "plugin",
          name: "github",
          partial: false,
          usageCount: 17,
        },
        {
          kind: "skill",
          name: "next-best-practices",
          partial: true,
          usageCount: 9,
        },
      ],
    });
    expect(stats.primaryLimit).toEqual({
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

    const empty = createCodexAccountSnapshot(profile(0, []), usage());
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
  });

  test("refreshes auth and retries the direct usage requests", async () => {
    const calls = [];
    const fetcher = async (url, init = {}) => {
      const headers = new Headers(init.headers);
      calls.push({
        accountId: headers.get("chatgpt-account-id"),
        authorization: headers.get("authorization"),
        body: init.body,
        url: String(url),
        userAgent: headers.get("user-agent"),
      });
      if (String(url).endsWith("/oauth/token")) {
        return Response.json({
          access_token: "new-access",
          id_token: "new-id",
          refresh_token: "new-refresh",
        });
      }
      if (headers.get("authorization") === "Bearer old-access") {
        return new Response(null, { status: 401 });
      }
      return Response.json(
        String(url).endsWith("/wham/usage")
          ? usage(40)
          : profile(10, [{ start_date: "2026-01-30", tokens: 10 }])
      );
    };
    const result = await fetchCodexAccountSnapshot(
      JSON.stringify({
        auth_mode: "chatgpt",
        last_refresh: "2026-01-01T00:00:00.000Z",
        tokens: {
          access_token: "old-access",
          account_id: "account-id",
          id_token: "old-id",
          refresh_token: "old-refresh",
        },
      }),
      fetcher,
      new Date("2026-01-30T12:00:00.000Z")
    );

    expect(calls.map(({ url }) => url)).toEqual([
      "https://chatgpt.com/backend-api/wham/usage",
      "https://chatgpt.com/backend-api/wham/profiles/me",
      "https://auth.openai.com/oauth/token",
      "https://chatgpt.com/backend-api/wham/usage",
      "https://chatgpt.com/backend-api/wham/profiles/me",
    ]);
    expect(calls.at(-1)?.authorization).toBe("Bearer new-access");
    expect(calls.at(-1)?.accountId).toBe("account-id");
    expect(calls.at(-1)?.userAgent).toBe("codex-cli/1.0.0");
    expect(String(calls[2]?.body)).toBe(
      "client_id=app_EMoamEEZ73f0CkXaXp7hrann&grant_type=refresh_token&refresh_token=old-refresh"
    );
    expect(JSON.parse(result.authJson)).toMatchObject({
      last_refresh: "2026-01-30T12:00:00.000Z",
      tokens: {
        access_token: "new-access",
        id_token: "new-id",
        refresh_token: "new-refresh",
      },
    });
    expect(result.snapshot.primaryLimit?.usedPercent).toBe(40);
  });
});
