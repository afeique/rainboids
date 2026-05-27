// Looter-Economy Pivot — T02: Crafting cost formulas (§2.5/§6.3).
// Validates every Fabricator verb against the doc's calibrated numbers.
import {
    RARITY_ORDER,
    RARITY_FACTOR,
    RARITY_MULT,
    FAB_BASE,
    REROLL_BASE,
    TEMPLATE_MULT,
    TRAIT_MULT,
    MODE_MULT,
    COMBINE_COST,
    fabricateCost,
    rerollCost,
    upgradeCost,
    combineCost,
    salvageRefund,
} from '../../js/modules/shop/crafting-costs.js';

describe('T02 — constants', () => {
    test('rarity ladder is the 8-tier Common..Transcendental order', () => {
        expect(RARITY_ORDER).toEqual([
            'Common', 'Rare', 'Exceptional', 'Legendary',
            'Epic', 'Godlike', 'Divine', 'Transcendental',
        ]);
    });

    test('rarityFactor = 1/3/8/20/50/120/300/700', () => {
        expect(RARITY_ORDER.map((r) => RARITY_FACTOR[r]))
            .toEqual([1, 3, 8, 20, 50, 120, 300, 700]);
    });

    test('rarityMult = 1/1.5/2.5/4/6/9/13/18', () => {
        expect(RARITY_ORDER.map((r) => RARITY_MULT[r]))
            .toEqual([1, 1.5, 2.5, 4, 6, 9, 13, 18]);
    });

    test('base coefficients + mult maps', () => {
        expect(FAB_BASE).toBe(300);
        expect(REROLL_BASE).toBe(500);
        expect(TEMPLATE_MULT).toMatchObject({ None: 1, Lean: 1.5, Strong: 2.5, Pure: 4 });
        expect(TRAIT_MULT).toMatchObject({ None: 1, Boost: 1.4, Guarantee: 2.2 });
        expect(MODE_MULT).toMatchObject({ Reroll: 1, Calibrate: 0.8, Target: 3 });
        expect(COMBINE_COST).toEqual([500, 1500, 4000, 10000]);
    });
});

describe('T02 — fabricateCost', () => {
    test('blind Legendary fab = 6000', () => {
        expect(fabricateCost('Legendary')).toBe(6000);
    });

    test('Pure + Guarantee Legendary = 52,800', () => {
        expect(fabricateCost('Legendary', { lean: 'Pure', focus: 'Guarantee' }))
            .toBeCloseTo(52800, 4);
    });

    test('blind Epic = 15,000 and Epic Pure+Guarantee = 132,000', () => {
        expect(fabricateCost('Epic')).toBe(15000);
        expect(fabricateCost('Epic', { lean: 'Pure', focus: 'Guarantee' }))
            .toBeCloseTo(132000, 4);
    });

    test('blind Transcendental = 210,000', () => {
        expect(fabricateCost('Transcendental')).toBe(210000);
    });

    test('defaults to blind (lean None / focus None)', () => {
        expect(fabricateCost('Common')).toBe(300);
        expect(fabricateCost('Common', {})).toBe(300);
    });
});

describe('T02 — rerollCost', () => {
    test('Reroll Legendary n=0 = 2000', () => {
        expect(rerollCost('Legendary')).toBe(2000);
    });

    test('escalates with n via 1.4^n', () => {
        expect(rerollCost('Legendary', 'Reroll', 1)).toBeCloseTo(2800, 4);
        expect(rerollCost('Legendary', 'Reroll', 2)).toBeCloseTo(3920, 4);
        // strictly increasing in n
        let prev = 0;
        for (let n = 0; n < 6; n++) {
            const c = rerollCost('Legendary', 'Reroll', n);
            expect(c).toBeGreaterThan(prev);
            prev = c;
        }
    });

    test('mode multipliers: Calibrate cheaper, Target premium', () => {
        const reroll = rerollCost('Legendary', 'Reroll', 0);
        expect(rerollCost('Legendary', 'Calibrate', 0)).toBeCloseTo(reroll * 0.8, 4);
        expect(rerollCost('Legendary', 'Target', 0)).toBeCloseTo(reroll * 3, 4);
    });
});

describe('T02 — upgradeCost', () => {
    test('= next-tier blind fab × 1.5', () => {
        expect(upgradeCost('Legendary')).toBeCloseTo(fabricateCost('Epic') * 1.5, 4);
        expect(upgradeCost('Legendary')).toBe(22500);
    });

    test('top of the ladder has nothing to upgrade into', () => {
        expect(upgradeCost('Transcendental')).toBe(0);
    });
});

describe('T02 — combineCost', () => {
    test('= 500/1500/4000/10000 by target tier', () => {
        expect(combineCost(1)).toBe(500);
        expect(combineCost(2)).toBe(1500);
        expect(combineCost(3)).toBe(4000);
        expect(combineCost(4)).toBe(10000);
    });
});

describe('T02 — salvageRefund', () => {
    test('= 35% of blind fab', () => {
        expect(salvageRefund('Legendary')).toBeCloseTo(6000 * 0.35, 4);
    });

    test('always strictly less than the fabricate cost (the faucet/cleaner)', () => {
        for (const r of RARITY_ORDER) {
            expect(salvageRefund(r)).toBeLessThan(fabricateCost(r));
        }
    });
});
