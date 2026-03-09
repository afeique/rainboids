# Rainboids — Background Starfield Rendering Analysis
**Date:** 2026-03-08
**Scope:** Noise algorithms, density pipeline, star placement, visual layers, and suggestions for improvement

---

## Table of Contents

1. [The Three Noise Types Explained](#the-three-noise-types-explained)
2. [How They Combine](#how-they-combine)
3. [What the Density Value Actually Does](#what-the-density-value-actually-does)
4. [Suggestions for Visual Improvement](#suggestions-for-visual-improvement)

---

## The Three Noise Types Explained

### Perlin Noise (`perlin2`)

Perlin noise generates smooth, continuous random values by interpolating between gradient vectors at integer grid corners. The key properties:

- Uses a 256-entry permutation table (shuffled by seed) doubled to 512 to avoid index wrapping
- The `fade()` function (`t³(t(6t−15)+10)`) gives smooth S-curve interpolation — this removes visible grid artifacts
- `grad()` selects from 16 gradient directions using `hash & 15`, mapping the position to a dot product
- Output range: roughly `[−1, 1]`, though rarely hits the extremes
- Visually: blobs and patches at a fixed scale — it looks like smooth TV static. One Perlin call produces one "frequency" of structure.

### FBM — Fractional Brownian Motion (`fbm`)

FBM is Perlin noise stacked at multiple scales ("octaves"), each half the amplitude (`amplitude *= persistence`) and double the frequency (`frequency *= lacunarity`). This is what makes the output look like natural phenomena — clouds, terrain, galaxies:

```
total = Σ(i=0..octaves) perlin(x * freq^i, y * freq^i) * persistence^i
result = total / maxValue   ← normalized to approximately [-1, 1]
```

The three depth layers use different parameters:

| Layer | Octaves | Persistence | Lacunarity | FBM Scale | Effect |
|-------|---------|-------------|------------|-----------|--------|
| Far (z < 0.6) | 5 | 0.45 | 2.1 | 0.0008 | Large blobs dominate — mimics distant galactic arm structure |
| Mid (0.6 ≤ z < 2.0) | 4 | 0.5 | 2.0 | 0.0015 | Balanced medium-scale clusters with moderate detail |
| Near (z ≥ 2.0) | 3 | 0.6 | 2.0 | 0.005 | Fine-grained, detailed texture — granular nearby star fields |

Low persistence (far layer) means higher octaves fade quickly, so large-scale structure dominates. High persistence (near layer) means fine detail survives, giving a more granular appearance up close. This naturally models how a galaxy looks different at different apparent depths.

### Worley Noise / Cellular Noise (`worley`)

Worley noise places random "feature points" in each cell of a grid, then at any query point returns the *distance to the nearest feature point*. This creates Voronoi cell patterns — natural-looking clustering that resembles how stars actually clump:

```
for each of 9 neighboring cells (3×3):
    find the nearest feature point in that cell
    return minimum distance to any of them
```

The result is **inverted** before use (`1.0 − worleyVal`), so it is **high near feature points and low in the empty gaps** between cells. This creates compact bright clusters surrounded by voids — exactly how galaxies, globular clusters, and nebulae actually look.

Note: `getPoint()` picks the candidate point *closest to the cell center* among candidates rather than purely random placement. This biases feature points toward cell interiors, avoiding edges. It is subtle but makes clusters rounder and more natural.

| Layer | Worley Scale | Worley Weight | Effect |
|-------|-------------|---------------|--------|
| Far | 0.002 | 0.5 | Large, prominent cell clusters |
| Mid | 0.008 | 0.3 | Medium-scale clustering |
| Near | 0.020 | 0.1 | Fine grain, minimal cellular influence |

### Galaxy Pattern (Mathematical, Not Noise)

This is not noise-based — it is a direct mathematical formula applied over 4 hardcoded galaxy centers:

```js
GALAXY_CENTERS: [
    { x: 0.25, y: 0.3, intensity: 0.8, spiralTightness: 0.15, haloRadius: 0.4 },
    { x: 0.75, y: 0.7, intensity: 0.9, spiralTightness: 0.12, haloRadius: 0.35 },
    { x: 0.15, y: 0.8, intensity: 0.7, spiralTightness: 0.18, haloRadius: 0.3  },
    { x: 0.85, y: 0.2, intensity: 0.6, spiralTightness: 0.20, haloRadius: 0.25 },
]
```

**Halo effect:** `exp(−dist / (haloRadius × 0.5))` — exponential falloff produces a bright nucleus with soft edges, exactly like a real galactic core.

**Spiral arms:** `log(dist × 100 + 1) × spiralTightness` — a logarithmic spiral (the same formula as a real Archimedean/logarithmic spiral in nature), projected as an angle offset at each radial distance. Then `angleDiff < spiralWidth` selects stars within the arm, with cosine falloff for soft arm edges. Two arms per galaxy (`SPIRAL_ARMS: 2`).

**Distance limit:** `exp(−dist × 3)` — exponential decay limits each galaxy's influence radius so four galaxies do not overlap and flood the whole screen.

**Depth weighting:** Galaxy structure is weighted more heavily in the far layer (`depthMultiplier = 1.2`) and less in the near layer (`depthMultiplier = 0.4`), reflecting how galactic macro-structure is most visible in the deepest, most distant stars.

---

## How They Combine

The `getStarDensity(x, y, z)` function runs the full pipeline:

```
1. Select layer config based on z-depth:
     z < 0.6    → FAR_LAYER
     0.6 ≤ z < 2.0 → MID_LAYER
     z ≥ 2.0    → NEAR_LAYER

2. Compute base noise density:
     fbmVal     = fbm(x × FBM_SCALE, y × FBM_SCALE, octaves, lacunarity, persistence)
     worleyVal  = 1.0 − worley(x × WORLEY_SCALE, y × WORLEY_SCALE)
     baseDensity = fbmVal × FBM_WEIGHT + worleyVal × WORLEY_WEIGHT

3. Contrast boost:
     baseDensity = (baseDensity − 0.5) × 2.5 + 0.5
     (expands [0.2, 0.8] → [−0.25, 1.25] before clamping — makes voids emptier
      and clusters denser, so the galaxy structure reads clearly)

4. Compute galaxy pattern:
     galaxyDensity = Σ(per galaxy) max(halo, spiral) × distanceDecay × depthMultiplier

5. Combine:
     combined = baseDensity × 0.6
              + galaxyDensity × 0.4
              + baseDensity × galaxyDensity × 0.3   ← multiplicative term

6. Clamp to [0, 1]
```

### The Multiplicative Term

The `baseDensity × galaxyDensity × 0.3` term is the key design choice. It creates a **double-dense boost**: regions where both the noise field *and* a galaxy pattern are high receive an extra amplification beyond a simple linear blend. Galaxy cores sitting on top of high-density noise clusters pop out dramatically. Regions where only one signal is high receive a smaller boost. This is analogous to the multiply blend mode in image editing — it naturally emphasizes coincident peaks.

### The Contrast Boost

Without the `(x − 0.5) × 2.5 + 0.5` stretch, the raw FBM+Worley output clusters around `[0.2, 0.8]` — a muddy, nearly uniform gray. The contrast expansion pushes low values toward zero (empty voids) and high values toward or above one (dense clusters, clamped). This is what makes the starfield look like it has genuine structure rather than uniform noise.

---

## What the Density Value Actually Does

Critically, **density does not control placement**. `generateStarPositions()` places one star per jittered grid cell regardless of density value. The star placement algorithm is:

1. Compute grid dimensions from `sqrt(starCount / aspectRatio)`
2. For each grid cell, place a star at the cell center plus random jitter (±35% of cell size)
3. Sample a random depth `z` from a weighted probability table:

| Probability | Depth range | Visual layer |
|------------|-------------|--------------|
| 0–15% | z ∈ [0.1, 0.3] | Very far |
| 15–35% | z ∈ [0.3, 0.6] | Far |
| 35–55% | z ∈ [0.6, 1.0] | Mid-far |
| 55–70% | z ∈ [1.0, 1.5] | Mid |
| 70–82% | z ∈ [1.5, 2.0] | Mid-close |
| 82–91% | z ∈ [2.0, 2.5] | Close |
| 91–97% | z ∈ [2.5, 3.0] | Very close |
| 97–100% | z ∈ [3.0, 4.0] | Foreground |

4. Call `getStarDensity(x, y, z)` and store the result as `density` on the star

The density value then affects only two properties on the resulting star object:
- **Radius:** `densityFactor = 0.5 + density × 0.5` → stars in dense regions are slightly larger
- **Twinkle speed:** slightly faster in denser regions

Stars are placed on a grid first, then get a density value — not the other way around.

---

## Suggestions for Visual Improvement

### A. Use density for rejection sampling, not just star sizing

The most impactful change available. Currently all grid cells get a star. Instead, use the density value as a *probability* of placing a star:

```js
const density = getStarDensity(x, y, z, spawnWidth, spawnHeight);
if (Math.random() > density * 1.5) continue; // skip low-density cells
```

This would make galaxy arms genuinely denser (more stars placed there) and voids genuinely empty. Right now the density gradient only shows up as slight size variation — barely visible at the scale of 30–55 stars. With rejection sampling, the galaxy spiral structure would become clearly visible as regions with noticeably more or fewer stars.

### B. Fix the unbalanced Worley weights in the far layer

`FAR_LAYER` has `FBM_WEIGHT: 0.7` and `WORLEY_WEIGHT: 0.5` — these sum to 1.2, so `baseDensity` before the contrast boost can exceed the `[−1, 1]` range that FBM and inverted Worley each individually span. `MID_LAYER` and `NEAR_LAYER` sum to ~0.9, which is normalized. The far layer's overweighting is partially hidden by the contrast clamp, but normalizing to `FBM_WEIGHT + WORLEY_WEIGHT = 1.0` would give more predictable, layer-consistent output.

### C. Add a subtle nebula color wash to the background canvas

Right now the canvas background is solid black. Real deep-sky images show faint blue/purple regions (emission nebulae), reddish-brown regions (dust lanes), and greenish-teal regions (ionized gas). A simple low-amplitude FBM pass rendered once at initialization as a series of radial gradients — at opacity 0.03–0.08 — drawn to the static background canvas before stars are placed, would add enormous depth at near-zero runtime performance cost.

### D. Expand the star color palette toward astrophysically common colors

The current palette runs blue-purple-pink-orange:
```js
NORMAL_STAR_COLORS = ['#a6b3ff', '#c3a6ff', '#f3a6ff', '#ffa6f8',
                      '#ffa6c7', '#ff528e', '#d98cff', '#ff8c00']
```

This is colorful but missing the most astronomically common star colors at visible magnitudes: white, cream, and pale yellow, which together make up the majority of observable stars (A, F, G spectral classes). Adding `'#ffffff', '#fffce0', '#fff3c0', '#ffd6a0'` to the palette and weighting them more heavily (e.g. 60% white/cream, 40% colored) would make the starfield look more realistic while retaining its colorful character.

### E. Correlate twinkling speed inversely with depth

Currently `twinkleSpeed` is tied to density. It would look better tied to `1/z` — far dim stars twinkle faster, nearby bright ones are more stable. This reinforces depth perception: the sense that distant stars are faint, unstable points of light while close bright ones are steady. In reality atmospheric scintillation works this way, and the principle translates well to a space game starfield.

### F. Cap spiral arm width at galaxy edges

```js
const spiralWidth = 0.3 + distance * 0.5;
```

This makes arm width grow linearly with distance from center — at `distance = 1.0` (normalized screen edge), `spiralWidth = 0.8`, which is nearly half the full 2π circle. Real spiral galaxies maintain relatively narrow arms. Capping at something like `Math.min(0.5, 0.2 + distance × 0.3)` would keep arms defined and distinct at their outer edges rather than bleeding into each other.

### G. Pre-bake the density field to a small texture

`getStarDensity()` performs FBM (up to 5 Perlin evaluations) + Worley + per-galaxy spiral math per star per `generateStarPositions()` call. For the current 55-star count this is fast. But the density field is a smooth continuous function that changes very little between adjacent pixels. Pre-baking it to a small (e.g. 64×64) `Float32Array` at initialization time, then bilinearly sampling it during star placement, would be approximately 100× faster and would support much higher star counts or runtime field regeneration without cost.

---

*End of analysis.*
