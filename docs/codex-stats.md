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

## Detailed usage page

`/tokens` uses the same account logins, JSON snapshot column, and 15-minute sync.
No additional tables, services, browser credentials, or local task inventory are
required. Deploy the code; new breakdowns appear after the next successful sync.
Older snapshots remain valid and show the new breakdowns as unavailable.

Edit `src/content/tokens.ts` for public presentation:

- `enabled`: hides the route (404), navigation link, sitemap entry, and homepage
  preview when false. It also skips the additional analytics requests.
- `homepagePreview`: displays the full Token log on the homepage.
- `title` and `introduction`: write your own description of your AI practice.
- Model, composition, and tool breakdowns default to 30 days, with a 7-day option; the history
  chart always shows the past year without a period control.
- `sections`: enable activity, models, composition, and tools.
  Disabled breakdowns are omitted from the public detail data.
- `excludedTools`: exact plugin/skill names to omit from published data, including
  older snapshots. Names may still exist in the private database snapshot.
- `workLink`: an optional `{ href, label }` link; set to `null` to omit it.

Navigation labels/order live in `src/content/resume.ts`. Number formatting follows
`sitePreferences.language`; daily report boundaries remain UTC. Register each
underlying ChatGPT account only once. Sync rejects duplicate account identities.
Account names and IDs are never published.

### Sources and interpretation

The sync fetches 30 inclusive UTC dates from these internal ChatGPT endpoints:

- `/wham/analytics/daily-workspace-usage-counts`: text-token composition, turns,
  and model turn counts.
- `/wham/analytics/daily-plugin-usage-metrics`: plugin invocation counts.
- `/wham/analytics/daily-skill-usage-metrics`: skill invocation counts.

Responses are validated and allowlisted. An optional endpoint error or malformed
response retains that source's previous data, date range, and fetch timestamp.
Other sources still update. A successful fetch is not proof of complete upstream
coverage: Codex can lag by six hours, and sparse daily rows can reflect reporting
gaps. Empty rows are shown as unavailable rather than invented zero totals.
Explicit reported zero counts remain zero.

Text-token and invocation counts sum across distinct accounts. Cache-hit rate is
combined cached input divided by combined cached plus uncached input. Model bars
show turns, not cost or token shares. A turn can involve more than one model.
Daily delegation shares and unrecognized client labels are not published.
The page shows the five most-used tools (reported plugins) and skills separately.
A shared 7/30-day tab control updates usage, models, tools, and skills; 30 days is
the default. Usage combines turns, total text tokens, input/output composition,
and the weighted input cache hit rate in one grid. Both pages
retain the calendar. Each calendar view recalculates its four color bands from
the quartiles of its nonzero counts; zero stays separate and equal counts always
share a shade. Colors show relative usage within that view, not fixed token
amounts across views or refreshes. On the detail page, non-token workflow statistics separate
it from the volume chart. The volume chart defaults to one year of cumulative
tokens, with a Daily tab. Both views label the peak day's token count and date;
the cumulative view marks that day on the running-total curve, separately from
the final total. There are no period controls.
Unknown dates remain null unless returned daily counts reconcile with lifetime
usage. Null points break the line; known zero days sit at the baseline. Today's
count is incomplete. Cumulative values sum known counts and use “Recorded total”
when coverage is uncertain. History covers 365 dates ending today, independently
of the calendar's 52-week alignment and future placeholder cells. Token totals,
busiest day, and daily peak are omitted from the detail stats grid because the
chart provides that context. The homepage retains its original statistics.
The latest returned day is a row timestamp, not a completeness watermark.
No productivity, dollars saved, or code-authorship estimate is calculated.

### Checks

Run `bun test tests/token-details.test.tsx tests/codex-stats.test.ts` for parsing,
aggregation, exclusions, partial data, and optional-source failure retention.
Check `/tokens` and the homepage on mobile and desktop. With no
configured database the page displays an unavailable state, not sample data.

### Layout contract

The Token log uses the site's 16px body type with a 24px line height. These
relationships govern both the homepage and detail page:

- Page intro: starts at the shared `SiteMain` 32px top inset, with the page
  title retained for screen readers, like the other index pages.
- Section headings: use `SiteSection`, including calendar/chart tabs and the
  usage tabs through its `action` slot; no separate header spacing rules.
- Separate sections: 48px (two body lines), matching `SiteSection`.
- Related blocks: 24px (one body line), owned by the parent. `CodexActivity`
  and the stats components have no external margins.
- Heading to content: 16px (one body em), matching `SiteSection`; this keeps
  a heading closer to its content than to the preceding section.
- Chart axes: calendar and line chart share `TokenMonthAxis`: 12px labels,
  a 16px label row, and an 8px plot-to-label gap. Both show alternate months
  below 640px. Numeric y-axis labels sit inside the line plot at the shared
  left edge, using the same muted color and 12px body font as month labels.
- Info labels: use `InfoLabel`, with a 2px layout gap, a 24px button,
  and a centered 12px glyph. The 6px inset inside the button makes the effective
  text-to-icon-box gap 8px (half a body em), rather than adding 8px on top of
  that inset. Labels may wrap; buttons never shrink.
- Reading order: activity pairs chat count/duration, skill usage/breadth,
  streaks, and reasoning/fast mode. Usage leads with total text tokens, turns,
  and cache reuse, then new input, cached input, and output. Rankings descend
  by reported count. This order stays the same at every breakpoint.
- Stat cells: 24px label + 4px gap + 24px value + 10px top/bottom padding =
  72px (three body lines). The 4px gap binds each label to its value. Shared
  grid tracks grow for wrapped text instead of clipping it or shifting only
  one value. The 24px calendar-to-grid gap is measured between component
  boxes; the first label also has the cell's 10px inset.
- Column gutters: 16px, matching the heading/content gap. Both grids use two columns below 544px and three from 544px. Usage caps at three; activity stats use four from
  768px. The three-column threshold budgets 3 × 160px cells + 2 × 16px
  gutters + 2 × 16px page insets. Tool lists become side-by-side at 768px.

Verify actual element bounds at 320, 390, 640, 768, 1024, and 1440px. Check
label/button gaps, wrapping, tooltip fit, and aligned values/bars; do not infer
these from utility classes alone. Keep font size and weight constant when
adjusting density. These values are a site-specific rhythm, not universal
perceptual constants.
