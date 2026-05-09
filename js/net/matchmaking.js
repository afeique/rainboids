// Matchmaking glue. Thin wrapper around WsClient that exposes a
// promise-based API for the title-screen UX (Quick Match / Browse /
// Create / Join-by-Code).

import { S2C } from '../sim/protocol.js';

/** @typedef {import('./ws-client.js').WsClient} WsClient */

export class Matchmaking {
    /** @param {WsClient} ws */
    constructor(ws) {
        this.ws = ws;
    }

    /**
     * Send QuickMatch and resolve with the RoomJoined payload (or reject
     * on Error). Multiplexes on the EventTarget — only the next room_joined
     * or error_msg fires the resolution.
     *
     * @returns {Promise<object>}
     */
    quickMatch() {
        return this._oneShot(() => this.ws.sendQuickMatch());
    }

    /** @param {string} name @param {boolean} isPublic @param {number} maxPlayers */
    createRoom(name, isPublic, maxPlayers) {
        return this._oneShot(() =>
            this.ws.sendCreateRoom(name, isPublic, maxPlayers),
        );
    }

    /** @param {string} code */
    joinByCode(code) {
        return this._oneShot(() => this.ws.sendJoinByCode(code));
    }

    /** @returns {Promise<{rooms: object[]}>} */
    browse() {
        return new Promise((resolve, reject) => {
            const onList = (e) => {
                cleanup();
                resolve(e.detail);
            };
            const onErr = (e) => {
                cleanup();
                reject(new Error(`browse failed: ${e.detail.msg}`));
            };
            const cleanup = () => {
                this.ws.removeEventListener('room_list', onList);
                this.ws.removeEventListener('error_msg', onErr);
            };
            this.ws.addEventListener('room_list', onList, { once: true });
            this.ws.addEventListener('error_msg', onErr, { once: true });
            this.ws.sendBrowse();
        });
    }

    leave() {
        return new Promise((resolve) => {
            const onLeft = () => {
                this.ws.removeEventListener('room_left', onLeft);
                resolve();
            };
            this.ws.addEventListener('room_left', onLeft, { once: true });
            this.ws.sendLeaveRoom();
            // Be lenient — server may have closed before our LeaveRoom arrived.
            setTimeout(() => {
                this.ws.removeEventListener('room_left', onLeft);
                resolve();
            }, 1000);
        });
    }

    _oneShot(send) {
        return new Promise((resolve, reject) => {
            const onJoined = (e) => {
                cleanup();
                resolve(e.detail);
            };
            const onErr = (e) => {
                cleanup();
                reject(new Error(`${e.detail.code}: ${e.detail.msg}`));
            };
            const onVersion = () => {
                cleanup();
                reject(new Error('version mismatch — please update'));
            };
            const cleanup = () => {
                this.ws.removeEventListener('room_joined', onJoined);
                this.ws.removeEventListener('error_msg', onErr);
                this.ws.removeEventListener('version_mismatch', onVersion);
            };
            this.ws.addEventListener('room_joined', onJoined, { once: true });
            this.ws.addEventListener('error_msg', onErr, { once: true });
            this.ws.addEventListener('version_mismatch', onVersion, { once: true });
            send();
        });
    }
}
