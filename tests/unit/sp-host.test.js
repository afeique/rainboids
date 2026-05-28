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
