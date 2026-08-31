CREATE INDEX IF NOT EXISTS "github_commits_exact_authored_change_idx" ON "github_commits" USING btree ("repository_id","change_fingerprint","author_user_id") WHERE "github_commits"."fingerprint_complete" AND "github_commits"."change_fingerprint" IS NOT NULL AND "github_commits"."author_user_id" IS NOT NULL;
--> statement-breakpoint
DO $$
DECLARE
	"affected_repository_id" text;
BEGIN
	FOR "affected_repository_id" IN
		SELECT DISTINCT "duplicate_cohorts"."repository_id"
		FROM (
			SELECT "github_commits"."repository_id"
			FROM "github_commits"
			INNER JOIN "github_public_activities"
				ON "github_public_activities"."public_id" = "github_commits"."activity_public_id"
				AND "github_public_activities"."kind" = 'commit'
				AND "github_public_activities"."repository_id" = "github_commits"."repository_id"
				AND "github_public_activities"."source_node_id" = "github_commits"."sha"
			WHERE "github_commits"."fingerprint_complete" = true
				AND "github_commits"."change_fingerprint" IS NOT NULL
				AND "github_commits"."author_user_id" IS NOT NULL
				AND "github_commits"."enrichment_state" = 'complete'
				AND "github_commits"."canonicalized_at" IS NOT NULL
				AND "github_commits"."parent_shas" IS NOT NULL
				AND jsonb_array_length("github_commits"."parent_shas") <= 1
				AND "github_public_activities"."published_at" IS NOT NULL
				AND "github_public_activities"."canonical_public_id" IS NULL
				AND "github_public_activities"."hidden_at" IS NULL
			GROUP BY
				"github_commits"."repository_id",
				"github_commits"."change_fingerprint",
				"github_commits"."author_user_id"
			HAVING count(*) > 1
		) AS "duplicate_cohorts"
		ORDER BY "duplicate_cohorts"."repository_id"
	LOOP
		PERFORM pg_advisory_xact_lock(
			hashtextextended("affected_repository_id", 0)
		);
	END LOOP;
END $$;
--> statement-breakpoint
WITH RECURSIVE "ranked_roots" AS (
	SELECT
		"github_public_activities"."public_id",
		"github_commits"."repository_id",
		"github_commits"."change_fingerprint",
		"github_commits"."author_user_id",
		"github_commits"."sha",
		row_number() OVER (
			PARTITION BY
				"github_commits"."repository_id",
				"github_commits"."change_fingerprint",
				"github_commits"."author_user_id"
			ORDER BY
				coalesce(
					"github_commits"."committer_at",
					"github_commits"."first_observed_at"
				),
				"github_commits"."first_observed_at",
				"github_commits"."sha"
		) AS "root_rank",
		count(*) OVER (
			PARTITION BY
				"github_commits"."repository_id",
				"github_commits"."change_fingerprint",
				"github_commits"."author_user_id"
		) AS "cohort_size"
	FROM "github_commits"
	INNER JOIN "github_public_activities"
		ON "github_public_activities"."public_id" = "github_commits"."activity_public_id"
		AND "github_public_activities"."kind" = 'commit'
		AND "github_public_activities"."repository_id" = "github_commits"."repository_id"
		AND "github_public_activities"."source_node_id" = "github_commits"."sha"
	WHERE "github_commits"."fingerprint_complete" = true
		AND "github_commits"."change_fingerprint" IS NOT NULL
		AND "github_commits"."author_user_id" IS NOT NULL
		AND "github_commits"."enrichment_state" = 'complete'
		AND "github_commits"."canonicalized_at" IS NOT NULL
		AND "github_commits"."parent_shas" IS NOT NULL
		AND jsonb_array_length("github_commits"."parent_shas") <= 1
		AND "github_public_activities"."published_at" IS NOT NULL
		AND "github_public_activities"."canonical_public_id" IS NULL
		AND "github_public_activities"."hidden_at" IS NULL
),
"losers" AS (
	SELECT
		"loser"."public_id" AS "loser_public_id",
		"winner"."public_id" AS "winner_public_id",
		"winner"."sha" AS "winner_sha"
	FROM "ranked_roots" AS "loser"
	INNER JOIN "ranked_roots" AS "winner"
		ON "winner"."repository_id" = "loser"."repository_id"
		AND "winner"."change_fingerprint" = "loser"."change_fingerprint"
		AND "winner"."author_user_id" = "loser"."author_user_id"
		AND "winner"."root_rank" = 1
	WHERE "loser"."cohort_size" > 1
		AND "loser"."root_rank" > 1
),
"alias_descendants" AS (
	SELECT
		"descendant"."public_id" AS "descendant_public_id",
		"losers"."winner_public_id"
	FROM "losers"
	INNER JOIN "github_public_activities" AS "descendant"
		ON "descendant"."canonical_public_id" = "losers"."loser_public_id"
	UNION
	SELECT
		"descendant"."public_id" AS "descendant_public_id",
		"parent"."winner_public_id"
	FROM "alias_descendants" AS "parent"
	INNER JOIN "github_public_activities" AS "descendant"
		ON "descendant"."canonical_public_id" = "parent"."descendant_public_id"
)
UPDATE "github_public_activities"
SET "canonical_public_id" = "alias_descendants"."winner_public_id"
FROM "alias_descendants"
WHERE "github_public_activities"."public_id" = "alias_descendants"."descendant_public_id"
	AND "github_public_activities"."public_id" <> "alias_descendants"."winner_public_id";
--> statement-breakpoint
WITH "ranked_roots" AS (
	SELECT
		"github_public_activities"."public_id",
		"github_commits"."repository_id",
		"github_commits"."change_fingerprint",
		"github_commits"."author_user_id",
		"github_commits"."sha",
		row_number() OVER (
			PARTITION BY
				"github_commits"."repository_id",
				"github_commits"."change_fingerprint",
				"github_commits"."author_user_id"
			ORDER BY
				coalesce(
					"github_commits"."committer_at",
					"github_commits"."first_observed_at"
				),
				"github_commits"."first_observed_at",
				"github_commits"."sha"
		) AS "root_rank",
		count(*) OVER (
			PARTITION BY
				"github_commits"."repository_id",
				"github_commits"."change_fingerprint",
				"github_commits"."author_user_id"
		) AS "cohort_size"
	FROM "github_commits"
	INNER JOIN "github_public_activities"
		ON "github_public_activities"."public_id" = "github_commits"."activity_public_id"
		AND "github_public_activities"."kind" = 'commit'
		AND "github_public_activities"."repository_id" = "github_commits"."repository_id"
		AND "github_public_activities"."source_node_id" = "github_commits"."sha"
	WHERE "github_commits"."fingerprint_complete" = true
		AND "github_commits"."change_fingerprint" IS NOT NULL
		AND "github_commits"."author_user_id" IS NOT NULL
		AND "github_commits"."enrichment_state" = 'complete'
		AND "github_commits"."canonicalized_at" IS NOT NULL
		AND "github_commits"."parent_shas" IS NOT NULL
		AND jsonb_array_length("github_commits"."parent_shas") <= 1
		AND "github_public_activities"."published_at" IS NOT NULL
		AND "github_public_activities"."canonical_public_id" IS NULL
		AND "github_public_activities"."hidden_at" IS NULL
),
"losers" AS (
	SELECT
		"loser"."public_id" AS "loser_public_id",
		"loser"."change_fingerprint",
		"winner"."public_id" AS "winner_public_id",
		"winner"."sha" AS "winner_sha"
	FROM "ranked_roots" AS "loser"
	INNER JOIN "ranked_roots" AS "winner"
		ON "winner"."repository_id" = "loser"."repository_id"
		AND "winner"."change_fingerprint" = "loser"."change_fingerprint"
		AND "winner"."author_user_id" = "loser"."author_user_id"
		AND "winner"."root_rank" = 1
	WHERE "loser"."cohort_size" > 1
		AND "loser"."root_rank" > 1
)
UPDATE "github_public_activities"
SET
	"alias_evidence" = jsonb_build_object(
		'fingerprint', "losers"."change_fingerprint",
		'fingerprintComplete', true,
		'directMergeParent', false,
		'pullRequestNodeId', null,
		'sourceSha', "losers"."winner_sha"
	),
	"alias_reason" = 'same_authored_exact_copy',
	"canonical_public_id" = "losers"."winner_public_id",
	"hidden_at" = coalesce("github_public_activities"."hidden_at", current_timestamp)
FROM "losers"
WHERE "github_public_activities"."public_id" = "losers"."loser_public_id";
--> statement-breakpoint
UPDATE "github_summary_attempts"
SET
	"completed_at" = current_timestamp,
	"error_code" = 'canonical_alias',
	"lease_token" = NULL,
	"lease_until" = NULL,
	"state" = 'indeterminate'
FROM "github_public_activities"
WHERE "github_summary_attempts"."activity_public_id" = "github_public_activities"."public_id"
	AND "github_public_activities"."alias_reason" = 'same_authored_exact_copy'
	AND "github_public_activities"."canonical_public_id" IS NOT NULL
	AND "github_summary_attempts"."state" IN ('pending', 'processing');
