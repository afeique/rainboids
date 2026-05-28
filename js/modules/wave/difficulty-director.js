// 8.11.0 — CPU-governed RANDOM difficulty (replaces the skill-adaptive budget).
//
// Difficulty is NOT chosen by the player and NO LONGER adapts to skill — it's
// the game throwing curveballs. Each wave's difficulty is a DETERMINISTIC
// pseudo-random roll from (run seed, wave number):
//   • a base RAMP that rises gently with depth, plus
//   • per-wave VARIANCE (±) so consecutive waves differ, plus
//   • an occasional PUNISHING SPIKE (~1 in 5) that makes a wave a real wall.
// Deterministic-from-seed ⇒ reproducible (MP-safe — the sim is server-
// authoritative — and unit-testable); varying wave-to-wave ⇒ surprising, so no
// two runs feel the same and you can't grind the rubber-band.
//
// Two axes are still exposed for the consumers:
//   • D_hp  — enemy HP / mass (wave-manager applyEnemyLevelScaling). Bounds [0.6, 3.0].
//   • D_thr — enemy damage / threat (player lifecycle). Bounds [0.6, 1.8]; swings
//             less hard than HP (thrFrac) so spikes add targets more than lethality.
// The run MODE biases the whole curve (mode base + ceiling); a strong build
// (PWR preload) pre-faces a little more. A hard wave pays out MORE loot — see
// `waveLootMult`, folded into the drop rolls by combat-manager.
//
// Pure except for ONE entropy source: createDirector seeds from Math.random when
// no seed is supplied (the per-run seed). Every per-wave roll is a pure function
// of (seed, wave), so the module stays deterministic + testable given a seed.

import {
    pwrPreload,
    PWR_REF,
    modeBase,
    modeMult,
    MODES,
    DEFAULT_MODE,
} from './difficulty-constants.js';

/** Tuning. `opts` to createDirector may override any field (tests pass a seed). */
export const DIRECTOR_DEFAULTS = Object.freeze({
    hpMin: 0.6,            // D_hp bounds
    hpMax: 3.0,
    thrMin: 0.6,           // D_thr bounds (1.8 ceiling, not 2.0)
    thrMax: 1.8,
    rampPerWave: 0.035,    // base difficulty +3.5%/wave of depth (≈ +1.0 by wave ~30)
    variance: 0.35,        // ±35% per-wave random swing around the ramp
    spikeChance: 0.18,     // ~1 in 5 waves rolls a punishing spike
    spikeBonus: 0.7,       // a spike adds up to +0.7 on top of the swung base
    thrFrac: 0.65,         // threat axis swings 65% as hard as the HP axis
    lootSurpriseK: 1.5,    // loot bonus = 1 + K × (how far above baseline the wave rolled)
    coldStartWaves: 1,     // wave 1 is the flat baseline (a gentle opener)
});

/** CD-16's threat meter shows 5 pips (the HUD meter is gone, but assist + */
/** telemetry still read getThreatLevel as a 1..5 pressure read). */
export const THREAT_PIPS = 5;

// ── internal helpers ────────────────────────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function validateMode(mode) { return MODES.includes(mode) ? mode : DEFAULT_MODE; }

// Deterministic [0,1) hash of two 32-bit ints — a cheap, well-mixed mix so each
// per-wave roll is reproducible from (seed, wave) with NO RNG state to carry.
function hash01(a, b) {
    let h = (Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b)
        ^ Math.imul(((b | 0) + 0x165667b1) | 0, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
}

// Base difficulty ramp at a wave depth (no randomness): rises linearly from 1.0.
function baseRamp(cfg, wave) {
    return 1 + cfg.rampPerWave * Math.max(0, (wave | 0) - 1);
}

// The rolled (random) difficulty scalar for a wave: ramp × (1 ± variance) + an
// occasional spike. Cold-start wave(s) return the flat ramp (gentle opener).
// Pure function of (state.seed, wave) — same inputs ⇒ same difficulty.
function rollDifficulty(state, wave) {
    const c = state.cfg;
    const w = Math.max(1, wave | 0);
    const base = baseRamp(c, w);
    if (w <= c.coldStartWaves) return base;
    const swing = (hash01(state.seed, w) - 0.5) * 2 * c.variance;        // ±variance
    const spikeRoll = hash01(state.seed, (w + 0x5f3759) | 0);
    const spike = spikeRoll < c.spikeChance
        ? c.spikeBonus * hash01(state.seed, (w + 0x1234567) | 0)         // 0..spikeBonus
        : 0;
    return Math.max(c.hpMin, base * (1 + swing) + spike);
}

// Recompute the effective D_hp/D_thr from the current wave's roll + context
// (PWR preload × mode base, clamped by a mode-aware ceiling). Stores the raw
// roll on `state.difficulty` for waveLootMult.
function _applyRoll(state) {
    const c = state.cfg;
    const d = rollDifficulty(state, state.wave);
    state.difficulty = d;
    const scale = pwrPreload(state.pwr, PWR_REF) * modeBase(state.mode); // 1.0 at PWR_REF + NORMAL
    const [, multMax] = modeMult(state.mode);
    const [, nMultMax] = modeMult(DEFAULT_MODE);
    const ceilRatio = nMultMax > 0 ? multMax / nMultMax : 1;             // 1.0 at NORMAL
    state.D_hp = clamp(d * scale, c.hpMin, c.hpMax * ceilRatio);
    const dThr = 1 + (d - 1) * c.thrFrac; // threat swings less hard than HP
    state.D_thr = clamp(dThr * scale, c.thrMin, c.thrMax * ceilRatio);
    return state;
}

/**
 * Fresh director state. `opts.seed` (int) makes the run reproducible; absent, a
 * per-run seed is drawn from Math.random (the module's only entropy). `opts.pwr`
 * / `opts.mode` set the §14 context. Rolls wave 1 immediately.
 */
export function createDirector(opts = {}) {
    const cfg = { ...DIRECTOR_DEFAULTS, ...opts };
    const seed = Number.isFinite(opts.seed)
        ? (opts.seed | 0)
        : ((Math.random() * 0x7fffffff) | 0);
    const state = {
        seed,
        wave: 1,
        cfg,
        pwr: Number.isFinite(opts.pwr) ? opts.pwr : PWR_REF,
        mode: validateMode(opts.mode),
        D_hp: 1,
        D_thr: 1,
        difficulty: 1,
        // Back-compat fields the telemetry capture still reads (no longer
        // meaningful under the random model — difficulty doesn't track skill).
        Po: 1,
        Pd: 1,
    };
    return _applyRoll(state);
}

/**
 * Update the §14 context (build PWR + difficulty mode) and re-derive the
 * effective difficulty for the current wave. `threat` is accepted-but-ignored
 * (the drafted-stage threat offset was removed with the stage draft). Returns
 * `state` for chaining.
 */
export function setDirectorContext(state, ctx = {}) {
    if (Number.isFinite(ctx.pwr)) state.pwr = ctx.pwr;
    if (ctx.mode !== undefined) state.mode = validateMode(ctx.mode);
    return _applyRoll(state);
}

/**
 * Advance to the next wave. `outcome` no longer steers difficulty (the budget
 * model is gone) — it may still piggyback a PWR / mode update the caller folds
 * in. Increments `state.wave`. Returns the back-compat `{ Po, Pd }`.
 */
export function recordWave(state, outcome = {}) {
    if (Number.isFinite(outcome.pwr)) state.pwr = outcome.pwr;
    if (outcome.mode !== undefined) state.mode = validateMode(outcome.mode);
    state.wave += 1;
    return { Po: state.Po, Pd: state.Pd };
}

/** Re-roll the (now-current) wave's difficulty. Returns `{ D_hp, D_thr }`. */
export function updateDifficulty(state) {
    _applyRoll(state);
    return { D_hp: state.D_hp, D_thr: state.D_thr };
}

/** Per-wave cycle: advance the wave counter then roll its difficulty. */
export function tickWave(state, outcome) {
    recordWave(state, outcome);
    return updateDifficulty(state);
}

/** The effective difficulty the live game reads for the current wave. */
export function getDifficulty(state) {
    return { D_hp: state.D_hp, D_thr: state.D_thr };
}

/**
 * Integer 1..5 pressure read from the effective (D_hp+D_thr)/2 across the
 * operating range. Used by the Co-Pilot's situation assessment + run telemetry
 * (the on-screen THREAT meter itself was removed in 8.8.0).
 */
export function getThreatLevel(state) {
    const c = state.cfg;
    const combined = (state.D_hp + state.D_thr) / 2;
    const lo = (c.hpMin + c.thrMin) / 2;   // ≈0.6
    const hi = (c.hpMax + c.thrMax) / 2;   // ≈2.4
    const mid = THREAT_PIPS / 2 + 0.5;     // center pip (3 for 5 pips)
    let pip;
    if (combined <= 1) {
        const t = clamp((combined - lo) / (1 - lo), 0, 1);
        pip = 1 + t * (mid - 1);
    } else {
        const t = clamp((combined - 1) / (hi - 1), 0, 1);
        pip = mid + t * (THREAT_PIPS - mid);
    }
    return clamp(Math.round(pip), 1, THREAT_PIPS);
}

/**
 * Loot bonus for the current wave: 1.0 at/below the depth baseline, rising as
 * the wave's rolled difficulty climbs ABOVE its baseline (the random spikes).
 * A punishing curveball pays out handsomely; a quiet wave pays normal. Folded
 * into the drop rolls by combat-manager (drop chance + rarity bias + gold).
 */
export function waveLootMult(state) {
    const c = state.cfg;
    const base = baseRamp(c, state.wave);
    const surprise = base > 0 ? Math.max(0, state.difficulty / base - 1) : 0;
    return 1 + c.lootSurpriseK * surprise;
}

/**
 * Boss-lock: a FROZEN copy of the current { D_hp, D_thr } for a boss to hold for
 * its whole fight (no mid-fight change). Boss HP = baseTier × D_hp.
 */
export function lockForBoss(state) {
    return Object.freeze(getDifficulty(state));
}
