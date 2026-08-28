# GitHub commit ingestion

The site uses pushes by `f0rr0` or `yuppiestechdev` to discover candidate
commits, including pushes to repositories owned by other users or organizations
and repositories that are private. It persists a commit only when GitHub's REST
response links its top-level `author.login` to one of those accounts. GitHub
remains the source of truth: the database stores a small commit index, not
patches, trees, blobs, push observations, or webhook payloads.

## Architecture

```text
GitHub App push webhook ──> Vercel /api/github/webhook ──> Supabase Postgres
                                      │
                                      └─> GitHub patch ─> one Nano call

Supabase Cron (3 hours) ──> Vercel /api/cron/github-sync
                         ──> GitHub authenticated user events
                         ──> Supabase Postgres
                         ──> pending commit processing
```

The webhook is the low-latency path for repositories where the GitHub App is
installed. The poller is the coverage path for pushes made from either account
in any repository that account can access. Both paths write through the same
idempotent primary key, `(repository_id, sha)`.

The public GitHub Events API is not used. Each account token calls
`/users/{account}/events` as that same account, which is what allows GitHub to
include its private events. The poller verifies `/user` before reading events so
a token mix-up cannot silently downgrade the feed to public activity.

## State

There are only two tables:

- `github_commits` starts with repository ID/full name, SHA, verified tracked
  author, commit time, and commit subject. Processing adds repository
  visibility/owner display facts, GitHub-reported line counts and languages, two
  public summaries, and the model/recipe/input hash needed to audit them. It
  never stores patches, trees, blobs, or webhook payloads.
- `github_account_checkpoints` contains only the account, newest assimilated
  event ID, and pause state.

For each account, the poller reads events newest-first until it reaches the
saved event ID. It fetches commit metadata, then inserts the commits and advances
the checkpoint in one transaction. A failed run leaves the checkpoint where it
was; the next run repeats the same interval. Duplicate webhook deliveries,
overlap between webhook and polling, and retried cron calls are harmless.

After ingestion commits successfully, the same invocation claims up to eight
newest unprocessed rows. Each row re-fetches its current repository and commit
evidence, derives facts from GitHub's counters, and makes exactly one summary call.
Claiming is conditional, so webhook and cron invocations cannot process the same
row concurrently. A failed attempt is terminal and omitted from the public feed;
there is no automatic model retry or duplicate billing loop.

### Pause or resume an account

Set `paused` on the account's checkpoint row. A paused account makes no polling
API requests, advances no checkpoint, and ignores incoming push webhooks:

```sql
update github_account_checkpoints
set paused = true
where account = 'yuppiestechdev';
```

Resume it with:

```sql
update github_account_checkpoints
set paused = false
where account = 'yuppiestechdev';
```

The checkpoint is deliberately preserved while paused. When the account is
resumed, the next poll assimilates activity since that checkpoint, provided it
is still inside GitHub's bounded Events API window.

The first run assimilates the activity currently available from GitHub's Events
API. There is no arbitrary 400-day scan. [GitHub exposes at most 300 events and
only events from the last 30 days](https://docs.github.com/en/rest/activity/events);
the poller requests the three available 100-event pages. If an established
checkpoint disappears from that bounded feed, the run fails instead of silently
skipping the gap. To accept the currently available feed as a new baseline,
delete only that account's checkpoint and run the poller again:

```sql
delete from github_account_checkpoints where account = 'f0rr0';
```

## Supabase database

Create a free Supabase project and copy both connection strings from the
project's **Connect** panel:

- `DATABASE_URL`: Shared Pooler, transaction mode, port `6543`. Vercel uses this
  for short-lived runtime connections.
- `DATABASE_URL_UNPOOLED`: direct connection, port `5432`. Drizzle migrations
  and the Cron configuration script use this when available.

Apply the schema explicitly:

```sh
bun run db:migrate
```

After migrating existing activity from patch-derived counts to GitHub's native
counters, refresh only the stored deterministic facts—without making Nano
calls—with:

```sh
bun run github:refresh-counters
```

The migration clears the old patch-derived values first. If GitHub can no longer
serve an existing commit, that item stays out of the public feed instead of
presenting the old values as GitHub counters.

After changing the public-summary prompt, refresh stale completed summaries
with one Nano attempt per commit and no retry:

```sh
bun run github:refresh-summaries
```

A successful candidate replaces the two persisted summary variants and their
recipe/model/input hash. A failed candidate leaves the previous valid pair
untouched.

This migration intentionally removes the earlier experimental timeline tables
and any intermediate commit/checkpoint tables. Their data can be rebuilt from
GitHub. The two replacement tables have row-level security enabled with no
browser-facing policies; Vercel accesses them through the server-only Postgres
connection. Migrations are never run during install or deployment.

## Vercel environment

Configure these production environment variables:

```dotenv
DATABASE_URL=postgresql://...:6543/postgres
GITHUB_F0RR0_TOKEN=github_pat_...
GITHUB_YUPPIESTECHDEV_TOKEN=github_pat_...
CRON_SECRET=<at-least-32-random-characters>
GITHUB_WEBHOOK_SECRET=<at-least-32-random-characters>
```

`GITHUB_TOKEN` remains optional and is used only for the public repository list
shown elsewhere on the portfolio.

Each account-specific token must authenticate as the account named in the
variable, be able to read that user's Events feed, and have read access to
repository contents wherever private commits should be resolved. Keep the
tokens server-side.

## Supabase Cron

After the production Vercel deployment exists, set these variables locally in
addition to the database variables:

```dotenv
SITE_URL=https://f0rr0.dev
CRON_SECRET=<the-same-value-configured-on-vercel>
```

Then run:

```sh
bun run supabase:cron
```

The script enables `pg_cron`, `pg_net`, and Vault, stores the endpoint and
bearer secret encrypted in Vault, and creates this UTC schedule:

```cron
7 */3 * * *
```

The job sends an authenticated `POST` request to
`/api/cron/github-sync`. It replaces an existing job with the same name, so the
setup command is safe to rerun after rotating the secret or changing the site
URL. No Vercel Cron configuration is used.

Inspect scheduler and HTTP delivery status in Supabase with:

```sql
select * from cron.job_run_details order by start_time desc limit 20;
select * from net._http_response order by created desc limit 20;
```

## GitHub App webhook

Configure the GitHub App's push webhook with:

- URL: `https://f0rr0.dev/api/github/webhook`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET`
- Event: `push`

The route rejects an invalid signature before parsing the payload. It accepts
pushes to any branch in any public or private repository when the webhook
identifies `f0rr0` or `yuppiestechdev` as the push actor. Webhook commit details
are never trusted for authorship: every SHA is resolved through the authenticated
REST commit endpoint, and foreign or unlinked authors are discarded before the
database transaction. Malformed or incomplete responses fail the delivery so
GitHub can retry it.

## Manual verification

Trigger the polling route without waiting for Cron:

```sh
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://f0rr0.dev/api/cron/github-sync
```

Or run the same synchronization directly against the configured database:

```sh
bun run github:sync
```

The route returns aggregate account, event, commit, checkpoint, and activity
processing counts. It does not return tokens, repository contents, patches, or
raw private events.

## Public timeline

The homepage reads only completed activity through a dedicated scrubbed
projection. Results use keyset pagination ordered by commit time and a random
public UUID; the opaque cursor contains no repository ID or commit SHA. The
first page is cached for 15 minutes and subsequent pages are read from
`GET /api/github/activity?cursor=...`.

Repository presentation is deliberately separate from stored source data:

- Public repository: show the owner avatar, repository basename, and commit
  link, regardless of owner.
- Private repository directly under `f0rr0` or `yuppiestechdev`: show the
  account avatar and repository basename, without a link.
- Private repository under any other user or organization: show the owner
  avatar and `Private contribution`; omit the repository name and link.

The client never receives repository IDs, SHAs, full repository names, author
handles, raw commit messages, file paths, or patches. Each UTC date is rendered
as a section. Commits with at most 25 substantive GitHub-reported changed lines
use the stored headline; larger commits use the stored detailed summary.

## Deliberate limits

- GitHub says the Events API is not real-time and can be delayed. Webhooks are
  the immediate path where the App is installed; polling assimilates an event
  after GitHub exposes it.
- The Events API exposes a bounded recent window. Polling every three hours
  keeps the checkpoint well inside that window during normal operation.
- The Supabase free plan has no automatic backups. The index can be rebuilt
  from GitHub under the project's normal repository-access assumptions.
- Private repository names and commit subjects stay server-side so GitHub can
  be queried again. The public read model applies the repository visibility and
  ownership policy above before serialization.
- Push actor, committer, Git names/emails, refs, before/after SHAs, delivery
  metadata, canonical URLs, patches, trees, blobs, file lists, and raw payloads
  are not persisted by live ingestion.
