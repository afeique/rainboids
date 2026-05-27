/**
 * tests/unit/sim-ship.test.js — unit tests for the shared headless sim
 * (js/sim/). These run in plain Node with no browser shims because the sim
 * has zero browser dependencies — that import-cleanliness is itself the test
 * that the sim can run on the server.
 */

import { describe, it, expect } from '@jest/globals';
import {
  SHIP_THRUST_PER_TICK, SHIP_FRICTION, SHIP_MAX_V, SHIP_RADIUS,
  FIELD_WIDTH, FIELD_HEIGHT,
} from '../../js/sim/constants.js';
import { createShip, stepShip, EMPTY_INPUT } from '../../js/sim/ship.js';
import { createWorld, addShip, removeShip, spawnPointFor } from '../../js/sim/world.js';
import { tick } from '../../js/sim/tick.js';
import { makeRng } from '../../js/sim/rng.js';

describe('sim constants', () => {
  it('match the single-player 60 Hz calibration', () => {
    expect(SHIP_THRUST_PER_TICK).toBeCloseTo(1.0, 10);
    expect(SHIP_FRICTION).toBeCloseTo(Math.SQRT1_2, 10); // 0.5^0.5
    expect(SHIP_MAX_V).toBeCloseTo(3.5, 10);
  });
});

describe('stepShip physics', () => {
  it('accelerates right when "right" is held', () => {
    const s = createShip(1, 500, 500);
    stepShip(s, { ...EMPTY_INPUT, right: true }, FIELD_WIDTH, FIELD_HEIGHT);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.x).toBeGreaterThan(500);
    expect(s.vy).toBe(0);
  });

  it('decays velocity via friction when idle', () => {
    const s = createShip(1, 500, 500);
    s.vx = 2;
    stepShip(s, EMPTY_INPUT, FIELD_WIDTH, FIELD_HEIGHT);
    expect(s.vx).toBeCloseTo(2 * SHIP_FRICTION, 6);
  });

  it('snaps tiny velocity to zero', () => {
    const s = createShip(1, 500, 500);
    s.vx = 0.04;
    stepShip(s, EMPTY_INPUT, FIELD_WIDTH, FIELD_HEIGHT);
    expect(s.vx).toBe(0);
  });

  it('clamps speed to MAX_V', () => {
    const s = createShip(1, 500, 500);
    // Hold a diagonal long enough to exceed the cap.
    for (let i = 0; i < 60; i++) {
      stepShip(s, { ...EMPTY_INPUT, right: true, down: true }, FIELD_WIDTH, FIELD_HEIGHT);
    }
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(SHIP_MAX_V + 1e-9);
  });

  it('bounces (damped) off the left wall', () => {
    const s = createShip(1, SHIP_RADIUS + 1, 500);
    s.vx = -5;
    stepShip(s, EMPTY_INPUT, FIELD_WIDTH, FIELD_HEIGHT);
    expect(s.x).toBe(SHIP_RADIUS);
    expect(s.vx).toBeGreaterThan(0); // reflected
  });

  it('sets facing angle from aim point', () => {
    const s = createShip(1, 500, 500);
    stepShip(s, { ...EMPTY_INPUT, aimX: 600, aimY: 500 }, FIELD_WIDTH, FIELD_HEIGHT);
    expect(s.angle).toBeCloseTo(0, 6); // pointing +x
  });
});

describe('world + tick', () => {
  it('adds and removes ships', () => {
    const w = createWorld({ seed: 42 });
    addShip(w, 1, 100, 100);
    addShip(w, 2, 200, 200);
    expect(w.ships.size).toBe(2);
    removeShip(w, 1);
    expect(w.ships.size).toBe(1);
  });

  it('advances tick count and applies per-player input', () => {
    const w = createWorld({ seed: 42 });
    addShip(w, 1, 500, 500);
    const inputs = new Map([[1, { ...EMPTY_INPUT, right: true, clientTick: 7 }]]);
    tick(w, inputs);
    expect(w.tick).toBe(1);
    const ship = w.ships.get(1);
    expect(ship.x).toBeGreaterThan(500);
    expect(ship.lastInputTick).toBe(7);
  });

  it('is deterministic for the same seed + inputs', () => {
    const run = () => {
      const w = createWorld({ seed: 123 });
      addShip(w, 1, 500, 500);
      const inputs = new Map([[1, { ...EMPTY_INPUT, right: true, down: true, clientTick: 1 }]]);
      for (let i = 0; i < 50; i++) tick(w, inputs);
      const s = w.ships.get(1);
      return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    };
    expect(run()).toEqual(run());
  });
});

describe('rng', () => {
  it('is reproducible for a fixed seed', () => {
    const a = makeRng(99);
    const b = makeRng(99);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('spawnPointFor centers the first ship', () => {
    const w = createWorld({ seed: 1 });
    expect(spawnPointFor(w)).toEqual({ x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 });
  });
});
