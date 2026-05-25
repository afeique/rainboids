// RUN-03 / X3 — the Reward Dial.  DIR-08 — §14.4 mode + performance terms.
//
// Run rewards scale with the player's chosen RUN SHAPE (more waves-per-stage
// = richer per-clear rewards) plus a gentle stage-depth ENDURANCE curve so
// long runs stay worthwhile. DIR-08 layers two MORE multiplicative terms on
// top: the run's difficulty MODE (§14.4) and a per-clear PERFORMANCE bonus
// (flawless / fast-clear / director pressure). This module is PURE plumbing:
// no DOM, no globals, no Date.now / no Math.random. Every function is
// deterministic in its inputs and unit-testable in isolation.
//
// ─── DEFAULT-RUN GUARANTEE (critical) ───────────────────────────────────
// The canonical campaign is the DEFAULT 10 × 3 NORMAL run. To guarantee ZERO
// behavior change for current play — and keep the entire existing test suite
// green by construction — `rewardMultiplier()` returns EXACTLY 1.0 for the
// default run shape: wavesPerStage ≤ 3 (so the wps + stage-depth factors are
// both 1.0), NORMAL mode (modeReward = 1.0), and no performance bonus
// (perf = {} → perfBonus = 1.0). Each of the four terms is independently
// neutral at its default, so they multiply to exactly 1.0.
//
// The four factors combine MULTIPLICATIVELY into one reward factor that the
// four reward sites (gold, drop chance, rarity bias, Cores) multiply through.

import { getRunConfig, runWavesPerStage, getRunMode } from '../core/constants.js';
import { modeReward } from '../wave/difficulty-constants.js';

// ─── Tunables (exported so tests + future tuning can reference them) ──────

// Waves-per-stage → flat reward multiplier. Frozen so it can't be mutated
// at runtime. 3 → ×1.0 (default, no-op), 6 → ×1.3, 9 → ×1.6.
export const WAVES_PER_STAGE_REWARD_MULT = Object.freeze({
    3: 1.0,
    6: 1.3,
    9: 1.6,
});

// The wps value at/below which the whole dial is inert (the default run).
export const DEFAULT_WAVES_PER_STAGE = 3;

// Linear slope used to interpolate / extrapolate the wps factor for any wps
// not in the table above. The table points (3,6,9 → 1.0,1.3,1.6) sit on the
// line `mult = 1.0 + 0.1 × (wps - 3)`, i.e. +0.10 per extra wave/stage. We
// reuse that exact slope so arbitrary values stay on-curve and the table
// values reproduce exactly.
export const WPS_REWARD_SLOPE = 0.10;

// Stage-depth endurance curve cap. The endurance factor grows LINEARLY from
// ≈1.0 at stage 1 to (1 + STAGE_DEPTH_MAX_BONUS) at the final stage. Kept
// mild per spec (+40% by the last stage).
export const STAGE_DEPTH_MAX_BONUS = 0.40;

/**
 * Flat waves-per-stage reward multiplier for a run.
 *
 * Reads `runWavesPerStage(game)` (default → 3) and returns the table factor
 * for 3/6/9, or a clamped linear interpolation/extrapolation for any other
 * value. Floored at 1.0 (wps ≤ 3 → 1.0) so the dial can only ever ADD
 * reward, never subtract.
 *
 * @param {object} game  game-like object carrying `runConfig` (or null)
 * @returns {number}     ≥ 1.0; exactly 1.0 for the default 3-wps run
 */
export function wavesPerStageRewardMult(game) {
    const wps = runWavesPerStage(game);
    return wavesPerStageRewardMultForWps(wps);
}

// Pure wps → factor (split out so tests can probe arbitrary wps directly).
export function wavesPerStageRewardMultForWps(wps) {
    const w = Math.max(1, wps | 0);
    if (w <= DEFAULT_WAVES_PER_STAGE) return 1.0;
    // Exact table hits for 6 / 9; on-line interpolation for anything else.
    if (Object.prototype.hasOwnProperty.call(WAVES_PER_STAGE_REWARD_MULT, w)) {
        return WAVES_PER_STAGE_REWARD_MULT[w];
    }
    return Math.max(1.0, 1.0 + WPS_REWARD_SLOPE * (w - DEFAULT_WAVES_PER_STAGE));
}

/**
 * Stage-depth ENDURANCE curve factor.
 *
 * A gentle additional multiplier that grows with how deep into the run the
 * player is, so later stages reward more and long runs stay worthwhile. The
 * curve is LINEAR in normalized stage progress and normalized over the
 * REAL run length (`getRunConfig(game).stages`):
 *
 *   stage    = getStage(wave, wavesPerStage)            // 1 .. stages
 *   progress = (stage - 1) / (stages - 1)               // 0 at stage 1, 1 at final
 *   factor   = 1 + STAGE_DEPTH_MAX_BONUS × progress      // 1.0 .. 1.40
 *
 * So at stage 1 it is exactly 1.0, and at the final stage it is
 * (1 + STAGE_DEPTH_MAX_BONUS) = 1.40 for the default cap. A 1-stage run (no
 * depth to traverse) returns 1.0 at every wave.
 *
 * @param {number} wave  1-based wave number
 * @param {object} game  game-like object carrying `runConfig`
 * @param {object} opts  { maxBonus } optional override of the cap
 * @returns {number}     1.0 .. (1 + maxBonus)
 */
export function stageDepthRewardMult(wave, game, opts = {}) {
    const { stages, wavesPerStage } = getRunConfig(game);
    if (stages <= 1) return 1.0;
    const wps = Math.max(1, wavesPerStage | 0);
    // Inline getStage (avoid a second import); clamped into 1..stages.
    const rawStage = Math.ceil(Math.max(1, wave | 0) / wps);
    const stage = Math.min(stages, Math.max(1, rawStage));
    const progress = (stage - 1) / (stages - 1); // 0 .. 1
    const maxBonus = (typeof opts.maxBonus === 'number' && isFinite(opts.maxBonus))
        ? Math.max(0, opts.maxBonus)
        : STAGE_DEPTH_MAX_BONUS;
    return 1.0 + maxBonus * progress;
}

// ─── DIR-08 / §14.4 — performance bonus tunables ─────────────────────────
// Per-clear PERFORMANCE bonus addends. A clear earns extra reward for taking
// no damage (flawless), clearing under par (fastClear), and for fighting
// through high director pressure (directorMult > 1). All neutral by default.
export const PERF_FLAWLESS_BONUS = 0.25;
export const PERF_FAST_CLEAR_BONUS = 0.15;
export const PERF_DIRECTOR_WEIGHT = 0.30;

/**
 * §14.4 performance bonus — a pure additive-then-summed multiplier.
 *
 *   perfBonus = 1
 *             + (flawless  ? PERF_FLAWLESS_BONUS   : 0)   // +0.25
 *             + (fastClear ? PERF_FAST_CLEAR_BONUS : 0)   // +0.15
 *             + max(0, directorMult - 1) × PERF_DIRECTOR_WEIGHT
 *
 * Default-safe: an empty/absent `perf` object → exactly 1.0 (neutral). A
 * directorMult ≤ 1 (or missing) contributes nothing, so it can only ever ADD
 * reward, never subtract.
 *
 * @param {object} perf  { flawless?, fastClear?, directorMult? }
 * @returns {number}     ≥ 1.0; exactly 1.0 for the neutral {} default
 */
export function perfBonus(perf = {}) {
    const p = perf || {};
    const directorMult = (typeof p.directorMult === 'number' && isFinite(p.directorMult))
        ? p.directorMult
        : 1.0;
    return 1.0
        + (p.flawless ? PERF_FLAWLESS_BONUS : 0)
        + (p.fastClear ? PERF_FAST_CLEAR_BONUS : 0)
        + Math.max(0, directorMult - 1) * PERF_DIRECTOR_WEIGHT;
}

/**
 * Combined reward factor =
 *   wavesPerStageRewardMult × stageDepthRewardMult
 *   × modeReward(getRunMode(game)) × perfBonus(perf).
 *
 * DEFAULT-RUN GUARANTEE: returns EXACTLY 1.0 for the default run shape —
 * wavesPerStage ≤ 3 (wps + stage-depth factors are both 1.0), NORMAL mode
 * (modeReward = 1.0), and no performance bonus (perf = {} → 1.0). Each term
 * is independently neutral at its default, so a default 10 × 3 NORMAL run
 * with no perf is reward-identical to today at EVERY wave.
 *
 * The wps + stage-depth pair are still gated behind the richer-run shape
 * (wps ≥ 6); the mode + perf terms apply at ANY wps, so a HARD or flawless
 * DEFAULT-shape run now correctly rewards more.
 *
 * @param {object} game  game-like object carrying `runConfig`
 * @param {number} wave  1-based current wave number
 * @param {object} perf  { flawless?, fastClear?, directorMult? } (default {})
 * @returns {number}     1.0 for default NORMAL no-perf runs; > 1.0 otherwise
 */
export function rewardMultiplier(game, wave, perf = {}) {
    const wps = runWavesPerStage(game);
    // wps + stage-depth pair stay gated behind the richer-run shape.
    const shapeMult = (wps <= DEFAULT_WAVES_PER_STAGE)
        ? 1.0
        : wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
    return shapeMult * modeReward(getRunMode(game)) * perfBonus(perf);
}
