// Pre-rendered nebula background layers
// Generates soft, colorful gas clouds on multiple offscreen canvases at
// different depths, then blits each frame with depth-based parallax.

import { random } from '../utils.js';

// Extended palette — each entry has multiple color stops for richer gradients
const NEBULA_PALETTES = [
    // Deep space purple → magenta
    { colors: [[120, 40, 200], [180, 30, 140], [60, 15, 100], [40, 10, 60]] },
    // Teal → cyan emission
    { colors: [[20, 180, 160], [40, 220, 200], [10, 100, 110], [5, 50, 60]] },
    // Crimson → orange star-forming
    { colors: [[200, 30, 50], [220, 80, 30], [140, 20, 40], [60, 10, 20]] },
    // Blue → violet reflection
    { colors: [[40, 80, 220], [100, 50, 200], [20, 50, 140], [10, 25, 70]] },
    // Warm gold → rose dust
    { colors: [[180, 120, 40], [200, 80, 60], [100, 60, 25], [50, 30, 15]] },
    // Green → teal planetary
    { colors: [[30, 190, 80], [20, 160, 140], [10, 100, 60], [5, 50, 30]] },
    // Pink → lavender
    { colors: [[200, 60, 160], [160, 80, 200], [100, 30, 120], [50, 15, 60]] },
    // Cyan → blue ice
    { colors: [[60, 200, 240], [40, 140, 220], [20, 80, 160], [10, 40, 80]] },
    // Amber → deep red
    { colors: [[240, 160, 30], [200, 60, 20], [120, 40, 15], [60, 20, 10]] },
    // Emerald → gold
    { colors: [[40, 200, 60], [160, 180, 30], [20, 120, 40], [10, 60, 20]] },
];

// Parallax layers: far nebulae barely move, near ones move more
const LAYER_CONFIG = [
    { depth: 0.02, blobCount: [3, 5], radiusRange: [200, 450], opacityRange: [0.03, 0.08] },
    { depth: 0.06, blobCount: [3, 5], radiusRange: [140, 320], opacityRange: [0.04, 0.10] },
    { depth: 0.12, blobCount: [2, 4], radiusRange: [100, 250], opacityRange: [0.03, 0.07] },
];

class NebulaRenderer {
    constructor() {
        this.layers = []; // { canvas, depth, fieldWidth, fieldHeight }
        this.generated = false;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
    }

    /**
     * Generate nebula layers once.
     * Call after game field size is known.
     */
    generate(fieldWidth, fieldHeight) {
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;
        this.layers = [];

        const scale = 0.5; // half-res for performance + natural softness
        const w = Math.ceil(fieldWidth * scale);
        const h = Math.ceil(fieldHeight * scale);

        for (const cfg of LAYER_CONFIG) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            const count = Math.floor(random(cfg.blobCount[0], cfg.blobCount[1] + 1));
            for (let i = 0; i < count; i++) {
                this._drawBlob(ctx, w, h, scale, cfg);
            }

            this.layers.push({ canvas, depth: cfg.depth });
        }

        this.generated = true;
    }

    _drawBlob(ctx, canvasW, canvasH, scale, layerCfg) {
        const palette = NEBULA_PALETTES[Math.floor(Math.random() * NEBULA_PALETTES.length)];
        const colors = palette.colors;
        const cx = random(canvasW * 0.05, canvasW * 0.95);
        const cy = random(canvasH * 0.05, canvasH * 0.95);
        const baseRadius = random(layerCfg.radiusRange[0], layerCfg.radiusRange[1]) * scale;

        // 3-5 overlapping sub-blobs for organic shape with color variation
        const subCount = Math.floor(random(3, 6));
        for (let s = 0; s < subCount; s++) {
            const ox = cx + random(-baseRadius * 0.5, baseRadius * 0.5);
            const oy = cy + random(-baseRadius * 0.5, baseRadius * 0.5);
            const r = baseRadius * random(0.5, 1.3);
            const opacity = random(layerCfg.opacityRange[0], layerCfg.opacityRange[1]);

            const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);

            // Pick 2-3 colors from the palette for this sub-blob
            const c0 = colors[Math.floor(Math.random() * colors.length)];
            const c1 = colors[Math.floor(Math.random() * colors.length)];
            const c2 = colors[Math.floor(Math.random() * colors.length)];

            grad.addColorStop(0, `rgba(${c0[0]},${c0[1]},${c0[2]},${opacity})`);
            grad.addColorStop(0.3, `rgba(${c1[0]},${c1[1]},${c1[2]},${opacity * 0.7})`);
            grad.addColorStop(0.6, `rgba(${c2[0]},${c2[1]},${c2[2]},${opacity * 0.35})`);
            grad.addColorStop(1, `rgba(${c2[0]},${c2[1]},${c2[2]},0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ox, oy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Draw all nebula layers onto the game canvas.
     * Call inside the camera transform, before stars.
     * @param {CanvasRenderingContext2D} ctx - game canvas context
     * @param {number} cameraX - current camera X offset
     * @param {number} cameraY - current camera Y offset
     */
    draw(ctx, cameraX, cameraY) {
        if (!this.generated) return;

        ctx.save();
        ctx.globalAlpha = 1; // opacity baked into the textures

        // Draw each layer with its own parallax depth
        // The camera transform (-cameraX, -cameraY) is already applied.
        // We counteract most of the camera movement, keeping only `depth` fraction.
        for (const layer of this.layers) {
            const offsetX = cameraX * (1 - layer.depth);
            const offsetY = cameraY * (1 - layer.depth);
            ctx.drawImage(
                layer.canvas,
                offsetX, offsetY,
                this.fieldWidth, this.fieldHeight
            );
        }

        ctx.restore();
    }
}

export const nebulaRenderer = new NebulaRenderer();
