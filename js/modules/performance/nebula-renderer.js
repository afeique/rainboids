// Pre-rendered nebula background layer
// Generates soft, colorful gas clouds on an offscreen canvas once,
// then blits them each frame with slow parallax for ambient depth.

import { random } from '../utils.js';

const NEBULA_PALETTES = [
    // Deep space purple/blue
    { core: [80, 40, 160], mid: [40, 20, 120], edge: [20, 10, 60] },
    // Teal emission nebula
    { core: [30, 140, 130], mid: [15, 80, 90], edge: [5, 40, 50] },
    // Red/magenta star-forming region
    { core: [160, 30, 60], mid: [100, 15, 40], edge: [50, 5, 20] },
    // Blue reflection nebula
    { core: [40, 80, 180], mid: [20, 50, 120], edge: [10, 25, 60] },
    // Warm gold/brown dust cloud
    { core: [140, 100, 40], mid: [80, 55, 20], edge: [40, 25, 10] },
    // Green/cyan planetary nebula
    { core: [30, 150, 80], mid: [15, 90, 50], edge: [5, 45, 25] },
];

class NebulaRenderer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.generated = false;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
    }

    /**
     * Generate nebula background once.
     * Call after game field size is known.
     */
    generate(fieldWidth, fieldHeight) {
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;

        // Render at half resolution for performance + natural softness
        const scale = 0.5;
        const w = Math.ceil(fieldWidth * scale);
        const h = Math.ceil(fieldHeight * scale);

        this.canvas = document.createElement('canvas');
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx = this.canvas.getContext('2d');

        // Start transparent
        this.ctx.clearRect(0, 0, w, h);

        // Place 4-7 nebula blobs
        const count = Math.floor(random(4, 8));
        for (let i = 0; i < count; i++) {
            this.drawNebulaBlob(w, h, scale);
        }

        this.generated = true;
    }

    drawNebulaBlob(canvasW, canvasH, scale) {
        const palette = NEBULA_PALETTES[Math.floor(Math.random() * NEBULA_PALETTES.length)];
        const cx = random(canvasW * 0.1, canvasW * 0.9);
        const cy = random(canvasH * 0.1, canvasH * 0.9);
        const radius = random(120, 300) * scale;

        // Each blob is 2-3 overlapping radial gradients for organic shape
        const layers = Math.floor(random(2, 4));
        for (let l = 0; l < layers; l++) {
            const ox = cx + random(-radius * 0.4, radius * 0.4);
            const oy = cy + random(-radius * 0.4, radius * 0.4);
            const r = radius * random(0.6, 1.2);
            const opacity = random(0.04, 0.12);

            const grad = this.ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
            const { core, mid, edge } = palette;
            grad.addColorStop(0, `rgba(${core[0]},${core[1]},${core[2]},${opacity})`);
            grad.addColorStop(0.35, `rgba(${mid[0]},${mid[1]},${mid[2]},${opacity * 0.7})`);
            grad.addColorStop(0.7, `rgba(${edge[0]},${edge[1]},${edge[2]},${opacity * 0.3})`);
            grad.addColorStop(1, `rgba(${edge[0]},${edge[1]},${edge[2]},0)`);

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(ox, oy, r, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    /**
     * Draw pre-rendered nebula onto the game canvas.
     * Call inside the camera transform, before stars.
     * @param {CanvasRenderingContext2D} ctx - game canvas context
     * @param {number} cameraX - current camera X offset
     * @param {number} cameraY - current camera Y offset
     */
    draw(ctx, cameraX, cameraY) {
        if (!this.generated) return;

        // The camera transform (-cameraX, -cameraY) is already applied.
        // To make nebulae nearly stationary (very slow parallax), we
        // counteract most of the camera movement — keeping only 2%.
        const offsetX = cameraX * 0.98;
        const offsetY = cameraY * 0.98;

        ctx.save();
        ctx.globalAlpha = 1; // opacity baked into the texture
        ctx.drawImage(
            this.canvas,
            offsetX, offsetY,
            this.fieldWidth, this.fieldHeight
        );
        ctx.restore();
    }
}

export const nebulaRenderer = new NebulaRenderer();
