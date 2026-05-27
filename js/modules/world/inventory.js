// Phase R8.3 — Inventory-as-meta: equip gear from the persistent stash into
// the 5 gear slots, chosen pre-run in the ARMORY and locked for the run.
//
// Pure helpers operating on a plain `meta`-shaped object
// ({ stash: [...], equippedItems: {slot: item|null} }) so the equip model
// is unit-testable without the DOM. An item lives in exactly ONE place:
// the stash OR an equipped slot (equipping swaps, unequipping returns it).

import { SLOT_ORDER, RARITY_ORDER } from './item-names.js';

const EMPTY_EQUIP = () => ({ cockpit: null, hull: null, shielding: null, chassis: null, nanites: null });

// T44 — rarity rank for sorting (higher index = rarer).
const _RARITY_RANK = Object.fromEntries(RARITY_ORDER.map((r, i) => [r, i]));

/**
 * T44 — pure stash sort. Returns a NEW sorted array (never mutates `items`).
 * Modes: 'recent' (newest first, default), 'rarity' (rarest first), 'score'
 * (best first — pass `{ scoreFn }`), 'slot' (grouped by SLOT_ORDER then rarity).
 * LOCKED items are pinned to the top regardless of mode.
 */
export function sortStash(items, mode = 'recent', { scoreFn = null } = {}) {
    const arr = Array.isArray(items) ? items.slice() : [];
    const rank = (it) => (it && _RARITY_RANK[it.rarity] != null ? _RARITY_RANK[it.rarity] : -1);
    const slotIdx = (it) => { const i = SLOT_ORDER.indexOf(it && it.slot); return i < 0 ? SLOT_ORDER.length : i; };
    const orig = new Map(arr.map((it, i) => [it, i])); // original order: later = newer
    const byRecent = (a, b) => orig.get(b) - orig.get(a);
    let cmp;
    if (mode === 'rarity') {
        cmp = (a, b) => (rank(b) - rank(a)) || byRecent(a, b);
    } else if (mode === 'score' && typeof scoreFn === 'function') {
        cmp = (a, b) => (scoreFn(b) - scoreFn(a)) || (rank(b) - rank(a)) || byRecent(a, b);
    } else if (mode === 'slot') {
        cmp = (a, b) => (slotIdx(a) - slotIdx(b)) || (rank(b) - rank(a)) || byRecent(a, b);
    } else {
        cmp = byRecent;
    }
    return arr.sort((a, b) => {
        const la = (a && a.locked) ? 1 : 0;
        const lb = (b && b.locked) ? 1 : 0;
        if (la !== lb) return lb - la; // locked pinned to top
        return cmp(a, b);
    });
}

/** Normalize meta.equippedItems to a full 5-slot map. */
export function getEquipped(meta) {
    const base = EMPTY_EQUIP();
    const eq = (meta && meta.equippedItems) || {};
    for (const slot of SLOT_ORDER) base[slot] = eq[slot] || null;
    return base;
}

/** The stash items (with original indices) that fit `slot`. */
export function stashForSlot(meta, slot) {
    const stash = (meta && Array.isArray(meta.stash)) ? meta.stash : [];
    const out = [];
    for (let i = 0; i < stash.length; i++) {
        if (stash[i] && stash[i].slot === slot) out.push({ item: stash[i], index: i });
    }
    return out;
}

/**
 * Equip stash[stashIndex] into its slot. Any item already in that slot is
 * returned to the stash. Returns a NEW meta (inputs untouched). No-op (same
 * meta, ok:false) if the index is invalid.
 */
export function equipFromStash(meta, stashIndex) {
    const stash = (meta && Array.isArray(meta.stash)) ? meta.stash.slice() : [];
    const item = stash[stashIndex];
    if (!item || !item.slot) return { ok: false, meta };
    const equipped = getEquipped(meta);
    const prev = equipped[item.slot];
    // Remove the chosen item from the stash; return the displaced item to it.
    stash.splice(stashIndex, 1);
    if (prev) stash.push(prev);
    equipped[item.slot] = item;
    return { ok: true, meta: { ...(meta || {}), stash, equippedItems: equipped } };
}

/** Unequip `slot`, returning its item to the stash. */
export function unequipSlot(meta, slot) {
    const equipped = getEquipped(meta);
    const item = equipped[slot];
    if (!item) return { ok: false, meta };
    const stash = (meta && Array.isArray(meta.stash)) ? meta.stash.slice() : [];
    stash.push(item);
    equipped[slot] = null;
    return { ok: true, meta: { ...(meta || {}), stash, equippedItems: equipped } };
}

/**
 * Score delta from equipping `candidate` into `slot` (vs the current item),
 * using a caller-supplied scoreFn. Positive = upgrade.
 */
export function equipDelta(meta, candidate, scoreFn) {
    if (!candidate || !candidate.slot) return 0;
    const cur = getEquipped(meta)[candidate.slot];
    return Math.round(scoreFn(candidate) - (cur ? scoreFn(cur) : 0));
}
