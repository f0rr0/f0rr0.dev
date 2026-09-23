# GitHub activity pipeline

The site presents deterministic GitHub work units rather than a raw event or
per-commit log. The complete behavior, privacy rules, ownership precedence,
summary contract, operating envelope, and BDD scenarios live in
[`github-activity-work-units.md`](./github-activity-work-units.md). This document
is the short implementation and operations map.

## Intake

Three bounded paths converge on repository ID plus commit SHA:

- authenticated user Events polling records push observations, sparse pull
  request signals, authored issues, and its checkpoint atomically;
- verified GitHub webhooks record delivery receipts and normalized push, pull
  request, or opened-issue evidence without fetching GitHub or calling a model;
- repository/ref reconciliation records desired ref tips, while the ref repair
  worker persists complete reachable membership only for projection-relevant
  heads.

Each tracked account token used by polling, ref inventory, or backfill is
checked against GitHub's immutable numeric `/user.id`. Login is display
metadata, not identity. Repository visibility is published only after a
verified public/private fact; unknown visibility fails closed.

Different event IDs can describe the same push transition. Intake deduplicates
those observations, validates their commit evidence, and advances the checkpoint
only after the entire batch is persisted. Contradictory evidence rolls back the
batch.

## Durable worker

The worker leases small batches and can safely resume after a deadline. It:

1. expands push observations and hydrates sparse pull-request signals;
2. repairs projection-relevant ref generations when their desired tip or
   coverage boundary differs from the last complete generation;
3. enriches tracked-authored commits, completes commit-to-PR discovery, and
   reconciles PR snapshots, current/final memberships, authoritative merge
   evidence, and complete PR net file facts;
4. recomputes the current work-unit projection from durable evidence and swaps
   units, memberships, and public feed revisions atomically; and
5. evaluates summary inputs in newest-first batches of eight.

Ref intake requests a projection when desired ownership changes. Intermediate
ref repairs do not request another full-history read while the repository still
has incomplete relevant heads; the final repair requests publication. Other
changes, such as completed commit or PR evidence, can still request a projection.

A separate bounded summary worker claims at most one eligible summary.
Claims are ordered by newest activity, then newest observed content. The newest
accepted same-attribution summary remains visible after becoming stale until an
exact current summary replaces it; the item is marked as refreshing while that
replacement is evaluated, queued, retried, or processed.

Multi-parent merge commits and commits with neither file facts nor churn are not
separate timeline work. A provider-verified same-repository merge SHA is
excluded from canonical and side-ref ownership when it is absent from effective
PR membership. A ref-reachable SHA associated with that merged PR and carrying
an exact complete file-facts match to one of its members is owned by that PR
once, covering rewritten landings without message or timestamp heuristics.
Patch equivalence never suppresses another pull request, and associations alone
do not suppress ref ownership.

## Projection and publication

`github_work_units` is the current materialized projection. Stable public
identity is derived from the PR node ID, repository plus UTC day for canonical
work, or persisted branch lineage. Every included repository/SHA belongs to
exactly one current work unit.

Known-private work currently follows the same projection, summary, and display
path as public work. Unknown work contributes nothing. Redaction is deferred to
the public API boundary and does not alter internal storage or model input.

Summary attempts are keyed by the current outcome, attribution mode, recipe, and
summary-input digest. Accepted output is also retained independently of current
work-unit rows. Facts publish independently of optional prose. A force push
recomputes current PR membership and net outcome; an unchanged exact outcome
can reuse accepted prose across branch-lineage replacement. A superseded
unstarted input is removed. A paid
retryable input drops its payload but retains its request count; the exact input
is rebuilt and debounced if it becomes current later. Daily and monthly request
caps count started requests, including retries.

Opened issues remain durable authored milestones outside the work-unit summary
pipeline. A newly inserted issue with known visibility transactionally advances
the public feed head; replayed deliveries and unknown visibility do not.

The public reader groups a repository once per UTC day and reads complete days
against the current ordered-set revision. `github_public_feed_head` contains
the monotone feed/content/order revisions, last publication time, a durable
projection-request token, the applied pipeline-policy digest, and whether
configured initial-page summary work is being evaluated, queued, retried, or
processed. Evidence writers set the token transactionally;
projection clears the observed token only after its bounded summary-evaluation
backlog reaches zero. The stored pipeline-policy digest covers both projection
ownership and summary semantics, so a new worker requests the required refresh
after activation even if an older worker cleared a deployment-time token.

## Runtime configuration

GitHub activity is optional. Its server-side configuration is:

```dotenv
DATABASE_URL=postgresql://...
GITHUB_TOKENS={"alice":"<personal access token>"}
GITHUB_WEBHOOK_SECRET=<random secret>
CRON_SECRET=<random secret>
GITHUB_ACTIVITY_CURSOR_SECRET=<independent random secret>
```

`OPENAI_API_KEY` is optional. Without it, factual work units continue to
publish and summary claims remain untouched. `DATABASE_URL_UNPOOLED` is the
optional direct/session-pooler override used by migrations and Supabase Cron
configuration. `GITHUB_TOKEN` is optional for public discovery and code embeds. Secrets and
private evidence stay server-side.

Configure tracked authors once in `src/content/site.ts` as `{ login, id }` records.
The first account supplies the primary public GitHub profile. IDs are GitHub's
permanent numeric user IDs (stored as strings). GitHub social URLs and author
lookups derive from these records.

`GITHUB_TOKENS` is a JSON object mapping those logins to personal access tokens.
Blank input or `{}` means no account credentials. Keys are case-insensitive;
unknown accounts, case-colliding keys and empty token values are rejected without
logging tokens. Each account can have one token; omit its key to disable its
account-specific polling and inventory. The existing `/user` check verifies the
configured login and ID before acquisition. GitHub App installation tokens cannot
substitute for a personal account identity in these jobs.

Repository reads try the account's token first, then other configured credentials.
Changing tokens never changes the selected authors, rewrites stored identities or
prunes published history. Missing credentials and lost access defer fetching.
Intentional changes to the public author list request a work-unit rebuild and
filter issue visibility; raw evidence is retained. Username changes require an
explicit configuration/checkpoint maintenance operation, not automatic database
renaming. Keep the numeric ID unchanged when an existing account is renamed.

The forward migration only replaces the seven personal account-name constraints
with generic login shape checks. It adds no identity columns and preserves
existing checkpoints. Applied migrations remain unchanged.

Webhooks require their own `GITHUB_WEBHOOK_SECRET`; removing a token does not
revoke a webhook. Summaries require only their own `OPENAI_API_KEY` and stored facts.
Cron setup schedules polling and refs when tokens are configured; the existing
worker remains scheduled for database-only publication, and summaries are scheduled
when their provider key is configured. Codex scheduling follows enabled database
accounts. Rerun cron setup after enabling or disabling a service. Local cron setup
requires the Vercel production hostname in `VERCEL_PROJECT_PRODUCTION_URL`.
The manual backfill Action uses repository secrets `ACTIVITY_DATABASE_URL` and
`ACTIVITY_GITHUB_TOKENS` (mapped to the runtime variable `GITHUB_TOKENS`; GitHub
reserves the `GITHUB_` secret prefix). Its account input defaults to all configured authors. Every
selected backfill author needs a credential; use `--account` to select a subset.

Public output includes private-activity counts, timestamps and line/file facts,
with repository names masked; private repository IDs/avatar URLs can also appear.
Enable ingestion only if that publication policy fits the installation.

Routine entry points are:

- `POST /api/github/webhook`
- `POST /api/cron/github-sync`
- `POST /api/cron/github-refs`
- `POST /api/cron/github-worker`
- `POST /api/cron/github-summary`
- `GET /api/github/activity`
- `GET /api/github/activity/head`

The manual backfill Action is limited to 31 UTC days, a 30-minute processing
budget, and a 35-minute hard timeout. It lowers the ref coverage boundary,
repairs current heads once, discovers authored PRs, and drains the scoped
factual worker without generating summaries or projecting after every batch.
Replays are idempotent and incomplete runs fail visibly. A fresh ref baseline does not
expand every unchanged pre-existing side head; those become representable after
a later head signal or movement, or through complete current PR membership.
GitHub objects deleted or force-pushed away before any webhook, Event, PR,
backfill, or surviving ref exposed them cannot be reconstructed retrospectively.
