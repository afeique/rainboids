// WebGL bullet sprite atlas — baked once at module load (5.79.2).
//
// A single 1024×128 RGBA texture packed with eight 128×128 slots in a
// horizontal row. Each slot holds a baked bullet sprite encoded as
// three independent masks per pixel, plus a combined alpha:
//
//   R channel — OUTLINE mask (1.0 where the black ring should appear)
//   G channel — BODY mask    (1.0 where the colored body should appear)
//   B channel — CORE mask    (1.0 where the bright white core should appear)
//   A channel — combined alpha (max of the three above)
//
// The fragment shader composes the final pixel as
//   color = outline*0 + body*tint + core*white   (additive in RGB)
//   alpha = atlas.a * instanceAlpha
// so every shape gets the same baked outline + colored body + bright
// core treatment without any per-bullet stroke or shadowBlur work.
//
// Slot index → shape (left to right):
//   0: circle    — default round bullet
//   1: triangle  — RAPID_FIRE / WASP / hunter bullet
//   2: hexagon   — MULTI_SHOT bullet
//   3: diamond   — PIERCING / HOMING bullet
//   4: star      — EXPLOSIVE bullet
//   5: square    — STORM_NEEDLES / Drifter laser
//   6: needle    — Storm Needle (long thin)
//   7: charge    — Charged shot (smooth ring + bright core, scales up)

export const ATLAS_W = 1024;
export const ATLAS_H = 128;
const SLOT_W = 128;
const SLOT_H = 128;
const NUM_SLOTS = 8;

const U_PER_SLOT = SLOT_W / ATLAS_W;

const slotUV = (i) => ({ uOff: i * U_PER_SLOT, vOff: 0, uScale: U_PER_SLOT, vScale: 1 });

export const BULLET_ATLAS_SLOTS = {
    circle:   slotUV(0),
    triangle: slotUV(1),
    hexagon:  slotUV(2),
    diamond:  slotUV(3),
    star:     slotUV(4),
    square:   slotUV(5),
    needle:   slotUV(6),
    charge:   slotUV(7),
};

// Pixel-radius budget for each shape inside its slot:
//   - body:    ~38% of slot   → ~48 px on a 128 slot
//   - outline: ~3 px ring outside body
//   - core:    ~18% of slot   → ~22 px (bright center highlight)
// Leaves padding so a unit-quad scaled up to 2× stays inside the slot.
const BODY_R   = 46;
// 5.79.14 — Outline thickness 3 → 5 px so every bullet has a stronger
//   black edge (user noted bullets look stale in WebGL — the outline
//   was too subtle). Body radius dropped 48 → 46 to make room for the
//   wider outline within the same slot budget.
const OUTLINE  = 5;
const CORE_R   = 22;

/** Bake the bullet atlas into an offscreen canvas. */
export function buildBulletAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width  = ATLAS_W;
    canvas.height = ATLAS_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

    paintCircle  (ctx, 0);
    paintTriangle(ctx, 1);
    paintHexagon (ctx, 2);
    paintDiamond (ctx, 3);
    paintStar    (ctx, 4);
    paintSquare  (ctx, 5);
    paintNeedle  (ctx, 6);
    paintCharge  (ctx, 7);

    return canvas;
}

/** Paint one slot using per-pixel mask functions.
 *
 *   bodyAlphaFn(u, v)   → [0,1]  body mask intensity
 *   outlineAlphaFn(u, v)→ [0,1]  outline mask intensity
 *   coreAlphaFn(u, v)   → [0,1]  core mask intensity
 *
 * (u, v) ∈ [0, 1]² are normalized slot coords; (0.5, 0.5) is center.
 * Each pixel gets:
 *   R = outline,  G = body,  B = core,  A = max(R, G, B).
 */
function paintMaskedSlot(ctx, slotIdx, bodyFn, outlineFn, coreFn) {
    const img = ctx.createImageData(SLOT_W, SLOT_H);
    const data = img.data;
    const inv = 1 / (SLOT_W - 1);
    for (let y = 0; y < SLOT_H; y++) {
        const v = y * inv;
        for (let x = 0; x < SLOT_W; x++) {
            const u = x * inv;
            const out = outlineFn(u, v);
            const bod = bodyFn(u, v);
            const cor = coreFn(u, v);
            const a = Math.max(out, bod, cor);
            const idx = (y * SLOT_W + x) * 4;
            data[idx]     = out * 255;
            data[idx + 1] = bod * 255;
            data[idx + 2] = cor * 255;
            data[idx + 3] = a * 255;
        }
    }
    ctx.putImageData(img, slotIdx * SLOT_W, 0);
}

/** Smooth band utility — returns 1 inside [r0, r1], smoothly fading to 0
 *  over a 1px transition on both sides for anti-aliasing. */
function band(d, r0, r1) {
    if (d < r0 - 1) return 0;
    if (d < r0)     return d - (r0 - 1);
    if (d <= r1)    return 1;
    if (d <= r1 + 1) return (r1 + 1) - d;
    return 0;
}
function fill(d, r) {
    if (d <= r) return 1;
    if (d <= r + 1) return (r + 1) - d;
    return 0;
}

/** Distance from (u, v) to slot center (0.5, 0.5) in slot-pixel space. */
function radius(u, v) {
    const dx = (u - 0.5) * SLOT_W;
    const dy = (v - 0.5) * SLOT_H;
    return Math.hypot(dx, dy);
}

// ── Shape painters ─────────────────────────────────────────────────────

// 5.79.12 — Radial gradient body fill instead of uniform 1.0. The
//   body channel ramps from 1.0 at center down to ~0.55 at the rim
//   (then sharp cutoff to 0 outside). When the fragment shader
//   multiplies the bullet's tint by this varying mask, the bullet
//   reads as a "lit ball of energy" with a dim halo edge instead
//   of a flat colored disc. Same atlas memory cost.
function radialBody(d, r) {
    if (d > r) return 0;
    if (d > r - 1) return (r - d) * 0.55;       // 1px AA edge
    const t = 1 - d / r;                         // 0 at rim → 1 at center
    return 0.55 + 0.45 * t;                      // 0.55..1.0 ramp
}

function paintCircle(ctx, slot) {
    paintMaskedSlot(ctx, slot,
        (u, v) => radialBody(radius(u, v), BODY_R),
        (u, v) => band(radius(u, v), BODY_R, BODY_R + OUTLINE),
        (u, v) => fill(radius(u, v), CORE_R),
    );
}

function paintCharge(ctx, slot) {
    // Charged shot: bigger ring + soft bright core. Body is full-size
    // disc; core has a wider bright center for the "energy ball" feel.
    const bodyR = BODY_R + 6;
    const coreR = CORE_R + 12;
    paintMaskedSlot(ctx, slot,
        (u, v) => fill(radius(u, v), bodyR),
        (u, v) => band(radius(u, v), bodyR, bodyR + OUTLINE),
        (u, v) => {
            const r = radius(u, v);
            // Smooth radial falloff for the core: full white in inner
            // 60%, fading to 0 at coreR.
            if (r > coreR) return 0;
            const t = 1 - r / coreR;
            return Math.pow(t, 0.7);
        },
    );
}

function paintSquare(ctx, slot) {
    // Axis-aligned square. Body half-side ≈ BODY_R*0.78 so the diagonal
    // (~BODY_R) stays inside the slot's circular budget.
    const half = BODY_R * 0.78;
    const coreH = CORE_R * 0.78;
    const distBox = (u, v, h) => {
        const dx = Math.abs((u - 0.5) * SLOT_W);
        const dy = Math.abs((v - 0.5) * SLOT_H);
        // Chebyshev distance is what makes the box square.
        return Math.max(dx, dy) - h;
    };
    paintMaskedSlot(ctx, slot,
        (u, v) => 1 - Math.min(1, Math.max(0, distBox(u, v, half) + 0.5)),
        (u, v) => {
            const d = distBox(u, v, half);
            // Outline ring outside the body
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, distBox(u, v, coreH) + 0.5)),
    );
}

function paintTriangle(ctx, slot) {
    // Equilateral triangle pointing up (in atlas space — bullet rotates
    // around z to face its travel direction). Roughly inscribed in the
    // BODY_R disc.
    const tri = (u, v, r) => triangleSDF(u, v, r);
    paintMaskedSlot(ctx, slot,
        (u, v) => 1 - Math.min(1, Math.max(0, tri(u, v, BODY_R) + 0.5)),
        (u, v) => {
            const d = tri(u, v, BODY_R);
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, tri(u, v, CORE_R) + 0.5)),
    );
}
function triangleSDF(u, v, r) {
    // Crude triangle SDF — tip at top (-r), base at +r/2. Returns signed
    // distance: <=0 inside, >0 outside.
    const x = (u - 0.5) * SLOT_W;
    const y = (v - 0.5) * SLOT_H;
    // Three half-plane distances (positive outside).
    const d1 = -y - r * 0.85;                   // top edge (tip)
    const d2 = (y - r * 0.5) * 1.0 - 0;          // bottom edge
    const ang30 = Math.PI / 6;
    const cs = Math.cos(ang30), sn = Math.sin(ang30);
    const d3 = x * cs + y * sn - r * 0.6;        // right edge
    const d4 = -x * cs + y * sn - r * 0.6;       // left edge
    return Math.max(d1, d2, d3, d4);
}

// Generic radial-gradient body for non-circular shapes — uses the
// same SDF (distance from center) but ramps body channel intensity.
// Inside the shape, brightness fades from 1.0 at center to ~0.55 at
// the silhouette edge.
function radialBodyShape(d, r) {
    // d here is signed-distance from the shape's edge (negative = inside).
    if (d >= 0) return 0;
    if (d >= -1) return (-d) * 0.55;
    const t = Math.min(1, -d / r);
    return 0.55 + 0.45 * t;
}

function paintHexagon(ctx, slot) {
    paintMaskedSlot(ctx, slot,
        (u, v) => radialBodyShape(hexSDF(u, v, BODY_R), BODY_R),
        (u, v) => {
            const d = hexSDF(u, v, BODY_R);
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, hexSDF(u, v, CORE_R) + 0.5)),
    );
}
function hexSDF(u, v, r) {
    const x = Math.abs((u - 0.5) * SLOT_W);
    const y = Math.abs((v - 0.5) * SLOT_H);
    // Pointy-top hexagon SDF
    const k = 0.5773502692; // tan(30°) = sqrt(3)/3
    const t = Math.max(x - r, x * 0.5 + y * 0.866 - r);
    return t;
}

function paintDiamond(ctx, slot) {
    paintMaskedSlot(ctx, slot,
        (u, v) => 1 - Math.min(1, Math.max(0, diamondSDF(u, v, BODY_R) + 0.5)),
        (u, v) => {
            const d = diamondSDF(u, v, BODY_R);
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, diamondSDF(u, v, CORE_R * 1.1) + 0.5)),
    );
}
function diamondSDF(u, v, r) {
    const x = Math.abs((u - 0.5) * SLOT_W);
    const y = Math.abs((v - 0.5) * SLOT_H);
    // Diamond = L1-ball: |x|+|y| ≤ r.
    return x + y - r;
}

function paintStar(ctx, slot) {
    // 5-point star inscribed in the body radius. Outer points hit BODY_R,
    // inner valleys hit BODY_R*0.45.
    paintMaskedSlot(ctx, slot,
        (u, v) => 1 - Math.min(1, Math.max(0, starSDF(u, v, BODY_R) + 0.5)),
        (u, v) => {
            const d = starSDF(u, v, BODY_R);
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, starSDF(u, v, CORE_R * 1.1) + 0.5)),
    );
}
function starSDF(u, v, R) {
    const x = (u - 0.5) * SLOT_W;
    const y = (v - 0.5) * SLOT_H;
    const ang = Math.atan2(y, x) + Math.PI / 2; // tip at top
    const r = Math.hypot(x, y);
    const k = ang * (5 / (2 * Math.PI));
    const sector = k - Math.floor(k);
    // Triangle wave [0,1] → [0,0.5,0]. 5 sectors per turn → 5 points.
    const w = sector < 0.5 ? sector * 2 : (1 - sector) * 2; // 0..1..0
    const innerR = R * 0.45;
    const outerR = R;
    const localR = innerR + (outerR - innerR) * w;
    return r - localR;
}

function paintNeedle(ctx, slot) {
    // Long thin pill — Storm Needles shape. Body is a ~20-px-wide capsule
    // running vertical; outline a thin ring around it; core is a brighter
    // central spike.
    const halfW = 8;
    const halfH = BODY_R;
    const coreH = CORE_R + 8;
    const pill = (u, v, w, h) => {
        const x = Math.abs((u - 0.5) * SLOT_W);
        const y = Math.abs((v - 0.5) * SLOT_H);
        const dy = Math.max(0, y - h);
        const d = Math.hypot(Math.max(0, x - 0), dy);
        return Math.max(x - w, d) - 0;
    };
    paintMaskedSlot(ctx, slot,
        (u, v) => 1 - Math.min(1, Math.max(0, pill(u, v, halfW, halfH - halfW) + 0.5)),
        (u, v) => {
            const d = pill(u, v, halfW, halfH - halfW);
            if (d <= 0) return 0;
            if (d <= OUTLINE) return 1;
            if (d <= OUTLINE + 1) return (OUTLINE + 1) - d;
            return 0;
        },
        (u, v) => 1 - Math.min(1, Math.max(0, pill(u, v, halfW * 0.4, coreH - halfW * 0.4) + 0.5)),
    );
}
