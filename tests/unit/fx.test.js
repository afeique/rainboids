/**
 * tests/unit/fx.test.js — Path A / S3 FX hook interface.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { createNoopFx, createClientFx } from '../../js/modules/core/fx.js';

describe('createNoopFx (headless server)', () => {
  it('exposes every hook as a no-op and flags headless', () => {
    const fx = createNoopFx();
    expect(fx.isHeadless).toBe(true);
    for (const k of ['particle', 'lineDebris', 'shard', 'sound', 'shoot', 'hit',
      'explosion', 'playerExplosion', 'coin', 'powerup', 'shield', 'healthRegen',
      'tractorBeam', 'shake', 'kick', 'haptic']) {
      expect(typeof fx[k]).toBe('function');
      expect(fx[k]('anything', 1, 2)).toBeUndefined(); // no-op, doesn't throw
    }
  });
});

describe('createClientFx (browser)', () => {
  it('forwards particle/debris/shard spawns to the matching pools (1:1 args)', () => {
    const particlePool = { get: jest.fn() };
    const lineDebrisPool = { get: jest.fn() };
    const asteroidShardPool = { get: jest.fn() };
    const fx = createClientFx({ particlePool, lineDebrisPool, asteroidShardPool });

    fx.particle('explosion', 10, 20, 'x');
    fx.lineDebris(1, 2);
    fx.shard(3);

    expect(particlePool.get).toHaveBeenCalledWith('explosion', 10, 20, 'x');
    expect(lineDebrisPool.get).toHaveBeenCalledWith(1, 2);
    expect(asteroidShardPool.get).toHaveBeenCalledWith(3);
    expect(fx.isHeadless).toBe(false);
  });

  it('routes audio hooks to the audio manager', () => {
    const audioManager = {
      playSound: jest.fn(), playShoot: jest.fn(), playExplosion: jest.fn(),
    };
    const fx = createClientFx({ audioManager });
    fx.sound('hit_RAIL_DRIVER');
    fx.shoot();
    fx.explosion();
    expect(audioManager.playSound).toHaveBeenCalledWith('hit_RAIL_DRIVER');
    expect(audioManager.playShoot).toHaveBeenCalled();
    expect(audioManager.playExplosion).toHaveBeenCalled();
  });

  it('routes shake/kick to the engine', () => {
    const engine = { triggerScreenShake: jest.fn(), triggerCameraKick: jest.fn() };
    const fx = createClientFx({ engine });
    fx.shake(8, 0.5);
    fx.kick(2, -2);
    expect(engine.triggerScreenShake).toHaveBeenCalledWith(8, 0.5);
    expect(engine.triggerCameraKick).toHaveBeenCalledWith(2, -2);
  });

  it('degrades missing systems to no-ops (partial wiring is safe)', () => {
    const fx = createClientFx({}); // nothing provided
    expect(() => { fx.particle('x'); fx.sound('y'); fx.shake(1); fx.haptic(10); }).not.toThrow();
  });
});
