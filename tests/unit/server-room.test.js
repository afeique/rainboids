/**
 * tests/unit/server-room.test.js — Room logic with an in-memory fake Transport
 * connection (no real socket). Validates join/Welcome, peer broadcasts, input
 * intake, snapshot assembly, and leave — deterministically, by driving ticks
 * manually instead of relying on the interval timer.
 */

import { describe, it, expect } from '@jest/globals';
import { Room } from '../../server/src/room.js';
import { S2C } from '../../js/sim/protocol.js';

function fakeConn(id) {
  const sent = [];
  return {
    id,
    isOpen: true,
    send(obj) { sent.push(obj); },
    sendRaw(str) { sent.push(JSON.parse(str)); },
    onMessage(cb) { this._m = cb; },
    onClose(cb) { this._c = cb; },
    close() { this.isOpen = false; if (this._c) this._c(); },
    sent,
    last(t) { return [...sent].reverse().find((m) => m.t === t); },
    count(t) { return sent.filter((m) => m.t === t).length; },
  };
}

describe('Room', () => {
  it('welcomes a joining player and spawns their ship', () => {
    const room = new Room({ id: 'test', seed: 42 });
    const a = fakeConn(1);
    const id = room.join(a, 'alice');

    const welcome = a.last(S2C.WELCOME);
    expect(welcome).toBeTruthy();
    expect(welcome.playerId).toBe(id);
    expect(welcome.seed).toBe(42);
    expect(room.world.ships.has(id)).toBe(true);
    expect(room.population).toBe(1);
  });

  it('broadcasts PeerJoined to existing players only', () => {
    const room = new Room({ id: 'test', seed: 42 });
    const a = fakeConn(1);
    const b = fakeConn(2);
    const idA = room.join(a, 'alice');
    const idB = room.join(b, 'bob');

    // alice should hear that bob joined; bob should not hear his own join.
    expect(a.last(S2C.PEER_JOINED).playerId).toBe(idB);
    expect(b.count(S2C.PEER_JOINED)).toBe(0);
    expect(room.population).toBe(2);
    expect(idA).not.toBe(idB);
  });

  it('applies input and broadcasts a snapshot each tick', () => {
    const room = new Room({ id: 'test', seed: 42 });
    const a = fakeConn(1);
    const id = room.join(a, 'alice');
    const startX = room.world.ships.get(id).x;

    room.setInput(id, { t: 'input', right: true, clientTick: 5 });
    room._tick();

    const snap = a.last(S2C.SNAPSHOT);
    expect(snap).toBeTruthy();
    expect(snap.tick).toBe(1);
    const me = snap.ships.find((s) => s.id === id);
    expect(me.x).toBeGreaterThan(startX);
    expect(me.li).toBe(5); // acked input tick echoed for reconciliation
  });

  it('removes the ship and broadcasts PeerLeft on leave', () => {
    const room = new Room({ id: 'test', seed: 42 });
    const a = fakeConn(1);
    const b = fakeConn(2);
    room.join(a, 'alice');
    const idB = room.join(b, 'bob');

    room.leave(idB);
    expect(room.world.ships.has(idB)).toBe(false);
    expect(a.last(S2C.PEER_LEFT).playerId).toBe(idB);
    expect(room.population).toBe(1);
  });
});
