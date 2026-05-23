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
 */
export function salvageValue(item) {
    if (!item) return 0;
    const traits = (item && Array.isArray(item.traits)) ? item.traits.length : 0;
    const lvl = Math.max(1, item.level | 0);
    const base = rarityRank(item) * affixCount(item) * (1 + lvl * 0.1);
    return Math.max(1, Math.round(base) + traits * 3);
}

/** Total Cores from salvaging a list of items. */
export function totalSalvage(items) {
    return (items || []).reduce((sum, it) => sum + salvageValue(it), 0);
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
