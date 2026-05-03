// Pre-rendered nebula background — now JUST a parallax starfield.
//
// Earlier iterations had volumetric blobs, dust speckles, filaments,
// wisps, dust lanes, and sky tints. Cumulatively they laid a haze
// over the whole canvas. Per the user's call we strip everything
// except the LENS-FLARE STARS — bright pinpoints with soft halos and
// 4-point diffraction spikes — and let the dark canvas show through
// between them.
//
// Performance is generous since the layers are baked once at start-up:
//  - 4 layers × ~30-100 stars each = ~250 total
//  - Each star is a halo gradient + 4 line strokes + bright core
//  - Drawn once into an offscreen canvas per layer; per-frame cost is
//    just N drawImage() calls with parallax offsets

import { random } from '../core/utils.js';

// Color palettes drive star tinting. Each palette declares a few
// "accent" hues used by ~25-30% of stars; the rest are bright neutral
// white-blue (the default of hot stellar light).
const STAR_PALETTES = [
    { name: 'cobalt',      accents: [[120, 200, 255], [180, 130, 255], [80, 220, 240]] },
    { name: 'violet',      accents: [[255, 100, 200], [180, 80, 255], [255, 200, 230]] },
    { name: 'teal',        accents: [[120, 255, 220], [80, 200, 255], [180, 255, 240]] },
    { name: 'ember',       accents: [[255, 140, 80], [255, 200, 100], [255, 100, 60]] },
    { name: 'periwinkle',  accents: [[200, 180, 255], [220, 220, 255], [180, 160, 240]] },
    { name: 'crimson',     accents: [[180, 80, 220], [255, 130, 200], [220, 100, 240]] },
    { name: 'emerald',     accents: [[200, 255, 180], [120, 255, 200], [180, 230, 100]] },
    { name: 'rose',        accents: [[255, 200, 220], [255, 180, 240], [255, 150, 180]] },
    { name: 'twilight',    accents: [[255, 180, 200], [180, 220, 255], [220, 140, 255]] },
    { name: 'solar',       accents: [[255, 100, 50], [255, 220, 100], [255, 180, 80]] },
];
const NEUTRAL_STAR = [220, 230, 255]; // hot blue-white, default star color

// Parallax layers — far layers move 0% with camera, near move 65%.
// Sparse counts: lens-flare stars are accents sprinkled across the void,
// not a dense field. The regular twinkling background-star pool fills the
// space; these are the few bright "wow" stars layered on top.
const LAYER_CONFIG = [
    { depth: 0.00, lumMul: 0.55, stars: 6 },  // deepest, dimmest, locked
    { depth: 0.18, lumMul: 0.75, stars: 9 },
    { depth: 0.40, lumMul: 0.90, stars: 12 },
    { depth: 0.65, lumMul: 1.00, stars: 16 }, // closest, brightest
];

function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function shade(c, mul) {
    const r = Math.max(0, Math.min(255, Math.round(c[0] * mul)));
    const g = Math.max(0, Math.min(255, Math.round(c[1] * mul)));
    const b = Math.max(0, Math.min(255, Math.round(c[2] * mul)));
    return [r, g, b];
}

class NebulaRenderer {
    constructor() {
        this.layers = [];
        this.generated = false;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
        this.palette = null;
    }

    /** Generate the parallax star layers. Call once at game start. */
    generate(fieldWidth, fieldHeight) {
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;
        this.layers = [];
        // One palette per scene so accent colors are coherent.
        this.palette = STAR_PALETTES[Math.floor(Math.random() * STAR_PALETTES.length)];

        const scale = 0.5; // half-res for soft edges + memory
        const w = Math.ceil(fieldWidth * scale);
        const h = Math.ceil(fieldHeight * scale);

        for (const cfg of LAYER_CONFIG) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            this._drawLensFlareStars(ctx, w, h, cfg);
            this.layers.push({ canvas, depth: cfg.depth });
        }

        this.generated = true;
    }

    _drawLensFlareStars(ctx, w, h, layerCfg) {
        const accents = this.palette.accents;
        const lumMul = layerCfg.lumMul;
        for (let i = 0; i < layerCfg.stars; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;

            // 70% neutral hot-blue-white, 30% palette accent.
            const isAccent = Math.random() < 0.3;
            const baseColor = isAccent
                ? accents[Math.floor(Math.random() * accents.length)]
                : NEUTRAL_STAR;
            const color = shade(baseColor, lumMul);

            const brightness = random(0.5, 1.0);
            const coreSize = random(0.8, 2.4);
            const haloSize = coreSize * random(6, 14);
            const spikeLen = haloSize * random(0.8, 1.4);

            // ── Halo — soft glow ──
            const hgrad = ctx.createRadialGradient(x, y, 0, x, y, haloSize);
            hgrad.addColorStop(0,    rgba(color, brightness * 0.7));
            hgrad.addColorStop(0.25, rgba(color, brightness * 0.35));
            hgrad.addColorStop(0.6,  rgba(color, brightness * 0.10));
            hgrad.addColorStop(1,    rgba(color, 0));
            ctx.fillStyle = hgrad;
            ctx.beginPath();
            ctx.arc(x, y, haloSize, 0, Math.PI * 2);
            ctx.fill();

            // ── Diffraction spikes — 4-arm cross, random rotation ──
            const baseAng = random(0, Math.PI / 4);
            for (let k = 0; k < 4; k++) {
                const a = baseAng + (k * Math.PI) / 2;
                const ex = x + Math.cos(a) * spikeLen;
                const ey = y + Math.sin(a) * spikeLen;
                const sgrad = ctx.createLinearGradient(x, y, ex, ey);
                sgrad.addColorStop(0,   rgba(color, brightness * 0.85));
                sgrad.addColorStop(0.5, rgba(color, brightness * 0.25));
                sgrad.addColorStop(1,   rgba(color, 0));
                ctx.strokeStyle = sgrad;
                ctx.lineWidth = Math.max(0.6, coreSize * 0.3);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }

            // ── Bright core ──
            ctx.fillStyle = rgba(color, brightness);
            ctx.beginPath();
            ctx.arc(x, y, coreSize, 0, Math.PI * 2);
            ctx.fill();

            // ── White-hot center pixel for the brightest stars ──
            if (brightness > 0.85) {
                ctx.fillStyle = rgba([255, 255, 255], 0.95);
                ctx.beginPath();
                ctx.arc(x, y, coreSize * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Draw all layers onto the game canvas with depth-based parallax.
     *
     * `driftX/driftY` is an additive offset applied AFTER the camera-driven
     * parallax — used by the title screen to wander the lens-flare layers
     * regardless of camera movement. Closer layers (higher `depth`) drift
     * more, deepest layer barely budges, giving the lens flare stars a
     * "much further away" parallax feel relative to the foreground stars.
     */
    draw(ctx, cameraX, cameraY, driftX = 0, driftY = 0) {
        if (!this.generated) return;
        ctx.save();
        ctx.globalAlpha = 1;
        for (const layer of this.layers) {
            const camOffX = cameraX * (1 - layer.depth);
            const camOffY = cameraY * (1 - layer.depth);
            const driftOffX = driftX * layer.depth;
            const driftOffY = driftY * layer.depth;
            ctx.drawImage(
                layer.canvas,
                camOffX + driftOffX, camOffY + driftOffY,
                this.fieldWidth, this.fieldHeight,
            );
        }
        ctx.restore();
    }
}

export const nebulaRenderer = new NebulaRenderer();
