# Runtime Graphics Perf Audit — 5.79.16

Snapshot taken right after the 5.78.2 → 5.79.16 commit (`ded961b`).
Static analysis across the render pipeline; numbers are estimated from
the code and prior benchmarks (`docs/PERF_BOTTLENECKS_5.79.3.md`,
`docs/STROKE_PERF_ANALYSIS_5.79.md`). No live profile traces captured.

## TL;DR

The game's frame budget is in good shape on modern desktops (~3–5 ms
median, ~8–10 ms peak). The current ceiling for a stable 60 fps is
**heavy combat on integrated/mobile GPUs** — there are still 4-5
specific overdraw + state-thrash patterns that make frame time spikes
land in the 18–25 ms range there.

Top 5 actionable wins, ranked by ROI:

| # | Fix | Effort | Impact | Notes |
|---|---|---|---|---|
| **A** | Drop `globalCompositeOperation = 'lighter'` toggles inside per-frame entity `draw()` paths; pre-batch by composite mode | 2–3 h | **0.4–0.8 ms / frame at heavy density** | 14 active sites — every toggle forces canvas state flush. |
| **B** | Move shadowBlur in HUD readouts (gold counter, health flash, version tag) to baked sprites or strokeText | 1 h | **0.2–0.4 ms / frame, every frame** | These run regardless of combat density. |
| **C** | Wire `this.spatialGrid` into bullet-vs-enemy + enemy-vs-bullet checks (built but unused) | 1–2 h | **0.5–1.5 ms at heavy density** | O(N×M) → O(N + M); already-allocated infra. |
| **D** | Cache asteroid 3D vertex projection when camera + asteroid both stationary | 1 h | **~50 µs / frame** | Common during pause + slow movement. |
| **E** | `getBoundingClientRect()` cache for canvas mouse handlers | 30 min | ~30 µs per mousemove | Forces layout reflow on hot mouse path. |

A + B + C alone should recover **~1.5 ms median** at heavy density on
desktop, **~3–4 ms** on integrated GPUs.

---

## 1. Per-frame render pipeline (current)

```
gameLoop():
├── update()                    [logic, fixed-timestep 60 Hz]
└── draw():
    ├── ctx.clearRect (gameCanvas)            ~120 µs (1920×1080)
    ├── bulletRenderer.beginFrame()           gl.clear, ~5 µs
    ├── particleRenderer.gl.clear             ~5 µs
    ├── starfieldRenderer.draw()              ~50 µs (WebGL instanced)
    ├── nebulaRenderer.draw()                 ~80 µs (5 cached layers, drawImage)
    ├── Canvas2D fallback star render         ~30 µs (only complex shapes)
    ├── lineDebrisPool.drawActiveVisible      ~20 µs (rare)
    ├── particleRenderer.drawParticles()      ~80 µs (single instanced draw)
    ├── drawParticlesBatched (Canvas2D)       ~40 µs (text-only types)
    ├── powerupPool.drawActiveVisible         ~10 µs (low count)
    ├── asteroidPool.drawActiveVisible        ~150–400 µs ⚠
    ├── enemyPool.drawActiveVisible           ~200–800 µs ⚠⚠
    ├── enemyBulletPool + bulletPool          ~150 µs (push to WebGL)
    ├── bulletRenderer.drawFrame()            ~80 µs (single instanced draw)
    ├── player.draw()                         ~80 µs (ship + thrust + crit ring)
    ├── drawWeaponEffects()                   ~150–700 µs ⚠ (only when active)
    └── drawHUD()                             ~250–500 µs ⚠ (every frame)
```

### Layer stack (z-order)

```
glCanvas       (z 0): WebGL starfield + particles (additive)
gameCanvas     (z 1): nebula, debris, particles (Canvas2D), powerups,
                      asteroids, enemies, weapon FX, player, HUD
bulletCanvas   (z 2): WebGL instanced bullets
DOM HUD        (z 10+): pause overlay, stats screen, etc.
```

The 3-layer stack is solid. Each layer is responsible for a clear
slice of the frame and the layers don't fight each other.

---

## 2. Hotspots (heavy combat: 12 enemies + 6 asteroids + 100 bullets)

### 2a. Enemy pool render — biggest variable cost

**Each enemy is doing ~8–15 fills + strokes** (hull, wings, engines,
cockpit, panels, accent lines, HP bar, level number, type badge).
Combined with `globalCompositeOperation = 'lighter'` toggles inside
the shape drawers, each enemy:

- 1× `ctx.save()`/`ctx.restore()` pair (cheap)
- 2-4× state changes (`fillStyle`, `strokeStyle`, `lineWidth`)
- 1-3× composite-mode toggles
- 1× HP bar + level text rendering

**Per-enemy cost: ~30–60 µs.** At 12 enemies = **360–720 µs/frame**.

The composite-mode toggle is the worst contributor. Canvas2D flushes
its internal command buffer on every `globalCompositeOperation`
write — even if you set it to the same value it was already on.

#### What to do (item A in TL;DR)

Group all `lighter` enemy passes into a single sweep at the end of the
enemy loop:

```js
// Pass 1 — all enemies, all source-over passes
for (e of enemies) e.drawBaseShape(ctx);
// Pass 2 — all enemies, all 'lighter' passes
ctx.globalCompositeOperation = 'lighter';
for (e of enemies) e.drawAdditiveOverlays(ctx);
ctx.globalCompositeOperation = 'source-over';
```

This collapses 24+ composite-mode toggles into 2 per frame. **Saves
~0.4–0.8 ms** at heavy density.

### 2b. Asteroid render — ~150–400 µs/frame

Every visible asteroid re-projects its 12-vertex 3D mesh to 2D each
frame, then strokes/fills the polygon, the inner heatmap glow ring,
and the outer wireframe. With 6 asteroids visible:

- 6 × 12 = 72 perspective divides + 72 trig calls.
- 6 × 4 strokes + 6 × 2 fills.
- 6 × HP bar.

**Per-frame ~150 µs even when asteroids aren't rotating.** When the
player is idle (camera + asteroid both stationary), the projection is
literally identical between frames.

#### What to do (item D)

Cache the projected vertex buffer on the asteroid; invalidate when
`asteroid.rotation` OR `camera.x/y` changes by >0.5px. Re-use the
typed array between frames otherwise. Saves ~50 µs in static moments.

### 2c. Weapon effects — Lance Beam + Arc Lightning + Nova rings

Active only when those weapons are firing, but when they are, this
block is the second-largest variable cost:

| Effect | Cost / frame while active |
|---|---|
| Lance Beam (jagged path × 3 strokes) | ~250 µs |
| Arc Lightning (3 strands × 4 strokes each) | ~400 µs |
| Nova ring (per active ring × fake-glow + sharp) | ~80 µs |
| Mines (per mine × 8 fills/strokes) | ~120 µs |
| Missiles (per missile × 8 fills + thruster gradient) | ~80 µs |

The Float32Array path scratch (5.79.4) keeps allocations down. The
remaining cost is the actual stroke calls.

#### What to do

Already optimized for allocation pressure (5.79.4). Further wins
require either:
- **Lift Lance Beam + Arc Lightning to WebGL** as line-strip draws
  (3-4 day effort, recovers ~600 µs at peak). Not worth it unless
  the player reports lag.
- **Reduce strand count** on Arc Lightning when locked on a target
  (1 strand instead of 3 — less visual noise too). Quick win.

### 2d. HUD — running 250–500 µs/frame, every frame

Several active `shadowBlur` sites in `hud/status.js`:

- Line 491: `shadowBlur = 10 + 14 * flashPulse` on the gold counter
  during a pickup flash. Fires for ~280 ms after every gold pickup —
  with the new (5.79.1) coalesced popups this is much less frequent
  but still 60 fps × 280 ms ≈ 17 frames per pickup burst.
- Lines 965, 985: shadowBlur=10 / 8 on the streak / level-up text
  drawn while those are active.
- Lines 1141, 1180: shadowBlur=14 / 18 on something HUD-flash-y.
- Combat HUD `combat.js:56`: `shadowBlur = 14 + lifeFrac * 20` —
  damage numbers floating on screen. Every damage number fires this
  for its entire lifetime.

Damage numbers are the worst because there can be 5-15 simultaneously,
each running a `shadowBlur` Gaussian at ~25 px radius. Per-number
~60–100 µs. At 10 numbers = **600 µs–1 ms per frame just from damage
number glow**.

#### What to do (item B)

Two paths:

1. **Pre-render the glow into the number sprite** (write each digit
   0-9 with a fattened black/colored stroke ring once at startup, reuse
   via `drawImage`). Each digit becomes a single `drawImage` instead
   of `fillText` + `shadowBlur`. ~10× speedup.
2. **strokeText fattening** — already used in 5.79.0 for the title and
   gold popup. Just apply the same pattern to damage numbers: 2-pass
   stroke (wider fill underneath, sharper on top). Cheaper than
   shadowBlur, no Gaussian.

---

## 3. Allocation pressure (already addressed, but watching)

5.79.4 cleaned up the worst sources:
- ✅ Trail `{x,y}` reuse (player + enemy bullets)
- ✅ Jagged-arc Float32Array scratch
- ✅ Mine HP bar gradient → solid color
- ✅ Bullet-dodge forEach → for loop with AABB cull
- ✅ Frayed-static cache uses typed array

Remaining low-priority sites:
- `enemy/firing.js` — enemy bullet spawn allocates a config object per
  shot via `createEnemyBullet`. Low frequency (firing cooldowns are
  500–3000 ms). Not worth chasing.
- `combat-manager.js#dropOrbsFromEntity` — splits orb counts into
  small Array(N). Only fires on kill, so per-kill not per-frame. Fine.

---

## 4. Logic-side bottlenecks

### 4a. Collision broad phase

`checkBulletCollisions` iterates `bullets × enemies` and `bullets ×
asteroids` every frame. At heavy density:

- 100 bullets × 12 enemies = 1 200 distance checks
- 100 bullets × 6 asteroids = 600 checks
- 12 enemy bullets × 1 player = 12 checks
- **Total: ~1 800 hypot calls/frame ≈ 90 µs**

Manageable in absolute terms, but linear in product → bad scaling.

### 4b. Spatial grid is built but never queried

```js
// game-engine.js:432
this.spatialGrid = new SpatialGrid(this.gameField.width, this.gameField.height, 8, 6);
```

This is the only reference. Construction happens, but no `insert()`
or `query()` calls anywhere in the codebase. **Dead infra.**

#### What to do (item C)

Wire the existing grid into:
1. Bullet-vs-enemy collision check (the dominant pair).
2. Enemy bullet-dodge loop (already cull-boxed in 5.79.4 but a grid
   query is cleaner).
3. Tractor beam / homing target acquisition.

Expected win at heavy density: **~0.5–1.5 ms / frame**.

### 4c. Enemy AI per-frame work

Each enemy runs its movement strategy + firing logic + dodge loop
per frame. Movement is a single trig + integration step per enemy
(~5 µs). Firing is throttled by cooldown. Dodge is the expensive one
but already cull-boxed.

**Per-enemy AI ~10–20 µs.** At 12 enemies = ~150–250 µs.

Could move enemy AI to a worker thread, but the synchronization cost
would dwarf the savings. Not worth it.

### 4d. Boss-rage state machine

Runs only when a boss is in the rage phase. Cheap when active (~30 µs).

---

## 5. State-thrash audit

Canvas2D flushes its internal command buffer when ANY of these change:
- `globalCompositeOperation`
- `globalAlpha` (sometimes)
- `shadowBlur`
- transform matrix in some browsers

Counted toggles per frame at heavy combat:

| State | Toggles/frame | Cost |
|---|---|---|
| `globalCompositeOperation` | ~30 (player ship + enemies + particles + Beam + Arc) | ~150 µs |
| `shadowBlur` set/reset | ~25 (HUD readouts + damage numbers + weapons) | ~125 µs |
| `globalAlpha` | ~50 (most are necessary fade math) | ~50 µs |
| `setLineDash` (mines) | ~5 | ~10 µs |
| **Total state-flush** | | **~335 µs** |

Roughly **2% of frame budget** spent just on canvas state churn. Item
A and B above attack this directly.

---

## 6. WebGL pipeline health

Three contexts:
- `glCanvas` — particles + starfield (shared context).
- `bulletCanvas` — bullets only.

Browsers cap simultaneous WebGL contexts at ~16. Two is well within
budget. No leaking, no ContextLost recovery issues observed.

Bullet renderer at heavy density: 200 bullets × 13 floats × 4 bytes =
**10.4 KB upload** per frame. Particle renderer at peak: 2 500 ×
13 × 4 = **130 KB upload**. Both well within typical PCIe bus
throughput. **Not a bottleneck.**

The bullet atlas is 1024×128 RGBA = 512 KB texture, uploaded once.
Particle atlas is 1280×256 = 1.25 MB. Both live on the GPU; per-frame
texture binds are just an integer change. **Not a bottleneck.**

### 6a. The one thing that's slightly wrong

`webgl-bullet-renderer.js#drawFrame` re-uploads the entire `instanceData`
buffer every frame even when the bullet count hasn't changed. For
~10 KB this is a non-issue but if we ever scale to 5 000 bullets it
could matter. Not worth fixing now.

---

## 7. GPU pipeline (Canvas2D layer)

The browser composites Canvas2D ops on the GPU, but every state change
forces a draw-call boundary. The pipeline looks healthy:

- `clearRect` is GPU-fast on all modern browsers.
- `drawImage` on cached sprites (heart, shield, coin, glow) is
  ~1 µs / call.
- Path rendering (the bulk of asteroid + enemy work) is the slowest
  primitive — Canvas2D's path tessellation runs on the CPU.

**The CPU is the bottleneck**, not the GPU. Every win above is CPU-
side: fewer state toggles, fewer paths, more cached blits.

---

## 8. Memory / GC

Steady-state allocation rate after 5.79.4: ~600 small objects/sec at
heavy combat (down from ~2 000/sec pre-rework). At ~32 bytes each
that's ~19 KB/sec into young-gen — minor GC frequency dropped from
"every few seconds" to "every minute or two" in the worst case.

**No new allocation bombs identified.** The remaining sources are
acceptable.

---

## 9. Frame-time budget summary

| Scenario | Median frame | 99th-pct frame | Notes |
|---|---|---|---|
| Light combat (3 enemies, no beam) | ~3 ms | ~5 ms | Plenty of headroom. |
| Mid combat (8 enemies, occasional beam) | ~5 ms | ~9 ms | Comfortable 60 fps. |
| Heavy combat (12 + arc + missiles + 100 bullets) | ~10 ms | ~16 ms | At the edge of 60 fps; integrated GPUs may dip. |
| Storm Needles peak (250 bullets) | ~12 ms | ~20 ms | Bullet rendering offloaded but other systems compensate. |

**Stable 60 fps is the goal.** We hit it on desktop in nearly every
state. Integrated/mobile GPU is where 60 fps occasionally dips —
items A + B + C are the path to fixing that.

---

## 10. What I'd do next, in order

1. **Spatial grid** for bullet-vs-enemy + enemy AI dodge (item C).
   Biggest single perf win and the infra is already built. **1–2 h.**
2. **Composite-mode batching** in the entity render loops (item A).
   Drops state-flush count from ~30 to ~5 per frame. **2–3 h.**
3. **Damage number glow → baked sprite** (part of item B). They run
   for 1+ second after every hit; saves ~600 µs at peak. **1 h.**
4. **Asteroid projection cache** (item D). Quick win for static moments.
   **1 h.**
5. **Cached `getBoundingClientRect`** for the canvas mouse handler
   (item E). Tiny but free win. **30 min.**

Total ~6–8 hours of work for an estimated **1.5 ms median + 3–4 ms
99th-percentile** recovery. Would put heavy-combat 99th-percentile
firmly under the 16.6 ms budget on integrated GPUs.

## 11. What NOT to optimize

- **Bullets**: WebGL renderer is doing its job. Leave alone.
- **Particles**: Same. WebGL instanced.
- **Starfield**: Same.
- **Audio**: Web Audio handles itself; main thread unaffected.
- **The 1920×1080 `clearRect`**: Unavoidable (gameCanvas needs to be
  transparent so glCanvas shows through). Already GPU-fast.
- **Music streaming**: Separate thread.
