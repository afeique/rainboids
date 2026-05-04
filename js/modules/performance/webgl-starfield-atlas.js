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

export const ATLAS_W = 1024;
export const ATLAS_H = 128;
export const SLOT = 128;
export const NUM_SLOTS = 8;

// Per-slot UV rectangle (normalized [0..1]). The renderer uses the
// SLOT_INDEX → uOffset/uScale mapping in the vertex shader.
export const STAR_SLOT_INDEX = {
    dot:      0,
    diamond:  1,
    triangle: 2,
    hexagon:  3,
    star4:    4,
    star5:    5,
    star6:    6,
    star8:    7,
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

    return canvas;
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
