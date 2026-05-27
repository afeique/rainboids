/**
 * tests/unit/matrix-system.test.js — Looter-Economy Pivot T12.
 *
 * Pins the pure Matrix-system verbs (socket / unsocket / combine /
 * aggregate / resonance count). Operates on plain gear-item stubs that carry
 * a `slot` + an optional `matrix:{id,tier}` socket field — no gear-gen import.
 *
 * Pure logic module → no browser shims needed.
 */

import {
    socketMatrix,
    unsocketMatrix,
    combineMatrices,
    aggregateMatrixAmp,
    matrixResonanceCount,
    getSocketedMatrix,
} from '../../js/modules/world/matrix-system.js';
import {
    matrixBonus,
    resonanceBonus,
    COMBINE_COUNT,
    MAX_MATRIX_TIER,
} from '../../js/modules/world/matrix-data.js';

// Minimal gear-item stub: just a slot + an (optional) socketed matrix.
const gear = (slot, matrix = null) => ({ slot, matrix });

describe('socketMatrix / unsocketMatrix', () => {
    test('socket sets the matrix field without mutating the input', () => {
        const empty = gear('hull');
        const socketed = socketMatrix(empty, { id: 'vital', tier: 2 });

        expect(socketed).not.toBe(empty);                  // new object
        expect(empty.matrix).toBeNull();                   // input untouched
        expect(socketed.slot).toBe('hull');                // slot preserved
        expect(socketed.matrix).toEqual({ id: 'vital', tier: 2 });
    });

    test('socket defaults a missing/junk tier to 1', () => {
        expect(socketMatrix(gear('cockpit'), { id: 'predator' }).matrix)
            .toEqual({ id: 'predator', tier: 1 });
        expect(socketMatrix(gear('cockpit'), { id: 'predator', tier: 0 }).matrix)
            .toEqual({ id: 'predator', tier: 1 });
    });

    test('socket rejects invalid gear / invalid matrix', () => {
        expect(() => socketMatrix(null, { id: 'vital', tier: 1 })).toThrow();
        expect(() => socketMatrix(gear('hull'), null)).toThrow();
        expect(() => socketMatrix(gear('hull'), { id: 'not-a-matrix' })).toThrow();
    });

    test('unsocket returns the removed matrix + cleared gear', () => {
        const socketed = gear('shielding', { id: 'aegis', tier: 3 });
        const { matrix, gear: cleared } = unsocketMatrix(socketed);

        expect(matrix).toEqual({ id: 'aegis', tier: 3 });
        expect(cleared).not.toBe(socketed);                // new object
        expect(cleared.matrix).toBeNull();
        expect(cleared.slot).toBe('shielding');
        expect(socketed.matrix).toEqual({ id: 'aegis', tier: 3 }); // input untouched
    });

    test('unsocket an empty socket → null matrix, cleared gear', () => {
        const { matrix, gear: cleared } = unsocketMatrix(gear('nanites'));
        expect(matrix).toBeNull();
        expect(cleared.matrix).toBeNull();
    });

    test('socket → unsocket round-trips the descriptor', () => {
        const start = gear('chassis');
        const socketed = socketMatrix(start, { id: 'thornguard', tier: 4 });
        const { matrix, gear: cleared } = unsocketMatrix(socketed);

        expect(matrix).toEqual({ id: 'thornguard', tier: 4 });
        expect(cleared).toEqual(start);
        // re-socketing the recovered matrix reproduces the socketed gear
        expect(socketMatrix(cleared, matrix)).toEqual(socketed);
    });

    test('getSocketedMatrix normalizes / rejects malformed sockets', () => {
        expect(getSocketedMatrix(gear('hull', { id: 'vital', tier: 2 })))
            .toEqual({ id: 'vital', tier: 2 });
        expect(getSocketedMatrix(gear('hull'))).toBeNull();
        expect(getSocketedMatrix(gear('hull', { id: 'bogus' }))).toBeNull();
        expect(getSocketedMatrix(gear('hull', { tier: 3 }))).toBeNull();
    });
});

describe('combineMatrices', () => {
    test('3× T1 same type → 1× T2', () => {
        const out = combineMatrices([
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
        ]);
        expect(out).toEqual({ id: 'vital', tier: 2 });
    });

    test('uses COMBINE_COUNT — wrong count is rejected', () => {
        expect(COMBINE_COUNT).toBe(3);
        const two = [{ id: 'aegis', tier: 1 }, { id: 'aegis', tier: 1 }];
        const four = [...two, { id: 'aegis', tier: 1 }, { id: 'aegis', tier: 1 }];
        expect(combineMatrices(two)).toBeNull();
        expect(combineMatrices(four)).toBeNull();
        expect(combineMatrices([])).toBeNull();
    });

    test('mismatched TYPE is rejected', () => {
        expect(combineMatrices([
            { id: 'vital', tier: 1 },
            { id: 'aegis', tier: 1 },
            { id: 'vital', tier: 1 },
        ])).toBeNull();
    });

    test('mismatched TIER is rejected', () => {
        expect(combineMatrices([
            { id: 'predator', tier: 1 },
            { id: 'predator', tier: 2 },
            { id: 'predator', tier: 1 },
        ])).toBeNull();
    });

    test('malformed / unknown matrix in the set is rejected', () => {
        expect(combineMatrices([
            { id: 'predator', tier: 1 },
            { id: 'bogus', tier: 1 },
            { id: 'predator', tier: 1 },
        ])).toBeNull();
        expect(combineMatrices([null, null, null])).toBeNull();
    });

    test('chains up tiers and caps at MAX_MATRIX_TIER', () => {
        // T(MAX-1) → T(MAX) succeeds...
        const nearCap = Array.from({ length: COMBINE_COUNT }, () => ({
            id: 'reactor', tier: MAX_MATRIX_TIER - 1,
        }));
        expect(combineMatrices(nearCap)).toEqual({ id: 'reactor', tier: MAX_MATRIX_TIER });

        // ...but combining at the cap is rejected (can't exceed MAX).
        const atCap = Array.from({ length: COMBINE_COUNT }, () => ({
            id: 'reactor', tier: MAX_MATRIX_TIER,
        }));
        expect(combineMatrices(atCap)).toBeNull();
    });

    test('does not mutate the inputs', () => {
        const inputs = [
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
        ];
        combineMatrices(inputs);
        expect(inputs).toEqual([
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
        ]);
    });
});

describe('matrixResonanceCount', () => {
    test('counts only equipped pieces running the given Matrix type', () => {
        const equipped = [
            gear('cockpit',   { id: 'predator', tier: 1 }),
            gear('hull',      { id: 'predator', tier: 1 }),
            gear('shielding', { id: 'vital',    tier: 1 }),
            gear('chassis'),                                  // empty socket
        ];
        expect(matrixResonanceCount(equipped, 'predator')).toBe(2);
        expect(matrixResonanceCount(equipped, 'vital')).toBe(1);
        expect(matrixResonanceCount(equipped, 'aegis')).toBe(0);
    });

    test('handles non-array input', () => {
        expect(matrixResonanceCount(null, 'predator')).toBe(0);
    });
});

describe('aggregateMatrixAmp', () => {
    test('empty / socketless sets contribute nothing', () => {
        expect(aggregateMatrixAmp([])).toEqual({});
        expect(aggregateMatrixAmp([gear('hull'), gear('cockpit')])).toEqual({});
        expect(aggregateMatrixAmp(null)).toEqual({});
    });

    test('single socketed Matrix → its per-slot line, no resonance', () => {
        // Vital HULL = +12% HEALTH; only one Vital piece → resonance 0.
        const out = aggregateMatrixAmp([gear('hull', { id: 'vital', tier: 1 })]);
        expect(out).toEqual({ HEALTH: 12 });
    });

    test('tier scaling flows through (T2 = ×1.5)', () => {
        const out = aggregateMatrixAmp([gear('hull', { id: 'vital', tier: 2 })]);
        // matrixBonus already applies ×1.5/tier.
        expect(out.HEALTH).toBeCloseTo(matrixBonus('vital', 'hull', 2)[0].pct, 10); // 18
    });

    test('3× Predator across cockpit/hull/shielding: per-slot + resonance', () => {
        const equipped = [
            gear('cockpit',   { id: 'predator', tier: 1 }), // CRIT_CHANCE +10
            gear('hull',      { id: 'predator', tier: 1 }), // CRIT_DAMAGE +12
            gear('shielding', { id: 'predator', tier: 1 }), // CRIT_CHANCE +5
        ];
        // 3 Predator pieces → resonanceBonus(3) = +6% applied to EACH line.
        const r = resonanceBonus(3);
        expect(r).toBe(6);

        const out = aggregateMatrixAmp(equipped);
        // CRIT_CHANCE: (10 + r) from cockpit + (5 + r) from shielding = 27
        expect(out.CRIT_CHANCE).toBeCloseTo((10 + r) + (5 + r), 10);
        // CRIT_DAMAGE: (12 + r) from hull = 18
        expect(out.CRIT_DAMAGE).toBeCloseTo(12 + r, 10);
        expect(out).toEqual({
            CRIT_CHANCE: (10 + r) + (5 + r),
            CRIT_DAMAGE: 12 + r,
        });
    });

    test('mixed Matrix types resonate independently', () => {
        // 2× Vital (resonance +3 each) + 1× Aegis (lone → resonance 0).
        const equipped = [
            gear('cockpit', { id: 'vital', tier: 1 }), // HEALTH +8
            gear('hull',    { id: 'vital', tier: 1 }), // HEALTH +12
            gear('nanites', { id: 'aegis', tier: 1 }), // REGENERATION +8
        ];
        const rVital = resonanceBonus(2); // +3
        const rAegis = resonanceBonus(1); // 0

        const out = aggregateMatrixAmp(equipped);
        // HEALTH: (8 + 3) + (12 + 3) = 26
        expect(out.HEALTH).toBeCloseTo((8 + rVital) + (12 + rVital), 10);
        // REGENERATION: 8 + 0 = 8 (Aegis alone)
        expect(out.REGENERATION).toBeCloseTo(8 + rAegis, 10);
    });

    test('dual-line slot (Sanguine NANITES) splits resonance across both stats', () => {
        // Sanguine NANITES = +6% VAMPIRISM / +6% REGENERATION; lone piece → no resonance.
        const out = aggregateMatrixAmp([gear('nanites', { id: 'sanguine', tier: 1 })]);
        expect(out).toEqual({ VAMPIRISM: 6, REGENERATION: 6 });
    });

    test('a Matrix in a slot it does not amplify contributes nothing extra', () => {
        // Every Matrix amplifies all 5 slots in this catalog, so confirm a
        // gear piece missing its `slot` is skipped (no slot → no line).
        const out = aggregateMatrixAmp([{ matrix: { id: 'vital', tier: 1 } }]);
        expect(out).toEqual({});
    });
});
