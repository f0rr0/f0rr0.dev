# V13 endpoint validation

PASS: nine `1254×1254` lossless WebP endpoints were built from accepted GPT Image 2 magenta-background outputs; the final right is a new high-quality GPT Image 2 output generated from only the fixed top-right and bottom-right references, with level pitch and their shared moderate three-quarter yaw.

- No rotation, facial warp, body lock, optical flow, interpolation, or frame blending was performed.
- Alpha is derived from border-connected magenta only. The regenerated `1280×1280` side sources were uniformly normalized to the release's `1254×1254` canvas. The accepted right then received only a rigid 12-pixel-left and 5-pixel-down canvas translation, with no rescaling.
- Chroma recovery is restricted to partially transparent silhouette pixels. It cannot touch opaque glasses, hair, skin, or clothing pixels.
- Every WebP decoded to alpha and visible RGBA exactly matching its keyed PNG master, and every file uses lossless VP8L encoding.

| endpoint     |              alpha bbox | opaque pixels | partial pixels | WebP bytes |
| ------------ | ----------------------: | ------------: | -------------: | ---------: |
| top-left     |  `[69, 98, 1191, 1254]` |       738,596 |          6,480 |    719,420 |
| top          | `[71, 111, 1194, 1254]` |       709,697 |          6,820 |    729,410 |
| top-right    |  `[72, 92, 1192, 1254]` |       739,480 |          6,687 |    729,288 |
| left         | `[67, 109, 1194, 1254]` |       738,197 |         11,265 |    856,716 |
| center       |  `[69, 99, 1196, 1254]` |       724,528 |          5,973 |    760,630 |
| right        | `[71, 119, 1186, 1254]` |       721,456 |          9,973 |    811,934 |
| bottom-left  | `[74, 128, 1199, 1254]` |       732,368 |          6,483 |    725,340 |
| bottom       | `[69, 115, 1196, 1254]` |       724,959 |          5,686 |    719,452 |
| bottom-right | `[59, 145, 1182, 1254]` |       706,047 |          6,352 |    715,492 |

Visual inspection confirmed crisp lenses and metal rims without doubled or vertically smeared eyewear, a level moderate three-quarter right endpoint that does not read as bottom-right or as a 90-degree profile, full crown continuity from each untouched diagonal reference, visible authored up/down movement, and the white crew-neck plus charcoal open overshirt in all nine endpoints. The final right is a direct high-quality `gpt-image-2` output generated with exactly two ordered references: fixed top-right first and fixed bottom-right second. The accepted left was used only for visual yaw comparison after generation and was never sent to the Image API. Its chest pocket remains screen-right, and its placket plus two visible buttons remain screen-left, matching both references without mirroring. The aligned `right` to `bottom-right` transition is a visible lossless `1254×1254` frame with alpha bounds `[63, 127, 1183, 1254]`, 713,076 opaque pixels, 14,115 partial pixels, and 775,896 bytes. Right, midpoint, and bottom-right widths are 1,115, 1,120, and 1,123 pixels, while their subject tops are 119, 127, and 145 pixels, with no opaque background or blank frame.

A production-build browser audit observed the exact `right → transition-right-bottom-right-1 → bottom-right` sequence at 40 ms intervals. Every displayed source was already decoded at `1254×1254`, image opacity remained `1`, visibility remained `visible`, and zero blank or incomplete samples occurred.

Run `bun run verify:face-motion` to recreate the machine-readable QA report and contact sheet in `build/face-motion-qa/`.
