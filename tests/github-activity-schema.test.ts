import { describe, expect, test } from "bun:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  githubAccountCheckpoints,
  githubCommits,
  githubIssues,
  githubPublicFeedHead,
  githubPullRequestMemberships,
  githubPullRequests,
  githubPullRequestSignals,
  githubPullRequestVersions,
  githubPushObservationCommits,
  githubPushObservations,
  githubRepositories,
  githubRepositoryRefs,
  githubWebhookDeliveries,
  githubWorkUnitAcceptedSummaries,
  githubWorkUnitMemberships,
  githubWorkUnitSummaryAttempts,
  githubWorkUnitSummaryDailyUsage,
  githubWorkUnits,
} from "../src/db/schema.ts";

const config = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table);
const checkNames = (table: Parameters<typeof getTableConfig>[0]) =>
  config(table).checks.map((item) => item.name);
const indexNames = (table: Parameters<typeof getTableConfig>[0]) =>
  config(table).indexes.map((item) => item.config.name);

describe("GitHub activity persistence schema", () => {
  test("keeps compact commit identity and durable enrichment state", () => {
    expect(githubCommits.repositoryId.primary).toBe(false);
    expect(githubCommits.enrichmentState.default).toBe("pending");
    expect(githubCommits.enrichmentState.notNull).toBe(true);
    expect(githubCommits.pullRequestDiscoveryState.default).toBe("pending");
    expect(githubCommits.fileFactsComplete.default).toBe(false);
    expect(indexNames(githubCommits)).toContain(
      "github_commits_pr_discovery_pending_idx"
    );
    expect(checkNames(githubCommits)).toEqual(
      expect.arrayContaining([
        "github_commits_enrichment_state",
        "github_commits_enrichment_lease",
        "github_commits_file_facts_completeness",
        "github_commits_pr_discovery_lease",
        "github_commits_pr_discovery_state",
      ])
    );
    expect(
      config(githubCommits).foreignKeys.map((item) => item.getName())
    ).toContain("github_commits_repository_fk");
  });

  test("records checkpoint gaps and idempotent push discovery before hydration", () => {
    expect(githubAccountCheckpoints.gapState.default).toBe("clear");
    expect(githubAccountCheckpoints.refBackfillSinceAt.hasDefault).toBe(true);
    expect(githubAccountCheckpoints.refBackfillSinceAt.notNull).toBe(true);
    expect(checkNames(githubAccountCheckpoints)).toEqual(
      expect.arrayContaining([
        "github_account_checkpoints_ref_leases",
        "github_account_checkpoints_ref_scans",
        "github_account_checkpoints_pr_backfill_digest",
      ])
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

  test("deduplicates webhook deliveries", () => {
    expect(githubWebhookDeliveries.deliveryId.primary).toBe(true);
    expect(githubWebhookDeliveries.accepted.notNull).toBe(true);
    expect(githubWebhookDeliveries.observedAt.hasDefault).toBe(true);
    expect(githubWebhookDeliveries.repositoryId.notNull).toBe(false);
    expect(checkNames(githubWebhookDeliveries)).toEqual(
      expect.arrayContaining([
        "github_webhook_deliveries_id_shape",
        "github_webhook_deliveries_tracked_account",
      ])
    );
  });

  test("stores mutable PR state separately from immutable discovery snapshots", () => {
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
      headVersionIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined
      )
    ).toEqual(["pull_request_node_id", "head_sha"]);
    expect(indexNames(githubPullRequestMemberships)).toContain(
      "github_pull_request_memberships_commit_lookup_idx"
    );
    expect(config(githubPullRequestMemberships).foreignKeys).toHaveLength(1);
    expect(githubPullRequestMemberships.isHead.default).toBe(false);
  });

  test("stores current and durable work-unit summaries, usage, and feed head", () => {
    expect(indexNames(githubWorkUnitMemberships)).toContain(
      "gh_work_unit_memberships_commit_unique"
    );
    expect(githubWorkUnitSummaryAttempts.state.default).toBe("pending");
    expect(checkNames(githubWorkUnitSummaryAttempts)).toEqual(
      expect.arrayContaining([
        "gh_work_unit_summary_state",
        "gh_work_unit_summary_accepted_output",
        "gh_work_unit_summary_lease",
      ])
    );
    expect(config(githubWorkUnitAcceptedSummaries).foreignKeys).toHaveLength(0);
    expect(githubWorkUnitSummaryDailyUsage.day.primary).toBe(true);
    expect(githubWorkUnitSummaryDailyUsage.startedRequests.default).toBe(0);
    expect(checkNames(githubWorkUnitSummaryDailyUsage)).not.toContain(
      "gh_work_unit_summary_daily_usage_cap"
    );
    expect(githubPublicFeedHead.summarizing.default).toBe(false);
  });

  test("stores authored issue milestones as first-observed snapshots", () => {
    expect(githubIssues.nodeId.primary).toBe(true);
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
      githubWorkUnits,
      githubWorkUnitAcceptedSummaries,
      githubWorkUnitSummaryAttempts,
      githubWorkUnitSummaryDailyUsage,
      githubPublicFeedHead,
    ];

    for (const table of tables) {
      expect(config(table).enableRLS).toBe(true);
    }
  });
});
