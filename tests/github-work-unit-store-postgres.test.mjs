import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

import { and, eq } from "drizzle-orm";
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
  let originalDatabaseUrl;
  let persistGitHubWebhookIssue;
  let refreshGitHubWorkUnitProjection;
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

  test("withholds only a same-repository merged-PR landing until the association clears", async () => {
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
      nodeId: pullRequestNodeId,
      number: 71,
      providerUpdatedAt: secondObservedAt,
      repositoryId,
      state: "closed",
      terminalAt: secondObservedAt,
      title: "associated",
      titleSnapshot: "associated",
      url: "https://github.com/f0rr0/projection-store-test/pull/71",
    });
    await database.insert(schema.githubPullRequests).values({
      account: "f0rr0",
      authorUserId: "9000",
      createdAt: secondObservedAt,
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

    const unmerged = await refreshGitHubWorkUnitProjection(secondObservedAt);
    const [afterUnmergedAssociation] = await database
      .select()
      .from(schema.githubWorkUnits);
    expect(unmerged.exclusionReasonCounts.merged_pr_landing).toBe(0);
    expect(afterUnmergedAssociation).toMatchObject({ memberCount: 2 });

    await database
      .update(schema.githubPullRequests)
      .set({ mergedAt: secondObservedAt, state: "merged" })
      .where(eq(schema.githubPullRequests.nodeId, pullRequestNodeId));
    const excluded = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T13:00:30.000Z")
    );
    const [afterMergedAssociation] = await database
      .select()
      .from(schema.githubWorkUnits);
    expect(excluded.exclusionReasonCounts.merged_pr_landing).toBe(1);
    expect(afterMergedAssociation).toMatchObject({ memberCount: 1 });

    await database
      .delete(schema.githubCommitPullRequestAssociations)
      .where(
        and(
          eq(
            schema.githubCommitPullRequestAssociations.commitRepositoryId,
            repositoryId
          ),
          eq(schema.githubCommitPullRequestAssociations.commitSha, secondSha)
        )
      );
    const resolved = await refreshGitHubWorkUnitProjection(
      new Date("2026-08-30T13:01:00.000Z")
    );
    const [afterProof] = await database.select().from(schema.githubWorkUnits);
    expect(resolved.exclusionReasonCounts.merged_pr_landing).toBe(0);
    expect(afterProof).toMatchObject({ memberCount: 2 });
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

    const attemptsBeforeUnrelatedChange = await database
      .select()
      .from(schema.githubWorkUnitSummaryAttempts)
      .where(eq(schema.githubWorkUnitSummaryAttempts.workUnitId, unit.id));
    await database
      .update(schema.githubRepositories)
      .set({ fullName: "" })
      .where(eq(schema.githubRepositories.id, collaborativeRepositoryId));
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

    await database
      .update(schema.githubRepositories)
      .set({ fullName: "f0rr0/collaborative-pr-test" })
      .where(eq(schema.githubRepositories.id, collaborativeRepositoryId));
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
});
