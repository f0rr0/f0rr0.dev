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
  githubActivitySnapshots,
  githubPublicFeedHead,
  githubRepositories,
  githubWorkUnitSummaryAttempts,
  githubWorkUnitSummaryDailyUsage,
  githubWorkUnits,
} from "@/db/schema";
import { env } from "@/env";
import { fillSavedGitHubSummaries } from "@/lib/github-activity-snapshots";
import {
  githubIssueActivityDay,
  PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE,
} from "@/lib/github-activity-store";
import { TRACKED_GITHUB_USER_IDS } from "@/lib/github-commits-core";
import { GITHUB_SUMMARY_REQUEST_BUDGET } from "@/lib/github-cron-config";
import { acquireGitHubWorkUnitProjectionLock } from "@/lib/github-work-unit-projection-state";
import {
  decodeGitHubWorkUnitSummary,
  GITHUB_WORK_UNIT_SUMMARY_RECIPE,
} from "@/lib/github-work-unit-summary";
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
  const inactive = sql`
    (attempt.recipe <> ${GITHUB_WORK_UNIT_SUMMARY_RECIPE} or not exists (
      select 1 from ${githubWorkUnits} w
      where w.id = attempt.work_unit_id
        and w.summary_evaluation_digest = w.summary_evaluated_digest
        and w.outcome_digest = attempt.outcome_digest
        and w.summary_input_digest = attempt.summary_input_digest
        and w.attribution_mode = attempt.attribution_mode
    )) and not exists (
      select 1 from ${githubActivitySnapshots} s where s.work_unit_id = attempt.work_unit_id
        and s.outcome_digest = attempt.outcome_digest and s.summary_input_digest = attempt.summary_input_digest
        and s.attribution_mode = attempt.attribution_mode and s.payload->>'headline' is null
    )
  `;
  await transaction.execute(sql`
    delete from ${githubWorkUnitSummaryAttempts} as attempt
    where attempt.state in ('pending', 'retryable')
      and attempt.started_requests = 0 and ${inactive}
  `);
  await transaction.execute(sql`
    update ${githubWorkUnitSummaryAttempts} as attempt set request_payload = null
    where attempt.state = 'retryable' and attempt.started_requests > 0
      and attempt.request_payload is not null and ${inactive}
  `);
};

const recoverExpiredClaims = async (
  transaction: SummaryTransaction,
  now: Date
) => {
  // Both workers hold the summary/projection locks; expired orphaned attempts
  // need the same settlement as attempts still attached to visible work.
  await transaction.execute(sql`
    update ${githubWorkUnitSummaryAttempts}
    set accepted_at = null, lease_token = null, lease_until = null,
        error_code = 'lease_expired',
        state = case when started_requests >= ${MAXIMUM_STARTED_REQUESTS} then 'terminal' else 'retryable' end,
        completed_at = case when started_requests >= ${MAXIMUM_STARTED_REQUESTS} then ${now.toISOString()}::timestamptz else null end,
        request_payload = case when started_requests >= ${MAXIMUM_STARTED_REQUESTS} then null else request_payload end
    where state = 'processing' and lease_until <= ${now.toISOString()}::timestamptz
  `);
  await reconcileInactiveSummaryInputs(transaction);
};

// Reuse only the same outcome and attribution. Prompt/transport revisions do
// not turn unchanged work into another paid request; the recipe can opt out.
const reuseAcceptedSummaries = async (
  transaction: SummaryTransaction,
  now: Date
) => {
  const { rows } = await transaction.execute<{
    work_unit_id: string;
    revision: number;
    outcome: string;
    accepted_at: string;
    activity_day: string;
  }>(sql`
    select distinct on (a.work_unit_id, a.revision)
      a.work_unit_id, a.revision, s.outcome, s.accepted_at, to_char(w.activity_day, 'YYYY-MM-DD') as activity_day
    from ${githubWorkUnitSummaryAttempts} a
    join ${githubWorkUnits} w on w.id = a.work_unit_id
    join ${githubWorkUnitSummaryAttempts} s
      on s.state = 'accepted' and s.repository_id = w.repository_id
      and (s.identity_key = w.identity_key or w.attribution_mode = 'branch_owned_composite')
      and s.attribution_mode = a.attribution_mode
      and s.outcome_digest = a.outcome_digest and s.recipe = a.recipe
    where a.state in ('pending', 'retryable')
      and a.recipe = ${GITHUB_WORK_UNIT_SUMMARY_RECIPE}
      and w.summary_evaluation_digest = w.summary_evaluated_digest
      and w.summary_input_digest = a.summary_input_digest
      and w.outcome_digest = a.outcome_digest and w.attribution_mode = a.attribution_mode
    order by a.work_unit_id, a.revision, s.accepted_at desc
  `);
  const reusable = rows.filter(
    (row) => decodeGitHubWorkUnitSummary(row.outcome) !== null
  );
  if (reusable.length === 0) {
    return new Set<string>();
  }
  await transaction.execute(sql`
    update ${githubWorkUnitSummaryAttempts} a
    set state = 'accepted', outcome = reused.outcome, accepted_at = reused.accepted_at,
        completed_at = ${now.toISOString()}::timestamptz, request_payload = null
    from (values ${sql.join(
      reusable.map(
        (row) => sql`(
      ${row.work_unit_id}::uuid, ${row.revision}::integer, ${row.outcome}::text, ${new Date(row.accepted_at).toISOString()}::timestamptz
    )`
      ),
      sql`, `
    )}) as reused(work_unit_id, revision, outcome, accepted_at)
    where a.work_unit_id = reused.work_unit_id and a.revision = reused.revision
  `);
  return new Set(reusable.map((row) => row.activity_day));
};

const savedAttemptExists = sql<boolean>`exists (
  select 1 from ${githubActivitySnapshots} s
  where s.work_unit_id = ${githubWorkUnitSummaryAttempts.workUnitId}
    and s.outcome_digest = ${githubWorkUnitSummaryAttempts.outcomeDigest}
    and s.summary_input_digest = ${githubWorkUnitSummaryAttempts.summaryInputDigest}
    and s.attribution_mode = ${githubWorkUnitSummaryAttempts.attributionMode}
    and s.payload->>'headline' is null
)`;

const savedUnitForAttempt = async (
  transaction: SummaryTransaction,
  workUnitId: string,
  attempt: NonNullable<Awaited<ReturnType<typeof lockedAttempt>>>
) => {
  const [saved] = await transaction
    .select({ activityDay: githubActivitySnapshots.day })
    .from(githubActivitySnapshots)
    .where(
      and(
        eq(githubActivitySnapshots.workUnitId, workUnitId),
        eq(githubActivitySnapshots.outcomeDigest, attempt.outcomeDigest),
        eq(
          githubActivitySnapshots.summaryInputDigest,
          attempt.summaryInputDigest
        ),
        eq(githubActivitySnapshots.attributionMode, attempt.attributionMode),
        sql`${githubActivitySnapshots.payload}->>'headline' is null`
      )
    )
    .limit(1);
  return saved === undefined
    ? null
    : {
        ...saved,
        attributionMode: attempt.attributionMode,
        outcomeDigest: attempt.outcomeDigest,
        summaryInputDigest: attempt.summaryInputDigest,
        summaryEvaluatedDigest: "saved",
        summaryEvaluationDigest: "saved",
      };
};

const claimSelection = {
  debounceUntil: githubWorkUnitSummaryAttempts.debounceUntil,
  requestPayload: githubWorkUnitSummaryAttempts.requestPayload,
  revision: githubWorkUnitSummaryAttempts.revision,
  startedRequests: githubWorkUnitSummaryAttempts.startedRequests,
  state: githubWorkUnitSummaryAttempts.state,
  workUnitId: githubWorkUnitSummaryAttempts.workUnitId,
};

type ClaimCandidate = Awaited<ReturnType<typeof selectClaimCandidate>>;

async function selectClaimCandidate(
  transaction: SummaryTransaction,
  now: Date,
  usage: SummaryUsage
) {
  // Older work may consume only the elapsed share of today's budget. Recent
  // work can use the remainder immediately instead of waiting behind a backfill.
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsed = now.getTime() - Date.parse(`${usage.day}T00:00:00.000Z`);
  const historicalCapacity =
    usage.dailyStartedRequests <
    Math.floor((MAXIMUM_DAILY_STARTED_REQUESTS * elapsed) / dayMs);
  const [candidate] = await transaction
    .select(claimSelection)
    .from(githubWorkUnitSummaryAttempts)
    .leftJoin(
      githubWorkUnits,
      eq(githubWorkUnitSummaryAttempts.workUnitId, githubWorkUnits.id)
    )
    .where(
      and(
        or(
          gte(githubWorkUnits.activityAt, new Date(now.getTime() - dayMs)),
          sql`${historicalCapacity}`
        ),
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
        or(
          savedAttemptExists,
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
            )
          )
        )
      )
    )
    .orderBy(
      sql`exists (
        select 1 from ${githubWorkUnitSummaryAttempts} s
        where s.state = 'accepted' and s.identity_key = ${githubWorkUnits.identityKey}
          and s.repository_id = ${githubWorkUnits.repositoryId}
          and s.attribution_mode = ${githubWorkUnits.attributionMode}
      )`,
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
      outcomeDigest: githubWorkUnits.outcomeDigest,
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
      identityKey: githubWorkUnitSummaryAttempts.identityKey,
      repositoryId: githubWorkUnitSummaryAttempts.repositoryId,
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
  let unit: Awaited<ReturnType<typeof lockedUnit>> | null = await lockedUnit(
    transaction,
    candidate.workUnitId
  );
  const attempt = await lockedAttempt(
    transaction,
    candidate.workUnitId,
    candidate.revision
  );
  if (
    attempt !== null &&
    (unit === null || !currentUnitMatchesAttempt(unit, attempt))
  ) {
    unit = await savedUnitForAttempt(
      transaction,
      candidate.workUnitId,
      attempt
    );
  }
  if (
    unit === null ||
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
  now: Date,
  errorCode: string | null = null
) => {
  const [updated] = await transaction
    .update(githubWorkUnitSummaryAttempts)
    .set({
      acceptedAt: null,
      errorCode,
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
      .selectDistinct({ day: githubIssueActivityDay.as("day") })
      .from(githubIssues)
      .innerJoin(
        githubRepositories,
        eq(githubIssues.repositoryId, githubRepositories.id)
      )
      .where(
        and(
          inArray(
            githubIssues.authorUserId,
            Object.values(TRACKED_GITHUB_USER_IDS)
          ),
          inArray(githubRepositories.visibility, [
            "public",
            "private",
            "internal",
          ])
        )
      )
      .orderBy(({ day }) => desc(day))
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
  const canStart = hasRequestCapacity(await readSummaryUsage(transaction, now));
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
            sql`${canStart}`,
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
                sql`${canStart}`,
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
    const reused = await reuseAcceptedSummaries(transaction, now);
    const filled = await fillSavedGitHubSummaries(transaction);
    const usage = await readSummaryUsage(transaction, now);
    let claim: GitHubWorkUnitSummaryClaim | null = null;
    if (hasRequestCapacity(usage)) {
      const candidate = await selectClaimCandidate(transaction, now, usage);
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
    await revisePublicSummaryHead(
      transaction,
      now,
      initialPageDays,
      filled || [...reused].some((day) => initialPageDays.has(day))
        ? { feedRevisionChanged: true, initialPageContentChanged: true }
        : undefined
    );
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
    const attempt = await lockedAttempt(
      transaction,
      claim.workUnitId,
      claim.revision
    );
    if (attempt === null || !leaseMatchesClaim(attempt, claim)) {
      await settleHead();
      return { accepted: false };
    }
    const initialPageChanged =
      unit !== null &&
      unitMatchesAttempt(unit, attempt) &&
      initialPageDays.has(unit.activityDay);
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
    const filled = await fillSavedGitHubSummaries(transaction);
    await settleHead(
      initialPageChanged || filled
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
  deferredAt = new Date(),
  errorCode: string | null = null
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
      await terminalizeLockedAttempt(transaction, claim, now, errorCode);
      await settleHead();
      return "terminal";
    }
    const remainsCurrent =
      (unit !== null && currentUnitMatchesAttempt(unit, attempt)) ||
      (await savedUnitForAttempt(transaction, claim.workUnitId, attempt)) !==
        null;
    const [deferred] = await transaction
      .update(githubWorkUnitSummaryAttempts)
      .set({
        debounceUntil: retry,
        errorCode,
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

/** Invalid persisted input cannot improve by repeating a provider request. */
export const terminalGitHubWorkUnitSummary = async (
  uncheckedClaim: GitHubWorkUnitSummaryClaim,
  terminalAt = new Date(),
  errorCode: string | null = null
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
        ? await terminalizeLockedAttempt(transaction, claim, now, errorCode)
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
    const reused = await reuseAcceptedSummaries(transaction, now);
    const filled = await fillSavedGitHubSummaries(transaction);
    const initialPageDays = await readInitialPageDays(transaction);
    return await revisePublicSummaryHead(
      transaction,
      now,
      initialPageDays,
      filled || [...reused].some((day) => initialPageDays.has(day))
        ? { feedRevisionChanged: true, initialPageContentChanged: true }
        : undefined
    );
  });
};
