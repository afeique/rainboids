// enemy/bosses/render/nullmaw-render.js — NULLMAW THE DEVOURER (9.1.x redesign).
//
// A cosmic void-whale maw: a deep void radial (#05030f → #3a1d6e → #7744dd) with
// a swirling accretion ring, jagged TEETH with bone-pale rim light, and a
// pulsing singularity throat-core. The single MAW weak-point (boss-parts,
// shieldsCore, VOID) gates the core; it OPENS on the projectile-eat cadence
// (`boss.mawOpen`) exposing the throat — but feeding an open maw raises
// `boss.mawShield` (the maw hardens), rendered as a brightening greedy glow that
// warns against spamming fire. The GRAVITY pull telegraph (`boss.pullTelegraph`)
// /active (`boss.pullActive`) draws inward matter streaks; the IMPLOSION
// telegraph (`boss.implosionTelegraph`) charges a collapsing ring. On enrage the
// maw turns inside-out into a four-jaw flower. Drawn in world space (the enemy
// pass is already inside the camera transform), following the prototype
// structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc, shockwaveRing,
} from './boss-gfx.js';

const VOID = { dark: '#05030f', mid: '#3a1d6e', bright: '#a98bf0', glow: '#7744dd' };
const THROAT = { dark: '#0a0518', mid: '#5a2fb0', bright: '#d8c0ff', glow: '#9a6aff' };
const BONE = '#d8d0c0';   // pale tooth rim light

// Draw a jaw of teeth ringing (cx,cy) over an angular SPAN centred on `mid`,
// at radius `rr`, each tooth `toothLen` long pointing inward. `open` 0..1 widens.
function drawJaw(ctx, cx, cy, rr, mid, span, toothLen, open, count) {
    for (let i = 0; i < count; i++) {
        const a = mid - span / 2 + (span * i) / (count - 1 || 1);
        // open pushes teeth outward (maw gaping); closed they interlock inward.
        const baseR = rr + open * toothLen * 0.5;
        const tipR = baseR - toothLen * (0.5 + 0.5 * (1 - open));
        const bw = 0.05 + 0.02 * Math.sin(i);   // tooth angular half-width
        const bx0 = cx + Math.cos(a - bw) * baseR, by0 = cy + Math.sin(a - bw) * baseR;
        const bx1 = cx + Math.cos(a + bw) * baseR, by1 = cy + Math.sin(a + bw) * baseR;
        const tx = cx + Math.cos(a) * tipR, ty = cy + Math.sin(a) * tipR;
        ctx.beginPath();
        ctx.moveTo(bx0, by0);
        ctx.lineTo(tx, ty);
        ctx.lineTo(bx1, by1);
        ctx.closePath();
        ctx.fillStyle = rgba(hexRgb(VOID.dark), 0.96);
        ctx.fill();
        ctx.strokeStyle = rgba(hexRgb(BONE), 0.5);
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }
}

export function drawNullmaw(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 112);
    const facing = boss.angle || 0;
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const mawOpen = !!boss.mawOpen;
    const mawWindup = !!(boss.maw && boss.maw.state === 'WINDUP');
    const shield = (typeof boss.mawShield === 'number') ? boss.mawShield : 0;
    const pullTel = !!boss.pullTelegraph;
    const pullActive = !!boss.pullActive;
    const implosionTel = !!boss.implosionTelegraph;
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.2));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    // openness eases the jaws + throat exposure (windup pre-opens a touch).
    const open = mawOpen ? 1 : (mawWindup ? 0.4 + 0.2 * pulse : 0.12);
    // Greedy/fed hardness: a clamped 0..1 warning glow from the absorb counter.
    const greed = Math.min(1, shield / 20);
    const mawPart = livingParts(boss)[0] || null;

    ctx.save();

    // ── 1 · Gravitational lensing aura + inward matter streaks ──
    radialGlow(ctx, x, y, R * 0.4, R * (2.6 + heat * 0.5 + pulse * 0.2),
        VOID.glow, 0.10 + heat * 0.12 + ((pullActive || pullTel) ? 0.16 : 0) + pulse * 0.05);
    {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const streaks = (pullActive ? 18 : 10);
        for (let k = 0; k < streaks; k++) {
            const a = (k / streaks) * Math.PI * 2 + t * 0.2;
            // matter pulled inward — streak from far → near, animated by t.
            const u = ((t * (pullActive ? 0.8 : 0.4) + k * 0.31) % 1);
            const rOut = R * (3.2 - u * 2.4), rIn = rOut - R * (0.3 + 0.4 * (pullActive ? 1 : 0.5));
            ctx.strokeStyle = rgba(hexRgb(VOID.bright),
                (pullActive ? 0.3 : 0.14) * (1 - u) * (0.6 + 0.4 * pulse));
            ctx.lineWidth = Math.max(1, R * 0.012);
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * rOut, y + Math.sin(a) * rOut);
            ctx.lineTo(x + Math.cos(a) * rIn, y + Math.sin(a) * rIn);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── 2 · Swirling accretion ring around the void body ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
        const rr = R * (1.0 + k * 0.18);
        ctx.strokeStyle = rgba(hexRgb(VOID.mid), (0.18 - k * 0.04) * (0.6 + 0.4 * pulse));
        ctx.lineWidth = Math.max(1.5, R * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, rr, t * (0.5 - k * 0.1), t * (0.5 - k * 0.1) + Math.PI * 1.6);
        ctx.stroke();
    }
    ctx.restore();

    // ── 3 · Void body core (the event-horizon mass) ──
    layeredCore(ctx, x, y, R * 0.6, VOID, heat, pulse);

    // ── 4 · The MAW weak-point — jagged jaws + exposed throat singularity ──
    if (mawPart) {
        const mx = mawPart.x, my = mawPart.y;
        const mr = mawPart.radius || 36;
        const ph = mawPart.maxHealth > 0 ? Math.max(0.15, mawPart.health / mawPart.maxHealth) : 1;
        // maw faces along the boss facing (toward the player proxy).
        const mawDir = Math.atan2(my - y, mx - x);

        // Throat interior — deep void radial, brighter/exposed when open.
        const throatR = mr * (1.0 + open * 0.6);
        const grad = ctx.createRadialGradient(mx, my, mr * 0.1, mx, my, throatR);
        grad.addColorStop(0, rgba(hexRgb(THROAT.dark), 0.98));
        grad.addColorStop(0.6, rgba(hexRgb(VOID.mid), 0.85 * (0.4 + 0.6 * open)));
        grad.addColorStop(1, rgba(hexRgb(VOID.dark), 0.92));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mx, my, throatR, 0, Math.PI * 2);
        ctx.fill();

        // Throat-core SINGULARITY (the weak point) — bright + pulsing when open.
        if (open > 0.3) {
            layeredCore(ctx, mx, my, mr * 0.45 * open, THROAT, heat + open * 0.5, pulse);
        }

        // Jaws of teeth. Enrage → a four-jaw flower around the maw; else two opposing jaws.
        if (enraged) {
            for (let j = 0; j < 4; j++) {
                drawJaw(ctx, mx, my, throatR * 1.05, mawDir + (j / 4) * Math.PI * 2,
                    Math.PI * 0.4, mr * 0.9, open, 6);
            }
        } else {
            drawJaw(ctx, mx, my, throatR * 1.05, mawDir, Math.PI * 0.7, mr * 0.95, open, 7);
            drawJaw(ctx, mx, my, throatR * 1.05, mawDir + Math.PI, Math.PI * 0.7, mr * 0.95, open, 7);
        }

        // GREEDY shield glow — brightens as the maw is fed (warns: stop firing).
        if (greed > 0.05) {
            radialGlow(ctx, mx, my, throatR * 0.5, throatR * (1.6 + greed * 0.6),
                '#ff7adf', 0.12 + 0.4 * greed * (0.6 + 0.4 * pulse));
        }

        // Eat-cone telegraph (windup) — a translucent absorb cone opening up.
        if (mawWindup || mawOpen) {
            additiveArc(ctx, mx, my, throatR * 0.8, throatR * (3.0 + open),
                mawDir, Math.PI * (0.4 + 0.3 * open), VOID.glow,
                (mawOpen ? 0.18 : 0.10) + 0.1 * pulse);
        }

        // Maw damage scorch.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(4,2,10,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(mx, my, throatR * 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    } else {
        // Maw broken → the core throat is exposed at the body centre.
        layeredCore(ctx, x, y, R * 0.32, THROAT, heat + 0.4, pulse);
        radialGlow(ctx, x, y, R * 0.2, R * (0.8 + pulse * 0.2), THROAT.glow,
            0.3 + 0.3 * pulse);
    }

    // ── 5 · IMPLOSION telegraph — a collapsing bright ring charging in ──
    if (implosionTel) {
        const ir = R * (2.6 - 1.4 * pulse);
        shockwaveRing(ctx, x, y, ir, Math.max(4, R * 0.06), THROAT.bright,
            0.3 + 0.4 * pulse);
    }

    // ── 6 · Void-spark motes drifting in the lensing field ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 12; k++) {
        const a = -t * 0.3 + (k / 12) * Math.PI * 2;
        const rr = R * (1.4 + 0.5 * Math.sin(t * 1.5 + k));
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        const sp = 0.3 + 0.5 * Math.abs(Math.sin(t * 2.5 + k * 1.4));
        ctx.fillStyle = rgba(hexRgb(VOID.bright), 0.18 * sp);
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + 1.5 * sp, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 7 · Low-HP / enrage crackle ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, R * 0.3, R * (1.0 + pulse * 0.3), '#c85aff',
            0.14 + 0.16 * pulse);
    }

    ctx.restore();
}

export default drawNullmaw;
