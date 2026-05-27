// T44 — loot QoL pure logic: sortStash (recency/rarity/score/slot + locked pin)
// and the lock-aware partitionBulkSalvage (locked items are never salvaged).

import { describe, expect, test } from '@jest/globals';
import { sortStash } from '../../js/modules/world/inventory.js';
import { partitionBulkSalvage } from '../../js/modules/world/cores.js';

const A = { id: 'a', slot: 'hull', rarity: 'common' };
const B = { id: 'b', slot: 'cockpit', rarity: 'epic' };
const C = { id: 'c', slot: 'hull', rarity: 'rare' };
const ids = (arr) => arr.map((x) => x.id);

describe('T44 — sortStash', () => {
    test("'recent' lists newest (last-inserted) first", () => {
        expect(ids(sortStash([A, B, C], 'recent'))).toEqual(['c', 'b', 'a']);
    });

    test("'rarity' lists rarest first (epic > rare > common)", () => {
        expect(ids(sortStash([A, B, C], 'rarity'))).toEqual(['b', 'c', 'a']);
    });

    test("'score' uses the supplied scoreFn (best first)", () => {
        const scoreFn = (it) => ({ a: 10, b: 5, c: 30 }[it.id]);
        expect(ids(sortStash([A, B, C], 'score', { scoreFn }))).toEqual(['c', 'a', 'b']);
    });

    test('LOCKED items are pinned to the top regardless of mode', () => {
        const locked = { ...A, locked: true }; // common + oldest, but locked
        expect(ids(sortStash([locked, B, C], 'rarity'))[0]).toBe('a');
    });

    test('does not mutate the input array', () => {
        const input = [A, B, C];
        const snapshot = ids(input);
        sortStash(input, 'rarity');
        expect(ids(input)).toEqual(snapshot);
    });

    test('tolerates junk / empty input', () => {
        expect(sortStash(null)).toEqual([]);
        expect(sortStash([])).toEqual([]);
    });
});

describe('T44 — lock-aware partitionBulkSalvage', () => {
    const scoreFn = (it) => it.score || 0;
    const equipped = { hull: { slot: 'hull', score: 100 } };

    test('salvages below-equipped gear but NEVER a locked item', () => {
        const items = [
            { id: 'lo', slot: 'hull', score: 50 },                 // below → salvage
            { id: 'lock', slot: 'hull', score: 50, locked: true }, // below BUT locked → keep
            { id: 'hi', slot: 'hull', score: 150 },                // above → keep
        ];
        const { keep, salvage } = partitionBulkSalvage(items, equipped, scoreFn);
        expect(salvage.map((x) => x.id)).toEqual(['lo']);
        expect(keep.map((x) => x.id).sort()).toEqual(['hi', 'lock']);
    });
});
