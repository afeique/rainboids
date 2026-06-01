// enemy/bosses/render/gemini-render.js — GEMINI the tethered twins (9.1.x redesign).
//
// Two massive co-orbiting twin cores — a PYRO twin (#ff5522 hot-orange radial)
// and a CRYO twin (#66ccff cold-cyan radial) — joined by a crackling ENERGY
// BRIDGE (animated plasma gradient + lightning filaments) while both survive
// (`boss.tetherActive`). The twins are the orbiting shield-parts (livingParts);
// each resists its own element, so the player must hit each with the OPPOSITE.
// When one twin dies the tether SNAPS and the survivor partner-enrages
// (`boss.partnerEnraged`) — rendered as a violent corona on the lone twin.
// Drawn in world space (the enemy pass is already inside the camera transform),
// following the Aegis/Harbinger/Lumen prototype structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore,
} from './boss-gfx.js';

const PYRO = { dark: '#3a0d04', mid: '#ff5522', bright: '#ffd9a0', glow: '#ff7a3a' };
const CRYO = { dark: '#06243a', mid: '#66ccff', bright: '#d6f4ff', glow: '#7ad0ff' };
const VOID = { dark: '#05060c', mid: '#241a3a', bright: '#b9a0ff', glow: '#7a5aff' };

function paletteFor(part) {
    const el = (part && part.element) || '';
    if (el === 'PYRO') return PYRO;
    if (el === 'CRYO') return CRYO;
    return VOID;
}

export function drawGemini(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 96);
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const partnerEnraged = !!boss.partnerEnraged;
    const tether = !!boss.tetherActive;
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.4));
    const twins = livingParts(boss);

    ctx.save();

    // ── 1 · Whole-pair aura around the orbit centre (the LINK) ──
    radialGlow(ctx, x, y, R * 0.4, R * (2.0 + heat * 0.4 + pulse * 0.2),
        VOID.glow, 0.10 + heat * 0.14 + pulse * 0.05);

    // ── 2 · ENERGY BRIDGE — crackling plasma tether between the two twins ──
    if (tether && twins.length >= 2) {
        const a = twins[0], b = twins[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;   // perpendicular (for filament jitter)

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Plasma gradient core of the bridge: PYRO end → CRYO end.
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        const pA = paletteFor(a), pB = paletteFor(b);
        grad.addColorStop(0, rgba(hexRgb(pA.glow), 0.6 + 0.2 * pulse));
        grad.addColorStop(0.5, rgba(hexRgb(VOID.bright), 0.35 + 0.25 * pulse));
        grad.addColorStop(1, rgba(hexRgb(pB.glow), 0.6 + 0.2 * pulse));
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(3, R * 0.12) * (0.8 + 0.3 * pulse);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Lightning filaments — jagged polylines jittered along the bridge.
        for (let f = 0; f < 2; f++) {
            const segs = 7;
            const amp = R * (0.18 + 0.12 * pulse) * (f === 0 ? 1 : -0.7);
            ctx.strokeStyle = rgba(hexRgb(VOID.bright), 0.5 + 0.3 * pulse);
            ctx.lineWidth = Math.max(1, R * 0.02);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            for (let s = 1; s < segs; s++) {
                const u = s / segs;
                const jitter = Math.sin(t * 9 + s * 2.3 + f * 1.7) * amp * Math.sin(u * Math.PI);
                ctx.lineTo(a.x + dx * u + nx * jitter, a.y + dy * u + ny * jitter);
            }
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── 3 · The two twin cores (element-coloured radial bodies) ──
    for (const part of twins) {
        const px = part.x, py = part.y;
        const pr = part.radius || 34;
        const pal = paletteFor(part);
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        const lone = !!part.partnerEnraged;     // this twin's partner has died

        // Core body (layered radial; brighter for an enraged lone survivor).
        layeredCore(ctx, px, py, pr, pal, heat + (lone ? 0.4 : 0), pulse);

        // Orbiting element motes (signals which element to hit it with).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 6; k++) {
            const a2 = t * (1.2 + 0.3 * phaseIdx) + (k / 6) * Math.PI * 2;
            const rr = pr * (1.2 + 0.15 * Math.sin(t * 3 + k));
            const mx = px + Math.cos(a2) * rr, my = py + Math.sin(a2) * rr;
            ctx.fillStyle = rgba(hexRgb(pal.glow), 0.4 * (0.5 + 0.5 * ph));
            ctx.beginPath();
            ctx.arc(mx, my, 2 + 1.4 * Math.abs(Math.sin(t * 2 + k)), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // PARTNER-ENRAGE corona — a violent flaring ring on the lone survivor.
        if (lone || (partnerEnraged && twins.length === 1)) {
            radialGlow(ctx, px, py, pr * 0.5, pr * (2.0 + pulse * 0.6),
                pal.glow, 0.3 + 0.3 * pulse);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = rgba(hexRgb(pal.bright), 0.5 + 0.4 * pulse);
            ctx.lineWidth = Math.max(2, pr * 0.12);
            for (let k = 0; k < 10; k++) {
                const a3 = t * 2 + (k / 10) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(px + Math.cos(a3) * pr * 1.05, py + Math.sin(a3) * pr * 1.05);
                ctx.lineTo(px + Math.cos(a3) * pr * (1.4 + 0.3 * pulse),
                    py + Math.sin(a3) * pr * (1.4 + 0.3 * pulse));
                ctx.stroke();
            }
            ctx.restore();
        }

        // Scorch as the twin is worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(8,6,12,${0.45 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, pr * 0.95, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 4 · Central LINK node (the orbit hub the twins shield) ──
    {
        const linkR = R * 0.34;
        // Dim + sealed while a twin still shields it; flares once both are down.
        const exposed = twins.length === 0;
        layeredCore(ctx, x, y, linkR, VOID, heat + (exposed ? 0.5 : -0.1), pulse);
        if (exposed) {
            radialGlow(ctx, x, y, linkR * 0.5, linkR * (1.8 + pulse * 0.5),
                VOID.glow, 0.3 + 0.3 * pulse);
        }
    }

    ctx.restore();
}

export default drawGemini;
