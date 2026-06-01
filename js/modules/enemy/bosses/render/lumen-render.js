// enemy/bosses/render/lumen-render.js — LUMEN THE PRISM SOVEREIGN (9.1.x redesign).
//
// The cathedral lens-array: a stained-glass solar angel. A brilliant central
// lens-bloom (#fff6c0 core → #ffd23a → additive white halo) sits behind an
// unfolding HALO of prismatic mirror-panels — the orbiting shield drones
// (boss-parts, shieldsCore, RADIANT) rendered as semi-transparent rainbow-edged
// glass quads. Faint refraction sight-lines lace BETWEEN the panels (the
// "lattice" the player threads). On the DISJUNCTION wind-up
// (`boss.disjunctionTelegraph`) the whole array flares + a blinding bloom builds
// over the lens. On enrage the lens splits into 3 co-firing sub-lenses. Drawn in
// world space (the enemy pass is already inside the camera transform), following
// the Aegis/Harbinger prototype structure + the shared boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc,
} from './boss-gfx.js';

const LENS = { dark: '#7a5a10', mid: '#ffd23a', bright: '#fff6c0', glow: '#ffe98a' };
// Prismatic rainbow used for the mirror-panel refraction edges.
const PRISM = ['#ff5a7a', '#ffb24a', '#fff14a', '#5affa0', '#5ad6ff', '#a07aff'];

export function drawLumen(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 104);
    const facing = boss.angle || 0;
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const telegraph = !!boss.disjunctionTelegraph;     // DISJUNCTION wind-up
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.4));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const parts = livingParts(boss);

    ctx.save();

    // ── 1 · Outer light-bloom aura (brighter as the array boots / winds up) ──
    radialGlow(ctx, x, y, R * 0.5, R * (1.9 + heat * 0.5 + pulse * 0.2),
        LENS.glow, 0.16 + heat * 0.2 + (telegraph ? 0.25 : 0) + pulse * 0.06);

    // ── 2 · Refraction LATTICE — faint sight-lines laced between the panels ──
    // The "web" the player threads: thin additive lines panel→panel + panel→lens.
    if (parts.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const latticeA = (telegraph ? 0.32 : 0.12) * (0.7 + 0.3 * pulse);
        ctx.lineWidth = Math.max(1, R * 0.012);
        for (let i = 0; i < parts.length; i++) {
            const a = parts[i];
            // panel → next panel (the bounce lattice)
            const b = parts[(i + 1) % parts.length];
            const ci = hexRgb(PRISM[i % PRISM.length]);
            ctx.strokeStyle = rgba(ci, latticeA);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            // panel → central lens (the refracted spoke)
            ctx.strokeStyle = rgba(hexRgb(LENS.bright), latticeA * 0.7);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── 3 · Central lens — a brilliant radial bloom (splits to 3 on enrage) ──
    const lensR = R * 0.5;
    const lensCenters = enraged
        ? [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((off) => {
            const a = facing + off + t * 0.8;
            const d = lensR * 0.55;
            return { lx: x + Math.cos(a) * d, ly: y + Math.sin(a) * d, r: lensR * 0.55 };
        })
        : [{ lx: x, ly: y, r: lensR }];
    for (const c of lensCenters) {
        layeredCore(ctx, c.lx, c.ly, c.r, LENS, heat + (telegraph ? 0.4 : 0), pulse);
    }

    // ── 4 · Mirror-panels — the orbiting prismatic shield drones ──
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const px = part.x, py = part.y;
        const pr = part.radius || 18;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        const outward = Math.atan2(py - y, px - x);
        const edge = hexRgb(PRISM[i % PRISM.length]);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(outward + Math.PI / 2);     // panel broad face toward the lens

        // Semi-transparent prismatic quad (a stained-glass mirror panel).
        const w = pr * 1.7, h = pr * 1.05;
        const glass = ctx.createLinearGradient(-w, 0, w, 0);
        glass.addColorStop(0, rgba(edge, 0.10 * ph));
        glass.addColorStop(0.5, rgba(hexRgb(LENS.bright), 0.28 * ph + 0.05));
        glass.addColorStop(1, rgba(edge, 0.10 * ph));
        ctx.fillStyle = glass;
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(w, 0);
        ctx.lineTo(0, h);
        ctx.lineTo(-w, 0);
        ctx.closePath();
        ctx.fill();

        // Rainbow-refraction edge (additive) — the panel's signature.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(edge, 0.6 * ph + (telegraph ? 0.3 : 0.1));
        ctx.lineWidth = Math.max(1.5, pr * 0.16);
        ctx.stroke();
        ctx.restore();

        // Bright glint that tracks the lens (a moving specular highlight).
        const glint = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.2));
        ctx.fillStyle = rgba(hexRgb(LENS.bright), 0.5 * glint * ph);
        ctx.beginPath();
        ctx.arc(0, 0, pr * 0.32, 0, Math.PI * 2);
        ctx.fill();

        // Cracks as the panel is broken down.
        if (ph < 0.85) {
            ctx.strokeStyle = rgba({ r: 20, g: 16, b: 8 }, 0.5 * (1 - ph));
            ctx.lineWidth = Math.max(1, pr * 0.08);
            for (let k = 0; k < 3; k++) {
                const ca = (k / 3) * Math.PI * 2 + i;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ca) * w * 0.8, Math.sin(ca) * h * 0.8);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // ── 5 · DISJUNCTION wind-up — blinding bloom building over the lens ──
    if (telegraph) {
        additiveArc(ctx, x, y, lensR * 0.6, R * (1.6 + pulse * 0.4), 0, Math.PI * 2,
            LENS.bright, 0.18 + 0.3 * pulse);
        // A tightening bright ring footprint (the flash is coming).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(LENS.bright), 0.4 + 0.4 * pulse);
        ctx.lineWidth = Math.max(2, R * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, R * (1.4 - 0.3 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ── 6 · Drifting light-motes + lens-flare streaks (ambient) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 12; k++) {
        const a = facing + t * 0.35 + (k / 12) * Math.PI * 2;
        const rr = R * (1.1 + 0.12 * Math.sin(t * 2 + k));
        const mx = x + Math.cos(a) * rr, my = y + Math.sin(a) * rr;
        const mote = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + k * 1.7));
        ctx.fillStyle = rgba(hexRgb(LENS.glow), 0.22 * mote);
        ctx.beginPath();
        ctx.arc(mx, my, 1.5 + 1.6 * mote, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 7 · Low-HP / enrage heat crackle on the lens ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, lensR * 0.4, lensR * (1.3 + pulse * 0.3), '#ff8a3a',
            0.16 + 0.18 * pulse);
    }

    ctx.restore();
}

export default drawLumen;
