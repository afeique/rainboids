// ENMY-10b — enemy COUNTER-ATTACK on being hit (Thornback). A Kinetic BRUISER
// that PUNISHES point-blank full-auto: every damage instance it takes triggers
// a small RETALIATORY pulse — IF the player is within a short radius — dealing
// a little counter-damage back + spawning a ring particle. The pulse is
// THROTTLED by a per-burst cooldown, so sustained fire applies a steady
// punish-pulse rather than counter-damage on every single tick. Fighting from
// RANGE (outside the radius) draws NO counter — so the read is: stay back / use
// measured bursts. This is the ENEMY→PLAYER mirror of the player-side
// RETALIATION pulse (BULWARK) in js/modules/player/lifecycle.js.
//
// Pure given (enemy/player, now in ms); mutates only the passed thorns state
// (and ONLY in markRetaliated). No globals, no Date.now(), no Math.random, no
// rendering, no game-state imports — unit-tests cleanly. The enemy holds the
// thorns state on enemy.thorns.
//
// Default-safe: every wiring in enemy.js / collision-system.js is gated on
// `enemy.thorns`, which only THORNBACK (config.thorns) ever gets, so thorns-less
// enemies behave byte-for-byte as before.

export const THORNS_DEFAULTS = {
    radius: 150,      // counter only fires if the player is within this distance
    damage: 6,        // counter-damage dealt to the player per pulse
    cooldownMs: 260,  // min gap between counter-pulses (the per-burst throttle)
};

/**
 * Create a fresh thorns state. `opts` overrides radius / damage / cooldownMs.
 * `_lastAt` is the wall-clock of the last retaliation (0 = never), used by the
 * cooldown throttle. Side-effect-free.
 */
export function createThorns(opts = {}) {
    return {
        radius: opts.radius ?? THORNS_DEFAULTS.radius,
        damage: opts.damage ?? THORNS_DEFAULTS.damage,
        cooldownMs: opts.cooldownMs ?? THORNS_DEFAULTS.cooldownMs,
        _lastAt: 0,
    };
}

/**
 * True when enough time has elapsed since the last retaliation to fire another
 * counter-pulse (now - _lastAt >= cooldownMs). The very first pulse is always
 * allowed (_lastAt 0, with now > 0). Pure (does not mutate). No thorns → false.
 */
export function canRetaliate(thorns, now) {
    if (!thorns) return false;
    return now - thorns._lastAt >= thorns.cooldownMs;
}

/**
 * True when the player is within the thorns radius of the enemy (hypot ≤
 * radius) — the proximity gate for the counter. Pure (does not mutate). No
 * thorns / enemy / player → false (no counter).
 */
export function playerInThornsRange(enemy, player) {
    if (!enemy || !enemy.thorns || !player) return false;
    const r = enemy.thorns.radius;
    return Math.hypot(player.x - enemy.x, player.y - enemy.y) <= r;
}

/**
 * Stamp the time of a retaliation so the cooldown throttle measures from here.
 * The ONLY mutating helper. Returns the thorns state. No thorns → no-op.
 */
export function markRetaliated(thorns, now) {
    if (!thorns) return thorns;
    thorns._lastAt = now;
    return thorns;
}
