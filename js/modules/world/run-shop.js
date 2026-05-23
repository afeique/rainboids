// Phase R4 — in-run gold sinks at the card-draft moment. Run-gold spent here
// is gold NOT banked to account-gold at run end, so every purchase is a
// "spend now to go deep, or save to grow the account" decision (design §2).
//
// Pure cost helpers (no DOM) so the cost curves are unit-testable. The card
// overlay (wave-manager) wires the buttons + run-state counters.

export const FREE_CARDS_PER_DRAFT = 1; // one free pick per draft
export const MAX_CARDS_PER_DRAFT = 3;  // hard cap on extra picks per draft (the 6th/7th overall)

// Paid REROLL of a card offer (R4.2): modest, once per offer.
export const REROLL_COST = 200;
export function rerollCost(rerollsThisOffer = 0) {
    return rerollsThisOffer >= 1 ? Infinity : REROLL_COST; // once per offer
}
export function canReroll(rerollsThisOffer, runGold) {
    const c = rerollCost(rerollsThisOffer);
    return c !== Infinity && (runGold | 0) >= c;
}

// Extra card pick within a draft (R4.1): steeply escalating, capped.
// 1st extra ≈ half a weapon unlock (600), 2nd ≈ a full unlock (1200).
const EXTRA_CARD_COSTS = [600, 1200];
export function extraCardCost(extraTaken = 0) {
    if (extraTaken >= EXTRA_CARD_COSTS.length) return Infinity; // cap reached
    return EXTRA_CARD_COSTS[extraTaken];
}
export function canBuyExtraCard(extraTaken, runGold) {
    const c = extraCardCost(extraTaken);
    return c !== Infinity && (runGold | 0) >= c;
}

// Repair Kit (R4.3): instant heal, escalating per use this run.
export const REPAIR_KIT_BASE = 250;
export function repairKitCost(repairsThisRun = 0) {
    return REPAIR_KIT_BASE * (repairsThisRun + 1);
}
export function canRepair(repairsThisRun, runGold) {
    return (runGold | 0) >= repairKitCost(repairsThisRun);
}
// Heal fraction of max HP per kit.
export const REPAIR_KIT_HEAL_PCT = 0.35;

// Revive Token (R4.3): very steep, once per run.
export const REVIVE_COST = 3000;
export function reviveCost(revivesThisRun = 0) {
    return revivesThisRun >= 1 ? Infinity : REVIVE_COST; // 1 per run
}
export function canRevive(revivesThisRun, runGold) {
    const c = reviveCost(revivesThisRun);
    return c !== Infinity && (runGold | 0) >= c;
}
