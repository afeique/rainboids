/**
 * tests/unit/headless-step.test.js — Path A / S6 headless step driver.
 * Verifies the canonical stage ORDER and null-guarded skipping; stages are
 * attached to the context during the sim-wiring phases.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { headlessStep } from '../../js/sim/headless-step.js';

function mockCtx(extra = {}) {
  const calls = [];
  const rec = (name, ret) => jest.fn((...a) => { calls.push(name); return ret; });
  return {
    calls,
    frameClock: { advance: rec('clock') },
    _gameTimers: [{ tick: rec('timer') }],
    stepPlayers: rec('players'),
    stepEntities: rec('entities'),
    stepSystems: rec('systems'),
    handleCollisions: rec('collisions'),
    updateWaveSystem: rec('waves'),
    drainEvents: rec('drain', [{ type: 'x' }]),
    ...extra,
  };
}

describe('headlessStep', () => {
  it('runs the stages in the canonical order and returns drained events', () => {
    const ctx = mockCtx();
    const events = headlessStep(ctx, new Map());
    expect(ctx.calls).toEqual([
      'clock', 'timer', 'players', 'entities', 'systems', 'collisions', 'waves', 'drain',
    ]);
    expect(events).toEqual([{ type: 'x' }]);
  });

  it('passes the inputs map + dt to stepPlayers', () => {
    const ctx = mockCtx();
    const inputs = new Map([[1, { up: true }]]);
    headlessStep(ctx, inputs);
    expect(ctx.stepPlayers).toHaveBeenCalledWith(inputs, expect.any(Number), expect.any(Object));
  });

  it('skips unattached stages (partial wiring is safe)', () => {
    // Only the clock + a drain are present; everything else null.
    const calls = [];
    const ctx = {
      frameClock: { advance: () => calls.push('clock') },
      _gameTimers: [],
      drainEvents: () => { calls.push('drain'); return []; },
    };
    expect(() => headlessStep(ctx)).not.toThrow();
    expect(calls).toEqual(['clock', 'drain']);
  });

  it('returns [] when no event drain is attached', () => {
    const ctx = { frameClock: { advance() {} }, _gameTimers: [] };
    expect(headlessStep(ctx)).toEqual([]);
  });
});
