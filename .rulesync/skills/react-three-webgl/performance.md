# Performance and Scaling

Render strategy
- Use <Canvas frameloop="demand"> to render only when needed.
- Call invalidate() when state changes to request a frame.
- Keep useFrame logic minimal; do not trigger React state from it.

Adaptive performance (R3F)
- R3F exposes a performance object with current/min/max/debounce.
- Use regress() to temporarily lower performance after interactions.
- Combine adaptive performance with a dpr range to scale quality on weaker devices.

Scene optimization
- Reuse geometries and materials across instances to reduce GPU memory.
- Use instancing for repeated meshes to cut draw calls.
- Merge static geometry when possible; each mesh is a draw call in three.js.
- Use texture compression and limit shadow-casting lights.

Asset loading
- Use Suspense to show fallbacks while assets load.
- Preload large assets early when the experience needs instant transitions.
