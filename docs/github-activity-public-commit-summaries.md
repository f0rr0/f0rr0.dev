# Public commit summaries

## Decision

Publish activity per commit. Do not group commits into inferred work items and
do not run a grouping model. GitHub ingestion, tracked-author verification, and
the assimilated-event checkpoints remain unchanged.

## Per-commit processing

```text
verified tracked-author commit
  -> fetch title, cleaned body, changed filenames/statuses, and available diffs
  -> count additions/deletions directly from available unified patches
  -> derive languages and substantive churn in application code
  -> one gpt-5-nano call producing both public summary lengths
  -> persist the summaries, recipe/model/input hash, languages, and churn
  -> show the headline for low-churn commits; otherwise show short
```

The model runs once per commit with no retry and `store: false`. It returns two
plain-text values in one response:

- `HEADLINE`: a three- to nine-word, action-led technical headline containing
  only the main outcome, with no preamble or trailing period.
- `SHORT`: for substantive commits, a compact two- or three-sentence paragraph,
  usually 45–80 words, with supported implementation detail and any substantive
  secondary change. Tiny commits remain shorter rather than receiving filler.

Both values contain inline Markdown. Code-shaped references such as symbols,
commands, methods, configuration keys, and code literals use backticks; bold is
available sparingly for scanability. The output contains no headings, lists,
blockquotes, or links.

Both variants describe the same central change. The page selects between them
procedurally; a model does not decide presentation length. The initial low-churn
boundary is 25 substantive additions plus deletions and remains an evaluated,
configurable product threshold. Generated output, lockfiles, vendored files,
and binary assets do not inflate that decision.

Languages are derived exclusively from changed filename extensions, ordered by
substantive changed lines, and stored separately from model prose. The model is
not asked to infer languages.

## Public-output boundary

The input excludes repository and organization identity but includes the commit
title, cleaned body, changed paths/statuses, and all patch text GitHub makes
available. The public result may name supported engineering concepts and
well-known tools or frameworks. It must not expose repository or organization
names, exact paths, secrets, private URLs, customer data, or internal issue IDs.

Normal commits include every available patch. Exceptionally large commits use a
deterministic 180,000-character input budget containing a broad file inventory
and excerpts from the largest substantive files. This keeps the single call
inside the model context while explicitly telling it not to claim complete
coverage.

An invalid, empty, or failed one-shot result is marked as a terminal failed
attempt for explicit operational inspection and omitted from the public feed.
It is not retried inside or after the request. Raw patches are not persisted
because the source can be fetched again from GitHub.

Patch additions and deletions are parsed from actual `+` and `-` lines while
excluding unified-diff file headers. GitHub's aggregate counters are not used.
When GitHub omits a non-binary patch, the visible count is stored and displayed
as partial rather than replaced with an unrelated aggregate.

## Timeline presentation

Completed rows appear in UTC date sections with an 18-item keyset-paginated
first page. The page uses a random public UUID as its tie-breaker and exposes no
source identifier in the cursor. Loading another page merges commits back into
an existing day when a page boundary falls within that day.

Language logos use version-pinned Simple Icons SVGs from the npm distribution.
Repository owner avatars come from GitHub. Public repositories keep their
basename and commit link; directly owned private repositories keep only the
basename; private third-party repositories expose neither.

## Removed complexity

There is no PR/non-PR grouping distinction, candidate retrieval, work-item
membership decision, provisional regrouping, grouping digest, grouping eval, or
group-level analysis pass. PR metadata may still be displayed when available,
but it does not change summary membership.
