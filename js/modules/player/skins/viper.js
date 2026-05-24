// ── VIPER skin ─────────────────────────────────────────────────────
// Stubby colonial interceptor (Viper homage): a compact aggressive hull
// with forward intakes, three rear thrusters (a big central nozzle and
// two smaller outriggers), and blinking alert strobes on the wingtips.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const ep = 0.7 + Math.sin(t * 11) * 0.3;

    // ── Three rear thrusters ──
    ctx.globalCompositeOperation = 'lighter';
    const nozzles = [
        { x: 0, w: 0.16, l: 1.25 },
        { x: r * 0.32, w: 0.09, l: 0.85 },
        { x: -r * 0.32, w: 0.09, l: 0.85 },
    ];
    for (const n of nozzles) {
        const len = r * n.l * (0.4 + thr);
        const g = ctx.createLinearGradient(n.x, r * 0.55, n.x, r * 0.55 + len);
        g.addColorStop(0, rgba(255, 245, 220, 0.95 * ep));
        g.addColorStop(0.35, rgba(255, 150, 50, 0.7 * ep));
        g.addColorStop(0.7, rgba(255, 80, 30, 0.4 * ep));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(n.x, r * 0.55 + len * 0.5, r * n.w, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Stubby wings ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(196, 202, 212, 0.97)';
        ctx.strokeStyle = '#181c26';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.18, 0);
        ctx.lineTo(s * r * 0.78, r * 0.26);
        ctx.lineTo(s * r * 0.7, r * 0.56);
        ctx.lineTo(s * r * 0.2, r * 0.5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // red wing stripe
        ctx.fillStyle = 'rgba(220, 60, 50, 0.85)';
        ctx.beginPath();
        ctx.moveTo(s * r * 0.3, r * 0.1);
        ctx.lineTo(s * r * 0.7, r * 0.28);
        ctx.lineTo(s * r * 0.66, r * 0.4);
        ctx.lineTo(s * r * 0.32, r * 0.24);
        ctx.closePath();
        ctx.fill();
        // wingtip alert strobe
        ctx.globalCompositeOperation = 'lighter';
        const strobe = (Math.sin(t * 9 + s * 1.5) > 0.6) ? 1 : 0.12;
        ctx.fillStyle = rgba(255, 80, 60, strobe);
        ctx.beginPath();
        ctx.arc(s * r * 0.78, r * 0.3, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Forward intakes ──
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(40, 46, 58, 0.97)';
        ctx.strokeStyle = '#12151d';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.12, -r * 0.55);
        ctx.lineTo(s * r * 0.3, -r * 0.62);
        ctx.lineTo(s * r * 0.3, -r * 0.2);
        ctx.lineTo(s * r * 0.14, -r * 0.12);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    // ── Compact hull ──
    ctx.fillStyle = 'rgba(214, 220, 230, 0.98)';
    ctx.strokeStyle = '#161a24';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.1);
    ctx.lineTo(r * 0.16, -r * 0.5);
    ctx.lineTo(r * 0.2, r * 0.34);
    ctx.lineTo(r * 0.14, r * 0.66);
    ctx.lineTo(-r * 0.14, r * 0.66);
    ctx.lineTo(-r * 0.2, r * 0.34);
    ctx.lineTo(-r * 0.16, -r * 0.5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // nose stripe
    ctx.fillStyle = 'rgba(220, 60, 50, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.1);
    ctx.lineTo(r * 0.1, -r * 0.62);
    ctx.lineTo(-r * 0.1, -r * 0.62);
    ctx.closePath();
    ctx.fill();

    // ── Cockpit ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r * 0.42, 0, 0, -r * 0.42, r * 0.18);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(0.6, 'rgba(255,200,120,0.78)');
    cg.addColorStop(1, 'rgba(120,70,30,0.2)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.1, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    glowSpriteCache.draw(ctx, 0, -r * 1.08, '#ffd0a0', r * 0.06, 10, 0.7);
}

export const skin = {
    id: 'viper',
    name: 'VIPER',
    desc: 'Stubby colonial interceptor — triple thrusters, wingtip strobes.',
    noseY: -1.1,
    bankShear: 0.13,
    paint,
};
