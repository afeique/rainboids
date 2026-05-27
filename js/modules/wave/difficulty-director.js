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
// ── DIR-04 augmentation (§14 structural levers) ─────────────────────────────
// The reactive two-axis controller above is KEPT INTACT. DIR-04 layers three
// §14 levers the reactive loop lacked, all DEFAULT-SAFE (neutral at PWR_REF +
// NORMAL ⇒ byte-for-byte the prior behavior):
//   • PWR pre-load  — a strong build pre-faces tougher enemies immediately
//                     instead of waiting ~10 reactive waves to ramp.
//   • mode base     — a static per-mode bias on the effective difficulty.
//   • mode bias     — EASY/HARD/… widen-or-tighten the reactive bands/rates/
//                     clamps (NORMAL = the current constants, exactly).
// CRITICAL: these fold into the EFFECTIVE difficulty getDifficulty/getThreatLevel
// return (reactive_D × preload × mBase), clamped by a mode-aware ceiling so HP
// can't explode into bullet-sponges. The reactive D_hp/D_thr the loop updates is
// UNCHANGED — DIR-04 does not touch the update rule's math. The absolute baseline
// curve's deep-run escalation is COMPUTED + EXPOSED via getEnemyPower for the
// DIR-10 composer to consume later, but NOT applied to live D here.
//
// Pure: no globals, Date.now(), Math.random(), DOM, or game-module imports —
// driven entirely by the `outcome` data the caller feeds + the `state` it
// mutates. Unit-tests cleanly.

import {
    baseline,
    pwrPreload,
    PWR_REF,
    modeBase,
    modeMult,
    modeBand,
    modeRate,
    MODES,
    DEFAULT_MODE,
    ENEMY_POWER_EXP,
} from './difficulty-constants.js';

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

// Validate a difficulty mode against the canonical MODES table; unknown / missing
// modes fall back to DEFAULT_MODE (NORMAL) — same NORMAL-fallback contract the
// difficulty-constants accessors use, surfaced here so state.mode is always valid.
function validateMode(mode) {
    return MODES.includes(mode) ? mode : DEFAULT_MODE;
}

// T34 — drafted-stage threat offset. The chosen stage's threat is on the PWR
// scale (run-randomizer's difficultyBudget(1) = 100 = PWR_REF). When the stage
// OUT-threatens the build (threat > pwr — a risky draft pick or an under-levelled
// run) the effective difficulty bumps; a gentle exponent + cap keep it from
// becoming a bullet-sponge wall, and it NEVER eases below 1.0 (the reactive loop
// + mercy own easing). threat 0 (no stage drafted yet) ⇒ exactly 1.0 → the draft
// has no effect until a stage is picked (default-safe).
const THREAT_OFFSET_EXP = 0.5;   // sqrt of the over-threat ratio (gentle)
const THREAT_OFFSET_CAP = 1.5;   // a risky stage adds at most +50% atop preload
function threatScale(state) {
    const t = state.threat;
    if (!Number.isFinite(t) || t <= 0) return 1;
    const pwr = Math.max(1, Number.isFinite(state.pwr) ? state.pwr : PWR_REF);
    const ratio = t / pwr;
    if (ratio <= 1) return 1; // a stage at/below the build's PWR adds nothing here
    return Math.min(THREAT_OFFSET_CAP, Math.pow(ratio, THREAT_OFFSET_EXP));
}

// The combined preload × mode-base × stage-threat scalar folded onto the reactive
// axes to make the EFFECTIVE difficulty. = 1.0 at PWR_REF + NORMAL + no-stage
// (default-safe). preload is clamped [0.8, 3.0] by difficulty-constants.pwrPreload;
// mBase is the static per-mode multiplier (1.0 at NORMAL); threat is the T34 offset.
function contextScale(state) {
    const preload = pwrPreload(state.pwr, PWR_REF); // 1.0 at PWR_REF, clamp [0.8,3.0]
    const mBase = modeBase(state.mode);             // 1.0 at NORMAL
    const threat = threatScale(state);              // 1.0 until a stage out-threatens the build
    return { preload, mBase, threat, scale: preload * mBase * threat };
}

// Mode-biased reactive params. At NORMAL this returns the *unmodified* cfg values
// (so NORMAL = current behavior, EXACTLY). For other modes it biases the reactive
// loop toward that mode's intent without ever touching the update-rule MATH:
//   • deadband ← scaled by the mode's relative band-WIDTH (a tighter band on a
//     harder mode means the controller reacts to smaller deviations).
//   • maxStep  ← the mode's UP rate (higher mode ramps faster toward pressure).
//   • hpMax/thrMax ← lifted by the mode's MULT_MAX relative to NORMAL's, so a
//     harder mode lets the reactive axes climb to higher reactive ceilings.
// All biases collapse to identity at NORMAL because every ratio below is 1.0
// there (band-width, up-rate, and MULT_MAX all read NORMAL's own row).
function modeBiasedCfg(state) {
    const c = state.cfg;
    if (state.mode === DEFAULT_MODE) return c; // NORMAL ⇒ byte-identical reactive params

    const [nBandLo, nBandHi] = modeBand(DEFAULT_MODE);
    const [bandLo, bandHi] = modeBand(state.mode);
    const nWidth = nBandHi - nBandLo;
    const width = bandHi - bandLo;
    const bandRatio = nWidth > 0 ? width / nWidth : 1; // 1.0 at NORMAL

    const [nUp] = modeRate(DEFAULT_MODE);
    const [up] = modeRate(state.mode);
    const upRatio = nUp > 0 ? up / nUp : 1; // 1.0 at NORMAL

    const [, nMultMax] = modeMult(DEFAULT_MODE);
    const [, multMax] = modeMult(state.mode);
    const ceilRatio = nMultMax > 0 ? multMax / nMultMax : 1; // 1.0 at NORMAL

    return {
        ...c,
        deadband: c.deadband * bandRatio,
        maxStep: c.maxStep * upRatio,
        hpMax: c.hpMax * ceilRatio,
        thrMax: c.thrMax * ceilRatio,
    };
}

/**
 * Fresh director state. `opts` may override any DIRECTOR_DEFAULTS field (bounds,
 * alpha, deadband, …) — handy for tests. Both axes and both estimates start
 * neutral at 1.0; `wave` counts ingested waves (cold-start spans waves 1–2).
 */
export function createDirector(opts = {}) {
    const cfg = { ...DIRECTOR_DEFAULTS, ...opts };
    return {
        // ── reactive core (UNCHANGED) ──
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
        // ── DIR-04 §14 context (DEFAULT-SAFE: PWR_REF + NORMAL ⇒ neutral) ──
        // pwr: the build-strength prior (DIR-05 feeds the live PWR per wave); at
        // PWR_REF the pre-load is exactly 1.0 so live difficulty is unchanged.
        pwr: Number.isFinite(opts.pwr) ? opts.pwr : PWR_REF,
        // T34 — the DRAFTED stage's threat (run-randomizer, PWR-scaled). 0 until
        // a stage is drafted ⇒ neutral; folded into the EFFECTIVE difficulty so a
        // stage that out-threatens the build is genuinely harder.
        threat: Number.isFinite(opts.threat) ? opts.threat : 0,
        // mode: difficulty mode (validated against MODES; unknown ⇒ NORMAL).
        mode: validateMode(opts.mode),
        cfg,
    };
}

/**
 * DIR-05 hook — update the §14 context (build PWR + difficulty mode) the
 * EFFECTIVE difficulty rides on, without disturbing the reactive Po/Pd/D state.
 * Either field is optional; an omitted/invalid field is left unchanged (mode is
 * re-validated, falling back to NORMAL only when an explicit unknown is passed).
 * Returns `state` for chaining. DEFAULT-SAFE: setting pwr=PWR_REF + mode=NORMAL
 * restores neutral context (= current behavior).
 * @param {object} state director state from createDirector.
 * @param {{pwr?: number, threat?: number, mode?: string}} [ctx]
 */
export function setDirectorContext(state, ctx = {}) {
    if (Number.isFinite(ctx.pwr)) state.pwr = ctx.pwr;
    if (Number.isFinite(ctx.threat)) state.threat = ctx.threat; // T34 — drafted stage threat
    if (ctx.mode !== undefined) state.mode = validateMode(ctx.mode);
    return state;
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
    // DIR-05 may piggyback the wave's build PWR / mode on the outcome so the
    // EFFECTIVE difficulty pre-loads from this wave (default-safe: omitted ⇒
    // unchanged; PWR_REF + NORMAL ⇒ neutral). Reactive math below is untouched.
    if (Number.isFinite(outcome.pwr)) state.pwr = outcome.pwr;
    if (Number.isFinite(outcome.threat)) state.threat = outcome.threat; // T34 — drafted stage threat
    if (outcome.mode !== undefined) state.mode = validateMode(outcome.mode);

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
    // Mode-biased reactive params (= state.cfg exactly at NORMAL → current
    // behavior). The reactive UPDATE MATH below is unchanged; only the band /
    // step / reactive-ceiling constants are biased by mode for non-NORMAL modes.
    const c = modeBiasedCfg(state);

    // Cold start: waves 1–2 hold D=1.0 (collect data); begin adapting at wave 3.
    if (state.wave <= c.coldStartWaves) {
        state.D_hp = 1;
        state.D_thr = 1;
        return { D_hp: state.D_hp, D_thr: state.D_thr };
    }

    // Snapshot the entry values. Every block below pushes the axes in its
    // intended DIRECTION; the NET wave-over-wave move is rate-limited ONCE at the
    // end (against these snapshots) so stacked effects (deadband + escalation +
    // cross-term + mercy) can never compound past ±maxStep. (FIX-01.)
    const hp0 = state.D_hp;
    const thr0 = state.D_thr;

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

    // ── Net per-wave rate limit (applied ONCE, against the entry snapshots) ──
    // The per-block rateLimit calls above each bound their own slice, but multiple
    // blocks firing in one wave used to compound (deadband +12% then escalation
    // +12% of the new value ⇒ ~+25%/wave). Clamping the NET move from hp0/thr0
    // guarantees ≤ ±maxStep, then re-clamp to the absolute bounds. Mercy stays
    // safe: it only ever lowers D_thr, and a symmetric net clamp can't push a
    // post-mercy value back ABOVE thr0 (the clamp only restricts the move).
    state.D_hp = clamp(rateLimit(hp0, state.D_hp, c.maxStep), c.hpMin, c.hpMax);
    state.D_thr = clamp(rateLimit(thr0, state.D_thr, c.maxStep), c.thrMin, c.thrMax);

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

/**
 * EFFECTIVE difficulty snapshot the live game reads. The reactive D_hp/D_thr are
 * multiplied by the §14 context (PWR pre-load × mode base) and then clamped by a
 * mode-aware ceiling so a strong build / hard mode pre-faces higher difficulty
 * immediately WITHOUT inflating HP into bullet-sponges (the deep-run escalation
 * rides enemyPower→density in DIR-10/composer, NOT D_hp here).
 *
 *   D_hp_eff  = clamp(D_hp_reactive · preload · mBase , hpMin , hpMax · MULT_MAX/2.5)
 *   D_thr_eff = clamp(D_thr_reactive · preload · mBase, thrMin, thrMax · MULT_MAX/2.5)
 *
 * DEFAULT-SAFE: at PWR_REF + NORMAL, preload = mBase = 1.0 and the ceiling factor
 * is 1.0 (MULT_MAX is NORMAL's own), so this returns EXACTLY { D_hp, D_thr } — the
 * byte-for-byte prior behavior.
 */
export function getDifficulty(state) {
    const c = state.cfg;
    const { scale } = contextScale(state);
    // Mode-aware ceiling: lift the reactive bounds by this mode's MULT_MAX vs
    // NORMAL's (1.0 at NORMAL). Keeps the APPLIED HP/threat bounded so the
    // preload/mode multipliers can't explode into absurd HP.
    const [, multMax] = modeMult(state.mode);
    const [, nMultMax] = modeMult(DEFAULT_MODE);
    const ceilRatio = nMultMax > 0 ? multMax / nMultMax : 1; // 1.0 at NORMAL
    const D_hp = clamp(state.D_hp * scale, c.hpMin, c.hpMax * ceilRatio);
    const D_thr = clamp(state.D_thr * scale, c.thrMin, c.thrMax * ceilRatio);
    return { D_hp, D_thr };
}

/**
 * Integer 1..5 threat pip (CD-16's HUD meter) derived from (D_hp+D_thr)/2 mapped
 * across the combined operating range. Cold-start neutral (D=1/1) ≈ pip 3; rises
 * monotonically as combined D climbs toward the ceilings.
 */
export function getThreatLevel(state) {
    const c = state.cfg;
    // Reflect the EFFECTIVE (preload × mode-included) difficulty so the HUD pip
    // tracks what the player actually faces. At neutral context this equals the
    // reactive (D_hp+D_thr)/2 mapping (= prior behavior). The pip range stays
    // anchored on the reactive bounds (the meter is a coarse 1..5 indicator).
    const eff = getDifficulty(state);
    const combined = (eff.D_hp + eff.D_thr) / 2;
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
    // Freeze the EFFECTIVE difficulty (reactive × preload × mode, clamped) so the
    // boss inherits the same difficulty the live game is reading. At neutral
    // context this equals { D_hp, D_thr } (= prior behavior; existing tests green).
    return Object.freeze(getDifficulty(state));
}

/**
 * DIR-04 — compute + EXPOSE the §14 absolute-baseline enemyPower and its split
 * knobs for a given wave. This is the SOURCE the DIR-10 composer will consume to
 * drive the deep-run escalation through enemy HP / damage / density — it does
 * NOT change how the live game currently applies D_hp/D_thr (that stays via
 * getDifficulty), so DIR-04 stays default-safe and avoids the bullet-sponge trap
 * until count/density distribution lands.
 *
 *   enemyPower = baseline(wave) · mBase · directorMult · preload
 *
 * where `directorMult` maps the reactive offense axis (D_hp) to a single scalar:
 * D_hp is the offense-outlet pressure (1.0 = on-design), so it IS the reactive
 * "how much enemy mass to throw" multiplier — we use it directly as directorMult.
 * The knobs split enemyPower by the ENEMY_POWER_EXP exponents (sum 1.0), so
 * `hpMult · dmgMult · densityMult === enemyPower` exactly:
 *   hpMult = enemyPower^0.5 · dmgMult = enemyPower^0.3 · densityMult = enemyPower^0.2
 *
 * @param {object} state director state.
 * @param {number} wave 1-indexed wave number.
 * @returns {{enemyPower:number, hpMult:number, dmgMult:number, densityMult:number,
 *            baseline:number, mBase:number, directorMult:number, preload:number}}
 */
export function getEnemyPower(state, wave) {
    const { preload, mBase } = contextScale(state);
    const base = baseline(wave);
    const directorMult = state.D_hp; // reactive offense-outlet pressure (1.0 = on-design)
    const enemyPower = base * mBase * directorMult * preload;
    const hpMult = Math.pow(enemyPower, ENEMY_POWER_EXP.hp);
    const dmgMult = Math.pow(enemyPower, ENEMY_POWER_EXP.dmg);
    const densityMult = Math.pow(enemyPower, ENEMY_POWER_EXP.density);
    return {
        enemyPower,
        hpMult,
        dmgMult,
        densityMult,
        // expose the factors for the composer / diagnostics
        baseline: base,
        mBase,
        directorMult,
        preload,
    };
}
