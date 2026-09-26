# Reading layout system

The shared implementation is `src/app/article.css`. It uses Tailwind v4's existing
spacing unit and type sizes, with CSS Grid named tracks and `grid-cols-subgrid`.
DM Sans is the default sans and reading face; Instrument Serif supplies titles and section
headings. Geist Mono is reserved for code. The header, writing list, article,
and footer share one reading edge.

## What the theory supports

The objective is predictable relationships, legible text, and adaptable content.
It is not a claim that a particular pixel value is scientifically optimal.

- **Proximity and grouping:** related elements should be closer than unrelated
  groups. The perceptual basis is discussed in
  [Wagemans et al., _A Century of Gestalt Psychology in Visual Perception I_](https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/).
  Applying it here means more space before a section than between its heading and
  its first paragraph. The exact 48:12 relationship is our design choice.
- **Measure and reading behavior:** line length, leading, font metrics, and reading
  task interact. [Dyson and Kipping's screen-reading study](https://journals.uc.edu/index.php/vl/article/view/5671)
  reports different outcomes for reading speed and subjective preference.
  A comfortable measure is a calibrated constraint, not a universal optimum.
- **Adaptability:** [WCAG visual presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
  discusses constrained line length, leading, and user adjustment. Its AAA
  criterion does not prescribe one mandatory default stylesheet.
  [WCAG text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
  requires surviving user overrides; it is not a recommendation to set every
  paragraph to those override values by default.
- **Implementation consistency:** Tailwind's `--spacing` is 0.25rem. Using that
  module reduces independent decisions. Four pixels is an engineering convention,
  not a perceptual law. See [Tailwind's custom-style guidance](https://tailwindcss.com/docs/adding-custom-styles).

## Horizontal grid

| Role                  | Constraint                                         | Reason                                                                         |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Reading column        | `--spacing(156)` = 39rem / 624px                   | Shared with homepage body text, navigation, and footer                         |
| Media                 | Reading column + two `--spacing(40)` wings = 944px | Gives images, tables, and diagrams room without widening prose                 |
| Outer inset           | `clamp(1rem, 4vw, 1.5rem)`                         | Preserves a usable edge on small screens, then caps the gutter                 |
| Annotation            | `--spacing(56)` = 224px                            | Secondary reading column using 14/20 type                                      |
| Annotation separation | `--spacing(8)` = 32px                              | Separates notes from prose without making them unrelated                       |
| Portrait image        | At most `--spacing(80)` = 320px                    | Preserves the intended size of phone screenshots                               |
| Portrait pair         | Reading column, 24px internal gap                  | Uses the same reading edges; stacks when two useful image widths no longer fit |

The shared width remains 39rem. Body text inherits the site's 16px/24px default;
articles do not set a separate reading size. Line length varies with the text and
font metrics, so recheck actual paragraphs when changing the measure or font.

The two media wings shrink first. Once they reach zero, prose and media shrink
together inside the outer insets. The reading column stays centered with or
without notes. Browser scrollbars consume their normal share of viewport width.

Sidenotes become available when the **article container** reaches 75rem. The fit
is 39rem prose + two sets of 14rem note + 2rem gap + 1.5rem inset, rounded up from
74rem. The AI action stays in the footer until 92rem, where a separate outer
control area fits beyond both text and notes. The thresholds describe content
capacity rather than device categories.

## Type roles

All sizes are rem-based. Line heights are unitless and scale with user font
settings. Pixel equivalents below assume a 16px root.

| Role                                | Tailwind size               | Leading | Face / weight             |
| ----------------------------------- | --------------------------- | ------- | ------------------------- |
| Article title                       | `text-3xl`, 30px            | 36px    | Instrument Serif, 400     |
| Site section / article h2           | `text-2xl`, 24px            | 32px    | Instrument Serif, 400     |
| Subsection, h3                      | `text-lg`, 18px             | 28px    | DM Sans, 500              |
| h4                                  | `text-base`, 16px           | 24px    | DM Sans, 600              |
| h5                                  | `text-base`, 16px           | 24px    | DM Sans, 500              |
| h6                                  | `text-base`, 16px           | 24px    | DM Sans italic, 500       |
| Homepage / article body             | inherited `text-base`, 16px | 24px    | DM Sans, 400              |
| Table / expanded disclosure         | `text-base`, 16px           | 24px    | DM Sans, 400              |
| Caption / note / disclosure summary | `text-sm`, 14px             | 20px    | DM Sans, 400; summary 500 |
| Code                                | `text-sm`, 14px             | 24px    | Geist Mono, 400           |
| Toolbar label                       | `text-xs`, 12px             | 20px    | DM Sans, 400              |

Articles share the homepage body size and section-heading scale. Only the article
title adds a larger step. Deep headings use weight and italic style at body size
rather than introducing more sizes. These roles stay the same on narrow screens.

Headings use `text-balance` to even out short multiline titles. Captions, notes,
and disclosure summaries use `text-pretty` to improve their final lines. Long-form
paragraphs retain normal wrapping and a ragged edge. Code preserves whitespace;
its toolbars use normal wrapping. These are browser-native enhancements, with
normal wrapping as the fallback. See [Tailwind text wrapping](https://tailwindcss.com/docs/text-wrap).
Inline links retain the site's wavy underline without gaining an unrelated bold
weight. Real normal and italic DM Sans faces are loaded. Code stays at the loaded
normal mono weight rather than synthesizing a heavier face.

## Vertical relationships

The block owning the new content owns its preceding space. There is no global
row gap combined with inherited margins. Build-time block metadata identifies the
content role and the previous role; CSS applies the following small rule set.

| Transition                              | Space                                  |
| --------------------------------------- | -------------------------------------- |
| Paragraph → paragraph / ordinary block  | 24px                                   |
| Paragraph → list                        | 12px                                   |
| Any heading → its content               | 12px                                   |
| Heading → another heading               | 16px                                   |
| Ordinary content → h2                   | 48px                                   |
| Ordinary content → h3 or h4             | 32px                                   |
| Ordinary content → h5 or h6             | 24px                                   |
| Into / out of media                     | 32px; heading rules take precedence    |
| Image → its caption                     | 12px                                   |
| List item → list item / nested list     | 8px                                    |
| Paragraphs inside a quote or disclosure | 16px                                   |
| Adjacent disclosures                    | 8px, plus each summary's 44px hit area |
| Main content → endnotes                 | 48px, then 24px inside the separator   |
| Paragraphs within a note                | 12px                                   |
| Note → next note                        | 16px                                   |

The first block has no artificial preceding space. Lists do not contribute
stray first/last item margins. Nested quotes use one 16px indentation step.
These are spacing relationships on a four-pixel module, not a rigid baseline
lattice: image aspect ratios, text wrapping, borders, and reader overrides are
allowed to determine natural height.

## Content behavior

Standard top-level Markdown images, linked images, image figures, tables, code
blocks, and Mermaid diagrams use the wider tracks automatically. Images retain their natural
aspect ratio and are not enlarged beyond their intrinsic width. Captions return
to the reading measure. Fenced code, highlighted code figures, and GitHub excerpts share the media
tracks and retain native keyboard scrolling for long lines. Code nested in a
list or disclosure stays inside that parent. Wide code blocks also stop a
sidenote span, so annotations cannot overlap their frame.

```mdx
<figure>

![Describe the useful detail](./illustration.webp)

  <figcaption>A caption attached to its image.</figcaption>
</figure>
```

Use `article-screenshot` for a single phone capture and `article-screenshot-grid`
for a pair. The optional top-level `article-wide` class also works for custom
compositions. Nested content stays within the space of its parent.

Native `<details>` and `<summary>` provide progressive disclosure. Summaries
have a 44px minimum hit area, a visible triangle, and a keyboard focus indicator.
Animated walkthroughs sit inside disclosures that can be closed. Failed Mermaid
diagrams expose their authored source in a native disclosure.

Tables use natural word wrapping rather than breaking column names into
syllables. If their intrinsic columns do not fit, the named table region scrolls
by keyboard. Full GitHub source paths wrap in their toolbar. Toolbars and their control groups
wrap when enlarged text or narrow containers need more room. Read-only GFM task
checkboxes receive names from their item text.

Use GFM `[^note]` syntax for annotations. The build transform preserves IDs,
numbering, repeated references, paragraphs, and backlinks. Notes with the same
reference block share a margin list and its spacing metadata. Each list spans
following prose rows, stopping before the next note group or wide block. Its
intrinsic height reserves room; a long note cannot overlap the next wide image.
Very long notes can add vertical space, so disclosures suit extended explanations.

Narrow screens and print retain the same single copy of each note as endnotes.
References inside disclosures or wide figures stay endnotes at every width.
Standard DOM reading order remains prose followed by linked notes; placement
requires no client-side measurement or positioning.

The three archived music charts were authored with light labels on transparent
backgrounds. Their `article-chart` surface supplies the dark background they need
in both themes. Other images retain their own artwork and the shared subtle outline.

## Verification

Use `/writing/kitchen-sink` in development for the complete element vocabulary.
The audit record is [Article visual audit](article-visual-audit.md). Check real
posts too, including older Markdown, linked figures, long code, and large tables.

Run:

```sh
bun run lint
bun run build
bun test tests/article-grid.test.tsx tests/mdx-image.test.ts tests/mdx-code-block.test.tsx tests/remark-embed-github.test.ts
```

The transform check includes image promotion, linked figures, semantic flow,
named tables and task checkboxes, grouped notes, repeated backlinks, and disclosure
fallback notes. Visual checks remain necessary for hierarchy, grouping, media
scale, and wrapping. Do not infer those qualities from a passing unit test.
