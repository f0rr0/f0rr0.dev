CREATE TABLE "codex_public_revisions" (
	"scope" varchar(10) PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "codex_public_revision_nonnegative" CHECK ("codex_public_revisions"."revision" >= 0),
	CONSTRAINT "codex_public_revision_scope" CHECK ("codex_public_revisions"."scope" = 'views' OR "codex_public_revisions"."scope" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "codex_public_revisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO codex_public_revisions (scope) VALUES ('views');
--> statement-breakpoint
-- Revisions commit with the public data, including direct CLI and backfill writes.
-- Keep date revisions after deletion so deleting and replacing a day cannot reuse a cache key.
CREATE FUNCTION advance_codex_public_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE affected_days date[] := ARRAY[]::date[]; affected_day date;
BEGIN
  IF TG_TABLE_NAME = 'codex_accounts' THEN
    IF TG_OP = 'UPDATE' AND (NEW.id, NEW.enabled, NEW.snapshot)
      IS NOT DISTINCT FROM (OLD.id, OLD.enabled, OLD.snapshot) THEN RETURN NULL; END IF;
  ELSE
    IF TG_OP = 'UPDATE' AND (NEW.account_id, NEW.day, NEW.payload)
      IS NOT DISTINCT FROM (OLD.account_id, OLD.day, OLD.payload) THEN RETURN NULL; END IF;
    IF TG_OP <> 'INSERT' THEN affected_days := array_append(affected_days, OLD.day); END IF;
    IF TG_OP <> 'DELETE' THEN affected_days := array_append(affected_days, NEW.day); END IF;
  END IF;

  -- ponytail: two accounts share a revision lock; split per account if write contention is measured.
  UPDATE codex_public_revisions SET revision = revision + 1 WHERE scope = 'views';
  IF NOT FOUND THEN RAISE EXCEPTION 'The Codex public revision is missing'; END IF;
  FOR affected_day IN SELECT DISTINCT unnest(affected_days) LOOP
    INSERT INTO codex_public_revisions (scope, revision) VALUES (affected_day::text, 1)
    ON CONFLICT (scope) DO UPDATE SET revision = codex_public_revisions.revision + 1;
  END LOOP;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER advance_codex_account_revision
AFTER INSERT OR UPDATE OR DELETE ON codex_accounts
FOR EACH ROW EXECUTE FUNCTION advance_codex_public_revision();
--> statement-breakpoint
CREATE TRIGGER advance_codex_usage_revision
AFTER INSERT OR UPDATE OR DELETE ON codex_usage_days
FOR EACH ROW EXECUTE FUNCTION advance_codex_public_revision();
--> statement-breakpoint
REVOKE ALL ON FUNCTION advance_codex_public_revision() FROM PUBLIC;
