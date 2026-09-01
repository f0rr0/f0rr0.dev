ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_owner_type";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "repository";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "repository_owner_avatar_url";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "repository_owner_login";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "repository_owner_type";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "repository_private";