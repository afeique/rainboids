// EngineDriver — mode-aware adapter that wraps GameEngine.
//
// The whole point of this class is the property:
//   "solo and multiplayer runs are identical".
// Both modes route through the same `GameEngine` instance — same
// simulation, same renderer, same audio, same input. The only thing
// the driver toggles is whether a `ConnectionTask` is held open in
// the background.
//
// In solo mode:   no network at all.
// In online mode: the driver owns a `ConnectionTask` (transferred from
//                 the multiplayer modal post-Welcome). It keeps the
//                 socket alive (the existing ConnectionTask handles
//                 ping/pong + reconnect-by-session under the hood).
//
// Once the simulation is extracted into `js/sim/` (Phase 1 of the
// multiplayer plan), the online path will additionally feed snapshots
// into a Predictor + Interpolator so peers and server-authoritative
// entities show up. For now, online == solo + a live socket; this is
// the rolling architecture per the planning doc, not a placeholder.

import { OnlineStatusOverlay } from './online-status-overlay.js';

/**
 * @typedef {Object} WelcomePayload
 * @property {bigint|number} playerId
 * @property {string} session    - canonical UUID string
 * @property {bigint|number} serverTimeMs
 */

/**
 * @typedef {{
 *   on(event: string, fn: Function): Function,
 *   disconnect(): void,
 *   playerId: bigint|number|null,
 *   session: string|null,
 *   state: string,
 * }} ConnectionTaskLike
 */

export const ENGINE_MODE_SOLO = 'solo';
export const ENGINE_MODE_ONLINE = 'online';

export class EngineDriver {
    /**
     * @param {object} opts
     * @param {object} opts.gameEngine
     * @param {{ Overlay?: typeof OnlineStatusOverlay, document?: Document }} [opts.deps]
     */
    constructor({ gameEngine, deps = {} }) {
        if (!gameEngine) throw new TypeError('EngineDriver: gameEngine is required');
        this.gameEngine = gameEngine;
        this.mode = ENGINE_MODE_SOLO;
        /** @type {ConnectionTaskLike|null} */
        this.connection = null;
        /** @type {WelcomePayload|null} */
        this.welcome = null;
        this._connListeners = []; // unsubscribe fns

        // Status overlay is DOM-only and lives outside the canvas; injecting
        // a custom Overlay class makes the driver testable in jsdom.
        const Overlay = deps.Overlay ?? OnlineStatusOverlay;
        this._overlay = typeof document !== 'undefined' ? new Overlay({ document: deps.document }) : null;
    }

    /** True when the driver is currently running an online session. */
    get isOnline() {
        return this.mode === ENGINE_MODE_ONLINE;
    }

    /**
     * Begin a solo run. `continueRun=true` resumes the saved game; otherwise
     * starts a new one. Identical to clicking NEW GAME / CONTINUE on the
     * title screen — the driver is a thin pass-through.
     *
     * @param {{ continueRun?: boolean, animateTitleStart?: boolean }} [opts]
     * @returns {boolean} true if the run actually launched
     */
    startSolo({ continueRun = false, animateTitleStart = true } = {}) {
        this._teardownConnection();
        this.mode = ENGINE_MODE_SOLO;

        const ge = this.gameEngine;
        const start = continueRun && ge.hasSavedRun?.()
            ? () => ge.startContinueRun?.()
            : () => ge.startNewRun?.();

        if (animateTitleStart && typeof ge.triggerTitleStart === 'function') {
            const launched = ge.triggerTitleStart(start);
            if (!launched) start();
            return true;
        }
        start();
        return true;
    }

    /**
     * Begin an online run. The caller (multiplayer-modal → main.js) hands
     * over an already-Welcomed `ConnectionTask`; the driver takes over its
     * lifetime — pings stay alive, disconnect events surface here.
     *
     * Today this still runs the existing GameEngine logic locally because
     * the simulation isn't yet extracted into js/sim/. As that work lands
     * (planning doc Phase 1), this method will additionally wire a
     * `Predictor` for the local ship and feed server snapshots into an
     * `Interpolator` for remote peers. The code shape here doesn't have to
     * change — only the pieces it composes.
     *
     * @param {{ connection: ConnectionTaskLike, welcome: WelcomePayload }} opts
     * @returns {boolean}
     */
    startOnline({ connection, welcome }) {
        if (!connection) throw new TypeError('startOnline: connection is required');
        if (!welcome) throw new TypeError('startOnline: welcome is required');

        this._teardownConnection();
        this.mode = ENGINE_MODE_ONLINE;
        this.connection = connection;
        this.welcome = welcome;

        // Subscribe for terminal events. ConnectionTask emits 'disconnect'
        // both on user-requested close AND on socket drop; we need to
        // distinguish so we only show the toast for the latter.
        this._connListeners.push(
            connection.on('disconnect', () => this._handleDisconnect()),
        );

        if (this._overlay) {
            this._overlay.show({
                playerId: welcome.playerId,
                session: welcome.session,
            });
        }

        // Run the same way solo does. As Phase 1 lands, the driver may
        // additionally feed inputs into a Predictor here, but the
        // GameEngine.startNewRun() call stays — that's the "identical"
        // promise.
        const ge = this.gameEngine;
        if (typeof ge.triggerTitleStart === 'function') {
            const launched = ge.triggerTitleStart(() => ge.startNewRun?.());
            if (!launched) ge.startNewRun?.();
        } else {
            ge.startNewRun?.();
        }
        return true;
    }

    /**
     * Stop the current run and tear down any network connection. Called
     * from the game-engine's "quit to title" path. Safe to call multiple
     * times; idempotent.
     */
    quit() {
        this._teardownConnection();
        this.mode = ENGINE_MODE_SOLO;
        if (this._overlay) this._overlay.hide();
    }

    /* ─── internals ──────────────────────────────────────────────────── */

    _teardownConnection() {
        for (const off of this._connListeners) {
            try { off(); } catch {}
        }
        this._connListeners = [];
        if (this.connection) {
            try { this.connection.disconnect(); } catch {}
        }
        this.connection = null;
        this.welcome = null;
    }

    _handleDisconnect() {
        if (this.mode !== ENGINE_MODE_ONLINE) return;
        // Connection dropped after gameplay started. Surface to the overlay
        // and downgrade the mode flag. The game continues running solo —
        // the player keeps their ship, score, etc.; we just lose any future
        // server-driven state. This is the most graceful failure mode for
        // a v1 multiplayer build where the network layer is mostly
        // background scaffolding anyway.
        if (this._overlay) this._overlay.showDisconnected();
        this.mode = ENGINE_MODE_SOLO;
        this.connection = null;
        this.welcome = null;
        // listeners already fired; clear them so we don't try to unsubscribe
        // a closed task again.
        this._connListeners = [];
    }
}
