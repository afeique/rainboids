// Pure asteroid-update unit tests.
//
// `updateAsteroid` was extracted from `js/modules/world/asteroid.js` in
// the Phase-1 multiplayer engine refactor. These tests pin the behavior
// the wrapper depends on: speed cap, position update with TICK_SCALE,
// boundary bounce damping, rotation accumulation, death-flash gate.

import { describe, test, expect } from '@jest/globals';
import {
    updateAsteroid,
    ASTEROID_MAX_SPEED,
    ASTEROID_BOUNCE_DAMP,
} from '../../../js/sim/asteroid.js';
import { freshAsteroidState } from '../../../js/sim/state.js';

const TICK_SCALE = 30 / 60; // 0.5

function freshCtx(overrides = {}) {
    return {
        field: { width: 1920, height: 1080 },
        tickScale: TICK_SCALE,
        wrapWidth: 1920,
        wrapHeight: 1080,
        ...overrides,
    };
}

describe('updateAsteroid — early exits', () => {
    test('inactive asteroid is not mutated', () => {
        const a = freshAsteroidState(0, { active: false, x: 100, y: 100, vx: 5, vy: 5 });
        const before = JSON.stringify({ x: a.x, y: a.y, vx: a.vx, vy: a.vy });
        updateAsteroid(a, freshCtx(), []);
        expect(JSON.stringify({ x: a.x, y: a.y, vx: a.vx, vy: a.vy })).toBe(before);
    });
    test('warping asteroid is not mutated by the sim', () => {
        const a = freshAsteroidState(0, { warping: true, x: 50, y: 50, vx: 1, vy: 0 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.x).toBe(50);
        expect(a.y).toBe(50);
    });
    test('death flash counts down and deactivates at zero', () => {
        const a = freshAsteroidState(0, { deathFlash: 1, x: 100, y: 100 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.deathFlash).toBe(0);
        expect(a.active).toBe(false);
    });
    test('death flash > 0 returns early (no motion)', () => {
        const a = freshAsteroidState(0, { deathFlash: 3, x: 100, y: 100, vx: 5, vy: 5 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.deathFlash).toBe(2);
        expect(a.x).toBe(100);
        expect(a.y).toBe(100);
        expect(a.active).toBe(true);
    });
});

describe('updateAsteroid — speed cap', () => {
    test('|v| > 2.0 is renormalized to 2.0', () => {
        const a = freshAsteroidState(0, { x: 100, y: 100, vx: 6, vy: 8 });
        updateAsteroid(a, freshCtx(), []);
        // hypot(6, 8) = 10 → renormalize to (1.2, 1.6).
        // Position += (1.2, 1.6) * 0.5 = (0.6, 0.8).
        expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(ASTEROID_MAX_SPEED, 10);
        expect(a.x).toBeCloseTo(100 + 0.6, 10);
        expect(a.y).toBeCloseTo(100 + 0.8, 10);
    });
    test('|v| <= 2.0 is left alone', () => {
        const a = freshAsteroidState(0, { x: 100, y: 100, vx: 1.0, vy: 1.0 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.vx).toBeCloseTo(1.0, 10);
        expect(a.vy).toBeCloseTo(1.0, 10);
    });
});

describe('updateAsteroid — position update', () => {
    test('x += vx * TICK_SCALE', () => {
        const a = freshAsteroidState(0, { x: 500, y: 500, vx: 1.5, vy: 0 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.x).toBeCloseTo(500.75, 10);
        expect(a.y).toBeCloseTo(500, 10);
    });
});

describe('updateAsteroid — boundary bounce', () => {
    test('left wall bounces vx with 0.9 damp', () => {
        const a = freshAsteroidState(0, { x: 5, y: 500, vx: -1.0, vy: 0, radius: 30 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.x).toBe(30);
        expect(a.vx).toBeCloseTo(1.0 * ASTEROID_BOUNCE_DAMP, 10);
    });
    test('right wall reverses vx with 0.9 damp', () => {
        const a = freshAsteroidState(0, { x: 1900, y: 500, vx: 1.0, vy: 0, radius: 30 });
        updateAsteroid(a, freshCtx(), []);
        expect(a.x).toBe(1920 - 30);
        expect(a.vx).toBeCloseTo(-1.0 * ASTEROID_BOUNCE_DAMP, 10);
    });
});

describe('updateAsteroid — rotation', () => {
    test('rot accumulates rotVel each tick', () => {
        const a = freshAsteroidState(0, {
            x: 500, y: 500,
            rotVelX: 0.01, rotVelY: 0.02, rotVelZ: 0.03,
        });
        updateAsteroid(a, freshCtx(), []);
        expect(a.rotX).toBeCloseTo(0.01, 10);
        expect(a.rotY).toBeCloseTo(0.02, 10);
        expect(a.rotZ).toBeCloseTo(0.03, 10);
    });
});
