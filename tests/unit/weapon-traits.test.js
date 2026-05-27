/**
 * tests/unit/weapon-traits.test.js — Looter-Economy Pivot §3.1 (T04).
 *
 * Pins the weapon-trait taxonomy that subsumes attunements + mechanic mods +
 * powerups into one system. The module is pure data + lookups (no browser
 * deps), so no DOM shims are needed.
 */

import { describe, expect, test } from '@jest/globals';
import {
    WEAPON_TRAIT_CLASSES,
    WEAPON_TRAITS,
    ELEMENT_TRAITS,
    BEHAVIOR_TRAITS,
    POWERUP_TRAITS,
    STAT_TRAITS,
    RARITY_LADDER,
    DEFAULT_ELEMENT,
    traitCountForRarity,
    rollableTraitsFor,
} from '../../js/modules/combat/weapon-traits.js';

describe('weapon-traits — classes & taxonomy', () => {
    test('exposes exactly the four trait classes', () => {
        expect(WEAPON_TRAIT_CLASSES).toEqual(['ELEMENT', 'BEHAVIOR', 'POWERUP', 'STAT']);
    });

    test('KINETIC is the default element and is NOT a rollable element trait', () => {
        expect(DEFAULT_ELEMENT).toBe('KINETIC');
        expect(ELEMENT_TRAITS.some((t) => t.id === 'KINETIC')).toBe(false);
        expect(WEAPON_TRAITS.KINETIC).toBeUndefined();
    });

    test('element traits cover the six non-kinetic elements', () => {
        expect(ELEMENT_TRAITS.map((t) => t.id)).toEqual(
            expect.arrayContaining(['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT']),
        );
        expect(ELEMENT_TRAITS).toHaveLength(6);
    });

    test('every trait has a valid class, id, name and description', () => {
        for (const id of Object.keys(WEAPON_TRAITS)) {
            const t = WEAPON_TRAITS[id];
            expect(t.id).toBe(id);
            expect(WEAPON_TRAIT_CLASSES).toContain(t.class);
            expect(typeof t.name).toBe('string');
            expect(t.name.length).toBeGreaterThan(0);
            expect(typeof t.description).toBe('string');
            expect(t.description.length).toBeGreaterThan(0);
        }
    });

    test('any trait with a roll band has min <= max and finite numbers', () => {
        for (const t of Object.values(WEAPON_TRAITS)) {
            if (!t.roll) continue;
            expect(Number.isFinite(t.roll.min)).toBe(true);
            expect(Number.isFinite(t.roll.max)).toBe(true);
            expect(t.roll.min).toBeLessThanOrEqual(t.roll.max);
        }
    });
});

describe('weapon-traits — per-class arrays non-empty & disjoint', () => {
    const classArrays = {
        ELEMENT: ELEMENT_TRAITS,
        BEHAVIOR: BEHAVIOR_TRAITS,
        POWERUP: POWERUP_TRAITS,
        STAT: STAT_TRAITS,
    };

    test('all four class arrays are non-empty', () => {
        for (const [cls, arr] of Object.entries(classArrays)) {
            expect(Array.isArray(arr)).toBe(true);
            expect(arr.length).toBeGreaterThan(0);
            for (const t of arr) expect(t.class).toBe(cls);
        }
    });

    test('class arrays are disjoint (no id appears in two classes)', () => {
        const seen = new Set();
        for (const arr of Object.values(classArrays)) {
            for (const t of arr) {
                expect(seen.has(t.id)).toBe(false);
                seen.add(t.id);
            }
        }
        // The union equals the flat WEAPON_TRAITS map exactly.
        expect(seen.size).toBe(Object.keys(WEAPON_TRAITS).length);
    });
});

describe('weapon-traits — traitCountForRarity', () => {
    test('returns 1..8 across the 8-tier ladder by key', () => {
        const counts = RARITY_LADDER.map((r) => traitCountForRarity(r));
        expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('every ladder tier yields a count in [1, 8]', () => {
        for (const r of RARITY_LADDER) {
            const n = traitCountForRarity(r);
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(8);
        }
    });

    test('accepts a 1-based tier number', () => {
        expect(traitCountForRarity(1)).toBe(1);
        expect(traitCountForRarity(8)).toBe(8);
    });

    test('is case-insensitive and falls back to Common on unknown input', () => {
        expect(traitCountForRarity('TRANSCENDENTAL')).toBe(8);
        expect(traitCountForRarity('bogus')).toBe(1);
        expect(traitCountForRarity(undefined)).toBe(1);
        expect(traitCountForRarity(999)).toBe(1);
    });
});

describe('weapon-traits — rollableTraitsFor', () => {
    test('unknown / default archetype returns the full trait pool', () => {
        const all = rollableTraitsFor('PULSE');
        expect(all.length).toBe(Object.keys(WEAPON_TRAITS).length);
        const dflt = rollableTraitsFor(undefined);
        expect(dflt.length).toBe(Object.keys(WEAPON_TRAITS).length);
    });

    test('always returns a non-empty list of trait defs', () => {
        for (const arch of ['PULSE', 'RAIL', 'LANCE', 'NOVA', 'SPLITTER', 'LIGHTNING', undefined]) {
            const pool = rollableTraitsFor(arch);
            expect(pool.length).toBeGreaterThan(0);
            for (const t of pool) {
                expect(WEAPON_TRAITS[t.id]).toBe(t);
            }
        }
    });

    test('archetype exclusions drop redundant behaviors', () => {
        const railIds = rollableTraitsFor('RAIL').map((t) => t.id);
        expect(railIds).not.toContain('PIERCE');
        const splitterIds = rollableTraitsFor('SPLITTER').map((t) => t.id);
        expect(splitterIds).not.toContain('SPLIT');
        // Exclusions never strip an entire class — all four still represented.
        const railClasses = new Set(rollableTraitsFor('RAIL').map((t) => t.class));
        expect([...railClasses].sort()).toEqual(WEAPON_TRAIT_CLASSES.slice().sort());
    });
});
