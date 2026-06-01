// enemy/bosses/render/hivemother-render.js — THE HIVEMOTHER brood leviathan (9.1.x).
//
// A gargantuan biomechanical queen: a breathing biomech HEART-core ringed by
// bloated, translucent EGG-SACS (boss-parts, shieldsCore, TOXIC) with larvae
// visibly squirming inside a green sub-surface-scatter gradient
// (#1a3a14 → #88ff44 → #d6ffb0). Each living sac is a spawner — when a hatch
// fires (`boss.spawnPending`) the sac flares a birth pulse + sheds slime motes.
// The CORRODE-cloud telegraph (`boss.corrodeCloudTelegraph`) blooms a sickly
// area wind-up; the bloom (`boss.corrodeCloudFiring`) belches an acid burst.
// Ambient drifting spores + pulsing bioluminescence throughout. Drawn in world
// space (the enemy pass is already inside the camera transform), following the
// prototype structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, additiveArc, shockwaveRing,
} from './boss-gfx.js';

const FLESH = { dark: '#1a3a14', mid: '#88ff44', bright: '#d6ffb0', glow: '#b6ff8a' };
const HEART = { dark: '#10240e', mid: '#3aa028', bright: '#caffb0', glow: '#88ff44' };
const ACID = { dark: '#2a3a08', mid: '#aacc22', bright: '#eaff8a', glow: '#c8ff44' };

export function drawHivemother(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 112);
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const spawnPending = !!boss.spawnPending;          // a sac hatched this frame
    const telegraph = !!boss.corrodeCloudTelegraph;    // CORRODE-cloud wind-up
    const firing = !!boss.corrodeCloudFiring;          // CORRODE-cloud bloom
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    // Slow organic "breathing" — heavier + faster as she enrages.
    const breathe = 0.5 + 0.5 * Math.sin(t * (enraged ? 2.6 : 1.4));
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.2));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const sacs = livingParts(boss);

    ctx.save();

    // ── 1 · Biolume aura + sickly sub-surface glow (breathing) ──
    radialGlow(ctx, x, y, R * 0.5, R * (2.2 + heat * 0.4 + breathe * 0.25),
        FLESH.glow, 0.12 + heat * 0.12 + breathe * 0.06);

    // ── 2 · The HEART-core (carapace shed → leaner frame as phases advance) ──
    // Body swells/contracts with the breath; the carapace thins (alpha) by phase.
    const coreR = R * (0.5 + 0.06 * breathe);
    const carapace = Math.max(0, 1 - phaseIdx * 0.32);   // sheds each phase
    if (carapace > 0.02) {
        // Outer chitin shell — segmented plates, desaturating as it sheds.
        ctx.save();
        ctx.globalAlpha = 0.5 * carapace;
        ctx.strokeStyle = rgba(hexRgb(FLESH.dark), 0.9);
        ctx.lineWidth = Math.max(2, coreR * 0.08);
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + t * 0.2;
            ctx.beginPath();
            ctx.arc(x, y, coreR * (1.02 + 0.04 * Math.sin(t + k)),
                a, a + Math.PI / 7);
            ctx.stroke();
        }
        ctx.restore();
    }
    layeredCore(ctx, x, y, coreR, HEART, heat + (1 - carapace) * 0.3, pulse);
    // The pulsing heart inside — a brighter inner bloom on the beat.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(hexRgb(HEART.bright), 0.3 + 0.4 * breathe);
    ctx.beginPath();
    ctx.arc(x, y, coreR * (0.3 + 0.08 * breathe), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 3 · Egg-sacs — translucent chambers with squirming larvae ──
    for (let i = 0; i < sacs.length; i++) {
        const part = sacs[i];
        const px = part.x, py = part.y;
        const pr = part.radius || 24;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        const sacBreathe = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.3);

        // Translucent sac membrane (sub-surface-scatter green).
        const sacR = pr * (1.0 + 0.12 * sacBreathe);
        const memb = ctx.createRadialGradient(px, py, pr * 0.1, px, py, sacR);
        memb.addColorStop(0, rgba(hexRgb(FLESH.bright), 0.55 * ph + 0.1));
        memb.addColorStop(0.6, rgba(hexRgb(FLESH.mid), 0.40 * ph + 0.05));
        memb.addColorStop(1, rgba(hexRgb(FLESH.dark), 0.30));
        ctx.fillStyle = memb;
        ctx.beginPath();
        ctx.arc(px, py, sacR, 0, Math.PI * 2);
        ctx.fill();

        // Squirming larvae inside (small dark wriggling sub-sprites).
        ctx.save();
        ctx.fillStyle = rgba(hexRgb(HEART.dark), 0.7 * ph);
        for (let k = 0; k < 4; k++) {
            const la = t * 1.5 + k * 1.7 + i;
            const lr = pr * 0.45 * (0.4 + 0.4 * Math.abs(Math.sin(t * 3 + k)));
            const lx = px + Math.cos(la) * lr, ly = py + Math.sin(la) * lr;
            ctx.beginPath();
            ctx.ellipse(lx, ly, pr * 0.16, pr * 0.08, la, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Membrane rim (chitin sheen).
        ctx.strokeStyle = rgba(hexRgb(FLESH.glow), 0.5 * ph + 0.15);
        ctx.lineWidth = Math.max(1.5, pr * 0.10);
        ctx.beginPath();
        ctx.arc(px, py, sacR * 0.97, 0, Math.PI * 2);
        ctx.stroke();

        // Birth pulse — a hatch fired this frame: flare the sac + shed slime.
        if (spawnPending) {
            radialGlow(ctx, px, py, sacR * 0.4, sacR * (2.0 + pulse * 0.5),
                FLESH.bright, 0.3 + 0.3 * pulse);
        }

        // Rupture scorch as the sac is lanced down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(6,12,4,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, sacR * 0.92, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 4 · Drifting spores (ambient bioluminescence) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
        const a = t * 0.3 + (k / 14) * Math.PI * 2;
        const rr = R * (1.2 + 0.5 * ((t * 0.1 + k * 0.37) % 1)) + 0.1 * Math.sin(t + k);
        const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
        const sp = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + k));
        ctx.fillStyle = rgba(hexRgb(FLESH.glow), 0.18 * sp);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2 + 1.6 * sp, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 5 · CORRODE-cloud telegraph / bloom ──
    if (telegraph) {
        // Wind-up: a sickly area bloom building (acid green).
        additiveArc(ctx, x, y, R * 0.8, R * (2.2 + pulse * 0.4), 0, Math.PI * 2,
            ACID.glow, 0.10 + 0.22 * pulse);
    } else if (firing) {
        // Bloom: an expanding acid cloud burst.
        shockwaveRing(ctx, x, y, R * (1.4 + 0.6 * pulse), Math.max(5, R * 0.08),
            ACID.bright, 0.45 + 0.3 * pulse);
    }

    // ── 6 · Low-HP / enrage heart crackle ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y, coreR * 0.4, coreR * (1.3 + pulse * 0.3), '#eaff3a',
            0.16 + 0.18 * pulse);
    }

    ctx.restore();
}

export default drawHivemother;
