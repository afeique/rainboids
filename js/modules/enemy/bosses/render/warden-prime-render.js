// enemy/bosses/render/warden-prime-render.js — THE WARDEN PRIME panopticon (9.1.x).
//
// A massive armored all-seeing EYE-RING — a flying prison-sentinel. A central
// iris (layered radial #0a0a12 → #cfa8ff → bright scan-white) with a moving
// PUPIL that tracks; a dark armored ring with violet seams; and a halo of
// orbiting WATCHER-LENSES — the shield nodes (boss-parts, shieldsCore, VOID),
// each a small eye with its own pupil that extends the Prime's sightlines. Its
// gaze is a tracking violet SCAN-CONE that intensifies during the ADAPTIVE-PURGE
// wind-up (`boss.purgeTelegraph`); the iris OPENS (vulnerable) while recharging
// the scan. On enrage the eye fractures into several surrounding eyes (360°
// gauntlet). Drawn in world space (the enemy pass is already inside the camera
// transform), following the prototype structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc,
} from './boss-gfx.js';

const IRIS = { dark: '#0a0a12', mid: '#8a5ad0', bright: '#e8d6ff', glow: '#cfa8ff' };
const RING = { dark: '#16121f', mid: '#3a2a55', bright: '#9a7ad0' };
const SCAN = '#cfa8ff';

// Draw a single eye (iris + tracking pupil + sclera ring) at (ex,ey) radius er.
// `gaze` = pupil direction (rad), `open` 0..1 = how exposed (bright) the iris is.
function drawEye(ctx, ex, ey, er, gaze, open, heat, pulse) {
    layeredCore(ctx, ex, ey, er, IRIS, heat + open * 0.4, pulse);
    // Scan-white flare when the iris is open (recharging → vulnerable).
    if (open > 0.02) {
        radialGlow(ctx, ex, ey, er * 0.3, er * (1.4 + pulse * 0.3), IRIS.bright,
            0.2 + 0.4 * open);
    }
    // Moving pupil — a dark disc with a bright catch-light, offset toward `gaze`.
    const pr = er * (0.34 - 0.08 * open);
    const off = er * 0.4;
    const px = ex + Math.cos(gaze) * off, py = ey + Math.sin(gaze) * off;
    ctx.fillStyle = rgba(hexRgb(IRIS.dark), 0.95);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hexRgb(IRIS.bright), 0.6 + 0.3 * pulse);
    ctx.beginPath();
    ctx.arc(px - pr * 0.3, py - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function drawWardenPrime(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 112);
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const telegraph = !!boss.purgeTelegraph;       // ADAPTIVE-PURGE wind-up
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.4));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const lenses = livingParts(boss);
    // The gaze slowly sweeps; during a telegraph it locks + the iris opens.
    const gaze = (boss.angle || 0) + t * 0.5;
    const irisOpen = telegraph ? (0.5 + 0.5 * pulse) : 0.05;

    ctx.save();

    // ── 1 · Surveillance aura ──
    radialGlow(ctx, x, y, R * 0.5, R * (2.0 + heat * 0.4 + pulse * 0.18),
        IRIS.glow, 0.10 + heat * 0.12 + (telegraph ? 0.2 : 0) + pulse * 0.05);

    // ── 2 · Tracking SCAN-CONE (violet gaze) — intensifies on the wind-up ──
    {
        const coneSpan = telegraph ? Math.PI * 0.22 : Math.PI * 0.32;
        const coneA = telegraph ? (0.22 + 0.25 * pulse) : 0.08;
        additiveArc(ctx, x, y, R * 0.5, R * (3.4 + telegraph * 0.6), gaze, coneSpan,
            SCAN, coneA);
        // Bright sight-line down the cone centre when locking on.
        if (telegraph) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = rgba(hexRgb(IRIS.bright), 0.4 + 0.4 * pulse);
            ctx.lineWidth = Math.max(1.5, R * 0.02);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(gaze) * R * 3.6, y + Math.sin(gaze) * R * 3.6);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── 3 · Armored eye-ring (dark plating with violet seams), slowly rotating ──
    const ringR = R * 0.78;
    ctx.save();
    const segs = 10;
    for (let k = 0; k < segs; k++) {
        const a0 = t * 0.3 + (k / segs) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2 / segs) * 0.8;
        // plate
        ctx.strokeStyle = rgba(hexRgb(RING.mid), 0.9);
        ctx.lineWidth = Math.max(3, R * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, ringR, a0, a1);
        ctx.stroke();
        // violet seam between plates
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(RING.bright), 0.4 + 0.3 * pulse);
        ctx.lineWidth = Math.max(1, R * 0.03);
        ctx.beginPath();
        ctx.arc(x, y, ringR, a1, a1 + (Math.PI * 2 / segs) * 0.2);
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();

    // ── 4 · Central iris + pupil (the core) — fractures on enrage ──
    if (enraged) {
        // The eye has split into several smaller eyes surrounding the centre.
        const sub = 4;
        for (let k = 0; k < sub; k++) {
            const a = gaze + (k / sub) * Math.PI * 2;
            const ex = x + Math.cos(a) * R * 0.55, ey = y + Math.sin(a) * R * 0.55;
            drawEye(ctx, ex, ey, R * 0.26, a, irisOpen, heat, pulse);
        }
        // A dim residual core in the middle.
        drawEye(ctx, x, y, R * 0.3, gaze, irisOpen * 0.6, heat, pulse);
    } else {
        drawEye(ctx, x, y, R * 0.5, gaze, irisOpen, heat, pulse);
    }

    // ── 5 · Watcher-lenses — the orbiting shield nodes (small tracking eyes) ──
    for (const part of lenses) {
        const lx = part.x, ly = part.y;
        const pr = part.radius || 20;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        // Each lens stares toward the player-direction proxy (the boss gaze).
        const lensGaze = Math.atan2(y - ly, x - lx) + Math.PI; // outward stare
        drawEye(ctx, lx, ly, pr * (0.9 + 0.1 * ph), lensGaze, irisOpen * 0.5, heat, pulse);
        // Sight-line filament back to the central iris (extends its vision).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(SCAN), (0.12 + 0.12 * pulse) * (0.4 + 0.6 * ph));
        ctx.lineWidth = Math.max(1, R * 0.01);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
        // Scorch as worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(8,6,12,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(lx, ly, pr * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 6 · Surveillance shimmer / scan-line motes (ambient) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
        const a = -t * 0.4 + (k / 10) * Math.PI * 2;
        const rr = ringR * (1.05 + 0.06 * Math.sin(t * 2 + k));
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        const sh = 0.3 + 0.5 * Math.abs(Math.sin(t * 3 + k * 1.6));
        ctx.fillStyle = rgba(hexRgb(IRIS.glow), 0.2 * sh);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2 + 1.4 * sh, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 7 · Low-HP / enrage crackle ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, R * 0.3, R * (1.0 + pulse * 0.3), '#ff5ad6',
            0.14 + 0.16 * pulse);
    }

    ctx.restore();
}

export default drawWardenPrime;
