# Next.js Integration (App Router)

Client boundaries
- Add "use client" at the top of files that need state, effects, event handlers, or browser APIs.
- R3F Canvas and anything that touches window/WebGL must live in a Client Component.

Lazy loading (next/dynamic)
- Use next/dynamic for component-level code splitting and to defer heavy WebGL modules.
- The ssr: false option only works inside Client Components, so wrap WebGL components with a client boundary.
- Use Suspense for loading fallbacks when lazily loading client components.

Canvas persistence across routes
- Keep <Canvas> mounted in a root layout so it survives route changes.
- Use View or UseCanvas to portal scene content from any page into the shared canvas.
- The react-three-next starter demonstrates this pattern and avoids unmounting the canvas on navigation.

DOM + WebGL composition
- Keep DOM as the layout source of truth; track elements for 3D alignment.
- Use Canvas eventSource when the canvas is layered behind the DOM.
