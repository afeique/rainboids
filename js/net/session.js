// Session-token persistence. UUID stored in localStorage; survives
// reconnects within the server's grace window.
//
// Mirrors the design in `Multiplayer Rust Client Engine – 2026-05-07.md`
// §"`js/net/session.js`". Server-issued UUIDs come back as 16 raw bytes
// (the `Welcome` message); we store them as a 32-char hex string for
// localStorage simplicity.

const KEY = 'rainboids:session';

/**
 * Read the saved session UUID, if any.
 * @returns {Uint8Array | null}
 */
export function loadSession() {
    try {
        const hex = localStorage.getItem(KEY);
        if (!hex || hex.length !== 32) return null;
        return hexToBytes(hex);
    } catch {
        // localStorage may be unavailable (privacy mode, server-side, etc.)
        return null;
    }
}

/**
 * Persist the session UUID for the next connection attempt.
 * @param {Uint8Array} uuidBytes - 16 bytes
 */
export function saveSession(uuidBytes) {
    if (!uuidBytes || uuidBytes.byteLength !== 16) {
        throw new RangeError('saveSession: expected 16-byte UUID');
    }
    try {
        localStorage.setItem(KEY, bytesToHex(uuidBytes));
    } catch {
        // No-op — quota exceeded, etc. The server will issue a fresh
        // session on the next reconnect; nothing breaks.
    }
}

export function clearSession() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}

function bytesToHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, '0');
    }
    return s;
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
}
