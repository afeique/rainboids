/**
 * tests/unit/sim/mobile-drops.test.js — 5.109.0 update.
 *
 * The mobile-only full-screen magnet branch was removed in 5.109.0.
 * Mobile and desktop now share the SAME proximity magnet for every
 * drop type (range hierarchy: gold > health > inventory). The legacy
 * DROP_MAGNET_*_MOBILE constants are kept as aliases pointing at the
 * desktop values so import sites that still reference them stay
 * link-compatible without changing behavior.
 *
 * The tests below pin that aliasing — any future re-introduction of
 * a mobile-only branch has to update these assertions explicitly.
 */

import { describe, test, expect } from '@jest/globals';
import {
    updateDrop,
    DROP_MAGNET_FAR_RADIUS,
    DROP_MAGNET_NEAR_RADIUS,
    DROP_MAGNET_FAR_FORCE,
    DROP_MAGNET_NEAR_FORCE,
    DROP_MAGNET_FAR_RADIUS_MOBILE,
    DROP_MAGNET_NEAR_RADIUS_MOBILE,
    DROP_MAGNET_FAR_FORCE_MOBILE,
    DROP_MAGNET_NEAR_FORCE_MOBILE,
} from '../../../js/sim/drops.js';
import { freshDropState } from '../../../js/sim/state.js';

function ctx({
    ships = [{ x: 1000, y: 1000, active: true }],
    field = { width: 1920, height: 1080 },
    dt = 1 / 60,
    tractorEngaged = false,
    tractorAttraction = 0.6,
    tractorRange = 600,
    mobileMagnet = false,
} = {}) {
    return { ships, field, dt, tractorEngaged, tractorAttraction, tractorRange, mobileMagnet };
}

describe('drop tuning constants — mobile alias is desktop (5.109.0)', () => {
    test('FAR_RADIUS_MOBILE equals FAR_RADIUS (no more mobile override)', () => {
        expect(DROP_MAGNET_FAR_RADIUS_MOBILE).toBe(DROP_MAGNET_FAR_RADIUS);
    });
    test('NEAR_RADIUS_MOBILE equals NEAR_RADIUS', () => {
        expect(DROP_MAGNET_NEAR_RADIUS_MOBILE).toBe(DROP_MAGNET_NEAR_RADIUS);
    });
    test('FAR_FORCE_MOBILE equals FAR_FORCE', () => {
        expect(DROP_MAGNET_FAR_FORCE_MOBILE).toBe(DROP_MAGNET_FAR_FORCE);
    });
    test('NEAR_FORCE_MOBILE equals NEAR_FORCE', () => {
        expect(DROP_MAGNET_NEAR_FORCE_MOBILE).toBe(DROP_MAGNET_NEAR_FORCE);
    });
});

describe('updateDrop() — mobileMagnet flag is a no-op (5.109.0)', () => {
    test('mobileMagnet=true produces SAME forces as mobileMagnet=false', () => {
        const dropA = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const dropB = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 80, y: 0, active: true }];
        updateDrop(dropA, ctx({ ships, mobileMagnet: false }), null);
        updateDrop(dropB, ctx({ ships, mobileMagnet: true  }), null);
        expect(dropA.vx).toBeCloseTo(dropB.vx, 6);
        expect(dropA.vy).toBeCloseTo(dropB.vy, 6);
    });

    test('a health orb past 110 px does NOT pull regardless of mobileMagnet', () => {
        const dropA = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const dropB = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 200, y: 0, active: true }];
        updateDrop(dropA, ctx({ ships, mobileMagnet: false }), null);
        updateDrop(dropB, ctx({ ships, mobileMagnet: true  }), null);
        expect(dropA.vx).toBe(0);
        expect(dropB.vx).toBe(0);
    });
});
