// Looter-Economy Pivot — T12: Matrix system (pure socket/combine logic).
//
// Operates on plain GEAR-ITEM objects. A gear item is any object that has:
//   - `slot`   : one of SLOT_ORDER ('cockpit'|'hull'|'shielding'|'chassis'|
//                'nanites') — which slot the piece occupies. The slot decides
//                WHICH amplifier line a socketed Matrix contributes (§2.2).
//   - `matrix` : the socket field. Either `null`/absent (empty socket) or a
//                Matrix descriptor `{ id, tier }`:
//                  - `id`   : a MATRICES key ('vital','predator',…).
//                  - `tier` : integer ≥ 1 (the Matrix tier; ×1.5 amp / tier).
//
// This module DELIBERATELY does not import gear-gen; it only reads/writes the
// `matrix` field on whatever gear-item objects callers hand it. All verbs are
// pure: socket/unsocket return NEW gear objects (the input is never mutated),
// and aggregation reads without writing.
//
// Verbs (design §2.2):
//   - socketMatrix(gear, matrix)   → gear with `matrix` set.
//   - unsocketMatrix(gear)         → { matrix, gear } (matrix removed, socket cleared).
//   - combineMatrices(matrices)    → 1× tier+1 Matrix from COMBINE_COUNT same
//                                     type+tier Matrices (capped at MAX_MATRIX_TIER).
//   - aggregateMatrixAmp(equipped) → { statId: totalPct } across all sockets,
//                                     including per-type RESONANCE.
//   - matrixResonanceCount(equipped, id) → how many equipped pieces run `id`.

import {
    MATRICES,
    matrixBonus,
    resonanceBonus,
    COMBINE_COUNT,
    MAX_MATRIX_TIER,
} from './matrix-data.js';

// Normalize a Matrix descriptor. Accepts `{ id, tier }`; coerces tier to an
// integer ≥ 1 (defaults to 1). Returns null for anything that isn't a usable
// descriptor (no id / unknown id).
function normalizeMatrix(matrix) {
    if (!matrix || typeof matrix !== 'object') return null;
    const id = matrix.id;
    if (typeof id !== 'string' || !MATRICES[id]) return null;
    const tier = Math.max(1, (matrix.tier | 0) || 1);
    return { id, tier };
}

// Read a gear item's socketed Matrix (normalized), or null if the socket is
// empty / the field is malformed.
export function getSocketedMatrix(gearItem) {
    if (!gearItem) return null;
    return normalizeMatrix(gearItem.matrix);
}

// Socket a Matrix into a gear item. Returns a NEW gear object with `matrix`
// set to a fresh normalized descriptor — the input gear is never mutated.
// Throws on an invalid gear item or an invalid Matrix (callers craft/equip
// known-good data; an invalid socket would silently lose stats otherwise).
export function socketMatrix(gearItem, matrix) {
    if (!gearItem || typeof gearItem !== 'object') {
        throw new Error('socketMatrix: gearItem must be an object');
    }
    const normalized = normalizeMatrix(matrix);
    if (!normalized) {
        throw new Error(`socketMatrix: invalid matrix ${JSON.stringify(matrix)}`);
    }
    return { ...gearItem, matrix: { id: normalized.id, tier: normalized.tier } };
}

// Un-socket a gear item's Matrix. Returns `{ matrix, gear }` where:
//   - `matrix` is the removed Matrix descriptor (null if the socket was empty),
//   - `gear` is a NEW gear object with `matrix` cleared to null.
// The input gear is never mutated.
export function unsocketMatrix(gearItem) {
    if (!gearItem || typeof gearItem !== 'object') {
        throw new Error('unsocketMatrix: gearItem must be an object');
    }
    const removed = getSocketedMatrix(gearItem);
    return {
        matrix: removed,
        gear: { ...gearItem, matrix: null },
    };
}

// Combine Matrices: COMBINE_COUNT (3) of the SAME type + SAME tier fuse into one
// Matrix of tier+1. Returns the new Matrix descriptor `{ id, tier }`, or null
// when the recipe isn't satisfied:
//   - wrong count (not exactly COMBINE_COUNT),
//   - mixed types or mixed tiers,
//   - an unknown / malformed Matrix in the set,
//   - already at MAX_MATRIX_TIER (can't go higher).
export function combineMatrices(matrices) {
    if (!Array.isArray(matrices) || matrices.length !== COMBINE_COUNT) return null;

    const normalized = matrices.map(normalizeMatrix);
    if (normalized.some((m) => m === null)) return null;

    const { id, tier } = normalized[0];
    const allMatch = normalized.every((m) => m.id === id && m.tier === tier);
    if (!allMatch) return null;

    if (tier >= MAX_MATRIX_TIER) return null;

    return { id, tier: tier + 1 };
}

// How many equipped gear pieces carry a socketed Matrix of `matrixId`.
// Pieces with an empty socket / a different Matrix don't count.
export function matrixResonanceCount(equippedGearArray, matrixId) {
    if (!Array.isArray(equippedGearArray)) return 0;
    let count = 0;
    for (const gear of equippedGearArray) {
        const m = getSocketedMatrix(gear);
        if (m && m.id === matrixId) count++;
    }
    return count;
}

// Aggregate the total %-amplifier each stat receives from ALL socketed
// Matrices across the equipped gear set. For every equipped piece with a
// socketed Matrix:
//   1. Pull the per-slot amplifier line(s) for that Matrix+tier+slot
//      (`matrixBonus`, already ×1.5/tier scaled).
//   2. Add the per-type RESONANCE bonus — a flat % per OTHER equipped piece
//      running the same Matrix type (`resonanceBonus(count)`, where count is
//      the TOTAL number of equipped pieces of that type). Resonance amplifies
//      every stat that Matrix's slot line touches.
// Returns a plain map `{ statId: totalPct }` summed across the whole set.
// Reads only — never mutates the gear or the catalog.
export function aggregateMatrixAmp(equippedGearArray) {
    const totals = {};
    if (!Array.isArray(equippedGearArray)) return totals;

    // Resonance counts are per Matrix type, computed once over the whole set.
    const typeCounts = {};
    for (const gear of equippedGearArray) {
        const m = getSocketedMatrix(gear);
        if (m) typeCounts[m.id] = (typeCounts[m.id] || 0) + 1;
    }

    for (const gear of equippedGearArray) {
        const m = getSocketedMatrix(gear);
        if (!m) continue;
        const slot = gear && gear.slot;
        if (!slot) continue;

        const lines = matrixBonus(m.id, slot, m.tier);
        if (!lines.length) continue;

        const resonance = resonanceBonus(typeCounts[m.id] || 0);

        for (const line of lines) {
            const pct = line.pct + resonance;
            totals[line.stat] = (totals[line.stat] || 0) + pct;
        }
    }

    return totals;
}
