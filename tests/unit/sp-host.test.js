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
