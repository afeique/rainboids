// 6.0.0 — Items overhaul:
//   - 5 slots (cockpit, hull, shielding, chassis, nanites — 6.2.2)
//   - Rarity tiers (common / rare / epic) drive primary-stat variance
//     and a visible glow color so the player can spot a good drop at
//     a distance.
//   - Primary stat now ROLLS within a range (was deterministic per
//     level). Epic ≈ 1.85× the band of a common.
//   - Item LEVEL is the wave number the pickup dropped on. Player no
//     longer has a level — wave drives all scaling now.
//   - Trinket primary IS regen (HP/s). HP / toughness items can still
//     roll a small secondary regen affix.
//   - isUpgrade uses a unified score (primary normalized to HP value
//     + 8× regenBonus) so an item's worth is comparable across slots.
//
// Bonus formulas (wave-driven, pre-rarity-multiplier):
//   HP base:        5 + (wave - 1) × 2     →  W1=5, W5=13, W10=23, W20=43, W30=63
//   Toughness base: 3 + (wave - 1) × 0.4   →  W1=3, W5=4.6, W10=6.6, W20=10.6, W30=14.6
//   Regen base:     0.30 + (wave - 1) × 0.05 → W1=0.30, W5=0.50, W10=0.75, W20=1.25, W30=1.75
//
// Rarity multiplier bands:
//   common: 0.85-1.05  rare: 1.00-1.40  epic: 1.35-1.85
//
// Secondary regen affix (HP/tough items only):
//   25% roll chance. Value: 0.20 + (wave - 1) × 0.035 (rounded 1 dp).

import {
    ITEM_BASES, ITEM_PREFIXES,
    SLOT_BONUS_TYPE, SLOT_LABEL, SLOT_ACCENT, SLOT_ORDER,
    RARITY_TIERS, RARITY_ORDER, rollRarity,
    ITEM_AFFIX_POOL, AFFIX_SCORE_WEIGHT,
} from './item-names.js';
import { getItemPassives } from '../combat/passive-data.js';

// P7 — passive-affix delivery on gear. Top-tier gear can carry a rule-modifier
// PASSIVE (a discrete `item.passive` id, not a numeric affix). Modular passives
// roll on Exceptional+; a keystone only on a Transcendental roll (each passive's
// `itemTierMin` gates it). Eligible set is PURE (exported for tests).
const _EXCEPTIONAL_RANK = RARITY_ORDER.indexOf('exceptional');
export function eligibleItemPassives(rarity) {
    const rank = RARITY_ORDER.indexOf(rarity);
    if (rank < _EXCEPTIONAL_RANK) return [];
    return getItemPassives().filter((p) => RARITY_ORDER.indexOf(p.itemTierMin) <= rank);
}
// Roll a passive id for a freshly-created item of `rarity` (or null). Chance
// rises with rarity; Exceptional+ only.
export function rollItemPassive(rarity) {
    const rank = RARITY_ORDER.indexOf(rarity);
    if (rank < _EXCEPTIONAL_RANK) return null;
    const chance = 0.15 + 0.06 * (rank - _EXCEPTIONAL_RANK); // ~15% Exceptional → higher up top
    if (Math.random() >= chance) return null;
    const pool = eligibleItemPassives(rarity);
    if (pool.length === 0) return null;
    return pool[(Math.random() * pool.length) | 0].id;
}

export function getHpBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return 5 + (L - 1) * 2;
}

export function getToughnessBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return Math.round((3 + (L - 1) * 0.4) * 10) / 10;
}

export function getRegenBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    const raw = 0.30 + (L - 1) * 0.05;
    return Math.round(raw * 100) / 100;
}

function _pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

// ITEM-01 — resist affixes are a "better gear" reward, so how many a single
// item may carry is gated by its rarity tier. The TOTAL affix count per item
// is unchanged (still tier.affixCount) — this only constrains the TYPE mix so
// a common can't be a wall of resists. Caps:
//   common      → 0  (no resist affixes at all)
//   rare        → ≤1
//   epic        → ≤2
//   any higher  → ≤3
// (exceptional/legendary sit between rare and epic on the ladder, so they get
//  the rare cap; godlike+ get the top cap.) Pure + exported for unit testing.
const _RESIST_CAP_BY_RANK = {
    common: 0,
    rare: 1,
    exceptional: 1,
    legendary: 2,
    epic: 2,
    godlike: 3,
    divine: 3,
    transcendental: 3,
};
export function maxResistAffixes(rarity) {
    const cap = _RESIST_CAP_BY_RANK[rarity];
    // Unknown rarity → a safe conservative default (treat like common: none).
    return (typeof cap === 'number') ? cap : 0;
}

// ITEM-01 — true for the six per-element `*Resist` affix types (pyroResist,
// cryoResist, voltResist, toxicResist, voidResist, radiantResist) and any
// future element resist that follows the `<element>Resist` convention.
export function isResistAffix(type) {
    return typeof type === 'string' && type.endsWith('Resist');
}

function _rollMult(rarityKey) {
    const tier = RARITY_TIERS[rarityKey] || RARITY_TIERS.common;
    return tier.multMin + Math.random() * (tier.multMax - tier.multMin);
}

const REGEN_AFFIX_CHANCE = 0.25;
function _rollRegenAffix(level) {
    if (Math.random() >= REGEN_AFFIX_CHANCE) return 0;
    const L = Math.max(1, level | 0);
    const raw = 0.20 + (L - 1) * 0.035;
    return Math.round(raw * 10) / 10;
}

/**
 * Generate a fresh item for a given slot at a given wave-level.
 * Optionally accepts a pre-rolled rarity (for boss-biased drops).
 *
 * Returns:
 *   {
 *     slot, level, name, bonus, bonusType,
 *     bonusLabel,    // human-readable label
 *     regenBonus,    // HP/s — primary for trinket, secondary for others
 *     rarity,        // 'common' | 'rare' | 'epic'
 *     rarityColor,   // glow color
 *     accentColor,   // SLOT_ACCENT[slot]
 *   }
 */
// Roll `count` distinct affixes (excluding `excludeTypes`) for a given
// wave-level + rarity. Each value is wave-scaled × an independent rarity-mult
// roll. Extracted (R8.6/R8.8) so reroll + tier-up reuse the same roll logic.
export function rollAffixSet(level, rarity, count, excludeTypes = []) {
    const L = Math.max(1, level | 0);
    const ex = new Set(excludeTypes);
    const pool = ITEM_AFFIX_POOL.filter((d) => !ex.has(d.type));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // ITEM-01 — tier-gate the resist-type mix. Walk the shuffled pool and take
    // affixes until we have `count`, but stop accepting resist affixes once the
    // rarity's resist cap is reached (the remaining resist types are simply
    // skipped — non-resist affixes are unaffected, so the TOTAL count is
    // preserved). `excludeTypes` already in `ex` (e.g. from tier-up) still
    // counts toward the cap if those types were resists, so a tier-up can't
    // exceed the cap by adding to existing resists.
    const want = Math.max(0, count | 0);
    const resistCap = maxResistAffixes(rarity);
    let resistTaken = 0;
    for (const t of ex) if (isResistAffix(t)) resistTaken++;
    const chosen = [];
    for (const def of pool) {
        if (chosen.length >= want) break;
        if (isResistAffix(def.type) && resistTaken >= resistCap) continue;
        chosen.push(def);
        if (isResistAffix(def.type)) resistTaken++;
    }
    return chosen.map((def) => _buildAffixFromDef(def, L, rarity));
}

// Build a single affix `{ type, value, label }` from a pool def at a given
// wave-level + rarity. Shared by rollAffixSet AND applyResistTarget (META-03)
// so the value formula — wave-scaled base × an independent rarity-mult roll,
// then pct/regen/flat rounding + min floor — lives in exactly one place.
function _buildAffixFromDef(def, level, rarity) {
    const L = Math.max(1, level | 0);
    const raw = (def.base + (L - 1) * def.perWave) * _rollMult(rarity);
    const value = def.pct
        ? Math.max(def.min, Math.round(raw * 10) / 10)
        : (def.type === 'regen'
            ? Math.max(def.min, Math.round(raw * 100) / 100)
            : Math.max(def.min, Math.round(raw)));
    return { type: def.type, value, label: def.label(value) };
}

// Build the full item object (name, derived fields, rarity styling) from a
// slot/level/rarity + a pre-rolled affix array.
function _finalizeItem(slot, level, rarity, affixes) {
    if (!ITEM_BASES[slot]) slot = 'cockpit';
    const tier = RARITY_TIERS[rarity] || RARITY_TIERS.common;
    const L = Math.max(1, level | 0);
    const list = Array.isArray(affixes) && affixes.length ? affixes : [{ type: 'hp', value: 1, label: '+1 HP' }];
    const bonusLabel = list.map((a) => a.label).join(' · ');
    const primaryType = list[0].type;
    const def = ITEM_AFFIX_POOL.find((d) => d.type === primaryType);
    const prefix = _pick(ITEM_PREFIXES[(def && def.prefix) || 'hp'] || ITEM_PREFIXES.hp);
    const base   = _pick(ITEM_BASES[slot]);
    const adj = tier.rarityAdjective ? `${tier.rarityAdjective} ` : '';
    const name = `${adj}${prefix} ${base}`;
    const regenBonus = list.filter((a) => a.type === 'regen').reduce((s, a) => s + a.value, 0);
    return {
        slot, level: L, name, affixes: list,
        bonus: list[0].value, bonusType: list[0].type,
        bonusLabel, regenBonus,
        rarity,
        rarityColor: tier.color, rarityLabel: tier.label, rarityGlow: tier.glow,
        accentColor: SLOT_ACCENT[slot] || '#33ddff',
    };
}

export function createItem(slot, level, rarityKey = null) {
    if (!ITEM_BASES[slot]) slot = 'cockpit';
    const rarity = rarityKey || rollRarity();
    const tier = RARITY_TIERS[rarity] || RARITY_TIERS.common;
    const affixes = rollAffixSet(level, rarity, tier.affixCount || 1);
    const item = _finalizeItem(slot, level, rarity, affixes);
    // P7 — top-tier gear may carry a rule-modifier passive.
    const passive = rollItemPassive(rarity);
    if (passive) item.passive = passive;
    return item;
}

// The next rarity up the 8-tier ladder, or null if already at the top.
export function nextRarity(rarity) {
    const i = RARITY_ORDER.indexOf(rarity);
    if (i < 0 || i >= RARITY_ORDER.length - 1) return null;
    return RARITY_ORDER[i + 1];
}

// R8.6 — reroll an item's affixes within its tier bounds (same slot/level/
// rarity → same affix count). Returns a NEW item; preserves traits.
export function rerollItemAffixes(item) {
    if (!item || !item.slot) return item;
    const tier = RARITY_TIERS[item.rarity] || RARITY_TIERS.common;
    const count = tier.affixCount || (Array.isArray(item.affixes) ? item.affixes.length : 1);
    const affixes = rollAffixSet(item.level, item.rarity, count);
    const out = _finalizeItem(item.slot, item.level, item.rarity, affixes);
    if (item.traits) out.traits = item.traits;
    return out;
}

// R8.8 — raise an item one rarity tier, KEEPING its existing affixes and
// rolling the added slot(s) the higher tier grants. Returns the same item
// (unchanged) if already at the top tier.
export function tierUpItem(item) {
    if (!item || !item.slot) return item;
    const next = nextRarity(item.rarity);
    if (!next) return item;
    const oldAffixes = Array.isArray(item.affixes) ? item.affixes.slice() : [];
    const targetCount = (RARITY_TIERS[next].affixCount) || oldAffixes.length;
    const add = Math.max(0, targetCount - oldAffixes.length);
    const extra = rollAffixSet(item.level, next, add, oldAffixes.map((a) => a.type));
    const out = _finalizeItem(item.slot, item.level, next, [...oldAffixes, ...extra]);
    if (item.traits) out.traits = item.traits;
    return out;
}

// META-03 — recompute the affix-derived display/score fields after the
// affix list is mutated in place (without re-randomizing the item's name).
function _refreshDerivedFromAffixes(item) {
    const list = Array.isArray(item.affixes) && item.affixes.length
        ? item.affixes : [{ type: 'hp', value: 1, label: '+1 HP' }];
    item.affixes = list;
    item.bonusLabel = list.map((a) => a.label).join(' · ');
    item.bonus = list[0].value;
    item.bonusType = list[0].type;
    item.regenBonus = list.filter((a) => a.type === 'regen').reduce((s, a) => s + a.value, 0);
    return item;
}

// META-03 — pay Cores to ADD or SWAP a targeted elemental resist on `item`,
// tier-capped by rarity. `element` may be an element id ('PYRO') or already
// lowercased ('pyro'); it's normalized either way. PURE w.r.t. RNG only via
// the shared rarity-mult roll on the new affix value.
//
// Returns one of:
//   { ok:false, reason:'invalid-element' }  — not one of the 6 resistables
//   { ok:false, reason:'duplicate' }        — item already has that resist
//   { ok:false, reason:'tier-locked' }      — cap is 0 (e.g. common)
//   { ok:true, item, mode:'add' }           — replaced a NON-resist affix
//   { ok:true, item, mode:'swap' }          — replaced the oldest resist affix
//
// Invariants: never two resists of the same element; never exceeds
// maxResistAffixes(rarity); ADD/SWAP keep the TOTAL affix count unchanged.
export function applyResistTarget(item, element) {
    if (!item || !Array.isArray(item.affixes)) {
        return { ok: false, reason: 'invalid-element' };
    }
    // Normalize 'PYRO' / 'pyro' / 'Pyro' → 'pyroResist' and validate against
    // the actual resist defs in the pool (so a bogus element is rejected).
    const elKey = String(element || '').toLowerCase();
    const resistType = `${elKey}Resist`;
    const def = ITEM_AFFIX_POOL.find((d) => d.type === resistType && isResistAffix(d.type));
    if (!def) return { ok: false, reason: 'invalid-element' };

    const cap = maxResistAffixes(item.rarity);
    if (cap === 0) return { ok: false, reason: 'tier-locked' };

    // Already carrying this element's resist → nothing to buy.
    if (item.affixes.some((a) => a.type === resistType)) {
        return { ok: false, reason: 'duplicate' };
    }

    const newAffix = _buildAffixFromDef(def, item.level, item.rarity);
    const resistIdx = item.affixes
        .map((a, i) => ({ a, i }))
        .filter((x) => isResistAffix(x.a.type))
        .map((x) => x.i);

    let mode;
    if (resistIdx.length < cap) {
        // ADD — keep TOTAL count stable by REPLACING the first NON-resist
        // affix (deterministic: lowest index). If the item is somehow all
        // resists (and we're under cap), append instead.
        mode = 'add';
        const nonResistIdx = item.affixes.findIndex((a) => !isResistAffix(a.type));
        if (nonResistIdx >= 0) item.affixes[nonResistIdx] = newAffix;
        else item.affixes.push(newAffix);
    } else {
        // SWAP — at cap: replace the FIRST/oldest resist affix (lowest index).
        mode = 'swap';
        item.affixes[resistIdx[0]] = newAffix;
    }

    _refreshDerivedFromAffixes(item);
    return { ok: true, item, mode };
}

// META-04 — pay Cores to REROLL the discrete gear PASSIVE (`item.passive`) on
// an Exceptional+ item. PURE w.r.t. Cores/DOM (the caller spends Cores); only
// randomness is the new-passive pick from eligibleItemPassives(rarity).
//
// Semantics:
//   • TIER-LOCKED — if the item's rarity has NO eligible passive pool (below
//     Exceptional → eligibleItemPassives empty), reject {ok:false,'tier-locked'}.
//   • DIFFERENT-ID PREFERENCE — with ≥2 eligible options, exclude the current
//     `item.passive` from the candidate set so the reroll always LANDS on a
//     different id (a reroll should feel like it did something).
//   • SINGLE-OPTION — if the pool has exactly 1 eligible passive AND the item
//     already carries it, there's nothing else to roll → reject
//     {ok:false,'no-alternatives'} (Cores untouched). If that lone passive is
//     NOT yet on the item, the reroll ADDS it.
//   • ADD-IF-NONE — an eligible item with NO passive yet (rolled null at
//     creation but tier ≥ Exceptional) gets one rolled on. This doubles as
//     "roll a passive onto eligible gear".
//   • Mutates `item.passive` in place and returns { ok:true, item, from, to }.
export function rerollItemPassive(item) {
    if (!item) return { ok: false, reason: 'tier-locked' };
    const pool = eligibleItemPassives(item.rarity);
    if (pool.length === 0) return { ok: false, reason: 'tier-locked' };

    const from = item.passive || null;
    // Prefer a DIFFERENT id when alternatives exist; only fall back to the full
    // pool when the current passive is the sole eligible option.
    let candidates = pool.filter((p) => p.id !== from);
    if (candidates.length === 0) {
        // The lone eligible passive is already on the item → nothing to change.
        return { ok: false, reason: 'no-alternatives' };
    }
    const to = candidates[(Math.random() * candidates.length) | 0].id;
    item.passive = to;
    return { ok: true, item, from, to };
}

/**
 * Unified score for cross-rarity / cross-affix comparison.
 *   hp:        1 HP = 1 pt
 *   toughness: 1% DEF = 8 pts (a 5% reduction stat ≈ +40 effective HP)
 *   regen:     1 HP/s = 16 pts (regen compounds; weight higher)
 * Secondary regenBonus on HP/tough items adds 8× per HP/s.
 */
export function scoreItem(item) {
    if (!item) return 0;
    // 6.32.0 — Sum every affix's weighted value (normalized to an
    // "effective HP" scale via AFFIX_SCORE_WEIGHT).
    if (Array.isArray(item.affixes)) {
        let s = 0;
        for (const a of item.affixes) {
            s += (a.value || 0) * (AFFIX_SCORE_WEIGHT[a.type] || 1);
        }
        return s;
    }
    // Legacy single-bonus fallback.
    let s = 0;
    if (item.bonusType === 'hp')        s += item.bonus || 0;
    else if (item.bonusType === 'toughness') s += (item.bonus || 0) * 8;
    else if (item.bonusType === 'regen')     s += (item.bonus || 0) * 16;
    if (item.bonusType !== 'regen' && item.regenBonus) s += item.regenBonus * 8;
    return s;
}

/**
 * Strict-dominant upgrade check. New item must beat the current item's
 * score to replace it. Empty slot → any item wins.
 */
export function isUpgrade(current, candidate) {
    if (!candidate) return false;
    if (!current) return true;
    return scoreItem(candidate) > scoreItem(current);
}

// Re-exports for convenience.
export {
    SLOT_ORDER, SLOT_LABEL, SLOT_ACCENT, SLOT_BONUS_TYPE,
    RARITY_TIERS, RARITY_ORDER,
};
