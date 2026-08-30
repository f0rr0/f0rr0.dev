import { describe, expect, test } from "bun:test";

import { GitHubRequestDeadlineError } from "../src/lib/github-api.ts";
import {
  GITHUB_CRON_EXECUTION_DURATION_MS,
  githubCronStatusFromFailedAccounts,
  GITHUB_EVENTS_CRON_JOB,
  GITHUB_HEAD_REFS_CRON_JOB,
  GITHUB_REF_REPOSITORY_BATCH_SIZE,
  GITHUB_TAG_REFS_CRON_JOB,
  GITHUB_WORKER_CRON_JOB,
  githubRefKindFrom,
  githubRefRepositoryLimitFrom,
} from "../src/lib/github-cron-config.ts";
import {
  githubRefCycleIsComplete,
  nextGitHubRefRepository,
  reconcileGitHubRepositoryRefBatch,
  sortGitHubRefRepositories,
} from "../src/lib/github-ref-reconciliation-batch.ts";
import vercelConfig from "../vercel.json";

describe("GitHub cron configuration", () => {
  test("staggered schedules keep routine jobs from starting together", () => {
    expect(GITHUB_EVENTS_CRON_JOB).toEqual({
      name: "github-events-every-five-minutes",
      schedule: "*/5 * * * *",
    });
    expect(GITHUB_WORKER_CRON_JOB).toEqual({
      name: "github-activity-worker-every-five-minutes",
      schedule: "2-57/5 * * * *",
    });
    expect(GITHUB_HEAD_REFS_CRON_JOB).toEqual({
      name: "github-head-refs-every-fifteen-minutes",
      schedule: "4,19,34,49 * * * *",
    });
    expect(GITHUB_TAG_REFS_CRON_JOB).toEqual({
      name: "github-tag-refs-every-fifteen-minutes",
      schedule: "9,24,39,54 * * * *",
    });
  });

  test("bounds scheduled repository reconciliation", () => {
    expect(GITHUB_REF_REPOSITORY_BATCH_SIZE).toBe(8);
    expect(GITHUB_CRON_EXECUTION_DURATION_MS).toBe(90_000);
    expect(githubRefRepositoryLimitFrom(null)).toBe(8);
    expect(githubRefRepositoryLimitFrom("1")).toBe(1);
    expect(githubRefRepositoryLimitFrom("8")).toBe(8);
    for (const invalid of ["", "0", "9", "01", "4.0", "all"]) {
      expect(githubRefRepositoryLimitFrom(invalid)).toBeNull();
    }
    expect(githubRefKindFrom(null)).toBe("head");
    expect(githubRefKindFrom("head")).toBe("head");
    expect(githubRefKindFrom("tag")).toBe("tag");
    expect(githubRefKindFrom("all")).toBeNull();
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
