// crafting.js — Looter-Economy Pivot (T13), the pure crafting engine.
//
// The Fabricator's verbs, expressed as pure functions over (inputs, rainshards).
// Every verb takes the player's CURRENT `rainshards` (the R$ wallet) and returns
// a uniform result envelope:
//
//   { ok, item?, matrix?, rainshards, refund?, reason? }
//
//   - ok        : true on success, false on a no-op (e.g. can't afford it).
//   - rainshards: the wallet AFTER the verb (unchanged on a no-op).
//   - item      : the NEW item object produced/modified (fabricate/reroll/upgrade).
//   - matrix    : the combined Matrix descriptor (combineMatrices only).
//   - refund    : the R$ added back (salvage only).
//   - reason    : on a no-op — 'poor' (insufficient R$) or a structural reason.
//
// NEVER throws — bad inputs / insufficient funds return `{ ok:false, reason, rainshards }`
// with the wallet untouched. Randomness is INJECTED via an `rng` (a `() => number`
// in [0,1)) so callers seed it: drops pass `Math.random`, tests pass a stub.
//
// IMMUTABILITY: verbs that modify an item return a NEW item object (the input is
// never mutated) — including the `_rerolls` escalation counter, which lives on
// the returned item (rerollTrait increments it; upgradeTier resets it to 0).
//
// "NARROW TYPES, NEVER VALUES" (design §6.2–6.4): the reroll modes narrow the
// TYPE of a trait/affix to varying degrees but the VALUE always re-rolls:
//   - Reroll    — new random type + new value.
//   - Calibrate — keep the existing type, reroll the VALUE only (perfection sink).
//   - Target    — force a requested type, value still rolls.
//
// Deps: crafting-costs (T02) for every R$ price; weapon-gen (T10) / gear-gen (T11)
// for the rollers; matrix-system (T12) for Combine; item-templates (T06) for the
// rarity ladder (upgradeTier's +1 tier / +1 slot / widened band); weapon-traits
// (T04) for the trait pools (weapon trait reroll).

import {
    RARITY_ORDER,
    fabricateCost,
    rerollCost,
    upgradeCost,
    combineCost,
    salvageRefund,
} from './crafting-costs.js';
import { rollWeapon } from '../combat/weapon-gen.js';
import { rollGear } from '../world/gear-gen.js';
import { combineMatrices as combineMatricesData } from '../world/matrix-system.js';
import { RARITY_LADDER } from '../world/item-templates.js';
import {
    WEAPON_TRAITS,
    rollableTraitsFor,
} from '../combat/weapon-traits.js';

// ---------------------------------------------------------------------------
// Rarity normalization.
//
// crafting-costs keys by the CAPITALIZED display rarity ('Common'..). The
// rollers emit/accept lowercase ids ('common'..) or 1-based tier numbers.
// Normalize anything to the capitalized RARITY_ORDER form for cost lookups,
// and expose the 0-based index for ladder math.
// ---------------------------------------------------------------------------
const _RARITY_BY_LOWER = Object.fromEntries(
    RARITY_ORDER.map((r) => [r.toLowerCase(), r]),
);

// → capitalized rarity name, or null if unrecognized.
function canonicalRarity(rarity) {
    if (typeof rarity === 'number') {
        const i = Math.round(rarity) - 1; // 1-based tier → 0-based index
        return RARITY_ORDER[i] || null;
    }
    if (typeof rarity === 'string') {
        return _RARITY_BY_LOWER[rarity.toLowerCase()] || null;
    }
    return null;
}

// → 0-based ladder index of an item's rarity (any form), or -1.
function rarityIndex(rarity) {
    const canon = canonicalRarity(rarity);
    return canon ? RARITY_ORDER.indexOf(canon) : -1;
}

// The poor / unaffordable / bad-input envelope — wallet untouched.
function noop(rainshards, reason) {
    return { ok: false, reason, rainshards };
}

// ---------------------------------------------------------------------------
// Item-shape detection.
//
// A gear item carries `affixes`; a weapon item carries `traits`. We detect by
// the presence of those arrays (never by an explicit `kind` tag, which the
// rollers don't stamp).
// ---------------------------------------------------------------------------
function isWeapon(item) {
    return !!item && Array.isArray(item.traits);
}
function isGear(item) {
    return !!item && Array.isArray(item.affixes);
}

// ---------------------------------------------------------------------------
// rng helpers (over an injected rng()∈[0,1)).
// ---------------------------------------------------------------------------
function randInt(rng, n) {
    return Math.floor(rng() * n) % n;
}
function pick(rng, list) {
    if (!list || list.length === 0) return undefined;
    return list[randInt(rng, list.length)];
}

// Roll a weapon trait DEF's value within its band (inclusive integer), or
// undefined for value-less traits. Mirrors weapon-gen's rollValue.
function rollTraitValue(def, rng) {
    if (!def || !def.roll) return undefined;
    const { min, max } = def.roll;
    if (max <= min) return min;
    return min + randInt(rng, max - min + 1);
}

// Roll a gear affix pct in the item's rarity band, 1-decimal rounded (mirrors
// gear-gen's _rollPct). Falls back to a sane 4–36 band if the rarity is odd.
function rollAffixPct(rarity, rng) {
    const idx = rarityIndex(rarity);
    const row = idx >= 0 ? RARITY_LADDER[idx] : null;
    const min = row ? row.pctMin : 4;
    const max = row ? row.pctMax : 36;
    const v = min + rng() * (max - min);
    return Math.round(v * 10) / 10;
}

// ===========================================================================
// FABRICATE — roll a brand-new item, charge the rarity floor (× lean × focus).
// ===========================================================================
//
//   fabricate({ kind, params, rng }, rainshards)
//     kind   : 'weapon' | 'gear'
//     params : passed straight to rollWeapon / rollGear
//              ({ archetype|slot, rarity, lean, focus, template? }).
//     rng    : injected rng (defaults to params.rng or Math.random).
//
// Cost = fabricateCost(params.rarity, { lean, focus }). The `_rerolls` counter
// starts fresh (absent / 0) on a fabricated item.
export function fabricate({ kind, params = {}, rng } = {}, rainshards = 0) {
    const roll = rng || params.rng || Math.random;
    const canon = canonicalRarity(params.rarity);
    if (!canon) return noop(rainshards, 'badRarity');
    if (kind !== 'weapon' && kind !== 'gear') return noop(rainshards, 'badKind');

    const cost = fabricateCost(canon, {
        lean: params.lean || 'None',
        focus: params.focus || 'None',
    });
    if (rainshards < cost) return noop(rainshards, 'poor');

    let item;
    try {
        if (kind === 'weapon') {
            item = rollWeapon({ ...params, rng: roll });
        } else {
            item = rollGear({ ...params, rng: roll });
        }
    } catch (e) {
        return noop(rainshards, 'rollFailed');
    }

    // Fresh item: escalation counter starts at zero.
    return { ok: true, item: { ...item, _rerolls: 0 }, rainshards: rainshards - cost };
}

// ===========================================================================
// REROLL TRAIT — surgical reroll of ONE trait (weapon) / affix (gear).
// ===========================================================================
//
//   rerollTrait(item, index, mode, { targetType, rng }, rainshards)
//     index      : which trait/affix slot to reroll.
//     mode       : 'Reroll' | 'Calibrate' | 'Target'.
//     targetType : (Target only) the trait id / affix stat to force.
//
// Cost = rerollCost(item.rarity, mode, item._rerolls||0); on success the
// returned item's `_rerolls` is incremented by one (so the next reroll on it
// costs 1.4× more — the forever-Calibrate sink).
export function rerollTrait(item, index, mode, { targetType = null, rng } = {}, rainshards = 0) {
    const roll = rng || Math.random;
    if (!isWeapon(item) && !isGear(item)) return noop(rainshards, 'badItem');
    if (mode !== 'Reroll' && mode !== 'Calibrate' && mode !== 'Target') {
        return noop(rainshards, 'badMode');
    }
    const canon = canonicalRarity(item.rarity);
    if (!canon) return noop(rainshards, 'badRarity');

    const list = isWeapon(item) ? item.traits : item.affixes;
    if (!Array.isArray(list) || index < 0 || index >= list.length) {
        return noop(rainshards, 'badIndex');
    }

    const n = item._rerolls || 0;
    const cost = rerollCost(canon, mode, n);
    if (rainshards < cost) return noop(rainshards, 'poor');

    // Build the replacement entry for `index`. Per "narrow types, never values":
    //   Calibrate → keep TYPE, reroll VALUE.   Reroll → new random TYPE+VALUE.
    //   Target    → force `targetType`, VALUE still rolls.
    let entry;
    if (isWeapon(item)) {
        entry = _rerollWeaponTrait(item, list, index, mode, targetType, roll);
    } else {
        entry = _rerollGearAffix(item, list, index, mode, targetType, roll);
    }
    if (!entry) return noop(rainshards, 'badTarget');

    // New item with the one slot replaced + the bumped escalation counter.
    const newList = list.slice();
    newList[index] = entry;
    const next = isWeapon(item)
        ? { ...item, traits: newList }
        : { ...item, affixes: newList };
    next._rerolls = n + 1;

    // Keep `element` legible on weapons (it tracks the single ELEMENT trait).
    if (isWeapon(item)) {
        const el = newList.find((t) => t.class === 'ELEMENT');
        next.element = el ? el.id : 'KINETIC';
    }
    return { ok: true, item: next, rainshards: rainshards - cost };
}

// Reroll one WEAPON trait. Returns a { id, class, value? } entry, or null on a
// bad Target. Avoids duplicating another slot's trait id (except when keeping
// the same id, i.e. Calibrate).
function _rerollWeaponTrait(item, traits, index, mode, targetType, rng) {
    const cur = traits[index];
    const pool = rollableTraitsFor(item.archetype);
    // ids already used in OTHER slots (don't collide on Reroll/Target).
    const taken = new Set(
        traits.filter((_, i) => i !== index).map((t) => t.id),
    );

    if (mode === 'Calibrate') {
        // Keep the exact type; reroll only the value.
        const def = WEAPON_TRAITS[cur.id];
        return _materializeTrait(def || cur, rng);
    }

    if (mode === 'Target') {
        const def = WEAPON_TRAITS[targetType];
        if (!def) return null;
        return _materializeTrait(def, rng);
    }

    // Reroll: a fresh random type from the pool, excluding taken ids.
    const candidates = pool.filter((d) => !taken.has(d.id));
    const def = pick(rng, candidates.length ? candidates : pool);
    if (!def) return null;
    return _materializeTrait(def, rng);
}

// trait def → on-item shape { id, class, value? }.
function _materializeTrait(def, rng) {
    const t = { id: def.id, class: def.class };
    const v = rollTraitValue(def, rng);
    if (v !== undefined) t.value = v;
    return t;
}

// Reroll one GEAR affix. Returns a { stat, pct } entry, or null on a bad Target.
function _rerollGearAffix(item, affixes, index, mode, targetType, rng) {
    const cur = affixes[index];

    if (mode === 'Calibrate') {
        // Keep the stat type; reroll only the pct value.
        return { stat: cur.stat, pct: rollAffixPct(item.rarity, rng) };
    }

    if (mode === 'Target') {
        if (typeof targetType !== 'string' || !targetType) return null;
        return { stat: targetType, pct: rollAffixPct(item.rarity, rng) };
    }

    // Reroll: pick a fresh stat from this item's existing affix vocabulary,
    // avoiding the other equipped slots' stats where possible. Gear has no
    // imported "pool" here, so we draw from the item's own affix stat set
    // (the template/slot already constrained it at fabrication) plus the
    // current stat, so a 1-affix item can still reroll its value-with-type.
    const taken = new Set(affixes.filter((_, i) => i !== index).map((a) => a.stat));
    const vocab = Array.from(new Set(affixes.map((a) => a.stat)));
    const candidates = vocab.filter((s) => !taken.has(s));
    const stat = pick(rng, candidates.length ? candidates : vocab) || cur.stat;
    return { stat, pct: rollAffixPct(item.rarity, rng) };
}

// ===========================================================================
// UPGRADE TIER — +1 rarity: keep existing rolls, add ONE new slot in the new
// band, reset the escalation counter.
// ===========================================================================
//
//   upgradeTier(item, { rng }, rainshards)
//
// Cost = upgradeCost(item.rarity) (= next-tier blind fab × 1.5). No-op (ok:true,
// unchanged item) at the top of the ladder. Resets `_rerolls` to 0.
export function upgradeTier(item, { rng } = {}, rainshards = 0) {
    const roll = rng || Math.random;
    if (!isWeapon(item) && !isGear(item)) return noop(rainshards, 'badItem');
    const idx = rarityIndex(item.rarity);
    if (idx < 0) return noop(rainshards, 'badRarity');

    // Already top of the ladder — nothing to upgrade into.
    if (idx >= RARITY_ORDER.length - 1) {
        return noop(rainshards, 'maxTier');
    }

    const canon = RARITY_ORDER[idx];
    const cost = upgradeCost(canon);
    if (rainshards < cost) return noop(rainshards, 'poor');

    const nextCanon = RARITY_ORDER[idx + 1];
    // Preserve the original rarity's casing style (lowercase id vs capitalized).
    const wasLower = typeof item.rarity === 'string' && item.rarity === item.rarity.toLowerCase();
    const newRarity = wasLower ? nextCanon.toLowerCase() : nextCanon;

    let next;
    if (isWeapon(item)) {
        // Add one NEW trait slot rolled in the new band (a fresh random type
        // not already present), keeping the existing traits untouched.
        const traits = item.traits.slice();
        const taken = new Set(traits.map((t) => t.id));
        const pool = rollableTraitsFor(item.archetype).filter((d) => {
            if (taken.has(d.id)) return false;
            // honor "at most one Element trait".
            if (d.class === 'ELEMENT' && traits.some((t) => t.class === 'ELEMENT')) return false;
            return true;
        });
        const def = pick(roll, pool);
        if (def) traits.push(_materializeTrait(def, roll));
        next = { ...item, rarity: newRarity, traits };
        const el = traits.find((t) => t.class === 'ELEMENT');
        next.element = el ? el.id : 'KINETIC';
    } else {
        // Gear: add one NEW affix slot rolled in the new (wider) band.
        const affixes = item.affixes.slice();
        const taken = new Set(affixes.map((a) => a.stat));
        const vocab = Array.from(new Set(affixes.map((a) => a.stat)));
        const candidates = vocab.filter((s) => !taken.has(s));
        const stat = pick(roll, candidates.length ? candidates : vocab);
        if (stat) affixes.push({ stat, pct: rollAffixPct(newRarity, roll) });
        next = { ...item, rarity: newRarity, affixes };
    }

    // Upgrade resets the per-item reroll escalation.
    next._rerolls = 0;
    return { ok: true, item: next, rainshards: rainshards - cost };
}

// ===========================================================================
// COMBINE MATRICES — 3× same-type/tier → 1× tier+1, charge by the result tier.
// ===========================================================================
//
//   combineMatrices(matrices, rainshards)
//
// Delegates the recipe check to matrix-system. Cost = combineCost(resultTier)
// where resultTier is the new Matrix's tier. No-op if the recipe fails or you
// can't afford it.
export function combineMatrices(matrices, rainshards = 0) {
    const result = combineMatricesData(matrices);
    if (!result) return noop(rainshards, 'badRecipe');

    const cost = combineCost(result.tier);
    if (rainshards < cost) return noop(rainshards, 'poor');

    return { ok: true, matrix: result, rainshards: rainshards - cost };
}

// ===========================================================================
// SALVAGE — item → R$. Adds salvageRefund(rarity) to the wallet (the faucet).
// ===========================================================================
//
//   salvage(item, rainshards)
//
// Always strictly less than a fresh fabricate of that rarity (the cleaner, never
// a profit loop). No-op on a bad item / unknown rarity.
export function salvage(item, rainshards = 0) {
    if (!isWeapon(item) && !isGear(item)) return noop(rainshards, 'badItem');
    const canon = canonicalRarity(item.rarity);
    if (!canon) return noop(rainshards, 'badRarity');

    const refund = salvageRefund(canon);
    return { ok: true, refund, rainshards: rainshards + refund };
}
