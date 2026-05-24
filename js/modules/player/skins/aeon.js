// ── AEON skin ──────────────────────────────────────────────────────
// Crystalline psionic flyer (Protoss homage): a gold-and-teal hull with
// curved psionic blade-wings, no visible engines — instead an anti-grav
// shimmer hovers beneath it, three energy crystals orbit the hull, and a
// central psi-core pulses.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const corePulse = 0.55 + Math.sin(t * 3) * 0.45;

    // ── Anti-grav shimmer beneath the hull ──
    ctx.globalCompositeOperation = 'lighter';
    const grav = 0.4 + Math.sin(t * 4) * 0.2;
    const gg = ctx.createRadialGradient(0, r * 0.5, 0, 0, r * 0.5, r * 1.0);
    gg.addColorStop(0, rgba(120, 255, 230, 0.4 * grav));
    gg.addColorStop(0.5, rgba(80, 200, 255, 0.2 * grav));
    gg.addColorStop(1, 'transparent');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.55, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Curved psionic blade-wings ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(190, 150, 60, 0.95)';   // gold hull
        ctx.strokeStyle = '#3a2c0c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.16, -r * 0.32);
        ctx.quadraticCurveTo(s * r * 1.1, -r * 0.5, s * r * 1.18, r * 0.28);
        ctx.quadraticCurveTo(s * r * 0.7, r * 0.12, s * r * 0.22, r * 0.3);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // teal energy vein along the blade
        ctx.strokeStyle = rgba(80, 255, 230, 0.8);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.2, -r * 0.2);
        ctx.quadraticCurveTo(s * r * 0.9, -r * 0.34, s * r * 1.12, r * 0.2);
        ctx.stroke();
    }

    // ── Central crystalline hull ──
    ctx.fillStyle = 'rgba(176, 138, 52, 0.97)';
    ctx.strokeStyle = '#3a2c0c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.16);
    ctx.lineTo(r * 0.2, -r * 0.4);
    ctx.lineTo(r * 0.16, r * 0.4);
    ctx.lineTo(0, r * 0.66);
    ctx.lineTo(-r * 0.16, r * 0.4);
    ctx.lineTo(-r * 0.2, -r * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // gold facet highlights
    ctx.strokeStyle = 'rgba(255, 224, 140, 0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.lineTo(0, r * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.15, -r * 0.1); ctx.lineTo(r * 0.15, -r * 0.1); ctx.stroke();

    // ── Central psi-core ──
    ctx.globalCompositeOperation = 'lighter';
    const cR = r * 0.22 * (0.85 + corePulse * 0.4);
    const cg = ctx.createRadialGradient(0, -r * 0.3, 0, 0, -r * 0.3, cR);
    cg.addColorStop(0, rgba(220, 255, 250, 0.95));
    cg.addColorStop(0.4, rgba(80, 255, 230, 0.85));
    cg.addColorStop(1, 'transparent');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, -r * 0.3, cR, 0, Math.PI * 2);
    ctx.fill();

    // ── Three orbiting energy crystals ──
    for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + (i / 3) * Math.PI * 2;
        const ox = Math.cos(a) * r * 0.7;
        const oy = Math.sin(a) * r * 0.42 - r * 0.1;
        const cr = r * 0.1 * (0.7 + Math.sin(t * 5 + i) * 0.3);
        ctx.fillStyle = rgba(150, 255, 235, 0.85);
        ctx.strokeStyle = rgba(220, 255, 250, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox, oy - cr);
        ctx.lineTo(ox + cr * 0.7, oy);
        ctx.lineTo(ox, oy + cr);
        ctx.lineTo(ox - cr * 0.7, oy);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    glowSpriteCache.draw(ctx, 0, -r * 1.14, '#ffe8a0', r * 0.07, 10, 0.7 + corePulse * 0.3);
}

export const skin = {
    id: 'aeon',
    name: 'AEON',
    desc: 'Crystalline psi-flyer — orbiting crystals, anti-grav hover, no engines.',
    noseY: -1.16,
    bankShear: 0.05,
    paint,
};
