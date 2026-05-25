import { describe, expect, test } from '@jest/globals';
import { compareItemStats, equippedStatTotals, itemStatTotals } from '../../../js/modules/ui/item-card.js';

describe('ItemCard math helpers', () => {
    const oldItem = {
        slot: 'hull',
        affixes: [
            { type: 'hp', value: 12 },
            { type: 'speed', value: 3 },
        ],
    };
    const newItem = {
        slot: 'hull',
        affixes: [
            { type: 'hp', value: 18 },
            { type: 'toughness', value: 4 },
        ],
    };

    test('itemStatTotals sums affixes by type', () => {
        expect(itemStatTotals({ affixes: [{ type: 'hp', value: 2 }, { type: 'hp', value: 3 }] })).toEqual({ hp: 5 });
    });

    test('compareItemStats treats missing stats as zero', () => {
        const deltas = compareItemStats(newItem, oldItem);
        expect(deltas).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'hp', delta: 6 }),
            expect.objectContaining({ key: 'toughness', delta: 4 }),
            expect.objectContaining({ key: 'speed', delta: -3 }),
        ]));
    });

    test('equippedStatTotals aggregates all equipped slots', () => {
        expect(equippedStatTotals({ hull: oldItem, shielding: newItem })).toMatchObject({
            hp: 30,
            speed: 3,
            toughness: 4,
        });
    });
});
