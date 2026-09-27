import {
  analyticsSchemas,
  mergeAnalyticsSnapshots,
  utcOffset,
} from "@/lib/codex/analytics";
import type { AnalyticsKey, AnalyticsSnapshot } from "@/lib/codex/analytics";
import type { CodexAccountSnapshot } from "@/lib/codex/stats";

export type CodexUsageDay = Pick<
  CodexAccountSnapshot,
  "analytics" | "dailyUsageBuckets" | "cumulativeDailyUsageBuckets"
>;

const keys = Object.keys(analyticsSchemas) as AnalyticsKey[];

// Keep source envelopes (including units and freshness), and only explicit rows.
// Missing days are unknown; an explicit zero must survive exactly like a nonzero.
export const partitionCodexHistory = (snapshot: CodexUsageDay) => {
  const days = new Map<string, CodexUsageDay>();
  const at = (day: string) => {
    let value = days.get(day);
    if (!value) {
      value = {
        dailyUsageBuckets: null,
        cumulativeDailyUsageBuckets: null,
        analytics: {},
      };
      days.set(day, value);
    }
    return value;
  };
  for (const key of [
    "dailyUsageBuckets",
    "cumulativeDailyUsageBuckets",
  ] as const) {
    for (const row of snapshot[key] ?? []) {
      at(row.startDate)[key] = [row];
    }
  }
  for (const key of keys) {
    const source = snapshot.analytics?.[key];
    for (const row of source?.response.data ?? []) {
      const value = at(row.date);
      Object.assign((value.analytics ??= {}), {
        [key]: {
          ...source,
          start: row.date,
          end: row.date,
          response: { ...source?.response, data: [row] },
        },
      });
    }
  }
  for (const source of snapshot.analytics?.archivedDelegation ?? []) {
    for (const row of source.response.data) {
      const value = at(row.date);
      value.analytics ??= {};
      const { analytics } = value;
      (analytics.archivedDelegation ??= []).push({
        ...source,
        start: row.date,
        end: row.date,
        response: { ...source.response, data: [row] },
      });
    }
  }
  return days;
};

export const mergeCodexDay = (
  previous: CodexUsageDay | undefined,
  incoming: CodexUsageDay
): CodexUsageDay => ({
  dailyUsageBuckets:
    incoming.dailyUsageBuckets ?? previous?.dailyUsageBuckets ?? null,
  cumulativeDailyUsageBuckets:
    incoming.cumulativeDailyUsageBuckets ??
    previous?.cumulativeDailyUsageBuckets ??
    null,
  analytics: mergeAnalyticsSnapshots(
    previous?.analytics ?? {},
    incoming.analytics ?? {}
  ),
});

export const liveCodexSnapshot = (
  snapshot: CodexAccountSnapshot
): CodexAccountSnapshot => ({
  ...snapshot,
  dailyUsageBuckets: null,
  cumulativeDailyUsageBuckets: null,
  analytics: { pluginLogos: snapshot.analytics?.pluginLogos },
});

export const restoreCodexHistory = (
  live: CodexAccountSnapshot,
  days: readonly CodexUsageDay[]
): CodexAccountSnapshot => {
  let analytics: AnalyticsSnapshot = {};
  for (const day of days) {
    analytics = mergeAnalyticsSnapshots(analytics, day.analytics ?? {});
  }
  return {
    ...live,
    analytics: { ...analytics, pluginLogos: live.analytics?.pluginLogos },
    dailyUsageBuckets: days.some((day) => day.dailyUsageBuckets !== null)
      ? days
          .flatMap((day) => day.dailyUsageBuckets ?? [])
          .toSorted((a, b) => a.startDate.localeCompare(b.startDate))
      : null,
    cumulativeDailyUsageBuckets: days.some(
      (day) => day.cumulativeDailyUsageBuckets !== null
    )
      ? days
          .flatMap((day) => day.cumulativeDailyUsageBuckets ?? [])
          .toSorted((a, b) => a.startDate.localeCompare(b.startDate))
      : null,
  };
};

export const mutableCodexStart = (now: Date) =>
  utcOffset(now.toISOString().slice(0, 10), -1);
