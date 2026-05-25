// DIR-02 / Adaptive Difficulty Director — constants table + absolute baseline
// curve (Design Plan §14.5 + §14.6). This is the FOUNDATION the full §14 model
// (PWR §14.1, control loop §14.2, composer §14.3, reward §14.4) reads from:
// one frozen home for every tunable so the RUN-07 balance pass has a single
// authoritative table to sweep.
//
// §14.5 — the enemy baseline is an ABSOLUTE, monotonic curve (it replaces the
// old run-normalized t=(w-1)/(N-1) ramp, which plateaued on long runs):
//   baseline(wave) = 1 + A*wave + B*wave^1.5     // A=0.15, B=0.06
//     baseline(30) ≈ 1 + 4.5 + 9.9  ≈ 15.4  (matches today's wave-30 finale)
//     baseline(90) ≈ 1 + 13.5 + 51  ≈ 65    (head-room for 100-stage runs)
// Because A,B > 0 and wave ≥ 1, baseline is strictly increasing forever — a
// long run always trends harder, and the player-relative correction (§14.2)
// rides on top.
//
// §14.6 — every constant below is a STARTING value flagged for the balance
// pass; the SHAPES (monotone baseline, DOWN > UP anti-death-spiral, mode order)
// are the design intent. Per-mode tables are keyed by canonical MODE string.
//
// Pure: no globals, Date.now(), Math.random(), DOM, or game-module imports.
// Every exported table is Object.freeze'd (deep) so callers cannot mutate the
// shared config. Unit-tests cleanly.

// ── baseline curve coefficients (§14.5 / §14.6) ──────────────────────
/** Linear baseline coefficient. */
export const A = 0.15;
/** Super-linear (^1.5) baseline coefficient. */
export const B = 0.06;

/**
 * Absolute, monotonically-increasing enemy baseline multiplier for a 1-indexed
 * wave (§14.5). Pure. Guards `wave ≥ 1` (waves below 1 are treated as wave 1 so
 * the curve never dips below its wave-1 value).
 *   baseline(1)  ≈ 1.21
 *   baseline(30) ≈ 15.4
 *   baseline(90) ≈ 65
 * @param {number} wave 1-indexed wave number.
 * @returns {number} baseline difficulty multiplier (≥ baseline(1)).
 */
export function baseline(wave) {
    const w = Number.isFinite(wave) && wave > 1 ? wave : 1;
    return 1 + A * w + B * Math.pow(w, 1.5);
}

// ── canonical modes (§13.2 / §14) ────────────────────────────────────
/** Canonical mode order, used to seed every per-mode table below. */
export const MODES = Object.freeze(['EASY', 'NORMAL', 'HARD', 'EPIC', 'LEGENDARY']);
/** Fallback mode for unknown lookups. */
export const DEFAULT_MODE = 'NORMAL';

// ── PWR / pre-load (§14.1 / §14.2) ───────────────────────────────────
// NOTE: K_PWR is the PWR *scale* and lives with the PWR formula in
// power-level.js (DIR-01). It is re-exported here ONLY as a convenience
// reference so the §14.6 table is complete in one place; power-level.js stays
// the source of truth for the PWR computation itself.
/** PWR scale — tuned so a fresh starter build ≈ PWR_REF. // TUNE (lives in DIR-01) */
export const K_PWR = 100; // TUNE
/** Pre-load reference: a starter build's PWR ≈ 100. */
export const PWR_REF = 100;
/** Sustain → EHP horizon, in seconds (§14.1). */
export const SUSTAIN_WINDOW = 4;

/**
 * §14.2 PWR pre-load: a stronger build pre-faces tougher enemies instead of the
 * Director waiting to observe a stomp. Pure.
 *   pwrPreload(PWR_REF) → 1.0 ; clamped to [0.8, 3.0].
 * @param {number} pwr the build's current PWR.
 * @param {number} [ref=PWR_REF] reference PWR (starter).
 * @returns {number} pre-load multiplier in [PWR_PRELOAD_MIN, PWR_PRELOAD_MAX].
 */
export function pwrPreload(pwr, ref = PWR_REF) {
    const r = Number.isFinite(pwr) && pwr > 0 ? pwr : 0;
    const base = Number.isFinite(ref) && ref > 0 ? ref : PWR_REF;
    return clamp(Math.sqrt(r / base), PWR_PRELOAD_MIN, PWR_PRELOAD_MAX);
}

/** Pre-load clamp floor (§14.2). */
export const PWR_PRELOAD_MIN = 0.8;
/** Pre-load clamp ceiling (§14.2). */
export const PWR_PRELOAD_MAX = 3.0;

// ── passive utility weights (§14.6 — PWR's U term) ───────────────────
/** Keystone passive utility weight. */
export const KEYSTONE_W = 3;
/** Modular passive utility weight. */
export const MODULAR_W = 1;

// ── pressure-signal weights (§14.2 step 1) ───────────────────────────
// P = clamp(W_HP*(1-hpEnd) + W_DMG*dmgTaken + W_CLEAR*(clearRatio/2) + W_ND*nearDeath, 0, 1)
// Weights sum to 1.0 so P is a clean [0,1] pressure index.
/** Weight on HP-lost-at-clear. */
export const W_HP = 0.40;
/** Weight on damage-taken-this-wave (fraction of maxHP). */
export const W_DMG = 0.25;
/** Weight on clear-speed ratio. */
export const W_CLEAR = 0.20;
/** Weight on near-death / revive flag. */
export const W_ND = 0.15;

// ── enemyPower → knob exponents (§14.2) ──────────────────────────────
// Exponents sum to 1.0, so hpMult*dmgMult*densityMult == enemyPower exactly.
export const ENEMY_POWER_EXP = Object.freeze({
    hp: 0.50,
    dmg: 0.30,
    density: 0.20,
});

/**
 * Speed cap: enemy/projectile SPEEDS are never scaled by enemyPower beyond this
 * factor (keeps projectiles dodgeable no matter how high enemyPower climbs).
 * §14.2. // TUNE
 */
export const SPEED_CAP = 1.5; // TUNE

/** Composer budget unit (§14.3) — tuned to wave-1 feel. // TUNE */
export const BUDGET_BASE = 100; // TUNE

/** Composer hard cap on roster size (§14.3 / §14.6). */
export const ROSTER_CAP = 40;
/** Fraction of an elite wave's threat budget spent eliteIfy-ing one enemy (§14.3). */
export const ELITE_FRACTION = 0.5;

// ── depth → reward + rarity bias (§14.4 / §14.6) ─────────────────────
/** Reward grows +2%/wave with depth: depthReward(wave) = 1 + DEPTH_RATE*(wave-1). */
export const DEPTH_RATE = 0.02;
/** Rarity bias grows with stage depth (§14.4 rarityBias). */
export const DEPTH_BIAS = 0.04;

// ── per-mode tables (§14.6) ──────────────────────────────────────────
// Each is frozen and keyed by canonical MODE string. Loose values (UP/DOWN,
// MULT clamps) are sensible starting tables matching the design intent and are
// flagged // TUNE on the table.

/** Target pressure band [lo, hi] per mode (higher = mode wants more pressure). */
export const MODE_BAND = Object.freeze({
    EASY:      Object.freeze([0.15, 0.40]),
    NORMAL:    Object.freeze([0.30, 0.55]),
    HARD:      Object.freeze([0.45, 0.70]),
    EPIC:      Object.freeze([0.55, 0.80]),
    LEGENDARY: Object.freeze([0.65, 0.90]),
});

/**
 * Per-wave ramp rates [UP_RATE, DOWN_RATE] per mode. DOWN > UP everywhere
 * (anti-death-spiral: ease faster than we ramp). Normal = 0.05 / 0.10 (§14.6).
 * // TUNE — per-mode UP/DOWN are starting values; the SHAPE (DOWN>UP) is intent.
 */
export const MODE_RATE = Object.freeze({
    EASY:      Object.freeze([0.04, 0.12]), // TUNE
    NORMAL:    Object.freeze([0.05, 0.10]),
    HARD:      Object.freeze([0.06, 0.09]), // TUNE
    EPIC:      Object.freeze([0.07, 0.08]), // TUNE
    LEGENDARY: Object.freeze([0.08, 0.08]), // TUNE
});

/**
 * directorMult clamp [MULT_MIN, MULT_MAX] per mode. Normal = 0.6 / 2.5 (§14.6).
 * Higher modes raise the ceiling (build can be pushed harder). // TUNE
 */
export const MODE_MULT = Object.freeze({
    EASY:      Object.freeze([0.6, 1.8]), // TUNE
    NORMAL:    Object.freeze([0.6, 2.5]),
    HARD:      Object.freeze([0.7, 3.0]), // TUNE
    EPIC:      Object.freeze([0.8, 3.5]), // TUNE
    LEGENDARY: Object.freeze([0.9, 4.0]), // TUNE
});

/** Static mode multiplier under the Director (§14.6). */
export const MODE_BASE = Object.freeze({
    EASY: 0.8,
    NORMAL: 1.0,
    HARD: 1.25,
    EPIC: 1.6,
    LEGENDARY: 2.0,
});

/** Rising-resistance strength per mode (§14.6). */
export const MODE_RESIST = Object.freeze({
    EASY: 0,
    NORMAL: 0.1,
    HARD: 0.2,
    EPIC: 0.35,
    LEGENDARY: 0.5,
});

/** Wave-modifier (affix) frequency per mode (§14.6). */
export const AFFIX_CHANCE = Object.freeze({
    EASY: 0,
    NORMAL: 0.15,
    HARD: 0.3,
    EPIC: 0.45,
    LEGENDARY: 0.6,
});

/** Loot + gold multiplier per mode (§14.6). */
export const MODE_REWARD = Object.freeze({
    EASY: 0.8,
    NORMAL: 1.0,
    HARD: 1.3,
    EPIC: 1.7,
    LEGENDARY: 2.2,
});

// ── internal helpers ─────────────────────────────────────────────────
function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

// Generic per-mode lookup with a NORMAL fallback for unknown/missing modes.
function lookup(table, mode) {
    return Object.prototype.hasOwnProperty.call(table, mode)
        ? table[mode]
        : table[DEFAULT_MODE];
}

// ── per-mode accessors (NORMAL fallback for unknown modes) ────────────
/** Target pressure band [lo, hi] for a mode (NORMAL fallback). */
export function modeBand(mode) { return lookup(MODE_BAND, mode); }
/** [UP_RATE, DOWN_RATE] for a mode (NORMAL fallback). */
export function modeRate(mode) { return lookup(MODE_RATE, mode); }
/** [MULT_MIN, MULT_MAX] directorMult clamp for a mode (NORMAL fallback). */
export function modeMult(mode) { return lookup(MODE_MULT, mode); }
/** Static MODE_BASE multiplier for a mode (NORMAL fallback). */
export function modeBase(mode) { return lookup(MODE_BASE, mode); }
/** Rising-resistance strength for a mode (NORMAL fallback). */
export function modeResist(mode) { return lookup(MODE_RESIST, mode); }
/** Affix chance for a mode (NORMAL fallback). */
export function affixChance(mode) { return lookup(AFFIX_CHANCE, mode); }
/** Reward multiplier for a mode (NORMAL fallback). */
export function modeReward(mode) { return lookup(MODE_REWARD, mode); }

/**
 * The complete §14.6 constants table, deep-frozen, in one structured object.
 * `baseline` / `pwrPreload` (the §14.5 / §14.2 pure functions) live as named
 * exports above; this object holds the DATA.
 */
export const DIFFICULTY_CONSTANTS = Object.freeze({
    // baseline curve (§14.5)
    A,
    B,
    // PWR / pre-load (§14.1 / §14.2)
    K_PWR,
    PWR_REF,
    SUSTAIN_WINDOW,
    PWR_PRELOAD_MIN,
    PWR_PRELOAD_MAX,
    // passive utility weights
    KEYSTONE_W,
    MODULAR_W,
    // pressure-signal weights (§14.2)
    W_HP,
    W_DMG,
    W_CLEAR,
    W_ND,
    // enemyPower knobs (§14.2)
    ENEMY_POWER_EXP,
    SPEED_CAP,
    // composer (§14.3)
    BUDGET_BASE,
    ROSTER_CAP,
    ELITE_FRACTION,
    // reward / depth (§14.4)
    DEPTH_RATE,
    DEPTH_BIAS,
    // per-mode tables (§14.6)
    MODE_BAND,
    MODE_RATE,
    MODE_MULT,
    MODE_BASE,
    MODE_RESIST,
    AFFIX_CHANCE,
    MODE_REWARD,
    // modes
    MODES,
    DEFAULT_MODE,
});
