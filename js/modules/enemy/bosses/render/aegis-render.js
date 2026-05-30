// enemy/bosses/render/aegis-render.js — THE AEGIS renderer (9.1.0 redesign).
//
// A massive rotating shield-bastion: a deep blue reactor core sealed behind a
// dome of beveled armor petals on its FRONT arc (the side facing the player).
// The reactor is only vulnerable from BEHIND — so its rear flares bright when
// the player has flanked it (`boss._reactorOpen`). Drawn in world space (the
// enemy pass is already inside the camera transform).

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, beveledPanel, additiveArc, shockwaveRing,
} from './boss-gfx.js';

const ARMOR = { dark: '#262d39', mid: '#7c8aa0', bright: '#e6edf6' };
const REACTOR = { dark: '#0a1424', mid: '#1f4fd0', bright: '#bfe6ff', glow: '#5fa8ff' };

export function drawAegis(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 160);
    const facing = boss.angle || 0;           // shield-face points at the player
    const rear = facing + Math.PI;            // reactor-exposed direction
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const open = !!boss._reactorOpen;
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 6 : 2.2));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;

    ctx.save();

    // ── 1 · Outer reactor aura (whole-body glow, hotter as the shield thins) ──
    radialGlow(ctx, x, y, R * 0.5, R * (1.8 + heat * 0.5 + pulse * 0.2),
        REACTOR.glow, 0.18 + heat * 0.22 + (open ? 0.12 : 0) + pulse * 0.06);

    // ── 2 · Reactor core ──
    const coreR = R * 0.52;
    layeredCore(ctx, x, y, coreR, REACTOR, heat + (open ? 0.3 : 0), pulse);
    // Spinning containment ring on the core so rotation reads.
    ctx.strokeStyle = rgba(hexRgb(REACTOR.bright), 0.5 + pulse * 0.3);
    ctx.lineWidth = Math.max(2, coreR * 0.06);
    for (let k = 0; k < 8; k++) {
        const a = facing + (k / 8) * Math.PI * 2 + t * 0.6;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * coreR * 0.6, y + Math.sin(a) * coreR * 0.6);
        ctx.lineTo(x + Math.cos(a) * coreR * 0.95, y + Math.sin(a) * coreR * 0.95);
        ctx.stroke();
    }

    // ── 3 · Rear reactor vent — bright + venting plasma when the player is behind ──
    {
        const ventA = open ? (0.55 + pulse * 0.35) : 0.14;
        additiveArc(ctx, x, y, coreR * 0.8, R * (open ? 1.5 : 1.0), rear, Math.PI * 0.55,
            REACTOR.glow, ventA);
        if (open) {
            // A hot plasma plume streaming out the back.
            const plumeLen = R * (1.2 + pulse * 0.3);
            const grad = ctx.createLinearGradient(x, y, x + Math.cos(rear) * plumeLen, y + Math.sin(rear) * plumeLen);
            grad.addColorStop(0, rgba(hexRgb(REACTOR.bright), 0.6));
            grad.addColorStop(1, rgba(hexRgb(REACTOR.glow), 0));
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(rear + 0.4) * coreR, y + Math.sin(rear + 0.4) * coreR);
            ctx.lineTo(x + Math.cos(rear) * plumeLen, y + Math.sin(rear) * plumeLen);
            ctx.lineTo(x + Math.cos(rear - 0.4) * coreR, y + Math.sin(rear - 0.4) * coreR);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 4 · Force-field shimmer over the closed (front) shield face ──
    const shieldUp = livingParts(boss).length > 0;
    if (shieldUp) {
        additiveArc(ctx, x, y, R * 0.7, R * 1.15, facing, Math.PI * 1.25,
            '#bcd3ff', 0.10 + 0.06 * pulse);
    }

    // ── 5 · Armor petals (the dome) ──
    for (const part of livingParts(boss)) {
        const px = part.x, py = part.y;
        const outward = Math.atan2(py - y, px - x);
        const pr = part.radius || 26;
        const ph = part.maxHealth > 0 ? Math.max(0.2, part.health / part.maxHealth) : 1;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(outward);
        // Panel: thin radially (w), wide tangentially (h) → reads as a curved plate.
        beveledPanel(ctx, pr * 0.7, pr * 1.35, ARMOR, 0.85 + 0.15 * ph);
        // Damage scorch as the plate is worn down.
        if (ph < 0.99) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(20,12,8,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(0, 0, pr * 1.0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ── 6 · Telegraphed shield-bash shockwave ──
    const sw = boss._shockwave;
    if (sw && sw.active) {
        if (sw.telegraph > 0) {
            // Wind-up: a brightening ring footprint where the wave will land.
            additiveArc(ctx, x, y, sw.maxR * 0.92, sw.maxR, 0, Math.PI * 2,
                '#9fd0ff', 0.12 + 0.2 * (1 - sw.telegraph));
        } else {
            const a = Math.max(0, sw.radius < sw.maxR ? 1 - sw.radius / sw.maxR : 0);
            shockwaveRing(ctx, x, y, sw.radius, Math.max(4, R * 0.06), '#cfe6ff', 0.5 * a + 0.2);
        }
    }

    // ── 7 · Ambient shield-spark motes orbiting the dome ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
        const a = facing + t * 0.4 + (k / 10) * Math.PI * 2;
        const rr = R * (1.05 + 0.08 * Math.sin(t * 2 + k));
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        const mote = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + k * 1.7));
        ctx.fillStyle = rgba(hexRgb(REACTOR.glow), 0.25 * mote);
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + 1.5 * mote, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 8 · Low-HP / enrage heat crackle on the core ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, coreR * 0.4, coreR * (1.2 + pulse * 0.3), '#ff6a3a', 0.18 + 0.18 * pulse);
    }

    ctx.restore();
}

export default drawAegis;
