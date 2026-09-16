import { describe, expect, test } from "bun:test";

import { GitHubRequestDeadlineError } from "../src/lib/github-api.ts";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  githubCronStatusFromFailedAccounts,
  GITHUB_EVENTS_CRON_JOB,
  GITHUB_PUBLICATION_CRON_JOB,
  GITHUB_HEAD_REFS_CRON_JOB,
  GITHUB_REF_REPOSITORY_BATCH_SIZE,
  GITHUB_ROUTINE_MAX_DURATION_SECONDS,
  GITHUB_SUMMARY_CRON_JOB,
  GITHUB_SUMMARY_REQUEST_BUDGET,
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

const minutesFrom = (schedule: string) => {
  const [minute] = schedule.split(" ", 1);
  if (minute === "*/3") {
    return Array.from({ length: 20 }, (_, index) => index * 3);
  }
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
  test("factual jobs stay staggered while summaries run 20 times per hour", () => {
    const jobs = [
      GITHUB_EVENTS_CRON_JOB,
      GITHUB_WORKER_CRON_JOB,
      GITHUB_PUBLICATION_CRON_JOB,
      GITHUB_HEAD_REFS_CRON_JOB,
    ];
    const allMinutes = jobs.flatMap((job) => minutesFrom(job.schedule));
    expect(new Set(jobs.map((job) => job.name)).size).toBe(jobs.length);
    expect(new Set(allMinutes).size).toBe(allMinutes.length);
    expect(minutesFrom(GITHUB_PUBLICATION_CRON_JOB.schedule)).toEqual([2]);
    expect(
      [
        ...minutesFrom(GITHUB_WORKER_CRON_JOB.schedule),
        ...minutesFrom(GITHUB_PUBLICATION_CRON_JOB.schedule),
      ].toSorted((a, b) => a - b)
    ).toEqual(Array.from({ length: 12 }, (_, index) => 2 + index * 5));

    expect(minutesFrom(GITHUB_SUMMARY_CRON_JOB.schedule)).toEqual(
      Array.from({ length: 20 }, (_, index) => index * 3)
    );
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
    expect(GITHUB_SUMMARY_REQUEST_BUDGET.daily).toBe(100);
    expect(GITHUB_SUMMARY_REQUEST_BUDGET.monthly).toBe(3000);
    expect(githubRefRepositoryLimitFrom(null)).toBe(8);
    expect(githubRefRepositoryLimitFrom("1")).toBe(1);
    expect(githubRefRepositoryLimitFrom("8")).toBe(8);
    for (const invalid of ["", "0", "9", "01", "4.0", "all"]) {
      expect(githubRefRepositoryLimitFrom(invalid)).toBeNull();
    }
  });

  test("fails before claiming a ref lease when the shared deadline is exhausted", async () => {
    expect(
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
    const facts = {
      defaultBranch: "main",
      htmlUrl: null,
      ownerAvatarUrl: null,
      ownerId: null,
      ownerLogin: "example",
      ownerType: null,
      pushedAt: null,
      visibility: null,
    };
    const repositories = sortGitHubRefRepositories([
      { ...facts, fullName: "renamed/z", id: "100" },
      { ...facts, fullName: "original/a", id: "9" },
      { ...facts, fullName: "middle/m", id: "42" },
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
