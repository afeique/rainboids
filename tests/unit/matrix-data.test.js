/**
 * tests/unit/matrix-data.test.js — Looter-Economy Pivot T05.
 *
 * Pins the §2.2 Matrix catalog contract:
 *   - all 8 Matrices present, each with all 5 gear slots
 *   - every per-slot amplifier line references a real SP stat id
 *   - matrixBonus tier-2 == tier-1 × 1.5 (the ×1.5/tier scaling)
 *   - resonanceBonus(0)=0, (1)=0, then climbs with the count
 *   - combine/tier-cap constants exist
 *
 * Pure data module → no browser shims needed.
 */

import {
    MATRICES,
    MATRIX_ORDER,
    MATRIX_SLOTS,
    MATRIX_TIER_SCALE,
    COMBINE_COUNT,
    MAX_MATRIX_TIER,
    RESONANCE_PER_PIECE,
    matrixTierFactor,
    matrixBonus,
    resonanceBonus,
} from '../../js/modules/world/matrix-data.js';
import { SP_STATS } from '../../js/modules/core/sp-stats.js';
import { SLOT_ORDER } from '../../js/modules/world/item-names.js';

const EXPECTED_MATRICES = [
    'vital', 'aegis', 'predator', 'reactor',
    'sanguine', 'velocity', 'thornguard', 'evasion',
];

const SP_STAT_IDS = new Set(SP_STATS.map((s) => s.id));

describe('MATRICES catalog', () => {
    test('exactly the 8 design Matrices are present', () => {
        expect(MATRIX_ORDER.slice().sort()).toEqual(EXPECTED_MATRICES.slice().sort());
        expect(Object.keys(MATRICES)).toHaveLength(8);
    });

    test('each Matrix carries all 5 gear slots, each a non-empty array', () => {
        for (const id of EXPECTED_MATRICES) {
            const m = MATRICES[id];
            expect(m).toBeDefined();
            expect(m.id).toBe(id);
            expect(typeof m.name).toBe('string');
            for (const slot of SLOT_ORDER) {
                expect(Array.isArray(m.perSlot[slot])).toBe(true);
                expect(m.perSlot[slot].length).toBeGreaterThan(0);
            }
            // No extra/unknown slots.
            expect(Object.keys(m.perSlot).sort()).toEqual(SLOT_ORDER.slice().sort());
        }
    });

    test('MATRIX_SLOTS mirrors item-names SLOT_ORDER', () => {
        expect(MATRIX_SLOTS).toEqual(SLOT_ORDER);
    });

    test('every amplifier line references a real SP stat id with a positive %', () => {
        for (const id of EXPECTED_MATRICES) {
            for (const slot of SLOT_ORDER) {
                for (const line of MATRICES[id].perSlot[slot]) {
                    expect(SP_STAT_IDS.has(line.stat)).toBe(true);
                    expect(typeof line.pct).toBe('number');
                    expect(line.pct).toBeGreaterThan(0);
                }
            }
        }
    });

    test('transcribed table spot-checks (§2.2)', () => {
        // Vital HULL +12% HEALTH; NANITES +10% REGEN(ERATION).
        expect(matrixBonus('vital', 'hull')).toEqual([{ stat: 'HEALTH', pct: 12 }]);
        expect(matrixBonus('vital', 'nanites')).toEqual([{ stat: 'REGENERATION', pct: 10 }]);
        // Thornguard CHASSIS is the spikiest single line in the table: +14% THORNS.
        expect(matrixBonus('thornguard', 'chassis')).toEqual([{ stat: 'THORNS', pct: 14 }]);
        // Sanguine NANITES is the only dual-line slot: +6% VAMP / +6% REGEN.
        expect(matrixBonus('sanguine', 'nanites')).toEqual([
            { stat: 'VAMPIRISM', pct: 6 },
            { stat: 'REGENERATION', pct: 6 },
        ]);
        // Reactor SHIELDING amplifies EFFICIENCY.
        expect(matrixBonus('reactor', 'shielding')).toEqual([{ stat: 'EFFICIENCY', pct: 10 }]);
    });
});

describe('matrixBonus tier scaling', () => {
    test('MATRIX_TIER_SCALE is 1.5', () => {
        expect(MATRIX_TIER_SCALE).toBe(1.5);
    });

    test('matrixTierFactor: tier1=1, tier2=1.5, tier3=2.25', () => {
        expect(matrixTierFactor(1)).toBe(1);
        expect(matrixTierFactor(2)).toBeCloseTo(1.5, 10);
        expect(matrixTierFactor(3)).toBeCloseTo(2.25, 10);
    });

    test('tier-2 pct == tier-1 pct × 1.5 for every line', () => {
        for (const id of EXPECTED_MATRICES) {
            for (const slot of SLOT_ORDER) {
                const t1 = matrixBonus(id, slot, 1);
                const t2 = matrixBonus(id, slot, 2);
                expect(t2).toHaveLength(t1.length);
                t1.forEach((line, i) => {
                    expect(t2[i].stat).toBe(line.stat);
                    expect(t2[i].pct).toBeCloseTo(line.pct * 1.5, 10);
                });
            }
        }
    });

    test('matrixBonus returns fresh arrays (no mutation of MATRICES)', () => {
        const a = matrixBonus('vital', 'hull', 2);
        a[0].pct = -999;
        expect(MATRICES.vital.perSlot.hull[0].pct).toBe(12);
    });

    test('unknown matrix or slot → empty array (no throw)', () => {
        expect(matrixBonus('nope', 'hull')).toEqual([]);
        expect(matrixBonus('vital', 'nope')).toEqual([]);
    });
});

describe('resonanceBonus', () => {
    test('first piece grants nothing', () => {
        expect(resonanceBonus(0)).toBe(0);
        expect(resonanceBonus(1)).toBe(0);
    });

    test('climbs with each additional matching piece', () => {
        expect(resonanceBonus(2)).toBe(RESONANCE_PER_PIECE);       // +3
        expect(resonanceBonus(3)).toBe(2 * RESONANCE_PER_PIECE);   // +6
        expect(resonanceBonus(5)).toBe(4 * RESONANCE_PER_PIECE);   // +12
        // strictly increasing
        for (let n = 2; n <= 5; n++) {
            expect(resonanceBonus(n)).toBeGreaterThan(resonanceBonus(n - 1));
        }
    });

    test('never negative for junk input', () => {
        expect(resonanceBonus(-3)).toBe(0);
    });
});

describe('crafting / tier constants', () => {
    test('COMBINE_COUNT is 3 (3×Tn → 1×T(n+1))', () => {
        expect(COMBINE_COUNT).toBe(3);
    });

    test('MAX_MATRIX_TIER is a sane integer ceiling', () => {
        expect(Number.isInteger(MAX_MATRIX_TIER)).toBe(true);
        expect(MAX_MATRIX_TIER).toBeGreaterThanOrEqual(2);
        expect(MAX_MATRIX_TIER).toBe(5);
    });
});
