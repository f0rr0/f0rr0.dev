import {
  repositoryIdFrom,
  TRACKED_GITHUB_ACCOUNTS,
  trackedGitHubAccountFrom,
} from "@/lib/github-commits-core";
import type { TrackedGitHubAccount } from "@/lib/github-commits-core";
import type { GitHubBackfillWindow } from "@/lib/github-commits-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMUM_BACKFILL_DAYS = 366;
const WINDOW_DAYS = 31;
const MINIMUM_GITHUB_DATE = Date.UTC(1970, 0, 1);
const MAXIMUM_GITHUB_DATE = Date.UTC(2099, 11, 13);

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
  startDate: string;
  windows: readonly GitHubBackfillWindow[];
}

export const githubBackfillRequestFrom = (
  value: unknown,
  now = new Date()
): GitHubBackfillRequest | null => {
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
  const dayCount = (endDay.getTime() - startAt.getTime()) / DAY_MS + 1;
  if (dayCount > MAXIMUM_BACKFILL_DAYS) {
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

  const windows: GitHubBackfillWindow[] = [];
  const rangeEndExclusive = endDay.getTime() + DAY_MS;
  for (
    let cursor = startAt.getTime();
    cursor < rangeEndExclusive;
    cursor += WINDOW_DAYS * DAY_MS
  ) {
    const windowEndExclusive = Math.min(
      cursor + WINDOW_DAYS * DAY_MS,
      rangeEndExclusive
    );
    windows.push({
      sinceAt: new Date(cursor),
      untilAt: new Date(windowEndExclusive - 1),
    });
  }

  return {
    accounts,
    endDate: endDay.toISOString().slice(0, 10),
    repositoryId,
    startDate: startAt.toISOString().slice(0, 10),
    windows,
  };
};
