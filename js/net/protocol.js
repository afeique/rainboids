// js/net/protocol.js — JS mirror of `server/src/protocol/mod.rs`.
//
// This is the v1 hand-mirror that covers exactly what the Hello → Welcome
// handshake needs:
//
//   • encode `ClientMsg::Hello`
//   • decode `ServerMsg::Welcome`
//   • decode `ServerMsg::Error`
//
// The remaining variants (room, snapshot, event, ping/pong …) are stubbed
// at the discriminant level only; readers throw `NotImplementedError` so
// the rest of the codec can be filled in slice-by-slice as later weeks
// land. Every variant table in this file matches the Rust source 1:1 by
// declaration order — see `docs/Multiplayer Wire Format – 2026-05-09.md`
// for the byte-level reference.
//
// Wire-version pinning: `WIRE_VERSION` and `SIM_VERSION` MUST equal the
// values in `server/src/protocol/version.rs`. The Hello handshake closes
// the socket with `ErrCode.Version` on any mismatch, so a stale client
// gets a clean rejection rather than mysterious decode failures.

import { Reader, Writer, bufToView } from './codec.js';

// ─── Versions (pinned to the Rust source-of-truth) ───────────────────────────

export const WIRE_VERSION = 1;
export const SIM_VERSION = 1;

export function isCompatible(wire, sim) {
    return wire === WIRE_VERSION && sim === SIM_VERSION;
}

// ─── Unit-only enum tags ─────────────────────────────────────────────────────
// All enum discriminants are u32 LE under bincode-fixint (even when the enum
// has no payload variants). Tag values are zero-indexed by declaration order
// in the Rust source.

export const ErrCode = Object.freeze({
    Version: 0,
    BadHello: 1,
    NotFound: 2,
    Full: 3,
    Banned: 4,
    RateLimited: 5,
    Internal: 6,
});

/** Inverse lookup: `0 → 'Version'`, etc. Useful for surfacing error codes. */
export const ErrCodeName = Object.freeze({
    0: 'Version',
    1: 'BadHello',
    2: 'NotFound',
    3: 'Full',
    4: 'Banned',
    5: 'RateLimited',
    6: 'Internal',
});

export const LeaveReason = Object.freeze({
    Voluntary: 0,
    Disconnect: 1,
    GraceExpired: 2,
    Kicked: 3,
    RoomClosed: 4,
});

export const DespawnReason = Object.freeze({
    Lifetime: 0,
    OutOfBounds: 1,
    Hit: 2,
    Killed: 3,
});

export const DmgKind = Object.freeze({
    Normal: 0,
    Crit: 1,
    Heal: 2,
});

export const WeaponId = Object.freeze({
    PulseCannon: 0,
    StormNeedles: 1,
    ScatterGun: 2,
    RailDriver: 3,
    LanceBeam: 4,
    ChargeShot: 5,
    MineLayer: 6,
    NovaBlast: 7,
    LightningArc: 8,
    MissileSalvo: 9,
});

export const EntityRefKind = Object.freeze({
    Ship: 0,
    Enemy: 1,
    Asteroid: 2,
    Bullet: 3,
});

// ─── Top-level message variant tables ────────────────────────────────────────

export const C2S = Object.freeze({
    HELLO: 0,
    QUICK_MATCH: 1,
    BROWSE_ROOMS: 2,
    CREATE_ROOM: 3,
    JOIN_ROOM: 4,
    JOIN_ROOM_BY_CODE: 5,
    LEAVE_ROOM: 6,
    INPUT: 7,
    ACK: 8,
    PONG: 9,
    POWERUP_CHOOSE: 10,
    REVIVE: 11,
    CHAT: 12,
});

export const S2C = Object.freeze({
    WELCOME: 0,
    ERROR: 1,
    ROOM_LIST: 2,
    ROOM_JOINED: 3,
    ROOM_LEFT: 4,
    PEER_JOINED: 5,
    PEER_LEFT: 6,
    SNAPSHOT: 7,
    EVENT: 8,
    PING: 9,
});

// ─── ClientMsg encoders ──────────────────────────────────────────────────────

/**
 * Encode a `ClientMsg`. v1 only implements `Hello` since that's the only
 * variant the Week-6 handshake sends; later variants will be added as the
 * client engine grows. Throws `NotImplementedError` for unsupported tags
 * so a partial implementation fails loudly instead of writing garbage.
 *
 * @param {object} msg
 * @returns {Uint8Array}
 */
export function encodeClientMsg(msg) {
    const w = new Writer(128);
    writeClientMsg(w, msg);
    return w.bytes();
}

export function writeClientMsg(w, msg) {
    switch (msg.type) {
        case C2S.HELLO:
            w.variant(C2S.HELLO);
            w.u16(msg.wireVersion);
            w.u16(msg.simVersion);
            w.str(msg.clientVersion);
            w.str(msg.displayName);
            // Option<Uuid>: 1-byte tag + (if Some) length-prefixed 16 bytes.
            // `msg.session` may be a canonical-string UUID, a 16-byte
            // Uint8Array, or null/undefined for None.
            w.option(msg.session ?? null, (ww, v) => ww.uuid(v));
            return;
        default:
            throw new NotImplementedError(
                `writeClientMsg: variant ${msg.type} not implemented in v1`,
            );
    }
}

/**
 * Convenience: build + encode a Hello in one call. Mirrors the Rust struct
 * literal in `server/src/server/connection.rs`.
 *
 * @param {object} args
 * @param {string} args.clientVersion
 * @param {string} args.displayName
 * @param {string|Uint8Array|null} [args.session]
 * @param {number} [args.wireVersion]
 * @param {number} [args.simVersion]
 * @returns {Uint8Array}
 */
export function encodeHello({
    clientVersion,
    displayName,
    session = null,
    wireVersion = WIRE_VERSION,
    simVersion = SIM_VERSION,
}) {
    return encodeClientMsg({
        type: C2S.HELLO,
        wireVersion,
        simVersion,
        clientVersion,
        displayName,
        session,
    });
}

// ─── ServerMsg decoders ──────────────────────────────────────────────────────

/**
 * Decode a single `ServerMsg` from a binary frame. Returns one of:
 *   { type: S2C.WELCOME, playerId: bigint, session: string, serverTMs: bigint }
 *   { type: S2C.ERROR,   code: number, codeName: string, msg: string }
 *
 * Other variants throw `NotImplementedError`. The handshake only has to
 * understand Welcome and Error; anything else arriving as the first frame
 * is a protocol violation the caller can surface to the user.
 *
 * @param {ArrayBuffer | ArrayBufferView | DataView} buf
 */
export function decodeServerMsg(buf) {
    const r = new Reader(bufToView(buf));
    return readServerMsg(r);
}

export function readServerMsg(r) {
    const tag = r.variant();
    switch (tag) {
        case S2C.WELCOME:
            return {
                type: S2C.WELCOME,
                playerId: r.u64(), // bigint; safe because PlayerId fits but caller may toString()
                session: r.uuid(), // canonical "8-4-4-4-12" hex string
                serverTMs: r.u64(),
            };
        case S2C.ERROR: {
            const code = r.variant(); // ErrCode is u32 LE
            const msg = r.str();
            return {
                type: S2C.ERROR,
                code,
                codeName: ErrCodeName[code] ?? `Unknown(${code})`,
                msg,
            };
        }
        case S2C.ROOM_LIST:
        case S2C.ROOM_JOINED:
        case S2C.ROOM_LEFT:
        case S2C.PEER_JOINED:
        case S2C.PEER_LEFT:
        case S2C.SNAPSHOT:
        case S2C.EVENT:
        case S2C.PING:
            throw new NotImplementedError(
                `readServerMsg: variant ${tag} not implemented in v1`,
            );
        default:
            throw new TypeError(`readServerMsg: unknown tag ${tag}`);
    }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Thrown when the codec is asked to encode/decode a variant outside the v1
 * Hello/Welcome scope. The handshake should never hit this; if it does,
 * either the server is sending a future-protocol message (a version bug)
 * or the caller is misusing the codec.
 */
export class NotImplementedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotImplementedError';
    }
}
