/**
 * tests/unit/enemy-warden-e8e.test.js — Phase E8e WARDEN adaptive resist.
 *
 * The anti-meta type that learns the element you keep hitting it with. Pins the
 * pure adaptResist/decayResistMap helpers + the per-hit bump through
 * applyDamageToEnemy (current hit uses the OLD resist; adaptation shows next).
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
import { adaptResist, decayResistMap } from '../../js/modules/combat/elements.js';
import { applyDamageToEnemy } from '../../js/modules/combat/collision-system.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { ENEMY_TYPES } from '../../js/modules/enemy/enemy-data.js';

const CTX = {};
function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {}, armor: 0,
        corrodeStacks: 0, corrodeUntil: 0, conductUntil: 0, frontalShield: null,
        adaptive: false, ...extra,
    };
}
beforeEach(() => { frameClock.now = 10000; });

describe('adaptResist / decayResistMap (pure)', () => {
    test('adaptResist bumps toward the cap by step', () => {
        const m = {};
        adaptResist(m, 'PYRO', 0.12, 0.75);
        expect(m.PYRO).toBeCloseTo(0.12);
        for (let i = 0; i < 20; i++) adaptResist(m, 'PYRO', 0.12, 0.75);
        expect(m.PYRO).toBeCloseTo(0.75); // capped
    });

    test('adaptResist is null-safe', () => {
        expect(() => adaptResist(null, 'PYRO')).not.toThrow();
        expect(() => adaptResist({}, undefined)).not.toThrow();
    });

    test('decayResistMap fades entries and removes ones at/under the floor', () => {
        const m = { PYRO: 0.5, VOLT: 0.02 };
        decayResistMap(m, 0.8, 0.02);
        expect(m.PYRO).toBeCloseTo(0.4);          // 0.5 × 0.8
        expect('VOLT' in m).toBe(false);          // 0.02 × 0.8 = 0.016 ≤ 0.02 → removed
    });

    test('decayResistMap eventually clears a resist to nothing', () => {
        const m = { PYRO: 0.3 };
        for (let i = 0; i < 30; i++) decayResistMap(m, 0.8, 0.02);
        expect('PYRO' in m).toBe(false);
    });
});

describe('WARDEN adaptive bump via applyDamageToEnemy', () => {
    test('first hit lands full; resist to that element appears for the next hit', () => {
        const e = mkEnemy({ adaptive: true });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(90);      // old resist (0) → full damage
        expect(e.resist.PYRO).toBeCloseTo(0.12); // adapted for next time
        // second Pyro hit is now resisted
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect(e.health).toBeCloseTo(90 - 10 * (1 - 0.12)); // 81.2
        expect(e.resist.PYRO).toBeCloseTo(0.24);
    });

    test('switching elements sidesteps the wall (other element not yet resisted)', () => {
        const e = mkEnemy({ adaptive: true, resist: { PYRO: 0.6 } });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'CRYO', showNumber: false });
        expect(e.health).toBeCloseTo(90); // Cryo not resisted yet
    });

    test('non-adaptive enemy never mutates its resist', () => {
        const e = mkEnemy({ adaptive: false });
        applyDamageToEnemy.call(CTX, e, 10, { element: 'PYRO', showNumber: false });
        expect('PYRO' in e.resist).toBe(false);
    });

    test('WARDEN config is flagged adaptive with an empty base resist', () => {
        expect(ENEMY_TYPES.WARDEN.adaptive).toBe(true);
        expect(Object.keys(ENEMY_TYPES.WARDEN.resist || {})).toHaveLength(0);
    });
});
