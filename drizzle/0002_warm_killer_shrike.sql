CREATE TABLE "timeline_contribution_totals" (
	"contribution_count" integer NOT NULL,
	"day" date NOT NULL,
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"source" varchar(32) DEFAULT 'github-public-calendar' NOT NULL,
	"subject" varchar(39) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_contribution_total_nonnegative_count" CHECK ("timeline_contribution_totals"."contribution_count" >= 0),
	CONSTRAINT "timeline_contribution_total_identity_shape" CHECK ("timeline_contribution_totals"."id" ~ '^[a-f0-9]{64}$'
        AND "timeline_contribution_totals"."subject" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'
        AND "timeline_contribution_totals"."subject" !~ '--'
        AND "timeline_contribution_totals"."subject" !~ '-$'
        AND "timeline_contribution_totals"."source" = 'github-public-calendar')
);
--> statement-breakpoint
ALTER TABLE "timeline_sync_runs" ADD COLUMN "anonymous_day_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "timeline_sync_runs" ADD COLUMN "anonymous_coverage" varchar(16) DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
CREATE INDEX "timeline_contribution_total_day_idx" ON "timeline_contribution_totals" USING btree ("subject","day");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_contribution_total_day_source_idx" ON "timeline_contribution_totals" USING btree ("subject","day","source");