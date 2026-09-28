SELECT pg_advisory_xact_lock(hashtext('github-work-unit-projection-v1'));
--> statement-breakpoint
-- A metadata-only revision reposted old canonical work on the publication day.
-- Keep its original snapshot and remove only a later copy with identical facts.
WITH removed AS (
  DELETE FROM github_activity_snapshots s USING github_work_units w
  WHERE s.work_unit_id = w.id
    AND w.kind = 'canonical_day'
    AND s.day >= DATE '2026-09-28'
    AND s.day > (w.activity_at AT TIME ZONE 'Asia/Kolkata')::date
    AND EXISTS (
      SELECT 1 FROM github_activity_snapshots original
      WHERE original.identity_key = s.identity_key
        AND original.day = (w.activity_at AT TIME ZONE 'Asia/Kolkata')::date
        AND original.attribution_mode = s.attribution_mode
        AND original.payload->'facts' = s.payload->'facts'
    )
  RETURNING s.day
)
UPDATE github_public_feed_head SET
  feed_revision = feed_revision + 1,
  head_content_revision = head_content_revision + 1,
  last_published_at = clock_timestamp()
WHERE id = true AND EXISTS (SELECT 1 FROM removed);
