// T31 — Weapon loot factory + drop/collection contract.
//
// Verifies createWeaponItem / decorateWeaponItem produce a stash-ready weapon
// ITEM (synthetic slot:'weapon' + kind:'weapon' so it rides the same loot feed /
// stash machinery as gear, never auto-equipping), carrying the rolled archetype/
// traits/element plus display fields, and that a freshly-dropped weapon flows
// through the player's registerItemDrop collection path.

import { describe, expect, test } from '@jest/globals';
import { createWeaponItem, decorateWeaponItem } from '../../js/modules/world/item-system.js';
import { rollWeapon } from '../../js/modules/combat/weapon-gen.js';
import { PRIMARY_ARCHETYPES } from '../../js/modules/combat/weapon-data.js';

describe('T31 — weapon loot factory', () => {
    test('createWeaponItem produces a stash-ready weapon item', () => {
        const w = createWeaponItem(12, 'epic', 'RAIL');
        expect(w.kind).toBe('weapon');
        expect(w.slot).toBe('weapon');         // synthetic slot → rides the stash
        expect(w.archetype).toBe('RAIL');
        expect(w.rarity).toBe('epic');
        expect(w.level).toBe(12);
        expect(Array.isArray(w.traits)).toBe(true);
        expect(typeof w.element).toBe('string');
        expect(typeof w.name).toBe('string');
        expect(w.name.length).toBeGreaterThan(0);
        expect(typeof w.bonusLabel).toBe('string'); // describeWeapon summary
        expect(typeof w.rarityColor).toBe('string');
    });

    test('decorateWeaponItem clamps an unknown rarity to common + level ≥ 1', () => {
        const raw = rollWeapon({ archetype: 'PULSE', rarity: 'common', rng: () => 0 });
        const w = decorateWeaponItem({ ...raw, rarity: 'bogus' }, 0);
        expect(w.rarity).toBe('common');
        expect(w.level).toBe(1);
    });

    test('a random-archetype roll always picks a droppable primary archetype', () => {
        for (let i = 0; i < 50; i++) {
            const w = createWeaponItem(5);
            expect(PRIMARY_ARCHETYPES).toContain(w.archetype);
        }
    });

    test('trait count honors the rarity ladder (transcendental rolls more)', () => {
        const common = createWeaponItem(5, 'common', 'PULSE');
        const trans = createWeaponItem(5, 'transcendental', 'PULSE');
        expect(trans.traits.length).toBeGreaterThan(common.traits.length);
    });
});

describe('T31 — weapon drop flows through registerItemDrop', () => {
    // Mirror the minimal Player surface registerItemDrop touches.
    function dropStub() {
        return {
            _lootFeedSeq: 0,
            lootFeed: null,
            runCollected: null,
            registerItemDrop(item) {
                if (!item || !item.slot) return null;
                if (!this.lootFeed) this.lootFeed = [];
                const entry = { id: ++this._lootFeedSeq, item, equipped: false };
                this.lootFeed.unshift(entry);
                if (!this.runCollected) this.runCollected = [];
                this.runCollected.push(item);
                return entry;
            },
        };
    }

    test('a weapon item is accepted (has slot) and never auto-equipped', () => {
        const p = dropStub();
        const entry = p.registerItemDrop(createWeaponItem(8, 'rare', 'FLAK'));
        expect(entry).not.toBeNull();
        expect(entry.equipped).toBe(false);          // weapons equip via equipWeaponItem (T30)
        expect(p.runCollected).toHaveLength(1);      // committed to stash at run end
        expect(p.runCollected[0].kind).toBe('weapon');
    });
});
