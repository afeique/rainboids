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
        this.shield = 0; // 0% damage reduction (start with no armor)
        this.waveBonusShield = 0; // Additional shield from waves survived (1% per wave)
        this.invulnerable = false;
        this.lastHitTime = 0;
        this.lastBlinkTime = 0;
        
        // WASD + Mouse controls
        this.thrustPower = 0.3; // Precise thrust power
        
        // Auto-firing system
        this.autoFireTimer = 0;
        this.baseFireRate = 200; // Base auto-fire rate in ms
        
        // Audio throttling
        this.lastThrusterSound = 0;
        this.thrusterSoundInterval = 150; // Play thruster sound every 150ms instead of every frame
        this.lastShootSound = 0;
        this.shootSoundInterval = 400; // Much longer interval between shoot sounds (400ms)
        
        // Powerup system
        this.powerups = new Map(); // Map of powerup type -> {stacks, timeRemaining}
        
        this.initializePlayer();
    }
    
    // Helper method to initialize/reset player properties
    initializePlayer() {
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
        
        // Reset auto-fire timer
        this.autoFireTimer = 0;
        
        // Reset wave bonus shield
        this.waveBonusShield = 0;
        
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
    
    update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged) {
        if (!this.active) return;
        
        // Update invincibility timer
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= 16; // Assuming 60fps, ~16ms per frame
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.invincibilityTimer = 0;
            }
        }

        // Update powerups
        this.updatePowerups();

        // Mouse aiming
        const dx = input.aimX - this.x;
        const dy = input.aimY - this.y;
        this.angle = Math.atan2(dy, dx);

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

            const rear = moveAngle + Math.PI;
            const dist = this.radius * 1.2;
            const spread = this.radius * 0.8;

            for (let i = 0; i < 2; i++) {
                const p_angle = rear + random(-0.3, 0.3);
                const p_dist = random(0, spread);
                const p_x = this.x + Math.cos(p_angle) * dist + Math.cos(p_angle + Math.PI / 2) * p_dist;
                const p_y = this.y + Math.sin(p_angle) * dist + Math.sin(p_angle + Math.PI / 2) * p_dist;
                particlePool.get(p_x, p_y, 'thrust', rear);
            }
            
            // Throttle thruster sound to reduce noise
            const now = Date.now();
            if (now - this.lastThrusterSound > this.thrusterSoundInterval) {
                audioManager.playThruster();
                this.lastThrusterSound = now;
            }
        }

        // Reduced tractor beam visual for performance
        if (tractorEngaged && Math.random() < 0.3) {
            // Spawn fewer particles less frequently
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            const px = this.x + Math.cos(angle) * dist;
            const py = this.y + Math.sin(angle) * dist;
            particlePool.get(px, py, 'tractorBeamParticle', this.x, this.y);
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

        // Minimal friction for tight control (no slipperiness)
        this.vel.x *= 0.98; // Very little friction for precise control
        this.vel.y *= 0.98;

        // Limit velocity
        const mag = Math.hypot(this.vel.x, this.vel.y);
        if (mag > GAME_CONFIG.MAX_V) {
            this.vel.x = (this.vel.x / mag) * GAME_CONFIG.MAX_V;
            this.vel.y = (this.vel.y / mag) * GAME_CONFIG.MAX_V;
        }

        this.x += this.vel.x;
        this.y += this.vel.y;
        wrap(this, this.width, this.height);

        // Auto-firing system - continuously fire at set intervals
        this.autoFireTimer += 16; // Assume 60fps (16ms per frame)
        const rapidFireStacks = this.getPowerupStacks('RAPID_FIRE');
        const fireRateMultiplier = Math.pow(0.75, rapidFireStacks); // 25% faster per stack
        const effectiveFireRate = this.baseFireRate * fireRateMultiplier;
        
        if (this.autoFireTimer >= effectiveFireRate) {
            this.fireWeapons(bulletPool, audioManager);
            this.autoFireTimer = 0;
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
        ctx.shadowColor = '#3399ff';
        ctx.shadowBlur = 0;
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
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 0;
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
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 0;
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
        ctx.shadowColor = '#a259ff';
        ctx.shadowBlur = 0;
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
        ctx.shadowColor = '#a259ff';
        ctx.shadowBlur = 0;
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
        
        ctx.restore();
    }
    
    // Powerup management methods
    addPowerup(type, config) {
        if (this.powerups.has(type)) {
            // Stack the powerup
            const existing = this.powerups.get(type);
            existing.stacks = Math.min(existing.stacks + 1, 5); // Max 5 stacks
            existing.timeRemaining = config.duration; // Reset timer
        } else {
            // New powerup
            this.powerups.set(type, {
                stacks: 1,
                timeRemaining: config.duration,
                config: config
            });
        }
    }
    
    updatePowerups() {
        // Decrease timers and remove expired powerups
        for (const [type, powerup] of this.powerups.entries()) {
            powerup.timeRemaining -= 16; // Assume 60fps
            if (powerup.timeRemaining <= 0) {
                this.powerups.delete(type);
                console.log(`⏰ ${powerup.config.name} expired`);
            }
        }
    }
    
    getPowerupStacks(type) {
        return this.powerups.has(type) ? this.powerups.get(type).stacks : 0;
    }
    
    fireWeapons(bulletPool, audioManager) {
        // Fire bullets based on powerups (no cooldown needed since auto-fire handles timing)
        this.createBullets(bulletPool);
        
        // Throttle shoot sound to prevent overwhelming other audio
        const now = Date.now();
        if (now - this.lastShootSound > this.shootSoundInterval) {
            audioManager.playShoot();
            this.lastShootSound = now;
        }
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
            console.log(`🎯 Firing with powerups: Multi:${multiShotStacks} Spread:${spreadShotStacks} Pierce:${piercingStacks} Explosive:${explosiveStacks} Homing:${homingStacks}`);
        }
        
        // Calculate number of bullets to fire
        let bulletCount = 1;
        if (multiShotStacks > 0) {
            bulletCount += multiShotStacks; // +1 bullet per stack
        }
        if (spreadShotStacks > 0) {
            bulletCount += spreadShotStacks * 2; // +2 bullets per stack
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
                // Apply powerup effects to bullet
                if (homingStacks > 0) {
                    bullet.homing = true;
                    bullet.homingStrength = Math.min(0.25, homingStacks * 0.05); // Improved homing strength
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
    
    getMovementSpeedMultiplier() {
        const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
        return speedBoostStacks > 0 ? (1 + speedBoostStacks * 0.3) : 1;
    }
    
    getEffectiveShield() {
        const baseShield = this.shield;
        const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');
        const boostAmount = shieldBoostStacks * 15; // +15% damage reduction per stack
        const totalShield = baseShield + boostAmount + this.waveBonusShield;
        return Math.min(100, totalShield); // Cap at 100%
    }
    
    // Method to add wave bonus shield
    addWaveBonusShield(amount = 1) {
        this.waveBonusShield += amount;
        // Cap at reasonable maximum to prevent infinite scaling
        this.waveBonusShield = Math.min(this.waveBonusShield, 50); // Max 50% from waves
    }
    
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