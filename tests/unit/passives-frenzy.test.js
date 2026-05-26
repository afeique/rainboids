// Phase P6 + §6c no-downsides rework — Frenzy passive: +8% outgoing damage per
// enemy near the player, capped at +80% (10 enemies). frenzyNearbyCount is the
// capped proximity count (computed on-demand at applyDamageToEnemy); frenzyMult
// is the count→multiplier curve. §6c removed the old +30% damage-taken penalty,
// so Frenzy is now a pure crowd-damage upside (no incoming-damage downside in
// lifecycle anymore — see passives-no-downsides.test.js for that assertion).
import { describe, expect, test } from '@jest/globals';
import {
    frenzyNearbyCount,
    frenzyMult,
    FRENZY_PER_ENEMY,
    FRENZY_MAX_ENEMIES,
    FRENZY_RADIUS,
} from '../../js/modules/combat/collision-system.js';

const enemy = (x, y, opts = {}) => ({ x, y, active: true, _deathFlash: 0, warping: false, ...opts });

describe('Frenzy — nearby-enemy proximity count', () => {
    test('counts only enemies within the radius of the player', () => {
        const near = [enemy(10, 0), enemy(0, 50), enemy(FRENZY_RADIUS - 1, 0)];
        const far = [enemy(FRENZY_RADIUS + 50, 0), enemy(9999, 9999)];
        expect(frenzyNearbyCount([...near, ...far], 0, 0)).toBe(3);
    });

    test('skips inactive / dying / warping enemies', () => {
        const list = [
            enemy(5, 0),
            enemy(6, 0, { active: false }),
            enemy(7, 0, { _deathFlash: 8 }),
            enemy(8, 0, { warping: true }),
        ];
        expect(frenzyNearbyCount(list, 0, 0)).toBe(1);
    });

    test('caps the count at FRENZY_MAX_ENEMIES', () => {
        const swarm = Array.from({ length: 30 }, (_, i) => enemy(i, 0));
        expect(frenzyNearbyCount(swarm, 0, 0)).toBe(FRENZY_MAX_ENEMIES);
    });

    test('empty / non-array input → 0', () => {
        expect(frenzyNearbyCount([], 0, 0)).toBe(0);
        expect(frenzyNearbyCount(null, 0, 0)).toBe(0);
    });
});

describe('Frenzy — count → multiplier curve', () => {
    test('no nearby enemies → ×1', () => {
        expect(frenzyMult(0)).toBe(1);
    });

    test('+8% per enemy', () => {
        expect(frenzyMult(1)).toBeCloseTo(1 + FRENZY_PER_ENEMY, 5);
        expect(frenzyMult(5)).toBeCloseTo(1 + 5 * FRENZY_PER_ENEMY, 5);
    });

    test('caps at +80% (10 enemies)', () => {
        expect(frenzyMult(FRENZY_MAX_ENEMIES)).toBeCloseTo(1.8, 5);
        expect(frenzyMult(50)).toBeCloseTo(1.8, 5); // over-cap clamps
    });

    test('negative / garbage count clamps to ×1', () => {
        expect(frenzyMult(-3)).toBe(1);
    });
});
