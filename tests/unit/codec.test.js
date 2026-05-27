/**
 * tests/unit/codec.test.js — wire codec round-trip + protocol guards.
 */

import { describe, it, expect } from '@jest/globals';
import { encode, decode } from '../../js/sim/codec.js';
import { WIRE_VERSION, C2S, S2C } from '../../js/sim/protocol.js';

describe('codec', () => {
  it('round-trips a hello message', () => {
    const msg = { t: C2S.HELLO, wireVersion: WIRE_VERSION, name: 'pilot' };
    expect(decode(encode(msg))).toEqual(msg);
  });

  it('round-trips a snapshot', () => {
    const snap = {
      t: S2C.SNAPSHOT,
      tick: 1234,
      ships: [
        { id: 1, x: 10.5, y: 20.25, vx: 1, vy: -1, a: 0.5, hp: 100, mhp: 100, al: true, li: 9 },
      ],
    };
    expect(decode(encode(snap))).toEqual(snap);
  });

  it('decodes from a Buffer (server receive path)', () => {
    const msg = { t: C2S.INPUT, up: true, clientTick: 3 };
    const buf = Buffer.from(encode(msg), 'utf8');
    expect(decode(buf)).toEqual(msg);
  });

  it('decodes from a Uint8Array (browser receive path)', () => {
    const msg = { t: S2C.PEER_JOINED, playerId: 2, roster: [1, 2] };
    const bytes = new TextEncoder().encode(encode(msg));
    expect(decode(bytes)).toEqual(msg);
  });

  it('returns null on malformed input instead of throwing', () => {
    expect(decode('{not json')).toBeNull();
    expect(decode('')).toBeNull();
  });
});

describe('protocol', () => {
  it('defines distinct message-type tables', () => {
    expect(WIRE_VERSION).toBe(1);
    expect(Object.values(C2S)).toContain('hello');
    expect(Object.values(S2C)).toContain('snapshot');
  });
});
