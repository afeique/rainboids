// js/sim/codec.js — wire encode/decode (the transport-agnostic seam).
//
// v1 uses JSON for correctness and debuggability. The hot path (snapshots) can
// be swapped to a compact binary format later by changing ONLY this file —
// nothing above it knows the wire encoding. Every transport (WebSocket now,
// WebTransport later) sends whatever `encode()` returns and feeds whatever it
// receives to `decode()`.
//
// Works identically in Node and the browser (no platform-specific APIs).

/** Encode a message object to a string payload for the transport. */
export function encode(msg) {
  return JSON.stringify(msg);
}

/**
 * Decode a transport payload (string, Buffer, ArrayBuffer, or Uint8Array) back
 * to a message object. Returns null on malformed input rather than throwing, so
 * a single bad frame can't crash a connection handler.
 */
export function decode(data) {
  try {
    let str;
    if (typeof data === 'string') {
      str = data;
    } else if (data instanceof Uint8Array) {
      str = new TextDecoder().decode(data);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
      str = data.toString('utf8');
    } else if (data instanceof ArrayBuffer) {
      str = new TextDecoder().decode(new Uint8Array(data));
    } else {
      str = String(data);
    }
    return JSON.parse(str);
  } catch {
    return null;
  }
}
