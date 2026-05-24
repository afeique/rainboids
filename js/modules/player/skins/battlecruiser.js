// ── BATTLECRUISER skin ─────────────────────────────────────────────
// Capital-ship homage (StarCraft Battlecruiser), shrunk to the shared
// collision frame: a long armored spinal hull, a raised bridge tower,
// side engine banks, and a nose Yamato cannon whose charge glow tracks
// the live ENERGY meter — it visibly spools up as a power shot nears.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const eFrac = Math.min(1, (this.energy || 0) / (this.maxEnergy || 100));

    // ── Side engine banks (behind hull) ──
    ctx.globalCompositeOperation = 'lighter';
    const ep = 0.7 + Math.sin(t * 8) * 0.3;
    for (const s of [1, -1]) {
        for (const ey of [r * 0.5, r * 0.74]) {
            const ex = s * r * 0.34;
            const len = r * (0.3 + thr * 0.9);
            const g = ctx.createLinearGradient(ex, ey, ex, ey + len);
            g.addColorStop(0, rgba(180, 230, 255, 0.9 * ep));
            g.addColorStop(0.5, rgba(70, 140, 255, 0.5 * ep));
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(ex, ey + len * 0.5, r * 0.07, len * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Side hull pods ──
    ctx.globalCompositeOperation = 'source-over';
    for (const s of [1, -1]) {
        ctx.fillStyle = 'rgba(70, 78, 96, 0.97)';
        ctx.strokeStyle = '#11141c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.18, -r * 0.5);
        ctx.lineTo(s * r * 0.46, -r * 0.2);
        ctx.lineTo(s * r * 0.46, r * 0.66);
        ctx.lineTo(s * r * 0.2, r * 0.78);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    // ── Long armored spinal hull ──
    ctx.fillStyle = 'rgba(86, 94, 112, 0.98)';
    ctx.strokeStyle = '#14171f';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.24);
    ctx.lineTo(r * 0.16, -r * 0.7);
    ctx.lineTo(r * 0.2, r * 0.5);
    ctx.lineTo(r * 0.12, r * 0.82);
    ctx.lineTo(-r * 0.12, r * 0.82);
    ctx.lineTo(-r * 0.2, r * 0.5);
    ctx.lineTo(-r * 0.16, -r * 0.7);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // armor plate seams + running lights
    ctx.strokeStyle = 'rgba(160, 170, 190, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
        const yy = -r * 0.55 + i * r * 0.34;
        ctx.beginPath(); ctx.moveTo(-r * 0.18, yy); ctx.lineTo(r * 0.18, yy); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
        const yy = -r * 0.6 + i * r * 0.32;
        const on = (Math.sin(t * 4 + i) > 0) ? 0.9 : 0.2;
        for (const s of [1, -1]) {
            ctx.fillStyle = rgba(120, 200, 255, on);
            ctx.beginPath();
            ctx.arc(s * r * 0.13, yy, r * 0.03, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Raised bridge tower (aft) ──
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(104, 112, 130, 0.98)';
    ctx.strokeStyle = '#14171f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.18);
    ctx.lineTo(r * 0.16, r * 0.34);
    ctx.lineTo(r * 0.12, r * 0.62);
    ctx.lineTo(-r * 0.12, r * 0.62);
    ctx.lineTo(-r * 0.16, r * 0.34);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // bridge viewport
    ctx.fillStyle = rgba(120, 220, 255, 0.85);
    ctx.beginPath();
    ctx.rect(-r * 0.1, r * 0.3, r * 0.2, r * 0.06);
    ctx.fill();

    // ── Nose Yamato cannon ──
    ctx.fillStyle = 'rgba(40, 44, 56, 0.98)';
    ctx.strokeStyle = '#11141c';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(-r * 0.13, -r * 1.2, r * 0.26, r * 0.5);
    ctx.fill(); ctx.stroke();
    // Yamato charge glow — grows with the energy meter
    ctx.globalCompositeOperation = 'lighter';
    const yPulse = 0.5 + Math.sin(t * 10) * 0.5;
    const yR = r * (0.12 + eFrac * 0.4) * (0.8 + yPulse * 0.3);
    const yg = ctx.createRadialGradient(0, -r * 1.2, 0, 0, -r * 1.2, yR);
    yg.addColorStop(0, rgba(255, 255, 255, 0.9 * (0.3 + eFrac)));
    yg.addColorStop(0.4, rgba(255, 180, 40, 0.8 * (0.3 + eFrac)));
    yg.addColorStop(1, 'transparent');
    ctx.fillStyle = yg;
    ctx.beginPath();
    ctx.arc(0, -r * 1.2, yR, 0, Math.PI * 2);
    ctx.fill();
    glowSpriteCache.draw(ctx, 0, -r * 1.2, '#ffcc55', r * 0.1, 8, 0.4 + eFrac * 0.6);
}

export const skin = {
    id: 'battlecruiser',
    name: 'BATTLECRUISER',
    desc: 'Armored capital ship — nose Yamato glow spools with your energy.',
    noseY: -1.24,
    bankShear: 0.06,
    paint,
};
