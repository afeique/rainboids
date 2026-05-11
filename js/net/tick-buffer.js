/**
 * TickBuffer — ring buffer of recent server snapshots keyed by tick number.
 *
 * Part of the Phase 3 client prediction / interpolation work. For multiplayer
 * the client needs to:
 *   1. Store recent server snapshots (each tagged with a tick number).
 *   2. Interpolate between adjacent snapshots when rendering between tick
 *      boundaries (this class handles 1 + 2).
 *   3. Predict ahead locally — run sim past the latest received snapshot
 *      (handled by `js/net/prediction.js`).
 *   4. Reconcile when a server snapshot arrives confirming / refuting
 *      prediction (also `prediction.js`).
 *
 * Each entry is `{ tick: number, state: object }`. The buffer is sorted
 * ascending by tick number and evicts the oldest entry when capacity is
 * reached. Snapshots are typically appended in monotonic tick order, but
 * out-of-order inserts are tolerated (sorted internally on insert).
 *
 * Interpolation is delegated to a user-supplied `interpolate(s1, s2, t)`
 * function passed to the constructor — this keeps TickBuffer state-shape
 * agnostic. The same buffer can hold ShipState, AsteroidState, full
 * GameState, or any structure whose interpolation rule the caller defines.
 *
 * This is intentionally a thin data structure. It does NOT:
 *   - know about the wire format (callers decode bytes first).
 *   - know about wall-clock time (lookups are in tick units only).
 *   - allocate per-frame (interpolate fn owns its own allocation strategy).
 */

const DEFAULT_CAPACITY = 32;

export class TickBuffer {
    /**
     * @param {object} [options]
     * @param {number} [options.capacity=32] — max number of snapshots kept.
     * @param {((s1: object, s2: object, t: number) => object) | null} [options.interpolate=null]
     *        — pure fn returning an interpolated state for `t ∈ [0, 1]`. If
     *        null, `getInterpolated()` always returns null.
     */
    constructor({ capacity = DEFAULT_CAPACITY, interpolate = null } = {}) {
        if (!Number.isFinite(capacity) || capacity < 1) {
            throw new RangeError(`TickBuffer: capacity must be ≥ 1, got ${capacity}`);
        }
        this.capacity = capacity | 0;
        this.interpolate = interpolate;
        /** @type {Array<{tick: number, state: object}>} sorted ascending by tick */
        this._entries = [];
    }

    /**
     * Insert a snapshot. If the buffer is already at capacity, the oldest
     * entry (lowest tick) is evicted. If `tick` matches an existing entry
     * the existing state is replaced (latest write wins) — useful when a
     * later, more authoritative version of the same tick arrives.
     *
     * @param {number} tick - integer tick number (server-assigned).
     * @param {object} state - opaque snapshot payload.
     */
    insert(tick, state) {
        if (!Number.isFinite(tick)) {
            throw new TypeError(`TickBuffer.insert: tick must be a finite number, got ${tick}`);
        }
        const t = tick | 0;
        const entries = this._entries;

        // Fast path: append at the end (monotonic insert).
        if (entries.length === 0 || t > entries[entries.length - 1].tick) {
            entries.push({ tick: t, state });
        } else {
            // Find insertion index via linear scan from the right (capacity is small).
            let i = entries.length - 1;
            while (i >= 0 && entries[i].tick > t) i--;
            if (i >= 0 && entries[i].tick === t) {
                // Replace existing entry for this tick.
                entries[i] = { tick: t, state };
            } else {
                entries.splice(i + 1, 0, { tick: t, state });
            }
        }

        // Evict oldest while over capacity.
        while (entries.length > this.capacity) entries.shift();
    }

    /**
     * Exact lookup by tick. Returns the stored state or null if no entry
     * matches.
     *
     * @param {number} tick
     * @returns {object | null}
     */
    getByTick(tick) {
        if (!Number.isFinite(tick)) return null;
        const t = tick | 0;
        const entries = this._entries;
        // Linear scan; capacity is small (~32). Walk from the right since
        // recent ticks are queried most often.
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].tick === t) return entries[i].state;
            if (entries[i].tick < t) return null; // sorted; past it
        }
        return null;
    }

    /**
     * Most-recent entry (highest tick), or null if buffer is empty.
     *
     * @returns {{tick: number, state: object} | null}
     */
    getLatest() {
        const entries = this._entries;
        if (entries.length === 0) return null;
        const last = entries[entries.length - 1];
        return { tick: last.tick, state: last.state };
    }

    /**
     * Interpolated state at a (possibly fractional) tick.
     *
     * Returns null when:
     *   - no `interpolate` fn was provided at construction, OR
     *   - the buffer is empty, OR
     *   - `tick` falls outside the buffered range (`< oldest` or `> newest`).
     *
     * If `tick` exactly matches a buffered entry, the stored state is
     * returned directly (no call to `interpolate`).
     *
     * Otherwise the two entries `a, b` bracketing `tick` are located and
     * `interpolate(a.state, b.state, (tick - a.tick) / (b.tick - a.tick))`
     * is returned. The fraction is computed in floating point so `tick`
     * may be non-integer (e.g. a render-time interpolation between server
     * ticks).
     *
     * @param {number} tick - may be fractional.
     * @returns {object | null}
     */
    getInterpolated(tick) {
        if (this.interpolate == null) return null;
        if (!Number.isFinite(tick)) return null;
        const entries = this._entries;
        if (entries.length === 0) return null;

        const oldest = entries[0];
        const newest = entries[entries.length - 1];
        if (tick < oldest.tick || tick > newest.tick) return null;

        // Locate bracketing pair (a, b) with a.tick <= tick <= b.tick.
        // Linear scan from the right is fine at this capacity.
        for (let i = entries.length - 1; i > 0; i--) {
            const b = entries[i];
            const a = entries[i - 1];
            if (a.tick <= tick && tick <= b.tick) {
                if (tick === a.tick) return a.state;
                if (tick === b.tick) return b.state;
                const span = b.tick - a.tick;
                // span == 0 is impossible here because tick values are
                // unique within the buffer and a.tick !== b.tick (the
                // exact-match short-circuits above already handled it),
                // but guard anyway for safety.
                if (span === 0) return a.state;
                const t = (tick - a.tick) / span;
                return this.interpolate(a.state, b.state, t);
            }
        }
        // Only one entry total and it didn't match exactly — already
        // caught by the range check, but be defensive.
        return null;
    }

    /** Drop all buffered entries. */
    clear() {
        this._entries.length = 0;
    }

    /** Current number of buffered entries. */
    size() {
        return this._entries.length;
    }
}
