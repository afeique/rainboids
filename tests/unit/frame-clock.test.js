/**
 * tests/unit/frame-clock.test.js — Path A / S1.
 * The deterministic mode is additive and OFF by default, so the wall-clock
 * single-player path is unchanged; the headless server opts into tick-driven
 * time for reproducibility.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { frameClock } from '../../js/modules/core/frame-clock.js';

afterEach(() => frameClock.reset());

describe('frameClock', () => {
  it('defaults to wall-clock mode', () => {
    expect(frameClock._deterministic).toBe(false);
  });

  it('wall-clock advance() tracks Date.now() and increments tick (unchanged)', () => {
    frameClock.reset();
    const before = Date.now();
    frameClock.advance();
    expect(frameClock.now).toBeGreaterThanOrEqual(before);
    expect(frameClock.tick).toBe(1);
  });

  it('deterministic mode steps now by dtMs per tick', () => {
    frameClock.setDeterministic(true, { startNow: 1000, dtMs: 16 });
    expect(frameClock.now).toBe(1000);
    frameClock.advance();
    expect(frameClock.now).toBe(1016);
    frameClock.advance();
    expect(frameClock.now).toBe(1032);
    expect(frameClock.tick).toBe(2);
  });

  it('produces an identical time stream for the same start/dt (replayable)', () => {
    const run = () => {
      frameClock.setDeterministic(true, { startNow: 0, dtMs: 1000 / 60 });
      const seq = [];
      for (let i = 0; i < 100; i++) { frameClock.advance(); seq.push(frameClock.now); }
      return seq;
    };
    expect(run()).toEqual(run());
  });

  it('reset() restores wall-clock mode', () => {
    frameClock.setDeterministic(true, { startNow: 5, dtMs: 8 });
    frameClock.reset();
    expect(frameClock._deterministic).toBe(false);
    expect(frameClock._dtMs).toBe(1000 / 60);
  });
});
