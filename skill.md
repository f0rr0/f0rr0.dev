# Skill: React Three / Three.js / R3F / Scroll + DOM

Purpose
- Build accessible, SEO-friendly websites that progressively enhance into cinematic WebGL experiences.
- Mix DOM and 3D without sacrificing layout, accessibility, or performance.

How to use this skill
- `skills/react-three/overview.md` for architecture, mental models, and core primitives.
- `skills/react-three/scroll.md` for scroll rigs, DOM tracking, and multi-view layouts.
- `skills/react-three/nextjs.md` for Next.js integration patterns and client boundaries.
- `skills/react-three/animation.md` for transitions and animation stacks (GSAP, Motion, Theatre.js, react-spring).
- `skills/react-three/performance.md` for performance scaling and scene optimization.

Quick principles
- Progressive enhancement first: HTML and CSS are the baseline; WebGL is optional.
- Prefer a single shared WebGL canvas across routes.
- DOM is the layout source of truth; WebGL tracks DOM proxies.
- Scroll is a timeline; keep scroll and rendering in sync.
- Optimize early: reduce draw calls, reuse resources, render on demand.

Primary sources
- R3F docs: Canvas, hooks, animations, performance.
- Drei docs: ScrollControls and View.
- three.js manual: optimizing large scenes.
- 14islands blog and r3f-scroll-rig README.
- Next.js docs: client components and dynamic import.
- Animation stacks: GSAP ScrollTrigger, Theatre.js, Motion, react-spring.
