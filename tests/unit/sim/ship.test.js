// Pure ship-physics unit tests.
//
// `updateShip` was extracted from `js/modules/player/player.js` in the
// Phase-1 multiplayer engine refactor. These tests pin the behavior
// the wrapper depends on: aim atan2, per-tick velocity delta, friction
// constant, snap-to-zero epsilon, max-speed cap with the 70%-boost rule,
// position update, and boundary bounce.
//
// The Rust counterpart lives in `server/src/sim/ship.rs` and the
// parity fixture in `server/tests/parity_vectors.rs::ship_basic_movement`
// (sibling agent B's deliverable). Numbers picked here are easy to
// verify by hand; ratchet up to fixed-point precision when fxp lands.

import { describe, test, expect } from '@jest/globals';
import { updateShip } from '../../../js/sim/ship.js';
import { freshShipState } from '../../../js/sim/state.js';

// Same constants the live wrapper uses (Player.update). Kept here as
// literals so a tuning change in GAME_CONFIG would be caught by these
// tests — that's intentional, ship physics is part of the wire spec.
const TICK_SCALE = 30 / 60; // 0.5
const FRICTION = Math.pow(0.5, TICK_SCALE); // ≈ 0.7071067811865476
const MAX_V = 7 * TICK_SCALE; // 3.5
const VEL_EPS = 0.05;
const BOUNCE_DAMP = 0.8;
const THRUST_POWER = 2.0 * TICK_SCALE; // 1.0

function freshInput(overrides = {}) {
    return {
        up: false,
        down: false,
        left: false,
        right: false,
        aimX: 100,
        aimY: 0,
        thrustPower: THRUST_POWER,
        speedMult: 1,
        thrustersDisabled: false,
        maxV: MAX_V,
        friction: FRICTION,
        velEpsilon: VEL_EPS,
        bounceDamp: BOUNCE_DAMP,
        ...overrides,
    };
}

describe('updateShip — early exit', () => {
    test('inactive ship is not mutated', () => {
        const ship = freshShipState(0, { active: false, x: 100, y: 100 });
        const before = JSON.stringify({ x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy });
        updateShip(ship, freshInput({ right: true }), 1 / 60, null, []);
        const after = JSON.stringify({ x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy });
        expect(after).toBe(before);
    });
});

describe('updateShip — aim angle', () => {
    test('aim east of ship → angle = 0', () => {
        const ship = freshShipState(0, { x: 0, y: 0 });
        updateShip(ship, freshInput({ aimX: 50, aimY: 0 }), 1 / 60, null, []);
        expect(ship.angle).toBeCloseTo(0, 10);
    });
    test('aim south of ship → angle = +π/2 (Y grows downward)', () => {
        const ship = freshShipState(0, { x: 0, y: 0 });
        updateShip(ship, freshInput({ aimX: 0, aimY: 50 }), 1 / 60, null, []);
        expect(ship.angle).toBeCloseTo(Math.PI / 2, 10);
    });
    test('aim northwest of ship → angle = -3π/4', () => {
        const ship = freshShipState(0, { x: 100, y: 100 });
        updateShip(ship, freshInput({ aimX: 0, aimY: 0 }), 1 / 60, null, []);
        expect(ship.angle).toBeCloseTo(-3 * Math.PI / 4, 10);
    });
});

describe('updateShip — velocity integration under thrust', () => {
    test('right-only input adds +thrustForce to vx', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0, vy: 0 });
        updateShip(ship, freshInput({ right: true }), 1 / 60, null, []);
        // moveAngle = atan2(0, 1) = 0  →  cos(0)=1, sin(0)=0
        // thrustForce = 1.0 * 1.0 = 1.0
        // vx_after = (0 + 1) * friction = 1 * 0.70710...
        // Then position update adds vx_after.
        expect(ship.vx).toBeCloseTo(1 * FRICTION, 10);
        expect(ship.vy).toBeCloseTo(0, 10);
    });
    test('up-only input adds -thrustForce to vy', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0, vy: 0 });
        updateShip(ship, freshInput({ up: true }), 1 / 60, null, []);
        // moveAngle = atan2(-1, 0) = -π/2 → cos=0, sin=-1
        expect(ship.vx).toBeCloseTo(0, 10);
        expect(ship.vy).toBeCloseTo(-1 * FRICTION, 10);
    });
    test('diagonal up-right adds equal +x and -y components', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0, vy: 0 });
        updateShip(ship, freshInput({ up: true, right: true }), 1 / 60, null, []);
        // moveAngle = atan2(-1, 1) = -π/4 → cos=√2/2, sin=-√2/2
        // Each component = 1.0 * √2/2 ≈ 0.7071
        const expected = Math.cos(Math.PI / 4) * FRICTION;
        expect(ship.vx).toBeCloseTo(expected, 10);
        expect(ship.vy).toBeCloseTo(-expected, 10);
    });
    test('thrustersDisabled=true → zero velocity contribution', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0, vy: 0 });
        updateShip(ship, freshInput({ right: true, thrustersDisabled: true }), 1 / 60, null, []);
        // No thrust applied; friction still runs but on zero velocity = zero.
        expect(ship.vx).toBeCloseTo(0, 10);
        expect(ship.vy).toBeCloseTo(0, 10);
    });
    test('speedMult=2.0 doubles the per-tick velocity delta', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0, vy: 0 });
        updateShip(ship, freshInput({ right: true, speedMult: 2.0 }), 1 / 60, null, []);
        // thrustForce = 1.0 * 2.0 = 2.0; vx_after = 2.0 * friction
        expect(ship.vx).toBeCloseTo(2.0 * FRICTION, 10);
    });
});

describe('updateShip — friction & snap-to-zero', () => {
    test('moving ship with no input decelerates by friction', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 1.0, vy: 0 });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // No input → velocity becomes vx * friction (above eps)
        expect(ship.vx).toBeCloseTo(1.0 * FRICTION, 10);
    });
    test('vx below epsilon snaps to zero', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0.04, vy: 0 });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // 0.04 * friction ≈ 0.0283 < 0.05 → snapped to zero
        expect(ship.vx).toBe(0);
    });
    test('vx just above epsilon does not snap', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 0.5, vy: 0 });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // 0.5 * friction ≈ 0.354 > 0.05 → kept
        expect(ship.vx).toBeCloseTo(0.5 * FRICTION, 10);
    });
});

describe('updateShip — max-speed cap', () => {
    test('vx far above max gets clamped (post-friction) to effectiveMaxV', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 100, vy: 0 });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // 100 * friction ≈ 70.7 → capped to maxV (3.5) since speedMult=1
        expect(Math.hypot(ship.vx, ship.vy)).toBeCloseTo(MAX_V, 10);
    });
    test('70% rule: speedMult=2.0 raises cap by +0.7×', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 100, vy: 0 });
        updateShip(ship, freshInput({ speedMult: 2.0 }), 1 / 60, null, []);
        // effectiveMaxV = 3.5 * (1 + (2-1)*0.7) = 3.5 * 1.7 = 5.95
        expect(Math.hypot(ship.vx, ship.vy)).toBeCloseTo(MAX_V * 1.7, 10);
    });
});

describe('updateShip — position update', () => {
    test('position increments by post-friction velocity', () => {
        const ship = freshShipState(0, { x: 500, y: 500, vx: 1.0, vy: 0 });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // x_after = 500 + 1.0 * friction = 500.7071...
        expect(ship.x).toBeCloseTo(500 + 1.0 * FRICTION, 10);
        expect(ship.y).toBeCloseTo(500, 10);
    });
});

describe('updateShip — boundary bounce', () => {
    test('left boundary clamps x and reverses (positive) vx with damping', () => {
        const ship = freshShipState(0, {
            x: 5,
            y: 500,
            vx: -10,
            vy: 0,
            radius: 15,
            field: { width: 1920, height: 1080 },
        });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // After friction: vx = -10 * 0.7071 ≈ -7.07
        // Position: 5 + (-7.07) = -2.07; minus radius 15 = -17.07 < 0
        // Bounce: x = radius = 15; vx = +abs(-7.07) * 0.8 ≈ +5.66
        expect(ship.x).toBe(15);
        // vx is now post-friction-then-cap-then-bounce; just check positivity + dampening
        expect(ship.vx).toBeGreaterThan(0);
        expect(ship.vx).toBeLessThan(10); // dampened
    });
    test('right boundary clamps x and reverses (negative) vx', () => {
        // Need vx large enough that, after friction-then-cap, the
        // post-update x exceeds field.width - radius. Cap is MAX_V=3.5;
        // post-position x = 1900 + 3.5 = 1903.5. With radius 15 and
        // field.width 1920, edge is at 1905; 1903.5 + 15 = 1918.5 < 1920
        // → no bounce. Move closer to the edge.
        const ship = freshShipState(0, {
            x: 1910,
            y: 500,
            vx: 100,
            vy: 0,
            radius: 15,
            field: { width: 1920, height: 1080 },
        });
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // After cap: vx = 3.5; post-update x = 1910 + 3.5 = 1913.5; edge
        // check: 1913.5 + 15 = 1928.5 > 1920 → bounce. Final x = 1905.
        expect(ship.x).toBe(1920 - 15);
        expect(ship.vx).toBeLessThan(0);
    });
    test('no field → no bounce; position drifts freely past bounds', () => {
        const ship = freshShipState(0, {
            x: 5,
            y: 500,
            vx: -1, // small enough to not hit max-speed cap (cap=3.5)
            vy: 0,
            radius: 15,
        });
        ship.field = null;
        updateShip(ship, freshInput(), 1 / 60, null, []);
        // After friction: vx = -1 * 0.7071 ≈ -0.7071 (above eps, not snapped, under cap)
        // Position: x = 5 + (-0.7071) ≈ 4.29
        // No field means no bounce; if we'd had a field, x=4.29 - r=15 = -10.71 → would bounce.
        expect(ship.x).toBeCloseTo(5 - FRICTION, 10);
        expect(ship.vx).toBeCloseTo(-FRICTION, 10);
    });
});

describe('updateShip — full integration step (regression vector)', () => {
    // Pinned reference: 1 tick from rest with right-only input.
    // Hand-computed with TICK_SCALE=0.5, friction=0.5^0.5≈0.7071,
    // thrustPower=1.0. Single source of truth for "what ship.js does".
    test('1 tick from rest, right-only, no field', () => {
        // aim is at (600, 500), ship at (500, 500) → aim due east, angle = 0.
        const ship = freshShipState(0, {
            x: 500,
            y: 500,
            vx: 0,
            vy: 0,
            field: null,
        });
        updateShip(ship, freshInput({ right: true, aimX: 600, aimY: 500 }), 1 / 60, null, []);
        // Start: vx=0, vy=0
        // +thrust: vx=1.0, vy=0
        // *friction: vx=0.7071..., vy=0
        // snap: 0.7071 > 0.05 → kept
        // cap: |0.7071| < 3.5 → kept
        // position: x = 500 + 0.7071 = 500.7071
        const f = Math.pow(0.5, 0.5);
        expect(ship.vx).toBeCloseTo(f, 12);
        expect(ship.vy).toBe(0);
        expect(ship.x).toBeCloseTo(500 + f, 12);
        expect(ship.y).toBe(500);
        expect(ship.angle).toBeCloseTo(0, 12); // aim due east → 0 rad
    });
});
