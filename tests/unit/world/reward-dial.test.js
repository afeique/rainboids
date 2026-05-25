// RUN-03 / X3 — Reward Dial unit tests (pure, no DOM, no globals).
//
// The CRITICAL guarantee under test: the DEFAULT 10×3 campaign is
// reward-identical to today — rewardMultiplier() === EXACTLY 1.0 at every
// wave. Richer runs (wps ≥ 6) compound a flat waves-per-stage factor with a
// gentle stage-depth endurance curve.
import {
    WAVES_PER_STAGE_REWARD_MULT,
    DEFAULT_WAVES_PER_STAGE,
    WPS_REWARD_SLOPE,
    STAGE_DEPTH_MAX_BONUS,
    wavesPerStageRewardMult,
    wavesPerStageRewardMultForWps,
    stageDepthRewardMult,
    rewardMultiplier,
} from '../../../js/modules/world/reward-dial.js';

// A game-like object carrying just a runConfig (or none → default 10×3).
const gameWith = (stages, wavesPerStage) =>
    (stages == null) ? {} : { runConfig: { stages, wavesPerStage } };

describe('wavesPerStageRewardMult', () => {
    test('table hits: 3 → 1.0, 6 → 1.3, 9 → 1.6', () => {
        expect(wavesPerStageRewardMult(gameWith(10, 3))).toBe(1.0);
        expect(wavesPerStageRewardMult(gameWith(5, 6))).toBeCloseTo(1.3, 10);
        expect(wavesPerStageRewardMult(gameWith(4, 9))).toBeCloseTo(1.6, 10);
    });

    test('default (no runConfig) → 1.0', () => {
        expect(wavesPerStageRewardMult({})).toBe(1.0);
        expect(wavesPerStageRewardMult(null)).toBe(1.0);
        expect(wavesPerStageRewardMult(undefined)).toBe(1.0);
    });

    test('wps ≤ 3 floors at 1.0', () => {
        expect(wavesPerStageRewardMultForWps(1)).toBe(1.0);
        expect(wavesPerStageRewardMultForWps(2)).toBe(1.0);
        expect(wavesPerStageRewardMultForWps(3)).toBe(1.0);
    });

    test('fallback interpolation/extrapolation for off-table wps stays on-line and ≥ 1.0', () => {
        // On the line 1 + 0.10×(wps-3): wps=4 → 1.1, wps=5 → 1.2, wps=12 → 1.9.
        expect(wavesPerStageRewardMultForWps(4)).toBeCloseTo(1.0 + WPS_REWARD_SLOPE * 1, 10);
        expect(wavesPerStageRewardMultForWps(5)).toBeCloseTo(1.0 + WPS_REWARD_SLOPE * 2, 10);
        expect(wavesPerStageRewardMultForWps(12)).toBeCloseTo(1.0 + WPS_REWARD_SLOPE * 9, 10);
        // table values reproduce exactly on the same line
        expect(WAVES_PER_STAGE_REWARD_MULT[6]).toBeCloseTo(1.0 + WPS_REWARD_SLOPE * 3, 10);
        expect(WAVES_PER_STAGE_REWARD_MULT[9]).toBeCloseTo(1.0 + WPS_REWARD_SLOPE * 6, 10);
        // never below 1.0
        for (let w = 1; w <= 20; w++) {
            expect(wavesPerStageRewardMultForWps(w)).toBeGreaterThanOrEqual(1.0);
        }
    });

    test('WAVES_PER_STAGE_REWARD_MULT is frozen', () => {
        expect(Object.isFrozen(WAVES_PER_STAGE_REWARD_MULT)).toBe(true);
    });
});

describe('stageDepthRewardMult', () => {
    test('≈1.0 at stage 1 for any run', () => {
        // wave 1 = stage 1 in both a 10×3 and a 10×6 run.
        expect(stageDepthRewardMult(1, gameWith(10, 3))).toBeCloseTo(1.0, 10);
        expect(stageDepthRewardMult(1, gameWith(10, 6))).toBeCloseTo(1.0, 10);
    });

    test('grows monotonically to the documented cap at the final stage (10×6 run)', () => {
        const game = gameWith(10, 6); // 60 waves, 10 stages
        const lastWaveOfStage = (s) => s * 6; // wave at end of stage s
        let prev = -Infinity;
        for (let s = 1; s <= 10; s++) {
            const m = stageDepthRewardMult(lastWaveOfStage(s), game);
            expect(m).toBeGreaterThanOrEqual(prev);
            prev = m;
        }
        // stage 1 → 1.0, stage 10 (final) → 1 + STAGE_DEPTH_MAX_BONUS.
        expect(stageDepthRewardMult(6, game)).toBeCloseTo(1.0, 10);
        expect(stageDepthRewardMult(60, game)).toBeCloseTo(1.0 + STAGE_DEPTH_MAX_BONUS, 10);
        // midpoint (stage ~5.5) sits around halfway up the bonus.
        expect(stageDepthRewardMult(30, game)).toBeGreaterThan(1.0);
        expect(stageDepthRewardMult(30, game)).toBeLessThan(1.0 + STAGE_DEPTH_MAX_BONUS);
    });

    test('1-stage run has no depth → 1.0 always', () => {
        const game = gameWith(1, 6);
        expect(stageDepthRewardMult(1, game)).toBe(1.0);
        expect(stageDepthRewardMult(6, game)).toBe(1.0);
    });

    test('opts.maxBonus overrides the cap', () => {
        const game = gameWith(10, 6);
        expect(stageDepthRewardMult(60, game, { maxBonus: 0.5 })).toBeCloseTo(1.5, 10);
    });

    test('clamps deep waves to the final stage (no over-shoot)', () => {
        const game = gameWith(10, 6);
        // wave beyond runMaxWaves still clamps to stage 10 → cap.
        expect(stageDepthRewardMult(999, game)).toBeCloseTo(1.0 + STAGE_DEPTH_MAX_BONUS, 10);
    });
});

describe('rewardMultiplier — default-run guarantee', () => {
    test('EXACTLY 1.0 for the default 10×3 run at every wave', () => {
        const game = gameWith(10, 3);
        for (let wave = 1; wave <= 30; wave++) {
            expect(rewardMultiplier(game, wave)).toBe(1.0);
        }
    });

    test('EXACTLY 1.0 when no runConfig is set (implicit default)', () => {
        for (const wave of [1, 5, 10, 15, 30]) {
            expect(rewardMultiplier({}, wave)).toBe(1.0);
            expect(rewardMultiplier(null, wave)).toBe(1.0);
        }
    });

    test('EXACTLY 1.0 for any wps ≤ DEFAULT_WAVES_PER_STAGE', () => {
        expect(DEFAULT_WAVES_PER_STAGE).toBe(3);
        expect(rewardMultiplier(gameWith(10, 1), 5)).toBe(1.0);
        expect(rewardMultiplier(gameWith(10, 2), 5)).toBe(1.0);
        expect(rewardMultiplier(gameWith(10, 3), 5)).toBe(1.0);
    });
});

describe('rewardMultiplier — richer runs', () => {
    test('> 1.0 for a 10×6 run at deep waves', () => {
        const game = gameWith(10, 6);
        // shallow wave still > 1.0 because the flat wps factor (1.3) applies.
        expect(rewardMultiplier(game, 1)).toBeGreaterThan(1.0);
        // deep wave compounds wps × stage-depth → strictly larger.
        expect(rewardMultiplier(game, 60)).toBeGreaterThan(rewardMultiplier(game, 1));
    });

    test('combined factor equals wps × stage-depth for richer runs', () => {
        const game = gameWith(10, 6);
        for (const wave of [6, 18, 36, 60]) {
            const expected = wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
            expect(rewardMultiplier(game, wave)).toBeCloseTo(expected, 10);
        }
    });

    test('final-stage 10×6 factor ≈ 1.3 × 1.4 = 1.82', () => {
        const game = gameWith(10, 6);
        expect(rewardMultiplier(game, 60)).toBeCloseTo(1.3 * (1.0 + STAGE_DEPTH_MAX_BONUS), 10);
    });
});

describe('purity', () => {
    test('same inputs → same output (no hidden state / randomness)', () => {
        const game = gameWith(10, 6);
        const a = rewardMultiplier(game, 30);
        const b = rewardMultiplier(game, 30);
        const c = rewardMultiplier(game, 30);
        expect(a).toBe(b);
        expect(b).toBe(c);
        expect(stageDepthRewardMult(30, game)).toBe(stageDepthRewardMult(30, game));
        expect(wavesPerStageRewardMult(game)).toBe(wavesPerStageRewardMult(game));
    });

    test('does not mutate the game object', () => {
        const game = gameWith(10, 6);
        const snapshot = JSON.stringify(game);
        rewardMultiplier(game, 42);
        stageDepthRewardMult(42, game);
        wavesPerStageRewardMult(game);
        expect(JSON.stringify(game)).toBe(snapshot);
    });
});
