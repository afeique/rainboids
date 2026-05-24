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
    // W7 — costs dialed way up (per the design intent): unlocks are long-term
    // meta-progression goals, not pocket change. Hierarchy preserved
    // (abilities > powers > primaries). A weapon now costs more than a single
    // attunement/mod, so the weapon is the headline commitment and tuning it is
    // the follow-up investment.
    primaries: { metaKey: 'unlockedPrimaries', base: BASE_LOADOUT.primaries, cost: 8000 },
    powers:    { metaKey: 'unlockedPowers',    base: BASE_LOADOUT.powers,    cost: 10000 },
    abilities: { metaKey: 'unlockedAbilities', base: BASE_LOADOUT.abilities, cost: 12000 },
    // Per-weapon Attunements (element upgrades). Flat cost for now; finer
    // per-attunement (signature vs exotic) tuning is a later pass.
    attunements: { metaKey: 'unlockedAttunements', base: [], cost: 7000 },
    // Per-weapon Mechanic Mods (pierce/explode/home/stun/knock + capstones).
    mods: { metaKey: 'unlockedMods', base: [], cost: 5000 },
    // W6 — per-ability Attunements (one element per ability, element-flavored).
    abilityAttunements: { metaKey: 'unlockedAbilityAttunements', base: [], cost: 6000 },
    // Phase P — rule-modifier Passives (gold-bought, 3 equip slots, swappable
    // mid-run). Priced between mods and abilities (design §4.2). Two safe,
    // no-downside modular starters are owned from the start.
    passives: { metaKey: 'unlockedPassives', base: ['OPPORTUNIST', 'LAST_BASTION'], cost: 9000 },
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
