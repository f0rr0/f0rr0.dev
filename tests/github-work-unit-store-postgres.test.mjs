import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "../src/env.ts";
import { GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST } from "../src/lib/github-work-unit-summary.ts";

setDefaultTimeout(30_000);

const dockerAvailable =
  Bun.spawnSync(["docker", "info"], {
    stderr: "ignore",
    stdout: "ignore",
  }).exitCode === 0;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const postgresImage = "postgres:17-alpine";
const postgresPassword = "github-work-unit-store-test";
const repositoryId = "7001";
const lineageId = "70010000-0000-4000-8000-000000000001";
const firstSha = "a".repeat(40);
const secondSha = "b".repeat(40);
const pullRequestNodeId = "PR_associated_landing_7001";
const observedAt = new Date("2026-08-30T12:00:00.000Z");

const fileFact = (filename) => ({
  additions: 1,
  binary: false,
  deletions: 1,
  filename,
  patch: `@@ -1 +1 @@\n-old\n+${filename}`,
  patchComplete: true,
  previousFilename: null,
  status: "modified",
});

const summaryResult = (outcome) => ({
  inputTokens: 20,
  latencyMs: 1,
  model: "gpt-5.4-nano-2026-03-17",
  outcome,
  outputTokens: 8,
});

const checkedOutput = (result, operation) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${operation} failed: ${result.stderr.toString("utf-8").trim()}`
    );
  }
  return result.stdout.toString("utf-8").trim();
};

describe.skipIf(!dockerAvailable)("GitHub work-unit projection store", () => {
  let admin;
  let closeDatabase;
  let containerId;
  let database;
  let claimGitHubWorkUnitSummary;
  let completeGitHubWorkUnitSummary;
  let deferGitHubWorkUnitSummary;
  let originalDatabaseUrl;
  let persistGitHubWebhookIssue;
  let completeGitHubWorkUnitProjectionRequest;
  let ensureGitHubWorkUnitProjectionRequest;
  let readPublicGitHubActivityPage;
  let readGitHubFactualWorkerBacklog;
  let refreshGitHubWorkUnitProjection;
  let requestGitHubWorkUnitProjection;
  let runGitHubActivityWorker;
  let schema;
  let terminalGitHubWorkUnitSummary;

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
      "POSTGRES_DB=github_work_unit_store_test",
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
    const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_work_unit_store_test`;
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
    ({ refreshGitHubWorkUnitProjection } =
      await import("../src/lib/github-work-unit-store.ts"));
    ({ persistGitHubWebhookIssue } =
      await import("../src/lib/github-commits-store.ts"));
    ({
      claimGitHubWorkUnitSummary,
      completeGitHubWorkUnitSummary,
      deferGitHubWorkUnitSummary,
      terminalGitHubWorkUnitSummary,
    } = await import("../src/lib/github-work-unit-summary-store.ts"));
    ({ readPublicGitHubActivityPage } =
      await import("../src/lib/github-activity-store.ts"));
    ({ readGitHubFactualWorkerBacklog } =
      await import("../src/lib/github-backfill-store.ts"));
    ({ runGitHubActivityWorker } =
      await import("../src/lib/github-activity-worker.ts"));
    ({
      completeGitHubWorkUnitProjectionRequest,
      ensureGitHubWorkUnitProjectionRequest,
      requestGitHubWorkUnitProjection,
    } = await import("../src/lib/github-work-unit-projection-state.ts"));

    await database.insert(schema.githubRepositories).values({
      defaultBranch: "main",
      factsVerifiedAt: observedAt,
      firstObservedAt: observedAt,
      fullName: "f0rr0/projection-store-test",
      headsLastReconciledAt: observedAt,
      id: repositoryId,
      lastObservedAt: observedAt,
      visibility: "public",
    });
    await database.insert(schema.githubRepositoryRefs).values({
      active: true,
      branchLineageId: lineageId,
      firstObservedAt: observedAt,
      headSha: firstSha,
      kind: "head",
      lastObservedAt: observedAt,
      projectionRelevant: true,
      refName: "refs/heads/main",
      repositoryId,
    });
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: observedAt,
      committerAt: observedAt,
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [fileFact("src/first.ts")],
      fileFactsComplete: true,
      firstObservedAt: observedAt,
      message: "first",
      parentShas: [],
      pullRequestDiscoveryState: "complete",
      repositoryId,
      sha: firstSha,
    });
    await database.insert(schema.githubRefGenerations).values({
      branchLineageId: lineageId,
      completedAt: observedAt,
      coverageSinceAt: new Date("2026-08-01T00:00:00.000Z"),
      generation: 1,
      headSha: firstSha,
      refName: "refs/heads/main",
      repositoryId,
    });
    await database.insert(schema.githubRefMemberships).values({
      commitRepositoryId: repositoryId,
      commitSha: firstSha,
      generation: 1,
      position: 0,
      refName: "refs/heads/main",
      repositoryId,
    });
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

  test("keeps generated file-evidence fingerprints in sync with stored facts", async () => {
    const pullRequestDigestNodeId = "PR_file_digest_7001";
    const pullRequestVersionId = "70010000-0000-4000-8000-000000000099";
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "8574219",
      baseRepositoryId: repositoryId,
      baseSha: firstSha,
      commitCount: 0,
      createdAt: observedAt,
      headRepositoryId: repositoryId,
      headSha: firstSha,
      nodeId: pullRequestDigestNodeId,
      number: 99,
      providerUpdatedAt: observedAt,
      repositoryId,
      state: "open",
      title: "digest fixture",
      titleSnapshot: "digest fixture",
      url: "https://github.com/f0rr0/projection-store-test/pull/99",
    });
    await database.insert(schema.githubPullRequestVersions).values({
      baseRepositoryId: repositoryId,
      baseSha: firstSha,
      commitCount: 0,
      fileFacts: [fileFact("src/pr-before.ts")],
      fileFactsComplete: true,
      headRepositoryId: repositoryId,
      headSha: firstSha,
      id: pullRequestVersionId,
      membershipComplete: true,
      observedAt,
      providerUpdatedAt: observedAt,
      pullRequestNodeId: pullRequestDigestNodeId,
    });

    const [commitBefore] = await database
      .select({ digest: schema.githubCommits.fileFactsDigest })
      .from(schema.githubCommits)
      .where(
        and(
          eq(schema.githubCommits.repositoryId, repositoryId),
          eq(schema.githubCommits.sha, firstSha)
        )
      );
    const [pullRequestBefore] = await database
      .select({ digest: schema.githubPullRequestVersions.fileFactsDigest })
      .from(schema.githubPullRequestVersions)
      .where(eq(schema.githubPullRequestVersions.id, pullRequestVersionId));

    expect(commitBefore.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(pullRequestBefore.digest).toMatch(/^[a-f0-9]{64}$/u);

    await database
      .update(schema.githubCommits)
      .set({ fileFacts: [fileFact("src/commit-after.ts")] })
      .where(
        and(
          eq(schema.githubCommits.repositoryId, repositoryId),
          eq(schema.githubCommits.sha, firstSha)
        )
      );
    await database
      .update(schema.githubPullRequestVersions)
      .set({ fileFacts: [fileFact("src/pr-after.ts")] })
      .where(eq(schema.githubPullRequestVersions.id, pullRequestVersionId));

    const [commitAfter] = await database
      .select({ digest: schema.githubCommits.fileFactsDigest })
      .from(schema.githubCommits)
      .where(
        and(
          eq(schema.githubCommits.repositoryId, repositoryId),
          eq(schema.githubCommits.sha, firstSha)
        )
      );
    const [pullRequestAfter] = await database
      .select({ digest: schema.githubPullRequestVersions.fileFactsDigest })
      .from(schema.githubPullRequestVersions)
      .where(eq(schema.githubPullRequestVersions.id, pullRequestVersionId));

    expect(commitAfter.digest).not.toBe(commitBefore.digest);
    expect(pullRequestAfter.digest).not.toBe(pullRequestBefore.digest);

    await database
      .update(schema.githubCommits)
      .set({ fileFacts: [fileFact("src/first.ts")] })
      .where(
        and(
          eq(schema.githubCommits.repositoryId, repositoryId),
          eq(schema.githubCommits.sha, firstSha)
        )
      );
    await database
      .delete(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, pullRequestDigestNodeId));
  });

  test("rejects malformed stored evidence instead of silently losing work", async () => {
    await database
      .update(schema.githubCommits)
      .set({ fileFacts: [{ filename: "src/malformed.ts" }] })
      .where(
        and(
          eq(schema.githubCommits.repositoryId, repositoryId),
          eq(schema.githubCommits.sha, firstSha)
        )
      );
    try {
      await expect(
        refreshGitHubWorkUnitProjection(new Date("2026-08-30T12:00:30.000Z"))
      ).rejects.toThrow(TypeError);
    } finally {
      await database
        .update(schema.githubCommits)
        .set({ fileFacts: [fileFact("src/first.ts")] })
        .where(
          and(
            eq(schema.githubCommits.repositoryId, repositoryId),
            eq(schema.githubCommits.sha, firstSha)
          )
        );
    }
  });

  test("backfill waits only for incomplete or failed PR evidence", async () => {
    const backlogRepositoryId = "7093";
    const nodeId = "PR_backfill_blocker_7093";
    const versionId = "70930000-0000-4000-8000-000000000001";
    const baseSha = "c".repeat(40);
    const headSha = "d".repeat(40);
    const now = new Date("2026-09-21T12:00:00.000Z");
    const leaseUntil = new Date("2026-09-21T12:05:00.000Z");
    const scope = {
      repositoryId: backlogRepositoryId,
      sinceAt: new Date("2026-09-01T00:00:00.000Z"),
      untilAt: new Date("2026-09-30T23:59:59.999Z"),
    };
    const readBacklog = async () =>
      await readGitHubFactualWorkerBacklog({
        accounts: ["f0rr0"],
        now,
        scope,
      });

    await database.insert(schema.githubRepositories).values({
      defaultBranch: "main",
      factsVerifiedAt: now,
      firstObservedAt: now,
      fullName: "f0rr0/backfill-blocker-test",
      id: backlogRepositoryId,
      lastObservedAt: now,
      visibility: "public",
    });
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "8574219",
      baseRepositoryId: backlogRepositoryId,
      baseSha,
      changedFiles: 1,
      commitCount: 1,
      createdAt: now,
      headRepositoryId: backlogRepositoryId,
      headSha,
      nextReconcileAt: new Date(now.getTime() - 1),
      nodeId,
      number: 1,
      providerUpdatedAt: now,
      repositoryId: backlogRepositoryId,
      state: "open",
      title: "complete evidence",
      titleSnapshot: "complete evidence",
      url: "https://github.com/f0rr0/backfill-blocker-test/pull/1",
    });
    await database.insert(schema.githubPullRequestVersions).values({
      baseRepositoryId: backlogRepositoryId,
      baseSha,
      commitCount: 1,
      fileFacts: [fileFact("src/complete.ts")],
      fileFactsComplete: true,
      headRepositoryId: backlogRepositoryId,
      headSha,
      id: versionId,
      membershipComplete: true,
      observedAt: now,
      providerUpdatedAt: now,
      pullRequestNodeId: nodeId,
    });
    await database.insert(schema.githubPullRequestMemberships).values({
      commitRepositoryId: backlogRepositoryId,
      commitSha: headSha,
      isHead: true,
      position: 0,
      versionId,
    });

    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(0);

    await database
      .update(schema.githubPullRequests)
      .set({ nextReconcileAt: leaseUntil, reconcileAttempts: 1 })
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(0);

    await database
      .update(schema.githubPullRequestVersions)
      .set({ isCurrent: false })
      .where(eq(schema.githubPullRequestVersions.id, versionId));
    expect(await readBacklog()).toMatchObject({
      pending: { pullRequestReconciliation: 1 },
      retryAt: leaseUntil,
    });

    await database
      .update(schema.githubPullRequestVersions)
      .set({ isCurrent: true, membershipComplete: false })
      .where(eq(schema.githubPullRequestVersions.id, versionId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(1);

    await database
      .update(schema.githubPullRequestVersions)
      .set({ fileFactsComplete: false, membershipComplete: true })
      .where(eq(schema.githubPullRequestVersions.id, versionId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(1);

    await database
      .update(schema.githubPullRequestVersions)
      .set({ fileFactsComplete: true })
      .where(eq(schema.githubPullRequestVersions.id, versionId));
    await database
      .update(schema.githubPullRequests)
      .set({ mergedAt: now, state: "merged", terminalAt: now })
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(1);

    await database
      .update(schema.githubPullRequests)
      .set({ mergeShaVerifiedAt: now })
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(1);

    await database
      .update(schema.githubPullRequestVersions)
      .set({ mergeSnapshot: true })
      .where(eq(schema.githubPullRequestVersions.id, versionId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(0);

    await database
      .update(schema.githubPullRequests)
      .set({ reconcileError: "provider_unavailable" })
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    expect((await readBacklog()).pending.pullRequestReconciliation).toBe(1);

    await database
      .update(schema.githubPullRequests)
      .set({ nextReconcileAt: null })
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    expect(await readBacklog()).toMatchObject({
      pending: { pullRequestReconciliation: 0 },
      unavailable: 1,
    });

    await database
      .delete(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    await database
      .delete(schema.githubRepositories)
      .where(eq(schema.githubRepositories.id, backlogRepositoryId));
  });

  test("clears only the projection request token it observed", async () => {
    const first = await requestGitHubWorkUnitProjection(database);
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBe(first);

    const replacement = await requestGitHubWorkUnitProjection(database);
    expect(replacement).not.toBe(first);
    expect(await completeGitHubWorkUnitProjectionRequest(first)).toBe(false);
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBe(replacement);

    expect(await completeGitHubWorkUnitProjectionRequest(replacement)).toBe(
      true
    );
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBeNull();

    await database
      .update(schema.githubPublicFeedHead)
      .set({
        projectionRequestToken: null,
        summaryPolicyDigest: GITHUB_WORK_UNIT_SUMMARY_POLICY_DIGEST,
      })
      .where(eq(schema.githubPublicFeedHead.id, true));
    const policyUpgrade = await ensureGitHubWorkUnitProjectionRequest();
    expect(policyUpgrade).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await completeGitHubWorkUnitProjectionRequest(policyUpgrade)).toBe(
      true
    );
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBeNull();
  });

  test("atomically swaps public facts, revisions, and summary eligibility", async () => {
    const first = await refreshGitHubWorkUnitProjection(observedAt);
    expect(first).toMatchObject({
      changed: true,
      feedRevisionChanged: true,
      insertedUnits: 1,
      orderingRevisionChanged: true,
      summaryAttemptsQueued: 1,
      summaryInputsFailed: 0,
    });
    const [unit] = await database.select().from(schema.githubWorkUnits);
    const [head] = await database.select().from(schema.githubPublicFeedHead);
    const attempts = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts);
    expect(unit).toMatchObject({
      identityKey: `canonical:${repositoryId}:2026-08-30`,
      memberCount: 1,
      revision: 1,
      visibility: "public",
    });
    expect(unit.summaryInputDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(unit.summaryEvaluatedDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(head).toMatchObject({
      feedRevision: 1,
      headContentRevision: 1,
      orderingRevision: 1,
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      outcomeDigest: unit.outcomeDigest,
      state: "pending",
      summaryInputDigest: unit.summaryInputDigest,
    });
    expect(attempts[0].requestPayload).not.toBeNull();

    const unchanged = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T12:01:00.000Z")
    );
    const [unchangedHead] = await database
      .select()
      .from(schema.githubPublicFeedHead);
    expect(unchanged).toMatchObject({
      changed: false,
      feedRevisionChanged: false,
      orderingRevisionChanged: false,
      summaryAttemptsQueued: 0,
    });
    expect(unchangedHead).toMatchObject({
      feedRevision: 1,
      headContentRevision: 1,
      orderingRevision: 1,
    });
  });

  test("reactivates an exact cached summary and revises the public head", async () => {
    const firstClaim = await claimGitHubWorkUnitSummary({
      now: new Date("2026-08-30T12:06:00.000Z"),
    });
    expect(firstClaim).not.toBeNull();
    await completeGitHubWorkUnitSummary(
      firstClaim,
      summaryResult("Cached outcome A."),
      new Date("2026-08-30T12:06:01.000Z")
    );
    const [firstUnit] = await database.select().from(schema.githubWorkUnits);
    const inputA = firstUnit.summaryInputDigest;

    await database
      .update(schema.githubRepositories)
      .set({ description: "Temporary repository context B." })
      .where(eq(schema.githubRepositories.id, repositoryId));
    await refreshGitHubWorkUnitProjection(new Date("2026-08-30T12:07:00.000Z"));
    const secondClaim = await claimGitHubWorkUnitSummary({
      now: new Date("2026-08-30T12:13:00.000Z"),
    });
    expect(secondClaim).not.toBeNull();
    await completeGitHubWorkUnitSummary(
      secondClaim,
      summaryResult("Current outcome B."),
      new Date("2026-08-30T12:13:01.000Z")
    );

    await database
      .update(schema.githubRepositories)
      .set({ description: null })
      .where(eq(schema.githubRepositories.id, repositoryId));
    const [beforeReversion] = await database
      .select()
      .from(schema.githubPublicFeedHead);
    const reverted = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T12:14:00.000Z")
    );
    const [revertedUnit] = await database.select().from(schema.githubWorkUnits);
    const [afterReversion] = await database
      .select()
      .from(schema.githubPublicFeedHead);
    const page = await readPublicGitHubActivityPage(null, 1);
    const [publicUnit] = page.days[0].repositories[0].items;

    expect(reverted).toMatchObject({
      feedRevisionChanged: true,
      summaryAttemptsQueued: 0,
    });
    expect(revertedUnit.summaryInputDigest).toBe(inputA);
    expect(afterReversion.feedRevision).toBe(beforeReversion.feedRevision + 1);
    expect(afterReversion.headContentRevision).toBe(
      beforeReversion.headContentRevision + 1
    );
    expect(publicUnit).toMatchObject({ outcome: "Cached outcome A." });
  });

  test("reuses a superseded paid input without resetting its request budget", async () => {
    await database
      .update(schema.githubRepositories)
      .set({ description: "Retryable context C." })
      .where(eq(schema.githubRepositories.id, repositoryId));
    await refreshGitHubWorkUnitProjection(new Date("2026-08-30T12:15:00.000Z"));
    const firstClaim = await claimGitHubWorkUnitSummary({
      now: new Date("2026-08-30T12:21:00.000Z"),
    });
    expect(firstClaim).not.toBeNull();

    await database
      .update(schema.githubRepositories)
      .set({ description: "Superseding context D." })
      .where(eq(schema.githubRepositories.id, repositoryId));
    await refreshGitHubWorkUnitProjection(new Date("2026-08-30T12:22:00.000Z"));
    expect(
      await deferGitHubWorkUnitSummary(
        firstClaim,
        new Date("2026-08-30T12:24:00.000Z"),
        new Date("2026-08-30T12:22:01.000Z")
      )
    ).toBe("stale");
    const [parked] = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(
        and(
          eq(
            schema.githubWorkUnitSummaryAttempts.workUnitId,
            firstClaim.workUnitId
          ),
          eq(schema.githubWorkUnitSummaryAttempts.revision, firstClaim.revision)
        )
      );
    expect(parked).toMatchObject({
      requestPayload: null,
      startedRequests: 1,
      state: "retryable",
    });

    await database
      .update(schema.githubRepositories)
      .set({ description: "Retryable context C." })
      .where(eq(schema.githubRepositories.id, repositoryId));
    const reactivated = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T12:23:00.000Z")
    );
    expect(reactivated).toMatchObject({ summaryAttemptsQueued: 0 });
    const [rehydrated] = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(
        and(
          eq(
            schema.githubWorkUnitSummaryAttempts.workUnitId,
            firstClaim.workUnitId
          ),
          eq(schema.githubWorkUnitSummaryAttempts.revision, firstClaim.revision)
        )
      );
    expect(rehydrated).toMatchObject({
      debounceUntil: new Date("2026-08-30T12:28:00.000Z"),
      requestPayload: firstClaim.serializedInput,
      startedRequests: 1,
      state: "retryable",
    });
    expect(
      await claimGitHubWorkUnitSummary({
        now: new Date("2026-08-30T12:27:59.999Z"),
      })
    ).toBeNull();
    const secondClaim = await claimGitHubWorkUnitSummary({
      now: new Date("2026-08-30T12:28:00.000Z"),
    });
    expect(secondClaim).toMatchObject({
      revision: firstClaim.revision,
      startedRequests: 2,
      workUnitId: firstClaim.workUnitId,
    });
    await terminalGitHubWorkUnitSummary(
      secondClaim,
      new Date("2026-08-30T12:28:01.000Z")
    );

    await database
      .update(schema.githubRepositories)
      .set({ description: null })
      .where(eq(schema.githubRepositories.id, repositoryId));
    await refreshGitHubWorkUnitProjection(new Date("2026-08-30T13:02:00.000Z"));
  });

  test("does not infer a landing from associations or another repository's verified SHA", async () => {
    const secondObservedAt = new Date("2026-08-30T13:00:00.000Z");
    const foreignBaseRepositoryId = "7009";
    const foreignPullRequestNodeId = "PR_foreign_landing_7001";
    await database.insert(schema.githubRepositories).values({
      factsVerifiedAt: secondObservedAt,
      firstObservedAt: secondObservedAt,
      fullName: "example/foreign-projection-store-test",
      id: foreignBaseRepositoryId,
      lastObservedAt: secondObservedAt,
      visibility: "public",
    });
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "9000",
      createdAt: secondObservedAt,
      mergedAt: secondObservedAt,
      nodeId: pullRequestNodeId,
      number: 71,
      providerUpdatedAt: secondObservedAt,
      repositoryId,
      state: "merged",
      terminalAt: secondObservedAt,
      title: "associated",
      titleSnapshot: "associated",
      url: "https://github.com/f0rr0/projection-store-test/pull/71",
    });
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "9000",
      createdAt: secondObservedAt,
      mergeSha: secondSha,
      mergeShaVerifiedAt: secondObservedAt,
      mergedAt: secondObservedAt,
      nodeId: foreignPullRequestNodeId,
      number: 72,
      providerUpdatedAt: secondObservedAt,
      repositoryId: foreignBaseRepositoryId,
      state: "merged",
      terminalAt: secondObservedAt,
      title: "foreign associated",
      titleSnapshot: "foreign associated",
      url: "https://github.com/example/foreign-projection-store-test/pull/72",
    });
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: secondObservedAt,
      committerAt: secondObservedAt,
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [fileFact("src/second.ts")],
      fileFactsComplete: true,
      firstObservedAt: secondObservedAt,
      message: "second",
      parentShas: [firstSha],
      pullRequestDiscoveryState: "complete",
      repositoryId,
      sha: secondSha,
    });
    await database.insert(schema.githubCommitPullRequestAssociations).values([
      {
        commitRepositoryId: repositoryId,
        commitSha: secondSha,
        pullRequestNodeId,
      },
      {
        commitRepositoryId: repositoryId,
        commitSha: secondSha,
        pullRequestNodeId: foreignPullRequestNodeId,
      },
    ]);
    await database
      .delete(schema.githubRefMemberships)
      .where(eq(schema.githubRefMemberships.repositoryId, repositoryId));
    await database
      .update(schema.githubRefGenerations)
      .set({
        completedAt: secondObservedAt,
        generation: 2,
        headSha: secondSha,
      })
      .where(eq(schema.githubRefGenerations.repositoryId, repositoryId));
    await database
      .update(schema.githubRepositoryRefs)
      .set({ headSha: secondSha, lastObservedAt: secondObservedAt })
      .where(eq(schema.githubRepositoryRefs.repositoryId, repositoryId));
    await database.insert(schema.githubRefMemberships).values([
      {
        commitRepositoryId: repositoryId,
        commitSha: firstSha,
        generation: 2,
        position: 0,
        refName: "refs/heads/main",
        repositoryId,
      },
      {
        commitRepositoryId: repositoryId,
        commitSha: secondSha,
        generation: 2,
        position: 1,
        refName: "refs/heads/main",
        repositoryId,
      },
    ]);

    const result = await refreshGitHubWorkUnitProjection(secondObservedAt);
    const [unit] = await database.select().from(schema.githubWorkUnits);
    expect(result.exclusionReasonCounts.merged_pr_landing).toBe(0);
    expect(unit).toMatchObject({ memberCount: 2 });

    await database
      .delete(schema.githubPullRequests)
      .where(
        inArray(schema.githubPullRequests.nodeId, [
          pullRequestNodeId,
          foreignPullRequestNodeId,
        ])
      );
  });

  test("withholds a provider-verified squash landing without a commit association", async () => {
    const mergedAt = new Date("2026-08-30T13:01:30.000Z");
    const nodeId = "PR_verified_squash_landing_7001";
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "9000",
      createdAt: mergedAt,
      mergeSha: secondSha,
      mergeShaVerifiedAt: mergedAt,
      mergedAt,
      nodeId,
      number: 73,
      providerUpdatedAt: mergedAt,
      repositoryId,
      state: "merged",
      terminalAt: mergedAt,
      title: "verified squash landing",
      titleSnapshot: "verified squash landing",
      url: "https://github.com/f0rr0/projection-store-test/pull/73",
    });

    const excluded = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T13:01:31.000Z")
    );
    const [withoutLanding] = await database
      .select()
      .from(schema.githubWorkUnits);
    expect(excluded.exclusionReasonCounts.merged_pr_landing).toBe(1);
    expect(withoutLanding).toMatchObject({ memberCount: 1 });

    await database
      .update(schema.githubRepositories)
      .set({ defaultBranch: "trunk" })
      .where(eq(schema.githubRepositories.id, repositoryId));
    const sideRefExcluded = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T13:01:31.500Z")
    );
    const [withoutSideRefLanding] = await database
      .select()
      .from(schema.githubWorkUnits);
    expect(sideRefExcluded.exclusionReasonCounts.merged_pr_landing).toBe(1);
    expect(withoutSideRefLanding).toMatchObject({ memberCount: 1 });

    await database
      .delete(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.nodeId, nodeId));
    await database
      .update(schema.githubRepositories)
      .set({ defaultBranch: "main" })
      .where(eq(schema.githubRepositories.id, repositoryId));
    const restored = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T13:01:32.000Z")
    );
    const [withLanding] = await database.select().from(schema.githubWorkUnits);
    expect(restored.exclusionReasonCounts.merged_pr_landing).toBe(0);
    expect(withLanding).toMatchObject({ memberCount: 2 });
  });

  test("purges private prose and removes unknown visibility instead of leaking", async () => {
    await database
      .update(schema.githubRepositories)
      .set({ visibility: "private" })
      .where(eq(schema.githubRepositories.id, repositoryId));
    const privateResult = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T14:00:00.000Z")
    );
    const [privateUnit] = await database.select().from(schema.githubWorkUnits);
    const privateAttempts = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts);
    expect(privateResult).toMatchObject({
      feedRevisionChanged: true,
      summaryAttemptsQueued: 0,
      updatedUnits: 1,
    });
    expect(privateUnit).toMatchObject({
      summaryInputDigest: null,
      visibility: "private",
    });
    expect(privateAttempts).toEqual([]);

    await database.insert(schema.githubRepositoryInventoryHeads).values([
      {
        accountLogin: "f0rr0",
        accountUserId: "8574219",
        completedAt: new Date("2026-08-30T14:01:00.000Z"),
        generation: 1,
        updatedAt: new Date("2026-08-30T14:01:00.000Z"),
      },
      {
        accountLogin: "yuppiestechdev",
        accountUserId: "99666891",
        completedAt: new Date("2026-08-30T14:01:00.000Z"),
        generation: 1,
        updatedAt: new Date("2026-08-30T14:01:00.000Z"),
      },
    ]);
    const unknownResult = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T14:01:00.000Z")
    );
    expect(unknownResult).toMatchObject({
      deletedUnits: 1,
      feedRevisionChanged: true,
      orderingRevisionChanged: true,
    });
    expect(await database.select().from(schema.githubWorkUnits)).toEqual([]);
  });

  test("summarizes only owned evidence when a tracked PR includes collaborator commits", async () => {
    const collaborativeRepositoryId = "7002";
    const ownedSha = "d".repeat(40);
    const collaboratorSha = "e".repeat(40);
    const baseSha = "f".repeat(40);
    const versionId = "70020000-0000-4000-8000-000000000001";
    const nodeId = "PR_collaborative_7002";
    const activityAt = new Date("2026-08-31T10:00:00.000Z");
    await database.insert(schema.githubRepositories).values({
      defaultBranch: "main",
      factsVerifiedAt: activityAt,
      firstObservedAt: activityAt,
      fullName: "f0rr0/collaborative-pr-test",
      id: collaborativeRepositoryId,
      lastObservedAt: activityAt,
      visibility: "public",
    });
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: activityAt,
      committerAt: activityAt,
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [fileFact("src/owned-only.ts")],
      fileFactsComplete: true,
      firstObservedAt: activityAt,
      message: "owned",
      parentShas: [baseSha],
      pullRequestDiscoveryState: "complete",
      repositoryId: collaborativeRepositoryId,
      sha: ownedSha,
    });
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "8574219",
      baseRepositoryId: collaborativeRepositoryId,
      baseSha,
      commitCount: 2,
      createdAt: activityAt,
      headRepositoryId: collaborativeRepositoryId,
      headSha: collaboratorSha,
      nodeId,
      number: 72,
      providerUpdatedAt: activityAt,
      repositoryId: collaborativeRepositoryId,
      state: "open",
      title: "collaborative",
      titleSnapshot: "collaborative",
      url: "https://github.com/f0rr0/collaborative-pr-test/pull/72",
    });
    await database.insert(schema.githubPullRequestVersions).values({
      baseRepositoryId: collaborativeRepositoryId,
      baseSha,
      commitCount: 2,
      fileFacts: [fileFact("src/whole-pr-with-collaborator.ts")],
      fileFactsComplete: true,
      headRepositoryId: collaborativeRepositoryId,
      headSha: collaboratorSha,
      id: versionId,
      membershipComplete: true,
      observedAt: activityAt,
      providerUpdatedAt: activityAt,
      pullRequestNodeId: nodeId,
    });
    await database.insert(schema.githubPullRequestMemberships).values([
      {
        commitRepositoryId: collaborativeRepositoryId,
        commitSha: ownedSha,
        position: 0,
        versionId,
      },
      {
        commitRepositoryId: collaborativeRepositoryId,
        commitSha: collaboratorSha,
        isHead: true,
        position: 1,
        versionId,
      },
    ]);

    const result = await refreshGitHubWorkUnitProjection(activityAt);
    const [unit] = await database
      .select()
      .from(schema.githubWorkUnits)
      .where(eq(schema.githubWorkUnits.identityKey, `pr:${nodeId}`));
    const [attempt] = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(eq(schema.githubWorkUnitSummaryAttempts.workUnitId, unit.id));
    const request = JSON.parse(attempt.requestPayload);
    expect(result).toMatchObject({
      insertedUnits: 1,
      summaryAttemptsQueued: 1,
      summaryInputsFailed: 0,
    });
    expect(unit).toMatchObject({
      attributionMode: "tracked_authored_pr",
      memberCount: 1,
    });
    expect(request.evidence).toMatchObject({ mode: "composite" });
    expect(
      request.evidence.changes.flatMap((change) =>
        change.files.map((file) => file.filename)
      )
    ).toEqual(["src/owned-only.ts"]);

    const replacementSha = "7".repeat(40);
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: new Date(activityAt.getTime() + 30_000),
      committerAt: new Date(activityAt.getTime() + 30_000),
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [fileFact("src/owned-only.ts")],
      fileFactsComplete: true,
      firstObservedAt: new Date(activityAt.getTime() + 30_000),
      message: "equivalent replacement",
      parentShas: [baseSha],
      pullRequestDiscoveryState: "complete",
      repositoryId: collaborativeRepositoryId,
      sha: replacementSha,
    });
    await database
      .delete(schema.githubPullRequestMemberships)
      .where(
        and(
          eq(schema.githubPullRequestMemberships.versionId, versionId),
          eq(schema.githubPullRequestMemberships.commitSha, ownedSha)
        )
      );
    await database.insert(schema.githubPullRequestMemberships).values({
      commitRepositoryId: collaborativeRepositoryId,
      commitSha: replacementSha,
      position: 0,
      versionId,
    });

    const rewritten = await refreshGitHubWorkUnitProjection(
      new Date(activityAt.getTime() + 30_000)
    );
    const [rewrittenUnit] = await database
      .select()
      .from(schema.githubWorkUnits)
      .where(eq(schema.githubWorkUnits.id, unit.id));
    const [rewrittenAttempt] = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(eq(schema.githubWorkUnitSummaryAttempts.workUnitId, unit.id));
    expect(rewritten).toMatchObject({
      summaryAttemptsQueued: 0,
      summaryEvaluationsSettled: 1,
      summaryInputsSet: 0,
      updatedUnits: 1,
    });
    expect(rewrittenUnit.revision).toBeGreaterThan(unit.revision);
    expect(rewrittenUnit.summaryInputDigest).toBe(unit.summaryInputDigest);
    expect(rewrittenAttempt).toMatchObject({
      revision: attempt.revision,
      state: "pending",
      summaryInputDigest: attempt.summaryInputDigest,
    });
    const claim = await claimGitHubWorkUnitSummary({
      now: new Date(activityAt.getTime() + 6 * 60_000),
    });
    expect(claim).toMatchObject({
      revision: attempt.revision,
      workUnitId: unit.id,
    });
    if (claim === null) {
      throw new Error("The outcome-identical rewrite was not claimable.");
    }
    await terminalGitHubWorkUnitSummary(
      claim,
      new Date(activityAt.getTime() + 6 * 60_000 + 1)
    );

    const attemptsBeforeUnrelatedChange = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(eq(schema.githubWorkUnitSummaryAttempts.workUnitId, unit.id));
    await database
      .update(schema.githubRepositories)
      .set({ visibility: "public" })
      .where(eq(schema.githubRepositories.id, repositoryId));

    const unrelated = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-31T10:01:00.000Z")
    );
    const attemptsAfterUnrelatedChange = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(eq(schema.githubWorkUnitSummaryAttempts.workUnitId, unit.id));
    expect(unrelated).toMatchObject({
      insertedUnits: 1,
      summaryAttemptsQueued: 1,
      summaryInputsFailed: 0,
      updatedUnits: 0,
    });
    expect(attemptsAfterUnrelatedChange).toEqual(attemptsBeforeUnrelatedChange);
  });

  test("bumps the durable feed head once for newly visible issue intake", async () => {
    const repository = {
      defaultBranch: "main",
      fullName: "f0rr0/issue-intake-test",
      htmlUrl: "https://github.com/f0rr0/issue-intake-test",
      id: "7003",
      ownerAvatarUrl: null,
      ownerId: "8574219",
      ownerLogin: "f0rr0",
      ownerType: "User",
      pushedAt: "2026-08-31T11:00:00.000Z",
      visibility: "public",
    };
    const issue = {
      account: "f0rr0",
      authorLogin: "f0rr0",
      authorUserId: "8574219",
      createdAt: "2026-08-31T11:00:00.000Z",
      nodeId: "I_issue_intake_7003",
      number: 1,
      repository,
      title: "Public issue snapshot",
      url: "https://github.com/f0rr0/issue-intake-test/issues/1",
    };
    const [before] = await database.select().from(schema.githubPublicFeedHead);
    const first = await persistGitHubWebhookIssue(
      "70030000-0000-4000-8000-000000000001",
      issue
    );
    const [after] = await database.select().from(schema.githubPublicFeedHead);
    expect(first).toMatchObject({ duplicate: false, issues: 1 });
    expect(after).toMatchObject({
      feedRevision: before.feedRevision + 1,
      headContentRevision: before.headContentRevision + 1,
      orderingRevision: before.orderingRevision + 1,
    });

    const duplicate = await persistGitHubWebhookIssue(
      "70030000-0000-4000-8000-000000000001",
      issue
    );
    const [afterDuplicate] = await database
      .select()
      .from(schema.githubPublicFeedHead);
    expect(duplicate).toMatchObject({ duplicate: true, issues: 0 });
    expect(afterDuplicate).toEqual(after);

    const unknownIssue = {
      ...issue,
      nodeId: "I_issue_intake_unknown_7004",
      number: 2,
      repository: {
        ...repository,
        fullName: "f0rr0/unknown-issue-intake-test",
        htmlUrl: "https://github.com/f0rr0/unknown-issue-intake-test",
        id: "7004",
        visibility: null,
      },
      title: "Unknown issue snapshot",
      url: "https://github.com/f0rr0/unknown-issue-intake-test/issues/2",
    };
    await persistGitHubWebhookIssue(
      "70040000-0000-4000-8000-000000000001",
      unknownIssue
    );
    const [afterUnknown] = await database
      .select()
      .from(schema.githubPublicFeedHead);
    expect(afterUnknown).toEqual(after);
  });

  test("excludes revoked private issue days from initial-page projection", async () => {
    const publicRepositoryId = "7005";
    const privateRepositoryId = "7006";
    const publicSha = "9".repeat(40);
    const publicLineageId = "70050000-0000-4000-8000-000000000001";
    const publicActivityAt = new Date("2026-09-10T10:00:00.000Z");
    const inventoryAt = new Date("2026-09-15T12:00:00.000Z");

    await database.insert(schema.githubRepositories).values([
      {
        defaultBranch: "main",
        factsVerifiedAt: publicActivityAt,
        firstObservedAt: publicActivityAt,
        fullName: "f0rr0/current-access-public-test",
        headsLastReconciledAt: publicActivityAt,
        id: publicRepositoryId,
        lastObservedAt: publicActivityAt,
        visibility: "public",
      },
      {
        factsVerifiedAt: inventoryAt,
        firstObservedAt: inventoryAt,
        fullName: "private-owner/current-access-private-test",
        id: privateRepositoryId,
        lastObservedAt: inventoryAt,
        visibility: "private",
      },
    ]);
    await database.insert(schema.githubRepositoryRefs).values({
      active: true,
      branchLineageId: publicLineageId,
      firstObservedAt: publicActivityAt,
      headSha: publicSha,
      kind: "head",
      lastObservedAt: publicActivityAt,
      projectionRelevant: true,
      refName: "refs/heads/main",
      repositoryId: publicRepositoryId,
    });
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: publicActivityAt,
      committerAt: publicActivityAt,
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [fileFact("src/current-access.ts")],
      fileFactsComplete: true,
      firstObservedAt: publicActivityAt,
      message: "current access",
      parentShas: [],
      pullRequestDiscoveryState: "complete",
      repositoryId: publicRepositoryId,
      sha: publicSha,
    });
    await database.insert(schema.githubRefGenerations).values({
      branchLineageId: publicLineageId,
      completedAt: publicActivityAt,
      coverageSinceAt: new Date("2026-09-01T00:00:00.000Z"),
      generation: 1,
      headSha: publicSha,
      refName: "refs/heads/main",
      repositoryId: publicRepositoryId,
    });
    await database.insert(schema.githubRefMemberships).values({
      commitRepositoryId: publicRepositoryId,
      commitSha: publicSha,
      generation: 1,
      position: 0,
      refName: "refs/heads/main",
      repositoryId: publicRepositoryId,
    });
    await database
      .insert(schema.githubRepositoryInventoryHeads)
      .values({
        accountLogin: "f0rr0",
        accountUserId: "8574219",
        completedAt: inventoryAt,
        generation: 10,
        updatedAt: inventoryAt,
      })
      .onConflictDoUpdate({
        set: {
          completedAt: inventoryAt,
          generation: 10,
          updatedAt: inventoryAt,
        },
        target: schema.githubRepositoryInventoryHeads.accountUserId,
      });
    await database.insert(schema.githubAccountRepositoryCatalogs).values({
      accountUserId: "8574219",
      activeAccess: true,
      inventoryGeneration: 10,
      observedAt: inventoryAt,
      repositoryId: privateRepositoryId,
    });
    await database.insert(schema.githubIssues).values(
      Array.from({ length: 5 }, (_, index) => ({
        account: "f0rr0",
        authorUserId: "8574219",
        createdAt: new Date(
          `2026-09-${String(index + 11).padStart(2, "0")}T10:00:00.000Z`
        ),
        nodeId: `I_private_current_access_${String(index)}`,
        number: index + 1,
        repositoryId: privateRepositoryId,
        titleSnapshot: `private issue ${String(index)}`,
        urlSnapshot: `https://github.com/private-owner/current-access-private-test/issues/${String(index + 1)}`,
      }))
    );

    const accessible = await refreshGitHubWorkUnitProjection(inventoryAt);
    expect(accessible).toMatchObject({
      feedRevisionChanged: false,
      insertedUnits: 1,
      orderingRevisionChanged: true,
    });

    await database
      .update(schema.githubAccountRepositoryCatalogs)
      .set({ activeAccess: false })
      .where(
        and(
          eq(schema.githubAccountRepositoryCatalogs.accountUserId, "8574219"),
          eq(
            schema.githubAccountRepositoryCatalogs.repositoryId,
            privateRepositoryId
          )
        )
      );
    await database
      .update(schema.githubCommits)
      .set({
        additions: 2,
        deletions: 2,
        fileFacts: [
          fileFact("src/current-access.ts"),
          fileFact("src/revoked-access.ts"),
        ],
      })
      .where(
        and(
          eq(schema.githubCommits.repositoryId, publicRepositoryId),
          eq(schema.githubCommits.sha, publicSha)
        )
      );

    const revoked = await refreshGitHubWorkUnitProjection(
      new Date("2026-09-15T12:01:00.000Z")
    );
    expect(revoked).toMatchObject({
      feedRevisionChanged: true,
      updatedUnits: 1,
    });
  });

  test("settles facts-only summary evidence once instead of retrying it forever", async () => {
    const factsOnlyRepositoryId = "7091";
    const factsOnlySha = "8".repeat(40);
    const factsOnlyLineageId = "70910000-0000-4000-8000-000000000001";
    const factsOnlyAt = new Date("2026-09-20T10:00:00.000Z");
    await database.insert(schema.githubRepositories).values({
      defaultBranch: "main",
      factsVerifiedAt: factsOnlyAt,
      firstObservedAt: factsOnlyAt,
      fullName: "f0rr0/facts-only-projection-test",
      headsLastReconciledAt: factsOnlyAt,
      id: factsOnlyRepositoryId,
      lastObservedAt: factsOnlyAt,
      visibility: "public",
    });
    await database.insert(schema.githubRepositoryRefs).values({
      active: true,
      branchLineageId: factsOnlyLineageId,
      firstObservedAt: factsOnlyAt,
      headSha: factsOnlySha,
      kind: "head",
      lastObservedAt: factsOnlyAt,
      projectionRelevant: true,
      refName: "refs/heads/main",
      repositoryId: factsOnlyRepositoryId,
    });
    await database.insert(schema.githubCommits).values({
      additions: 1,
      author: "f0rr0",
      authorUserId: "8574219",
      committedAt: factsOnlyAt,
      committerAt: factsOnlyAt,
      deletions: 1,
      enrichmentState: "complete",
      fileFacts: [
        {
          ...fileFact("src/unavailable.ts"),
          patch: null,
          patchComplete: false,
        },
      ],
      fileFactsComplete: true,
      firstObservedAt: factsOnlyAt,
      message: "facts without a usable patch",
      parentShas: [],
      pullRequestDiscoveryState: "complete",
      repositoryId: factsOnlyRepositoryId,
      sha: factsOnlySha,
    });
    await database.insert(schema.githubRefGenerations).values({
      branchLineageId: factsOnlyLineageId,
      completedAt: factsOnlyAt,
      coverageSinceAt: new Date("2026-09-01T00:00:00.000Z"),
      generation: 1,
      headSha: factsOnlySha,
      refName: "refs/heads/main",
      repositoryId: factsOnlyRepositoryId,
    });
    await database.insert(schema.githubRefMemberships).values({
      commitRepositoryId: factsOnlyRepositoryId,
      commitSha: factsOnlySha,
      generation: 1,
      position: 0,
      refName: "refs/heads/main",
      repositoryId: factsOnlyRepositoryId,
    });

    const first = await refreshGitHubWorkUnitProjection(factsOnlyAt);
    const [unit] = await database
      .select()
      .from(schema.githubWorkUnits)
      .where(
        eq(
          schema.githubWorkUnits.identityKey,
          `canonical:${factsOnlyRepositoryId}:2026-09-20`
        )
      );
    expect(first).toMatchObject({
      summaryEvaluationsSettled: 1,
      summaryInputsFailed: 1,
    });
    expect(unit).toMatchObject({
      outcomeDigest: null,
      summaryInputDigest: null,
    });
    expect(unit.summaryEvaluatedDigest).toMatch(/^[a-f0-9]{64}$/u);

    const second = await refreshGitHubWorkUnitProjection(
      new Date("2026-09-20T10:01:00.000Z")
    );
    const [unchanged] = await database
      .select()
      .from(schema.githubWorkUnits)
      .where(eq(schema.githubWorkUnits.id, unit.id));
    expect(second).toMatchObject({
      summaryEvaluationsSettled: 0,
      summaryInputsFailed: 0,
    });
    expect(unchanged.summaryEvaluatedDigest).toBe(unit.summaryEvaluatedDigest);
  });

  test("an idle worker drains a bounded recent-first summary batch without clearing a partial request", async () => {
    const batchRepositoryId = "7092";
    const batchLineageId = "70920000-0000-4000-8000-000000000001";
    const completedAt = new Date("2026-09-10T12:00:00.000Z");
    const commits = Array.from({ length: 9 }, (_, index) => {
      const day = index + 1;
      return {
        day: `2026-09-${String(day).padStart(2, "0")}`,
        sha: (index + 1).toString(16).repeat(40).slice(0, 40),
      };
    });
    await database.insert(schema.githubRepositories).values({
      defaultBranch: "main",
      factsVerifiedAt: completedAt,
      firstObservedAt: completedAt,
      fullName: "f0rr0/summary-batch-projection-test",
      headsLastReconciledAt: completedAt,
      id: batchRepositoryId,
      lastObservedAt: completedAt,
      visibility: "public",
    });
    await database.insert(schema.githubRepositoryRefs).values({
      active: true,
      branchLineageId: batchLineageId,
      firstObservedAt: completedAt,
      headSha: commits.at(-1).sha,
      kind: "head",
      lastObservedAt: completedAt,
      projectionRelevant: true,
      refName: "refs/heads/main",
      repositoryId: batchRepositoryId,
    });
    await database.insert(schema.githubCommits).values(
      commits.map((commit, index) => ({
        additions: 1,
        author: "f0rr0",
        authorUserId: "8574219",
        committedAt: new Date(`${commit.day}T12:00:00.000Z`),
        committerAt: new Date(`${commit.day}T12:00:00.000Z`),
        deletions: 1,
        enrichmentState: "complete",
        fileFacts: [fileFact(`src/day-${String(index + 1)}.ts`)],
        fileFactsComplete: true,
        firstObservedAt: completedAt,
        message: `day ${String(index + 1)}`,
        parentShas: index === 0 ? [] : [commits[index - 1].sha],
        pullRequestDiscoveryState: "complete",
        repositoryId: batchRepositoryId,
        sha: commit.sha,
      }))
    );
    await database.insert(schema.githubRefGenerations).values({
      branchLineageId: batchLineageId,
      completedAt,
      coverageSinceAt: new Date("2026-09-01T00:00:00.000Z"),
      generation: 1,
      headSha: commits.at(-1).sha,
      refName: "refs/heads/main",
      repositoryId: batchRepositoryId,
    });
    await database.insert(schema.githubRefMemberships).values(
      commits.map((commit, position) => ({
        commitRepositoryId: batchRepositoryId,
        commitSha: commit.sha,
        generation: 1,
        position,
        refName: "refs/heads/main",
        repositoryId: batchRepositoryId,
      }))
    );
    const token = await requestGitHubWorkUnitProjection(database);
    const workerOptions = {
      accounts: ["f0rr0"],
      includeRefs: false,
      maximumDurationMs: 3000,
      scope: {
        repositoryId: batchRepositoryId,
        sinceAt: new Date("2026-09-01T00:00:00.000Z"),
        untilAt: new Date("2026-09-11T00:00:00.000Z"),
      },
    };

    const first = await runGitHubActivityWorker(workerOptions);
    expect(first).toMatchObject({
      commits: { claimed: 0 },
      observations: { claimed: 0 },
      projection: {
        summaryAttemptsQueued: 8,
        summaryEvaluationsPending: 1,
        summaryEvaluationsSettled: 8,
      },
      pullRequestDiscovery: { claimed: 0 },
      pullRequestSignals: { claimed: 0 },
      pullRequests: { claimed: 0 },
    });
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBe(token);
    const afterFirst = await database
      .select({
        activityDay: schema.githubWorkUnits.activityDay,
        summaryEvaluatedDigest: schema.githubWorkUnits.summaryEvaluatedDigest,
      })
      .from(schema.githubWorkUnits)
      .where(eq(schema.githubWorkUnits.repositoryId, batchRepositoryId))
      .orderBy(schema.githubWorkUnits.activityDay);
    expect(
      afterFirst
        .filter(({ summaryEvaluatedDigest }) => summaryEvaluatedDigest === null)
        .map(({ activityDay }) => activityDay)
    ).toEqual(["2026-09-01"]);

    const second = await runGitHubActivityWorker(workerOptions);
    expect(second).toMatchObject({
      commits: { claimed: 0 },
      observations: { claimed: 0 },
      projection: {
        summaryAttemptsQueued: 1,
        summaryEvaluationsPending: 0,
        summaryEvaluationsSettled: 1,
      },
      pullRequestDiscovery: { claimed: 0 },
      pullRequestSignals: { claimed: 0 },
      pullRequests: { claimed: 0 },
    });
    expect(await ensureGitHubWorkUnitProjectionRequest()).toBeNull();
  });
});
