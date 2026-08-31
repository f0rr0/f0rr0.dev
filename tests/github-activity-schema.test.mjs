import { describe, expect, test } from "bun:test";

import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  githubAccountCheckpoints,
  githubCommits,
  githubIssues,
  githubPublicActivities,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestSignals,
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubRepositoryRefs,
  githubSummaryAttempts,
  githubWebhookDeliveries,
} from "../src/db/schema.ts";

const config = (table) => getTableConfig(table);
const checkNames = (table) => config(table).checks.map((item) => item.name);
const indexNames = (table) =>
  config(table).indexes.map((item) => item.config.name);

describe("GitHub activity persistence schema", () => {
  test("keeps legacy commit identity while adding durable enrichment state", () => {
    expect(getTableName(githubCommits)).toBe("github_commits");
    expect(githubCommits.repositoryId.primary).toBe(false);
    expect(githubCommits.enrichmentState.default).toBe("pending");
    expect(githubCommits.enrichmentState.notNull).toBe(true);
    expect(githubCommits.pullRequestDiscoveryState.default).toBe("pending");
    expect(githubCommits.fingerprintComplete.default).toBe(false);
    expect(githubCommits.canonicalizedAt.name).toBe("canonicalized_at");
    expect(githubCommits.fullMessage.name).toBe("full_message");
    expect(githubCommits.treeSha.name).toBe("tree_sha");
    expect(githubCommits.parentShas.name).toBe("parent_shas");
    expect(indexNames(githubCommits)).toContain(
      "github_commits_canonicalization_pending_idx"
    );
    expect(indexNames(githubCommits)).toContain(
      "github_commits_exact_authored_change_idx"
    );
    expect(indexNames(githubCommits)).toContain(
      "github_commits_pr_discovery_pending_idx"
    );
    expect(checkNames(githubCommits)).toEqual(
      expect.arrayContaining([
        "github_commits_enrichment_state",
        "github_commits_enrichment_lease",
        "github_commits_fingerprint_completeness",
        "github_commits_pr_discovery_lease",
        "github_commits_pr_discovery_state",
      ])
    );
  });

  test("records checkpoint gaps and idempotent push discovery before hydration", () => {
    expect(githubAccountCheckpoints.gapState.default).toBe("clear");
    expect(githubAccountCheckpoints.refBackfillSinceAt.hasDefault).toBe(true);
    expect(githubAccountCheckpoints.refBackfillSinceAt.notNull).toBe(true);
    expect(githubAccountCheckpoints.eventsEtag.name).toBe("events_etag");
    expect(githubAccountCheckpoints.eventsNextPollAt.name).toBe(
      "events_next_poll_at"
    );
    expect(githubAccountCheckpoints.headRefNextPage.name).toBe(
      "head_ref_next_page"
    );
    expect(githubAccountCheckpoints.tagRefNextPage.name).toBe(
      "tag_ref_next_page"
    );
    expect(checkNames(githubAccountCheckpoints)).toEqual(
      expect.arrayContaining([
        "github_account_checkpoints_ref_leases",
        "github_account_checkpoints_ref_scans",
      ])
    );
    expect(getTableName(githubRepositories)).toBe("github_repositories");
    expect(githubRepositories.headsLastReconciledAt.name).toBe(
      "heads_last_reconciled_at"
    );
    expect(githubRepositories.tagsLastReconciledAt.name).toBe(
      "tags_last_reconciled_at"
    );
    expect(getTableName(githubPushObservations)).toBe(
      "github_push_observations"
    );
    expect(indexNames(githubPushObservations)).toEqual(
      expect.arrayContaining([
        "github_push_observations_source_unique",
        "github_push_observations_push_unique",
        "github_push_observations_pending_idx",
      ])
    );
    expect(githubPushObservations.state.default).toBe("pending");
    expect(githubPushObservations.historySinceAt.notNull).toBe(false);
    expect(githubPushObservations.historyUntilAt.notNull).toBe(false);
    expect(checkNames(githubPushObservations)).toContain(
      "github_push_observations_history_bounds"
    );
    const pushIdentity = config(githubPushObservations).indexes.find(
      (item) => item.config.name === "github_push_observations_push_unique"
    );
    expect(pushIdentity?.config.where).toBeDefined();
    expect(getTableName(githubRepositoryRefs)).toBe("github_repository_refs");
    expect(githubRepositoryRefs.active.default).toBe(true);
    expect(indexNames(githubRepositoryRefs)).toContain(
      "github_repository_refs_active_idx"
    );

    const observationCommitForeignKeys = config(
      githubPushObservationCommits
    ).foreignKeys.map((item) => item.getName());
    expect(observationCommitForeignKeys).toHaveLength(1);
    expect(observationCommitForeignKeys[0]).toBe(
      "gh_push_observation_commits_observation_fk"
    );
  });

  test("deduplicates webhook deliveries without retaining payloads", () => {
    expect(getTableName(githubWebhookDeliveries)).toBe(
      "github_webhook_deliveries"
    );
    expect(githubWebhookDeliveries.deliveryId.primary).toBe(true);
    expect(githubWebhookDeliveries.accepted.notNull).toBe(true);
    expect(githubWebhookDeliveries.observedAt.hasDefault).toBe(true);
    expect(githubWebhookDeliveries.repositoryId.notNull).toBe(false);
    expect(Object.hasOwn(githubWebhookDeliveries, "payload")).toBe(false);
    expect(checkNames(githubWebhookDeliveries)).toEqual(
      expect.arrayContaining([
        "github_webhook_deliveries_id_shape",
        "github_webhook_deliveries_tracked_account",
      ])
    );
  });

  test("stores mutable PR state separately from immutable discovery snapshots", () => {
    expect(getTableName(githubPullRequests)).toBe("github_pull_requests");
    expect(githubPullRequests.title.name).toBe("title");
    expect(githubPullRequests.titleSnapshot.name).toBe("title_snapshot");
    expect(githubPullRequests.providerUpdatedAt.name).toBe(
      "provider_updated_at"
    );
    expect(githubPullRequests.lastReconciledAt.name).toBe("last_reconciled_at");
    expect(githubPullRequests.nextReconcileAt.name).toBe("next_reconcile_at");
    expect(githubPullRequests.mergeShaVerifiedAt.name).toBe(
      "merge_sha_verified_at"
    );
    expect(githubPullRequests.reconcileUntil).toBeUndefined();
    expect(indexNames(githubPullRequests)).toContain(
      "github_pull_requests_reconciliation_idx"
    );
    expect(checkNames(githubPullRequests)).toEqual(
      expect.arrayContaining([
        "github_pull_requests_nonnegative_attempts",
        "github_pull_requests_verified_merge_sha",
      ])
    );
  });

  test("versions PR membership without requiring every member to be hydrated", () => {
    expect(getTableName(githubPullRequestVersions)).toBe(
      "github_pull_request_versions"
    );
    expect(githubPullRequestVersions.isCurrent.default).toBe(true);
    expect(indexNames(githubPullRequestVersions)).toEqual(
      expect.arrayContaining([
        "github_pull_request_versions_head_unique",
        "github_pull_request_versions_current_unique",
      ])
    );
    const headVersionIndex = config(githubPullRequestVersions).indexes.find(
      (item) => item.config.name === "github_pull_request_versions_head_unique"
    );
    expect(
      headVersionIndex?.config.columns.map((column) => column.name)
    ).toEqual(["pull_request_node_id", "head_sha"]);
    expect(indexNames(githubPullRequestMemberships)).toContain(
      "github_pull_request_memberships_commit_lookup_idx"
    );
    expect(config(githubPullRequestMemberships).foreignKeys).toHaveLength(1);
    expect(githubPullRequestMemberships.isHead.default).toBe(false);
    expect(githubPullRequestMemberships.isPrimary).toBeUndefined();
  });

  test("provides stable revisioned public identities and one-shot summaries", () => {
    expect(getTableName(githubPublicActivities)).toBe(
      "github_public_activities"
    );
    expect(githubPublicActivities.revision.default).toBe(1);
    expect(
      config(githubPublicActivities).foreignKeys.map((item) => item.getName())
    ).toContain("github_public_activities_canonical_fk");
    expect(getTableName(githubSummaryAttempts)).toBe("github_summary_attempts");
    expect(githubSummaryAttempts.state.default).toBe("pending");
    expect(checkNames(githubSummaryAttempts)).toEqual(
      expect.arrayContaining([
        "github_summary_attempts_state",
        "github_summary_attempts_complete_output",
        "github_summary_attempts_lease",
      ])
    );
  });

  test("stores authored issue milestones as first-observed snapshots", () => {
    expect(getTableName(githubIssues)).toBe("github_issues");
    expect(githubIssues.nodeId.primary).toBe(true);
    expect(githubIssues.titleSnapshot.name).toBe("title_snapshot");
    expect(githubIssues.urlSnapshot.name).toBe("url_snapshot");
    expect(indexNames(githubIssues)).toContain("github_issues_author_idx");
  });

  test("enables row-level security for every durable activity table", () => {
    const tables = [
      githubCommits,
      githubAccountCheckpoints,
      githubRepositories,
      githubRepositoryRefs,
      githubWebhookDeliveries,
      githubPushObservations,
      githubPushObservationCommits,
      githubPullRequests,
      githubPullRequestSignals,
      githubPullRequestVersions,
      githubPullRequestMemberships,
      githubIssues,
      githubPublicActivities,
      githubSummaryAttempts,
    ];

    for (const table of tables) {
      expect(config(table).enableRLS).toBe(true);
    }
  });
});
