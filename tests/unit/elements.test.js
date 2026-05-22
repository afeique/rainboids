/**
 * tests/unit/elements.test.js — Phase E1 element taxonomy + resistance math.
 *
 * Pins the `elementalMultiplier` contract (neutral / resist / immune / weak)
 * and the ELEMENTS table shape, independent of the damage pipeline. The
 * elements module is pure data + math (no browser deps), so no shims needed.
 */

import { describe, expect, test } from '@jest/globals';
import {
    ELEMENTS, ELEMENT_IDS, DEFAULT_ELEMENT, elementalMultiplier, isElement,
} from '../../js/modules/combat/elements.js';

describe('elements taxonomy', () => {
    test('exports exactly the 7 canonical elements', () => {
        expect(ELEMENT_IDS).toEqual(
            expect.arrayContaining(['KINETIC', 'PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT']),
        );
        expect(ELEMENT_IDS).toHaveLength(7);
    });

    test('every element has id/name/hex-color and a statusId field', () => {
        for (const id of ELEMENT_IDS) {
            const e = ELEMENTS[id];
            expect(e.id).toBe(id);
            expect(typeof e.name).toBe('string');
            expect(e.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect('statusId' in e).toBe(true); // null is allowed (Kinetic)
        }
    });

    test('DEFAULT_ELEMENT is a known element', () => {
        expect(isElement(DEFAULT_ELEMENT)).toBe(true);
        expect(isElement('NOPE')).toBe(false);
    });
});

describe('elementalMultiplier', () => {
    test('neutral (missing entry, 0, or no element/map) → 1.0', () => {
        expect(elementalMultiplier({}, 'PYRO')).toBe(1);
        expect(elementalMultiplier({ PYRO: 0 }, 'PYRO')).toBe(1);
        expect(elementalMultiplier(null, 'PYRO')).toBe(1);
        expect(elementalMultiplier({ CRYO: 0.5 }, null)).toBe(1);
    });

    test('positive resist reduces damage', () => {
        expect(elementalMultiplier({ PYRO: 0.5 }, 'PYRO')).toBeCloseTo(0.5);
        expect(elementalMultiplier({ PYRO: 0.9 }, 'PYRO')).toBeCloseTo(0.1);
    });

    test('resist of 1 = immune (0 damage)', () => {
        expect(elementalMultiplier({ VOLT: 1 }, 'VOLT')).toBe(0);
        expect(elementalMultiplier({ VOLT: 1.5 }, 'VOLT')).toBe(0); // over-immune clamps to 0
    });

    test('negative resist = weakness (>1), clamped at 2', () => {
        expect(elementalMultiplier({ CRYO: -0.75 }, 'CRYO')).toBeCloseTo(1.75);
        expect(elementalMultiplier({ CRYO: -5 }, 'CRYO')).toBe(2);
    });

    test('a resist on one element does not affect another', () => {
        expect(elementalMultiplier({ CRYO: 0.9 }, 'PYRO')).toBe(1);
    });
});
