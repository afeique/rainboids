// WebGL starfield sprite atlas — baked once at module load. A single
// 1024×128 RGBA texture packed with eight 128×128 slots in a horizontal
// row. Each slot holds a grayscale-with-alpha shape that the fragment
// shader multiplies by the per-instance color, so one atlas covers
// every shape variation for the migrated star types.
//
// Slot layout (left → right):
//   0: dot       — soft circle (background stars + 'circle'/'point' decoratives)
//   1: diamond   — square rotated 45°
//   2: triangle  — equilateral triangle outline (filled)
//   3: hexagon   — regular hexagon outline (filled)
//   4: star4     — 4-pointed star
//   5: star5     — 5-pointed star
//   6: star6     — 6-pointed star
//   7: star8     — 8-pointed star
//
// Shapes are SOLID-FILLED in the atlas (vs the particle atlas which
// has soft falloffs). For background stars and small decoratives the
// renderer uses small quad sizes (≤6px) so the solid-fill texel is
// effectively a tiny dot anyway. Larger color stars get the full
// silhouette. Each shape sits inside the slot with ~8px padding so
// rotation doesn't clip at the edges.

// 5.74.22 — atlas extended with 4 new 3D-shape slots (cube, octahedron,
// tetrahedron, prism). The renderer's grayscale-with-alpha texel times
// per-instance color preserves silhouette tinting; internal 3D edges
// are painted as semi-transparent strokes so the shape reads as a
// dimensional solid without per-vertex shading data.
export const SLOT = 128;
export const NUM_SLOTS = 13;
export const ATLAS_W = SLOT * NUM_SLOTS;
export const ATLAS_H = 128;

// Per-slot UV rectangle (normalized [0..1]). The renderer uses the
// SLOT_INDEX → uOffset/uScale mapping in the vertex shader.
export const STAR_SLOT_INDEX = {
    dot:         0,
    diamond:     1,
    triangle:    2,
    hexagon:     3,
    star4:       4,
    star5:       5,
    star6:       6,
    star8:       7,
    cloud:       8,
    cube:        9,
    octahedron:  10,
    tetrahedron: 11,
    prism:       12,
};

// Shape names that map straight onto an atlas slot (no special handling).
// Anything NOT in this set should stay on Canvas (sparkle, burst, etc).
export const WEBGL_STAR_SHAPES = new Set(Object.keys(STAR_SLOT_INDEX));

/**
 * Bake the atlas into an offscreen canvas. Caller uploads via
 * `texImage2D`. Idempotent — a fresh canvas is built each call, so
 * it's safe to re-bake on context restore.
 */
export function buildStarfieldAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

    // Slot 0 — dot: soft circular falloff. Same recipe as the particle
    // dot but a hair tighter; works for both small background stars
    // and small decorative 'circle'/'point' shapes.
    paintRadialDot(ctx, 0);
    // Slots 1-7 — solid-filled silhouettes painted via Canvas2D paths.
    paintShape(ctx, 1, drawDiamond);
    paintShape(ctx, 2, drawTriangle);
    paintShape(ctx, 3, drawHexagon);
    paintShape(ctx, 4, (cx, cy, r, c) => drawNStar(c, cx, cy, r, 4, 0.45));
    paintShape(ctx, 5, (cx, cy, r, c) => drawNStar(c, cx, cy, r, 5, 0.42));
    paintShape(ctx, 6, (cx, cy, r, c) => drawNStar(c, cx, cy, r, 6, 0.5));
    paintShape(ctx, 7, (cx, cy, r, c) => drawNStar(c, cx, cy, r, 8, 0.5));
    // Slot 8 — soft cloud (very wide gaussian falloff). Used by the
    // WebGL nebula layer, drawn at huge sizes with low alpha.
    paintCloudBlob(ctx, 8);
    // Slots 9-12 — 3D solids. Drawn as outline silhouette + internal
    // edges in semi-transparent white so the shape reads dimensional.
    paintShape3D(ctx, 9, drawCube);
    paintShape3D(ctx, 10, drawOctahedron);
    paintShape3D(ctx, 11, drawTetrahedron);
    paintShape3D(ctx, 12, drawPrism);

    return canvas;
}

// Paint a 3D-style shape: outline silhouette filled at full alpha,
// internal edges stroked at ~55% alpha so the shape reads as a solid
// with depth. Same SLOT-padding contract as `paintShape`.
function paintShape3D(ctx, slotIndex, drawFn) {
    const slotX = slotIndex * SLOT;
    const cx = slotX + SLOT / 2;
    const cy = SLOT / 2;
    const radius = SLOT / 2 - 8;
    ctx.save();
    drawFn(cx, cy, radius, ctx);
    ctx.restore();
}

// Cube — isometric hexagonal silhouette with 3 internal edges meeting
// at the front vertex (the classic "Y" cube projection).
function drawCube(cx, cy, r, ctx) {
    // Hex outline (6 vertices at 60° increments, top vertex at -π/2).
    const verts = [];
    for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        verts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    // Filled silhouette.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(verts[i][0], verts[i][1]);
    ctx.closePath();
    ctx.fill();

    // 3 internal edges from center to top, lower-left, lower-right
    // verts (forming the iso "Y"). Drawn slightly darker (lower alpha)
    // so they read as inset edges against the silhouette.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    // From center to top vertex (verts[0])
    ctx.moveTo(cx, cy);
    ctx.lineTo(verts[0][0], verts[0][1]);
    // From center to lower-left (verts[3] is bottom; verts[4] is lower-left)
    ctx.moveTo(cx, cy);
    ctx.lineTo(verts[2][0], verts[2][1]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(verts[4][0], verts[4][1]);
    ctx.stroke();
}

// Octahedron — vertical diamond outline + horizontal equator line.
function drawOctahedron(cx, cy, r, ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx,     cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx,     cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();

    // Equator (horizontal line through center) — gives the diamond a
    // 3D "split" feel. Plus a subtle vertical line for the back edge.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
}

// Tetrahedron — front-facing triangle with internal edges from the
// apex and base midpoints to the centroid.
function drawTetrahedron(cx, cy, r, ctx) {
    const apex   = [cx, cy - r];
    const left   = [cx - r * 0.866, cy + r * 0.5];
    const right  = [cx + r * 0.866, cy + r * 0.5];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.lineTo(left[0], left[1]);
    ctx.closePath();
    ctx.fill();

    // Centroid — internal edges from each vertex to here.
    const gx = (apex[0] + left[0] + right[0]) / 3;
    const gy = (apex[1] + left[1] + right[1]) / 3 + r * 0.15; // pulled down slightly for 3D feel
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(apex[0], apex[1]); ctx.lineTo(gx, gy);
    ctx.moveTo(left[0], left[1]); ctx.lineTo(gx, gy);
    ctx.moveTo(right[0], right[1]); ctx.lineTo(gx, gy);
    ctx.stroke();
}

// Prism — front-facing rectangle with a slanted top edge giving the
// classic isometric box look.
function drawPrism(cx, cy, r, ctx) {
    const w = r * 0.9;
    const h = r * 1.1;
    const skew = r * 0.32; // slant toward upper-right for 3D
    // Silhouette: bottom-left, bottom-right, top-right (slanted),
    // top-back (slanted further), top-front-left.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + h);
    ctx.lineTo(cx + w, cy + h);
    ctx.lineTo(cx + w, cy - h * 0.4);
    ctx.lineTo(cx + w + skew, cy - h * 0.4 - skew * 0.7);
    ctx.lineTo(cx - w + skew, cy - h * 0.4 - skew * 0.7);
    ctx.lineTo(cx - w, cy - h * 0.4);
    ctx.closePath();
    ctx.fill();
    // Internal edges — front-top-right corner vertical and slant.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h * 0.4);
    ctx.lineTo(cx + w, cy - h * 0.4);
    ctx.moveTo(cx + w, cy - h * 0.4);
    ctx.lineTo(cx + w + skew, cy - h * 0.4 - skew * 0.7);
    ctx.stroke();
}

// Paint a soft volumetric cloud — gaussian falloff with a slight
// asymmetric noise so a single texture, scaled and tinted, doesn't read
// as a perfect circle. The blend is additive in the renderer, so the
// alpha here is what controls the final cloud density.
function paintCloudBlob(ctx, slotIndex) {
    const img = ctx.createImageData(SLOT, SLOT);
    const data = img.data;
    const inv = 1 / (SLOT - 1);
    // Pre-compute a simple noise field (8x8 lattice, bilinear interp)
    // so the cloud edges are puffy rather than perfectly circular.
    const N = 8;
    const noise = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) noise[i] = 0.6 + Math.random() * 0.4;
    const sampleNoise = (u, v) => {
        const fx = u * (N - 1);
        const fy = v * (N - 1);
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        const ix1 = Math.min(ix + 1, N - 1);
        const iy1 = Math.min(iy + 1, N - 1);
        const a = noise[iy * N + ix];
        const b = noise[iy * N + ix1];
        const c = noise[iy1 * N + ix];
        const d = noise[iy1 * N + ix1];
        return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty)
             + c * (1 - tx) * ty + d * tx * ty;
    };
    for (let y = 0; y < SLOT; y++) {
        const v = y * inv - 0.5;
        for (let x = 0; x < SLOT; x++) {
            const u = x * inv - 0.5;
            const r2 = (u * u + v * v) * 4;
            let a = 0;
            if (r2 < 1) {
                // Wide gaussian core, very long tail.
                const fall = Math.exp(-r2 * 2.4);
                const n = sampleNoise(x * inv, y * inv);
                a = fall * n;
            }
            const idx = (y * SLOT + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
        }
    }
    ctx.putImageData(img, slotIndex * SLOT, 0);
}

// Paint a soft-circle dot — punchier than the particle dot. Hot
// saturated core extends through ~25% of the radius before falling
// off, plus a brighter halo so small stars read clearly.
function paintRadialDot(ctx, slotIndex) {
    const img = ctx.createImageData(SLOT, SLOT);
    const data = img.data;
    const inv = 1 / (SLOT - 1);
    for (let y = 0; y < SLOT; y++) {
        const v = y * inv - 0.5;
        for (let x = 0; x < SLOT; x++) {
            const u = x * inv - 0.5;
            const r2 = (u * u + v * v) * 4; // edge at r=1
            let a = 0;
            if (r2 < 1) {
                const r = Math.sqrt(r2);
                // Wider, hotter core (Gaussian falloff coefficient 22 → 12)
                // gives 2× the bright-pixel area at the centre.
                const core = Math.exp(-r2 * 12);
                // Larger halo (multiplier 0.5 → 0.7) extends visible
                // brightness toward the edge of the slot.
                const halo = Math.pow(1 - r, 2.0) * 0.7;
                a = Math.min(1, core + halo);
            }
            const idx = (y * SLOT + x) * 4;
            data[idx]     = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
        }
    }
    ctx.putImageData(img, slotIndex * SLOT, 0);
}

// Paint a slot via a path-based draw function (ctx, cx, cy, radius, slotCanvasCtx).
function paintShape(ctx, slotIndex, drawFn) {
    const slotX = slotIndex * SLOT;
    const cx = slotX + SLOT / 2;
    const cy = SLOT / 2;
    // Leave ~8px padding so rotation doesn't clip when the shape
    // rotates with its quad. Small inset (~2px) for anti-aliased edges.
    const radius = SLOT / 2 - 8;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.0)';
    drawFn(cx, cy, radius, ctx);
    ctx.restore();
}

function drawDiamond(cx, cy, r, ctx) {
    ctx.beginPath();
    ctx.moveTo(cx,     cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx,     cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
}

function drawTriangle(cx, cy, r, ctx) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawHexagon(cx, cy, r, ctx) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

// N-pointed star: alternating outer/inner radii produces N spikes.
function drawNStar(ctx, cx, cy, r, n, innerRatio) {
    const innerR = r * innerRatio;
    const verts = n * 2;
    ctx.beginPath();
    for (let i = 0; i < verts; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        const rr = (i % 2 === 0) ? r : innerR;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}
