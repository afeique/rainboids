// SYS-11 / ENMY-10b — enemy CHARGE-AND-RAM (Juggernaut). A bruiser approaches
// the player, WINDS UP a visible tell, then COMMITS a fast charge down a LOCKED
// lane toward where the player was at charge-start — heavy on contact — and is
// left STUNNED + rear-exposed during the recovery before it can charge again.
//
// Composes the ENMY-01 telegraph helper (../telegraph.js):
//   windup  → the visible tell (the enemy holds mostly still; player reads the lane)
//   strike  → the committed ram (the enemy drives down the locked direction)
//   recover → the stunned / rear-exposed punish window
//
// It is GUARDED so it can't START a charge while STUNNED / FROZEN / CHILLED
// (mirrors WRAITHWORM's blink freeze-gate). The lane direction is LOCKED on the
// strike transition (snapshotting the player's position at charge-start), so the
// player can sidestep the lane during the wind-up.
//
// Pure given (enemy/player, now in ms); mutates only the passed enemy + its
// embedded telegraph. No globals, no Date.now(), no Math.random in the hot path,
// no rendering. The enemy holds the `charge` config on enemy.charge (a
// createTelegraph state extended with the charge params). Unit-tests cleanly.
//
// Default-safe: every wiring in enemy.js is gated on `this.charge`, which only
// JUGGERNAUT (config.charge) ever gets, so charge-less enemies behave
// byte-for-byte as before.

import {
    createTelegraph,
    startTelegraph,
    tickTelegraph,
    telegraphPhase,
    isStriking,
} from '../telegraph.js';

export const CHARGE_DEFAULTS = {
    intervalMs: 4200,   // min time between charges (measured from the last charge START)
    range: 480,         // commit a charge once the player is within this distance
    chargeSpeed: 9,     // lane speed (px/tick) during the strike
    windupMs: 700,      // telegraph wind-up before the ram fires (the visible tell)
    strikeMs: 450,      // the committed ram window (heavy contact damage lands here)
    recoverMs: 1500,    // stunned / rear-exposed punish window after the charge
    ramDamage: 38,      // heavy contact base used ONLY while striking (collision-system reads it)
};

/**
 * Create a fresh charge state — a telegraph extended with the charge params and
 * the locked-lane bookkeeping. `opts` overrides intervalMs / range / chargeSpeed
 * / ramDamage and the telegraph timings windupMs / strikeMs / recoverMs.
 * `lastChargeAt` is null until the first charge; `_locked` guards a single
 * lane-lock per telegraph cycle; `dirX/dirY` is the LOCKED unit direction;
 * `targetX/targetY` is the snapshotted player position at charge-start.
 */
export function createCharge(opts = {}) {
    const t = createTelegraph({
        windupMs: opts.windupMs ?? CHARGE_DEFAULTS.windupMs,
        strikeMs: opts.strikeMs ?? CHARGE_DEFAULTS.strikeMs,
        recoverMs: opts.recoverMs ?? CHARGE_DEFAULTS.recoverMs,
    });
    // Extend the telegraph state in place so callers can read it directly with
    // telegraphPhase(enemy.charge, now) — the charge IS the telegraph.
    t.intervalMs = opts.intervalMs ?? CHARGE_DEFAULTS.intervalMs;
    t.range = opts.range ?? CHARGE_DEFAULTS.range;
    t.chargeSpeed = opts.chargeSpeed ?? CHARGE_DEFAULTS.chargeSpeed;
    t.ramDamage = opts.ramDamage ?? CHARGE_DEFAULTS.ramDamage;
    t.lastChargeAt = null;
    t._locked = false;   // true once this cycle has locked its lane
    t._stunned = false;  // true once this cycle has applied its recovery stun
    t.dirX = 0;
    t.dirY = 0;
    t.targetX = 0;
    t.targetY = 0;
    return t;
}

// True while the enemy is under a freeze / CHILL status at `now` — mirrors the
// blink-burrow freeze-gate so a Juggernaut can't start a charge while CC'd.
function isChargeGatedByCC(enemy, now) {
    if (!enemy) return true;
    if (enemy.frozen) return true;
    if (enemy._frozenUntil > now) return true;
    if (enemy.freezeUntil > now) return true;
    if (enemy.chillUntil > now) return true;
    if (enemy.stunUntil > now) return true;
    return false;
}

/**
 * Gate for STARTING a charge: not CC'd, in range of the player, AND enough time
 * has elapsed since the last charge (>= intervalMs). The very first charge is
 * allowed (lastChargeAt null). Pure (does not mutate). With no charge config the
 * enemy can never charge.
 */
export function canCharge(enemy, player, now) {
    if (!enemy || !enemy.charge || !player) return false;
    if (isChargeGatedByCC(enemy, now)) return false;
    const cfg = enemy.charge;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    if (dx * dx + dy * dy > cfg.range * cfg.range) return false;
    const last = cfg.lastChargeAt;
    if (last == null) return true;
    return now - last >= cfg.intervalMs;
}

/**
 * Lock the charge lane toward the player's CURRENT position. Snapshots the
 * target point + computes a normalized direction. Pure helper (mutates only the
 * passed charge state); returns it. If the player is exactly on top of the enemy
 * it falls back to a rightward lane so the charge still commits.
 */
export function lockChargeTarget(enemy, player) {
    const cfg = enemy.charge;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.hypot(dx, dy);
    cfg.targetX = player.x;
    cfg.targetY = player.y;
    if (len > 0.0001) {
        cfg.dirX = dx / len;
        cfg.dirY = dy / len;
    } else {
        cfg.dirX = 1;
        cfg.dirY = 0;
    }
    return cfg;
}

/**
 * Per-frame charge driver. Returns `{ phase, started, striking, recovered }`.
 *   - idle + eligible (canCharge)  → start the wind-up telegraph.
 *   - on the STRIKE transition     → lock the lane once (lockChargeTarget) + stamp lastChargeAt.
 *   - during STRIKE                → caller drives velocity along the locked dir.
 *   - on the RECOVER transition    → caller applies the stun (recovered=true once).
 * The CC-gate only blocks STARTING a charge; once committed the ram plays out.
 * Movement integration + the stun side-effects live in enemy.js (gated on
 * `this.charge`) so this helper stays pure / unit-testable.
 */
export function tickCharge(enemy, player, now) {
    if (!enemy || !enemy.charge) {
        return { phase: 'idle', started: false, striking: false, recovered: false };
    }
    const cfg = enemy.charge;

    // While idle, begin a wind-up only if eligible (covers the CC + range +
    // cooldown gate). Reset the per-cycle latches when we settle back to idle.
    if (telegraphPhase(cfg, now) === 'idle') {
        cfg._locked = false;
        cfg._stunned = false;
        let started = false;
        if (canCharge(enemy, player, now)) {
            startTelegraph(cfg, now);
            started = true;
        }
        if (cfg.startedAt == null) {
            return { phase: 'idle', started: false, striking: false, recovered: false };
        }
        // Fall through so a just-started telegraph still ticks this frame.
        const phase0 = tickTelegraph(cfg, now);
        return { phase: phase0, started, striking: phase0 === 'strike', recovered: false };
    }

    const phase = tickTelegraph(cfg, now);

    // Lock the lane exactly once, on the first strike frame, snapshotting the
    // player's position at charge-START.
    if (phase === 'strike' && !cfg._locked && player) {
        lockChargeTarget(enemy, player);
        cfg.lastChargeAt = now;
        cfg._locked = true;
    }

    // Signal the recovery transition exactly once so the caller stuns + zeroes
    // velocity for the rear-exposed window.
    let recovered = false;
    if (phase === 'recover' && !cfg._stunned) {
        cfg._stunned = true;
        recovered = true;
    }

    return { phase, started: false, striking: phase === 'strike', recovered };
}

/**
 * True while the Juggernaut is rear-exposed (the recovery / punish window). The
 * damage path reads this (gated on enemy.charge) to apply a vulnerability
 * multiplier. Pure (does not mutate). No charge config → never vulnerable.
 */
export function isRearExposed(enemy, now) {
    if (!enemy || !enemy.charge) return false;
    return telegraphPhase(enemy.charge, now) === 'recover';
}
