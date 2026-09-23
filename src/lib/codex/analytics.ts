import { z } from "zod";

import { tokenPreferences } from "@/content/tokens";
import type { TokenPreferences } from "@/content/tokens";

const count = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(200);
const day = z.iso.date();
const totals = z.object({
  turns: count,
  uncached_text_input_tokens: count,
  cached_text_input_tokens: count,
  text_output_tokens: count,
});

export const analyticsSchemas = {
  activity: z.object({
    data: z.array(
      z.object({
        date: day,
        totals,
        models: z.array(z.object({ model: name, turns: count })),
      })
    ),
  }),
  plugins: z.object({
    data_freshness_ts: z.iso.datetime({ offset: true }).nullish(),
    data: z.array(
      z.object({
        date: day,
        plugin_usage_overviews: z.array(
          z.object({
            plugin_name: name,
            invocation_counts: count,
          })
        ),
      })
    ),
  }),
  skills: z.object({
    data_freshness_ts: z.iso.datetime({ offset: true }).nullish(),
    data: z.array(
      z.object({
        date: day,
        skill_usage_overviews: z.array(
          z.object({
            skill_name: name,
            invocation_counts: count,
          })
        ),
      })
    ),
  }),
};

type Sources = typeof analyticsSchemas;
export type AnalyticsKey = keyof Sources;
export type AnalyticsSnapshot = {
  pluginLogos?: Record<string, { logoUrl: string; logoUrlDark?: string }>;
} & {
  [K in AnalyticsKey]?: {
    fetchedAt: string;
    start: string;
    end: string;
    response: z.infer<Sources[K]>;
  };
};

export const utcOffset = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const endpoints: Record<AnalyticsKey, string> = {
  activity: "/analytics/daily-workspace-usage-counts",
  plugins: "/analytics/daily-plugin-usage-metrics",
  skills: "/analytics/daily-skill-usage-metrics",
};

export async function fetchAnalytics(
  headers: HeadersInit,
  fetcher: typeof fetch,
  now: Date,
  previous: AnalyticsSnapshot = {},
  preferences = tokenPreferences
): Promise<AnalyticsSnapshot> {
  if (!preferences.enabled) {
    return {};
  }
  const end = now.toISOString().slice(0, 10);
  const start = utcOffset(end, -29);
  const enabled: Record<AnalyticsKey, boolean> = {
    activity:
      preferences.sections.activity ||
      preferences.sections.models ||
      preferences.sections.composition,
    plugins: preferences.sections.tools,
    skills: preferences.sections.tools,
  };
  const entries = await Promise.all(
    (Object.keys(endpoints) as AnalyticsKey[]).map(async (key) => {
      if (!enabled[key]) {
        return [key, undefined];
      }
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        group_by: "day",
      });
      params.set("workspace_user", "true");
      try {
        const result = await fetcher(
          `https://chatgpt.com/backend-api/wham${endpoints[key]}?${params}`,
          {
            headers,
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!result.ok) {
          throw new Error("Analytics unavailable");
        }
        const response = analyticsSchemas[key].parse(await result.json());
        return [key, { fetchedAt: now.toISOString(), start, end, response }];
      } catch {
        // Keep the original coverage and timestamp when an optional source fails.
        return [key, previous[key]];
      }
    })
  );
  return Object.fromEntries(entries);
}

export interface TokenRow {
  label: string;
  value: number;
  logoUrl?: string;
  logoUrlDark?: string;
}
const ranked = (values: Map<string, number>): TokenRow[] =>
  [...values]
    .map(([label, value]) => ({ label, value }))
    .toSorted((a, b) => b.value - a.value || a.label.localeCompare(b.label));
const add = (map: Map<string, number>, key: string, value: number) =>
  map.set(key, (map.get(key) ?? 0) + value);

const cacheHitRate = (input: number, cached: number) =>
  input + cached > 0 ? (cached / (input + cached)) * 100 : null;

export function buildTokenDetails(
  accounts: readonly (AnalyticsSnapshot | undefined)[],
  days: 7 | 30,
  now = new Date(),
  preferences: TokenPreferences = tokenPreferences
) {
  const end = now.toISOString().slice(0, 10);
  const start = utcOffset(end, 1 - days);
  const inRange = (date: string) => date >= start && date <= end;
  const sources = (key: AnalyticsKey) =>
    accounts.flatMap((account) => (account?.[key] ? [account[key]] : []));
  const status = (key: AnalyticsKey) => {
    const values = sources(key);
    const dates = values
      .flatMap((source) =>
        source.response.data
          .filter((row) => inRange(row.date))
          .map((row) => row.date)
      )
      .toSorted();
    return {
      available: values.length,
      accounts: accounts.length,
      partial:
        values.length !== accounts.length ||
        values.some((source) => source.start > start || source.end < end),
      fetchedAt: values.map((source) => source.fetchedAt).toSorted()[0] ?? null,
      latestDay: dates.at(-1) ?? null,
    };
  };
  const activity = accounts.flatMap(
    (account) =>
      account?.activity?.response.data.filter((row) => inRange(row.date)) ?? []
  );
  const sums = { turns: 0, input: 0, cached: 0, output: 0 };
  const models = new Map<string, number>();
  for (const row of activity) {
    sums.turns += row.totals.turns;
    sums.input += row.totals.uncached_text_input_tokens;
    sums.cached += row.totals.cached_text_input_tokens;
    sums.output += row.totals.text_output_tokens;
    for (const model of row.models) {
      add(models, model.model, model.turns);
    }
  }
  const tools = (key: "plugins" | "skills") => {
    const values = new Map<string, number>();
    for (const account of accounts) {
      if (key === "plugins") {
        for (const row of account?.plugins?.response.data ?? []) {
          if (inRange(row.date)) {
            for (const tool of row.plugin_usage_overviews) {
              if (!preferences.excludedTools.includes(tool.plugin_name)) {
                add(values, tool.plugin_name, tool.invocation_counts);
              }
            }
          }
        }
      } else {
        for (const row of account?.skills?.response.data ?? []) {
          if (inRange(row.date)) {
            for (const tool of row.skill_usage_overviews) {
              if (!preferences.excludedTools.includes(tool.skill_name)) {
                add(values, tool.skill_name, tool.invocation_counts);
              }
            }
          }
        }
      }
    }
    return {
      rows: ranked(values).map((row) => ({
        ...row,
        ...(key === "plugins"
          ? accounts.find((account) => account?.pluginLogos?.[row.label])
              ?.pluginLogos?.[row.label]
          : undefined),
      })),
      status: status(key),
    };
  };
  return {
    start,
    end,
    accountCount: accounts.length,
    activity:
      preferences.sections.activity || preferences.sections.composition
        ? {
            status: status("activity"),
            turns:
              preferences.sections.activity && activity.length
                ? sums.turns
                : null,
            tokens:
              preferences.sections.activity && activity.length
                ? sums.input + sums.cached + sums.output
                : null,
            composition:
              preferences.sections.composition && activity.length
                ? [
                    { label: "New input", value: sums.input },
                    { label: "Cached input", value: sums.cached },
                    { label: "Output", value: sums.output },
                  ]
                : null,
            cacheHit: preferences.sections.composition
              ? cacheHitRate(sums.input, sums.cached)
              : null,
          }
        : null,
    models: preferences.sections.models
      ? { rows: ranked(models), status: status("activity") }
      : null,
    plugins: preferences.sections.tools ? tools("plugins") : null,
    skills: preferences.sections.tools ? tools("skills") : null,
  };
}

export type TokenDetails = ReturnType<typeof buildTokenDetails>;
export type SourceStatus = NonNullable<TokenDetails["activity"]>["status"];
