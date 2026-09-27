import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql as query } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { closeDatabase, getDatabase } from "../src/db/client";
import { createCodexAccountSnapshot } from "../src/lib/codex/stats";
import {
  claimCodexAccount,
  releaseCodexAccount,
  saveCodexAccount,
} from "../src/lib/codex/store";
import { dateKey, WORK_LOG_TIME_ZONE } from "../src/lib/date";
import { publishGitHubActivitySnapshots } from "../src/lib/github-activity-snapshots";
import { readPublicGitHubActivityPage } from "../src/lib/github-activity-store";
import {
  claimGitHubCommitsForEnrichment,
  claimGitHubPushObservations,
  completeGitHubPushObservation,
  persistGitHubPullRequestMembership,
  persistGitHubPullRequestDiff,
} from "../src/lib/github-activity-worker-store";
import type {
  GitHubPullRequest,
  GitHubRepositoryFacts,
} from "../src/lib/github-commits-core";
import { TRACKED_GITHUB_USER_IDS } from "../src/lib/github-commits-core";
import {
  persistAccountIntake,
  readGitHubAccountCheckpoint,
} from "../src/lib/github-commits-store";
import { persistPullRequestSnapshotInTransaction } from "../src/lib/github-pull-request-store";
import {
  requestGitHubWorkUnitProjection,
  completeGitHubWorkUnitProjectionRequest,
} from "../src/lib/github-work-unit-projection-state";
import {
  refreshGitHubWorkUnitProjection,
  readGitHubWorkUnitProjectionEvidence,
} from "../src/lib/github-work-unit-store";
import { GITHUB_WORK_UNIT_SUMMARY_RECIPE } from "../src/lib/github-work-unit-summary";
import {
  claimGitHubWorkUnitSummary,
  completeGitHubWorkUnitSummary,
} from "../src/lib/github-work-unit-summary-store";
import { migrateDailyHistory } from "./migrate-daily-history";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    /^\/daily_history_[a-f0-9]+$/.test(url.pathname)
);
const sql = postgres(url.toString(), { max: 1 });
const now = new Date();
const today = now.toISOString().slice(0, 10);
const yesterday = new Date(now.getTime() - 86_400_000)
  .toISOString()
  .slice(0, 10);
const oldDay = new Date(now.getTime() - 3 * 86_400_000)
  .toISOString()
  .slice(0, 10);
const auth = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: {
    account_id: "test-provider",
    access_token: "test-access",
    refresh_token: "test-refresh",
  },
});
const snapshot = createCodexAccountSnapshot(
  {
    stats: {
      daily_usage_buckets: [
        { start_date: oldDay, tokens: 200 },
        { start_date: yesterday, tokens: 30 },
        { start_date: today, tokens: 0 },
      ],
    },
  },
  {}
);
try {
  const migration = postgres(url.toString(), {
    max: 1,
  });
  try {
    const legacyFolder = await mkdtemp(
      path.join(tmpdir(), "activity-migration-")
    );
    try {
      await cp("drizzle", legacyFolder, { recursive: true });
      const journal = JSON.parse(
        await readFile(path.join(legacyFolder, "meta/_journal.json"), "utf-8")
      );
      journal.entries = journal.entries.filter(
        (entry: { idx: number }) => entry.idx < 23
      );
      await writeFile(
        path.join(legacyFolder, "meta/_journal.json"),
        JSON.stringify(journal)
      );
      await migrate(drizzle(migration), { migrationsFolder: legacyFolder });
    } finally {
      await rm(legacyFolder, { recursive: true, force: true });
    }
    const currentId = randomUUID();
    const priorId = randomUUID();
    const pushId = randomUUID();
    const shaA = "a".repeat(40),
      shaB = "b".repeat(40);
    const digest = "c".repeat(64);
    await sql`insert into github_repositories(id,full_name) values ('90','example/migration')`;
    await sql`insert into github_pull_requests(node_id,repository_id,account,author_user_id,number,created_at,provider_updated_at,state,title,title_snapshot,url,base_sha,head_sha)
      values ('migration-pr','90','f0rr0','1',1,now(),now(),'open','Migration','Migration','https://github.com/example/migration/pull/1',${shaA},${shaB})`;
    await sql`insert into github_pull_request_versions(id,pull_request_node_id,base_repository_id,base_sha,head_sha,commit_count,is_current,membership_complete,file_facts,file_facts_complete,provider_updated_at)
      values (${currentId},'migration-pr','90',${shaA},${shaB},1,true,true,'[{"filename":"a.ts","patch":"+actual patch"}]',true,now()),
             (${priorId},'migration-pr','90',${shaA},${shaA},1,false,true,'[]',true,now())`;
    await sql`insert into github_pull_request_memberships(version_id,commit_repository_id,commit_sha,position,is_head)
      values (${currentId},'90',${shaB},0,true),(${priorId},'90',${shaA},0,true)`;
    const [originalEvidence] =
      await sql`select file_facts,file_facts_digest from github_pull_request_versions where id=${currentId}`;
    await sql`insert into github_push_observations(id,account,after_sha,before_sha,repository_id,repository_name_snapshot,ref_name,source,source_id)
      values (${pushId},'f0rr0',${shaB},${"0".repeat(40)},'90','example/migration','refs/heads/main','events','900')`;
    await sql`insert into github_push_observation_commits(observation_id,repository_id,sha,position) values (${pushId},'90',${shaB},1),(${pushId},'90',${shaA},0)`;
    await sql`insert into github_work_unit_accepted_summaries(identity_key,repository_id,attribution_mode,recipe,outcome_digest,summary_input_digest,outcome,accepted_at)
      values ('pr:migration-pr','90','tracked_authored_pr',${GITHUB_WORK_UNIT_SUMMARY_RECIPE},${digest},${digest},'Kept the historical summary',now())`;
    const usageBefore =
      await sql`select * from github_work_unit_summary_daily_usage order by day`;
    await sql`update github_push_observation_commits set repository_id='91' where observation_id=${pushId} and position=0`;
    await assert.rejects(
      migrate(drizzle(migration), { migrationsFolder: "drizzle" }),
      "A corrupt legacy list aborts the whole migration"
    );
    assert.equal(
      (
        await sql`select to_regclass('github_pull_request_versions') is not null as present`
      )[0].present,
      true
    );
    assert.equal(
      (
        await sql`select count(*)::int as n from information_schema.columns where table_name='github_pull_requests' and column_name='snapshot_id'`
      )[0].n,
      0,
      "DDL also rolls back on failed validation"
    );
    await sql`update github_push_observation_commits set repository_id='90' where observation_id=${pushId}`;
    await migrate(drizzle(migration), { migrationsFolder: "drizzle" });
    await migrate(drizzle(migration), { migrationsFolder: "drizzle" });
    assert.deepEqual(
      (
        await sql`select file_facts,file_facts_digest from github_pull_requests where node_id='migration-pr'`
      )[0],
      originalEvidence
    );
    assert.deepEqual(
      (
        await sql`select known_shas from github_push_observations where id=${pushId}`
      )[0].known_shas,
      [shaA, shaB]
    );
    assert.equal(
      (await sql`select version_id from github_pull_request_memberships`)[0]
        .version_id,
      currentId
    );
    assert.equal(
      (
        await sql`select count(*)::int as n from github_pull_request_memberships`
      )[0].n,
      1
    );
    const [accepted] =
      await sql`select outcome,started_requests from github_work_unit_summary_attempts where identity_key='pr:migration-pr'`;
    assert.equal(accepted.outcome, "Kept the historical summary");
    assert.equal(accepted.started_requests, 0);
    assert.deepEqual(
      await sql`select * from github_work_unit_summary_daily_usage order by day`,
      usageBefore
    );
    for (const table of [
      "github_pull_request_versions",
      "github_push_observation_commits",
      "github_work_unit_accepted_summaries",
    ]) {
      assert.equal(
        (await sql`select to_regclass(${table}) as name`)[0].name,
        null
      );
    }
    await sql`delete from github_pull_requests where node_id='migration-pr'`;
    await sql`delete from github_push_observations where id=${pushId}`;
  } finally {
    await migration.end();
  }
  await sql.unsafe(`create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, decrypted_secret text);
    create view vault.decrypted_secrets as select * from vault.secrets;
    create function vault.update_secret(uuid,text,text,text) returns uuid language sql as 'update vault.secrets set decrypted_secret = $2 where id = $1 returning id';`);
  await sql`insert into vault.secrets(name, decrypted_secret) values ('codex_auth_test', ${auth}), ('codex_auth_duplicate', ${auth})`;
  await sql`insert into codex_accounts(id,snapshot,snapshot_at) values ('test',${JSON.stringify(snapshot)}::text::jsonb, now())`;
  await migrateDailyHistory();
  assert.equal(
    (await sql`select snapshot from codex_accounts where id='test'`)[0].snapshot
      .dailyUsageBuckets,
    null
  );
  assert.deepEqual(await migrateDailyHistory(), {
    tokenDays: 0,
    github: { changed: false, workUnits: 0, issues: 0 },
  });
  const [first, second] = await Promise.all([
    claimCodexAccount("test"),
    claimCodexAccount("test"),
  ]);
  assert.ok(
    Number(first !== null) + Number(second !== null) === 1,
    "Only one overlapping sync owns the account"
  );
  const account = first ?? second;
  assert.ok(account);
  const corrected = structuredClone(snapshot);
  corrected.dailyUsageBuckets = [
    { startDate: oldDay, tokens: 999 },
    { startDate: yesterday, tokens: 40 },
    { startDate: today, tokens: 0 },
  ];
  await saveCodexAccount(account, auth, corrected);
  await saveCodexAccount(account, auth, {
    ...corrected,
    dailyUsageBuckets: null,
    cumulativeDailyUsageBuckets: null,
  });
  const days =
    await sql`select day::text, payload from codex_usage_days order by day`;
  assert.equal(
    days.find((row) => row.day === oldDay)?.payload.dailyUsageBuckets[0].tokens,
    200
  );
  assert.equal(
    days.find((row) => row.day === yesterday)?.payload.dailyUsageBuckets[0]
      .tokens,
    40
  );
  await sql`update codex_accounts set sync_token = gen_random_uuid() where id = 'test'`;
  await assert.rejects(
    saveCodexAccount(account, "invalid-stale-credentials", corrected)
  );
  assert.equal(
    (
      await sql`select decrypted_secret from vault.secrets where name = 'codex_auth_test'`
    )[0].decrypted_secret,
    auth
  );
  await releaseCodexAccount(account);
  await sql`insert into codex_accounts(id) values ('duplicate')`;
  await assert.rejects(
    claimCodexAccount("duplicate"),
    "Duplicate underlying identities cannot count twice"
  );

  await sql`insert into github_repositories(id, full_name, visibility, facts_verified_at) values ('1','example/repo','public',now()), ('2','example/other','public',now())`;
  const token = await requestGitHubWorkUnitProjection(getDatabase(), ["1"]);
  const newer = await requestGitHubWorkUnitProjection(getDatabase(), ["2"]);
  assert.equal(await completeGitHubWorkUnitProjectionRequest(token), false);
  assert.equal(
    (await sql`select projection_request_token from github_public_feed_head`)[0]
      .projection_request_token,
    newer
  );
  await refreshGitHubWorkUnitProjection();
  assert.ok(
    (await sql`select projection_request_token from github_repositories`).every(
      (row) => row.projection_request_token === null
    )
  );

  const workUnitId = randomUUID();
  const historicalAt = new Date(now.getTime() - 86_400_000);
  const historicalDay = dateKey(historicalAt, WORK_LOG_TIME_ZONE);
  const payload = {
    id: `${historicalDay}:pr:fixture`,
    day: historicalDay,
    kind: "pull-request",
    activityAt: historicalAt.toISOString(),
    repository: {
      key: "1",
      label: "example/repo",
      url: "https://github.com/example/repo",
      avatarUrl: null,
    },
    destination: {
      label: "Open pull request",
      url: "https://github.com/example/repo/pull/1",
    },
    facts: {
      additions: 200,
      deletions: 0,
      uniqueFileCount: 1,
      ownedCommitCount: 1,
      languages: [],
      dateRange: null,
    },
    headline: null,
    summary: null,
    summarizing: false,
  };
  const digest = "a".repeat(64);
  await sql`insert into github_activity_snapshots(day, identity_key, repository_id, payload, work_unit_id, work_unit_revision, attribution_mode, outcome_digest, summary_input_digest)
    values (${historicalDay}, 'pr:fixture', '1', ${sql.json(payload)}, ${workUnitId}, 1, 'tracked_authored_pr', ${digest}, ${digest})`;
  await assert.rejects(
    sql`update github_activity_snapshots set payload = jsonb_set(payload, '{facts,additions}', '240')`
  );
  await assert.rejects(sql`delete from github_activity_snapshots`);
  await sql`insert into github_work_unit_summary_attempts(work_unit_id, revision, identity_key, repository_id, attribution_mode, recipe, outcome_digest, summary_input_digest, request_payload, debounce_until)
    values (${workUnitId},1,'pr:fixture','1','tracked_authored_pr',${GITHUB_WORK_UNIT_SUMMARY_RECIPE},${digest},${digest},'{}',now()-interval '1 minute')`;
  const claim = await claimGitHubWorkUnitSummary();
  assert.ok(
    claim,
    "A saved card pins its pending summary after the live work unit disappears"
  );
  await completeGitHubWorkUnitSummary(claim, {
    outcome: "Added search",
    model: "gpt-5.4-nano-2026-03-17",
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  });
  const [saved] = await sql`select payload from github_activity_snapshots`;
  assert.equal(saved.payload.headline, "Added search");
  assert.deepEqual(saved.payload.facts, payload.facts);
  await assert.rejects(
    sql`update github_activity_snapshots set payload = jsonb_set(payload, '{headline}', '"Changed past"')`
  );
  await sql`update github_repositories set visibility = 'private' where id = '1'`;
  const page = await readPublicGitHubActivityPage(null);
  assert.equal(page.days[0].repositories[0].repository.label, "Private");
  assert.equal(page.days[0].repositories[0].items[0].destination, null);

  const sha = "b".repeat(40);
  const facts = [
    {
      filename: "src/search.ts",
      additions: 1,
      deletions: 0,
      changes: 1,
      status: "added",
      previousFilename: null,
      binary: false,
      patchComplete: true,
      patch: "@@ -0,0 +1 @@\n+search",
    },
  ];
  await sql`insert into github_commits(repository_id, sha, author_login, message, committed_at, first_observed_at, enrichment_state, pr_discovery_state, file_facts, file_facts_complete)
    values ('1',${sha},'f0rr0','Add search',now()-interval '40 days',now()-interval '40 days','complete','complete',${sql.json(facts)},true)`;
  const [before] =
    await sql`select file_facts_digest from github_commits where sha=${sha}`;
  const branchId = randomUUID();
  const branchUnitId = randomUUID();
  const branchIdentity = `branch:${branchId}`;
  const branchPayload = {
    ...payload,
    id: `${historicalDay}:${branchIdentity}`,
    kind: "branch",
  };
  await sql`insert into github_activity_snapshots(day, identity_key, repository_id, payload, work_unit_id, work_unit_revision, attribution_mode, outcome_digest)
    values (${historicalDay},${branchIdentity},'1',${sql.json(branchPayload)},${branchUnitId},1,'branch_owned_composite',${digest})`;
  const insertBranch = async () =>
    await sql`insert into github_work_units(id, identity_key, kind, branch_lineage_id, repository_id,
    newest_commit_repository_id, newest_commit_sha, activity_at, activity_anchor_at, activity_day, first_activity_at, last_activity_at,
    content_observed_at, attribution_mode, visibility, additions, deletions, file_count, member_count, facts_digest, membership_digest, outcome_digest)
    values (${branchUnitId},${branchIdentity},'branch',${branchId},'1','1',${sha},${historicalAt},${historicalAt},${historicalAt.toISOString().slice(0, 10)},
      ${historicalAt},${historicalAt},now(),'branch_owned_composite','public',240,0,1,1,${"b".repeat(64)},${digest},${"b".repeat(64)})`;
  await insertBranch();
  await sql`insert into github_work_unit_memberships(work_unit_id, logical_repository_id, logical_sha, position) values (${branchUnitId},'1',${sha},0)`;
  assert.equal(
    (await sql`select cleanup_activity_history() as result`)[0].result
      .commitPatches,
    0,
    "Live memberships pin raw patches"
  );
  await publishGitHubActivitySnapshots(["1"]);
  const branchRows =
    await sql`select day::text, payload from github_activity_snapshots where identity_key=${branchIdentity} order by day`;
  assert.equal(branchRows.length, 2);
  assert.deepEqual(
    branchRows.map((row) => row.payload.facts.additions),
    [200, 240]
  );
  await publishGitHubActivitySnapshots(["1"]);
  assert.equal(
    (
      await sql`select count(*)::int as n from github_activity_snapshots where identity_key=${branchIdentity}`
    )[0].n,
    2
  );
  await sql`update github_work_units set outcome_digest=null, additions=300 where id=${branchUnitId}`;
  await publishGitHubActivitySnapshots(["1"]);
  assert.equal(
    (
      await sql`select payload from github_activity_snapshots where identity_key=${branchIdentity} order by day desc limit 1`
    )[0].payload.facts.additions,
    240
  );
  await sql`delete from github_work_units where id=${branchUnitId}`;
  await publishGitHubActivitySnapshots(["1"], false, ["1"]);
  assert.equal(
    (
      await sql`select count(*)::int as n from github_activity_snapshots where identity_key=${branchIdentity}`
    )[0].n,
    2
  );
  await publishGitHubActivitySnapshots(["1"]);
  assert.equal(
    (
      await sql`select count(*)::int as n from github_activity_snapshots where identity_key=${branchIdentity}`
    )[0].n,
    1,
    "Only today's disappeared ownership is removed"
  );
  const [cleanup] = await sql`select cleanup_activity_history() as result`;
  assert.equal(cleanup.result.commitPatches, 1);
  const [after] =
    await sql`select file_facts, file_facts_digest, file_facts_complete from github_commits where sha=${sha}`;
  assert.equal(after.file_facts[0].patch, null);
  assert.equal(after.file_facts_digest, before.file_facts_digest);
  assert.equal(after.file_facts_complete, true);
  assert.equal(
    (await sql`select cleanup_activity_history() as result`)[0].result
      .commitPatches,
    0
  );
  assert.equal(
    (await claimGitHubCommitsForEnrichment(1, ["f0rr0"])).length,
    0,
    "Retention must not cause a refetch loop"
  );
  await insertBranch();
  await sql`insert into github_work_unit_memberships(work_unit_id, logical_repository_id, logical_sha, position) values (${branchUnitId},'1',${sha},0)`;
  assert.equal(
    (await claimGitHubCommitsForEnrichment(1, ["f0rr0"])).length,
    1,
    "A reintroduced commit fetches its patch again"
  );
  await sql`update github_commits set file_facts=${sql.json(facts)}, file_facts_pruned_at=null where sha=${sha}`;
  assert.equal(
    (
      await sql`select file_facts_digest from github_commits where sha=${sha}`
    )[0].file_facts_digest,
    before.file_facts_digest
  );
  await sql`insert into github_pull_requests(node_id, repository_id, account, author_user_id, number, created_at, provider_updated_at, state, title, title_snapshot, url)
    values ('fork-pr','2','f0rr0',${TRACKED_GITHUB_USER_IDS.f0rr0},1,now(),now(),'open','Fork work','Fork work','https://github.com/example/other/pull/1')`;
  await sql`insert into github_commit_pull_request_associations(commit_repository_id, commit_sha, pull_request_node_id) values ('1',${sha},'fork-pr')`;
  for (const repository of ["1", "2"]) {
    const scope = await readGitHubWorkUnitProjectionEvidence([repository]);
    assert.deepEqual(
      scope.input.repositories.map(({ id }) => id),
      ["1", "2"],
      "Fork dependencies expand in both directions"
    );
  }
  await sql`insert into github_issues(node_id, repository_id, account, author_user_id, number, created_at, title_snapshot, url_snapshot)
    values ('late-issue','2','f0rr0',${TRACKED_GITHUB_USER_IDS.f0rr0},2,${historicalAt},'Late discovery','https://github.com/example/other/issues/2')`;
  await publishGitHubActivitySnapshots(["2"]);
  const [issue] =
    await sql`select day::text from github_activity_snapshots where identity_key='issue:late-issue'`;
  assert.equal(
    issue?.day,
    dateKey(now, WORK_LOG_TIME_ZONE),
    "Late issues publish today without changing past pages"
  );
  const repository: GitHubRepositoryFacts = {
    id: "90",
    fullName: "example/migration",
    defaultBranch: "main",
    htmlUrl: null,
    ownerAvatarUrl: null,
    ownerId: "1",
    ownerLogin: "example",
    ownerType: "User",
    pushedAt: null,
    visibility: "public",
  };
  const pr: GitHubPullRequest = {
    action: "synchronize",
    additions: 200,
    deletions: 0,
    author: "f0rr0",
    authorAccount: "f0rr0",
    authorUserId: TRACKED_GITHUB_USER_IDS.f0rr0,
    baseRef: "main",
    baseRepository: repository,
    baseSha: "a".repeat(40),
    body: null,
    changedFiles: 1,
    closedAt: null,
    commitCount: 1,
    createdAt: now.toISOString(),
    draft: false,
    headRef: "feature",
    headRepository: repository,
    headSha: "b".repeat(40),
    id: "901",
    mergeCommitSha: undefined,
    merged: false,
    mergedAt: null,
    nodeId: "migration-pr",
    number: 1,
    providerUpdatedAt: now.toISOString(),
    repository,
    state: "open",
    title: "Search",
    url: "https://github.com/example/migration/pull/1",
  };
  const persist = async (
    value: GitHubPullRequest,
    authority: "authoritative" | "observed" = "authoritative"
  ) =>
    await getDatabase().transaction(
      async (tx) =>
        await persistPullRequestSnapshotInTransaction(
          tx,
          "f0rr0",
          value,
          { authority, refreshMembership: true },
          new Date()
        )
    );
  const firstPr = await persist(pr);
  assert.ok(firstPr);
  assert.equal(
    await persistGitHubPullRequestMembership(
      firstPr,
      pr.headSha,
      [pr.headSha],
      true
    ),
    true
  );
  assert.equal(
    await persistGitHubPullRequestDiff(firstPr, pr.baseSha, pr.headSha, facts),
    true
  );
  const repeated = await persist(pr);
  assert.equal(repeated?.versionId, firstPr.versionId);
  assert.equal(repeated?.diffRefreshRequired, false);
  assert.equal(repeated?.membershipRefreshRequired, false);
  const secondPr = await persist({ ...pr, headSha: "c".repeat(40) });
  assert.ok(secondPr);
  assert.notEqual(secondPr.versionId, firstPr.versionId);
  assert.equal(
    await persistGitHubPullRequestDiff(firstPr, pr.baseSha, pr.headSha, facts),
    false
  );
  const restored = await persist(pr);
  assert.ok(restored);
  assert.notEqual(
    restored.versionId,
    firstPr.versionId,
    "A -> B -> A does not resurrect a stale lease"
  );
  assert.equal(
    await persistGitHubPullRequestMembership(
      firstPr,
      pr.headSha,
      [pr.headSha],
      true
    ),
    false
  );
  assert.equal(
    await persistGitHubPullRequestMembership(
      restored,
      pr.headSha,
      [pr.headSha, pr.headSha],
      true
    ),
    false
  );
  const rebased = await persist({ ...pr, baseSha: "d".repeat(40) });
  assert.ok(rebased);
  assert.notEqual(rebased.versionId, restored.versionId);
  assert.equal(
    await persistGitHubPullRequestDiff(restored, pr.baseSha, pr.headSha, facts),
    false
  );
  assert.equal(
    await persist(pr, "observed"),
    null,
    "Equal-time webhook cannot replace a different authoritative base"
  );
  assert.equal(
    await persist({
      ...pr,
      providerUpdatedAt: new Date(now.getTime() - 1000).toISOString(),
    }),
    null
  );
  const emptyPr = await persist({ ...pr, commitCount: 0, changedFiles: 0 });
  assert.ok(emptyPr);
  assert.equal(
    await persistGitHubPullRequestMembership(emptyPr, pr.headSha, [], true),
    true
  );
  assert.equal(
    await persistGitHubPullRequestDiff(emptyPr, pr.baseSha, pr.headSha, []),
    true
  );

  const mergedPr = await persist({
    ...pr,
    commitCount: 0,
    changedFiles: 0,
    state: "closed",
    closedAt: now.toISOString(),
    merged: true,
    mergedAt: now.toISOString(),
    mergeCommitSha: null,
  });
  assert.equal(
    mergedPr?.versionId,
    emptyPr.versionId,
    "Merge metadata does not discard unchanged evidence"
  );
  const reopenedPr = await persist({ ...pr, commitCount: 0, changedFiles: 0 });
  assert.equal(reopenedPr?.versionId, emptyPr.versionId);
  assert.equal(
    (
      await sql`select merge_snapshot from github_pull_requests where node_id=${pr.nodeId}`
    )[0].merge_snapshot,
    false
  );
  const reusedId = randomUUID();
  const reusedDigest = "c".repeat(64);
  await sql`insert into github_work_units(id,identity_key,kind,pull_request_node_id,repository_id,newest_commit_repository_id,newest_commit_sha,
    activity_at,activity_anchor_at,activity_day,first_activity_at,last_activity_at,content_observed_at,attribution_mode,visibility,
    additions,deletions,file_count,member_count,facts_digest,membership_digest,outcome_digest,summary_input_digest,summary_evaluation_digest,summary_evaluated_digest)
    values (${reusedId},'pr:migration-pr','pull_request','migration-pr','90','1',${sha},${now},${now},${today},${now},${now},${now},'tracked_authored_pr','public',200,0,1,1,
      ${reusedDigest},${reusedDigest},${reusedDigest},${reusedDigest},${reusedDigest},${reusedDigest})`;
  await sql`insert into github_work_unit_summary_attempts(work_unit_id,revision,identity_key,repository_id,attribution_mode,recipe,outcome_digest,summary_input_digest,request_payload,debounce_until)
    values (${reusedId},1,'pr:migration-pr','90','tracked_authored_pr',${GITHUB_WORK_UNIT_SUMMARY_RECIPE},${reusedDigest},${reusedDigest},'{}',now()-interval '1 minute')`;
  const usageBeforeReuse =
    await sql`select * from github_work_unit_summary_daily_usage order by day`;
  assert.equal(
    await claimGitHubWorkUnitSummary(),
    null,
    "An imported accepted outcome is reused without another paid request"
  );
  const [reusedAttempt] =
    await sql`select state,outcome,started_requests from github_work_unit_summary_attempts where work_unit_id=${reusedId}`;
  assert.equal(reusedAttempt.state, "accepted");
  assert.equal(reusedAttempt.outcome, "Kept the historical summary");
  assert.equal(reusedAttempt.started_requests, 0);
  assert.deepEqual(
    await sql`select * from github_work_unit_summary_daily_usage order by day`,
    usageBeforeReuse
  );
  await refreshGitHubWorkUnitProjection();
  assert.equal(
    (
      await sql`select count(*)::int as n from github_work_units where id=${reusedId}`
    )[0].n,
    0
  );
  assert.equal(
    (
      await sql`select state from github_work_unit_summary_attempts where work_unit_id=${reusedId}`
    )[0].state,
    "accepted",
    "Zero-start accepted summaries survive removal of live work"
  );
  const push = {
    before: "0".repeat(40),
    head: pr.headSha,
    commitShas: [pr.baseSha, pr.headSha],
    pushedBy: "f0rr0" as const,
    ref: "refs/heads/feature",
    repository,
    size: 2,
  };
  const intake = async (commitShas = push.commitShas) =>
    await persistAccountIntake({
      account: "f0rr0",
      events: [
        {
          id: "901",
          occurredAt: now.toISOString(),
          issue: null,
          pullRequest: null,
          push: { ...push, commitShas },
        },
      ],
      expectedCheckpoint: await readGitHubAccountCheckpoint("f0rr0"),
      gap: null,
      latestEventId: "901",
    });
  await assert.rejects(
    intake([pr.headSha, pr.headSha]),
    "Duplicate SHAs are rejected before storage"
  );
  await assert.rejects(
    intake(["invalid", pr.headSha]),
    "Malformed SHAs are rejected before storage"
  );
  assert.equal((await intake()).knownCommits, 2);
  assert.equal((await intake()).pushes, 0);
  await assert.rejects(
    intake([pr.headSha, pr.baseSha]),
    "Conflicting order must not replace durable evidence"
  );
  const [pushClaim] = await claimGitHubPushObservations(1, ["f0rr0"]);
  assert.ok(pushClaim !== undefined);
  assert.deepEqual(pushClaim.knownShas, push.commitShas);
  await sql`update github_push_observations set source='refs',expected_commit_count=null,known_shas=array[${pr.headSha}] where id=${pushClaim.id}`;
  assert.equal(
    (await intake()).pushes,
    1,
    "Exact event evidence promotes an incomplete ref observation"
  );
  assert.equal(
    (
      await completeGitHubPushObservation(pushClaim, {
        commitShas: push.commitShas,
        commits: [],
      })
    ).stale,
    true,
    "Promotion invalidates an in-flight claim"
  );
  const [promotedClaim] = await claimGitHubPushObservations(1, ["f0rr0"]);
  assert.ok(promotedClaim !== undefined);
  assert.deepEqual(promotedClaim.knownShas, push.commitShas);

  assert.equal(
    (
      await completeGitHubPushObservation(promotedClaim, {
        commitShas: push.commitShas,
        commits: [],
      })
    ).stale,
    false
  );
  assert.equal(
    (
      await completeGitHubPushObservation(promotedClaim, {
        commitShas: push.commitShas,
        commits: [],
      })
    ).stale,
    true
  );
  assert.deepEqual(
    (
      await sql`select known_shas from github_push_observations where id=${pushClaim.id}`
    )[0].known_shas,
    push.commitShas
  );
  await getDatabase().execute(query`select 1`);
  process.stdout.write("daily history database checks passed\n");
} finally {
  await closeDatabase();
  await sql.end();
}
