# Token log setup

The portfolio reads sanitized Codex usage snapshots from Supabase. A scheduled
Supabase cron calls a protected Vercel route every 15 minutes.

## Environment

Use a Supabase database with Vault, `pg_cron`, and `pg_net` support. Configure
these in `.env.local` for local administration and in Vercel for the deployment:

- `DATABASE_URL`: runtime database connection.
- `DATABASE_URL_UNPOOLED`: direct or session-pooler connection for migrations,
  account registration, and cron setup when runtime uses a transaction pooler.
- `CRON_SECRET`: a random secret of at least 32 characters, shared by the route
  and scheduled requests.
- `VERCEL_PROJECT_PRODUCTION_URL`: production hostname, supplied by Vercel when
  system environment variables are exposed. Set it explicitly when configuring
  cron locally.

## Setup

1. Apply the database migration with `bun run db:migrate`.
2. Create one dedicated `CODEX_HOME` per account, set
   `cli_auth_credentials_store = "file"` in each `config.toml`, and run
   `CODEX_HOME=/private/path codex login --device-auth` for each. Do not reuse an
   actively used Codex home: the remote sync maintains its own refreshed copy.
3. Store each login:

   ```sh
   bun run codex:account account-one /private/path
   bun run codex:account account-two /private/other-path
   ```

4. Deploy using the Build Command in [site setup](site-setup.md), which runs
   migrations, builds the site, and configures Supabase cron. For an existing
   deployment, run `bun run supabase:cron` after registering the first account.
   The job is scheduled only when at least one account is enabled.

## Verify and maintain

The job calls `POST /api/cron/codex-stats` at minutes 7, 22, 37, and 52 each hour,
using `Authorization: Bearer <CRON_SECRET>`. Check the job in Supabase Cron and
`codex_accounts.snapshot_at` after it runs. A successful sync expires the public
stats cache, so the next page request reads the new snapshot. The 15-minute cache
expiry remains as a fallback. Pages already open update when reloaded.

A 401 response means the route's bearer secret is missing or incorrect. A 503
means sync failed; inspect the server's `codex_stats` error and check the database
connection and registered login. If login credentials expire or are revoked,
repeat the dedicated login and registration with the same account ID. Registration
replaces the Vault secret and clears the old snapshot until the next sync.

To stop including an account, set its `codex_accounts.enabled` value to `false`.
Rerun cron configuration after disabling every account to remove the scheduled
Codex job.

## Stored data

Account credentials stay encrypted in Supabase Vault; the table stores only
internal account IDs, timestamps, and allowlisted display fields. Prompts, emails,
ChatGPT account IDs, raw API responses, and auth tokens are never copied into
public snapshots.

The sync refreshes account credentials automatically and combines account usage
for display. Unique skills and percentage metrics use ranges where exact totals
cannot be calculated; plan limits are combined only for matching plans and windows.
