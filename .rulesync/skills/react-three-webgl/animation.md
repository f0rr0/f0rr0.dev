# Transitions and Animation Stacks

Pick the right tool
- Theatre.js: timeline authoring and art-directed animation for 3D scenes.
- GSAP ScrollTrigger: scroll-driven timelines, pinning, and scrubbed sequences.
- Motion (Framer Motion): UI transitions, layout/route transitions, and scroll-linked values.
- react-spring: physics-based motion directly on R3F objects.

GSAP ScrollTrigger essentials
- Define a trigger element with start/end positions to control an animation.
- scrub ties animation progress directly to scroll.
- pin locks elements in place while the scroll timeline advances.
- snap creates snapping points for scroll progress.
- toggleActions controls play/pause/reverse behavior on enter/leave.

Theatre.js with R3F
- Install @theatre/core, @theatre/studio, and @theatre/r3f.
- Initialize the studio and extend it with the R3F extension.
- Use SheetProvider to scope animations and getProject to load sheets.
- Mark objects as editable with the editable (e.) helper from @theatre/r3f.
- Use the Theatre R3F camera (PerspectiveCamera) when you want editable camera rigs.

Motion (Framer Motion)
- Use motion components with initial/animate/exit for page and section transitions.
- whileInView triggers animations when elements enter the viewport.
- useScroll returns scroll progress values; combine with useTransform and useSpring.
- AnimatePresence enables exit animations for route transitions.

react-spring + R3F
- Install @react-spring/three and wrap meshes/materials with animated().
- useSpring returns animated values and an api for imperative updates.
- api.start lets you update springs without a React re-render.
- Use the precision config for smoother values when syncing to other systems.
