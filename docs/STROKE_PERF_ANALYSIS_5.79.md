# Stroke + WebGL Bullets — Performance Analysis (5.79.x)

Status: analysis only. No code changes recommended in this document — the
findings drive the **next** optimization pass.

## TL;DR

The 5.79.0 black-stroke pass is dominated by **`ctx.shadowBlur` calls on
bullets**. They cost 2.5–7% of a 60 fps frame budget at peak combat
density. The cleanest follow-up is **kill `shadowBlur` for bullets,
switch to a baked outline sprite cache, and (later) lift bullet
rendering to WebGL**. Doing all three recovers 1–2 ms per frame at peak
density and unlocks 2-3× higher bullet counts before frame drops.

---

## 1. What 5.79.0 added

| Site | Technique | Frequency |
| --- | --- | --- |
| Player ship | Explicit black silhouette stroke pass (5 paths) under `lighter`-blend body | 1 ship × every frame |
| Enemies | `ctx.shadowColor='#000'; ctx.shadowBlur=3` set before `drawEnemyShape` | N enemies × every frame |
| Player bullets | Same shadow halo on the bullet body (not trail) | N bullets × every frame |
| Enemy bullets | Same shadow halo | N enemy bullets × every frame |
| Lance Beam | Black 2-pass under-stroke tracing the colored beam path | 1 × every frame while firing |
| Arc Lightning beam | Black under-stroke per-segment | 1–N segments × every frame while firing |
| Arc Lightning frayed-static | 7 strands × 3 strokes (black/color/core) | 21 strokes/frame while firing without target |
| Nova rings | Black under-stroke ring | N active rings × every frame |
| Mines, missiles | Shadow halo via canvas shadow API | N × every frame |
| Title text | `strokeText` per glyph + colored fill | Title screen only |

---

## 2. Cost model — what each technique actually costs

### 2a. `ctx.shadowBlur` (the expensive one)

`shadowColor` + `shadowBlur` triggers a Gaussian blur pass on **every**
subsequent `fill()` / `stroke()` until reset. The browser:

1. Renders the shape into an offscreen buffer at the bounding box of the
   shape, expanded by `shadowBlur` in every direction.
2. Runs a separable 2-pass Gaussian blur (~`2 × shadowBlur` taps).
3. Tints the result with `shadowColor`.
4. Composites that under the original shape.

For a **bullet of radius 5 px with shadowBlur=2.5**:
- Bounding box: `(2 × (5+2.5))² = 225 px²`.
- Gaussian taps per pixel: ~10 (2 passes × 5).
- Total taps: `225 × 10 = 2 250` per bullet.
- On modern integrated GPUs running Canvas2D's compositing, this is
  ~6–10 µs per bullet (shadow setup + blit dominates the per-call
  fixed cost; the actual blur is GPU-fast).

For **N=50 bullets** (typical mid-fight): `50 × 8 µs ≈ 400 µs/frame =
2.4% of 16.6ms budget`.
For **N=150 bullets** (Storm Needles + Multi-Shot ×3 + ~3 simultaneous
enemy waves): `150 × 8 µs ≈ 1 200 µs/frame = 7.2% of frame budget`.

Enemies, mines, missiles share the same cost shape but are far fewer
(typically 10–25 entities total). Their combined budget is ~150–250 µs.

### 2b. Player ship explicit silhouette pass

5 sub-paths (wings, tips, hull, engines, cockpit) drawn with a single
black `ctx.stroke()` each at lineWidth 4–5. No shadow.

Stroke cost ≈ proportional to perimeter, ~50–80 µs total. **One ship,
fixed cost. Negligible (~0.5%).**

### 2c. Lance Beam / Arc Lightning under-stroke

Lance Beam: jagged path of ~10 segments. The 5.79.0 change samples the
path once (shared between black + colored stroke), so we only pay one
extra stroke pass on the same path. **~150 µs while firing.**

Arc Lightning targeted: per chain segment, 3 strokes (black, colored,
core). 1 segment when locked → ~80 µs. **Negligible.**

Arc Lightning frayed static: 7 strands × `drawJaggedArcPair` which
itself does black + colored + core = 3 strokes per strand = **21
strokes/frame ≈ 600–700 µs ≈ 4% of frame budget while idle-firing**.
This is the second-largest stroke cost after bullets, and it triggers
specifically while the player has Arc Lightning equipped and is holding
fire without a target — a common state.

### 2d. Title text outline (`strokeText`)

`strokeText` is cheap: it strokes each glyph's outline once, no blur.
~30–60 µs per drawWavyText call. **Title screen only — irrelevant in
gameplay.**

### 2e. Nova rings, mines, missiles

Each adds a single shadowed pass. Active counts are low (rings:
0–2, mines: 0–4, missiles: 0–8 typical). **Combined ~80–120 µs.**

### 2f. Estimated total stroke budget

| Scenario | Stroke cost | % of 16.6 ms frame |
| --- | --- | --- |
| Light combat (20 bullets, 5 enemies, no beam/arc) | ~250 µs | **1.5%** |
| Mid combat (50 bullets, 10 enemies) | ~480 µs | **2.9%** |
| Heavy (150 bullets, 20 enemies, arc idle-firing) | ~2 200 µs | **13.3%** |
| Heavy + Lance Beam | ~2 350 µs | **14.2%** |

The **bullets dominate at peak** — they account for 50–60% of the total
stroke cost when bullet count is high. Arc Lightning frayed-static is a
distant second at ~30% during idle fire.

### 2g. Why this matters more on lower-end machines

The cost numbers above assume a modern integrated GPU. On older
hardware (Intel UHD 620 / mobile-class), `shadowBlur` is **3–5× slower**
because the Gaussian pass falls back to software. Same numbers there
become: **mid combat ~1.5–2.5 ms (9–15%)**, **heavy combat ~6–11 ms
(36–66%)** of frame budget — i.e., the difference between a stable
60 fps and a stuttery 30 fps.

---

## 3. WebGL bullet rendering — projected gains

### 3a. Architecture

The codebase already runs `WebGLParticleRenderer` and
`WebGLStarfieldRenderer`. A `WebGLBulletRenderer` would mirror that
pattern:

- **Atlas**: a single texture holding every bullet shape (circle, star,
  diamond, triangle, hexagon) at fixed sizes, with a 1–2 px **black
  outline baked into the alpha channel**. ~64 kB texture.
- **Instance buffer**: `(x, y, angle, scale, colorIndex, atlasIndex)` =
  24 bytes per bullet. 200 bullets = 4.8 KB upload per frame.
- **Single draw call**: one `gl.drawArraysInstanced` per frame for all
  bullets. Trails get a separate instance pass with line-strip geometry.

### 3b. Cost comparison

Canvas2D current per-bullet cost (drawTrail + drawShape + shadowBlur):

| Step | Cost |
| --- | --- |
| `ctx.save / restore` | ~1 µs |
| Trail loop (ring buffer iterate) | ~3 µs |
| `setTransform` + `arc()` / shape path | ~2 µs |
| `fill()` | ~2 µs |
| `shadowBlur` halo blit | ~6–8 µs |
| **Total per bullet** | **~14–16 µs** |

WebGL projected per-bullet cost:

| Step | Cost |
| --- | --- |
| Buffer slot write (24 B) | ~0.05 µs |
| Per-frame draw setup amortized over N | <50 µs total / N |
| **Total per bullet at N=200** | **~0.3 µs** |

Plus a constant ~80 µs for binding the program / VBO each frame.

**Crossover point: N ≈ 6 bullets.** Above that, WebGL is faster.

### 3c. Frame-budget recovery

| Scenario | Canvas2D | WebGL | Saved |
| --- | --- | --- | --- |
| Mid (50 bullets) | 480 µs | 95 µs | **385 µs (2.3% frame)** |
| Heavy (150 bullets) | 1 200 µs | 125 µs | **1 075 µs (6.5% frame)** |
| Storm Needles peak (250 bullets) | 2 000 µs | 155 µs | **1 845 µs (11% frame)** |

In addition, WebGL avoids the `shadowBlur` Gaussian pass entirely:
the outline becomes a **shader detail** (sample atlas alpha, compare
threshold, fill black if `0.5 < a < 0.85`). Effectively free.

### 3d. What WebGL doesn't help

- One-off effects (Lance Beam, Arc Lightning) — those are 1-pass, low
  count. Stay in Canvas2D.
- Damage numbers, HUD text — text is genuinely a Canvas2D strength.
- Trails: WebGL line strips are fast but have driver-specific quality
  issues. A textured-quad ribbon approach (per-segment quad with a
  fade gradient) is the cleaner WebGL trail pattern.

---

## 4. Outlining strategies — ranked

### 4a. Cheapest: baked outline sprite cache (Canvas2D, fits today)

For each unique `(shape, color, size)` tuple, render the bullet
**once** to an offscreen canvas with the outline burned in (double
stroke + fill). Cache it. Per-frame draw becomes a single `drawImage`.

- **Cost**: ~2 µs per bullet (one `drawImage`, no `shadowBlur`).
- **Memory**: 7 shapes × ~6 colors × 3 sizes × ~256 px² ≈ 200 KB total.
- **Effort**: small — extend `glowSpriteCache` (already exists in
  `js/modules/core/utils.js`) with an outline variant.

This alone recovers ~70% of the bullet stroke cost without touching
WebGL. **Recommended as the immediate next step.**

### 4b. Medium: SDF outline atlas (Canvas2D)

Pre-render each shape as a Signed Distance Field. The fill + outline
are both derived from a single grayscale sample at draw time. Lets you
get free anti-aliased outlines at any scale with one atlas.

Useful for the shop / radial menu icons too. Effort: medium, ~half a day.

### 4c. Big win: WebGL instanced renderer (next major)

See Section 3. Effort: 2–3 days mirroring the particle renderer. The
black outline drops out for free once the SDF atlas is in place.

### 4d. The shadowBlur trap to avoid

`ctx.shadowBlur` is the wrong tool for bullets specifically because:

1. It runs on **every** subsequent draw call until reset, and most
   bullet-loop code doesn't reset between bullets — so a forgotten
   `shadowBlur` leaks into HUD draws.
2. The blur radius is fixed (`shadowBlur=2.5`), but the visual
   "outline thickness" you actually want is fixed in **screen pixels**.
   A single shape that grows (Big Bullets, Charged Shot) ends up with
   a thinner-looking halo because the same blur pixels are spread over
   a bigger sprite.
3. The Gaussian blur pass is GPU-bandwidth-bound on integrated
   chipsets — it doesn't compose well with the rest of the canvas
   pipeline.

A baked outline sprite or SDF doesn't have any of these problems.

---

## 5. Concrete recommendations (ordered by ROI)

| #   | Change                                                                                                       | Effort          | Frame cost recovered                            | Notes                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------- | ------------------------------------------------ |
| 1   | Replace `shadowBlur` on bullets with **baked outline sprites** in `glowSpriteCache`                          | ~2 hours        | **~70% of bullet stroke cost (≈1 ms at heavy)** | No WebGL needed; works on every browser.         |
| 2   | Cache the Arc Lightning frayed-static strands at 60 fps as a per-frame VBO and reuse for the next 2–3 frames | ~1 hour         | **~50% of arc-static cost**                     | Trades a tiny bit of jitter for ~300 µs savings. |
| 3   | Drop the per-mine / per-missile shadow halo and use the same baked-outline approach as bullets               | ~1 hour         | ~80–120 µs                                      | Visual parity.                                   |
| 4   | Build a `WebGLBulletRenderer` mirroring the particle/starfield ones                                          | 2–3 days        | **6–11% of frame budget at heavy density**      | Unlocks 2–3× higher bullet counts before drops.  |
| 5   | Migrate enemy bullets to the same WebGL pipeline                                                             | +1 day after #4 | Additional ~5% at peak                          | Same atlas.                                      |
| 6   | (Future) SDF atlas for HUD icons + powerup glyphs                                                            | +1 day          | Crisp scaling, free outlines                    | Quality, not perf.                               |

**If we only do one thing: do #1.** Two hours of work, removes the
bullet `shadowBlur` from every browser's hot path, and the rendering
gets crisper too because the cached sprite is pixel-aligned at the
right scale.

---

## 6. Validation plan (when implementing)

The repo already has perf infrastructure:

- `npm run perf` — mitata microbenchmarks. Add a `bullet-render.bench.js`
  that draws N=50/150/250 bullets in a loop and times Canvas2D current
  vs the new baked-sprite path.
- `npm run test:e2e:performance` — Playwright FPS tests. Use the
  storm-needles + multi-shot scenario to drive bullet count past 150
  and assert FPS stays above 55.
- `tools/juice-capture.mjs` — captures the canvas at 60 fps. Use it to
  verify the baked outline reads identical to `shadowBlur` at the
  intended draw scale.

Track median frame time before/after; we expect:

- After #1: median frame at heavy combat **−1.0 ms** (≈ 6%).
- After #4 + #5: median frame at heavy combat **−2.0 ms** (≈ 12%).

---

## 7. Notes on what NOT to optimize

- The player ship's silhouette pass (~50 µs/frame) is fine. It's a
  fixed cost, draws once, and the outline quality (hard pixels at the
  exact ship edge) is better than what `shadowBlur` would produce.
- Title-screen `strokeText` is fine — runs once on a static screen.
- Nova rings have a black under-stroke (not shadow) — also fine.
- Don't move particles to the new sprite atlas. The
  `WebGLParticleRenderer` already handles those, and Canvas2D
  particles use additive blending which doesn't compose with outlines
  anyway.
