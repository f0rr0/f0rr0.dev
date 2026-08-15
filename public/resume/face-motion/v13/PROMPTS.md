# V13 side-generation prompts

Both selected endpoints were generated through the Image API with `gpt-image-2`, high quality, a `1280×1280` canvas, and PNG output. Input order is significant and is documented below. The diagonal inputs were fixed references and were not edited.

## Left

```text
Use case: identity-preserve
Asset type: corrected left endpoint frame for a smooth interactive website portrait
Primary request: Edit Image 1 into an unmistakably horizontal screen-left pose. Lower the current upward-leading face and eye direction so the nose, eyeglass bridge, chin, and gaze point straight toward 9 o'clock. This must read as LEFT, not TOP-LEFT. At the same time, restore the full tall dense swept hair volume so the outer crown silhouette transitions smoothly from Image 2 without a low section, sudden notch, pinched side, or abrupt crease.
Input images: Image 1 is the edit target and is authoritative for the horizontal endpoint's framing, subject scale, shoulders, crop, expression, sunglasses, beard, clothes, and lighting. Change only its head/gaze elevation and hair silhouette as requested. Image 2 is the fixed accepted top-left endpoint and is authoritative only for hair identity: match its crown height, crown width, side fullness, density, sweep, hairline, taper, and fine curl texture. Never copy Image 2's upward pose or upward gaze. Image 3 is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: preserve Image 1's square framing, subject size, shoulders, and bottom crop; keep the complete fuller hair silhouette inside the canvas
Required pose: face and eyes aim horizontally screen-left at 9 o'clock; no upward or downward component; level eyeglass bridge; level chin; no raised face
Required hair: maintain Image 2's generous crown height and width into the left pose; dense volume across the full top and both side contours; smooth continuous silhouette between the diagonal and left frames; no collapse, notch, sharp inward step, flat patch, or abrupt crease
Constraints: exactly one person; exactly one pair of round sunglasses with crisp rims and temples; white crew-neck T-shirt; charcoal open overshirt; preserve identity, body, scale, crop, shoulders, lighting, and expression
Avoid: top-left pose; upward-leading gaze; upward chin; low or narrow crown; compressed hair; abrupt hairline transition; missing side volume; pose drift; zooming; recentering; streaks; rectangular blocks; horizontal or vertical bands; smears; halos; white, black, gray, transparent, or checkerboard background; duplicate or warped glasses; extra accessories; text; logos; watermark
```

## Right

```text
Use case: identity-preserve
Asset type: corrected right endpoint frame for a smooth interactive website portrait
Primary request: Edit Image 1 into an unmistakably horizontal screen-right pose. Lower the current upward-leading face and eye direction so the nose, eyeglass bridge, chin, and gaze point straight toward 3 o'clock. This must read as RIGHT, not TOP-RIGHT. At the same time, restore the full tall dense swept hair volume so the outer crown silhouette transitions smoothly from Image 2 without a low section, sudden notch, pinched side, or abrupt crease.
Input images: Image 1 is the edit target and is authoritative for the horizontal endpoint's framing, subject scale, shoulders, crop, expression, sunglasses, beard, clothes, and lighting. Change only its head/gaze elevation and hair silhouette as requested. Image 2 is the fixed accepted top-right endpoint and is authoritative only for hair identity: match its crown height, crown width, side fullness, density, sweep, hairline, taper, and fine curl texture. Never copy Image 2's upward pose or upward gaze. Image 3 is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: preserve Image 1's square framing, subject size, shoulders, and bottom crop; keep the complete fuller hair silhouette inside the canvas
Required pose: face and eyes aim horizontally screen-right at 3 o'clock; no upward or downward component; level eyeglass bridge; level chin; no raised face
Required hair: maintain Image 2's generous crown height and width into the right pose; dense volume across the full top and both side contours; smooth continuous silhouette between the diagonal and right frames; no collapse, notch, sharp inward step, flat patch, or abrupt crease
Constraints: exactly one person; exactly one pair of round sunglasses with crisp rims and temples; white crew-neck T-shirt; charcoal open overshirt; preserve identity, body, scale, crop, shoulders, lighting, and expression
Avoid: top-right pose; upward-leading gaze; upward chin; low or narrow crown; compressed hair; abrupt hairline transition; missing side volume; pose drift; zooming; recentering; streaks; rectangular blocks; horizontal or vertical bands; smears; halos; white, black, gray, transparent, or checkerboard background; duplicate or warped glasses; extra accessories; text; logos; watermark
```
