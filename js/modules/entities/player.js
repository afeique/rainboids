// Player ship entity
import { GAME_CONFIG } from '../constants.js';
import { random, wrap, glowSpriteCache } from '../utils.js';
import { rgba } from '../color-cache.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from '../weapon-data.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Player {
    constructor() {
        // One-time setup properties
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.lastX = 0;
        this.lastY = 0;
        this.rotation = 0;
        this.radius = 12;
        this.health = 25;
        this.maxHealth = 25;
        this.shieldTanks = 1; // Start with 1 shield tank
        this.shield = 15; // 15% damage reduction (start with basic armor for survivability)
        this.invulnerable = false;
        this.lastHitTime = 0;
        this.lastBlinkTime = 0;
        
        // Critical hit system
        this.baseCritChance = 5; // 5% base critical hit chance
        this.baseCritDamage = 200; // 200% base critical hit damage (2x)
        
        // WASD + Mouse controls
        this.thrustPower = 0.18 * GAME_CONFIG.TICK_SCALE; // Scaled for tick rate
        
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
        
        // Shot cooldown system
        this.shotCooldownTime = 400; // 400ms cooldown between shots
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
        this.experienceToNextLevel = 100; // EXP needed for level 2
        this.skillPoints = 0; // Skill points for defensive upgrades

        // Weapon system
        this.activePrimary = 'PULSE_CANNON';
        this.activePower = 'CHARGE_SHOT';
        this.ownedPrimaries = new Set(['PULSE_CANNON']);
        this.ownedPowers = new Set(['CHARGE_SHOT']);
        this.ownedSkills = new Set();

        // Defense skill slots (number keys 1-4)
        this.skillSlots = [null, null, null, null];
        this.skillCooldowns = [0, 0, 0, 0];
        this.activeSkillEffects = new Map(); // skill id -> {timeRemaining, ...state}

        // Power weapon cooldown
        this.powerCooldown = 0;

        // Lance beam state
        this.beamActive = false;
        this.beamTimer = 0;
        this.beamAngle = 0;

        // Mine state
        this.activeMines = [];

        // Nova blast state
        this.novaRings = [];

        // Lightning arc state
        this.lightningChains = [];

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

        // Phase dash state
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashVelX = 0;
        this.dashVelY = 0;

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
        this.justRespawned = false;
        this.levelUpAnimation = { active: false };
        
        // Reset auto-fire timer
        this.autoFireTimer = 0;
        
        // Wave bonus shield system removed
        
        // Reset powerups
        this.powerups.clear();

        // Reset weapon active states (keep owned weapons/skills)
        this.powerCooldown = 0;
        this.beamActive = false;
        this.beamTimer = 0;
        this.activeMines = [];
        this.novaRings = [];
        this.lightningChains = [];
        this.activeMissiles = [];
        this.needleCount = 0;
        this.scatterShotCount = 0;
        this.lastPrimaryFireTime = 0;
        this.skillCooldowns = [0, 0, 0, 0];
        this.activeSkillEffects = new Map();
        this.deflectorOrbs = [];
        this.isDashing = false;
        this.dashTimer = 0;
        this.bulwarkActive = false;
        this.regenActive = false;
        this.regenTimer = 0;
        this.empActive = false;
        this.tractorShieldActive = false;

        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        this.radius = (GAME_CONFIG.SHIP_SIZE * scale) / 2;
        // Player mass (smaller than most asteroids)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.5;
    }
    
    reset() {
        this.initializePlayer();
    }
    
    // Player leveling system methods
    gainExperience(amount) {
        this.experience += amount;
        
        // Check for level up
        while (this.experience >= this.experienceToNextLevel) {
            this.levelUp();
        }
    }
    
    levelUp() {
        this.experience -= this.experienceToNextLevel;
        this.level++;

        // Calculate next level requirements (exponential scaling)
        this.experienceToNextLevel = Math.floor(100 * Math.pow(1.5, this.level - 1));

        // Grant skill points for leveling up
        this.skillPoints += 1;

        // Health boost every 3 levels
        if (this.level % 3 === 0) {
            this.maxHealth += 5;
            this.health = Math.min(this.health + 5, this.maxHealth);
        }

        // Grant a random temporary bonus pair on level up
        this.lastLevelUpBonus = this.grantLevelUpBonus();

        // Trigger level up effects
        this.triggerLevelUpEffects();

        return true;
    }

    grantLevelUpBonus() {
        // Pick 2 random upgrades to grant as temporary buffs (45 seconds)
        const bonusPool = [
            'RAPID_FIRE', 'MULTI_SHOT', 'HOMING', 'SPEED_BOOST',
            'PIERCING', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'LONG_RANGE',
            'SHIELD_BOOST', 'BIG_BULLETS', 'EXPLOSIVE'
        ];

        // Shuffle and pick 2
        const shuffled = bonusPool.sort(() => Math.random() - 0.5);
        const picks = [shuffled[0], shuffled[1]];
        const duration = 45000; // 45 seconds

        // Track temporary bonuses for expiration
        if (!this.tempBonuses) this.tempBonuses = [];

        for (const pickId of picks) {
            // Add 1 temporary stack
            const config = window.gameEngine?.getPowerupConfig(pickId);
            if (config) {
                this.addPowerup(pickId, { ...config, duration }, false);
                this.tempBonuses.push({
                    id: pickId,
                    name: config.name,
                    expiresAt: Date.now() + duration
                });
            }
        }

        return picks;
    }

    updateTempBonuses() {
        if (!this.tempBonuses || this.tempBonuses.length === 0) return;

        const now = Date.now();
        this.tempBonuses = this.tempBonuses.filter(bonus => {
            if (now >= bonus.expiresAt) {
                // Remove the temporary stack
                const powerup = this.powerups.get(bonus.id);
                if (powerup && powerup.stacks > 0) {
                    powerup.stacks--;
                    if (powerup.stacks <= 0) {
                        this.powerups.delete(bonus.id);
                    }
                }
                return false;
            }
            return true;
        });
    }
    
    triggerLevelUpEffects() {
        // Set level up animation flag
        this.levelUpAnimation = {
            active: true,
            startTime: Date.now(),
            duration: 2000
        };

        // Build subtitle with bonus info
        let subtitle = '+1 Skill Point';
        if (this.lastLevelUpBonus && this.lastLevelUpBonus.length === 2) {
            const ge = window.gameEngine;
            const name1 = ge?.getPowerupConfig(this.lastLevelUpBonus[0])?.name || this.lastLevelUpBonus[0];
            const name2 = ge?.getPowerupConfig(this.lastLevelUpBonus[1])?.name || this.lastLevelUpBonus[1];
            subtitle += `\nBonus: ${name1} + ${name2} (45s)`;
        }
        if (this.level % 3 === 0) {
            subtitle += '\n+5 Max Health';
        }

        if (window.gameEngine && window.gameEngine.uiManager) {
            window.gameEngine.uiManager.showMessage(`LEVEL ${this.level}!`, subtitle, 4000, 'top');
        }
        
        // Create level up particles via game engine
        if (window.gameEngine && window.gameEngine.particlePool) {
            this.createLevelUpParticles();
        }
    }
    
    createLevelUpParticles() {
        const gameEngine = window.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;
        
        // Create golden burst particles around player
        for (let i = 0; i < 20; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                const angle = (i / 20) * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;
                particle.color = '#FFD700'; // Gold color
                particle.radius = 2 + Math.random() * 2;
                particle.life = 60 + Math.random() * 40;
            }
        }
        
        // Create expanding golden ring
        const ring = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 3);
        if (ring) {
            ring.color = '#FFD700';
        }
        
        // Create secondary ring with delay
        setTimeout(() => {
            const ring2 = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 5);
            if (ring2) {
                ring2.color = '#FFA500'; // Orange
            }
        }, 300);
    }
    
    getExperienceProgress() {
        return this.experience / this.experienceToNextLevel;
    }
    
    updateChargingSystem(input, bulletPool, audioManager, particlePool) {
        // Skip updates while shop/pause is open
        if (this.chargePaused) {
            return;
        }

        const now = Date.now();
        const dt = 1000 / GAME_CONFIG.LOGIC_HZ; // ms per tick
        this.updateSkillCooldowns(dt);

        // ── Primary weapon: auto-fire on cooldown ──
        const effectiveFireRate = this.getEffectivePrimaryFireRate();
        this.canShoot = (now - this.lastShotTime) >= effectiveFireRate;

        if (this.canShoot) {
            this.firePrimary(bulletPool, audioManager);
            this.lastShotTime = now;
            this.lastPrimaryFireTime = now;
        }

        // ── Power weapon: charge-based or cooldown-based ──
        const powerConfig = this.getActivePowerConfig();

        if (powerConfig.isChargeBased) {
            // Charge shot behavior (existing)
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargeStartTime = now;
                this.chargeLevel = 0;
            }

            const currentChargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;
            const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
            const reducedMaxChargeTime = Math.max(1000, this.maxChargeTime - (chargeSpeedStacks * 1000));

            this.chargeLevel = Math.min(1, currentChargeTime / reducedMaxChargeTime);

            const isFullyCharged = currentChargeTime >= reducedMaxChargeTime;
            this.tractorBeamActive = this.isCharging && !isFullyCharged;
            this.isFullyCharged = isFullyCharged;

            const shouldFire = isMobile()
                ? isFullyCharged
                : (input.fireSecondary && currentChargeTime >= this.minChargeTime);

            if (shouldFire) {
                this.fireChargedShot(bulletPool, audioManager);
                this.isCharging = false;
                this.chargeLevel = 0;
                this.pausedChargeTime = 0;
                input.fireSecondary = false;
            }
        } else {
            // Cooldown-based power weapon
            this.isCharging = false;
            this.chargeLevel = 0;
            this.tractorBeamActive = false;
            this.isFullyCharged = false;

            if (input.fireSecondary && this.isPowerReady()) {
                this.firePower(bulletPool, audioManager, particlePool);
                input.fireSecondary = false;
            }
        }
    }

    // ── Primary weapon dispatch ──
    firePrimary(bulletPool, audioManager) {
        const config = this.getActivePrimaryConfig();

        switch (this.activePrimary) {
            case 'PULSE_CANNON':
                this.firePulseCannon(bulletPool, audioManager, config);
                break;
            case 'STORM_NEEDLES':
                this.fireStormNeedles(bulletPool, audioManager, config);
                break;
            case 'SCATTER_GUN':
                this.fireScatterGun(bulletPool, audioManager, config);
                break;
            case 'RAIL_DRIVER':
                this.fireRailDriver(bulletPool, audioManager, config);
                break;
            case 'LANCE_BEAM':
                // Beam handled in update loop, not individual shots
                this.startLanceBeam(audioManager, config);
                break;
            default:
                this.firePulseCannon(bulletPool, audioManager, config);
        }
    }

    firePulseCannon(bulletPool, audioManager, config) {
        const damage = this.getEffectivePrimaryDamage();
        const echoStacks = this.getPowerupStacks('ECHO_ROUND');
        this.createChargedBullets(bulletPool, 1, 1, damage, 0, 0);
        audioManager.playShoot();

        // Echo Round: chance to fire a bonus bullet
        if (echoStacks > 0 && Math.random() < echoStacks * 0.1) {
            this.createChargedBullets(bulletPool, 0.8, 1, damage * 0.7, 0, 0);
        }
    }

    fireStormNeedles(bulletPool, audioManager, config) {
        this.needleCount++;
        const damage = this.getEffectivePrimaryDamage();
        const spreadAngle = config.spreadAngle;

        // Fire a single small needle with random spread
        const angleOffset = (Math.random() - 0.5) * spreadAngle;
        const bullet = bulletPool.get(this.x, this.y, this.angle + angleOffset);
        if (bullet) {
            bullet.damage = damage;
            bullet.radius *= config.bulletSize;
            bullet.baseRadius = bullet.radius;
            bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
            bullet.maxLife = Math.round(bullet.maxLife * config.range);
            bullet.color = config.color;

            // Apply global upgrades
            this.applyGlobalBulletUpgrades(bullet);

            // Poison Tip
            if (this.getPowerupStacks('POISON_TIP') > 0) {
                bullet.poisonDamage = 1;
                bullet.poisonDuration = 2000;
            }

            // Suppression
            if (this.getPowerupStacks('SUPPRESSION') > 0) {
                bullet.suppressionDuration = 1500;
            }

            // Static Charge: every 10th needle
            const staticStacks = this.getPowerupStacks('STATIC_CHARGE');
            if (staticStacks > 0 && this.needleCount % 10 === 0) {
                bullet.chainLightning = staticStacks;
            }
        }
        audioManager.playShoot();
    }

    fireScatterGun(bulletPool, audioManager, config) {
        this.scatterShotCount++;
        const damage = this.getEffectivePrimaryDamage();
        const buckshotStacks = this.getPowerupStacks('BUCKSHOT');
        const tightChokeStacks = this.getPowerupStacks('TIGHT_CHOKE');
        const slugRound = this.getPowerupStacks('SLUG_ROUND') > 0 && this.scatterShotCount % 4 === 0;

        if (slugRound) {
            // Single powerful slug
            const bullet = bulletPool.get(this.x, this.y, this.angle);
            if (bullet) {
                bullet.damage = damage * 4;
                bullet.radius *= 1.8;
                bullet.baseRadius = bullet.radius;
                bullet.rangeMultiplier = this.getRangeMultiplier() * config.range * 1.5;
                bullet.maxLife = Math.round(bullet.maxLife * config.range * 1.5);
                bullet.color = '#ffaa00';
                this.applyGlobalBulletUpgrades(bullet);
            }
        } else {
            // Pellet spread
            const pelletCount = config.bulletCount + buckshotStacks;
            const spread = config.spreadAngle * Math.pow(0.85, tightChokeStacks);
            const startAngle = this.angle - spread / 2;

            for (let i = 0; i < pelletCount; i++) {
                const pelletAngle = startAngle + (spread * i / (pelletCount - 1 || 1)) + (Math.random() - 0.5) * 0.05;
                const bullet = bulletPool.get(this.x, this.y, pelletAngle);
                if (bullet) {
                    bullet.damage = damage;
                    bullet.radius *= config.bulletSize;
                    bullet.baseRadius = bullet.radius;
                    bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
                    bullet.maxLife = Math.round(bullet.maxLife * config.range);
                    bullet.color = config.color;
                    // Shrapnel upgrade
                    if (this.getPowerupStacks('SHRAPNEL') > 0) {
                        bullet.shrapnelOnExpire = true;
                    }
                    this.applyGlobalBulletUpgrades(bullet);
                }
            }
        }
        audioManager.playShoot();
    }

    fireRailDriver(bulletPool, audioManager, config) {
        const damage = this.getEffectivePrimaryDamage();
        const penetratorStacks = this.getPowerupStacks('PENETRATOR');
        const rangeBonus = 1 + penetratorStacks * 0.5;
        const capacitorStacks = this.getPowerupStacks('RAILGUN_CAPACITOR');

        let finalDamage = damage;
        // Capacitor: 2x damage if idle for 2s
        if (capacitorStacks > 0) {
            const idleTime = Date.now() - this.lastPrimaryFireTime;
            if (idleTime > 2000) {
                finalDamage *= 2;
            }
        }

        const bullet = bulletPool.get(this.x, this.y, this.angle);
        if (bullet) {
            bullet.damage = finalDamage;
            bullet.radius *= config.bulletSize;
            bullet.baseRadius = bullet.radius;
            bullet.piercing = config.piercing;
            bullet.rangeMultiplier = this.getRangeMultiplier() * config.range * rangeBonus;
            bullet.maxLife = Math.round(bullet.maxLife * config.range * rangeBonus);
            bullet.color = config.color;

            // Kinetic Impact
            if (this.getPowerupStacks('KINETIC_IMPACT') > 0) {
                bullet.knockback = 8;
            }

            // Through-and-Through
            if (this.getPowerupStacks('THROUGH_AND_THROUGH') > 0) {
                bullet.damageTrail = true;
            }

            // Speed boost for rail
            const speed = Math.hypot(bullet.vel.x, bullet.vel.y);
            bullet.vel.x = (bullet.vel.x / speed) * speed * config.bulletSpeed;
            bullet.vel.y = (bullet.vel.y / speed) * speed * config.bulletSpeed;

            this.applyGlobalBulletUpgrades(bullet);
        }
        audioManager.playShoot();
    }

    startLanceBeam(audioManager, config) {
        const lingerStacks = this.getPowerupStacks('LINGER');
        const duration = config.beamDuration + lingerStacks * 100;
        this.beamActive = true;
        this.beamTimer = duration;
        this.beamAngle = this.angle;

        const widthStacks = this.getPowerupStacks('BEAM_WIDTH');
        this.beamCurrentWidth = config.beamWidth * (1 + widthStacks * 0.3);
        this.beamDamagePerTick = config.damage;
        this.beamMaxDuration = duration;

        audioManager.playShoot();
    }

    // Apply global offense upgrades to any bullet
    applyGlobalBulletUpgrades(bullet) {
        const homingStacks = this.getPowerupStacks('HOMING');
        const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
        const piercingStacks = this.getPowerupStacks('PIERCING');
        const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

        // Range
        bullet.rangeMultiplier = (bullet.rangeMultiplier || 1) * this.getRangeMultiplier();

        // Crit
        const critChance = this.getEffectiveCritChance();
        if (Math.random() * 100 < critChance) {
            const critMult = this.getEffectiveCritDamage() / 100;
            bullet.damage *= critMult;
            bullet.isCrit = true;
            bullet.color = '#FFFF00';
        }

        // Homing
        if (homingStacks > 0) {
            bullet.homing = true;
            bullet.homingStrength = Math.min(0.4, homingStacks * 0.05);
        }

        // Big bullets
        if (bigBulletStacks > 0) {
            bullet.radius *= (1 + bigBulletStacks * 0.3);
            bullet.baseRadius = bullet.radius;
        }

        // Piercing (additive with weapon built-in)
        if (piercingStacks > 0) {
            bullet.piercing = (bullet.piercing || 0) + piercingStacks;
        }

        // Explosive
        if (explosiveStacks > 0) {
            bullet.explosive = true;
            bullet.explosionRadius = 30 + explosiveStacks * 10;
        }
    }

    // ── Power weapon dispatch ──
    firePower(bulletPool, audioManager, particlePool) {
        const config = this.getActivePowerConfig();

        switch (this.activePower) {
            case 'MINE_LAYER':
                this.layMine(config);
                break;
            case 'NOVA_BLAST':
                this.fireNova(config);
                break;
            case 'LIGHTNING_ARC':
                this.fireLightning(config);
                break;
            case 'MISSILE_SALVO':
                this.fireMissiles(bulletPool, config);
                break;
        }

        this.powerCooldown = config.cooldown;
        audioManager.playShoot();
    }

    layMine(config) {
        const extraPayloadStacks = this.getPowerupStacks('EXTRA_PAYLOAD');
        const maxMines = config.maxMines + extraPayloadStacks;
        const blastRadiusStacks = this.getPowerupStacks('BLAST_RADIUS');

        // Remove oldest mine if at max
        while (this.activeMines.length >= maxMines) {
            this.activeMines.shift();
        }

        this.activeMines.push({
            x: this.x,
            y: this.y,
            armTimer: 1000,  // 1s to arm
            triggerRadius: config.mineRadius,
            blastRadius: config.blastRadius + blastRadiusStacks * 30,
            damage: config.mineDamage,
            magnetic: this.getPowerupStacks('MAGNETIC_MINE') > 0,
            daisyChain: this.getPowerupStacks('DAISY_CHAIN') > 0,
            active: true,
        });
    }

    fireNova(config) {
        const shockwaveStacks = this.getPowerupStacks('SHOCKWAVE');
        const resonanceStacks = this.getPowerupStacks('RESONANCE');

        // Reduce cooldown for resonance
        if (resonanceStacks > 0) {
            this.powerCooldown = Math.max(2000, config.cooldown - resonanceStacks * 1500);
        }

        this.novaRings.push({
            x: this.x,
            y: this.y,
            radius: 0,
            maxRadius: config.ringRadius + shockwaveStacks * 40,
            damage: config.ringDamage,
            duration: config.ringDuration,
            elapsed: 0,
            hitEnemies: new Set(),
            aftershock: this.getPowerupStacks('AFTERSHOCK') > 0,
        });

        // Double Pulse
        if (this.getPowerupStacks('DOUBLE_PULSE') > 0) {
            setTimeout(() => {
                this.novaRings.push({
                    x: this.x,
                    y: this.y,
                    radius: 0,
                    maxRadius: (config.ringRadius + shockwaveStacks * 40) * 0.7,
                    damage: config.ringDamage * 0.6,
                    duration: config.ringDuration,
                    elapsed: 0,
                    hitEnemies: new Set(),
                    aftershock: false,
                });
            }, 300);
        }
    }

    fireLightning(config) {
        const conductorStacks = this.getPowerupStacks('CONDUCTOR');
        const teslaCoilStacks = this.getPowerupStacks('TESLA_COIL');

        if (teslaCoilStacks > 0) {
            this.powerCooldown = Math.max(2000, config.cooldown - teslaCoilStacks * 1500);
        }

        this.lightningChains.push({
            originX: this.x,
            originY: this.y,
            angle: this.angle,
            maxChains: config.chainCount + conductorStacks,
            damage: config.chainDamage,
            falloff: config.chainFalloff,
            range: config.chainRange,
            amplifierStacks: this.getPowerupStacks('AMPLIFIER'),
            staticField: this.getPowerupStacks('STATIC_FIELD') > 0,
            timer: 500, // visual duration
            hitEnemies: [],
            resolved: false,
        });
    }

    fireMissiles(bulletPool, config) {
        const extraOrdnanceStacks = this.getPowerupStacks('EXTRA_ORDNANCE');
        const lockOnStacks = this.getPowerupStacks('LOCK_ON');
        const count = config.missileCount + extraOrdnanceStacks;

        for (let i = 0; i < count; i++) {
            const spreadAngle = this.angle + (i - (count - 1) / 2) * 0.3;
            this.activeMissiles.push({
                x: this.x,
                y: this.y,
                vel: {
                    x: Math.cos(spreadAngle) * config.missileSpeed,
                    y: Math.sin(spreadAngle) * config.missileSpeed,
                },
                damage: config.missileDamage,
                homingStrength: config.missileHomingStrength + lockOnStacks * 0.03,
                cluster: this.getPowerupStacks('CLUSTER_WARHEAD') > 0,
                life: 3000,
                radius: 5,
                target: null,
                active: true,
            });
        }

        const quickReloadStacks = this.getPowerupStacks('QUICK_RELOAD');
        if (quickReloadStacks > 0) {
            this.powerCooldown = Math.max(3000, config.cooldown - quickReloadStacks * 2000);
        }
    }
    
    pauseChargeShot() {
        if (this.isCharging && !this.chargePaused) {
            // Store accumulated charge time before pausing
            this.pausedChargeTime += Date.now() - this.chargeStartTime;
            this.chargePaused = true;
        }
    }
    
    resumeChargeShot() {
        if (this.chargePaused) {
            // Resume charging from where we left off
            this.chargeStartTime = Date.now();
            this.chargePaused = false;
            // pausedChargeTime keeps the accumulated time
        }
    }
    
    createChargingParticleEffects(particlePool, currentChargeTime, maxChargeTime) {
        // Charging particle effects disabled to save resources
        // Method kept for compatibility but does nothing
        return;
        
        /* DISABLED - Resource intensive charging effects
        if (!particlePool) return;
        
        const chargeProgress = Math.min(1, currentChargeTime / maxChargeTime);
        const isBasicCharged = currentChargeTime >= this.minChargeTime;
        
        // ORIGINAL player particle effects - more intense as charge builds
        const spawnChance = isBasicCharged ? 0.8 : 0.4; // Higher spawn rate when charged
        
        if (Math.random() < spawnChance) {
            const particleCount = isBasicCharged ? (4 + Math.random() * 6) : (2 + Math.random() * 3); // 4-10 or 2-5 particles
            
            for (let i = 0; i < particleCount; i++) {
                // Spawn particles around the player that get drawn in
                const angle = Math.random() * Math.PI * 2;
                const distance = (80 + Math.random() * 120) * (1 + chargeProgress * 0.5); // 80-200 pixels away, further when more charged
                const startX = this.x + Math.cos(angle) * distance;
                const startY = this.y + Math.sin(angle) * distance;
                
                // Create particle that moves toward player
                const particle = particlePool.get(startX, startY, 'spawnParticle', this.x, this.y, this);
                if (particle) {
                    if (this.isFullyCharged) {
                        // Fully charged - brilliant white/cyan energy
                        if (Math.random() < 0.4) {
                            particle.color = '#FFFFFF'; // Pure white sparkles
                        } else {
                            const hue = 180 + Math.random() * 20; // Cyan to light blue
                            const lightness = 70 + Math.random() * 30; // 70-100% lightness
                            particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                        }
                        particle.radius = 3 + Math.random() * 4; // Large, dramatic particles
                    } else if (isBasicCharged) {
                        // Basic charged - cyan energy
                        const hue = 180 + Math.random() * 30; // Cyan to blue range
                        const lightness = 60 + Math.random() * 30; // 60-90% lightness
                        particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                        particle.radius = 2 + Math.random() * 3; // Medium particles
                        
                        // Some white sparkles
                        if (Math.random() < 0.2) {
                            particle.color = '#FFFFFF';
                            particle.radius *= 1.2;
                        }
                    } else {
                        // Charging - blue energy
                        const hue = 200 + Math.random() * 40; // Blue range
                        const lightness = 50 + Math.random() * 30; // 50-80% lightness
                        particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                        particle.radius = 1.5 + Math.random() * 2; // Smaller particles
                    }
                }
            }
        }
        
        // ADDITIONAL Drifter-style charge animation ON TOP of existing effects
        if (Math.random() < 0.6) { // Frequent particle spawning like Drifter
            const drifterParticleCount = 3 + Math.random() * 4; // 3-7 particles
            
            for (let i = 0; i < drifterParticleCount; i++) {
                // Spawn particles around the player that get drawn in (Drifter style)
                const angle = Math.random() * Math.PI * 2;
                const distance = 60 + Math.random() * 80; // 60-140 pixels away
                const startX = this.x + Math.cos(angle) * distance;
                const startY = this.y + Math.sin(angle) * distance;
                
                // Create particle that moves toward player (Drifter style)
                const particle = particlePool.get(startX, startY, 'spawnParticle', this.x, this.y, this);
                if (particle) {
                    // Red/orange energy colors for laser charging (Drifter colors)
                    const hue = 0 + Math.random() * 30; // Red to orange range
                    const lightness = 60 + Math.random() * 30; // 60-90% lightness
                    particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                    particle.radius = 2 + Math.random() * 3; // Larger charging particles
                    
                    // Add some white sparkles (Drifter style)
                    if (Math.random() < 0.2) {
                        particle.color = '#FFFFFF';
                        particle.radius *= 1.2;
                    }
                }
            }
        }
        */
    }
    
    // Hit streak combo system methods
    startNewShot(bulletCount = 1) {
        this.shotFired = true;
        this.currentShotHits = 0;
        this.activeShotBullets = bulletCount;
    }
    
    registerHit() {
        if (this.shotFired) {
            this.currentShotHits++;
        }
    }
    
    onBulletDestroyed() {
        if (this.shotFired) {
            this.activeShotBullets--;
            if (this.activeShotBullets <= 0) {
                this.finalizeShotResult();
            }
        }
    }
    
    finalizeShotResult() {
        if (this.shotFired) {
            if (this.currentShotHits > 0) {
                // At least one hit - continue or increase streak
                this.hitStreak++;
            } else {
                // No hits - reset streak
                this.hitStreak = 0;
            }
            this.shotFired = false;
            this.currentShotHits = 0;
            this.activeShotBullets = 0;
        }
    }
    
    getHitStreakMultiplier() {
        // Higher streak = more orb drops
        if (this.hitStreak < 5) return 1;
        if (this.hitStreak < 10) return 1.5;
        if (this.hitStreak < 20) return 2;
        if (this.hitStreak < 50) return 3;
        return 4; // Max multiplier for very high streaks
    }
    
    fireChargedShot(bulletPool, audioManager) {
        const chargeTime = (Date.now() - this.chargeStartTime) + this.pausedChargeTime;
        
        // Apply charge speed upgrades
        const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
        const reducedMaxChargeTime = this.maxChargeTime - (chargeSpeedStacks * 1000);
        
        // Calculate multipliers directly proportional to milliseconds charged
        // Scale from 0ms to maxChargeTime (5000ms default, reduced by upgrades)
        const chargeRatio = Math.min(1, chargeTime / reducedMaxChargeTime);
        
        // Get charge damage upgrade stacks
        const chargeDamageStacks = this.getPowerupStacks('CHARGE_POWER');
        
        // Calculate base charge damage (1 base + upgrades)
        const baseDamage = 1 + chargeDamageStacks;
        
        // Direct proportional scaling based on milliseconds
        const sizeMultiplier = 1 + (chargeTime / 1000) * 0.4; // +0.4x per second, max 3x at 5s
        const speedMultiplier = 1 + (chargeTime / 1000) * 0.2; // +0.2x per second, max 2x at 5s
        const damageBonus = (chargeTime / 1000) * 1.2; // +1.2 per second, so 1+6=7 at 5s
        const totalDamage = baseDamage + damageBonus; // Base damage + charge bonus
        
        const critChanceBonus = (chargeTime / 1000) * 0.08; // +8% crit per second, max 40% at 5s
        
        // Calculate charge-based homing strength (base homing from charge time)
        const baseHomingStrength = Math.min(0.15, (chargeTime / 1000) * 0.03); // +0.03 per second, max 0.15 at 5s
        
        // Create charged bullet
        this.createChargedBullets(bulletPool, sizeMultiplier, speedMultiplier, totalDamage, critChanceBonus, baseHomingStrength);
        
        // Play shoot sound
        audioManager.playShoot();
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
        
        // Update invincibility timer
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= GAME_CONFIG.LOGIC_TICK_MS;
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.invincibilityTimer = 0;
                this.firingDisabled = false; // Re-enable firing when invincibility ends
                this.justRespawned = false; // Clear respawn flag when invincibility ends
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

        // Mouse aiming
        const dx = input.aimX - this.x;
        const dy = input.aimY - this.y;
        this.angle = Math.atan2(dy, dx);
        
        // Debug player aiming occasionally
        if (Math.random() < 0.01) { // 1% chance
        }

        this.isMoving = input.up || input.down || input.left || input.right;
        


        // WASD movement with tight controls
        if (this.isMoving && !this.thrustersDisabled) {
            let moveX = 0, moveY = 0;
            if (input.left) moveX -= 1;
            if (input.right) moveX += 1;
            if (input.up) moveY -= 1;
            if (input.down) moveY += 1;

            const moveAngle = Math.atan2(moveY, moveX);
            const speedMultiplier = this.getMovementSpeedMultiplier();
            const thrustForce = this.thrustPower * speedMultiplier;
            this.vel.x += Math.cos(moveAngle) * thrustForce;
            this.vel.y += Math.sin(moveAngle) * thrustForce;

            // Thrust particles commented out
            // const rear = moveAngle + Math.PI;
            // const dist = this.radius * 1.2;
            // const spread = this.radius * 0.8;

            // for (let i = 0; i < 2; i++) {
            //     const p_angle = rear + random(-0.3, 0.3);
            //     const p_dist = random(0, spread);
            //     const p_x = this.x + Math.cos(p_angle) * dist + Math.cos(p_angle + Math.PI / 2) * p_dist;
            //     const p_y = this.y + Math.sin(p_angle) * dist + Math.sin(p_angle + Math.PI / 2) * p_dist;
            //     particlePool.get(p_x, p_y, 'thrust', rear);
            // }
            
            // Thruster sound removed for cleaner audio experience
        }

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

        // Apply friction — scaled for tick rate (equivalent to 0.988 at 30Hz)
        const friction = Math.pow(0.988, GAME_CONFIG.TICK_SCALE);
        this.vel.x *= friction;
        this.vel.y *= friction;

        // Snap to zero once velocity is negligible — prevents endless star drift
        if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;
        if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0;

        // Limit velocity — speed boost raises the cap so upgrades feel powerful
        const speedMultCap = this.getMovementSpeedMultiplier();
        const effectiveMaxV = GAME_CONFIG.MAX_V * (1 + (speedMultCap - 1) * 0.7);
        const mag = Math.hypot(this.vel.x, this.vel.y);
        if (mag > effectiveMaxV) {
            this.vel.x = (this.vel.x / mag) * effectiveMaxV;
            this.vel.y = (this.vel.y / mag) * effectiveMaxV;
        }

        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Boundary bouncing instead of wrapping
        if (gameField) {
            // Bounce off left/right boundaries
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vel.x = Math.abs(this.vel.x) * 0.8; // Bounce with some energy loss
            } else if (this.x + this.radius > gameField.width) {
                this.x = gameField.width - this.radius;
                this.vel.x = -Math.abs(this.vel.x) * 0.8;
            }
            
            // Bounce off top/bottom boundaries
            if (this.y - this.radius < 0) {
                this.y = this.radius;
                this.vel.y = Math.abs(this.vel.y) * 0.8;
            } else if (this.y + this.radius > gameField.height) {
                this.y = gameField.height - this.radius;
                this.vel.y = -Math.abs(this.vel.y) * 0.8;
            }
        } else {
            // Fallback to old wrapping if no game field provided
            wrap(this, this.width, this.height);
        }
        
        // Calculate movement delta and update aim coordinates if player moved
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

        // Defense skill activation (number keys 1-4)
        for (let i = 0; i < 4; i++) {
            const key = `skill${i + 1}`;
            if (input[key]) {
                this.activateSkill(i);
                input[key] = false; // consume the input
            }
        }

        // Update beam state
        if (this.beamActive) {
            this.beamTimer -= 1000 / GAME_CONFIG.LOGIC_HZ;
            this.beamAngle = this.angle; // track current aim
            if (this.beamTimer <= 0) {
                this.beamActive = false;
            }
        }

        // Update active skill effects (regen, dash, etc.)
        this.updateActiveSkills(1000 / GAME_CONFIG.LOGIC_HZ);

    }

    updateActiveSkills(dt) {
        // Repair nanites: heal over time
        if (this.activeSkillEffects.has('REPAIR_NANITES')) {
            const config = DEFENSE_SKILLS.REPAIR_NANITES;
            const potencyStacks = this.getPowerupStacks('POTENCY');
            const hps = config.healPerSecond + potencyStacks;
            const healThisTick = hps * (dt / 1000);
            this.health = Math.min(this.getEffectiveMaxHealth(), this.health + healThisTick);
        }

        // Bulwark: set flag for damage reduction
        this.bulwarkActive = this.activeSkillEffects.has('BULWARK');

        // Tractor shield: set flag
        this.tractorShieldActive = this.activeSkillEffects.has('TRACTOR_SHIELD');
        if (this.tractorShieldActive) {
            this.tractorShieldAngle = this.angle;
        }

        // Phase dash
        if (this.isDashing) {
            this.dashTimer -= dt;
            this.x += this.dashVelX * (dt / 1000);
            this.y += this.dashVelY * (dt / 1000);
            if (this.dashTimer <= 0) {
                this.isDashing = false;
                this.invulnerable = false;
            }
        }

        // Update nova rings
        for (let i = this.novaRings.length - 1; i >= 0; i--) {
            const ring = this.novaRings[i];
            ring.elapsed += dt;
            ring.radius = (ring.elapsed / ring.duration) * ring.maxRadius;
            if (ring.elapsed >= ring.duration) {
                this.novaRings.splice(i, 1);
            }
        }

        // Update lightning chains visual timer
        for (let i = this.lightningChains.length - 1; i >= 0; i--) {
            this.lightningChains[i].timer -= dt;
            if (this.lightningChains[i].timer <= 0) {
                this.lightningChains.splice(i, 1);
            }
        }

        // Update missiles
        for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
            const m = this.activeMissiles[i];
            m.life -= dt;
            if (m.life <= 0 || !m.active) {
                this.activeMissiles.splice(i, 1);
                continue;
            }
            m.x += m.vel.x;
            m.y += m.vel.y;
        }

        // Update mine arm timers
        for (const mine of this.activeMines) {
            if (mine.armTimer > 0) mine.armTimer -= dt;
        }

        // Update deflector orbs positions
        if (this.deflectorOrbs.length > 0) {
            const orbitSpeed = 0.003;
            for (const orb of this.deflectorOrbs) {
                orb.angle += orbitSpeed * (1000 / GAME_CONFIG.LOGIC_HZ);
            }
        }
    }
    
    draw(ctx) {
        if (!this.active) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);

        // Flash effect during invincibility
        if (this.invincible) {
            const flash = Math.sin(Date.now() * 0.02) > 0;
            ctx.globalAlpha = flash ? 0.35 : 0.85;
        }

        ctx.globalCompositeOperation = 'lighter';

        const r = this.radius;
        const t = Date.now() * 0.001;
        const engPulse = 0.7 + Math.sin(t * 9) * 0.3; // fast engine flicker

        // ── Engine exhaust flames ─────────────────────────────────────────────
        const engines = [
            { x:  r * 0.42, y: r * 0.78 },
            { x: -r * 0.42, y: r * 0.78 },
        ];
        for (const eng of engines) {
            const exhaustLen = r * (0.9 + engPulse * 0.8);
            const grad = ctx.createLinearGradient(eng.x, eng.y, eng.x, eng.y + exhaustLen);
            grad.addColorStop(0,   rgba(255, 210, 90, 0.95 * engPulse));
            grad.addColorStop(0.4, rgba(255, 70, 0, 0.65 * engPulse));
            grad.addColorStop(1,   'transparent');
            ctx.fillStyle = grad;
            // OPT-2: pre-rendered glow sprite replaces live GPU blur
            glowSpriteCache.draw(ctx, eng.x, eng.y + exhaustLen * 0.5, '#ff8800', r * 0.1, 6, 0.8 * engPulse);
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.ellipse(eng.x, eng.y + exhaustLen * 0.5, r * 0.1, exhaustLen * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
        }

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

        // Draw charging effects whenever charge is building (independent of primary fire cooldown)
        if (this.isCharging) {
            this.drawChargingEffects(ctx);
        }

        // Draw level up animation effects
        if (this.levelUpAnimation.active) {
            this.drawLevelUpEffects(ctx);
        }

        // Draw cooldown timer at ship tip
        this.drawCooldownTimer(ctx);

        ctx.restore();
    }
    
    drawChargingEffects(ctx) {
        // Re-enabled charging effects - only called when player can shoot (cooldown complete)
        const now = Date.now();
        const chargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;
        
        // Apply charge speed upgrades
        const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
        const reducedMaxChargeTime = this.maxChargeTime - (chargeSpeedStacks * 1000);
        const reducedMinChargeTime = this.minChargeTime - (chargeSpeedStacks * 1000);
        
        // Calculate charge progress
        const chargeProgress = Math.min(1, chargeTime / reducedMaxChargeTime);
        const isBasicCharged = chargeTime >= reducedMinChargeTime;
        
        // Pulsing glow effect - much more intense when fully charged
        let pulseSpeed, pulseIntensity;
        if (this.isFullyCharged) {
            // Bright, fast pulsing when fully charged
            pulseSpeed = 0.08; // Very fast pulse
            pulseIntensity = 0.6 + Math.sin(now * pulseSpeed) * 0.4; // 0.2 to 1.0 - very bright
        } else if (isBasicCharged) {
            pulseSpeed = 0.03; // Faster pulse when charged
            pulseIntensity = 0.3 + Math.sin(now * pulseSpeed) * 0.2; // 0.1 to 0.5
        } else {
            pulseSpeed = 0.02; // Slow pulse when charging
            pulseIntensity = 0.3 + Math.sin(now * pulseSpeed) * 0.2; // 0.1 to 0.5
        }
        
        // Outer charging glow
        const glowRadius = this.radius * (2 + chargeProgress * 1.5); // Grows with charge
        const glowAlpha = pulseIntensity * (0.3 + chargeProgress * 0.4); // More intense with charge
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        
        // Create radial gradient for glow
        const gradient = ctx.createRadialGradient(0, 0, this.radius * 0.5, 0, 0, glowRadius);
        
        if (this.isFullyCharged) {
            // Fully charged glow - brilliant white/cyan with intense brightness
            gradient.addColorStop(0, rgba(255, 255, 255, glowAlpha * 1.0));
            gradient.addColorStop(0.2, rgba(0, 255, 255, glowAlpha * 0.9));
            gradient.addColorStop(0.5, rgba(100, 220, 255, glowAlpha * 0.7));
            gradient.addColorStop(0.8, rgba(150, 240, 255, glowAlpha * 0.4));
            gradient.addColorStop(1, `rgba(200, 250, 255, 0)`);
        } else if (isBasicCharged) {
            // Charged glow - cyan to white
            gradient.addColorStop(0, rgba(0, 255, 255, glowAlpha * 0.8));
            gradient.addColorStop(0.3, rgba(100, 200, 255, glowAlpha * 0.6));
            gradient.addColorStop(0.7, rgba(150, 220, 255, glowAlpha * 0.3));
            gradient.addColorStop(1, `rgba(200, 240, 255, 0)`);
        } else {
            // Charging glow - blue
            gradient.addColorStop(0, rgba(100, 150, 255, glowAlpha * 0.6));
            gradient.addColorStop(0.4, rgba(120, 180, 255, glowAlpha * 0.4));
            gradient.addColorStop(0.8, rgba(140, 200, 255, glowAlpha * 0.2));
            gradient.addColorStop(1, `rgba(160, 220, 255, 0)`);
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner energy ring
        if (isBasicCharged) {
            const ringRadius = this.radius * (1.2 + chargeProgress * 0.5);
            const ringAlpha = pulseIntensity * (0.5 + chargeProgress * 0.3);
            
            ctx.strokeStyle = rgba(0, 255, 255, ringAlpha);
            ctx.lineWidth = 2 + chargeProgress * 2;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Fully charged effects
            if (chargeProgress > 0.8) {
                // Additional bright ring
                ctx.strokeStyle = rgba(255, 255, 255, pulseIntensity * 0.6);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius * 1.1, 0, Math.PI * 2);
                ctx.stroke();
                
                // Energy sparks
                const sparkCount = Math.floor(chargeProgress * 8);
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
    
    drawLevelUpEffects(ctx) {
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
    
    drawCooldownTimer(ctx) {
        if (!this.isCharging) return;

        const tipX = 0;
        const tipY = -this.radius - 14;
        const timerRadius = 8;
        const charge = this.chargeLevel; // 0-1

        ctx.save();

        // Background circle
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tipX, tipY, timerRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Charge arc — blue to cyan to white as it fills
        if (charge > 0) {
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (charge * Math.PI * 2);

            if (this.isFullyCharged) {
                // Pulsing white/cyan when fully charged
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
            if (this.isFullyCharged) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
    
    spawnChargeBeamParticles(particlePool) {
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
    
    // Powerup management methods
    addPowerup(type, config, isShopItem = false) {
        // Determine duration based on source
        const duration = isShopItem ? Infinity : (config.duration || 30000); // 30 seconds for dropped powerups
        
        if (this.powerups.has(type)) {
            const existing = this.powerups.get(type);
            
            if (isShopItem) {
                // Shop items stack and remain permanent
                existing.stacks += 1;
                existing.timeRemaining = Infinity;
                existing.isPermanent = true;
            } else {
                // Dropped powerups always add a stack
                existing.stacks += 1;
                if (!existing.isPermanent) {
                    // Also refresh the timer for temporary powerups
                    existing.timeRemaining = duration;
                }
            }
        } else {
            // New powerup
            this.powerups.set(type, {
                stacks: 1,
                timeRemaining: duration,
                config: config,
                isPermanent: isShopItem
            });
        }
        
        // Special handling for health boost - increase current health when purchased
        if (type === 'HEALTH_BOOST' && isShopItem) {
            const newMaxHealth = this.getEffectiveMaxHealth();
            // Increase current health by 25, but don't exceed new max
            this.health = Math.min(this.health + 25, newMaxHealth);
        }
        
        if (isShopItem) {
        } else {
        }
    }
    
    updatePowerups() {
        // Decrease timers and remove expired powerups (skip permanent ones)
        for (const [type, powerup] of this.powerups.entries()) {
            if (powerup.timeRemaining !== Infinity && !powerup.isPermanent) {
                powerup.timeRemaining -= 16; // Assume 60fps
                if (powerup.timeRemaining <= 0) {
                    this.powerups.delete(type);
                }
            }
        }
    }
    
    getPowerupStacks(type) {
        return this.powerups.has(type) ? this.powerups.get(type).stacks : 0;
    }
    
    fireWeapons(bulletPool, audioManager) {
        // Fire bullets based on powerups (no cooldown needed since auto-fire handles timing)
        this.createBullets(bulletPool);
        
        // Play shoot sound synchronized with every shot
        audioManager.playShoot();
    }
    
    createBullets(bulletPool) {
        const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
        const homingStacks = this.getPowerupStacks('HOMING');
        const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
        const piercingStacks = this.getPowerupStacks('PIERCING');
        const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

        // +1 bullet per multi-shot stack, spread evenly in a fan
        const bulletCount = 1 + multiShotStacks;

        // Spread scales with bullet count: gentle fan that widens per stack
        const spreadAngle = bulletCount > 1 ? Math.min(0.8, 0.12 * (bulletCount - 1)) : 0;

        // Fire bullets
        for (let i = 0; i < bulletCount; i++) {
            let angle = this.angle;

            // Apply spread for multiple bullets
            if (bulletCount > 1) {
                const angleOffset = (i - (bulletCount - 1) / 2) * (spreadAngle / Math.max(1, bulletCount - 1));
                angle += angleOffset;
            }
            
            const bullet = bulletPool.get(this.x, this.y, angle);
            if (bullet) {
                // Apply range multiplier
                bullet.rangeMultiplier = this.getRangeMultiplier();

                // Calculate critical hit
                const critChance = this.getEffectiveCritChance();
                const isCritical = Math.random() * 100 < critChance;

                if (isCritical) {
                    const critDamage = this.getEffectiveCritDamage();
                    bullet.damage = (bullet.damage || 20) * (critDamage / 100);
                    bullet.isCritical = true;
                    bullet.color = '#FFD700';
                } else {
                    bullet.damage = bullet.damage || 20;
                    bullet.isCritical = false;
                }

                // Apply homing effects to bullet - for regular shots, only use upgrade homing (no charge-based homing)
                const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.25, homingStacks * 0.08) : 0;

                if (upgradeHomingStrength > 0) {
                    bullet.homing = true;
                    bullet.homingStrength = upgradeHomingStrength;
                }
                if (bigBulletStacks > 0) {
                    bullet.radius *= (1 + bigBulletStacks * 0.3);
                    bullet.baseRadius = bullet.radius; // Update base for shrink calc
                }
                if (piercingStacks > 0) {
                    bullet.piercing = piercingStacks;
                }
                if (explosiveStacks > 0) {
                    bullet.explosive = true;
                    bullet.explosionRadius = 30 + explosiveStacks * 10;
                }
            }
        }
    }
    
    createChargedBullets(bulletPool, sizeMultiplier = 1, speedMultiplier = 1, totalDamage = 20, critChanceBonus = 0, baseHomingStrength = 0) {
        const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
        const homingStacks = this.getPowerupStacks('HOMING');
        const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
        const piercingStacks = this.getPowerupStacks('PIERCING');
        const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

        // +1 bullet per multi-shot stack, spread evenly in a fan
        const bulletCount = 1 + multiShotStacks;

        // Spread scales with bullet count: gentle fan that widens per stack
        const spreadAngle = bulletCount > 1 ? Math.min(0.8, 0.12 * (bulletCount - 1)) : 0;

        // Start tracking hits for this shot
        this.startNewShot(bulletCount);
        
        // Fire bullets
        for (let i = 0; i < bulletCount; i++) {
            let angle = this.angle;
            
            // Apply spread for multiple bullets
            if (bulletCount > 1) {
                const angleOffset = (i - (bulletCount - 1) / 2) * (spreadAngle / Math.max(1, bulletCount - 1));
                angle += angleOffset;
            }
            
            const bullet = bulletPool.get(this.x, this.y, angle);
            if (bullet) {
                // Apply range multiplier (charged shots get modest bonus range)
                bullet.rangeMultiplier = this.getRangeMultiplier() * Math.max(1, speedMultiplier * 0.5);

                // Set up callback for when bullet is destroyed (for combo tracking)
                bullet.onOffScreen = () => this.onBulletDestroyed();

                // Apply charge scaling to bullet speed
                bullet.vel.x *= speedMultiplier;
                bullet.vel.y *= speedMultiplier;
                
                // Apply charge scaling to bullet size
                bullet.radius *= sizeMultiplier;
                bullet.baseRadius = bullet.radius;
                
                // Calculate critical hit with charge bonus
                const baseCritChance = this.getEffectiveCritChance();
                const totalCritChance = baseCritChance + (critChanceBonus * 100);
                const isCritical = Math.random() * 100 < totalCritChance;
                
                if (isCritical) {
                    const critDamage = this.getEffectiveCritDamage();
                    bullet.damage = totalDamage * (critDamage / 100); // Apply crit multiplier to total damage
                    bullet.isCritical = true;
                    bullet.color = '#FFD700'; // Gold color for critical hits
                } else {
                    bullet.damage = totalDamage; // Use calculated total damage directly
                    bullet.isCritical = false;
                }
                
                // Apply homing effects to bullet - combine base homing from charge with upgrade homing
                const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.25, homingStacks * 0.08) : 0; // Stronger upgrade homing
                const totalHomingStrength = baseHomingStrength + upgradeHomingStrength;
                
                if (totalHomingStrength > 0) {
                    bullet.homing = true;
                    bullet.homingStrength = Math.min(0.4, totalHomingStrength); // Cap at 0.4 for balance
                }
                if (bigBulletStacks > 0) {
                    bullet.radius *= (1 + bigBulletStacks * 0.3);
                    bullet.baseRadius = bullet.radius;
                }
                if (piercingStacks > 0) {
                    bullet.piercing = piercingStacks; // Number of enemies it can pierce
                }
                if (explosiveStacks > 0) {
                    bullet.explosive = true;
                    bullet.explosionRadius = 30 + explosiveStacks * 10;
                }
                
                // Visual effects for charged shots
                if (sizeMultiplier > 1.5) {
                    bullet.color = '#00FFFF'; // Cyan for highly charged shots
                } else if (sizeMultiplier > 1.2) {
                    bullet.color = '#FFFFFF'; // White for charged shots
                }
            }
        }
    }
    
    getMovementSpeedMultiplier() {
        const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
        // Each stack: +50% thrust, +35% max velocity (via velocity cap in update)
        // At 6 stacks: 4x thrust, 3.1x max speed — you become a comet
        return speedBoostStacks > 0 ? (1 + speedBoostStacks * 0.5) : 1;
    }

    getRangeMultiplier() {
        const rangeStacks = this.getPowerupStacks('LONG_RANGE');
        return 1 + rangeStacks * 0.4; // +40% range per stack
    }

    getEffectiveCooldown() {
        const rapidFireStacks = this.getPowerupStacks('RAPID_FIRE');
        // Each stack reduces cooldown by 15% (compounding): 800 → 680 → 578 → 491 → 417 → 355
        return Math.round(this.shotCooldownTime * Math.pow(0.85, rapidFireStacks));
    }

    getEffectiveShield() {
        const baseShield = this.shield;
        const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');
        
        const shieldBoostAmount = shieldBoostStacks * 5; // +5% damage reduction per stack
        
        const totalShield = baseShield + shieldBoostAmount;
        return Math.min(75, totalShield); // Cap at 75%
    }
    
    getEffectiveMaxHealth() {
        const baseMaxHealth = this.maxHealth;
        const healthBoostStacks = this.getPowerupStacks('HEALTH_BOOST');
        const healthBoostAmount = healthBoostStacks * 25; // +25 max health per stack
        
        const totalMaxHealth = baseMaxHealth + healthBoostAmount;
        return Math.min(525, totalMaxHealth); // Cap at 525 (25 base + 500 from upgrades)
    }
    
    getEffectiveCritChance() {
        const baseCritChance = this.baseCritChance;
        const critChanceStacks = this.getPowerupStacks('CRIT_CHANCE');
        const critChanceBonus = critChanceStacks * 5; // +5% crit chance per stack
        
        const totalCritChance = baseCritChance + critChanceBonus;
        return Math.min(50, totalCritChance); // Cap at 50%
    }
    
    getEffectiveCritDamage() {
        const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
        const critDamageBonus = critDamageStacks * 10; // +10% crit damage per stack

        // Randomize between 2x (200%) and 3x (300%) base, plus stacks
        const minCrit = this.baseCritDamage; // 200%
        const maxCrit = 300 + critDamageBonus; // 300% + stacks
        const totalCritDamage = minCrit + Math.random() * (maxCrit - minCrit);
        return Math.min(500, totalCritDamage); // Cap at 500% (5x)
    }
    
    getEffectiveHealthOrbHealing(baseHealing = 1) {
        // MEDPACK now increases min heal at orb creation time, so no collection bonus needed
        return baseHealing;
    }
    
    // Legacy support for old method names
    getEffectiveHealthStarHealing() {
        return this.getEffectiveHealthOrbHealing();
    }
    
    getEffectiveBurstStarHealing() {
        return this.getEffectiveHealthOrbHealing();
    }
    
    // ── Weapon System Methods ──────────────────────────────────────────────

    getActivePrimaryConfig() {
        return PRIMARY_WEAPONS[this.activePrimary] || PRIMARY_WEAPONS.PULSE_CANNON;
    }

    getActivePowerConfig() {
        return POWER_WEAPONS[this.activePower] || POWER_WEAPONS.CHARGE_SHOT;
    }

    equipPrimary(weaponId) {
        if (this.ownedPrimaries.has(weaponId) && PRIMARY_WEAPONS[weaponId]) {
            this.activePrimary = weaponId;
            return true;
        }
        return false;
    }

    equipPower(weaponId) {
        if (this.ownedPowers.has(weaponId) && POWER_WEAPONS[weaponId]) {
            this.activePower = weaponId;
            this.powerCooldown = 0;
            // Reset charge state when switching away from charge shot
            this.isCharging = false;
            this.chargeLevel = 0;
            this.pausedChargeTime = 0;
            return true;
        }
        return false;
    }

    buyPrimary(weaponId) {
        if (PRIMARY_WEAPONS[weaponId] && !this.ownedPrimaries.has(weaponId)) {
            this.ownedPrimaries.add(weaponId);
            this.activePrimary = weaponId;
            return true;
        }
        return false;
    }

    buyPower(weaponId) {
        if (POWER_WEAPONS[weaponId] && !this.ownedPowers.has(weaponId)) {
            this.ownedPowers.add(weaponId);
            this.activePower = weaponId;
            this.powerCooldown = 0;
            this.isCharging = false;
            this.chargeLevel = 0;
            this.pausedChargeTime = 0;
            return true;
        }
        return false;
    }

    buySkill(skillId) {
        if (DEFENSE_SKILLS[skillId] && !this.ownedSkills.has(skillId)) {
            this.ownedSkills.add(skillId);
            // Auto-assign to first empty slot
            for (let i = 0; i < 4; i++) {
                if (!this.skillSlots[i]) {
                    this.skillSlots[i] = skillId;
                    break;
                }
            }
            return true;
        }
        return false;
    }

    assignSkillToSlot(skillId, slotIndex) {
        if (slotIndex < 0 || slotIndex > 3) return false;
        if (!this.ownedSkills.has(skillId)) return false;
        // Remove from any existing slot
        for (let i = 0; i < 4; i++) {
            if (this.skillSlots[i] === skillId) this.skillSlots[i] = null;
        }
        this.skillSlots[slotIndex] = skillId;
        return true;
    }

    activateSkill(slotIndex) {
        if (slotIndex < 0 || slotIndex > 3) return false;
        const skillId = this.skillSlots[slotIndex];
        if (!skillId) return false;
        if (this.skillCooldowns[slotIndex] > 0) return false;

        const config = DEFENSE_SKILLS[skillId];
        if (!config) return false;

        // Start cooldown
        this.skillCooldowns[slotIndex] = config.cooldown;

        // Activate effect
        this.activeSkillEffects.set(skillId, {
            timeRemaining: config.duration,
            slotIndex,
        });

        return true;
    }

    getEffectivePrimaryFireRate() {
        const config = this.getActivePrimaryConfig();
        let rate = config.fireRate;

        // Apply weapon-specific upgrades
        if (this.activePrimary === 'STORM_NEEDLES') {
            const stacks = this.getPowerupStacks('NEEDLE_STORM');
            rate *= Math.pow(0.85, stacks); // -15% per stack compounding
        }

        // Apply global Rapid Fire
        const rapidFireStacks = this.getPowerupStacks('RAPID_FIRE');
        rate *= Math.pow(0.85, rapidFireStacks);

        return Math.round(rate);
    }

    getEffectivePrimaryDamage() {
        const config = this.getActivePrimaryConfig();
        let damage = config.damage;

        if (this.activePrimary === 'PULSE_CANNON') {
            const stacks = this.getPowerupStacks('OVERCHARGE');
            damage *= (1 + stacks * 0.15);
        }

        return damage;
    }

    getPowerCooldownRemaining() {
        return Math.max(0, this.powerCooldown);
    }

    isPowerReady() {
        const config = this.getActivePowerConfig();
        if (config.isChargeBased) return true;
        return this.powerCooldown <= 0;
    }

    updateSkillCooldowns(dt) {
        for (let i = 0; i < 4; i++) {
            if (this.skillCooldowns[i] > 0) {
                this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
            }
        }

        // Update power weapon cooldown
        if (this.powerCooldown > 0) {
            this.powerCooldown = Math.max(0, this.powerCooldown - dt);
        }

        // Update active skill effects
        for (const [skillId, effect] of this.activeSkillEffects) {
            effect.timeRemaining -= dt;
            if (effect.timeRemaining <= 0) {
                this.activeSkillEffects.delete(skillId);
                // Clean up specific effects
                if (skillId === 'BULWARK') this.bulwarkActive = false;
                if (skillId === 'REPAIR_NANITES') this.regenActive = false;
                if (skillId === 'DEFLECTOR_ORBS') this.deflectorOrbs = [];
                if (skillId === 'TRACTOR_SHIELD') this.tractorShieldActive = false;
            }
        }
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
        const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
        const restartPrompt = isMobile ? "Tap Screen to Restart" : "Press Enter to Restart";
        const roundedScore = Math.round(game.score);
        const roundedHighScore = Math.round(game.highScore);
        const subtitle = `YOUR SCORE: ${roundedScore}\nHIGH SCORE: ${roundedHighScore}\n\n${restartPrompt}`;
        uiManager.showMessage('GAME OVER', subtitle);
    }
} 