// render/entity-meshes.js
//
// v11.0.0 — 3D wireframe meshes for the player + every enemy archetype, plus
// the draw helpers that route their `.draw()` through mesh3d. Meshes are
// parametric solids (built once at module load); per-type config picks the
// solid, a theme hue, a rainbow spread, and a scale. Directional fighters
// (`ship:true`) keep the caller's facing rotation and only add a subtle bank;
// geometric drones free-tumble for a vivid vector-3D feel.

import { drawMesh3D } from './mesh3d.js';
import { frameClock } from '../core/frame-clock.js';

// ── Mesh builders ────────────────────────────────────────────────────────────
function octahedron(sx = 1, sy = 1, sz = 1) {
    const verts = [
        { x: sx, y: 0, z: 0 }, { x: -sx, y: 0, z: 0 },
        { x: 0, y: sy, z: 0 }, { x: 0, y: -sy, z: 0 },
        { x: 0, y: 0, z: sz }, { x: 0, y: 0, z: -sz },
    ];
    const edges = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
    const faces = [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]];
    return { verts, edges, faces };
}

function cube(sx = 1, sy = 1, sz = 1) {
    const verts = [];
    for (const z of [-sz, sz]) for (const y of [-sy, sy]) for (const x of [-sx, sx]) verts.push({ x, y, z });
    // index = ((z>0)<<2)|((y>0)<<1)|(x>0)
    const edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    return { verts, edges, faces };
}

function prism(sides, r, halfZ) {
    const verts = [], edges = [], faces = [];
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: halfZ });   // top ring
    }
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -halfZ });  // bottom ring
    }
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        edges.push([i, ni]);                       // top ring
        edges.push([sides + i, sides + ni]);       // bottom ring
        edges.push([i, sides + i]);                // vertical
        faces.push([i, ni, sides + ni, sides + i]); // side quad
    }
    // caps as fans
    for (let i = 1; i < sides - 1; i++) faces.push([0, i, i + 1]);
    for (let i = 1; i < sides - 1; i++) faces.push([sides, sides + i + 1, sides + i]);
    return { verts, edges, faces };
}

function bipyramid(sides, r, halfZ) {
    const verts = [], edges = [], faces = [];
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
    }
    const top = sides, bot = sides + 1;
    verts.push({ x: 0, y: 0, z: halfZ });
    verts.push({ x: 0, y: 0, z: -halfZ });
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        edges.push([i, ni]);
        edges.push([i, top]);
        edges.push([i, bot]);
        faces.push([top, i, ni]);
        faces.push([bot, ni, i]);
    }
    return { verts, edges, faces };
}

// Directional fighter wedge — nose at -Y, slim in Z, swept wings.
function dart() {
    const verts = [
        { x: 0, y: -1.25, z: 0 },     // 0 nose
        { x: -0.9, y: 0.55, z: 0 },   // 1 left wing
        { x: 0.9, y: 0.55, z: 0 },    // 2 right wing
        { x: 0, y: 0.3, z: 0 },       // 3 tail
        { x: 0, y: -0.1, z: 0.42 },   // 4 dorsal
        { x: 0, y: -0.1, z: -0.42 },  // 5 ventral
    ];
    const edges = [
        [0, 1], [0, 2], [1, 3], [2, 3], [0, 3],
        [0, 4], [4, 1], [4, 2], [4, 3],
        [0, 5], [5, 1], [5, 2], [5, 3],
    ];
    const faces = [
        [0, 1, 4], [0, 4, 2], [0, 5, 1], [0, 2, 5],
        [1, 3, 4], [4, 3, 2], [1, 5, 3], [3, 5, 2],
    ];
    return { verts, edges, faces };
}

const DART = dart();
const OCTA = octahedron(1, 1.15, 1);
const CUBE = cube(0.92, 0.92, 0.92);
const HEXPRISM = prism(6, 1, 0.6);
const HEXBIPYR = bipyramid(6, 1, 1.15);
const STAR = octahedron(1.25, 1.25, 1.25); // pointier crystal for spiky archetypes

// ── Per-type config ──────────────────────────────────────────────────────────
const TYPE_MESH = {
    HUNTER:    { mesh: DART,     hue: 2,   spread: 38,  scale: 1.3,  ship: true },
    WASP:      { mesh: DART,     hue: 52,  spread: 34,  scale: 1.05, ship: true },
    STALKER:   { mesh: DART,     hue: 188, spread: 52,  scale: 1.2,  ship: true },
    GUARDIAN:  { mesh: OCTA,     hue: 145, spread: 64,  scale: 1.25 },
    DRIFTER:   { mesh: STAR,     hue: 192, spread: 130, scale: 1.15 },
    PROWLER:   { mesh: HEXPRISM, hue: 282, spread: 60,  scale: 1.15 },
    WEAVER:    { mesh: OCTA,     hue: 52,  spread: 90,  scale: 1.05 },
    SENTINEL:  { mesh: HEXBIPYR, hue: 150, spread: 72,  scale: 1.2 },
    TANGERINE: { mesh: STAR,     hue: 28,  spread: 50,  scale: 1.05 },
    TITAN:     { mesh: CUBE,     hue: 300, spread: 76,  scale: 1.35 },
};
const DEFAULT_CFG = TYPE_MESH.HUNTER;

function _seed(enemy) {
    if (enemy._meshSeed === undefined) {
        enemy._meshSeed = ((enemy.x | 0) * 0.013 + (enemy.y | 0) * 0.017) % 6.283;
    }
    return enemy._meshSeed;
}

/** Render an enemy as a glowing 3D wireframe solid. The caller (enemy.draw)
 *  has already translated to the enemy origin + rotated to facing. */
export function drawEnemyMesh3D(ctx, enemy) {
    const cfg = TYPE_MESH[enemy.type] || DEFAULT_CFG;
    const now = frameClock.now || 0;
    const r = (enemy.radius || 18) * (cfg.scale || 1);
    const white = !!enemy._deathFlashRendering;
    const seed = _seed(enemy);
    let rot;
    if (cfg.ship) {
        // enemy.draw rotates by faceAngle (0 = +X). Orient the dart's nose to
        // +X (rot.z = π/2) so it points along facing, plus a live bank.
        rot = {
            x: 0.45 + Math.sin(now * 0.002 + seed) * 0.22,
            y: Math.sin(now * 0.0016 + seed) * 0.42,
            z: Math.PI / 2,
        };
    } else {
        rot = { x: now * 0.0011 + seed, y: now * 0.0014 + seed * 1.7, z: now * 0.0005 };
    }
    const charging = !!(enemy.charging || enemy.isCharging || enemy.isCharging === 1);
    drawMesh3D(ctx, cfg.mesh, {
        radius: r, rot, hue: cfg.hue, hueSpread: cfg.spread, now, white,
        glow: charging ? 1.9 : 1, light: charging ? 74 : 60,
        sat: 92,
    });
}

const PLAYER_MESH = dart();
/** Render the player ship as a glowing 3D wireframe dart. Caller has
 *  translated + rotated to facing (nose -Y). */
export function drawPlayerMesh3D(ctx, opts = {}) {
    const now = frameClock.now || 0;
    drawMesh3D(ctx, PLAYER_MESH, {
        radius: (opts.radius || 14) * 1.5,
        rot: { x: 0.4 + Math.sin(now * 0.0022) * 0.12, y: Math.sin(now * 0.0015) * 0.18, z: 0 },
        hue: opts.hue == null ? 190 : opts.hue,
        hueSpread: 70,
        now,
        glow: opts.glow == null ? 1.1 : opts.glow,
        white: !!opts.white,
        light: 64,
        sat: 95,
    });
}

export { drawMesh3D };
