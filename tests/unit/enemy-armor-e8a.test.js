/**
 * tests/unit/enemy-armor-e8a.test.js — Phase E8a GUARDIAN flat-armor floor.
 *
 * Armor subtracts a fixed amount per hit (down to a 25% floor), so chip damage
 * is wasted while big hits punch through; CORRODE (applied before armor)
 * overcomes it. Exercised through the applyDamageToEnemy consolidator.
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';

const CTX = {};
function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {}, armor: 0,
        corrodeStacks: 0, corrodeUntil: 0, conductUntil: 0, ...extra,
    };
}
beforeEach(() => { frameClock.now = 10000; });

describe('E8a GUARDIAN armor floor', () => {
    test('armor subtracts a flat amount from a normal hit', () => {
        const e = mkEnemy({ armor: 1.0 });
        applyDamageToEnemy.call(CTX, e, 3, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(100 - (3 - 1.0)); // 98
    });

    test('chip damage is reduced to the 25% floor (not nullified)', () => {
        const e = mkEnemy({ armor: 1.0 });
        applyDamageToEnemy.call(CTX, e, 0.4, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(100 - 0.4 * 0.25); // floor: 0.1 through
    });

    test('no armor → full damage', () => {
        const e = mkEnemy({ armor: 0 });
        applyDamageToEnemy.call(CTX, e, 3, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(97);
    });

    test('CORRODE amplifies before armor → overcomes it ("melts to Corrode")', () => {
        const e = mkEnemy({ armor: 1.0, corrodeStacks: 3, corrodeUntil: 20000 });
        // 3 × (1 + 0.15×3 = 1.45) = 4.35, then − armor 1.0 = 3.35
        applyDamageToEnemy.call(CTX, e, 3, { element: 'KINETIC', showNumber: false });
        expect(e.health).toBeCloseTo(100 - 3.35);
    });
});
