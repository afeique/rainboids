// Protocol round-trip tests: every variant in `js/sim/protocol.js`.
// The Rust counterpart in `server/src/protocol/mod.rs` has matching
// `encode → decode` round-trip tests; the parity harness verifies
// byte-for-byte agreement across the language boundary.

import { describe, test, expect } from '@jest/globals';
import {
    C2S,
    S2C,
    EVT,
    ENTITY_REF,
    encodeClientMsg,
    decodeClientMsg,
    encodeServerMsg,
    decodeServerMsg,
    writeGameEvent,
    readGameEvent,
    Reader,
    Writer,
    WeaponId,
    DespawnReason,
    DmgKind,
    LeaveReason,
    ErrCode,
} from '../../../js/sim/index.js';
import { WIRE_VERSION, SIM_VERSION } from '../../../js/sim/version.js';

function rtClient(msg) {
    const buf = encodeClientMsg(msg);
    return decodeClientMsg(buf.slice());
}

function rtServer(msg) {
    const buf = encodeServerMsg(msg);
    return decodeServerMsg(buf.slice());
}

function rtEvent(ev) {
    const w = new Writer(64);
    writeGameEvent(w, ev);
    const b = w.bytes().slice();
    const r = new Reader(new DataView(b.buffer));
    return readGameEvent(r);
}

const ZERO_UUID = new Uint8Array(16);
const SAMPLE_UUID = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);

describe('ClientMsg round-trips', () => {
    test('Hello with session', () => {
        const msg = {
            type: C2S.HELLO,
            wireVersion: WIRE_VERSION,
            simVersion: SIM_VERSION,
            clientVersion: '5.83.0',
            displayName: 'Pilot',
            session: SAMPLE_UUID,
        };
        const out = rtClient(msg);
        expect(out.type).toBe(C2S.HELLO);
        expect(out.wireVersion).toBe(WIRE_VERSION);
        expect(out.simVersion).toBe(SIM_VERSION);
        expect(out.clientVersion).toBe('5.83.0');
        expect(out.displayName).toBe('Pilot');
        expect(Array.from(out.session)).toEqual(Array.from(SAMPLE_UUID));
    });

    test('Hello without session', () => {
        const msg = {
            type: C2S.HELLO,
            wireVersion: WIRE_VERSION,
            simVersion: SIM_VERSION,
            clientVersion: '5.83.0',
            displayName: 'Pilot',
            session: null,
        };
        const out = rtClient(msg);
        expect(out.session).toBe(null);
    });

    test('QuickMatch (unit variant)', () => {
        expect(rtClient({ type: C2S.QUICK_MATCH }).type).toBe(C2S.QUICK_MATCH);
    });

    test('BrowseRooms (unit variant)', () => {
        expect(rtClient({ type: C2S.BROWSE_ROOMS }).type).toBe(C2S.BROWSE_ROOMS);
    });

    test('CreateRoom', () => {
        const out = rtClient({
            type: C2S.CREATE_ROOM,
            name: 'cool room',
            public: true,
            maxPlayers: 4,
        });
        expect(out).toEqual({
            type: C2S.CREATE_ROOM,
            name: 'cool room',
            public: true,
            maxPlayers: 4,
        });
    });

    test('JoinRoom (RoomId is u64)', () => {
        const out = rtClient({ type: C2S.JOIN_ROOM, roomId: 0x1122334455667788n });
        expect(out.roomId).toBe(0x1122334455667788n);
    });

    test('JoinRoomByCode', () => {
        expect(rtClient({ type: C2S.JOIN_ROOM_BY_CODE, code: '7XBKM4' }).code).toBe(
            '7XBKM4',
        );
    });

    test('LeaveRoom (unit variant)', () => {
        expect(rtClient({ type: C2S.LEAVE_ROOM }).type).toBe(C2S.LEAVE_ROOM);
    });

    test('Input', () => {
        const packed = { moveX: 50, moveY: -100, aimX: 30000, aimY: -25000, buttons: 0b0011 };
        const out = rtClient({ type: C2S.INPUT, tick: 42, packed });
        expect(out.tick).toBe(42);
        expect(out.packed).toEqual(packed);
    });

    test('Ack / Pong / Revive / Chat', () => {
        expect(rtClient({ type: C2S.ACK, snapshotTick: 99 }).snapshotTick).toBe(99);
        const pong = rtClient({ type: C2S.PONG, clientT: 1, serverT: 2 });
        expect(pong).toMatchObject({ clientT: 1, serverT: 2 });
        const rev = rtClient({ type: C2S.REVIVE, target: 7n });
        expect(rev.target).toBe(7n);
        expect(rtClient({ type: C2S.CHAT, text: 'gg!' }).text).toBe('gg!');
    });

    test('PowerupChoose (PowerupId is u16)', () => {
        const out = rtClient({ type: C2S.POWERUP_CHOOSE, powerup: 0xabcd });
        expect(out.powerup).toBe(0xabcd);
    });
});

describe('ServerMsg round-trips', () => {
    test('Welcome', () => {
        const out = rtServer({
            type: S2C.WELCOME,
            playerId: 100n,
            session: SAMPLE_UUID,
            serverTMs: 1234567890n,
        });
        expect(out.playerId).toBe(100n);
        expect(Array.from(out.session)).toEqual(Array.from(SAMPLE_UUID));
        expect(out.serverTMs).toBe(1234567890n);
    });

    test('Error with ErrCode tag', () => {
        const out = rtServer({
            type: S2C.ERROR,
            code: ErrCode.Version,
            msg: 'wire mismatch',
        });
        expect(out.code).toBe(ErrCode.Version);
        expect(out.msg).toBe('wire mismatch');
    });

    test('RoomJoined', () => {
        const peers = [
            { playerId: 1n, displayName: 'Alice', slot: 0 },
            { playerId: 2n, displayName: 'Bob', slot: 1 },
        ];
        const out = rtServer({
            type: S2C.ROOM_JOINED,
            roomId: 42n,
            code: 'ABC123',
            slot: 2,
            peers,
            wave: 5,
            seed: 99999n,
        });
        expect(out.roomId).toBe(42n);
        expect(out.code).toBe('ABC123');
        expect(out.slot).toBe(2);
        expect(out.peers).toHaveLength(2);
        expect(out.peers[0].displayName).toBe('Alice');
        expect(out.peers[1].playerId).toBe(2n);
        expect(out.wave).toBe(5);
        expect(out.seed).toBe(99999n);
    });

    test('Snapshot with empty payload', () => {
        const out = rtServer({
            type: S2C.SNAPSHOT,
            tick: 100,
            baseTick: null,
            payload: { ships: [], enemies: [], asteroids: [], drops: [], bullets: [] },
        });
        expect(out.tick).toBe(100);
        expect(out.baseTick).toBe(null);
        expect(out.payload.ships).toEqual([]);
    });

    test('Snapshot with delta base tick', () => {
        const out = rtServer({
            type: S2C.SNAPSHOT,
            tick: 100,
            baseTick: 99,
            payload: {
                ships: [{ player: 1n, x: 10, y: 20, vx: 0, vy: 0, angle: 0, hp: 100, shield: 100 }],
                enemies: [],
                asteroids: [],
                drops: [],
                bullets: [],
            },
        });
        expect(out.baseTick).toBe(99);
        expect(out.payload.ships[0].player).toBe(1n);
    });

    test('Ping', () => {
        const out = rtServer({ type: S2C.PING, clientT: 11, serverT: 22 });
        expect(out).toMatchObject({ clientT: 11, serverT: 22 });
    });
});

describe('GameEvent round-trips (every variant)', () => {
    const cases = [
        {
            name: 'BulletSpawn',
            ev: {
                type: EVT.BULLET_SPAWN,
                id: 1n,
                owner: 2n,
                weapon: WeaponId.PulseCannon,
                x: 100,
                y: 200,
                vx: 5,
                vy: 0,
            },
        },
        {
            name: 'BulletDespawn',
            ev: { type: EVT.BULLET_DESPAWN, id: 7n, reason: DespawnReason.Hit },
        },
        {
            name: 'EnemyDestroy with drops',
            ev: {
                type: EVT.ENEMY_DESTROY,
                id: 33n,
                by: 1n,
                drops: [10n, 11n, 12n],
            },
        },
        {
            name: 'EnemyDestroy no killer',
            ev: { type: EVT.ENEMY_DESTROY, id: 34n, by: null, drops: [] },
        },
        {
            name: 'AsteroidDestroy with fragments',
            ev: {
                type: EVT.ASTEROID_DESTROY,
                id: 50n,
                by: 1n,
                fragments: [51n, 52n],
            },
        },
        {
            name: 'OrbCollect',
            ev: { type: EVT.ORB_COLLECT, id: 90n, by: 1n, value: 25 },
        },
        {
            name: 'PlayerDamaged',
            ev: { type: EVT.PLAYER_DAMAGED, player: 1n, hp: 75 },
        },
        { name: 'PlayerDowned', ev: { type: EVT.PLAYER_DOWNED, player: 1n } },
        {
            name: 'PlayerRevived',
            ev: { type: EVT.PLAYER_REVIVED, player: 1n, by: 2n },
        },
        {
            name: 'WaveStart',
            ev: { type: EVT.WAVE_START, wave: 5, enemyCount: 22 },
        },
        {
            name: 'WaveClear',
            ev: { type: EVT.WAVE_CLEAR, wave: 5, timeMs: 60000 },
        },
        {
            name: 'PowerupOffer',
            ev: { type: EVT.POWERUP_OFFER, player: 1n, picks: 3 },
        },
        {
            name: 'PowerupChosen',
            ev: { type: EVT.POWERUP_CHOSEN, player: 1n, powerup: 7 },
        },
        {
            name: 'HitFlash on Enemy',
            ev: {
                type: EVT.HIT_FLASH,
                entity: { kind: ENTITY_REF.ENEMY, id: 99n },
                intensity: 0.75,
            },
        },
        {
            name: 'DamageNumber crit',
            ev: {
                type: EVT.DAMAGE_NUMBER,
                x: 100,
                y: 50,
                value: -123,
                kind: DmgKind.Crit,
            },
        },
    ];

    for (const c of cases) {
        test(c.name, () => {
            const out = rtEvent(c.ev);
            expect(out).toEqual(c.ev);
        });
    }
});

describe('Wire layout — Hello with empty fields is byte-stable', () => {
    test('Hello empty stays the same length each call', () => {
        const msg = {
            type: C2S.HELLO,
            wireVersion: WIRE_VERSION,
            simVersion: SIM_VERSION,
            clientVersion: '',
            displayName: '',
            session: null,
        };
        const a = encodeClientMsg(msg);
        const b = encodeClientMsg(msg);
        expect(a.byteLength).toBe(b.byteLength);
        // u32 tag (4) + u16+u16 (4) + 8(len)+0(str) + 8(len)+0(str) + 1(option None) = 25
        expect(a.byteLength).toBe(25);
    });
});

/* ─── Byte-golden parity vs Rust ─────────────────────────────────────────── */
// These vectors mirror `server/tests/wire_golden.rs` byte-for-byte. If the
// Rust side changes encoding, these break and need to be regenerated; if
// the JS side drifts, these break and need a JS fix. Either way, the
// failure points at the right place.

const SAMPLE_UUID16 = new Uint8Array([
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
]);

function hexBytes(arr) {
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

describe('byte-golden parity (mirrors server/tests/wire_golden.rs)', () => {
    test('Hello no session — 36 bytes, exact', () => {
        const got = encodeClientMsg({
            type: C2S.HELLO,
            wireVersion: 1,
            simVersion: 1,
            clientVersion: '5.81.1',
            displayName: 'Pilot',
            session: null,
        });
        // prettier-ignore
        const want = new Uint8Array([
            0x00, 0x00, 0x00, 0x00,                                     // tag = Hello
            0x01, 0x00, 0x01, 0x00,                                     // wire/sim = 1, 1
            0x06, 0, 0, 0, 0, 0, 0, 0,                                  // client_version len = 6
            0x35, 0x2e, 0x38, 0x31, 0x2e, 0x31,                         // "5.81.1"
            0x05, 0, 0, 0, 0, 0, 0, 0,                                  // display_name len = 5
            0x50, 0x69, 0x6c, 0x6f, 0x74,                               // "Pilot"
            0x00,                                                       // session = None
        ]);
        expect(got.byteLength).toBe(36);
        expect(hexBytes(got)).toBe(hexBytes(want));
    });

    test('Hello with session — 60 bytes, includes u64-prefixed UUID', () => {
        const got = encodeClientMsg({
            type: C2S.HELLO,
            wireVersion: 1,
            simVersion: 1,
            clientVersion: '5.81.1',
            displayName: 'Pilot',
            session: SAMPLE_UUID16,
        });
        // prettier-ignore
        const want = new Uint8Array([
            0x00, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x01, 0x00,
            0x06, 0, 0, 0, 0, 0, 0, 0,
            0x35, 0x2e, 0x38, 0x31, 0x2e, 0x31,
            0x05, 0, 0, 0, 0, 0, 0, 0,
            0x50, 0x69, 0x6c, 0x6f, 0x74,
            0x01,                                                       // session = Some
            0x10, 0, 0, 0, 0, 0, 0, 0,                                  // uuid byte len = 16
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
        ]);
        expect(got.byteLength).toBe(60);
        expect(hexBytes(got)).toBe(hexBytes(want));
    });

    test('Welcome — 44 bytes, decodes round-trip', () => {
        const msg = {
            type: S2C.WELCOME,
            playerId: 42n,
            session: SAMPLE_UUID16,
            serverTMs: 0x0102030405060708n,
        };
        const got = encodeServerMsg(msg);
        // prettier-ignore
        const want = new Uint8Array([
            0x00, 0x00, 0x00, 0x00,                                     // tag = Welcome
            0x2a, 0, 0, 0, 0, 0, 0, 0,                                  // player_id = 42
            0x10, 0, 0, 0, 0, 0, 0, 0,                                  // uuid len = 16
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
            0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,             // server_t_ms LE
        ]);
        expect(got.byteLength).toBe(44);
        expect(hexBytes(got)).toBe(hexBytes(want));

        const back = decodeServerMsg(got.slice());
        expect(back.playerId).toBe(42n);
        expect(Array.from(back.session)).toEqual(Array.from(SAMPLE_UUID16));
        expect(back.serverTMs).toBe(0x0102030405060708n);
    });

    test('Error{Version, "server v1/1"} — 27 bytes', () => {
        const got = encodeServerMsg({
            type: S2C.ERROR,
            code: ErrCode.Version,
            msg: 'server v1/1',
        });
        // prettier-ignore
        const want = new Uint8Array([
            0x01, 0x00, 0x00, 0x00,                                     // tag = Error
            0x00, 0x00, 0x00, 0x00,                                     // ErrCode = Version
            0x0b, 0, 0, 0, 0, 0, 0, 0,                                  // msg len = 11
            0x73, 0x65, 0x72, 0x76, 0x65, 0x72, 0x20, 0x76, 0x31, 0x2f, 0x31,
        ]);
        expect(got.byteLength).toBe(27);
        expect(hexBytes(got)).toBe(hexBytes(want));
    });

    test('QuickMatch (unit variant) — 4 bytes (just the tag)', () => {
        const got = encodeClientMsg({ type: C2S.QUICK_MATCH });
        expect(got.byteLength).toBe(4);
        expect(Array.from(got)).toEqual([0x01, 0x00, 0x00, 0x00]);
    });

    test('Input — 15 bytes, packed input layout', () => {
        const got = encodeClientMsg({
            type: C2S.INPUT,
            tick: 0x12345678,
            packed: {
                moveX: 100,
                moveY: -50,
                aimX: 16384,
                aimY: -16384,
                buttons: 0b0000_0011,
            },
        });
        // prettier-ignore
        const want = new Uint8Array([
            0x07, 0x00, 0x00, 0x00,         // tag = Input (variant 7)
            0x78, 0x56, 0x34, 0x12,         // tick LE
            0x64,                           // move_x = 100
            0xce,                           // move_y = -50 = 0xce
            0x00, 0x40,                     // aim_x = 16384 LE
            0x00, 0xc0,                     // aim_y = -16384 LE
            0x03,                           // buttons
        ]);
        expect(got.byteLength).toBe(15);
        expect(hexBytes(got)).toBe(hexBytes(want));
    });
});
