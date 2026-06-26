# Typst Resume Design Research

Generated on 2026-06-26.

## Problem

The first custom Typst layout is technically correct but visually weak. It proves the pipeline, not the design. The next version should feel intentionally designed: better type, clearer rhythm, more refined hierarchy, and cleaner handling of dense senior-level experience.

## Best Resources

### 1. RenderCV Themes

- Site: https://rendercv.com/
- GitHub: https://github.com/rendercv/rendercv
- Typst package: https://typst.app/universe/package/rendercv/
- Signals: 16k+ GitHub stars, active 2026, Typst-backed, many tested themes.

Why it matters:

- Best baseline for serious engineering resumes.
- Themes worth inspecting: `engineeringresumes`, `classic`, `sb2nov`, `moderncv`, `harvard`, `ink`, `opal`, `ember`.
- The strongest thing to borrow is not surface styling, but spacing, entry alignment, validation, and theme-switching discipline.

Use for Sid:

- Use RenderCV's themes as a quality bar and spacing reference.
- If a custom Typst template remains hard to tune, build a RenderCV YAML version and compare generated PDFs directly.

### 2. modern-cv

- Typst Universe: https://typst.app/universe/package/modern-cv/
- GitHub: https://github.com/ptsouchlos/modern-cv
- Signals: 588 stars, updated 2026-06-12, release 0.10.0 in Apr 2026.

Why it matters:

- Port of Awesome-CV, which has a strong polished visual language.
- Uses Roboto, Source Sans Pro/Source Sans 3 style typography, and FontAwesome.
- Has resume and cover-letter templates.

Risks:

- Icon-heavy contact rows can be less ATS-safe.
- Awesome-CV aesthetics can feel overused if copied too closely.

Use for Sid:

- Borrow title/header treatment, section title color, and date/location alignment.
- Avoid profile pictures, heavy icons, and too much color.

### 3. neat-cv

- Typst Universe: https://typst.app/universe/package/neat-cv/
- GitHub: https://github.com/dialvarezs/neat-cv
- Signals: v1.2.0 released 2026-06-24, active as of 2026-06-26.

Why it matters:

- More polished than our current output.
- Provides full sidebar, thin decorative sidebar, and full-width layouts.
- Uses Fira Sans / Noto Sans / Roboto defaults.
- Includes flexible contact/social patterns, pills, skill levels, and cover-letter support.

Risks:

- Sidebar, icons, pills, and level bars can hurt ATS clarity and waste space for a senior engineer resume.

Use for Sid:

- Borrow full-width layout ideas, Fira Sans style, subtle accent system, and entry spacing.
- Do not use sidebars or skill bars in the primary application PDF.

### 4. typographic-resume

- Typst Universe: https://typst.app/universe/package/typographic-resume/
- GitHub: https://github.com/tsnobip/typst-typographic-resume
- Signals: small repo, but visually interesting.

Why it matters:

- Best typography reference among the found Typst resume packages.
- Uses Libre Baskerville, Roboto, and Montserrat.
- Designed around typographic contrast rather than plain engineering density.

Risks:

- Two-column/aside patterns are not ideal for the primary ATS PDF.
- Serif body typography can become fragile at small resume sizes.

Use for Sid:

- Borrow the idea of typographic contrast: a more distinctive name/title header and better section-title proportions.
- Consider a serif accent only for the name, not for body copy.

### 5. brilliant-cv

- Typst Universe: https://typst.app/universe/package/brilliant-cv/
- GitHub: https://github.com/yunanwg/brilliant-CV
- Signals: 801 stars, v4.0.1, active 2026.

Why it matters:

- Mature, feature-rich Typst CV system.
- Profile-based variants, multi-language support, layout tests, and ATS/AI-friendly positioning.
- More of a CV framework than a one-off template.

Risks:

- Might be too framework-heavy for this repo.
- We do not need keyword-injection or multi-profile features yet.

Use for Sid:

- Borrow architecture ideas: profile variants, layout testing, and stable content/data separation.
- Not the first template to copy visually.

### 6. basic-resume / simple-technical-resume / Jake's Resume

- basic-resume: https://typst.app/universe/package/basic-resume/
- simple-technical-resume: https://typst.app/universe/package/simple-technical-resume/
- Jake's Resume: https://github.com/jakegut/resume
- Pragmatic Engineer template: https://blog.pragmaticengineer.com/the-pragmatic-engineers-resume-template/

Why it matters:

- These are not beautiful in the editorial sense, but they are strong structure references.
- They optimize for ATS parsing, density, reverse chronology, and familiar engineering resume expectations.

Risks:

- Too student/new-grad-coded unless adapted.
- Too dense for Sid's founder/staff/AI-lead positioning if copied directly.

Use for Sid:

- Borrow single-column structure and ATS-safe section ordering.
- Do not copy the exact new-grad/FAANG template look.

## Typography Direction

The current `Liberation Sans` is safe but bland. Better options:

1. **Source Sans 3**
   - Source: https://fonts.google.com/specimen/Source+Sans+3
   - Strong default for a senior technical resume.
   - Clean, professional, great for body copy and compact layouts.

2. **Fira Sans**
   - Source: https://fonts.google.com/specimen/Fira+Sans
   - Used by neat-cv.
   - Slightly more humanist and distinctive than Source Sans.

3. **IBM Plex Sans**
   - Source: https://fonts.google.com/specimen/IBM+Plex+Sans
   - Good for AI/product/staff-engineering identity.
   - Distinctive without being decorative.

4. **Libre Baskerville + Roboto/Montserrat**
   - Source: https://typst.app/universe/package/typographic-resume/
   - Best for an editorial/portfolio version, not the main ATS PDF.

Recommendation:

- Primary PDF: Source Sans 3 or IBM Plex Sans.
- Name/title accent: keep same family with heavier weight, or use IBM Plex Sans Condensed if available.
- Avoid tiny caps, heavy letter spacing, and all-caps body labels except section headings.

## Design Direction for Sid

Recommended visual strategy:

- Single-column, ATS-safe PDF.
- No cards, badges, icons, sidebars, skill bars, photo, or timeline dots.
- Stronger type scale: name, role title, section labels, company/title rows, bullets.
- Use one accent color, likely deep teal, blue-black, or ink-blue.
- Add more deliberate whitespace between sections, but keep role blocks dense.
- Use a `Selected Impact` block that visually stands apart without becoming a card.
- Make Yuppies client projects easier to scan by using bold client labels and compact wrapped bullets.
- Put dates in a consistent right-aligned column for role headers.

Implementation options:

1. **Custom Typst v2**
   - Best control.
   - Use Source Sans 3 or IBM Plex Sans.
   - Redesign header and role blocks based on RenderCV + modern-cv.

2. **RenderCV comparison pass**
   - Build the same content in RenderCV YAML and generate `engineeringresumes`, `classic`, `moderncv`, `ink`, and `opal`.
   - Use the best output as direct inspiration or canonical output.

3. **modern-cv fork/import**
   - Fastest path to a prettier Typst-native PDF.
   - Risk: adapting Sid's complex Yuppies section may fight the template.

## Recommended Next Step

Do not continue tweaking the current layout incrementally. Build a second design pass:

- Create `career/typst/sid-jain-resume-v2.typ`.
- Add local fonts under `career/typst/fonts/` or document system font requirements.
- Try Source Sans 3 and IBM Plex Sans.
- Use a RenderCV-inspired entry layout with better type scale and spacing.
- Generate PNG previews and compare against RenderCV/modern-cv/neat-cv examples.
- Keep the current PDF only as a pipeline proof.
