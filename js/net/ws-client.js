// js/net/ws-client.js — WebSocket connection task for the Hello/Welcome
// handshake against the Rust server (`server/src/server/connection.rs`).
//
// FEATURE FLAG (work-in-progress, default off in production):
//
//   The Multiplayer button on the title screen is gated. Players only see
//   it when one of the following is true:
//
//     • The URL contains `?multiplayer=1` (handy for local dev links).
//     • `localStorage.setItem('rainboidsMultiplayer', '1')` has been run.
//
//   See `multiplayerEnabled()` below; the title-screen renderer reads
//   that flag and silently omits the button otherwise. This keeps the
//   in-progress networking out of the production build until the engine
//   side catches up (Week 7+).
//
// USAGE:
//
//     const conn = new ConnectionTask({
//         url: 'ws://localhost:8443/ws',
//         clientVersion: '5.81.1',
//         displayName: 'Pilot',
//         session: localStorage.getItem('rainboids-session') ?? null,
//     });
//     conn.on('welcome',    ({ playerId, session, serverTimeMs }) => …);
//     conn.on('error',      ({ code, codeName, msg }) => …);
//     conn.on('disconnect', () => …);
//     await conn.connect();   // resolves on welcome, rejects on error
//
// SCOPE NOTES (v1 / Week 6):
//
//   • Sends `Hello` immediately on socket open.
//   • The first binary frame must be `Welcome` or `Error`; any other
//     variant is treated as a protocol violation.
//   • On `Welcome`, persists `session` to localStorage under
//     `rainboids-session` so future reconnects can include it.
//   • `Error { code: Version, … }` surfaces a friendly "client out of
//     date" message via the `error` event.
//   • No room join, no ping/pong, no input streaming. Those layers
//     plug into `_onBinaryFrame` once they exist.

import {
    C2S,
    ErrCode,
    NotImplementedError,
    S2C,
    SIM_VERSION,
    WIRE_VERSION,
    decodeServerMsg,
    encodeClientMsg,
    encodeHello,
} from './protocol.js';
// Generated codec is the source of truth for the post-handshake variants
// (Snapshot, Event, Input, Ack, Pong, …) — `protocol.js` still throws
// `NotImplementedError` for those during decode. We import the generated
// `decodeServerMsg` / `encodeClientMsg` under aliases and only fall back to
// them when the hand-written codec hits the not-implemented branch. This
// keeps the handshake path on the audited hand-written code while letting
// the MP-mode engine driver receive decoded snapshots + send INPUT frames.
import {
    decodeServerMsg as decodeServerMsgGenerated,
    encodeClientMsg as encodeClientMsgGenerated,
    S2C as S2C_GENERATED,
} from '../sim/protocol-generated.js';

/** localStorage key for the persistent session UUID returned by Welcome. */
export const SESSION_STORAGE_KEY = 'rainboids-session';

/** localStorage key for the hidden multiplayer feature flag (string '1'). */
export const FEATURE_FLAG_KEY = 'rainboidsMultiplayer';

/** Query-string toggle for the same flag. */
export const FEATURE_FLAG_QUERY = 'multiplayer';

/**
 * Returns true if the multiplayer UI should be exposed to the player.
 * Off by default — the WIP button hides itself in production builds.
 */
export function multiplayerEnabled() {
    try {
        if (typeof window !== 'undefined' && window.location?.search) {
            const params = new URLSearchParams(window.location.search);
            if (params.get(FEATURE_FLAG_QUERY) === '1') return true;
        }
    } catch {}
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem(FEATURE_FLAG_KEY) === '1') {
            return true;
        }
    } catch {}
    return false;
}

/**
 * Compute the WebSocket URL from `?wsUrl=...`, an explicit override, or the
 * current page origin. The Rust server defaults to ws://0.0.0.0:8443/ws.
 */
export function defaultWsUrl(override) {
    if (override) return override;
    try {
        if (typeof window !== 'undefined' && window.location?.search) {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = params.get('wsUrl');
            if (fromQuery) return fromQuery;
        }
    } catch {}
    const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
    return `ws://${host}:8443/ws`;
}

/**
 * The connection task drives a single WebSocket from open through Welcome.
 * Later weeks will extend it with ping/pong, snapshot/event ingestion, and
 * input streaming — `_onBinaryFrame` is the dispatch hook.
 */
export class ConnectionTask {
    /**
     * @param {object} opts
     * @param {string} [opts.url]              ws URL; defaults to `defaultWsUrl()`
     * @param {string} opts.clientVersion      e.g. VERSION constant
     * @param {string} [opts.displayName]      defaults to "Pilot"
     * @param {string|null} [opts.session]     persistent session UUID (canonical string) or null
     * @param {number} [opts.connectTimeoutMs] reject if Welcome doesn't arrive in this window
     */
    constructor({
        url,
        clientVersion,
        displayName = 'Pilot',
        session = null,
        connectTimeoutMs = 10_000,
    }) {
        if (!clientVersion) {
            throw new TypeError('ConnectionTask: clientVersion is required');
        }
        this.url = defaultWsUrl(url);
        this.clientVersion = String(clientVersion);
        this.displayName = String(displayName);
        this.session = session || null;
        this.connectTimeoutMs = connectTimeoutMs;

        // Connection state
        this.socket = null;
        this.state = 'idle'; // 'idle' | 'connecting' | 'open' | 'welcomed' | 'closed'
        this.playerId = null;
        this.serverTimeMs = null;
        this._welcomeResolve = null;
        this._welcomeReject = null;
        this._timeoutHandle = null;

        // Tiny event-emitter shim. Keeping it minimal sidesteps the EventTarget
        // CustomEvent boilerplate and works identically in Node-Jest.
        this._listeners = new Map(); // event -> Set<fn>
    }

    // ─── public event-emitter API ────────────────────────────────────────

    /**
     * Subscribe to one of: 'welcome', 'error', 'disconnect', 'frame'.
     * Returns an unsubscribe function.
     */
    on(event, fn) {
        let set = this._listeners.get(event);
        if (!set) {
            set = new Set();
            this._listeners.set(event, set);
        }
        set.add(fn);
        return () => set.delete(fn);
    }

    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
    }

    _emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) {
            try { fn(payload); } catch (err) { console.error(`ConnectionTask: listener for "${event}" threw`, err); }
        }
    }

    // ─── lifecycle ───────────────────────────────────────────────────────

    /**
     * Open the socket and wait for Welcome (or Error). Resolves with the
     * Welcome payload; rejects on socket close, server Error, or timeout.
     *
     * @returns {Promise<{ playerId: bigint, session: string, serverTimeMs: bigint }>}
     */
    connect() {
        if (this.state !== 'idle') {
            return Promise.reject(new Error(`ConnectionTask: already ${this.state}`));
        }
        this.state = 'connecting';

        return new Promise((resolve, reject) => {
            this._welcomeResolve = resolve;
            this._welcomeReject = reject;

            let socket;
            try {
                socket = new WebSocket(this.url);
            } catch (err) {
                this._fail(new Error(`ConnectionTask: WebSocket constructor threw: ${err?.message ?? err}`));
                return;
            }
            this.socket = socket;
            socket.binaryType = 'arraybuffer';

            socket.addEventListener('open',    () => this._onOpen());
            socket.addEventListener('message', (e) => this._onMessage(e));
            socket.addEventListener('error',   () => this._onSocketError());
            socket.addEventListener('close',   (e) => this._onClose(e));

            this._timeoutHandle = setTimeout(() => {
                if (this.state !== 'welcomed') {
                    this._fail(new Error(`ConnectionTask: no Welcome within ${this.connectTimeoutMs}ms`));
                }
            }, this.connectTimeoutMs);
        });
    }

    /** Close the socket cleanly. Idempotent. */
    disconnect() {
        if (this.state === 'idle' || this.state === 'closed') return;
        const prev = this.state;
        this.state = 'closed';
        this._clearTimeout();
        try { this.socket?.close(1000, 'client disconnect'); } catch {}
        // If we never reached Welcome, surface the failure to the awaiter.
        if (prev !== 'welcomed' && this._welcomeReject) {
            const reject = this._welcomeReject;
            this._welcomeResolve = this._welcomeReject = null;
            reject(new Error('ConnectionTask: disconnected before Welcome'));
        }
        this._emit('disconnect', {});
    }

    // ─── socket event handlers ───────────────────────────────────────────

    _onOpen() {
        this.state = 'open';
        const helloBytes = encodeHello({
            clientVersion: this.clientVersion,
            displayName: this.displayName,
            session: this.session,
            wireVersion: WIRE_VERSION,
            simVersion: SIM_VERSION,
        });
        try {
            // Browsers accept Uint8Array (sends a binary frame). Some older
            // runtimes prefer a plain ArrayBuffer; either path works.
            this.socket.send(helloBytes);
        } catch (err) {
            this._fail(new Error(`ConnectionTask: socket.send(Hello) failed: ${err?.message ?? err}`));
        }
    }

    _onMessage(event) {
        const data = event?.data;
        if (typeof data === 'string') {
            this._fail(new Error('ConnectionTask: received text frame; protocol is binary-only'));
            return;
        }
        if (!data) return;

        let buf;
        if (data instanceof ArrayBuffer) {
            buf = data;
        } else if (ArrayBuffer.isView(data)) {
            buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        } else {
            this._fail(new Error(`ConnectionTask: unsupported frame type ${data?.constructor?.name ?? typeof data}`));
            return;
        }

        let msg;
        try {
            msg = decodeServerMsg(buf);
        } catch (err) {
            if (err instanceof NotImplementedError) {
                // The hand-written codec doesn't speak this variant (Snapshot,
                // Event, Ping live there). Try the generated codec which has
                // full coverage. If it decodes cleanly we route through the
                // post-Welcome dispatch like any other frame; if THAT also
                // fails we keep the original "soft frame with error" behavior
                // so the matchmaking layer is unaffected.
                try {
                    msg = decodeServerMsgGenerated(buf);
                } catch {
                    this._emit('frame', { raw: buf, error: err });
                    return;
                }
            } else {
                this._fail(new Error(`ConnectionTask: decodeServerMsg failed: ${err?.message ?? err}`));
                return;
            }
        }

        this._emit('frame', { msg });
        this._onBinaryFrame(msg);
    }

    _onBinaryFrame(msg) {
        if (this.state !== 'open' && this.state !== 'welcomed') {
            // Stale frame after disconnect; drop silently.
            return;
        }

        if (this.state === 'open') {
            // Handshake mode: must be Welcome or Error.
            if (msg.type === S2C.WELCOME) {
                this._handleWelcome(msg);
                return;
            }
            if (msg.type === S2C.ERROR) {
                this._handleServerError(msg);
                return;
            }
            this._fail(new Error(
                `ConnectionTask: expected Welcome or Error first, got variant ${msg.type}`,
            ));
            return;
        }

        // Post-Welcome dispatch — emit named events the matchmaking layer
        // listens for. Snapshot/Event/Ping land here too once their codecs
        // are filled in; for now we re-emit them as `frame` (already done in
        // _onMessage above) and the matchmaking layer just ignores them.
        switch (msg.type) {
            case S2C.ERROR:
                // Post-Welcome errors are NOT fatal — e.g. JoinRoomByCode
                // returning Error::NotFound. We surface it on `error_msg`
                // and keep the socket open so the user can retry.
                this._emit('error_msg', { code: msg.code, codeName: msg.codeName, msg: msg.msg });
                return;
            case S2C.ROOM_LIST:
                this._emit('room_list', { rooms: msg.rooms });
                return;
            case S2C.ROOM_JOINED:
                this._emit('room_joined', {
                    roomId: msg.roomId,
                    code: msg.code,
                    slot: msg.slot,
                    peers: msg.peers,
                    wave: msg.wave,
                    seed: msg.seed,
                });
                return;
            case S2C.ROOM_LEFT:
                this._emit('room_left', { reason: msg.reason });
                return;
            case S2C.PEER_JOINED:
                this._emit('peer_joined', { peer: msg.peer, slot: msg.slot });
                return;
            case S2C.PEER_LEFT:
                this._emit('peer_left', { slot: msg.slot, reason: msg.reason });
                return;
            case S2C_GENERATED.SNAPSHOT:
                // Decoded via the generated codec fallback in `_onMessage`.
                // Emit a typed event so the engine driver can feed snapshots
                // into Predictor + Interpolator without re-decoding. We stamp
                // a client-side receive time (performance.now() when
                // available, Date.now() in test/jsdom shims) so the
                // interpolator has a stable monotonic clock to anchor its
                // render-delay timeline against — the server tick alone
                // doesn't carry wall-clock spacing.
                this._emit('snapshot', {
                    tick: msg.tick,
                    baseTick: msg.baseTick,
                    payload: msg.payload,
                    recvTime: typeof performance !== 'undefined' && typeof performance.now === 'function'
                        ? performance.now()
                        : Date.now(),
                });
                return;
            default:
                // Event/Ping (and any future variants) — let listeners pick
                // them up off `frame`.
                return;
        }
    }

    // ─── outbound helpers (Hello already sent on _onOpen) ────────────────

    /**
     * Encode + send a `ClientMsg`. Throws if the socket isn't open. The
     * matchmaking helpers below all funnel through this one method so the
     * "is the socket alive?" check lives in one place.
     *
     * @param {object} msg  shape matches `writeClientMsg` in ./protocol.js
     */
    _sendClientMsg(msg) {
        if (this.state !== 'open' && this.state !== 'welcomed') {
            throw new Error(`ConnectionTask: cannot send while ${this.state}`);
        }
        const bytes = encodeClientMsg(msg);
        try {
            this.socket.send(bytes);
        } catch (err) {
            throw new Error(`ConnectionTask: socket.send failed: ${err?.message ?? err}`);
        }
    }

    /** Send `ClientMsg::QuickMatch`. Server replies with `RoomJoined` or `Error`. */
    sendQuickMatch() {
        this._sendClientMsg({ type: C2S.QUICK_MATCH });
    }

    /** Send `ClientMsg::BrowseRooms`. Server replies with `RoomList`. */
    sendBrowseRooms() {
        this._sendClientMsg({ type: C2S.BROWSE_ROOMS });
    }

    /**
     * Send `ClientMsg::CreateRoom { name, public, max_players }`.
     * Server replies with `RoomJoined` (slot 0) or `Error`.
     *
     * @param {string} name        display name for the lobby
     * @param {boolean} isPublic   true → visible in BrowseRooms
     * @param {number} maxPlayers  2..4 typically
     */
    sendCreateRoom(name, isPublic, maxPlayers) {
        this._sendClientMsg({
            type: C2S.CREATE_ROOM,
            name: String(name),
            public: !!isPublic,
            maxPlayers: maxPlayers | 0,
        });
    }

    /**
     * Send `ClientMsg::JoinRoomByCode { code }`. Server normalizes the
     * code to uppercase server-side; we pre-uppercase here so the byte
     * payload matches what the user typically expects on the wire.
     *
     * @param {string} code  6-char alphanumeric room code
     */
    sendJoinByCode(code) {
        this._sendClientMsg({
            type: C2S.JOIN_ROOM_BY_CODE,
            code: String(code).toUpperCase(),
        });
    }

    /** Send `ClientMsg::JoinRoom { room_id }`. */
    sendJoinRoom(roomId) {
        this._sendClientMsg({
            type: C2S.JOIN_ROOM,
            roomId: typeof roomId === 'bigint' ? roomId : BigInt(roomId),
        });
    }

    /** Send `ClientMsg::LeaveRoom`. Server replies with `RoomLeft`. */
    sendLeaveRoom() {
        this._sendClientMsg({ type: C2S.LEAVE_ROOM });
    }

    /**
     * Send `ClientMsg::Input { tick, packed }`. The hand-written codec in
     * `protocol.js` still throws `NotImplementedError` for Input; we route
     * through the generated codec (`js/sim/protocol-generated.js`) which
     * already has full coverage. The shape of `packed` matches the
     * `PackedInput` struct: `{ moveX: i8, moveY: i8, aimX: i16, aimY: i16,
     * buttons: u8 }` — see `js/sim/input.js::pack`.
     *
     * @param {number} tick
     * @param {{moveX:number, moveY:number, aimX:number, aimY:number, buttons:number}} packed
     */
    sendInput(tick, packed) {
        if (this.state !== 'open' && this.state !== 'welcomed') {
            throw new Error(`ConnectionTask: cannot send while ${this.state}`);
        }
        const bytes = encodeClientMsgGenerated({
            type: C2S.INPUT,
            tick: tick >>> 0,
            packed,
        });
        try {
            this.socket.send(bytes);
        } catch (err) {
            throw new Error(`ConnectionTask: socket.send(Input) failed: ${err?.message ?? err}`);
        }
    }

    _handleWelcome(msg) {
        this.state = 'welcomed';
        this.playerId = msg.playerId;
        this.serverTimeMs = msg.serverTMs;
        this.session = msg.session;
        this._clearTimeout();

        // Persist the session UUID so the next reconnect can claim it.
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(SESSION_STORAGE_KEY, msg.session);
            }
        } catch {}

        const payload = {
            playerId: msg.playerId,
            session: msg.session,
            serverTimeMs: msg.serverTMs,
        };
        this._emit('welcome', payload);

        if (this._welcomeResolve) {
            const resolve = this._welcomeResolve;
            this._welcomeResolve = this._welcomeReject = null;
            resolve(payload);
        }
    }

    _handleServerError(msg) {
        const friendly =
            msg.code === ErrCode.Version
                ? `Client out of date — please refresh. ${msg.msg}`
                : msg.msg;
        const payload = { code: msg.code, codeName: msg.codeName, msg: friendly };
        this._emit('error', payload);
        this._fail(Object.assign(new Error(`server error: ${msg.codeName}: ${msg.msg}`), payload));
    }

    _onSocketError() {
        if (this.state === 'welcomed' || this.state === 'closed') return;
        this._fail(new Error('ConnectionTask: socket error'));
    }

    _onClose(event) {
        const wasWelcomed = this.state === 'welcomed';
        this.state = 'closed';
        this._clearTimeout();
        if (!wasWelcomed && this._welcomeReject) {
            const reject = this._welcomeReject;
            this._welcomeResolve = this._welcomeReject = null;
            reject(new Error(
                `ConnectionTask: socket closed before Welcome (code ${event?.code ?? '?'}` +
                    (event?.reason ? `, reason ${JSON.stringify(event.reason)}` : '') +
                    ')',
            ));
        }
        this._emit('disconnect', { code: event?.code, reason: event?.reason });
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    _fail(err) {
        if (this.state === 'welcomed') {
            // After welcome, surface as plain disconnect — caller is no longer
            // awaiting `connect()`.
            try { this.socket?.close(); } catch {}
            this._emit('disconnect', {});
            this.state = 'closed';
            return;
        }
        this._clearTimeout();
        try { this.socket?.close(); } catch {}
        if (this._welcomeReject) {
            const reject = this._welcomeReject;
            this._welcomeResolve = this._welcomeReject = null;
            reject(err);
        }
        this.state = 'closed';
    }

    _clearTimeout() {
        if (this._timeoutHandle != null) {
            clearTimeout(this._timeoutHandle);
            this._timeoutHandle = null;
        }
    }
}
