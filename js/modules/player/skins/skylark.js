// ── SKYLARK skin ───────────────────────────────────────────────────
// Four-winged strike fighter (X-wing homage). The S-foils SPLIT into an
// attack-X under thrust (driven by flapOpen), four engine bells glow at
// the wing roots, cannons cap the wingtips, and an astromech dome blinks
// behind the cockpit.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const flap = this.flapOpen || 0;
    const breath = Math.sin(this.glidePhase || 0);
    const split = 0.18 + flap * 0.42;          // S-foil open angle
    const hub = { x: 0, y: r * 0.34 };

    // ── Four S-foils (drawn from the rear hub) ──
    // Two fore, two aft; the fore/aft spread widens with `split`.
    const tips = [
        { s: 1, fore: -1 }, { s: -1, fore: -1 },
        { s: 1, fore: 1 },  { s: -1, fore: 1 },
    ];
    for (const { s, fore } of tips) {
        const ang = s * (Math.PI / 2 - split) + (fore < 0 ? -0 : 0);
        // tip position: outward + fore/aft offset scaled by split
        const tx = hub.x + s * r * 1.12 * Math.cos(split);
        const ty = hub.y + fore * (r * 0.55 + split * r * 0.5);
        const rootFore = hub.y + fore * r * 0.12;

        // engine bell at the wing root (rear)
        ctx.globalCompositeOperation = 'lighter';
        if (fore > 0) {
            const len = r * (0.3 + thr * 0.9);
            const eg = ctx.createLinearGradient(s * r * 0.22, rootFore, s * r * 0.22, rootFore + len);
            eg.addColorStop(0, rgba(255, 255, 255, 0.9));
            eg.addColorStop(0.4, rgba(255, 90, 40, 0.7));
            eg.addColorStop(1, 'transparent');
            ctx.fillStyle = eg;
            ctx.beginPath();
            ctx.ellipse(s * r * 0.22, rootFore + len * 0.5, r * 0.07, len * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // foil plank
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#0a0c12';
        ctx.lineWidth = r * 0.17;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * r * 0.18, rootFore);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(225, 232, 240, 0.95)';
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.18, rootFore);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // red stripe accent near tip
        ctx.strokeStyle = '#e8443a';
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        ctx.moveTo(tx - (tx - s * r * 0.18) * 0.22, ty - (ty - rootFore) * 0.22);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // cannon tip
        ctx.globalCompositeOperation = 'lighter';
        glowSpriteCache.draw(ctx, tx, ty, '#ff5544', r * 0.06, 8, 0.8);
    }

    // ── Central fuselage ──
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(210, 216, 226, 0.97)';
    ctx.strokeStyle = '#10131c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.16, -r * 0.4);
    ctx.lineTo(r * 0.18, r * 0.55);
    ctx.lineTo(0, r * 0.72);
    ctx.lineTo(-r * 0.18, r * 0.55);
    ctx.lineTo(-r * 0.16, -r * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // grey panel detail
    ctx.strokeStyle = 'rgba(110, 120, 135, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.5); ctx.stroke();

    // ── Cockpit canopy ──
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(0, -r * 0.3, 0, 0, -r * 0.3, r * 0.2);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(0.6, 'rgba(120,210,255,0.8)');
    cg.addColorStop(1, 'rgba(40,80,120,0.2)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.3, r * 0.1, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Astromech dome (behind cockpit) blinking ──
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(180, 190, 200, 0.95)';
    ctx.beginPath();
    ctx.arc(0, r * 0.06, r * 0.11, Math.PI, Math.PI * 2);
    ctx.fill();
    const blink = Math.sin(t * 7) > 0.3 ? 0.95 : 0.25;
    ctx.fillStyle = rgba(80, 200, 255, blink);
    ctx.beginPath();
    ctx.arc(0, r * 0.0, r * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // nose tip
    ctx.globalCompositeOperation = 'lighter';
    glowSpriteCache.draw(ctx, 0, -r * 1.12, '#ffffff', r * 0.07, 10, 0.8);
}

export const skin = {
    id: 'skylark',
    name: 'SKYLARK',
    desc: 'Four-wing strike fighter — S-foils split to attack-X under thrust.',
    noseY: -1.15,
    bankShear: 0.1,
    paint,
};
