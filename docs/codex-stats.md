# Tokens setup

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
cannot be calculated. Plan limits and allowance shares stay separate per account.

## Detailed usage page

`/tokens` uses the existing credentials, snapshot storage, and sync schedule.
Breakdowns become available after the next successful sync. Register each
underlying ChatGPT account only once; duplicate identities cause sync to fail.

Configure public presentation in `src/content/tokens.ts`:

- `enabled`: controls the route, navigation, sitemap entry, homepage preview,
  and additional analytics requests.
- `homepagePreview`: shows token totals and the calendar on the homepage.
- `title`, `introduction`, and `workLink`: customize the copy and optional work link.
- `sections`: controls activity, models, composition, tools, delegation, and limits.
- `historyDays`: retained analytics window (30–365 days); the first successful sync
  fetches this window, then subsequent syncs refresh recent dates and retain older rows.
- `rankingLimit`: number of ranked tools and skills displayed.
- `accountLabels`: optional public labels keyed by registered account ID; defaults
  to numbered accounts. Credentials and upstream account identities stay private.
- `timeZone`: timezone for displaying allowance reset dates.
- `excludedTools`: exact plugin/skill names to exclude from public data,
  including older snapshots. Stored data is not deleted.

Navigation labels and order are configured in `src/content/resume.ts`.

### Data limitations

The detailed breakdowns use internal Codex endpoints. History means available
records within `historyDays`, not complete lifetime coverage. Changing the window
triggers a fresh backfill. Requests fetch up to 100 named tools/skills; upstream may
group additional entries. These sources may lag behind profile totals. Failed
requests retain previous data; empty sections are hidden. Day boundaries are UTC.

Token and invocation counts sum across accounts. Cache hit rate is weighted by
input tokens from rows with all components reported; missing components are not
zero. Model counts include reported background turns. Allowance shares are not
token shares. Missing history stays unknown unless daily counts reconcile with
lifetime usage. The longest-turn metric measures a single turn, not a whole chat.
