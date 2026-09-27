SELECT pg_advisory_xact_lock(hashtext('github-work-unit-projection-v1'));
--> statement-breakpoint
-- Remove unchanged revisions reposted after daily-history publication began.
-- Compare only the immediately preceding day, preserving genuine A -> B -> A work.
WITH duplicates AS (
  SELECT newer.day, newer.identity_key
  FROM github_activity_snapshots newer
  CROSS JOIN LATERAL (
    SELECT * FROM github_activity_snapshots older
    WHERE older.identity_key = newer.identity_key AND older.day < newer.day
    ORDER BY older.day DESC LIMIT 1
  ) previous
  WHERE newer.day >= DATE '2026-09-28'
    AND newer.work_unit_id = previous.work_unit_id
    AND newer.work_unit_revision = previous.work_unit_revision
    AND newer.facts_digest = previous.facts_digest
    AND newer.outcome_digest IS NOT DISTINCT FROM previous.outcome_digest
    AND newer.attribution_mode = previous.attribution_mode
    AND newer.payload->'facts' = previous.payload->'facts'
), removed AS (
  DELETE FROM github_activity_snapshots s USING duplicates d
  WHERE s.day = d.day AND s.identity_key = d.identity_key
  RETURNING s.day
)
UPDATE github_public_feed_head SET
  feed_revision = feed_revision + 1,
  head_content_revision = head_content_revision + 1,
  last_published_at = clock_timestamp()
WHERE id = true AND EXISTS (SELECT 1 FROM removed);
