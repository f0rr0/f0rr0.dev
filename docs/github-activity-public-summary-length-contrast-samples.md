# Nano public-summary length contrast

This is a five-commit, provenance-verified, one-shot sample from the tracked
`f0rr0` account. Each commit received exactly one `gpt-5-nano-2025-08-07`
request with no retry. The model saw the commit title, cleaned body, changed
paths and statuses, and available diffs. Languages and substantive line counts
were derived procedurally.

Recipe: `public-commit-headline-expanded-short-v3`  
Prompt SHA-256: `81cf821fe806eef252d111881c1058200ed82879e28c38ac9ac33f37f6103ed3`

## 2 substantive lines

Commit: `e63b784c` — `fix(studio): avoid feedback prompt on landing`  
Derived language: TypeScript  
Selected display: headline

**Headline:** remove feedback prompt on landing

**Short:** Remove the `LatestStudioGenerationFeedback` component usage from
the studio client render path to avoid displaying the feedback prompt on
landing. This entails a small conditional removal in the component tree, while
keeping surrounding layout and providers intact. No other behavior or UI
elements are altered.

## 6 substantive lines

Commit: `6cc104bf` — `fix(seo): record IndexNow request metadata`  
Derived language: TypeScript  
Selected display: headline

**Headline:** record HTTP method and URL in metadata

**Short:** The change adds fields to track the HTTP method and target URL for
each request attempt, wiring them through fetch attempt descriptions and retry
options. It defaults the method to `GET` if missing and associates the request
URL with each attempt, including in batch submissions. This enables richer
observability of subsequent SEO IndexNow interactions.

## 81 substantive lines

Commit: `ed7ad9cf` — `fix(email): align traffic surge font families`  
Derived language: TypeScript  
Selected display: short

**Headline:** align fonts across email templates

**Short:** The patch introduces a shared fontFamilies constant and updates
multiple email styles to use it. It replaces hard-coded font stacks with
references to `fontFamilies.sansSerif` and `fontFamilies.monospace` in main,
monospace, and code-related styles. It also adds a test to verify the template
uses the shared font families and removes hard-coded font imports.

## 236 substantive lines

Commit: `e634abdd` — `fix(wasix): decode sealed concurrency contract`  
Derived languages: Python, Shell  
Selected display: short

**Headline:** decode sealed concurrency contract

**Short:** The commit updates validation paths for the sealed carrier workflow
by making atomic fence totals canonical, removing hard-coded per-profile
expectations, and validating totals via dynamic receipt data. It adds checks to
ensure `atomic_fence_total` matches a non-zero numeric pattern, updates
Python-based verification to rely on receipt-derived totals, and adjusts test
logic to account for immediate fence-lookalike scenarios and to validate packed
concurrency contracts without fixed mappings.

## 12,454 substantive lines — one-shot failure

Commit: `57e3c0ae` — `feat(wasix): add streaming tools and local servers (#149)`  
Derived languages: Rust, TypeScript, JavaScript, MDX, Shell, SQL

The transport succeeded, but the response violated the exact output contract
by returning two competing headline/short pairs. The parser rejected it and no
retry was attempted.

First pair:

**Headline:** add WASIX tools and local server support

**Short:** The commit adds an optional WASIX tools surface and a local server
endpoint across the WASIX TypeScript bindings. It introduces
`@oliphaunt/wasix-tools` with `pg_dump` and `psql` interfaces, tool-specific
wiring in the runtime and bindings, and a browser/Node/Bun/Deno server path for
a local endpoint. It also wires bounded protocol streaming paths, updates
protocol surfaces to include new stream variants, and adjusts docs and tests to
reflect the new capabilities. Inline tool wrappers and minimal integration
tests for the new tooling are included.

Second pair:

**Headline:** enable local server and tools plumbing

**Short:** Local server support is implemented via new server plumbing and a
server listen contract. The code adds server listen variants for TCP (ephemeral
or fixed port) and Unix sockets, updates server startup flow to allocate and
expose a loopback address or a socket path, and aligns the client APIs to
reference the new local endpoint model. It includes tests and fixtures for
server listen behavior and updates to the SDK surface to reflect the new server
capabilities.

The four accepted headlines were five, seven, five, and four words. The large
commit failure is retained as an evaluation case rather than silently repaired.
