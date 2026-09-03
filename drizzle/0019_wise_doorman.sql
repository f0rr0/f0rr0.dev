CREATE TABLE "github_work_unit_accepted_summaries" (
	"accepted_at" timestamp with time zone NOT NULL,
	"attribution_mode" varchar(32) NOT NULL,
	"identity_key" varchar(180) NOT NULL,
	"outcome" text NOT NULL,
	"outcome_digest" varchar(64) NOT NULL,
	"recipe" varchar(100) NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"summary_input_digest" varchar(64) NOT NULL,
	CONSTRAINT "gh_work_unit_accepted_summaries_pk" PRIMARY KEY("identity_key","summary_input_digest","recipe"),
	CONSTRAINT "gh_work_unit_accepted_summaries_digests" CHECK ("github_work_unit_accepted_summaries"."outcome_digest" ~ '^[a-f0-9]{64}$' AND "github_work_unit_accepted_summaries"."summary_input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "gh_work_unit_accepted_summaries_attribution" CHECK ("github_work_unit_accepted_summaries"."attribution_mode" IN ('tracked_authored_pr', 'foreign_pr_contribution', 'canonical_owned_composite', 'branch_owned_composite'))
);
--> statement-breakpoint
ALTER TABLE "github_work_unit_accepted_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "gh_work_unit_accepted_summaries_identity_idx" ON "github_work_unit_accepted_summaries" USING btree ("identity_key","attribution_mode","recipe","accepted_at");--> statement-breakpoint
CREATE INDEX "gh_work_unit_accepted_summaries_outcome_idx" ON "github_work_unit_accepted_summaries" USING btree ("repository_id","outcome_digest","attribution_mode","recipe","accepted_at");--> statement-breakpoint
INSERT INTO "github_work_unit_accepted_summaries" (
	"accepted_at",
	"attribution_mode",
	"identity_key",
	"outcome",
	"outcome_digest",
	"recipe",
	"repository_id",
	"summary_input_digest"
)
SELECT
	"attempt"."accepted_at",
	"attempt"."attribution_mode",
	"work_unit"."identity_key",
	"attempt"."outcome",
	"attempt"."outcome_digest",
	"attempt"."recipe",
	"work_unit"."repository_id",
	"attempt"."summary_input_digest"
FROM "github_work_unit_summary_attempts" AS "attempt"
INNER JOIN "github_work_units" AS "work_unit"
	ON "work_unit"."id" = "attempt"."work_unit_id"
WHERE "attempt"."state" = 'accepted'
	AND "attempt"."accepted_at" IS NOT NULL
	AND "attempt"."outcome" IS NOT NULL
ON CONFLICT DO NOTHING;
