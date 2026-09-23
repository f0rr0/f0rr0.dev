import { expect, test } from "bun:test";

// Isolate module mocks from the PostgreSQL integration tests.
const check = (source: string) => {
  const result = Bun.spawnSync([process.execPath, "--eval", source], {
    cwd: new URL("..", import.meta.url).pathname,
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
};

test("only the hourly invocation publishes, without changing ingestion limits or auth", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const calls = [];
    mock.module("./src/env.ts", () => ({ env: { CRON_SECRET: "hourly-publication-test-secret-32-characters" } }));
    mock.module("./src/lib/github-activity-worker.ts", () => ({
      runGitHubActivityWorker: async options => { calls.push(options); return {}; }
    }));
    const { POST } = await import("./src/app/api/cron/github-worker/route.ts");
    const request = (query, authorized = true) => POST(new Request(
      "https://example.com/api/cron/github-worker" + query,
      { method: "POST", headers: authorized ? { authorization: "Bearer hourly-publication-test-secret-32-characters" } : {} }
    ));
    assert.equal((await request("?publish=1", false)).status, 401);
    for (const query of ["?publish=0", "?publish=yes", "?publish=", "?batch=0&publish=1"]) {
      assert.equal((await request(query)).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await request("")).status, 200);
    assert.equal((await request("?publish=1")).status, 200);
    assert.equal((await request("?publish=1&batch=2")).status, 200);
    assert.equal(calls[0].includeProjection, false);
    assert.equal(calls[1].includeProjection, true);
    assert.deepEqual({ ...calls[0], includeProjection: true }, calls[1]);
    assert.equal(calls[2].includeProjection, true);
    assert.equal(calls[2].commitLimit, 2);
    assert.equal(calls[2].refLimit, 1);
  `);
});

test("Codex sync expires the public cache only after a successful save", () => {
  check(`
    import assert from "node:assert/strict";
    import { mock } from "bun:test";
    const events = [];
    let fail = false;
    mock.module("next/cache", () => ({ revalidateTag: (...args) => events.push(args) }));
    mock.module("./src/env.ts", () => ({ env: { CRON_SECRET: "codex-cache-test-secret-32-characters" } }));
    mock.module("./src/lib/operational-error.ts", () => ({ reportOperationalError: () => "Error" }));
    mock.module("./src/lib/codex/sync.ts", () => ({ syncCodexAccounts: async () => {
      if (fail) throw new Error("Sync failed");
      events.push("saved");
      return { updated: 2 };
    } }));
    const { POST } = await import("./src/app/api/cron/codex-stats/route.ts");
    const request = (authorized = true) => POST(new Request("https://example.com/api/cron/codex-stats", {
      method: "POST", headers: authorized ? { authorization: "Bearer codex-cache-test-secret-32-characters" } : {}
    }));
    assert.equal((await request(false)).status, 401);
    assert.deepEqual(events, []);
    assert.equal((await request()).status, 200);
    assert.deepEqual(events, ["saved", ["public-codex-stats", { expire: 0 }]]);
    events.length = 0;
    fail = true;
    assert.equal((await request()).status, 503);
    assert.deepEqual(events, []);
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
      getDatabase: () => ({ select: () => ({ from: () => ({ where: async () => {
        await read(); return [];
      } }) }) }),
    }));
    mock.module("./src/lib/codex/stats.ts", () => ({ buildPublicCodexStats: () => ({ version }) }));
    const { getInitialGitHubActivity } = await import("./src/lib/github-activity-feed.ts");
    const { getPublicCodexStats } = await import("./src/lib/codex/public-stats.ts");
    const entries = new Map();
    let stale = false;
    const incrementalCache = {
      generateSimpleCacheKey: async key => key,
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
    assert.equal(entries.size, 0);
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
    assert.equal(errors.length, 2);
    assert.equal(entries.size, 2);
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
