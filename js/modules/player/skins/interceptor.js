// ── INTERCEPTOR skin ───────────────────────────────────────────────
// Ball-and-panels interceptor (TIE homage): a central spherical cockpit
// flanked by two flat hexagonal solar-collector panels, twin ion engines
// glowing at the rear of the ball, and a faint energy shimmer crossing
// the panels.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function hexPanel(ctx, cx, w, h) {
    // A vertical hex panel centered at (cx, 0).
    ctx.beginPath();
    ctx.moveTo(cx, -h);
    ctx.lineTo(cx + w * 0.5, -h * 0.6);
    ctx.lineTo(cx + w * 0.5, h * 0.6);
    ctx.lineTo(cx, h);
    ctx.lineTo(cx - w * 0.5, h * 0.6);
    ctx.lineTo(cx - w * 0.5, -h * 0.6);
    ctx.closePath();
}

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;

    // ── Twin hex solar panels ──
    for (const s of [1, -1]) {
        const cx = s * r * 0.86;
        // connecting strut
        ctx.strokeStyle = '#0c0e14';
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.34, 0);
        ctx.lineTo(cx, 0);
        ctx.stroke();

        // panel body
        ctx.fillStyle = 'rgba(24, 28, 38, 0.97)';
        ctx.strokeStyle = '#10141d';
        ctx.lineWidth = 2.2;
        hexPanel(ctx, cx, r * 0.56, r * 1.12);
        ctx.fill(); ctx.stroke();

        // panel lattice (cells)
        ctx.strokeStyle = 'rgba(90, 130, 110, 0.55)';
        ctx.lineWidth = 0.9;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(cx - r * 0.26, i * r * 0.32);
            ctx.lineTo(cx + r * 0.26, i * r * 0.32);
            ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(cx, -r * 1.0); ctx.lineTo(cx, r * 1.0); ctx.stroke();

        // shimmer sweeping the panel
        ctx.globalCompositeOperation = 'lighter';
        const sh = (Math.sin(t * 1.8 + s) * 0.5 + 0.5);
        const yg = -r * 1.0 + sh * r * 2.0;
        const g = ctx.createLinearGradient(0, yg - r * 0.2, 0, yg + r * 0.2);
        g.addColorStop(0, 'rgba(80,255,160,0)');
        g.addColorStop(0.5, rgba(120, 255, 180, 0.25));
        g.addColorStop(1, 'rgba(80,255,160,0)');
        ctx.fillStyle = g;
        hexPanel(ctx, cx, r * 0.56, r * 1.12);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Ion engines (rear of ball) ──
    ctx.globalCompositeOperation = 'lighter';
    const ep = 0.7 + Math.sin(t * 12) * 0.3;
    for (const s of [1, -1]) {
        glowSpriteCache.draw(ctx, s * r * 0.16, r * 0.3, '#66ff99', r * 0.12, 6, (0.5 + thr * 0.5) * ep);
    }

    // ── Central spherical cockpit ──
    ctx.globalCompositeOperation = 'source-over';
    const sphereG = ctx.createRadialGradient(-r * 0.1, -r * 0.12, r * 0.05, 0, 0, r * 0.42);
    sphereG.addColorStop(0, 'rgba(90, 98, 112, 0.99)');
    sphereG.addColorStop(0.7, 'rgba(40, 46, 58, 0.99)');
    sphereG.addColorStop(1, 'rgba(16, 20, 28, 0.99)');
    ctx.fillStyle = sphereG;
    ctx.strokeStyle = '#0c0e14';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // viewport window (forward)
    ctx.globalCompositeOperation = 'lighter';
    const wg = ctx.createRadialGradient(0, -r * 0.12, 0, 0, -r * 0.12, r * 0.18);
    wg.addColorStop(0, rgba(180, 255, 210, 0.95));
    wg.addColorStop(0.6, rgba(60, 220, 130, 0.7));
    wg.addColorStop(1, 'transparent');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, r * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // core pulse
    glowSpriteCache.draw(ctx, 0, -r * 0.12, '#aaffcc', r * 0.07, 8, 0.6 + Math.sin(t * 5) * 0.3);
}

export const skin = {
    id: 'interceptor',
    name: 'INTERCEPTOR',
    desc: 'Ball-cockpit interceptor — twin hex solar panels, ion engines.',
    noseY: -0.6,
    bankShear: 0.08,
    paint,
};
