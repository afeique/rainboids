# WebGL Debris and Asteroids — Plan & Cost — 2026-05-04

Follow-up to:
- `WebGL Migration Analysis – 2026-05-04.md` (full audit)
- `WebGL Particle Hybrid – Plan & Cost – 2026-05-04.md` (the particle plan, shipped in 5.64.0)

The particle hybrid is live. This doc prices out the next two candidates
that came up in the analysis: **line debris** (small) and **asteroid
wireframes** (large). Both are stroked-line rendering paths that could
plug into the same instanced-quad pipeline as particles.

## Shared architecture for both

Both systems become *additional consumers* of the existing
`WebGLParticleRenderer`. Each line segment becomes one instanced quad:

- Instance position = midpoint of the line in world coords
- Instance size = (length, thickness)
- Instance angle = atan2(end - start)
- Instance color = the segment's color (RGBA)
- Instance UV → a new "line" atlas slot (solid white rectangle with a
  thin alpha falloff at top/bottom for soft edges, sharp horizontal)

Adding the line slot expands the atlas from 1024×256 → 1280×256
(adds one 256×256 slot). VRAM cost: +256KB. Negligible.

The renderer needs a small API surface to accept these batches without
filtering by `TYPE_TO_SLOT`. Cleanest extension:

```js
renderer.beginCustomBatch();
renderer.drawSegment(x1, y1, x2, y2, thickness, r, g, b, a, 'line');
renderer.endCustomBatch(camX, camY);
```

`drawSegment` does the midpoint + length + angle math and writes one
instance into the same VBO scratch buffer used by particles. The final
`endCustomBatch` issues one `drawArraysInstanced` call.

If we render BOTH debris and asteroid edges through the same batch
(same atlas slot, same draw call), they cost the same as one giant
particle frame. Coalescing saves at most a few µs per frame; not the
goal, but free.

---

## Part A — LineDebris

### Current state

- `js/modules/world/line-debris.js` — 80 LOC, one class
- Pool size: 20 (raised from default — small)
- Each instance is a 2-vertex segment with:
  - Per-frame position update (linear motion)
  - Per-frame rotation (`this.rot += this.rotVel`)
  - Per-frame hue cycle (rainbow mode) OR fixed color
  - Lifetime decay (`life -= 0.02` → 50-frame ≈ 0.83s lifetime)
- Spawn pattern: ~30 segments per asteroid destruction (`createAsteroidDebris`),
  ~10-20 per enemy `createShapeDebris` call
- Typical active count: 0-30 mid-frame, peaks ~60 in dense wave-clear moments

### Per-frame Canvas2D draw cost

Per LineDebris.draw:
- `ctx.save()` — push state (~0.5µs)
- `ctx.translate` + `ctx.rotate` — matrix mult (~0.3µs)
- Set globalAlpha + strokeStyle — state thrash (~0.2µs)
- `beginPath` + `moveTo` + `lineTo` + `stroke` — actual path (~1.5µs)
- `ctx.restore` — pop state (~0.5µs)

**~3µs per debris**. At a typical peak of 30 active, that's ~90µs/frame
(0.5% of the 16.6ms budget). At an extreme peak of 60, ~180µs (1%).

### WebGL cost

One instanced draw call for ALL debris. ~50ns per instance.
30 active = 1.5µs/frame. 60 active = 3µs/frame.

### Net win

| Active debris | Canvas2D | WebGL | Saved |
|---|---|---|---|
| 10 (typical idle) | 30µs | 0.5µs | ~30µs (~0.2%) |
| 30 (typical action) | 90µs | 1.5µs | ~90µs (~0.5%) |
| 60 (peak) | 180µs | 3µs | ~180µs (~1%) |

**Verdict: <1% frame-time win even at peak. Not worth the migration cost.**

### Migration cost (if we did it)

| Area | LOC delta |
|---|---|
| Atlas — add line slot | +25 |
| Renderer — `drawSegment()` API + custom batch | +60 |
| line-debris.js — replace `draw()` with renderer call | -25 +20 = ±0 |
| game-engine.js — wire LineDebris into the WebGL frame | +10 |
| Tests — line debris visual parity | +30 |
| **Total** | **~+120 / -25 LOC** |

Calendar: 1-2 focused days.

### Recommendation: **DO NOT MIGRATE**

LineDebris frame share is sub-1%. The visual difference between a
crisp Canvas2D `ctx.stroke` line and a textured quad approximating it
is most noticeable on short, thin segments — exactly what debris is.
Risk:reward is poor.

Revisit ONLY if:
- We add a debris-spawning weapon (massive multi-asteroid kills) that
  drives active count > 200, or
- Debris becomes a persistent visual element (e.g. battlefield
  litter that stays for the whole wave instead of decaying in 0.83s).

---

## Part B — Asteroid wireframes

### Current state

- 12 vertices per asteroid, 30 edges in `this.edges`
- Per-frame work in `Asteroid.update` + `Asteroid.draw`:
  - Update 3D rotation (`rot3D += rotVel3D`) — ~5 multiplies
  - Project 12 vertices through perspective divide using sin/cos LUT
    (lazy, per-frame stagger keeps half on cached projection)
  - Group 30 edges into 5 depth buckets by alpha
  - Per bucket: 1 `beginPath` + N `moveTo`/`lineTo` + 1 `stroke`
- 5 strokes total per asteroid (down from 30 before 5.61.0)
- Pool size: 5 default, max active in late waves ~12 (`MAX_WAVE_ASTEROIDS`)

### Per-frame Canvas2D draw cost

Per asteroid:
- 3D matrix update: ~1µs
- 12-vertex projection: ~3-4µs (with LUT + stagger, was ~8µs pre-5.61.0)
- 30 edges × bucket-and-write: ~2µs
- 5 strokes (one per bucket, each a multi-segment path): ~12-18µs
- Hue/alpha computation per edge: ~3µs
- Total: **~20-30µs per asteroid**

At 12 active asteroids: **~250-360µs/frame** (1.5-2.2% of frame). At peak
during cluster spawns or boss waves where sub-asteroids spawn, can hit
~500µs (3%).

The WebGL Migration Analysis (2026-05-04) estimated 15-20% of frame
share for this category; that included the projection cost. Our
measured share of just the *render* portion is ~1.5-2.2%, which is
already much better than the estimate due to the 5.61.0 bucketing
and projection-stagger.

### WebGL cost

Per asteroid:
- 3D matrix + projection still on CPU (unchanged) — ~5µs
- Hue/alpha/bucket computation: replaced by pack-into-instance — ~1.5µs
- 30 instance writes (one per edge): ~30 × 50ns = 1.5µs
- Total: **~8µs per asteroid CPU-side**, ~50ns/edge GPU-side

12 asteroids × 8µs CPU + 360 edges × 50ns GPU = **~115µs/frame**.

### Net win

| Active asteroids | Canvas2D | WebGL | Saved |
|---|---|---|---|
| 4 (early waves) | 100µs | 35µs | ~65µs (~0.4%) |
| 8 (mid waves) | 200µs | 70µs | ~130µs (~0.8%) |
| 12 (late / capped) | 320µs | 115µs | ~200µs (~1.2%) |
| 20 (boss bursts) | 540µs | 195µs | ~345µs (~2.1%) |

**Verdict: 1-2% frame-time win at peak. Real but modest.**

### Migration cost (if we did it)

| Area | LOC delta |
|---|---|
| Atlas — add line slot (shared with debris) | +25 |
| Renderer — `drawSegment()` API (shared with debris) | +60 |
| Asteroid.drawAsteroidShape — rewrite to emit instances | -60 +50 |
| Hue/alpha computation moved into instance pack | (already there) |
| game-engine.js — wire asteroid edges into WebGL frame | +20 |
| Visual parity tests — multi-asteroid screenshots | +50 |
| Hot-edge thickness control (lineWidth uniform) | +15 |
| **Total** | **~+220 / -60 LOC** |

Calendar: 4-6 focused days. Risk: medium.

### Visual fidelity risk

Canvas2D `ctx.stroke` with `lineWidth = 2` produces:
- Sub-pixel-aware antialiased edges
- Joins/caps handled by the rasterizer
- Crisp at any zoom level

WebGL textured-quad lines:
- Antialiasing is from the atlas alpha falloff, not GPU-native
- Caps need explicit alpha shaping in the texture (round caps need
  rounded ends in the atlas, but those scale poorly with quad length)
- 2px-wide quads at long lengths can shimmer slightly during rotation
  (Moiré artifact from the texture sampling)

A custom shader using SDF (signed-distance-field) line rendering
solves all three but adds another ~2 days. For asteroid wireframes
specifically, the visual difference is subtle but noticeable
side-by-side; the texture shimmer would show up on slowly-rotating
asteroids.

### Decision matrix

| Goal | Recommendation |
|---|---|
| 1-2% frame-time win on late-wave / boss frames | Migrate, accept slight visual change |
| Crisp wireframes are part of the game's identity | Keep Canvas2D |
| Adding more asteroids per wave (>20) | Migrate |
| Adding bloom/HDR post-processing | Migrate (the post-pass needs everything in one render target anyway) |

### Recommendation: **CONDITIONAL — wait for one of these triggers**

The 1-2% win is real but not transformational. Migrate if any of these
become true:

1. **MAX_WAVE_ASTEROIDS lifts past 20** (current cap is 12). Cluster
   spawns or split-on-hit mechanics would push us into the 3%+ win
   range where the work pays off.
2. **We start hitting frame-budget walls** in late-wave gameplay even
   after 5.64.0's WebGL particle migration. Boss waves with simultaneous
   ~40 entity flux are the canary.
3. **We want a post-process pipeline** (bloom, chromatic aberration,
   screen-space distortion). All entities have to be in one render
   target for a single post-pass; asteroid migration is a prereq.

If none of those land, **stay on Canvas2D**. The 5.61.0 bucketing
already ate the lowest-hanging fruit; the remaining 1-2% isn't worth
the visual-fidelity risk.

---

## Combined recommendation

| System | Action | Why |
|---|---|---|
| Particles | Migrated in 5.64.0 | 3-7% frame win + cap headroom for design |
| Line debris | **Skip** | <1% win, even at peak |
| Asteroid wireframes | **Defer** | 1-2% win, real visual risk, no current frame-budget pressure |

The natural next perf lever — once we've used up everything else — is
**adaptive particle quality** (already planned in
`docs/Performance Optimization Plan – 2026-05-03.md`). That gives us
fail-safe headroom without touching any rendering pipeline.

If we ever DO migrate asteroids, we should bundle debris with it (same
atlas slot, same `drawSegment` API) — the marginal cost of carrying
debris along is ~10 LOC once the line infrastructure is in.

## Pool overhead — already addressed

The 5.64.0 WebGL particle migration unlocked a `MAX_PARTICLES` bump
600 → 2500 (5.64.2). At 50ns per particle in WebGL, even 2500 active
costs only ~125µs/frame — well under the 1ms threshold where a single
subsystem becomes a budget concern.

For debris and asteroids, no pool bump is currently warranted:

| Pool | Current cap | Frame impact at cap | Bump worth it? |
|---|---|---|---|
| `lineDebrisPool` | 20 | ~60µs | Already fits headroom |
| `asteroidPool` | 5 (active up to 12) | ~360µs | Wave gating, not pool size, is the limiter |

If we migrate either to WebGL later, these caps become essentially
free to raise.
