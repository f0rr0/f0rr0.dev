# V13 transition-generation prompts

The 39 regenerated cells on 13 edges with a vertical component were produced by high-quality `gpt-image-2` edit jobs that rendered all three intermediate poses together as one `3072×1024` strip. Images 1 and 2 were the V13 subject endpoints. For 12 accepted edges, Image 3 was a five-frame strip assembled from the original reference site's start, 25%, 50%, 75%, and end poses and was authoritative only for pose and pacing. The accepted right-to-bottom-right strip used only its two Sid endpoints after the external pose strip repeatedly caused overshoot.

The prompt below each regenerated edge is the final accepted joint-strip prompt. Four edges use their earlier strip's more readable 25% and 50% panels plus the final prompt's endpoint-safe 75% panel; `PROVENANCE.json` records the exact source-strip hash chosen for every panel. Nine cells were retained from the previous accepted generation: six pure-horizontal center-to-left/right cells plus the stable left-to-top-left triplet.

The corrected top and bottom endpoints were generated separately. No API key or secret is stored in this archive.

## Corrected top endpoint

- Model: `gpt-image-2`
- Quality: `high`
- Output: `1280×1280`
- References: prior top, center, top-right, top-left, and original-reference top pose

```text
Use case: identity-preserve
Asset type: single compass-pose portrait endpoint
Input images:
- Image 1: authoritative current TOP portrait of Sid. Preserve this exact person, hair volume and silhouette, sunglasses, beard, clothing construction, body scale, crop, lighting, and rendering style; replace only the insufficient upward head pitch and gaze.
- Image 2: authoritative CENTER portrait of Sid for exact frontal yaw, centered alignment, identity, body framing, and scale.
- Image 3: authoritative TOP-RIGHT portrait of Sid for identity, hair, clothing, and diagonal upward-pitch context.
- Image 4: authoritative TOP-LEFT portrait of Sid for identity, hair, clothing, and symmetric diagonal upward-pitch context.
- Image 5: original-site TOP pose reference featuring another person. Copy only its pure vertical head pitch, upward gaze, frontal yaw, and landmark geometry. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Regenerate Sid's TOP endpoint as the true 100% pure-up compass pose. Keep yaw exactly 0° and roll exactly 0° so the nose, philtrum, chin, and sternum remain on one vertical centerline. Apply a clearly stronger upward head pitch and gaze than both diagonal portraits in Images 3 and 4, matching the pose mechanics of Image 5. The underside of the chin should become more visible, the chin-to-collar gap should open naturally, the lenses should tilt consistently with the upward head angle, and the visible forehead/crown relationship should change naturally. This must read unmistakably as UP at 120×120, not as center or either diagonal.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered on a 1280×1280 square canvas. Match the shoulder position, subject scale, torso framing, and crop of Images 1 and 2. Keep the torso upright and front-facing; only the head pitch and eye direction change.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the exact round sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement; preserve realistic anatomy; no yaw; no body lean; no zoom; no expression change; no clothing-side swaps; no extra subject; no text; no watermark.
```

## Corrected bottom endpoint

- Model: `gpt-image-2`
- Quality: `high`
- Output: `1280×1280`
- References: prior bottom, center, bottom-right, bottom-left, and original-reference bottom pose

```text
Use case: identity-preserve
Asset type: single compass-pose portrait endpoint
Input images:
- Image 1: authoritative current BOTTOM portrait of Sid. Preserve this exact person, hair volume and silhouette, sunglasses, beard, clothing construction, body scale, crop, lighting, and rendering style; replace only the insufficient head pitch and gaze.
- Image 2: authoritative CENTER portrait of Sid for exact frontal yaw, centered alignment, identity, body framing, and scale.
- Image 3: authoritative BOTTOM-RIGHT portrait of Sid for identity, hair, clothing, and the maximum diagonal downward-pitch context.
- Image 4: authoritative BOTTOM-LEFT portrait of Sid for identity, hair, clothing, and symmetric diagonal downward-pitch context.
- Image 5: original-site BOTTOM pose reference featuring another person. Copy only its pure vertical head pitch, downward gaze, frontal yaw, and landmark geometry. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Regenerate Sid's BOTTOM endpoint as the true 100% pure-down compass pose. Keep yaw exactly 0° and roll exactly 0° so the nose, philtrum, chin, and sternum remain on one vertical centerline. Apply a clearly stronger downward head pitch and gaze than both diagonal portraits in Images 3 and 4, matching the pose mechanics of Image 5. The crown and upper forehead should become more visible, the lenses should tilt consistently with the downward head angle, the nose should point downward, and the chin-to-collar gap should compress naturally. This must read unmistakably as DOWN at 120×120, not as center or either diagonal.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered on a 1280×1280 square canvas. Match the shoulder position, subject scale, torso framing, and crop of Images 1 and 2. Keep the torso upright and front-facing; only the head pitch and eye direction change.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the exact round sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement; preserve realistic anatomy; no yaw; no body lean; no zoom; no expression change; no clothing-side swaps; no extra subject; no text; no watermark.
```

## center → top

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/top.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-top.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to top. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: PURE VERTICAL PATH. Keep yaw exactly 0° and roll exactly 0° in all three panels; face stays perfectly front-facing and centered. Panel 1: chin and gaze subtly upward, about one quarter of the final pitch. Panel 2: chin and gaze clearly upward, exactly halfway. Panel 3: chin and gaze strongly upward, three quarters. Nose, philtrum, chin, and sternum remain on one vertical centerline.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## center → top-right

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/top-right.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-top-right.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to top-right. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-right with mild upward pitch. Panel 2: yaw 16° toward screen-right with medium upward pitch. Panel 3: yaw 24° toward screen-right with stronger upward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## center → bottom-right

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/bottom-right.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-bottom-right.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to bottom-right. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-right with mild downward pitch. Panel 2: yaw 16° toward screen-right with medium downward pitch. Panel 3: yaw 24° toward screen-right with stronger downward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## center → bottom

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/bottom.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-bottom.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to bottom. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: PURE VERTICAL PATH. Keep yaw exactly 0° and roll exactly 0° in all three panels; face stays perfectly front-facing and centered. Panel 1: chin and gaze subtly downward, about one quarter of the final pitch. Panel 2: chin and gaze clearly downward, exactly halfway. Panel 3: chin and gaze strongly downward, three quarters. Nose, philtrum, chin, and sternum remain on one vertical centerline.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## center → bottom-left

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/bottom-left.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-bottom-left.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to bottom-left. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-left with mild downward pitch. Panel 2: yaw 16° toward screen-left with medium downward pitch. Panel 3: yaw 24° toward screen-left with stronger downward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## center → top-left

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/center.webp`, `public/resume/face-motion/v13/top-left.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/center-top-left.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for center to top-left. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-left with mild upward pitch. Panel 2: yaw 16° toward screen-left with medium upward pitch. Panel 3: yaw 24° toward screen-left with stronger upward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## top → top-right

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/top.webp`, `public/resume/face-motion/v13/top-right.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/top-top-right.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for top to top-right. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-right with very strong upward pitch. Panel 2: yaw 16° toward screen-right with medium-strong upward pitch. Panel 3: yaw 24° toward screen-right with strong upward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## top-right → right

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/top-right.webp`, `public/resume/face-motion/v13/right.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/top-right-right.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for top-right to right. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Keep yaw steadily at about 32° toward screen-right. Panel 1: strongly upward pitch. Panel 2: medium upward pitch. Panel 3: mildly upward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## right → bottom-right

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/right.webp`, `public/resume/face-motion/v13/bottom-right.webp`
- Pose/pacing reference: none; endpoint-only regeneration

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: exact START portrait of Sid looking right at 0%.
- Image 2: exact END portrait of Sid looking bottom-right at 100%.

Primary request: Generate Sid at exactly 25%, 50%, and 75% of the small head-pitch change from Image 1 to Image 2. The yaw is already nearly the same in both endpoints and must remain inside their actual yaw envelope. The total downward pitch change is intentionally subtle. Use only the real angular difference visible between Images 1 and 2; do not invent a larger bottom-right pose.

Panel 1 must be one quarter of the endpoint pitch delta, panel 2 exactly halfway, and panel 3 three quarters. The lens-to-ear height, crown/forehead exposure, nose angle, and chin-to-collar gap must each advance monotonically in three small equal steps. Every value in every panel must remain between its value in Images 1 and 2. Panel 3 must still be visibly less downward than Image 2. No panel may equal or exceed the end pose.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel. Match the endpoint camera distance, shoulder position, head scale, torso framing, placement, and bottom crop. Only the small head pitch and eye direction should progress.

Constraints: preserve Sid's exact identity, full dense side hair, sunglasses, beard, dark overshirt, white T-shirt, screen-right pocket, screen-left placket and buttons, lighting, texture, and anatomy; no morphing; no clothing-side swap; no zoom; no body lean; no expression change; no watermark.
```

## bottom-right → bottom

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/bottom-right.webp`, `public/resume/face-motion/v13/bottom.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/bottom-right-bottom.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for bottom-right to bottom. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 24° toward screen-right with moderate downward pitch. Panel 2: yaw 16° toward screen-right with medium-strong downward pitch. Panel 3: yaw 8° toward screen-right with strong downward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## bottom → bottom-left

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/bottom.webp`, `public/resume/face-motion/v13/bottom-left.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/bottom-bottom-left.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for bottom to bottom-left. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Panel 1: yaw 8° toward screen-left and strong downward pitch. Panel 2: yaw 16° toward screen-left and medium-strong downward pitch. Panel 3: yaw 24° toward screen-left and moderate downward pitch.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## bottom-left → left

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/bottom-left.webp`, `public/resume/face-motion/v13/left.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/bottom-left-left.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for bottom-left to left. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Keep yaw fixed at exactly 32° toward screen-left in all panels. Panel 1: chin and gaze 15° below level. Panel 2: chin and gaze 10° below level. Panel 3: chin and gaze 5° below level. These three pitch angles must be visibly distinct even at 120×120: the lens height relative to the ears, visible forehead area, nose angle, and chin-to-collar gap must advance by equal increments. Reject any result where panels 1 and 2 look alike or panel 3 carries most of the pitch change.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## top-left → top

- Model: `gpt-image-2`
- Quality: `high`
- Output: one `3072×1024` strip with three `1024×1024` panels
- Subject references: `public/resume/face-motion/v13/top-left.webp`, `public/resume/face-motion/v13/top.webp`
- Pose/pacing reference: `tmp/imagegen/face-motion-reference-parity/graded-sequences/reference-strips/top-left-top.png`

```text
Use case: identity-preserve
Asset type: three-frame portrait animation sprite strip
Input images:
- Image 1: authoritative START portrait of Sid at 0%. Preserve this exact person, hair volume and silhouette, sunglasses, facial hair, clothing construction, body scale, crop, lighting, and rendering style.
- Image 2: authoritative END portrait of Sid at 100%. Preserve this exact person and endpoint pose target, with the same invariants as Image 1.
- Image 3: authoritative five-frame POSE AND PACING reference strip from another person, ordered START 0%, STEP 1 25%, STEP 2 50%, STEP 3 75%, END 100%. Copy only its head rotation, vertical head pitch, eye direction, and evenly graded progression. Do not copy its identity, face, hair, glasses, expression, clothing, monochrome treatment, or framing.

Primary request: Render Sid from Images 1 and 2 at the three missing intermediate poses for top-left to top. The three panels must be visibly and monotonically graded at exactly 25%, 50%, and 75% of the motion demonstrated by Image 3. Each panel must advance by one equal quarter-step from the previous pose. No two panels may have the same head pitch, gaze elevation, lens perspective, or chin angle. Where the path changes yaw, no two panels may have the same yaw or nose/ear relationship; on a pure vertical path, yaw must instead remain exactly zero. Avoid front-loading the motion in panel 1 or postponing it until panel 3.

Mandatory per-panel pose plan: Keep strong upward pitch throughout. Panel 1: yaw exactly 24° toward screen-left. Panel 2: yaw exactly 16° toward screen-left. Panel 3: yaw exactly 8° toward screen-left. The nose-to-center offset, far-lens width, visible cheek width, and ear visibility must change by equal increments. These yaw differences must remain obvious at 120×120. Reject any result where panels 1 and 2 look alike or panel 3 carries most of the yaw change.

Hard endpoint envelope (higher priority than any approximate angle language above): Image 1 is the exact 0% pose and Image 2 is the exact 100% pose for Sid. Rescale all yaw and pitch magnitudes to those actual endpoints. Panel 1 must be exactly one quarter of the way from Image 1 to Image 2, panel 2 exactly halfway, and panel 3 exactly three quarters. Every intermediate yaw, pitch, gaze, lens perspective, nose offset, ear visibility, and chin angle must remain strictly between the corresponding values in Images 1 and 2. Never overshoot either endpoint. Panel 1 must not repeat Image 1, panel 3 must not equal or exceed Image 2, and the transition from panel 3 to Image 2 must continue in the same direction without snapping back.

Output geometry: one 3072×1024 horizontal sprite strip split into exactly three equal 1024×1024 panels. Panel 1 is 25%, panel 2 is 50%, panel 3 is 75%. Place panel boundaries exactly at x=1024 and x=2048. No gutters, borders, dividers, labels, text, repeated panels, or extra subjects.

Scene/backdrop: perfectly flat solid #ff00ff chroma-key background in every panel, with no shadows, gradients, texture, floor plane, or lighting variation. Do not use #ff00ff in the subject.

Composition/framing: exactly one waist-up Sid portrait centered in each square panel; keep shoulder position, subject scale, torso framing, canvas position, and crop consistent across all three panels and matched to Images 1 and 2. Only the head pose and eye direction should progress.

Constraints: preserve Sid's identity and facial proportions; preserve the full dense side hair volume without flattening or abrupt creases; preserve the same sunglasses, beard, dark overshirt, white T-shirt, pocket and button placement in every panel; preserve realistic anatomy; no morphing; no clothing-side swaps; no zoom; no body lean; no expression change; no watermark. The progression in Image 3 is absolute pose authority and must remain visibly readable when the panels are viewed in sequence.
```

## Retained stable cells

The six pure-horizontal cells below and the three stable `left` → `top-left` cells were not regenerated in the accepted graded-axis set. The latter remain byte-for-byte identical to the pre-pass release; newer attempts were rejected for pitch overshoot or yaw drift.

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
