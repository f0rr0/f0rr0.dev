# V13 endpoint validation

PASS: nine `1254×1254` lossless WebP endpoints were built from accepted GPT Image 2 magenta-background outputs; the final right is a new high-quality GPT Image 2 output generated from only the fixed top-right and bottom-right references.

- No crop, recenter, rotation, facial warp, body lock, optical flow, interpolation, or frame blending was performed.
- Alpha is derived from border-connected magenta only. The regenerated `1280×1280` side sources were uniformly normalized to the release's `1254×1254` canvas.
- Chroma recovery is restricted to partially transparent silhouette pixels. It cannot touch opaque glasses, hair, skin, or clothing pixels.
- Every WebP decoded to alpha and visible RGBA exactly matching its keyed PNG master, and every file uses lossless VP8L encoding.

| endpoint     |              alpha bbox | opaque pixels | partial pixels | WebP bytes |
| ------------ | ----------------------: | ------------: | -------------: | ---------: |
| top-left     |  `[69, 98, 1191, 1254]` |       738,596 |          6,480 |    719,420 |
| top          | `[71, 111, 1194, 1254]` |       709,697 |          6,820 |    729,410 |
| top-right    |  `[72, 92, 1192, 1254]` |       739,480 |          6,687 |    729,288 |
| left         | `[67, 109, 1194, 1254]` |       738,197 |         11,265 |    856,716 |
| center       |  `[69, 99, 1196, 1254]` |       724,528 |          5,973 |    760,630 |
| right        | `[77, 119, 1183, 1254]` |       725,001 |         13,881 |    805,248 |
| bottom-left  | `[74, 128, 1199, 1254]` |       732,368 |          6,483 |    725,340 |
| bottom       | `[69, 115, 1196, 1254]` |       724,959 |          5,686 |    719,452 |
| bottom-right | `[59, 145, 1182, 1254]` |       706,047 |          6,352 |    715,492 |

Visual inspection confirmed crisp lenses and metal rims without doubled or vertically smeared eyewear, clearly horizontal 9 and 3 o'clock side poses, full crown continuity from each untouched diagonal reference, visible authored up/down movement, and the white crew-neck plus charcoal open overshirt in all nine endpoints. The final right is a direct high-quality `gpt-image-2` output generated with exactly two ordered references: fixed top-right first and fixed bottom-right second. Its chest pocket remains screen-right, and its placket plus two visible buttons remain screen-left, matching both references without mirroring. The aligned `right` to `bottom-right` transition is a visible lossless `1254×1254` frame with alpha bounds `[63, 127, 1183, 1254]`, 713,076 opaque pixels, 14,115 partial pixels, and 775,896 bytes. Right, midpoint, and bottom-right widths are 1,106, 1,120, and 1,123 pixels, while their subject tops are 119, 127, and 145 pixels, with no opaque background or blank frame.

Run `bun run verify:face-motion` to recreate the machine-readable QA report and contact sheet in `build/face-motion-qa/`.
