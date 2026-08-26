# V12 immutable-endpoint validation

PASS: nine `1254×1254` lossless WebP endpoints were built directly from the
accepted GPT Image 2 magenta-background originals.

- No crop, recenter, resize, rotation, facial warp, body lock, optical flow,
  interpolation, or frame blending was performed.
- Alpha is derived from border-connected magenta only. RGB is byte-identical to
  the raw source for every fully opaque pixel.
- Chroma recovery is restricted to partially transparent silhouette pixels. It
  cannot touch opaque glasses, hair, skin, or clothing pixels.
- Every WebP decoded to alpha and visible RGBA exactly matching its keyed PNG
  master, and every file uses lossless VP8L encoding.

| endpoint     |              alpha bbox | opaque pixels | partial pixels | WebP bytes |
| ------------ | ----------------------: | ------------: | -------------: | ---------: |
| top-left     |  `[69, 98, 1191, 1254]` |       738,596 |          6,480 |    719,420 |
| top          | `[71, 111, 1194, 1254]` |       709,697 |          6,820 |    729,410 |
| top-right    |  `[72, 92, 1192, 1254]` |       739,480 |          6,687 |    729,288 |
| left         | `[70, 103, 1195, 1254]` |       730,914 |          6,698 |    762,100 |
| center       |  `[69, 99, 1196, 1254]` |       724,528 |          5,973 |    760,630 |
| right        |  `[70, 99, 1193, 1254]` |       726,237 |          6,135 |    731,546 |
| bottom-left  | `[74, 128, 1199, 1254]` |       732,368 |          6,483 |    725,340 |
| bottom       | `[69, 115, 1196, 1254]` |       724,959 |          5,686 |    719,452 |
| bottom-right | `[59, 145, 1182, 1254]` |       706,047 |          6,352 |    715,492 |

Visual inspection confirmed crisp lenses and metal rims without doubled or
vertically smeared eyewear, retained hair detail, visible authored up/down
movement, and the generated white crew-neck plus charcoal open overshirt in all
nine endpoints. The common canvas and authored framing are intentionally left
unaltered.

Run `bun run verify:face-motion` to recreate the machine-readable QA report and
contact sheet in `build/face-motion-qa/`.
