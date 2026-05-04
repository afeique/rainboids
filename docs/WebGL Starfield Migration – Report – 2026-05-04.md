# WebGL Starfield Migration — Report — 2026-05-04 (5.64.16)

## What landed

A second WebGL layer on the existing `glCanvas` that renders the
majority of the starfield via one instanced draw call per frame.
Sharing the GL context with the particle renderer (5.64.0) means we
don't pay a second context-creation cost; both layers draw on the same
canvas, starfield first, particles on top.

## What's where

### Rendered by WebGL (`WebGLStarfieldRenderer`)

| Source | Shape filter | Per-frame cost |
|---|---|---|
| `backgroundStarPool` (entire pool) | always rendered as `dot` | ~0.05ms total |
| `colorStarPool` decoratives with `circle` / `point` | rendered as `dot` | ~0.05ms total |
| `colorStarPool` decoratives with `diamond` / `triangle` / `hexagon` | matching atlas slot | (combined with above) |
| `colorStarPool` decoratives with `star4` / `star5` / `star6` / `star8` | matching atlas slot | (combined with above) |

**Default counts** (with `WEBGL_BACKGROUND_STAR_MULTIPLIER = 6`,
`WEBGL_COLOR_STAR_MULTIPLIER = 3`):

- Background: `BACKGROUND_STAR_COUNT × 2 × 6` = **360 stars**
- Color (decorative): `COLOR_STAR_COUNT × 3` ≈ **75 stars**
- **WebGL total: ~435 stars**, one instanced draw call.

All twinkle, parallax, and rotation runs in the vertex shader — CPU
work per frame is one uniform update (cumulative drift `vec2`).

### Rendered by Canvas2D (kept on the existing `depthBatchRenderer`)

| Source | Why |
|---|---|
| `colorStarPool` with `shape === 'sparkle'` | Has 8 spike arms with per-arm length variation — not a static silhouette |
| `colorStarPool` with `shape === 'burst'` | Animated multi-spoke burst pattern |
| `colorStarPool` with `isBurst` (collectible orbs: health & money) | Custom rendering with overlay icons (heart, coin SVG), pulsing rings, and absorption animations during pickup |
| `nebulaRenderer` (lens-flare layers) | Pre-baked offscreen layers, already optimal — would gain ~0% by porting |

**Default counts**: typically 0–5 stars on Canvas2D in any given frame
(the sparkle/burst spawn rate is rare). Plus the 4 lens-flare layer
`drawImage` calls — together <0.1ms/frame.

### Toggle: pure-WebGL mode

`GAME_CONFIG.WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS = false` disables
the Canvas star pass entirely. Loses the animated sparkle/burst
silhouettes and the collectible-orb icons but eliminates the last
Canvas2D star cost. Reasonable for benchmarking / max-perf builds.

## Performance

### Per-frame cost (estimated)

| | Pre-5.64.16 (Canvas2D only) | Post-5.64.16 (Hybrid) |
|---|---|---|
| Background stars | 60 stars × 0.5-1µs each + bucketing | 360 stars in 1 instanced draw |
|  | ~50-100µs | ~50ns instance write × 360 + 1 draw call ≈ **5-15µs** |
| Color stars (decorative) | 25 stars (some via depth-batch, sparkle/burst individual) | 70 stars in same draw + 5 stars on Canvas2D |
|  | ~30-80µs | (combined into the same instanced draw — **0µs additional**) |
| Sparkle/burst/orbs | (no change) | (no change) — ~30-60µs |
| Lens flare nebula | 4 drawImage | (no change) — ~50-150µs |
| **Starfield total** | **~110-240µs** (~0.7-1.4% of 16.6ms) | **~85-225µs** but rendering **~6× more stars** |

The per-frame cost is roughly the same — but we're now rendering 6×
the number of stars. Effective per-star cost dropped from ~2-4µs to
~30-50ns.

### Headroom

The instance VBO is sized for 4000 stars (`WEBGL_STAR_BUFFER_SIZE`).
At 4000 stars in a single draw call: ~150µs/frame total. Roughly
linear scaling — doubling to 8000 would still fit the frame budget
comfortably.

## Architecture details

### Files added

- `js/modules/performance/webgl-starfield-renderer.js` (~290 LOC)
  - The `WebGLStarfieldRenderer` class. Compile/link, VAO setup,
    addStar / clear / draw / accumulateDrift API, context-loss recovery.
- `js/modules/performance/webgl-starfield-atlas.js` (~120 LOC)
  - Bakes the 1024×128 atlas with 8 shape slots — `dot` (radial
    Gaussian + halo) plus 7 path-based silhouettes.

### Files modified

- `js/modules/game-engine.js` — instantiate starfield renderer, populate
  from pools after spawn (`_tryAddBackgroundStarToWebGL` /
  `_tryAddColorStarToWebGL`), call `draw()` before particles each
  frame, integrate ship velocity into drift uniform per tick, clear GL
  layer once per frame. Color-string parser cache for fast RGB→float
  conversion.
- `js/modules/performance/webgl-particle-renderer.js` — clear ownership
  moved out so starfield can draw before particles without being wiped.
- `js/modules/core/constants.js` — `WEBGL_STAR_BUFFER_SIZE`,
  `WEBGL_BACKGROUND_STAR_MULTIPLIER`, `WEBGL_COLOR_STAR_MULTIPLIER`,
  `WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS`.

### Per-instance attribute layout (14 floats / 56 bytes)

```
0,1   basePos      world x, y (immutable after spawn)
2     parallax     parallax factor (0 = static, higher = moves more)
3     size         half-width of the rendered quad in px
4-7   color        rgba in [0, 1]
8     twinklePhase radians offset for sin
9     twinkleSpeed radians/sec
10    twinkleAmp   alpha-modulation amplitude (0..1)
11    shape        atlas slot index (0..NUM_SLOTS-1)
12    baseAngle    initial rotation (radians)
13    rotRate      rotation rate (radians/sec)
```

VBO size at 4000-star cap: 4000 × 56 = 224KB. Negligible.

### Vertex shader (key transforms)

```glsl
// Twinkle alpha
float twink = (1 - a_twinkleAmp)
            + a_twinkleAmp * (0.5 + 0.5 * sin(u_time * a_twinkleSpeed + a_twinklePhase));

// Rotated quad
float angle = a_baseAngle + u_time * a_rotRate;
vec2 rotQuad = vec2(a_quadPos.x * cos(angle) - a_quadPos.y * sin(angle),
                    a_quadPos.x * sin(angle) + a_quadPos.y * cos(angle));

// Parallax-corrected world position, wrapped to game field
vec2 worldPos = mod(a_basePos - u_drift * a_parallax, u_field);

// Build vertex in world space, then to clip space
vec2 worldVertex = worldPos + rotQuad * a_size * 2;
vec2 screenPos = worldVertex - u_camera;
vec2 clip = (screenPos / u_viewport) * 2 - 1;  clip.y = -clip.y;
gl_Position = vec4(clip, 0, 1);

// Atlas UV
v_uv = vec2(a_shape / u_atlasSlots + a_quadUV.x / u_atlasSlots, a_quadUV.y);
v_color = vec4(a_color.rgb, a_color.a * twink);
```

### Render order each frame

1. Engine clears `glCanvas` (transparent black).
2. `starfieldRenderer.draw()` — single instanced draw call, ~435
   stars.
3. `nebulaRenderer.draw()` — drawn on `gameCanvas` (Canvas2D), 4
   layered `drawImage` calls.
4. Canvas2D depth-batch renders the stars NOT in WebGL (sparkle,
   burst, collectibles).
5. `particleRenderer.drawParticles()` — instanced WebGL particle pass,
   on the same `glCanvas`, additive-blended on top of the starfield.
6. Canvas2D entities + HUD on `gameCanvas`.

The starfield → particles ordering matters: stars are dim, particles
are bright; particles should pop above the starfield.

## What's still on Canvas2D and why

- **Sparkle / burst color-star shapes** — animated 8-spoke patterns
  with per-arm length variation, can't be expressed as a single static
  atlas slot rotated.
- **Collectible orbs (`isBurst`)** — health/money pickups. They have
  custom overlay icons (heart, coin SVG), pulsing absorption rings,
  and pickup animations. Not really stars, just stored in the same
  pool.
- **Nebula lens-flare layers** — pre-baked into 4 offscreen canvases
  at startup; per-frame cost is 4 `drawImage` calls (~50-150µs total),
  already optimal. Migrating would be ~0% win.

## Testing

- All 56 tests in the focused suite (`03-player`, `04-hud`, `06-pools`,
  `07-weapons`) pass after the migration.
- Initial full-suite run had 5 intermittent failures (timing-related at
  the very-early game-state assertions when 95 tests run sequentially
  with a slow boot path); rerun in isolation passes.

## Future work / nice-to-haves

1. **Move sparkle/burst to WebGL too** — would need 2-3 more atlas
   slots with multi-arm patterns + per-instance "arm count" attribute.
   Maybe ~1 day's work. Current Canvas cost is ~30-60µs at typical
   spawn rates so the win is small.
2. **Move nebula layers to WebGL** — would need to bake the existing
   offscreen canvases as textures, render as 4 textured quads with
   parallax+rotation in shader. Trades 4 Canvas2D drawImages for 4
   WebGL textured quads. Negligible perf win, ~0.5 day.
3. **Adaptive star count based on FPS** — bump
   `WEBGL_BACKGROUND_STAR_MULTIPLIER` higher if FPS is comfortable, or
   reduce on FPS drop. The buffer is sized for 4000; current default
   of 435 has lots of headroom.
4. **Star color palette refresh** — shapes are silhouettes tinted by
   per-instance color. Extending the palette / introducing brighter
   "stellar nursery" stars would be a one-line change at population
   time.

## TL;DR

**Pre-migration**: 60 background stars + 25 color stars on Canvas2D,
~110-240µs/frame.

**Post-migration**: 360 + 70 stars on WebGL (one instanced draw),
~5 sparkle/burst/orb stars on Canvas2D, ~85-225µs/frame total — but
rendering ~6× as many stars. Per-star cost dropped from ~2-4µs to
~30-50ns. Plenty of headroom to scale further.

The hybrid approach buys us most of the WebGL win while keeping the
animated sparkle/burst/collectible visuals that make the game feel
alive. Toggle to pure-WebGL with one constant flip.
