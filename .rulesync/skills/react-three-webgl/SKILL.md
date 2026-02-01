---
name: react-three-webgl
description: Build scroll-driven WebGL + DOM sites with React Three Fiber and three.js, with progressive enhancement, Next.js integration, and animation stacks.
targets: ["codexcli"]
user-invocable: false
---

# React Three / three.js / R3F / Scroll + DOM

Purpose
- Build accessible, SEO-friendly websites that progressively enhance into cinematic WebGL experiences.
- Mix DOM and 3D without sacrificing layout, accessibility, or performance.

How to use this skill
- Start with [overview.md](./overview.md) for architecture, mental models, and core primitives.
- Use [scroll.md](./scroll.md) for scroll rigs, DOM tracking, and multi-view layouts.
- Use [nextjs.md](./nextjs.md) for Next.js integration patterns and client boundaries.
- Use [animation.md](./animation.md) for transitions and animation stacks (GSAP, Motion, Theatre.js, react-spring).
- Use [performance.md](./performance.md) for performance scaling and scene optimization.

Quick principles
- Progressive enhancement first: HTML and CSS are the baseline; WebGL is optional.
- Prefer a single shared WebGL canvas across routes.
- DOM is the layout source of truth; WebGL tracks DOM proxies.
- Scroll is a timeline; keep scroll and rendering in sync.
- Optimize early: reduce draw calls, reuse resources, render on demand.
