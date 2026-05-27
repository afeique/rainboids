// Looter-Economy Pivot — T10: Weapon generation/roll (§3.1).
// Exercises rollWeapon with a SEEDED/stub rng for determinism.
import { rollWeapon, describeWeapon } from '../../js/modules/combat/weapon-gen.js';
import {
    WEAPON_TRAITS,
    traitCountForRarity,
    rollableTraitsFor,
    RARITY_LADDER,
    DEFAULT_ELEMENT,
} from '../../js/modules/combat/weapon-traits.js';

// A deterministic stub rng: cycles a fixed sequence in [0,1).
function seqRng(values) {
    let i = 0;
    return () => values[(i++) % values.length];
}

// A seeded PRNG (mulberry32) — deterministic given a seed, good spread.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function elementTraits(weapon) {
    return weapon.traits.filter((t) => t.class === 'ELEMENT');
}

describe('T10 — rollWeapon: trait count by rarity', () => {
    test('count matches traitCountForRarity for every tier (capped by pool)', () => {
        for (const rarity of RARITY_LADDER) {
            const w = rollWeapon({ archetype: 'PULSE', rarity, rng: mulberry32(1) });
            const expected = Math.min(
                traitCountForRarity(rarity),
                rollableTraitsFor('PULSE').length,
            );
            expect(w.traits.length).toBe(expected);
        }
    });

    test('common rolls exactly 1 trait, transcendental rolls 8', () => {
        expect(rollWeapon({ archetype: 'PULSE', rarity: 'common', rng: mulberry32(7) }).traits.length).toBe(1);
        expect(rollWeapon({ archetype: 'PULSE', rarity: 'transcendental', rng: mulberry32(7) }).traits.length).toBe(8);
    });

    test('accepts a 1-based rarity number', () => {
        expect(rollWeapon({ archetype: 'PULSE', rarity: 1, rng: mulberry32(2) }).traits.length).toBe(1);
        expect(rollWeapon({ archetype: 'PULSE', rarity: 4, rng: mulberry32(2) }).traits.length).toBe(4);
    });
});

describe('T10 — rollWeapon: shape', () => {
    test('returns { archetype, rarity, traits, element } with sound traits', () => {
        const w = rollWeapon({ archetype: 'PULSE', rarity: 'epic', rng: mulberry32(42) });
        expect(w.archetype).toBe('PULSE');
        expect(w.rarity).toBe('epic');
        expect(typeof w.element).toBe('string');
        expect(Array.isArray(w.traits)).toBe(true);
        for (const t of w.traits) {
            expect(typeof t.id).toBe('string');
            expect(WEAPON_TRAITS[t.id]).toBeDefined();
            expect(t.class).toBe(WEAPON_TRAITS[t.id].class);
            // value present iff the def has a roll band
            const def = WEAPON_TRAITS[t.id];
            if (def.roll) expect(typeof t.value).toBe('number');
            else expect(t.value).toBeUndefined();
        }
    });

    test('all chosen trait ids are distinct', () => {
        const w = rollWeapon({ archetype: 'PULSE', rarity: 'godlike', rng: mulberry32(99) });
        const ids = w.traits.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('all chosen traits are drawn from the archetype rollable pool', () => {
        const poolIds = new Set(rollableTraitsFor('RAIL').map((d) => d.id));
        const w = rollWeapon({ archetype: 'RAIL', rarity: 'divine', rng: mulberry32(5) });
        for (const t of w.traits) expect(poolIds.has(t.id)).toBe(true);
        // RAIL excludes PIERCE — must never appear.
        expect(w.traits.some((t) => t.id === 'PIERCE')).toBe(false);
    });
});

describe('T10 — focus pins the trait TYPE', () => {
    test('focus trait id always appears (across many seeds)', () => {
        for (let seed = 0; seed < 50; seed++) {
            const w = rollWeapon({
                archetype: 'PULSE',
                rarity: 'rare',
                focus: 'PYRO',
                rng: mulberry32(seed),
            });
            expect(w.traits.some((t) => t.id === 'PYRO')).toBe(true);
        }
    });

    test('focusing an element sets weapon.element to that element', () => {
        const w = rollWeapon({
            archetype: 'PULSE',
            rarity: 'rare',
            focus: 'VOLT',
            rng: mulberry32(3),
        });
        expect(w.element).toBe('VOLT');
        expect(w.traits.some((t) => t.id === 'VOLT')).toBe(true);
    });

    test('focusing a non-element behavior still guarantees it; value still rolls', () => {
        const w = rollWeapon({
            archetype: 'PULSE',
            rarity: 'exceptional',
            focus: 'MULTISHOT',
            rng: mulberry32(11),
        });
        const ms = w.traits.find((t) => t.id === 'MULTISHOT');
        expect(ms).toBeDefined();
        // MULTISHOT roll band is {1,3}: value pinned to TYPE, but still in band.
        expect(ms.value).toBeGreaterThanOrEqual(1);
        expect(ms.value).toBeLessThanOrEqual(3);
    });

    test('a focus trait excluded from the archetype is silently ignored', () => {
        // RAIL excludes PIERCE — focusing it cannot force it in.
        const w = rollWeapon({
            archetype: 'RAIL',
            rarity: 'rare',
            focus: 'PIERCE',
            rng: mulberry32(8),
        });
        expect(w.traits.some((t) => t.id === 'PIERCE')).toBe(false);
        expect(w.traits.length).toBe(2);
    });
});

describe('T10 — values fall within each trait roll band', () => {
    test('every rolled value is within its trait def roll band, across seeds', () => {
        for (let seed = 0; seed < 80; seed++) {
            const w = rollWeapon({
                archetype: 'PULSE',
                rarity: 'transcendental',
                rng: mulberry32(seed),
            });
            for (const t of w.traits) {
                const def = WEAPON_TRAITS[t.id];
                if (!def.roll) continue;
                expect(t.value).toBeGreaterThanOrEqual(def.roll.min);
                expect(t.value).toBeLessThanOrEqual(def.roll.max);
                expect(Number.isInteger(t.value)).toBe(true);
            }
        }
    });
});

describe('T10 — at most one element trait', () => {
    test('never more than one ELEMENT trait, across rarities + seeds', () => {
        for (const rarity of RARITY_LADDER) {
            for (let seed = 0; seed < 40; seed++) {
                const w = rollWeapon({ archetype: 'PULSE', rarity, rng: mulberry32(seed) });
                expect(elementTraits(w).length).toBeLessThanOrEqual(1);
            }
        }
    });

    test('no element trait → element falls back to KINETIC default', () => {
        // Force no element: stub rng that always picks the first non-element
        // candidate is awkward; instead assert the invariant holds when none rolled.
        let sawKinetic = false;
        for (let seed = 0; seed < 60; seed++) {
            const w = rollWeapon({ archetype: 'PULSE', rarity: 'common', rng: mulberry32(seed) });
            if (elementTraits(w).length === 0) {
                expect(w.element).toBe(DEFAULT_ELEMENT);
                sawKinetic = true;
            } else {
                expect(w.element).toBe(elementTraits(w)[0].id);
            }
        }
        expect(sawKinetic).toBe(true); // at least one common with no element
    });

    test('element trait present → element equals that trait id', () => {
        const w = rollWeapon({
            archetype: 'PULSE',
            rarity: 'rare',
            focus: 'TOXIC',
            rng: mulberry32(4),
        });
        expect(w.element).toBe('TOXIC');
    });
});

describe('T10 — lean biases toward the focus class (never values)', () => {
    test('Pure lean toward an Element focus crowds the trait list with the focus + more behavior of that class is impossible (only 1 element), but never breaks the 1-element cap', () => {
        // Pure + element focus: the element is guaranteed, still only one element.
        const w = rollWeapon({
            archetype: 'PULSE',
            rarity: 'epic',
            lean: 'Pure',
            focus: 'PYRO',
            rng: mulberry32(13),
        });
        expect(w.traits.some((t) => t.id === 'PYRO')).toBe(true);
        expect(elementTraits(w).length).toBe(1);
    });

    test('Strong/Pure lean toward a STAT focus yields more STAT traits than None', () => {
        const countStat = (lean) => {
            let total = 0;
            for (let seed = 0; seed < 60; seed++) {
                const w = rollWeapon({
                    archetype: 'PULSE',
                    rarity: 'godlike',
                    lean,
                    focus: 'DAMAGE_PCT',
                    rng: mulberry32(seed),
                });
                total += w.traits.filter((t) => t.class === 'STAT').length;
            }
            return total;
        };
        expect(countStat('Pure')).toBeGreaterThan(countStat('None'));
    });
});

describe('T10 — determinism', () => {
    test('same rng sequence → identical weapon', () => {
        const a = rollWeapon({ archetype: 'PULSE', rarity: 'legendary', rng: mulberry32(123) });
        const b = rollWeapon({ archetype: 'PULSE', rarity: 'legendary', rng: mulberry32(123) });
        expect(a).toEqual(b);
    });

    test('different seeds generally differ', () => {
        const a = rollWeapon({ archetype: 'PULSE', rarity: 'legendary', rng: mulberry32(1) });
        const b = rollWeapon({ archetype: 'PULSE', rarity: 'legendary', rng: mulberry32(2) });
        expect(a).not.toEqual(b);
    });

    test('a fixed seqRng yields a stable, hand-checkable result', () => {
        // seqRng([0]) → every pick is index 0; values pin to band min.
        const w = rollWeapon({ archetype: 'PULSE', rarity: 'rare', rng: seqRng([0]) });
        expect(w.traits.length).toBe(2);
        // deterministic + repeatable
        const w2 = rollWeapon({ archetype: 'PULSE', rarity: 'rare', rng: seqRng([0]) });
        expect(w).toEqual(w2);
    });
});

describe('T10 — describeWeapon', () => {
    test('produces a short string containing archetype, element, and trait names', () => {
        const w = rollWeapon({
            archetype: 'PULSE',
            rarity: 'rare',
            focus: 'PYRO',
            rng: mulberry32(9),
        });
        const s = describeWeapon(w);
        expect(typeof s).toBe('string');
        expect(s).toContain('PULSE');
        expect(s).toContain(w.element);
    });

    test('handles an invalid weapon gracefully', () => {
        expect(describeWeapon(null)).toBe('(invalid weapon)');
        expect(describeWeapon({})).toBe('(invalid weapon)');
    });
});

describe('T10 — defaults', () => {
    test('defaults to common / None / no focus / Math.random', () => {
        const w = rollWeapon({ archetype: 'PULSE' });
        expect(w.rarity).toBe('common');
        expect(w.traits.length).toBe(1);
    });
});
