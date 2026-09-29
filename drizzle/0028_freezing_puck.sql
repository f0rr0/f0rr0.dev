SELECT pg_advisory_xact_lock(hashtext('github-work-unit-projection-v1'));
--> statement-breakpoint
-- Restore omitted icons only from the exact saved work revision and facts.
ALTER TABLE github_activity_snapshots DISABLE TRIGGER protect_github_activity_history;
--> statement-breakpoint
WITH restored AS (
  UPDATE github_activity_snapshots AS snapshot
  SET payload = jsonb_set(snapshot.payload, '{facts,languages}', (
    SELECT jsonb_agg(language.value->'label' ORDER BY language.position)
    FROM jsonb_array_elements(unit.languages) WITH ORDINALITY AS language(value, position)
  ))
  FROM github_work_units AS unit
  WHERE snapshot.work_unit_id = unit.id
    AND snapshot.work_unit_revision = unit.revision
    AND snapshot.facts_digest = unit.facts_digest
    AND snapshot.payload->>'kind' = 'pull-request'
    AND snapshot.payload #>> '{facts,languages}' IS NULL
    AND jsonb_array_length(unit.languages) > 0
  RETURNING 1
)
UPDATE github_public_feed_head
SET feed_revision = feed_revision + 1,
  head_content_revision = head_content_revision + 1,
  last_published_at = clock_timestamp()
WHERE EXISTS (SELECT 1 FROM restored);
--> statement-breakpoint
ALTER TABLE github_activity_snapshots ENABLE TRIGGER protect_github_activity_history;
