/**
 * tests/unit/enemy-types-e8b.test.js — Phase E8b new enemy types (Pyro/Cryo).
 *
 * Pins that CINDER + GLACIER are well-formed and SAFE: valid element/resist,
 * a render shape that exists in SHAPE_DRAW_MAP, and movement/firing patterns
 * that some existing enemy already uses (so the dispatch is guaranteed to
 * handle them — they reuse known-good patterns, no new dispatch code).
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

const NEW_TYPES = ['CINDER', 'GLACIER', 'FROST_LANCE', 'ASHEN_DETONATOR'];

// Set of (movePattern, shootPattern, shape) used by the PRE-EXISTING roster, so
// we can assert the new types only reuse already-handled patterns/shapes.
const existingMove = new Set();
const existingShoot = new Set();
for (const [key, def] of Object.entries(ENEMY_TYPES)) {
    if (NEW_TYPES.includes(key)) continue;
    existingMove.add(def.movePattern);
    existingShoot.add(def.shootPattern);
}

describe('E8b new enemy types', () => {
    test('CINDER + GLACIER exist with the required shape', () => {
        for (const key of NEW_TYPES) {
            const d = ENEMY_TYPES[key];
            expect(d).toBeTruthy();
            for (const f of ['health', 'speed', 'size', 'points', 'movePattern', 'shootPattern', 'movement', 'firing', 'visual', 'ai']) {
                expect(d[f]).toBeDefined();
            }
        }
    });

    test('each reuses a known-good render shape (in SHAPE_DRAW_MAP)', () => {
        for (const key of NEW_TYPES) {
            expect(SHAPE_DRAW_MAP[ENEMY_TYPES[key].visual.shape]).toBeDefined();
        }
    });

    test('each reuses movement + firing patterns the existing roster already uses', () => {
        for (const key of NEW_TYPES) {
            expect(existingMove.has(ENEMY_TYPES[key].movePattern)).toBe(true);
            expect(existingShoot.has(ENEMY_TYPES[key].shootPattern)).toBe(true);
        }
    });

    test('elements + resist profiles: Cinder = fire (fireproof, Cryo-weak), Glacier = ice (cryo-tough, Pyro-weak)', () => {
        expect(ENEMY_TYPES.CINDER.element).toBe('PYRO');
        expect(ENEMY_TYPES.CINDER.resist.PYRO).toBeGreaterThan(0);
        expect(ENEMY_TYPES.CINDER.resist.CRYO).toBeLessThan(0);
        expect(ENEMY_TYPES.GLACIER.element).toBe('CRYO');
        expect(ENEMY_TYPES.GLACIER.resist.CRYO).toBeGreaterThan(0);
        expect(ENEMY_TYPES.GLACIER.resist.PYRO).toBeLessThan(0);
        for (const key of NEW_TYPES) {
            expect(isElement(ENEMY_TYPES[key].element)).toBe(true);
            for (const el of Object.keys(ENEMY_TYPES[key].resist)) {
                expect(ELEMENT_IDS).toContain(el);
            }
        }
    });

    test('Frost Lance is Cryo sniper; Ashen Detonator is Pyro with a death flare', () => {
        expect(ENEMY_TYPES.FROST_LANCE.element).toBe('CRYO');
        expect(ENEMY_TYPES.FROST_LANCE.resist.CRYO).toBeGreaterThan(0);
        expect(ENEMY_TYPES.ASHEN_DETONATOR.element).toBe('PYRO');
        expect(ENEMY_TYPES.ASHEN_DETONATOR.resist.CRYO).toBeLessThan(0); // freeze it
        // Ashen's signature: a death-flare config (radius + damage).
        const fl = ENEMY_TYPES.ASHEN_DETONATOR.deathFlare;
        expect(fl).toBeTruthy();
        expect(fl.radius).toBeGreaterThan(0);
        expect(fl.damage).toBeGreaterThan(0);
    });
});
