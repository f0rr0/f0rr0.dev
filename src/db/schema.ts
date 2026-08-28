import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { PublicCommitLanguage } from "@/lib/github-activity-public-summary";

export const githubCommits = pgTable(
  "github_commits",
  {
    activityPublicId: uuid("activity_public_id"),
    additions: integer("additions"),
    author: varchar("author_login", { length: 39 }).notNull(),
    changedFiles: integer("changed_files"),
    committedAt: timestamp("committed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    deletions: integer("deletions"),
    languages: jsonb("languages").$type<readonly PublicCommitLanguage[]>(),
    message: text("message").notNull(),
    repository: varchar("repository", { length: 200 }).notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    repositoryOwnerAvatarUrl: text("repository_owner_avatar_url"),
    repositoryOwnerLogin: varchar("repository_owner_login", { length: 39 }),
    repositoryOwnerType: varchar("repository_owner_type", { length: 12 }),
    repositoryPrivate: boolean("repository_private"),
    sha: varchar("sha", { length: 40 }).notNull(),
    substantiveLoc: integer("substantive_loc"),
    summaryAttemptedAt: timestamp("summary_attempted_at", {
      mode: "date",
      withTimezone: true,
    }),
    summaryError: varchar("summary_error", { length: 80 }),
    summaryHeadline: text("summary_headline"),
    summaryInputHash: varchar("summary_input_hash", { length: 64 }),
    summaryModel: varchar("summary_model", { length: 64 }),
    summaryRecipe: varchar("summary_recipe", { length: 100 }),
    summaryShort: text("summary_short"),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.sha] }),
    uniqueIndex("github_commits_activity_public_id_unique").on(
      table.activityPublicId
    ),
    index("github_commits_activity_cursor_idx").on(
      table.committedAt,
      table.activityPublicId
    ),
    index("github_commits_committed_at_idx").on(table.committedAt),
    index("github_commits_summary_pending_idx").on(
      table.summaryAttemptedAt,
      table.committedAt
    ),
    check("github_commits_sha_shape", sql`${table.sha} ~ '^[a-f0-9]{40}$'`),
    check(
      "github_commits_tracked_author",
      sql`${table.author} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_commits_nonnegative_activity_counts",
      sql`(${table.changedFiles} IS NULL OR ${table.changedFiles} >= 0) AND (${table.additions} IS NULL OR ${table.additions} >= 0) AND (${table.deletions} IS NULL OR ${table.deletions} >= 0) AND (${table.substantiveLoc} IS NULL OR ${table.substantiveLoc} >= 0)`
    ),
    check(
      "github_commits_owner_type",
      sql`${table.repositoryOwnerType} IS NULL OR ${table.repositoryOwnerType} IN ('Organization', 'User')`
    ),
    check(
      "github_commits_summary_hash_shape",
      sql`${table.summaryInputHash} IS NULL OR ${table.summaryInputHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "github_commits_summary_pair",
      sql`(${table.summaryHeadline} IS NULL) = (${table.summaryShort} IS NULL)`
    ),
  ]
).enableRLS();

export const githubAccountCheckpoints = pgTable(
  "github_account_checkpoints",
  {
    account: varchar("account", { length: 39 }).primaryKey(),
    latestEventId: varchar("latest_event_id", { length: 64 }),
    paused: boolean("paused").default(false).notNull(),
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
