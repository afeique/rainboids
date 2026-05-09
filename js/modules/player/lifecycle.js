// Player damage, tank consumption, and game-over.
//
// 5.88.0 — energy tanks replace the old "lives" system entirely:
//   - shieldTanks ∈ [0, 4]; starts at 3 (3 triforce triangles, no spare).
//   - Hits reduce HP. When HP hits 0 we consume one tank, vaporize the
//     visual representation (top→btm-right→btm-left triangle, or the
//     standalone "spare" icon at tanks=4), and refill HP to max. No
//     respawn delay, no automatic invincibility window — the player
//     keeps flying.
//   - Game over fires only when HP hits 0 with no tanks left.
//   - Health pickups heal HP normally; overflow accumulates into a
//     hidden _tankProgress counter, capped at 4 effective tanks.
//
// Removed from the prior implementation: post-hit invincibility,
// respawn delay, safe-respawn-location search, respawn-blink animation,
// SPARE_SHIP shop interaction. Defense skills that grant deliberate
// invuln (LAST_STAND, REFLEXES, PHASE_DASH) still call makeInvincible.

import { GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';

export const MAX_SHIELD_TANKS = 4;

export function takeDamage(damageAmount = this.baseDamage) {
    if (this.player.invincible) return;

    // 5.75.0 — REFLEXES: one free dodge per 30s.
    if (this.player.getPowerupStacks && this.player.getPowerupStacks('REFLEXES') > 0) {
        const now = Date.now();
        if (!this.player._reflexesReadyAt || now >= this.player._reflexesReadyAt) {
            this.player._reflexesReadyAt = now + 30000;
            this.player.makeInvincible(700);
            if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
            if (this.particlePool) {
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    const p = this.particlePool.get(this.player.x, this.player.y, 'starSparkle');
                    if (p) {
                        p.color = '#7fdfff';
                        p.vel.x = Math.cos(a) * 4;
                        p.vel.y = Math.sin(a) * 4;
                    }
                }
            }
            return;
        }
    }

    const effectiveShield = this.player.getEffectiveShield();
    let reducedDamage = damageAmount * (1 - effectiveShield / 100);

    // 5.75.0 — STATIC_FIELD: passive HP shield that regenerates after 8s.
    const staticStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('STATIC_FIELD') : 0;
    const staticMax = staticStacks * 2;
    if (this.player._staticShield === undefined) this.player._staticShield = staticMax;
    if (staticStacks > 0 && this.player._staticShield > 0 && reducedDamage > 0) {
        const absorbed = Math.min(this.player._staticShield, reducedDamage);
        this.player._staticShield -= absorbed;
        reducedDamage -= absorbed;
        if (absorbed > 0) {
            if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
            if (this.particlePool) {
                for (let i = 0; i < 6; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const p = this.particlePool.get(this.player.x, this.player.y, 'starSparkle');
                    if (p) {
                        p.color = '#88ddff';
                        p.vel.x = Math.cos(a) * 2.5;
                        p.vel.y = Math.sin(a) * 2.5;
                    }
                }
            }
        }
    }
    this.player._lastDamageAt = Date.now();

    this.player.health = Math.max(0, this.player.health - reducedDamage);

    if (reducedDamage > 0) this._breakKillStreak();

    if (reducedDamage > 0 && typeof this.checkMissionOnDamage === 'function') {
        if (this.game.mission) this.game.mission.damaged = true;
        this.checkMissionOnDamage();
    }

    if (this.player.health <= 0) {
        // 5.75.0 — LAST_STAND: one-time-per-run survive at 1 HP.
        const lastStandStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('LAST_STAND') : 0;
        if (lastStandStacks > 0 && !this.player._lastStandUsed) {
            this.player._lastStandUsed = true;
            this.player.health = 1;
            this.player.makeInvincible(2500);
            if (typeof this.events?.emit === 'function') {
                this.events.emit('ui:show-message', { title: 'LAST STAND', subtitle: 'Saved at 1 HP', duration: 1600 });
                this.events.emit('audio:powerup');
                this.events.emit('audio:player-explosion');
            }
            if (typeof this.triggerScreenFlash === 'function') {
                this.triggerScreenFlash(0.35, 8);
            }
            if (typeof this.triggerScreenShake === 'function') {
                this.triggerScreenShake(20, 14);
            }
            if (this.particlePool) {
                for (let i = 0; i < 24; i++) {
                    const a = (i / 24) * Math.PI * 2;
                    const p = this.particlePool.get(this.player.x, this.player.y, 'explosion');
                    if (p) {
                        p.color = '#ff4444';
                        p.vel.x = Math.cos(a) * 5;
                        p.vel.y = Math.sin(a) * 5;
                    }
                }
            }
            return;
        }

        if (this.shieldTanks > 0) {
            this._consumeTank();
            return;
        }
        this.handlePlayerDeath();
        return;
    }

    this.events.emit('audio:hit');
    if (reducedDamage > 0) {
        if (typeof this.createDamageNumber === 'function') {
            this.createDamageNumber(this.player.x, this.player.y - (this.player.radius || 14), reducedDamage, { isPlayerHit: true });
        }
        if (typeof this.triggerPlayerHitFX === 'function') {
            this.triggerPlayerHitFX(this.player.x, this.player.y, reducedDamage);
        } else {
            this.triggerScreenShake(15, 8);
        }
    }
}

// Consume one energy tank: vaporize the corresponding triforce triangle
// (or fade the standalone "spare" icon at tanks=4), refill HP to max, and
// keep playing. Returns true if a tank was consumed (HP refilled), false
// if there were no tanks to consume (caller should handle game-over).
export function _consumeTank() {
    if (this.shieldTanks <= 0) return false;

    const tanksBefore = this.shieldTanks;
    this.shieldTanks--;

    // Visual feedback: vaporize the slot that just emptied. The HUD's
    // current top-left base coordinates (baseX, baseY) are read by the
    // existing triforce/standalone helpers so the burst lines up with the
    // pixel that just disappeared.
    const baseX = HUD_TRIFORCE_BASE_X;
    const baseY = HUD_TRIFORCE_BASE_Y;
    if (typeof this.getDisappearingTankPos === 'function' &&
        typeof this.spawnTriforceVaporize === 'function') {
        const slot = this.getDisappearingTankPos(tanksBefore, baseX, baseY);
        if (slot) this.spawnTriforceVaporize(slot.x, slot.y, slot.size || 12);
    }
    if (typeof this.triggerGoldScreenFlash === 'function') {
        this.triggerGoldScreenFlash(0.32, 9);
    }

    this.player.health = this.player.getEffectiveMaxHealth();
    this.events.emit('audio:coin');
    this.events.emit('ui:update-tanks', { tanks: this.shieldTanks });
    return true;
}

// HUD coordinates are mirrored here so the lifecycle path knows where to
// spawn the vaporize FX. Keep in sync with status.js's updateHUD().
const HUD_TRIFORCE_BASE_X = 12;
const HUD_TRIFORCE_BASE_Y = 20;

// 5.88.0 — health-pickup overflow → tank progress. `amountHealed` is
// the actual HP delta (post-cap); `orbAmount` is the original orb value
// before cap. Overflow = orbAmount - amountHealed. When the accumulated
// overflow reaches one full max-HP, +1 tank (capped at MAX_SHIELD_TANKS).
export function applyHealthOrbToTanks(orbAmount, amountHealed) {
    const overflow = Math.max(0, orbAmount - amountHealed);
    if (overflow <= 0 && this.player.health < this.player.getEffectiveMaxHealth()) return;

    const maxHp = this.player.getEffectiveMaxHealth();
    if (this.player._tankProgress === undefined) this.player._tankProgress = 0;

    // If the player picks up health while already at max HP, the entire
    // orb amount counts toward tank progress. Otherwise just the overflow.
    const credit = overflow > 0 ? overflow : orbAmount;
    this.player._tankProgress += credit / maxHp;

    while (this.player._tankProgress >= 1 && this.shieldTanks < MAX_SHIELD_TANKS) {
        this.shieldTanks++;
        this.player._tankProgress -= 1;
        this.events.emit('audio:powerup');
        this.events.emit('ui:update-tanks', { tanks: this.shieldTanks });
        if (typeof this.spawnTankRecharge === 'function') {
            this.spawnTankRecharge(this.shieldTanks);
        }
    }
    // Cap progress at <1 once at max tanks so overflow doesn't sit forever.
    if (this.shieldTanks >= MAX_SHIELD_TANKS && this.player._tankProgress > 1) {
        this.player._tankProgress = 1;
    }
}

export function handlePlayerDeath() {
    const dx = this.player.x;
    const dy = this.player.y;
    const playerAngle = this.player.angle || 0;

    this.deathLocation = { x: dx, y: dy };

    // Vaporize the LAST triangle (or whatever slot is currently rendered
    // as `tanks=1` → the bottom-left). shieldTanks is still 0 at this
    // point (the consumeTank that exhausted it already decremented), so
    // the FX site is computed from the just-emptied slot count + 1.
    if (typeof this.spawnTriforceVaporize === 'function' &&
        typeof this.getDisappearingTankPos === 'function') {
        const tri = this.getDisappearingTankPos(1, HUD_TRIFORCE_BASE_X, HUD_TRIFORCE_BASE_Y);
        if (tri) this.spawnTriforceVaporize(tri.x, tri.y, tri.size || 12);
    }
    if (typeof this.triggerGoldScreenFlash === 'function') {
        this.triggerGoldScreenFlash(0.32, 9);
    }

    this.events.emit('audio:player-explosion');
    this.player.active = false;

    // ── Phase 0: Impact Freeze (immediate) ──────────────────────────
    this.triggerHitstop(15);
    this.triggerScreenFlash(0.28, 5);
    const kickAngle = playerAngle + Math.PI;
    this.triggerCameraKick(Math.cos(kickAngle), Math.sin(kickAngle), 25);

    // Death overlay — full hold since it's terminal now.
    this._deathOverlayTimer = 90;
    this._deathOverlayDuration = this._deathOverlayTimer;
    this._deathOverlayHold = true;

    // ── Phase 1: Ship Fragmentation (immediate) ─────────────────────
    this.particlePool.get(dx, dy, 'explosionFlash', 55);
    this.particlePool.get(dx, dy, 'explosionRingColored', 70, '#00ccff');
    this.createPlayerShipDebris(dx, dy, playerAngle);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + random(-0.3, 0.3);
        const spd = random(10, 18);
        const c = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#00ccff' : '#78ebff';
        this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd, c);
    }

    // ── Phase 2: Main Blast ─────────────────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-0.5, 0.5)),
            Math.sin(kickAngle + random(-0.5, 0.5)), 18
        );
        this.triggerScreenFlash(0.18, 4);
        this.triggerScreenShake(60, 30, 80);

        const ringColors = ['#ffffff', '#78ebff', '#ff5ad2'];
        const ringRadii = [90, 130, 175];
        for (let r = 0; r < 3; r++) {
            setTimeout(() => {
                this.particlePool.get(dx, dy, 'explosionRingColored',
                    ringRadii[r], ringColors[r]);
            }, r * 60);
        }
    }, 100);

    // Secondary shrapnel wave
    setTimeout(() => {
        const palette = ['#00ccff', '#ff5ad2', '#be96ff', '#ffffff', '#ffff96'];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + random(-0.4, 0.4);
            const spd = random(4, 11);
            this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd,
                palette[i % palette.length]);
        }
    }, 160);

    // Embers
    setTimeout(() => {
        const emberColors = ['#78ebff', '#ffffff', '#ff5ad2', '#be96ff'];
        for (let i = 0; i < 10; i++) {
            this.particlePool.get(dx, dy, 'explosionEmber',
                emberColors[i % emberColors.length]);
        }
    }, 220);

    // ── Phase 3: Aftershock ─────────────────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-1, 1)),
            Math.sin(kickAngle + random(-1, 1)), 10
        );
        this.triggerScreenFlash(0.08, 2);

        for (let i = 0; i < 6; i++) {
            const ox = dx + random(-35, 35);
            const oy = dy + random(-35, 35);
            this.particlePool.get(ox, oy, 'explosionEmber',
                i % 2 === 0 ? '#ff5ad2' : '#ffff96');
        }
    }, 400);

    // Final massive ring
    setTimeout(() => {
        this.particlePool.get(dx, dy, 'explosionRingColored', 220, '#be96ff');
    }, 650);

    // Delayed re-ignition pops
    for (let p = 0; p < 4; p++) {
        setTimeout(() => {
            const ox = dx + random(-45, 45);
            const oy = dy + random(-45, 45);
            this.particlePool.get(ox, oy, 'explosionFlash', random(15, 28));
            for (let s = 0; s < 3; s++) {
                const a = random(0, Math.PI * 2);
                this.particlePool.get(ox, oy, 'explosionShrapnel', a,
                    random(3, 7), s === 0 ? '#ffffff' : '#78ebff');
            }
        }, 650 + p * 120);
    }

    // 5.88.0 — game over fires immediately; no respawn branch.
    this.game.state = GAME_STATES.GAME_OVER;
    this.checkSurvivalRecord();
    this.events.emit('ui:show-message', { title: 'GAME OVER', subtitle: 'Press Enter or click to restart' });
}

export function createPlayerShipDebris(x, y, angle) {
    const r = this.player.radius || 12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const verts = [
        { x: 0,          y: -r },
        { x: r * 0.32,   y: -r * 0.18 },
        { x: r * 1.12,   y: r * 0.28 },
        { x: r * 1.42,   y: r * 0.08 },
        { x: r * 0.28,   y: r * 0.58 },
        { x: r * 0.42,   y: r * 0.78 },
        { x: 0,          y: r * 0.38 },
        { x: -r * 0.42,  y: r * 0.78 },
        { x: -r * 0.28,  y: r * 0.58 },
        { x: -r * 1.42,  y: r * 0.08 },
        { x: -r * 1.12,  y: r * 0.28 },
        { x: -r * 0.32,  y: -r * 0.18 },
    ];

    for (let i = 0; i < verts.length; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];
        const p1 = {
            x: v1.x * cos - v1.y * sin,
            y: v1.x * sin + v1.y * cos
        };
        const p2 = {
            x: v2.x * cos - v2.y * sin,
            y: v2.x * sin + v2.y * cos
        };
        const debris = this.lineDebrisPool.get(x, y, p1, p2, '#00ccff');
        if (debris) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const outAngle = Math.atan2(midY, midX);
            const spd = random(4, 10);
            debris.vel.x = Math.cos(outAngle) * spd;
            debris.vel.y = Math.sin(outAngle) * spd;
            debris.rotVel = random(-0.2, 0.2);
        }
    }
}
