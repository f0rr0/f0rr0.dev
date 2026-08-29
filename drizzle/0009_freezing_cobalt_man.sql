ALTER TABLE "github_account_checkpoints" ADD COLUMN "ref_backfill_since_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "github_account_checkpoints"
SET "ref_backfill_since_at" = COALESCE(
	(SELECT min("committed_at") FROM "github_commits"),
	"ref_backfill_since_at"
);
