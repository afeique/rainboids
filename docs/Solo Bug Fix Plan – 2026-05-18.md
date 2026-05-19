# Solo Bug Fix Plan — 2026-05-18

Companion to `Solo Bug Audit – 2026-05-18.md`. This plan sequences fixes for execution, honoring:
- **CLAUDE.md** — every separable bug fix is its own PATCH version + its own `CHANGELOG.md` entry. Do NOT lump fixes together.
- **memory/feedback_parallel_dispatch.md** — strict file ownership when parallel-dispatching subagents; subagents never run git; new-file dispatches are safest.
- **memory/feedback_no_auto_commit.md** — do not commit without explicit instruction.

**Solo VERSION at plan start:** `6.15.1`. Each PATCH listed below increments the patch number.

## Ground rules per fix

1. **Verify-first**: open the cited file:line and confirm the bug exists in current code. The audit was thorough but six parallel subagents make mistakes; budget ~30s per fix to confirm before editing.
2. **Smallest possible diff**: a fix may not bundle unrelated cleanup. Dead-code deletion is a separate fix from a behavior change.
3. **One bug → one PATCH** unless the fix is data-only (e.g., adding a missing case to a switch) and atomic with a fix in the same module.
4. **No tests yet unless the fix changes a tested code path** — the existing Jest + Playwright suite (per memory) should be run after each fix; new tests only when fixing breaks a test, or when the user explicitly asks.
5. **Do NOT commit. Wait for the user to instruct each commit.** Multi-fix dispatches stage incrementally; user reviews and instructs commits.

---

## Phase 0 — Verify highest-leverage HIGH findings (no edits yet)

Before any edits, spot-check these 10 because they drive Phase 1-3 effort:


| pool-reset-leak              | game-engine.js:1022-1037                    | `init()` really sets `pool.activeObjects = []` for all pools                     |     |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | --- |
| particle-pool-undersized     | game-engine.js:895                          | initial size is 50; MAX_PARTICLES is still 2500                                  |     |
| collision-damage-bypass      | combat/collision-system.js:1929, 2099, 2244 | all three `player.health -=` paths actually skip lifecycle.takeDamage            |     |
| explosive-bullet-skips-kill  | player/bullet.js:387-414                    | `bullet.explode` releases enemy directly, no `onEnemyKill`                       |     |
| knight-undefined-bounds      | enemy/movement.js:673-674                   | `this.width` is `undefined` on the Enemy instance                                |     |
| maintainDistance-pool-field  | sim/enemy.js:238                            | `gameEngine.enemyPool.active` is `undefined`; `.activeObjects` is the real field |     |
| pool-recycle-state-leak      | enemy/enemy.js:46-234                       | enumerate which state fields are actually NOT reset in `initializeEnemy`         |     |
| stats-state-case-mismatch    | ui/stats-overlay.js:222                     | confirm lowercase `'paused'` literal vs GAME_STATES.PAUSED                       |     |


| Verify                       | File:line                                   | Spot-check that                                                                  |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| pool-reset-leak              | game-engine.js:1022-1037                    | `init()` really sets `pool.activeObjects = []` for all pools                     |
| particle-pool-undersized     | game-engine.js:895                          | initial size is 50; MAX_PARTICLES is still 2500                                  |
| collision-damage-bypass      | combat/collision-system.js:1929, 2099, 2244 | all three `player.health -=` paths actually skip lifecycle.takeDamage            |
| deflector-orbs-never-spawned | player/skills.js:308-331                    | DEFLECTOR_ORBS activation never populates `this.deflectorOrbs`                   |
| emp-pulse-never-stuns        | player/skills.js:308-331                    | EMP_PULSE never sets `empPulseActive` and never calls `enemy.stun`               |
| explosive-bullet-skips-kill  | player/bullet.js:387-414                    | `bullet.explode` releases enemy directly, no `onEnemyKill`                       |
| knight-undefined-bounds      | enemy/movement.js:673-674                   | `this.width` is `undefined` on the Enemy instance                                |
| maintainDistance-pool-field  | sim/enemy.js:238                            | `gameEngine.enemyPool.active` is `undefined`; `.activeObjects` is the real field |
| pool-recycle-state-leak      | enemy/enemy.js:46-234                       | enumerate which state fields are actually NOT reset in `initializeEnemy`         |
| stats-state-case-mismatch    | ui/stats-overlay.js:222                     | confirm lowercase `'paused'` literal vs GAME_STATES.PAUSED                       |

If any of these verifications fail (audit was wrong), strike the corresponding entries from later phases.

---

## Phase 1 — HIGH severity, file-isolated fixes (parallel-safe)

Each fix below touches a small region of one file. **Each is one PATCH version with its own CHANGELOG entry.** They can be dispatched in parallel to subagents respecting strict file ownership: no two parallel subagents touch the same file.

### Group 1a — engine/main/core (no overlap with each other)

| #   | PATCH  | Bug                         | Files touched                    | Edit summary                                                                                                                                         |
| --- | ------ | --------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 6.15.2 | touchstart-listener-leak    | `js/main.js`                     | Inside `consumeTitleScreen` add `window.removeEventListener('touchstart', onTouchWarmAudio)`.                                                        |
| 2   | 6.15.3 | eventbus-emit-unsub-skip    | `js/modules/core/event-bus.js`   | In `emit`, iterate over `list.slice()` snapshot.                                                                                                     |
| 3   | 6.15.4 | pool-reset-leak             | `js/modules/game-engine.js`      | Replace each `pool.activeObjects = []` in `init()` with a drain loop that returns objects through `pool.release()`.                                  |
| 4   | 6.15.5 | particle-pool-undersized    | `js/modules/game-engine.js`      | Pass `GAME_CONFIG.MAX_PARTICLES` to `new PoolManager(Particle, …)`.                                                                                  |
| 5   | 6.15.6 | survivaltime-during-pause   | `js/modules/game-engine.js`      | Drop wall-clock `Date.now() - gameStartTime`. Accumulate `survivalTime += LOGIC_TICK_MS` per logic tick (already only runs PLAYING/WAVE_TRANSITION). |
| 6   | 6.15.7 | cleanup-interval-tick-storm | `js/modules/game-engine.js`      | Add `_lastCleanupSecond = -1`; gate sweep on `sec !== _lastCleanupSecond`.                                                                           |
| 7   | 6.15.8 | input-bind-per-frame-alloc  | `js/modules/game-engine.js`      | Bind `updateAimForPlayerMovement` once in constructor.                                                                                               |
| 8   | 6.15.9 | stats-state-case-mismatch   | `js/modules/ui/stats-overlay.js` | Import `GAME_STATES`; compare to `GAME_STATES.PAUSED`.                                                                                               |

**Dispatch shape:** #1, #2, #8 can all run in parallel (different files). #3-#7 all touch `game-engine.js` so they MUST be sequential (one subagent at a time, or one combined subagent that does all of them — but per CLAUDE.md, each must be a separate commit/version).

### Group 1b — enemy/wave (subset can parallel-dispatch)

| # | PATCH | Bug | Files touched | Edit summary |
|---|---|---|---|---|
| 9 | 6.15.10 | knight-undefined-bounds | `js/modules/enemy/movement.js` | Use `GameDimensions.width`/`.height` in `startKnightMove` clamp. |
| 10 | 6.15.11 | maintainDistance-wrong-pool-field | `js/sim/enemy.js` | `enemyPool.activeObjects` (rename one identifier). |
| 11 | 6.15.12 | titan-tonahawk-typo | `js/modules/enemy/firing.js` + `js/sim/bullet.js` (if mirrored) | Rename `'titan_tonahawk'` → `'titan_tomahawk'` and add corresponding `applyMovementPattern` case (accelerating purple missile). |
| 12 | 6.15.13 | pool-recycle-state-leak | `js/modules/enemy/enemy.js` | Add explicit reset block to `initializeEnemy` enumerating every per-type state field. Or rewrap under `this._typeState = null`. Verify against the enumerated list in the audit; consider a code-gen comment. |
| 13 | 6.15.14 | pool-recycle-boss-flags-leak | `js/modules/enemy/enemy.js` + `js/modules/wave/wave-manager.js` | Inside `initializeEnemy` (or at top of `applyEnemyLevelScaling` before boss-set), explicitly clear `isBoss`, `bossTier`, `bossSizeMul`, `isMiniBoss`, all `_rage*`, `_partnerDied`, `_bossPair`, `_phaseTimer`, `_phaseIdx`, `_formationCenter/Angle/Radius/Omega`, `enableHomingBullets`. |
| 14 | 6.15.15 | spawnWaveAsteroids-setTimeout-race | `js/modules/wave/wave-manager.js` | Replace setTimeout stagger with `_gameTimers` or capture `currentWave` at schedule time and bail in callback when changed. |

**Dispatch shape:** #9, #10, #11 hit different files — parallel-safe. #12 + #13 both touch `enemy.js`, do them sequentially in that order (state-leak first, then boss-flag leak — boss-flag reset extends state-leak's block). #14 standalone.

### Group 1c — world / physics

| # | PATCH | Bug | Files touched | Edit summary |
|---|---|---|---|---|
| 15 | 6.15.16 | powerup-resize-stale-dimensions | `js/modules/world/powerup.js` | Wrap by `GameDimensions.width/height` (already pattern used elsewhere). |
| 16 | 6.15.17 | spatial-grid-out-of-bounds-truncated | `js/modules/performance/spatial-grid.js` | Early-return on insert when entity entirely outside grid. (First verify no caller depends on tracking off-grid entities — e.g., off-screen enemies still queried for orbit math.) |

**Dispatch shape:** different files — parallel-safe.

### Group 1d — rendering

| # | PATCH | Bug | Files touched | Edit summary |
|---|---|---|---|---|
| 17 | 6.15.18 | starfield-no-context-loss-recovery | `js/modules/performance/webgl-starfield-renderer.js` (+ wire from particle renderer or engine) | Expose `handleContextLost()` / `handleContextRestored()`. Call from the particle renderer's context-loss callbacks (since they share the same gl context). |

### Group 1e — UI

| # | PATCH | Bug | Files touched | Edit summary |
|---|---|---|---|---|
| 18 | 6.15.19 | mobile-touch-shop-state-no-routing | `js/modules/ui/mobile-touch.js` | Allow GAME_OVER in PLAYABLE_STATES guard; route touchstart to hit-test against `gameEngine._gameOverButtonRects` and call `_runGameOverAction`. |

---

## Phase 2 — HIGH severity refactor (single-fix, multi-callsite)

### #19 — Collision damage pipeline unification — PATCH 6.15.20

**Bug:** BUG-collision-damage-bypasses-takeDamage-pipeline (also folds in BUG-lastDamageAt-not-updated-on-collision and BUG-handlePlayerEnemyCollision-skips-tank-flash-and-static-shield).

**File:** `js/modules/combat/collision-system.js` lines 1929-1930, 2099-2100, 2244-2245.

**Plan:**
1. Read `lifecycle.takeDamage` to understand its full pipeline (REFLEXES dodge, STATIC_FIELD shield decrement, LAST_STAND save, mobile damage multiplier, `_lastDamageAt` update, tank consumption, screen flash, audio).
2. In each of the three collision branches, replace `player.health = Math.max(0, player.health - finalDamage)` with `this.takeDamage(baseDamage)` (or whatever the lifecycle method is called from collision-system scope — likely `gameEngine.player.takeDamage(...)` or via a router).
3. Preserve bounce/FX after the takeDamage call.
4. After change, audit collision tests: `npm run test:qa` and any e2e player-death tests. Expect REFLEXES to start dodging collisions; that's correct behavior per audit, but visually new.

**Why standalone:** This is one architectural fix with multi-callsite impact. The audit calls it the highest-impact bug in the player/combat scope.

---

## Phase 3 — Implement promised-but-dead upgrades (HIGH-impact, scope-significant)

These are not "fix the bug" — they are "implement what the shop UI promises". Each is its own MINOR version because it's a new system, per CLAUDE.md semver rules.

**Important:** confirm intent with the user before implementing. The alternative — removing the upgrade from the shop catalog — is a MINOR (removed feature). Both are valid; user picks.

| # | MINOR | Upgrade | Bug ID | Implementation outline |
|---|---|---|---|---|
| 20 | 6.16.0 | DEFLECTOR_ORBS | deflector-orbs-never-spawned | Populate `player.deflectorOrbs[]` on activate with N entries around the player; each orb has position, hits remaining, active. Update collision-system to block bullets that intersect any orb. EXTRA_ORB adds count; HARDENED_ORBS adds hits; REFLECT spawns return-bullets. |
| 21 | 6.16.1 | EMP_PULSE | emp-pulse-never-stuns | On activate set `player.empPulseActive=true`, `empPulseStartTime=Date.now()` for renderer; iterate enemyPool within `config.radius + WIDE_BAND*60` and call `enemy.stun?.(config.duration)`. Implement `enemy.stun()` if absent (sets `_stunUntil = Date.now() + duration`, gates `update` movement+firing). |
| 22 | 6.16.2 | KINETIC_IMPACT + MASS_DRIVER knockback | kinetic-impact-knockback-never-applied | In bullet-asteroid/enemy hit handlers, after damage, apply `bullet.knockback` impulse along bullet velocity direction. |
| 23 | 6.16.3 | DAISY_CHAIN | mine-daisy-chain-never-fires | On mine trigger, find other mines within `DAISY_CHAIN_RADIUS * mine.daisyChain` and trigger them. |
| 24 | 6.16.4 | AFTERSHOCK | nova-aftershock-never-fires | Add per-enemy slow when a nova ring hits, durationMs from `ring.aftershock` config. |
| 25 | 6.16.5 | CLUSTER_WARHEAD | cluster-warhead-never-splits | On missile explode-on-impact, spawn N sub-missiles per `missile.cluster`. |
| 26 | 6.16.6 | POISON_TIP / SUPPRESSION / STATIC_CHARGE / SHRAPNEL / THROUGH_AND_THROUGH | dead-bullet-flag-upgrades | Implement each consumer in the appropriate hit path. Alternatively, one combined MINOR that removes all five from PRIMARY_UPGRADES. Decide with user. |
| 27 | 6.16.7 | Defense skill upgrades (RETALIATION, EMERGENCY_PROTOCOL, EMP_OVERLOAD, CASCADE, FORTIFY/EXTENDED_CARE, REDIRECTION) | bulwark-retaliation-noop / repair-emergency-noop / tractor-redirection-noop / etc | Implement each consumer, or remove from defense-data.js. Likely multiple MINORs — one per skill family. |

**Recommendation:** Don't start Phase 3 without user direction. The cleaner-product answer might be to remove these upgrades from the shop and ship the audit's reduced catalog as a MINOR (deprecation/removal); the heavier answer is to implement all of them. The scope difference is days-vs-weeks.

---

## Phase 4 — MEDIUM severity (single-file, parallel-safe by group)

Each is its own PATCH version + changelog entry. Group by file ownership.

### Group 4a — combat / player
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | mine-blast-uses-current-stacks | combat/collision-system.js:1129 |
| 6.16.X | piercing-bullet-applies-explosion-once-per-hit (after user confirms it's not intentional) | combat/collision-system.js:296-299 |
| 6.16.X | explosive-bullet-explosion-ignores-asteroids-and-mines | player/bullet.js:360-418 |
| 6.16.X | applyHealthOrbToTanks-condition (verify first) | player/lifecycle.js:236-244 |

### Group 4b — enemy
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | shootPulse-setTimeout-pause-leak | enemy/firing.js:532-538 |
| 6.16.X | sentinel-bursts-stuck-on-recycle (fold into pool-recycle-state-leak above; cross-link) | enemy/firing.js:1232 |
| 6.16.X | tier4-phase-message-while-not-triggered | enemy/boss-rage.js:83-107 |
| 6.16.X | enemy-fire-update-lastShot-pre-fire | sim/enemy.js:431-436 |
| 6.16.X | spiralAngle-name-collision | enemy/firing.js + movement.js |

### Group 4c — world
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | line-debris-degenerate-atan2 | world/line-debris.js:31-34 |
| 6.16.X | particle-spawnparticle-vel-explodes | world/particle.js:303-306 |
| 6.16.X | asteroid-radius-from-min-max-not-bounding | world/asteroid.js:282 |
| 6.16.X | gold-coin-cumulative-snap-acceleration | world/gold-coin.js |
| 6.16.X | gold-shape-cumulative-snap-acceleration | world/gold-shape.js |
| 6.16.X | stat-pickup-cumulative-snap-acceleration | world/stat-pickup.js |
| 6.16.X | background-star-resize-stale-dimensions | world/background-star.js |
| 6.16.X | color-star-resize-stale-dimensions | world/color-star.js |
| 6.16.X | spatial-grid-not-idempotent-after-resize (defensive comment) | performance/spatial-grid.js |
| 6.16.X | quadtree-getindex-boundary-exclusion / quadtree-retrieve-duplicate-objects | performance/quadtree.js — OR delete the file if unused |

### Group 4d — rendering / audio
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | particle-streak-NaN-when-speed-missing | performance/webgl-particle-renderer.js:471 |
| 6.16.X | bullet-init-recovery-no-supported-flip | performance/webgl-bullet-renderer.js:209 |
| 6.16.X | bullet-init-listeners-before-initgl | performance/webgl-bullet-renderer.js:230 |
| 6.16.X | bullet-shape-charge-quad-too-small | performance/webgl-bullet-renderer.js |
| 6.16.X | bullet-fragment-discard-cuts-aa | performance/webgl-bullet-renderer.js |
| 6.16.X | music-loadtrack-settimeout-race | audio/music-player.js:224 |
| 6.16.X | music-auto-skip-on-error-runaway | audio/music-player.js:129 |
| 6.16.X | music-toggleShuffle-mutates-without-snapshot | audio/music-player.js:293 |
| 6.16.X | music-handleTimeUpdate-divide-by-zero | audio/music-player.js:321 |
| 6.16.X | audio-mutating-imported-manifest | audio/audio-manager.js:286 |
| 6.16.X | audio-throttle-blocks-when-buffer-missing | audio/audio-manager.js:357 |
| 6.16.X | vfx-telemetry-ring-buffer-overwrite-by-index | debug/vfx-telemetry.js |

### Group 4e — UI / shop / mobile
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | dead-canvas-shop-handlers (delete dead block) | ui/event-setup.js:342-535 |
| 6.16.X | blur-toggles-pause-unconditionally | ui/event-setup.js:249 |
| 6.16.X | mobile-stick-touch-id-not-released-on-touchend-elsewhere | ui/mobile-touch.js:290 |
| 6.16.X | hud-button-touchend-cancels-press-but-leaves-tracker | ui/event-setup.js:325 |
| 6.16.X | icons-getIconImage-async-rasterize-returns-blank-canvas | ui/icons.js:235 |
| 6.16.X | shop-purchase-during-shop-event-bubble | shop/shop-dom.js:103 |
| 6.16.X | savefile-null-snapshot | core/storage.js:61 + game-engine.js:1237 |

### Group 4f — core
| PATCH | Bug | File |
|---|---|---|
| 6.16.X | frameclock-stale-in-catchup | core/frame-clock.js + game-engine.js |

---

## Phase 5 — LOW severity (batchable; consider one "polish & dead-code" MINOR)

These are perf, defensive, dead-code, cosmetic. Grouping them into a single MINOR ("polish & dead-code sweep") is acceptable under CLAUDE.md *if* the user explicitly endorses bundling (otherwise default to one PATCH each per the granularity rule).

Highlights:
- Delete `bullet.applyHoming` (dead, ~110 LOC).
- Delete `_buildSkillsTab` + `updateSkillsTab`.
- Delete customization overlay or wire it.
- Decide on quadtree.js — archive if confirmed unused (per OPT-8 SpatialGrid superseded it).
- `dodgeEnemyBullets` perf — convert forEach to indexed for-loop with AABB pre-cull.
- `camera-getvisiblestars-filter-allocates` — reuse scratch array.
- `depth-bucket-zero-renders-fully-invisible` — skip bucket 0.
- `wrapValue`/`wrap` math-modulo correctness (latent, no callers today).
- `nebula-renderer-dead-code-still-allocates-sprites` — gate generation on enabled flag.
- All the various LOW UI defensive guards.

---

## Cross-cutting cleanup sweeps (proposed, not yet committed)

These are not single bugs — they're patterns to audit and fix coherently. Each could be one MINOR ("refactor sweep") with multiple file touches.

| Sweep | Scope | Proposed version |
|---|---|---|
| Replace wall-clock `setTimeout` in sim with `_gameTimers` / counted in-sim timers | shootPulse, spawnWaveAsteroids, disableThrusters, fireNova DOUBLE_PULSE, music loadTrack play | 6.17.0 |
| Pool-reuse state-scrub audit | enemy.js (covered Phase 1), asteroid.js, particle.js, bullet.js, powerup.js, gold-coin.js, gold-shape.js, stat-pickup.js | 6.17.1 |
| `window.innerWidth/Height` → `GameDimensions` migration for any class capturing in ctor | background-star, color-star, powerup (covered Phase 1), possibly others | 6.17.2 |
| Defense/weapon catalog cleanup — drop or implement every promised-but-dead upgrade | weapon-data.js, defense-data.js + consumers | Phase 3 above |

---

## README impact

The fix plan affects the README in these cases:
- **Phase 3 removals** (if user picks "remove dead upgrades" path): the upgrade list in README must be updated.
- **Quadtree deletion** (if confirmed): project structure note in README must be updated.
- **Mobile game-over restart fix**: README mobile controls section may need a one-line note.

Otherwise, internal bug fixes don't trigger README updates per CLAUDE.md.

---

## Execution recipe (when user instructs to start fixing)

1. Pick a phase or specific bug ID. **Do NOT start Phase 3 without explicit user direction on implement-vs-remove for each upgrade.**
2. For Phase 1 / Phase 4, dispatch parallel-safe groups: one subagent per file with strict file ownership, brief tells them to verify the bug at the cited line *before* editing.
3. Subagents never commit. After their edits, I (the orchestrator) run `npm run test:unit` + `npm run test:qa` from CLAUDE.md's test recipe to validate.
4. Show the user the diff and the failing/passing test summary.
5. **Wait for explicit "commit" instruction** before staging and committing. Per memory: do not auto-commit.
6. On commit, follow CLAUDE.md exactly: one bug fix → one PATCH bump in `VERSION` → one new section in `CHANGELOG.md` under `### Fixed` → one commit.

---

## Open questions for user

1. **Phase 3 direction:** for each of the ~15 dead upgrades, implement or remove? (You can answer "all implement" / "all remove" / mixed.)
2. **Phase 5 bundling:** one polish MINOR or strict one-PATCH-per-fix?
3. **Quadtree:** archive `js/modules/performance/quadtree.js` if it's confirmed dead?
4. **Verification first?** Want me to run Phase 0 (verify 10 highest-leverage HIGH findings) before starting any edits?
5. **Starting point:** Phase 1 in priority order, or jump straight to the collision pipeline (Phase 2)?
