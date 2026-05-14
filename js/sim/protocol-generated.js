// Auto-generated wire protocol — DO NOT EDIT.
//
// Source: `schema/protocol.toml`. To regenerate, run
//   `npm run codegen`         (rewrite both Rust + JS outputs)
//   `npm run codegen:check`   (CI gate — exits non-zero on drift)
//
// Schema: wire_version=1, sim_version=1
// Codec:  bincode-1.x-default-with-fixint-le

import { Reader, Writer } from './codec.js';

export const WIRE_VERSION = 1;
export const SIM_VERSION = 1;

// ─── Plain enums ────────────────────────────────────────────────

export const ErrCode = Object.freeze({
    Version: 0,
    BadHello: 1,
    NotFound: 2,
    Full: 3,
    Banned: 4,
    RateLimited: 5,
    Internal: 6,
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

// ─── Tagged-enum tables (SCREAMING_SNAKE keys) ──────────────────

export const ENTITY_REF = Object.freeze({
    SHIP: 0,
    ENEMY: 1,
    ASTEROID: 2,
    BULLET: 3,
});

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

export const EVT = Object.freeze({
    BULLET_SPAWN: 0,
    BULLET_DESPAWN: 1,
    ENEMY_DESTROY: 2,
    ASTEROID_DESTROY: 3,
    ORB_COLLECT: 4,
    PLAYER_DAMAGED: 5,
    PLAYER_DOWNED: 6,
    PLAYER_REVIVED: 7,
    WAVE_START: 8,
    WAVE_CLEAR: 9,
    POWERUP_OFFER: 10,
    POWERUP_CHOSEN: 11,
    HIT_FLASH: 12,
    DAMAGE_NUMBER: 13,
});

// ─── Struct codecs ──────────────────────────────────────────────

export function writePackedInput(w, s) {
    w.i8(s.moveX);
    w.i8(s.moveY);
    w.i16(s.aimX);
    w.i16(s.aimY);
    w.u8(s.buttons);
}
export function readPackedInput(r) {
    return {
        moveX: r.i8(),
        moveY: r.i8(),
        aimX: r.i16(),
        aimY: r.i16(),
        buttons: r.u8(),
    };
}

export function writePeerInfo(w, s) {
    w.u64(s.playerId);
    w.str(s.displayName);
    w.u8(s.slot);
}
export function readPeerInfo(r) {
    return {
        playerId: r.u64(),
        displayName: r.str(),
        slot: r.u8(),
    };
}

export function writeRoomSummary(w, s) {
    w.u64(s.roomId);
    w.str(s.name);
    w.u8(s.players);
    w.u8(s.maxPlayers);
    w.u32(s.wave);
}
export function readRoomSummary(r) {
    return {
        roomId: r.u64(),
        name: r.str(),
        players: r.u8(),
        maxPlayers: r.u8(),
        wave: r.u32(),
    };
}

export function writeShipState(w, s) {
    w.u64(s.player);
    w.f32(s.x);
    w.f32(s.y);
    w.f32(s.vx);
    w.f32(s.vy);
    w.f32(s.angle);
    w.f32(s.hp);
    w.f32(s.shield);
}
export function readShipState(r) {
    return {
        player: r.u64(),
        x: r.f32(),
        y: r.f32(),
        vx: r.f32(),
        vy: r.f32(),
        angle: r.f32(),
        hp: r.f32(),
        shield: r.f32(),
    };
}

export function writeEnemyState(w, s) {
    w.u64(s.id);
    w.u8(s.kind);
    w.f32(s.x);
    w.f32(s.y);
    w.f32(s.hp);
}
export function readEnemyState(r) {
    return {
        id: r.u64(),
        kind: r.u8(),
        x: r.f32(),
        y: r.f32(),
        hp: r.f32(),
    };
}

export function writeAsteroidState(w, s) {
    w.u64(s.id);
    w.u8(s.size);
    w.f32(s.x);
    w.f32(s.y);
}
export function readAsteroidState(r) {
    return {
        id: r.u64(),
        size: r.u8(),
        x: r.f32(),
        y: r.f32(),
    };
}

export function writeDropState(w, s) {
    w.u64(s.id);
    w.u8(s.kind);
    w.f32(s.x);
    w.f32(s.y);
}
export function readDropState(r) {
    return {
        id: r.u64(),
        kind: r.u8(),
        x: r.f32(),
        y: r.f32(),
    };
}

export function writeBulletState(w, s) {
    w.u32(s.id);
    w.f32(s.x);
    w.f32(s.y);
    w.f32(s.vx);
    w.f32(s.vy);
    w.f32(s.angle);
    w.f32(s.radius);
}
export function readBulletState(r) {
    return {
        id: r.u32(),
        x: r.f32(),
        y: r.f32(),
        vx: r.f32(),
        vy: r.f32(),
        angle: r.f32(),
        radius: r.f32(),
    };
}

export function writeSnapshotPayload(w, s) {
    w.vec(s.ships, writeShipState);
    w.vec(s.enemies, writeEnemyState);
    w.vec(s.asteroids, writeAsteroidState);
    w.vec(s.drops, writeDropState);
    w.vec(s.bullets, writeBulletState);
}
export function readSnapshotPayload(r) {
    return {
        ships: r.vec(readShipState),
        enemies: r.vec(readEnemyState),
        asteroids: r.vec(readAsteroidState),
        drops: r.vec(readDropState),
        bullets: r.vec(readBulletState),
    };
}

export function writeEntityRef(w, e) {
    w.variant(e.kind);
    w.u64(e.id);
}
export function readEntityRef(r) {
    const kind = r.variant();
    const id = r.u64();
    return { kind, id };
}

// ─── Message codecs ─────────────────────────────────────────────

export function writeGameEvent(w, msg) {
    switch (msg.type) {
        case EVT.BULLET_SPAWN:
            w.variant(EVT.BULLET_SPAWN);
            w.u64(msg.id);
            w.u64(msg.owner);
            w.u32(msg.weapon);
            w.f32(msg.x);
            w.f32(msg.y);
            w.f32(msg.vx);
            w.f32(msg.vy);
            return;
        case EVT.BULLET_DESPAWN:
            w.variant(EVT.BULLET_DESPAWN);
            w.u64(msg.id);
            w.u32(msg.reason);
            return;
        case EVT.ENEMY_DESTROY:
            w.variant(EVT.ENEMY_DESTROY);
            w.u64(msg.id);
            w.option(msg.by, (ww, v) => ww.u64(v));
            w.vec(msg.drops, (ww, v) => ww.u64(v));
            return;
        case EVT.ASTEROID_DESTROY:
            w.variant(EVT.ASTEROID_DESTROY);
            w.u64(msg.id);
            w.option(msg.by, (ww, v) => ww.u64(v));
            w.vec(msg.fragments, (ww, v) => ww.u64(v));
            return;
        case EVT.ORB_COLLECT:
            w.variant(EVT.ORB_COLLECT);
            w.u64(msg.id);
            w.u64(msg.by);
            w.u32(msg.value);
            return;
        case EVT.PLAYER_DAMAGED:
            w.variant(EVT.PLAYER_DAMAGED);
            w.u64(msg.player);
            w.f32(msg.hp);
            return;
        case EVT.PLAYER_DOWNED:
            w.variant(EVT.PLAYER_DOWNED);
            w.u64(msg.player);
            return;
        case EVT.PLAYER_REVIVED:
            w.variant(EVT.PLAYER_REVIVED);
            w.u64(msg.player);
            w.u64(msg.by);
            return;
        case EVT.WAVE_START:
            w.variant(EVT.WAVE_START);
            w.u32(msg.wave);
            w.u32(msg.enemyCount);
            return;
        case EVT.WAVE_CLEAR:
            w.variant(EVT.WAVE_CLEAR);
            w.u32(msg.wave);
            w.u32(msg.timeMs);
            return;
        case EVT.POWERUP_OFFER:
            w.variant(EVT.POWERUP_OFFER);
            w.u64(msg.player);
            w.u8(msg.picks);
            return;
        case EVT.POWERUP_CHOSEN:
            w.variant(EVT.POWERUP_CHOSEN);
            w.u64(msg.player);
            w.u16(msg.powerup);
            return;
        case EVT.HIT_FLASH:
            w.variant(EVT.HIT_FLASH);
            writeEntityRef(w, msg.entity);
            w.f32(msg.intensity);
            return;
        case EVT.DAMAGE_NUMBER:
            w.variant(EVT.DAMAGE_NUMBER);
            w.f32(msg.x);
            w.f32(msg.y);
            w.i32(msg.value);
            w.u32(msg.kind);
            return;
        default:
            throw new TypeError('writeGameEvent: unknown variant ' + msg.type);
    }
}

export function readGameEvent(r) {
    const tag = r.variant();
    switch (tag) {
        case EVT.BULLET_SPAWN:
            return {
                type: tag,
                id: r.u64(),
                owner: r.u64(),
                weapon: r.u32(),
                x: r.f32(),
                y: r.f32(),
                vx: r.f32(),
                vy: r.f32(),
            };
        case EVT.BULLET_DESPAWN:
            return {
                type: tag,
                id: r.u64(),
                reason: r.u32(),
            };
        case EVT.ENEMY_DESTROY:
            return {
                type: tag,
                id: r.u64(),
                by: r.option((rr) => rr.u64()),
                drops: r.vec((rr) => rr.u64()),
            };
        case EVT.ASTEROID_DESTROY:
            return {
                type: tag,
                id: r.u64(),
                by: r.option((rr) => rr.u64()),
                fragments: r.vec((rr) => rr.u64()),
            };
        case EVT.ORB_COLLECT:
            return {
                type: tag,
                id: r.u64(),
                by: r.u64(),
                value: r.u32(),
            };
        case EVT.PLAYER_DAMAGED:
            return {
                type: tag,
                player: r.u64(),
                hp: r.f32(),
            };
        case EVT.PLAYER_DOWNED:
            return {
                type: tag,
                player: r.u64(),
            };
        case EVT.PLAYER_REVIVED:
            return {
                type: tag,
                player: r.u64(),
                by: r.u64(),
            };
        case EVT.WAVE_START:
            return {
                type: tag,
                wave: r.u32(),
                enemyCount: r.u32(),
            };
        case EVT.WAVE_CLEAR:
            return {
                type: tag,
                wave: r.u32(),
                timeMs: r.u32(),
            };
        case EVT.POWERUP_OFFER:
            return {
                type: tag,
                player: r.u64(),
                picks: r.u8(),
            };
        case EVT.POWERUP_CHOSEN:
            return {
                type: tag,
                player: r.u64(),
                powerup: r.u16(),
            };
        case EVT.HIT_FLASH:
            return {
                type: tag,
                entity: readEntityRef(r),
                intensity: r.f32(),
            };
        case EVT.DAMAGE_NUMBER:
            return {
                type: tag,
                x: r.f32(),
                y: r.f32(),
                value: r.i32(),
                kind: r.u32(),
            };
        default:
            throw new TypeError('readGameEvent: unknown tag ' + tag);
    }
}

export function writeClientMsg(w, msg) {
    switch (msg.type) {
        case C2S.HELLO:
            w.variant(C2S.HELLO);
            w.u16(msg.wireVersion);
            w.u16(msg.simVersion);
            w.str(msg.clientVersion);
            w.str(msg.displayName);
            w.option(msg.session, (ww, v) => ww.uuid(v));
            return;
        case C2S.QUICK_MATCH:
            w.variant(C2S.QUICK_MATCH);
            return;
        case C2S.BROWSE_ROOMS:
            w.variant(C2S.BROWSE_ROOMS);
            return;
        case C2S.CREATE_ROOM:
            w.variant(C2S.CREATE_ROOM);
            w.str(msg.name);
            w.bool(msg.public);
            w.u8(msg.maxPlayers);
            return;
        case C2S.JOIN_ROOM:
            w.variant(C2S.JOIN_ROOM);
            w.u64(msg.roomId);
            return;
        case C2S.JOIN_ROOM_BY_CODE:
            w.variant(C2S.JOIN_ROOM_BY_CODE);
            w.str(msg.code);
            return;
        case C2S.LEAVE_ROOM:
            w.variant(C2S.LEAVE_ROOM);
            return;
        case C2S.INPUT:
            w.variant(C2S.INPUT);
            w.u32(msg.tick);
            writePackedInput(w, msg.packed);
            return;
        case C2S.ACK:
            w.variant(C2S.ACK);
            w.u32(msg.snapshotTick);
            return;
        case C2S.PONG:
            w.variant(C2S.PONG);
            w.u32(msg.clientT);
            w.u32(msg.serverT);
            return;
        case C2S.POWERUP_CHOOSE:
            w.variant(C2S.POWERUP_CHOOSE);
            w.u16(msg.powerup);
            return;
        case C2S.REVIVE:
            w.variant(C2S.REVIVE);
            w.u64(msg.target);
            return;
        case C2S.CHAT:
            w.variant(C2S.CHAT);
            w.str(msg.text);
            return;
        default:
            throw new TypeError('writeClientMsg: unknown variant ' + msg.type);
    }
}

export function readClientMsg(r) {
    const tag = r.variant();
    switch (tag) {
        case C2S.HELLO:
            return {
                type: tag,
                wireVersion: r.u16(),
                simVersion: r.u16(),
                clientVersion: r.str(),
                displayName: r.str(),
                session: r.option((rr) => rr.uuid()),
            };
        case C2S.QUICK_MATCH:
            return { type: tag };
        case C2S.BROWSE_ROOMS:
            return { type: tag };
        case C2S.CREATE_ROOM:
            return {
                type: tag,
                name: r.str(),
                public: r.bool(),
                maxPlayers: r.u8(),
            };
        case C2S.JOIN_ROOM:
            return {
                type: tag,
                roomId: r.u64(),
            };
        case C2S.JOIN_ROOM_BY_CODE:
            return {
                type: tag,
                code: r.str(),
            };
        case C2S.LEAVE_ROOM:
            return { type: tag };
        case C2S.INPUT:
            return {
                type: tag,
                tick: r.u32(),
                packed: readPackedInput(r),
            };
        case C2S.ACK:
            return {
                type: tag,
                snapshotTick: r.u32(),
            };
        case C2S.PONG:
            return {
                type: tag,
                clientT: r.u32(),
                serverT: r.u32(),
            };
        case C2S.POWERUP_CHOOSE:
            return {
                type: tag,
                powerup: r.u16(),
            };
        case C2S.REVIVE:
            return {
                type: tag,
                target: r.u64(),
            };
        case C2S.CHAT:
            return {
                type: tag,
                text: r.str(),
            };
        default:
            throw new TypeError('readClientMsg: unknown tag ' + tag);
    }
}

export function writeServerMsg(w, msg) {
    switch (msg.type) {
        case S2C.WELCOME:
            w.variant(S2C.WELCOME);
            w.u64(msg.playerId);
            w.uuid(msg.session);
            w.u64(msg.serverTMs);
            return;
        case S2C.ERROR:
            w.variant(S2C.ERROR);
            w.u32(msg.code);
            w.str(msg.msg);
            return;
        case S2C.ROOM_LIST:
            w.variant(S2C.ROOM_LIST);
            w.vec(msg.rooms, writeRoomSummary);
            return;
        case S2C.ROOM_JOINED:
            w.variant(S2C.ROOM_JOINED);
            w.u64(msg.roomId);
            w.str(msg.code);
            w.u8(msg.slot);
            w.vec(msg.peers, writePeerInfo);
            w.u32(msg.wave);
            w.u64(msg.seed);
            return;
        case S2C.ROOM_LEFT:
            w.variant(S2C.ROOM_LEFT);
            w.u32(msg.reason);
            return;
        case S2C.PEER_JOINED:
            w.variant(S2C.PEER_JOINED);
            writePeerInfo(w, msg.peer);
            w.u8(msg.slot);
            return;
        case S2C.PEER_LEFT:
            w.variant(S2C.PEER_LEFT);
            w.u8(msg.slot);
            w.u32(msg.reason);
            return;
        case S2C.SNAPSHOT:
            w.variant(S2C.SNAPSHOT);
            w.u32(msg.tick);
            w.option(msg.baseTick, (ww, v) => ww.u32(v));
            writeSnapshotPayload(w, msg.payload);
            return;
        case S2C.EVENT:
            w.variant(S2C.EVENT);
            w.u32(msg.tick);
            writeGameEvent(w, msg.event);
            return;
        case S2C.PING:
            w.variant(S2C.PING);
            w.u32(msg.clientT);
            w.u32(msg.serverT);
            return;
        default:
            throw new TypeError('writeServerMsg: unknown variant ' + msg.type);
    }
}

export function readServerMsg(r) {
    const tag = r.variant();
    switch (tag) {
        case S2C.WELCOME:
            return {
                type: tag,
                playerId: r.u64(),
                session: r.uuid(),
                serverTMs: r.u64(),
            };
        case S2C.ERROR:
            return {
                type: tag,
                code: r.u32(),
                msg: r.str(),
            };
        case S2C.ROOM_LIST:
            return {
                type: tag,
                rooms: r.vec(readRoomSummary),
            };
        case S2C.ROOM_JOINED:
            return {
                type: tag,
                roomId: r.u64(),
                code: r.str(),
                slot: r.u8(),
                peers: r.vec(readPeerInfo),
                wave: r.u32(),
                seed: r.u64(),
            };
        case S2C.ROOM_LEFT:
            return {
                type: tag,
                reason: r.u32(),
            };
        case S2C.PEER_JOINED:
            return {
                type: tag,
                peer: readPeerInfo(r),
                slot: r.u8(),
            };
        case S2C.PEER_LEFT:
            return {
                type: tag,
                slot: r.u8(),
                reason: r.u32(),
            };
        case S2C.SNAPSHOT:
            return {
                type: tag,
                tick: r.u32(),
                baseTick: r.option((rr) => rr.u32()),
                payload: readSnapshotPayload(r),
            };
        case S2C.EVENT:
            return {
                type: tag,
                tick: r.u32(),
                event: readGameEvent(r),
            };
        case S2C.PING:
            return {
                type: tag,
                clientT: r.u32(),
                serverT: r.u32(),
            };
        default:
            throw new TypeError('readServerMsg: unknown tag ' + tag);
    }
}

// ─── Top-level convenience encoders/decoders ────────────────────

export function encodeClientMsg(msg) {
    const w = new Writer(256);
    writeClientMsg(w, msg);
    return w.bytes();
}

export function decodeClientMsg(buf) {
    const view = bufToView(buf);
    const r = new Reader(view);
    return readClientMsg(r);
}

export function encodeServerMsg(msg) {
    const w = new Writer(256);
    writeServerMsg(w, msg);
    return w.bytes();
}

export function decodeServerMsg(buf) {
    const view = bufToView(buf);
    const r = new Reader(view);
    return readServerMsg(r);
}

function bufToView(buf) {
    if (buf instanceof DataView) return buf;
    if (buf instanceof ArrayBuffer) return new DataView(buf);
    if (ArrayBuffer.isView(buf)) {
        return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    throw new TypeError('decodeXxx: expected ArrayBuffer or TypedArray');
}
