/**
 * tests/unit/codec.test.js — wire codec round-trip + protocol guards.
 */

import { describe, it, expect } from '@jest/globals';
import { encode, decode } from '../../js/sim/codec.js';
import { WIRE_VERSION, C2S, S2C } from '../../js/sim/protocol.js';

describe('codec (binary MessagePack)', () => {
  it('encodes to a Uint8Array', () => {
    expect(encode({ t: 'x' })).toBeInstanceOf(Uint8Array);
  });

  it('round-trips a hello message', () => {
    const msg = { t: C2S.HELLO, wireVersion: WIRE_VERSION, name: 'pilot' };
    expect(decode(encode(msg))).toEqual(msg);
  });

  it('round-trips a snapshot (mixed int/float, bool, negative, nested)', () => {
    const snap = {
      t: S2C.SNAPSHOT,
      tick: 1234,
      full: true,
      ships: [
        { id: 1, x: 10.5, y: 20.25, vx: 1, vy: -1, a: 0.5, hp: 100, mhp: 100, al: true, dn: false, li: 9 },
      ],
      asteroids: [{ id: 30000, x: 1919.99, y: 0, a: -3.14159, r: 48 }],
    };
    expect(decode(encode(snap))).toEqual(snap);
  });

  it('preserves the int vs float distinction', () => {
    const out = decode(encode({ i: 42, f: 42.5, big: 5_000_000_000, neg: -7 }));
    expect(out.i).toBe(42);
    expect(out.f).toBeCloseTo(42.5, 10);
    expect(out.big).toBe(5_000_000_000); // > int32 → float64, still exact
    expect(out.neg).toBe(-7);
  });

  it('handles empty containers, null, and unicode strings', () => {
    const msg = { a: [], o: {}, n: null, s: 'café — 日本語', b: false };
    expect(decode(encode(msg))).toEqual(msg);
  });

  it('decodes from a Buffer (server receive path)', () => {
    const msg = { t: C2S.INPUT, up: true, clientTick: 3 };
    expect(decode(Buffer.from(encode(msg)))).toEqual(msg);
  });

  it('decodes from an ArrayBuffer (browser receive path)', () => {
    const msg = { t: S2C.PEER_JOINED, playerId: 2, roster: [1, 2] };
    const u8 = encode(msg);
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    expect(decode(ab)).toEqual(msg);
  });

  it('still tolerates a JSON string and returns null on malformed input', () => {
    expect(decode(JSON.stringify({ t: 'hello' }))).toEqual({ t: 'hello' });
    expect(decode('{not json')).toBeNull();
    expect(decode('')).toBeNull();
  });
});

describe('protocol', () => {
  it('defines distinct message-type tables', () => {
    expect(WIRE_VERSION).toBe(2);
    expect(Object.values(C2S)).toContain('hello');
    expect(Object.values(S2C)).toContain('snapshot');
  });
});
