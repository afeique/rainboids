/**
 * tests/unit/gear-gen.test.js — Looter-Economy Pivot T11: gear roll logic.
 *
 * Validates rollGear (§2.3 + §2.5) against item-templates (T06):
 *   - affix COUNT + socket count come from the matching RARITY_LADDER row
 *   - every rolled pct sits inside the rarity's [pctMin, pctMax] band
 *   - affixes are drawn from the slot-appropriate pool (affixPoolForSlot)
 *   - `focus` pins the stat type (narrow types — pct still rolls)
 *   - `lean: 'Pure'` collapses to the template headline stat
 *   - Transcendental → 2 sockets + a curated signature
 *   - rolls are deterministic for a fixed rng
 *   - gearScore sums the affix pcts
 */

import { describe, expect, test } from '@jest/globals';
import {
    rollGear,
    gearScore,
    rarityRow,
    SIGNATURES,
} from '../../js/modules/world/gear-gen.js';
import {
    RARITY_LADDER,
    ITEM_TEMPLATES,
    affixPoolForSlot,
} from '../../js/modules/world/item-templates.js';
import { SLOT_ORDER } from '../../js/modules/world/item-names.js';

// A deterministic stub rng: cycles a fixed sequence in [0,1).
function seqRng(values) {
    let i = 0;
    return () => values[(i++) % values.length];
}

// A constant rng — always returns the same value.
const constRng = (v) => () => v;

// Lowercase rarity ids parallel to the ladder (Common..Transcendental).
const RARITY_IDS = RARITY_LADDER.map((r) => r.name.toLowerCase());

// ---------------------------------------------------------------------------
// rarityRow
// ---------------------------------------------------------------------------
describe('rarityRow', () => {
    test('maps lowercase rarity id → the ladder row', () => {
        expect(rarityRow('common')).toBe(RARITY_LADDER[0]);
        expect(rarityRow('transcendental')).toBe(RARITY_LADDER[7]);
    });

    test('is case-insensitive', () => {
        expect(rarityRow('LEGENDARY')).toBe(rarityRow('legendary'));
    });

    test('unknown rarity → null', () => {
        expect(rarityRow('mythic')).toBeNull();
        expect(rarityRow(undefined)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// rollGear — shape & rarity-driven counts
// ---------------------------------------------------------------------------
describe('rollGear — item shape', () => {
    test('returns the documented shape', () => {
        const item = rollGear({ slot: 'cockpit', rarity: 'rare', rng: constRng(0.5) });
        expect(item).toEqual(expect.objectContaining({
            slot: 'cockpit',
            rarity: 'rare',
            template: expect.any(String),
            affixes: expect.any(Array),
            sockets: expect.any(Number),
        }));
        item.affixes.forEach((a) => {
            expect(a).toEqual({ stat: expect.any(String), pct: expect.any(Number) });
        });
    });

    test('throws on an unknown rarity', () => {
        expect(() => rollGear({ slot: 'cockpit', rarity: 'mythic' })).toThrow(RangeError);
    });

    test('affix COUNT + sockets match the rarity ladder row, every tier', () => {
        RARITY_LADDER.forEach((row, i) => {
            const item = rollGear({
                slot: 'cockpit',
                rarity: RARITY_IDS[i],
                template: 'assassin', // non-empty pool for cockpit
                rng: seqRng([0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8]),
            });
            expect(item.affixes).toHaveLength(row.affixCount);
            expect(item.sockets).toBe(row.sockets);
        });
    });
});

// ---------------------------------------------------------------------------
// rollGear — pct band
// ---------------------------------------------------------------------------
describe('rollGear — pct band', () => {
    test('every pct is inside [pctMin, pctMax] for each rarity', () => {
        RARITY_LADDER.forEach((row, i) => {
            // Sweep a range of rng values to probe band edges.
            for (const v of [0, 0.25, 0.5, 0.75, 0.999]) {
                const item = rollGear({
                    slot: 'cockpit',
                    rarity: RARITY_IDS[i],
                    template: 'assassin',
                    rng: constRng(v),
                });
                item.affixes.forEach((a) => {
                    expect(a.pct).toBeGreaterThanOrEqual(row.pctMin);
                    expect(a.pct).toBeLessThanOrEqual(row.pctMax);
                });
            }
        });
    });

    test('rng=0 → pctMin, rng→1 → pctMax (band edges)', () => {
        const lo = rollGear({ slot: 'cockpit', rarity: 'common', template: 'assassin', rng: constRng(0) });
        const hi = rollGear({ slot: 'cockpit', rarity: 'common', template: 'assassin', rng: constRng(0.99999) });
        const row = rarityRow('common');
        expect(lo.affixes[0].pct).toBe(row.pctMin);
        expect(hi.affixes[0].pct).toBeCloseTo(row.pctMax, 0);
    });
});

// ---------------------------------------------------------------------------
// rollGear — affixes come from the slot-appropriate pool
// ---------------------------------------------------------------------------
describe('rollGear — slot-appropriate affix pool', () => {
    test('every affix stat is in affixPoolForSlot(template, slot)', () => {
        for (const slot of SLOT_ORDER) {
            for (const tpl of ITEM_TEMPLATES) {
                const pool = affixPoolForSlot(tpl.id, slot);
                const item = rollGear({
                    slot,
                    rarity: 'epic', // 5 affixes — good coverage
                    template: tpl.id,
                    rng: seqRng([0.05, 0.2, 0.45, 0.7, 0.95, 0.15, 0.35, 0.55, 0.75]),
                });
                item.affixes.forEach((a) => {
                    expect(pool).toContain(a.stat);
                });
            }
        }
    });
});

// ---------------------------------------------------------------------------
// rollGear — lean / focus biasing ("narrow types, never values")
// ---------------------------------------------------------------------------
describe('rollGear — focus pins the stat type', () => {
    test('focus on a pool stat yields that stat on every affix', () => {
        // cockpit + assassin pool = [CRIT_CHANCE, CRIT_DAMAGE, SPEED]
        const item = rollGear({
            slot: 'cockpit',
            rarity: 'epic',
            template: 'assassin',
            focus: 'SPEED',
            rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
        });
        item.affixes.forEach((a) => expect(a.stat).toBe('SPEED'));
        // pct still varies across the affixes (values still roll).
        const pcts = new Set(item.affixes.map((a) => a.pct));
        expect(pcts.size).toBeGreaterThan(1);
    });

    test('focus on a stat NOT in the pool is ignored (falls back to lean draw)', () => {
        // HEALTH is not in the cockpit/assassin pool.
        const item = rollGear({
            slot: 'cockpit',
            rarity: 'rare',
            template: 'assassin',
            focus: 'HEALTH',
            rng: constRng(0.0),
        });
        const pool = affixPoolForSlot('assassin', 'cockpit');
        item.affixes.forEach((a) => expect(pool).toContain(a.stat));
        item.affixes.forEach((a) => expect(a.stat).not.toBe('HEALTH'));
    });
});

describe('rollGear — lean biases selection', () => {
    test("lean: 'Pure' collapses to the template headline stat", () => {
        // assassin headline (pool[0] after slot filter) for cockpit = CRIT_CHANCE
        const pool = affixPoolForSlot('assassin', 'cockpit');
        const headline = pool[0];
        const item = rollGear({
            slot: 'cockpit',
            rarity: 'epic',
            template: 'assassin',
            lean: 'Pure',
            rng: seqRng([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6]),
        });
        item.affixes.forEach((a) => expect(a.stat).toBe(headline));
    });

    test("lean: 'None' allows variety across the pool", () => {
        // With a sweeping rng, more than one distinct stat should appear.
        const item = rollGear({
            slot: 'nanites', // wide pool for some templates
            rarity: 'transcendental', // 8 affixes
            template: 'reactor',
            lean: 'None',
            rng: seqRng([0.05, 0.4, 0.8, 0.2, 0.6, 0.95, 0.15, 0.5, 0.75, 0.35, 0.9]),
        });
        const pool = affixPoolForSlot('reactor', 'nanites');
        if (pool.length > 1) {
            const stats = new Set(item.affixes.map((a) => a.stat));
            expect(stats.size).toBeGreaterThan(1);
        }
    });
});

// ---------------------------------------------------------------------------
// rollGear — Transcendental signature + sockets
// ---------------------------------------------------------------------------
describe('rollGear — Transcendental signature', () => {
    test('Transcendental rolls 2 sockets + a curated signature', () => {
        const item = rollGear({
            slot: 'cockpit',
            rarity: 'transcendental',
            template: 'assassin',
            rng: constRng(0.0),
        });
        expect(item.sockets).toBe(2);
        expect(item.signature).toBeDefined();
        expect(SIGNATURES).toContainEqual(item.signature);
        expect(item.signature).toEqual({ id: expect.any(String), desc: expect.any(String) });
    });

    test('non-top tiers have no signature', () => {
        for (const id of RARITY_IDS.slice(0, -1)) {
            const item = rollGear({ slot: 'cockpit', rarity: id, template: 'assassin', rng: constRng(0.5) });
            expect(item.signature).toBeUndefined();
        }
    });

    test('SIGNATURES is a small curated list (3..5) of {id, desc}', () => {
        expect(SIGNATURES.length).toBeGreaterThanOrEqual(3);
        expect(SIGNATURES.length).toBeLessThanOrEqual(5);
        SIGNATURES.forEach((s) => {
            expect(s).toEqual({ id: expect.any(String), desc: expect.any(String) });
        });
    });
});

// ---------------------------------------------------------------------------
// rollGear — determinism
// ---------------------------------------------------------------------------
describe('rollGear — deterministic', () => {
    test('identical inputs + identical rng → identical item', () => {
        const args = () => ({
            slot: 'shielding',
            rarity: 'legendary',
            template: 'bulwark',
            lean: 'Lean',
            rng: seqRng([0.12, 0.34, 0.56, 0.78, 0.9, 0.1, 0.3, 0.5]),
        });
        const a = rollGear(args());
        const b = rollGear(args());
        expect(a).toEqual(b);
    });

    test('a random template is chosen deterministically from the same rng', () => {
        const a = rollGear({ slot: 'hull', rarity: 'common', rng: constRng(0.0) });
        const b = rollGear({ slot: 'hull', rarity: 'common', rng: constRng(0.0) });
        expect(a.template).toBe(b.template);
        expect(ITEM_TEMPLATES.some((t) => t.id === a.template)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// gearScore
// ---------------------------------------------------------------------------
describe('gearScore', () => {
    test('sums the affix pcts', () => {
        const item = { affixes: [{ stat: 'SPEED', pct: 10 }, { stat: 'DODGE', pct: 12.5 }] };
        expect(gearScore(item)).toBeCloseTo(22.5);
    });

    test('handles missing/empty affixes', () => {
        expect(gearScore(null)).toBe(0);
        expect(gearScore({})).toBe(0);
        expect(gearScore({ affixes: [] })).toBe(0);
    });

    test('a higher-rarity roll scores higher (same rng)', () => {
        const common = rollGear({ slot: 'cockpit', rarity: 'common', template: 'assassin', rng: constRng(0.5) });
        const epic = rollGear({ slot: 'cockpit', rarity: 'epic', template: 'assassin', rng: constRng(0.5) });
        expect(gearScore(epic)).toBeGreaterThan(gearScore(common));
    });
});
