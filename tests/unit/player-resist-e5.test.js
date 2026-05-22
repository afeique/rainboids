/**
 * tests/unit/player-resist-e5.test.js — Phase E5 player elemental resistance.
 *
 * Pins `playerElementResistMult` (the multiplier applied to incoming damage in
 * lifecycle.takeDamage), the symmetric counterpart to E2's enemy-side resist.
 * Item resist affixes (E7) feed player.getElementResist; this clamps the result.
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
import { playerElementResistMult } from '../../js/modules/player/lifecycle.js';

// Mock player whose getElementResist returns a per-element fraction.
function mkPlayer(resists = {}) {
    return { getElementResist: (el) => resists[el] || 0 };
}

describe('playerElementResistMult (E5)', () => {
    test('no resist → ×1 (full damage)', () => {
        expect(playerElementResistMult(mkPlayer(), 'PYRO')).toBe(1);
    });

    test('30% resist → ×0.7', () => {
        expect(playerElementResistMult(mkPlayer({ PYRO: 0.3 }), 'PYRO')).toBeCloseTo(0.7);
    });

    test('resist is clamped to 0.9 (no full immunity from gear)', () => {
        expect(playerElementResistMult(mkPlayer({ CRYO: 1.5 }), 'CRYO')).toBeCloseTo(0.1);
    });

    test('a negative roll cannot amplify (clamped at 0 resist → ×1)', () => {
        expect(playerElementResistMult(mkPlayer({ VOLT: -0.5 }), 'VOLT')).toBe(1);
    });

    test('resist for a different element does not apply', () => {
        expect(playerElementResistMult(mkPlayer({ CRYO: 0.5 }), 'PYRO')).toBe(1);
    });

    test('missing element / player / accessor → ×1 (safe defaults)', () => {
        expect(playerElementResistMult(mkPlayer({ PYRO: 0.5 }), undefined)).toBe(1);
        expect(playerElementResistMult(null, 'PYRO')).toBe(1);
        expect(playerElementResistMult({}, 'PYRO')).toBe(1); // no getElementResist
    });
});
