// RUN-03 / X3 — Reward Dial unit tests (pure, no DOM, no globals).
// DIR-08 — §14.4 mode + performance reward terms.
//
// 9.11.0 — the run is now a FIXED 50-wave campaign (10 stages × 5 waves) and
// getRunConfig PINS the shape, ignoring any stages/wavesPerStage override. So
// every game-keyed reward term resolves at the canonical wps=5 / stages=10:
//   - wavesPerStageRewardMult → wavesPerStageRewardMultForWps(5) = 1.2
//   - stageDepthRewardMult / rewardMultiplier walk the fixed 10-stage depth.
// The pure wps-explicit helper (wavesPerStageRewardMultForWps) and the
// mode/perf terms still cover arbitrary inputs; the difficulty MODE term and
// a per-clear PERFORMANCE bonus still layer on multiplicatively.
import {
    WAVES_PER_STAGE_REWARD_MULT,
    DEFAULT_WAVES_PER_STAGE,
    WPS_REWARD_SLOPE,
    STAGE_DEPTH_MAX_BONUS,
    PERF_FLAWLESS_BONUS,
    PERF_FAST_CLEAR_BONUS,
    PERF_DIRECTOR_WEIGHT,
    wavesPerStageRewardMult,
    wavesPerStageRewardMultForWps,
    stageDepthRewardMult,
    perfBonus,
    rewardMultiplier,
} from '../../../js/modules/world/reward-dial.js';
import { modeReward } from '../../../js/modules/wave/difficulty-constants.js';

// A game-like object carrying just a runConfig (or none → default 10×3 NORMAL).
const gameWith = (stages, wavesPerStage) =>
    (stages == null) ? {} : { runConfig: { stages, wavesPerStage } };

// As above, but also pins the difficulty MODE (DIR-08).
const gameWithMode = (stages, wavesPerStage, mode) =>
    ({ runConfig: { stages, wavesPerStage, mode } });

describe('wavesPerStageRewardMult', () => {
    // 9.11.0 — the run is pinned to wps=5, so ALL game-keyed lookups resolve to
    // wavesPerStageRewardMultForWps(5) = 1.0 + 0.10×(5-3) = 1.2, regardless of
    // any (ignored) wavesPerStage override on the game's runConfig. The exact
    // 3/6/9 table values are still verified directly via the pure helper below.
    test('pinned run (wps=5) → 1.2 regardless of any override', () => {
        expect(wavesPerStageRewardMult(gameWith(10, 3))).toBeCloseTo(1.2, 10);
        expect(wavesPerStageRewardMult(gameWith(5, 6))).toBeCloseTo(1.2, 10);
        expect(wavesPerStageRewardMult(gameWith(4, 9))).toBeCloseTo(1.2, 10);
    });

    test('default (no runConfig) → pinned wps=5 → 1.2', () => {
        expect(wavesPerStageRewardMult({})).toBeCloseTo(1.2, 10);
        expect(wavesPerStageRewardMult(null)).toBeCloseTo(1.2, 10);
        expect(wavesPerStageRewardMult(undefined)).toBeCloseTo(1.2, 10);
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

    test('grows monotonically to the documented cap at the final stage (pinned 10×5 run)', () => {
        // 9.11.0 — the run is pinned to 10 stages × 5 waves = 50 waves; the wps
        // override is ignored, so stages are sized 5 and the final stage ends at
        // wave 50. Depth walks waves 5,10,…,50.
        const game = gameWith(10, 6); // override ignored → pinned 10×5
        const lastWaveOfStage = (s) => s * 5; // wave at end of stage s (wps=5)
        let prev = -Infinity;
        for (let s = 1; s <= 10; s++) {
            const m = stageDepthRewardMult(lastWaveOfStage(s), game);
            expect(m).toBeGreaterThanOrEqual(prev);
            prev = m;
        }
        // stage 1 → 1.0, stage 10 (final) → 1 + STAGE_DEPTH_MAX_BONUS.
        expect(stageDepthRewardMult(5, game)).toBeCloseTo(1.0, 10);
        expect(stageDepthRewardMult(50, game)).toBeCloseTo(1.0 + STAGE_DEPTH_MAX_BONUS, 10);
        // midpoint (stage ~5.5) sits around halfway up the bonus.
        expect(stageDepthRewardMult(25, game)).toBeGreaterThan(1.0);
        expect(stageDepthRewardMult(25, game)).toBeLessThan(1.0 + STAGE_DEPTH_MAX_BONUS);
    });

    test('pinned run is always 10 stages → there is always depth (no degenerate 1-stage run)', () => {
        // 9.11.0 — a 1-stage runConfig is ignored; the run is always 10 stages,
        // so stage-1 is exactly 1.0 but later stages climb above it.
        const game = gameWith(1, 6); // override ignored → pinned 10×5
        expect(stageDepthRewardMult(1, game)).toBeCloseTo(1.0, 10);
        expect(stageDepthRewardMult(50, game)).toBeCloseTo(1.0 + STAGE_DEPTH_MAX_BONUS, 10);
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

describe('rewardMultiplier — pinned-run shape (9.11.0)', () => {
    // 9.11.0 — the run is pinned to wps=5 (> DEFAULT_WAVES_PER_STAGE=3), so the
    // shape factor is wavesPerStageRewardMult(=1.2) × stageDepthRewardMult. At
    // stage 1 (wave 1) depth is 1.0, so a NORMAL no-perf run starts at exactly
    // 1.2 and grows with depth; the wps override is ignored.
    test('wps factor (1.2) applies at every wave for the pinned NORMAL run', () => {
        const game = gameWith(10, 3); // override ignored → pinned 10×5
        for (let wave = 1; wave <= 50; wave++) {
            const expected = wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
            expect(rewardMultiplier(game, wave)).toBeCloseTo(expected, 10);
        }
        // stage 1 (wave 1) → depth 1.0 → just the 1.2 wps factor.
        expect(rewardMultiplier(game, 1)).toBeCloseTo(1.2, 10);
    });

    test('no runConfig resolves to the same pinned shape', () => {
        for (const wave of [1, 5, 10, 25, 50]) {
            const expected = wavesPerStageRewardMult({}) * stageDepthRewardMult(wave, {});
            expect(rewardMultiplier({}, wave)).toBeCloseTo(expected, 10);
            expect(rewardMultiplier(null, wave)).toBeCloseTo(expected, 10);
        }
    });

    test('DEFAULT_WAVES_PER_STAGE is still 3, but the pinned run runs at wps=5', () => {
        expect(DEFAULT_WAVES_PER_STAGE).toBe(3);
        // Every override resolves to the pinned wps=5 shape (1.2 at stage 1).
        expect(rewardMultiplier(gameWith(10, 1), 1)).toBeCloseTo(1.2, 10);
        expect(rewardMultiplier(gameWith(10, 2), 1)).toBeCloseTo(1.2, 10);
        expect(rewardMultiplier(gameWith(10, 3), 1)).toBeCloseTo(1.2, 10);
    });
});

describe('rewardMultiplier — depth scaling on the pinned run', () => {
    test('> 1.0 at every wave, growing with depth', () => {
        const game = gameWith(10, 6); // override ignored → pinned 10×5
        // shallow wave still > 1.0 because the flat wps factor (1.2) applies.
        expect(rewardMultiplier(game, 1)).toBeGreaterThan(1.0);
        // deep wave compounds wps × stage-depth → strictly larger.
        expect(rewardMultiplier(game, 50)).toBeGreaterThan(rewardMultiplier(game, 1));
    });

    test('combined factor equals wps × stage-depth at every depth', () => {
        const game = gameWith(10, 6); // override ignored → pinned 10×5
        for (const wave of [5, 15, 30, 50]) {
            const expected = wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
            expect(rewardMultiplier(game, wave)).toBeCloseTo(expected, 10);
        }
    });

    test('final-stage factor ≈ 1.2 × 1.4 = 1.68 (pinned wps=5)', () => {
        const game = gameWith(10, 6); // override ignored → pinned 10×5
        expect(rewardMultiplier(game, 50)).toBeCloseTo(1.2 * (1.0 + STAGE_DEPTH_MAX_BONUS), 10);
    });
});

describe('modeReward term (DIR-08 / §14.4)', () => {
    test('the §14.4 mode table values', () => {
        expect(modeReward('EASY')).toBeCloseTo(0.8, 10);
        expect(modeReward('NORMAL')).toBe(1.0);
        expect(modeReward('HARD')).toBeCloseTo(1.3, 10);
        expect(modeReward('EPIC')).toBeCloseTo(1.7, 10);
        expect(modeReward('LEGENDARY')).toBeCloseTo(2.2, 10);
    });

    test('NORMAL mode (1.0) leaves the pinned shape factor unchanged', () => {
        // 9.11.0 — the run is pinned to wps=5, so a NORMAL run is the bare shape
        // factor (1.2 × stage-depth), not 1.0 — modeReward(NORMAL)=1.0 is a no-op.
        const game = gameWithMode(10, 3, 'NORMAL');
        for (const wave of [1, 5, 15, 50]) {
            const shape = wavesPerStageRewardMult(game) * stageDepthRewardMult(wave, game);
            expect(rewardMultiplier(game, wave)).toBeCloseTo(shape, 10);
        }
    });

    test('mode scales the pinned-shape run multiplicatively (no perf)', () => {
        // At wave 5 the pinned run is stage 1 (depth 1.0), so the shape factor is
        // exactly the wps factor (1.2); the result is 1.2 × modeReward(mode).
        const at5 = (mode) => rewardMultiplier(gameWithMode(10, 3, mode), 5);
        expect(at5('HARD')).toBeCloseTo(1.2 * 1.3, 10);
        expect(at5('LEGENDARY')).toBeCloseTo(1.2 * 2.2, 10);
        expect(at5('EASY')).toBeCloseTo(1.2 * 0.8, 10);
        expect(at5('EPIC')).toBeCloseTo(1.2 * 1.7, 10);
    });
});

describe('perfBonus term (DIR-08 / §14.4)', () => {
    test('the §14.4 addend tunables', () => {
        expect(PERF_FLAWLESS_BONUS).toBeCloseTo(0.25, 10);
        expect(PERF_FAST_CLEAR_BONUS).toBeCloseTo(0.15, 10);
        expect(PERF_DIRECTOR_WEIGHT).toBeCloseTo(0.30, 10);
    });

    test('{} (and undefined / null) → exactly 1.0 (neutral)', () => {
        expect(perfBonus({})).toBe(1.0);
        expect(perfBonus()).toBe(1.0);
        expect(perfBonus(null)).toBe(1.0);
    });

    test('flawless → 1.25', () => {
        expect(perfBonus({ flawless: true })).toBeCloseTo(1.25, 10);
    });

    test('fastClear → 1.15', () => {
        expect(perfBonus({ fastClear: true })).toBeCloseTo(1.15, 10);
    });

    test('flawless + fastClear → 1.40', () => {
        expect(perfBonus({ flawless: true, fastClear: true })).toBeCloseTo(1.40, 10);
    });

    test('directorMult 2.0 → 1 + (2-1)×0.30 = 1.30', () => {
        expect(perfBonus({ directorMult: 2.0 })).toBeCloseTo(1.30, 10);
    });

    test('directorMult ≤ 1 (or missing) contributes nothing', () => {
        expect(perfBonus({ directorMult: 1.0 })).toBe(1.0);
        expect(perfBonus({ directorMult: 0.5 })).toBe(1.0); // never subtracts
    });

    test('combined: flawless + fastClear + directorMult 2.0 → 1.70', () => {
        // 1 + 0.25 + 0.15 + (2-1)×0.30 = 1.70
        expect(perfBonus({ flawless: true, fastClear: true, directorMult: 2.0 }))
            .toBeCloseTo(1.70, 10);
    });
});

describe('rewardMultiplier — perf arg (DIR-08)', () => {
    test('default perf arg is neutral (omitted === {} === 1.0 perf)', () => {
        const game = gameWith(10, 6);
        for (const wave of [6, 30, 60]) {
            expect(rewardMultiplier(game, wave)).toBe(rewardMultiplier(game, wave, {}));
        }
    });

    test('perf bonus multiplies through on the pinned NORMAL run', () => {
        const game = gameWithMode(10, 3, 'NORMAL');
        // 9.11.0 — at wave 5 the pinned run is stage 1 (depth 1.0), shape = 1.2,
        // mode = 1.0, so the factor === 1.2 × perfBonus.
        expect(rewardMultiplier(game, 5, { flawless: true })).toBeCloseTo(1.2 * 1.25, 10);
        expect(rewardMultiplier(game, 5, { fastClear: true })).toBeCloseTo(1.2 * 1.15, 10);
        expect(rewardMultiplier(game, 5, { flawless: true, fastClear: true }))
            .toBeCloseTo(1.2 * 1.40, 10);
    });
});

describe('rewardMultiplier — all four factors compound (DIR-08)', () => {
    test('pinned shape + HARD + flawless at the final wave multiplies all four terms', () => {
        // 9.11.0 — wps override ignored → pinned 10×5. Wave 50 is the final
        // stage (full depth bonus).
        const game = gameWithMode(10, 6, 'HARD'); // override ignored → pinned 10×5
        const wave = 50; // final stage → full stage-depth bonus
        const perf = { flawless: true };
        const expected =
            wavesPerStageRewardMult(game)        // 1.2 (pinned wps=5)
            * stageDepthRewardMult(wave, game)   // 1.40 (final stage)
            * modeReward('HARD')                 // 1.3
            * perfBonus(perf);                   // 1.25
        expect(rewardMultiplier(game, wave, perf)).toBeCloseTo(expected, 10);
        // sanity: numerically 1.2 × 1.4 × 1.3 × 1.25 = 2.73
        expect(rewardMultiplier(game, wave, perf)).toBeCloseTo(2.73, 10);
        // strictly larger than any single factor alone
        expect(rewardMultiplier(game, wave, perf))
            .toBeGreaterThan(rewardMultiplier(game, wave));
    });

    test('full term breakdown: shape × mode × perf', () => {
        const game = gameWithMode(8, 9, 'LEGENDARY');
        const wave = 18;
        const perf = { flawless: true, fastClear: true, directorMult: 1.5 };
        const expected =
            wavesPerStageRewardMult(game)
            * stageDepthRewardMult(wave, game)
            * modeReward('LEGENDARY')
            * perfBonus(perf);
        expect(rewardMultiplier(game, wave, perf)).toBeCloseTo(expected, 10);
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
        rewardMultiplier(game, 42, { flawless: true, directorMult: 2.0 });
        stageDepthRewardMult(42, game);
        wavesPerStageRewardMult(game);
        expect(JSON.stringify(game)).toBe(snapshot);
    });

    test('perfBonus does not mutate its perf arg', () => {
        const perf = { flawless: true, fastClear: true, directorMult: 1.5 };
        const snapshot = JSON.stringify(perf);
        perfBonus(perf);
        expect(JSON.stringify(perf)).toBe(snapshot);
    });
});
