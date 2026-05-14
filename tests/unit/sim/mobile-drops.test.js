/**
 * tests/unit/sim/mobile-drops.test.js — 5.95.0
 *
 * Pins the mobile auto-magnet for health orbs. The pure-sim drop step
 * (js/sim/drops.js) accepts `ctx.mobileMagnet=true` to switch to the
 * wider mobile attraction radii (600 px far / 240 px near vs the desktop
 * 320 / 120). Pull force constants are unchanged so existing desktop
 * tests stay green.
 *
 * Strategy mirrors tests/unit/sim/drops.test.js — same DropUpdateContext
 * shape, same freshDropState factory, just flipping the mobileMagnet
 * flag and verifying the wider radius engages.
 */

import { describe, test, expect } from '@jest/globals';
import {
    updateDrop,
    DROP_MAGNET_FAR_RADIUS,
    DROP_MAGNET_NEAR_RADIUS,
    DROP_MAGNET_FAR_RADIUS_MOBILE,
    DROP_MAGNET_NEAR_RADIUS_MOBILE,
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

describe('drop tuning constants — mobile auto-magnet (5.95.0)', () => {
    test('DROP_MAGNET_FAR_RADIUS_MOBILE is 600 px (wider than desktop 320)', () => {
        expect(DROP_MAGNET_FAR_RADIUS_MOBILE).toBe(600);
        expect(DROP_MAGNET_FAR_RADIUS_MOBILE).toBeGreaterThan(DROP_MAGNET_FAR_RADIUS);
    });
    test('DROP_MAGNET_NEAR_RADIUS_MOBILE is 240 px (wider than desktop 120)', () => {
        expect(DROP_MAGNET_NEAR_RADIUS_MOBILE).toBe(240);
        expect(DROP_MAGNET_NEAR_RADIUS_MOBILE).toBeGreaterThan(DROP_MAGNET_NEAR_RADIUS);
    });
});

describe('updateDrop() — health-orb magnet on mobile', () => {
    test('mobile mode: a health orb at dist=400 px (outside desktop 320, inside mobile 600) IS pulled', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 400, y: 0, active: true }]; // dist=400
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        // farFactor = (600 - 400) / 600 = 0.333..., force = 8.
        // vx += 1 * 8 * 0.333 = 2.667
        expect(drop.vx).toBeGreaterThan(0);
        expect(drop.vx).toBeCloseTo(8 * (1 / 3), 3);
    });

    test('desktop mode: a health orb at dist=400 px is NOT pulled (outside 320)', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 400, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: false }), null);
        expect(drop.vx).toBe(0);
        expect(drop.vy).toBe(0);
    });

    test('mobile mode: a health orb at dist=500 px (still inside 600) IS pulled', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 500, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        expect(drop.vx).toBeGreaterThan(0);
    });

    test('mobile mode: a health orb at dist=200 (inside mobile near=240) gets BOTH far + near forces', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 200, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        // farFactor = (600-200)/600 = 0.667 → +8 * 0.667 = 5.333
        // nearFactor = (240-200)/240 = 0.1667 → +22 * 0.167 = 3.667
        // total ≈ 9.0
        expect(drop.vx).toBeGreaterThan(8); // both forces engaged
    });

    test('mobile mode: orb past 600 px receives no pull even on mobile', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 700, y: 0, active: true }]; // outside 600
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        expect(drop.vx).toBe(0);
        expect(drop.vy).toBe(0);
    });
});
