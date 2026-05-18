//! Phase-2 WebSocket transport for /mp client.
//!
//! Pure transport — no game logic. Opens a binary WS, sends `Hello`,
//! routes incoming `ServerMsg` variants to caller-supplied callbacks,
//! exposes `sendInput` / `sendBye` / `close`. The decoded messages
//! flow as plain JS objects (see wire-codec.js for shape).
//!
//! Tier 1 debug logging: behind `?mp-debug=1` query or
//! `localStorage.rainboidsMpDebug='1'`. Logs decoded messages to
//! console for DevTools inspection without touching the binary wire.
//! Production cost: zero (the gate is a single boolean check; JIT
//! elides the log call).
//!
//! Phase 2 explicitly omits reconnect, heartbeat/ping, and timeout
//! handling — server-driven for now. Phase 5 polishes resilience.
//!
//! See docs/Multiplayer WASM Pivot Phase 2 – 2026-05-17.md.

import {
    WIRE_VERSION,
    encodeHello,
    encodeInput,
    encodeBye,
    decodeServerMsg,
} from './wire-codec.js';
import { VERSION_MP } from '../modules/core/version.js';

function isDebugEnabled() {
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.get('mp-debug') === '1') return true;
    } catch {}
    try {
        if (localStorage.getItem('rainboidsMpDebug') === '1') return true;
    } catch {}
    return false;
}

const MP_DEBUG = isDebugEnabled();

function defaultUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/mp/ws`;
}

/**
 * Connect to the multiplayer server.
 *
 * @param {object} opts
 * @param {string} opts.name         Player display name.
 * @param {string} [opts.url]        WS URL override (default: derive from window.location).
 * @param {function} opts.onWelcome  (msg: Welcome) → void
 * @param {function} opts.onSnapshot (msg: Snapshot) → void
 * @param {function} opts.onPeerJoined (msg: PeerJoined) → void
 * @param {function} opts.onPeerLeft   (msg: PeerLeft) → void
 * @param {function} opts.onError      (msg: Error) → void
 * @param {function} [opts.onClose]    (event: CloseEvent) → void
 *
 * @returns {{
 *   sendInput: (clientTick:number, up:boolean, down:boolean, left:boolean, right:boolean, aimX:number, aimY:number) => void,
 *   sendBye: () => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 * }}
 */
export function connect({
    name,
    url = defaultUrl(),
    onWelcome,
    onSnapshot,
    onPeerJoined,
    onPeerLeft,
    onError,
    onClose,
}) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    let opened = false;

    ws.addEventListener('open', () => {
        opened = true;
        if (MP_DEBUG) console.log('[mp/ws]', 'open', url);
        const helloBytes = encodeHello(name, VERSION_MP, WIRE_VERSION);
        if (MP_DEBUG) {
            console.log('[mp/ws ↑]', {
                kind: 'Hello',
                name,
                client_version: VERSION_MP,
                wire_version: WIRE_VERSION,
            });
        }
        ws.send(helloBytes);
    });

    ws.addEventListener('message', (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) {
            console.warn('[mp/ws] dropping non-binary frame');
            return;
        }
        let msg;
        try {
            msg = decodeServerMsg(ev.data);
        } catch (e) {
            console.error('[mp/ws] decode failed', e, new Uint8Array(ev.data));
            return;
        }
        if (MP_DEBUG) console.log('[mp/ws ↓]', msg);
        switch (msg.kind) {
            case 'Welcome':    onWelcome?.(msg); break;
            case 'Snapshot':   onSnapshot?.(msg); break;
            case 'PeerJoined': onPeerJoined?.(msg); break;
            case 'PeerLeft':   onPeerLeft?.(msg); break;
            case 'Error':      onError?.(msg); break;
            default:           console.warn('[mp/ws] unknown msg kind', msg.kind);
        }
    });

    ws.addEventListener('close', (ev) => {
        if (MP_DEBUG) console.log('[mp/ws]', 'close', ev.code, ev.reason);
        onClose?.(ev);
    });

    ws.addEventListener('error', (ev) => {
        if (MP_DEBUG) console.log('[mp/ws]', 'error', ev);
    });

    return {
        sendInput(clientTick, up, down, left, right, aimX, aimY) {
            if (ws.readyState !== WebSocket.OPEN) return;
            const bytes = encodeInput(clientTick, up, down, left, right, aimX, aimY);
            if (MP_DEBUG) {
                console.log('[mp/ws ↑]', {
                    kind: 'Input',
                    client_tick: clientTick,
                    up, down, left, right,
                    aim_x: aimX, aim_y: aimY,
                });
            }
            ws.send(bytes);
        },
        sendBye() {
            if (ws.readyState !== WebSocket.OPEN) return;
            const bytes = encodeBye();
            if (MP_DEBUG) console.log('[mp/ws ↑]', { kind: 'Bye' });
            ws.send(bytes);
        },
        close() {
            ws.close();
        },
        isOpen() {
            return opened && ws.readyState === WebSocket.OPEN;
        },
    };
}
