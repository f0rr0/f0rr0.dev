import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "../src/env.ts";

setDefaultTimeout(30_000);

const dockerAvailable =
  Bun.spawnSync(["docker", "info"], {
    stderr: "ignore",
    stdout: "ignore",
  }).exitCode === 0;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const postgresImage = "postgres:17-alpine";
const postgresPassword = "github-pr-store-test";
const repositoryId = "8301";
const firstHeadSha = "a".repeat(40);
const secondHeadSha = "b".repeat(40);
const thirdHeadSha = "c".repeat(40);
const mergeSha = "d".repeat(40);
const providerUpdatedAt = "2026-08-30T12:00:00.000Z";

const repository = {
  defaultBranch: "main",
  fullName: "f0rr0/pr-store-test",
  htmlUrl: "https://github.com/f0rr0/pr-store-test",
  id: repositoryId,
  ownerAvatarUrl: "https://avatars.example/f0rr0",
  ownerId: "8574219",
  ownerLogin: "f0rr0",
  ownerType: "User",
  pushedAt: providerUpdatedAt,
  visibility: "public",
};

const pullRequest = (overrides = {}) => ({
  action: "synchronize",
  additions: 12,
  author: "f0rr0",
  authorAccount: "f0rr0",
  authorUserId: "8574219",
  baseRef: "main",
  baseRepository: repository,
  baseSha: "e".repeat(40),
  body: "A complete pull request snapshot.",
  changedFiles: 2,
  closedAt: null,
  commitCount: 2,
  createdAt: "2026-08-30T11:00:00.000Z",
  deletions: 4,
  draft: false,
  headRef: "feature",
  headRepository: repository,
  headSha: firstHeadSha,
  id: "991",
  mergeCommitSha: undefined,
  merged: false,
  mergedAt: null,
  nodeId: "PR_pr_store_8301",
  number: 17,
  providerUpdatedAt,
  repository,
  state: "open",
  title: "Consolidate persistence",
  url: "https://github.com/f0rr0/pr-store-test/pull/17",
  ...overrides,
});

const checkedOutput = (result, operation) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${operation} failed: ${result.stderr.toString("utf-8").trim()}`
    );
  }
  return result.stdout.toString("utf-8").trim();
};

describe.skipIf(!dockerAvailable)("GitHub pull request persistence", () => {
  let admin;
  let closeDatabase;
  let claimDueGitHubPullRequests;
  let containerId;
  let database;
  let originalDatabaseUrl;
  let persistGitHubPullRequestSnapshot;
  let persistGitHubWebhookPullRequest;
  let releaseGitHubPullRequestReconciliation;
  let schema;

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
      "POSTGRES_DB=github_pr_store_test",
      postgresImage,
    ]);
    containerId = checkedOutput(started, "Starting ephemeral PostgreSQL");
    const publishedPort = checkedOutput(
      Bun.spawnSync(["docker", "port", containerId, "5432/tcp"]),
      "Resolving ephemeral PostgreSQL port"
    );
    const port = /:(\d+)$/u.exec(publishedPort)?.[1];
    if (port === undefined) {
      throw new Error("Docker returned an invalid PostgreSQL port.");
    }
    const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_pr_store_test`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const probe = postgres(databaseUrl, {
        connect_timeout: 1,
        max: 1,
        prepare: false,
      });
      try {
        await probe`select 1`;
        await probe.end({ timeout: 1 });
        ready = true;
        break;
      } catch {
        await probe.end({ timeout: 1 }).catch(() => null);
        await delay(100);
      }
    }
    if (!ready) {
      throw new Error("Ephemeral PostgreSQL did not become ready.");
    }
    admin = postgres(databaseUrl, {
      max: 1,
      onnotice: (notice) => void notice,
      prepare: false,
    });
    await migrate(drizzle({ client: admin }), { migrationsFolder });
    env.DATABASE_URL = databaseUrl;
    schema = await import("../src/db/schema.ts");
    ({ closeDatabase, getDatabase: database } =
      await import("../src/db/client.ts"));
    database = database();
    ({ persistGitHubWebhookPullRequest } =
      await import("../src/lib/github-commits-store.ts"));
    ({
      claimDueGitHubPullRequests,
      persistGitHubPullRequestSnapshot,
      releaseGitHubPullRequestReconciliation,
    } = await import("../src/lib/github-activity-worker-store.ts"));
  });

  afterAll(async () => {
    await closeDatabase?.();
    await admin?.end({ timeout: 1 });
    if (originalDatabaseUrl === undefined) {
      delete env.DATABASE_URL;
    } else {
      env.DATABASE_URL = originalDatabaseUrl;
    }
    if (containerId !== undefined) {
      Bun.spawnSync(["docker", "stop", "--time", "1", containerId], {
        stderr: "ignore",
        stdout: "ignore",
      });
    }
  });

  test("promotes an equal-time terminal signal without trusting its merge SHA", async () => {
    const initial = await persistGitHubWebhookPullRequest(
      "00000000-0000-4000-8000-000000000001",
      "f0rr0",
      pullRequest()
    );
    expect(initial.pullRequests).toBe(1);

    await database
      .update(schema.githubPullRequests)
      .set({
        nextReconcileAt: new Date("2026-09-01T00:00:00.000Z"),
        reconcileAttempts: 4,
        reconcileError: "temporary",
      })
      .where(eq(schema.githubPullRequests.nodeId, "PR_pr_store_8301"));

    const terminalSignal = pullRequest({
      action: "closed",
      closedAt: providerUpdatedAt,
      mergeCommitSha: mergeSha,
      merged: true,
      mergedAt: providerUpdatedAt,
      state: "closed",
    });
    const promoted = await persistGitHubWebhookPullRequest(
      "00000000-0000-4000-8000-000000000002",
      "f0rr0",
      terminalSignal
    );
    expect(promoted.pullRequests).toBe(1);

    const [observed] = await database
      .select()
      .from(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, "PR_pr_store_8301"));
    const [version] = await database
      .select()
      .from(schema.githubPullRequestVersions)
      .where(eq(schema.githubPullRequestVersions.isCurrent, true));
    expect(observed).toMatchObject({
      mergeSha: null,
      mergeShaVerifiedAt: null,
      reconcileAttempts: 0,
      reconcileError: null,
      state: "merged",
    });
    expect(observed.terminalAt.toISOString()).toBe(providerUpdatedAt);
    expect(version).toMatchObject({
      headSha: firstHeadSha,
      isCurrent: true,
      mergeSnapshot: true,
    });

    await persistGitHubPullRequestSnapshot("f0rr0", terminalSignal);
    const [verified] = await database
      .select()
      .from(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, "PR_pr_store_8301"));
    expect(verified).toMatchObject({ mergeSha, state: "merged" });
    expect(verified.mergeShaVerifiedAt).not.toBeNull();
  });

  test("claims due schedules written with PostgreSQL microsecond precision", async () => {
    const nodeId = "PR_pr_store_microsecond_schedule_8301";
    await persistGitHubPullRequestSnapshot(
      "f0rr0",
      pullRequest({ nodeId, number: 117 })
    );
    await admin`
      update github_pull_requests
      set next_reconcile_at = '2026-09-01T00:00:00.000789Z'::timestamptz,
          reconcile_attempts = 0
      where node_id = ${nodeId}
    `;

    const [claimed] = await claimDueGitHubPullRequests(
      "f0rr0",
      Number.POSITIVE_INFINITY,
      1,
      new Date("2026-09-01T00:00:01.000Z")
    );

    expect(claimed).toMatchObject({ attemptCount: 1, nodeId });
    await releaseGitHubPullRequestReconciliation(claimed);
  });

  test("orders provider snapshots and switches only authoritative current versions", async () => {
    const newerAt = "2026-08-30T12:01:00.000Z";
    const nodeId = "PR_pr_store_8302";
    const secondPullRequest = (overrides = {}) =>
      pullRequest({ nodeId, number: 18, ...overrides });
    await persistGitHubPullRequestSnapshot(
      "f0rr0",
      secondPullRequest({
        headSha: secondHeadSha,
        providerUpdatedAt: newerAt,
      })
    );

    await persistGitHubWebhookPullRequest(
      "00000000-0000-4000-8000-000000000003",
      "f0rr0",
      secondPullRequest({ providerUpdatedAt: "2026-08-30T11:59:00.000Z" })
    );
    await persistGitHubWebhookPullRequest(
      "00000000-0000-4000-8000-000000000004",
      "f0rr0",
      secondPullRequest({ providerUpdatedAt: newerAt })
    );

    let [stored] = await database
      .select()
      .from(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    let versions = await database
      .select()
      .from(schema.githubPullRequestVersions)
      .where(eq(schema.githubPullRequestVersions.pullRequestNodeId, nodeId))
      .orderBy(asc(schema.githubPullRequestVersions.observedAt));
    expect(stored.headSha).toBe(secondHeadSha);
    expect(versions.filter(({ isCurrent }) => isCurrent)).toHaveLength(1);
    expect(versions.find(({ isCurrent }) => isCurrent)?.headSha).toBe(
      secondHeadSha
    );

    await persistGitHubPullRequestSnapshot(
      "f0rr0",
      secondPullRequest({ headSha: thirdHeadSha, providerUpdatedAt: newerAt })
    );
    [stored] = await database
      .select()
      .from(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    versions = await database
      .select()
      .from(schema.githubPullRequestVersions)
      .where(eq(schema.githubPullRequestVersions.pullRequestNodeId, nodeId));
    expect(stored.headSha).toBe(thirdHeadSha);
    expect(versions.filter(({ isCurrent }) => isCurrent)).toHaveLength(1);
    expect(versions.find(({ isCurrent }) => isCurrent)?.headSha).toBe(
      thirdHeadSha
    );
  });
});
