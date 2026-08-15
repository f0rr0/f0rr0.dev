# Face-motion V13

V13 is a nine-pose compass set built from accepted **GPT Image 2** originals. Each `1254×1254` endpoint is a lossless WebP with a transparent background and a semantic filename (`center.webp`, `top-right.webp`, and so on).

Only border-connected magenta background removal and uniform canvas normalization were applied to the accepted generated portraits. The endpoints were not cropped, recentered, warped, interpolated, body locked, or blended.

The live graph currently has nine independently generated GPT Image 2 transition frames: three for top, two for left, one each for bottom, top-left, and top-right, and one for the right-to-bottom-right ring edge. Each was accepted only after visual and pose QA; failed or off-axis generations remain outside the runtime. The runtime reverses the same approved frame when travelling back across an edge, so motion stays symmetric.

The extreme left and right endpoints were corrected with GPT Image 2 to point horizontally at 9 and 3 o'clock. The right endpoint received a second GPT Image 2 pass to reduce its face/head scale while preserving its level 3 o'clock pose and full crown. `top-left.webp` and `top-right.webp` stayed byte-for-byte fixed and were supplied only as hair references for crown height, width, side fullness, texture, and identity. This keeps the tall swept crown continuous while leaving the diagonal endpoints and their upward head angles untouched.

The `right` to `bottom-right` midpoint was regenerated from the corrected right endpoint and the fixed bottom-right endpoint. A small uniform pre-key scale and canvas alignment places its outer bounds at the measured halfway position: the hair top advances 21 pixels from right to midpoint and 23 pixels from midpoint to bottom-right, while subject height changes 21 pixels and 23 pixels. This removes the apparent zoom/position pulse and keeps the transparent stage clean.

`portrait-neutral.webp` is a byte-for-byte copy of `center.webp`. The automated asset verifier checks all nine endpoints for inventory, manifest hashes, lossless VP8L encoding, exact `1254×1254` dimensions, decoded uniqueness, and center/poster parity.

- Runtime inventory: [`manifest.json`](manifest.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Immutable-endpoint validation: [`VALIDATION.md`](VALIDATION.md)
