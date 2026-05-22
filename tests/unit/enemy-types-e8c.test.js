/**
 * tests/unit/enemy-types-e8c.test.js — Phase E8c new enemy types (Volt/Toxic).
 *
 * Tesla Wraith (Volt skirmisher) + Plaguebearer (Toxic mine-layer). Asserts
 * they're well-formed and SAFE (valid element/resist, render shape in
 * SHAPE_DRAW_MAP, and movement/firing patterns the existing roster already
 * uses — reuse-only, no new dispatch).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}

import { describe, expect, test } from '@jest/globals';
import { ENEMY_TYPES, SHAPE_DRAW_MAP } from '../../js/modules/enemy/enemy-data.js';
import { isElement, ELEMENT_IDS } from '../../js/modules/combat/elements.js';

const NEW_TYPES = ['TESLA_WRAITH', 'PLAGUEBEARER'];

// Patterns used by the rest of the roster (so we can assert reuse-only).
const okMove = new Set();
const okShoot = new Set();
for (const [key, def] of Object.entries(ENEMY_TYPES)) {
    if (NEW_TYPES.includes(key)) continue;
    okMove.add(def.movePattern);
    okShoot.add(def.shootPattern);
}

describe('E8c new enemy types (Volt/Toxic)', () => {
    test('both exist, well-formed, reuse a known shape + known patterns', () => {
        for (const key of NEW_TYPES) {
            const d = ENEMY_TYPES[key];
            expect(d).toBeTruthy();
            for (const f of ['health', 'speed', 'size', 'points', 'movement', 'firing', 'visual', 'ai']) {
                expect(d[f]).toBeDefined();
            }
            expect(SHAPE_DRAW_MAP[d.visual.shape]).toBeDefined();
            expect(okMove.has(d.movePattern)).toBe(true);
            expect(okShoot.has(d.shootPattern)).toBe(true);
            expect(isElement(d.element)).toBe(true);
            for (const el of Object.keys(d.resist)) expect(ELEMENT_IDS).toContain(el);
        }
    });

    test('Tesla Wraith = Volt (near volt-immune, Toxic-weak)', () => {
        expect(ENEMY_TYPES.TESLA_WRAITH.element).toBe('VOLT');
        expect(ENEMY_TYPES.TESLA_WRAITH.resist.VOLT).toBeGreaterThan(0);
        expect(ENEMY_TYPES.TESLA_WRAITH.resist.TOXIC).toBeLessThan(0);
    });

    test('Plaguebearer = Toxic mine-layer (toxic-tough, Radiant-weak)', () => {
        expect(ENEMY_TYPES.PLAGUEBEARER.element).toBe('TOXIC');
        expect(ENEMY_TYPES.PLAGUEBEARER.shootPattern).toBe('lay_mine'); // real area-denial via the mine system
        expect(ENEMY_TYPES.PLAGUEBEARER.resist.TOXIC).toBeGreaterThan(0);
        expect(ENEMY_TYPES.PLAGUEBEARER.resist.RADIANT).toBeLessThan(0);
    });
});
