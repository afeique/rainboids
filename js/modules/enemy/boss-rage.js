// Boss rage + per-tier mechanics (5.77.0, G1 + G2).
//
// One-shot HP-based rage trigger:
//   • Boss enters a 24-frame TELEGRAPH (red pulse + faint scream particles).
//   • On telegraph end → 1.5 s INVULN window + screen flash + screen shake.
//   • 16-bullet circular tantrum at activation.
//   • firingCooldown × 0.66 + enableHomingBullets = true for the rest of the fight.
//   • Latched via `_rageTriggered` so it only fires once.
//
// Per-tier overlays:
//   • Tier 2 — `_bossPair` shared between bosses. When one dies, the
//              survivor's `_partnerDied = true` flag triggers immediate rage
//              regardless of HP (handled in the spawn link + the rage trigger
//              check below).
//   • Tier 3 — three TITANs share a `_formationCenter` they orbit at fixed
//              angular offsets. `bossFormationMovement` overrides the normal
//              movement dispatch.
//   • Tier 4 — `_phaseTimer` cycles every 12 s. Phase 0 = formation orbit,
//              Phase 1 = free raged AI. The HP-based rage still latches the
//              first time the threshold trips, so phase 1 inherits homing +
//              fast fire even before the timer would naturally trigger it.
//
// All effects gated on `_rageActive` so tier 4 can toggle cleanly.

import { frameClock } from '../core/frame-clock.js';

const TELEGRAPH_FRAMES = 24;          // 0.4 s at 60 Hz
const RAGE_INVULN_MS = 1500;
const TANTRUM_BULLETS = 16;
const TANTRUM_BULLET_SPEED = 4;
const RAGE_FIRE_RATE_MUL = 0.66;
const PHASE_INTERVAL_FRAMES = 720;    // 12 s at 60 Hz

// Returns true if the boss is currently invulnerable due to rage entry.
export function bossRageBlocksDamage(enemy) {
    if (!enemy || !enemy.isBoss) return false;
    if (!enemy._rageInvulnUntil) return false;
    return Date.now() < enemy._rageInvulnUntil;
}

// Called every frame from enemy.update. Handles telegraph, activation,
// per-tier mechanics, and Tier-4 phase cycling.
export function updateBossRage(enemy, gameEngine) {
    if (!enemy || !enemy.isBoss) return;

    // ── Tier-2 partner death → immediate rage trigger ───────────────
    if (!enemy._rageTriggered && enemy._bossPair && enemy._partnerDied) {
        beginRageTelegraph(enemy);
    }

    // ── HP-threshold trigger (all tiers) ────────────────────────────
    if (!enemy._rageTriggered && enemy._rageTelegraph === undefined) {
        if (enemy.health <= enemy.maxHealth * 0.33) {
            beginRageTelegraph(enemy);
        }
    }

    // ── Telegraph countdown ─────────────────────────────────────────
    if (enemy._rageTelegraph > 0) {
        enemy._rageTelegraph--;
        // Sparse red embers during the wind-up so the player sees the
        // tell before the burst lands.
        if ((enemy._rageTelegraph & 3) === 0 && gameEngine && gameEngine.particlePool) {
            for (let i = 0; i < 3; i++) {
                const a = Math.random() * Math.PI * 2;
                const p = gameEngine.particlePool.get(enemy.x, enemy.y, 'starSparkle');
                if (p) {
                    p.color = '#ff3344';
                    p.vel.x = Math.cos(a) * 1.5;
                    p.vel.y = Math.sin(a) * 1.5;
                }
            }
        }
        if (enemy._rageTelegraph === 0) {
            activateRage(enemy, gameEngine);
        }
    }

    // ── Tier-4 phase cycling ────────────────────────────────────────
    // Bosses get their `_phaseTimer` initialized from `applyEnemyLevelScaling`
    // when they spawn at tier 4. Counts DOWN every frame; on hit zero,
    // toggles the active phase and resets.
    if (enemy.bossTier === 4) {
        if (enemy._phaseTimer === undefined) {
            enemy._phaseTimer = PHASE_INTERVAL_FRAMES;
            enemy._phaseIdx = 0;       // 0 = formation, 1 = free rage
        }
        enemy._phaseTimer--;
        if (enemy._phaseTimer <= 0) {
            enemy._phaseTimer = PHASE_INTERVAL_FRAMES;
            enemy._phaseIdx = (enemy._phaseIdx + 1) & 1;
            // Entering free-rage phase: trigger rage if it hasn't already
            // (the HP threshold may not have been crossed yet).
            if (enemy._phaseIdx === 1 && !enemy._rageTriggered) {
                activateRage(enemy, gameEngine);
            }
            // Toast the phase change so the player can read the shift.
            if (gameEngine && gameEngine.events?.emit) {
                gameEngine.events.emit('ui:show-message', {
                    title: enemy._phaseIdx === 0 ? 'FORMATION PHASE' : 'RAGE PHASE',
                    subtitle: '',
                    duration: 1400,
                    position: 'top',
                });
            }
        }
    }
}

function beginRageTelegraph(enemy) {
    enemy._rageTelegraph = TELEGRAPH_FRAMES;
}

function activateRage(enemy, gameEngine) {
    enemy._rageTriggered = true;
    enemy._rageActive = true;
    enemy._rageInvulnUntil = Date.now() + RAGE_INVULN_MS;
    // Cooldown adjustment is one-shot to avoid stacking on tier-4 phase
    // toggles. Re-applying a 0.66 mul each toggle would shrink the cooldown
    // to nothing.
    if (!enemy._rageFireRateApplied) {
        enemy.firingCooldown = Math.round(enemy.firingCooldown * RAGE_FIRE_RATE_MUL);
        enemy._rageFireRateApplied = true;
    }
    enemy.enableHomingBullets = true;

    // Screen FX.
    if (gameEngine && typeof gameEngine.triggerScreenFlash === 'function') {
        gameEngine.triggerScreenFlash(0.42, 12);
    }
    if (gameEngine && typeof gameEngine.triggerScreenShake === 'function') {
        gameEngine.triggerScreenShake(40, 22);
    }

    // 16-bullet circular tantrum. Even angular spacing.
    if (typeof enemy.createEnemyBullet === 'function') {
        for (let i = 0; i < TANTRUM_BULLETS; i++) {
            const a = (i / TANTRUM_BULLETS) * Math.PI * 2;
            enemy.createEnemyBullet(gameEngine, a, TANTRUM_BULLET_SPEED, '#ff3344', false, 'aimed');
        }
    }

    // Scream particle burst (32 red embers).
    if (gameEngine && gameEngine.particlePool) {
        for (let i = 0; i < 32; i++) {
            const a = Math.random() * Math.PI * 2;
            const p = gameEngine.particlePool.get(enemy.x, enemy.y, 'explosion');
            if (p) {
                p.color = '#ff3344';
                p.vel.x = Math.cos(a) * (4 + Math.random() * 6);
                p.vel.y = Math.sin(a) * (4 + Math.random() * 6);
            }
        }
    }

    // Audio.
    if (gameEngine && gameEngine.events?.emit) {
        gameEngine.events.emit('audio:player-explosion');
        const name = (enemy.config && enemy.config.name) || 'BOSS';
        gameEngine.events.emit('ui:show-message', {
            title: 'BOSS RAGE',
            subtitle: `${name} grows enraged`,
            duration: 1800,
            position: 'top',
        });
    }
}

// ── Tier-3 / Tier-4 formation orbit ────────────────────────────────
// Three (or more) bosses share a `_formationCenter` and rotate around
// it at fixed angular offsets. `_formationRadius` and `_formationOmega`
// are seeded by `linkBossFormation`. Returns true if it overrode the
// movement step (caller should skip the normal updateMovement).
export function bossFormationMovement(enemy) {
    if (!enemy._formationCenter) return false;
    // Tier-4 only orbits during phase 0 (formation phase). Phase 1 lets
    // the normal raged AI take over.
    if (enemy.bossTier === 4 && enemy._phaseIdx === 1) return false;

    const center = enemy._formationCenter;
    enemy._formationAngle = (enemy._formationAngle || 0) + (enemy._formationOmega || 0.012);
    const targetX = center.x + Math.cos(enemy._formationAngle) * (enemy._formationRadius || 320);
    const targetY = center.y + Math.sin(enemy._formationAngle) * (enemy._formationRadius || 320);

    // 5.78.0 — critically-damped spring (S1). Replaces the directional
    // steering that produced a lazy chase pattern around the slot at
    // high speed scaling. Spring constant `k` plus damping `damp` gives
    // a tight lock-on: vel decays by `(1 - damp)` then re-accumulates
    // toward `(target - pos) × k`. Tuned so wave-20 speed-scaled bosses
    // settle in 1-2 orbit ticks rather than oscillating.
    const speed = (enemy.config && enemy.config.speed) || 1.5;
    const k = 0.08;
    const damp = 0.20;
    enemy.vel.x = enemy.vel.x * (1 - damp) + (targetX - enemy.x) * k;
    enemy.vel.y = enemy.vel.y * (1 - damp) + (targetY - enemy.y) * k;
    // Cap velocity so the boss can't snap-warp.
    const maxV = speed * 1.8;
    const v = Math.hypot(enemy.vel.x, enemy.vel.y);
    if (v > maxV) {
        enemy.vel.x = (enemy.vel.x / v) * maxV;
        enemy.vel.y = (enemy.vel.y / v) * maxV;
    }
    return true;
}

// Wave manager calls this after spawning N bosses in a single sub-wave.
// Pairs them so partner-death triggers + formation orbits work.
export function linkBosses(bosses, gameField) {
    if (!bosses || bosses.length < 2) return;

    // Tier-2 pair link: every boss knows about every other boss in the
    // pair. Death-handling code reads `_bossPair` and tags survivors
    // with `_partnerDied = true`.
    for (const b of bosses) {
        b._bossPair = bosses.filter(other => other !== b);
    }

    // Tier-3+ formation: shared center at the gameField midpoint. Even
    // angular offsets around the circle. Skip if only 2 bosses (tier 2
    // doesn't formation-orbit).
    if (bosses.length >= 3 || (bosses[0] && bosses[0].bossTier === 4)) {
        const cx = gameField ? gameField.width / 2 : 960;
        const cy = gameField ? gameField.height / 2 : 540;
        const radius = Math.min(380, (gameField?.width || 1920) * 0.22);
        const omegaSign = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < bosses.length; i++) {
            const b = bosses[i];
            b._formationCenter = { x: cx, y: cy };
            b._formationAngle = (i / bosses.length) * Math.PI * 2;
            b._formationRadius = radius;
            b._formationOmega = omegaSign * 0.012;
        }
    }
}

// Wave manager calls this when a boss is destroyed. Notifies its
// pair partners so the survivor immediately enters rage.
export function notifyBossDeath(deadBoss) {
    if (!deadBoss || !deadBoss._bossPair) return;
    for (const other of deadBoss._bossPair) {
        if (other && other.active) {
            other._partnerDied = true;
        }
    }
}
