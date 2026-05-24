// ── ARWING skin ────────────────────────────────────────────────────
// Agile all-range fighter (Arwing homage): a slim hull with twin
// upswept wings carrying laser pods, vertical tail fins, and a single
// big blue engine cone. The wings fold/tilt with thrust.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const fold = (this.wingSweep || 0) * 0.5 + (this.flapOpen || 0) * 0.3;

    // ── Main engine cone (rear) ──
    ctx.globalCompositeOperation = 'lighter';
    const ep = 0.7 + Math.sin(t * 10) * 0.3;
    const len = r * (0.45 + thr * 1.2);
    const g = ctx.createLinearGradient(0, r * 0.55, 0, r * 0.55 + len);
    g.addColorStop(0, rgba(255, 255, 255, 0.95 * ep));
    g.addColorStop(0.35, rgba(80, 180, 255, 0.7 * ep));
    g.addColorStop(0.7, rgba(40, 110, 255, 0.4 * ep));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.55 + len * 0.5, r * 0.16, len * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Twin upswept wings with laser pods ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        ctx.save();
        ctx.translate(s * r * 0.18, 0);
        ctx.rotate(s * fold * 0.25);
        // wing
        ctx.fillStyle = 'rgba(216, 222, 232, 0.97)';
        ctx.strokeStyle = '#1a2030';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.18);
        ctx.lineTo(s * r * 0.86, -r * 0.34);     // forward swept leading edge
        ctx.lineTo(s * r * 0.94, r * 0.04);
        ctx.lineTo(s * r * 0.2, r * 0.3);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // blue trim
        ctx.strokeStyle = '#3a86ff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.86, -r * 0.34);
        ctx.lineTo(s * r * 0.94, r * 0.04);
        ctx.stroke();
        // laser pod (barrel pointing forward)
        ctx.fillStyle = 'rgba(40, 48, 64, 0.98)';
        ctx.beginPath();
        ctx.rect(s * r * 0.78, -r * 0.5, r * 0.12, r * 0.3);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        glowSpriteCache.draw(ctx, s * r * 0.84, -r * 0.5, '#66ccff', r * 0.05, 8, 0.7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    // ── Vertical tail fins ──
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(170, 180, 195, 0.95)';
        ctx.strokeStyle = '#1a2030';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.1, r * 0.2);
        ctx.lineTo(s * r * 0.34, r * 0.16);
        ctx.lineTo(s * r * 0.24, r * 0.6);
        ctx.lineTo(s * r * 0.08, r * 0.55);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    // ── Slim hull ──
    ctx.fillStyle = 'rgba(230, 235, 244, 0.98)';
    ctx.strokeStyle = '#161c28';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.13, -r * 0.45);
    ctx.lineTo(r * 0.15, r * 0.5);
    ctx.lineTo(0, r * 0.66);
    ctx.lineTo(-r * 0.15, r * 0.5);
    ctx.lineTo(-r * 0.13, -r * 0.45);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // blue nose band
    ctx.fillStyle = '#3a86ff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.13, -r * 0.55);
    ctx.lineTo(-r * 0.13, -r * 0.55);
    ctx.closePath();
    ctx.fill();

    // ── Cockpit ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r * 0.32, 0, 0, -r * 0.32, r * 0.18);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(0.6, 'rgba(120,200,255,0.8)');
    cg.addColorStop(1, 'rgba(40,80,140,0.2)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.32, r * 0.09, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    glowSpriteCache.draw(ctx, 0, -r * 1.12, '#cfe6ff', r * 0.06, 10, 0.7);
}

export const skin = {
    id: 'arwing',
    name: 'ARWING',
    desc: 'All-range fighter — upswept wings with laser pods, big blue engine.',
    noseY: -1.15,
    bankShear: 0.13,
    paint,
};
