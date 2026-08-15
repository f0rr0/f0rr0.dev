# V13 side-generation prompts

Both selected endpoints were generated through the Image API with `gpt-image-2`, high quality, a `1280×1280` canvas, and PNG output. Input order is significant and is documented below.

## Left

```text
Use case: identity-preserve
Asset type: a single endpoint frame for a smooth interactive website portrait
Primary request: Re-render Image 1 cleanly while preserving its exact horizontal left-facing head pose and gaze. This is the left endpoint, not the top-left endpoint: the chin, nose, eyeglass bridge, and gaze must stay level with no upward or downward tilt.
Input images: Image 1 is the clean prior left source and is authoritative for every spatial property: head angle, gaze angle, face position, subject scale, shoulder placement, crop, expression, glasses, beard, clothing, and lighting. Reproduce those coordinates and proportions as closely as possible. Image 2 is the accepted top-left endpoint and is a reference only for the same person's tall dense swept curly crown, hairline, tapered side hair, fine hair texture, and other identity details. Do not copy Image 2's upward head angle, upward gaze, pose, scale, or placement. Image 3 is the accepted center endpoint and is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background, edge to edge, with one uniform color and no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the references
Composition/framing: copy Image 1's square composition, subject size, head position, shoulders, and bottom crop; keep the full hair silhouette inside the canvas
Constraints: preserve exactly one pair of round sunglasses with crisp rims and temples; preserve the white crew-neck T-shirt and charcoal open overshirt; use Image 2 to keep crown height, density, silhouette, and texture consistent without changing Image 1's pose; complete clean silhouette
Avoid: any upward or downward head tilt; any upward or downward gaze; zooming; recentering; pose drift; transparent or checkerboard background; streaks; rectangular blocks; bands; smears; halos; white or gray background; background shadows; duplicate or warped glasses; extra accessories; text; logos; watermark
```

## Right

```text
Use case: identity-preserve
Asset type: a single endpoint frame for a smooth interactive website portrait
Primary request: Re-render Image 1 cleanly while preserving its exact horizontal right-facing head pose and gaze. This is the right endpoint, not the top-right endpoint: the chin, nose, eyeglass bridge, and gaze must stay level with no upward or downward tilt.
Input images: Image 1 is the clean prior right source and is authoritative for every spatial property: head angle, gaze angle, face position, subject scale, shoulder placement, crop, expression, glasses, beard, clothing, and lighting. Reproduce those coordinates and proportions as closely as possible. Image 2 is the accepted top-right endpoint and is a reference only for the same person's tall dense swept curly crown, hairline, tapered side hair, fine hair texture, and other identity details. Do not copy Image 2's upward head angle, upward gaze, pose, scale, or placement. Image 3 is the accepted center endpoint and is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background, edge to edge, with one uniform color and no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the references
Composition/framing: copy Image 1's square composition, subject size, head position, shoulders, and bottom crop; keep the full hair silhouette inside the canvas
Constraints: preserve exactly one pair of round sunglasses with crisp rims and temples; preserve the white crew-neck T-shirt and charcoal open overshirt; use Image 2 to keep crown height, density, silhouette, and texture consistent without changing Image 1's pose; complete clean silhouette
Avoid: any upward or downward head tilt; any upward or downward gaze; zooming; recentering; pose drift; transparent or checkerboard background; streaks; rectangular blocks; bands; smears; halos; white or gray background; background shadows; duplicate or warped glasses; extra accessories; text; logos; watermark
```
