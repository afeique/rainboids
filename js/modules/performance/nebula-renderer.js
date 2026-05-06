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

// 5.74.20 — palettes overhauled for vibrancy. Each palette now defines a
// wide spread of fully-saturated accents (was 3 desaturated tones) drawn
// from the same hue family, so an "ember" lens-flare scene reads as
// distinctly fiery without every star being identical. Accent rate also
// bumped 30% → 70% so the flare layers actively show color.
const STAR_PALETTES = [
    { name: 'cobalt',     accents: [[ 60, 160, 255], [120, 200, 255], [180, 120, 255], [ 40, 230, 255], [100, 130, 255]] },
    { name: 'violet',     accents: [[255,  60, 200], [200,  60, 255], [255, 130, 240], [220, 100, 255], [255,  80, 160]] },
    { name: 'teal',       accents: [[ 60, 255, 220], [ 40, 200, 255], [120, 255, 240], [ 80, 240, 200], [100, 220, 255]] },
    { name: 'ember',      accents: [[255, 110,  40], [255, 180,  60], [255,  80,  60], [255, 140,  90], [255, 220, 100]] },
    { name: 'periwinkle', accents: [[160, 130, 255], [120, 160, 255], [200, 160, 255], [140, 120, 240], [180, 200, 255]] },
    { name: 'crimson',    accents: [[255,  60,  90], [255, 100, 200], [220,  60, 220], [255,  40, 140], [200,  80, 240]] },
    { name: 'emerald',    accents: [[ 80, 255, 140], [120, 255, 100], [ 60, 240, 200], [180, 255,  80], [100, 220, 120]] },
    { name: 'rose',       accents: [[255, 100, 180], [255, 140, 220], [255,  80, 140], [240, 120, 200], [255, 180, 240]] },
    { name: 'twilight',   accents: [[255, 130, 180], [120, 180, 255], [200,  80, 255], [255, 100, 140], [140, 120, 240]] },
    { name: 'solar',      accents: [[255,  80,  20], [255, 200,  60], [255, 140,  40], [255, 220, 120], [255, 100,  80]] },
    { name: 'aurora',     accents: [[ 60, 255, 180], [180,  80, 255], [ 60, 200, 255], [240, 100, 220], [120, 255, 240]] },
    { name: 'sunset',     accents: [[255,  80, 100], [255, 160,  60], [255, 100, 200], [255, 200,  80], [220,  60, 140]] },
];
const NEUTRAL_STAR = [240, 245, 255]; // hot blue-white, default star color

// Parallax layers — far layers move 0% with camera, near move 65%.
// Sparse counts: lens-flare stars are accents sprinkled across the void,
// not a dense field. The regular twinkling background-star pool fills the
// space; these are the few bright "wow" stars layered on top.
// 5.74.27 — counts modestly bumped (4/5/7/9 = 25 total, was 14) so that
// after parallax-clipping the camera sees a useful number of flares at
// any time. Sizes also bumped (see _buildStar) to keep flares perceptible
// against the dark canvas + WebGL nebula clouds.
const LAYER_CONFIG = [
    { depth: 0.00, lumMul: 0.70, stars: 4 },  // deepest, dimmest, locked
    { depth: 0.18, lumMul: 0.85, stars: 5 },
    { depth: 0.40, lumMul: 0.95, stars: 7 },
    { depth: 0.65, lumMul: 1.00, stars: 9 },  // closest, brightest
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
        // 5.74.25 — refactored from baked layer canvases to per-star sprites
        // + per-frame draw so each lens-flare star can rotate, twinkle,
        // blink, and slowly slide its opacity. Each star pre-renders its
        // halo / spikes / core into a small sprite canvas once at startup;
        // the draw loop just spins each sprite through ctx.translate +
        // ctx.rotate + globalAlpha. ~14 stars total → ~14 drawImages per
        // frame, trivial.
        this.stars = [];
        this.generated = false;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
        this.palette = null;
    }

    /** Generate the parallax star sprites + per-star animation data. Call once at game start. */
    generate(fieldWidth, fieldHeight) {
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;
        this.stars = [];
        this.palette = STAR_PALETTES[Math.floor(Math.random() * STAR_PALETTES.length)];

        for (const cfg of LAYER_CONFIG) {
            for (let i = 0; i < cfg.stars; i++) {
                this.stars.push(this._buildStar(fieldWidth, fieldHeight, cfg));
            }
        }

        this.generated = true;
    }

    // Build one star: roll its visual params, pre-render the sprite,
    // and seed its independent animation phases.
    _buildStar(fw, fh, layerCfg) {
        const accents = this.palette.accents;
        const lumMul = layerCfg.lumMul;
        const isAccent = Math.random() < 0.7;
        const baseColor = isAccent
            ? accents[Math.floor(Math.random() * accents.length)]
            : NEUTRAL_STAR;
        const color = shade(baseColor, lumMul);

        // 5.74.27 — sizes bumped: core 1.4–2.8 (was 0.7–2.0), halo 7–14×
        // (was 5–10×), spike 1.0–1.5× (was 0.7–1.1×). Brightness floor
        // raised from 0.7 → 0.85 so the dimmest flares still read.
        const brightness = random(0.85, 1.0);
        const coreSize = random(1.4, 2.8);
        const haloSize = coreSize * random(7, 14);
        const spikeLen = haloSize * random(1.0, 1.5);

        // Sprite must cover halo + spikes. Add padding for diagonal extent.
        const reach = Math.max(haloSize, spikeLen);
        const spriteSize = Math.ceil(reach * 2.4);  // 20% padding for rotation
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = spriteSize;
        spriteCanvas.height = spriteSize;
        const sctx = spriteCanvas.getContext('2d');
        const cx = spriteSize / 2;
        const cy = spriteSize / 2;
        this._paintStarSprite(sctx, cx, cy, color, brightness, coreSize, haloSize, spikeLen);

        return {
            x: Math.random() * fw,
            y: Math.random() * fh,
            depth: layerCfg.depth,
            sprite: spriteCanvas,
            spriteSize,
            // Per-star animation phases / speeds.
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() < 0.5 ? -1 : 1) * random(0.1, 0.4), // rad/sec
            // 5.74.27 — animation amps reduced so the combined runtime
            // alpha (twink × blink × slide) never drops far enough to
            // make a star imperceptible. Old worst-case 0.6 × 0.55 ×
            // 0.7 = 0.23; new worst-case ~0.85 × 0.7 × 0.85 = 0.50.
            twinkleSpeed: random(0.7, 1.6),
            twinklePhase: Math.random() * Math.PI * 2,
            twinkleAmp: random(0.10, 0.20),
            blinkPhase: Math.random() * Math.PI * 2,
            slideSpeed: random(0.08, 0.20),
            slidePhase: Math.random() * Math.PI * 2,
            slideAmp: random(0.08, 0.18),
        };
    }

    // Paint one star's halo + spikes + core into its sprite canvas.
    // Same recipe as the previous layer-baked path but isolated per-star.
    _paintStarSprite(ctx, x, y, color, brightness, coreSize, haloSize, spikeLen) {
        // Halo
        const hgrad = ctx.createRadialGradient(x, y, 0, x, y, haloSize);
        hgrad.addColorStop(0,    rgba(color, brightness * 0.95));
        hgrad.addColorStop(0.18, rgba(color, brightness * 0.55));
        hgrad.addColorStop(0.5,  rgba(color, brightness * 0.18));
        hgrad.addColorStop(1,    rgba(color, 0));
        ctx.fillStyle = hgrad;
        ctx.beginPath();
        ctx.arc(x, y, haloSize, 0, Math.PI * 2);
        ctx.fill();

        // 4-arm cross spikes
        const baseAng = random(0, Math.PI / 4);
        for (let k = 0; k < 4; k++) {
            const a = baseAng + (k * Math.PI) / 2;
            const ex = x + Math.cos(a) * spikeLen;
            const ey = y + Math.sin(a) * spikeLen;
            const sgrad = ctx.createLinearGradient(x, y, ex, ey);
            sgrad.addColorStop(0,   rgba(color, brightness * 1.0));
            sgrad.addColorStop(0.5, rgba(color, brightness * 0.40));
            sgrad.addColorStop(1,   rgba(color, 0));
            ctx.strokeStyle = sgrad;
            ctx.lineWidth = Math.max(0.8, coreSize * 0.4);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }

        // 45°-rotated cross-spike, shorter
        const crossAng = baseAng + Math.PI / 4;
        const crossLen = spikeLen * 0.55;
        for (let k = 0; k < 4; k++) {
            const a = crossAng + (k * Math.PI) / 2;
            const ex = x + Math.cos(a) * crossLen;
            const ey = y + Math.sin(a) * crossLen;
            const sgrad = ctx.createLinearGradient(x, y, ex, ey);
            sgrad.addColorStop(0,   rgba(color, brightness * 0.65));
            sgrad.addColorStop(1,   rgba(color, 0));
            ctx.strokeStyle = sgrad;
            ctx.lineWidth = Math.max(0.5, coreSize * 0.22);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }

        // Core
        ctx.fillStyle = rgba(color, brightness);
        ctx.beginPath();
        ctx.arc(x, y, coreSize, 0, Math.PI * 2);
        ctx.fill();

        // White-hot center
        ctx.fillStyle = rgba([255, 255, 255], Math.min(1, brightness));
        ctx.beginPath();
        ctx.arc(x, y, coreSize * 0.32, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Draw all stars onto the game canvas with depth-based parallax,
     * per-star rotation, twinkling, blinking, and slow opacity slide.
     *
     * `driftX/driftY` is an additive offset applied AFTER the camera-driven
     * parallax — used by the title screen to wander the lens-flare layers
     * regardless of camera movement. Closer layers (higher `depth`) drift
     * more, deepest layer barely budges, giving the lens flare stars a
     * "much further away" parallax feel relative to the foreground stars.
     *
     * `rotation` (radians) applies an additional rotation to each layer
     * about the camera-viewport center, scaled by `layer.depth` so closer
     * layers rotate visibly while the deepest layer stays nearly still.
     * `viewW/viewH` set the rotation pivot — pass the canvas viewport
     * dimensions so the pivot lands on the visible center.
     */
    draw(ctx, cameraX, cameraY, driftX = 0, driftY = 0, rotation = 0, viewW = 0, viewH = 0) {
        if (!this.generated) return;
        const halfW = (viewW || this.fieldWidth) / 2;
        const halfH = (viewH || this.fieldHeight) / 2;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

        ctx.save();
        for (const star of this.stars) {
            // Per-star animation:
            //   smooth twinkle  — slow sin (~0.7-1.6 rad/s), variable amp
            //   blink           — fixed 5 Hz with sharp pow(sin, 8) peaks
            //                     and per-star phase offset
            //   opacity slide   — very slow sin (~0.08-0.20 rad/s) for a
            //                     long-period brightness drift on top
            //   rotation        — accumulated angle = base + now * rotSpeed
            const wave = 0.5 + 0.5 * Math.sin(now * star.twinkleSpeed + star.twinklePhase);
            const twink = (1 - star.twinkleAmp) + star.twinkleAmp * wave;

            // 5.74.27 — blink dip reduced 0.45 → 0.30 so flicker stays
            // visible without ever pushing the star toward invisibility.
            const blinkPhaseT = now * 5 * Math.PI * 2 + star.blinkPhase;
            const blinkPeak = Math.pow(0.5 + 0.5 * Math.sin(blinkPhaseT), 8);
            const blink = 1 - 0.30 * blinkPeak;

            const slideWave = 0.5 + 0.5 * Math.sin(now * star.slideSpeed + star.slidePhase);
            const slide = (1 - star.slideAmp) + star.slideAmp * slideWave;

            const alpha = Math.max(0, Math.min(1, twink * blink * slide));
            if (alpha < 0.01) continue;

            // Parallax: caller already translated the canvas by -camera, so
            // drawing at world coord X puts the image on-screen at X-cameraX.
            // To produce a parallax screen-position of `star.x - cameraX *
            // depth` (deepest = locked to screen, closest = moves with
            // world), we draw at world coord `star.x + cameraX * (1-depth)`.
            // Mirrors the original layer-canvas formula.
            const camOffX = cameraX * (1 - star.depth);
            const camOffY = cameraY * (1 - star.depth);
            const driftOffX = driftX * star.depth;
            const driftOffY = driftY * star.depth;
            const sceneRot = rotation * star.depth;

            const sx = star.x + camOffX + driftOffX;
            const sy = star.y + camOffY + driftOffY;
            const angle = star.rotation + now * star.rotSpeed + sceneRot;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(sx, sy);
            ctx.rotate(angle);
            ctx.drawImage(star.sprite, -star.spriteSize / 2, -star.spriteSize / 2);
            ctx.restore();
        }
        ctx.restore();
    }
}

export const nebulaRenderer = new NebulaRenderer();
