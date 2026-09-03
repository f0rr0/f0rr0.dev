# Codex stats

The portfolio reads sanitized Codex usage snapshots from Supabase. A scheduled
GitHub Actions runner launches the pinned Codex CLI every 15 minutes, so no
Codex binary is deployed to Vercel and no permanent runner is required.

## Setup

1. Apply the database migration with `bun run db:migrate`.
2. Create one dedicated `CODEX_HOME` per account, set
   `cli_auth_credentials_store = "file"` in each `config.toml`, and run
   `CODEX_HOME=/private/path codex login --device-auth` for each. Do not reuse an
   actively used Codex home: the runner persists refreshed `auth.json` files.
3. Store each login and its public label:

   ```sh
   bun run codex:account account-one "Account one" /private/path
   bun run codex:account account-two "Account two" /private/other-path
   ```

4. Expose the existing database connection as the GitHub Actions repository
   secret `ACTIVITY_DATABASE_URL`, then manually run the **Codex stats** workflow
   once.

The workflow needs direct database access only. Account credentials stay
encrypted in Supabase Vault; the table stores only labels, leases, safe error
codes, timestamps, and allowlisted usage fields. Prompts, emails, account IDs,
raw API responses, and auth tokens are never copied into public snapshots.

The sync uses Codex App Server's supported
[`account/rateLimits/read`](https://learn.chatgpt.com/docs/app-server) method and
automatic token refresh. It then makes the same authenticated
`GET /backend-api/wham/profiles/me` request as Codex itself because App Server's
`account/usage/read` response currently omits Profile statistics. The request
uses only the refreshed bearer token, ChatGPT account ID, and the exact Codex
user agent returned during App Server initialization. The Profile endpoint is
internal, so its response is validated and reduced to the existing public
allowlist before storage. The public view sums token, chat, skill-run, daily,
weekly, and cumulative totals. When the daily buckets reconcile exactly to the
lifetime totals, peak and streak statistics are rebuilt from the fused activity
instead of taking weaker per-account maxima. Fast-mode percentages are shown as
the observed range, and unique skills as the mathematically valid range between
the largest account count and their sum. The primary limit is pooled only when
every account has the same plan and window. Per-account identities and global
rankings that cannot be recovered from truncated per-account lists are
discarded.
