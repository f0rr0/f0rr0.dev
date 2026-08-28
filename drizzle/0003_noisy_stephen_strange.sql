ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_tracked_pusher";--> statement-breakpoint
ALTER TABLE "github_commits" DROP CONSTRAINT "github_commits_tracked_author";--> statement-breakpoint
DROP INDEX "github_commits_pushed_by_idx";--> statement-breakpoint
WITH "deleted_observations" AS (
	DELETE FROM "github_commits"
	WHERE "author_login" IS NULL
	RETURNING "pushed_by"
)
UPDATE "github_account_checkpoints"
SET "latest_event_id" = NULL
WHERE "account" IN (
	SELECT DISTINCT "pushed_by" FROM "deleted_observations"
);--> statement-breakpoint
ALTER TABLE "github_commits" ALTER COLUMN "author_login" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" DROP COLUMN "last_polled_at";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "persisted_at";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "pushed_by";--> statement-breakpoint
ALTER TABLE "github_commits" DROP COLUMN "url";--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_tracked_author" CHECK ("github_commits"."author_login" IN ('f0rr0', 'yuppiestechdev'));
