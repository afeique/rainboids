//! Phase-2 / Phase-3 bincode 1.x codec for rainboids-server <-> /mp client.
//!
//! Mirrors `server/sim/src/mp1/codec.rs` byte-for-byte. The Rust side
//! uses `bincode::DefaultOptions::new().with_fixint_encoding().with_little_endian()`.
//!
//! ALL scalar floats are f64 (8 bytes) to match JavaScript Number
//! precision and the WASM-side simulation. See `mp1/wire.rs` header
//! comment for the rationale (no implicit narrowing at the
//! wasm-bindgen boundary; ~10 KB/s/client wire volume in Phase 2
//! makes the doubled scalar cost invisible).
//!
//! Wire layout (bincode 1.x DefaultOptions + fixint + LE):
//!   bool                1 byte (0 or 1)
//!   u32 / i32           4 bytes LE (fixint, never varint)
//!   u64 / i64           8 bytes LE (fixint)
//!   f64                 8 bytes IEEE-754 LE
//!   String              u64 byte length + UTF-8 bytes
//!   Vec<T>              u64 element count + count * T
//!   enum (ext. tagged)  u32 variant index + variant fields concatenated
//!   struct              fields concatenated in declaration order
//!
//! Variant indices are assigned by serde from source-order in the Rust
//! enum declaration:
//!   ServerMsg: Welcome=0, Snapshot=1, PeerJoined=2, PeerLeft=3, Error=4,
//!              Event=5, StateChecksum=6, Resync=7      (Phase 3)
//!   ClientMsg: Hello=0,   Input=1,    Bye=2,           Resync=3 (Phase 3)
//!   EventPayload (Phase 3, externally-tagged):
//!     0 EnemySpawn, 1 AsteroidSpawn, 2 BulletSpawn, 3 BulletHit,
//!     4 EnemyDestroy, 5 AsteroidSplit, 6 ShipDamaged, 7 ShipDowned,
//!     8 ShipRevived
//!
//! u64 handling (Phase 2 → Phase 3 split):
//!   - Phase 2 u64 fields (Vec length prefixes only on the read path)
//!     remain plain Numbers — they are bounded by snapshot size
//!     (~hundreds of elements) and always fit comfortably in 2^53-1.
//!     The reader still validates `hi == 0` and throws on overflow.
//!   - Phase 3 introduces TRUE 64-bit-range fields: `rng_subseed`
//!     inside several `EventPayload` variants and `rng_seed` inside
//!     `ServerMsg::Resync`. These ARE expected to use the full u64
//!     range (they come straight out of the SplitMix64 stream on the
//!     server). They are decoded as BigInt via the dedicated `u64Big`
//!     reader and returned as BigInt in the decoded JS objects.
//!     Callers must NOT cast them to Number — they must be re-seeded
//!     into the WASM-side RNG verbatim.
//!   - All other u32 fields (`enemy_id`, `bullet_id`, `tick`, etc.)
//!     and all hash u64 fields use the plain `u64()` reader and stay
//!     as JS Number. Hashes use the same `hi==0` guard, which means
//!     the server-side hash function must keep hash output in the
//!     lower 53 bits. If a Phase 4+ hash needs the full u64 range,
//!     promote `ships_hash` / etc. to use `u64Big()` like the seeds.
//!
//! Field rename to avoid collision with `kind` dispatch property:
//!   `EventPayload::EnemySpawn { enemy_id, kind: u8, rng_subseed }`
//!   and `EventPayload::EnemyDestroy { ..., kind: u8 }` both carry a
//!   `kind: u8` field (enemy-kind discriminator) that collides with
//!   the JS dispatch tag `kind: 'EnemySpawn'` / `'EnemyDestroy'`.
//!   These two are renamed in the decoded JS object to `kind_u8`.
//!   All other EventPayload variants keep their Rust field names
//!   verbatim. The wire bytes are unchanged — only the JS object
//!   property name differs.
//!
//! ── Sample byte sequences for review sanity ───────────────────────
//!
//! `ClientMsg::Bye` (variant index 2, no fields) — 4 bytes:
//!     02 00 00 00
//!
//! `ClientMsg::Hello { name: "p", client_version: "0.2.1", wire_version: 2 }`:
//!     00 00 00 00                       variant tag (Hello = 0)
//!     01 00 00 00 00 00 00 00           name length = 1
//!     70                                "p"
//!     05 00 00 00 00 00 00 00           client_version length = 5
//!     30 2e 32 2e 31                    "0.2.1"
//!     02 00 00 00                       wire_version = 2
//!   Total: 4 + 8 + 1 + 8 + 5 + 4 = 30 bytes
//!
//! `ClientMsg::Input { client_tick: 99, up: true, down: false,
//!                     left: false, right: true,
//!                     aim_x: 123.5, aim_y: -45.25 }`:
//!     01 00 00 00                       variant tag (Input = 1)
//!     63 00 00 00                       client_tick = 99
//!     01                                up   = true
//!     00                                down = false
//!     00                                left = false
//!     01                                right = true
//!     00 00 00 00 00 e0 5e 40           aim_x = 123.5  (f64 LE)
//!     00 00 00 00 00 a0 46 c0           aim_y = -45.25 (f64 LE)
//!   Total: 4 + 4 + 4 + 16 = 28 bytes
//!
//! `ClientMsg::Resync { client_tick: 1000 }` — 8 bytes:
//!     03 00 00 00                       variant tag (Resync = 3)
//!     e8 03 00 00                       client_tick = 1000

const TXT_ENCODER = new TextEncoder();
const TXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const LE = true;

/** Wire format version. Bumped on any breaking schema change. Must
 *  match `WIRE_VERSION` in `server/sim/src/mp1/wire.rs`.
 *  - 1: Phase 2 (Welcome / Snapshot / PeerJoined / PeerLeft / Error /
 *       Hello / Input / Bye)
 *  - 2: Phase 3 (adds Event / StateChecksum / Resync server-side and
 *       Resync client-side; introduces EventPayload + EnemyWire /
 *       AsteroidWire / BulletWire records)
 *  - 3: Phase 3 follow-up — `Welcome.rng_seed: u64` added so the
 *       client can seed its WASM mirror identically to the server. */
export const WIRE_VERSION = 3;

/* ── Reader ─────────────────────────────────────────────────────── */

class Reader {
    /** @param {ArrayBuffer|ArrayBufferView} input */
    constructor(input) {
        if (ArrayBuffer.isView(input)) {
            this.view = new DataView(input.buffer, input.byteOffset, input.byteLength);
        } else {
            this.view = new DataView(input);
        }
        this.offset = 0;
    }

    _need(n) {
        if (this.offset + n > this.view.byteLength) {
            throw new RangeError(
                `wire-codec: short read — need ${n} bytes at offset ${this.offset}, ` +
                    `buffer length ${this.view.byteLength}`,
            );
        }
    }

    u8() {
        this._need(1);
        const v = this.view.getUint8(this.offset);
        this.offset += 1;
        return v;
    }

    u32() {
        this._need(4);
        const v = this.view.getUint32(this.offset, LE);
        this.offset += 4;
        return v;
    }

    /** bincode u64 LE; values must fit in Number (high 32 bits == 0).
     *  Used for Vec length prefixes and any u64 known to stay small. */
    u64() {
        this._need(8);
        const lo = this.view.getUint32(this.offset, LE);
        const hi = this.view.getUint32(this.offset + 4, LE);
        this.offset += 8;
        if (hi !== 0) {
            throw new RangeError(
                `wire-codec: u64 high bits set (hi=0x${hi.toString(16)}); ` +
                    `use u64Big() for fields that may exceed 2^32`,
            );
        }
        return lo;
    }

    /** bincode u64 LE, returned as BigInt. Use for fields that may
     *  exceed 2^53 (Phase 3: `rng_subseed`, `rng_seed`). */
    u64Big() {
        this._need(8);
        const lo = BigInt(this.view.getUint32(this.offset, LE));
        const hi = BigInt(this.view.getUint32(this.offset + 4, LE));
        this.offset += 8;
        return (hi << 32n) | lo;
    }

    f64() {
        this._need(8);
        const v = this.view.getFloat64(this.offset, LE);
        this.offset += 8;
        return v;
    }

    bool() {
        const b = this.u8();
        if (b !== 0 && b !== 1) {
            throw new TypeError(`wire-codec: invalid bool byte 0x${b.toString(16)}`);
        }
        return b === 1;
    }

    str() {
        const len = this.u64();
        this._need(len);
        const slice = new Uint8Array(
            this.view.buffer,
            this.view.byteOffset + this.offset,
            len,
        );
        const s = TXT_DECODER.decode(slice);
        this.offset += len;
        return s;
    }

    eof() {
        return this.offset >= this.view.byteLength;
    }
}

/* ── Writer ─────────────────────────────────────────────────────── */

class Writer {
    constructor(initialCapacity = 256) {
        this.buf = new ArrayBuffer(initialCapacity);
        this.view = new DataView(this.buf);
        this.bytes = new Uint8Array(this.buf);
        this.offset = 0;
    }

    _ensure(n) {
        if (this.offset + n <= this.buf.byteLength) return;
        let cap = this.buf.byteLength;
        while (cap < this.offset + n) cap *= 2;
        const next = new ArrayBuffer(cap);
        new Uint8Array(next).set(this.bytes.subarray(0, this.offset));
        this.buf = next;
        this.view = new DataView(this.buf);
        this.bytes = new Uint8Array(this.buf);
    }

    u8(v) {
        this._ensure(1);
        this.view.setUint8(this.offset, v & 0xff);
        this.offset += 1;
    }

    u32(v) {
        this._ensure(4);
        this.view.setUint32(this.offset, v >>> 0, LE);
        this.offset += 4;
    }

    /** Encode JS Number as u64 LE. Caller must ensure 0 <= v < 2^53. */
    u64(v) {
        this._ensure(8);
        if (v < 0 || !Number.isFinite(v)) {
            throw new RangeError(`wire-codec: u64 requires non-negative finite, got ${v}`);
        }
        if (v > Number.MAX_SAFE_INTEGER) {
            throw new RangeError(`wire-codec: u64 value ${v} exceeds Number.MAX_SAFE_INTEGER`);
        }
        this.view.setUint32(this.offset, v >>> 0, LE);
        this.view.setUint32(this.offset + 4, Math.floor(v / 4294967296), LE);
        this.offset += 8;
    }

    f64(v) {
        this._ensure(8);
        this.view.setFloat64(this.offset, +v, LE);
        this.offset += 8;
    }

    bool(v) {
        this.u8(v ? 1 : 0);
    }

    str(s) {
        const enc = TXT_ENCODER.encode(s);
        this.u64(enc.byteLength);
        this._ensure(enc.byteLength);
        this.bytes.set(enc, this.offset);
        this.offset += enc.byteLength;
    }

    /** Final ArrayBuffer copy of the written prefix. */
    finish() {
        return this.bytes.slice(0, this.offset).buffer;
    }
}

/* ── ServerMsg decode ───────────────────────────────────────────── */

function readSnapshotShip(r) {
    return {
        player_id: r.u32(),
        x: r.f64(),
        y: r.f64(),
        vx: r.f64(),
        vy: r.f64(),
        angle: r.f64(),
    };
}

/** Read one `EnemyWire` record (Phase 3 Resync payload). */
function readEnemyWire(r) {
    return {
        id: r.u32(),
        kind: r.u8(),
        x: r.f64(),
        y: r.f64(),
        vx: r.f64(),
        vy: r.f64(),
        angle: r.f64(),
        hp: r.f64(),
        max_hp: r.f64(),
        radius: r.f64(),
        arc_dir: r.f64(),
        arc_radius: r.f64(),
        arc_omega: r.f64(),
        arc_phase: r.f64(),
    };
}

/** Read one `AsteroidWire` record (Phase 3 Resync payload). */
function readAsteroidWire(r) {
    return {
        id: r.u32(),
        x: r.f64(),
        y: r.f64(),
        vx: r.f64(),
        vy: r.f64(),
        rot: r.f64(),
        rot_vel: r.f64(),
        radius: r.f64(),
        base_radius: r.f64(),
        hp: r.f64(),
        max_hp: r.f64(),
    };
}

/** Read one `BulletWire` record (Phase 3 Resync payload). */
function readBulletWire(r) {
    return {
        id: r.u32(),
        owner_player_id: r.u32(),
        origin_x: r.f64(),
        origin_y: r.f64(),
        vx: r.f64(),
        vy: r.f64(),
        spawn_tick: r.u32(),
        life_remaining: r.u32(),
    };
}

/** Read one `EventPayload` (externally-tagged: u32 variant index + fields).
 *  Returns a JS object tagged with `kind: '<VariantName>'`. The
 *  `EnemySpawn` and `EnemyDestroy` variants rename their `kind: u8`
 *  field to `kind_u8` to avoid colliding with the JS dispatch tag. */
function readEventPayload(r) {
    const tag = r.u32();
    switch (tag) {
        case 0: { // EnemySpawn { enemy_id, kind: u8, rng_subseed: u64 }
            return {
                kind: 'EnemySpawn',
                enemy_id: r.u32(),
                kind_u8: r.u8(),
                rng_subseed: r.u64Big(),
            };
        }
        case 1: { // AsteroidSpawn { asteroid_id, rng_subseed: u64 }
            return {
                kind: 'AsteroidSpawn',
                asteroid_id: r.u32(),
                rng_subseed: r.u64Big(),
            };
        }
        case 2: { // BulletSpawn { bullet_id, owner_player_id, origin_x, origin_y, vx, vy, spawn_tick, weapon }
            return {
                kind: 'BulletSpawn',
                bullet_id: r.u32(),
                owner_player_id: r.u32(),
                origin_x: r.f64(),
                origin_y: r.f64(),
                vx: r.f64(),
                vy: r.f64(),
                spawn_tick: r.u32(),
                weapon: r.u8(),
            };
        }
        case 3: { // BulletHit { bullet_id, target_kind, target_id, hit_tick, hit_x, hit_y }
            return {
                kind: 'BulletHit',
                bullet_id: r.u32(),
                target_kind: r.u8(),
                target_id: r.u32(),
                hit_tick: r.u32(),
                hit_x: r.f64(),
                hit_y: r.f64(),
            };
        }
        case 4: { // EnemyDestroy { enemy_id, by_bullet_id, kill_tick, x, y, kind: u8 }
            return {
                kind: 'EnemyDestroy',
                enemy_id: r.u32(),
                by_bullet_id: r.u32(),
                kill_tick: r.u32(),
                x: r.f64(),
                y: r.f64(),
                kind_u8: r.u8(),
            };
        }
        case 5: { // AsteroidSplit { parent_id, kill_tick, x, y, rng_subseed: u64, child_id_start }
            return {
                kind: 'AsteroidSplit',
                parent_id: r.u32(),
                kill_tick: r.u32(),
                x: r.f64(),
                y: r.f64(),
                rng_subseed: r.u64Big(),
                child_id_start: r.u32(),
            };
        }
        case 6: { // ShipDamaged { player_id, by_kind, by_id, hit_tick, amount, x, y }
            return {
                kind: 'ShipDamaged',
                player_id: r.u32(),
                by_kind: r.u8(),
                by_id: r.u32(),
                hit_tick: r.u32(),
                amount: r.f64(),
                x: r.f64(),
                y: r.f64(),
            };
        }
        case 7: { // ShipDowned { player_id, at_tick, x, y }
            return {
                kind: 'ShipDowned',
                player_id: r.u32(),
                at_tick: r.u32(),
                x: r.f64(),
                y: r.f64(),
            };
        }
        case 8: { // ShipRevived { revived_player_id, by_player_id, at_tick }
            return {
                kind: 'ShipRevived',
                revived_player_id: r.u32(),
                by_player_id: r.u32(),
                at_tick: r.u32(),
            };
        }
        default:
            throw new RangeError(`wire-codec: unknown EventPayload variant ${tag}`);
    }
}

/**
 * Decode a binary frame from the server.
 * @param {ArrayBuffer|ArrayBufferView} input
 * @returns {object} A tagged JS object with `kind` set to the variant name.
 */
export function decodeServerMsg(input) {
    const r = new Reader(input);
    const tag = r.u32();
    switch (tag) {
        case 0: { // Welcome
            return {
                kind: 'Welcome',
                player_id: r.u32(),
                server_tick: r.u32(),
                spawn_x: r.f64(),
                spawn_y: r.f64(),
                rng_seed: r.u64Big(),  // WIRE_VERSION 3 addition
            };
        }
        case 1: { // Snapshot
            const tick = r.u32();
            const acked_input_tick = r.u32();
            const count = r.u64();
            const ships = new Array(count);
            for (let i = 0; i < count; i++) ships[i] = readSnapshotShip(r);
            return { kind: 'Snapshot', tick, acked_input_tick, ships };
        }
        case 2: { // PeerJoined
            return { kind: 'PeerJoined', player_id: r.u32() };
        }
        case 3: { // PeerLeft
            return { kind: 'PeerLeft', player_id: r.u32() };
        }
        case 4: { // Error
            return { kind: 'Error', code: r.str(), message: r.str() };
        }
        case 5: { // Event { tick: u32, payloads: Vec<EventPayload> }
            const tick = r.u32();
            const count = r.u64();
            const payloads = new Array(count);
            for (let i = 0; i < count; i++) payloads[i] = readEventPayload(r);
            return { kind: 'Event', tick, payloads };
        }
        case 6: { // StateChecksum { tick, ships_hash, enemies_hash, asteroids_hash, bullets_hash }
            return {
                kind: 'StateChecksum',
                tick: r.u32(),
                ships_hash: r.u64(),
                enemies_hash: r.u64(),
                asteroids_hash: r.u64(),
                bullets_hash: r.u64(),
            };
        }
        case 7: { // Resync { tick, rng_seed: u64, ships, enemies, asteroids, bullets }
            const tick = r.u32();
            const rng_seed = r.u64Big();
            const shipsCount = r.u64();
            const ships = new Array(shipsCount);
            for (let i = 0; i < shipsCount; i++) ships[i] = readSnapshotShip(r);
            const enemiesCount = r.u64();
            const enemies = new Array(enemiesCount);
            for (let i = 0; i < enemiesCount; i++) enemies[i] = readEnemyWire(r);
            const asteroidsCount = r.u64();
            const asteroids = new Array(asteroidsCount);
            for (let i = 0; i < asteroidsCount; i++) asteroids[i] = readAsteroidWire(r);
            const bulletsCount = r.u64();
            const bullets = new Array(bulletsCount);
            for (let i = 0; i < bulletsCount; i++) bullets[i] = readBulletWire(r);
            return { kind: 'Resync', tick, rng_seed, ships, enemies, asteroids, bullets };
        }
        default:
            throw new RangeError(`wire-codec: unknown ServerMsg variant ${tag}`);
    }
}

/**
 * Peek the first u32 (variant index) without consuming additional bytes.
 * Useful for handshake / debug logging before full decode.
 * @param {ArrayBuffer|ArrayBufferView} input
 * @returns {number}
 */
export function decodeWireVersion(input) {
    const r = new Reader(input);
    return r.u32();
}

/* ── ClientMsg encode ───────────────────────────────────────────── */

/**
 * Encode an in-memory ClientMsg-shaped object into a binary frame.
 * The object must carry a `kind` field set to one of:
 *   'Hello' | 'Input' | 'Bye' | 'Resync'
 *
 * Most callers should prefer the typed helpers (`encodeHello`,
 * `encodeInput`, `encodeBye`, `encodeResync`) which avoid the `kind`
 * indirection.
 *
 * @param {object} msg
 * @returns {ArrayBuffer}
 */
export function encodeClientMsg(msg) {
    switch (msg.kind) {
        case 'Hello':
            return encodeHello(msg.name, msg.client_version, msg.wire_version);
        case 'Input':
            return encodeInput(
                msg.client_tick,
                msg.up,
                msg.down,
                msg.left,
                msg.right,
                msg.aim_x,
                msg.aim_y,
            );
        case 'Bye':
            return encodeBye();
        case 'Resync':
            return encodeResync(msg.client_tick);
        default:
            throw new TypeError(`wire-codec: unknown ClientMsg kind "${msg.kind}"`);
    }
}

/**
 * Encode `ClientMsg::Hello { name, client_version, wire_version }`.
 * @param {string} name
 * @param {string} clientVersion
 * @param {number} wireVersion
 * @returns {ArrayBuffer}
 */
export function encodeHello(name, clientVersion, wireVersion) {
    const w = new Writer();
    w.u32(0); // variant tag: Hello
    w.str(name);
    w.str(clientVersion);
    w.u32(wireVersion);
    return w.finish();
}

/**
 * Encode `ClientMsg::Input { client_tick, up, down, left, right, aim_x, aim_y }`.
 * @param {number} clientTick
 * @param {boolean} up
 * @param {boolean} down
 * @param {boolean} left
 * @param {boolean} right
 * @param {number} aimX
 * @param {number} aimY
 * @returns {ArrayBuffer}
 */
export function encodeInput(clientTick, up, down, left, right, aimX, aimY) {
    const w = new Writer(28);
    w.u32(1); // variant tag: Input
    w.u32(clientTick);
    w.bool(up);
    w.bool(down);
    w.bool(left);
    w.bool(right);
    w.f64(aimX);
    w.f64(aimY);
    return w.finish();
}

/**
 * Encode `ClientMsg::Bye` (no fields). Always 4 bytes: `02 00 00 00`.
 * @returns {ArrayBuffer}
 */
export function encodeBye() {
    const w = new Writer(4);
    w.u32(2); // variant tag: Bye
    return w.finish();
}

/**
 * Encode `ClientMsg::Resync { client_tick }` (Phase 3). Always 8 bytes:
 *     03 00 00 00                       variant tag (Resync = 3)
 *     <client_tick u32 LE>              4 bytes
 * @param {number} clientTick
 * @returns {ArrayBuffer}
 */
export function encodeResync(clientTick) {
    const w = new Writer(8);
    w.u32(3); // variant tag: Resync
    w.u32(clientTick);
    return w.finish();
}
