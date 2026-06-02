// render/mesh3d.js
//
// v11.0.0 — a reusable 3D wireframe renderer. Generalizes the asteroid's
// dodecahedron projection into a glowing-edges-over-faint-fill drawer that the
// player + every enemy now use, so all entities read as vibrant vector-3D
// geometry instead of flat 2D silhouettes.
//
// A `mesh` is { verts:[{x,y,z}], edges:[[i,j]], faces?:[[i,j,k]] } in a unit-ish
// box; the caller scales by `radius`. The caller has already translated the ctx
// to the entity origin (and, for directional ships, rotated to facing); this
// renderer applies its own 3D tumble + perspective on top.

import { hsl, rgba } from '../core/color-cache.js';

const FOV = 340;
const _scratch = [];

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
    const doFill = opts.fill !== false;
    const now = opts.now || 0;
    const glow = opts.glow == null ? 1 : opts.glow;
    const white = !!opts.white;
    const drift = now * 0.04;

    // Project all verts (rotate Z→X→Y then perspective divide).
    const cosX = Math.cos(rot.x), sinX = Math.sin(rot.x);
    const cosY = Math.cos(rot.y), sinY = Math.sin(rot.y);
    const cosZ = Math.cos(rot.z), sinZ = Math.sin(rot.z);
    if (_scratch.length < n) { for (let i = _scratch.length; i < n; i++) _scratch[i] = { x: 0, y: 0, z: 0 }; }
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
        const p = _scratch[i];
        p.x = x * s; p.y = y * s; p.z = z;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const zRange = (maxZ - minZ) || 1;

    ctx.save();

    // Faint translucent fill — painter-sorted (far first), backface-culled by
    // 2D winding so only front faces tint. Keeps silhouettes readable.
    if (doFill && faces && faces.length) {
        const order = faces.map((f, idx) => idx).sort((a, b) => {
            const fa = faces[a], fb = faces[b];
            const za = (_scratch[fa[0]].z + _scratch[fa[1]].z + _scratch[fa[2]].z);
            const zb = (_scratch[fb[0]].z + _scratch[fb[1]].z + _scratch[fb[2]].z);
            return zb - za;
        });
        for (const idx of order) {
            const f = faces[idx];
            const p0 = _scratch[f[0]], p1 = _scratch[f[1]], p2 = _scratch[f[2]];
            // 2D signed area → cull backfaces.
            const area = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
            if (area <= 0) continue;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            for (let k = 1; k < f.length; k++) ctx.lineTo(_scratch[f[k]].x, _scratch[f[k]].y);
            ctx.closePath();
            const avgZ = (p0.z + p1.z + p2.z) / 3;
            const lit = 0.5 + 0.5 * ((avgZ - minZ) / zRange);
            ctx.globalAlpha = 0.16 + 0.14 * lit;
            ctx.fillStyle = white ? rgba(220, 235, 255, 1) : hsl((baseHue + drift) % 360, sat, 14 + 10 * lit);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // Glowing rainbow edges (additive). Per-vertex hue sweep → each edge is a
    // gradient; depth fades far edges.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (let e = 0; e < edges.length; e++) {
        const i = edges[e][0], j = edges[e][1];
        const pa = _scratch[i], pb = _scratch[j];
        const ha = white ? 0 : (baseHue + (i / n) * spread + drift) % 360;
        const hb = white ? 0 : (baseHue + (j / n) * spread + drift) % 360;
        const avgZ = (pa.z + pb.z) / 2;
        const fade = 0.45 + 0.55 * ((avgZ - minZ) / zRange);
        const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
        if (white) {
            grad.addColorStop(0, rgba(255, 255, 255, 1));
            grad.addColorStop(1, rgba(255, 255, 255, 1));
        } else {
            grad.addColorStop(0, hsl(ha, sat, light));
            grad.addColorStop(1, hsl(hb, sat, light));
        }
        ctx.globalAlpha = fade;
        // soft glow underlayer
        ctx.strokeStyle = grad;
        ctx.shadowColor = white ? '#ffffff' : hsl(((ha + hb) / 2) | 0, sat, light);
        ctx.shadowBlur = 9 * glow;
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        // crisp bright core
        ctx.shadowBlur = 0;
        ctx.strokeStyle = white ? rgba(255, 255, 255, 1) : hsl(((ha + hb) / 2) | 0, Math.min(100, sat + 6), Math.min(92, light + 24));
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}
