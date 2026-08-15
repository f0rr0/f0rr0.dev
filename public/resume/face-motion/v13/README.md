# Face-motion V13

V13 keeps the nine accepted `1254×1254` GPT Image 2 endpoints byte-for-byte unchanged and adds complete reference-style motion coverage: eight center spokes plus eight adjacent outer-ring edges, with three authored transition frames per edge. Reverse travel reuses the same frames in reverse order.

## Transition generation

Each of the 48 transitions was generated as a separate high-quality `gpt-image-2` Image API edit at `1280×1280`.

- Images 1 and 2 were the adjacent V13 endpoints and were authoritative for Sid's identity, hair, glasses, wardrobe, lighting, framing, scale, and crop.
- Image 3 was the exact matching light-theme transition downloaded from [dahbiahmed.com](https://dahbiahmed.com/) and was authoritative only for head pose and motion progress.
- The prompt explicitly prohibited transferring the reference subject's identity, hair, glasses, clothing, styling, body proportions, or framing.
- The right-to-bottom-right edge uses a stricter exact-pose redo selected after side-by-side QA; it preserves V13 hair and framing while following the reference pose timing.

The accepted `1280×1280` chroma-key PNGs remain offline edit masters. Border-connected magenta removal and uniform downsampling produce the committed `240×240` lossy WebP transition cells with alpha. No optical flow, geometric warp, body lock, crossfade, or post-generation frame blending is used.

## Runtime delivery

The browser displays a `120×120` circular portrait from one decoded 2× atlas:

- `face-motion-poster.webp`: 240×240, 5,932 bytes
- `face-motion-atlas.webp`: 1920×1920, 57 populated 240×240 cells in an 8×8 grid, 426,972 bytes
- Total runtime image payload: **432,904 bytes**

For comparison, the downloaded reference site's two 57-image themes total 1,446,302 bytes. The 48 committed transition source cells total 400,512 bytes and are build inputs, not separately preloaded by the browser.

The first transition frame is committed immediately, followed by frames at 50 ms and 100 ms and the endpoint at 150 ms. The runtime retains latest-target retargeting, reversible active edges, shortest-path routing, touch support, live scroll/resize geometry, reduced-motion handling, and a static-poster failure fallback. Switching only the background position of an already decoded atlas removes the old per-image white flash.

## Records

- Runtime and endpoint inventory: [`manifest.json`](manifest.json)
- Atlas cell map and source hashes: [`face-motion-atlas.json`](face-motion-atlas.json)
- Generation provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Exact transition prompts: [`TRANSITION-PROMPTS.md`](TRANSITION-PROMPTS.md)
- Validation notes: [`VALIDATION.md`](VALIDATION.md)

Run `bun run build:face-motion-atlas` to rebuild the poster and atlas from the committed cells, then `bun run verify:face-motion` to recreate the deterministic QA report and contact sheet.
