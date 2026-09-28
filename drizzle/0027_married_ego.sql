CREATE FUNCTION github_commit_file_stats(facts jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(
    entry.value -> 'filename', entry.value -> 'additions', entry.value -> 'deletions'
  ) ORDER BY entry.position), '[]'::jsonb)
  FROM jsonb_array_elements(facts) WITH ORDINALITY AS entry(value, position)
$$;
--> statement-breakpoint
ALTER TABLE "github_commits" ADD COLUMN "file_stats" jsonb GENERATED ALWAYS AS (github_commit_file_stats(file_facts)) STORED;
