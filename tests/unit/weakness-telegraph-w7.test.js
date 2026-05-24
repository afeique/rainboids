/**
 * tests/unit/weakness-telegraph-w7.test.js — Phase W7 weakness telegraph.
 *
 * Pins `weaknessElement` (the pip's target element) + that createDamageNumber
 * stores the elemental `effectiveness` the renderer uses for the weakness/
 * resisted hit cue.
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
import { weaknessElement } from '../../js/modules/combat/elements.js';
import { createDamageNumber } from '../../js/modules/combat/combat-manager.js';

describe('weaknessElement (pip target)', () => {
    test('picks the most-negative resist at/beyond the threshold', () => {
        expect(weaknessElement({ PYRO: 0.5, CRYO: -0.5 })).toBe('CRYO');
        expect(weaknessElement({ CRYO: -0.4, TOXIC: -0.6 })).toBe('TOXIC'); // bigger weakness wins
    });
    test('ignores weaknesses weaker than the threshold (default −0.3)', () => {
        expect(weaknessElement({ CRYO: -0.2 })).toBeNull();
    });
    test('null when no weakness / empty / null', () => {
        expect(weaknessElement({ PYRO: 0.5, VOLT: 0.3 })).toBeNull();
        expect(weaknessElement({})).toBeNull();
        expect(weaknessElement(null)).toBeNull();
    });
    test('honors a custom threshold', () => {
        expect(weaknessElement({ CRYO: -0.2 }, -0.1)).toBe('CRYO');
    });
    test('matches the real enemy profiles (sample)', () => {
        // From ENEMY_RESISTS: Guardian shorts to Volt, Cinder freezes, Glacier burns.
        expect(weaknessElement({ KINETIC: 0.30, VOLT: -0.40 })).toBe('VOLT');   // Guardian
        expect(weaknessElement({ PYRO: 0.85, CRYO: -0.50 })).toBe('CRYO');      // Cinder
        expect(weaknessElement({ CRYO: 0.90, PYRO: -0.50 })).toBe('PYRO');      // Glacier
    });
});

describe('createDamageNumber — effectiveness cue', () => {
    const mkCtx = () => ({ damageNumbers: [], _enemyDmgAggs: new Map() });

    test('stores the effectiveness multiplier the renderer reads', () => {
        const ctx = mkCtx();
        createDamageNumber.call(ctx, 0, 0, 10, { effectiveness: 1.5 }); // weakness
        createDamageNumber.call(ctx, 0, 0, 10, { effectiveness: 0.5 }); // resisted
        expect(ctx.damageNumbers[0].effectiveness).toBe(1.5);
        expect(ctx.damageNumbers[1].effectiveness).toBe(0.5);
    });

    test('defaults effectiveness to 1 (neutral) when omitted', () => {
        const ctx = mkCtx();
        createDamageNumber.call(ctx, 0, 0, 10, {});
        expect(ctx.damageNumbers[0].effectiveness).toBe(1);
    });
});
