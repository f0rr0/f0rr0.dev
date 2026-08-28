CREATE TABLE "github_issues" (
	"account" varchar(39) NOT NULL,
	"author_login" varchar(39),
	"author_user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"node_id" varchar(128) PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"title_snapshot" text NOT NULL,
	"url_snapshot" text NOT NULL,
	CONSTRAINT "github_issues_tracked_account" CHECK ("github_issues"."account" IN ('f0rr0', 'yuppiestechdev')),
	CONSTRAINT "github_issues_positive_number" CHECK ("github_issues"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "github_issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_public_activities" (
	"alias_evidence" jsonb,
	"alias_reason" varchar(64),
	"canonical_public_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"kind" varchar(16) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"public_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_at" timestamp with time zone,
	"repository_id" varchar(32) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_node_id" text NOT NULL,
	CONSTRAINT "github_public_activities_kind" CHECK ("github_public_activities"."kind" IN ('commit', 'pull_request', 'issue')),
	CONSTRAINT "github_public_activities_not_self_canonical" CHECK ("github_public_activities"."canonical_public_id" IS NULL OR "github_public_activities"."canonical_public_id" <> "github_public_activities"."public_id"),
	CONSTRAINT "github_public_activities_positive_revision" CHECK ("github_public_activities"."revision" > 0),
	CONSTRAINT "github_public_activities_alias_audit" CHECK (("github_public_activities"."canonical_public_id" IS NULL AND "github_public_activities"."alias_reason" IS NULL AND "github_public_activities"."alias_evidence" IS NULL) OR ("github_public_activities"."canonical_public_id" IS NOT NULL AND "github_public_activities"."alias_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "github_public_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_pull_request_memberships" (
	"commit_repository_id" varchar(32) NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"is_head" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"version_id" uuid NOT NULL,
	CONSTRAINT "gh_pr_memberships_pk" PRIMARY KEY("version_id","commit_repository_id","commit_sha"),
	CONSTRAINT "github_pull_request_memberships_sha_shape" CHECK ("github_pull_request_memberships"."commit_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_pull_request_memberships_nonnegative_position" CHECK ("github_pull_request_memberships"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "github_pull_request_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_pull_request_versions" (
	"base_ref_name" text,
	"base_repository_id" varchar(32),
	"base_sha" varchar(40) NOT NULL,
	"commit_count" integer,
	"head_ref_name" text,
	"head_repository_id" varchar(32),
	"head_sha" varchar(40) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"membership_complete" boolean DEFAULT false NOT NULL,
	"merge_snapshot" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"pull_request_node_id" varchar(128) NOT NULL,
	CONSTRAINT "github_pull_request_versions_sha_shapes" CHECK ("github_pull_request_versions"."base_sha" ~ '^[a-f0-9]{40}$' AND "github_pull_request_versions"."head_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_pull_request_versions_nonnegative_count" CHECK ("github_pull_request_versions"."commit_count" IS NULL OR "github_pull_request_versions"."commit_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"account" varchar(39) NOT NULL,
	"additions" integer,
	"author_login" varchar(100),
	"author_user_id" varchar(32) NOT NULL,
	"base_ref_name" text,
	"base_repository_id" varchar(32),
	"base_sha" varchar(40),
	"body" text,
	"body_snapshot" text,
	"changed_files" integer,
	"closed_at" timestamp with time zone,
	"commit_count" integer,
	"created_at" timestamp with time zone NOT NULL,
	"deletions" integer,
	"draft" boolean DEFAULT false NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"head_ref_name" text,
	"head_repository_id" varchar(32),
	"head_sha" varchar(40),
	"last_reconciled_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"merge_sha" varchar(40),
	"next_reconcile_at" timestamp with time zone,
	"node_id" varchar(128) PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"provider_file_cap_reached" boolean DEFAULT false NOT NULL,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"state" varchar(12) NOT NULL,
	"terminal_at" timestamp with time zone,
	"title" text NOT NULL,
	"title_snapshot" text NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "github_pull_requests_tracked_account" CHECK ("github_pull_requests"."account" IN ('f0rr0', 'yuppiestechdev')),
	CONSTRAINT "github_pull_requests_state" CHECK ("github_pull_requests"."state" IN ('open', 'closed', 'merged')),
	CONSTRAINT "github_pull_requests_terminal_state" CHECK (("github_pull_requests"."state" = 'open' AND "github_pull_requests"."terminal_at" IS NULL) OR ("github_pull_requests"."state" IN ('closed', 'merged') AND "github_pull_requests"."terminal_at" IS NOT NULL)),
	CONSTRAINT "github_pull_requests_merged_state" CHECK (("github_pull_requests"."state" = 'merged') = ("github_pull_requests"."merged_at" IS NOT NULL)),
	CONSTRAINT "github_pull_requests_sha_shapes" CHECK (("github_pull_requests"."base_sha" IS NULL OR "github_pull_requests"."base_sha" ~ '^[a-f0-9]{40}$') AND ("github_pull_requests"."head_sha" IS NULL OR "github_pull_requests"."head_sha" ~ '^[a-f0-9]{40}$') AND ("github_pull_requests"."merge_sha" IS NULL OR "github_pull_requests"."merge_sha" ~ '^[a-f0-9]{40}$')),
	CONSTRAINT "github_pull_requests_positive_number" CHECK ("github_pull_requests"."number" > 0),
	CONSTRAINT "github_pull_requests_nonnegative_counts" CHECK (("github_pull_requests"."changed_files" IS NULL OR "github_pull_requests"."changed_files" >= 0) AND ("github_pull_requests"."additions" IS NULL OR "github_pull_requests"."additions" >= 0) AND ("github_pull_requests"."deletions" IS NULL OR "github_pull_requests"."deletions" >= 0) AND ("github_pull_requests"."commit_count" IS NULL OR "github_pull_requests"."commit_count" >= 0))
);
--> statement-breakpoint
ALTER TABLE "github_pull_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_push_observation_commits" (
	"observation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"sha" varchar(40) NOT NULL,
	CONSTRAINT "gh_push_observation_commits_pk" PRIMARY KEY("observation_id","repository_id","sha"),
	CONSTRAINT "github_push_observation_commits_sha_shape" CHECK ("github_push_observation_commits"."sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_push_observation_commits_nonnegative_position" CHECK ("github_push_observation_commits"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "github_push_observation_commits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_push_observations" (
	"account" varchar(39) NOT NULL,
	"after_sha" varchar(40) NOT NULL,
	"before_sha" varchar(40) NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" varchar(80),
	"expected_commit_count" integer,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_created_at" timestamp with time zone,
	"ref_name" text NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"repository_name_snapshot" varchar(200) NOT NULL,
	"source" varchar(16) NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	CONSTRAINT "github_push_observations_tracked_account" CHECK ("github_push_observations"."account" IN ('f0rr0', 'yuppiestechdev')),
	CONSTRAINT "github_push_observations_source" CHECK ("github_push_observations"."source" IN ('webhook', 'events')),
	CONSTRAINT "github_push_observations_sha_shape" CHECK ("github_push_observations"."before_sha" ~ '^[a-f0-9]{40}$' AND "github_push_observations"."after_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_push_observations_nonnegative_count" CHECK ("github_push_observations"."expected_commit_count" IS NULL OR "github_push_observations"."expected_commit_count" >= 0),
	CONSTRAINT "github_push_observations_state" CHECK ("github_push_observations"."state" IN ('pending', 'processing', 'complete', 'deferred', 'unavailable')),
	CONSTRAINT "github_push_observations_lease" CHECK (("github_push_observations"."state" = 'processing') = ("github_push_observations"."lease_token" IS NOT NULL) AND ("github_push_observations"."state" <> 'processing' OR "github_push_observations"."lease_until" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "github_push_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_repositories" (
	"default_branch" varchar(255),
	"description" text,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"homepage_url" text,
	"html_url" text,
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_avatar_url" text,
	"owner_id" varchar(32),
	"owner_login" varchar(39),
	"owner_type" varchar(12),
	"topics" jsonb,
	"visibility" varchar(12),
	CONSTRAINT "github_repositories_owner_type" CHECK ("github_repositories"."owner_type" IS NULL OR "github_repositories"."owner_type" IN ('Organization', 'User')),
	CONSTRAINT "github_repositories_visibility" CHECK ("github_repositories"."visibility" IS NULL OR "github_repositories"."visibility" IN ('public', 'private', 'internal')),
	CONSTRAINT "github_repositories_topics_array" CHECK ("github_repositories"."topics" IS NULL OR jsonb_typeof("github_repositories"."topics") = 'array'),
	CONSTRAINT "github_repositories_observation_order" CHECK ("github_repositories"."last_observed_at" >= "github_repositories"."first_observed_at")
);
--> statement-breakpoint
ALTER TABLE "github_repositories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_summary_attempts" (
	"activity_public_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" varchar(80),
	"input_hash" varchar(64),
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"model" varchar(64),
	"recipe" varchar(100),
	"revision" integer NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"summary_headline" text,
	"summary_short" text,
	CONSTRAINT "gh_summary_attempts_pk" PRIMARY KEY("activity_public_id","revision"),
	CONSTRAINT "github_summary_attempts_state" CHECK ("github_summary_attempts"."state" IN ('pending', 'processing', 'complete', 'failed', 'indeterminate')),
	CONSTRAINT "github_summary_attempts_positive_revision" CHECK ("github_summary_attempts"."revision" > 0),
	CONSTRAINT "github_summary_attempts_input_hash_shape" CHECK ("github_summary_attempts"."input_hash" IS NULL OR "github_summary_attempts"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "github_summary_attempts_summary_pair" CHECK (("github_summary_attempts"."summary_headline" IS NULL) = ("github_summary_attempts"."summary_short" IS NULL)),
	CONSTRAINT "github_summary_attempts_complete_output" CHECK ("github_summary_attempts"."state" <> 'complete' OR ("github_summary_attempts"."summary_headline" IS NOT NULL AND "github_summary_attempts"."completed_at" IS NOT NULL)),
	CONSTRAINT "github_summary_attempts_lease" CHECK (("github_summary_attempts"."state" = 'processing') = ("github_summary_attempts"."lease_token" IS NOT NULL) AND ("github_summary_attempts"."state" <> 'processing' OR "github_summary_attempts"."lease_until" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "github_summary_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_webhook_deliveries" (
	"accepted" boolean NOT NULL,
	"account" varchar(39),
	"action" varchar(40),
	"delivery_id" varchar(36) PRIMARY KEY NOT NULL,
	"event" varchar(40) NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"repository_id" varchar(32),
	CONSTRAINT "github_webhook_deliveries_id_shape" CHECK ("github_webhook_deliveries"."delivery_id" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
	CONSTRAINT "github_webhook_deliveries_event_shape" CHECK ("github_webhook_deliveries"."event" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "github_webhook_deliveries_action_shape" CHECK ("github_webhook_deliveries"."action" IS NULL OR "github_webhook_deliveries"."action" ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "github_webhook_deliveries_repository_id_shape" CHECK ("github_webhook_deliveries"."repository_id" IS NULL OR "github_webhook_deliveries"."repository_id" ~ '^[0-9]{1,32}$'),
	CONSTRAINT "github_webhook_deliveries_tracked_account" CHECK ("github_webhook_deliveries"."account" IS NULL OR "github_webhook_deliveries"."account" IN ('f0rr0', 'yuppiestechdev'))
);
--> statement-breakpoint
ALTER TABLE "github_webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" DROP CONSTRAINT "github_account_checkpoints_event_id_shape";--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "gap_detected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "gap_expected_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "gap_oldest_available_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "gap_state" varchar(12) DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "authored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "author_user_id" varchar(32);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "canonicalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "change_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "committer_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "committer_user_id" varchar(32);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "enrichment_error" varchar(80);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "enrichment_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "enrichment_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "enrichment_state" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "fingerprint_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "first_observed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "full_message" text;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "parent_shas" jsonb;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "pr_discovery_error" varchar(80);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "pr_discovery_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "pr_discovery_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "pr_discovery_state" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "tree_sha" varchar(40);--> statement-breakpoint
ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_public_activities" ADD CONSTRAINT "github_public_activities_canonical_fk" FOREIGN KEY ("canonical_public_id") REFERENCES "public"."github_public_activities"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_request_memberships" ADD CONSTRAINT "gh_pr_memberships_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."github_pull_request_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD CONSTRAINT "gh_pr_versions_pull_request_fk" FOREIGN KEY ("pull_request_node_id") REFERENCES "public"."github_pull_requests"("node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_push_observation_commits" ADD CONSTRAINT "gh_push_observation_commits_observation_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."github_push_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_push_observations" ADD CONSTRAINT "gh_push_observations_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_summary_attempts" ADD CONSTRAINT "gh_summary_attempts_activity_fk" FOREIGN KEY ("activity_public_id") REFERENCES "public"."github_public_activities"("public_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_issues_repository_number_unique" ON "github_issues" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "github_issues_author_idx" ON "github_issues" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_public_activities_source_unique" ON "github_public_activities" USING btree ("kind","repository_id","source_node_id");--> statement-breakpoint
CREATE INDEX "github_public_activities_cursor_idx" ON "github_public_activities" USING btree ("occurred_at","public_id");--> statement-breakpoint
CREATE INDEX "github_public_activities_canonical_idx" ON "github_public_activities" USING btree ("canonical_public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_request_memberships_position_unique" ON "github_pull_request_memberships" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "github_pull_request_memberships_commit_lookup_idx" ON "github_pull_request_memberships" USING btree ("commit_repository_id","commit_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_request_versions_head_unique" ON "github_pull_request_versions" USING btree ("pull_request_node_id","head_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_request_versions_current_unique" ON "github_pull_request_versions" USING btree ("pull_request_node_id") WHERE "github_pull_request_versions"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_requests_repository_number_unique" ON "github_pull_requests" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "github_pull_requests_reconciliation_idx" ON "github_pull_requests" USING btree ("account","state","next_reconcile_at","created_at");--> statement-breakpoint
CREATE INDEX "github_pull_requests_author_idx" ON "github_pull_requests" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_push_observation_commits_position_unique" ON "github_push_observation_commits" USING btree ("observation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "github_push_observations_source_unique" ON "github_push_observations" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_push_observations_push_unique" ON "github_push_observations" USING btree ("repository_id","ref_name","before_sha","after_sha");--> statement-breakpoint
CREATE INDEX "github_push_observations_pending_idx" ON "github_push_observations" USING btree ("state","lease_until","observed_at");--> statement-breakpoint
CREATE INDEX "github_push_observations_account_idx" ON "github_push_observations" USING btree ("account","observed_at");--> statement-breakpoint
CREATE INDEX "github_repositories_full_name_idx" ON "github_repositories" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "github_summary_attempts_pending_idx" ON "github_summary_attempts" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "github_webhook_deliveries_audit_idx" ON "github_webhook_deliveries" USING btree ("event","observed_at");--> statement-breakpoint
CREATE INDEX "github_commits_enrichment_pending_idx" ON "github_commits" USING btree ("enrichment_state","enrichment_lease_until","committed_at");--> statement-breakpoint
CREATE INDEX "github_commits_canonicalization_pending_idx" ON "github_commits" USING btree ("canonicalized_at","first_observed_at");--> statement-breakpoint
CREATE INDEX "github_commits_pr_discovery_pending_idx" ON "github_commits" USING btree ("pr_discovery_state","pr_discovery_lease_until","first_observed_at");--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_gap_state" CHECK ("github_account_checkpoints"."gap_state" IN ('clear', 'detected'));--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_gap_details" CHECK (("github_account_checkpoints"."gap_state" = 'detected' AND "github_account_checkpoints"."gap_detected_at" IS NOT NULL) OR ("github_account_checkpoints"."gap_state" = 'clear' AND "github_account_checkpoints"."gap_detected_at" IS NULL AND "github_account_checkpoints"."gap_expected_event_id" IS NULL AND "github_account_checkpoints"."gap_oldest_available_event_id" IS NULL));--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_event_id_shape" CHECK (("github_account_checkpoints"."latest_event_id" IS NULL OR "github_account_checkpoints"."latest_event_id" ~ '^[0-9]{1,64}$') AND ("github_account_checkpoints"."gap_expected_event_id" IS NULL OR "github_account_checkpoints"."gap_expected_event_id" ~ '^[0-9]{1,64}$') AND ("github_account_checkpoints"."gap_oldest_available_event_id" IS NULL OR "github_account_checkpoints"."gap_oldest_available_event_id" ~ '^[0-9]{1,64}$'));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_tree_sha_shape" CHECK ("github_commits"."tree_sha" IS NULL OR "github_commits"."tree_sha" ~ '^[a-f0-9]{40}$');--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_fingerprint_shape" CHECK ("github_commits"."change_fingerprint" IS NULL OR "github_commits"."change_fingerprint" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_fingerprint_completeness" CHECK (NOT "github_commits"."fingerprint_complete" OR "github_commits"."change_fingerprint" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_parent_shas_array" CHECK ("github_commits"."parent_shas" IS NULL OR jsonb_typeof("github_commits"."parent_shas") = 'array');--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_enrichment_state" CHECK ("github_commits"."enrichment_state" IN ('pending', 'processing', 'complete', 'unavailable'));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_enrichment_lease" CHECK (("github_commits"."enrichment_state" = 'processing') = ("github_commits"."enrichment_lease_token" IS NOT NULL) AND ("github_commits"."enrichment_state" <> 'processing' OR "github_commits"."enrichment_lease_until" IS NOT NULL) AND ("github_commits"."enrichment_state" NOT IN ('complete', 'unavailable') OR "github_commits"."enrichment_lease_until" IS NULL));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_pr_discovery_state" CHECK ("github_commits"."pr_discovery_state" IN ('pending', 'processing', 'complete', 'unavailable'));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_pr_discovery_lease" CHECK (("github_commits"."pr_discovery_state" = 'processing') = ("github_commits"."pr_discovery_lease_token" IS NOT NULL) AND ("github_commits"."pr_discovery_state" <> 'processing' OR "github_commits"."pr_discovery_lease_until" IS NOT NULL) AND ("github_commits"."pr_discovery_state" NOT IN ('complete', 'unavailable') OR "github_commits"."pr_discovery_lease_until" IS NULL));
--> statement-breakpoint
-- Keep the legacy commit columns as a one-release rollout bridge, but move all
-- runtime identity and completed summary state into the new append-only tables.
INSERT INTO "github_repositories" (
	"id",
	"full_name",
	"html_url",
	"owner_avatar_url",
	"owner_login",
	"owner_type",
	"visibility",
	"first_observed_at",
	"last_observed_at"
)
SELECT DISTINCT ON ("repository_id")
	"repository_id",
	"repository",
	'https://github.com/' || "repository",
	"repository_owner_avatar_url",
	"repository_owner_login",
	"repository_owner_type",
	CASE
		WHEN "repository_private" IS TRUE THEN 'private'
		WHEN "repository_private" IS FALSE THEN 'public'
		ELSE NULL
	END,
	MIN("committed_at") OVER (PARTITION BY "repository_id"),
	MAX("committed_at") OVER (PARTITION BY "repository_id")
FROM "github_commits"
ORDER BY "repository_id", "committed_at" DESC, "sha" DESC
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "github_commits"
SET "first_observed_at" = "committed_at";
--> statement-breakpoint
INSERT INTO "github_public_activities" (
	"public_id",
	"created_at",
	"kind",
	"occurred_at",
	"published_at",
	"repository_id",
	"revision",
	"source_node_id"
)
SELECT
	COALESCE("activity_public_id", gen_random_uuid()),
	"committed_at",
	'commit',
	"committed_at",
	CASE
		WHEN "summary_headline" IS NOT NULL AND "summary_short" IS NOT NULL
			THEN COALESCE("summary_attempted_at", "committed_at")
		ELSE NULL
	END,
	"repository_id",
	1,
	"sha"
FROM "github_commits"
ON CONFLICT ("kind", "repository_id", "source_node_id") DO NOTHING;
--> statement-breakpoint
UPDATE "github_commits" AS "commit"
SET "activity_public_id" = "activity"."public_id"
FROM "github_public_activities" AS "activity"
WHERE "activity"."kind" = 'commit'
	AND "activity"."repository_id" = "commit"."repository_id"
	AND "activity"."source_node_id" = "commit"."sha";
--> statement-breakpoint
INSERT INTO "github_summary_attempts" (
	"activity_public_id",
	"attempted_at",
	"completed_at",
	"created_at",
	"error_code",
	"input_hash",
	"model",
	"recipe",
	"revision",
	"state",
	"summary_headline",
	"summary_short"
)
SELECT
	"activity_public_id",
	COALESCE("summary_attempted_at", "committed_at"),
	COALESCE("summary_attempted_at", "committed_at"),
	COALESCE("summary_attempted_at", "committed_at"),
	CASE
		WHEN "summary_headline" IS NOT NULL AND "summary_short" IS NOT NULL THEN NULL
		ELSE COALESCE("summary_error", 'legacy_failed')
	END,
	"summary_input_hash",
	"summary_model",
	"summary_recipe",
	1,
	CASE
		WHEN "summary_headline" IS NOT NULL AND "summary_short" IS NOT NULL THEN 'complete'
		ELSE 'failed'
	END,
	"summary_headline",
	"summary_short"
FROM "github_commits"
WHERE "activity_public_id" IS NOT NULL
	AND (
		("summary_headline" IS NOT NULL AND "summary_short" IS NOT NULL)
		OR "summary_attempted_at" IS NOT NULL
		OR "summary_error" IS NOT NULL
	)
ON CONFLICT ("activity_public_id", "revision") DO NOTHING;
