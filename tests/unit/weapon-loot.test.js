// T30 — Weapon-as-loot core: a rolled weapon ITEM ({archetype, rarity, traits,
// element}) equips, its ELEMENT/BEHAVIOR traits stamp fired bullets, and its
// per-run level + STAT/POWERUP damage traits scale primary damage. Exercised
// through the real weapons.js functions with lightweight `this` stubs.

import { describe, expect, test } from '@jest/globals';
import {
    applyWeaponTraits, equipWeaponItem, getEquippedWeapon,
    hasWeaponTrait, weaponTraitValue, getEffectivePrimaryDamage,
    getEffectivePrimaryFireRate,
} from '../../js/modules/player/weapons.js';
import { getEffectiveCritChance } from '../../js/modules/player/progression.js';
import { weaponLevelScale, archetypeToWeaponId } from '../../js/modules/combat/weapon-data.js';

function weapon(archetype, traits = []) {
    return { archetype, rarity: 'common', traits, element: 'KINETIC' };
}

describe('T30 — equipWeaponItem points activePrimary at the archetype pattern', () => {
    test('equipping sets the firing pattern + stores the item', () => {
        const p = {};
        equipWeaponItem.call(p, weapon('RAIL', [{ id: 'PIERCE', class: 'BEHAVIOR', value: 2 }]));
        expect(p.activePrimary).toBe('RAIL_DRIVER');
        expect(getEquippedWeapon.call(p).archetype).toBe('RAIL');
        expect(hasWeaponTrait.call(p, 'PIERCE')).toBe(true);
        expect(weaponTraitValue.call(p, 'PIERCE')).toBe(2);
    });

    test('unknown archetype falls back to PULSE_CANNON; null clears', () => {
        expect(archetypeToWeaponId('NONSENSE')).toBe('PULSE_CANNON');
        const p = {};
        equipWeaponItem.call(p, null);
        expect(getEquippedWeapon.call(p)).toBeNull();
    });
});

describe('T30 — traits stamp the bullet', () => {
    test('ELEMENT trait overrides the bullet element', () => {
        const p = { equippedWeapon: weapon('PULSE', [{ id: 'PYRO', class: 'ELEMENT' }]) };
        const b = { elements: ['KINETIC'], element: 'KINETIC' };
        applyWeaponTraits.call(p, b);
        expect(b.element).toBe('PYRO');
        expect(b.elements).toEqual(['PYRO']);
    });

    test('BEHAVIOR traits materialize into the same bullet fields the mods used', () => {
        const p = { equippedWeapon: weapon('PULSE', [
            { id: 'PIERCE', class: 'BEHAVIOR', value: 2 },
            { id: 'EXPLOSIVE', class: 'BEHAVIOR' },
            { id: 'HOMING', class: 'BEHAVIOR' },
            { id: 'SPLIT', class: 'BEHAVIOR', value: 3 },
            { id: 'RICOCHET', class: 'BEHAVIOR', value: 1 },
            { id: 'KNOCKBACK', class: 'BEHAVIOR', value: 30 },
            { id: 'STUN', class: 'BEHAVIOR', value: 20 },
        ]) };
        const b = {};
        applyWeaponTraits.call(p, b);
        expect(b.piercing).toBe(2);
        expect(b.explosive).toBe(true);
        expect(b.explosionRadius).toBeGreaterThanOrEqual(40);
        expect(b.homing).toBe(true);
        expect(b.homingStrength).toBeGreaterThan(0);
        expect(b.splitOnImpact).toBe(true);
        expect(b.splitCount).toBe(3);
        expect(b.bounces).toBe(1);
        expect(b.knockbackChance).toBeCloseTo(0.30, 6);
        expect(b.stunChance).toBeCloseTo(0.20, 6);
    });

    test('no equipped weapon → no stamping (legacy path untouched)', () => {
        const p = { equippedWeapon: null };
        const b = { element: 'KINETIC' };
        applyWeaponTraits.call(p, b);
        expect(b.element).toBe('KINETIC');
        expect(b.piercing).toBeUndefined();
    });
});

describe('T30 — primary damage scales with level + damage traits', () => {
    // Minimal stub matching getEffectivePrimaryDamage's reads. activePrimary is
    // RAIL_DRIVER so the PULSE-only OVERCHARGE branch is skipped.
    function dmgStub(level, traits = []) {
        return {
            activePrimary: 'RAIL_DRIVER',
            overdriveTimer: 0,
            level,
            equippedWeapon: traits.length || level ? weapon('RAIL', traits) : null,
            getActivePrimaryConfig: () => ({ damage: 10 }),
            getPowerupStacks: () => 0,
            hasPassive: () => false,
        };
    }

    test('base damage grows with the per-run level by weaponLevelScale', () => {
        const d1 = getEffectivePrimaryDamage.call(dmgStub(1));
        const d25 = getEffectivePrimaryDamage.call(dmgStub(25));
        // Ratio cancels any constant (e.g. mobile) multiplier shared by both.
        expect(d25 / d1).toBeCloseTo(weaponLevelScale(25), 5);
    });

    test('+% Damage / Overcharge traits add weapon-local damage', () => {
        const plain = getEffectivePrimaryDamage.call(dmgStub(1));
        const buffed = getEffectivePrimaryDamage.call(
            dmgStub(1, [{ id: 'DAMAGE_PCT', class: 'STAT', value: 30 }, { id: 'OVERCHARGE', class: 'POWERUP', value: 20 }]),
        );
        // +30% + 20% = +50% at level 1 (level scale ×1.0 for both).
        expect(buffed / plain).toBeCloseTo(1.5, 5);
    });
});

describe('T30 — fire rate / crit / per-bullet POWERUP+STAT traits (sub-step B)', () => {
    function frStub(traits = []) {
        return {
            activePrimary: 'RAIL_DRIVER',
            overdriveTimer: 0,
            heat: 0,
            equippedWeapon: traits.length ? weapon('RAIL', traits) : null,
            getActivePrimaryConfig: () => ({ fireRate: 400 }),
            getPowerupStacks: () => 0,
            hasPassive: () => false,
        };
    }

    test('Fire Rate / Rapidfire traits shorten the fire interval', () => {
        expect(getEffectivePrimaryFireRate.call(frStub())).toBe(400);
        // +25% fire rate → 400 / 1.25 = 320ms.
        expect(getEffectivePrimaryFireRate.call(frStub([{ id: 'FIRE_RATE_PCT', class: 'STAT', value: 25 }]))).toBe(320);
        expect(getEffectivePrimaryFireRate.call(frStub([{ id: 'RAPIDFIRE', class: 'POWERUP', value: 25 }]))).toBe(320);
    });

    test('CRIT_CHANCE_PCT adds to effective crit chance', () => {
        const base = { baseCritChance: 8, getPowerupStacks: () => 0, spStats: {}, equippedItems: {}, level: 1, equippedWeapon: null };
        expect(getEffectiveCritChance.call(base)).toBe(8);
        const buffed = { ...base, equippedWeapon: weapon('RAIL', [{ id: 'CRIT_CHANCE_PCT', class: 'STAT', value: 10 }]) };
        expect(getEffectiveCritChance.call(buffed)).toBe(18);
    });

    test('BIG_BULLETS / LONG_RANGE / PROJECTILE_SPEED stamp the bullet', () => {
        const p = { equippedWeapon: weapon('PULSE', [
            { id: 'BIG_BULLETS', class: 'POWERUP', value: 40 },
            { id: 'LONG_RANGE', class: 'POWERUP', value: 40 },
            { id: 'PROJECTILE_SPEED_PCT', class: 'STAT', value: 50 },
        ]) };
        const b = { radius: 5, rangeMultiplier: 1, vel: { x: 10, y: 0 } };
        applyWeaponTraits.call(p, b);
        expect(b.radius).toBeCloseTo(7, 6);     // 5 × 1.4
        expect(b.baseRadius).toBeCloseTo(7, 6);
        expect(b.rangeMultiplier).toBeCloseTo(1.4, 6);
        expect(b.vel.x).toBeCloseTo(15, 6);     // 10 × 1.5
    });
});
