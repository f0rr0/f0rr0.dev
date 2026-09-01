# GitHub activity work units

Status: implementation contract for the current branch. Production cutover and
real-data acceptance are operational checks, not additional product modes.

## What the timeline represents

The timeline is a current projection of authored code work. It is not a raw
GitHub event log and it is not intended to reproduce GitHub's contribution or
authored-pull-request totals.

Code appears as one of three work units:

1. one current pull-request outcome;
2. one UTC day of direct work on a repository's canonical branch; or
3. one current outcome on an active non-canonical branch.

An opened issue is a separate authored milestone. Merge events, multi-parent
merge commits, empty commits, branch operations, tags, and obsolete PR/ref
memberships are not additional timeline rows.

The public result has these invariants:

- One eligible repository/SHA belongs to at most one work unit. The database
  enforces this with a unique membership constraint.
- A repository is rendered once per UTC day. Every work unit and opened issue
  for that repository and day is grouped under the same header.
- The displayed repository count is the number of rendered public repository
  groups. The generic private group is excluded.
- A PR is one row. Merging it does not create a second row or a merge label.
- A force push changes current membership. A removed SHA no longer belongs to
  its old unit; the ownership and association rules are reevaluated from the
  current evidence.
- Facts publish without a summary. PR titles and commit messages are not
  fallback display copy.
- Known-private activity renders only as `Private work` for that UTC day.
  Unknown visibility renders nothing.

A row shows aggregate owned commit count, unique filenames, additions,
deletions, detected languages, and a date range when the unit spans days. The
additions and deletions are authored churn summed across owned commits, not net
repository LOC. Language detection uses file extensions and excludes common
generated, vendored, lock, snapshot, minified, and binary-asset paths.

The work-kind icon is the only kind label in the row. A PR icon links to the PR;
a canonical-day or branch icon links to the newest owned commit. Issues retain
their authored titles because they do not use the code-summary pipeline.

## Eligibility boundary

A stored commit can enter the projection only when:

- GitHub's top-level author resolves to one of the tracked immutable user IDs;
- commit enrichment and the complete file ledger succeeded;
- GitHub's file cap was not reached;
- it has no more than one parent; and
- it has at least one file fact or non-zero churn.

The committer, pusher, webhook sender, PR author, and co-author trailers do not
replace commit authorship. Consequently, a PR authored by a tracked account is
not automatically a work unit: it must contain at least one current eligible
tracked-authored commit. This is why work-unit counts can differ from GitHub's
authored-PR count.

There is no patch-equality aliasing or inferred squash, rebase, or cherry-pick
lineage. A logical change is the exact repository ID plus commit SHA. One
narrow landing rule prevents duplication: when GitHub associates a commit with
a merged PR whose base repository is that commit's repository, but the commit
is absent from every effective PR membership, canonical-day ownership is
suppressed as a `merged_pr_landing` policy exclusion. A complete active side
head may still own it. Open, closed-unmerged, and foreign-base PR associations
do not suppress ref ownership.

## Deterministic ownership

The projector evaluates current complete evidence in this order:

| Priority | Evidence                                  | Owner                    |
| -------- | ----------------------------------------- | ------------------------ |
| 1        | Member of an effective PR snapshot        | Pull-request unit        |
| 2        | Reachable from the current canonical head | Repository + UTC day     |
| 3        | Reachable from an active side head        | Persisted branch lineage |
| 4        | No current complete owner                 | Not published            |

For an open PR, the effective snapshot is its current complete version. For a
closed or merged PR, it is its final complete version. When several effective
PRs contain the same change, selection is stable: merged before open before
closed, then tracked PR author before foreign PR author, then creation time and
PR node ID.

For side branches, the bytewise-normalized lexical ref order chooses the
primary current ref. The public identity uses its persisted lineage UUID, not
the branch name. Shared commits across several heads are still owned once.

Canonical-day identity is `repository ID + UTC activity day`. PR identity is
the immutable PR node ID. Branch identity is the lineage UUID. Work-unit member
order is a stable topological order with repository/SHA tie-breaks.

The activity timestamp is the latest owned commit's committer timestamp, with
the committed timestamp as fallback. For PR and branch units, an existing
activity anchor is reused when the normalized outcome digest is unchanged.
Repartitioning the same PR outcome therefore does not make old work look new.
Canonical-day units always follow their owned commits' UTC day.

## Completeness and privacy

Evidence and publication are separate. Durable evidence includes account event
checkpoints, webhook receipts, push observations, enriched commits,
commit-to-PR associations, PR versions and memberships, repository facts, and
desired head refs. Current ref generations store the tracked-author
intersection reachable from an exact head tip back to the account's configured
coverage boundary.

Publication uses only a mutually consistent snapshot:

- repository visibility must have been verified;
- the canonical branch must be known;
- commit-to-PR discovery must be complete before ref ownership is considered;
- every projection-relevant desired head in the repository must have a matching
  complete generation; and
- effective PR membership and every owned commit's file ledger must be
  complete.

If a desired ref tip changes before its new generation is complete, direct and
branch units for that repository fail closed on the next projection refresh.
The new generation atomically replaces the previous membership; partial
membership is never published.

Public repository facts may remain public after an access change because
public visibility was verified independently. When every tracked inventory is
complete, private/internal visibility is accepted only if a current catalog
still grants access. While any tracked inventory is unavailable, the last
verified private fact is retained. An unverified repository is unknown and is
omitted.

Private repository identity, branch names, PR metadata, issue titles, commit
messages, filenames, diffs, facts, and summaries are never returned by the
public feed. Private work and private issues contribute only one generic day
presence.

## Projection and feed storage

`github_work_units` is the current materialized projection.
`github_work_unit_memberships` stores its ordered, one-owner membership. A
projection refresh loads durable evidence, computes the full current result,
and swaps changed units and memberships under one advisory lock and repeatable
read transaction. It reads compact file counters and generated evidence digests
for the full corpus, then hydrates raw patches only for the bounded summary
batch.

`github_public_feed_head` is a singleton containing:

- `feed_revision` for initial-page work-unit changes, newly inserted
  known-visible issues, or an accepted summary becoming visible, hidden, or
  replaced;
- `ordering_revision` for ordered-set and membership changes;
- `head_content_revision` for the lightweight status endpoint;
- `last_published_at`; and
- `summarizing`;
- an internal projection-request token; and
- the last completely evaluated semantic summary-policy digest.

Evidence writers replace the projection token in the same transaction as the
evidence change. A refresh clears only the token it observed and only after its
bounded summary-evaluation backlog is empty. A semantic policy change creates a
token until the current corpus has been reevaluated.

The public feed reads at most five UTC days per page in a read-only repeatable
read transaction. Pagination cursors are HMAC-signed and bound to the ordering
revision. An ordering change returns `409`, prompting a fresh first page.

Accepted summaries are read only when their recipe, outcome, input, and
attribution digests still match the current public unit. Stale attempts cannot
leak into a new projection.

## Outcome summaries

Summaries are optional prose for public work units. The summary input contains
only normalized public repository context and complete file/diff evidence. It
does not contain PR titles, PR bodies, commit messages, private evidence, or
provider event text.

The evidence shape depends on attribution:

- A tracked-authored PR whose complete membership is entirely eligible tracked
  work uses the PR's complete net diff.
- A PR containing collaborator work uses only the tracked author's owned commit
  diffs.
- Canonical-day work uses its ordered owned commit diffs.
- Branch work currently uses its ordered owned commit diffs because no branch
  comparison outcome is persisted.

An otherwise projected unit remains facts-only when its summary evidence has an
unavailable or binary patch, a counter mismatch, an incomplete or capped PR net
ledger, an empty normalized outcome, or excessive input. Commit-level
incomplete or capped ledgers are excluded at the eligibility boundary. There is
no generated fallback.

The provider is pinned to `gpt-5.4-nano-2026-03-17`, with reasoning disabled,
low text verbosity, provider storage disabled, no SDK retry, a 32,000-token
input cap, and a 160-token output cap. Output must be structured as one outcome
of at most two sentences, 60 words, and 320 Unicode code points. Validation
rejects invalid Unicode, control/bidirectional characters, URLs, HTML,
Markdown, and SHAs.

Summary identity includes the semantic policy, recipe, prompt, normalized
input, outcome digest, and attribution mode. Transport retries and storage
configuration do not invalidate prose. A five-minute debounce absorbs active
rewrites. Up to eight recent-first inputs are deterministically evaluated per
projection refresh, while the provider worker still starts at most one claim.
Valid public-input output remains cacheable if its input becomes stale while
the request runs; it is displayed only when the current public unit's exact
recipe, outcome, attribution, and summary-input keys match. A force push with
the same complete PR net outcome can therefore reuse accepted prose.

Claims are recent-first:

- recent means activity within the last 30 days;
- only when no recent claim is ready may one historical request start that UTC
  day;
- each attempt may start at most twice;
- at most 12 requests may start per UTC day and 120 per UTC month; and
- historical claims reserve two monthly requests for every remaining day in
  the month.

Started requests count even when they fail. A transient failure waits 15
minutes before its one possible retry. Invalid input/output and exhausted
attempts become facts-only. Superseded attempts that never started are removed;
a paid retryable attempt becomes a payload-free tombstone that retains its
request count. Its input is rebuilt and debounced only if the exact input becomes
current again. Expired leases are recovered by the next worker.

`OPENAI_API_KEY` is optional; without it the factual pipeline continues and no
summary claim is started. This is not an OpenAI free-tier design. At the
[model's documented price](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
of $0.20/M input tokens and $1.25/M output tokens, the hard monthly maximum is
`120 * (32,000 * $0.20/M + 160 * $1.25/M) = $0.792`.

## Intake and cadence

Three inputs converge on the same durable worker queues:

- `POST /api/github/webhook` verifies the HMAC and delivery ID, then stores
  supported push/head, pull-request, and opened-issue signals. It performs no
  GitHub fetch and no model call.
- Authenticated Events polling reads at most three 100-event pages per account,
  uses GitHub's ETag and poll interval, and commits evidence with its checkpoint.
- Head reconciliation walks each active account's current repository inventory
  in persisted batches of at most eight API pages and eight repositories per
  account. A complete inventory is refreshed daily; an incomplete or failed
  refresh may resume after 15 minutes, and explicit backfills may force it.

Supabase Cron invokes:

| Route                     | Schedule                              | Bound                                                                |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `/api/cron/github-sync`   | every 5 minutes                       | 15-second request                                                    |
| `/api/cron/github-worker` | every 5 minutes, offset by 2 minutes  | 60-second request; default eight items per factual queue and one ref |
| `/api/cron/github-refs`   | every 15 minutes, offset by 4 minutes | 15-second request; eight ref pages/repositories per account          |

The worker processes factual queues and current-ref repair before recomputing
the projection. It then reconciles the minimal summary status and may claim one
summary. Webhooks shorten discovery, but they do not render a page directly;
publication still waits for the bounded worker. Timeline payloads are read from
the current projection and are never held in a shared response cache.

## Historical backfill

The manual backfill accepts an inclusive UTC range of at most 31 days and a
cooperative processing budget of at most 30 minutes; the Action has a 35-minute
hard timeout. Broad runs must begin within the last 62 days; older runs require
a numeric repository ID.

The backfill:

1. verifies each requested token's immutable GitHub user ID;
2. loads each requested account's complete repository inventory;
3. lowers, but never raises, each requested account's ref coverage boundary;
4. performs one global repair pass over projection-relevant current heads;
5. enumerates PRs authored by each requested account that were updated since the lower
   bound, then keeps only PRs with a tracked-authored commit in the requested
   window;
6. drains only the scoped factual queues without projecting after every batch;
   and
7. refreshes the projection once when the scoped factual backlog reaches zero.

The command does not generate summaries and does not wait in process for a
durably deferred provider claim. It exits non-zero with a structured stop
reason when the deadline, provider retry, or remaining backlog prevents
completion. Re-running the same range is idempotent.

The current-ref ledger is complete only back to the earliest applied coverage
boundary. GitHub objects removed before any webhook, Event, PR scan, backfill,
or surviving current ref exposed them cannot be reconstructed.

## Known coverage boundary

A fresh ref baseline marks the canonical head projection-relevant without
expanding every pre-existing side head. Side-branch work becomes representable
when a later head creation or movement, a head webhook, or corresponding
push/Event plus current-ref evidence promotes that head; complete current PR
membership can represent the same authored work as a PR independently. An
unchanged pre-existing side branch with no surviving signal is not exhaustively
discovered on cold start.

Head webhooks are applied in delivery order; they are not an authoritative
ordering oracle. A delayed delivery can therefore leave a stale desired tip
until the bounded current-ref scan reads GitHub's present state. The ref route
runs every 15 minutes and is the authoritative reconciliation path; a heavily
paginated inventory can require more than one invocation.

## Minimal live state

The status endpoint returns the feed revision, a monotone head revision, last
feed publication time, and one boolean: whether the configured summary pipeline
has a current, recent public evaluation, queued input, retry, or provider lease
on the initial five-day page. The next worker reconciliation clears an expired
abandoned lease. The UI renders only:

- `Shaping the latest update` while that boolean is true;
- `Updated … ago` (or `Activity is up to date`) otherwise; or
- `Show latest work` when a newer feed revision is observed, changing to
  `Showing latest work…` only while that refresh is pending.

Polling runs while the tab is visible, the browser is online, no refresh is
pending, and the timeline is in view when the browser supports intersection
observation. A settled page checks every five minutes at most three times.
While shaping recent summary work, it checks every three minutes, subject to a total cap of 12
requests. The private, revalidated endpoint supports ETags; polling budgets
reset after a successful feed refresh. New content is never inserted while the
reader is moving through the page; the reader chooses `Show latest work` to
refresh.

## Verification and tests

`bun run github:verify --since <UTC> --until <UTC> [--repository <id|name>]`
builds a deterministic, read-only crosswalk for a half-open interval. It emits
stable IDs and counts for tracked candidates, eligible changes, integration
merges, ineligible changes, PR/canonical/branch units, owned changes, visibility
gaps, commit-enrichment backlog, authored PRs without a current owned member,
and each coverage or policy-exclusion reason. Any enrichment backlog fails the
crosswalk. `merged_pr_landing` and
`no_current_owner` are policy exclusions; unknown canonical branch, incomplete
head generation, incomplete PR coverage, and unknown visibility are coverage
gaps that fail the crosswalk.

The verifier reports the DB/projector crosswalk for already-ingested evidence.
It does not query GitHub and therefore cannot independently prove ingestion
completeness. Acceptance against real data must first run the relevant backfill
and then compare selected PRs, refs, and weeks/months with GitHub itself.

Behavioral tests cover these contracts rather than source strings or rendered
class names:

| Scenario                                                                | Expected behavior                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| merge, empty, or foreign-authored commit                                | no work-unit membership                               |
| effective PR also reachable from canonical/side refs                    | PR owns it once                                       |
| same-repository merged landing absent from effective PR membership      | canonical suppressed; active side head may own it     |
| PR rewrite with unchanged net outcome                                   | stable identity, anchor, and reusable prose           |
| changed PR/ref membership                                               | removed SHA loses its old ownership                   |
| ref head A → B → A                                                      | final A is projected rather than suppressed           |
| incomplete PR discovery, visibility, default branch, or head generation | fail closed with a reported reason                    |
| shared side-branch commit                                               | deterministic primary branch, one owner               |
| private or unknown repository                                           | generic private day or no output                      |
| replayed/out-of-order evidence                                          | identical projection                                  |
| concurrent projection/summary work                                      | leases and compare-and-swap prevent stale publication |
| same-day repository rows                                                | one header and a count derived from final groups      |
| summary budget/retry/expiry                                             | hard caps and facts-only terminal state               |
| nine pending summary evaluations                                        | eight settle, then one on the next refresh            |
| paid input A superseded by B then current again                         | count retained and debounce re-armed                  |

Run the complete local gate with:

```sh
bun run format:check
bun run typecheck
bun run lint
bun test
bun run build
```

PostgreSQL-backed projection, feed, summary-store, and migration tests require
Docker. Real-data verification is read-only; migration and backfill are
separate explicit operations.
