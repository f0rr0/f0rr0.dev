# Scroll Rigs and DOM Tracking

ScrollControls (Drei)
- ScrollControls creates an HTML scroll container layered with the canvas.
- pages controls scroll length; damping controls how quickly scroll eases.
- horizontal and infinite flip the axis or enable looping when needed.
- Use <Scroll> for 3D content and <Scroll html> for DOM overlays that move in sync.
- useScroll returns scroll state: offset, delta, range(), curve(), visible().

Multi-view layouts (Drei View)
- View uses gl.scissor and gl.viewport to render multiple views inside a single canvas.
- Each View is tied to a DOM element, so the viewport tracks real layout.
- Works well for cards, galleries, and product tiles without extra canvases.

Progressive enhancement scroll rig (r3f-scroll-rig)
- GlobalCanvas mounts one shared canvas and keeps it alive across routes.
- SmoothScrollbar (Lenis) keeps DOM scroll and WebGL tracking in lockstep.
- UseCanvas tunnels 3D content into the global canvas from any component.
- ScrollScene (or useTracker) tracks a DOM element and gives you size/position in 3D.
- Tracking uses DOM measurements (getBoundingClientRect) and observers to stay updated.

Which scroll system to pick
- ScrollControls: best when the scroll container and timeline are the core experience.
- r3f-scroll-rig: best when you are enhancing a traditional DOM website.

Known pitfalls
- Multiple canvases can hit WebGL context limits and complicate resource sharing.
- Virtual scrolling can reduce accessibility and break native behaviors.
- Make sure pointer events target the correct DOM node when canvas is layered.
