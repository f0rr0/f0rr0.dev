# Image production and placement

Read the relevant section when making or integrating assets. Measurements below are **house defaults** unless explicitly attributed to a platform. Recheck changing provider requirements before a platform-specific delivery.


Use **GPT Image 2** (`gpt-image-2`) for generated illustration layers. The bundled CLI requires dimensions divisible by 16, so 1200 × 630 and 1200 × 627 below are **finished export sizes**, not valid direct generation requests. Generate a supported master such as 1536 × 1024 (or 2048 × 1152 for a wider composition), then fit the selected art into the exact social canvas through the native image/composition workflow. Preserve proportions and inspect the crop. Verify current tool constraints before generation.

## Canvases and exports

| Use | Starting export | Treatment |
| --- | --- | --- |
| Inline conceptual scene | 1536 × 1024, 3:2 | Good room for one scene at the site's reading width; natural-height display |
| Wide opening illustration | 1600 × 900, 16:9 | Optional; use only if a wide composition improves the story |
| Diagram | SVG/Mermaid, ratio dictated by content | Readable labels matter more than filling a standard canvas |
| Screenshot | Native crop, enough pixels for about 2× rendered width where available | No invented resolution, stretching, or forced landscape crop |
| Shared Open Graph image | 1200 × 630, approximately 1.905:1 | Opaque PNG for linework/text or JPEG for photographic art |
| Platform-specific alternate | Only when the destination requires or testing justifies it | 1200 × 627 for an exact LinkedIn brief; 1200 × 600 is a useful optional 2:1 crop test, not a verified current X requirement |
| Discover-oriented representative art | 1600 × 900, 16:9 | Relevant text-light scene; distinct from an obligatory title card |

The source export and displayed CSS width are different measurements. These illustration masters cover about twice the largest current article width. Reuse the existing image optimizer for responsive delivery instead of authoring many identical resolution variants. If a generator cannot produce an exact final size, request a compatible composition and verify its actual output; never claim the prompt guarantees pixel dimensions. Use the available tool's supported editing/export path and current image-tool instructions for resizing or recomposition. Never stretch to fit.

For inline raster delivery, prefer the existing Next image pipeline; keep PNG when sharp lines or transparency need it, JPEG for photographs, and WebP/AVIF when the project's optimization path supports them. Social files should be actual PNG/JPEG bytes, with matching MIME type and extension; they bypass the inline optimizer. Flatten social transparency onto the intended background and use sRGB when the export tool supports colour profiles. Keep originals/editable sources separate from delivery files, and preserve provenance metadata when available.

House transfer targets: roughly 100–300 KB for an ordinary inline scene and under 500 KB for a social card, allowing more when visible quality warrants it. These are performance budgets, not platform limits or reasons to destroy small text. Measure the served inline resource as well as the source file. LinkedIn documents a 5 MB maximum and a 1200 × 627 minimum for its sharing module, with a 1.91:1 recommended ratio. [LinkedIn sharing guidance](https://www.linkedin.com/help/linkedin/answer/a521928/making-your-website-shareable-on-linkedin).

## Social safe areas: source pixels, not CSS margins

Keep the existing **82 px horizontal / 72 px vertical** inset for 1200 × 630 cards. This leaves a main content box at **x = 82…1118, y = 72…558**, measuring **1036 × 486**. Background colour and nonessential texture can reach the edges. Keep essential text and objects inside the content box. Scale these values proportionally for a larger master.

This is a house layout inherited from `src/lib/blog-share-image.tsx`, not a platform-certified safe zone. No one rectangle guarantees every thumbnail, app version, or crop. In particular:

| Centre-crop simulation from 1200 × 630 | What remains |
| --- | --- |
| 1200 × 627, approximately 1.91:1 | About 1.5 px lost at top and bottom |
| 1200 × 600, 2:1 | 15 px lost at top and bottom |
| 1120 × 630, 16:9 | 40 px lost from each side |
| 630 × 630, 1:1 | Only x = 285…915 remains |

For useful square-thumbnail recognition, put the principal object inside that central square, preferably x = 325…875 with some breathing room. Don't promise a full wide headline survives a square crop. If the destination requires square art, make a deliberate square composition instead of compressing the entire landscape card into the centre.

There is no general desktop/mobile `og:image` media-query mechanism. Ship one robust social image and inspect platform previews; `<picture>` only affects the article page. Optional platform-specific metadata is separate from viewport-specific art direction. OG width and height describe the source; they don't control how a feed crops it. [Open Graph structured properties](https://ogp.me/#structured).

Preview a full card at **600 × 315** and **360 × 189**, then examine the square focal crop at a small thumbnail size. These are deliberate QA view sizes, not promises about social feed dimensions. Use actual destination previews when accessible.

## Typography and art composition

Use representative artwork that reads through its subject and action. Lettering should be exceptional and earned; do not add words merely to repeat the surrounding prose. Preserve lively scenes and meaningful supporting elements; simplify details that become noise at the final size. The existing title card remains a useful fallback. If adding a title, start with its existing 64 px bold text and 1.12 line height. At 360 px preview width that is about 19.2 px. Keep the headline roughly 60–72 px where practical; reflow or use an author-acceptable shorter card headline before making it tiny. Preserve the actual article title in metadata. Aim for two or three lines, then inspect the actual font and title rather than using a character-count rule.

The existing 25 px author/domain and 22 px footer become about 7.5 px and 6.6 px at that preview width. Treat them as optional recognition details, not the only way to understand the card. Omit optional metadata in a new illustrated composition when it crowds the title or subject. Don't place important text over busy artwork.

For an illustrated card with typography, define both bounding boxes before generation and reserve the text area in the art brief. If the full headline and subject can't both be large enough, use a text-free scene or the existing title-only fallback. Don't bake the article title into the generated art and then overlay it a second time.

Use deterministic text layout through the existing `ImageResponse` stack when requested. It supports a subset of CSS; do not assume page styles, CSS Grid, or browser fonts carry over. Current documentation lists TTF/OTF/WOFF font support and a 500 KB bundle limit; that bundle limit is separate from the output-file budget. The site's page fonts are WOFF2, so don't pass them blindly into a new card renderer. Reuse the working font treatment or inspect compatible local fonts if a change is needed. [ImageResponse documentation](https://nextjs.org/docs/app/api-reference/functions/image-response).

## Article geometry and markup

At `origin/next` commit `50db6fb`, `SiteMain` is at most 768 CSS px including padding. Content width is viewport minus 32 px below 640, viewport minus 64 px from 640–767, 704 px from 768–1023, and 672 px at 1024 and above. At a 390 px phone width the figure is 358 px wide. **Retest after layout changes.**

The current default `MDXImage.sizes` approximates this as 672 px from 768 upward and viewport minus 32 below. Don't copy that approximation into bespoke crops as an exact layout measurement. If an accurate per-image value is needed, the current full-width geometry is:

```text
(min-width: 1024px) 672px, (min-width: 768px) 704px, (min-width: 640px) calc(100vw - 64px), calc(100vw - 32px)
```

Use existing figures. `ArticleProse` supplies 28 px vertical figure spacing, a 10 px caption gap, and 13 px captions. Images inside figures have no extra vertical margin; plain images receive their own 28 px margins. Don't bake those outer page margins, rounded corners, or frame borders into artwork. Internal illustration breathing room is separate from CSS spacing. Avoid spacer paragraphs and extra wrappers just to reproduce these defaults.

```mdx
<figure>
  <Image
    src="./backwards-packet.png"
    alt="A packet travels from the broker back toward the client, reversing the expected direction."
  />
  <figcaption>The unexpected direction was the useful clue.</figcaption>
</figure>
```

This is an example, not an asset that already exists. Co-located images are converted to static imports and normally supply their dimensions. The `.article-screenshot` class limits phone captures to 320 CSS px; `.article-screenshot-grid` stacks below 640 px and uses two columns above it. Prefer these existing treatments where appropriate, and measure the slot before overriding `sizes`. The screenshot grid is capped at 672 px with a 24 px gap, so each two-column slot is at most 320 px after its own cap.

Use `height: auto`/the existing natural-ratio behaviour. Avoid `object-fit: cover` for explanatory content. If the whole relationship disappears at mobile width, simplify or split the diagram, or add a readable close-up; don't merely increase raster resolution. A meaningful diagram label should read at roughly 14–16 CSS px in its intended view. A 16 px label in a 1536 px master becomes less than 4 px on a phone. Native text or vector diagrams avoid that trap.

## Accessibility and loading

Write alt text for the meaning in context; captions tell readers what to notice. Decorative art can use `alt=""`. A complex figure needs a concise alternative plus the full explanation or data in adjacent text, not a paragraph of tiny labels hidden only in pixels. Include `accTitle` and `accDescr` for Mermaid. [WAI image guidance](https://www.w3.org/WAI/tutorials/images/).

For essential text use at least 4.5:1 contrast, with the WCAG large-text exception where it actually applies at rendered size; don't assume a large source font stays large after scaling. Meaningful graphical boundaries need 3:1 contrast against adjacent colours where required. Labels/shapes must carry distinctions in addition to hue. These constraints concern information-bearing content, not every decorative wash. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Reserve image dimensions to avoid layout shifts. Keep below-fold art lazy-loaded. If a newly inserted hero becomes the likely LCP image, make its loading appropriate to that placement and inspect the rendered attributes. In this repository, the wrapper currently passes `priority` to Next Image but handles `loading` differently on its fallback `<img>` path; don't assume `loading="eager"` reaches both. Don't prioritize every image. [LCP guidance](https://web.dev/articles/optimize-lcp).

## Repository social routing and verification

Before integrating a custom card, inspect:

- `src/lib/blog-share-image.tsx`: text-only cream/amber fallback, 1200 × 630.
- `src/lib/blog-metadata-images.ts` and `src/lib/blog-utils.tsx`: asset discovery and responses. Co-located `opengraph-image.*`/`twitter-image.*` can be static assets or image modules. Each kind falls back to the other custom kind, then the title card.
- `src/app/(blog)/blog/[slug]/share-image/route.ts`: requests the Open Graph kind.
- `src/app/(blog)/blog/[slug]/page.tsx`: explicitly declares the share-image URL for both social fields and BlogPosting's image.
- The adjacent `opengraph-image.tsx` and `twitter-image.tsx` routes: also generate file-based metadata. Resolve their interaction by examining final HTML; don't assume adding `twitter-image.png` alone selects it everywhere. Framework metadata precedence and version changes make source filenames insufficient evidence. [Next metadata documentation](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

Keep only runtime article modules and supported assets in `src/content/blog`. Its broad dynamic imports can pick up co-located Markdown notes as unsupported modules. Do not persist transient image-production notes elsewhere in the repository either.

Keep one custom 1200 × 630 image by default. Do not invent `metadata.hero`, `metadata.ogImage`, or an artwork prop on the fallback renderer. A custom static file is the smallest existing override for finished art. A requested deterministic illustrated card may use the existing co-located image-module convention; reuse the renderer's treatment without redesigning all articles.

For a produced card, fetch the image URL actually present in rendered metadata and verify successful status, image MIME type, bytes, dimensions, and crop. Check useful `og:image:alt` and Twitter alt where supported; the current code often supplies the title, which may need a targeted metadata change for a meaningful illustration. Metadata dimensions, when supplied, must match the bytes. Check both raw HTML and browser output, including duplicate tags and the actual winning URL.

Production images must be publicly fetchable without login, cookies, expiring signatures, or bot challenges. Local success cannot prove a social crawler can fetch a deployment. Keep preview `noindex` policy and canonical production identity. The static asset response currently advertises a year of immutable caching at the share route; replacing bytes at the same URL may leave stale previews. Verify cache behaviour and use an appropriate changed image URL/version or platform recrawl when replacing a published card. Merely renaming its co-located file does not necessarily change the public share URL.

For search imagery, prefer a representative text-light image. Discover guidance specifies at least 1200 px width, over 300,000 pixels, a considered 16:9 crop, and `max-image-preview:large` (or AMP). A title card does not guarantee Discover eligibility or selection. The current BlogPosting and social image share one URL; selecting a different search image requires an intentional metadata change, not just exporting another file. [Google Discover](https://developers.google.com/search/docs/appearance/google-discover), [Google image guidance](https://developers.google.com/search/docs/appearance/google-images).

## Finish checks

For actual asset work, inspect 320, 390, 768, and 1440 px viewports, light and dark themes, plus the social previews above. Check meaningful label size, subject crop, image load, captions, no horizontal page overflow, and visual family resemblance. Read captions and surrounding prose once to catch duplicated explanation or an image that spoils the narrative beat.

Run the relevant existing checks when changing MDX, metadata, or image components. This snapshot has `tests/mdx-image.test.ts`, `tests/blog-share-image.test.ts`, and `tests/site-seo.test.ts`; use the project's current commands. The repository's `build` script also runs production database/cron setup, so don't invoke it solely to inspect an illustration. For a documentation-only skill change, validate the skill and links; no application build is needed. Report local, deployed, and platform-preview verification separately, leaving unavailable checks explicit.
