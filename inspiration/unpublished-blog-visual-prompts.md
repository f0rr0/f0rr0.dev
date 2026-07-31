# Visual prompts for the unpublished posts

These are short base prompts to paste into `gpt-image-2`. They follow OpenAI's [GPT Image Generation Models Prompting Guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide): intended use first, then scene, subject, details and explicit constraints. They are deliberately short so the first result is easy to steer with one-change follow-ups.

## Shared direction, not a house-style prison

- Use generated images for mood and metaphor. Use real screenshots for product comparisons, and Mermaid/SVG for labels, protocols, timings and measured data.
- Default texture: loose pen or graphite marks on off-white paper, imperfect lines, plenty of breathing room, one dark ink plus one or two accent colours.
- Avoid glossy 3D, neon futurism, stock-illustration people, fake UI text, decorative circuitry, logos, watermarks and visual clutter.
- Do not ask an image model to render a factual graph. Plot the real values in code, then borrow the paper, ink and colour treatment.

## Graph or diagram restyle

Render the verified graph or Mermaid diagram first and attach it as Image 1. This edit prompt uses the guide's “change only X; preserve everything else” pattern:

> Editorial diagram edit. Change only the rendering style of Image 1 to loose black-ink lines on warm off-white paper with one muted accent colour and slight hand-drawn irregularity. Preserve every word, number, axis, arrow, node, connection, order and relative position exactly. No new text, no missing marks, no watermark, no decorative objects.

## Reviving My Website After 7 Years, 7 Months, and 7 Days

**Use real material:** place an old-site screenshot beside the rebuilt page. Add a small, code-drawn timeline for 23 December 2018, the archived build, the April 2026 domain change and the July 2026 rebuild.

**Optional opening illustration — 3:2 landscape**

> Editorial blog illustration. On an off-white desk, an old browser window sits under a thin layer of dust while a fresh, sparse page is being redrawn beside it. The old side feels like a slightly faded photocopy; the new side is loose graphite with one warm-ochre mark, uneven human lines, quiet afternoon mood, generous negative space. No logos, no readable text, no glossy UI, no photorealism.

## Reverse Engineering Meta’s Messaging Protocol

**Use an exact diagram:** Mermaid for WebSocket → MQTT dialect → Thrift Compact → snapshot/delta state. Keep packet names in the article, not in generated art.

**Optional section break — 16:9 landscape**

> Technical editorial spot illustration. A single red packet travels through four translucent protocol layers like sheets in an engineer's notebook, ending in a small chat bubble assembled from fragments. Blue carbon-paper marks with one signal-red pencil accent, sparse annotations made only of dots and short strokes. No logos, no legible text, no cyberpunk glow, no polished infographic.

## How a Chromium Browser Is Built

**Use an exact diagram:** a compact build-time/runtime split in Mermaid. If a build-time graphic is added later, plot only measurements actually captured and label POC versus shipped work.

**Optional header — 3:2 landscape**

> Editorial engineering illustration. A browser is opened like a mechanical watch, with a few labelled-looking but unreadable layers being carefully lifted out while the central engine stays intact. Faint blueprint grid, scratchy cobalt pencil and one burnt-orange grease-pencil mark, precise enough to feel technical but visibly hand drawn. No brand marks, no tiny text, no 3D render, no excessive parts.

## Building Semantic Image Search at Memorang

**Use an exact diagram:** query text branching into a typed metadata filter and vector search, then rejoining before ranking. Do not illustrate Fitzpatrick types as colours inferred from faces; the article explicitly treats them as controlled, human-assigned metadata.

**Optional opening illustration — 3:2 landscape**

> Editorial search illustration. A librarian's hand passes a loose cloud of image cards through two simple gates—one shaped like a checklist, one like a field of nearby dots—and receives a small relevant set. Cut-paper cards, graphite arrows and muted teal rubber-stamp dots with one mustard tab, thoughtful rather than futuristic. No faces, no medical claims, no readable labels, no glowing AI brain.

## ZeroClaw Decides What’s for Lunch

**Use a synthetic transcript:** typeset the short redacted exchange in HTML or MDX. Pair it with a small exact permit-flow diagram if the prose still needs one.

**Optional opening illustration — 4:3 landscape**

> Warm editorial doodle. A family dining table, a phone with abstract message marks, a pantry notebook and a cooking pot are joined by one slightly tangled line that becomes tidy near the notebook. Loose charcoal with a leaf-green pencil and one tomato-red watercolour wash, imperfect domestic sketch, calm and lightly funny. No real people, no readable chat text, no logos, no robot character.

**Optional pantry illustration — 3:2 landscape**

> Rough ink-and-pencil cutaway of a pantry shelf beside a phone camera frame and a grocery-order receipt; a few hand-drawn arrows turn tomatoes, capsicum and lentils into three small states: present, uncertain, gone. Off-white paper, charcoal linework, one spinach-green wash and tiny tomato-red accents, observational weekend-sketchbook energy. Keep it sparse and domestic, not a polished product diagram. No logos, no readable app UI, no robot, no neon.

## I Let an AI Agent Take Over My Hinge

**Use a factual visual:** a small code-drawn boundary graphic showing recommendations in, private review, optional draft, and no automatic like/send. Do not use real profile photographs or conversations.

**Optional header — 3:2 landscape**

> Wry editorial line drawing. A short queue of anonymous profile cards reaches a small writing desk where a human still holds the pen; a machine only organises the cards beside them. Two-colour risograph in charcoal black and dusty pink, slightly misregistered ink, one deliberately awkward card leaning sideways, lots of empty space. No app logo, no real faces, no readable text, no hearts explosion, no glossy dating-ad style.

## I Sent an AI Agent to Wait in Line for Me

**Use an exact visual:** keep the watcher state progression in text/Mermaid and, if useful, add a tiny timeline showing that checks pause while the laptop is asleep and resume when it wakes.

**Optional opening illustration — 3:2 landscape**

> Restrained editorial sketch. A person leaves a long, faint appointment queue while a small clockwork note-holder keeps their place and raises a paper flag when one slot opens. Blue ballpoint drawn on a lightly creased appointment slip with a single marigold-yellow highlighter mark, everyday Indian urban mood, understated humour. No robots, no logos, no readable text, no surreal machinery, no polished vector art.
