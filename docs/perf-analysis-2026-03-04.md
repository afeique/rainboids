# Rainboids — Performance Analysis
**Date:** 2026-03-04
**Scope:** Full codebase review (JS modules, CSS, HTML)

---

## Summary

| Severity | Count |
|----------|-------|
| High     | 5     |
| Medium   | 9     |
| Low      | 6     |

Top-priority issues are concentrated in the game loop (`game-engine.js`): per-frame DOM mutations, unnecessary array allocations, and quadratic collision detection.

---

## HIGH Severity

### H1 — DOM mutations in the game loop (`syncPowerupHUD`)
**File:** `js/modules/game-engine.js` — `syncPowerupHUD()`
**Symptom:** Called every frame from `draw()`. On each call it runs `querySelectorAll('.powerup-hud-item')`, then loops through results to update inline styles (`countdown.style.color`, `timerBar.style.width`, etc.) and conditionally creates or removes DOM elements (stacks badge, name element).
**Impact:** Forces browser style recalculation and potential reflow at 60 fps — one of the most expensive patterns in a game loop.
**Fix:** Cache element references after first creation. Only update style properties when the underlying value has actually changed. Remove/add DOM nodes only on state transitions (powerup gained/lost), not every frame.

---

### H2 — Per-frame array allocation from `.filter()` in shop rendering
**File:** `js/modules/game-engine.js` — shop mouse-move handler, shop draw path (~lines 468, 496, 549, 1775)
**Symptom:** `this.shopItems.filter(item => item.category === this.shopCategory)` called multiple times per mouse-move event and on every shop render pass. Creates a new heap-allocated array each time.
**Impact:** Unnecessary GC pressure; negligible for one call but accumulates with multiple calls per frame.
**Fix:** Cache `filteredItems` once when the shop opens or when `shopCategory` changes. Invalidate cache on category change only.

---

### H3 — O(n²) collision detection; existing quadtree unused
**File:** `js/modules/game-engine.js` — `handleCollisions()` (~line 3887)
**Symptom:** Enemy × asteroid collision uses a nested `forEach` (O(n·m)). Player-bullet and enemy-bullet collision paths similarly iterate full lists. A `quadtree.js` exists in `js/modules/performance/` but is not imported or used anywhere.
**Impact:** Currently masked by low entity caps (MAX_ASTEROIDS = 1), but any increase immediately becomes O(n²). Even at current counts, the pattern wastes iterations.
**Fix:** Integrate the existing `quadtree.js` as a broad phase. Insert all collidable entities into the quadtree each frame; query only nearby candidates before running circle-circle narrow phase.

---

### H4 — Excessive `ctx.save()` / `ctx.restore()` calls (~114 occurrences)
**File:** `js/modules/game-engine.js`, `js/modules/entities/enemy.js`, `js/modules/entities/enemy-bullet.js`
**Symptom:** `save()`/`restore()` wraps almost every draw call — health bars, glow effects, name labels, pause button, wave messages, shop items. Each pair pushes/pops the full canvas state.
**Impact:** Individually cheap but multiplied across hundreds of entities and draw calls per frame it adds up, especially on mobile GPUs.
**Fix:** Batch draws that share state. Explicitly reset only the properties that changed (e.g., reset `shadowBlur = 0` instead of a full restore) where the state is simple.

---

### H5 — `shadowBlur` / `shadowColor` set unconditionally every frame
**File:** `js/modules/game-engine.js` (~lines 2016, 3440, 5528, 988); `js/modules/entities/enemy.js`; `js/modules/entities/enemy-bullet.js`
**Symptom:** Every bullet, enemy, particle, and UI element applies a `ctx.shadowBlur` before drawing and leaves it set (or resets it to 0 via `save/restore`). Shadow rendering is the single most expensive per-pixel canvas operation — it requires a full off-screen compositing pass.
**Impact:** High. Shadow effects on dozens of entities per frame is a known major canvas performance killer, especially on mobile.
**Fix:**
- Audit which shadows are visually necessary vs decorative.
- Group all glowing draws into a single `shadowBlur` pass; batch non-glowing draws with `shadowBlur = 0`.
- Consider an `offscreenCanvas` "glow layer" composited once per frame instead of per-entity shadows.
- Provide a "low glow" quality option that disables shadows on bullets and particles.

---

## MEDIUM Severity

### M1 — Multiple separate pool-iteration passes per frame
**File:** `js/modules/game-engine.js` — `update()` loop
**Symptom:** Seven separate `forEach`/`updateActive` calls over distinct pools (bullets, particles, powerups, asteroids, enemies, enemy bullets, color stars, background stars).
**Impact:** Cache misses from switching between object types; function-call overhead per pool.
**Fix:** Consider a unified `updateAll()` pass or at minimum merge the smallest pools' updates.

---

### M2 — `Math.hypot()` used for all distance checks in collision hot paths
**File:** `js/modules/game-engine.js` — `handleCollisions()`, `handleEntityTargeting()`, `updateHoverDetection()` (~lines 3069, 3084, 3120, 3135, 3580, 3972, 4104)
**Symptom:** `Math.hypot(dx, dy) < r1 + r2` computed for every candidate pair. `Math.hypot` computes a full square root.
**Fix:** Compare squared distances: `dx*dx + dy*dy < (r1+r2)*(r1+r2)`. Eliminates `sqrt` from the hot path entirely.

---

### M3 — `PoolManager.release()` uses `indexOf` + `splice` — O(n) operations
**File:** `js/modules/pool-manager.js` — `release()` method
**Symptom:**
```js
const index = this.activeObjects.indexOf(obj); // O(n) scan
this.activeObjects.splice(index, 1);           // O(n) shift
```
Called every time a bullet, particle, or enemy is destroyed.
**Fix:** Swap the object with the last element then pop (`activeObjects[index] = activeObjects[activeObjects.length-1]; activeObjects.pop()`), giving O(1) removal. If iteration order matters, use a Set or maintain an index map.

---

### M4 — Canvas gradients recreated every frame in `updateHUD()`
**File:** `js/modules/game-engine.js` — `updateHUD()` health-bar rendering (~lines 5539–5568)
**Symptom:** `ctx.createLinearGradient()` and `ctx.createRadialGradient()` called each frame for the player health bar, even when health hasn't changed.
**Fix:** Cache gradient objects. Rebuild only when the health percentage crosses a threshold boundary (e.g., quantise to 5% buckets). Pre-generate three variants (healthy / warning / critical).

---

### M5 — `ctx.measureText()` called repeatedly per shop item draw
**File:** `js/modules/game-engine.js` — `drawShopItem()`, `drawMultilineText()` (~lines 2057, 2061, 2075, 2179, 2187, 2198)
**Symptom:** Per-character and per-line `measureText` calls during shop rendering. With 16+ visible items, this is 100+ measurements per render pass.
**Fix:** Pre-compute and cache all text layout for shop items when the shop opens or when items change. Store wrapped lines alongside each item. Only re-measure if font size changes.

---

### M6 — Repeated `document.getElementById` inside touch handlers
**File:** `js/modules/input-handler.js` — `updateDynamicJoystick()`, `hideDynamicJoystick()`, `resetDynamicJoystick()` (~lines 353–375)
**Symptom:** `document.getElementById('dynamic-joystick-base')` and `...-handle` queried inside every touchmove event, firing up to 60× per second on mobile.
**Fix:** Store references in instance variables (`this.joystickBaseEl`, `this.joystickHandleEl`) during `showDynamicJoystick()` or initialisation.

---

### M7 — Shop scrollbar metrics recalculated on every mouse/touch event
**File:** `js/modules/game-engine.js` — scroll handlers (~lines 468–506)
**Symptom:** `filteredItems`, `rows`, `totalContentHeight`, `maxScroll` all recomputed inside scroll-up, scroll-down, thumb-drag, and track-click handlers.
**Fix:** Cache these values in instance variables when the shop opens or category changes.

---

### M8 — Joystick DOM elements lazy-created on first touch
**File:** `js/modules/input-handler.js` — `showDynamicJoystick()` (~lines 312–340)
**Symptom:** `document.createElement('div')` called the first time the player touches the screen during gameplay.
**Fix:** Create and hide joystick elements during `setupTouchControls()` initialisation. Show/hide with `display` or `visibility` toggles at runtime.

---

### M9 — Per-character text measurement and shadow in `drawWavyText()`
**File:** `js/modules/game-engine.js` — `drawWavyText()` (~lines 944–998)
**Symptom:** For each character: calls `ctx.measureText(char)`, applies a `shadowBlur = 15`, sets fill colour from a palette, and calls `ctx.fillText`. Wave messages can be 20–30 characters long.
**Fix:** Cache character widths (the ASCII set is small and fixed). Pre-draw wavy text to an offscreen canvas and composite it each frame, re-rendering only when the animation progresses meaningfully.

---

## LOW Severity

### L1 — `getInput()` spreads a new object every frame
**File:** `js/modules/input-handler.js` — `getInput()` (~line 408)
**Symptom:** `return { ...this.input }` allocates a new object every game loop tick.
**Fix:** Return a direct reference `return this.input` and treat it as read-only, or use a shared scratch object reset each frame.

---

### L2 — Procedural wave generation not cached
**File:** `js/modules/wave-data.js` — `getWaveConfig()` for waves > 80
**Symptom:** Each call after wave 80 runs `baseWave.enemies.map(...)` to produce a scaled copy.
**Fix:** Memoize results by wave number. Insert into a `Map` on first request.

---

### L3 — Unused performance modules
**Path:** `js/modules/performance/`
**Files:** `quadtree.js`, `frustum-culling.js`, `temporal-upsampling.js`, `path-cache.js`, `particle-system-wrapper.js`
**Symptom:** None of these are imported in `game-engine.js` or any entity file (verified with grep).
**Fix:** Either integrate (especially `quadtree.js` for H3, `frustum-culling.js` for off-screen entity skipping) or delete to reduce bundle weight.

---

### L4 — `testMultiTouch()` leaves a persistent document event listener
**File:** `js/modules/input-handler.js` — `testMultiTouch()` (~lines 284–304)
**Symptom:** A `touchstart` listener is attached to `document` to count multi-touch events. It removes itself after 3 touches but may persist indefinitely if the player never makes 3 simultaneous touches (e.g., desktop users).
**Fix:** Set a `setTimeout` fallback to remove the listener after a few seconds if it hasn't self-removed.

---

### L5 — Event listener race at game start
**File:** `js/main.js` (~lines 168–170)
**Symptom:** Three listeners (`keydown`, `click`, `touchstart`) all call `startGame`. If two fire before the first completes (e.g., touchstart then click on mobile), `startGame` runs twice.
**Fix:** Set a `started` flag and guard the function body: `if (started) return; started = true;`.

---

### L6 — Particle pool over-allocated (50 allocated, 30 cap)
**File:** `js/modules/game-engine.js` — pool initialisation (~line 236)
**Symptom:** `new PoolManager(Particle, 50)` pre-allocates 50 objects, but `MAX_PARTICLES = 30` means 20 are never used.
**Fix:** Set initial allocation to 32–35 (slightly above cap, to absorb burst allocation without GC).

---

## Appendix — Files Audited

| File | Lines (approx.) |
|------|-----------------|
| `js/modules/game-engine.js` | ~5,700 |
| `js/modules/entities/enemy.js` | ~2,400 |
| `js/modules/entities/enemy-bullet.js` | ~700 |
| `js/modules/entities/asteroid.js` | ~300 |
| `js/modules/entities/particle.js` | ~100 |
| `js/modules/pool-manager.js` | ~80 |
| `js/modules/input-handler.js` | ~450 |
| `js/modules/ui-manager.js` | ~800 |
| `js/modules/wave-data.js` | ~250 |
| `js/modules/audio-manager.js` | ~300 |
| `js/modules/performance/*.js` | ~600 (5 files) |
| `js/main.js` | ~200 |
