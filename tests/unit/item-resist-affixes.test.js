/**
 * tests/unit/item-resist-affixes.test.js — Phase A.E7 per-element
 * RESISTANCE affix contract.
 *
 * Pins the six non-Kinetic resist affixes (PYRO/CRYO/VOLT/TOXIC/VOID/
 * RADIANT) added to ITEM_AFFIX_POOL. The critical invariant is the
 * `type` string format: `<elementLowercase>Resist`, which is exactly
 * what `Player.getElementResist(element)` looks up via
 * `getItemAffixTotal(element.toLowerCase() + 'Resist')`. If that string
 * drifts, player elemental resistance silently reads back 0.
 *
 * Covered:
 *   - pool contains all 6 resist types with the exact `type` strings
 *   - each is a percentage affix (pct: true)
 *   - each label produces a string with the element name + RESIST + %
 *   - each resist type has an AFFIX_SCORE_WEIGHT entry
 *   - type strings round-trip from the element id (the getElementResist
 *     contract): `id.toLowerCase() + 'Resist'` exists in the pool
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { ITEM_AFFIX_POOL, AFFIX_SCORE_WEIGHT } from '../../js/modules/world/item-names.js';
import { ELEMENTS } from '../../js/modules/combat/elements.js';

// The six non-Kinetic elements that should each carry a resist affix.
// KINETIC is the physical baseline and has NO resist affix.
const RESIST_ELEMENTS = ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT'];

// Expected exact `type` strings — must match getElementResist's lookup.
const RESIST_TYPES = [
    'pyroResist', 'cryoResist', 'voltResist',
    'toxicResist', 'voidResist', 'radiantResist',
];

function findAffix(type) {
    return ITEM_AFFIX_POOL.find((a) => a.type === type);
}

describe('Phase A.E7 — per-element resist affixes', () => {
    test('ITEM_AFFIX_POOL contains all 6 resist types with exact type strings', () => {
        for (const type of RESIST_TYPES) {
            expect(findAffix(type)).toBeDefined();
        }
    });

    test('KINETIC has NO resist affix (physical baseline)', () => {
        expect(findAffix('kineticResist')).toBeUndefined();
    });

    test('each resist affix is a percentage affix (pct: true)', () => {
        for (const type of RESIST_TYPES) {
            expect(findAffix(type).pct).toBe(true);
        }
    });

    test('each resist label produces a string with element name + RESIST + %', () => {
        for (const element of RESIST_ELEMENTS) {
            const type = element.toLowerCase() + 'Resist';
            const affix = findAffix(type);
            expect(typeof affix.label).toBe('function');
            const out = affix.label(8);
            expect(typeof out).toBe('string');
            // Element NAME (e.g. PYRO) present.
            expect(out).toContain(element);
            expect(out).toContain('RESIST');
            expect(out).toContain('%');
            // The value renders in the label.
            expect(out).toContain('8');
        }
    });

    test('each resist type has an AFFIX_SCORE_WEIGHT entry', () => {
        for (const type of RESIST_TYPES) {
            expect(AFFIX_SCORE_WEIGHT[type]).toBeDefined();
            expect(typeof AFFIX_SCORE_WEIGHT[type]).toBe('number');
            expect(AFFIX_SCORE_WEIGHT[type]).toBeGreaterThan(0);
        }
    });

    test('type strings round-trip with the element id (getElementResist contract)', () => {
        // The exact contract Player.getElementResist depends on:
        //   getItemAffixTotal(element.toLowerCase() + 'Resist')
        for (const element of RESIST_ELEMENTS) {
            const key = element.toLowerCase() + 'Resist';
            // Spot-check one explicit pairing as called out in the spec.
            if (element === 'PYRO') {
                expect('PYRO'.toLowerCase() + 'Resist').toBe('pyroResist');
            }
            // The derived key must exist as an affix type in the pool.
            expect(findAffix(key)).toBeDefined();
            // …and the element id is a real element in the taxonomy.
            expect(ELEMENTS[element]).toBeDefined();
        }
    });

    test('every non-Kinetic ELEMENTS entry has a matching resist affix', () => {
        // Guards against an element being added to the taxonomy without a
        // resist affix (or vice versa).
        const elementKeys = Object.keys(ELEMENTS).filter((id) => id !== 'KINETIC');
        expect(elementKeys.sort()).toEqual([...RESIST_ELEMENTS].sort());
        for (const id of elementKeys) {
            expect(findAffix(id.toLowerCase() + 'Resist')).toBeDefined();
        }
    });
});
