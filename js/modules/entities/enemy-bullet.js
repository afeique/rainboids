// Enemy bullets with different colors and effects
import { GameDimensions } from '../utils.js';
import { ENEMY_BULLET_CONFIG } from '../constants.js';

export class EnemyBullet {
    constructor() {
        this.active = false;
        this.explosive = false;
    }
    
    reset(x = 0, y = 0, velX = 0, velY = 0, color = '#ff4444', explosive = false) {
        this.x = x;
        this.y = y;
        this.startX = x; // Track starting position for distance calculations
        this.startY = y;
        this.vel = { x: velX, y: velY };
        this.color = color;
        this.explosive = explosive;
        this.active = true;
        this.life = 1.0;
        this.creationTime = Date.now();

        // Visual properties
        this.radius = explosive ? 6 : 3;
        this.glowRadius = explosive ? 12 : 6;
        this.trailLength = explosive ? 8 : 4;
        this.trail = [];

        // Rotation for visual effect
        this.rotation = 0;
        this.rotationSpeed = explosive ? 0.1 : 0.05;

        // Damage (scaled back down to balanced levels)
        this.damage = explosive ? 3 : 2;

        // Movement pattern properties (set by enemy when creating bullet)
        this.movementPattern = 'aimed'; // Default pattern
        this.patternTimer = 0;
        this.patternPhase = 0;
        this.baseVel = { x: velX, y: velY }; // Store original velocity

        // Shape rendering
        this.shape = null; // null = circle, 'triangle', 'square', 'needle', 'mine'

        // Persistent bullets (mines) — bypass the life<=0.5 deactivation threshold
        this.isPersistent = false;
        this.maxLifetimeOverride = null; // Override default 3000ms lifetime (ms)

        // For mine proximity: reference to player (set by enemy that laid the mine)
        this.targetPlayer = null;

        // Burst of particles on natural expiry (used by Stalker laser segments)
        this.deathBurst = false;

        // Sine-wave oscillation (used by Sentinel sine-needle)
        this.sinePhase = 0;
        this.sineFreq  = 0;
        this.sineAmp   = 0;
        this.sinePerpX = 0;
        this.sinePerpY = 0;
    }
    
    update() {
        if (!this.active) return;
        
        // Store trail positions
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.trailLength) {
            this.trail.pop();
        }
        
        // Apply movement pattern
        this.applyMovementPattern();
        
        // Update position
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Update pattern timer
        this.patternTimer += 0.016; // Assuming 60fps
        
        // Persistent bullets (mines) use a fixed-duration lifetime, not life-fade
        if (this.isPersistent) {
            const maxLife = this.maxLifetimeOverride || 15000;
            if (Date.now() - this.creationTime > maxLife) {
                this.active = false;
                return;
            }
            this.life = 1.0; // Always full opacity
        } else {
            // Gradually fade out over time
            const maxLifetime = this.maxLifetimeOverride || 3000;
            const age = Date.now() - this.creationTime;
            this.life = Math.max(0, 1 - (age / maxLifetime));

            // Deactivate when opacity drops to 50%
            if (this.life <= 0.5) {
                this.createDisappearEffect();
                this.active = false;
                return;
            }
        }
        
        // Check bounds - recycle if off screen (use gameField dimensions)
        const margin = 50;
        const fieldWidth = window.gameEngine?.gameField?.width || GameDimensions.width;
        const fieldHeight = window.gameEngine?.gameField?.height || GameDimensions.height;
        
        if (this.x < -margin || this.x > fieldWidth + margin ||
            this.y < -margin || this.y > fieldHeight + margin) {
            // Don't create disappear effect for off-screen bullets (too far away to see)
            this.active = false; // Will be recycled by pool manager
        }
    }
    
    applyMovementPattern() {
        if (!this.baseVel) return; // Safety check
        
        const speed = Math.hypot(this.baseVel.x, this.baseVel.y);
        const baseAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
        
        switch (this.movementPattern) {
            case 'aimed':
                // Standard straight movement - no modification needed
                break;

            case 'mine':
                // Stationary proximity mine — zero velocity, large collision radius
                this.vel.x = 0;
                this.vel.y = 0;
                break;
                
            case 'spread':
                // Sinusoidal weaving pattern
                const waveFreq = 3;
                const waveAmp = 0.5;
                const perpAngle = baseAngle + Math.PI / 2;
                const waveOffset = Math.sin(this.patternTimer * waveFreq + this.patternPhase) * waveAmp;
                
                this.vel.x = this.baseVel.x + Math.cos(perpAngle) * waveOffset;
                this.vel.y = this.baseVel.y + Math.sin(perpAngle) * waveOffset;
                break;
                
            case 'rapid':
                // Erratic jittery movement
                const jitterStrength = 0.3;
                const jitterX = (Math.random() - 0.5) * jitterStrength;
                const jitterY = (Math.random() - 0.5) * jitterStrength;
                
                this.vel.x = this.baseVel.x + jitterX;
                this.vel.y = this.baseVel.y + jitterY;
                break;
                
            case 'spiral':
                // Spiral outward pattern
                const spiralRate = 2;
                const spiralRadius = this.patternTimer * 0.5;
                const spiralAngle = baseAngle + this.patternTimer * spiralRate;
                
                this.vel.x = Math.cos(spiralAngle) * speed + Math.cos(spiralAngle + Math.PI/2) * spiralRadius * 0.1;
                this.vel.y = Math.sin(spiralAngle) * speed + Math.sin(spiralAngle + Math.PI/2) * spiralRadius * 0.1;
                break;
                
            case 'burst':
                // Accelerating pattern that speeds up over time
                const accelFactor = 1 + this.patternTimer * 0.5;
                this.vel.x = this.baseVel.x * accelFactor;
                this.vel.y = this.baseVel.y * accelFactor;
                break;
                
            case 'explosive':
                // Slower start, then sudden acceleration
                let explosiveFactor;
                if (this.patternTimer < 0.5) {
                    explosiveFactor = 0.3; // Start slow
                } else {
                    explosiveFactor = 1.5 + (this.patternTimer - 0.5) * 2; // Sudden acceleration
                }
                
                this.vel.x = this.baseVel.x * explosiveFactor;
                this.vel.y = this.baseVel.y * explosiveFactor;
                break;
                
            case 'laser':
                // Laser beam - very fast and straight
                const laserSpeed = Math.hypot(this.baseVel.x, this.baseVel.y) * 2;
                const laserAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
                this.vel.x = Math.cos(laserAngle) * laserSpeed;
                this.vel.y = Math.sin(laserAngle) * laserSpeed;
                break;
                
            case 'laser_beam':
                // Wide laser beam segment - extremely fast and destructive
                const beamSpeed = Math.hypot(this.baseVel.x, this.baseVel.y) * 3;
                const beamAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
                this.vel.x = Math.cos(beamAngle) * beamSpeed;
                this.vel.y = Math.sin(beamAngle) * beamSpeed;
                // Reduced damage for balance - was (damage || 15) * 1.5
                this.damage = (this.damage || 3) * 1.0; // Much lower base damage
                this.radius = Math.max(this.radius, 8);
                break;
                
            case 'missile':
                // Homing missile - tracks player
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.05;
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                        
                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;
                        
                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                break;
                
            case 'homing':
                // Bomber homing shots - slower but more persistent tracking
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.03; // Slower turning than missiles
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                        
                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;
                        
                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                break;
                
            case 'titan_homing':
                // Titan tank missiles - faster but weaker homing than bomber
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.02; // Weaker homing than bomber (0.03) and missile (0.05)
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                        
                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;
                        
                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                break;
                
            case 'titan_rocket':
                // Fast, direct rockets - maintain constant speed
                const rocketSpeed = this.rocketSpeed || ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.SPEED;
                const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                
                // Maintain constant rocket speed
                if (currentSpeed !== rocketSpeed) {
                    const direction = Math.atan2(this.vel.y, this.vel.x);
                    this.vel.x = Math.cos(direction) * rocketSpeed;
                    this.vel.y = Math.sin(direction) * rocketSpeed;
                }
                
                // Track distance traveled
                if (this.distanceTraveled !== undefined) {
                    const dx = this.x - this.startX;
                    const dy = this.y - this.startY;
                    this.distanceTraveled = Math.hypot(dx, dy);
                    
                    // Explode after traveling max distance
                    const maxDistance = this.maxDistance || ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.MAX_DISTANCE;
                    if (this.distanceTraveled >= maxDistance) {
                        // Create explosion effect
                        this.createExplosionEffect();
                        this.active = false;
                    }
                }
                break;
                
            case 'missile_decelerate':
                // Missile turret missiles - start fast, decelerate, then explode
                // Use level-scaled deceleration or fall back to constants
                const prowlerConfig = ENEMY_BULLET_CONFIG.MISSILE.PROWLER_PIKE;
                if (!prowlerConfig) {
                    console.error('PROWLER_PIKE configuration not found!');
                    return; // Exit early if config is missing
                }
                const deceleration = this.deceleration || prowlerConfig.DECELERATION;
                const minSpeed = prowlerConfig.MIN_SPEED;
                
                // Decelerate in current direction
                const currentSpeedDeccel = Math.hypot(this.vel.x, this.vel.y);
                if (currentSpeedDeccel > minSpeed) {
                    const direction = Math.atan2(this.vel.y, this.vel.x);
                    const newSpeed = Math.max(currentSpeedDeccel - deceleration, minSpeed);
                    this.vel.x = Math.cos(direction) * newSpeed;
                    this.vel.y = Math.sin(direction) * newSpeed;
                } else {
                    // Reached minimum speed - explode and disappear
                    this.createExplosionEffect();
                    this.active = false;
                }
                
                // Check max distance for Prowler missiles
                if (this.maxDistance && this.startX !== undefined && this.startY !== undefined) {
                    const dx = this.x - this.startX;
                    const dy = this.y - this.startY;
                    const distanceTraveled = Math.hypot(dx, dy);
                    
                    if (distanceTraveled >= this.maxDistance) {
                        this.createExplosionEffect();
                        this.active = false;
                    }
                }
                break;
                
            case 'pulse':
                // Pulse shot - accelerates over time
                const pulseAccel = 1 + this.patternTimer * 0.8;
                this.vel.x = this.baseVel.x * pulseAccel;
                this.vel.y = this.baseVel.y * pulseAccel;
                break;
                
            case 'shield_burst':
                // Shield burst - steady speed with slight wobble
                const wobble = Math.sin(this.patternTimer * 8) * 0.2;
                const shieldPerpAngle = Math.atan2(this.baseVel.y, this.baseVel.x) + Math.PI / 2;
                this.vel.x = this.baseVel.x + Math.cos(shieldPerpAngle) * wobble;
                this.vel.y = this.baseVel.y + Math.sin(shieldPerpAngle) * wobble;
                break;
                
            case 'wave_energy':
                // Guardian crescent wave - slight sine wave motion
                const waveFrequency = 3; // How many waves per second
                const waveAmplitude = 15; // How far the wave deviates
                
                // Calculate perpendicular direction for wave motion
                const baseDirection = Math.atan2(this.baseVel.y, this.baseVel.x);
                const perpDirection = baseDirection + Math.PI / 2;
                
                // Apply sine wave offset
                const energyWaveOffset = Math.sin(this.patternTimer * waveFrequency) * waveAmplitude;
                const waveVelX = Math.cos(perpDirection) * energyWaveOffset * 0.1;
                const waveVelY = Math.sin(perpDirection) * energyWaveOffset * 0.1;
                
                // Combine base velocity with wave motion
                this.vel.x = this.baseVel.x + waveVelX;
                this.vel.y = this.baseVel.y + waveVelY;
                break;
                
            case 'energy_slash':
                // Guardian energy slash - maintains formation while moving forward
                const slashSpeed = Math.hypot(this.baseVel.x, this.baseVel.y);
                const slashDirection = Math.atan2(this.baseVel.y, this.baseVel.x);
                
                // Slight curve effect based on position in slash
                const curveIntensity = 0.3;
                const curveOffset = Math.sin(this.slashProgress * Math.PI) * curveIntensity;
                const perpSlashDirection = slashDirection + Math.PI / 2;
                
                // Apply curve to maintain crescent shape while moving
                const curveVelX = Math.cos(perpSlashDirection) * curveOffset;
                const curveVelY = Math.sin(perpSlashDirection) * curveOffset;
                
                // Maintain forward momentum with slight curve
                this.vel.x = this.baseVel.x + curveVelX;
                this.vel.y = this.baseVel.y + curveVelY;
                
                // Slight pulsing effect for energy
                const pulseIntensity = 1 + Math.sin(this.patternTimer * 8) * 0.1;
                this.vel.x *= pulseIntensity;
                this.vel.y *= pulseIntensity;
                break;
                
            case 'crescent_beam':
                // Guardian crescent beam - straight laser rays like Stalker but in crescent formation
                // No movement modification needed - straight laser beams
                break;
                
            case 'crescent_slice':
                // Guardian crescent slice - maintains parallel formation while moving
                // All bullets travel in same direction to maintain concentrated front
                // No movement modification needed - straight parallel movement
                break;

            case 'sine_wave':
                // Sinusoidal oscillation perpendicular to travel direction (Sentinel)
                this.sinePhase += this.sineFreq;
                const sineDisp = Math.sin(this.sinePhase) * this.sineAmp;
                this.vel.x = this.baseVel.x + this.sinePerpX * sineDisp;
                this.vel.y = this.baseVel.y + this.sinePerpY * sineDisp;
                // Keep needle oriented in actual travel direction
                this.rotation = Math.atan2(this.vel.y, this.vel.x);
                break;
        }
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        
        // Draw trail
        this.drawTrail(ctx);
        
        // Draw bullet
        this.drawBullet(ctx);
        
        ctx.restore();
    }
    
    drawTrail(ctx) {
        if (this.trail.length < 2) return;
        
        // Calculate base opacity for trail (same as bullet)
        let baseOpacity = this.life;
        if (this.movementPattern === 'crescent_slice' && this.maxLife) {
            const ageRatio = (Date.now() - this.creationTime) / (this.maxLife * 1000);
            baseOpacity = Math.max(0, 1 - ageRatio);
        }
        
        for (let i = 0; i < this.trail.length - 1; i++) {
            const alpha = (1 - i / this.trail.length) * 0.6 * baseOpacity;
            const width = this.radius * (1 - i / this.trail.length) * 0.5;
            
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            
            ctx.beginPath();
            ctx.moveTo(this.trail[i].x, this.trail[i].y);
            ctx.lineTo(this.trail[i + 1].x, this.trail[i + 1].y);
            ctx.stroke();
        }
    }
    
    drawBullet(ctx) {
        // Calculate opacity with fade effect for crescent slice bullets
        let opacity = this.life;
        if (this.movementPattern === 'crescent_slice' && this.maxLife) {
            // Create smooth fade from full opacity to 0 over the bullet's lifetime
            const ageRatio = (Date.now() - this.creationTime) / (this.maxLife * 1000);
            opacity = Math.max(0, 1 - ageRatio);
        }
        
        ctx.globalAlpha = opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        if (this.explosive) {
            this.drawExplosiveBullet(ctx);
        } else {
            this.drawRegularBullet(ctx);
        }
    }
    
    drawRegularBullet(ctx) {
        // Route to shape-specific renderers
        if (this.shape === 'triangle') { this.drawTriangleBullet(ctx); return; }
        if (this.shape === 'square')   { this.drawSquareBullet(ctx);   return; }
        if (this.shape === 'needle')   { this.drawNeedleBullet(ctx);   return; }
        if (this.shape === 'mine')     { this.drawMineBullet(ctx);     return; }

        // Default: circle bullet
        // Enhanced multi-layer glow effect for better visibility
        const time = Date.now() * 0.005;
        const pulseIntensity = 0.8 + Math.sin(time) * 0.2; // Subtle pulsing
        
        // Outer glow layer - larger and more prominent
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.glowRadius * 1.5);
        outerGlow.addColorStop(0, this.color + 'AA');
        outerGlow.addColorStop(0.3, this.color + '66');
        outerGlow.addColorStop(0.7, this.color + '33');
        outerGlow.addColorStop(1, this.color + '00');
        
        ctx.globalAlpha = pulseIntensity * 0.8 * this.life;
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, this.glowRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Middle glow layer
        const middleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.glowRadius);
        middleGlow.addColorStop(0, this.color + 'CC');
        middleGlow.addColorStop(0.5, this.color + '88');
        middleGlow.addColorStop(1, this.color + '00');
        
        ctx.globalAlpha = pulseIntensity * this.life;
        ctx.fillStyle = middleGlow;
        ctx.beginPath();
        ctx.arc(0, 0, this.glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Core bullet with enhanced brightness
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright inner core for visibility
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9 * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight with pulsing effect
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = (0.7 + pulseIntensity * 0.3) * this.life;
        ctx.beginPath();
        ctx.arc(-this.radius * 0.2, -this.radius * 0.2, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawExplosiveBullet(ctx) {
        // Enhanced pulsing glow effect for explosive bullets
        const pulse = Math.sin(Date.now() / 100) * 0.4 + 0.8;
        const glowSize = this.glowRadius * pulse;
        
        // Outer danger glow - larger and more prominent
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize * 1.8);
        outerGlow.addColorStop(0, this.color + 'DD');
        outerGlow.addColorStop(0.2, this.color + 'AA');
        outerGlow.addColorStop(0.5, this.color + '66');
        outerGlow.addColorStop(0.8, this.color + '22');
        outerGlow.addColorStop(1, this.color + '00');
        
        ctx.globalAlpha = pulse * 0.9 * this.life;
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize * 1.8, 0, Math.PI * 2);
        ctx.fill();
        
        // Middle warning glow
        const middleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        middleGlow.addColorStop(0, this.color + 'FF');
        middleGlow.addColorStop(0.3, this.color + 'BB');
        middleGlow.addColorStop(0.7, this.color + '66');
        middleGlow.addColorStop(1, this.color + '00');
        
        ctx.globalAlpha = pulse * this.life;
        ctx.fillStyle = middleGlow;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Spinning core with enhanced spikes
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const innerRadius = this.radius * 0.6;
            const outerRadius = this.radius * (1 + pulse * 0.3); // Pulsing spikes
            
            const x1 = Math.cos(angle) * innerRadius;
            const y1 = Math.sin(angle) * innerRadius;
            const x2 = Math.cos(angle) * outerRadius;
            const y2 = Math.sin(angle) * outerRadius;
            
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        
        // Bright warning center core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Pulsing danger indicator
        ctx.fillStyle = '#ffff00'; // Yellow warning color
        ctx.globalAlpha = pulse * 0.8 * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    explode(gameEngine) {
        if (!this.explosive) return;
        
        // Create explosion particles
        for (let i = 0; i < 15; i++) {
            if (gameEngine.particlePool) {
                const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
                if (particle) {
                    particle.color = this.color;
                    particle.life = 0.8;
                }
            }
        }
        
        // No screen shake for enemy bullet explosions - only player-related events should shake
    }
    
    createDisappearEffect() {
        // Create small spray of particles in the same color as the bullet
        const gameEngine = window.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;

        if (this.deathBurst) {
            // Stalker laser segments: vivid cyan burst with visible sparkle cloud
            const particleCount = 8 + Math.random() * 6; // 8–14 particles
            for (let i = 0; i < particleCount; i++) {
                const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
                if (particle) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 1.5 + Math.random() * 4;
                    particle.vel.x = Math.cos(angle) * speed;
                    particle.vel.y = Math.sin(angle) * speed;
                    particle.color = this.color;
                    particle.radius = 1.5 + Math.random() * 2.5;
                    particle.life = 20 + Math.random() * 25; // 20–45 frames
                    particle.friction = 0.93;
                }
            }
            return;
        }

        const particleCount = 4 + Math.random() * 4; // 4-8 particles

        for (let i = 0; i < particleCount; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                // Random direction for spray effect
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.5 + Math.random() * 2; // Slow speed for subtle effect

                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;

                // Use the same color as the bullet
                particle.color = this.color;

                // Small particles with short life
                particle.radius = 0.5 + Math.random() * 1.5;
                particle.life = 15 + Math.random() * 15; // 15-30 frames

                // Add some friction to make them slow down
                particle.friction = 0.95;
            }
        }
    }
    
    createExplosionEffect() {
        const gameEngine = window.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;
        
        // Create larger explosion for titan missiles
        const particleCount = 12 + Math.random() * 8; // 12-20 particles
        
        for (let i = 0; i < particleCount; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 6;
                
                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;
                particle.color = '#8A2BE2'; // Purple explosion
                particle.radius = 1 + Math.random() * 3;
                particle.life = 30 + Math.random() * 30;
                particle.friction = 0.92;
            }
        }
        
        // Add explosion pulse
        const explosionPulse = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 4);
        if (explosionPulse) {
            explosionPulse.color = '#8A2BE2';
        }
    }
    
    // ── Triangle bullet (Hunter) ─────────────────────────────────────────────
    // ctx is already rotated so that +X axis = travel direction
    drawTriangleBullet(ctx) {
        const r = this.radius;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8);
        glow.addColorStop(0, this.color + 'BB');
        glow.addColorStop(1, this.color + '00');
        ctx.globalAlpha = this.life * 0.9;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(r * 1.1, 0);            // tip → forward
        ctx.lineTo(-r * 0.65, -r * 0.85); // left back
        ctx.lineTo(-r * 0.65, r * 0.85);  // right back
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Square bullet (Guardian) ─────────────────────────────────────────────
    drawSquareBullet(ctx) {
        const r = this.radius;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
        glow.addColorStop(0, this.color + 'BB');
        glow.addColorStop(1, this.color + '00');
        ctx.globalAlpha = this.life * 0.85;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.rect(-r, -r, r * 2, r * 2);
        ctx.fill();
        ctx.stroke();

        // Bright center
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6 * this.life;
        ctx.beginPath();
        ctx.rect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
        ctx.fill();
    }

    // ── Needle bullet (Wasp) ─────────────────────────────────────────────────
    // ctx is rotated so +X = travel direction; draws an elongated needle
    drawNeedleBullet(ctx) {
        const len = this.radius * 5.5; // longer needle
        const w   = this.radius * 0.25; // thinner

        // Outer energy glow along the length
        const gradient = ctx.createLinearGradient(-len, 0, len, 0);
        gradient.addColorStop(0,   this.color + '00');
        gradient.addColorStop(0.35, this.color + '88');
        gradient.addColorStop(0.5, this.color + 'EE');
        gradient.addColorStop(0.65, this.color + '88');
        gradient.addColorStop(1,   this.color + '00');

        ctx.globalAlpha = this.life * 0.85;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, len, w * 2.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Core needle
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.85, w, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bright spine
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.85 * this.life;
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.55, w * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Mine bullet (Tangerine/Bomber) ───────────────────────────────────────
    drawMineBullet(ctx) {
        const pulse = 0.75 + Math.sin(Date.now() * 0.006) * 0.25;
        const r = this.radius;

        // Pulsing danger glow
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
        outerGlow.addColorStop(0, this.color + 'AA');
        outerGlow.addColorStop(0.5, this.color + '44');
        outerGlow.addColorStop(1, this.color + '00');
        ctx.globalAlpha = pulse * 0.7;
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner body
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Spikes (8 of them)
        const innerR = r * 0.55;
        const outerR = r * 1.05;
        ctx.strokeStyle = '#ffcc44';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + this.rotation;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
            ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
            ctx.stroke();
        }

        // Center warning dot
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse * 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    checkCollision(target) {
        if (!this.active || !target.active) return false;

        const dx = this.x - target.x;
        const dy = this.y - target.y;
        const distance = Math.hypot(dx, dy);
        const collisionRadius = this.radius + (target.radius || 10);

        return distance < collisionRadius;
    }
} 