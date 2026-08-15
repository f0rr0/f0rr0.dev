# V13 validation

PASS: all nine endpoints and all 48 transition cells are the exact downloaded light-theme reference assets. The browser atlas contains the expected 57 unique frame keys and preserves the reference site's graded pose progression.

## Deterministic checks

`bun run verify:face-motion` covers:

- the exact endpoint, transition, poster, and atlas inventory;
- pinned endpoint hashes and the approved decoded center hash;
- nine unique visible lossy-alpha endpoints at `240×240`;
- 48 visible lossy-alpha transition cells at `240×240` with contiguous 1-based numbering;
- byte-for-byte neutral-poster parity with `center.webp`;
- all 57 atlas positions, frame keys, source filenames, and source SHA-256 hashes;
- exact encoded atlas and runtime-poster hashes; and
- a 588,932-byte runtime image payload, below the 1,500,000-byte release budget.

An additional source-parity audit compares every deployed endpoint and transition SHA-256 against `downloads/dahbiahmed-face-motion/MANIFEST.json`. This confirms the source cells were copied without resize, crop, alpha extraction, interpolation, blending, or re-encoding. Only the packed runtime atlas and its poster are derived encodings.

## Visual checks

The decoded 57-cell release contact sheet matches the downloaded light-theme reference contact sheet in subject, framing, pose order, and motion gradation. Because the feature now uses the original transition cells, the vertical axis and all diagonal-to-cardinal paths inherit the exact pacing of the reference implementation.

The atlas sheet also confirms there are no blank cells, neighboring-cell bleed, opaque mattes, or alpha failures. Switching atlas background position keeps one already decoded image visible throughout a transition, avoiding the former right-to-bottom-right white flash.
