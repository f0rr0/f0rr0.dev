# Face-motion V13

V13 is a nine-pose compass set built from accepted **GPT Image 2** originals. Each `1254×1254` endpoint is a lossless WebP with a transparent background and a semantic filename (`center.webp`, `top-right.webp`, and so on).

Only border-connected magenta background removal and uniform canvas normalization were applied to the accepted generated portraits. The endpoints were not cropped, recentered, warped, interpolated, body locked, or blended.

The live graph currently has nine independently generated GPT Image 2 transition frames: three for top, two for left, one each for bottom, top-left, and top-right, and one for the right-to-bottom-right ring edge. Each was accepted only after visual and pose QA; failed or off-axis generations remain outside the runtime. The runtime reverses the same approved frame when travelling back across an edge, so motion stays symmetric.

The extreme left and right endpoints were regenerated with GPT Image 2 from their clean V12 side sources. `top-left.webp` and `top-right.webp` were supplied as the authoritative hair and identity references, while the clean side sources remained authoritative for pose, scale, crop, shoulders, and gaze. This keeps the tall swept crown consistent without copying the diagonal endpoints' upward head angle.

The `right` to `bottom-right` midpoint was rebuilt from its clean magenta GPT Image 2 source so the runtime no longer uses the previously exported frame that could reveal the portrait-stage background for one tick.

`portrait-neutral.webp` is a byte-for-byte copy of `center.webp`. The automated asset verifier checks all nine endpoints for inventory, manifest hashes, lossless VP8L encoding, exact `1254×1254` dimensions, decoded uniqueness, and center/poster parity.

- Runtime inventory: [`manifest.json`](manifest.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Immutable-endpoint validation: [`VALIDATION.md`](VALIDATION.md)
