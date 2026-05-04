# Performance Optimization Plan — Late-Wave Focus

## Current bottlenecks (suspected)

Based on code audit of the hot path during a wave-15+ scenario with
3-4 enemies + 4 asteroids active, ~80-150 particles in flight, and
the player firing rapid-fire multi-shot:

1. **Particle update + draw** (~200 active per spike). Per-particle
   `ctx.fillStyle = ...` causes GPU state thrash on Canvas2D. Each
   `explosionShrapnel` issues a `ctx.fillRect` + length/angle
   computation. Mine explosions burst ~150+ particles in one frame.

2. **Enemy AI inner loops** (O(N) per enemy, called every tick):
   - `avoidAsteroids` walks every active asteroid
   - `maintainDistanceFromEnemies` walks every other enemy (O(N²))
   - `dodgeEnemyBullets` walks the entire enemy-bullet pool
   - `dodgePlayerBullets` walks the entire player-bullet pool
   With 6 enemies + 12 asteroids + 30 bullets in late waves, that's
   ~6·(12 + 6 + 30 + 30) = 468 inner iterations per tick.

3. **Asteroid 3D projection** runs lazily on `_projectionDirty`, which
   is set every tick (rotation is updated every frame). So every
   visible asteroid re-projects 12 vertices per frame.

4. **Light trails** — every enemy maintains a deque of past positions.
   Trail draw uses gradient + multiple strokes.

5. **`shadowBlur` usage** — Canvas2D's drop-shadow is GPU-expensive.
   The Lance Beam, Lightning Arc, mine LEDs, and several HUD elements
   set non-zero shadowBlur every frame.

6. **Background star culling** runs `getVisibleStars` which filters
   the pool every frame. With ~3000 background + color stars the
   filter is a measurable cost.

7. **Mine + nova + lightning + missile draw passes** each iterate
   their own sub-arrays (small) but spawn additional particles each
   frame the effect is alive.

## Idea 1 — Gameplay changes (player-visible)

These trade a bit of visual richness for headroom.

- **Adaptive particle quality**: track rolling FPS; when it drops
  under 50fps for 60+ frames, halve the particle counts on subsequent
  bursts (mine explosion goes from 44 shrapnel → 22, etc.). Restore
  when FPS recovers. *Estimated savings: 30-40% particle CPU during
  high-stress moments. Visual cost: explosions feel slightly less
  dense during boss waves but never seizes.*

- **Throttle enemy AI**: in late waves (15+), update each enemy's
  full AI on a 2-frame stagger (half on even frames, half on odd).
  AI decisions update at 30Hz; movement integration still runs at
  60Hz so it looks smooth. *Estimated savings: ~50% of AI cost.
  Risk: enemies feel fractionally less responsive — should be
  imperceptible at the steeper campaign speed mult.*

- **Cap enemy trail length** based on wave number: full trails at
  waves 1-10, halved at 11-15, quartered at 16-20. *Estimated
  savings: small but free.*

- **Reduce background star count** when wave > 15. Currently the
  background pool has thousands of entries. Could disable the
  smallest depth bucket (z < 0.3) in late waves — these stars are
  barely visible anyway. *Estimated savings: ~20% star draw.*

- **Drop shadowBlur from mine LEDs and hit flashes** during high
  stress. Replace with pre-baked glow sprites. *Estimated savings:
  variable; shadowBlur on a 220-particle frame can be the dominant
  GPU cost.*

## Idea 2 — Technical optimizations (no player-visible changes)

- **Pre-bake glow sprites** for: explosion flashes, embers, sparkles.
  Currently each spawns a radial gradient per draw. Replace with
  a single offscreen canvas (one per color family), then `drawImage`
  with scale. *Estimated savings: 50-70% of particle render cost
  for the affected types.*

- **Sort particles by color before draw** so `fillStyle` only
  changes on color boundaries. The depth-batch renderer already does
  this for stars; particles do not. *Estimated savings: 15-25% of
  particle render cost.*

- **Spatial-grid the bullet pools** for enemy AI dodge checks. The
  collision system already builds a spatial grid for bullets;
  `dodgeEnemyBullets` could reuse it instead of scanning the full
  pool. *Estimated savings: O(N·M) → O(N·k) where k is the small
  number of bullets in the enemy's neighbourhood.*

- **Asteroid projection skip**: asteroids that haven't rotated
  significantly since their last projection (delta < ~0.02 rad on
  any axis) can reuse the cached projected vertices. The projection
  is pixel-imperceptible at small angle deltas. *Estimated savings:
  ~70% of projection cost when the player isn't moving.*

- **Combine `enemy.maintainDistanceFromEnemies` into a single pass**:
  iterate the enemy pool once, build a coarse grid of enemy positions,
  query in the AI loop. Cuts the O(N²) check to O(N). *Estimated
  savings: scales with enemy count squared — most useful in waves
  16-20.*

- **Frame-skip off-screen enemies**: enemies completely outside the
  viewport can update on a 4-frame stagger (their positions still
  integrate every frame, but AI logic runs at 15Hz instead of 60Hz).
  Resumes full update the moment they enter the camera bounds.
  *Estimated savings: large in early/mid waves, small in late waves
  since most enemies are on-screen.*

- **Replace `Math.hypot(dx, dy)` with `dx*dx + dy*dy` for
  distance comparisons**. Already a common pattern but a few hot
  paths still call hypot. *Estimated savings: small but free.*

- **Pre-allocate temporary objects in tight loops**. Several places
  do `{ x: ..., y: ... }` per particle frame; allocates GC pressure.
  Use a shared scratch buffer pattern (already done in some places).
  *Estimated savings: smoother frame times, less GC stutter.*

- **Replace `forEach` with classic `for` loops in hot paths**.
  `forEach` is measurably slower than `for (let i = 0; ...)` on V8
  for short callbacks. The collision system, particle pool, and AI
  inner loops all use `forEach` in places. *Estimated savings: 5-10%
  on inner-loop CPU.*

- **Cache `getActivePrimaryConfig()` / `getActivePowerConfig()`
  results** per frame. Some hot paths call them multiple times and
  the result only changes on weapon swap. *Estimated savings: small.*

- **OffscreenCanvas + worker for nebula re-paint**. The nebula is
  baked once per run, so this is moot — but if we ever add live
  nebula effects, move them to a worker.

## Recommended priority order (highest payoff first)

1. **Pre-bake glow sprites for explosionFlash / Ember / Shrapnel /
   ColoredRing**. Single biggest win against GPU thrash from
   per-frame `createRadialGradient` and `shadowBlur`. Estimated
   ~30% frame-time reduction during peak particle bursts.

2. **Sort particles by color before draw**. Cheap to implement,
   stacks with idea 1. Another 10-15%.

3. **Throttle enemy AI to 30Hz in waves 15+**. 50% AI cost
   reduction at the moment we need it most.

4. **Asteroid projection skip on small angle deltas**. Free
   most of the time, 60-70% projection cost back when the field is
   stable.

5. **Adaptive particle quality** (FPS-driven). The fail-safe — even
   if 1-4 don't land enough, this guarantees the game never stutters.

6. **Reuse spatial grid for AI dodge queries**. Late-game polish.

7. **Background star count reduction in late waves**. Easy and free.

## Plan B (if perf is still bad after the above)

- Profile (Chrome perf tab) at wave 18-20 to identify the actual
  bottleneck — the suspected list is educated guess; profiling
  may reveal something unexpected (e.g. shop-DOM sync).

- Consider WebGL backend for particles + nebula. Major lift but
  could 5-10x particle throughput.

- Batch all `explosionShrapnel` and `explosionEmber` instances into a
  single point-cloud draw with an instanced sprite shader.

## Notes

- MAX_PARTICLES is already adaptive in spirit (220 cap with eviction).
  The cap itself isn't the problem — it's the per-particle CPU cost
  during the 1-2 frames after a mine explosion when 150+ are spawned
  simultaneously.

- The nebula renderer is a model performance citizen: pre-baked
  offscreen, one drawImage per layer, parallax via cheap arithmetic.

- `depthBatchRenderer` for stars is the template: bucket → draw all
  with one fillStyle change → done. The same pattern applied to
  particles is the highest-leverage win identified here.
