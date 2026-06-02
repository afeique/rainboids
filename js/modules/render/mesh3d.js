// render/mesh3d.js
//
// v11.0.0 — a reusable 3D wireframe renderer. Generalizes the asteroid's
// dodecahedron projection into a glowing-edges-over-faint-fill drawer that the
// player + every enemy now use, so all entities read as vibrant vector-3D
// geometry instead of flat 2D silhouettes.
//
// v11.0.1 — PERFORMANCE: dropped per-edge `shadowBlur` (the dominant cost) in
// favour of a cheap two-pass additive glow (a fat translucent underlayer + a
// crisp bright core) with CACHED solid per-edge colours (no per-edge gradient
// object), and reuse module scratch arrays so complex composite meshes (the
// detailed ships) stay cheap even with many enemies on screen.
//
// A `mesh` is { verts:[{x,y,z}], edges:[[i,j]], faces?:[[i,j,k]] } in a unit-ish
// box; the caller scales by `radius`. The caller has already translated the ctx
// to the entity origin (and, for directional ships, rotated to facing); this
// renderer applies its own 3D tumble + perspective on top.

import { hsl, rgba } from '../core/color-cache.js';

const FOV = 340;
const _pts = [];      // reused projected-vertex scratch
let _order = [];      // reused face draw-order scratch

/**
 * Draw a mesh as a glowing rainbow wireframe with a faint translucent fill.
 * opts: { radius, rot:{x,y,z}, hue, hueSpread, sat, light, fill, now, glow,
 *         white(death flash) }
 */
export function drawMesh3D(ctx, mesh, opts = {}) {
    const verts = mesh.verts, edges = mesh.edges, faces = mesh.faces;
    const n = verts.length;
    const radius = opts.radius || 20;
    const rot = opts.rot || { x: 0, y: 0, z: 0 };
    const baseHue = opts.hue == null ? 200 : opts.hue;
    const spread = opts.hueSpread == null ? 60 : opts.hueSpread;
    const sat = opts.sat == null ? 92 : opts.sat;
    const light = opts.light == null ? 62 : opts.light;
    const doFill = opts.fill !== false && faces && faces.length;
    const now = opts.now || 0;
    const glow = opts.glow == null ? 1 : opts.glow;
    const white = !!opts.white;
    const drift = now * 0.04;

    // Project all verts (rotate Z→X→Y then perspective divide).
    const cosX = Math.cos(rot.x), sinX = Math.sin(rot.x);
    const cosY = Math.cos(rot.y), sinY = Math.sin(rot.y);
    const cosZ = Math.cos(rot.z), sinZ = Math.sin(rot.z);
    for (let i = _pts.length; i < n; i++) _pts[i] = { x: 0, y: 0, z: 0 };
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
        let x = verts[i].x * radius, y = verts[i].y * radius, z = verts[i].z * radius;
        let tx = x, ty = y;
        x = tx * cosZ - ty * sinZ; y = tx * sinZ + ty * cosZ;
        tx = y; let tz = z;
        y = tx * cosX - tz * sinX; z = tx * sinX + tz * cosX;
        tx = x; tz = z;
        x = tx * cosY + tz * sinY; z = -tx * sinY + tz * cosY;
        const s = FOV / (FOV + z);
        const p = _pts[i];
        p.x = x * s; p.y = y * s; p.z = z;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const zRange = (maxZ - minZ) || 1;

    ctx.save();

    // Faint translucent fill — painter-sorted (far first), backface-culled by
    // 2D winding so only front faces tint. Keeps silhouettes readable.
    if (doFill) {
        const nf = faces.length;
        if (_order.length < nf) _order = new Array(nf);
        for (let i = 0; i < nf; i++) _order[i] = i;
        // sort far→near using avg projected z (read from _pts)
        _order.length = nf;
        _order.sort((a, b) => {
            const fa = faces[a], fb = faces[b];
            const za = _pts[fa[0]].z + _pts[fa[1]].z + _pts[fa[2]].z;
            const zb = _pts[fb[0]].z + _pts[fb[1]].z + _pts[fb[2]].z;
            return zb - za;
        });
        for (let oi = 0; oi < nf; oi++) {
            const f = faces[_order[oi]];
            const p0 = _pts[f[0]], p1 = _pts[f[1]], p2 = _pts[f[2]];
            const area = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
            if (area <= 0) continue; // backface
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < f.length; k++) ctx.lineTo(_pts[f[k]].x, _pts[f[k]].y);
            ctx.closePath();
            const avgZ = (p0.z + p1.z + p2.z) / 3;
            const lit = 0.5 + 0.5 * ((avgZ - minZ) / zRange);
            ctx.globalAlpha = 0.14 + 0.13 * lit;
            ctx.fillStyle = white ? rgba(220, 235, 255, 1) : hsl((baseHue + drift) % 360, sat, 14 + 10 * lit);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // Glowing rainbow edges (additive). Each edge gets a single CACHED solid
    // colour at its midpoint hue (no per-edge gradient allocation); a fat
    // translucent underlayer fakes the bloom that `shadowBlur` used to cost.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const lwGlow = 2.6 + 1.6 * glow;
    for (let e = 0; e < edges.length; e++) {
        const i = edges[e][0], j = edges[e][1];
        const pa = _pts[i], pb = _pts[j];
        const hueMid = white ? 0 : (baseHue + ((i + j) / (2 * n)) * spread + drift) % 360;
        const avgZ = (pa.z + pb.z) / 2;
        const fade = 0.4 + 0.6 * ((avgZ - minZ) / zRange);
        const glowCol = white ? rgba(255, 255, 255, 1) : hsl(hueMid | 0, sat, light);
        const coreCol = white ? rgba(255, 255, 255, 1) : hsl(hueMid | 0, Math.min(100, sat + 6), Math.min(94, light + 26));
        // fat soft glow underlayer
        ctx.globalAlpha = fade * 0.42;
        ctx.strokeStyle = glowCol;
        ctx.lineWidth = lwGlow;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        // crisp bright core
        ctx.globalAlpha = fade;
        ctx.strokeStyle = coreCol;
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}
