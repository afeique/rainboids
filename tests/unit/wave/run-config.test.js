// RUN-01a — runConfig data model + run-aware wave-helper plumbing.
//
// These tests pin the behavior-preservation contract: the single-arg /
// default-param forms of every helper must equal today's 10 × 3 (= 30
// wave) campaign, and the new optional params (wavesPerStage / maxWaves)
// must reshape the math correctly when supplied.

import {
    DEFAULT_RUN_CONFIG,
    getRunConfig,
    getRunMode,
    runMaxWaves,
    runWavesPerStage,
    getStage,
    getSubWaveIndex,
    isStageClear,
    getStageLabel,
    MAX_WAVES,
    WAVES_PER_STAGE,
    MAX_STAGES,
} from '../../../js/modules/core/constants.js';
import {
    isBossWave,
    getEnemySpeedMultiplier,
    getEnemyLevel,
    getLevelScaledEnemyStats,
} from '../../../js/modules/wave/wave-data.js';

describe('DEFAULT_RUN_CONFIG', () => {
    test('is the canonical 10 × 3 = 30-wave campaign', () => {
        expect(DEFAULT_RUN_CONFIG.stages).toBe(MAX_STAGES);
        expect(DEFAULT_RUN_CONFIG.wavesPerStage).toBe(WAVES_PER_STAGE);
        expect(DEFAULT_RUN_CONFIG.stages).toBe(10);
        expect(DEFAULT_RUN_CONFIG.wavesPerStage).toBe(3);
        expect(DEFAULT_RUN_CONFIG.stages * DEFAULT_RUN_CONFIG.wavesPerStage).toBe(MAX_WAVES);
    });

    // DIR-03 — default mode is NORMAL (default-safe).
    test('default mode is NORMAL', () => {
        expect(DEFAULT_RUN_CONFIG.mode).toBe('NORMAL');
    });
});

describe('getRunConfig()', () => {
    test('returns the default when game is missing', () => {
        expect(getRunConfig()).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig(null)).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig(undefined)).toEqual(DEFAULT_RUN_CONFIG);
    });

    test('returns the default when runConfig is absent', () => {
        expect(getRunConfig({})).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({ runConfig: null })).toEqual(DEFAULT_RUN_CONFIG);
    });

    test('returns the default when runConfig is invalid (non-numeric / NaN / Infinity)', () => {
        // DIR-03 — these have no valid mode either, so they collapse to the
        // full default (now including mode: 'NORMAL').
        expect(getRunConfig({ runConfig: { stages: 'x', wavesPerStage: 3 } })).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({ runConfig: { stages: 10 } })).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({ runConfig: { stages: NaN, wavesPerStage: 3 } })).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({ runConfig: { stages: Infinity, wavesPerStage: 3 } })).toEqual(DEFAULT_RUN_CONFIG);
    });

    test('returns the configured value when present and valid', () => {
        // DIR-03 — a valid run shape with no mode resolves mode → NORMAL.
        expect(getRunConfig({ runConfig: { stages: 20, wavesPerStage: 6 } }))
            .toEqual({ stages: 20, wavesPerStage: 6, mode: 'NORMAL' });
    });

    test('clamps stages / wavesPerStage to >= 1', () => {
        expect(getRunConfig({ runConfig: { stages: 0, wavesPerStage: 0 } }))
            .toEqual({ stages: 1, wavesPerStage: 1, mode: 'NORMAL' });
        expect(getRunConfig({ runConfig: { stages: -5, wavesPerStage: -2 } }))
            .toEqual({ stages: 1, wavesPerStage: 1, mode: 'NORMAL' });
    });

    test('floors fractional values to integers', () => {
        expect(getRunConfig({ runConfig: { stages: 10.9, wavesPerStage: 3.7 } }))
            .toEqual({ stages: 10, wavesPerStage: 3, mode: 'NORMAL' });
    });
});

// ── DIR-03 — difficulty MODE on runConfig ─────────────────────────────────
describe('getRunConfig() — mode (DIR-03)', () => {
    test('mode is NORMAL when absent or runConfig is invalid', () => {
        expect(getRunConfig().mode).toBe('NORMAL');
        expect(getRunConfig({}).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3 } }).mode).toBe('NORMAL');
    });

    test('keeps a valid mode', () => {
        for (const m of ['EASY', 'NORMAL', 'HARD', 'EPIC', 'LEGENDARY']) {
            expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: m } }).mode).toBe(m);
        }
    });

    test('case-normalizes mode to upper', () => {
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'normal' } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'legendary' } }).mode).toBe('LEGENDARY');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'HaRd' } }).mode).toBe('HARD');
    });

    test('rejects a bogus mode → NORMAL', () => {
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'NIGHTMARE' } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: 42 } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: '' } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3, mode: null } }).mode).toBe('NORMAL');
    });

    test('a valid mode survives even when the run shape is invalid', () => {
        // Mode is resolved independently of stages/wavesPerStage: a valid mode
        // on a broken shape still yields the default shape + that mode.
        expect(getRunConfig({ runConfig: { stages: 'x', wavesPerStage: 3, mode: 'hard' } }))
            .toEqual({ ...DEFAULT_RUN_CONFIG, mode: 'HARD' });
    });
});

describe('getRunMode() (DIR-03)', () => {
    test('NORMAL fallback for missing / invalid', () => {
        expect(getRunMode()).toBe('NORMAL');
        expect(getRunMode(null)).toBe('NORMAL');
        expect(getRunMode({})).toBe('NORMAL');
        expect(getRunMode({ runConfig: { stages: 10, wavesPerStage: 3 } })).toBe('NORMAL');
        expect(getRunMode({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'BOGUS' } })).toBe('NORMAL');
    });

    test('returns the resolved (case-normalized) mode', () => {
        expect(getRunMode({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'EPIC' } })).toBe('EPIC');
        expect(getRunMode({ runConfig: { stages: 10, wavesPerStage: 3, mode: 'easy' } })).toBe('EASY');
    });
});

describe('runMaxWaves()', () => {
    test('default game / no runConfig => 30', () => {
        expect(runMaxWaves()).toBe(30);
        expect(runMaxWaves({})).toBe(30);
        expect(runMaxWaves(null)).toBe(MAX_WAVES);
    });

    test('= stages × wavesPerStage for configured runs', () => {
        expect(runMaxWaves({ runConfig: { stages: 20, wavesPerStage: 6 } })).toBe(120);
        expect(runMaxWaves({ runConfig: { stages: 100, wavesPerStage: 9 } })).toBe(900);
        expect(runMaxWaves({ runConfig: { stages: 5, wavesPerStage: 4 } })).toBe(20);
    });

    test('clamped config still yields a positive product', () => {
        expect(runMaxWaves({ runConfig: { stages: 0, wavesPerStage: 0 } })).toBe(1);
    });
});

describe('runWavesPerStage()', () => {
    test('default => 3', () => {
        expect(runWavesPerStage()).toBe(WAVES_PER_STAGE);
        expect(runWavesPerStage({})).toBe(3);
    });
    test('reads configured value', () => {
        expect(runWavesPerStage({ runConfig: { stages: 10, wavesPerStage: 6 } })).toBe(6);
    });
});

// ── Stage helpers — optional wavesPerStage param ──────────────────────────

describe('getStage() optional wavesPerStage', () => {
    test('single-arg form is identical to the pre-RUN-01a behavior (wps=3)', () => {
        expect(getStage(1)).toBe(1);
        expect(getStage(3)).toBe(1);
        expect(getStage(4)).toBe(2);
        expect(getStage(6)).toBe(2);
        expect(getStage(30)).toBe(10);
    });
    test('explicit wavesPerStage reshapes the stage map', () => {
        expect(getStage(6, 6)).toBe(1);   // 6-wave stages: wave 6 is still stage 1
        expect(getStage(7, 6)).toBe(2);
        expect(getStage(6, 3)).toBe(2);   // == single-arg default
    });
});

describe('getSubWaveIndex() optional wavesPerStage', () => {
    test('single-arg form unchanged (1..3)', () => {
        expect(getSubWaveIndex(1)).toBe(1);
        expect(getSubWaveIndex(3)).toBe(3);
        expect(getSubWaveIndex(4)).toBe(1);
        expect(getSubWaveIndex(6)).toBe(3);
    });
    test('explicit wavesPerStage widens the sub-wave range', () => {
        expect(getSubWaveIndex(6, 6)).toBe(6);
        expect(getSubWaveIndex(7, 6)).toBe(1);
    });
});

describe('isStageClear() optional wavesPerStage', () => {
    test('single-arg form unchanged (every 3rd wave)', () => {
        expect(isStageClear(3)).toBe(true);
        expect(isStageClear(6)).toBe(true);
        expect(isStageClear(30)).toBe(true);
        expect(isStageClear(1)).toBe(false);
        expect(isStageClear(4)).toBe(false);
        expect(isStageClear(0)).toBe(false);
    });
    test('explicit wavesPerStage moves the stage finals', () => {
        expect(isStageClear(6, 6)).toBe(true);
        expect(isStageClear(3, 6)).toBe(false);
        expect(isStageClear(12, 6)).toBe(true);
    });
});

describe('getStageLabel() optional wavesPerStage', () => {
    test('single-arg form unchanged', () => {
        expect(getStageLabel(1)).toBe('1-1');
        expect(getStageLabel(6)).toBe('2-3');
        expect(getStageLabel(30)).toBe('10-3');
    });
    test('explicit wavesPerStage relabels', () => {
        expect(getStageLabel(6, 6)).toBe('1-6');
        expect(getStageLabel(7, 6)).toBe('2-1');
    });
});

// ── isBossWave — optional wavesPerStage param ─────────────────────────────

describe('isBossWave() optional wavesPerStage', () => {
    test('single-arg form matches today [3,6,9,...,30] for waves 1..30', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            expect(isBossWave(w)).toBe(w % WAVES_PER_STAGE === 0);
        }
        expect(isBossWave(3)).toBe(true);
        expect(isBossWave(4)).toBe(false);
        expect(isBossWave(0)).toBe(false);
    });
    test('explicit wavesPerStage moves the boss waves', () => {
        expect(isBossWave(6, 6)).toBe(true);
        expect(isBossWave(3, 6)).toBe(false);
        expect(isBossWave(12, 6)).toBe(true);
    });
});

// ── Scaling formula — optional maxWaves param ─────────────────────────────

describe('scaling formulas — optional maxWaves param', () => {
    test('getEnemySpeedMultiplier default maxWaves == explicit MAX_WAVES', () => {
        for (const w of [1, 5, 10, 15, 30]) {
            expect(getEnemySpeedMultiplier(w)).toBeCloseTo(getEnemySpeedMultiplier(w, MAX_WAVES), 10);
        }
    });
    test('a larger maxWaves stretches the curve — same wave is gentler', () => {
        // At a fixed wave, a longer run normalizes to a smaller t, so the
        // multiplier is lower (curve stretched over more waves).
        expect(getEnemySpeedMultiplier(6, 120)).toBeLessThan(getEnemySpeedMultiplier(6, 30));
        // Endpoints still anchor: wave 1 is the floor regardless of length.
        expect(getEnemySpeedMultiplier(1, 30)).toBeCloseTo(getEnemySpeedMultiplier(1, 120), 10);
        // And the LAST wave of each run hits the same ceiling.
        expect(getEnemySpeedMultiplier(30, 30)).toBeCloseTo(getEnemySpeedMultiplier(120, 120), 10);
    });

    test('getEnemyLevel default maxWaves == explicit MAX_WAVES', () => {
        for (const w of [1, 8, 15, 30]) {
            expect(getEnemyLevel(w, 12)).toBe(getEnemyLevel(w, 12, MAX_WAVES));
        }
    });
    test('getEnemyLevel — a longer run keeps mid-run enemies closer to the early bias', () => {
        // wave 15 in a 30-run is mid-curve; wave 15 in a 120-run is still
        // very early, so its level should be <= the 30-run value.
        expect(getEnemyLevel(15, 20, 120)).toBeLessThanOrEqual(getEnemyLevel(15, 20, 30));
    });

    test('getLevelScaledEnemyStats default maxWaves == explicit MAX_WAVES', () => {
        const BASE = { health: 100, speed: 2, size: 20, shootRate: 1, points: 50 };
        for (const L of [1, 5, 15, 30]) {
            expect(getLevelScaledEnemyStats(BASE, L)).toEqual(getLevelScaledEnemyStats(BASE, L, MAX_WAVES));
        }
    });
    test('getLevelScaledEnemyStats — a larger maxWaves lowers the mid-curve HP', () => {
        const BASE = { health: 100, speed: 2, size: 20, shootRate: 1, points: 50 };
        expect(getLevelScaledEnemyStats(BASE, 10, 120).health)
            .toBeLessThan(getLevelScaledEnemyStats(BASE, 10, 30).health);
    });
});
