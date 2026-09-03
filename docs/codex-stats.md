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

The sync uses the supported Codex App Server
[`account/usage/read`](https://learn.chatgpt.com/docs/app-server) and
[`account/rateLimits/read`](https://learn.chatgpt.com/docs/app-server) methods,
including the documented refreshed-auth persistence flow for
[CI/CD](https://learn.chatgpt.com/docs/auth/ci-cd-auth). The ChatGPT profile page
is intentionally not scraped; add that only if a required statistic is absent
from the supported response.
