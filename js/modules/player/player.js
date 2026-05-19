// Player ship entity
import { GAME_CONFIG } from '../core/constants.js';
import { random, wrap } from '../core/utils.js';
import * as weapons from './weapons.js';
import * as skills from './skills.js';
import * as progression from './progression.js';
import * as playerRenderer from './renderer.js';
import { scoreItem } from '../world/item-system.js';
// Mobile auto-fire (5.92.0): when running in mobile mode the player
// has no spare hand to tap a power-weapon button — the spec auto-
// fires the equipped power weapon the moment it's ready (off
// cooldown, or fully charged for CHARGE_SHOT). The desktop path is
// unchanged; isMobile() returns false off touch devices unless the
// `?mobile=1` URL param is set.
import { isMobile } from '../platform/platform-detect.js';

export class Player {
    constructor() {
        // One-time setup properties
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.lastX = 0;
        this.lastY = 0;
        this.rotation = 0;
        this.radius = 12;
        // 5.88.5 — base max HP bumped 25 → 40 for the energy-tank hit
        // model. With no post-hit invuln window, low-base HP meant a
        // single sustained burst could clip through a tank in one go;
        // 40 gives the player ~2 hits of headroom per tank at typical
        // enemy damage values, so picked-up health actually has room
        // to land before the next consume-tank trigger.
        this.health = 40;
        this.maxHealth = 40;
        this.healthTanks = 0; // engine init overrides to 3 (5.88.3 spare-count semantics)
        this.shield = 15; // 15% damage reduction (start with basic armor for survivability)
        this.invulnerable = false;
        this.lastHitTime = 0;
        this.lastBlinkTime = 0;
        
        // Critical hit system
        this.baseCritChance = 8; // 8% base critical hit chance (visibly noticeable on Storm Needles spam)
        this.baseCritDamage = 200; // 200% base critical hit damage (2x)
        
        // WASD + Mouse controls
        this.thrustPower = 2.0 * GAME_CONFIG.TICK_SCALE; // Scaled for tick rate

        // ── Thrust juice state ──
        this.thrustLevel = 0;         // 0 = idle, ramps to 1 when thrusting
        this.lastThrustTime = 0;      // timestamp of last active thrust input
        this.engineStartup = 0;       // 0→1 ramp for startup shudder
        this.wasThrusting = false;    // edge detection for idle→thrust transition
        
        // Auto-firing system
        this.autoFireTimer = 0;
        this.baseFireRate = 400; // Base auto-fire rate in ms (halved frequency for more rapid fire upgrade value)
        
        // Audio sync - shoot sound matches fire rate exactly
        this.lastShootSound = 0;
        
        // Charging shot system
        this.isCharging = false;
        this.chargeStartTime = 0;
        this.chargeLevel = 0; // 0-1 charge level
        this.maxChargeTime = 5000; // 5 seconds for full charge
        this.minChargeTime = 3000; // 3 seconds for basic charge
        
        // Pause system for charge shot
        this.chargePaused = false;
        this.pausedChargeTime = 0; // Accumulated charge time when paused
        
        // Shot timing — Date.now() based (immune to frame rate variation)
        this.lastShotTime = 0;
        this.canShoot = true;
        
        // Hit streak combo system
        this.hitStreak = 0; // Current consecutive hit streak
        this.currentShotHits = 0; // Hits for the current shot
        this.shotFired = false; // Whether a shot is currently active
        this.activeShotBullets = 0; // Number of bullets from current shot still active
        
        // Powerup system
        this.powerups = new Map(); // Map of powerup type -> {stacks, timeRemaining}

        // 6.0.0 — Player leveling RETIRED. Wave is the new "level."
        // Fields kept (as inert constants) so legacy readers don't NPE,
        // but XP no longer accumulates and skillPoints never increases.
        // Powerups are bought with GOLD now (see ui-manager.purchasePowerup
        // + shop-manager). See progression.js for the no-op stubs.
        this.level = 1;
        this.experience = 0;
        this.experienceToNextLevel = Infinity;
        this.skillPoints = 0;

        // Weapon system. All primaries / powers / skills are FREE and
        // selectable from start (5.64.11). The owned-sets are still
        // tracked for legacy upgrade-tree compatibility but the pause
        // menu treats every weapon and skill as equippable.
        this.activePrimary = 'PULSE_CANNON';
        this.activePower = 'CHARGE_SHOT';
        this.activeSkill = 'BULWARK';        // single equipped skill (no slots)
        this.ownedPrimaries = new Set(['PULSE_CANNON']);
        this.ownedPowers = new Set(['CHARGE_SHOT']);
        this.ownedSkills = new Set(['BULWARK']);

        // Streak buff — set by combat-manager.onEnemyKill when the kill
        // streak crosses a tier threshold. Drives damage multiplier and the
        // streak indicator HUD. 1.0 = no buff, 1.5 = EMPOWERED, 2.0 = UNSTOPPABLE.
        this.streakDamageMult = 1;
        this.streakBuffEndTime = 0;
        this.streakTierLabel = null;

        // Defense skill — single equipped slot (5.64.11 — was 4 slots
        // bound to keys 1-4). SHIFT cycles, SPACE activates.
        this.activeSkillCooldown = 0;
        this.activeSkillEffects = new Map(); // skill id -> {timeRemaining, ...state}

        // Power weapon cooldown
        this.powerCooldown = 0;

        // Lance beam state (5.64.15 — continuous tether; beamTimer kept
        // for any legacy code paths but no longer drives the beam).
        this.beamActive = false;
        this.beamTimer = 0;
        this.beamAngle = 0;
        this.beamHitDist = 0;

        // Mine state
        this.activeMines = [];

        // Nova blast state
        this.novaRings = [];

        // Lightning arc state (5.64.15 — continuous tether replaces
        // the discrete-cast chain; lightningChains stays for any legacy
        // entry points but is unused by the live beam path).
        this.lightningChains = [];
        this.lightningArcActive = false;
        this.lightningArcTimer = 0;
        this.lightningArcTarget = null;

        // Missile state
        this.activeMissiles = [];

        // Rail driver state
        this.lastPrimaryFireTime = 0; // for Railgun Capacitor upgrade

        // Storm needles counter
        this.needleCount = 0;

        // Scatter gun shot counter
        this.scatterShotCount = 0;

        // Deflector orbs state
        this.deflectorOrbs = [];

        // Dash state (5.93.0 — was PHASE_DASH defense skill, now a
        // SHIFT-key core movement primitive).
        //   isDashing      — true during the active dash burst; doubles as
        //                    the i-frame signal (see isDashIFrameActive()).
        //   dashTimer      — ms remaining in the current dash burst.
        //   dashVelX/VelY  — fixed-velocity vector for the dash (px/sec);
        //                    integrated each frame in skills.updateActiveSkills.
        //   dashCooldown   — ms until the next dash can be triggered; decays
        //                    each frame in updateSkillCooldowns.
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashVelX = 0;
        this.dashVelY = 0;
        this.dashCooldown = 0;

        // Bulwark state
        this.bulwarkActive = false;

        // Repair nanites state
        this.regenActive = false;
        this.regenTimer = 0;

        // EMP state
        this.empActive = false;

        // Tractor shield state
        this.tractorShieldActive = false;
        this.tractorShieldAngle = 0;

        // 6.0.0 — equippedItems table extended to 5 slots. The new
        // `trinket` slot rolls a regen primary (HP/s) — see
        // item-system.js for the rolled-rarity primary-stat curve.
        // New pickups call `equipItem` below which replaces only when
        // the candidate's score (primary + 8× regen affix) beats the
        // currently-equipped item's score.
        this.equippedItems = {
            cockpit: null, hull: null, shielding: null, chassis: null, nanites: null,
        };

        this.initializePlayer();
    }
    
    // Helper method to initialize/reset player properties
    initializePlayer() {
        // Initialize at center of game field (will be updated by game engine)
        this.x = this.width / 2;
        this.y = this.height / 2;
        this.lastX = this.x;
        this.lastY = this.y;
        this.vel = { x: 0, y: 0 };
        this.angle = -Math.PI / 2;
        this.isThrusting = false;
        this.active = true;
        this.canShoot = true;
        this.thrustersDisabled = false;
        this.invincible = false;
        this.invincibilityTimer = 0;
        this.firingDisabled = false;
        // 5.88.0 — `justRespawned` retired with the respawn system; tank
        // consumption (lifecycle._consumeTank) refills HP in place with no
        // post-hit invuln window, so there's nothing to flag here.
        this.levelUpAnimation = { active: false };
        
        // Reset auto-fire timer
        this.autoFireTimer = 0;
        this.lastShotTime = 0; // Fire immediately on respawn
        
        // Wave bonus shield system removed
        
        // Reset powerups
        this.powerups.clear();

        // Reset weapon active states (keep owned weapons/skills)
        this.powerCooldown = 0;
        this.beamActive = false;
        this.beamTimer = 0;
        this.beamHitDist = 0;
        this.activeMines = [];
        this.novaRings = [];
        this.lightningChains = [];
        this.lightningArcActive = false;
        this.lightningArcTimer = 0;
        this.lightningArcTarget = null;
        this.activeMissiles = [];
        this.needleCount = 0;
        this.scatterShotCount = 0;
        this.lastPrimaryFireTime = 0;
        this.activeSkillCooldown = 0;
        this.activeSkillEffects = new Map();
        this.deflectorOrbs = [];
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.bulwarkActive = false;
        this.regenActive = false;
        this.regenTimer = 0;
        this.empActive = false;
        this.tractorShieldActive = false;

        let scale = 1;
        this.radius = (GAME_CONFIG.SHIP_SIZE * scale) / 2;
        // Player mass (smaller than most asteroids)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.5;
    }
    
    reset() {
        this.initializePlayer();
    }
    
    /**
     * 6.0.0 — Equip if the candidate's unified score beats the current
     * slot's score. Score normalizes HP / toughness / regen against
     * each other so e.g. an item with high regen affix can edge a
     * slightly-higher-HP item. See `scoreItem` in item-system.js.
     *
     * Returns:
     *   { equipped: true,  replaced: prevItemOrNull }  on successful equip
     *   { equipped: false, current: currentItem }      when not an upgrade
     *
     * Side effects on equip:
     *   - HP items grow getEffectiveMaxHealth → bump current health by
     *     the bonus delta so the wider bar isn't visibly empty.
     */
    equipItem(item) {
        if (!item || !item.slot) return { equipped: false, current: null };
        if (!this.equippedItems) {
            this.equippedItems = {
                cockpit: null, hull: null, shielding: null, chassis: null, nanites: null,
            };
        }
        const prev = this.equippedItems[item.slot] || null;
        if (prev && scoreItem(item) <= scoreItem(prev)) {
            return { equipped: false, current: prev };
        }
        const prevHp = prev && prev.bonusType === 'hp' ? (prev.bonus || 0) : 0;
        this.equippedItems[item.slot] = item;
        if (item.bonusType === 'hp') {
            const gain = (item.bonus || 0) - prevHp;
            if (gain > 0) {
                const newMax = this.getEffectiveMaxHealth();
                this.health = Math.min(newMax, this.health + gain);
            }
        }
        return { equipped: true, replaced: prev };
    }

    gainExperience(amount) {
        return progression.gainExperience.call(this, amount);
    }

    levelUp() {
        return progression.levelUp.call(this);
    }

    grantLevelUpBonus() {
        return progression.grantLevelUpBonus.call(this);
    }

    updateTempBonuses() {
        return progression.updateTempBonuses.call(this);
    }

    triggerLevelUpEffects() {
        return progression.triggerLevelUpEffects.call(this);
    }

    createLevelUpParticles() {
        return progression.createLevelUpParticles.call(this);
    }

    getExperienceProgress() {
        return progression.getExperienceProgress.call(this);
    }
    
    updateChargingSystem(input, bulletPool, audioManager, particlePool) {
        return weapons.updateChargingSystem.call(this, input, bulletPool, audioManager, particlePool);
    }

    firePrimary(bulletPool, audioManager, particlePool) {
        return weapons.firePrimary.call(this, bulletPool, audioManager, particlePool);
    }

    firePulseCannon(bulletPool, audioManager, config) {
        return weapons.firePulseCannon.call(this, bulletPool, audioManager, config);
    }

    fireStormNeedles(bulletPool, audioManager, config) {
        return weapons.fireStormNeedles.call(this, bulletPool, audioManager, config);
    }

    fireScatterGun(bulletPool, audioManager, config) {
        return weapons.fireScatterGun.call(this, bulletPool, audioManager, config);
    }

    fireRailDriver(bulletPool, audioManager, config) {
        return weapons.fireRailDriver.call(this, bulletPool, audioManager, config);
    }

    fireCluster(bulletPool, audioManager, config) {
        return weapons.fireCluster.call(this, bulletPool, audioManager, config);
    }

    startLanceBeam(audioManager, config) {
        return weapons.startLanceBeam.call(this, audioManager, config);
    }

    applyGlobalBulletUpgrades(bullet) {
        return weapons.applyGlobalBulletUpgrades.call(this, bullet);
    }

    // ── Weapon bindings ──
    getBulletVelocityDamageMult(id)     { return weapons.getBulletVelocityDamageMult.call(this, id); }

    firePower(bulletPool, audioManager, particlePool) {
        return weapons.firePower.call(this, bulletPool, audioManager, particlePool);
    }

    layMine(config) {
        return weapons.layMine.call(this, config);
    }

    fireNova(config) {
        return weapons.fireNova.call(this, config);
    }

    fireLightning(config) {
        return weapons.fireLightning.call(this, config);
    }

    fireMissiles(bulletPool, config) {
        return weapons.fireMissiles.call(this, bulletPool, config);
    }

    pauseChargeShot() {
        return weapons.pauseChargeShot.call(this);
    }

    resumeChargeShot() {
        return weapons.resumeChargeShot.call(this);
    }

    createChargingParticleEffects(particlePool, currentChargeTime, maxChargeTime) {
        return weapons.createChargingParticleEffects.call(this, particlePool, currentChargeTime, maxChargeTime);
    }

    startNewShot(bulletCount = 1) {
        return weapons.startNewShot.call(this, bulletCount);
    }

    registerHit() {
        return weapons.registerHit.call(this);
    }

    onBulletDestroyed() {
        return weapons.onBulletDestroyed.call(this);
    }

    finalizeShotResult() {
        return weapons.finalizeShotResult.call(this);
    }

    getHitStreakMultiplier() {
        return weapons.getHitStreakMultiplier.call(this);
    }

    fireChargedShot(bulletPool, audioManager) {
        return weapons.fireChargedShot.call(this, bulletPool, audioManager);
    }

    disableThrusters(duration) {
        this.thrustersDisabled = true;
        setTimeout(() => {
            this.thrustersDisabled = false;
        }, duration);
    }
    
    makeInvincible(duration) {
        this.invincible = true;
        this.invincibilityTimer = duration;
    }
    
    update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged, gameField = null) {
        if (!this.active) return;

        // Store previous position to track movement
        const prevX = this.x;
        const prevY = this.y;

        // Update invincibility timer (still used by deliberate-save skills:
        // REFLEXES, LAST_STAND, plus the wave-start grace window). The
        // SHIFT-key dash i-frames live on `isDashing` / `dashTimer` and
        // are checked via `isDashIFrameActive()` at the collision sites
        // — they don't go through invincibilityTimer.
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= GAME_CONFIG.LOGIC_TICK_MS;
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.invincibilityTimer = 0;
                this.firingDisabled = false;
            }
        }

        // 6.0.1 — updateTempBonuses() + levelUpAnimation tick removed.
        // Both were no-op since 6.0.0 (the temp-bonus list never gets
        // populated and the animation flag never gets set).

        // Update powerups
        this.updatePowerups();

        // ── Aim resolution (5.74) ──
        // Priority: Auto Aim > Arrow-key rotation > Aim Assist (cursor snap) > Mouse.
        const ge = window.gameEngine;
        // 6.1.1 — autoPower assist retired. autoFire now controls BOTH
        // primary and power weapon firing — one toggle, both barrels.
        // Mobile FORCES autoFire=true (no toggle) so the player only
        // has to dodge; auto-aim picks targets, auto-fire hammers them,
        // and tapping the canvas triggers a DASH (see mobile-touch.js).
        let assists;
        if (isMobile()) {
            assists = { autoAim: true, autoFire: true, aimAssist: false };
        } else {
            assists = (ge && ge.assists) ? ge.assists : null;
        }

        // Auto Aim — lock onto nearest threat. Overrides everything below.
        let autoAimed = false;
        if (assists && assists.autoAim && ge && ge.findNearestTarget) {
            const target = ge.findNearestTarget(this.x, this.y);
            if (target) {
                input.aimX = target.x;
                input.aimY = target.y;
                autoAimed = true;
            }
        }

        // Arrow-key rotation — hold ←/→ to spin the aim. Constant rate
        // independent of mouse position. Skipped when auto-aim is active.
        if (!autoAimed && (input.rotateLeft || input.rotateRight)) {
            const rotSpeed = 0.06; // ~3.5°/tick @ 60Hz → 210°/s
            if (typeof this._aimAngle !== 'number') this._aimAngle = this.angle;
            if (input.rotateLeft) this._aimAngle -= rotSpeed;
            if (input.rotateRight) this._aimAngle += rotSpeed;
            const range = 1000;
            input.aimX = this.x + Math.cos(this._aimAngle) * range;
            input.aimY = this.y + Math.sin(this._aimAngle) * range;
        } else if (!autoAimed && assists && assists.aimAssist && ge && ge.findNearestTarget) {
            // Aim Assist — when the cursor is close to a threat, snap to it.
            // Snap radius is generous (90px) so light corrections feel sticky.
            const snap = ge.findNearestTarget(input.aimX, input.aimY, 90);
            if (snap) {
                input.aimX = snap.x;
                input.aimY = snap.y;
            }
            // Keep _aimAngle in sync with mouse so a later arrow-press resumes smoothly.
            this._aimAngle = Math.atan2(input.aimY - this.y, input.aimX - this.x);
        } else if (!autoAimed) {
            this._aimAngle = Math.atan2(input.aimY - this.y, input.aimX - this.x);
        }

        // ── Aim angle (computed by the ship physics step below) ──
        // The original code set `this.angle = atan2(aimY - x, aimX - x)`
        // here, *before* the auto-fire check that reads `this.angle`.
        // We compute the same value early so auto-fire still sees the
        // correct angle, then the physics call below sets it again
        // (idempotently, since position hasn't changed yet).
        this.angle = Math.atan2(input.aimY - this.y, input.aimX - this.x);

        // Auto Fire — only triggers when there's actually a destructible
        // target within weapon range AND roughly in line with the current
        // aim. Holding fire when nothing's hittable wastes ammo (visually,
        // and for charged weapons it interrupts charging) and feels noisy.
        //
        // 6.1.1 — Unified assist. autoFire now drives BOTH primary AND
        // power weapon firing (was split via autoPower pre-6.1.1).
        // One toggle, both barrels. Mobile forces this true so the
        // player only has to dodge; auto-aim picks targets, auto-fire
        // hammers them, and tapping the canvas triggers a dash.
        if (assists && assists.autoFire) {
            const primaryCfg = this.getActivePrimaryConfig && this.getActivePrimaryConfig();
            const baseRange = primaryCfg ? (primaryCfg.range || 1) * 2000 : 2000;
            const rangeMult = this.getRangeMultiplier ? this.getRangeMultiplier() : 1;
            const maxRange = baseRange * rangeMult;
            const cone = 25 * Math.PI / 180;
            let canHit = false;
            if (ge && ge.findNearestTarget) {
                const t = ge.findNearestTarget(this.x, this.y, maxRange);
                if (t) {
                    const aimDx = Math.cos(this.angle);
                    const aimDy = Math.sin(this.angle);
                    const tDx = t.x - this.x;
                    const tDy = t.y - this.y;
                    const tLen = Math.hypot(tDx, tDy) || 1;
                    const dot = (aimDx * tDx + aimDy * tDy) / tLen; // cosθ
                    if (dot >= Math.cos(cone)) canHit = true;
                }
            }
            if (canHit) {
                input.fire = true;
                // 6.1.1 — Power weapon auto-fire is now part of the same
                // autoFire toggle. Charge-based powers fire on full
                // charge; cooldown-based powers fire as soon as they're
                // ready and a valid target is acquired.
                const pcfg = this.getActivePowerConfig && this.getActivePowerConfig();
                if (pcfg) {
                    if (pcfg.isChargeBased) {
                        if (this.isFullyCharged) input.fireSecondary = true;
                    } else if (this.isPowerReady && this.isPowerReady()) {
                        input.fireSecondary = true;
                    }
                }
            }
        }

        // Debug player aiming occasionally
        if (Math.random() < 0.01) { // 1% chance
        }

        this.isMoving = input.up || input.down || input.left || input.right;

        // ── Thrust juice: ramp thrustLevel and detect startup ──
        // FX-side state, not physics. Stays on Player.
        const now = Date.now();
        if (this.isMoving && !this.thrustersDisabled) {
            // Detect idle→thrust transition (startup shudder)
            if (!this.wasThrusting && (now - this.lastThrustTime > 1200)) {
                this.engineStartup = 1.0; // trigger startup shudder
            }
            this.lastThrustTime = now;
            this.thrustLevel = Math.min(1, this.thrustLevel + 0.08); // ramp up over ~12 frames
        } else {
            this.thrustLevel = Math.max(0, this.thrustLevel - 0.03); // slow decay over ~33 frames
        }
        this.wasThrusting = this.isMoving && !this.thrustersDisabled;

        // Decay startup shudder — fast punch, not a slow wobble
        if (this.engineStartup > 0) {
            this.engineStartup = Math.max(0, this.engineStartup - 0.06); // ~17 frames ≈ 0.28s
        }

        // ── FX particle effects (must run BEFORE physics) ──
        // These read this.x / this.y, which the physics step below
        // mutates. The original update() emitted these particles between
        // the velocity-integration step and the friction step, so
        // this.x / this.y are the pre-position-update values at this point.

        // Spawn particles during invulnerability (renamed from tractor beam)
        if (this.invincible && Math.random() < 0.3) {
            // Spawn fewer particles less frequently
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            const px = this.x + Math.cos(angle) * dist;
            const py = this.y + Math.sin(angle) * dist;
            particlePool.get(px, py, 'spawnParticle', this.x, this.y, this);
        }

        // Shield boost visual effect - green shimmer around player
        const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');
        if (shieldBoostStacks > 0 && Math.random() < 0.3) {
            const particle = particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                particle.color = '#00ff88'; // Green color matching shield boost
                const angle = random(0, Math.PI * 2);
                const distance = random(20, 35);
                particle.x = this.x + Math.cos(angle) * distance;
                particle.y = this.y + Math.sin(angle) * distance;
                particle.vel.x = Math.cos(angle) * 0.3;
                particle.vel.y = Math.sin(angle) * 0.3;
                particle.life = 30; // Short lived for subtle effect
            }
        }

        // ── Physics step ──
        // Velocity integration → friction → snap-to-zero → max-speed clamp
        // → position update → boundary bounce. Aim angle is set above
        // (line ~535) before the auto-fire check, so we don't re-set it
        // here. Mobile stick overrides velocity + position in the next
        // block.
        if (this.active) {
            const _mobile = isMobile();
            const speedMult = this.getMovementSpeedMultiplier();

            // Velocity integration — WASD direction → moveAngle → per-tick
            // velocity delta scaled by thrustPower * speedMult. Mobile
            // movement comes from the analog stick instead, so we zero
            // out the keyboard contribution there.
            const isMoving = !_mobile && (input.up || input.down || input.left || input.right);
            if (isMoving && !this.thrustersDisabled) {
                let moveX = 0;
                let moveY = 0;
                if (input.left)  moveX -= 1;
                if (input.right) moveX += 1;
                if (input.up)    moveY -= 1;
                if (input.down)  moveY += 1;
                const moveAngle = Math.atan2(moveY, moveX);
                const thrustForce = this.thrustPower * speedMult;
                this.vel.x += Math.cos(moveAngle) * thrustForce;
                this.vel.y += Math.sin(moveAngle) * thrustForce;
            }

            // Friction — Math.pow(0.50, TICK_SCALE) per tick.
            const friction = Math.pow(0.50, GAME_CONFIG.TICK_SCALE);
            this.vel.x *= friction;
            this.vel.y *= friction;

            // Snap to zero (prevents subpixel drift after key release).
            if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;
            if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0;

            // Max-speed clamp — speed boost only contributes 70% of its
            // multiplier to the cap, so upgrades feel powerful without
            // trivializing positioning.
            const effectiveMaxV = GAME_CONFIG.MAX_V * (1 + (speedMult - 1) * 0.7);
            const mag = Math.hypot(this.vel.x, this.vel.y);
            if (mag > effectiveMaxV) {
                this.vel.x = (this.vel.x / mag) * effectiveMaxV;
                this.vel.y = (this.vel.y / mag) * effectiveMaxV;
            }

            // Position update.
            this.x += this.vel.x;
            this.y += this.vel.y;

            // Boundary bounce (damped 0.8 to avoid perpetual edge-rebound).
            if (gameField) {
                const r = this.radius;
                if (this.x - r < 0) {
                    this.x = r;
                    this.vel.x = Math.abs(this.vel.x) * 0.8;
                } else if (this.x + r > gameField.width) {
                    this.x = gameField.width - r;
                    this.vel.x = -Math.abs(this.vel.x) * 0.8;
                }
                if (this.y - r < 0) {
                    this.y = r;
                    this.vel.y = Math.abs(this.vel.y) * 0.8;
                } else if (this.y + r > gameField.height) {
                    this.y = gameField.height - r;
                    this.vel.y = -Math.abs(this.vel.y) * 0.8;
                }
            }
        }

        // 5.100.0 — Mobile drag-to-move (Sky-force-style). Reverses
        // the 5.94 stationary-ship pivot. Reads the virtual analog
        // stick's normalized vector from `input.stickInput` (set each
        // frame by mobile-touch.js) and overrides the physics step's
        // velocity with a lerp toward (stick × MAX_V × mult).
        //
        // Override happens AFTER the physics step so friction snap-to-zero
        // still runs. Position is reset to prevX + new vel so the player's
        // actual movement comes from the stick alone.
        if (isMobile()) {
            const stickIn = (input && input.stickInput) || { x: 0, y: 0, magnitude: 0 };
            const speedMult = this.getMovementSpeedMultiplier();
            const MAX_V_MOBILE = GAME_CONFIG.MAX_V * 1.5 * speedMult;
            const targetVx = stickIn.x * MAX_V_MOBILE;
            const targetVy = stickIn.y * MAX_V_MOBILE;
            // Smooth lerp — 0.22 / frame ≈ 70% in 90 ms (responsive
            // without feeling snappy/twitchy).
            const LERP = 0.22;
            this.vel.x += (targetVx - this.vel.x) * LERP;
            this.vel.y += (targetVy - this.vel.y) * LERP;
            // Decay residue when stick is released (helps the ship
            // come to rest crisply instead of drifting).
            if (stickIn.magnitude < 0.05) {
                this.vel.x *= 0.82;
                this.vel.y *= 0.82;
                if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;
                if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0;
            }
            // Apply movement from prevX/Y so the physics step's
            // position update doesn't double up.
            this.x = prevX + this.vel.x;
            this.y = prevY + this.vel.y;
            // Clamp to the game field bounds so the ship can't escape.
            if (gameField) {
                const padX = this.radius || 12;
                const padY = this.radius || 12;
                const minX = (gameField.x || 0) + padX;
                const maxX = (gameField.x || 0) + gameField.width - padX;
                const minY = (gameField.y || 0) + padY;
                const maxY = (gameField.y || 0) + gameField.height - padY;
                if (this.x < minX) { this.x = minX; this.vel.x = 0; }
                if (this.x > maxX) { this.x = maxX; this.vel.x = 0; }
                if (this.y < minY) { this.y = minY; this.vel.y = 0; }
                if (this.y > maxY) { this.y = maxY; this.vel.y = 0; }
            }
        }

        // Legacy fallback: if no gameField was provided, apply torus
        // wraparound. Both live call sites in game-engine.js pass
        // gameField, so this branch is effectively dead — kept for
        // robustness against off-engine call sites.
        if (!gameField) {
            wrap(this, this.width, this.height);
        }

        // Calculate movement delta and update aim coordinates if player moved.
        const deltaX = this.x - prevX;
        const deltaY = this.y - prevY;
        if ((deltaX !== 0 || deltaY !== 0) && input.updateAimForPlayerMovement) {
            input.updateAimForPlayerMovement(deltaX, deltaY);
        }

        // Charging shot system - charge when holding left-click, fire on release
        this.updateChargingSystem(input, bulletPool, audioManager, particlePool);

        // Charge beam particle effects — always show while charging (independent of primary cooldown)
        if (this.tractorBeamActive && Math.random() < 0.3) {
            this.spawnChargeBeamParticles(particlePool);
        }

        // Defense skill — TAB activates the equipped skill (5.64.14;
        // was SPACE in 5.64.11). Skill cycling lives directly in
        // event-setup.js's F-key handler — no input flag required.
        if (input.activateSkill) {
            this.activateSkill();
            input.activateSkill = false; // consume one-shot pulse
        }

        // 5.93.0 — SHIFT-key dash. One-shot pulse from input-handler.js
        // fires the dash through _triggerDash, which honors the cooldown
        // / already-dashing guards itself. Pulse is consumed regardless
        // so a press during cooldown doesn't queue up a later dash.
        if (input.dashPulse) {
            // 6.1.3 — Mobile tap-to-dash passes a screen-space target
            // (input.dashTargetScreenX/Y). Convert to world coords via
            // the engine helper and hand off to _triggerDash so the
            // dash heads toward where the player tapped. Desktop SHIFT
            // sets no target, so the fallback aim/velocity logic runs.
            let dashWorldX = null, dashWorldY = null;
            const sx = input.dashTargetScreenX;
            const sy = input.dashTargetScreenY;
            if (typeof sx === 'number' && typeof sy === 'number'
                    && ge && typeof ge.screenToWorldCoordinates === 'function') {
                const w = ge.screenToWorldCoordinates(sx, sy);
                if (w && typeof w.x === 'number') {
                    dashWorldX = w.x;
                    dashWorldY = w.y;
                }
            }
            this._triggerDash(audioManager, dashWorldX, dashWorldY);
            input.dashPulse = false; // consume one-shot pulse
            input.dashTargetScreenX = null;
            input.dashTargetScreenY = null;
        }

        // 5.64.15 — beamTimer-based deactivation removed. Lance Beam is
        // now a continuous tether driven by `input.fire` directly in
        // the weapons.js update loop. The legacy timer is preserved but
        // no longer drives state.

        // Update active skill effects (regen, dash, etc.)
        this.updateActiveSkills(1000 / GAME_CONFIG.LOGIC_HZ);

    }

    updateActiveSkills(dt) {
        return skills.updateActiveSkills.call(this, dt);
    }
    
    draw(ctx) {
        return playerRenderer.draw.call(this, ctx);
    }

    drawChargingEffects(ctx) {
        return playerRenderer.drawChargingEffects.call(this, ctx);
    }

    drawCooldownChargingEffects(ctx) {
        return playerRenderer.drawCooldownChargingEffects.call(this, ctx);
    }

    drawLevelUpEffects(ctx) {
        return playerRenderer.drawLevelUpEffects.call(this, ctx);
    }

    drawCooldownTimer(ctx) {
        return playerRenderer.drawCooldownTimer.call(this, ctx);
    }

    spawnChargeBeamParticles(particlePool) {
        return playerRenderer.spawnChargeBeamParticles.call(this, particlePool);
    }
    
    // Powerup management methods
    addPowerup(type, config, isShopItem = false) {
        return progression.addPowerup.call(this, type, config, isShopItem);
    }

    updatePowerups() {
        return progression.updatePowerups.call(this);
    }

    getPowerupStacks(type) {
        return progression.getPowerupStacks.call(this, type);
    }
    
    fireWeapons(bulletPool, audioManager) {
        return weapons.fireWeapons.call(this, bulletPool, audioManager);
    }

    createBullets(bulletPool) {
        return weapons.createBullets.call(this, bulletPool);
    }

    createChargedBullets(bulletPool, sizeMultiplier = 1, speedMultiplier = 1, totalDamage = 20, critChanceBonus = 0, baseHomingStrength = 0) {
        return weapons.createChargedBullets.call(this, bulletPool, sizeMultiplier, speedMultiplier, totalDamage, critChanceBonus, baseHomingStrength);
    }
    
    getMovementSpeedMultiplier() {
        return progression.getMovementSpeedMultiplier.call(this);
    }

    getRangeMultiplier() {
        return progression.getRangeMultiplier.call(this);
    }

    getGoldFindMultiplier() {
        return progression.getGoldFindMultiplier.call(this);
    }

    // 5.114.0 — effective regen HP/sec (powerup stacks + inventory).
    getEffectiveRegen() {
        return progression.getEffectiveRegen.call(this);
    }

    getEffectiveShield() {
        return progression.getEffectiveShield.call(this);
    }

    getEffectiveMaxHealth() {
        return progression.getEffectiveMaxHealth.call(this);
    }

    getEffectiveCritChance() {
        return progression.getEffectiveCritChance.call(this);
    }

    getEffectiveCritDamage() {
        return progression.getEffectiveCritDamage.call(this);
    }

    getKnockbackMultiplier() {
        return progression.getKnockbackMultiplier.call(this);
    }

    getPostDashIframeMs() {
        return progression.getPostDashIframeMs.call(this);
    }

    getEffectiveHealthOrbHealing(baseHealing = 1) {
        return progression.getEffectiveHealthOrbHealing.call(this, baseHealing);
    }

    getEffectiveHealthStarHealing() {
        return progression.getEffectiveHealthStarHealing.call(this);
    }

    getEffectiveBurstStarHealing() {
        return progression.getEffectiveBurstStarHealing.call(this);
    }
    
    // ── Weapon System Methods ──────────────────────────────────────────────

    getActivePrimaryConfig() {
        return weapons.getActivePrimaryConfig.call(this);
    }

    getActivePowerConfig() {
        return weapons.getActivePowerConfig.call(this);
    }

    equipPrimary(weaponId) {
        return weapons.equipPrimary.call(this, weaponId);
    }

    equipPower(weaponId) {
        return weapons.equipPower.call(this, weaponId);
    }

    buyPrimary(weaponId) {
        return weapons.buyPrimary.call(this, weaponId);
    }

    buyPower(weaponId) {
        return weapons.buyPower.call(this, weaponId);
    }

    equipSkill(skillId) {
        return skills.equipSkill.call(this, skillId);
    }

    cycleSkill() {
        return skills.cycleSkill.call(this);
    }

    activateSkill() {
        return skills.activateSkill.call(this);
    }

    // ── SHIFT-key dash (5.93.0) ─────────────────────────────────────────
    // Core movement primitive — no longer a defense skill. Pure player
    // input + position kinematics, so it's MP-safe with no server-side
    // mirror needed (position updates flow through the existing predicted-
    // ship pipeline).
    //
    // Constants exposed as static so unit tests can read them without
    // poking at hand-tuned magic numbers.
    static DASH_DURATION_MS  = 250;
    static DASH_COOLDOWN_MS  = 1500;
    static DASH_DISTANCE_PX  = 135;  // matches the old PHASE_DASH 150px feel after duration tuning

    /**
     * Trigger a dash burst if available. Returns true on success.
     * 6.1.3 — Optional `targetWorldX/Y` arguments steer the dash
     * toward a world-space point (used by the mobile tap-to-dash
     * input). When omitted (desktop SHIFT), falls back to the
     * pre-6.1.3 aim/velocity-direction logic.
     */
    _triggerDash(audioManager = null, targetWorldX = null, targetWorldY = null) {
        if (this.isDashing) return false;
        if (this.dashCooldown > 0) return false;

        let angle;
        if (typeof targetWorldX === 'number' && typeof targetWorldY === 'number') {
            // Tap-directed dash: aim straight at the tap position.
            // Guard against a tap landing exactly on the ship (dist=0
            // would yield NaN). Fall back to current aim angle.
            const dx = targetWorldX - this.x;
            const dy = targetWorldY - this.y;
            if (Math.hypot(dx, dy) < 1) {
                angle = this.angle;
            } else {
                angle = Math.atan2(dy, dx);
            }
        } else {
            // Desktop SHIFT path: prefer aim angle, fall back to
            // velocity direction when actively moving so a mid-strafe
            // dash stays in the strafe direction.
            const speed = Math.hypot(this.vel.x, this.vel.y);
            angle = this.angle;
            if (speed > 0.5) {
                angle = Math.atan2(this.vel.y, this.vel.x);
            }
        }

        // px/sec speed needed to traverse DASH_DISTANCE_PX in DASH_DURATION_MS.
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        this.isDashing    = true;
        this.dashTimer    = Player.DASH_DURATION_MS;
        this.dashVelX     = Math.cos(angle) * dashSpeed;
        this.dashVelY     = Math.sin(angle) * dashSpeed;
        this.dashCooldown = Player.DASH_COOLDOWN_MS;

        // Post-dash i-frame window. Spans the burst itself (already
        // i-frame'd via isDashIFrameActive) plus a configurable tail
        // routed through `invincible`/`invincibilityTimer` so every
        // collision site that already gates on `!player.invincible`
        // honors it for free. Base 1s tail, +2s per PHASE_ECHO stack,
        // capped at 5s (2 stacks). Don't shorten an existing longer
        // window — if BULWARK / LAST_STAND / GUARDIAN granted a bigger
        // invuln just before the dash, keep it.
        const dashInvulnMs = Player.DASH_DURATION_MS + this.getPostDashIframeMs();
        if (this.invincibilityTimer < dashInvulnMs) {
            this.makeInvincible(dashInvulnMs);
        }

        // Audio — keep the existing phaseDash.wav (defense-skill removal
        // doesn't kill the sound). audioManager may be null in test paths;
        // also fall back to the live gameEngine reference if available.
        const audio = audioManager || (this.gameEngine && this.gameEngine.audioManager) || null;
        if (audio && typeof audio.playSound === 'function') {
            audio.playSound('phaseDash');
        }
        return true;
    }

    /** I-frame helper — true while a dash burst is active. */
    isDashIFrameActive() {
        return !!this.isDashing && this.dashTimer > 0;
    }

    getActiveSkillConfig() {
        return skills.getActiveSkillConfig.call(this);
    }

    getEffectivePrimaryFireRate() {
        return weapons.getEffectivePrimaryFireRate.call(this);
    }

    getEffectivePrimaryDamage() {
        return weapons.getEffectivePrimaryDamage.call(this);
    }

    // 5.78.2 — exposed for external callers (combat manager, debug
    // overlays, tests). Mirrors the helper on the weapons module.
    getPlayerLevelDamageMultiplier() {
        return weapons.getPlayerLevelDamageMultiplier.call(this);
    }

    getPowerCooldownRemaining() {
        return weapons.getPowerCooldownRemaining.call(this);
    }

    isPowerReady() {
        return weapons.isPowerReady.call(this);
    }

    updateSkillCooldowns(dt) {
        return skills.updateSkillCooldowns.call(this, dt);
    }

    // Wave bonus shield system removed - replaced with shop system

    die(particlePool, audioManager, uiManager, game, triggerScreenShake) {
        this.active = false;
        game.state = 'GAME_OVER';
        
        audioManager.playPlayerExplosion();
        particlePool.get(this.x, this.y, 'playerExplosion');
        
        // Dramatic screen shake for player death
        if (triggerScreenShake) {
            triggerScreenShake(25, 15, 50); // Much more intense than asteroid destruction
        }
        
        // Show game over message
        const roundedScore = Math.round(game.score);
        const roundedHighScore = Math.round(game.highScore);
        const subtitle = `YOUR SCORE: ${roundedScore}\nHIGH SCORE: ${roundedHighScore}\n\nPress Enter to Restart`;
        uiManager.showMessage('GAME OVER', subtitle);
    }
} 