import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { TimelineEdition } from "@/lib/timeline-core";

export const timelineVisibility = pgEnum("timeline_visibility", [
  "public",
  "private",
]);

export const timelineEditionStatus = pgEnum("timeline_edition_status", [
  "draft",
  "published",
  "rejected",
]);

export const timelineSyncStatus = pgEnum("timeline_sync_status", [
  "running",
  "completed",
  "failed",
]);

export const timelinePublicEventKinds = [
  "issue_opened",
  "pull_request_opened",
  "pull_request_reviewed",
  "repository_created",
] as const;

export type TimelinePublicEventKind = (typeof timelinePublicEventKinds)[number];

export const timelinePublicEventKind = pgEnum(
  "timeline_public_event_kind",
  timelinePublicEventKinds
);

export const timelineActivityDays = pgTable(
  "timeline_activity_days",
  {
    bucket: varchar("bucket", { length: 32 }).notNull(),
    commitCount: integer("commit_count").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
    languageFamily: varchar("language_family", { length: 32 }).notNull(),
    privacyDomainKey: varchar("privacy_domain_key", { length: 64 }),
    privacyPolicyVersion: varchar("privacy_policy_version", { length: 64 }),
    publicRepoName: varchar("public_repo_name", { length: 200 }),
    publicRepoUrl: text("public_repo_url"),
    reachedDefaultBranch: boolean("reached_default_branch")
      .default(true)
      .notNull(),
    repoKey: varchar("repo_key", { length: 64 }).notNull(),
    source: varchar("source", { length: 32 })
      .default("github-profile")
      .notNull(),
    subject: varchar("subject", { length: 39 }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    visibility: timelineVisibility("visibility").notNull(),
  },
  (table) => [
    index("timeline_activity_day_idx").on(table.subject, table.day),
    index("timeline_activity_visibility_idx").on(
      table.subject,
      table.visibility,
      table.day
    ),
    uniqueIndex("timeline_activity_repo_day_source_idx").on(
      table.subject,
      table.repoKey,
      table.day,
      table.source
    ),
    check("timeline_activity_positive_count", sql`${table.commitCount} > 0`),
    check(
      "timeline_activity_visibility_boundary",
      sql`(
        ${table.visibility} = 'private'
        AND ${table.publicRepoName} IS NULL
        AND ${table.publicRepoUrl} IS NULL
        AND ${table.privacyPolicyVersion} IS NOT NULL
      ) OR (
        ${table.visibility} = 'public'
        AND ${table.publicRepoName} IS NOT NULL
        AND ${table.publicRepoUrl} IS NOT NULL
        AND ${table.privacyDomainKey} IS NULL
        AND ${table.privacyPolicyVersion} IS NULL
      )`
    ),
  ]
);

export const timelineContributionTotals = pgTable(
  "timeline_contribution_totals",
  {
    contributionCount: integer("contribution_count").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
    source: varchar("source", { length: 32 })
      .default("github-public-calendar")
      .notNull(),
    subject: varchar("subject", { length: 39 }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("timeline_contribution_total_day_idx").on(table.subject, table.day),
    uniqueIndex("timeline_contribution_total_day_source_idx").on(
      table.subject,
      table.day,
      table.source
    ),
    check(
      "timeline_contribution_total_nonnegative_count",
      sql`${table.contributionCount} >= 0`
    ),
    check(
      "timeline_contribution_total_identity_shape",
      sql`${table.id} ~ '^[a-f0-9]{64}$'
        AND ${table.subject} ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
        AND ${table.subject} !~ '--'
        AND ${table.subject} !~ '-$'
        AND ${table.source} = 'github-public-calendar'`
    ),
  ]
);

export const timelinePublicEvents = pgTable(
  "timeline_public_events",
  {
    bucket: varchar("bucket", { length: 32 }).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    eventKind: timelinePublicEventKind("event_kind").notNull(),
    id: varchar("id", { length: 64 }).primaryKey(),
    publicRepoName: varchar("public_repo_name", { length: 200 }).notNull(),
    publicRepoUrl: text("public_repo_url").notNull(),
    publicTitle: varchar("public_title", { length: 300 }).notNull(),
    publicUrl: text("public_url").notNull(),
    repoKey: varchar("repo_key", { length: 64 }).notNull(),
    source: varchar("source", { length: 32 })
      .default("github-profile")
      .notNull(),
    subject: varchar("subject", { length: 39 }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("timeline_public_event_day_idx").on(table.subject, table.day),
    index("timeline_public_event_repo_day_idx").on(
      table.subject,
      table.repoKey,
      table.day
    ),
    index("timeline_public_event_kind_day_idx").on(
      table.subject,
      table.eventKind,
      table.day
    ),
    check(
      "timeline_public_event_identity_shape",
      sql`${table.id} ~ '^[a-f0-9]{64}$'
        AND ${table.repoKey} ~ '^[a-f0-9]{64}$'
        AND ${table.subject} ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
        AND ${table.subject} !~ '--'
        AND ${table.subject} !~ '-$'
        AND ${table.publicRepoName} ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9._-]{1,100}$'`
    ),
    check(
      "timeline_public_event_public_boundary",
      sql`${table.publicRepoUrl} = 'https://github.com/' || ${table.publicRepoName}
        AND length(${table.publicUrl}) <= 500
        AND ${table.publicTitle} = btrim(${table.publicTitle})
        AND length(${table.publicTitle}) > 0
        AND ${table.publicTitle} !~ '[[:cntrl:]]'
        AND (
          (${table.eventKind} = 'issue_opened'
            AND substring(${table.publicUrl} from length(${table.publicRepoUrl}) + 1) ~ '^/issues/[0-9]+$')
          OR (${table.eventKind} IN ('pull_request_opened', 'pull_request_reviewed')
            AND substring(${table.publicUrl} from length(${table.publicRepoUrl}) + 1) ~ '^/pull/[0-9]+$')
          OR (${table.eventKind} = 'repository_created'
            AND ${table.publicUrl} = ${table.publicRepoUrl})
        )`
    ),
    check(
      "timeline_public_event_bucket_boundary",
      sql`${table.bucket} IN (
        'Applied AI',
        'Open source',
        'Product systems',
        'Infrastructure',
        'Writing'
      )`
    ),
    check(
      "timeline_public_event_source_boundary",
      sql`${table.source} = 'github-profile'`
    ),
  ]
);

export const timelineEditions = pgTable(
  "timeline_editions",
  {
    agentModel: varchar("agent_model", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    edition: jsonb("edition").$type<TimelineEdition>().notNull(),
    editionKey: varchar("edition_key", { length: 64 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }),
    privacyPolicyVersion: varchar("privacy_policy_version", { length: 64 }),
    status: timelineEditionStatus("status").default("draft").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    windowEnd: date("window_end", { mode: "string" }).notNull(),
    windowStart: date("window_start", { mode: "string" }).notNull(),
  },
  (table) => [
    uniqueIndex("timeline_edition_key_idx").on(table.editionKey),
    index("timeline_edition_published_idx").on(table.status, table.publishedAt),
  ]
);

export const timelineSyncRuns = pgTable(
  "timeline_sync_runs",
  {
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    coverage: varchar("coverage", { length: 16 }).default("partial").notNull(),
    errorCode: varchar("error_code", { length: 64 }),
    eventCount: integer("event_count").default(0).notNull(),
    anonymousDayCount: integer("anonymous_day_count").default(0).notNull(),
    anonymousCoverage: varchar("anonymous_coverage", { length: 16 })
      .default("unavailable")
      .notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    fullWindow: boolean("full_window").default(false).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    publicEventCoverage: varchar("public_event_coverage", { length: 16 })
      .default("unavailable")
      .notNull(),
    rowCount: integer("row_count").default(0).notNull(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    status: timelineSyncStatus("status").default("running").notNull(),
    windowEnd: date("window_end", { mode: "string" }).notNull(),
    windowStart: date("window_start", { mode: "string" }).notNull(),
  },
  (table) => [index("timeline_sync_started_idx").on(table.startedAt)]
);

export const timelineWebhookReceipts = pgTable(
  "timeline_webhook_receipts",
  {
    deliveryKey: varchar("delivery_key", { length: 64 }).primaryKey(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    processedAt: timestamp("processed_at", {
      mode: "date",
      withTimezone: true,
    }),
    receivedAt: timestamp("received_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    status: varchar("status", { length: 24 }).notNull(),
  },
  (table) => [index("timeline_webhook_expiry_idx").on(table.expiresAt)]
);
