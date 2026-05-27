/**
 * tests/unit/engine-context.test.js — Path A / S4 EngineContext scaffold.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { createEngineContext, disposeEngineContext, createDefaultGameState } from '../../js/sim/engine-context.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { random, getRandomSource } from '../../js/modules/core/utils.js';

afterEach(() => disposeEngineContext());

describe('createEngineContext', () => {
  it('assembles the expected deterministic context shape', () => {
    const ctx = createEngineContext({ seed: 7 });
    expect(ctx.seed).toBe(7);
    expect(typeof ctx.rng).toBe('function');
    expect(ctx.fx.isHeadless).toBe(true);
    expect(ctx.gameField).toEqual({ width: 1920, height: 1080 });
    expect(ctx.events).toBeTruthy();
    expect(ctx.spatialGrid).toBeTruthy();
    expect(Array.isArray(ctx._gameTimers)).toBe(true);
    expect(ctx.game.runConfig.mode).toBe('NORMAL');
    // Entity slots are present as placeholders (attached during wiring).
    expect(ctx).toHaveProperty('player', null);
    expect(ctx).toHaveProperty('enemyPool', null);
  });

  it('installs the deterministic clock + seeded RNG globally', () => {
    createEngineContext({ seed: 42 });
    expect(frameClock._deterministic).toBe(true);
    expect(getRandomSource()).not.toBe(Math.random);
    const a = frameClock.now;
    frameClock.advance();
    expect(frameClock.now).toBe(a + 1000 / 60);
  });

  it('makes utils.random() reproducible for the same seed', () => {
    const draw = (seed) => {
      createEngineContext({ seed });
      return Array.from({ length: 20 }, () => random(0, 100));
    };
    expect(draw(123)).toEqual(draw(123));
    expect(draw(123)).not.toEqual(draw(124));
  });

  it('disposeEngineContext() restores wall-clock + Math.random', () => {
    createEngineContext({ seed: 1 });
    disposeEngineContext();
    expect(frameClock._deterministic).toBe(false);
    expect(getRandomSource()).toBe(Math.random);
  });

  it('createDefaultGameState() is a fresh object each call', () => {
    const a = createDefaultGameState();
    const b = createDefaultGameState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
