import { z } from "zod";

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const safeInteger = z.number().int().nonnegative();
const nullableSafeInteger = safeInteger.nullable();
const nullablePercent = z.number().min(0).max(100).nullable();

const validUtcDay = (value: string) => {
  if (!UTC_DAY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const usageBucketsSchema = z
  .array(
    z.object({
      start_date: z.string().refine(validUtcDay),
      tokens: safeInteger,
    })
  )
  .nullish();

const profileResponseSchema = z.object({
  stats: z.object({
    cumulative_daily_usage_buckets: usageBucketsSchema,
    current_streak_days: nullableSafeInteger.optional(),
    daily_usage_buckets: usageBucketsSchema,
    fast_mode_usage_percentage: nullablePercent.optional(),
    lifetime_tokens: nullableSafeInteger.optional(),
    longest_running_turn_sec: nullableSafeInteger.optional(),
    longest_streak_days: nullableSafeInteger.optional(),
    most_used_reasoning_effort: z.string().max(80).nullable().optional(),
    peak_daily_tokens: nullableSafeInteger.optional(),
    total_skills_used: nullableSafeInteger.optional(),
    total_threads: nullableSafeInteger.optional(),
    unique_skills_used: nullableSafeInteger.optional(),
    weekly_usage_buckets: usageBucketsSchema,
  }),
});

const rateLimitWindowSchema = z.object({
  resetsAt: nullableSafeInteger,
  usedPercent: z.number().nonnegative(),
  windowDurationMins: nullableSafeInteger,
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
  windowDurationMins: number | null;
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
  cumulativeDailyUsageBuckets: readonly CodexUsageBucket[] | null;
  dailyUsageBuckets: readonly CodexUsageBucket[] | null;
  limits: readonly CodexRateLimit[];
  summary: {
    currentStreakDays: number | null;
    fastModeUsagePercent: number | null;
    lifetimeTokens: number | null;
    longestRunningTurnSec: number | null;
    longestStreakDays: number | null;
    mostUsedReasoningEffort: string | null;
    peakDailyTokens: number | null;
    totalSkillsUsed: number | null;
    totalThreads: number | null;
    uniqueSkillsUsed: number | null;
  };
  weeklyUsageBuckets: readonly CodexUsageBucket[] | null;
}

export interface CodexUsageBucket {
  startDate: string;
  tokens: number;
}

export interface PublicCodexMetric {
  partial: boolean;
  value: number | null;
}

export interface PublicCodexRange {
  maximum: number | null;
  minimum: number | null;
  partial: boolean;
}

export interface PublicCodexSeries {
  partial: boolean;
  values: readonly { day: string; tokens: number }[];
}

export interface PublicCodexStats {
  activity: {
    cumulative: PublicCodexSeries;
    daily: PublicCodexSeries;
    weekly: PublicCodexSeries;
  };
  busiestDay: { day: string; partial: boolean; tokens: number } | null;
  highlights: {
    currentStreakDays: PublicCodexMetric;
    longestStreakDays: PublicCodexMetric;
    peakDailyTokens: PublicCodexMetric;
  };
  insights: {
    fastModeUsagePercent: PublicCodexRange;
    reasoningEfforts: { partial: boolean; values: readonly string[] };
    skillsExplored: PublicCodexRange;
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
        windowDurationMins: value.windowDurationMins,
      };

const sanitizeBuckets = (value: z.infer<typeof usageBucketsSchema>) =>
  value?.map((bucket) => ({
    startDate: bucket.start_date,
    tokens: bucket.tokens,
  })) ?? null;

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
    cumulativeDailyUsageBuckets: sanitizeBuckets(
      stats.cumulative_daily_usage_buckets
    ),
    dailyUsageBuckets: sanitizeBuckets(stats.daily_usage_buckets),
    limits: entries.map(([id, limit]) => ({
      id,
      name: limit.limitName,
      planType: limit.planType,
      primary: sanitizeWindow(limit.primary),
      secondary: sanitizeWindow(limit.secondary),
    })),
    summary: {
      currentStreakDays: stats.current_streak_days ?? null,
      fastModeUsagePercent: stats.fast_mode_usage_percentage ?? null,
      lifetimeTokens: stats.lifetime_tokens ?? null,
      longestRunningTurnSec: stats.longest_running_turn_sec ?? null,
      longestStreakDays: stats.longest_streak_days ?? null,
      mostUsedReasoningEffort: stats.most_used_reasoning_effort ?? null,
      peakDailyTokens: stats.peak_daily_tokens ?? null,
      totalSkillsUsed: stats.total_skills_used ?? null,
      totalThreads: stats.total_threads ?? null,
      uniqueSkillsUsed: stats.unique_skills_used ?? null,
    },
    weeklyUsageBuckets: sanitizeBuckets(stats.weekly_usage_buckets),
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

const minimum = (values: readonly number[]) => {
  let result = values[0] ?? 0;
  for (const value of values.slice(1)) {
    result = Math.min(result, value);
  }
  return result;
};

const range = (
  values: readonly (number | null)[],
  lower: (known: readonly number[]) => number,
  upper: (known: readonly number[]) => number
): PublicCodexRange => {
  const known = values.filter((value): value is number => value !== null);
  return {
    maximum: known.length === 0 ? null : upper(known),
    minimum: known.length === 0 ? null : lower(known),
    partial: known.length !== values.length,
  };
};

const utcDayOffset = (day: string, offset: number) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const utcWeekStart = (day: string) => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

const sumBuckets = (
  records: readonly CodexSnapshotRecord[],
  select: (snapshot: CodexAccountSnapshot) => readonly CodexUsageBucket[] | null
) => {
  const result = new Map<string, number>();
  for (const { snapshot } of records) {
    for (const bucket of select(snapshot) ?? []) {
      result.set(
        bucket.startDate,
        (result.get(bucket.startDate) ?? 0) + bucket.tokens
      );
    }
  }
  return result;
};

const streaks = (usage: ReadonlyMap<string, number>, today: string) => {
  const activeDays = [...usage]
    .filter(([, tokens]) => tokens > 0)
    .map(([day]) => day)
    .toSorted();
  let current = 0;
  let longest = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const day of activeDays) {
    const ordinal = Date.parse(`${day}T00:00:00.000Z`) / 86_400_000;
    current = ordinal === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = ordinal;
  }
  const lastActiveDay = activeDays.at(-1);
  return {
    current:
      lastActiveDay === today || lastActiveDay === utcDayOffset(today, -1)
        ? current
        : 0,
    longest,
  };
};

const cumulativeSeries = (
  records: readonly CodexSnapshotRecord[],
  days: readonly string[]
) => {
  const result = days.map((day) => ({ day, tokens: 0 }));
  for (const { snapshot } of records) {
    const buckets = [...(snapshot.cumulativeDailyUsageBuckets ?? [])].toSorted(
      (left, right) => left.startDate.localeCompare(right.startDate)
    );
    let bucketIndex = 0;
    let accountTotal = 0;
    for (const point of result) {
      while (
        buckets[bucketIndex] !== undefined &&
        buckets[bucketIndex].startDate <= point.day
      ) {
        accountTotal = buckets[bucketIndex].tokens;
        bucketIndex += 1;
      }
      point.tokens += accountTotal;
    }
  }
  return result;
};

const mainPrimaryLimit = (
  records: readonly CodexSnapshotRecord[],
  expectedAccountCount: number
): PublicCodexStats["primaryLimit"] => {
  const limits: {
    planType: string | null;
    usedPercent: number;
    windowDurationMins: number | null;
  }[] = [];
  for (const { snapshot } of records) {
    const limit = snapshot.limits.find(
      (candidate) => candidate.id === "codex" && candidate.primary !== null
    );
    if (limit?.primary !== null && limit?.primary !== undefined) {
      limits.push({
        planType: limit.planType,
        usedPercent: limit.primary.usedPercent,
        windowDurationMins: limit.primary.windowDurationMins,
      });
    }
  }
  const planTypes = new Set(limits.map((limit) => limit.planType));
  const windowDurations = new Set(
    limits.map((limit) => limit.windowDurationMins)
  );
  if (
    limits.length !== expectedAccountCount ||
    planTypes.size !== 1 ||
    windowDurations.size !== 1
  ) {
    return null;
  }
  return {
    planType: limits[0]?.planType ?? null,
    usedPercent: sum(limits.map((limit) => limit.usedPercent)) / limits.length,
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
  const weeklyPartial =
    records.some(({ snapshot }) => snapshot.weeklyUsageBuckets === null) ||
    missingAccountCount > 0;
  const cumulativePartial =
    records.some(
      ({ snapshot }) => snapshot.cumulativeDailyUsageBuckets === null
    ) || missingAccountCount > 0;
  const hasKnownDaily = records.some(
    ({ snapshot }) => snapshot.dailyUsageBuckets !== null
  );
  const combinedDaily = sumBuckets(
    records,
    (snapshot) => snapshot.dailyUsageBuckets
  );
  const combinedWeekly = sumBuckets(
    records,
    (snapshot) => snapshot.weeklyUsageBuckets
  );
  const dailyHistoryComplete =
    !dailyPartial &&
    records.every(({ snapshot }) => {
      const lifetime = snapshot.summary.lifetimeTokens;
      return (
        lifetime !== null &&
        sum(
          (snapshot.dailyUsageBuckets ?? []).map((bucket) => bucket.tokens)
        ) === lifetime
      );
    });

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

  const combinedStreaks = streaks(combinedDaily, today);
  const fusedMetric = (
    observed: number,
    reported: readonly (number | null)[]
  ): PublicCodexMetric => {
    if (dailyHistoryComplete) {
      return { partial: false, value: observed };
    }
    const knownReported = reported.filter(
      (value): value is number => value !== null
    );
    return {
      partial: true,
      value:
        hasKnownDaily || knownReported.length > 0
          ? Math.max(observed, ...knownReported)
          : null,
    };
  };
  const dailyUsage = Array.from({ length: 365 }, (_, index) => {
    const day = utcDayOffset(today, index - 364);
    return { day, tokens: combinedDaily.get(day) ?? 0 };
  });
  const weeklyUsage = dailyUsage.map(({ day }) => ({
    day,
    tokens: combinedWeekly.get(utcWeekStart(day)) ?? 0,
  }));
  const cumulativeUsage = cumulativeSeries(
    records,
    dailyUsage.map(({ day }) => day)
  );
  const fastModeValues = [
    ...records.map(({ snapshot }) => snapshot.summary.fastModeUsagePercent),
    ...missingValues,
  ];
  const skillsExploredValues = [
    ...records.map(({ snapshot }) => snapshot.summary.uniqueSkillsUsed),
    ...missingValues,
  ];
  const reasoningValues = [
    ...records.map(({ snapshot }) => snapshot.summary.mostUsedReasoningEffort),
    ...Array.from({ length: missingAccountCount }, () => null),
  ];

  return {
    activity: {
      cumulative: { partial: cumulativePartial, values: cumulativeUsage },
      daily: { partial: dailyPartial, values: dailyUsage },
      weekly: { partial: weeklyPartial, values: weeklyUsage },
    },
    busiestDay:
      busiest === undefined
        ? null
        : { day: busiest[0], partial: dailyPartial, tokens: busiest[1] },
    highlights: {
      currentStreakDays: fusedMetric(
        combinedStreaks.current,
        records.map(({ snapshot }) => snapshot.summary.currentStreakDays)
      ),
      longestStreakDays: fusedMetric(
        combinedStreaks.longest,
        records.map(({ snapshot }) => snapshot.summary.longestStreakDays)
      ),
      peakDailyTokens: fusedMetric(
        busiest?.[1] ?? 0,
        records.map(({ snapshot }) => snapshot.summary.peakDailyTokens)
      ),
    },
    insights: {
      fastModeUsagePercent: range(fastModeValues, minimum, maximum),
      reasoningEfforts: {
        partial: reasoningValues.some((value) => value === null),
        values: [
          ...new Set(
            reasoningValues.filter((value): value is string => value !== null)
          ),
        ].toSorted(),
      },
      skillsExplored: range(skillsExploredValues, maximum, sum),
    },
    primaryLimit: mainPrimaryLimit(records, expectedAccountCount),
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
