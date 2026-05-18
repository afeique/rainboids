# WebGL2 Full Renderer — Migration Roadmap (2026-05-17)

**Goal**: when URL is `?renderer=webgl2`, render the full game using only
WebGL2 — no Canvas2D layers for world entities or weapon effects.

**Status (2026-05-17)**: scaffolding shipped (`js/modules/renderer/render-mode.js`
parses `?renderer=`, exports the constants `RENDER_MODE_HYBRID`,
`RENDER_MODE_WEBGL2`, `RENDER_MODE_WEBGPU`). The parser is **not yet wired
into `game-engine.js`** — no caller imports `getRenderModeFromURL()` outside
tests, so today every URL renders in HYBRID mode regardless of `?renderer=`.
The plan below assumes a Phase 0 wiring task lands first that flips
Canvas2D entity passes into no-ops when `renderMode === 'webgl2'`. With
that flip alone, the WebGL2 layers (starfield, foreground bloom, GPU
weapon effects, bullets, particles) render normally; the entity passes
listed below become visible gaps until each migration here lands.

This document inventories every Canvas2D layer still on the gameCanvas
context after the v6.3.0–v6.4.0 GPU work shipped (per the GPU Rendering
Plan, §17 Phase 2.5 and §6 Phase 3). Each entry: file references, suggested
shader/technique approach, edge cases, and an honest effort estimate.

> Honesty note on effort estimates: the existing Canvas2D paths are far
> richer than "draw a triangle" — asteroids project a 3D mesh and depth-
> bucket per-edge HSL strokes; enemies are bespoke per-type ship designs
> with engine glows, cockpits, wing fillets, and pulse animations; the
> player ship is ~800 LOC of layered radial gradients with a black
> silhouette pre-pass. The estimates below assume reasonable visual
> parity (within "feels the same in motion"), NOT pixel-exact parity.
> Pixel-exact parity for the hand-tuned ship designs would push every
> enemy/player figure to 1.5–2× the estimate.

---

## Summary

| # | Layer | File(s) | Current cost (Canvas2D) | Suggested approach | Effort |
|---|---|---|---|---|---|
| 1 | Asteroids (3D wireframe, damage wave) | `js/modules/world/asteroid.js` | ~0.3 ms | Instanced thick-line SDF capsules per edge, per-edge HSL via vertex attr; death-flash via radial-falloff SDF | **3–4 days** |
| 2 | Enemies (10 types, bespoke designs) | `js/modules/enemy/shapes.js` + `enemy.js` | ~0.5 ms | Pre-bake each enemy silhouette + decoration layers into atlas slots; instanced quads with per-instance hue/pulse uniforms. Light trails + sweep lasers + charging beams reuse the SDF capsule renderer | **5–7 days** |
| 3 | Player ship (radial gradients, engine plumes, silhouette) | `js/modules/player/renderer.js` | ~0.5 ms | Bake static hull layers into an atlas slot; engine plume + thrust shudder via SDF capsule with animated uniforms; charging effects reuse particle renderer | **2–3 days** |
| 4 | Remote ships (MP) | `js/modules/player/renderer.js:31` (`drawRemoteShip`) | trivial | Reuse the baked player ship atlas at lower fidelity | **0.25 day** (parasitic on #3) |
| 5 | Enemy bullets — Canvas2D fallback shapes | `js/modules/enemy/enemy-bullet.js:630` | <0.1 ms | Migrate the 5 fall-through shapes (mine, missile body, crescent, BOMB overlay, explosive spinning-spikes) to atlas slots or compose from existing SDF primitives | **2 days** |
| 6 | Powerups | `js/modules/world/powerup.js:844` | ~0.1 ms | Atlas slot per powerup type with cached gradient bake; per-instance pulse + rotation uniforms; outer aura via SDF ring | **1.5 days** |
| 7 | Stat pickups | `js/modules/world/stat-pickup.js:162` | <0.05 ms | Atlas slot per kind (HP/tough/trinket) with body + icon baked; rarity halo via SDF ring with per-instance color | **1 day** |
| 8 | Gold sparkles | `game-engine.js:1870` (`_drawGoldSparklesCanvas2D`) | <0.1 ms | Single-pixel `fillRect` + tiny sparkle shapes → particle renderer atlas slot, already half-set-up | **0.5 day** |
| 9 | Gold shapes (gems) | `game-engine.js:1802` (`_drawGoldShapesCanvas2D`) | <0.1 ms | Per-shape atlas slot with baked stroke + gem-color uniform; instanced quad | **1 day** |
| 10 | Health shapes (orbs) | `game-engine.js:1969` (`_drawHealthShapesCanvas2D`) | <0.05 ms | Atlas slot + per-instance pulse | **0.5 day** |
| 11 | Asteroid warp streak | `asteroid.js:188` (`drawWarpEffect`) | <0.05 ms | Already SDF-capsule-shaped — push to effect renderer | **0.5 day** (parasitic on #1) |
| 12 | Asteroid targeting reticle | `asteroid.js:787` (`drawTargetingEffect`) | <0.05 ms | SDF ring with pulse uniform | **0.5 day** |
| 13 | Deflector orbs | `weapon-effects-renderer.js:611` | <0.05 ms | SDF circle with halo (`shadowBlur=8` replaced by FG bloom) | **0.5 day** |
| 14 | Bulwark aura | `weapon-effects-renderer.js:628` | <0.05 ms | SDF filled circle with pulse uniform | **0.25 day** |
| 15 | Tractor shield | `weapon-effects-renderer.js:640` | <0.05 ms | SDF sector (arc fill from angle ± half-arc) — new shader variant | **1 day** |
| 16 | EMP pulse ring | `weapon-effects-renderer.js:655` | <0.05 ms | SDF ring with animated radius — reuse mine-glow path | **0.25 day** |
| 17 | Dash trail | `weapon-effects-renderer.js:674` | <0.05 ms | Particle-renderer push, no new code needed | **0.25 day** |
| 18 | Mine body (casing, spikes, LEDs, dashed magnetic field) | `weapon-effects-renderer.js:151` | ~0.1 ms | Atlas slot for body + per-instance angular sprite for spikes; dashed field via SDF dash pattern (new shader) | **2 days** |
| 19 | Missile body (fins, cone, LEDs) | `weapon-effects-renderer.js:~488` | <0.1 ms | Atlas slot with hot-element overlay; per-instance rotation | **1 day** |
| 20 | Enemy laser charge effect | `shapes.js:1667` (`drawLaserChargingEffect`) | <0.05 ms | SDF radial pulse + capsule beam buildup | **0.5 day** |
| 21 | Enemy sweep laser | `shapes.js:1746` (`drawSweepLaser`) | <0.1 ms | SDF capsule with animated rotation (already same shape as Lance Beam) | **0.5 day** (parasitic on existing effect renderer) |
| 22 | Enemy lightning bolt | `shapes.js:78` (`drawLightningBolt`) | <0.1 ms | Reuse `EFFECT_TYPE_LIGHTNING` path that already serves Lightning Arc | **0.25 day** |
| 23 | Enemy health bars | `shapes.js:1556` (`drawHealthBar`) | <0.05 ms | Two SDF rects (background + fill) per enemy with HP-ratio uniform | **0.5 day** |
| 24 | Laser-pointer aim line + reticles | `js/modules/hud/cursor.js:509` (`drawLaserPointerAim`) | ~0.1 ms | SDF capsule + SDF ring instances | **1 day** |
| 25 | Default crosshair + jitter circle + targeting cursor | `cursor.js:12,29,110` | <0.05 ms | Composite SDF primitives (rings + line segments) | **1 day** |
| 26 | Game field boundaries | `game-engine.js:3546` (`drawGameFieldBoundaries`) | trivial | SDF outlined rect | **0.25 day** |
| 27 | Off-screen entity indicators | `js/modules/hud/navigation.js` (`drawOffScreenIndicators`) | <0.1 ms | Atlas slot per arrow type; instanced quad with per-instance position+rotation | **1 day** |
| 28 | Pickup toast (text + frame) | `js/modules/hud/combat.js:156` | <0.05 ms | See HUD strategy below | (HUD bucket) |
| 29 | All HUD text + icons + bars (~95 fillText calls) | `js/modules/hud/{status,overlays,navigation,combat,hud-buttons,cursor}.js` (~5000 LOC) | ~0.3 ms | See "Architectural decision: HUD strategy" below | **5–7 days for Option B; 0 days for Option A** |
| **TOTAL (Options A — game world only)** | | | **~2.5–3.5 ms saved** | | **~22–29 days (~4–5.5 weeks)** |
| **TOTAL (Option B — including HUD MSDF)** | | | **~2.8–3.8 ms saved** | | **~27–36 days (~5.5–7 weeks)** |

---

## 1. Asteroids

**Files**: `js/modules/world/asteroid.js`
**Functions**: `draw()` (line 404), `drawAsteroidShape()` (line 705),
`drawWarpEffect()` (line 188), `drawTargetingEffect()` (line 787)

### What's actually being drawn
Each asteroid is a 3D-projected wireframe — vertices live on a sphere
mesh that gets projected with `this.fov` and depth per frame. The
renderer:

1. **Black underlayer stroke pass** at `lineWidth=4.5`, `lineCap=round`,
   one beginPath/stroke covering every edge.
2. **Depth-bucketed color pass** — every edge is bucketed by its average
   depth into 5 buckets, each bucket strokes with its own averaged HSL
   color, depth-derived alpha (`0.2..1.0`), and `lineWidth=2`.
3. **Damage wavefront** (`asteroid.js:497`) — when `_hitFlashTimer > 0`,
   a Gaussian wave radiates outward from `_hitPoint`, lighting each edge
   as the wavefront passes. Uses `globalCompositeOperation = 'lighter'`.
4. **Death flash** — radial gradient glow + white silhouette fill of the
   projected polygon.
5. **Warp streak** (`drawWarpEffect`) — gradient-filled streak quad +
   radial halo.
6. **Targeting reticle** (`drawTargetingEffect`) — multi-ring pulsing
   indicator.

### Suggested approach
- **Per-edge SDF capsules** instanced into the effect renderer. Each
  asteroid's `edges` array becomes a per-frame stream of capsule
  instances. Per-instance attributes: `(x1,y1,x2,y2)`, `depth`, `hue`,
  `alpha`. The black underlayer pass becomes a wider capsule with a
  fixed black color and slightly larger core — push BEFORE the colored
  edges so the fragment shader's overdraw order is correct.
- **Depth-aware fragment shader** — derive alpha and stroke width from
  the per-instance depth attribute exactly as the Canvas2D bucketing
  does today; the GPU doesn't actually need buckets, every edge can
  carry its own alpha.
- **Damage wavefront** is harder: today it relies on per-edge intensity
  computed in JS using `Math.exp(-u*u)` against the impact point. Keep
  that JS computation, write the intensity into a per-instance attribute,
  and use additive blending for the white flash. Or move the wavefront
  evaluation into the fragment shader by passing `_hitPoint` and
  `_hitFlashTimer` as per-asteroid uniforms — but that means one draw
  call per damaged asteroid, which negates instancing.
- **Death flash** → reuse the `EFFECT_TYPE_NOVA` ring SDF for the glow,
  and an SDF polygon fill for the silhouette (new shader — the existing
  effect renderer only does capsules and rings).
- **Warp streak** → push as a single trapezoidal capsule (or two SDF
  triangles); reuse FG bloom for the halo automatically.

### Edge cases
- Per-frame edge count is non-trivial: each asteroid has ~30 edges, mid-
  combat wave 5 has 8–12 asteroids → 240–360 capsule instances/frame
  for asteroids alone. The effect renderer needs to confirm its
  per-frame instance budget headroom. (Bullets+effects already push
  hundreds per frame, so the buffer is probably already large enough,
  but verify — and bump if the storm-needles stress fixture pushes us
  over.)
- The depth-bucketing was originally an optimization to collapse 30 edges
  into 5 strokes. On GPU we get one instanced draw call regardless of
  edge count, so the bucketing logic just goes away — the per-edge alpha
  and color compute moves to a tight JS loop that fills the instance
  buffer.
- HSL → RGB conversion: do it CPU-side (cheap, ~30 conversions per
  asteroid per frame) and write packed RGBA to the instance buffer.
  Don't recompute HSL in the fragment shader.

### Effort: **3–4 days**
Breakdown: 1 day to extend effect renderer with polygon-fill SDF (death
flash), 1.5–2 days for the per-edge capsule streaming + per-instance
depth attribute wiring, 0.5 day for warp streak and targeting reticle,
0.5–1 day for damage-wavefront integration. Doesn't include new shader
program for polygon fill — if that's 0.5 day extra, bump to 4.5.

---

## 2. Enemies (10 types)

**Files**: `js/modules/enemy/shapes.js` (1830 LOC), `enemy/enemy.js`
**Functions**: `drawEnemyShape()` (line 317) dispatches per-type to
`drawTriangle`, `drawSquare`, `drawDiamond`, `drawHexagon`, `drawCross`,
`drawSpikedCircle`, `drawLaserTurret`, `drawMissileTurret`,
`drawPulseTurret`, `drawShieldTurret`, `drawWaspShip`,
`drawEmeraldGuardian`, `drawTitanTank`, `drawStalkerSword`,
`drawPulsatingCircle`, plus per-frame add-ons `drawLightTrail`,
`drawHealthBar`, `drawLaserChargingEffect`, `drawSweepLaser`,
`drawLightningBolt`.

### What's actually being drawn
Each enemy type is a bespoke ship design with multiple Canvas2D paths
per frame. HUNTER (drawTriangle, line 374) example:
- Main hull polygon (`fill` + `stroke`), 6 vertices, dark fill + red
  stroke
- Two swept wings (separate fill+stroke each)
- Hull spine line stroke
- Engine exhaust radial gradient (`createRadialGradient`) — pulsating
  with `0.82 + sin(t*3.8)*0.18`
- Cockpit glow ellipse fill

The richer designs (`drawWaspShip`, `drawEmeraldGuardian`,
`drawTitanTank`, `drawStalkerSword`) are 100–300 LOC each with body
panels, glowing cores, animated turrets, charge-up rings, etc.
Cumulatively this is the single biggest Canvas2D draw budget in the
game (`shapes.js` is 1830 LOC of pure rendering — the largest file by a
wide margin).

### Suggested approach
- **Per-type atlas bake**: for each of the 10 enemy types, pre-render
  the entire silhouette + decoration layers into one or more atlas slots
  at fixed angular orientations. Reuse the same atlas pattern already
  established in `webgl-particle-atlas.js` and `webgl-starfield-atlas.js`.
- **Animated decorations as separate atlas slots**: anything that pulses
  (engine glow, cockpit, charging core) becomes a second atlas slot
  drawn additively over the body slot. Per-instance pulse uniform drives
  the alpha/scale — no per-frame texture regeneration.
- **One instanced quad per enemy**, dispatch shape via per-instance
  shape ID into a switch in the fragment shader. The bullet shader at
  `js/modules/performance/webgl-bullet-renderer.js` already does this
  pattern (procedural SDF, no texture) — copy the layering convention.
- **Add-ons (health bars, light trails, sweep lasers, charging beams,
  lightning bolts)** reuse the existing effect renderer SDF capsule /
  ring / lightning paths (`EFFECT_TYPE_*` constants in
  `js/modules/performance/webgl-effect-shaders.js`). The sweep laser is
  literally the same shape as Lance Beam; the lightning bolt is the
  same shape as Lightning Arc — those are near-trivial.

### Edge cases
- **Visual fidelity floor**: hand-tuned ship designs read as
  "intentional" only because of the precise vertex placement and
  gradient stops. Atlas bakes will be approximations. Schedule a VFX
  pass after migration to retune — same review cadence the GPU plan
  §15.3 recommends for bloom.
- **Death flash white proxy** (`getWhiteProxy`, `shapes.js:319`) — the
  existing code wraps the context with a JS Proxy that intercepts all
  color assignments and forces white. For GPU, replace with a per-
  instance "tint→white" uniform + alpha = `1 - deathFlashProgress`.
- **Animated turrets** (e.g. DRIFTER laser turret rotating to track the
  player) need per-instance rotation uniforms; the atlas slot rotates,
  the body slot does not.
- **TITAN tank** has multi-stage charge buildup and explosion telegraphs
  that may want their own atlas slots; treat TITAN as the hardest case
  and budget extra.

### Effort: **5–7 days**
Breakdown: 0.5 day per simple enemy × 6 (HUNTER, DIAMOND-like
GUARDIAN-lite, WASP body, basic turret bodies) = 3 days. 1 day per
complex enemy × 3 (full GUARDIAN, full TITAN, STALKER) = 3 days.
0.5 day for health bars + 0.5 day for light trails + 0.5 day for
charging beams + 0.5 day for sweep lasers + 0.25 day for lightning
bolts. Atlas build pipeline reuse should be most of the savings; new
art will be the most of the time cost.

---

## 3. Player ship

**Files**: `js/modules/player/renderer.js` (816 LOC)
**Functions**: `draw()` (line 128), `drawRemoteShip()` (line 31),
`drawChargingEffects()` (line 519), `drawCooldownChargingEffects()`
(line 534), `drawLevelUpEffects()` (line 628), `drawCooldownTimer()`
(line 696)

### What's actually being drawn
The local ship has roughly four layered passes per frame:
1. **Engine startup shudder + dual engine plumes** with cached linear
   gradients (one per engine, quantized by thrust level for cache hit).
   `globalCompositeOperation = 'lighter'`. Bright additive plumes when
   thrusting.
2. **Black silhouette pre-pass** (line 201) — `source-over` blend,
   strokes every wing/tip/hull edge in black at `lineWidth=4` so the
   ship reads against bright nebulae.
3. **Colored hull pass** — wings, tips, hull, cockpit fillets, with
   layered fills and strokes.
4. **Charging / cooldown / level-up effects** — pulse rings, charge
   beam particles, etc.

The render is wrapped in `ctx.translate(this.x, this.y)` + `ctx.rotate
(this.angle + Math.PI / 2)`. Hit-flash and invincibility flash are
opacity modulations.

### Suggested approach
- **Bake the static hull (silhouette pre-pass + colored hull + cockpit)
  into a single atlas slot at canonical orientation** (ship pointing
  up). One instanced quad per frame, rotated by `this.angle + PI/2`,
  per-instance hit-flash/invincibility alpha uniform.
- **Engine plumes** — SDF capsules with linear-gradient falloff in the
  fragment shader. Per-engine instance: `(originX, originY, length,
  thrustLevel)`. Pulsation is a `sin(time)` term in the shader.
- **Charging glow core / level-up effects** — particle renderer pushes
  with no new code needed.
- **Cooldown timer arc** — SDF sector (same shader as #15 Tractor
  Shield, reusable).

### Edge cases
- The ship is **1 instance per frame** — performance gain is negligible.
  This is purely required for full WebGL2 mode; the GPU Rendering Plan
  §1 explicitly tagged this as "skip" for perf reasons.
- The cached gradient invalidation pattern (quantize thrust to nearest
  0.1) was a Canvas2D-specific optimization; on GPU the gradient is
  computed per-fragment, no caching needed.

### Effort: **2–3 days**
Breakdown: 1 day for atlas bake + integration, 0.5 day for engine plume
SDF, 0.5 day for charging effects migration to particle renderer, 0.5
day for level-up effects + cooldown timer SDF sector, 0.5 day buffer
for VFX retuning after the bake.

---

## 4. Remote ships (MP)

**File**: `js/modules/player/renderer.js:31` (`drawRemoteShip`)

Minimal outline-only render — no thrust, no FX. Trivial atlas reuse of
the baked player ship at lower fidelity (single outline slot).

**Effort**: **0.25 day** (parasitic on #3 — if you bake the ship
silhouette as its own atlas slot, remote ships are one extra instance
draw with that slot).

---

## 5. Enemy bullets (Canvas2D fallback shapes)

**File**: `js/modules/enemy/enemy-bullet.js:630` (`draw()`)

Most enemy bullets already go through `bulletRenderer.pushBullet()`. The
fall-through cases that stay Canvas2D (per the code comment at lines
638–649):
- Mines (spinning spikes)
- Missile bodies (BOMB overlay)
- Crescents
- Explosive variant (spinning-spikes path)

Plus the trail (`drawTrail`) is Canvas2D-additive line strips.

### Suggested approach
- **Mines + missile + crescent + explosive** → atlas slots with per-
  instance rotation uniform, OR procedural SDF in the existing bullet
  shader (extend the shape switch with new shape IDs). Procedural SDF
  is cleaner; atlas is faster to author.
- **Trails** → push capsule instances to the effect renderer (matches
  what `line-debris.js` already does after Phase 3).

### Effort: **2 days**
Breakdown: 1 day for the 4 fall-through shapes (SDF or atlas), 1 day
for the trail migration + per-shape edge cases (BOMB overlay text,
explosive countdown flash).

---

## 6. Powerups

**File**: `js/modules/world/powerup.js:844` (`draw()`)

Each powerup is a cached-gradient body (outer aura + body fill via
`getPowerupGradients`) plus per-type symbol (diamond, star, etc.), with
rotation, pulse, fade-blink near expiry, and a glow sprite from
`glowSpriteCache`.

### Suggested approach
- **One atlas slot per powerup type**, body + symbol baked together
  with the cached gradient.
- **Outer aura** → SDF ring with per-instance color uniform driving the
  glow color per type.
- **Pulse + rotation + blink** → per-instance uniforms.
- **Glow sprite cache** is already a sprite; convert to an atlas slot
  drawn additively over the body.

### Effort: **1.5 days**
Breakdown: 0.5 day for atlas bake (11 powerup types × symbol +
gradient), 0.5 day for outer aura SDF ring, 0.5 day for pulse/rotation/
blink integration + fade timing parity.

---

## 7. Stat pickups

**File**: `js/modules/world/stat-pickup.js:162` (`draw()`)

Rounded square body (color per slot kind: HP/tough/trinket), white icon
overlay (heart / plus / ring), rarity halo via outer radial gradient
with per-pickup `rarityColor`, pulse via `_pulsePhase`.

### Suggested approach
- **Atlas slot per kind** (3 slots: HP / tough / trinket) with body +
  icon baked.
- **Rarity halo** → SDF ring with per-instance RGBA uniform from
  `rarityColor`.
- **Per-instance pulse** uniform drives halo scale.

### Effort: **1 day**

---

## 8. Gold sparkles

**File**: `game-engine.js:1870` (`_drawGoldSparklesCanvas2D`)

Tiny pieces drawn as `fillRect` 1×1 / 2×2 pixels or small circle arcs,
with variety. Conceptually identical to particle rendering — just hasn't
moved yet.

### Suggested approach
- Migrate into the particle renderer atlas (add a "gold sparkle" atlas
  slot) and push via `particleRenderer.push` directly from the gold-
  coin pool.

### Effort: **0.5 day**

---

## 9. Gold shapes (gems)

**File**: `game-engine.js:1802` (`_drawGoldShapesCanvas2D`)

Per-shape jewel colors with thick black stroke. Multi-shape (diamond /
hexagon / etc.).

### Suggested approach
- Atlas slot per gem shape with baked black stroke + interior color
  uniform.
- Instanced quad with per-instance rotation, color, shape ID.

### Effort: **1 day**

---

## 10. Health shapes (orbs)

**File**: `game-engine.js:1969` (`_drawHealthShapesCanvas2D`)

Similar to #9 but with health-orb visuals.

### Effort: **0.5 day**

---

## 11. Asteroid warp streak

**File**: `asteroid.js:188` (`drawWarpEffect`)

Trapezoidal streak (forward gradient) + radial halo. Already capsule-
shaped — pushes cleanly to the effect renderer.

### Effort: **0.5 day** (parasitic on #1)

---

## 12. Asteroid targeting reticle

**File**: `asteroid.js:787` (`drawTargetingEffect`)

Pulsing concentric ring system.

### Suggested approach
- SDF ring instances with per-instance radius + pulse offset.

### Effort: **0.5 day**

---

## 13. Deflector orbs

**File**: `weapon-effects-renderer.js:611`

Today still uses `shadowBlur = 8`. SDF circle with halo, foreground
bloom replaces the shadowBlur entirely.

### Effort: **0.5 day**

---

## 14. Bulwark aura

**File**: `weapon-effects-renderer.js:628`

Filled circle at `r=35` with `0.3 + 0.15*sin(...)` alpha pulse.

### Suggested approach
- Single SDF filled circle instance per active Bulwark with pulse
  uniform.

### Effort: **0.25 day**

---

## 15. Tractor shield

**File**: `weapon-effects-renderer.js:640`

Filled sector (arc fan from ship outward, spanning `shieldArc` radians).

### Suggested approach
- **New shader variant: SDF filled sector**. Per-instance:
  `(originX, originY, radius, angleCenter, angleHalfArc, color)`. The
  fragment shader rejects fragments outside the arc range and outside
  the radius — straightforward SDF math.
- This is the most significant new shader work in the entire migration;
  no existing pass renders a filled sector.

### Effort: **1 day**

---

## 16. EMP pulse ring

**File**: `weapon-effects-renderer.js:655`

Single-frame expanding ring at `radius * progress` with fading stroke.

### Suggested approach
- SDF ring with animated radius — same shape as `EFFECT_TYPE_MINE_GLOW`,
  just driven by EMP's `progress` instead of mine's lifetime.

### Effort: **0.25 day**

---

## 17. Dash trail

**File**: `weapon-effects-renderer.js:674`

Single circle at player position with violet alpha.

### Suggested approach
- Just push to the particle renderer each frame the dash is active. No
  new code needed.

### Effort: **0.25 day**

---

## 18. Mine body (spikes, casing, LEDs, dashed magnetic field)

**File**: `weapon-effects-renderer.js:151`

Per the existing comment (lines 147–149), the solid mine body stays on
Canvas2D because "those shapes have per-pixel detail that doesn't map
cleanly to the SDF capsule/ring shaders."

### Suggested approach
- **Atlas slot for the mine body** (casing + 4 spikes + LED ring +
  blink dot center) at canonical orientation, with the blink dot as a
  second additive atlas slot for the LED pulse.
- **Dashed magnetic-field ring** is the genuine hard case — Canvas2D's
  `setLineDash([6, 8])` is a built-in primitive that GPU doesn't have.
  Implement as a new SDF shader: ring with `fract(angle * dashFreq) <
  dashDuty` as the alpha mask. Animate `lineDashOffset` as a uniform.

### Effort: **2 days**
Breakdown: 1 day for atlas bake + per-instance arm/blink integration,
1 day for the dashed ring shader.

---

## 19. Missile body (fins, cone, LEDs)

**File**: `weapon-effects-renderer.js:~488`

Solid silhouette with fins + nose cone + glowing LED indicators.

### Suggested approach
- Atlas slot for body, per-instance rotation. LED pulse via second
  additive atlas slot.

### Effort: **1 day**

---

## 20. Enemy laser charging effect

**File**: `shapes.js:1667` (`drawLaserChargingEffect`)

Build-up halo before laser fires.

### Suggested approach
- SDF radial pulse — push one SDF circle instance with growing radius
  + per-instance brightness uniform.

### Effort: **0.5 day**

---

## 21. Enemy sweep laser

**File**: `shapes.js:1746` (`drawSweepLaser`)

Same shape as Lance Beam — capsule from enemy turret to sweep target.

### Suggested approach
- Push `EFFECT_TYPE_BEAM` capsule instances; rotation animates by
  enemy's sweep state.

### Effort: **0.5 day** (parasitic on existing beam shader)

---

## 22. Enemy lightning bolt

**File**: `shapes.js:78` (`drawLightningBolt`)

Same shape as Lightning Arc — chained capsule segments.

### Suggested approach
- Reuse `EFFECT_TYPE_LIGHTNING` capsules. The JS path-generation
  (mainPath + branches) is already independent of the draw target.

### Effort: **0.25 day**

---

## 23. Enemy health bars

**File**: `shapes.js:1556` (`drawHealthBar`)

Per-enemy 2-rect display (background + filled foreground).

### Suggested approach
- Two SDF rect instances per enemy (or one rect with a "fill ratio"
  uniform driving a step in the fragment shader).

### Effort: **0.5 day**

---

## 24. Laser-pointer aim line + entity hit reticles

**File**: `js/modules/hud/cursor.js:509` (`drawLaserPointerAim`)

Faint line from muzzle to bullet max range + tick at end + reticles
around hit entities.

### Suggested approach
- SDF capsule for the trace line, SDF ring instances for the reticles.
- HUD-adjacent — see Architectural decision below.

### Effort: **1 day**

---

## 25. Default crosshair / jitter circle / targeting cursor

**Files**: `cursor.js:12,29,110` (`drawCustomCursor`,
`drawDefaultCrosshair`, `drawJitterCircle`, `drawRedTargetingCursor`)

Cyan crosshair (3 line segments + circle), red targeting variant,
jitter circle for bullet spread visualization.

### Suggested approach
- Composite SDF primitives (rings + line capsules).

### Effort: **1 day**

---

## 26. Game field boundaries

**File**: `game-engine.js:3546` (`drawGameFieldBoundaries`)

Simple stroked rect at game-field edge.

### Suggested approach
- SDF outlined rect (4 capsules or one rect SDF with stroke width).

### Effort: **0.25 day**

---

## 27. Off-screen entity indicators

**File**: `js/modules/hud/navigation.js` (`drawOffScreenIndicators`)

Arrows pointing toward off-screen entities (asteroids/enemies/items).

### Suggested approach
- Atlas slot per arrow type (one per icon kind), instanced quad with
  per-instance rotation + position.

### Effort: **1 day**

---

## 28. Pickup toast

**File**: `js/modules/hud/combat.js:156` (`drawPickupToast`)

Text + frame for collected-item announcements.

Folded into the HUD strategy below.

---

## 29. HUD text + icons + bars

**Files**: `js/modules/hud/{status,overlays,navigation,combat,
hud-buttons,cursor}.js` (~5000 LOC combined). Roughly 95 distinct
`fillText` / `strokeText` calls across these files — versus 21 across
all world+enemy+player+combat code.

Includes: title screen, game-over screen, wave intro overlay, game-
complete screen, survival timer, combo counter, streak indicator, level
+ coins display, bottom-right gold readout, triforce/tank display,
powerup display, spawn timer, status bars (health/energy/critical/
skill), wave/tier badge, pickup toasts, pause button.

See "Architectural decision" below.

---

## Architectural decision: HUD strategy

Canvas2D is genuinely the right tool for crisp screen-space text. Two
options for `?renderer=webgl2`:

### Option A: World on WebGL2, HUD on Canvas2D ("mixed-mode webgl2")

- All 28 world-layer migrations above land. Item #29 (HUD) **stays on
  Canvas2D**.
- The `renderMode === 'webgl2'` flag only skips world-Canvas2D passes
  (asteroids, enemies, ship, drops, weapon-effect remainders, world-
  space cursor/aim). The HUD passes run as today.
- **Effort**: ~22–29 days (the table total without HUD).
- **Pro**: Production-realistic. The 95 HUD text calls are 0.3 ms/frame
  and Canvas2D's text rendering is genuinely better than any MSDF font
  implementation we'd reasonably ship.
- **Con**: technically still has a Canvas2D path. The label
  `RENDER_MODE_WEBGL2 = 'WebGL2 (full GPU)'` in `render-mode.js:97` is
  misleading.
- **Suggested clarification**: rename the label to `'WebGL2 (world) +
  Canvas2D (HUD)'` or add a new mode `RENDER_MODE_WEBGL2_FULL` for
  Option B and let `RENDER_MODE_WEBGL2` mean Option A.

### Option B: MSDF bitmap font, full Canvas2D elimination

- Add a **multi-channel signed distance field (MSDF) atlas** for the
  game's bitmap font + symbol set. Use a tool like `msdf-bmfont-xml`
  to bake the atlas + JSON glyph metrics at build time. Author a new
  text renderer that emits one instanced quad per glyph.
- Reimplement every `fillText` / `strokeText` call in the HUD via the
  text renderer. Some calls compose with `measureText` (`combat.js:195,
  197`) — replace with metric lookups in the MSDF JSON.
- **Effort**: +5–7 days on top of Option A.
- **Pro**: True zero-Canvas2D mode. Compelling for the demo URL.
- **Con**: MSDF text reads slightly different from Canvas2D
  `fillText` — kerning, hinting, edge antialiasing. The title screen
  + game-over screen have hand-tuned wavy text effects (`drawWavyText`
  in `overlays.js:58`) that need re-implementing in the shader (per-
  glyph wave offset uniform). Survival timer + combo counter are
  load-bearing readable UI under stress — visual regression risk.
- **Hidden cost**: any future HUD layout iteration needs the MSDF
  re-bake step.

### Recommendation

**Option A unless the user explicitly wants "no Canvas2D anywhere."**

The performance gain from migrating HUD is ~0.3 ms — meaningful but not
transformative. The risk of MSDF visual regression in the title /
game-over / wave-intro overlays is real, and those screens are the
first things every player sees.

If shipping Option A: update `modeLabel(RENDER_MODE_WEBGL2)` in
`js/modules/renderer/render-mode.js:97` to `'WebGL2 (world) + Canvas2D
HUD'` so the perf-overlay and debug paths don't mislead.

---

## Phase plan

Suggested sequence (each is a separate PR / version bump per `CLAUDE.md`
versioning rules):

### Phase 0 — Wire the render-mode flag (0.5 day)
- `game-engine.js` imports `getRenderModeFromURL` from
  `js/modules/renderer/render-mode.js`
- Wraps each Canvas2D world pass (the 28 items above) in
  `if (this.renderMode !== RENDER_MODE_WEBGL2) { ... }`
- When `?renderer=webgl2`, the game runs with WebGL layers only — the
  starfield, bloom, GPU effects, bullets, particles render normally;
  the world-Canvas2D passes are no-ops (visible gaps).
- This is the gate that makes the rest of the work meaningfully testable.

### Phase 1 — Drops, gold, simple primitives (~3.5 days)
Items #8, #9, #10, #11, #12, #16, #17 — small visual surface, low risk,
warms up the atlas-bake pipeline.

### Phase 2 — Asteroids (~3–4 days)
Item #1. Most common gameplay layer. Largest single user-visible win.

### Phase 3 — Enemies (~5–7 days)
Items #2, #23 (health bars). High gameplay impact, biggest LOC delta.
Schedule VFX review at the end.

### Phase 4 — Player ship + remote ships (~2.25 days)
Items #3, #4.

### Phase 5 — Remaining weapon effects (~5 days)
Items #5, #6, #7, #13, #14, #15, #18, #19, #20, #21, #22. The Tractor
Shield SDF sector shader (#15) and the dashed magnetic-field shader
(#18) are the only meaningfully new shader work.

### Phase 6 — Cursor / aim / boundaries / nav (~3.25 days)
Items #24, #25, #26, #27.

### Phase 7 (only for Option B) — HUD MSDF (~5–7 days)
Item #29 + #28.

Each phase lands as its own MINOR version bump (Option A = MINOR each;
final "full WebGL2 mode complete" = MAJOR). Per `CLAUDE.md` granularity
rule: don't lump these into one mega-PR.

---

## Open questions

1. **Option A vs Option B**: confirm the HUD strategy before Phase 7
   starts. If Option A, schedule the `modeLabel` rename to land in
   Phase 0.
2. **Atlas budget**: the existing particle / starfield / bullet atlases
   are sized for their current content. Adding ~30 new atlas slots
   (10 enemies × 1–2 slots each + 11 powerups + 3 stat-pickups + 4
   weapon-effect bodies + 1 player ship + arrow types) probably needs a
   new dedicated "entity atlas" rather than expanding any existing one.
   Confirm before starting Phase 1 — splits the bake pipeline two ways.
3. **Per-frame instance budget**: 8–12 asteroids × 30 edges + 100s of
   bullets + 100s of particles is well within typical instance buffer
   sizes, but the storm-needles stress fixture (SHIFT+P) should be
   re-measured with PerfMeasure after Phase 2 ships. If instance count
   spikes drop frames, sub-batch by atlas slot.
4. **VFX retune budget**: schedule one VFX review session after Phase 2
   (asteroids) and Phase 3 (enemies). Atlas bakes will not pixel-match;
   the question is whether the approximation reads as "intentional" in
   motion. Budget 1–2 days of artist time per review session — not
   counted in engineering effort above.
5. **Nebula completeness**: per the GPU plan §1, the nebula was already
   on WebGL via the cloud atlas slot (`game-engine.js:1226–1236`). Audit
   pass during Phase 0 to confirm no fall-through Canvas2D paths exist
   for nebula clouds — current grep suggests it's already fully on
   WebGL, but the GPU plan summary table listed nebula as a residual
   item, so reconcile.

---

*End of roadmap.*
