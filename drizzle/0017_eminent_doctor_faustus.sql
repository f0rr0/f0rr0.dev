-- Production was provisioned during account setup before this migration shipped.
CREATE TABLE IF NOT EXISTS "codex_accounts" (
	"auth_secret_name" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"public_label" varchar(80) NOT NULL,
	"snapshot" jsonb,
	"snapshot_at" timestamp with time zone,
	"sync_lease_token" uuid,
	"sync_lease_until" timestamp with time zone,
	CONSTRAINT "codex_accounts_id_shape" CHECK ("codex_accounts"."id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "codex_accounts_auth_secret_name_shape" CHECK ("codex_accounts"."auth_secret_name" ~ '^[a-z0-9][a-z0-9_.-]{0,127}$'),
	CONSTRAINT "codex_accounts_public_label_shape" CHECK (length(btrim("codex_accounts"."public_label")) > 0),
	CONSTRAINT "codex_accounts_snapshot_pair" CHECK (("codex_accounts"."snapshot" IS NULL) = ("codex_accounts"."snapshot_at" IS NULL)),
	CONSTRAINT "codex_accounts_snapshot_object" CHECK ("codex_accounts"."snapshot" IS NULL OR jsonb_typeof("codex_accounts"."snapshot") = 'object'),
	CONSTRAINT "codex_accounts_lease_pair" CHECK (("codex_accounts"."sync_lease_token" IS NULL) = ("codex_accounts"."sync_lease_until" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "codex_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "codex_accounts_auth_secret_name_unique" ON "codex_accounts" USING btree ("auth_secret_name");--> statement-breakpoint
DROP INDEX IF EXISTS "codex_accounts_sync_idx";
