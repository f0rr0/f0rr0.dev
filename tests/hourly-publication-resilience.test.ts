import { expect, test } from "bun:test";

// Isolate module mocks from the rest of the test suite.
const check = (source: string) => {
  const result = Bun.spawnSync([process.execPath, "--eval", source], {
    cwd: new URL("..", import.meta.url).pathname,
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
};

test("publication keeps source dates through delayed syncs, metadata revisions and IST midnight", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock, setSystemTime } from "bun:test";
    import { PgDialect } from "drizzle-orm/pg-core";
    import { githubActivitySnapshots, githubPublicFeedHead, githubWorkUnits } from "./src/db/schema.ts";
    setSystemTime(new Date("2026-09-28T18:30:00Z"));
    const work = (id, activityAt, additions = 200) => ({
      id, activityAt, repository: { key: "1" }, facts: { additions }
    });
    const rows = [
      work("canonical:1:2026-08-04", "2026-08-04T09:05:36Z"),
      work("late", "2026-09-28T18:29:59Z"),
      work("changed-pr", "2026-09-28T18:30:00Z", 240),
      ...["legacy-merge", "status-hydration"].map(id => ({
        ...work(id, "2026-09-28T18:00:00Z"),
        pullRequest: { status: "merged", statusChangedAt: id === "legacy-merge"
          ? "2026-09-28T18:00:00Z" : "2026-09-01T12:00:00Z" },
      })),
      work("future", "2026-09-29T18:30:00Z"),
    ];
    const units = rows.map(row => ({
      id: row.id, identityKey: row.id, factsDigest: "new-metadata", revision: 7
    }));
    const previous = [{
      identityKey: rows[0].id, day: "2026-08-04", payload: rows[0],
      factsDigest: "old-metadata", workUnitRevision: 6,
    }, {
      identityKey: "changed-pr", day: "2026-09-28",
      payload: work("changed-pr", "2026-09-28T12:00:00Z"),
    }, ...["legacy-merge", "status-hydration"].map(id => ({
      identityKey: id, day: "2026-09-27", payload: work(id, "2026-09-27T12:00:00Z"),
    }))];
    const issue = { id: "late-issue", activityAt: "2026-09-28T18:29:59Z", repository: { key: "1" } };
    const writes = [];
    const query = result => {
      const chain = {
        where: () => chain, orderBy: () => chain, innerJoin: () => chain,
        then: resolve => resolve(result),
      };
      return chain;
    };
    const transaction = {
      select: () => ({ from: table => query(table === githubPublicFeedHead
        ? [{ initialized: new Date("2026-09-27") }] : table === githubWorkUnits ? units : []) }),
      selectDistinctOn: () => ({ from: () => query(previous) }),
      execute: async sql => {
        const cleanup = new PgDialect().sqlToQuery(sql);
        assert.ok(cleanup.sql.includes("s.day between $1::date and $2::date"));
        assert.deepEqual(cleanup.params, ["2026-09-28", "2026-09-29", '["1"]', '["2"]']);
        return { rows: [] };
      },
      insert: table => ({ values: value => ({ onConflictDoUpdate: options => ({ returning: async () => {
        assert.equal(table, githubActivitySnapshots);
        const condition = new PgDialect().sqlToQuery(options.setWhere);
        assert.deepEqual(condition.params, ["2026-09-28", value.payload.activityAt]);
        assert.ok(condition.sql.includes('"github_activity_snapshots"."day" >= $1'));
        assert.ok(condition.sql.includes("::timestamptz <= $2::timestamptz"));
        writes.push(value);
        return [];
      } }) }) }),
    };
    mock.module("./src/db/client.ts", () => ({ getDatabase: () => ({ transaction: callback => callback(transaction) }) }));
    mock.module("./src/lib/github-work-unit-projection-state.ts", () => ({ acquireGitHubWorkUnitProjectionLock: async () => {} }));
    mock.module("./src/lib/github-activity-store.ts", () => ({ readCurrentPublicGitHubRows: async () => ({ workUnits: rows, issues: [issue] }) }));
    const { publishGitHubActivitySnapshots } = await import("./src/lib/github-activity-snapshots.ts");
    await publishGitHubActivitySnapshots(["1"], ["2"]);
    assert.deepEqual(writes.map(row => [row.identityKey, row.day, row.payload.activityAt]), [
      ["late", "2026-09-28", "2026-09-28T18:29:59Z"],
      ["changed-pr", "2026-09-29", "2026-09-28T18:30:00Z"],
      ["legacy-merge", "2026-09-28", "2026-09-28T18:00:00Z"],
      ["late-issue", "2026-09-28", "2026-09-28T18:29:59Z"],
    ]);
    assert.equal(writes[1].payload.facts.additions, 240);
  `);
});

test("every worker publishes and warms changed activity without changing ingestion limits or auth", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const calls = [];
    const events = [];
    const callbacks = [];
    let changed = false;
    let fail = false;
    mock.module("next/cache", () => ({ revalidateTag: (...args) => events.push(args) }));
    mock.module("next/server", () => ({ after: callback => callbacks.push(callback) }));
    mock.module("./src/lib/github-activity-feed.ts", () => ({ getInitialGitHubActivity: async () => { events.push("warmed"); } }));
    mock.module("./src/lib/operational-error.ts", () => ({ reportOperationalError: () => "Error" }));
    mock.module("./src/env.ts", () => ({ env: { CRON_SECRET: "hourly-publication-test-secret-32-characters" } }));
    mock.module("./src/lib/github-activity-worker.ts", () => ({
      runGitHubActivityWorker: async options => {
        if (fail) throw new Error("Publication failed");
        calls.push(options);
        return { projection: options.includeProjection ? { feedRevisionChanged: changed } : null };
      }
    }));
    const { POST } = await import("./src/app/api/cron/github-worker/route.ts");
    const request = (query, authorized = true) => POST(new Request(
      "https://example.com/api/cron/github-worker" + query,
      { method: "POST", headers: authorized ? { authorization: "Bearer hourly-publication-test-secret-32-characters" } : {} }
    ));
    assert.equal((await request("?publish=1", false)).status, 401);
    for (const query of ["?batch=0", "?batch=no", "?batch="]) {
      assert.equal((await request(query)).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await request("")).status, 200);
    assert.equal((await request("?publish=1")).status, 200);
    assert.equal((await request("?publish=1&batch=2")).status, 200);
    assert.equal(calls[0].includeProjection, true);
    assert.equal(calls[1].includeProjection, true);
    assert.deepEqual({ ...calls[0], includeProjection: true }, calls[1]);
    assert.equal(calls[2].includeProjection, true);
    assert.equal(calls[2].commitLimit, 2);
    assert.equal(calls[2].refLimit, 1);
    assert.deepEqual(events, []);
    assert.equal(callbacks.length, 0);
    changed = true;
    assert.equal((await request("?publish=1")).status, 200);
    assert.deepEqual(events, [["public-github-activity", { expire: 0 }]]);
    assert.equal(callbacks.length, 1);
    await callbacks.shift()();
    assert.deepEqual(events, [["public-github-activity", { expire: 0 }], "warmed"]);
    events.length = 0;
    fail = true;
    assert.equal((await request("?publish=1")).status, 503);
    assert.deepEqual(events, []);
    assert.equal(callbacks.length, 0);
  `);
});

test("Codex sync warms the public cache after a successful change, never after a failed or unchanged sync", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const events = [];
    const callbacks = [];
    let fail = false;
    let updated = 2;
    mock.module("next/cache", () => ({ revalidateTag: (...args) => events.push(args) }));
    mock.module("next/server", () => ({ after: callback => callbacks.push(callback) }));
    mock.module("./src/lib/codex/public-stats.ts", () => ({ getPublicCodexStats: async () => { events.push("warmed"); } }));
    mock.module("./src/env.ts", () => ({ env: { CRON_SECRET: "codex-cache-test-secret-32-characters" } }));
    mock.module("./src/lib/operational-error.ts", () => ({ reportOperationalError: () => "Error" }));
    mock.module("./src/lib/codex/sync.ts", () => ({ syncCodexAccounts: async () => {
      if (fail) throw new Error("Sync failed");
      events.push("saved");
      return { updated };
    } }));
    const { POST } = await import("./src/app/api/cron/codex-stats/route.ts");
    const request = (authorized = true) => POST(new Request("https://example.com/api/cron/codex-stats", {
      method: "POST", headers: authorized ? { authorization: "Bearer codex-cache-test-secret-32-characters" } : {}
    }));
    assert.equal((await request(false)).status, 401);
    assert.deepEqual(events, []);
    assert.equal((await request()).status, 200);
    assert.deepEqual(events, ["saved", ["public-codex-stats", "max"]]);
    assert.equal(callbacks.length, 1);
    await callbacks.shift()();
    assert.deepEqual(events, ["saved", ["public-codex-stats", "max"], "warmed"]);
    events.length = 0;
    updated = 0;
    assert.equal((await request()).status, 200);
    assert.deepEqual(events, ["saved"]);
    assert.equal(callbacks.length, 0);
    events.length = 0;
    fail = true;
    assert.equal((await request()).status, 503);
    assert.deepEqual(events, []);
    assert.equal(callbacks.length, 0);
  `);
});

test("public reads retain successful snapshots on outage and recover without caching failures", () => {
  check(`
    import assert from "node:assert/strict";
    import { AsyncLocalStorage } from "node:async_hooks";
    import { mock } from "bun:test";
    Object.assign(globalThis, { AsyncLocalStorage });
    mock.module("server-only", () => ({}));
    mock.module("./src/lib/operational-error.ts", () => ({ reportOperationalError: () => {} }));
    const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
    let unavailable = true;
    let version = 1;
    let reads = 0;
    const read = async () => {
      reads++;
      if (unavailable) throw new Error("Database unavailable");
      return { version };
    };
    mock.module("./src/lib/github-activity-store.ts", () => ({
      PUBLIC_GITHUB_ACTIVITY_DAY_PAGE_SIZE: 7,
      readPublicGitHubActivityPage: read,
      readPublicGitHubActivityHead: read,
    }));
    mock.module("./src/db/client.ts", () => ({
      isDatabaseConfigured: () => true,
      getDatabase: () => ({ select: () => {
        const query = { from: () => query, where: () => query, orderBy: () => query,
          then: (resolve, reject) => read().then(() => []).then(resolve, reject) };
        return query;
      } }),
    }));
    mock.module("./src/lib/codex/stats.ts", () => ({ buildPublicCodexStats: () => ({ version }) }));
    const { getInitialGitHubActivity } = await import("./src/lib/github-activity-feed.ts");
    const { getPublicCodexStats } = await import("./src/lib/codex/public-stats.ts");
    const entries = new Map();
    let stale = false;
    const incrementalCache = {
      generateSimpleCacheKey: async key => {
        if (key.includes("public-github-activity-initial-")) {
          // A persistent cache from the previous deployment must never reach the new UI.
          entries.set(key.replace(/initial-v[0-9]+/, "initial-v3"), {
            kind: "FETCH", revalidate: 60,
            data: { headers: {}, status: 200, url: "", body: '{"version":"old-issue-format"}' },
          });
        }
        return key;
      },
      get: async key => entries.has(key) ? { value: entries.get(key), isStale: stale } : null,
      set: async (key, value) => { entries.set(key, value); },
    };
    const request = async () => {
      const store = { incrementalCache, forceDynamic: true, pendingRevalidates: {} };
      const result = await workAsyncStorage.run(store, () => Promise.all([
        getInitialGitHubActivity(), getPublicCodexStats()
      ]));
      await Promise.all(Object.values(store.pendingRevalidates));
      return result;
    };
    assert.deepEqual(await request(), [null, null]);
    assert.equal(entries.size, 1);
    unavailable = false;
    assert.deepEqual(await request(), [{ version: 1 }, { version: 1 }]);
    const afterFill = reads;
    assert.deepEqual(await request(), [{ version: 1 }, { version: 1 }]);
    assert.equal(reads, afterFill);
    stale = true;
    unavailable = true;
    const errors = [];
    console.error = (...args) => errors.push(args);
    assert.deepEqual(await request(), [{ version: 1 }, { version: 1 }]);
    assert.equal(errors.length, 3);
    assert.equal(entries.size, 4);
    unavailable = false;
    version = 2;
    assert.deepEqual(await request(), [{ version: 1 }, { version: 1 }]);
    stale = false;
    assert.deepEqual(await request(), [{ version: 2 }, { version: 2 }]);
  `);
});

test("live refresh retries a stale page on the next successful poll and stops once caught up", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const React = await import("react");
    const ReactQuery = await import("@tanstack/react-query");
    let refreshes = 0;
    let previousDependencies;
    const context = {
      feedRevision: "7", isRefreshing: false, latestAvailable: false,
      refreshCompletion: 0, markLatestAvailable: () => {},
      refreshLatest: () => { refreshes++; },
    };
    const head = { feedRevision: "8", revision: "9", lastPublishedAt: null, summarizing: false };
    const query = { data: head, dataUpdatedAt: 1 };
    const ref = { current: "7" };
    mock.module("react", () => ({
      ...React,
      use: () => context,
      useRef: () => ref,
      useEffect: (effect, dependencies) => {
        if (!previousDependencies || dependencies.some((value, index) => !Object.is(value, previousDependencies[index]))) effect();
        previousDependencies = dependencies;
      },
    }));
    mock.module("@tanstack/react-query", () => ({ ...ReactQuery, useQuery: () => query }));
    const { GitHubActivityStatus } = await import("./src/components/github-activity-status.tsx");
    const render = () => GitHubActivityStatus({ initialHead: { ...head, feedRevision: "7" } });
    render();
    assert.equal(refreshes, 1);
    render();
    assert.equal(refreshes, 1);
    query.dataUpdatedAt++;
    render();
    assert.equal(refreshes, 2);
    context.feedRevision = "8";
    query.dataUpdatedAt++;
    render();
    assert.equal(refreshes, 2);
    const { renderToStaticMarkup } = await import("react-dom/server");
    let markup = renderToStaticMarkup(render());
    assert.match(markup, /visibility:hidden/);
    context.latestAvailable = true;
    context.isRefreshing = true;
    markup = renderToStaticMarkup(render());
    assert.match(markup, /visibility:visible/);
    assert.match(markup, /disabled=""/);
    assert.match(markup, /Refreshing…/);
    context.isRefreshing = false;
    markup = renderToStaticMarkup(render());
    assert.match(markup, /Refresh work/);
    assert.doesNotMatch(markup, /disabled=""/);
  `);
});

test("repeated connection refusals keep a bounded reconnect delay", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    mock.module("./src/env.ts", () => ({
      env: { DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unavailable" }
    }));
    const { getDatabase, closeDatabase } = await import("./src/db/client.ts");
    const start = performance.now();
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        await assert.rejects(getDatabase().execute("select 1"));
      }
      assert.ok(performance.now() - start < 12000);
    } finally {
      await closeDatabase();
    }
  `);
}, 15_000);
