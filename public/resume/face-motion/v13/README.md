# Face-motion V13

V13 is a nine-pose compass set built from accepted **GPT Image 2** originals. Each `1254×1254` endpoint is a lossless WebP with a transparent background and a semantic filename (`center.webp`, `top-right.webp`, and so on). The final right endpoint starts from an exact horizontal mirror of the accepted left endpoint and uses a tightly masked GPT Image 2 edit for small, natural asymmetries.

Only border-connected magenta background removal and uniform canvas normalization were applied to the accepted generated portraits. The endpoints were not facially warped, interpolated, body locked, or blended.

The live graph currently has nine independently generated GPT Image 2 transition frames: three for top, two for left, one each for bottom, top-left, and top-right, and one for the right-to-bottom-right ring edge. Each was accepted only after visual and pose QA; failed or off-axis generations remain outside the runtime. The runtime reverses the same approved frame when travelling back across an edge, so motion stays symmetric.

The extreme left and right endpoints point horizontally at 9 and 3 o'clock. The final right endpoint is a direct masked `gpt-image-2` high-quality edit of an exact horizontal mirror of `left.webp`. The mirrored silhouette, face/head scale, shoulders, torso, collar, pose, and crop provide the spatial lock; the editable mask exposes only interior crown texture, lens reflections, collar/fold details, and the pocket region. GPT Image 2 adds restrained asymmetry and restores the pocket to screen-right without recreating or reframing the subject. `top-left.webp` and `top-right.webp` stayed byte-for-byte fixed; `top-right.webp` was supplied only as a supporting hair-texture reference, while `center.webp` and `bottom-right.webp` supported identity, wardrobe, lens, and pocket details. The diagonal endpoints and their angles remain untouched.

The accepted `right` to `bottom-right` GPT Image 2 midpoint received one final uniform alignment for the mirrored endpoint. Subject width now progresses 1,124, 1,120, and 1,123 pixels, while the subject top advances 108, 127, and 145 pixels. This removes the prior zoom/body pulse and keeps the transparent stage clean.

`portrait-neutral.webp` is a byte-for-byte copy of `center.webp`. The automated asset verifier checks all nine endpoints for inventory, manifest hashes, lossless VP8L encoding, exact `1254×1254` dimensions, decoded uniqueness, and center/poster parity.

- Runtime inventory: [`manifest.json`](manifest.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Immutable-endpoint validation: [`VALIDATION.md`](VALIDATION.md)
