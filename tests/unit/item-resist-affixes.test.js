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
    applyResistTarget, eligibleItemPassives, rerollItemPassive,
} from '../../js/modules/world/item-system.js';
// T27 — createItem rolls via gear-gen: pure {stat,pct} amplifier affixes, the
// canonical RARITY_LADDER affix count, and NO resists on drop (resists are now
// added exclusively via TARGET-RESIST crafting / applyResistTarget below).
import { rarityRow } from '../../js/modules/world/gear-gen.js';
import {
    resistTargetCost, canAffordResistTarget, rerollCost,
    passiveRerollCost, canAffordPassiveReroll,
} from '../../js/modules/world/cores.js';

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

    test('TOTAL affix count per tier is exactly the gear-gen ladder affixCount', () => {
        for (const rarity of RARITY_ORDER) {
            const expected = rarityRow(rarity).affixCount;
            for (let i = 0; i < 500; i++) {
                const item = createItem('nanites', 8, rarity);
                expect(item.affixes.length).toBe(expected);
            }
        }
    });

    test('T27 — dropped gear rolls NO resist affixes on ANY tier (resists are craft-only)', () => {
        // The pivot removed resist rolls from drops: gear-gen emits pure
        // {stat,pct} amplifiers. Resists are added exclusively via TARGET-RESIST
        // crafting (applyResistTarget, tier-capped by maxResistAffixes).
        for (const rarity of RARITY_ORDER) {
            for (let i = 0; i < 500; i++) {
                const item = createItem('hull', 12, rarity);
                expect(countResists(item.affixes)).toBe(0);
                // every rolled affix is a {stat,pct} amplifier
                for (const a of item.affixes) {
                    expect(typeof a.stat).toBe('string');
                    expect(typeof a.pct).toBe('number');
                }
            }
        }
    });
});

describe('META-03 — resistTargetCost / canAffordResistTarget', () => {
    test('cost scales with rarity rank', () => {
        const common = createItem('hull', 5, 'common');
        const epic = createItem('hull', 5, 'epic');
        const transcendental = createItem('hull', 5, 'transcendental');
        expect(resistTargetCost(epic)).toBeGreaterThan(resistTargetCost(common));
        expect(resistTargetCost(transcendental)).toBeGreaterThan(resistTargetCost(epic));
    });

    test('cost scales with item level', () => {
        const lo = createItem('hull', 1, 'epic');
        const hi = createItem('hull', 30, 'epic');
        expect(resistTargetCost(hi)).toBeGreaterThan(resistTargetCost(lo));
    });

    test('cost is in the same ballpark as a reroll (above it, below a tier-up)', () => {
        const it = createItem('hull', 10, 'epic');
        // Premium over a blind reroll on the same item.
        expect(resistTargetCost(it)).toBeGreaterThan(rerollCost(it));
    });

    test('cost floors at 4 and is finite for every rarity', () => {
        for (const rarity of RARITY_ORDER) {
            const it = createItem('hull', 1, rarity);
            expect(resistTargetCost(it)).toBeGreaterThanOrEqual(4);
            expect(Number.isFinite(resistTargetCost(it))).toBe(true);
        }
    });

    test('canAffordResistTarget boundary', () => {
        const it = createItem('hull', 10, 'epic');
        const cost = resistTargetCost(it);
        expect(canAffordResistTarget(it, cost)).toBe(true);
        expect(canAffordResistTarget(it, cost - 1)).toBe(false);
        expect(canAffordResistTarget(it, 0)).toBe(false);
    });
});

describe('META-03 — applyResistTarget', () => {
    // Build a deterministic item with a known affix mix (bypass RNG).
    function makeItem(rarity, affixes) {
        return {
            slot: 'hull', level: 10, rarity, name: 'Test',
            affixes: affixes.map((a) => ({ ...a })),
        };
    }
    const HP = { type: 'hp', value: 50, label: '+50 MAX HP' };
    const TOUGH = { type: 'toughness', value: 5, label: '+5% DEF' };
    const PYRO = { type: 'pyroResist', value: 8, label: '+8% PYRO RESIST' };
    const CRYO = { type: 'cryoResist', value: 8, label: '+8% CRYO RESIST' };

    test('rejects an invalid element (no mutation)', () => {
        const it = makeItem('epic', [HP, TOUGH]);
        const before = JSON.stringify(it.affixes);
        const res = applyResistTarget(it, 'PLASMA');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('invalid-element');
        expect(JSON.stringify(it.affixes)).toBe(before);
    });

    test('rejects on a common (cap 0 → tier-locked)', () => {
        const it = makeItem('common', [HP]);
        const before = JSON.stringify(it.affixes);
        const res = applyResistTarget(it, 'PYRO');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('tier-locked');
        expect(JSON.stringify(it.affixes)).toBe(before);
    });

    test('rejects a duplicate element already on the item', () => {
        const it = makeItem('epic', [HP, PYRO]); // already has pyroResist
        const res = applyResistTarget(it, 'PYRO');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('duplicate');
    });

    test('accepts lowercase element id', () => {
        const it = makeItem('epic', [HP, TOUGH]);
        const res = applyResistTarget(it, 'pyro');
        expect(res.ok).toBe(true);
        expect(it.affixes.some((a) => a.type === 'pyroResist')).toBe(true);
    });

    test('ADD under cap: replaces a NON-resist affix, total count unchanged', () => {
        const it = makeItem('epic', [HP, TOUGH]); // cap 2, 0 resists → ADD
        const res = applyResistTarget(it, 'PYRO');
        expect(res.ok).toBe(true);
        expect(res.mode).toBe('add');
        expect(it.affixes).toHaveLength(2); // TOTAL count unchanged
        // Exactly one new resist of the targeted element.
        expect(it.affixes.filter((a) => a.type === 'pyroResist')).toHaveLength(1);
        expect(countResists(it.affixes)).toBe(1);
        // The first non-resist (HP) was replaced; TOUGH survived.
        expect(it.affixes.some((a) => a.type === 'hp')).toBe(false);
        expect(it.affixes.some((a) => a.type === 'toughness')).toBe(true);
    });

    test('SWAP at cap: replaces the oldest resist, count unchanged, element present', () => {
        // epic cap 2; already at 2 resists → SWAP the oldest (pyro) for volt.
        const it = makeItem('epic', [PYRO, CRYO]);
        const res = applyResistTarget(it, 'VOLT');
        expect(res.ok).toBe(true);
        expect(res.mode).toBe('swap');
        expect(it.affixes).toHaveLength(2); // TOTAL count unchanged
        expect(countResists(it.affixes)).toBe(2); // resist count unchanged
        expect(it.affixes.some((a) => a.type === 'voltResist')).toBe(true);
        expect(it.affixes.some((a) => a.type === 'pyroResist')).toBe(false); // oldest swapped out
        expect(it.affixes.some((a) => a.type === 'cryoResist')).toBe(true);  // newer kept
    });

    test('never exceeds maxResistAffixes(rarity) across many targets', () => {
        // rare cap 1: repeatedly target different elements → never 2 resists.
        const it = makeItem('rare', [HP, TOUGH]);
        for (const el of ['PYRO', 'CRYO', 'VOLT', 'TOXIC']) {
            applyResistTarget(it, el);
            expect(countResists(it.affixes)).toBeLessThanOrEqual(maxResistAffixes('rare'));
        }
        expect(countResists(it.affixes)).toBe(1);
        // The last targeted element is the one present (SWAP semantics).
        expect(it.affixes.some((a) => a.type === 'toxicResist')).toBe(true);
    });

    test('never produces two resists of the same element', () => {
        const it = makeItem('godlike', [HP, TOUGH, { type: 'speed', value: 4, label: '+4% SPEED' }]);
        applyResistTarget(it, 'PYRO');
        applyResistTarget(it, 'PYRO'); // duplicate → rejected, no second pyro
        expect(it.affixes.filter((a) => a.type === 'pyroResist')).toHaveLength(1);
    });

    test('appends when the item is all resists but under cap', () => {
        // godlike cap 3; 1 resist + 0 non-resist (degenerate) → append, count grows.
        const it = makeItem('godlike', [PYRO]);
        const res = applyResistTarget(it, 'CRYO');
        expect(res.ok).toBe(true);
        expect(res.mode).toBe('add');
        expect(countResists(it.affixes)).toBe(2);
        expect(it.affixes).toHaveLength(2);
    });

    test('refreshes derived fields (bonusLabel includes the new resist)', () => {
        const it = makeItem('epic', [HP, TOUGH]);
        applyResistTarget(it, 'PYRO');
        expect(it.bonusLabel).toContain('PYRO RESIST');
    });
});

describe('META-04 — passiveRerollCost / canAffordPassiveReroll', () => {
    test('cost scales with rarity rank', () => {
        const exceptional = createItem('hull', 5, 'exceptional');
        const legendary = createItem('hull', 5, 'legendary');
        const transcendental = createItem('hull', 5, 'transcendental');
        expect(passiveRerollCost(legendary)).toBeGreaterThan(passiveRerollCost(exceptional));
        expect(passiveRerollCost(transcendental)).toBeGreaterThan(passiveRerollCost(legendary));
    });

    test('cost scales with item level', () => {
        const lo = createItem('hull', 1, 'exceptional');
        const hi = createItem('hull', 30, 'exceptional');
        expect(passiveRerollCost(hi)).toBeGreaterThan(passiveRerollCost(lo));
    });

    test('a passive reroll is the richest craft (above a targeted resist on the same item)', () => {
        const it = createItem('hull', 10, 'transcendental');
        // Premium over a targeted-resist swap, which is itself above a blind reroll.
        expect(passiveRerollCost(it)).toBeGreaterThan(resistTargetCost(it));
        expect(resistTargetCost(it)).toBeGreaterThan(rerollCost(it));
    });

    test('cost floors at 6 and is finite for every rarity', () => {
        for (const rarity of RARITY_ORDER) {
            const it = createItem('hull', 1, rarity);
            expect(passiveRerollCost(it)).toBeGreaterThanOrEqual(6);
            expect(Number.isFinite(passiveRerollCost(it))).toBe(true);
        }
    });

    test('canAffordPassiveReroll boundary', () => {
        const it = createItem('hull', 10, 'legendary');
        const cost = passiveRerollCost(it);
        expect(canAffordPassiveReroll(it, cost)).toBe(true);
        expect(canAffordPassiveReroll(it, cost - 1)).toBe(false);
        expect(canAffordPassiveReroll(it, 0)).toBe(false);
    });
});

describe('META-04 — rerollItemPassive', () => {
    // Deterministic items (bypass createItem's RNG passive roll).
    function makeItem(rarity, passive = null) {
        return {
            slot: 'hull', level: 10, rarity, name: 'Test',
            affixes: [{ type: 'hp', value: 50, label: '+50 MAX HP' }],
            ...(passive ? { passive } : {}),
        };
    }

    test('rejects below Exceptional (no eligible passive pool → tier-locked)', () => {
        for (const rarity of ['common', 'rare']) {
            const it = makeItem(rarity);
            expect(eligibleItemPassives(rarity)).toHaveLength(0);
            const res = rerollItemPassive(it);
            expect(res.ok).toBe(false);
            expect(res.reason).toBe('tier-locked');
            expect(it.passive).toBeUndefined(); // no mutation
        }
    });

    test('null item → tier-locked (defensive)', () => {
        const res = rerollItemPassive(null);
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('tier-locked');
    });

    test('on an eligible item with NO passive, ADDS one from the eligible pool', () => {
        const it = makeItem('transcendental'); // big pool, no passive yet
        const eligible = new Set(eligibleItemPassives('transcendental').map((p) => p.id));
        const res = rerollItemPassive(it);
        expect(res.ok).toBe(true);
        expect(res.from).toBeNull();
        expect(eligible.has(res.to)).toBe(true);
        expect(it.passive).toBe(res.to);
    });

    test('always lands on an id inside the eligible pool (never outside)', () => {
        const eligible = new Set(eligibleItemPassives('transcendental').map((p) => p.id));
        for (let i = 0; i < 200; i++) {
            const it = makeItem('transcendental', 'GLASS_CANNON');
            const res = rerollItemPassive(it);
            expect(res.ok).toBe(true);
            expect(eligible.has(it.passive)).toBe(true);
        }
    });

    test('prefers a DIFFERENT id — never re-lands on the current passive when ≥2 options', () => {
        const pool = eligibleItemPassives('transcendental');
        expect(pool.length).toBeGreaterThanOrEqual(2); // sanity: alternatives exist
        const start = pool[0].id;
        for (let i = 0; i < 200; i++) {
            const it = makeItem('transcendental', start);
            const res = rerollItemPassive(it);
            expect(res.ok).toBe(true);
            // With ≥2 eligible options the current id is excluded, so the result
            // ALWAYS differs from the starting passive.
            expect(it.passive).not.toBe(start);
            expect(res.from).toBe(start);
            expect(res.to).toBe(it.passive);
        }
    });

    test('returns from/to reflecting the change', () => {
        const it = makeItem('exceptional', 'CATALYST');
        const res = rerollItemPassive(it);
        if (res.ok) {
            expect(res.from).toBe('CATALYST');
            expect(res.to).toBe(it.passive);
        } else {
            // Only reachable if Exceptional had a single eligible passive == CATALYST.
            expect(res.reason).toBe('no-alternatives');
        }
    });
});
