CREATE TABLE "github_account_repository_catalogs" (
	"account_user_id" varchar(32) NOT NULL,
	"active_access" boolean DEFAULT true NOT NULL,
	"inventory_generation" bigint NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	CONSTRAINT "gh_account_repo_catalogs_pk" PRIMARY KEY("account_user_id","repository_id"),
	CONSTRAINT "gh_account_repo_catalogs_generation" CHECK ("github_account_repository_catalogs"."inventory_generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "github_account_repository_catalogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_commit_pull_request_associations" (
	"commit_repository_id" varchar(32) NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"pull_request_node_id" varchar(128) NOT NULL,
	CONSTRAINT "gh_commit_pr_associations_pk" PRIMARY KEY("commit_repository_id","commit_sha","pull_request_node_id"),
	CONSTRAINT "gh_commit_pr_associations_sha_shape" CHECK ("github_commit_pull_request_associations"."commit_sha" ~ '^[a-f0-9]{40}$')
);
--> statement-breakpoint
ALTER TABLE "github_commit_pull_request_associations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_public_feed_head" (
	"feed_revision" bigint DEFAULT 0 NOT NULL,
	"head_content_revision" bigint DEFAULT 0 NOT NULL,
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"last_published_at" timestamp with time zone,
	"ordering_revision" bigint DEFAULT 0 NOT NULL,
	"summarizing" boolean DEFAULT false NOT NULL,
	CONSTRAINT "gh_public_feed_head_singleton" CHECK ("github_public_feed_head"."id"),
	CONSTRAINT "gh_public_feed_head_revisions" CHECK ("github_public_feed_head"."feed_revision" >= 0 AND "github_public_feed_head"."head_content_revision" >= 0 AND "github_public_feed_head"."ordering_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "github_public_feed_head" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_ref_generations" (
	"branch_lineage_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"coverage_since_at" timestamp with time zone NOT NULL,
	"generation" bigint NOT NULL,
	"head_sha" varchar(40) NOT NULL,
	"ref_name" text NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	CONSTRAINT "gh_ref_generations_pk" PRIMARY KEY("repository_id","ref_name"),
	CONSTRAINT "gh_ref_generations_version_unique" UNIQUE("repository_id","ref_name","generation"),
	CONSTRAINT "gh_ref_generations_head_name" CHECK ("github_ref_generations"."ref_name" LIKE 'refs/heads/%'),
	CONSTRAINT "gh_ref_generations_sha_shape" CHECK ("github_ref_generations"."head_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "gh_ref_generations_positive" CHECK ("github_ref_generations"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "github_ref_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_ref_memberships" (
	"commit_repository_id" varchar(32) NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"generation" bigint NOT NULL,
	"position" integer NOT NULL,
	"ref_name" text NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	CONSTRAINT "gh_ref_memberships_pk" PRIMARY KEY("repository_id","ref_name","commit_repository_id","commit_sha"),
	CONSTRAINT "gh_ref_memberships_values" CHECK ("github_ref_memberships"."generation" > 0 AND "github_ref_memberships"."position" >= 0 AND "github_ref_memberships"."commit_sha" ~ '^[a-f0-9]{40}$')
);
--> statement-breakpoint
ALTER TABLE "github_ref_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_repository_inventory_heads" (
	"account_login" varchar(39) NOT NULL,
	"account_user_id" varchar(32) PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone,
	"generation" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gh_repo_inventory_head_account_id" CHECK ("github_repository_inventory_heads"."account_user_id" ~ '^[0-9]{1,32}$'),
	CONSTRAINT "gh_repo_inventory_head_generation" CHECK (("github_repository_inventory_heads"."generation" = 0 AND "github_repository_inventory_heads"."completed_at" IS NULL) OR ("github_repository_inventory_heads"."generation" > 0 AND "github_repository_inventory_heads"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "github_repository_inventory_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_work_unit_memberships" (
	"logical_repository_id" varchar(32) NOT NULL,
	"logical_sha" varchar(40) NOT NULL,
	"position" integer NOT NULL,
	"work_unit_id" uuid NOT NULL,
	CONSTRAINT "gh_work_unit_memberships_pk" PRIMARY KEY("work_unit_id","logical_repository_id","logical_sha"),
	CONSTRAINT "gh_work_unit_memberships_values" CHECK ("github_work_unit_memberships"."position" >= 0 AND "github_work_unit_memberships"."logical_sha" ~ '^[a-f0-9]{40}$')
);
--> statement-breakpoint
ALTER TABLE "github_work_unit_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_work_unit_summary_attempts" (
	"accepted_at" timestamp with time zone,
	"attribution_mode" varchar(32) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"debounce_until" timestamp with time zone NOT NULL,
	"input_tokens" integer,
	"last_started_at" timestamp with time zone,
	"latency_ms" integer,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"model" varchar(64),
	"outcome" text,
	"outcome_digest" varchar(64) NOT NULL,
	"output_tokens" integer,
	"recipe" varchar(100) NOT NULL,
	"request_payload" text,
	"revision" integer NOT NULL,
	"started_requests" integer DEFAULT 0 NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"summary_input_digest" varchar(64) NOT NULL,
	"unit_revision" integer NOT NULL,
	"work_unit_id" uuid NOT NULL,
	CONSTRAINT "gh_work_unit_summary_attempts_pk" PRIMARY KEY("work_unit_id","revision"),
	CONSTRAINT "gh_work_unit_summary_state" CHECK ("github_work_unit_summary_attempts"."state" IN ('pending', 'processing', 'retryable', 'accepted', 'terminal')),
	CONSTRAINT "gh_work_unit_summary_digests" CHECK ("github_work_unit_summary_attempts"."outcome_digest" ~ '^[a-f0-9]{64}$' AND "github_work_unit_summary_attempts"."summary_input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "gh_work_unit_summary_attribution" CHECK ("github_work_unit_summary_attempts"."attribution_mode" IN ('tracked_authored_pr', 'foreign_pr_contribution', 'canonical_owned_composite', 'branch_owned_composite')),
	CONSTRAINT "gh_work_unit_summary_revisions" CHECK ("github_work_unit_summary_attempts"."revision" > 0 AND "github_work_unit_summary_attempts"."unit_revision" > 0 AND "github_work_unit_summary_attempts"."started_requests" BETWEEN 0 AND 2),
	CONSTRAINT "gh_work_unit_summary_lease" CHECK (("github_work_unit_summary_attempts"."lease_token" IS NULL) = ("github_work_unit_summary_attempts"."lease_until" IS NULL) AND ("github_work_unit_summary_attempts"."state" = 'processing') = ("github_work_unit_summary_attempts"."lease_token" IS NOT NULL) AND ("github_work_unit_summary_attempts"."state" <> 'processing' OR ("github_work_unit_summary_attempts"."started_requests" > 0 AND "github_work_unit_summary_attempts"."request_payload" IS NOT NULL))),
	CONSTRAINT "gh_work_unit_summary_terminal_payload" CHECK ("github_work_unit_summary_attempts"."state" NOT IN ('accepted', 'terminal') OR "github_work_unit_summary_attempts"."request_payload" IS NULL),
	CONSTRAINT "gh_work_unit_summary_accepted_output" CHECK (("github_work_unit_summary_attempts"."state" = 'accepted' AND "github_work_unit_summary_attempts"."outcome" IS NOT NULL AND "github_work_unit_summary_attempts"."accepted_at" IS NOT NULL AND "github_work_unit_summary_attempts"."completed_at" IS NOT NULL) OR ("github_work_unit_summary_attempts"."state" <> 'accepted' AND "github_work_unit_summary_attempts"."outcome" IS NULL AND "github_work_unit_summary_attempts"."accepted_at" IS NULL AND ("github_work_unit_summary_attempts"."state" <> 'terminal' OR "github_work_unit_summary_attempts"."completed_at" IS NOT NULL))),
	CONSTRAINT "gh_work_unit_summary_started" CHECK (("github_work_unit_summary_attempts"."started_requests" = 0) = ("github_work_unit_summary_attempts"."last_started_at" IS NULL) AND ("github_work_unit_summary_attempts"."state" <> 'retryable' OR "github_work_unit_summary_attempts"."request_payload" IS NOT NULL)),
	CONSTRAINT "gh_work_unit_summary_request_cap" CHECK ("github_work_unit_summary_attempts"."request_payload" IS NULL OR octet_length("github_work_unit_summary_attempts"."request_payload") <= 393216),
	CONSTRAINT "gh_work_unit_summary_metrics" CHECK (("github_work_unit_summary_attempts"."input_tokens" IS NULL OR "github_work_unit_summary_attempts"."input_tokens" >= 0) AND ("github_work_unit_summary_attempts"."output_tokens" IS NULL OR "github_work_unit_summary_attempts"."output_tokens" >= 0) AND ("github_work_unit_summary_attempts"."latency_ms" IS NULL OR "github_work_unit_summary_attempts"."latency_ms" >= 0))
);
--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_work_unit_summary_daily_usage" (
	"day" date PRIMARY KEY NOT NULL,
	"started_requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gh_work_unit_summary_daily_usage_cap" CHECK ("github_work_unit_summary_daily_usage"."started_requests" BETWEEN 0 AND 12)
);
--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_daily_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_work_units" (
	"activity_anchor_at" timestamp with time zone NOT NULL,
	"activity_at" timestamp with time zone NOT NULL,
	"activity_day" date NOT NULL,
	"additions" integer NOT NULL,
	"attribution_mode" varchar(32) NOT NULL,
	"branch_lineage_id" uuid,
	"content_observed_at" timestamp with time zone NOT NULL,
	"deletions" integer NOT NULL,
	"facts_digest" varchar(64) NOT NULL,
	"file_count" integer NOT NULL,
	"first_activity_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_key" varchar(180) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"languages" jsonb,
	"last_activity_at" timestamp with time zone NOT NULL,
	"member_count" integer NOT NULL,
	"membership_digest" varchar(64) NOT NULL,
	"newest_commit_repository_id" varchar(32) NOT NULL,
	"newest_commit_sha" varchar(40) NOT NULL,
	"outcome_digest" varchar(64),
	"pull_request_node_id" varchar(128),
	"repository_id" varchar(32) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"summary_input_digest" varchar(64),
	"visibility" varchar(8) NOT NULL,
	CONSTRAINT "gh_work_units_kind" CHECK ("github_work_units"."kind" IN ('pull_request', 'canonical_day', 'branch')),
	CONSTRAINT "gh_work_units_owner_shape" CHECK (("github_work_units"."kind" = 'pull_request' AND "github_work_units"."pull_request_node_id" IS NOT NULL AND "github_work_units"."branch_lineage_id" IS NULL) OR ("github_work_units"."kind" = 'canonical_day' AND "github_work_units"."pull_request_node_id" IS NULL AND "github_work_units"."branch_lineage_id" IS NULL) OR ("github_work_units"."kind" = 'branch' AND "github_work_units"."pull_request_node_id" IS NULL AND "github_work_units"."branch_lineage_id" IS NOT NULL)),
	CONSTRAINT "gh_work_units_identity" CHECK (("github_work_units"."kind" = 'pull_request' AND "github_work_units"."identity_key" = 'pr:' || "github_work_units"."pull_request_node_id") OR ("github_work_units"."kind" = 'canonical_day' AND "github_work_units"."identity_key" = 'canonical:' || "github_work_units"."repository_id" || ':' || "github_work_units"."activity_day"::text) OR ("github_work_units"."kind" = 'branch' AND "github_work_units"."identity_key" = 'branch:' || "github_work_units"."branch_lineage_id"::text)),
	CONSTRAINT "gh_work_units_attribution_mode" CHECK ("github_work_units"."attribution_mode" IN ('tracked_authored_pr', 'foreign_pr_contribution', 'canonical_owned_composite', 'branch_owned_composite')),
	CONSTRAINT "gh_work_units_kind_attribution" CHECK (("github_work_units"."kind" = 'pull_request' AND "github_work_units"."attribution_mode" IN ('tracked_authored_pr', 'foreign_pr_contribution')) OR ("github_work_units"."kind" = 'canonical_day' AND "github_work_units"."attribution_mode" = 'canonical_owned_composite') OR ("github_work_units"."kind" = 'branch' AND "github_work_units"."attribution_mode" = 'branch_owned_composite')),
	CONSTRAINT "gh_work_units_visibility" CHECK ("github_work_units"."visibility" IN ('public', 'private')),
	CONSTRAINT "gh_work_units_nonnegative_facts" CHECK ("github_work_units"."member_count" > 0 AND "github_work_units"."file_count" >= 0 AND "github_work_units"."additions" >= 0 AND "github_work_units"."deletions" >= 0 AND "github_work_units"."revision" > 0),
	CONSTRAINT "gh_work_units_activity_order" CHECK ("github_work_units"."first_activity_at" <= "github_work_units"."last_activity_at" AND "github_work_units"."activity_day" = ("github_work_units"."activity_at" AT TIME ZONE 'UTC')::date),
	CONSTRAINT "gh_work_units_digest_shapes" CHECK ("github_work_units"."facts_digest" ~ '^[a-f0-9]{64}$' AND "github_work_units"."membership_digest" ~ '^[a-f0-9]{64}$' AND ("github_work_units"."outcome_digest" IS NULL OR "github_work_units"."outcome_digest" ~ '^[a-f0-9]{64}$') AND ("github_work_units"."summary_input_digest" IS NULL OR "github_work_units"."summary_input_digest" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "gh_work_units_languages_array" CHECK ("github_work_units"."languages" IS NULL OR jsonb_typeof("github_work_units"."languages") = 'array')
);
--> statement-breakpoint
ALTER TABLE "github_work_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "github_public_activities" CASCADE;--> statement-breakpoint
DROP TABLE "github_summary_attempts" CASCADE;--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_tree_sha_shape";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_fingerprint_shape";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_fingerprint_completeness";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_summary_hash_shape";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_summary_pair";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_nonnegative_activity_counts";--> statement-breakpoint
DROP INDEX "github_commits_activity_public_id_unique";--> statement-breakpoint
DROP INDEX "github_commits_activity_cursor_idx";--> statement-breakpoint
DROP INDEX "github_commits_summary_pending_idx";--> statement-breakpoint
DROP INDEX "github_commits_canonicalization_pending_idx";--> statement-breakpoint
DROP INDEX "github_commits_exact_authored_change_idx";--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "file_facts" jsonb;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "file_facts_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD COLUMN "file_facts" jsonb;--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD COLUMN "file_facts_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "github_commits"
SET "enrichment_state" = 'pending',
    "enrichment_error" = NULL,
    "enrichment_lease_token" = NULL,
    "enrichment_lease_until" = NULL
WHERE "enrichment_state" = 'complete' AND "file_facts" IS NULL;--> statement-breakpoint
UPDATE "github_pull_requests" AS "pull_request"
SET "next_reconcile_at" = now(), "reconcile_error" = NULL
FROM "github_pull_request_versions" AS "version"
WHERE "version"."pull_request_node_id" = "pull_request"."node_id"
  AND "version"."is_current"
  AND "version"."file_facts" IS NULL;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "facts_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "branch_lineage_id" uuid;--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "projection_relevant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "repair_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "repair_error" varchar(80);--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "repair_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD COLUMN "repair_lease_until" timestamp with time zone;--> statement-breakpoint
UPDATE "github_repository_refs" SET "branch_lineage_id" = gen_random_uuid() WHERE "kind" = 'head';--> statement-breakpoint
UPDATE "github_repository_refs" AS "ref"
SET "projection_relevant" = true
FROM "github_repositories" AS "repository"
WHERE "ref"."repository_id" = "repository"."id"
  AND "ref"."kind" = 'head'
  AND (
    (
      "repository"."default_branch" IS NOT NULL
      AND "ref"."ref_name" = 'refs/heads/' || "repository"."default_branch"
    )
    OR EXISTS (
      SELECT 1
      FROM "github_commits" AS "commit"
      WHERE "commit"."repository_id" = "ref"."repository_id"
        AND "commit"."sha" = "ref"."head_sha"
    )
    OR EXISTS (
      SELECT 1
      FROM "github_push_observations" AS "observation"
      WHERE "observation"."repository_id" = "ref"."repository_id"
        AND "observation"."ref_name" = "ref"."ref_name"
    )
    OR EXISTS (
      SELECT 1
      FROM "github_pull_request_versions" AS "version"
      WHERE "version"."is_current"
        AND "version"."head_repository_id" = "ref"."repository_id"
        AND "version"."head_ref_name" IS NOT NULL
        AND "ref"."ref_name" = 'refs/heads/' || "version"."head_ref_name"
    )
  );--> statement-breakpoint
UPDATE "github_repositories" SET "facts_verified_at" = "last_observed_at" WHERE "visibility" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "github_account_repository_catalogs" ADD CONSTRAINT "gh_account_repo_catalogs_account_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."github_repository_inventory_heads"("account_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_account_repository_catalogs" ADD CONSTRAINT "gh_account_repo_catalogs_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commit_pull_request_associations" ADD CONSTRAINT "gh_commit_pr_associations_commit_fk" FOREIGN KEY ("commit_repository_id","commit_sha") REFERENCES "public"."github_commits"("repository_id","sha") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_commit_pull_request_associations" ADD CONSTRAINT "gh_commit_pr_associations_pr_fk" FOREIGN KEY ("pull_request_node_id") REFERENCES "public"."github_pull_requests"("node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_ref_generations" ADD CONSTRAINT "gh_ref_generations_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_ref_memberships" ADD CONSTRAINT "gh_ref_memberships_generation_fk" FOREIGN KEY ("repository_id","ref_name","generation") REFERENCES "public"."github_ref_generations"("repository_id","ref_name","generation") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_ref_memberships" ADD CONSTRAINT "gh_ref_memberships_commit_fk" FOREIGN KEY ("commit_repository_id","commit_sha") REFERENCES "public"."github_commits"("repository_id","sha") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_unit_memberships" ADD CONSTRAINT "gh_work_unit_memberships_unit_fk" FOREIGN KEY ("work_unit_id") REFERENCES "public"."github_work_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_unit_memberships" ADD CONSTRAINT "gh_work_unit_memberships_commit_fk" FOREIGN KEY ("logical_repository_id","logical_sha") REFERENCES "public"."github_commits"("repository_id","sha") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" ADD CONSTRAINT "gh_work_unit_summary_attempts_unit_fk" FOREIGN KEY ("work_unit_id") REFERENCES "public"."github_work_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_units" ADD CONSTRAINT "gh_work_units_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_units" ADD CONSTRAINT "gh_work_units_pull_request_fk" FOREIGN KEY ("pull_request_node_id") REFERENCES "public"."github_pull_requests"("node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_work_units" ADD CONSTRAINT "gh_work_units_newest_commit_fk" FOREIGN KEY ("newest_commit_repository_id","newest_commit_sha") REFERENCES "public"."github_commits"("repository_id","sha") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gh_account_repo_catalogs_current_idx" ON "github_account_repository_catalogs" USING btree ("account_user_id","inventory_generation","active_access");--> statement-breakpoint
CREATE INDEX "gh_ref_generations_lineage_idx" ON "github_ref_generations" USING btree ("repository_id","branch_lineage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_ref_memberships_position_unique" ON "github_ref_memberships" USING btree ("repository_id","ref_name","position");--> statement-breakpoint
CREATE INDEX "gh_ref_memberships_commit_idx" ON "github_ref_memberships" USING btree ("commit_repository_id","commit_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_unit_memberships_position_unique" ON "github_work_unit_memberships" USING btree ("work_unit_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_unit_memberships_commit_unique" ON "github_work_unit_memberships" USING btree ("logical_repository_id","logical_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_unit_summary_input_unique" ON "github_work_unit_summary_attempts" USING btree ("work_unit_id","summary_input_digest","recipe");--> statement-breakpoint
CREATE INDEX "gh_work_unit_summary_claim_idx" ON "github_work_unit_summary_attempts" USING btree ("state","debounce_until","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_units_identity_unique" ON "github_work_units" USING btree ("identity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_units_pr_unique" ON "github_work_units" USING btree ("pull_request_node_id") WHERE "github_work_units"."kind" = 'pull_request';--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_units_canonical_day_unique" ON "github_work_units" USING btree ("repository_id","activity_day") WHERE "github_work_units"."kind" = 'canonical_day';--> statement-breakpoint
CREATE UNIQUE INDEX "gh_work_units_branch_unique" ON "github_work_units" USING btree ("branch_lineage_id") WHERE "github_work_units"."kind" = 'branch';--> statement-breakpoint
CREATE INDEX "gh_work_units_feed_idx" ON "github_work_units" USING btree ("visibility","activity_day","activity_at","id");--> statement-breakpoint
CREATE INDEX "github_repository_refs_projection_idx" ON "github_repository_refs" USING btree ("projection_relevant","active","last_observed_at");--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "activity_public_id";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "canonicalized_at";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "change_fingerprint";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "fingerprint_complete";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "full_message";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "languages";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "substantive_loc";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_attempted_at";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_error";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_headline";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_input_hash";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_model";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_recipe";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "summary_short";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "tree_sha";--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_file_facts_array" CHECK ("github_commits"."file_facts" IS NULL OR jsonb_typeof("github_commits"."file_facts") = 'array');--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_file_facts_completeness" CHECK (NOT "github_commits"."file_facts_complete" OR ("github_commits"."file_facts" IS NOT NULL AND NOT "github_commits"."provider_file_cap_reached"));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_nonnegative_activity_counts" CHECK (("github_commits"."changed_files" IS NULL OR "github_commits"."changed_files" >= 0) AND ("github_commits"."additions" IS NULL OR "github_commits"."additions" >= 0) AND ("github_commits"."deletions" IS NULL OR "github_commits"."deletions" >= 0));--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD CONSTRAINT "github_pull_request_versions_file_facts_array" CHECK ("github_pull_request_versions"."file_facts" IS NULL OR jsonb_typeof("github_pull_request_versions"."file_facts") = 'array');--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD CONSTRAINT "github_pull_request_versions_file_facts_complete" CHECK (NOT "github_pull_request_versions"."file_facts_complete" OR "github_pull_request_versions"."file_facts" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD CONSTRAINT "github_repository_refs_lineage" CHECK (("github_repository_refs"."kind" = 'head') = ("github_repository_refs"."branch_lineage_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD CONSTRAINT "github_repository_refs_projection_relevance" CHECK (NOT "github_repository_refs"."projection_relevant" OR "github_repository_refs"."kind" = 'head');--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD CONSTRAINT "github_repository_refs_repair_lease" CHECK (("github_repository_refs"."repair_lease_token" IS NULL) = ("github_repository_refs"."repair_lease_until" IS NULL) AND ("github_repository_refs"."repair_lease_token" IS NULL OR "github_repository_refs"."kind" = 'head'));--> statement-breakpoint
ALTER TABLE "github_repository_refs" ADD CONSTRAINT "github_repository_refs_repair_attempts" CHECK ("github_repository_refs"."repair_attempts" >= 0);--> statement-breakpoint
INSERT INTO "github_public_feed_head" ("id")
VALUES (true)
ON CONFLICT ("id") DO NOTHING;
