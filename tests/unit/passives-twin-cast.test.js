// Phase P6 — Twin Cast passive: power weapons fire twice (2nd at 50% damage)
// for +30% energy cost. Pure helpers tested here; the firePower call site wires
// the energy cost (both deduct paths) + re-dispatches the BURST powers once
// more with a half-damage clone.
import { describe, expect, test } from '@jest/globals';
import {
    twinCastDoubles,
    twinCastEnergyCost,
    twinCastHalfConfig,
    TWIN_CAST_DOUBLES,
    TWIN_CAST_ENERGY_MULT,
    TWIN_CAST_SECOND_MULT,
} from '../../js/modules/player/weapons.js';

describe('Twin Cast — energy cost', () => {
    test('+30% with the passive', () => {
        expect(twinCastEnergyCost(20, true)).toBeCloseTo(20 * TWIN_CAST_ENERGY_MULT, 5);
        expect(TWIN_CAST_ENERGY_MULT).toBeCloseTo(1.3, 5);
    });
    test('unchanged without the passive', () => {
        expect(twinCastEnergyCost(20, false)).toBe(20);
    });
});

describe('Twin Cast — which powers double', () => {
    test('burst powers double', () => {
        for (const p of ['NOVA_BLAST', 'MISSILE_SALVO', 'SINGULARITY', 'CRYO_BURST', 'ORBITAL_STRIKE', 'MINE_LAYER']) {
            expect(twinCastDoubles(p)).toBe(true);
        }
    });
    test('beam / buff / duration powers do NOT double (a 2nd cast is meaningless)', () => {
        for (const p of ['LANCE_BEAM', 'LIGHTNING_ARC', 'PRISM_BEAM', 'OVERDRIVE', 'CHARGE_SHOT']) {
            expect(twinCastDoubles(p)).toBe(false);
        }
    });
    test('the DOUBLES set is exactly the six burst powers', () => {
        expect(TWIN_CAST_DOUBLES.size).toBe(6);
    });
});

describe('Twin Cast — half-damage clone', () => {
    test('scales every present damage field by 50% on a COPY (shared config untouched)', () => {
        const config = { ringDamage: 10, missileDamage: 8, cooldown: 1000, radius: 50 };
        const half = twinCastHalfConfig(config);
        expect(half).not.toBe(config);
        expect(half.ringDamage).toBeCloseTo(5, 5);
        expect(half.missileDamage).toBeCloseTo(4, 5);
        // non-damage fields preserved
        expect(half.cooldown).toBe(1000);
        expect(half.radius).toBe(50);
        // original NOT mutated
        expect(config.ringDamage).toBe(10);
        expect(config.missileDamage).toBe(8);
    });

    test('scales each power\'s specific damage field (collapse/strike/mine/damage)', () => {
        expect(twinCastHalfConfig({ collapseDamage: 30 }).collapseDamage).toBeCloseTo(15, 5);
        expect(twinCastHalfConfig({ strikeDamage: 12 }).strikeDamage).toBeCloseTo(6, 5);
        expect(twinCastHalfConfig({ mineDamage: 9 }).mineDamage).toBeCloseTo(4.5, 5);
        expect(twinCastHalfConfig({ damage: 7 }).damage).toBeCloseTo(3.5, 5);
    });

    test('ignores absent / non-numeric fields', () => {
        const half = twinCastHalfConfig({ cooldown: 500 });
        expect(half.cooldown).toBe(500);
        expect(half.ringDamage).toBeUndefined();
    });

    test('TWIN_CAST_SECOND_MULT is the documented 50%', () => {
        expect(TWIN_CAST_SECOND_MULT).toBeCloseTo(0.5, 5);
    });
});
