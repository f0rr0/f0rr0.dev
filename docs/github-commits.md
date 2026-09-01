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
5. evaluates summary inputs in recent-first batches of eight, then claims at
   most one eligible public summary. Valid public-input output can be cached
   after becoming stale; display still requires exact current recipe, outcome,
   attribution, and input digests.

Multi-parent merge commits and commits with neither file facts nor churn are not
separate timeline work. A same-repository merged-PR association suppresses
canonical ownership only when the commit is absent from effective PR
membership; a complete side head can still own it. The system does not infer
aliases from messages, timestamps, patches, or fingerprints.

## Projection and publication

`github_work_units` is the current materialized projection. Stable public
identity is derived from the PR node ID, repository plus UTC day for canonical
work, or persisted branch lineage. Every included repository/SHA belongs to
exactly one current work unit.

Known-private work contributes only the approved generic private-day presence.
Unknown work contributes nothing. Private titles, messages, paths, branch
names, repository identity, and generated prose are neither rendered nor sent
to the model.

Summary attempts are keyed by the current outcome, attribution mode, recipe, and
summary-input digest. Facts publish independently of optional prose. A force
push recomputes current PR membership and net outcome; an unchanged exact input
can reuse accepted prose. A superseded unstarted input is removed. A paid
retryable input drops its payload but retains its request count; the exact input
is rebuilt and debounced if it becomes current later. Daily and monthly request
caps count started requests, including retries.

Opened issues remain durable authored milestones outside the work-unit summary
pipeline. A newly inserted issue with known visibility transactionally advances
the public feed head; replayed deliveries and unknown visibility do not.

The public reader groups a repository once per UTC day and reads complete days
against the current ordered-set revision. `github_public_feed_head` contains
the monotone feed/content/order revisions, last publication time, a durable
projection-request token, the applied semantic summary-policy digest, and
whether configured recent initial-page summary work is being evaluated, queued,
retried, or processed. Evidence writers set the token transactionally;
projection clears the observed token only after its bounded summary-evaluation
backlog reaches zero.

## Runtime configuration

Required server-side values are:

```dotenv
DATABASE_URL=postgresql://...
GITHUB_F0RR0_TOKEN=github_pat_...
GITHUB_YUPPIESTECHDEV_TOKEN=github_pat_...
GITHUB_WEBHOOK_SECRET=<random secret>
CRON_SECRET=<random secret>
GITHUB_ACTIVITY_CURSOR_SECRET=<independent random secret>
```

`OPENAI_API_KEY` is optional. Without it, factual work units continue to
publish and summary claims remain untouched. `DATABASE_URL_UNPOOLED` is the
optional direct/session-pooler override used by migrations and Supabase Cron
configuration. `GITHUB_TOKEN` is an optional additional read token. Secrets and
private evidence stay server-side.

Routine entry points are:

- `POST /api/github/webhook`
- `POST /api/cron/github-sync`
- `POST /api/cron/github-refs`
- `POST /api/cron/github-worker`
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
