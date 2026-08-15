# Face-motion V13

V13 contains nine `1254×1254` GPT Image 2 endpoints and complete reference-style motion coverage: eight center spokes plus eight adjacent outer-ring edges, with three authored transition frames per edge. Reverse travel reuses the same frames in reverse order. Seven accepted endpoints remain byte-for-byte unchanged; `top.webp` and `bottom.webp` were corrected to true frontal up/down poses so the vertical axis has enough angular range for three graded steps without snapping back.

## Transition generation

The 39 transitions on 13 edges with a vertical component were regenerated as high-quality `gpt-image-2` Image API edits. Each accepted edge job produced one `3072×1024` three-panel strip containing the 25%, 50%, and 75% poses together. Generating the ordered triplet jointly made equal pitch and yaw spacing an explicit image-level constraint instead of three independent guesses. Nine stable cells remain unchanged: six on the two pure-horizontal edges and three on `left` → `top-left`, where new attempts either exceeded the unchanged diagonal endpoint or introduced yaw drift.

- Images 1 and 2 were the adjacent V13 endpoints and were authoritative for Sid's identity, hair, glasses, wardrobe, lighting, framing, scale, and crop.
- Image 3 was a five-frame strip assembled from the exact matching light-theme motion on [dahbiahmed.com](https://dahbiahmed.com/): start, 25%, 50%, 75%, and end. It was authoritative only for head pose and evenly graded motion progress.
- The prompt explicitly prohibited transferring the reference subject's identity, hair, glasses, clothing, styling, body proportions, or framing.
- Four sequences use the better-spaced 25% and 50% panels from an earlier accepted strip plus the endpoint-safe 75% panel from a tighter redo; no frame is blended or warped. The accepted `right` → `bottom-right` strip was generated from the two Sid endpoints only after the pose strip repeatedly caused overshoot.
- The top and bottom endpoints were generated separately at `1280×1280` from their prior endpoint, center, matching diagonal Sid portraits, and the reference site's axial pose, with the latter used only for pitch and gaze.

The accepted chroma-key PNG strips remain offline edit masters. Panel extraction, magenta alpha removal, and uniform downsampling produce the committed `240×240` lossy WebP transition cells with alpha. The corrected axis endpoints are committed as `1254×1254` lossless WebPs. No optical flow, geometric warp, body lock, crossfade, or post-generation frame blending is used.

## Runtime delivery

The browser displays a `120×120` circular portrait from one decoded 2× atlas:

- `face-motion-poster.webp`: 240×240, 5,932 bytes
- `face-motion-atlas.webp`: 1920×1920, 57 populated 240×240 cells in an 8×8 grid, 451,758 bytes
- Total runtime image payload: **457,690 bytes**

For comparison, the downloaded reference site's two 57-image themes total 1,446,302 bytes. The 48 committed transition source cells total 421,376 bytes and are build inputs, not separately preloaded by the browser.

The first transition frame is committed immediately, followed by frames at 50 ms and 100 ms and the endpoint at 150 ms. The runtime retains latest-target retargeting, reversible active edges, shortest-path routing, touch support, live scroll/resize geometry, reduced-motion handling, and a static-poster failure fallback. Switching only the background position of an already decoded atlas removes the old per-image white flash.

## Records

- Runtime and endpoint inventory: [`manifest.json`](manifest.json)
- Atlas cell map and source hashes: [`face-motion-atlas.json`](face-motion-atlas.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Exact transition prompts: [`TRANSITION-PROMPTS.md`](TRANSITION-PROMPTS.md)
- Validation notes: [`VALIDATION.md`](VALIDATION.md)

Run `bun run build:face-motion-atlas` to rebuild the poster and atlas from the committed cells, then `bun run verify:face-motion` to recreate the deterministic QA report and contact sheet.
