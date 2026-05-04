# WebGL Migration Analysis — 2026-05-04

## Question

Is it worth moving the renderer from Canvas2D to WebGL?

## Short answer

**Not yet.** The Canvas2D path has plenty of headroom left, the migration cost is enormous, and we don't yet have a feature requirement that forces it. Revisit if the game ever needs > 2-3K simultaneous particles or hits a frame-budget wall the Canvas2D optimizations can't clear.

## What we render today

Quick audit of the rendering surfaces, in roughly hot-to-cold order:

| Surface | Canvas2D ops | Notes |
|---|---|---|
| Particles | `drawImage` (sprites for flash/ember), `arc`+`stroke` (rings), `arc`+`fill` (small dots), `stroke`+`fill` (shrapnel) | After 5.60.0 sprite bake, render is mostly `drawImage`. Composite-batched in 5.61.0. |
| Asteroid wireframes | `moveTo`/`lineTo` polylines, hue-bucketed strokes | 12 vertices × ~30 edges per asteroid, projection-staggered (5.61.0). |
| Enemies | Per-type custom shape: arcs, paths, gradients, optional shadowBlur | 6-15 draw calls per enemy depending on type. |
| Bullets | Cached glow sprite (`glowSpriteCache.draw`) | One `drawImage` per bullet. |
| Background stars | Depth-bucket batched (one fillStyle per bucket, single path with `arc`+`fill`) | Already near-optimal for Canvas2D. |
| Lens flare nebula | Pre-baked offscreen layers, one `drawImage` per layer with parallax + rotation | Already optimal. |
| HUD / shop / UI | Text, gradients, paths | Not particularly hot. |
| Wave intro / title launch | `drawWavyText` per-character, gradient fills | Brief, not perf-critical. |

The hot frame is dominated by particles + asteroids + enemies + bullets. After the 5.60-5.61 perf pass the per-particle cost is approaching the Canvas2D floor (one `drawImage` for sprites + composite/alpha state changes batched per group).

## Where Canvas2D wins right now

- **Already-paid optimizations** — sprite caching, depth-bucket batching, composite batching, projection stagger, AI throttling. Combined this is approximately 60% off the pre-pass baseline, and the engine is now sustaining 60fps in late-wave dense scenes.
- **High-level APIs we lean on** — `createRadialGradient` (still cheap once cached as a sprite), `fillText` for the entire HUD + wave/title text, `setLineDash` for orbit rings, `shadowBlur` (kept only inside the baked sprites, not on the live frame). All of these would have to be re-implemented on top of WebGL primitives.
- **No driver-level surprises** — Canvas2D performs predictably across the desktop browsers we target. No shader compile failures, no extension fragmentation, no GPU-feature gating.
- **Easy debugging** — every draw is observable in DevTools and can be replayed via the Canvas inspector. Stack traces from inside `draw()` are useful immediately.
- **Mobile / low-end fallback** — Canvas2D on weak GPUs (integrated graphics, older iPads) often beats WebGL because WebGL forces per-frame state changes, command-buffer flushes, and texture uploads that the Canvas2D backend amortizes.

## Where WebGL would win

These are real wins, just not ones we currently need:

- **Massive particle counts.** 10k+ point sprites become trivial via instanced quads. Today we cap at 600 active particles and that's already comfortable. If we ever wanted screen-filling effects (huge nova waves, debris fields covering the whole canvas), WebGL is the obvious path.
- **Per-pixel effects.** Bloom, distortion, post-process chromatic aberration, screen-space shaders. Currently impossible (or very expensive) on Canvas2D. We don't use any of these today.
- **Custom blend modes.** Anything beyond `source-over` / `screen` / `lighter`. Not needed today.
- **Float framebuffers.** HDR tonemapping, fancy emissive blending. Not in scope.
- **Cross-platform consistency at the texel level.** Useful for pixel-perfect retro looks; not how this game renders.

## Migration cost — what we'd actually have to do

Realistic scope of a WebGL rewrite (high estimate, conservative):

- **Renderer foundation** — vertex buffers, attribute layouts, shader program management, uniform plumbing, texture atlases, batched draw calls, framebuffer setup. Plus a Canvas2D fallback for unsupported browsers. About a week of focused work just to get a colored quad on screen.
- **Sprite atlas** — every entity texture (player ship, enemies, asteroids if rasterized, particles, HUD icons) gets baked into a texture atlas. Currently we have ~40 distinct entity visuals. Each needs an atlas slot + UV mapping.
- **Particle system port** — convert each particle type's draw path to instanced rendering. Particles are already mostly sprite-driven so this is the smallest lift, maybe 2-3 days. The rendering would be near-zero-cost compared to today.
- **Wireframe rendering** — asteroids, enemy shape silhouettes, and shape debris are all polyline-based. Either rasterize them once into atlas sprites (loses the dynamic 3D rotation) or implement a line-drawing shader. Significant work either way; ~3-5 days.
- **Text rendering** — Canvas2D `fillText` doesn't translate to WebGL. Options: bake every glyph to an MSDF atlas (best-quality solution, several days), or render text via an offscreen Canvas2D layer composited on top of the WebGL output (simpler but loses the GPU benefits for HUD-heavy scenes).
- **Gradient handling** — we use `createLinearGradient` and `createRadialGradient` in many places (HUD bars, wave intro, weapon effects). Each needs to be converted to either a baked texture or a fragment-shader gradient.
- **HUD / shop overlays** — the simplest path is to keep them on a Canvas2D context layered on top of the WebGL canvas. Works fine but the shop hot reload + DOM-based shop overlay would need re-validation.
- **Touch every entity's `draw()` method** — every single one needs a WebGL backend and a corresponding Canvas2D fallback (or a polished `if (this.useWebGL)` branch in each).
- **Test re-validation** — all 92 QA tests, all 60+ E2E tests, all perf tests would need to pass against the new pipeline. Several Playwright tests inspect canvas pixel data — those assertions might break or need new tolerances.

**Realistic timeline**: 4-6 weeks of focused work for a confident, fully-tested migration. Maybe 2-3 weeks for a "WebGL renders particles, Canvas2D handles everything else" hybrid (which captures most of the perf win for far less risk).

## What we'd give up

- Anyone running an older Mac with discrete-GPU disabled, or on a low-power Chromebook, may see *worse* performance with WebGL (driver overhead vs Canvas2D's mature path).
- Tab-out / refocus glitches: WebGL contexts can be lost when the tab is hidden, the GPU driver crashes, or the OS reclaims VRAM. We'd need explicit context-loss recovery code.
- Bigger bundle / longer initial parse — shader source, atlas data, vertex buffer setup. Not huge but measurable at first paint.

## Recommendation

Stay on Canvas2D for now. We have several lighter-weight optimizations still available that move the cost downward without the migration risk:

1. **Adaptive particle quality** when FPS drops below a threshold (already on the perf plan, fail-safe). Lets us push the cap higher confidently.
2. **Sort particles by color within composite buckets** — small additional batching win.
3. **Bake more particle types as sprites** — `explosionShrapnel`'s head dot is a small white circle that could be a 16×16 sprite, marginal but free.
4. **Spatial-grid AI dodge** — covered by the AI throttle already, but would let the throttle relax in late waves.

If, after those, we still hit a wall — the **hybrid approach** (WebGL particles only, Canvas2D for everything else) is the next stop. It captures the biggest perf upside (particles are by far the most numerous draw target) for ~⅓ the migration cost.

Full WebGL is only worth it once we want effects that Canvas2D can't render at all: bloom, chromatic aberration, screen-space distortion, or actual 5K+ particle counts.

## Appendix: where the time actually goes (estimated)

For a typical late-wave frame at the current optimization level:

| Subsystem | Estimated frame share |
|---|---|
| Particle render | 25-35% |
| Asteroid wireframe render + projection | 15-20% |
| Enemy shape draw (custom paths per type) | 15-20% |
| Background stars (already batched) | 5% |
| Bullets (sprite-cached) | 3-5% |
| HUD + UI | 3-5% |
| AI logic (throttled) | 5-10% |
| Collision detection (spatial grid) | 5% |
| Misc (state, input, event) | 5-10% |

The biggest single lever is still particles (25-35% of the frame). A WebGL-only-for-particles hybrid would target that share specifically. If we want to chase the asteroid wireframes too — that needs a custom line shader and is much more work.
