// Phase P6 — Guardian Echo passive. A hit that drops the player into the danger
// zone (≤25% max HP) emits a knockback nova that shoves nearby enemies away.
// The takeDamage call site owns the threshold trigger; guardianEchoNova is the
// pure shove geometry, tested here directly.
import { describe, expect, test } from '@jest/globals';
import {
    guardianEchoNova,
    GUARDIAN_ECHO_RADIUS,
    GUARDIAN_ECHO_SHOVE,
} from '../../js/modules/player/lifecycle.js';

const player = { x: 0, y: 0 };
const enemy = (x, y, active = true) => ({ x, y, active });

describe('Guardian Echo — knockback nova', () => {
    test('shoves an in-range enemy directly away by SHOVE px', () => {
        const e = enemy(50, 0); // 50px to the right, well within radius
        const n = guardianEchoNova(player, [e]);
        expect(n).toBe(1);
        expect(e.x).toBeCloseTo(50 + GUARDIAN_ECHO_SHOVE, 5);
        expect(e.y).toBeCloseTo(0, 5);
    });

    test('shove direction is radially outward (diagonal preserved)', () => {
        const e = enemy(30, 40); // distance 50, unit vector (0.6, 0.8)
        guardianEchoNova(player, [e]);
        expect(e.x).toBeCloseTo(30 + 0.6 * GUARDIAN_ECHO_SHOVE, 5);
        expect(e.y).toBeCloseTo(40 + 0.8 * GUARDIAN_ECHO_SHOVE, 5);
    });

    test('enemies beyond the radius are untouched', () => {
        const far = enemy(GUARDIAN_ECHO_RADIUS + 10, 0);
        const n = guardianEchoNova(player, [far]);
        expect(n).toBe(0);
        expect(far.x).toBe(GUARDIAN_ECHO_RADIUS + 10);
    });

    test('inactive enemies are skipped', () => {
        const dead = enemy(20, 0, false);
        const n = guardianEchoNova(player, [dead]);
        expect(n).toBe(0);
        expect(dead.x).toBe(20);
    });

    test('an exactly-overlapping enemy is shoved right (no NaN)', () => {
        const e = enemy(0, 0);
        guardianEchoNova(player, [e]);
        expect(e.x).toBeCloseTo(GUARDIAN_ECHO_SHOVE, 5);
        expect(e.y).toBeCloseTo(0, 5);
        expect(Number.isNaN(e.x)).toBe(false);
    });

    test('shoves every in-range enemy and counts them', () => {
        const es = [enemy(10, 0), enemy(0, 30), enemy(-40, 0), enemy(999, 0)];
        const n = guardianEchoNova(player, es);
        expect(n).toBe(3);
    });

    test('null / empty inputs are safe no-ops', () => {
        expect(guardianEchoNova(null, [enemy(1, 1)])).toBe(0);
        expect(guardianEchoNova(player, null)).toBe(0);
        expect(guardianEchoNova(player, [])).toBe(0);
    });
});
