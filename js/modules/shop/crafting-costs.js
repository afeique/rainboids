// Looter-Economy Pivot — T02: Crafting cost formulas (the sink).
//
// Pure cost math for every Fabricator verb, per design §2.5 / §6.3. No DOM,
// no globals, no RNG — same inputs always give the same R$ cost (these feed
// the live cost readout in the inventory crafting UI and the crafting engine).
//
// The cost curve is intentionally exponential (rarityFactor) + escalating
// (1.4^n per reroll on an item) so the sink stays AHEAD of the income faucet:
// one good NORMAL run (~39k R$) is a *meaningful step* (e.g. a blind Legendary
// at 6k, or ~1.3 runs for a Pure+Guarantee Legendary at 52.8k), never a god
// item — Transcendental/perfect gear is a deliberate multi-run goal.

// Rarity ladder, low → high. Index into this is the "tier".
export const RARITY_ORDER = Object.freeze([
    'Common',
    'Rare',
    'Exceptional',
    'Legendary',
    'Epic',
    'Godlike',
    'Divine',
    'Transcendental',
]);

// Exponential per-rarity cost factor for FABRICATE (§2.5).
export const RARITY_FACTOR = Object.freeze({
    Common: 1,
    Rare: 3,
    Exceptional: 8,
    Legendary: 20,
    Epic: 50,
    Godlike: 120,
    Divine: 300,
    Transcendental: 700,
});

// Per-rarity multiplier for REROLL / SALVAGE-adjacent costs (§2.5).
export const RARITY_MULT = Object.freeze({
    Common: 1,
    Rare: 1.5,
    Exceptional: 2.5,
    Legendary: 4,
    Epic: 6,
    Godlike: 9,
    Divine: 13,
    Transcendental: 18,
});

// FABRICATE base coefficient.
export const FAB_BASE = 300;
// REROLL base coefficient.
export const REROLL_BASE = 500;

// Template-lean cost multiplier: how hard you bias the rolled template/build.
// None = blind roll; Pure = a single template guaranteed.
export const TEMPLATE_MULT = Object.freeze({
    None: 1,
    Lean: 1.5,
    Strong: 2.5,
    Pure: 4,
});

// Trait-focus cost multiplier: bias toward a trait *type*.
// None = no focus; Boost = better odds; Guarantee = one of that type guaranteed.
export const TRAIT_MULT = Object.freeze({
    None: 1,
    Boost: 1.4,
    Guarantee: 2.2,
});

// Reroll-mode cost multiplier (§2.5):
//   Reroll    — random new type (cheapest).
//   Calibrate — lock the type, reroll only the VALUE (perfection endgame).
//   Target    — force a specific type (premium).
export const MODE_MULT = Object.freeze({
    Reroll: 1,
    Calibrate: 0.8,
    Target: 3,
});

// Combine-Matrices cost by the TARGET tier you're combining UP to (3→1).
// Indexed 1-based to match Tn (toTier 1 is the cheapest combine).
export const COMBINE_COST = Object.freeze([500, 1500, 4000, 10000]);

// Refund fraction of the blind-fab cost when salvaging (always < fab).
export const SALVAGE_FRACTION = 0.35;
// Upgrade-tier cost = next-tier blind fab × this.
export const UPGRADE_FACTOR = 1.5;

function rarityFactor(rarity) {
    return RARITY_FACTOR[rarity] || 0;
}

function nextRarity(rarity) {
    const i = RARITY_ORDER.indexOf(rarity);
    if (i < 0 || i >= RARITY_ORDER.length - 1) return null;
    return RARITY_ORDER[i + 1];
}

// FABRICATE cost: pay a rarity floor, scaled by how hard you bias the
// template (lean) and trait type (focus). Blind = lean None / focus None.
//   = FAB_BASE × rarityFactor × templateMult(lean) × traitMult(focus)
export function fabricateCost(rarity, { lean = 'None', focus = 'None' } = {}) {
    const tMult = TEMPLATE_MULT[lean] ?? 1;
    const fMult = TRAIT_MULT[focus] ?? 1;
    return FAB_BASE * rarityFactor(rarity) * tMult * fMult;
}

// REROLL cost on a single affix/trait. `n` is the per-item escalation
// counter (how many rerolls already done on this item) — every reroll gets
// 1.4× pricier, so forever-Calibrate stays an endgame money sink.
//   = REROLL_BASE × rarityMult × 1.4^n × modeMult(mode)
export function rerollCost(rarity, mode = 'Reroll', n = 0) {
    const rMult = RARITY_MULT[rarity] || 0;
    const mMult = MODE_MULT[mode] ?? 1;
    return REROLL_BASE * rMult * Math.pow(1.4, Math.max(0, n)) * mMult;
}

// UPGRADE TIER cost: +1 rarity (keeps rolls, widens band, +1 affix slot).
//   = next-tier blind fab × UPGRADE_FACTOR
// Returns 0 at the top of the ladder (nothing to upgrade into).
export function upgradeCost(rarity) {
    const next = nextRarity(rarity);
    if (!next) return 0;
    return fabricateCost(next) * UPGRADE_FACTOR;
}

// COMBINE Matrices cost to produce a Tier-`toTier` Matrix (3×T(n-1) → 1×Tn).
// `toTier` is 1-based; out-of-range tiers fall back to the top cost.
export function combineCost(toTier) {
    const i = Math.max(1, toTier | 0) - 1;
    return COMBINE_COST[i] ?? COMBINE_COST[COMBINE_COST.length - 1];
}

// SALVAGE refund: item → R$. Always a fraction of its blind-fab cost, so
// salvaging is strictly worse than building (the faucet/cleaner, never a
// profit loop).
export function salvageRefund(rarity) {
    return fabricateCost(rarity) * SALVAGE_FRACTION;
}
