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
// 5.95.0 → 5.95.1 — Mobile fruit-ninja kamikaze rules.
//
// On mobile mode the enemy AI is overridden in three ways:
//   1) Enemies NEVER fire bullets — `decideEnemyShooting` short-circuits
//      before pushing any `enemy_fire*` events onto the wrapper drain
//      buffer, so the firing pipeline (burst, charging, continuous,
//      single-shot) all stays inert. The player never has projectiles
//      to dodge.
//   2) Enemies get a STRONG velocity bias toward the player every tick
//      ("kamikaze pull / divebomb"). This stacks on top of each per-
//      enemy movement pattern (HUNTER chase, GUARDIAN orbit, etc.) so
//      even patrol-only types divebomb the player. Contact damage still
//      routes through the existing player-enemy collision path
//      (collision-system.js line 1735) so the kamikaze kill behavior is
//      already wired up.
//   3) Enemies get a small per-tick random velocity perturbation so they
//      visibly zigzag/dodge ("evasive feel"). Important because the
//      player has no projectiles for enemies to actually dodge from in
//      mobile fruit-ninja mode, so the dodge is purely visual flavor
//      that breaks up the dead-straight kamikaze line.
//
// Strength tuning (5.95.1):
//   • MOBILE_KAMIKAZE_FORCE = 2.5 (was 0.6) — bumped 4x so the dive feels
//     purposeful instead of a gentle drift. Per-pattern friction still
//     damps this back down each tick, so steady-state pull is generous
//     but not instant. A confident player still has time to pick targets.
//   • MOBILE_RANDOM_WALK = 0.5 — half-pixel-amplitude jitter per axis per
//     tick. Enough to read as evasive motion at 60 Hz without overwhelming
//     the kamikaze line of pursuit.
//   • MOBILE_MAX_KAMIKAZE_SPEED = 6.0 — absolute cap on velocity magnitude
//     post-kamikaze-and-jitter so an unlucky stack of pulls doesn't
//     launch enemies off-screen. Per-pattern caps still run first; this
//     is the safety net for the cumulative bias.
const MOBILE_KAMIKAZE_FORCE = 2.5;
const MOBILE_RANDOM_WALK = 0.5;
const MOBILE_MAX_KAMIKAZE_SPEED = 6.0;
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

    // 5.95.0 → 5.95.1 — Mobile kamikaze pull + random walk + cap.
    // Bias velocity toward the player every tick on top of whatever
    // per-enemy movement pattern just ran. Even patrol/circle/orbit AIs
    // now bend toward the player (slow at long range as the inverse-
    // distance contribution is unit-normalized — the bias is direction
    // only, not strength falloff). A small random-walk term layers on
    // top so the dive reads as evasive motion at 60 Hz. The final
    // velocity is capped at MOBILE_MAX_KAMIKAZE_SPEED so an unlucky
    // accumulation of pulls doesn't launch enemies off-screen. Bosses
    // are excluded so the tier-3+ formation-orbit mechanic still reads
    // correctly; everyone else gets pulled in.
    if (isMobile() && !enemy.isBoss) {
        const dx = playerRef.x - enemy.x;
        const dy = playerRef.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1) {
            const inv = 1 / dist;
            enemy.vel.x += dx * inv * MOBILE_KAMIKAZE_FORCE;
            enemy.vel.y += dy * inv * MOBILE_KAMIKAZE_FORCE;
        }
        // Random-walk dodge — visible jitter that reads as evasive
        // motion even with no projectiles to actually evade.
        enemy.vel.x += (Math.random() - 0.5) * MOBILE_RANDOM_WALK;
        enemy.vel.y += (Math.random() - 0.5) * MOBILE_RANDOM_WALK;
        // Hard cap so cumulative kamikaze + jitter can't escape the
        // per-pattern speed budgets indefinitely.
        const sp2 = enemy.vel.x * enemy.vel.x + enemy.vel.y * enemy.vel.y;
        if (sp2 > MOBILE_MAX_KAMIKAZE_SPEED * MOBILE_MAX_KAMIKAZE_SPEED) {
            const sp = Math.sqrt(sp2);
            const k = MOBILE_MAX_KAMIKAZE_SPEED / sp;
            enemy.vel.x *= k;
            enemy.vel.y *= k;
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

    // 5.95.0 — On mobile, enemies never fire. The fruit-ninja redesign
    // (see header) makes player bullets the only projectile in flight.
    // Short-circuit before any `enemy_fire*` event is emitted so the
    // wrapper-side firing helpers (`firing.shoot`, burst, sweep, etc.)
    // all stay inert. Charging-state patterns (laser / arc_lightning)
    // also stop advancing — they only progress when this function emits
    // `enemy_fire_charging`, so suppression here halts them at idle.
    if (isMobile()) return;

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
