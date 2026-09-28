ALTER TABLE "github_work_units" DROP CONSTRAINT "gh_work_units_activity_order";--> statement-breakpoint
ALTER TABLE "github_issues" ADD COLUMN "status" varchar(16) DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "github_issues" ADD COLUMN "activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_issues" ADD COLUMN "provider_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_work_units" ADD COLUMN "pull_request" jsonb;--> statement-breakpoint
ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_status" CHECK ("github_issues"."status" IN ('open', 'closed', 'completed', 'not-planned'));--> statement-breakpoint
-- Rebuild direct-day groups using the display timezone; saved history stays intact.
DELETE FROM github_work_units WHERE kind = 'canonical_day';
--> statement-breakpoint
UPDATE github_work_units SET activity_day = (activity_at AT TIME ZONE 'Asia/Kolkata')::date;
--> statement-breakpoint
ALTER TABLE "github_work_units" ADD CONSTRAINT "gh_work_units_activity_order" CHECK ("github_work_units"."first_activity_at" <= "github_work_units"."last_activity_at" AND "github_work_units"."activity_day" = ("github_work_units"."activity_at" AT TIME ZONE 'Asia/Kolkata')::date);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_github_activity_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.day < ((clock_timestamp() - interval '1 hour') AT TIME ZONE 'Asia/Kolkata')::date THEN
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
UPDATE github_repositories SET projection_request_token = gen_random_uuid();
--> statement-breakpoint
UPDATE github_public_feed_head SET projection_request_token = gen_random_uuid();
