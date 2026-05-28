// 8.10.0 — RUN SETUP pure helpers. Runs are a flat wave count (10–100) now, so
// the pre-run control is a single waves slider. Pins the clamp grid, the mode
// resolver/gating, and the live readout ("N waves · MODE · rewards ×M") that the
// BUILD footer renders. The clamps live in core/constants and are re-exported
// from shop-dom; this guards both the UI + the shared engine path.
import { describe, expect, test } from '@jest/globals';
import {
    clampRunWaves,
    clampRunConfig,
    clampRunMode,
    isModeUnlocked,
    runSetupReadout,
    RUN_WAVES_MIN,
    RUN_WAVES_MAX,
    RUN_WAVES_STEP,
} from '../../../js/modules/shop/shop-dom.js';
import { modeReward } from '../../../js/modules/wave/difficulty-constants.js';

describe('clampRunWaves', () => {
    test('snaps to the 10-step grid and clamps to [10,100]', () => {
        expect(clampRunWaves(10)).toBe(10);
        expect(clampRunWaves(20)).toBe(20);
        expect(clampRunWaves(100)).toBe(100);
        expect(clampRunWaves(0)).toBe(RUN_WAVES_MIN);
        expect(clampRunWaves(5)).toBe(RUN_WAVES_MIN);
        expect(clampRunWaves(999)).toBe(RUN_WAVES_MAX);
        expect(clampRunWaves(23)).toBe(20);
        expect(clampRunWaves(26)).toBe(30);
    });

    test('non-numeric → the default (30, already on-grid)', () => {
        expect(clampRunWaves(undefined)).toBe(30);
        expect(clampRunWaves(NaN)).toBe(30);
        expect(clampRunWaves('x')).toBe(30);
    });

    test('grid constants are sane', () => {
        expect(RUN_WAVES_MIN).toBe(10);
        expect(RUN_WAVES_MAX).toBe(100);
        expect(RUN_WAVES_STEP).toBe(10);
    });
});

describe('clampRunConfig', () => {
    test('returns { maxWaves, mode } on the valid grid', () => {
        expect(clampRunConfig({ maxWaves: 23, mode: 'NORMAL' })).toEqual({ maxWaves: 20, mode: 'NORMAL' });
        expect(clampRunConfig({ maxWaves: 999 })).toEqual({ maxWaves: 100, mode: 'NORMAL' });
    });

    test('null / garbage → default (30 waves, NORMAL)', () => {
        expect(clampRunConfig(null)).toEqual({ maxWaves: 30, mode: 'NORMAL' });
        expect(clampRunConfig({})).toEqual({ maxWaves: 30, mode: 'NORMAL' });
    });

    test('migrates a legacy { stages, wavesPerStage } shape', () => {
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3 })).toEqual({ maxWaves: 30, mode: 'NORMAL' });
        // 20 × 6 = 120 → clamped to the 100-wave max.
        expect(clampRunConfig({ stages: 20, wavesPerStage: 6 })).toEqual({ maxWaves: 100, mode: 'NORMAL' });
    });

    test('carries + validates the difficulty mode', () => {
        expect(clampRunConfig({ maxWaves: 30, mode: 'epic' }).mode).toBe('EPIC');
        expect(clampRunConfig({ maxWaves: 30, mode: 'NIGHTMARE' }).mode).toBe('NORMAL');
        expect(clampRunConfig({ maxWaves: 30 }).mode).toBe('NORMAL');
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
        expect(isModeUnlocked('EPIC', 'NORMAL')).toBe(false);
        expect(isModeUnlocked('EPIC', 'HARD')).toBe(true);
        expect(isModeUnlocked('EPIC', 'hard')).toBe(true);
    });

    test('LEGENDARY unlocks once EPIC has been cleared', () => {
        expect(isModeUnlocked('LEGENDARY', 'HARD')).toBe(false);
        expect(isModeUnlocked('LEGENDARY', 'EPIC')).toBe(true);
    });

    test('passed mode is normalized (lowercase / odd case)', () => {
        expect(isModeUnlocked('epic', 'HARD')).toBe(true);
        expect(isModeUnlocked('epic', 'NORMAL')).toBe(false);
    });
});

describe('runSetupReadout — wave count + mode + reward multiplier', () => {
    test('NORMAL run → "N waves · NORMAL · rewards ×1.0"', () => {
        expect(runSetupReadout(30, 'NORMAL')).toBe(`30 waves · NORMAL · rewards ×${modeReward('NORMAL').toFixed(1)}`);
        expect(runSetupReadout(100, 'NORMAL')).toBe(`100 waves · NORMAL · rewards ×${modeReward('NORMAL').toFixed(1)}`);
    });

    test('mode shows its per-mode reward multiplier', () => {
        expect(runSetupReadout(50, 'HARD')).toBe(`50 waves · HARD · rewards ×${modeReward('HARD').toFixed(1)}`);
        expect(runSetupReadout(100, 'LEGENDARY')).toBe(`100 waves · LEGENDARY · rewards ×${modeReward('LEGENDARY').toFixed(1)}`);
    });

    test('off-grid wave counts are clamped before the readout', () => {
        expect(runSetupReadout(23, 'NORMAL')).toBe(`20 waves · NORMAL · rewards ×${modeReward('NORMAL').toFixed(1)}`);
    });

    test('an invalid mode falls back to NORMAL', () => {
        expect(runSetupReadout(30, 'BOGUS')).toBe(`30 waves · NORMAL · rewards ×${modeReward('NORMAL').toFixed(1)}`);
    });
});
