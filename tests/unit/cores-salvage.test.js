// Phase R8.5 — Cores salvage economy unit tests (pure, no DOM).
import {
    RARITY_RANK, rarityRank, affixCount, salvageValue, totalSalvage,
    partitionBulkSalvage,
} from '../../js/modules/world/cores.js';

const item = (rarity, level, nAffix, traits = 0) => ({
    slot: 'cockpit', rarity, level,
    affixes: Array.from({ length: nAffix }, (_, i) => ({ type: 'hp', value: 10, label: `+10 HP` })),
    traits: Array.from({ length: traits }, (_, i) => ({ id: `t${i}` })),
});

describe('Cores — salvage value', () => {
    test('rarityRank maps the 8-tier ladder', () => {
        expect(rarityRank(item('common', 1, 1))).toBe(1);
        expect(rarityRank(item('transcendental', 1, 1))).toBe(8);
        expect(rarityRank(null)).toBe(1);
    });

    test('affixCount floors at 1', () => {
        expect(affixCount(item('common', 1, 3))).toBe(3);
        expect(affixCount({ slot: 'hull' })).toBe(1);
    });

    test('salvage value scales with rarity, level, and affix count', () => {
        const low = salvageValue(item('common', 1, 1));
        const mid = salvageValue(item('legendary', 10, 3));
        const high = salvageValue(item('transcendental', 30, 5));
        expect(low).toBeGreaterThanOrEqual(1);
        expect(mid).toBeGreaterThan(low);
        expect(high).toBeGreaterThan(mid);
    });

    test('salvage value floors at 1', () => {
        expect(salvageValue(item('common', 1, 1))).toBeGreaterThanOrEqual(1);
        expect(salvageValue(null)).toBe(0);
    });

    test('traited items are worth more', () => {
        const plain = salvageValue(item('epic', 10, 4, 0));
        const traited = salvageValue(item('epic', 10, 4, 2));
        expect(traited).toBe(plain + 6); // +3 per trait
    });

    test('totalSalvage sums a list', () => {
        const items = [item('common', 1, 1), item('rare', 5, 2)];
        expect(totalSalvage(items)).toBe(salvageValue(items[0]) + salvageValue(items[1]));
        expect(totalSalvage([])).toBe(0);
    });
});

describe('Cores — bulk salvage partition', () => {
    const score = (it) => (it.affixes || []).reduce((s, a) => s + a.value, 0);

    test('items below the equipped item in their slot are salvaged', () => {
        const equipped = { cockpit: item('legendary', 10, 3) }; // score 30
        const stash = [
            item('common', 1, 1),  // score 10 — below → salvage
            item('epic', 10, 5),   // score 50 — above → keep
        ];
        const { keep, salvage } = partitionBulkSalvage(stash, equipped, score);
        expect(salvage).toHaveLength(1);
        expect(keep).toHaveLength(1);
        expect(score(salvage[0])).toBe(10);
    });

    test('with nothing equipped in a slot, items are kept (never auto-salvaged)', () => {
        const stash = [item('common', 1, 1)];
        const { keep, salvage } = partitionBulkSalvage(stash, {}, score);
        expect(keep).toHaveLength(1);
        expect(salvage).toHaveLength(0);
    });
});
