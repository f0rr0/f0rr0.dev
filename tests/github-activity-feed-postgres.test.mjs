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

import { env } from "../src/env.ts";

setDefaultTimeout(30_000);

const dockerAvailable =
  Bun.spawnSync(["docker", "info"], {
    stderr: "ignore",
    stdout: "ignore",
  }).exitCode === 0;

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const postgresImage = "postgres:17-alpine";
const postgresPassword = "github-activity-test";

const activityIds = {
  alias: "00000000-0000-4000-8000-000000000003",
  canonical: "00000000-0000-4000-8000-000000000001",
  direct: "00000000-0000-4000-8000-000000000002",
  issue: "00000000-0000-4000-8000-000000000005",
  mergeCommit: "00000000-0000-4000-8000-000000000018",
  mergeOnlyDay: "00000000-0000-4000-8000-000000000019",
  mergedPullRequest: "00000000-0000-4000-8000-000000000004",
  previousDay: "00000000-0000-4000-8000-000000000006",
  postSnapshot: "00000000-0000-4000-8000-000000000007",
  summaryEligible: "00000000-0000-4000-8000-000000000020",
};

const shas = {
  alias: "b".repeat(40),
  canonical: "a".repeat(40),
  direct: "c".repeat(40),
  mergeCommit: "f".repeat(40),
  mergeOnlyDay: `${"0".repeat(39)}1`,
  previousDay: "d".repeat(40),
  postSnapshot: "e".repeat(40),
  summaryEligible: `${"0".repeat(39)}2`,
};

const versionIds = {
  current: "10000000-0000-4000-8000-000000000001",
  incomplete: "10000000-0000-4000-8000-000000000002",
  stale: "10000000-0000-4000-8000-000000000003",
};

const checkedOutput = (result, operation) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${operation} failed: ${result.stderr.toString("utf-8").trim()}`
    );
  }
  return result.stdout.toString("utf-8").trim();
};

describe.skipIf(!dockerAvailable)(
  "GitHub activity PostgreSQL projection",
  () => {
    let admin;
    let canonicalizeGitHubCommitActivity;
    let claimDueGitHubPullRequests;
    let claimGitHubSummaryAttempts;
    let closeDatabase;
    let completeGitHubPullRequestReconciliation;
    let completeGitHubSummaryAttempt;
    let containerId;
    let databaseUrl;
    let ensureGitHubSummaryAttempt;
    let ensureMissingGitHubSummaryAttempts;
    let originalCronSecret;
    let originalDatabaseUrl;
    let persistAccountIntake;
    let persistGitHubRepositoryBackfill;
    let persistGitHubRepositoryRefs;
    let readPublicGitHubActivityPage;

    beforeAll(async () => {
      originalCronSecret = env.CRON_SECRET;
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
        "POSTGRES_DB=github_activity_test",
        postgresImage,
      ]);
      containerId = checkedOutput(started, "Starting ephemeral PostgreSQL");

      const portResult = Bun.spawnSync([
        "docker",
        "port",
        containerId,
        "5432/tcp",
      ]);
      const publishedPort = checkedOutput(
        portResult,
        "Resolving ephemeral PostgreSQL port"
      );
      const port = /:(\d+)$/u.exec(publishedPort)?.[1];
      if (port === undefined) {
        throw new Error("Docker returned an invalid PostgreSQL port.");
      }
      databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_activity_test`;

      let ready = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const probe = postgres(databaseUrl, {
          connect_timeout: 1,
          max: 1,
          prepare: false,
        });
        try {
          await probe`select 1`;
          ready = true;
          await probe.end({ timeout: 1 });
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

      env.CRON_SECRET = "github-activity-cursor-test-secret";
      env.DATABASE_URL = databaseUrl;
      ({ closeDatabase } = await import("../src/db/client.ts"));
      ({ readPublicGitHubActivityPage } =
        await import("../src/lib/github-activity-store.ts"));
      ({
        canonicalizeGitHubCommitActivity,
        claimDueGitHubPullRequests,
        claimGitHubSummaryAttempts,
        completeGitHubPullRequestReconciliation,
        completeGitHubSummaryAttempt,
        ensureGitHubSummaryAttempt,
        ensureMissingGitHubSummaryAttempts,
      } = await import("../src/lib/github-activity-worker-store.ts"));
      ({
        persistAccountIntake,
        persistGitHubRepositoryBackfill,
        persistGitHubRepositoryRefs,
      } = await import("../src/lib/github-commits-store.ts"));
    });

    afterAll(async () => {
      await closeDatabase?.();
      await admin?.end({ timeout: 1 });
      if (originalDatabaseUrl === undefined) {
        delete env.DATABASE_URL;
      } else {
        env.DATABASE_URL = originalDatabaseUrl;
      }
      if (originalCronSecret === undefined) {
        delete env.CRON_SECRET;
      } else {
        env.CRON_SECRET = originalCronSecret;
      }
      if (containerId !== undefined) {
        Bun.spawnSync(["docker", "stop", "--time", "1", containerId], {
          stderr: "ignore",
          stdout: "ignore",
        });
      }
    });

    test("checkpoints repository refs and emits only new reachable ranges", async () => {
      const repository = {
        fullName: "example-org/ref-checkpoints",
        htmlUrl: "https://github.com/example-org/ref-checkpoints",
        id: "404",
        ownerAvatarUrl: null,
        ownerId: "202",
        ownerLogin: "example-org",
        ownerType: "Organization",
        visibility: "private",
      };
      const firstSha = "6".repeat(40);
      const secondSha = "7".repeat(40);
      const first = await persistGitHubRepositoryRefs({
        account: "f0rr0",
        observedAt: new Date("2026-08-29T08:00:00.000Z"),
        refs: [
          { headSha: firstSha, kind: "head", refName: "refs/heads/main" },
          { headSha: firstSha, kind: "tag", refName: "refs/tags/v1" },
        ],
        repository,
      });
      expect(first).toEqual({ knownCommits: 0, pushes: 1, refs: 2 });

      const unchanged = await persistGitHubRepositoryRefs({
        account: "f0rr0",
        observedAt: new Date("2026-08-29T09:00:00.000Z"),
        refs: [
          { headSha: firstSha, kind: "head", refName: "refs/heads/main" },
          { headSha: firstSha, kind: "tag", refName: "refs/tags/v1" },
        ],
        repository,
      });
      expect(unchanged.pushes).toBe(0);

      const moved = await persistGitHubRepositoryRefs({
        account: "f0rr0",
        observedAt: new Date("2026-08-29T10:00:00.000Z"),
        refs: [
          { headSha: secondSha, kind: "head", refName: "refs/heads/main" },
        ],
        repository,
      });
      expect(moved.pushes).toBe(1);

      const refs = await admin`
        select active, head_sha, ref_name
        from github_repository_refs
        where repository_id = '404'
        order by ref_name
      `;
      expect(refs).toEqual([
        { active: true, head_sha: secondSha, ref_name: "refs/heads/main" },
        { active: false, head_sha: firstSha, ref_name: "refs/tags/v1" },
      ]);
      const observations = await admin`
        select after_sha, before_sha, ref_name, source
        from github_push_observations
        where repository_id = '404'
        order by observed_at
      `;
      expect(observations).toEqual([
        {
          after_sha: firstSha,
          before_sha: "0".repeat(40),
          ref_name: "refs/heads/main",
          source: "refs",
        },
        {
          after_sha: secondSha,
          before_sha: firstSha,
          ref_name: "refs/heads/main",
          source: "refs",
        },
      ]);
    });

    test("queues idempotent bounded backfill observations per distinct ref head", async () => {
      const headSha = "8".repeat(40);
      const repository = {
        fullName: "example-org/backfill-checkpoints",
        htmlUrl: "https://github.com/example-org/backfill-checkpoints",
        id: "405",
        ownerAvatarUrl: null,
        ownerId: "202",
        ownerLogin: "example-org",
        ownerType: "Organization",
        visibility: "private",
      };
      const input = {
        account: "f0rr0",
        observedAt: new Date("2026-08-29T11:00:00.000Z"),
        refs: [
          { headSha, kind: "head", refName: "refs/heads/main" },
          { headSha, kind: "tag", refName: "refs/tags/v1" },
        ],
        repository,
        windows: [
          {
            sinceAt: new Date("2026-07-01T00:00:00.000Z"),
            untilAt: new Date("2026-07-31T23:59:59.999Z"),
          },
          {
            sinceAt: new Date("2026-08-01T00:00:00.000Z"),
            untilAt: new Date("2026-08-29T23:59:59.999Z"),
          },
        ],
      };

      try {
        expect(await persistGitHubRepositoryBackfill(input)).toEqual({
          duplicates: 0,
          observations: 2,
          refs: 1,
        });
        expect(await persistGitHubRepositoryBackfill(input)).toEqual({
          duplicates: 2,
          observations: 0,
          refs: 1,
        });
        const observations = await admin`
        select before_sha, history_since_at, history_until_at, ref_name, source
        from github_push_observations
        where repository_id = '405'
        order by history_since_at
      `;
        expect(observations).toEqual([
          {
            before_sha: "0".repeat(40),
            history_since_at: "2026-07-01 00:00:00+00",
            history_until_at: "2026-07-31 23:59:59.999+00",
            ref_name: "refs/heads/main",
            source: "backfill",
          },
          {
            before_sha: "0".repeat(40),
            history_since_at: "2026-08-01 00:00:00+00",
            history_until_at: "2026-08-29 23:59:59.999+00",
            ref_name: "refs/heads/main",
            source: "backfill",
          },
        ]);

        await admin`
        update github_push_observations
        set state = 'unavailable'
        where repository_id = '405'
          and history_since_at = '2026-07-01T00:00:00.000Z'
      `;
        expect(
          await persistGitHubRepositoryBackfill({
            ...input,
            observedAt: new Date("2026-08-29T12:00:00.000Z"),
          })
        ).toEqual({ duplicates: 1, observations: 1, refs: 1 });
      } finally {
        await admin`delete from github_push_observations where repository_id = '405'`;
        await admin`delete from github_repositories where id = '405'`;
        await admin`delete from github_account_checkpoints where account = 'f0rr0'`;
      }
    });

    test("pages complete UTC days and projects only current complete PR membership", async () => {
      await admin.begin(async (transaction) => {
        await transaction`
        insert into github_repositories (
          id, full_name, html_url, owner_avatar_url, owner_id, owner_login,
          owner_type, visibility
        ) values
          (
            '101', 'f0rr0/source', 'https://github.com/f0rr0/source',
            'https://avatars.githubusercontent.com/u/101', '101', 'f0rr0',
            'User', 'public'
          ),
          (
            '202', 'example-org/upstream',
            'https://github.com/example-org/upstream',
            'https://avatars.githubusercontent.com/u/202', '202',
            'example-org', 'Organization', 'public'
          )
      `;

        await transaction`
        insert into github_commits (
          activity_public_id, additions, author_login, committed_at,
          committer_at, changed_files, deletions, enrichment_state, languages,
          message, repository, repository_id, sha, substantive_loc
        ) values
          (
            ${activityIds.canonical}, 5, 'f0rr0',
            '2026-08-28T09:00:00.000Z', '2026-08-28T09:00:00.000Z',
            2, 1, 'complete',
            '[{"changedLines":6,"id":"typescript","label":"TypeScript"}]'::jsonb,
            'Canonical source', 'f0rr0/source', '101', ${shas.canonical}, 30
          ),
          (
            ${activityIds.direct}, 7, 'f0rr0',
            '2026-08-28T10:00:00.000Z', '2026-08-28T10:00:00.000Z',
            1, 2, 'complete', '[]'::jsonb,
            'Direct PR member', 'example-org/upstream', '202', ${shas.direct}, 9
          ),
          (
            ${activityIds.alias}, 5, 'f0rr0',
            '2026-08-28T10:30:00.000Z', '2026-08-28T10:30:00.000Z',
            2, 1, 'complete', '[]'::jsonb,
            'Rebased copy', 'example-org/upstream', '202', ${shas.alias}, 30
          ),
          (
            ${activityIds.previousDay}, 3, 'yuppiestechdev',
            '2026-08-27T08:00:00.000Z', '2026-08-27T08:00:00.000Z',
            1, 1, 'complete', '[]'::jsonb,
            'Previous day', 'f0rr0/source', '101', ${shas.previousDay}, 4
          ),
          (
            ${activityIds.mergeCommit}, 100, 'f0rr0',
            '2026-08-28T12:30:00.000Z', '2026-08-28T12:30:00.000Z',
            10, 50, 'complete', '[]'::jsonb,
            'Merge branch next into feature', 'f0rr0/source', '101',
            ${shas.mergeCommit}, 150
          ),
          (
            ${activityIds.mergeOnlyDay}, 200, 'f0rr0',
            '2026-08-26T12:30:00.000Z', '2026-08-26T12:30:00.000Z',
            20, 75, 'complete', '[]'::jsonb,
            'Octopus merge on an otherwise empty day', 'f0rr0/source', '101',
            ${shas.mergeOnlyDay}, 275
          ),
          (
            ${activityIds.summaryEligible}, 1, 'f0rr0',
            '2026-08-28T08:30:00.000Z', '2026-08-28T08:30:00.000Z',
            1, 0, 'complete', '[]'::jsonb,
            'Ordinary summary candidate', 'f0rr0/source', '101',
            ${shas.summaryEligible}, 1
          )
      `;

        await transaction`
        update github_commits
        set parent_shas = ${JSON.stringify(["7".repeat(40)])}::jsonb,
          canonicalized_at = '2026-08-28T12:45:00.000Z'
        where activity_public_id in (
          ${activityIds.canonical}, ${activityIds.direct}, ${activityIds.alias}
        )
      `;
        await transaction`
        update github_commits
        set parent_shas = '[]'::jsonb,
          canonicalized_at = '2026-08-28T12:45:00.000Z'
        where activity_public_id = ${activityIds.previousDay}
      `;
        await transaction`
        update github_commits
        set parent_shas = ${JSON.stringify([
          "1".repeat(40),
          "2".repeat(40),
        ])}::jsonb,
          canonicalized_at = '2026-08-28T12:45:00.000Z'
        where repository_id = '101' and sha = ${shas.mergeCommit}
      `;
        await transaction`
        update github_commits
        set parent_shas = ${JSON.stringify([
          "3".repeat(40),
          "4".repeat(40),
          "5".repeat(40),
        ])}::jsonb,
          canonicalized_at = '2026-08-26T12:45:00.000Z'
        where repository_id = '101' and sha = ${shas.mergeOnlyDay}
      `;
        await transaction`
        update github_commits
        set parent_shas = '[]'::jsonb,
          canonicalized_at = '2026-08-28T08:45:00.000Z'
        where repository_id = '101' and sha = ${shas.summaryEligible}
      `;

        await transaction`
        insert into github_pull_requests (
          account, author_login, author_user_id, created_at, merged_at, node_id,
          number, provider_updated_at, repository_id, state, terminal_at, title,
          title_snapshot, url
        ) values
          (
            'f0rr0', 'f0rr0', '101', '2026-08-20T08:00:00.000Z',
            '2026-08-28T11:00:00.000Z', 'PR_current', 12,
            '2026-08-28T11:00:00.000Z', '202', 'merged',
            '2026-08-28T11:00:00.000Z', 'Current reconciled title',
            'Original title', 'https://github.com/example-org/upstream/pull/12'
          ),
          (
            'f0rr0', 'f0rr0', '101', '2026-08-01T08:00:00.000Z', null,
            'PR_incomplete', 13, '2026-08-20T08:00:00.000Z', '202', 'open',
            null, 'Incomplete membership title', 'Incomplete membership title',
            'https://github.com/example-org/upstream/pull/13'
          ),
          (
            'f0rr0', 'f0rr0', '101', '2026-08-01T07:00:00.000Z', null,
            'PR_stale', 14, '2026-08-20T07:00:00.000Z', '202', 'open', null,
            'Stale non-current title', 'Stale non-current title',
            'https://github.com/example-org/upstream/pull/14'
          )
      `;

        await transaction`
        insert into github_pull_request_versions (
          base_sha, head_sha, id, is_current, membership_complete,
          merge_snapshot, provider_updated_at, pull_request_node_id
        ) values
          (
            ${"1".repeat(40)}, ${shas.direct}, ${versionIds.current}, true,
            true, true, '2026-08-28T11:00:00.000Z', 'PR_current'
          ),
          (
            ${"2".repeat(40)}, ${shas.direct}, ${versionIds.incomplete}, true,
            false, false, '2026-08-20T08:00:00.000Z', 'PR_incomplete'
          ),
          (
            ${"3".repeat(40)}, ${shas.direct}, ${versionIds.stale}, false,
            true, false, '2026-08-20T07:00:00.000Z', 'PR_stale'
          )
      `;

        await transaction`
        insert into github_pull_request_memberships (
          commit_repository_id, commit_sha, position, version_id
        ) values
          ('202', ${shas.alias}, 0, ${versionIds.current}),
          ('202', ${shas.direct}, 1, ${versionIds.current}),
          ('202', ${shas.direct}, 0, ${versionIds.incomplete}),
          ('202', ${shas.direct}, 0, ${versionIds.stale})
      `;

        await transaction`
        insert into github_issues (
          account, author_login, author_user_id, created_at, node_id, number,
          repository_id, title_snapshot, url_snapshot
        ) values (
          'f0rr0', 'f0rr0', '101', '2026-08-28T12:00:00.000Z', 'ISSUE_1',
          31, '101', 'Track the rollout',
          'https://github.com/f0rr0/source/issues/31'
        )
      `;

        await transaction`
        insert into github_public_activities (
          public_id, kind, occurred_at, published_at, repository_id, revision,
          source_node_id
        ) values
          (
            ${activityIds.canonical}, 'commit', '2026-08-28T09:00:00.000Z',
            '2026-08-28T13:00:00.000Z', '101', 1, ${shas.canonical}
          ),
          (
            ${activityIds.direct}, 'commit', '2026-08-28T10:00:00.000Z',
            '2026-08-28T13:00:00.000Z', '202', 1, ${shas.direct}
          ),
          (
            ${activityIds.mergedPullRequest}, 'pull_request',
            '2026-08-28T11:00:00.000Z', '2026-08-28T13:00:00.000Z', '202', 1,
            'PR_current'
          ),
          (
            ${activityIds.issue}, 'issue', '2026-08-28T12:00:00.000Z',
            '2026-08-28T13:00:00.000Z', '101', 1, 'ISSUE_1'
          ),
          (
            ${activityIds.previousDay}, 'commit', '2026-08-27T08:00:00.000Z',
            '2026-08-28T13:00:00.000Z', '101', 1, ${shas.previousDay}
          ),
          (
            ${activityIds.mergeCommit}, 'commit',
            '2026-08-28T12:30:00.000Z', '2026-08-28T13:00:00.000Z', '101', 1,
            ${shas.mergeCommit}
          ),
          (
            ${activityIds.mergeOnlyDay}, 'commit',
            '2026-08-26T12:30:00.000Z', '2026-08-28T13:00:00.000Z', '101', 1,
            ${shas.mergeOnlyDay}
          ),
          (
            ${activityIds.summaryEligible}, 'commit',
            '2026-08-28T08:30:00.000Z', null, '101', 1,
            ${shas.summaryEligible}
          )
      `;

        await transaction`
        insert into github_public_activities (
          public_id, alias_evidence, alias_reason, canonical_public_id,
          hidden_at, kind, occurred_at, published_at, repository_id, revision,
          source_node_id
        ) values (
          ${activityIds.alias}, '{"samePatch":true}'::jsonb, 'exact_rebase',
          ${activityIds.canonical}, '2026-08-28T13:00:00.000Z', 'commit',
          '2026-08-28T10:30:00.000Z', '2026-08-28T13:00:00.000Z', '202', 1,
          ${shas.alias}
        )
      `;

        await transaction`
        insert into github_summary_attempts (
          activity_public_id, completed_at, revision, state, summary_headline,
          summary_short
        ) values
          (
            ${activityIds.canonical}, '2026-08-28T13:00:00.000Z', 1,
            'complete', 'Canonical headline', 'Canonical detailed summary'
          ),
          (
            ${activityIds.direct}, '2026-08-28T13:00:00.000Z', 1,
            'complete', 'Direct headline', 'Direct detailed summary'
          ),
          (
            ${activityIds.previousDay}, '2026-08-28T13:00:00.000Z', 1,
            'complete', 'Previous-day headline', 'Previous-day summary'
          ),
          (
            ${activityIds.mergeOnlyDay}, '2026-08-28T13:00:00.000Z', 1,
            'complete', 'Octopus merge headline', 'Octopus merge summary'
          )
      `;
      });

      const firstPage = await readPublicGitHubActivityPage(null, 1);
      expect(firstPage.days).toHaveLength(1);
      expect(firstPage.days[0]?.day).toBe("2026-08-28");
      expect(firstPage.days[0]?.totals).toEqual({
        additions: 12,
        deletions: 3,
        issuesOpened: 1,
        pullRequestsMerged: 1,
        repositories: 2,
      });
      expect(firstPage.nextCursor).not.toBeNull();

      const grouped = firstPage.days[0]?.items.find(
        (item) => item.kind === "pull-request-commits"
      );
      expect(grouped?.title).toBe("Current reconciled title");
      expect(grouped?.commits.map((commit) => commit.id)).toEqual([
        activityIds.canonical,
        activityIds.direct,
      ]);
      expect(firstPage.days[0]?.items.map((item) => item.kind)).toEqual([
        "issue-opened",
        "pull-request-merged",
        "pull-request-commits",
      ]);
      expect(
        firstPage.days[0]?.items.some(
          (item) => item.id === activityIds.mergeCommit
        )
      ).toBe(false);
      expect(
        await ensureGitHubSummaryAttempt(
          activityIds.mergeCommit,
          new Date("2026-08-28T13:30:00.000Z")
        )
      ).toBe(false);
      expect(
        await ensureGitHubSummaryAttempt(
          activityIds.summaryEligible,
          new Date("2026-08-28T13:30:30.000Z")
        )
      ).toBe(true);
      expect(
        await ensureMissingGitHubSummaryAttempts(
          50,
          new Date("2026-08-28T13:31:00.000Z")
        )
      ).toBe(0);
      await admin`
        insert into github_summary_attempts (
          activity_public_id, revision, state
        ) values (${activityIds.mergeCommit}, 1, 'pending')
      `;
      const summaryClaims = await claimGitHubSummaryAttempts(
        8,
        ["f0rr0", "yuppiestechdev"],
        new Date("2026-08-28T13:32:00.000Z")
      );
      expect(
        summaryClaims.map(({ activityPublicId }) => activityPublicId)
      ).toEqual([activityIds.summaryEligible]);
      const claimedSummaries = await admin`
        select activity_public_id, state
        from github_summary_attempts
        where activity_public_id in (
          ${activityIds.mergeCommit}, ${activityIds.summaryEligible}
        )
        order by activity_public_id
      `;
      expect(claimedSummaries).toEqual([
        {
          activity_public_id: activityIds.mergeCommit,
          state: "pending",
        },
        {
          activity_public_id: activityIds.summaryEligible,
          state: "processing",
        },
      ]);
      const mergeLeaseToken = "20000000-0000-4000-8000-000000000018";
      await admin`
        update github_public_activities
        set published_at = null
        where public_id = ${activityIds.mergeCommit}
      `;
      await admin`
        update github_summary_attempts
        set attempted_at = '2026-08-28T13:32:30.000Z',
          lease_token = ${mergeLeaseToken},
          lease_until = '2026-08-28T13:37:30.000Z', state = 'processing'
        where activity_public_id = ${activityIds.mergeCommit} and revision = 1
      `;
      expect(
        await completeGitHubSummaryAttempt(
          {
            activityPublicId: activityIds.mergeCommit,
            author: "f0rr0",
            committedAt: "2026-08-28T12:30:00.000Z",
            leaseToken: mergeLeaseToken,
            message: "Merge branch next into feature",
            repository: "f0rr0/source",
            repositoryId: "101",
            revision: 1,
            sha: shas.mergeCommit,
          },
          {
            headline: "A stale merge summary",
            inputHash: "b".repeat(64),
            model: "test-model",
            recipe: "test-recipe",
            short: "This pre-existing in-flight result must not be published.",
          },
          new Date("2026-08-28T13:33:00.000Z")
        )
      ).toBe(true);
      const [completedMerge] = await admin`
        select github_public_activities.published_at,
          github_summary_attempts.state
        from github_public_activities
        join github_summary_attempts
          on github_summary_attempts.activity_public_id = github_public_activities.public_id
        where github_public_activities.public_id = ${activityIds.mergeCommit}
      `;
      expect(completedMerge).toEqual({ published_at: null, state: "complete" });
      await admin`
        update github_commits
        set canonicalized_at = null, pr_discovery_state = 'complete'
        where repository_id = '101' and sha = ${shas.mergeCommit}
      `;
      expect(
        await canonicalizeGitHubCommitActivity(
          "101",
          shas.mergeCommit,
          new Date("2026-08-28T13:34:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 0,
        publicId: activityIds.mergeCommit,
      });
      const [canonicalizedMerge] = await admin`
        select github_commits.canonicalized_at,
          github_public_activities.published_at
        from github_commits
        join github_public_activities
          on github_public_activities.public_id = github_commits.activity_public_id
        where github_commits.repository_id = '101'
          and github_commits.sha = ${shas.mergeCommit}
      `;
      expect(canonicalizedMerge.canonicalized_at).not.toBeNull();
      expect(canonicalizedMerge.published_at).toBeNull();

      const snapshot = new Date(firstPage.snapshotAt);
      const postSnapshotPublishedAt = new Date(snapshot.getTime() + 1000);
      const postSnapshotPublishedAtIso = postSnapshotPublishedAt.toISOString();
      await admin.begin(async (transaction) => {
        await transaction`
        insert into github_commits (
          activity_public_id, additions, author_login, committed_at,
          committer_at, changed_files, deletions, enrichment_state, languages,
          message, parent_shas, repository, repository_id, sha, substantive_loc
        ) values (
          ${activityIds.postSnapshot}, 99, 'f0rr0',
          '2026-08-26T08:00:00.000Z', '2026-08-26T08:00:00.000Z', 1, 99,
          'complete', '[]'::jsonb, 'Published after the snapshot',
          ${JSON.stringify(["8".repeat(40)])}::jsonb, 'f0rr0/source', '101',
          ${shas.postSnapshot}, 198
        )
      `;
        await transaction`
        insert into github_public_activities (
          public_id, kind, occurred_at, published_at, repository_id, revision,
          source_node_id
        ) values (
          ${activityIds.postSnapshot}, 'commit', '2026-08-26T08:00:00.000Z',
          ${postSnapshotPublishedAtIso}, '101', 1, ${shas.postSnapshot}
        )
      `;
        await transaction`
        insert into github_summary_attempts (
          activity_public_id, completed_at, revision, state, summary_headline,
          summary_short
        ) values (
          ${activityIds.postSnapshot}, ${postSnapshotPublishedAtIso}, 1,
          'complete', 'Post-snapshot headline', 'Post-snapshot summary'
        )
      `;
      });

      const { decodeGitHubActivityCursor } =
        await import("../src/lib/github-activity-cursor.ts");
      const cursor = decodeGitHubActivityCursor(firstPage.nextCursor);
      expect(cursor).not.toBeNull();
      const secondPage = await readPublicGitHubActivityPage(cursor, 1);
      expect(secondPage.snapshotAt).toBe(firstPage.snapshotAt);
      expect(secondPage.days.map((day) => day.day)).toEqual(["2026-08-27"]);
      expect(secondPage.days[0]?.items).toHaveLength(1);
      expect(secondPage.days[0]?.totals).toEqual({
        additions: 3,
        deletions: 1,
        issuesOpened: 0,
        pullRequestsMerged: 0,
        repositories: 1,
      });
      expect(secondPage.nextCursor).toBeNull();

      const milestoneLease = new Date("2026-08-28T16:00:00.000Z");
      await admin`
        update github_pull_requests
        set next_reconcile_at = ${milestoneLease.toISOString()}
        where node_id = 'PR_current'
      `;
      const upstreamRepository = {
        fullName: "example-org/upstream",
        htmlUrl: "https://github.com/example-org/upstream",
        id: "202",
        ownerAvatarUrl: "https://avatars.githubusercontent.com/u/202",
        ownerId: "202",
        ownerLogin: "example-org",
        ownerType: "Organization",
        visibility: "public",
      };
      const trackedMergedPullRequest = {
        action: "reconciled",
        additions: 12,
        author: "f0rr0",
        authorAccount: "f0rr0",
        authorUserId: "101",
        baseRef: "main",
        baseRepository: upstreamRepository,
        baseSha: "1".repeat(40),
        body: null,
        changedFiles: 2,
        closedAt: "2026-08-28T11:00:00.000Z",
        commitCount: 2,
        createdAt: "2026-08-20T08:00:00.000Z",
        draft: false,
        deletions: 3,
        headRef: "feature",
        headRepository: upstreamRepository,
        headSha: shas.direct,
        id: "12",
        mergeCommitSha: "f".repeat(40),
        merged: true,
        mergedAt: "2026-08-28T11:00:00.000Z",
        nodeId: "PR_current",
        number: 12,
        providerUpdatedAt: "2026-08-28T11:00:00.000Z",
        repository: upstreamRepository,
        state: "closed",
        title: "Current reconciled title",
        url: "https://github.com/example-org/upstream/pull/12",
      };
      expect(
        await completeGitHubPullRequestReconciliation(
          {
            account: "f0rr0",
            lastReconciledAt: null,
            leaseUntil: milestoneLease,
            membershipComplete: true,
            nodeId: "PR_current",
            number: 12,
            repository: "example-org/upstream",
            repositoryId: "202",
            versionObservedAt: new Date("2026-08-28T11:00:00.000Z"),
          },
          trackedMergedPullRequest,
          new Date("2026-08-28T17:00:00.000Z")
        )
      ).toBe(true);
      const [unchangedMilestone] = await admin`
        select published_at
        from github_public_activities
        where kind = 'pull_request' and source_node_id = 'PR_current'
      `;
      expect(new Date(unchangedMilestone.published_at).toISOString()).toBe(
        "2026-08-28T13:00:00.000Z"
      );

      await admin`
        insert into github_pull_requests (
          account, author_login, author_user_id, created_at, node_id, number,
          provider_updated_at, repository_id, state, title, title_snapshot, url
        ) values (
          'f0rr0', 'somebody-else', '999', '2026-08-28T12:00:00.000Z',
          'PR_foreign_known', 77, '2026-08-28T12:00:00.000Z', '202', 'open',
          'Foreign open title', 'Foreign open title',
          'https://github.com/example-org/upstream/pull/77'
        )
      `;
      const foreignMergedPullRequest = {
        ...trackedMergedPullRequest,
        author: "somebody-else",
        authorAccount: null,
        authorUserId: "999",
        createdAt: "2026-08-28T12:00:00.000Z",
        id: "77",
        nodeId: "PR_foreign_known",
        number: 77,
        providerUpdatedAt: "2026-08-28T18:00:00.000Z",
        title: "Foreign merged title",
        url: "https://github.com/example-org/upstream/pull/77",
      };
      const intake = await persistAccountIntake({
        account: "f0rr0",
        events: [
          {
            id: "900000001",
            issue: null,
            occurredAt: "2026-08-28T18:00:00.000Z",
            pullRequest: foreignMergedPullRequest,
            push: null,
          },
          {
            id: "900000002",
            issue: null,
            occurredAt: "2026-08-28T18:00:01.000Z",
            pullRequest: {
              ...foreignMergedPullRequest,
              id: "78",
              nodeId: "PR_foreign_unknown",
              number: 78,
              url: "https://github.com/example-org/upstream/pull/78",
            },
            push: null,
          },
        ],
        expectedCheckpoint: null,
        gap: null,
        latestEventId: "900000002",
      });
      expect(intake.pullRequests).toBe(1);
      const knownForeign = await admin`
        select state, title
        from github_pull_requests
        where node_id = 'PR_foreign_known'
      `;
      expect(knownForeign).toEqual([
        { state: "merged", title: "Foreign merged title" },
      ]);
      const unknownForeign = await admin`
        select node_id
        from github_pull_requests
        where node_id = 'PR_foreign_unknown'
      `;
      expect(unknownForeign).toHaveLength(0);

      await admin`
        insert into github_pull_requests (
          account, author_login, author_user_id, created_at, node_id, number,
          provider_updated_at, repository_id, state, title, title_snapshot, url
        ) values (
          'f0rr0', 'f0rr0', '101', '2025-01-01T00:00:00.000Z',
          'PR_old_equal_terminal', 79, '2026-08-28T19:00:00.000Z', '202',
          'open', 'Old open title', 'Old open title',
          'https://github.com/example-org/upstream/pull/79'
        )
      `;
      const oldEqualTimeMerge = {
        ...trackedMergedPullRequest,
        closedAt: "2026-08-28T19:00:00.000Z",
        createdAt: "2025-01-01T00:00:00.000Z",
        id: "79",
        mergedAt: "2026-08-28T19:00:00.000Z",
        nodeId: "PR_old_equal_terminal",
        number: 79,
        providerUpdatedAt: "2026-08-28T19:00:00.000Z",
        title: "Old merged title",
        url: "https://github.com/example-org/upstream/pull/79",
      };
      const terminalIntake = await persistAccountIntake({
        account: "f0rr0",
        events: [
          {
            id: "900000003",
            issue: null,
            occurredAt: "2026-08-28T19:00:00.000Z",
            pullRequest: oldEqualTimeMerge,
            push: null,
          },
        ],
        expectedCheckpoint: {
          latestEventId: "900000002",
          paused: false,
        },
        gap: null,
        latestEventId: "900000003",
      });
      expect(terminalIntake.pullRequests).toBe(1);
      const claimNow = new Date(Date.now() + 60_000);
      const claimed = await claimDueGitHubPullRequests(
        "f0rr0",
        30,
        25,
        claimNow
      );
      const oldTerminalClaim = claimed.find(
        ({ nodeId }) => nodeId === "PR_old_equal_terminal"
      );
      expect(oldTerminalClaim).toBeDefined();
      expect(
        await completeGitHubPullRequestReconciliation(
          oldTerminalClaim,
          oldEqualTimeMerge,
          new Date(claimNow.getTime() + 1000)
        )
      ).toBe(true);
      const [finalizedOldPullRequest] = await admin`
        select next_reconcile_at, state
        from github_pull_requests
        where node_id = 'PR_old_equal_terminal'
      `;
      expect(finalizedOldPullRequest).toEqual({
        next_reconcile_at: null,
        state: "merged",
      });

      await admin`
        insert into github_pull_requests (
          account, author_login, author_user_id, created_at, node_id, number,
          provider_updated_at, repository_id, state, title, title_snapshot, url
        ) values
          (
            'f0rr0', 'somebody-else', '999', '2025-01-01T00:00:00.000Z',
            'PR_sparse_terminal', 80, '2026-08-28T20:00:00.000Z', '202',
            'open', 'Immutable sparse-event title', 'Immutable sparse-event title',
            'https://github.com/example-org/upstream/pull/80'
          ),
          (
            'f0rr0', 'somebody-else', '999', '2025-01-01T00:00:00.000Z',
            'PR_sparse_stale', 82, '2026-08-28T22:00:00.000Z', '202',
            'open', 'Newer open title', 'Newer open title',
            'https://github.com/example-org/upstream/pull/82'
          )
      `;
      const sparseTerminalSignal = {
        action: "merged",
        number: 80,
        repository: {
          fullName: "example-org/upstream",
          id: "202",
        },
      };
      const crossAccount = await persistAccountIntake({
        account: "yuppiestechdev",
        events: [
          {
            id: "900000004",
            issue: null,
            occurredAt: "2026-08-28T21:00:00.000Z",
            pullRequest: null,
            pullRequestSignal: sparseTerminalSignal,
            push: null,
          },
        ],
        expectedCheckpoint: null,
        gap: null,
        latestEventId: "900000004",
      });
      expect(crossAccount.pullRequests).toBe(0);
      const [unchangedAcrossAccounts] = await admin`
        select next_reconcile_at, state
        from github_pull_requests
        where node_id = 'PR_sparse_terminal'
      `;
      expect(unchangedAcrossAccounts).toEqual({
        next_reconcile_at: null,
        state: "open",
      });

      const sparseIntake = await persistAccountIntake({
        account: "f0rr0",
        events: [
          {
            id: "900000005",
            issue: null,
            occurredAt: "2026-08-28T21:00:00.000Z",
            pullRequest: null,
            pullRequestSignal: sparseTerminalSignal,
            push: null,
          },
          {
            id: "900000006",
            issue: null,
            occurredAt: "2026-08-28T21:00:01.000Z",
            pullRequest: null,
            pullRequestSignal: {
              ...sparseTerminalSignal,
              number: 81,
            },
            push: null,
          },
          {
            id: "900000007",
            issue: null,
            occurredAt: "2026-08-28T21:00:00.000Z",
            pullRequest: null,
            pullRequestSignal: {
              ...sparseTerminalSignal,
              number: 82,
            },
            push: null,
          },
        ],
        expectedCheckpoint: {
          latestEventId: "900000003",
          paused: false,
        },
        gap: null,
        latestEventId: "900000007",
      });
      expect(sparseIntake.pullRequests).toBe(1);
      const [provisionalTerminal] = await admin`
        select closed_at, provider_updated_at, state, terminal_at, title
        from github_pull_requests
        where node_id = 'PR_sparse_terminal'
      `;
      expect({
        ...provisionalTerminal,
        closed_at: new Date(provisionalTerminal.closed_at).toISOString(),
        provider_updated_at: new Date(
          provisionalTerminal.provider_updated_at
        ).toISOString(),
        terminal_at: new Date(provisionalTerminal.terminal_at).toISOString(),
      }).toEqual({
        closed_at: "2026-08-28T21:00:00.000Z",
        provider_updated_at: "2026-08-28T20:00:00.000Z",
        state: "closed",
        terminal_at: "2026-08-28T21:00:00.000Z",
        title: "Immutable sparse-event title",
      });
      const [staleTerminal] = await admin`
        select next_reconcile_at, state, terminal_at
        from github_pull_requests
        where node_id = 'PR_sparse_stale'
      `;
      expect(staleTerminal).toEqual({
        next_reconcile_at: null,
        state: "open",
        terminal_at: null,
      });
      expect(
        await admin`
          select node_id
          from github_pull_requests
          where repository_id = '202' and number = 81
        `
      ).toHaveLength(0);
      expect(
        await admin`
          select public_id
          from github_public_activities
          where kind = 'pull_request' and source_node_id = 'PR_sparse_terminal'
        `
      ).toHaveLength(0);

      const sparseClaims = await claimDueGitHubPullRequests(
        "f0rr0",
        1,
        25,
        new Date(Date.now() + 60_000)
      );
      expect(
        sparseClaims.some(({ nodeId }) => nodeId === "PR_sparse_terminal")
      ).toBe(true);
      expect(
        sparseClaims.some(({ nodeId }) => nodeId === "PR_sparse_stale")
      ).toBe(false);

      const summaryActivityId = "00000000-0000-4000-8000-000000000008";
      const summaryLeaseToken = "20000000-0000-4000-8000-000000000008";
      const summarySha = "9".repeat(40);
      await admin`
        insert into github_commits (
          activity_public_id, author_login, canonicalized_at, committed_at,
          committer_at, enrichment_state, languages, message, parent_shas,
          repository, repository_id, sha
        ) values (
          ${summaryActivityId}, 'f0rr0', '2026-08-28T21:30:00.000Z',
          '2026-08-28T21:00:00.000Z', '2026-08-28T21:00:00.000Z',
          'complete', '[]'::jsonb, 'Publish typed timestamp',
          ${JSON.stringify(["9".repeat(40)])}::jsonb, 'f0rr0/source', '101',
          ${summarySha}
        )
      `;
      await admin`
        insert into github_public_activities (
          public_id, kind, occurred_at, repository_id, revision, source_node_id
        ) values (
          ${summaryActivityId}, 'commit', '2026-08-28T21:00:00.000Z', '101',
          1, ${summarySha}
        )
      `;
      await admin`
        insert into github_summary_attempts (
          activity_public_id, attempted_at, lease_token, lease_until, revision,
          state
        ) values (
          ${summaryActivityId}, '2026-08-28T21:31:00.000Z',
          ${summaryLeaseToken}, '2026-08-28T21:36:00.000Z', 1, 'processing'
        )
      `;
      const summaryPublishedAt = new Date("2026-08-28T21:32:00.000Z");
      expect(
        await completeGitHubSummaryAttempt(
          {
            activityPublicId: summaryActivityId,
            author: "f0rr0",
            committedAt: "2026-08-28T21:00:00.000Z",
            leaseToken: summaryLeaseToken,
            message: "Publish typed timestamp",
            repository: "f0rr0/source",
            repositoryId: "101",
            revision: 1,
            sha: summarySha,
          },
          {
            headline: "Typed publication succeeds",
            inputHash: "a".repeat(64),
            model: "test-model",
            recipe: "test-recipe",
            short: "The completed summary is published exactly once.",
          },
          summaryPublishedAt
        )
      ).toBe(true);
      const [publishedSummary] = await admin`
        select published_at, state
        from github_public_activities
        join github_summary_attempts
          on github_summary_attempts.activity_public_id = github_public_activities.public_id
        where github_public_activities.public_id = ${summaryActivityId}
      `;
      expect({
        published_at: new Date(publishedSummary.published_at).toISOString(),
        state: publishedSummary.state,
      }).toEqual({
        published_at: summaryPublishedAt.toISOString(),
        state: "complete",
      });

      const exactCopyIds = {
        controlCandidate: "00000000-0000-4000-8000-000000000014",
        controlSource: "00000000-0000-4000-8000-000000000013",
        headlineCandidate: "00000000-0000-4000-8000-000000000017",
        headlineSource: "00000000-0000-4000-8000-000000000016",
        merge: "00000000-0000-4000-8000-000000000012",
        mergeParent: "00000000-0000-4000-8000-000000000011",
        mergeRoot: "00000000-0000-4000-8000-000000000015",
        rebased: "00000000-0000-4000-8000-000000000010",
        rebasedAlias: "00000000-0000-4000-8000-000000000021",
        rebasedAliasAncestor: "00000000-0000-4000-8000-000000000022",
        rebasedSource: "00000000-0000-4000-8000-000000000009",
      };
      const exactCopyShas = {
        controlCandidate: `${"6".repeat(39)}a`,
        controlSource: `${"5".repeat(39)}a`,
        headlineCandidate: `${"1".repeat(39)}b`,
        headlineSource: `${"f".repeat(39)}b`,
        merge: `${"4".repeat(39)}a`,
        mergeParent: `${"3".repeat(39)}a`,
        mergeRoot: `${"7".repeat(39)}a`,
        rebased: `${"2".repeat(39)}a`,
        // Intentionally sorts after the rebased SHA: committer time, not SHA,
        // must select the original when both were observed at the same time.
        rebasedSource: `${"e".repeat(39)}a`,
      };
      await admin`
        insert into github_repositories (
          id, full_name, html_url, owner_avatar_url, owner_id, owner_login,
          owner_type, visibility
        ) values (
          '303', 'f0rr0/exact-copies', 'https://github.com/f0rr0/exact-copies',
          'https://avatars.githubusercontent.com/u/101', '101', 'f0rr0',
          'User', 'public'
        )
      `;
      await admin`
        insert into github_public_activities (
          public_id, kind, occurred_at, repository_id, revision, source_node_id
        ) values
          (
            ${exactCopyIds.rebasedSource}, 'commit',
            '2026-08-28T10:00:00.000Z', '303', 1,
            ${exactCopyShas.rebasedSource}
          ),
          (
            ${exactCopyIds.rebased}, 'commit', '2026-08-28T12:00:00.000Z',
            '303', 1, ${exactCopyShas.rebased}
          ),
          (
            ${exactCopyIds.rebasedAlias}, 'commit',
            '2026-08-28T11:00:00.000Z', '303', 1,
            ${`${"8".repeat(39)}b`}
          ),
          (
            ${exactCopyIds.rebasedAliasAncestor}, 'commit',
            '2026-08-28T11:30:00.000Z', '303', 1,
            ${`${"9".repeat(39)}b`}
          ),
          (
            ${exactCopyIds.mergeRoot}, 'commit',
            '2026-08-28T10:15:00.000Z', '303', 1,
            ${exactCopyShas.mergeRoot}
          ),
          (
            ${exactCopyIds.mergeParent}, 'commit',
            '2026-08-28T10:30:00.000Z', '303', 1,
            ${exactCopyShas.mergeParent}
          ),
          (
            ${exactCopyIds.merge}, 'commit', '2026-08-28T13:00:00.000Z',
            '303', 1, ${exactCopyShas.merge}
          ),
          (
            ${exactCopyIds.controlSource}, 'commit',
            '2026-08-28T09:00:00.000Z', '303', 1,
            ${exactCopyShas.controlSource}
          ),
          (
            ${exactCopyIds.controlCandidate}, 'commit',
            '2026-08-28T15:00:00.000Z', '303', 1,
            ${exactCopyShas.controlCandidate}
          ),
          (
            ${exactCopyIds.headlineSource}, 'commit',
            '2026-08-28T09:30:00.000Z', '303', 1,
            ${exactCopyShas.headlineSource}
          ),
          (
            ${exactCopyIds.headlineCandidate}, 'commit',
            '2026-08-28T10:30:00.000Z', '303', 1,
            ${exactCopyShas.headlineCandidate}
          )
      `;
      await admin`
        insert into github_commits (
          activity_public_id, author_login, authored_at, author_user_id,
          change_fingerprint, committed_at, committer_at, enrichment_state,
          fingerprint_complete, first_observed_at, full_message, message,
          parent_shas, pr_discovery_state, repository, repository_id,
          sha
        ) values
          (
            ${exactCopyIds.rebasedSource}, 'f0rr0',
            '2026-08-28T08:00:00.000Z', '101', ${"a".repeat(64)},
            '2026-08-28T10:00:00.000Z', '2026-08-28T10:00:00.000Z',
            'complete', true, '2026-08-28T14:00:00.000Z',
            'Preserve exact authored metadata', 'Preserve exact authored metadata',
            ${JSON.stringify(["7".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.rebasedSource}
          ),
          (
            ${exactCopyIds.rebased}, 'f0rr0', '2026-08-28T08:00:00.000Z',
            '101', ${"9".repeat(64)}, '2026-08-28T12:00:00.000Z',
            '2026-08-28T12:00:00.000Z', 'complete', true,
            '2026-08-28T14:00:00.000Z', 'Preserve exact authored metadata',
            'Preserve exact authored metadata',
            ${JSON.stringify(["8".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.rebased}
          ),
          (
            ${exactCopyIds.mergeRoot}, 'f0rr0',
            '2026-08-28T08:30:00.000Z', '101', ${"b".repeat(64)},
            '2026-08-28T10:15:00.000Z', '2026-08-28T10:15:00.000Z',
            'complete', true, '2026-08-28T14:00:00.000Z',
            'Original canonical feature', 'Original canonical feature',
            ${JSON.stringify(["d".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.mergeRoot}
          ),
          (
            ${exactCopyIds.mergeParent}, 'f0rr0',
            '2026-08-28T09:00:00.000Z', '101', ${"b".repeat(64)},
            '2026-08-28T10:30:00.000Z', '2026-08-28T10:30:00.000Z',
            'complete', true, '2026-08-28T14:30:00.000Z',
            'Implement the feature', 'Implement the feature',
            ${JSON.stringify(["9".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.mergeParent}
          ),
          (
            ${exactCopyIds.merge}, 'f0rr0', '2026-08-28T13:00:00.000Z',
            '101', ${"b".repeat(64)}, '2026-08-28T13:00:00.000Z',
            '2026-08-28T13:00:00.000Z', 'complete', true,
            '2026-08-28T14:30:00.000Z', 'Merge the feature',
            'Merge the feature',
            ${JSON.stringify([
              "a".repeat(40),
              exactCopyShas.mergeParent,
            ])}::jsonb,
            'complete', 'f0rr0/exact-copies', '303', ${exactCopyShas.merge}
          ),
          (
            ${exactCopyIds.controlSource}, 'f0rr0',
            '2026-08-28T07:00:00.000Z', '101', ${"c".repeat(64)},
            '2026-08-28T09:00:00.000Z', '2026-08-28T09:00:00.000Z',
            'complete', true, '2026-08-28T15:30:00.000Z',
            'First intentional edit', 'First intentional edit',
            ${JSON.stringify(["b".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.controlSource}
          ),
          (
            ${exactCopyIds.controlCandidate}, 'f0rr0',
            '2026-08-28T07:00:00.000Z', '101', ${"c".repeat(64)},
            '2026-08-28T15:00:00.000Z', '2026-08-28T15:00:00.000Z',
            'complete', true, '2026-08-28T15:30:00.000Z',
            'Second intentional edit', 'Second intentional edit',
            ${JSON.stringify(["c".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.controlCandidate}
          ),
          (
            ${exactCopyIds.headlineSource}, 'f0rr0',
            '2026-08-28T07:30:00.000Z', '101', ${"d".repeat(64)},
            '2026-08-28T09:30:00.000Z', '2026-08-28T09:30:00.000Z',
            'complete', true, '2026-08-28T15:30:00.000Z',
            'Ship the squash-safe feature', 'Ship the squash-safe feature',
            ${JSON.stringify(["4".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.headlineSource}
          ),
          (
            ${exactCopyIds.headlineCandidate}, 'f0rr0',
            '2026-08-28T10:30:00.000Z', '101', ${"d".repeat(64)},
            '2026-08-28T10:30:00.000Z', '2026-08-28T10:30:00.000Z',
            'complete', true, '2026-08-28T15:30:00.000Z',
            'Ship the squash-safe feature (#123)\n\nReviewed squash body',
            'Ship the squash-safe feature (#123)',
            ${JSON.stringify(["2".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${exactCopyShas.headlineCandidate}
          )
      `;
      await admin`
        update github_commits
        set canonicalized_at = '2026-08-28T15:40:00.000Z'
        where activity_public_id in (
          ${exactCopyIds.rebasedSource}, ${exactCopyIds.rebased}
        )
      `;
      await admin`
        update github_public_activities
        set
          alias_evidence = '{"preexistingAlias":true}'::jsonb,
          alias_reason = 'same_authored_exact_copy',
          canonical_public_id = ${exactCopyIds.rebasedSource},
          hidden_at = '2026-08-28T15:41:00.000Z'
        where public_id = ${exactCopyIds.rebasedAlias}
      `;
      await admin`
        update github_public_activities
        set
          alias_evidence = '{"preexistingAlias":true}'::jsonb,
          alias_reason = 'same_authored_exact_copy',
          canonical_public_id = ${exactCopyIds.rebasedAlias},
          hidden_at = '2026-08-28T15:42:00.000Z'
        where public_id = ${exactCopyIds.rebasedAliasAncestor}
      `;
      await admin`
        insert into github_summary_attempts (
          activity_public_id, revision, state
        ) values (${exactCopyIds.rebasedSource}, 1, 'pending')
      `;
      await admin`
        update github_public_activities
        set
          alias_evidence = '{"preexistingAlias":true}'::jsonb,
          alias_reason = 'same_authored_exact_copy',
          canonical_public_id = ${exactCopyIds.mergeRoot},
          hidden_at = '2026-08-28T15:45:00.000Z'
        where public_id = ${exactCopyIds.mergeParent}
      `;

      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          exactCopyShas.rebased,
          new Date("2026-08-28T16:00:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 1,
        publicId: exactCopyIds.rebased,
      });
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          exactCopyShas.merge,
          new Date("2026-08-28T16:01:00.000Z")
        )
      ).toEqual({
        aliased: true,
        aliases: 1,
        publicId: exactCopyIds.merge,
      });
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          exactCopyShas.headlineCandidate,
          new Date("2026-08-28T16:01:30.000Z")
        )
      ).toEqual({
        aliased: true,
        aliases: 1,
        publicId: exactCopyIds.headlineCandidate,
      });
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          exactCopyShas.controlCandidate,
          new Date("2026-08-28T16:02:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 0,
        publicId: exactCopyIds.controlCandidate,
      });

      const exactCopyAliases = await admin`
        select alias_evidence, alias_reason, canonical_public_id, public_id
        from github_public_activities
        where public_id in (
          ${exactCopyIds.rebasedSource}, ${exactCopyIds.rebased},
          ${exactCopyIds.merge},
          ${exactCopyIds.controlCandidate}, ${exactCopyIds.headlineCandidate}
        )
        order by public_id
      `;
      expect(exactCopyAliases).toEqual([
        {
          alias_evidence: {
            authoredAt: "2026-08-28T08:00:00.000Z",
            authorUserId: "101",
            canonicalCommitterAt: "2026-08-28T12:00:00.000Z",
            sourceSha: exactCopyShas.rebased,
          },
          alias_reason: "same_authored_rewrite",
          canonical_public_id: exactCopyIds.rebased,
          public_id: exactCopyIds.rebasedSource,
        },
        {
          alias_evidence: null,
          alias_reason: null,
          canonical_public_id: null,
          public_id: exactCopyIds.rebased,
        },
        {
          alias_evidence: {
            authoredAt: null,
            directMergeParent: true,
            fingerprint: "b".repeat(64),
            fingerprintComplete: true,
            headline: null,
            pullRequestNodeId: null,
            sourceSha: exactCopyShas.mergeParent,
          },
          alias_reason: "direct_parent_merge",
          canonical_public_id: exactCopyIds.mergeRoot,
          public_id: exactCopyIds.merge,
        },
        {
          alias_evidence: null,
          alias_reason: null,
          canonical_public_id: null,
          public_id: exactCopyIds.controlCandidate,
        },
        {
          alias_evidence: {
            authoredAt: null,
            directMergeParent: false,
            fingerprint: "d".repeat(64),
            fingerprintComplete: true,
            headline: "Ship the squash-safe feature",
            pullRequestNodeId: null,
            sourceSha: exactCopyShas.headlineSource,
          },
          alias_reason: "same_author_headline_exact_copy",
          canonical_public_id: exactCopyIds.headlineSource,
          public_id: exactCopyIds.headlineCandidate,
        },
      ]);

      const retargetedRewriteAliases = await admin`
        select alias_evidence, canonical_public_id, public_id
        from github_public_activities
        where public_id in (
          ${exactCopyIds.rebasedAlias},
          ${exactCopyIds.rebasedAliasAncestor}
        )
        order by public_id
      `;
      expect(retargetedRewriteAliases).toEqual([
        {
          alias_evidence: {
            canonicalRetargetedFrom: exactCopyIds.rebasedSource,
            canonicalRetargetReason: "same_authored_rewrite",
            preexistingAlias: true,
          },
          canonical_public_id: exactCopyIds.rebased,
          public_id: exactCopyIds.rebasedAlias,
        },
        {
          alias_evidence: {
            canonicalRetargetedFrom: exactCopyIds.rebasedAlias,
            canonicalRetargetReason: "same_authored_rewrite",
            preexistingAlias: true,
          },
          canonical_public_id: exactCopyIds.rebased,
          public_id: exactCopyIds.rebasedAliasAncestor,
        },
      ]);
      const [supersededSummaryAttempt] = await admin`
        select error_code, state
        from github_summary_attempts
        where activity_public_id = ${exactCopyIds.rebasedSource}
          and revision = 1
      `;
      expect(supersededSummaryAttempt).toEqual({
        error_code: "canonical_alias",
        state: "indeterminate",
      });

      await admin`
        update github_public_activities
        set alias_evidence = null, alias_reason = null,
          canonical_public_id = null, hidden_at = null
        where public_id = ${exactCopyIds.merge}
      `;
      await admin`
        update github_public_activities
        set alias_evidence = '{"preexistingInvalidTarget":true}'::jsonb,
          alias_reason = 'same_authored_exact_copy',
          canonical_public_id = ${exactCopyIds.merge},
          hidden_at = '2026-08-28T16:03:00.000Z'
        where public_id = ${exactCopyIds.controlSource}
      `;
      await admin`
        update github_commits
        set canonicalized_at = null, full_message = 'First intentional edit',
          message = 'First intentional edit'
        where activity_public_id = ${exactCopyIds.controlCandidate}
      `;
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          exactCopyShas.controlCandidate,
          new Date("2026-08-28T16:04:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 0,
        publicId: exactCopyIds.controlCandidate,
      });
      const [candidateProtectedFromMergeAlias] = await admin`
        select canonical_public_id, hidden_at
        from github_public_activities
        where public_id = ${exactCopyIds.controlCandidate}
      `;
      expect(candidateProtectedFromMergeAlias).toEqual({
        canonical_public_id: null,
        hidden_at: null,
      });

      const memberRewriteIds = {
        latest: "00000000-0000-4000-8000-000000000024",
        old: "00000000-0000-4000-8000-000000000023",
        version: "10000000-0000-4000-8000-000000000023",
      };
      const memberRewriteShas = {
        latest: `${"d".repeat(39)}b`,
        old: `${"c".repeat(39)}b`,
      };
      await admin`
        insert into github_public_activities (
          public_id, kind, occurred_at, repository_id, revision, source_node_id
        ) values
          (
            ${memberRewriteIds.old}, 'commit',
            '2026-08-28T17:00:00.000Z', '303', 1,
            ${memberRewriteShas.old}
          ),
          (
            ${memberRewriteIds.latest}, 'commit',
            '2026-08-28T18:00:00.000Z', '303', 1,
            ${memberRewriteShas.latest}
          )
      `;
      await admin`
        insert into github_commits (
          activity_public_id, author_login, authored_at, author_user_id,
          canonicalized_at, change_fingerprint, committed_at, committer_at,
          enrichment_state, fingerprint_complete, first_observed_at,
          full_message, message, parent_shas, pr_discovery_state, repository,
          repository_id, sha
        ) values
          (
            ${memberRewriteIds.old}, 'f0rr0',
            '2026-08-28T16:00:00.000Z', '101',
            '2026-08-28T18:30:00.000Z', ${"1".repeat(64)},
            '2026-08-28T17:00:00.000Z', '2026-08-28T17:00:00.000Z',
            'complete', true, '2026-08-28T18:30:00.000Z',
            'Keep a rebase-merge member canonical',
            'Keep a rebase-merge member canonical',
            ${JSON.stringify(["1".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${memberRewriteShas.old}
          ),
          (
            ${memberRewriteIds.latest}, 'f0rr0',
            '2026-08-28T16:00:00.000Z', '101', null, ${"2".repeat(64)},
            '2026-08-28T18:00:00.000Z', '2026-08-28T18:00:00.000Z',
            'complete', true, '2026-08-28T18:30:00.000Z',
            'Keep a rebase-merge member canonical',
            'Keep a rebase-merge member canonical',
            ${JSON.stringify(["2".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${memberRewriteShas.latest}
          )
      `;
      await admin`
        insert into github_pull_requests (
          account, author_login, author_user_id, created_at, merged_at,
          merge_sha, node_id, number, provider_updated_at, repository_id,
          state, terminal_at, title, title_snapshot, url
        ) values (
          'f0rr0', 'f0rr0', '101', '2026-08-28T16:00:00.000Z',
          '2026-08-28T18:00:00.000Z', ${memberRewriteShas.latest},
          'PR_rebase_member', 99, '2026-08-28T18:00:00.000Z', '303',
          'merged', '2026-08-28T18:00:00.000Z',
          'Keep a rebase-merge member canonical',
          'Keep a rebase-merge member canonical',
          'https://github.com/f0rr0/exact-copies/pull/99'
        )
      `;
      await admin`
        insert into github_pull_request_versions (
          base_sha, head_sha, id, is_current, membership_complete,
          merge_snapshot, provider_updated_at, pull_request_node_id
        ) values (
          ${"1".repeat(40)}, ${memberRewriteShas.latest},
          ${memberRewriteIds.version}, true, true, true,
          '2026-08-28T18:00:00.000Z', 'PR_rebase_member'
        )
      `;
      await admin`
        insert into github_pull_request_memberships (
          commit_repository_id, commit_sha, is_head, position, version_id
        ) values (
          '303', ${memberRewriteShas.latest}, true, 0,
          ${memberRewriteIds.version}
        )
      `;
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          memberRewriteShas.latest,
          new Date("2026-08-28T19:00:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 1,
        publicId: memberRewriteIds.latest,
      });
      const memberRewriteActivities = await admin`
        select alias_reason, canonical_public_id, public_id
        from github_public_activities
        where public_id in (
          ${memberRewriteIds.old}, ${memberRewriteIds.latest}
        )
        order by public_id
      `;
      expect(memberRewriteActivities).toEqual([
        {
          alias_reason: "same_authored_rewrite",
          canonical_public_id: memberRewriteIds.latest,
          public_id: memberRewriteIds.old,
        },
        {
          alias_reason: null,
          canonical_public_id: null,
          public_id: memberRewriteIds.latest,
        },
      ]);

      const evolvingRewriteIds = [
        "00000000-0000-4000-8000-000000000025",
        "00000000-0000-4000-8000-000000000026",
        "00000000-0000-4000-8000-000000000027",
      ];
      const evolvingRewriteShas = [
        `${"1".repeat(39)}c`,
        `${"2".repeat(39)}c`,
        `${"3".repeat(39)}c`,
      ];
      await admin`
        insert into github_public_activities (
          public_id, kind, occurred_at, published_at, repository_id, revision,
          source_node_id
        ) values
          (
            ${evolvingRewriteIds[0]}, 'commit',
            '2026-08-25T08:00:00.000Z', '2026-08-28T19:00:00.000Z',
            '303', 1, ${evolvingRewriteShas[0]}
          ),
          (
            ${evolvingRewriteIds[1]}, 'commit',
            '2026-08-25T09:00:00.000Z', '2026-08-28T19:00:00.000Z',
            '303', 1, ${evolvingRewriteShas[1]}
          ),
          (
            ${evolvingRewriteIds[2]}, 'commit',
            '2026-08-25T10:00:00.000Z', '2026-08-28T19:00:00.000Z',
            '303', 1, ${evolvingRewriteShas[2]}
          )
      `;
      await admin`
        insert into github_commits (
          activity_public_id, additions, author_login, authored_at,
          author_user_id, canonicalized_at, changed_files, committed_at,
          committer_at, deletions, enrichment_state, fingerprint_complete,
          first_observed_at, full_message, languages, message, parent_shas,
          pr_discovery_state, repository, repository_id, sha, substantive_loc
        ) values
          (
            ${evolvingRewriteIds[0]}, 100, 'f0rr0',
            '2026-08-25T07:00:00.000Z', '101',
            '2026-08-28T19:00:00.000Z', 10,
            '2026-08-25T08:00:00.000Z', '2026-08-25T08:00:00.000Z', 10,
            'complete', false, '2026-08-28T19:00:00.000Z',
            'Publish content with full-page ISR', '[]'::jsonb,
            'Publish content with full-page ISR',
            ${JSON.stringify(["1".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${evolvingRewriteShas[0]}, 110
          ),
          (
            ${evolvingRewriteIds[1]}, 200, 'f0rr0',
            '2026-08-25T07:00:00.000Z', '101',
            '2026-08-28T19:00:00.000Z', 20,
            '2026-08-25T09:00:00.000Z', '2026-08-25T09:00:00.000Z', 20,
            'complete', false, '2026-08-28T19:01:00.000Z',
            'Publish content with full-page ISR', '[]'::jsonb,
            'Publish content with full-page ISR',
            ${JSON.stringify(["2".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${evolvingRewriteShas[1]}, 220
          ),
          (
            ${evolvingRewriteIds[2]}, 300, 'f0rr0',
            '2026-08-25T07:00:00.000Z', '101', null, 30,
            '2026-08-25T10:00:00.000Z', '2026-08-25T10:00:00.000Z', 30,
            'complete', false, '2026-08-28T19:02:00.000Z',
            'Publish content with full-page ISR', '[]'::jsonb,
            'Publish content with full-page ISR',
            ${JSON.stringify(["3".repeat(40)])}::jsonb, 'complete',
            'f0rr0/exact-copies', '303', ${evolvingRewriteShas[2]}, 330
          )
      `;
      await admin`
        insert into github_summary_attempts (
          activity_public_id, completed_at, revision, state, summary_headline,
          summary_short
        ) values
          (
            ${evolvingRewriteIds[0]}, '2026-08-28T19:00:00.000Z', 1,
            'complete', 'Old ISR headline', 'Old ISR summary'
          ),
          (
            ${evolvingRewriteIds[1]}, '2026-08-28T19:00:00.000Z', 1,
            'complete', 'Middle ISR headline', 'Middle ISR summary'
          ),
          (
            ${evolvingRewriteIds[2]}, '2026-08-28T19:00:00.000Z', 1,
            'complete', 'Latest ISR headline', 'Latest ISR summary'
          )
      `;
      expect(
        await canonicalizeGitHubCommitActivity(
          "303",
          evolvingRewriteShas[2],
          new Date("2026-08-28T19:05:00.000Z")
        )
      ).toEqual({
        aliased: false,
        aliases: 2,
        publicId: evolvingRewriteIds[2],
      });
      const rewritePage = await readPublicGitHubActivityPage(
        {
          beforeDay: "2026-08-26",
          snapshotAt: "2026-08-28T20:00:00.000Z",
          version: 1,
        },
        1
      );
      expect(rewritePage.days).toHaveLength(1);
      expect(rewritePage.days[0]?.day).toBe("2026-08-25");
      expect(rewritePage.days[0]?.totals).toEqual({
        additions: 300,
        deletions: 30,
        issuesOpened: 0,
        pullRequestsMerged: 0,
        repositories: 1,
      });
      expect(rewritePage.days[0]?.items).toMatchObject([
        {
          commit: { headline: "Latest ISR headline" },
          id: evolvingRewriteIds[2],
          kind: "commit",
        },
      ]);
    });
  }
);
