// Looter-Economy Pivot — T05: Matrix catalog (gear augments).
//
// Pure data + lookups, no DOM / globals. Transcribes the design doc
// §2.2 Matrix catalog EXACTLY: 8 archetypes × 5 gear slots, each with a
// per-slot SP-stat amplifier % at tier 1. A Matrix's bonus depends on
// which slot it's socketed in (same Matrix, different stat/strength per
// slot).
//
// Mechanics encoded here (design §2.2):
//   - TIER SCALING: a Matrix's %-bonus scales ×1.5 per tier.
//     tier-1 = table value; tier-N = value × 1.5^(N-1).
//   - COMBINE: 3× Tn → 1× T(n+1) (the upgrade recipe).
//   - RESONANCE: each Matrix gains a bonus per OTHER gear piece running
//     the same Matrix type. The first piece contributes nothing; each
//     matching piece beyond the first adds a flat +3% (see resonanceBonus).
//
// SLOT ids (cockpit/hull/shielding/chassis/nanites) come from
// world/item-names.js (SLOT_ORDER). The `stat` ids reference SP stat ids
// from core/sp-stats.js (SP_STATS[].id) so the amplifier lines up with the
// effective-stat getters that consume it.
//
// NOTE on REGEN: the §2.2 table writes the regen amplifier as "REGEN",
// but the canonical SP stat id is `REGENERATION` (sp-stats.js). We use the
// canonical id `REGENERATION` here so every referenced stat resolves
// against SP_STATS — the table's "REGEN" is shorthand for the same axis.

import { SLOT_ORDER } from './item-names.js';

// Per-tier multiplier: a Matrix's %-bonus grows ×1.5 each tier.
export const MATRIX_TIER_SCALE = 1.5;

// Combine recipe: COMBINE_COUNT of tier N produce one of tier N+1.
export const COMBINE_COUNT = 3;

// Tier ceiling — Matrices cap at T5.
export const MAX_MATRIX_TIER = 5;

// Resonance: flat % added PER matching gear piece BEYOND the first.
// One piece of a family is the baseline (0 bonus); the curve rewards
// committing the build to a family — 2 pieces → +3%, 3 → +6%, 5 → +12%.
export const RESONANCE_PER_PIECE = 3;

// The §2.2 catalog, transcribed exactly. Each entry: matrixId → {
//   id, name, perSlot: { <slot>: [{ stat, pct }, ...] } }.
// Most slots carry a single amplifier; Sanguine's NANITES slot carries
// two (split VAMPIRISM + REGEN), so each slot value is an ARRAY.
export const MATRICES = {
    vital: {
        id: 'vital',
        name: 'Vital',
        perSlot: {
            cockpit:   [{ stat: 'HEALTH', pct: 8 }],
            hull:      [{ stat: 'HEALTH', pct: 12 }],
            shielding: [{ stat: 'HEALTH', pct: 6 }],
            chassis:   [{ stat: 'HEALTH', pct: 6 }],
            nanites:   [{ stat: 'REGENERATION', pct: 10 }],
        },
    },
    aegis: {
        id: 'aegis',
        name: 'Aegis',
        perSlot: {
            cockpit:   [{ stat: 'DODGE', pct: 6 }],
            hull:      [{ stat: 'HEALTH', pct: 8 }],
            shielding: [{ stat: 'TOUGHNESS', pct: 10 }],
            chassis:   [{ stat: 'TOUGHNESS', pct: 8 }],
            nanites:   [{ stat: 'REGENERATION', pct: 8 }],
        },
    },
    predator: {
        id: 'predator',
        name: 'Predator',
        perSlot: {
            cockpit:   [{ stat: 'CRIT_CHANCE', pct: 10 }],
            hull:      [{ stat: 'CRIT_DAMAGE', pct: 12 }],
            shielding: [{ stat: 'CRIT_CHANCE', pct: 5 }],
            chassis:   [{ stat: 'THORNS', pct: 10 }],
            nanites:   [{ stat: 'VAMPIRISM', pct: 8 }],
        },
    },
    reactor: {
        id: 'reactor',
        name: 'Reactor',
        perSlot: {
            cockpit:   [{ stat: 'CAPACITOR', pct: 12 }],
            hull:      [{ stat: 'REACTOR', pct: 12 }],
            shielding: [{ stat: 'EFFICIENCY', pct: 10 }],
            chassis:   [{ stat: 'CAPACITOR', pct: 10 }],
            nanites:   [{ stat: 'REACTOR', pct: 12 }],
        },
    },
    sanguine: {
        id: 'sanguine',
        name: 'Sanguine',
        perSlot: {
            cockpit:   [{ stat: 'VAMPIRISM', pct: 8 }],
            hull:      [{ stat: 'VAMPIRISM', pct: 10 }],
            shielding: [{ stat: 'HEALTH', pct: 8 }],
            chassis:   [{ stat: 'THORNS', pct: 8 }],
            nanites:   [{ stat: 'VAMPIRISM', pct: 6 }, { stat: 'REGENERATION', pct: 6 }],
        },
    },
    velocity: {
        id: 'velocity',
        name: 'Velocity',
        perSlot: {
            cockpit:   [{ stat: 'SPEED', pct: 10 }],
            hull:      [{ stat: 'SPEED', pct: 6 }],
            shielding: [{ stat: 'DODGE', pct: 6 }],
            chassis:   [{ stat: 'SPEED', pct: 8 }],
            nanites:   [{ stat: 'REGENERATION', pct: 8 }],
        },
    },
    thornguard: {
        id: 'thornguard',
        name: 'Thornguard',
        perSlot: {
            cockpit:   [{ stat: 'THORNS', pct: 10 }],
            hull:      [{ stat: 'THORNS', pct: 12 }],
            shielding: [{ stat: 'THORNS', pct: 6 }],
            chassis:   [{ stat: 'THORNS', pct: 14 }],
            nanites:   [{ stat: 'REGENERATION', pct: 6 }],
        },
    },
    evasion: {
        id: 'evasion',
        name: 'Evasion',
        perSlot: {
            cockpit:   [{ stat: 'DODGE', pct: 8 }],
            hull:      [{ stat: 'DODGE', pct: 6 }],
            shielding: [{ stat: 'DODGE', pct: 12 }],
            chassis:   [{ stat: 'TOUGHNESS', pct: 6 }],
            nanites:   [{ stat: 'SPEED', pct: 8 }],
        },
    },
};

// Stable id list (catalog order).
export const MATRIX_ORDER = Object.keys(MATRICES);

// The slots a Matrix can amplify — re-exported from item-names so callers
// can iterate without a second import.
export const MATRIX_SLOTS = SLOT_ORDER;

// Tier scaling factor for a given tier: 1.5^(tier-1). Tier 1 → 1.0.
export function matrixTierFactor(tier = 1) {
    const t = Math.max(1, tier | 0);
    return Math.pow(MATRIX_TIER_SCALE, t - 1);
}

// Per-slot amplifier(s) for a Matrix at a given tier. Returns a fresh
// array of { stat, pct } with `pct` scaled by 1.5^(tier-1). Returns an
// empty array for an unknown matrix or slot (never throws).
export function matrixBonus(matrixId, slot, tier = 1) {
    const matrix = MATRICES[matrixId];
    if (!matrix) return [];
    const lines = matrix.perSlot[slot];
    if (!lines) return [];
    const factor = matrixTierFactor(tier);
    return lines.map((line) => ({ stat: line.stat, pct: line.pct * factor }));
}

// Resonance bonus: a flat % per OTHER gear piece running the same Matrix
// type. `sameTypeCount` is the TOTAL number of equipped pieces of that
// type. The first piece is the baseline (no bonus); each additional piece
// adds RESONANCE_PER_PIECE%. So:
//   count 0 → 0, 1 → 0, 2 → +3%, 3 → +6%, 4 → +9%, 5 → +12%.
// Returns a non-negative number (a % to add on top of the slot bonus).
export function resonanceBonus(sameTypeCount) {
    const n = Math.max(0, sameTypeCount | 0);
    return Math.max(0, n - 1) * RESONANCE_PER_PIECE;
}
