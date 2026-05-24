// Time-gated boss sequence runner (Phase D.B0).
//
// A declarative list of timed BEATS drives both the dramatic boss INTRO
// (warp-in → name card → fight-start) and the multi-stage DEATH detonation
// (aspects blow out in sequence → supernova → victory beat). The runner
// advances by elapsed time, fires each beat's `onEnter` exactly once and in
// order (even if several short beats elapse in a single frame), fires an
// optional `onComplete` once when the last beat ends, and exposes the current
// beat + progress for the renderer / audio / juice to read.
//
// Pure, engine-agnostic — like boss-phases / boss-parts, the boss object + an
// optional `ctx` are passed in and `now` is explicit. The runner NEVER draws or
// announces; a beat's `onEnter` (or `onComplete`) is where a concrete boss
// wires the camera/zoom/shake/flash juice and the canvas name-card / detonation
// FX. Two independent sequences can live on one boss (intro at spawn, death at
// the end) under their own state keys.
//
// IMPORTANT — unlike the HP-gated phase runner and the weak-point layer, a
// sequence is NOT gated by active/!dying/!warping: an intro plays *during*
// warp-in and a death plays *while the boss is dying*. `updateBossSequence`
// advances purely on elapsed time once initialised.
//
// Beat shape (only `durationMs` matters for timing; the rest is optional):
//   {
//     id, name,
//     durationMs,                 // how long this beat lasts (0 = instant)
//     onEnter?(boss, ctx, seq),   // fired once when the beat begins
//   }

export const INTRO_KEY = '_introSeq';
export const DEATH_KEY = '_deathSeq';

function _buildState(script, now, ctx, onComplete) {
    const starts = [];
    let acc = 0;
    for (const beat of script) {
        starts.push(acc);
        acc += Math.max(0, (beat && beat.durationMs) || 0);
    }
    return {
        script, starts, total: acc, t0: now,
        index: 0, entered: new Array(script.length).fill(false), done: false,
        ctx: ctx || null, onComplete: typeof onComplete === 'function' ? onComplete : null,
    };
}

function _enterBeat(boss, st, idx) {
    st.index = idx;
    if (st.entered[idx]) return;
    st.entered[idx] = true;
    const beat = st.script[idx];
    if (beat && typeof beat.onEnter === 'function') beat.onEnter(boss, st.ctx, st);
}

// Advance to the latest beat whose start has elapsed, firing each onEnter once
// and in order, then complete the sequence if the final beat has ended.
function _advance(boss, st, now) {
    const elapsed = now - st.t0;
    const n = st.script.length;
    let guard = 0;
    while (st.index + 1 < n && st.starts[st.index + 1] <= elapsed && guard++ < n) {
        _enterBeat(boss, st, st.index + 1);
    }
    if (!st.done && elapsed >= st.total) {
        st.done = true;
        if (st.onComplete) st.onComplete(boss, st.ctx, st);
    }
}

// Attach a sequence under `opts.key` (default INTRO_KEY) and enter beat 0. Safe
// to call once. Returns false for a missing/empty script.
// opts: { key, ctx, now, onComplete }.
export function initBossSequence(boss, script, opts = {}) {
    if (!boss || !Array.isArray(script) || script.length === 0) return false;
    const { key = INTRO_KEY, ctx = null, now = Date.now(), onComplete = null } = opts;
    const st = _buildState(script, now, ctx, onComplete);
    boss[key] = st;
    _enterBeat(boss, st, 0);
    _advance(boss, st, now); // pass through any zero-duration leading beats
    return true;
}

// Per-frame time advance. No-op unless the sequence exists + is unfinished.
// opts: { key, now }. (ctx is captured at init — not needed here.)
export function updateBossSequence(boss, opts = {}) {
    const { key = INTRO_KEY, now = Date.now() } = opts;
    const st = boss && boss[key];
    if (!st || st.done) return;
    _advance(boss, st, now);
}

// The active beat object (for the renderer / audio), or null.
export function currentBeat(boss, key = INTRO_KEY) {
    const st = boss && boss[key];
    return st ? (st.script[st.index] || null) : null;
}

export function currentBeatIndex(boss, key = INTRO_KEY) {
    const st = boss && boss[key];
    return st ? st.index : 0;
}

// True once the final beat has ended (onComplete has fired).
export function isSequenceComplete(boss, key = INTRO_KEY) {
    const st = boss && boss[key];
    return st ? !!st.done : false;
}

// Progress 0..1 WITHIN the current beat (for fading a name card, etc.).
export function beatProgress(boss, key = INTRO_KEY, now = Date.now()) {
    const st = boss && boss[key];
    if (!st) return 0;
    const beat = st.script[st.index];
    const dur = Math.max(0, (beat && beat.durationMs) || 0);
    if (dur <= 0) return 1;
    return Math.min(1, Math.max(0, ((now - st.t0) - st.starts[st.index]) / dur));
}

// Progress 0..1 across the WHOLE sequence.
export function sequenceProgress(boss, key = INTRO_KEY, now = Date.now()) {
    const st = boss && boss[key];
    if (!st) return 0;
    if (st.total <= 0) return 1;
    return Math.min(1, Math.max(0, (now - st.t0) / st.total));
}

// ── Named convenience wrappers (intro at spawn, death at the end) ──────────

export function initBossIntro(boss, script, ctx = null, now = Date.now(), onComplete = null) {
    return initBossSequence(boss, script, { key: INTRO_KEY, ctx, now, onComplete });
}
export function updateBossIntro(boss, ctx = null, now = Date.now()) {
    return updateBossSequence(boss, { key: INTRO_KEY, now });
}
export function initBossDeath(boss, script, ctx = null, now = Date.now(), onComplete = null) {
    return initBossSequence(boss, script, { key: DEATH_KEY, ctx, now, onComplete });
}
export function updateBossDeath(boss, ctx = null, now = Date.now()) {
    return updateBossSequence(boss, { key: DEATH_KEY, now });
}

// Boss is invulnerable while its intro is still playing — the time-gated
// sibling of phaseBlocksDamage / coreBlocksDamage. (Death needs no gate; the
// boss is already dead.) No-op unless an intro sequence exists.
export function introBlocksDamage(boss) {
    const st = boss && boss[INTRO_KEY];
    return !!(st && !st.done);
}
