// ── AURORA skin ────────────────────────────────────────────────────
// The default "living spectral interceptor" — the current ship. This
// module owns ONLY the hull paint (geometry + engines + cockpit). The
// shared feedback FX (muzzle flash, hit flash, charge glow, level-up,
// cooldown orb) live in renderer.js and run for every skin, so this
// file is a faithful extraction of the original draw()'s hull pass.
//
// `paint(ctx, r, t)` is invoked with `this` = the Player (or a preview
// stub) so it reads live articulation state: thrustLevel, bank,
// wingSweep, flapOpen, glidePhase.

import { glowSpriteCache } from '../../core/utils.js';
import { rgba } from '../../core/color-cache.js';

const _shipPartCache = new Map();

function _getShipParts(r) {
    let parts = _shipPartCache.get(r);
    if (parts) return parts;

    // Fuselage — a sharp, sleek arrowhead with a forked tail (ship-local,
    // nose pointing up at -y).
    const fuselage = new Path2D();
    fuselage.moveTo(0, -r * 1.18);
    fuselage.lineTo( r * 0.11, -r * 0.62);
    fuselage.lineTo( r * 0.17, -r * 0.02);
    fuselage.lineTo( r * 0.15,  r * 0.46);
    fuselage.lineTo( r * 0.27,  r * 0.74);
    fuselage.lineTo( r * 0.12,  r * 0.70);
    fuselage.lineTo(0,           r * 0.52);
    fuselage.lineTo(-r * 0.12,  r * 0.70);
    fuselage.lineTo(-r * 0.27,  r * 0.74);
    fuselage.lineTo(-r * 0.15,  r * 0.46);
    fuselage.lineTo(-r * 0.17, -r * 0.02);
    fuselage.lineTo(-r * 0.11, -r * 0.62);
    fuselage.closePath();

    // A crisp spine ridge down the fuselage centreline.
    const spine = new Path2D();
    spine.moveTo(0, -r * 1.05);
    spine.lineTo( r * 0.055, -r * 0.2);
    spine.lineTo(0,           r * 0.4);
    spine.lineTo(-r * 0.055, -r * 0.2);
    spine.closePath();

    // Right swept-delta wing — hinge at origin, blade extends outboard (+x)
    // and aft (+y) to a sharp tip.
    const wing = new Path2D();
    wing.moveTo(0, -r * 0.16);
    wing.lineTo( r * 0.5,  -r * 0.06);
    wing.lineTo( r * 1.24,  r * 0.18);  // sharp swept tip
    wing.lineTo( r * 0.95,  r * 0.30);
    wing.lineTo( r * 0.5,   r * 0.34);
    wing.lineTo(0,           r * 0.34);
    wing.closePath();

    // Outboard S-foil flap — hinge near the wingtip, fans aft when open.
    const flap = new Path2D();
    flap.moveTo(0, 0);
    flap.lineTo( r * 0.46,  r * 0.05);
    flap.lineTo( r * 0.36,  r * 0.28);
    flap.lineTo(-r * 0.02,  r * 0.2);
    flap.closePath();

    // Forward canard — a small sharp fin near the cockpit that steers.
    const canard = new Path2D();
    canard.moveTo(0, 0);
    canard.lineTo( r * 0.32, -r * 0.16);
    canard.lineTo( r * 0.42, -r * 0.02);
    canard.lineTo( r * 0.08,  r * 0.12);
    canard.closePath();

    parts = {
        fuselage, spine, wing, flap, canard,
        wingHinge:   { x: r * 0.13, y: -r * 0.02 },
        flapHinge:   { x: r * 1.0,  y: r * 0.16 },   // in WING-local frame
        canardHinge: { x: r * 0.12, y: -r * 0.48 },
        enginePods:  [ { x: r * 0.34, y: r * 0.6 }, { x: -r * 0.34, y: r * 0.6 } ],
        cockpit:     { x: 0, y: -r * 0.5, rx: r * 0.15, ry: r * 0.32 },
    };
    _shipPartCache.set(r, parts);
    return parts;
}

function paint(ctx, r, t) {
    const noseY = -r * 1.18;
    const thr = this.thrustLevel;
    const bank = this.bank || 0;
    const sweep = this.wingSweep || 0;
    const flapOpen = this.flapOpen || 0;
    const breath = Math.sin(this.glidePhase || 0);

    const parts = _getShipParts(r);
    const engines = parts.enginePods;
    const OUTLINE = 'rgba(2, 0, 10, 0.98)';

    // 8.0.0 — Mobile brightness fix. The hull is a near-black BASE with all of
    // its colour layered on top via additive `globalCompositeOperation =
    // 'lighter'`. Some mobile GPUs render 'lighter' so weakly that only the
    // base shows → the ship looked "very dark" on phones. On mobile we paint
    // the spectral layers with plain `source-over` (so they ALWAYS show) and
    // lift the base toward a visible deep blue-violet. Desktop is unchanged.
    const mob = !!(this.gameEngine && this.gameEngine.mobile);
    const SHEEN_OP = mob ? 'source-over' : 'lighter';
    const BASE = mob ? 'rgba(26, 20, 56, 0.96)' : 'rgba(9, 6, 26, 0.97)';

    // ── Spectral gradients (rebuilt only when the radius changes) ──
    if (!this._shipGrads || this._shipGrads.r !== r) {
        const wingGrad = ctx.createLinearGradient(0, 0, r * 1.24, r * 0.16);
        wingGrad.addColorStop(0.0,  rgba(255, 196, 0, 0.85));    // pure gold root
        wingGrad.addColorStop(0.3,  rgba(255, 32, 96, 0.82));    // hot rose-red
        wingGrad.addColorStop(0.62, rgba(150, 30, 255, 0.82));   // electric violet
        wingGrad.addColorStop(1.0,  rgba(0, 235, 255, 0.9));     // electric cyan tip
        const flapGrad = ctx.createLinearGradient(0, 0, r * 0.46, r * 0.22);
        flapGrad.addColorStop(0, rgba(255, 0, 140, 0.95));       // pure magenta
        flapGrad.addColorStop(1, rgba(190, 24, 255, 0.78));      // violet-magenta
        const fuseGrad = ctx.createLinearGradient(0, noseY, 0, r * 0.74);
        fuseGrad.addColorStop(0,   rgba(0, 190, 255, 0.62));     // cyan nose
        fuseGrad.addColorStop(0.5, rgba(86, 36, 255, 0.55));     // deep violet mid
        fuseGrad.addColorStop(1,   rgba(255, 28, 120, 0.55));    // magenta tail
        const cp = parts.cockpit;
        const cockpitGrad = ctx.createRadialGradient(cp.x, cp.y - cp.ry * 0.3, 0, cp.x, cp.y, cp.ry);
        cockpitGrad.addColorStop(0,   rgba(255, 255, 255, 1.0));
        cockpitGrad.addColorStop(0.5, rgba(0, 240, 255, 0.9));
        cockpitGrad.addColorStop(1,   rgba(150, 40, 255, 0.4));
        this._shipGrads = { r, wingGrad, flapGrad, fuseGrad, cockpitGrad };
    }
    const grads = this._shipGrads;

    const paintPart = (path, sheen, edge, edgeW, outlineW) => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = BASE;
        ctx.fill(path);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = outlineW;
        ctx.stroke(path);
        ctx.globalCompositeOperation = SHEEN_OP;
        ctx.fillStyle = sheen;
        ctx.fill(path);
        if (edge) {
            ctx.strokeStyle = edge;
            ctx.lineWidth = edgeW;
            ctx.stroke(path);
        }
    };

    // ── Engine exhaust — spectral plume modulated by thrust ──
    const idlePulse = 0.4 + Math.sin(t * 4) * 0.1;
    const thrustPulse = 0.85 + Math.sin(t * 12) * 0.2;
    const engPulse = idlePulse + (thrustPulse - idlePulse) * thr;
    const qThr = Math.round(thr * 10) / 10;
    const qPulse = Math.round(engPulse * 10) / 10;
    ctx.globalCompositeOperation = 'lighter';
    for (let ei = 0; ei < engines.length; ei++) {
        const eng = engines[ei];
        const exhaustLen = r * (0.4 + thr * 1.25) * (0.8 + engPulse * 0.4);
        const cacheSlot = this._engineGradCache || (this._engineGradCache = [{}, {}]);
        const cache = cacheSlot[ei];
        if (cache.qThr !== qThr || cache.qPulse !== qPulse || cache.r !== r) {
            const qLen = r * (0.4 + qThr * 1.25) * (0.8 + qPulse * 0.4);
            const grad = ctx.createLinearGradient(eng.x, eng.y, eng.x, eng.y + qLen);
            grad.addColorStop(0,    rgba(255, 255, 255, 0.95 * qPulse));
            grad.addColorStop(0.3,  rgba(60, 230, 255, 0.7 * qPulse));   // cyan
            grad.addColorStop(0.65, rgba(255, 60, 180, 0.45 * qPulse));  // magenta
            grad.addColorStop(1,    'transparent');
            cache.grad = grad;
            cache.qThr = qThr;
            cache.qPulse = qPulse;
            cache.r = r;
        }
        ctx.fillStyle = cache.grad;
        const glowI = 0.4 + thr * 0.5;
        glowSpriteCache.draw(ctx, eng.x, eng.y + exhaustLen * 0.5, '#33ddff', r * 0.14, 6, glowI * engPulse);
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y + exhaustLen * 0.5, r * 0.13, exhaustLen * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Swept-delta wings + outboard S-foil flaps ──
    const sweepAng = -0.06 + sweep * 0.5 + breath * 0.05 * (1 - sweep);
    const flapAng = 0.15 + flapOpen * 0.7;
    for (let s = 1; s >= -1; s -= 2) {
        ctx.save();
        ctx.translate(parts.wingHinge.x * s, parts.wingHinge.y);
        ctx.scale(s, 1);
        ctx.rotate(sweepAng + s * bank * 0.22);
        paintPart(parts.wing, grads.wingGrad, rgba(255, 238, 90, 0.95), 1.3, 2.6);  // gold edge
        ctx.save();
        ctx.translate(parts.flapHinge.x, parts.flapHinge.y);
        ctx.rotate(flapAng);
        paintPart(parts.flap, grads.flapGrad, rgba(255, 120, 220, 0.98), 1.1, 2.2);  // bright pink edge
        ctx.restore();
        ctx.restore();
    }

    // ── Fuselage — cyan outline contrasts the gold wing edges ──
    paintPart(parts.fuselage, grads.fuseGrad, rgba(120, 245, 255, 0.9), 1.3, 3.2);

    // ── Spine ridge — a bright hairline down the body ──
    ctx.globalCompositeOperation = SHEEN_OP;
    ctx.fillStyle = 'rgba(180, 245, 255, 0.55)';
    ctx.fill(parts.spine);
    ctx.strokeStyle = 'rgba(255, 240, 150, 0.7)';
    ctx.lineWidth = 0.7;
    ctx.stroke(parts.spine);

    // ── Engine pods — dark housings, fanning nozzle petals, hot cores ──
    for (const eng of engines) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(10, 8, 30, 0.95)';
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y, r * 0.16, r * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const petal = 0.2 + flapOpen * 0.5;
        for (const ps of [1, -1]) {
            ctx.save();
            ctx.translate(eng.x, eng.y);
            ctx.rotate(ps * petal);
            ctx.fillStyle = 'rgba(14, 12, 38, 0.95)';
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.02);
            ctx.lineTo(ps * r * 0.17, r * 0.05);
            ctx.lineTo(ps * r * 0.11, r * 0.2);
            ctx.lineTo(0, r * 0.12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'lighter';
        const coreI = 0.5 + thr * 0.5;
        glowSpriteCache.draw(ctx, eng.x, eng.y, '#33e0ff', r * 0.12, 5, coreI);
        const coreGrad = ctx.createRadialGradient(eng.x, eng.y, 0, eng.x, eng.y, r * 0.13);
        coreGrad.addColorStop(0,   rgba(255, 255, 255, 0.9 * coreI));
        coreGrad.addColorStop(0.5, rgba(60, 220, 255, 0.7 * coreI));
        coreGrad.addColorStop(1,   'transparent');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(eng.x, eng.y, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Forward canards — steer with bank, tuck back with sweep ──
    const canardAng = -0.08 + sweep * 0.22 + breath * 0.04;
    for (let s = 1; s >= -1; s -= 2) {
        ctx.save();
        ctx.translate(parts.canardHinge.x * s, parts.canardHinge.y);
        ctx.scale(s, 1);
        ctx.rotate(canardAng + s * bank * 0.3);
        paintPart(parts.canard, rgba(255, 190, 0, 0.85), rgba(255, 248, 170, 0.95), 0.9, 1.8);
        ctx.restore();
    }

    // ── Cockpit canopy ──
    const cp = parts.cockpit;
    glowSpriteCache.draw(ctx, cp.x, cp.y, '#9fe8ff', cp.ry, 6, 0.6);
    ctx.globalCompositeOperation = SHEEN_OP;
    ctx.fillStyle = grads.cockpitGrad;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, cp.rx, cp.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 245, 255, 0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, cp.rx, cp.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(cp.x, cp.y + breath * cp.ry * 0.4, cp.rx * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // ── Nose tip glow ──
    glowSpriteCache.draw(ctx, 0, noseY, '#ffffff', r * 0.08, 12, 0.9);
    ctx.fillStyle = 'rgba(220, 250, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(0, noseY, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
}

export const skin = {
    id: 'aurora',
    name: 'AURORA',
    desc: 'The living spectral interceptor — articulated wings that sweep and bank.',
    noseY: -1.18,
    bankShear: 0.12,
    paint,
};
