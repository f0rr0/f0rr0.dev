# V13 side-generation prompts

The selected endpoints and right-to-bottom-right midpoint were generated through the Image API with `gpt-image-2`, high quality, a `1280×1280` canvas, and PNG output. Input order is significant and is documented below. The diagonal inputs were fixed references and were not edited.

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

## Superseded right scale correction

```text
Use case: identity-preserve
Asset type: corrected horizontal right endpoint for a smooth interactive website portrait
Primary request: Edit Image 1 so the face and head are subtly smaller and no longer feel close to the camera, while preserving an unmistakably horizontal screen-right pose at 3 o'clock. Reduce the perceived face/head scale by about 5 percent relative to Image 1 and match the more restrained face scale and camera distance shown by Images 2 and 3. Keep the tall full swept crown and the exact same person.
Input images: Image 1 is the edit target and is authoritative for the horizontal 3 o'clock head direction, level gaze, expression, full hair style, clothing, lighting, square framing, and bottom crop. Image 2 is the fixed bottom-right endpoint and is authoritative only for natural face/head scale, camera distance, shoulder proportion, and subject placement; do not copy its downward pose or downward gaze. Image 3 is the fixed top-right endpoint and is authoritative only for crown height, width, side fullness, density, sweep, and fine hair texture; do not copy its upward pose or upward gaze. Image 4 is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: preserve the square canvas and bottom crop; keep the shoulders and torso naturally proportioned; create a little more breathing room around the face without shrinking or flattening the crown
Required pose: face and eyes aim horizontally screen-right at 3 o'clock; no upward or downward component; level eyeglass bridge; level chin
Required scale: face and head read about 5 percent smaller than Image 1; match the neighboring fixed endpoints' camera distance and proportions; avoid any oversized forehead, glasses, nose, beard, or jaw
Required hair: retain the full crown height, width, side fullness, density, and smooth silhouette continuity established by Image 3
Constraints: exactly one person; exactly one pair of round sunglasses with crisp rims and temples; white crew-neck T-shirt; charcoal open overshirt; preserve identity, expression, hair identity, lighting, wardrobe, and body proportions
Avoid: large close-up face; oversized head; top-right pose; bottom-right pose; upward or downward gaze; low or narrow crown; compressed hair; abrupt hairline transition; zooming in; recentering drift; streaks; rectangular blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; duplicate or warped glasses; extra accessories; text; logos; watermark
```

## Superseded right body-framing correction

```text
Use case: identity-preserve
Asset type: final horizontal right endpoint for a smooth interactive website portrait
Primary request: Edit only the masked lower-body region of Image 1. Keep Image 1's accepted smaller head, face, hair, sunglasses, beard, neck, level 3 o'clock pose, and their exact scale and coordinates unchanged. Restore the shoulder width, torso scale, collar geometry, clothing placement, subject width, and bottom crop from Image 2 so the body no longer looks zoomed out.
Input images: Image 1 is the masked edit target and is the sole authority for the entire head, face, hair, neck, gaze, expression, identity, lighting, and horizontal 3 o'clock pose. Do not alter any unmasked head pixel or change the head's scale or position. Image 2 is the fixed body-framing reference and is authoritative only for shoulder-tip coordinates, torso width, collar and neckline position, clothing geometry, subject placement, camera crop, and bottom edge; do not copy its larger face. Image 3 is the fixed top-right endpoint and is a supporting hair-identity reference only; never copy its upward pose. Image 4 is the fixed bottom-right endpoint and is a supporting body-proportion reference only; never copy its downward pose.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: widen and restore only the body beneath the locked head; shoulder tips, torso width, collar, neckline, clothing, and bottom crop must match Image 2; keep the head and neck exactly where they are in Image 1
Required pose: preserve Image 1's horizontal screen-right 3 o'clock face and eye direction exactly; no upward or downward component; level eyeglass bridge; level chin
Required head: preserve Image 1's smaller natural face/head scale, full crown height, side volume, identity, beard, glasses, expression, and coordinates exactly
Required body: match Image 2's full shoulder span and torso framing; the body must not appear zoomed out, inset, narrowed, or farther from the camera
Constraints: change only the masked lower-body region; preserve every unmasked head/face/hair pixel as closely as possible; exactly one person; exactly one pair of round sunglasses; white crew-neck T-shirt; charcoal open overshirt; preserve lighting and natural body proportions
Avoid: any head or face change; larger face; smaller face; head movement; pose drift; whole-subject resize; zooming out; narrow or inset shoulders; small torso; inward shoulder drift; altered hair; altered glasses; changed beard; upward or downward gaze; recentering; streaks; blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; duplicate accessories; text; logos; watermark
```

## Superseded right mirrored-left detail edit

```text
Use case: identity-preserve
Asset type: mirrored horizontal right endpoint for a smooth interactive website portrait
Primary request: Image 1 is the exact horizontally mirrored left portrait and is already the correct final right-side geometry. Make only small masked interior-detail edits so it does not look like a mechanically mirrored duplicate: subtly vary the internal crown hair-strand clumping, give the two sunglass lenses slightly different natural dark studio reflections, relocate the charcoal overshirt chest pocket from screen-left to screen-right, and vary a few local overshirt folds and button details. Preserve the exact mirrored silhouette, pose, face, body framing, scale, and crop.
Input images: Image 1 is the masked edit target and is the absolute authority for every spatial property: canvas, subject coordinates, horizontal screen-right 3 o'clock head and eye direction, face/head scale, facial identity, expression, beard, eyeglass geometry, complete outer hair silhouette, shoulder tips, torso width, collar, neckline, body placement, and bottom crop. Image 2 is the fixed top-right endpoint and is a supporting reference only for natural right-side crown texture and strand variation; never copy its upward pose or change Image 1's hair silhouette. Image 3 is the fixed center endpoint and is a supporting identity, lighting, and wardrobe reference only. Image 4 is the fixed bottom-right endpoint and is a supporting reference only for natural right-side lens reflections and screen-right pocket placement; never copy its downward pose, scale, or body placement.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: pixel-lock Image 1's outer silhouette and framing; do not move, scale, rotate, crop, widen, narrow, or recenter any part of the person
Required pose: preserve Image 1's unmistakably horizontal screen-right 3 o'clock face and eye direction exactly; level eyeglass bridge and chin; no upward or downward component
Required hair: preserve the complete outer hair boundary exactly; change only a few internal strand groupings and highlights inside the masked crown so the texture is not a literal mirror copy
Required glasses: preserve rims, temples, size, and coordinates exactly; alter only the subtle interior lens reflections within the mask
Required clothing: preserve shoulder span, torso, collar, neckline, fabric color, and outer silhouette exactly; remove the mirrored screen-left chest pocket and add the same understated pocket on screen-right; vary only a few masked microfolds and button details
Constraints: edit only the transparent portions of the supplied mask; preserve all unmasked pixels as closely as possible; exactly one person; exactly one pair of round sunglasses; white crew-neck T-shirt; charcoal open overshirt; no change to skin, facial proportions, beard silhouette, head size, body size, or lighting
Avoid: any generative reframing; zooming; head movement; face change; pose drift; altered hair outline; lower or narrower crown; shoulder drift; torso resize; collar shift; changed crop; upward or downward gaze; duplicate glasses; warped rims; extra pockets; obvious mirrored artifacts; strong lens glare; streaks; blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; extra accessories; text; logos; watermark
```

## Superseded strict-profile right from the two fixed diagonals

```text
Use case: identity-preserve
Asset type: exact horizontal-right endpoint for a smooth interactive website portrait
Primary request: Generate one new portrait of this same person at the exact visual midpoint between Image 1 and Image 2. The new face, chin, eyeglass bridge, and eye gaze must point perfectly horizontally toward screen-right at 3 o'clock, with zero upward or downward component. This is a new midpoint portrait synthesized from the two references, not an edit of either reference.
Input images: Image 1 is the fixed accepted top-right portrait and Image 2 is the fixed accepted bottom-right portrait. They are the only references and have equal authority. Interpolate their identity, camera distance, face/head scale, hair silhouette, subject position, shoulders, torso, collar, clothing construction, lighting, and crop exactly halfway. Never mirror either image. Do not introduce clothing geometry that is absent from both references.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard shape, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; place the complete head, shoulders, collar, torso, and bottom crop at the true geometric and perceptual midpoint of Images 1 and 2; keep the same camera distance and natural body scale; do not zoom in or out; keep the full hair silhouette inside the canvas
Required pose: unmistakably horizontal screen-right 3 o'clock head direction and gaze; level eyeglass bridge; level chin; nose points laterally screen-right; no raised chin, lowered chin, upward gaze, or downward gaze
Required face and hair: preserve the exact identity and natural facial proportions shared by both references; interpolate the full outer hair silhouette, crown height, width, side volume, density, sweep, and fine curl texture halfway between the two fixed references; no compressed crown or abrupt side crease
Required glasses: exactly one pair of round gold-rim sunglasses with two crisp lenses, one bridge, and two natural temples; keep size and placement halfway between the references; no duplicate, smeared, warped, or floating rims
Required clothing construction: preserve the garment construction shared by both references exactly. The charcoal overshirt chest pocket must remain on screen-right, as in both images. The visible button placket and both visible dark buttons must remain on screen-left, as in both images. Keep collar points, placket seams, button order, pocket shape, pocket seam, white T-shirt neckline, shoulder width, and torso framing consistent. Do not swap, mirror, duplicate, remove, or relocate any button, placket, seam, or pocket.
Constraints: use only Images 1 and 2 as references; exactly one person; no additional accessories; preserve identity, wardrobe, lighting, color, photographic texture, and bottom crop; output the complete portrait against only the flat #FF00FF background
Avoid: top-right pose; bottom-right pose; any upward or downward component; mirrored shirt; pocket on screen-left; buttons on screen-right; changed button count; extra buttons; missing buttons; extra pocket; missing pocket; clothing asymmetry inconsistent with both references; large close-up face; small zoomed-out body; shoulder drift; altered collar; low or narrow crown; pose drift; recentering; streaks; blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; text; logos; watermark
```

## Right: preserve diagonal yaw and interpolate pitch only

```text
Use case: identity-preserve
Asset type: corrected right endpoint for a smooth interactive website portrait
Primary request: Generate one new portrait of this same person by interpolating only the vertical head pitch and eye elevation between Image 1 and Image 2. Keep the moderate right-facing three-quarter yaw already shared by both references. The result must look level and horizontally rightward, but must not rotate farther into a 90-degree side profile.
Input images: Image 1 is the fixed accepted top-right portrait and Image 2 is the fixed accepted bottom-right portrait. They are the only image references and have equal authority. Both already show the correct moderate three-quarter right yaw, camera angle, identity, clothing construction, and framing. Preserve that shared yaw exactly while placing head pitch, chin height, eyeglass tilt, and gaze halfway between their upward and downward values. Never mirror either image. Do not use or infer any additional reference image.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard shape, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; place the complete head, shoulders, collar, torso, and bottom crop at the true midpoint of Images 1 and 2; preserve their camera distance and natural body scale; do not zoom in or out; keep the full hair silhouette inside the canvas
Required orientation: a moderate right-facing three-quarter view, approximately 35 to 45 degrees of yaw from the camera, matching the yaw present in both references. Preserve a clearly visible front plane of the face and both cheeks. Both sunglass lenses must remain fully visible, with the narrower lens still at least roughly 70 percent of the apparent width of the wider lens. The nose may lead screen-right but the portrait must not read as a strict side silhouette. Keep the eyeglass bridge and chin level and the eyes directed rightward without upward or downward lead.
Required pitch interpolation: change only vertical pitch and gaze elevation relative to the two references. Image 1 looks up-right and Image 2 looks down-right; the new frame must sit exactly halfway, with a level head and level eye line. Do not add horizontal rotation while removing the vertical angle.
Required face and hair: preserve the exact identity and natural facial proportions shared by both references; interpolate the outer hair silhouette, crown height, width, side volume, density, sweep, and fine curl texture halfway between the two fixed references; no compressed crown or abrupt side crease
Required glasses: exactly one pair of round gold-rim sunglasses with two crisp, substantially visible lenses, one bridge, and two natural temples; no edge-on far lens; no duplicate, smeared, warped, or floating rims
Required clothing construction: preserve the garment construction shared by both references exactly. The charcoal overshirt chest pocket must remain on screen-right. The visible button placket and both visible dark buttons must remain on screen-left. Keep collar points, placket seams, button order, pocket shape, pocket seam, white T-shirt neckline, shoulder width, and torso framing consistent. Do not swap, mirror, duplicate, remove, or relocate any button, placket, seam, or pocket.
Constraints: use only Images 1 and 2 as references; exactly one person; no additional accessories; preserve identity, wardrobe, lighting, color, photographic texture, and bottom crop; output the complete portrait against only the flat #FF00FF background
Avoid: 90-degree profile; strict side view; full profile; edge-on far eye or lens; excessive rightward yaw; face turned farther right than either reference; top-right pitch; bottom-right pitch; upward or downward gaze; mirrored shirt; pocket on screen-left; buttons on screen-right; changed button count; extra buttons; missing buttons; extra pocket; missing pocket; large close-up face; small zoomed-out body; shoulder drift; altered collar; low or narrow crown; recentering; streaks; blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; text; logos; watermark
```

## Right to bottom-right midpoint

```text
Use case: identity-preserve
Asset type: one exact midpoint frame for a smooth interactive website portrait transition
Primary request: Generate one new portrait that is the precise 50 percent visual midpoint between Image 1 and Image 2. The motion starts at Image 1, with the face looking horizontally screen-right at 3 o'clock, and ends at Image 2, with the face looking down-right. Interpolate every visible change evenly so the two hops—Image 1 to the new frame, then the new frame to Image 2—have equal perceived motion.
Input images: Image 1 is the newly corrected right endpoint and is authoritative for the starting identity, smaller face/head scale, horizontal pose, full hair, clothing, lighting, and framing. Image 2 is the fixed bottom-right endpoint and is authoritative for the ending pose, gaze, scale, vertical placement, shoulder placement, hair silhouette, clothing, lighting, and framing. Image 3 is a supporting identity and wardrobe reference only.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge, with no texture or variation
Style/medium: natural high-resolution studio portrait photography matching the supplied person exactly
Composition/framing: preserve the square canvas and bottom crop; place the face, head, shoulders, and torso exactly halfway between their positions and scales in Images 1 and 2
Required pose: head pitch and eye gaze exactly halfway from horizontal screen-right at 3 o'clock to the down-right pose in Image 2; clearly down-right but only half as low as Image 2; no upward component
Required motion continuity: face/head size, eye line, chin height, nose position, eyeglass angle, shoulder height, torso position, and crop must each be at the true geometric and perceptual midpoint; do not keep the frame too close to either endpoint
Required hair: interpolate the complete hair silhouette evenly between the two endpoints while retaining a full crown, natural side volume, density, sweep, and fine texture
Constraints: exactly one person; exactly one pair of round sunglasses with crisp rims and temples; white crew-neck T-shirt; charcoal open overshirt; preserve identity, expression, beard, hair identity, lighting, wardrobe, and body proportions
Avoid: frame too similar to Image 1; frame too similar to Image 2; oversized face; sudden zoom; abrupt vertical jump; upward gaze; low or narrow crown; compressed hair; recentering drift; streaks; rectangular blocks; bands; smears; halos; white, black, gray, transparent, or checkerboard background; duplicate or warped glasses; extra accessories; text; logos; watermark
```
