// Player rendering — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { glowSpriteCache } from '../core/utils.js';
import { rgba } from '../core/color-cache.js';
import { frameClock } from '../core/frame-clock.js';

// ── Main draw ─────────────────────────────────────────────────────────────

export function draw(ctx) {
    if (!this.active) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    // Flash effect during invincibility
    if (this.invincible) {
        const flash = Math.sin(frameClock.now * 0.02) > 0;
        ctx.globalAlpha = flash ? 0.35 : 0.85;
    }

    // Hit flash — brief white tint on collision
    if (this._hitFlashTimer > 0) {
        this._hitFlashTimer--;
    }

    ctx.globalCompositeOperation = 'lighter';

    const r = this.radius;
    const t = frameClock.now * 0.001;

    // 5.78.0 — crit-rush ring (Q1). Lands on every crit; shrinks as the
    // 800 ms boost window decays, giving the player a quick read on
    // "is my fire-rate buff still active". Yellow pulse, draws inside
    // the player transform but is rotation-invariant (full circle).
    if (this._critRushUntil) {
        const remain = this._critRushUntil - Date.now();
        if (remain > 0) {
            const frac = remain / 800;
            const ringR = r * (1.85 + (1 - frac) * 0.6);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255, 230, 80, ${0.25 + 0.5 * frac})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── Engine startup shudder ──────────────────────────────────────────
    // Brief mechanical vibration when engines re-engage after idle.
    if (this.engineStartup > 0) {
        const shudder = this.engineStartup * 2.2;
        const sx = Math.sin(t * 65) * shudder;
        const sy = Math.cos(t * 85) * shudder * 0.7;
        ctx.translate(sx, sy);
    }

    // ── Engine exhaust — modulated by thrust level ──────────────────────
    // Idle: small warm glow (ship stays visible). Thrusting: long bright plumes.
    const thr = this.thrustLevel;
    const idlePulse = 0.35 + Math.sin(t * 4) * 0.1;   // visible idle glow
    const thrustPulse = 0.8 + Math.sin(t * 12) * 0.2;  // intense thrust flicker
    const engPulse = idlePulse + (thrustPulse - idlePulse) * thr;

    const engines = [
        { x:  r * 0.42, y: r * 0.78 },
        { x: -r * 0.42, y: r * 0.78 },
    ];
    // Quantize thrustLevel to nearest 0.1 for gradient caching
    const qThr = Math.round(thr * 10) / 10;
    const qPulse = Math.round(engPulse * 10) / 10;
    for (let ei = 0; ei < engines.length; ei++) {
        const eng = engines[ei];
        // Exhaust length: short warm stub at idle → long plume when thrusting
        const exhaustLen = r * (0.45 + thr * 1.1) * (0.8 + engPulse * 0.4);
        // Cache gradient, invalidating when quantized thrust or pulse changes
        const cacheSlot = this._engineGradCache || (this._engineGradCache = [{}, {}]);
        const cache = cacheSlot[ei];
        if (cache.qThr !== qThr || cache.qPulse !== qPulse || cache.r !== r) {
            const qExhaustLen = r * (0.45 + qThr * 1.1) * (0.8 + qPulse * 0.4);
            const grad = ctx.createLinearGradient(eng.x, eng.y, eng.x, eng.y + qExhaustLen);
            grad.addColorStop(0,   rgba(255, 220, 120, 0.9 * qPulse));
            grad.addColorStop(0.35, rgba(255, 80, 10, 0.6 * qPulse));
            grad.addColorStop(1,   'transparent');
            cache.grad = grad;
            cache.qThr = qThr;
            cache.qPulse = qPulse;
            cache.r = r;
        }
        ctx.fillStyle = cache.grad;
        const glowIntensity = 0.4 + thr * 0.5;
        glowSpriteCache.draw(ctx, eng.x, eng.y + exhaustLen * 0.5, '#ff8800', r * 0.12, 6, glowIntensity * engPulse);
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y + exhaustLen * 0.5, r * 0.12, exhaustLen * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Black silhouette outline pass (5.79.0) ────────────────────────────
    // Drawn FIRST in source-over so the subsequent 'lighter' fills don't
    // erase the outline. Wraps every major piece (wings, tips, hull,
    // engine pods, cockpit) in a thick black stroke for visual definition
    // against bright nebulae.
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    // Right wing
    ctx.beginPath();
    ctx.moveTo( r * 0.32, -r * 0.18); ctx.lineTo( r * 1.12,  r * 0.28);
    ctx.lineTo( r * 0.82,  r * 0.68); ctx.lineTo( r * 0.28,  r * 0.58);
    ctx.closePath(); ctx.stroke();
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.18); ctx.lineTo(-r * 1.12,  r * 0.28);
    ctx.lineTo(-r * 0.82,  r * 0.68); ctx.lineTo(-r * 0.28,  r * 0.58);
    ctx.closePath(); ctx.stroke();
    // Right tip
    ctx.beginPath();
    ctx.moveTo( r * 1.12,  r * 0.28); ctx.lineTo( r * 1.42,  r * 0.08);
    ctx.lineTo( r * 1.18,  r * 0.56); ctx.lineTo( r * 0.82,  r * 0.68);
    ctx.closePath(); ctx.stroke();
    // Left tip
    ctx.beginPath();
    ctx.moveTo(-r * 1.12,  r * 0.28); ctx.lineTo(-r * 1.42,  r * 0.08);
    ctx.lineTo(-r * 1.18,  r * 0.56); ctx.lineTo(-r * 0.82,  r * 0.68);
    ctx.closePath(); ctx.stroke();
    // Central hull
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo( r * 0.32, -r * 0.18);
    ctx.lineTo( r * 0.28,  r * 0.58);
    ctx.lineTo(0,           r * 0.38);
    ctx.lineTo(-r * 0.28,  r * 0.58);
    ctx.lineTo(-r * 0.32, -r * 0.18);
    ctx.closePath(); ctx.stroke();
    // Engine pods
    ctx.lineWidth = 2.6;
    for (const eng of engines) {
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Cockpit
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.17, r * 0.21, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // ── Primary swept wings ───────────────────────────────────────────────
    // OPT-2: live GPU blur removed — stroke provides sufficient wing edge glow
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 90, 180, 0.45)';
    ctx.strokeStyle = '#0088ff';
    ctx.lineWidth = 1.6;
    // Right wing
    ctx.beginPath();
    ctx.moveTo( r * 0.32, -r * 0.18);
    ctx.lineTo( r * 1.12,  r * 0.28);
    ctx.lineTo( r * 0.82,  r * 0.68);
    ctx.lineTo( r * 0.28,  r * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.18);
    ctx.lineTo(-r * 1.12,  r * 0.28);
    ctx.lineTo(-r * 0.82,  r * 0.68);
    ctx.lineTo(-r * 0.28,  r * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Wing tip extensions ───────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0, 160, 255, 0.25)';
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 1.1;
    // Right tip
    ctx.beginPath();
    ctx.moveTo( r * 1.12,  r * 0.28);
    ctx.lineTo( r * 1.42,  r * 0.08);
    ctx.lineTo( r * 1.18,  r * 0.56);
    ctx.lineTo( r * 0.82,  r * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Left tip
    ctx.beginPath();
    ctx.moveTo(-r * 1.12,  r * 0.28);
    ctx.lineTo(-r * 1.42,  r * 0.08);
    ctx.lineTo(-r * 1.18,  r * 0.56);
    ctx.lineTo(-r * 0.82,  r * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Central hull ─────────────────────────────────────────────────────
    // OPT-2: live GPU blur removed — stroke provides hull edge glow
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 25, 55, 0.92)';
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);               // nose tip
    ctx.lineTo( r * 0.32, -r * 0.18); // upper-right
    ctx.lineTo( r * 0.28,  r * 0.58); // lower-right
    ctx.lineTo(0,           r * 0.38); // tail notch
    ctx.lineTo(-r * 0.28,  r * 0.58); // lower-left
    ctx.lineTo(-r * 0.32, -r * 0.18); // upper-left
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Hull panel detail lines ───────────────────────────────────────────
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.75); ctx.lineTo(0, r * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( r * 0.14, -r * 0.45); ctx.lineTo( r * 0.24, r * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.14, -r * 0.45); ctx.lineTo(-r * 0.24, r * 0.28); ctx.stroke();

    // ── Engine pod rings ──────────────────────────────────────────────────
    for (const eng of engines) {
        ctx.fillStyle = '#001530';
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 1.2;
        // OPT-2: pre-rendered glow sprite replaces live GPU blur
        glowSpriteCache.draw(ctx, eng.x, eng.y, '#0088ff', r * 0.13, 5, 0.9);
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.ellipse(eng.x, eng.y, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // ── Cockpit ───────────────────────────────────────────────────────────
    // OPT-2: pre-rendered glow sprite replaces live GPU blur
    glowSpriteCache.draw(ctx, 0, -r * 0.42, '#aaeeff', r * 0.21, 7, 0.7);
    ctx.shadowBlur = 0;
    const cpGrad = ctx.createRadialGradient(0, -r * 0.42, 0, 0, -r * 0.42, r * 0.21);
    cpGrad.addColorStop(0,   'rgba(160, 235, 255, 0.95)');
    cpGrad.addColorStop(0.55,'rgba(0, 110, 200, 0.75)');
    cpGrad.addColorStop(1,   'rgba(0, 50, 110, 0.25)');
    ctx.fillStyle = cpGrad;
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.6)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.42, r * 0.17, r * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ── Nose glow ─────────────────────────────────────────────────────────
    // OPT-2: pre-rendered glow sprite replaces live GPU blur
    glowSpriteCache.draw(ctx, 0, -r, '#ffffff', r * 0.075, 12, 0.9);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200, 245, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(0, -r, r * 0.075, 0, Math.PI * 2);
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
        const mfGrad = ctx.createRadialGradient(0, -r, 0, 0, -r, coreR);
        mfGrad.addColorStop(0, `rgba(255, 255, 255, ${mfAlpha * 1.0})`);
        mfGrad.addColorStop(0.3, `rgba(${mfColor}, ${mfAlpha * 0.8})`);
        mfGrad.addColorStop(0.7, `rgba(${mfColor}, ${mfAlpha * 0.3})`);
        mfGrad.addColorStop(1, `rgba(${mfColor}, 0)`);
        ctx.fillStyle = mfGrad;
        ctx.beginPath();
        ctx.arc(0, -r, coreR, 0, Math.PI * 2);
        ctx.fill();

        // Forward flash streak — prominent cone in fire direction
        if (mfIntensity > 0.3) {
            const streakLen = r * (0.8 + mfIntensity * 0.8) * mfAlpha;
            const streakW = r * (0.15 + mfIntensity * 0.15) * mfAlpha;
            const streakGrad = ctx.createRadialGradient(0, -r - streakLen * 0.3, 0, 0, -r - streakLen * 0.3, streakLen * 0.6);
            streakGrad.addColorStop(0, `rgba(255, 255, 255, ${mfAlpha * 0.7})`);
            streakGrad.addColorStop(0.5, `rgba(${mfColor}, ${mfAlpha * 0.4})`);
            streakGrad.addColorStop(1, `rgba(${mfColor}, 0)`);
            ctx.fillStyle = streakGrad;
            ctx.beginPath();
            ctx.ellipse(0, -r - streakLen * 0.3, streakW, streakLen, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Side flare spikes for heavy weapons
        if (mfIntensity > 0.8) {
            const spikeLen = r * 0.5 * mfAlpha;
            const spikeW = r * 0.06;
            ctx.fillStyle = `rgba(${mfColor}, ${mfAlpha * 0.5})`;
            // Left spike
            ctx.beginPath();
            ctx.ellipse(-spikeLen * 0.5, -r, spikeLen, spikeW, 0, 0, Math.PI * 2);
            ctx.fill();
            // Right spike
            ctx.beginPath();
            ctx.ellipse(spikeLen * 0.5, -r, spikeLen, spikeW, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        this._muzzleFlashTimer--;
    }

    // ── Hull outline glow ────────────────────────────────────────────────
    // Full ship silhouette stroke for visibility against dark backgrounds.
    // Dims with idle engines but stays visible; brightens with thrust.
    const outlineAlpha = 0.3 + thr * 0.3;
    ctx.strokeStyle = `rgba(0, 180, 255, ${outlineAlpha})`;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo( r * 0.32, -r * 0.18);
    ctx.lineTo( r * 1.12,  r * 0.28);
    ctx.lineTo( r * 1.42,  r * 0.08);
    ctx.lineTo( r * 1.18,  r * 0.56);
    ctx.lineTo( r * 0.82,  r * 0.68);
    ctx.lineTo( r * 0.42,  r * 0.78);
    ctx.lineTo( r * 0.28,  r * 0.58);
    ctx.lineTo(0,           r * 0.38);
    ctx.lineTo(-r * 0.28,  r * 0.58);
    ctx.lineTo(-r * 0.42,  r * 0.78);
    ctx.lineTo(-r * 0.82,  r * 0.68);
    ctx.lineTo(-r * 1.18,  r * 0.56);
    ctx.lineTo(-r * 1.42,  r * 0.08);
    ctx.lineTo(-r * 1.12,  r * 0.28);
    ctx.lineTo(-r * 0.32, -r * 0.18);
    ctx.closePath();
    ctx.stroke();

    // ── Hit flash overlay — redraw hull as white silhouette ─────────────
    if (this._hitFlashTimer > 0) {
        const hfAlpha = Math.min(1, this._hitFlashTimer / 8);
        ctx.globalAlpha = hfAlpha;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo( r * 0.32, -r * 0.18);
        ctx.lineTo( r * 1.12,  r * 0.28);
        ctx.lineTo( r * 1.42,  r * 0.08);
        ctx.lineTo( r * 1.18,  r * 0.56);
        ctx.lineTo( r * 0.82,  r * 0.68);
        ctx.lineTo( r * 0.42,  r * 0.78);
        ctx.lineTo( r * 0.28,  r * 0.58);
        ctx.lineTo(0,           r * 0.38);
        ctx.lineTo(-r * 0.28,  r * 0.58);
        ctx.lineTo(-r * 0.42,  r * 0.78);
        ctx.lineTo(-r * 0.82,  r * 0.68);
        ctx.lineTo(-r * 1.18,  r * 0.56);
        ctx.lineTo(-r * 1.42,  r * 0.08);
        ctx.lineTo(-r * 1.12,  r * 0.28);
        ctx.lineTo(-r * 0.32, -r * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Draw charging effects for any power weapon. Charge-based weapons
    // glow only while the player is actively holding the charge button.
    // Cooldown-based weapons (Mine Layer, Nova Blast, Lightning Arc,
    // Missile Salvo) glow CONTINUOUSLY — building up as their cooldown
    // elapses, then sustaining the bright fully-charged flash while the
    // weapon is ready to fire (powerCooldown === 0). This matches the
    // charge shot's "fully charged" visual: the bright pulsing ring
    // never disappears — it just stays at peak intensity until the
    // player fires, then the cycle restarts.
    {
        const cfg = this.getActivePowerConfig?.();
        const isChargeBased = !!(cfg && cfg.isChargeBased);
        if (isChargeBased) {
            if (this.isCharging) this.drawChargingEffects(ctx);
        } else if (cfg) {
            this.drawCooldownChargingEffects(ctx);
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
}

// ── Cooldown timer ────────────────────────────────────────────────────────

export function drawCooldownTimer(ctx) {
    // Universal power-weapon readiness ring — used for both:
    //   • Charge-based weapons (CHARGE_SHOT) — `charge` from chargeLevel
    //     while the player is holding right-click / Space.
    //   • Cooldown-based weapons (Mine Layer, Nova, Lightning, Missiles)
    //     — `charge` is `1 - powerCooldown/powerCooldownMax`. The ring
    //     fills as the cooldown elapses, then pulses fully-charged when
    //     the weapon is ready to fire again.
    const cfg = this.getActivePowerConfig?.();
    const isChargeBased = !!(cfg && cfg.isChargeBased);

    let charge = 0;
    let isFullyCharged = false;
    let visible = false;

    if (isChargeBased) {
        if (!this.isCharging) return;
        charge = this.chargeLevel;
        isFullyCharged = !!this.isFullyCharged;
        visible = true;
    } else {
        const max = this.powerCooldownMax || (cfg && cfg.cooldown) || 1;
        const remaining = Math.max(0, this.powerCooldown || 0);
        charge = 1 - Math.min(1, remaining / max);
        isFullyCharged = remaining <= 0;
        visible = true; // always show readiness for cooldown-based powers
    }
    if (!visible) return;

    const tipX = 0;
    const tipY = -this.radius - 14;
    const timerRadius = 8;

    ctx.save();

    // Background circle
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tipX, tipY, timerRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Charge arc — blue to cyan to white as it fills
    if (charge > 0 || isFullyCharged) {
        const startAngle = -Math.PI / 2;
        const endAngle = isFullyCharged
            ? startAngle + Math.PI * 2 // full ring when ready
            : startAngle + (charge * Math.PI * 2);

        if (isFullyCharged) {
            // Pulsing white/cyan when fully charged / ready
            const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
            ctx.strokeStyle = `rgba(200, 255, 255, ${pulse})`;
            ctx.lineWidth = 4;
        } else {
            // Blue to cyan gradient as charge builds
            const r = Math.floor(100 + charge * 155);
            const g = Math.floor(180 + charge * 75);
            ctx.strokeStyle = `rgb(${r}, ${g}, 255)`;
            ctx.lineWidth = 3;
        }
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(tipX, tipY, timerRadius, startAngle, endAngle);
        ctx.stroke();

        // Center dot when fully charged
        if (isFullyCharged) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
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
