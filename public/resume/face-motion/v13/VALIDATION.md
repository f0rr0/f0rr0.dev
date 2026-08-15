# V13 validation

PASS: all nine `1254×1254` lossless endpoints are distinct, all 16 canonical edges have exactly three authored `240×240` lossy-alpha transition cells, and the browser atlas contains the expected 57 unique frame keys. Seven endpoints remain unchanged; the top and bottom endpoints are approved true-up/true-down corrections.

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
- a 457,690-byte runtime image payload, below the 1,500,000-byte release budget and the reference site's measured 1,446,302-byte two-theme payload.

## Visual checks

Matching 57-cell atlas sheets were built for both the downloaded original reference and V13. Four additional five-column motion sheets cover every endpoint-to-25%-to-50%-to-75%-to-end sequence. Side-by-side inspection confirmed visibly distinct pitch/yaw progression on the regenerated paths rather than repeated near-endpoint poses. The two pure-horizontal paths and the stable `left` → `top-left` path retain their accepted cells.

Visual inspection also confirmed stable identity, intact sunglass rims, continuous crown and side hair volume, consistent body scale and bottom crop, and unchanged shirt construction: the pocket remains screen-right while the placket and buttons remain screen-left. Early strips that collapsed adjacent steps, overshot an endpoint, or drifted yaw were rejected. Four accepted paths use the more readable 25% and 50% panels from one strip and the endpoint-safe 75% panel from a tighter redo; each selected panel is still an unblended `gpt-image-2` output.

The former top and bottom endpoints were too close to level, leaving too little angular range and making axial sequences overshoot or repeat. Their replacements keep frontal yaw and the same wardrobe/framing while adding unmistakable up/down pitch. QA confirms continued movement through the three center-axis intermediates into each corrected endpoint without snap-back.

The decoded atlas contact sheet confirms the 57 populated cells are correctly ordered with no blank cell, neighboring-cell bleed, white matte, or visible alpha failure. The atlas and poster decode as lossy VP8 plus alpha.

Generated `3072×1024` three-panel strips and the `1280×1280` corrected-axis PNGs are retained outside the deployed asset directory as offline edit masters. Post-generation processing is limited to panel extraction, chroma-key alpha extraction, edge-color decontamination, uniform resizing, selected-panel assembly, and WebP encoding; it performs no optical flow, geometric warp, face morph, body lock, or frame blending.

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
