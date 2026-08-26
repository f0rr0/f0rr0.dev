import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const githubCommits = pgTable(
  "github_commits",
  {
    committedAt: timestamp("committed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    message: text("message").notNull(),
    persistedAt: timestamp("persisted_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    repository: varchar("repository", { length: 200 }).notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    pushedBy: varchar("pushed_by", { length: 39 }).notNull(),
    sha: varchar("sha", { length: 40 }).notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.sha] }),
    index("github_commits_committed_at_idx").on(table.committedAt),
    index("github_commits_pushed_by_idx").on(table.pushedBy),
    check("github_commits_sha_shape", sql`${table.sha} ~ '^[a-f0-9]{40}$'`),
    check(
      "github_commits_tracked_pusher",
      sql`${table.pushedBy} IN ('f0rr0', 'yuppiestechdev')`
    ),
  ]
).enableRLS();

export const githubAccountCheckpoints = pgTable(
  "github_account_checkpoints",
  {
    account: varchar("account", { length: 39 }).primaryKey(),
    latestEventId: varchar("latest_event_id", { length: 64 }),
    lastPolledAt: timestamp("last_polled_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "github_account_checkpoints_tracked_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_account_checkpoints_event_id_shape",
      sql`${table.latestEventId} IS NULL OR ${table.latestEventId} ~ '^[0-9]{1,64}$'`
    ),
  ]
).enableRLS();
