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

import { getRunMode } from '../core/constants.js';
import { modeReward } from '../wave/difficulty-constants.js';

// 8.10.0 — the run-SHAPE reward terms (waves-per-stage + stage-depth endurance)
// were removed with the "stages" grouping. Runs are a flat wave count now, so
// per-clear reward is driven by the difficulty MODE + per-clear PERFORMANCE
// only; the per-wave DIFFICULTY loot bonus (random-spike → richer loot) layers
// in via the difficulty director (see combat-manager).

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
 * Combined reward factor = modeReward(getRunMode(game)) × perfBonus(perf).
 *
 * DEFAULT-RUN GUARANTEE: returns EXACTLY 1.0 for a NORMAL run with no perf
 * (modeReward = 1.0, perfBonus({}) = 1.0). A HARD/flawless/fast clear, or a
 * clear under high director pressure, rewards more. The per-wave random
 * DIFFICULTY loot bonus is applied separately at the drop sites.
 *
 * @param {object} game  game-like object carrying `runConfig`
 * @param {number} wave  1-based current wave number (unused; kept for call-site stability)
 * @param {object} perf  { flawless?, fastClear?, directorMult? } (default {})
 * @returns {number}     1.0 for NORMAL no-perf runs; > 1.0 otherwise
 */
export function rewardMultiplier(game, wave, perf = {}) {
    return modeReward(getRunMode(game)) * perfBonus(perf);
}
