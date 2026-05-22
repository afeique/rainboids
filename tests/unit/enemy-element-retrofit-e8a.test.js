/**
 * tests/unit/enemy-element-retrofit-e8a.test.js — Phase E8a element/resist data.
 *
 * Pins the §7.1 retrofit: every enemy type carries a valid attack `element`
 * and a `resist` map whose keys are real elements, with the intended
 * weaknesses/resistances. This is the data fill that turns the elements
 * system live (E2 enemy resist, E5 player resist, E6 weapon status).
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
import { ENEMY_TYPES } from '../../js/modules/enemy/enemy-data.js';
import { ELEMENT_IDS, isElement } from '../../js/modules/combat/elements.js';

describe('E8a enemy element/resist retrofit', () => {
    test('every enemy type has a valid attack element', () => {
        for (const [key, def] of Object.entries(ENEMY_TYPES)) {
            expect(isElement(def.element)).toBe(true);
        }
    });

    test('every enemy resist map has only valid element keys + numeric values', () => {
        for (const [key, def] of Object.entries(ENEMY_TYPES)) {
            expect(def.resist && typeof def.resist === 'object').toBe(true);
            for (const [el, v] of Object.entries(def.resist)) {
                expect(ELEMENT_IDS).toContain(el);
                expect(typeof v).toBe('number');
                expect(v).toBeLessThanOrEqual(1); // 1 = immune cap
            }
        }
    });

    test('attack elements match the retrofit table', () => {
        expect(ENEMY_TYPES.STALKER.element).toBe('RADIANT');
        expect(ENEMY_TYPES.DRIFTER.element).toBe('VOLT');
        expect(ENEMY_TYPES.WEAVER.element).toBe('RADIANT');
        expect(ENEMY_TYPES.SENTINEL.element).toBe('RADIANT');
        expect(ENEMY_TYPES.TANGERINE.element).toBe('PYRO');
        expect(ENEMY_TYPES.HUNTER.element).toBe('KINETIC');
    });

    test('weaknesses (negative) and resistances (positive) are in place', () => {
        expect(ENEMY_TYPES.GUARDIAN.resist.VOLT).toBeLessThan(0);   // weak to Volt
        expect(ENEMY_TYPES.GUARDIAN.resist.KINETIC).toBeGreaterThan(0); // armored vs Kinetic
        expect(ENEMY_TYPES.WASP.resist.CRYO).toBeLessThan(0);       // freeze-shatters
        expect(ENEMY_TYPES.DRIFTER.resist.VOLT).toBeGreaterThan(0); // resists Volt
        expect(ENEMY_TYPES.DRIFTER.resist.TOXIC).toBeLessThan(0);   // weak to Toxic
        expect(ENEMY_TYPES.PROWLER.resist.PYRO).toBeLessThan(0);    // burns down
        expect(ENEMY_TYPES.TANGERINE.resist.PYRO).toBeGreaterThan(0); // fireproof bomber
    });

    test('TITAN is tanky across all elements', () => {
        for (const el of ELEMENT_IDS) {
            expect(ENEMY_TYPES.TITAN.resist[el]).toBeGreaterThan(0);
        }
    });

    test('HUNTER is the neutral baseline (empty resist map)', () => {
        expect(Object.keys(ENEMY_TYPES.HUNTER.resist)).toHaveLength(0);
    });
});
