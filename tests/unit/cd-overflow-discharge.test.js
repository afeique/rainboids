// OVERFLOW_DISCHARGE — full-energy power-weapon synergy powerup.
//
//   • While held, casting a power weapon at FULL energy makes that cast FREE
//     (0 energy) AND deals +40% damage. (The full-energy capture + cost zero-out
//     are exercised in the live game by tests/qa/44-overflow-discharge.spec.js.)
//
// This unit suite validates the POWERUP_TYPES entry (sane fields) and the pure
// boostPowerDamage helper: it scales every present damage field by the multiplier
// on a CLONE (the original config is untouched), leaves non-damage fields alone,
// and is DEFAULT-SAFE at mult 1 (identical values).
import { POWERUP_TYPES } from '../../js/modules/world/powerup.js';
import { boostPowerDamage } from '../../js/modules/player/weapons.js';

describe('POWERUP_TYPES — OVERFLOW_DISCHARGE entry', () => {
    test('OVERFLOW_DISCHARGE exists with sane fields', () => {
        const p = POWERUP_TYPES.OVERFLOW_DISCHARGE;
        expect(p).toBeDefined();
        expect(p.effect).toBe('overflowDischarge');
        expect(p.maxStacks).toBe(1);
        expect(p.category).toBe('OFFENSE');
        expect(p.icon).toBe('bolt'); // energy/bolt icon
        expect(typeof p.description).toBe('string');
        expect(p.description.length).toBeGreaterThan(0);
        expect(typeof p.color).toBe('string');
        expect(Array.isArray(p.gradientColors)).toBe(true);
    });
});

describe('boostPowerDamage — +40% damage clone', () => {
    test('multiplies every present damage field by mult', () => {
        const cfg = {
            damage: 10,
            ringDamage: 20,
            missileDamage: 5,
            collapseDamage: 40,
            strikeDamage: 8,
            mineDamage: 12,
        };
        const out = boostPowerDamage(cfg, 1.4);
        expect(out.damage).toBeCloseTo(14, 10);
        expect(out.ringDamage).toBeCloseTo(28, 10);
        expect(out.missileDamage).toBeCloseTo(7, 10);
        expect(out.collapseDamage).toBeCloseTo(56, 10);
        expect(out.strikeDamage).toBeCloseTo(11.2, 10);
        expect(out.mineDamage).toBeCloseTo(16.8, 10);
    });

    test('only scales the damage fields PRESENT on the config', () => {
        // A config with just `damage` + some non-damage fields.
        const cfg = { damage: 100, cooldown: 1500, pullRadius: 200, beamDuration: 3000 };
        const out = boostPowerDamage(cfg, 1.4);
        expect(out.damage).toBeCloseTo(140, 10);
        // Non-damage fields untouched.
        expect(out.cooldown).toBe(1500);
        expect(out.pullRadius).toBe(200);
        expect(out.beamDuration).toBe(3000);
        // Damage fields not present stay absent (not introduced as NaN).
        expect(out.ringDamage).toBeUndefined();
        expect(out.missileDamage).toBeUndefined();
    });

    test('returns a CLONE — the original config object is untouched', () => {
        const cfg = { damage: 10, ringDamage: 20, cooldown: 1500 };
        const out = boostPowerDamage(cfg, 1.4);
        expect(out).not.toBe(cfg);
        // Original unchanged.
        expect(cfg.damage).toBe(10);
        expect(cfg.ringDamage).toBe(20);
        expect(cfg.cooldown).toBe(1500);
    });

    test('DEFAULT-SAFE: mult 1 → identical damage values (clone, but equal)', () => {
        const cfg = { damage: 10, ringDamage: 20, mineDamage: 5, cooldown: 1500 };
        const out = boostPowerDamage(cfg, 1);
        expect(out).not.toBe(cfg);
        expect(out.damage).toBe(10);
        expect(out.ringDamage).toBe(20);
        expect(out.mineDamage).toBe(5);
        expect(out.cooldown).toBe(1500);
    });

    test('ignores non-numeric damage fields (no NaN poisoning)', () => {
        const cfg = { damage: 10, ringDamage: undefined, mineDamage: 'x' };
        const out = boostPowerDamage(cfg, 1.4);
        expect(out.damage).toBeCloseTo(14, 10);
        expect(out.ringDamage).toBeUndefined();
        expect(out.mineDamage).toBe('x'); // non-number left as-is
    });
});
