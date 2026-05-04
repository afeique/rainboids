// WebGL particle sprite atlas — baked once at module load. A single
// 1024×256 RGBA texture packed with four 256×256 slots in a horizontal
// row. Each slot holds a grayscale shape with alpha; the WebGL fragment
// shader multiplies the sampled texel by the per-instance color, so one
// atlas covers every migrated particle type.
//
// Slot layout (left → right):
//   0: dot     — soft white circle. ember / sparkle / classic explosion.
//   1: flash   — bright radial flash with cool-blue falloff. explosionFlash.
//   2: ring    — hollow annulus with smooth inner + outer falloff. explosionRingColored.
//   3: streak  — horizontal bar, bright head on the right, fading tail
//                to the left. Drawn as a rotated rectangle whose width =
//                streak length. explosionShrapnel.

export const ATLAS_W = 1024;
export const ATLAS_H = 256;
const SLOT = 256;

// Per-slot UV rectangle (normalized [0..1]). The renderer reads this to
// build the per-instance atlas-coordinate attribute.
export const ATLAS_SLOTS = {
    dot:    { uOff: 0 / 4, vOff: 0, uScale: 1 / 4, vScale: 1 },
    flash:  { uOff: 1 / 4, vOff: 0, uScale: 1 / 4, vScale: 1 },
    ring:   { uOff: 2 / 4, vOff: 0, uScale: 1 / 4, vScale: 1 },
    streak: { uOff: 3 / 4, vOff: 0, uScale: 1 / 4, vScale: 1 },
};

/**
 * Bake the atlas into an offscreen canvas. Caller uploads the canvas as
 * a WebGL texture via `texImage2D`. Idempotent — a fresh canvas is built
 * each call, so it's safe to re-bake on context restore.
 */
export function buildParticleAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

    // Slot 0 — soft white dot. Cubic-ish radial falloff: a hot core that
    // fades smoothly. Multiplied by per-instance color, this becomes
    // every "small fading circle" particle in the game (embers, classic
    // explosion fragments, sparkles).
    const dotCx = SLOT / 2;
    const dotG = ctx.createRadialGradient(dotCx, SLOT / 2, 0, dotCx, SLOT / 2, SLOT / 2);
    dotG.addColorStop(0,    'rgba(255,255,255,1)');
    dotG.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    dotG.addColorStop(0.7,  'rgba(255,255,255,0.18)');
    dotG.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = dotG;
    ctx.fillRect(0, 0, SLOT, SLOT);

    // Slot 1 — explosion flash. Cool-blue radial gradient with a bright
    // white core (matches the visual signature of the previous Canvas2D
    // 'flash-default' sprite recipe in utils.js).
    const flashCx = SLOT + SLOT / 2;
    const flashG = ctx.createRadialGradient(flashCx, SLOT / 2, 0, flashCx, SLOT / 2, SLOT / 2);
    flashG.addColorStop(0,    'rgba(255,255,255,0.95)');
    flashG.addColorStop(0.35, 'rgba(220,235,255,0.55)');
    flashG.addColorStop(0.75, 'rgba(180,210,255,0.15)');
    flashG.addColorStop(1,    'rgba(150,190,255,0)');
    ctx.fillStyle = flashG;
    ctx.fillRect(SLOT, 0, SLOT, SLOT);

    // Slot 2 — hollow ring. Peak alpha sits at 0.78×radius; tapers
    // smoothly inward to 0 at the center and outward to 0 at the rim.
    // The ring's apparent thickness is controlled by the alpha curve
    // here, so per-instance only needs a position + radius + color.
    const ringCx = 2 * SLOT + SLOT / 2;
    const ringG = ctx.createRadialGradient(ringCx, SLOT / 2, 0, ringCx, SLOT / 2, SLOT / 2);
    ringG.addColorStop(0,    'rgba(255,255,255,0)');
    ringG.addColorStop(0.55, 'rgba(255,255,255,0)');
    ringG.addColorStop(0.78, 'rgba(255,255,255,1)');
    ringG.addColorStop(0.96, 'rgba(255,255,255,0.45)');
    ringG.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = ringG;
    ctx.fillRect(2 * SLOT, 0, SLOT, SLOT);

    // Slot 3 — shrapnel streak. Rendered procedurally pixel-by-pixel:
    // horizontal axis is a power curve (bright head on the right, fading
    // tail to the left); vertical axis is a Gaussian centered on the
    // mid-line (so the streak has a soft top/bottom edge instead of a
    // hard rectangular boundary). This sprite is drawn rotated to the
    // shrapnel velocity angle and scaled to (length, radius*2).
    const streakImg = ctx.createImageData(SLOT, SLOT);
    const streakSigma = 0.16;
    const streakSigmaSq2 = 2 * streakSigma * streakSigma;
    for (let y = 0; y < SLOT; y++) {
        const v = (y / (SLOT - 1)) - 0.5;
        const vert = Math.exp(-(v * v) / streakSigmaSq2);
        for (let x = 0; x < SLOT; x++) {
            const u = x / (SLOT - 1);
            const horiz = Math.pow(u, 1.7);
            const a = horiz * vert;
            const idx = (y * SLOT + x) * 4;
            streakImg.data[idx]     = 255;
            streakImg.data[idx + 1] = 255;
            streakImg.data[idx + 2] = 255;
            streakImg.data[idx + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(streakImg, 3 * SLOT, 0);

    return canvas;
}
