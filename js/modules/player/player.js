// Player ship entity
import { GAME_CONFIG } from '../core/constants.js';
import { random, wrap } from '../core/utils.js';
import * as weapons from './weapons.js';
import * as skills from './skills.js';
import * as progression from './progression.js';
import * as playerRenderer from './renderer.js';
// Phase-1 multiplayer engine refactor: ship physics extracted to
// `js/sim/ship.js`. The wrapper in `update()` below builds a plain-data
// `ShipState` from `this`, calls `updateShip`, and writes the result
// back. Behavior is byte-for-byte equivalent to the legacy inline code.
import { updateShip } from '../../sim/ship.js';
// MP feature-flag gate: in online mode, abilities that lack full
// Rust-mirror parity are suppressed at the fire-site so they can't
// desync gameplay. Solo runs are unaffected (the helper returns true
// when no online driver is attached). See `js/net/mp-feature-flags.js`
// for the per-ability allowlist.
import { isAbilityMpSafe } from '../../net/mp-feature-flags.js';
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

        // Player leveling system
        this.level = 1;
        this.experience = 0;
        // 5.72.0 — base raised 100 → 400 to slow early leveling.
        // Combined with the 1.5 → 1.7 exponent in progression.levelUp()
        // and the halved kill-XP rate, level-ups drop from ~1/wave to
        // ~1 every 2-3 waves. The 5.71.0 auto-shop on level-up was
        // disruptive partly because levels came too fast.
        // 5.79.16 — Initial threshold matches the new linear curve in
        //   progression.levelUp (200 + (level-1) × 50 → L1→L2 = 200).
        this.experienceToNextLevel = 200; // EXP needed for level 2
        // 5.78.0 — `skillPoints` IS the new "picks" currency (renamed
        // from `powerupPicks`). The 5.76.0 SP-removal cleared the old
        // SP semantics; this field reuses the name for the picks pool
        // since the player never sees both at once.
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
    
    // Player leveling system methods
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

    startLanceBeam(audioManager, config) {
        return weapons.startLanceBeam.call(this, audioManager, config);
    }

    applyGlobalBulletUpgrades(bullet) {
        return weapons.applyGlobalBulletUpgrades.call(this, bullet);
    }

    // ── Weapon bindings ──
    getBulletVelocityDamageMult(id)     { return weapons.getBulletVelocityDamageMult.call(this, id); }

    // ── MP feature-flag suppression helper ─────────────────────────────────
    // Returns true when an ability should be suppressed because the engine
    // is online AND the ability lacks full Rust-mirror parity. The engine
    // driver lives on `window.engineDriver` (set in `main.js`); the same
    // lookup convention game-engine.js's `_mpDriverIfOnline()` uses. In
    // solo runs (or before the driver is attached) this returns false and
    // the gate is a no-op.
    _isAbilitySuppressedByMp(abilityId) {
        const driver = (typeof window !== 'undefined') ? window.engineDriver : null;
        if (!driver || !driver.isOnline) return false;
        return !isAbilityMpSafe(abilityId);
    }

    firePower(bulletPool, audioManager, particlePool) {
        // MP gate — suppress power weapons that don't yet have a Rust mirror.
        // The cooldown gate is upstream in weapons.updateChargingSystem(),
        // and the caller (weapons.js:163) clears `input.fireSecondary`
        // unconditionally after calling us, so an early-return here cleanly
        // no-ops: no entity spawn, no audio, no FX, no cooldown consumed.
        if (this._isAbilitySuppressedByMp(this.activePower)) return;
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

        // Expire temporary level-up bonuses
        this.updateTempBonuses();

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

        // Update level up animation
        if (this.levelUpAnimation.active) {
            const elapsed = Date.now() - this.levelUpAnimation.startTime;
            if (elapsed >= this.levelUpAnimation.duration) {
                this.levelUpAnimation.active = false;
                this.levelUpTextInfo = { active: false }; // Clear level up text
            }
        }

        // Update powerups
        this.updatePowerups();

        // ── Aim resolution (5.74) ──
        // Priority: Auto Aim > Arrow-key rotation > Aim Assist (cursor snap) > Mouse.
        const ge = window.gameEngine;
        const assists = ge && ge.assists ? ge.assists : null;

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
        // Charge-based power weapons still charge passively (weapons.js
        // starts the charge unconditionally); we only flip fireSecondary
        // on once a target is hittable AND charging is full.
        if (assists && assists.autoFire) {
            const primaryCfg = this.getActivePrimaryConfig && this.getActivePrimaryConfig();
            const baseRange = primaryCfg ? (primaryCfg.range || 1) * 400 : 400;
            const rangeMult = this.getRangeMultiplier ? this.getRangeMultiplier() : 1;
            const maxRange = baseRange * rangeMult;
            // Angular tolerance: ±25° cone around the aim. Tight enough
            // to avoid firing at off-screen targets, loose enough that
            // small auto-aim correction lag doesn't choke fire.
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
                const cfg = this.getActivePowerConfig && this.getActivePowerConfig();
                if (cfg) {
                    if (cfg.isChargeBased) {
                        if (this.isFullyCharged) input.fireSecondary = true;
                    } else if (this.isPowerReady && this.isPowerReady()) {
                        input.fireSecondary = true;
                    }
                }
            }
        }

        // ── Mobile auto-fire — power weapon (5.92.0) ──
        // Mobile mode has no spare hand for a power-fire button (tap
        // fires primary, long-press opens the weapon radial). So the
        // spec auto-triggers the equipped power weapon the moment it's
        // ready: cooldown-based weapons fire on `isPowerReady()`,
        // charge-based weapons (CHARGE_SHOT) fire on `isFullyCharged`.
        //
        // We set `input.fireSecondary = true` rather than calling
        // `this.firePower(...)` directly so the existing pipeline runs
        // unchanged:
        //   • updateChargingSystem reads the flag, checks cooldown / charge
        //     gates, and calls `this.firePower()` itself (which already
        //     honors the MP feature-flag gate added in 5.84+).
        //   • The flag is cleared in updateChargingSystem after the shot,
        //     so we don't chain stream-fire a single rising edge.
        //
        // Gates (mirrors the gates the desktop assist path uses, plus a
        // few mobile-specific ones the spec calls out):
        //   • Don't fire if the radial menu is open (mid weapon-swap).
        //   • Don't fire if no power weapon is equipped (activePower null/empty).
        //   • Don't fire if the player is firing-disabled (death/respawn).
        //   • Game-state gating (pause / shop / game-over / wave intro)
        //     is implicit: Player.update is only called from gameLoop in
        //     the active gameplay states; pause/shop short-circuit the
        //     whole logic step upstream.
        if (isMobile() && this.activePower && !this.firingDisabled) {
            const radialOpen = !!(ge && ge.radialMenu && ge.radialMenu.isOpen && ge.radialMenu.isOpen());
            if (!radialOpen) {
                const cfg = this.getActivePowerConfig && this.getActivePowerConfig();
                if (cfg) {
                    if (cfg.isChargeBased) {
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
        // the velocity-integration step and the friction step (lines
        // 552-575 of the pre-extraction player.js), so this.x / this.y
        // were the pre-position-update values at that point. Running
        // them here, before updateShip, preserves that exact pixel
        // placement — byte-for-byte parity with the legacy ordering.

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

        // ── Physics step (extracted to js/sim/ship.js) ──
        // The wrapper builds a plain-data ShipState from `this`, hands
        // it to the pure `updateShip` function, and writes the result
        // back. This is the Phase-1 deliverable for the multiplayer
        // engine refactor; behavior is byte-for-byte equivalent to the
        // legacy inline code (aim, thrust, friction, snap-to-zero,
        // max-speed clamp, position update, boundary bounce).
        //
        // Reusable scratch objects to avoid per-tick allocation in the
        // solo path. The pure sim doesn't need fresh objects each call.
        if (!this._shipScratch) {
            this._shipScratch = {
                player: 0,
                x: 0, y: 0, vx: 0, vy: 0,
                angle: 0,
                hp: 0, maxHp: 0, shield: 0,
                radius: 0,
                field: null,
                active: true,
            };
        }
        if (!this._inputScratch) {
            this._inputScratch = {
                up: false, down: false, left: false, right: false,
                aimX: 0, aimY: 0,
                thrustPower: 0,
                speedMult: 1,
                thrustersDisabled: false,
                maxV: GAME_CONFIG.MAX_V,
                friction: Math.pow(0.50, GAME_CONFIG.TICK_SCALE),
                velEpsilon: 0.05,
                bounceDamp: 0.8,
            };
        }
        const ship = this._shipScratch;
        ship.x = this.x;
        ship.y = this.y;
        ship.vx = this.vel.x;
        ship.vy = this.vel.y;
        ship.angle = this.angle;
        ship.hp = this.health;
        ship.maxHp = this.maxHealth;
        ship.shield = this.shield;
        ship.radius = this.radius;
        ship.active = this.active;
        // Set ship.field only when the engine passes a gameField. When
        // null (legacy fallback path), updateShip skips the boundary
        // step entirely and the wrapper handles wraparound below —
        // matching the original `wrap(this, this.width, this.height)`
        // call exactly.
        ship.field = gameField || null;

        const sim = this._inputScratch;
        sim.up = !!input.up;
        sim.down = !!input.down;
        sim.left = !!input.left;
        sim.right = !!input.right;
        sim.aimX = input.aimX;
        sim.aimY = input.aimY;
        sim.speedMult = this.getMovementSpeedMultiplier();
        sim.thrustPower = this.thrustPower;
        sim.thrustersDisabled = !!this.thrustersDisabled;
        // maxV / friction / velEpsilon / bounceDamp are constants — set once.

        updateShip(ship, sim, GAME_CONFIG.LOGIC_TICK_MS / 1000, null, null);

        // Write physics back to Player.
        this.x = ship.x;
        this.y = ship.y;
        this.vel.x = ship.vx;
        this.vel.y = ship.vy;
        this.angle = ship.angle;

        // Legacy fallback: if no gameField was provided, the original
        // code applied torus wraparound on this.width / this.height.
        // updateShip skips the boundary step when ship.field is null,
        // so we replicate that behavior here. Both live call sites in
        // game-engine.js pass gameField, so this branch is effectively
        // dead — kept for robustness against off-engine call sites.
        if (!gameField) {
            wrap(this, this.width, this.height);
        }

        // Calculate movement delta and update aim coordinates if player moved.
        // The legacy code did this after boundary-bounce; the new physics
        // path produces the same final (x, y), so the delta is identical.
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
            this._triggerDash(audioManager);
            input.dashPulse = false; // consume one-shot pulse
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
        // MP gate — the five remaining defense skills mutate ship state
        // in ways the server doesn't model yet, so they're suppressed
        // in online mode. (PHASE_DASH was the sixth, moved to the SHIFT
        // key as a core MP-safe movement primitive in 5.93.0.)
        // The Q-key one-shot pulse is consumed in update() regardless
        // (see input.activateSkill = false right after the call site),
        // so an early-return here means no cooldown, no FX, no audio,
        // and the input stays consumed.
        if (this._isAbilitySuppressedByMp(this.activeSkill)) return false;
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

    /** Trigger a dash burst if available. Returns true on success. */
    _triggerDash(audioManager = null) {
        if (this.isDashing) return false;
        if (this.dashCooldown > 0) return false;

        // Direction: prefer the *aim* angle (this.angle is the live aim
        // direction, set above in update() and by ship physics). This
        // makes the dash feel like a thrust forward — same as charging
        // movement uses. Falls back to the current velocity direction
        // when the ship has significant momentum to keep the dash
        // intuitive while sidestepping.
        const speed = Math.hypot(this.vel.x, this.vel.y);
        let angle = this.angle;
        if (speed > 0.5) {
            // Use the velocity-aligned angle when actively moving so a
            // dash mid-strafe stays in the strafe direction.
            angle = Math.atan2(this.vel.y, this.vel.x);
        }

        // px/sec speed needed to traverse DASH_DISTANCE_PX in DASH_DURATION_MS.
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        this.isDashing    = true;
        this.dashTimer    = Player.DASH_DURATION_MS;
        this.dashVelX     = Math.cos(angle) * dashSpeed;
        this.dashVelY     = Math.sin(angle) * dashSpeed;
        this.dashCooldown = Player.DASH_COOLDOWN_MS;

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