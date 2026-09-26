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
  archivedDelegation?: NonNullable<AnalyticsSnapshot["delegation"]>[];
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

// Updated values replace matching records; omitted records and fields survive.
const mergeNamed = <T>(
  old: readonly T[] | null | undefined,
  next: readonly T[] | null | undefined,
  name: (row: T) => string
) => [
  ...new Map(
    [...(old ?? []), ...(next ?? [])].map((row) => [name(row), row])
  ).values(),
];

type AnalyticsDay = z.infer<Sources[AnalyticsKey]>["data"][number];
const mergeAnalyticsDay = (
  retained: AnalyticsDay | undefined,
  row: AnalyticsDay
): AnalyticsDay => {
  if (!retained) {
    return row;
  }
  let value = row;
  if ("totals" in retained && "totals" in row) {
    value = {
      ...row,
      totals: {
        turns: row.totals.turns,
        uncached_text_input_tokens:
          row.totals.uncached_text_input_tokens ??
          retained.totals.uncached_text_input_tokens,
        cached_text_input_tokens:
          row.totals.cached_text_input_tokens ??
          retained.totals.cached_text_input_tokens,
        text_output_tokens:
          row.totals.text_output_tokens ?? retained.totals.text_output_tokens,
      },
      models: mergeNamed(retained.models, row.models, (model) => model.model),
    };
  }
  if ("plugin_usage_overviews" in retained && "plugin_usage_overviews" in row) {
    value = {
      ...row,
      plugin_usage_overviews: mergeNamed(
        retained.plugin_usage_overviews,
        row.plugin_usage_overviews,
        (item) => item.plugin_name
      ),
    };
  }
  if ("skill_usage_overviews" in retained && "skill_usage_overviews" in row) {
    value = {
      ...row,
      skill_usage_overviews: mergeNamed(
        retained.skill_usage_overviews,
        row.skill_usage_overviews,
        (item) => item.skill_name
      ),
    };
  }
  if ("attribution" in retained && "attribution" in row) {
    value = {
      ...row,
      attribution: row.attribution ?? retained.attribution,
    };
  }
  return value;
};

export function mergeAnalyticsSnapshots(
  previous: AnalyticsSnapshot,
  incoming: AnalyticsSnapshot
): AnalyticsSnapshot {
  const merged = { ...previous, ...incoming };
  for (const key of Object.keys(analyticsSchemas) as AnalyticsKey[]) {
    const old = previous[key];
    const next = incoming[key];
    if (!old || !next) {
      continue;
    }
    if (
      key === "delegation" &&
      previous.delegation &&
      incoming.delegation &&
      previous.delegation.response.units !== incoming.delegation.response.units
    ) {
      const historical = incoming.delegation.end < previous.delegation.end;
      const archived = historical ? incoming.delegation : previous.delegation;
      merged.delegation = historical
        ? previous.delegation
        : incoming.delegation;
      const archives = new Map(
        (previous.archivedDelegation ?? []).map((source) => [
          source.response.units,
          source,
        ])
      );
      const combined = mergeAnalyticsSnapshots(
        { delegation: archives.get(archived.response.units) },
        { delegation: archived }
      ).delegation;
      if (combined) {
        archives.set(archived.response.units, combined);
      }
      merged.archivedDelegation = [...archives.values()];
      continue;
    }
    const rows = new Map(old.response.data.map((row) => [row.date, row]));
    for (const row of next.response.data) {
      const retained = rows.get(row.date);
      const value = mergeAnalyticsDay(retained, row);
      rows.set(row.date, value);
    }
    Object.assign(merged, {
      [key]: {
        ...next,
        start: old.start < next.start ? old.start : next.start,
        end: old.end > next.end ? old.end : next.end,
        response: {
          ...next.response,
          data: [...rows.values()].toSorted((a, b) =>
            a.date.localeCompare(b.date)
          ),
        },
      },
    });
  }
  merged.pluginLogos = { ...previous.pluginLogos, ...incoming.pluginLogos };
  return merged;
}

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
  preferences = tokenPreferences,
  range?: { start: string; end: string }
): Promise<AnalyticsSnapshot> {
  if (
    range &&
    (!day.safeParse(range.start).success ||
      !day.safeParse(range.end).success ||
      range.start > range.end ||
      range.end > now.toISOString().slice(0, 10))
  ) {
    throw new Error("Invalid analytics backfill range.");
  }
  if (!preferences.enabled && !range) {
    return {};
  }
  const end = range?.end ?? now.toISOString().slice(0, 10);
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
  const entries = await Promise.all(
    (Object.keys(endpoints) as AnalyticsKey[]).map(async (key) => {
      if (!enabled[key] && !range) {
        return [key, previous[key]];
      }
      const retained = previous[key];
      const refreshStart =
        retained?.historyDays === historyDays
          ? [utcOffset(end, -29), utcOffset(retained.end, 1)].toSorted()[0]
          : historyStart;
      const start =
        range?.start ??
        (refreshStart < historyStart ? historyStart : refreshStart);
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
        const unitsChanged =
          "units" in response &&
          retained !== undefined &&
          "units" in retained.response &&
          response.units !== retained.response.units;
        return [
          key,
          {
            historyDays:
              range || (unitsChanged && start > historyStart)
                ? undefined
                : historyDays,
            fetchedAt: now.toISOString(),
            start,
            end,
            response: {
              ...response,
              data: response.data
                .filter((row) => row.date >= start && row.date <= end)
                .toSorted((a, b) => a.date.localeCompare(b.date)),
            },
          },
        ];
      } catch {
        if (range) {
          throw new Error(
            `Codex ${key} backfill failed for ${start} through ${end}.`
          );
        }
        // Keep the original coverage and timestamp when an optional source fails.
        return [key, previous[key]];
      }
    })
  );
  return mergeAnalyticsSnapshots(previous, Object.fromEntries(entries));
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
