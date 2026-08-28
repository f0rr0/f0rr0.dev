ALTER TABLE "github_commits" RENAME COLUMN "patch_additions" TO "additions";--> statement-breakpoint
ALTER TABLE "github_commits" RENAME COLUMN "patch_deletions" TO "deletions";--> statement-breakpoint
UPDATE "github_commits" SET "additions" = NULL, "deletions" = NULL;--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_nonnegative_activity_counts";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "patches_complete";--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_nonnegative_activity_counts" CHECK (("github_commits"."changed_files" IS NULL OR "github_commits"."changed_files" >= 0) AND ("github_commits"."additions" IS NULL OR "github_commits"."additions" >= 0) AND ("github_commits"."deletions" IS NULL OR "github_commits"."deletions" >= 0) AND ("github_commits"."substantive_loc" IS NULL OR "github_commits"."substantive_loc" >= 0));
