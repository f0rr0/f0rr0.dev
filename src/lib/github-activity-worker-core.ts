const DEFAULT_GITHUB_ACTIVITY_WORKER_BATCH_SIZE = 8;
const MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE = 8;
export const GITHUB_PR_RECONCILIATION_MAX_AGE_DAYS = Number.POSITIVE_INFINITY;

const DEFAULT_RETRY_DELAY_MS = 15 * 60 * 1000;
const MAXIMUM_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const GITHUB_SUMMARY_MINIMUM_REMAINING_MS = 25_000;

export const boundedWorkerLimit = (
  value: number | undefined,
  fallback = DEFAULT_GITHUB_ACTIVITY_WORKER_BATCH_SIZE
) => {
  const selected = value ?? fallback;
  if (
    !Number.isSafeInteger(selected) ||
    selected < 1 ||
    selected > MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE
  ) {
    throw new RangeError("The GitHub activity worker batch size is invalid.");
  }
  return selected;
};

export const githubActivityRetryAt = (
  attemptCount: number,
  now: Date,
  requested: Date | null = null
) => {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError("The GitHub activity attempt count is invalid.");
  }
  const exponent = Math.min(attemptCount - 1, 16);
  const delay = Math.min(
    DEFAULT_RETRY_DELAY_MS * 2 ** exponent,
    MAXIMUM_RETRY_DELAY_MS
  );
  const fallback = new Date(now.getTime() + delay);
  return requested !== null && requested > fallback ? requested : fallback;
};

export const workerBatchSizeFrom = (
  value: string | null
): number | null | undefined => {
  if (value === null) {
    return undefined;
  }
  const selected = Number(value);
  return Number.isSafeInteger(selected) &&
    selected >= 1 &&
    selected <= MAXIMUM_GITHUB_ACTIVITY_WORKER_BATCH_SIZE &&
    String(selected) === value
    ? selected
    : null;
};

export const githubPrReconciliationCutoff = (
  maximumAgeDays: number,
  now: Date
) => {
  if (maximumAgeDays === Number.POSITIVE_INFINITY) {
    return null;
  }
  if (!Number.isSafeInteger(maximumAgeDays) || maximumAgeDays < 1) {
    throw new RangeError("The GitHub PR reconciliation horizon is invalid.");
  }
  const cutoffMilliseconds =
    now.getTime() - maximumAgeDays * 24 * 60 * 60 * 1000;
  // ECMAScript dates end at ±8.64e15 ms. A larger finite configuration is
  // operationally equivalent to an unbounded horizon.
  if (
    !Number.isFinite(cutoffMilliseconds) ||
    cutoffMilliseconds < -8_640_000_000_000_000
  ) {
    return null;
  }
  return new Date(cutoffMilliseconds);
};

export const workerDeadlineReached = (
  startedAt: number,
  maximumDurationMs: number,
  now = Date.now()
) => {
  if (
    !Number.isFinite(startedAt) ||
    !Number.isSafeInteger(maximumDurationMs) ||
    maximumDurationMs < 1
  ) {
    throw new RangeError("The GitHub activity worker deadline is invalid.");
  }
  return now - startedAt >= maximumDurationMs;
};

export const githubSummaryCanStart = (deadlineAt: number, now = Date.now()) => {
  if (!Number.isFinite(deadlineAt) || !Number.isFinite(now)) {
    throw new RangeError("The GitHub summary deadline is invalid.");
  }
  return deadlineAt - now >= GITHUB_SUMMARY_MINIMUM_REMAINING_MS;
};

export const nextGitHubPullRequestReconciliationAt = (
  state: "closed" | "merged" | "open",
  now: Date,
  createdAt = now
) => {
  if (Number.isNaN(now.getTime()) || Number.isNaN(createdAt.getTime())) {
    throw new TypeError("The GitHub PR reconciliation time is invalid.");
  }
  if (state !== "open") {
    return null;
  }
  const ageDays = Math.max(
    0,
    (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
  );
  const intervalMs =
    ageDays <= 30
      ? 3 * 60 * 60 * 1000
      : ageDays <= 180
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + intervalMs);
};

export const githubPullRequestSnapshotDisposition = (
  storedProviderUpdatedAt: Date,
  observedProviderUpdatedAt: Date,
  authoritative: boolean
) => {
  const difference =
    observedProviderUpdatedAt.getTime() - storedProviderUpdatedAt.getTime();
  if (!Number.isFinite(difference)) {
    throw new TypeError("The GitHub PR provider timestamp is invalid.");
  }
  if (difference < 0) {
    return "stale" as const;
  }
  if (difference > 0) {
    return "newer" as const;
  }
  return authoritative
    ? ("equal_authoritative" as const)
    : ("equal_observed" as const);
};
