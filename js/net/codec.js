// js/net/codec.js — bincode 1.x default-fixint-LE codec primitives.
//
// Mirrors the Rust server's encoder configured as
//
//     bincode::DefaultOptions::new()
//         .with_fixint_encoding()
//         .with_little_endian()
//
// and is the v1 bridge for the multiplayer Hello/Welcome handshake. The
// authoritative byte-level reference is `docs/Multiplayer Wire Format –
// 2026-05-09.md`; the discriminant tables in `js/net/protocol.js` and
// the Rust enums in `server/src/protocol/mod.rs` must agree with it.
//
// Wire layout summary (only what this module needs):
//
//   bool       1 byte (0 = false, 1 = true)
//   u8 / i8    1 byte
//   u16 / i16  2 bytes LE
//   u32 / i32  4 bytes LE
//   u64        8 bytes LE                              (read as bigint)
//   f32        4 bytes IEEE-754 LE
//   f64        8 bytes IEEE-754 LE
//   String     u64 length prefix (8 bytes LE) + UTF-8
//   Vec<T>     u64 length prefix (8 bytes LE) + items
//   Option<T>  1-byte tag (0 = None, 1 = Some) + payload if Some
//   enum       u32 LE variant tag (0-indexed by declaration order)
//   Uuid       u64 length (= 16) + 16 canonical bytes  (24 bytes total)
//
// `Reader` operates over an existing DataView; `Writer` grows its
// internal buffer as needed and exposes `.bytes()` to retrieve the
// final Uint8Array.
//
// This module is intentionally pure JS (no Buffer, no Node-only APIs)
// so it runs in the browser as well as the Jest unit-test harness.

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8', { fatal: true });

// ─── Reader ───────────────────────────────────────────────────────────────────

export class Reader {
    /** @param {DataView} view @param {number} [off] */
    constructor(view, off = 0) {
        this.view = view;
        this.off = off | 0;
    }

    _need(n) {
        if (this.off + n > this.view.byteLength) {
            throw new RangeError(
                `codec: short read — need ${n} bytes at offset ${this.off}, ` +
                    `buffer length ${this.view.byteLength}`,
            );
        }
    }

    u8() { this._need(1); const v = this.view.getUint8(this.off);            this.off += 1; return v; }
    u16() { this._need(2); const v = this.view.getUint16(this.off, true);    this.off += 2; return v; }
    u32() { this._need(4); const v = this.view.getUint32(this.off, true);    this.off += 4; return v; }
    /** @returns {bigint} */
    u64() { this._need(8); const v = this.view.getBigUint64(this.off, true); this.off += 8; return v; }

    i8()  { this._need(1); const v = this.view.getInt8(this.off);            this.off += 1; return v; }
    i16() { this._need(2); const v = this.view.getInt16(this.off, true);     this.off += 2; return v; }
    i32() { this._need(4); const v = this.view.getInt32(this.off, true);     this.off += 4; return v; }
    /** @returns {bigint} */
    i64() { this._need(8); const v = this.view.getBigInt64(this.off, true);  this.off += 8; return v; }

    f32() { this._need(4); const v = this.view.getFloat32(this.off, true);   this.off += 4; return v; }
    f64() { this._need(8); const v = this.view.getFloat64(this.off, true);   this.off += 8; return v; }

    bool() {
        const b = this.u8();
        if (b !== 0 && b !== 1) throw new TypeError(`codec: invalid bool byte 0x${b.toString(16)}`);
        return b === 1;
    }

    /** Variant tag = u32 LE. */
    variant() { return this.u32(); }

    /**
     * Length prefix decoded as Number. Bincode emits u64 LE; for our payload
     * sizes (always < 2^32) the cast is loss-free. Throws if the value won't
     * fit in a safe Number.
     */
    lenAsNumber() {
        const len = this.u64();
        if (len > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new RangeError(`codec: length ${len} exceeds Number.MAX_SAFE_INTEGER`);
        }
        return Number(len);
    }

    /**
     * Option<T>: 1-byte tag, then `inner(reader)` if Some.
     * @template T
     * @param {(r: Reader) => T} inner
     * @returns {T | null}
     */
    option(inner) {
        const tag = this.u8();
        if (tag === 0) return null;
        if (tag === 1) return inner(this);
        throw new TypeError(`codec: invalid Option tag 0x${tag.toString(16)}`);
    }

    /**
     * Vec<T>: u64 length prefix + elements.
     * @template T
     * @param {(r: Reader) => T} inner
     * @returns {T[]}
     */
    vec(inner) {
        const len = this.lenAsNumber();
        const out = new Array(len);
        for (let i = 0; i < len; i++) out[i] = inner(this);
        return out;
    }

    /** String: u64 length prefix + UTF-8 bytes. Returns a JS string. */
    str() {
        const len = this.lenAsNumber();
        this._need(len);
        const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.off, len);
        const s = DEC.decode(slice);
        this.off += len;
        return s;
    }

    /** Read N raw bytes (no length prefix) as a fresh Uint8Array. */
    fixedBytes(n) {
        this._need(n);
        const out = new Uint8Array(n);
        out.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.off, n));
        this.off += n;
        return out;
    }

    /**
     * Bincode-serialized `Uuid`: u64 length (must equal 16) + 16 canonical
     * bytes. The bytes are NOT little-endian-swapped — they're the canonical
     * `8-4-4-4-12` ordering, byte 0 is the most-significant byte of the
     * underlying u128. Returns the canonical string form.
     */
    uuid() {
        const len = this.lenAsNumber();
        if (len !== 16) throw new RangeError(`codec: expected 16-byte uuid, got ${len}`);
        const bytes = this.fixedBytes(16);
        return uuidBytesToString(bytes);
    }

    eof() { return this.off >= this.view.byteLength; }
}

// ─── Writer ───────────────────────────────────────────────────────────────────

export class Writer {
    constructor(initialCapacity = 256) {
        this.buf = new ArrayBuffer(initialCapacity);
        this.view = new DataView(this.buf);
        this.bytes_ = new Uint8Array(this.buf);
        this.off = 0;
    }

    _ensure(n) {
        if (this.off + n <= this.buf.byteLength) return;
        let cap = this.buf.byteLength || 256;
        while (cap < this.off + n) cap *= 2;
        const next = new ArrayBuffer(cap);
        new Uint8Array(next).set(this.bytes_.subarray(0, this.off));
        this.buf = next;
        this.view = new DataView(this.buf);
        this.bytes_ = new Uint8Array(this.buf);
    }

    u8(v)  { this._ensure(1); this.view.setUint8(this.off, v & 0xff);            this.off += 1; }
    u16(v) { this._ensure(2); this.view.setUint16(this.off, v & 0xffff, true);   this.off += 2; }
    u32(v) { this._ensure(4); this.view.setUint32(this.off, v >>> 0, true);      this.off += 4; }
    /** @param {bigint|number} v */
    u64(v) {
        this._ensure(8);
        const big = typeof v === 'bigint' ? v : BigInt(v);
        this.view.setBigUint64(this.off, BigInt.asUintN(64, big), true);
        this.off += 8;
    }

    i8(v)  { this._ensure(1); this.view.setInt8(this.off, v | 0);                this.off += 1; }
    i16(v) { this._ensure(2); this.view.setInt16(this.off, v | 0, true);         this.off += 2; }
    i32(v) { this._ensure(4); this.view.setInt32(this.off, v | 0, true);         this.off += 4; }
    /** @param {bigint|number} v */
    i64(v) {
        this._ensure(8);
        const big = typeof v === 'bigint' ? v : BigInt(v);
        this.view.setBigInt64(this.off, BigInt.asIntN(64, big), true);
        this.off += 8;
    }

    f32(v) { this._ensure(4); this.view.setFloat32(this.off, +v, true);          this.off += 4; }
    f64(v) { this._ensure(8); this.view.setFloat64(this.off, +v, true);          this.off += 8; }
    bool(v) { this.u8(v ? 1 : 0); }

    /** Variant tag = u32 LE. */
    variant(tag) { this.u32(tag); }

    /**
     * Option<T>. Pass `null`/`undefined` for None; otherwise `inner(w, v)` is
     * called to write the payload after a 1-byte Some tag.
     * @template T
     * @param {T | null | undefined} v
     * @param {(w: Writer, x: T) => void} inner
     */
    option(v, inner) {
        if (v === null || v === undefined) {
            this.u8(0);
        } else {
            this.u8(1);
            inner(this, v);
        }
    }

    /**
     * Vec<T>: u64 length prefix + elements.
     * @template T
     * @param {ArrayLike<T>} arr
     * @param {(w: Writer, x: T) => void} inner
     */
    vec(arr, inner) {
        this.u64(BigInt(arr.length));
        for (let i = 0; i < arr.length; i++) inner(this, arr[i]);
    }

    /** String: u64 length prefix + UTF-8 bytes. */
    str(s) {
        const enc = ENC.encode(String(s));
        this.u64(BigInt(enc.byteLength));
        this._ensure(enc.byteLength);
        this.bytes_.set(enc, this.off);
        this.off += enc.byteLength;
    }

    /** Write N raw bytes (no prefix). */
    fixedBytes(arr) {
        this._ensure(arr.byteLength);
        this.bytes_.set(arr, this.off);
        this.off += arr.byteLength;
    }

    /**
     * Bincode-serialized `Uuid`: u64 length (= 16) + 16 canonical bytes.
     * Accepts canonical-string form ("xxxxxxxx-xxxx-...") or a 16-byte
     * Uint8Array.
     */
    uuid(value) {
        const bytes = typeof value === 'string' ? uuidStringToBytes(value) : value;
        if (!bytes || bytes.byteLength !== 16) {
            throw new TypeError('codec: uuid must be 16 bytes (or canonical string)');
        }
        this.u64(16n);
        this.fixedBytes(bytes);
    }

    /** Final byte view (only the written prefix). */
    bytes() { return this.bytes_.subarray(0, this.off); }

    /** Final ArrayBuffer copy of the written prefix. */
    arrayBuffer() { return this.bytes().slice().buffer; }
}

// ─── UUID helpers ─────────────────────────────────────────────────────────────

const HEX = '0123456789abcdef';

/** Canonical "8-4-4-4-12" hex string from 16 raw bytes. */
export function uuidBytesToString(bytes) {
    if (!bytes || bytes.byteLength !== 16) {
        throw new TypeError('uuid: expected 16 bytes');
    }
    let out = '';
    for (let i = 0; i < 16; i++) {
        if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
        const b = bytes[i];
        out += HEX[(b >>> 4) & 0xf];
        out += HEX[b & 0xf];
    }
    return out;
}

/** Parse a canonical "8-4-4-4-12" hex UUID string into a 16-byte Uint8Array. */
export function uuidStringToBytes(str) {
    if (typeof str !== 'string') {
        throw new TypeError('uuid: expected canonical string');
    }
    const hex = str.replace(/-/g, '');
    if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
        throw new TypeError(`uuid: invalid canonical string ${JSON.stringify(str)}`);
    }
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

// ─── ArrayBuffer / TypedArray normalization ──────────────────────────────────

/** Accept ArrayBuffer / TypedArray / DataView and produce a DataView. */
export function bufToView(buf) {
    if (buf instanceof DataView) return buf;
    if (buf instanceof ArrayBuffer) return new DataView(buf);
    if (ArrayBuffer.isView(buf)) {
        return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    throw new TypeError('codec: expected ArrayBuffer, TypedArray, or DataView');
}
