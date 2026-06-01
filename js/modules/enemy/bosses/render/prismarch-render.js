// enemy/bosses/render/prismarch-render.js — THE PRISMARCH / OMEGA (9.1.x finale).
//
// The capstone: a screen-dominating prismatic colossus running a FIVE-ASPECT
// gauntlet. A faceted crystalline body whose full-spectrum refraction gradient
// SHIFTS HUE per aspect (PYRO→CRYO→VOLT→TOXIC→OMEGA), an orbiting ring of
// themed facet weak-points (boss-parts, shieldsCore — each tinted to the active
// aspect's element), orbiting prismatic light-shards + reality-fracture cracks,
// and on the final OMEGA aspect a blinding multi-core radiant heart. The
// signature-attack wind-up (`boss.signatureTelegraph`) flares the whole body.
// Every VFX dialed up — this is the finale. Drawn in world space (the enemy
// pass is already inside the camera transform), following the prototype
// structure + boss-gfx grammar. RENDER-ONLY: reads aspect/phase state, never
// mutates the descriptor mechanics (the 5-aspect gate test stays green).

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc,
} from './boss-gfx.js';

// Per-aspect element tint (matches ELEMENTS.*.color). Aspect order:
// 0 PYRO, 1 CRYO, 2 VOLT, 3 TOXIC, 4 OMEGA (VOID+RADIANT).
const ASPECT_TINT = ['#ff5522', '#66ccff', '#a855ff', '#88ff44', '#b08cff'];
const ASPECT_GLOW = ['#ff8a4a', '#a0e0ff', '#c89bff', '#b6ff8a', '#fff0b0'];
// Full-spectrum facets used for the crystalline body refraction.
const SPECTRUM = ['#ff5a7a', '#ffb24a', '#fff14a', '#5affa0', '#5ad6ff', '#a07aff', '#ff6ada'];

function palFor(aspectIdx) {
    const tint = ASPECT_TINT[aspectIdx] || ASPECT_TINT[ASPECT_TINT.length - 1];
    const glow = ASPECT_GLOW[aspectIdx] || ASPECT_GLOW[ASPECT_GLOW.length - 1];
    return { dark: '#0c0820', mid: tint, bright: '#f0e8ff', glow };
}

export function drawPrismarch(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 140);
    const facing = boss.angle || 0;
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const telegraph = !!boss.signatureTelegraph;     // signature-attack wind-up
    const aspectIdx = Math.max(0, Math.min(4, currentPhaseIndex(boss)));
    const isOmega = aspectIdx >= 4 || enraged;
    const heat = Math.min(1, aspectIdx / 4) + (enraged ? 0.3 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 6 : 2.6));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const facets = livingParts(boss);
    const pal = palFor(aspectIdx);

    ctx.save();

    // ── 1 · Massive prismatic bloom aura (every VFX maxed for the finale) ──
    radialGlow(ctx, x, y, R * 0.5, R * (2.6 + heat * 0.6 + pulse * 0.25),
        pal.glow, 0.16 + heat * 0.2 + (telegraph ? 0.25 : 0) + pulse * 0.07);

    // ── 2 · Reality-fracture cracks radiating out (drifting shard seams) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cracks = 7;
    for (let k = 0; k < cracks; k++) {
        const a = facing + t * 0.15 + (k / cracks) * Math.PI * 2;
        const ci = hexRgb(SPECTRUM[k % SPECTRUM.length]);
        ctx.strokeStyle = rgba(ci, (0.12 + 0.1 * pulse) * (isOmega ? 1.4 : 1));
        ctx.lineWidth = Math.max(1, R * 0.012);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6);
        // jagged crack out to the rim
        let rr = R * 0.6;
        let aa = a;
        for (let s = 0; s < 4; s++) {
            rr += R * 0.5;
            aa += Math.sin(t + k + s) * 0.12;
            ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ── 3 · Faceted crystalline body — full-spectrum refraction, hue per aspect ──
    const bodyR = R * 0.62;
    // Underlying aspect-tinted core.
    layeredCore(ctx, x, y, bodyR, pal, heat, pulse);
    // Crystalline facet plates over the body (a faceted gem shell).
    const plateCount = isOmega ? 8 : 7;
    ctx.save();
    for (let k = 0; k < plateCount; k++) {
        const a0 = facing + t * 0.25 + (k / plateCount) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2 / plateCount);
        const r0 = bodyR * (0.5 + 0.1 * Math.sin(t * 1.5 + k));
        const ci = hexRgb(SPECTRUM[(k + aspectIdx) % SPECTRUM.length]);
        const g = ctx.createLinearGradient(
            x + Math.cos(a0) * r0, y + Math.sin(a0) * r0,
            x + Math.cos(a1) * bodyR, y + Math.sin(a1) * bodyR);
        g.addColorStop(0, rgba(ci, 0.30));
        g.addColorStop(1, rgba(hexRgb(pal.bright), 0.18));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a0) * bodyR, y + Math.sin(a0) * bodyR);
        ctx.lineTo(x + Math.cos((a0 + a1) / 2) * bodyR * 1.05, y + Math.sin((a0 + a1) / 2) * bodyR * 1.05);
        ctx.lineTo(x + Math.cos(a1) * bodyR, y + Math.sin(a1) * bodyR);
        ctx.closePath();
        ctx.fill();
        // Bright facet edge.
        ctx.strokeStyle = rgba(ci, 0.5 + 0.3 * pulse);
        ctx.lineWidth = Math.max(1.5, R * 0.02);
        ctx.stroke();
    }
    ctx.restore();

    // ── 4 · OMEGA multi-core radiant heart (final aspect) ──
    if (isOmega) {
        // A blinding cluster of radiant sub-cores around the centre.
        const cores = 3;
        for (let k = 0; k < cores; k++) {
            const a = t * 1.2 + (k / cores) * Math.PI * 2;
            const d = bodyR * 0.3;
            const hx = x + Math.cos(a) * d, hy = y + Math.sin(a) * d;
            layeredCore(ctx, hx, hy, bodyR * 0.26,
                { dark: '#3a2a00', mid: '#ffd84a', bright: '#fffce0', glow: '#fff0a0' },
                1, pulse);
        }
        radialGlow(ctx, x, y, bodyR * 0.4, bodyR * (1.8 + pulse * 0.5), '#fff6c0',
            0.3 + 0.3 * pulse);
    }

    // ── 5 · Themed facet weak-point ring (tinted to the active aspect element) ──
    for (let i = 0; i < facets.length; i++) {
        const part = facets[i];
        const px = part.x, py = part.y;
        const pr = part.radius || 20;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        // Each facet carries its aspect element; fall back to the aspect tint.
        const ftint = ASPECT_TINT[Math.max(0, ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID']
            .indexOf(part.element))] || pal.mid;
        const tintRgb = hexRgb(ftint);

        // Crystalline facet shard (a small spinning gem).
        radialGlow(ctx, px, py, pr * 0.4, pr * (1.9 + pulse * 0.3), ftint,
            (0.3 + 0.3 * pulse) * (0.4 + 0.6 * ph));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 1.5 + i);
        const gem = ctx.createLinearGradient(-pr, 0, pr, 0);
        gem.addColorStop(0, rgba(tintRgb, 0.35 * ph + 0.1));
        gem.addColorStop(0.5, rgba(hexRgb('#f0e8ff'), 0.7 * ph + 0.1));
        gem.addColorStop(1, rgba(tintRgb, 0.35 * ph + 0.1));
        ctx.fillStyle = gem;
        ctx.beginPath();
        ctx.moveTo(0, -pr);
        ctx.lineTo(pr, 0);
        ctx.lineTo(0, pr);
        ctx.lineTo(-pr, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(tintRgb, 0.6 * ph + 0.2);
        ctx.lineWidth = Math.max(1.5, pr * 0.14);
        ctx.stroke();
        ctx.restore();

        // Scorch as worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(8,6,16,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 6 · Signature-attack telegraph — full-body charge flare ──
    if (telegraph) {
        additiveArc(ctx, x, y, bodyR * 0.7, R * (2.4 + pulse * 0.5), 0, Math.PI * 2,
            pal.glow, 0.16 + 0.3 * pulse);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(pal.bright), 0.4 + 0.4 * pulse);
        ctx.lineWidth = Math.max(2, R * 0.04);
        ctx.beginPath();
        ctx.arc(x, y, R * (1.6 - 0.3 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ── 7 · Orbiting prismatic light-shards (ambient, maxed) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 16; k++) {
        const a = facing + t * 0.4 + (k / 16) * Math.PI * 2;
        const rr = R * (1.3 + 0.18 * Math.sin(t * 2 + k));
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        const sh = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + k * 1.3));
        ctx.fillStyle = rgba(hexRgb(SPECTRUM[k % SPECTRUM.length]), 0.22 * sh);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5 + 2 * sh, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 8 · Low-HP / enrage radiant overload crackle ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, bodyR * 0.4, bodyR * (1.4 + pulse * 0.4), '#ffffff',
            0.18 + 0.2 * pulse);
    }

    ctx.restore();
}

export default drawPrismarch;
