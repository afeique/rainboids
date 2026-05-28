// 8.10.0 — runConfig data model (FLAT wave count) + boss-cadence helpers.
//
// Runs are a flat number of waves (10–100); the old "stages" grouping is gone.
// A boss spawns every BOSS_INTERVAL waves. These tests pin getRunConfig /
// runMaxWaves / runBossCount / getBossSegment / isBossWave / clampRunConfig and
// the legacy {stages, wavesPerStage} → maxWaves migration. The enemy-scaling
// formulas (still normalized over maxWaves) are exercised at the bottom.

import {
    DEFAULT_RUN_CONFIG,
    getRunConfig,
    getRunMode,
    runMaxWaves,
    runBossCount,
    getBossSegment,
    isBossWave,
    clampRunWaves,
    clampRunConfig,
    MAX_WAVES,
    BOSS_INTERVAL,
    RUN_WAVES_MIN,
    RUN_WAVES_MAX,
} from '../../../js/modules/core/constants.js';
import {
    getEnemySpeedMultiplier,
    getEnemyLevel,
    getLevelScaledEnemyStats,
} from '../../../js/modules/wave/wave-data.js';

describe('DEFAULT_RUN_CONFIG', () => {
    test('is the canonical 30-wave NORMAL campaign', () => {
        expect(DEFAULT_RUN_CONFIG.maxWaves).toBe(MAX_WAVES);
        expect(DEFAULT_RUN_CONFIG.maxWaves).toBe(30);
        expect(DEFAULT_RUN_CONFIG.mode).toBe('NORMAL');
    });
});

describe('getRunConfig()', () => {
    test('returns the default when game / runConfig is missing', () => {
        expect(getRunConfig()).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig(null)).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({})).toEqual(DEFAULT_RUN_CONFIG);
        expect(getRunConfig({ runConfig: null })).toEqual(DEFAULT_RUN_CONFIG);
    });

    test('reads a valid flat maxWaves (mode → NORMAL when absent)', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 50 } })).toEqual({ maxWaves: 50, mode: 'NORMAL' });
    });

    test('clamps maxWaves to >= 1 and floors fractionals', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 0 } }).maxWaves).toBe(1);
        expect(getRunConfig({ runConfig: { maxWaves: -5 } }).maxWaves).toBe(1);
        expect(getRunConfig({ runConfig: { maxWaves: 50.9 } }).maxWaves).toBe(50);
    });

    test('falls back to the default maxWaves for non-numeric / NaN / Infinity', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 'x' } }).maxWaves).toBe(MAX_WAVES);
        expect(getRunConfig({ runConfig: { maxWaves: NaN } }).maxWaves).toBe(MAX_WAVES);
        expect(getRunConfig({ runConfig: { maxWaves: Infinity } }).maxWaves).toBe(MAX_WAVES);
    });

    test('migrates a legacy {stages, wavesPerStage} runConfig → flat maxWaves', () => {
        expect(getRunConfig({ runConfig: { stages: 10, wavesPerStage: 3 } }).maxWaves).toBe(30);
        expect(getRunConfig({ runConfig: { stages: 20, wavesPerStage: 6 } }).maxWaves).toBe(120);
    });
});

describe('getRunConfig() — mode', () => {
    test('mode is NORMAL when absent', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 30 } }).mode).toBe('NORMAL');
    });
    test('keeps + case-normalizes a valid mode', () => {
        for (const m of ['EASY', 'NORMAL', 'HARD', 'EPIC', 'LEGENDARY']) {
            expect(getRunConfig({ runConfig: { maxWaves: 30, mode: m } }).mode).toBe(m);
        }
        expect(getRunConfig({ runConfig: { maxWaves: 30, mode: 'legendary' } }).mode).toBe('LEGENDARY');
        expect(getRunConfig({ runConfig: { maxWaves: 30, mode: 'HaRd' } }).mode).toBe('HARD');
    });
    test('rejects a bogus mode → NORMAL', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 30, mode: 'NIGHTMARE' } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { maxWaves: 30, mode: 42 } }).mode).toBe('NORMAL');
        expect(getRunConfig({ runConfig: { maxWaves: 30, mode: '' } }).mode).toBe('NORMAL');
    });
    test('a valid mode survives an invalid wave count', () => {
        expect(getRunConfig({ runConfig: { maxWaves: 'x', mode: 'hard' } }))
            .toEqual({ maxWaves: MAX_WAVES, mode: 'HARD' });
    });
});

describe('getRunMode()', () => {
    test('NORMAL fallback for missing / invalid', () => {
        expect(getRunMode()).toBe('NORMAL');
        expect(getRunMode(null)).toBe('NORMAL');
        expect(getRunMode({})).toBe('NORMAL');
        expect(getRunMode({ runConfig: { maxWaves: 30, mode: 'BOGUS' } })).toBe('NORMAL');
    });
    test('returns the resolved (case-normalized) mode', () => {
        expect(getRunMode({ runConfig: { maxWaves: 30, mode: 'EPIC' } })).toBe('EPIC');
        expect(getRunMode({ runConfig: { maxWaves: 30, mode: 'easy' } })).toBe('EASY');
    });
});

describe('runMaxWaves()', () => {
    test('default => 30', () => {
        expect(runMaxWaves()).toBe(30);
        expect(runMaxWaves({})).toBe(30);
        expect(runMaxWaves(null)).toBe(MAX_WAVES);
    });
    test('reads the configured flat count', () => {
        expect(runMaxWaves({ runConfig: { maxWaves: 100 } })).toBe(100);
        expect(runMaxWaves({ runConfig: { maxWaves: 50 } })).toBe(50);
    });
    test('migrates a legacy shape', () => {
        expect(runMaxWaves({ runConfig: { stages: 20, wavesPerStage: 6 } })).toBe(120);
    });
});

// ── Boss cadence (flat waves) ─────────────────────────────────────────────

describe('runBossCount() / getBossSegment() / isBossWave()', () => {
    test('one boss per BOSS_INTERVAL (=10) waves', () => {
        expect(BOSS_INTERVAL).toBe(10);
        expect(runBossCount({ runConfig: { maxWaves: 100 } })).toBe(10);
        expect(runBossCount({ runConfig: { maxWaves: 30 } })).toBe(3);
        expect(runBossCount({ runConfig: { maxWaves: 10 } })).toBe(1);
    });
    test('getBossSegment maps a wave to its 1-based boss segment', () => {
        expect(getBossSegment(1)).toBe(1);
        expect(getBossSegment(10)).toBe(1);
        expect(getBossSegment(11)).toBe(2);
        expect(getBossSegment(20)).toBe(2);
        expect(getBossSegment(100)).toBe(10);
    });
    test('isBossWave is every 10th wave', () => {
        expect(isBossWave(10)).toBe(true);
        expect(isBossWave(20)).toBe(true);
        expect(isBossWave(100)).toBe(true);
        expect(isBossWave(9)).toBe(false);
        expect(isBossWave(15)).toBe(false);
        expect(isBossWave(0)).toBe(false);
    });
});

describe('clampRunWaves() / clampRunConfig()', () => {
    test('snaps to the 10-step grid in [10,100]', () => {
        expect(clampRunWaves(10)).toBe(10);
        expect(clampRunWaves(100)).toBe(100);
        expect(clampRunWaves(0)).toBe(RUN_WAVES_MIN);
        expect(clampRunWaves(5)).toBe(RUN_WAVES_MIN);
        expect(clampRunWaves(999)).toBe(RUN_WAVES_MAX);
        expect(clampRunWaves(23)).toBe(20);
        expect(clampRunWaves(26)).toBe(30);
        expect(clampRunWaves(NaN)).toBe(MAX_WAVES); // default → 30 (already on-grid)
    });
    test('clampRunConfig returns {maxWaves, mode} + migrates legacy shapes', () => {
        expect(clampRunConfig({ maxWaves: 50, mode: 'hard' })).toEqual({ maxWaves: 50, mode: 'HARD' });
        expect(clampRunConfig({ stages: 10, wavesPerStage: 3 })).toEqual({ maxWaves: 30, mode: 'NORMAL' });
        // 20 × 6 = 120 → clampRunConfig clamps to the 100-wave max.
        expect(clampRunConfig({ stages: 20, wavesPerStage: 6 })).toEqual({ maxWaves: 100, mode: 'NORMAL' });
        expect(clampRunConfig(null)).toEqual({ maxWaves: MAX_WAVES, mode: 'NORMAL' });
    });
});

// ── Scaling formula — optional maxWaves param (unchanged by 8.10.0) ────────

describe('scaling formulas — optional maxWaves param', () => {
    test('getEnemySpeedMultiplier default maxWaves == explicit MAX_WAVES', () => {
        for (const w of [1, 5, 10, 15, 30]) {
            expect(getEnemySpeedMultiplier(w)).toBeCloseTo(getEnemySpeedMultiplier(w, MAX_WAVES), 10);
        }
    });
    test('a larger maxWaves stretches the curve — same wave is gentler', () => {
        expect(getEnemySpeedMultiplier(6, 120)).toBeLessThan(getEnemySpeedMultiplier(6, 30));
        expect(getEnemySpeedMultiplier(1, 30)).toBeCloseTo(getEnemySpeedMultiplier(1, 120), 10);
        expect(getEnemySpeedMultiplier(30, 30)).toBeCloseTo(getEnemySpeedMultiplier(120, 120), 10);
    });

    test('getEnemyLevel default maxWaves == explicit MAX_WAVES', () => {
        for (const w of [1, 8, 15, 30]) {
            expect(getEnemyLevel(w, 12)).toBe(getEnemyLevel(w, 12, MAX_WAVES));
        }
    });
    test('getEnemyLevel — a longer run keeps mid-run enemies closer to the early bias', () => {
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
