/**
 * tests/unit/sp-host.test.js — Path A sim-wiring: the real SP Player runs
 * headless in the server host (browser-shim + deterministic clock/RNG).
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { SpHost } from '../../server/src/sim/sp-host.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { setRandomSource } from '../../js/modules/core/utils.js';

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
