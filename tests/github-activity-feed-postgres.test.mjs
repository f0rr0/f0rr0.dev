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
const postgresPassword = "github-work-unit-feed-test";
const cursorSecret = "github-work-unit-feed-cursor-secret-32-chars";
const digest = (character) => character.repeat(64);
const sha = (character) => character.repeat(40);

const checkedOutput = (result, operation) => {
  if (result.exitCode !== 0) {
    throw new Error(
      `${operation} failed: ${result.stderr.toString("utf-8").trim()}`
    );
  }
  return result.stdout.toString("utf-8").trim();
};

describe.skipIf(!dockerAvailable)("GitHub work-unit feed projection", () => {
  let admin;
  let closeDatabase;
  let containerId;
  let decodeGitHubActivityCursor;
  let originalCursorSecret;
  let originalDatabaseUrl;
  let readPublicGitHubActivityHead;
  let readPublicGitHubActivityPage;
  let GitHubActivityOrderingChangedError;

  beforeAll(async () => {
    originalCursorSecret = env.GITHUB_ACTIVITY_CURSOR_SECRET;
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
    const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_activity_test`;
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
      } catch (error) {
        await probe.end({ timeout: 1 }).catch(() => null);
        if (attempt === 49) {
          throw error;
        }
        await delay(100);
      }
    }

    admin = postgres(databaseUrl, { max: 1, prepare: false });
    await migrate(drizzle({ client: admin }), { migrationsFolder });
    env.DATABASE_URL = databaseUrl;
    env.GITHUB_ACTIVITY_CURSOR_SECRET = cursorSecret;
    ({ closeDatabase } = await import("../src/db/client.ts"));
    ({ decodeGitHubActivityCursor } =
      await import("../src/lib/github-activity-cursor.ts"));
    ({
      GitHubActivityOrderingChangedError,
      readPublicGitHubActivityHead,
      readPublicGitHubActivityPage,
    } = await import("../src/lib/github-activity-store.ts"));

    await admin`
      insert into github_repositories (
        id, full_name, owner_avatar_url, owner_login, visibility
      ) values
        ('101', 'f0rr0/public-one',
          'https://avatars.githubusercontent.com/u/101?v=4', 'f0rr0', 'public'),
        ('102', 'f0rr0/public-two', null, 'f0rr0', 'public'),
        ('201', 'secret-owner/private-repository-sentinel', null,
          'secret-owner', 'private'),
        ('301', 'unknown-owner/unknown-repository-sentinel', null,
          'unknown-owner', null)
    `;
    await admin`
      insert into github_commits (
        author_login, committed_at, message, repository, repository_id, sha
      ) values
        ('f0rr0', '2026-08-30T12:00:00Z', 'public pr',
          'f0rr0/public-one', '101', ${sha("a")}),
        ('f0rr0', '2026-08-30T10:00:00Z', 'public direct',
          'f0rr0/public-one', '101', ${sha("b")}),
        ('f0rr0', '2026-08-29T11:00:00Z', 'public second repo',
          'f0rr0/public-two', '102', ${sha("c")}),
        ('f0rr0', '2026-08-28T11:00:00Z', 'public earlier',
          'f0rr0/public-one', '101', ${sha("d")}),
        ('f0rr0', '2026-08-30T09:00:00Z', 'private sentinel commit',
          'secret-owner/private-repository-sentinel', '201', ${sha("e")}),
        ('f0rr0', '2026-08-31T09:00:00Z', 'unknown sentinel commit',
          'unknown-owner/unknown-repository-sentinel', '301', ${sha("f")})
    `;
    await admin`
      insert into github_pull_requests (
        account, author_user_id, created_at, node_id, number,
        provider_updated_at, repository_id, state, title, title_snapshot, url
      ) values (
        'f0rr0', '1', '2026-08-27T08:00:00Z', 'PR_public_feed_1', 17,
        '2026-08-30T12:00:00Z', '101', 'open',
        'private raw title must not be a fallback',
        'private raw title must not be a fallback',
        'https://github.com/untrusted/ignored/pull/999'
      )
    `;
    await admin`
      insert into github_work_units (
        activity_anchor_at, activity_at, activity_day, additions,
        attribution_mode, branch_lineage_id, content_observed_at, deletions,
        facts_digest, file_count, first_activity_at, id, identity_key, kind,
        languages, last_activity_at, member_count, membership_digest,
        newest_commit_repository_id, newest_commit_sha, outcome_digest,
        pull_request_node_id, repository_id, revision, summary_input_digest,
        visibility
      ) values
        (
          '2026-08-30T12:00:00Z', '2026-08-30T12:00:00Z', '2026-08-30',
          30, 'tracked_authored_pr', null, '2026-08-30T12:01:00Z', 8,
          ${digest("1")}, 4, '2026-08-28T08:00:00Z',
          '00000000-0000-4000-8000-000000000101', 'pr:PR_public_feed_1',
          'pull_request', ${JSON.stringify([
            { changedLines: 38, id: "typescript", label: "TypeScript" },
          ])}::jsonb, '2026-08-30T12:00:00Z', 3, ${digest("2")}, '101',
          ${sha("a")}, ${digest("a")}, 'PR_public_feed_1', '101', 2,
          ${digest("1")}, 'public'
        ),
        (
          '2026-08-30T10:00:00Z', '2026-08-30T10:00:00Z', '2026-08-30',
          12, 'canonical_owned_composite', null, '2026-08-30T10:01:00Z', 2,
          ${digest("3")}, 2, '2026-08-30T10:00:00Z',
          '00000000-0000-4000-8000-000000000102',
          'canonical:101:2026-08-30', 'canonical_day', null,
          '2026-08-30T10:00:00Z', 1, ${digest("4")}, '101', ${sha("b")},
          null, null, '101', 1, null, 'public'
        ),
        (
          '2026-08-29T11:00:00Z', '2026-08-29T11:00:00Z', '2026-08-29',
          8, 'canonical_owned_composite', null, '2026-08-29T11:01:00Z', 1,
          ${digest("5")}, 1, '2026-08-29T11:00:00Z',
          '00000000-0000-4000-8000-000000000103',
          'canonical:102:2026-08-29', 'canonical_day', null,
          '2026-08-29T11:00:00Z', 1, ${digest("6")}, '102', ${sha("c")},
          null, null, '102', 1, null, 'public'
        ),
        (
          '2026-08-28T11:00:00Z', '2026-08-28T11:00:00Z', '2026-08-28',
          5, 'canonical_owned_composite', null, '2026-08-28T11:01:00Z', 1,
          ${digest("7")}, 1, '2026-08-28T11:00:00Z',
          '00000000-0000-4000-8000-000000000104',
          'canonical:101:2026-08-28', 'canonical_day', null,
          '2026-08-28T11:00:00Z', 1, ${digest("8")}, '101', ${sha("d")},
          null, null, '101', 1, null, 'public'
        ),
        (
          '2026-08-30T09:00:00Z', '2026-08-30T09:00:00Z', '2026-08-30',
          100, 'branch_owned_composite', '10000000-0000-4000-8000-000000000201',
          '2026-08-30T09:01:00Z', 50, ${digest("9")}, 20,
          '2026-08-30T09:00:00Z',
          '00000000-0000-4000-8000-000000000105',
          'branch:10000000-0000-4000-8000-000000000201', 'branch', null,
          '2026-08-30T09:00:00Z', 4, ${digest("b")}, '201', ${sha("e")},
          ${digest("c")}, null, '201', 1, null, 'private'
        ),
        (
          '2026-08-31T09:00:00Z', '2026-08-31T09:00:00Z', '2026-08-31',
          100, 'canonical_owned_composite', null, '2026-08-31T09:01:00Z', 50,
          ${digest("d")}, 20, '2026-08-31T09:00:00Z',
          '00000000-0000-4000-8000-000000000106',
          'canonical:301:2026-08-31', 'canonical_day', null,
          '2026-08-31T09:00:00Z', 4, ${digest("e")}, '301', ${sha("f")},
          ${digest("f")}, null, '301', 1, null, 'public'
        )
    `;
    await admin`
      insert into github_issues (
        account, author_user_id, created_at, node_id, number, repository_id,
        title_snapshot, url_snapshot
      ) values
        ('f0rr0', '1', '2026-08-29T12:00:00Z', 'ISSUE_public_feed_1', 7,
          '102', 'Track deterministic activity',
          'https://github.com/untrusted/ignored/issues/700'),
        ('f0rr0', '1', '2026-08-30T08:00:00Z', 'ISSUE_private_feed_1', 8,
          '201', 'private issue title sentinel',
          'https://github.com/secret-owner/private-repository-sentinel/issues/8'),
        ('f0rr0', '1', '2026-08-31T08:00:00Z', 'ISSUE_unknown_feed_1', 9,
          '301', 'unknown issue title sentinel',
          'https://github.com/unknown-owner/unknown-repository-sentinel/issues/9')
    `;
    await admin`
      insert into github_work_unit_summary_attempts (
        accepted_at, attribution_mode, completed_at, debounce_until,
        outcome, outcome_digest, recipe, revision, state,
        summary_input_digest, unit_revision, work_unit_id
      ) values
        (
          '2026-08-30T12:02:00Z', 'tracked_authored_pr',
          '2026-08-30T12:02:00Z', '2026-08-30T12:00:00Z',
          'Explains the current pull request outcome.', ${digest("a")},
          'work-unit-outcome-v1', 1, 'accepted', ${digest("1")}, 1,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '2026-08-30T12:03:00Z', 'tracked_authored_pr',
          '2026-08-30T12:03:00Z', '2026-08-30T12:00:00Z',
          'Stale outcome must remain hidden.', ${digest("b")},
          'work-unit-outcome-v1', 2, 'accepted', ${digest("2")}, 2,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '2026-08-30T12:04:00Z', 'tracked_authored_pr',
          '2026-08-30T12:04:00Z', '2026-08-30T12:00:00Z',
          'Stale input must remain hidden.', ${digest("a")},
          'work-unit-outcome-v1', 3, 'accepted', ${digest("3")}, 2,
          '00000000-0000-4000-8000-000000000101'
        ),
        (
          '2026-08-30T12:05:00Z', 'branch_owned_composite',
          '2026-08-30T12:05:00Z', '2026-08-30T12:00:00Z',
          'Wrong attribution must remain hidden.', ${digest("a")},
          'corrupt-mode-test', 4, 'accepted', ${digest("1")}, 2,
          '00000000-0000-4000-8000-000000000101'
        )
    `;
    await admin`
      update github_public_feed_head set
        feed_revision = 7,
        head_content_revision = 8,
        last_published_at = '2026-08-30T12:01:00Z',
        ordering_revision = 9,
        summarizing = false
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
    if (originalCursorSecret === undefined) {
      delete env.GITHUB_ACTIVITY_CURSOR_SECRET;
    } else {
      env.GITHUB_ACTIVITY_CURSOR_SECRET = originalCursorSecret;
    }
    if (containerId !== undefined) {
      Bun.spawnSync(["docker", "stop", "--time", "1", containerId], {
        stderr: "ignore",
        stdout: "ignore",
      });
    }
  });

  test("reads complete days with one repository group and no private detail", async () => {
    const firstPage = await readPublicGitHubActivityPage(null, 2);

    expect(firstPage.head.feedRevision).toBe("7");
    expect(firstPage.orderingRevision).toBe("9");
    expect(firstPage.days.map(({ day }) => day)).toEqual([
      "2026-08-30",
      "2026-08-29",
    ]);
    expect(firstPage.days[0]?.privateWork).toBe(true);
    expect(firstPage.days[0]?.repositories).toHaveLength(1);
    expect(firstPage.days[0]?.repositories[0]?.repository.label).toBe(
      "f0rr0/public-one"
    );
    expect(
      firstPage.days[0]?.repositories[0]?.items.map(({ id }) => id)
    ).toEqual(["pr:PR_public_feed_1", "canonical:101:2026-08-30"]);
    expect(firstPage.days[1]?.repositories).toHaveLength(1);
    expect(firstPage.days[1]?.repositories[0]?.items).toHaveLength(2);

    const visibleRepositories = firstPage.days.flatMap((day) =>
      day.repositories.map(({ repository }) => repository.label)
    );
    const visibleIssueTitles = firstPage.days.flatMap((day) =>
      day.repositories.flatMap((group) =>
        group.items.flatMap((item) =>
          item.kind === "issue-opened" ? [item.title] : []
        )
      )
    );
    expect(visibleRepositories).toEqual([
      "f0rr0/public-one",
      "f0rr0/public-two",
    ]);
    expect(visibleIssueTitles).toEqual(["Track deterministic activity"]);
  });

  test("shows only an accepted summary for the current immutable input", async () => {
    const page = await readPublicGitHubActivityPage(null, 2);
    const pullRequest = page.days[0]?.repositories[0]?.items.find(
      ({ kind }) => kind === "pull-request"
    );

    expect(pullRequest).toMatchObject({
      destination: {
        label: "Open pull request 17 on GitHub",
        url: "https://github.com/f0rr0/public-one/pull/17",
      },
      facts: {
        additions: 30,
        dateRange: { end: "2026-08-30", start: "2026-08-28" },
        deletions: 8,
        languages: ["TypeScript"],
        ownedCommitCount: 3,
        uniqueFileCount: 4,
      },
      outcome: "Explains the current pull request outcome.",
    });
  });

  test("binds pagination to the ordered set and never splits a UTC day", async () => {
    const firstPage = await readPublicGitHubActivityPage(null, 2);
    expect(firstPage.nextCursor).not.toBeNull();
    const cursor = decodeGitHubActivityCursor(firstPage.nextCursor);
    expect(cursor).toEqual({
      beforeDay: "2026-08-29",
      orderingRevision: "9",
      version: 2,
    });

    const nextPage = await readPublicGitHubActivityPage(cursor, 2);
    expect(nextPage.days.map(({ day }) => day)).toEqual(["2026-08-28"]);

    await admin`
      update github_public_feed_head
      set ordering_revision = 10
      where id
    `;
    await expect(
      readPublicGitHubActivityPage(cursor, 2)
    ).rejects.toBeInstanceOf(GitHubActivityOrderingChangedError);
  });

  test("binds the head validator to its monotonic content revision", async () => {
    const before = await readPublicGitHubActivityHead();
    await admin`
      update github_public_feed_head set
        head_content_revision = head_content_revision + 1,
        summarizing = true
      where id
    `;
    const after = await readPublicGitHubActivityHead();

    expect(after.etag).not.toBe(before.etag);
    expect(after.head.summarizing).toBe(true);
  });

  test("hides a private issue day after current repository access is revoked", async () => {
    await admin`
      insert into github_repository_inventory_heads (
        account_login, account_user_id, completed_at, generation, updated_at
      ) values (
        'f0rr0', '8574219', '2026-09-01T10:00:00Z', 1,
        '2026-09-01T10:00:00Z'
      )
      on conflict (account_user_id) do update set
        account_login = excluded.account_login,
        completed_at = excluded.completed_at,
        generation = excluded.generation,
        updated_at = excluded.updated_at
    `;
    await admin`
      insert into github_account_repository_catalogs (
        account_user_id, active_access, inventory_generation, observed_at,
        repository_id
      ) values (
        '8574219', true, 1, '2026-09-01T10:00:00Z', '201'
      )
      on conflict (account_user_id, repository_id) do update set
        active_access = excluded.active_access,
        inventory_generation = excluded.inventory_generation,
        observed_at = excluded.observed_at
    `;
    await admin`
      insert into github_issues (
        account, author_user_id, created_at, node_id, number, repository_id,
        title_snapshot, url_snapshot
      ) values (
        'f0rr0', '8574219', '2026-08-27T08:00:00Z',
        'ISSUE_private_feed_revoked_access', 10, '201',
        'revoked private issue title sentinel',
        'https://github.com/secret-owner/private-repository-sentinel/issues/10'
      )
    `;

    const accessible = await readPublicGitHubActivityPage(null, 14);
    expect(accessible.days.find(({ day }) => day === "2026-08-27")).toEqual({
      day: "2026-08-27",
      privateWork: true,
      repositories: [],
    });

    await admin`
      update github_account_repository_catalogs
      set active_access = false, observed_at = '2026-09-01T10:01:00Z'
      where account_user_id = '8574219' and repository_id = '201'
    `;
    const revoked = await readPublicGitHubActivityPage(null, 14);
    expect(revoked.days.some(({ day }) => day === "2026-08-27")).toBe(false);
  });
});
