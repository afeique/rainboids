/**
 * tests/unit/sim/drops.test.js — pure-function tests for js/sim/drops.js.
 *
 * Pins the drop physics: lifetime decay, friction (0.92 health / 0.985
 * other), two-tier health-orb magnet (320 px far / 120 px near), tractor
 * pull. These constants must stay byte-for-byte equivalent to the
 * legacy `js/modules/world/color-star.js` collectible branch so the
 * 5.80.x heal-magnet tuning is preserved.
 *
 * Companion to agent A's `tests/unit/sim/ship.test.js` (the model for
 * Round-2 sim tests).
 */

import {
    updateDrop,
    updateDrops,
    DROP_FRICTION_HEALTH,
    DROP_FRICTION_DEFAULT,
    DROP_MAGNET_FAR_RADIUS,
    DROP_MAGNET_NEAR_RADIUS,
    DROP_MAGNET_FAR_FORCE,
    DROP_MAGNET_NEAR_FORCE,
    DROP_OPACITY_FADE_FRAMES,
} from '../../../js/sim/drops.js';
import { freshDropState } from '../../../js/sim/state.js';

// ---------------------------------------------------------------------------
// Helpers — minimal context bag matching the DropUpdateContext shape.
// ---------------------------------------------------------------------------

function ctx({
    ships = [{ x: 1000, y: 1000, active: true }],
    field = { width: 1920, height: 1080 },
    dt = 1 / 60,
    tractorEngaged = false,
    tractorAttraction = 0.6,
    tractorRange = 600,
} = {}) {
    return { ships, field, dt, tractorEngaged, tractorAttraction, tractorRange };
}

// ---------------------------------------------------------------------------
// Tuning constants — pinned values from the legacy code.
// ---------------------------------------------------------------------------

describe('drop tuning constants — verbatim from color-star.js', () => {
    test('DROP_FRICTION_HEALTH is 0.92 (5.80.x bump from 0.985 for magnet)', () => {
        expect(DROP_FRICTION_HEALTH).toBe(0.92);
    });
    test('DROP_FRICTION_DEFAULT is 0.985', () => {
        expect(DROP_FRICTION_DEFAULT).toBe(0.985);
    });
    // 5.102.0 — Magnet radii tightened (320→140, 120→55) so the player
    // has to fly closer for the orb to pull. The two-tier formula and
    // force constants stay the same.
    test('DROP_MAGNET_FAR_RADIUS is 140 px', () => {
        expect(DROP_MAGNET_FAR_RADIUS).toBe(140);
    });
    test('DROP_MAGNET_NEAR_RADIUS is 55 px', () => {
        expect(DROP_MAGNET_NEAR_RADIUS).toBe(55);
    });
    test('DROP_MAGNET_FAR_FORCE is 8 (5.80.x gentle pull)', () => {
        expect(DROP_MAGNET_FAR_FORCE).toBe(8);
    });
    test('DROP_MAGNET_NEAR_FORCE is 22 (5.80.x snap pull)', () => {
        expect(DROP_MAGNET_NEAR_FORCE).toBe(22);
    });
    test('DROP_OPACITY_FADE_FRAMES is 120 (~2 s @60Hz)', () => {
        expect(DROP_OPACITY_FADE_FRAMES).toBe(120);
    });
});

// ---------------------------------------------------------------------------
// freshDropState() factory.
// ---------------------------------------------------------------------------

describe('freshDropState() factory', () => {
    test('returns a health drop with sensible defaults', () => {
        const d = freshDropState('health');
        expect(d.kind).toBe('health');
        expect(d.life).toBe(7200);
        expect(d.value).toBe(1);
        expect(d.opacity).toBe(1);
        expect(d.active).toBe(true);
    });

    test('money_shape kind defaults to value=5', () => {
        const d = freshDropState('money_shape');
        expect(d.kind).toBe('money_shape');
        expect(d.value).toBe(5);
    });

    test('respects overrides', () => {
        const d = freshDropState('health', { x: 100, y: 200, life: 60 });
        expect(d.x).toBe(100);
        expect(d.y).toBe(200);
        expect(d.life).toBe(60);
    });
});

// ---------------------------------------------------------------------------
// updateDrop() — lifetime.
// ---------------------------------------------------------------------------

describe('updateDrop() — lifetime', () => {
    // 5.102.0 — Health drops are now PERMANENT (life is not decremented,
    // opacity stays at 1.0). Gold/money drops still tick and fade as
    // before; the lifetime suite now uses `money_shape` to exercise the
    // legacy decrement / fade path.
    test('decrements life by 1 per tick (money drops)', () => {
        const drop = freshDropState('money_shape', { life: 100 });
        updateDrop(drop, ctx(), null);
        expect(drop.life).toBe(99);
    });

    test('deactivates when life reaches 0 (money drops)', () => {
        const drop = freshDropState('money_shape', { life: 1 });
        updateDrop(drop, ctx(), null);
        expect(drop.life).toBe(0);
        expect(drop.active).toBe(false);
    });

    test('inactive drop is a no-op', () => {
        const drop = freshDropState('health', { active: false, x: 50 });
        updateDrop(drop, ctx(), null);
        expect(drop.x).toBe(50); // not touched
    });

    test('money opacity = min(1, life / 120) — fades out in last 120 ticks', () => {
        const drop = freshDropState('money_shape', { life: 60 });
        updateDrop(drop, ctx(), null);
        // life dropped to 59 → opacity = 59/120 ≈ 0.4917
        expect(drop.opacity).toBeCloseTo(59 / 120, 5);
    });

    test('money opacity stays at 1.0 while life > 120', () => {
        const drop = freshDropState('money_shape', { life: 1000 });
        updateDrop(drop, ctx(), null);
        expect(drop.opacity).toBe(1);
    });

    test('health drops are permanent — life never decrements', () => {
        const drop = freshDropState('health', { life: 100 });
        for (let i = 0; i < 500; i++) updateDrop(drop, ctx(), null);
        expect(drop.life).toBe(100);
        expect(drop.active).toBe(true);
        expect(drop.opacity).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// updateDrop() — friction.
// ---------------------------------------------------------------------------

describe('updateDrop() — friction', () => {
    test('health orb uses 0.92 friction', () => {
        // Place far from ship so magnet doesn't kick in.
        const drop = freshDropState('health', {
            x: 0, y: 0, vx: 10, vy: 0,
        });
        updateDrop(drop, ctx({ ships: [{ x: 100000, y: 100000, active: true }] }), null);
        // After friction: 10 * 0.92 = 9.2. Then position += vx, so x=9.2.
        expect(drop.vx).toBeCloseTo(9.2, 6);
    });

    test('money_shape orb uses 0.985 friction', () => {
        const drop = freshDropState('money_shape', { vx: 10, vy: 0 });
        updateDrop(drop, ctx({ ships: [{ x: 100000, y: 100000, active: true }] }), null);
        expect(drop.vx).toBeCloseTo(9.85, 6);
    });

    test('money_pixel orb uses 0.985 friction (not the health 0.92)', () => {
        const drop = freshDropState('money_pixel', { vx: 10, vy: 0 });
        updateDrop(drop, ctx({ ships: [{ x: 100000, y: 100000, active: true }] }), null);
        expect(drop.vx).toBeCloseTo(9.85, 6);
    });
});

// ---------------------------------------------------------------------------
// updateDrop() — health-orb magnet.
// ---------------------------------------------------------------------------

describe('updateDrop() — health-orb two-tier magnet', () => {
    // 5.102.0 — Radii tightened: FAR 140, NEAR 55. Force constants
    // unchanged. Tests below recalculated against the new radii.
    test('no magnet pull when dist >= 140 px', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 200, y: 0, active: true }]; // dist=200 > 140
        updateDrop(drop, ctx({ ships }), null);
        expect(drop.vx).toBe(0);
        expect(drop.vy).toBe(0);
    });

    test('far magnet (between 55 and 140) pulls toward ship', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 100, y: 0, active: true }]; // dist=100 (in far zone, outside near)
        updateDrop(drop, ctx({ ships }), null);
        // Order: friction first (vx=0 → vx=0), then magnet adds force.
        // farFactor = (140 - 100) / 140 = 0.2857142857
        // vx += dx * inv * 8 * 0.285714 = 100 * (1/100) * 8 * 0.285714 ≈ 2.2857
        expect(drop.vx).toBeCloseTo((40 / 140) * 8, 5);
        expect(drop.vy).toBe(0);
    });

    test('near magnet (< 55) adds the snap force on top of far force', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 30, y: 0, active: true }]; // dist=30 (deep in near zone)
        updateDrop(drop, ctx({ ships }), null);
        // Order: friction first (vx=0), then magnet stacks far + near.
        // farFactor  = (140 - 30) / 140 = 0.7857142857
        // farForce   = dx * inv * 8 * 0.785714 ≈ 6.2857
        // nearFactor = (55 - 30) / 55 = 0.4545454545
        // nearForce  = dx * inv * 22 * 0.454545 = 10.0
        // total ≈ 16.2857
        const farForce = (110 / 140) * 8;
        const nearForce = (25 / 55) * 22;
        expect(drop.vx).toBeCloseTo(farForce + nearForce, 4);
    });

    test('non-health drops are NOT magnet-attractive', () => {
        const drop = freshDropState('money_shape', {
            x: 0, y: 0, vx: 0, vy: 0,
        });
        const ships = [{ x: 100, y: 0, active: true }];
        updateDrop(drop, ctx({ ships }), null);
        // No magnet → vel stays at 0 (then friction applied to 0 = 0).
        expect(drop.vx).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// updateDrop() — tractor beam.
// ---------------------------------------------------------------------------

describe('updateDrop() — tractor beam', () => {
    test('no tractor force when not engaged', () => {
        const drop = freshDropState('money_shape', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 100, y: 0, active: true }];
        updateDrop(drop, ctx({ ships, tractorEngaged: false }), null);
        expect(drop.vx).toBe(0);
    });

    test('tractor pulls toward ship when engaged + within range', () => {
        const drop = freshDropState('money_shape', {
            x: 0, y: 0, vx: 0, vy: 0, z: 1,
        });
        const ships = [{ x: 300, y: 0, active: true }];
        const c = ctx({
            ships,
            tractorEngaged: true,
            tractorAttraction: 0.5,
            tractorRange: 600,
        });
        updateDrop(drop, c, null);
        // Order: friction first (vx=0 → vx=0), then tractor adds force.
        // dx=300, dist=300, fall-off = (1 - 300/600) = 0.5
        // tractorForce = 0.5 * 0.5 = 0.25
        // vx += (300/300) * 0.25 * 1 = 0.25
        expect(drop.vx).toBeCloseTo(0.25, 5);
    });

    test('tractor force scales by orb z (parallax depth)', () => {
        const dropZ1 = freshDropState('money_shape', { x: 0, y: 0, z: 1 });
        const dropZ2 = freshDropState('money_shape', { x: 0, y: 0, z: 2 });
        const ships = [{ x: 300, y: 0, active: true }];
        const c = ctx({ ships, tractorEngaged: true, tractorAttraction: 0.5, tractorRange: 600 });
        updateDrop(dropZ1, c, null);
        updateDrop(dropZ2, c, null);
        // z=2 should produce roughly 2× the tractor delta of z=1.
        expect(dropZ2.vx).toBeCloseTo(dropZ1.vx * 2, 4);
    });

    test('tractor outside range does nothing', () => {
        const drop = freshDropState('money_shape', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [{ x: 1000, y: 0, active: true }];
        const c = ctx({
            ships,
            tractorEngaged: true,
            tractorAttraction: 0.5,
            tractorRange: 600,
        });
        updateDrop(drop, c, null);
        expect(drop.vx).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// updateDrop() — multi-ship nearest selection.
// ---------------------------------------------------------------------------

describe('updateDrop() — nearest-ship selection', () => {
    test('with multiple ships, picks the closest as magnet anchor', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        const ships = [
            { x: 1000, y: 0, active: true },  // far
            { x: 100, y: 0, active: true },   // near (this one wins)
            { x: 500, y: 0, active: true },   // mid
        ];
        updateDrop(drop, ctx({ ships }), null);
        // Magnet pulls toward x=+100 → vx > 0 (toward closest ship).
        expect(drop.vx).toBeGreaterThan(0);
    });

    test('skips inactive ships', () => {
        const drop = freshDropState('health', { x: 0, y: 0, vx: 0, vy: 0 });
        // 5.102.0 — new FAR_RADIUS = 140. Active ship at dist=100 sits
        // in the far zone; inactive ship at dist=30 must be skipped or
        // the snap force would dominate.
        const ships = [
            { x: 30, y: 0, active: false },   // inactive — skip
            { x: 100, y: 0, active: true },   // this one is the only valid ship
        ];
        updateDrop(drop, ctx({ ships }), null);
        // farFactor = (140 - 100) / 140 = 0.285714
        // farForce  = 100*(1/100)*8*0.285714 ≈ 2.2857
        expect(drop.vx).toBeCloseTo((40 / 140) * 8, 5);
    });

    test('empty ships array is a no-op for magnet/tractor', () => {
        const drop = freshDropState('health', {
            x: 0, y: 0, vx: 5, vy: 0,
        });
        updateDrop(drop, ctx({ ships: [] }), null);
        // Friction applied (5 * 0.92 = 4.6), no magnet pull.
        expect(drop.vx).toBeCloseTo(4.6, 6);
    });
});

// ---------------------------------------------------------------------------
// updateDrops() — bulk loop helper.
// ---------------------------------------------------------------------------

describe('updateDrops() — bulk loop helper', () => {
    // 5.102.0 — Health drops are permanent now (life doesn't tick).
    // Use money_shape so the bulk-loop life decrement is observable.
    test('updates each active drop in the array', () => {
        const drops = [
            freshDropState('money_shape', { life: 100 }),
            freshDropState('money_shape', { life: 200 }),
            freshDropState('money_shape', { life: 300, active: false }),
        ];
        updateDrops(drops, ctx(), null);
        expect(drops[0].life).toBe(99);
        expect(drops[1].life).toBe(199);
        expect(drops[2].life).toBe(300); // inactive — skipped
    });

    test('handles null/undefined drops list gracefully', () => {
        expect(() => updateDrops(null, ctx(), null)).not.toThrow();
        expect(() => updateDrops(undefined, ctx(), null)).not.toThrow();
    });
});
