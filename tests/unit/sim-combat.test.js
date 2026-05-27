/**
 * tests/unit/sim-combat.test.js — firing, bullet motion, and bullet↔asteroid
 * collision in the shared sim.
 */

import { describe, it, expect } from '@jest/globals';
import { createWorld, addShip, spawnBullet } from '../../js/sim/world.js';
import { tick } from '../../js/sim/tick.js';
import { stepBullet } from '../../js/sim/bullet.js';
import { resolveCollisions } from '../../js/sim/collision.js';
import { createAsteroid } from '../../js/sim/asteroid.js';
import { EV } from '../../js/sim/events.js';
import { FIELD_WIDTH, FIELD_HEIGHT, FIRE_COOLDOWN_TICKS } from '../../js/sim/constants.js';

const fireInput = (clientTick) => ({
  up: false, down: false, left: false, right: false,
  fire: true, aimX: null, aimY: null, clientTick,
});

describe('firing', () => {
  it('spawns a bullet on fire and enforces the cooldown', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 500, 500);
    ship.angle = 0; // face +x; aim stays null so tick won't change it

    tick(w, new Map([[1, fireInput(1)]]));
    expect(w.bullets.size).toBe(1);
    expect(ship.fireCooldown).toBe(FIRE_COOLDOWN_TICKS);

    // Still holding fire, but on cooldown → no second bullet yet.
    tick(w, new Map([[1, fireInput(2)]]));
    expect(w.bullets.size).toBe(1);
    expect(ship.fireCooldown).toBe(FIRE_COOLDOWN_TICKS - 1);
  });

  it('does not fire when fire is not held', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 500, 500);
    tick(w, new Map([[1, { ...fireInput(1), fire: false }]]));
    expect(w.bullets.size).toBe(0);
  });
});

describe('stepBullet', () => {
  it('travels and despawns on TTL', () => {
    const b = { x: 0, y: 0, vx: 10, vy: 0, ttl: 1, alive: true };
    stepBullet(b, FIELD_WIDTH, FIELD_HEIGHT);
    expect(b.x).toBe(10);
    expect(b.alive).toBe(false); // ttl hit 0
  });

  it('despawns when leaving the arena', () => {
    const b = { x: FIELD_WIDTH + 10, y: 0, vx: 100, vy: 0, ttl: 100, alive: true };
    stepBullet(b, FIELD_WIDTH, FIELD_HEIGHT);
    expect(b.alive).toBe(false);
  });
});

describe('resolveCollisions (bullet vs asteroid)', () => {
  it('damages, destroys, and emits events', () => {
    const w = createWorld({ seed: 1 });
    const ast = createAsteroid(99, 500, 500, 0, 0, 40, 0);
    ast.hp = 2;
    w.asteroids.set(99, ast);

    const b1 = spawnBullet(w, 500, 500, 0, 0, 1); // overlapping
    resolveCollisions(w);
    expect(b1.alive).toBe(false);
    expect(ast.hp).toBe(1);
    expect(ast.alive).toBe(true);
    expect(w.events.some((e) => e.type === EV.ASTEROID_HIT)).toBe(true);

    w.events.length = 0;
    spawnBullet(w, 500, 500, 0, 0, 1);
    resolveCollisions(w);
    expect(ast.alive).toBe(false);
    expect(w.events.some((e) => e.type === EV.ASTEROID_DESTROYED)).toBe(true);
  });
});

describe('combat integration via tick', () => {
  it('a ship firing at an asteroid eventually destroys it', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 100, 500);
    ship.angle = 0; // face the asteroid to the right
    const ast = createAsteroid(99, 300, 500, 0, 0, 24, 0);
    w.asteroids.set(99, ast);

    let destroyed = false;
    for (let i = 0; i < 240 && w.asteroids.has(99); i++) {
      const events = tick(w, new Map([[1, fireInput(i + 1)]]));
      if (events.some((e) => e.type === EV.ASTEROID_DESTROYED && e.id === 99)) destroyed = true;
    }
    expect(destroyed).toBe(true);
    expect(w.asteroids.has(99)).toBe(false);
  });
});
