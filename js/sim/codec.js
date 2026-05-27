// js/sim/codec.js — wire encode/decode (the transport-agnostic seam).
//
// Binary MessagePack, hand-rolled and dependency-free so it runs identically in
// Node and the browser with no bundler / vendoring / import map. Only the
// JSON-shaped value subset the wire actually carries is supported: null,
// boolean, number (int + float64), string, array, plain object.
//
//   encode(msg)  -> Uint8Array
//   decode(data) -> object | null   (tolerates string|Buffer|ArrayBuffer|Uint8Array)
//
// `decode` still accepts a JSON string (legacy / test robustness) and returns
// null on malformed input rather than throwing, so one bad frame can't crash a
// connection handler. Pairs with delta snapshots (js/sim/snapshot-delta.js).

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// ── Encode ─────────────────────────────────────────────────────────────────

function encNumber(b, n) {
  if (Number.isInteger(n) && n >= -2147483648 && n <= 4294967295) {
    if (n >= 0) {
      if (n < 0x80) { b.push(n); return; }                                  // positive fixint
      if (n < 0x100) { b.push(0xcc, n); return; }                           // uint8
      if (n < 0x10000) { b.push(0xcd, (n >> 8) & 0xff, n & 0xff); return; } // uint16
      b.push(0xce, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff); return; // uint32
    }
    if (n >= -32) { b.push(n & 0xff); return; }                             // negative fixint
    if (n >= -128) { b.push(0xd0, n & 0xff); return; }                      // int8
    if (n >= -32768) { b.push(0xd1, (n >> 8) & 0xff, n & 0xff); return; }   // int16
    b.push(0xd2, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff); return; // int32
  }
  // Everything else (and ints beyond int32) → float64 (exact for ints ≤ 2^53).
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, n, false);
  const u = new Uint8Array(buf);
  b.push(0xcb, u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7]);
}

function encStr(b, s) {
  const u = TEXT_ENCODER.encode(s);
  const len = u.length;
  if (len < 32) b.push(0xa0 | len);
  else if (len < 256) b.push(0xd9, len);
  else if (len < 65536) b.push(0xda, (len >> 8) & 0xff, len & 0xff);
  else b.push(0xdb, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  for (let i = 0; i < len; i++) b.push(u[i]);
}

function encValue(b, v) {
  if (v === null || v === undefined) { b.push(0xc0); return; }
  switch (typeof v) {
    case 'boolean': b.push(v ? 0xc3 : 0xc2); return;
    case 'number': encNumber(b, v); return;
    case 'string': encStr(b, v); return;
    default: break;
  }
  if (Array.isArray(v)) {
    const len = v.length;
    if (len < 16) b.push(0x90 | len);
    else if (len < 65536) b.push(0xdc, (len >> 8) & 0xff, len & 0xff);
    else b.push(0xdd, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
    for (let i = 0; i < len; i++) encValue(b, v[i]);
    return;
  }
  // Plain object → map; skip undefined-valued keys (matches JSON semantics).
  const keys = [];
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k) && v[k] !== undefined) keys.push(k);
  }
  const len = keys.length;
  if (len < 16) b.push(0x80 | len);
  else if (len < 65536) b.push(0xde, (len >> 8) & 0xff, len & 0xff);
  else b.push(0xdf, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  for (const k of keys) { encStr(b, k); encValue(b, v[k]); }
}

export function encode(msg) {
  const b = [];
  encValue(b, msg);
  return Uint8Array.from(b);
}

// ── Decode ─────────────────────────────────────────────────────────────────

function readStr(st, len) {
  const s = TEXT_DECODER.decode(st.u8.subarray(st.pos, st.pos + len));
  st.pos += len;
  return s;
}
function readArr(st, len) {
  const a = new Array(len);
  for (let i = 0; i < len; i++) a[i] = decValue(st);
  return a;
}
function readMap(st, len) {
  const o = {};
  for (let i = 0; i < len; i++) { const k = decValue(st); o[k] = decValue(st); }
  return o;
}

function decValue(st) {
  const b = st.u8[st.pos++];
  if (b < 0x80) return b;          // positive fixint
  if (b >= 0xe0) return b - 256;   // negative fixint
  if (b >= 0xa0 && b <= 0xbf) return readStr(st, b & 0x1f); // fixstr
  if (b >= 0x90 && b <= 0x9f) return readArr(st, b & 0x0f); // fixarray
  if (b >= 0x80 && b <= 0x8f) return readMap(st, b & 0x0f); // fixmap
  const dv = st.view;
  let v;
  switch (b) {
    case 0xc0: return null;
    case 0xc2: return false;
    case 0xc3: return true;
    case 0xcc: return st.u8[st.pos++];                                  // uint8
    case 0xcd: v = dv.getUint16(st.pos, false); st.pos += 2; return v;  // uint16
    case 0xce: v = dv.getUint32(st.pos, false); st.pos += 4; return v;  // uint32
    case 0xd0: v = dv.getInt8(st.pos); st.pos += 1; return v;           // int8
    case 0xd1: v = dv.getInt16(st.pos, false); st.pos += 2; return v;   // int16
    case 0xd2: v = dv.getInt32(st.pos, false); st.pos += 4; return v;   // int32
    case 0xca: v = dv.getFloat32(st.pos, false); st.pos += 4; return v; // float32
    case 0xcb: v = dv.getFloat64(st.pos, false); st.pos += 8; return v; // float64
    case 0xd9: return readStr(st, st.u8[st.pos++]);                     // str8
    case 0xda: v = dv.getUint16(st.pos, false); st.pos += 2; return readStr(st, v);
    case 0xdb: v = dv.getUint32(st.pos, false); st.pos += 4; return readStr(st, v);
    case 0xdc: v = dv.getUint16(st.pos, false); st.pos += 2; return readArr(st, v);
    case 0xdd: v = dv.getUint32(st.pos, false); st.pos += 4; return readArr(st, v);
    case 0xde: v = dv.getUint16(st.pos, false); st.pos += 2; return readMap(st, v);
    case 0xdf: v = dv.getUint32(st.pos, false); st.pos += 4; return readMap(st, v);
    default: throw new Error(`msgpack: unsupported byte 0x${b.toString(16)}`);
  }
}

export function decode(data) {
  try {
    if (typeof data === 'string') return JSON.parse(data); // legacy / tests
    let u8;
    if (data instanceof Uint8Array) u8 = data;
    else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
      u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof ArrayBuffer) {
      u8 = new Uint8Array(data);
    } else {
      return null;
    }
    const st = { u8, view: new DataView(u8.buffer, u8.byteOffset, u8.byteLength), pos: 0 };
    return decValue(st);
  } catch {
    return null;
  }
}
