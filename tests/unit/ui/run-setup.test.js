// RUN-06 — RUN SETUP pure helpers. Pins the run-shape clamp grid + the live
// readout string (total waves + reward multiplier) that the BUILD footer's
// RUN SETUP controls render. The readout multiplier is derived from the
// shipped reward-dial helper, so these assertions also guard that the UI
// always agrees with the in-run reward math (×1.0 / ×1.3 / ×1.6).
import { describe, expect, test } from '@jest/globals';
import {
    clampRunStages,
    clampRunWps,
    clampRunConfig,
    runSetupReadout,
    RUN_STAGES_MIN,
    RUN_STAGES_MAX,
    RUN_STAGES_STEP,
    RUN_WPS_OPTIONS,
} from '../../../js/modules/shop/shop-dom.js';
import { wavesPerStageRewardMultForWps } from '../../../js/modules/world/reward-dial.js';

describe('clampRunStages', () => {
    test('snaps to the 10-step grid and clamps to [10,100]', () => {
        expect(clampRunStages(10)).toBe(10);
        expect(clampRunStages(20)).toBe(20);
        expect(clampRunStages(100)).toBe(100);
        // Below min / above max clamp.
        expect(clampRunStages(0)).toBe(RUN_STAGES_MIN);
        expect(clampRunStages(5)).toBe(RUN_STAGES_MIN);
        expect(clampRunStages(999)).toBe(RUN_STAGES_MAX);
        // Off-grid rounds to nearest 10.
        expect(clampRunStages(23)).toBe(20);
        expect(clampRunStages(26)).toBe(30);
    });

    test('non-numeric → min', () => {
        expect(clampRunStages(undefined)).toBe(RUN_STAGES_MIN);
        expect(clampRunStages(NaN)).toBe(RUN_STAGES_MIN);
        expect(clampRunStages('x')).toBe(RUN_STAGES_MIN);
    });

    test('grid constants are sane', () => {
        expect(RUN_STAGES_MIN).toBe(10);
        expect(RUN_STAGES_MAX).toBe(100);
        expect(RUN_STAGES_STEP).toBe(10);
    });
});

describe('clampRunWps', () => {
    test('exact options pass through', () => {
        expect(clampRunWps(3)).toBe(3);
        expect(clampRunWps(6)).toBe(6);
        expect(clampRunWps(9)).toBe(9);
    });

    test('snaps to nearest of 3/6/9', () => {
        expect(clampRunWps(4)).toBe(3);
        expect(clampRunWps(5)).toBe(6);
        expect(clampRunWps(7)).toBe(6);
        expect(clampRunWps(8)).toBe(9);
        expect(clampRunWps(100)).toBe(9);
    });

    test('non-numeric → 3 (default)', () => {
        expect(clampRunWps(undefined)).toBe(3);
        expect(clampRunWps(NaN)).toBe(3);
    });

    test('RUN_WPS_OPTIONS is exactly [3,6,9]', () => {
        expect(RUN_WPS_OPTIONS).toEqual([3, 6, 9]);
    });
});

describe('clampRunConfig', () => {
    test('clamps both fields onto the valid grid', () => {
        expect(clampRunConfig({ stages: 23, wavesPerStage: 5 })).toEqual({ stages: 20, wavesPerStage: 6 });
        expect(clampRunConfig({ stages: 999, wavesPerStage: 7 })).toEqual({ stages: 100, wavesPerStage: 6 });
    });

    test('null / garbage → default-ish (10 × 3)', () => {
        expect(clampRunConfig(null)).toEqual({ stages: 10, wavesPerStage: 3 });
        expect(clampRunConfig({})).toEqual({ stages: 10, wavesPerStage: 3 });
    });
});

describe('runSetupReadout — total waves + reward multiplier', () => {
    test('(10,3) → 30 waves · ×1.0 (default run, dial inert)', () => {
        expect(runSetupReadout(10, 3)).toBe('30 waves · rewards ×1.0');
        expect(wavesPerStageRewardMultForWps(3)).toBe(1.0);
    });

    test('(50,6) → 300 waves · ×1.3', () => {
        expect(runSetupReadout(50, 6)).toBe('300 waves · rewards ×1.3');
        expect(wavesPerStageRewardMultForWps(6)).toBeCloseTo(1.3, 10);
    });

    test('(100,9) → 900 waves · ×1.6', () => {
        expect(runSetupReadout(100, 9)).toBe('900 waves · rewards ×1.6');
        expect(wavesPerStageRewardMultForWps(9)).toBeCloseTo(1.6, 10);
    });

    test('off-grid inputs are clamped before the readout is computed', () => {
        // 23 stages → 20; wps 5 → 6 → ×1.3 → 20 × 6 = 120 waves.
        expect(runSetupReadout(23, 5)).toBe('120 waves · rewards ×1.3');
    });
});
