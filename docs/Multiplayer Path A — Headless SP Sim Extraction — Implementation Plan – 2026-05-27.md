# Multiplayer Path A — Headless Single-Player Sim Extraction — Implementation Plan – 2026-05-27

> **Goal:** make the multiplayer game **look and play exactly like single-player, with N ships** — by running the **actual SP simulation** authoritatively and headless on the Node server, and rendering MP with the **actual SP renderer**. One codebase, no second sim, no parity drift.
>
> **Status:** plan only. This is the large, high-risk refactor (Path A) that earlier work deliberately deferred. It touches the whole game and **must keep single-player playing byte-identically at every step** — that's the gate. It should be done with the looter-pivot agent paused (it actively edits these files), and validated with human playtests, not just automated tests.
>
> Grounded in a full codebase review (game-engine loop, entity classes, determinism hazards, render stack, systems/state).

---

## 0. The core insight (why this is tractable)

Three facts from the review make this a **refactor, not a rewrite**:

1. **`update()` is already a fixed-timestep tick.** `game-engine.js:update()` (`3729`) advances exactly `GAME_CONFIG.LOGIC_TICK_MS` (60 Hz), driven by an accumulator in `gameLoop()` (`4603–4637`). It reads `LOGIC_TICK_MS` for dt, **not** wall-clock deltas. The headless server just calls a tick function at 60 Hz; no rendering, no `requestAnimationFrame`.

2. **Sim logic is already separated from draw, per entity and per system.** Every entity has `update()` (mutates state) and `draw(ctx)` (reads state) — cleanly split. Systems (`collision-system.js`, `combat-manager.js`, `wave-manager.js`, player sub-modules) are **free functions invoked via `fn.call(this)`** where `this` is the GameEngine.

3. **Therefore the extraction is: give those `.call(this)` functions a *headless engine context* to bind to**, and replace ~6 browser-coupling patterns with injectable seams. We do **not** rewrite the game logic.

**Strategy = "Headless EngineContext + injectable side-effects," not pure-function rewrite.** Build an engine-shaped object (`player(s)`, pools, `gameField`, `game`, `events`, `spatialGrid`, `frameClock`, `rng`, and FX hooks). On the **server** the FX hooks are no-ops/event-emitters and there's no `ctx`; on the **SP browser** the *same* code runs with real FX hooks (this is the "SP still works" gate); the **MP client** renders server snapshots with the real SP renderer.

---

## 1. Target architecture

```
            ┌──────────────── shared sim core (runs in Node AND browser) ────────────────┐
            │  the existing js/modules/* SIM logic, bound to an EngineContext:            │
            │   • entities: Player(s), Enemy, Bullet, EnemyBullet, Asteroid, orbs         │
            │   • systems: collision-system, combat-manager, wave-manager, formations,    │
            │     hazard-field, difficulty-director, item-system (loot)                   │
            │   • deterministic: frameClock(tick), seeded rng, GameTimer (no setTimeout)  │
            │   • side-effects via injected FX hooks: fx.particle/sound/shake (no-op svr) │
            │   • emits a per-tick EVENT stream (deaths/hits/spawns/pickups/…)            │
            └───────────────┬───────────────────────────────────────────┬────────────────┘
                            │                                            │
           ┌────────────────▼─────────────────┐        ┌────────────────▼──────────────────┐
           │ SERVER: HeadlessEngine            │        │ SP BROWSER: GameEngine (today)     │
           │  ctx with FX no-ops, N players,   │        │  same sim + real ctx/FX/renderer   │
           │  60 Hz tick → snapshot + events   │        │  (VALIDATION: plays identically)   │
           └────────────────┬─────────────────┘        └─────────────────────────────────────┘
                            │ snapshots (delta+binary, existing) + events
           ┌────────────────▼──────────────────────────────────────────────────────────────┐
           │ MP CLIENT: renders snapshots with the REAL SP renderer                          │
           │  render/shapes.js (entity shapes) · WebGL particle/bullet/starfield renderers   │
           │  · weapon-effects-renderer · hud · audio — fed from snapshot state + events     │
           │  predicts local ship (shared sim), interpolates everything else                 │
           └─────────────────────────────────────────────────────────────────────────────────┘
```

The current toy `js/sim/` and minimal `js/mp/mp-renderer.js` are **replaced** by this shared-real-sim + real-renderer pipeline. The existing MP transport, delta-snapshot, binary-codec, matchmaking, and netcode layers are **kept** (they're transport-agnostic).

---

## 2. Foundation: the six cross-cutting seams (build these FIRST)

These are prerequisites; nothing extracts cleanly until they exist. Each is **behavior-preserving for SP** (the gate).

### S1 — Deterministic clock (`js/modules/core/frame-clock.js`)
- Today: `frameClock.now = Date.now()`; `advance()` re-reads `Date.now()` (`:7,:12`). Catch-up steps already do `frameClock.now += logicTickRate` (`game-engine.js:4618`).
- Change: add a **headless/replay mode** where `now` is derived from a tick counter (`tick * LOGIC_TICK_MS`), not `Date.now()`. SP keeps wall-clock by default; server sets tick-driven mode.
- This fixes the **largest** consumer group for free (enemy/collision/combat code mostly already reads `frameClock.now`, not `Date.now()`).
- Also fix `enemy.js:692` to pass `frameClock.now` (not `Date.now()`) to boss drivers, and unify the mixed-time-base reads: rage-invuln (`collision-system.js:2592` vs `boss-rage.js:38,121`), bullet age (`enemy-bullet.js:639` vs `creationTime` at `:43`), player `_lastDamageAt`, and player **energy-regen dt** (`player.js:1116`, currently `Date.now()` deltas) onto `frameClock.now`.

### S2 — Seeded RNG seam (`js/modules/core/utils.js` + a shared rng)
- Central injection point: **`utils.js:12 random(a,b)`** is imported by game-engine, combat-manager, collision-system, asteroid, gold-coin/shape, particle, shapes. Re-point it at a swappable seeded source.
- Provide `js/sim/rng.js` (mulberry32, already exists) as the source; the EngineContext owns one seeded `rng` per room and installs it.
- Then thread the seed through the **direct `Math.random()` sim sites** the review catalogued (NOT cosmetic ones): enemy `movement.js`/`ai.js`/`firing.js`/`enemy.js`, player `weapons.js` (crit `:1221`), `progression.js` (crit-dmg `:571`), `lifecycle.js` (dodge `:263`), `collision-system.js` (procs/splits), `combat-manager.js` (drops `:1008–1063`), `item-system.js` (loot rolls + Fisher–Yates `:156`), `asteroid.js` (HP `:97`), `wave-manager.js` (spawn rolls), `powerup.js` (`:932`), `gold-coin/shape.js`.
- Wire the **already-injectable** rng params (`run-randomizer.js`, `bounty-engine.js`, `gear-gen.js`) to this seeded source.
- Leave cosmetic RNG alone (hud jitter, particles, starfield noise, `NoiseGenerator`).

### S3 — FX hook interface (new: `js/modules/core/fx.js` or on the EngineContext)
The sim must stop *directly* spawning particles / playing audio / shaking the screen. Define an injected `fx` interface the sim calls instead:
```
fx.particle(type, x, y, ...opts)   // server: no-op (or record); client: particlePool.get(...)
fx.sound(name)                     // server: no-op; client: audioManager.playSound(name)
fx.shake(mag, ...) / fx.kick(...)  // server: no-op; client: camera shake
fx.haptic(ms)                      // server: no-op; client: navigator.vibrate
```
- Most audio is **already routed through `events.emit('audio:…')`** (good — `lifecycle.js`, `collision-system.js`). Direct `audioManager.*` calls in `weapons.js`/`abilities.js`/`game-engine.js`/`player.js` move behind `fx.sound`.
- Particle spawns (`particlePool.get(...)` — 168 sites; densest in `collision-system.js` 73, `combat-manager.js` 40, `lifecycle.js` 15) move behind `fx.particle`. On the server these become **emitted semantic events** (the client re-derives the particle burst), so MP looks identical without the server simulating particles.
- **Critical distinction:** entity-spawning pool calls that ARE sim (`asteroidPool/enemyPool/bulletPool/enemyBulletPool/powerupPool/goldCoinPool/goldShapePool.get`) stay in the sim (just RNG-seeded). Only the **VFX pools** (`particlePool/lineDebrisPool/asteroidShardPool/backgroundStarPool/colorStar-decorative`) go behind `fx` / stay client-only.

### S4 — The headless EngineContext (new: `js/sim/engine-context.js` or `server/src/sim/`)
An object exposing exactly what the `.call(this)` sim functions read:
`{ players[] / player, enemyPool, bulletPool, enemyBulletPool, asteroidPool, powerupPool, goldCoinPool, goldShapePool, formationManager, hazardField, spatialGrid, gameField, game, events, frameClock, rng, fx, _gameTimers }`
plus the sim methods the engine delegates (`handleCollisions`, `updateWaveSystem`, `spawnHazard`, `requestEnemySpawn`, target-query helpers like `findNearestTarget`, etc.).
- The SP `GameEngine` **becomes** (or composes) an EngineContext with real `ctx`/renderers/FX; the server builds a **bare** EngineContext (no canvas, FX no-ops, particle/star/debris pools omitted).
- Replace entity reads of `window.gameEngine` (`player.js:761`, `enemy-bullet.js:41/48`, `enemy.js`, `color-star.js:260`) and `window.innerWidth/Height` in `reset()`/constructors (`player.js:52`, `bullet.js:23`, `powerup.js:843`, stars) with **context references** (`ctx.findNearestTarget`, `ctx.gameField`). `gameField` (fixed 1920×1080) is the sim-authoritative world size; `window.inner*` is viewport/render only.

### S5 — Deterministic timers (replace sim-state `setTimeout`)
`GameTimer` (`core/game-timer.js`) already exists (frame-counted, used in wave-manager). Convert the **sim-state-mutating** `setTimeout`s to `GameTimer`:
- `wave-manager.js:1737` (asteroid spawn stagger `i*200ms` — mutates world), `:296`, `:1303` (wave/complete transitions). Also audit `firing.js:550`, `weapons.js:1867`, `progression.js:269`, `lifecycle.js:737–798`, `player.js:721` — convert the ones that gate spawns/damage; leave pure-VFX `setTimeout`s client-side (they won't run headless, which is fine).

### S6 — Headless tick driver (new: `server/src/sim/tick.js` replacing the toy one)
Replaces `gameLoop()`'s accumulator/`requestAnimationFrame`/`performance.now` with:
```
tick(ctx, inputsByPlayer):
  frameClock.advanceTick()                 // S1: now = tick * LOGIC_TICK_MS
  ctx._gameTimers.forEach(t => t.tick(dt))
  for each player slot: player.update(input, ctx, dt)   // S3/S4: fx instead of pools/audio
  status/hazard/passive ticks
  bulletPool/enemyBulletPool/asteroidPool/enemyPool/powerup/orb updateActive(ctx)
  formationManager.update(); auras (gravity/storm/suppress)
  handleCollisions.call(ctx)               // the core sim
  updateWaveSystem.call(ctx)
  return ctx.events.drain()                // the per-tick event stream → reliable channel
```
No camera, no screen-shake, no draw, no VFX-pool updates, no non-PLAYING branches.

---

## 3. File-by-file extraction plan

Legend: **KEEP-CLIENT** = stays browser-only (rendering/juice). **READY** = pure sim/data, runs headless as-is (just RNG/clock seam). **CUT** = mixed; extract sim, route FX through seams. **CONTEXT** = becomes/feeds the EngineContext.

### Group A — `js/modules/core/` (infrastructure)
| File | Action |
|---|---|
| `constants.js` | READY. `GAME_CONFIG` (FIELD 1920×1080, LOGIC_HZ 60, TICK_SCALE), `GAME_STATES`. No coupling. Server imports as-is. |
| `game-state.js` | READY. State machine; server uses PLAYING/WAVE_TRANSITION/GAME_OVER. |
| `pool-manager.js` | READY for sim pools. `updateActive()` is sim; `drawActive*()` skipped server-side. Server instantiates only sim pools. |
| `game-timer.js` | READY. Deterministic frame-counted timer — the `setTimeout` replacement (S5). |
| `event-bus.js` | READY. Synchronous pub/sub; server routes `audio:*`/FX emits to the event stream or no-op. |
| `frame-clock.js` | **S1** — add tick-driven mode. |
| `utils.js` | **S2** — `random()` becomes seeded-injectable. `GameDimensions` reads `GAME_CONFIG` (READY). `NoiseGenerator` cosmetic (client-only). |
| `gear-scaling.js` | READY. Pure math. |
| `storage.js` | KEEP-CLIENT for SP; server-side, per-player meta must be **passed in at run start** + persisted server-authoritatively (see §4). |

### Group B — `js/modules/player/` (the local entity, becomes N entities)
| File | Action |
|---|---|
| `player.js` | **CUT.** `update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged, gameField)` (`:731`) → `update(input, ctx, dt)`; replace `window.gameEngine` (`:761`) with `ctx`, inline `particlePool.get` (`:926/932/1212`) with `fx.particle`, `Date.now()` (`:895/1115`) with `frameClock.now`, `window.inner*` (`:52`) with `gameField`. Physics step (`957–1019`), resource/timer ticks, dash/ability input = sim. Articulation (`bank/wingSweep/…`) + `die()` FX = client. |
| `weapons.js` | **CUT.** Firing geometry/damage/cooldown = sim; `audioManager.playShoot/...` + `spawnMuzzleFlare` → `fx`. Pools already params → swap to `ctx`. `getEffective*` = READY. |
| `lifecycle.js` | **CUT.** `takeDamage`/lethal pipeline = sim; `events.emit('audio')`/`particlePool`/`rumble`/death-FX `setTimeout`s → `fx`/client. Pure helpers (`classifyDamageSource`, resist, bloodshield) READY. |
| `abilities.js` | **CUT.** Ability state machines + cooldown decay = sim; per-ability particle bursts → `fx` (already null-guarded). |
| `bullet.js` | **CUT.** `update(...)` physics (`:252`) = sim (gate cluster-trail particles → `fx`); `draw*` family + `bakedBulletSpriteCache` = KEEP-CLIENT. `window.inner*` (`:23`) → `gameField`. |
| `progression.js` | **CUT.** `getEffective*` + powerup-stack math = READY (cleanest target). Strip `localStorage` meta-save + level-up FX to client/persistence. crit-dmg roll (`:571`) → seeded rng. |
| `passives.js` | READY. Pure. |
| `player-status.js` | READY. Pure `(player, now)`. |
| `class-system.js`, `classes.js` | READY. Data/pure. |
| `renderer.js`, `skins/*` | KEEP-CLIENT. 100% rendering. |

### Group C — `js/modules/enemy/`
| File | Action |
|---|---|
| `enemy.js` | **CUT.** `update(playerRef, gameEngine, gameField)` (`:566`) → bind to `ctx`. AI/movement/firing/status = sim; trail particles (`:862`), music-synced shield pulse (`812–831`), `window.SHOW_ENEMY_NAMES` = client. Spawn callbacks (`spawnHazard`/`requestEnemySpawn`) become `ctx` methods. |
| `enemy-data.js` | READY (data; drop `SHAPE_DRAW_MAP` server-side). |
| `movement.js` | READY-after-seam. 30+ patterns; gate ~5 particle spawns → `fx`, seed `Math.random` (×119), `frameClock`. |
| `firing.js` | **CUT.** Firing geometry + bullet spawn = sim; charging/laser particle FX (37) → `fx`. Replace `gameEngine._activeShotPattern` stamp with `ctx`. |
| `ai.js` | READY-after-seam. Gate trail particles. |
| `enemy-bullet.js` | **CUT.** `update()` physics = sim (pass element via param, not `window.gameEngine`); `draw`/`explode` FX = client. Fix bullet-age time base (S1). |
| `shapes.js` | KEEP-CLIENT (entity silhouettes). |
| `boss-rage/phases/parts/intro.js`, `telegraph.js`, `support-aura.js`, `formations.js` | READY-after-seam (boss state machines; already take injectable `now`; gate a few particles). |
| `bosses/*` (10 + index) | READY. Pure `updateBoss` drivers, no canvas. Fix the `now` passed from `enemy.js:692`. |
| `abilities/*` (8) | READY. State machines; injectable `now`. |
| `boss-render.js`, `boss-fx.js` | KEEP-CLIENT. |

### Group D — `js/modules/combat/`
| File | Action |
|---|---|
| `collision-system.js` (3880 lines) | **CUT — the hardest file.** `.call(ctx)`. Collision math + damage + elemental mults + pierce/chain budgets + kill triggers = sim. The **137 `particlePool.get`, 24 `events.emit('audio')`, 60 `Math.random`, `triggerScreenShake`** → `fx`/seeds. `window._qaBotKillBuffer` → guard/strip. Uses `spatialGrid` (READY). |
| `combat-manager.js` (2702) | **CUT.** Kill rewards / drop & gold rolls / streak / vampirism accounting = sim (seed rng `:1008–1063`); debris/explosion/damage-number FX (68 particle refs) → `fx`/client. Pure helpers (`killingSpreeMult`, `splitChildSpec`, …) READY. |
| `weapon-data.js`, `elements.js`, `defense-data.js`, `passive-data.js`, `weapon-traits.js`, `weapon-gen.js`, `card-draft.js` | READY. Data + pure math (elements = core of damage math). |
| `weapon-effects-renderer.js` | KEEP-CLIENT (463 ctx refs). MP client reuses it, fed from snapshot. |

### Group E — `js/modules/world/`
| File | Action |
|---|---|
| `asteroid.js` | **CUT.** `update(gameField)` physics = sim (seed HP roll `:97`); `draw` + health-bar/reticle = client. |
| `powerup.js` | **CUT.** Magnet/pickup physics = sim (`window.inner*` `:843` → `gameField`; weighted pick `:932` → rng); shape draw = client. |
| `gold-coin.js`, `gold-shape.js` | **CUT/READY.** Pickup/magnet/value = sim (seed rolls); draw = client. |
| `hazard-field.js` | READY (already callback-injected, "no engine deps"). |
| `item-system.js` + `item-templates/names/gear-gen/matrix-*/inventory/reward-dial/run-shop/bounty-*/cores.js` | READY (loot economy; pure; rollers already take injectable `rng` — wire to seeded source; `bounty-engine` localStorage → server persistence). |
| `particle.js`, `background-star.js`, `line-debris.js`, `color-star.js` (decorative), `asteroid-shard.js`, `camera-manager.js` | KEEP-CLIENT (cosmetic / camera). `color-star` *collectible* pickup is the only sim slice → split or tag. |

### Group F — `js/modules/wave/`
| File | Action |
|---|---|
| `wave-manager.js` | **CUT.** `.call(ctx)`. Spawn/pacing/advance/scaling = sim (seed spawn rolls; **S5** convert `setTimeout` stagger `:1737` + transitions to `GameTimer`; `Date.now` → `frameClock`); draft/shop **DOM** (`getElementById/createElement` `1926–2319`) and `isMobile`/`renderIconHTML` = client (server emits a "wave-cleared, offer draft" event; the *client* shows the overlay; co-op needs a shared-draft design — see §4). |
| `wave-data.js` | READY (pure config/scaling math). |
| `difficulty-director.js`, `power-level.js`, `run-randomizer.js`, `run-templates.js`, `difficulty-constants.js`, `director-telemetry.js` | READY (documented pure; injectable rng). |

### Group G — `js/modules/render/`, `performance/`, `hud/`, `audio/` (the client render reuse)
All **KEEP-CLIENT**, and the MP client **reuses them** to render snapshots SP-identically:
| File | MP client use |
|---|---|
| `render/shapes.js` | The visual SSOT — feed `opts`/`shape` plain objects built from snapshot fields + a per-id cosmetic cache (asteroid vert seed, `now` clock). |
| `performance/webgl-bullet-renderer.js`, `webgl-starfield-renderer.js` | Scalar push APIs — client computes `pushBullet`/`addStar` from snapshot. Drop-in. |
| `performance/webgl-particle-renderer.js` | Wants a `pool.activeObjects`; keep particles **client-authored** (cosmetic) and spawn them from the server **event stream** → feed a pool-shaped array. |
| `performance/nebula-renderer.js`, `depth-batch-renderer.js`, atlases | Drop-in (self-contained). |
| `combat/weapon-effects-renderer.js`, `hud/*` | Bind a GameEngine-shaped façade (reads `this.player`/`this.camera`/collections) populated from the snapshot. `hud/boss-healthbar.js` + `hud/threat-level.js` already take clean `(ctx, data)` args. |
| `audio/audio-manager.js` | `playSound(name)` on snapshot-derived events. Drop-in. |

---

## 4. Co-op generalization (1 player → N)

This is **game design + engineering**, not derivable from SP. The state split (from the review):
- **Per-player** (currently bound to the single `this.player` + `this.game`): the Player entity, its `input`, `money`, `equippedWeapon/Abilities/Passives/Items`, owned pools, level/SP, meta profile (from `storage.js`). → becomes **N slots** `{ player, input, money, gear, meta }`.
- **Shared / run-level**: `runConfig`, `currentWave`, `enemyLevel`, wave/director state, the enemy/asteroid/orb pools, `gameField`, `spatialGrid`. → **one** shared world context.

Design decisions to lock (each changes the sim):
- **Camera** — SP centers on one ship; co-op needs a shared bounded arena (simplest) or per-player viewports. Snapshot scope follows this (shared arena = send everything).
- **Enemy targeting/aggro** across N players (`enemy.js`/`ai.js` currently target the single player).
- **Loot/gold/XP** — shared vs. per-player; the looter run-meta (armory loadouts, gear drops, level) per-player vs. shared run.
- **Death/revive** — SP's spare-tank/life + `handlePlayerDeath` vs. the co-op revive already built in the toy sim; reconcile.
- **Draft/shop between waves** — SP shows a DOM overlay and pauses; co-op needs a shared or per-player draft and a "everyone ready" gate (server-coordinated).

Recommendation: **shared bounded arena, nearest-living-player aggro, per-player loadouts + instanced loot, shared wave/run progression, downed+revive.** (Matches the toy sim's choices, so the netcode already fits.)

---

## 5. Snapshot + wire (reuse what exists)

- The headless world serializes to the **same snapshot shape** the toy sim uses, extended to the real entity set (ships with full SP state, enemies by type + AI-visible flags, bullets by shape, asteroids with vert seed, orbs, bosses, active weapon-effects). Reuse the existing **delta snapshots** (`js/sim/snapshot-delta.js`) and **binary codec** (`js/sim/codec.js`).
- The **event stream** (`ctx.events.drain()` per tick) carries the FX/audio semantics (deaths, hits, explosions, pickups, shoots, wave events) on the **reliable channel** — the client turns these into particles/sounds/shake so MP looks identical without the server simulating cosmetics.
- Bandwidth: bullet-hell density is large → keep "fire-event + client-simulate projectile, server-authoritative hit" for bullets (the toy sim already leans this way); snapshot only persistent entities.

---

## 6. SP integration & the validation gate

The whole plan hinges on: **single-player must keep playing byte-identically.** Mechanism:
1. SP's `GameEngine` is refactored so its `update()` path runs the **same sim code against an EngineContext** (with real FX hooks + `ctx`). I.e., SP and server share the exact functions; SP just also draws.
2. After each seam/file, run: full unit suite, QA/e2e suites, **and a human playtest** of SP (feel, weapons, enemies, bosses, looter economy). Seams S1/S2/S5 are the highest-risk for "feel" regressions (timing/RNG) — gate hard.
3. A **golden-replay test**: record an input sequence + seed, assert the headless sim and the SP sim produce identical world state after N ticks (this is the determinism regression guard, and proves "MP plays like SP").

---

## 7. Phased rollout (sequencing, each phase shippable + SP-validated)

> Do this with the looter-pivot agent **paused** (it edits `game-engine.js`, `collision-system.js`, `combat-manager.js`, `wave-manager.js`, player/enemy files — direct collision). Coordinate or branch.

- **P1 — Seams, behavior-preserving (S1 clock, S2 rng, S5 timers).** No headless yet; SP must play identically + golden-replay determinism test passes. *Highest feel-risk; gate hard.*
- **P2 — FX hook seam (S3).** Route particle/audio/shake/haptic through `fx`; SP uses real hooks (identical), define the no-op set. Emit the semantic event stream alongside (unused yet).
- **P3 — EngineContext (S4) + window-decoupling.** Build the context; replace `window.gameEngine`/`window.inner*` reads. SP `GameEngine` composes/implements the context. Still single-player, still identical.
- **P4 — Headless tick driver (S6) on the server.** Server constructs a bare EngineContext (1 player, FX no-ops), runs the real sim, serializes snapshots. New `mp.html` client renders with `shapes.js` + WebGL renderers + event-driven particles (Group G). **Milestone: one player, MP looks + plays exactly like SP.**
- **P5 — Co-op N players (§4).** Generalize to N slots + shared world; enemy aggro; the design decisions. Reuse existing netcode (prediction/interp/reconcile, matchmaking).
- **P6 — Co-op systems.** Loot/gold/XP model, downed+revive vs SP lives, shared draft/shop gate, run-meta in co-op.
- **P7 — Polish/parity sweep.** Bosses, all weapon-effects rendering, HUD façade, audio, performance (server density with the full sim per room).

---

## 8. Risks & honest assessment

- **Scale & risk:** this refactors a live, 87k-LOC, actively-developed game; the two hardest files (`collision-system.js` 3880, `combat-manager.js` 2702) are dense sim+FX. It's **multi-week** and can break SP feel. The golden-replay + human-playtest gates are mandatory, not optional.
- **Determinism feel-risk:** S1/S2 change *when* timers fire and *which* RNG values appear — SP behavior can shift subtly. Mitigate: keep SP on the same seeded path so "different" = "deterministic," and tune to match recorded baselines.
- **Concurrent edits:** the looter-pivot agent owns these files on `master`. This refactor **cannot** run safely alongside it — pause it or use a dedicated branch and merge deliberately.
- **Server cost:** running the *full* SP sim (collision, AI, looter rolls) per room at 60 Hz is heavier than the toy sim — fine for co-op scale, but profile; object pooling already helps GC.
- **Transcendentals (`sin/cos/sqrt`)** are fine for Node-only headless determinism (same V8). Only a concern if cross-engine (Rust/WASM) parity is ever needed — not here.

**Bottom line:** the architecture is sound and the codebase is unusually well-suited (fixed-dt tick, `.call(this)` functions, per-entity update/draw split, audio already event-routed). The cost is concentrated in six seams + the two big combat files + the co-op design. Do P1–P4 to reach "one-player MP identical to SP," then P5–P7 for co-op.
