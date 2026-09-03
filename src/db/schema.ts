import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type {
  GitHubLanguageFact,
  GitHubWorkUnitFileFact,
} from "@/lib/github-change-evidence";

export const githubRepositories = pgTable(
  "github_repositories",
  {
    defaultBranch: varchar("default_branch", { length: 255 }),
    description: text("description"),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    factsVerifiedAt: timestamp("facts_verified_at", {
      mode: "date",
      withTimezone: true,
    }),
    inventoryVerifiedAt: timestamp("inventory_verified_at", {
      mode: "date",
      withTimezone: true,
    }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    homepageUrl: text("homepage_url"),
    headsLastReconciledAt: timestamp("heads_last_reconciled_at", {
      mode: "date",
      withTimezone: true,
    }),
    htmlUrl: text("html_url"),
    id: varchar("id", { length: 32 }).primaryKey(),
    lastObservedAt: timestamp("last_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    ownerAvatarUrl: text("owner_avatar_url"),
    ownerId: varchar("owner_id", { length: 32 }),
    ownerLogin: varchar("owner_login", { length: 39 }),
    ownerType: varchar("owner_type", { length: 12 }),
    pushedAt: timestamp("pushed_at", {
      mode: "date",
      withTimezone: true,
    }),
    topics: jsonb("topics").$type<readonly string[]>(),
    tagsLastReconciledAt: timestamp("tags_last_reconciled_at", {
      mode: "date",
      withTimezone: true,
    }),
    visibility: varchar("visibility", { length: 12 }),
  },
  (table) => [
    index("github_repositories_full_name_idx").on(table.fullName),
    check(
      "github_repositories_full_name",
      sql`length(btrim(${table.fullName})) > 0`
    ),
    check(
      "github_repositories_owner_type",
      sql`${table.ownerType} IS NULL OR ${table.ownerType} IN ('Organization', 'User')`
    ),
    check(
      "github_repositories_visibility",
      sql`${table.visibility} IS NULL OR ${table.visibility} IN ('public', 'private', 'internal')`
    ),
    check(
      "github_repositories_topics_array",
      sql`${table.topics} IS NULL OR jsonb_typeof(${table.topics}) = 'array'`
    ),
    check(
      "github_repositories_observation_order",
      sql`${table.lastObservedAt} >= ${table.firstObservedAt}`
    ),
  ]
).enableRLS();

export const githubCommits = pgTable(
  "github_commits",
  {
    additions: integer("additions"),
    author: varchar("author_login", { length: 39 }).notNull(),
    authoredAt: timestamp("authored_at", {
      mode: "date",
      withTimezone: true,
    }),
    authorUserId: varchar("author_user_id", { length: 32 }),
    changedFiles: integer("changed_files"),
    committedAt: timestamp("committed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    committerAt: timestamp("committer_at", {
      mode: "date",
      withTimezone: true,
    }),
    committerUserId: varchar("committer_user_id", { length: 32 }),
    deletions: integer("deletions"),
    enrichmentError: varchar("enrichment_error", { length: 80 }),
    enrichmentAttempts: integer("enrichment_attempts").default(0).notNull(),
    enrichmentLeaseToken: uuid("enrichment_lease_token"),
    // Pending rows use this as a not-before time; processing rows use it as
    // the expiry of the current ownership lease.
    enrichmentLeaseUntil: timestamp("enrichment_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    enrichmentState: varchar("enrichment_state", { length: 16 })
      .default("pending")
      .notNull(),
    fileFacts: jsonb("file_facts").$type<readonly GitHubWorkUnitFileFact[]>(),
    fileFactsDigest: varchar("file_facts_digest", {
      length: 64,
    }).generatedAlwaysAs(
      sql`CASE WHEN "file_facts" IS NULL THEN NULL ELSE encode(sha256(jsonb_send("file_facts")), 'hex') END`
    ),
    fileFactsComplete: boolean("file_facts_complete").default(false).notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    message: text("message").notNull(),
    parentShas: jsonb("parent_shas").$type<readonly string[]>(),
    providerFileCapReached: boolean("provider_file_cap_reached")
      .default(false)
      .notNull(),
    pullRequestDiscoveryError: varchar("pr_discovery_error", { length: 80 }),
    pullRequestDiscoveryAttempts: integer("pr_discovery_attempts")
      .default(0)
      .notNull(),
    pullRequestDiscoveryLeaseToken: uuid("pr_discovery_lease_token"),
    pullRequestDiscoveryLeaseUntil: timestamp("pr_discovery_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    pullRequestDiscoveryState: varchar("pr_discovery_state", { length: 16 })
      .default("pending")
      .notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    sha: varchar("sha", { length: 40 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.sha] }),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "github_commits_repository_fk",
    }),
    index("github_commits_committed_at_idx").on(table.committedAt),
    index("github_commits_enrichment_pending_idx").on(
      table.enrichmentState,
      table.enrichmentLeaseUntil,
      table.committedAt
    ),
    index("github_commits_pr_discovery_pending_idx").on(
      table.pullRequestDiscoveryState,
      table.pullRequestDiscoveryLeaseUntil,
      table.firstObservedAt
    ),
    check("github_commits_sha_shape", sql`${table.sha} ~ '^[a-f0-9]{40}$'`),
    check(
      "github_commits_parent_shas_array",
      sql`${table.parentShas} IS NULL OR jsonb_typeof(${table.parentShas}) = 'array'`
    ),
    check(
      "github_commits_file_facts_array",
      sql`${table.fileFacts} IS NULL OR jsonb_typeof(${table.fileFacts}) = 'array'`
    ),
    check(
      "github_commits_file_facts_completeness",
      sql`NOT ${table.fileFactsComplete} OR (${table.fileFacts} IS NOT NULL AND NOT ${table.providerFileCapReached})`
    ),
    check(
      "github_commits_enrichment_state",
      sql`${table.enrichmentState} IN ('pending', 'processing', 'complete', 'unavailable')`
    ),
    check(
      "github_commits_enrichment_lease",
      sql`(${table.enrichmentState} = 'processing') = (${table.enrichmentLeaseToken} IS NOT NULL) AND (${table.enrichmentState} <> 'processing' OR ${table.enrichmentLeaseUntil} IS NOT NULL) AND (${table.enrichmentState} NOT IN ('complete', 'unavailable') OR ${table.enrichmentLeaseUntil} IS NULL)`
    ),
    check(
      "github_commits_pr_discovery_state",
      sql`${table.pullRequestDiscoveryState} IN ('pending', 'processing', 'complete', 'unavailable')`
    ),
    check(
      "github_commits_pr_discovery_lease",
      sql`(${table.pullRequestDiscoveryState} = 'processing') = (${table.pullRequestDiscoveryLeaseToken} IS NOT NULL) AND (${table.pullRequestDiscoveryState} <> 'processing' OR ${table.pullRequestDiscoveryLeaseUntil} IS NOT NULL) AND (${table.pullRequestDiscoveryState} NOT IN ('complete', 'unavailable') OR ${table.pullRequestDiscoveryLeaseUntil} IS NULL)`
    ),
    check(
      "github_commits_tracked_author",
      sql`${table.author} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_commits_nonnegative_activity_counts",
      sql`(${table.changedFiles} IS NULL OR ${table.changedFiles} >= 0) AND (${table.additions} IS NULL OR ${table.additions} >= 0) AND (${table.deletions} IS NULL OR ${table.deletions} >= 0)`
    ),
    check(
      "github_commits_nonnegative_attempts",
      sql`${table.enrichmentAttempts} >= 0 AND ${table.pullRequestDiscoveryAttempts} >= 0`
    ),
  ]
).enableRLS();

export const githubAccountCheckpoints = pgTable(
  "github_account_checkpoints",
  {
    account: varchar("account", { length: 39 }).primaryKey(),
    eventsEtag: text("events_etag"),
    eventsLastAttemptedAt: timestamp("events_last_attempted_at", {
      mode: "date",
      withTimezone: true,
    }),
    eventsLastSucceededAt: timestamp("events_last_succeeded_at", {
      mode: "date",
      withTimezone: true,
    }),
    eventsNextPollAt: timestamp("events_next_poll_at", {
      mode: "date",
      withTimezone: true,
    }),
    gapDetectedAt: timestamp("gap_detected_at", {
      mode: "date",
      withTimezone: true,
    }),
    gapExpectedEventId: varchar("gap_expected_event_id", { length: 64 }),
    gapOldestAvailableEventId: varchar("gap_oldest_available_event_id", {
      length: 64,
    }),
    gapState: varchar("gap_state", { length: 12 }).default("clear").notNull(),
    latestEventId: varchar("latest_event_id", { length: 64 }),
    paused: boolean("paused").default(false).notNull(),
    pullRequestBackfillDigest: varchar("pull_request_backfill_digest", {
      length: 64,
    }),
    headRefCursorRepositoryId: varchar("head_ref_cursor_repository_id", {
      length: 32,
    }),
    headRefCycleStartedAt: timestamp("head_ref_cycle_started_at", {
      mode: "date",
      withTimezone: true,
    }),
    headRefLastAttemptedAt: timestamp("head_ref_last_attempted_at", {
      mode: "date",
      withTimezone: true,
    }),
    headRefLastSucceededAt: timestamp("head_ref_last_succeeded_at", {
      mode: "date",
      withTimezone: true,
    }),
    headRefLeaseToken: uuid("head_ref_lease_token"),
    headRefLeaseUntil: timestamp("head_ref_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    headRefNextPage: integer("head_ref_next_page"),
    headRefScanStartedAt: timestamp("head_ref_scan_started_at", {
      mode: "date",
      withTimezone: true,
    }),
    refBackfillSinceAt: timestamp("ref_backfill_since_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    tagRefCursorRepositoryId: varchar("tag_ref_cursor_repository_id", {
      length: 32,
    }),
    tagRefCycleStartedAt: timestamp("tag_ref_cycle_started_at", {
      mode: "date",
      withTimezone: true,
    }),
    tagRefLastAttemptedAt: timestamp("tag_ref_last_attempted_at", {
      mode: "date",
      withTimezone: true,
    }),
    tagRefLastSucceededAt: timestamp("tag_ref_last_succeeded_at", {
      mode: "date",
      withTimezone: true,
    }),
    tagRefLeaseToken: uuid("tag_ref_lease_token"),
    tagRefLeaseUntil: timestamp("tag_ref_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    tagRefNextPage: integer("tag_ref_next_page"),
    tagRefScanStartedAt: timestamp("tag_ref_scan_started_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      "github_account_checkpoints_tracked_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_account_checkpoints_event_id_shape",
      sql`(${table.latestEventId} IS NULL OR ${table.latestEventId} ~ '^[0-9]{1,64}$') AND (${table.gapExpectedEventId} IS NULL OR ${table.gapExpectedEventId} ~ '^[0-9]{1,64}$') AND (${table.gapOldestAvailableEventId} IS NULL OR ${table.gapOldestAvailableEventId} ~ '^[0-9]{1,64}$')`
    ),
    check(
      "github_account_checkpoints_gap_state",
      sql`${table.gapState} IN ('clear', 'detected')`
    ),
    check(
      "github_account_checkpoints_gap_details",
      sql`(${table.gapState} = 'detected' AND ${table.gapDetectedAt} IS NOT NULL) OR (${table.gapState} = 'clear' AND ${table.gapDetectedAt} IS NULL AND ${table.gapExpectedEventId} IS NULL AND ${table.gapOldestAvailableEventId} IS NULL)`
    ),
    check(
      "github_account_checkpoints_ref_cursor_shape",
      sql`(${table.headRefCursorRepositoryId} IS NULL OR ${table.headRefCursorRepositoryId} ~ '^[0-9]{1,32}$') AND (${table.tagRefCursorRepositoryId} IS NULL OR ${table.tagRefCursorRepositoryId} ~ '^[0-9]{1,32}$')`
    ),
    check(
      "github_account_checkpoints_ref_leases",
      sql`(${table.headRefLeaseToken} IS NULL) = (${table.headRefLeaseUntil} IS NULL) AND (${table.tagRefLeaseToken} IS NULL) = (${table.tagRefLeaseUntil} IS NULL)`
    ),
    check(
      "github_account_checkpoints_ref_scans",
      sql`(${table.headRefNextPage} IS NULL AND ${table.headRefScanStartedAt} IS NULL OR ${table.headRefNextPage} >= 2 AND ${table.headRefScanStartedAt} IS NOT NULL) AND (${table.tagRefNextPage} IS NULL AND ${table.tagRefScanStartedAt} IS NULL OR ${table.tagRefNextPage} >= 2 AND ${table.tagRefScanStartedAt} IS NOT NULL)`
    ),
    check(
      "github_account_checkpoints_pr_backfill_digest",
      sql`${table.pullRequestBackfillDigest} IS NULL OR ${table.pullRequestBackfillDigest} ~ '^[a-f0-9]{64}$'`
    ),
  ]
).enableRLS();

// This legacy table is the desired tip signal. A tip is not current
// reachability until githubRefGenerations has completed that exact head.
export const githubRepositoryRefs = pgTable(
  "github_repository_refs",
  {
    active: boolean("active").default(true).notNull(),
    branchLineageId: uuid("branch_lineage_id"),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    headSha: varchar("head_sha", { length: 40 }).notNull(),
    kind: varchar("kind", { length: 8 }).notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    projectionRelevant: boolean("projection_relevant").default(false).notNull(),
    refName: text("ref_name").notNull(),
    repairAttempts: integer("repair_attempts").default(0).notNull(),
    repairError: varchar("repair_error", { length: 80 }),
    repairLeaseToken: uuid("repair_lease_token"),
    repairLeaseUntil: timestamp("repair_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.refName] }),
    index("github_repository_refs_active_idx").on(
      table.repositoryId,
      table.active
    ),
    index("github_repository_refs_projection_idx").on(
      table.projectionRelevant,
      table.active,
      table.lastObservedAt
    ),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "github_repository_refs_repository_fk",
    }).onDelete("cascade"),
    check("github_repository_refs_kind", sql`${table.kind} IN ('head', 'tag')`),
    check(
      "github_repository_refs_name",
      sql`(${table.kind} = 'head' AND ${table.refName} LIKE 'refs/heads/%') OR (${table.kind} = 'tag' AND ${table.refName} LIKE 'refs/tags/%')`
    ),
    check(
      "github_repository_refs_lineage",
      sql`(${table.kind} = 'head') = (${table.branchLineageId} IS NOT NULL)`
    ),
    check(
      "github_repository_refs_projection_relevance",
      sql`NOT ${table.projectionRelevant} OR ${table.kind} = 'head'`
    ),
    check(
      "github_repository_refs_sha_shape",
      sql`${table.headSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_repository_refs_observation_order",
      sql`${table.lastObservedAt} >= ${table.firstObservedAt}`
    ),
    check(
      "github_repository_refs_repair_lease",
      sql`(${table.repairLeaseToken} IS NULL) = (${table.repairLeaseUntil} IS NULL) AND (${table.repairLeaseToken} IS NULL OR ${table.kind} = 'head')`
    ),
    check(
      "github_repository_refs_repair_attempts",
      sql`${table.repairAttempts} >= 0`
    ),
  ]
).enableRLS();

export const githubWebhookDeliveries = pgTable(
  "github_webhook_deliveries",
  {
    accepted: boolean("accepted").notNull(),
    account: varchar("account", { length: 39 }),
    action: varchar("action", { length: 40 }),
    deliveryId: varchar("delivery_id", { length: 36 }).primaryKey(),
    event: varchar("event", { length: 40 }).notNull(),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    repositoryId: varchar("repository_id", { length: 32 }),
  },
  (table) => [
    index("github_webhook_deliveries_audit_idx").on(
      table.event,
      table.observedAt
    ),
    check(
      "github_webhook_deliveries_id_shape",
      sql`${table.deliveryId} ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'`
    ),
    check(
      "github_webhook_deliveries_event_shape",
      sql`${table.event} ~ '^[a-z][a-z0-9_]{0,39}$'`
    ),
    check(
      "github_webhook_deliveries_action_shape",
      sql`${table.action} IS NULL OR ${table.action} ~ '^[a-z][a-z0-9_]{0,39}$'`
    ),
    check(
      "github_webhook_deliveries_repository_id_shape",
      sql`${table.repositoryId} IS NULL OR ${table.repositoryId} ~ '^[0-9]{1,32}$'`
    ),
    check(
      "github_webhook_deliveries_tracked_account",
      sql`${table.account} IS NULL OR ${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
  ]
).enableRLS();

export const githubPushObservations = pgTable(
  "github_push_observations",
  {
    account: varchar("account", { length: 39 }).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    afterSha: varchar("after_sha", { length: 40 }).notNull(),
    beforeSha: varchar("before_sha", { length: 40 }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorCode: varchar("error_code", { length: 80 }),
    expectedCommitCount: integer("expected_commit_count"),
    historySinceAt: timestamp("history_since_at", {
      mode: "date",
      withTimezone: true,
    }),
    historyUntilAt: timestamp("history_until_at", {
      mode: "date",
      withTimezone: true,
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    providerCreatedAt: timestamp("provider_created_at", {
      mode: "date",
      withTimezone: true,
    }),
    refName: text("ref_name").notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    repositoryNameSnapshot: varchar("repository_name_snapshot", {
      length: 200,
    }).notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    state: varchar("state", { length: 16 }).default("pending").notNull(),
  },
  (table) => [
    uniqueIndex("github_push_observations_source_unique").on(
      table.source,
      table.sourceId
    ),
    uniqueIndex("github_push_observations_push_unique")
      .on(table.repositoryId, table.refName, table.beforeSha, table.afterSha)
      .where(sql`${table.source} <> 'backfill'`),
    index("github_push_observations_pending_idx").on(
      table.state,
      table.leaseUntil,
      table.observedAt
    ),
    index("github_push_observations_account_idx").on(
      table.account,
      table.observedAt
    ),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "gh_push_observations_repository_fk",
    }),
    check(
      "github_push_observations_tracked_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_push_observations_source",
      sql`${table.source} IN ('webhook', 'events', 'refs', 'backfill')`
    ),
    check(
      "github_push_observations_sha_shape",
      sql`${table.beforeSha} ~ '^[a-f0-9]{40}$' AND ${table.afterSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_push_observations_nonnegative_count",
      sql`${table.attemptCount} >= 0 AND (${table.expectedCommitCount} IS NULL OR ${table.expectedCommitCount} >= 0)`
    ),
    check(
      "github_push_observations_history_bounds",
      sql`(${table.source} <> 'backfill' AND ${table.historySinceAt} IS NULL AND ${table.historyUntilAt} IS NULL) OR (${table.source} = 'backfill' AND ${table.historySinceAt} IS NOT NULL AND ${table.historyUntilAt} IS NOT NULL AND ${table.historySinceAt} <= ${table.historyUntilAt} AND ${table.expectedCommitCount} IS NULL AND ${table.beforeSha} = repeat('0', 40))`
    ),
    check(
      "github_push_observations_state",
      sql`${table.state} IN ('pending', 'processing', 'complete', 'deferred', 'unavailable')`
    ),
    check(
      "github_push_observations_lease",
      sql`(${table.state} = 'processing') = (${table.leaseToken} IS NOT NULL) AND (${table.state} <> 'processing' OR ${table.leaseUntil} IS NOT NULL)`
    ),
  ]
).enableRLS();

export const githubPushObservationCommits = pgTable(
  "github_push_observation_commits",
  {
    observationId: uuid("observation_id").notNull(),
    position: integer("position").notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    sha: varchar("sha", { length: 40 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.observationId, table.repositoryId, table.sha],
      name: "gh_push_observation_commits_pk",
    }),
    uniqueIndex("github_push_observation_commits_position_unique").on(
      table.observationId,
      table.position
    ),
    foreignKey({
      columns: [table.observationId],
      foreignColumns: [githubPushObservations.id],
      name: "gh_push_observation_commits_observation_fk",
    }).onDelete("cascade"),
    check(
      "github_push_observation_commits_sha_shape",
      sql`${table.sha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_push_observation_commits_nonnegative_position",
      sql`${table.position} >= 0`
    ),
  ]
).enableRLS();

export const githubPullRequests = pgTable(
  "github_pull_requests",
  {
    account: varchar("account", { length: 39 }).notNull(),
    additions: integer("additions"),
    authorLogin: varchar("author_login", { length: 100 }),
    authorUserId: varchar("author_user_id", { length: 32 }).notNull(),
    baseRefName: text("base_ref_name"),
    baseRepositoryId: varchar("base_repository_id", { length: 32 }),
    baseSha: varchar("base_sha", { length: 40 }),
    body: text("body"),
    bodySnapshot: text("body_snapshot"),
    changedFiles: integer("changed_files"),
    closedAt: timestamp("closed_at", {
      mode: "date",
      withTimezone: true,
    }),
    commitCount: integer("commit_count"),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    deletions: integer("deletions"),
    draft: boolean("draft").default(false).notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    headRefName: text("head_ref_name"),
    headRepositoryId: varchar("head_repository_id", { length: 32 }),
    headSha: varchar("head_sha", { length: 40 }),
    lastReconciledAt: timestamp("last_reconciled_at", {
      mode: "date",
      withTimezone: true,
    }),
    mergedAt: timestamp("merged_at", {
      mode: "date",
      withTimezone: true,
    }),
    mergeSha: varchar("merge_sha", { length: 40 }),
    mergeShaVerifiedAt: timestamp("merge_sha_verified_at", {
      mode: "date",
      withTimezone: true,
    }),
    nextReconcileAt: timestamp("next_reconcile_at", {
      mode: "date",
      withTimezone: true,
    }),
    nodeId: varchar("node_id", { length: 128 }).primaryKey(),
    number: integer("number").notNull(),
    providerUpdatedAt: timestamp("provider_updated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    reconcileAttempts: integer("reconcile_attempts").default(0).notNull(),
    reconcileError: varchar("reconcile_error", { length: 80 }),
    repositoryId: varchar("repository_id", { length: 32 })
      .notNull()
      .references(() => githubRepositories.id),
    state: varchar("state", { length: 12 }).notNull(),
    terminalAt: timestamp("terminal_at", {
      mode: "date",
      withTimezone: true,
    }),
    title: text("title").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    url: text("url").notNull(),
  },
  (table) => [
    uniqueIndex("github_pull_requests_repository_number_unique").on(
      table.repositoryId,
      table.number
    ),
    index("github_pull_requests_reconciliation_idx").on(
      table.account,
      table.state,
      table.nextReconcileAt,
      table.createdAt
    ),
    index("github_pull_requests_author_idx").on(
      table.authorUserId,
      table.createdAt
    ),
    check(
      "github_pull_requests_tracked_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_pull_requests_state",
      sql`${table.state} IN ('open', 'closed', 'merged')`
    ),
    check(
      "github_pull_requests_terminal_state",
      sql`(${table.state} = 'open' AND ${table.terminalAt} IS NULL) OR (${table.state} IN ('closed', 'merged') AND ${table.terminalAt} IS NOT NULL)`
    ),
    check(
      "github_pull_requests_merged_state",
      sql`(${table.state} = 'merged') = (${table.mergedAt} IS NOT NULL)`
    ),
    check(
      "github_pull_requests_sha_shapes",
      sql`(${table.baseSha} IS NULL OR ${table.baseSha} ~ '^[a-f0-9]{40}$') AND (${table.headSha} IS NULL OR ${table.headSha} ~ '^[a-f0-9]{40}$') AND (${table.mergeSha} IS NULL OR ${table.mergeSha} ~ '^[a-f0-9]{40}$')`
    ),
    check(
      "github_pull_requests_verified_merge_sha",
      sql`(${table.mergeSha} IS NULL AND ${table.mergeShaVerifiedAt} IS NULL) OR (${table.state} = 'merged' AND ${table.mergeShaVerifiedAt} IS NOT NULL)`
    ),
    check("github_pull_requests_positive_number", sql`${table.number} > 0`),
    check(
      "github_pull_requests_nonnegative_counts",
      sql`(${table.changedFiles} IS NULL OR ${table.changedFiles} >= 0) AND (${table.additions} IS NULL OR ${table.additions} >= 0) AND (${table.deletions} IS NULL OR ${table.deletions} >= 0) AND (${table.commitCount} IS NULL OR ${table.commitCount} >= 0)`
    ),
    check(
      "github_pull_requests_nonnegative_attempts",
      sql`${table.reconcileAttempts} >= 0`
    ),
  ]
).enableRLS();

export const githubPullRequestSignals = pgTable(
  "github_pull_request_signals",
  {
    account: varchar("account", { length: 39 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorCode: varchar("error_code", { length: 80 }),
    eventId: varchar("event_id", { length: 64 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    number: integer("number").notNull(),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    repositoryNameSnapshot: varchar("repository_name_snapshot", {
      length: 200,
    }).notNull(),
    state: varchar("state", { length: 16 }).default("pending").notNull(),
  },
  (table) => [
    uniqueIndex("github_pull_request_signals_event_unique").on(
      table.account,
      table.eventId
    ),
    index("github_pull_request_signals_pending_idx").on(
      table.state,
      table.leaseUntil,
      table.observedAt
    ),
    check(
      "github_pull_request_signals_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check(
      "github_pull_request_signals_event_id",
      sql`${table.eventId} ~ '^[0-9]{1,64}$'`
    ),
    check(
      "github_pull_request_signals_repository_id",
      sql`${table.repositoryId} ~ '^[0-9]{1,32}$'`
    ),
    check(
      "github_pull_request_signals_state",
      sql`${table.state} IN ('pending', 'processing', 'complete', 'unavailable')`
    ),
    check(
      "github_pull_request_signals_lease",
      sql`(${table.state} = 'processing') = (${table.leaseToken} IS NOT NULL) AND (${table.state} <> 'processing' OR ${table.leaseUntil} IS NOT NULL)`
    ),
    check(
      "github_pull_request_signals_values",
      sql`${table.number} > 0 AND ${table.attemptCount} >= 0`
    ),
  ]
).enableRLS();

export const githubPullRequestVersions = pgTable(
  "github_pull_request_versions",
  {
    baseRefName: text("base_ref_name"),
    baseRepositoryId: varchar("base_repository_id", { length: 32 }),
    baseSha: varchar("base_sha", { length: 40 }).notNull(),
    commitCount: integer("commit_count"),
    fileFacts: jsonb("file_facts").$type<readonly GitHubWorkUnitFileFact[]>(),
    fileFactsDigest: varchar("file_facts_digest", {
      length: 64,
    }).generatedAlwaysAs(
      sql`CASE WHEN "file_facts" IS NULL THEN NULL ELSE encode(sha256(jsonb_send("file_facts")), 'hex') END`
    ),
    fileFactsComplete: boolean("file_facts_complete").default(false).notNull(),
    headRefName: text("head_ref_name"),
    headRepositoryId: varchar("head_repository_id", { length: 32 }),
    headSha: varchar("head_sha", { length: 40 }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    isCurrent: boolean("is_current").default(true).notNull(),
    membershipComplete: boolean("membership_complete").default(false).notNull(),
    mergeSnapshot: boolean("merge_snapshot").default(false).notNull(),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    providerUpdatedAt: timestamp("provider_updated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    pullRequestNodeId: varchar("pull_request_node_id", {
      length: 128,
    }).notNull(),
  },
  (table) => [
    uniqueIndex("github_pull_request_versions_head_unique").on(
      table.pullRequestNodeId,
      table.headSha
    ),
    uniqueIndex("github_pull_request_versions_current_unique")
      .on(table.pullRequestNodeId)
      .where(sql`${table.isCurrent}`),
    foreignKey({
      columns: [table.pullRequestNodeId],
      foreignColumns: [githubPullRequests.nodeId],
      name: "gh_pr_versions_pull_request_fk",
    }).onDelete("cascade"),
    check(
      "github_pull_request_versions_sha_shapes",
      sql`${table.baseSha} ~ '^[a-f0-9]{40}$' AND ${table.headSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_pull_request_versions_nonnegative_count",
      sql`${table.commitCount} IS NULL OR ${table.commitCount} >= 0`
    ),
    check(
      "github_pull_request_versions_file_facts_array",
      sql`${table.fileFacts} IS NULL OR jsonb_typeof(${table.fileFacts}) = 'array'`
    ),
    check(
      "github_pull_request_versions_file_facts_complete",
      sql`NOT ${table.fileFactsComplete} OR ${table.fileFacts} IS NOT NULL`
    ),
  ]
).enableRLS();

export const githubPullRequestMemberships = pgTable(
  "github_pull_request_memberships",
  {
    commitRepositoryId: varchar("commit_repository_id", {
      length: 32,
    }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    isHead: boolean("is_head").default(false).notNull(),
    position: integer("position").notNull(),
    versionId: uuid("version_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.versionId, table.commitRepositoryId, table.commitSha],
      name: "gh_pr_memberships_pk",
    }),
    uniqueIndex("github_pull_request_memberships_position_unique").on(
      table.versionId,
      table.position
    ),
    index("github_pull_request_memberships_commit_lookup_idx").on(
      table.commitRepositoryId,
      table.commitSha
    ),
    foreignKey({
      columns: [table.versionId],
      foreignColumns: [githubPullRequestVersions.id],
      name: "gh_pr_memberships_version_fk",
    }).onDelete("cascade"),
    check(
      "github_pull_request_memberships_sha_shape",
      sql`${table.commitSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_pull_request_memberships_nonnegative_position",
      sql`${table.position} >= 0`
    ),
  ]
).enableRLS();

// Current provider-reported PR associations for a commit. Discovery replaces
// this set atomically, so an empty set plus complete discovery is an explicit
// negative; it is not inferred from patch equality or legacy aliases.
export const githubCommitPullRequestAssociations = pgTable(
  "github_commit_pull_request_associations",
  {
    commitRepositoryId: varchar("commit_repository_id", {
      length: 32,
    }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    pullRequestNodeId: varchar("pull_request_node_id", {
      length: 128,
    }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.commitRepositoryId,
        table.commitSha,
        table.pullRequestNodeId,
      ],
      name: "gh_commit_pr_associations_pk",
    }),
    foreignKey({
      columns: [table.commitRepositoryId, table.commitSha],
      foreignColumns: [githubCommits.repositoryId, githubCommits.sha],
      name: "gh_commit_pr_associations_commit_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.pullRequestNodeId],
      foreignColumns: [githubPullRequests.nodeId],
      name: "gh_commit_pr_associations_pr_fk",
    }).onDelete("cascade"),
    check(
      "gh_commit_pr_associations_sha_shape",
      sql`${table.commitSha} ~ '^[a-f0-9]{40}$'`
    ),
  ]
).enableRLS();

export const githubIssues = pgTable(
  "github_issues",
  {
    account: varchar("account", { length: 39 }).notNull(),
    authorLogin: varchar("author_login", { length: 39 }),
    authorUserId: varchar("author_user_id", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    nodeId: varchar("node_id", { length: 128 }).primaryKey(),
    number: integer("number").notNull(),
    repositoryId: varchar("repository_id", { length: 32 })
      .notNull()
      .references(() => githubRepositories.id),
    titleSnapshot: text("title_snapshot").notNull(),
    urlSnapshot: text("url_snapshot").notNull(),
  },
  (table) => [
    uniqueIndex("github_issues_repository_number_unique").on(
      table.repositoryId,
      table.number
    ),
    index("github_issues_author_idx").on(table.authorUserId, table.createdAt),
    check(
      "github_issues_tracked_account",
      sql`${table.account} IN ('f0rr0', 'yuppiestechdev')`
    ),
    check("github_issues_positive_number", sql`${table.number} > 0`),
  ]
).enableRLS();

export const githubRepositoryInventoryHeads = pgTable(
  "github_repository_inventory_heads",
  {
    accountLogin: varchar("account_login", { length: 39 }).notNull(),
    accountUserId: varchar("account_user_id", { length: 32 }).primaryKey(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    generation: bigint("generation", { mode: "number" }).default(0).notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "gh_repo_inventory_head_account_id",
      sql`${table.accountUserId} ~ '^[0-9]{1,32}$'`
    ),
    check(
      "gh_repo_inventory_head_generation",
      sql`(${table.generation} = 0 AND ${table.completedAt} IS NULL) OR (${table.generation} > 0 AND ${table.completedAt} IS NOT NULL)`
    ),
  ]
).enableRLS();

export const githubAccountRepositoryCatalogs = pgTable(
  "github_account_repository_catalogs",
  {
    accountUserId: varchar("account_user_id", { length: 32 }).notNull(),
    activeAccess: boolean("active_access").default(true).notNull(),
    inventoryGeneration: bigint("inventory_generation", {
      mode: "number",
    }).notNull(),
    observedAt: timestamp("observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.accountUserId, table.repositoryId],
      name: "gh_account_repo_catalogs_pk",
    }),
    index("gh_account_repo_catalogs_current_idx").on(
      table.accountUserId,
      table.inventoryGeneration,
      table.activeAccess
    ),
    foreignKey({
      columns: [table.accountUserId],
      foreignColumns: [githubRepositoryInventoryHeads.accountUserId],
      name: "gh_account_repo_catalogs_account_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "gh_account_repo_catalogs_repository_fk",
    }).onDelete("cascade"),
    check(
      "gh_account_repo_catalogs_generation",
      sql`${table.inventoryGeneration} > 0`
    ),
  ]
).enableRLS();

// One row is the last complete traversal for a head. A differing desired tip
// in githubRepositoryRefs is therefore a small, deterministic traversal queue.
export const githubRefGenerations = pgTable(
  "github_ref_generations",
  {
    branchLineageId: uuid("branch_lineage_id").defaultRandom().notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    coverageSinceAt: timestamp("coverage_since_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    headSha: varchar("head_sha", { length: 40 }).notNull(),
    refName: text("ref_name").notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.repositoryId, table.refName],
      name: "gh_ref_generations_pk",
    }),
    unique("gh_ref_generations_version_unique").on(
      table.repositoryId,
      table.refName,
      table.generation
    ),
    index("gh_ref_generations_lineage_idx").on(
      table.repositoryId,
      table.branchLineageId
    ),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "gh_ref_generations_repository_fk",
    }).onDelete("cascade"),
    check(
      "gh_ref_generations_head_name",
      sql`${table.refName} LIKE 'refs/heads/%'`
    ),
    check(
      "gh_ref_generations_sha_shape",
      sql`${table.headSha} ~ '^[a-f0-9]{40}$'`
    ),
    check("gh_ref_generations_positive", sql`${table.generation} > 0`),
  ]
).enableRLS();

export const githubRefMemberships = pgTable(
  "github_ref_memberships",
  {
    commitRepositoryId: varchar("commit_repository_id", {
      length: 32,
    }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }).notNull(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    position: integer("position").notNull(),
    refName: text("ref_name").notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.repositoryId,
        table.refName,
        table.commitRepositoryId,
        table.commitSha,
      ],
      name: "gh_ref_memberships_pk",
    }),
    uniqueIndex("gh_ref_memberships_position_unique").on(
      table.repositoryId,
      table.refName,
      table.position
    ),
    index("gh_ref_memberships_commit_idx").on(
      table.commitRepositoryId,
      table.commitSha
    ),
    foreignKey({
      columns: [table.repositoryId, table.refName, table.generation],
      foreignColumns: [
        githubRefGenerations.repositoryId,
        githubRefGenerations.refName,
        githubRefGenerations.generation,
      ],
      name: "gh_ref_memberships_generation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.commitRepositoryId, table.commitSha],
      foreignColumns: [githubCommits.repositoryId, githubCommits.sha],
      name: "gh_ref_memberships_commit_fk",
    }).onDelete("cascade"),
    check(
      "gh_ref_memberships_values",
      sql`${table.generation} > 0 AND ${table.position} >= 0 AND ${table.commitSha} ~ '^[a-f0-9]{40}$'`
    ),
  ]
).enableRLS();

export const githubWorkUnits = pgTable(
  "github_work_units",
  {
    activityAnchorAt: timestamp("activity_anchor_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    activityAt: timestamp("activity_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    activityDay: date("activity_day", { mode: "string" }).notNull(),
    additions: integer("additions").notNull(),
    attributionMode: varchar("attribution_mode", { length: 32 }).notNull(),
    branchLineageId: uuid("branch_lineage_id"),
    contentObservedAt: timestamp("content_observed_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    deletions: integer("deletions").notNull(),
    factsDigest: varchar("facts_digest", { length: 64 }).notNull(),
    fileCount: integer("file_count").notNull(),
    firstActivityAt: timestamp("first_activity_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    identityKey: varchar("identity_key", { length: 180 }).notNull(),
    kind: varchar("kind", { length: 16 }).notNull(),
    languages: jsonb("languages").$type<readonly GitHubLanguageFact[]>(),
    lastActivityAt: timestamp("last_activity_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    memberCount: integer("member_count").notNull(),
    membershipDigest: varchar("membership_digest", { length: 64 }).notNull(),
    newestCommitRepositoryId: varchar("newest_commit_repository_id", {
      length: 32,
    }).notNull(),
    newestCommitSha: varchar("newest_commit_sha", { length: 40 }).notNull(),
    outcomeDigest: varchar("outcome_digest", { length: 64 }),
    pullRequestNodeId: varchar("pull_request_node_id", { length: 128 }),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    revision: integer("revision").default(1).notNull(),
    summaryEvaluationDigest: varchar("summary_evaluation_digest", {
      length: 64,
    }),
    summaryEvaluatedDigest: varchar("summary_evaluated_digest", {
      length: 64,
    }),
    summaryInputDigest: varchar("summary_input_digest", { length: 64 }),
    visibility: varchar("visibility", { length: 8 }).notNull(),
  },
  (table) => [
    uniqueIndex("gh_work_units_identity_unique").on(table.identityKey),
    uniqueIndex("gh_work_units_pr_unique")
      .on(table.pullRequestNodeId)
      .where(sql`${table.kind} = 'pull_request'`),
    uniqueIndex("gh_work_units_canonical_day_unique")
      .on(table.repositoryId, table.activityDay)
      .where(sql`${table.kind} = 'canonical_day'`),
    uniqueIndex("gh_work_units_branch_unique")
      .on(table.branchLineageId)
      .where(sql`${table.kind} = 'branch'`),
    index("gh_work_units_feed_idx").on(
      table.visibility,
      table.activityDay,
      table.activityAt,
      table.id
    ),
    foreignKey({
      columns: [table.repositoryId],
      foreignColumns: [githubRepositories.id],
      name: "gh_work_units_repository_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.pullRequestNodeId],
      foreignColumns: [githubPullRequests.nodeId],
      name: "gh_work_units_pull_request_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.newestCommitRepositoryId, table.newestCommitSha],
      foreignColumns: [githubCommits.repositoryId, githubCommits.sha],
      name: "gh_work_units_newest_commit_fk",
    }),
    check(
      "gh_work_units_kind",
      sql`${table.kind} IN ('pull_request', 'canonical_day', 'branch')`
    ),
    check(
      "gh_work_units_owner_shape",
      sql`(${table.kind} = 'pull_request' AND ${table.pullRequestNodeId} IS NOT NULL AND ${table.branchLineageId} IS NULL) OR (${table.kind} = 'canonical_day' AND ${table.pullRequestNodeId} IS NULL AND ${table.branchLineageId} IS NULL) OR (${table.kind} = 'branch' AND ${table.pullRequestNodeId} IS NULL AND ${table.branchLineageId} IS NOT NULL)`
    ),
    check(
      "gh_work_units_identity",
      sql`(${table.kind} = 'pull_request' AND ${table.identityKey} = 'pr:' || ${table.pullRequestNodeId}) OR (${table.kind} = 'canonical_day' AND ${table.identityKey} = 'canonical:' || ${table.repositoryId} || ':' || ${table.activityDay}::text) OR (${table.kind} = 'branch' AND ${table.identityKey} = 'branch:' || ${table.branchLineageId}::text)`
    ),
    check(
      "gh_work_units_attribution_mode",
      sql`${table.attributionMode} IN ('tracked_authored_pr', 'foreign_pr_contribution', 'canonical_owned_composite', 'branch_owned_composite')`
    ),
    check(
      "gh_work_units_kind_attribution",
      sql`(${table.kind} = 'pull_request' AND ${table.attributionMode} IN ('tracked_authored_pr', 'foreign_pr_contribution')) OR (${table.kind} = 'canonical_day' AND ${table.attributionMode} = 'canonical_owned_composite') OR (${table.kind} = 'branch' AND ${table.attributionMode} = 'branch_owned_composite')`
    ),
    check(
      "gh_work_units_visibility",
      sql`${table.visibility} IN ('public', 'private')`
    ),
    check(
      "gh_work_units_nonnegative_facts",
      sql`${table.memberCount} > 0 AND ${table.fileCount} >= 0 AND ${table.additions} >= 0 AND ${table.deletions} >= 0 AND ${table.revision} > 0`
    ),
    check(
      "gh_work_units_activity_order",
      sql`${table.firstActivityAt} <= ${table.lastActivityAt} AND ${table.activityDay} = (${table.activityAt} AT TIME ZONE 'UTC')::date`
    ),
    check(
      "gh_work_units_digest_shapes",
      sql`${table.factsDigest} ~ '^[a-f0-9]{64}$' AND ${table.membershipDigest} ~ '^[a-f0-9]{64}$' AND (${table.outcomeDigest} IS NULL OR ${table.outcomeDigest} ~ '^[a-f0-9]{64}$') AND (${table.summaryEvaluationDigest} IS NULL OR ${table.summaryEvaluationDigest} ~ '^[a-f0-9]{64}$') AND (${table.summaryEvaluatedDigest} IS NULL OR ${table.summaryEvaluatedDigest} ~ '^[a-f0-9]{64}$') AND (${table.summaryInputDigest} IS NULL OR ${table.summaryInputDigest} ~ '^[a-f0-9]{64}$')`
    ),
    check(
      "gh_work_units_languages_array",
      sql`${table.languages} IS NULL OR jsonb_typeof(${table.languages}) = 'array'`
    ),
  ]
).enableRLS();

export const githubWorkUnitMemberships = pgTable(
  "github_work_unit_memberships",
  {
    logicalRepositoryId: varchar("logical_repository_id", {
      length: 32,
    }).notNull(),
    logicalSha: varchar("logical_sha", { length: 40 }).notNull(),
    position: integer("position").notNull(),
    workUnitId: uuid("work_unit_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workUnitId, table.logicalRepositoryId, table.logicalSha],
      name: "gh_work_unit_memberships_pk",
    }),
    uniqueIndex("gh_work_unit_memberships_position_unique").on(
      table.workUnitId,
      table.position
    ),
    uniqueIndex("gh_work_unit_memberships_commit_unique").on(
      table.logicalRepositoryId,
      table.logicalSha
    ),
    foreignKey({
      columns: [table.workUnitId],
      foreignColumns: [githubWorkUnits.id],
      name: "gh_work_unit_memberships_unit_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.logicalRepositoryId, table.logicalSha],
      foreignColumns: [githubCommits.repositoryId, githubCommits.sha],
      name: "gh_work_unit_memberships_commit_fk",
    }),
    check(
      "gh_work_unit_memberships_values",
      sql`${table.position} >= 0 AND ${table.logicalSha} ~ '^[a-f0-9]{40}$'`
    ),
  ]
).enableRLS();

export const githubWorkUnitSummaryAttempts = pgTable(
  "github_work_unit_summary_attempts",
  {
    acceptedAt: timestamp("accepted_at", {
      mode: "date",
      withTimezone: true,
    }),
    attributionMode: varchar("attribution_mode", { length: 32 }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    debounceUntil: timestamp("debounce_until", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    inputTokens: integer("input_tokens"),
    lastStartedAt: timestamp("last_started_at", {
      mode: "date",
      withTimezone: true,
    }),
    latencyMs: integer("latency_ms"),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    model: varchar("model", { length: 64 }),
    outcome: text("outcome"),
    outcomeDigest: varchar("outcome_digest", { length: 64 }).notNull(),
    outputTokens: integer("output_tokens"),
    recipe: varchar("recipe", { length: 100 }).notNull(),
    requestPayload: text("request_payload"),
    revision: integer("revision").notNull(),
    startedRequests: integer("started_requests").default(0).notNull(),
    state: varchar("state", { length: 16 }).default("pending").notNull(),
    summaryInputDigest: varchar("summary_input_digest", {
      length: 64,
    }).notNull(),
    workUnitId: uuid("work_unit_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workUnitId, table.revision],
      name: "gh_work_unit_summary_attempts_pk",
    }),
    uniqueIndex("gh_work_unit_summary_input_unique").on(
      table.workUnitId,
      table.summaryInputDigest,
      table.recipe
    ),
    index("gh_work_unit_summary_claim_idx").on(
      table.state,
      table.debounceUntil,
      table.createdAt
    ),
    foreignKey({
      columns: [table.workUnitId],
      foreignColumns: [githubWorkUnits.id],
      name: "gh_work_unit_summary_attempts_unit_fk",
    }).onDelete("cascade"),
    check(
      "gh_work_unit_summary_state",
      sql`${table.state} IN ('pending', 'processing', 'retryable', 'accepted', 'terminal')`
    ),
    check(
      "gh_work_unit_summary_digests",
      sql`${table.outcomeDigest} ~ '^[a-f0-9]{64}$' AND ${table.summaryInputDigest} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "gh_work_unit_summary_attribution",
      sql`${table.attributionMode} IN ('tracked_authored_pr', 'foreign_pr_contribution', 'canonical_owned_composite', 'branch_owned_composite')`
    ),
    check(
      "gh_work_unit_summary_revisions",
      sql`${table.revision} > 0 AND ${table.startedRequests} BETWEEN 0 AND 2`
    ),
    check(
      "gh_work_unit_summary_lease",
      sql`(${table.leaseToken} IS NULL) = (${table.leaseUntil} IS NULL) AND (${table.state} = 'processing') = (${table.leaseToken} IS NOT NULL) AND (${table.state} <> 'processing' OR (${table.startedRequests} > 0 AND ${table.requestPayload} IS NOT NULL))`
    ),
    check(
      "gh_work_unit_summary_terminal_payload",
      sql`${table.state} NOT IN ('accepted', 'terminal') OR ${table.requestPayload} IS NULL`
    ),
    check(
      "gh_work_unit_summary_accepted_output",
      sql`(${table.state} = 'accepted' AND ${table.outcome} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL) OR (${table.state} <> 'accepted' AND ${table.outcome} IS NULL AND ${table.acceptedAt} IS NULL AND (${table.state} <> 'terminal' OR ${table.completedAt} IS NOT NULL))`
    ),
    check(
      "gh_work_unit_summary_started",
      sql`(${table.startedRequests} = 0) = (${table.lastStartedAt} IS NULL) AND (${table.state} <> 'pending' OR ${table.requestPayload} IS NOT NULL)`
    ),
    check(
      "gh_work_unit_summary_request_cap",
      sql`${table.requestPayload} IS NULL OR octet_length(${table.requestPayload}) <= 393216`
    ),
    check(
      "gh_work_unit_summary_metrics",
      sql`(${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0) AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0) AND (${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0)`
    ),
  ]
).enableRLS();

export const githubWorkUnitSummaryDailyUsage = pgTable(
  "github_work_unit_summary_daily_usage",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    startedRequests: integer("started_requests").default(0).notNull(),
  }
).enableRLS();

export const githubPublicFeedHead = pgTable(
  "github_public_feed_head",
  {
    feedRevision: bigint("feed_revision", { mode: "number" })
      .default(0)
      .notNull(),
    headContentRevision: bigint("head_content_revision", { mode: "number" })
      .default(0)
      .notNull(),
    id: boolean("id").default(true).primaryKey(),
    lastPublishedAt: timestamp("last_published_at", {
      mode: "date",
      withTimezone: true,
    }),
    orderingRevision: bigint("ordering_revision", { mode: "number" })
      .default(0)
      .notNull(),
    projectionRequestToken: uuid("projection_request_token"),
    summaryPolicyDigest: varchar("summary_policy_digest", { length: 64 }),
    summarizing: boolean("summarizing").default(false).notNull(),
  },
  (table) => [
    check("gh_public_feed_head_singleton", sql`${table.id}`),
    check(
      "gh_public_feed_head_revisions",
      sql`${table.feedRevision} >= 0 AND ${table.headContentRevision} >= 0 AND ${table.orderingRevision} >= 0`
    ),
    check(
      "gh_public_feed_head_summary_policy_digest",
      sql`${table.summaryPolicyDigest} IS NULL OR ${table.summaryPolicyDigest} ~ '^[a-f0-9]{64}$'`
    ),
  ]
).enableRLS();
