-- Public snapshots also depend on current repository visibility, before projection.
CREATE FUNCTION advance_github_repository_visibility_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM previous_repositories previous
    JOIN current_repositories current USING (id)
    WHERE previous.visibility IS DISTINCT FROM current.visibility
      AND EXISTS (
        SELECT 1 FROM github_activity_snapshots snapshots
        WHERE snapshots.repository_id = current.id
      )
  ) THEN
    -- Advance once per statement, after all repository rows have been updated.
    UPDATE github_public_feed_head
    SET feed_revision = feed_revision + 1,
        head_content_revision = head_content_revision + 1,
        ordering_revision = ordering_revision + 1,
        last_published_at = now()
    WHERE id = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'The GitHub public feed head is missing'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER advance_github_repository_visibility_revision
AFTER UPDATE ON github_repositories
REFERENCING OLD TABLE AS previous_repositories NEW TABLE AS current_repositories
FOR EACH STATEMENT EXECUTE FUNCTION advance_github_repository_visibility_revision();
--> statement-breakpoint
REVOKE ALL ON FUNCTION advance_github_repository_visibility_revision() FROM PUBLIC;
