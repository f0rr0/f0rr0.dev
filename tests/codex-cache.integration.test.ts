import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";

import { closeDatabase } from "../src/db/client";
import { utcOffset } from "../src/lib/codex/analytics";
import { getPublicCodexStats } from "../src/lib/codex/public-stats";
import {
  readClosedCodexHistory,
  readCodexPublicRevision,
  readCodexPublicViews,
} from "../src/lib/codex/public-stats-store";
import { createCodexAccountSnapshot } from "../src/lib/codex/stats";
import { saveCodexAccount } from "../src/lib/codex/store";
import { readPublicGitHubActivityHead } from "../src/lib/github-activity-store";

// Explicit opt-in: this test resets only the disposable local validation database.
const databaseUrl = process.env.CACHE_TEST_DATABASE_URL;
if (databaseUrl !== undefined) {
  const address = new URL(databaseUrl);
  if (
    !["127.0.0.1", "localhost"].includes(address.hostname) ||
    address.pathname !== "/cache_validation" ||
    process.env.DATABASE_URL !== databaseUrl
  ) {
    throw new Error("Use the disposable local cache_validation database only.");
  }
}
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest(
  "transactional revisions cover every writer, backfill, rollback and midnight",
  async () => {
    if (databaseUrl === undefined) {
      throw new Error("Missing validation database");
    }
    const client = new Client({ connectionString: databaseUrl });
    const writer = new Client({ connectionString: databaseUrl });
    await client.connect();
    await writer.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS codex_usage_days, codex_accounts, codex_public_revisions CASCADE;
      DROP FUNCTION IF EXISTS advance_codex_public_revision();
      CREATE TABLE codex_accounts (id varchar(64) PRIMARY KEY, enabled boolean NOT NULL DEFAULT true,
        provider_account_id varchar(200), sync_token uuid, sync_until timestamptz, snapshot jsonb, snapshot_at timestamptz);
      CREATE TABLE codex_usage_days (account_id varchar(64) REFERENCES codex_accounts(id), day date,
        payload jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id, day));`);
      await client.query(
        await readFile(
          new URL(
            "../drizzle/0029_codex_public_revisions.sql",
            import.meta.url
          ),
          "utf-8"
        )
      );
      await client.query(`CREATE TABLE IF NOT EXISTS github_public_feed_head (
        id boolean PRIMARY KEY, feed_revision bigint NOT NULL, head_content_revision bigint NOT NULL,
        ordering_revision bigint NOT NULL, last_published_at timestamptz, summarizing boolean NOT NULL);
        INSERT INTO github_public_feed_head VALUES (true,1,1,1,now(),false)
        ON CONFLICT(id) DO UPDATE SET feed_revision=1,head_content_revision=1,ordering_revision=1;`);
      const previousHead = await readPublicGitHubActivityHead();
      await client.query(
        "UPDATE github_public_feed_head SET ordering_revision=2 WHERE id=true"
      );
      const orderedHead = await readPublicGitHubActivityHead();
      expect(orderedHead.head.feedRevision).toBe(
        previousHead.head.feedRevision
      );
      expect(orderedHead.head.revision).toBe(previousHead.head.revision);
      expect(orderedHead.head.orderingRevision).toBe("2");
      expect(orderedHead.etag).not.toBe(previousHead.etag);
      const today = "2026-10-01";
      const snapshot = createCodexAccountSnapshot(
        { stats: { lifetime_tokens: 100, daily_usage_buckets: [] } },
        {}
      );
      const payload = (day: string, tokens: number) => ({
        dailyUsageBuckets: [{ startDate: day, tokens }],
        cumulativeDailyUsageBuckets: null,
        analytics: {},
      });
      const insert = async (day: string, tokens: number) =>
        await client.query(
          "INSERT INTO codex_usage_days VALUES ('one', $1, $2, now())",
          [day, payload(day, tokens)]
        );
      expect(await readCodexPublicRevision(today)).toEqual({
        historyRevision: "0",
        viewsRevision: "0",
      });
      await client.query(
        "INSERT INTO codex_accounts (id,snapshot,snapshot_at) VALUES ('one',$1,now())",
        [snapshot]
      );
      await insert("2026-09-28", 10);
      await insert("2026-09-30", 20);
      const initial = await readCodexPublicRevision(today);
      expect(initial).toEqual({ historyRevision: "1", viewsRevision: "3" });
      const closed = await readClosedCodexHistory(today);
      expect(closed.rows).toHaveLength(1);
      await client.query(
        "UPDATE codex_accounts SET sync_until=now(), provider_account_id='provider', snapshot_at=now(); UPDATE codex_usage_days SET recorded_at=now();"
      );
      expect(await readCodexPublicRevision(today)).toEqual(initial);
      // Missing closed days must change the history key without an HTTP invalidation.
      await insert("2026-09-29", 30);
      const backfilled = await readCodexPublicViews(today, closed);
      expect(
        (
          await readCodexPublicViews(today, {
            ...closed,
            today: utcOffset(today, -1),
            historyRevision: backfilled.historyRevision,
            rows: [],
          })
        ).views
      ).toEqual(backfilled.views);
      expect(backfilled.historyRevision).toBe("2");
      expect(backfilled.views.stats?.totals.last7Days.value).toBe(60);
      expect(
        backfilled.views.stats?.history.values.find(
          (row) => row.day === "2026-09-29"
        )?.tokens
      ).toBe(30);
      for (const range of [7, 30, 365]) {
        expect(backfilled.views.details[range]?.accountCount).toBe(1);
      }
      // Transaction rollback must roll back both data and revision.
      const beforeRollback = await readCodexPublicRevision(today);
      await writer.query("BEGIN");
      await writer.query(
        "UPDATE codex_usage_days SET payload=$1 WHERE day='2026-09-28'",
        [payload("2026-09-28", 999)]
      );
      expect(await readCodexPublicRevision(today)).toEqual(beforeRollback);
      await writer.query("ROLLBACK");
      expect(await readCodexPublicRevision(today)).toEqual(beforeRollback);
      // A write that commits after the day becomes closed still invalidates that day's key.
      const nextDay = "2026-10-02";
      const beforeMidnight = await readClosedCodexHistory(nextDay);
      await writer.query("BEGIN");
      await writer.query(
        "UPDATE codex_usage_days SET payload=$1 WHERE day='2026-09-30'",
        [payload("2026-09-30", 25)]
      );
      expect(await readClosedCodexHistory(nextDay)).toEqual(beforeMidnight);
      await writer.query("COMMIT");
      const afterMidnight = await readCodexPublicViews(nextDay, beforeMidnight);
      expect(afterMidnight.historyRevision).not.toBe(
        beforeMidnight.historyRevision
      );
      expect(afterMidnight.views.stats?.totals.last7Days.value).toBe(65);
      const beforeDelete = await readCodexPublicRevision(today);
      await client.query("DELETE FROM codex_usage_days WHERE day='2026-09-29'");
      await insert("2026-09-29", 0);
      expect(
        Number((await readCodexPublicRevision(today)).historyRevision)
      ).toBe(Number(beforeDelete.historyRevision) + 2);
      expect(
        (
          await readCodexPublicViews(today, closed)
        ).views.stats?.history.values.find((row) => row.day === "2026-09-29")
          ?.tokens
      ).toBe(0);
      await client.query(
        "UPDATE codex_accounts SET enabled=false WHERE id='one'"
      );
      expect((await readCodexPublicViews(today)).views.stats?.limits).toEqual(
        []
      );
      await client.query("INSERT INTO codex_accounts(id) VALUES ('missing')");
      expect(
        (await readCodexPublicViews(today)).views.stats?.totals.lifetimeTokens
          .partial
      ).toBe(true);
      await client.query("DELETE FROM codex_accounts WHERE id='missing'");
      // Concurrent writers serialize revisions without losing increments.
      const beforeConcurrent = await readCodexPublicRevision(today);
      await Promise.all([
        client.query(
          "UPDATE codex_usage_days SET payload=$1 WHERE day='2026-09-28'",
          [payload("2026-09-28", 11)]
        ),
        writer.query(
          "UPDATE codex_usage_days SET payload=$1 WHERE day='2026-09-30'",
          [payload("2026-09-30", 26)]
        ),
      ]);
      const afterConcurrent = await readCodexPublicRevision(today);
      expect(Number(afterConcurrent.viewsRevision)).toBe(
        Number(beforeConcurrent.viewsRevision) + 2
      );
      expect(Number(afterConcurrent.historyRevision)).toBe(
        Number(beforeConcurrent.historyRevision) + 1
      );
      const latest = await readCodexPublicViews(today, closed);
      expect(latest.views.stats?.totals.last7Days.value).toBe(37);
      // Exercise the actual save path: leases, closed-day immutability and concurrent accounts.
      const saveToday = new Date().toISOString().slice(0, 10);
      const firstToken = randomUUID();
      const secondToken = randomUUID();
      await client.query(
        "UPDATE codex_accounts SET enabled=true,sync_token=$1,sync_until=now()+interval '5 minutes' WHERE id='one'",
        [firstToken]
      );
      await client.query(
        "INSERT INTO codex_accounts(id,sync_token,sync_until) VALUES ('two',$1,now()+interval '5 minutes')",
        [secondToken]
      );
      const accountSnapshot = (
        buckets: { start_date: string; tokens: number }[]
      ) =>
        createCodexAccountSnapshot(
          { stats: { lifetime_tokens: 100, daily_usage_buckets: buckets } },
          {}
        );
      const closedDay = utcOffset(saveToday, -3);
      const recentDay = utcOffset(saveToday, -1);
      const backfillDay = utcOffset(saveToday, -5);
      // These rows are outside the mutable window before saving.
      await client.query(
        "INSERT INTO codex_usage_days VALUES ('one',$1,$2,now()) ON CONFLICT(account_id,day) DO UPDATE SET payload=EXCLUDED.payload",
        [closedDay, payload(closedDay, 11)]
      );
      await Promise.all([
        saveCodexAccount(
          { id: "one", authJson: "", syncToken: firstToken },
          "",
          accountSnapshot([
            { start_date: closedDay, tokens: 9999 },
            { start_date: backfillDay, tokens: 5 },
            { start_date: recentDay, tokens: 77 },
            { start_date: saveToday, tokens: 88 },
          ])
        ),
        saveCodexAccount(
          { id: "two", authJson: "", syncToken: secondToken },
          "",
          accountSnapshot([
            { start_date: closedDay, tokens: 0 },
            { start_date: recentDay, tokens: 90 },
          ])
        ),
      ]);
      const [{ payload: retained }] = (
        await client.query(
          "SELECT payload FROM codex_usage_days WHERE account_id='one' AND day=$1",
          [closedDay]
        )
      ).rows;
      expect(retained.dailyUsageBuckets[0].tokens).toBe(11);
      const [{ payload: filled }] = (
        await client.query(
          "SELECT payload FROM codex_usage_days WHERE account_id='one' AND day=$1",
          [backfillDay]
        )
      ).rows;
      expect(filled.dailyUsageBuckets[0].tokens).toBe(5);
      const saved = await readCodexPublicViews(saveToday);
      expect(
        saved.views.stats?.history.values.find((row) => row.day === recentDay)
          ?.tokens
      ).toBe(167);
      expect(saved.views.stats?.totals.todayTokens.value).toBe(88);
    } finally {
      await writer.end();
      await client.end();
      await closeDatabase();
    }
  },
  20_000
);

integrationTest(
  "native Next caches refresh backfills and preserve a warm outage snapshot",
  async () => {
    if (databaseUrl === undefined) {
      throw new Error("Missing validation database");
    }
    const { IncrementalCache } =
      await import("next/dist/server/lib/incremental-cache/index.js");
    const { nodeFs } = await import("next/dist/server/lib/node-fs-methods.js");
    const cache = new IncrementalCache({
      dev: false,
      fs: nodeFs,
      flushToDisk: false,
      maxMemoryCacheSize: 1_000_000,
      serverDistDir: "/tmp/codex-cache-validation",
      requestHeaders: {},
      getPrerenderManifest: () => ({
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: {
          previewModeId: "local-cache-test",
          previewModeSigningKey: "",
          previewModeEncryptionKey: "",
        },
      }),
    });
    Object.assign(globalThis, { __incrementalCache: cache });
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    let revisionTableRenamed = false;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await client.query(
        "DELETE FROM codex_usage_days; DELETE FROM codex_accounts;"
      );
      const snapshot = createCodexAccountSnapshot(
        { stats: { lifetime_tokens: 100, daily_usage_buckets: [] } },
        {}
      );
      await client.query(
        "INSERT INTO codex_accounts(id,snapshot,snapshot_at) VALUES ('native',$1,now())",
        [snapshot]
      );
      const insert = async (day: string, tokens: number) =>
        await client.query(
          "INSERT INTO codex_usage_days VALUES ('native',$1,$2,now())",
          [
            day,
            {
              dailyUsageBuckets: [{ startDate: day, tokens }],
              cumulativeDailyUsageBuckets: null,
              analytics: {},
            },
          ]
        );
      await insert(utcOffset(today, -2), 10);
      // Adjacent versions above Number's safe range must still choose distinct snapshots.
      await client.query(
        "UPDATE codex_public_revisions SET revision=9007199254740992 WHERE scope='views'"
      );
      const initial = await getPublicCodexStats();
      expect(initial?.totals.last7Days.value).toBe(10);
      expect(await getPublicCodexStats()).toEqual(initial);
      await insert(utcOffset(today, -3), 5);
      expect((await getPublicCodexStats())?.totals.last7Days.value).toBe(15);
      await cache.revalidateTag(["public-codex-stats", "codex-history"], {
        expire: 0,
      });
      // The real revision query fails, while Next must retain its successful fallback.
      await client.query(
        "ALTER TABLE codex_public_revisions RENAME TO cache_validation_revisions_offline"
      );
      revisionTableRenamed = true;
      expect(await getPublicCodexStats()).toEqual(initial);
      await client.query(
        "ALTER TABLE cache_validation_revisions_offline RENAME TO codex_public_revisions"
      );
      revisionTableRenamed = false;
      expect((await getPublicCodexStats())?.totals.last7Days.value).toBe(15);
      // Metadata can succeed while a cold history/body read stalls. A warm
      // snapshot must remain available in both cases, not just metadata outages.
      for (const tag of ["codex-history", "public-codex-stats"]) {
        await cache.revalidateTag([tag], { expire: 0 });
        await client.query(
          "BEGIN; LOCK TABLE codex_usage_days IN ACCESS EXCLUSIVE MODE"
        );
        const pending = getPublicCodexStats();
        let result: Awaited<typeof pending> | "stalled";
        try {
          result = await Promise.race([
            pending,
            Bun.sleep(1800).then(() => "stalled" as const),
          ]);
        } finally {
          await client.query("ROLLBACK");
          await pending;
        }
        expect(result).not.toBe("stalled");
        expect(result).toEqual(initial);
        expect((await getPublicCodexStats())?.totals.last7Days.value).toBe(15);
      }
    } finally {
      if (revisionTableRenamed) {
        await client.query(
          "ALTER TABLE cache_validation_revisions_offline RENAME TO codex_public_revisions"
        );
      }
      await client.end();
      await closeDatabase();
      Reflect.deleteProperty(globalThis, "__incrementalCache");
    }
  },
  20_000
);

afterAll(async () => {
  if (databaseUrl !== undefined) {
    await closeDatabase();
  }
});
