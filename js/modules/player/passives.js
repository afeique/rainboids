// player/passives.js — Phase P2: the player-side PASSIVES state + apply
// pipeline. Mirrors the 4-slot ability model. All functions are bound to the
// Player via `.call(this)` (see the thin wrappers in player.js).
//
// State (owned on the Player, initialized in its constructor):
//   equippedPassives[5]   — passive id per slot (0..4), or null (5 = hard cap)
//   ownedPassives: Set     — ids this run may equip (seeded from meta unlocks)
//   activePassives: Set     — equipped ∩ owned within unlocked slots (queried)
//   passiveSlotsUnlocked    — usable slot count (1..5; opens over a run in P3)
//   _passiveRampState: Map  — per-passive accrual for ramping passives (P5/P6),
//                             reset whenever a slot's occupant changes (anti-cheese)
//
// Consumers (P6) query `hasPassive(id)` at their hook site, or read
// `getPassiveMod(key)` for additive numeric passives (folded into getEffective*).

import { PASSIVES } from '../combat/passive-data.js';

// Round-3 §11.A — at most this many EQUIPPED slots may hold build-defining
// keystones (the rest take modular passives). Start tight; loosen from
// playtest. A Transcendental gear keystone (P7) is exempt — it isn't slotted.
export const KEYSTONE_BUDGET = 2;

/** Is `id` a build-defining keystone passive? */
export function isKeystonePassive(id) {
    const def = PASSIVES[id];
    return !!(def && Array.isArray(def.tags) && def.tags.includes('keystone'));
}

/**
 * Recompute activePassives from TWO sources (design §3 — passives are acquired
 * via equip slots AND gear rolls):
 *   1. equip slots — a slot contributes iff within the unlocked slot count and
 *      holding a known + owned passive (P2–P5).
 *   2. gear (P7) — a passive AFFIX on an equipped item contributes WITHOUT
 *      consuming a slot. The Set unions them, so a passive present from both a
 *      slot and gear is just ON once ("binary = no double", §10 stacking).
 * Idempotent; call after any change to equipped slots / owned / slot-count /
 * equipped gear.
 */
export function _rebuildActivePassives() {
    const active = new Set();
    const slots = Array.isArray(this.equippedPassives) ? this.equippedPassives : [];
    const owned = this.ownedPassives instanceof Set ? this.ownedPassives : new Set();
    const n = Math.max(0, Math.min(this.passiveSlotsUnlocked | 0, slots.length));
    for (let i = 0; i < n; i++) {
        const id = slots[i];
        if (id && owned.has(id) && PASSIVES[id]) active.add(id);
    }
    // P7 — gear-borne passives (an equipped item's `.passive` affix).
    if (this.equippedItems && typeof this.equippedItems === 'object') {
        for (const slot of Object.keys(this.equippedItems)) {
            const it = this.equippedItems[slot];
            if (it && it.passive && PASSIVES[it.passive]) active.add(it.passive);
        }
    }
    this.activePassives = active;
    return active;
}

/** Is passive `id` currently active (equipped in an unlocked slot + owned)? */
export function hasPassive(id) {
    return !!(this.activePassives && this.activePassives.has(id));
}

/**
 * Additive aggregator over the active passives' optional numeric `mods` map.
 * A passive entry MAY declare `mods: { <key>: number }` (added in P6 as numeric
 * passives gain consumers); this sums the contributions for `key`. Returns 0
 * when nothing contributes — so folding it into a getEffective* getter is a
 * no-op until a passive actually carries that key.
 */
export function getPassiveMod(key) {
    if (!this.activePassives || this.activePassives.size === 0) return 0;
    let total = 0;
    for (const id of this.activePassives) {
        const mods = PASSIVES[id] && PASSIVES[id].mods;
        if (mods && typeof mods[key] === 'number') total += mods[key];
    }
    return total;
}

// P6 — product of a static multiplier field (e.g. `damageMult`, `maxHpMult`)
// across the active passives. Defaults to 1 (no active contributor).
export function getPassiveMult(field) {
    if (!this.activePassives || this.activePassives.size === 0) return 1;
    let mult = 1;
    for (const id of this.activePassives) {
        const v = PASSIVES[id] && PASSIVES[id][field];
        if (typeof v === 'number') mult *= v;
    }
    return mult;
}

/**
 * Global outgoing-damage multiplier from active passives.
 *
 * Starts from the static `damageMult` product (Glass Cannon no longer
 * contributes a static field). §6c — Glass Cannon (merged with Berserker's
 * Pact) is a pure-upside HP-scaling keystone: +40% damage at full HP ramping
 * to +90% at 0 HP. That can't be a static field (it's HP-aware), so it's
 * applied on top here. Default-safe: without GLASS_CANNON this is byte-for-byte
 * the existing static product.
 */
export function getPassiveDamageMult() {
    let mult = getPassiveMult.call(this, 'damageMult');
    if (this.activePassives && this.activePassives.has('GLASS_CANNON')) {
        const maxHp = (typeof this.getEffectiveMaxHealth === 'function')
            ? this.getEffectiveMaxHealth() : (this.maxHealth || 1);
        const hpFrac = Math.max(0, Math.min(1, (this.health || 0) / (maxHp || 1)));
        mult *= 1.4 + 0.5 * (1 - hpFrac); // +40% at full HP → +90% at 0 HP
    }
    return mult;
}

/** Max-HP multiplier from active passives (a passive's static `maxHpMult` field). */
export function getPassiveMaxHpMult() { return getPassiveMult.call(this, 'maxHpMult'); }

/**
 * Equip `id` (or null to clear) into `slot` (0..2). Rejects locked slots and
 * un-owned / non-slot-deliverable ids. A passive can't occupy two slots — if
 * it's already elsewhere, that slot is cleared. Ramp accrual for any passive
 * leaving or entering the slot is reset (swap anti-cheese, P5). Rebuilds
 * activePassives. Returns true on a successful (validated) change.
 */
export function equipPassive(slot, id) {
    const slots = this.equippedPassives;
    if (!Array.isArray(slots) || slot < 0 || slot >= slots.length) return false;
    if (slot >= (this.passiveSlotsUnlocked | 0)) return false; // slot still locked
    if (id != null) {
        const def = PASSIVES[id];
        if (!def || !def.slot) return false;                 // unknown / not slot-deliverable
        if (!(this.ownedPassives instanceof Set) || !this.ownedPassives.has(id)) return false; // not owned
        const at = slots.indexOf(id);
        if (at !== -1 && at !== slot) {                       // already equipped elsewhere → move it
            slots[at] = null;
            if (this._passiveRampState) this._passiveRampState.delete(id);
        }
        // Keystone budget — count keystones already equipped in OTHER slots; a
        // new keystone is rejected once the budget is full (modular always ok).
        if (isKeystonePassive(id)) {
            let keystones = 0;
            for (let i = 0; i < slots.length; i++) {
                if (i !== slot && slots[i] && isKeystonePassive(slots[i])) keystones++;
            }
            if (keystones >= KEYSTONE_BUDGET) return false;
        }
    }
    const prev = slots[slot];
    if (prev === id) return true; // no-op
    slots[slot] = id;
    if (this._passiveRampState) {
        if (prev) this._passiveRampState.delete(prev);
        if (id) this._passiveRampState.delete(id);
    }
    _rebuildActivePassives.call(this);
    return true;
}

// 8.24.0 — Spend a keystone pick (earned at L10/L20) to claim a keystone TRAIT:
// own it + auto-equip into a free unlocked slot (equipPassive enforces the
// keystone budget). Returns true on success, false if no pick / not a keystone
// / already owned.
export function claimKeystone(id) {
    if ((this.keystonePicksAvailable | 0) <= 0) return false;
    if (!isKeystonePassive(id)) return false;
    if (!(this.ownedPassives instanceof Set)) this.ownedPassives = new Set(this.ownedPassives || []);
    if (this.ownedPassives.has(id)) return false;
    this.ownedPassives.add(id);
    const unlocked = this.passiveSlotsUnlocked | 0;
    for (let i = 0; i < unlocked; i++) {
        if (!this.equippedPassives[i] && equipPassive.call(this, i, id)) break;
    }
    this.keystonePicksAvailable = Math.max(0, (this.keystonePicksAvailable | 0) - 1);
    return true;
}

/** Replace the owned-passive pool (seeded from meta unlocks at run init). */
export function setOwnedPassives(ids) {
    this.ownedPassives = new Set(
        Array.isArray(ids) ? ids : (ids && typeof ids[Symbol.iterator] === 'function' ? [...ids] : []),
    );
    _rebuildActivePassives.call(this);
}

/** Set how many passive slots are usable (1..3). Rebuilds active set (P3). */
export function setPassiveSlotsUnlocked(n) {
    const max = Array.isArray(this.equippedPassives) ? this.equippedPassives.length : 3;
    this.passiveSlotsUnlocked = Math.max(0, Math.min(n | 0, max));
    _rebuildActivePassives.call(this);
}
