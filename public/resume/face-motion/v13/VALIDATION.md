# V13 validation

PASS: nine accepted `1254×1254` lossless endpoints remain unchanged, all 16 canonical edges have exactly three authored `240×240` lossy-alpha transition cells, and the browser atlas contains the expected 57 unique frame keys.

## Deterministic checks

`bun run verify:face-motion` passes 17 release checks covering:

- exact endpoint, transition, poster, and atlas inventory;
- immutable endpoint manifest hashes and the approved decoded center hash;
- nine unique visible lossless endpoints at `1254×1254`;
- 48 visible lossy-alpha transition cells at `240×240` with contiguous 1-based numbering;
- byte-for-byte neutral-poster parity with `center.webp`;
- a visible lossy-alpha runtime poster at `240×240` and atlas at `1920×1920`;
- all 57 atlas positions, frame keys, source filenames, and source SHA-256 hashes;
- exact encoded atlas/poster hashes; and
- a 432,904-byte runtime image payload, below the 1,500,000-byte release budget and the reference site's measured 1,446,302-byte two-theme payload.

## Visual checks

Four five-column motion sheets cover every endpoint-to-25%-to-50%-to-75%-to-end sequence. Visual inspection confirmed monotonic directional motion, stable identity, intact sunglass rims, continuous crown and side hair volume, consistent body scale and bottom crop, and unchanged shirt construction: the pocket remains screen-right while the placket and buttons remain screen-left.

The initial right-to-bottom-right result was rejected because it lowered the chin too early and imported too much of the reference subject's hair shape. A stricter `gpt-image-2` redo made each matching reference-site frame authoritative for pose only and kept the V13 endpoints authoritative for Sid, hair, wardrobe, framing, and scale. Side-by-side review selected that redo for all three frames.

The decoded atlas contact sheet confirms the 57 populated cells are correctly ordered with no blank cell, neighboring-cell bleed, white matte, or visible alpha failure. The atlas and poster decode as lossy VP8 plus alpha.

Generated `1280×1280` PNGs are retained outside the deployed asset directory as offline edit masters. Post-generation processing is limited to border-connected chroma-key alpha extraction, edge-color decontamination, uniform resizing, and WebP encoding; it performs no optical flow, geometric warp, face morph, body lock, or frame blending.

## Production browser checks

A production `next start` audit at a `1200×900` desktop viewport confirmed:

- the stage and rendered atlas cell are exactly `120×120` with a circular clip;
- the browser requests only `face-motion-poster.webp` and `face-motion-atlas.webp` for the feature;
- center-to-right commits `center_to_right_1` immediately, then `_2`, `_3`, and `right` in order;
- right-to-bottom-right commits frames 1, 2, and 3 in order, while the reverse path commits 3, 2, and 1;
- every sampled frame retains the decoded atlas background, `opacity: 1`, `visibility: visible`, and `ready` status with no blank or white-flash sample;
- the header avatar decodes from the direct 240px poster at its natural dimensions;
- the console reports no errors, warnings, or browser issues; and
- an emulated reduced-motion preference stays on the center poster, reports `reduced-motion`, and does not request the atlas.
