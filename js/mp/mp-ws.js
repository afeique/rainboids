//! Phase-3 WebSocket transport for /mp client.
//!
//! Pure transport — no game logic. Opens a binary WS, sends `Hello`,
//! routes incoming `ServerMsg` variants to caller-supplied callbacks,
//! exposes `sendInput` / `sendResync` / `sendBye` / `close` / `isOpen`.
//! The decoded messages flow as plain JS objects (see wire-codec.js
//! for shape).
//!
//! Tier 1 debug logging: behind `?mp-debug=1` query or
//! `localStorage.rainboidsMpDebug='1'`. Logs decoded messages to
//! console for DevTools inspection without touching the binary wire.
//! Production cost: zero (the gate is a single boolean check; JIT
//! elides the log call).
//!
//! Phase 3 added Event / StateChecksum / Resync routing; Phase 2 base
//! still covers Welcome / Snapshot / PeerJoined / PeerLeft / Error.
//!
//! Phase 3 still explicitly omits reconnect, heartbeat/ping, and
//! timeout handling — server-driven for now. Phase 5 polishes
//! resilience.
//!
//! See docs/Multiplayer WASM Pivot Phase 3 – 2026-05-17.md.

import {
    WIRE_VERSION,
    encodeHello,
    encodeInput,
    encodeBye,
    encodeResync,
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

/**
 * Discover the multiplayer server's address. Priority:
 *
 *   0. `window.rainboids.mpServerUrl` (Electron preload — full URL,
 *      e.g., `wss://example.com/mp/ws`. Set by the desktop wrapper so
 *      it can target a production host instead of `app://rainboids`,
 *      which is what `window.location.hostname` would otherwise resolve
 *      to inside Electron.)
 *   1. `?mp-ws=<host>[:<port>]` URL param (testing override)
 *   2. `js/mp/dev-mp-port.json` (written by `npm run mp` at boot;
 *      tells us which port the rainboids-server bound — auto-fallback
 *      means it might not be 8443)
 *   3. default `:8443` on `window.location.hostname` (production)
 *
 * Returns a Promise so we can `fetch()` the discovery file. Caller
 * (mp-engine) awaits this before invoking `connect({url, ...})`.
 */
export async function discoverDefaultUrl() {
    // (0) Embedder override. The Electron preload sets this when the
    //     app is launched with RAINBOIDS_MP_WS_URL in the env (or via
    //     the wrapper's hardcoded default). Full URL — we return it
    //     verbatim, no proto/host/port munging.
    try {
        const fromEmbedder = window.rainboids?.mpServerUrl;
        if (typeof fromEmbedder === 'string' && fromEmbedder.length > 0) {
            if (MP_DEBUG) {
                console.log(`[mp/ws] using embedder-provided URL: ${fromEmbedder}`);
            }
            return fromEmbedder;
        }
    } catch {}

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.hostname || 'localhost';
    let port = '8443';

    // (1) URL param override.
    try {
        const q = new URLSearchParams(window.location.search);
        const override = q.get('mp-ws');
        if (override) {
            const colon = override.indexOf(':');
            if (colon === 0) {
                port = override.slice(1);
            } else if (colon > 0) {
                host = override.slice(0, colon);
                port = override.slice(colon + 1);
            } else {
                host = override;
            }
            return `${proto}//${host}:${port}/mp/ws`;
        }
    } catch {}

    // (2) Dev discovery file. Cache-busted with a timestamp so a
    //     stale browser cache doesn't return yesterday's port.
    try {
        const resp = await fetch(`./wasm/../dev-mp-port.json?t=${Date.now()}`, {
            cache: 'no-store',
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && typeof data.port === 'number') {
                if (typeof data.host === 'string' && data.host) host = data.host;
                port = String(data.port);
                if (MP_DEBUG) {
                    console.log(`[mp/ws] discovered ${host}:${port} via dev-mp-port.json`);
                }
                return `${proto}//${host}:${port}/mp/ws`;
            }
        }
    } catch {}

    // (3) Default fallback.
    return `${proto}//${host}:${port}/mp/ws`;
}

/**
 * Connect to the multiplayer server.
 *
 * @param {object} opts
 * @param {string} opts.name              Player display name.
 * @param {string} [opts.url]             WS URL override (default: derive from window.location).
 * @param {function} opts.onWelcome       (msg: Welcome) → void
 * @param {function} opts.onSnapshot      (msg: Snapshot) → void
 * @param {function} [opts.onPeerJoined]  (msg: PeerJoined) → void
 * @param {function} [opts.onPeerLeft]    (msg: PeerLeft) → void
 * @param {function} [opts.onError]       (msg: Error) → void
 * @param {function} [opts.onEvent]       (msg: Event) → void          — Phase 3
 * @param {function} [opts.onStateChecksum] (msg: StateChecksum) → void — Phase 3
 * @param {function} [opts.onResync]      (msg: Resync) → void          — Phase 3
 * @param {function} [opts.onClose]       (event: CloseEvent) → void
 *
 * @returns {{
 *   sendInput: (clientTick:number, up:boolean, down:boolean, left:boolean, right:boolean, aimX:number, aimY:number) => void,
 *   sendResync: (clientTick:number) => void,
 *   sendBye: () => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 * }}
 */
export function connect({
    name,
    url,
    onWelcome,
    onSnapshot,
    onPeerJoined,
    onPeerLeft,
    onError,
    onEvent,
    onStateChecksum,
    onResync,
    onClose,
}) {
    if (!url) {
        throw new Error(
            '[mp/ws] connect({url}) is required; await discoverDefaultUrl() first'
        );
    }
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
            case 'Welcome':         onWelcome?.(msg); break;
            case 'Snapshot':        onSnapshot?.(msg); break;
            case 'PeerJoined':      onPeerJoined?.(msg); break;
            case 'PeerLeft':        onPeerLeft?.(msg); break;
            case 'Error':           onError?.(msg); break;
            // ── Phase 3 ──
            case 'Event':           onEvent?.(msg); break;
            case 'StateChecksum':   onStateChecksum?.(msg); break;
            case 'Resync':          onResync?.(msg); break;
            default:                console.warn('[mp/ws] unknown msg kind', msg.kind);
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
        sendResync(clientTick) {
            if (ws.readyState !== WebSocket.OPEN) return;
            const bytes = encodeResync(clientTick);
            if (MP_DEBUG) {
                console.log('[mp/ws ↑]', { kind: 'Resync', client_tick: clientTick });
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
