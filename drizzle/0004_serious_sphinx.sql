ALTER TABLE "github_commits" ADD COLUMN "activity_public_id" uuid;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "changed_files" integer;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "languages" jsonb;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "patch_additions" integer;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "patch_deletions" integer;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "patches_complete" boolean;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "repository_owner_avatar_url" text;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "repository_owner_login" varchar(39);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "repository_owner_type" varchar(12);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "repository_private" boolean;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "substantive_loc" integer;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_error" varchar(80);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_headline" text;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_input_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_model" varchar(64);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_recipe" varchar(100);--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "summary_short" text;--> statement-breakpoint
CREATE UNIQUE INDEX "github_commits_activity_public_id_unique" ON "github_commits" USING btree ("activity_public_id");--> statement-breakpoint
CREATE INDEX "github_commits_activity_cursor_idx" ON "github_commits" USING btree ("committed_at","activity_public_id");--> statement-breakpoint
CREATE INDEX "github_commits_summary_pending_idx" ON "github_commits" USING btree ("summary_attempted_at","committed_at");--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_nonnegative_activity_counts" CHECK (("github_commits"."changed_files" IS NULL OR "github_commits"."changed_files" >= 0) AND ("github_commits"."patch_additions" IS NULL OR "github_commits"."patch_additions" >= 0) AND ("github_commits"."patch_deletions" IS NULL OR "github_commits"."patch_deletions" >= 0) AND ("github_commits"."substantive_loc" IS NULL OR "github_commits"."substantive_loc" >= 0));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_owner_type" CHECK ("github_commits"."repository_owner_type" IS NULL OR "github_commits"."repository_owner_type" IN ('Organization', 'User'));--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_summary_hash_shape" CHECK ("github_commits"."summary_input_hash" IS NULL OR "github_commits"."summary_input_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_summary_pair" CHECK (("github_commits"."summary_headline" IS NULL) = ("github_commits"."summary_short" IS NULL));