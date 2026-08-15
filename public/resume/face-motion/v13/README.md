# Face-motion V13

V13 now deploys the downloaded light-theme portrait set from [dahbiahmed.com](https://dahbiahmed.com/) instead of the generated Sid portrait set. All nine endpoints and all 48 authored transition cells are byte-for-byte copies of the corresponding reference files.

The motion graph matches the reference implementation: eight center spokes, eight adjacent outer-ring edges, and three authored transition frames per canonical edge. Reverse travel uses the same three cells in reverse order.

## Source mapping

- Endpoints keep their original pose names: `center.webp`, `top.webp`, `top-right.webp`, and so on.
- Reference transition names such as `center_to_topright_1.webp` are copied to the runtime build-input convention `transition-center-top-right-1.webp` without decoding or re-encoding.
- `portrait-neutral.webp` is an exact copy of the reference `center.webp`.
- The source download inventory is recorded in `downloads/dahbiahmed-face-motion/MANIFEST.json`; its SHA-256 is pinned in `manifest.json` and `PROVENANCE.json`.

Every source frame is a `240×240` lossy WebP with alpha. The committed 57-frame source set totals 750,226 bytes.

## Runtime delivery

The browser displays a `120×120` circular portrait from one decoded 2× atlas:

- `face-motion-poster.webp`: 240×240, 10,928 bytes
- `face-motion-atlas.webp`: 1920×1920, 57 populated 240×240 cells in an 8×8 grid, 578,004 bytes
- Total runtime image payload: **588,932 bytes**

The first transition frame is committed immediately, followed by frames at 50 ms and 100 ms and the endpoint at 150 ms. The single predecoded atlas prevents the former per-image white flash while retaining reversible edges, shortest-path routing, touch input, reduced-motion handling, and a static-poster failure fallback.

## Records

- Runtime and source inventory: [`manifest.json`](manifest.json)
- Atlas cell map and source hashes: [`face-motion-atlas.json`](face-motion-atlas.json)
- Source provenance: [`PROVENANCE.json`](PROVENANCE.json)
- Validation notes: [`VALIDATION.md`](VALIDATION.md)

Run `bun run build:face-motion-atlas` to rebuild the poster and atlas from the committed reference cells, then `bun run verify:face-motion` to recreate the deterministic QA report and contact sheet.
