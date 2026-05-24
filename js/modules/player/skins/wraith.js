// ── WRAITH skin ────────────────────────────────────────────────────
// Sleek cloaking fighter (StarCraft Wraith homage): narrow angular
// fuselage, twin downturned wingtips, twin afterburners, and a constant
// cloak-shimmer — a translucent ripple that washes over the hull.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const shimmer = 0.5 + Math.sin(t * 2.2) * 0.5;   // cloak phase 0..1

    // ── Twin afterburners ──
    ctx.globalCompositeOperation = 'lighter';
    const ap = 0.7 + Math.sin(t * 11) * 0.3;
    for (const s of [1, -1]) {
        const ex = s * r * 0.16;
        const len = r * (0.35 + thr * 1.0);
        const g = ctx.createLinearGradient(ex, r * 0.6, ex, r * 0.6 + len);
        g.addColorStop(0, rgba(180, 245, 255, 0.9 * ap));
        g.addColorStop(0.4, rgba(60, 130, 255, 0.55 * ap));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(ex, r * 0.6 + len * 0.5, r * 0.08, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Twin downturned wings ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(34, 44, 52, 0.96)';
        ctx.strokeStyle = '#0a0f12';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.14, -r * 0.2);
        ctx.lineTo(s * r * 0.95, r * 0.16);
        ctx.lineTo(s * r * 1.06, r * 0.5);    // downturned tip
        ctx.lineTo(s * r * 0.78, r * 0.42);
        ctx.lineTo(s * r * 0.2, r * 0.4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // teal edge
        ctx.strokeStyle = rgba(60, 200, 200, 0.6);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.14, -r * 0.2);
        ctx.lineTo(s * r * 0.95, r * 0.16);
        ctx.stroke();
    }

    // ── Narrow angular fuselage ──
    ctx.fillStyle = 'rgba(40, 52, 60, 0.97)';
    ctx.strokeStyle = '#0a0f12';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.18);
    ctx.lineTo(r * 0.1, -r * 0.4);
    ctx.lineTo(r * 0.14, r * 0.4);
    ctx.lineTo(r * 0.16, r * 0.64);
    ctx.lineTo(-r * 0.16, r * 0.64);
    ctx.lineTo(-r * 0.14, r * 0.4);
    ctx.lineTo(-r * 0.1, -r * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // spine seam
    ctx.strokeStyle = 'rgba(120, 200, 200, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.0); ctx.lineTo(0, r * 0.5); ctx.stroke();

    // ── Cockpit + blinking sensor ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r * 0.46, 0, 0, -r * 0.46, r * 0.18);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)');
    cg.addColorStop(0.6, 'rgba(80,220,210,0.75)');
    cg.addColorStop(1, 'rgba(20,90,90,0.2)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.46, r * 0.09, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    const blink = Math.sin(t * 6) > 0.5 ? 0.9 : 0.15;
    ctx.fillStyle = rgba(120, 255, 230, blink);
    ctx.beginPath();
    ctx.arc(0, r * 0.46, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    glowSpriteCache.draw(ctx, 0, -r * 1.16, '#bfffff', r * 0.06, 10, 0.7);

    // ── Cloak shimmer — translucent ripple sweeping down the hull ──
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(0, -r * 1.1 + shimmer * r * 2.2, 0, -r * 0.6 + shimmer * r * 2.2);
    sg.addColorStop(0, 'rgba(120, 240, 230, 0)');
    sg.addColorStop(0.5, rgba(150, 255, 240, 0.22));
    sg.addColorStop(1, 'rgba(120, 240, 230, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-r * 1.1, -r * 1.2, r * 2.2, r * 2);
}

export const skin = {
    id: 'wraith',
    name: 'WRAITH',
    desc: 'Cloaking fighter — downturned wings and a rippling cloak shimmer.',
    noseY: -1.18,
    bankShear: 0.12,
    paint,
};
