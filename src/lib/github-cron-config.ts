export const GITHUB_EVENTS_CRON_JOB = {
  name: "github-events-every-five-minutes",
  schedule: "*/5 * * * *",
} as const;

export const GITHUB_WORKER_CRON_JOB = {
  name: "github-activity-worker-every-five-minutes",
  schedule: "2-57/5 * * * *",
} as const;

export const GITHUB_HEAD_REFS_CRON_JOB = {
  name: "github-head-refs-every-fifteen-minutes",
  schedule: "4,19,34,49 * * * *",
} as const;

export const GITHUB_TAG_REFS_CRON_JOB = {
  name: "github-tag-refs-every-fifteen-minutes",
  schedule: "9,24,39,54 * * * *",
} as const;

export const GITHUB_REF_REPOSITORY_BATCH_SIZE = 8;
export const MAXIMUM_GITHUB_REF_REPOSITORY_BATCH_SIZE = 8;
export const GITHUB_CRON_EXECUTION_DURATION_MS = 90_000;

export const githubRefRepositoryLimitFrom = (value: string | null) => {
  if (value === null) {
    return GITHUB_REF_REPOSITORY_BATCH_SIZE;
  }
  return /^[1-8]$/.test(value) ? Number(value) : null;
};

export const githubRefKindFrom = (value: string | null) => {
  if (value === null || value === "head") {
    return "head" as const;
  }
  return value === "tag" ? ("tag" as const) : null;
};

export const githubCronStatusFromFailedAccounts = (
  failedAccounts: readonly unknown[]
): 200 | 503 => (failedAccounts.length === 0 ? 200 : 503);
