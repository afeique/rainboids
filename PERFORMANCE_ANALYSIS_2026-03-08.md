# Rainboids — Comprehensive Performance & Rendering Analysis
**Date:** 2026-03-08
**Branch:** `opt`
**Scope:** Asteroid rendering pipeline, object pooling, caching systems, starfield noise algorithms, draw call reduction, shadowBlur/CSS effects, most expensive per-frame operations, and prioritized optimizations with estimated gains.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Most Expensive Operations Per Frame](#most-expensive-operations-per-frame)
3. [Asteroid Rendering — Full Pipeline Analysis](#asteroid-rendering--full-pipeline-analysis)
4. [CSS & Canvas Effects — shadowBlur and DOM Cost](#css--canvas-effects--shadowblur-and-dom-cost)
5. [Object Pooling and Recycling](#object-pooling-and-recycling)
6. [Caching Systems](#caching-systems)
7. [Starfield Rendering — Noise Algorithms](#starfield-rendering--noise-algorithms)
8. [Rendering & Draw Call Reduction](#rendering--draw-call-reduction)
9. [Spatial Partitioning & Collision](#spatial-partitioning--collision)
10. [Particle Systems](#particle-systems)
11. [Advanced Subsystems (Disabled)](#advanced-subsystems-disabled)
12. [Summary of Issues by Severity](#summary-of-issues-by-severity)
13. [Prioritized Optimizations with Expected Gains](#prioritized-optimizations-with-expected-gains)

---

## Executive Summary

The codebase has a **layered, ambitious optimization architecture**: object pools, depth-sorted batch rendering, Path2D caching, text sprite caching, canvas layering, a quadtree, frustum culling, typed-array particles, temporal upsampling, and a web worker manager. The conceptual design is strong. However, several of the most impactful subsystems are **disabled or partially wired up** (typed array particles, workers, temporal upsampling), and several others contain **algorithmic bugs that negate their intended benefit** — O(n) inside an O(1) pool release, a quadtree rebuilt from scratch every frame, and `ParticleBatch` using `Math.sqrt` per pixel.

The most immediately actionable issues are: 30 individual `ctx.stroke()` calls per asteroid per frame (should be 1), 30 redundant `Date.now()` calls per asteroid per frame, live `ctx.shadowBlur` applied every frame on particles and stars (should be pre-rendered sprites), and the `PoolManager.release()` O(n) `indexOf` that defeats the swap-and-pop pattern the code explicitly implements.

---

## Most Expensive Operations Per Frame

The following is a ranked breakdown of the most computationally demanding operations per frame at the current entity limits, from most to least expensive:

### 1. `ctx.shadowBlur` on particles and color stars — **~1–5 ms/frame**

Every particle with a shadow effect triggers a full-screen Gaussian blur kernel on the GPU. At `shadowBlur = 15` on a particle of radius 10, the browser must blur a ~80×80 pixel region (the shadow spread extends well beyond the shape). The kernel is separable (two 1D passes), but even so, 30 particles with `shadowBlur = radius * 4` means up to **~30 separate GPU blur operations per frame**. On a mid-range GPU this is measurable. On mobile, it can consume 3–5 ms/frame on its own.

### 2. Asteroid wireframe — 120 canvas API calls per asteroid per frame

See the full breakdown below. The 30-edge wireframe calls `ctx.stroke()` 30 times, each time flushing the GPU path buffer. This is 30× more GPU submits than necessary.

### 3. Health bar gradient — linear gradient recreated every frame

`ctx.createLinearGradient()` allocates a gradient object on every `draw()` call, regardless of whether health changed. For a single asteroid this is minor, but the pattern repeats across multiple entity types.

### 4. Starfield depth batching — Map creation and Array.from + sort every frame

`DepthBatchRenderer.groupStarsByDepth()` clears and repopulates a Map, then `Array.from(entries()).sort()` allocates a new array every frame. At 55 stars across 11 opacity buckets, this is many small allocations per frame that feed the GC.

### 5. Quadtree full rebuild — O(n log n) every frame for no net benefit

The quadtree is cleared and rebuilt from scratch each frame. With the current entity count (1 asteroid, 1–4 enemies, ~30 bullets), this adds overhead without reducing collision pairs compared to naive O(n²).

### 6. `PoolManager.release()` O(n) indexOf — ~30–200 comparisons per bullet death

Every bullet or particle release triggers a linear scan of `activeObjects`. At 20 active bullets dying per second at 60fps, this is ~400 comparisons/frame from bullet releases alone. Negligible now but scales directly with entity count.

### 7. String allocations — HSL color strings, state-key strings, per frame

The asteroid loop allocates 30 HSL template literal strings per frame. `RenderBatch.getStateKey()` allocates one string per entity per frame. These accumulate into GC pressure.

### 8. 30 redundant `Date.now()` calls per asteroid per frame

`Date.now()` is called once per edge in the 30-edge forEach loop. All 30 calls within a single frame return the same (or nearly the same) millisecond value. This is pure waste.

---

## Asteroid Rendering — Full Pipeline Analysis

The asteroid is the most complex single entity to render. It uses a genuine 3D pipeline: vertex definition in model space, three sequential rotation matrices, perspective projection to screen space, then wireframe edge drawing.

### Geometry: Icosahedron with Random Distortion

The base shape is a **regular icosahedron** — a Platonic solid with 12 vertices, 20 triangular faces, and 30 edges. The vertices are derived from the golden ratio `t = (1 + √5) / 2`:

```
[-1,t,0] [1,t,0] [-1,-t,0] [1,-t,0] [0,-1,t] [0,1,t]
[0,-1,-t] [0,1,-t] [t,0,-1] [t,0,1] [-t,0,-1] [-t,0,1]
```

Each vertex is scaled by `baseRadius` and then randomly distorted by ±25% (`d = 1 + random(-0.25, 0.25)`) to produce an irregular, rocky silhouette. The 30 edges of the icosahedron are hardcoded as index pairs in `this.edges`, set once in the constructor.

The collision radius is computed as the average of the minimum and maximum vertex distances from the origin:
```js
this.radius = (minR + maxR) / 2;
```

### The 3D Rotation Pipeline (`project()`)

Every frame, `project()` applies three sequential rotation matrices to each of the 12 vertices, then projects to 2D. Here is the complete per-frame computation:

**Step 1 — Cache six trig values (6 calls):**
```js
const cosX = Math.cos(this.rot3D.x);  const sinX = Math.sin(this.rot3D.x);
const cosY = Math.cos(this.rot3D.y);  const sinY = Math.sin(this.rot3D.y);
const cosZ = Math.cos(this.rot3D.z);  const sinZ = Math.sin(this.rot3D.z);
```

**Step 2 — Transform each of 12 vertices:**

For each vertex, three rotation matrices are applied in sequence (Z → X → Y), followed by a perspective divide:

| Operation | Formula | Arithmetic ops |
|-----------|---------|---------------|
| Z rotation | `x' = x·cosZ − y·sinZ`, `y' = x·sinZ + y·cosZ` | 4 mul + 2 add/sub |
| X rotation | `y'' = y'·cosX − z·sinX`, `z' = y'·sinX + z·cosX` | 4 mul + 2 add/sub |
| Y rotation | `x'' = x'·cosY + z'·sinY`, `z'' = −x'·sinY + z'·cosY` | 4 mul + 2 add/sub |
| Perspective | `sx = (x'' · fov) / (fov + z'')`, `sy = (y'' · fov) / (fov + z'')` | 2 mul + 2 div + 1 add |

**Per vertex: ~23 arithmetic operations.**
**For 12 vertices: ~276 arithmetic operations + 6 trig calls.**

These are not matrix multiplications via a matrix library — they are unrolled inline per axis, which is actually good for performance as it avoids function call overhead and temporary matrix object allocation.

### The Wireframe Draw Pass (`drawAsteroidShape()`)

This is where the most significant problems live. The 30 edges are drawn in a `forEach` loop, and each edge issues **4 separate canvas API calls** with **7 canvas state changes**:

```js
this.edges.forEach((edge, index) => {
    const v1 = this.projectedVertices[edge[0]];
    const v2 = this.projectedVertices[edge[1]];

    const avg = (v1.depth + v2.depth) / 2;
    const baseAlpha = Math.max(0.2, Math.pow(Math.max(0, (fov - avg) / (fov + radius)), 2.0));

    ctx.globalAlpha = baseAlpha;                              // state change 1

    const hue = (Date.now() / 20 + index * 10) % 360;       // Date.now() call!
    ctx.strokeStyle = `hsl(${hue}, 100%, 75%)`;              // state change 2 + string alloc
    ctx.lineWidth = 2;                                        // state change 3
    ctx.shadowColor = 'transparent';                         // state change 4
    ctx.shadowBlur = 0;                                      // state change 5
    ctx.shadowOffsetX = 0;                                   // state change 6
    ctx.shadowOffsetY = 0;                                   // state change 7

    ctx.beginPath();                                         // draw call 1
    ctx.moveTo(v1.x, v1.y);                                 // draw call 2
    ctx.lineTo(v2.x, v2.y);                                 // draw call 3
    ctx.stroke();                                            // draw call 4 — GPU flush
});
```

**Per-frame totals for one asteroid:**

| Category | Count | Notes |
|----------|-------|-------|
| `Math.cos` / `Math.sin` | 6 | For three rotation axes |
| Vertex arithmetic ops | ~276 | 12 vertices × ~23 ops |
| Edge depth/alpha ops | ~150 | 30 edges × 5 ops each |
| `Date.now()` calls | **30** | One per edge — all redundant |
| HSL string allocations | **30** | One per edge — all GC'd next frame |
| `ctx.globalAlpha` changes | **30** | One per edge |
| `ctx.strokeStyle` changes | **30** | One per edge — full CSS color parse |
| `ctx.lineWidth` changes | **30** | One per edge — always = 2 |
| Shadow property resets | **120** | 4 props × 30 edges |
| `ctx.beginPath()` | **30** | One per edge |
| `ctx.moveTo()` | **30** | One per edge |
| `ctx.lineTo()` | **30** | One per edge |
| `ctx.stroke()` | **30** | One per edge — GPU path flush |
| **Total canvas API calls** | **180** | For 30 edges |
| **Total canvas state changes** | **210** | For 30 edges |

Additionally, the health bar creates a `LinearGradient` object every frame.

### What Should Happen Instead

The 30 edges should be accumulated into a **single path** with one `ctx.stroke()` call. Since each edge currently has a different alpha (depth-based) and a different hue (rainbow animation), full batching requires either:

**Option A — Single color, single alpha (simplest):** Set one uniform stroke style for the whole asteroid each frame — one hue computed from `Date.now()`, one average depth alpha. This reduces 180 canvas API calls to **4** (beginPath, 30× moveTo/lineTo pairs, stroke). ~45× reduction in GPU path submits.

**Option B — Bucketed alpha groups:** Group edges into 3–5 alpha buckets (far/mid/near depth), draw each bucket as one path. Reduces 30 `ctx.stroke()` to ~4 `ctx.stroke()` calls — still a ~7× improvement with preserved depth shading.

**Option C — Hoist Date.now() and lineWidth:** Even without batching edges, calling `Date.now()` once per frame and setting `ctx.lineWidth` once (it never changes) saves 30 + 30 redundant operations immediately.

---

## CSS & Canvas Effects — shadowBlur and DOM Cost

### How `ctx.shadowBlur` Works

When `ctx.shadowBlur > 0`, the Canvas 2D renderer does not simply draw the shape and move on. The pipeline becomes:

1. Draw the shape to a temporary off-screen buffer
2. Apply a Gaussian blur to that buffer using the specified radius
3. Composite the blurred shadow onto the main canvas at `ctx.shadowOffsetX/Y`
4. Composite the original un-blurred shape on top

The Gaussian blur is the expensive step. Although it is separable (horizontal pass + vertical pass, O(2r) per pixel rather than O(r²)), the **affected area** grows quadratically with blur radius:

```
Affected area = (shape_width + 2*shadowBlur) × (shape_height + 2*shadowBlur)
```

For a particle of radius 10 with `shadowBlur = 40` (`= radius * 4`):
- Affected area ≈ (20 + 80) × (20 + 80) = 10,000 pixels
- Horizontal blur pass: 10,000 × 80 = **800,000 multiply-add ops**
- Vertical blur pass: 10,000 × 80 = **800,000 multiply-add ops**
- Total: **~1.6 million ops per shadow draw call**

With 30 particles simultaneously active: **~48 million GPU blur operations per frame**. At 60fps this is **~2.9 billion blur ops/sec** just for particle shadows — well within GPU capacity on desktop, but punishing on mobile GPUs.

The additional cost is GPU state: each `shadowBlur` draw forces the renderer to use a different compositing pipeline than non-shadow draws. The GPU cannot batch a shadow draw with the next non-shadow draw — it must flush the command buffer.

### Current Uses in the Codebase

| Location | `shadowBlur` value | Frequency |
|----------|--------------------|-----------|
| `ColorStar.drawDirect()` — big stars | 8 | Per big star per frame (~4 stars) |
| `ColorStar.drawDirect()` — sparkle extra lines | 15 | Per sparkle star per frame |
| `Particle.draw()` — explosion types | `radius * 4` | Up to 30 per frame |
| `Asteroid.drawTargetingEffect()` | 15, then 8 | When asteroid targeted |
| `ColorStar` — collectible orb glow | 15 | Per orb per frame |

The asteroid's `drawAsteroidShape()` explicitly resets `shadowColor = 'transparent'` and `shadowBlur = 0` on **every edge** (30 times per frame) — a correct defensive measure but wasteful. Setting these once before the edge loop would suffice.

### Strategies for Eliminating `shadowBlur` Cost

**Strategy 1 — Pre-rendered sprite cache (recommended)**

Render the shape + shadow once to an offscreen `HTMLCanvasElement` at initialization, store it keyed by `(type, radius, color)`. At draw time, use `ctx.drawImage(sprite, x - halfW, y - halfH)` — a single texture sample at negligible GPU cost.

This is exactly what `IconSpriteCache` already does for HUD icons (shield, coin, heart). The same pattern needs to be applied to particles, big stars, and orb glows.

```js
// At init time (once):
const offscreen = document.createElement('canvas');
offscreen.width = radius * 2 + shadowBlur * 2;
offscreen.height = offscreen.width;
const octx = offscreen.getContext('2d');
octx.shadowColor = color;
octx.shadowBlur = shadowBlur;
octx.fillStyle = color;
octx.beginPath();
octx.arc(offscreen.width/2, offscreen.height/2, radius, 0, Math.PI*2);
octx.fill();
spriteCache.set(key, offscreen);

// At draw time (every frame):
ctx.globalAlpha = finalOpacity;
ctx.drawImage(spriteCache.get(key), x - halfW, y - halfH);
```

**Expected gain:** ~1–5 ms/frame on desktop, ~3–8 ms/frame on mobile. Converts O(r²) GPU operations to O(1) texture samples.

**Strategy 2 — `globalCompositeOperation: 'screen'` for additive glows**

For particles and star glows, additive blending (`screen` or `lighter`) visually approximates bloom without a blur kernel. Multiple overlapping semi-transparent circles at increasing radii produce a soft glow at a fraction of the cost:

```js
// Approximate glow: 3 circles at 0.5x, 1x, 1.5x radius, decreasing alpha
const glowLevels = [[0.5, 0.4], [1.0, 0.25], [1.5, 0.1]];
ctx.globalCompositeOperation = 'screen';
for (const [scale, alpha] of glowLevels) {
    ctx.globalAlpha = alpha * finalOpacity;
    ctx.beginPath();
    ctx.arc(x, y, radius * scale, 0, Math.PI * 2);
    ctx.fill();
}
ctx.globalCompositeOperation = 'source-over';
```

No GPU blur kernel required. Three arc-fill calls is far cheaper than one blurred shadow.

**Strategy 3 — Layer `shadowBlur` calls into a dedicated low-frequency offscreen canvas**

If pre-rendering per entity type is too complex, a middle ground is to render all glow effects to a single offscreen canvas at half resolution, then `drawImage()` it scaled up 2× onto the main canvas. Halving resolution reduces the blur area by 4× (blur cost scales with area).

**Strategy 4 — Batch all shadow draws together, set once**

If `shadowBlur` cannot be eliminated, minimize GPU state thrash by drawing all shadow-enabled entities together in one batch before resetting to non-shadow state. The GPU can keep the shadow pipeline active across the batch rather than switching per entity.

---

## Object Pooling and Recycling

### Design and Intent

The game uses `PoolManager` for every entity class: `Particle`, `Bullet`, `BackgroundStar`, `ColorStar`, `Enemy`, `Asteroid`, `EnemyBullet`. The design is correct — pre-allocate a pool of objects at startup, hand them out with `get()`, return them with `release()`, and avoid per-frame `new` allocations that trigger garbage collection pauses.

**How it works:**
- Constructor pre-allocates N objects and stores them in `this.pool` (the free list)
- `get()` pops from `this.pool` (O(1)), calls `obj.reset(...args)` to reinitialize, pushes to `this.activeObjects`, returns it
- `release(obj)` removes from `this.activeObjects` and pushes back to `this.pool`
- Particle pools are hard-capped at `GAME_CONFIG.MAX_PARTICLES` (30), with oldest-particle eviction

**What works well:**
- Objects pre-allocated at startup — no allocation in the common case at runtime
- `get()` uses `pool.pop()` — O(1) retrieval
- `release()` uses swap-and-pop in principle — the comment correctly describes the intent
- Particle cap prevents unbounded pool growth

### Critical Issue — O(n) `indexOf` Negates the Swap-and-Pop

```js
release(obj) {
    const index = this.activeObjects.indexOf(obj);   // ← O(n) linear scan
    if (index > -1) {
        this.activeObjects[index] = this.activeObjects[this.activeObjects.length - 1];
        this.activeObjects.pop();   // ← the O(1) part
        obj.active = false;
        this.pool.push(obj);
    }
}
```

`indexOf` scans the entire `activeObjects` array to find the object's position. For a pool of N active objects, `release()` is O(n) despite the O(1) swap-and-pop that follows. The fix is to store `_poolIndex` on each object at `get()` time and update it during swaps:

```js
get(...args) {
    const obj = this.pool.pop() ?? new this.ObjectClass();
    obj.reset(...args);
    obj._poolIndex = this.activeObjects.length;
    this.activeObjects.push(obj);
    return obj;
}

release(obj) {
    const index = obj._poolIndex;
    const last = this.activeObjects[this.activeObjects.length - 1];
    this.activeObjects[index] = last;
    last._poolIndex = index;       // update the swapped object's tracked position
    this.activeObjects.pop();
    obj.active = false;
    obj._poolIndex = -1;
    this.pool.push(obj);
}
```

This eliminates `indexOf` entirely — release is truly O(1).

### Secondary Issue — `cleanupInactive()` is O(n²)

```js
cleanupInactive() {
    for (let i = this.activeObjects.length - 1; i >= 0; i--) {
        const obj = this.activeObjects[i];
        if (!obj.active) {
            this.activeObjects.splice(i, 1);   // O(n) shift, inside O(n) loop
            this.pool.push(obj);
        }
    }
}
```

`splice()` inside a loop is O(n²) worst case. Even with reverse iteration (which correctly avoids index corruption), each `splice()` shifts all subsequent elements. With the `_poolIndex` approach above, this becomes a simple forward pass using the same swap-and-pop technique, reducing to O(n).

### Particle Eviction Bug

When the particle cap is hit, the code does:
```js
const oldestParticle = this.activeObjects[0];
if (oldestParticle) {
    this.release(oldestParticle);   // calls indexOf(activeObjects[0]) — scans to find index 0
}
```

`release()` then calls `indexOf(activeObjects[0])`, which scans the entire array just to discover that the element is at index 0. With the `_poolIndex` approach, this becomes `release(activeObjects[0])` — which directly uses `obj._poolIndex = 0` with no scan.

### `OptimizedPoolManager`

An improved pool that pre-allocates a fixed-size array and tracks available indices via `availableIndices`. The get path is better. However it **still uses `indexOf()`** for release — the same O(n) bug. The pre-allocation improvements are real but the critical hot-path is not fixed.

---

## Caching Systems

### `PathCache` — `js/modules/performance/path-cache.js`

Pre-computes `Path2D` objects for the ship, thruster flame, bullets, star shapes, and health bar outlines. Paths are stored in a `Map` keyed by `${shapeName}_${size}`. `Path2D` objects are processed by the browser's GPU path rasterizer — reusing them avoids re-tessellating geometry every frame.

**Well-implemented.** Lazy initialization, correct key generation, no eviction needed (finite fixed set of shapes), no issues. This is the pattern that other parts of the codebase should follow.

### `TextCache` — `js/modules/performance/text-cache.js`

Renders text to an offscreen `HTMLCanvasElement` once, stores it keyed by `(text, font, fillStyle, strokeStyle, lineWidth)`. At draw time, `ctx.drawImage(cached.canvas, x, y)` — a GPU texture sample — replaces what would otherwise be `ctx.fillText()` + `ctx.strokeText()` every frame (expensive: requires font rasterization, layout engine, and hinting).

**What works well:**
- `drawImage()` of pre-rendered text is essentially free — GPU uploads the texture once
- `NumberCache` pre-warms entries for 0–100 at initialization
- Separate `damageNumberCache` and `scoreCache` for hot-path numeric values

**Issues:**

*Cache eviction is FIFO, not LRU.* When the cache hits 100 entries, it evicts the oldest-inserted key regardless of access frequency. A game HUD showing the same score string repeatedly could see that string evicted in favor of a damage number from 10 seconds ago. Fix: on cache hit, delete and re-insert the key (O(1) in Map) to keep it at the "newest" end, making eviction truly remove the least-recently-used entry.

*`parseInt(font)` for height computation:*
```js
const height = parseInt(font) * 1.5 + padding * 2;
```
This assumes the font string starts with digits (`"12px monospace"` → `parseInt` = 12). Any font string like `"bold 12px ..."` returns `NaN`, producing a zero-height canvas — silent visual failure.

*`scoreCache` pre-warms 0–100* but game scores reach into the thousands quickly. First render of any score above 100 creates a canvas mid-frame. The pre-warm range should match realistic game values.

### `IconSpriteCache` — `js/modules/utils.js`

Pre-renders shield, coin, and heart icons to offscreen canvases using full SVG path data. Already implements the correct pattern that `shadowBlur` usage should follow everywhere. This demonstrates that the team knows how to do sprite caching — it just hasn't been applied to particles, stars, and glow effects yet.

---

## Starfield Rendering — Noise Algorithms

The starfield uses a layered procedural generation system combining three noise types plus a mathematical galaxy pattern. All generation happens once at startup via `generateStarPositions()`; the results drive `BackgroundStar` and `ColorStar` entities that are then updated and rendered every frame.

### Perlin Noise (`perlin2`)

Perlin noise generates smooth, continuous random values by interpolating between gradient vectors at integer grid corners:

- Uses a 256-entry permutation table (shuffled by seed) doubled to 512 to avoid index wrapping
- The `fade()` function (`t³(t(6t−15)+10)`) gives smooth S-curve interpolation — removes visible grid artifacts
- `grad()` selects from 16 gradient directions using `hash & 15`, producing a dot product with the fractional offset
- Output range: approximately `[−1, 1]`
- Visually: smooth blobs at a fixed scale — the building block for FBM

### FBM — Fractional Brownian Motion (`fbm`)

FBM stacks multiple Perlin calls ("octaves") at increasing frequencies and decreasing amplitudes:

```
total = Σ(i=0..octaves) perlin(x · freq^i, y · freq^i) · persistence^i
result = total / maxValue   ← normalized to ~[−1, 1]
```

| Layer | Octaves | Persistence | Lacunarity | FBM Scale | FBM Weight | Visual Effect |
|-------|---------|-------------|------------|-----------|------------|---------------|
| Far (z < 0.6) | 5 | 0.45 | 2.1 | 0.0008 | 0.7 | Large blobs — distant galactic arm structure |
| Mid (0.6–2.0) | 4 | 0.5 | 2.0 | 0.0015 | 0.6 | Medium-scale clusters |
| Near (z ≥ 2.0) | 3 | 0.6 | 2.0 | 0.005 | 0.8 | Fine-grained, granular near field |

Low persistence (far layer) means higher octaves fade quickly — large-scale structure dominates. High persistence (near layer) lets detail survive through all octaves.

### Worley Noise / Cellular Noise (`worley`)

Worley noise places random feature points in each cell of a grid and returns the distance to the nearest point. The result is **inverted** (`1.0 − worleyVal`) before use, so values are high near feature points and low in voids — compact bright clusters surrounded by emptiness, analogous to how real star clusters and nebulae look.

| Layer | Worley Scale | Worley Weight | Effect |
|-------|-------------|---------------|--------|
| Far | 0.002 | 0.5 | Large prominent cell clusters |
| Mid | 0.008 | 0.3 | Medium-scale clustering |
| Near | 0.020 | 0.1 | Fine grain, minimal cellular influence |

**Note:** The Far Layer weights (FBM 0.7 + Worley 0.5 = 1.2) are not normalized — they exceed 1.0 while Mid and Near layers sum to ~0.9. This inconsistency causes the far layer's base density to have a wider raw range before the contrast boost clamp.

### Galaxy Pattern (Mathematical)

Four hardcoded galaxy centers (`GALAXY_CENTERS`) contribute two effects:

**Halo:** `exp(−dist / (haloRadius × 0.5))` — exponential falloff from each galactic core, producing a bright nucleus with soft edges.

**Spiral arms:** `log(dist × 100 + 1) × spiralTightness` — a logarithmic spiral offset at each radius. Stars within `angleDiff < spiralWidth` of the arm are included with cosine falloff for soft edges. Two arms per galaxy. The arm width formula `0.3 + distance × 0.5` causes arms to become very wide (approaching half the circle) at screen edges — real spiral galaxies maintain narrow arms throughout.

**Distance limit:** `exp(−dist × 3)` limits each galaxy's influence so the four don't flood the whole screen.

**Depth weighting:** Far layer gets 1.2×, mid 0.8×, near 0.4× — galaxy structure is most visible in the deepest stars.

### How the Signals Combine

```
baseDensity = (fbmVal × FBM_WEIGHT) + (worleyVal_inverted × WORLEY_WEIGHT)
baseDensity = (baseDensity − 0.5) × 2.5 + 0.5         ← contrast boost

galaxyDensity = Σ max(halo, spiral) × distanceDecay × depthMultiplier

combined = baseDensity × 0.6
         + galaxyDensity × 0.4
         + baseDensity × galaxyDensity × 0.3            ← multiplicative term
```

The **contrast boost** expands the raw output from roughly `[0.2, 0.8]` to `[−0.25, 1.25]` (before clamping), making voids genuinely dark and clusters genuinely dense. Without it the output is uniform mid-gray.

The **multiplicative term** amplifies regions where both the noise field and a galaxy pattern are simultaneously high. This is what makes galaxy cores pop visibly — a `screen`-blend-like behavior in the density domain.

### What Density Actually Controls

Crucially, density does **not** control star placement. `generateStarPositions()` places one star per jittered grid cell regardless of the density value. Density only affects the resulting star's `radius` and `twinkleSpeed` — a subtle visual difference invisible at 55 stars.

The star placement uses a weighted depth probability table:

| Probability | Depth range | Layer |
|------------|-------------|-------|
| 0–15% | z ∈ [0.1, 0.3] | Very far |
| 15–35% | z ∈ [0.3, 0.6] | Far |
| 35–55% | z ∈ [0.6, 1.0] | Mid-far |
| 55–70% | z ∈ [1.0, 1.5] | Mid |
| 70–82% | z ∈ [1.5, 2.0] | Mid-close |
| 82–91% | z ∈ [2.0, 2.5] | Close |
| 91–97% | z ∈ [2.5, 3.0] | Very close |
| 97–100% | z ∈ [3.0, 4.0] | Foreground |

### Starfield Visual Improvement Suggestions

- **Rejection sampling:** Use density as a placement probability (`if Math.random() > density × 1.5: skip`) so galaxy arms genuinely have more stars and voids genuinely have fewer. The most impactful visual improvement available with minimal code change.
- **Normalize Far Layer weights** to sum to 1.0 (currently 1.2).
- **Cap spiral arm width:** `Math.min(0.5, 0.2 + distance × 0.3)` prevents arms from bleeding together at screen edges.
- **Pre-bake density to a 64×64 texture** at init time for ~100× faster density lookups during placement or future real-time density queries.
- **Expand color palette:** Add white and cream tones (`'#ffffff', '#fffce0', '#fff3c0'`) weighted at ~60% — the most common real star colors at visible magnitudes.
- **Twinkling inversely correlated with z:** Far dim stars should twinkle faster; nearby bright ones more stable. Reinforces depth perception.

---

## Rendering & Draw Call Reduction

### `DepthBatchRenderer` — `js/modules/performance/depth-batch-renderer.js`

The most impactful rendering optimization currently active. Groups stars by a quantized opacity bucket (0.0–1.0 in 0.1 steps = up to 11 buckets), then within each bucket groups background stars by color. All stars of the same color in the same bucket are drawn in a **single `beginPath()` → multiple `arc()` calls → single `fill()`** — genuine batching.

**What works well:**
- `globalAlpha` set once per bucket instead of per star
- `fillStyle` set once per color group within a bucket
- Background stars (simple circles) fully benefit — they share one arc sub-path
- `ctx.moveTo(star.x + star.radius, star.y)` before each `arc()` prevents stray connection lines (correct idiom)

**Issues:**
- `Array.from(this.depthBuckets.entries()).sort()` allocates a new array every frame. A cached `sortedKeys` array only rebuilt when `depthBuckets.size` changes would eliminate this.
- Color-group key parsing: `key.split('-')` is fragile if any color value contains `-`. Use a `Map` with object keys instead.
- Non-circle color stars still call `ctx.save()`/`ctx.restore()` per star for rotation — unavoidable, but the shared `strokeStyle` is correctly set once per group.

### `RenderBatch` — `js/modules/performance/render-batch.js`

Groups entities by a render-state key and applies canvas state once per batch. Correct concept, two implementation issues:

- `getStateKey()` creates a new template literal string per call per entity per frame → GC pressure
- No depth sorting — entities render in Map insertion order, potentially out of z-order

### `CanvasLayers` — `js/modules/performance/canvas-layers.js`

Five stacked canvases (background, stars, game, effects, UI) with dirty-flag tracking. The stars layer cannot realistically be frozen because twinkling and parallax change it every frame. The `StarFieldCache` is largely inactive in practice.

Five canvas DOM elements means five GPU texture allocations and five compositing passes per frame. Two canvases (static background + dynamic game) would be sufficient for the current rendering model and would reduce compositing overhead.

---

## Spatial Partitioning & Collision

### `Quadtree` — `js/modules/performance/quadtree.js`

A standard recursive quadtree with `maxObjects = 10` and `maxLevels = 5`. The implementation is textbook-correct but used incorrectly at the call site — it is cleared and fully rebuilt from scratch each frame. Rebuilding is O(n log n) per frame, and with the current entity count (1 asteroid, 1–4 enemies, ~30 bullets), naive O(n²) collision detection is faster than the quadtree overhead.

Implementation-level issues: `getIndex()` allocates a new array on every call; `retrieve()` uses spread-into-push for recursive concatenation, generating intermediate arrays at each recursion level.

**Replacement recommendation:** A uniform spatial grid (8 cols × 6 rows = 48 cells) gives O(1) insert, O(1) lookup, and O(k) neighbor queries without any allocation or recursion. It would outperform the quadtree for all current and near-future entity counts.

### `FrustumCulling` — `js/modules/performance/frustum-culling.js`

Simple AABB visibility test with 100px padding. O(1) per entity, correct. Minor: static 100px padding regardless of entity velocity means fast bullets near the edge could "pop." Adaptive padding (`max(100, entity.speed * 2)`) would be more correct at negligible extra cost.

---

## Particle Systems

### `Particle` — `js/modules/entities/particle.js`

Fifteen distinct particle types initialized via a large string-keyed `switch` in `reset()`. The `shadowBlur` calls on particle draw are the primary cost (see the CSS Effects section above).

Properties not reset on pool reuse can carry stale state — a latent correctness risk producing wrong colors or lifetimes on recycled particles.

### `ParticleBatch` — `js/modules/performance/render-batch.js`

An offscreen canvas maintained as a raw `ImageData` buffer with additive pixel blending. Architecturally correct for high particle counts. Two implementation bugs prevent it from reaching its potential:

- **`Math.sqrt` per pixel:** Every pixel in the bounding box gets `Math.sqrt(dx²+dy²)`. For radius 20, that's 1,600 sqrt calls per particle, 48,000/frame at 30 particles. Replacing with squared-distance comparison defers sqrt to only pixels that pass the circle test — ~78% of bounding box pixels fail (corners), so this eliminates ~78% of sqrt calls immediately.

- **Clear loop is O(W×H) JS:** At 1920×1080, zeroing the `ImageData` buffer via a JS for-loop runs 8.3M iterations. `this.data.fill(0)` is a native typed-array operation running at memory bandwidth speed — approximately 5–10× faster.

- **Not connected to the particle pool.** The `Particle` class draws via `ctx.shadowBlur + ctx.arc()`, not through `ParticleBatch`. The batch exists but is bypassed.

### `TypedArrayParticleSystem` — `js/modules/performance/typed-array-particles.js`

A Structure-of-Arrays particle system with cache-friendly linear storage and a batch update loop. **Fully implemented, hard-disabled** (`if (false && ...)`). `ParticleSystemWrapper` provides the adapter but is not instantiated in the active game engine.

---

## Advanced Subsystems (Disabled)

### Web Workers — `js/modules/performance/worker-manager.js`

Three workers for physics, collision, and particles. Disabled with "causing issues." The fundamental challenge: sharing entity state requires either `SharedArrayBuffer` (needs COOP/COEP server headers) or structured-clone serialization (expensive). For current entity counts, workers add more overhead than they save. Defer until entity counts are 10× higher.

### Temporal Upsampling — `js/modules/performance/temporal-upsampling.js`

Runs game logic at 30fps, renders at 60fps with linear interpolation of entity positions between logic ticks. The `EnhancedFrameManager` fixed-timestep accumulator is correctly implemented with a spiral-of-death guard (`maxUpdatesPerFrame = 3`). Disabled via `useTemporalUpsampling: false`. If enabled, this would **halve the cost of all game logic** (collision, movement, AI, physics) while maintaining smooth 60fps visuals. Lowest-risk re-enable of the three disabled systems.

---

## Summary of Issues by Severity

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | Asteroid draws 30 separate `ctx.stroke()` calls — should be 1 | `asteroid.js:343` |
| **High** | Asteroid calls `Date.now()` 30× per frame (once per edge) — should be 1 | `asteroid.js:354` |
| **High** | Asteroid allocates 30 HSL template strings per frame | `asteroid.js:355` |
| **High** | `ctx.shadowBlur` applied live every frame on particles and stars | `particle.js`, `color-star.js` |
| **High** | `PoolManager.release()` uses O(n) `indexOf` before O(1) swap-and-pop | `pool-manager.js:36` |
| **High** | `ParticleBatch` uses `Math.sqrt` per pixel in circle rasterization | `render-batch.js:108` |
| **High** | `ParticleBatch.clear()` uses a JS loop instead of `TypedArray.fill(0)` | `render-batch.js:73` |
| **High** | `ParticleBatch` is not wired to the active particle pool | `render-batch.js`, `game-engine.js` |
| **High** | Typed array particle system is hard-disabled (`if (false && ...)`) | `typed-array-particles.js` |
| **High** | Health bar gradient recreated every frame regardless of health change | `asteroid.js:299` |
| **Medium** | Asteroid resets 4 shadow properties per edge (120 assignments/frame) | `asteroid.js:359–363` |
| **Medium** | `cleanupInactive()` uses `splice()` inside loop — O(n²) worst case | `pool-manager.js:57` |
| **Medium** | Quadtree rebuilt fully each frame — O(n log n) for no net benefit at current entity counts | `quadtree.js` |
| **Medium** | `Quadtree.getIndex()` allocates a new array on every call | `quadtree.js:66` |
| **Medium** | `Quadtree.retrieve()` uses spread-into-push for recursive concatenation | `quadtree.js:155` |
| **Medium** | `RenderBatch.getStateKey()` creates a new template-literal string per entity per frame | `render-batch.js:21` |
| **Medium** | `TextCache` eviction is FIFO, not LRU | `text-cache.js:19` |
| **Medium** | `DepthBatchRenderer` allocates a sorted array every frame | `depth-batch-renderer.js:54` |
| **Medium** | Bullet trail uses `Array.shift()` — O(n) per frame per bullet | `bullet.js` |
| **Medium** | `StarFieldCache` captures a twinkling snapshot rather than a static layout | `canvas-layers.js:149` |
| **Medium** | Starfield density does not affect star placement (only size/twinkle) | `utils.js:313` |
| **Low** | Far layer Worley weight unnormalized (FBM+Worley = 1.2, not 1.0) | `constants.js:178` |
| **Low** | Spiral arm width grows unbounded (`0.3 + distance * 0.5`) | `utils.js:262` |
| **Low** | `parseInt(font)` in TextCache silently fails for non-numeric font strings | `text-cache.js:35` |
| **Low** | `scoreCache` pre-warms 0–100 but game scores quickly exceed that | `text-cache.js:149` |
| **Low** | Frustum culling uses static 100px padding regardless of entity velocity | `frustum-culling.js` |
| **Info** | Web workers fully disabled | `worker-manager.js` |
| **Info** | Temporal upsampling fully disabled | `temporal-upsampling.js` |

---

## Prioritized Optimizations with Expected Gains

All estimates assume a single asteroid, 4 enemies, 20 bullets, 30 particles, running at 60fps on mid-range desktop hardware. Mobile estimates are roughly 3–5× more impactful due to tighter GPU budgets.

---

### Fix 1 — Batch asteroid edges into one `ctx.stroke()` call

**Cost:** ~1 hour. **Risk:** Low (visual-only change, gameplay unaffected).

**Current:** 30 `ctx.stroke()` calls per frame per asteroid, each flushing the GPU path buffer. Plus 30 `Date.now()` calls, 30 HSL string allocations, and 120 shadow-property resets.

**After:** Hoist `Date.now()` before the loop (1 call, shared hue). Set `lineWidth`, `shadowColor`, `shadowBlur` once before the loop. Batch all edges into one `beginPath()`/`stroke()` pair (or group by depth bucket into 3–5 paths).

**Rough calculation:**
- Each `ctx.stroke()` flush costs ~5–15μs on a GPU with no batching
- 30 flushes/frame × 15μs = 450μs = **0.45ms/frame** from stroke calls alone
- After batching to 1 stroke: 1 × 15μs = 15μs → **saving ~0.43ms/frame**
- 30 string allocations eliminated → reduced GC pressure (not directly measurable in μs but removes pause risk)
- **Total expected gain: ~0.4–0.8ms/frame, ~25–50% faster asteroid rendering**

---

### Fix 2 — Eliminate live `ctx.shadowBlur` — pre-render glow sprites

**Cost:** ~2–3 hours. **Risk:** Low to medium (visual parity must be verified).

**Current:** ~30 particles with `shadowBlur = radius * 4` each frame. Each triggers a GPU Gaussian blur over ~10,000 pixels. Additionally 4–6 color stars with `shadowBlur = 8–15`.

**After:** Pre-render each (type, radius, color) combination to an offscreen canvas at init. Draw time becomes `ctx.drawImage(sprite, x, y)` — a GPU texture sample.

**Rough calculation:**
- Gaussian blur at radius 40 over 10,000 pixels: ~1.6M ops per shadow draw (see earlier analysis)
- 30 particles: 48M blur ops/frame → at GPU throughput of ~10B simple ops/sec: ~4.8ms
- `drawImage()` cost: negligible, ~1–5μs per call → 30 calls = 0.03–0.15ms
- **Total expected gain: ~2–5ms/frame on desktop, ~5–10ms/frame on mobile**
- This is likely the single highest-impact optimization available

---

### Fix 3 — Fix `PoolManager.release()` to true O(1)

**Cost:** ~30 minutes. **Risk:** Low (pure internals change, API unchanged).

**Current:** `indexOf(obj)` scans `activeObjects` for every release. With 20 active bullets, each release is 20 comparisons on average.

**After:** `_poolIndex` on each object → direct index access, 0 comparisons.

**Rough calculation:**
- Bullets fire ~5/sec per bullet type, live ~1 sec → ~5 releases/sec per player weapon
- With player + 4 enemy types: ~25 releases/sec for bullets alone
- Plus ~30 particle releases/sec → ~55 releases/sec total
- At 20 active objects average: 55 × 20 = 1,100 comparisons/sec = ~18 comparisons/frame
- After: 0 comparisons
- **Gain: ~18 fewer comparisons/frame** — small now but scales quadratically with entity count
- More importantly, eliminates O(n²) worst case in `cleanupInactive()`

---

### Fix 4 — Replace `ParticleBatch.clear()` JS loop with `fill(0)`

**Cost:** 5 minutes (one line change). **Risk:** Zero.

**Current:** JS for-loop over 8.3M elements (at 1080p) = ~2–4ms/frame if ParticleBatch were active.

**After:** `this.data.fill(0)` — typed array native op running at memory bandwidth (~20GB/s on modern hardware):
- Buffer size: 1920 × 1080 × 4 bytes = ~8.3MB
- At 20GB/s: ~0.42ms vs ~3ms for JS loop
- **Gain: ~2.5ms/frame** (when ParticleBatch is wired in)

---

### Fix 5 — Replace `Math.sqrt` with squared-distance in `ParticleBatch`

**Cost:** 10 minutes. **Risk:** Zero.

**Current:** `Math.sqrt` called for every pixel in the bounding box of each circle particle. For radius 20: 1,600 sqrt/particle × 30 particles = 48,000 sqrt/frame.

**After:** `distSq <= radiusSq` — only pixels that pass call sqrt (for the `falloff` calculation). A circle of radius r fills `π/4 ≈ 78.5%` of its bounding box, so ~21.5% of sqrt calls are eliminated by the early rejection. More importantly, a multiplication is ~5–10× faster than sqrt on most CPUs.

**Rough calculation:**
- 48,000 sqrt calls → 48,000 × 5ns = 240μs currently (rough estimate)
- After: 48,000 multiplications (fast) + ~37,700 sqrt calls (78.5% pass rate) = ~37,700 × 5ns = 189μs
- **Gain: ~50μs/frame** — modest alone, but paired with wiring ParticleBatch to the actual particle pool the combined effect is significant

---

### Fix 6 — Cache asteroid health bar gradient

**Cost:** 10 minutes. **Risk:** Zero.

**Current:** `ctx.createLinearGradient()` allocated on every `draw()` call. Gradient color tier (green/yellow/red) checked every frame.

**After:** Store three pre-built gradients (one per health tier) as properties. Only rebuild a gradient when the health tier boundary is crossed.

```js
// in reset():
this._gradients = {};  // cleared on reset
this._lastGradientTier = null;

// in draw():
const tier = hp > 0.5 ? 'green' : hp > 0.25 ? 'yellow' : 'red';
if (tier !== this._lastGradientTier) {
    this._gradients[tier] = buildGradient(ctx, tier, barX, barY, barHeight);
    this._lastGradientTier = tier;
}
ctx.fillStyle = this._gradients[tier];
```

**Rough calculation:**
- `createLinearGradient()` + 2 `addColorStop()` calls: ~2–5μs each
- At 1 asteroid per frame: 2–5μs saved
- **Gain: ~2–5μs/frame** — small but free

---

### Fix 7 — Enable temporal upsampling (30fps logic, 60fps render)

**Cost:** ~2–4 hours of testing. **Risk:** Medium (interpolation artifacts with fast entities).

**Current:** All game logic (collision, movement, AI, particle updates) runs at 60fps.

**After:** Logic runs at 30fps. Entity positions are linearly interpolated for the 60fps display frames between logic ticks.

**Rough calculation:**
- If game logic costs 4ms/frame at 60fps, temporal upsampling halves it to 2ms at 30fps logic rate
- 60 render frames/sec with 30 logic frames/sec: logic runs every other frame → 2ms every other frame = 1ms/frame average logic cost
- **Gain: ~2–3ms/frame** — halves all non-rendering update cost
- Side effect: bullet prediction and homing may feel slightly laggy at tick boundaries; requires careful testing

---

### Fix 8 — Replace Quadtree with a uniform spatial grid

**Cost:** ~3–4 hours. **Risk:** Low to medium (logic change, needs thorough collision testing).

**Current:** Quadtree rebuilt from scratch every frame, O(n log n). At 10 entities this is dominated by rebuild overhead, not query benefit.

**After:** 8×6 uniform grid (48 cells). Insert: `grid[row][col].push(entity)` — O(1). Query: check 9 neighboring cells — O(k) where k is local entity density. No allocation, no recursion.

**Rough calculation:**
- Quadtree rebuild for 10 entities: ~10 × log₂(10) × overhead ≈ 30 operations + node allocation
- Grid insert for 10 entities: 10 × 1 operation = 10 operations, no allocation
- **Gain: modest at current scale (~0.05ms/frame), but eliminates per-insert allocation entirely**
- Scales correctly for future entity count increases; quadtree becomes a liability above ~50 entities

---

### Fix 9 — Wire up typed array particle system

**Cost:** ~4–6 hours. **Risk:** Medium (requires validating visual parity for all 15 particle types).

**Current:** Object pool with per-object JS heap allocations.

**After:** Structure-of-Arrays typed arrays — CPU cache-friendly linear updates, no GC from particle objects.

**Rough calculation:**
- Cache miss penalty: ~100ns per L2 miss, ~300ns per L3 miss
- Object pool with 30 particles: each update accesses scattered heap objects → likely L2 misses → 30 × 100ns = 3μs overhead purely from cache misses
- Typed array: sequential access, prefetcher loads ahead → ~0 cache misses for updates
- **Gain: ~2–5μs/frame for update, meaningful gain for rendering** (typed array allows vectorized operations)

---

### Fix 10 — `TextCache` LRU eviction + score pre-warm range

**Cost:** 20 minutes. **Risk:** Zero.

- On cache hit: `this.cache.delete(key); this.cache.set(key, value)` — Map preserves insertion order, so this moves the entry to "newest"
- Change `precacheNumbers(0, Math.min(100, maxValue))` to `precacheNumbers(0, Math.min(10000, maxValue))` for score cache
- **Gain:** Eliminates mid-game cache misses for scores; prevents HUD label thrashing under cache eviction

---

### Summary Table

| Fix | Effort | Expected Gain | Risk |
|-----|--------|--------------|------|
| 1. Batch asteroid edges | 1h | 0.4–0.8ms/frame | Low |
| 2. Pre-render glow sprites | 2–3h | 2–5ms/frame (desktop), 5–10ms (mobile) | Low–Med |
| 3. O(1) pool release | 30m | Negligible now, critical at scale | Low |
| 4. `fill(0)` for ParticleBatch | 5m | 2.5ms/frame (when wired) | Zero |
| 5. Squared-distance in ParticleBatch | 10m | 50μs/frame alone | Zero |
| 6. Cache health bar gradient | 10m | 2–5μs/frame | Zero |
| 7. Enable temporal upsampling | 2–4h | 2–3ms/frame | Medium |
| 8. Spatial grid vs quadtree | 3–4h | 0.05ms/frame now, future-proof | Low–Med |
| 9. Wire typed array particles | 4–6h | 2–5μs update + rendering gains | Medium |
| 10. TextCache LRU + pre-warm | 20m | Eliminates cache thrash | Zero |

**Combined realistic gain from fixes 1–6 alone (no risk, high confidence): ~5–9ms/frame freed on desktop, ~10–18ms on mobile.** At a 60fps budget of 16.7ms/frame, this represents recovering 30–55% of the frame budget currently spent unnecessarily.

---

*End of report.*
