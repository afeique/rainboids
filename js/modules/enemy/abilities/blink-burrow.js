// SYS-10 / ENMY-07 — enemy teleport / burrow movement. A "Tesla Wraith /
// Wraithworm"-type enemy periodically RELOCATES itself: a short blink (random
// point near its current spot) or a burrow→re-emerge (surfaces near the
// player). Each relocation is TELEGRAPHED first — the enemy winds up so the
// player sees it's about to vanish/reappear — and the actual jump fires on the
// telegraph's STRIKE transition. It is GUARDED so it can't blink while frozen
// (CHILL / freeze status): frozen enemies neither start a telegraph nor jump.
//
// Composes the ENMY-01 telegraph helper (../telegraph.js) for the wind-up: the
// blink lands during the strike window, then recovers back to idle before the
// next interval is eligible.
//
// Pure given (enemy/player, now in ms, injected rng); mutates only the passed
// enemy + its embedded telegraph. No globals, no Date.now(), no Math.random in
// the hot path (rng is injected, default Math.random), no rendering. The enemy
// holds the `blink` config on enemy.blink. Unit-tests cleanly.

import {
    createTelegraph,
    startTelegraph,
    tickTelegraph,
    telegraphPhase,
    isStriking,
} from '../telegraph.js';

export const BLINK_DEFAULTS = {
    intervalMs: 3500,   // min time between blinks (measured from the last jump)
    range: 220,         // blink: radius around self; burrow: radius around player
    kind: 'blink',      // 'blink' (jump near self) | 'burrow' (re-emerge near player)
    windupMs: 500,      // telegraph wind-up before the jump fires
    strikeMs: 120,      // jump lands during this window
    recoverMs: 300,     // cooldown after re-emerging
};

/**
 * Create a fresh blink state, embedding a telegraph for the wind-up. `opts` may
 * override intervalMs / range / kind, plus the telegraph timings windupMs /
 * strikeMs / recoverMs (defaults from BLINK_DEFAULTS). `lastBlinkAt` is null
 * until the first relocation; `_executed` guards a single jump per telegraph.
 */
export function createBlink(opts = {}) {
    return {
        intervalMs: opts.intervalMs ?? BLINK_DEFAULTS.intervalMs,
        range: opts.range ?? BLINK_DEFAULTS.range,
        kind: opts.kind ?? BLINK_DEFAULTS.kind,
        telegraph: createTelegraph({
            windupMs: opts.windupMs ?? BLINK_DEFAULTS.windupMs,
            strikeMs: opts.strikeMs ?? BLINK_DEFAULTS.strikeMs,
            recoverMs: opts.recoverMs ?? BLINK_DEFAULTS.recoverMs,
        }),
        lastBlinkAt: null,
        _executed: false, // true once this telegraph cycle has already relocated
    };
}

// True while the enemy is under a freeze / CHILL status at `now`.
function isFrozen(enemy, now) {
    if (!enemy) return false;
    if (enemy.frozen) return true;
    if (enemy._frozenUntil > now) return true;
    return false;
}

/**
 * Gate for starting a blink: NOT frozen AND enough time has elapsed since the
 * last jump (>= intervalMs). The very first blink is allowed (lastBlinkAt null).
 * Pure (does not mutate). With no blink config the enemy can never blink.
 */
export function canBlink(enemy, now) {
    if (!enemy || !enemy.blink) return false;
    if (isFrozen(enemy, now)) return false;
    const last = enemy.blink.lastBlinkAt;
    if (last == null) return true;
    return now - last >= enemy.blink.intervalMs;
}

/**
 * Pick a relocation destination. Pure given a stubbed rng. For kind 'blink':
 * a point at a random angle, a random distance (0..range) from the enemy. For
 * kind 'burrow': re-emerge near the player — a random point within `range` of
 * the player. Returns a fresh `{ x, y }`.
 */
export function chooseBlinkDestination(enemy, player, rng = Math.random) {
    const cfg = enemy.blink;
    const angle = rng() * Math.PI * 2;
    const dist = rng() * cfg.range;
    const ox = Math.cos(angle) * dist;
    const oy = Math.sin(angle) * dist;
    if (cfg.kind === 'burrow' && player) {
        return { x: player.x + ox, y: player.y + oy };
    }
    return { x: enemy.x + ox, y: enemy.y + oy };
}

/**
 * Per-frame driver. If idle and eligible (canBlink), starts the telegraph
 * wind-up. While a telegraph is running it is advanced via tickTelegraph; on
 * the STRIKE transition the enemy RELOCATES exactly once — enemy.x/y are set
 * from chooseBlinkDestination and `lastBlinkAt` is stamped. Frozen enemies
 * never relocate and never start a telegraph (a telegraph already mid-flight is
 * simply held, not advanced). Returns `{ phase, relocated, to }`.
 */
export function tickBlink(enemy, player, now, rng = Math.random) {
    if (!enemy || !enemy.blink) return { phase: 'idle', relocated: false, to: null };
    const cfg = enemy.blink;
    const frozen = isFrozen(enemy, now);

    // While idle, only begin a wind-up if eligible (this also covers the freeze
    // guard via canBlink). Don't restart a telegraph that's already running.
    if (telegraphPhase(cfg.telegraph, now) === 'idle') {
        cfg._executed = false;
        if (!frozen && canBlink(enemy, now)) {
            startTelegraph(cfg.telegraph, now);
        }
        // Still idle (nothing eligible / frozen) — nothing more to do.
        if (cfg.telegraph.startedAt == null) {
            return { phase: 'idle', relocated: false, to: null };
        }
    }

    // Frozen mid-telegraph: hold the current phase, do not advance or relocate.
    if (frozen) {
        return { phase: telegraphPhase(cfg.telegraph, now), relocated: false, to: null };
    }

    const phase = tickTelegraph(cfg.telegraph, now);

    let relocated = false;
    let to = null;
    if (isStriking(cfg.telegraph, now) && !cfg._executed) {
        to = chooseBlinkDestination(enemy, player, rng);
        enemy.x = to.x;
        enemy.y = to.y;
        cfg.lastBlinkAt = now;
        cfg._executed = true;
        relocated = true;
    }

    return { phase, relocated, to };
}

/**
 * True while the enemy is mid-blink/underground — during the telegraph WINDUP
 * and STRIKE — so render should skip it and aim/homing should treat it as
 * untargetable. Once the jump completes (RECOVER / idle) it's visible again.
 * Pure (does not mutate). No blink config → never vanished.
 */
export function isVanished(enemy, now) {
    if (!enemy || !enemy.blink) return false;
    const phase = telegraphPhase(enemy.blink.telegraph, now);
    return phase === 'windup' || phase === 'strike';
}
