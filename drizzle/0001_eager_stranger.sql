CREATE TYPE "public"."timeline_public_event_kind" AS ENUM('issue_opened', 'pull_request_opened', 'pull_request_reviewed', 'repository_created');--> statement-breakpoint
CREATE TABLE "timeline_public_events" (
	"bucket" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"event_kind" timeline_public_event_kind NOT NULL,
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"public_repo_name" varchar(200) NOT NULL,
	"public_repo_url" text NOT NULL,
	"public_title" varchar(300) NOT NULL,
	"public_url" text NOT NULL,
	"repo_key" varchar(64) NOT NULL,
	"source" varchar(32) DEFAULT 'github-profile' NOT NULL,
	"subject" varchar(39) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_public_event_identity_shape" CHECK ("timeline_public_events"."id" ~ '^[a-f0-9]{64}$'
        AND "timeline_public_events"."repo_key" ~ '^[a-f0-9]{64}$'
        AND "timeline_public_events"."subject" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
        AND "timeline_public_events"."subject" !~ '--'
        AND "timeline_public_events"."subject" !~ '-$'
        AND "timeline_public_events"."public_repo_name" ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9._-]{1,100}$'),
	CONSTRAINT "timeline_public_event_public_boundary" CHECK ("timeline_public_events"."public_repo_url" = 'https://github.com/' || "timeline_public_events"."public_repo_name"
        AND length("timeline_public_events"."public_url") <= 500
        AND "timeline_public_events"."public_title" = btrim("timeline_public_events"."public_title")
        AND length("timeline_public_events"."public_title") > 0
        AND "timeline_public_events"."public_title" !~ '[[:cntrl:]]'
        AND (
          ("timeline_public_events"."event_kind" = 'issue_opened'
            AND substring("timeline_public_events"."public_url" from length("timeline_public_events"."public_repo_url") + 1) ~ '^/issues/[0-9]+$')
          OR ("timeline_public_events"."event_kind" IN ('pull_request_opened', 'pull_request_reviewed')
            AND substring("timeline_public_events"."public_url" from length("timeline_public_events"."public_repo_url") + 1) ~ '^/pull/[0-9]+$')
          OR ("timeline_public_events"."event_kind" = 'repository_created'
            AND "timeline_public_events"."public_url" = "timeline_public_events"."public_repo_url")
        )),
	CONSTRAINT "timeline_public_event_bucket_boundary" CHECK ("timeline_public_events"."bucket" IN (
        'Applied AI',
        'Open source',
        'Product systems',
        'Infrastructure',
        'Writing'
      )),
	CONSTRAINT "timeline_public_event_source_boundary" CHECK ("timeline_public_events"."source" = 'github-profile')
);
--> statement-breakpoint
ALTER TABLE "timeline_sync_runs" ADD COLUMN "event_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "timeline_sync_runs" ADD COLUMN "public_event_coverage" varchar(16) DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
CREATE INDEX "timeline_public_event_day_idx" ON "timeline_public_events" USING btree ("subject","day");--> statement-breakpoint
CREATE INDEX "timeline_public_event_repo_day_idx" ON "timeline_public_events" USING btree ("subject","repo_key","day");--> statement-breakpoint
CREATE INDEX "timeline_public_event_kind_day_idx" ON "timeline_public_events" USING btree ("subject","event_kind","day");