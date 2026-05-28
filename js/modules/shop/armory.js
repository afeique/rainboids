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
// 6.x — Pulse Cannon + Charge Shot ONLY. Abilities are now purchase-locked so
// the early game is a focused shooting experience; the player's FIRST ability
// is granted by the milestone gift on the first Stage-1 clear (game-engine),
// after which more abilities are bought with account-gold. (Phase Dash is the
// free SHIFT movement primitive, not a 4-slot ability.)
export const BASE_LOADOUT = {
    primaries: ['PULSE_CANNON'],
    powers:    ['CHARGE_SHOT'],
    abilities: [],
};

// Per-category meta key + base set + unlock price. Abilities are priced
// higher than weapons so the early game stays weapon-led (design §4).
export const UNLOCK_CATEGORIES = {
    // 6.x — FLAT pricing: every weapon AND every ability costs the same 10k so
    // unlocks never feel "cheap" later in a run (the gold economy is flat +
    // decoupled from level/gear, so 10k always costs the same number of kills).
    // Attunements stay cheaper than a whole weapon (they're tuning, not new
    // tools). 100% resell (game-engine) lets the player experiment freely.
    primaries: { metaKey: 'unlockedPrimaries', base: BASE_LOADOUT.primaries, cost: 10000 },
    powers:    { metaKey: 'unlockedPowers',    base: BASE_LOADOUT.powers,    cost: 10000 },
    abilities: { metaKey: 'unlockedAbilities', base: BASE_LOADOUT.abilities, cost: 10000 },
    // Per-weapon Attunements (element upgrades). Flat cost for now; finer
    // per-attunement (signature vs exotic) tuning is a later pass.
    attunements: { metaKey: 'unlockedAttunements', base: [], cost: 7000 },
    // Per-weapon Mechanic Mods (pierce/explode/home/stun/knock + capstones).
    mods: { metaKey: 'unlockedMods', base: [], cost: 5000 },
    // W6 — per-ability Attunements (one element per ability, element-flavored).
    abilityAttunements: { metaKey: 'unlockedAbilityAttunements', base: [], cost: 6000 },
    // Phase P — rule-modifier Passives (3 equip slots, swappable mid-run).
    // 8.20.0 — ALL passives now start LOCKED: a fresh account owns none. They're
    // awarded DURING a run (level-up unlocks; keystone TRAITS are picked at L10/
    // L20), so there are no base starters to seed here.
    passives: { metaKey: 'unlockedPassives', base: [], cost: 9000 },
};

// ── New-account starter grant ──────────────────────────────────────────────
// 6.x — The early-engagement starter grant was REMOVED. A brand-new account
// now starts with ZERO account-gold and ONLY the base kit (Pulse + Charge) —
// everything else is earned + purchased. Run 1 is a deliberately simple
// shooting experience; the first ability arrives via the Stage-1 milestone
// gift. Kept as named exports (value 0 / empty) for back-compat with callers.
export const STARTER_ACCOUNT_GOLD = 0;
export const STARTER_UNLOCKS = {};

/**
 * The one-time meta blob seeded for a brand-new account (no meta yet). Callers
 * MUST gate on `!loadMeta()` so an existing player is never re-seeded.
 */
export function newAccountSeed() {
    return { accountGold: STARTER_ACCOUNT_GOLD, ...STARTER_UNLOCKS };
}

/** Cost in account-gold to unlock one item of a category. */
export function unlockCost(category) {
    const c = UNLOCK_CATEGORIES[category];
    return c ? c.cost : 0;
}

// Debug "unlock all" hook. Kept INJECTABLE so this module stays pure +
// dependency-free (and unit-tests see the real behavior). game-engine.js wires
// real resolvers in debug mode; absent injection, getUnlockedSet is unchanged.
let _debugUnlockAllResolver = null; // (category) => boolean
let _debugAllIdsResolver = null;    // (category) => string[]
export function setDebugUnlockResolvers(unlockAllFn, allIdsFn) {
    _debugUnlockAllResolver = (typeof unlockAllFn === 'function') ? unlockAllFn : null;
    _debugAllIdsResolver = (typeof allIdsFn === 'function') ? allIdsFn : null;
}

// 8.x looter pivot (T20) — EVERYTHING IS UNLOCKED. The game-engine flips this on
// at boot, so getUnlockedSet returns the full id list (via the injected allIds
// resolver) regardless of `meta`. Kept as a runtime flag (not baked into the
// pure base+purchased logic) so the unit tests keep exercising the real
// base/purchased behavior; absent the flag + resolver, getUnlockedSet is unchanged.
let _allUnlocked = false;
export function setAllUnlocked(on) { _allUnlocked = !!on; }
export function isAllUnlocked() { return _allUnlocked; }

// 8.x — categories that stay GOLD-GATED even under the looter-pivot "everything
// unlocked" flag. The pivot frees gear/weapons/powers (power is looted, not
// bought), but ABILITIES and PASSIVES are EXCLUDED so a fresh account owns
// NEITHER — both are acquired specifically during a run (8.20.0: passives +
// keystone TRAITS are awarded by leveling, not free from the all-unlock pivot).
// The DEBUG unlock-all resolver still covers them so dev/testing can grant them.
const GOLD_GATED_CATEGORIES = new Set(['abilities', 'passives']);

/** The set of ids the player can equip in `category`: base ∪ purchased
 *  (∪ everything, when all-unlocked or a debug "unlock all" covers the category).
 *  Gold-gated categories (abilities) ignore the looter-pivot all-unlocked flag
 *  but still honor the debug unlock-all resolver. */
export function getUnlockedSet(category, meta) {
    const c = UNLOCK_CATEGORIES[category];
    if (!c) return new Set();
    const pivotCovers = _allUnlocked && !GOLD_GATED_CATEGORIES.has(category);
    const everything = pivotCovers || (_debugUnlockAllResolver && _debugUnlockAllResolver(category));
    if (everything && _debugAllIdsResolver) {
        return new Set([...c.base, ...(_debugAllIdsResolver(category) || [])]);
    }
    const purchased = (meta && Array.isArray(meta[c.metaKey])) ? meta[c.metaKey] : [];
    return new Set([...c.base, ...purchased]);
}

// Phase R5 — the per-run loadout: ≤4 chosen ids per category, all from the
// unlocked pool. Locked once the run starts.
export const LOADOUT_SLOTS = 4;

/** Toggle `id` in a selection list, capped at `max`. Returns a NEW array. */
export function toggleSelection(list, id, max = LOADOUT_SLOTS) {
    const cur = Array.isArray(list) ? list.slice() : [];
    const at = cur.indexOf(id);
    if (at !== -1) { cur.splice(at, 1); return cur; }
    if (cur.length >= max) return cur; // at cap — ignore
    cur.push(id);
    return cur;
}

/**
 * Normalize a chosen loadout against the unlocked pool: keep only unlocked
 * ids, dedupe, clamp to LOADOUT_SLOTS, and guarantee ≥1 per category (falling
 * back to the first unlocked id). Returns { primaries, powers, abilities }.
 */
export function normalizeLoadout(chosen, meta) {
    const out = {};
    for (const category of Object.keys(UNLOCK_CATEGORIES)) {
        const unlocked = getUnlockedSet(category, meta);
        const picked = (chosen && Array.isArray(chosen[category])) ? chosen[category] : [];
        const seen = new Set();
        const list = [];
        for (const id of picked) {
            if (unlocked.has(id) && !seen.has(id) && list.length < LOADOUT_SLOTS) {
                seen.add(id); list.push(id);
            }
        }
        if (list.length === 0) {
            const first = [...unlocked][0];
            if (first) list.push(first);
        }
        out[category] = list;
    }
    return out;
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

/**
 * Pure resell. Removes `id` from the category's purchased list and refunds the
 * FULL unlock cost (100% — single-player; the point is free experimentation,
 * so swapping costs nothing beyond having earned the gold once). Base-kit ids
 * and not-owned ids are no-ops. Returns a NEW { ok, reason, meta, accountGold, refund }.
 */
export function applyResell(category, id, meta, accountGold) {
    const c = UNLOCK_CATEGORIES[category];
    if (!c) return { ok: false, reason: 'bad-category', meta, accountGold, refund: 0 };
    if (c.base.includes(id)) return { ok: false, reason: 'base', meta, accountGold, refund: 0 };
    const cur = (meta && Array.isArray(meta[c.metaKey])) ? meta[c.metaKey] : [];
    if (!cur.includes(id)) return { ok: false, reason: 'not-owned', meta, accountGold, refund: 0 };
    const refund = unlockCost(category); // 100% refund
    const nextMeta = { ...(meta || {}), [c.metaKey]: cur.filter((x) => x !== id) };
    return { ok: true, reason: 'ok', meta: nextMeta, accountGold: (accountGold | 0) + refund, refund };
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
