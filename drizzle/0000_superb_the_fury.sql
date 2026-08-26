DROP TABLE IF EXISTS "timeline_webhook_receipts";--> statement-breakpoint
DROP TABLE IF EXISTS "timeline_sync_runs";--> statement-breakpoint
DROP TABLE IF EXISTS "timeline_editions";--> statement-breakpoint
DROP TABLE IF EXISTS "timeline_public_events";--> statement-breakpoint
DROP TABLE IF EXISTS "timeline_contribution_totals";--> statement-breakpoint
DROP TABLE IF EXISTS "timeline_activity_days";--> statement-breakpoint
DROP TABLE IF EXISTS "github_account_checkpoints";--> statement-breakpoint
DROP TABLE IF EXISTS "github_checkpoints";--> statement-breakpoint
DROP TABLE IF EXISTS "github_commits";--> statement-breakpoint
DROP TYPE IF EXISTS "timeline_public_event_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "timeline_sync_status";--> statement-breakpoint
DROP TYPE IF EXISTS "timeline_edition_status";--> statement-breakpoint
DROP TYPE IF EXISTS "timeline_visibility";--> statement-breakpoint
CREATE TABLE "github_account_checkpoints" (
	"account" varchar(39) PRIMARY KEY NOT NULL,
	"latest_event_id" varchar(64),
	"last_polled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_account_checkpoints_tracked_account" CHECK ("github_account_checkpoints"."account" IN ('f0rr0', 'yuppiestechdev')),
	CONSTRAINT "github_account_checkpoints_event_id_shape" CHECK ("github_account_checkpoints"."latest_event_id" IS NULL OR "github_account_checkpoints"."latest_event_id" ~ '^[0-9]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_commits" (
	"committed_at" timestamp with time zone NOT NULL,
	"message" text NOT NULL,
	"persisted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"repository" varchar(200) NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"pushed_by" varchar(39) NOT NULL,
	"sha" varchar(40) NOT NULL,
	"url" text NOT NULL,
	CONSTRAINT "github_commits_repository_id_sha_pk" PRIMARY KEY("repository_id","sha"),
	CONSTRAINT "github_commits_sha_shape" CHECK ("github_commits"."sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "github_commits_tracked_pusher" CHECK ("github_commits"."pushed_by" IN ('f0rr0', 'yuppiestechdev'))
);
--> statement-breakpoint
ALTER TABLE "github_commits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "github_commits_committed_at_idx" ON "github_commits" USING btree ("committed_at");--> statement-breakpoint
CREATE INDEX "github_commits_pushed_by_idx" ON "github_commits" USING btree ("pushed_by");
