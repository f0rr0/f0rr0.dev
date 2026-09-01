import {
  afterAll,
  afterEach,
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
const postgresPassword = "github-repository-inventory-test";
const originalFetch = globalThis.fetch;
const digest = (character) => character.repeat(64);
const sha = (character) => character.repeat(40);

const repositoryResponse = ({
  description = "An example repository.",
  fullName = "f0rr0/example",
  homepage = "https://example.com",
  id = 101,
  topics = ["typescript", "example"],
} = {}) => ({
  default_branch: "main",
  description,
  full_name: fullName,
  homepage,
  html_url: `https://github.com/${fullName}`,
  id,
  owner: {
    avatar_url: "https://avatars.githubusercontent.com/u/8574219?v=4",
    id: 8_574_219,
    login: "f0rr0",
    type: "User",
  },
  private: false,
  pushed_at: "2026-09-01T00:00:00Z",
  topics,
  visibility: "public",
});

const repositoryFacts = ({
  description = "An example repository.",
  fullName = "f0rr0/example",
  homepageUrl = "https://example.com",
  id = "101",
  topics = ["example", "typescript"],
} = {}) => ({
  defaultBranch: "main",
  description,
  fullName,
  homepageUrl,
  htmlUrl: `https://github.com/${fullName}`,
  id,
  ownerAvatarUrl: "https://avatars.githubusercontent.com/u/8574219?v=4",
  ownerId: "8574219",
  ownerLogin: "f0rr0",
  ownerType: "User",
  pushedAt: "2026-09-01T00:00:00.000Z",
  topics,
  visibility: "public",
});

describe.skipIf(!dockerAvailable)("GitHub repository inventory", () => {
  let admin;
  let claimGitHubRefRepairs;
  let closeDatabase;
  let containerId;
  let getDatabase;
  let loadGitHubRepositoryInventory;
  let originalDatabaseUrl;
  let reconcileGitHubRepositoryRefBatch;
  let upsertGitHubRepository;

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
      "POSTGRES_DB=github_repository_inventory_test",
      postgresImage,
    ]);
    if (started.exitCode !== 0) {
      throw new Error("Could not start the inventory PostgreSQL database.");
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
      throw new Error("Could not resolve the inventory PostgreSQL port.");
    }
    const databaseUrl = `postgresql://postgres:${postgresPassword}@127.0.0.1:${port}/github_repository_inventory_test`;
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

    admin = postgres(databaseUrl, {
      max: 1,
      onnotice: (notice) => {
        void notice;
      },
      prepare: false,
    });
    await migrate(drizzle({ client: admin }), { migrationsFolder });
    env.DATABASE_URL = databaseUrl;
    ({ closeDatabase, getDatabase } = await import("../src/db/client.ts"));
    ({ claimGitHubRefRepairs } =
      await import("../src/lib/github-ref-membership-store.ts"));
    ({ loadGitHubRepositoryInventory } =
      await import("../src/lib/github-repository-inventory.ts"));
    ({ reconcileGitHubRepositoryRefBatch } =
      await import("../src/lib/github-ref-reconciliation-batch.ts"));
    ({ upsertGitHubRepository } =
      await import("../src/lib/github-repository-store.ts"));
  });

  beforeEach(async () => {
    await admin`
      truncate table
        github_account_checkpoints,
        github_repository_inventory_heads,
        github_repositories
      restart identity cascade
    `;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await closeDatabase?.();
    env.DATABASE_URL = originalDatabaseUrl;
    await admin?.end({ timeout: 2 });
    if (containerId !== undefined) {
      Bun.spawnSync(["docker", "stop", "--time", "1", containerId], {
        stderr: "ignore",
        stdout: "ignore",
      });
    }
  });

  test("publishes one immutable-ID generation and reuses it for head batches", async () => {
    /** @type {string[]} */
    const paths = [];
    const headSha = "a".repeat(40);
    globalThis.fetch = async (input) => {
      const url =
        input instanceof Request ? new URL(input.url) : new URL(input);
      paths.push(url.pathname);
      if (url.pathname === "/user/repos") {
        return Response.json([repositoryResponse()]);
      }
      if (url.pathname === "/repos/f0rr0/example/branches") {
        return Response.json([{ commit: { sha: headSha }, name: "main" }]);
      }
      throw new Error(`Unexpected GitHub request: ${url.pathname}`);
    };

    const runBatch = () =>
      reconcileGitHubRepositoryRefBatch({
        account: "f0rr0",
        deadlineAt: Date.now() + 15_000,
        kind: "head",
        repositoryLimit: 1,
        token: "token",
      });
    const first = await runBatch();
    const second = await runBatch();

    expect(first).toEqual({
      complete: true,
      knownCommits: 0,
      pages: 1,
      pushes: 0,
      refs: 1,
      repositories: 1,
    });
    expect(second).toEqual(first);
    expect({
      branches: paths.filter((path) => path.endsWith("/branches")).length,
      inventory: paths.filter((path) => path === "/user/repos").length,
    }).toEqual({ branches: 2, inventory: 1 });
    expect(
      await admin`
        select
          h.account_login as "accountLogin",
          h.account_user_id as "accountUserId",
          h.generation::int,
          c.active_access as "activeAccess",
          c.repository_id as "repositoryId"
        from github_repository_inventory_heads h
        join github_account_repository_catalogs c
          on c.account_user_id = h.account_user_id
          and c.inventory_generation = h.generation
      `
    ).toEqual([
      {
        accountLogin: "f0rr0",
        accountUserId: "8574219",
        activeAccess: true,
        generation: 1,
        repositoryId: "101",
      },
    ]);
    expect(
      await admin`
        select description, homepage_url as "homepageUrl", topics
        from github_repositories
        where id = '101'
      `
    ).toEqual([
      {
        description: "An example repository.",
        homepageUrl: "https://example.com",
        topics: ["example", "typescript"],
      },
    ]);
  });

  test("publishes metadata when sparse facts arrive during inventory traversal", async () => {
    const startedAt = new Date("2026-09-01T12:00:00.000Z");
    const sparseObservedAt = new Date(startedAt.getTime() + 1);
    const startedAtIso = startedAt.toISOString();
    const sparseObservedAtIso = sparseObservedAt.toISOString();
    globalThis.fetch = async () => {
      await getDatabase().transaction(async (transaction) => {
        await upsertGitHubRepository(
          transaction,
          { fullName: "f0rr0/example", id: "101" },
          sparseObservedAt
        );
      });
      return Response.json([repositoryResponse()]);
    };

    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        now: startedAt,
        token: "token",
      })
    ).toEqual([repositoryFacts()]);
    expect(
      await admin`
        select
          description = 'An example repository.' as "metadataPersisted",
          inventory_verified_at = ${startedAtIso} as "metadataTimestamped",
          last_observed_at = ${sparseObservedAtIso} as "sparseFactsPreserved"
        from github_repositories
        where id = '101'
      `
    ).toEqual([
      {
        metadataPersisted: true,
        metadataTimestamped: true,
        sparseFactsPreserved: true,
      },
    ]);

    globalThis.fetch = async () => {
      throw new Error("The complete inventory should have been cached.");
    };
    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        now: new Date(startedAt.getTime() + 2),
        token: "token",
      })
    ).toEqual([repositoryFacts()]);
  });

  test("makes an already-known canonical head claimable without known commits", async () => {
    const headSha = "b".repeat(40);
    await admin`
      insert into github_account_checkpoints
        (account, ref_backfill_since_at)
      values ('f0rr0', '2026-08-01T00:00:00.000Z')
    `;
    await admin`
      insert into github_repositories (id, full_name)
      values ('101', 'f0rr0/example')
    `;
    await admin`
      insert into github_repository_refs
        (branch_lineage_id, head_sha, kind, projection_relevant, ref_name, repository_id)
      values
        ('20000000-0000-4000-8000-000000000001', ${headSha}, 'head', false, 'refs/heads/main', '101')
    `;
    expect(
      await claimGitHubRefRepairs({ limit: 1, repositoryId: "101" })
    ).toEqual([]);

    globalThis.fetch = async () => Response.json([repositoryResponse()]);
    await loadGitHubRepositoryInventory({
      account: "f0rr0",
      now: new Date("2026-09-01T12:00:00.000Z"),
      token: "token",
    });

    expect(
      await admin`
        select projection_relevant as "projectionRelevant"
        from github_repository_refs
        where repository_id = '101' and ref_name = 'refs/heads/main'
      `
    ).toEqual([{ projectionRelevant: true }]);
    expect(
      await claimGitHubRefRepairs({ limit: 1, repositoryId: "101" })
    ).toMatchObject([
      {
        active: true,
        desiredHeadSha: headSha,
        repositoryId: "101",
      },
    ]);
    expect(
      await admin`
        select count(*)::int as count
        from github_commits
        where repository_id = '101'
      `
    ).toEqual([{ count: 0 }]);
  });

  test("does not publish a partial traversal and retries without a sleep", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      if (requests === 1) {
        return Response.json([repositoryResponse()], {
          headers: {
            link: '<https://api.github.com/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&direction=asc&per_page=100&sort=full_name&visibility=all&page=2>; rel="next"',
          },
        });
      }
      throw new Error("Second inventory page is unavailable.");
    };

    await expect(
      loadGitHubRepositoryInventory({
        account: "f0rr0",
        now,
        token: "token",
      })
    ).rejects.toThrow("Second inventory page is unavailable.");
    expect(
      await admin`
        select generation::int, completed_at as "completedAt"
        from github_repository_inventory_heads
      `
    ).toEqual([{ completedAt: null, generation: 0 }]);
    expect(
      await admin`select count(*)::int as count from github_account_repository_catalogs`
    ).toEqual([{ count: 0 }]);

    globalThis.fetch = async () => Response.json([repositoryResponse()]);
    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        now,
        token: "token",
      })
    ).toEqual([repositoryFacts()]);
  });

  test("tracks renames and lost access by immutable repository ID", async () => {
    const startedAt = new Date("2026-09-01T12:00:00.000Z");
    let providerRepositories = [repositoryResponse()];
    globalThis.fetch = async () => Response.json(providerRepositories);

    await loadGitHubRepositoryInventory({
      account: "f0rr0",
      now: startedAt,
      token: "token",
    });
    providerRepositories = [
      repositoryResponse({ fullName: "f0rr0/renamed", id: 101 }),
      repositoryResponse({ fullName: "f0rr0/current", id: 202 }),
    ];
    await loadGitHubRepositoryInventory({
      account: "f0rr0",
      forceRefresh: true,
      now: new Date(startedAt.getTime() + 1),
      token: "token",
    });
    providerRepositories = [
      repositoryResponse({ fullName: "f0rr0/current", id: 202 }),
    ];
    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        forceRefresh: true,
        now: new Date(startedAt.getTime() + 2),
        token: "token",
      })
    ).toEqual([repositoryFacts({ fullName: "f0rr0/current", id: "202" })]);
    expect(
      await admin`
        select
          c.active_access as "activeAccess",
          c.inventory_generation::int as generation,
          r.full_name as "fullName",
          c.repository_id as "repositoryId"
        from github_account_repository_catalogs c
        join github_repositories r on r.id = c.repository_id
        order by c.repository_id::bigint
      `
    ).toEqual([
      {
        activeAccess: false,
        fullName: "f0rr0/renamed",
        generation: 3,
        repositoryId: "101",
      },
      {
        activeAccess: true,
        fullName: "f0rr0/current",
        generation: 3,
        repositoryId: "202",
      },
    ]);
  });

  test("invalidates only affected public summaries when repository context changes", async () => {
    const startedAt = new Date("2026-09-01T12:00:00.000Z");
    const startedAtIso = startedAt.toISOString();
    let providerRepositories = [repositoryResponse()];
    globalThis.fetch = async () => Response.json(providerRepositories);

    await loadGitHubRepositoryInventory({
      account: "f0rr0",
      now: startedAt,
      token: "token",
    });
    await admin`
      insert into github_repositories (id, full_name)
      values ('202', 'f0rr0/unrelated')
    `;
    await admin`
      insert into github_commits (
        author_login, committed_at, message, repository, repository_id, sha
      ) values
        ('f0rr0', ${startedAtIso}, 'affected', 'f0rr0/example', '101', ${sha("a")}),
        ('f0rr0', ${startedAtIso}, 'unrelated', 'f0rr0/unrelated', '202', ${sha("b")})
    `;
    await admin`
      insert into github_work_units (
        activity_anchor_at, activity_at, activity_day, additions,
        attribution_mode, branch_lineage_id, content_observed_at, deletions,
        facts_digest, file_count, first_activity_at, id, identity_key, kind,
        last_activity_at, member_count, membership_digest,
        newest_commit_repository_id, newest_commit_sha, outcome_digest,
        repository_id, summary_input_digest, visibility
      ) values
        (
          ${startedAtIso}, ${startedAtIso}, '2026-09-01', 1,
          'branch_owned_composite', '10000000-0000-4000-8000-000000000101',
          ${startedAtIso}, 0, ${digest("a")}, 1, ${startedAtIso},
          '20000000-0000-4000-8000-000000000101',
          'branch:10000000-0000-4000-8000-000000000101', 'branch',
          ${startedAtIso}, 1, ${digest("b")}, '101', ${sha("a")}, ${digest("c")},
          '101', ${digest("d")}, 'public'
        ),
        (
          ${startedAtIso}, ${startedAtIso}, '2026-09-01', 1,
          'branch_owned_composite', '10000000-0000-4000-8000-000000000102',
          ${startedAtIso}, 0, ${digest("e")}, 1, ${startedAtIso},
          '20000000-0000-4000-8000-000000000102',
          'branch:10000000-0000-4000-8000-000000000102', 'branch',
          ${startedAtIso}, 1, ${digest("f")}, '101', ${sha("a")}, ${digest("1")},
          '101', ${digest("2")}, 'private'
        ),
        (
          ${startedAtIso}, ${startedAtIso}, '2026-09-01', 1,
          'branch_owned_composite', '10000000-0000-4000-8000-000000000103',
          ${startedAtIso}, 0, ${digest("3")}, 1, ${startedAtIso},
          '20000000-0000-4000-8000-000000000103',
          'branch:10000000-0000-4000-8000-000000000103', 'branch',
          ${startedAtIso}, 1, ${digest("4")}, '202', ${sha("b")}, ${digest("5")},
          '202', ${digest("6")}, 'public'
        )
    `;

    await loadGitHubRepositoryInventory({
      account: "f0rr0",
      forceRefresh: true,
      now: new Date(startedAt.getTime() + 1),
      token: "token",
    });
    expect(
      await admin`
        select id::text, summary_input_digest as "summaryInputDigest"
        from github_work_units
        order by id
      `
    ).toEqual([
      {
        id: "20000000-0000-4000-8000-000000000101",
        summaryInputDigest: digest("d"),
      },
      {
        id: "20000000-0000-4000-8000-000000000102",
        summaryInputDigest: digest("2"),
      },
      {
        id: "20000000-0000-4000-8000-000000000103",
        summaryInputDigest: digest("6"),
      },
    ]);

    await getDatabase().transaction(async (transaction) => {
      await upsertGitHubRepository(
        transaction,
        { fullName: "f0rr0/renamed", id: "101" },
        new Date(startedAt.getTime() + 2)
      );
    });
    expect(
      await admin`
        select description, full_name as "fullName",
          homepage_url as "homepageUrl", topics
        from github_repositories
        where id = '101'
      `
    ).toEqual([
      {
        description: "An example repository.",
        fullName: "f0rr0/renamed",
        homepageUrl: "https://example.com",
        topics: ["example", "typescript"],
      },
    ]);
    expect(
      await admin`
        select summary_input_digest as "summaryInputDigest"
        from github_work_units
        where id = '20000000-0000-4000-8000-000000000101'
      `
    ).toEqual([{ summaryInputDigest: null }]);
    await admin`
      update github_work_units
      set summary_input_digest = ${digest("d")}
      where id = '20000000-0000-4000-8000-000000000101'
    `;

    providerRepositories = [
      repositoryResponse({
        description: null,
        fullName: "f0rr0/renamed",
        homepage: null,
        topics: [],
      }),
    ];
    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        forceRefresh: true,
        now: new Date(startedAt.getTime() + 3),
        token: "token",
      })
    ).toEqual([
      repositoryFacts({
        description: null,
        fullName: "f0rr0/renamed",
        homepageUrl: null,
        topics: [],
      }),
    ]);
    expect(
      await admin`
        select description, full_name as "fullName",
          homepage_url as "homepageUrl", topics
        from github_repositories
        where id = '101'
      `
    ).toEqual([
      {
        description: null,
        fullName: "f0rr0/renamed",
        homepageUrl: null,
        topics: [],
      },
    ]);
    expect(
      await admin`
        select id::text, summary_input_digest as "summaryInputDigest"
        from github_work_units
        order by id
      `
    ).toEqual([
      {
        id: "20000000-0000-4000-8000-000000000101",
        summaryInputDigest: null,
      },
      {
        id: "20000000-0000-4000-8000-000000000102",
        summaryInputDigest: digest("2"),
      },
      {
        id: "20000000-0000-4000-8000-000000000103",
        summaryInputDigest: digest("6"),
      },
    ]);
  });

  test("a superseded refresh cannot replace the newer complete generation", async () => {
    const firstStartedAt = new Date("2026-09-01T12:00:00.000Z");
    const secondStartedAt = new Date(firstStartedAt.getTime() + 1);
    const firstRequestStarted = Promise.withResolvers();
    const firstResponse = Promise.withResolvers();
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      if (requests === 1) {
        firstRequestStarted.resolve();
        return await firstResponse.promise;
      }
      return Response.json([
        repositoryResponse({ fullName: "f0rr0/newer", id: 202 }),
      ]);
    };

    const firstRefresh = loadGitHubRepositoryInventory({
      account: "f0rr0",
      now: firstStartedAt,
      token: "token",
    });
    await firstRequestStarted.promise;
    const newerInventory = await loadGitHubRepositoryInventory({
      account: "f0rr0",
      forceRefresh: true,
      now: secondStartedAt,
      token: "token",
    });
    firstResponse.resolve(Response.json([repositoryResponse()]));

    await expect(firstRefresh).rejects.toMatchObject({
      name: "GitHubRepositoryInventoryClaimLostError",
    });
    expect(newerInventory).toEqual([
      repositoryFacts({ fullName: "f0rr0/newer", id: "202" }),
    ]);
    globalThis.fetch = async () => {
      throw new Error("A current inventory must not call GitHub again.");
    };
    expect(
      await loadGitHubRepositoryInventory({
        account: "f0rr0",
        now: new Date(secondStartedAt.getTime() + 1000),
        token: "token",
      })
    ).toEqual(newerInventory);
  });
});
