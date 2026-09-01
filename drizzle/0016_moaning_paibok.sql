ALTER TABLE "github_work_units" DROP CONSTRAINT "gh_work_units_digest_shapes";--> statement-breakpoint
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_full_name" CHECK (length(btrim("github_repositories"."full_name")) > 0);--> statement-breakpoint
ALTER TABLE "github_pull_requests" DROP COLUMN "provider_file_cap_reached";--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" DROP COLUMN "unit_revision";--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" ADD CONSTRAINT "gh_work_unit_summary_revisions" CHECK ("github_work_unit_summary_attempts"."revision" > 0 AND "github_work_unit_summary_attempts"."started_requests" BETWEEN 0 AND 2);--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" DROP CONSTRAINT "gh_work_unit_summary_started";--> statement-breakpoint
ALTER TABLE "github_work_unit_summary_attempts" ADD CONSTRAINT "gh_work_unit_summary_started" CHECK (("github_work_unit_summary_attempts"."started_requests" = 0) = ("github_work_unit_summary_attempts"."last_started_at" IS NULL) AND ("github_work_unit_summary_attempts"."state" <> 'pending' OR "github_work_unit_summary_attempts"."request_payload" IS NOT NULL));--> statement-breakpoint
UPDATE "github_commits"
SET "author_user_id" = CASE "author_login"
  WHEN 'f0rr0' THEN '8574219'
  WHEN 'yuppiestechdev' THEN '99666891'
END
WHERE "author_user_id" IS NULL
  AND "author_login" IN ('f0rr0', 'yuppiestechdev');--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "file_facts_digest" varchar(64) GENERATED ALWAYS AS (CASE WHEN "file_facts" IS NULL THEN NULL ELSE encode(sha256(jsonb_send("file_facts")), 'hex') END) STORED;--> statement-breakpoint
ALTER TABLE "github_public_feed_head" ADD COLUMN "projection_request_token" uuid;--> statement-breakpoint
ALTER TABLE "github_public_feed_head" ADD COLUMN "summary_policy_digest" varchar(64);--> statement-breakpoint
UPDATE "github_public_feed_head" SET "projection_request_token" = gen_random_uuid();--> statement-breakpoint
ALTER TABLE "github_pull_request_versions" ADD COLUMN "file_facts_digest" varchar(64) GENERATED ALWAYS AS (CASE WHEN "file_facts" IS NULL THEN NULL ELSE encode(sha256(jsonb_send("file_facts")), 'hex') END) STORED;--> statement-breakpoint
ALTER TABLE "github_work_units" ADD COLUMN "summary_evaluation_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "github_work_units" ADD COLUMN "summary_evaluated_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "github_work_units" ADD CONSTRAINT "gh_work_units_digest_shapes" CHECK ("github_work_units"."facts_digest" ~ '^[a-f0-9]{64}$' AND "github_work_units"."membership_digest" ~ '^[a-f0-9]{64}$' AND ("github_work_units"."outcome_digest" IS NULL OR "github_work_units"."outcome_digest" ~ '^[a-f0-9]{64}$') AND ("github_work_units"."summary_evaluation_digest" IS NULL OR "github_work_units"."summary_evaluation_digest" ~ '^[a-f0-9]{64}$') AND ("github_work_units"."summary_evaluated_digest" IS NULL OR "github_work_units"."summary_evaluated_digest" ~ '^[a-f0-9]{64}$') AND ("github_work_units"."summary_input_digest" IS NULL OR "github_work_units"."summary_input_digest" ~ '^[a-f0-9]{64}$'));--> statement-breakpoint
ALTER TABLE "github_public_feed_head" ADD CONSTRAINT "gh_public_feed_head_summary_policy_digest" CHECK ("github_public_feed_head"."summary_policy_digest" IS NULL OR "github_public_feed_head"."summary_policy_digest" ~ '^[a-f0-9]{64}$');
