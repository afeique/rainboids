// Phase P6 — Backlash passive: a successful dodge retaliates against the
// attacker. backlashTarget resolves WHO to strike from the hit's `source`:
// a bullet retaliates against its shooter, an enemy/asteroid against itself,
// and only if that target is still active. The takeDamage dodge path then
// applies BACKLASH_DAMAGE via the engine's damageEnemy.
import { describe, expect, test } from '@jest/globals';
import { backlashTarget, BACKLASH_DAMAGE } from '../../js/modules/player/lifecycle.js';

describe('Backlash — dodge retaliation target', () => {
    test('a direct enemy source retaliates against that enemy', () => {
        const enemy = { active: true, id: 'e' };
        expect(backlashTarget(enemy)).toBe(enemy);
    });

    test('an enemy bullet retaliates against its shooter', () => {
        const shooter = { active: true, id: 'shooter' };
        const bullet = { active: true, shooter };
        expect(backlashTarget(bullet)).toBe(shooter);
    });

    test('a dead/recycled shooter is not targeted', () => {
        const shooter = { active: false };
        const bullet = { active: true, shooter };
        expect(backlashTarget(bullet)).toBe(null);
    });

    test('an inactive direct source is not targeted', () => {
        expect(backlashTarget({ active: false })).toBe(null);
    });

    test('a null / missing source is safe (no target)', () => {
        expect(backlashTarget(null)).toBe(null);
        expect(backlashTarget(undefined)).toBe(null);
    });

    test('BACKLASH_DAMAGE is a positive strike value', () => {
        expect(BACKLASH_DAMAGE).toBeGreaterThan(0);
    });
});
