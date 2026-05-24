// Phase P6 — Gravity Well passive: a constant weak pull drags enemies toward the
// player's reticle. gravityWellPull is the pure per-enemy position nudge (toward
// the target, capped so it never overshoots); applyGravityWell (engine-context)
// runs it over the pool each frame. Tests the pure nudge.
import { describe, expect, test } from '@jest/globals';
import {
    gravityWellPull,
    GRAVITY_WELL_RADIUS,
    GRAVITY_WELL_STEP,
} from '../../js/modules/combat/collision-system.js';

const enemy = (x, y) => ({ x, y });

describe('Gravity Well — pull toward target', () => {
    test('nudges an in-range enemy toward the target by STEP', () => {
        const e = enemy(100, 0); // target at origin → pull left along +x axis
        const pulled = gravityWellPull(e, 0, 0);
        expect(pulled).toBe(true);
        expect(e.x).toBeCloseTo(100 - GRAVITY_WELL_STEP, 5);
        expect(e.y).toBeCloseTo(0, 5);
    });

    test('pull direction is along the enemy→target vector (diagonal)', () => {
        const e = enemy(30, 40); // distance 50, unit (−0.6,−0.8) toward origin
        gravityWellPull(e, 0, 0);
        expect(e.x).toBeCloseTo(30 - 0.6 * GRAVITY_WELL_STEP, 5);
        expect(e.y).toBeCloseTo(40 - 0.8 * GRAVITY_WELL_STEP, 5);
    });

    test('out-of-range enemies are not pulled', () => {
        const e = enemy(GRAVITY_WELL_RADIUS + 10, 0);
        expect(gravityWellPull(e, 0, 0)).toBe(false);
        expect(e.x).toBe(GRAVITY_WELL_RADIUS + 10);
    });

    test('never overshoots the target (move capped at the distance)', () => {
        const e = enemy(GRAVITY_WELL_STEP * 0.5, 0); // closer than one step
        gravityWellPull(e, 0, 0);
        // moved at most to the target, not past it
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x).toBeLessThanOrEqual(GRAVITY_WELL_STEP * 0.5);
    });

    test('an enemy already on the target is left alone (no NaN)', () => {
        const e = enemy(0, 0);
        expect(gravityWellPull(e, 0, 0)).toBe(false);
        expect(Number.isNaN(e.x)).toBe(false);
        expect(e.x).toBe(0);
    });

    test('null enemy is a safe no-op', () => {
        expect(gravityWellPull(null, 0, 0)).toBe(false);
    });
});
