// Phase R8 — Cores: the item-crafting currency earned by salvaging gear.
//
// Pure helpers (no DOM) so the salvage economy is unit-testable in
// isolation. The persistent stash (meta.stash) holds plain item objects
// from item-system.createItem (already JSON-serializable); salvaging an
// item grants Cores by rarity × level × affix-count and removes it.

// 8-tier rarity ladder → numeric rank (drives salvage value + bulk gates).
export const RARITY_RANK = {
    common: 1, rare: 2, exceptional: 3, legendary: 4,
    epic: 5, godlike: 6, divine: 7, transcendental: 8,
};

export function rarityRank(item) {
    if (!item) return 1;
    return RARITY_RANK[item.rarity] || 1;
}

export function affixCount(item) {
    if (item && Array.isArray(item.affixes)) return Math.max(1, item.affixes.length);
    return 1;
}

/**
 * Cores granted by salvaging one item: rarity-rank × affix-count, scaled
 * up gently by item level. Floored at 1 so even a common L1 is worth
 * something. Traited items (C.I3*) add a flat bonus per trait (R8.9).
 *
 * RUN-03 — optional `rewardMult` (the Reward Dial factor) scales the Cores
 * granted. DEFAULTS TO 1.0 so every existing call site is byte-for-byte
 * unchanged; richer runs (wps ≥ 6) pass the rewardMultiplier() factor to
 * grant more Cores per salvage. Multiplied in BEFORE the final round so the
 * dial nudges the floored integer result.
 */
export function salvageValue(item, rewardMult = 1.0) {
    if (!item) return 0;
    const traits = (item && Array.isArray(item.traits)) ? item.traits.length : 0;
    const lvl = Math.max(1, item.level | 0);
    const mult = (typeof rewardMult === 'number' && isFinite(rewardMult) && rewardMult > 0) ? rewardMult : 1.0;
    const base = rarityRank(item) * affixCount(item) * (1 + lvl * 0.1) * mult;
    return Math.max(1, Math.round(base) + traits * 3);
}

/** Total Cores from salvaging a list of items. */
export function totalSalvage(items) {
    return (items || []).reduce((sum, it) => sum + salvageValue(it), 0);
}

// ── Cores SINK costs (R8.6 / R8.8) ──────────────────────────────────────
// Reroll an item's affixes within tier bounds. Scales with rarity so a
// transcendental reroll is a serious commitment.
export function rerollCost(item) {
    return Math.max(2, rarityRank(item) * 3);
}

// Tier-up cost scales with the TARGET tier (rank+1), so each step up the
// 8-tier ladder is steeper than the last. Returns Infinity at max tier.
export function tierUpCost(item) {
    const rank = rarityRank(item);
    if (rank >= 8) return Infinity; // transcendental — no higher tier
    return (rank + 1) * 12;
}

export function canAffordReroll(item, cores) { return (cores | 0) >= rerollCost(item); }
export function canAffordTierUp(item, cores) {
    const c = tierUpCost(item);
    return c !== Infinity && (cores | 0) >= c;
}

// META-03 — Cores cost to ADD or SWAP a targeted elemental resist on an item.
// Targeting a specific resist is a premium operation (you pick the exact
// element you want), so it sits ABOVE a blind reroll but BELOW a full tier-up:
//   resistTargetCost = rarityRank × 4 + level (floored at 4)
// A common-L1 ≈ 5, a transcendental-L30 ≈ 62 — same ballpark as reroll
// (rank×3) / tier-up ((rank+1)×12), scaling with both rarity and the item's
// wave-level (so deeper-run gear costs more to retune).
export function resistTargetCost(item) {
    const lvl = item ? Math.max(1, item.level | 0) : 1;
    return Math.max(4, rarityRank(item) * 4 + lvl);
}

export function canAffordResistTarget(item, cores) {
    return (cores | 0) >= resistTargetCost(item);
}

/**
 * Bulk-salvage filter: items strictly worse (by score) than the best
 * equipped item in their slot are safe to mass-salvage. `equippedBySlot`
 * maps slot → equipped item (or null). `scoreFn` scores an item.
 * Returns { keep, salvage } partition of `stash`.
 */
export function partitionBulkSalvage(stash, equippedBySlot, scoreFn) {
    const keep = [];
    const salvage = [];
    for (const it of (stash || [])) {
        const eq = equippedBySlot ? equippedBySlot[it.slot] : null;
        const below = eq && scoreFn(it) < scoreFn(eq);
        if (below) salvage.push(it); else keep.push(it);
    }
    return { keep, salvage };
}
