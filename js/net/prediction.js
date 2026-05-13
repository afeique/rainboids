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
// ── Reconciliation tolerance (2026-05-11) ───────────────────────────────────
// The Rust authoritative server stores ship state in f32, while JS runs in
// f64. Across the wire, snapshots come back as f32-magnitude values which,
// after JS replay through the (f64) physics step, can drift by ~1e-6..1e-3
// per tick relative to a strict bit-for-bit comparison. Strict equality
// (`shipsBitEqual`) would flag this as divergence on every snapshot.
//
// The reconciliation path in `onSnapshot` therefore uses a tolerance-based
// comparator (`shipsApproxEqual`, default tolerance 0.01 — same as the
// cross-language Rust parity tests). The strict comparator stays available
// for JS↔JS replay verification where a single ULP of drift IS a bug.
// Tolerance is configurable per-Predictor via the `reconcileTolerance`
// constructor option.
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
 * Default tolerance for `shipsApproxEqual` used during `onSnapshot`
 * reconciliation. Matches the cross-language Rust parity-test tolerance
 * (`server/tests/parity_*.rs`) — wide enough to absorb f32↔f64 drift
 * across replay, narrow enough that any real physics divergence still
 * trips the divergence counter and logs.
 */
const DEFAULT_RECONCILE_TOLERANCE = 0.01;

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
     * @param {number} [opts.reconcileTolerance=0.01] - per-field absolute
     *     tolerance used by `onSnapshot` when comparing the locally-predicted
     *     ship state against the server-anchored replay. Defaults to 0.01
     *     to absorb f32↔f64 drift between the Rust authoritative server
     *     and JS client. Set to 0 (or use `shipsBitEqual` directly) for
     *     strict bit-equal JS↔JS replay verification.
     */
    constructor({
        updateShip = defaultUpdateShip,
        dt,
        snapshotHistoryCapacity = DEFAULT_SNAPSHOT_HISTORY_CAPACITY,
        reconcileTolerance = DEFAULT_RECONCILE_TOLERANCE,
    } = {}) {
        this.updateShip = updateShip;
        this.dt = dt;
        this.reconcileTolerance = reconcileTolerance;
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
        // snap local state to the server-anchored replay. We use the
        // tolerance-based comparator here (default 0.01) rather than
        // strict bit-equality, because the Rust authoritative server
        // stores f32 ship state while JS runs f64; round-trip drift in
        // the low ulps is expected and not a parity hole. See the
        // module-level "Reconciliation tolerance" note for details.
        if (
            this.localShipState &&
            !shipsApproxEqual(s, this.localShipState, this.reconcileTolerance)
        ) {
            this.divergenceCount++;
            // eslint-disable-next-line no-console
            console.warn('[net/prediction] divergence', {
                serverTick,
                pending: this.pending.length,
                replayed: s,
                local: this.localShipState,
                tolerance: this.reconcileTolerance,
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

/**
 * Strict bit-for-bit ship-state comparator. Five prediction-relevant
 * scalar fields (`x`, `y`, `vx`, `vy`, `angle`) compared via `===`.
 *
 * Use this for JS↔JS replay verification, where any drift in the low
 * bits IS a bug (deterministic physics on both sides should give
 * identical output). For Rust↔JS cross-language reconciliation, prefer
 * `shipsApproxEqual` — see the module-level "Reconciliation tolerance"
 * note for why.
 *
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @returns {boolean} true iff every field matches strictly; false if
 *     either input is nullish.
 */
export function shipsBitEqual(a, b) {
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

/**
 * Tolerance-based ship-state comparator. Each prediction-relevant field
 * (`x`, `y`, `vx`, `vy`, `angle`) is compared with a per-field absolute
 * tolerance: `|s1.field - s2.field| < tolerance`. ALL fields must
 * satisfy the bound for the function to return true.
 *
 * Comparison is **strict less-than** (`< tolerance`, not `<=`). At
 * exactly `tolerance`, the function returns false — this matches the
 * convention used by the Rust parity tests in `server/tests/parity_*.rs`.
 *
 * Use this for Rust↔JS reconciliation in `onSnapshot`. The Rust server
 * stores ship state in f32, JS runs in f64; round-trip drift in the
 * low ulps (well below 0.01) is expected, not a parity hole. The
 * default 0.01 matches the cross-language Rust parity-test tolerance.
 *
 * NaN handling: any NaN in either operand for any field makes the
 * comparison fail (NaN never satisfies `< tolerance`); the function
 * returns false. This is intentional — a NaN in the prediction state
 * is itself a bug worth flagging via divergenceCount.
 *
 * @param {object|null|undefined} s1
 * @param {object|null|undefined} s2
 * @param {number} [tolerance=0.01] per-field absolute tolerance
 * @returns {boolean} true iff every field is within tolerance of its
 *     counterpart; false if either input is nullish or any field's
 *     absolute diff is `>=` tolerance.
 */
export function shipsApproxEqual(s1, s2, tolerance = DEFAULT_RECONCILE_TOLERANCE) {
    if (s1 == null || s2 == null) return false;
    // Fxp-backed shape (forward compat — not used today). Fxp is
    // integer-backed; the tolerance is in the same scaled units the
    // caller chose. Today no shipping code path uses Fxp ships, so
    // this branch is documentation more than runtime cost.
    if (s1.x != null && s1.x.raw !== undefined) {
        return (
            Math.abs(s1.x.raw - s2.x.raw) < tolerance &&
            Math.abs(s1.y.raw - s2.y.raw) < tolerance &&
            Math.abs(s1.vx.raw - s2.vx.raw) < tolerance &&
            Math.abs(s1.vy.raw - s2.vy.raw) < tolerance &&
            Math.abs(s1.angle - s2.angle) < tolerance
        );
    }
    return (
        Math.abs(s1.x - s2.x) < tolerance &&
        Math.abs(s1.y - s2.y) < tolerance &&
        Math.abs(s1.vx - s2.vx) < tolerance &&
        Math.abs(s1.vy - s2.vy) < tolerance &&
        Math.abs(s1.angle - s2.angle) < tolerance
    );
}
