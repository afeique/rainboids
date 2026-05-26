// CAPACITOR_BANK — energy-overcharge keystone passive.
//
//   • While held, the energy meter may OVERCHARGE past the normal effective cap
//     (getEffectiveMaxEnergy), up to CAPACITOR_BANK_OVERCHARGE_MULT× that cap.
//   • The portion ABOVE the normal cap bleeds off at CAPACITOR_BANK_DECAY_PER_SEC
//     per second, floored at the normal cap (never below — regen owns 0..100%).
//   • Powers fired while overcharged deal +CAPACITOR_BANK_DMG_BONUS. (The live
//     +25% boost + the clamp/decay wiring are exercised by
//     tests/qa/48-capacitor-bank.spec.js.)
//
// This unit suite validates the PASSIVES entry (sane fields), the pure
// getEnergyOverchargeCap clamp helper (×1.5 with the passive, ×1 without —
// DEFAULT-SAFE), and the pure capacitorBankDecayStep helper (excess bleeds toward
// the normal cap, floors there, no-ops below the cap).
import * as progression from '../../js/modules/player/progression.js';
import { PASSIVES } from '../../js/modules/combat/passive-data.js';
import {
    CAPACITOR_BANK_OVERCHARGE_MULT,
    CAPACITOR_BANK_DECAY_PER_SEC,
    CAPACITOR_BANK_DMG_BONUS,
} from '../../js/modules/core/constants.js';

// Minimal player stub. getEnergyOverchargeCap calls this.getEffectiveMaxEnergy()
// and this.hasPassive(); we provide both so the helper is testable in isolation.
function makePlayer({ held = false, maxEnergy = 100 } = {}) {
    return {
        maxEnergy,
        getEffectiveMaxEnergy() { return this.maxEnergy; },
        hasPassive(id) { return held && id === 'CAPACITOR_BANK'; },
    };
}

describe('PASSIVES — CAPACITOR_BANK entry', () => {
    test('CAPACITOR_BANK exists with sane fields', () => {
        const e = PASSIVES.CAPACITOR_BANK;
        expect(e).toBeDefined();
        expect(e.id).toBe('CAPACITOR_BANK');
        expect(typeof e.name).toBe('string');
        expect(e.name.length).toBeGreaterThan(0);
        expect(typeof e.desc).toBe('string');
        expect(e.desc.length).toBeGreaterThan(0);
        // Energy keystone, slot-equippable, binary stack, themed battery icon.
        expect(e.tags).toContain('keystone');
        expect(e.tags).toContain('energy');
        expect(e.slot).toBe(true);
        expect(e.stack).toBe('binary');
        expect(e.icon).toBe('battery');
        // Hooks document the consumer sites.
        expect(e.hooks).toEqual(expect.arrayContaining(['maxEnergy', 'energyRegen', 'damage']));
    });
});

describe('constants — CAPACITOR_BANK tunables', () => {
    test('overcharge mult is 1.5 (150%), decay 8/s, damage +25%', () => {
        expect(CAPACITOR_BANK_OVERCHARGE_MULT).toBe(1.5);
        expect(CAPACITOR_BANK_DECAY_PER_SEC).toBe(8);
        expect(CAPACITOR_BANK_DMG_BONUS).toBe(1.25);
    });
});

describe('getEnergyOverchargeCap — the clamp ceiling', () => {
    test('DEFAULT-SAFE: without the passive, cap == getEffectiveMaxEnergy()', () => {
        expect(progression.getEnergyOverchargeCap.call(makePlayer({ held: false }))).toBe(100);
    });

    test('with the passive, cap == 1.5× the normal effective cap', () => {
        expect(progression.getEnergyOverchargeCap.call(makePlayer({ held: true }))).toBe(150);
    });

    test('scales off the (CAPACITOR-boosted) normal cap, not the base', () => {
        // A higher effective cap (e.g. 200 from CAPACITOR) → overcharge cap 300.
        expect(progression.getEnergyOverchargeCap.call(makePlayer({ held: true, maxEnergy: 200 }))).toBe(300);
        // Default-safe still holds at the higher cap.
        expect(progression.getEnergyOverchargeCap.call(makePlayer({ held: false, maxEnergy: 200 }))).toBe(200);
    });
});

describe('capacitorBankDecayStep — overcharge bleed-off', () => {
    test('overcharge above the normal cap bleeds by DECAY_PER_SEC × dt', () => {
        // 130 energy, cap 100, 1000ms → 130 − 8 = 122.
        expect(progression.capacitorBankDecayStep(130, 100, 1000)).toBeCloseTo(122, 10);
        // 250ms → 130 − 2 = 128.
        expect(progression.capacitorBankDecayStep(130, 100, 250)).toBeCloseTo(128, 10);
    });

    test('floors at the normal cap (never decays below it)', () => {
        // A big step that would overshoot: 102 energy, cap 100, 1000ms (−8) floors at 100.
        expect(progression.capacitorBankDecayStep(102, 100, 1000)).toBe(100);
    });

    test('no-op at or below the normal cap (regen owns the 0..100% zone)', () => {
        expect(progression.capacitorBankDecayStep(100, 100, 1000)).toBe(100);
        expect(progression.capacitorBankDecayStep(40, 100, 1000)).toBe(40);
    });

    test('no-op when dt is zero or negative', () => {
        expect(progression.capacitorBankDecayStep(130, 100, 0)).toBe(130);
        expect(progression.capacitorBankDecayStep(130, 100, -50)).toBe(130);
    });
});
