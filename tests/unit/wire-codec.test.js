/**
 * tests/unit/wire-codec.test.js — golden-byte parity for the multiplayer
 * Hello/Welcome handshake.
 *
 * The Rust server is the source of truth for the wire format; the worked
 * examples in `docs/Multiplayer Wire Format – 2026-05-09.md` are the
 * regression fixtures. If either of these tests fails after a wire-format
 * change, the JS codec and Rust server have drifted and the parity
 * harness (Week 8+ work) needs to catch it.
 */

import { describe, expect, test } from '@jest/globals';

import { Reader, uuidStringToBytes } from '../../js/net/codec.js';
import {
    C2S,
    ErrCode,
    NotImplementedError,
    S2C,
    WIRE_VERSION,
    SIM_VERSION,
    decodeServerMsg,
    encodeClientMsg,
    encodeHello,
} from '../../js/net/protocol.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function hex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function fromHex(str) {
    const cleaned = str.trim().split(/\s+/);
    return new Uint8Array(cleaned.map((s) => parseInt(s, 16)));
}

// Worked examples copied verbatim from the wire-format doc.
const HELLO_GOLDEN_HEX =
    '00 00 00 00 ' + // tag = 0 (Hello)
    '01 00 ' + // wire_version = 1 (u16 LE)
    '01 00 ' + // sim_version  = 1 (u16 LE)
    '06 00 00 00 00 00 00 00 ' + // client_version length = 6
    '35 2e 38 31 2e 31 ' + // "5.81.1"
    '05 00 00 00 00 00 00 00 ' + // display_name length = 5
    '50 69 6c 6f 74 ' + // "Pilot"
    '00'; // session = None

const WELCOME_GOLDEN_HEX =
    '00 00 00 00 ' + // tag = 0 (Welcome)
    '2a 00 00 00 00 00 00 00 ' + // player_id = 42 (u64 LE)
    '10 00 00 00 00 00 00 00 ' + // uuid byte-length = 16
    '01 02 03 04 05 06 07 08 ' + // canonical uuid (NOT LE-swapped)
    '09 0a 0b 0c 0d 0e 0f 10 ' +
    '08 07 06 05 04 03 02 01'; // server_t_ms = 0x0102030405060708 (u64 LE)

const ERROR_VERSION_GOLDEN_HEX =
    '01 00 00 00 ' + // tag = 1 (Error)
    '00 00 00 00 ' + // ErrCode = Version (u32 LE)
    '0b 00 00 00 00 00 00 00 ' + // msg length = 11
    '73 65 72 76 65 72 20 76 31 2f 31'; // "server v1/1"

// ── tests ────────────────────────────────────────────────────────────────────

describe('wire-codec golden-byte fixtures', () => {
    test('versions match the Rust source-of-truth', () => {
        expect(WIRE_VERSION).toBe(1);
        expect(SIM_VERSION).toBe(1);
    });

    test('Hello encodes to the documented 36 golden bytes', () => {
        const expected = fromHex(HELLO_GOLDEN_HEX);
        expect(expected.byteLength).toBe(36);

        const encoded = encodeClientMsg({
            type: C2S.HELLO,
            wireVersion: 1,
            simVersion: 1,
            clientVersion: '5.81.1',
            displayName: 'Pilot',
            session: null,
        });

        expect(encoded.byteLength).toBe(36);
        expect(hex(encoded)).toBe(hex(expected));
    });

    test('encodeHello convenience produces the same bytes', () => {
        const expected = fromHex(HELLO_GOLDEN_HEX);
        const encoded = encodeHello({
            clientVersion: '5.81.1',
            displayName: 'Pilot',
            session: null,
            wireVersion: 1,
            simVersion: 1,
        });
        expect(hex(encoded)).toBe(hex(expected));
    });

    test('Hello with a Some(session) appends the length-prefixed UUID', () => {
        const sessionStr = '01020304-0506-0708-090a-0b0c0d0e0f10';
        const encoded = encodeHello({
            clientVersion: '5.81.1',
            displayName: 'Pilot',
            session: sessionStr,
            wireVersion: 1,
            simVersion: 1,
        });

        // Same prefix as the None case minus the trailing 0x00 None tag,
        // then 0x01 Some + u64 len(16) + 16 raw bytes.
        const helloPrefixSome = HELLO_GOLDEN_HEX.replace(/ 00$/, '');
        const sessionUuidBytes = uuidStringToBytes(sessionStr);
        const sessionHex = hex(sessionUuidBytes);
        const expectedHex =
            helloPrefixSome + ' 01 10 00 00 00 00 00 00 00 ' + sessionHex;
        const expected = fromHex(expectedHex);
        expect(hex(encoded)).toBe(hex(expected));
    });

    test('Welcome decodes the documented 44 golden bytes', () => {
        const golden = fromHex(WELCOME_GOLDEN_HEX);
        expect(golden.byteLength).toBe(44);

        const msg = decodeServerMsg(golden);
        expect(msg.type).toBe(S2C.WELCOME);
        expect(msg.playerId).toBe(42n);
        expect(msg.session).toBe('01020304-0506-0708-090a-0b0c0d0e0f10');
        expect(msg.serverTMs).toBe(0x0102030405060708n);
    });

    test('Welcome decoder consumes exactly 44 bytes (no trailing garbage)', () => {
        // Append a sentinel byte after the golden frame; the decoder should
        // ignore it (a single-message frame doesn't read past its end).
        const golden = fromHex(WELCOME_GOLDEN_HEX);
        const padded = new Uint8Array(golden.byteLength + 1);
        padded.set(golden);
        padded[golden.byteLength] = 0xff;

        // The decoder uses a Reader over a DataView spanning the whole
        // buffer, but advances only by the bytes it needs. We sanity-check
        // by advancing the reader manually and asserting it stops at 44.
        const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
        const r = new Reader(view);
        expect(r.u32()).toBe(0); // Welcome tag
        expect(r.u64()).toBe(42n);
        const sessionLen = r.u64();
        expect(sessionLen).toBe(16n);
        const sessionBytes = r.fixedBytes(16);
        expect(hex(sessionBytes)).toBe('01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10');
        expect(r.u64()).toBe(0x0102030405060708n);
        expect(r.off).toBe(44);
        expect(r.eof()).toBe(false); // sentinel byte remains
    });

    test('Error{Version, "server v1/1"} decodes correctly', () => {
        const bytes = fromHex(ERROR_VERSION_GOLDEN_HEX);
        const msg = decodeServerMsg(bytes);
        expect(msg.type).toBe(S2C.ERROR);
        expect(msg.code).toBe(ErrCode.Version);
        expect(msg.codeName).toBe('Version');
        expect(msg.msg).toBe('server v1/1');
    });

    test('decoder rejects unknown variant tags', () => {
        // A frame whose first 4 bytes are a tag we haven't defined — Reader
        // should throw a TypeError so callers can surface a protocol error.
        const garbage = fromHex('ff 00 00 00');
        expect(() => decodeServerMsg(garbage)).toThrow(/unknown tag/);
    });

    test('decoder throws NotImplementedError for v1+ variants', () => {
        // ServerMsg::Snapshot has tag 7. The codec stubs it out for v1.
        const snapshot = new Uint8Array([7, 0, 0, 0]);
        expect(() => decodeServerMsg(snapshot)).toThrow(NotImplementedError);
    });

    test('encoder rejects ClientMsg variants outside the v1 scope', () => {
        // Input has tag 7; encoder is Hello-only for v1 and must fail loudly.
        expect(() => encodeClientMsg({ type: C2S.INPUT, tick: 0, packed: {} })).toThrow(
            NotImplementedError,
        );
    });
});
