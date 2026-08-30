import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import { runGitHubActivityWorker } from "../src/lib/github-activity-worker";
import { ensureGitHubEvidenceIntegrity } from "../src/lib/github-activity-worker-store";
import {
  GITHUB_BACKFILL_WORKER_BATCH_SIZE,
  githubBackfillProcessingCountsFrom,
  githubBackfillRequestFrom,
} from "../src/lib/github-backfill-core";
import type { GitHubBackfillProcessingCounts } from "../src/lib/github-backfill-core";
import { assertGitHubTokenIdentity } from "../src/lib/github-commits";
import type { TrackedGitHubAccount } from "../src/lib/github-commits-core";
import { backfillGitHubCommitsFromCurrentRefs } from "../src/lib/github-direct-backfill";
import { backfillGitHubPullRequests } from "../src/lib/github-pull-request-backfill";

const MAXIMUM_ACTION_MINUTES = 330;
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
  stopReason: "no_immediately_claimable_work" | "time_budget";
}

const emptyProcessingCounts = (): GitHubBackfillProcessingCounts => ({
  aliases: 0,
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
  totals.claimed += counts.claimed;
  totals.deferred += counts.deferred;
  totals.failed += counts.failed;
  totals.processed += counts.processed;
  totals.unavailable += counts.unavailable;
};

const processQueue = async (
  deadlineAt: number
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
    const result = await runGitHubActivityWorker({
      commitLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      maximumDurationMs,
      observationLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      pullRequestDiscoveryLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      pullRequestLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      pullRequestSignalLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
      summaryLimit: GITHUB_BACKFILL_WORKER_BATCH_SIZE,
    });
    const counts = githubBackfillProcessingCountsFrom(result);
    passes += 1;
    addProcessingCounts(totals, counts);
    process.stdout.write(
      `Worker pass ${String(passes)}: claimed ${String(counts.claimed)}, processed ${String(counts.processed)}, deferred ${String(counts.deferred)}, unavailable ${String(counts.unavailable)}, failed ${String(counts.failed)}, aliases ${String(counts.aliases)}.\n`
    );
    if (counts.claimed === 0) {
      return {
        ...totals,
        passes,
        stopReason: "no_immediately_claimable_work",
      };
    }
  }
  return { ...totals, passes, stopReason: "time_budget" };
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

const main = async () => {
  const input = backfillArgumentsFrom(process.argv.slice(2));
  requireEnvironment(input);
  const request = githubBackfillRequestFrom(requestValue(input));
  if (request === null) {
    throw new TypeError(
      "The backfill input is invalid: --start-date is the earliest included UTC day and must not follow --end-date, the latest included UTC day. Dates must use YYYY-MM-DD, the end cannot be in the future, and the account and repository ID must be valid."
    );
  }
  const { sinceAt, untilAt } = request;
  try {
    const evidenceRecovery = await ensureGitHubEvidenceIntegrity();
    const deadlineAt = Date.now() + input.maximumMinutes * 60_000;
    const inventories = await Promise.all(
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
          `pull requests: ${String(pullRequests.pullRequests)} persisted after ${String(pullRequests.scannedPullRequests)} candidates (${pullRequests.stopReason})`
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
          `current refs: ${String(direct.uniqueCommits)} unique commits from ${String(direct.heads)} distinct heads (${direct.stopReason})`
        );
        return { account, direct, pullRequests };
      })
    );
    const inventoryComplete = inventories.every(
      ({ direct, pullRequests }) =>
        direct?.complete === true && pullRequests.complete
    );
    const worker = await processQueue(deadlineAt);
    process.stdout.write(
      `${JSON.stringify({ evidenceRecovery: evidenceRecovery.status, inventories, inventoryComplete, processing: worker })}\n`
    );
    process.stdout.write(
      "Processing totals cover the shared global queue; inventoryComplete proves only that this invocation finished both selected discovery passes.\n"
    );
    if (worker.stopReason === "time_budget") {
      process.stdout.write(
        "The Action time budget ended; durable or retry-delayed work may remain, and Supabase Cron will continue it.\n"
      );
    } else {
      process.stdout.write(
        "No work was immediately claimable; durable retry-delayed work may still remain for Supabase Cron.\n"
      );
    }
    if (!inventoryComplete) {
      throw new Error(
        "The GitHub inventory did not finish within the provider/time budget. Persisted evidence is safe; rerun the same inputs idempotently. If an all-repository scan repeatedly exceeds 330 minutes, dispatch one numeric --repository-id at a time to shard the inventory."
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
