// Render-time-shifted interpolation for remote entities.
//
// Snapshots arrive at 20 Hz. Rendering the most-recent snapshot directly
// would jitter every 50 ms. Instead, we keep two snapshots in a small
// ring and render at a delayed time `t = serverNow - renderDelayMs`.
// Between two snapshots we lerp; when a third arrives we drop the oldest.
//
// Render delay defaults to 100 ms — enough headroom for typical
// dropped-snapshot recovery without feeling laggy.

const DEFAULT_RENDER_DELAY_MS = 100;

export class Interpolator {
    constructor({ renderDelayMs = DEFAULT_RENDER_DELAY_MS } = {}) {
        this.renderDelayMs = renderDelayMs;
        /** Ring: [{ serverT, snapshot }] sorted ascending by serverT. */
        this.buf = [];
    }

    /**
     * Ingest a fresh snapshot. `serverT` is the server clock at which
     * this snapshot was captured (millis).
     * @param {number} serverT
     * @param {{ships: object[], enemies: object[], asteroids: object[], drops: object[]}} snapshot
     */
    ingest(serverT, snapshot) {
        this.buf.push({ serverT, snapshot });
        // Keep the buffer trimmed: at most 4 snapshots = 200 ms ring at 20 Hz.
        while (this.buf.length > 4) this.buf.shift();
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
        if (this.buf.length === 0) return null;
        if (this.buf.length === 1) return this.buf[0].snapshot;

        // Walk the ring. Find consecutive (a, b) such that a.serverT <= t <= b.serverT.
        for (let i = 0; i < this.buf.length - 1; i++) {
            const a = this.buf[i];
            const b = this.buf[i + 1];
            if (a.serverT <= t && t <= b.serverT) {
                const span = b.serverT - a.serverT;
                const u = span === 0 ? 0 : (t - a.serverT) / span;
                return lerpSnapshot(a.snapshot, b.snapshot, u);
            }
        }
        // t is past the newest snapshot — return newest unmodified.
        return this.buf[this.buf.length - 1].snapshot;
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
