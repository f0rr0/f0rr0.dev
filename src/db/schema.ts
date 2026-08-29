import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
    authoredAt: timestamp("authored_at", {
      mode: "date",
      withTimezone: true,
    }),
    authorUserId: varchar("author_user_id", { length: 32 }),
    canonicalizedAt: timestamp("canonicalized_at", {
      mode: "date",
      withTimezone: true,
    }),
    changedFiles: integer("changed_files"),
    changeFingerprint: varchar("change_fingerprint", { length: 64 }),
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
    fingerprintComplete: boolean("fingerprint_complete")
      .default(false)
      .notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    fullMessage: text("full_message"),
    languages: jsonb("languages").$type<readonly PublicCommitLanguage[]>(),
    message: text("message").notNull(),
    parentShas: jsonb("parent_shas").$type<readonly string[]>(),
    providerFileCapReached: boolean("provider_file_cap_reached")
      .default(false)
      .notNull(),
    pullRequestDiscoveryError: varchar("pr_discovery_error", { length: 80 }),
    pullRequestDiscoveryLeaseToken: uuid("pr_discovery_lease_token"),
    pullRequestDiscoveryLeaseUntil: timestamp("pr_discovery_lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    pullRequestDiscoveryState: varchar("pr_discovery_state", { length: 16 })
      .default("pending")
      .notNull(),
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
    treeSha: varchar("tree_sha", { length: 40 }),
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
    index("github_commits_enrichment_pending_idx").on(
      table.enrichmentState,
      table.enrichmentLeaseUntil,
      table.committedAt
    ),
    index("github_commits_canonicalization_pending_idx").on(
      table.canonicalizedAt,
      table.firstObservedAt
    ),
    index("github_commits_pr_discovery_pending_idx").on(
      table.pullRequestDiscoveryState,
      table.pullRequestDiscoveryLeaseUntil,
      table.firstObservedAt
    ),
    check("github_commits_sha_shape", sql`${table.sha} ~ '^[a-f0-9]{40}$'`),
    check(
      "github_commits_tree_sha_shape",
      sql`${table.treeSha} IS NULL OR ${table.treeSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_commits_fingerprint_shape",
      sql`${table.changeFingerprint} IS NULL OR ${table.changeFingerprint} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "github_commits_fingerprint_completeness",
      sql`NOT ${table.fingerprintComplete} OR ${table.changeFingerprint} IS NOT NULL`
    ),
    check(
      "github_commits_parent_shas_array",
      sql`${table.parentShas} IS NULL OR jsonb_typeof(${table.parentShas}) = 'array'`
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
  ]
).enableRLS();

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
    fullName: varchar("full_name", { length: 200 }).notNull(),
    homepageUrl: text("homepage_url"),
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
    topics: jsonb("topics").$type<readonly string[]>(),
    visibility: varchar("visibility", { length: 12 }),
  },
  (table) => [
    index("github_repositories_full_name_idx").on(table.fullName),
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

export const githubRepositoryRefs = pgTable(
  "github_repository_refs",
  {
    active: boolean("active").default(true).notNull(),
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
    refName: text("ref_name").notNull(),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.refName] }),
    index("github_repository_refs_active_idx").on(
      table.repositoryId,
      table.active
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
      "github_repository_refs_sha_shape",
      sql`${table.headSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_repository_refs_observation_order",
      sql`${table.lastObservedAt} >= ${table.firstObservedAt}`
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
    afterSha: varchar("after_sha", { length: 40 }).notNull(),
    beforeSha: varchar("before_sha", { length: 40 }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    errorCode: varchar("error_code", { length: 80 }),
    expectedCommitCount: integer("expected_commit_count"),
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
    uniqueIndex("github_push_observations_push_unique").on(
      table.repositoryId,
      table.refName,
      table.beforeSha,
      table.afterSha
    ),
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
      sql`${table.source} IN ('webhook', 'events', 'refs')`
    ),
    check(
      "github_push_observations_sha_shape",
      sql`${table.beforeSha} ~ '^[a-f0-9]{40}$' AND ${table.afterSha} ~ '^[a-f0-9]{40}$'`
    ),
    check(
      "github_push_observations_nonnegative_count",
      sql`${table.expectedCommitCount} IS NULL OR ${table.expectedCommitCount} >= 0`
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
    nextReconcileAt: timestamp("next_reconcile_at", {
      mode: "date",
      withTimezone: true,
    }),
    nodeId: varchar("node_id", { length: 128 }).primaryKey(),
    number: integer("number").notNull(),
    providerFileCapReached: boolean("provider_file_cap_reached")
      .default(false)
      .notNull(),
    providerUpdatedAt: timestamp("provider_updated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
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
    check("github_pull_requests_positive_number", sql`${table.number} > 0`),
    check(
      "github_pull_requests_nonnegative_counts",
      sql`(${table.changedFiles} IS NULL OR ${table.changedFiles} >= 0) AND (${table.additions} IS NULL OR ${table.additions} >= 0) AND (${table.deletions} IS NULL OR ${table.deletions} >= 0) AND (${table.commitCount} IS NULL OR ${table.commitCount} >= 0)`
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

export const githubPublicActivities = pgTable(
  "github_public_activities",
  {
    aliasEvidence:
      jsonb("alias_evidence").$type<Readonly<Record<string, unknown>>>(),
    aliasReason: varchar("alias_reason", { length: 64 }),
    canonicalPublicId: uuid("canonical_public_id"),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    hiddenAt: timestamp("hidden_at", {
      mode: "date",
      withTimezone: true,
    }),
    kind: varchar("kind", { length: 16 }).notNull(),
    occurredAt: timestamp("occurred_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    publicId: uuid("public_id").defaultRandom().primaryKey(),
    publishedAt: timestamp("published_at", {
      mode: "date",
      withTimezone: true,
    }),
    repositoryId: varchar("repository_id", { length: 32 }).notNull(),
    revision: integer("revision").default(1).notNull(),
    sourceNodeId: text("source_node_id").notNull(),
  },
  (table) => [
    uniqueIndex("github_public_activities_source_unique").on(
      table.kind,
      table.repositoryId,
      table.sourceNodeId
    ),
    index("github_public_activities_cursor_idx").on(
      table.occurredAt,
      table.publicId
    ),
    index("github_public_activities_canonical_idx").on(table.canonicalPublicId),
    foreignKey({
      columns: [table.canonicalPublicId],
      foreignColumns: [table.publicId],
      name: "github_public_activities_canonical_fk",
    }),
    check(
      "github_public_activities_kind",
      sql`${table.kind} IN ('commit', 'pull_request', 'issue')`
    ),
    check(
      "github_public_activities_not_self_canonical",
      sql`${table.canonicalPublicId} IS NULL OR ${table.canonicalPublicId} <> ${table.publicId}`
    ),
    check(
      "github_public_activities_positive_revision",
      sql`${table.revision} > 0`
    ),
    check(
      "github_public_activities_alias_audit",
      sql`(${table.canonicalPublicId} IS NULL AND ${table.aliasReason} IS NULL AND ${table.aliasEvidence} IS NULL) OR (${table.canonicalPublicId} IS NOT NULL AND ${table.aliasReason} IS NOT NULL)`
    ),
  ]
).enableRLS();

export const githubSummaryAttempts = pgTable(
  "github_summary_attempts",
  {
    activityPublicId: uuid("activity_public_id").notNull(),
    attemptedAt: timestamp("attempted_at", {
      mode: "date",
      withTimezone: true,
    }),
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
    errorCode: varchar("error_code", { length: 80 }),
    inputHash: varchar("input_hash", { length: 64 }),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", {
      mode: "date",
      withTimezone: true,
    }),
    model: varchar("model", { length: 64 }),
    recipe: varchar("recipe", { length: 100 }),
    revision: integer("revision").notNull(),
    state: varchar("state", { length: 16 }).default("pending").notNull(),
    summaryHeadline: text("summary_headline"),
    summaryShort: text("summary_short"),
  },
  (table) => [
    primaryKey({
      columns: [table.activityPublicId, table.revision],
      name: "gh_summary_attempts_pk",
    }),
    index("github_summary_attempts_pending_idx").on(
      table.state,
      table.createdAt
    ),
    foreignKey({
      columns: [table.activityPublicId],
      foreignColumns: [githubPublicActivities.publicId],
      name: "gh_summary_attempts_activity_fk",
    }).onDelete("cascade"),
    check(
      "github_summary_attempts_state",
      sql`${table.state} IN ('pending', 'processing', 'complete', 'failed', 'indeterminate')`
    ),
    check(
      "github_summary_attempts_positive_revision",
      sql`${table.revision} > 0`
    ),
    check(
      "github_summary_attempts_input_hash_shape",
      sql`${table.inputHash} IS NULL OR ${table.inputHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "github_summary_attempts_summary_pair",
      sql`(${table.summaryHeadline} IS NULL) = (${table.summaryShort} IS NULL)`
    ),
    check(
      "github_summary_attempts_complete_output",
      sql`${table.state} <> 'complete' OR (${table.summaryHeadline} IS NOT NULL AND ${table.completedAt} IS NOT NULL)`
    ),
    check(
      "github_summary_attempts_lease",
      sql`(${table.state} = 'processing') = (${table.leaseToken} IS NOT NULL) AND (${table.state} <> 'processing' OR ${table.leaseUntil} IS NOT NULL)`
    ),
  ]
).enableRLS();
