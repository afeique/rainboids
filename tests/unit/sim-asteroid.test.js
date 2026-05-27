/**
 * tests/unit/sim-asteroid.test.js — asteroid entity step + deterministic spawn.
 */

import { describe, it, expect } from '@jest/globals';
import { createAsteroid, stepAsteroid } from '../../js/sim/asteroid.js';
import { createWorld, spawnAsteroids } from '../../js/sim/world.js';
import { tick } from '../../js/sim/tick.js';
import { FIELD_WIDTH, FIELD_HEIGHT, ASTEROID_COUNT } from '../../js/sim/constants.js';

describe('stepAsteroid', () => {
  it('drifts and rotates', () => {
    const a = createAsteroid(1, 500, 500, 2, -1, 30, 0.01);
    stepAsteroid(a, FIELD_WIDTH, FIELD_HEIGHT);
    expect(a.x).toBe(502);
    expect(a.y).toBe(499);
    expect(a.angle).toBeCloseTo(0.01, 6);
  });

  it('wraps around the right edge (with radius margin)', () => {
    const a = createAsteroid(1, FIELD_WIDTH + 20, 500, 5, 0, 25, 0);
    stepAsteroid(a, FIELD_WIDTH, FIELD_HEIGHT);
    // x = 1945 > width + r (1945)?  width=1920,r=25 → threshold 1945; 1925+5=1930 ≤ 1945 stays
    expect(a.x).toBeLessThan(FIELD_WIDTH + a.radius + 1);
  });

  it('wraps a far-right asteroid back to the left', () => {
    const a = createAsteroid(1, FIELD_WIDTH + 30, 500, 5, 0, 25, 0);
    stepAsteroid(a, FIELD_WIDTH, FIELD_HEIGHT);
    expect(a.x).toBeLessThan(0); // teleported to the left margin
  });

  it('gives bigger rocks more HP', () => {
    expect(createAsteroid(1, 0, 0, 0, 0, 48, 0).hp)
      .toBeGreaterThan(createAsteroid(2, 0, 0, 0, 0, 16, 0).hp);
  });
});

describe('spawnAsteroids', () => {
  it('populates the field and is deterministic for a fixed seed', () => {
    const snapshot = (seed) => {
      const w = createWorld({ seed });
      spawnAsteroids(w, ASTEROID_COUNT);
      return [...w.asteroids.values()].map((a) => [a.x, a.y, a.radius, a.vx, a.vy]);
    };
    const a = snapshot(7);
    expect(a.length).toBe(ASTEROID_COUNT);
    expect(snapshot(7)).toEqual(a); // reproducible
    expect(snapshot(8)).not.toEqual(a); // seed-dependent
  });

  it('asteroids advance under tick() alongside ships', () => {
    const w = createWorld({ seed: 3 });
    spawnAsteroids(w, 3);
    const before = [...w.asteroids.values()].map((a) => ({ x: a.x, y: a.y }));
    tick(w, new Map());
    const after = [...w.asteroids.values()].map((a) => ({ x: a.x, y: a.y }));
    // At least one asteroid moved (non-zero velocity field).
    expect(after).not.toEqual(before);
  });
});
