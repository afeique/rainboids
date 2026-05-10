/**
 * tests/unit/net/matchmaking.test.js — promise-shape coverage for the
 * matchmaking layer.
 *
 * The Matchmaking class wraps a Welcomed `ConnectionTask` and exposes
 * `quickMatch()`, `createRoom()`, `joinByCode()`, `browse()`, `leave()`.
 * Each one sends a `ClientMsg`, registers one-shot listeners on the
 * connection's event-emitter, and resolves/rejects with the next response.
 *
 * These tests use a `FakeConnection` that mimics ConnectionTask's
 * `.on(event, fn) → unsubscribe` API + the matchmaking send methods.
 * The real codec is exercised: `sendCreateRoom` etc. encode bytes and
 * stash them in `sentBytes` so the test asserts the wire payload is
 * shaped correctly.
 */

import { describe, expect, jest, test } from '@jest/globals';

import { Matchmaking } from '../../../js/net/matchmaking.js';
import { Reader } from '../../../js/net/codec.js';
import { C2S, encodeClientMsg } from '../../../js/net/protocol.js';

/**
 * Minimal stand-in for `ConnectionTask`. Exposes the on/_emit/send API
 * the matchmaking layer talks to. Captures sent bytes for byte-level
 * assertions.
 */
class FakeConnection {
    constructor() {
        this._listeners = new Map();
        this.sentBytes = []; // each entry is a Uint8Array
        this.sentMsgs = [];  // each entry is the ClientMsg object
    }

    on(event, fn) {
        let set = this._listeners.get(event);
        if (!set) { set = new Set(); this._listeners.set(event, set); }
        set.add(fn);
        return () => set.delete(fn);
    }

    emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of [...set]) fn(payload);
    }

    _send(msg) {
        const bytes = encodeClientMsg(msg);
        this.sentBytes.push(bytes);
        this.sentMsgs.push(msg);
    }

    sendQuickMatch() {
        this._send({ type: C2S.QUICK_MATCH });
    }
    sendCreateRoom(name, isPublic, maxPlayers) {
        this._send({
            type: C2S.CREATE_ROOM,
            name: String(name),
            public: !!isPublic,
            maxPlayers: maxPlayers | 0,
        });
    }
    sendJoinByCode(code) {
        this._send({
            type: C2S.JOIN_ROOM_BY_CODE,
            code: String(code).toUpperCase(),
        });
    }
    sendBrowseRooms() {
        this._send({ type: C2S.BROWSE_ROOMS });
    }
    sendLeaveRoom() {
        this._send({ type: C2S.LEAVE_ROOM });
    }
}

// ─── createRoom ─────────────────────────────────────────────────────────────

describe('Matchmaking.createRoom', () => {
    test('sends ClientMsg::CreateRoom with the documented byte layout', () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        // We don't await; the promise stays pending until conn.emit fires.
        const _pending = mm.createRoom('Test', true, 4);

        expect(conn.sentBytes).toHaveLength(1);
        const bytes = conn.sentBytes[0];

        // CreateRoom layout (tag = 3, declaration order in protocol/mod.rs):
        //   variant (u32 LE = 3)
        //   name    (String — u64 LE length + UTF-8 bytes)
        //   public  (bool → u8)
        //   max_players (u8)
        const r = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        expect(r.variant()).toBe(C2S.CREATE_ROOM);
        expect(r.str()).toBe('Test');
        expect(r.bool()).toBe(true);
        expect(r.u8()).toBe(4);
        expect(r.eof()).toBe(true);

        // Cleanly resolve the dangling promise so Jest doesn't gripe.
        conn.emit('room_joined', _fakeRoom());
        return _pending;
    });

    test('resolves with the RoomJoined payload', async () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const pending = mm.createRoom('Lobby', false, 2);

        const payload = _fakeRoom({ code: 'ABC123', slot: 0 });
        // Defer the emit so the listener registration in `_oneShot` has run.
        Promise.resolve().then(() => conn.emit('room_joined', payload));

        const room = await pending;
        expect(room.code).toBe('ABC123');
        expect(room.slot).toBe(0);
    });

    test('rejects with a coded Error on `error_msg`', async () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const pending = mm.createRoom('Lobby', true, 4);

        Promise.resolve().then(() =>
            conn.emit('error_msg', { code: 3, codeName: 'Full', msg: 'server full' }),
        );

        await expect(pending).rejects.toMatchObject({
            code: 'Full',
            codeNum: 3,
            codeName: 'Full',
            msg: 'server full',
        });
    });

    test('rejects on disconnect mid-flight', async () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const pending = mm.createRoom('Lobby', true, 4);

        Promise.resolve().then(() => conn.emit('disconnect', {}));

        await expect(pending).rejects.toThrow(/disconnected/i);
    });
});

// ─── joinByCode ─────────────────────────────────────────────────────────────

describe('Matchmaking.joinByCode', () => {
    test('sends ClientMsg::JoinRoomByCode with uppercase code', () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const _pending = mm.joinByCode('abc123');

        expect(conn.sentBytes).toHaveLength(1);
        const bytes = conn.sentBytes[0];

        // JoinRoomByCode layout (tag = 5):
        //   variant (u32 LE = 5)
        //   code    (String — u64 LE length + UTF-8)
        const r = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        expect(r.variant()).toBe(C2S.JOIN_ROOM_BY_CODE);
        expect(r.str()).toBe('ABC123'); // uppercased on the wire
        expect(r.eof()).toBe(true);

        conn.emit('room_joined', _fakeRoom({ code: 'ABC123', slot: 1 }));
        return _pending;
    });

    test('resolves with the RoomJoined payload', async () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const pending = mm.joinByCode('XYZW01');

        const payload = _fakeRoom({ code: 'XYZW01', slot: 1, peers: [{ playerId: 1n, displayName: 'Host', slot: 0 }] });
        Promise.resolve().then(() => conn.emit('room_joined', payload));

        const room = await pending;
        expect(room.code).toBe('XYZW01');
        expect(room.slot).toBe(1);
        expect(room.peers).toHaveLength(1);
    });

    test('rejects with NotFound when the code is unknown', async () => {
        const conn = new FakeConnection();
        const mm = new Matchmaking(conn);
        const pending = mm.joinByCode('ZZZZZZ');

        Promise.resolve().then(() =>
            conn.emit('error_msg', { code: 2, codeName: 'NotFound', msg: 'unknown code' }),
        );

        await expect(pending).rejects.toMatchObject({
            code: 'NotFound',
            codeNum: 2,
        });
    });
});

// ─── helpers ────────────────────────────────────────────────────────────────

function _fakeRoom(overrides = {}) {
    return {
        roomId: 1n,
        code: 'ABC123',
        slot: 0,
        peers: [],
        wave: 0,
        seed: 42n,
        ...overrides,
    };
}
