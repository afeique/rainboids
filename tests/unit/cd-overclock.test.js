// OVERCLOCK — energy keystone passive (a total economy INVERSION, framed as an
// alternate economy: a choice, neither pro nor con).
//
//   • While held, power weapons IGNORE the energy meter — they cost 0 energy
//     (no spend, no energy gate).
//   • They fire on a flat OVERCLOCK_COOLDOWN_MS internal cooldown instead (the
//     dedicated _overclockCdUntil timer is the SOLE gate — energy AND the
//     per-weapon powerCooldown are ignored).
//   • They deal OVERCLOCK_EFFECT_MULT (×0.6) effect — the tradeoff for free +
//     spammable.
//
// This unit suite validates the PASSIVES entry (sane fields), the tunable
// constants, and isPowerReady's gating with a minimal stub — both the Overclock
// timer-only path and the DEFAULT-SAFE energy-gated path (byte-for-byte
// unchanged without the keystone). It also drives firePower with a stub to
// assert energy is NOT spent under Overclock and the timer is stamped.
import { PASSIVES } from '../../js/modules/combat/passive-data.js';
import { isPowerReady, firePower } from '../../js/modules/player/weapons.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import {
    OVERCLOCK_COOLDOWN_MS,
    OVERCLOCK_EFFECT_MULT,
} from '../../js/modules/core/constants.js';

describe('PASSIVES — OVERCLOCK entry', () => {
    test('OVERCLOCK exists with sane fields', () => {
        const e = PASSIVES.OVERCLOCK;
        expect(e).toBeDefined();
        expect(e.id).toBe('OVERCLOCK');
        expect(typeof e.name).toBe('string');
        expect(e.name.length).toBeGreaterThan(0);
        expect(typeof e.desc).toBe('string');
        expect(e.desc.length).toBeGreaterThan(0);
        // Energy keystone, slot-equippable, binary stack, themed icon. No downside
        // (alternate economy, not a drawback).
        expect(e.tags).toContain('keystone');
        expect(e.tags).toContain('energy');
        expect(e.slot).toBe(true);
        expect(e.item).toBe(false);
        expect(e.stack).toBe('binary');
        expect(e.icon).toBe('bolt');
        expect(e.downside).toBeUndefined();
        // Hooks document the consumer sites.
        expect(e.hooks).toEqual(expect.arrayContaining(['power', 'energy']));
    });
});

describe('constants — OVERCLOCK tunables', () => {
    test('flat 2.5s cooldown, ×0.6 effect', () => {
        expect(OVERCLOCK_COOLDOWN_MS).toBe(2500);
        expect(OVERCLOCK_EFFECT_MULT).toBe(0.6);
    });
});

// Minimal player-like stub for isPowerReady. The function reads:
//   this.hasPassive(id), this._overclockCdUntil, this.powerCooldown,
//   this.energy, this.getPowerEnergyCost().
function makeReadyStub({
    overclock = false,
    overclockCdUntil = 0,
    powerCooldown = 0,
    energy = 100,
    cost = 30,
} = {}) {
    return {
        _overclockCdUntil: overclockCdUntil,
        powerCooldown,
        energy,
        hasPassive(id) { return overclock && id === 'OVERCLOCK'; },
        getPowerEnergyCost() { return cost; },
    };
}

describe('isPowerReady — OVERCLOCK timer-only gate', () => {
    test('with OVERCLOCK + timer in the past → ready REGARDLESS of energy=0', () => {
        const now = frameClock.now;
        const p = makeReadyStub({
            overclock: true,
            overclockCdUntil: now - 1, // already elapsed
            energy: 0,                 // would block the energy-gated path
            cost: 60,
            powerCooldown: 9999,       // would block the per-weapon path — Overclock ignores it
        });
        expect(isPowerReady.call(p)).toBe(true);
    });

    test('with OVERCLOCK + timer in the future → NOT ready (even with full energy)', () => {
        const now = frameClock.now;
        const p = makeReadyStub({
            overclock: true,
            overclockCdUntil: now + 10000, // not yet elapsed
            energy: 100,
            cost: 30,
            powerCooldown: 0,
        });
        expect(isPowerReady.call(p)).toBe(false);
    });

    test('with OVERCLOCK + missing timer (0) → ready (first cast)', () => {
        const p = makeReadyStub({ overclock: true, overclockCdUntil: 0, energy: 0 });
        delete p._overclockCdUntil; // exercise the (|| 0) fallback
        expect(isPowerReady.call(p)).toBe(true);
    });
});

describe('isPowerReady — DEFAULT-SAFE energy-gated path (no OVERCLOCK)', () => {
    test('energy < cost → NOT ready', () => {
        const p = makeReadyStub({ overclock: false, energy: 10, cost: 30, powerCooldown: 0 });
        expect(isPowerReady.call(p)).toBe(false);
    });

    test('energy >= cost → ready', () => {
        const p = makeReadyStub({ overclock: false, energy: 30, cost: 30, powerCooldown: 0 });
        expect(isPowerReady.call(p)).toBe(true);
    });

    test('powerCooldown > 0 → NOT ready even with enough energy (anti-spam floor)', () => {
        const p = makeReadyStub({ overclock: false, energy: 100, cost: 30, powerCooldown: 5 });
        expect(isPowerReady.call(p)).toBe(false);
    });
});

// firePower stub. firePower dispatches via switch(this.activePower); we use
// NOVA_BLAST (a simple non-charge case) and stub the fire fn + the helpers it
// reads. The point is to assert the ECONOMY: energy is NOT spent under Overclock
// and the cooldown timer is stamped.
function makeFireStub({ overclock = false, energy = 0 } = {}) {
    const calls = { nova: 0 };
    const p = {
        activePower: 'NOVA_BLAST',
        energy,
        powerCooldown: 0,
        _overclockCdUntil: 0,
        _resonanceUses: 0,
        getActivePowerConfig() { return { ringDamage: 50, cooldown: 4000 }; },
        getEffectiveMaxEnergy() { return 100; },
        getPowerEnergyCost() { return 45; },
        getPowerupStacks() { return 0; },
        hasPassive(id) { return overclock && id === 'OVERCLOCK'; },
        fireNova(config) { calls.nova++; calls.lastConfig = config; },
        // Unused branches in the NOVA_BLAST path, but defined defensively.
        layMine() {}, fireMissiles() {}, fireSingularity() {}, fireCryoBurst() {},
        fireOrbitalStrike() {}, activateOverdrive() {},
    };
    const audioManager = { playShoot() {} };
    return { p, calls, audioManager };
}

describe('firePower — OVERCLOCK economy inversion', () => {
    test('with OVERCLOCK: energy is NOT spent (0 cost) and the timer is stamped', () => {
        frameClock.now = Date.now();
        const { p, calls, audioManager } = makeFireStub({ overclock: true, energy: 0 });
        const before = frameClock.now;
        firePower.call(p, /* bulletPool */ null, audioManager, /* particlePool */ null);
        expect(p.energy).toBe(0);                 // no spend even at 0 energy
        expect(calls.nova).toBe(1);               // power actually fired
        // ×0.6 effect applied to the config the fire fn received.
        expect(calls.lastConfig.ringDamage).toBeCloseTo(50 * OVERCLOCK_EFFECT_MULT, 6);
        // Internal cooldown stamped ~2.5s out.
        expect(p._overclockCdUntil).toBeCloseTo(before + OVERCLOCK_COOLDOWN_MS, 0);
    });

    test('DEFAULT-SAFE: without OVERCLOCK, energy IS spent and the timer is untouched', () => {
        frameClock.now = Date.now();
        const { p, calls, audioManager } = makeFireStub({ overclock: false, energy: 100 });
        firePower.call(p, null, audioManager, null);
        expect(p.energy).toBe(100 - 45);          // normal energy spend (cost 45)
        expect(calls.nova).toBe(1);
        expect(calls.lastConfig.ringDamage).toBe(50); // base damage, no ×0.6
        expect(p._overclockCdUntil).toBe(0);          // never stamped
    });
});
