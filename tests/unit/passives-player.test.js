// Phase P2 — player-side PASSIVES state machine + apply pipeline. Binds the
// pure player/passives.js functions to a minimal stub (no heavy Player ctor)
// and pins: equip/own/slot gating, activePassives rebuild, hasPassive,
// getPassiveMod aggregation, ramp reset on swap, and the getEffective* fold.
import { describe, expect, test, afterEach } from '@jest/globals';
import * as passives from '../../js/modules/player/passives.js';
import { PASSIVES } from '../../js/modules/combat/passive-data.js';
import * as progression from '../../js/modules/player/progression.js';
import * as weapons from '../../js/modules/player/weapons.js';
import * as abilities from '../../js/modules/player/abilities.js';

function makeStub(over = {}) {
    return {
        equippedPassives: [null, null, null],
        ownedPassives: new Set(),
        activePassives: new Set(),
        passiveSlotsUnlocked: 1,
        _passiveRampState: new Map(),
        ...over,
    };
}
const equip = (s, slot, id) => passives.equipPassive.call(s, slot, id);
const own = (s, ids) => passives.setOwnedPassives.call(s, ids);
const slots = (s, n) => passives.setPassiveSlotsUnlocked.call(s, n);
const has = (s, id) => passives.hasPassive.call(s, id);
const mod = (s, k) => passives.getPassiveMod.call(s, k);

describe('P2 — passive state machine', () => {
    test('fresh stub: nothing active', () => {
        const s = makeStub();
        passives._rebuildActivePassives.call(s);
        expect(s.activePassives.size).toBe(0);
        expect(has(s, 'OPPORTUNIST')).toBe(false);
    });

    test('equipping an owned, slot-deliverable passive into an unlocked slot activates it', () => {
        const s = makeStub();
        own(s, ['OPPORTUNIST']);
        expect(equip(s, 0, 'OPPORTUNIST')).toBe(true);
        expect(has(s, 'OPPORTUNIST')).toBe(true);
        expect([...s.activePassives]).toEqual(['OPPORTUNIST']);
    });

    test('equipping an un-owned passive is rejected', () => {
        const s = makeStub();
        own(s, ['OPPORTUNIST']);
        expect(equip(s, 0, 'GLASS_CANNON')).toBe(false);
        expect(has(s, 'GLASS_CANNON')).toBe(false);
    });

    test('a locked slot rejects equips (slot 2 with only 1 unlocked)', () => {
        const s = makeStub();
        own(s, ['OPPORTUNIST', 'LAST_BASTION']);
        expect(equip(s, 1, 'LAST_BASTION')).toBe(false);
        slots(s, 2);
        expect(equip(s, 1, 'LAST_BASTION')).toBe(true);
        expect(has(s, 'LAST_BASTION')).toBe(true);
    });

    test('non-slot-deliverable passives (item-only) cannot be slotted', () => {
        const s = makeStub();
        own(s, ['SALVAGE_PROTOCOL']);
        expect(PASSIVES.SALVAGE_PROTOCOL.slot).toBe(false);
        expect(equip(s, 0, 'SALVAGE_PROTOCOL')).toBe(false);
    });

    test('a passive cannot occupy two slots — equipping again moves it', () => {
        const s = makeStub({ passiveSlotsUnlocked: 3 });
        own(s, ['OPPORTUNIST']);
        equip(s, 0, 'OPPORTUNIST');
        equip(s, 2, 'OPPORTUNIST');
        expect(s.equippedPassives[0]).toBeNull();
        expect(s.equippedPassives[2]).toBe('OPPORTUNIST');
        expect([...s.activePassives]).toEqual(['OPPORTUNIST']);
    });

    test('clearing a slot (null) deactivates it', () => {
        const s = makeStub();
        own(s, ['OPPORTUNIST']);
        equip(s, 0, 'OPPORTUNIST');
        expect(equip(s, 0, null)).toBe(true);
        expect(has(s, 'OPPORTUNIST')).toBe(false);
    });

    test('reducing unlocked slots drops the now-locked slot from active', () => {
        const s = makeStub({ passiveSlotsUnlocked: 2 });
        own(s, ['OPPORTUNIST', 'LAST_BASTION']);
        equip(s, 0, 'OPPORTUNIST');
        equip(s, 1, 'LAST_BASTION');
        expect(s.activePassives.size).toBe(2);
        slots(s, 1);
        expect(has(s, 'OPPORTUNIST')).toBe(true);   // slot 0 still unlocked
        expect(has(s, 'LAST_BASTION')).toBe(false); // slot 1 now locked
    });

    test('swapping a slot resets the outgoing + incoming passive ramp state', () => {
        const s = makeStub({ passiveSlotsUnlocked: 2 });
        own(s, ['OPPORTUNIST', 'LAST_BASTION']);
        equip(s, 0, 'OPPORTUNIST');
        s._passiveRampState.set('OPPORTUNIST', { stacks: 5 });
        s._passiveRampState.set('LAST_BASTION', { stacks: 9 });
        equip(s, 0, 'LAST_BASTION'); // swap slot 0
        expect(s._passiveRampState.has('OPPORTUNIST')).toBe(false); // outgoing reset
        expect(s._passiveRampState.has('LAST_BASTION')).toBe(false); // incoming reset
    });
});

describe('P2 — keystone budget (round-3 §11.A, ≤2 equipped keystones)', () => {
    test('a third equipped keystone is rejected; modular still fits', () => {
        const s = makeStub({ passiveSlotsUnlocked: 5 });
        // GLASS_CANNON / GUNSLINGER / PURIST are slot-only keystones; OPPORTUNIST is modular.
        own(s, ['GLASS_CANNON', 'GUNSLINGER', 'PURIST', 'OPPORTUNIST']);
        expect(equip(s, 0, 'GLASS_CANNON')).toBe(true);
        expect(equip(s, 1, 'GUNSLINGER')).toBe(true);
        expect(equip(s, 2, 'PURIST')).toBe(false);      // 3rd keystone over budget
        expect(equip(s, 2, 'OPPORTUNIST')).toBe(true);  // modular is fine
        expect(s.activePassives.has('PURIST')).toBe(false);
        expect(s.activePassives.has('OPPORTUNIST')).toBe(true);
    });

    test('swapping a keystone in place (same slot) is allowed within budget', () => {
        const s = makeStub({ passiveSlotsUnlocked: 5 });
        own(s, ['GLASS_CANNON', 'GUNSLINGER', 'PURIST']);
        equip(s, 0, 'GLASS_CANNON');
        equip(s, 1, 'GUNSLINGER');
        // Replacing the keystone already in slot 0 doesn't exceed the budget
        // (the outgoing one in this slot isn't counted).
        expect(equip(s, 0, 'PURIST')).toBe(true);
        expect(s.equippedPassives[0]).toBe('PURIST');
    });
});

describe('P2 — getPassiveMod aggregation', () => {
    afterEach(() => {
        // Clean up any injected mods so other suites see the pristine registry.
        delete PASSIVES.OPPORTUNIST.mods;
        delete PASSIVES.LAST_BASTION.mods;
    });

    test('returns 0 when no active passive declares the key', () => {
        const s = makeStub();
        own(s, ['OPPORTUNIST']);
        equip(s, 0, 'OPPORTUNIST');
        expect(mod(s, 'critChance')).toBe(0);
        expect(mod(s, 'maxHp')).toBe(0);
    });

    test('sums numeric mods across active passives', () => {
        PASSIVES.OPPORTUNIST.mods = { critChance: 5, maxHp: 10 };
        PASSIVES.LAST_BASTION.mods = { critChance: 3 };
        const s = makeStub({ passiveSlotsUnlocked: 2 });
        own(s, ['OPPORTUNIST', 'LAST_BASTION']);
        equip(s, 0, 'OPPORTUNIST');
        equip(s, 1, 'LAST_BASTION');
        expect(mod(s, 'critChance')).toBe(8); // 5 + 3
        expect(mod(s, 'maxHp')).toBe(10);
    });

    test('an inactive (locked-slot) passive does not contribute', () => {
        PASSIVES.LAST_BASTION.mods = { critChance: 3 };
        const s = makeStub({ passiveSlotsUnlocked: 1 });
        own(s, ['OPPORTUNIST', 'LAST_BASTION']);
        equip(s, 0, 'OPPORTUNIST');
        equip(s, 1, 'LAST_BASTION'); // rejected (locked) → not active
        expect(mod(s, 'critChance')).toBe(0);
    });
});

describe('P2 — getPassiveMod folds into getEffective* getters', () => {
    afterEach(() => { delete PASSIVES.OPPORTUNIST.mods; });

    test('getEffectiveCritChance picks up a passive critChance mod', () => {
        PASSIVES.OPPORTUNIST.mods = { critChance: 5 };
        const s = makeStub({
            baseCritChance: 10,
            getPowerupStacks: () => 0,
            getItemAffixTotal: () => 0,
            spStats: {},
        });
        // Wire the real passive methods onto the stub so the getter's
        // `this.getPassiveMod` resolves like it does on a Player.
        s.getPassiveMod = (k) => passives.getPassiveMod.call(s, k);
        own(s, ['OPPORTUNIST']);
        equip(s, 0, 'OPPORTUNIST');
        expect(progression.getEffectiveCritChance.call(s)).toBe(15); // 10 base + 5 passive
    });
});

describe('P6 — passive effect batch 1 (Glass Cannon multipliers)', () => {
    test('getPassiveDamageMult / getPassiveMaxHpMult default to 1, then reflect Glass Cannon', () => {
        const s = makeStub();
        own(s, ['GLASS_CANNON']);
        // owned but not equipped → no effect
        expect(passives.getPassiveDamageMult.call(s)).toBe(1);
        expect(passives.getPassiveMaxHpMult.call(s)).toBe(1);
        equip(s, 0, 'GLASS_CANNON');
        expect(passives.getPassiveDamageMult.call(s)).toBeCloseTo(1.6);
        expect(passives.getPassiveMaxHpMult.call(s)).toBe(0.5);
    });

    test('getEffectiveMaxHealth halves with Glass Cannon equipped', () => {
        const s = makeStub({
            maxHealth: 200,
            getPowerupStacks: () => 0,
            getItemAffixTotal: () => 0,
            spStats: {},
        });
        s.getPassiveMod = (k) => passives.getPassiveMod.call(s, k);
        s.getPassiveMaxHpMult = () => passives.getPassiveMaxHpMult.call(s);
        own(s, ['GLASS_CANNON']);
        expect(progression.getEffectiveMaxHealth.call(s)).toBe(200); // not equipped
        equip(s, 0, 'GLASS_CANNON');
        expect(progression.getEffectiveMaxHealth.call(s)).toBe(100); // ×0.5
    });

    test('multipliers compound across active passives', () => {
        // Inject a second damageMult passive temporarily to prove the product.
        PASSIVES.OPPORTUNIST.damageMult = 1.5;
        try {
            const s = makeStub({ passiveSlotsUnlocked: 2 });
            own(s, ['GLASS_CANNON', 'OPPORTUNIST']);
            equip(s, 0, 'GLASS_CANNON');
            equip(s, 1, 'OPPORTUNIST');
            expect(passives.getPassiveDamageMult.call(s)).toBeCloseTo(1.6 * 1.5);
        } finally {
            delete PASSIVES.OPPORTUNIST.damageMult;
        }
    });
});

describe('P6 batch 3 — Failsafe maxHP + Overflow Spark', () => {
    test('Failsafe applies a 0.85 max-HP multiplier', () => {
        const s = makeStub({ maxHealth: 200, getPowerupStacks: () => 0, getItemAffixTotal: () => 0, spStats: {} });
        s.getPassiveMod = (k) => passives.getPassiveMod.call(s, k);
        s.getPassiveMaxHpMult = () => passives.getPassiveMaxHpMult.call(s);
        own(s, ['FAILSAFE']);
        equip(s, 0, 'FAILSAFE');
        expect(passives.getPassiveMaxHpMult.call(s)).toBeCloseTo(0.85);
        expect(progression.getEffectiveMaxHealth.call(s)).toBe(170); // 200 × 0.85
    });

    test('Overflow Spark: +25% primary damage only at full energy', () => {
        const base = {
            activePrimary: 'X',
            getActivePrimaryConfig: () => ({ damage: 10 }),
            getPowerupStacks: () => 0,
            overdriveTimer: 0,
            maxEnergy: 100,
        };
        const has = (id) => id === 'OVERFLOW_SPARK';
        // Full energy + passive → ×1.25 vs empty energy (ratio is robust to any
        // platform mobile multiplier baked into the getter).
        const full = { ...base, energy: 100, hasPassive: has };
        const empty = { ...base, energy: 0, hasPassive: has };
        const dFull = weapons.getEffectivePrimaryDamage.call(full);
        const dEmpty = weapons.getEffectivePrimaryDamage.call(empty);
        expect(dFull / dEmpty).toBeCloseTo(1.25);
    });
});

describe('P6 batch 7 — Gunslinger (pure-gunner)', () => {
    const gunBase = {
        activePrimary: 'X',
        getActivePrimaryConfig: () => ({ damage: 10, fireRate: 130 }),
        getPowerupStacks: () => 0,
        overdriveTimer: 0,
        maxEnergy: 100, energy: 0,
        _fireHoldTime: 0,
    };
    const gun = () => ({ ...gunBase, hasPassive: (id) => id === 'GUNSLINGER' });
    const plain = () => ({ ...gunBase, hasPassive: () => false });

    test('+50% primary damage', () => {
        expect(weapons.getEffectivePrimaryDamage.call(gun()) / weapons.getEffectivePrimaryDamage.call(plain()))
            .toBeCloseTo(1.5);
    });
    test('+30% fire rate (shorter interval)', () => {
        // interval ratio plain/gun ≈ 1.3 (gun fires faster → smaller interval)
        expect(weapons.getEffectivePrimaryFireRate.call(plain()) / weapons.getEffectivePrimaryFireRate.call(gun()))
            .toBeCloseTo(1.3, 1);
    });
    // §6c no-downsides rework (6.208.x): Gunslinger NO LONGER disables power
    // weapons or abilities — the "no powers" was never the point. The old
    // "disables abilities / disables power weapons" tests were removed; the
    // metadata (no `downside`, no `disableSlots` hook) is asserted in
    // passives-no-downsides.test.js, and the +50%/+30% upside stays above.
});

describe('P6 batch 4 — Purist (+40% damage + pierce, §6c no-downsides)', () => {
    test('Purist no longer zeroes crit (no-crit downside removed): crit = base + stacks', () => {
        const s = makeStub({
            hasPassive: (id) => id === 'PURIST',
            baseCritChance: 10,
            getPowerupStacks: () => 5,
            getItemAffixTotal: () => 0,
            spStats: {},
        });
        // 10 base + 5×7/stack = 45; Purist used to force 0, now it can crit.
        expect(progression.getEffectiveCritChance.call(s)).toBe(45);
    });

    test('Purist contributes a 1.4 damage multiplier', () => {
        const s = makeStub();
        own(s, ['PURIST']);
        equip(s, 0, 'PURIST');
        expect(passives.getPassiveDamageMult.call(s)).toBeCloseTo(1.4);
    });
});

describe('P6 batch 2 — Hoarder\'s Greed gold-find', () => {
    test('getGoldFindMultiplier doubles with Hoarder\'s Greed active', () => {
        const base = makeStub();
        base.hasPassive = () => false;
        base.gameEngine = null;
        const withGreed = makeStub();
        withGreed.hasPassive = (id) => id === 'HOARDERS_GREED';
        withGreed.gameEngine = null;
        const b = progression.getGoldFindMultiplier.call(base);
        const g = progression.getGoldFindMultiplier.call(withGreed);
        expect(g).toBeCloseTo(b * 2);
    });
});
