import { z } from "zod";

import { tokenPreferences } from "@/content/tokens";
import type { TokenPreferences } from "@/content/tokens";

const count = z.number().int().nonnegative();
const name = z.string().trim().min(1).max(200);
const day = z.iso.date();
const totals = z.object({
  turns: count,
  uncached_text_input_tokens: count.nullish(),
  cached_text_input_tokens: count.nullish(),
  text_output_tokens: count.nullish(),
});

export const analyticsSchemas = {
  delegation: z.object({
    units: z.string(),
    data: z.array(
      z.object({
        date: day,
        product_surface_usage_values: z.record(
          z.string(),
          z.number().nonnegative()
        ),
        attribution: z
          .array(
            z.object({
              thread_source: name.nullish(),
              value: z.number().nonnegative(),
            })
          )
          .nullish(),
      })
    ),
  }),
  activity: z.object({
    data: z.array(
      z.object({
        date: day,
        totals,
        models: z
          .array(z.object({ model: name, turns: count.nullish() }))
          .nullish(),
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
            display_name: name.nullish(),
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
            display_name: name.nullish(),
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
    historyDays?: number;
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
  delegation: "/usage/daily-token-usage-breakdown",
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
  const historyDays = Math.max(
    30,
    Math.min(365, Math.floor(preferences.historyDays))
  );
  const historyStart = utcOffset(end, 1 - historyDays);
  const enabled: Record<AnalyticsKey, boolean> = {
    delegation: preferences.sections.delegation,
    activity:
      preferences.sections.activity ||
      preferences.sections.models ||
      preferences.sections.composition,
    plugins: preferences.sections.tools,
    skills: preferences.sections.tools,
  };
  const updateSource = (
    key: AnalyticsKey,
    response: z.infer<Sources[AnalyticsKey]>,
    start: string
  ) => {
    const retained = previous[key];
    const unitsChanged =
      "units" in response &&
      retained !== undefined &&
      "units" in retained.response &&
      response.units !== retained.response.units;
    // Replace refreshed dates, retain older history, and bound snapshot size.
    const data = new Map(
      (unitsChanged ? [] : (retained?.response.data ?? []))
        .filter((row) => row.date >= historyStart && row.date < start)
        .map((row) => [row.date, row])
    );
    for (const row of response.data) {
      if (row.date >= start && row.date <= end) {
        data.set(row.date, row);
      }
    }
    return [
      key,
      {
        historyDays:
          unitsChanged && start > historyStart ? undefined : historyDays,
        fetchedAt: now.toISOString(),
        start: unitsChanged
          ? start
          : retained?.historyDays === historyDays
            ? retained.start > historyStart
              ? retained.start
              : historyStart
            : historyStart,
        end,
        response: {
          ...response,
          data: [...data.values()].toSorted((a, b) =>
            a.date.localeCompare(b.date)
          ),
        },
      },
    ];
  };
  const entries = await Promise.all(
    (Object.keys(endpoints) as AnalyticsKey[]).map(async (key) => {
      if (!enabled[key]) {
        return [key, undefined];
      }
      const retained = previous[key];
      const refreshStart =
        retained?.historyDays === historyDays
          ? [utcOffset(end, -29), utcOffset(retained.end, 1)].toSorted()[0]
          : historyStart;
      const start = refreshStart < historyStart ? historyStart : refreshStart;
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        group_by: "day",
      });
      if (key !== "delegation") {
        params.set("workspace_user", "true");
      }
      if (key === "plugins") {
        params.set("top_plugin_limit", "100");
      }
      if (key === "skills") {
        params.set("top_skill_limit", "100");
      }
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
        return updateSource(key, response, start);
      } catch {
        // Keep the original coverage and timestamp when an optional source fails.
        return [key, previous[key]];
      }
    })
  );
  return Object.fromEntries(entries);
}

export interface TokenRow {
  name?: string;
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

function summarizeActivity(activity: z.infer<Sources["activity"]>["data"]) {
  const sums = { turns: 0, input: 0, cached: 0, output: 0 };
  let tokenRows = 0;
  const models = new Map<string, number>();
  for (const row of activity) {
    sums.turns += row.totals.turns;
    const {
      uncached_text_input_tokens: input,
      cached_text_input_tokens: cached,
      text_output_tokens: output,
    } = row.totals;
    // Use the same reported days for token totals, composition, and cache rate.
    if (
      typeof input === "number" &&
      typeof cached === "number" &&
      typeof output === "number"
    ) {
      sums.input += input;
      sums.cached += cached;
      sums.output += output;
      tokenRows += 1;
    }
    for (const model of row.models ?? []) {
      if (model.turns !== null && model.turns !== undefined) {
        add(models, model.model, model.turns);
      }
    }
  }
  return { sums, tokenRows, models };
}

const delegationGroups = (
  accounts: readonly (AnalyticsSnapshot | undefined)[],
  accountPlans: readonly (string | null | undefined)[]
) => {
  const units = accounts[0]?.delegation?.response.units;
  const matchingUnits = accounts.every(
    (account) => account?.delegation?.response.units === units
  );
  const matchingPlans =
    (accountPlans[0] ?? "") !== "" &&
    accounts.every((_, index) => accountPlans[index] === accountPlans[0]);
  const combineDelegation =
    matchingUnits &&
    (units === "credits" || (units === "percent" && matchingPlans));
  const accountIndices = accounts.map((_, index) => index);
  return combineDelegation
    ? [accountIndices]
    : accountIndices.map((index) => [index]);
};

export function buildTokenDetails(
  accounts: readonly (AnalyticsSnapshot | undefined)[],
  days: number,
  now = new Date(),
  preferences: TokenPreferences = tokenPreferences,
  accountLabels: readonly string[] = [],
  accountPlans: readonly (string | null | undefined)[] = []
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
      firstDay: dates[0] ?? null,
    };
  };
  const activity = accounts.flatMap(
    (account) =>
      account?.activity?.response.data.filter((row) => inRange(row.date)) ?? []
  );
  const { sums, tokenRows, models } = summarizeActivity(activity);
  const tools = (key: "plugins" | "skills") => {
    const labels = new Map<string, string>();
    const values = new Map<string, number>();
    for (const account of accounts) {
      if (key === "plugins") {
        for (const row of account?.plugins?.response.data ?? []) {
          if (inRange(row.date)) {
            for (const tool of row.plugin_usage_overviews) {
              if (!preferences.excludedTools.includes(tool.plugin_name)) {
                add(values, tool.plugin_name, tool.invocation_counts);
                if (typeof tool.display_name === "string") {
                  labels.set(tool.plugin_name, tool.display_name);
                }
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
                if (typeof tool.display_name === "string") {
                  labels.set(tool.skill_name, tool.display_name);
                }
              }
            }
          }
        }
      }
    }
    return {
      total: [...values.values()].reduce((sum, value) => sum + value, 0),
      distinct: [...values].filter(
        ([label, value]) =>
          value > 0 && !["other", "unknown"].includes(label.toLowerCase())
      ).length,
      rows: ranked(values)
        .filter((row) => row.value > 0)
        .map((row) => ({
          ...row,
          name: row.label,
          label: labels.get(row.label) ?? row.label,
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
    delegation: preferences.sections.delegation
      ? {
          accounts: delegationGroups(accounts, accountPlans).flatMap(
            (indices) => {
              const source = accounts[indices[0]]?.delegation;
              if (
                !source ||
                !["percent", "credits"].includes(source.response.units)
              ) {
                return [];
              }
              const values = new Map<string, number>();
              const rows = indices.flatMap(
                (index) => accounts[index]?.delegation?.response.data ?? []
              );
              for (const row of rows.filter((row) => inRange(row.date))) {
                if (row.attribution === null || row.attribution === undefined) {
                  add(
                    values,
                    "Other activity",
                    Object.values(row.product_surface_usage_values).reduce(
                      (sum, value) => sum + value,
                      0
                    )
                  );
                } else {
                  for (const entry of row.attribution) {
                    const label =
                      entry.thread_source === "user"
                        ? "Tasks"
                        : entry.thread_source === "subagent"
                          ? "Subagents"
                          : "Other activity";
                    add(values, label, entry.value);
                  }
                }
              }
              const total = [...values.values()].reduce(
                (sum, value) => sum + value,
                0
              );
              return total > 0
                ? [
                    {
                      label:
                        indices.length > 1
                          ? ""
                          : (accountLabels[indices[0]] ??
                            `Account ${indices[0] + 1}`),
                      rows: ["Tasks", "Subagents", "Other activity"]
                        .filter((label) => (values.get(label) ?? 0) > 0)
                        .map((label) => ({
                          label,
                          value: ((values.get(label) ?? 0) / total) * 100,
                        })),
                    },
                  ]
                : [];
            }
          ),
          status: status("delegation"),
        }
      : null,
    activity:
      preferences.sections.activity || preferences.sections.composition
        ? {
            status: {
              ...status("activity"),
              partial:
                status("activity").partial || tokenRows < activity.length,
            },
            turns:
              preferences.sections.activity && activity.length
                ? sums.turns
                : null,
            tokens:
              preferences.sections.activity && tokenRows
                ? sums.input + sums.cached + sums.output
                : null,
            composition:
              preferences.sections.composition && tokenRows
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
      ? {
          rows: ranked(models).filter((row) => row.value > 0),
          status: {
            ...status("activity"),
            partial:
              status("activity").partial ||
              [...models.values()].reduce((sum, value) => sum + value, 0) !==
                sums.turns,
          },
        }
      : null,
    plugins: preferences.sections.tools ? tools("plugins") : null,
    skills: preferences.sections.tools ? tools("skills") : null,
  };
}

export type TokenDetails = ReturnType<typeof buildTokenDetails>;
export type SourceStatus = NonNullable<TokenDetails["activity"]>["status"];
