CREATE TYPE "public"."timeline_edition_status" AS ENUM('draft', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."timeline_sync_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."timeline_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "timeline_activity_days" (
	"bucket" varchar(32) NOT NULL,
	"commit_count" integer NOT NULL,
	"day" date NOT NULL,
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"language_family" varchar(32) NOT NULL,
	"privacy_domain_key" varchar(64),
	"privacy_policy_version" varchar(64),
	"public_repo_name" varchar(200),
	"public_repo_url" text,
	"reached_default_branch" boolean DEFAULT true NOT NULL,
	"repo_key" varchar(64) NOT NULL,
	"source" varchar(32) DEFAULT 'github-profile' NOT NULL,
	"subject" varchar(39) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visibility" timeline_visibility NOT NULL,
	CONSTRAINT "timeline_activity_positive_count" CHECK ("timeline_activity_days"."commit_count" > 0),
	CONSTRAINT "timeline_activity_visibility_boundary" CHECK ((
        "timeline_activity_days"."visibility" = 'private'
        AND "timeline_activity_days"."public_repo_name" IS NULL
        AND "timeline_activity_days"."public_repo_url" IS NULL
        AND "timeline_activity_days"."privacy_policy_version" IS NOT NULL
      ) OR (
        "timeline_activity_days"."visibility" = 'public'
        AND "timeline_activity_days"."public_repo_name" IS NOT NULL
        AND "timeline_activity_days"."public_repo_url" IS NOT NULL
        AND "timeline_activity_days"."privacy_domain_key" IS NULL
        AND "timeline_activity_days"."privacy_policy_version" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "timeline_editions" (
	"agent_model" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edition" jsonb NOT NULL,
	"edition_key" varchar(64) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"published_at" timestamp with time zone,
	"privacy_policy_version" varchar(64),
	"status" timeline_edition_status DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_end" date NOT NULL,
	"window_start" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_sync_runs" (
	"completed_at" timestamp with time zone,
	"coverage" varchar(16) DEFAULT 'partial' NOT NULL,
	"error_code" varchar(64),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_window" boolean DEFAULT false NOT NULL,
	"kind" varchar(32) NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" timeline_sync_status DEFAULT 'running' NOT NULL,
	"window_end" date NOT NULL,
	"window_start" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_webhook_receipts" (
	"delivery_key" varchar(64) PRIMARY KEY NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "timeline_activity_day_idx" ON "timeline_activity_days" USING btree ("subject","day");--> statement-breakpoint
CREATE INDEX "timeline_activity_visibility_idx" ON "timeline_activity_days" USING btree ("subject","visibility","day");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_activity_repo_day_source_idx" ON "timeline_activity_days" USING btree ("subject","repo_key","day","source");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_edition_key_idx" ON "timeline_editions" USING btree ("edition_key");--> statement-breakpoint
CREATE INDEX "timeline_edition_published_idx" ON "timeline_editions" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "timeline_sync_started_idx" ON "timeline_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "timeline_webhook_expiry_idx" ON "timeline_webhook_receipts" USING btree ("expires_at");