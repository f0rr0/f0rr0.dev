import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { Client } from "pg";

import { closeDatabase, getDatabase } from "../src/db/client";
import { getInitialGitHubActivity as read } from "../src/lib/github-activity-feed";
import { readPublicGitHubActivityHead } from "../src/lib/github-activity-store";
import type { PublicGitHubActivityPage } from "../src/lib/github-activity-types";
import {
  upsertGitHubRepositoryInventory,
  upsertGitHubRepositories,
} from "../src/lib/github-repository-store";

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
  "revision content caching preserves status, visibility and outage behavior",
  async () => {
    const realDateNow = Date.now;
    let offset = 0;
    Date.now = () => realDateNow() + offset;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    let bodyReads = 0;
    let afterHeadRead: (() => Promise<void>) | null = null;
    const pool = getDatabase().$client;
    pool.on("connect", (connection) => {
      connection.query = new Proxy(connection.query.bind(connection), {
        apply(target, receiver, args) {
          const [config] = args as [string | { text?: string }];
          const text =
            typeof config === "string" ? config : (config.text ?? "");
          if (text.includes('select "github_activity_snapshots"."payload"')) {
            bodyReads++;
          }
          if (
            afterHeadRead !== null &&
            text.includes('from "github_public_feed_head"')
          ) {
            const publish = afterHeadRead;
            afterHeadRead = null;
            const deliver = args.at(-1) as (
              error: unknown,
              rows?: unknown
            ) => void;
            args[args.length - 1] = async (error: unknown, rows: unknown) => {
              if (error !== null) {
                deliver(error);
                return;
              }
              try {
                await publish();
              } catch (error) {
                deliver(error);
                return;
              }
              deliver(null, rows);
            };
          }
          return Reflect.apply(target, receiver, args);
        },
      });
    });
    const group = (page: PublicGitHubActivityPage | null) => {
      if (page === null) {
        throw new Error("Missing activity page");
      }
      return page.days[0].repositories[0];
    };
    const repository = (visibility: "public" | "private" | "internal") => ({
      id: "1",
      fullName: "example/cache-investigation",
      defaultBranch: "main",
      htmlUrl: "https://github.com/example/cache-investigation",
      ownerId: "2",
      ownerLogin: "example",
      ownerType: "User" as const,
      ownerAvatarUrl: null,
      pushedAt: null,
      visibility,
      topics: [],
      description: null,
      homepageUrl: null,
    });
    let observedAt = new Date("2026-10-01T00:00:00Z");
    const save = async (
      visibility: "public" | "private" | "internal",
      inventory = true
    ) => {
      observedAt = new Date(observedAt.getTime() + 1000);
      await getDatabase().transaction(async (tx) => {
        await (inventory
          ? upsertGitHubRepositoryInventory(
              tx,
              [repository(visibility)],
              observedAt
            )
          : upsertGitHubRepositories(tx, [repository(visibility)], observedAt));
      });
    };
    try {
      await client.query(
        "DROP TABLE IF EXISTS github_activity_snapshots, github_repositories, github_public_feed_head CASCADE; DROP FUNCTION IF EXISTS advance_github_repository_visibility_revision();"
      );
      const schema = JSON.parse(
        await readFile(
          new URL("../drizzle/meta/0030_snapshot.json", import.meta.url),
          "utf-8"
        )
      ) as {
        tables: Record<
          string,
          {
            columns: Record<
              string,
              {
                name: string;
                type: string;
                notNull: boolean;
                default?: string | number | boolean;
                primaryKey: boolean;
              }
            >;
            compositePrimaryKeys: Record<string, { columns: string[] }>;
            checkConstraints: Record<string, { value: string }>;
          }
        >;
      };
      for (const name of [
        "github_repositories",
        "github_activity_snapshots",
        "github_public_feed_head",
      ]) {
        const table = schema.tables[`public.${name}`];
        const columns = Object.values(table.columns).map(
          (c) =>
            `"${c.name}" ${c.type}${c.notNull ? " NOT NULL" : ""}${c.default === undefined ? "" : ` DEFAULT ${c.default}`}${c.primaryKey ? " PRIMARY KEY" : ""}`
        );
        for (const pk of Object.values(table.compositePrimaryKeys)) {
          columns.push(
            `PRIMARY KEY (${pk.columns.map((c: string) => `"${c}"`).join(",")})`
          );
        }
        for (const check of Object.values(table.checkConstraints)) {
          columns.push(`CHECK (${check.value})`);
        }
        await client.query(`CREATE TABLE "${name}" (${columns.join(",")})`);
      }
      await client.query(
        "INSERT INTO github_public_feed_head(id,feed_revision,head_content_revision,ordering_revision,last_published_at) VALUES(true,100,200,100,now())"
      );
      await save("public");
      for (let day = 26; day <= 30; day++) {
        for (let index = 0; index < 3; index++) {
          const date = `2026-09-${day}`;
          const payload = {
            id: `${date}:item-${index}`,
            day: date,
            activityAt: `${date}T12:00:00Z`,
            repository: {
              key: "1",
              label: "example/cache-investigation",
              url: "https://github.com/example/cache-investigation",
              avatarUrl: null,
            },
            destination: {
              url: "https://github.com/example/cache-investigation/pull/1",
              kind: "pull-request",
            },
            headline: `Saved activity ${index}`,
            summary: "Measured cached activity. ".repeat(80),
            kind: "pull-request",
            summarizing: false,
            facts: {
              additions: 10,
              deletions: 2,
              uniqueFileCount: 1,
              ownedCommitCount: 1,
              languages: ["TypeScript"],
              dateRange: null,
            },
            pullRequest: {
              title: "Saved pull request",
              status: "open",
              statusChangedAt: `${date}T12:00:00Z`,
              diff: { additions: 10, deletions: 2, files: 1 },
            },
          };
          await client.query(
            "INSERT INTO github_activity_snapshots(day,identity_key,repository_id,payload) VALUES($1,$2,'1',$3)",
            [date, `item-${index}`, payload]
          );
        }
      }
      await client.query(
        await readFile(
          new URL(
            "../drizzle/0030_github_repository_visibility_revision.sql",
            import.meta.url
          ),
          "utf-8"
        )
      );
      const first = await read();
      if (first === null) {
        throw new Error("Missing initial activity");
      }
      expect(first.days).toHaveLength(5);
      expect(group(first).repository.label).toBe("example/cache-investigation");
      // Exercise stable revision reuse across the versioned entry's TTL.
      for (let step = 1; step <= 60; step++) {
        offset += 61_000;
        expect((await read())?.days).toEqual(first.days);
      }
      expect(bodyReads).toBe(1);
      // Status changes independently of content: refresh it without rereading the body.
      await client.query(
        "UPDATE github_public_feed_head SET head_content_revision=head_content_revision+1,summarizing=true"
      );
      const status = await read();
      const liveStatus = await readPublicGitHubActivityHead();
      expect(status?.head).toEqual(liveStatus.head);
      expect(status?.days).toEqual(first.days);
      expect(bodyReads).toBe(1);
      // A publication between the metadata read and the body snapshot must not
      // replace that body's newer head with the earlier metadata.
      for (const update of [
        "head_content_revision=head_content_revision+1,summarizing=false",
        "feed_revision=feed_revision+1,ordering_revision=ordering_revision+1,head_content_revision=head_content_revision+1",
      ]) {
        await client.query(
          "UPDATE github_public_feed_head SET feed_revision=feed_revision+1,head_content_revision=head_content_revision+1"
        );
        afterHeadRead = async () => {
          await client.query(`UPDATE github_public_feed_head SET ${update}`);
        };
        const raced = await read();
        const latestHead = await readPublicGitHubActivityHead();
        expect(raced?.head).toEqual(latestHead.head);
        expect(raced?.orderingRevision).toBe(latestHead.orderingRevision);
      }
      await save("public");
      expect(group(await read()).repository.label).toBe(
        "example/cache-investigation"
      );
      const beforeFixed = await readPublicGitHubActivityHead();
      await save("private");
      const fixed = await readPublicGitHubActivityHead();
      expect(Number(fixed.head.feedRevision)).toBe(
        Number(beforeFixed.head.feedRevision) + 1
      );
      const masked = await read();
      expect(masked?.head).toEqual(fixed.head);
      expect(masked?.orderingRevision).toBe(fixed.orderingRevision);
      expect(fixed.etag).not.toBe(beforeFixed.etag);
      expect(group(masked).repository.label).toBe("Private");
      expect(group(masked).repository.url).toBeNull();
      expect(
        group(masked).items.every((item) => item.destination === null)
      ).toBe(true);
      const beforeNoOp = await readPublicGitHubActivityHead();
      await save("private");
      expect((await readPublicGitHubActivityHead()).head.feedRevision).toBe(
        beforeNoOp.head.feedRevision
      );
      await save("public", false);
      expect(group(await read()).repository.label).toBe(
        "example/cache-investigation"
      );
      await save("internal", false);
      expect(group(await read()).repository.label).toBe("Private");
      const beforeRollback = await readPublicGitHubActivityHead();
      await client.query(
        "BEGIN; UPDATE github_repositories SET visibility='public'; ROLLBACK"
      );
      expect((await readPublicGitHubActivityHead()).head.feedRevision).toBe(
        beforeRollback.head.feedRevision
      );
      const otherRepository = {
        ...repository("public"),
        id: "2",
        fullName: "example/other-investigation",
        htmlUrl: "https://github.com/example/other-investigation",
      };
      await getDatabase().transaction(async (tx) => {
        await upsertGitHubRepositoryInventory(
          tx,
          [otherRepository],
          observedAt
        );
      });
      const [{ payload: otherPayload }] = (
        await client.query(
          "SELECT payload FROM github_activity_snapshots LIMIT 1"
        )
      ).rows;
      otherPayload.repository = {
        ...otherPayload.repository,
        key: "2",
        label: otherRepository.fullName,
        url: otherRepository.htmlUrl,
      };
      await client.query(
        "INSERT INTO github_activity_snapshots(day,identity_key,repository_id,payload) VALUES($1,'other-item','2',$2)",
        [otherPayload.day, otherPayload]
      );
      await client.query("UPDATE github_repositories SET visibility='public'");
      const secondWriter = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await secondWriter.connect();
      try {
        const beforeConcurrent = await readPublicGitHubActivityHead();
        await Promise.all([
          client.query(
            "UPDATE github_repositories SET visibility='private' WHERE id='1'"
          ),
          secondWriter.query(
            "UPDATE github_repositories SET visibility='private' WHERE id='2'"
          ),
        ]);
        expect(
          Number((await readPublicGitHubActivityHead()).head.feedRevision)
        ).toBe(Number(beforeConcurrent.head.feedRevision) + 2);
        const beforeBatch = await readPublicGitHubActivityHead();
        await client.query(
          "UPDATE github_repositories SET visibility='public'"
        );
        expect(
          Number((await readPublicGitHubActivityHead()).head.feedRevision)
        ).toBe(Number(beforeBatch.head.feedRevision) + 1);
        await client.query(
          "UPDATE github_repositories SET visibility=NULL WHERE id='2'"
        );
        expect(
          (await read())?.days
            .flatMap((day) => day.repositories)
            .some((group) => group.repository.key === "2")
        ).toBe(false);
        await client.query(
          "UPDATE github_repositories SET visibility='private' WHERE id='1'"
        );
        const beforeOldObservation = await readPublicGitHubActivityHead();
        await getDatabase().transaction(async (tx) => {
          await upsertGitHubRepositoryInventory(
            tx,
            [repository("public")],
            new Date("2026-09-30T00:00:00Z")
          );
        });
        expect((await readPublicGitHubActivityHead()).head.feedRevision).toBe(
          beforeOldObservation.head.feedRevision
        );
        expect(group(await read()).repository.label).toBe("Private");
        const beforeUnpublished = await readPublicGitHubActivityHead();
        const unpublished = {
          ...repository("public"),
          id: "3",
          fullName: "example/unpublished",
          htmlUrl: "https://github.com/example/unpublished",
        };
        await getDatabase().transaction(async (tx) => {
          await upsertGitHubRepositoryInventory(tx, [unpublished], observedAt);
        });
        await getDatabase().transaction(async (tx) => {
          await upsertGitHubRepositoryInventory(
            tx,
            [{ ...unpublished, visibility: "private" }],
            observedAt
          );
        });
        expect((await readPublicGitHubActivityHead()).head.feedRevision).toBe(
          beforeUnpublished.head.feedRevision
        );
        const beforeMissingHead = await readPublicGitHubActivityHead();
        try {
          await rejects(
            client.query(
              "BEGIN; DELETE FROM github_public_feed_head; UPDATE github_repositories SET visibility='public' WHERE id='1'"
            ),
            /The GitHub public feed head is missing/
          );
        } finally {
          await client.query("ROLLBACK");
        }
        expect((await readPublicGitHubActivityHead()).head.feedRevision).toBe(
          beforeMissingHead.head.feedRevision
        );
      } finally {
        await secondWriter.end();
      }
      {
        // The successful fallback remains available independently of versioned entry expiry.
        const lastSuccess = await read();
        offset += 61_000;
        await read();
        await client.query(
          "ALTER TABLE github_public_feed_head RENAME TO cache_investigation_head_offline"
        );
        try {
          expect(await read()).toEqual(lastSuccess);
        } finally {
          await client.query(
            "ALTER TABLE cache_investigation_head_offline RENAME TO github_public_feed_head"
          );
        }
        expect(await read()).toEqual(lastSuccess);
      }
    } finally {
      Date.now = realDateNow;
      await closeDatabase();
      await client.end();
    }
  },
  20_000
);
