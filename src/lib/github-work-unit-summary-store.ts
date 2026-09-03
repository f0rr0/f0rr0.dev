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
  githubWorkUnitAcceptedSummaries,
  githubWorkUnitSummaryAttempts,
  githubWorkUnitSummaryDailyUsage,
  githubWorkUnits,
} from "@/db/schema";
import { env } from "@/env";
import { PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE } from "@/lib/github-activity-store";
import { GITHUB_SUMMARY_REQUEST_BUDGET } from "@/lib/github-cron-config";
import { acquireGitHubWorkUnitProjectionLock } from "@/lib/github-work-unit-projection-state";
import { GITHUB_WORK_UNIT_SUMMARY_RECIPE } from "@/lib/github-work-unit-summary";
import type { GitHubWorkUnitSummaryAttributionMode } from "@/lib/github-work-unit-summary";
import type { GitHubWorkUnitSummaryProviderResult } from "@/lib/github-work-unit-summary-provider";

const SUMMARY_CLAIM_LOCK = "github-work-unit-summary-claim-v1";
const DEFAULT_LEASE_DURATION_MS = 90_000;
const MAXIMUM_LEASE_DURATION_MS = 15 * 60_000;
const MAXIMUM_STARTED_REQUESTS = 2;
const MAXIMUM_DAILY_STARTED_REQUESTS = GITHUB_SUMMARY_REQUEST_BUDGET.daily;
const MAXIMUM_MONTHLY_STARTED_REQUESTS = GITHUB_SUMMARY_REQUEST_BUDGET.monthly;
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type SummaryTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

const acquireSummaryStateLocks = async (transaction: SummaryTransaction) => {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtext(${SUMMARY_CLAIM_LOCK}))`
  );
  await acquireGitHubWorkUnitProjectionLock(transaction);
};

export interface GitHubWorkUnitSummaryClaim {
  readonly attributionMode: GitHubWorkUnitSummaryAttributionMode;
  readonly leaseToken: string;
  readonly outcomeDigest: string;
  readonly revision: number;
  readonly serializedInput: string;
  readonly startedRequests: 1 | 2;
  readonly summaryInputDigest: string;
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

const unitMatchesAttempt = (
  unit: {
    attributionMode: string;
    outcomeDigest: string | null;
    summaryInputDigest: string | null;
  },
  attempt: {
    attributionMode: string;
    outcomeDigest: string;
    summaryInputDigest: string;
  }
) =>
  unit.outcomeDigest === attempt.outcomeDigest &&
  unit.summaryInputDigest === attempt.summaryInputDigest &&
  unit.attributionMode === attempt.attributionMode;

const currentUnitMatchesAttempt = (
  unit: {
    attributionMode: string;
    outcomeDigest: string | null;
    summaryEvaluatedDigest: string | null;
    summaryEvaluationDigest: string | null;
    summaryInputDigest: string | null;
  },
  attempt: {
    attributionMode: string;
    outcomeDigest: string;
    summaryInputDigest: string;
  }
) =>
  unitMatchesAttempt(unit, attempt) &&
  unit.summaryEvaluationDigest !== null &&
  unit.summaryEvaluationDigest === unit.summaryEvaluatedDigest;

const reconcileInactiveSummaryInputs = async (
  transaction: SummaryTransaction
) => {
  await transaction.execute(sql`
    delete from ${githubWorkUnitSummaryAttempts} as attempt
    using ${githubWorkUnits} as work_unit
    where attempt.work_unit_id = work_unit.id
      and attempt.state in ('pending', 'retryable')
      and (
        attempt.recipe <> ${GITHUB_WORK_UNIT_SUMMARY_RECIPE}
        or (
          attempt.started_requests = 0
          and (
            work_unit.summary_evaluation_digest is null
            or work_unit.summary_evaluation_digest
              is distinct from work_unit.summary_evaluated_digest
            or work_unit.outcome_digest is distinct from attempt.outcome_digest
            or work_unit.summary_input_digest
              is distinct from attempt.summary_input_digest
            or work_unit.attribution_mode
              is distinct from attempt.attribution_mode
          )
        )
      )
  `);
  await transaction.execute(sql`
    update ${githubWorkUnitSummaryAttempts} as attempt
    set request_payload = null
    from ${githubWorkUnits} as work_unit
    where attempt.work_unit_id = work_unit.id
      and attempt.state = 'retryable'
      and attempt.started_requests > 0
      and attempt.request_payload is not null
      and attempt.recipe = ${GITHUB_WORK_UNIT_SUMMARY_RECIPE}
      and (
        work_unit.summary_evaluation_digest is null
        or work_unit.summary_evaluation_digest
          is distinct from work_unit.summary_evaluated_digest
        or work_unit.outcome_digest is distinct from attempt.outcome_digest
        or work_unit.summary_input_digest
          is distinct from attempt.summary_input_digest
        or work_unit.attribution_mode
          is distinct from attempt.attribution_mode
      )
  `);
};

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
  if (expiredWorkUnitIds.length > 0) {
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
  }
  await reconcileInactiveSummaryInputs(transaction);
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
  workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
};

type ClaimCandidate = Awaited<ReturnType<typeof selectClaimCandidate>>;

async function selectClaimCandidate(
  transaction: SummaryTransaction,
  now: Date
) {
  const [candidate] = await transaction
    .select(claimSelection)
    .from(githubWorkUnitSummaryAttempts)
    .innerJoin(
      githubWorkUnits,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
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
        eq(
          githubWorkUnits.summaryEvaluationDigest,
          githubWorkUnits.summaryEvaluatedDigest
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
      activityDay: githubWorkUnits.activityDay,
      attributionMode: githubWorkUnits.attributionMode,
      identityKey: githubWorkUnits.identityKey,
      outcomeDigest: githubWorkUnits.outcomeDigest,
      repositoryId: githubWorkUnits.repositoryId,
      summaryEvaluatedDigest: githubWorkUnits.summaryEvaluatedDigest,
      summaryEvaluationDigest: githubWorkUnits.summaryEvaluationDigest,
      summaryInputDigest: githubWorkUnits.summaryInputDigest,
    })
    .from(githubWorkUnits)
    .where(eq(githubWorkUnits.id, workUnitId))
    .for("update");
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
  now: Date
) =>
  attempt.state === candidate.state &&
  (attempt.state === "pending" || attempt.state === "retryable") &&
  attempt.requestPayload !== null &&
  attempt.requestPayload === candidate.requestPayload &&
  attempt.startedRequests === candidate.startedRequests &&
  attempt.startedRequests < MAXIMUM_STARTED_REQUESTS &&
  candidate.debounceUntil.getTime() <= now.getTime() &&
  attempt.recipe === GITHUB_WORK_UNIT_SUMMARY_RECIPE &&
  currentUnitMatchesAttempt(unit, attempt);

const utcUsageWindow = (now: Date) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));
  return {
    day: now.toISOString().slice(0, 10),
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

const tryClaimCandidate = async (
  transaction: SummaryTransaction,
  candidate: NonNullable<ClaimCandidate>,
  now: Date,
  leaseDurationMs: number,
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
    !candidateRemainsClaimable(attempt, unit, candidate, now)
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
  const recognizedWorkUnit = and(
    inArray(githubWorkUnits.visibility, ["public", "private"]),
    inArray(githubRepositories.visibility, ["public", "private", "internal"])
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

async function hasCurrentInitialPageSummaryWork(
  transaction: SummaryTransaction,
  now: Date,
  initialPageDays: ReadonlySet<string>
) {
  if (
    initialPageDays.size === 0 ||
    (env.OPENAI_API_KEY?.trim().length ?? 0) === 0
  ) {
    return false;
  }
  const [active] = await transaction
    .select({ revision: githubWorkUnitSummaryAttempts.revision })
    .from(githubWorkUnits)
    .innerJoin(
      githubRepositories,
      eq(githubWorkUnits.repositoryId, githubRepositories.id)
    )
    .leftJoin(
      githubWorkUnitSummaryAttempts,
      and(
        eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id),
        eq(
          githubWorkUnitSummaryAttempts.recipe,
          GITHUB_WORK_UNIT_SUMMARY_RECIPE
        )
      )
    )
    .where(
      and(
        inArray(githubWorkUnits.visibility, ["public", "private"]),
        inArray(githubRepositories.visibility, [
          "public",
          "private",
          "internal",
        ]),
        inArray(githubWorkUnits.activityDay, [...initialPageDays]),
        or(
          and(
            isNotNull(githubWorkUnits.summaryEvaluationDigest),
            sql`${githubWorkUnits.summaryEvaluationDigest} IS DISTINCT FROM ${githubWorkUnits.summaryEvaluatedDigest}`
          ),
          and(
            eq(
              githubWorkUnits.summaryEvaluationDigest,
              githubWorkUnits.summaryEvaluatedDigest
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
            isNotNull(githubWorkUnitSummaryAttempts.requestPayload),
            or(
              and(
                inArray(githubWorkUnitSummaryAttempts.state, [
                  "pending",
                  "retryable",
                ]),
                lt(
                  githubWorkUnitSummaryAttempts.startedRequests,
                  MAXIMUM_STARTED_REQUESTS
                )
              ),
              and(
                eq(githubWorkUnitSummaryAttempts.state, "processing"),
                gt(githubWorkUnitSummaryAttempts.leaseUntil, now)
              )
            )
          )
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
  const summarizing = await hasCurrentInitialPageSummaryWork(
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
  return await getDatabase().transaction(async (transaction) => {
    await acquireSummaryStateLocks(transaction);
    await recoverExpiredClaims(transaction, now);
    const usage = await readSummaryUsage(transaction, now);
    let claim: GitHubWorkUnitSummaryClaim | null = null;
    if (hasRequestCapacity(usage)) {
      const candidate = await selectClaimCandidate(transaction, now);
      if (candidate !== null) {
        claim = await tryClaimCandidate(
          transaction,
          candidate,
          now,
          leaseDurationMs,
          usage
        );
      }
    }
    const initialPageDays = await readInitialPageDays(transaction);
    await revisePublicSummaryHead(transaction, now, initialPageDays);
    return claim;
  });
};

/** Stores valid output, including reusable stale evaluations. */
export const completeGitHubWorkUnitSummary = async (
  uncheckedClaim: GitHubWorkUnitSummaryClaim,
  uncheckedResult: GitHubWorkUnitSummaryProviderResult,
  completedAt = new Date()
): Promise<GitHubWorkUnitSummaryCompletionResult> => {
  const claim = checkedClaim(uncheckedClaim);
  const result = checkedProviderResult(uncheckedResult);
  const now = checkedDate(completedAt, "completion timestamp");
  return await getDatabase().transaction(async (transaction) => {
    await acquireSummaryStateLocks(transaction);
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
    const currentlyVisible = unitMatchesAttempt(unit, attempt);
    const initialPageChanged =
      currentlyVisible && initialPageDays.has(unit.activityDay);
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
    await transaction
      .insert(githubWorkUnitAcceptedSummaries)
      .values({
        acceptedAt: now,
        attributionMode: attempt.attributionMode,
        identityKey: unit.identityKey,
        outcome: result.outcome,
        outcomeDigest: attempt.outcomeDigest,
        recipe: attempt.recipe,
        repositoryId: unit.repositoryId,
        summaryInputDigest: attempt.summaryInputDigest,
      })
      .onConflictDoNothing();
    await settleHead(
      initialPageChanged
        ? {
            feedRevisionChanged: true,
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
    await acquireSummaryStateLocks(transaction);
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
    if (attempt.startedRequests >= MAXIMUM_STARTED_REQUESTS) {
      await terminalizeLockedAttempt(transaction, claim, now);
      await settleHead();
      return "terminal";
    }
    const remainsCurrent = currentUnitMatchesAttempt(unit, attempt);
    const [deferred] = await transaction
      .update(githubWorkUnitSummaryAttempts)
      .set({
        debounceUntil: retry,
        leaseToken: null,
        leaseUntil: null,
        requestPayload: remainsCurrent ? attempt.requestPayload : null,
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
    return deferred === undefined || !remainsCurrent ? "stale" : "deferred";
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
    await acquireSummaryStateLocks(transaction);
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
    await acquireSummaryStateLocks(transaction);
    await recoverExpiredClaims(transaction, now);
    const initialPageDays = await readInitialPageDays(transaction);
    return await revisePublicSummaryHead(transaction, now, initialPageDays);
  });
};
