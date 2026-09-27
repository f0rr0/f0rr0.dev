CREATE TABLE "codex_usage_days" (
	"account_id" varchar(64) NOT NULL,
	"day" date NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codex_usage_days_account_id_day_pk" PRIMARY KEY("account_id","day")
);
--> statement-breakpoint
ALTER TABLE "codex_usage_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_activity_snapshots" (
	"day" date NOT NULL,
	"identity_key" varchar(180) NOT NULL,
	"repository_id" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"work_unit_id" uuid,
	"work_unit_revision" integer,
	"attribution_mode" varchar(32),
	"facts_digest" varchar(64),
	"outcome_digest" varchar(64),
	"summary_input_digest" varchar(64),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_activity_snapshots_day_identity_key_pk" PRIMARY KEY("day","identity_key")
);
--> statement-breakpoint
ALTER TABLE "github_activity_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_commits" ALTER COLUMN "file_facts_digest" DROP EXPRESSION;--> statement-breakpoint
ALTER TABLE "codex_accounts" ADD COLUMN "provider_account_id" varchar(200);--> statement-breakpoint
ALTER TABLE "codex_accounts" ADD COLUMN "sync_token" uuid;--> statement-breakpoint
ALTER TABLE "codex_accounts" ADD COLUMN "sync_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "file_facts_pruned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_public_feed_head" ADD COLUMN "history_initialized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_repositories" ADD COLUMN "projection_request_token" uuid;--> statement-breakpoint
ALTER TABLE "codex_usage_days" ADD CONSTRAINT "codex_usage_days_account_id_codex_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."codex_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_activity_snapshots_latest_idx" ON "github_activity_snapshots" USING btree ("identity_key","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "github_activity_snapshots_repository_idx" ON "github_activity_snapshots" USING btree ("repository_id");--> statement-breakpoint
ALTER TABLE "codex_accounts" ADD CONSTRAINT "codex_accounts_provider_account_id_unique" UNIQUE("provider_account_id");
--> statement-breakpoint
-- Bind aliases before historical accounts become visible together. Duplicate
-- provider identities fail the migration rather than silently counting twice.
DO $$ BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE $identity$
      UPDATE codex_accounts a SET provider_account_id = s.decrypted_secret::jsonb #>> '{tokens,account_id}'
      FROM vault.decrypted_secrets s WHERE s.name = 'codex_auth_' || a.id
    $identity$;
  END IF;
END $$;
--> statement-breakpoint
-- Preserve the generated digest when only disposable patches are removed.
CREATE FUNCTION record_github_commit_file_digest() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.file_facts_pruned_at IS NOT NULL THEN
    IF NEW.file_facts IS DISTINCT FROM OLD.file_facts AND NEW.file_facts IS DISTINCT FROM (
      SELECT jsonb_agg(value || jsonb_build_object('patch', null, 'patchComplete', false) ORDER BY position)
      FROM jsonb_array_elements(OLD.file_facts) WITH ORDINALITY AS entry(value, position)
    ) THEN RAISE EXCEPTION 'Pruning cannot change compact commit facts'; END IF;
    NEW.file_facts_digest := OLD.file_facts_digest;
  ELSE
    NEW.file_facts_digest := CASE WHEN NEW.file_facts IS NULL THEN NULL ELSE encode(sha256(jsonb_send(NEW.file_facts)), 'hex') END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER record_github_commit_file_digest BEFORE INSERT OR UPDATE OF file_facts, file_facts_pruned_at
ON github_commits FOR EACH ROW EXECUTE FUNCTION record_github_commit_file_digest();
--> statement-breakpoint
CREATE FUNCTION protect_github_activity_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.day < (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Closed activity cannot be deleted'; END IF;
    IF NEW.day <> OLD.day OR NEW.identity_key <> OLD.identity_key OR NEW.repository_id <> OLD.repository_id
      OR (NEW.payload - 'headline' - 'summary' - 'summarizing') IS DISTINCT FROM (OLD.payload - 'headline' - 'summary' - 'summarizing')
      OR (OLD.payload->>'headline' IS NOT NULL AND NEW.payload IS DISTINCT FROM OLD.payload)
    THEN RAISE EXCEPTION 'Closed activity facts are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_github_activity_history BEFORE UPDATE OR DELETE ON github_activity_snapshots
FOR EACH ROW EXECUTE FUNCTION protect_github_activity_history();
--> statement-breakpoint
ALTER TABLE "github_pull_request_memberships" DROP CONSTRAINT "gh_pr_memberships_version_fk";
--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "file_facts" jsonb;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "file_facts_digest" varchar(64) GENERATED ALWAYS AS (CASE WHEN "file_facts" IS NULL THEN NULL ELSE encode(sha256(jsonb_send("file_facts")), 'hex') END) STORED;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "file_facts_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "membership_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "merge_snapshot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "snapshot_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_push_observations" ADD COLUMN "known_shas" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "github_pull_requests_snapshot_unique" ON "github_pull_requests" USING btree ("snapshot_id");--> statement-breakpoint
-- Preserve the exact current evidence IDs/digests used by live work and summaries.
UPDATE github_pull_requests p SET
  snapshot_id = v.id, snapshot_observed_at = v.observed_at,
  base_ref_name = v.base_ref_name, base_repository_id = v.base_repository_id,
  base_sha = v.base_sha, head_ref_name = v.head_ref_name,
  head_repository_id = v.head_repository_id, head_sha = v.head_sha,
  commit_count = v.commit_count, file_facts = v.file_facts,
  file_facts_complete = v.file_facts_complete,
  membership_complete = v.membership_complete, merge_snapshot = v.merge_snapshot
FROM github_pull_request_versions v WHERE v.pull_request_node_id = p.node_id AND v.is_current;
--> statement-breakpoint
DELETE FROM github_pull_request_memberships m WHERE NOT EXISTS (
  SELECT 1 FROM github_pull_requests p WHERE p.snapshot_id = m.version_id
);
--> statement-breakpoint
-- Refuse corrupted legacy lists rather than quietly changing their order/repository.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM github_push_observation_commits c
    JOIN github_push_observations o ON o.id = c.observation_id
    GROUP BY o.id HAVING bool_or(c.repository_id <> o.repository_id)
      OR min(c.position) <> 0 OR max(c.position) <> count(*) - 1) THEN
    RAISE EXCEPTION 'Invalid legacy push commit evidence';
  END IF;
END $$;
--> statement-breakpoint
UPDATE github_push_observations o SET known_shas = c.shas FROM (
  SELECT observation_id, array_agg(sha::text ORDER BY position) AS shas
  FROM github_push_observation_commits GROUP BY observation_id
) c WHERE c.observation_id = o.id;
--> statement-breakpoint
-- Accepted attempts already survive removal of their live work unit. Import
-- cache-only outputs as zero-start accepted attempts; never invent paid usage.
INSERT INTO github_work_unit_summary_attempts
  (work_unit_id, revision, identity_key, repository_id, attribution_mode, recipe,
   outcome_digest, summary_input_digest, outcome, state, accepted_at, completed_at, debounce_until)
SELECT gen_random_uuid(), 1, s.identity_key, s.repository_id, s.attribution_mode, s.recipe,
  s.outcome_digest, s.summary_input_digest, s.outcome, 'accepted', s.accepted_at, s.accepted_at, s.accepted_at
FROM github_work_unit_accepted_summaries s WHERE NOT EXISTS (
  SELECT 1 FROM github_work_unit_summary_attempts a WHERE a.state = 'accepted'
    AND a.identity_key = s.identity_key AND a.repository_id = s.repository_id
    AND a.attribution_mode = s.attribution_mode AND a.recipe = s.recipe
    AND a.outcome_digest = s.outcome_digest AND a.summary_input_digest = s.summary_input_digest
    AND a.outcome = s.outcome AND a.accepted_at = s.accepted_at
);
--> statement-breakpoint
ALTER TABLE "github_pull_request_memberships" ADD CONSTRAINT "gh_pr_memberships_version_fk" FOREIGN KEY ("version_id") REFERENCES "public"."github_pull_requests"("snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gh_work_unit_summary_accepted_outcome_idx" ON "github_work_unit_summary_attempts" USING btree ("repository_id","outcome_digest","attribution_mode","recipe","accepted_at") WHERE "github_work_unit_summary_attempts"."state" = 'accepted';--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_file_facts_array" CHECK ("github_pull_requests"."file_facts" IS NULL OR jsonb_typeof("github_pull_requests"."file_facts") = 'array');--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_file_facts_complete" CHECK (NOT "github_pull_requests"."file_facts_complete" OR "github_pull_requests"."file_facts" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_snapshot" CHECK (("github_pull_requests"."snapshot_id" IS NULL) = ("github_pull_requests"."snapshot_observed_at" IS NULL) AND ("github_pull_requests"."snapshot_id" IS NULL OR ("github_pull_requests"."base_sha" IS NOT NULL AND "github_pull_requests"."head_sha" IS NOT NULL)));
--> statement-breakpoint
CREATE FUNCTION github_commit_evidence_needed(repo text, commit_sha text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM github_work_unit_memberships WHERE logical_repository_id = repo AND logical_sha = $2)
    OR EXISTS (SELECT 1 FROM github_ref_memberships m WHERE m.commit_repository_id = repo AND m.commit_sha = $2)
    OR EXISTS (SELECT 1 FROM github_pull_request_memberships m JOIN github_pull_requests p ON p.snapshot_id = m.version_id
      WHERE m.commit_repository_id = repo AND m.commit_sha = $2)
    OR EXISTS (SELECT 1 FROM github_work_unit_summary_attempts WHERE repository_id = repo
      AND state IN ('pending', 'processing', 'retryable'))
$$;
--> statement-breakpoint
CREATE FUNCTION cleanup_activity_history() RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE commits integer; logs integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('github-work-unit-projection-v1'));
  IF NOT EXISTS (SELECT 1 FROM github_public_feed_head WHERE history_initialized_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Initialize saved history before retention';
  END IF;
  UPDATE github_commits c SET file_facts_pruned_at = clock_timestamp(), file_facts = (
    SELECT jsonb_agg(value || jsonb_build_object('patch', null, 'patchComplete', false) ORDER BY position)
    FROM jsonb_array_elements(c.file_facts) WITH ORDINALITY AS entry(value, position)
  ) WHERE c.file_facts_pruned_at IS NULL AND jsonb_array_length(c.file_facts) > 0
    AND c.first_observed_at < now() - interval '30 days'
    AND c.enrichment_state = 'complete' AND c.pr_discovery_state = 'complete'
    AND NOT github_commit_evidence_needed(c.repository_id, c.sha);
  GET DIAGNOSTICS commits = ROW_COUNT;
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE 'DELETE FROM cron.job_run_details WHERE end_time < now() - interval ''7 days''';
    GET DIAGNOSTICS logs = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('commitPatches', commits, 'cronLogs', logs);
END;
$$;
--> statement-breakpoint
-- No CASCADE: an unexpected dependency must abort this transaction.
DROP TABLE github_pull_request_versions;
--> statement-breakpoint
DROP TABLE github_push_observation_commits;
--> statement-breakpoint
DROP TABLE github_work_unit_accepted_summaries;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cleanup_activity_history() FROM PUBLIC;
--> statement-breakpoint
UPDATE github_repositories SET projection_request_token = gen_random_uuid();
--> statement-breakpoint
UPDATE github_public_feed_head SET projection_request_token = gen_random_uuid();
