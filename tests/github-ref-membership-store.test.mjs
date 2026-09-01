import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { closeDatabase } from "../src/db/client.ts";
import { env } from "../src/env.ts";
import { persistGitHubWebhookHeadSignal } from "../src/lib/github-commits-store.ts";
import {
  claimGitHubRefRepairs,
  completeGitHubRefDeletion,
  completeGitHubRefRepair,
  deferGitHubRefRepair,
  githubCurrentRefMembershipReferenceFrom,
  lowerGitHubRefBackfillSinceAt,
  readGitHubRefRepairBacklog,
  validateGitHubRefRepairSource,
} from "../src/lib/github-ref-membership-store.ts";

setDefaultTimeout(30_000);

const dockerAvailable =
  Bun.spawnSync(["docker", "info"], {
    stderr: "ignore",
    stdout: "ignore",
  }).exitCode === 0;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const postgresImage = "postgres:17-alpine";
const postgresPassword = "github-ref-repair-test";
const sha = (character) => character.repeat(40);
const iso = (date) => date.toISOString();
const branchLineageId = "10000000-0000-4000-8000-000000000001";
const sideBranchLineageId = "10000000-0000-4000-8000-000000000002";
const irrelevantBranchLineageId = "10000000-0000-4000-8000-000000000003";

const activeRepair = {
  account: "f0rr0",
  active: true,
  attemptCount: 1,
  branchLineageId,
  coverageSinceAt: new Date("2026-08-01T00:00:00.000Z"),
  desiredHeadSha: sha("b"),
  leaseToken: "00000000-0000-4000-8000-000000000001",
  observedAt: new Date("2026-09-01T00:00:00.000Z"),
  refName: "refs/heads/main",
  repository: "f0rr0/example",
  repositoryId: "1",
};

const trackedCommit = (commitSha = sha("c")) => ({
  author: "f0rr0",
  committedAt: "2026-08-31T12:00:00.000Z",
  message: "Implement current behavior",
  repository: "f0rr0/example",
  repositoryId: "1",
  sha: commitSha,
  url: `https://github.com/f0rr0/example/commit/${commitSha}`,
});

const headSignal = (operation, afterSha, beforeSha) => ({
  afterSha,
  beforeSha,
  forced: operation === "update",
  kind: "head",
  operation,
  refName: "refs/heads/main",
  repository: {
    defaultBranch: "main",
    fullName: "f0rr0/example",
    htmlUrl: "https://github.com/f0rr0/example",
    id: "1",
    ownerAvatarUrl: null,
    ownerId: "8574219",
    ownerLogin: "f0rr0",
    ownerType: "User",
    pushedAt: null,
    visibility: "public",
  },
});

describe("GitHub ref repair source validation", () => {
  test("accepts the tracked-author intersection of complete reachability", () => {
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a"), sha("c"), sha("b")],
        commits: [trackedCommit()],
      });
    }).not.toThrow();
  });

  test("rejects a partial head or tracked commit outside reachability", () => {
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a")],
        commits: [],
      });
    }).toThrow(TypeError);
    expect(() => {
      validateGitHubRefRepairSource(activeRepair, {
        commitShas: [sha("a"), sha("b")],
        commits: [trackedCommit()],
      });
    }).toThrow(TypeError);
  });
});

describe.skipIf(!dockerAvailable)(
  "GitHub current ref repair persistence",
  () => {
    let admin;
    let containerId;
    let originalDatabaseUrl;

    beforeAll(async () => {
      originalDatabaseUrl = env.DATABASE_URL;
      const started = Bun.spawnSync([
        "docker",
        "run",
        "--detach",
        "--rm",
        "--publish",
        "127.0.0.1::5432",
        "--env",
        `POSTGRES_PASSWORD=${postgresPassword}`,
        "--env",
        "POSTGRES_DB=github_ref_repair_test",
        postgresImage,
      ]);
      if (started.exitCode !== 0) {
        throw new Error(
          "Could not start the ref repair PostgreSQL test database."
        );
      }
      containerId = started.stdout.toString("utf-8").trim();
      const portOutput = Bun.spawnSync([
        "docker",
        "port",
        containerId,
        "5432/tcp",
      ]).stdout.toString("utf-8");
      const port = /:(\d+)$/u.exec(portOutput.trim())?.[1];
      if (port === undefined) {
        throw new Error(
          "Could not resolve the ref repair PostgreSQL test port."
        );
      }
      const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_ref_repair_test`;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const probe = postgres(databaseUrl, {
          connect_timeout: 1,
          max: 1,
          prepare: false,
        });
        try {
          await probe`select 1`;
          await probe.end({ timeout: 1 });
          break;
        } catch {
          await probe.end({ timeout: 1 }).catch(() => null);
          if (attempt === 49) {
            throw new Error("Ref repair PostgreSQL did not become ready.");
          }
          await delay(100);
        }
      }
      admin = postgres(databaseUrl, { max: 1, prepare: false });
      await migrate(drizzle({ client: admin }), { migrationsFolder });
      env.DATABASE_URL = databaseUrl;
    });

    afterAll(async () => {
      await closeDatabase();
      env.DATABASE_URL = originalDatabaseUrl;
      await admin?.end({ timeout: 2 });
      if (containerId !== undefined) {
        Bun.spawnSync(["docker", "stop", containerId], {
          stderr: "ignore",
          stdout: "ignore",
        });
      }
    });

    test("swaps only the matching desired head and removes deleted generations", async () => {
      const oldHead = sha("a");
      const firstDesiredHead = sha("b");
      const supersedingHead = sha("d");
      const oldTrackedSha = sha("e");
      const newTrackedSha = sha("f");
      const foreignSha = sha("1");
      const coverageSinceAt = new Date("2026-08-01T00:00:00.000Z");
      const firstObservedAt = new Date("2026-09-01T00:00:00.000Z");
      const secondObservedAt = new Date("2026-09-01T00:01:00.000Z");

      await admin`
      insert into github_account_checkpoints (account, ref_backfill_since_at)
      values ('f0rr0', ${iso(coverageSinceAt)})
    `;
      await admin`
      insert into github_repositories (default_branch, id, full_name)
      values
        ('main', '1', 'f0rr0/example'),
        ('main', '2', 'someone/irrelevant')
    `;
      await admin`
      insert into github_commits
        (author_login, author_user_id, committed_at, message, repository_id, sha)
      values
        ('f0rr0', '8574219', ${iso(coverageSinceAt)}, 'Old work', '1', ${oldTrackedSha})
    `;
      await admin`
      insert into github_repository_refs
        (active, branch_lineage_id, first_observed_at, head_sha, kind, last_observed_at, projection_relevant, ref_name, repository_id)
      values
        (true, ${branchLineageId}, ${iso(firstObservedAt)}, ${firstDesiredHead}, 'head', ${iso(firstObservedAt)}, true, 'refs/heads/main', '1'),
        (true, ${sideBranchLineageId}, ${iso(firstObservedAt)}, ${sha("7")}, 'head', '2026-09-01T00:10:00.000Z', false, 'refs/heads/topic', '1'),
        (true, ${irrelevantBranchLineageId}, ${iso(firstObservedAt)}, ${sha("8")}, 'head', '2026-09-01T00:20:00.000Z', false, 'refs/heads/main', '2')
    `;
      const [initialGeneration] = await admin`
      insert into github_ref_generations
        (branch_lineage_id, completed_at, coverage_since_at, generation, head_sha, ref_name, repository_id)
      values
        (${branchLineageId}, ${iso(firstObservedAt)}, ${iso(coverageSinceAt)}, 3, ${oldHead}, 'refs/heads/main', '1')
      returning branch_lineage_id
    `;
      await admin`
      insert into github_ref_memberships
        (commit_repository_id, commit_sha, generation, position, ref_name, repository_id)
      values
        ('1', ${oldTrackedSha}, 3, 0, 'refs/heads/main', '1')
    `;

      const [firstClaim] = await claimGitHubRefRepairs({
        limit: 1,
        now: firstObservedAt,
      });
      expect(firstClaim).toMatchObject({
        account: "f0rr0",
        active: true,
        desiredHeadSha: firstDesiredHead,
        repository: "f0rr0/example",
      });
      expect(githubCurrentRefMembershipReferenceFrom(firstClaim)).toMatchObject(
        {
          coverageSinceAt,
          headSha: firstDesiredHead,
          repositoryId: "1",
        }
      );
      await admin`
        delete from github_repository_refs
        where repository_id = '1' and ref_name = 'refs/heads/topic'
      `;
      expect(
        await claimGitHubRefRepairs({ limit: 1, now: firstObservedAt })
      ).toEqual([]);

      await persistGitHubWebhookHeadSignal(
        "00000000-0000-4000-8000-000000000101",
        headSignal("update", supersedingHead, firstDesiredHead)
      );
      const staleCompletion = await completeGitHubRefRepair(firstClaim, {
        commitShas: [firstDesiredHead],
        commits: [trackedCommit(firstDesiredHead)],
      });
      expect(staleCompletion.stale).toBe(true);
      const [unchangedGeneration] = await admin`
      select generation, head_sha
      from github_ref_generations
      where repository_id = '1' and ref_name = 'refs/heads/main'
    `;
      expect(unchangedGeneration).toEqual({
        generation: "3",
        head_sha: oldHead,
      });
      expect(
        await admin`
        select commit_sha
        from github_ref_memberships
        where repository_id = '1' and ref_name = 'refs/heads/main'
      `
      ).toEqual([{ commit_sha: oldTrackedSha }]);

      const [currentClaim] = await claimGitHubRefRepairs({
        limit: 1,
        now: secondObservedAt,
      });
      const completion = await completeGitHubRefRepair(
        currentClaim,
        {
          commitShas: [foreignSha, newTrackedSha, supersedingHead],
          commits: [trackedCommit(newTrackedSha)],
        },
        secondObservedAt
      );
      expect(completion).toEqual({
        generation: 4,
        insertedCommits: 1,
        memberCount: 1,
        stale: false,
      });
      const [currentGeneration] = await admin`
      select branch_lineage_id, coverage_since_at, generation, head_sha
      from github_ref_generations
      where repository_id = '1' and ref_name = 'refs/heads/main'
    `;
      expect(currentGeneration).toMatchObject({
        branch_lineage_id: initialGeneration.branch_lineage_id,
        generation: "4",
        head_sha: supersedingHead,
      });
      expect(new Date(currentGeneration.coverage_since_at)).toEqual(
        coverageSinceAt
      );
      expect(
        await admin`
        select commit_sha, generation, position
        from github_ref_memberships
        where repository_id = '1' and ref_name = 'refs/heads/main'
      `
      ).toEqual([{ commit_sha: newTrackedSha, generation: "4", position: 1 }]);
      expect(
        await admin`
        select author_user_id
        from github_commits
        where repository_id = '1' and sha = ${newTrackedSha}
      `
      ).toEqual([{ author_user_id: "8574219" }]);

      await persistGitHubWebhookHeadSignal(
        "00000000-0000-4000-8000-000000000102",
        headSignal("delete", null, supersedingHead)
      );
      const [deleteClaim] = await claimGitHubRefRepairs({
        limit: 1,
        now: new Date("2026-09-01T00:02:00.000Z"),
      });
      await admin`
      update github_repository_refs
      set active = true
      where repository_id = '1' and ref_name = 'refs/heads/main'
    `;
      expect((await completeGitHubRefDeletion(deleteClaim)).stale).toBe(true);
      expect(
        await admin`
        select generation
        from github_ref_generations
        where repository_id = '1' and ref_name = 'refs/heads/main'
      `
      ).toEqual([{ generation: "4" }]);

      await admin`
      update github_repository_refs
      set active = false
      where repository_id = '1' and ref_name = 'refs/heads/main'
    `;
      const [finalDeleteClaim] = await claimGitHubRefRepairs({
        limit: 1,
        now: new Date("2026-09-01T00:03:00.000Z"),
      });
      expect(await completeGitHubRefDeletion(finalDeleteClaim)).toEqual({
        stale: false,
      });
      expect(
        await admin`
        select * from github_ref_generations where repository_id = '1'
      `
      ).toEqual([]);
      expect(
        await admin`
        select * from github_ref_memberships where repository_id = '1'
      `
      ).toEqual([]);
    });

    test("does not reclaim a deferred repair before its retry time", async () => {
      const now = new Date("2026-09-02T00:00:00.000Z");
      const retryAt = new Date("2026-09-02T00:15:00.000Z");
      await admin`
      update github_repository_refs
      set active = true, head_sha = ${sha("9")}, last_observed_at = ${iso(now)}
      where repository_id = '1' and ref_name = 'refs/heads/main'
    `;
      const [claim] = await claimGitHubRefRepairs({ limit: 1, now });
      expect(
        await deferGitHubRefRepair(claim, "provider_unavailable", retryAt, now)
      ).toEqual(retryAt);
      expect(
        await readGitHubRefRepairBacklog({
          now: new Date("2026-09-02T00:14:59.000Z"),
          repositoryId: "1",
        })
      ).toEqual({ remaining: 1, retryAt });
      expect(
        await claimGitHubRefRepairs({
          limit: 1,
          now: new Date("2026-09-02T00:14:59.000Z"),
        })
      ).toEqual([]);
      expect(
        await claimGitHubRefRepairs({ limit: 1, now: retryAt })
      ).toHaveLength(1);
    });

    test("reclaims an unchanged relevant head only when requested coverage expands", async () => {
      const august1 = new Date("2026-08-01T00:00:00.000Z");
      const august10 = new Date("2026-08-10T00:00:00.000Z");
      const august18 = new Date("2026-08-18T00:00:00.000Z");
      const observedAt = new Date("2026-08-19T00:00:00.000Z");
      const headSha = sha("6");

      await admin`
        truncate table github_account_checkpoints, github_repositories
        restart identity cascade
      `;
      await admin`
        insert into github_account_checkpoints
          (account, ref_backfill_since_at)
        values ('f0rr0', ${iso(august18)})
      `;
      await lowerGitHubRefBackfillSinceAt(
        ["f0rr0", "yuppiestechdev"],
        august18
      );
      await admin`
        update github_account_checkpoints
        set paused = true
        where account = 'yuppiestechdev'
      `;
      await admin`
        insert into github_repositories (default_branch, id, full_name)
        values ('main', '3', 'f0rr0/coverage')
      `;
      await admin`
        insert into github_repository_refs
          (active, branch_lineage_id, head_sha, kind, projection_relevant, ref_name, repository_id)
        values
          (true, ${sideBranchLineageId}, ${headSha}, 'head', true, 'refs/heads/main', '3')
      `;
      await admin`
        insert into github_ref_generations
          (branch_lineage_id, completed_at, coverage_since_at, generation, head_sha, ref_name, repository_id)
        values
          (${sideBranchLineageId}, ${iso(observedAt)}, ${iso(august18)}, 1, ${headSha}, 'refs/heads/main', '3')
      `;

      expect(
        await readGitHubRefRepairBacklog({
          now: observedAt,
          repositoryId: "3",
        })
      ).toEqual({ remaining: 0, retryAt: null });
      expect(
        await claimGitHubRefRepairs({
          limit: 1,
          now: observedAt,
          repositoryId: "3",
        })
      ).toEqual([]);

      await lowerGitHubRefBackfillSinceAt(["f0rr0", "yuppiestechdev"], august1);
      expect(
        await readGitHubRefRepairBacklog({
          now: observedAt,
          repositoryId: "3",
        })
      ).toEqual({ remaining: 1, retryAt: null });
      const [claim] = await claimGitHubRefRepairs({
        limit: 1,
        now: observedAt,
        repositoryId: "3",
      });
      expect(claim).toMatchObject({
        active: true,
        coverageSinceAt: august1,
        desiredHeadSha: headSha,
        repositoryId: "3",
      });
      expect(
        await admin`
          select count(*)::int as count
          from github_commits
          where repository_id = '3'
        `
      ).toEqual([{ count: 0 }]);
      expect(
        await completeGitHubRefRepair(
          claim,
          { commitShas: [headSha], commits: [] },
          observedAt
        )
      ).toMatchObject({ stale: false });

      await lowerGitHubRefBackfillSinceAt(
        ["f0rr0", "yuppiestechdev"],
        august10
      );
      await lowerGitHubRefBackfillSinceAt(["f0rr0", "yuppiestechdev"], august1);
      expect(
        await claimGitHubRefRepairs({
          limit: 1,
          now: new Date(observedAt.getTime() + 1),
          repositoryId: "3",
        })
      ).toEqual([]);
      expect(
        (
          await admin`
            select account, paused, ref_backfill_since_at as "coverageSinceAt"
            from github_account_checkpoints
            order by account
          `
        ).map((row) => ({
          ...row,
          coverageSinceAt: new Date(row.coverageSinceAt),
        }))
      ).toEqual([
        { account: "f0rr0", coverageSinceAt: august1, paused: false },
        {
          account: "yuppiestechdev",
          coverageSinceAt: august1,
          paused: true,
        },
      ]);
      expect(
        (
          await admin`
            select coverage_since_at as "coverageSinceAt", generation::int
            from github_ref_generations
            where repository_id = '3' and ref_name = 'refs/heads/main'
          `
        ).map((row) => ({
          ...row,
          coverageSinceAt: new Date(row.coverageSinceAt),
        }))
      ).toEqual([{ coverageSinceAt: august1, generation: 2 }]);
    });
  }
);
