// Player rendering — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { glowSpriteCache } from '../core/utils.js';
import { rgba } from '../core/color-cache.js';
import { frameClock } from '../core/frame-clock.js';
import { drawShipShape, SHIP_PALETTE_MAGENTA } from '../render/shapes.js';

// ── Ship part geometry (Path2D cache) ──────────────────────────────
// The ship is built from independently-articulated parts so it can
// "transform" as it flies: the swept-delta WINGS rotate about their root
// hinge (sweeping back under thrust, rolling asymmetrically when banking),
// the outboard S-FOIL FLAPS fan open with thrust, and the forward CANARDS
// steer with the bank. Each part is a static polygon in its OWN hinge-local
// frame (origin = the hinge), so articulation is pure ctx rotation at draw
// time and the Path2D objects cache forever (the radius is constant after
// construction). Left-side parts reuse the right-side paths via
// ctx.scale(-1, 1), so one definition draws both sides.
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

// ── Remote-peer ship draw (MVD multiplayer, 2026-05-13) ────────────────────
//
// Minimal silhouette renderer for remote-player ships in multiplayer mode.
// Intentionally NOT a copy of the local `draw()` — we strip every local
// feedback signal (thrust glow, shield shimmer, muzzle flash, hit flash)
// because those are MY-ship status cues and rendering them for a peer
// would misrepresent the simulation state. What's left is the hull outline
// + central body + cockpit, tinted magenta/orange to visually distinguish
// "that's another player" at a glance.
//
// This is also lighter on CPU (no live gradients, no glow sprites, no
// composite-mode flips) so adding N remote ships costs roughly N × small.
//
// Signature mirrors `drawShip(ctx, x, y, angle, radius?)` so any future
// renderer refactor that needs to draw the local ship at an external
// position can route through here too — keeping the visual family aligned
// is the only invariant.
//
// @param {CanvasRenderingContext2D} ctx
// @param {number} x          world x
// @param {number} y          world y
// @param {number} angle      aim angle in radians
// @param {number} [radius]   ship radius (defaults to local-player 12 px)
export function drawRemoteShip(ctx, x, y, angle, radius = 12) {
    // Delegates to the shared `drawShipShape` helper (js/modules/render/
    // shapes.js) with the magenta remote palette, so solo + /mp share
    // one ship silhouette definition. Behaviour is unchanged.
    drawShipShape(ctx, x, y, angle, { radius, palette: SHIP_PALETTE_MAGENTA });
}

// ── Main draw ─────────────────────────────────────────────────────────────

export function draw(ctx) {
    if (!this.active) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    // Flash effect during invincibility
    if (this.invincible) {
        const flash = Math.sin(frameClock.now * 0.02) > 0;
        ctx.globalAlpha = flash ? 0.4 : 0.9;
    }
    // Hit flash — brief white burst on collision (decremented here)
    if (this._hitFlashTimer > 0) this._hitFlashTimer--;

    const r = this.radius;
    const t = frameClock.now * 0.001;
    const noseY = -r * 1.18;

    // ── Engine startup shudder ──
    // Brief mechanical vibration when engines re-engage after idle.
    if (this.engineStartup > 0) {
        const shudder = this.engineStartup * 2.2;
        ctx.translate(Math.sin(t * 65) * shudder, Math.cos(t * 85) * shudder * 0.7);
    }

    // ── Living-ship articulation (computed each frame in player.update) ──
    // bank: lateral lean, wingSweep: 0 spread → 1 swept, flapOpen: S-foils,
    // glidePhase: idle breathing. The ship leans into turns, streamlines
    // under thrust, and gently flexes its wings when still.
    const thr = this.thrustLevel;
    const bank = this.bank || 0;
    const sweep = this.wingSweep || 0;
    const flapOpen = this.flapOpen || 0;
    const breath = Math.sin(this.glidePhase || 0);

    // Lean the whole airframe into the bank — a gentle shear, like a bird
    // tipping through a turn.
    ctx.transform(1, 0, bank * 0.12, 1, 0, 0);

    const parts = _getShipParts(r);
    const engines = parts.enginePods;
    const OUTLINE = 'rgba(2, 0, 10, 0.98)';

    // ── Spectral gradients (rebuilt only when the radius changes) ──
    // A warm→cool rainbow sweep flows along each wing span; because the
    // gradient is defined in wing-local coords it rotates WITH the wing,
    // so the colours flow as the wing sweeps.
    if (!this._shipGrads || this._shipGrads.r !== r) {
        // Wings: a near-pure-saturation spectral sweep, gold root → electric
        // cyan tip, at high alpha so the colours blaze rather than tint.
        const wingGrad = ctx.createLinearGradient(0, 0, r * 1.24, r * 0.16);
        wingGrad.addColorStop(0.0,  rgba(255, 196, 0, 0.85));    // pure gold root
        wingGrad.addColorStop(0.3,  rgba(255, 32, 96, 0.82));    // hot rose-red
        wingGrad.addColorStop(0.62, rgba(150, 30, 255, 0.82));   // electric violet
        wingGrad.addColorStop(1.0,  rgba(0, 235, 255, 0.9));     // electric cyan tip
        // S-foils: pure hot magenta — maximum contrast against the cyan
        // wingtips they sit beside, and a vivid colour revealed in motion.
        const flapGrad = ctx.createLinearGradient(0, 0, r * 0.46, r * 0.22);
        flapGrad.addColorStop(0, rgba(255, 0, 140, 0.95));       // pure magenta
        flapGrad.addColorStop(1, rgba(190, 24, 255, 0.78));      // violet-magenta
        // Fuselage: a deep, cooler body so the blazing wings/flaps pop off it.
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

    // Paint a part: an opaque dark body + dark outline (source-over) gives
    // definition against bright nebulae; a neon spectral sheen + a bright
    // accent edge (lighter) supply the rainbow glow.
    const paint = (path, sheen, edge, edgeW, outlineW) => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(9, 6, 26, 0.97)';
        ctx.fill(path);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = outlineW;
        ctx.stroke(path);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = sheen;
        ctx.fill(path);
        if (edge) {
            ctx.strokeStyle = edge;
            ctx.lineWidth = edgeW;
            ctx.stroke(path);
        }
    };

    // ── Engine exhaust — spectral plume modulated by thrust ──
    // Idle: small warm-ish glow (ship stays visible). Thrusting: long bright
    // white→cyan→magenta plumes.
    const idlePulse = 0.4 + Math.sin(t * 4) * 0.1;
    const thrustPulse = 0.85 + Math.sin(t * 12) * 0.2;
    const engPulse = idlePulse + (thrustPulse - idlePulse) * thr;
    const qThr = Math.round(thr * 10) / 10;
    const qPulse = Math.round(engPulse * 10) / 10;
    ctx.globalCompositeOperation = 'lighter';
    for (let ei = 0; ei < engines.length; ei++) {
        const eng = engines[ei];
        const exhaustLen = r * (0.4 + thr * 1.25) * (0.8 + engPulse * 0.4);
        // Cache gradient, invalidating when quantized thrust or pulse changes.
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
    // Wings sweep back with speed and roll asymmetrically with bank; the
    // flaps fan aft with thrust. Right side drawn at scale +1, left at -1 —
    // the mirror flips the rotation sense so one path serves both wings.
    const sweepAng = -0.06 + sweep * 0.5 + breath * 0.05 * (1 - sweep);
    const flapAng = 0.15 + flapOpen * 0.7;
    for (let s = 1; s >= -1; s -= 2) {
        ctx.save();
        ctx.translate(parts.wingHinge.x * s, parts.wingHinge.y);
        ctx.scale(s, 1);
        ctx.rotate(sweepAng + s * bank * 0.22);
        paint(parts.wing, grads.wingGrad, rgba(255, 238, 90, 0.95), 1.3, 2.6);  // gold edge
        // S-foil flap, hinged near the wingtip (in wing-local space).
        ctx.save();
        ctx.translate(parts.flapHinge.x, parts.flapHinge.y);
        ctx.rotate(flapAng);
        paint(parts.flap, grads.flapGrad, rgba(255, 120, 220, 0.98), 1.1, 2.2);  // bright pink edge
        ctx.restore();
        ctx.restore();
    }

    // ── Fuselage — cyan outline contrasts the gold wing edges ──
    paint(parts.fuselage, grads.fuseGrad, rgba(120, 245, 255, 0.9), 1.3, 3.2);

    // ── Spine ridge — a bright hairline down the body ──
    ctx.globalCompositeOperation = 'lighter';
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
        // Two nozzle petals that fan apart with thrust.
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
        // Hot core glow — brightens with thrust.
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
        paint(parts.canard, rgba(255, 190, 0, 0.85), rgba(255, 248, 170, 0.95), 0.9, 1.8);
        ctx.restore();
    }

    // ── Cockpit canopy ──
    const cp = parts.cockpit;
    glowSpriteCache.draw(ctx, cp.x, cp.y, '#9fe8ff', cp.ry, 6, 0.6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grads.cockpitGrad;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, cp.rx, cp.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 245, 255, 0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, cp.rx, cp.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Sliding canopy glint — a moving highlight keeps the ship "alive".
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

    // ── Muzzle flash ────────────────────────────────────────────────────
    if (this._muzzleFlashTimer > 0) {
        const mfMax = this._muzzleFlashMax || 6;
        const mfAlpha = this._muzzleFlashTimer / mfMax;
        const mfProgress = 1 - mfAlpha;
        const mfIntensity = this._muzzleFlashIntensity || 1.0;
        const mfColor = this._muzzleFlashColor || '255, 220, 140';

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Large core flash at nose tip — bright burst visible from distance
        const coreR = r * (0.8 + mfIntensity * 0.6) * (1 - mfProgress * 0.4);
        const mfGrad = ctx.createRadialGradient(0, noseY, 0, 0, noseY, coreR);
        mfGrad.addColorStop(0, `rgba(255, 255, 255, ${mfAlpha * 1.0})`);
        mfGrad.addColorStop(0.3, `rgba(${mfColor}, ${mfAlpha * 0.8})`);
        mfGrad.addColorStop(0.7, `rgba(${mfColor}, ${mfAlpha * 0.3})`);
        mfGrad.addColorStop(1, `rgba(${mfColor}, 0)`);
        ctx.fillStyle = mfGrad;
        ctx.beginPath();
        ctx.arc(0, noseY, coreR, 0, Math.PI * 2);
        ctx.fill();

        // Forward flash streak — prominent cone in fire direction
        if (mfIntensity > 0.3) {
            const streakLen = r * (0.8 + mfIntensity * 0.8) * mfAlpha;
            const streakW = r * (0.15 + mfIntensity * 0.15) * mfAlpha;
            const streakGrad = ctx.createRadialGradient(0, noseY - streakLen * 0.3, 0, 0, noseY - streakLen * 0.3, streakLen * 0.6);
            streakGrad.addColorStop(0, `rgba(255, 255, 255, ${mfAlpha * 0.7})`);
            streakGrad.addColorStop(0.5, `rgba(${mfColor}, ${mfAlpha * 0.4})`);
            streakGrad.addColorStop(1, `rgba(${mfColor}, 0)`);
            ctx.fillStyle = streakGrad;
            ctx.beginPath();
            ctx.ellipse(0, noseY - streakLen * 0.3, streakW, streakLen, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Side flare spikes for heavy weapons
        if (mfIntensity > 0.8) {
            const spikeLen = r * 0.5 * mfAlpha;
            const spikeW = r * 0.06;
            ctx.fillStyle = `rgba(${mfColor}, ${mfAlpha * 0.5})`;
            ctx.beginPath();
            ctx.ellipse(-spikeLen * 0.5, noseY, spikeLen, spikeW, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(spikeLen * 0.5, noseY, spikeLen, spikeW, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        this._muzzleFlashTimer--;
    }

    // ── Hit flash — bright white burst on collision ──
    // Replaces the old static-silhouette overlay: the wings now articulate,
    // so a radial burst centred on the ship reads cleanly as "I got hit"
    // without having to re-trace the moving geometry.
    if (this._hitFlashTimer > 0) {
        const hfAlpha = Math.min(1, this._hitFlashTimer / 8);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const hf = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
        hf.addColorStop(0, `rgba(255, 255, 255, ${hfAlpha * 0.95})`);
        hf.addColorStop(0.6, `rgba(220, 245, 255, ${hfAlpha * 0.5})`);
        hf.addColorStop(1, 'rgba(200, 240, 255, 0)');
        ctx.fillStyle = hf;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Energy charge glow ──
    // The ship's body glow now reflects the ENERGY meter (the sphere next
    // to health). As energy regenerates the ship visibly "charges up": a
    // faint aura while building, a cyan "ready" ring once a power shot is
    // affordable, and a bright pulsing flash with sparks when the meter is
    // full. Power weapons fire by spending this energy.
    {
        const maxE = this.maxEnergy || 100;
        const e = this.energy || 0;
        if (e > 0) {
            const cost = this.getPowerEnergyCost ? this.getPowerEnergyCost() : 30;
            const progress = Math.min(1, e / maxE);
            drawChargingGlowCore.call(this, ctx, progress, e >= cost, e >= maxE * 0.999, Date.now());
        }
    }

    // Draw level up animation effects
    if (this.levelUpAnimation.active) {
        this.drawLevelUpEffects(ctx);
    }

    // Draw cooldown timer at ship tip
    this.drawCooldownTimer(ctx);

    ctx.restore();
}

// ── Charging effects ──────────────────────────────────────────────────────
//
// Two entry points share one rendering core so every power weapon shows a
// matching "building up" body-glow:
//   • drawChargingEffects        — charge-based weapons (CHARGE_SHOT). The
//     glow tracks held-button charge time vs maxChargeTime.
//   • drawCooldownChargingEffects — cooldown-based weapons (Mine Layer,
//     Nova, Lightning, Missiles). The glow fills as powerCooldown elapses,
//     reaching the fully-charged state when the weapon is ready to fire.

export function drawChargingEffects(ctx) {
    const now = Date.now();
    const chargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;

    const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
    const reducedMaxChargeTime = this.maxChargeTime - (chargeSpeedStacks * 1000);
    const reducedMinChargeTime = this.minChargeTime - (chargeSpeedStacks * 1000);

    const progress = Math.min(1, chargeTime / reducedMaxChargeTime);
    const isBasic = chargeTime >= reducedMinChargeTime;
    const isFull = !!this.isFullyCharged;

    drawChargingGlowCore.call(this, ctx, progress, isBasic, isFull, now);
}

export function drawCooldownChargingEffects(ctx) {
    const cfg = this.getActivePowerConfig?.();
    const max = this.powerCooldownMax || (cfg && cfg.cooldown) || 1;
    const remaining = Math.max(0, this.powerCooldown || 0);
    const progress = 1 - Math.min(1, remaining / max);
    // Match the cooldown-timer ring: "basic" once a meaningful chunk of
    // cooldown has elapsed, "full" only when the weapon is actually ready.
    const isBasic = progress >= 0.6;
    const isFull = remaining <= 0;

    drawChargingGlowCore.call(this, ctx, progress, isBasic, isFull, Date.now());
}

function drawChargingGlowCore(ctx, progress, isBasic, isFull, now) {
    let pulseSpeed, pulseIntensity;
    if (isFull) {
        pulseSpeed = 0.08;
        pulseIntensity = 0.6 + Math.sin(now * pulseSpeed) * 0.4;
    } else if (isBasic) {
        pulseSpeed = 0.03;
        pulseIntensity = 0.3 + Math.sin(now * pulseSpeed) * 0.2;
    } else {
        pulseSpeed = 0.02;
        pulseIntensity = 0.3 + Math.sin(now * pulseSpeed) * 0.2;
    }

    const glowRadius = this.radius * (2 + progress * 1.5);
    const glowAlpha = pulseIntensity * (0.3 + progress * 0.4);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const gradient = ctx.createRadialGradient(0, 0, this.radius * 0.5, 0, 0, glowRadius);

    if (isFull) {
        gradient.addColorStop(0,   rgba(255, 255, 255, glowAlpha * 1.0));
        gradient.addColorStop(0.2, rgba(0, 255, 255, glowAlpha * 0.9));
        gradient.addColorStop(0.5, rgba(100, 220, 255, glowAlpha * 0.7));
        gradient.addColorStop(0.8, rgba(150, 240, 255, glowAlpha * 0.4));
        gradient.addColorStop(1,   `rgba(200, 250, 255, 0)`);
    } else if (isBasic) {
        gradient.addColorStop(0,   rgba(0, 255, 255, glowAlpha * 0.8));
        gradient.addColorStop(0.3, rgba(100, 200, 255, glowAlpha * 0.6));
        gradient.addColorStop(0.7, rgba(150, 220, 255, glowAlpha * 0.3));
        gradient.addColorStop(1,   `rgba(200, 240, 255, 0)`);
    } else {
        gradient.addColorStop(0,   rgba(100, 150, 255, glowAlpha * 0.6));
        gradient.addColorStop(0.4, rgba(120, 180, 255, glowAlpha * 0.4));
        gradient.addColorStop(0.8, rgba(140, 200, 255, glowAlpha * 0.2));
        gradient.addColorStop(1,   `rgba(160, 220, 255, 0)`);
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    if (isBasic) {
        const ringRadius = this.radius * (1.2 + progress * 0.5);
        const ringAlpha = pulseIntensity * (0.5 + progress * 0.3);

        ctx.strokeStyle = rgba(0, 255, 255, ringAlpha);
        ctx.lineWidth = 2 + progress * 2;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        if (progress > 0.8) {
            ctx.strokeStyle = rgba(255, 255, 255, pulseIntensity * 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius * 1.1, 0, Math.PI * 2);
            ctx.stroke();

            const sparkCount = Math.floor(progress * 8);
            for (let i = 0; i < sparkCount; i++) {
                const angle = (i / sparkCount) * Math.PI * 2 + (now * 0.01);
                const sparkRadius = ringRadius * (1.1 + Math.sin(now * 0.02 + i) * 0.1);
                const sparkX = Math.cos(angle) * sparkRadius;
                const sparkY = Math.sin(angle) * sparkRadius;

                ctx.fillStyle = rgba(255, 255, 255, pulseIntensity * 0.8);
                ctx.beginPath();
                ctx.arc(sparkX, sparkY, 1 + Math.sin(now * 0.03 + i) * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    ctx.restore();
}

// ── Level up effects ──────────────────────────────────────────────────────

export function drawLevelUpEffects(ctx) {
    const now = Date.now();
    const elapsed = now - this.levelUpAnimation.startTime;
    const progress = elapsed / this.levelUpAnimation.duration;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Pulsing golden glow around player
    const pulseSpeed = 0.1;
    const pulseIntensity = 0.8 + Math.sin(now * pulseSpeed) * 0.2;

    // Expanding golden aura
    const auraRadius = this.radius * (2 + progress * 3); // Expands over time
    const auraAlpha = (1 - progress) * pulseIntensity * 0.6; // Fades over time

    const gradient = ctx.createRadialGradient(0, 0, this.radius * 0.5, 0, 0, auraRadius);
    gradient.addColorStop(0, rgba(255, 215, 0, auraAlpha)); // Gold center
    gradient.addColorStop(0.3, rgba(255, 165, 0, auraAlpha * 0.8)); // Orange
    gradient.addColorStop(0.6, rgba(255, 255, 0, auraAlpha * 0.6)); // Yellow
    gradient.addColorStop(1, `rgba(255, 255, 255, 0)`); // Transparent edge

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // Rotating energy rings
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
        const ringRadius = this.radius * (1.5 + i * 0.5 + progress * 2);
        const ringAlpha = (1 - progress) * pulseIntensity * (0.8 - i * 0.2);
        const rotation = (now * 0.005 + i * Math.PI / 3) % (Math.PI * 2);

        ctx.strokeStyle = rgba(255, 215, 0, ringAlpha);
        ctx.lineWidth = 2 + i;
        ctx.setLineDash([10, 5]);
        ctx.lineDashOffset = rotation * 10;

        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Reset line dash
    ctx.setLineDash([]);

    // Bright center flash
    if (progress < 0.3) {
        const flashAlpha = (0.3 - progress) / 0.3 * pulseIntensity;
        ctx.fillStyle = rgba(255, 255, 255, flashAlpha);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // Store level up text info for game engine to draw in screen coordinates
    this.levelUpTextInfo = {
        level: this.level,
        progress: progress,
        active: true
    };

    // 6.148.0 — self-expire once the window elapses (the old per-frame tick
    // that cleared this was removed in 6.0.0; without this the aura + wavy
    // text would latch on forever after the re-wired trigger fires).
    if (progress >= 1) {
        this.levelUpAnimation.active = false;
        this.levelUpTextInfo.active = false;
    }
}

// ── Cooldown timer ────────────────────────────────────────────────────────

export function drawCooldownTimer(ctx) {
    // Ship-tip ENERGY ring — mirrors the HUD energy SPHERE (hud/status.js
    // drawEnergySphere). A little glass orb at the nose that fills from the
    // centre outward as the ship's power energy regenerates, tinted by the
    // active primary weapon's colour, and pulses a gold rim once a power
    // shot is affordable. (Previously showed the defense-ability cooldown.)
    const maxE = this.maxEnergy || 100;
    const frac = Math.max(0, Math.min(1, (this.energy || 0) / maxE));

    // Tint by the active primary weapon colour, like the HUD sphere.
    const cfg = this.getActivePrimaryConfig?.();
    let h = ((cfg && cfg.color) || '#00ccff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const cr = parseInt(h.slice(0, 2), 16) || 0;
    const cg = parseInt(h.slice(2, 4), 16) || 0;
    const cb = parseInt(h.slice(4, 6), 16) || 0;

    const tipX = 0;
    const tipY = -this.radius - 14;
    const orbR = 7;
    const now = Date.now();

    ctx.save();
    // Draw opaque, not additively, so the glass orb reads as a solid gauge.
    ctx.globalCompositeOperation = 'source-over';

    // Dark glass backdrop.
    ctx.beginPath();
    ctx.arc(tipX, tipY, orbR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
    ctx.fill();

    // Inner condensate — clipped to the glass, fills centre-outward.
    if (frac > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(tipX, tipY, orbR - 1, 0, Math.PI * 2);
        ctx.clip();
        const coreR = Math.max(1, orbR * frac);
        const grad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, coreR);
        grad.addColorStop(0,   `rgba(255,255,255,${0.8 * frac + 0.2})`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.85)`);
        grad.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(tipX - orbR, tipY - orbR, orbR * 2, orbR * 2);
        ctx.restore();
    }

    // Glass rim + specular highlight.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(tipX, tipY, orbR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tipX - orbR * 0.32, tipY - orbR * 0.34, orbR * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    // Ready pulse — gold rim once a power shot is affordable.
    const cost = (typeof this.getPowerEnergyCost === 'function') ? this.getPowerEnergyCost() : 30;
    if ((this.energy || 0) >= cost) {
        const pulse = 0.4 + 0.3 * Math.sin(now * 0.012);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255, 240, 160, ${pulse})`;
        ctx.beginPath();
        ctx.arc(tipX, tipY, orbR + 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

// ── Charge beam particles ─────────────────────────────────────────────────

export function spawnChargeBeamParticles(particlePool) {
    // Re-enabled charge beam particles - only when player can shoot
    if (!particlePool) return;
    // Spawn blue energy particles around the player that get drawn in
    const particleCount = 2 + Math.random() * 3; // 2-5 particles (reasonable amount)

    // Calculate player speed to adjust particle spawn pattern
    const playerSpeed = Math.hypot(this.vel.x, this.vel.y);
    const movementAngle = Math.atan2(this.vel.y, this.vel.x);

    for (let i = 0; i < particleCount; i++) {
        // Spawn particles in a pattern that accounts for player movement
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 60; // 40-100 pixels away (much closer)

        // Offset spawn position based on player velocity to create centered effect
        const velocityOffset = playerSpeed * 2; // Adjust multiplier as needed
        const offsetX = Math.cos(movementAngle) * velocityOffset;
        const offsetY = Math.sin(movementAngle) * velocityOffset;

        const startX = this.x + Math.cos(angle) * distance + offsetX;
        const startY = this.y + Math.sin(angle) * distance + offsetY;

        // Create particle that moves toward current player position (dynamic tracking handles movement)
        const particle = particlePool.get(startX, startY, 'spawnParticle', this.x, this.y, this);
        if (particle) {
            // Blue energy colors
            const hue = 200 + Math.random() * 40; // Blue to cyan range
            const lightness = 60 + Math.random() * 30; // 60-90% lightness
            particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
            particle.radius = 1.5 + Math.random() * 2; // Small energy particles

            // Add some sparkle effect
            if (Math.random() < 0.3) {
                particle.color = '#FFFFFF'; // Some white sparkles
                particle.radius *= 0.7;
            }
        }
    }
}
