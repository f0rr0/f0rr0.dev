# GitHub activity ingestion

The site records commits authored by `f0rr0` or `yuppiestechdev` when either
account pushes them. A repository can be public or private and can belong to
either account or to somebody else. GitHub remains the source of truth for
repository contents: the database keeps durable identities, observations,
deterministic facts, pull-request structure, and generated summaries, but not
patch bodies, tree/blob contents, or webhook payloads.

## Architecture

```text
GitHub push / pull_request / issues webhooks
  -> Vercel /api/github/webhook
  -> verify + durably record delivery/observation/snapshot
  -> 202 (no GitHub or OpenAI work in the request)

Supabase Cron every 3 hours
  -> Vercel /api/cron/github-sync
  -> authenticated GitHub user Events feeds + accessible repository refs
  -> hydrate sparse PRs, persist observations, reconcile ref checkpoints

Supabase Cron every 5 minutes
  -> Vercel /api/cron/github-worker
  -> expand observations, enrich commits, discover/reconcile PRs,
     canonicalize proven copies, summarize, and publish

Manual GitHub Actions backfill
  -> authenticated GitHub APIs + Supabase transaction pooler
  -> queue bounded historical observations and run the same durable worker

Next.js server render / GET /api/github/activity
  -> snapshot-stable pages of complete UTC days
```

The webhook is the low-latency path for repositories where the GitHub App is
installed. Authenticated Events polling accelerates discovery for pushes made
by either account. A complete sweep of every accessible repository's branch and
tag tips is the coverage path, including commits pushed to non-default branches
without a PR. All three intake paths converge on the same durable observation
and source-identity tables. Leases and unique constraints make overlapping
webhook, polling, ref reconciliation, and worker invocations safe.

The poller verifies each token with `/user` before requesting
`/users/{account}/events`; a token mix-up cannot silently turn private activity
into a public-only feed. The same token enumerates repositories through
`/user/repos` and only the `refs/heads/*` and `refs/tags/*` namespaces. A
candidate commit is retained only after GitHub identifies its top-level commit
author as one of the tracked accounts.

## Durable intake and checkpoints

The intake boundary is intentionally cheap:

- A webhook delivery receipt is keyed by GitHub's delivery UUID. Supported
  `push`, `pull_request`, and opened `issues` deliveries record only normalized
  metadata and the corresponding observation/snapshot. Unsupported deliveries
  are recorded as ignored. The raw JSON body is never stored.
- A push observation records its source, account, repository, ref, before/after
  SHAs, expected commit count, and any SHA list GitHub supplied. The worker can
  later expand a truncated push with authenticated GitHub APIs.
- The Events poll hydrates GitHub's sparse PR shape from the canonical pull
  request endpoint before persistence. A newly authored PR can therefore be
  created immediately; a 404 retains the strictly validated signal for
  known-only reconciliation. The poll then persists push observations, PR
  snapshots, and tracked-author issue milestones before advancing the event
  checkpoint transactionally. Stale event timestamps cannot overwrite or
  reschedule newer provider state.
- Repository reconciliation stores the last observed commit target for every
  current branch and tag. A new or changed target creates the same durable push
  observation used by Events and webhooks. Missing refs are marked inactive,
  annotated tags are peeled to commits, and identical heads are not expanded
  twice. Ref state and its observation are committed together.
- Checkpoint updates use compare-and-swap. A concurrent winner causes the
  loser to reread and retry instead of overwriting newer progress.

The poller reads newest-first until the saved event ID, with at most three
100-event pages. GitHub's Events feed is bounded, so a checkpoint can eventually
fall out of the available window. In that case the run persists every still
available observation, advances to the newest event, and records the expected
and oldest available event IDs as a durable `detected` gap. It does not loop
forever on an unrecoverable checkpoint.

The first ref sweep has a fixed lower bound: the earliest commit already in the
durable timeline when this policy is installed. This fills gaps in the existing
timeline without importing a repository's entire history. New accounts start at
the time their checkpoint is created. Later sweeps expand only ref movements.
Commits remain keyed by repository ID and SHA after a branch is deleted or
force-pushed.

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
3. Ask GitHub which PRs are associated with each newly enriched commit and
   persist those PR snapshots. Reconcile known PRs that are due.
4. Canonicalize only copies supported by complete, deterministic evidence.
5. Create and claim one summary attempt for each still-canonical, non-merge
   commit, make one Nano call, and publish the activity only after it succeeds.

Routine Vercel runs claim four items from each bounded stage with a 90-second
internal deadline. Direct GitHub Actions backfills claim up to 16 with a
four-minute per-pass deadline. Both keep claims bounded; the Action runner uses
its longer job lifetime through repeated durable passes rather than one
unbounded operation.

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
in memory for deterministic derivation and the Nano request.

## Pull requests and deterministic grouping

PR membership comes from GitHub, not from an LLM. For each enriched commit the
worker first uses GitHub's associated-PR endpoint. Each PR is stored by stable
node ID with a current mutable snapshot and immutable head-SHA versions. The
commit list is fetched for a new head SHA; REST is used first and GraphQL
pagination covers PRs beyond the REST commit-list cap. An incomplete membership
is never accepted as complete evidence. Association is not filtered by PR
author, so a foreign-authored PR can still organize a tracked commit. Only a
tracked-authored merged PR becomes the separate public merge milestone.

When a commit appears in more than one current complete PR membership, the
earliest-created PR (then stable node ID) is its deterministic primary PR. The
timeline groups same-day primary members under that PR title. This is a display
projection: every canonical source commit remains an independently stored
activity, and a PR that spans days appears as one slice in each relevant day.
Commits without a proven PR association remain standalone.

### Reconciliation policy

An eligible open PR receives a full snapshot refresh every three hours. That
refresh updates title, body, draft/state, base/head, merge fields, counts, and
provider timestamps. Its commit membership is fetched again only when the head
SHA changes or the current head's prior membership is incomplete. A base-only,
title, or body edit does not fetch membership again and does not make another
Nano call.

Each worker run claims at most 25 due PRs per tracked account. Open PR
reconciliation has a reviewed 30-day age horizon in code. It is a product and
resource policy, not an environment-specific deployment setting. Eligibility
is calculated from PR `created_at` at query time, not permanently written into
a stopped state. The cap applies only to scheduled reconciliation; a webhook
or an associated-PR observation can still update an older PR opportunistically.

The age cutoff applies to ongoing open-PR reconciliation. A known merged or
closed PR still gets its terminal refresh. After that successful final refresh,
`next_reconcile_at` is cleared and it leaves the queue permanently. Temporary
failures defer the same terminal refresh rather than silently dropping it.
GitHub `404`, `410`, or `422` responses mark the PR permanently unavailable and
clear its reconciliation schedule.

### Proven-copy canonicalization

The public feed hides an integration copy only when the database can point to a
specific canonical activity and persist the reason plus evidence:

- Amendments, rebases, force-push rewrites, and same-repository cherry-picks
  that preserve the exact non-null GitHub author ID, authored timestamp, and
  full commit message form one non-merge rewrite lineage. The latest committer
  timestamp wins, followed by observation time and SHA as deterministic ties.
  Fingerprints and parent SHAs may differ because rewriting is allowed to change
  the patch and its base. Existing aliases are retargeted directly to the winner
  so the public graph never contains an alias chain.
- A GitHub-reported merge SHA is aliased to an existing source member only when
  that PR has complete membership. Parent count distinguishes regular merge
  commits from squash integration commits.
- A multi-parent commit with a complete exact fingerprint is aliased when the
  matching commit SHA is literally one of its parents. If that parent is
  already an alias, the new copy resolves to the same canonical activity.
- A rebase/force-push copy is aliased only when both commits have complete,
  identical changed-line fingerprints and belong to distinct complete versions
  of the same PR.
- A cherry-pick is aliased only with the explicit `cherry picked from commit`
  trailer and the same complete fingerprint.
- The provider can omit PR association for squash/rebase flows, especially on
  non-default target branches. Two single-parent commits can therefore be
  aliased without PR membership only when they have the same repository,
  complete exact fingerprint, non-null GitHub author ID, and normalized first
  message line. Normalization removes only GitHub's terminal ` (#123)` suffix;
  the earlier committer timestamp wins, with observation time and SHA used only
  as deterministic ties.

The fingerprint hashes stable hunk bodies—including unchanged context—and
file-change metadata. It excludes commit identity and numeric hunk coordinates.
A missing patch, counter mismatch, binary/provider omission, or GitHub file cap
makes the fingerprint incomplete, so it cannot prove an alias. Exact counters,
filenames, a headline, or timing by themselves never hide a commit. The
same-author/headline fallback is admitted only after complete byte-identical
patch evidence and single-parent shape. Unproven commits remain visible. The
known ambiguity is an intentional revert-and-reapply of the same exact patch
with the same headline by the same author; for this achievement timeline it is
deliberately collapsed, and the stored alias evidence keeps the decision
auditable and reversible.

## One-shot Nano summaries

Every canonical non-merge commit gets one revision-scoped summary-attempt row
and, when claimed, one `gpt-5-nano-2025-08-07` request with `maxRetries: 0` and
`store: false`. The request produces both the compact headline and expandable
short summary. Languages and line counts are procedural and are not inferred
by the model.

If the worker reaches its deadline before issuing the model request, it releases
the claim back to `pending`; no attempt was consumed. Once the request starts,
an API/transport error, empty response, output that lacks the requested
`HEADLINE`/`SHORT` labels, or other processing error is terminal `failed`. A
lost lease becomes `indeterminate` and is not automatically
reclaimed, avoiding duplicate billing when the remote outcome is unknown.
There are no automatic model retries. PR reconciliation, including title/body
updates, does not create a new commit-summary revision.

Ordinary commits send the full fetched evidence. Oversized evidence goes
through deterministic procedural compaction before the same single call. See
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
PRs merged, and issues opened. Commit items always show the headline, counters,
file-derived language icons, and file count. Higher-substantive-LOC or
provider-capped commits can expand to the full short summary. PR commits are
shown under deterministic per-day PR slices, while a merge is a separate
milestone with its GitHub link when the repository is public. Repository and
owner display facts are served from persisted snapshots; the page does not
refetch GitHub.

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
OPENAI_API_KEY=...
SITE_URL=https://f0rr0.dev
```

`GITHUB_TOKEN` remains optional. Source fetches try the owning account token,
the other tracked account token, and then the optional default token so a PR or
repository readable by either identity can still be processed. All tokens stay
server-side.

Application and maintenance-script configuration is parsed through the shared
T3 Env schema in `src/env.ts`. Next.js loads root `.env.local` for local work;
Bun loads the same file for the maintenance scripts. Vercel environment values
are the production source. `.env.example` lists only values the application or
a maintenance script actually reads. Provider ceilings, schedules, batches,
windows, and retry timings remain reviewed code constants rather than
environment variables.

Every Vercel production build applies pending migrations before the Next.js
build. Vercel remains the source of truth for which Git branch is production.
`scripts/migrate-production-database.ts` uses the database URL already
synchronized from Supabase to Vercel; when only the transaction-pooler URL is
present, it derives the corresponding session-pooler URL. A PostgreSQL advisory
lock serializes overlapping builds. Preview and local builds skip the database
entirely. Apply migrations manually in other environments with:

```sh
bun run db:migrate
```

## Supabase Cron

After the production Vercel routes and environment exist, run:

```sh
bun run supabase:cron
```

The script enables `pg_cron`, `pg_net`, and Vault, upserts the encrypted route
URLs and bearer secret, replaces jobs with the same names, and installs:

```cron
7 */3 * * *   # authenticated Events intake
*/5 * * * *   # bounded activity worker
```

Both cron requests have a 120-second HTTP timeout. The worker stops claiming
new work after 90 seconds, leaving time for its final database writes and
response. Full syncs currently complete inside the same bound; if they outgrow
it, checkpoint the sync itself instead of merely extending the timeout.

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

### Date-bounded backfill Action

The `Backfill GitHub activity` workflow is manually dispatched from GitHub
Actions after its workflow file is present on the default branch. It accepts an
inclusive oldest and newest commit date, one tracked credential or both, an
optional numeric repository ID, and a wall-clock budget of up to 330 minutes.
The standard GitHub-hosted job has a 350-minute ceiling, leaving a 20-minute
setup and cleanup margin beneath GitHub's six-hour hard limit.

The Action runs the ingestion code directly. Its repository secrets map to the
same typed runtime names used by Vercel:

```text
ACTIVITY_DATABASE_URL
ACTIVITY_F0RR0_TOKEN
ACTIVITY_YUPPIESTECHDEV_TOKEN
ACTIVITY_OPENAI_API_KEY
```

The runner divides an arbitrary date range into requests of at most 366 days,
then into non-overlapping 31-day history windows. It enumerates current refs,
collapses refs that share a head, and queues durable `backfill` observations.
If a request would exceed the 5,000-observation database bound, the runner
divides that date request again rather than weakening the bound. Repository ID,
ref head, and window bounds form the idempotency identity: rerunning the same
range is a no-op for completed observations and requeues deferred or
unavailable observations.

Direct worker passes claim at most 16 items from each bounded stage and stop
when the queue drains or the selected wall-clock budget expires. Normal
five-minute Vercel worker runs finish any durable work left behind.

Use an opaque numeric ID when targeting one repository so a private repository
name does not appear in public workflow inputs. Resolve it locally with:

```sh
gh api repos/OWNER/REPOSITORY --jq .id
```

Run the normal synchronization locally:

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
4. Terminal PRs have `next_reconcile_at = null`; eligible open PRs have a future
   due time; old open PR behavior follows the configured query-time cap.
5. The public page contains complete UTC days, no proven integration-copy
   duplicates, stable older-page cursors, and correct daily totals.

## Deliberate limits

- GitHub Events are delayed and expose a bounded window. Webhooks improve
  latency but only where the App is installed; a recorded checkpoint gap still
  requires explicit operational review if missing history matters.
- The system covers commits pushed by a tracked account and authored by a
  tracked account. It deliberately does not discover a tracked author's commit
  when somebody else pushes it and no tracked-account observation includes it.
- PR association and copy suppression favor false negatives: incomplete or
  ambiguous evidence leaves a commit standalone and visible.
- A finite reconciliation age intentionally stops checking old open PRs. If a
  third-party PR merges after that cutoff and no relevant webhook/Event reaches
  us, its terminal state is not discovered unless the cap is widened (or set to
  `infinity`).
- Repository deletion, inaccessible history, and force-pushed-away objects can
  make later enrichment unavailable. Raw patches are intentionally not retained.
- Supabase free-tier backup and retention characteristics are external to this
  application; source facts are re-fetchable only while GitHub access/history
  remains available.
