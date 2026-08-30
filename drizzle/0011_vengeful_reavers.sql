CREATE TABLE "github_pull_request_signals" (
	"account" varchar(39) NOT NULL,
	"action" varchar(40) NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" varchar(80),
	"event_id" varchar(64) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"number" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"repository_name_snapshot" varchar(200) NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	CONSTRAINT "github_pull_request_signals_account" CHECK ("github_pull_request_signals"."account" IN ('f0rr0', 'yuppiestechdev')),
	CONSTRAINT "github_pull_request_signals_event_id" CHECK ("github_pull_request_signals"."event_id" ~ '^[0-9]{1,64}$'),
	CONSTRAINT "github_pull_request_signals_repository_id" CHECK ("github_pull_request_signals"."repository_id" ~ '^[0-9]{1,32}$'),
	CONSTRAINT "github_pull_request_signals_state" CHECK ("github_pull_request_signals"."state" IN ('pending', 'processing', 'complete', 'unavailable')),
	CONSTRAINT "github_pull_request_signals_lease" CHECK (("github_pull_request_signals"."state" = 'processing') = ("github_pull_request_signals"."lease_token" IS NOT NULL) AND ("github_pull_request_signals"."state" <> 'processing' OR "github_pull_request_signals"."lease_until" IS NOT NULL)),
	CONSTRAINT "github_pull_request_signals_values" CHECK ("github_pull_request_signals"."number" > 0 AND "github_pull_request_signals"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "github_pull_request_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_push_observations" DROP CONSTRAINT "github_push_observations_nonnegative_count";--> statement-breakpoint
ALTER TABLE "github_summary_attempts" DROP CONSTRAINT "github_summary_attempts_positive_revision";--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "events_etag" text;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "events_last_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "events_last_succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "events_next_poll_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_cursor_repository_id" varchar(32);--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_cycle_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_last_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_last_succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_next_page" integer;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "head_ref_scan_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_cursor_repository_id" varchar(32);--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_cycle_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_last_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_last_succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_lease_token" uuid;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_next_page" integer;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD COLUMN "tag_ref_scan_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "enrichment_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "pr_discovery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "merge_sha_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "reconcile_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "reconcile_error" varchar(80);--> statement-breakpoint
ALTER TABLE "github_push_observations" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "heads_last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "tags_last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_summary_attempts" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_request_signals_event_unique" ON "github_pull_request_signals" USING btree ("account","event_id");--> statement-breakpoint
CREATE INDEX "github_pull_request_signals_pending_idx" ON "github_pull_request_signals" USING btree ("state","lease_until","observed_at");--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_ref_cursor_shape" CHECK (("github_account_checkpoints"."head_ref_cursor_repository_id" IS NULL OR "github_account_checkpoints"."head_ref_cursor_repository_id" ~ '^[0-9]{1,32}$') AND ("github_account_checkpoints"."tag_ref_cursor_repository_id" IS NULL OR "github_account_checkpoints"."tag_ref_cursor_repository_id" ~ '^[0-9]{1,32}$'));--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_ref_leases" CHECK (("github_account_checkpoints"."head_ref_lease_token" IS NULL) = ("github_account_checkpoints"."head_ref_lease_until" IS NULL) AND ("github_account_checkpoints"."tag_ref_lease_token" IS NULL) = ("github_account_checkpoints"."tag_ref_lease_until" IS NULL));--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_ref_scans" CHECK (("github_account_checkpoints"."head_ref_next_page" IS NULL AND "github_account_checkpoints"."head_ref_scan_started_at" IS NULL OR "github_account_checkpoints"."head_ref_next_page" >= 2 AND "github_account_checkpoints"."head_ref_scan_started_at" IS NOT NULL) AND ("github_account_checkpoints"."tag_ref_next_page" IS NULL AND "github_account_checkpoints"."tag_ref_scan_started_at" IS NULL OR "github_account_checkpoints"."tag_ref_next_page" >= 2 AND "github_account_checkpoints"."tag_ref_scan_started_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_nonnegative_attempts" CHECK ("github_commits"."enrichment_attempts" >= 0 AND "github_commits"."pr_discovery_attempts" >= 0);--> statement-breakpoint
-- Intentionally installed by the idempotent evidence-recovery transaction
-- after legacy unverified merge SHAs and their derived aliases are invalidated.
-- Fresh databases reach the same invariant on the first authenticated worker
-- run (or the manual evidence-recovery Action) even when no rows need repair.
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_nonnegative_attempts" CHECK ("github_pull_requests"."reconcile_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "github_push_observations" ADD CONSTRAINT "github_push_observations_nonnegative_count" CHECK ("github_push_observations"."attempt_count" >= 0 AND ("github_push_observations"."expected_commit_count" IS NULL OR "github_push_observations"."expected_commit_count" >= 0));--> statement-breakpoint
ALTER TABLE "github_summary_attempts" ADD CONSTRAINT "github_summary_attempts_positive_revision" CHECK ("github_summary_attempts"."revision" > 0 AND "github_summary_attempts"."attempt_count" >= 0);
