# Rainboids Refactor Plan

A comprehensive plan for refactoring the Rainboids codebase to improve modularity, testability, and long-term maintainability. This document covers the current state analysis, identified risks, architectural recommendations, incremental execution plan, and style rules.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Identified Risks & Anti-Patterns](#2-identified-risks--anti-patterns)
3. [Architecture Recommendations](#3-architecture-recommendations)
4. [Incremental Refactor Plan](#4-incremental-refactor-plan)
5. [Style Rules & Conventions](#5-style-rules--conventions)
6. [Testing Strategy](#6-testing-strategy)
7. [Performance Guardrails](#7-performance-guardrails)
8. [Feature & Optimization Preservation](#8-feature--optimization-preservation)
9. [Multi-SKU Deployment Architecture](#9-multi-sku-deployment-architecture)
10. [Coding Rules for All Future Updates](#10-coding-rules-for-all-future-updates)

---

## 1. Current State Analysis

### Codebase Metrics

| File | Lines | Role | Complexity |
|------|-------|------|------------|
| `game-engine.js` | **1,248** (was 7,746) | Core orchestrator | **Reduced — still large** |
| `entities/enemy.js` | **1,011** (was 6,655) | 10 enemy types | **85% reduced** — movement, firing, shapes, AI extracted |
| `entities/player.js` | **702** (was 2,263) | Player entity | **69% reduced** — weapons, skills, progression, renderer extracted |
| `ui-manager.js` | 1,277 | DOM-based UI | Moderate |
| `entities/enemy-bullet.js` | 977 | Enemy projectiles | Moderate |
| `utils.js` | 749 | Shared utilities | Low |
| `entities/color-star.js` | 604 | Visual effects | Low |
| `entities/bullet.js` | 540 | Player projectiles | Low |
| `entities/particle.js` | 538 | Particle effects | Low |
| `entities/asteroid.js` | 519 | Asteroid entity | Low |
| `entities/powerup.js` | 499 | Powerup drops | Low |
| `input-handler.js` | 450 | Keyboard/mouse/touch | Low |
| `audio-manager.js` | 407 | Sound effects | Low |
| `wave-data.js` | 406 | 100 wave definitions | Data only |
| `weapon-data.js` | 392 | Weapon/skill definitions | Data only |
| `constants.js` | 240 | Game constants | Data only |
| `main.js` | 190 | Entry point | Low |
| **Total** | **~22,000** | | |

Additionally, 16 performance optimization modules in `js/modules/performance/` (spatial grid, quadtree, frustum culling, text cache, depth batch renderer, etc.).

### Dependency Graph

```
main.js
  └─> RainboidsGame
        ├─> AssetLoader
        ├─> AudioManager
        ├─> InputHandler ←──── bidirectional ref ────┐
        ├─> UIManager                                 │
        │   └─> MusicPlayer                          │
        └─> GameEngine ──────────────────────────────┘
             ├─> 10 PoolManagers (bullet, particle, asteroid, enemy, ...)
             ├─> Player ───────> pools (direct mutation)
             ├─> Enemy ────────> window.gameEngine (global fallback)
             ├─> wave-data.js
             ├─> weapon-data.js
             ├─> constants.js
             ├─> SpatialGrid, depthBatchRenderer, nebulaRenderer
             └─> InputHandler, UIManager, AudioManager (stored refs)
```

### What GameEngine Currently Does (7,746 lines)

GameEngine is a textbook **god object**. It owns or directly manages:

- **Game loop** — `requestAnimationFrame`, fixed 60Hz timestep with accumulator
- **Game state machine** — 7 states, 45 direct state assignments, 51 state reads
- **10 object pools** — creation, update, draw, cleanup
- **Wave system** — progression, spawning, level scaling, completion detection
- **Collision system** — bullet-enemy, bullet-asteroid, player-enemy, etc.
- **Shop system** — item data, purchase logic, tab management, rendering (~800 lines of canvas drawing)
- **HUD rendering** — health bars, minimap, powerup display, cursor, timers (~1,500+ lines)
- **Camera system** — position, screen shake, kick, flash
- **Input handling** — keyboard/mouse/touch event listeners (~400 lines)
- **Audio callbacks** — playCoin, playExplosion, etc. (scattered throughout)
- **Notification system** — queue, display, timing
- **Entity spawning** — asteroids, enemies, powerups, orbs
- **17 setTimeout calls** — wave delays, respawns, explosion sequences, visual effects

---

## 2. Identified Risks & Anti-Patterns

### 2.1 State Machine Fragility

The game state (`this.game.state`) is assigned directly in **45 locations** across `game-engine.js`. There is no transition validation — any code path can set any state at any time.

**Specific risks:**
- `setTimeout` callbacks at lines 788, 906, 947, 1262 can fire after the player has paused, opened the shop, or died — causing invalid state transitions
- No "epoch guard" — stale callbacks from a previous state can corrupt the current state
- Multiple locations set `WAVE_TRANSITION` (lines 776, 988, 1244, 1661) with no guard against already being in that state
- `PLAYING` is set inside a `setTimeout` at line 790 without checking if the game is currently `PAUSED` or `SHOP`

**Likely wave progression bug source:** If a `setTimeout`-based wave transition callback fires while the game is in `SHOP` or `PAUSED`, it can silently set the state to `PLAYING` and start spawning entities while the shop overlay is still visible — or worse, skip a wave entirely.

### 2.2 setTimeout in Game Logic

17 `setTimeout` calls in `game-engine.js`. Of these, **7 control game logic** (wave spawning, state transitions, respawns) and **10 are visual** (explosion sequences, notifications). The game-logic ones are dangerous:

| Line | Purpose | Risk |
|------|---------|------|
| 788 | Wave transition → PLAYING | Fires during PAUSED/SHOP |
| 906 | Sub-wave spawn delay | Fires during PAUSED |
| 947 | Sub-wave spawn delay | Fires during PAUSED |
| 1262 | Main spawn delay after wave start | Fires during PAUSED |
| 1675 | Shop close → wave resume | Race with other transitions |
| 2635 | Mid-wave enemy reinforcement | Fires during PAUSED |
| 2908 | Mid-wave enemy reinforcement | Fires during PAUSED |

**Problem:** `setTimeout` runs in real-time, ignoring game state. If the player pauses during a wave transition, the spawn timer keeps counting down and fires while paused. The spawned enemies appear instantly when the player unpauses, or the state change happens behind the pause overlay.

### 2.3 Mutation-at-a-Distance

Game state is mutated from many locations with no ownership model:

- `this.game.money` is modified in: wave completion, orb pickup, shop purchase, shop sell, cheat codes (5+ locations)
- `this.game.currentWave` is modified in: `startNextWave()`, `completeWave()`, cheat code handlers
- `this.player.health` is modified in: collision handlers, shop purchases (health boost), powerup application, respawn logic
- Pool objects are accessed directly from GameEngine, Player, and Enemy — any of them can `pool.get()` or `pool.release()`

**Impact:** When a bug changes money or health unexpectedly, there are 5+ code paths to investigate. No audit trail, no single place to set a breakpoint.

### 2.4 Circular & Global Dependencies

- **`window.gameEngine`** is set in 3 places (`main.js` lines 41, 145, 179) and read by `enemy.js` as a fallback for accessing `gameField` dimensions
- **InputHandler ↔ GameEngine** — bidirectional reference (InputHandler stores `this.gameEngine`, GameEngine stores `this.inputHandler`)
- **Player → Pools** — Player's `update()` receives 7 parameters including 3 pool references, which it uses to spawn bullets and particles directly

### 2.5 Pool Exhaustion Silence

When a pool is empty, `PoolManager.get()` creates a new object (line 28 of pool-manager.js). This is correct for gameplay (never drop a bullet), but pool sizing issues are invisible. If wave 86 requests 12 asteroids but `MAX_ASTEROIDS` caps it at 4, the remaining 8 are silently not spawned. No warning, no metric.

### 2.6 Duplicate Code

- **Enemy shield initialization** appears twice in `enemy.js` (lines 220-229 and 298-307). The second overwrites the first.
- **Coordinate transformation** logic exists in both `InputHandler` and `GameEngine` (`screenToWorldCoordinates`)
- **Pool iteration patterns** are repeated across `update()`, `draw()`, `handleCollisions()` — each manually iterates `pool.activeObjects`

### 2.7 File Size

`game-engine.js` at 7,746 lines is unmaintainable. Finding a specific piece of logic requires searching through thousands of lines. Code reviews are impractical — a diff touching this file could affect any subsystem.

---

## 3. Architecture Recommendations

### 3.1 Target Architecture: Domain Manager Pattern

**Not ECS.** Rainboids has ~10 entity types with fixed behaviors. A full Entity-Component-System adds lookup tables, bitmask queries, and archetype management that aren't justified at this scale. The entity class hierarchy (`Player`, `Enemy`, `Asteroid`, etc.) works well and should stay.

**Instead, extract the god object into focused managers:**

```
GameEngine (thin orchestrator, ~300-500 lines)
  ├── GameStateMachine      — state transitions, epoch guards
  ├── EventBus              — lightweight pub/sub for cross-system events
  │
  ├── WaveManager           — wave state, progression, completion detection
  ├── SpawnManager          — entity spawning (enemies, asteroids, powerups)
  ├── CollisionSystem       — spatial queries, hit detection, damage application
  ├── CombatManager         — damage numbers, kill streaks, orb drops
  ├── ShopManager           — item data, purchase logic, inventory
  ├── CameraManager         — position, shake, kick, flash
  │
  ├── HUDRenderer           — all canvas HUD drawing (health, minimap, cursor, etc.)
  ├── ShopRenderer          — shop window, tabs, items, scrollbar
  ├── EffectsRenderer       — weapon effects, powerup indicators, boundary glow
  │
  └── GameContext            — shared reference object passed to all managers
       ├── pools: { bullet, particle, asteroid, enemy, ... }
       ├── player
       ├── camera
       ├── gameField
       ├── state: GameStateMachine
       ├── audio: AudioManager
       └── events: EventBus
```

**GameEngine becomes a thin orchestrator:**
```
constructor() → create managers, wire events
gameLoop()    → requestAnimationFrame, fixed timestep
update(dt)    → waveManager.update(dt) → collisionSystem.update() → ...
draw(ctx)     → camera.apply(ctx) → pools.draw() → hud.draw(ctx)
```

### 3.2 Game State Machine

Replace all 45 direct `this.game.state = X` assignments with a single `GameStateMachine.transition(newState)` method.

**Transition table:**

```
TITLE_SCREEN     → PLAYING, WAVE_TRANSITION
PLAYING          → PAUSED, SHOP, WAVE_TRANSITION, GAME_OVER
WAVE_TRANSITION  → PLAYING, SHOP, PAUSED, GAME_OVER
PAUSED           → PLAYING, WAVE_TRANSITION, SHOP
SHOP             → WAVE_TRANSITION, PAUSED
GAME_OVER        → TITLE_SCREEN
ORIENTATION_LOCK → (restore previous state)
```

**Features:**
- `transition(newState)` — validates against transition table, runs `onExit` hooks for old state, updates state, increments epoch counter, runs `onEnter` hooks for new state
- `canTransition(newState)` — returns boolean without side effects
- **Epoch guard for setTimeout:** Every `setTimeout` that controls game logic captures `const epoch = stateMachine.epoch`. When the callback fires, it checks `if (stateMachine.epoch !== epoch) return;` — discarding stale callbacks automatically.
- `onEnter` / `onExit` hooks allow managers to register setup/teardown (e.g., entering SHOP pauses charge weapons; exiting SHOP resumes them)

### 3.3 Frame-Counted Timers

Replace game-logic `setTimeout` calls with a `GameTimer` utility that respects game state:

```javascript
class GameTimer {
    constructor(durationMs, callback) { ... }
    tick(dt) { /* only decrements when explicitly called */ }
    isDone() { ... }
    reset(durationMs) { ... }
    cancel() { ... }
}
```

**Key property:** Timers only advance when their owning manager calls `timer.tick(dt)`. If the game is paused, no manager calls `tick()`, so timers freeze. No more stale `setTimeout` callbacks.

**Keep `setTimeout` for:** Visual-only effects (explosion phase sequencing, notification display) that should play out regardless of game state. But consider migrating these to a "tween queue" that runs in the render loop for tab-switch resilience.

### 3.4 Event Bus

Lightweight synchronous pub/sub (~30 lines) for cross-cutting events:

**Good candidates for events:**
- `'enemy:killed'` → WaveManager decrements count, CombatManager updates streak, AudioManager plays sound, SpawnManager checks for orb drops
- `'wave:complete'` → ShopManager prepares inventory, CameraManager plays transition effect
- `'wave:started'` → HUDRenderer updates wave display, SpawnManager begins spawning
- `'player:died'` → CameraManager triggers death shake, HUDRenderer updates lives
- `'purchase:complete'` → AudioManager plays purchase sound
- `'state:changed'` → all managers react to state transitions

**Do NOT use events for:** Per-frame updates (60Hz), collision results, rendering calls. These are hot paths where dispatch overhead matters. Use direct method calls.

### 3.5 Context Object (Dependency Injection)

Replace `window.gameEngine` and bidirectional references with a plain context object:

```javascript
const gameContext = {
    pools: { bullet, particle, enemy, asteroid, ... },
    player,
    camera,
    gameField: { width, height },
    state: gameStateMachine,
    audio: audioManager,
    events: eventBus,
    input: inputHandler,
};
```

Each manager receives `gameContext` in its constructor and stores only the references it needs. Entities that currently use `window.gameEngine` receive a slim interface in their `update()` call instead:

- `enemy.update(dt, { player, bulletPool, gameField })` — enemy doesn't need the entire game engine
- `player.update(dt, input, { bulletPool, particlePool, colorStarPool, gameField, audio })` — explicit about what it touches

**Eliminates:**
- All `window.gameEngine` globals
- InputHandler ↔ GameEngine circular reference
- Entity files reaching into the game engine for gameField dimensions

---

## 4. Incremental Refactor Plan

### Guiding Principle: Strangler Fig

Never refactor two systems simultaneously. Extract one, stabilize it (all tests pass), commit, then move to the next. Each extraction is a self-contained change that can be reviewed and reverted independently.

### Phase 1: Foundation (Zero Risk)

**Step 1.1: GameStateMachine** (~100 lines new)
- Create `js/modules/core/game-state.js`
- Implement transition table, epoch counter, `onEnter`/`onExit` hooks
- Replace all 45 `this.game.state = X` assignments with `this.stateMachine.transition(X)`
- Add epoch guards to all 7 game-logic `setTimeout` calls
- **Test:** Run full QA suite. Every state transition that worked before must still work.
- **Estimated impact:** Eliminates entire class of stale-setTimeout bugs

**Step 1.2: EventBus** (~30 lines new)
- Create `js/modules/core/event-bus.js`
- Wire it into GameEngine but don't use it yet — just make it available
- **Test:** No behavior change, just infrastructure

**Step 1.3: GameTimer** (~40 lines new)
- Create `js/modules/core/game-timer.js`
- Replace wave-logic `setTimeout` calls (lines 788, 906, 947, 1262, 2635, 2908) with GameTimer instances
- Timers only advance during appropriate game states
- **Test:** Wave progression still works. Pause during wave transition → timer freezes → unpause → timer resumes correctly

### Phase 2: Extract Read-Only Renderers (Low Risk)

**Step 2.1: HUDRenderer** (~1,500-2,000 lines moved)
- Create `js/modules/rendering/hud-renderer.js`
- Move all `draw*` HUD methods: `drawHUD`, `drawSurvivalTimer`, `drawPauseButton`, `drawCanvasTriforce`, `drawLevelAndCoinsDisplay`, `drawXPBar`, `drawSkillCooldownHUD`, `drawWeaponEffects`, `drawPowerupDisplay`, `drawPowerupIndicators`, `drawMinimap`, `drawGameFieldBoundaries`, `drawOffScreenIndicators`, `drawCustomCursor`, `drawCursorCooldownTimer`, `drawSpawnTimer`, `drawRespawnCountdown`, `drawInvincibilityCountdown`, `drawGhostPreviews`
- HUDRenderer constructor receives a read-only context (game state, player, pools, camera)
- In GameEngine, replace with `this.hudRenderer.draw(ctx)`
- **Test:** Visual smoke test + QA HUD tests

**Step 2.2: ShopRenderer** (~600 lines moved)
- Create `js/modules/rendering/shop-renderer.js`
- Move `drawShop`, `drawShopTabs`, `drawShopItem`, `drawMultilineText`
- ShopRenderer receives shop state (filtered items, scroll offset, category) as data
- **Test:** QA shop tests (07-weapons.spec.js)

### Phase 3: Extract Stateful Systems (Medium Risk)

**Step 3.1: CameraManager** (~200 lines moved)
- Create `js/modules/systems/camera-manager.js`
- Move camera position, screen shake, kick, flash state and update logic
- Replace `this.camera.*` with `this.cameraManager.*`
- **Test:** Visual test + QA performance tests

**Step 3.2: ShopManager** (~400 lines moved)
- Create `js/modules/systems/shop-manager.js`
- Move `openShop`, `closeShop`, `buyShopItem`, `sellShopItem`, `_handleWeaponBuyOrEquip`, `_handleSkillBuy`, `_handleUpgradeBuy`, `_rebuildShopCache`, `_buildPrimaryTabItems`, `_buildPowerTabItems`, `_buildSkillsTabItems`
- Move shop state: `shopItems`, `shopFilteredItems`, `shopCategory`, `shopScrollOffset`, `shopItemBounds`, `shopTabBounds`, `shopScrollbarBounds`
- **Test:** Full weapon economy E2E tests + QA weapon tests

**Step 3.3: WaveManager** (~500 lines moved)
- Create `js/modules/systems/wave-manager.js`
- Move `updateWaveSystem`, `completeWave`, `startNextWave`, `startNewWave`, `spawnWaveEntities`, `spawnLeveledEnemies`, `spawnLeveledAsteroids`, `initializeLeveledAsteroid`, `applyEnemyLevelScaling`, `showWaveComplete`, `getWaveSubtitle`
- Move wave state: `currentWave`, `waveComplete`, `waveInProgress`, `wavePhase`, `waveTimer`, `enemyLevel`, `asteroidLevel`
- Uses GameTimer (from Phase 1) for all timing
- Emits events: `'wave:complete'`, `'wave:started'`, `'wave:entitySpawned'`
- **Test:** QA wave tests + E2E survival test

**Step 3.4: CollisionSystem** (~1,142 lines moved) — **DONE (v5.6.0)**
- Created `js/modules/systems/collision-system.js`
- Moved 8 methods: `handleCollisions`, `handleWeaponEffectCollisions`, `damageEnemy`, `handlePlayerEnemyCollision`, `handlePlayerEnemyBulletCollision`, `handleEnemyAsteroidCollision`, `handlePlayerAsteroidCollision`, `findNearestEnemy`
- Uses spatial grid for broad phase
- Event emission deferred to Phase 4 (currently uses `this.*` delegator calls back to GameEngine for effects/audio)
- **Test:** QA 94/95 pass (same baseline), unit 61/68 (same baseline)

**Step 3.5: CombatManager** (~611 lines moved) — **DONE (v5.7.0)**
- Created `js/modules/systems/combat-manager.js`
- Moved 22 methods: `createDebris`, `createColorStarBurst`, `createEnemyDebris`, `createShapeDebris`, `createHealthOrb`, `createMoneyOrb`, `dropStarsFromEntity`, `dropOrbsFromEntity`, `dropPowerup`, `collectPowerup`, `showPowerupDisplay`, `getPowerupConfig`, `onEnemyKill`, `updateKillStreak`, `createDamageNumber`, `updateDamageNumbers`, `addMoneyPickup`, `updateMoneyPickupDisplay`, `setTargetInfo`, `updateTargetInfo`, `handleEntityTargeting`, `updateHoverDetection`
- Covers: asteroid/enemy debris effects, orb drops, powerup collection, kill streaks, damage numbers, entity targeting/hover
- Removed unused `PRIMARY_UPGRADES`, `POWER_UPGRADES`, `SKILL_UPGRADES` imports from game-engine.js
- **Test:** Unit 61/68 (same baseline), QA 94/95 (same baseline)

**Step 3.6: PlayerLifecycle** (~379 lines moved) — **DONE (v5.7.0)**
- Created `js/modules/systems/player-lifecycle.js`
- Moved 9 methods: `takeDamage`, `handlePlayerDeath`, `createPlayerShipDebris`, `respawnPlayer`, `respawnPlayerSafely`, `findSafeRespawnLocation`, `updateRespawnAnimation`, `clearAreaAroundPlayer`, `explodeTank`
- Covers: damage processing, shield tank usage, multi-phase death explosion, safe respawn location finding, area clearing

**Step 3.7: WeaponEffectsRenderer** (~196 lines moved) — **DONE (v5.7.0)**
- Created `js/modules/rendering/weapon-effects-renderer.js`
- Moved `drawWeaponEffects` — renders all active weapon/skill visual effects: lance beam, mines, nova rings, lightning chains, missiles, deflector orbs, bulwark aura, tractor shield, EMP pulse, phase dash trail
- Removed unused `PRIMARY_WEAPONS`, `POWER_WEAPONS` imports from game-engine.js

**Step 3.8: Spawning methods → WaveManager** (~196 lines moved) — **DONE (v5.7.0)**
- Moved 9 spawning methods into existing `wave-manager.js`: `spawnAsteroidOffscreen`, `spawnWaveAsteroids`, `startEnemySubWave`, `forceSpawnEntity`, `forceSpawnEnemy`, `forceSpawnAsteroid`, `isInMinimapArea`, `spawnContinuousAsteroid`, `spawnRandomEnemy`
- Added `Asteroid` and `Enemy` imports to wave-manager.js for force-spawn fallback paths
- wave-manager.js: 441 → 616 lines (still under 800-line limit)

**Step 3.9: EventSetup** (~434 lines moved) — **DONE (v5.7.0)**
- Created `js/modules/systems/event-setup.js`
- Moved `setupEventListeners` — all event listener setup: window resize/orientation, keyboard shortcuts, cheat codes, game restart handlers (click/touch/enter), shop click/touch/scroll handling, entity targeting, mouse tracking for hover/cursor, auto-pause on blur
- game-engine.js: 1,681 → 1,248 lines
- **Test:** Unit 61/68 (same baseline)

### Phase 4: Wire Events & Remove Globals (Higher Risk)

**Step 4.1: EventBus wiring for audio and UI** — **DONE (v5.8.0)**
- Activated the existing EventBus (`this.events`) for cross-system communication
- Wired 7 audio events in GameEngine constructor: `audio:hit`, `audio:explosion`, `audio:coin`, `audio:shield`, `audio:health-regen`, `audio:powerup`, `audio:player-explosion`
- Wired 9 UI events: `ui:show-message`, `ui:hide-message`, `ui:update-lives`, `ui:check-orientation`, `ui:toggle-pause`, `ui:show-shop-button`, `ui:hide-shop-button`, `ui:show-pause-btn`, `ui:hide-pause-btn`
- Replaced all 31 `this.audioManager.playX()` calls in extracted modules with `this.events.emit('audio:x')`
- Replaced all 16 `this.uiManager.method()` calls in extracted modules with `this.events.emit('ui:event', data)`
- All extracted system modules (collision-system, player-lifecycle, combat-manager, shop-manager, event-setup, wave-manager) and rendering modules (hud-renderer) now have zero direct `audioManager`/`uiManager` references
- **Test:** Unit 61/68 (same baseline), QA 94/95 (same baseline)

**Step 4.2: Remove `window.gameEngine` reads from game code** — **DONE (v5.8.0)**
- Replaced all `window.gameEngine` reads in entity files with injected `this.gameEngine` ref:
  - `enemy.js`: stored `gameEngine` param in `update()` as `this.gameEngine` (already received as param); replaced 7 references
  - `player.js`: `gameEngine` ref injected in game-engine.js `init()`/`initializePools()`; replaced 6 references; level-up UI message now uses EventBus
  - `enemy-bullet.js`: `gameEngine` ref injected per-frame in game loop; replaced 2 references
  - `asteroid.js`: `gameEngine` ref injected per-frame in game loop; replaced 1 reference
- Replaced all `window.game` reads in `ui-manager.js` with `this.gameEngine` ref (set via new `setGameEngine()` method, called from `main.js`); replaced 16 references
- Global `window.gameEngine` / `window.game` **assignments kept** in main.js and game-engine.js for test instrumentation (QA/E2E tests use `page.evaluate(() => window.gameEngine)`)
- **Test:** Unit 61/68 (same baseline), QA 94/95 (same baseline)

### Phase 5: Cleanup

**Step 5.1: Remove compatibility shims** — delete any temporary delegator methods on GameEngine
**Step 5.2: Fix duplicate shield initialization** — N/A (only one `this.shield =` initialization found at line 288; no duplicate exists)
**Step 5.3: Pool high-water-mark tracking** — **DONE (v5.8.0)**
- Added `highWaterMark`, `totalAllocations`, `overflowAllocations` tracking to PoolManager
- Added `getStats()` method returning per-pool metrics
- Updated `showPerformanceStats()` to use `console.table()` with new pool stats
- Right-sizing initial allocations is a future step based on observed high-water marks during gameplay
**Step 5.4: Document MAX_ASTEROIDS intent** — Already documented: `MAX_ASTEROIDS: 4` is a gameplay balance decision ("better pacing"), not a performance limit. `MAX_WAVE_ASTEROIDS: 12` caps per-wave spawn counts separately.

### Extraction Priority Table

| Priority | Module | Lines Moved | Risk | Dependency | Status |
|----------|--------|-------------|------|------------|--------|
| 1.1 | GameStateMachine | 127 new | Minimal | None | **DONE** |
| 1.2 | EventBus | 46 new | None | None | **DONE** |
| 1.3 | GameTimer | 79 new | Low | StateMachine | **DONE** |
| 2.1 | HUDRenderer | 2,058 moved | Low | Read-only | **DONE** |
| 2.2 | ShopRenderer | 619 moved | Low | Read-only | **DONE** |
| 3.1 | CameraManager | 109 moved | Low | None | **DONE** |
| 3.2 | ShopManager | 528 moved | Medium | StateMachine | **DONE** |
| 3.3 | WaveManager | 441 moved | Medium | StateMachine, Pools | **DONE** |
| 3.4 | CollisionSystem | 1,142 moved | Medium | All pools, Player | **DONE** |
| 3.5 | CombatManager | 611 moved | Low | Pools, Player, Weapon-data | **DONE** |
| 3.6 | PlayerLifecycle | 379 moved | Low | Pools, Player, AudioManager | **DONE** |
| 3.7 | WeaponEffectsRenderer | 196 moved | Low | Weapon-data (read-only) | **DONE** |
| 3.8 | Spawning → WaveManager | 196 moved | Low | Pools, Enemy, Asteroid | **DONE** |
| 3.9 | EventSetup | 434 moved | Low | GAME_STATES, random | **DONE** |
| 4.1 | EventBus wiring | ~0 (rewiring) | Low | All managers | **DONE** |
| 4.2 | Remove window.gameEngine | ~0 (rewiring) | Medium | All entity files | **DONE** |

**Current state:** GameEngine 7,746 → 1,268 (84%). Enemy.js 6,655 → 1,011 (85%). Player.js 2,263 → 702 (69%). HUD-renderer.js 2,058 → split into 5 files (all under 600 LOC). Phases 1–10.1 complete. Remaining: Phase 9.3 (HUD theme config, optional), Phase 10.2 (split utils, optional), Phase 10.3 (enemy bullet patterns, medium risk).

---

### Phase 6: Enemy System Decomposition (6,644 → ~2,000 LOC)

**Motivation:** `enemy.js` is the largest file at 6,644 lines. It contains 10 enemy types with 30+ movement methods, 30+ firing methods, 10 custom draw methods, and 80+ scattered type-check conditionals (`if (this.type === 'HUNTER')`). Every new enemy type or behavior tweak requires touching 5+ locations. The goal is a **data-driven, composable** enemy system where new enemy types can be added by writing config, not code.

**Architecture: Strategy Pattern + Data-Driven Config**

The refactored enemy system uses three registries of pluggable behaviors:
1. **MovementRegistry** — named movement strategies (chase, orbit, zigzag, weave, etc.)
2. **FiringRegistry** — named firing strategies (spread, burst, laser, mine, missile, etc.)
3. **ShapeRegistry** — named visual renderers (triangle, guardian-emerald, wasp-wings, etc.)

Each enemy type is defined entirely in config:
```js
HUNTER: {
    // ... existing stats (health, speed, size, points) ...
    movement: { pattern: 'geometric', params: { shape: 'triangle', speed: 1.6, radius: 200 } },
    firing:   { pattern: 'aimed_burst', params: { count: 1, spread: 0, cooldown: 1.5 } },
    visual:   { shape: 'triangle', color: '#ff4444', glowColor: '#ff6666', trailLength: 15 },
    ai:       { evasion: 0.3, preferredRange: 250, dodgeBullets: true }
}
```

The `Enemy` class becomes a thin orchestrator: `this.movement.execute()`, `this.firing.execute()`, `this.renderer.draw()`.

**Step 6.1: Extract Enemy Config** (~200 lines) — **DONE (v5.9.0)**
- Moved `ENEMY_TYPES` from `enemy.js` to `js/modules/entities/enemy-data.js`
- Expanded each type's config with `movement`, `firing`, `visual`, and `ai` parameter blocks
- Added `ENEMY_TYPE_KEYS` and `SHAPE_DRAW_MAP` convenience exports
- `enemy.js` imports from `enemy-data.js` and re-exports `ENEMY_TYPES` for backward compat
- Pure data extraction — no behavior change

**Step 6.2: Movement Strategy Extraction** (~2,170 lines extracted) — **DONE (v5.10.0)**
- Created `js/modules/systems/enemy-movement.js` with 36 exported functions
- Extracted all 28 movement patterns + 8 helper functions using `.call(this)` delegation
- `enemy.js` methods become one-liner delegators; `updateMovement()` switch unchanged
- `enemy.js` reduced from 6,544 to 4,443 lines (32% reduction)
- Future step: consolidate into composable primitives + registry dispatch (replacing switch)

**Step 6.3: Firing Strategy Extraction** (~1,177 lines extracted) — **DONE (v5.11.0)**
- Created `js/modules/systems/enemy-firing.js` with 38 exported functions
- Extracted all shooting patterns, burst/sweep/sentinel state machines, lightning generation, and `createEnemyBullet` factory
- Drawing methods (`drawLightningBolt`, `drawSweepLaser`) and `updateShooting` dispatcher remain in enemy.js
- `enemy.js` reduced from 4,443 to 3,393 lines (24% reduction, 49% from original)
- Future step: consolidate into parameterized strategies + registry dispatch

**Step 6.4: Enemy Shape Renderers** (~1,807 lines extracted) — **DONE (v5.12.0)**
- Created `js/modules/rendering/enemy-shapes.js` with 25 exported functions
- Extracted all 10 type-specific draw methods + 15 shared rendering utilities (health bar, light trail, targeting effects, laser visuals, sweep laser, warp effect, etc.)
- Main `draw()` orchestrator remains in enemy.js
- `enemy.js` reduced from 3,393 to 1,649 lines (51% reduction, 75% from original)

**Step 6.5: Enemy AI Extraction** (~701 lines extracted) — **DONE (v5.13.0)**
- Created `js/modules/systems/enemy-ai.js` with 21 exported functions
- Extracted face direction, targeting, territory system, evasion, distance maintenance, trail particles, line-of-sight
- `enemy.js` reduced from 1,649 to 1,011 lines (85% from original 6,655)
- Future step: consolidate into unified AI system with configurable weights

**Step 6.6: Slim Enemy Class** (cleanup)
- After 6.1–6.5, enemy.js is at 1,011 LOC (target was ~2,000) — ahead of plan
  - Constructor + `reset()` + `initializeEnemy()` (~300 LOC)
  - `update()` orchestrator (~140 LOC)
  - `draw()` orchestrator (~80 LOC)
  - Warp-in system (~70 LOC)
  - `updateShooting()` dispatcher + `updateMovement()` dispatcher (~110 LOC)
  - `takeDamage()`, `getDestructionReward()`, lifecycle (~40 LOC)
  - One-liner delegators to movement/firing/shapes/AI modules (~100 LOC)
  - `getLevelScaledDamage()` + remaining utilities (~20 LOC)
- Further cleanup: remove remaining type-check conditionals, consolidate dispatchers
- **Risk:** Low (if 6.1–6.5 are done correctly)
- **Test:** Full E2E suite

**Estimated enemy.js reduction: 6,644 → ~2,000 LOC (70% reduction)**

---

### Phase 7: Player Subsystem Extraction (2,263 → 702 LOC) — **DONE (v5.14.0)**

**Motivation:** `player.js` at 2,263 lines mixes movement, weapons, powerups, skills, leveling, charge mechanics, and rendering.

**Step 7.1: Weapon Extraction** (924 lines) — **DONE**
- Created `js/modules/systems/player-weapons.js` with 35 weapon methods
- Charging system, all 5 primary fire methods, 5 power fire methods, bullet creation, charge shot, equip/buy

**Step 7.2: Skill Extraction** (158 lines) — **DONE**
- Created `js/modules/systems/player-skills.js` with 5 skill methods

**Step 7.3+7.4: Progression + Powerups** (284 lines) — **DONE**
- Created `js/modules/systems/player-progression.js` with 18 methods (leveling, powerups, stat getters)

**Step 7.5: Player Renderer** (513 lines) — **DONE**
- Created `js/modules/rendering/player-renderer.js` with 5 draw methods

**Result: player.js 2,263 → 702 LOC (69% reduction, exceeded 56% target)**

---

### Phase 8: Collision & Combat Refinement

**Motivation:** `collision-system.js` (1,142 LOC) has repetitive particle effect spawning and hardcoded physics values. `combat-manager.js` (611 LOC) has bespoke explosion effects per entity type. Both can benefit from shared abstractions.

**Step 8.1: Effect Factory** — **SKIPPED**
- Assessed and deferred: `createDebris` and `createEnemyDebris` share structural patterns but each has entity-specific logic (asteroid hue extraction, line debris from edges, shape-specific debris) that would require extensive parameterization
- Net savings would be ~100 lines with added indirection — not worth the abstraction cost
- The explosion effects are already well-organized in combat-manager.js

**Step 8.2: Collision Config** — **DONE (v5.15.0)**
- Added `COLLISION_CONFIG` object at top of collision-system.js with 15 named constants
- Extracted: `BULLET_KNOCKBACK`, `HIT_FLASH_FRAMES`, `PLAYER_ENEMY_COLLISION_DAMAGE`, `PLAYER_ASTEROID_COLLISION_DAMAGE`, `BOUNCE_RESTITUTION`, `BOUNCE_FORCE_MULTIPLIER`, `OVERLAP_SEPARATION_RATIO`, `ASTEROID_KNOCKBACK_MULTIPLIER`, `SEPARATION_BUFFER`, `OVERLAP_PUSH_FORCE`, `ENEMY_ASTEROID_PUSH`, `ASTEROID_ENEMY_PUSH`
- Extracted `POWERUP_DROP_CHANCE` sub-object with per-entity-type drop rates
- All inline magic numbers replaced with config references
- **Test:** Unit 61/68, QA 94/95 (same baseline)

**Step 8.3: Weapon Effect Collision Modules** — **DONE (v5.15.0)**
- Split `handleWeaponEffectCollisions()` into 7 focused exported functions: `checkLanceBeamCollisions`, `checkMineCollisions`, `checkNovaCollisions`, `checkLightningCollisions`, `checkMissileCollisions`, `checkDeflectorOrbCollisions`, `checkTractorShieldCollisions`
- Each wired via `.call(this)` delegators in game-engine.js
- **Test:** Unit 61/68, QA 94/95 (same baseline)

---

### Phase 9: HUD & UI Decomposition

**Motivation:** `hud-renderer.js` (2,058 LOC) is well-organized but exceeds the 800-line limit by 2.5x. `ui-manager.js` (1,281 LOC) mixes DOM management with game logic. Both can be split by responsibility.

**Step 9.1: Split HUD Renderer by Domain** — **DONE (v5.16.0)**
- Split `hud-renderer.js` (2,058 LOC, 32 functions) into 5 focused modules:
  - `rendering/hud-status.js` (599 LOC, 7 functions) — drawHUD, drawSkillCooldownHUD, drawCanvasTriforce, drawLevelAndCoinsDisplay, drawXPBar, drawLevelUpText, updateHUD
  - `rendering/hud-combat.js` (421 LOC, 6 functions) — drawDamageNumbers, drawTargetInfo, drawPowerupDisplay, drawPowerupIndicators, syncPowerupHUD, drawMoneyPickupDisplay
  - `rendering/hud-navigation.js` (241 LOC, 2 functions) — drawMinimap, drawOffScreenIndicators
  - `rendering/hud-overlays.js` (596 LOC, 12 functions) — drawWavyText, drawTitleScreen, drawSurvivalTimer, drawPauseButton, drawStopwatchIcon, drawSpawnTimer, drawCircularTimer, drawRespawnCountdown, drawInvincibilityCountdown, drawGhostPreviews, drawGhostEnemy, drawGhostAsteroid
  - `rendering/hud-cursor.js` (219 LOC, 5 functions) — drawCustomCursor, drawDefaultCrosshair, drawRedTargetingCursor, drawJitterCircle, drawCursorCooldownTimer
- Original `hud-renderer.js` retained as barrel re-export (8 lines)
- All files under 800-line limit
- **Test:** Unit 61/68, QA 94/95 (same baseline)

**Step 9.2: UI Manager Cleanup** — **ASSESSED, DEFERRED**
- Reviewed `ui-manager.js` (1,281 LOC): no significant stale code, commented-out code, or obvious extraction targets found
- The file is well-organized at its current size; splitting would add indirection without clear benefit
- Will revisit if UIManager grows beyond ~1,500 LOC

**Step 9.3: HUD Theme Config** (~0 new LOC, data extraction)
- Extract hardcoded colors, font sizes, and positions into a `HUD_THEME` config object
- Centralizes visual tuning: `HUD_THEME.healthBar.color`, `HUD_THEME.xpBar.gradient`, etc.
- Enables future theme/skin support
- **Risk:** Low — no behavior change
- **Test:** Visual inspection

---

### Phase 10: Data-Driven Polish & Utilities

**Step 10.1: Wave Subtitle Externalization** — **DONE (v5.16.1)**
- Moved 50 wave-specific subtitles and 15 generic fallback subtitles from `wave-manager.js` to `wave-data.js`
- Exported as `WAVE_SUBTITLES` and `WAVE_SUBTITLES_GENERIC`
- `getWaveSubtitle()` reduced from 75 LOC to 3 LOC
- Pure data relocation, no behavior change
- **Test:** Unit 61/68 (same baseline)

**Step 10.2: Split Utils** (~750 LOC → 3-4 focused files)
- `js/modules/math-utils.js` — `random()`, vector math, angle helpers
- `js/modules/collision-utils.js` — `collision()`, `starCollision()`, swept detection
- `js/modules/asset-cache.js` — icon caching, sprite caching, `glowSpriteCache`
- Keep `utils.js` as a re-export barrel: `export { random } from './math-utils.js'` (backward compat)
- **Risk:** Low — no behavior change, just file organization
- **Test:** Unit tests pass unchanged

**Step 10.3: Enemy Bullet Pattern Composition**
- Refactor `enemy-bullet.js` (977 LOC) movement patterns from 12-case switch to registry pattern (same as enemy movement)
- Enable pattern composition: a bullet could have `homing + boomerang` instead of requiring a new hardcoded pattern
- **Risk:** Medium — bullet behavior affects gameplay
- **Test:** E2E tests

---

### Extended Extraction Priority Table

| Priority | Module | Lines | Risk | Status |
|----------|--------|-------|------|--------|
| 6.1 | Enemy Config (enemy-data.js) | ~319 extracted | Low | **DONE** (v5.9.0) |
| 6.2 | Movement Strategies | ~2,174 extracted | Medium | **DONE** (v5.10.0) |
| 6.3 | Firing Strategies | ~1,177 extracted | Medium | **DONE** (v5.11.0) |
| 6.4 | Enemy Shape Renderers | ~1,807 extracted | Low | **DONE** (v5.12.0) |
| 6.5 | Enemy AI Module | ~701 extracted | Medium | **DONE** (v5.13.0) |
| 6.6 | Slim Enemy Class | cleanup | Low | **DONE** (exceeded target: 1,011 LOC vs 2,000 target) |
| 7.1 | Player Weapons | ~924 extracted | Medium | **DONE** (v5.14.0) |
| 7.2 | Player Skills | ~158 extracted | Low | **DONE** (v5.14.0) |
| 7.3+7.4 | Player Progression | ~284 extracted | Low | **DONE** (v5.14.0) |
| 7.5 | Player Renderer | ~513 extracted | Low | **DONE** (v5.14.0) |
| 8.1 | Effect Factory | ~200 new | Low | **SKIPPED** (over-engineering for ~100 LOC savings) |
| 8.2 | Collision Config | cleanup | Low | **DONE** (v5.15.0) |
| 8.3 | Weapon Effect Modules | 7 functions split | Low | **DONE** (v5.15.0) |
| 9.1 | Split HUD Renderer | 2,058 → 5 files | Low | **DONE** (v5.16.0) |
| 9.2 | UI Manager Cleanup | cleanup | Low | **DEFERRED** (1,281 LOC is clean, no clear targets) |
| 9.3 | HUD Theme Config | data extraction | Low | Optional |
| 10.1 | Wave Subtitles → Data | data move | None | **DONE** (v5.16.1) |
| 10.2 | Split Utils | reorganize | Low | Optional (750 LOC, under 800-line limit) |
| 10.3 | Enemy Bullet Patterns | refactor | Medium | Optional |

### Achieved Metrics

| File | Original LOC | Current LOC | Reduction | Notes |
|------|-------------|------------|-----------|-------|
| game-engine.js | 7,746 | 1,268 | **84%** | Core orchestrator |
| enemy.js | 6,655 | 1,011 | **85%** | Exceeded 70% target |
| player.js | 2,263 | 702 | **69%** | Exceeded 56% target |
| hud-renderer.js | 2,058 | 8 (barrel) | **100%** | Split into 5 modules (219-599 LOC each) |
| collision-system.js | 1,142 | ~1,180 | — | Config extracted, weapon effects split into 7 functions |
| ui-manager.js | 1,281 | 1,281 | — | Assessed, no actionable cleanup found |
| **New files created** | | **16** | | 5 enemy, 4 player, 5 HUD, 1 enemy-data, 1 collision config |

### Execution Notes (v5.5.0)

**Approach used: `.call(this)` delegation pattern**

Rather than immediately refactoring all `this.` references inside extracted methods, we used a pragmatic strangler fig technique:
1. Method bodies are copied **unchanged** into the new module file as exported functions
2. In GameEngine, each method becomes a one-line delegator: `method() { return module.method.call(this); }`
3. All `this.*` references inside the extracted functions still resolve against the GameEngine instance

This preserves 100% behavioral compatibility while physically relocating code to smaller, focused files. The `.call(this)` bridge can be removed in Phase 4 when methods are updated to use a `GameContext` object instead.

**State machine integration via getter/setter**

Instead of changing all 38 `this.game.state === X` read sites, we used `Object.defineProperty` to make `this.game.state` a getter/setter that delegates to the state machine:
- Reads (`this.game.state === GAME_STATES.PLAYING`) work unchanged — the getter returns `stateMachine.state`
- Writes (`this.game.state = GAME_STATES.PLAYING`) go through `stateMachine.transition()` with validation

This eliminated the need to change any read-side code while adding full transition validation.

**GameTimer timing consideration**

Replacing `setTimeout` with `GameTimer` changes wall-clock timing behavior: `setTimeout(fn, 2000)` fires after 2000ms real time regardless of frame rate, while `GameTimer(2000)` requires 2000ms of accumulated game ticks. In headless test environments (lower frame rate), game timers take longer wall-clock to complete. This is actually the **correct** behavior (timers should respect game time, not wall time), but some E2E tests that relied on wall-clock timing became slightly flakier. `startGame()` helpers already wait for the PLAYING state transition, so this is handled.

---

## 5. Style Rules & Conventions

### 5.1 File Organization

```
js/
  modules/
    core/                       ← Foundation (Phase 1 — DONE)
      game-state.js             ← state machine (127 lines)
      event-bus.js              ← pub/sub (46 lines)
      game-timer.js             ← frame-counted timer (79 lines)
    systems/                    ← Stateful systems (Phase 3 — DONE)
      camera-manager.js         ← camera, shake, kick, flash (109 lines)
      collision-system.js       ← all collision detection & response (1,142 lines)
      combat-manager.js         ← debris, orbs, powerups, kill streaks, damage numbers (611 lines)
      event-setup.js            ← all event listeners: input, shop, cheats, resize (434 lines)
      player-lifecycle.js       ← damage, death, respawn, shield tanks (379 lines)
      shop-manager.js           ← shop logic, purchase, tabs (528 lines)
      wave-manager.js           ← wave lifecycle, spawning, notifications (616 lines)
    rendering/                  ← Read-only renderers (Phase 2 — DONE)
      hud-renderer.js           ← all HUD draw methods (2,058 lines)
      shop-renderer.js          ← shop window rendering (619 lines)
      weapon-effects-renderer.js ← beam, mines, nova, lightning, missiles, skills (196 lines)
    game-engine.js              ← orchestrator (1,681 lines, target <500)
    entities/                   ← unchanged
    performance/                ← unchanged
    constants.js
    utils.js
    weapon-data.js
    wave-data.js
    ...
```

### 5.2 File Size Limits

- **Hard limit: 800 lines per file.** If a file exceeds this, it is doing too much and should be split.
- **Exception:** Entity files with complex behavior per type (e.g., `enemy.js` with 10 enemy types) may exceed this if each type's logic is clearly sectioned with headers. Consider splitting into `enemy-types/` directory if it grows further.

### 5.3 Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| Manager class | `*Manager` | `WaveManager`, `ShopManager` |
| System class | `*System` | `CollisionSystem` |
| Renderer class | `*Renderer` | `HUDRenderer` |
| Pure logic module | `*-logic.js` | `wave-logic.js`, `shop-logic.js` |
| Event names | `'domain:action'` | `'enemy:killed'`, `'wave:complete'` |
| Timer durations | `*Duration` | `waveCountdownDuration` |
| Timer state | `*Remaining` or `*Elapsed` | `waveCountdownRemaining` |
| Boolean state | `is*` or `has*` | `isWaveComplete`, `hasShield` |
| Pool references | `*Pool` | `bulletPool`, `enemyPool` |

### 5.4 State Mutation Rules

1. **Only a manager may write its own state.** `WaveManager` is the only code that writes `currentWave`, `waveComplete`, etc. Other systems read these values but never assign them.
2. **Game state is only written by `GameStateMachine.transition()`.** No direct `this.game.state = X` anywhere.
3. **Player stats are modified through Player methods.** No reaching in with `player.health -= damage` from collision code. Call `player.takeDamage(amount)` and let Player handle shield absorption, invincibility checks, and death.
4. **Cross-system state changes use events or explicit method calls** on the owning manager. Never reach into another manager's internal state.
5. **Pool mutations are explicit.** Spawning goes through the owning manager (SpawnManager), not directly through `pool.get()` from arbitrary code.

### 5.5 Timing Rules

1. **No `setTimeout` for game logic.** Use `GameTimer` instances that only advance when `tick(dt)` is called during the appropriate game state.
2. **`setTimeout` is acceptable for:** visual-only effects (explosions, notifications, screen flash) that should play out regardless of game state.
3. **All durations are constants** defined in `constants.js` or the owning manager's config, not magic numbers inline.

### 5.6 Dependency Rules

1. **No `window.gameEngine` or other game-state globals.** All dependencies are passed via constructor (GameContext) or method parameters.
2. **No circular references.** If A needs B and B needs A, introduce an event or a shared interface.
3. **Entities receive slim interfaces, not the full game engine.** `enemy.update(dt, { player, bulletPool, gameField })` — not the entire context.
4. **Managers depend on GameContext, not on each other.** If `ShopManager` needs to know the current wave, it reads `context.waveManager.currentWave`, not `this.gameEngine.waveManager.currentWave`.

### 5.7 Documentation Standard

- Each manager/system/renderer file gets a **3-5 line JSDoc block** at the top describing: what it owns, what events it emits, and what events it listens to.
- **Comment the "why", never the "what."** No `// increment counter` above `counter++`.
- **No inline documentation for obvious code.** Only comment when the logic is non-obvious, a workaround, or reflects a design decision that someone might question later.
- **Each extracted module gets a brief header** in this format:

```javascript
/**
 * WaveManager — owns wave state, progression, and completion detection.
 *
 * Emits: 'wave:complete', 'wave:started'
 * Listens: 'enemy:killed' (to track remaining enemies)
 */
```

---

## 6. Testing Strategy

### 6.1 Current Test Infrastructure

The test infrastructure is already strong:

- **68 Jest unit tests** — pool, wave, math
- **95 Playwright QA smoke tests** — comprehensive smoke coverage
- **E2E suite** — survival, weapon economy, enemy types
- **AI playtester** — reactive bot with weapon switching
- **Microbenchmarks** — mitata-based performance tests

### 6.2 Testing During Refactor

**Rule: Run the full QA suite after every extraction.** Each extracted manager must pass all existing tests before moving to the next extraction. No "we'll fix the tests later."

**For each extraction:**
1. Move code to new file
2. Add delegation calls in GameEngine
3. Run `npm run test:qa` — must pass (94/95, pre-existing particle bug excluded)
4. Run relevant E2E tests
5. Commit

### 6.3 New Test Targets

**Pure logic modules** (extracted during refactor) should get Jest unit tests:

- `wave-logic.js` — test `getWaveConfig()` for all 100 waves, verify enemy counts, verify level formulas
- `shop-logic.js` — test `canAfford()`, `applyPurchase()`, wave-gating logic
- `collision-logic.js` — test hit detection with mock positions/radii
- `game-state.js` — test all valid transitions, test rejection of invalid transitions, test epoch guards

**Integration tests** remain in Playwright QA suite. Do not try to unit-test rendering — visual correctness is best verified by the AI playtester.

### 6.4 Pool Exhaustion Testing

Add a **pool monitor** to PoolManager:

- Track `highWaterMark` (peak active count)
- Track `growCount` (times pool had to allocate a new object beyond initial size)
- Add a Jest test that simulates all 100 wave configs and verifies no pool exhaustion occurs with the current initial sizes

---

## 7. Performance Guardrails

### 7.1 What Won't Hurt Performance

- **Splitting files** — V8 JITs based on function size and call frequency. Smaller, focused functions are more likely to be optimized. A 7,746-line class is a deoptimization risk.
- **Context object access** — `context.player.x` is one extra property lookup vs `this.player.x`. V8 inlines this after a few iterations.
- **Manager method calls** — `this.waveManager.update(dt)` vs inline code has negligible overhead at 60Hz.

### 7.2 What Will Hurt Performance (Avoid)

- **Events in hot paths** — Do NOT use `eventBus.emit()` inside collision detection loops, per-frame entity updates, or rendering. These run thousands of times per second. Use direct method calls.
- **Closures in hot paths** — Do NOT create new closures inside `update()` or `handleCollisions()` on every tick. Allocate them once in the constructor.
- **Getter/setter indirection on pools** — Pool iteration must remain direct `for` loops over `pool.activeObjects`. Do not wrap in iterators, generators, or event dispatches.
- **Canvas state changes** — When extracting renderers, maintain the current pattern of grouping draws by blend mode/composite operation. Minimize `ctx.save()`/`ctx.restore()` and `globalCompositeOperation` changes.

### 7.3 Performance Monitoring

- Run `npm run perf` (mitata microbenchmarks) before and after each major extraction
- Run `npm run test:e2e` survival test and check FPS samples
- Use the existing `measureFrameStats()` helper to verify P95 frame times don't regress
- If any extraction causes a measurable regression (>5% P95 frame time increase), investigate before proceeding

### 7.4 Pool Sizing Audit

After refactor, use the high-water-mark data to right-size pool allocations:

| Pool | Current Initial | Recommendation |
|------|----------------|----------------|
| bulletPool | 10 | Check HWM — likely needs 30-50 |
| particlePool | 50 | Capped at MAX_PARTICLES=50, correct |
| asteroidPool | 5 | Check HWM — waves request up to 12 |
| enemyPool | 5 | Check HWM — waves can have 6-8 enemies |
| enemyBulletPool | 20 | Check HWM — spiral/burst patterns may exceed |
| colorStarPool | 35 | Check HWM |
| backgroundStarPool | 120 | Likely oversized for small screens |
| powerupPool | 5 | Check HWM |
| lineDebrisPool | 20 | Add cap like particles — cosmetic only |

### 7.5 MAX_ASTEROIDS Decision

Current `MAX_ASTEROIDS = 4` silently caps asteroid spawning. Waves 25, 36, 56, 64, 78, 86 request 8-12 asteroids but only 4 spawn. This needs a decision:

- **Option A:** Increase MAX_ASTEROIDS to 12 and accept the performance cost (more collision checks, more rendering)
- **Option B:** Keep MAX_ASTEROIDS at 4 and adjust wave configs to never request more than 4 (making wave data honest)
- **Option C:** Make MAX_ASTEROIDS scale with device capability (desktop gets 12, mobile gets 4)

Document the decision in `constants.js` above the constant definition.

---

---

## 8. Feature & Optimization Preservation

### 8.1 Performance Module Inventory

The `js/modules/performance/` directory contains 16 modules. Only 3 are actively integrated into the game. The remaining 13 are dead code — implemented but never wired in or subsequently disconnected.

**Actively Used (3):**

| Module | Lines | Purpose | Integration Point |
|--------|-------|---------|-------------------|
| `spatial-grid.js` | 96 | Broad-phase collision — grid-based spatial partitioning | `game-engine.js` collision detection |
| `depth-batch-renderer.js` | 263 | Batches draw calls by depth layer to reduce state changes | `game-engine.js` render loop |
| `nebula-renderer.js` | 137 | Procedural background nebula effects | `game-engine.js` background rendering |

**Dead Code (13):**

| Module | Lines | Purpose | Why Unused |
|--------|-------|---------|------------|
| `performance-manager.js` | 175 | FPS monitoring, auto-quality adjustment | Never wired in |
| `enhanced-performance-manager.js` | 312 | Extended perf manager with profiling | Never wired in |
| `render-batch.js` | 143 | Generic render batching | Superseded by depth-batch-renderer |
| `particle-system-wrapper.js` | 89 | Wrapper for particle pooling | Never integrated |
| `typed-array-particles.js` | 201 | SoA particle storage with typed arrays | Never integrated |
| `text-cache.js` | 134 | Off-screen canvas text caching | Disconnected |
| `path-cache.js` | 112 | Canvas path object caching | Never integrated |
| `canvas-layers.js` | 187 | Multi-canvas layered rendering | Never integrated |
| `frustum-culling.js` | 98 | Viewport frustum culling | Never integrated |
| `quadtree.js` | 156 | Quadtree spatial partitioning | Replaced by spatial-grid |
| `optimized-entities.js` | 178 | Entity archetype pooling | Never integrated |
| `optimized-pool-manager.js` | 203 | Enhanced pool with typed arrays | Never integrated |
| `temporal-upsampling.js` | 167 | Frame interpolation for low-FPS | Never integrated |

### 8.2 Performance Module Integration Strategy

During refactor, evaluate and integrate useful dead-code modules in tiers:

**Tier 1 — Integrate During Refactor (High Value, Low Risk):**

- **`text-cache.js`** → Integrate into `HUDRenderer` extraction. HUD draws 50+ text strings per frame with the same font/size. Caching these on off-screen canvases eliminates redundant `fillText()` calls. Benchmark before/after with mitata.
- **`spatial-grid.js`** → Already active. During `CollisionSystem` extraction, ensure the grid API is clean and the cell size is tuned (currently hardcoded).
- **`depth-batch-renderer.js`** → Already active. During renderer extractions, verify batch boundaries align with the new module structure.

**Tier 2 — Evaluate After Refactor (Medium Value, Needs Measurement):**

- **`path-cache.js`** → Profile whether complex entity shapes (asteroids, enemies) benefit from cached `Path2D` objects. Useful if `draw()` calls rebuild paths every frame.
- **`frustum-culling.js`** → Profile whether off-screen entities are a significant render cost. With the current camera system, most entities are on-screen.
- **`typed-array-particles.js`** → Profile whether SoA particle storage improves cache performance over the current AoS pool. Only valuable if particle counts are high (100+).

**Tier 3 — Likely Remove (Low Value or Superseded):**

- **`quadtree.js`** → Superseded by `spatial-grid.js`. Delete unless benchmarks show quadtree is faster for the game's entity density.
- **`render-batch.js`** → Superseded by `depth-batch-renderer.js`. Delete.
- **`performance-manager.js`** and **`enhanced-performance-manager.js`** → If auto-quality adjustment is desired, build it fresh into the new architecture. These are too tightly coupled to the old structure.
- **`canvas-layers.js`** → Multi-canvas rendering adds DOM complexity. Only viable if profiling shows compositing is a bottleneck.
- **`temporal-upsampling.js`** → Frame interpolation is complex and fragile. Not worth the risk unless targeting low-end devices.
- **`optimized-entities.js`** and **`optimized-pool-manager.js`** → Premature optimization. The current pool + class hierarchy works well at this entity count.
- **`particle-system-wrapper.js`** → Too thin to justify. Inline any useful logic.

### 8.3 Feature Preservation Checklist

Every extraction must preserve the following features. Run these checks after each Phase:

| Feature | Verification Method |
|---------|-------------------|
| 7 game states + transitions | QA state tests + manual pause/shop/gameover |
| 10 enemy types with distinct AI | E2E enemy tests (`npm run test:e2e:enemies`) |
| 5 primary weapons + 5 power weapons + 6 skills | QA weapon tests (07-weapons.spec.js) |
| Shop with 6 tabs, purchase/equip/sell | QA + E2E weapon economy tests |
| Wave progression (100 waves) | QA wave tests + E2E survival |
| Wave-gated weapon unlocks | E2E weapon economy (wave-gating test) |
| Powerup system (8 types) | E2E powerup tests |
| Object pooling (10 pools) | Unit pool tests + HWM monitoring |
| Spatial grid collision | Unit collision tests + E2E gameplay |
| Depth-batched rendering | Visual smoke test + FPS benchmarks |
| Nebula background | Visual smoke test |
| Starfield parallax | Visual smoke test |
| Screen shake / camera effects | Visual test during explosions |
| Mobile touch controls | Manual mobile test |
| Pause menu with tabs | QA pause menu tests |
| Music system | QA music tests |
| Combo / kill streak system | E2E combat tests |
| XP / skill point system | E2E economy tests |

### 8.4 Feature Flag Pattern for Integration

When integrating Tier 2 performance modules, use a feature flag pattern to allow A/B comparison:

```javascript
// In constants.js
export const PERF_FLAGS = {
    TEXT_CACHE: true,      // Tier 1 — enabled by default after validation
    PATH_CACHE: false,     // Tier 2 — enable for benchmarking
    FRUSTUM_CULL: false,   // Tier 2 — enable for benchmarking
    TYPED_PARTICLES: false // Tier 2 — enable for benchmarking
};
```

Each flag gates the optimized code path with a zero-cost fallback (the current code). Once a module is validated, remove the flag and the fallback — feature flags are temporary, not permanent.

---

## 9. Multi-SKU Deployment Architecture

### 9.1 Platform Abstraction Layer

The current codebase has platform-specific code scattered across 7+ files (`isMobile()` checks, touch event handlers, haptics, pause button visibility). The refactor must consolidate this behind a `PlatformAdapter` interface.

**Current Platform-Specific Code:**

| Location | Platform Logic |
|----------|---------------|
| `input-handler.js` | Touch event listeners, `isMobile()` branch |
| `game-engine.js` (7+ locations) | `isMobile()` for UI sizing, pause button, HUD layout |
| `game-engine.js` (touch handlers) | ~150 lines of touch-specific shop/game interaction |
| `ui-manager.js` | Mobile-specific DOM elements |
| `player.js` | Touch aim direction |
| `entities/enemy.js` | `window.gameEngine` fallback for gameField |
| `audio-manager.js` | AudioContext resume on user gesture (mobile Safari) |

**Target Architecture:**

```javascript
// js/modules/platform/platform-adapter.js
class PlatformAdapter {
    get isMobile() { }
    get hasTouch() { }
    get hasGamepad() { }
    get screenScale() { }      // DPR-adjusted
    get safeAreaInsets() { }    // notch/island padding
    get storageBackend() { }   // localStorage, electron-store, capacitor-prefs
    get haptics() { }          // vibration API or no-op
    get orientation() { }      // lock support
    canFullscreen() { }
    requestFullscreen() { }
    exitFullscreen() { }
}
```

**Platform-Specific Adapters:**

```
js/modules/platform/
    platform-adapter.js      ← base class / interface
    web-adapter.js            ← browser (default)
    pwa-adapter.js            ← extends web, adds install prompt, offline
    electron-adapter.js       ← Node integration, fs storage, native menus
    capacitor-adapter.js      ← mobile native (iOS/Android)
    tauri-adapter.js          ← Rust backend, fs storage
```

Each adapter is a thin wrapper (~50-100 lines) over platform APIs. The game code never checks `isMobile()` directly — it queries `platform.hasTouch`, `platform.screenScale`, etc.

**Integration into refactor plan:** Create the `PlatformAdapter` during Phase 1 (Step 1.4) alongside the other foundation modules. It has zero risk since it's replacing scattered `isMobile()` checks with a single interface.

### 9.2 Input Abstraction

The current `InputHandler` mixes keyboard, mouse, and touch into a single class with platform branches. Gamepad support is entirely missing. The refactor should adopt a 3-layer input model:

**Layer 1: Input Collectors** — one per input source, each normalizes raw events into a common `InputState`:

```
KeyboardCollector  → { move: {x,y}, aim: {x,y}, fire, power, pause, ... }
MouseCollector     → { aim: {x,y}, fire, ... }
TouchCollector     → { move: {x,y}, aim: {x,y}, fire, power, ... }  (dual-stick)
GamepadCollector   → { move: {x,y}, aim: {x,y}, fire, power, pause, shop, ... }
```

**Layer 2: Action Map** — merges all active collectors into a single canonical `ActionMap`:

```javascript
const actions = {
    move: { x: 0, y: 0 },     // normalized direction
    aim:  { x: 0, y: 0 },     // world-space aim point
    fire: false,
    power: false,
    pause: false,
    shop: false,
    skill: [false, false, false, false],
};
```

Priority when multiple sources conflict: last-active-source wins. If the player touches the screen, touch overrides keyboard. If they press a key, keyboard overrides touch.

**Layer 3: Consumer** — game systems read only the `ActionMap`, never raw events. `Player.update(dt, actions)`, not `Player.update(dt, input, mouse, touch)`.

**Gamepad mapping (new):**

| Button | Action |
|--------|--------|
| Left stick | Move |
| Right stick | Aim direction |
| Right trigger | Fire primary |
| Left trigger | Fire power weapon |
| A/Cross | Confirm (shop) |
| B/Circle | Back / Close shop |
| Start | Pause |
| Select | Open shop |
| D-pad | Navigate shop items |
| Bumpers | Switch shop tabs |

### 9.3 Asset Pipeline for Multi-SKU

**Problem:** The game currently loads assets from CDN (sfxr.js, Google Fonts) and has 336MB of music files. Different SKUs need different asset strategies.

**Vendoring Strategy:**

```
assets/
    vendor/
        sfxr.min.js        ← vendored, no CDN dependency
        press-start-2p.woff2  ← vendored Google Font
    music/
        web/               ← opus/ogg, streaming from CDN or server
        mobile/            ← compressed AAC, bundled (subset of tracks)
        desktop/           ← full quality, local files
    sfx/                   ← generated at build time from sfxr seeds
```

**Build-time asset selection:**

```javascript
// vite.config.js
const ASSET_PROFILES = {
    web:     { musicFormat: 'opus', musicSource: 'cdn', fontSource: 'vendor' },
    pwa:     { musicFormat: 'opus', musicSource: 'cache-first', fontSource: 'vendor' },
    desktop: { musicFormat: 'flac', musicSource: 'local', fontSource: 'vendor' },
    mobile:  { musicFormat: 'aac', musicSource: 'bundled-subset', fontSource: 'vendor' },
};
```

**Critical blocker resolution:**
- **sfxr CDN** → Vendor the library. Generate SFX at first launch and cache in localStorage/IndexedDB.
- **Google Fonts CDN** → Vendor `Press Start 2P` as a .woff2 file. Self-host in all SKUs.
- **Music file size (336MB)** → Compress per-platform. Mobile gets a curated subset. Desktop/Steam gets full library. Web streams on demand.

### 9.4 Build Pipeline

Use Vite with platform defines for tree-shaking platform-specific code:

```javascript
// vite.config.js
export default defineConfig(({ mode }) => ({
    define: {
        __PLATFORM__: JSON.stringify(mode), // 'web' | 'pwa' | 'electron' | 'capacitor' | 'tauri'
    },
    build: {
        outDir: `dist/${mode}`,
    },
}));
```

Platform adapter selection at build time:

```javascript
// js/modules/platform/index.js
let adapter;
if (__PLATFORM__ === 'electron') {
    adapter = new (await import('./electron-adapter.js')).default();
} else if (__PLATFORM__ === 'capacitor') {
    adapter = new (await import('./capacitor-adapter.js')).default();
} else {
    adapter = new (await import('./web-adapter.js')).default();
}
export default adapter;
```

Dead platform code is tree-shaken by Vite — the electron adapter is never bundled in the web build.

### 9.5 Configuration & Settings Architecture

**Config cascade:** Base → Platform → User preferences.

```javascript
// constants.js (base config — all platforms)
export const BASE_CONFIG = {
    MAX_PARTICLES: 50,
    MAX_ASTEROIDS: 12,
    TARGET_FPS: 60,
    MUSIC_VOLUME: 0.7,
    SFX_VOLUME: 0.8,
    // ...
};

// platform overrides (applied at startup)
const PLATFORM_OVERRIDES = {
    mobile: { MAX_PARTICLES: 30, MAX_ASTEROIDS: 4, TARGET_FPS: 30 },
    desktop: { MAX_ASTEROIDS: 12 },
    web: { /* base is fine */ },
};

// user preferences (persisted via platform storage)
// Applied last, overrides everything
```

**Storage abstraction:**

```javascript
class SettingsManager {
    constructor(platformAdapter) {
        this.storage = platformAdapter.storageBackend;
    }
    get(key) { /* base → platform → user cascade */ }
    set(key, value) { /* persists to platform storage */ }
}
```

This lets the same settings UI work across all platforms while each platform persists differently (localStorage for web, electron-store for desktop, Capacitor Preferences for mobile).

---

## 10. Coding Rules for All Future Updates

These rules apply to **all code changes** in the Rainboids project, whether part of the refactor or independent feature work. They are designed to be used as standing instructions.

### 10.1 Entity & Game Object Rules

1. **Entity lifecycle:** All game entities (enemies, bullets, asteroids, powerups, particles) must use the pool pattern. Never `new Entity()` during gameplay — always `pool.get()` and `pool.release()`.
2. **Entity reset:** Every entity class must have a `reset()` method that fully reinitializes all properties. Pool `get()` must call `reset()` — stale state from previous use is a common bug source.
3. **Entity update signature:** `update(dt, context)` where `context` is a plain object containing only what the entity needs. Never pass the full game engine or game context.
4. **Entity draw signature:** `draw(ctx)` — entities draw themselves. No external code should reach into entity internals to render them.
5. **No entity self-registration:** Entities must not add themselves to pools, event buses, or global registries. The spawning system handles registration.
6. **Entity type constants:** Use frozen constant objects (e.g., `ENEMY_TYPES`, `WEAPON_TYPES`), not string literals scattered through code. Define once in data files, import everywhere.

### 10.2 Memory & Allocation Rules

1. **Zero allocations in hot paths.** The `update()` and `draw()` loops must not create objects, arrays, closures, or strings that become GC pressure. Pre-allocate reusable objects in constructors or module scope.
2. **Reusable math vectors.** Use pre-allocated `{ x, y }` objects for intermediate calculations. Never `const v = { x: ..., y: ... }` inside a per-frame loop.
3. **String concatenation in draw loops:** Cache formatted strings (scores, timers, wave numbers) and only rebuild when the underlying value changes. Use `text-cache.js` for frequently drawn static text.
4. **Array reuse:** Prefer `array.length = 0` over `array = []` for clearing arrays that are reused each frame. The former avoids GC; the latter creates a new array.
5. **Pool sizing:** Initial pool sizes must be documented with rationale. When adding a new pool, add a corresponding entry to the pool sizing table in this document (§7.4).

### 10.3 Canvas Rendering Rules

1. **Minimize context state changes.** Group draws by `fillStyle`, `strokeStyle`, `globalAlpha`, `globalCompositeOperation`, and `font`. Each state change forces a GPU flush on hardware-accelerated canvases.
2. **Batch by depth layer.** Use the `depth-batch-renderer` for all entity drawing. Entities register their draw calls at a depth layer; the renderer executes them in order with minimal state changes.
3. **`save()`/`restore()` budget:** Maximum 5 `save()`/`restore()` pairs per frame in any single renderer module. If you need more, restructure the draw order.
4. **Font caching:** Never call `ctx.font = ...` with a string that hasn't changed since the last assignment. Store the current font in a variable and only set it when switching.
5. **Off-screen culling:** Before drawing any entity, check if it's within the visible viewport (with margin). Skip draw calls for off-screen entities. This is especially important for bullets and particles.
6. **No `ctx.measureText()` in draw loops.** Measure text dimensions once when the text changes, cache the result, and use the cached width for layout.
7. **Pixel-aligned coordinates:** Round draw coordinates to integers (`| 0` or `Math.round()`) to avoid sub-pixel anti-aliasing blur, which is both visually worse and slower.

### 10.4 Error Handling Rules

1. **Fail fast at boundaries.** Validate inputs at system boundaries (user input, external APIs, file loading, pool retrieval). Once validated, internal code trusts its inputs.
2. **No silent failures.** If something unexpected happens (pool exhaustion, invalid state, missing data), log a warning with context. Never silently `return` or use fallback values without logging.
3. **No try/catch in hot paths.** Try/catch prevents V8 optimization of the containing function. Handle errors before they reach hot paths, or let them propagate to a top-level handler.
4. **Game loop resilience:** The `requestAnimationFrame` loop must never throw. Wrap the top-level `gameLoop()` in a try/catch that logs the error and attempts to continue. A crash in one frame should not kill the game.
5. **Asset loading errors:** Missing assets must produce a visible placeholder (bright magenta rectangle for sprites, silence for audio) and a console warning. Never let a missing asset cause a runtime error.

### 10.5 Cross-Cutting Concern Rules

1. **Audio calls go through AudioManager.** No direct `Audio()` constructor or Web Audio API calls from game logic. AudioManager handles context creation, user-gesture gating, volume control, and muting.
2. **UI updates go through UIManager or Renderers.** No direct DOM manipulation from game logic. Canvas HUD drawing goes through the appropriate Renderer module.
3. **Persistence goes through SettingsManager.** No direct `localStorage` calls from game logic.
4. **Platform queries go through PlatformAdapter.** No direct `navigator.userAgent`, `window.innerWidth`, or feature detection from game logic.
5. **Timing goes through GameTimer.** No `setTimeout` or `setInterval` for game-logic timing. Visual-only timing (animations, notifications) may use `setTimeout` but should prefer the render-loop tween pattern.

### 10.6 Performance Budget Rules

1. **Frame time budget:** 16.67ms total (60 FPS target). Breakdown:
   - Update logic: ≤ 4ms
   - Collision detection: ≤ 3ms
   - Rendering: ≤ 8ms
   - Overhead (GC, browser, compositor): ≤ 1.67ms
2. **Entity count limits:** Enforce hard caps on all entity types. Caps are defined in `constants.js` and documented with rationale (performance vs gameplay).
3. **Benchmark before merging:** Any change touching collision, rendering, or entity update paths must include before/after `npm run perf` results in the commit message or PR description.
4. **Mobile performance:** Target 30 FPS on mid-range mobile (2020-era). Platform overrides in §9.5 reduce particle counts and entity caps for mobile.
5. **Startup time:** Game must be interactive within 3 seconds on desktop, 5 seconds on mobile. Asset loading must be progressive — show the title screen before all assets are loaded.

### 10.7 Naming & Style Rules

1. **Classes:** PascalCase. `WaveManager`, `CollisionSystem`, `HUDRenderer`.
2. **Methods & variables:** camelCase. `startNextWave()`, `currentWave`, `isWaveComplete`.
3. **Constants:** UPPER_SNAKE_CASE. `MAX_ASTEROIDS`, `ENEMY_TYPES`, `GAME_STATES`.
4. **Event names:** `'domain:action'` lowercase. `'enemy:killed'`, `'wave:complete'`, `'shop:purchase'`.
5. **File names:** kebab-case. `wave-manager.js`, `collision-system.js`, `hud-renderer.js`.
6. **Private methods:** Prefix with underscore. `_rebuildShopCache()`, `_spawnWaveEntities()`. These are internal implementation details not part of the public API.
7. **Boolean variables:** Prefix with `is`, `has`, `can`, `should`. `isWaveComplete`, `hasShield`, `canFire`.
8. **Numeric variables:** Include unit suffix for durations. `respawnDelayMs`, `invincibilityDurationFrames`.
9. **No magic numbers.** Extract to named constants in `constants.js` or the owning module's config section. Exception: `0`, `1`, `-1`, `2` in obvious arithmetic contexts.
10. **No dead code.** Delete commented-out code, unused imports, and unused functions. Version control preserves history.

### 10.8 Testing Rules

1. **New systems get unit tests.** Any new manager, system, or pure-logic module must have Jest unit tests covering its public API.
2. **Bug fixes get regression tests.** Every bug fix must include a test that would have caught the bug. Add it to the appropriate test suite (unit, QA, or E2E).
3. **Visual changes get QA smoke tests.** Any change to HUD, shop, or menu rendering must pass the relevant QA Playwright tests.
4. **Economy changes get E2E tests.** Any change to costs, rewards, wave progression, or upgrade values must pass the weapon economy E2E test.
5. **No mocking internal modules.** Unit tests should test real implementations. Mock only external dependencies (browser APIs, file system, network). Use the existing `loadGame()`/`startGame()` helpers for integration tests.
6. **Tests must be deterministic.** No `Math.random()` in test setup without seeding. Use fixed seeds or mock random values. Flaky tests are worse than no tests.
7. **AI playtester for gameplay validation.** Use `GameAI` from `tests/helpers/game-ai.js` for tests that need to verify gameplay behavior over time (survival, weapon switching, wave progression).

### 10.9 Git & Versioning Rules

1. **Semantic versioning** per CLAUDE.md — MAJOR.MINOR.PATCH.
2. **One logical change per commit.** Don't combine bug fixes with features. Don't combine refactors with behavior changes.
3. **Update CHANGELOG.md and VERSION** for every code change that affects runtime behavior.
4. **Non-code changes** (docs, planning, memory files) do NOT get version bumps.
5. **Commit messages** are concise and describe the "why", not the "what". The diff shows what changed.

### 10.10 Extraction Rules (Lessons Learned from v5.5.0 — v5.6.0)

1. **Use `.call(this)` delegation for strangler fig extractions.** Move method bodies unchanged to new files as exported functions. In the original class, replace each method with a one-liner: `method() { return module.method.call(this); }`. This eliminates the need to change any `this.` references during extraction, achieving zero behavioral risk.

2. **Use getter/setter bridging for cross-cutting properties.** When a property is read in 30+ locations, use `Object.defineProperty` to add a getter/setter that delegates to the new owner. This avoids touching every read site during initial extraction.

3. **Test after every extraction, not after all extractions.** Run the full QA suite (94 tests) after each module is moved. A green suite before moving to the next extraction is non-negotiable.

4. **GameTimer changes wall-clock timing semantics.** Replacing `setTimeout` with `GameTimer` is semantically correct (game timers should pause with the game) but changes when callbacks fire relative to real time. Tests that depend on wall-clock timing may need their `waitForFunction` timeouts adjusted.

5. **Keep extracted modules' imports minimal.** Each extracted module should only import what its methods actually use. Move imports from game-engine.js to the new file only when they become unused in game-engine.js.

6. **Do not version-bump during extraction — wait until the phase is complete.** A single MINOR version bump covers all extractions in a refactor phase. Bumping after each file move creates unnecessary version churn.

7. **Preserve the delegator methods in GameEngine.** External code (tests, InputHandler, UIManager) may call `gameEngine.openShop()`, `gameEngine.buyShopItem()`, etc. The one-line delegators ensure backward compatibility. Do NOT remove them until all external callers are updated to use the manager directly.

8. **Centralize shared constants instead of hardcoding.** The game field dimensions (1920×1080) were hardcoded in GameEngine's constructor and duplicated as fallback chains (`gameEngine?.gameField?.width || window.gameEngine?.gameField?.width || GameDimensions.width`) in every entity file. Moving field dimensions to `GAME_CONFIG.FIELD_WIDTH/HEIGHT` and wiring `GameDimensions` to read from there eliminated all fallback chains in one step. Lesson: before extracting a system, check if its dependencies can be simplified into shared constants first.

9. **Fix `GameDimensions` to return game field dimensions, not window viewport size.** The `GameDimensions` singleton originally returned `window.innerWidth/innerHeight`, which differs from the fixed 1920×1080 game field. This meant entities falling back to `GameDimensions` would get incorrect boundary values. Always validate that fallback/default values are semantically correct, not just syntactically present.

10. **Remove duplicate initialization code during extraction.** When preparing to extract a system, scan for duplicate code blocks that set identical properties. Enemy shield initialization appeared twice in `initializeEnemy()` (lines 221-229 and 299-307 — identical). The second overwrote the first harmlessly, but duplicate code increases maintenance burden and confusion. Fix these before extracting.

11. **`window.gameEngine` removal is incremental, not all-or-nothing.** Production entity code used `window.gameEngine` for two purposes: (a) gameField dimensions (fixed by centralizing in GameDimensions), and (b) calling back to GameEngine for effects/audio/targeting. Category (a) can be eliminated immediately via constants; category (b) requires passing callbacks through update/draw signatures or using EventBus, which is Phase 4.2 work. Don't block on the harder category — ship the easy wins.

---

## Summary

The core problem is a 7,746-line god object that makes every change risky and every bug hard to isolate. The solution is incremental extraction into focused managers, protected by the existing test suite.

**Priority order:**
1. **GameStateMachine + GameTimer** (eliminate stale setTimeout bugs — the likely source of the wave progression issue)
2. **HUDRenderer** (biggest bang — 2,000 lines moved with zero gameplay risk)
3. **ShopManager** (self-contained, well-tested)
4. **WaveManager** (highest-value — isolates the wave system for independent testing and debugging)
5. **CollisionSystem** (complex but important for long-term maintainability)

**Cross-cutting additions:**
6. **PlatformAdapter** (Phase 1, alongside foundation modules — consolidates scattered platform checks)
7. **Input Abstraction** (Phase 2-3 — enables gamepad support and multi-SKU input)
8. **Performance Module Integration** (Phase 2-5 — integrate Tier 1 modules, evaluate Tier 2, remove Tier 3 dead code)

**Current progress (v5.7.0):** GameEngine reduced from 7,746 to 1,681 lines (78% reduction). Extracted modules: GameStateMachine (127), EventBus (46), GameTimer (79), HUDRenderer (2,058), ShopRenderer (619), CameraManager (109), ShopManager (528), WaveManager (616, was 441), CollisionSystem (1,142), CombatManager (611), PlayerLifecycle (379), WeaponEffectsRenderer (196). GameDimensions now returns fixed game field dimensions. Duplicate enemy shield initialization removed.

**Remaining:** Phase 4.1 (event wiring), Phase 4.2 (GameContext + remaining window.gameEngine removal from entity draw/fire callbacks), Phase 5 (pool audit, pool sizing).

**Target state:** GameEngine drops to ~300-500 lines. Each subsystem is independently testable. State mutations are traceable to their owning manager. setTimeout bugs are eliminated. Platform-specific code is isolated behind adapters. New features and optimizations can be added to isolated modules without risking the entire game. The codebase is ready for multi-SKU deployment with minimal per-platform work.
