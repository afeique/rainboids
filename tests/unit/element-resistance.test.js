/**
 * tests/unit/element-resistance.test.js — Phase E2 player→enemy resistance.
 *
 * Pins that `applyDamageToEnemy` scales incoming damage by the target's
 * per-element resistance map. Uses a minimal stub `this` (no createDamageNumber,
 * no player, no game) so only the damage-math path runs.
 */

// Browser shims — collision-system pulls in platform-detect / utils which
// touch window/navigator at import time.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
        devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';

const CTX = {}; // minimal: no createDamageNumber / player / game → pure math path

function mkEnemy(extra = {}) {
    return { active: true, health: 100, maxHealth: 100, resist: {}, ...extra };
}

describe('applyDamageToEnemy — elemental resistance (E2)', () => {
    test('neutral resist applies full damage', () => {
        const e = mkEnemy();
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(90);
    });

    test('positive resist reduces damage (0.5 → half)', () => {
        const e = mkEnemy({ resist: { PYRO: 0.5 } });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(95);
    });

    test('immune (resist 1) takes zero damage', () => {
        const e = mkEnemy({ resist: { VOLT: 1 } });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'VOLT', showNumber: false });
        expect(e.health).toBeCloseTo(100);
    });

    test('weakness (negative resist) amplifies damage', () => {
        const e = mkEnemy({ resist: { CRYO: -0.5 } });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'CRYO', showNumber: false });
        expect(e.health).toBeCloseTo(85); // 10 × 1.5
    });

    test('resist on a different element does not apply', () => {
        const e = mkEnemy({ resist: { CRYO: 0.9 } });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(90);
    });

    test('missing element defaults to KINETIC (neutral)', () => {
        const e = mkEnemy();
        applyDamageToEnemy.call(CTX, e, 10, { showNumber: false });
        expect(e.health).toBeCloseTo(90);
    });

    test('return shape reports destroyed when lethal', () => {
        const e = mkEnemy({ health: 4 });
        const r = applyDamageToEnemy.call(CTX, e, 10, { element: 'KINETIC', showNumber: false });
        expect(r.destroyed).toBe(true);
        expect(e.health).toBeCloseTo(0);
    });
});
