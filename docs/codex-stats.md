# Codex stats

The portfolio reads sanitized Codex usage snapshots from Supabase. A scheduled
Supabase cron calls a protected Vercel route every 15 minutes.

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

4. Deploy to production. The existing Supabase cron setup schedules the sync.

Account credentials stay encrypted in Supabase Vault; the table stores only
internal account IDs, timestamps, and allowlisted usage fields. Prompts, emails,
ChatGPT account IDs, raw API responses, and auth tokens are never copied into
public snapshots.

The sync refreshes OAuth credentials when needed, then calls the same
`GET /backend-api/wham/usage` and `GET /backend-api/wham/profiles/me` endpoints
used by Codex clients. Responses are validated and reduced to the public
allowlist before storage. The public view sums token, chat, skill-run, daily,
weekly, and cumulative totals. When daily buckets reconcile exactly to lifetime
totals, peak and streak statistics are rebuilt from the combined activity.
Fast-mode percentages are shown as the observed range, and unique skills as the
mathematically valid range between the largest account count and their sum. The
primary limit is combined only when every account has the same plan and window.
