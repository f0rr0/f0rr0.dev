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
  input: Pick<NormalizedGitHubBackfillInput, "accounts" | "repositoryId"> & {
    endDay: Date;
    startAt: Date;
  }
): GitHubBackfillRequest => {
  const { accounts, endDay, repositoryId, startAt } = input;

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

export const githubBackfillRequestFrom = (
  value: unknown,
  now = new Date()
): GitHubBackfillRequest | null => {
  const input = normalizedGitHubBackfillInputFrom(value, now);
  if (input === null) {
    return null;
  }
  const dayCount =
    (input.endDay.getTime() - input.startAt.getTime()) / DAY_MS + 1;
  return dayCount > MAXIMUM_BACKFILL_DAYS
    ? null
    : githubBackfillRequestFor(input);
};

export const githubBackfillRequestSeriesFrom = (
  value: unknown,
  now = new Date()
): readonly GitHubBackfillRequest[] | null => {
  const input = normalizedGitHubBackfillInputFrom(value, now);
  if (input === null) {
    return null;
  }
  const requests: GitHubBackfillRequest[] = [];
  const finalEnd = input.endDay.getTime();
  for (
    let start = input.startAt.getTime();
    start <= finalEnd;
    start += MAXIMUM_BACKFILL_DAYS * DAY_MS
  ) {
    requests.push(
      githubBackfillRequestFor({
        accounts: input.accounts,
        endDay: new Date(
          Math.min(start + (MAXIMUM_BACKFILL_DAYS - 1) * DAY_MS, finalEnd)
        ),
        repositoryId: input.repositoryId,
        startAt: new Date(start),
      })
    );
  }
  return requests;
};

export const splitGitHubBackfillRequest = (
  request: GitHubBackfillRequest
): readonly [GitHubBackfillRequest, GitHubBackfillRequest] | null => {
  const startAt = utcDayFrom(request.startDate);
  const endDay = utcDayFrom(request.endDate);
  if (startAt === null || endDay === null) {
    return null;
  }
  const dayCount = (endDay.getTime() - startAt.getTime()) / DAY_MS + 1;
  if (!Number.isSafeInteger(dayCount) || dayCount <= 1) {
    return null;
  }
  const leftDayCount = Math.floor(dayCount / 2);
  const rightStartAt = new Date(startAt.getTime() + leftDayCount * DAY_MS);
  return [
    githubBackfillRequestFor({
      accounts: request.accounts,
      endDay: new Date(rightStartAt.getTime() - DAY_MS),
      repositoryId: request.repositoryId,
      startAt,
    }),
    githubBackfillRequestFor({
      accounts: request.accounts,
      endDay,
      repositoryId: request.repositoryId,
      startAt: rightStartAt,
    }),
  ];
};
