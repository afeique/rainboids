// Pure enemy-update step.
//
// Extracted from the monolithic `js/modules/enemy/enemy.js` `update()`
// method as the Phase-1 deliverable for the multiplayer engine refactor
// (see `docs/Multiplayer Rust Client Engine – 2026-05-07.md`, §"Phase 1:
// Engine refactor"). Sibling-of agent A's `js/sim/ship.js` extraction.
//
// **Behavior is byte-for-byte equivalent** to the existing solo enemy
// update behavior — same death-flash beats, same boss-rage call order,
// same AI throttle decision, same movement dispatch, same firing
// cadence, same position integration scaling, same boundary bounce, and
// same death-recycle threshold.
//
// What lives here:
//   - Death-flash drift integration + recycle gate
//   - Warp-in update routing
//   - Boss-rage update + per-tier formation override
//   - Late-wave AI throttle decision (`skipHeavyAI`)
//   - Target-priority + face-direction calls
//   - Movement dispatch
//   - Heavy-AI block (evasion, asteroid-avoid, distance-keep, patrol,
//     dodge-bullets) gated by `skipHeavyAI`
//   - Shooting decision dispatch (cooldown / burst gating). Bullet
//     spawns are emitted as events on the `events` array — the wrapper
//     drains them and calls the existing `firing.shoot(gameEngine)`
//     dispatcher exactly as the legacy code did.
//   - Rotation, shield rotation, music-sync pulse, micro-movements,
//     fish-like motion
//   - Per-tick position integration (scaled by `GAME_CONFIG.TICK_SCALE`)
//   - Light-trail update + trail-particle emission (the trail-particle
//     emission still goes through `gameEngine.particlePool` via the
//     existing `ai.createTrailParticles` helper — same FX path as solo).
//   - Boundary bounce (with field) or torus wraparound (without field)
//   - Death check + recycle
//
// What does NOT live here (stays on `Enemy` for now — these are
// presentation, audio, or higher-level systems):
//   - Sprite rendering, hit-flash visual decay, death-flash visual
//   - Audio events
//   - Particle effects (debris, hit-flash sparks)
//   - HUD updates
//   - Damage / takeDamage flow (still on the class until collision
//     extraction lands in a future session)
//
// Wrapper-extraction strategy (Round 2):
//   This pure function takes the LIVE Enemy instance directly. The
//   `EnemyState` typedef in `state.js` documents the per-tick mutable
//   contract; there is no separate plain-data struct yet because the
//   movement/firing/AI helpers all read off `this.<field>` and would
//   need to be ported function-by-function to a pure-args shape — a
//   surgery that doesn't fit a single Round-2 session and is left for
//   a follow-up. Mirrors agent A's surgical scope (extract the loop,
//   keep the helpers in place).
//
// Bullet-spawn events:
//   When `updateEnemy` decides the enemy should fire this tick, it
//   pushes one of these events onto the `events` array:
//     { type: 'enemy_fire', enemy: <ref> }                              — non-burst
//     { type: 'enemy_fire_burst_step', enemy: <ref>, now: <ms> }        — single burst beat
//     { type: 'enemy_fire_continuous', enemy: <ref>, kind: 'wasp_machinegun'|'sweep_laser'|'sentinel_sweep' }
//   The wrapper drains the events and calls the matching `firing.js`
//   helpers with `.call(enemy, gameEngine)` — exactly as the legacy
//   code did inline. Because the wrapper drains synchronously after
//   `updateEnemy` returns within the same tick, charging-pattern
//   timing (laser, arc_lightning) is preserved bit-for-bit.

import { GAME_CONFIG, getEnemyFiringCooldown } from '../modules/core/constants.js';
import { GameDimensions } from '../modules/core/utils.js';
import { frameClock } from '../modules/core/frame-clock.js';
import { updateBossRage, bossFormationMovement } from '../modules/enemy/boss-rage.js';
import { isMobile } from '../modules/platform/platform-detect.js';

// ─────────────────────────────────────────────────────────────────────────────
// 5.99.0 — Mobile combat redesign (replaces the 5.95 kamikaze model).
//
// The 5.95.x "fruit-ninja kamikaze" rules — all enemies divebomb the
// player, none of them shoot — produced a one-note experience where
// the only threat was contact damage. 5.99 restores the shmup loop:
//
//   1) Enemies SHOOT on mobile. The `decideEnemyShooting` short-circuit
//      is removed so the existing per-pattern firing helpers run the
//      same way they do on desktop.
//   2) Enemies WEAVE laterally instead of diving. A small per-tick
//      side-step (perpendicular to the line-of-sight to the player)
//      modulated by a per-enemy sin phase makes them strafe across the
//      shooting line so they read as evading.
//   3) The dodge logic (`dodgePlayerBullets` in ai.js) ALREADY runs
//      every tick — enemies actively swerve out of bullet paths. No
//      change needed there; with player bullets now flying their way
//      AND a sideways weave layered on top, the AI reads as active
//      evasive motion.
//
// MOBILE_WEAVE_FORCE: peak amplitude (px/tick) of the lateral side-step.
// Small enough that the per-pattern movement (HUNTER chase, GUARDIAN
// orbit, etc.) still dominates the macro motion — this is decoration
// that breaks up otherwise dead-straight trajectories.
const MOBILE_WEAVE_FORCE = 0.85;
const MOBILE_WEAVE_FREQ_HZ = 1.4;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure enemy-update step.
 *
 * Reads the current enemy state + the local game context (player ships,
 * field bounds, RNG) and integrates one tick of AI + movement + firing
 * decisions. Pushes any side-effect events (bullet spawns) onto the
 * `events` array — does NOT call audio, particles, or renderer
 * directly. (Legacy in-place trail-particle emission is preserved
 * via the `gameEngine.particlePool` path inside
 * `ai.createTrailParticles`; future sessions migrate this to events
 * too.)
 *
 * Mutates `enemy` in place (matches `Enemy.update()` shape — that
 * method already mutates `this.x`, `this.vel.x`, etc. directly).
 *
 * @param {import('./state.js').EnemyState} enemy        enemy to step
 * @param {import('./state.js').EnemyUpdateContext} ctx  per-tick context
 * @param {Array<*>} events                              out-buffer for events
 * @returns {import('./state.js').EnemyState} the (mutated) enemy state
 */
export function updateEnemy(enemy, ctx, events) {
    if (!enemy.active) return enemy;

    const gameEngine = ctx.gameEngine;
    const gameField = ctx.field || null;
    const playerRef = ctx.ships && ctx.ships.length > 0 ? ctx.ships[0] : null;

    // Cache ref for draw/takeDamage (removes window.gameEngine dependency).
    // Mirrors `enemy.js` line 270.
    enemy.gameEngine = gameEngine;

    // ── Death sequence (drift → recycle) ──
    // Mirrors `enemy.js` lines 286-318. Two-beat death:
    //   • ticks 0-11: wreck drifts under inertia (silhouette visible).
    //   • tick 12 (when `_deathFlash` reaches max-6 from the high end —
    //     i.e. tickIntoDeath ≥ 6): trigger debris burst event.
    //   • tick 24 (when `_deathFlash` decrements to 0): recycle.
    //
    // Debris-burst is emitted as an event so the wrapper can call
    // `gameEngine.triggerEnemyDebrisBurst(this)` outside the pure path.
    if (enemy._deathFlash > 0) {
        const drag = 0.97;
        enemy.vel.x *= drag;
        enemy.vel.y *= drag;
        enemy.x += enemy.vel.x * GAME_CONFIG.TICK_SCALE;
        enemy.y += enemy.vel.y * GAME_CONFIG.TICK_SCALE;
        enemy.faceAngle = (enemy.faceAngle || 0) + 0.04;

        const max = enemy._deathFlashMax || 24;
        const tickIntoDeath = max - enemy._deathFlash;

        if (!enemy._debrisBurstFired && tickIntoDeath >= 6) {
            enemy._debrisBurstFired = true;
            events.push({ type: 'enemy_debris_burst', enemy });
        }

        enemy._deathFlash--;
        if (enemy._deathFlash <= 0) {
            enemy.active = false;
        }
        return enemy;
    }

    // ── Warp-in (skip normal AI) ──
    // Mirrors `enemy.js` lines 321-324. `updateWarpIn` mutates x/y/scale
    // and clears `enemy.warping` when the curve completes.
    if (enemy.warping) {
        enemy.updateWarpIn();
        return enemy;
    }

    if (!playerRef) return enemy;
    enemy.targetPlayer = playerRef;

    // Boss rage + per-tier mechanics. Telegraphs the HP-threshold rage,
    // activates 1.5 s invuln + tantrum + screen FX, runs tier-4 phase
    // cycling, and reads tier-2 partner-death flags.
    // Mirrors `enemy.js` line 331.
    if (enemy.isBoss) updateBossRage(enemy, gameEngine);

    // Late-wave AI throttle: in waves 15+, run the heavy spatial scans
    // (asteroid/enemy/bullet avoidance) on alternating frames per
    // enemy. Mirrors `enemy.js` lines 339-340.
    const wave = ctx.wave !== undefined ? (ctx.wave | 0) :
                 ((gameEngine && gameEngine.game && gameEngine.game.currentWave) | 0);
    const tick = ctx.tick !== undefined ? ctx.tick : frameClock.tick;
    const skipHeavyAI = wave >= 15 && (tick & 1) !== enemy._aiOffset;

    // Calculate distance to player. Mirrors `enemy.js` line 343.
    const playerDistance = Math.hypot(enemy.x - playerRef.x, enemy.y - playerRef.y);

    // Distance-based behavior. Mirrors `enemy.js` line 346.
    enemy.updateTargetPriority(playerDistance, gameEngine);

    // Update face direction to look at current target. Mirrors line 349.
    enemy.updateFaceDirection();

    // Tier-3 (and tier-4 phase 0) formation orbit overrides the normal
    // movement dispatch. Mirrors `enemy.js` lines 354-360.
    if (!enemy.isBoss || !bossFormationMovement(enemy)) {
        enemy.updateMovement(gameEngine);
    }

    // 5.99.0 — Mobile lateral weave (replaces the 5.95 kamikaze pull).
    // A small sin-phased side-step perpendicular to the line-of-sight to
    // the player. Each enemy carries its own _weavePhase so the field
    // doesn't pulse in lockstep. The per-pattern velocity output is
    // preserved underneath; weave is a 60-Hz decoration that breaks up
    // dead-straight trajectories so enemies READ as actively moving
    // while they shoot. Active `dodgePlayerBullets` (called below)
    // overrides this with a harder swerve whenever a bullet is on path.
    // Bosses keep the formation-orbit mechanic.
    if (isMobile() && !enemy.isBoss) {
        if (typeof enemy._weavePhase !== 'number') {
            enemy._weavePhase = Math.random() * Math.PI * 2;
        }
        enemy._weavePhase += (MOBILE_WEAVE_FREQ_HZ * Math.PI * 2) / 60;
        const dx = playerRef.x - enemy.x;
        const dy = playerRef.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
            // Perpendicular unit vector to the player-line.
            const px = -dy / dist;
            const py =  dx / dist;
            const swing = Math.sin(enemy._weavePhase) * MOBILE_WEAVE_FORCE;
            enemy.vel.x += px * swing;
            enemy.vel.y += py * swing;
        }
    }

    if (!skipHeavyAI) {
        enemy.updateEvasiveManeuvers(gameEngine);
        enemy.avoidAsteroids(gameEngine);
        if (enemy.currentTarget === 'player') {
            enemy.maintainDistanceFromPlayer();
        }
        if (gameEngine && gameEngine.enemyPool) {
            enemy.maintainDistanceFromEnemies(gameEngine.enemyPool.active);
        }
        if (enemy.currentTarget === 'patrol') {
            enemy.patrolTerritory();
        }
        enemy.dodgeEnemyBullets(gameEngine);
        enemy.dodgePlayerBullets(gameEngine);
    }

    // Shooting decision — runs every frame. Mirrors `enemy.js` line 393
    // but routes the decision through `decideEnemyShooting` so the
    // bullet-spawn happens via events.
    decideEnemyShooting(enemy, gameEngine, events);

    // Update rotation with agility-based speed. Mirrors line 396.
    enemy.rotation += enemy.rotationSpeed;

    // Update circulating shield with music sync. Mirrors lines 399-428.
    if (enemy.shield) {
        enemy.shield.rotation += enemy.shield.rotationSpeed;
        const musicPlayer = gameEngine && gameEngine.uiManager
            ? gameEngine.uiManager.musicPlayer
            : null;
        let musicIntensity = 0.5;
        if (musicPlayer && musicPlayer.isPlaying && musicPlayer.currentAudio) {
            const musicTime = musicPlayer.getCurrentTime();
            const assumedBPM = 130;
            const beatFrequency = assumedBPM / 60;
            const beatPhase = (musicTime * beatFrequency * Math.PI * 2) + enemy.shield.basePulsePhase;
            const primaryBeat = Math.sin(beatPhase);
            const harmonicBeat = Math.sin(beatPhase * 2) * 0.3;
            const subBeat = Math.sin(beatPhase * 0.5) * 0.2;
            musicIntensity = 0.5 + (primaryBeat + harmonicBeat + subBeat) * 0.5 * enemy.shield.musicSyncIntensity;
            musicIntensity = Math.max(0.1, Math.min(1.0, musicIntensity));
        } else {
            const time = frameClock.now * 0.001;
            const fallbackPhase = (time * 2.2 * Math.PI) + enemy.shield.basePulsePhase;
            musicIntensity = 0.5 + Math.sin(fallbackPhase) * 0.3;
        }
        enemy.shield.currentIntensity = musicIntensity;
    }

    // Add random micro-movements + fish-like swimming. Lines 431-434.
    enemy.addMicroMovements();
    enemy.addFishLikeMovement();

    // Update position (scaled for tick rate). Lines 437-438.
    enemy.x += enemy.vel.x * GAME_CONFIG.TICK_SCALE;
    enemy.y += enemy.vel.y * GAME_CONFIG.TICK_SCALE;

    // Update light trail. Line 441.
    enemy.updateLightTrail();

    // Create colored trail particles. Line 444. (Still routes through
    // the existing `ai.createTrailParticles` → `gameEngine.particlePool`
    // path. Future session converts this to particle events.)
    enemy.createTrailParticles(gameEngine);

    // Boundary bouncing (with field) or torus wraparound (fallback).
    // Lines 447-474.
    if (gameField) {
        if (enemy.x - enemy.radius < 0) {
            enemy.x = enemy.radius;
            enemy.vel.x = Math.abs(enemy.vel.x) * 0.8;
        } else if (enemy.x + enemy.radius > gameField.width) {
            enemy.x = gameField.width - enemy.radius;
            enemy.vel.x = -Math.abs(enemy.vel.x) * 0.8;
        }
        if (enemy.y - enemy.radius < 0) {
            enemy.y = enemy.radius;
            enemy.vel.y = Math.abs(enemy.vel.y) * 0.8;
        } else if (enemy.y + enemy.radius > gameField.height) {
            enemy.y = gameField.height - enemy.radius;
            enemy.vel.y = -Math.abs(enemy.vel.y) * 0.8;
        }
    } else {
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        if (enemy.x < -enemy.radius) enemy.x = fieldWidth + enemy.radius;
        if (enemy.x > fieldWidth + enemy.radius) enemy.x = -enemy.radius;
        if (enemy.y < -enemy.radius) enemy.y = fieldHeight + enemy.radius;
        if (enemy.y > fieldHeight + enemy.radius) enemy.y = -enemy.radius;
    }

    // Death check (use tolerance for floating-point precision).
    // Mirrors lines 477-481.
    if (enemy.health <= 0.001 && enemy.active) {
        enemy.active = false;
        events.push({ type: 'enemy_death_recycle', enemy });
    }

    return enemy;
}

/**
 * Per-tick shooting decision. Mirrors `enemy.js`'s `updateShooting`
 * (lines 702-783) but routes the bullet-spawn into events instead of
 * calling `firing.shoot()` directly.
 *
 * Pushes one of the following events onto `events`:
 *   { type: 'enemy_fire_continuous', enemy, kind: 'wasp_machinegun'|'sweep_laser'|'sentinel_sweep' }
 *   { type: 'enemy_fire_charging', enemy }   — laser / arc_lightning advance
 *   { type: 'enemy_fire_burst', enemy, now } — burst-pattern beat
 *   { type: 'enemy_fire', enemy, now }       — non-burst single shot
 *
 * The wrapper drains these events synchronously after `updateEnemy`
 * returns and calls the matching helpers from `firing.js` so the
 * existing per-pattern spawn logic stays unchanged.
 */
function decideEnemyShooting(enemy, gameEngine, events) {
    if (!gameEngine || !gameEngine.enemyBulletPool) return;
    if (!enemy.targetPlayer) return;

    // 5.99.0 — Mobile enemies SHOOT now (the 5.95 short-circuit is
    // removed). The redesign restores the shmup loop: enemies stand
    // their ground, shoot the player, and weave/dodge to evade return
    // fire. See the file header for the full rationale.

    // Arc movement enemies can only shoot when stopped. Line 708.
    if (enemy.config.movePattern === 'arc' && !enemy.canShoot) return;

    // Tank movement enemies can only shoot when in firing state. Line 711.
    if (enemy.config.movePattern === 'tank' && enemy.tankState !== 'firing') return;

    const playerDistance = Math.hypot(
        enemy.x - enemy.targetPlayer.x,
        enemy.y - enemy.targetPlayer.y,
    );
    // Limit shooting range to ~1 screen maximum. Lines 715-720.
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const avgScreenSize = (screenWidth + screenHeight) / 2;
    const maxShootingRange = Math.min(enemy.getTerritorySize() * 1.5, avgScreenSize * 1.0);
    if (playerDistance > maxShootingRange) return;

    // Line of sight check — don't shoot if the player is blocked by
    // asteroids. Mirrors line 723.
    if (!enemy.hasLineOfSight(enemy.targetPlayer, gameEngine)) return;

    const now = frameClock.now;

    // Continuous patterns. Lines 728-743.
    if (enemy.config.shootPattern === 'wasp_machinegun') {
        events.push({ type: 'enemy_fire_continuous', enemy, kind: 'wasp_machinegun' });
        return;
    }
    if (enemy.config.shootPattern === 'sweep_laser') {
        events.push({ type: 'enemy_fire_continuous', enemy, kind: 'sweep_laser' });
        return;
    }
    if (enemy.config.shootPattern === 'sentinel_sweep') {
        events.push({ type: 'enemy_fire_continuous', enemy, kind: 'sentinel_sweep' });
        return;
    }

    // Spiral laser is triggered inside weaverSpinupMovement; nothing to
    // do at the shooting layer. Mirrors line 746.
    if (enemy.config.shootPattern === 'spiral_laser') return;

    // Aim tolerance gate — exempts charging patterns which need
    // per-frame state advancement. Lines 750-759.
    const isChargingPattern =
        enemy.config.shootPattern === 'laser' ||
        enemy.config.shootPattern === 'arc_lightning';
    if (!isChargingPattern && enemy.targetPlayer) {
        const aimDx = enemy.targetPlayer.x - enemy.x;
        const aimDy = enemy.targetPlayer.y - enemy.y;
        const toPlayer = Math.atan2(aimDy, aimDx);
        let aimDiff = toPlayer - enemy.faceAngle;
        while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
        while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
        if (Math.abs(aimDiff) > Math.PI / 6) return;
    }

    // Burst pipeline. Lines 766-768.
    const isBurstPattern =
        enemy.config.shootPattern === 'burst_3' ||
        enemy.config.shootPattern === 'burst_2' ||
        enemy.config.shootPattern === 'square_burst' ||
        enemy.config.shootPattern === 'hunter_single';

    if (isBurstPattern) {
        events.push({ type: 'enemy_fire_burst', enemy, now });
        return;
    }

    if (isChargingPattern) {
        // Charging patterns need per-frame calls to advance charge state.
        events.push({ type: 'enemy_fire_charging', enemy });
        return;
    }

    // Non-burst patterns (circle_6, homing, …). Cooldown gate. Lines 774-778.
    if (now - enemy.lastShot > enemy.firingCooldown) {
        events.push({ type: 'enemy_fire', enemy, now });
        // Update local timestamps so the wrapper's spawn call sees the
        // same lastShot/firingCooldown that the legacy inline code did.
        enemy.lastShot = now;
        enemy.firingCooldown = getEnemyFiringCooldown(enemy.type, enemy.level || 1);
    }
}

/**
 * Loop helper. Calls `updateEnemy()` over an array of enemies with the
 * shared context.
 *
 * @param {import('./state.js').EnemyState[]} enemies
 * @param {import('./state.js').EnemyUpdateContext} ctx
 * @param {Array<*>} events
 */
export function updateEnemies(enemies, ctx, events) {
    for (const enemy of enemies) {
        updateEnemy(enemy, ctx, events);
    }
}
