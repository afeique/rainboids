// enemy/bosses/render/maelstrom-render.js — THE MAELSTROM living vortex (9.1.x).
//
// A screen-filling storm spiral: the boss *is* the weather. Enormous rotating
// arms of debris + lightning (#1a1030 → #6a3ad0 → #c89bff) wind around a central
// EYE — a calm dark radial with a bright iris (the VOLT core). The orbiting
// CONDUIT NODES (boss-parts, shieldsCore, VOLT) ride the arms as storm-nodes,
// arc-flashing to the eye. The CONDUCT-rain telegraph (`boss.conductRainTelegraph`)
// brightens a strike-ring footprint; the strike (`boss.conductRainFiring`) snaps
// a bright burst. On enrage the spiral tightens + a second counter-eye flickers
// on the far side. Drawn in world space (the enemy pass is already inside the
// camera transform), following the prototype structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc, shockwaveRing,
} from './boss-gfx.js';

const STORM = { dark: '#1a1030', mid: '#6a3ad0', bright: '#c89bff', glow: '#a855ff' };
const EYE = { dark: '#0a0618', mid: '#5a2fb0', bright: '#e6d0ff', glow: '#b88aff' };

export function drawMaelstrom(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 104);
    const spin = (boss.angle || 0) + (boss._now || Date.now()) * 0.0004;
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const telegraph = !!boss.conductRainTelegraph;   // CONDUCT-rain wind-up
    const firing = !!boss.conductRainFiring;          // CONDUCT-rain strike
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.4));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const nodes = livingParts(boss);
    // Spiral tightens (arms wind closer) as phases advance / on enrage.
    const tightness = 1 + heat * 0.8;
    const reach = R * (3.2 - heat * 0.5);   // how far the arms sweep out

    ctx.save();

    // ── 1 · Stormy field tint + outer vortex aura ──
    radialGlow(ctx, x, y, R * 0.6, reach * (1.0 + pulse * 0.1), STORM.glow,
        0.10 + heat * 0.12 + pulse * 0.05);

    // ── 2 · Spiral storm arms (layered logarithmic spirals of debris/lightning) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const armCount = enraged ? 4 : 3;
    for (let arm = 0; arm < armCount; arm++) {
        const base = spin + (arm / armCount) * Math.PI * 2;
        // Arm gradient stroke, fading out toward the rim.
        ctx.beginPath();
        const steps = 26;
        for (let s = 0; s <= steps; s++) {
            const u = s / steps;
            const ang = base + u * Math.PI * 2.2 * tightness;     // sweep
            const rad = R * 0.5 + u * reach;
            const px = x + Math.cos(ang) * rad;
            const py = y + Math.sin(ang) * rad;
            if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        const armA = (0.18 + 0.1 * pulse) * (0.6 + 0.4 * Math.sin(t + arm));
        ctx.strokeStyle = rgba(hexRgb(STORM.bright), armA);
        ctx.lineWidth = Math.max(2, R * 0.10) * (1 - 0.3 * (arm / armCount));
        ctx.lineCap = 'round';
        ctx.stroke();
        // Lightning sparks embedded along the arm.
        for (let k = 0; k < 3; k++) {
            const u = ((t * 0.6 + k * 0.33 + arm * 0.2) % 1);
            const ang = base + u * Math.PI * 2.2 * tightness;
            const rad = R * 0.5 + u * reach;
            const sx = x + Math.cos(ang) * rad, sy = y + Math.sin(ang) * rad;
            ctx.fillStyle = rgba(hexRgb(EYE.bright), 0.5 * (0.5 + 0.5 * pulse));
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5 + 2 * Math.abs(Math.sin(t * 6 + k + arm)), 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();

    // ── 3 · The central EYE — calm core the player pushes inward to ──
    const eyeR = R * 0.5;
    layeredCore(ctx, x, y, eyeR, EYE, heat, pulse);
    // Bright iris that contracts/dilates with the storm.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const irisR = eyeR * (0.32 + 0.1 * pulse);
    ctx.fillStyle = rgba(hexRgb(EYE.bright), 0.5 + 0.3 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, irisR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Second counter-eye flickers on the far side at enrage (current reverses).
    if (enraged) {
        const ex = x + Math.cos(spin + Math.PI) * R * 1.2;
        const ey = y + Math.sin(spin + Math.PI) * R * 1.2;
        const flick = 0.4 + 0.6 * Math.abs(Math.sin(t * 3));
        layeredCore(ctx, ex, ey, eyeR * 0.55, EYE, heat * flick, pulse);
    }

    // ── 4 · Storm-nodes — orbiting conduit weak-points arc-flashing to the eye ──
    for (let i = 0; i < nodes.length; i++) {
        const part = nodes[i];
        const px = part.x, py = part.y;
        const pr = part.radius || 20;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;

        // Node body — a charged VOLT orb.
        radialGlow(ctx, px, py, pr * 0.4, pr * (1.9 + pulse * 0.3), STORM.glow,
            (0.3 + 0.3 * pulse) * (0.4 + 0.6 * ph));
        const body = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
        body.addColorStop(0, rgba(hexRgb(EYE.bright), 0.9 * ph + 0.1));
        body.addColorStop(0.55, rgba(hexRgb(STORM.mid), 0.85 * ph + 0.1));
        body.addColorStop(1, rgba(hexRgb(STORM.dark), 0.9));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();

        // Arc-flash filament from node → eye (the conduit feeding the storm).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(STORM.bright),
            (0.25 + 0.25 * pulse) * (0.4 + 0.6 * ph));
        ctx.lineWidth = Math.max(1, R * 0.015);
        const segs = 5;
        const dx = x - px, dy = y - py;
        const nx = -dy, ny = dx;
        const ll = Math.hypot(dx, dy) || 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let s = 1; s < segs; s++) {
            const u = s / segs;
            const j = Math.sin(t * 11 + i * 2 + s) * pr * 0.5 * Math.sin(u * Math.PI);
            ctx.lineTo(px + dx * u + (nx / ll) * j, py + dy * u + (ny / ll) * j);
        }
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();

        // Scorch as worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(6,4,12,${0.45 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 5 · CONDUCT-rain telegraph / strike ──
    if (telegraph) {
        // Wind-up: a brightening strike-ring footprint over the whole arena.
        additiveArc(ctx, x, y, reach * 0.85, reach, 0, Math.PI * 2,
            STORM.bright, 0.10 + 0.22 * pulse);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(EYE.bright), 0.3 + 0.4 * pulse);
        ctx.lineWidth = Math.max(2, R * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, reach * (0.95 - 0.1 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    } else if (firing) {
        // Strike: a snapping shockwave burst.
        shockwaveRing(ctx, x, y, reach * (0.6 + 0.4 * pulse), Math.max(4, R * 0.07),
            EYE.bright, 0.5 + 0.3 * pulse);
    }

    // ── 6 · Low-HP / enrage core crackle ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, eyeR * 0.4, eyeR * (1.3 + pulse * 0.3), '#ff5ad0',
            0.16 + 0.18 * pulse);
    }

    ctx.restore();
}

export default drawMaelstrom;
