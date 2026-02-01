# React Three / three.js Overview

Goal
- Ship WebGL-heavy sites that still work as fast, accessible HTML pages.
- Treat WebGL as enhancement, not the only UI layer.

Core primitives (R3F)
- <Canvas> is the entry point into three.js and the root of the scene graph.
- Canvas props that matter for site work:
  - frameloop: "always" (default), "demand" (render only when needed), "never".
  - dpr: device pixel ratio, can be a range [min, max].
  - fallback: DOM fallback if WebGL is unsupported.
  - eventSource/eventPrefix: route pointer events when canvas is layered under/over DOM.
- Defaults: R3F creates a WebGLRenderer with antialias, alpha, and high-performance powerPreference.

Hooks discipline
- useFrame runs on every render; keep it lightweight and do not set React state in it.
- useThree gives access to renderer, scene, camera, size, viewport, performance, and helpers like invalidate().
- Hooks only work inside <Canvas> because they depend on R3F context.

Progressive enhancement (14islands approach)
- Server-render all content; make WebGL optional.
- Keep text in DOM for accessibility and SEO.
- Use WebGL to replace/enhance images or cards rather than render everything as textures.

Global canvas pattern
- Use a single, shared WebGL canvas that stays mounted across route changes.
- Portals (View or UseCanvas) let any component contribute 3D content without owning a canvas.
- This keeps layout modular while avoiding multiple WebGL contexts.

DOM-proxy tracking
- Track DOM elements (proxy nodes) and sync 3D objects to their bounds/position.
- This keeps DOM as the layout source of truth and avoids reimplementing layout in WebGL.

Accessibility tradeoffs
- Smooth/virtual scroll can reduce jank and improve scroll-linked animations, but can hurt accessibility.
- Only use virtual scroll when the experience needs it; keep native scroll when possible.
