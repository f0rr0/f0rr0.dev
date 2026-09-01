import { describe, expect, test } from "bun:test";

import { GitHubRequestDeadlineError } from "../src/lib/github-api.ts";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  githubCronStatusFromFailedAccounts,
  GITHUB_EVENTS_CRON_JOB,
  GITHUB_HEAD_REFS_CRON_JOB,
  GITHUB_REF_REPOSITORY_BATCH_SIZE,
  GITHUB_ROUTINE_MAX_DURATION_SECONDS,
  GITHUB_SUMMARY_CRON_JOB,
  GITHUB_WORKER_EXECUTION_DURATION_MS,
  GITHUB_WORKER_HTTP_TIMEOUT_MS,
  GITHUB_WORKER_MAX_DURATION_SECONDS,
  GITHUB_WORKER_CRON_JOB,
  githubRefRepositoryLimitFrom,
} from "../src/lib/github-cron-config.ts";
import {
  githubRefCycleIsComplete,
  nextGitHubRefRepository,
  reconcileGitHubRepositoryRefBatch,
  sortGitHubRefRepositories,
} from "../src/lib/github-ref-reconciliation-batch.ts";
import vercelConfig from "../vercel.json";

const minutesFrom = (schedule) => {
  const [minute] = schedule.split(" ", 1);
  if (minute === "*/5") {
    return Array.from({ length: 12 }, (_, index) => index * 5);
  }
  const range = /^(\d+)-(\d+)\/(\d+)$/.exec(minute);
  if (range !== null) {
    const [, start, end, step] = range.map(Number);
    const minutes = [];
    for (let value = start; value <= end; value += step) {
      minutes.push(value);
    }
    return minutes;
  }
  return minute.split(",").map(Number);
};

describe("GitHub cron configuration", () => {
  test("staggered routine jobs never start in the same minute", () => {
    const jobs = [
      GITHUB_EVENTS_CRON_JOB,
      GITHUB_WORKER_CRON_JOB,
      GITHUB_SUMMARY_CRON_JOB,
      GITHUB_HEAD_REFS_CRON_JOB,
    ];
    const allMinutes = jobs.flatMap((job) => minutesFrom(job.schedule));
    expect(new Set(jobs.map((job) => job.name)).size).toBe(jobs.length);
    expect(new Set(allMinutes).size).toBe(allMinutes.length);

    const factualMinutes = new Set(
      minutesFrom(GITHUB_WORKER_CRON_JOB.schedule)
    );
    for (const summaryMinute of minutesFrom(GITHUB_SUMMARY_CRON_JOB.schedule)) {
      expect(factualMinutes.has((summaryMinute + 59) % 60)).toBe(true);
    }
  });

  test("bounds scheduled repository reconciliation", () => {
    expect(GITHUB_REF_REPOSITORY_BATCH_SIZE).toBe(8);
    expect(GITHUB_ROUTINE_MAX_DURATION_SECONDS).toBe(15);
    expect(GITHUB_CRON_EXECUTION_DURATION_MS).toBe(
      GITHUB_ROUTINE_MAX_DURATION_SECONDS * 1000
    );
    expect(GITHUB_WORKER_MAX_DURATION_SECONDS).toBe(60);
    expect(GITHUB_WORKER_EXECUTION_DURATION_MS).toBeLessThan(
      GITHUB_WORKER_HTTP_TIMEOUT_MS
    );
    expect(GITHUB_WORKER_HTTP_TIMEOUT_MS).toBe(
      GITHUB_WORKER_MAX_DURATION_SECONDS * 1000
    );
    expect(githubRefRepositoryLimitFrom(null)).toBe(8);
    expect(githubRefRepositoryLimitFrom("1")).toBe(1);
    expect(githubRefRepositoryLimitFrom("8")).toBe(8);
    for (const invalid of ["", "0", "9", "01", "4.0", "all"]) {
      expect(githubRefRepositoryLimitFrom(invalid)).toBeNull();
    }
  });

  test("fails before claiming a ref lease when the shared deadline is exhausted", async () => {
    await expect(
      reconcileGitHubRepositoryRefBatch({
        account: "f0rr0",
        deadlineAt: Date.now() - 1,
        kind: "head",
        repositoryLimit: 8,
        token: "token",
      })
    ).rejects.toBeInstanceOf(GitHubRequestDeadlineError);
  });

  test("treats every partial account result as an operational failure", () => {
    expect(githubCronStatusFromFailedAccounts([])).toBe(200);
    expect(githubCronStatusFromFailedAccounts([{ account: "f0rr0" }])).toBe(
      503
    );
  });

  test("orders the persisted cursor by immutable numeric repository ID", () => {
    const repositories = sortGitHubRefRepositories([
      { fullName: "renamed/z", id: "100" },
      { fullName: "original/a", id: "9" },
      { fullName: "middle/m", id: "42" },
    ]);
    expect(repositories.map(({ id }) => id)).toEqual(["9", "42", "100"]);
    expect(nextGitHubRefRepository(repositories, "42")?.id).toBe("100");
    expect(githubRefCycleIsComplete(repositories, "100", null)).toBe(true);
    expect(githubRefCycleIsComplete(repositories, "100", 2)).toBe(false);
  });

  test("runs server functions beside the Tokyo database", () => {
    expect(vercelConfig.regions).toEqual(["hnd1"]);
  });
});
