/**
 * tests/unit/enemy-hydra-split.test.js — Phase E8e Hydra split-on-death.
 *
 * Pure shouldSplit / splitChildSpec helpers + the HYDRA config. The actual
 * spawning routes through the S3 requestEnemySpawn (tested separately).
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
import { shouldSplit, splitChildSpec } from '../../js/modules/combat/combat-manager.js';
import { ENEMY_TYPES } from '../../js/modules/enemy/enemy-data.js';

const SD = { count: 2, maxGen: 1, healthMul: 0.5, sizeMul: 0.7 };

describe('E8e shouldSplit', () => {
    test('original (gen 0) under the cap splits', () => {
        expect(shouldSplit({ splitOnDeath: SD, splitGen: 0 })).toBe(true);
    });
    test('a ling at the gen cap does not re-split', () => {
        expect(shouldSplit({ splitOnDeath: SD, splitGen: 1 })).toBe(false);
    });
    test('no config / null → never', () => {
        expect(shouldSplit({ splitGen: 0 })).toBe(false);
        expect(shouldSplit(null)).toBe(false);
    });
});

describe('E8e splitChildSpec', () => {
    test('scales gen + health + radius from the parent', () => {
        const s = splitChildSpec(SD, 14, 44, 0);
        expect(s.gen).toBe(1);
        expect(s.health).toBe(7);     // round(14 × 0.5)
        expect(s.radius).toBeCloseTo(30.8); // 44 × 0.7
    });
    test('health floors at 1', () => {
        expect(splitChildSpec({ ...SD, healthMul: 0.01 }, 1, 10, 0).health).toBe(1);
    });
});

describe('HYDRA config', () => {
    test('is a KINETIC bruiser with a valid splitOnDeath', () => {
        const h = ENEMY_TYPES.HYDRA;
        expect(h.element).toBe('KINETIC');           // default (no element tag)
        expect(Object.keys(h.resist || {})).toHaveLength(0);
        expect(h.splitOnDeath).toBeTruthy();
        expect(h.splitOnDeath.count).toBeGreaterThan(0);
        expect(h.splitOnDeath.maxGen).toBe(1);        // lings don't re-split
        expect(h.splitOnDeath.healthMul).toBeLessThan(1);
        expect(h.splitOnDeath.sizeMul).toBeLessThan(1);
    });
});
