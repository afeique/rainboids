/**
 * tests/unit/sp-host.test.js — Path A sim-wiring: the real SP Player runs
 * headless in the server host (browser-shim + deterministic clock/RNG).
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { SpHost } from '../../server/src/sim/sp-host.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { setRandomSource } from '../../js/modules/core/utils.js';
import { EV } from '../../js/sim/events.js';

afterEach(() => { frameClock.reset(); setRandomSource(null); });

const rightInput = {
  up: false, down: false, left: false, right: true,
  fire: false, aimX: null, aimY: null,
  stickInput: { x: 0, y: 0, magnitude: 0 }, aimStick: { x: 0, y: 0, magnitude: 0 },
};

describe('SpHost — real SP Player headless', () => {
  it('constructs and ticks the real SP Player without throwing', async () => {
    const host = new SpHost({ seed: 1 });
    await host.init();
    expect(host.player).toBeTruthy();
    expect(host.player.health).toBeGreaterThan(0);
    const snap = host.snapshotPlayer();
    expect(snap.x).toBeCloseTo(960, 0);
    expect(snap.y).toBeCloseTo(540, 0);
  });

  it('moves the player right under "right" input (real SP physics)', async () => {
    const host = new SpHost({ seed: 1 });
    await host.init();
    const x0 = host.player.x;
    for (let i = 0; i < 30; i++) host.tick(rightInput);
    expect(host.player.x).toBeGreaterThan(x0 + 20);
    expect(host.player.vel.x).toBeGreaterThan(0);
  });

  it('fires real SP bullets that spawn and travel', async () => {
    const host = new SpHost({ seed: 1 });
    await host.init();
    // Aim right + hold fire.
    const fireInput = {
      up: false, down: false, left: false, right: false,
      fire: true, aimX: host.player.x + 200, aimY: host.player.y,
      stickInput: { x: 0, y: 0, magnitude: 0 }, aimStick: { x: 0, y: 0, magnitude: 0 },
    };
    for (let i = 0; i < 40; i++) host.tick(fireInput);
    const bullets = host.snapshotBullets();
    expect(bullets.length).toBeGreaterThan(0); // the Pulse Cannon fired
    // Bullets carry finite world coords.
    expect(Number.isFinite(bullets[0].x)).toBe(true);
    expect(Number.isFinite(bullets[0].y)).toBe(true);
  });

  it('spawns a real SP enemy that chases the player', async () => {
    const host = new SpHost({ seed: 1 });
    await host.init();
    // Player at center; spawn a HUNTER to the right — it should home in (move left).
    const e = host.spawnEnemy(host.player.x + 400, host.player.y, 'HUNTER', 1);
    const x0 = e.x;
    for (let i = 0; i < 60; i++) host.tick(); // neutral input; player stays put
    const enemies = host.snapshotEnemies();
    expect(enemies.length).toBeGreaterThanOrEqual(1);
    expect(e.x).toBeLessThan(x0); // moved toward the player
    expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
  });

  it('is deterministic: identical input + seed → identical player state', async () => {
    const run = async () => {
      const host = new SpHost({ seed: 42 });
      await host.init();
      for (let i = 0; i < 40; i++) host.tick(rightInput);
      const s = host.snapshotPlayer();
      frameClock.reset(); setRandomSource(null);
      return { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    };
    expect(await run()).toEqual(await run());
  });
});

describe('SpHost — real SP collisions headless', () => {
  it('player bullets kill an enemy via the real collision-system', async () => {
    const host = new SpHost({ seed: 7 });
    await host.init();
    host.cheats.onePunchMan = true; // first hit lands the kill
    const e = host.spawnEnemy(host.player.x + 120, host.player.y, 'HUNTER', 1);
    const fireInput = {
      up: false, down: false, left: false, right: false,
      fire: true, aimX: e.x, aimY: e.y,
      stickInput: { x: 0, y: 0, magnitude: 0 }, aimStick: { x: 0, y: 0, magnitude: 0 },
    };
    let killSeen = false;
    for (let i = 0; i < 240; i++) {
      const events = host.tick(fireInput);
      if (events.some((ev) => ev[0] === 'audio:enemy-destroy')) killSeen = true;
    }
    expect(killSeen).toBe(true);                          // the HUNTER took its lethal hit
    expect(host.enemyPool.activeObjects.length).toBe(0);  // death animation finished + reclaimed
  });

  it('drains a per-tick event stream (audio/semantic events) on a hit', async () => {
    const host = new SpHost({ seed: 7 });
    await host.init();
    host.cheats.onePunchMan = true;
    const e = host.spawnEnemy(host.player.x + 100, host.player.y, 'HUNTER', 1);
    const fireInput = {
      up: false, down: false, left: false, right: false,
      fire: true, aimX: e.x, aimY: e.y,
      stickInput: { x: 0, y: 0, magnitude: 0 }, aimStick: { x: 0, y: 0, magnitude: 0 },
    };
    const collected = [];
    for (let i = 0; i < 90; i++) collected.push(...host.tick(fireInput));
    expect(Array.isArray(collected)).toBe(true);
    expect(collected.some((ev) => typeof ev[0] === 'string' && ev[0].startsWith('audio:'))).toBe(true);
  });

  it('an enemy body colliding with the player deals damage (real lifecycle)', async () => {
    const host = new SpHost({ seed: 7 });
    await host.init();
    const hp0 = host.player.health;
    // Spawn a TANGERINE right on top of the player; its body contact damages.
    host.spawnEnemy(host.player.x, host.player.y, 'HUNTER', 1);
    for (let i = 0; i < 120; i++) host.tick(); // neutral; let bodies overlap
    expect(host.player.health).toBeLessThan(hp0);
  });

  it('runs a long mixed tick (enemies + asteroids) without throwing', async () => {
    const host = new SpHost({ seed: 7 });
    await host.init();
    for (let i = 0; i < 4; i++) host.spawnEnemy(host.player.x + 200 + i * 60, host.player.y + i * 30, 'HUNTER', 1);
    expect(() => {
      for (let i = 0; i < 200; i++) host.tick(rightInput);
    }).not.toThrow();
    expect(Number.isFinite(host.player.x)).toBe(true);
  });
});

describe('SpHost — headless wave driver', () => {
  it('auto-starts wave 1 and spawns the real wave roster', async () => {
    const host = new SpHost({ seed: 3 });
    await host.init();
    host.autoWaves = true;
    host.tick(); // first tick starts wave 1
    expect(host.game.currentWave).toBe(1);
    expect(host.enemyPool.activeObjects.length).toBeGreaterThan(0);
    expect(host.asteroidPool.activeObjects.length).toBeGreaterThan(0);
  });

  it('advances to the next wave once every enemy is cleared', async () => {
    const host = new SpHost({ seed: 3 });
    await host.init();
    host.autoWaves = true;
    host.tick();
    expect(host.game.currentWave).toBe(1);
    // Force-clear the wave: deactivate every enemy, then tick so cleanup +
    // the wave driver advance fire.
    for (const e of host.enemyPool.activeObjects) e.active = false;
    host.tick();
    host.tick();
    expect(host.game.currentWave).toBeGreaterThanOrEqual(2);
    expect(host.enemyPool.activeObjects.length).toBeGreaterThan(0); // wave 2 roster
  });

  it('does not self-drive waves when autoWaves is off (default)', async () => {
    const host = new SpHost({ seed: 3 });
    await host.init();
    for (let i = 0; i < 5; i++) host.tick();
    expect(host.waveStarted).toBe(false);
    expect(host.enemyPool.activeObjects.length).toBe(0);
  });
});

describe('SpHost — snapshot + protocol events (MP wire)', () => {
  it('builds the wire snapshot shape the SP client consumes', async () => {
    const host = new SpHost({ seed: 5 });
    await host.init();
    host.autoWaves = true;
    host.tick(); // spawn wave 1
    const snap = host.buildSnapshot();
    expect(snap).toHaveProperty('tick');
    expect(snap).toHaveProperty('wave', 1);
    // One ship — the local player — keyed by playerId, with reconcile fields.
    expect(snap.ships).toHaveLength(1);
    const ship = snap.ships[0];
    expect(ship.id).toBe(host.playerId);
    for (const k of ['x', 'y', 'vx', 'vy', 'a', 'hp', 'mhp', 'al', 'g', 'li']) {
      expect(ship).toHaveProperty(k);
    }
    // Enemies + asteroids carry stable ids + render fields.
    expect(snap.enemies.length).toBeGreaterThan(0);
    expect(snap.enemies[0]).toHaveProperty('id');
    expect(snap.enemies[0]).toHaveProperty('ty');
    expect(snap.asteroids.length).toBeGreaterThan(0);
    expect(snap.asteroids[0]).toHaveProperty('id');
  });

  it('keeps stable net ids across ticks (interpolation needs this)', async () => {
    const host = new SpHost({ seed: 5 });
    await host.init();
    const e = host.spawnEnemy(host.player.x + 300, host.player.y, 'HUNTER', 1);
    const id1 = host.buildSnapshot().enemies[0].id;
    host.tick();
    const id2 = host.buildSnapshot().enemies.find((x) => x.id === id1);
    expect(id2).toBeTruthy(); // same enemy → same id next tick
    expect(typeof e._netId).toBe('number');
  });

  it('derives a positioned ENEMY_DEATH event + a BULLET_SPAWN on fire', async () => {
    const host = new SpHost({ seed: 5 });
    await host.init();
    host.cheats.onePunchMan = true;
    const e = host.spawnEnemy(host.player.x + 110, host.player.y, 'HUNTER', 1);
    host.buildSnapshot(); // prime the diff baseline (enemy present)
    host.deriveEvents(host.buildSnapshot(), []);
    const fireInput = {
      fire: true, aimX: e.x, aimY: e.y, clientTick: 1,
      stickInput: { x: 0, y: 0, magnitude: 0 }, aimStick: { x: 0, y: 0, magnitude: 0 },
    };
    const collected = [];
    for (let i = 0; i < 240; i++) {
      const { events } = host.frame(fireInput);
      collected.push(...events);
    }
    const death = collected.find((ev) => ev.type === EV.ENEMY_DEATH);
    expect(death).toBeTruthy();
    expect(Number.isFinite(death.x) && Number.isFinite(death.y)).toBe(true); // positioned
    expect(collected.some((ev) => ev.type === EV.BULLET_SPAWN)).toBe(true);
  });

  it('frame() ticks + serializes, echoing the input tick for reconcile', async () => {
    const host = new SpHost({ seed: 5 });
    await host.init();
    const { snapshot, events } = host.frame({ clientTick: 42, right: true });
    expect(Array.isArray(events)).toBe(true);
    expect(snapshot.ships[0].li).toBe(42);
  });
});

describe('SpHost — co-op (N players)', () => {
  it('two players move independently under their own inputs', async () => {
    const host = new SpHost({ seed: 9 });
    await host.init();
    const s2 = host.addPlayer(2, 600, 540);
    const p1 = host.players[0].player;
    const p2 = s2.player;
    const x1 = p1.x, x2 = p2.x;
    host.setSlotInput(host.players[0].id, { right: true });
    host.setSlotInput(2, { left: true });
    for (let i = 0; i < 30; i++) host.tick();
    expect(p1.x).toBeGreaterThan(x1 + 10); // player 1 drifted right
    expect(p2.x).toBeLessThan(x2 - 5);     // player 2 drifted left
  });

  it('serializes one ship per player slot with distinct ids', async () => {
    const host = new SpHost({ seed: 9 });
    await host.init();
    host.addPlayer(2, 600, 540);
    host.tick();
    const snap = host.buildSnapshot();
    expect(snap.ships).toHaveLength(2);
    const ids = snap.ships.map((s) => s.id).sort();
    expect(ids).toEqual([host.players[0].id, 2].sort());
  });

  it('enemies aggro the NEAREST living player (co-op targeting)', async () => {
    const host = new SpHost({ seed: 9 });
    await host.init();
    // Player 1 far left, player 2 far right; enemy hugs player 2.
    host.players[0].player.x = 400; host.players[0].player.y = 540;
    const s2 = host.addPlayer(2, 1500, 540);
    const e = host.spawnEnemy(1450, 540, 'HUNTER', 1);
    host.tick();
    expect(e.targetPlayer).toBe(s2.player); // chose the nearer ship
  });

  it('removePlayer drops a slot and keeps this.player valid', async () => {
    const host = new SpHost({ seed: 9 });
    await host.init();
    host.addPlayer(2, 600, 540);
    host.removePlayer(2);
    expect(host.players).toHaveLength(1);
    host.tick();
    expect(host.buildSnapshot().ships).toHaveLength(1);
  });
});
