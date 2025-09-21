// Player ship entity
import { GAME_CONFIG } from '../constants.js';
import { random, wrap } from '../utils.js';

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
        this.baseCritChance = 0; // 0% base critical hit chance
        this.baseCritDamage = 150; // 150% base critical hit damage (50% extra)
        
        // WASD + Mouse controls
        this.thrustPower = 0.2; // Reduced thrust power to make speed upgrades more valuable
        
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
        this.shotCooldownTime = 800; // 800ms cooldown between shots
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
        
        // Level up benefits (optional - can be expanded)
        // For now, just a small health boost every few levels
        if (this.level % 3 === 0) {
            this.maxHealth += 5;
            this.health = Math.min(this.health + 5, this.maxHealth);
        }
        
        // Trigger level up effects
        this.triggerLevelUpEffects();
        
        return true; // Indicates a level up occurred
    }
    
    triggerLevelUpEffects() {
        // Set level up animation flag
        this.levelUpAnimation = {
            active: true,
            startTime: Date.now(),
            duration: 2000 // 2 second animation
        };
        
        // Display level up message via game engine - smaller and above shop button
        if (window.gameEngine && window.gameEngine.uiManager) {
            window.gameEngine.uiManager.showMessage(`LEVEL ${this.level}!`, 'Skill Point Gained!', 3000, 'shop');
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
    
    updateChargingSystem(input, bulletPool, audioManager) {
        // Skip charging updates if paused
        if (this.chargePaused) {
            return;
        }
        
        const now = Date.now();
        
        // Update cooldown status
        this.canShoot = (now - this.lastShotTime) >= this.shotCooldownTime;
        
        // Simple logic: charge when not firing, fire when clicking while charged and cooldown is ready
        if (input.fire) {
            // Player is clicking - fire if we have any charge and cooldown is ready
            if (this.isCharging && this.canShoot) {
                this.fireChargedShot(bulletPool, audioManager);
                this.isCharging = false;
                this.chargeLevel = 0;
                this.pausedChargeTime = 0; // Reset accumulated charge time
                this.lastShotTime = now; // Start cooldown
            }
        } else {
            // Player is not clicking - always be charging (even during cooldown)
            if (!this.isCharging) {
                // Start new charge cycle
                this.isCharging = true;
                this.chargeStartTime = now;
                this.chargeLevel = 0;
            }
            
            // Update charge level (including any previously accumulated time)
            const currentChargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;
            const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
            const reducedMaxChargeTime = this.maxChargeTime - (chargeSpeedStacks * 1000);
            
            this.chargeLevel = Math.min(1, currentChargeTime / reducedMaxChargeTime);
        }
        
        // Update tractor beam and visual effects
        if (this.isCharging) {
            const currentChargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;
            const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
            const reducedMaxChargeTime = this.maxChargeTime - (chargeSpeedStacks * 1000);
            const isFullyCharged = currentChargeTime >= reducedMaxChargeTime;
            
            this.tractorBeamActive = !isFullyCharged; // Stop tractor when fully charged
            this.isFullyCharged = isFullyCharged; // Store for visual effects
        } else {
            this.tractorBeamActive = false; // No tractor when not charging
            this.isFullyCharged = false;
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
        const chargeDamageStacks = this.getPowerupStacks('CHARGE_DAMAGE');
        
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
        
        // Store previous position to track movement
        const prevX = this.x;
        const prevY = this.y;
        
        // Update invincibility timer
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= 16; // Assuming 60fps, ~16ms per frame
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

        // Increased friction to make movement slower and speed upgrades more valuable
        this.vel.x *= 0.95; // More friction for slower base movement
        this.vel.y *= 0.95;

        // Limit velocity
        const mag = Math.hypot(this.vel.x, this.vel.y);
        if (mag > GAME_CONFIG.MAX_V) {
            this.vel.x = (this.vel.x / mag) * GAME_CONFIG.MAX_V;
            this.vel.y = (this.vel.y / mag) * GAME_CONFIG.MAX_V;
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
        this.updateChargingSystem(input, bulletPool, audioManager);
        
        // Tractor beam particle effects when charging (but not fully charged)
        if (this.tractorBeamActive && Math.random() < 0.3) {
            this.spawnTractorBeamParticles(particlePool);
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
            ctx.globalAlpha = flash ? 0.4 : 0.8;
        }
        
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.globalCompositeOperation = 'lighter';
        
        const r = this.radius;
        const w = 1.15;
        
        // Draw ship body
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.96 * w, r * 0.9);
        ctx.lineTo(r * 0.6 * w, r * 0.9);
        ctx.lineTo(0, -r * 0.1);
        ctx.closePath();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(-r * 0.96 * w, r * 0.9);
        ctx.lineTo(-r * 0.6 * w, r * 0.9);
        ctx.lineTo(0, -r * 0.1);
        ctx.closePath();
        ctx.stroke();
        
        // Draw visual-only direction triangle (guillemet/raquo) at the head (blue)
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#3399ff'; // blue
        ctx.lineWidth = 3;
        const triangleOffset = -r; // tip of ship
        const triangleLength = r * 1.5;
        const tip = triangleOffset - triangleLength; // tip of triangle
        const base = triangleOffset - triangleLength * 0.45; // base closer to tip
        const side = r * 0.37;
        ctx.beginPath();
        ctx.moveTo(0, tip);
        ctx.lineTo(side, base);
        ctx.lineTo(-side, base);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Draw visual-only thruster triangles (at the base/rear of the ship, red)
        const thrusterAngle = Math.PI / 5; // angle outward from rear
        const thrusterDistance = r * 0.7; // how far from center (rear)
        const thrusterLength = r * 1.2; // length of thruster triangle
        const thrusterBase = r * 0.35; // base width of thruster triangle
        // Left thruster
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ff3333'; // red
        ctx.lineWidth = 2.5;
        ctx.rotate(Math.PI + thrusterAngle); // rear left
        ctx.beginPath();
        ctx.moveTo(0, -thrusterDistance - thrusterLength); // tip
        ctx.lineTo(-thrusterBase, -thrusterDistance - thrusterLength * 0.45); // left base
        ctx.lineTo(thrusterBase, -thrusterDistance - thrusterLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        // Right thruster
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ff3333'; // red
        ctx.lineWidth = 2.5;
        ctx.rotate(Math.PI - thrusterAngle); // rear right
        ctx.beginPath();
        ctx.moveTo(0, -thrusterDistance - thrusterLength); // tip
        ctx.lineTo(-thrusterBase, -thrusterDistance - thrusterLength * 0.45); // left base
        ctx.lineTo(thrusterBase, -thrusterDistance - thrusterLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Draw long blue wing triangles pointing downward/outward from the sides
        const wingAngle = Math.PI / 1.5; // steeper angle, about 120 degrees from forward
        const wingDistance = r * 0.2; // how far from center (side)
        const wingLength = r * 2.2; // long wing triangle
        const wingBase = r * 0.32; // base width of wing triangle
        // Left wing
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#a259ff'; // purple
        ctx.lineWidth = 2.2;
        ctx.rotate(-wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -wingDistance - wingLength); // tip
        ctx.lineTo(-wingBase, -wingDistance - wingLength * 0.45); // left base
        ctx.lineTo(wingBase, -wingDistance - wingLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        // Right wing
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#a259ff'; // purple
        ctx.lineWidth = 2.2;
        ctx.rotate(wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -wingDistance - wingLength); // tip
        ctx.lineTo(-wingBase, -wingDistance - wingLength * 0.45); // left base
        ctx.lineTo(wingBase, -wingDistance - wingLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        
        // Draw charging effects
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
            gradient.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha * 1.0})`);
            gradient.addColorStop(0.2, `rgba(0, 255, 255, ${glowAlpha * 0.9})`);
            gradient.addColorStop(0.5, `rgba(100, 220, 255, ${glowAlpha * 0.7})`);
            gradient.addColorStop(0.8, `rgba(150, 240, 255, ${glowAlpha * 0.4})`);
            gradient.addColorStop(1, `rgba(200, 250, 255, 0)`);
        } else if (isBasicCharged) {
            // Charged glow - cyan to white
            gradient.addColorStop(0, `rgba(0, 255, 255, ${glowAlpha * 0.8})`);
            gradient.addColorStop(0.3, `rgba(100, 200, 255, ${glowAlpha * 0.6})`);
            gradient.addColorStop(0.7, `rgba(150, 220, 255, ${glowAlpha * 0.3})`);
            gradient.addColorStop(1, `rgba(200, 240, 255, 0)`);
        } else {
            // Charging glow - blue
            gradient.addColorStop(0, `rgba(100, 150, 255, ${glowAlpha * 0.6})`);
            gradient.addColorStop(0.4, `rgba(120, 180, 255, ${glowAlpha * 0.4})`);
            gradient.addColorStop(0.8, `rgba(140, 200, 255, ${glowAlpha * 0.2})`);
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
            
            ctx.strokeStyle = `rgba(0, 255, 255, ${ringAlpha})`;
            ctx.lineWidth = 2 + chargeProgress * 2;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Fully charged effects
            if (chargeProgress > 0.8) {
                // Additional bright ring
                ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity * 0.6})`;
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
                    
                    ctx.fillStyle = `rgba(255, 255, 255, ${pulseIntensity * 0.8})`;
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
        gradient.addColorStop(0, `rgba(255, 215, 0, ${auraAlpha})`); // Gold center
        gradient.addColorStop(0.3, `rgba(255, 165, 0, ${auraAlpha * 0.8})`); // Orange
        gradient.addColorStop(0.6, `rgba(255, 255, 0, ${auraAlpha * 0.6})`); // Yellow
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
            
            ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
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
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawCooldownTimer(ctx) {
        const now = Date.now();
        const timeSinceLastShot = now - this.lastShotTime;
        const cooldownProgress = Math.min(1, timeSinceLastShot / this.shotCooldownTime);
        
        // Position at the tip of the ship
        const tipX = 0;
        const tipY = -this.radius - 5; // Just above the ship tip
        const timerRadius = 8;
        
        ctx.save();
        
        // Draw background circle (dark)
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'; // Semi-transparent gold
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tipX, tipY, timerRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw progress arc (golden, fills up as cooldown completes)
        if (cooldownProgress > 0) {
            const startAngle = -Math.PI / 2; // Start at top
            const endAngle = startAngle + (cooldownProgress * Math.PI * 2);
            
            ctx.strokeStyle = '#FFD700'; // Bright gold
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            
            // Add glow effect when ready to shoot
            if (this.canShoot) {
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 8;
            }
            
            ctx.beginPath();
            ctx.arc(tipX, tipY, timerRadius, startAngle, endAngle);
            ctx.stroke();
            
            // Draw center dot when fully ready
            if (this.canShoot) {
                ctx.fillStyle = '#FFD700';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    spawnTractorBeamParticles(particlePool) {
        // Spawn blue energy particles around the player that get drawn in
        const particleCount = 2 + Math.random() * 3; // 2-5 particles (reasonable amount)
        
        for (let i = 0; i < particleCount; i++) {
            // Spawn particles closer to the ship like the original
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 60; // 40-100 pixels away (much closer)
            const startX = this.x + Math.cos(angle) * distance;
            const startY = this.y + Math.sin(angle) * distance;
            
            // Create particle that moves toward player
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
                // Dropped powerups reset timer but don't stack if already permanent
                if (existing.isPermanent) {
                    return;
                } else {
                    // Refresh temporary powerup
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
        const spreadShotStacks = this.getPowerupStacks('SPREAD_SHOT');
        const homingStacks = this.getPowerupStacks('HOMING');
        const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
        const piercingStacks = this.getPowerupStacks('PIERCING');
        const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');
        
        // Debug powerup effects
        if (multiShotStacks > 0 || spreadShotStacks > 0 || piercingStacks > 0 || explosiveStacks > 0 || homingStacks > 0) {
        }
        
        // Calculate number of bullets to fire - scaling with stack levels
        let bulletCount = 1;
        if (multiShotStacks > 0) {
            bulletCount += multiShotStacks; // +1 bullet per stack
        }
        if (spreadShotStacks > 0) {
            // Progressive bullet count: 3, 5, 7 bullets
            if (spreadShotStacks === 1) bulletCount = 3;
            else if (spreadShotStacks === 2) bulletCount = 5;
            else if (spreadShotStacks >= 3) bulletCount = 7;
        }
        
        // Calculate spread angle
        const spreadAngle = spreadShotStacks > 0 ? 
                           Math.min(0.6, spreadShotStacks * 0.15) : 0; // Max 0.6 radians spread
        
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
                // Calculate critical hit
                const critChance = this.getEffectiveCritChance();
                const isCritical = Math.random() * 100 < critChance;
                
                if (isCritical) {
                    const critDamage = this.getEffectiveCritDamage();
                    bullet.damage = (bullet.damage || 20) * (critDamage / 100); // Default 20 base damage (scaled down)
                    bullet.isCritical = true;
                    bullet.color = '#FFD700'; // Gold color for critical hits
                } else {
                    bullet.damage = bullet.damage || 20; // Default base damage (scaled down)
                    bullet.isCritical = false;
                }
                
                // Apply homing effects to bullet - for regular shots, only use upgrade homing (no charge-based homing)
                const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.25, homingStacks * 0.08) : 0; // Stronger upgrade homing
                
                if (upgradeHomingStrength > 0) {
                    bullet.homing = true;
                    bullet.homingStrength = upgradeHomingStrength; // Only upgrade homing for regular shots
                }
                if (bigBulletStacks > 0) {
                    bullet.radius *= (1 + bigBulletStacks * 0.3); // 30% bigger per stack
                }
                if (piercingStacks > 0) {
                    bullet.piercing = piercingStacks; // Number of enemies it can pierce
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
        const spreadShotStacks = this.getPowerupStacks('SPREAD_SHOT');
        const homingStacks = this.getPowerupStacks('HOMING');
        const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
        const piercingStacks = this.getPowerupStacks('PIERCING');
        const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');
        
        // Calculate number of bullets to fire - scaling with stack levels
        let bulletCount = 1;
        if (multiShotStacks > 0) {
            bulletCount += multiShotStacks; // +1 bullet per stack
        }
        if (spreadShotStacks > 0) {
            // Progressive bullet count: 3, 5, 7 bullets
            if (spreadShotStacks === 1) bulletCount = 3;
            else if (spreadShotStacks === 2) bulletCount = 5;
            else if (spreadShotStacks >= 3) bulletCount = 7;
        }
        
        // Calculate spread angle
        const spreadAngle = spreadShotStacks > 0 ? 
                           Math.min(0.6, spreadShotStacks * 0.15) : 0; // Max 0.6 radians spread
        
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
                // Set up callback for when bullet is destroyed (for combo tracking)
                bullet.onOffScreen = () => this.onBulletDestroyed();
                
                // Apply charge scaling to bullet speed
                bullet.vel.x *= speedMultiplier;
                bullet.vel.y *= speedMultiplier;
                
                // Apply charge scaling to bullet size
                bullet.radius *= sizeMultiplier;
                
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
                    bullet.radius *= (1 + bigBulletStacks * 0.3); // 30% bigger per stack
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
        return speedBoostStacks > 0 ? (1 + speedBoostStacks * 0.4) : 1; // Increased bonus per stack
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
        const baseCritDamage = this.baseCritDamage;
        const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
        const critDamageBonus = critDamageStacks * 10; // +10% crit damage per stack
        
        const totalCritDamage = baseCritDamage + critDamageBonus;
        return Math.min(300, totalCritDamage); // Cap at 300% (3x damage)
    }
    
    getEffectiveHealthOrbHealing(baseHealing = 1) {
        const medpackStacks = this.getPowerupStacks('MEDPACK');
        const bonusHealing = medpackStacks * 1; // +1 healing per medpack stack
        
        const totalHealing = baseHealing + bonusHealing;
        return Math.min(10, totalHealing); // Cap at 10 (max base 4 + 5 stacks × 1 = 9, rounded to 10)
    }
    
    // Legacy support for old method names
    getEffectiveHealthStarHealing() {
        return this.getEffectiveHealthOrbHealing();
    }
    
    getEffectiveBurstStarHealing() {
        return this.getEffectiveHealthOrbHealing();
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