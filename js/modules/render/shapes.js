// Shared entity-shape rendering helpers.
//
// Pure draw + shape-derivation functions that both the solo renderer
// (entity `.draw()` methods) and the MP renderer (`js/mp/mp-renderer.js`)
// call, so the two products share one visual definition instead of
// duplicating it.
//
// Design contract:
//   - `drawXShape(ctx, shape)` takes a Canvas2D context already
//     translated to the entity's origin (caller does ctx.translate),
//     plus a plain `shape` object of primitive fields. It owns NO
//     entity state and reads NOTHING off `this` — every input is in
//     `shape`. This is the "drawShape interface" each entity kind
//     implements: solo entities pass `this.*`; MP passes values it
//     derives from WASM sim state + a per-id cosmetic-animation cache.
//   - Cosmetic state the deterministic sim doesn't carry (3D tumble
//     rotation, irregular silhouette vertices) is DERIVED here from
//     inputs the sim does provide (a seed, the radius). The sim stays
//     gameplay-pure; the cosmetic shape is reproducible on every client
//     because it's a pure function of the seed.

import { hsl } from '../core/color-cache.js';

// ── Asteroid geometry ──────────────────────────────────────────────

/** Dodecahedron base vertices (12 points). Scaled by radius + per-
 *  vertex jitter to make each asteroid an irregular tumbling rock. */
const T = (1 + Math.sqrt(5)) / 2;
export const DODECAHEDRON_POINTS = [
    [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T],
    [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];

/** Wireframe edge list — pairs of indices into the 12-vertex set.
 *  Matches solo's `Asteroid.edges` exactly so both products draw the
 *  same wireframe topology. */
export const ASTEROID_EDGES = [
    [0, 1], [0, 5], [0, 7], [0, 10], [0, 11], [1, 5], [1, 7], [1, 8], [1, 9],
    [2, 3], [2, 4], [2, 6], [2, 10], [2, 11], [3, 4], [3, 6], [3, 8], [3, 9],
    [4, 5], [4, 9], [4, 11], [5, 9], [5, 11], [6, 7], [6, 8], [6, 10],
    [7, 8], [7, 10], [8, 9], [10, 11],
];

/** Default perspective focal length (matches solo's `Asteroid.fov`). */
export const ASTEROID_FOV = 300;

/**
 * Build the 12 distorted 3D vertices for one asteroid. `rng` is a
 * `() => number` in [0, 1) so the caller controls determinism — solo
 * passes its global `random()`; MP passes a seeded PRNG keyed by the
 * asteroid id so both tabs generate the identical silhouette.
 *
 * @param {() => number} rng   uniform [0,1) source
 * @param {number} baseRadius
 * @returns {{x:number,y:number,z:number}[]}
 */
export function generateAsteroidVertices(rng, baseRadius) {
    return DODECAHEDRON_POINTS.map((v) => {
        // Per-vertex uniform jitter ±25% — identical recipe to solo's
        // `rescale()`: `d = 1 + random(-0.25, 0.25)`, applied to all
        // three axes of the vertex.
        const d = 1 + (rng() - 0.5) * 0.5; // 1 + [-0.25, 0.25)
        const k = baseRadius * d;
        return { x: v[0] * k, y: v[1] * k, z: v[2] * k };
    });
}

/**
 * Project 3D vertices through a 3-axis rotation + perspective divide
 * into entity-local 2D `{x, y, depth}`. Mirrors solo's
 * `Asteroid.project()` (using Math.sin/cos rather than the LUT — MP
 * doesn't need the micro-opt; solo keeps its LUT path).
 *
 * @param {{x,y,z}[]} verts
 * @param {{x:number,y:number,z:number}} rot3D   radians per axis
 * @param {number} fov
 * @param {{x,y,depth}[]} [out]   optional reused output array
 */
export function projectAsteroidVertices(verts, rot3D, fov = ASTEROID_FOV, out = null) {
    const cosX = Math.cos(rot3D.x), sinX = Math.sin(rot3D.x);
    const cosY = Math.cos(rot3D.y), sinY = Math.sin(rot3D.y);
    const cosZ = Math.cos(rot3D.z), sinZ = Math.sin(rot3D.z);
    if (!out || out.length !== verts.length) {
        out = new Array(verts.length);
        for (let i = 0; i < verts.length; i++) out[i] = { x: 0, y: 0, depth: 0 };
    }
    for (let i = 0; i < verts.length; i++) {
        let x = verts[i].x, y = verts[i].y, z = verts[i].z;
        // Z rotation
        let tx = x, ty = y;
        x = tx * cosZ - ty * sinZ;
        y = tx * sinZ + ty * cosZ;
        // X rotation
        tx = y; let tz = z;
        y = tx * cosX - tz * sinX;
        z = tx * sinX + tz * cosX;
        // Y rotation
        tx = x; tz = z;
        x = tx * cosY + tz * sinY;
        z = -tx * sinY + tz * cosY;
        // Perspective project
        const scale = fov / (fov + z);
        const p = out[i];
        p.x = x * scale;
        p.y = y * scale;
        p.depth = z;
    }
    return out;
}

// Module-level scratch buckets for the depth-sorted wireframe pass.
// Shared across all callers that don't pass their own scratch — fine
// because draw is synchronous and single-threaded. Solo passes its
// pre-allocated per-entity scratch to avoid contending with this.
const _BUCKETS = 5;
const _sharedScratch = {
    BUCKETS: _BUCKETS,
    bucketEdges: Array.from({ length: _BUCKETS }, () => []),
    bucketHue: new Float64Array(_BUCKETS),
    bucketCount: new Uint8Array(_BUCKETS),
};

/**
 * Draw an asteroid's tumbling-wireframe silhouette. The ctx must
 * ALREADY be translated to the asteroid's center (caller does
 * `ctx.save(); ctx.translate(x, y)` and `ctx.restore()`), exactly like
 * solo's `Asteroid.draw()` does before calling this.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s   shape descriptor:
 *   - projectedVertices: {x,y,depth}[]  (entity-local 2D)
 *   - edges: [i,j][]
 *   - fov, radius
 *   - baseHue, hueCycleSpeed, hueSpread, saturation, lightness
 *   - now: monotonic ms (drives the hue cycle)
 *   - scratch?: { BUCKETS, bucketEdges, bucketHue, bucketCount }
 */
export function drawAsteroidShape(ctx, s) {
    const projectedVertices = s.projectedVertices;
    const edges = s.edges;
    if (!projectedVertices || !edges) return;

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Black underlayer pass — thick opaque outline so the wireframe
    // stays legible over bright nebula / stars.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const v1 = projectedVertices[e[0]];
        const v2 = projectedVertices[e[1]];
        if (!v1 || !v2) continue;
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2;

    const scratch = s.scratch || _sharedScratch;
    const BUCKETS = scratch.BUCKETS;
    const bucketEdges = scratch.bucketEdges;
    const bucketHue = scratch.bucketHue;
    const bucketCount = scratch.bucketCount;
    for (let b = 0; b < BUCKETS; b++) {
        bucketEdges[b].length = 0;
        bucketHue[b] = 0;
        bucketCount[b] = 0;
    }

    const fov = s.fov;
    const radius = s.radius;
    const baseHue = s.baseHue;
    const now = s.now || 0;
    const hueCycleSpeed = s.hueCycleSpeed || 15;
    const hueSpread = s.hueSpread || 60;

    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const v1 = projectedVertices[e[0]];
        const v2 = projectedVertices[e[1]];
        if (!v1 || !v2) continue;
        const avg = (v1.depth + v2.depth) / 2;
        const alpha = Math.max(0.2, Math.pow(Math.max(0, (fov - avg) / (fov + radius)), 2.0));
        const hue = (baseHue + now / hueCycleSpeed + (i / edges.length) * hueSpread) % 360;
        const bi = Math.min(BUCKETS - 1, Math.floor((alpha - 0.2) / 0.8 * BUCKETS));
        bucketEdges[bi].push(v1, v2, alpha);
        bucketHue[bi] += hue;
        bucketCount[bi]++;
    }

    for (let bi = 0; bi < BUCKETS; bi++) {
        if (bucketCount[bi] === 0) continue;
        const edgesB = bucketEdges[bi];
        const alpha = edgesB[2];
        const hue = bucketHue[bi] / bucketCount[bi];
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = hsl(hue, s.saturation, s.lightness);
        ctx.beginPath();
        for (let j = 0; j < edgesB.length; j += 3) {
            ctx.moveTo(edgesB[j].x, edgesB[j].y);
            ctx.lineTo(edgesB[j + 1].x, edgesB[j + 1].y);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
