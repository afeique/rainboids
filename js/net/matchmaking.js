// js/net/matchmaking.js — promise wrapper for the matchmaking handshakes
// that ride on top of an already-Welcomed `ConnectionTask`.
//
// Each `quickMatch()` / `createRoom()` / `joinByCode()` call:
//   1. Sends the corresponding `ClientMsg` over the wire.
//   2. Resolves on the next `room_joined` event from the connection.
//   3. Rejects on the next `error_msg` (or `disconnect`) event.
//
// The pattern is "first response wins" — the server sends RoomJoined OR
// Error in response to each of these messages, never both, and the JS UI
// never has more than one in flight at a time. Request-id correlation is
// unnecessary at this layer (and isn't part of the wire format); a one-shot
// listener registered just before the send + cleared on resolve/reject is
// the right shape.
//
// Browse is a separate path (server replies with RoomList, not RoomJoined).
// Leave is a fire-and-forget that resolves once the server's RoomLeft
// confirmation lands (with a 1s fallback in case the room closed first).

/** @typedef {import('./ws-client.js').ConnectionTask} ConnectionTask */

/**
 * @typedef {Object} RoomJoinedPayload
 * @property {bigint} roomId
 * @property {string} code        6-char uppercase
 * @property {number} slot        0..max_players-1
 * @property {Array<{playerId: bigint, displayName: string, slot: number}>} peers
 * @property {number} wave        u32; 0 for a fresh room
 * @property {bigint} seed        u64; deterministic seed for the run
 */

/**
 * @typedef {Object} ServerErrorPayload
 * @property {number} code        ErrCode tag (0=Version, 1=BadHello, 2=NotFound,
 *                                3=Full, 4=Banned, 5=RateLimited, 6=Internal)
 * @property {string} codeName    e.g. 'NotFound'
 * @property {string} msg         human-readable
 */

export class Matchmaking {
    /** @param {ConnectionTask} conn  must already be in `'welcomed'` state */
    constructor(conn) {
        if (!conn) throw new TypeError('Matchmaking: connection is required');
        this.conn = conn;
    }

    /**
     * Send `QuickMatch`. Resolves with the `RoomJoined` payload, rejects
     * with the `Error` payload (`{ code, codeName, msg }`).
     *
     * @returns {Promise<RoomJoinedPayload>}
     */
    quickMatch() {
        return this._oneShot(() => this.conn.sendQuickMatch());
    }

    /**
     * Send `CreateRoom`. Resolves with the `RoomJoined` payload (you are
     * placed in slot 0). Rejects with the `Error` payload on `Full` /
     * `Internal` / etc.
     *
     * @param {string} name        room display name (1..32 chars)
     * @param {boolean} isPublic   true → shows in BrowseRooms list
     * @param {number} maxPlayers  2..4 (server clamps via cfg.max_players_per_room)
     * @returns {Promise<RoomJoinedPayload>}
     */
    createRoom(name, isPublic, maxPlayers) {
        return this._oneShot(() => this.conn.sendCreateRoom(name, isPublic, maxPlayers));
    }

    /**
     * Send `JoinRoomByCode`. Resolves with the `RoomJoined` payload.
     * Rejects with the `Error` payload — the common cases are
     * `NotFound` (no room with that code) and `Full` (room is at capacity).
     *
     * The server normalizes the code to uppercase, so casing doesn't matter
     * on the user's side. `ConnectionTask.sendJoinByCode` pre-uppercases for
     * consistency with the byte-golden tests.
     *
     * @param {string} code  6-char alphanumeric (case-insensitive)
     * @returns {Promise<RoomJoinedPayload>}
     */
    joinByCode(code) {
        return this._oneShot(() => this.conn.sendJoinByCode(code));
    }

    /**
     * Send `BrowseRooms`. Resolves with the `RoomList` payload
     * (`{ rooms: RoomSummary[] }`). Rejects on the same error path as the
     * other handshakes.
     *
     * @returns {Promise<{rooms: object[]}>}
     */
    browse() {
        return new Promise((resolve, reject) => {
            const cleanup = [];
            const off = (fn) => cleanup.push(fn);
            const cleanAll = () => { for (const f of cleanup) f(); };

            off(this.conn.on('room_list', (e) => { cleanAll(); resolve(e); }));
            off(this.conn.on('error_msg', (e) => {
                cleanAll();
                reject(this._mkError(e));
            }));
            off(this.conn.on('disconnect', () => {
                cleanAll();
                reject(new Error('Matchmaking.browse: disconnected'));
            }));
            try {
                this.conn.sendBrowseRooms();
            } catch (err) {
                cleanAll();
                reject(err);
            }
        });
    }

    /**
     * Send `LeaveRoom`. Resolves on the next `room_left` (or after 1s in case
     * the room closed before our message arrived). Never rejects — leaving
     * is best-effort.
     *
     * @returns {Promise<void>}
     */
    leave() {
        return new Promise((resolve) => {
            let unsub = null;
            const done = () => {
                if (unsub) { unsub(); unsub = null; }
                resolve();
            };
            unsub = this.conn.on('room_left', done);
            try {
                this.conn.sendLeaveRoom();
            } catch {
                // Already disconnected — best-effort succeeded by definition.
                done();
                return;
            }
            // Fallback in case the room closed before our LeaveRoom arrived.
            setTimeout(done, 1000);
        });
    }

    /**
     * One-shot send + first-response-wins promise. Listens for room_joined,
     * error_msg, and disconnect; the first one wins and the listeners are
     * cleared. Identical pattern to the way `ConnectionTask.connect()`
     * handles the Welcome/Error race during the Hello handshake.
     *
     * @param {() => void} send  fires the ClientMsg after listeners attach
     * @returns {Promise<RoomJoinedPayload>}
     */
    _oneShot(send) {
        return new Promise((resolve, reject) => {
            const cleanup = [];
            const off = (fn) => cleanup.push(fn);
            const cleanAll = () => { for (const f of cleanup) f(); cleanup.length = 0; };

            off(this.conn.on('room_joined', (e) => {
                cleanAll();
                resolve(e);
            }));
            off(this.conn.on('error_msg', (e) => {
                cleanAll();
                reject(this._mkError(e));
            }));
            off(this.conn.on('disconnect', () => {
                cleanAll();
                reject(new Error('Matchmaking: disconnected before response'));
            }));

            // Send AFTER listeners are wired so a synchronous server reply
            // (test fixtures, mostly) doesn't fire before we're listening.
            try {
                send();
            } catch (err) {
                cleanAll();
                reject(err);
            }
        });
    }

    /**
     * Build a rich `Error` from the server's `error_msg` payload. The error
     * object exposes `.code` (numeric ErrCode), `.codeName` (string), and
     * `.msg` so the UI can branch on whichever it finds easiest.
     */
    _mkError(payload) {
        const e = new Error(`${payload.codeName}: ${payload.msg}`);
        e.code = payload.codeName;
        e.codeNum = payload.code;
        e.codeName = payload.codeName;
        e.msg = payload.msg;
        return e;
    }
}
