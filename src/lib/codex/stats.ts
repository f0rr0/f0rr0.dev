import { z } from "zod";

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const safeInteger = z.number().int().nonnegative();
const nullableSafeInteger = safeInteger.nullable();

const validUtcDay = (value: string) => {
  if (!UTC_DAY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const usageResponseSchema = z.object({
  dailyUsageBuckets: z
    .array(
      z.object({
        startDate: z.string().refine(validUtcDay),
        tokens: safeInteger,
      })
    )
    .nullable(),
  summary: z.object({
    currentStreakDays: nullableSafeInteger,
    lifetimeTokens: nullableSafeInteger,
    longestRunningTurnSec: nullableSafeInteger,
    longestStreakDays: nullableSafeInteger,
    peakDailyTokens: nullableSafeInteger,
  }),
});

const rateLimitWindowSchema = z.object({
  resetsAt: nullableSafeInteger,
  usedPercent: z.number().nonnegative(),
});

const rateLimitSnapshotSchema = z.object({
  limitId: z.string().max(80).nullable(),
  limitName: z.string().max(120).nullable(),
  planType: z.string().max(80).nullable(),
  primary: rateLimitWindowSchema.nullable(),
  secondary: rateLimitWindowSchema.nullable(),
});

const rateLimitsResponseSchema = z.object({
  rateLimitResetCredits: z.object({ availableCount: safeInteger }).nullable(),
  rateLimits: rateLimitSnapshotSchema,
  rateLimitsByLimitId: z.record(z.string(), rateLimitSnapshotSchema).nullable(),
});

const authJsonSchema = z.object({
  auth_mode: z.literal("chatgpt"),
  tokens: z.object({ refresh_token: z.string().min(1) }),
});

export interface CodexRateLimitWindow {
  resetsAt: number | null;
  usedPercent: number;
}

export interface CodexRateLimit {
  id: string;
  name: string | null;
  planType: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
}

export interface CodexAccountSnapshot {
  availableResetCredits: number | null;
  dailyUsageBuckets:
    | readonly {
        startDate: string;
        tokens: number;
      }[]
    | null;
  limits: readonly CodexRateLimit[];
  summary: {
    currentStreakDays: number | null;
    lifetimeTokens: number | null;
    longestRunningTurnSec: number | null;
    longestStreakDays: number | null;
    peakDailyTokens: number | null;
  };
}

export interface PublicCodexMetric {
  partial: boolean;
  value: number | null;
}

export interface PublicCodexStats {
  accountCount: number;
  accounts: readonly {
    id: string;
    label: string;
    snapshot: CodexAccountSnapshot;
    stale: boolean;
    updatedAt: string;
  }[];
  busiestDay: { day: string; partial: boolean; tokens: number } | null;
  dailyUsage: readonly { day: string; tokens: number }[];
  totals: {
    last30Days: PublicCodexMetric;
    last7Days: PublicCodexMetric;
    lifetimeTokens: PublicCodexMetric;
    longestRunningTurnSec: PublicCodexMetric;
    todayTokens: PublicCodexMetric;
  };
}

export interface CodexSnapshotRecord {
  id: string;
  label: string;
  snapshot: CodexAccountSnapshot;
  snapshotAt: Date;
}

const sanitizeWindow = (
  value: z.infer<typeof rateLimitWindowSchema> | null
): CodexRateLimitWindow | null =>
  value === null
    ? null
    : {
        resetsAt: value.resetsAt,
        usedPercent: value.usedPercent,
      };

export const createCodexAccountSnapshot = (
  rawUsage: unknown,
  rawRateLimits: unknown
): CodexAccountSnapshot => {
  const usage = usageResponseSchema.parse(rawUsage);
  const rateLimits = rateLimitsResponseSchema.parse(rawRateLimits);
  const byId = rateLimits.rateLimitsByLimitId;
  const entries: [string, z.infer<typeof rateLimitSnapshotSchema>][] =
    byId !== null && Object.keys(byId).length > 0
      ? Object.entries(byId)
      : [[rateLimits.rateLimits.limitId ?? "default", rateLimits.rateLimits]];

  return {
    availableResetCredits:
      rateLimits.rateLimitResetCredits?.availableCount ?? null,
    dailyUsageBuckets: usage.dailyUsageBuckets,
    limits: entries.map(([id, limit]) => ({
      id,
      name: limit.limitName,
      planType: limit.planType,
      primary: sanitizeWindow(limit.primary),
      secondary: sanitizeWindow(limit.secondary),
    })),
    summary: usage.summary,
  };
};

export const validateCodexAuthJson = (value: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new TypeError("Codex auth is not valid JSON.", { cause: error });
  }
  if (!authJsonSchema.safeParse(parsed).success) {
    throw new TypeError("Codex auth must contain managed ChatGPT credentials.");
  }
};

const metric = (
  values: readonly (number | null)[],
  combine: (known: readonly number[]) => number
): PublicCodexMetric => {
  const known = values.filter((value): value is number => value !== null);
  return {
    partial: known.length !== values.length,
    value: known.length === 0 ? null : combine(known),
  };
};

const sum = (values: readonly number[]) => {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
};

const maximum = (values: readonly number[]) => {
  let result = values[0] ?? 0;
  for (const value of values.slice(1)) {
    result = Math.max(result, value);
  }
  return result;
};

const utcDayOffset = (day: string, offset: number) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const buildPublicCodexStats = (
  records: readonly CodexSnapshotRecord[],
  now = new Date(),
  expectedAccountCount = records.length
): PublicCodexStats | null => {
  if (records.length === 0) {
    return null;
  }

  const today = now.toISOString().slice(0, 10);
  const missingAccountCount = Math.max(
    0,
    expectedAccountCount - records.length
  );
  const missingValues = Array.from({ length: missingAccountCount }, () => null);
  const dailyPartial =
    records.some(({ snapshot }) => snapshot.dailyUsageBuckets === null) ||
    missingAccountCount > 0;
  const hasKnownDaily = records.some(
    ({ snapshot }) => snapshot.dailyUsageBuckets !== null
  );
  const combinedDaily = new Map<string, number>();
  for (const { snapshot } of records) {
    for (const bucket of snapshot.dailyUsageBuckets ?? []) {
      combinedDaily.set(
        bucket.startDate,
        (combinedDaily.get(bucket.startDate) ?? 0) + bucket.tokens
      );
    }
  }

  const totalDays = (days: number): PublicCodexMetric => {
    if (!hasKnownDaily) {
      return { partial: dailyPartial, value: null };
    }
    let value = 0;
    for (let offset = 1 - days; offset <= 0; offset += 1) {
      value += combinedDaily.get(utcDayOffset(today, offset)) ?? 0;
    }
    return { partial: dailyPartial, value };
  };

  let busiest: [string, number] | undefined;
  for (const candidate of combinedDaily) {
    if (busiest === undefined || candidate[1] > busiest[1]) {
      busiest = candidate;
    }
  }

  return {
    accountCount: records.length + missingAccountCount,
    accounts: records
      .map(({ id, label, snapshot, snapshotAt }) => ({
        id,
        label,
        snapshot,
        stale: now.getTime() - snapshotAt.getTime() > 45 * 60 * 1000,
        updatedAt: snapshotAt.toISOString(),
      }))
      .toSorted((left, right) => left.label.localeCompare(right.label)),
    busiestDay:
      busiest === undefined
        ? null
        : { day: busiest[0], partial: dailyPartial, tokens: busiest[1] },
    dailyUsage: Array.from({ length: 30 }, (_, index) => {
      const day = utcDayOffset(today, index - 29);
      return { day, tokens: combinedDaily.get(day) ?? 0 };
    }),
    totals: {
      last30Days: totalDays(30),
      last7Days: totalDays(7),
      lifetimeTokens: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.lifetimeTokens),
          ...missingValues,
        ],
        sum
      ),
      longestRunningTurnSec: metric(
        [
          ...records.map(
            ({ snapshot }) => snapshot.summary.longestRunningTurnSec
          ),
          ...missingValues,
        ],
        maximum
      ),
      todayTokens: {
        partial: dailyPartial,
        value: hasKnownDaily ? (combinedDaily.get(today) ?? 0) : null,
      },
    },
  };
};
