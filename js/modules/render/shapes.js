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

import { hsl, rgba } from '../core/color-cache.js';

// ── Ship silhouette ────────────────────────────────────────────────
// Shared winged-hull ship shape used by solo's remote-ship draw and
// the /mp renderer (local + remote ships). Colors are fully
// parameterized via a `palette` so each caller can theme it (solo
// remotes = magenta; MP local = cyan; MP remotes = per-slot palette).

const _shipPathCache = new Map();

/** Build (and cache) the Path2D set for a ship of radius `r`. The
 *  geometry is identical to solo's original `_getShipPaths`. */
export function getShipPaths(r) {
    let paths = _shipPathCache.get(r);
    if (paths) return paths;
    const rightWing = new Path2D();
    rightWing.moveTo(r * 0.32, -r * 0.18);
    rightWing.lineTo(r * 1.12, r * 0.28);
    rightWing.lineTo(r * 0.82, r * 0.68);
    rightWing.lineTo(r * 0.28, r * 0.58);
    rightWing.closePath();
    const leftWing = new Path2D();
    leftWing.moveTo(-r * 0.32, -r * 0.18);
    leftWing.lineTo(-r * 1.12, r * 0.28);
    leftWing.lineTo(-r * 0.82, r * 0.68);
    leftWing.lineTo(-r * 0.28, r * 0.58);
    leftWing.closePath();
    const centralHull = new Path2D();
    centralHull.moveTo(0, -r);
    centralHull.lineTo(r * 0.32, -r * 0.18);
    centralHull.lineTo(r * 0.28, r * 0.58);
    centralHull.lineTo(0, r * 0.38);
    centralHull.lineTo(-r * 0.28, r * 0.58);
    centralHull.lineTo(-r * 0.32, -r * 0.18);
    centralHull.closePath();
    paths = { rightWing, leftWing, centralHull };
    _shipPathCache.set(r, paths);
    return paths;
}

/** Default magenta palette — solo's remote-ship colors. */
export const SHIP_PALETTE_MAGENTA = {
    wingFill: 'rgba(180, 60, 200, 0.55)',
    wingStroke: '#ff66ff',
    hullFill: 'rgba(40, 10, 50, 0.92)',
    hullStroke: '#ff88ff',
    cockpitFill: 'rgba(255, 180, 255, 0.85)',
    cockpitStroke: 'rgba(255, 200, 255, 0.6)',
};

/**
 * Draw the winged-hull ship silhouette at world (x, y) facing `angle`.
 * Owns its own translate+rotate (the ship art points "up"/-Y in local
 * space, so it rotates `angle + PI/2`). Colors come from `palette`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 * @param {object} [opts] - { radius=12, palette=SHIP_PALETTE_MAGENTA }
 */
export function drawShipShape(ctx, x, y, angle, opts = {}) {
    if (!ctx) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return;
    const r = opts.radius > 0 ? opts.radius : 12;
    const pal = opts.palette || SHIP_PALETTE_MAGENTA;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);

    const paths = getShipPaths(r);

    // Black silhouette stroke pass — legible over bright nebulae.
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.stroke(paths.rightWing);
    ctx.stroke(paths.leftWing);
    ctx.lineWidth = 4;
    ctx.stroke(paths.centralHull);

    // Wing fills.
    ctx.fillStyle = pal.wingFill;
    ctx.strokeStyle = pal.wingStroke;
    ctx.lineWidth = 1.4;
    ctx.fill(paths.rightWing);
    ctx.stroke(paths.rightWing);
    ctx.fill(paths.leftWing);
    ctx.stroke(paths.leftWing);

    // Central hull.
    ctx.fillStyle = pal.hullFill;
    ctx.strokeStyle = pal.hullStroke;
    ctx.lineWidth = 1.8;
    ctx.fill(paths.centralHull);
    ctx.stroke(paths.centralHull);

    // Cockpit dot.
    ctx.fillStyle = pal.cockpitFill;
    ctx.strokeStyle = pal.cockpitStroke;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.17, r * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

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

/** Triangular faces of the icosahedron — index triples into the 12-vertex
 *  set. Each face is wound so `(v1-v0)×(v2-v0)` is the OUTWARD normal, which
 *  makes the projected screen-space signed area NEGATIVE for front-facing
 *  triangles (canvas y-down) — a one-line backface-cull test. 20 faces, each
 *  edge shared by two neighbours → exactly the 30 edges of ASTEROID_EDGES. */
export const ASTEROID_FACES = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
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

// ── Asteroid render mode (filled gem vs. classic wireframe) ─────────
// Two complete renderers live side by side: the default `filled` (solid
// rainbow-faceted gem + a bright rainbow wireframe overlay) and the classic
// `wireframe` (translucent depth-bucketed rainbow edges, the pre-9.3.0 look).
// Flip at runtime with setAsteroidRenderMode() — used to A/B their render
// cost and to fall back to the cheaper wireframe if it's ever wanted.
let _asteroidRenderMode = 'filled';
export function setAsteroidRenderMode(mode) {
    _asteroidRenderMode = mode === 'wireframe' ? 'wireframe' : 'filled';
    return _asteroidRenderMode;
}
export function getAsteroidRenderMode() { return _asteroidRenderMode; }

// Edge→face adjacency, derived once from the fixed topology: for each of the
// 30 edges, the (exactly two) faces that share it. The filled renderer uses
// this for hidden-line removal — an edge is drawn iff at least one of its
// adjacent faces is front-facing.
const ASTEROID_EDGE_FACES = ASTEROID_EDGES.map(([a, b]) => {
    const adj = [];
    for (let fi = 0; fi < ASTEROID_FACES.length; fi++) {
        const f = ASTEROID_FACES[fi];
        const hasA = f[0] === a || f[1] === a || f[2] === a;
        const hasB = f[0] === b || f[1] === b || f[2] === b;
        if (hasA && hasB) adj.push(fi);
    }
    return adj;
});

// Scratch reused by the (single-threaded, synchronous) draw passes.
const _frontFlags = new Uint8Array(ASTEROID_FACES.length);
const _WF_BUCKETS = 5;
const _wfScratch = {
    BUCKETS: _WF_BUCKETS,
    bucketEdges: Array.from({ length: _WF_BUCKETS }, () => []),
    bucketHue: new Float64Array(_WF_BUCKETS),
    bucketCount: new Uint8Array(_WF_BUCKETS),
};

/**
 * Draw an asteroid body. Dispatches to the active render mode. The ctx must
 * ALREADY be translated to the asteroid's center (caller does
 * `ctx.save(); ctx.translate(x, y)` and `ctx.restore()`), exactly like solo's
 * `Asteroid.draw()` does before calling this.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s   shape descriptor (see drawAsteroidFilled / -Wireframe)
 */
export function drawAsteroidShape(ctx, s) {
    if (_asteroidRenderMode === 'wireframe') drawAsteroidWireframe(ctx, s);
    else drawAsteroidFilled(ctx, s);
}

/**
 * FILLED gem renderer (default). Two passes:
 *   1. Solid facets — each face flat-filled with its own rainbow colour
 *      (caller supplies `faceHueOffsets`, a per-face hue offset derived from
 *      the face's position along a random per-asteroid axis → a coherent
 *      colour SWEEP across the rock with a WIDE span, so adjacent facets are
 *      visibly different yet transition smoothly), plus a soft depth-shade
 *      for volume. Backface-culled (convex solid ⇒ front facets tile the
 *      silhouette with no overlap, no depth sort needed).
 *   2. Rainbow wireframe — every VISIBLE edge (hidden-line removed via
 *      ASTEROID_EDGE_FACES + the pass-1 front-flags) stroked in a bright,
 *      depth-faded rainbow that matches the local facet hue, giving crisp
 *      faceting and extra colour.
 *
 * @param {object} s
 *   - projectedVertices: {x,y,depth}[]  (entity-local 2D)
 *   - radius, baseHue, hueCycleSpeed, saturation, lightness
 *   - faceHueOffsets?: number[30→20]  per-face hue offset (the gradient)
 *   - edgeHueOffsets?: number[30]     per-edge hue offset (matched gradient)
 *   - hueSpread?: number              index-stepped fallback span
 *   - now: monotonic ms (drives the slow global hue cycle)
 */
export function drawAsteroidFilled(ctx, s) {
    const pv = s.projectedVertices;
    if (!pv) return;

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const radius = s.radius || 1;
    const baseHue = s.baseHue;
    const now = s.now || 0;
    const hueCycleSpeed = s.hueCycleSpeed || 15;
    const hueDrift = now / hueCycleSpeed;
    const faceHueOffsets = s.faceHueOffsets;
    const edgeHueOffsets = s.edgeHueOffsets;
    const hueSpread = s.hueSpread || 60; // fallback only (no gradient supplied)
    const sat = s.saturation;
    const light = s.lightness;
    const faces = ASTEROID_FACES;
    const nFaces = faces.length;
    const frontFlags = _frontFlags;

    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';

    // ── Pass 1: filled facets — flat vivid rainbow colour + soft shade ──
    for (let i = 0; i < nFaces; i++) {
        const f = faces[i];
        const a = pv[f[0]], b = pv[f[1]], c = pv[f[2]];
        if (!a || !b || !c) { frontFlags[i] = 0; continue; }

        // Backface cull; remember front-facing flags for the edge pass.
        const cross = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
        if (cross >= 0) { frontFlags[i] = 0; continue; }
        frontFlags[i] = 1;

        // Soft volume shade: lit near side (−z) bright, far side (+z) dimmer.
        const avgDepth = (a.depth + b.depth + c.depth) / 3;
        let lit = 0.5 - 0.5 * (avgDepth / radius);
        if (lit < 0) lit = 0; else if (lit > 1) lit = 1;
        const shade = 0.55 + 0.45 * lit;                  // shadow 0.55·L … lit 1.0·L

        const hueOff = faceHueOffsets ? faceHueOffsets[i] : (i / nFaces) * hueSpread;
        const hue = (baseHue + hueDrift + hueOff) % 360;
        let L = light * shade;
        if (L < 6) L = 6;

        ctx.fillStyle = hsl(hue, sat, L);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
    }

    // ── Pass 2: bright rainbow wireframe over the fill (hidden-line removed) ──
    const edges = ASTEROID_EDGES;
    const edgeFaces = ASTEROID_EDGE_FACES;
    const nEdges = edges.length;
    const edgeSat = sat + 6 > 100 ? 100 : sat + 6;
    const edgeLight = light + 26 > 92 ? 92 : light + 26;     // brighter than faces → glows
    ctx.lineWidth = Math.min(2.6, Math.max(1, radius * 0.028));
    ctx.lineCap = 'round';
    for (let j = 0; j < nEdges; j++) {
        const adj = edgeFaces[j];
        if (!(frontFlags[adj[0]] || (adj[1] !== undefined && frontFlags[adj[1]]))) continue;
        const e = edges[j];
        const v1 = pv[e[0]], v2 = pv[e[1]];
        if (!v1 || !v2) continue;

        const avgDepth = (v1.depth + v2.depth) / 2;
        let lit = 0.5 - 0.5 * (avgDepth / radius);
        if (lit < 0) lit = 0; else if (lit > 1) lit = 1;

        const hueOff = edgeHueOffsets ? edgeHueOffsets[j] : (j / nEdges) * hueSpread;
        const hue = (baseHue + hueDrift + hueOff) % 360;

        ctx.globalAlpha = 0.55 + 0.45 * lit;
        ctx.strokeStyle = hsl(hue, edgeSat, edgeLight);
        ctx.beginPath();
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
}

/**
 * Classic WIREFRAME renderer (pre-9.3.0). Thick black underlayer for
 * legibility, then depth-bucketed translucent rainbow edges. Kept for
 * switch-back and as the cheaper baseline in render-cost comparisons.
 *
 * @param {object} s   - projectedVertices, edges?, fov?, radius, baseHue,
 *   hueCycleSpeed, hueSpread, saturation, lightness, now
 */
export function drawAsteroidWireframe(ctx, s) {
    const projectedVertices = s.projectedVertices;
    const edges = s.edges || ASTEROID_EDGES;
    if (!projectedVertices) return;

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Black underlayer pass — thick opaque outline so the wireframe stays
    // legible over bright nebula / stars.
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

    const scratch = _wfScratch;
    const BUCKETS = scratch.BUCKETS;
    const bucketEdges = scratch.bucketEdges;
    const bucketHue = scratch.bucketHue;
    const bucketCount = scratch.bucketCount;
    for (let b = 0; b < BUCKETS; b++) {
        bucketEdges[b].length = 0;
        bucketHue[b] = 0;
        bucketCount[b] = 0;
    }

    const fov = s.fov || ASTEROID_FOV;
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

// ── Enemy silhouettes ──────────────────────────────────────────────
// One pure helper per enemy kind, extracted 1:1 from solo's
// `js/modules/enemy/shapes.js` drawers. Each takes a ctx that the
// caller has ALREADY translated to the enemy center and rotated to the
// enemy facing (solo's `Enemy.draw` does ctx.translate(x,y)+rotate(a)
// before calling; the shared helper does NOT translate/rotate). Every
// input is in `opts` — the helper reads NOTHING off `this`:
//   - radius : enemy collision radius (the art is scaled off this)
//   - color  : the enemy's themed color string (only the WEAVER/PROWLER
//              turrets use it; most types are hardcoded per-type art)
//   - now    : monotonic ms, drives idle animation (default 0 → a clean
//              static silhouette for callers without a clock)
//   - per-type animation/firing state (turret charge etc.) — each with
//     a default of 0/false/'' so a caller that lacks that state gets the
//     idle/static look.

/** HUNTER — predatory swept-wing fighter. opts: { radius, now }. */
export function drawEnemyHunterShape(ctx, opts) {
    // Predatory hunter fighter — swept wings, engine glow, cockpit
    const size = opts.radius * 0.9;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.82 + Math.sin(t * 3.8) * 0.18;

    ctx.save();

    // ── Main elongated body ───────────────────────────────────────────────
    ctx.fillStyle = '#1a0000';
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 1.15, 0);            // sharp nose
    ctx.lineTo(size * 0.18, -size * 0.3);  // upper shoulder
    ctx.lineTo(-size * 0.52, -size * 0.2); // upper rear
    ctx.lineTo(-size * 0.72, 0);           // tail center
    ctx.lineTo(-size * 0.52, size * 0.2);  // lower rear
    ctx.lineTo(size * 0.18, size * 0.3);   // lower shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Swept wings ───────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255, 40, 40, 0.15)';
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 1.5;
    // Upper wing
    ctx.beginPath();
    ctx.moveTo(size * 0.18, -size * 0.3);
    ctx.lineTo(-size * 0.08, -size * 1.05);
    ctx.lineTo(-size * 0.62, -size * 0.38);
    ctx.lineTo(-size * 0.52, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lower wing (mirror)
    ctx.beginPath();
    ctx.moveTo(size * 0.18, size * 0.3);
    ctx.lineTo(-size * 0.08, size * 1.05);
    ctx.lineTo(-size * 0.62, size * 0.38);
    ctx.lineTo(-size * 0.52, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Hull spine line ────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 110, 110, 0.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(size * 0.85, 0);
    ctx.lineTo(-size * 0.45, 0);
    ctx.stroke();

    // ── Engine exhaust glow ────────────────────────────────────────────────
    const engGrad = ctx.createRadialGradient(-size * 0.72, 0, 0, -size * 0.72, 0, size * 0.38);
    engGrad.addColorStop(0,   rgba(255, 220, 120, pulse));
    engGrad.addColorStop(0.35, rgba(255, 80, 0, 0.75 * pulse));
    engGrad.addColorStop(1,   'rgba(255, 0, 0, 0)');
    ctx.fillStyle = engGrad;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(-size * 0.72, 0, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Cockpit glow ──────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(255, 150, 150, 0.7 * pulse);
    ctx.beginPath();
    ctx.ellipse(size * 0.32, 0, size * 0.14, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/** TANGERINE — explosive spiked circle. opts: { radius }. */
export function drawEnemyTangerineShape(ctx, opts) {
    // Explosive circle with directional spikes
    const innerSize = opts.radius * 0.5;
    const outerSize = opts.radius * 0.8;

    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 0, innerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spikes with forward emphasis
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        // Make forward spikes longer
        const lengthMultiplier = (i === 0) ? 1.5 : 1;
        const innerX = Math.cos(angle) * innerSize;
        const innerY = Math.sin(angle) * innerSize;
        const outerX = Math.cos(angle) * outerSize * lengthMultiplier;
        const outerY = Math.sin(angle) * outerSize * lengthMultiplier;

        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);
    }
    ctx.stroke();
}

/** DRIFTER — living lightning entity. opts: { radius, now, laserCharging=false }. */
export function drawEnemyDrifterShape(ctx, opts) {
    // Lightning Entity — a living being of pure electricity
    const size = opts.radius * 0.85;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.7 + Math.sin(t * 5.5) * 0.3;
    const charging = opts.laserCharging || false;
    const chargeBoost = charging ? 1.5 : 1.0;

    ctx.save();

    // ── Outer arc-discharge ring ──────────────────────────────────────────
    const outerPts = 18;
    ctx.strokeStyle = rgba(0, 220, 255, 0.4 * pulse);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= outerPts; i++) {
        const angle = (i / outerPts) * Math.PI * 2;
        const jitter = Math.sin(t * 11 + i * 2.3) * size * 0.14;
        const r = size * 1.5 + jitter;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // ── Six radial lightning bolts ─────────────────────────────────────
    for (let i = 0; i < 6; i++) {
        const baseAngle = (i / 6) * Math.PI * 2 + t * 1.2;
        const opacity = 0.45 + Math.sin(t * 9 + i * 1.5) * 0.35;
        ctx.strokeStyle = rgba(120, 250, 255, opacity);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const numSteps = 5;
        for (let s = 1; s <= numSteps; s++) {
            const prog = s / numSteps;
            const boltX = Math.cos(baseAngle) * size * prog;
            const boltY = Math.sin(baseAngle) * size * prog;
            const perpX = -Math.sin(baseAngle);
            const perpY =  Math.cos(baseAngle);
            const jag = Math.sin(t * 15 + i * 3.1 + s * 7.3) * size * 0.2 * prog;
            ctx.lineTo(boltX + perpX * jag, boltY + perpY * jag);
        }
        ctx.stroke();
    }

    // ── Body: jagged electric star ────────────────────────────────────────
    const bodyPts = 10;
    ctx.fillStyle = '#000a10';
    ctx.strokeStyle = rgba(0, 255, 255, 0.85 + pulse * 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < bodyPts; i++) {
        const angle = (i / bodyPts) * Math.PI * 2;
        const jitter = Math.sin(t * 7 + i * 1.9) * size * 0.07;
        const r = (i % 2 === 0) ? size * 0.88 + jitter : size * 0.48 + jitter;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Inner sheen ────────────────────────────────────────────────────────
    ctx.strokeStyle = `rgba(0, 180, 255, 0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bodyPts; i++) {
        const angle = (i / bodyPts) * Math.PI * 2;
        const r = (i % 2 === 0) ? size * 0.52 : size * 0.28;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // ── Core glow ─────────────────────────────────────────────────────────
    const coreSize = size * (0.3 + pulse * 0.08) * chargeBoost;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0,    '#ffffff');
    coreGrad.addColorStop(0.25, '#88ffff');
    coreGrad.addColorStop(0.6,  '#0055ff');
    coreGrad.addColorStop(1,    'transparent');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = (0.8 + pulse * 0.2) * Math.min(chargeBoost, 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
}

/** PROWLER — armored missile fortress. opts: { radius, now }. */
export function drawEnemyProwlerShape(ctx, opts) {
    // Armored missile fortress — angular hull, visible warheads, targeting sensor array
    const size = opts.radius * 0.8;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.75 + Math.sin(t * 2.5) * 0.25;

    ctx.save();

    // ── Main armored hull (angular hexagon) ──────────────────────────────
    ctx.fillStyle = '#1a0028';
    ctx.strokeStyle = '#cc44ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Asymmetric angular hull — wider at rear
    ctx.moveTo( size * 1.1,  0);           // nose
    ctx.lineTo( size * 0.6,  size * 0.7);  // front flare r
    ctx.lineTo(-size * 0.5,  size * 0.9);  // rear r
    ctx.lineTo(-size * 1.1,  size * 0.4);  // rear spur r
    ctx.lineTo(-size * 1.1, -size * 0.4);  // rear spur l
    ctx.lineTo(-size * 0.5, -size * 0.9);  // rear l
    ctx.lineTo( size * 0.6, -size * 0.7);  // front flare l
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Armor plate seams ────────────────────────────────────────────────
    ctx.strokeStyle = '#8822cc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.4, 0);  ctx.lineTo(-size * 0.6, 0);
    ctx.moveTo(size * 0.0, size * 0.55);  ctx.lineTo(-size * 0.8, size * 0.35);
    ctx.moveTo(size * 0.0, -size * 0.55); ctx.lineTo(-size * 0.8, -size * 0.35);
    ctx.stroke();

    // ── Missile pods (3 tubes visible per side) ───────────────────────────
    for (const side of [-1, 1]) {
        const podY = side * size * 0.55;
        // Pod housing
        ctx.fillStyle = '#220033';
        ctx.strokeStyle = '#aa33ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(size * 0.1, podY - size * 0.22, size * 0.7, size * 0.44);
        ctx.fill();
        ctx.stroke();
        // Individual missile tubes
        for (let tube = 0; tube < 3; tube++) {
            const tubeX = size * (0.18 + tube * 0.2);
            const tubeY = podY;
            // Tube bore
            ctx.fillStyle = '#110022';
            ctx.beginPath();
            ctx.ellipse(tubeX, tubeY, size * 0.07, size * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
            // Warhead tip (purple glow if loaded)
            const tipGrad = ctx.createRadialGradient(tubeX, tubeY, 0, tubeX, tubeY, size * 0.08);
            tipGrad.addColorStop(0, rgba(220, 100, 255, 0.8 * pulse));
            tipGrad.addColorStop(1, 'rgba(100,0,180,0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.ellipse(tubeX, tubeY, size * 0.08, size * 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Targeting sensor array (rotating dish at nose) ───────────────────
    ctx.save();
    ctx.translate(size * 0.85, 0);
    ctx.rotate(t * 2.2); // spin
    ctx.strokeStyle = rgba(255, 100, 255, 0.7 * pulse);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size * 0.22, Math.sin(a) * size * 0.22);
        ctx.stroke();
    }
    ctx.restore();
    // Sensor center dot
    const sensorGrad = ctx.createRadialGradient(size * 0.85, 0, 0, size * 0.85, 0, size * 0.14 * pulse);
    sensorGrad.addColorStop(0, '#ffffff');
    sensorGrad.addColorStop(0.4, '#ff44ff');
    sensorGrad.addColorStop(1, 'rgba(180,0,200,0)');
    ctx.fillStyle = sensorGrad;
    ctx.beginPath();
    ctx.arc(size * 0.85, 0, size * 0.14 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Rear engine glows ─────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        const engGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.2, 0,
                                                  -size * 0.95, side * size * 0.2, size * 0.22);
        engGrad.addColorStop(0,   rgba(220, 100, 255, 0.9 * pulse));
        engGrad.addColorStop(0.5, 'rgba(100,0,180,0.4)');
        engGrad.addColorStop(1,   'rgba(60,0,120,0)');
        ctx.fillStyle = engGrad;
        ctx.beginPath();
        ctx.ellipse(-size * 0.95, side * size * 0.2, size * 0.22, size * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/** WEAVER — spinning-wheel pulse turret. opts: { radius, color, now,
 *  weaverState='', weaverStateStart=0, weaverSpinUpDuration=2400,
 *  weaverCooldownDuration=2600 }. With default (empty) state it renders
 *  the idle uncharged turret. */
export function drawEnemyWeaverShape(ctx, opts) {
    // Spinning wheel laser turret — shape and glow react to weaverState
    const size = opts.radius * 0.8;

    // Determine charge level: 0 during cooldown, 0→1 during spin_up, 1 during arc
    let charge = 0;
    const now = opts.now || 0;
    if (opts.weaverState === 'spinning_up') {
        charge = Math.min(1, (now - (opts.weaverStateStart || now)) / (opts.weaverSpinUpDuration || 2400));
        charge = charge * charge; // ease-in
    } else if (opts.weaverState === 'arcing') {
        charge = 1;
    } else if (opts.weaverState === 'cooldown') {
        const p = Math.min(1, (now - (opts.weaverStateStart || now)) / (opts.weaverCooldownDuration || 2600));
        charge = 1 - p;
    }

    // Outer glow ring scales with charge
    if (charge > 0.05) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#ffff00';
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 3 + charge * 4;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;

    // Outer body ring
    ctx.strokeStyle = opts.color;
    ctx.fillStyle = opts.color + '40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3 spoke arms (like a wheel / turbine)
    const spokeColor = charge > 0 ? `rgba(255, 255, ${Math.floor(200 * (1 - charge))}, 1)` : opts.color;
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        ctx.strokeStyle = spokeColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * size * 0.85, Math.sin(angle) * size * 0.85);
        ctx.stroke();

        // Tip nozzle
        const tx = Math.cos(angle) * size;
        const ty = Math.sin(angle) * size;
        ctx.fillStyle = charge > 0 ? '#ffffff' : opts.color;
        ctx.globalAlpha = 0.6 + charge * 0.4;
        ctx.beginPath();
        ctx.arc(tx, ty, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Central core — white-hot when fully charged
    const coreColor = charge > 0.8 ? '#ffffff' : opts.color;
    ctx.fillStyle = coreColor;
    ctx.shadowColor = '#ffff00';
    ctx.beginPath();
    ctx.arc(0, 0, size * (0.28 + charge * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

/** SENTINEL — orbital shield sentinel. opts: { radius, now }. */
export function drawEnemySentinelShape(ctx, opts) {
    // Orbital sentinel — nested spinning hex rings, rotating emitter arms
    const size = opts.radius * 0.8;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.8 + Math.sin(t * 3.2) * 0.2;
    const spinAngle = t * 0.8; // independent slow spin for decoration

    ctx.save();

    // ── Outer rotating hex ring ──────────────────────────────────────────
    ctx.save();
    ctx.rotate(spinAngle);
    ctx.strokeStyle = rgba(0, 255, 100, 0.5 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
        else         ctx.lineTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Inner counter-rotating hex ring ──────────────────────────────────
    ctx.save();
    ctx.rotate(-spinAngle * 1.4);
    ctx.strokeStyle = rgba(100, 255, 160, 0.6 * pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
        else         ctx.lineTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Emitter arms (6, rotating with faceAngle) ────────────────────────
    ctx.strokeStyle = '#00cc55';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const innerR = size * 0.28;
        const outerR = size * 0.75;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
        ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        ctx.stroke();
        // Emitter node at tip
        const glow = ctx.createRadialGradient(
            Math.cos(a) * outerR, Math.sin(a) * outerR, 0,
            Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse
        );
        glow.addColorStop(0,   '#ffffff');
        glow.addColorStop(0.4, '#00ff88');
        glow.addColorStop(1,   'rgba(0,200,80,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Solid inner hex hull ─────────────────────────────────────────────
    ctx.fillStyle = '#001a0a';
    ctx.strokeStyle = '#00ff55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
        else         ctx.lineTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Pulsing core ─────────────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.22 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#88ffcc');
    coreGrad.addColorStop(1,   'rgba(0,200,100,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/** WASP — sleek aggressive interceptor. opts: { radius, now }. */
export function drawEnemyWaspShape(ctx, opts) {
    // Sleek aggressive interceptor with glowing engine trails and blade wings
    const size = opts.radius * 0.8;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.85 + Math.sin(t * 6) * 0.15; // fast flicker like an insect

    ctx.save();

    // ── Engine exhaust glow (behind body) ────────────────────────────────
    for (const side of [-1, 1]) {
        const exhaustGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.18, 0,
                                                      -size * 0.95, side * size * 0.18, size * 0.35);
        exhaustGrad.addColorStop(0,   rgba(255, 220, 0, 0.9 * pulse));
        exhaustGrad.addColorStop(0.4, 'rgba(255,120,0,0.5)');
        exhaustGrad.addColorStop(1,   'rgba(200,80,0,0)');
        ctx.fillStyle = exhaustGrad;
        ctx.beginPath();
        ctx.ellipse(-size * 0.95, side * size * 0.18, size * 0.35, size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Razor blade wings ─────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        // Outer swept blade
        ctx.fillStyle = 'rgba(200,200,0,0.35)';
        ctx.strokeStyle = '#cccc00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(size * 0.15, 0);
        ctx.lineTo(size * 0.8,  side * size * 0.22);
        ctx.lineTo(-size * 0.05, side * size * 1.05);
        ctx.lineTo(-size * 0.65, side * size * 0.9);
        ctx.lineTo(-size * 0.75, side * size * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner secondary blade
        ctx.fillStyle = 'rgba(255,255,0,0.25)';
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-size * 0.1, 0);
        ctx.lineTo(-size * 0.3, side * size * 0.55);
        ctx.lineTo(-size * 0.65, side * size * 0.45);
        ctx.lineTo(-size * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing wing edge stripe
        ctx.strokeStyle = rgba(255, 255, 100, 0.7 * pulse);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(size * 0.7, side * size * 0.18);
        ctx.lineTo(-size * 0.05, side * size * 0.95);
        ctx.stroke();
    }

    // ── Abdomen (rear tapered segment) ────────────────────────────────────
    ctx.fillStyle = '#1a1a00';
    ctx.strokeStyle = '#aaaa00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-size * 0.45, 0, size * 0.55, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Abdomen stripes
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const x = -size * 0.25 - i * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, -size * 0.24);
        ctx.lineTo(x, size * 0.24);
        ctx.stroke();
    }

    // ── Thorax (center body) ──────────────────────────────────────────────
    const thoraxGrad = ctx.createRadialGradient(-size * 0.05, 0, 0, -size * 0.05, 0, size * 0.42);
    thoraxGrad.addColorStop(0,   '#ffff66');
    thoraxGrad.addColorStop(0.5, '#aaaa00');
    thoraxGrad.addColorStop(1,   '#333300');
    ctx.fillStyle = thoraxGrad;
    ctx.strokeStyle = '#ffff44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-size * 0.05, 0, size * 0.42, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ── Head + stinger ────────────────────────────────────────────────────
    ctx.fillStyle = '#222200';
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(size * 0.38, 0, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Eyes (two bright dots)
    for (const ey of [-1, 1]) {
        ctx.fillStyle = rgba(255, 255, 0, pulse);
        ctx.beginPath();
        ctx.arc(size * 0.44, ey * size * 0.1, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
    }
    // Stinger tip
    ctx.fillStyle = '#ffff88';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.75, 0);
    ctx.lineTo(size * 0.58, -size * 0.1);
    ctx.lineTo(size * 0.58,  size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

/** GUARDIAN — armored emerald fortress. opts: { radius, now }. */
export function drawEnemyGuardianShape(ctx, opts) {
    // Armored emerald fortress — glowing energy core, swept shield wings, battle scarred
    const size = opts.radius * 0.8;
    const pulse = 0.8 + Math.sin((opts.now || 0) * 0.004) * 0.2;

    ctx.save();

    // ── Outer shield ring ────────────────────────────────────────────────
    ctx.strokeStyle = rgba(0, 255, 80, 0.35 * pulse);
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Swept battle wings (large, aggressive) ───────────────────────────
    const wingColor = '#00bb44';
    const wingFill  = 'rgba(0,180,60,0.45)';
    ctx.lineWidth = 1.8;

    for (const side of [-1, 1]) {
        // Primary swept wing
        ctx.fillStyle = wingFill;
        ctx.strokeStyle = wingColor;
        ctx.beginPath();
        ctx.moveTo(size * 0.25, 0);            // root
        ctx.lineTo(size * 1.5,  side * size * 0.3);  // swept forward tip
        ctx.lineTo(size * 1.25, side * size * 0.9);  // outer tip
        ctx.lineTo(-size * 0.5, side * size * 1.1);  // rear outer
        ctx.lineTo(-size * 0.7, side * size * 0.35); // rear root
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Secondary rear blade
        ctx.fillStyle = 'rgba(0,200,70,0.3)';
        ctx.strokeStyle = '#00dd55';
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, side * size * 0.2);
        ctx.lineTo(-size * 1.2, side * size * 0.85);
        ctx.lineTo(-size * 0.95, side * size * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wing energy veins
        ctx.strokeStyle = rgba(120, 255, 160, 0.6 * pulse);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.1, side * size * 0.05);
        ctx.lineTo(size * 1.1, side * size * 0.55);
        ctx.moveTo(size * 0.0, side * size * 0.12);
        ctx.lineTo(size * 0.6, side * size * 0.75);
        ctx.stroke();
    }

    // ── Central hexagonal hull ───────────────────────────────────────────
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00ff66';
    ctx.fillStyle = '#001a08';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = size * (i % 2 === 0 ? 0.68 : 0.58); // alternating for interest
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Faceted armor panels ─────────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * Math.PI * 2;
        const a2 = ((i + 1) / 6) * Math.PI * 2;
        const brightness = i % 2 === 0 ? '88' : '44';
        ctx.fillStyle = '#00ff44' + brightness;
        ctx.strokeStyle = '#00cc33';
        ctx.lineWidth = 1;
        const r1 = size * (i % 2 === 0 ? 0.68 : 0.58);
        const r2 = size * ((i+1) % 2 === 0 ? 0.68 : 0.58);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Glowing energy core ──────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.32 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.25,'#aaffcc');
    coreGrad.addColorStop(0.6, '#00ff66');
    coreGrad.addColorStop(1,   'rgba(0,200,80,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Forward cannon barrel ────────────────────────────────────────────
    ctx.fillStyle = '#005522';
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(size * 0.55, -size * 0.1, size * 0.7, size * 0.2);
    ctx.fill();
    ctx.stroke();
    // Muzzle glow
    const muzzleGrad = ctx.createRadialGradient(size * 1.25, 0, 0, size * 1.25, 0, size * 0.18 * pulse);
    muzzleGrad.addColorStop(0, '#ffffff');
    muzzleGrad.addColorStop(0.4,'#00ff88');
    muzzleGrad.addColorStop(1, 'rgba(0,200,80,0)');
    ctx.fillStyle = muzzleGrad;
    ctx.beginPath();
    ctx.arc(size * 1.25, 0, size * 0.18 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/** TITAN — hexagonal juggernaut with independent turret. opts:
 *  { radius, now, tankTurretAngle=0, faceAngle=0 }. The turret's
 *  relative angle is `tankTurretAngle - faceAngle`; pass both 0 (the
 *  default) for a forward-pointing barrel. */
export function drawEnemyTitanShape(ctx, opts) {
    // Imposing hexagonal juggernaut with glowing energy core and armored plating
    const size = opts.radius * 0.9;
    const pulse = 0.85 + Math.sin((opts.now || 0) * 0.003) * 0.15; // 0.7–1.0 pulse

    ctx.save();

    // ── Outer armor ring (thick hex outline) ─────────────────────────────
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff44ff';
    ctx.fillStyle = '#1a0020';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = i === 0 ? 1.35 : 1.0; // forward stretch
        if (i === 0) ctx.moveTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
        else         ctx.lineTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Corner spikes on each hex vertex ─────────────────────────────────
    ctx.fillStyle = '#ff00ff';
    ctx.strokeStyle = '#ff88ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = i === 0 ? 1.35 : 1.0;
        const vx = Math.cos(a) * size * s;
        const vy = Math.sin(a) * size * s;
        const tipLen = size * 0.22;
        ctx.beginPath();
        ctx.moveTo(vx + Math.cos(a) * tipLen, vy + Math.sin(a) * tipLen);
        ctx.lineTo(vx + Math.cos(a + 0.35) * size * 0.15, vy + Math.sin(a + 0.35) * size * 0.15);
        ctx.lineTo(vx + Math.cos(a - 0.35) * size * 0.15, vy + Math.sin(a - 0.35) * size * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Inner hex with energy gradient ───────────────────────────────────
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.72);
    innerGrad.addColorStop(0,   'rgba(255, 80, 255, 0.9)');
    innerGrad.addColorStop(0.5, 'rgba(120, 0, 180, 0.7)');
    innerGrad.addColorStop(1,   'rgba(30, 0, 50, 0.5)');
    ctx.fillStyle = innerGrad;
    ctx.strokeStyle = '#cc00cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        else         ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Energy lines from center to hex midpoints ─────────────────────────
    ctx.strokeStyle = rgba(255, 180, 255, 0.4 * pulse);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6 + 1 / 12) * Math.PI * 2; // midpoints between vertices
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        ctx.stroke();
    }

    // ── Pulsing energy core ──────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.28 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#ff88ff');
    coreGrad.addColorStop(1,   'rgba(200, 0, 200, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Rear exhaust pods ────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        const podX = -size * 0.55;
        const podY = side * size * 0.38;
        const podGrad = ctx.createRadialGradient(podX, podY, 0, podX, podY, size * 0.22);
        podGrad.addColorStop(0,   rgba(255, 120, 255, 0.9 * pulse));
        podGrad.addColorStop(0.5, 'rgba(120, 0, 160, 0.6)');
        podGrad.addColorStop(1,   'rgba(60, 0, 80, 0)');
        ctx.fillStyle = podGrad;
        ctx.beginPath();
        ctx.ellipse(podX, podY, size * 0.22, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Turret (independently rotated) ───────────────────────────────────
    ctx.save();
    const turretAngle = opts.tankTurretAngle || 0;
    const relativeAngle = turretAngle - (opts.faceAngle || 0);
    ctx.rotate(relativeAngle);

    // Turret base ring
    ctx.fillStyle = '#2a0035';
    ctx.strokeStyle = '#ff44ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Barrel body
    const barrelLen = size * 1.5;
    const barrelW   = size * 0.13;
    ctx.fillStyle = '#aa00cc';
    ctx.strokeStyle = '#ff66ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(size * 0.28, -barrelW * 0.5, barrelLen, barrelW);
    ctx.fill();
    ctx.stroke();

    // Barrel highlight stripe
    ctx.strokeStyle = 'rgba(255,180,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.28, -barrelW * 0.12);
    ctx.lineTo(size * 0.28 + barrelLen * 0.9, -barrelW * 0.12);
    ctx.stroke();

    // Glowing muzzle tip
    const muzzleX = size * 0.28 + barrelLen;
    const muzzleGrad = ctx.createRadialGradient(muzzleX, 0, 0, muzzleX, 0, barrelW * 1.4 * pulse);
    muzzleGrad.addColorStop(0,   '#ffffff');
    muzzleGrad.addColorStop(0.4, '#ff88ff');
    muzzleGrad.addColorStop(1,   'rgba(200,0,200,0)');
    ctx.fillStyle = muzzleGrad;
    ctx.beginPath();
    ctx.arc(muzzleX, 0, barrelW * 1.4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // end turret

    ctx.restore(); // end main transform
}

/** STALKER — cloaked stealth interceptor with mantis blades. opts: { radius, now }. */
export function drawEnemyStalkerShape(ctx, opts) {
    // Cloaked stealth interceptor — mantis-like blade wings, plasma edges, shimmer
    const size = opts.radius * 0.92;
    const t = (opts.now || 0) * 0.001;
    const pulse = 0.75 + Math.sin(t * 4.2) * 0.25;
    const shimmer = Math.sin(t * 11.3) * 0.15; // fast flicker for cloak shimmer

    ctx.save();

    // ── Main hull — narrow swept fuselage ─────────────────────────────────
    ctx.fillStyle = '#000d10';
    ctx.strokeStyle = rgba(0, 220, 255, 0.75 + shimmer);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo( size * 1.3,  0);            // sharp nose tip
    ctx.lineTo( size * 0.4, -size * 0.22);  // upper shoulder
    ctx.lineTo(-size * 0.5, -size * 0.18);  // upper rear
    ctx.lineTo(-size * 0.75, 0);            // tail
    ctx.lineTo(-size * 0.5,  size * 0.18);  // lower rear
    ctx.lineTo( size * 0.4,  size * 0.22);  // lower shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Upper mantis blade arm ────────────────────────────────────────────
    ctx.fillStyle = `rgba(0, 30, 40, 0.85)`;
    ctx.strokeStyle = rgba(0, 255, 220, 0.65 + shimmer);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo( size * 0.55, -size * 0.2);   // root at hull
    ctx.lineTo( size * 1.05, -size * 0.85);  // blade tip (forward-angled)
    ctx.lineTo( size * 0.05, -size * 1.1);   // swept back wingtip
    ctx.lineTo(-size * 0.45, -size * 0.55);  // rear root
    ctx.lineTo(-size * 0.35, -size * 0.18);  // hull attach
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Lower mantis blade arm (mirror) ───────────────────────────────────
    ctx.beginPath();
    ctx.moveTo( size * 0.55,  size * 0.2);
    ctx.lineTo( size * 1.05,  size * 0.85);
    ctx.lineTo( size * 0.05,  size * 1.1);
    ctx.lineTo(-size * 0.45,  size * 0.55);
    ctx.lineTo(-size * 0.35,  size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Cloaking interference grid ────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.10 + Math.abs(shimmer) * 0.5;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
        const xOff = i * size * 0.22 + Math.sin(t * 8 + i * 1.7) * size * 0.04;
        ctx.beginPath();
        ctx.moveTo(xOff, -size * 0.2);
        ctx.lineTo(xOff,  size * 0.2);
        ctx.stroke();
    }
    ctx.restore();

    // ── Plasma edge glow (additive blend) ─────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * pulse;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    // Hull edge glow
    ctx.beginPath();
    ctx.moveTo( size * 1.3,  0);
    ctx.lineTo( size * 0.4, -size * 0.22);
    ctx.lineTo(-size * 0.5, -size * 0.18);
    ctx.lineTo(-size * 0.75, 0);
    ctx.lineTo(-size * 0.5,  size * 0.18);
    ctx.lineTo( size * 0.4,  size * 0.22);
    ctx.closePath();
    ctx.stroke();
    // Blade tip plasma accents
    ctx.globalAlpha = 0.55 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 1.05, -size * 0.85);
    ctx.lineTo(size * 0.05, -size * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 1.05,  size * 0.85);
    ctx.lineTo(size * 0.05,  size * 1.1);
    ctx.stroke();
    ctx.restore();

    // ── Rear engine exhaust pods ───────────────────────────────────────────
    const engGrad = ctx.createRadialGradient(-size * 0.75, 0, 0, -size * 0.75, 0, size * 0.3);
    engGrad.addColorStop(0,   rgba(200, 255, 255, pulse));
    engGrad.addColorStop(0.4, rgba(0, 180, 220, 0.6 * pulse));
    engGrad.addColorStop(1,   'rgba(0, 50, 80, 0)');
    ctx.fillStyle = engGrad;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(-size * 0.75, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Core sensor orb ────────────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(size * 0.15, 0, 0, size * 0.15, 0, size * 0.18);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#88ffff');
    coreGrad.addColorStop(1,   'rgba(0, 200, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = 0.9 * pulse;
    ctx.beginPath();
    ctx.arc(size * 0.15, 0, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
}

/**
 * Route an enemy kind string to its shape helper. `opts` carries
 * radius / color / now / per-type state. The ctx must be pre-translated
 * to the enemy center and pre-rotated to its facing (the helper does
 * not translate/rotate). Unknown types fall back to HUNTER.
 */
export function drawEnemyShapeByType(ctx, type, opts) {
    switch (type) {
        case 'HUNTER':    return drawEnemyHunterShape(ctx, opts);
        case 'GUARDIAN':  return drawEnemyGuardianShape(ctx, opts);
        case 'WASP':      return drawEnemyWaspShape(ctx, opts);
        case 'TITAN':     return drawEnemyTitanShape(ctx, opts);
        case 'STALKER':   return drawEnemyStalkerShape(ctx, opts);
        case 'TANGERINE': return drawEnemyTangerineShape(ctx, opts);
        case 'DRIFTER':   return drawEnemyDrifterShape(ctx, opts);
        case 'PROWLER':   return drawEnemyProwlerShape(ctx, opts);
        case 'WEAVER':    return drawEnemyWeaverShape(ctx, opts);
        case 'SENTINEL':  return drawEnemySentinelShape(ctx, opts);
        default:          return drawEnemyHunterShape(ctx, opts);
    }
}
