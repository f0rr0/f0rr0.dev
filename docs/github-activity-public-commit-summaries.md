# Public commit summaries

## Decision

Generate and persist public prose per canonical commit. Organize commits under
pull requests only when GitHub supplies deterministic membership; do not infer
work-item groups with an LLM. PR grouping changes the timeline projection, not
the unit sent to Nano or the identity of the stored source activity.

## Per-commit processing

```text
verified tracked-author commit
  -> fetch the repository and commit evidence exposed by the GitHub path
  -> read commit-wide and per-file additions/deletions from GitHub
  -> derive languages and substantive churn from the per-file counters
  -> discover GitHub PR membership and suppress exact-evidence integration copies
  -> one gpt-5-nano call producing both public summary lengths
  -> persist one revision-scoped attempt, both summaries, recipe/model/input
     hash, languages, and churn
  -> always show the headline; add short for higher-churn commits
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

Both variants describe the same central change. Every timeline item shows its
headline. The page also shows the short explanation above the procedural churn
threshold; a model does not decide presentation length. The initial boundary is
25 substantive additions plus deletions and remains an evaluated, configurable
product threshold. Generated output, lockfiles, vendored files, and binary
assets do not inflate that decision.

Languages are derived exclusively from changed filename extensions, ordered by
substantive changed lines, and stored separately from model prose. The model is
not asked to infer languages.

## Model context and output

The pipeline starts with the repository and commit evidence that the
authenticated GitHub fetch path returns. Repository evidence includes its
owner, full name, visibility, ownership relationship, description, homepage,
topics, and avatar URL. Commit evidence includes the complete commit message,
time, SHA, parents, aggregate statistics, every returned file's metadata, and
every patch string GitHub returns. A missing GitHub patch is represented as
unavailable.

The completed request is measured locally with Nano's model-specific tokenizer.
Ordinary requests through 240,000 input tokens keep all evidence unabridged in
the stable full-evidence structure. This is below [Nano's 400,000-token context
window](https://developers.openai.com/api/docs/models/gpt-5-nano) and leaves
160,000 tokens for framing, reasoning, and output; the summary call itself still
has no application-level output cap. A UTF-8 byte upper-bound lets ordinary
small requests bypass the lazily loaded tokenizer entirely. When the byte upper
bound has not already proved the whole request fits, inputs above a 4 MB
procedural safety bound or containing an unbroken serialized evidence line
above 64 KB skip the exact full-input tokenization probe and enter compaction.
This covers pathological patch, message, description, and path text; a large
ordinary multiline diff can still take the exact probe and remain whole.

Only an oversized request switches to deterministic procedural compaction:

1. Keep the full repository and commit metadata and a compact, complete ledger
   of every returned changed file, including status, counters, old path,
   evidence class, and whether GitHub supplied a patch.
2. Deduplicate byte-identical patch strings while retaining every associated
   file ID. Semantic diff parsing is bounded to 100,000 lines overall, 16 MB of
   patches overall, and 1 MB per patch. A patch outside those bounds receives a
   deterministic 1 KB head/tail excerpt with its exact original line count,
   byte count, and omitted-byte count; the manifest labels it as locally raw
   compacted and does not report it as parsed coverage or an upstream mismatch.
3. For patches inside the parsing bounds, remove unchanged unified-diff context
   while retaining patch metadata, every hunk header, every changed line, and
   an explicit skip marker at each context gap. When no patch needed raw
   compaction and that representation fits, nothing else is omitted.
4. If it remains oversized, create byte-bounded samples from contiguous edit
   blocks. A replacement keeps both its deletion and addition sides together.
   Giant individual lines keep deterministic head and tail evidence with the
   exact omitted-byte count. Beginning, end, and middle blocks are considered
   before denser samples, but selected evidence is rendered back in source
   order with explicit changed-line gaps.
5. Estimate each complete bounded sample with Nano's tokenizer. Stable
   module/file breadth feeds a token-weighted 6:2:1 allocation across product,
   tests/docs, and generated/vendor/lock/binary evidence. A sample that does
   not fit is skipped instead of blocking smaller later evidence. The whole
   constructed request is then counted exactly and tail samples are removed
   until it fits.
6. In the normal compact manifest, report GitHub aggregate changed lines;
   returned and represented files,
   unique patches, hunks, patch metadata, unique patch lines, and duplicate
   patch occurrences; upstream-missing patches; and per-file counter/patch
   mismatches. Locally raw-compacted patch/file counts and excerpt coverage are
   separate from those parsed counters.

If repository, commit, and complete-ledger metadata alone were ever to exceed
the budget, a separately rendered extreme manifest retains aggregate commit and
file facts, clips the commit message to the remaining token budget, and retains
the minimal repository identity when it fits. It otherwise explicitly omits
repository fields, paths, and patches; it never slices the constructed prompt
through JSON or section boundaries. Detailed raw/mismatch provenance is retained
when the extreme budget can hold it and otherwise yields to the minimal
aggregate manifest without claiming complete patch coverage.

The evidence classes affect budget share only; no class is unconditionally
filtered. A generated-only or tests-only commit therefore receives the
available budget. The prompt and compactor use no repository-specific mapping,
whitelist, or LLM pre-summary, and compaction adds no model call or retry.

GitHub's `files[].patch` is best-effort source evidence rather than a guaranteed
complete Git diff. The [commit endpoint](https://docs.github.com/en/rest/commits/commits#get-a-commit)
paginates file metadata up to 3,000 files, binary changes can lack patch text,
and GitHub warns that large raw diff or patch responses can fail. An exactly
3,000-file response is retained and marked as provider-cap-ambiguous instead of
being rejected. That flag is persisted; the page displays the file count as a
lower bound and labels file-derived language coverage as partial. The
compaction manifest distinguishes upstream unavailable or counter-mismatched
patches from evidence omitted locally. Raw patches and compaction intermediates
are not persisted.

The reducer follows Git's documented [zero-context diff
primitive](https://git-scm.com/docs/diff-context-options.html),
Gerrit's explicit [`skip` representation for omitted common
lines](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#diff-content),
and the useful part of [Aider's token-budgeted repo-map
design](https://aider.chat/docs/repomap.html): deterministic ranking followed by
budget fill. It does not use AST parsing, embeddings, an LLM pre-summary, or
OpenAI's [conversation compaction](https://developers.openai.com/api/docs/guides/compaction),
which manages multi-turn state rather than a single commit diff.

There is no content disclosure validator, privacy-term filter, word-count
rejection, response-length rejection, shape rejection, or display truncation.
Any response containing at least one non-whitespace character succeeds. When
both labels are recognizable, their values are stored separately. Otherwise,
the complete response is preserved as both variants, so unexpected formatting
does not discard model output. Every displayed stored variant is shown in full.
The deterministic final pass only adds missing Markdown
backticks to unmistakable code references and capitalizes the first headline
character; it does not remove text.

Only a source-fetch failure, model request or transport failure, or empty Nano
response fails processing. Such a failure is terminal for explicit operational
inspection and omitted from the public feed. The call is not retried inside or
after the request. Repository descriptions and other display facts are persisted
as repository snapshots; raw per-file and patch evidence is not.

The displayed additions and deletions are GitHub's commit-wide `stats` values.
The headline threshold and language weights use GitHub's per-file additions and
deletions so generated output, lockfiles, vendored files, and binary assets can
still be excluded procedurally. Missing or truncated patch text does not make
these counts partial. Patch text is used only as Nano evidence.

Both Nano outputs are persisted on the activity's revision-scoped summary
attempt, along with the exact model snapshot, prompt recipe, and input hash. The
page always uses the headline and conditionally adds the short value without
another model call. A failed attempt is terminal; an expired in-flight lease is
`indeterminate`, because its remote outcome may be unknown. Neither state is
automatically retried. PR title/body reconciliation does not create a new
summary revision.

## Timeline presentation

Completed rows appear in pages of complete UTC days: five days by default, with
a server maximum of 14. The opaque cursor carries the prior page's UTC-day
boundary and original snapshot timestamp, so an older page cannot include work
published after the first page. Pagination never splits one day across pages.

Canonical commits with the same primary GitHub PR and UTC day render as one PR
slice containing their individual headlines/disclosures. A PR spanning several
days produces one slice per day. The PR merge is a separate milestone. Daily
totals include repositories, additions, deletions, merged PRs, and opened
issues; proven aliases do not add duplicate churn.

Language logos use version-pinned Simple Icons SVGs from the npm distribution.
Repository owner avatars and durable repository/PR display facts come from the
stored GitHub snapshots, so rendering does not make GitHub API calls.

## Removed complexity

There is no semantic grouping prompt, candidate-window retrieval, provisional
work-item bucket, grouping digest, grouping eval, or group-level analysis pass.
GitHub's PR association and complete PR commit list are the only grouping
authority. Commits without that evidence stay standalone. Rebase, force-push,
merge, squash, and cherry-pick copies are hidden only under the exact-evidence
rules documented in [`github-commits.md`](./github-commits.md); ambiguous or
incomplete cases remain visible.
