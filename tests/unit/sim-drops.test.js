/**
 * tests/unit/sim-drops.test.js — loot drops: motion/magnet, spawn-on-kill,
 * and ship pickup (heal / gold).
 */

import { describe, it, expect } from '@jest/globals';
import { createWorld, addShip, spawnDrop, spawnEnemy, spawnBullet } from '../../js/sim/world.js';
import { stepDrop } from '../../js/sim/drop.js';
import { resolveCollisions } from '../../js/sim/collision.js';
import { EV } from '../../js/sim/events.js';
import { GOLD_VALUE, HEALTH_VALUE } from '../../js/sim/constants.js';

describe('drop motion', () => {
  it('ages and despawns on TTL', () => {
    const w = createWorld({ seed: 1 });
    const d = spawnDrop(w, 500, 500, 'gold', GOLD_VALUE);
    d.ttl = 1;
    stepDrop(d, w);
    expect(d.alive).toBe(false);
  });

  it('magnets toward a nearby ship', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 500, 500);
    const d = spawnDrop(w, 550, 500, 'gold', GOLD_VALUE);
    d.vx = 0; d.vy = 0;
    stepDrop(d, w); // ship is to the left → pulled left
    expect(d.vx).toBeLessThan(0);
    expect(d.x).toBeLessThan(550);
  });
});

describe('drop pickup', () => {
  it('collects gold and emits DROP_COLLECTED', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 500, 500);
    const d = spawnDrop(w, 500, 500, 'gold', GOLD_VALUE);
    w.events.length = 0;
    resolveCollisions(w);
    expect(d.alive).toBe(false);
    expect(ship.gold).toBe(GOLD_VALUE);
    expect(w.events.some((e) => e.type === EV.DROP_COLLECTED && e.by === 1)).toBe(true);
  });

  it('heals from a health drop, capped at maxHp', () => {
    const w = createWorld({ seed: 1 });
    const ship = addShip(w, 1, 500, 500);
    ship.hp = ship.maxHp - 5;
    spawnDrop(w, 500, 500, 'health', HEALTH_VALUE);
    resolveCollisions(w);
    expect(ship.hp).toBe(ship.maxHp); // (maxHp-5)+15 clamped to maxHp
  });
});

describe('drops from kills', () => {
  it('spawns a gold drop when an enemy dies', () => {
    const w = createWorld({ seed: 1 });
    const e = spawnEnemy(w, 500, 500);
    e.hp = 1;
    spawnBullet(w, 500, 500, 0, 0, 1);
    w.events.length = 0;
    resolveCollisions(w);
    expect(e.alive).toBe(false);
    const golds = [...w.drops.values()].filter((d) => d.kind === 'gold');
    expect(golds.length).toBeGreaterThanOrEqual(1);
    expect(w.events.some((ev) => ev.type === EV.DROP_SPAWN)).toBe(true);
  });
});
