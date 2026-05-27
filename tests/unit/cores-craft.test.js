// Phase R8.6 / R8.8 — Cores crafting: reroll affixes + tier-up. Pure logic.
import { createItem, rerollItemAffixes, tierUpItem, nextRarity, rollAffixSet } from '../../js/modules/world/item-system.js';
import { rerollCost, tierUpCost, canAffordReroll, canAffordTierUp } from '../../js/modules/world/cores.js';
import { RARITY_TIERS } from '../../js/modules/world/item-names.js';
// T27 — reroll/tier-up now use gear-gen's canonical RARITY_LADDER affix counts
// and produce {stat,pct} amplifier affixes (matched by `.stat`, not `.type`).
import { rarityRow } from '../../js/modules/world/gear-gen.js';

describe('item-system — rollAffixSet', () => {
    test('rolls the requested count, excluding given types', () => {
        const set = rollAffixSet(10, 'epic', 3, ['hp']);
        expect(set).toHaveLength(3);
        expect(set.every((a) => a.type !== 'hp')).toBe(true);
    });

    test('count is clamped to the pool size', () => {
        const set = rollAffixSet(5, 'common', 999);
        expect(set.length).toBeGreaterThan(0);
        // distinct types
        expect(new Set(set.map((a) => a.type)).size).toBe(set.length);
    });
});

describe('Cores — reroll (R8.6)', () => {
    test('reroll keeps slot/level/rarity and affix count (tier-bounded)', () => {
        const it = createItem('hull', 12, 'legendary');
        const re = rerollItemAffixes(it);
        expect(re.slot).toBe('hull');
        expect(re.level).toBe(12);
        expect(re.rarity).toBe('legendary');
        expect(re.affixes).toHaveLength(rarityRow('legendary').affixCount);
    });

    test('reroll preserves traits', () => {
        const it = { ...createItem('cockpit', 5, 'rare'), traits: [{ id: 'glassCannon' }] };
        const re = rerollItemAffixes(it);
        expect(re.traits).toEqual([{ id: 'glassCannon' }]);
    });

    test('reroll cost scales with rarity', () => {
        expect(rerollCost(createItem('hull', 1, 'transcendental')))
            .toBeGreaterThan(rerollCost(createItem('hull', 1, 'common')));
        expect(canAffordReroll(createItem('hull', 1, 'common'), 999)).toBe(true);
        expect(canAffordReroll(createItem('hull', 1, 'transcendental'), 1)).toBe(false);
    });
});

describe('Cores — tier-up (R8.8)', () => {
    test('nextRarity walks the ladder and caps at transcendental', () => {
        expect(nextRarity('common')).toBe('rare');
        expect(nextRarity('divine')).toBe('transcendental');
        expect(nextRarity('transcendental')).toBeNull();
    });

    test('tier-up raises rarity and adds the new tier’s affix slot(s), keeping old affixes', () => {
        const it = createItem('shielding', 10, 'common'); // 1 amp affix
        const oldStats = it.affixes.map((a) => a.stat);
        const up = tierUpItem(it);
        expect(up.rarity).toBe('rare');
        expect(up.affixes.length).toBe(rarityRow('rare').affixCount); // 2
        // original amp affixes preserved (by stat)
        for (const s of oldStats) expect(up.affixes.map((a) => a.stat)).toContain(s);
    });

    test('tier-up at max tier is a no-op and unaffordable', () => {
        const top = createItem('hull', 20, 'transcendental');
        expect(tierUpItem(top).rarity).toBe('transcendental');
        expect(tierUpCost(top)).toBe(Infinity);
        expect(canAffordTierUp(top, 999999)).toBe(false);
    });

    test('tier-up cost scales with the target tier', () => {
        expect(tierUpCost(createItem('hull', 1, 'epic')))
            .toBeGreaterThan(tierUpCost(createItem('hull', 1, 'common')));
    });
});
