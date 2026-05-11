// Client-side prediction for the local ship.
//
// Every input frame we apply locally and remember in a pending buffer.
// When a server snapshot arrives, we drop any pending inputs whose
// tick is ≤ the snapshot's tick, then replay the remaining buffer
// against the snapshot's authoritative ship state. With deterministic
// physics on both sides, the replayed state should equal the locally
// predicted state byte-for-byte (today: f32; Fxp migration is a later
// session, see `docs/Multiplayer Rust Client Engine – 2026-05-07.md`).
//
// Design contract (cf. `Multiplayer Rust Client Engine` plan §"Reconciliation
// strategy"): if `predictionDivergence` ever fires in the field, the
// parity harness has a hole. Log loudly and fix the harness.
//
// ── Wiring (2026-05-11) ─────────────────────────────────────────────────────
// The default `updateShip` callback now delegates to the pure ship-physics
// step at `js/sim/ship.js::updateShip`. That function has the signature
//   updateShip(ship, input, dt, rng, events)
// and **mutates `ship` in place**. The Predictor's internal contract was
// 3-arg (`ship, input, dt`) and a returned ship value. To bridge:
//
//   1. The default callback supplies `null` for `rng` and a fresh array
//      for `events` (the ship step emits no events today; the slot is
//      reserved for future bullet-spawn migration).
//   2. `applyLocalInput` calls the callback over the live `localShipState`
//      object and accepts the (mutated) return — fine since `localShipState`
//      is owned by the Predictor.
//   3. `onSnapshot`'s replay path clones the server ship before the loop
//      (so the server snapshot reference passed in by the caller is never
//      mutated), then mutates that clone tick-by-tick through the callback.
//
// Callers that want to inject a different physics step (cross-language
// parity harness, deterministic Fxp variant, mocked updates in tests) can
// still pass `{ updateShip: myFn }` to the constructor — the only contract
// is "(ship, input, dt, rng, events) → mutates and returns ship".

import { updateShip as pureUpdateShip } from '../sim/ship.js';
import { TickBuffer } from './tick-buffer.js';

/**
 * Default capacity for the snapshot history TickBuffer.
 *
 * The server runs at 60 Hz; 64 snapshots covers ≈ 1 second of authoritative
 * history. That's enough for late-arrival forensics (out-of-order packets
 * commonly arrive within 100–300 ms) and reconciliation lookups without
 * unbounded memory growth. Override via the `snapshotHistoryCapacity`
 * constructor option.
 */
const DEFAULT_SNAPSHOT_HISTORY_CAPACITY = 64;

/**
 * Default ship-update callback. Wraps the pure step in
 * `js/sim/ship.js` with a no-op rng + empty events array. Mirrors
 * `server/src/sim/ship.rs::update_ship` (modulo language).
 *
 * @param {import('../sim/state.js').ShipState} ship
 * @param {import('../sim/state.js').InputFrame} input
 * @param {number} dt   seconds (1/60 typical); current physics ignores dt
 *                      but the slot is plumbed for forward compatibility.
 * @returns {import('../sim/state.js').ShipState} the (mutated) ship
 */
function defaultUpdateShip(ship, input, dt) {
    return pureUpdateShip(ship, input, dt, null, []);
}

export class Predictor {
    /**
     * @param {object} [opts]
     * @param {(ship, input, dt) => object} [opts.updateShip] - physics step;
     *     defaults to `js/sim/ship.js::updateShip` wrapped with a null rng
     *     and an empty events buffer.
     * @param {number} [opts.dt] - seconds per tick (typically 1/60). Passed
     *     to the physics step; today's `updateShip` ignores it.
     * @param {number} [opts.snapshotHistoryCapacity=64] - max number of
     *     authoritative server snapshots retained in the snapshot history
     *     TickBuffer. Defaults to ~1 second at 60 Hz.
     */
    constructor({
        updateShip = defaultUpdateShip,
        dt,
        snapshotHistoryCapacity = DEFAULT_SNAPSHOT_HISTORY_CAPACITY,
    } = {}) {
        this.updateShip = updateShip;
        this.dt = dt;
        /** @type {Array<{tick: number, input: object}>} */
        this.pending = [];
        this.tick = 0;
        /** @type {object|null} Local predicted ship state. */
        this.localShipState = null;
        /** Diagnostics counter — incremented when a server snapshot
         * disagrees with our locally-predicted state after replay. */
        this.divergenceCount = 0;
        /**
         * Ring buffer of authoritative server snapshots keyed by server tick.
         * Populated by `onSnapshot`. Used for historical-evidence lookups and
         * late-arrival forensics. Interpolation is disabled (`interpolate`
         * is null) — callers want exact tick lookups for reconciliation and
         * divergence post-mortems, not interpolated values.
         *
         * @type {TickBuffer}
         */
        this.snapshotHistory = new TickBuffer({
            capacity: snapshotHistoryCapacity,
            interpolate: null,
        });
        /**
         * Diagnostics counter — incremented when a server snapshot arrives
         * for a tick older than the latest snapshot already recorded. Out-of-
         * order arrivals are valid (UDP/WebRTC packet reordering) but worth
         * tracking for network-quality diagnostics. Snapshots are still
         * stored as historical evidence; no rewind is performed.
         */
        this.lateArrivalCount = 0;
    }

    /**
     * Establish baseline ship state from the server's RoomJoined snapshot
     * (or, in tests, from a known starting position). Replaces any prior
     * local state and resets the tick counter.
     *
     * @param {object} ship - ShipState shape (see `js/sim/state.js`).
     *     Cloned so subsequent mutation does not alias the caller's copy.
     * @param {number} tick - server tick this baseline is anchored on.
     */
    setBaseline(ship, tick) {
        this.localShipState = cloneShip(ship);
        this.tick = tick | 0;
    }

    /**
     * Apply one local input, advance prediction one tick. Mutates
     * `localShipState` in place via the physics callback.
     *
     * @param {import('../sim/state.js').InputFrame} input
     */
    applyLocalInput(input) {
        this.tick = (this.tick + 1) | 0;
        this.pending.push({ tick: this.tick, input });
        if (this.localShipState != null) {
            // `updateShip` mutates in place and returns the same ref. We
            // re-assign defensively in case a custom callback returns a
            // fresh object instead.
            this.localShipState = this.updateShip(
                this.localShipState,
                input,
                this.dt,
            );
        }
    }

    /**
     * Receive an authoritative ship state from the server. Drops any
     * pending inputs whose tick ≤ serverTick, replays the remaining
     * buffer against the snapshot's authoritative ship state to derive
     * the predicted state from this baseline, compares against our
     * locally-predicted state, and warns loudly on divergence.
     *
     * On divergence, the reconciled (server-anchored + replayed) state
     * replaces the local prediction — i.e. the server wins, as it must
     * for an authoritative-server topology.
     *
     * @param {number} serverTick
     * @param {object} serverShip - authoritative ShipState. NOT mutated;
     *     we clone before replay.
     */
    onSnapshot(serverTick, serverShip) {
        // Late-arrival detection — before we mutate history. Out-of-order
        // arrivals (snapshot for tick T < latest stored tick) are valid; we
        // still record them as historical evidence (TickBuffer.insert
        // sorts internally) but increment a diagnostics counter so the
        // network layer can flag pathological reordering.
        const latest = this.snapshotHistory.getLatest();
        if (latest != null && (serverTick | 0) < latest.tick) {
            this.lateArrivalCount++;
        }

        // Record the authoritative snapshot in history *before* the replay
        // loop. Clone to detach from the caller's ref so subsequent mutation
        // (including the replay clone we make below) cannot bleed into
        // stored history. The TickBuffer keys by integer tick and handles
        // capacity eviction.
        this.snapshotHistory.insert(serverTick | 0, cloneShip(serverShip));

        // Drop already-acknowledged inputs.
        while (this.pending.length && this.pending[0].tick <= serverTick) {
            this.pending.shift();
        }
        // Replay pending inputs starting from the server's authoritative
        // state. Clone first so the caller's `serverShip` ref stays
        // untouched (the pure ship step mutates in place).
        let s = cloneShip(serverShip);
        for (const p of this.pending) {
            s = this.updateShip(s, p.input, this.dt);
        }

        // Compare. Mismatch is a parity-harness escape; track it and
        // snap local state to the server-anchored replay.
        if (this.localShipState && !shipsBitEqual(s, this.localShipState)) {
            this.divergenceCount++;
            // eslint-disable-next-line no-console
            console.warn('[net/prediction] divergence', {
                serverTick,
                pending: this.pending.length,
                replayed: s,
                local: this.localShipState,
            });
        }
        this.localShipState = s;
    }

    /**
     * Exact-tick lookup into the authoritative snapshot history. Returns
     * `{tick, state}` for the snapshot stored at the requested server tick,
     * or `null` if no snapshot for that tick is in the buffer (never
     * received, or already evicted by capacity pressure).
     *
     * Used by reconciliation forensics and parity-harness post-mortems —
     * NOT a hot path. Today the underlying TickBuffer scans linearly at
     * capacity ≤ 64, which is fine for diagnostic queries.
     *
     * @param {number} tick - server tick number.
     * @returns {{tick: number, state: object} | null}
     */
    getSnapshotAtTick(tick) {
        if (!Number.isFinite(tick)) return null;
        const t = tick | 0;
        const state = this.snapshotHistory.getByTick(t);
        if (state == null) return null;
        return { tick: t, state };
    }

    /**
     * Most-recent authoritative server snapshot (highest tick stored), or
     * null if none have been received yet.
     *
     * @returns {{tick: number, state: object} | null}
     */
    getLatestSnapshot() {
        return this.snapshotHistory.getLatest();
    }

    /**
     * Number of authoritative snapshots currently buffered. Bounded by the
     * `snapshotHistoryCapacity` constructor option (default 64).
     *
     * @returns {number}
     */
    getSnapshotHistorySize() {
        return this.snapshotHistory.size();
    }
}

function cloneShip(s) {
    // Shallow copy — prediction-relevant fields are primitives. The
    // `field` reference is shared by design (immutable per-room bounds).
    // If/when Fxp lands, `.raw` is still an i32 primitive so shallow
    // copy stays correct.
    if (s == null) return s;
    return { ...s };
}

function shipsBitEqual(a, b) {
    // Compare prediction-relevant fields bit-for-bit. f32 fields and the
    // future Fxp `.raw` int both compare via ===. Today `js/sim/ship.js`
    // writes x, y, vx, vy, and angle each tick; all five participate in
    // the parity check.
    if (a == null || b == null) return false;
    // Fxp-backed shape (forward compat — not used today).
    if (a.x != null && a.x.raw !== undefined) {
        return (
            a.x.raw === b.x.raw &&
            a.y.raw === b.y.raw &&
            a.vx.raw === b.vx.raw &&
            a.vy.raw === b.vy.raw &&
            a.angle === b.angle
        );
    }
    return (
        a.x === b.x &&
        a.y === b.y &&
        a.vx === b.vx &&
        a.vy === b.vy &&
        a.angle === b.angle
    );
}
