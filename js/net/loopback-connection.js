// js/net/loopback-connection.js — in-process counterpart to `ConnectionTask`.
//
// PURPOSE — Hybrid Solo↔MP unification (Phase 1 scaffold):
//
//   `LoopbackConnection` implements the same event-emitter API surface as
//   `js/net/ws-client.js::ConnectionTask`, but runs the game simulation
//   in-process instead of going over a WebSocket. This lets the engine
//   driver's `startOnline({ connection, welcome, baselineShip })` path
//   run solo mode through the EXACT same code as actual multiplayer —
//   solo and online share `Predictor` + `Interpolator` + snapshot dispatch,
//   with the only difference being where the snapshot bytes come from.
//
//   On the wire, the Rust server emits `S2C.SNAPSHOT { tick, baseTick,
//   payload: { ships, enemies, asteroids, drops, enemy_bullets } }` every
//   50 ms. This class synthesizes that frame locally by advancing a
//   single-ship sim step (`js/sim/ship.js::updateShip`) per 50 ms tick and
//   emitting the same `snapshot` event the real connection emits.
//
// SCOPE (Phase 1, scaffold only):
//
//   • Event-emitter surface that mirrors `ConnectionTask` byte-for-byte
//     (`on(event, fn) → unsubscribe`, `_emit(event, payload)`).
//   • Lifecycle: `start()` emits `welcome`, then drives a `setInterval`
//     tick loop at 20 Hz that emits synthetic `snapshot` frames.
//   • `disconnect()` stops the loop and emits `disconnect`.
//   • `sendInput(packedInput)` queues input for the next tick. Phase 1
//     accepts plain `InputFrame`-shaped objects directly (see "Input
//     shape" below); decoding a wire `PackedInput` Uint8Array is Phase 2.
//
//   NOT IN SCOPE for Phase 1 (Phase 2 will wire these in):
//   • Engine-driver integration — this class is API-compatible but the
//     driver still gets a real `ConnectionTask` today.
//   • Game-engine integration — enemies / asteroids / drops are empty
//     arrays in the synthetic snapshot. Only ship sync.
//   • PackedInput Uint8Array decode path — see `sendInput()` docs.
//
// API CONTRACT (subset of `ConnectionTask` that `engine-driver.js` uses):
//
//   • `on(event, fn) → unsubscribe`
//   • `disconnect()`
//   • `sendInput(packedInput)` — note: engine-driver calls this with
//     `(tick, packed)` two-arg form on the real ConnectionTask; the
//     scaffold uses the simpler one-arg form documented in the Phase 1
//     spec. Phase 2 reconciles the signatures.
//   • Property accessors: `isConnected`, `playerId`.
//
//   Events emitted: `welcome`, `disconnect`, `snapshot`. (No `frame`,
//   `error_msg`, `room_list`, `room_joined`, `room_left`, `peer_joined`,
//   `peer_left` — those are network-layer concerns the loopback path
//   doesn't model. Subscribing to them is a no-op, matching the
//   ConnectionTask convention.)

import { updateShip } from '../sim/ship.js';

/**
 * 20 Hz tick = 50 ms per step. Matches the server's snapshot cadence
 * (`server/src/sim/loop.rs`). Keeping the same dt as the wire path
 * means the predictor / interpolator see the same per-tick deltas in
 * loopback mode as they would over a real socket.
 */
export const LOOPBACK_TICK_HZ = 20;
export const LOOPBACK_TICK_MS = 1000 / LOOPBACK_TICK_HZ; // 50

/** dt used for the ship physics step. `updateShip` currently ignores dt
 *  (per-tick deltas baked into thrustPower/friction), but the slot is
 *  plumbed for forward compatibility. We use 0.05 to match the server
 *  tick rate; the test suite verifies the contract, not this constant. */
export const LOOPBACK_DT = LOOPBACK_TICK_MS / 1000; // 0.05

/**
 * Default ship-physics constants used when the caller's `sendInput`
 * payload doesn't supply them. These mirror the `freshShipState` /
 * Predictor defaults so a single-ship loopback sim behaves like the
 * solo `Player.update()` step. The numbers come from the canonical
 * GAME_CONFIG values in `js/modules/config.js` (TICK_SCALE = 30/60):
 *
 *   thrustPower = 2.0 * 0.5            = 1.0
 *   friction    = Math.pow(0.5, 0.5)   ≈ 0.7071067811865476
 *   maxV        = 7   * 0.5            = 3.5
 *   velEpsilon  = 0.05
 *   bounceDamp  = 0.8
 *
 * Keeping them as module-level constants (vs. importing from config.js)
 * keeps the scaffold dependency-free; the wiring session can swap to a
 * GAME_CONFIG passthrough if those values drift.
 */
const DEFAULT_PHYSICS = Object.freeze({
    thrustPower: 1.0,
    speedMult: 1,
    thrustersDisabled: false,
    maxV: 3.5,
    friction: 0.7071067811865476,
    velEpsilon: 0.05,
    bounceDamp: 0.8,
});

/**
 * In-process counterpart to `ConnectionTask`. Behaves like a Welcomed
 * WebSocket connection for the engine driver — emits `welcome` once,
 * then `snapshot` every 50 ms, and `disconnect` on teardown.
 *
 * @example
 *     const loop = new LoopbackConnection({ playerId: 1 });
 *     loop.on('welcome',  ({ playerId, session }) => console.log('welcomed', playerId));
 *     loop.on('snapshot', ({ tick, payload }) => render(payload.ships));
 *     loop.start();
 *     // … later …
 *     loop.disconnect();
 */
export class LoopbackConnection {
    /**
     * @param {object} [opts]
     * @param {number|bigint} [opts.playerId=1]         logical player id; emitted in `welcome`
     * @param {string}        [opts.sessionId='loopback'] surfaced as `session` in `welcome`
     * @param {number|bigint} [opts.serverTimeMs]       initial clock; defaults to `Date.now()`
     * @param {object}        [opts.baselineShip]       optional initial ship state
     * @param {Function}      [opts.setInterval]        injectable scheduler (tests)
     * @param {Function}      [opts.clearInterval]      injectable canceller (tests)
     * @param {Function}      [opts.now]                injectable clock for `recvTime` stamps
     */
    constructor({
        playerId = 1,
        sessionId = 'loopback',
        serverTimeMs = Date.now(),
        baselineShip = null,
        setInterval: setIntervalImpl,
        clearInterval: clearIntervalImpl,
        now,
    } = {}) {
        this._playerId = playerId;
        this.session = sessionId;
        this.serverTimeMs = serverTimeMs;

        // Injectable timer hooks. We default to globalThis at call time so
        // jest `useFakeTimers()` patching takes effect even if it ran after
        // construction. Production code never sets these; the test suite
        // uses them for deterministic loops.
        this._setInterval = setIntervalImpl ?? null;
        this._clearInterval = clearIntervalImpl ?? null;
        this._now = now ?? null;

        // ── Event-emitter shim ───────────────────────────────────────────
        // Same shape as `ConnectionTask._listeners` (event → Set<fn>).
        // Kept inline (no shared mixin) to mirror the reference class
        // byte-for-byte — see ws-client.js around line 150.
        this._listeners = new Map();

        // ── Connection state ─────────────────────────────────────────────
        // `'idle' | 'open' | 'closed'`. The real ConnectionTask also has
        // `'connecting'` and `'welcomed'`, but loopback collapses both
        // into `'open'` since there's no async handshake.
        this.state = 'idle';
        this._intervalHandle = null;

        // ── Sim state ────────────────────────────────────────────────────
        // Single ship for now. Phase 2 may extend to enemies / asteroids /
        // drops; for the scaffold we keep them as fixed empty arrays so
        // the snapshot shape matches the wire payload.
        // The `field` is required by `updateShip`'s boundary-bounce path;
        // we use the same 1920×1080 default as `freshShipState`.
        this._field = { width: 1920, height: 1080 };
        this._ship = baselineShip ? this._cloneShip(baselineShip) : this._defaultShip();

        // ── Tick state ───────────────────────────────────────────────────
        // `_tick` increments by 1 each emission, matching the server's
        // monotonic snapshot tick. `_baseTick` mirrors the wire field
        // (server uses it for delta-encoded snapshots; loopback always
        // emits full state so we set it to 0).
        this._tick = 0;
        this._baseTick = 0;
        this._pendingInputs = [];
    }

    // ── Property accessors ───────────────────────────────────────────────

    /**
     * Whether the loopback is actively ticking. Mirrors the spirit of
     * `ConnectionTask.state === 'welcomed'` — the engine driver treats
     * this as "the session is live".
     */
    get isConnected() {
        return this.state === 'open';
    }

    /** Player id of the local ship. Set at construction time. */
    get playerId() {
        return this._playerId;
    }

    // ── Event emitter ────────────────────────────────────────────────────

    /**
     * Subscribe to an event. Returns an unsubscribe fn.
     * Mirrors `ConnectionTask.on` exactly. Subscribing to an event the
     * loopback never emits is harmless — the listener simply never fires.
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

    /**
     * Emit an event to all subscribers. Each listener is wrapped in an
     * isolated try/catch so one throwing handler can't break the others
     * — same convention as `ConnectionTask._emit`.
     */
    _emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) {
            try {
                fn(payload);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error(`LoopbackConnection: listener for "${event}" threw`, err);
            }
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    /**
     * Begin the loopback "session". Idempotent — calling start twice is
     * a no-op past the first call.
     *
     * Order of operations:
     *   1. Flip state → 'open'.
     *   2. Schedule the welcome emission via `queueMicrotask` so the
     *      caller has a chance to subscribe AFTER `new LoopbackConnection
     *      (...)` but BEFORE the welcome fires. (Synchronous emission at
     *      this point would fire before the caller's `on('welcome', ...)`
     *      registration in the canonical "subscribe-then-start" pattern.)
     *   3. Start the 50 ms tick interval. Each tick advances ship
     *      physics with any queued input and emits a `snapshot` frame.
     */
    start() {
        if (this.state === 'open') return;
        if (this.state === 'closed') return; // Idempotent — disconnected loopbacks stay disconnected.

        this.state = 'open';

        // Resolve the scheduler at start-time so jest fake-timers patches
        // (which replace globalThis.setInterval) are respected even if
        // they're installed between construction and start.
        const setIntervalImpl = this._setInterval ?? globalThis.setInterval;
        // Welcome via microtask so subscribers registered after `new`
        // but before the next macrotask receive the event.
        queueMicrotask(() => {
            // Guard against disconnect-before-welcome: if the caller
            // disconnects synchronously between start() and the microtask
            // running, we must not emit welcome after a disconnect.
            if (this.state !== 'open') return;
            this._emit('welcome', {
                playerId: this._playerId,
                session: this.session,
                serverTimeMs: this.serverTimeMs,
            });
        });

        this._intervalHandle = setIntervalImpl(() => this._onTick(), LOOPBACK_TICK_MS);
    }

    /**
     * Stop the loopback session. Idempotent. Emits a final `disconnect`
     * event with an empty payload (matches the shape ConnectionTask uses
     * for clean closes).
     */
    disconnect() {
        if (this.state === 'closed') return;
        if (this.state === 'idle') {
            // Never started; just mark closed without emitting disconnect
            // — there's nothing to disconnect from. Matches
            // `ConnectionTask.disconnect()` early-return for idle state.
            this.state = 'closed';
            return;
        }
        this.state = 'closed';
        if (this._intervalHandle != null) {
            const clearIntervalImpl = this._clearInterval ?? globalThis.clearInterval;
            clearIntervalImpl(this._intervalHandle);
            this._intervalHandle = null;
        }
        this._emit('disconnect', {});
    }

    // ── Input ────────────────────────────────────────────────────────────

    /**
     * Queue an input frame to be applied on the next tick.
     *
     * INPUT SHAPE (Phase 1 scaffold):
     *
     *   The real `ConnectionTask.sendInput(tick, packed)` accepts a
     *   PackedInput wire struct (`{ moveX:i8, moveY:i8, aimX:i16,
     *   aimY:i16, buttons:u8 }`) — the byte-form documented in
     *   `js/sim/input.js`. The loopback scaffold accepts a SUPERSET of
     *   shapes and normalizes internally:
     *
     *     1. An InputFrame plain object (preferred): the shape
     *        `updateShip` already consumes — `{up, down, left, right,
     *         aimX, aimY, thrustPower, speedMult, friction, ...}`.
     *        Used as-is.
     *
     *     2. A PackedInput plain object (interop): `{moveX, moveY,
     *         aimX, aimY, buttons}`. Converted to InputFrame via a
     *        lightweight signed-axis → directional-boolean mapping.
     *        The physics constants (`thrustPower`, `friction`, etc.)
     *        come from `DEFAULT_PHYSICS`.
     *
     *     3. A `Uint8Array` (true wire form): NOT decoded in Phase 1.
     *        Phase 2 will route through `js/sim/protocol-generated.js`'s
     *        decoder. Today we accept and ignore (no crash) so engine-
     *        driver integration can land without changing call sites.
     *
     *   The engine-driver currently calls `sendInput(tick, packed)` with
     *   two args; we accept either `sendInput(input)` or `sendInput(_, input)`
     *   to keep both call sites working during the Phase 1↔2 transition.
     *
     * @param {object|Uint8Array} packedInputOrTick
     * @param {object|Uint8Array} [maybePacked]
     */
    sendInput(packedInputOrTick, maybePacked) {
        // Engine-driver shape: sendInput(tick, packed) → second arg.
        // Scaffold shape: sendInput(input) → first arg.
        // We pick whichever arg looks like an object/Uint8Array.
        let raw = maybePacked ?? packedInputOrTick;
        if (raw == null) return;

        // Uint8Array wire bytes — Phase 1 scope explicitly skips decode.
        // The slot is wired so Phase 2 can drop in a real decoder without
        // breaking call sites. Accept silently for now.
        if (raw instanceof Uint8Array) {
            // TODO(Phase 2): decode via protocol-generated.js
            return;
        }

        if (typeof raw !== 'object') return;

        const normalized = this._normalizeInput(raw);
        if (normalized) this._pendingInputs.push(normalized);
    }

    // ── Internals ────────────────────────────────────────────────────────

    /**
     * Single tick step. Drains pending inputs, advances ship physics,
     * emits a synthetic snapshot.
     */
    _onTick() {
        if (this.state !== 'open') return;

        // Apply queued inputs in order. The engine driver typically sends
        // one input per logic tick at 60 Hz, so we'll see ~3 inputs per
        // 50 ms snapshot tick. The pure step is idempotent enough that
        // applying them all in order produces a sensible aggregate
        // position; precise per-input granularity is a Phase 2 concern
        // (the predictor will handle sub-tick reconciliation when wired).
        const inputs = this._pendingInputs;
        this._pendingInputs = [];
        for (const input of inputs) {
            updateShip(this._ship, input, LOOPBACK_DT, null, null);
        }
        // If there were no inputs this tick, still run a no-op step so
        // friction / boundary effects converge (matches the wire path
        // where the server steps the ship every tick regardless).
        if (inputs.length === 0) {
            updateShip(this._ship, this._idleInput(), LOOPBACK_DT, null, null);
        }

        this._tick = (this._tick + 1) | 0;

        const recvTime = (this._now ?? (() => Date.now()))();

        this._emit('snapshot', {
            tick: this._tick,
            baseTick: this._baseTick,
            payload: {
                ships: [this._snapshotShip()],
                enemies: [],
                asteroids: [],
                drops: [],
                enemy_bullets: [],
            },
            recvTime,
        });
    }

    /**
     * Build the wire-shaped ship object embedded in the snapshot. We
     * trim to the fields documented in the Phase 1 spec — the
     * `engine-driver._onSnapshot` path only reads `(player, x, y, vx,
     * vy, angle, hp)` for the predictor, so extra fields are dropped
     * to keep the synthetic payload narrow and self-documenting.
     *
     * Note: the field is `id` per the spec, but ConnectionTask emits
     * `player` (matching the server's `ShipState`). We emit both so
     * either consumer is happy during the Phase 1↔2 transition.
     */
    _snapshotShip() {
        return {
            id: this._playerId,
            player: this._playerId,
            x: this._ship.x,
            y: this._ship.y,
            vx: this._ship.vx,
            vy: this._ship.vy,
            angle: this._ship.angle,
            hp: this._ship.hp,
        };
    }

    /** Default ship at field-center, facing east, 100 HP. */
    _defaultShip() {
        return {
            player: this._playerId,
            x: 400,
            y: 300,
            vx: 0,
            vy: 0,
            angle: 0,
            hp: 100,
            maxHp: 100,
            shield: 0,
            radius: 15,
            field: this._field,
            active: true,
        };
    }

    /** Shallow-clone of a caller-supplied baseline ship; fills in missing
     *  fields with defaults so `updateShip` never sees `undefined`. */
    _cloneShip(src) {
        const def = this._defaultShip();
        return {
            ...def,
            ...src,
            // Force-include the field reference so boundary bounce works
            // even when the caller's baseline omits it.
            field: src.field ?? def.field,
        };
    }

    /**
     * No-input frame used on idle ticks. Pre-built from DEFAULT_PHYSICS
     * with all direction booleans false and aim straight east of the
     * ship — `updateShip` will compute angle=0 with this aim, and the
     * isMoving guard short-circuits the velocity integration.
     */
    _idleInput() {
        return {
            up: false,
            down: false,
            left: false,
            right: false,
            aimX: this._ship.x + 100,
            aimY: this._ship.y,
            ...DEFAULT_PHYSICS,
        };
    }

    /**
     * Coerce caller input into the InputFrame shape `updateShip` expects.
     * If the caller already passed an InputFrame, we just inject the
     * default physics constants for any missing fields.
     */
    _normalizeInput(raw) {
        // Detect InputFrame: presence of `up/down/left/right` booleans.
        const looksLikeInputFrame =
            'up' in raw || 'down' in raw || 'left' in raw || 'right' in raw;

        if (looksLikeInputFrame) {
            return {
                up: !!raw.up,
                down: !!raw.down,
                left: !!raw.left,
                right: !!raw.right,
                aimX: raw.aimX ?? this._ship.x + 100,
                aimY: raw.aimY ?? this._ship.y,
                thrustPower: raw.thrustPower ?? DEFAULT_PHYSICS.thrustPower,
                speedMult: raw.speedMult ?? DEFAULT_PHYSICS.speedMult,
                thrustersDisabled: raw.thrustersDisabled ?? DEFAULT_PHYSICS.thrustersDisabled,
                maxV: raw.maxV ?? DEFAULT_PHYSICS.maxV,
                friction: raw.friction ?? DEFAULT_PHYSICS.friction,
                velEpsilon: raw.velEpsilon ?? DEFAULT_PHYSICS.velEpsilon,
                bounceDamp: raw.bounceDamp ?? DEFAULT_PHYSICS.bounceDamp,
            };
        }

        // PackedInput-ish shape: signed axes → directional booleans. We
        // accept either i8-scaled (`moveX` in [-127, 127]) or unit-scaled
        // (`moveX` in [-1, 1]) values — the comparison is just "nonzero?".
        const mx = raw.moveX ?? raw.ax ?? 0;
        const my = raw.moveY ?? raw.ay ?? 0;
        return {
            left: mx < 0,
            right: mx > 0,
            up: my < 0,
            down: my > 0,
            aimX: raw.aimX != null ? raw.aimX : this._ship.x + 100,
            aimY: raw.aimY != null ? raw.aimY : this._ship.y,
            ...DEFAULT_PHYSICS,
        };
    }
}
