import { randomUUID } from "node:crypto";

import {
  and,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  githubIssues,
  githubPublicFeedHead,
  githubRepositories,
  githubWorkUnitSummaryAttempts,
  githubWorkUnitSummaryDailyUsage,
  githubWorkUnits,
} from "@/db/schema";
import { PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE } from "@/lib/github-activity-store";
import { GITHUB_WORK_UNIT_SUMMARY_RECIPE } from "@/lib/github-work-unit-summary";
import type { GitHubWorkUnitSummaryAttributionMode } from "@/lib/github-work-unit-summary";
import type { GitHubWorkUnitSummaryProviderResult } from "@/lib/github-work-unit-summary-provider";

const SUMMARY_CLAIM_LOCK = "github-work-unit-summary-claim-v1";
const DEFAULT_LEASE_DURATION_MS = 90_000;
const MAXIMUM_LEASE_DURATION_MS = 15 * 60_000;
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60_000;
const MAXIMUM_STARTED_REQUESTS = 2;
const MAXIMUM_DAILY_STARTED_REQUESTS = 12;
const MAXIMUM_MONTHLY_STARTED_REQUESTS = 120;
const RESERVED_RECENT_REQUESTS_PER_FUTURE_DAY = 2;
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type SummaryTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export interface GitHubWorkUnitSummaryClaim {
  readonly attributionMode: GitHubWorkUnitSummaryAttributionMode;
  readonly leaseToken: string;
  readonly outcomeDigest: string;
  readonly revision: number;
  readonly serializedInput: string;
  readonly startedRequests: 1 | 2;
  readonly summaryInputDigest: string;
  readonly unitRevision: number;
  readonly workUnitId: string;
}

export interface GitHubWorkUnitSummaryClaimOptions {
  readonly leaseDurationMs?: number;
  readonly now?: Date;
}

export interface GitHubWorkUnitSummaryCompletionResult {
  readonly accepted: boolean;
}

export type GitHubWorkUnitSummaryDeferResult =
  | "deferred"
  | "stale"
  | "terminal";

const checkedDate = (value: Date, label: string) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`The GitHub work-unit summary ${label} is invalid.`);
  }
  return value;
};

const checkedLeaseDuration = (value: number | undefined) => {
  const duration = value ?? DEFAULT_LEASE_DURATION_MS;
  if (
    !Number.isSafeInteger(duration) ||
    duration < 1000 ||
    duration > MAXIMUM_LEASE_DURATION_MS
  ) {
    throw new RangeError(
      "The GitHub work-unit summary lease duration is invalid."
    );
  }
  return duration;
};

const checkedAttributionMode = (
  value: string
): GitHubWorkUnitSummaryAttributionMode => {
  if (
    value !== "branch_owned_composite" &&
    value !== "canonical_owned_composite" &&
    value !== "foreign_pr_contribution" &&
    value !== "tracked_authored_pr"
  ) {
    throw new Error(
      "The persisted GitHub work-unit summary attribution mode is invalid."
    );
  }
  return value;
};

const checkedClaim = (claim: GitHubWorkUnitSummaryClaim) => {
  if (
    typeof claim !== "object" ||
    claim === null ||
    !UUID.test(claim.workUnitId) ||
    !UUID.test(claim.leaseToken) ||
    !DIGEST.test(claim.outcomeDigest) ||
    !DIGEST.test(claim.summaryInputDigest) ||
    !Number.isSafeInteger(claim.revision) ||
    claim.revision < 1 ||
    !Number.isSafeInteger(claim.unitRevision) ||
    claim.unitRevision < 1 ||
    (claim.startedRequests !== 1 && claim.startedRequests !== 2)
  ) {
    throw new TypeError("The GitHub work-unit summary claim is invalid.");
  }
  checkedAttributionMode(claim.attributionMode);
  return claim;
};

const checkedOptionalMetric = (value: number | null, label: string) => {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError(`The GitHub work-unit summary ${label} is invalid.`);
  }
  return value;
};

const checkedProviderResult = (result: GitHubWorkUnitSummaryProviderResult) => {
  if (
    typeof result !== "object" ||
    result === null ||
    typeof result.outcome !== "string" ||
    result.outcome.length === 0 ||
    typeof result.model !== "string" ||
    result.model.length === 0 ||
    result.model.length > 64 ||
    !Number.isSafeInteger(result.latencyMs) ||
    result.latencyMs < 0
  ) {
    throw new TypeError(
      "The GitHub work-unit summary provider result is invalid."
    );
  }
  checkedOptionalMetric(result.inputTokens, "input token count");
  checkedOptionalMetric(result.outputTokens, "output token count");
  return result;
};

const currentUnitMatchesAttempt = (
  unit: {
    attributionMode: string;
    outcomeDigest: string | null;
    repositoryVisibility: string | null;
    revision: number;
    summaryInputDigest: string | null;
    visibility: string;
  },
  attempt: {
    attributionMode: string;
    outcomeDigest: string;
    summaryInputDigest: string;
    unitRevision: number;
  }
) =>
  unit.visibility === "public" &&
  unit.repositoryVisibility === "public" &&
  unit.revision === attempt.unitRevision &&
  unit.outcomeDigest === attempt.outcomeDigest &&
  unit.summaryInputDigest === attempt.summaryInputDigest &&
  unit.attributionMode === attempt.attributionMode;

const recoverExpiredClaims = async (
  transaction: SummaryTransaction,
  now: Date
) => {
  const expiredUnits = await transaction
    .select({ id: githubWorkUnits.id })
    .from(githubWorkUnits)
    .innerJoin(
      githubWorkUnitSummaryAttempts,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
    )
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.state, "processing"),
        lte(githubWorkUnitSummaryAttempts.leaseUntil, now)
      )
    )
    .orderBy(githubWorkUnits.identityKey)
    .for("update", { of: githubWorkUnits });
  const expiredWorkUnitIds = [...new Set(expiredUnits.map(({ id }) => id))];
  if (expiredWorkUnitIds.length === 0) {
    return;
  }
  await transaction
    .update(githubWorkUnitSummaryAttempts)
    .set({
      acceptedAt: null,
      completedAt: now,
      leaseToken: null,
      leaseUntil: null,
      outcome: null,
      requestPayload: null,
      state: "terminal",
    })
    .where(
      and(
        inArray(githubWorkUnitSummaryAttempts.workUnitId, expiredWorkUnitIds),
        eq(githubWorkUnitSummaryAttempts.state, "processing"),
        lte(githubWorkUnitSummaryAttempts.leaseUntil, now),
        gte(
          githubWorkUnitSummaryAttempts.startedRequests,
          MAXIMUM_STARTED_REQUESTS
        )
      )
    );
  await transaction
    .update(githubWorkUnitSummaryAttempts)
    .set({
      debounceUntil: now,
      leaseToken: null,
      leaseUntil: null,
      state: "retryable",
    })
    .where(
      and(
        inArray(githubWorkUnitSummaryAttempts.workUnitId, expiredWorkUnitIds),
        eq(githubWorkUnitSummaryAttempts.state, "processing"),
        lte(githubWorkUnitSummaryAttempts.leaseUntil, now),
        lt(
          githubWorkUnitSummaryAttempts.startedRequests,
          MAXIMUM_STARTED_REQUESTS
        )
      )
    );
};

const claimSelection = {
  activityAt: githubWorkUnits.activityAt,
  attributionMode: githubWorkUnitSummaryAttempts.attributionMode,
  contentObservedAt: githubWorkUnits.contentObservedAt,
  debounceUntil: githubWorkUnitSummaryAttempts.debounceUntil,
  outcomeDigest: githubWorkUnitSummaryAttempts.outcomeDigest,
  recipe: githubWorkUnitSummaryAttempts.recipe,
  requestPayload: githubWorkUnitSummaryAttempts.requestPayload,
  revision: githubWorkUnitSummaryAttempts.revision,
  startedRequests: githubWorkUnitSummaryAttempts.startedRequests,
  state: githubWorkUnitSummaryAttempts.state,
  summaryInputDigest: githubWorkUnitSummaryAttempts.summaryInputDigest,
  unitRevision: githubWorkUnitSummaryAttempts.unitRevision,
  workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
};

type ClaimCandidate = Awaited<ReturnType<typeof selectClaimCandidate>>;

async function selectClaimCandidate(
  transaction: SummaryTransaction,
  now: Date,
  recentSince: Date,
  lane: "historical" | "recent"
) {
  const [candidate] = await transaction
    .select(claimSelection)
    .from(githubWorkUnitSummaryAttempts)
    .innerJoin(
      githubWorkUnits,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
    )
    .innerJoin(
      githubRepositories,
      eq(githubWorkUnits.repositoryId, githubRepositories.id)
    )
    .where(
      and(
        inArray(githubWorkUnitSummaryAttempts.state, ["pending", "retryable"]),
        lte(githubWorkUnitSummaryAttempts.debounceUntil, now),
        lt(
          githubWorkUnitSummaryAttempts.startedRequests,
          MAXIMUM_STARTED_REQUESTS
        ),
        isNotNull(githubWorkUnitSummaryAttempts.requestPayload),
        eq(
          githubWorkUnitSummaryAttempts.recipe,
          GITHUB_WORK_UNIT_SUMMARY_RECIPE
        ),
        eq(githubWorkUnits.visibility, "public"),
        eq(githubRepositories.visibility, "public"),
        eq(
          githubWorkUnits.revision,
          githubWorkUnitSummaryAttempts.unitRevision
        ),
        eq(
          githubWorkUnits.outcomeDigest,
          githubWorkUnitSummaryAttempts.outcomeDigest
        ),
        eq(
          githubWorkUnits.summaryInputDigest,
          githubWorkUnitSummaryAttempts.summaryInputDigest
        ),
        eq(
          githubWorkUnits.attributionMode,
          githubWorkUnitSummaryAttempts.attributionMode
        ),
        lane === "recent"
          ? gte(githubWorkUnits.activityAt, recentSince)
          : lt(githubWorkUnits.activityAt, recentSince)
      )
    )
    .orderBy(
      desc(githubWorkUnits.activityAt),
      desc(githubWorkUnits.contentObservedAt),
      githubWorkUnitSummaryAttempts.createdAt,
      githubWorkUnitSummaryAttempts.workUnitId
    )
    .limit(1);
  return candidate ?? null;
}

const lockedUnit = async (
  transaction: SummaryTransaction,
  workUnitId: string
) => {
  const [unit] = await transaction
    .select({
      activityAt: githubWorkUnits.activityAt,
      activityDay: githubWorkUnits.activityDay,
      attributionMode: githubWorkUnits.attributionMode,
      outcomeDigest: githubWorkUnits.outcomeDigest,
      repositoryVisibility: githubRepositories.visibility,
      revision: githubWorkUnits.revision,
      summaryInputDigest: githubWorkUnits.summaryInputDigest,
      visibility: githubWorkUnits.visibility,
    })
    .from(githubWorkUnits)
    .innerJoin(
      githubRepositories,
      eq(githubWorkUnits.repositoryId, githubRepositories.id)
    )
    .where(eq(githubWorkUnits.id, workUnitId))
    .for("update", { of: githubWorkUnits });
  return unit ?? null;
};

const lockedAttempt = async (
  transaction: SummaryTransaction,
  workUnitId: string,
  revision: number
) => {
  const [attempt] = await transaction
    .select({
      attributionMode: githubWorkUnitSummaryAttempts.attributionMode,
      inputTokens: githubWorkUnitSummaryAttempts.inputTokens,
      leaseToken: githubWorkUnitSummaryAttempts.leaseToken,
      outcomeDigest: githubWorkUnitSummaryAttempts.outcomeDigest,
      recipe: githubWorkUnitSummaryAttempts.recipe,
      requestPayload: githubWorkUnitSummaryAttempts.requestPayload,
      startedRequests: githubWorkUnitSummaryAttempts.startedRequests,
      state: githubWorkUnitSummaryAttempts.state,
      summaryInputDigest: githubWorkUnitSummaryAttempts.summaryInputDigest,
      unitRevision: githubWorkUnitSummaryAttempts.unitRevision,
    })
    .from(githubWorkUnitSummaryAttempts)
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.workUnitId, workUnitId),
        eq(githubWorkUnitSummaryAttempts.revision, revision)
      )
    )
    .for("update");
  return attempt ?? null;
};

const candidateRemainsClaimable = (
  attempt: NonNullable<Awaited<ReturnType<typeof lockedAttempt>>>,
  unit: NonNullable<Awaited<ReturnType<typeof lockedUnit>>>,
  candidate: NonNullable<ClaimCandidate>,
  now: Date,
  recentSince: Date,
  lane: "historical" | "recent"
) =>
  attempt.state === candidate.state &&
  (attempt.state === "pending" || attempt.state === "retryable") &&
  attempt.requestPayload !== null &&
  attempt.requestPayload === candidate.requestPayload &&
  attempt.startedRequests === candidate.startedRequests &&
  attempt.startedRequests < MAXIMUM_STARTED_REQUESTS &&
  candidate.debounceUntil.getTime() <= now.getTime() &&
  attempt.recipe === GITHUB_WORK_UNIT_SUMMARY_RECIPE &&
  currentUnitMatchesAttempt(unit, attempt) &&
  (lane === "recent"
    ? unit.activityAt.getTime() >= recentSince.getTime()
    : unit.activityAt.getTime() < recentSince.getTime());

const utcDayBounds = (now: Date) => {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return { end: new Date(start.getTime() + 24 * 60 * 60_000), start };
};

const utcUsageWindow = (now: Date) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
  const daysInMonth = new Date(nextMonthStart.getTime() - 1).getUTCDate();
  return {
    day: now.toISOString().slice(0, 10),
    futureDays: daysInMonth - now.getUTCDate(),
    monthStart: monthStart.toISOString().slice(0, 10),
    nextMonthStart: nextMonthStart.toISOString().slice(0, 10),
  };
};

const readSummaryUsage = async (transaction: SummaryTransaction, now: Date) => {
  const window = utcUsageWindow(now);
  const [row] = await transaction
    .select({
      dailyStartedRequests: sql<number>`coalesce(sum(${githubWorkUnitSummaryDailyUsage.startedRequests}) filter (where ${githubWorkUnitSummaryDailyUsage.day} = ${window.day}), 0)::integer`,
      monthlyStartedRequests: sql<number>`coalesce(sum(${githubWorkUnitSummaryDailyUsage.startedRequests}), 0)::integer`,
    })
    .from(githubWorkUnitSummaryDailyUsage)
    .where(
      and(
        gte(githubWorkUnitSummaryDailyUsage.day, window.monthStart),
        lt(githubWorkUnitSummaryDailyUsage.day, window.nextMonthStart)
      )
    );
  const dailyStartedRequests = row?.dailyStartedRequests ?? 0;
  const monthlyStartedRequests = row?.monthlyStartedRequests ?? 0;
  if (
    !Number.isSafeInteger(dailyStartedRequests) ||
    dailyStartedRequests < 0 ||
    dailyStartedRequests > MAXIMUM_DAILY_STARTED_REQUESTS ||
    !Number.isSafeInteger(monthlyStartedRequests) ||
    monthlyStartedRequests < dailyStartedRequests
  ) {
    throw new Error("The persisted GitHub work-unit summary usage is invalid.");
  }
  return {
    ...window,
    dailyStartedRequests,
    monthlyStartedRequests,
  };
};

type SummaryUsage = Awaited<ReturnType<typeof readSummaryUsage>>;

const hasRequestCapacity = (usage: SummaryUsage) =>
  usage.dailyStartedRequests < MAXIMUM_DAILY_STARTED_REQUESTS &&
  usage.monthlyStartedRequests < MAXIMUM_MONTHLY_STARTED_REQUESTS;

const hasHistoricalRequestCapacity = (usage: SummaryUsage) =>
  hasRequestCapacity(usage) &&
  usage.monthlyStartedRequests +
    1 +
    usage.futureDays * RESERVED_RECENT_REQUESTS_PER_FUTURE_DAY <=
    MAXIMUM_MONTHLY_STARTED_REQUESTS;

const recordStartedRequest = async (
  transaction: SummaryTransaction,
  usage: SummaryUsage
) => {
  const [row] = await transaction
    .insert(githubWorkUnitSummaryDailyUsage)
    .values({ day: usage.day, startedRequests: 1 })
    .onConflictDoUpdate({
      set: {
        startedRequests: sql`${githubWorkUnitSummaryDailyUsage.startedRequests} + 1`,
      },
      target: githubWorkUnitSummaryDailyUsage.day,
    })
    .returning({
      startedRequests: githubWorkUnitSummaryDailyUsage.startedRequests,
    });
  if (row?.startedRequests !== usage.dailyStartedRequests + 1) {
    throw new Error("The GitHub work-unit summary usage was not recorded.");
  }
};

const historicalStartExistsToday = async (
  transaction: SummaryTransaction,
  now: Date
) => {
  const { end, start } = utcDayBounds(now);
  const [row] = await transaction
    .select({ value: sql<number>`count(*)::integer` })
    .from(githubWorkUnitSummaryAttempts)
    .innerJoin(
      githubWorkUnits,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
    )
    .where(
      and(
        gte(githubWorkUnitSummaryAttempts.lastStartedAt, start),
        lt(githubWorkUnitSummaryAttempts.lastStartedAt, end),
        sql`${githubWorkUnits.activityAt} < ${githubWorkUnitSummaryAttempts.lastStartedAt} - interval '30 days'`
      )
    );
  return (row?.value ?? 0) > 0;
};

const tryClaimCandidate = async (
  transaction: SummaryTransaction,
  candidate: NonNullable<ClaimCandidate>,
  now: Date,
  leaseDurationMs: number,
  recentSince: Date,
  lane: "historical" | "recent",
  usage: SummaryUsage
): Promise<GitHubWorkUnitSummaryClaim | null> => {
  // The projection store locks units before attempts. Keep the same order.
  const unit = await lockedUnit(transaction, candidate.workUnitId);
  if (unit === null) {
    return null;
  }
  const attempt = await lockedAttempt(
    transaction,
    candidate.workUnitId,
    candidate.revision
  );
  if (
    attempt === null ||
    !candidateRemainsClaimable(attempt, unit, candidate, now, recentSince, lane)
  ) {
    return null;
  }
  const attributionMode = checkedAttributionMode(attempt.attributionMode);
  const leaseToken = randomUUID();
  const startedRequests = attempt.startedRequests + 1;
  if (startedRequests !== 1 && startedRequests !== 2) {
    throw new Error(
      "The persisted GitHub work-unit summary request count is invalid."
    );
  }
  const [updated] = await transaction
    .update(githubWorkUnitSummaryAttempts)
    .set({
      lastStartedAt: now,
      leaseToken,
      leaseUntil: new Date(now.getTime() + leaseDurationMs),
      startedRequests,
      state: "processing",
    })
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.workUnitId, candidate.workUnitId),
        eq(githubWorkUnitSummaryAttempts.revision, candidate.revision),
        eq(
          githubWorkUnitSummaryAttempts.startedRequests,
          attempt.startedRequests
        ),
        inArray(githubWorkUnitSummaryAttempts.state, ["pending", "retryable"])
      )
    )
    .returning({ revision: githubWorkUnitSummaryAttempts.revision });
  if (updated === undefined || attempt.requestPayload === null) {
    return null;
  }
  await recordStartedRequest(transaction, usage);
  return Object.freeze({
    attributionMode,
    leaseToken,
    outcomeDigest: attempt.outcomeDigest,
    revision: candidate.revision,
    serializedInput: attempt.requestPayload,
    startedRequests,
    summaryInputDigest: attempt.summaryInputDigest,
    unitRevision: attempt.unitRevision,
    workUnitId: candidate.workUnitId,
  });
};

const leaseMatchesClaim = (
  attempt: NonNullable<Awaited<ReturnType<typeof lockedAttempt>>>,
  claim: GitHubWorkUnitSummaryClaim
) =>
  attempt.state === "processing" &&
  attempt.leaseToken === claim.leaseToken &&
  attempt.startedRequests === claim.startedRequests &&
  attempt.recipe === GITHUB_WORK_UNIT_SUMMARY_RECIPE &&
  attempt.unitRevision === claim.unitRevision &&
  attempt.outcomeDigest === claim.outcomeDigest &&
  attempt.summaryInputDigest === claim.summaryInputDigest &&
  attempt.attributionMode === claim.attributionMode;

const terminalizeLockedAttempt = async (
  transaction: SummaryTransaction,
  claim: GitHubWorkUnitSummaryClaim,
  now: Date
) => {
  const [updated] = await transaction
    .update(githubWorkUnitSummaryAttempts)
    .set({
      acceptedAt: null,
      completedAt: now,
      leaseToken: null,
      leaseUntil: null,
      outcome: null,
      requestPayload: null,
      state: "terminal",
    })
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.workUnitId, claim.workUnitId),
        eq(githubWorkUnitSummaryAttempts.revision, claim.revision),
        eq(githubWorkUnitSummaryAttempts.state, "processing"),
        eq(githubWorkUnitSummaryAttempts.leaseToken, claim.leaseToken)
      )
    )
    .returning({ revision: githubWorkUnitSummaryAttempts.revision });
  return updated !== undefined;
};

async function readInitialPageDays(transaction: SummaryTransaction) {
  const recognizedWorkUnit = or(
    and(
      eq(githubWorkUnits.visibility, "public"),
      eq(githubRepositories.visibility, "public")
    ),
    and(
      eq(githubWorkUnits.visibility, "private"),
      inArray(githubRepositories.visibility, ["private", "internal"])
    )
  );
  const issueDay = sql<string>`to_char(${githubIssues.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const [workDays, issueDays] = await Promise.all([
    transaction
      .selectDistinct({ day: githubWorkUnits.activityDay })
      .from(githubWorkUnits)
      .innerJoin(
        githubRepositories,
        eq(githubWorkUnits.repositoryId, githubRepositories.id)
      )
      .where(recognizedWorkUnit)
      .orderBy(desc(githubWorkUnits.activityDay))
      .limit(PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE),
    transaction
      .selectDistinct({ day: issueDay })
      .from(githubIssues)
      .innerJoin(
        githubRepositories,
        eq(githubIssues.repositoryId, githubRepositories.id)
      )
      .where(
        inArray(githubRepositories.visibility, [
          "public",
          "private",
          "internal",
        ])
      )
      .orderBy(desc(issueDay))
      .limit(PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE),
  ]);
  return new Set(
    [...workDays, ...issueDays]
      .map(({ day }) => day)
      .toSorted((left, right) => right.localeCompare(left))
      .slice(0, PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE)
  );
}

async function hasActiveInitialPageSummary(
  transaction: SummaryTransaction,
  now: Date,
  initialPageDays: ReadonlySet<string>
) {
  if (initialPageDays.size === 0) {
    return false;
  }
  const [active] = await transaction
    .select({ revision: githubWorkUnitSummaryAttempts.revision })
    .from(githubWorkUnitSummaryAttempts)
    .innerJoin(
      githubWorkUnits,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
    )
    .innerJoin(
      githubRepositories,
      eq(githubWorkUnits.repositoryId, githubRepositories.id)
    )
    .where(
      and(
        eq(githubWorkUnitSummaryAttempts.state, "processing"),
        gt(githubWorkUnitSummaryAttempts.leaseUntil, now),
        isNotNull(githubWorkUnitSummaryAttempts.requestPayload),
        eq(
          githubWorkUnitSummaryAttempts.recipe,
          GITHUB_WORK_UNIT_SUMMARY_RECIPE
        ),
        eq(githubWorkUnits.visibility, "public"),
        eq(githubRepositories.visibility, "public"),
        gte(
          githubWorkUnits.activityAt,
          new Date(now.getTime() - RECENT_WINDOW_MS)
        ),
        inArray(githubWorkUnits.activityDay, [...initialPageDays]),
        eq(
          githubWorkUnits.revision,
          githubWorkUnitSummaryAttempts.unitRevision
        ),
        eq(
          githubWorkUnits.outcomeDigest,
          githubWorkUnitSummaryAttempts.outcomeDigest
        ),
        eq(
          githubWorkUnits.summaryInputDigest,
          githubWorkUnitSummaryAttempts.summaryInputDigest
        ),
        eq(
          githubWorkUnits.attributionMode,
          githubWorkUnitSummaryAttempts.attributionMode
        )
      )
    )
    .limit(1);
  return active !== undefined;
}

interface PublicHeadMutation {
  readonly feedRevisionChanged?: boolean;
  readonly initialPageContentChanged?: boolean;
}

async function revisePublicSummaryHead(
  transaction: SummaryTransaction,
  now: Date,
  initialPageDays: ReadonlySet<string>,
  mutation: PublicHeadMutation = {}
) {
  const summarizing = await hasActiveInitialPageSummary(
    transaction,
    now,
    initialPageDays
  );
  const [current] = await transaction
    .select({ summarizing: githubPublicFeedHead.summarizing })
    .from(githubPublicFeedHead)
    .where(eq(githubPublicFeedHead.id, true))
    .for("update");
  if (current === undefined) {
    throw new Error("The GitHub public feed head is unavailable.");
  }
  const summarizingChanged = current.summarizing !== summarizing;
  const headContentChanged =
    summarizingChanged ||
    mutation.feedRevisionChanged === true ||
    mutation.initialPageContentChanged === true;
  if (!headContentChanged) {
    return summarizing;
  }
  const [updated] = await transaction
    .update(githubPublicFeedHead)
    .set({
      ...(mutation.feedRevisionChanged === true
        ? {
            feedRevision: sql`${githubPublicFeedHead.feedRevision} + 1`,
            lastPublishedAt: now,
          }
        : {}),
      headContentRevision: sql`${githubPublicFeedHead.headContentRevision} + 1`,
      summarizing,
    })
    .where(eq(githubPublicFeedHead.id, true))
    .returning({ id: githubPublicFeedHead.id });
  if (updated === undefined) {
    throw new Error("The GitHub public feed head is unavailable.");
  }
  return summarizing;
}

/**
 * Claims exactly one provider request. The successful transaction increments
 * `startedRequests`; callers must issue exactly one provider request for the
 * returned payload and then complete, defer, or terminalize that lease.
 */
export const claimGitHubWorkUnitSummary = async (
  options: GitHubWorkUnitSummaryClaimOptions = {}
): Promise<GitHubWorkUnitSummaryClaim | null> => {
  const now = checkedDate(options.now ?? new Date(), "claim timestamp");
  const leaseDurationMs = checkedLeaseDuration(options.leaseDurationMs);
  const recentSince = new Date(now.getTime() - RECENT_WINDOW_MS);
  return await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
    );
    await recoverExpiredClaims(transaction, now);
    const usage = await readSummaryUsage(transaction, now);
    let claim: GitHubWorkUnitSummaryClaim | null = null;
    if (hasRequestCapacity(usage)) {
      const recent = await selectClaimCandidate(
        transaction,
        now,
        recentSince,
        "recent"
      );
      if (recent !== null) {
        claim = await tryClaimCandidate(
          transaction,
          recent,
          now,
          leaseDurationMs,
          recentSince,
          "recent",
          usage
        );
      } else if (
        hasHistoricalRequestCapacity(usage) &&
        !(await historicalStartExistsToday(transaction, now))
      ) {
        const historical = await selectClaimCandidate(
          transaction,
          now,
          recentSince,
          "historical"
        );
        if (historical !== null) {
          claim = await tryClaimCandidate(
            transaction,
            historical,
            now,
            leaseDurationMs,
            recentSince,
            "historical",
            usage
          );
        }
      }
    }
    const initialPageDays = await readInitialPageDays(transaction);
    await revisePublicSummaryHead(transaction, now, initialPageDays);
    return claim;
  });
};

/** Accepts provider output only while every current public summary key matches. */
export const completeGitHubWorkUnitSummary = async (
  uncheckedClaim: GitHubWorkUnitSummaryClaim,
  uncheckedResult: GitHubWorkUnitSummaryProviderResult,
  completedAt = new Date()
): Promise<GitHubWorkUnitSummaryCompletionResult> => {
  const claim = checkedClaim(uncheckedClaim);
  const result = checkedProviderResult(uncheckedResult);
  const now = checkedDate(completedAt, "completion timestamp");
  return await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
    );
    await recoverExpiredClaims(transaction, now);
    const initialPageDays = await readInitialPageDays(transaction);
    const settleHead = async (mutation?: PublicHeadMutation) =>
      await revisePublicSummaryHead(
        transaction,
        now,
        initialPageDays,
        mutation
      );
    const unit = await lockedUnit(transaction, claim.workUnitId);
    if (unit === null) {
      await settleHead();
      return { accepted: false };
    }
    const attempt = await lockedAttempt(
      transaction,
      claim.workUnitId,
      claim.revision
    );
    if (attempt === null || !leaseMatchesClaim(attempt, claim)) {
      await settleHead();
      return { accepted: false };
    }
    if (!currentUnitMatchesAttempt(unit, attempt)) {
      await terminalizeLockedAttempt(transaction, claim, now);
      await settleHead();
      return { accepted: false };
    }
    const [priorAcceptedOutcome] = await transaction
      .select({ revision: githubWorkUnitSummaryAttempts.revision })
      .from(githubWorkUnitSummaryAttempts)
      .where(
        and(
          eq(githubWorkUnitSummaryAttempts.workUnitId, claim.workUnitId),
          eq(githubWorkUnitSummaryAttempts.state, "accepted"),
          eq(githubWorkUnitSummaryAttempts.outcomeDigest, claim.outcomeDigest),
          eq(
            githubWorkUnitSummaryAttempts.attributionMode,
            claim.attributionMode
          ),
          isNotNull(githubWorkUnitSummaryAttempts.acceptedAt),
          isNotNull(githubWorkUnitSummaryAttempts.outcome)
        )
      )
      .limit(1);
    const initialPageChanged = initialPageDays.has(unit.activityDay);
    const [accepted] = await transaction
      .update(githubWorkUnitSummaryAttempts)
      .set({
        acceptedAt: now,
        completedAt: now,
        inputTokens: result.inputTokens ?? attempt.inputTokens,
        latencyMs: result.latencyMs,
        leaseToken: null,
        leaseUntil: null,
        model: result.model,
        outcome: result.outcome,
        outputTokens: result.outputTokens,
        requestPayload: null,
        state: "accepted",
      })
      .where(
        and(
          eq(githubWorkUnitSummaryAttempts.workUnitId, claim.workUnitId),
          eq(githubWorkUnitSummaryAttempts.revision, claim.revision),
          eq(githubWorkUnitSummaryAttempts.state, "processing"),
          eq(githubWorkUnitSummaryAttempts.leaseToken, claim.leaseToken)
        )
      )
      .returning({ revision: githubWorkUnitSummaryAttempts.revision });
    if (accepted === undefined) {
      await settleHead();
      return { accepted: false };
    }
    await settleHead(
      initialPageChanged
        ? {
            feedRevisionChanged: priorAcceptedOutcome === undefined,
            initialPageContentChanged: true,
          }
        : undefined
    );
    return { accepted: true };
  });
};

/** Defers a transient provider failure, or settles facts-only at the retry cap. */
export const deferGitHubWorkUnitSummary = async (
  uncheckedClaim: GitHubWorkUnitSummaryClaim,
  retryAt: Date,
  deferredAt = new Date()
): Promise<GitHubWorkUnitSummaryDeferResult> => {
  const claim = checkedClaim(uncheckedClaim);
  const now = checkedDate(deferredAt, "defer timestamp");
  const retry = checkedDate(retryAt, "retry timestamp");
  if (retry.getTime() < now.getTime()) {
    throw new RangeError(
      "The GitHub work-unit summary retry timestamp is in the past."
    );
  }
  return await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
    );
    await recoverExpiredClaims(transaction, now);
    const initialPageDays = await readInitialPageDays(transaction);
    const settleHead = async () =>
      await revisePublicSummaryHead(transaction, now, initialPageDays);
    const unit = await lockedUnit(transaction, claim.workUnitId);
    if (unit === null) {
      await settleHead();
      return "stale";
    }
    const attempt = await lockedAttempt(
      transaction,
      claim.workUnitId,
      claim.revision
    );
    if (attempt === null || !leaseMatchesClaim(attempt, claim)) {
      await settleHead();
      return "stale";
    }
    if (
      !currentUnitMatchesAttempt(unit, attempt) ||
      attempt.startedRequests >= MAXIMUM_STARTED_REQUESTS
    ) {
      await terminalizeLockedAttempt(transaction, claim, now);
      await settleHead();
      return "terminal";
    }
    const [deferred] = await transaction
      .update(githubWorkUnitSummaryAttempts)
      .set({
        debounceUntil: retry,
        leaseToken: null,
        leaseUntil: null,
        state: "retryable",
      })
      .where(
        and(
          eq(githubWorkUnitSummaryAttempts.workUnitId, claim.workUnitId),
          eq(githubWorkUnitSummaryAttempts.revision, claim.revision),
          eq(githubWorkUnitSummaryAttempts.state, "processing"),
          eq(githubWorkUnitSummaryAttempts.leaseToken, claim.leaseToken)
        )
      )
      .returning({ revision: githubWorkUnitSummaryAttempts.revision });
    await settleHead();
    return deferred === undefined ? "stale" : "deferred";
  });
};

/** Settles deterministic invalid input or output as facts-only. */
export const terminalGitHubWorkUnitSummary = async (
  uncheckedClaim: GitHubWorkUnitSummaryClaim,
  terminalAt = new Date()
): Promise<boolean> => {
  const claim = checkedClaim(uncheckedClaim);
  const now = checkedDate(terminalAt, "terminal timestamp");
  return await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
    );
    await recoverExpiredClaims(transaction, now);
    const initialPageDays = await readInitialPageDays(transaction);
    const attempt = await lockedAttempt(
      transaction,
      claim.workUnitId,
      claim.revision
    );
    const terminalized =
      attempt !== null && leaseMatchesClaim(attempt, claim)
        ? await terminalizeLockedAttempt(transaction, claim, now)
        : false;
    await revisePublicSummaryHead(transaction, now, initialPageDays);
    return terminalized;
  });
};

/** Reconciles the public status after projection changes initial-page membership. */
export const reconcileGitHubWorkUnitSummaryStatus = async (
  reconciledAt = new Date()
): Promise<boolean> => {
  const now = checkedDate(reconciledAt, "status timestamp");
  return await getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
    );
    await recoverExpiredClaims(transaction, now);
    const initialPageDays = await readInitialPageDays(transaction);
    return await revisePublicSummaryHead(transaction, now, initialPageDays);
  });
};
