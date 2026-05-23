// Phase R8.3 — inventory equip/unequip (pure, no DOM).
import {
    getEquipped, stashForSlot, equipFromStash, unequipSlot, equipDelta,
} from '../../js/modules/world/inventory.js';

const it = (slot, score) => ({ slot, name: `${slot}-${score}`, affixes: [{ type: 'hp', value: score, label: '' }] });
const score = (i) => (i.affixes || []).reduce((s, a) => s + a.value, 0);

describe('Inventory — equip model', () => {
    test('getEquipped normalizes to all 5 slots', () => {
        const eq = getEquipped({ equippedItems: { cockpit: it('cockpit', 5) } });
        expect(eq.cockpit.name).toBe('cockpit-5');
        expect(eq.hull).toBeNull();
        expect(Object.keys(eq).sort()).toEqual(['chassis', 'cockpit', 'hull', 'nanites', 'shielding']);
    });

    test('stashForSlot filters by slot with original indices', () => {
        const meta = { stash: [it('cockpit', 1), it('hull', 2), it('cockpit', 3)] };
        const r = stashForSlot(meta, 'cockpit');
        expect(r.map((x) => x.index)).toEqual([0, 2]);
    });

    test('equipFromStash moves stash → equipped slot', () => {
        const meta = { stash: [it('hull', 10)], equippedItems: {} };
        const { ok, meta: next } = equipFromStash(meta, 0);
        expect(ok).toBe(true);
        expect(next.equippedItems.hull.name).toBe('hull-10');
        expect(next.stash).toHaveLength(0);
        // original meta untouched
        expect(meta.stash).toHaveLength(1);
    });

    test('equipping a slot that is occupied returns the old item to the stash', () => {
        const meta = { stash: [it('hull', 20)], equippedItems: { hull: it('hull', 5) } };
        const { meta: next } = equipFromStash(meta, 0);
        expect(next.equippedItems.hull.name).toBe('hull-20');
        expect(next.stash).toHaveLength(1);
        expect(next.stash[0].name).toBe('hull-5'); // displaced item returned
    });

    test('equipFromStash is a no-op on a bad index', () => {
        const meta = { stash: [], equippedItems: {} };
        expect(equipFromStash(meta, 5).ok).toBe(false);
    });

    test('unequipSlot returns the item to the stash', () => {
        const meta = { stash: [], equippedItems: { cockpit: it('cockpit', 7) } };
        const { ok, meta: next } = unequipSlot(meta, 'cockpit');
        expect(ok).toBe(true);
        expect(next.equippedItems.cockpit).toBeNull();
        expect(next.stash).toHaveLength(1);
    });

    test('an item is never in both stash and equipped (swap conserves count)', () => {
        let meta = { stash: [it('hull', 1), it('hull', 2)], equippedItems: {} };
        const total = () => meta.stash.length + Object.values(getEquipped(meta)).filter(Boolean).length;
        expect(total()).toBe(2);
        ({ meta } = equipFromStash(meta, 0));
        expect(total()).toBe(2);
        ({ meta } = equipFromStash(meta, 0));
        expect(total()).toBe(2);
    });

    test('equipDelta compares against the currently equipped item', () => {
        const meta = { equippedItems: { hull: it('hull', 5) } };
        expect(equipDelta(meta, it('hull', 12), score)).toBe(7);
        expect(equipDelta(meta, it('cockpit', 3), score)).toBe(3); // empty slot
    });
});
