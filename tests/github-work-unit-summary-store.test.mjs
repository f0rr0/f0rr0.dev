import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { setTimeout as delay } from "node:timers/promises";

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
const postgresPassword = "github-work-unit-summary-store-test";
const repositoryId = "9901";
const recipe = "github-work-unit-outcome-v1";
const digest = (character) => character.repeat(64);
const instant = (value) => value?.toISOString() ?? null;

const checkedOutput = (result, operation) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${operation} failed: ${result.stderr.toString("utf-8").trim()}`
    );
  }
  return result.stdout.toString("utf-8").trim();
};

const providerResult = (outcome) => ({
  inputTokens: 41,
  latencyMs: 17,
  model: "gpt-5.4-nano-2026-03-17",
  outcome,
  outputTokens: 12,
});

describe.skipIf(!dockerAvailable)("GitHub work-unit summary store", () => {
  let admin;
  let claimGitHubWorkUnitSummary;
  let closeDatabase;
  let completeGitHubWorkUnitSummary;
  let containerId;
  let deferGitHubWorkUnitSummary;
  let originalDatabaseUrl;
  let reconcileGitHubWorkUnitSummaryStatus;
  let sequence = 0;
  let terminalGitHubWorkUnitSummary;

  const seedUnit = async ({
    activityAt,
    attemptRevision = 1,
    contentObservedAt = activityAt,
    debounceUntil,
    lastStartedAt = null,
    leaseToken = null,
    leaseUntil = null,
    outcomeDigest = digest("a"),
    requestPayload,
    startedRequests = 0,
    state = "pending",
    summaryInputDigest = digest("b"),
    unitRevision = 1,
  }) => {
    sequence += 1;
    const suffix = String(sequence).padStart(12, "0");
    const workUnitId = `00000000-0000-4000-8000-${suffix}`;
    const branchLineageId = `10000000-0000-4000-8000-${suffix}`;
    const sha = sequence.toString(16).padStart(40, "0");
    const activityDay = activityAt.toISOString().slice(0, 10);
    const payload = requestPayload ?? JSON.stringify({ unit: sequence });
    await admin`
      insert into github_commits (
        author_login, committed_at, message, repository_id, sha
      ) values (
        'f0rr0', ${instant(activityAt)}, ${`summary store ${String(sequence)}`},
        ${repositoryId}, ${sha}
      )
    `;
    await admin`
      insert into github_work_units (
        activity_anchor_at, activity_at, activity_day, additions,
        attribution_mode, branch_lineage_id, content_observed_at, deletions,
        facts_digest, file_count, first_activity_at, id, identity_key, kind,
        last_activity_at, member_count, membership_digest,
        newest_commit_repository_id, newest_commit_sha, outcome_digest,
        repository_id, revision, summary_input_digest, visibility
      ) values (
        ${instant(activityAt)}, ${instant(activityAt)}, ${activityDay}, 3,
        'branch_owned_composite', ${branchLineageId}, ${instant(contentObservedAt)}, 1,
        ${digest("c")}, 1, ${instant(activityAt)}, ${workUnitId},
        ${`branch:${branchLineageId}`}, 'branch', ${instant(activityAt)}, 1,
        ${digest("d")}, ${repositoryId}, ${sha}, ${outcomeDigest},
        ${repositoryId}, ${unitRevision}, ${summaryInputDigest}, 'public'
      )
    `;
    await admin`
      insert into github_work_unit_summary_attempts (
        attribution_mode, created_at, debounce_until, input_tokens,
        last_started_at, lease_token, lease_until, outcome_digest, recipe,
        request_payload, revision, started_requests, state,
        summary_input_digest, unit_revision, work_unit_id
      ) values (
        'branch_owned_composite', ${instant(contentObservedAt)},
        ${instant(debounceUntil)}, 37, ${instant(lastStartedAt)}, ${leaseToken},
        ${instant(leaseUntil)}, ${outcomeDigest},
        ${recipe}, ${payload}, ${attemptRevision}, ${startedRequests}, ${state},
        ${summaryInputDigest}, ${unitRevision}, ${workUnitId}
      )
    `;
    return {
      activityDay,
      outcomeDigest,
      payload,
      revision: attemptRevision,
      summaryInputDigest,
      unitRevision,
      workUnitId,
    };
  };

  const readAttempt = async (unit) => {
    const [row] = await admin`
      select * from github_work_unit_summary_attempts
      where work_unit_id = ${unit.workUnitId}
        and revision = ${unit.revision}
    `;
    return row;
  };

  const readHead = async () => {
    const [row] = await admin`select * from github_public_feed_head where id`;
    return row;
  };

  const readUsage = async () =>
    await admin`
      select day::text, started_requests
      from github_work_unit_summary_daily_usage
      order by day
    `;

  const seedUsage = async (rows) => {
    for (const row of rows) {
      await admin`
        insert into github_work_unit_summary_daily_usage (
          day, started_requests
        ) values (${row.day}, ${row.startedRequests})
      `;
    }
  };

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
      "POSTGRES_DB=github_work_unit_summary_store_test",
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
    const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_work_unit_summary_store_test`;
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
      prepare: false,
    });
    await migrate(drizzle({ client: admin }), { migrationsFolder });
    env.DATABASE_URL = databaseUrl;
    ({ closeDatabase } = await import("../src/db/client.ts"));
    ({
      claimGitHubWorkUnitSummary,
      completeGitHubWorkUnitSummary,
      deferGitHubWorkUnitSummary,
      reconcileGitHubWorkUnitSummaryStatus,
      terminalGitHubWorkUnitSummary,
    } = await import("../src/lib/github-work-unit-summary-store.ts"));
    await admin`
      insert into github_repositories (
        facts_verified_at, full_name, id, visibility
      ) values (
        '2026-09-01T00:00:00Z', 'f0rr0/summary-store-test',
        ${repositoryId}, 'public'
      )
    `;
  });

  beforeEach(async () => {
    await admin`delete from github_work_unit_summary_attempts`;
    await admin`delete from github_work_unit_summary_daily_usage`;
    await admin`delete from github_work_units`;
    await admin`delete from github_issues`;
    await admin`delete from github_commits where repository_id = ${repositoryId}`;
    await admin`
      update github_repositories set visibility = 'public'
      where id = ${repositoryId}
    `;
    await admin`
      update github_public_feed_head
      set feed_revision = 0, head_content_revision = 0,
          last_published_at = null, ordering_revision = 0, summarizing = false
      where id
    `;
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

  test("claims current recent work newest-first and never claims a stale digest", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const stale = await seedUnit({
      activityAt: new Date("2026-09-01T11:30:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await admin`
      update github_work_units
      set summary_input_digest = ${digest("e")}
      where id = ${stale.workUnitId}
    `;
    const newest = await seedUnit({
      activityAt: new Date("2026-08-31T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    const older = await seedUnit({
      activityAt: new Date("2026-08-30T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await seedUnit({
      activityAt: new Date("2026-07-01T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });

    const first = await claimGitHubWorkUnitSummary({ now });
    expect(first).toMatchObject({
      revision: newest.revision,
      serializedInput: newest.payload,
      startedRequests: 1,
      workUnitId: newest.workUnitId,
    });
    expect(await readAttempt(newest)).toMatchObject({
      request_payload: newest.payload,
      started_requests: 1,
      state: "processing",
    });
    expect(await terminalGitHubWorkUnitSummary(first, now)).toBe(true);

    const second = await claimGitHubWorkUnitSummary({ now });
    expect(second).toMatchObject({
      serializedInput: older.payload,
      workUnitId: older.workUnitId,
    });
    expect(await readAttempt(stale)).toMatchObject({
      started_requests: 0,
      state: "pending",
    });
  });

  test("does not claim a stale public payload after its repository becomes private", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const unit = await seedUnit({
      activityAt: new Date("2026-09-01T11:30:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await admin`
      update github_repositories set visibility = 'private'
      where id = ${repositoryId}
    `;

    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();
    expect(await readAttempt(unit)).toMatchObject({
      request_payload: unit.payload,
      started_requests: 0,
      state: "pending",
    });
  });

  test("serializes concurrent claims at the twelve-request UTC-day cap", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    await seedUsage([{ day: "2026-09-01", startedRequests: 11 }]);
    for (const hour of [11, 10, 9]) {
      await seedUnit({
        activityAt: new Date(
          `2026-09-01T${String(hour).padStart(2, "0")}:00:00.000Z`
        ),
        debounceUntil: new Date("2026-09-01T08:00:00.000Z"),
      });
    }

    const claims = await Promise.all([
      claimGitHubWorkUnitSummary({ now }),
      claimGitHubWorkUnitSummary({ now }),
      claimGitHubWorkUnitSummary({ now }),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(await readUsage()).toEqual([
      { day: "2026-09-01", started_requests: 12 },
    ]);
    const [states] = await admin`
      select
        count(*) filter (where state = 'pending')::integer as pending,
        count(*) filter (where state = 'processing')::integer as processing
      from github_work_unit_summary_attempts
    `;
    expect(states).toEqual({ pending: 2, processing: 1 });
  });

  test("stops at the 120-request UTC-month boundary", async () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    await seedUsage([
      ...Array.from({ length: 10 }, (_, index) => ({
        day: `2026-09-${String(index + 1).padStart(2, "0")}`,
        startedRequests: 11,
      })),
      { day: "2026-09-30", startedRequests: 9 },
    ]);
    await seedUnit({
      activityAt: new Date("2026-09-30T11:00:00.000Z"),
      debounceUntil: new Date("2026-09-30T10:00:00.000Z"),
    });
    await seedUnit({
      activityAt: new Date("2026-09-30T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-30T10:00:00.000Z"),
    });

    expect(await claimGitHubWorkUnitSummary({ now })).not.toBeNull();
    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();
    const [usage] = await admin`
      select sum(started_requests)::integer as monthly
      from github_work_unit_summary_daily_usage
      where day >= '2026-09-01' and day < '2026-10-01'
    `;
    expect(usage).toEqual({ monthly: 120 });
  });

  test("admits historical work at the exact future-day reserve boundary", async () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    await seedUsage(
      Array.from({ length: 9 }, (_, index) => ({
        day: `2026-09-${String(index + 1).padStart(2, "0")}`,
        startedRequests: 11,
      }))
    );
    const historical = await seedUnit({
      activityAt: new Date("2026-07-01T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-20T11:00:00.000Z"),
    });

    expect(await claimGitHubWorkUnitSummary({ now })).toMatchObject({
      workUnitId: historical.workUnitId,
    });
    const [usage] = await admin`
      select sum(started_requests)::integer as monthly
      from github_work_unit_summary_daily_usage
    `;
    expect(usage).toEqual({ monthly: 100 });
    expect(await readHead()).toMatchObject({
      head_content_revision: "0",
      summarizing: false,
    });
  });

  test("reserves future capacity from historical work without blocking recent work", async () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    await seedUsage([
      ...Array.from({ length: 9 }, (_, index) => ({
        day: `2026-09-${String(index + 1).padStart(2, "0")}`,
        startedRequests: 11,
      })),
      { day: "2026-09-10", startedRequests: 1 },
    ]);
    await seedUnit({
      activityAt: new Date("2026-07-01T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-20T11:00:00.000Z"),
    });

    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();
    const recent = await seedUnit({
      activityAt: new Date("2026-09-19T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-20T11:00:00.000Z"),
    });
    expect(await claimGitHubWorkUnitSummary({ now })).toMatchObject({
      workUnitId: recent.workUnitId,
    });
    const [usage] = await admin`
      select sum(started_requests)::integer as monthly
      from github_work_unit_summary_daily_usage
    `;
    expect(usage).toEqual({ monthly: 101 });
  });

  test("recovers expired leases once and settles facts-only at two starts", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const exhausted = await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      debounceUntil: new Date("2026-08-31T12:00:00.000Z"),
      lastStartedAt: new Date("2026-09-01T10:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000001",
      leaseUntil: new Date("2026-09-01T11:00:00.000Z"),
      startedRequests: 2,
      state: "processing",
    });
    const recoverable = await seedUnit({
      activityAt: new Date("2026-08-30T12:00:00.000Z"),
      debounceUntil: new Date("2026-08-30T12:00:00.000Z"),
      lastStartedAt: new Date("2026-09-01T10:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000002",
      leaseUntil: new Date("2026-09-01T11:00:00.000Z"),
      startedRequests: 1,
      state: "processing",
    });

    const claim = await claimGitHubWorkUnitSummary({ now });
    expect(claim).toMatchObject({
      startedRequests: 2,
      workUnitId: recoverable.workUnitId,
    });
    const exhaustedAttempt = await readAttempt(exhausted);
    expect(exhaustedAttempt).toMatchObject({
      request_payload: null,
      state: "terminal",
    });
    expect(new Date(exhaustedAttempt.completed_at).getTime()).toBe(
      now.getTime()
    );
    expect(
      await deferGitHubWorkUnitSummary(
        claim,
        new Date("2026-09-01T13:00:00.000Z"),
        now
      )
    ).toBe("terminal");
    const recoverableAttempt = await readAttempt(recoverable);
    expect(recoverableAttempt).toMatchObject({
      request_payload: null,
      started_requests: 2,
      state: "terminal",
    });
    expect(new Date(recoverableAttempt.completed_at).getTime()).toBe(
      now.getTime()
    );
    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();
  });

  test("permits one historical start per UTC day without delaying recent work", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const newestHistorical = await seedUnit({
      activityAt: new Date("2026-07-20T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await seedUnit({
      activityAt: new Date("2026-07-10T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });

    const first = await claimGitHubWorkUnitSummary({ now });
    expect(first).toMatchObject({ workUnitId: newestHistorical.workUnitId });
    expect(
      await deferGitHubWorkUnitSummary(
        first,
        new Date("2026-09-02T00:00:00.000Z"),
        now
      )
    ).toBe("deferred");
    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();

    const recent = await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    const foreground = await claimGitHubWorkUnitSummary({ now });
    expect(foreground).toMatchObject({ workUnitId: recent.workUnitId });
    expect(await terminalGitHubWorkUnitSummary(foreground, now)).toBe(true);
    expect(await claimGitHubWorkUnitSummary({ now })).toBeNull();

    const nextDay = new Date("2026-09-02T00:01:00.000Z");
    const retried = await claimGitHubWorkUnitSummary({ now: nextDay });
    expect(retried).toMatchObject({
      startedRequests: 2,
      workUnitId: newestHistorical.workUnitId,
    });
  });

  test("does not present pending, debounced, or historical work as active", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    await seedUnit({
      activityAt: new Date("2026-09-06T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-06T13:00:00.000Z"),
    });
    await seedUnit({
      activityAt: new Date("2026-07-01T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-06T10:00:00.000Z"),
      lastStartedAt: new Date("2026-09-06T11:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000010",
      leaseUntil: new Date("2026-09-06T13:00:00.000Z"),
      startedRequests: 1,
      state: "processing",
    });

    expect(await reconcileGitHubWorkUnitSummaryStatus(now)).toBe(false);
    expect(await readHead()).toMatchObject({
      head_content_revision: "0",
      summarizing: false,
    });
  });

  test("keeps one active transition while another current summary settles", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await seedUnit({
      activityAt: new Date("2026-08-30T12:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });

    const first = await claimGitHubWorkUnitSummary({ now });
    const second = await claimGitHubWorkUnitSummary({ now });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await readHead()).toMatchObject({
      head_content_revision: "1",
      summarizing: true,
    });

    expect(
      await completeGitHubWorkUnitSummary(
        first,
        providerResult("Builds one coherent public outcome."),
        now
      )
    ).toEqual({ accepted: true });
    expect(await readHead()).toMatchObject({
      feed_revision: "1",
      head_content_revision: "2",
      summarizing: true,
    });

    expect(
      await deferGitHubWorkUnitSummary(
        second,
        new Date("2026-09-01T13:00:00.000Z"),
        now
      )
    ).toBe("deferred");
    expect(await readHead()).toMatchObject({
      feed_revision: "1",
      head_content_revision: "3",
      summarizing: false,
    });
  });

  test("reconciles expired leases exactly once", async () => {
    const beforeExpiry = new Date("2026-09-01T12:00:00.000Z");
    const retryable = await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      debounceUntil: new Date("2026-08-31T12:00:00.000Z"),
      lastStartedAt: new Date("2026-09-01T11:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000011",
      leaseUntil: new Date("2026-09-01T12:30:00.000Z"),
      startedRequests: 1,
      state: "processing",
    });
    const exhausted = await seedUnit({
      activityAt: new Date("2026-08-30T12:00:00.000Z"),
      debounceUntil: new Date("2026-08-30T12:00:00.000Z"),
      lastStartedAt: new Date("2026-09-01T11:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000012",
      leaseUntil: new Date("2026-09-01T12:30:00.000Z"),
      startedRequests: 2,
      state: "processing",
    });

    expect(await reconcileGitHubWorkUnitSummaryStatus(beforeExpiry)).toBe(true);
    expect(await readHead()).toMatchObject({
      head_content_revision: "1",
      summarizing: true,
    });

    const afterExpiry = new Date("2026-09-01T13:00:00.000Z");
    expect(await reconcileGitHubWorkUnitSummaryStatus(afterExpiry)).toBe(false);
    expect(await reconcileGitHubWorkUnitSummaryStatus(afterExpiry)).toBe(false);
    expect(await readAttempt(retryable)).toMatchObject({
      request_payload: retryable.payload,
      state: "retryable",
    });
    expect(await readAttempt(exhausted)).toMatchObject({
      request_payload: null,
      state: "terminal",
    });
    expect(await readHead()).toMatchObject({
      head_content_revision: "2",
      summarizing: false,
    });
  });

  test("reconciles an active summary leaving the initial five-day page", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const active = await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      debounceUntil: new Date("2026-08-31T12:00:00.000Z"),
      lastStartedAt: new Date("2026-09-06T11:00:00.000Z"),
      leaseToken: "20000000-0000-4000-8000-000000000013",
      leaseUntil: new Date("2026-09-06T13:00:00.000Z"),
      startedRequests: 1,
      state: "processing",
    });
    expect(await reconcileGitHubWorkUnitSummaryStatus(now)).toBe(true);

    for (const day of [1, 2, 3, 4, 5]) {
      await seedUnit({
        activityAt: new Date(
          `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`
        ),
        debounceUntil: new Date("2026-09-07T00:00:00.000Z"),
      });
    }
    expect(await reconcileGitHubWorkUnitSummaryStatus(now)).toBe(false);
    expect(await readAttempt(active)).toMatchObject({ state: "processing" });
    expect(await readHead()).toMatchObject({
      head_content_revision: "2",
      summarizing: false,
    });
  });

  test("accepts exact output and advances the head only for initial-page days", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const units = [];
    for (const day of [31, 30, 29, 28, 27, 26]) {
      units.push(
        await seedUnit({
          activityAt: new Date(
            `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`
          ),
          debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
        })
      );
    }

    const newestClaim = await claimGitHubWorkUnitSummary({ now });
    expect(await readHead()).toMatchObject({
      feed_revision: "0",
      head_content_revision: "1",
      summarizing: true,
    });
    const newestResult = await completeGitHubWorkUnitSummary(
      newestClaim,
      providerResult("Adds deterministic summary leasing."),
      now
    );
    expect(newestResult).toEqual({ accepted: true });
    expect(await readAttempt(units[0])).toMatchObject({
      input_tokens: 41,
      lease_token: null,
      model: "gpt-5.4-nano-2026-03-17",
      outcome: "Adds deterministic summary leasing.",
      output_tokens: 12,
      request_payload: null,
      state: "accepted",
    });
    let head = await readHead();
    expect(head).toMatchObject({
      feed_revision: "1",
      head_content_revision: "2",
      summarizing: false,
    });
    expect(new Date(head.last_published_at).getTime()).toBe(now.getTime());

    for (let index = 1; index < 5; index += 1) {
      const claim = await claimGitHubWorkUnitSummary({ now });
      expect(claim).toMatchObject({ workUnitId: units[index].workUnitId });
      expect(await terminalGitHubWorkUnitSummary(claim, now)).toBe(true);
    }
    const oldClaim = await claimGitHubWorkUnitSummary({ now });
    expect(oldClaim).toMatchObject({ workUnitId: units[5].workUnitId });
    expect(
      await completeGitHubWorkUnitSummary(
        oldClaim,
        providerResult("Refines an older implementation."),
        now
      )
    ).toEqual({ accepted: true });
    head = await readHead();
    expect(head).toMatchObject({
      feed_revision: "1",
      head_content_revision: "10",
      summarizing: false,
    });
  });

  test("recipe rewrites avoid a live revision and stale or invalid output stays facts-only", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const rewrite = await seedUnit({
      activityAt: new Date("2026-08-31T12:00:00.000Z"),
      attemptRevision: 2,
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    await admin`
      insert into github_work_unit_summary_attempts (
        accepted_at, attribution_mode, completed_at, debounce_until,
        input_tokens, last_started_at, latency_ms, model, outcome,
        outcome_digest, output_tokens, recipe, revision, started_requests,
        state, summary_input_digest, unit_revision, work_unit_id
      ) values (
        '2026-08-31T13:00:00Z', 'branch_owned_composite',
        '2026-08-31T13:00:00Z', '2026-08-31T12:00:00Z', 40,
        '2026-08-31T13:00:00Z', 10, 'previous-model',
        'Prior prose for the same outcome.', ${rewrite.outcomeDigest}, 10,
        'github-work-unit-outcome-v0', 1, 1, 'accepted', ${digest("e")},
        ${rewrite.unitRevision}, ${rewrite.workUnitId}
      )
    `;
    const rewriteClaim = await claimGitHubWorkUnitSummary({ now });
    expect(
      await completeGitHubWorkUnitSummary(
        rewriteClaim,
        providerResult("Improves the same represented outcome."),
        now
      )
    ).toEqual({ accepted: true });
    let head = await readHead();
    expect(head).toMatchObject({
      feed_revision: "0",
      head_content_revision: "2",
      last_published_at: null,
      summarizing: false,
    });

    const stale = await seedUnit({
      activityAt: new Date("2026-09-01T10:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    const staleClaim = await claimGitHubWorkUnitSummary({ now });
    expect(staleClaim).toMatchObject({ workUnitId: stale.workUnitId });
    await admin`
      update github_work_units set outcome_digest = ${digest("f")}
      where id = ${stale.workUnitId}
    `;
    expect(
      await completeGitHubWorkUnitSummary(
        staleClaim,
        providerResult("Must not be accepted."),
        now
      )
    ).toEqual({ accepted: false });
    expect(await readAttempt(stale)).toMatchObject({
      outcome: null,
      request_payload: null,
      state: "terminal",
    });

    const invalid = await seedUnit({
      activityAt: new Date("2026-09-01T09:00:00.000Z"),
      debounceUntil: new Date("2026-09-01T11:00:00.000Z"),
    });
    const invalidClaim = await claimGitHubWorkUnitSummary({ now });
    expect(invalidClaim).toMatchObject({ workUnitId: invalid.workUnitId });
    expect(await terminalGitHubWorkUnitSummary(invalidClaim, now)).toBe(true);
    expect(await terminalGitHubWorkUnitSummary(invalidClaim, now)).toBe(false);
    const invalidAttempt = await readAttempt(invalid);
    expect(invalidAttempt).toMatchObject({
      outcome: null,
      request_payload: null,
      state: "terminal",
    });
    expect(new Date(invalidAttempt.completed_at).getTime()).toBe(now.getTime());
    head = await readHead();
    expect(head).toMatchObject({
      feed_revision: "0",
      head_content_revision: "6",
      summarizing: false,
    });
  });
});
