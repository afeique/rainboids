/**
 * tests/unit/sp-room.test.js — the SpHost-backed authoritative room (Path A).
 *
 * Drives SpRoom with a fake connection (capturing + decoding the wire frames)
 * to verify the full real-sim → wire pipeline without booting the server:
 * WELCOME handshake, the SP-shape snapshot (ships/enemies/asteroids), and the
 * EV.* event stream (bullet fire) the SP client consumes.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { SpRoom } from '../../server/src/sp-room.js';
import { S2C } from '../../js/sim/protocol.js';
import { decode } from '../../js/sim/codec.js';
import { EV } from '../../js/sim/events.js';
import { SnapshotStream } from '../../js/mp/netcode/snapshot-stream.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { setRandomSource } from '../../js/modules/core/utils.js';

afterEach(() => { frameClock.reset(); setRandomSource(null); });

function makeConn() {
  const sent = [];     // objects from conn.send (handshake)
  const frames = [];   // decoded objects from conn.sendRaw (snapshots/events)
  return {
    sent, frames,
    send(obj) { sent.push(obj); },
    sendRaw(bytes) { frames.push(decode(bytes)); },
    close() {},
  };
}

describe('SpRoom — SpHost-backed authoritative room', () => {
  it('answers WELCOME on join with the field-center spawn', async () => {
    const room = new SpRoom({ id: 'test', seed: 5 });
    await room._ready;
    const conn = makeConn();
    const pid = room.join(conn, 'p1');
    const welcome = conn.sent.find((m) => m.t === S2C.WELCOME);
    expect(welcome).toBeTruthy();
    expect(welcome.playerId).toBe(pid);
    expect(welcome.spawnX).toBeCloseTo(room.host.gameField.width / 2, 0);
    expect(welcome.spawnY).toBeCloseTo(room.host.gameField.height / 2, 0);
    room.stop();
  });

  it('broadcasts an SP-shape snapshot keyframe with the controller ship', async () => {
    const room = new SpRoom({ id: 'test', seed: 5 });
    await room._ready;
    const conn = makeConn();
    const pid = room.join(conn, 'p1');
    for (let i = 0; i < 5; i++) room._tick();
    const keyframe = conn.frames.find((m) => m.t === S2C.SNAPSHOT && m.full);
    expect(keyframe).toBeTruthy();
    expect(keyframe.ships).toHaveLength(1);
    expect(keyframe.ships[0].id).toBe(pid);     // client reconciles by this id
    expect(keyframe.wave).toBe(1);              // auto-wave driver started wave 1
    expect(keyframe.enemies.length).toBeGreaterThan(0);   // real wave roster
    expect(keyframe.asteroids.length).toBeGreaterThan(0);
    room.stop();
  });

  it('streams EV.BULLET_SPAWN + server-authoritative bullets when the controller fires', async () => {
    const room = new SpRoom({ id: 'test', seed: 5 });
    await room._ready;
    const conn = makeConn();
    const pid = room.join(conn, 'p1');
    room._tick(); // wave 1 spawns
    room.setInput(pid, { fire: true, aimX: 1600, aimY: 540, clientTick: 1 });
    for (let i = 0; i < 12; i++) room._tick();
    const events = conn.frames
      .filter((m) => m.t === S2C.EVENT)
      .flatMap((m) => m.payloads || []);
    expect(events.some((e) => e.type === EV.BULLET_SPAWN)).toBe(true);
    // Reconstruct the wire exactly as the client does (keyframe + deltas) and
    // confirm bullets reach it.
    const stream = new SnapshotStream();
    let bulletsSeen = 0;
    for (const m of conn.frames) {
      if (m.t !== S2C.SNAPSHOT) continue;
      const full = stream.ingest(m);
      if (full) bulletsSeen = Math.max(bulletsSeen, (full.bullets || []).length);
    }
    expect(bulletsSeen).toBeGreaterThan(0);
    room.stop();
  });

  it('keeps a single controller; a second joiner spectates (one ship)', async () => {
    const room = new SpRoom({ id: 'test', seed: 5 });
    await room._ready;
    const a = makeConn();
    const b = makeConn();
    const pidA = room.join(a, 'a');
    const pidB = room.join(b, 'b');
    expect(room.controllerId).toBe(pidA);
    expect(room.roster()).toEqual([pidA, pidB]);
    room._tick();
    const keyframe = b.frames.find((m) => m.t === S2C.SNAPSHOT && m.full);
    expect(keyframe.ships).toHaveLength(1);       // only the controller's ship
    expect(keyframe.ships[0].id).toBe(pidA);
    room.stop();
  });
});
