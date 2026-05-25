// SYS-5 / ENMY-03 — cloak / invisibility. A cloaking enemy (Phantom) runs an
// alternating visible↔cloaked cycle: while cloaked it skips its render and
// drops off the homing/aim target list, so it slips past auto-targeting. It is
// REVEALED — and stays targetable — by a MARK status or by an AoE reveal stamp,
// so area weapons and marking break the disappearing act. The render fades
// across a short window at each toggle so the enemy doesn't pop in/out.
//
// Pure given (state/enemy, now); the enemy holds the `cloak` config + the
// stamped reveal fields. No Date.now, no globals, no render side-effects.
// Unit-tests cleanly.

export const CLOAK_DEFAULTS = { visibleMs: 1500, cloakedMs: 2500 };
export const FADE_MS = 250; // alpha fade window straddling each visible↔cloaked toggle

/**
 * Fresh cloak state. `opts` may override visible/cloaked durations.
 * `cycleStart` is left null — it's initialized on the first tick (or start).
 */
export function createCloak(opts = {}) {
    return {
        visibleMs: opts.visibleMs ?? CLOAK_DEFAULTS.visibleMs,
        cloakedMs: opts.cloakedMs ?? CLOAK_DEFAULTS.cloakedMs,
        cycleStart: null,
        cloaked: false,
    };
}

// Elapsed time into the current visible→cloaked period, given an explicit now.
function phase(state, now) {
    const period = state.visibleMs + state.cloakedMs;
    const start = state.cycleStart ?? now;
    let t = (now - start) % period;
    if (t < 0) t += period; // tolerate now < cycleStart
    return t;
}

/**
 * Advance the alternating cycle: initializes `cycleStart` on first tick if
 * unset, records the current cloaked-ness on `state.cloaked`, and returns it.
 */
export function tickCloak(state, now) {
    if (state.cycleStart == null) state.cycleStart = now;
    const cloaked = phase(state, now) >= state.visibleMs;
    state.cloaked = cloaked;
    return cloaked;
}

/** Pure read of cloaked-ness at `now`; does NOT mutate state. */
export function isCloaked(state, now) {
    return phase(state, now) >= state.visibleMs;
}

/**
 * Render alpha 0..1 that fades across a FADE_MS window at each toggle so the
 * enemy doesn't pop: 1 when fully visible, 0 when fully cloaked, linearly
 * interpolated within FADE_MS of either boundary.
 */
export function cloakAlpha(state, now) {
    const t = phase(state, now);
    const v = state.visibleMs;
    const period = v + state.cloakedMs;
    // Fade-out: visible→cloaked boundary at t = v (over the FADE_MS before it).
    if (t < v) {
        if (t > v - FADE_MS) return Math.max(0, (v - t) / FADE_MS);
        return 1;
    }
    // Cloaked region: fade back IN over the FADE_MS leading up to t = period.
    if (t > period - FADE_MS) return Math.min(1, (t - (period - FADE_MS)) / FADE_MS);
    return 0;
}

/**
 * Targetability for homing/aim. TRUE when not cloaked, OR when cloaked but the
 * enemy is MARKed (`enemy.marked` or `enemy._markUntil > now`) or under an AoE
 * reveal (`enemy._revealedUntil > now`). The enemy's cloak config is read from
 * `enemy.cloak`; with no cloak config the enemy is always targetable.
 */
export function isTargetable(enemy, now) {
    if (!enemy) return false;
    const state = enemy.cloak;
    if (!state || !isCloaked(state, now)) return true;
    if (enemy.marked) return true;
    if (enemy._markUntil > now) return true;
    if (enemy._revealedUntil > now) return true;
    return false;
}

/**
 * Force-reveal the enemy for `durationMs` (AoE hit / MARK application): stamps
 * `enemy._revealedUntil = now + durationMs` and returns that timestamp.
 */
export function revealCloak(state, enemy, now, durationMs) {
    const until = now + durationMs;
    if (enemy) enemy._revealedUntil = until;
    return until;
}
