// Player damage, tank consumption, and game-over.
//
// 6.1.1 — healthTanks ∈ [0, MAX_HEALTH_TANKS=3] is the SPARE count.
// Each triangle = 1 spare. The healthbar represents the *active* tank
// (the implicit "+1"). Total effective tanks = healthTanks + 1,
// capped at 4 (3 triangle slots + active healthbar). Player STARTS
// with healthTanks=1 (engine init) so the overflow → +1 spare
// mechanic has somewhere to go from move 1 — earns up to 2 more spares
// via overflow healing (taking the triforce from 1 → 2 → 3 triangles
// over the course of a run).
//
// Previously (6.1.0 and earlier): started at 3 with cap 3 → already
// at cap → overflow inert. Fixed by lowering the starting count.
//   - Hits reduce HP. When HP hits 0:
//       * spares > 0: consume one spare → vaporize a triangle (top →
//         btm-right → btm-left in that loss order), refill HP, keep
//         playing. No respawn delay, no automatic invincibility.
//       * spares == 0: game over.
//   - Health pickups heal HP normally; overflow accumulates into a
//     hidden `_tankProgress` counter; each full max-HP-worth of
//     overflow grants +1 spare, capped at 3.
//
// Defense skills / movement primitives that grant deliberate invuln
// (LAST_STAND, REFLEXES, the SHIFT-key dash burst, wave-start grace)
// still call makeInvincible or rely on player.isDashIFrameActive() —
// those are active-ability windows, not damage-aftermath grace.
// (5.93.0 — PHASE_DASH was promoted from a defense skill to the
// SHIFT-key core movement primitive; its i-frames now live in
// player.isDashIFrameActive(), checked at the collision sites.)

import { GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { isMobile } from '../platform/platform-detect.js';

// 6.1.1 — Cap stays at 3 (matches the visible triforce HUD slots).
// The starting count was lowered from 3 → 1 in game-engine.js so the
// overflow → +1 spare mechanic actually fires (was inert when the
// player started at the cap). See the updated module header comment.
export const MAX_HEALTH_TANKS = 3;

// 5.98.0 — Mobile early-game damage-taken multiplier. The stationary
// ship + finger-only aim model makes the first few waves brutal on
// mobile; pair it with the early-wave OUTGOING damage ramp from 5.97
// so the asymmetry doesn't just go one direction. Multiplier applied
// AFTER shield reduction, so SHIELD_BOOST upgrades still scale on top.
//   Wave 1: 25% incoming damage     Wave 4: 65%
//   Wave 2: 35%                     Wave 5: 80%
//   Wave 3: 50%                     Wave 6+: 100% (no reduction)
function getMobileIncomingDamageMultiplier(wave) {
    if (!isMobile()) return 1;
    const w = Math.max(1, wave | 0);
    if (w >= 6) return 1;
    const table = [0.25, 0.35, 0.50, 0.65, 0.80, 1.0];
    return table[w - 1] || 1;
}

// 6.x — SINGLE player-damage pipeline. Previously the three collision
// sites (player↔enemy, player↔enemy-bullet, player↔asteroid) each
// inlined their own `player.health -= …`, bypassing this function
// entirely — so DODGE, REFLEXES, the mobile damage multiplier,
// STATIC_FIELD, LAST_STAND, and the `_lastDamageAt` regen gate never
// applied to actual gameplay damage (this fn had ZERO callers). They now
// all route here. opts:
//   source : the colliding enemy / bullet / asteroid (for Thorns)
//   fxX/fxY: impact point for the hit FX (defaults to the player)
// Returns the final (post-reduction, rounded) damage dealt — 0 if the
// hit was dodged / i-framed / invincible — so callers can scale their
// own screen-shake / bounce off it.
export function takeDamage(damageAmount = this.baseDamage, opts = {}) {
    if (this.player.invincible) return 0;

    // PHASE_DASH i-frames zero the hit entirely (dash-through). Was only
    // honored at the enemy / enemy-bullet sites; asteroid collisions
    // ignored it — now uniform.
    if (this.player.isDashIFrameActive && this.player.isDashIFrameActive()) return 0;

    // 6.28.0 — DODGE: flat % chance to ignore a hit entirely. Rolls
    // before REFLEXES so a lucky dodge doesn't burn the 30s REFLEXES
    // free-dodge cooldown. 6.32.0 — chance = passive stacks (5%/stack)
    // + item dodge affixes (rolled %), capped at 50%.
    const dodgeStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('DODGE') : 0;
    const itemDodge = this.player.getItemAffixTotal ? this.player.getItemAffixTotal('dodge') : 0;
    const spDodge = this.player.getSpStatValue ? this.player.getSpStatValue('DODGE') : 0;
    const dodgeChance = Math.min(0.5, dodgeStacks * 0.05 + (itemDodge + spDodge) / 100);
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
        if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
        return;
    }

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

    // 5.98.0 — Mobile early-wave incoming damage reduction. Stacks with
    // the shield/SHIELD_BOOST formula above. Cap-friendly (multiplier
    // never exceeds 1.0 so it can't accidentally amplify damage).
    const wave = (this.game && this.game.currentWave) ? (this.game.currentWave | 0) : 1;
    reducedDamage *= getMobileIncomingDamageMultiplier(wave);

    // BULWARK active-skill damage reduction (was applied inline at the
    // collision sites). IRON_WILL deepens it 50% → 65%.
    if (this.player.activeSkillEffects && this.player.activeSkillEffects.has('BULWARK')) {
        const bulwarkReduction = (this.player.getPowerupStacks
            && this.player.getPowerupStacks('IRON_WILL') > 0) ? 0.65 : 0.5;
        reducedDamage *= (1 - bulwarkReduction);
    }

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

    // Round to an integer so HP, damage numbers, and stats stay clean
    // (the collision sites used to round; the generic path didn't).
    const finalDamage = Math.round(reducedDamage);
    this.player.health = Math.max(0, this.player.health - finalDamage);

    if (finalDamage > 0) {
        this._breakKillStreak();
        if (this.game && this.game.stats) this.game.stats.totalDamageTaken += finalDamage;
        // Thorns — reflect a fraction back into the damage source
        // (enemy / bullet / asteroid). Only on a real HP loss.
        if (opts.source && typeof this.applyThorns === 'function') {
            this.applyThorns(finalDamage, opts.source);
        }
    }

    if (finalDamage > 0 && typeof this.checkMissionOnDamage === 'function') {
        if (this.game.mission) this.game.mission.damaged = true;
        this.checkMissionOnDamage();
    }

    if (this.player.health <= 0) {
        // 5.108.0 — GUARDIAN gets first dibs: clamps to 1 HP + grants
        // invuln (one save per wave), bypassing LAST_STAND + the tank.
        // Was applied inline at the collision sites; centralized here.
        if (typeof this.tryConsumeGuardian === 'function' && this.tryConsumeGuardian()) {
            return finalDamage;
        }
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
            // 6.17.1 — LAST_STAND flash + shake removed alongside the
            // broader "damage doesn't flash/shake" rule. The save still
            // reads loud thanks to the audio cue, the banner toast,
            // and the 24-sparkle radial spawn below.
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
            return finalDamage;
        }

        if (this.healthTanks > 0) {
            this._consumeTank();
            return finalDamage;
        }
        this.handlePlayerDeath();
        return finalDamage;
    }

    this.events.emit('audio:hit');
    if (finalDamage > 0) {
        const fxX = (opts.fxX !== undefined) ? opts.fxX : this.player.x;
        const fxY = (opts.fxY !== undefined) ? opts.fxY : (this.player.y - (this.player.radius || 14));
        if (typeof this.createDamageNumber === 'function') {
            this.createDamageNumber(this.player.x, this.player.y - (this.player.radius || 14), finalDamage, { isPlayerHit: true });
        }
        // 6.17.1 — Shake stays at the collision sites (damage-scaled).
        // triggerPlayerHitFX fires kick + hitstop + particles at the
        // impact point (opts.fxX/fxY) so the kick direction is correct.
        if (typeof this.triggerPlayerHitFX === 'function') {
            this.triggerPlayerHitFX(fxX, fxY, finalDamage);
        }
    }
    return finalDamage;
}

// Consume one energy tank: vaporize the corresponding triforce triangle
// (or fade the standalone "spare" icon at tanks=4), refill HP to max, and
// keep playing. Returns true if a tank was consumed (HP refilled), false
// if there were no tanks to consume (caller should handle game-over).
export function _consumeTank() {
    if (this.healthTanks <= 0) return false;

    const tanksBefore = this.healthTanks;
    this.healthTanks--;

    // Visual feedback: vaporize the slot that just emptied. Mirrored
    // coordinates below must match the values updateHUD() passes to
    // drawCanvasTriforce — see HUD_TRIFORCE_LEFT_X / HUD_BAR_CENTER_Y.
    if (typeof this.getDisappearingTankPos === 'function' &&
        typeof this.spawnTriforceVaporize === 'function') {
        const slot = this.getDisappearingTankPos(
            tanksBefore, HUD_TRIFORCE_LEFT_X, HUD_BAR_CENTER_Y,
        );
        if (slot) this.spawnTriforceVaporize(slot.x, slot.y, slot.size || 12);
    }
    if (typeof this.triggerGoldScreenFlash === 'function') {
        this.triggerGoldScreenFlash(0.32, 9);
    }

    this.player.health = this.player.getEffectiveMaxHealth();
    this.events.emit('audio:coin');
    this.events.emit('ui:update-tanks', { tanks: this.healthTanks });

    // 6.0.0 — SALVAGE_PLATING. When a tank pops, salvage spawns a
    // bonus health orb at the player's position so the player can
    // recover faster from the dramatic moment.
    const salvageStacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('SALVAGE_PLATING') : 0;
    if (salvageStacks > 0 && typeof this.createHealthOrb === 'function') {
        this.createHealthOrb(this.player.x, this.player.y);
    }
    return true;
}

// 5.88.3 — HUD coordinates mirrored here so the lifecycle vaporize FX
// lands on the right slot. Keep in sync with the constants in
// hud/status.js's updateHUD() — `triforceLeftX` and `barCenterY`.
// Left margin matches the bottom-left loadout (livesX=36 in
// drawEquippedWeaponSquares).
const HUD_TRIFORCE_LEFT_X = 36;
const HUD_BAR_CENTER_Y = 35;

// 5.88.0 — health-pickup overflow → tank progress.
// 6.35.0 — Threshold lowered 100 → 40 HP of overflow per tank. At 100
//   HP, regaining a triforce tank after losing one took ~10+ overheals
//   and felt like it "did nothing" / the excess was ignored. 40 HP
//   makes a regain land in ~2-4 overheals so the triforce-appearance
//   animation (spawnTankRecharge) actually fires and reads as a reward.
//   NOTE: tanks cap at MAX_HEALTH_TANKS (3 = the triforce slots), so
//   while the triforce is full the overflow is intentionally inert —
//   it only rebuilds tanks the player has LOST.
//
// `amountHealed` is the actual HP delta (post-cap); `orbAmount` is the
// original orb value before cap.
const TANK_OVERFLOW_HP = 40;
export function applyHealthOrbToTanks(orbAmount, amountHealed) {
    const overflow = Math.max(0, orbAmount - amountHealed);
    if (overflow <= 0 && this.player.health < this.player.getEffectiveMaxHealth()) return;

    // Picking up health while ALREADY at max HP credits the full orb;
    // otherwise just the unused portion.
    const credit = overflow > 0 ? overflow : orbAmount;
    accumulateOverflowToTank.call(this, credit);
}

// 5.114.0 — Shared accumulator. Any HP "wasted" past the cap (orb
// overflow, regen ticks at max, etc.) feeds in here. Every 100 HP of
// accumulated overflow grants +1 tank up to MAX_HEALTH_TANKS, fires
// the sparkling spawnTankRecharge animation, and emits an audio cue.
export function accumulateOverflowToTank(credit) {
    if (!(credit > 0) || !this.player) return;
    if (this.player._tankProgress === undefined) this.player._tankProgress = 0;
    // 6.0.0 — BLOOD_BANK doubles overflow→tank credit.
    const bloodBankStacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('BLOOD_BANK') : 0;
    const effectiveCredit = bloodBankStacks > 0 ? credit * 2 : credit;
    this.player._tankProgress += effectiveCredit / TANK_OVERFLOW_HP;

    while (this.player._tankProgress >= 1 && this.healthTanks < MAX_HEALTH_TANKS) {
        this.healthTanks++;
        this.player._tankProgress -= 1;
        this.events.emit('audio:powerup');
        this.events.emit('ui:update-tanks', { tanks: this.healthTanks });
        if (typeof this.spawnTankRecharge === 'function') {
            this.spawnTankRecharge(this.healthTanks);
        }
    }
    // Cap progress at <1 once at max tanks so overflow doesn't sit forever.
    if (this.healthTanks >= MAX_HEALTH_TANKS && this.player._tankProgress > 1) {
        this.player._tankProgress = 1;
    }
}

export function handlePlayerDeath() {
    const dx = this.player.x;
    const dy = this.player.y;
    const playerAngle = this.player.angle || 0;

    this.deathLocation = { x: dx, y: dy };

    // Vaporize the LAST triangle (the bottom-left, which is what's
    // rendered when tanks=1). healthTanks is already 0 by the time
    // handlePlayerDeath fires, so the FX site is computed for "loss
    // from 1 → 0".
    if (typeof this.spawnTriforceVaporize === 'function' &&
        typeof this.getDisappearingTankPos === 'function') {
        const tri = this.getDisappearingTankPos(
            1, HUD_TRIFORCE_LEFT_X, HUD_BAR_CENTER_Y,
        );
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

    // 5.88.4 — proper GAME OVER screen with NEW GAME + RESTART WAVE
    // buttons (drawn from hud/overlays.js::drawGameOverScreen on the
    // engine's GAME_OVER render branch). The DOM `ui:show-message`
    // popup is gone; the screen lives on the canvas alongside the rest
    // of the HUD so it can carry buttons + survival summary.
    this.game.state = GAME_STATES.GAME_OVER;
    this.checkSurvivalRecord();
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
