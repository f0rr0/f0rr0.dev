import { expect, spyOn, test } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import * as database from "../src/db/client";
import * as schema from "../src/db/schema";
import { TRACKED_GITHUB_USER_IDS } from "../src/lib/github-commits-core";
import { readGitHubWorkUnitProjectionEvidence } from "../src/lib/github-work-unit-store";
import { installRuntimeCache } from "./helpers";

test("the production projection loader reuses file bodies and still observes live coverage, authors, visibility and counters", async () => {
  const cache = installRuntimeCache();
  const at = new Date("2026-10-01T12:00:00Z");
  const commits = Array.from({ length: 64 }, (_, index) => ({
    additions: 1,
    authorUserId: Object.values(TRACKED_GITHUB_USER_IDS)[0],
    committedAt: at,
    committerAt: at,
    deletions: 0,
    enrichmentState: "complete",
    fileFactsPresent: true,
    fileFactsPrunedAt: null,
    fileFactsComplete: true,
    fileFactsDigest: "a".repeat(64),
    firstObservedAt: at,
    parentShas: [],
    providerFileCapReached: false,
    pullRequestDiscoveryState: "complete",
    repositoryId: "1",
    sha: `${(index % 16).toString(16)}${index.toString(16).padStart(39, "0")}`,
    verifiedMergeLanding: false,
    fileFacts: [[`src/file-${index}.ts`, 1, 0]],
  }));
  const repository = {
    defaultBranch: "main",
    description: null,
    factsVerifiedAt: at,
    fullName: "example/repo",
    headGenerationComplete: true,
    homepageUrl: null,
    id: "1",
    topics: [],
    visibility: "public" as string | null,
  };
  let transferredBodies = 0;
  const read = (selection: Record<string, unknown>) => {
    let table: unknown;
    let condition: SQL | undefined;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL | undefined) {
        condition = value;
        return query;
      },
      orderBy() {
        return query;
      },
      groupBy() {
        return query;
      },
      innerJoin() {
        return query;
      },
      leftJoin() {
        return query;
      },
      // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are awaitable; this mock exercises the production loader without a database.
      async then(
        resolve: (value: unknown[]) => unknown,
        reject: (error: unknown) => unknown
      ) {
        let rows: Record<string, unknown>[] = [];
        if (table === schema.githubRepositories) {
          rows = [repository];
        }
        if (table === schema.githubRefGenerations) {
          rows = [
            {
              branchLineageId: "11111111-1111-4111-8111-111111111111",
              completedAt: at,
              headSha: commits.at(-1)?.sha,
              refName: "refs/heads/main",
              repositoryId: "1",
              members: commits.map((commit) => ["1", commit.sha]),
            },
          ];
        }
        if (table === schema.githubCommits) {
          const params =
            condition === undefined
              ? []
              : new PgDialect().sqlToQuery(condition).params;
          if (selection.fileFacts === schema.githubCommits.fileStats) {
            rows = commits.filter(
              (commit) =>
                params.includes(commit.repositoryId) &&
                params.includes(commit.sha)
            );
            transferredBodies += rows.length;
          } else {
            expect(selection).not.toHaveProperty("fileFacts");
            rows = commits.filter((commit) =>
              params.includes(commit.authorUserId)
            );
          }
        }
        return await Promise.resolve(
          rows.map((row) =>
            Object.fromEntries(
              Object.keys(selection).map((key) => [key, row[key]])
            )
          )
        ).then(resolve, reject);
      },
    };
    return query;
  };
  const transaction = { select: read, selectDistinct: read };
  const get = spyOn(database, "getDatabase").mockReturnValue({
    transaction: async (
      run: (value: typeof transaction) => Promise<unknown>,
      options: unknown
    ) => {
      expect(options).toEqual({
        accessMode: "read only",
        isolationLevel: "repeatable read",
      });
      return await run(transaction);
    },
  } as unknown as ReturnType<typeof database.getDatabase>);
  try {
    const cold = await readGitHubWorkUnitProjectionEvidence();
    expect(cold.units).toHaveLength(1);
    expect(cold.units[0]?.facts.memberCount).toBe(64);
    expect(transferredBodies).toBe(64);
    expect(await readGitHubWorkUnitProjectionEvidence()).toEqual(cold);
    expect(transferredBodies).toBe(64);
    commits[0].additions = 2;
    const counter = await readGitHubWorkUnitProjectionEvidence();
    expect(counter.units[0]?.facts.additions).toBe(65);
    expect(transferredBodies).toBe(64);
    commits[0].verifiedMergeLanding = true;
    expect(
      (await readGitHubWorkUnitProjectionEvidence()).units[0]?.facts.memberCount
    ).toBe(63);
    commits[0].verifiedMergeLanding = false;
    repository.visibility = "private";
    expect(
      (await readGitHubWorkUnitProjectionEvidence()).units[0]?.visibility
    ).toBe("private");
    repository.visibility = null;
    expect((await readGitHubWorkUnitProjectionEvidence()).units).toEqual([]);
    repository.visibility = "public";
    repository.headGenerationComplete = false;
    expect((await readGitHubWorkUnitProjectionEvidence()).units).toEqual([]);
    repository.headGenerationComplete = true;
    commits[0].authorUserId = "untracked";
    expect(
      (await readGitHubWorkUnitProjectionEvidence()).units[0]?.facts.memberCount
    ).toBe(63);
    // Removing one author changes one four-row SHA bucket, not all 64 bodies.
    expect(transferredBodies).toBe(67);
    cache.values.clear();
    const uncached = await readGitHubWorkUnitProjectionEvidence();
    expect(uncached.units[0]?.facts.memberCount).toBe(63);
  } finally {
    get.mockRestore();
    cache.restore();
  }
});
