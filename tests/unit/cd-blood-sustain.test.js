// T9 — CD "blood" sustain passives: SANGUINE + HEMOGLUTTON (both no-downside,
// passive-gated). Headline guarantee is DEFAULT-SAFE:
//   • SANGUINE heals 4% of max HP per kill; the on-kill heal is gated on
//     hasPassive('SANGUINE') in combat-manager.onEnemyKill, so a player without
//     it does zero extra work. sanguineHealAmount is the pure curve.
//   • HEMOGLUTTON doubles lifesteal when it lands on a status-afflicted enemy;
//     the doubling is a gated ternary at the enemy-lifesteal site in
//     collision-system.js. Without the passive (or vs a status-free enemy) the
//     plain applied amount is fed — byte-for-byte as before.
// This suite isolates the pure heal math + a faithful mirror of the lifesteal
// gate, and asserts the two passive entries exist with the right shape.
import { describe, expect, test } from '@jest/globals';
import {
    SANGUINE_HEAL_FRAC,
    sanguineHealAmount,
} from '../../js/modules/combat/combat-manager.js';
import { PASSIVES, getPassive } from '../../js/modules/combat/passive-data.js';

// ── SANGUINE — pure on-kill heal amount (4% of max HP) ───────────────────────
describe('T9 — sanguineHealAmount (maxHp → heal amount)', () => {
    test('heals 4% of max HP', () => {
        expect(SANGUINE_HEAL_FRAC).toBeCloseTo(0.04, 5);
        expect(sanguineHealAmount(100)).toBeCloseTo(4, 5);
        expect(sanguineHealAmount(250)).toBeCloseTo(10, 5);
    });

    test('scales linearly with max HP', () => {
        expect(sanguineHealAmount(1000)).toBeCloseTo(1000 * SANGUINE_HEAL_FRAC, 5);
    });

    test('honors an explicit fraction override', () => {
        expect(sanguineHealAmount(100, 0.1)).toBeCloseTo(10, 5);
    });

    test('DEFAULT-SAFE: non-positive / garbage max HP heals nothing', () => {
        expect(sanguineHealAmount(0)).toBe(0);
        expect(sanguineHealAmount(-50)).toBe(0);
        expect(sanguineHealAmount(undefined)).toBe(0);
        expect(sanguineHealAmount(NaN)).toBe(0);
    });
});

// ── HEMOGLUTTON — lifesteal doubling gate (mirrors collision-system) ─────────
// Faithful stand-in for the gated ternary at the enemy-lifesteal site: feed
// double the applied amount only when the passive is equipped AND the target is
// status-afflicted; otherwise feed the plain base.
function hemoglottonLifesteal(base, hasPassive, statusAfflicted) {
    return (hasPassive && statusAfflicted) ? base * 2 : base;
}

describe('T9 — hemoglottonLifesteal (base, hasPassive, statusAfflicted)', () => {
    test('doubles only with the passive AND a status-afflicted enemy', () => {
        expect(hemoglottonLifesteal(10, true, true)).toBe(20);
    });

    test('DEFAULT-SAFE: no passive → base, regardless of status', () => {
        expect(hemoglottonLifesteal(10, false, true)).toBe(10);
        expect(hemoglottonLifesteal(10, false, false)).toBe(10);
    });

    test('DEFAULT-SAFE: passive but status-free enemy → base', () => {
        expect(hemoglottonLifesteal(10, true, false)).toBe(10);
    });

    test('zero lifesteal stays zero even when doubled (no-Vampirism no-op)', () => {
        expect(hemoglottonLifesteal(0, true, true)).toBe(0);
    });
});

// ── Passive-data entries exist with the right shape ──────────────────────────
describe('T9 — SANGUINE / HEMOGLUTTON passive entries', () => {
    test('SANGUINE entry exists, no-downside, sensible shape', () => {
        const p = getPassive('SANGUINE');
        expect(p).toBeTruthy();
        expect(p).toBe(PASSIVES.SANGUINE);
        expect(p.id).toBe('SANGUINE');
        expect(p.name).toBe('Sanguine');
        expect(typeof p.desc).toBe('string');
        expect(p.desc.length).toBeGreaterThan(0);
        expect(p.slot).toBe(true);
        expect(p.item).toBe(true);
        expect(Array.isArray(p.hooks)).toBe(true);
        expect(p.hooks).toContain('onKill');
        expect(Array.isArray(p.tags)).toBe(true);
        expect(p.tags).toContain('sustain');
        expect(p.downside).toBeUndefined(); // no-downside
        expect(typeof p.icon).toBe('string'); // icon merged on
    });

    test('HEMOGLUTTON entry exists, no-downside, sensible shape', () => {
        const p = getPassive('HEMOGLUTTON');
        expect(p).toBeTruthy();
        expect(p).toBe(PASSIVES.HEMOGLUTTON);
        expect(p.id).toBe('HEMOGLUTTON');
        expect(p.name).toBe('Hemoglutton');
        expect(typeof p.desc).toBe('string');
        expect(p.desc.length).toBeGreaterThan(0);
        expect(p.slot).toBe(true);
        expect(p.item).toBe(true);
        expect(Array.isArray(p.hooks)).toBe(true);
        expect(p.hooks).toContain('heal');
        expect(Array.isArray(p.tags)).toBe(true);
        expect(p.tags).toContain('sustain');
        expect(p.downside).toBeUndefined(); // no-downside
        expect(typeof p.icon).toBe('string'); // icon merged on
    });
});
