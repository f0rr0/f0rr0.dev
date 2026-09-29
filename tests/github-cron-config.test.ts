import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";

import { GitHubRequestDeadlineError } from "../src/lib/github-api.ts";
import {
  githubCronStatusFromFailedAccounts,
  githubRefRepositoryLimitFrom,
} from "../src/lib/github-cron-config.ts";
import {
  githubRefCycleIsComplete,
  nextGitHubRefRepository,
  reconcileGitHubRepositoryRefBatch,
  sortGitHubRefRepositories,
} from "../src/lib/github-ref-reconciliation-batch.ts";

describe("GitHub cron configuration", () => {
  test("bounds scheduled repository reconciliation", () => {
    expect(githubRefRepositoryLimitFrom(null)).toBe(8);
    expect(githubRefRepositoryLimitFrom("1")).toBe(1);
    expect(githubRefRepositoryLimitFrom("8")).toBe(8);
    for (const invalid of ["", "0", "9", "01", "4.0", "all"]) {
      expect(githubRefRepositoryLimitFrom(invalid)).toBeNull();
    }
  });

  test("fails before claiming a ref lease when the shared deadline is exhausted", async () => {
    await assert.rejects(
      reconcileGitHubRepositoryRefBatch({
        account: "f0rr0",
        deadlineAt: Date.now() - 1,
        kind: "head",
        repositoryLimit: 8,
        token: "token",
      }),
      GitHubRequestDeadlineError
    );
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
});
