// RUN-03 / X3 — the Reward Dial.
//
// Run rewards scale with the player's chosen RUN SHAPE (more waves-per-stage
// = richer per-clear rewards) plus a gentle stage-depth ENDURANCE curve so
// long runs stay worthwhile. This module is PURE plumbing: no DOM, no
// globals, no Date.now / no Math.random. Every function is deterministic in
// its inputs and unit-testable in isolation.
//
// ─── DEFAULT-RUN GUARANTEE (critical) ───────────────────────────────────
// The canonical campaign is the DEFAULT 10 × 3 run (wavesPerStage = 3). To
// guarantee ZERO behavior change for current play — and keep the entire
// existing test suite green by construction — `rewardMultiplier()` returns
// EXACTLY 1.0 whenever `runWavesPerStage(game) <= 3` (the default). BOTH the
// waves-per-stage factor AND the stage-depth endurance curve only activate
// for richer runs (wps ≥ 6), which the not-yet-built RUN-06 setup UI will
// let players opt into. Until then the dial is inert at every reward site.
//
// The two factors combine MULTIPLICATIVELY into one reward factor that the
// four reward sites (gold, drop chance, rarity bias, Cores) multiply through.

import { getRunConfig, runWavesPerStage } from '../core/constants.js';

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

/**
 * Combined reward factor = wavesPerStageRewardMult × stageDepthRewardMult.
 *
 * DEFAULT-RUN GUARANTEE: returns EXACTLY 1.0 whenever
 * `runWavesPerStage(game) <= DEFAULT_WAVES_PER_STAGE` (3). This means a
 * default 10 × 3 campaign is reward-identical to today at EVERY wave — the
 * dial is a pure opt-in that only activates once a richer run shape (wps ≥ 6)
 * is selected via the future RUN-06 setup UI. For richer runs BOTH curves
 * apply and compound multiplicatively.
 *
 * @param {object} game  game-like object carrying `runConfig`
 * @param {number} wave  1-based current wave number
 * @returns {number}     1.0 for default runs; > 1.0 for richer runs
 */
export function rewardMultiplier(game, wave) {
    const wps = runWavesPerStage(game);
    if (wps <= DEFAULT_WAVES_PER_STAGE) return 1.0;
    return wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
}
