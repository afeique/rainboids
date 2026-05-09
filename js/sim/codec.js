// Bincode 1.x default-with-fixint-LE codec primitives.
//
// Mirror of:
//   bincode::DefaultOptions::new()
//       .with_fixint_encoding()
//       .with_little_endian()
//
// Wire layout (every shape that appears in `schema/protocol.toml`):
//
//   u8    1 byte
//   u16   2 bytes LE
//   u32   4 bytes LE
//   u64   8 bytes LE             (BigInt; >Number.MAX_SAFE_INTEGER values
//                                 must round-trip without precision loss)
//   i8/i16/i32  signed counterparts (two's complement, LE)
//   f32   4 bytes IEEE-754 LE
//   f64   8 bytes IEEE-754 LE
//   bool  1 byte (0=false, 1=true)
//
//   Option<T>   1-byte tag (0=None, 1=Some) + payload if Some
//   enum        u32 variant tag (4 bytes LE) + payload
//   Vec<T>      u64 length prefix (8 bytes LE) + elements
//   String      u64 length prefix (8 bytes LE) + UTF-8 bytes
//   tuple/struct  fields encoded in declaration order, no separators
//   [u8; N]     N raw bytes (tuple, no length prefix)
//   Uuid        u64 length prefix (= 16) + 16 canonical bytes (24 bytes total).
//              The uuid 1.x serde impl calls `serialize_bytes(&self.as_bytes())`
//              in non-human-readable mode, so bincode emits a u64 length even
//              though the byte count is fixed. Empirically verified against
//              `uuid 1.23.x` on 2026-05-09.
//
// `Reader` operates over an existing DataView; `Writer` grows its
// internal buffer as needed and exposes `.bytes()` to retrieve the
// final Uint8Array.

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8', { fatal: true });

/* ─── Reader ──────────────────────────────────────────────────────────────── */

export class Reader {
    /** @param {DataView} view @param {number} [off] */
    constructor(view, off = 0) {
        this.view = view;
        this.bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
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

    u8() {
        this._need(1);
        const v = this.view.getUint8(this.off);
        this.off += 1;
        return v;
    }
    u16() {
        this._need(2);
        const v = this.view.getUint16(this.off, true);
        this.off += 2;
        return v;
    }
    u32() {
        this._need(4);
        const v = this.view.getUint32(this.off, true);
        this.off += 4;
        return v;
    }
    /** @returns {bigint} */
    u64() {
        this._need(8);
        const v = this.view.getBigUint64(this.off, true);
        this.off += 8;
        return v;
    }
    i8() {
        this._need(1);
        const v = this.view.getInt8(this.off);
        this.off += 1;
        return v;
    }
    i16() {
        this._need(2);
        const v = this.view.getInt16(this.off, true);
        this.off += 2;
        return v;
    }
    i32() {
        this._need(4);
        const v = this.view.getInt32(this.off, true);
        this.off += 4;
        return v;
    }
    /** @returns {bigint} */
    i64() {
        this._need(8);
        const v = this.view.getBigInt64(this.off, true);
        this.off += 8;
        return v;
    }
    f32() {
        this._need(4);
        const v = this.view.getFloat32(this.off, true);
        this.off += 4;
        return v;
    }
    f64() {
        this._need(8);
        const v = this.view.getFloat64(this.off, true);
        this.off += 8;
        return v;
    }
    bool() {
        const b = this.u8();
        if (b !== 0 && b !== 1) throw new TypeError(`codec: invalid bool byte 0x${b.toString(16)}`);
        return b === 1;
    }

    /** Variant tag: u32. */
    variant() {
        return this.u32();
    }

    /**
     * Option<T>: 1-byte tag, then `inner(reader)` if Some.
     * @param {(r: Reader) => any} inner
     * @returns {any}
     */
    option(inner) {
        const tag = this.u8();
        if (tag === 0) return null;
        if (tag === 1) return inner(this);
        throw new TypeError(`codec: invalid Option tag 0x${tag.toString(16)}`);
    }

    /**
     * Vec<T>: u64 length prefix + elements.
     * @param {(r: Reader) => any} inner
     */
    vec(inner) {
        const len = Number(this.u64());
        if (len > 0xffffffff) throw new RangeError('codec: vec length > u32');
        const out = new Array(len);
        for (let i = 0; i < len; i++) out[i] = inner(this);
        return out;
    }

    /** String: u64 length prefix + UTF-8 bytes. */
    str() {
        const len = Number(this.u64());
        this._need(len);
        const slice = new Uint8Array(this.view.buffer, this.view.byteOffset + this.off, len);
        const s = DEC.decode(slice);
        this.off += len;
        return s;
    }

    /** Read N raw bytes (fixed-size byte array, no prefix). */
    fixedBytes(n) {
        this._need(n);
        const slice = new Uint8Array(n);
        slice.set(new Uint8Array(this.view.buffer, this.view.byteOffset + this.off, n));
        this.off += n;
        return slice;
    }

    /**
     * UUID: u64 length prefix (must equal 16) + 16 raw bytes (canonical
     * "8-4-4-4-12" byte order; NOT little-endian-swapped).
     *
     * The uuid 1.x serde impl calls `serialize_bytes(&self.as_bytes())`
     * in non-human-readable mode; bincode wraps that with a u64 length.
     * Total wire footprint per UUID is therefore 24 bytes.
     */
    uuid() {
        const len = Number(this.u64());
        if (len !== 16) throw new RangeError(`codec: uuid expected len=16, got ${len}`);
        return this.fixedBytes(16);
    }

    eof() {
        return this.off >= this.view.byteLength;
    }
}

/* ─── Writer ──────────────────────────────────────────────────────────────── */

export class Writer {
    constructor(initialCapacity = 1024) {
        this.buf = new ArrayBuffer(initialCapacity);
        this.view = new DataView(this.buf);
        this.bytes_ = new Uint8Array(this.buf);
        this.off = 0;
    }

    _ensure(n) {
        if (this.off + n <= this.buf.byteLength) return;
        let cap = this.buf.byteLength;
        while (cap < this.off + n) cap *= 2;
        const next = new ArrayBuffer(cap);
        new Uint8Array(next).set(this.bytes_.subarray(0, this.off));
        this.buf = next;
        this.view = new DataView(this.buf);
        this.bytes_ = new Uint8Array(this.buf);
    }

    u8(v) {
        this._ensure(1);
        this.view.setUint8(this.off, v & 0xff);
        this.off += 1;
    }
    u16(v) {
        this._ensure(2);
        this.view.setUint16(this.off, v & 0xffff, true);
        this.off += 2;
    }
    u32(v) {
        this._ensure(4);
        this.view.setUint32(this.off, v >>> 0, true);
        this.off += 4;
    }
    /** @param {bigint|number} v */
    u64(v) {
        this._ensure(8);
        const big = typeof v === 'bigint' ? v : BigInt(v);
        this.view.setBigUint64(this.off, BigInt.asUintN(64, big), true);
        this.off += 8;
    }
    i8(v) {
        this._ensure(1);
        this.view.setInt8(this.off, v | 0);
        this.off += 1;
    }
    i16(v) {
        this._ensure(2);
        this.view.setInt16(this.off, v | 0, true);
        this.off += 2;
    }
    i32(v) {
        this._ensure(4);
        this.view.setInt32(this.off, v | 0, true);
        this.off += 4;
    }
    i64(v) {
        this._ensure(8);
        const big = typeof v === 'bigint' ? v : BigInt(v);
        this.view.setBigInt64(this.off, BigInt.asIntN(64, big), true);
        this.off += 8;
    }
    f32(v) {
        this._ensure(4);
        this.view.setFloat32(this.off, +v, true);
        this.off += 4;
    }
    f64(v) {
        this._ensure(8);
        this.view.setFloat64(this.off, +v, true);
        this.off += 8;
    }
    bool(v) {
        this.u8(v ? 1 : 0);
    }

    /** Variant tag (u32). */
    variant(tag) {
        this.u32(tag);
    }

    /**
     * Option<T>. Pass `null`/`undefined` for None.
     * @param {*} v
     * @param {(w: Writer, x: any) => void} inner
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
     * @param {Array<any>} arr
     * @param {(w: Writer, x: any) => void} inner
     */
    vec(arr, inner) {
        this.u64(BigInt(arr.length));
        for (const x of arr) inner(this, x);
    }

    /** String: u64 length prefix + UTF-8 bytes. */
    str(s) {
        const enc = ENC.encode(s);
        this.u64(BigInt(enc.byteLength));
        this._ensure(enc.byteLength);
        this.bytes_.set(enc, this.off);
        this.off += enc.byteLength;
    }

    /** Write N raw bytes. */
    fixedBytes(arr) {
        this._ensure(arr.byteLength);
        this.bytes_.set(arr, this.off);
        this.off += arr.byteLength;
    }

    /**
     * UUID: u64 length prefix (= 16) + 16 raw canonical bytes.
     * Accepts a 16-byte Uint8Array. Total wire footprint: 24 bytes.
     */
    uuid(arr) {
        if (!arr || arr.byteLength !== 16) {
            throw new RangeError('codec: uuid must be 16 bytes');
        }
        this.u64(16n);
        this.fixedBytes(arr);
    }

    /** Final byte view (only the written prefix). */
    bytes() {
        return this.bytes_.subarray(0, this.off);
    }

    /** Final ArrayBuffer copy of the written prefix. */
    arrayBuffer() {
        return this.bytes().slice().buffer;
    }
}
