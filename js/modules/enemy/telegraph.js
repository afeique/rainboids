// SYS-11 / ENMY-01 — generalized telegraphed strike. A reusable "wind-up →
// strike" state machine that warns the player before a COMMITTED attack: the
// enemy flashes/charges during WINDUP, the attack lands during STRIKE, then it
// cools off during RECOVER before returning to IDLE. TITAN had a bespoke
// version of this; this is the extracted, shared helper (Ashen telegraph,
// Juggernaut ram, boss attacks all reuse it).
//
// The caller holds the small state object on the enemy (e.g. enemy._telegraph),
// starts a windup with startTelegraph, advances it each frame with
// tickTelegraph, and applies damage/effect only while isStriking is true.
//
// Pure given (state, now) in ms; mutates only the passed state — no globals, no
// Date.now(), no rendering. Unit-tests cleanly.

export const TELEGRAPH_DEFAULTS = {
    windupMs: 600,  // warning / charge window
    strikeMs: 200,  // committed-attack window (damage lands here)
    recoverMs: 400, // cooldown after the strike, then back to idle
};

export const TELEGRAPH_PHASES = ['idle', 'windup', 'strike', 'recover'];

/**
 * Create a fresh telegraph state. `opts` overrides any of windupMs / strikeMs /
 * recoverMs (defaults from TELEGRAPH_DEFAULTS). `startedAt` is null while idle,
 * `phase` is the last phase tickTelegraph settled on (for transition detection).
 */
export function createTelegraph(opts = {}) {
    return {
        windupMs: opts.windupMs ?? TELEGRAPH_DEFAULTS.windupMs,
        strikeMs: opts.strikeMs ?? TELEGRAPH_DEFAULTS.strikeMs,
        recoverMs: opts.recoverMs ?? TELEGRAPH_DEFAULTS.recoverMs,
        startedAt: null,
        phase: 'idle',
    };
}

/**
 * Begin a windup at `now`. Only fires when currently idle; ignored (no-op) if a
 * telegraph is already running. Mutates + returns state.
 */
export function startTelegraph(state, now) {
    if (state && telegraphPhase(state, now) === 'idle') {
        state.startedAt = now;
        state.phase = 'windup';
    }
    return state;
}

/**
 * Pure read of the phase at `now` WITHOUT mutating — 'idle' | 'windup' |
 * 'strike' | 'recover'. Useful for render and tests.
 */
export function telegraphPhase(state, now) {
    if (!state || state.startedAt == null) return 'idle';
    const elapsed = now - state.startedAt;
    if (elapsed < 0) return 'idle';
    if (elapsed < state.windupMs) return 'windup';
    if (elapsed < state.windupMs + state.strikeMs) return 'strike';
    if (elapsed < state.windupMs + state.strikeMs + state.recoverMs) return 'recover';
    return 'idle';
}

/**
 * Advance the telegraph to its phase at `now`, mutating `state.phase` (and
 * clearing startedAt once it lapses back to idle). Returns the current phase.
 */
export function tickTelegraph(state, now) {
    if (!state) return 'idle';
    const phase = telegraphPhase(state, now);
    if (phase === 'idle') state.startedAt = null;
    state.phase = phase;
    return phase;
}

/**
 * True only during the STRIKE window — the frame(s) where the committed attack
 * lands. Pure (does not mutate).
 */
export function isStriking(state, now) {
    return telegraphPhase(state, now) === 'strike';
}

/**
 * 0..1 progress through the CURRENT phase at `now` (clamped). Useful for drawing
 * a charging telegraph bar / flash. Idle reads as 0. Pure (does not mutate).
 */
export function telegraphProgress(state, now) {
    if (!state || state.startedAt == null) return 0;
    const elapsed = now - state.startedAt;
    if (elapsed <= 0) return 0;
    const windupEnd = state.windupMs;
    const strikeEnd = windupEnd + state.strikeMs;
    const recoverEnd = strikeEnd + state.recoverMs;
    let start, len;
    if (elapsed < windupEnd) { start = 0; len = state.windupMs; }
    else if (elapsed < strikeEnd) { start = windupEnd; len = state.strikeMs; }
    else if (elapsed < recoverEnd) { start = strikeEnd; len = state.recoverMs; }
    else return 0; // back to idle
    if (len <= 0) return 1;
    const p = (elapsed - start) / len;
    return p < 0 ? 0 : p > 1 ? 1 : p;
}
