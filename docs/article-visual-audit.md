# Article visual audit

Reviewed on 2026-09-24 against fetched `origin/next` at `19ce04e`. The work covers
the complete reading experience: the shared page frame, article title and
metadata, every supported MDX element, annotations, media, disclosures, and the
return to the writing index and footer. Findings below have been implemented.

## Scope and evidence

The stack is Next.js 16, React 19, Tailwind v4, MDX, the existing Base UI controls,
and native HTML. Repository instructions and `BLOG.md` informed the review;
the resulting authoring and design contract is [Reading layout system](article-layout.md).
The interface, accessibility, layout, writing, typography, color, and UI skills
were used together. No new dependency or client-side layout engine was added.

The rendered comparison included [Lee's agents article](https://leerob.com/agents)
and [AI article](https://leerob.com/ai), the deployed ZeroClaw article, and the
local implementation. Measurements below are CSS pixels at a 16px root; they
describe those rendered pages, not universal requirements.

| Dimension       | Lee's observed treatment                             | Original site                                 | Implemented system                                                      |
| --------------- | ---------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| Reading measure | About 600px at desktop                               | 672px desktop; 704px at an intermediate width | 624px maximum, shared with navigation, index, and footer                |
| Body            | Iowan Old Style, 17/27.2                             | Geist, 16/24, weight 300                      | Geist, 18/28, weight 400                                                |
| Title / section | 30/33 title; 23.2/32.48 section                      | Title and section both 24px Instrument Serif  | 36px title; 30px section; deliberate mobile leading                     |
| Media           | Up to about 1100px                                   | Same narrow measure as prose                  | Up to 944px, automatically selected by content type                     |
| Notes           | 240px, 13/18.2 sans, 32px separation                 | Endnotes                                      | 224px, 14/20, 32px separation when the container can fit them           |
| Disclosure      | Plain native summary, about 13/20.8                  | No unified article treatment                  | Native summary, 14/20, minimum 44px target, compact related rows        |
| Vertical flow   | Generous section breaks and quieter internal spacing | Independent prose and component margins       | One owner per gap, selected by the relationship between adjacent blocks |

Lee's useful ideas are the separation of reading and media widths, the quieter
secondary typography, the restrained disclosure treatment, and the use of the
margin as supporting space. His exact font metrics and dimensions are not the
basis for this implementation. The existing Geist / Instrument Serif identity
and wavy links remain recognizable.

### Coverage

| Domain        | Evidence inspected                                                                                                                                                            | Result                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Accessibility | Browser accessibility tree; keyboard controls, note links, scroll regions, 320px reflow, 200% browser zoom and text resizing, user text-spacing overrides, chart contrast     | Findings resolved; assistive-technology limits below           |
| Layout        | All 16 MDX routes at 1440px and 320px; the kitchen sink across 10 widths; full ZeroClaw and kitchen-sink visual traversal; representative sections in the rest of the archive | Shared grid and flow corrected                                 |
| Writing       | Article metadata, captions, disclosure labels, source-path labels, diagram failure message, index titles, archived link paragraphs                                            | Structural and interface copy corrected; essay prose preserved |
| Typography    | Rendered heading levels, long titles, prose, emphasis, inline code, notes, captions, lists, quotes, tables, code and toolbars                                                 | Explicit role hierarchy and shared leading established         |
| Color         | Light/dark text, muted labels, code tokens, controls, image outlines, archived SVG charts                                                                                     | Contrast failures corrected without a new palette              |
| UI            | Toolbar density, disclosure affordances, focus appearance, image frames, mobile floating action, native scrolling, menu and popover behavior                                  | Shared controls and media treatment made consistent            |

The 16 routes were: both music reviews, cursor-following portrait, GPU Postal,
ZeroClaw, Veera, Messenger, JSONB media search, React Native, lead-finding agent,
queue/matchmaker, Koa/Webpack, kitchen sink, Tranquilo, OneCent, and the revived
website. The kitchen sink is a development fixture; the other 15 are real posts.

The shared frame was also inspected on Home, Writing, Work, Tokens, and Journey.
Home and Writing received desktop/mobile visual checks. Work and Tokens were
available locally only in their data-unavailable states. Journey received a
desktop visual and narrow-width geometry check. This is a complete article-flow
audit with shared-shell regression checks, not an audit of every live dashboard
interaction or every sentence in the archive.

## Findings and implemented corrections

Severity describes the original impact. All rows are resolved in this work.
Locations refer to the final implementation; “Before” records observations from
the original site or the partial implementation encountered during this audit.

| Severity | Domain        | Location                                                                                                                                                                                                              | Before                                                                                                                                                                                 | After                                                                                                                                                                                           | Why                                                                                                 |
| -------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| HIGH     | Layout        | `src/components/ask-ai-widget.tsx:32`; `src/components/site-header.tsx:47`; `src/components/copy-email-button.tsx:45`                                                                                                 | The fixed AI action covered mobile reading space. Enlarged text pushed header controls and the footer email past the narrow viewport, and clipped diagram controls inside their frame. | AI action uses the footer until a separate outer control area fits. Header and toolbars wrap; email and footer navigation can shrink and wrap.                                                  | Content and controls must remain reachable when space or reader settings change.                    |
| HIGH     | Color         | `src/app/article.css:289`; `src/content/blog/2018-music-in-review/page.mdx:12`                                                                                                                                        | Light chart labels on transparent SVGs had approximately 1.37:1 contrast against the light page.                                                                                       | The three charts receive their intended dark surface; label contrast is approximately 12.56:1.                                                                                                  | Widening an unreadable chart does not make its information accessible.                              |
| HIGH     | UI            | `src/content/blog/kickback-with-koa-webpack/page.mdx:115` and `:445`                                                                                                                                                  | Archived animated walkthroughs ran inline without a stopping affordance.                                                                                                               | Native closed disclosures require reader initiation and can be closed to stop viewing the animation.                                                                                            | Readers need control over moving explanatory content.                                               |
| HIGH     | Writing       | `src/components/mdx/Mermaid.tsx:442`                                                                                                                                                                                  | A diagram render failure ended at an error message.                                                                                                                                    | The failure explains that the diagram could not render and offers “View diagram source” with accessible scrolling.                                                                              | A failure needs a usable recovery path to the information.                                          |
| MEDIUM   | Layout        | `src/app/article.css:63`; `src/lib/rehype-article-grid.mjs:50`                                                                                                                                                        | Margin stacking produced a 56px Markdown-image gap versus 32px for a figure, 32px heading-to-list space, and 48px between consecutive heading levels.                                  | Build-time block roles drive one preceding margin: 24px ordinary flow, 12px heading-to-content, 16px consecutive headings, 32px media, 48px section breaks. Nested spacing is reset separately. | Proximity must describe the content relationship, independent of Markdown syntax.                   |
| MEDIUM   | Layout        | `src/app/article.css:8` and `:22`; `src/lib/rehype-article-grid.mjs:83`                                                                                                                                               | Reading edges drifted between header and body. Wide figures required selected manual classes; linked image figures were missed.                                                        | Shared 624px reading edge; named wide tracks; automatic plain, Markdown, linked-image and figure handling. Phone pairs retain the reading measure.                                              | A grid must explain the whole page and continue to work for new content.                            |
| MEDIUM   | Typography    | `src/app/article.css:44`; `src/app/layout.tsx:18`                                                                                                                                                                     | Serif headings were weak relative to sans subsections; several deep levels were indistinguishable; type and leading varied by component.                                               | Titles, sections, subsections, body, secondary text, code and controls have explicit roles. Normal and italic Geist faces are loaded. Title remains larger than sections on mobile.             | Hierarchy depends on optical font differences as well as nominal size.                              |
| MEDIUM   | Layout        | `src/lib/rehype-article-grid.mjs:147`; `src/app/article.css:418` and `:440`                                                                                                                                           | Notes needed treatment for paired references, repeated references, long content, nearby wide media, closed disclosures, and print.                                                     | One DOM copy, grouped at the first visible reference; grid spans reserve height before another note group or wide image; narrow screens and print use endnotes.                                 | An annotation should remain connected to its reference without collision or duplicate content.      |
| MEDIUM   | Typography    | `src/app/article.css:293` and `:316`                                                                                                                                                                                  | Table labels broke into fragments; code and diagram toolbars used competing font sizes, leading and spacing.                                                                           | Natural table wrapping and keyboard overflow; 14/24 code; 12/20 toolbar labels; shared targets and padding; long source paths wrap.                                                             | Dense technical content needs internal consistency and an explicit overflow behavior.               |
| MEDIUM   | Accessibility | `src/lib/rehype-article-grid.mjs:50`; `src/components/mdx/Mermaid.tsx:479`; `src/lib/remark-embed-github.mjs:362`                                                                                                     | Read-only task checkboxes lacked names. Some control names omitted their visible wording.                                                                                              | Task names derive from item text; zoom reset includes the displayed percentage; GitHub cards use visible link text as their accessible name.                                                    | Native and assistive representations should identify the same content and action.                   |
| MEDIUM   | Writing       | `src/content/blog/2016-music-in-review/page.mdx:16`; `src/content/blog/how-we-built-our-react-native-app/page.mdx:29`; `src/content/blog/kickback-with-koa-webpack/page.mdx:16`; `src/components/writing-list.tsx:66` | Older posts skipped section levels, caption-like prose was detached from images, artist links ran into descriptions, and index titles truncated.                                       | Correct h2 structure, native figcaptions, separate link paragraphs, and fully wrapping index titles.                                                                                            | A visual system requires useful document structure and complete labels.                             |
| LOW      | UI            | `src/app/article.css:265`                                                                                                                                                                                             | Disclosure spacing and decoration had no consistent relationship to prose, headings or adjacent disclosures.                                                                           | Plain native triangle; 14/20 summary; 44px target; visible focus; 8px between related disclosures and 12px before their expanded content.                                                       | Progressive disclosure should remain easy to discover without competing with the article hierarchy. |

## Verification

### Rendered layout

- All 16 article routes at **1440px and 320px**: no page-level horizontal
  overflow. This includes classic scrollbars, which reduce the available width.
- Kitchen-sink geometry at **320, 390, 640, 768, 1024, 1199, 1200, 1440, 1472,
  and 1920px**: prose stays within its measure; wings shrink first; annotations
  change placement at the capacity boundary; no note collisions.
- **Actual 200% Chrome page zoom** at a 1440px browser size: 720 CSS-pixel
  viewport, device-pixel ratio 2, endnotes, no page overflow. This was browser
  zoom, not a screenshot scale transform.
- **200% root text size** at 320, 390, 768, and 1024px: header, footer and toolbar failures
  found and corrected; rechecked at the narrowest width after the final fix,
  including controls clipped by an ancestor rather than page-level overflow.
- **WCAG text-spacing override** at 390px: 1.5 line height, 0.12em letter
  spacing, 0.16em word spacing, and 2em paragraph spacing; no page overflow.
- **RTL geometry**: logical insets move the note column to the other side
  without page overflow. This is a layout check, not a translated-content audit.
- **Print media and PDF generation**: grid becomes a centered block layout,
  notes return to a 624px endnote column, closed disclosure contents become
  printable, and interaction controls are hidden. A PDF was generated; every
  pagination boundary was not manually inspected.

### Content and interaction

- Visually traversed the entire kitchen sink on desktop and mobile: heading
  levels, lists and nested lists, task lists, quotes, inline code, fenced code,
  plain and highlighted code, native disclosures, images, captions, phone pairs,
  GitHub previews and fallbacks, tables, diagrams, dates, and notes.
- Visually traversed ZeroClaw and inspected representative media and text
  sections in the remaining real articles. Confirmed all six image figures in
  the portrait article now use the wide tracks, including linked figures.
- Keyboard Enter opens and closes native summaries with visible focus.
- Keyboard Enter follows a footnote and its return link; the target lands
  approximately 32px below the viewport top and focus returns to the reference.
- ArrowRight scrolls a focused code region (observed 40px movement) and the GPU
  Postal table at 320px (34px available and traversed).
- The mobile AI picker opens within the viewport, Escape closes it, and focus
  returns to “Ask an AI”. No external assistant action was submitted.
- Light/dark text pairs checked: body approximately **9.93:1 / 12.74:1**;
  muted text approximately **5.84:1 / 7.49:1**. Code tokens and controls were
  inspected in the rendered fixture as well as in source.
- Lighthouse snapshot: **100 accessibility** on the mobile kitchen sink after
  the naming fixes; the home snapshot also scored 100. This is an automated
  check, not proof of complete WCAG conformance.

### Repository checks

```sh
bun run lint
bun run build
bun test tests/article-grid.test.tsx tests/mdx-image.test.ts tests/mdx-code-block.test.tsx tests/remark-embed-github.test.ts
```

The focused checks pass: **9 tests, 61 assertions**. They cover the build-time
transform's structure, grouped and repeated notes, linked figures, accessible
names, image dimensions, code regions, and GitHub embeds. Lint passes with no warnings or errors. The production build passes, including
TypeScript checking and generation of all 38 static pages. GitHub returned some 403 responses during local
builds; the existing graceful link-card fallbacks were exercised.

### Not verified

VoiceOver/NVDA reading order and announcements, Safari/Firefox rendering, every
print page break, all live Work/Tokens dashboard data states, and exhaustive
localization. These are coverage limits rather than claimed passes. The design
uses native semantics and single-copy footnotes to keep these paths simple.

## Verdict

**Approve for the inspected article flow.** The recorded findings are resolved.
The shared system now governs the complete element vocabulary and its
transitions. The design rationale, calibration assumptions, authoring rules,
and responsive behavior are documented in [Reading layout system](article-layout.md).

## Follow-up: wrapping and code width

The article title and heading levels already used `text-balance`. Captions,
footnote paragraphs and disclosure summaries now use `text-pretty`; long-form
paragraphs and control labels retain normal wrapping. Code keeps its authored
whitespace. Browser behavior and fallbacks follow [Tailwind's text-wrap guidance](https://tailwindcss.com/docs/text-wrap).

Top-level fenced code, syntax-highlighted code figures, raw preformatted blocks,
and GitHub code excerpts now use the same wide columns as images. Nested code
stays in its parent. The grid transform recognizes code before reserving note
spans, so a preceding sidenote cannot extend into a wide code block. The focused
transform check includes highlighted, plain, GitHub, and nested code, plus a note
immediately before wide code. Rendered checks confirmed 944px code blocks at a
1440px viewport and 288px blocks at 320px, with no page overflow. At 200% root
text size, code controls remained inside their frames.

The metadata row was deliberately simplified in the initial redesign: horizontal
borders removed, the vertical separator replaced with a dot, date/read-time type
increased from 12px to 14px, and wrapping allowed. Its title separation is 12px.
The Markdown action and the date/read-time values were preserved.
