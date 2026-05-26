// Player rendering — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.
//
// 6.157.0 — Ship-skin system. The HULL is now drawn by the active skin
// module (js/modules/player/skins/), selected by `this.skinId`. This
// file owns the shared, skin-agnostic layers: the per-frame transform
// (translate/rotate, invincibility blink, engine-startup shudder,
// airframe bank-lean) and the feedback FX that every skin shares —
// muzzle flash, hit flash, energy charge glow, level-up aura, and the
// ship-tip cooldown orb. Skins never touch gameplay; they only paint.

import { rgba } from '../core/color-cache.js';
import { frameClock } from '../core/frame-clock.js';
import { drawShipShape, SHIP_PALETTE_MAGENTA } from '../render/shapes.js';
import { getSkin } from './skins/index.js';

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
// @param {CanvasRenderingContext2D} ctx
// @param {number} x          world x
// @param {number} y          world y
// @param {number} angle      aim angle in radians
// @param {number} [radius]   ship radius (defaults to local-player 12 px)
export function drawRemoteShip(ctx, x, y, angle, radius = 12) {
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
    const skin = getSkin(this.skinId);
    const noseY = r * (typeof skin.noseY === 'number' ? skin.noseY : -1.18);

    // ── Engine startup shudder (generic) ──
    // Brief mechanical vibration when engines re-engage after idle.
    if (this.engineStartup > 0) {
        const shudder = this.engineStartup * 2.2;
        ctx.translate(Math.sin(t * 65) * shudder, Math.cos(t * 85) * shudder * 0.7);
    }

    // ── Airframe bank-lean (generic; per-skin shear amount) ──
    // Lean the whole airframe into the bank — a gentle shear, like a bird
    // tipping through a turn. Skins can dial this down (e.g. a saucer) via
    // their `bankShear` field.
    const shear = typeof skin.bankShear === 'number' ? skin.bankShear : 0.12;
    if (shear) ctx.transform(1, 0, (this.bank || 0) * shear, 1, 0, 0);

    // ── Hull (active skin) ──
    skin.paint.call(this, ctx, r, t);

    // ── Shared feedback FX (run for every skin) ──
    drawMuzzleFlash.call(this, ctx, r, noseY);
    drawHitFlash.call(this, ctx, r);
    drawEnergyChargeGlow.call(this, ctx);
    drawCoPilotDashGlow.call(this, ctx, r);

    if (this.levelUpAnimation && this.levelUpAnimation.active) {
        this.drawLevelUpEffects(ctx);
    }

    // Draw cooldown timer at ship tip
    this.drawCooldownTimer(ctx);

    ctx.restore();
}

// ── FB-2: AI Co-Pilot auto-dodge cue ─────────────────────────────────
// A subtle cyan aura around the hull while the ship is mid-dash on a
// Co-Pilot-driven auto-dodge (player._coPilotDashActive, set in
// _triggerDash's assist branch). Makes the automation legible for desktop
// / gamepad Co-Pilot players, who — unlike mobile (MB-2 haptic) — get no
// other auto-dodge feedback. Default-safe: renders only when BOTH the dash
// burst is active AND it was Co-Pilot-driven, so manual dashes are unmarked
// and non-Co-Pilot play is byte-for-byte unchanged. The cyan matches the
// FB-1 auto-cast toast for a consistent "the Co-Pilot did this" colour.
function drawCoPilotDashGlow(ctx, r) {
    if (!this.isDashing || !this._coPilotDashActive) return;
    const t = frameClock.now * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(t * 22);
    const alpha = 0.22 + 0.16 * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(95, 208, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(95, 208, 255, 0.9)';
    ctx.shadowBlur = 10 + 6 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// ── Muzzle flash ────────────────────────────────────────────────────
// Bright burst at the ship's nose when a shot leaves. Anchored at the
// skin-provided `noseY` so it lines up on any hull.
function drawMuzzleFlash(ctx, r, noseY) {
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
}

// ── Hit flash — bright white burst on collision ──
// A radial burst centred on the ship reads cleanly as "I got hit" without
// having to re-trace whatever (possibly moving) geometry the skin drew.
function drawHitFlash(ctx, r) {
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
}

// ── Energy charge glow ──
// The ship's body glow reflects the ENERGY meter (the sphere next to
// health). As energy regenerates the ship visibly "charges up".
function drawEnergyChargeGlow(ctx) {
    const maxE = this.maxEnergy || 100;
    const e = this.energy || 0;
    if (e > 0) {
        const cost = this.getPowerEnergyCost ? this.getPowerEnergyCost() : 30;
        const progress = Math.min(1, e / maxE);
        drawChargingGlowCore.call(this, ctx, progress, e >= cost, e >= maxE * 0.999, Date.now());
    }
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
    // shot is affordable.
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
