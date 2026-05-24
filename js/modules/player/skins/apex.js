// ── APEX skin ──────────────────────────────────────────────────────
// The flagship. A refined heavy interceptor packed with moving detail —
// a counter-rotating intake ring at the nose, a pulsing energy spine,
// four vectoring exhaust nozzles, and split tail-fins that flare open
// under thrust. Same collision frame as every skin; its presence comes
// from density and motion, not size.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function poly(ctx, pts, close = true) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
}

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const flap = this.flapOpen || 0;
    const bank = this.bank || 0;
    const breath = Math.sin(this.glidePhase || 0);
    const spinePulse = 0.55 + Math.sin(t * 3.5) * 0.45;

    // ── Vectoring quad nozzles (drawn first, behind hull) ──
    const noz = [[-r*0.34, r*0.66],[-r*0.12, r*0.78],[r*0.12, r*0.78],[r*0.34, r*0.66]];
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < noz.length; i++) {
        const [nx, ny] = noz[i];
        const vec = (i < 2 ? -1 : 1) * bank * 0.18;
        const len = r * (0.3 + thr * 1.0) * (0.85 + spinePulse * 0.3);
        const grad = ctx.createLinearGradient(nx, ny, nx + vec * len, ny + len);
        grad.addColorStop(0, rgba(255, 255, 255, 0.95));
        grad.addColorStop(0.35, rgba(80, 230, 255, 0.7));
        grad.addColorStop(0.7, rgba(150, 90, 255, 0.4));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.beginPath();
        ctx.ellipse(vec * len * 0.5, len * 0.5, r * 0.07, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Split tail-fins that flare with thrust ──
    ctx.globalCompositeOperation = 'source-over';
    const finAng = 0.22 + flap * 0.45;
    for (const s of [1, -1]) {
        ctx.save();
        ctx.translate(s * r * 0.2, r * 0.5);
        ctx.rotate(s * finAng);
        ctx.fillStyle = 'rgba(18, 20, 44, 0.95)';
        ctx.strokeStyle = '#3df0ff';
        ctx.lineWidth = 1.6;
        poly(ctx, [[0,0],[s*r*0.28, r*0.1],[s*r*0.18, r*0.5],[0, r*0.34]]);
        ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    // ── Outer wing planforms (layered) ──
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(14, 16, 38, 0.96)';
        ctx.strokeStyle = '#1b2a55';
        ctx.lineWidth = 3;
        poly(ctx, [[s*r*0.16,-r*0.3],[s*r*0.7,-r*0.05],[s*r*1.18,r*0.34],[s*r*0.9,r*0.5],[s*r*0.28,r*0.42]]);
        ctx.fill(); ctx.stroke();
        // spectral leading edge
        ctx.globalCompositeOperation = 'lighter';
        const wg = ctx.createLinearGradient(s*r*0.16,-r*0.3, s*r*1.18,r*0.34);
        wg.addColorStop(0, rgba(255, 210, 60, 0.85));
        wg.addColorStop(0.5, rgba(255, 40, 150, 0.7));
        wg.addColorStop(1, rgba(60, 220, 255, 0.9));
        ctx.strokeStyle = wg;
        ctx.lineWidth = 2;
        poly(ctx, [[s*r*0.16,-r*0.3],[s*r*0.7,-r*0.05],[s*r*1.18,r*0.34]], false);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Forward canards ──
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(255, 200, 40, 0.5)';
        ctx.strokeStyle = '#ffe79a';
        ctx.lineWidth = 1.2;
        poly(ctx, [[s*r*0.12,-r*0.55],[s*r*0.4,-r*0.66],[s*r*0.46,-r*0.5],[s*r*0.14,-r*0.4]]);
        ctx.fill(); ctx.stroke();
    }

    // ── Layered fuselage ──
    ctx.fillStyle = 'rgba(10, 12, 30, 0.98)';
    ctx.strokeStyle = '#0c1430';
    ctx.lineWidth = 3.4;
    poly(ctx, [[0,-r*1.22],[r*0.14,-r*0.55],[r*0.2,r*0.1],[r*0.14,r*0.62],[0,r*0.5],[-r*0.14,r*0.62],[-r*0.2,r*0.1],[-r*0.14,-r*0.55]]);
    ctx.fill(); ctx.stroke();

    // ── Pulsing energy spine ──
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(0, -r*1.1, 0, r*0.5);
    sg.addColorStop(0, rgba(255, 255, 255, spinePulse));
    sg.addColorStop(0.5, rgba(60, 230, 255, 0.8 * spinePulse));
    sg.addColorStop(1, rgba(150, 90, 255, 0.5 * spinePulse));
    ctx.strokeStyle = sg;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.05);
    ctx.lineTo(0, r * 0.42);
    ctx.stroke();
    // spine rungs
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const yy = -r * 0.85 + i * r * 0.32;
        const w = r * 0.09 * (0.6 + 0.4 * Math.sin(t * 4 + i));
        ctx.beginPath();
        ctx.moveTo(-w, yy); ctx.lineTo(w, yy); ctx.stroke();
    }

    // ── Counter-rotating intake ring at the nose ──
    ctx.save();
    ctx.translate(0, -r * 0.78);
    ctx.rotate(t * 1.6);
    ctx.strokeStyle = rgba(120, 245, 255, 0.85);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1);
        ctx.lineTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Cockpit + nose core ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r*0.42, 0, 0, -r*0.42, r*0.22);
    cg.addColorStop(0, rgba(255, 255, 255, 0.95));
    cg.addColorStop(0.5, rgba(80, 240, 255, 0.85));
    cg.addColorStop(1, rgba(150, 60, 255, 0.2));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.12, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(0, -r * 0.42 + breath * r * 0.08, r * 0.05, 0, Math.PI * 2);
    ctx.fill();

    glowSpriteCache.draw(ctx, 0, -r * 1.18, '#ffffff', r * 0.1, 12, 0.95);
}

export const skin = {
    id: 'apex',
    name: 'APEX',
    desc: 'Flagship interceptor — rotating intakes, pulsing spine, vectoring nozzles.',
    noseY: -1.22,
    bankShear: 0.14,
    paint,
};
