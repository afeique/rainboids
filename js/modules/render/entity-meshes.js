// render/entity-meshes.js
//
// v11.0.1 — composite 3D wireframe meshes for the player + every enemy, each
// designed to echo its original 2D silhouette as a vector-3D equivalent:
//
//   HUNTER   — red swept-wing fighter (fuselage spindle + raked wings + cockpit)
//   WASP     — yellow interceptor (slim body + needle stinger + razor wings)
//   STALKER  — cyan mantis (narrow hull + forward-reaching blade arms)
//   GUARDIAN — emerald fortress (hex hull + shield ring + forward cannon + core)
//   PROWLER  — purple missile boat (hex body + side missile pods + nose sensor)
//   TITAN    — magenta juggernaut (chunky hex + corner spikes + top turret)
//   TANGERINE— orange spiked bomb (core + radial spikes)
//   DRIFTER  — cyan lightning star (interleaved tetrahedra / stella octangula)
//   WEAVER   — yellow spinning wheel (outer ring + hub + spokes + nozzles)
//   SENTINEL — green orbital shield (twin hex rings + diamond core + emitters)
//
// Meshes are built ONCE at module load from primitives via a compose()/place()
// rig, so per-frame cost is just the (cheap, shadowBlur-free) mesh3d draw.
// Directional fighters keep the caller's facing rotation (`kind:'ship'`);
// turret/station archetypes slowly spin (`kind:'spin'`).

import { drawMesh3D } from './mesh3d.js';
import { frameClock } from '../core/frame-clock.js';

// ── Composition rig ──────────────────────────────────────────────────────────
function _rot(x, y, z, rx, ry, rz) {
    let c = Math.cos(rz), s = Math.sin(rz); let x1 = x * c - y * s, y1 = x * s + y * c; x = x1; y = y1;
    c = Math.cos(rx); s = Math.sin(rx); let y2 = y * c - z * s, z2 = y * s + z * c; y = y2; z = z2;
    c = Math.cos(ry); s = Math.sin(ry); let x3 = x * c + z * s, z3 = -x * s + z * c; x = x3; z = z3;
    return [x, y, z];
}
/** Return a copy of `src` with a scale/rotate/translate transform applied. */
function place(src, t = {}) {
    const sx = t.sx != null ? t.sx : (t.s != null ? t.s : 1);
    const sy = t.sy != null ? t.sy : (t.s != null ? t.s : 1);
    const sz = t.sz != null ? t.sz : (t.s != null ? t.s : 1);
    const tx = t.tx || 0, ty = t.ty || 0, tz = t.tz || 0;
    const rx = t.rx || 0, ry = t.ry || 0, rz = t.rz || 0;
    const verts = src.verts.map(v => {
        const [x, y, z] = _rot(v.x * sx, v.y * sy, v.z * sz, rx, ry, rz);
        return { x: x + tx, y: y + ty, z: z + tz };
    });
    return { verts, edges: src.edges, faces: src.faces || [] };
}
/** Merge placed parts into a single mesh (offsets edge/face indices). */
function compose(parts) {
    const verts = [], edges = [], faces = [];
    for (const m of parts) {
        const b = verts.length;
        for (const v of m.verts) verts.push(v);
        for (const e of m.edges) edges.push([e[0] + b, e[1] + b]);
        if (m.faces) for (const f of m.faces) faces.push(f.map(i => i + b));
    }
    return { verts, edges, faces };
}

// ── Primitive generators ─────────────────────────────────────────────────────
function octahedron() {
    return {
        verts: [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }],
        edges: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]],
        faces: [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]],
    };
}
function cube() {
    const verts = [];
    for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1]) verts.push({ x, y, z });
    return {
        verts,
        edges: [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]],
        faces: [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]],
    };
}
function tetra() {
    return {
        verts: [{ x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }],
        edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    };
}
function tetraDual() {
    return {
        verts: [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: -1 }],
        edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    };
}
function prism(sides, halfZ) {
    const verts = [], edges = [], faces = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; verts.push({ x: Math.cos(a), y: Math.sin(a), z: halfZ }); }
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; verts.push({ x: Math.cos(a), y: Math.sin(a), z: -halfZ }); }
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        edges.push([i, ni], [sides + i, sides + ni], [i, sides + i]);
        faces.push([i, ni, sides + ni, sides + i]);
    }
    for (let i = 1; i < sides - 1; i++) faces.push([0, i, i + 1]);
    for (let i = 1; i < sides - 1; i++) faces.push([sides, sides + i + 1, sides + i]);
    return { verts, edges, faces };
}
function bipyramid(sides, halfZ) {
    const verts = [], edges = [], faces = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; verts.push({ x: Math.cos(a), y: Math.sin(a), z: 0 }); }
    const top = sides, bot = sides + 1;
    verts.push({ x: 0, y: 0, z: halfZ }, { x: 0, y: 0, z: -halfZ });
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        edges.push([i, ni], [i, top], [i, bot]);
        faces.push([top, i, ni], [bot, ni, i]);
    }
    return { verts, edges, faces };
}
function ringMesh(sides) {
    const verts = [], edges = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; verts.push({ x: Math.cos(a), y: Math.sin(a), z: 0 }); }
    for (let i = 0; i < sides; i++) edges.push([i, (i + 1) % sides]);
    return { verts, edges, faces: [] };
}
function plate(p0, p1, p2, p3) {
    return { verts: [p0, p1, p2, p3], edges: [[0, 1], [1, 2], [2, 3], [3, 0]], faces: [[0, 1, 2], [0, 2, 3]] };
}
function spikeTri(b0, b1, tip) {
    return { verts: [b0, b1, tip], edges: [[0, 1], [1, 2], [2, 0]], faces: [[0, 1, 2]] };
}
function strut(a, b) { return { verts: [a, b], edges: [[0, 1]], faces: [] }; }

const OCTA = octahedron();
const CUBE = cube();
const TETRA = tetra();
const TETRA_D = tetraDual();
const PRISM6 = prism(6, 0.6);
const RING6 = ringMesh(6);
const RING8 = ringMesh(8);
const BIPYR6 = bipyramid(6, 1);

// helper: N spikes from inner radius → outer radius around a ring in XY
function radialSpikes(n, rin, rout, z = 0, jitter = 0) {
    const parts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + jitter * i;
        parts.push(strut(
            { x: Math.cos(a) * rin, y: Math.sin(a) * rin, z },
            { x: Math.cos(a) * rout, y: Math.sin(a) * rout, z }));
    }
    return parts;
}

// ── Composite meshes ─────────────────────────────────────────────────────────
// Authored nose = -Y, wingspan = ±X, dorsal = +Z.

const M_HUNTER = compose([
    place(OCTA, { sx: 0.34, sy: 1.15, sz: 0.32 }),               // fuselage spindle
    place(OCTA, { sx: 0.2, sy: 0.3, sz: 0.22, ty: -0.18, tz: 0.26 }), // cockpit
    plate({ x: -0.12, y: -0.1, z: 0 }, { x: -0.6, y: 0.02, z: 0 }, { x: -1.05, y: 0.62, z: 0 }, { x: -0.14, y: 0.45, z: 0 }), // L wing
    plate({ x: 0.12, y: -0.1, z: 0 }, { x: 0.14, y: 0.45, z: 0 }, { x: 1.05, y: 0.62, z: 0 }, { x: 0.6, y: 0.02, z: 0 }),     // R wing
    strut({ x: -0.17, y: 0.5, z: 0 }, { x: -0.17, y: 0.98, z: 0 }), // L engine
    strut({ x: 0.17, y: 0.5, z: 0 }, { x: 0.17, y: 0.98, z: 0 }),   // R engine
]);

const M_WASP = compose([
    place(OCTA, { sx: 0.22, sy: 1.18, sz: 0.22 }),              // slim fuselage
    spikeTri({ x: -0.08, y: -0.85, z: 0 }, { x: 0.08, y: -0.85, z: 0 }, { x: 0, y: -1.55, z: 0 }), // stinger
    plate({ x: -0.1, y: 0.0, z: 0 }, { x: -0.85, y: 0.05, z: 0 }, { x: -1.12, y: 0.78, z: 0 }, { x: -0.1, y: 0.34, z: 0 }), // L razor wing
    plate({ x: 0.1, y: 0.0, z: 0 }, { x: 0.1, y: 0.34, z: 0 }, { x: 1.12, y: 0.78, z: 0 }, { x: 0.85, y: 0.05, z: 0 }),     // R razor wing
    place(OCTA, { s: 0.15, tx: -0.22, ty: 0.72 }),              // L engine
    place(OCTA, { s: 0.15, tx: 0.22, ty: 0.72 }),               // R engine
]);

const M_STALKER = compose([
    place(OCTA, { sx: 0.26, sy: 1.1, sz: 0.26 }),               // narrow hull
    plate({ x: -0.12, y: 0.12, z: 0 }, { x: -0.18, y: -0.5, z: 0 }, { x: -0.42, y: -1.08, z: 0.06 }, { x: -0.52, y: -0.3, z: 0.06 }), // L mantis blade
    plate({ x: 0.12, y: 0.12, z: 0 }, { x: 0.52, y: -0.3, z: 0.06 }, { x: 0.42, y: -1.08, z: 0.06 }, { x: 0.18, y: -0.5, z: 0 }),     // R mantis blade
    place(OCTA, { s: 0.16, ty: -0.12, tz: 0.24 }),              // sensor orb
]);

const M_GUARDIAN = compose([
    place(PRISM6, { sx: 0.72, sy: 0.72, sz: 0.5 }),             // hex hull
    place(RING6, { sx: 1.18, sy: 1.18, tz: 0.14 }),            // shield ring
    place(CUBE, { sx: 0.12, sy: 0.42, sz: 0.12, ty: -0.92 }),   // forward cannon
    place(OCTA, { s: 0.3 }),                                     // energy core
]);

const M_PROWLER = compose([
    place(PRISM6, { sx: 0.6, sy: 0.82, sz: 0.34 }),            // elongated hex body
    place(CUBE, { sx: 0.17, sy: 0.5, sz: 0.17, tx: -0.74 }),    // L missile pod
    place(CUBE, { sx: 0.17, sy: 0.5, sz: 0.17, tx: 0.74 }),     // R missile pod
    place(OCTA, { s: 0.18, ty: -0.78 }),                        // nose sensor
    place(RING6, { sx: 0.32, sy: 0.32, ty: -0.78, tz: 0.02 }), // sensor dish
]);

const M_TITAN = compose([
    place(PRISM6, { sx: 0.9, sy: 0.9, sz: 0.55 }),             // chunky hex body
    ...radialSpikes(6, 0.9, 1.4, 0),                            // corner spikes
    place(CUBE, { sx: 0.32, sy: 0.32, sz: 0.18, tz: 0.62 }),    // turret base
    place(CUBE, { sx: 0.1, sy: 0.5, sz: 0.1, ty: -0.45, tz: 0.62 }), // barrel
]);

const M_TANGERINE = compose([
    place(OCTA, { s: 0.62 }),                                   // bomb core
    ...radialSpikes(8, 0.5, 1.3, 0),
    ...radialSpikes(4, 0.5, 1.15, 0, 0.39),                     // offset spikes for density
    strut({ x: 0, y: 0, z: 0.55 }, { x: 0, y: 0, z: 1.25 }),    // top spike
    strut({ x: 0, y: 0, z: -0.55 }, { x: 0, y: 0, z: -1.25 }),  // bottom spike
]);

const M_DRIFTER = compose([
    place(TETRA, { s: 0.85 }),                                  // stella octangula = a sharp 8-point star
    place(TETRA_D, { s: 0.85 }),
    place(OCTA, { s: 0.3 }),                                    // bright core
]);

const M_WEAVER = compose([
    place(RING8, { sx: 0.98, sy: 0.98 }),                       // outer wheel
    place(OCTA, { s: 0.24 }),                                   // hub
    strut({ x: 0, y: 0, z: 0 }, { x: 0.98, y: 0, z: 0 }),       // 3 spokes
    strut({ x: 0, y: 0, z: 0 }, { x: -0.49, y: 0.85, z: 0 }),
    strut({ x: 0, y: 0, z: 0 }, { x: -0.49, y: -0.85, z: 0 }),
    place(CUBE, { s: 0.12, tx: 0.98 }),                          // nozzles on the rim
    place(CUBE, { s: 0.12, tx: -0.49, ty: 0.85 }),
    place(CUBE, { s: 0.12, tx: -0.49, ty: -0.85 }),
]);

const M_SENTINEL = compose([
    place(RING6, { sx: 1.0, sy: 1.0, tz: 0.18 }),              // outer hex ring
    place(RING6, { sx: 0.62, sy: 0.62, tz: -0.18, rz: Math.PI / 6 }), // inner counter ring
    place(BIPYR6, { s: 0.4 }),                                  // diamond core
    ...radialSpikes(6, 0.4, 1.0, 0.18),                         // emitter arms to outer ring
]);

const M_PLAYER = compose([
    place(OCTA, { sx: 0.3, sy: 1.18, sz: 0.3 }),               // fuselage
    place(OCTA, { sx: 0.18, sy: 0.32, sz: 0.2, ty: -0.1, tz: 0.26 }), // canopy
    plate({ x: -0.1, y: -0.05, z: 0 }, { x: -0.95, y: 0.55, z: 0 }, { x: -0.3, y: 0.7, z: 0 }, { x: -0.12, y: 0.4, z: 0 }), // L delta wing
    plate({ x: 0.1, y: -0.05, z: 0 }, { x: 0.12, y: 0.4, z: 0 }, { x: 0.3, y: 0.7, z: 0 }, { x: 0.95, y: 0.55, z: 0 }),     // R delta wing
    spikeTri({ x: 0, y: 0.1, z: 0 }, { x: 0, y: 0.6, z: 0 }, { x: 0, y: 0.35, z: 0.4 }),                                    // dorsal fin
]);

// ── Per-type config ──────────────────────────────────────────────────────────
const TYPE_MESH = {
    HUNTER:    { mesh: M_HUNTER,    hue: 2,   spread: 44,  scale: 1.4,  kind: 'ship' },
    WASP:      { mesh: M_WASP,      hue: 52,  spread: 40,  scale: 1.2,  kind: 'ship' },
    STALKER:   { mesh: M_STALKER,   hue: 188, spread: 56,  scale: 1.3,  kind: 'ship' },
    GUARDIAN:  { mesh: M_GUARDIAN,  hue: 145, spread: 70,  scale: 1.35, kind: 'ship' },
    PROWLER:   { mesh: M_PROWLER,   hue: 282, spread: 64,  scale: 1.3,  kind: 'ship' },
    TITAN:     { mesh: M_TITAN,     hue: 300, spread: 84,  scale: 1.55, kind: 'spin', spin: 0.0007 },
    TANGERINE: { mesh: M_TANGERINE, hue: 28,  spread: 60,  scale: 1.25, kind: 'spin', spin: 0.0016 },
    DRIFTER:   { mesh: M_DRIFTER,   hue: 192, spread: 150, scale: 1.3,  kind: 'spin', spin: 0.0024 },
    WEAVER:    { mesh: M_WEAVER,    hue: 52,  spread: 110, scale: 1.25, kind: 'spin', spin: 0.0028 },
    SENTINEL:  { mesh: M_SENTINEL,  hue: 150, spread: 86,  scale: 1.3,  kind: 'spin', spin: 0.0015 },
};
const DEFAULT_CFG = TYPE_MESH.HUNTER;

function _seed(enemy) {
    if (enemy._meshSeed === undefined) {
        enemy._meshSeed = ((enemy.x | 0) * 0.013 + (enemy.y | 0) * 0.017) % 6.283;
    }
    return enemy._meshSeed;
}

/** Render an enemy as a glowing 3D wireframe solid. The caller (enemy.draw) has
 *  translated to the enemy origin + rotated to facing (faceAngle, 0 = +X). */
export function drawEnemyMesh3D(ctx, enemy) {
    const cfg = TYPE_MESH[enemy.type] || DEFAULT_CFG;
    const now = frameClock.now || 0;
    const r = (enemy.radius || 18) * (cfg.scale || 1);
    const white = !!enemy._deathFlashRendering;
    const seed = _seed(enemy);
    let rot;
    if (cfg.kind === 'ship') {
        // Orient the -Y nose to +X (rot.z=π/2) so facing (applied by caller)
        // points it at the target; add a gentle live bank.
        rot = {
            x: 0.42 + Math.sin(now * 0.002 + seed) * 0.18,
            y: Math.sin(now * 0.0015 + seed) * 0.34,
            z: Math.PI / 2,
        };
    } else {
        // Tilt to reveal depth + slow spin around the view axis.
        rot = {
            x: 0.52 + Math.sin(now * 0.0009 + seed) * 0.1,
            y: Math.sin(now * 0.0011 + seed) * 0.1,
            z: now * (cfg.spin || 0.0015) + seed,
        };
    }
    const charging = !!(enemy.charging || enemy.isCharging);
    drawMesh3D(ctx, cfg.mesh, {
        radius: r, rot, hue: cfg.hue, hueSpread: cfg.spread, now, white,
        glow: charging ? 1.9 : 1, light: charging ? 74 : 60, sat: 92,
    });
}

/** Render the player ship as a glowing 3D wireframe fighter. Caller has
 *  translated + rotated to facing (angle+π/2, so the -Y nose points along aim). */
export function drawPlayerMesh3D(ctx, opts = {}) {
    const now = frameClock.now || 0;
    drawMesh3D(ctx, M_PLAYER, {
        radius: (opts.radius || 14) * 1.5,
        rot: { x: 0.36 + Math.sin(now * 0.0022) * 0.1, y: Math.sin(now * 0.0015) * 0.16, z: 0 },
        hue: opts.hue == null ? 190 : opts.hue,
        hueSpread: 80,
        now,
        glow: opts.glow == null ? 1.15 : opts.glow,
        white: !!opts.white,
        light: 64, sat: 95,
    });
}

export { drawMesh3D };
