# Face-motion V12

V12 is a nine-pose compass set built from accepted **GPT Image 2** originals.
Each `1254×1254` endpoint is a lossless WebP with a transparent background and
a semantic filename (`center.webp`, `top-right.webp`, and so on).

Only border-connected magenta background removal was applied to the accepted
generated portraits. The endpoints were not cropped, recentered, warped,
interpolated, body locked, or blended.

The live graph currently has nine independently generated GPT Image 2
transition frames: three for top, two for left, one each for bottom, top-left,
and top-right, and one for the right-to-bottom-right ring edge. Each
was accepted only after visual and pose QA; failed or off-axis generations
remain outside the runtime. The runtime reverses the same approved frame when
travelling back across an edge, so motion stays symmetric.

The extreme left and right endpoints use GPT Image 2 hair corrections derived
from the neighboring diagonal poses. Only registered GPT-authored crown pixels
outside each immutable original silhouette are imported; the face, glasses,
ears, clothes, crop, scale, and pose remain the original endpoint pixels. This
restores consistent crown height without the scale, roll, or rear-hair drift
found during visual QA of the rejected full-frame edits.

`portrait-neutral.webp` is a byte-for-byte copy of `center.webp`. The automated
asset verifier checks all nine endpoints for inventory, manifest hashes,
lossless VP8L encoding, exact `1254×1254` dimensions, decoded uniqueness, and
center/poster parity.

- Runtime inventory: [`manifest.json`](manifest.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Immutable-endpoint validation: [`VALIDATION.md`](VALIDATION.md)
