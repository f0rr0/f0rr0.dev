# GitHub activity ingestion

The site records commits authored by `f0rr0` or `yuppiestechdev` when GitHub
exposes them through a push, pull request, or current ref in a repository that
one of those accounts can access. A repository can be public or private and can
belong to either account or to somebody else. GitHub remains the source of
truth for repository contents: the database keeps durable identities,
observations, deterministic facts, pull-request structure, and generated
summaries, but not patch bodies, tree/blob contents, or webhook payloads.

## Architecture

```text
GitHub push / pull_request / issues webhooks
  -> Vercel /api/github/webhook
  -> verify + durably record delivery/observation/snapshot
  -> 202 (no GitHub or OpenAI work in the request)

Supabase Cron every 5 minutes
  -> Vercel /api/cron/github-sync
  -> authenticated GitHub user Events feeds
  -> persist observations, sparse PR signals, and event checkpoints

Supabase Cron every 15 minutes, staggered by ref kind
  -> Vercel /api/cron/github-refs?kind=head&repositories=8
  -> Vercel /api/cron/github-refs?kind=tag&repositories=8
  -> resume a bounded accessible-repository/page scan
  -> persist changed tips and the repository/page cursor

Supabase Cron every 5 minutes
  -> Vercel /api/cron/github-worker
  -> expand observations, enrich commits, discover/reconcile PRs,
     canonicalize proven copies, summarize, and publish

Manual GitHub Actions backfill
  -> authenticated GitHub APIs + Supabase transaction pooler
  -> scan commits from every distinct current ref head
  -> independently scan PR snapshots, memberships, and merge evidence
  -> persist candidates directly and run the same durable worker

Next.js server render / GET /api/github/activity
  -> snapshot-stable pages of complete UTC days
```

The webhook is the low-latency path for repositories where the GitHub App is
installed. Authenticated Events polling accelerates discovery for pushes made
by either account. A checkpointed sweep of every accessible repository's branch
and tag tips is the coverage path, including commits pushed to non-default
branches without a PR. Events intake never waits for that potentially expensive
sweep. All three intake paths converge on the same durable observation and
source-identity tables. Leases and unique constraints make overlapping webhook,
polling, ref reconciliation, and worker invocations safe.

Each GitHub API polling/reconciliation job verifies its token with `/user`; a
token mix-up cannot silently turn private activity into a public-only feed. Ref
reconciliation enumerates repositories through `/user/repos` and normalizes the
branch and repository-tag endpoints into `refs/heads/*` and `refs/tags/*`.
A candidate commit is retained only after GitHub identifies its top-level commit
author as one of the tracked accounts.

## Durable intake and checkpoints

The intake boundary is intentionally cheap:

- A webhook delivery receipt is keyed by GitHub's delivery UUID. Supported
  `push`, `pull_request`, and opened `issues` deliveries record only normalized
  metadata and the corresponding observation/snapshot. Unsupported deliveries
  are recorded as ignored. The raw JSON body is never stored.
- A push observation records its source, account, repository, ref, before/after
  SHAs, expected commit count, and any SHA list GitHub supplied. The worker can
  later expand a truncated push with authenticated GitHub APIs. When an Event
  or webhook later supplies an exact count and SHA sequence for a range first
  seen by ref scanning, that richer evidence replaces the sparse evidence and
  safely requeues the observation; contradictory evidence aborts intake.
- The Events poll persists GitHub's sparse PR shape as a durable signal rather
  than making a second provider request inline. The worker later hydrates that
  signal from the canonical pull-request endpoint; a transient 404 remains
  queued for reconciliation. The poll persists push observations, PR signals,
  and tracked-author issue milestones before advancing the event checkpoint
  transactionally. Stale event timestamps cannot overwrite or reschedule newer
  provider state.
- Repository reconciliation stores the last observed commit target for every
  current branch and tag. After the initial namespace baseline, a new or changed
  target creates the same durable push observation used by Events and webhooks.
  Missing refs are marked inactive, and identical heads are not expanded twice.
  The documented branch and repository-tag endpoints already return commit
  targets, including the commit behind an annotated tag, so no per-tag peel
  request is needed. Ref state and any resulting observation are committed
  together.
- Checkpoint updates use compare-and-swap. A concurrent winner causes the
  loser to reread and retry instead of overwriting newer progress.

The poller reads newest-first until the saved event ID, with at most three
100-event pages. GitHub's Events feed is bounded, so a checkpoint can eventually
fall out of the available window. In that case the run persists every still
available observation, advances to the newest event, and records the expected
and oldest available event IDs as a durable `detected` gap. It does not loop
forever on an unrecoverable checkpoint.

The first Events page uses its saved ETag. A `304` is a successful no-op and
updates the checkpoint's last-attempted/last-succeeded health timestamps. Ref
lists do not use that shortcut: a validator for page one cannot prove that a
mutable ref on a later page did not move.

The poller also persists GitHub's `X-Poll-Interval` as the next eligible Events
poll time. A five-minute cron invocation that arrives before that boundary is a
healthy deferred no-op rather than an unnecessary provider request.

Head and tag scans have independent leases and immutable numeric repository-ID
cursors. Each run handles at most eight API pages and eight distinct
repositories. A repository with more than 100 refs stores its next page and
scan-start watermark, resumes on the next run, and marks missing refs inactive
only after the final page. Its namespace reconciliation timestamp also advances
only then, so a partial scan can never masquerade as a complete snapshot.

The first complete sweep of each repository and ref kind establishes a baseline
without emitting historical observations for every pre-existing branch or tag.
This avoids turning the initial tag inventory into a large accidental backfill.
Events and webhooks remain the live bootstrap path while that baseline is being
built; run the date-bounded Action for deterministic pre-baseline history. Later
sweeps expand new and moved refs normally. Once observed, commits remain keyed
by repository ID and SHA after a branch is deleted or force-pushed.

A ref created and deleted (or force-pushed away) between observations is not
recoverable unless an Event, webhook, PR, or another surviving ref exposes its
commit. This is the remaining observability boundary; polling cannot discover a
Git object GitHub no longer exposes.

### Pause or resume an account

The pause flag is stored on the account checkpoint:

```sql
update github_account_checkpoints
set paused = true
where account = 'yuppiestechdev';
```

A paused account makes no Events requests, rejects new work from supported
webhooks after recording the delivery receipt, and is excluded from worker
claims. Its checkpoint and existing durable state are preserved. Resume with:

```sql
update github_account_checkpoints
set paused = false
where account = 'yuppiestechdev';
```

The next poll resumes from the preserved checkpoint if it is still in GitHub's
bounded Events window; otherwise it records a gap as described above.

## Worker pipeline

The five-minute worker is bounded and restart-safe. It runs these stages in
order:

1. Claim push observations and expand their complete pushed SHA set using the
   compare endpoint. For a newly observed ref or compact new-branch Event, walk
   the GraphQL commit-history cursor to completion. Persist the source
   membership, then create candidate rows only for tracked authors. Ref rewinds
   with no newly reachable commits complete successfully.
2. Claim candidate commits and fetch repository plus paginated commit evidence.
   Verify repository ID, SHA, and tracked author again; persist commit metadata,
   GitHub aggregate counters, file-derived languages, repository facts, and a
   deterministic change fingerprint.
3. Process the durable webhook/Event PR-signal inbox, ask GitHub which PRs are
   associated with each newly enriched commit, persist snapshots and complete
   memberships, then reconcile known PRs that are due.
4. Canonicalize only copies supported by complete, deterministic evidence.
5. Create and claim one summary attempt for each still-canonical, non-merge
   commit. Public commits use Nano when configured; private commits, missing
   credentials, provider failures, and invalid output use the deterministic
   commit-message summary. Publish only after one of those paths succeeds.

Routine Vercel runs claim up to four items in every provider-backed stage:
observations, commits, PR signals, commit-to-PR discoveries, due PR
reconciliations, and summaries. Canonicalization remains capped at eight, and
the pass has a 90-second internal deadline. Direct GitHub Actions backfill
passes raise every provider-backed stage limit to eight and use a four-minute
per-pass deadline. The Action runner uses its longer job lifetime through
repeated durable passes rather than one unbounded operation. A pass that reaches
its deadline releases unfinished claims at their previously eligible retry
state; an invocation boundary does not spend a retry attempt or add backoff.

A commit with more than one parent is a regular merge commit. It remains fully
stored for intake, ancestry, and alias evidence, but it is excluded from summary
creation, summary claims, the public activity projection, pagination days, and
daily LOC/repository totals. A merged pull request remains visible as its
separate PR milestone. This intentionally omits even a merge commit with unique
conflict-resolution changes: the public surface describes authored work and PR
outcomes, not integration mechanics.

An issue opened by a tracked account needs no enrichment or model call. Intake
persists its stable node/repository IDs, original title/link snapshots, creation
time, and a published issue milestone transactionally. Both `IssuesEvent` and
an `issues` webhook converge on those same unique identities.

Observation and commit fetches require GitHub's provider timestamp rather than
substituting the poll time. They use retryable database states and honor GitHub
rate-limit timing; permanent source failures become `unavailable`. Work is
owned through conditional leases, so a timed-out Vercel invocation can be
continued safely by a later worker. The worker stops starting expensive work
before its internal deadline.

Commit storage is sufficient to audit and re-fetch the source under the normal
assumption that repository access and history remain available. It includes
repository ID, SHA, tree SHA, parent SHAs, full commit message, author and
committer identities/times, GitHub counters, languages, repository display
facts, and the fingerprint result. Patch text and per-file evidence exist only
in memory for deterministic derivation and the optional Nano request.

Author identity determines whether a commit belongs to a tracked account.
GitHub's committer timestamp determines date-range inclusion, timeline order,
and the stored activity occurrence time; author time remains preserved as
source evidence but is not substituted for the public timestamp.

## Pull requests and deterministic grouping

PR membership comes from GitHub, not from an LLM. For each enriched commit the
worker first uses GitHub's associated-PR endpoint. Each PR is stored by stable
node ID with a current mutable snapshot and immutable head-SHA versions. The
commit list is fetched for a new head SHA. GitHub's PR-commit endpoint serves
memberships through its 250-commit limit; larger or otherwise incomplete
responses fall back to the paginated `base SHA...head SHA` comparison on the
base repository. The comparison must report the snapshot's exact commit count,
terminate cleanly, and end at the snapshot head. An incomplete membership is
never accepted as complete evidence. Association is not filtered by PR author,
so a foreign-authored PR can still organize a tracked commit. Only a
tracked-authored merged PR becomes the separate public merge milestone.

When a commit appears in more than one current complete PR membership, the
earliest-created PR (then stable node ID) is its deterministic primary PR. The
timeline groups same-day primary members under that PR title. This is a display
projection: every canonical source commit remains an independently stored
activity, and a PR that spans days appears as one slice in each relevant day.
Commits without a proven PR association remain standalone.

### Reconciliation policy

Open PR reconciliation has no age cutoff. Its cadence slows with age: every
three hours through day 30, daily through day 180, then weekly. A refresh
updates title, body, draft/state, base/head, authoritative merge evidence,
counts, and provider timestamps. Commit membership is fetched again only when
the head SHA changes or the current head's prior membership is incomplete. A
base-only, title, or body edit does not fetch membership again or create a new
commit-summary revision.

Each routine worker pass claims at most four due PRs globally across active
tracked accounts; the Action raises that global cap to eight. Claims rotate one
account at a time so one account cannot consume the whole pass while another
has eligible work. A known merged or closed PR receives one successful terminal
refresh, then clears
`next_reconcile_at` and leaves the queue. Temporary failures use exponential
backoff from 15 minutes through 24 hours instead of silently dropping that
refresh. A GitHub `404` remains retryable because repository permissions can
change; `410` and `422` become unavailable only after eight attempts.
A proven repository/SHA provenance change remains immediately terminal.

### Proven-copy canonicalization

The public feed hides an integration copy only when the database can point to a
specific canonical activity and persist the reason plus evidence:

- A GitHub-reported merge SHA is aliased to an existing source member only when
  GraphQL authoritatively verified that value and the PR has complete
  membership. A verified null merge commit is valid for a rebase merge, but it
  cannot prove an alias. Parent count distinguishes regular merge commits from
  squash integration commits.
- A multi-parent commit with a complete exact fingerprint is aliased when the
  matching commit SHA is literally one of its parents. If that parent is
  already an alias, the new copy resolves to the same canonical activity.
- A rebase/force-push copy is aliased only when both commits have complete,
  identical changed-line fingerprints and belong to distinct complete versions
  of the same PR.
- A cherry-pick is aliased only with the explicit `cherry picked from commit`
  trailer and the same complete fingerprint.

Author ID, author timestamp, commit message, committer order, or even an exact
fingerprint never establishes rewrite lineage by itself. Commits remain
separate unless one of the explicit PR-version, parent, or cherry-pick
relationships above proves causality.

A newer webhook, Event, or authoritative snapshot that changes a PR head or
state invalidates every alias derived from that PR in both its base repository
and any fork head repository. Those aliases are unpublished, their
canonical-alias summary attempts are requeued, and they become visible again
only after refreshed membership is conservatively canonicalized.

The fingerprint hashes stable hunk bodies—including unchanged context—and
file-change metadata. It excludes commit identity and numeric hunk coordinates.
A missing patch, counter mismatch, binary/provider omission, or GitHub file cap
makes the fingerprint incomplete, so it cannot prove an alias. Exact counters,
filenames, a headline, or timing by themselves never hide a commit. This can
leave visible duplicates when a standalone branch is rewritten without durable
PR-version evidence; that is the intentional fail-open behavior because hiding
a legitimate pushed commit would be irreversible without another refresh.

## Commit summaries

Every canonical non-merge commit gets one revision-scoped summary-attempt row.
For a public repository with `OPENAI_API_KEY` configured, the claimed attempt
makes one `gpt-5-nano-2025-08-07` request with `maxRetries: 0` and `store: false`.
The request produces both the compact headline and expandable short summary;
languages and line counts remain procedural rather than model-inferred.

Private repository evidence is never sent to OpenAI. Private commits and runs
without a model key use a deterministic summary derived from the first commit
message line. A model/API error, empty or malformed response, or validation
failure falls back to that same deterministic result, so model credentials and
availability cannot block publication. A database or lease failure defers the
attempt with exponential backoff. PR reconciliation, including title/body
updates, does not create a new commit-summary revision.

Public model input uses the full fetched evidence when it fits. Oversized
evidence goes through deterministic procedural compaction before the same
single call. See
[`github-activity-public-commit-summaries.md`](./github-activity-public-commit-summaries.md)
for the prompt, compaction, and output contract.

## Public timeline

The homepage reads a server-side projection of published, non-aliased
activities, excluding stored multi-parent merge commits. The initial render is
a React Server Component; only the pagination control is a client component.
Subsequent pages use
`GET /api/github/activity?cursor=...`.

Pagination is by complete UTC day, not by item. A page contains five days by
default (the server accepts at most 14). Its opaque, versioned cursor contains a
`beforeDay` boundary and the original `snapshotAt`, so loading older days cannot
mix in activities published after the first page. A safety limit fails the read
instead of returning a partial day.

Each day shows totals for repositories, GitHub-reported additions/deletions,
PRs merged, and issues opened. Repositories are ordered by their newest commit.
A contracted commit is one line containing its truncated headline, line-change
count, and chevron; expansion leaves those elements in place and adds the muted
description, languages, and file count below. PR commits are shown under
deterministic per-day PR slices, while a merge is a separate milestone with its
GitHub link when the repository is public. Repository and owner display facts
are served from persisted snapshots; the page does not refetch GitHub.
Timestamps hydrate to the viewer's local time without a timezone suffix; UTC is
used only for stable day grouping and pagination.

## Database and environment

Use the Supabase transaction pooler at runtime and a direct or session-pooler
connection for migrations and cron setup:

```dotenv
DATABASE_URL=postgresql://...:6543/postgres
DATABASE_URL_UNPOOLED=postgresql://...:5432/postgres
GITHUB_F0RR0_TOKEN=github_pat_...
GITHUB_YUPPIESTECHDEV_TOKEN=github_pat_...
GITHUB_WEBHOOK_SECRET=<at-least-32-random-characters>
CRON_SECRET=<at-least-32-random-characters>
# Optional for richer public-repository summaries.
OPENAI_API_KEY=...
```

`OPENAI_API_KEY` is also optional: private commits always use the deterministic
summary, and public commits fall back to it when the key or provider is
unavailable. `GITHUB_TOKEN` remains optional. Source fetches try the owning
account token, the other tracked account token, and then the optional default
token so a PR or repository readable by either identity can still be processed.
All tokens stay server-side.

Application and maintenance-script configuration is parsed through the shared
T3 Env schema in `src/env.ts`. Next.js loads root `.env.local` for local work;
Bun loads the same file for the maintenance scripts. Vercel environment values
are the production source. `.env.example` lists only values the application or
a maintenance script actually reads. Provider ceilings, schedules, batches,
windows, and retry timings remain reviewed code constants rather than
environment variables. `vercel.json` runs server functions in Tokyo (`hnd1`),
beside the Supabase `ap-northeast-1` database.

Cron targets use Vercel's system-provided production hostname during a
production build and the canonical site origin for a manual local setup. No
separate site-URL environment variable is required.

Every Vercel production build applies pending migrations before the Next.js
build, then reconciles Supabase Cron after a successful Next.js build. Both
maintenance steps use Vercel's `VERCEL=1` and `VERCEL_ENV=production` signals;
they do not hard-code a Git branch. Preview and local builds skip them without
opening the database, while a production failure fails the build.

`scripts/migrate-production-database.ts` uses the database URL already
synchronized from Supabase to Vercel; when only the transaction-pooler URL is
present, it derives the corresponding session-pooler URL. A PostgreSQL advisory
lock serializes overlapping migration builds. Apply migrations manually in
other environments with:

```sh
bun run db:migrate
```

## Supabase Cron

The production Vercel build installs and updates these jobs automatically. Use
the ungated command below only as an explicit repair or manual fallback with the
intended database and bearer secret loaded:

```sh
bun run supabase:cron
```

The script enables `pg_cron`, `pg_net`, and Vault and upserts the encrypted
route URLs and bearer secret. It then takes a PostgreSQL advisory transaction
lock and replaces the complete job set in one transaction, so overlapping
production builds serialize and a scheduling failure cannot leave a partial
set. It installs:

```cron
*/5 * * * *        # authenticated Events intake
2-57/5 * * * *     # bounded activity worker
4,19,34,49 * * * * # head-ref reconciliation, eight pages maximum
9,24,39,54 * * * * # tag-ref reconciliation, eight pages maximum
```

All cron requests have a 120-second HTTP timeout. Events intake and ref
reconciliation use one absolute 90-second provider deadline per invocation,
including token-identity checks and every pagination request; the ref batch
consumes whatever time remains instead of starting a new budget. The worker also
stops claiming new work after 90 seconds. This leaves time for final database
writes and the response. A bounded ref run continues its persisted repository
and within-repository page cursor on the next invocation.

At the audited inventory of roughly 193 accessible repositories, 3,025 head
refs, and 17,383 tags, the eight-page batches complete a head cycle in about six
hours and a tag cycle in about twelve hours. Scheduled intake uses roughly 112
REST requests per hour per token before worker traffic, about 2.2% of GitHub's
5,000-request authenticated hourly allowance. These are capacity estimates,
not correctness boundaries: persisted cursors and leases preserve progress if
inventory size or request latency grows.

`cron.job_run_details` proves that PostgreSQL enqueued a `pg_net` request; it
does not prove that Vercel accepted it. Inspect both tables. HTTP responses are
retained by `pg_net` for only six hours, and either cron route returns `503` if
even one account failed so standard failure monitoring cannot mistake a partial
run for success.

No Vercel Cron configuration is required. Inspect scheduling and HTTP delivery
from Supabase with:

```sql
select * from cron.job_run_details order by start_time desc limit 20;
select * from net._http_response order by created desc limit 20;
```

## GitHub App webhook

Configure the GitHub App webhook with:

- URL: `https://f0rr0.dev/api/github/webhook`
- content type: `application/json`
- secret: `GITHUB_WEBHOOK_SECRET`
- subscribed events: `push`, `pull_request`, and `issues`

The route enforces a 4.5 MB body limit, verifies the HMAC before JSON parsing,
requires a valid GitHub delivery UUID, deduplicates the receipt transactionally,
and returns `202` after durable intake. It deliberately does not fetch commits,
call OpenAI, or build the public timeline inline.

## Manual verification and rollout

The rollout order is schema, Vercel environment, Supabase jobs, GitHub App
subscriptions, then end-to-end observation. Nothing in this document implies
that a particular environment has already been migrated or deployed.

### Post-deploy evidence recovery

The REST 2026 pull-request contract removed the legacy `merge_commit_sha`
field. Earlier ingestion could therefore retain an unverified test-merge SHA,
falsely complete PR discovery, or permanently stop reconciliation. The schema
migration adds the nullable verification column but deliberately defers the
strict merge-evidence check: Vercel applies migrations while the previous
deployment can still receive traffic, and that deployment must remain
write-compatible until the new code is live.

The final invariant distinguishes three cases: unverified evidence stores both
fields as null; an authoritative merged PR stores a verification timestamp and
either its merge SHA or null for a rebase merge; non-merged PRs cannot carry
verified merge evidence.

The first authenticated GitHub worker request from the compatible deployment
acquires a database advisory lock and completes the recovery transaction before
claiming work. Later workers take only the constraint-marker fast path. This is
safe when there are no legacy rows too: the deferred constraint is still
installed. A newly provisioned database is not at final schema integrity after
migrations alone; either one compatible worker request or the manual Action
must finish this post-deploy step. A failed transaction rolls back completely;
the worker reports `503` without claiming work, and the manual Action exits
nonzero.

The `Repair GitHub evidence` workflow remains the auditable preview and manual
fallback. Run `preview` to read shared-production counts without changes. If the
constraint marker is absent, choose `apply` and enter
`REPAIR_GITHUB_EVIDENCE_V1` exactly. Apply performs one transaction that:

- clears only merge SHAs lacking authoritative verification while preserving
  already verified GraphQL evidence;
- resets commit aliases and canonicalization, and unpublishes only activities
  whose legacy alias is being cleared so they cannot surface as duplicates;
- requeues PR discovery for enriched commits, reconciliation for every known
  PR, and every current incomplete commit summary with retry counts reset; and
- installs the deferred database check so unverified merge evidence cannot be
  written again.

No commit, PR snapshot, membership, public-activity identity, or summary row is
deleted. Existing complete summaries remain reusable and are republished only
after canonicalization is rebuilt. Scheduled GitHub workers consume the durable
queues after recovery commits. The constraint is also the repair version
marker, so repeating `apply` returns `already_applied` without requeueing work.
Do not run manual apply before the compatible application deployment is serving
production traffic.

### Date-bounded backfill Action

The `Backfill GitHub activity` workflow is manually dispatched from GitHub
Actions after its workflow file is present on the default branch. `start_date`
is the earliest UTC calendar day included and `end_date` is the latest; both
days are inclusive, the start must not follow the end, and the end cannot be in
the future. Before inventory starts, the Action runs the same locked evidence
integrity preflight as the scheduled worker, so a backfill cannot process rows
under the transitional migration invariant. The workflow also accepts one
tracked account or both, an optional
numeric repository ID, and a wall-clock budget of up to 330 minutes. The
standard GitHub-hosted job has a 350-minute ceiling, leaving a 20-minute setup
and cleanup margin beneath GitHub's six-hour hard limit.

The Action runs the ingestion code directly. Its required repository secrets
map to the same typed runtime names used by Vercel:

```text
ACTIVITY_DATABASE_URL
ACTIVITY_F0RR0_TOKEN
ACTIVITY_YUPPIESTECHDEV_TOKEN
```

Only the token for each selected account is required. The optional
`ACTIVITY_OPENAI_API_KEY` enables richer public-repository summaries; omitting
it selects the deterministic fallback and does not reduce discovery coverage.

For each selected account, the runner first verifies that `/user` matches the
selected tracked account, then performs two independent discovery passes over
the requested inclusive UTC interval. There is no arbitrary day-count cap; the
selected Action time budget is the operational bound. Pull requests run first
because the all-repository authored-PR stream cannot be repository-sharded:

1. Enumerate every all-state pull request in each affiliated repository in
   ascending creation order. Creation order is stable while a mutable
   `updated_at` ordering can move PRs between pages; no timestamp cutoff is safe
   because Git commit timestamps are author-controlled. An all-repository run
   independently walks the tracked user's unbounded GraphQL `pullRequests`
   connection as well, so an authored PR remains discoverable when its base is
   an unaffiliated external repository. The author stream validates the
   returned user and PR author, repository database ID/name, PR identity/link,
   total count, unique progress, and every cursor before merging by PR node ID
   with the affiliated inventory.
   A repository-targeted run stays scoped to that numeric repository ID and does
   not invoke the author stream. Fetch complete membership, retain a PR when it
   contains a tracked commit in the interval or is a tracked-authored merge in
   the interval, and resolve merged PR evidence through GraphQL. A verified null
   merge commit is retained as the valid result of a rebase merge.
2. Enumerate every accessible repository and its current branches and tags,
   order branches before tags, and collapse refs that share a commit target.
   For each distinct target, paginate GitHub's commit list with that SHA,
   tracked author, `since`, and `until`, then persist candidates directly using
   repository ID plus commit SHA as their identity.

The commit and merge date filters remain inclusive at both ends. When `all` is
selected, the two account inventories run concurrently with a maximum
concurrency of two; each account still uses its own token and author filter.

Together, the passes deterministically cover tracked-author commits in the date
range that are reachable from a current ref or retained by an eligible PR when
the Action runs. They cannot discover a commit that was force-pushed away or
whose only branch, tag, and PR were deleted before any webhook, Event, prior
backfill, or surviving ref exposed its SHA. They also cannot inspect a
repository the selected token cannot access, and GitHub must associate the
commit author with the tracked account.

GitHub primary-rate-limit responses are waited out when the reset still fits
inside the selected budget. A deadline or provider delay that cannot fit marks
the inventory incomplete and fails the job explicitly. Repeating the same
inputs is safe: commit, PR, and membership identities deduplicate in the
database, and a complete current membership is not rewritten or invalidated on
an unchanged PR version. Provider discovery still restarts from the
deterministic beginning rather than storing an Action-only cursor. If an
all-repository scan repeatedly exceeds 330 minutes, dispatch the same range once
per numeric `repository_id` to shard the affiliated inventory; those scoped runs
intentionally do not replace the all-repository authored-PR pass.

After discovery, direct worker passes request at most eight items from every
configurable stage. They process the shared global queue, which can include work
unrelated to the selected backfill. The final JSON contains per-account
`inventories` with `direct` and `pullRequests` results, the aggregate
`inventoryComplete` flag, and global `processing` outcomes. A complete inventory
proves that both discovery passes reached their ends; it does not prove the
shared worker queue is empty. Likewise, a worker pass that claims zero items
does not prove retry-delayed work is absent. Normal five-minute Vercel worker
runs continue durable work after the Action stops.

Use an opaque numeric ID when targeting one repository so a private repository
name does not appear in public workflow inputs. Resolve it locally with:

```sh
gh api repos/OWNER/REPOSITORY --jq .id
```

Run Events intake plus one worker pass locally:

```sh
bun run github:sync
```

Or invoke each deployed route with the same bearer secret used by Supabase:

```sh
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://f0rr0.dev/api/cron/github-sync

curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  'https://f0rr0.dev/api/cron/github-refs?kind=head&repositories=8'

curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  'https://f0rr0.dev/api/cron/github-refs?kind=tag&repositories=8'

curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://f0rr0.dev/api/cron/github-worker
```

Verify, in order:

1. A webhook returns `202` and creates one delivery receipt plus one normalized
   observation/snapshot; replaying the delivery UUID is a no-op. An opened issue
   authored by a tracked account also creates one immediately published issue
   milestone.
2. An Events run advances the checkpoint only in the transaction that persisted
   its observations; concurrent runs converge through compare-and-swap.
3. Worker passes move observations and commits through their states, populate
   PR versions/memberships, and create exactly one summary attempt.
4. Terminal PRs have `next_reconcile_at = null`; every open PR has a future due
   time following the three-hour, daily, or weekly age-based cadence.
5. The public page contains complete UTC days, no proven integration-copy
   duplicates, stable older-page cursors, and correct daily totals.

## Deliberate limits

- GitHub Events are delayed and expose a bounded window. Webhooks improve
  latency but only where the App is installed; a recorded checkpoint gap still
  requires explicit operational review if missing history matters.
- Current-ref reconciliation covers tracked-authored commits even when somebody
  else pushed them, provided a selected token can read the repository and the
  commit remains reachable long enough for a scan.
- PR association and copy suppression favor false negatives: incomplete or
  ambiguous evidence leaves a commit standalone and visible.
- Repository deletion, inaccessible history, and force-pushed-away objects can
  make later enrichment unavailable. Raw patches are intentionally not retained.
- Supabase free-tier backup and retention characteristics are external to this
  application; source facts are re-fetchable only while GitHub access/history
  remains available.
