// Phase R8.3 — inventory equip/unequip (pure, no DOM).
import {
    getEquipped, stashForSlot, equipFromStash, unequipSlot, equipDelta,
    getEquippedWeapon, stashWeapons, equipWeaponFromStash, unequipWeapon,
    getEquippedPowerWeapon, stashPowerWeapons, equipPowerWeaponFromStash, unequipPowerWeapon,
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

// 8.x — weapons-as-gear: a single equipped weapon slot (meta.equippedWeapon),
// equipped from the stash, parallel to the gear equip model above.
describe('Inventory — weapon equip model', () => {
    const wpn = (name) => ({ slot: 'weapon', kind: 'weapon', name, archetype: 'PULSE' });
    const gear = (slot, name) => ({ slot, kind: 'gear', name });

    test('getEquippedWeapon / stashWeapons read the right places', () => {
        const meta = { stash: [wpn('a'), gear('hull', 'h'), wpn('b')], equippedWeapon: wpn('eq') };
        expect(getEquippedWeapon(meta).name).toBe('eq');
        expect(stashWeapons(meta).map((x) => x.index)).toEqual([0, 2]); // only weapons, original indices
        expect(getEquippedWeapon({})).toBeNull();
        expect(getEquippedWeapon(null)).toBeNull();
    });

    test('equipWeaponFromStash moves stash weapon → weapon slot', () => {
        const meta = { stash: [wpn('a')], equippedWeapon: null };
        const { ok, meta: next } = equipWeaponFromStash(meta, 0);
        expect(ok).toBe(true);
        expect(next.equippedWeapon.name).toBe('a');
        expect(next.stash).toHaveLength(0);
        expect(meta.stash).toHaveLength(1); // original untouched
    });

    test('equipping a weapon returns the displaced weapon to the stash', () => {
        const meta = { stash: [wpn('new')], equippedWeapon: wpn('old') };
        const { meta: next } = equipWeaponFromStash(meta, 0);
        expect(next.equippedWeapon.name).toBe('new');
        expect(next.stash).toHaveLength(1);
        expect(next.stash[0].name).toBe('old');
    });

    test('equipWeaponFromStash is a no-op on a non-weapon or bad index', () => {
        const meta = { stash: [gear('hull', 'h')], equippedWeapon: null };
        expect(equipWeaponFromStash(meta, 0).ok).toBe(false); // gear, not a weapon
        expect(equipWeaponFromStash(meta, 9).ok).toBe(false); // bad index
    });

    test('unequipWeapon returns the weapon to the stash', () => {
        const meta = { stash: [], equippedWeapon: wpn('eq') };
        const { ok, meta: next } = unequipWeapon(meta);
        expect(ok).toBe(true);
        expect(next.equippedWeapon).toBeNull();
        expect(next.stash).toHaveLength(1);
        expect(unequipWeapon({ equippedWeapon: null }).ok).toBe(false);
    });

    test('a weapon is never in both stash and slot (swap conserves count)', () => {
        let meta = { stash: [wpn('a'), wpn('b')], equippedWeapon: null };
        const total = () => meta.stash.length + (meta.equippedWeapon ? 1 : 0);
        expect(total()).toBe(2);
        ({ meta } = equipWeaponFromStash(meta, 0));
        expect(total()).toBe(2);
        ({ meta } = equipWeaponFromStash(meta, 0));
        expect(total()).toBe(2);
    });

    // ── Power weapons (second found-as-gear category) ──
    const pw = (name) => ({ slot: 'power', kind: 'powerweapon', name, powerId: 'NOVA_BLAST' });

    test('stashPowerWeapons filters kind:powerweapon (not weapons/gear)', () => {
        const meta = { stash: [pw('a'), wpn('w'), it('hull', 1), pw('b')] };
        expect(stashPowerWeapons(meta).map((x) => x.index)).toEqual([0, 3]);
    });

    test('equipPowerWeaponFromStash moves stash → power slot, swaps prev back', () => {
        let meta = { stash: [pw('found')], equippedPowerWeapon: pw('old') };
        ({ meta } = equipPowerWeaponFromStash(meta, 0));
        expect(getEquippedPowerWeapon(meta).name).toBe('found');
        expect(meta.stash).toHaveLength(1);
        expect(meta.stash[0].name).toBe('old');
        // Non-power index is a no-op.
        expect(equipPowerWeaponFromStash({ stash: [it('hull', 1)] }, 0).ok).toBe(false);
    });

    test('unequipPowerWeapon returns it to the stash', () => {
        const { ok, meta: next } = unequipPowerWeapon({ stash: [], equippedPowerWeapon: pw('eq') });
        expect(ok).toBe(true);
        expect(next.equippedPowerWeapon).toBeNull();
        expect(next.stash).toHaveLength(1);
        expect(unequipPowerWeapon({ equippedPowerWeapon: null }).ok).toBe(false);
    });
});
