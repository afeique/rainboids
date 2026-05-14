/**
 * tests/unit/sim/mobile-drops.test.js — 5.98.0 update
 *
 * Pins the FULL-SCREEN mobile magnet for health orbs. The pure-sim
 * drop step (js/sim/drops.js) accepts `ctx.mobileMagnet=true` to switch
 * to the wider mobile radii (3000 px far / 600 px near vs the desktop
 * 320 / 120) AND stronger mobile-only forces (18 far / 40 near vs the
 * desktop 8 / 22) so drops fly to the stationary player from across the
 * screen.
 *
 * Strategy mirrors tests/unit/sim/drops.test.js — same DropUpdateContext
 * shape, same freshDropState factory, just flipping the mobileMagnet
 * flag and verifying the engagement.
 */

import { describe, test, expect } from '@jest/globals';
import {
    updateDrop,
    DROP_MAGNET_FAR_RADIUS,
    DROP_MAGNET_NEAR_RADIUS,
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

describe('drop tuning constants — mobile full-screen magnet (5.98.0)', () => {
    test('DROP_MAGNET_FAR_RADIUS_MOBILE covers the full screen (3000 px)', () => {
        expect(DROP_MAGNET_FAR_RADIUS_MOBILE).toBe(3000);
        expect(DROP_MAGNET_FAR_RADIUS_MOBILE).toBeGreaterThan(DROP_MAGNET_FAR_RADIUS);
    });
    test('DROP_MAGNET_NEAR_RADIUS_MOBILE is 600 px (wide snap zone)', () => {
        expect(DROP_MAGNET_NEAR_RADIUS_MOBILE).toBe(600);
        expect(DROP_MAGNET_NEAR_RADIUS_MOBILE).toBeGreaterThan(DROP_MAGNET_NEAR_RADIUS);
    });
    test('mobile far force is stronger than desktop so drops actually fly', () => {
        expect(DROP_MAGNET_FAR_FORCE_MOBILE).toBe(18);
        expect(DROP_MAGNET_NEAR_FORCE_MOBILE).toBe(40);
    });
});

describe('updateDrop() — health-orb magnet on mobile', () => {
    test('mobile mode: a health orb at dist=1000 px IS pulled (far-only tier, well inside the 3000 cap)', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 1000, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        // dist=1000 is OUTSIDE the 600 near range so only the far tier fires.
        // farFactor = (3000-1000)/3000 = 0.667 → +18 * 0.667 = 12
        expect(drop.vx).toBeGreaterThan(0);
        expect(drop.vx).toBeCloseTo(DROP_MAGNET_FAR_FORCE_MOBILE * ((3000 - 1000) / 3000), 3);
    });

    test('desktop mode: a health orb at dist=400 px is NOT pulled (outside 320)', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 400, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: false }), null);
        expect(drop.vx).toBe(0);
        expect(drop.vy).toBe(0);
    });

    test('mobile mode: a health orb at dist=500 px is pulled', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 500, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        expect(drop.vx).toBeGreaterThan(0);
    });

    test('mobile mode: a health orb at dist=300 (inside mobile near=600) gets BOTH far + near forces', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 300, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        // Both far AND near tiers engage at 300 px (near = 600).
        // farFactor = (3000-300)/3000 = 0.9 → +18 * 0.9 = 16.2
        // nearFactor = (600-300)/600 = 0.5 → +40 * 0.5 = 20
        // total ≈ 36
        expect(drop.vx).toBeGreaterThan(DROP_MAGNET_FAR_FORCE_MOBILE);
    });

    test('mobile mode: an orb past 3000 px does NOT pull (beyond the screen-spanning cap)', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 3500, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, mobileMagnet: true }), null);
        expect(drop.vx).toBe(0);
        expect(drop.vy).toBe(0);
    });
});
