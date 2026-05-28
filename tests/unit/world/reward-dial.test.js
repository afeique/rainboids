// 8.10.0 — Reward Dial unit tests (pure, no DOM, no globals).
//
// Run shape is a flat wave count now (the "stages" + waves-per-stage reward
// terms were removed), so the dial = modeReward(mode) × perfBonus(perf). The
// CRITICAL guarantee: a NORMAL run with no performance bonus is EXACTLY 1.0.
// The per-wave random-difficulty loot bonus is applied separately at the drop
// sites, not here.
import {
    PERF_FLAWLESS_BONUS,
    PERF_FAST_CLEAR_BONUS,
    PERF_DIRECTOR_WEIGHT,
    perfBonus,
    rewardMultiplier,
} from '../../../js/modules/world/reward-dial.js';
import { modeReward } from '../../../js/modules/wave/difficulty-constants.js';

// A game-like object pinning the difficulty MODE (flat-wave runConfig).
const gameWithMode = (mode) => ({ runConfig: { maxWaves: 30, mode } });

describe('rewardMultiplier — default-run guarantee', () => {
    test('EXACTLY 1.0 for a NORMAL run with no perf, at every wave', () => {
        const game = gameWithMode('NORMAL');
        for (let wave = 1; wave <= 30; wave++) {
            expect(rewardMultiplier(game, wave)).toBe(1.0);
        }
    });

    test('EXACTLY 1.0 when no runConfig is set (implicit NORMAL)', () => {
        for (const wave of [1, 5, 10, 30]) {
            expect(rewardMultiplier({}, wave)).toBe(1.0);
            expect(rewardMultiplier(null, wave)).toBe(1.0);
        }
    });
});

describe('modeReward term (§14.4)', () => {
    test('the §14.4 mode table values', () => {
        expect(modeReward('EASY')).toBeCloseTo(0.8, 10);
        expect(modeReward('NORMAL')).toBe(1.0);
        expect(modeReward('HARD')).toBeCloseTo(1.3, 10);
        expect(modeReward('EPIC')).toBeCloseTo(1.7, 10);
        expect(modeReward('LEGENDARY')).toBeCloseTo(2.2, 10);
    });

    test('mode scales the run with no perf', () => {
        expect(rewardMultiplier(gameWithMode('EASY'), 5)).toBeCloseTo(0.8, 10);
        expect(rewardMultiplier(gameWithMode('NORMAL'), 5)).toBe(1.0);
        expect(rewardMultiplier(gameWithMode('HARD'), 5)).toBeCloseTo(1.3, 10);
        expect(rewardMultiplier(gameWithMode('EPIC'), 5)).toBeCloseTo(1.7, 10);
        expect(rewardMultiplier(gameWithMode('LEGENDARY'), 5)).toBeCloseTo(2.2, 10);
    });
});

describe('perfBonus term (§14.4)', () => {
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

    test('flawless → 1.25, fastClear → 1.15, both → 1.40', () => {
        expect(perfBonus({ flawless: true })).toBeCloseTo(1.25, 10);
        expect(perfBonus({ fastClear: true })).toBeCloseTo(1.15, 10);
        expect(perfBonus({ flawless: true, fastClear: true })).toBeCloseTo(1.40, 10);
    });

    test('directorMult 2.0 → 1 + (2-1)×0.30 = 1.30; ≤1 contributes nothing', () => {
        expect(perfBonus({ directorMult: 2.0 })).toBeCloseTo(1.30, 10);
        expect(perfBonus({ directorMult: 1.0 })).toBe(1.0);
        expect(perfBonus({ directorMult: 0.5 })).toBe(1.0); // never subtracts
    });

    test('combined: flawless + fastClear + directorMult 2.0 → 1.70', () => {
        expect(perfBonus({ flawless: true, fastClear: true, directorMult: 2.0 }))
            .toBeCloseTo(1.70, 10);
    });
});

describe('rewardMultiplier — mode × perf compound', () => {
    test('default perf arg is neutral (omitted === {} === 1.0 perf)', () => {
        const game = gameWithMode('HARD');
        for (const wave of [6, 30, 60]) {
            expect(rewardMultiplier(game, wave)).toBe(rewardMultiplier(game, wave, {}));
        }
    });

    test('HARD + flawless = modeReward × perfBonus = 1.3 × 1.25', () => {
        const game = gameWithMode('HARD');
        const perf = { flawless: true };
        expect(rewardMultiplier(game, 10, perf)).toBeCloseTo(modeReward('HARD') * perfBonus(perf), 10);
        expect(rewardMultiplier(game, 10, perf)).toBeCloseTo(1.3 * 1.25, 10);
    });

    test('LEGENDARY + flawless + fastClear + directorMult 1.5', () => {
        const game = gameWithMode('LEGENDARY');
        const perf = { flawless: true, fastClear: true, directorMult: 1.5 };
        expect(rewardMultiplier(game, 18, perf))
            .toBeCloseTo(modeReward('LEGENDARY') * perfBonus(perf), 10);
    });
});

describe('purity', () => {
    test('same inputs → same output (no hidden state / randomness)', () => {
        const game = gameWithMode('HARD');
        const a = rewardMultiplier(game, 30);
        const b = rewardMultiplier(game, 30);
        expect(a).toBe(b);
    });

    test('does not mutate the game object', () => {
        const game = gameWithMode('HARD');
        const snapshot = JSON.stringify(game);
        rewardMultiplier(game, 42, { flawless: true, directorMult: 2.0 });
        expect(JSON.stringify(game)).toBe(snapshot);
    });

    test('perfBonus does not mutate its perf arg', () => {
        const perf = { flawless: true, fastClear: true, directorMult: 1.5 };
        const snapshot = JSON.stringify(perf);
        perfBonus(perf);
        expect(JSON.stringify(perf)).toBe(snapshot);
    });
});
