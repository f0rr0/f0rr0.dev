import { closeDatabase } from "../src/db/client";
import { env } from "../src/env";
import { runGitHubActivityWorker } from "../src/lib/github-activity-worker";
import { MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE } from "../src/lib/github-activity-worker-core";
import {
  githubBackfillRequestSeriesFrom,
  splitGitHubBackfillRequest,
} from "../src/lib/github-backfill-core";
import type { GitHubBackfillRequest } from "../src/lib/github-backfill-core";
import { queueGitHubBackfill } from "../src/lib/github-commits";

const CAPACITY_ERROR_NAME = "GitHubBackfillCapacityError";
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

interface BackfillTotals {
  duplicates: number;
  observations: number;
  repositories: number;
  requests: number;
}

const argumentValues = (arguments_: readonly string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      throw new TypeError("The backfill command arguments are invalid.");
    }
    values.set(name.slice(2), value);
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

const backfillArgumentsFrom = (
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
  if (env.OPENAI_API_KEY === undefined) {
    throw new Error("OPENAI_API_KEY is not configured.");
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

const requestValue = (
  input: BackfillArguments,
  startDate: string,
  endDate: string
) => ({
  account: input.account,
  endDate,
  repositoryId: input.repositoryId,
  startDate,
});

const queueRequest = async (
  request: GitHubBackfillRequest,
  deadlineAt: number,
  totals: BackfillTotals
): Promise<void> => {
  if (Date.now() >= deadlineAt) {
    throw new Error(
      "The Action time budget expired before every date chunk was queued; rerun the same range to continue idempotently."
    );
  }
  const result = await queueGitHubBackfill(request);
  totals.duplicates += result.duplicates;
  totals.observations += result.observations;
  totals.repositories += result.repositories;
  totals.requests += 1;
  if (result.failedAccounts.length === 0) {
    process.stdout.write(
      `Queued ${request.startDate} through ${request.endDate}: ${String(result.observations)} observations (${String(result.duplicates)} already durable).\n`
    );
    return;
  }
  const capacityOnly = result.failedAccounts.every(
    ({ error }) => error === CAPACITY_ERROR_NAME
  );
  const split = capacityOnly ? splitGitHubBackfillRequest(request) : null;
  if (split !== null) {
    process.stdout.write(
      `Splitting ${request.startDate} through ${request.endDate} to preserve the per-request observation bound.\n`
    );
    await queueRequest(split[0], deadlineAt, totals);
    await queueRequest(split[1], deadlineAt, totals);
    return;
  }
  const failures = result.failedAccounts
    .map(({ account, error }) => `${account}:${error}`)
    .join(", ");
  throw new Error(
    `Backfill queueing failed for ${request.startDate} through ${request.endDate} (${failures}).`
  );
};

const claimedItems = (
  result: Awaited<ReturnType<typeof runGitHubActivityWorker>>
) =>
  result.commits.claimed +
  result.observations.claimed +
  result.pullRequestDiscovery.claimed +
  result.pullRequests.claimed +
  result.summaries.claimed;

const processQueue = async (deadlineAt: number) => {
  let passes = 0;
  let totalClaimed = 0;
  while (Date.now() + WORKER_CLEANUP_MARGIN_MS < deadlineAt) {
    const maximumDurationMs = Math.min(
      WORKER_PASS_DURATION_MS,
      deadlineAt - Date.now() - WORKER_CLEANUP_MARGIN_MS
    );
    if (maximumDurationMs < 1) {
      break;
    }
    const result = await runGitHubActivityWorker({
      commitLimit: MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE,
      maximumDurationMs,
      observationLimit: MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE,
      pullRequestDiscoveryLimit: MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE,
      summaryLimit: MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE,
    });
    const claimed = claimedItems(result);
    passes += 1;
    totalClaimed += claimed;
    process.stdout.write(
      `Worker pass ${String(passes)} claimed ${String(claimed)} items.\n`
    );
    if (claimed === 0) {
      return { drained: true, passes, totalClaimed };
    }
  }
  return { drained: false, passes, totalClaimed };
};

const main = async () => {
  const input = backfillArgumentsFrom(process.argv.slice(2));
  requireEnvironment(input);
  const requests = githubBackfillRequestSeriesFrom(
    requestValue(input, input.startDate, input.endDate)
  );
  if (requests === null) {
    throw new TypeError(
      "The account, repository, or date range is invalid; dates must use YYYY-MM-DD and cannot be in the future."
    );
  }
  const deadlineAt = Date.now() + input.maximumMinutes * 60_000;
  const totals: BackfillTotals = {
    duplicates: 0,
    observations: 0,
    repositories: 0,
    requests: 0,
  };
  try {
    for (const request of requests) {
      await queueRequest(request, deadlineAt, totals);
    }
    const worker = await processQueue(deadlineAt);
    process.stdout.write(`${JSON.stringify({ queued: totals, worker })}\n`);
    if (!worker.drained) {
      process.stdout.write(
        "The Action time budget ended with durable work remaining; Supabase Cron will continue it.\n"
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
