import {
  repositoryIdFrom,
  TRACKED_GITHUB_ACCOUNTS,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MINIMUM_GITHUB_DATE = Date.UTC(1970, 0, 1);
const MAXIMUM_GITHUB_DATE = Date.UTC(2099, 11, 31);

export const GITHUB_BACKFILL_WORKER_BATCH_SIZE = 8;

interface GitHubBackfillWorkerStageCounts {
  claimed: number;
  completed: number;
  deferred: number;
  failed: number;
  unavailable: number;
}

interface GitHubBackfillWorkerPassCounts {
  aliases: number;
  commits: GitHubBackfillWorkerStageCounts;
  observations: GitHubBackfillWorkerStageCounts;
  pullRequestDiscovery: GitHubBackfillWorkerStageCounts;
  pullRequests: GitHubBackfillWorkerStageCounts;
  pullRequestSignals: GitHubBackfillWorkerStageCounts;
  summaries: GitHubBackfillWorkerStageCounts;
}

export interface GitHubBackfillProcessingCounts {
  aliases: number;
  claimed: number;
  deferred: number;
  failed: number;
  processed: number;
  unavailable: number;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const githubBackfillProcessingCountsFrom = (
  result: GitHubBackfillWorkerPassCounts
): GitHubBackfillProcessingCounts => {
  const counts: GitHubBackfillProcessingCounts = {
    aliases: result.aliases,
    claimed: 0,
    deferred: 0,
    failed: 0,
    processed: 0,
    unavailable: 0,
  };
  const stages = [
    result.observations,
    result.commits,
    result.pullRequestDiscovery,
    result.pullRequestSignals,
    result.pullRequests,
    result.summaries,
  ];
  for (const stage of stages) {
    counts.claimed += stage.claimed;
    counts.deferred += stage.deferred;
    counts.processed += stage.completed;
    counts.unavailable += stage.unavailable;
    // Worker stages include deferred and unavailable items in `failed`.
    // Report those outcomes once so the final counts remain disjoint.
    counts.failed += Math.max(
      0,
      stage.failed - stage.deferred - stage.unavailable
    );
  }
  return counts;
};

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

interface NormalizedGitHubBackfillInput {
  accounts: readonly TrackedGitHubAccount[];
  endDay: Date;
  repositoryId: string | null;
  startAt: Date;
}

const normalizedGitHubBackfillInputFrom = (
  value: unknown,
  now: Date
): NormalizedGitHubBackfillInput | null => {
  if (!isObject(value)) {
    return null;
  }
  const startAt = utcDayFrom(value.startDate);
  const endDay = utcDayFrom(value.endDate);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  if (
    startAt === null ||
    endDay === null ||
    startAt > endDay ||
    startAt.getTime() < MINIMUM_GITHUB_DATE ||
    endDay.getTime() > Math.min(MAXIMUM_GITHUB_DATE, today.getTime())
  ) {
    return null;
  }
  const account =
    value.account === "all" ? "all" : trackedGitHubAccountFrom(value.account);
  if (account === null) {
    return null;
  }
  const accounts =
    account === "all" ? TRACKED_GITHUB_ACCOUNTS : ([account] as const);
  const rawRepositoryId =
    typeof value.repositoryId === "string" ? value.repositoryId.trim() : "";
  const repositoryId =
    rawRepositoryId.length === 0 ? null : repositoryIdFrom(rawRepositoryId);
  if (rawRepositoryId.length > 0 && repositoryId === null) {
    return null;
  }

  return { accounts, endDay, repositoryId, startAt };
};

const githubBackfillRequestFor = (
  input: NormalizedGitHubBackfillInput
): GitHubBackfillRequest => {
  const { accounts, endDay, repositoryId, startAt } = input;
  return {
    accounts,
    endDate: endDay.toISOString().slice(0, 10),
    repositoryId,
    sinceAt: startAt,
    startDate: startAt.toISOString().slice(0, 10),
    untilAt: new Date(endDay.getTime() + DAY_MS - 1),
  };
};

export const githubBackfillRequestFrom = (
  value: unknown,
  now = new Date()
): GitHubBackfillRequest | null => {
  const input = normalizedGitHubBackfillInputFrom(value, now);
  if (input === null) {
    return null;
  }
  return githubBackfillRequestFor(input);
};
