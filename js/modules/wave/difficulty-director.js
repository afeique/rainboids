// RUN-04 / Adaptive Difficulty Director (Balance Model §6b/§8). Difficulty is
// AUTO-tuned, never player-chosen: the director watches each wave's outcome and
// nudges TWO DECOUPLED axes so every build lands in the "challenged but winning"
// flow channel.
//   • D_hp  — offense outlet: enemy HP × spawn-count × elite injection
//             ("give me more to kill").  Bounds [0.6, 3.0].
//   • D_thr — threat: enemy damage / bullet density / cadence
//             ("make me respect them"). Bounds [0.6, 1.8] (1.8 not 2.0 — 2.0
//             felt punishing; per-hit cap + cross-term make 1.8 plenty).
//
// Decoupling is the whole point. A Glass Nuke (kills fast, fragile) gets MORE
// targets (D_hp↑) but NOT more threat (mercy holds D_thr) so it isn't punished
// for chosen squishiness; a Pure Tank (survives all, low DPS) gets MORE threat
// (D_thr↑) but NOT more trash it already one-shots. Only a true god build —
// strong on BOTH (Po>1.3 AND Pd>1.3, the cross-term gate) — earns both ceilings.
//
// Each axis reads a composite, normalized estimate (1.0 = on-design), smoothed
// by an EMA over ~the last 2 waves (α≈0.4):
//   Po = 0.6·(dpsOnTarget/expectedDps) + 0.4·(targetClearTime/actualClearTime)
//   Pd = 0.6·(hpRetainedFrac/expectedHpRetainedFrac) + 0.4·(hitsSurvived/expectedHits)
// Po>1 ⇒ over-performing (killing faster than designed); Pd>1 ⇒ over-tanky.
//
// Pure: no globals, Date.now(), Math.random(), DOM, or game-module imports —
// driven entirely by the `outcome` data the caller feeds + the `state` it
// mutates. Unit-tests cleanly.

/**
 * Tuning constants (Balance Model §8 final-targets table is authoritative).
 * `opts` passed to createDirector may override any of these for tests.
 */
export const DIRECTOR_DEFAULTS = Object.freeze({
    hpMin: 0.6,          // D_hp bounds
    hpMax: 3.0,
    thrMin: 0.6,         // D_thr bounds (1.8 ceiling, not 2.0)
    thrMax: 1.8,
    alpha: 0.4,          // EMA weight on the newest wave (~last-2-waves window)
    deadband: 0.12,      // ignore |estimate − 1| ≤ 12% so D doesn't churn
    maxStep: 0.12,       // a single wave may not move an axis > ±12% of its value
    hpExp: 0.5,          // D_hp ← clamp(D_hp · Po^0.5, …) — gentle correction
    thrExp: 0.4,         // D_thr ← clamp(D_thr · Pd^0.4, …)
    crossTerm: 1.3,      // D_thr may climb past softCap only when BOTH Po,Pd > this
    thrSoftCap: 1.4,     // …otherwise D_thr is capped here (true-mastery gate)
    escalationTimeFrac: 0.6, // cleared at full HP in < 60% of target time ⇒ stomp
    coldStartWaves: 2,   // waves 1–2 hold D=1.0 (collect data); adapt from wave 3
});

/** CD-16's threat meter shows 5 pips. */
export const THREAT_PIPS = 5;

// ── internal helpers ────────────────────────────────────────────────
function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

// Normalize a ratio guarding divide-by-zero. Returns `num/den`; when `den` is
// non-positive/NaN we fall back to a neutral 1.0 (no signal ≠ a real deviation).
function safeRatio(num, den) {
    if (!(den > 0) || !Number.isFinite(num)) return 1;
    const r = num / den;
    return Number.isFinite(r) ? r : 1;
}

// Apply the ±maxStep per-wave rate limit: clamp `next` to within ±frac of `cur`.
function rateLimit(cur, next, frac) {
    const lo = cur * (1 - frac);
    const hi = cur * (1 + frac);
    return clamp(next, lo, hi);
}

/**
 * Fresh director state. `opts` may override any DIRECTOR_DEFAULTS field (bounds,
 * alpha, deadband, …) — handy for tests. Both axes and both estimates start
 * neutral at 1.0; `wave` counts ingested waves (cold-start spans waves 1–2).
 */
export function createDirector(opts = {}) {
    const cfg = { ...DIRECTOR_DEFAULTS, ...opts };
    return {
        D_hp: 1,
        D_thr: 1,
        Po: 1,
        Pd: 1,
        wave: 0,
        // last raw (un-smoothed) outcome flags the update rule consults
        deaths: 0,
        clearedFullHp: false,
        hpRetainedFrac: 1,
        clearTimeFrac: 1, // actualClearTime / targetClearTime (this wave)
        cfg,
    };
}

/**
 * Ingest one wave's metrics and fold the fresh Po/Pd into the EMA. Increments
 * `state.wave`. `outcome` fields (all optional, sensible fallbacks):
 *   dpsOnTarget, expectedDps, actualClearTime, targetClearTime,
 *   hpRetainedFrac, expectedHpRetainedFrac, hitsSurvived, expectedHits,
 *   deaths, clearedFullHp.
 * Returns the smoothed `{ Po, Pd }` after folding.
 */
export function recordWave(state, outcome = {}) {
    const a = state.cfg.alpha;

    // Offense composite (Po). 0.6 weight on DPS ratio, 0.4 on clear-speed ratio.
    const dpsRatio = safeRatio(outcome.dpsOnTarget, outcome.expectedDps);
    const speedRatio = safeRatio(outcome.targetClearTime, outcome.actualClearTime);
    const rawPo = 0.6 * dpsRatio + 0.4 * speedRatio;

    // Defense composite (Pd). 0.6 weight on HP-retained ratio, 0.4 on hits ratio.
    const hpRatio = safeRatio(outcome.hpRetainedFrac, outcome.expectedHpRetainedFrac);
    const hitsRatio = safeRatio(outcome.hitsSurvived, outcome.expectedHits);
    const rawPd = 0.6 * hpRatio + 0.4 * hitsRatio;

    // EMA fold (α on the newest wave).
    state.Po = (1 - a) * state.Po + a * rawPo;
    state.Pd = (1 - a) * state.Pd + a * rawPd;

    // Stash raw outcome flags the update rule (mercy/escalation) consults.
    state.deaths = outcome.deaths > 0 ? outcome.deaths : 0;
    state.clearedFullHp = !!outcome.clearedFullHp;
    state.hpRetainedFrac = Number.isFinite(outcome.hpRetainedFrac)
        ? outcome.hpRetainedFrac
        : 1;
    state.clearTimeFrac = safeRatio(outcome.actualClearTime, outcome.targetClearTime);

    state.wave += 1;
    return { Po: state.Po, Pd: state.Pd };
}

/**
 * Apply the full update rule to produce new D_hp / D_thr from the smoothed
 * Po/Pd + this wave's outcome flags. Order: cold-start gate → per-axis deadband
 * + exponent step + rate-limit + clamp → cross-term threat soft-cap → mercy
 * (only eases D_thr) → escalation (only bumps). Returns `{ D_hp, D_thr }`.
 */
export function updateDifficulty(state) {
    const c = state.cfg;

    // Cold start: waves 1–2 hold D=1.0 (collect data); begin adapting at wave 3.
    if (state.wave <= c.coldStartWaves) {
        state.D_hp = 1;
        state.D_thr = 1;
        return { D_hp: state.D_hp, D_thr: state.D_thr };
    }

    const Po = state.Po;
    const Pd = state.Pd;

    // ── D_hp (offense outlet) — deadband, gentle exponent, rate-limit, clamp ──
    if (Math.abs(Po - 1) > c.deadband) {
        let nextHp = state.D_hp * Math.pow(Po, c.hpExp);
        nextHp = rateLimit(state.D_hp, nextHp, c.maxStep);
        state.D_hp = clamp(nextHp, c.hpMin, c.hpMax);
    }

    // ── D_thr (threat) — same machinery on the Pd signal ──
    if (Math.abs(Pd - 1) > c.deadband) {
        let nextThr = state.D_thr * Math.pow(Pd, c.thrExp);
        nextThr = rateLimit(state.D_thr, nextThr, c.maxStep);
        state.D_thr = clamp(nextThr, c.thrMin, c.thrMax);
    }

    // ── Cross-term (true-mastery gate): D_thr may only climb toward its 1.8
    //    ceiling when BOTH Po>1.3 AND Pd>1.3; otherwise cap at the soft-cap. ──
    const mastery = Po > c.crossTerm && Pd > c.crossTerm;
    if (!mastery && state.D_thr > c.thrSoftCap) {
        // Cap downward, but respect the per-wave rate limit so we don't whiplash.
        state.D_thr = rateLimit(state.D_thr, c.thrSoftCap, c.maxStep);
        state.D_thr = clamp(state.D_thr, c.thrMin, c.thrMax);
    }

    // ── Mercy: died this wave OR retained very little HP OR Pd well below 1 ⇒
    //    EASE D_thr down (never raise it). The reckless glass cannon is carried
    //    by offense, not punished by threat. ──
    const merciful =
        state.deaths > 0 ||
        state.hpRetainedFrac <= 0.1 ||
        Pd < 1 - c.deadband;
    if (merciful) {
        const eased = rateLimit(state.D_thr, state.D_thr * (1 - c.maxStep), c.maxStep);
        // never raise: take the lower of current / eased
        state.D_thr = clamp(Math.min(state.D_thr, eased), c.thrMin, c.thrMax);
    }

    // ── Escalation: cleared at full HP in < 60% of target time ⇒ the stomp gets
    //    answered. Bump D_hp; bump D_thr too only if Pd is also high (mastery). ──
    const stomp = state.clearedFullHp && state.clearTimeFrac < c.escalationTimeFrac;
    if (stomp) {
        const bumpHp = rateLimit(state.D_hp, state.D_hp * (1 + c.maxStep), c.maxStep);
        state.D_hp = clamp(Math.max(state.D_hp, bumpHp), c.hpMin, c.hpMax);
        if (Pd > c.crossTerm) {
            const bumpThr = rateLimit(state.D_thr, state.D_thr * (1 + c.maxStep), c.maxStep);
            state.D_thr = clamp(Math.max(state.D_thr, bumpThr), c.thrMin, c.thrMax);
        }
    }

    return { D_hp: state.D_hp, D_thr: state.D_thr };
}

/**
 * Convenience: recordWave then updateDifficulty (the per-wave cycle). Returns
 * the new `{ D_hp, D_thr }`.
 */
export function tickWave(state, outcome) {
    recordWave(state, outcome);
    return updateDifficulty(state);
}

/** Current difficulty snapshot. */
export function getDifficulty(state) {
    return { D_hp: state.D_hp, D_thr: state.D_thr };
}

/**
 * Integer 1..5 threat pip (CD-16's HUD meter) derived from (D_hp+D_thr)/2 mapped
 * across the combined operating range. Cold-start neutral (D=1/1) ≈ pip 3; rises
 * monotonically as combined D climbs toward the ceilings.
 */
export function getThreatLevel(state) {
    const c = state.cfg;
    const combined = (state.D_hp + state.D_thr) / 2;
    const lo = (c.hpMin + c.thrMin) / 2;   // combined floor (≈0.6)
    const hi = (c.hpMax + c.thrMax) / 2;   // combined ceiling (≈2.4)
    const mid = THREAT_PIPS / 2 + 0.5;     // center pip (3 for 5 pips)
    // Anchor neutral (combined=1.0) on the center pip: the operating range is
    // asymmetric around 1 (floor 0.6, ceiling ≈2.4), so map the two halves
    // separately — below-neutral fills pips 1..mid, above-neutral mid..PIPS.
    let pip;
    if (combined <= 1) {
        const t = clamp((combined - lo) / (1 - lo), 0, 1); // 0 at floor → 1 at neutral
        pip = 1 + t * (mid - 1);
    } else {
        const t = clamp((combined - 1) / (hi - 1), 0, 1);  // 0 at neutral → 1 at ceiling
        pip = mid + t * (THREAT_PIPS - mid);
    }
    return clamp(Math.round(pip), 1, THREAT_PIPS);
}

/**
 * Boss-lock: return a FROZEN snapshot of the current { D_hp, D_thr } for a boss
 * to hold for its whole fight (no mid-fight rubber-band). The returned object is
 * a copy — later recordWave/updateDifficulty calls never mutate it. Boss HP =
 * baseTier × D_hp; boss threat = base × D_thr.
 */
export function lockForBoss(state) {
    return Object.freeze({ D_hp: state.D_hp, D_thr: state.D_thr });
}
