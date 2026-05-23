// Phase R4 — in-run gold sink cost curves (pure, no DOM).
import {
    rerollCost, canReroll, extraCardCost, canBuyExtraCard,
    repairKitCost, canRepair, reviveCost, canRevive,
    MAX_CARDS_PER_DRAFT, REPAIR_KIT_HEAL_PCT,
} from '../../js/modules/world/run-shop.js';

describe('R4 — reroll cost', () => {
    test('modest flat cost, once per offer', () => {
        expect(rerollCost(0)).toBe(200);
        expect(rerollCost(1)).toBe(Infinity); // already rerolled this offer
    });
    test('affordability gate', () => {
        expect(canReroll(0, 200)).toBe(true);
        expect(canReroll(0, 199)).toBe(false);
        expect(canReroll(1, 99999)).toBe(false); // capped
    });
});

describe('R4 — extra card (6th/7th)', () => {
    test('steeply escalating then capped', () => {
        expect(extraCardCost(0)).toBe(600);
        expect(extraCardCost(1)).toBe(1200);
        expect(extraCardCost(2)).toBe(Infinity); // cap (max 2 extra)
    });
    test('cap matches MAX_CARDS_PER_DRAFT (1 free + 2 paid = 3)', () => {
        expect(MAX_CARDS_PER_DRAFT).toBe(3);
    });
    test('affordability gate', () => {
        expect(canBuyExtraCard(0, 600)).toBe(true);
        expect(canBuyExtraCard(0, 500)).toBe(false);
        expect(canBuyExtraCard(2, 99999)).toBe(false); // capped
    });
});

describe('R4 — Repair Kit', () => {
    test('escalating per use', () => {
        expect(repairKitCost(0)).toBe(250);
        expect(repairKitCost(1)).toBe(500);
        expect(repairKitCost(2)).toBe(750);
    });
    test('heals a fraction of max HP', () => {
        expect(REPAIR_KIT_HEAL_PCT).toBeGreaterThan(0);
        expect(REPAIR_KIT_HEAL_PCT).toBeLessThan(1);
    });
    test('affordability gate', () => {
        expect(canRepair(0, 250)).toBe(true);
        expect(canRepair(1, 250)).toBe(false); // 2nd costs 500
    });
});

describe('R4 — Revive Token', () => {
    test('very steep, once per run', () => {
        expect(reviveCost(0)).toBe(3000);
        expect(reviveCost(1)).toBe(Infinity);
    });
    test('affordability gate', () => {
        expect(canRevive(0, 3000)).toBe(true);
        expect(canRevive(0, 2999)).toBe(false);
        expect(canRevive(1, 99999)).toBe(false); // already used
    });
});
