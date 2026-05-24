// ── VALKYRIE skin ──────────────────────────────────────────────────
// Broad missile frigate (StarCraft Valkyrie homage): flat-topped armored
// hull, twin heavy engine blocks, and wing-mounted missile-pod banks
// whose launch tubes light up in a cycling ripple. Wingtip strobes blink.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;

    // ── Twin engine plumes ──
    ctx.globalCompositeOperation = 'lighter';
    const ep = 0.7 + Math.sin(t * 9) * 0.3;
    for (const s of [1, -1]) {
        const ex = s * r * 0.34;
        const len = r * (0.4 + thr * 1.1);
        const g = ctx.createLinearGradient(ex, r * 0.7, ex, r * 0.7 + len);
        g.addColorStop(0, rgba(255, 245, 220, 0.95 * ep));
        g.addColorStop(0.4, rgba(120, 170, 255, 0.6 * ep));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(ex, r * 0.7 + len * 0.5, r * 0.12, len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Wing missile-pod banks ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        // wing slab
        ctx.fillStyle = 'rgba(58, 66, 84, 0.97)';
        ctx.strokeStyle = '#10141c';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.24, -r * 0.32);
        ctx.lineTo(s * r * 1.12, -r * 0.1);
        ctx.lineTo(s * r * 1.12, r * 0.34);
        ctx.lineTo(s * r * 0.28, r * 0.42);
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // 4 missile tubes per side; lights cycle outward
        for (let i = 0; i < 4; i++) {
            const tx = s * (r * 0.42 + i * r * 0.18);
            const lit = (Math.sin(t * 6 - i * 0.9) > 0.3) ? 1 : 0.25;
            ctx.fillStyle = 'rgba(20, 24, 32, 0.95)';
            ctx.beginPath();
            ctx.rect(tx - r * 0.06, -r * 0.06, r * 0.12, r * 0.34);
            ctx.fill();
            ctx.fillStyle = rgba(255, 140, 60, lit);
            ctx.beginPath();
            ctx.arc(tx, -r * 0.02, r * 0.045, 0, Math.PI * 2);
            ctx.fill();
        }

        // wingtip strobe
        ctx.globalCompositeOperation = 'lighter';
        const strobe = (Math.sin(t * 8 + s) > 0.6) ? 1 : 0.1;
        ctx.fillStyle = rgba(255, 60, 60, strobe);
        ctx.beginPath();
        ctx.arc(s * r * 1.12, r * 0.12, r * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ── Twin engine blocks ──
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(40, 46, 60, 0.98)';
        ctx.strokeStyle = '#0c0f16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(s * r * 0.18, r * 0.2, r * 0.3, r * 0.5);
        ctx.fill(); ctx.stroke();
    }

    // ── Flat-topped armored hull ──
    ctx.fillStyle = 'rgba(72, 80, 98, 0.98)';
    ctx.strokeStyle = '#13161f';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.08);
    ctx.lineTo(r * 0.26, -r * 0.5);
    ctx.lineTo(r * 0.3, r * 0.46);
    ctx.lineTo(r * 0.16, r * 0.74);
    ctx.lineTo(-r * 0.16, r * 0.74);
    ctx.lineTo(-r * 0.3, r * 0.46);
    ctx.lineTo(-r * 0.26, -r * 0.5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // armor seams
    ctx.strokeStyle = 'rgba(150, 162, 185, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 0.2); ctx.lineTo(r * 0.22, -r * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.26, r * 0.2); ctx.lineTo(r * 0.26, r * 0.2); ctx.stroke();

    // ── Nose sensor + cockpit ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r * 0.5, 0, 0, -r * 0.5, r * 0.18);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)');
    cg.addColorStop(0.6, 'rgba(120,200,255,0.75)');
    cg.addColorStop(1, 'rgba(40,80,120,0.2)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.5, r * 0.12, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    glowSpriteCache.draw(ctx, 0, -r * 1.0, '#ffe2a0', r * 0.08, 10, 0.7 + Math.sin(t * 4) * 0.2);
}

export const skin = {
    id: 'valkyrie',
    name: 'VALKYRIE',
    desc: 'Missile frigate — wing pod banks with cycling launch lights.',
    noseY: -1.08,
    bankShear: 0.09,
    paint,
};
