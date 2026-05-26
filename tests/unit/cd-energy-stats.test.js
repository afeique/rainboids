// CD energy-economy build axis (CD-01 + CD-06 + CD-05).
// Validates the three new SP stats (CAPACITOR / REACTOR / EFFICIENCY) and the
// three effective getters that read them. The headline guarantee is
// DEFAULT-SAFE: with 0 points allocated, every getter collapses to the exact
// pre-CD value, so the game behaves byte-for-byte as before.
import * as progression from '../../js/modules/player/progression.js';
import { spStatValue, SP_STATS, SP_STAT_MAX_POINTS } from '../../js/modules/core/sp-stats.js';
import { EFFICIENCY_CAP } from '../../js/modules/core/constants.js';

const FULL = SP_STAT_MAX_POINTS; // 20 — a fully-invested stat

// Minimal player stub matching how progression getters read state.
function makePlayer(spStats = {}) {
    return {
        maxEnergy: 100,
        energy: 0,
        spStats: { ...Object.fromEntries(SP_STATS.map((s) => [s.id, 0])), ...spStats },
    };
}

describe('CD-01 — spStatValue for the three energy stats', () => {
    test('CAPACITOR: 0 → 0, full → +100 max energy', () => {
        expect(spStatValue('CAPACITOR', 0)).toBe(0);
        expect(spStatValue('CAPACITOR', FULL)).toBe(100);
    });

    test('REACTOR: 0 → 0, full → +100 (% regen)', () => {
        expect(spStatValue('REACTOR', 0)).toBe(0);
        expect(spStatValue('REACTOR', FULL)).toBe(100);
    });

    test('EFFICIENCY: 0 → 0, full → 50 (% power-cost reduction)', () => {
        expect(spStatValue('EFFICIENCY', 0)).toBe(0);
        expect(spStatValue('EFFICIENCY', FULL)).toBe(50);
    });

    test('the three stats are surfaced in SP_STATS with the right caps/icons', () => {
        const byId = Object.fromEntries(SP_STATS.map((s) => [s.id, s]));
        expect(byId.CAPACITOR.max).toBe(100);
        expect(byId.CAPACITOR.icon).toBe('battery');
        expect(byId.REACTOR.max).toBe(100);
        expect(byId.REACTOR.icon).toBe('bolt');
        expect(byId.EFFICIENCY.max).toBe(50);
        expect(byId.EFFICIENCY.icon).toBe('chart');
    });
});

describe('CD-06 — getEffectiveMaxEnergy (CAPACITOR)', () => {
    test('default-safe: 0 pts → base maxEnergy (100)', () => {
        expect(progression.getEffectiveMaxEnergy.call(makePlayer())).toBe(100);
    });

    test('full CAPACITOR → 200', () => {
        expect(progression.getEffectiveMaxEnergy.call(makePlayer({ CAPACITOR: FULL }))).toBe(200);
    });

    test('scales linearly with points (10 pts → 150)', () => {
        expect(progression.getEffectiveMaxEnergy.call(makePlayer({ CAPACITOR: 10 }))).toBe(150);
    });
});

describe('CD-06 — getEffectiveEnergyRegenMult (REACTOR)', () => {
    test('default-safe: 0 pts → 1', () => {
        expect(progression.getEffectiveEnergyRegenMult.call(makePlayer())).toBe(1);
    });

    test('full REACTOR → 2× fill rate', () => {
        expect(progression.getEffectiveEnergyRegenMult.call(makePlayer({ REACTOR: FULL }))).toBe(2);
    });

    test('scales linearly with points (10 pts → 1.5×)', () => {
        expect(progression.getEffectiveEnergyRegenMult.call(makePlayer({ REACTOR: 10 }))).toBe(1.5);
    });
});

describe('CD-06/CD-05 — getEffectivePowerCost (EFFICIENCY, capped at −50%)', () => {
    test('default-safe: 0 pts → base cost unchanged', () => {
        expect(progression.getEffectivePowerCost.call(makePlayer(), 45)).toBe(45);
        expect(progression.getEffectivePowerCost.call(makePlayer(), 0)).toBe(0);
    });

    test('full EFFICIENCY → 0.5× base cost (the cap)', () => {
        expect(progression.getEffectivePowerCost.call(makePlayer({ EFFICIENCY: FULL }), 60)).toBe(30);
    });

    test('partial EFFICIENCY scales the discount (10 pts → −25% → 0.75×)', () => {
        expect(progression.getEffectivePowerCost.call(makePlayer({ EFFICIENCY: 10 }), 40)).toBe(30);
    });

    test('CD-05 cap: even past full investment the discount never exceeds 50%', () => {
        // Force a points value beyond the cap to prove the clamp guards, not
        // just the stat cap. spStatValue clamps points, so we also assert the
        // EFFICIENCY_CAP constant is the floor at full investment.
        const overCapped = progression.getEffectivePowerCost.call(makePlayer({ EFFICIENCY: 999 }), 100);
        expect(overCapped).toBe(50);
        expect(EFFICIENCY_CAP).toBe(0.5);
        // Cost is never less than (1 - EFFICIENCY_CAP) × base.
        expect(overCapped).toBeGreaterThanOrEqual(100 * (1 - EFFICIENCY_CAP));
    });
});
