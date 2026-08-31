import { setTimeout as delay } from "node:timers/promises";

import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import {
  githubActivityAuditRequestFrom,
  runGitHubActivityAudit,
} from "../src/lib/github-activity-audit";
import type { GitHubActivityAuditReport } from "../src/lib/github-activity-audit";
import { runGitHubActivityWorker } from "../src/lib/github-activity-worker";
import { ensureGitHubEvidenceIntegrity } from "../src/lib/github-activity-worker-store";
import { GitHubRequestDeadlineError } from "../src/lib/github-api";
import {
  GITHUB_BACKFILL_WORKER_BATCH_SIZE,
  githubBackfillCompletionFrom,
  githubBackfillDiscoveryCompleteFrom,
  githubBackfillExitCodeFrom,
  githubBackfillOutcomeFrom,
  githubBackfillProcessingCountsFrom,
  githubBackfillProcessingMadeProgress,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core";
import type {
  GitHubBackfillProcessingCounts,
  GitHubBackfillRequest,
} from "../src/lib/github-backfill-core";
import { assertGitHubTokenIdentity } from "../src/lib/github-commits";
import type { TrackedGitHubAccount } from "../src/lib/github-commits-core";
import { backfillGitHubCommitsFromCurrentRefs } from "../src/lib/github-direct-backfill";
import { backfillGitHubPullRequests } from "../src/lib/github-pull-request-backfill";

const MAXIMUM_ACTION_MINUTES = 330;
const INCONCLUSIVE_AUDIT_RETRY_DELAYS_MS = [2000, 5000, 10_000] as const;
const WORKER_CLEANUP_MARGIN_MS = 30_000;
const WORKER_PASS_DURATION_MS = 240_000;

interface BackfillArguments {
  account: string;
  endDate: string;
  maximumMinutes: number;
  repositoryId: string;
  startDate: string;
}

const argumentValues = (arguments_: readonly string[]) => {
  const allowed = new Set([
    "account",
    "end-date",
    "maximum-minutes",
    "repository-id",
    "start-date",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    const key = name?.startsWith("--") ? name.slice(2) : null;
    if (
      key === null ||
      value === undefined ||
      !allowed.has(key) ||
      values.has(key)
    ) {
      throw new TypeError("The backfill command arguments are invalid.");
    }
    values.set(key, value);
  }
  return values;
};

const requiredArgument = (
  values: ReadonlyMap<string, string>,
  name: string
) => {
  const value = values.get(name)?.trim();
  if (value === undefined || value.length === 0) {
    throw new TypeError(`--${name} is required.`);
  }
  return value;
};

export const backfillArgumentsFrom = (
  arguments_: readonly string[]
): BackfillArguments => {
  const values = argumentValues(arguments_);
  const maximumMinutesValue = requiredArgument(values, "maximum-minutes");
  if (!/^\d+$/.test(maximumMinutesValue)) {
    throw new TypeError("--maximum-minutes must be an integer.");
  }
  const maximumMinutes = Number(maximumMinutesValue);
  if (
    !Number.isSafeInteger(maximumMinutes) ||
    maximumMinutes < 1 ||
    maximumMinutes > MAXIMUM_ACTION_MINUTES
  ) {
    throw new RangeError(
      `--maximum-minutes must be from 1 through ${MAXIMUM_ACTION_MINUTES}.`
    );
  }
  return {
    account: requiredArgument(values, "account"),
    endDate: requiredArgument(values, "end-date"),
    maximumMinutes,
    repositoryId: values.get("repository-id")?.trim() ?? "",
    startDate: requiredArgument(values, "start-date"),
  };
};

const requireEnvironment = (input: BackfillArguments) => {
  if (env.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const accounts =
    input.account === "all" ? ["f0rr0", "yuppiestechdev"] : [input.account];
  if (accounts.includes("f0rr0") && env.GITHUB_F0RR0_TOKEN === undefined) {
    throw new Error("GITHUB_F0RR0_TOKEN is not configured.");
  }
  if (
    accounts.includes("yuppiestechdev") &&
    env.GITHUB_YUPPIESTECHDEV_TOKEN === undefined
  ) {
    throw new Error("GITHUB_YUPPIESTECHDEV_TOKEN is not configured.");
  }
};

const requestValue = (input: BackfillArguments) => ({
  account: input.account,
  endDate: input.endDate,
  repositoryId: input.repositoryId,
  startDate: input.startDate,
});

interface BackfillProcessingTotals extends GitHubBackfillProcessingCounts {
  passes: number;
  stopReason:
    | "audit_failed"
    | "no_immediately_claimable_work"
    | "pipeline_stalled"
    | "retry_outside_budget"
    | "time_budget";
}

const emptyProcessingCounts = (): GitHubBackfillProcessingCounts => ({
  aliases: 0,
  canonicalizationAttempts: 0,
  canonicalized: 0,
  claimed: 0,
  deferred: 0,
  failed: 0,
  processed: 0,
  unavailable: 0,
});

const addProcessingCounts = (
  totals: GitHubBackfillProcessingCounts,
  counts: GitHubBackfillProcessingCounts
) => {
  totals.aliases += counts.aliases;
  totals.canonicalizationAttempts += counts.canonicalizationAttempts;
  totals.canonicalized += counts.canonicalized;
  totals.claimed += counts.claimed;
  totals.deferred += counts.deferred;
  totals.failed += counts.failed;
  totals.processed += counts.processed;
  totals.unavailable += counts.unavailable;
};

const deadlineErrorAfter = async (
  milliseconds: number,
  signal: AbortSignal
): Promise<never> => {
  await delay(milliseconds, undefined, { signal });
  throw new GitHubRequestDeadlineError();
};

export const runBeforeDeadline = async <Value>(
  operation: Promise<Value>,
  deadlineAt: number
): Promise<Value> => {
  const remainingMilliseconds = Math.floor(deadlineAt - Date.now());
  if (remainingMilliseconds < 1) {
    throw new GitHubRequestDeadlineError();
  }
  const abortController = new AbortController();
  const timeout = deadlineErrorAfter(
    remainingMilliseconds,
    abortController.signal
  );
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    abortController.abort();
  }
};

const processQueue = async (
  deadlineAt: number,
  request: GitHubBackfillRequest,
  completedPasses = 0
): Promise<BackfillProcessingTotals> => {
  let passes = 0;
  const totals = emptyProcessingCounts();
  while (Date.now() + WORKER_CLEANUP_MARGIN_MS < deadlineAt) {
    const maximumDurationMs = Math.min(
      WORKER_PASS_DURATION_MS,
      deadlineAt - Date.now() - WORKER_CLEANUP_MARGIN_MS
    );
    if (maximumDurationMs < 1) {
      break;
    }
    const result = await runBeforeDeadline(
      runGitHubActivityWorker({
        accounts: request.accounts,
        commitLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
        maximumDurationMs,
        observationLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
        pullRequestDiscoveryLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
        pullRequestLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
        pullRequestSignalLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
        scope: {
          repositoryId: request.repositoryId,
          sinceAt: request.sinceAt,
          untilAt: request.untilAt,
        },
        summaryLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      }),
      deadlineAt
    );
    const counts = githubBackfillProcessingCountsFrom(result);
    passes += 1;
    addProcessingCounts(totals, counts);
    process.stdout.write(
      `Worker pass ${String(completedPasses + passes)}: claimed ${String(counts.claimed)}, processed ${String(counts.processed)}, deferred ${String(counts.deferred)}, unavailable ${String(counts.unavailable)}, failed ${String(counts.failed)}, canonicalized ${String(counts.canonicalized)}/${String(counts.canonicalizationAttempts)}, aliases ${String(counts.aliases)}.\n`
    );
    if (!githubBackfillProcessingMadeProgress(counts)) {
      return {
        ...totals,
        passes,
        stopReason: "no_immediately_claimable_work",
      };
    }
  }
  return { ...totals, passes, stopReason: "time_budget" };
};

const combineProcessingTotals = (
  total: BackfillProcessingTotals,
  next: BackfillProcessingTotals
): BackfillProcessingTotals => {
  addProcessingCounts(total, next);
  total.passes += next.passes;
  total.stopReason = next.stopReason;
  return total;
};

export const backfillRetryWaitMillisecondsFrom = (
  audits: readonly Pick<GitHubActivityAuditReport, "pipeline" | "status">[],
  deadlineAt: number,
  now = Date.now(),
  inconclusiveRetries = 0
) => {
  if (
    audits.length === 0 ||
    audits.some(
      ({ status }) =>
        status !== "inconclusive" &&
        status !== "pipeline_incomplete" &&
        status !== "stored_projection_verified"
    )
  ) {
    return null;
  }
  if (audits.some(({ status }) => status === "inconclusive")) {
    const retryDelay = INCONCLUSIVE_AUDIT_RETRY_DELAYS_MS[inconclusiveRetries];
    return retryDelay !== undefined &&
      now + retryDelay + WORKER_CLEANUP_MARGIN_MS < deadlineAt
      ? retryDelay
      : null;
  }
  const retryTimes = audits.flatMap(({ pipeline, status }) => {
    if (status !== "pipeline_incomplete" || pipeline.earliestRetryAt === null) {
      return [];
    }
    const timestamp = new Date(pipeline.earliestRetryAt).getTime();
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("The GitHub audit retry timestamp is invalid.");
    }
    return [timestamp];
  });
  if (retryTimes.length === 0) {
    return null;
  }
  const waitMilliseconds = Math.max(1000, Math.min(...retryTimes) - now);
  return now + waitMilliseconds + WORKER_CLEANUP_MARGIN_MS < deadlineAt
    ? waitMilliseconds
    : null;
};

const tokenFor = (account: TrackedGitHubAccount) => {
  const token =
    account === "f0rr0"
      ? env.GITHUB_F0RR0_TOKEN
      : env.GITHUB_YUPPIESTECHDEV_TOKEN;
  if (token === undefined) {
    throw new Error(`The GitHub token for ${account} is not configured.`);
  }
  return token;
};

const logAccount = (account: TrackedGitHubAccount, message: string) => {
  process.stdout.write(`[${account}] ${message}\n`);
};

const runScopedAudits = async (
  request: GitHubBackfillRequest,
  deadlineAt: number
) => {
  // Provider discovery can keep this process alive for minutes. Give each
  // strict projection audit a fresh connection instead of reusing a client
  // that may have crossed a pooler/network idle boundary.
  await closeDatabase();
  const auditNow = new Date();
  return await runBeforeDeadline(
    Promise.all(
      request.accounts.map(async (account) => {
        const auditRequest = githubActivityAuditRequestFrom(
          {
            account,
            endDate: request.endDate,
            repositoryId: request.repositoryId,
            startDate: request.startDate,
          },
          auditNow
        );
        if (auditRequest === null) {
          throw new Error("The completed backfill audit scope is invalid.");
        }
        return await runGitHubActivityAudit(auditRequest);
      })
    ),
    deadlineAt
  );
};

const main = async () => {
  const input = backfillArgumentsFrom(process.argv.slice(2));
  requireEnvironment(input);
  const request = githubBackfillRequestFrom(requestValue(input));
  if (request === null) {
    throw new TypeError(
      "The backfill input is invalid: use an inclusive UTC range of at most 31 days, with YYYY-MM-DD dates ending today or earlier and a tracked account. Broad runs must start within the last 62 UTC days; use a numeric repository ID for older recovery."
    );
  }
  const { sinceAt, untilAt } = request;
  const deadlineAt = Date.now() + input.maximumMinutes * 60_000;
  try {
    const evidenceRecovery = await runBeforeDeadline(
      ensureGitHubEvidenceIntegrity(new Date(), { deadlineAt }),
      deadlineAt
    );
    const inventories = await runBeforeDeadline(
      Promise.all(
        request.accounts.map(async (account) => {
          const token = tokenFor(account);
          await assertGitHubTokenIdentity(account, token, { deadlineAt });
          logAccount(account, "authenticated token identity");
          const pullRequests = await backfillGitHubPullRequests({
            account,
            deadlineAt,
            onRateLimitWait: (retryAt) => {
              logAccount(
                account,
                `PR rate limit resets at ${retryAt.toISOString()}; waiting within budget`
              );
            },
            repositoryId: request.repositoryId,
            sinceAt,
            token,
            untilAt,
          });
          logAccount(
            account,
            `authored pull requests: selected ${String(pullRequests.selectedAuthoredPullRequests)} updated in the window from ${String(pullRequests.authoredPullRequestsLifetime)} lifetime rows across ${String(pullRequests.authoredPullRequestPages)} pages`
          );
          logAccount(
            account,
            `pull requests: ${String(pullRequests.pullRequests)} persisted, ${String(pullRequests.skippedPullRequests)} outside the work window, ${String(pullRequests.unavailablePullRequests)} unavailable PRs and ${String(pullRequests.unavailableRepositories)} unavailable repositories after ${String(pullRequests.scannedPullRequests)} candidates (${pullRequests.stopReason})`
          );
          if (Date.now() + WORKER_CLEANUP_MARGIN_MS >= deadlineAt) {
            return { account, direct: null, pullRequests };
          }
          const direct = await backfillGitHubCommitsFromCurrentRefs({
            account,
            deadlineAt,
            onRateLimitWait: (retryAt) => {
              logAccount(
                account,
                `current-ref rate limit resets at ${retryAt.toISOString()}; waiting within budget`
              );
            },
            repositoryId: request.repositoryId,
            sinceAt,
            token,
            untilAt,
          });
          logAccount(
            account,
            `current refs: ${String(direct.uniqueCommits)} unique commits from ${String(direct.heads)} distinct heads, ${String(direct.unavailableRepositories)} unavailable repositories (${direct.stopReason})`
          );
          return { account, direct, pullRequests };
        })
      ),
      deadlineAt
    );
    const boundedDiscoveryComplete =
      githubBackfillDiscoveryCompleteFrom(inventories);
    const worker: BackfillProcessingTotals = {
      ...emptyProcessingCounts(),
      passes: 0,
      stopReason: "no_immediately_claimable_work",
    };
    let audits: readonly GitHubActivityAuditReport[] = [];
    let inconclusiveAuditRetries = 0;
    let completion = githubBackfillCompletionFrom({
      auditStatuses: [],
      boundedDiscoveryComplete,
    });
    while (true) {
      const pass = await processQueue(deadlineAt, request, worker.passes);
      combineProcessingTotals(worker, pass);
      audits = await runScopedAudits(request, deadlineAt);
      completion = githubBackfillCompletionFrom({
        auditStatuses: audits.map(({ status }) => status),
        boundedDiscoveryComplete,
      });
      if (completion.complete || !boundedDiscoveryComplete) {
        break;
      }
      if (pass.stopReason === "time_budget") {
        worker.stopReason = "time_budget";
        break;
      }
      const hasInconclusiveAudit = audits.some(
        ({ status }) => status === "inconclusive"
      );
      const retryWait = backfillRetryWaitMillisecondsFrom(
        audits,
        deadlineAt,
        Date.now(),
        inconclusiveAuditRetries
      );
      if (retryWait === null) {
        if (
          audits.some(
            ({ status }) => status === "inconclusive" || status === "mismatch"
          )
        ) {
          worker.stopReason = "audit_failed";
        } else if (
          audits.some(({ pipeline }) => pipeline.earliestRetryAt !== null)
        ) {
          worker.stopReason = "retry_outside_budget";
        } else {
          worker.stopReason = "pipeline_stalled";
        }
        break;
      }
      inconclusiveAuditRetries = hasInconclusiveAudit
        ? inconclusiveAuditRetries + 1
        : 0;
      process.stdout.write(
        `No scoped work is claimable; waiting ${String(Math.ceil(retryWait / 1000))} seconds for the next durable retry within the Action budget.\n`
      );
      await delay(retryWait);
    }
    const coverageGaps = {
      providerPullRequests: inventories.reduce(
        (total, { pullRequests }) =>
          total + pullRequests.unavailablePullRequests,
        0
      ),
      providerRepositories: inventories.reduce(
        (total, { direct, pullRequests }) =>
          total +
          (direct?.unavailableRepositories ?? 0) +
          pullRequests.unavailableRepositories,
        0
      ),
      storedPipeline: audits.reduce(
        (total, audit) => total + audit.coverage.gaps.total,
        0
      ),
    };
    const totalCoverageGaps =
      coverageGaps.providerPullRequests +
      coverageGaps.providerRepositories +
      coverageGaps.storedPipeline;
    const outcome = githubBackfillOutcomeFrom(completion, totalCoverageGaps);
    process.stdout.write(
      `${JSON.stringify({ audits, boundedDiscoveryComplete, complete: completion.complete, coverageGaps: { ...coverageGaps, total: totalCoverageGaps }, discoveryCoverage: request.repositoryId === null ? "repositories_pushed_and_pull_requests_updated_since_window_start" : "explicit_repository", evidenceRecovery: evidenceRecovery.status, inventories, outcome, pipelineSettled: completion.pipelineSettled, processing: worker })}\n`
    );
    process.stdout.write(
      "Processing totals cover the requested account, date window, and optional repository scope; boundedDiscoveryComplete reports discovery and pipelineSettled reports scoped stored projection readiness.\n"
    );
    if (completion.complete && totalCoverageGaps > 0) {
      process.stdout.write(
        `The bounded backfill completed with ${String(totalCoverageGaps)} explicit coverage gaps; inspect coverageGaps and audit coverage before interpreting totals.\n`
      );
    } else if (worker.stopReason === "time_budget") {
      process.stdout.write(
        "The Action time budget ended with scoped work still unsettled.\n"
      );
    } else if (!completion.complete) {
      process.stdout.write(
        `The scoped pipeline stopped as ${worker.stopReason}; its audit and earliestRetryAt fields describe the remaining work.\n`
      );
    }
    if (githubBackfillExitCodeFrom(completion) !== 0) {
      if (boundedDiscoveryComplete) {
        throw new Error(
          `The bounded discovery finished, but the stored pipeline/projection is not settled for every requested scope (${audits.map(({ scope, status }) => `${scope.account}:${status}`).join(", ")}; stop reason: ${worker.stopReason}). Durable evidence is safe; inspect each audit's earliestRetryAt and failed checks before rerunning.`
        );
      }
      throw new Error(
        "The bounded GitHub discovery did not finish within the provider/time budget. Persisted evidence is safe; rerun the same inputs idempotently. If one recently active repository dominates the run, dispatch its numeric --repository-id separately."
      );
    }
  } finally {
    await closeDatabase();
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "UnknownError";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
