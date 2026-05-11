// Render-time-shifted interpolation for remote entities.
//
// Snapshots arrive at 20 Hz. Rendering the most-recent snapshot directly
// would jitter every 50 ms. Instead, we keep a small ring of recent
// snapshots and render at a delayed time `t = serverNow - renderDelayMs`.
// Between two snapshots we lerp; when the ring is full, the oldest is
// evicted on the next ingest.
//
// Render delay defaults to 100 ms — enough headroom for typical
// dropped-snapshot recovery without feeling laggy.
//
// ── Composition with TickBuffer (Phase 3 follow-up) ───────────────────
// Internally the ring is now a `TickBuffer` (see `tick-buffer.js`), which
// gives us shared storage / interpolation plumbing with the prediction
// stack. The public API of `Interpolator` is unchanged:
//
//     ingest(serverT, snapshot)
//     sample(t) -> snapshot | null
//
// TickBuffer is keyed by integer tick numbers and internally coerces keys
// via `tick | 0` (int32 truncation). Wall-clock ms timestamps would
// overflow, so this module converts server-time-in-ms to a fractional
// tick number anchored at the first ingested snapshot:
//
//     tick = (serverT - epoch) / MS_PER_TICK
//
// where MS_PER_TICK = 50 (20 Hz snapshot cadence). The fractional tick is
// rounded for storage (so `insert(tick, ...)` gets a stable integer key)
// and used directly for `getInterpolated(tick)` lookups (TickBuffer
// supports fractional sample positions).
//
// One small divergence vs. the previous hand-rolled ring: if `sample(t)`
// is called when the buffer holds exactly one snapshot, the old code
// returned that snapshot regardless of `t`; the TickBuffer-backed
// implementation likewise returns it for any `t` (we layer that fallback
// on top of `getInterpolated`, which would otherwise return null when the
// requested tick falls outside the single-entry range).

import { TickBuffer } from './tick-buffer.js';

const DEFAULT_RENDER_DELAY_MS = 100;

/** Snapshot cadence used to convert ms → tick number for TickBuffer. */
const MS_PER_TICK = 50; // 20 Hz

/** Ring capacity — 4 snapshots at 20 Hz = 200 ms of history. */
const RING_CAPACITY = 4;

export class Interpolator {
    constructor({ renderDelayMs = DEFAULT_RENDER_DELAY_MS } = {}) {
        this.renderDelayMs = renderDelayMs;
        /** Server time of the first ingested snapshot — used as the
         *  tick-number epoch so int32 coercion in TickBuffer doesn't
         *  overflow on wall-clock millis. */
        this._epochMs = null;
        /** TickBuffer keyed by tick number = (serverT - epoch) / MS_PER_TICK. */
        this._buf = new TickBuffer({
            capacity: RING_CAPACITY,
            interpolate: lerpSnapshot,
        });
    }

    /**
     * Ingest a fresh snapshot. `serverT` is the server clock at which
     * this snapshot was captured (millis).
     * @param {number} serverT
     * @param {{ships: object[], enemies: object[], asteroids: object[], drops: object[]}} snapshot
     */
    ingest(serverT, snapshot) {
        if (this._epochMs == null) this._epochMs = serverT;
        // Round to integer tick for stable storage key. Fractional precision
        // is recovered on lookup since `sample(t)` computes a fractional
        // tick directly.
        const tick = Math.round((serverT - this._epochMs) / MS_PER_TICK);
        this._buf.insert(tick, snapshot);
    }

    /**
     * Sample interpolated remote-entity state at server time `t`.
     * Returns the most-recent snapshot if `t` is outside the buffer;
     * otherwise lerps between the two surrounding snapshots.
     *
     * @param {number} t - server time in ms
     * @returns {object|null} interpolated snapshot, or null if no data yet
     */
    sample(t) {
        if (this._buf.size() === 0) return null;
        const latest = this._buf.getLatest();
        if (this._buf.size() === 1) return latest.state;

        // Convert request time to a fractional tick in the same frame as
        // the stored snapshots.
        const tickT = (t - this._epochMs) / MS_PER_TICK;

        // Clamp past-newest to the newest snapshot (old behavior). Past
        // older-than-oldest also falls back to the oldest snapshot — old
        // code's `for` loop would simply not match and reach the trailing
        // `return newest`, but conceptually clamping to the oldest is the
        // closer match since `t` is below the buffered range.
        if (tickT >= latest.tick) return latest.state;

        const interpolated = this._buf.getInterpolated(tickT);
        if (interpolated != null) return interpolated;

        // tickT is older than the oldest buffered snapshot — fall back to
        // the most-recent snapshot to preserve the old API's "never return
        // null when data exists" contract.
        return latest.state;
    }
}

function lerp(a, b, u) {
    return a + (b - a) * u;
}

function lerpSnapshot(a, b, u) {
    return {
        ships: lerpKeyedById(a.ships, b.ships, 'player', u),
        enemies: lerpKeyedById(a.enemies, b.enemies, 'id', u),
        asteroids: lerpKeyedById(a.asteroids, b.asteroids, 'id', u),
        drops: lerpKeyedById(a.drops, b.drops, 'id', u),
    };
}

function lerpKeyedById(arrA, arrB, idKey, u) {
    if (!arrA || !arrB) return arrA || arrB || [];
    // Build a map of B by id for O(1) lookup.
    const bById = new Map();
    for (const e of arrB) bById.set(stringKey(e[idKey]), e);

    const out = [];
    for (const a of arrA) {
        const b = bById.get(stringKey(a[idKey]));
        if (!b) {
            // Entity disappeared between snapshots — keep the older
            // version one frame, then it'll be dropped naturally on
            // the next ingest cycle.
            out.push(a);
            continue;
        }
        out.push({
            ...a,
            x: lerp(a.x, b.x, u),
            y: lerp(a.y, b.y, u),
            ...(typeof a.vx === 'number' && typeof b.vx === 'number'
                ? { vx: lerp(a.vx, b.vx, u), vy: lerp(a.vy, b.vy, u) }
                : null),
        });
        bById.delete(stringKey(a[idKey]));
    }
    // New entities introduced in B but not in A — appear at their B position.
    for (const newE of bById.values()) out.push(newE);
    return out;
}

function stringKey(v) {
    return typeof v === 'bigint' ? v.toString() : String(v);
}
