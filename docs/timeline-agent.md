# Timeline agent

The timeline is a rolling, 400-day newspaper edition. Deterministic code
collects and sanitizes GitHub activity; Eve decides editorial balance within
strict evidence and privacy constraints; the homepage only reads a validated
published edition.

## Data flow

```text
GitHub App / signed webhook       public contribution calendar
             |                                  |
             v                                  v
deterministic normalization      validated account-wide daily totals
             |                                  |
             +------------------+---------------+
                                v
Neon Postgres repository evidence + separate anonymous totals
             |
             v
privacy-safe clusters -> Eve editor -> deterministic validator
                                      |
                                      v
                             published edition JSON
                                      |
                                      v
                               cached homepage
```

Private commit messages, diffs, paths, branch names, authors, SHAs, issue IDs,
repository names, and repository URLs are not stored and are never placed in
the model context. Private rows contain daily volume, a keyed repository
pseudonym, a policy version, and (only when owner-approved) a broad taxonomy
bucket. Private language is withheld.

The model can only call load_activity and publish_timeline. Eve's default shell,
filesystem, web, search, delegation, and interaction tools are explicitly
disabled. publish_timeline is restricted to Eve's schedule principal.

The public contribution calendar is a second, repository-free evidence source.
It supplies a complete daily account total, including anonymous private or
internal contributions when the GitHub profile setting exposes them. The
pipeline subtracts known commit and event evidence once per day and clamps the
unexplained remainder at zero. That remainder is called "unattributed," not
"private": it can also contain public work the App cannot resolve. It is used
only for cadence, never repository, artifact, quality, or theme claims.

## Environment

Copy the names from .env.example into Vercel project settings or .env.local.
Do not commit values.

Required for durable editions:

- DATABASE_URL: pooled Neon connection injected by the Vercel Marketplace
  integration.
- DATABASE_URL_UNPOOLED: used by Drizzle migrations.
- CRON_SECRET: a random secret of at least 16 characters. Vercel sends it as
  the Bearer credential to the ingestion cron.
- One model credential: AI_GATEWAY_API_KEY for the default Gateway route, or
  OPENAI_API_KEY for the direct OpenAI AI SDK route.

Required for private activity:

- TIMELINE_PRIVACY_KEY: a high-entropy random secret of at least 32 characters
  and at least eight distinct characters.
- Either GITHUB_ACTIVITY_TOKEN, or all three GitHub App settings listed below.
  The App path is preferred in production.

Recommended production integration:

- GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_IDS:
  GitHub App installation credentials. Installation tokens are explicitly
  down-scoped to read-only repository contents. The same short-lived token
  reads the public contribution collection, so no personal token is required
  in production.
- GITHUB_ACTIVITY_TOKEN: an optional read-only user token for local setup and
  fallback ingestion when a GitHub App is not configured.
- GITHUB_PUBLIC_ACTIVITY_TOKEN: an optional dedicated fine-grained, read-only
  fallback token for public issues, pull requests, reviews, and repository
  creation when a GitHub App is not configured.
- GITHUB_WEBHOOK_SECRET: a high-entropy secret of at least 24 characters.
- TIMELINE_PRIVATE_TAXONOMY: optional owner-approved broad labels.
- AI_GATEWAY_ZERO_DATA_RETENTION=true: request Zero Data Retention when the
  Vercel plan supports it. Prompt-training opt-out is always requested.

When OPENAI_API_KEY is present, the agent uses the direct `@ai-sdk/openai`
provider and is used for local and production runs.
If OPENAI_API_KEY is absent, the string model ID routes through Vercel AI
Gateway.

Never set either credential in a client-visible environment variable.

TIMELINE_PRIVATE_TAXONOMY is a JSON object keyed by the private repository name
at the ingestion boundary:

```json
{
  "owner/repository": {
    "bucket": "Applied AI",
    "domain": "product"
  }
}
```

Allowed buckets are Applied AI, Open source, Product systems, Infrastructure,
Writing, and Private product work. Domain IDs are lowercase alphanumeric slugs
with hyphens. Repository names are used only for the in-memory lookup and are
never persisted. Changing the key or taxonomy changes the privacy-policy
version; old private rows and old protected editions then fail closed until a
complete reconciliation publishes a new edition.

## Neon and Drizzle

1. Install Neon from the Vercel Marketplace and connect it to the project.
2. Pull or set the database environment variables locally.
3. Apply the committed migration:

   ```sh
   bun run db:migrate
   ```

4. Run the first 400-day reconciliation:

   ```sh
   bun run timeline:sync --backfill
   ```

The schema stores normalized daily activity, public-only event evidence,
repository-free contribution totals, sync outcomes, idempotent webhook
receipts, and immutable edition payloads. Database
checks prevent private rows from carrying public identity; the event table
accepts only canonical GitHub repository, issue, and pull-request URLs.

## GitHub setup

For production ingestion and continuous updates, create a GitHub App with:

- repository contents: read-only;
- metadata: read-only;
- webhook events: push, repository, installation, and
  installation_repositories;
- the webhook URL: https://example.com/api/github/webhook;
- the same value in GitHub and GITHUB_WEBHOOK_SECRET.

Webhook bodies are authenticated before parsing, are bounded to 2 MB, and are
never persisted. Delivery IDs are HMACed for replay protection. A repository
that becomes private or is removed from the installation is immediately
scrubbed under both public and private pseudonymous keys, published editions
are withdrawn, and a full reconciliation is requested. Suspending or deleting
the installation withdraws all protected activity immediately.

The App collector inventories installed repositories and reads only commits
attributed to f0rr0 on the current default and gh-pages branches. Its
short-lived installation token also reads monthly slices of GitHub's
contribution collection. Optional user tokens provide the same monthly view
when an App is not configured. These are profile-oriented views, not every
commit on every feature branch; the timeline must therefore be described as a
view of activity, not a source-of-truth audit log.

In parallel, ingestion fetches the public contribution-calendar HTML for the
full rolling window without a token. All days, including zero days, must parse
before the source is marked complete. A calendar failure does not erase the
last good totals or block repository ingestion; anonymous editorial signals
are omitted when the last complete calendar window is stale or incomplete.

The contribution collector stores a title and canonical link only when the
repository is explicitly public and the contribution is not restricted.
Bodies, comments, labels, branches, and people are never requested; private
event objects are discarded. If GitHub withholds an individual contribution
from the App, that node and any older stored event it can no longer verify are
omitted without blocking the rest of the edition. Request, pagination, and
payload failures still mark ingestion incomplete and block agent publication.

## Schedules and publication

Two UTC schedules cooperate:

- 01:37: Vercel Cron calls /api/cron/timeline-sync. Public event visibility is
  reconciled across all 400 days on every run; installation commit reads retain
  the shorter overlap, with a weekly full reconciliation.
- 04:07: Eve loads the sanitized digest, balances leads, stories, briefs, and
  pulses, then publishes through the validator.

The homepage never calls a model. It reads the latest edition from Postgres and
falls back to verified public projects plus coarse contribution-month signals.
Its cache refreshes every 15 minutes.

For local agent development:

```sh
bun run build:agent
bun run dev
```

While the development server is running, dispatch the authored schedule:

```sh
curl -X POST http://localhost:3000/eve/v1/dev/schedules/daily-edition
```

Eve's local schedule cadence does not fire by itself. On Vercel, withEve turns
the authored Eve schedule into a Vercel Cron job.

## Editorial and privacy constraints

- The edition covers 365–402 days and contains up to 24 honest entries. With at
  least nine candidates, nine entries and a forty-percent compact layer are
  required.
- At most two leads may begin in one month, at most three leads may exist
  overall, and at most four entries may be stories.
- The agent submits only source keys and importance. Each final entry cites one
  known publishable source; arbitrary merging and source reuse are impossible.
- Importance cannot exceed the deterministic source classification.
- Dates, copy, buckets, cadence, visibility, and links are materialized by
  deterministic code from the selected source. Model-written claims cannot
  enter an edition.
- Public issues and pull requests are exact-dated dispatches. Commits appear
  only as broader runs, recurrence, or streak evidence, never as duplicate
  object-level dispatches.
- Exact artifact URLs collapse to one entry. A compact commit cluster containing
  the same repository event is absorbed, while a sustained implementation trend
  remains eligible because it communicates progression rather than the event
  itself.
- Public event evidence is retained in full, but the digest exposes at most
  three representative dispatches per month, preferring artifact and repository
  diversity. High-volume PR sequences therefore cannot crowd a year of
  progression off the editor's desk.
- The account-wide calendar may replace the narrower public streak as the
  edition's consistency lead. Unexplained monthly remainders are compact
  "Across the work" signals and never inherit a project bucket.
- Protected entries have no links, only month-level dates, and deterministic
  copy templates. The model cannot publish names or exact protected counts.
- A private theme is eligible only across at least three pseudonymous
  repositories, two approved domains, sufficient activity, and no dominant
  repository. Otherwise it collapses to Private product work.
- Commit volume is never presented as code quality, productivity, impact, or a
  performance score.

If ingestion, policy validation, the database, or GitHub visibility checks
fail, the page favors omission over disclosure.
