# Solo Bug Audit — 2026-05-18

Comprehensive bug audit of the SOLO single-player codebase (~52K LOC across `js/main.js`, `js/modules/**`, `js/engine/{engine-driver,index}.js`, `css/`, `index.html`). MP-only paths (`js/sim/`, `js/net/`, `js/mp/`, `js/engine/mp-frame.js`, `js/engine/online-status-overlay.js`, `server/`, `mp.html`) were explicitly excluded — except where MP wrappers (e.g. `js/sim/enemy.js`) materially affect solo behavior.

**Methodology.** Six parallel subagents read their assigned files thoroughly and reported concrete bugs (file:line, severity, root cause, proposed fix, confidence). I compiled and deduplicated their findings below. **All HIGH-severity findings should be verified at the listed file:line before fix work begins.**

**Confidence legend:** HIGH = clearly broken on inspection. MED = likely broken pending runtime check. LOW = suspect, requires manual verification.

---

## Headline (top fixes by severity × confidence)

1. **Two parallel player-damage pipelines.** `collision-system.js` writes `player.health -=` directly in three places (enemy, enemy-bullet, asteroid collisions), bypassing `lifecycle.takeDamage`. REFLEXES, STATIC_FIELD, LAST_STAND, the mobile damage multiplier, and the regen combat-gate (`_lastDamageAt`) are all bypassed. (BUG-collision-damage-bypasses-takeDamage-pipeline)
2. **~15 purchasable upgrades are no-ops.** KINETIC_IMPACT, POISON_TIP, SUPPRESSION, STATIC_CHARGE, SHRAPNEL, THROUGH_AND_THROUGH, DAISY_CHAIN, AFTERSHOCK, CLUSTER_WARHEAD, REDIRECTION, RETALIATION, EMERGENCY_PROTOCOL, EMP_OVERLOAD, CASCADE, EXTRA_ORB/HARDENED_ORBS/REFLECT, FORTIFY/EXTENDED_CARE all set flags or duration extensions that no consumer reads.
3. **Two defense skills are placebos.** DEFLECTOR_ORBS never spawns any orbs; EMP_PULSE never stuns enemies and never sets the renderer's expected flags.
4. **Enemy pool recycle leaks state.** `initializeEnemy()` resets only ~5 type-state fields. Dozens of others persist (boss flags, rage state, sentinel-burst counters, arc/spiral/orbit state, prowler state, …) so recycled slots may spawn mid-state — bosses-as-grunts, instantly-firing stalkers, infinitely-invulnerable rage rings.
5. **Pool reset leak in `game-engine.init()`** — `pool.activeObjects = []` drops live references without scrubbing per-object state or growing the free list. Combined with **BUG-particle-pool-undersized** (pool initialised to 50 entries while MAX_PARTICLES is 2500) every reset leaks thousands of particle instances to GC.
6. **`survivalTime` runs during pause/shop** — wall-clock-based, inflates speed-run timers and lets cleanup intervals fire.
7. **Event-bus skips next handler when one unsubscribes mid-emit** — `splice` + `i++` bug.
8. **Mobile players cannot restart from game-over via touch** — canvas game-over buttons drawn but no mobile touch handler routes to them.
9. **WebGL starfield never recovers from context loss** — its listeners are constructed but never attached.
10. **Stats overlay state-machine mismatch** — `'paused'` (lowercase) compared against `GAME_STATES.PAUSED` (`'PAUSED'`), wrong `_wasPaused` value on close.

---

## Index by severity

### CRITICAL
*(none)*

### HIGH (correctness, gameplay-visible, high confidence)
| ID | File:line | Subsystem |
|---|---|---|
| BUG-collision-damage-bypasses-takeDamage-pipeline | combat/collision-system.js:1929,2099,2244 | Combat |
| BUG-deflector-orbs-never-spawned | player/skills.js:308-331 | Skills |
| BUG-emp-pulse-never-stuns | player/skills.js:308-331 | Skills |
| BUG-kinetic-impact-knockback-never-applied | player/weapons.js:492,496 | Weapons |
| BUG-dead-bullet-flag-upgrades | player/weapons.js:348,352,360,426,498 | Weapons |
| BUG-explosive-bullet-skips-kill-pipeline | player/bullet.js:387-414 | Combat |
| BUG-pool-reset-leak | modules/game-engine.js:1022-1037 | Engine |
| BUG-particle-pool-undersized | modules/game-engine.js:895 | Engine |
| BUG-survivaltime-during-pause | modules/game-engine.js:2579-2581 | Engine |
| BUG-knight-undefined-bounds | enemy/movement.js:673-674 | Enemy AI |
| BUG-maintainDistance-wrong-pool-field | sim/enemy.js:238 (solo-affecting wrapper) | Enemy AI |
| BUG-pool-recycle-state-leak | enemy/enemy.js:46-234 | Enemy AI |
| BUG-pool-recycle-boss-flags-leak | wave/wave-manager.js:722-762 + enemy/enemy.js:46-234 | Enemy AI |
| BUG-spawnWaveAsteroids-setTimeout-race | wave/wave-manager.js:1213-1221 | Waves |
| BUG-titan-tonahawk-typo | enemy/firing.js:502 | Enemy AI |
| BUG-spatial-grid-out-of-bounds-truncated | performance/spatial-grid.js:32-42 | Physics |
| BUG-powerup-resize-stale-dimensions | world/powerup.js:675-676,841 | World |
| BUG-bullet-explode-particle-vel-overwrite | player/bullet.js:370-374 | Combat (MED, listed here for clustering with explode bug) |
| BUG-starfield-no-context-loss-recovery | performance/webgl-starfield-renderer.js:260-269 | Rendering |
| BUG-stats-state-case-mismatch | ui/stats-overlay.js:222 | UI |
| BUG-mobile-touch-shop-state-no-routing | ui/mobile-touch.js:87-90,192 | Mobile |
| BUG-touchstart-listener-leak | main.js:152-165,298 | Engine |
| BUG-input-bind-per-frame-alloc | modules/game-engine.js:2585,3287 | Engine perf |
| BUG-eventbus-emit-unsub-skip | core/event-bus.js:34-40 | Core |
| BUG-quadtree-retrieve-duplicate-objects | performance/quadtree.js:148-167 | Physics (if used) |

### MEDIUM
| ID | File:line | Subsystem |
|---|---|---|
| BUG-mine-blast-uses-current-stacks | combat/collision-system.js:1129 | Combat |
| BUG-mine-daisy-chain-never-fires | player/weapons.js:777 | Weapons |
| BUG-nova-aftershock-never-fires | player/weapons.js:813 | Weapons |
| BUG-cluster-warhead-never-splits | player/weapons.js:985 | Weapons |
| BUG-bulwark-retaliation-noop / repair-emergency-noop / EMP_OVERLOAD / CASCADE / FORTIFY/EXTENDED_CARE | player/skills.js, combat/weapon-data.js | Skills |
| BUG-lastDamageAt-not-updated-on-collision | combat/collision-system.js:1929,2099,2244 | Combat |
| BUG-explosive-bullet-explosion-ignores-asteroids-and-mines | player/bullet.js:360-418 | Combat |
| BUG-piercing-bullet-applies-explosion-once-per-hit | combat/collision-system.js:296-299,852-856 | Combat |
| BUG-handlePlayerEnemyCollision-skips-tank-flash-and-static-shield | combat/collision-system.js:1951-1960 | Combat |
| BUG-applyHealthOrbToTanks-condition-inverted | player/lifecycle.js:236-244 | Player (verify) |
| BUG-shootPulse-setTimeout-pause-leak | enemy/firing.js:532-538 | Enemy AI |
| BUG-sentinel-bursts-stuck-on-recycle | enemy/firing.js:1232, enemy/movement.js:2090 | Enemy AI |
| BUG-tier4-phase-message-while-not-triggered | enemy/boss-rage.js:83-107 | Enemy AI |
| BUG-enemy-fire-update-lastShot-pre-fire | sim/enemy.js:431-436 | Enemy AI |
| BUG-spiralAngle-name-collision | enemy/firing.js:193-197 + enemy/movement.js:687-716 | Enemy AI |
| BUG-line-debris-degenerate-atan2 | world/line-debris.js:31-34 | World |
| BUG-particle-spawnparticle-vel-explodes | world/particle.js:303-306 | World |
| BUG-asteroid-radius-from-min-max-not-bounding | world/asteroid.js:282 | World |
| BUG-gold-coin-cumulative-snap-acceleration | world/gold-coin.js:145-154 | World |
| BUG-gold-shape-cumulative-snap-acceleration | world/gold-shape.js:181-190 | World |
| BUG-stat-pickup-cumulative-snap-acceleration | world/stat-pickup.js:129-139 | World |
| BUG-background-star-resize-stale-dimensions | world/background-star.js:6-7,95-96 | World |
| BUG-color-star-resize-stale-dimensions | world/color-star.js:26-28,110-111 | World |
| BUG-spatial-grid-not-idempotent-after-resize | performance/spatial-grid.js:16-21 | Physics |
| BUG-quadtree-getindex-boundary-exclusion | performance/quadtree.js:76-95 | Physics |
| BUG-particle-streak-NaN-when-speed-missing | performance/webgl-particle-renderer.js:471 | Rendering |
| BUG-music-loadtrack-settimeout-race | audio/music-player.js:224-227 | Audio |
| BUG-music-auto-skip-on-error-runaway | audio/music-player.js:129-133 | Audio |
| BUG-music-toggleShuffle-mutates-without-snapshot | audio/music-player.js:293-303 | Audio |
| BUG-music-handleTimeUpdate-divide-by-zero | audio/music-player.js:321-326 | Audio |
| BUG-audio-mutating-imported-manifest | audio/audio-manager.js:286 | Audio |
| BUG-audio-throttle-blocks-when-buffer-missing | audio/audio-manager.js:357-358 | Audio |
| BUG-bullet-init-recovery-no-supported-flip | performance/webgl-bullet-renderer.js:209-212 | Rendering |
| BUG-bullet-init-listeners-before-initgl | performance/webgl-bullet-renderer.js:230-237 | Rendering |
| BUG-bullet-shape-charge-quad-too-small | performance/webgl-bullet-renderer.js:127,374 | Rendering |
| BUG-bullet-fragment-discard-cuts-aa | performance/webgl-bullet-renderer.js:148,152 | Rendering |
| BUG-vfx-telemetry-ring-buffer-overwrite-by-index | debug/vfx-telemetry.js:141-146 | Debug |
| BUG-dead-canvas-shop-handlers | ui/event-setup.js:342-535 | UI dead code |
| BUG-blur-toggles-pause-unconditionally | ui/event-setup.js:249-253 | UI |
| BUG-icons-getIconImage-async-rasterize-returns-blank-canvas | ui/icons.js:235-259 | UI |
| BUG-shop-purchase-during-shop-event-bubble | shop/shop-dom.js:103-123 | Shop |
| BUG-mobile-stick-touch-id-not-released-on-touchend-elsewhere | ui/mobile-touch.js:290-348 | Mobile |
| BUG-hud-button-touchend-cancels-press-but-leaves-tracker | ui/event-setup.js:325-339 | UI |
| BUG-cleanup-interval-tick-storm | modules/game-engine.js:2797 | Engine perf |
| BUG-savefile-null-snapshot | core/storage.js:61-67 + game-engine.js:1237-1242 | Persistence |
| BUG-frameclock-stale-in-catchup | core/frame-clock.js:12 + game-engine.js:3266-3382 | Core (LOW–MED) |
| BUG-explosive-tomahawk-flag-vs-bullet-flag-mismatch | enemy/firing.js:502 | Enemy AI (visual) |

### LOW (perf, defensive, or unlikely-but-possible)
Full list under per-file sections below. Highlights: dead code in `bullet.applyHoming`, `_buildSkillsTab`, customization overlay; perf cliffs in `dodgeEnemyBullets` forEach closure, `_visibleStars filter` per frame, depth-batch bucket 0 invisible; double-buy debounce on shop click; many setTimeout-based scheduling paths that don't honor pause/state.

---

## Findings by area & file

### Core & Engine

#### `js/main.js`
- **BUG-touchstart-listener-leak (HIGH)** — line 152-165, 298. `consumeTitleScreen` removes keydown/mousedown/mouseup/click/mousemove but not the `touchstart` warmer (`onTouchWarmAudio`). Closure persists for page lifetime. Fix: add `window.removeEventListener('touchstart', onTouchWarmAudio)` inside `consumeTitleScreen`. Conf: HIGH.

#### `js/modules/game-engine.js`
- **BUG-pool-reset-leak (HIGH)** — line 1022-1037. `init()` resets pools via `pool.activeObjects = []`, dropping live refs without invoking `release()`. Free list never grows; every subsequent `get()` allocates fresh. Fix: replace each `= []` with a `while (active.length) pool.release(active[active.length-1])` drain, or add `pool.clear()`.
- **BUG-particle-pool-undersized (HIGH)** — line 895. `new PoolManager(Particle, 50)` while `GAME_CONFIG.MAX_PARTICLES` is 2500. Pool overflows on first combat scene, ~2450 instances leaked per reset (compounded by pool-reset-leak). Fix: pass `GAME_CONFIG.MAX_PARTICLES` (or at least a few hundred).
- **BUG-survivaltime-during-pause (HIGH)** — line 2579-2581. `survivalTime = Date.now() - gameStartTime` is wall-clock; pause/shop time is included. Inflates speed-run timers and lets the cleanup interval fire after long pauses. Fix: accumulate `+= LOGIC_TICK_MS` per tick (already only runs during PLAYING/WAVE_TRANSITION).
- **BUG-cleanup-interval-tick-storm (HIGH)** — line 2797. `if (Math.floor(survivalTime/1000) % 30 === 0)` fires every tick within the matching second (~60 sweeps in 1s). Fix: track `_lastCleanupSecond` and gate on `sec !== _lastCleanupSecond`.
- **BUG-input-bind-per-frame-alloc (HIGH)** — line 2585, 3287. `.bind(this.inputHandler)` per logic tick = 60Hz GC pressure. Fix: bind once in constructor; assign cached function.
- **BUG-survival-record-string-write (MED)** — line 3657-3662, 601. `localStorage.setItem` not wrapped in try/catch; quota / disabled-storage throws into death callback path. Fix: wrap setItem in try/catch.
- **BUG-shop-suggest-overlay-getById-no-cache (LOW)** — line 3595-3599. Hot path is keypress, not per-frame; negligible.

#### `js/modules/core/event-bus.js`
- **BUG-eventbus-emit-unsub-skip (HIGH)** — line 34-40. Handler that calls `off()` for itself shifts later handlers left; loop's `i++` skips the next subscriber. Fix: iterate over `list.slice()` snapshot.

#### `js/modules/core/frame-clock.js`
- **BUG-frameclock-stale-in-catchup (MED)** — line 12 + game-engine.js:3266-3382. Frame clock advanced once per gameLoop; catch-up loop runs up to 4 update steps per pass at the same `frameClock.now`/`tick`. Anything reading frameClock from a per-tick update is stale. Fix: bump `frameClock.now += LOGIC_TICK_MS; tick = (tick+1)|0` inside the accumulator loop.

#### `js/modules/core/pool-manager.js`
- Clean (real-world misuse is upstream in `init()` — see pool-reset-leak).

#### `js/modules/core/storage.js`
- **BUG-savefile-null-snapshot (MED)** — line 61-67 + game-engine.js:1237-1242. `serializeRunState()` returns null when player missing; `writeSave(null)` writes a malformed save that masks the previous good save until cleared. Fix: `if (!snapshot) return null;` guard.

#### `js/modules/core/utils.js`
- **BUG-wrapvalue-negative (LOW)** — line 406-410. `wrapValue` uses raw `%` which keeps dividend sign; negatives below `min` stay negative. Dormant (no current callers). Fix: math-modulo `min + ((v-min)%range + range)%range`.
- **BUG-wrap-single-add (LOW)** — line 13-18. `if (x < 0) x += width` single addition; entities >1 width outside stay outside. Fix: modulo.

#### `js/modules/core/constants.js`, `core/game-state.js`, `core/game-timer.js`, `core/version.js`, `core/color-cache.js`
- Clean.

#### `js/engine/engine-driver.js`, `js/engine/index.js`, `index.html`
- Clean.

---

### Player & Combat

#### `js/modules/player/player.js`
- **BUG-disableThrusters-setTimeout-survives-state-changes (LOW–MED)** — line 451-456. Raw setTimeout to re-enable thrusters; fires through pause/death/restart; concurrent calls race. Fix: use `_gameTimers` (GameTimer).
- **BUG-power-weapon-mp-suppression-leaves-input-stuck (LOW)** — solo unaffected.

#### `js/modules/player/lifecycle.js`
- Clean (`_lastDamageAt` correctly set here; problem is OTHER paths bypass it).

#### `js/modules/player/weapons.js`
- **BUG-kinetic-impact-knockback-never-applied (HIGH)** — line 492, 496. `bullet.knockback` set but no consumer reads it. KINETIC_IMPACT and the knockback half of MASS_DRIVER are no-ops. Fix: in bullet-asteroid/enemy hit code, apply `bullet.knockback` impulse along bullet direction.
- **BUG-dead-bullet-flag-upgrades (HIGH)** — line 348, 352, 360, 426, 498. POISON_TIP, SUPPRESSION, STATIC_CHARGE, SHRAPNEL, THROUGH_AND_THROUGH set flags no code reads. Fix: implement consumers OR remove upgrades from PRIMARY_UPGRADES.
- **BUG-mine-daisy-chain-never-fires (MED)** — line 777. `mine.daisyChain` set but `checkMineCollisions` never cascades. Fix: cascade-detonation pass when a mine triggers, find others within DAISY_CHAIN radius.
- **BUG-nova-aftershock-never-fires (MED)** — line 813. `ring.aftershock` stamped, no consumer slows on hit.
- **BUG-cluster-warhead-never-splits (MED)** — line 985. `missile.cluster` flag set; `checkMissileCollisions` only `.explode()`s. Fix: on hit when cluster set, spawn 3 sub-missiles.
- **BUG-nova-double-pulse-uses-stale-position (LOW)** — line 843-859. `setTimeout(...300)` closure captures `this.x/y` at fire time. Also wall-clock — fires through pause.
- **BUG-needleCount-static-charge-incorrect-modulo (LOW)** — line 328, 358-360.
- **BUG-bullet-pool-cap-evicts-piercing-priority-inverted-comment (LOW)** — line 210-213. Silent drop when fully-piercing bullets cap the pool — no audio cue; dead trigger.
- **BUG-fireNova-resonance-floor-too-high (LOW)** — line 798. 2000ms floor never engages; dead code (same in fireLightning:867, fireMissiles:997).
- **BUG-fireChargedShot-spawnMuzzleFlare-null-particlePool (LOW)** — line 1206. Pass `null` particle pool, sparks skipped, inconsistent visual.
- **BUG-bullet-radius-baseRadius-vs-applyGlobal-double-add (LOW–verify)** — line 339-340, 629-632.

#### `js/modules/player/bullet.js`
- **BUG-explosive-bullet-skips-kill-pipeline (HIGH)** — line 387-414. `bullet.explode()` hardcodes damage, bypasses crit/streak/upgrade multipliers; on kill calls `enemyPool.release()` directly — no `onEnemyKill`, no streak credit, no death flash, no enemy debris, drops stars instead of orbs. Mid-iteration release shifts arrays. Fix: route through `gameEngine.damageEnemy(enemy, damage)`.
- **BUG-explosive-bullet-explosion-ignores-asteroids-and-mines (MED)** — line 360-418. Explosive AOE only iterates `enemyPool`, ignores asteroids/mines.
- **BUG-bullet-explode-particle-vel-overwrite (LOW)** — line 370-374. `particle.vel = {x,y}` replaces pool's reused vel object → GC churn.
- **BUG-applyHoming-dead-code (LOW)** — line 245-358. ~110 lines unused; risk of staying "in sync" with live sim path.

#### `js/modules/player/skills.js`
- **BUG-deflector-orbs-never-spawned (HIGH)** — line 308-331. Activating sets `activeSkillEffects` but never pushes to `this.deflectorOrbs[]`. Collision/render gate on `length > 0` is always false; EXTRA_ORB / HARDENED_ORBS / REFLECT all dead. Fix: populate orbs from config.orbCount + EXTRA_ORB stacks.
- **BUG-emp-pulse-never-stuns (HIGH)** — line 308-331. Renderer reads `p.empPulseActive` / `p.empPulseStartTime` — never set. No `enemy.stun()` applied. Fix: set flags, iterate enemyPool within radius, apply stun.
- **BUG-bulwark-retaliation-noop / repair-emergency-noop / EMP_OVERLOAD / CASCADE / FORTIFY/EXTENDED_CARE (MED)** — defense skill upgrade descriptions are placebos.
- **BUG-lightningChains-origin-mutation-can-NPE (LOW)** — line 61-64. Defensive only.

#### `js/modules/player/progression.js`
- Clean. (4s regen damage-gate works; problem is upstream callers don't refresh `_lastDamageAt`.)

#### `js/modules/player/renderer.js`
- Clean.

#### `js/modules/combat/collision-system.js`
- **BUG-collision-damage-bypasses-takeDamage-pipeline (HIGH)** — line 1929-1930, 2099-2100, 2244-2245. Inline `player.health -= finalDamage`; bypasses REFLEXES, STATIC_FIELD, LAST_STAND, mobile damage multiplier, `_lastDamageAt`. Fix: route through `this.takeDamage(baseDamage)`.
- **BUG-lastDamageAt-not-updated-on-collision (MED)** — same lines. Even if we keep the inline path, set `player._lastDamageAt = Date.now()` when `finalDamage > 0`.
- **BUG-handlePlayerEnemyCollision-skips-tank-flash-and-static-shield (MED)** — line 1951-1960. Death branch from collision misses tank consumption, STATIC_FIELD shield decrement, LAST_STAND. (Folded into the takeDamage-pipeline fix.)
- **BUG-mine-blast-uses-current-stacks (MED)** — line 1129. Mine recomputes blast radius from live player stacks instead of `mine.blastRadius` stamped at lay time. Fix: `const blastR = mine.blastRadius || (default + stacks)`.
- **BUG-piercing-bullet-applies-explosion-once-per-hit (MED)** — line 296-299, 852-856. Piercing+explosive bullet fires AOE on every hit (4 explosions for 4-target pierce). May be intentional; balance call.
- **BUG-tractor-shield-redirection-noop (LOW)** — line 1742-1764. REDIRECTION upgrade never reflects bullets back.
- **BUG-onEnemyKill-called-for-asteroid-in-AOE-bullet-path (LOW–verify)** — line 205.
- **BUG-mine-trigger-iterates-asteroids-twice-per-frame (LOW)** — line 1141-1175.

#### `js/modules/combat/combat-manager.js`
- **BUG-guardian-uses-wrong-timer-field (LOW)** — line 1320. `invincibleTimer` vs actual `invincibilityTimer`. Dead-branch in practice but a real typo.

#### `js/modules/combat/weapon-data.js`, `defense-data.js`, `weapon-effects-renderer.js`, `autofire-diag.js`
- Clean data; renderer waits on flags that upstream never sets.

---

### Enemy AI & Waves

#### `js/modules/enemy/enemy.js`
- **BUG-pool-recycle-state-leak (HIGH)** — line 46-234 (`initializeEnemy`). Resets only ~5 per-type fields. Dozens of others (`_arcAngle`, `prowlerState`, `waspGunState`, `laserCharge*`, `tankState`, `triangleBurstState`, `squareBurstState`, `diamondProgress`, `hexagonProgress`, `tacticalState`, `crossScrollState`, `circleAngle`, `spiralAngle`, `drifterWavePhase`, `bomberRoamDir`, `orbitalState`, `zigzagState`, `arcState/Timer`, `dartCooldown`, `evasionDirection`, `_dodgeCooldown`, `lastEvasiveManeuver`, `trailTimer`, `sentinelBurstsFired`, `sentinelLastShot`, …) lazy-init via `if (=== undefined)` which never re-triggers. Recycled enemies inherit stale state. Fix: explicit reset block; or namespace per-type state under `this._typeState = null`.

#### `js/modules/enemy/enemy-bullet.js`
- **BUG-bullet-pool-shared-color-on-recycle (LOW)** — `bullet.gameEngine` never assigned; `createDisappearEffect`/`createExplosionEffect` silently no-op.

#### `js/modules/enemy/ai.js`
- **BUG-dodgeEnemyBullets-foreach-closure-alloc (LOW perf)** — line 623-656. Same pattern fixed for `dodgePlayerBullets` in 5.79.4. Fix: convert to indexed for-loop, pre-cull by AABB.
- **BUG-dodgePlayerBullets-divide-by-zero (LOW)** — line 507-519. Zero-velocity bullets (sweep-laser proxy at firing.js:1182) yield deterministic dodge angle 0. Fix: skip when `vel.x===0 && vel.y===0`.

#### `js/modules/enemy/movement.js`
- **BUG-knight-undefined-bounds (HIGH)** — line 673-674. `this.width`/`this.height` undefined on `Enemy` → `NaN` clamped target → NaN velocity. Fix: use imported `GameDimensions.width/height`.
- **BUG-spiralAngle-name-collision (MED)** — line 687-716 shares field with firing.js:193-197.
- **BUG-arcMovement-vel-set-not-add (LOW–verify)** — line 1475-1476.
- **BUG-arcMovement-arcProgress-clamps-at-1 (LOW)** — line 1461-1462. Cosmetic 1-frame jump.

#### `js/modules/enemy/firing.js`
- **BUG-titan-tonahawk-typo (HIGH but small)** — line 502. `'titan_tonahawk'` movement pattern doesn't match any case; bullet falls through to default no-op `aimed`. Tomahawk missiles never accelerate. Fix: spell `'titan_tomahawk'` + add the case in `applyMovementPattern` (and `js/sim/bullet.js` if mirrored).
- **BUG-shootPulse-setTimeout-pause-leak (MED)** — line 532-538. setTimeout-driven bursts run on wall-clock; don't honor pause; spawn from dead enemies. Fix: counted in-sim burst.
- **BUG-sentinel-bursts-stuck-on-recycle (MED)** — line 1232, movement.js:2090. `sentinelBurstsFired` lazy-init survives pool reuse; recycled SENTINEL may skip firing entirely. Fix: reset in `initializeEnemy`.
- **BUG-explosive-tomahawk-flag-vs-bullet-flag-mismatch (LOW)** — line 502. Titan misses `bullet.shape = 'missile_shape'` set by Prowler; renders as explosive-spike circle instead.
- **BUG-pulse-shoot-on-dead-enemy (LOW)** — gate `_deathFlash` / `warping` / `_shipDestroyed` in shoot path.

#### `js/modules/enemy/formations.js`
- **BUG-formation-figure8-double-amplitude (LOW visual)** — line 116-125. 2:1 axis ratio doesn't read as figure-8; design call.

#### `js/modules/enemy/shapes.js`
- Clean.

#### `js/modules/enemy/boss-rage.js`
- **BUG-tier4-phase-message-while-not-triggered (MED)** — line 83-107. Phase timer ticks even for dead/recycled enemies; can trigger `activateRage` on a corpse. Fix: early-return on `!enemy.active || _deathFlash > 0 || warping`.

#### `js/modules/wave/wave-manager.js`
- **BUG-pool-recycle-boss-flags-leak (HIGH)** — line 722-762 + enemy.js:46-234. Boss flags (`isBoss`, `bossTier`, `bossSizeMul`, `isMiniBoss`, all `_rage*`, `_partnerDied`, `_bossPair`, `_phaseTimer`, `_phaseIdx`, `_formationCenter/Angle/Radius/Omega`, `enableHomingBullets`) never cleared on slot recycle. Recycled grunt inherits boss treatment. Fix: explicit zero block at top of `initializeEnemy` (or top of `applyEnemyLevelScaling` when not boss).
- **BUG-spawnWaveAsteroids-setTimeout-race (HIGH)** — line 1213-1221. setTimeout staggered spawns can fire into the next wave. Fix: capture wave id at schedule time and bail, or use `_gameTimers`.

#### `js/modules/wave/wave-data.js`
- **BUG-wave29-titan-no-boss-flag (LOW)** — line 224. Possibly intentional; clarify.

#### Cross-cut (sim wrapper materially affects solo)
- **BUG-maintainDistance-wrong-pool-field (HIGH)** — `js/sim/enemy.js:238`. Reads `gameEngine.enemyPool.active` (undefined) instead of `.activeObjects`; enemy-vs-enemy separation is a global no-op. Fix: `.activeObjects`.
- **BUG-enemy-fire-update-lastShot-pre-fire (MED)** — `js/sim/enemy.js:431-436`. Cooldown reset on intent, not on successful spawn; if `shoot()` early-returns, cooldown still resets.
- **BUG-enemy-fire-charging-cooldown-bypass (LOW)** — `js/sim/enemy.js:424-428`. Charging patterns don't sync `lastShot`.

---

### World & Physics

#### `js/modules/world/asteroid.js`
- **BUG-asteroid-radius-from-min-max-not-bounding (MED)** — line 282. `radius = (minR+maxR)/2` (mean of vertex distance) used for collision. Visual silhouette extends to `maxR`. Tight grazes look hit but don't register; hits register on visual emptiness. Explains "shot the rock and nothing happened" / "dodged and got hit anyway" reports. Fix: `radius = maxR` for collision; keep avg/min for other uses.
- **BUG-asteroid-rescale-mass-overwrites-on-respawn (LOW)** — line 96, 254-286. Vertex re-allocation per spawn; GC churn.
- **BUG-asteroid-mass-uses-radius-not-base (LOW)** — line 283. Intentional-looking.

#### `js/modules/world/asteroid-shard.js`
- **BUG-asteroid-shard-life-pool-state (LOW)** — line 79. `lifeStep` is a constant; can promote.
- **BUG-asteroid-shard-perspective-denom-asymmetric (LOW)** — line 142. Comment claims `f/(f+z)` perspective, code is `1 + z/f`.

#### `js/modules/world/background-star.js`
- **BUG-background-star-resize-stale-dimensions (MED)** — line 6-7, 95-96. Window dimensions captured in ctor; wrap-boundary stale on resize. Fix: lazy-read or use GameDimensions.

#### `js/modules/world/camera-manager.js`
- **BUG-camera-zoom-divide-by-zero (LOW defensive)** — line 23, 62, 84, 108.
- **BUG-camera-getvisiblestars-filter-allocates (LOW perf)** — line 118-126. New array per frame; ~500 GC slots/frame. Fix: reuse `_visibleStarsScratch`.
- **BUG-camera-clamp-direction-asymmetry-when-window-larger-than-field (LOW verify)** — line 32-46.

#### `js/modules/world/color-star.js`
- **BUG-color-star-resize-stale-dimensions (MED)** — line 26-28, 110-111.
- **BUG-color-star-no-particle-pool-for-tractor (LOW)** — line 286-290. Null guard missing.
- **BUG-color-star-decorative-no-active-clear (LOW cosmetic)** — line 329-341. Misleading indentation.

#### `js/modules/world/gold-coin.js`
- **BUG-gold-coin-cumulative-snap-acceleration (MED)** — line 145-154. Near-pull ADDED to mid-pull (not else-if); at close range force = 50 px/tick before friction; coins overshoot and oscillate. Fix: `else if`.

#### `js/modules/world/gold-shape.js`
- **BUG-gold-shape-cumulative-snap-acceleration (MED)** — line 181-190. Same pattern as gold-coin.

#### `js/modules/world/item-system.js`, `item-names.js`
- Clean.

#### `js/modules/world/line-debris.js`
- **BUG-line-debris-degenerate-atan2 (MED)** — line 31-34. `atan2(0,0)` returns 0 when edge midpoint exactly at origin; all debris flies +x. Fix: random angle fallback.

#### `js/modules/world/particle.js`
- **BUG-particle-spawnparticle-vel-explodes (MED)** — line 303-306. `(dx/distance)*speed*distance == dx*speed`; trailing `* distance` un-normalises. Particle teleports a large fraction of the gap per frame, overshoots, oscillates. Fix: drop the `* distance`.
- **BUG-particle-phantom-duplicate-case (LOW)** — line 231-246. Two `case 'phantom':`; second is dead.
- **BUG-particle-shrapnel-angle-overwrite (LOW)** — line 333. Redundant `atan2` recompute.

#### `js/modules/world/powerup.js`
- **BUG-powerup-resize-stale-dimensions (HIGH)** — line 675-676, 841. Wraps at `window.innerWidth`, not `GAME_CONFIG.FIELD_WIDTH`. Same class of bug already patched for asteroids/stars; powerups missed the patch. Fix: use `GameDimensions.width/height`.
- **BUG-powerup-expiry-burst-after-active-false (LOW defensive)** — line 781-786.
- **BUG-powerup-collision-uses-stored-radius (LOW)** — line 1021-1031. Render pulses 0.7-1.0 but hitbox fixed; pickup feel inconsistent.

#### `js/modules/world/stat-pickup.js`
- **BUG-stat-pickup-cumulative-snap-acceleration (MED)** — line 129-139. Same compounded mid+near as gold pickups.

#### `js/modules/performance/quadtree.js`
- **BUG-quadtree-retrieve-duplicate-objects (HIGH if used)** — line 148-167. No de-dup Set; straddling entities returned multiple times → double damage / double pickup downstream if caller doesn't dedupe.
- **BUG-quadtree-getindex-boundary-exclusion (MED if used)** — line 76-95.
- **BUG-quadtree-insert-skips-overflow-split (LOW perf)** — line 107-117.
- **Recommendation:** Confirm quadtree.js is dead (SpatialGrid superseded per OPT-8); if dead, archive/delete.

#### `js/modules/performance/spatial-grid.js`
- **BUG-spatial-grid-out-of-bounds-truncated (HIGH)** — line 32-42. Entities with `x < -r` clamp to column 0; off-grid entities pile into edge cells, returned as false candidates to nearby queries. Fix: early-return when entity entirely outside grid (if game logic permits).
- **BUG-spatial-grid-not-idempotent-after-resize (MED latent)** — line 16-21.

---

### Rendering & Audio

#### `js/modules/performance/depth-batch-renderer.js`
- **BUG-depth-bucket-zero-renders-fully-invisible (LOW)** — line 86. `globalAlpha = 0/10 = 0`; bucket 0 draws nothing yet costs path-build. Fix: `if (i === 0) continue;` or alpha floor.
- **BUG-depth-batch-globalAlpha-loses-per-star-alpha (LOW)** — bucket quantization may produce visible banding.

#### `js/modules/performance/nebula-renderer.js`
- **BUG-nebula-renderer-dead-code-still-allocates-sprites (LOW)** — line 79-92, 237. `draw()` early-returns; sprite-canvas backing storage retained anyway. Fix: gate `generate()` on `enabled`.

#### `js/modules/performance/webgl-bullet-renderer.js`
- **BUG-bullet-init-recovery-no-supported-flip (MED)** — line 209-212. After init failure, even successful context restore leaves `supported = false`. Fix: set `this.supported = true` on `_initGL()` success in restore handler.
- **BUG-bullet-init-listeners-before-initgl (MED)** — line 230-237. Listeners survive failed init.
- **BUG-bullet-shape-charge-quad-too-small (MED)** — line 127, 374. `chargeSDF` radius 0.45 vs assumed 0.40; charge bullets render ~12.5% larger than requested.
- **BUG-bullet-fragment-discard-cuts-aa (MED)** — line 148, 152. Discard threshold tighter than AA window → hard edge on distant bullets.
- **BUG-bullet-resize-changes-canvas-size-side-effect (LOW)** — line 335-340.
- **BUG-bullet-color-empty-string-no-fallback (LOW)** — line 373.

#### `js/modules/performance/webgl-particle-atlas.js`
- Clean.

#### `js/modules/performance/webgl-particle-renderer.js`
- **BUG-particle-streak-NaN-when-speed-missing (MED)** — line 471. `p.length < p._speed * 3` → NaN when `_speed` undefined; NaN positions / sizes pushed to GPU. Fix: defensive coercion + `streakLen <= 0` early return.
- **BUG-particle-hasOwnProperty-unsafe (LOW)** — line 518. Use `Object.prototype.hasOwnProperty.call`.
- **BUG-particle-resize-changes-canvas-size-side-effect (LOW)** — line 322-330.

#### `js/modules/performance/webgl-starfield-atlas.js`
- Clean (stale comment).

#### `js/modules/performance/webgl-starfield-renderer.js`
- **BUG-starfield-no-context-loss-recovery (HIGH)** — line 260-269. `_onContextLost`/`_onContextRestored` constructed but never registered on a canvas (starfield shares context with particle renderer; only the particle path recovers). After WebGL context loss, starfield textures/buffers/program are orphaned; reloads garbage or nothing until page reload. Fix: expose `handleContextLost`/`handleContextRestored` API and have particle renderer (or engine) call them.
- **BUG-starfield-rotation-rate-times-time-precision (LOW)** — line 80, 549. Every 24h, twinkle snaps.

#### `js/modules/audio/audio-manager.js`
- **BUG-audio-mutating-imported-manifest (MED)** — line 286. `MANIFEST[name] = variantFiles;` mutates an exported constant; consumers can see different shapes pre/post init. Fix: private `this._manifest` copy.
- **BUG-audio-throttle-blocks-when-buffer-missing (MED)** — line 357-358. Throttle's `lastPlayedAt` updated before buffer check; missing-buffer sound is throttled anyway. Fix: update after successful schedule.
- **BUG-audio-resume-unawaited-may-drop-firstplay (LOW)** — line 383-385.
- **BUG-audio-startloop-skips-throttle-but-no-fallback (LOW)** — line 450-491.

#### `js/modules/audio/music-player.js`
- **BUG-music-loadtrack-settimeout-race (MED)** — line 224-227. 100ms setTimeout-based play; rapid next/prev/pause race. Fix: store and cancel pending timer.
- **BUG-music-auto-skip-on-error-runaway (MED)** — line 129-133. Whole-playlist load failure → infinite skip cycle, no user signal. Fix: consecutive-failure counter.
- **BUG-music-toggleShuffle-mutates-without-snapshot (LOW)** — line 293-303. Off-toggle doesn't restore order. Fix: snapshot original.
- **BUG-music-seek-no-clamp (LOW)** — line 287-291.
- **BUG-music-handleTimeUpdate-divide-by-zero (LOW)** — line 321-326.
- **BUG-music-handleTrackEnd-no-currentAudio-guard (LOW)** — line 328-337.

#### `js/modules/audio/sound-defs.js`, `js/playlist-data.js`
- Clean.

#### `js/modules/debug/vfx-telemetry.js`
- **BUG-vfx-telemetry-ring-buffer-overwrite-by-index (MED)** — line 141-146.
- **BUG-vfx-telemetry-collects-entity-arrays-every-frame (LOW)** — line 66-101. Up to 100k retained objects over a 1-minute debug session.
- **BUG-vfx-telemetry-prod-flag-is-window-side-channel (LOW)** — line 22.

---

### UI / HUD / Shop / Input / Platform

#### `js/modules/ui/ui-manager.js`
- **BUG-static-dom-build-skills-tab-never-mounted (LOW)** — side effect: `updateSkillsTab` (line 1838) reads `#skill-list` which never exists; silent no-op.
- **BUG-shop-money-int-bitwise-overflow (LOW)** — line 1055, 1185. `| 0` flips negative above 2^31.

#### `js/modules/ui/input-handler.js`
- **BUG-input-screenAimX-init-uses-window-not-canvas (LOW)** — line 30-33.
- **BUG-input-mousedown-during-mobile-iOS-synthesize (LOW)** — line 87-129.

#### `js/modules/ui/event-setup.js`
- **BUG-dead-canvas-shop-handlers (MED)** — line 342-535. Huge block of canvas hit-tests against `shop*Bounds` variables that are never assigned (shop went DOM-only). All branches dead. `wheel` `preventDefault()` in SHOP suppresses scrolls for nothing. Fix: delete the block.
- **BUG-blur-toggles-pause-unconditionally (MED)** — line 249-253. DOM-click-induced blurs spuriously pause; races with input-handler's blur handler. Fix: `visibilitychange` instead, or guard on `document.hasFocus()`.
- **BUG-hud-button-touchend-cancels-press-but-leaves-tracker (LOW–MED)** — line 325-339. Off-canvas mouseup leaves pressed visual stuck. Fix: window-mouseup mirror like `_gameOverPressedButton` at line 229.
- **BUG-keyup-radial-skill-branch-dead (LOW)** — line 146-155.
- **BUG-event-setup-mousedown-target-not-on-canvas-radial-consume (LOW)** — line 161-172.
- **BUG-event-setup-keydown-state-undefined-on-title (LOW defensive)** — line 46-140.

#### `js/modules/ui/static-dom.js`
- **BUG-customization-overlay-no-listeners (LOW)** — line 78-90. Save-Close button has no handler; flow dead.
- **BUG-shop-suggest-skip-stale-engine (LOW)** — line 534-543. Fallback path hides overlay but doesn't restart wave/state.
- **BUG-static-dom-build-skills-tab-never-mounted (LOW)** — line 208-224. Dead builder.

#### `js/modules/ui/analog-stick.js`
- Clean.

#### `js/modules/ui/mobile-touch.js`
- **BUG-mobile-touch-shop-state-no-routing (HIGH)** — line 87-90, 192. Mobile-touch handler early-returns outside PLAYING/WAVE_TRANSITION; desktop canvas click handler bails on mobile. Game-over screen has canvas buttons but no handler dispatches them on mobile. Mobile players can't restart from game-over via touch. Fix: allow GAME_OVER in PLAYABLE_STATES with branch that hit-tests `_gameOverButtonRects` → `_runGameOverAction`.
- **BUG-mobile-stick-touch-id-not-released-on-touchend-elsewhere (MED)** — line 290-348. Dropped touchend on iOS leaves stick stuck deflected. Fix: watchdog or 2-finger-cap release.
- **BUG-mobile-touch-radial-cancel-uses-screen-coords-wrong (LOW)** — line 313-330. Actually consistent on mobile; duplicate magic-number risk.

#### `js/modules/ui/mobile-tutorial.js`
- **BUG-mobile-tutorial-button-click-only (LOW)** — line 191. Click-only; minor lag on slow iOS.

#### `js/modules/ui/radial-menu.js`
- **BUG-radial-aim-coords-on-desktop (LOW–MED)** — line 58-60. Desktop writes `clientX/Y` (viewport), mobile writes canvas-pixel coords; radial hover slice can be offset on letterboxed/scaled canvases.
- **BUG-radial-menu-handleClick-cancels-on-dead-zone-no-fire-state-restore (LOW)** — line 75-100.

#### `js/modules/ui/hint-system.js`
- **BUG-hint-overlay-querySelector-on-stale-element (LOW)** — line 28-34. Module-level cache; stale on rebuild (dev/hot-reload).

#### `js/modules/ui/stats-overlay.js`
- **BUG-stats-state-case-mismatch (HIGH)** — line 222. `ge.game.state === 'paused'` lowercase vs `GAME_STATES.PAUSED === 'PAUSED'`. `_wasPaused` always false when opened from paused state → `togglePause()` on close mis-unpauses. Fix: import GAME_STATES, compare to `.PAUSED`.

#### `js/modules/ui/icons.js`
- **BUG-icons-getIconImage-async-rasterize-returns-blank-canvas (MED)** — line 235-259. SVG rasterize is async; first request returns empty canvas. Blank radial/HUD/loadout icons on first paint. Fix: pre-rasterize known slugs, or return promise/emoji fallback until drawn.

#### `js/modules/hud/*` (combat, cursor, hud-buttons, mobile-reticle, navigation, overlays, status)
- All clean (status.js has a dead `#shield-tanks` div but documented intentional).

#### `js/modules/shop/shop-dom.js`
- **BUG-shop-purchase-during-shop-event-bubble (MED)** — line 103-123. No click debounce; fast double-click can double-buy between renders. Currently synchronous so safe today; fragile.
- **BUG-shop-tab-click-listener-stacks-if-tabs-rebuilt (LOW)** — line 78-86.

#### `js/modules/shop/shop-manager.js`
- **BUG-shop-money-not-floored-on-deduction (LOW–MED)** — line 391, 438, 490. Float currency leaves fractional gold stranded; mismatched flooring vs ui-manager check (`| 0`). Fix: unify on `Math.floor` (or keep integer throughout).

#### `js/modules/platform/haptic.js`, `platform-detect.js`, `wake-lock.js`
- Clean.

#### `css/styles.css`
- **BUG-stats-overlay-z-index-9000-vs-hint-9999 (LOW)** — implicit stacking depends on document order; audit recommended.

---

## Cross-cutting patterns worth a sweep

1. **Wall-clock `setTimeout` in tick-based sim.** `shootPulse`, `spawnWaveAsteroids`, `disableThrusters`, `fireNova DOUBLE_PULSE`, `music-player loadTrack play`. All fire through pause / state changes. **Sweep all `setTimeout` callsites in solo and migrate to `_gameTimers` or counted in-sim timers.**
2. **Pool reuse without state scrub.** Enemies, asteroids, particles, bullets, powerups, gold all participate. The `if (=== undefined)` lazy-init pattern is a footgun — once set on slot A, persists into slot B. Audit every entity class for explicit `reset()` completeness.
3. **`window.innerWidth/Height` snapshotted in constructors.** background-star, color-star, powerup. Already patched in asteroid; replicate for the rest using `GameDimensions`.
4. **Mid-iteration release/spawn.** `bullet.explode` → `enemyPool.release`, mine cascade scenarios, formation member removal. Snapshot or backward-iterate.
5. **Dead upgrade flags.** Many `bullet.X = …` / `ring.X = …` / `missile.X = …` stamps for which no consumer exists. Either implement or remove from shop catalog.
6. **Two damage pipelines for the player.** Collapse to one (`lifecycle.takeDamage`).
7. **Boss-flag inheritance via pool recycle.** Highest-leverage fix is a one-shot scrub block at top of `initializeEnemy`.

---

## File-touched count

- Files audited: **74** (52,291 LOC).
- Files with at least one finding: **~50**.
- HIGH-severity findings: **~25**.
- MEDIUM-severity findings: **~45**.
- LOW-severity findings: **~60+** (perf, defensive, dead code, cosmetic).

Plan to fix: see `Solo Bug Fix Plan – 2026-05-18.md`.
