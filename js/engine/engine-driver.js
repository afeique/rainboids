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
//                 ping/pong + reconnect-by-session under the hood), AND
//                 it owns a `Predictor` for the local ship + an
//                 `Interpolator` for remote peers. The driver is the only
//                 component that knows about the network — the rest of
//                 the engine reads `getLocalShipState()` /
//                 `sampleRemoteShips()` for rendering and calls `tick()`
//                 once per 60 Hz logic step to advance prediction +
//                 forward inputs to the server.
//
// ── MVD scope (Phase 3 wiring, 2026-05-13) ──────────────────────────────
// "Minimum-Viable Demo" of multiplayer covers SHIP MOVEMENT ONLY:
//   - The local player's ship is server-authoritative + locally predicted.
//     `Predictor` extrapolates the ship one tick per `tick()` call,
//     buffers pending inputs, and reconciles when an authoritative
//     snapshot arrives. Divergence snaps to the server's replay (server
//     wins, as it must in an authoritative-server topology).
//   - Remote players' ships are interpolated from server snapshots via
//     `Interpolator` with a 100 ms render-delay window.
//
// What is NOT wired in MVD (intentional — these need their own slices):
//   - Enemies / asteroids / drops over the wire (the Interpolator
//     internally lerps them, but the driver passes through only `ships`
//     so they stay simulated locally for now).
//   - Bullets, collisions, weapons, powerups over the wire.
//   - Outbound action events (shoot, ability use) — `tick()` packs
//     buttons into the PackedInput byte, but the server side that
//     authoritatively processes them is also out of scope for MVD.
//   - Renderer integration. The driver exposes `getLocalShipState()` and
//     `sampleRemoteShips(nowMs)` for the renderer to call when MP-mode
//     rendering is wired up; the renderer itself isn't touched yet.
//
// ── External tick driver ────────────────────────────────────────────────
// The driver does NOT own a tick loop. Solo gameplay runs through
// `GameEngine.gameLoop()`, and we don't want to fork that for MP. Instead,
// the engine driver exposes a public `tick(input, dt)` method that the
// caller (eventually `GameEngine`) invokes once per 60 Hz logic step.
// In solo mode `tick()` is a no-op so the same call site works in both
// modes; in MP mode it packs the input, sends it to the server, and
// advances the local predictor.

import { OnlineStatusOverlay } from './online-status-overlay.js';
import { Predictor } from '../net/prediction.js';
import { Interpolator } from '../net/interpolation.js';
import { pack as packInput, emptyPlayerInput } from '../sim/input.js';

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
     * @param {{
     *   Overlay?: typeof OnlineStatusOverlay,
     *   document?: Document,
     *   Predictor?: typeof Predictor,
     *   Interpolator?: typeof Interpolator,
     *   renderDelayMs?: number,
     *   dt?: number,
     *   now?: () => number,
     * }} [opts.deps]
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

        // ── Online-mode dependencies (injectable for tests) ──────────────
        // Solo mode never constructs these — the references stay null. We
        // store the *classes* here so `startOnline` can instantiate them
        // fresh per session (a Predictor's pending-input buffer must not
        // bleed across runs).
        this._PredictorCtor = deps.Predictor ?? Predictor;
        this._InterpolatorCtor = deps.Interpolator ?? Interpolator;
        // 100 ms is the canonical render-delay window for 20 Hz snapshots
        // — enough headroom for one dropped packet without feeling laggy.
        // Matches `Interpolator`'s built-in default; override only for
        // bandwidth-constrained tests.
        this._renderDelayMs = deps.renderDelayMs ?? 100;
        // 60 Hz logic tick → 1/60 s per tick. Passed straight through to
        // the predictor's physics callback; `js/sim/ship.js::updateShip`
        // currently ignores `dt`, but the slot is plumbed for forward
        // compat (Fxp migration or variable-rate clients).
        this._dt = deps.dt ?? (1 / 60);
        // Clock source for sample-time anchoring. Defaults to
        // `performance.now()` in the browser; tests inject a fake clock.
        this._now = deps.now ?? (() => (
            typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now()
        ));

        /** @type {Predictor|null} */
        this.predictor = null;
        /** @type {Interpolator|null} */
        this.interpolator = null;

        // ── MVD diagnostics ──────────────────────────────────────────────
        // These counters give the renderer / overlay something to surface
        // without having to reach inside the predictor + interpolator each
        // frame. Solo mode never increments them.
        this._snapshotsReceived = 0;
        this._inputsSent = 0;
        // Tracks the most-recent server-time-of-receipt for the latest
        // snapshot, so `sampleRemoteShips()` can compute a sensible default
        // render-clock without the caller having to pass `nowMs` every
        // frame.
        this._latestSnapshotRecvTime = null;
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
     * The MVD wiring (2026-05-13) also constructs a fresh `Predictor` and
     * `Interpolator` for this session, and subscribes the connection's
     * `snapshot` event to feed them. The GameEngine call is unchanged —
     * the "solo and multiplayer run identically" property still holds at
     * the simulation level; the driver layers prediction + interpolation
     * on top.
     *
     * @param {{ connection: ConnectionTaskLike, welcome: WelcomePayload, baselineShip?: object }} opts
     *   `baselineShip` is the local ship's starting state (matching the
     *   `ShipState` shape in `js/sim/state.js`). If omitted the predictor
     *   waits for the first server snapshot to anchor its baseline — fine
     *   for MVD, since the server's first snapshot arrives within ~50 ms
     *   of RoomJoined.
     * @returns {boolean}
     */
    startOnline({ connection, welcome, baselineShip = null }) {
        if (!connection) throw new TypeError('startOnline: connection is required');
        if (!welcome) throw new TypeError('startOnline: welcome is required');

        this._teardownConnection();
        this.mode = ENGINE_MODE_ONLINE;
        this.connection = connection;
        this.welcome = welcome;

        // ── Prediction + interpolation pipelines ─────────────────────────
        // Predictor owns the local ship; Interpolator owns the rest. Both
        // are session-scoped (cleared on quit / disconnect) so a second
        // MP run gets a fresh state machine.
        this.predictor = new this._PredictorCtor({ dt: this._dt });
        this.interpolator = new this._InterpolatorCtor({
            renderDelayMs: this._renderDelayMs,
        });
        if (baselineShip) {
            // The server's RoomJoined payload doesn't yet include a ship
            // baseline (Week 7 scope). When MVD wiring matures we'll
            // populate this from the welcome+RoomJoined flow; for now the
            // caller may pass it explicitly so tests can pin behavior.
            this.predictor.setBaseline(baselineShip, 0);
        }

        // Subscribe for terminal events. ConnectionTask emits 'disconnect'
        // both on user-requested close AND on socket drop; we need to
        // distinguish so we only show the toast for the latter.
        this._connListeners.push(
            connection.on('disconnect', () => this._handleDisconnect()),
        );

        // Snapshot ingestion. ConnectionTask emits `snapshot` whenever a
        // decoded SnapshotPayload lands (see `js/net/ws-client.js`).
        this._connListeners.push(
            connection.on('snapshot', (frame) => this._onSnapshot(frame)),
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
     * Advance the engine one logic tick. Called by the host gameLoop at
     * 60 Hz. In SOLO mode this is a no-op so the call site is the same in
     * both modes; in ONLINE mode it:
     *
     *   1. Builds a `PlayerInput` snapshot from `input` (the engine's
     *      existing input handler shape) and packs it into the wire
     *      `PackedInput` byte form.
     *   2. Sends `ClientMsg::Input { tick, packed }` to the server via the
     *      Connection (best-effort; a send failure logs but does not
     *      crash the loop — the predictor still advances locally so the
     *      player keeps moving).
     *   3. Calls `Predictor.applyLocalInput(simInput)` to advance the
     *      locally-predicted ship one tick.
     *
     * `simInput` is the simulation-friendly `InputFrame` shape
     * (`js/sim/state.js`) — directional booleans + absolute world aim +
     * the powerup-derived physics knobs. The caller must supply this
     * directly; the driver does not synthesize physics constants on its
     * own (those live on the engine side).
     *
     * @param {object} simInput   InputFrame shape (see js/sim/state.js)
     * @param {{moveX:number, moveY:number, aimX:number, aimY:number,
     *          shoot?:boolean, dash?:boolean, ability1?:boolean,
     *          ability2?:boolean}} [wireInput]
     *   Optional normalized PlayerInput for the wire — if omitted, we
     *   derive a reasonable approximation from `simInput` (directional
     *   booleans → unit-step axes; no fire buttons since MVD doesn't yet
     *   ship server-authoritative weapons).
     */
    tick(simInput, wireInput) {
        if (this.mode !== ENGINE_MODE_ONLINE) return;
        if (!this.predictor) return; // startOnline not yet called

        // ── Outbound: pack + send the wire input ─────────────────────────
        // We send BEFORE advancing prediction so the server gets the input
        // associated with the same tick we'd predict. The server's tick
        // counter and ours stay in lockstep modulo network delay; the
        // reconciliation path in `Predictor.onSnapshot` handles any drift.
        const player = wireInput ?? this._derivePlayerInput(simInput);
        const packed = packInput(player);
        const nextTick = (this.predictor.tick + 1) | 0;
        if (this.connection && typeof this.connection.sendInput === 'function') {
            try {
                this.connection.sendInput(nextTick, packed);
                this._inputsSent++;
            } catch (err) {
                // Best-effort: don't tear down on transient send failures
                // (closing socket, brief disconnect). The predictor still
                // advances locally so the player doesn't freeze.
                // eslint-disable-next-line no-console
                console.warn('[engine-driver] sendInput failed', err?.message ?? err);
            }
        }

        // ── Local prediction ─────────────────────────────────────────────
        // Predictor.applyLocalInput mutates `localShipState` in place;
        // renderer reads `getLocalShipState()` after `tick()` returns.
        this.predictor.applyLocalInput(simInput);
    }

    /**
     * Return the locally-predicted ship state for the local player. The
     * renderer should draw the local ship at this position (NOT the
     * server snapshot, NOT the interpolator's sample — those would feel
     * laggy because the local input round-trip is ~RTT/2).
     *
     * Returns null when no prediction is active (solo mode, or before
     * the first baseline is established).
     *
     * @returns {object|null}  ShipState shape, or null
     */
    getLocalShipState() {
        if (this.mode !== ENGINE_MODE_ONLINE) return null;
        if (!this.predictor) return null;
        return this.predictor.localShipState;
    }

    /**
     * Sample interpolated remote-player ship states for rendering this
     * frame. Returns an array of `ShipState`-shaped objects (one per
     * remote ship); the renderer should draw each at its `(x, y)` with
     * `angle` from the snapshot.
     *
     * The sample-time is `nowMs - renderDelayMs` by default (i.e. we
     * render ~100 ms in the past so the interpolator always has a future
     * snapshot to lerp toward). Tests pass an explicit `nowMs`; production
     * callers can rely on the default.
     *
     * @param {number} [nowMs]  optional clock override (defaults to the
     *                          driver's `now()` function, typically
     *                          `performance.now()`).
     * @returns {object[]}      array of remote ship states (possibly empty)
     */
    sampleRemoteShips(nowMs) {
        if (this.mode !== ENGINE_MODE_ONLINE) return [];
        if (!this.interpolator) return [];
        const t = (nowMs ?? this._now()) - this._renderDelayMs;
        const snap = this.interpolator.sample(t);
        if (!snap) return [];
        // The Interpolator's snapshot shape is `{ ships, enemies,
        // asteroids, drops }`. MVD scope is movement only → we only
        // return `ships`. Enemies / asteroids / drops are still
        // simulated locally for now.
        return Array.isArray(snap.ships) ? snap.ships : [];
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
        // Clear MP pipelines so a subsequent startOnline gets a fresh
        // Predictor + Interpolator (no stale pending inputs, no stale
        // snapshot buffer).
        this.predictor = null;
        this.interpolator = null;
        this._snapshotsReceived = 0;
        this._inputsSent = 0;
        this._latestSnapshotRecvTime = null;
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
        // MP pipelines are session-scoped — drop them so a future
        // startOnline starts fresh. (Note: we DON'T null the predictor
        // synchronously here if the renderer might still be mid-frame, but
        // for MVD the disconnect path goes through `gameLoop` boundaries
        // so this is safe.)
        this.predictor = null;
        this.interpolator = null;
        this._snapshotsReceived = 0;
        this._inputsSent = 0;
        this._latestSnapshotRecvTime = null;
    }

    /**
     * Snapshot dispatch. Splits the decoded payload into:
     *
     *   - The local player's ship state → `Predictor.onSnapshot` for
     *     reconciliation + replay.
     *   - Every other ship → `Interpolator.ingest` for render-time-shifted
     *     interpolation.
     *
     * The local player is identified by `welcome.playerId`. ShipState
     * uses bigint player ids on the wire (u64); we compare via string-key
     * to be precise about bigint vs Number coercion (`PlayerId` from the
     * welcome handshake is typed as bigint).
     *
     * @param {{
     *   tick: number,
     *   baseTick: number|null,
     *   payload: { ships: object[], enemies: object[], asteroids: object[], drops: object[] },
     *   recvTime: number
     * }} frame
     */
    _onSnapshot(frame) {
        if (this.mode !== ENGINE_MODE_ONLINE) return;
        if (!this.predictor || !this.interpolator) return;
        if (!frame || !frame.payload) return;

        const { tick, payload, recvTime } = frame;
        this._snapshotsReceived++;
        this._latestSnapshotRecvTime = recvTime;

        const localPlayerKey = idKey(this.welcome?.playerId);
        const localShip = (payload.ships ?? []).find(
            (s) => idKey(s.player) === localPlayerKey,
        ) ?? null;
        const remoteShips = (payload.ships ?? []).filter(
            (s) => idKey(s.player) !== localPlayerKey,
        );

        // Local: reconcile against the predictor.
        if (localShip) {
            this.predictor.onSnapshot(tick, localShip);
        }

        // Remote: ingest a ships-only snapshot. MVD scope strips enemies /
        // asteroids / drops so the interpolator only tracks remote-peer
        // positions. The Interpolator's `lerpSnapshot` handles missing
        // categories (treats them as empty arrays) so this is safe.
        this.interpolator.ingest(recvTime, {
            ships: remoteShips,
            enemies: [],
            asteroids: [],
            drops: [],
        });
    }

    /**
     * Best-effort PlayerInput derivation when the caller only has the
     * simulation-side InputFrame on hand. Directional booleans become
     * unit-step axes; the aim point becomes a unit vector (with `aimX/aimY`
     * normalized so the wire-side `pack()` encodes them as i16 in
     * [-32767, 32767]).
     *
     * This is intentionally lossy for MVD: shooting / dash / abilities
     * aren't yet authoritatively processed by the server, so the buttons
     * bitfield is left empty. As Phase 4+ lands, callers will pass an
     * explicit `wireInput` to `tick()` and this fallback won't run.
     *
     * @param {object} simInput
     * @returns {object}
     */
    _derivePlayerInput(simInput) {
        const player = emptyPlayerInput();
        if (!simInput) return player;

        // Movement axes from booleans.
        if (simInput.right) player.moveX += 1;
        if (simInput.left) player.moveX -= 1;
        if (simInput.down) player.moveY += 1;
        if (simInput.up) player.moveY -= 1;

        // Aim is a unit vector pointing from the ship to the aim point.
        // We don't know the ship's current position here, but we can
        // approximate by treating `aimX, aimY` as already-relative coords
        // when both are small (test-only path) and otherwise normalize
        // the absolute aim point against the typical field-center. Either
        // way the wire encodes a unit direction, so we just need the sign
        // + magnitude ratio to be right.
        const ax = Number(simInput.aimX) || 0;
        const ay = Number(simInput.aimY) || 0;
        const mag = Math.hypot(ax, ay);
        if (mag > 1e-6) {
            player.aimX = ax / mag;
            player.aimY = ay / mag;
        }

        return player;
    }
}

/**
 * Stable key for an entity id that may be a bigint or Number. Comparing
 * bigint to Number with `===` always returns false, so we normalize to
 * a string for cross-type equality. The wire shape uses bigint for u64
 * `PlayerId` while solo tests typically pass Numbers — this lets both
 * paths compare cleanly.
 */
function idKey(v) {
    if (v == null) return 'null';
    if (typeof v === 'bigint') return v.toString();
    return String(v);
}
