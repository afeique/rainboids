// HUD cursor rendering — crosshairs, targeting cursor, jitter circle, ammo ring.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { PRIMARY_WEAPONS } from '../combat/weapon-data.js';
import { GAME_CONFIG, GAME_STATES } from '../core/constants.js';
// 5.95.1 — Mobile mode disables the laser-pointer aim trace (replaced by
// the touch-position reticle drawn in mobile-reticle.js). Desktop and
// touchscreen-laptops still get the full laser trace.
import { isMobile } from '../platform/platform-detect.js';

export function drawCustomCursor() {
        if (!this.cursor.x && !this.cursor.y) return; // Don't draw if no mouse position

        const ctx = this.ctx;
        ctx.save();

        if (this.cursor.isOverTarget) {
            // Red targeting cursor (like the original asteroid-hover)
            this.drawRedTargetingCursor(ctx, this.cursor.x, this.cursor.y);
        } else {
            // Default cyan crosshair (like the original canvas cursor)
            this.drawDefaultCrosshair(ctx, this.cursor.x, this.cursor.y);
        }

        ctx.restore();
}

export function drawDefaultCrosshair(ctx, x, y) {
        // Original cyan crosshair design
        const color = '#00ffff';
        const size = 12;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Cross lines
        ctx.beginPath();
        // Vertical line (top)
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y - 21);
        // Vertical line (bottom)
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x, y + 21);
        // Horizontal line (left)
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 21, y);
        // Horizontal line (right)
        ctx.moveTo(x + 7, y);
        ctx.lineTo(x + 21, y);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
}

export function drawRedTargetingCursor(ctx, x, y) {
        // Red targeting cursor design (like original asteroid-hover)
        const color = '#ff0000';
        const size = 12;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Inner targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // Targeting lines (like crosshairs but with gaps)
        ctx.beginPath();
        // Top
        ctx.moveTo(x, y - size - 5);
        ctx.lineTo(x, y - size - 12);
        // Bottom
        ctx.moveTo(x, y + size + 5);
        ctx.lineTo(x, y + size + 12);
        // Left
        ctx.moveTo(x - size - 5, y);
        ctx.lineTo(x - size - 12, y);
        // Right
        ctx.moveTo(x + size + 5, y);
        ctx.lineTo(x + size + 12, y);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
}

export function drawJitterCircle() {
        const input = this.inputHandler.getInput();
        const intensity = this.player.shootingIntensity || 0;

        // Initialize fade tracking if needed
        if (!this.jitterCircleFade) {
            this.jitterCircleFade = {
                visible: false,
                alpha: 0,
                targetAlpha: 0
            };
        }

        // Update target alpha based on shooting intensity
        if (intensity > 0) {
            this.jitterCircleFade.targetAlpha = Math.min(0.4, 0.1 + intensity * 0.3); // Fade to 0.1-0.4 alpha
            this.jitterCircleFade.visible = true;
        } else {
            this.jitterCircleFade.targetAlpha = 0;
        }

        // Smooth fade transition with gentle fade-out (60fps assumed, ~16ms per frame)
        if (this.jitterCircleFade.alpha < this.jitterCircleFade.targetAlpha) {
            // Fade-in: moderate speed
            const fadeInSpeed = 0.08;
            this.jitterCircleFade.alpha = Math.min(this.jitterCircleFade.targetAlpha,
                this.jitterCircleFade.alpha + fadeInSpeed);
        } else if (this.jitterCircleFade.alpha > this.jitterCircleFade.targetAlpha) {
            // Fade-out: gentle, non-linear fade using easing
            const fadeOutSpeed = 0.04; // Slower base speed for gentler fade
            const alphaRatio = this.jitterCircleFade.alpha / 0.4; // Normalize to 0-1 range
            const easedSpeed = fadeOutSpeed * (0.3 + 0.7 * alphaRatio); // Slower as it gets more transparent

            this.jitterCircleFade.alpha = Math.max(this.jitterCircleFade.targetAlpha,
                this.jitterCircleFade.alpha - easedSpeed);
        }

        // Hide when fully faded out
        if (this.jitterCircleFade.alpha <= 0.01) {
            this.jitterCircleFade.visible = false;
            this.jitterCircleFade.alpha = 0;
        }

        // Draw circle if visible
        if (this.jitterCircleFade.visible && this.jitterCircleFade.alpha > 0) {
            // Base radius starts at 20px, scales up to 80px based on intensity
            const baseRadius = 20;
            const maxRadius = 80;
            const currentRadius = baseRadius + (maxRadius - baseRadius) * intensity;

            this.ctx.save();
            this.ctx.globalAlpha = this.jitterCircleFade.alpha;
            this.ctx.fillStyle = '#666666'; // Gray color
            this.ctx.beginPath();
            this.ctx.arc(input.screenAimX, input.screenAimY, currentRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
}

// Cursor ring NOW shows primary-weapon AMMO state. Power-weapon charge has
// its own ship-tip indicator (player/renderer.js drawCooldownTimer) plus
// the ship-glow effect (drawChargingEffects), so we don't double up here.
//
// The original power-weapon charge cursor ring is preserved verbatim below
// in case we want to restore it. To re-enable, swap this function body
// with the commented block.
//
// /* ── ORIGINAL POWER-WEAPON CHARGE RING (disabled 2026-04-26) ──
// export function drawCursorCooldownTimer() {
//         if (!this.player || !this.cursor || !this.player.isCharging) return;
//         if (!this.cursor.x && !this.cursor.y) return;
//
//         const charge = this.player.chargeLevel; // 0-1
//         if (charge <= 0) return;
//
//         const cursorX = this.cursor.x;
//         const cursorY = this.cursor.y;
//         const timerRadius = 20;
//
//         this.ctx.save();
//
//         // Background ring
//         this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
//         this.ctx.lineWidth = 3;
//         this.ctx.beginPath();
//         this.ctx.arc(cursorX, cursorY, timerRadius, 0, Math.PI * 2);
//         this.ctx.stroke();
//
//         // Charge arc — fills as charge builds
//         const startAngle = -Math.PI / 2;
//         const endAngle = startAngle + (charge * Math.PI * 2);
//
//         if (this.player.isFullyCharged) {
//             // Pulsing bright when ready to fire
//             const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
//             this.ctx.strokeStyle = `rgba(200, 255, 255, ${pulse})`;
//             this.ctx.lineWidth = 5;
//         } else {
//             // Blue → cyan as charge builds
//             const r = Math.floor(80 + charge * 175);
//             const g = Math.floor(160 + charge * 95);
//             this.ctx.strokeStyle = `rgb(${r}, ${g}, 255)`;
//             this.ctx.lineWidth = 4;
//         }
//         this.ctx.lineCap = 'round';
//
//         this.ctx.beginPath();
//         this.ctx.arc(cursorX, cursorY, timerRadius, startAngle, endAngle);
//         this.ctx.stroke();
//
//         // Inner fill wedge for visibility
//         if (charge > 0.1) {
//             this.ctx.globalAlpha = this.player.isFullyCharged ? 0.15 : 0.1;
//             this.ctx.fillStyle = this.player.isFullyCharged ? '#ccffff' : '#6688ff';
//             this.ctx.beginPath();
//             this.ctx.moveTo(cursorX, cursorY);
//             this.ctx.arc(cursorX, cursorY, timerRadius - 1, startAngle, endAngle);
//             this.ctx.closePath();
//             this.ctx.fill();
//         }
//
//         this.ctx.restore();
// }
// ── END DISABLED BLOCK ── */
//
// Cursor ring removed when the clip / reload system was removed (Option C).
// Function kept as a no-op so the callsite in game-engine.js stays valid.
// The original ammo-ring code is preserved in the commented block above
// drawCursorCooldownTimer's prior history if a future feature wants it back.
export function drawCursorCooldownTimer() {
        return;
}

// Mirrors the per-weapon range/lifetime/velocity stack-up from
// firePulseCannon / fireStormNeedles / fireScatterGun / fireRailDriver
// + applyGlobalBulletUpgrades. Pulse Cannon takes the
// createChargedBullets path which skips applyGlobalBulletUpgrades, so
// its rangeMultiplier is single-applied; the other primaries get
// playerRangeMult applied twice (once at fire, once in
// applyGlobalBulletUpgrades). We match that quirk so the pointer's
// endpoint lines up with where bullets actually expire.
function _predictPrimaryBulletRange(player) {
    if (!player || !player.getActivePrimaryConfig) return 0;
    const cfg = player.getActivePrimaryConfig();
    if (!cfg) return 0;
    const cfgRange = cfg.range || 1.0;
    const cfgSpeed = cfg.bulletSpeed || 1.0;
    const playerRangeMult = player.getRangeMultiplier ? player.getRangeMultiplier() : 1;
    const baseMaxLife = Math.round(30 / GAME_CONFIG.TICK_SCALE);
    const baseSpeed = GAME_CONFIG.BULLET_SPEED;

    let extra = 1.0;
    if (player.activePrimary === 'RAIL_DRIVER') {
        const stacks = player.getPowerupStacks ? player.getPowerupStacks('PENETRATOR') : 0;
        extra = 1 + stacks * 0.5;
    }

    const doubleApply = player.activePrimary !== 'PULSE_CANNON';

    let bulletRangeMult = playerRangeMult * cfgRange * extra;
    if (doubleApply) bulletRangeMult *= playerRangeMult;

    const bulletMaxLife = Math.round(baseMaxLife * cfgRange * extra);
    const effectiveMaxLife = Math.round(bulletMaxLife * bulletRangeMult);

    let bulletSpeed = baseSpeed;
    if (player.activePrimary === 'RAIL_DRIVER') bulletSpeed *= cfgSpeed;
    if (doubleApply && player.getBulletVelocityDamageMult) {
        bulletSpeed *= player.getBulletVelocityDamageMult();
    }

    return bulletSpeed * effectiveMaxLife;
}

// How many additional targets a single primary bullet can punch through
// past the first hit. 0 = stops at first hit. Pulls weapon built-in,
// PIERCING upgrade stacks, and the per-weapon capstone bonuses
// (HAILSTORM, CONE_OF_FIRE, RAIL_PENETRATOR_PLUS) the same way
// applyGlobalBulletUpgrades + the fire functions do.
function _predictPrimaryPiercing(player) {
    if (!player || !player.getActivePrimaryConfig) return 0;
    const cfg = player.getActivePrimaryConfig();
    let p = (cfg && cfg.piercing) || 0;
    if (!player.getPowerupStacks) return p;
    p += player.getPowerupStacks('PIERCING');
    if (player.getPowerupStacks('RAIL_PENETRATOR_PLUS') > 0) p = Math.max(p, 99);
    if (player.activePrimary === 'STORM_NEEDLES' && player.getPowerupStacks('HAILSTORM') > 0) p += 1;
    if (player.activePrimary === 'SCATTER_GUN' && player.getPowerupStacks('CONE_OF_FIRE') > 0) p += 1;
    return p;
}

// 6.2.3 — Ray-vs-viewport-AABB. Returns the positive `t` along
// (cosA, sinA) starting at (ox, oy) where the ray exits the visible
// world rectangle. Caller is expected to live inside the viewport;
// `t` is always >= 0. Used by `_drawSpreadCone` to keep the cone
// from extending past the screen edge.
function _viewportRayDistance(engine, ox, oy, cosA, sinA) {
    const cam = engine.camera;
    if (!cam) return Infinity;
    const zoom = cam.zoom || 1;
    const cw = engine.canvas ? engine.canvas.width : engine.width;
    const ch = engine.canvas ? engine.canvas.height : engine.height;
    const visW = cw / zoom;
    const visH = ch / zoom;
    const halfPadW = (visW - cw) / 2;
    const halfPadH = (visH - ch) / 2;
    const left   = cam.x - halfPadW;
    const right  = cam.x + cw + halfPadW;
    const top    = cam.y - halfPadH;
    const bottom = cam.y + ch + halfPadH;
    let t = Infinity;
    if (cosA > 0.0001)      t = Math.min(t, (right  - ox) / cosA);
    else if (cosA < -0.0001) t = Math.min(t, (left   - ox) / cosA);
    if (sinA > 0.0001)      t = Math.min(t, (bottom - oy) / sinA);
    else if (sinA < -0.0001) t = Math.min(t, (top    - oy) / sinA);
    return Math.max(0, t);
}

// Render a cone-of-fire wedge from the muzzle spanning the weapon's
// spreadAngle. Used by Scatter Shot (predictable pellet fan) AND
// Storm Needles (single needle with randomized jitter within the
// cone). The wedge has a faint red gas fill, two stacked-stroke edge
// lasers, an arc at the max-range boundary, and a reticle around
// every entity inside the cone. Branched out of drawLaserPointerAim
// so the line/cone paths don't crowd each other.
//
// 5.113.1 — Renamed from _drawScatterCone to _drawSpreadCone. Now
//   reads spread directly from `cfg.spreadAngle` (the legacy
//   TIGHT_CHOKE multiplier was removed in 5.111.0). Any weapon with
//   spreadAngle > 0 routes through this path.
function _drawSpreadCone(engine, player, ox, oy, angle, maxRange) {
    const ctx = engine.ctx;
    const cfg = player.getActivePrimaryConfig();
    const spread = cfg.spreadAngle || 0;
    if (!(spread > 0)) return;
    const halfSpread = spread / 2;

    const a1 = angle - halfSpread;
    const a2 = angle + halfSpread;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 6.2.3 — Cap maxRange so no part of the wedge (center axis or
    // either edge ray) extends past the visible viewport. Without this
    // the bullet-range-based maxRange (688 px for Scatter at default
    // settings) routinely shoots the cone fill / boundary arc into
    // off-screen space, which reads as "the cone is way too long" even
    // though the pellets WOULD travel that far. We clamp the visual to
    // screen edges; the actual bullet flight is unchanged.
    const screenCap = Math.min(
        _viewportRayDistance(engine, ox, oy, cosA, sinA),
        _viewportRayDistance(engine, ox, oy, Math.cos(a1), Math.sin(a1)),
        _viewportRayDistance(engine, ox, oy, Math.cos(a2), Math.sin(a2)),
    );
    if (screenCap > 0) maxRange = Math.min(maxRange, screenCap);

    const e1x = ox + Math.cos(a1) * maxRange;
    const e1y = oy + Math.sin(a1) * maxRange;
    const e2x = ox + Math.cos(a2) * maxRange;
    const e2y = oy + Math.sin(a2) * maxRange;

    // Targets inside the cone — angular check with an entity-radius
    // pad so wide rocks at long range still register a reticle when
    // their silhouette grazes the cone edge.
    const hits = [];
    const collect = (pool) => {
        if (!pool || !pool.activeObjects) return;
        for (const t of pool.activeObjects) {
            if (!t.active || t.warping || t._deathFlash > 0) continue;
            const dx = t.x - ox;
            const dy = t.y - oy;
            const dist = Math.hypot(dx, dy);
            if (dist > maxRange || dist < 1) continue;
            const targetAngle = Math.atan2(dy, dx);
            let diff = targetAngle - angle;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            const r = t.radius || 10;
            const angularPad = Math.atan2(r, dist);
            if (Math.abs(diff) > halfSpread + angularPad) continue;
            hits.push({ entity: t, distance: dist, radius: r });
        }
    };
    collect(engine.enemyPool);
    collect(engine.asteroidPool);

    const t = Date.now() * 0.001;
    const haloPulse = 1.0 + 0.10 * Math.sin(t * 1.7);
    const corePulse = 0.92 + 0.08 * Math.sin(t * 4.3);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';

    // Faint gas-fill across the wedge — radial gradient from the muzzle
    // outward so the spread feels denser near the gun and dissipates at
    // range. ONE fill call.
    {
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, maxRange);
        grad.addColorStop(0.0, 'rgba(255, 40, 60, 0.14)');
        grad.addColorStop(0.5, 'rgba(255, 30, 50, 0.06)');
        grad.addColorStop(1.0, 'rgba(255, 0, 30, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.arc(ox, oy, maxRange, a1, a2, false);
        ctx.closePath();
        ctx.fill();
    }

    // Two edge lasers — same 4-stack stroke recipe as the single-line
    // laser, but slightly thinner so the fan reads as fan rather than a
    // pair of solo beams.
    const drawEdge = (ex, ey) => {
        ctx.strokeStyle = 'rgba(255, 30, 60, 0.05)';
        ctx.lineWidth = 12 * haloPulse;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 50, 70, 0.16)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 90, 110, 0.36)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 220, 220, ${0.78 * corePulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    };
    drawEdge(e1x, e1y);
    drawEdge(e2x, e2y);

    // Range-boundary arc — closes the cone visually at maxRange.
    ctx.strokeStyle = 'rgba(255, 50, 70, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(ox, oy, maxRange, a1, a2, false); ctx.stroke();
    ctx.strokeStyle = `rgba(255, 220, 220, ${0.65 * corePulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox, oy, maxRange, a1, a2, false); ctx.stroke();

    // Center-axis tick — small hash mark at maxRange along the aim,
    // matches the single-line laser's range tick so the two modes feel
    // related.
    const cx = ox + cosA * maxRange;
    const cy = oy + sinA * maxRange;
    const tickLen = 5;
    const tx = -sinA * tickLen;
    const ty = cosA * tickLen;
    ctx.strokeStyle = 'rgba(255, 50, 70, 0.30)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - tx, cy - ty); ctx.lineTo(cx + tx, cy + ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 220, 220, 0.85)';
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(cx - tx, cy - ty); ctx.lineTo(cx + tx, cy + ty); ctx.stroke();

    // Muzzle hotspot — anchors the cone to the gun barrel.
    {
        const r = 10 * corePulse;
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grad.addColorStop(0.0, 'rgba(255, 240, 240, 0.85)');
        grad.addColorStop(0.4, 'rgba(255, 80, 90, 0.45)');
        grad.addColorStop(1.0, 'rgba(255, 0, 30, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Reticles on every entity inside the cone. No "first hit" emphasis —
    // pellets spread across the full fan so it's visually honest to mark
    // every potential target the same way.
    for (const h of hits) {
        const radius = (h.radius || 10) * 1.08 + 4;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 50, 70, 0.28)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(h.entity.x, h.entity.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 220, 220, ${0.65 * corePulse})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(h.entity.x, h.entity.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
}

// Render a thin laser-pointer trace from the player muzzle along the
// current aim, tick-marked at the bullet's max range, with a subtle
// reticle around the first entity the shot hits. Piercing builds get
// extra (fading) reticles around each subsequent target the bullet
// will punch through. Drawn in WORLD coords — the caller must invoke
// it inside the camera transform (see drawWeaponEffects neighborhood
// in game-engine.js).
export function drawLaserPointerAim() {
    if (!this.player || !this.player.active) return;
    if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) return;
    if (this.radialMenu && this.radialMenu.isOpen && this.radialMenu.isOpen()) return;
    // 5.95.1 — Suppress on mobile (replaced by touch-position reticle).
    if (isMobile()) return;
    // 6.2.3 — Desktop-only Laser Sight ASSIST toggle. Gates both the
    // single-line laser AND the cone-of-fire wedge. Default ON (mirrors
    // the pre-6.2.3 always-on behavior). Mobile already returned above.
    if (this.assists && this.assists.laserSight === false) return;

    const player = this.player;
    const ctx = this.ctx;
    const angle = player.angle;
    if (!Number.isFinite(angle)) return;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const muzzleDist = GAME_CONFIG.SHIP_SIZE / 1.5;
    const ox = player.x + cosA * muzzleDist;
    const oy = player.y + sinA * muzzleDist;

    const maxRange = _predictPrimaryBulletRange(player);
    if (!(maxRange > 0)) return;

    // 5.113.1 — Cone-of-fire visualization for ANY weapon with
    // spreadAngle > 0. Scatter Shot (predictable pellet fan) AND
    // Storm Needles (single needle with randomized jitter within
    // the cone) both route here so the player can read the spread
    // at a glance instead of seeing a misleading single-line laser.
    const primaryCfg = player.getActivePrimaryConfig && player.getActivePrimaryConfig();
    if (primaryCfg && (primaryCfg.spreadAngle || 0) > 0) {
        _drawSpreadCone(this, player, ox, oy, angle, maxRange);
        return;
    }

    const piercing = _predictPrimaryPiercing(player);
    const maxTargets = piercing + 1;

    // Trace through enemies + asteroids. Using along/perpendicular ray
    // projection: along = (P-O)·D, perp = |(P-O)·N| with N = (-sin, cos).
    // A target hits when perp < target.radius + bulletThickness, with the
    // entry point being along - sqrt(r² - perp²) so the reticle/stop
    // lines up at the front face of the entity, not its center.
    const bulletThickness = 4;
    const candidates = [];
    const collect = (pool) => {
        if (!pool || !pool.activeObjects) return;
        for (const t of pool.activeObjects) {
            if (!t.active) continue;
            if (t.warping) continue;
            if (t._deathFlash > 0) continue;
            const dx = t.x - ox;
            const dy = t.y - oy;
            const along = dx * cosA + dy * sinA;
            if (along <= 0) continue;
            if (along > maxRange) continue;
            const perp = Math.abs(-dx * sinA + dy * cosA);
            const r = (t.radius || 10) + bulletThickness;
            if (perp > r) continue;
            const entry = Math.max(0, along - Math.sqrt(Math.max(0, r * r - perp * perp)));
            candidates.push({ entity: t, distance: entry, radius: t.radius || 10 });
        }
    };
    collect(this.enemyPool);
    collect(this.asteroidPool);
    candidates.sort((a, b) => a.distance - b.distance);

    const hits = candidates.slice(0, maxTargets);

    // Stop point: when piercing is exhausted (hits.length === maxTargets),
    // the bullet expires at the last hit. Otherwise it travels to maxRange.
    let stopDist = maxRange;
    if (hits.length > 0 && hits.length === maxTargets) {
        stopDist = hits[hits.length - 1].distance;
    }

    // Time-based shimmer for the "ionized gas" feel — the outer halo
    // breathes ±10% on a slow sine, and the core pulses faster but more
    // subtly. Single Date.now() read shared across all layers; cheap.
    const t = Date.now() * 0.001;
    const haloPulse  = 1.0 + 0.10 * Math.sin(t * 1.7);
    const corePulse  = 0.92 + 0.08 * Math.sin(t * 4.3);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Faint dashed extension to maxRange when the shot stops short. Tells
    // the player "this is your max reach" even when the visible beam is
    // truncated by a target. Drawn FIRST (under the hot beam) so the
    // active segment overlays it cleanly at the boundary.
    if (stopDist < maxRange - 1) {
        const fx = ox + cosA * maxRange;
        const fy = oy + sinA * maxRange;
        const ex0 = ox + cosA * stopDist;
        const ey0 = oy + sinA * stopDist;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 40, 50, 0.18)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        ctx.moveTo(ex0, ey0);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Active beam — stacked strokes with additive ('lighter') blending
    // build up a saturated red core surrounded by a softer halo. Four
    // passes total; each is one stroke call. Outer-to-inner so the
    // brightest layer renders last and dominates the additive sum.
    const ex = ox + cosA * stopDist;
    const ey = oy + sinA * stopDist;
    ctx.globalCompositeOperation = 'lighter';

    // Outer scatter — wide, very faint, pulses slightly. Reads as
    // "ionized air around the beam path."
    ctx.strokeStyle = 'rgba(255, 30, 60, 0.05)';
    ctx.lineWidth = 14 * haloPulse;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Mid glow — the bulk of the visible red.
    ctx.strokeStyle = 'rgba(255, 50, 70, 0.18)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Inner glow — saturated red, gives the beam its color identity.
    ctx.strokeStyle = 'rgba(255, 90, 110, 0.42)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Hot core — near-white center stripe; this is what the eye locks onto.
    ctx.strokeStyle = `rgba(255, 220, 220, ${0.85 * corePulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Muzzle hotspot — small radial bloom at the emitter so the laser
    // feels anchored to the gun barrel.
    {
        const r = 9 * corePulse;
        const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grad.addColorStop(0.0, 'rgba(255, 240, 240, 0.85)');
        grad.addColorStop(0.4, 'rgba(255, 80, 90, 0.45)');
        grad.addColorStop(1.0, 'rgba(255, 0, 30, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Impact hotspot at the first hit (where the beam terminates against
    // the target). Pulses faster than the muzzle for a "live contact" feel.
    if (hits.length > 0) {
        const hp = hits[0];
        const ix = ox + cosA * hp.distance;
        const iy = oy + sinA * hp.distance;
        const r = 7 * corePulse;
        const grad = ctx.createRadialGradient(ix, iy, 0, ix, iy, r);
        grad.addColorStop(0.0, 'rgba(255, 240, 240, 0.95)');
        grad.addColorStop(0.5, 'rgba(255, 70, 80, 0.55)');
        grad.addColorStop(1.0, 'rgba(255, 0, 30, 0.0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ix, iy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // Range-end tick (perpendicular hash mark at maxRange). Stacked
    // strokes for a small red glow so it reads as part of the beam
    // hardware, not a thin pencil mark.
    const rex = ox + cosA * maxRange;
    const rey = oy + sinA * maxRange;
    const tickLen = 6;
    const tx = -sinA * tickLen;
    const ty = cosA * tickLen;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 50, 70, 0.30)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rex - tx, rey - ty);
    ctx.lineTo(rex + tx, rey + ty);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 220, 220, 0.85)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(rex - tx, rey - ty);
    ctx.lineTo(rex + tx, rey + ty);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Aim reticles around each hit. First hit = layered red ring with
    // glow (matches the beam material). Subsequent piercing hits =
    // single dashed amber rings fading by depth so the shot order is
    // legible at a glance.
    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        const isFirst = i === 0;
        const radius = (h.radius || 10) * 1.08 + 4;
        if (isFirst) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgba(255, 50, 70, 0.30)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(h.entity.x, h.entity.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 220, 220, ${0.80 * corePulse})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(h.entity.x, h.entity.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        } else {
            const alpha = Math.max(0.10, 0.40 * Math.pow(0.62, i));
            ctx.strokeStyle = `rgba(255, 130, 140, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(h.entity.x, h.entity.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}
