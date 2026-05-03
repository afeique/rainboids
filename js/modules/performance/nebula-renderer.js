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

// Scene palettes — each declares a RICH POOL of body tones (6-8
// colors) that blobs draw from randomly per render. Each palette also
// has cross-family accent hues (a complementary or analogous wash)
// listed in `accents`, so individual blobs can occasionally lean on
// a different but still palette-coherent tone. This gives the nebula
// strong intra-scene color variety while keeping the family
// recognisable.
//
// Schema:
//   tones      — 6-8 RGB triplets, the main body color pool
//   accents    — 2-3 RGB triplets, used for edge halos + speckles
//   shadow     — single dark color for shadow pass
//   highlight  — single bright color for hot cores
//   speckle    — bright neutral for stardust
const SCENE_PALETTES = [
    // ── Cobalt-deep — sapphire + indigo + steel
    {
        name: 'cobalt-deep',
        tones: [
            [40, 70, 220],   // royal cobalt
            [25, 45, 170],   // indigo
            [70, 110, 240],  // sky-leaning blue
            [90, 150, 255],  // bright sapphire
            [55, 90, 200],   // mid-cobalt
            [30, 60, 130],   // muted navy
            [110, 60, 200],  // violet shoulder
        ],
        accents: [[120, 200, 255], [180, 130, 255], [80, 220, 240]],
        shadow:  [10, 15, 50],
        highlight: [200, 220, 255],
        speckle: [220, 230, 255],
    },
    // ── Violet-nursery — stellar-nursery purples + magentas
    {
        name: 'violet-nursery',
        tones: [
            [120, 50, 220],   // royal violet
            [80, 30, 160],    // deep purple
            [180, 80, 230],   // amethyst
            [220, 110, 240],  // bright magenta
            [100, 40, 200],   // rich plum
            [60, 20, 130],    // shadow purple
            [240, 130, 200],  // rose violet
        ],
        accents: [[255, 100, 200], [180, 80, 255], [255, 200, 230]],
        shadow:  [25, 10, 50],
        highlight: [245, 200, 255],
        speckle: [255, 220, 255],
    },
    // ── Teal-aurora — frozen aurora cyans + sapphires
    {
        name: 'teal-aurora',
        tones: [
            [30, 150, 200],   // cyan-teal
            [15, 100, 160],   // deep teal
            [80, 220, 240],   // bright cyan
            [50, 180, 220],   // sky-cyan
            [10, 70, 120],    // navy teal
            [120, 240, 220],  // mint shoulder
            [60, 200, 200],   // turquoise
        ],
        accents: [[120, 255, 220], [80, 200, 255], [180, 255, 240]],
        shadow:  [5, 30, 60],
        highlight: [200, 245, 255],
        speckle: [220, 250, 255],
    },
    // ── Ember-warmth — amber + gold + rare red contrast
    {
        name: 'ember-warmth',
        tones: [
            [200, 130, 50],   // amber
            [160, 80, 30],    // ember
            [240, 200, 90],   // gold
            [220, 160, 70],   // honey
            [180, 100, 40],   // burnt
            [255, 220, 130],  // light gold
            [220, 80, 50],    // rare red flare
        ],
        accents: [[255, 140, 80], [255, 200, 100], [255, 100, 60]],
        shadow:  [50, 25, 10],
        highlight: [255, 240, 180],
        speckle: [255, 240, 200],
    },
    // ── Periwinkle-dream — soft lavender + cornflower
    {
        name: 'periwinkle-dream',
        tones: [
            [110, 110, 230],  // periwinkle
            [70, 70, 180],    // deeper periwinkle
            [160, 140, 240],  // lavender
            [130, 160, 230],  // cornflower
            [180, 170, 250],  // light lilac
            [90, 90, 200],    // muted indigo
            [200, 200, 255],  // pale highlight
        ],
        accents: [[200, 180, 255], [220, 220, 255], [180, 160, 240]],
        shadow:  [25, 25, 70],
        highlight: [230, 220, 255],
        speckle: [240, 230, 255],
    },
    // ── Crimson-ultraviolet — ominous magenta + UV purple
    {
        name: 'crimson-ultraviolet',
        tones: [
            [180, 60, 140],   // magenta
            [100, 30, 80],    // dark crimson
            [220, 100, 180],  // hot pink
            [180, 80, 220],   // ultraviolet
            [120, 40, 100],   // rich rose
            [240, 130, 200],  // bright pink
            [80, 20, 60],     // shadow rose
        ],
        accents: [[180, 80, 220], [255, 130, 200], [220, 100, 240]],
        shadow:  [40, 10, 30],
        highlight: [255, 200, 230],
        speckle: [255, 220, 240],
    },
    // ── Emerald-jade — rare verdant accent (Eagle nebula vibe)
    {
        name: 'emerald-jade',
        tones: [
            [50, 180, 130],   // emerald
            [30, 130, 90],    // forest jade
            [120, 230, 180],  // light jade
            [80, 200, 150],   // mint
            [40, 150, 110],   // dark teal-green
            [180, 240, 200],  // pale jade
            [70, 220, 160],   // bright spring
        ],
        accents: [[200, 255, 180], [120, 255, 200], [180, 230, 100]],
        shadow:  [10, 40, 25],
        highlight: [220, 255, 230],
        speckle: [240, 255, 240],
    },
    // ── Rose-petal — gentle pink + magenta
    {
        name: 'rose-petal',
        tones: [
            [220, 100, 160],  // rose
            [160, 60, 110],   // dark rose
            [255, 160, 200],  // light pink
            [240, 130, 180],  // mid-rose
            [180, 80, 130],   // muted rose
            [255, 200, 220],  // pale petal
            [220, 110, 140],  // dusty rose
        ],
        accents: [[255, 200, 220], [255, 180, 240], [255, 150, 180]],
        shadow:  [50, 20, 35],
        highlight: [255, 230, 240],
        speckle: [255, 240, 250],
    },
    // ── Twilight-spectrum — multi-hue twilight (blue→violet→pink)
    {
        name: 'twilight-spectrum',
        tones: [
            [70, 100, 220],   // sunset blue
            [120, 80, 220],   // dusk violet
            [200, 100, 200],  // twilight magenta
            [160, 140, 240],  // pre-night lavender
            [240, 130, 180],  // sunset pink
            [80, 60, 180],    // late dusk
            [220, 160, 220],  // soft mauve
        ],
        accents: [[255, 180, 200], [180, 220, 255], [220, 140, 255]],
        shadow:  [20, 15, 60],
        highlight: [255, 220, 240],
        speckle: [240, 225, 255],
    },
    // ── Solar-corona — burning yellow + orange + white-hot
    {
        name: 'solar-corona',
        tones: [
            [255, 180, 60],   // gold
            [240, 130, 50],   // orange
            [255, 220, 120],  // pale gold
            [220, 80, 30],    // burning red-orange
            [255, 240, 180],  // hot white-yellow
            [200, 100, 40],   // ember
            [255, 160, 80],   // sunset
        ],
        accents: [[255, 100, 50], [255, 220, 100], [255, 180, 80]],
        shadow:  [60, 20, 5],
        highlight: [255, 250, 220],
        speckle: [255, 240, 200],
    },
];

// Parallax layers — STRONG depth range. depth = how much the layer
// stays locked to the camera (0 = fully locked, 1 = moves with player).
// Each layer also gets a luminance multiplier so far layers look
// distant/dim and near layers look close/bright (atmospheric
// perspective).
//
// Pared back: the dust speckles + filament threads + dust lanes +
// wisps + sky-tint passes were removed because together they laid a
// uniform haze over the entire canvas. Only the structured passes
// remain: blobs (with their internal volumetric layering) and bright
// embedded "lens-flare" stars with diffraction spikes.
const LAYER_CONFIG = [
    {
        // Far back — dim, locked to camera, biggest blobs
        depth: 0.0,
        lumMul: 0.45,
        blobCount: [4, 6],
        radiusRange: [320, 700],
        opacityRange: [0.05, 0.10],
        embeddedStars: 6,
    },
    {
        // Mid-far — slightly more parallax, slightly brighter
        depth: 0.18,
        lumMul: 0.65,
        blobCount: [3, 5],
        radiusRange: [220, 480],
        opacityRange: [0.06, 0.13],
        embeddedStars: 8,
    },
    {
        // Mid-near — clear parallax kick
        depth: 0.40,
        lumMul: 0.85,
        blobCount: [3, 4],
        radiusRange: [140, 320],
        opacityRange: [0.07, 0.15],
        embeddedStars: 10,
    },
    {
        // Closest — very strong parallax, brightest layer, smallest blobs
        depth: 0.65,
        lumMul: 1.00,
        blobCount: [2, 3],
        radiusRange: [80, 180],
        opacityRange: [0.08, 0.18],
        embeddedStars: 12,
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
// Pick `n` distinct random items from `arr`. Returns shallow refs.
function pickRandom(arr, n) {
    const pool = arr.slice();
    const out = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return out;
}
// HSL conversion for per-blob hue jitter. RGB→HSL→jitter→RGB.
function rgbToHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return [h, s, l];
}
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1)      { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else             { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255),
    ];
}
// Slightly rotate hue and tweak saturation/lightness — used to
// give each blob its own color personality without leaving the
// palette family. dH in degrees, dS/dL in [-1..1].
function jitterHsl(c, dH, dS, dL) {
    const [h, s, l] = rgbToHsl(c);
    return hslToRgb(h + dH, s + dS, l + dL);
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

            // Embedded "lens-flare" stars — bright pinpoints with
            // halos and four-pointy-corner diffraction spikes,
            // biased to blob interiors. Only structured pass that
            // survived the dust-haze cull.
            this._drawEmbeddedStars(ctx, w, h, cfg, lp, blobs);

            this.layers.push({ canvas, depth: cfg.depth });
        }

        this.generated = true;
    }

    _derivedLayerPalette(lumMul) {
        const sp = this.scenePalette;
        return {
            // Tones + accents are SHADED ARRAYS — blobs sample from
            // these per-render to vary their color personality. The
            // shading (lumMul) gives atmospheric perspective per
            // layer.
            tones:     sp.tones.map(c => shade(c, lumMul)),
            accents:   sp.accents.map(c => shade(c, Math.min(1.1, lumMul + 0.05))),
            shadow:    shade(sp.shadow,    Math.max(0.3, lumMul - 0.2)),
            highlight: shade(sp.highlight, Math.min(1.2, lumMul + 0.2)),
            speckle:   sp.speckle, // speckle stays bright across all layers
        };
    }

    // Returns the placed blob's center + base radius. `profile` selects
    // the density variant:
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

        // Per-blob color identity:
        //   • Pick 3 distinct tones from the layer pool for the body
        //     gradient — different blobs get different combos so each
        //     reads as its own cloud while staying in the family.
        //   • Pick 1 accent for the edge halo.
        //   • Apply a per-blob HSL hue jitter (±15°, ±0.08 sat, ±0.05
        //     light) so even the same triplet doesn't look identical
        //     across blobs.
        const [tone0, tone1, tone2] = pickRandom(lp.tones, 3);
        const haloAccent = pickRandom(lp.accents, 1)[0];
        const hueShift = random(-15, 15);
        const satShift = random(-0.08, 0.08);
        const litShift = random(-0.05, 0.05);
        const inner = jitterHsl(tone0, hueShift, satShift, litShift);
        const mid   = jitterHsl(tone1 || tone0, hueShift * 0.7, satShift, litShift);
        const outer = jitterHsl(tone2 || tone1 || tone0, hueShift * 0.4, satShift, litShift);
        const halo  = jitterHsl(haloAccent, hueShift * 0.5, 0, 0);

        // Sub-blobs — 4-6 overlapping clouds for organic shape, each
        // an ellipse for asymmetric silhouette.
        const subCount = Math.floor(random(4, 7));
        for (let s = 0; s < subCount; s++) {
            const ox = cx + random(-baseRadius * 0.55, baseRadius * 0.55);
            const oy = cy + random(-baseRadius * 0.55, baseRadius * 0.55);
            const r  = baseRadius * random(0.55, 1.2);
            const opacity = random(layerCfg.opacityRange[0], layerCfg.opacityRange[1]) * opacityMul;

            // Sub-blob can ALSO get a small additional jitter so
            // sub-blobs within the same blob aren't identical clones.
            const subInner = jitterHsl(inner, random(-6, 6), 0, random(-0.03, 0.03));
            const subMid   = jitterHsl(mid,   random(-4, 4), 0, random(-0.02, 0.02));
            const subOuter = jitterHsl(outer, random(-3, 3), 0, 0);

            const aspect = random(0.6, 1.6);
            const rx = r * Math.sqrt(aspect);
            const ry = r / Math.sqrt(aspect);
            const rot = Math.random() * Math.PI;

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

            // ── 1. Shadow pass ──
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

            // ── 2. Main body — multi-stop gradient through 3 sampled
            //    tones with per-stop alpha falloff. Five stops give a
            //    richer transition than the previous flat 3-stop look.
            drawEllipseGradient(ox, oy, rx, ry, (px, py, R) => {
                const g = ctx.createRadialGradient(px, py, 0, px, py, R);
                g.addColorStop(0.00, rgba(subInner, opacity));
                g.addColorStop(0.20, rgba(subInner, opacity * 0.92));
                g.addColorStop(0.45, rgba(subMid,   opacity * 0.7));
                g.addColorStop(0.70, rgba(subOuter, opacity * 0.45));
                g.addColorStop(0.90, rgba(subOuter, opacity * 0.18));
                g.addColorStop(1.00, rgba(subOuter, 0));
                return g;
            });

            // ── 3. Edge halo (skipped on haze) ──
            if (drawHalo) {
                drawEllipseGradient(ox, oy, rx * 1.05, ry * 1.05, (px, py, R) => {
                    const g = ctx.createRadialGradient(px, py, R * 0.78, px, py, R);
                    g.addColorStop(0,   rgba(halo, 0));
                    g.addColorStop(0.6, rgba(halo, opacity * 0.35));
                    g.addColorStop(1,   rgba(halo, 0));
                    return g;
                });
            }

            // ── 4. Hot core — bright off-center spot. Core color
            //    blends highlight + the inner tone so the nucleus
            //    inherits some palette identity rather than always
            //    being neutral white.
            if (drawCore) {
                const coreOx = ox + random(-r * 0.18, r * 0.18);
                const coreOy = oy + random(-r * 0.18, r * 0.18);
                const coreR = r * random(0.18, 0.32);
                const cgrad = ctx.createRadialGradient(coreOx, coreOy, 0, coreOx, coreOy, coreR);
                cgrad.addColorStop(0,   rgba(lp.highlight, opacity * 1.4));
                cgrad.addColorStop(0.5, rgba(subInner,     opacity * 0.8));
                cgrad.addColorStop(1,   rgba(subInner,     0));
                ctx.fillStyle = cgrad;
                ctx.beginPath();
                ctx.arc(coreOx, coreOy, coreR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        return { cx, cy, baseRadius };
    }

    // ── Embedded stars ───────────────────────────────────────────
    // Bright pinpoint stars with soft halos and a 4-arm diffraction
    // spike pattern, scattered through the layer with a bias to
    // blob interiors (young stars form inside their gas cloud).
    // THE single biggest "this is a space photograph" tell.
    _drawEmbeddedStars(ctx, canvasW, canvasH, layerCfg, lp, blobs) {
        const total = layerCfg.embeddedStars;
        for (let i = 0; i < total; i++) {
            // 60% biased inside blobs, 40% scattered free across the canvas.
            let x, y;
            if (Math.random() < 0.6 && blobs.length > 0) {
                const b = blobs[Math.floor(Math.random() * blobs.length)];
                const ang = Math.random() * Math.PI * 2;
                const dist = Math.sqrt(Math.random()) * b.baseRadius * 0.7;
                x = b.cx + Math.cos(ang) * dist;
                y = b.cy + Math.sin(ang) * dist;
            } else {
                x = Math.random() * canvasW;
                y = Math.random() * canvasH;
            }

            // Star color: 70% white-blue (hot stars), 20% palette
            // accent, 10% palette highlight — gives variety without
            // looking unnatural.
            const r = Math.random();
            const starColor = r < 0.70 ? lp.speckle
                            : r < 0.90 ? lp.accents[Math.floor(Math.random() * lp.accents.length)]
                            : lp.highlight;
            const brightness = random(0.6, 1.0);
            const coreSize = random(1.0, 2.4);
            const haloSize = coreSize * random(6, 12);
            const spikeLen = haloSize * random(0.7, 1.3);

            // ── Halo — soft glow around the star ──
            const hgrad = ctx.createRadialGradient(x, y, 0, x, y, haloSize);
            hgrad.addColorStop(0,    rgba(starColor, brightness * 0.7));
            hgrad.addColorStop(0.25, rgba(starColor, brightness * 0.35));
            hgrad.addColorStop(0.6,  rgba(starColor, brightness * 0.10));
            hgrad.addColorStop(1,    rgba(starColor, 0));
            ctx.fillStyle = hgrad;
            ctx.beginPath();
            ctx.arc(x, y, haloSize, 0, Math.PI * 2);
            ctx.fill();

            // ── Diffraction spikes — 4 thin tapered arms (cross) ──
            // Drawn as 4 directional gradients radiating from the
            // star core, each fading along its length. Slight angle
            // jitter keeps them from looking like a stamp.
            const baseAng = random(0, Math.PI / 4); // random rotation of the cross
            for (let k = 0; k < 4; k++) {
                const a = baseAng + (k * Math.PI) / 2;
                const ex = x + Math.cos(a) * spikeLen;
                const ey = y + Math.sin(a) * spikeLen;
                const sgrad = ctx.createLinearGradient(x, y, ex, ey);
                sgrad.addColorStop(0,   rgba(starColor, brightness * 0.85));
                sgrad.addColorStop(0.5, rgba(starColor, brightness * 0.25));
                sgrad.addColorStop(1,   rgba(starColor, 0));
                ctx.strokeStyle = sgrad;
                ctx.lineWidth = Math.max(0.6, coreSize * 0.3);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }

            // ── Bright core — the star itself ──
            ctx.fillStyle = rgba(starColor, brightness);
            ctx.beginPath();
            ctx.arc(x, y, coreSize, 0, Math.PI * 2);
            ctx.fill();
            // Hot white center pixel for the brightest stars
            if (brightness > 0.85) {
                ctx.fillStyle = rgba([255, 255, 255], 0.95);
                ctx.beginPath();
                ctx.arc(x, y, coreSize * 0.4, 0, Math.PI * 2);
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
