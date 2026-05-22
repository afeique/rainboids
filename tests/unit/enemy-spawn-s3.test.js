/**
 * tests/unit/enemy-spawn-s3.test.js — Phase A.E9-S3 mid-fight enemy spawning.
 *
 * The concurrent-cap gate (pure) + requestEnemySpawn against a mock engine
 * (spawns under cap, null at cap, threads reset args + warpTo + onSpawn).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { canSpawn, requestEnemySpawn, ENEMY_SPAWN_CAP } from '../../js/modules/wave/wave-manager.js';

function mkEngine(activeCount) {
    const enemy = {
        x: 0, y: 0,
        reset(...a) { this.resetArgs = a; },
        startWarpIn(x, y) { this.warp = { x, y }; },
    };
    return {
        _enemy: enemy,
        enemyPool: { activeObjects: new Array(activeCount).fill(0), get: () => enemy },
        game: { enemyLevel: 3 },
    };
}

describe('A.E9-S3 canSpawn', () => {
    test('true under the cap, false at/over it', () => {
        expect(canSpawn(0, 40)).toBe(true);
        expect(canSpawn(39, 40)).toBe(true);
        expect(canSpawn(40, 40)).toBe(false);
        expect(canSpawn(41, 40)).toBe(false);
    });
    test('defaults to ENEMY_SPAWN_CAP', () => {
        expect(canSpawn(ENEMY_SPAWN_CAP - 1)).toBe(true);
        expect(canSpawn(ENEMY_SPAWN_CAP)).toBe(false);
    });
});

describe('A.E9-S3 requestEnemySpawn', () => {
    test('spawns at (x,y) under the cap; threads reset(x,y,type,level,engine)', () => {
        const eng = mkEngine(5);
        const e = requestEnemySpawn.call(eng, 'HYDRA', 100, 200);
        expect(e).toBe(eng._enemy);
        expect(e.resetArgs).toEqual([100, 200, 'HYDRA', 3, eng]);
        expect(e.x).toBe(100);
        expect(e.y).toBe(200);
    });

    test('returns null at the concurrent cap', () => {
        const eng = mkEngine(ENEMY_SPAWN_CAP);
        expect(requestEnemySpawn.call(eng, 'HYDRA', 0, 0)).toBe(null);
    });

    test('respects an opts.cap override', () => {
        const eng = mkEngine(5);
        expect(requestEnemySpawn.call(eng, 'X', 0, 0, { cap: 5 })).toBe(null);
    });

    test('warpTo plays the warp-in; onSpawn gets the fresh enemy', () => {
        const eng = mkEngine(0);
        let got = null;
        const e = requestEnemySpawn.call(eng, 'X', 1, 2, { warpTo: { x: 9, y: 9 }, onSpawn: (en) => { got = en; } });
        expect(e.warp).toEqual({ x: 9, y: 9 });
        expect(got).toBe(e);
    });
});
