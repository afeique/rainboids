// 8.16.0 — weapon naming system + stock starter weapons.
//
// A weapon item's name = a martial rarity TITLE + base weapon + an optional
// element EPITHET. Commons read as "Stock <Weapon>" (the starter kit's voice);
// higher tiers escalate; an elemental roll adds an "of X" suffix. The fresh
// account starts with an equipped "Stock Pulse Cannon" + "Stock Charge Shot".

import { describe, expect, test } from '@jest/globals';
import {
    weaponItemName,
    createWeaponItem,
    createPowerWeaponItem,
} from '../../js/modules/world/item-system.js';

describe('weaponItemName', () => {
    test('common → "Stock <Weapon>" (the starter voice), never an epithet (even elemental)', () => {
        expect(weaponItemName('Pulse Cannon', 'common')).toBe('Stock Pulse Cannon');
        expect(weaponItemName('Pulse Cannon', 'common', 'VOLT')).toBe('Stock Pulse Cannon'); // commons stay clean
        expect(weaponItemName('Charge Shot', 'common', 'KINETIC')).toBe('Stock Charge Shot');
        expect(weaponItemName('Charge Shot', 'common', null)).toBe('Stock Charge Shot');
    });

    test('escalating rarity titles', () => {
        expect(weaponItemName('Rail Driver', 'rare')).toBe('Honed Rail Driver');
        expect(weaponItemName('Rail Driver', 'exceptional')).toBe('Tempered Rail Driver');
        expect(weaponItemName('Rail Driver', 'legendary')).toBe('Vanguard Rail Driver');
        expect(weaponItemName('Rail Driver', 'epic')).toBe("Tyrant's Rail Driver");
        expect(weaponItemName('Rail Driver', 'godlike')).toBe("Warlord's Rail Driver");
        expect(weaponItemName('Rail Driver', 'divine')).toBe("Seraph's Rail Driver");
        expect(weaponItemName('Rail Driver', 'transcendental')).toBe('Eternal Rail Driver');
    });

    test('an elemental weapon earns an "of X" epithet', () => {
        expect(weaponItemName('Rail Driver', 'legendary', 'PYRO')).toBe('Vanguard Rail Driver of Cinders');
        expect(weaponItemName('Storm Needles', 'epic', 'volt')).toBe("Tyrant's Storm Needles of the Storm");
        expect(weaponItemName('Lance Beam', 'rare', 'CRYO')).toBe('Honed Lance Beam of Frost');
    });

    test('KINETIC / unknown element → no epithet', () => {
        expect(weaponItemName('Pulse Cannon', 'rare', 'KINETIC')).toBe('Honed Pulse Cannon');
        expect(weaponItemName('Pulse Cannon', 'rare', 'WAT')).toBe('Honed Pulse Cannon');
    });

    test('unknown rarity falls back to the common "Stock" title', () => {
        expect(weaponItemName('Pulse Cannon', 'bogus')).toBe('Stock Pulse Cannon');
    });
});

describe('stock starter weapon items', () => {
    test('the common Pulse primary is named "Stock Pulse Cannon"', () => {
        expect(createWeaponItem(1, 'common', 'PULSE').name).toBe('Stock Pulse Cannon');
    });
    test('the common Charge Shot power is named "Stock Charge Shot"', () => {
        const it = createPowerWeaponItem('CHARGE_SHOT', 1, 'common');
        expect(it.name).toBe('Stock Charge Shot');
        expect(it.kind).toBe('powerweapon');
        expect(it.powerId).toBe('CHARGE_SHOT');
    });
});
