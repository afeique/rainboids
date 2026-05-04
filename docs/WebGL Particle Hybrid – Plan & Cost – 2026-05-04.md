# WebGL Particle Hybrid — Plan & Cost — 2026-05-04

This is the focused follow-up to `WebGL Migration Analysis – 2026-05-04.md`.
The full WebGL migration was estimated at 4-6 weeks. The "hybrid" path —
**WebGL for particles only, Canvas2D for everything else** — is the one
worth pricing out in detail, because particles are the single biggest
slice of the frame and the rest of the rendering pipeline is fine as-is.

## What we'd actually move to WebGL

After the 5.60-5.63 perf pass, the particle pool draws ~600 active sprites
per frame at peak (4 simultaneous enemy big-bangs + ambient activity). The
hot draw paths are:

| Particle type | Current renderer | Migrate? |
|---|---|---|
| `explosionEmber` | `glowSpriteCache.draw` (cached sprite drawImage) | YES — most numerous |
| `explosionFlash` | `radialGradientSpriteCache.get` + drawImage | YES — already sprite-shaped |
| `explosion` (classic) | `arc + fill` (small circle) | YES — trivial port |
| `explosionShrapnel` | `stroke (line) + arc + fill (head)` | YES — biggest visual conversion |
| `explosionRingColored` | `arc + stroke` (per-particle dynamic radius) | YES — needs scaled-quad sprite |
| `starSparkle` | small `arc + fill` with shrink | YES — trivial port |
| `explosionPulse`, `pickupPulse`, etc. | `arc + stroke` rings | Optional — low volume, can stay |
| `damageNumber`, `starBlip`, etc. | text + small shapes | Stay on Canvas2D — text especially |

The migration target: ~85% of per-frame particle draw calls.
Everything else stays on the current Canvas2D pipeline.

## The wins, quantified

### Per-particle render cost

| Path | Per-particle cost | Notes |
|---|---|---|
| Canvas2D `arc + fill` | ~3-5 µs | Includes path setup, fillStyle change, GPU rasterization |
| Canvas2D `drawImage` (cached sprite) | ~1-2 µs | Current path for flash + ember after 5.60.0 |
| WebGL instanced quad | **~50 ns** | Single VBO write per particle, one draw call for all |

At 600 particles per frame, that's:
- Pure Canvas2D `arc + fill`: ~2-3ms/frame on particles
- Sprite-cached Canvas2D (current): ~0.6-1.2ms/frame
- Instanced WebGL: ~0.03ms/frame

**Net win at the current 600 cap: ~0.5-1.2ms/frame back.** That's 3-7% of the 16.6ms 60fps budget. Useful but not transformational.

### The bigger win: cap headroom

The WebGL path is essentially free per-particle. At 5000 active particles:
- Canvas2D sprite-cached: ~5-10ms/frame (hits frame budget)
- WebGL: still ~0.25ms/frame

**Practical effect**: we can confidently raise `MAX_PARTICLES` to 3000-5000.
That unlocks design space we're currently blocked on:
- Screen-filling effects (huge nova waves, mass enemy deaths) without
  pool eviction surgery
- Persistent debris fields across waves
- Continuous environmental effects (pulsing nebula clouds, shooting stars)
- Multi-second after-glow trails that don't need aggressive lifetime caps

The frame-time win is real but small. **The product-design upside is the
real prize.** WebGL particles let us add big effects without
re-engineering the eviction policy every time.

### Eliminated rendering pitfalls

Several Canvas2D-specific problems just go away:
- No more eviction-driven inconsistency (the bug just fixed in 5.63.0).
  Pool can be sized for the worst case.
- No more `globalCompositeOperation` toggling cost. Each shader does its
  own additive blending in the fragment stage.
- No more `fillStyle` thrash. Color is a per-instance attribute, not a
  draw-state mutation.
- No more `createRadialGradient` allocations even for novel sprite types
  (would have to bake into the atlas, but that's a one-time cost).

## The cost, quantified

### Lines of code (estimated)

| Area | New code | Modified existing |
|---|---|---|
| `webgl-particle-renderer.js` (class, init, shaders, VBO mgmt, render) | ~500 | — |
| `webgl-particle-atlas.js` (bake sprite atlas at module load) | ~150 | — |
| GLSL vertex + fragment shaders (inline strings) | ~80 | — |
| `particle.js` — type-by-type fast paths and Canvas2D no-ops | — | ~50 |
| `pool-manager.js` / engine integration | — | ~30 |
| Visual-parity test scaffolding | ~150 | — |
| Perf benchmarks (mitata + Playwright) | ~100 | — |
| Context-loss recovery + Canvas2D fallback path | ~80 | — |
| **Total** | **~1060 LOC** | **~80 LOC** |

### Calendar time (focused engineer)

The estimate below assumes one engineer, ~6h focused day. Add 30-50% if
context-switching across other work.

| Phase | Scope | Days |
|---|---|---|
| 1. Foundation | WebGL canvas layer, shader pipeline, atlas, VBO ring, camera-uniform plumbing | 4-5 |
| 2. First particle (ember) | One type end-to-end + visual parity validation + benchmark | 1-2 |
| 3. Sprite-shaped types | flash, classic explosion, sparkle | 2-3 |
| 4. Dynamic types | shrapnel (streak with rotation), rings (scaled annulus) | 3-5 |
| 5. Cleanup | remaining types or document Canvas2D fallback; remove dead code | 2-3 |
| 6. Resilience | context-loss handling, browser detection, fallback path, polish | 2 |
| 7. QA + integration | re-run all 92 QA + 60+ E2E tests, fix regressions, perf validation | 2-3 |
| **Total** | | **16-23 days** |

That's **3-5 calendar weeks** for a confident, fully-tested hybrid. Aim
for the higher end — these things always have surprises.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Visual parity drift (lines vs sprite-quad streaks look subtly different) | High | Side-by-side screenshot test in CI; tune sprite atlas after the first port |
| WebGL context loss on tab/refocus or GPU reset | Medium | `webglcontextlost` listener; rebuild atlas + VBOs on `webglcontextrestored`; Canvas2D fallback for the few frames in between |
| Mobile / low-end perf variance | Medium | WebGL detection at startup; if `failIfMajorPerformanceCaveat` flags software rendering, fall back to Canvas2D |
| Playwright tests asserting canvas pixels break | Medium | Visual-regression budget per test; tolerance settings; screenshot diff baselines updated as part of the migration |
| Bundle size growth | Low | ~5-10KB compressed (shader source + atlas builder). Negligible. |
| Atlas memory (texture VRAM) | Low | 1024×1024 RGBA atlas = 4MB VRAM. Cheap on any device that supports WebGL. |
| Bug regressions in particle behavior (lifetime, decay, motion) | Medium | Particle update logic stays unchanged — WebGL only replaces `draw()`. Update tests catch motion regressions. |

### What we'd give up

- **Some visual fidelity in stroked lines.** Shrapnel streaks rendered as
  textured quads will look slightly different from sharp `ctx.stroke`
  lines. Probably OK after atlas tuning, but the user may notice on
  side-by-side comparison.
- **Easy debug.** Canvas inspector won't show individual particle draws —
  they're inside one instanced draw call. Need a debug viz mode.
- **First-paint speed.** Shader compile + atlas bake at startup adds
  ~30-100ms to game-load. Negligible but measurable.

## Implementation path

Each phase ends in a working build with tests passing. No "big bang"
rewrites — every phase is shippable.

### Phase 1 — Foundation (4-5 days)

Goals:
- WebGL canvas appears, renders nothing.
- Shader pipeline compiles and links.
- Sprite atlas baked at startup.
- One-frame test draw of a single textured quad in known coords.
- Ring-buffer VBO sized for `MAX_PARTICLES` instances.
- Camera transform uniform threaded through.

Deliverables:
- `js/modules/performance/webgl-particle-renderer.js` skeleton.
- `js/modules/performance/webgl-particle-atlas.js` with one circle sprite baked.
- Shader source as inline string constants (or `assets/shaders/*.glsl` if we prefer).
- `WebGLParticleRenderer.init()`, `.beginFrame()`, `.endFrame()`, `.testDraw()` API surface.
- Engine plumbing: WebGL canvas appended underneath the Canvas2D one,
  same dimensions, sized on resize.

Validation:
- Manual: load page, see one quad render at world (100, 100) with the
  Canvas2D entities drawing on top.
- Perf: frame-time hasn't regressed (the renderer is barely doing
  anything yet).

Decision point: **after Phase 1, we know WebGL works in this codebase.**
If shader compile fails on some target browser, we know now and can pivot.

### Phase 2 — Migrate `explosionEmber` (1-2 days)

Why ember first: highest particle count by volume, cheapest visual port
(it's already a sprite via `glowSpriteCache`), maximum signal on the
performance benefit.

Goals:
- Atlas gets the ember sprite (or reuses the cached glow sprite by
  blitting it into the atlas at startup).
- `Particle.draw` for `explosionEmber` becomes a no-op when the WebGL
  renderer is active.
- WebGL renderer iterates `particlePool.activeObjects`, picks out
  `explosionEmber` particles, writes their state to the VBO, draws.
- Visual parity check: ember at (300, 300) on Canvas2D vs WebGL —
  screenshot diff < 5% pixel difference.

Deliverables:
- `WebGLParticleRenderer.renderType('explosionEmber', particles)`.
- Per-instance attributes: x, y, size, r, g, b, a.
- Vertex shader: instanced quad transform.
- Fragment shader: sample atlas, multiply by color, output.

Validation:
- Mine explosion (which spawns ~24 embers) looks identical at gameplay
  speed.
- Microbenchmark: 600 ember particles render in <0.1ms (vs ~0.6ms
  Canvas2D-cached today).

Decision point: **after Phase 2, we know the win is real.** If ember
WebGL render is somehow slower than Canvas2D-cached on our target
hardware, we abort the hybrid migration and stop optimizing the existing
path further (the current code is already as fast as it gets).

### Phase 3 — Other sprite-shaped types (2-3 days)

Add to atlas + shader dispatch:
- `explosionFlash` (already sprite-cached, easy port)
- `explosion` (classic small colored circle)
- `starSparkle` (small fading dot)
- `pickupPulse` (if cheap)

Validation: visual parity tests for each migrated type; combined-type
benchmarks (mine explosion now contains mostly WebGL particles).

### Phase 4 — Dynamic types (3-5 days)

Hardest phase. Both shrapnel and rings have per-frame-changing geometry:

**Shrapnel**:
- Atlas slot: a streak sprite (bright head, fading tail), drawn
  horizontally so we can rotate per-instance.
- Per-instance attributes: position, rotation (angle), length, color, alpha.
- Vertex shader rotates the quad to the velocity angle, scales to streak length.

**Rings**:
- Atlas slot: an annular gradient (hollow ring, smooth falloff at inner
  and outer edges).
- Per-instance attributes: position, current radius, line-width factor,
  color, alpha.
- Vertex shader scales the quad to `2 × current radius`.

Validation:
- Side-by-side enemy-death screenshots at frame 0, 6, 12, 18, 23 with
  the canvas2d and WebGL versions. Pixel-diff budget per frame.

Decision point: **if the streak/ring sprite lookalikes feel
visually wrong**, fall back to keeping those two types on Canvas2D. The
hybrid still captures the embers/flashes/sparkles which are 70%+ of the
particle volume.

### Phase 5 — Cleanup (2-3 days)

- Migrate any remaining particle types that are easy.
- Document any types staying on Canvas2D and why.
- Remove dead Canvas2D code paths for migrated types (the sprite
  builders still feed the WebGL atlas so don't delete those).
- Update `docs/Performance Optimization Plan – 2026-05-03.md` with the
  new baseline.

### Phase 6 — Resilience (2 days)

- `webglcontextlost` / `webglcontextrestored` listeners.
- Atlas + VBO recovery on context restore.
- Canvas2D fallback path for: WebGL not supported, software-rendered,
  context lost mid-game.
- Browser detection: skip WebGL on environments known to be flaky.

### Phase 7 — QA + integration (2-3 days)

- Run all 92 QA + 60+ E2E tests. Update screenshot baselines for any
  visual-regression tests that now cover migrated particle types.
- Run the AI QA bot (`qa:bot:long`) and verify FPS stays at or above
  baseline through wave 20.
- Mitata microbenchmarks for the new render path.
- Final perf comparison: pre-WebGL vs post-WebGL at wave 20 with all
  effects active. Target: ≥30% frame-time reduction during big-bang
  moments, ≥0% reduction during quiet frames (no regression).

## Recommended decision criteria

Greenlight the hybrid if **any** of these is true:

1. We want to add a feature requiring 1500+ active particles (giant
   explosions, persistent debris, screen-fill effects).
2. We're consistently dropping frames on target hardware in late waves
   even after the perf plan is fully implemented.
3. We want the engineering practice — getting WebGL into the codebase
   makes future graphics features (bloom, distortion) viable.

Hold off if **all** of these are true:

1. Current 60fps target is comfortably hit on target hardware after the
   remaining perf-plan items are landed (adaptive quality, color sort,
   spatial-grid AI dodge).
2. No new high-particle-count features are in the design pipeline.
3. The team's calendar can't absorb 3-5 weeks of focused work right now.

## What I'd do if asked to start tomorrow

Phase 1 + Phase 2 in the same week. That's ~6 days for a working
ember-only WebGL render. We'd then have:
- Definitive proof that WebGL is faster on our target.
- A foundation to either extend (Phases 3-7) or hold (we keep the
  ember-only path as a partial win).

If after Phase 2 the win is marginal or unclear, we stop there. The
sunk cost is small (a week) and the rest of the codebase is unchanged.

If the win is clear (which I expect), we continue through Phase 7 and
land the full hybrid in 3-4 more weeks.

This is the lowest-risk way to commit to the migration. It avoids the
"3 weeks in and the win wasn't real" trap, because we get the answer
in week 1.
