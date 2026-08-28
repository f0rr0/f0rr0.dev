# Public commit summaries

## Decision

Publish activity per commit. Do not group commits into inferred work items and
do not run a grouping model. GitHub ingestion, tracked-author verification, and
the assimilated-event checkpoints remain unchanged.

## Per-commit processing

```text
verified tracked-author commit
  -> fetch the repository and commit evidence exposed by the GitHub path
  -> read commit-wide and per-file additions/deletions from GitHub
  -> derive languages and substantive churn from the per-file counters
  -> one gpt-5-nano call producing both public summary lengths
  -> persist both Nano summaries, recipe/model/input hash, languages, and churn
  -> show the headline for low-churn commits; otherwise show short
```

The model runs once per commit with no retry and `store: false`. The generic
prompt asks for two plain-text values in one response:

- `HEADLINE`: a compact, action-led headline containing the main outcome and
  enough natural project context to stand alone.
- `SHORT`: a concise explanation that states the same product result first and
  adds only useful context or technical detail.

Nano is asked to use inline Markdown backticks for exact code terms and no other
Markdown. A deterministic final pass formats unmistakable identifiers, HTTP
methods, flags, package names, calls, and common commands that Nano misses.

Both variants describe the same central change. The page selects between them
procedurally; a model does not decide presentation length. The initial low-churn
boundary is 25 substantive additions plus deletions and remains an evaluated,
configurable product threshold. Generated output, lockfiles, vendored files,
and binary assets do not inflate that decision.

Languages are derived exclusively from changed filename extensions, ordered by
substantive changed lines, and stored separately from model prose. The model is
not asked to infer languages.

## Model context and output

Nano receives all repository and commit evidence that the authenticated GitHub
fetch path returns and parses. Repository evidence includes its owner, full
name, visibility, ownership relationship, description, homepage, topics, and
avatar URL. Commit evidence includes the complete commit message, time, SHA,
parents, aggregate statistics, every returned file's metadata, and every patch
string GitHub returns. A missing GitHub patch is represented as unavailable.

This evidence is serialized without a local character budget, commit-message
cleaning, body truncation, path clipping, patch excerpts, or representative-file
selection. A complete file index precedes the full diffs. Generated and
supporting evidence appears before production evidence so a large generated
artifact cannot bury the delivered behavior; ordering never removes evidence.
GitHub can still omit patch text in its own response; the application does not
manufacture evidence in that case. The prompt is generic and infers a natural
product, project, or feature surface from the supplied evidence. There are no
repository-specific mappings, heuristics, whitelists, or allowlists.

There is no content disclosure validator, privacy-term filter, word-count
rejection, response-length rejection, shape rejection, or display truncation.
Any response containing at least one non-whitespace character succeeds. When
both labels are recognizable, their values are stored separately. Otherwise,
the complete response is preserved as both variants, so unexpected formatting
does not discard model output. Whichever stored variant the page selects is
shown in full. The deterministic final pass only adds missing Markdown
backticks to unmistakable code references and capitalizes the first headline
character; it does not remove text.

Only a source-fetch failure, model request or transport failure, or empty Nano
response fails processing. Such a failure is terminal for explicit operational
inspection and omitted from the public feed. The call is not retried inside or
after the request. Raw patches and repository descriptions are not persisted
because they can be fetched again from GitHub.

The displayed additions and deletions are GitHub's commit-wide `stats` values.
The headline threshold and language weights use GitHub's per-file additions and
deletions so generated output, lockfiles, vendored files, and binary assets can
still be excluded procedurally. Missing or truncated patch text does not make
these counts partial. Patch text is used only as Nano evidence.

Both Nano outputs are persisted in `summary_headline` and `summary_short` along
with their exact model snapshot, prompt recipe, and input hash. The page chooses
between the two stored values without another model call.

When a prompt recipe changes, `bun run github:refresh-summaries` makes one new
Nano attempt for each stale completed row. Successful outputs replace only the
stored summary fields; a failed one-shot attempt leaves the last valid summary
in place and is never retried automatically.

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
