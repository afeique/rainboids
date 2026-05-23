// Phase R2 — Armory economy: gold banking + permanent unlocks.
//
// The roguelite model splits gold into two pools:
//   • run-gold  (game.money)   — starts at 0 each run, accrues from kills,
//                                spent on the in-run shop / card sinks, and
//                                BANKED into account-gold at run end.
//   • account-gold (meta)      — the persistent wallet; spent in the ARMORY
//                                on permanent weapon/ability UNLOCKS.
//
// These helpers are PURE (operate on plain meta/objects, no DOM) so the
// economy is unit-testable in isolation. game-engine.js wires them to the
// live run + the rainboidsMeta store.

// Always-available loadout — never costs gold, never appears in the store.
// R6.2 base kit: Bulwark + Field Medic from run one (Phase Dash is the free
// SHIFT movement primitive, not a 4-slot ability).
export const BASE_LOADOUT = {
    primaries: ['PULSE_CANNON'],
    powers:    ['CHARGE_SHOT'],
    abilities: ['BULWARK', 'FIELD_MEDIC'],
};

// Per-category meta key + base set + unlock price. Abilities are priced
// higher than weapons so the early game stays weapon-led (design §4).
export const UNLOCK_CATEGORIES = {
    primaries: { metaKey: 'unlockedPrimaries', base: BASE_LOADOUT.primaries, cost: 1200 },
    powers:    { metaKey: 'unlockedPowers',    base: BASE_LOADOUT.powers,    cost: 2000 },
    abilities: { metaKey: 'unlockedAbilities', base: BASE_LOADOUT.abilities, cost: 3500 },
};

/** Cost in account-gold to unlock one item of a category. */
export function unlockCost(category) {
    const c = UNLOCK_CATEGORIES[category];
    return c ? c.cost : 0;
}

/** The set of ids the player can equip in `category`: base ∪ purchased. */
export function getUnlockedSet(category, meta) {
    const c = UNLOCK_CATEGORIES[category];
    if (!c) return new Set();
    const purchased = (meta && Array.isArray(meta[c.metaKey])) ? meta[c.metaKey] : [];
    return new Set([...c.base, ...purchased]);
}

/** True when `id` is already owned (base or purchased) in `category`. */
export function isUnlocked(category, id, meta) {
    return getUnlockedSet(category, meta).has(id);
}

/**
 * Ids in `category` that are NOT yet unlocked, i.e. the store offerings.
 * `allIds` is the full id list for the category (Object.keys of the def map).
 */
export function getLockedIds(category, allIds, meta) {
    const owned = getUnlockedSet(category, meta);
    return (allIds || []).filter((id) => !owned.has(id));
}

/**
 * Can the player afford to unlock `id`? Returns { ok, reason, cost }.
 */
export function canUnlock(category, id, meta, accountGold) {
    if (!UNLOCK_CATEGORIES[category]) return { ok: false, reason: 'bad-category', cost: 0 };
    const cost = unlockCost(category);
    if (isUnlocked(category, id, meta)) return { ok: false, reason: 'owned', cost };
    if ((accountGold | 0) < cost) return { ok: false, reason: 'poor', cost };
    return { ok: true, reason: 'ok', cost };
}

/**
 * Pure unlock application. Returns a NEW { meta, accountGold } with the id
 * added to the category's purchased list and the cost deducted — or the
 * unchanged inputs (and ok:false) when it can't be afforded / is owned.
 */
export function applyUnlock(category, id, meta, accountGold) {
    const check = canUnlock(category, id, meta, accountGold);
    if (!check.ok) return { ok: false, reason: check.reason, meta, accountGold };
    const c = UNLOCK_CATEGORIES[category];
    const cur = (meta && Array.isArray(meta[c.metaKey])) ? meta[c.metaKey] : [];
    const nextMeta = { ...(meta || {}), [c.metaKey]: [...cur, id] };
    return { ok: true, reason: 'ok', meta: nextMeta, accountGold: (accountGold | 0) - check.cost };
}

/** Bank a run's leftover run-gold into the account wallet. */
export function bankRunGold(accountGold, runGold) {
    return Math.max(0, (accountGold | 0)) + Math.max(0, (runGold | 0));
}

/**
 * Resolve the persistent account-gold from a meta blob, migrating the
 * pre-R2 single `money` wallet into `accountGold` on first read.
 */
export function resolveAccountGold(meta) {
    if (!meta) return 0;
    if (typeof meta.accountGold === 'number') return Math.max(0, meta.accountGold | 0);
    if (typeof meta.money === 'number') return Math.max(0, meta.money | 0); // legacy migration
    return 0;
}
