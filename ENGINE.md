# Rainboids Engine Documentation

> Comprehensive technical documentation of the Rainboids game engine architecture, main loop, rendering pipeline, and all game objects.
>
> Generated 2026-04-25 against version 5.25.2. Audio section last reviewed 2026-04-27 against version 5.35.0.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Boot & Initialization](#2-boot--initialization)
3. [State Machine](#3-state-machine)
4. [Main Game Loop](#4-main-game-loop)
5. [Update Pipeline](#5-update-pipeline)
6. [Rendering Pipeline](#6-rendering-pipeline)
7. [Object Pool System](#7-object-pool-system)
8. [Game Objects Reference](#8-game-objects-reference)
9. [Subsystems](#9-subsystems)
10. [Module Dependency Map](#10-module-dependency-map)

---

## 1. Architecture Overview

Rainboids is a 2D top-down space shooter built on a custom HTML5 Canvas engine. The architecture follows a **delegation pattern** -- the `GameEngine` class acts as a thin facade, delegating nearly all logic to specialized module functions called via `.call(this)`:

```
GameEngine (facade)
  |-- wave-manager.js      (wave lifecycle, spawning, progression)
  |-- collision-system.js   (all collision detection and response)
  |-- combat-manager.js     (damage, debris, powerups, orbs)
  |-- camera-manager.js     (camera follow, screen shake, hitstop)
  |-- shop-manager.js       (shop UI and buy/sell logic)
  |-- lifecycle.js           (player death, respawn)
  |-- event-setup.js         (DOM event wiring)
  |-- weapon-fx.js           (weapon effect rendering)
  |-- hud/*                  (all HUD rendering modules)
```

Each module function receives the engine instance as `this`, giving it full access to all engine state (pools, player, game state, etc.) without circular imports.

### Key Design Principles

- **Fixed-timestep accumulator**: Logic runs at a locked 60 Hz regardless of display refresh rate
- **Object pooling**: All entities are pre-allocated and recycled -- zero per-frame GC pressure
- **Viewport culling**: Off-screen entities skip rendering entirely
- **Selective hitstop**: During impact freeze, particles and the player keep updating while enemies/bullets freeze
- **Event bus**: Decoupled pub/sub for audio and UI events

### Coordinate System

- **World space**: Fixed 1920x1080 logical game field. All entity positions are in world coordinates.
- **Screen space**: Canvas dimensions match the browser viewport. The camera translates world-to-screen.
- **HUD space**: Rendered after the camera transform is restored, so HUD elements are always screen-relative.

---

## 2. Boot & Initialization

### Entry Point: `js/main.js`

The browser loads `index.html`, which includes `js/main.js` as a module. A `RainboidsGame` class orchestrates the full boot sequence:

```
1. DOM ready
2. Load assets (images, audio samples) via AssetLoader
3. Setup canvas (full viewport)
4. Initialize AudioManager (fetch /sfx/manifest.json, decode 26 WAVs)
5. Create InputHandler, UIManager
6. Create GameEngine (all dependencies injected)
7. Register start handlers (keydown, click, touchstart)
8. Wait for first user interaction...
```

On first user interaction:
```
9. Initialize audio context (browser autoplay policy)
10. Call gameEngine.init() -- resets all state for a new game
11. Call gameEngine.start() -- begins the rAF loop
```

### GameEngine Constructor (`game-engine.js`, lines 44-327)

The constructor sets up:

| Step | What | Details |
|------|------|---------|
| Canvas | 2D context, dimensions | Matches window size |
| State machine | `GameStateMachine` | Initial state: `TITLE_SCREEN` |
| Event bus | `EventBus` | Pub/sub for audio and UI events |
| Event wiring | Audio + UI listeners | `audio:hit`, `ui:show-message`, etc. |
| Game state | `this.game` object | Money, wave, lives, shake, timers |
| Camera | `this.camera` | Position, smoothing (0.1) |
| Game field | `this.gameField` | 1920x1080 logical resolution |
| Player | `new Player()` | Positioned at field center |
| Pools | 9 `PoolManager` instances | Pre-allocated entity pools |
| Spatial grid | `SpatialGrid` | 8x6 cells for collision broad-phase |
| Timing | Accumulator + tick rate | 16.67ms tick (60 Hz), max 4 steps/frame |

### GameEngine.init() (lines 331-408)

Called to start or restart a game. Resets everything:

1. Cancel and clear all game timers
2. Reset game state (money=0, lives=3, wave=1)
3. Create fresh Player at field center
4. Set initial health/shields (health=full, shields=25, shieldTanks=1)
5. Clear all entity pools (release all active objects)
6. Generate starfield (color stars + background stars)
7. Generate nebula background (pre-rendered to offscreen canvas)
8. Transition to `WAVE_TRANSITION`, show "WAVE 1" message
9. Schedule entity spawn after 2s delay via `GameTimer`

---

## 3. State Machine

### States

```
TITLE_SCREEN      -- Initial boot screen, waiting for user input
PLAYING           -- Active gameplay, all systems running
WAVE_TRANSITION   -- Between waves, countdown to next spawn
PAUSED            -- Game frozen, pause menu shown
SHOP              -- Shop UI active, gameplay frozen
GAME_OVER         -- Player dead, showing game over overlay
ORIENTATION_LOCK  -- Mobile-only, wrong device orientation
```

### Transitions

```
TITLE_SCREEN ──[user input]──> PLAYING
PLAYING ──[all enemies dead]──> WAVE_TRANSITION
WAVE_TRANSITION ──[2s countdown]──> PLAYING (spawn next wave)
PLAYING ──[ESC / pause tap]──> PAUSED
PAUSED ──[resume]──> PLAYING
PLAYING / PAUSED ──[shop button]──> SHOP
SHOP ──[close]──> PAUSED
PLAYING ──[player dies, 0 lives]──> GAME_OVER
GAME_OVER ──[restart]──> PLAYING (via init())
```

State access is proxied through a getter/setter on `this.game.state` that delegates to `GameStateMachine.transition()`, so all reads and writes go through validation.

### Game Timers (`core/game-timer.js`)

Frame-counted timers that naturally freeze during PAUSED/SHOP because `tick()` is only called inside `update()` during PLAYING/WAVE_TRANSITION:

```javascript
class GameTimer {
    constructor(durationMs, callback)
    tick(dt)        // Advance by dt ms, fire callback when elapsed
    cancel()        // Prevent callback from firing
    reset(duration) // Restart with new duration

    // Read-only:
    done: boolean       // Has completed
    active: boolean     // Not cancelled
    remaining: number   // Ms left
    progress: number    // 0-1 fraction complete
}
```

---

## 4. Main Game Loop

### `gameLoop()` (game-engine.js, lines 895-1079)

Called every frame via `requestAnimationFrame`. The loop has three major paths:

```
gameLoop()
  |
  |-- frameClock.tick()              // Global frame counter
  |-- frameStart = performance.now()
  |
  |-- [HITSTOP PATH] if _hitstopFrames > 0
  |     |-- Decrement hitstop counter
  |     |-- Update particles + line debris (VFX keep playing)
  |     |-- Update player movement (movement is survival)
  |     |-- Update damage numbers + money pickups
  |     |-- Render full frame
  |     |-- return (skip normal update)
  |
  |-- [CAMERA KICK DECAY]
  |     |-- Exponential decay (x0.7/frame, snap at <0.3)
  |
  |-- [FIXED-TIMESTEP ACCUMULATOR]
  |     |-- dt = min(frameStart - lastFrameTime, 100ms)
  |     |-- logicAccumulator += dt
  |     |-- while accumulator >= 16.67ms AND steps < 4:
  |     |     |-- update()    // One 60Hz logic tick
  |     |     |-- accumulator -= 16.67ms
  |     |-- if steps >= 4: accumulator = 0 (spiral-of-death guard)
  |
  |-- [SCREEN SHAKE]
  |     |-- Multi-frequency sine + random jitter (Vlambeer-style)
  |     |-- Magnitude decays over duration
  |
  |-- [RENDER]
  |     |-- draw()                  // All world entities
  |     |-- drawHUD()               // UI overlay
  |     |-- drawMoneyPickupDisplay()
  |     |-- drawDamageNumbers()
  |     |-- Screen flash overlay (white tint on kills)
  |     |-- Death overlay (dark tint)
  |     |-- Custom cursor (topmost)
  |
  |-- recordVFXFrame()              // Telemetry (if enabled)
  |-- requestAnimationFrame(gameLoop)
```

### Hitstop (Selective Freeze)

When `_hitstopFrames > 0`, the game enters a selective freeze:

| System | During Hitstop | Rationale |
|--------|---------------|-----------|
| Enemies | FROZEN | Impact weight |
| Asteroids | FROZEN | Impact weight |
| Bullets | FROZEN | Impact weight |
| Enemy bullets | FROZEN | Impact weight |
| Collisions | FROZEN | No new hits during freeze |
| Wave system | FROZEN | No progression during freeze |
| **Player movement** | **ACTIVE** | Movement is survival in a shooter |
| **Particles** | **ACTIVE** | Expanding explosions during freeze sells "impact" not "lag" |
| **Line debris** | **ACTIVE** | Same as particles |
| **Damage numbers** | **ACTIVE** | Readable while action paused |
| **Camera** | **ACTIVE** | Follows player |

Hitstop is governed by:
- **Global budget**: Max 10 hitstop frames per second. When exhausted, hits still get flash/sound but no freeze.
- **Cooldown**: Light hits (<4 frames) rate-limited to once per 200ms. Kill hitstop (4+ frames) always punches through.
- **Coalescing**: Simultaneous hits use `max()`, not `sum()`. AOE hitting 5 enemies = one hitstop, not five.

### Fixed-Timestep Accumulator

The logic/render separation ensures deterministic gameplay regardless of frame rate:

- **Monitor at 60 Hz**
  1 update per frame — 16.67 ms accumulated, 16.67 ms consumed.
- **Monitor at 120 Hz**
  1 update every other frame — 8.33 ms accumulated, needs 2 frames to reach 16.67 ms.
- **Monitor at 30 Hz**
  2 updates per frame — 33.33 ms accumulated, consumed in 2 ticks.

**Spiral-of-death guard**: if 4 updates can't keep up, accumulated time is dropped. This prevents lag spikes from cascading into multi-second freezes.

---

## 5. Update Pipeline

### `update()` (game-engine.js, lines 612-752)

Called once per 60 Hz logic tick. Behavior depends on game state:

#### PLAYING / WAVE_TRANSITION

```
1.  Tick game timers (GameTimer instances)
2.  Update survival timer
3.  Get input state from InputHandler
4.  Mobile auto-aim (point at nearest enemy)
5.  Player.update() -- movement, firing, skill cooldowns, weapon effects
6.  updateCamera() -- smooth follow player position
7.  updateMoneyPickupDisplay()
8.  updateDamageNumbers()
9.  updateHoverDetection() -- cursor-over-entity checks
10. updateKillStreak() -- streak timer decay
11. Update all player bullets (movement, homing, lifetime)
12. Update particles (movement, lifetime, fade)
13. Update line debris (movement, rotation, lifetime)
14. Update powerups (float animation, lifetime)
15. Update asteroids (movement, 3D rotation, bounds wrapping)
16. Update enemies (AI, movement, firing, death flash countdown)
17. Update enemy bullets (movement patterns, lifetime)
18. Update color stars (parallax, tractor beam attraction)
19. Update background stars (parallax twinkle)
20. handleCollisions() -- all collision detection and response
21. Update powerup display fade
22. Periodic pool cleanup (every 30s)
23. updateWaveSystem() -- check wave completion, spawn next
24. Update score display
```

#### PAUSED / GAME_OVER

- Only particles and line debris update (visual continuity)
- Background stars twinkle but don't drift (zero velocity passed)

#### SHOP

- Background stars update for ambiance only
- All gameplay entities frozen

---

## 6. Rendering Pipeline

### `draw()` (game-engine.js, lines 754-834)

Renders all world-space entities with camera transform and viewport culling:

```
1.  Clear canvas (black fill)
2.  Save canvas state
3.  Apply camera translation (-camera.x, -camera.y)
4.  Draw nebula layers (pre-rendered, parallax)
5.  Batch background stars by depth (DepthBatchRenderer)
6.  Draw complex stars individually (sparkle/burst effects)
7.  Viewport-cull and draw entities:
      |-- Line debris
      |-- Particles
      |-- Powerups
      |-- Asteroids
      |-- Enemies
      |-- Enemy bullets
      |-- Player bullets
      |-- Player
8.  Draw weapon effects (lance beam, mines, nova rings, lightning, missiles)
9.  Draw game field boundary (dashed outline)
10. Restore canvas state (removes camera transform)
```

### HUD Rendering (after camera restore)

11. **`drawHUD()`**
    Health bar, shield bar, lives, level, XP, coins, wave messages, skill cooldowns.
12. **`drawMoneyPickupDisplay()`**
    Floating "+50 coins" text.
13. **`drawDamageNumbers()`**
    Floating damage text (world-to-screen transformed).
14. **`drawPowerupDisplay()`**
    "RAPID FIRE x3" banner.
15. **`drawPowerupIndicators()`**
    Active powerup icons with timers.
16. **`drawOffScreenIndicators()`**
    Arrows pointing to off-screen enemies.
17. **`drawMinimap()`**
    Corner minimap showing all entities.
18. **`drawJitterCircle()`**
    Bullet spread preview around cursor.
19. **Screen flash overlay** — white tint, decays per frame.
20. **Death overlay** — dark tint after player death.
21. **Custom cursor** — topmost layer.

### Viewport Culling

Entities outside the visible area skip rendering entirely:

```javascript
const pad = 120; // Generous padding for glow/particles
const vL = camera.x - pad;
const vT = camera.y - pad;
const vR = camera.x + width + pad;
const vB = camera.y + height + pad;

pool.drawActiveVisible(ctx, vL, vT, vR, vB);
```

---

## 7. Object Pool System

### PoolManager (`core/pool-manager.js`)

Generic object pool that pre-allocates entities and recycles them to avoid GC pressure:

```javascript
class PoolManager {
    constructor(ObjectClass, initialSize)

    get(...args)            // Acquire object from pool (or create new if exhausted)
    release(obj)            // Return object to pool (O(1) swap-and-pop)
    updateActive(extra)     // Call update() on all active objects
    drawActive(ctx, extra)  // Call draw() on all active objects
    drawActiveVisible(ctx, vL, vT, vR, vB)  // Draw with viewport culling
    cleanupInactive()       // Release all objects where active === false
    getStats()              // { active, pooled, total }

    activeObjects: []       // Currently in-use objects
    pool: []                // Available recycled objects
}
```

**Release strategy**: O(1) swap-and-pop using `_poolIndex` tracking. When an object is released, the last active object swaps into its slot, keeping the active array contiguous.

**Particle cap**: The particle pool enforces `MAX_PARTICLES` (50). When the cap is reached, `get()` returns `null` and the caller skips the particle.

### Pool Inventory

| Pool Name | Entity Class | Init Size | Max | File |
|-----------|-------------|-----------|-----|------|
| `bulletPool` | Bullet | 10 | Unlimited | `player/bullet.js` |
| `particlePool` | Particle | 50 | 50 (capped) | `world/particle.js` |
| `lineDebrisPool` | LineDebris | 20 | Unlimited | `world/line-debris.js` |
| `asteroidPool` | Asteroid | 5 | Unlimited | `world/asteroid.js` |
| `enemyPool` | Enemy | 5 | Unlimited | `enemy/enemy.js` |
| `enemyBulletPool` | EnemyBullet | 20 | Unlimited | `enemy/enemy-bullet.js` |
| `colorStarPool` | ColorStar | 35 | Unlimited | `world/color-star.js` |
| `backgroundStarPool` | BackgroundStar | 120 | Unlimited | `world/background-star.js` |
| `powerupPool` | Powerup | 5 | Unlimited | `world/powerup.js` |

"Unlimited" pools grow on demand -- if `get()` finds the pool empty, it creates a new instance. In practice, pools rarely exceed 2-3x their initial size.

---

## 8. Game Objects Reference

### Player

**Class**: `Player`
**File**: `js/modules/player/player.js`
**Pool**: None (single persistent instance)
**Related files**: `player/renderer.js`, `player/weapons.js`, `player/skills.js`, `player/progression.js`, `player/lifecycle.js`

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}`, `angle`, `rotation` | World coordinates |
| Physics | `thrustPower`, `mass`, `radius` | Thrust-and-drift movement model |
| Health | `health`, `maxHealth`, `shield`, `shieldTanks` | Shield absorbs damage first |
| Weapons | `activePrimary`, `activePower`, `ownedPrimaries` (Set), `ownedPowers` (Set) | Hot-swappable |
| Firing | `autoFireTimer`, `baseFireRate`, `lastShotTime`, `isCharging`, `chargeLevel` | Auto-fire while mouse held |
| Skills | `skillSlots[4]`, `skillCooldowns[4]`, `activeSkillEffects` (Map), `ownedSkills` (Set) | Number keys 1-4 |
| Progression | `level`, `experience`, `experienceToNextLevel`, `skillPoints`, `powerups` (Map) | XP-based leveling |
| Visual state | `_hitFlashTimer`, `_muzzleFlashTimer`, `invincible` | Flash on damage/fire |
| Weapon effects | `beamActive`, `activeMines[]`, `novaRings[]`, `lightningChains[]`, `activeMissiles[]`, `deflectorOrbs[]` | Active weapon FX |
| Movement abilities | `isDashing`, `dashTimer`, `dashVelX`, `dashVelY` | Phase Dash skill |

**Used in**: `game-engine.js` (update/draw), `collision-system.js` (all player collision checks), `wave-manager.js` (health restore between waves), `shop-manager.js` (buy/sell), `input-handler.js` (aim target)

---

### Bullet (Player Projectile)

**Class**: `Bullet`
**File**: `js/modules/player/bullet.js`
**Pool**: `bulletPool` (init: 10)

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}`, `angle` | Travels in straight line or homes |
| Physics | `radius`, `baseRadius`, `mass` | Size scales with upgrades |
| Lifetime | `life`, `maxLife`, `rangeMultiplier`, `fadeFactor` | Fades near end of life |
| Trail | `trail[16]` (ring buffer), `trailHead`, `trailCount` | Rendered as fading tail |
| Damage | `damage`, `isCrit`, `isCritical` | Crit determined at spawn |
| Upgrades | `homing`, `homingStrength`, `piercing`, `piercedEnemies`, `explosive`, `explosionRadius` | From powerup system |
| Tracking | `hitTargets` (Set) | Prevents double-hitting with piercing |

**Methods**: `reset()`, `update()`, `applyHoming()`, `explode()`, `onHit()`, `hasHitEnemy()`, `draw()`

**Used in**: `collision-system.js` (bullet-asteroid, bullet-enemy checks), `game-engine.js` (update/draw loop), `player/weapons.js` (spawning)

---

### Enemy

**Class**: `Enemy`
**File**: `js/modules/enemy/enemy.js`
**Pool**: `enemyPool` (init: 5)
**Related files**: `enemy/shapes.js` (rendering), `enemy/ai.js` (behavior), `enemy/movement.js` (20+ movement patterns), `enemy/firing.js` (bullet spawning)

**Enemy Types** (10):

| Type | Role | Color | Special |
|------|------|-------|---------|
| HUNTER | Fast pursuit fighter | Red | Swept-wing shape, burst fire |
| GUARDIAN | Slow heavy tank | Green/emerald | High HP, devastating shots |
| WASP | Agile swarm unit | Yellow | Rapid pulse fire, high drop rate |
| STALKER | Stealth ambusher | Purple | Charged laser, evasive |
| DRIFTER | Laser turret | Cyan | Beam weapon, orbital movement |
| PROWLER | Missile turret | Orange | Homing missiles |
| WEAVER | Rapid turret | Pink | Fast pulse fire |
| SENTINEL | Shield turret | Blue | Shield burst, defensive |
| TANGERINE | Spiked brawler | Orange | Slow homing shots |
| TITAN | Heavy boss-type | Dark red | Missiles, high HP, rare drops |

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}`, `faceAngle`, `rotation` | Rotates to face movement/target |
| Combat | `health`, `maxHealth`, `level`, `config`, `radius` | Stats scale with level |
| Firing | `lastShot`, `firingCooldown`, `burstState: {active, shotsRemaining, shotDelay}` | Per-type cooldowns |
| Movement | Pattern-specific: `orbitalAngle`, `dartState`, `gridDirection`, etc. | 20+ movement patterns |
| Visual | `color`, `trail: {positions[], maxLength}`, `creationTime` | Trail for motion history |
| Death | `_deathFlash`, `_deathFlashMax` | White silhouette countdown |
| Hit | `_hitFlashTimer`, `_hitPoint`, `_hitAngle` | Localized impact flash |
| AI | `targetPlayer`, `lastLOSCheck`, `cachedLOSResult` | Line-of-sight caching |

**Used in**: `collision-system.js` (bullet-enemy, player-enemy, enemy-asteroid), `wave-manager.js` (spawning, level scaling), `game-engine.js` (update/draw), `input-handler.js` (auto-aim target)

---

### EnemyBullet

**Class**: `EnemyBullet`
**File**: `js/modules/enemy/enemy-bullet.js`
**Pool**: `enemyBulletPool` (init: 20)

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}`, `startX`, `startY` | Origin tracked for range |
| Physics | `radius`, `glowRadius`, `rotation`, `rotationSpeed` | Visual spin |
| Lifetime | `life`, `maxRange`, `isPersistent`, `maxLifetimeOverride` | Some bullets persist |
| Movement | `movementPattern`, `patternTimer`, `patternPhase`, `baseVel` | 20+ patterns |
| Visual | `shape`, `color`, `damage`, `trail[]` | Shapes: circle, triangle, needle, mine, missile, hexagon |
| Homing | `targetPlayer` | For mine and homing patterns |
| Wave | `sinePhase`, `sineFreq`, `sineAmp`, `sinePerpX`, `sinePerpY` | Sine-wave bullet paths |

**Movement patterns** (20+): `aimed`, `mine`, `homing_mine`, `spread`, `rapid`, `spiral`, `burst`, `explosive`, `laser`, `laser_beam`, `missile`, `homing`, `titan_homing`, `titan_rocket`, `missile_decelerate`, `pulse`, `shield_burst`, `wave_energy`, `energy_slash`, `crescent_beam`, `sine_wave`, `missile_fast_slow`

**Used in**: `collision-system.js` (enemybullet-player), `game-engine.js` (update/draw), `enemy/firing.js` (spawning)

---

### Asteroid

**Class**: `Asteroid`
**File**: `js/modules/world/asteroid.js`
**Pool**: `asteroidPool` (init: 5)

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}` | Drifts with constant velocity |
| 3D geometry | `vertices3D[]` (12-point dodecahedron), `edges[]`, `projectedVertices[]` | True 3D wireframe projected to 2D |
| 3D rotation | `rot3D: {x, y, z}`, `rotVel3D: {x, y, z}` | Continuous tumbling |
| Physics | `radius`, `baseRadius`, `mass`, `level` | Mass proportional to radius |
| Health | `health`, `maxHealth` | Scales with size and level |
| Visual | `baseHue`, `hueSpread`, `hueCycleSpeed`, `saturation`, `lightness` | Rainbow wireframe |
| Rendering | `_bucketEdges[]`, `_bucketHue[]`, `_bucketCount[]`, `fov` (300) | Depth-bucketed edge rendering |
| Death | `_deathFlash`, `_deathFlashMax` | White silhouette on destroy |
| Hit | `_hitFlashTimer`, `_hitPoint`, `_hitAngle` | Partial-face flash (additive) |
| Optimization | `_projectionDirty` | Lazy 3D projection (only when drawn) |

**Splitting**: Large asteroids split into 3-4 smaller pieces on destruction. Small asteroids (radius <= MIN_AST_RAD + 5) are fully destroyed.

**Used in**: `collision-system.js` (bullet-asteroid, player-asteroid, asteroid-asteroid, enemy-asteroid), `wave-manager.js` (spawning), `game-engine.js` (update/draw)

---

### Particle

**Class**: `Particle`
**File**: `js/modules/world/particle.js`
**Pool**: `particlePool` (init: 50, max: 50)

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `vel: {x, y}` | World coordinates |
| Lifetime | `life`, `maxLife`, `friction` | Decays each frame |
| Visual | `color`, `hue`, `sat`, `light`, `radius`, `maxRadius`, `fadeRate`, `growthRate` | Type-dependent rendering |
| Metadata | `type`, `active`, `creationTime` | Determines draw behavior |

**Particle types** (20+): `explosion`, `playerExplosion`, `thrust`, `phantom`, `pickupPulse`, `starBlip`, `starSparkle`, `explosionPulse`, `explosionRedOrange`, `asteroidCollisionDebris`, `fieryExplosionRing`, `healthOrbGlow`, `burstAura`, `lightningSegment`, `chargingParticle`, `dashParticle`, `shieldBurstParticle`, `spawnParticle`, `explosionFlash`, `explosionShrapnel`, `explosionEmber`, `damageNumber`

**Used in**: `game-engine.js` (update/draw, continues during hitstop), `collision-system.js` (spawned on impacts/kills), `player/weapons.js` (muzzle flash, charge particles), `player/renderer.js` (thrust particles)

---

### LineDebris

**Class**: `LineDebris`
**File**: `js/modules/world/line-debris.js`
**Pool**: `lineDebrisPool` (init: 20)

| Category | Properties | Notes |
|----------|-----------|-------|
| Geometry | `p1: {x, y}`, `p2: {x, y}` | Line segment endpoints (local space) |
| Position | `x`, `y`, `vel: {x, y}` | World position of line center |
| Rotation | `rot`, `rotVel` | Spinning debris |
| Lifetime | `life` | Fades and dies |
| Visual | `color`, `useFixedColor`, `fixedColor`, `hue`, `hueShift` | Rainbow or fixed color |

**Used in**: `collision-system.js` (created on asteroid/enemy destruction), `game-engine.js` (update/draw, continues during hitstop)

---

### ColorStar

**Class**: `ColorStar`
**File**: `js/modules/world/color-star.js`
**Pool**: `colorStarPool` (init: 35)

Dual-purpose: decorative foreground stars AND collectible orbs (health/money).

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `z` (depth) | Parallax based on depth |
| Visual | `shape`, `radius`, `isBigStar`, `rotation`, `rotationSpeed`, `opacity` | 12 shape types |
| Animation | `twinkleSpeed`, `sizeVariation`, `pulseSpeed`, `pulseOffset` | Organic pulsing |
| Collectible | `isCollectible`, `starType` ('health'/'money'), `life`, `vel: {x, y}` | Orbs only |
| Orb visual | `color`, `borderColor`, `baseRadius`, `moneySymbol` | Green (health), gold (money) |

**Shapes**: point, circle, diamond, triangle, hexagon, square, plus, x, star4, star5, star6, star8, sparkle, burst

**Used in**: `collision-system.js` (player-orb collection), `game-engine.js` (update/draw), `combat-manager.js` (spawned from enemy/asteroid kills), `wave-manager.js` (starfield generation)

---

### BackgroundStar

**Class**: `BackgroundStar`
**File**: `js/modules/world/background-star.js`
**Pool**: `backgroundStarPool` (init: 120)

| Category | Properties | Notes |
|----------|-----------|-------|
| Position | `x`, `y`, `z` (depth) | Deep parallax |
| Visual | `radius`, `color`, `opacity`, `twinkleSpeed`, `twinkleAmplitude` | Cool-toned colors |

**Color distribution**: 55% blue-white, 25% white, 12% warm, 8% orange-red

**Used in**: `game-engine.js` (update/draw, twinkles during pause/shop with zero velocity)

---

### Powerup

**Class**: `Powerup`
**File**: `js/modules/world/powerup.js`
**Pool**: `powerupPool` (init: 5)

| Category | Properties | Notes |
|----------|-----------|-------|
| Metadata | `type`, `config`, `icon`, `color`, `gradientColors[]` | From POWERUP_TYPES |
| Position | `x`, `y`, `vel: {x, y}`, `radius` | Drifts slowly |
| Lifetime | `life`, `maxLife`, `pulsePhase` | Fades when expiring |
| Visual | `powerupColor`, `powerupIcon`, `floatDistance` | Floating bob animation |

**Powerup types** (17): RAPID_FIRE, MULTI_SHOT, HOMING, BIG_BULLETS, SPEED_BOOST, PIERCING, EXPLOSIVE, CRIT_CHANCE, CRIT_DAMAGE, LONG_RANGE, SHIELD_BOOST, MEDPACK, DOCTOR, PAYDAY, HIGH_ROLLER, HEALTH_ORB_DROP_CHANCE/QUANTITY, MONEY_ORB_DROP_CHANCE/QUANTITY

**Used in**: `collision-system.js` (player-powerup collection), `combat-manager.js` (spawned from drops), `game-engine.js` (update/draw), `player/progression.js` (applied to player stats)

---

## 9. Subsystems

### 9.1 Collision System

**File**: `js/modules/combat/collision-system.js` (1252 lines)

`handleCollisions()` runs all checks in this order:

```
 1. Bullet vs Asteroid     -- Spatial grid broad-phase, damage, knockback, splitting
 2. Asteroid vs Asteroid   -- Elastic collision (750ms spawn immunity)
 3. Player vs Collectibles -- Health/money orb pickup
 4. Player vs Powerups     -- Powerup collection
 5. Player vs Enemy        -- Contact damage, knockback, hitstop
 6. Bullet vs Enemy        -- Damage, hit flash, death, debris, drops
 7. Bullet vs Homing Mines -- Player can shoot enemy mines
 8. Enemy Bullet vs Player -- Damage with screen effects
 9. Enemy vs Asteroid      -- Push forces, momentum exchange
10. Weapon Effect Collisions:
      - Lance Beam vs Enemies (line-to-circle)
      - Mines vs Enemies (proximity trigger + blast radius)
      - Nova vs Enemies (expanding ring)
      - Lightning vs Enemies (chain-jump)
      - Missiles vs Enemies (homing projectile)
      - Deflector Orbs vs Enemy Bullets (reflect)
      - Tractor Shield vs Enemy Bullets (absorb for coins)
```

**Key config values**: `HIT_FLASH_FRAMES: 10`, `BOUNCE_RESTITUTION: 0.8`, `BULLET_KNOCKBACK: 0.05`

### 9.2 Wave System

**Files**: `js/modules/wave/wave-manager.js`, `js/modules/wave/wave-data.js`

**Wave structure** (100 hand-designed waves + procedural beyond):

| Act | Waves | Theme |
|-----|-------|-------|
| I | 1-15 | Solo enemy introductions, high asteroid count |
| II | 16-30 | Themed duo encounters with synergies |
| III | 31-50 | Synergistic trios, coordinated challenges |
| IV | 51-75 | Quad+ combos, specialty waves |
| V | 76-100 | Full-spectrum chaos, every wave is a final exam |
| Beyond | 101+ | Procedurally scaled from wave 100 config (+10%/wave) |

**Level scaling formulas**:
```
enemyLevel   = floor(wave / 5) + 1
asteroidLevel = floor(wave / 4) + 1
enemyHP      = base * (1 + (level - 1) * 0.20)   // +20% per level
enemySpeed   = base * (1 + (level - 1) * 0.10)   // +10% per level
asteroidHP   = base * (1 + (level - 1) * 0.30)   // +30% per level
```

**Wave completion**: `totalEnemies === 0` (excluding enemies in death flash animation).

**Wave clear rewards**: XP = 20 + wave * 10, coins = 50 + wave * 25. Primary weapons auto-unlock at milestone waves.

### 9.3 Weapon System

**File**: `js/modules/combat/weapon-data.js`

**Primary weapons** (left-click, auto-fire):

| Weapon | Fire Rate | Damage | Bullets | Spread | Range | Unlock |
|--------|-----------|--------|---------|--------|-------|--------|
| Pulse Cannon | 400ms | 0.8 | 1 | 0 | 0.85x | Wave 0 |
| Storm Needles | 130ms | 0.3 | 1 | 0.15 | 0.7x | Wave 3 |
| Scatter Gun | 700ms | 0.4 | 5 | 0.6 | 0.5x | Wave 5 |
| Rail Driver | 1200ms | 3.0 | 1 | 0 | 1.5x | Wave 8 |
| Lance Beam | 1200ms | 0.15/tick | continuous | 0 | 1.2x | Wave 12 |

**Power weapons** (right-click, cooldown): Charge Shot, Mine Layer, Nova Blast, Lightning Arc, Missile Salvo

**Defense skills** (keys 1-4, cooldown): Bulwark, Repair Nanites, Phase Dash, Deflector Orbs, EMP Pulse, Tractor Shield

Each weapon and skill has its own upgrade tree purchasable in the shop.

### 9.4 Input System

**File**: `js/modules/ui/input-handler.js`

Unified input state object consumed by Player.update():

```javascript
{
    up, down, left, right: boolean,   // WASD or arrows
    aimX, aimY: number,               // World coordinates (mouse or auto-aim)
    mouseDown: boolean,               // Left-click held (auto-fire)
    fireSecondary: boolean,           // Right-click (power weapon)
    skill1-4: boolean,               // Number keys 1-4
}
```

**Supported input methods**: Keyboard + mouse (desktop), touch with dynamic joystick (mobile), gamepad (partial)

**Mobile auto-aim**: When no mouse is available, `aimX`/`aimY` automatically point at the nearest enemy. Falls back to movement direction if no enemies visible.

### 9.5 Audio System

**Files**: `js/modules/audio/audio-manager.js`, `js/modules/audio/sound-defs.js`, `js/modules/audio/music-player.js`. Generator: `tools/scripts/generate-sfx.js`. Pre-rendered library: `sfx/<name>.wav` + `sfx/manifest.json` (26 sounds, ~900 KB).

**Sound design vocabulary (5.35.0)**: every SFX is a 2–3 layer composition. The common stack: a low body (sine or low square — sub-bass thump for impact weight), a mid carrier (square, often duty-modulated — the recognizable note), and a high HPF'd transient or arpeggiated tail (brightness, sparkle, tech sheen). Most layers move in pitch via `p_freq_ramp` (descending energy bursts, rising chimes), `p_arp_mod` (chord intervals from one voice), or `p_vib_strength`/`p_vib_speed` (warbling beams, sustained hums) so nothing sits static.

**SFX pipeline** (rewritten 5.34.0):
1. **Offline render** — `npm run generate-sfx` reads `sound-defs.js` and writes one WAV per sound to `/sfx/`. Defs are one of:
   - `{ preset }` — `sfxr.generate(preset)` once (laserShoot, hitHurt, pickupCoin, explosion).
   - `{ params }` — explicit single-voice render.
   - `{ layers: [{ params, gain }, ...] }` — each layer rendered separately, sum-mixed sample-wise, peak-normalized to 0.95. Used for the chord-y/multi-component sounds (powerup chime, weapon impacts, ship-collision thud-plus-zap) since sfxr is monophonic per voice.
   Output is mono 16-bit PCM at 44.1 kHz.
2. **Load** — `AudioManager.init()` fetches `sfx/manifest.json`, then for each entry `fetch → arrayBuffer → audioContext.decodeAudioData → audioBuffers.set(name, buf)`.
3. **Play** — `playSound(name)` creates a fresh `AudioBufferSourceNode` + `GainNode` per call and `start(0)`s it. No pool, no throttle, no rewind. Polyphony is unbounded; nodes are auto-GC'd after the buffer ends. Master volume is per-call so the slider takes effect on the next play without re-decoding.

**Sound categories**:
- Core: `shoot`, `hit`, `coin`, `powerup`, `explosion`, `playerExplosion`, `tractorBeam`, `shield`, `healthRegen`
- Player ship collisions: `playerHitAsteroid`, `playerHitEnemy`
- Per-pattern enemy bullet → player (10): `enemyHit_hunter_single`, `enemyHit_guardian_spread`, `enemyHit_wasp_machinegun`, `enemyHit_charged_laser`, `enemyHit_arc_lightning`, `enemyHit_missile`, `enemyHit_spiral_laser`, `enemyHit_sentinel_sweep`, `enemyHit_lay_mine`, `enemyHit_sweep_laser`
- Per-weapon player bullet → enemy/asteroid (5): `playerHit_PULSE_CANNON`, `playerHit_STORM_NEEDLES`, `playerHit_SCATTER_GUN`, `playerHit_RAIL_DRIVER`, `playerHit_LANCE_BEAM`

**Triggering**: Via event bus, e.g. `events.emit('audio:explosion')`. Per-weapon hits go via `events.emit('audio:enemy-hit-by-bullet', bullet.weaponId)` → game-engine resolves to `playSound('playerHit_<weaponId>')` (or `playHit()` fallback). Enemy-bullet hits use `events.emit('audio:player-hit-bullet', bullet.firingPattern)` symmetrically. `bullet.weaponId` is stamped in `applyGlobalBulletUpgrades`; `bullet.firingPattern` is stamped via thread-local `gameEngine._activeShotPattern` in the enemy `shoot()` dispatch.

**Music**: Playlist loaded from pre-generated track list, Fisher-Yates shuffled, with adjacent track preloading for gapless playback. Stays on `HTMLAudioElement` (single long track, no concurrency need).

**No SFX runtime synthesis**: The sfxr CDN scripts are not loaded at runtime; only the offline generator depends on the `jsfxr` npm package.

### 9.6 HUD System

**Files**: `js/modules/hud/status.js`, `hud/combat.js`, `hud/navigation.js`, `hud/overlays.js`, `hud/cursor.js`

| Module | Renders |
|--------|---------|
| `status.js` | Health bar, shield bar, lives, level, XP, coins, skill cooldowns, wave messages, title screen |
| `combat.js` | Damage numbers, target info, money pickup text, powerup display, powerup indicators |
| `navigation.js` | Off-screen enemy indicators, minimap |
| `overlays.js` | Pause menu, shop overlay, wave transition, invincibility timer |
| `cursor.js` | Custom crosshair, jitter circle (spread preview), cooldown timer ring |

All HUD rendering happens after the camera transform is restored, so elements are screen-relative.

### 9.7 Camera System

**File**: `js/modules/world/camera-manager.js`

| Effect | Method | Details |
|--------|--------|---------|
| Follow | `updateCamera()` | Smooth-damp follow player (smoothing: 0.1) |
| Screen shake | `triggerScreenShake(duration, magnitude, radius)` | Multi-frequency sine + random jitter |
| Camera kick | `triggerCameraKick(dx, dy, magnitude)` | Directional impact lurch, exponential decay |
| Screen flash | `triggerScreenFlash(alpha, duration)` | White overlay on kills, decays per frame |
| Hitstop | `triggerHitstop(frames)` | Selective freeze with global budget (10f/s max) |

### 9.8 Shop System

**File**: `js/modules/shop/shop-manager.js`

**Tabs**: Offense (coins), Defense (SP), Drops (SP), Primary (weapon upgrades), Power (weapon upgrades), Skills (skill upgrades)

**Buy**: Checks currency, max stacks, deducts cost, applies to player.
**Sell**: 50% refund. Cannot sell base weapons/skills.
**Cost scaling**: Per-stack increase or custom `costOverrides` arrays.

### 9.9 Background Rendering

**File**: `js/modules/performance/nebula-renderer.js`

Pre-renders static nebula clouds to offscreen canvases at game start. Three depth layers (parallax multipliers: 0.02, 0.06, 0.12) with 2-5 soft gas blobs per layer. Half-resolution rendering for natural softness. 8 color palettes (blues, purples, cyans, rare warm gold).

**File**: `js/modules/performance/depth-batch-renderer.js`

Groups background stars by depth bucket for batched rendering -- one `beginPath/stroke` call per depth level instead of per star.

### 9.10 VFX Telemetry

**File**: `js/modules/debug/vfx-telemetry.js`

Per-frame ring buffer (3600 frames, ~60s) recording all visual effect state. Enabled via `window.__VFX_TELEMETRY__ = true`. Zero cost when disabled. Used by E2E tests to validate VFX behavior without screenshots.

---

## 10. Module Dependency Map

### File Tree

**`js/`**

- `main.js` — Boot, asset loading, start handlers.

**`js/modules/`**

- `game-engine.js` — Core facade (1200+ lines).

**`js/modules/core/`**

- `constants.js` — `GAME_CONFIG`, `GAME_STATES`, enemy bullet config.
- `pool-manager.js` — Generic object pool.
- `game-state.js` — State machine with transition validation.
- `event-bus.js` — Pub/sub event system.
- `frame-clock.js` — Global frame counter.
- `game-timer.js` — Pauseable timers.
- `utils.js` — `random()`, `clamp()`, `lerp()`, etc.
- `color-cache.js` — HSL string cache to avoid repeated allocation.
- `event-setup.js` — DOM event wiring (resize, visibility, etc.).

**`js/modules/player/`**

- `player.js` — Player class.
- `bullet.js` — Player bullet class.
- `renderer.js` — Player draw methods (hull, thrust, muzzle flash).
- `weapons.js` — Fire logic, muzzle-flash spawning.
- `skills.js` — Defense skill activation / update.
- `progression.js` — XP, leveling, powerup stacking.
- `lifecycle.js` — Death, respawn, invincibility.

**`js/modules/enemy/`**

- `enemy.js` — Enemy class + `ENEMY_TYPES`.
- `enemy-bullet.js` — Enemy bullet class (20+ movement patterns).
- `shapes.js` — 10 enemy shape renderers + white-flash proxy.
- `ai.js` — Targeting, line-of-sight, behavior selection.
- `movement.js` — 20+ movement patterns (orbital, dart, grid, etc.).
- `firing.js` — Bullet spawning, burst logic, pattern selection.

**`js/modules/combat/`**

- `weapon-data.js` — All weapon / skill / upgrade definitions.
- `collision-system.js` — All collision detection and response.
- `combat-manager.js` — Debris, drops, powerups, damage numbers.

**`js/modules/wave/`**

- `wave-manager.js` — Wave lifecycle, spawning, progression.
- `wave-data.js` — 100 hand-designed wave configs + scaling formulas.

**`js/modules/world/`**

- `asteroid.js` — Asteroid class (3D wireframe).
- `particle.js` — Particle class (20+ types).
- `color-star.js` — Decorative stars + collectible orbs.
- `background-star.js` — Parallax background stars.
- `line-debris.js` — Spinning line fragments.
- `powerup.js` — Powerup class (17 types).
- `camera-manager.js` — Camera follow, shake, kick, flash, hitstop.

**`js/modules/ui/`**

- `input-handler.js` — Keyboard, mouse, touch, gamepad.
- `ui-manager.js` — DOM-based UI (modals, overlays, buttons).

**`js/modules/hud/`**

- `index.js` — Barrel export.
- `status.js` — Health, XP, lives, wave messages.
- `combat.js` — Damage numbers, target info, powerup display.
- `navigation.js` — Off-screen indicators, minimap.
- `overlays.js` — Pause, shop overlay, wave transition.
- `cursor.js` — Custom crosshair, spread preview.

**`js/modules/shop/`**

- `shop-manager.js` — Buy / sell logic, tab management.
- `shop-renderer.js` — Shop UI rendering.

**`js/modules/audio/`**

- `audio-manager.js` — Loads pre-rendered WAVs from `/sfx/manifest.json`, plays via WebAudio (one source+gain per call). See §9.5.
- `sound-defs.js` — Source-of-truth SFX registry (preset / params / layers shapes). Imported by both runtime and the offline generator.
- `music-player.js` — Background music playlist.

**`js/modules/performance/`**

- `nebula-renderer.js` — Pre-rendered nebula backgrounds.
- `depth-batch-renderer.js` — Star depth-batching.
- `spatial-grid.js` — Broad-phase collision grid (8 × 6).
- `temporal-upsampling.js` — Fixed-timestep accumulator.
- `enhanced-performance-manager.js` — Frame budget management.
- `canvas-layers.js` — Multi-layer canvas system.
- `frustum-culling.js` — Viewport culling utilities.
- `text-cache.js` — Cached text rendering.
- `path-cache.js` — Cached canvas paths.
- `color-cache.js` — HSL string caching.
- `typed-array-particles.js` — TypedArray-based particle system (alternative).
- `render-batch.js` — Batched draw calls.
- `optimized-pool-manager.js` — Pool optimization variant.
- `optimized-entities.js` — Entity optimization variant.
- `quadtree.js` — Quadtree spatial structure (unused, spatial-grid preferred).

**`js/modules/debug/`**

- `vfx-telemetry.js` — Per-frame VFX state recording.

### Data Flow Summary

The engine has **two pipelines** that run on every game loop iteration. They share state through the entity pools but otherwise don't talk to each other directly:

- **Update pipeline** — runs on a fixed 60 Hz tick (driven by the accumulator in `gameLoop()`). Pure state mutation; no canvas calls.
- **Render pipeline** — runs once per `requestAnimationFrame` (display refresh, typically 60 / 120 Hz). Pure read of the state the update pipeline just produced; no game logic.

The shared state is the set of pool-backed entities (`bulletPool`, `enemyPool`, `asteroidPool`, `particlePool`, `colorStarPool`, `lineDebrisPool`, `powerupPool`, …), the `player`, and the `game` state object. The update pipeline writes to them; the render pipeline reads from them.

#### Update pipeline (per 60 Hz tick)

1. **InputHandler**
   Captures keyboard / mouse / touch into `input.{move, fire, …}`.
2. **Player.update(input)**
   Applies thrust and rotation, fires bullets / power weapons, ticks skill cooldowns, ticks invincibility / shield tanks.
3. **Pool.update(...) for each pool**
   Bullets fly, enemies AI-step and fire, asteroids drift and spin, particles age, orbs and powerups magnet toward the player.
4. **CollisionSystem**
   Checks bullet ↔ enemy, bullet ↔ asteroid, player ↔ enemy / asteroid / enemy-bullet, player ↔ orb / powerup. Damage is applied here.
5. **On hit / death**, the following all fan out from the same event:
   - Damage-number popup → `particlePool`
   - Debris fragments → `lineDebrisPool`
   - Explosion particles → `particlePool`
   - Orb / powerup drops → `colorStarPool`, `powerupPool`
   - Death-flash flag → `entity._deathFlash`
   - Hitstop budget request → queued; freezes step 3 next tick
6. **CombatManager.onEnemyKill**
   Updates kill streak, score, hit-streak multiplier.
7. **WaveManager**
   Checks "all enemies dead?" → advances the wave or counts down.
8. **GameTimer / GameEngine bookkeeping**
   Ticks survival timer, last-spawn timer, health-drop cooldown, shop cooldown.

When **hitstop** is active for the next tick, step 3 skips most pools (enemies / asteroids / bullets / collision detection are frozen), but the player, particles, line debris, and damage-number ticks keep running so the player still feels in control. See §4 *Hitstop*.

#### Render pipeline (per rAF frame)

A. **CameraManager.follow(player)**
   Updates camera position with smoothing plus screen-shake offset.
B. **Compute viewport** (`vL`, `vT`, `vR`, `vB`)
   In world space, used for frustum culling.
C. **Clear canvas + draw background**
   Parallax starfield and nebula renderer (background-star pool).
D. **`ctx.translate(-camera.x, -camera.y)`**
   Switch to world space.
E. **World draw** (depth-sorted, culled), in this order:
   - asteroids
   - enemies
   - enemy bullets
   - player
   - player bullets
   - particles
   - line debris
   - orbs
   - powerups

   Each pool is drawn via `drawActiveVisible(ctx, vL, vT, vR, vB)` so off-screen entities are skipped. Depth ordering matches the depth-batch renderer's pre-baked layer assignments.
F. **Weapon / skill effects overlay**
   Beams, lightning arcs, shockwaves, mine pulses (still in world space).
G. **`ctx.restore()`**
   Back to screen space.
H. **HUD** — drawn in screen space, in this order:
   - health bar, lives triforce, level / coins, XP
   - skill cooldown row
   - wave indicator
   - powerup pickup label, level-up text
   - survival timer
   - minimap, off-screen enemy markers
   - target info, damage-number popups
   - combo counter
   - powerup indicator strip
   - title-screen overlay (only if `state == TITLE_SCREEN`)
I. **Screen-space effects**
   White flash on player hit, vignette, scanline overlay.
J. **Pause / shop overlay (DOM)**
   Not painted on canvas — these are CSS-styled DOM elements that sit above the canvas via `z-index` when active.

#### How the two pipelines stay in sync

- The update pipeline is paced by a **fixed-timestep accumulator** (§4): the loop runs as many 60 Hz ticks as needed to catch up to wall-clock time, then renders once. Logic never runs faster than 60 Hz, so behavior is deterministic regardless of display refresh rate.
- All cross-pipeline communication is via **entity state mutation**. The update pipeline never calls into the renderer; the renderer never mutates entities (it only reads `x`, `y`, `radius`, `color`, `_deathFlash`, etc.).
- DOM-side UI (pause menu, shop, music player) communicates back into the engine through the **event bus** (`core/event-bus.js`) — e.g. `events.emit('ui:toggle-pause')` — which lets it stay decoupled from the canvas pipelines entirely.
