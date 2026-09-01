import type { GitHubFactualWorkerBacklog } from "@/lib/github-backfill-store";
import {
  repositoryIdFrom,
  TRACKED_GITHUB_ACCOUNTS,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import type { GitHubCurrentHeadBackfillResult } from "@/lib/github-direct-backfill";
import type { GitHubPullRequestBackfillResult } from "@/lib/github-pull-request-backfill";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMUM_BACKFILL_DAYS = 31;
const MAXIMUM_BROAD_BACKFILL_LOOKBACK_DAYS = 62;
const MINIMUM_GITHUB_DATE = Date.UTC(1970, 0, 1);
const MAXIMUM_GITHUB_DATE = Date.UTC(2099, 11, 31);

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const utcDayFrom = (value: unknown) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

export interface GitHubBackfillRequest {
  accounts: readonly TrackedGitHubAccount[];
  endDate: string;
  repositoryId: string | null;
  sinceAt: Date;
  startDate: string;
  untilAt: Date;
}

export const githubBackfillRequestFrom = (
  value: unknown,
  now = new Date()
): GitHubBackfillRequest | null => {
  if (!isObject(value)) {
    return null;
  }
  const sinceAt = utcDayFrom(value.startDate);
  const endDay = utcDayFrom(value.endDate);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  if (
    sinceAt === null ||
    endDay === null ||
    sinceAt > endDay ||
    sinceAt.getTime() < MINIMUM_GITHUB_DATE ||
    endDay.getTime() > Math.min(MAXIMUM_GITHUB_DATE, today.getTime())
  ) {
    return null;
  }
  const dayCount = (endDay.getTime() - sinceAt.getTime()) / DAY_MS + 1;
  if (dayCount > MAXIMUM_BACKFILL_DAYS) {
    return null;
  }
  const account =
    value.account === "all" ? "all" : trackedGitHubAccountFrom(value.account);
  if (account === null) {
    return null;
  }
  const rawRepositoryId =
    typeof value.repositoryId === "string" ? value.repositoryId.trim() : "";
  const repositoryId =
    rawRepositoryId.length === 0 ? null : repositoryIdFrom(rawRepositoryId);
  if (rawRepositoryId.length > 0 && repositoryId === null) {
    return null;
  }
  const lookbackDays = (today.getTime() - sinceAt.getTime()) / DAY_MS + 1;
  if (
    repositoryId === null &&
    lookbackDays > MAXIMUM_BROAD_BACKFILL_LOOKBACK_DAYS
  ) {
    return null;
  }
  const accounts =
    account === "all" ? TRACKED_GITHUB_ACCOUNTS : ([account] as const);
  return {
    accounts,
    endDate: endDay.toISOString().slice(0, 10),
    repositoryId,
    sinceAt,
    startDate: sinceAt.toISOString().slice(0, 10),
    untilAt: new Date(endDay.getTime() + DAY_MS - 1),
  };
};

type GitHubBackfillStopReason =
  | "complete"
  | "deadline"
  | "deferred"
  | "provider_retry";

export interface GitHubBackfillIdentityResult {
  complete: boolean;
  retryAt: Date | null;
  stopReason: GitHubBackfillStopReason;
}

export interface GitHubBackfillAccountInventory {
  account: TrackedGitHubAccount;
  identity: GitHubBackfillIdentityResult;
  pullRequests: GitHubPullRequestBackfillResult | null;
  repositoryInventory: GitHubBackfillIdentityResult | null;
}

export interface GitHubBackfillInventory {
  accounts: readonly GitHubBackfillAccountInventory[];
  currentHeads: GitHubCurrentHeadBackfillResult | null;
  factualDrain: GitHubBackfillFactualDrainResult | null;
}

export interface GitHubBackfillFactualDrainResult {
  claimed: number;
  complete: boolean;
  completed: number;
  passes: number;
  pending: GitHubFactualWorkerBacklog["pending"];
  projectionRuns: number;
  retryAt: Date | null;
  stopReason: GitHubBackfillStopReason;
  unavailable: number;
}

type GitHubBackfillOutcome = "complete" | "completed_with_gaps" | "incomplete";

interface GitHubBackfillInterruption {
  account: TrackedGitHubAccount | null;
  retryAt: string | null;
  stage:
    | "identity"
    | "repository_inventory"
    | "pull_requests"
    | "current_heads"
    | "factual_drain";
  stopReason: Exclude<GitHubBackfillStopReason, "complete">;
}

const interruptionFrom = (
  account: TrackedGitHubAccount | null,
  stage: GitHubBackfillInterruption["stage"],
  result: GitHubBackfillIdentityResult
): GitHubBackfillInterruption | null => {
  if (result.complete) {
    if (result.stopReason !== "complete" || result.retryAt !== null) {
      throw new TypeError(
        "A completed GitHub discovery stage is inconsistent."
      );
    }
    return null;
  }
  if (result.stopReason === "complete") {
    throw new TypeError(
      "An incomplete GitHub discovery stage is inconsistent."
    );
  }
  return {
    account,
    retryAt: result.retryAt?.toISOString() ?? null,
    stage,
    stopReason: result.stopReason,
  };
};

const interruptionsFrom = (inventory: GitHubBackfillInventory) => {
  const interruptions: GitHubBackfillInterruption[] = [];
  for (const account of inventory.accounts) {
    const stages = [
      ["identity", account.identity],
      ["repository_inventory", account.repositoryInventory],
      ["pull_requests", account.pullRequests],
    ] as const;
    for (const [stage, result] of stages) {
      if (result === null) {
        continue;
      }
      const interruption = interruptionFrom(account.account, stage, result);
      if (interruption !== null) {
        interruptions.push(interruption);
      }
    }
  }
  if (inventory.currentHeads !== null) {
    const interruption = interruptionFrom(
      null,
      "current_heads",
      inventory.currentHeads
    );
    if (interruption !== null) {
      interruptions.push(interruption);
    }
  }
  if (inventory.factualDrain !== null) {
    const interruption = interruptionFrom(
      null,
      "factual_drain",
      inventory.factualDrain
    );
    if (interruption !== null) {
      interruptions.push(interruption);
    }
  }
  return interruptions;
};

const hasCompleteTraversal = (inventory: GitHubBackfillInventory) =>
  inventory.accounts.length > 0 &&
  inventory.accounts.every(
    (account) =>
      account.identity.complete &&
      account.repositoryInventory?.complete === true &&
      account.pullRequests?.complete === true
  ) &&
  inventory.currentHeads?.complete === true &&
  inventory.factualDrain?.complete === true;

export const githubBackfillDiscoveryReportFrom = (input: {
  deadlineAt: number;
  inventory: GitHubBackfillInventory;
}) => {
  const deadline = new Date(input.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    throw new TypeError("The GitHub discovery deadline is invalid.");
  }
  const interruptions = interruptionsFrom(input.inventory);
  const complete = hasCompleteTraversal(input.inventory);
  if (!complete && interruptions.length === 0) {
    throw new TypeError("Incomplete GitHub discovery has no terminal reason.");
  }
  const coverageGaps = {
    factualWorker: input.inventory.factualDrain?.unavailable ?? 0,
    pullRequests: 0,
  };
  for (const inventory of input.inventory.accounts) {
    coverageGaps.pullRequests +=
      inventory.pullRequests?.unavailablePullRequests ?? 0;
  }
  const totalCoverageGaps =
    coverageGaps.factualWorker + coverageGaps.pullRequests;
  const outcome: GitHubBackfillOutcome = complete
    ? totalCoverageGaps === 0
      ? "complete"
      : "completed_with_gaps"
    : "incomplete";
  return {
    complete,
    coverageGaps: { ...coverageGaps, total: totalCoverageGaps },
    deadlineAt: deadline.toISOString(),
    discoveryCoverage:
      "authored_pull_requests_current_ref_generations_and_factual_projection" as const,
    interruptions,
    inventory: input.inventory,
    outcome,
  };
};
