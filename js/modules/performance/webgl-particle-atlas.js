// WebGL particle sprite atlas — baked once at module load. A single
// 1280×256 RGBA texture packed with five 256×256 slots in a horizontal
// row. Each slot holds a grayscale shape with alpha; the WebGL fragment
// shader multiplies the sampled texel by the per-instance color, so one
// atlas covers every migrated particle type.
//
// Slot layout (left → right):
//   0: dot     — sharp hot-core ember. ember / classic explosion.
//   1: flash   — radial flash with subtle 4-point cross spike. explosionFlash.
//   2: ring    — hollow annulus with smooth inner + outer falloff. explosionRingColored.
//   3: streak  — horizontal bar with bright tapered head, fading tail
//                to the left. Drawn rotated, width = streak length. explosionShrapnel.
//   4: spark   — 4-point cross star with central glow. starSparkle.

export const ATLAS_W = 1280;
export const ATLAS_H = 256;
const SLOT = 256;
const NUM_SLOTS = 5;

const U_PER_SLOT = 1 / NUM_SLOTS;
const slotUV = (i) => ({ uOff: i * U_PER_SLOT, vOff: 0, uScale: U_PER_SLOT, vScale: 1 });

export const ATLAS_SLOTS = {
    dot:    slotUV(0),
    flash:  slotUV(1),
    ring:   slotUV(2),
    streak: slotUV(3),
    spark:  slotUV(4),
};

/**
 * Bake the atlas into an offscreen canvas. Caller uploads the canvas as
 * a WebGL texture via `texImage2D`. Idempotent — a fresh canvas is built
 * each call, so it's safe to re-bake on context restore.
 *
 * Each slot is rendered procedurally by `paintSlot` using a custom
 * pixel-by-pixel alpha function — gives finer control than CSS gradients
 * over hot-core sharpness, anisotropic falloff, and spike shapes.
 */
export function buildParticleAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

    paintSlot(ctx, 0, dotAlpha);
    paintSlot(ctx, 1, flashAlpha);
    paintSlot(ctx, 2, ringAlpha);
    paintSlot(ctx, 3, streakAlpha);
    paintSlot(ctx, 4, sparkAlpha);

    return canvas;
}

/**
 * Render one 256×256 slot at horizontal index `i`. `alphaFn(u, v)` is
 * called for each pixel with normalized [0..1] coords (origin top-left).
 * Returns 0..1 alpha; the sprite is otherwise solid white so that the
 * fragment shader's color multiply can tint it.
 */
function paintSlot(ctx, i, alphaFn) {
    const img = ctx.createImageData(SLOT, SLOT);
    const data = img.data;
    const inv = 1 / (SLOT - 1);
    for (let y = 0; y < SLOT; y++) {
        const v = y * inv;
        for (let x = 0; x < SLOT; x++) {
            const u = x * inv;
            const a = alphaFn(u, v);
            const idx = (y * SLOT + x) * 4;
            data[idx]     = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = a <= 0 ? 0 : a >= 1 ? 255 : Math.round(a * 255);
        }
    }
    ctx.putImageData(img, i * SLOT, 0);
}

// ── Alpha curves ────────────────────────────────────────────────────────────
//
// Each function returns alpha in [0, 1] for a normalized pixel coord
// (u, v) ∈ [0, 1]². Center of the slot is (0.5, 0.5).
//
// Goals:
//   • Sharper, brighter hot core (fixes "soft fuzzy blob" feeling).
//   • Defined falloff that doesn't haze out into vague glow.
//   • Visible structure — sparkle has spikes, streak has a real head, etc.
//

/**
 * Hot ember: bright Gaussian core + tighter quadratic tail. The two-term
 * sum gives a punchy hot-white center with a controlled falloff that
 * still blends softly at the edge — sharp where you want it, smooth
 * where you don't.
 */
function dotAlpha(u, v) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r2 = (dx * dx + dy * dy) * 4; // normalise so r=1 at slot edge
    if (r2 >= 1) return 0;
    const r = Math.sqrt(r2);
    const core = Math.exp(-r2 * 18);                  // tight hot center
    const halo = Math.pow(1 - r, 2.4) * 0.55;         // soft outer falloff
    return Math.min(1, core + halo);
}

/**
 * Explosion flash: radial gradient with a 4-point cross spike overlaid.
 * The spike adds a bright cardinal cross that reads as a real "punch"
 * instead of a featureless blob. Subtle enough that rotated/colored
 * flashes still feel cohesive.
 */
function flashAlpha(u, v) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r2 = (dx * dx + dy * dy) * 4;
    if (r2 >= 1) return 0;
    const r = Math.sqrt(r2);
    // Smooth radial body.
    const body = Math.exp(-r2 * 6) * 0.95 + Math.pow(1 - r, 2.0) * 0.18;
    // Cross spike: thin bright bands along the cardinal axes, fading
    // with radius so it doesn't dominate at the rim.
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const sigma2 = 0.0008;
    const horiz = Math.exp(-(ay * ay) / sigma2);
    const vert  = Math.exp(-(ax * ax) / sigma2);
    const spike = Math.max(horiz, vert) * Math.pow(1 - r, 1.6) * 0.45;
    return Math.min(1, body + spike);
}

/**
 * Hollow ring: annular peak with smooth inner + outer falloff. Tightened
 * vs the old gradient so the ring reads as a defined wavefront edge
 * rather than a blurry glow band.
 */
function ringAlpha(u, v) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2; // normalise: edge at r=1
    if (r >= 1) return 0;
    const peak = 0.78;
    const dr = r - peak;
    const sigma = 0.13;
    const ring = Math.exp(-(dr * dr) / (2 * sigma * sigma));
    // Slight inner-edge softening so the ring doesn't gain a hard inner
    // boundary at small radii.
    const innerCut = r < 0.45 ? r / 0.45 : 1;
    return Math.min(1, ring * innerCut);
}

/**
 * Shrapnel streak: bright tapered head on the right, fading tail to the
 * left. Vertical Gaussian gives soft top/bottom edges so the streak
 * blends with overlap. The head taper uses a steeper power curve than
 * before for a more defined, fast-moving look.
 */
function streakAlpha(u, v) {
    const cy = v - 0.5;
    const sigma = 0.13;
    const vert = Math.exp(-(cy * cy) / (2 * sigma * sigma));
    // Horizontal: u=1 is the head (bright), u=0 is tail (dim).
    // Steeper exponent → tighter head, more defined leading edge.
    const head = Math.pow(u, 2.4);
    // Add a thin hot tip at u≈1 so the head reads as a sharp leading
    // pixel-line rather than a smooth ramp.
    const tipDist = (1 - u) * 30;
    const tipBoost = Math.exp(-(tipDist * tipDist)) * 0.35;
    return Math.min(1, (head + tipBoost) * vert);
}

/**
 * Sparkle: 4-point cross star with a tight central glow. Same cardinal
 * cross idea as the flash spike but standalone — sparkle particles get
 * their own slot so they read as twinkling stars instead of just dots.
 * Diagonal arms (u==v, u+v==1) included at lower intensity so the star
 * doesn't look strictly axis-aligned.
 */
function sparkAlpha(u, v) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r2 = (dx * dx + dy * dy) * 4;
    if (r2 >= 1) return 0;
    const r = Math.sqrt(r2);
    // Central bright dot.
    const core = Math.exp(-r2 * 25);
    // Cardinal cross arms (horizontal + vertical).
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const sigmaCross = 0.0006;
    const horiz = Math.exp(-(ay * ay) / sigmaCross);
    const vert  = Math.exp(-(ax * ax) / sigmaCross);
    const cross = Math.max(horiz, vert) * Math.pow(1 - r, 1.4) * 0.85;
    // Diagonal arms at half intensity for a more star-like silhouette.
    const d1 = Math.abs(dx - dy);
    const d2 = Math.abs(dx + dy);
    const diag = Math.max(
        Math.exp(-(d1 * d1) / 0.0009),
        Math.exp(-(d2 * d2) / 0.0009),
    ) * Math.pow(1 - r, 1.4) * 0.35;
    return Math.min(1, core + cross + diag);
}
