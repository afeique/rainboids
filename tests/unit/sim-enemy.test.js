/**
 * tests/unit/sim-enemy.test.js — enemy AI (chaser), bullet↔enemy and
 * enemy↔ship collisions, ship downing, and the periodic spawner.
 */

import { describe, it, expect } from '@jest/globals';
import { createEnemy, stepEnemy, nearestShip } from '../../js/sim/enemy.js';
import { createWorld, addShip, spawnBullet, spawnEnemy } from '../../js/sim/world.js';
import { tick } from '../../js/sim/tick.js';
import { resolveCollisions } from '../../js/sim/collision.js';
import { EMPTY_INPUT } from '../../js/sim/ship.js';
import { EV } from '../../js/sim/events.js';
import { ENEMY_CONTACT_DAMAGE } from '../../js/sim/constants.js';

describe('chaser AI', () => {
  it('finds the nearest living ship', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 100, 100);
    const far = addShip(w, 2, 900, 900);
    far.alive = true;
    expect(nearestShip(w.ships, 110, 110).playerId).toBe(1);
  });

  it('moves toward the nearest ship', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 200, 0);
    const e = createEnemy(1, 0, 0);
    stepEnemy(e, w);
    expect(e.x).toBeGreaterThan(0); // moved toward ship at +x
    expect(e.angle).toBeCloseTo(0, 3);
  });

  it('ignores downed ships', () => {
    const w = createWorld({ seed: 1 });
    const s = addShip(w, 1, 200, 0);
    s.alive = false;
    expect(nearestShip(w.ships, 0, 0)).toBeNull();
  });
});

describe('bullet vs enemy', () => {
  it('damages and kills enemies, emitting ENEMY_DEATH', () => {
    const w = createWorld({ seed: 1 });
    const e = spawnEnemy(w, 500, 500);
    e.hp = 1;
    w.events.length = 0;
    spawnBullet(w, 500, 500, 0, 0, 1);
    resolveCollisions(w);
    expect(e.alive).toBe(false);
    expect(w.events.some((ev) => ev.type === EV.ENEMY_DEATH && ev.id === e.id)).toBe(true);
  });
});

describe('enemy vs ship contact', () => {
  it('deals cooldown-gated damage and downs the ship at 0 HP', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 500, 500);
    ship.hp = ENEMY_CONTACT_DAMAGE + 1;
    const e = spawnEnemy(w, 500, 500); // overlapping
    e.contactCooldown = 0;

    resolveCollisions(w);
    expect(ship.hp).toBe(1);
    expect(e.contactCooldown).toBeGreaterThan(0); // on cooldown now

    // Immediate re-resolve does nothing (still on cooldown).
    resolveCollisions(w);
    expect(ship.hp).toBe(1);

    // Force cooldown expiry → next hit downs the ship.
    e.contactCooldown = 0;
    w.events.length = 0;
    resolveCollisions(w);
    expect(ship.alive).toBe(false);
    expect(ship.downed).toBe(true);
    expect(ship.hp).toBe(0);
    expect(w.events.some((ev) => ev.type === EV.SHIP_DOWNED && ev.id === 1)).toBe(true);
  });
});

describe('enemy integration via tick', () => {
  it('a nearby enemy chases and damages the ship', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 960, 540);
    spawnEnemy(w, 1010, 540); // ~50px away

    let hit = false;
    for (let i = 0; i < 120 && ship.alive; i++) {
      const events = tick(w, new Map([[1, EMPTY_INPUT]]));
      if (events.some((e) => e.type === EV.SHIP_HIT && e.id === 1)) hit = true;
    }
    expect(hit).toBe(true);
    expect(ship.hp).toBeLessThan(ship.maxHp);
  });
});
