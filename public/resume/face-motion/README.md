# Face-motion assets

`v12` is the active portrait release. It contains nine immutable, semantic
compass endpoints generated with GPT Image 2: center plus the eight cardinal
and diagonal directions.

The release deliberately contains no mesh-derived frames, optical-flow frames,
warped faces, rescaled bodies, or blended eyeglasses. See
[`v12/README.md`](v12/README.md), [`v12/manifest.json`](v12/manifest.json), and
[`v12/VALIDATION.md`](v12/VALIDATION.md) for the exact contract and provenance.

New runtime code must use `/resume/face-motion/v12`.
