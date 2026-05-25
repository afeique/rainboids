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
import { ITEM_AFFIX_POOL, AFFIX_SCORE_WEIGHT, RARITY_TIERS, RARITY_ORDER } from '../../js/modules/world/item-names.js';
import { ELEMENTS } from '../../js/modules/combat/elements.js';
import {
    maxResistAffixes, isResistAffix, rollAffixSet, createItem,
} from '../../js/modules/world/item-system.js';

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

// Helpers shared by the gating suite.
function countResists(affixes) {
    return affixes.filter((a) => isResistAffix(a.type)).length;
}

describe('ITEM-01 — maxResistAffixes(rarity) caps', () => {
    test('documented per-tier caps', () => {
        expect(maxResistAffixes('common')).toBe(0);
        expect(maxResistAffixes('rare')).toBe(1);
        expect(maxResistAffixes('exceptional')).toBe(1);
        expect(maxResistAffixes('legendary')).toBe(2);
        expect(maxResistAffixes('epic')).toBe(2);
        expect(maxResistAffixes('godlike')).toBe(3);
        expect(maxResistAffixes('divine')).toBe(3);
        expect(maxResistAffixes('transcendental')).toBe(3);
    });

    test('unknown / missing rarity → safe default of 0', () => {
        expect(maxResistAffixes('bogus')).toBe(0);
        expect(maxResistAffixes(undefined)).toBe(0);
        expect(maxResistAffixes(null)).toBe(0);
    });

    test('caps never exceed the documented ceiling of 3', () => {
        for (const key of RARITY_ORDER) {
            expect(maxResistAffixes(key)).toBeLessThanOrEqual(3);
            expect(maxResistAffixes(key)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('ITEM-01 — isResistAffix(type)', () => {
    test('true for all 6 *Resist types', () => {
        for (const type of RESIST_TYPES) {
            expect(isResistAffix(type)).toBe(true);
        }
    });

    test('false for non-resist affix types', () => {
        for (const type of ['hp', 'toughness', 'vampirism', 'thorns', 'critChance',
            'critDamage', 'dodge', 'speed', 'regen']) {
            expect(isResistAffix(type)).toBe(false);
        }
    });

    test('false for non-string / junk input', () => {
        expect(isResistAffix(undefined)).toBe(false);
        expect(isResistAffix(null)).toBe(false);
        expect(isResistAffix(42)).toBe(false);
        expect(isResistAffix('Resistance')).toBe(false); // not the `*Resist` suffix
    });
});

describe('ITEM-01 — tier-gated resist counts in the roll', () => {
    const ROLLS = 3000;

    test('common items NEVER roll a resist affix (cap 0)', () => {
        for (let i = 0; i < ROLLS; i++) {
            const item = createItem('cockpit', 12, 'common');
            expect(countResists(item.affixes)).toBe(0);
        }
    });

    test('rare items roll at most 1 resist affix (cap 1)', () => {
        for (let i = 0; i < ROLLS; i++) {
            const item = createItem('hull', 12, 'rare');
            expect(countResists(item.affixes)).toBeLessThanOrEqual(1);
        }
    });

    test('epic items roll at most 2 resist affixes (cap 2)', () => {
        for (let i = 0; i < ROLLS; i++) {
            const item = createItem('shielding', 12, 'epic');
            expect(countResists(item.affixes)).toBeLessThanOrEqual(2);
        }
    });

    test('transcendental items roll at most 3 resist affixes (cap 3)', () => {
        for (let i = 0; i < ROLLS; i++) {
            const item = createItem('chassis', 12, 'transcendental');
            expect(countResists(item.affixes)).toBeLessThanOrEqual(3);
        }
    });

    test('rollAffixSet honors the cap directly and keeps the requested count', () => {
        for (const rarity of RARITY_ORDER) {
            const cap = maxResistAffixes(rarity);
            const count = RARITY_TIERS[rarity].affixCount;
            for (let i = 0; i < 1500; i++) {
                const affixes = rollAffixSet(12, rarity, count);
                expect(affixes.length).toBe(count); // TOTAL count unchanged
                expect(countResists(affixes)).toBeLessThanOrEqual(cap);
            }
        }
    });

    test('TOTAL affix count per tier is exactly affixCount (type mix constrained, not count)', () => {
        for (const rarity of RARITY_ORDER) {
            const expected = RARITY_TIERS[rarity].affixCount;
            for (let i = 0; i < 500; i++) {
                const item = createItem('nanites', 8, rarity);
                expect(item.affixes.length).toBe(expected);
            }
        }
    });

    test('rare CAN roll exactly 1 resist (cap is reachable, not just an upper wall)', () => {
        // Over many rolls a rare (affixCount 2) should sometimes land on a
        // resist, proving the gate permits up to the cap rather than blocking
        // resists entirely on non-common tiers.
        let sawResist = false;
        for (let i = 0; i < ROLLS && !sawResist; i++) {
            if (countResists(createItem('hull', 12, 'rare').affixes) === 1) sawResist = true;
        }
        expect(sawResist).toBe(true);
    });
});
