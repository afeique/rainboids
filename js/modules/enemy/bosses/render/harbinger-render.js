// enemy/bosses/render/harbinger-render.js — THE HARBINGER renderer (9.1.x redesign).
//
// The waking siege-hulk: a long angular iron monolith — a derelict
// dreadnought-blade — that "boots up" as the fight escalates. Brushed-steel
// linear-gradient hull (#2a3340 → #6b7787 → #aebed4 rim) with sequential hull
// SEAMS that ignite amber-white (#ffd27a → #fff6e0) and pulse. The orbiting
// bolt-heads (boss-parts, shieldsCore) are the lit weak-points that walk the
// player around the hull; clearing them exposes a molten reactor between the
// hull halves at low HP / enrage. Drawn in world space (the enemy pass is
// already inside the camera transform), mirroring the Aegis prototype's
// structure + the shared boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc, shockwaveRing,
} from './boss-gfx.js';

const HULL = { dark: '#2a3340', mid: '#6b7787', bright: '#aebed4' };
const SEAM = { warm: '#ffd27a', hot: '#fff6e0', glow: '#ffb24a' };
const REACTOR = { dark: '#2a0e06', mid: '#ff7a2a', bright: '#ffe6b0', glow: '#ff8a3a' };

export function drawHarbinger(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 96);
    const facing = boss.angle || 0;           // the hull's long axis points here
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const phaseIdx = currentPhaseIndex(boss);
    // "Boot-up" heat: dormant at phase 0, hotter each phase, hottest enraged.
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5.5 : 2.0));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    // The spine cracks open (reactor exposed) as HP drains / on enrage.
    const split = enraged ? 1 : Math.max(0, Math.min(1, (0.6 - hpFrac) / 0.6));

    ctx.save();

    // ── 1 · Cold ambient rim aura (dormant blue-grey light) ──
    radialGlow(ctx, x, y, R * 0.8, R * (1.7 + pulse * 0.12), HULL.bright,
        0.10 + 0.05 * pulse);
    // Warming seam-glow halo as it boots up.
    if (heat > 0) {
        radialGlow(ctx, x, y, R * 0.4, R * (1.5 + heat * 0.5 + pulse * 0.2),
            SEAM.glow, 0.10 + heat * 0.22 + pulse * 0.06);
    }

    // ── 2 · The iron hull — a long angular dreadnought-blade ──
    // Elongated hexagonal monolith along `facing`, brushed-steel sheen across
    // its short axis. Two halves that pincer apart (split) to bare the reactor.
    const halfLen = R * 1.65;     // long axis (the "screen-tall blade" read)
    const halfWid = R * 0.62;     // short axis
    const gap = split * R * 0.5;  // spine crack width
    const cos = Math.cos(facing), sin = Math.sin(facing);
    // Local→world helper (u along the blade, v across it).
    const P = (u, v) => ({ x: x + cos * u - sin * v, y: y + sin * u + cos * v });

    const drawHullHalf = (sign) => {
        // sign = +1 (one side of the spine), -1 (the other). v offset = sign*gap.
        const o = sign * gap;
        // Angular hull outline (a tapered hex slab).
        const pts = [
            P(-halfLen, o + sign * halfWid * 0.25),
            P(-halfLen * 0.55, o + sign * halfWid),
            P(halfLen * 0.7, o + sign * halfWid * 0.8),
            P(halfLen, o + sign * halfWid * 0.15),
            P(halfLen * 0.7, o),
            P(-halfLen * 0.55, o),
        ];
        // Brushed-steel sheen perpendicular to the blade axis.
        const g0 = P(0, o);
        const g1 = P(0, o + sign * halfWid);
        const sheen = ctx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
        sheen.addColorStop(0, rgba(hexRgb(HULL.dark), 0.97));
        sheen.addColorStop(0.5, rgba(hexRgb(HULL.mid), 0.96));
        sheen.addColorStop(1, rgba(hexRgb(HULL.bright), 0.98));
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
        // Bright outer rim lip.
        ctx.strokeStyle = rgba(hexRgb(HULL.bright), 0.55);
        ctx.lineWidth = Math.max(1.5, R * 0.04);
        ctx.stroke();

        // Hull SEAMS — diagonal cuts that ignite amber as the hulk boots up.
        // They light in sequence (walking the player around), keyed off heat + t.
        const seamCount = 4;
        for (let i = 0; i < seamCount; i++) {
            // Each seam's ignition phases in over time + heat.
            const lit = Math.max(0, Math.min(1,
                heat * 1.4 - i * 0.28 + 0.25 * Math.sin(t * 1.6 + i * 1.3)));
            if (lit <= 0.02) continue;
            const u = -halfLen * 0.5 + (i / (seamCount - 1)) * halfLen * 1.35;
            const a = P(u, o + sign * halfWid * 0.1);
            const b = P(u - halfLen * 0.12, o + sign * halfWid * 0.95);
            const sg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            sg.addColorStop(0, rgba(hexRgb(SEAM.hot), 0.85 * lit));
            sg.addColorStop(1, rgba(hexRgb(SEAM.warm), 0));
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = sg;
            ctx.lineWidth = Math.max(2, R * 0.06) * (0.7 + 0.5 * lit);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.restore();
        }
    };
    drawHullHalf(1);
    drawHullHalf(-1);

    // ── 3 · Molten reactor between the split halves (low HP / enrage) ──
    if (split > 0.02) {
        const coreR = R * (0.34 + 0.12 * split);
        layeredCore(ctx, x, y, coreR, REACTOR, heat + split * 0.4, pulse);
        // Ember fountain venting from the exposed reactor along the spine.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 8; k++) {
            const a = facing + Math.PI / 2 + (Math.random() - 0.5) * 0.6
                + (k % 2 ? Math.PI : 0);
            const rr = coreR * (1.1 + 1.4 * Math.abs(Math.sin(t * 2 + k)));
            const ex = x + Math.cos(a) * rr, ey = y + Math.sin(a) * rr;
            ctx.fillStyle = rgba(hexRgb(REACTOR.bright), 0.4 * split);
            ctx.beginPath();
            ctx.arc(ex, ey, 1.5 + 2 * Math.abs(Math.sin(t * 3 + k)), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ── 4 · Bolt-heads — the lit weak-points (orbiting hull seam-nodes) ──
    for (const part of livingParts(boss)) {
        const px = part.x, py = part.y;
        const pr = part.radius || 30;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        // Amber heat-node: bright pulsing weak-point that dims as it's worn.
        radialGlow(ctx, px, py, pr * 0.4, pr * (1.8 + pulse * 0.3), SEAM.glow,
            (0.35 + 0.3 * pulse) * (0.4 + 0.6 * ph));
        // Body — a hot amber core with a steel collar.
        const body = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
        body.addColorStop(0, rgba(hexRgb(SEAM.hot), 0.95 * ph + 0.2));
        body.addColorStop(0.55, rgba(hexRgb(SEAM.warm), 0.85 * ph + 0.1));
        body.addColorStop(1, rgba(hexRgb(HULL.dark), 0.92));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        // Steel collar rim.
        ctx.strokeStyle = rgba(hexRgb(HULL.bright), 0.6 * ph + 0.2);
        ctx.lineWidth = Math.max(1.5, pr * 0.12);
        ctx.beginPath();
        ctx.arc(px, py, pr * 0.96, 0, Math.PI * 2);
        ctx.stroke();
        // Heat-shimmer crack lines when freshly lit.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(SEAM.hot), 0.5 * ph * (0.5 + 0.5 * pulse));
        ctx.lineWidth = Math.max(1, pr * 0.08);
        for (let k = 0; k < 3; k++) {
            const a = t * 0.5 + (k / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(a) * pr * 0.85, py + Math.sin(a) * pr * 0.85);
            ctx.stroke();
        }
        ctx.restore();
        // Scorch as worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(18,10,6,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 5 · Telegraphed LUNGE / shockwave (reads boss._shockwave like Aegis) ──
    const sw = boss._shockwave;
    if (sw && sw.active) {
        if (sw.telegraph > 0) {
            additiveArc(ctx, x, y, (sw.maxR || R * 2) * 0.92, sw.maxR || R * 2,
                0, Math.PI * 2, SEAM.warm, 0.10 + 0.2 * (1 - sw.telegraph));
        } else if (typeof sw.radius === 'number') {
            const a = Math.max(0, sw.radius < sw.maxR ? 1 - sw.radius / sw.maxR : 0);
            shockwaveRing(ctx, x, y, sw.radius, Math.max(4, R * 0.06),
                SEAM.hot, 0.5 * a + 0.2);
        }
    }

    // ── 6 · Low-HP / enrage heat crackle on the hull spine ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, R * 0.3, R * (1.0 + pulse * 0.3), '#ff5a28',
            0.16 + 0.18 * pulse);
    }

    ctx.restore();
}

export default drawHarbinger;
