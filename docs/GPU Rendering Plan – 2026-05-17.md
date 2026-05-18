# GPU Rendering Plan — 2026-05-17

**Status**: Approved for implementation
**Scope**: Solo product (`/`) — the canonical single-player game
**Author**: Analysis pass, 2026-05-17

This document plans a multi-phase rendering upgrade focused on (1) a real
bloom pipeline that restores "everything glows" without per-entity
`shadowBlur` cost, (2) targeted ports of expensive Canvas2D layers to GPU,
and (3) low-risk shader micro-optimizations. Background sections capture
the analysis that produced this plan so future readers can understand the
trade-offs.

---

## 1. Executive Summary

### ROI Ranking

| Initiative | Effort | Perf Δ | Visual Δ | Verdict |
|---|---|---|---|---|
| **Bloom / shadowBlur shader** | ~7–9 days | Neutral | **Large** | ✅ Phase 1 |
| **Canvas2D weapon effects → GPU** | ~3–5 days | −1 to −2 ms/frame | Modest | ✅ Phase 2 |
| **Canvas2D line debris / trails → GPU** | ~2 days | −0.5 ms/frame | Modest | ✅ Phase 3 |
| **Shader micro-opts (flat varyings, packed colors, R8 atlas)** | ~1–2 days | −0.1 to −0.2 ms/frame | None | ✅ Phase 4 |
| **Canvas2D asteroids/enemies → GPU** | ~1–2 weeks | −0.5 to −1 ms/frame | None | ⚠️ Phase 5 (defer) |
| **WebGL → WebGPU port** | ~3–5 weeks | −0.2 to −1 ms/frame | None | ❌ Skip — already WebGL2 |
| **Player ship → GPU** | ~3–5 days | −0.3 ms/frame | None | ❌ Skip (1 instance/frame) |
| **HUD → GPU** | n/a | n/a | None | ❌ Skip (Canvas2D is right tool for text) |

### Why this order

Phase 1 is *visually transformative* and provides a fixed-cost replacement
for the per-entity Gaussian blur that was systematically stripped from the
codebase (see [§11 appendix](#11-appendix-shadowblur-inventory)). It is
not a perf optimization on its own — it adds ~0.3–1.5 ms of fixed cost in
exchange for unlocking "everything glows" without the 5–15 ms cost of
re-enabling `shadowBlur` per entity.

Phases 2–3 reclaim ~1.5–2.5 ms/frame from the most expensive Canvas2D
layers, which makes the Phase 1 bloom budget comfortable on mobile.

Phase 4 is a hygiene pass — small absolute gains, near-zero risk, slots
in cleanly after Phase 1.

Phase 5 is open-ended; reassess after measuring real mobile frame budgets
post-Phase 1–4.

---

## 2. Background — Current Rendering Architecture

### 2.1 WebGL Layer (already on WebGL2)

Rainboids runs three WebGL2 renderers, ~1481 LOC total, sharing one GL
context. All use `#version 300 es` shaders, VAOs, native instancing
(`drawArraysInstanced`, `vertexAttribDivisor`) — no extensions required.

| Renderer | File | LOC | What it renders |
|---|---|---|---|
| WebGL Particle | `js/modules/performance/webgl-particle-renderer.js` | ~520 | Bright/glowing particles (embers, flashes, sparkles, shrapnel, rings) — instanced atlas |
| WebGL Bullet | `js/modules/performance/webgl-bullet-renderer.js` | ~418 | All player + enemy bullets, procedural SDF (no texture) |
| WebGL Starfield | `js/modules/performance/webgl-starfield-renderer.js` | ~543 | Background stars + nebula + orbs, parallax + twinkle + CRT scanlines |

Atlases live in companion files (`webgl-particle-atlas.js`,
`webgl-starfield-atlas.js`) and are built once at init, uploaded as
`gl.RGBA / gl.UNSIGNED_BYTE`.

**No abstraction layer**: each renderer manages its own shader
compilation, VBO setup, atlas. No FBO usage today. No central
shader/buffer pool.

### 2.2 Canvas2D Layer (the actual bottleneck)

Main loop: `js/modules/game-engine.js:2901–3147` (`draw()`). Per frame:

| Layer | File | ~Cost | Notes |
|---|---|---|---|
| Line debris / bullet trails | `depth-batch-renderer.js`, inline in `game-engine.js` | ~0.5 ms | Pooled lines |
| Weapon effects | `js/modules/combat/weapon-effects-renderer.js` | ~1–3 ms | Lance Beam, lightning, mines, nova — multi-stroke fake glow |
| Asteroids | `js/modules/world/asteroid.js` | ~0.3 ms | Polygon paths |
| Enemies | `js/modules/enemy/shapes.js` | ~0.5 ms | Varied animated shapes |
| Player ship | `js/modules/player/renderer.js` | ~0.5 ms | Radial gradients, shimmer |
| HUD | `js/modules/hud/*.js` | ~0.3 ms | Text + icons + bars |
| **Total Canvas2D** | | **~2–5 ms/frame** | 100–300 draw calls |

### 2.3 Render Order (top-down in the final framebuffer)

```
[HUD]                                 ← Canvas2D, screen space
[Player ship + entities + effects]    ← Canvas2D, world space
[Bullets]                             ← WebGL (drawn last, on top)
[Particles]                           ← WebGL, additive blend
[Starfield + nebula]                  ← WebGL
[CSS background — black void]
```

`gameCanvas` is transparent; `glCanvas` sits beneath. Canvas2D and WebGL
layers compose via CSS stacking + per-frame transparent clears.

### 2.4 Browser Compatibility (WebGL2)

Solid as of mid-2026: ~98% global support. Stable in Chrome/Edge since
2017, Firefox since 2017, Safari since 15.0 (Sept 2021). Existing code
has no WebGL1 fallback path, so the compat baseline is already
implicitly accepted. WebGPU is not needed.

---

## 3. Analysis Findings

### 3.1 WebGL → WebGPU Port — **Skip**

Estimated 15–21 days for full port + WebGL fallback retention.
Realistic perf gain: 0.2–1.0 ms/frame from reduced CPU draw-submission
overhead. Since you currently issue ~3 instanced draws per frame, CPU
overhead is already negligible. The big WebGPU wins (compute shaders,
multi-threaded encoding) target bottlenecks Rainboids doesn't have.

### 3.2 WebGL2 Features Not Yet Used

| Feature | Used? | Worth adding? |
|---|---|---|
| GLSL ES 3.00, VAOs, native instancing | ✅ | n/a |
| Float textures (R16F / RGBA16F) | ❌ | **Yes** — required for HDR bloom |
| Multiple Render Targets (MRT) | ❌ | Optional — cleaner bloom integration in Phase 2 |
| Uniform Buffer Objects | ❌ | No — uniform counts too small to matter |
| Transform Feedback (GPU particle physics) | ❌ | No — particle CPU sim is not a bottleneck |
| `texStorage2D` (immutable textures) | ❌ | Optional — micro-opt |
| Sampler objects | ❌ | Optional — code hygiene |

### 3.3 Shader Micro-Optimizations

Identified seven opportunities. Total addressable budget across all
shaders: **~0.1–0.2 ms/frame**. Shaders are already lean. Take the cheap
wins, skip the architecturally expensive ones.

| # | Win | Effort | Saving | Take? |
|---|---|---|---|---|
| 1 | `flat` qualifier on per-instance varyings (`v_shape`, `v_noScan`, `v_sharp`) | 1 h | 0.005–0.01 ms | ✅ |
| 2 | Hoist time-independent per-vertex math to CPU attributes (cos/sin per instance, `isCloud`/`isNeb` flags) | 1 d | 0.03–0.05 ms | ✅ |
| 3 | Pack RGBA color attribute as `uint32` (saves 12 B/instance × ~5500 instances) | 1 d | 0.01–0.05 ms | ✅ |
| 4 | Atlas `RGBA8` → `R8` (if verified grayscale) | 0.5 d | 0.02 ms mobile | ✅ if grayscale |
| 5 | Sort bullets by shape, separate draws per shape | 2 d | Net loss | ❌ |
| 6 | Replace `starSDF` `atan` with polynomial | 1 d | 0.005 ms (only star bullets) | ❌ |
| 7 | Starfield CRT scanlines as post-process pass | 2 d | Break-even at 1080p | ❌ |

---

## 4. Bloom Pipeline — Detailed Design

### 4.1 Why bloom, not shadowBlur

Per-entity `shadowBlur` is an O(r²) Gaussian per call. The codebase
explicitly removed it from weapon effects, enemies, asteroids, bullets,
and player ship between v5.79.0–v5.79.4 because it cost ~30 µs/beam and
~5–10 µs/bullet — unsustainable when many entities glow simultaneously.

A real bloom pipeline replaces *all* per-entity blurs with one
fixed-cost pass. Cost is decoupled from entity count. ~20–50× cheaper
than re-enabling `shadowBlur` everywhere, with arguably better visual
quality (proper light accumulation past 1.0 instead of stacked shadow
alpha).

### 4.2 Architecture (Phase 1 — threshold-based)

Renders only WebGL-layer emissive content (stars + particles) through
the bloom pipeline. Bullets keep current draw order on top (good for
gameplay readability) and join the bloom pipeline in Phase 2 when we
restructure the render order. Canvas2D is unaffected.

```
Frame:
  1. Bind sceneFBO (RGBA16F, full res)
     - Render starfield (existing code, retargeted)
     - Render particles  (existing code, retargeted)
  2. Bind bloomDownsampleFBO (RGBA16F, half res)
     - Sample sceneFBO with threshold + soft knee → bright pixels only
  3. Bind bloomBlurHFBO (RGBA16F, half res)
     - Sample bloomDownsampleFBO with horizontal Gaussian
  4. Bind bloomBlurVFBO (RGBA16F, half res)
     - Sample bloomBlurHFBO with vertical Gaussian
  5. Bind default framebuffer (glCanvas)
     - Composite: sample sceneFBO + bloomBlurVFBO × intensity
     - (Optional tone map for HDR: Reinhard or none)
  6. Canvas2D layer draws over glCanvas (unchanged)
  7. WebGL bullet renderer flushes on top (unchanged, no bloom in Phase 1)
```

### 4.3 File Structure

New files (all under `js/modules/performance/`):

```
js/modules/performance/
  bloom-pipeline.js          NEW   — main orchestrator class
  bloom-shaders.js           NEW   — shader source strings (one place for tuning)
  bloom-fbo.js               NEW   — small FBO wrapper (alloc, resize, bind, swap)
```

Modified files:

```
js/modules/game-engine.js                    — render-loop integration (~30 LOC delta)
js/modules/performance/webgl-particle-renderer.js   — accept optional target FBO param
js/modules/performance/webgl-starfield-renderer.js  — accept optional target FBO param
```

### 4.4 Shader Source Sketches

All bloom passes share one fullscreen-triangle vertex shader:

```glsl
#version 300 es
out vec2 v_uv;
void main() {
    vec2 pos = vec2(
        (gl_VertexID == 1) ? 3.0 : -1.0,
        (gl_VertexID == 2) ? 3.0 : -1.0
    );
    v_uv = pos * 0.5 + 0.5;
    gl_Position = vec4(pos, 0.0, 1.0);
}
```

#### 4.4.1 Brightness extraction (Pass 1)

```glsl
#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform float u_threshold;     // ~0.6 default
uniform float u_knee;          // ~0.25 default (soft knee width)
out vec4 fragColor;

void main() {
    vec3 c = texture(u_scene, v_uv).rgb;
    float brightness = max(c.r, max(c.g, c.b));
    // Soft knee — Unity-style curve
    float soft = clamp(brightness - u_threshold + u_knee, 0.0, 2.0 * u_knee);
    soft = soft * soft / (4.0 * u_knee + 1e-4);
    float contribution = max(brightness - u_threshold, soft);
    contribution /= max(brightness, 1e-4);
    fragColor = vec4(c * contribution, 1.0);
}
```

#### 4.4.2 Separable Gaussian blur (Passes 2 & 3)

Single shader, parameterized by `u_texelStep` (horizontal: `(1/w, 0)`,
vertical: `(0, 1/h)`). 9-tap Gaussian, weights tuned for radius ~6 px
at half-res (≈12 px full-res blur radius — adequate for glow falloff):

```glsl
#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_input;
uniform vec2 u_texelStep;
out vec4 fragColor;

const float w0 = 0.227027;
const float w1 = 0.1945946;
const float w2 = 0.1216216;
const float w3 = 0.054054;
const float w4 = 0.016216;

void main() {
    vec3 sum = texture(u_input, v_uv).rgb * w0;
    sum += texture(u_input, v_uv + u_texelStep * 1.0).rgb * w1;
    sum += texture(u_input, v_uv - u_texelStep * 1.0).rgb * w1;
    sum += texture(u_input, v_uv + u_texelStep * 2.0).rgb * w2;
    sum += texture(u_input, v_uv - u_texelStep * 2.0).rgb * w2;
    sum += texture(u_input, v_uv + u_texelStep * 3.0).rgb * w3;
    sum += texture(u_input, v_uv - u_texelStep * 3.0).rgb * w3;
    sum += texture(u_input, v_uv + u_texelStep * 4.0).rgb * w4;
    sum += texture(u_input, v_uv - u_texelStep * 4.0).rgb * w4;
    fragColor = vec4(sum, 1.0);
}
```

**Future optimization (deferred)**: use linear-filter offset trick to
collapse 9 taps to 5 with bilinear blending — ~40% faster, ~1 extra hour.
Skip for v1; tune after measurement.

#### 4.4.3 Composite (Pass 4)

```glsl
#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_intensity;     // ~0.8 default
out vec4 fragColor;

void main() {
    vec3 scene = texture(u_scene, v_uv).rgb;
    vec3 bloom = texture(u_bloom, v_uv).rgb;
    vec3 final = scene + bloom * u_intensity;
    // Optional Reinhard tone map for HDR (off by default):
    // final = final / (1.0 + final);
    fragColor = vec4(final, 1.0);
}
```

### 4.5 BloomPipeline API Sketch

```js
// js/modules/performance/bloom-pipeline.js
export class BloomPipeline {
    constructor(canvas) { /* ... */ }

    /** Acquire/create FBOs and compile shaders. Returns true on success. */
    init(gl) { /* ... */ }

    /** Recreate FBOs on resize. Cheap; safe to call every frame on resize. */
    resize(width, height) { /* ... */ }

    /** Bind the scene FBO so subsequent draws accumulate into bloom input. */
    bindSceneFBO() { /* ... */ }

    /**
     * Run extract + blur + composite. Reads from scene FBO, writes the
     * blended result into the default framebuffer (glCanvas).
     * @param {number} intensity   default 0.8
     * @param {number} threshold   default 0.6
     */
    process(intensity = 0.8, threshold = 0.6) { /* ... */ }

    /** Whether bloom is supported on this GPU (requires EXT_color_buffer_float). */
    get supported() { /* ... */ }

    /** Free GL resources (called on context loss). */
    dispose() { /* ... */ }
}
```

### 4.6 Integration in `game-engine.js`

Current `draw()` flow (`js/modules/game-engine.js:2901–3147`) changes
minimally:

```js
// BEFORE Phase 1
gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT);
this.starfieldRenderer.draw(...);
// ... particles render later in the loop

// AFTER Phase 1
if (this.bloomPipeline.supported) {
    this.bloomPipeline.bindSceneFBO();        // ← bind RGBA16F instead of default
}
gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT);
this.starfieldRenderer.draw(...);
// ... particles render later, same path

// After particles render (existing line ~3044):
if (this.bloomPipeline.supported) {
    this.bloomPipeline.process(0.8, 0.6);    // ← extract + blur + composite to default fb
}
```

The starfield and particle renderers do **not** need to know about
bloom — they just render to whatever FBO is bound. The pipeline manages
binding before/after.

### 4.7 Fallback Path

If `EXT_color_buffer_float` is missing (rare on WebGL2, but possible on
some older Android GPUs) or FBO creation fails:
- `bloomPipeline.supported = false`
- `bindSceneFBO()` and `process()` become no-ops
- Renderers fall back to drawing directly to default framebuffer
- No bloom effect, but game still runs

### 4.8 HDR Considerations

`RGBA16F` (with `EXT_color_buffer_float`) lets bright pixels go past 1.0
and accumulate in the bloom FBO before threshold. This is what makes
"hot" colors (whites, yellows) bloom larger than dimmer colors of equal
saturation. Without HDR, a saturated red (`1.0, 0.2, 0.2`) and a hot
white (`1.0, 1.0, 1.0`) bloom identically — visually wrong.

If `EXT_color_buffer_float` is unavailable, fall back to `RGBA8` for
both scene and bloom FBOs — bloom still works, just LDR-clamped. Visual
difference is real but not fatal.

### 4.9 Tuning Parameters

Expose via debug overlay (`window.gameEngine.bloomPipeline`):

| Param | Default | Range | Effect |
|---|---|---|---|
| `intensity` | 0.8 | 0.0–2.0 | Bloom contribution to final image |
| `threshold` | 0.6 | 0.0–1.0 | Brightness floor below which pixels don't bloom |
| `knee` | 0.25 | 0.0–0.5 | Width of soft knee around threshold |
| `blurRadius` | 1.0 | 0.5–2.0 | Multiplier on `u_texelStep` (larger = wider halo) |

Tuning pass should happen with VFX artist + stress scenarios (wave 10
bosses, dense particle scenes).

### 4.10 Performance Budget

| Platform | Half-res RGBA16F | Quarter-res RGBA16F | Half-res RGBA8 fallback |
|---|---|---|---|
| Desktop integrated | ~0.3 ms | ~0.1 ms | ~0.2 ms |
| Desktop discrete | ~0.1 ms | <0.05 ms | <0.05 ms |
| Mobile mid-tier | ~1.2 ms | ~0.4 ms | ~0.8 ms |
| Mobile low-tier | ~2.0 ms | ~0.7 ms | ~1.5 ms |

If mobile budget exceeds 1.5 ms, drop to quarter-res. Visual difference
at game distances is minimal.

---

## 5. Phase 2 — Canvas2D Weapon Effects → GPU

### 5.1 Scope

Port from `js/modules/combat/weapon-effects-renderer.js` (~950 LOC) to a
new GPU renderer:

- **Lance Beam** (jagged 3-stroke lightning path) → SDF capsule with
  per-segment jitter
- **Lightning chains** (temporal-blended chains) → instanced segment
  draws with vertex-shader jitter
- **Nova rings** (expanding scaled strokes) → SDF ring with animated
  inner/outer radius
- **Mine glow rings** → SDF ring
- **Missile trails** → SDF capsule (reuses Phase 3 trail shader)

**Excluded** (stays Canvas2D for now):
- Deflector orbs (small, infrequent — keep `shadowBlur` ACTIVE)
- Skill orbs (HUD-adjacent — keep `shadowBlur` ACTIVE)
- EMP pulse rings (1–2 frames lifetime — not worth porting)

### 5.2 New Renderer

```
js/modules/performance/
  webgl-effect-renderer.js   NEW   — beam/lightning/ring SDF instanced renderer
  webgl-effect-shaders.js    NEW   — shader sources
```

Shader strategy:
- One instanced quad per effect segment
- Per-instance data: `vec4 start`, `vec4 end`, `vec4 color`, `vec2
  thickness`, `float effectType`, `float seed` (for jitter)
- Fragment shader: SDF capsule with brightness ramp from core to edge
  (replaces the multi-stroke fake-glow pattern in current code)

### 5.3 Integration Order

After Phase 1 lands, weapon effects render to the bloom **scene FBO**,
so they automatically participate in the bloom pipeline. This is the
key Phase 2 win: weapon beams glow without per-stroke shadowBlur AND
without the multi-pass fake-glow strokes (current cost: 3 strokes per
beam, ~30 µs each).

Render-order restructure (Phase 2 part 2):

```
[BEFORE Phase 2]                         [AFTER Phase 2]
WebGL starfield     → bloom FBO          WebGL starfield     → bloom FBO
WebGL particles     → bloom FBO          WebGL particles     → bloom FBO
Bloom process       → default fb         WebGL effects (new) → bloom FBO  ← MOVED HERE
Canvas2D entities                        WebGL bullets       → bloom FBO  ← MOVED HERE
Canvas2D weapon FX                       Bloom process       → default fb
Canvas2D HUD                             Canvas2D entities (non-emissive)
WebGL bullets                            Canvas2D HUD
```

This is a meaningful change to render order. The win: all emissive
content participates in one bloom pass. Bullets glow. Beams glow.
Particles glow.

### 5.4 Files Modified

- `js/modules/game-engine.js` — render order restructure (~50 LOC delta)
- `js/modules/combat/weapon-effects-renderer.js` — delete migrated
  paths, keep deflector + skill orbs

---

## 6. Phase 3 — Canvas2D Line Debris & Trails → GPU

### 6.1 Scope

- **Bullet trails**: currently drawn inline in `game-engine.js` via
  Canvas2D `lineTo/stroke`
- **Line debris**: `lineDebrisPool.drawActiveVisible()` — pooled line
  segments from broken asteroids/enemies
- **Engine thrust trails**: from player ship

### 6.2 Implementation

Reuses the SDF capsule shader from Phase 2 (`webgl-effect-renderer.js`).
Just adds new effectType IDs:
- `EFFECT_TYPE_TRAIL` — short fading line
- `EFFECT_TYPE_DEBRIS` — straight line with constant color

Pool integration: replace `drawActiveVisible()` Canvas2D paths with
"push instance to GPU buffer" calls. Pools already track lifetime,
position, color — just changes the emit target.

### 6.3 Files Modified

- `js/modules/performance/webgl-effect-renderer.js` — add new effect
  types
- `js/modules/performance/depth-batch-renderer.js` — replace line debris
  Canvas2D path
- `js/modules/game-engine.js` — replace bullet trail Canvas2D path
  (~20 LOC delta)

---

## 7. Phase 4 — Shader Hygiene PR

### 7.1 Changes

Bundle into one PR (low risk, small absolute gain, but cheap to do):

1. **`flat` qualifier on per-instance varyings**:
   - `webgl-bullet-renderer.js:60` — `v_shape` → `flat`
   - `webgl-starfield-renderer.js:66–67` — `v_noScan`, `v_sharp` →
     `flat`

2. **Hoist time-independent per-vertex math to CPU**:
   - Bullet shader: send `vec2(cos, sin)` per-instance instead of
     `a_angle` + per-vertex trig
   - Particle shader: same
   - Starfield shader: compute `isCloud`, `isNeb` flags CPU-side, pack
     into existing flag attribute (rename / extend `a_noScan` to a
     bitfield)

3. **Pack RGBA color as `uint32` attribute**:
   - All three renderers
   - JS side: `Uint32Array` view over same `ArrayBuffer` as
     `Float32Array`
   - GLSL: declare `in uint a_packedColor;`, unpack with `vec4(uvec4
     (a_packedColor >> uvec4(0u, 8u, 16u, 24u)) & 0xFFu) / 255.0`

4. **Atlas format**: verify atlas content is grayscale (likely yes);
   if so, switch atlas upload to `gl.R8` and update shader to swizzle
   `tex.r → vec3(tex.r)`.

### 7.2 Files Modified

- `js/modules/performance/webgl-bullet-renderer.js`
- `js/modules/performance/webgl-particle-renderer.js`
- `js/modules/performance/webgl-starfield-renderer.js`
- `js/modules/performance/webgl-particle-atlas.js` (if R8 conversion)
- `js/modules/performance/webgl-starfield-atlas.js` (if R8 conversion)

---

## 8. Phase 0 — Pre-flight

### 8.1 Performance Measurement

Before any phase work begins:

1. Add a `PerfMeasure` module: wraps `performance.measure()` around each
   render layer (starfield, particles, bullets, weapon effects, line
   debris, entities, HUD).
2. Surface the per-layer timings in a debug overlay (existing
   `SHIFT+F12` or new key).
3. Capture baseline numbers in three scenarios:
   - **Idle**: title screen, no entities
   - **Mid combat**: wave 5, typical entity density
   - **Stress**: wave 10 boss + storm-needles + 200 particles

### 8.2 Test Fixture

Add a deterministic stress scenario via cheat code:
- New `SHIFT+P` cheat: spawns the stress fixture (storm-needles +
  multiple enemy types + max particles)
- Allows side-by-side perf comparison before/after each phase

### 8.3 Files Created

- `js/modules/performance/perf-measure.js` NEW
- Debug overlay integration in `js/modules/hud/debug.js` (if exists,
  else inline in `game-engine.js`)

---

## 9. Master Phase Plan & Sequencing

```
Phase 0 (1 day)   — perf instrumentation, baseline capture, test fixture
   ↓
Phase 1 (7–9 d)   — bloom pipeline (stars + particles only initially)
   ↓
Phase 4 (1–2 d)   — shader hygiene PR (parallel-safe after Phase 1)
   ↓
Phase 2 (3–5 d)   — weapon effects to GPU, render order restructure,
                    bullets join bloom
   ↓
Phase 3 (2 d)     — line debris + trails to GPU
   ↓
[Reassess Phase 5 based on measured mobile budgets]
```

**Total committed work**: ~14–19 days. Phases 1–4 should ship over ~3
weeks of focused work, each as its own PR (each gets its own MINOR or
PATCH version bump per CLAUDE.md versioning rules).

---

## 10. Parallel Dispatch Plan

### 10.1 Principles (from `feedback_parallel_dispatch.md`)

- **Strict file ownership**: no two subagents touch the same file
  concurrently.
- **Subagents never run git**: parent collects results and stages
  commits.
- **New-file dispatches are safest**: prefer creating new files over
  modifying existing ones when parallel.

### 10.2 Phase 0 — Pre-flight (Serial)

Single subagent: instrument render layers, build test fixture, capture
baselines. Output is the baseline numbers + the perf-measure module.

### 10.3 Phase 1 — Bloom Pipeline (Mostly Parallel)

**Round 1 — All new files, fully parallel (3 subagents)**:

| Subagent | Owns | Task |
|---|---|---|
| **1A** | `js/modules/performance/bloom-shaders.js` (NEW) | Author all four shader source strings exactly per §4.4. Export as named constants. No GL code, just strings. |
| **1B** | `js/modules/performance/bloom-fbo.js` (NEW) | FBO wrapper class: alloc R16F target, attach color, handle resize, bind/unbind. Stateless — no shaders. Includes `EXT_color_buffer_float` check + RGBA8 fallback. |
| **1C** | `js/modules/performance/perf-measure.js` (NEW, if not done in Phase 0) | Per-layer perf instrumentation. Independent of bloom. |

**Round 2 — Depends on Round 1 (1 subagent)**:

| Subagent | Owns | Task |
|---|---|---|
| **1D** | `js/modules/performance/bloom-pipeline.js` (NEW) | `BloomPipeline` class per §4.5. Consumes 1A's shader strings and 1B's FBO wrapper. Implements `init`, `resize`, `bindSceneFBO`, `process`, `dispose`. |

**Round 3 — Depends on Round 2 (1 subagent, modifies existing file)**:

| Subagent | Owns | Task |
|---|---|---|
| **1E** | `js/modules/game-engine.js` | Wire `BloomPipeline` into `draw()` per §4.6. Add `bindSceneFBO()` call before WebGL renders, `process()` call after particles. Add fallback no-op if `bloomPipeline.supported === false`. |

**Round 4 — Tuning + tests (1 subagent)**:

| Subagent | Owns | Task |
|---|---|---|
| **1F** | New `tests/qa/*` file | Add visual regression smoke test: launch game, take screenshot of explosion, assert bloom is present (luminance halo around bright pixels). |

### 10.4 Phase 4 — Shader Hygiene (Parallelizable per renderer)

**Round 1 — Per-renderer, parallel (3 subagents)**:

| Subagent | Owns | Task |
|---|---|---|
| **4A** | `js/modules/performance/webgl-bullet-renderer.js` | Add `flat` qualifier on `v_shape`; hoist cos/sin to per-instance attribute. |
| **4B** | `js/modules/performance/webgl-particle-renderer.js` | Hoist cos/sin to per-instance attribute. |
| **4C** | `js/modules/performance/webgl-starfield-renderer.js` | Add `flat` qualifiers on `v_noScan`/`v_sharp`; precompute `isCloud`/`isNeb` flags CPU-side, pack into flag attribute. |

**Round 2 — Cross-cutting, serial (touches all three renderers)**:

| Subagent | Owns | Task |
|---|---|---|
| **4D** | All three webgl-*-renderer.js + corresponding atlas files | RGBA → uint32 color packing. R8 atlas conversion (verify grayscale first; abort if any RGB variation found). |

### 10.5 Phase 2 — Weapon Effects (Mixed)

**Round 1 — New renderer, parallel (2 subagents)**:

| Subagent | Owns | Task |
|---|---|---|
| **2A** | `js/modules/performance/webgl-effect-shaders.js` (NEW) | SDF capsule + ring shaders; per-instance jitter logic. |
| **2B** | `js/modules/performance/webgl-effect-renderer.js` (NEW) | Renderer class consuming 2A's shaders. API: `pushBeam`, `pushLightning`, `pushNova`, `pushRing`, `drawFrame`. |

**Round 2 — Integration, serial**:

| Subagent | Owns | Task |
|---|---|---|
| **2C** | `js/modules/combat/weapon-effects-renderer.js` + `js/modules/game-engine.js` | Migrate Lance Beam, lightning, nova, mine glow from Canvas2D paths to GPU. Restructure render order per §5.3. Bullets join bloom FBO. |

### 10.6 Phase 3 — Line Debris & Trails (Serial)

Single subagent: small surface area, all touches existing files.

| Subagent | Owns | Task |
|---|---|---|
| **3A** | `webgl-effect-renderer.js` + `depth-batch-renderer.js` + `game-engine.js` | Add `EFFECT_TYPE_TRAIL` and `EFFECT_TYPE_DEBRIS`; migrate line debris and bullet trail draws. |

### 10.7 Dispatch Summary

| Phase | Round | Concurrent subagents | Files touched |
|---|---|---|---|
| 0 | 1 | 1 | NEW: perf-measure.js; MOD: game-engine.js |
| 1 | 1 | 3 (1A, 1B, 1C) | NEW: bloom-shaders, bloom-fbo, perf-measure |
| 1 | 2 | 1 (1D) | NEW: bloom-pipeline |
| 1 | 3 | 1 (1E) | MOD: game-engine |
| 1 | 4 | 1 (1F) | NEW: bloom smoke test |
| 4 | 1 | 3 (4A, 4B, 4C) | MOD: each webgl-*-renderer |
| 4 | 2 | 1 (4D) | MOD: all 3 renderers + 2 atlases |
| 2 | 1 | 2 (2A, 2B) | NEW: webgl-effect-shaders, webgl-effect-renderer |
| 2 | 2 | 1 (2C) | MOD: weapon-effects-renderer + game-engine |
| 3 | 1 | 1 (3A) | MOD: webgl-effect-renderer + depth-batch-renderer + game-engine |

**Max concurrent fan-out**: 3 subagents (Phase 1 Round 1, Phase 4
Round 1). Per the parallel-dispatch lessons, this is the safe ceiling.

---

## 11. Versioning & Commit Plan

Per CLAUDE.md:

| Phase | Version bump | Changelog section | Notes |
|---|---|---|---|
| 0 | none (pure dev infra) | — | Perf instrumentation is dev-only, no runtime impact |
| 1 | MINOR | `### Added` | New bloom pipeline, behavior change visible to players |
| 2 | MINOR | `### Changed` | Weapon effects re-rendered, render order restructured |
| 3 | PATCH | `### Changed` | Trail rendering moved to GPU, no player-visible change |
| 4 | PATCH | `### Changed` | Shader micro-opts, no player-visible change |

README.md will need updating for Phase 1 (new project structure under
`js/modules/performance/` is fine — bloom files live in existing dir,
so structure stays the same; just update the rendering description).

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `EXT_color_buffer_float` unavailable on some GPUs | Low (rare on WebGL2) | Bloom falls back to LDR | RGBA8 fallback path in `bloom-fbo.js` |
| FBO creation fails (mobile driver bug) | Low | No bloom | `supported = false`, all paths no-op |
| Render-order restructure in Phase 2 breaks visual layering | Medium | Visual regression | Visual smoke test added in Phase 1 Round 4; manual review per PR |
| Mobile bloom budget too high | Medium | Frame drops on low-end | Tunable: drop to quarter-res, lower intensity, or disable |
| Shader hygiene PR breaks color accuracy (uint32 packing) | Low | Slight color drift | Test fixture comparison; revert just Win #3 if regressed |
| `flat` qualifier exposes platform-specific bugs | Very low | Visual artifacts | Standard GLSL ES 3.00 feature, widely tested |
| Restructuring weapon-effects-renderer breaks effects not yet ported | Medium | Effects disappear | Migrate effect-by-effect, behind feature flag if needed |

---

## 13. Performance Measurement Plan

### 13.1 Metrics

Per-layer per-frame timings (recorded as rolling avg over 60 frames):
- `t_starfield`, `t_particles`, `t_bullets` (WebGL layers)
- `t_canvas2d_world`, `t_canvas2d_effects`, `t_canvas2d_hud`
- `t_bloom_extract`, `t_bloom_blur_h`, `t_bloom_blur_v`,
  `t_bloom_composite` (new in Phase 1)
- `t_total_frame`

### 13.2 Acceptance Criteria

**Phase 1 ships when**:
- Bloom visible on bright particles in all three scenarios (idle, mid,
  stress)
- Total frame time stress scenario desktop: ≤ +1.0 ms over baseline
- Total frame time stress scenario mobile: ≤ +2.0 ms over baseline
- No visual regression in non-bloom layers (HUD, ship, asteroids
  unchanged)

**Phase 2 ships when**:
- Lance Beam, lightning, nova all visible and bloomed
- `t_canvas2d_effects` drops by ≥ 1.0 ms in stress scenario
- Bullet bloom visible in mid + stress scenarios

**Phase 3 ships when**:
- Line debris + bullet trails visible
- `t_canvas2d_world` drops by ≥ 0.3 ms in stress scenario

**Phase 4 ships when**:
- All three renderers compile with no warnings
- Pixel-diff regression test passes (no color drift > 1/255)
- No measurable frame time regression

---

## 14. Appendix — shadowBlur Inventory

### 14.1 Active sites (currently enabled)

| File | Lines | Entity | Value | Notes |
|---|---|---|---|---|
| `js/modules/core/utils.js` | 650–651, 732–733 | Glow sprite cache utility | 8 | One-time cache build |
| `js/modules/combat/weapon-effects-renderer.js` | 882–883 | Deflector orbs | 8 | KEEP — bloom won't replace this in Phase 1 |
| `js/modules/combat/weapon-effects-renderer.js` | 928–929 | Skill orbs glow | 10 | KEEP — Phase 1 doesn't bloom Canvas2D |
| `js/modules/enemy/enemy-bullet.js` | 738–739 | Enemy bullets (optional halo) | 2.5 | KEEP for now |
| `js/modules/hud/overlays.js` | 1402–1403 | Wave/tier text glow | dynamic | KEEP — HUD text |
| `js/modules/hud/overlays.js` | 1545–1546 | Tier icon pulse | 12 × pulse | KEEP — HUD |
| `js/modules/hud/overlays.js` | 1560 | Buff indicator | conditional 6/0 | KEEP — HUD |
| `js/modules/hud/status.js` | 875–876, 1409–1410, 1429–1430, 1623–1624 | Health bar, energy, critical, skill bar | various | KEEP — HUD |

### 14.2 Disabled sites (explicitly set to 0 — candidates to leave at 0 because bloom replaces them)

- `weapon-effects-renderer.js:96, 112, 131` (Lance Beam) → bloom replaces in Phase 2
- `weapon-effects-renderer.js:310, 324` (mines) → bloom replaces in Phase 2
- `weapon-effects-renderer.js:404, 425, 456, 642` (nova, missiles,
  explosions) → bloom replaces in Phase 2
- `player/renderer.js:195, 257, 305, 334, 344, 360, 375` (player ship)
  → if Phase 5 ports player ship, bloom replaces; otherwise keep 0
- `enemy/shapes.js:104–143, 262–263` (enemy silhouettes) → keep 0
  (enemies aren't emissive)
- `world/asteroid.js:599–600, 709–710, 794–795` (asteroids) → keep 0
- `enemy/enemy-bullet.js:741–742` → keep 0 (already minimal halo above)
- `hud/status.js:1585` (commented-out skill bar glow) → keep commented

### 14.3 Rationale comments to preserve

The codebase has well-written comments explaining why shadowBlur was
removed (`weapon-effects-renderer.js:104–118`, `enemy/shapes.js:262–263`,
`bullet.js:459`, `core/utils.js:712`). When Phase 2 deletes the
fake-glow strokes, replace those comments with brief pointers to this
plan doc:

```js
// Beam glow now comes from the GPU bloom pipeline
// (docs/GPU Rendering Plan – 2026-05-17.md, §4).
// Per-stroke shadowBlur is permanently retired.
```

---

## 15. Open Questions

1. **Mobile bloom on/off toggle**: should we expose a settings option to
   disable bloom on low-end devices, or rely on per-device auto-tuning
   (quarter-res fallback)? Recommend auto-tuning with a hidden override
   in settings.
2. **HUD bloom**: skill bars and tier icons currently use `shadowBlur`
   for their glow. Should HUD elements bloom together with the world?
   Recommend no — keep HUD crisp and separate.
3. **VFX artist review**: bloom thresholds will dramatically change the
   game's look. Schedule one tuning session per phase end.
4. **Phase 5 trigger**: what mobile frame-time threshold justifies
   investing 1–2 weeks in asteroid/enemy GPU port? Suggest: if mobile
   stress scenario sits above 12 ms after Phase 1–4, do Phase 5;
   otherwise defer indefinitely.

---

*End of plan.*
