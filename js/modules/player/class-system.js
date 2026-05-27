// Looter-Economy Pivot — T16: Class system (per-run soft lens).
//
// Mostly-pure helpers that operate on a passed player-like object. A class
// (design §Phase 6) is a SOFT lens, not a gate:
//   - a stat LEAN toward a family of favored SP stats (a +% amplification the
//     gear/stat layer folds into ampPct later, T26),
//   - a UNIQUE MECHANIC hook (mechanicId) — the non-replicable identity, wired
//     by the class mechanic layer later (T33),
//   - a FREE signature ability granted in addition to the open 4-slot pool
//     (it does NOT consume one of the 4 normal ability slots).
//
// This module only STORES the ids + the favored-stat list. The actual mechanic
// behavior and signature-ability registration/activation happen in T33; the
// favored-stat amplification is consumed by the stat layer in T26.

import { classDef } from './classes.js';

// The favored-stat amplification a class grants to each of its favored SP stats.
// A soft lean (+20%) — tune later. Consumed by the stat/gear layer (T26) as a
// term added into ampPct for matching stats.
export const CLASS_STAT_LEAN_PCT = 0.20;

/**
 * Apply a class to a player-like object for the current run.
 *
 * Sets:
 *   player.classId            — the class id (string)
 *   player.classFavoredStats  — array of favored SP-stat ids (a fresh copy)
 *   player.classMechanicId    — the unique-mechanic hook id (wired in T33)
 *   player.signatureAbility    — the free, class-exclusive ability id, stored in a
 *                                DEDICATED field (does NOT touch equippedAbilities)
 *
 * @param {object} player  player-like object to mutate.
 * @param {string} classId class id to apply.
 * @returns {object|null}  the class def, or null (no-op) for an unknown classId.
 */
export function applyClass(player, classId) {
    if (!player) return null;
    const def = classDef(classId);
    if (!def) return null;

    player.classId = def.id;
    // Fresh copy so callers can't mutate the shared catalog array.
    player.classFavoredStats = Array.isArray(def.favoredStats) ? def.favoredStats.slice() : [];
    player.classMechanicId = def.mechanicId;
    // Dedicated free-ability field — intentionally separate from the 4-slot
    // equippedAbilities pool. Activation/registration is T33.
    player.signatureAbility = def.signatureAbilityId;

    return def;
}

/**
 * The class's soft %-lean bonus for a given SP stat.
 *
 * @param {object} player player-like object (reads player.classFavoredStats).
 * @param {string} statId SP-stat id to test.
 * @returns {number} CLASS_STAT_LEAN_PCT if statId is favored, else 0.
 */
export function classStatBonus(player, statId) {
    if (!player || !Array.isArray(player.classFavoredStats)) return 0;
    return player.classFavoredStats.includes(statId) ? CLASS_STAT_LEAN_PCT : 0;
}

/**
 * Reset all class fields on a player (for run reset). Does NOT touch
 * equippedAbilities — the signature ability lived in its own field.
 *
 * @param {object} player player-like object to mutate.
 */
export function clearClass(player) {
    if (!player) return;
    player.classId = null;
    player.classFavoredStats = [];
    player.classMechanicId = null;
    player.signatureAbility = null;
}
