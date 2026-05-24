// ── VANGUARD skin ──────────────────────────────────────────────────
// The classic ship from earlier versions — a blue swept-wing fighter
// with wingtip extensions and a forked-tail hull. Recovered from git
// history (the pre-6.117 design) and brought back as a selectable skin,
// with light idle animation (engine pulse, breathing cockpit glint).

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
}

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const breath = Math.sin(this.glidePhase || 0);
    const pulse = 0.7 + Math.sin(t * 5) * 0.3;

    const rightWing = [[r*0.32,-r*0.18],[r*1.12,r*0.28],[r*0.82,r*0.68],[r*0.28,r*0.58]];
    const leftWing  = rightWing.map(([x,y]) => [-x, y]);
    const rightTip  = [[r*1.12,r*0.28],[r*1.42,r*0.08],[r*1.18,r*0.56],[r*0.82,r*0.68]];
    const leftTip   = rightTip.map(([x,y]) => [-x, y]);
    const hull = [[0,-r],[r*0.32,-r*0.18],[r*0.28,r*0.58],[0,r*0.38],[-r*0.28,r*0.58],[-r*0.32,-r*0.18]];
    const engines = [{x:r*0.42,y:r*0.78},{x:-r*0.42,y:r*0.78}];

    // ── Engine exhaust ──
    ctx.globalCompositeOperation = 'lighter';
    for (const eng of engines) {
        const len = r * (0.35 + thr * 1.1) * (0.7 + pulse * 0.4);
        const grad = ctx.createLinearGradient(eng.x, eng.y, eng.x, eng.y + len);
        grad.addColorStop(0, rgba(220, 245, 255, 0.9 * pulse));
        grad.addColorStop(0.4, rgba(40, 160, 255, 0.6 * pulse));
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y + len * 0.5, r * 0.1, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── Black silhouette outline pass ──
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    poly(ctx, rightWing); ctx.stroke();
    poly(ctx, leftWing);  ctx.stroke();
    poly(ctx, rightTip);  ctx.stroke();
    poly(ctx, leftTip);   ctx.stroke();
    ctx.lineWidth = 5;
    poly(ctx, hull); ctx.stroke();

    // ── Primary swept wings (blue) ──
    ctx.fillStyle = 'rgba(0, 90, 180, 0.45)';
    ctx.strokeStyle = '#0088ff';
    ctx.lineWidth = 1.6;
    poly(ctx, rightWing); ctx.fill(); ctx.stroke();
    poly(ctx, leftWing);  ctx.fill(); ctx.stroke();

    // ── Wing tip extensions (light blue) ──
    ctx.fillStyle = 'rgba(0, 160, 255, 0.25)';
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 1.1;
    poly(ctx, rightTip); ctx.fill(); ctx.stroke();
    poly(ctx, leftTip);  ctx.fill(); ctx.stroke();

    // ── Central hull (dark cyan) ──
    ctx.fillStyle = 'rgba(0, 25, 55, 0.92)';
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 2;
    poly(ctx, hull); ctx.fill(); ctx.stroke();

    // ── Hull panel detail lines (cyan accents) ──
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.lineTo(0, r * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( r * 0.14, -r * 0.45); ctx.lineTo( r * 0.24, r * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.14, -r * 0.45); ctx.lineTo(-r * 0.24, r * 0.28); ctx.stroke();

    // ── Engine pods + cores ──
    for (const eng of engines) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(4, 16, 32, 0.95)';
        ctx.strokeStyle = '#0099dd';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        glowSpriteCache.draw(ctx, eng.x, eng.y, '#33bbff', r * 0.1, 5, 0.4 + thr * 0.5);
    }

    // ── Cockpit canopy with breathing glint ──
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(120, 215, 255, 0.85)';
    ctx.strokeStyle = 'rgba(200, 240, 255, 0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.13, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(0, -r * 0.42 + breath * r * 0.1, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
}

export const skin = {
    id: 'vanguard',
    name: 'VANGUARD',
    desc: 'The classic blue swept-wing fighter from earlier versions.',
    noseY: -1.0,
    bankShear: 0.12,
    paint,
};
