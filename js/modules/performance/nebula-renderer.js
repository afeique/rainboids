// Pre-rendered nebula background layers
//
// Goals (revised pass):
//   • Strong parallax — near layer moves at ~65% camera speed, far
//     layer is fully locked. The 5.4× depth differential gives the
//     starfield a real sense of volume as the player moves.
//   • Cohesive palette — one "scene palette" is committed per
//     generate() call so every layer, every blob, every wisp draws
//     from the same color family. Per-layer luminance shift adds
//     atmospheric perspective (far = cooler/dimmer, near = warmer/
//     brighter) without breaking the theme.
//   • Faux-3D structure — each blob is rendered in three passes:
//       1. shadow body (offset, dark, soft) → fakes volumetric depth
//       2. main body  (multi-stop gradient with palette colors)
//       3. hot core   (small, bright, off-center highlight)
//     Plus a stardust speckle pass and elongated wisps between
//     dense regions to suggest gas filaments.
//
// Generation runs once on game start. Per-frame cost is just N
// drawImage() calls, one per layer.

import { random } from '../core/utils.js';

// Scene palettes — each is a full color family. One is committed
// per generate() call. Adds `accent` for the chromatic edge-halo
// pass (slightly hue-shifted from primary for visual interest).
const SCENE_PALETTES = [
    // Deep indigo + cobalt — classic space blue
    {
        name: 'cobalt-deep',
        primary:    [50, 80, 220],
        secondary:  [30, 50, 180],
        tertiary:   [80, 130, 255],
        accent:     [120, 200, 255],
        shadow:     [10, 15, 50],
        highlight:  [180, 200, 255],
        speckle:    [220, 230, 255],
    },
    // Violet + magenta — stellar nursery
    {
        name: 'violet-nursery',
        primary:    [120, 60, 220],
        secondary:  [80, 30, 160],
        tertiary:   [200, 100, 255],
        accent:     [255, 100, 200],
        shadow:     [25, 10, 50],
        highlight:  [240, 180, 255],
        speckle:    [255, 220, 255],
    },
    // Teal + cyan + sapphire — frozen aurora
    {
        name: 'teal-aurora',
        primary:    [40, 160, 200],
        secondary:  [20, 100, 160],
        tertiary:   [80, 220, 240],
        accent:     [120, 255, 220],
        shadow:     [5, 30, 60],
        highlight:  [180, 240, 255],
        speckle:    [220, 250, 255],
    },
    // Amber + ember + warm gold — rare warm contrast
    {
        name: 'ember-warmth',
        primary:    [200, 140, 60],
        secondary:  [160, 90, 40],
        tertiary:   [240, 200, 100],
        accent:     [255, 130, 80],
        shadow:     [50, 25, 10],
        highlight:  [255, 240, 180],
        speckle:    [255, 240, 200],
    },
    // Periwinkle lavender — soft and dreamy
    {
        name: 'periwinkle-dream',
        primary:    [110, 110, 230],
        secondary:  [70, 70, 180],
        tertiary:   [160, 140, 240],
        accent:     [200, 180, 255],
        shadow:     [25, 25, 70],
        highlight:  [220, 210, 255],
        speckle:    [240, 230, 255],
    },
    // Crimson rose + ultraviolet — ominous
    {
        name: 'crimson-ultraviolet',
        primary:    [180, 60, 140],
        secondary:  [100, 30, 80],
        tertiary:   [220, 100, 180],
        accent:     [180, 80, 220],
        shadow:     [40, 10, 30],
        highlight:  [255, 200, 230],
        speckle:    [255, 220, 240],
    },
    // Emerald + jade — rare verdant accent (think Eagle nebula)
    {
        name: 'emerald-jade',
        primary:    [50, 180, 130],
        secondary:  [30, 130, 90],
        tertiary:   [120, 230, 180],
        accent:     [200, 255, 180],
        shadow:     [10, 40, 25],
        highlight:  [220, 255, 230],
        speckle:    [240, 255, 240],
    },
    // Rose pink + soft magenta — gentle / floral
    {
        name: 'rose-petal',
        primary:    [220, 100, 160],
        secondary:  [160, 60, 110],
        tertiary:   [255, 160, 200],
        accent:     [255, 200, 220],
        shadow:     [50, 20, 35],
        highlight:  [255, 230, 240],
        speckle:    [255, 240, 250],
    },
];

// Parallax layers — STRONG depth range. depth = how much the layer
// stays locked to the camera (0 = fully locked, 1 = moves with player).
// Each layer also gets a luminance multiplier so far layers look
// distant/dim and near layers look close/bright (atmospheric
// perspective).
const LAYER_CONFIG = [
    {
        // Far back — dim, locked to camera, biggest blobs
        depth: 0.0,
        lumMul: 0.45,
        blobCount: [4, 6],
        radiusRange: [320, 700],
        opacityRange: [0.05, 0.10],
        speckles: 90,
        speckleAlpha: [0.10, 0.22],
        wispCount: [2, 4],
    },
    {
        // Mid-far — slightly more parallax, slightly brighter
        depth: 0.18,
        lumMul: 0.65,
        blobCount: [3, 5],
        radiusRange: [220, 480],
        opacityRange: [0.06, 0.13],
        speckles: 70,
        speckleAlpha: [0.18, 0.35],
        wispCount: [2, 3],
    },
    {
        // Mid-near — clear parallax kick
        depth: 0.40,
        lumMul: 0.85,
        blobCount: [3, 4],
        radiusRange: [140, 320],
        opacityRange: [0.07, 0.15],
        speckles: 50,
        speckleAlpha: [0.30, 0.55],
        wispCount: [1, 3],
    },
    {
        // Closest — very strong parallax, brightest layer, smallest blobs
        depth: 0.65,
        lumMul: 1.00,
        blobCount: [2, 3],
        radiusRange: [80, 180],
        opacityRange: [0.08, 0.18],
        speckles: 30,
        speckleAlpha: [0.45, 0.75],
        wispCount: [1, 2],
    },
];

// ── Color helpers ────────────────────────────────────────────────────────
function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
// Scale RGB toward black (mul < 1) or toward white (mul > 1) for
// per-layer atmospheric perspective.
function shade(c, mul) {
    const r = Math.max(0, Math.min(255, Math.round(c[0] * mul)));
    const g = Math.max(0, Math.min(255, Math.round(c[1] * mul)));
    const b = Math.max(0, Math.min(255, Math.round(c[2] * mul)));
    return [r, g, b];
}

class NebulaRenderer {
    constructor() {
        this.layers = []; // { canvas, depth, fieldWidth, fieldHeight }
        this.generated = false;
        this.fieldWidth = 0;
        this.fieldHeight = 0;
        this.scenePalette = null;
    }

    /**
     * Generate nebula layers once. Call after game-field size is known.
     */
    generate(fieldWidth, fieldHeight) {
        this.fieldWidth = fieldWidth;
        this.fieldHeight = fieldHeight;
        this.layers = [];

        // Commit one scene-wide palette so every layer is part of the
        // same nebula family. This is the big consistency win.
        this.scenePalette = SCENE_PALETTES[
            Math.floor(Math.random() * SCENE_PALETTES.length)
        ];

        const scale = 0.5; // half-res for performance + natural softness
        const w = Math.ceil(fieldWidth * scale);
        const h = Math.ceil(fieldHeight * scale);

        for (const cfg of LAYER_CONFIG) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            // Per-layer palette derivation: shade everything by the
            // layer's luminance multiplier so far layers look distant
            // (cooler/dimmer) and near layers pop.
            const lp = this._derivedLayerPalette(cfg.lumMul);

            // Sky tint — faint full-canvas wash so the layer reads as
            // a continuous gas field rather than detached patches.
            this._drawSkyTint(ctx, w, h, cfg, lp);

            // Body — main nebula blobs. Mix density profiles for
            // visual rhythm: a few bright cores, a base of normal
            // blobs, plus large background haze patches.
            const blobCount = Math.floor(random(cfg.blobCount[0], cfg.blobCount[1] + 1));
            const blobs = [];
            for (let i = 0; i < blobCount; i++) {
                // Density profile: 25% bright / 55% normal / 20% haze
                const r = Math.random();
                const profile = r < 0.25 ? 'bright' : r < 0.80 ? 'normal' : 'haze';
                blobs.push(this._drawBlob(ctx, w, h, scale, cfg, lp, profile));
            }

            // Wisps — elongated streaks of gas connecting nearby blobs.
            // Adds the "filament" detail that suggests 3D structure.
            const wispCount = Math.floor(random(cfg.wispCount[0], cfg.wispCount[1] + 1));
            for (let i = 0; i < wispCount; i++) {
                this._drawWisp(ctx, w, h, scale, cfg, lp, blobs);
            }

            // Stardust speckle — tiny dots of high-alpha highlight
            // color seeded inside denser regions. Sells the "this is
            // dust, not just a fill" feel.
            this._drawStardust(ctx, w, h, cfg, lp, blobs);

            this.layers.push({ canvas, depth: cfg.depth });
        }

        this.generated = true;
    }

    _derivedLayerPalette(lumMul) {
        const sp = this.scenePalette;
        return {
            primary:   shade(sp.primary,   lumMul),
            secondary: shade(sp.secondary, lumMul),
            tertiary:  shade(sp.tertiary,  lumMul),
            accent:    shade(sp.accent,    Math.min(1.1, lumMul + 0.05)),
            shadow:    shade(sp.shadow,    Math.max(0.3, lumMul - 0.2)),
            highlight: shade(sp.highlight, Math.min(1.2, lumMul + 0.2)),
            speckle:   sp.speckle, // speckle stays bright across all layers
        };
    }

    // Faint full-canvas wash in the layer's secondary color. Anchors
    // the layer in the palette and prevents the nebula from feeling
    // like detached patches floating on pure black. Strength scales
    // with layer luminance so far layers contribute less.
    _drawSkyTint(ctx, w, h, layerCfg, lp) {
        const grad = ctx.createRadialGradient(
            w * (0.4 + Math.random() * 0.2),
            h * (0.4 + Math.random() * 0.2),
            0,
            w / 2, h / 2,
            Math.max(w, h) * 0.7,
        );
        const tintAlpha = 0.04 * layerCfg.lumMul;
        grad.addColorStop(0,   rgba(lp.tertiary,  tintAlpha));
        grad.addColorStop(0.5, rgba(lp.secondary, tintAlpha * 0.7));
        grad.addColorStop(1,   rgba(lp.shadow,    tintAlpha * 0.4));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    // Returns the placed blob's center + base radius so wisps + stardust
    // can anchor near density peaks. `profile` selects density variant:
    //   'bright' — vivid, high opacity, definite hot core, edge halo
    //   'normal' — middle ground, the workhorse blob
    //   'haze'   — large, dim, no hot core; background gas
    _drawBlob(ctx, canvasW, canvasH, scale, layerCfg, lp, profile = 'normal') {
        const cx = random(canvasW * 0.05, canvasW * 0.95);
        const cy = random(canvasH * 0.05, canvasH * 0.95);
        let baseRadius = random(layerCfg.radiusRange[0], layerCfg.radiusRange[1]) * scale;

        // Density-profile multipliers
        let opacityMul = 1.0;
        let radiusMul  = 1.0;
        let drawCore   = true;
        let drawHalo   = true;
        if (profile === 'bright') {
            opacityMul = 1.4;
            radiusMul  = 0.85;
        } else if (profile === 'haze') {
            opacityMul = 0.55;
            radiusMul  = 1.55;
            drawCore   = false;
            drawHalo   = Math.random() < 0.4; // mostly skip on haze
        }
        baseRadius *= radiusMul;

        // Sub-blobs — 4-6 overlapping clouds for organic shape. Each
        // sub-blob is rendered as an ELLIPSE (not a circle) so the
        // overall nebula shape doesn't read as bubbles. Eccentricity
        // and rotation vary per sub-blob.
        const subCount = Math.floor(random(4, 7));
        for (let s = 0; s < subCount; s++) {
            const ox = cx + random(-baseRadius * 0.55, baseRadius * 0.55);
            const oy = cy + random(-baseRadius * 0.55, baseRadius * 0.55);
            const r  = baseRadius * random(0.55, 1.2);
            const opacity = random(layerCfg.opacityRange[0], layerCfg.opacityRange[1]) * opacityMul;

            // Ellipse params: aspect 0.6..1.6 with random rotation.
            const aspect = random(0.6, 1.6);
            const rx = r * Math.sqrt(aspect);
            const ry = r / Math.sqrt(aspect);
            const rot = Math.random() * Math.PI;

            // Helper to fill an elliptical path centered at (px,py)
            // rotated by `rot`, sized (erx, ery), with the given
            // radial gradient. createRadialGradient takes scalar
            // radii, so we draw the gradient on a circle of `R = max`
            // and use ellipse path to clip the visual shape.
            const drawEllipseGradient = (px, py, erx, ery, gradFactory) => {
                const R = Math.max(erx, ery);
                const grad = gradFactory(px, py, R);
                ctx.fillStyle = grad;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(rot);
                ctx.scale(erx / R, ery / R);
                ctx.beginPath();
                ctx.arc(0, 0, R, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            };

            // ── 1. Shadow pass — large, dark, slightly offset ──
            const shadowOffset = r * 0.18;
            const sax = ox + shadowOffset;
            const say = oy + shadowOffset;
            drawEllipseGradient(sax, say, rx * 1.15, ry * 1.15, (px, py, R) => {
                const g = ctx.createRadialGradient(px, py, 0, px, py, R);
                g.addColorStop(0,   rgba(lp.shadow, opacity * 0.55));
                g.addColorStop(0.6, rgba(lp.shadow, opacity * 0.25));
                g.addColorStop(1,   rgba(lp.shadow, 0));
                return g;
            });

            // ── 2. Main body — multi-stop gradient through the palette ──
            drawEllipseGradient(ox, oy, rx, ry, (px, py, R) => {
                const g = ctx.createRadialGradient(px, py, 0, px, py, R);
                g.addColorStop(0,    rgba(lp.tertiary,  opacity));
                g.addColorStop(0.25, rgba(lp.primary,   opacity * 0.85));
                g.addColorStop(0.55, rgba(lp.secondary, opacity * 0.55));
                g.addColorStop(0.85, rgba(lp.secondary, opacity * 0.18));
                g.addColorStop(1,    rgba(lp.secondary, 0));
                return g;
            });

            // ── 3. Edge halo — thin ring of accent color at the
            //    outer edge. Adds chromatic complexity / makes the
            //    blob's silhouette feel less uniform. Skipped on
            //    haze blobs (would muddy the soft look).
            if (drawHalo) {
                drawEllipseGradient(ox, oy, rx * 1.05, ry * 1.05, (px, py, R) => {
                    const g = ctx.createRadialGradient(px, py, R * 0.78, px, py, R);
                    g.addColorStop(0,   rgba(lp.accent, 0));
                    g.addColorStop(0.6, rgba(lp.accent, opacity * 0.35));
                    g.addColorStop(1,   rgba(lp.accent, 0));
                    return g;
                });
            }

            // ── 4. Hot core — small bright spot, off-center,
            //    ALWAYS round (not affected by ellipse aspect) so
            //    the brightness reads as a star-like nucleus.
            //    Skipped on haze blobs.
            if (drawCore) {
                const coreOx = ox + random(-r * 0.18, r * 0.18);
                const coreOy = oy + random(-r * 0.18, r * 0.18);
                const coreR = r * random(0.18, 0.32);
                const cgrad = ctx.createRadialGradient(coreOx, coreOy, 0, coreOx, coreOy, coreR);
                cgrad.addColorStop(0,   rgba(lp.highlight, opacity * 1.4));
                cgrad.addColorStop(0.5, rgba(lp.tertiary,  opacity * 0.8));
                cgrad.addColorStop(1,   rgba(lp.tertiary,  0));
                ctx.fillStyle = cgrad;
                ctx.beginPath();
                ctx.arc(coreOx, coreOy, coreR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        return { cx, cy, baseRadius };
    }

    // Draw an elongated soft gradient between two blob centers (or
    // between a blob and a random point) to suggest a gas filament.
    // Implemented as a chain of small radial gradients along the line.
    _drawWisp(ctx, canvasW, canvasH, scale, layerCfg, lp, blobs) {
        if (blobs.length < 2) return;
        const a = blobs[Math.floor(Math.random() * blobs.length)];
        let b = blobs[Math.floor(Math.random() * blobs.length)];
        if (b === a && blobs.length > 1) {
            b = blobs[(blobs.indexOf(a) + 1) % blobs.length];
        }

        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 50) return; // nothing to thread

        const steps = Math.max(6, Math.floor(dist / 60));
        const wispOpacity = random(layerCfg.opacityRange[0], layerCfg.opacityRange[1]) * 0.5;
        const baseSize = ((a.baseRadius + b.baseRadius) / 2) * 0.18;

        // Light arc bow — perpendicular displacement so the wisp
        // doesn't look like a straight ruler. Up to ±30% of dist.
        const px = -dy / dist;
        const py = dx / dist;
        const bow = random(-dist * 0.3, dist * 0.3);

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            // Quadratic bow: peaks at midpoint
            const bowFactor = 4 * t * (1 - t);
            const sx = a.cx + dx * t + px * bow * bowFactor;
            const sy = a.cy + dy * t + py * bow * bowFactor;
            const r = baseSize * random(0.7, 1.5);

            const wgrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            wgrad.addColorStop(0,   rgba(lp.tertiary,  wispOpacity));
            wgrad.addColorStop(0.5, rgba(lp.primary,   wispOpacity * 0.55));
            wgrad.addColorStop(1,   rgba(lp.primary,   0));
            ctx.fillStyle = wgrad;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Sprinkle tiny bright dots inside / near each blob to suggest the
    // grainy stardust that fills a real nebula. Higher density inside
    // blobs, sparse fall-off outside.
    _drawStardust(ctx, canvasW, canvasH, layerCfg, lp, blobs) {
        const total = layerCfg.speckles;
        for (let i = 0; i < total; i++) {
            // Bias 70% of speckles to live inside blobs.
            let x, y;
            if (Math.random() < 0.7 && blobs.length > 0) {
                const b = blobs[Math.floor(Math.random() * blobs.length)];
                const ang = Math.random() * Math.PI * 2;
                // Pull toward center via sqrt for higher density at core
                const dist = Math.sqrt(Math.random()) * b.baseRadius * 0.85;
                x = b.cx + Math.cos(ang) * dist;
                y = b.cy + Math.sin(ang) * dist;
            } else {
                x = Math.random() * canvasW;
                y = Math.random() * canvasH;
            }

            // Color: 80% pure speckle white, 15% palette accent, 5% highlight
            // (prevents the speckle field from looking monochromatic).
            const r = Math.random();
            const c = r < 0.80 ? lp.speckle
                    : r < 0.95 ? lp.accent
                    : lp.highlight;
            const a = random(layerCfg.speckleAlpha[0], layerCfg.speckleAlpha[1]);

            // Size distribution: 70% small dust, 25% medium, 5% bright stars
            const t = Math.random();
            let size;
            if (t < 0.70) size = 0.4;
            else if (t < 0.95) size = 0.9;
            else size = 1.5;

            ctx.fillStyle = rgba(c, a);
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            // The brightest speckles get a tiny corona — feels like a
            // pinpoint star embedded in the gas.
            if (size === 1.5) {
                ctx.fillStyle = rgba(c, a * 0.35);
                ctx.beginPath();
                ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Draw all nebula layers onto the game canvas.
     * Call inside the camera transform, before stars.
     */
    draw(ctx, cameraX, cameraY) {
        if (!this.generated) return;

        ctx.save();
        ctx.globalAlpha = 1;

        // Each layer counteracts (1 - depth) of the camera transform.
        // depth=0 → fully locked (nebula doesn't move with camera).
        // depth=0.65 → nebula moves at 65% of camera speed.
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
