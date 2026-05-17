// Bincode codec tests — primitives + composite round-trips.

import { describe, test, expect } from '@jest/globals';
import { Reader, Writer } from '../../../js/sim/codec.js';

function roundTrip(write, read) {
    const w = new Writer(64);
    write(w);
    const buf = w.bytes().slice();
    const r = new Reader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength));
    return read(r);
}

describe('primitive round-trips', () => {
    test('u8/u16/u32', () => {
        expect(roundTrip((w) => w.u8(0xab), (r) => r.u8())).toBe(0xab);
        expect(roundTrip((w) => w.u16(0xabcd), (r) => r.u16())).toBe(0xabcd);
        expect(roundTrip((w) => w.u32(0xdeadbeef), (r) => r.u32())).toBe(
            0xdeadbeef,
        );
    });
    test('u64 (BigInt)', () => {
        const v = 0x0123456789abcdefn;
        expect(roundTrip((w) => w.u64(v), (r) => r.u64())).toBe(v);
    });
    test('i8/i16/i32', () => {
        expect(roundTrip((w) => w.i8(-1), (r) => r.i8())).toBe(-1);
        expect(roundTrip((w) => w.i16(-12345), (r) => r.i16())).toBe(-12345);
        expect(roundTrip((w) => w.i32(-1234567890), (r) => r.i32())).toBe(
            -1234567890,
        );
    });
    test('f32/f64', () => {
        const f32 = roundTrip((w) => w.f32(1.5), (r) => r.f32());
        expect(f32).toBe(1.5);
        const f64 = roundTrip((w) => w.f64(Math.PI), (r) => r.f64());
        expect(f64).toBe(Math.PI);
    });
    test('bool', () => {
        expect(roundTrip((w) => w.bool(true), (r) => r.bool())).toBe(true);
        expect(roundTrip((w) => w.bool(false), (r) => r.bool())).toBe(false);
    });
    test('option present + absent', () => {
        const some = roundTrip(
            (w) => w.option(42, (ww, v) => ww.u32(v)),
            (r) => r.option((rr) => rr.u32()),
        );
        expect(some).toBe(42);
        const none = roundTrip(
            (w) => w.option(null, (ww, v) => ww.u32(v)),
            (r) => r.option((rr) => rr.u32()),
        );
        expect(none).toBe(null);
    });
    test('vec', () => {
        const arr = [1, 2, 3, 4, 5];
        const out = roundTrip(
            (w) => w.vec(arr, (ww, v) => ww.u8(v)),
            (r) => r.vec((rr) => rr.u8()),
        );
        expect(out).toEqual(arr);
    });
    test('empty vec', () => {
        const out = roundTrip(
            (w) => w.vec([], (ww, v) => ww.u8(v)),
            (r) => r.vec((rr) => rr.u8()),
        );
        expect(out).toEqual([]);
    });
    test('string', () => {
        expect(roundTrip((w) => w.str('hello, world'), (r) => r.str())).toBe(
            'hello, world',
        );
    });
    test('utf-8 string', () => {
        const s = '🎮 ✨ Rainboids';
        expect(roundTrip((w) => w.str(s), (r) => r.str())).toBe(s);
    });
    test('uuid (u64 length prefix + 16 raw bytes = 24 wire bytes)', () => {
        const uuid = new Uint8Array([
            0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66,
            0x55, 0x44, 0x00, 0x00,
        ]);
        const out = roundTrip(
            (w) => w.uuid(uuid),
            (r) => r.uuid(),
        );
        expect(Array.from(out)).toEqual(Array.from(uuid));

        // Empirically: bincode + uuid 1.x emits an 8-byte u64 length (= 16)
        // followed by the 16 canonical bytes, total 24 bytes per UUID.
        const w = new Writer(32);
        w.uuid(uuid);
        expect(w.bytes().byteLength).toBe(24);
        expect(Array.from(w.bytes()).slice(0, 8)).toEqual([16, 0, 0, 0, 0, 0, 0, 0]);
    });
});

describe('writer growth', () => {
    test('writes that exceed initial capacity grow correctly', () => {
        const w = new Writer(8);
        for (let i = 0; i < 100; i++) w.u32(i);
        expect(w.bytes().byteLength).toBe(400);

        const r = new Reader(
            new DataView(w.bytes().slice().buffer),
        );
        for (let i = 0; i < 100; i++) expect(r.u32()).toBe(i);
    });
});

describe('reader bounds', () => {
    test('short read throws RangeError', () => {
        const w = new Writer(8);
        w.u8(1);
        const r = new Reader(new DataView(w.bytes().slice().buffer));
        r.u8();
        expect(() => r.u8()).toThrow(RangeError);
    });
});

describe('bincode wire layout sanity', () => {
    test('u32 is 4 bytes LE', () => {
        const w = new Writer(8);
        w.u32(0x01020304);
        const bytes = Array.from(w.bytes());
        expect(bytes).toEqual([0x04, 0x03, 0x02, 0x01]);
    });
    test('u64 is 8 bytes LE', () => {
        const w = new Writer(16);
        w.u64(0x0123456789abcdefn);
        const bytes = Array.from(w.bytes());
        expect(bytes).toEqual([
            0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01,
        ]);
    });
    test('vec length prefix is u64 LE', () => {
        const w = new Writer(16);
        w.vec([0xaa], (ww, v) => ww.u8(v));
        // u64(1) = 8 bytes: 01 00 00 00 00 00 00 00 then payload AA.
        const bytes = Array.from(w.bytes());
        expect(bytes).toEqual([0x01, 0, 0, 0, 0, 0, 0, 0, 0xaa]);
    });
    test('option Some(u32=5) is [01, 05, 00, 00, 00]', () => {
        const w = new Writer(8);
        w.option(5, (ww, v) => ww.u32(v));
        expect(Array.from(w.bytes())).toEqual([0x01, 0x05, 0, 0, 0]);
    });
    test('option None is [00]', () => {
        const w = new Writer(4);
        w.option(null, (ww, v) => ww.u32(v));
        expect(Array.from(w.bytes())).toEqual([0x00]);
    });
});
