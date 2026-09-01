ALTER TABLE "github_account_checkpoints" ADD COLUMN "pull_request_backfill_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "inventory_verified_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "github_repositories" (
	"id",
	"full_name",
	"html_url",
	"owner_avatar_url",
	"owner_login",
	"owner_type",
	"visibility",
	"first_observed_at",
	"last_observed_at"
)
SELECT DISTINCT ON (c."repository_id")
	c."repository_id",
	c."repository",
	'https://github.com/' || c."repository",
	c."repository_owner_avatar_url",
	c."repository_owner_login",
	c."repository_owner_type",
	CASE
		WHEN c."repository_private" IS TRUE THEN 'private'
		WHEN c."repository_private" IS FALSE THEN 'public'
		ELSE NULL
	END,
	MIN(c."committed_at") OVER (PARTITION BY c."repository_id"),
	MAX(c."committed_at") OVER (PARTITION BY c."repository_id")
FROM "github_commits" AS c
LEFT JOIN "github_repositories" AS r
	ON r."id" = c."repository_id"
WHERE r."id" IS NULL
ORDER BY c."repository_id", c."committed_at" DESC, c."sha" DESC
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_repository_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "github_commits" VALIDATE CONSTRAINT "github_commits_repository_fk";--> statement-breakpoint
ALTER TABLE "github_commits" ALTER COLUMN "repository" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "github_account_checkpoints" ADD CONSTRAINT "github_account_checkpoints_pr_backfill_digest" CHECK ("github_account_checkpoints"."pull_request_backfill_digest" IS NULL OR "github_account_checkpoints"."pull_request_backfill_digest" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
UPDATE "github_repositories"
SET "inventory_verified_at" = "last_observed_at"
WHERE "topics" IS NOT NULL;--> statement-breakpoint
UPDATE "github_repository_inventory_heads" AS h
SET "completed_at" = '1970-01-01 00:00:00+00',
	"updated_at" = '1970-01-01 00:00:00+00'
WHERE EXISTS (
	SELECT 1
	FROM "github_account_repository_catalogs" AS c
	INNER JOIN "github_repositories" AS r ON r."id" = c."repository_id"
	WHERE c."account_user_id" = h."account_user_id"
		AND c."active_access"
		AND c."inventory_generation" = h."generation"
		AND r."inventory_verified_at" IS NULL
);
