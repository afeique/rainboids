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
    clampRunMode,
    isModeUnlocked,
    runSetupReadout,
    RUN_STAGES_MIN,
    RUN_STAGES_MAX,
    RUN_STAGES_STEP,
    RUN_WPS_OPTIONS,
} from '../../../js/modules/shop/shop-dom.js';
import { wavesPerStageRewardMultForWps } from '../../../js/modules/world/reward-dial.js';
import { modeReward } from '../../../js/modules/wave/difficulty-constants.js';

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
    test('clamps both fields onto the valid grid (default mode NORMAL)', () => {
        expect(clampRunConfig({ stages: 23, wavesPerStage: 5 })).toEqual({ stages: 20, wavesPerStage: 6, mode: 'NORMAL' });
        expect(clampRunConfig({ stages: 999, wavesPerStage: 7 })).toEqual({ stages: 100, wavesPerStage: 6, mode: 'NORMAL' });
    });

    test('null / garbage → default-ish (10 × 3, NORMAL)', () => {
        expect(clampRunConfig(null)).toEqual({ stages: 10, wavesPerStage: 3, mode: 'NORMAL' });
        expect(clampRunConfig({})).toEqual({ stages: 10, wavesPerStage: 3, mode: 'NORMAL' });
    });

    // DIR-09 — clampRunConfig carries + validates the difficulty mode.
    test('carries a valid mode (case-normalized to upper)', () => {
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3, mode: 'HARD' }).mode).toBe('HARD');
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3, mode: 'epic' }).mode).toBe('EPIC');
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3, mode: 'Legendary' }).mode).toBe('LEGENDARY');
    });

    test('invalid / absent mode → NORMAL', () => {
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3, mode: 'NIGHTMARE' }).mode).toBe('NORMAL');
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3, mode: 42 }).mode).toBe('NORMAL');
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3 }).mode).toBe('NORMAL');
    });
});

describe('clampRunMode', () => {
    test('valid members pass through (upper-cased)', () => {
        expect(clampRunMode('EASY')).toBe('EASY');
        expect(clampRunMode('hard')).toBe('HARD');
        expect(clampRunMode('Legendary')).toBe('LEGENDARY');
    });
    test('invalid / non-string → NORMAL', () => {
        expect(clampRunMode('BOGUS')).toBe('NORMAL');
        expect(clampRunMode(undefined)).toBe('NORMAL');
        expect(clampRunMode(null)).toBe('NORMAL');
        expect(clampRunMode(7)).toBe('NORMAL');
    });
});

describe('isModeUnlocked — §14.7 gating', () => {
    test('EASY / NORMAL / HARD are always unlocked (any meta)', () => {
        for (const max of [undefined, null, 'EASY', 'NORMAL', 'HARD', 'EPIC', 'LEGENDARY']) {
            expect(isModeUnlocked('EASY', max)).toBe(true);
            expect(isModeUnlocked('NORMAL', max)).toBe(true);
            expect(isModeUnlocked('HARD', max)).toBe(true);
        }
    });

    test('default / absent meta → EPIC + LEGENDARY locked', () => {
        for (const max of [undefined, null, '', 'GARBAGE']) {
            expect(isModeUnlocked('EPIC', max)).toBe(false);
            expect(isModeUnlocked('LEGENDARY', max)).toBe(false);
        }
    });

    test('EPIC unlocks once HARD has been cleared', () => {
        expect(isModeUnlocked('EPIC', 'EASY')).toBe(false);
        expect(isModeUnlocked('EPIC', 'NORMAL')).toBe(false);
        expect(isModeUnlocked('EPIC', 'HARD')).toBe(true);
        expect(isModeUnlocked('EPIC', 'EPIC')).toBe(true);
        expect(isModeUnlocked('EPIC', 'LEGENDARY')).toBe(true);
        // Case-insensitive on the stored value.
        expect(isModeUnlocked('EPIC', 'hard')).toBe(true);
    });

    test('LEGENDARY unlocks once EPIC has been cleared', () => {
        expect(isModeUnlocked('LEGENDARY', 'HARD')).toBe(false);
        expect(isModeUnlocked('LEGENDARY', 'EPIC')).toBe(true);
        expect(isModeUnlocked('LEGENDARY', 'LEGENDARY')).toBe(true);
    });

    test('passed mode is normalized (lowercase / odd case)', () => {
        expect(isModeUnlocked('epic', 'HARD')).toBe(true);
        expect(isModeUnlocked('legendary', 'EPIC')).toBe(true);
        expect(isModeUnlocked('epic', 'NORMAL')).toBe(false);
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

    // DIR-09 — passing a mode adds "· MODE · rewards ×W ×M" (M = per-mode reward).
    test('with a mode → shows mode + its per-mode reward multiplier', () => {
        expect(runSetupReadout(10, 3, 'NORMAL')).toBe(`30 waves · NORMAL · rewards ×1.0 ×${modeReward('NORMAL').toFixed(1)}`);
        expect(runSetupReadout(50, 6, 'HARD')).toBe(`300 waves · HARD · rewards ×1.3 ×${modeReward('HARD').toFixed(1)}`);
        expect(runSetupReadout(100, 9, 'LEGENDARY')).toBe(`900 waves · LEGENDARY · rewards ×1.6 ×${modeReward('LEGENDARY').toFixed(1)}`);
    });

    test('an invalid mode in the readout falls back to NORMAL', () => {
        expect(runSetupReadout(10, 3, 'BOGUS')).toBe(`30 waves · NORMAL · rewards ×1.0 ×${modeReward('NORMAL').toFixed(1)}`);
    });
});
