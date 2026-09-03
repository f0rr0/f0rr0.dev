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
