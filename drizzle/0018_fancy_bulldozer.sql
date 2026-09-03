-- Production was provisioned during account setup before this migration shipped.
CREATE TABLE IF NOT EXISTS "codex_accounts" (
	"enabled" boolean DEFAULT true NOT NULL,
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"snapshot" jsonb,
	"snapshot_at" timestamp with time zone,
	CONSTRAINT "codex_accounts_id_shape" CHECK ("codex_accounts"."id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "codex_accounts_snapshot_pair" CHECK (("codex_accounts"."snapshot" IS NULL) = ("codex_accounts"."snapshot_at" IS NULL)),
	CONSTRAINT "codex_accounts_snapshot_object" CHECK ("codex_accounts"."snapshot" IS NULL OR jsonb_typeof("codex_accounts"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "codex_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX IF EXISTS "codex_accounts_sync_idx";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP CONSTRAINT IF EXISTS "codex_accounts_auth_secret_name_shape";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP CONSTRAINT IF EXISTS "codex_accounts_public_label_shape";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP CONSTRAINT IF EXISTS "codex_accounts_lease_pair";--> statement-breakpoint
DROP INDEX IF EXISTS "codex_accounts_auth_secret_name_unique";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "auth_secret_name";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "last_attempt_at";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "last_error_code";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "public_label";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "sync_lease_token";--> statement-breakpoint
ALTER TABLE "codex_accounts" DROP COLUMN IF EXISTS "sync_lease_until";
