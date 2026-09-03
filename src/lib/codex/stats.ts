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

const profileResponseSchema = z.object({
  stats: z.object({
    current_streak_days: nullableSafeInteger.optional(),
    daily_usage_buckets: z
      .array(
        z.object({
          start_date: z.string().refine(validUtcDay),
          tokens: safeInteger,
        })
      )
      .nullish(),
    lifetime_tokens: nullableSafeInteger.optional(),
    longest_running_turn_sec: nullableSafeInteger.optional(),
    longest_streak_days: nullableSafeInteger.optional(),
    peak_daily_tokens: nullableSafeInteger.optional(),
    total_skills_used: nullableSafeInteger.optional(),
    total_threads: nullableSafeInteger.optional(),
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
  tokens: z.object({
    access_token: z.string().min(1),
    account_id: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
});

const CODEX_PROFILE_URL = "https://chatgpt.com/backend-api/wham/profiles/me";

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
    totalSkillsUsed: number | null;
    totalThreads: number | null;
  };
}

export interface PublicCodexMetric {
  partial: boolean;
  value: number | null;
}

export interface PublicCodexStats {
  busiestDay: { day: string; partial: boolean; tokens: number } | null;
  dailyUsage: readonly { day: string; tokens: number }[];
  highlights: {
    currentStreakDays: PublicCodexMetric;
    longestStreakDays: PublicCodexMetric;
    peakDailyTokens: PublicCodexMetric;
  };
  primaryLimit: {
    planType: string | null;
    usedPercent: number;
  } | null;
  totals: {
    last30Days: PublicCodexMetric;
    last7Days: PublicCodexMetric;
    lifetimeTokens: PublicCodexMetric;
    longestRunningTurnSec: PublicCodexMetric;
    totalSkillsUsed: PublicCodexMetric;
    totalThreads: PublicCodexMetric;
    todayTokens: PublicCodexMetric;
  };
}

export interface CodexSnapshotRecord {
  snapshot: CodexAccountSnapshot;
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
  rawProfile: unknown,
  rawRateLimits: unknown
): CodexAccountSnapshot => {
  const profile = profileResponseSchema.parse(rawProfile);
  const rateLimits = rateLimitsResponseSchema.parse(rawRateLimits);
  const { stats } = profile;
  const byId = rateLimits.rateLimitsByLimitId;
  const entries: [string, z.infer<typeof rateLimitSnapshotSchema>][] =
    byId !== null && Object.keys(byId).length > 0
      ? Object.entries(byId)
      : [[rateLimits.rateLimits.limitId ?? "default", rateLimits.rateLimits]];

  return {
    availableResetCredits:
      rateLimits.rateLimitResetCredits?.availableCount ?? null,
    dailyUsageBuckets:
      stats.daily_usage_buckets?.map((bucket) => ({
        startDate: bucket.start_date,
        tokens: bucket.tokens,
      })) ?? null,
    limits: entries.map(([id, limit]) => ({
      id,
      name: limit.limitName,
      planType: limit.planType,
      primary: sanitizeWindow(limit.primary),
      secondary: sanitizeWindow(limit.secondary),
    })),
    summary: {
      currentStreakDays: stats.current_streak_days ?? null,
      lifetimeTokens: stats.lifetime_tokens ?? null,
      longestRunningTurnSec: stats.longest_running_turn_sec ?? null,
      longestStreakDays: stats.longest_streak_days ?? null,
      peakDailyTokens: stats.peak_daily_tokens ?? null,
      totalSkillsUsed: stats.total_skills_used ?? null,
      totalThreads: stats.total_threads ?? null,
    },
  };
};

export const validateCodexAuthJson = (value: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new TypeError("Codex auth is not valid JSON.", { cause: error });
  }
  const result = authJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new TypeError("Codex auth must contain managed ChatGPT credentials.");
  }
  return {
    accessToken: result.data.tokens.access_token,
    accountId: result.data.tokens.account_id,
  };
};

export const createCodexProfileRequest = (
  authJson: string,
  userAgent: string
) => {
  const { accessToken, accountId } = validateCodexAuthJson(authJson);
  return new Request(CODEX_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "ChatGPT-Account-Id": accountId,
      "User-Agent": userAgent,
    },
    method: "GET",
  });
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

const mainPrimaryLimit = (
  records: readonly CodexSnapshotRecord[]
): PublicCodexStats["primaryLimit"] => {
  let count = 0;
  let planType: string | null = null;
  let usedPercent = 0;
  for (const { snapshot } of records) {
    for (const limit of snapshot.limits) {
      if (limit.id !== "codex" || limit.primary === null) {
        continue;
      }
      count += 1;
      planType ??= limit.planType;
      usedPercent += limit.primary.usedPercent;
    }
  }
  return count === 0
    ? null
    : {
        planType,
        usedPercent: usedPercent / count,
      };
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
    busiestDay:
      busiest === undefined
        ? null
        : { day: busiest[0], partial: dailyPartial, tokens: busiest[1] },
    dailyUsage: Array.from({ length: 365 }, (_, index) => {
      const day = utcDayOffset(today, index - 364);
      return { day, tokens: combinedDaily.get(day) ?? 0 };
    }),
    highlights: {
      currentStreakDays: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.currentStreakDays),
          ...missingValues,
        ],
        maximum
      ),
      longestStreakDays: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.longestStreakDays),
          ...missingValues,
        ],
        maximum
      ),
      peakDailyTokens: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.peakDailyTokens),
          ...missingValues,
        ],
        maximum
      ),
    },
    primaryLimit: mainPrimaryLimit(records),
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
      totalSkillsUsed: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.totalSkillsUsed),
          ...missingValues,
        ],
        sum
      ),
      totalThreads: metric(
        [
          ...records.map(({ snapshot }) => snapshot.summary.totalThreads),
          ...missingValues,
        ],
        sum
      ),
      todayTokens: {
        partial: dailyPartial,
        value: hasKnownDaily ? (combinedDaily.get(today) ?? 0) : null,
      },
    },
  };
};
