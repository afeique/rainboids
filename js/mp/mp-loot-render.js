// js/mp/mp-loot-render.js — MP loot renderers ported from single-player.
//
// Parity goal (see docs/MP_PARITY_PLAN.md): MP loot should look IDENTICAL to
// single-player. Gold gems + treasure-dust coins are drawn inline in
// mp-renderer's drawDrop (short Canvas2D recipes). HEALTH orbs are the heavy
// one — SP draws them as tumbling 3D polyhedra (tetrahedron / cube /
// octahedron / dodecahedron) with an additive cyan glow + specular sheen, via
// GameEngine._drawHealthShapesCanvas2D + _drawHealthShape3D. This module is a
// faithful port of that recipe so the MP client reproduces the exact look.
//
// The wire (sp-host _drops) sends each health orb's polyhedron `sh`, colour
// `c`, and radius `r` (all constant per orb → the delta codec sends them once).
// Per-orb rotation / tumble / twinkle are derived deterministically from the
// drop id so each orb animates independently (the wire stays lean — no
// per-frame rotation field), the same id-seed trick the gem/coin draws use.

/* ─── Health-shape 3D geometry (ported from game-engine.js HEALTH_SHAPE_GEOMETRY) ──
 *
 * Per shape: unit-radius vertex coordinates + a face list (each face's vertex
 * indices in CCW order viewed from outside). The painter's-algorithm renderer
 * only needs verts + faces (the SP edge lists were for the retired convex-hull
 * path), so they are omitted here.
 */
const _CUBE_S = 1 / Math.sqrt(3); // ≈ 0.577 — fits the 8 cube verts in a unit sphere
const HEALTH_SHAPE_GEOMETRY = (() => {
  // Cube
  const cubeVerts = [
    [-_CUBE_S, -_CUBE_S, -_CUBE_S], [_CUBE_S, -_CUBE_S, -_CUBE_S],
    [_CUBE_S, _CUBE_S, -_CUBE_S], [-_CUBE_S, _CUBE_S, -_CUBE_S],
    [-_CUBE_S, -_CUBE_S, _CUBE_S], [_CUBE_S, -_CUBE_S, _CUBE_S],
    [_CUBE_S, _CUBE_S, _CUBE_S], [-_CUBE_S, _CUBE_S, _CUBE_S],
  ];
  const cubeFaces = [
    [0, 3, 2, 1], // back
    [4, 5, 6, 7], // front
    [0, 1, 5, 4], // bottom
    [3, 7, 6, 2], // top
    [0, 4, 7, 3], // left
    [1, 2, 6, 5], // right
  ];

  // Octahedron — 6 verts on the unit axes, 8 triangular faces.
  const octVerts = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
  ];
  const octFaces = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [0, 5, 2], [2, 5, 1], [1, 5, 3], [3, 5, 0],
  ];

  // Tetrahedron — 4 verts on alternate cube corners (regular tet).
  const tetVerts = [
    [_CUBE_S, _CUBE_S, _CUBE_S],
    [_CUBE_S, -_CUBE_S, -_CUBE_S],
    [-_CUBE_S, _CUBE_S, -_CUBE_S],
    [-_CUBE_S, -_CUBE_S, _CUBE_S],
  ];
  const tetFaces = [
    [0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2],
  ];

  // Regular dodecahedron — 20 verts (golden-ratio coords), 12 pentagonal faces.
  const PHI = (1 + Math.sqrt(5)) / 2;
  const INV_PHI = 1 / PHI;
  const _DODECA_S = 0.6;
  const dodecaVerts = [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    [0, INV_PHI, PHI], [0, INV_PHI, -PHI], [0, -INV_PHI, PHI], [0, -INV_PHI, -PHI],
    [INV_PHI, PHI, 0], [INV_PHI, -PHI, 0], [-INV_PHI, PHI, 0], [-INV_PHI, -PHI, 0],
    [PHI, 0, INV_PHI], [PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI], [-PHI, 0, -INV_PHI],
  ].map(([x, y, z]) => [x * _DODECA_S, y * _DODECA_S, z * _DODECA_S]);
  const dodecaFaces = [
    [0, 16, 17, 1, 12], [0, 12, 14, 4, 8], [0, 8, 10, 2, 16],
    [1, 17, 3, 11, 9], [1, 9, 5, 14, 12], [2, 10, 6, 15, 13],
    [2, 13, 3, 17, 16], [3, 13, 15, 7, 11], [4, 14, 5, 19, 18],
    [4, 18, 6, 10, 8], [5, 9, 11, 7, 19], [6, 18, 19, 7, 15],
  ];

  return {
    cube: { verts: cubeVerts, faces: cubeFaces },
    octahedron: { verts: octVerts, faces: octFaces },
    tetrahedron: { verts: tetVerts, faces: tetFaces },
    dodecahedron: { verts: dodecaVerts, faces: dodecaFaces },
  };
})();

// Scratch buffers reused across draws so the GC isn't beaten up.
const PROJ_BUF = []; // each slot: [x, y, z]
const FACE_BUF = []; // { idx, depth } per front-facing face

/**
 * Project the geometry's 3D verts through a Rz·Ry·Rx rotation, then fill +
 * stroke front-facing faces back-to-front (painter's algorithm) so the body
 * reads as a SOLID object. Body fillStyle is set by the caller; `borderCol`
 * drives the stroke. (Faithful port of GameEngine._drawHealthShape3D.)
 */
function drawHealthShape3D(ctx, r, borderCol, geom, rotX, rotY, rotZ) {
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);

  const projected = PROJ_BUF;
  const verts = geom.verts;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    const vx = v[0], vy = v[1], vz = v[2];
    const y1 = vy * cx - vz * sx;
    const z1 = vy * sx + vz * cx;
    const x2 = vx * cy + z1 * sy;
    const z2 = -vx * sy + z1 * cy;
    const x3 = x2 * cz - y1 * sz;
    const y3 = x2 * sz + y1 * cz;
    const p = projected[i] || (projected[i] = [0, 0, 0]);
    p[0] = x3 * r;
    p[1] = -y3 * r; // canvas Y grows downward
    p[2] = z2;
  }

  const faces = geom.faces;
  const meta = FACE_BUF;
  meta.length = 0;
  for (let f = 0; f < faces.length; f++) {
    const face = faces[f];
    const a = projected[face[0]], b = projected[face[1]], c = projected[face[2]];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross >= 0) continue; // back-facing — skip
    let sumZ = 0;
    const fl = face.length;
    for (let k = 0; k < fl; k++) sumZ += projected[face[k]][2];
    meta.push({ idx: f, depth: sumZ / fl });
  }
  meta.sort((a, b) => a.depth - b.depth);

  const stroke = Math.max(1, Math.round(r * 0.10));
  ctx.lineWidth = stroke;
  ctx.strokeStyle = borderCol;
  for (let i = 0; i < meta.length; i++) {
    const face = faces[meta[i].idx];
    ctx.beginPath();
    const p0 = projected[face[0]];
    ctx.moveTo(p0[0], p0[1]);
    for (let k = 1; k < face.length; k++) {
      const p = projected[face[k]];
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Draw one health orb at d.{x,y} with the SP look: additive cyan bloom +
 * inner core + orbiting sparkle motes, the tumbling 3D polyhedron body, and a
 * glossy specular sheen on top. Animation seeds are derived from d.id so each
 * orb spins/tumbles/twinkles independently without the wire carrying any
 * per-frame state. (Faithful port of GameEngine._drawHealthShapesCanvas2D.)
 */
export function drawHealthOrb(ctx, d, now) {
  const t = (now || 0) * 0.001;
  const seed = (d.id || 0);

  // Per-orb animation, seeded from the drop id. Speeds mirror SP's ranges:
  //   Z spin     ~1.5–3.3 rad/s   (orb rotationSpeed·60)
  //   X/Y tumble ~0.3–0.8 rad/s   (tumbleSpeed·60)
  //   twinkle    2.5–4.5 rad/s
  const twPhase = (seed % 7) * 0.9;
  const twSpeed = 2.5 + (seed % 5) * 0.4;
  const zSgn = (seed & 1) ? 1 : -1;
  const xSgn = (seed & 2) ? 1 : -1;
  const ySgn = (seed & 4) ? 1 : -1;
  const rotZ = (seed % 17) * 0.37 + t * zSgn * (1.5 + (seed % 5) * 0.45);
  const rotX = (seed % 13) * 0.48 + t * xSgn * (0.3 + (seed % 4) * 0.12);
  const rotY = (seed % 11) * 0.57 + t * ySgn * (0.3 + (seed % 3) * 0.15);

  const wave = 0.5 + 0.5 * Math.sin(t * twSpeed + twPhase);
  const pulseMul = 0.94 + 0.18 * wave;
  const r = Math.max(4, Math.round((d.r || 13) * pulseMul));
  const alpha = 0.95;

  const geom = HEALTH_SHAPE_GEOMETRY[d.sh] || HEALTH_SHAPE_GEOMETRY.octahedron;
  const color = d.color || '#00aaff';

  ctx.save();
  ctx.translate(Math.round(d.x), Math.round(d.y));

  // ── Additive glow: bloom halo, inner core, sparkle ring (all behind body) ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const bloomR = r * (2.9 + 0.5 * wave);
  const bloom = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, bloomR);
  bloom.addColorStop(0.00, `rgba(120, 230, 255, ${alpha * 0.55})`);
  bloom.addColorStop(0.35, `rgba(60, 150, 255, ${alpha * 0.30})`);
  bloom.addColorStop(1.00, 'rgba(40, 100, 220, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath(); ctx.arc(0, 0, bloomR, 0, Math.PI * 2); ctx.fill();

  const coreR = r * (1.4 + 0.25 * wave);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
  core.addColorStop(0.00, `rgba(255, 255, 255, ${alpha * 0.65})`);
  core.addColorStop(0.45, `rgba(150, 240, 255, ${alpha * 0.35})`);
  core.addColorStop(1.00, 'rgba(80, 200, 255, 0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();

  const sparkA = t * 0.9 + twPhase;
  const sparkR = r * 1.55;
  for (let s = 0; s < 4; s++) {
    const a = sparkA + (s * Math.PI / 2);
    const sx = Math.cos(a) * sparkR;
    const sy = Math.sin(a) * sparkR;
    const sRad = r * 0.32;
    const sAlpha = alpha * (0.55 + 0.45 * Math.sin(t * 4 + s * 1.3));
    if (sAlpha <= 0) continue;
    const spark = ctx.createRadialGradient(sx, sy, 0, sx, sy, sRad);
    spark.addColorStop(0.00, `rgba(255, 255, 255, ${Math.min(1, sAlpha)})`);
    spark.addColorStop(0.55, `rgba(180, 230, 255, ${Math.min(1, sAlpha) * 0.4})`);
    spark.addColorStop(1.00, 'rgba(180, 230, 255, 0)');
    ctx.fillStyle = spark;
    ctx.beginPath(); ctx.arc(sx, sy, sRad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore(); // pop additive composite

  // ── 3D polyhedron body ──
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  drawHealthShape3D(ctx, r, '#001a33', geom, rotX, rotY, rotZ);

  // ── Glossy specular sheen on top, clipped to the orb silhouette ──
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2); ctx.clip();
  const sheenX = -r * 0.35, sheenY = -r * 0.4;
  const sheen = ctx.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, r * 0.85);
  sheen.addColorStop(0.00, `rgba(255, 255, 255, ${alpha * 0.85})`);
  sheen.addColorStop(0.45, `rgba(220, 240, 255, ${alpha * 0.32})`);
  sheen.addColorStop(1.00, 'rgba(220, 240, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.arc(sheenX, sheenY, r * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();
}
