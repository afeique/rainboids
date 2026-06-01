/**
 * tests/unit/wave/campaign-50.test.js — 9.11.0 FIXED 50-wave campaign.
 *
 * Validates the 10-block × 5-wave structure:
 *   block b (0..9), waves 5b+1 … 5b+5:
 *     wave 1,2 : normal   wave 3 : ELITE (isElite)
 *     wave 4   : COOLDOWN (isCooldown)   wave 5 : BOSS (isBossWave)
 * Bosses land on 5,10,…,50; stage = getStage(wave,5) = 1..10 → all 10 bosses
 * once each in stage order, with Prismarch (isFinalBoss) at wave 50. The run
 * length is pinned to 50 regardless of any runConfig override.
 */

// Browser shims — must precede any game-module import (getWaveConfig/isMobile
// touch window/navigator; wave-manager imports pull in the DOM-adjacent stack).
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 800,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { beforeAll, describe, expect, test } from '@jest/globals';
import { WAVE_DATA, isBossWave } from '../../../js/modules/wave/wave-data.js';
import {
    MAX_WAVES, WAVES_PER_STAGE, MAX_STAGES, BOSS_WAVES,
    getStage, runMaxWaves, runWavesPerStage,
} from '../../../js/modules/core/constants.js';
import { getBossForStage, BOSS_DESCRIPTORS } from '../../../js/modules/enemy/bosses/index.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

beforeAll(() => { _resetUrlOverrideForTests(false); });

describe('50-wave campaign — constants', () => {
    test('describe a 50-wave / 5-per-block / 10-block campaign', () => {
        expect(MAX_WAVES).toBe(50);
        expect(WAVES_PER_STAGE).toBe(5);
        expect(MAX_STAGES).toBe(10);
        expect(BOSS_WAVES).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    });
});

describe('50-wave campaign — WAVE_DATA structure', () => {
    test('has exactly 50 entries keyed 1..50', () => {
        expect(Object.keys(WAVE_DATA).length).toBe(50);
        for (let w = 1; w <= 50; w++) {
            expect(WAVE_DATA[w]).toBeDefined();
            expect(Array.isArray(WAVE_DATA[w].subWaves)).toBe(true);
            expect(WAVE_DATA[w].subWaves.length).toBeGreaterThan(0);
        }
    });

    test('isBossWave is true exactly on 5,10,…,50', () => {
        const found = [];
        for (let w = 1; w <= MAX_WAVES; w++) {
            if (isBossWave(w, WAVES_PER_STAGE)) found.push(w);
        }
        expect(found).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    });

    test('every boss-wave entry has isBossWave + a valid bossTier', () => {
        for (const w of BOSS_WAVES) {
            expect(WAVE_DATA[w].isBossWave).toBe(true);
            expect(WAVE_DATA[w].bossTier).toBeGreaterThanOrEqual(1);
            expect(WAVE_DATA[w].bossTier).toBeLessThanOrEqual(4);
        }
    });

    test('boss tiers escalate by block (1-2 T1, 3-5 T2, 6-8 T3, 9-10 T4)', () => {
        const expectedTier = (block /* 1..10 */) =>
            block <= 2 ? 1 : block <= 5 ? 2 : block <= 8 ? 3 : 4;
        for (let block = 1; block <= 10; block++) {
            const bossWave = block * 5;
            expect(WAVE_DATA[bossWave].bossTier).toBe(expectedTier(block));
        }
    });

    test('only wave 50 carries isFinalBoss', () => {
        for (const w of BOSS_WAVES) {
            expect(WAVE_DATA[w].isFinalBoss === true).toBe(w === 50);
        }
    });

    test("each block's wave-3 is an elite wave and wave-4 is a cooldown wave", () => {
        for (let b = 0; b < 10; b++) {
            expect(WAVE_DATA[5 * b + 3].isElite).toBe(true);
            expect(WAVE_DATA[5 * b + 4].isCooldown).toBe(true);
        }
    });

    test('each elite wave carries at least one elite-flagged spec', () => {
        for (let b = 0; b < 10; b++) {
            const specs = WAVE_DATA[5 * b + 3].subWaves.flat();
            expect(specs.some((s) => s.elite === true)).toBe(true);
        }
    });

    test('non-elite waves carry no elite-flagged specs', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            if (WAVE_DATA[w].isElite) continue;
            const specs = WAVE_DATA[w].subWaves.flat();
            expect(specs.some((s) => s.elite === true)).toBe(false);
        }
    });

    test('non-boss waves have no isBossWave flag', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            if (BOSS_WAVES.includes(w)) continue;
            expect(WAVE_DATA[w].isBossWave).toBeFalsy();
        }
    });

    test('every spec type is a known enemy type and counts are positive', async () => {
        const enemyMod = await import('../../../js/modules/enemy/enemy-data.js');
        // enemy-data.js exports the roster as ENEMY_TYPES (the campaign only
        // uses the 10 fully-defined types, all of which are keys here).
        const ENEMY_TYPES = enemyMod.ENEMY_TYPES ?? enemyMod.default;
        const known = new Set(Object.keys(ENEMY_TYPES));
        for (let w = 1; w <= MAX_WAVES; w++) {
            for (const spec of WAVE_DATA[w].subWaves.flat()) {
                expect(known.has(spec.type)).toBe(true);
                expect(spec.count).toBeGreaterThan(0);
            }
        }
    });
});

describe('50-wave campaign — boss mapping', () => {
    test('stage maps the 10 bosses once each in order; Prismarch is the wave-50 finale', () => {
        expect(BOSS_DESCRIPTORS.length).toBe(10);
        const seenIds = [];
        const stages = [];
        for (const w of BOSS_WAVES) {
            const stage = getStage(w, WAVES_PER_STAGE);
            stages.push(stage);
            const boss = getBossForStage(stage);
            expect(boss).toBeTruthy();
            seenIds.push(boss.id);
        }
        // Stages 1..10 in order across the 10 boss waves.
        expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        // All 10 bosses appear exactly once.
        expect(new Set(seenIds).size).toBe(10);
        // Wave 50 → stage 10 → the final boss.
        const finalBoss = getBossForStage(getStage(50, WAVES_PER_STAGE));
        expect(finalBoss.isFinalBoss).toBe(true);
        expect(finalBoss.id).toBe('PRISMARCH');
    });
});

describe('50-wave campaign — run is fixed at 50', () => {
    test('runMaxWaves is 50 by default and ignores a bogus override', () => {
        expect(runMaxWaves(undefined)).toBe(50);
        expect(runWavesPerStage(undefined)).toBe(5);
        // A stale/old save shape must NOT change the campaign length.
        expect(runMaxWaves({ runConfig: { stages: 3, wavesPerStage: 2 } })).toBe(50);
        expect(runMaxWaves({ runConfig: { stages: 100, wavesPerStage: 9 } })).toBe(50);
        expect(runWavesPerStage({ runConfig: { stages: 3, wavesPerStage: 2 } })).toBe(5);
    });
});

describe('50-wave campaign — elite spawn mechanic', () => {
    test('spawnLeveledEnemies promotes every elite-flagged member', async () => {
        const wm = await import('../../../js/modules/wave/wave-manager.js');
        // Elite tuning constants are exported for reuse/visibility.
        expect(wm.ELITE_LEVEL_BONUS).toBeGreaterThan(0);
        expect(wm.ELITE_HP_MUL).toBeGreaterThan(1);
        expect(wm.ELITE_SIZE_MUL).toBeGreaterThan(1);

        // Minimal engine stub: a pool that hands back plain enemy objects, plus
        // the few fields/methods spawnLeveledEnemies touches.
        const spawned = [];
        const makeEnemy = () => ({
            health: 100, maxHealth: 100, radius: 20, baseRadius: 20,
            config: { points: 100 }, isBoss: false, isMiniBoss: false,
            reset() {}, startWarpIn() {},
        });
        const ctx = {
            game: { currentWave: 3, enemyLevel: 4 },
            enemyPool: { get: () => { const e = makeEnemy(); spawned.push(e); return e; } },
            getRandomSpawnPosition: () => ({ x: 0, y: 0, targetX: 0, targetY: 0 }),
            applyEnemyLevelScaling() {},
            formationManager: null,
            gameField: { width: 1200, height: 800 },
        };

        wm.spawnLeveledEnemies.call(ctx, 'GUARDIAN', 2, { onScreen: true, elite: true });

        expect(spawned.length).toBe(2);
        for (const e of spawned) {
            expect(e.isMiniBoss).toBe(true);
            expect(e.isElite).toBe(true);
            expect(e.health).toBeCloseTo(100 * wm.ELITE_HP_MUL);
            expect(e.maxHealth).toBeCloseTo(100 * wm.ELITE_HP_MUL);
            expect(e.radius).toBeCloseTo(20 * wm.ELITE_SIZE_MUL);
            expect(e.config.points).toBe(100 * wm.ELITE_POINTS_MUL);
        }
        // The base enemy level is restored after the elite group.
        expect(ctx.game.enemyLevel).toBe(4);
    });

    test('non-elite spawns are not auto-promoted on a low wave', async () => {
        const wm = await import('../../../js/modules/wave/wave-manager.js');
        const spawned = [];
        const makeEnemy = () => ({
            health: 100, maxHealth: 100, radius: 20, baseRadius: 20,
            config: { points: 100 }, isBoss: false, isMiniBoss: false,
            reset() {}, startWarpIn() {},
        });
        const ctx = {
            game: { currentWave: 1, enemyLevel: 2 }, // wave < 4 → no random mini-boss
            enemyPool: { get: () => { const e = makeEnemy(); spawned.push(e); return e; } },
            getRandomSpawnPosition: () => ({ x: 0, y: 0, targetX: 0, targetY: 0 }),
            applyEnemyLevelScaling() {},
            formationManager: null,
            gameField: { width: 1200, height: 800 },
        };
        wm.spawnLeveledEnemies.call(ctx, 'HUNTER', 3, { onScreen: true });
        expect(spawned.length).toBe(3);
        for (const e of spawned) {
            expect(e.isMiniBoss).toBe(false);
            expect(e.isElite).toBeUndefined();
            expect(e.health).toBe(100);
            expect(e.config.points).toBe(100);
        }
        expect(ctx.game.enemyLevel).toBe(2);
    });
});
