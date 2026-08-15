# Face-motion V13

V13 is a nine-pose compass set built from accepted **GPT Image 2** originals. Each `1254×1254` endpoint is a lossless WebP with a transparent background and a semantic filename (`center.webp`, `top-right.webp`, and so on). The final right endpoint is generated from only the fixed `top-right.webp` and `bottom-right.webp` portraits.

Only border-connected magenta background removal and uniform canvas normalization were applied to the accepted generated portraits. The endpoints were not facially warped, interpolated, body locked, or blended.

The live graph currently has nine independently generated GPT Image 2 transition frames: three for top, two for left, one each for bottom, top-left, and top-right, and one for the right-to-bottom-right ring edge. Each was accepted only after visual and pose QA; failed or off-axis generations remain outside the runtime. The runtime reverses the same approved frame when travelling back across an edge, so motion stays symmetric.

The extreme left and right endpoints point horizontally at 9 and 3 o'clock. The final right endpoint is a direct high-quality `gpt-image-2` output synthesized at the exact pose midpoint between the fixed top-right and bottom-right images. Those are its only two references and have equal authority for identity, face/head scale, camera distance, hair, shoulders, torso, collar, clothing construction, lighting, placement, and crop. The prompt explicitly preserves the construction shared by both diagonals: the chest pocket stays on screen-right and the visible placket and two buttons stay on screen-left. No mirrored-left asset, center portrait, mask, or additional identity reference is used. The diagonal endpoints remain byte-for-byte untouched.

The accepted `right` to `bottom-right` GPT Image 2 midpoint remains in place. Subject width progresses 1,106, 1,120, and 1,123 pixels across right, midpoint, and bottom-right, with subject tops at 119, 127, and 145 pixels. This keeps the body scale close across the edge and the transparent stage clean.

`portrait-neutral.webp` is a byte-for-byte copy of `center.webp`. The automated asset verifier checks all nine endpoints for inventory, manifest hashes, lossless VP8L encoding, exact `1254×1254` dimensions, decoded uniqueness, and center/poster parity.

- Runtime inventory: [`manifest.json`](manifest.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Immutable-endpoint validation: [`VALIDATION.md`](VALIDATION.md)
