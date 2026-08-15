# V13 transition-generation prompts

All 48 frames were generated as separate high-quality `gpt-image-2` Image API edit jobs at `1280×1280`. Images 1 and 2 in every job are fixed V13 portraits of Sid and are authoritative for the actual subject. Image 3 is the exact matching light-theme transition from dahbiahmed.com and is authoritative only for pose mechanics and motion progress. Reference-site identity, appearance, wardrobe, framing, and styling are explicitly excluded.

## center_to_top_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_top_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=71..1220, y=104..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_top_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=71..1220, y=107..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_top_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=72..1219, y=110..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topright_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=71..1220, y=99..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topright_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=72..1219, y=97..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topright_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=73..1218, y=96..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_right_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=71..1218, y=106..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_right_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=71..1216, y=111..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_right_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=72..1213, y=116..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomright_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (bottom-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=68..1217, y=113..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward moderate right-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomright_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (bottom-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=65..1214, y=125..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward moderate right-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomright_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (bottom-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=63..1210, y=136..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward moderate right-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottom_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=70..1221, y=105..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottom_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=70..1221, y=109..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottom_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=70..1221, y=113..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomleft_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=72..1222, y=108..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomleft_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=73..1222, y=116..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_bottom-left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_bottomleft_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=74..1223, y=123..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_left_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=70..1220, y=104..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_left_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=69..1220, y=106..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_left_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=69..1219, y=109..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topleft_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (center) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=70..1220, y=101..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly one quarter (25%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topleft_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (center) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=70..1218, y=101..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly halfway (50%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## center_to_top-left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/center.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/center_to_topleft_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (center) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted center endpoint (neutral forward-facing head and level gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=70..1217, y=100..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from neutral forward-facing head and level gaze and move exactly three quarters (75%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top_to_top-right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/top_to_topright_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (top) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=73..1218, y=108..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched upward with upward gaze and move exactly one quarter (25%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top_to_top-right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/top_to_topright_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (top) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=73..1218, y=104..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched upward with upward gaze and move exactly halfway (50%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top_to_top-right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/top_to_topright_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (top) to Image 2 (top-right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze); Image 2 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=73..1217, y=99..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched upward with upward gaze and move exactly three quarters (75%) toward moderate right-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-right_to_right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topright_to_right_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (top-right) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=73..1215, y=101..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with upward pitch and gaze and move exactly one quarter (25%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-right_to_right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topright_to_right_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (top-right) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=73..1214, y=108..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with upward pitch and gaze and move exactly halfway (50%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-right_to_right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topright_to_right_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (top-right) to Image 2 (right). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-right endpoint (moderate right-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=73..1212, y=115..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with upward pitch and gaze and move exactly three quarters (75%) toward level moderate right-facing three-quarter yaw and level rightward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## right_to_bottom-right_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/right_to_bottomright_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of Sid with the exact head pose shown by Image 3. Image 3 is the accepted reference website's authored step 1 for this edge and is the absolute authority for head yaw, vertical pitch, chin elevation, gaze, facial foreshortening, and pose-induced glasses perspective. Copy those pose mechanics precisely onto Sid. The 25/50/75 percent label describes sequence order only; do not independently estimate, average, exaggerate, or advance the pose from Images 1 and 2.
Input images: Image 1 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step and has absolute authority for head yaw, vertical pitch, chin elevation, gaze direction, facial foreshortening, pose-induced glasses perspective, and movement timing. Match that pose exactly. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=69..1210, y=128..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: match Image 3 exactly. Do not look lower, higher, more frontal, or farther right than Image 3. In particular, steps 1 and 2 must stay close to the level right start if Image 3 does, while step 3 may approach the down-right endpoint only to the degree shown by Image 3.
Required continuity: derive hair crown height, side volume, sweep, hairline, glasses design, identity, neck, shoulders, collar, torso scale, pocket, buttons, and shirt seams only from Images 1 and 2. Never copy Image 3's hair or appearance. Keep the V13 hair silhouette smoothly between the two V13 endpoints with no abrupt frontal flop, narrowed side, notch, scale jump, or body-framing change.
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## right_to_bottom-right_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/right_to_bottomright_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of Sid with the exact head pose shown by Image 3. Image 3 is the accepted reference website's authored step 2 for this edge and is the absolute authority for head yaw, vertical pitch, chin elevation, gaze, facial foreshortening, and pose-induced glasses perspective. Copy those pose mechanics precisely onto Sid. The 25/50/75 percent label describes sequence order only; do not independently estimate, average, exaggerate, or advance the pose from Images 1 and 2.
Input images: Image 1 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step and has absolute authority for head yaw, vertical pitch, chin elevation, gaze direction, facial foreshortening, pose-induced glasses perspective, and movement timing. Match that pose exactly. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=66..1209, y=135..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: match Image 3 exactly. Do not look lower, higher, more frontal, or farther right than Image 3. In particular, steps 1 and 2 must stay close to the level right start if Image 3 does, while step 3 may approach the down-right endpoint only to the degree shown by Image 3.
Required continuity: derive hair crown height, side volume, sweep, hairline, glasses design, identity, neck, shoulders, collar, torso scale, pocket, buttons, and shirt seams only from Images 1 and 2. Never copy Image 3's hair or appearance. Keep the V13 hair silhouette smoothly between the two V13 endpoints with no abrupt frontal flop, narrowed side, notch, scale jump, or body-framing change.
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## right_to_bottom-right_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/right_to_bottomright_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of Sid with the exact head pose shown by Image 3. Image 3 is the accepted reference website's authored step 3 for this edge and is the absolute authority for head yaw, vertical pitch, chin elevation, gaze, facial foreshortening, and pose-induced glasses perspective. Copy those pose mechanics precisely onto Sid. The 25/50/75 percent label describes sequence order only; do not independently estimate, average, exaggerate, or advance the pose from Images 1 and 2.
Input images: Image 1 is the fixed accepted right endpoint (level moderate right-facing three-quarter yaw and level rightward gaze); Image 2 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step and has absolute authority for head yaw, vertical pitch, chin elevation, gaze direction, facial foreshortening, pose-induced glasses perspective, and movement timing. Match that pose exactly. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=63..1208, y=141..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: match Image 3 exactly. Do not look lower, higher, more frontal, or farther right than Image 3. In particular, steps 1 and 2 must stay close to the level right start if Image 3 does, while step 3 may approach the down-right endpoint only to the degree shown by Image 3.
Required continuity: derive hair crown height, side volume, sweep, hairline, glasses design, identity, neck, shoulders, collar, torso scale, pocket, buttons, and shirt seams only from Images 1 and 2. Never copy Image 3's hair or appearance. Keep the V13 hair silhouette smoothly between the two V13 endpoints with no abrupt frontal flop, narrowed side, notch, scale jump, or body-framing change.
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-right_to_bottom_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomright_to_bottom_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (bottom-right) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=63..1210, y=140..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with downward pitch and gaze and move exactly one quarter (25%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-right_to_bottom_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomright_to_bottom_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (bottom-right) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=65..1214, y=133..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with downward pitch and gaze and move exactly halfway (50%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-right_to_bottom_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-right.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomright_to_bottom_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (bottom-right) to Image 2 (bottom). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-right endpoint (moderate right-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=68..1217, y=125..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate right-facing three-quarter yaw with downward pitch and gaze and move exactly three quarters (75%) toward forward-facing head pitched downward with downward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom_to_bottom-left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottom_to_bottomleft_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (bottom) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=72..1222, y=121..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched downward with downward gaze and move exactly one quarter (25%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom_to_bottom-left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottom_to_bottomleft_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (bottom) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=73..1222, y=124..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched downward with downward gaze and move exactly halfway (50%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom_to_bottom-left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom.png`, `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottom_to_bottomleft_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (bottom) to Image 2 (bottom-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom endpoint (forward-facing head pitched downward with downward gaze); Image 2 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=74..1223, y=127..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from forward-facing head pitched downward with downward gaze and move exactly three quarters (75%) toward moderate left-facing three-quarter yaw with downward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-left_to_left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomleft_to_left_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (bottom-left) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=74..1223, y=126..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with downward pitch and gaze and move exactly one quarter (25%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-left_to_left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomleft_to_left_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (bottom-left) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=72..1221, y=121..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with downward pitch and gaze and move exactly halfway (50%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## bottom-left_to_left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/bottom-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/bottomleft_to_left_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (bottom-left) to Image 2 (left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted bottom-left endpoint (moderate left-facing three-quarter yaw with downward pitch and gaze); Image 2 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=70..1220, y=116..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with downward pitch and gaze and move exactly three quarters (75%) toward level left-facing yaw and level leftward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## left_to_top-left_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/left_to_topleft_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (left) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=69..1218, y=108..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from level left-facing yaw and level leftward gaze and move exactly one quarter (25%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## left_to_top-left_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/left_to_topleft_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (left) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=69..1217, y=106..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from level left-facing yaw and level leftward gaze and move exactly halfway (50%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## left_to_top-left_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/left_to_topleft_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (left) to Image 2 (top-left). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted left endpoint (level left-facing yaw and level leftward gaze); Image 2 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=70..1216, y=103..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from level left-facing yaw and level leftward gaze and move exactly three quarters (75%) toward moderate left-facing three-quarter yaw with upward pitch and gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-left_to_top_1

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topleft_to_top_1.webp`
- Fraction: 0.25

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at one quarter (25%) of the semantic movement from Image 1 (top-left) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 25% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at one quarter (25%); target visible-subject bounds are approximately x=71..1216, y=103..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with upward pitch and gaze and move exactly one quarter (25%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-left_to_top_2

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topleft_to_top_2.webp`
- Fraction: 0.5

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at halfway (50%) of the semantic movement from Image 1 (top-left) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 50% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at halfway (50%); target visible-subject bounds are approximately x=71..1217, y=107..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with upward pitch and gaze and move exactly halfway (50%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```

## top-left_to_top_3

- Subject references: `tmp/imagegen/face-motion-reference-parity/inputs/top-left.png`, `tmp/imagegen/face-motion-reference-parity/inputs/top.png`
- Pose-only reference: `downloads/dahbiahmed-face-motion/profile/nobg/transitions/topleft_to_top_3.webp`
- Fraction: 0.75

```text
Use case: identity-preserve
Asset type: one authored intermediate frame in a five-frame pointer-driven website portrait sequence
Primary request: Generate exactly one new portrait of this same person at three quarters (75%) of the semantic movement from Image 1 (top-left) to Image 2 (top). The complete ordered sequence is Image 1 -> 25% -> 50% -> 75% -> Image 2. This frame is the 75% position, not a variant or endpoint. Interpolate the real head yaw, vertical pitch, gaze, glasses perspective, face geometry, hair silhouette, neck, shoulders, collar, and torso placement continuously between the two references.
Input images: Image 1 is the fixed accepted top-left endpoint (moderate left-facing three-quarter yaw with upward pitch and gaze); Image 2 is the fixed accepted top endpoint (forward-facing head pitched upward with upward gaze). Images 1 and 2 are the fixed accepted portraits of Sid and are the only authority for subject identity, facial structure, skin, beard, hair design and volume, glasses, wardrobe construction, lighting, camera distance, body scale, placement, and crop. Image 3 is the downloaded reference website's exact matching transition frame at this same progress step; use Image 3 only as the pose template for head yaw, vertical pitch, gaze direction, facial foreshortening, glasses perspective caused by pose, and the monotonic movement rhythm. Apply Image 3's pose mechanics to Sid while preserving the visual subject and composition from Images 1 and 2. Do not transfer any identity, gender, facial features, hair design, glasses design, clothes, colors, lighting, body proportions, or framing from Image 3. Never mirror any input.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background covering every background pixel edge to edge; no gradient, texture, shadow, floor, halo, or color variation
Subject: exactly the same adult man, facial identity, skin tone, beard, round gold-rim sunglasses, tall dense swept dark hair, white crew-neck T-shirt, and open charcoal overshirt shown in both references
Style/medium: natural high-resolution studio portrait photography matching both supplied portraits exactly
Composition/framing: square 1280 by 1280 canvas; interpolate camera distance, body scale, head scale, shoulder placement, and crop at three quarters (75%); target visible-subject bounds are approximately x=72..1218, y=110..1280 on the 1280 canvas; keep the torso touching the bottom canvas edge; do not zoom or recenter independently
Required pose: start from moderate left-facing three-quarter yaw with upward pitch and gaze and move exactly three quarters (75%) toward forward-facing head pitched upward with upward gaze; preserve monotonic motion with no overshoot, reversal, extra yaw, extra pitch, or endpoint duplication
Required continuity: hair crown height, side volume, sweep, glasses rims, nose, jaw, beard outline, ear visibility, neckline, collar tips, shoulder width, and shirt seams must progress smoothly; no abrupt crease, breathing scale, camera jump, or body-framing change
Required clothing construction: chest pocket remains on screen-right; visible button placket and both visible dark buttons remain on screen-left; never mirror, swap, duplicate, remove, or relocate these details
Constraints: exactly one person; output a single complete portrait; preserve identity, wardrobe, lighting, texture, and bottom crop; output only the flat #FF00FF background behind the subject
Avoid: double exposure; dissolved or blended faces; ghosting; duplicated glasses; warped rims; extra or missing buttons; extra or missing pocket; mirrored shirt; endpoint pose instead of the requested fraction; pose overshoot; altered identity; low or narrow crown; abrupt hair notch; face/body scale drift; shoulder drift; recentering; white, black, gray, transparent, patterned, or checkerboard background; text; logo; watermark
```
