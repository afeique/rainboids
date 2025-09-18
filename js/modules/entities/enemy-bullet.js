// Enemy bullets with different colors and effects
import { GameDimensions } from '../utils.js';

export class EnemyBullet {
    constructor() {
        this.active = false;
        this.explosive = false;
    }
    
    reset(x = 0, y = 0, velX = 0, velY = 0, color = '#ff4444', explosive = false) {
        this.x = x;
        this.y = y;
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
        
        // Gradually fade out over time (3 second lifespan)
        const maxLifetime = 3000; // 3 seconds in milliseconds
        const age = Date.now() - this.creationTime;
        this.life = Math.max(0, 1 - (age / maxLifetime));
        
        // Deactivate when opacity drops to 50%
        if (this.life <= 0.5) {
            this.createDisappearEffect();
            this.active = false;
            return;
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
        
        for (let i = 0; i < this.trail.length - 1; i++) {
            const alpha = (1 - i / this.trail.length) * 0.6 * this.life;
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
        ctx.globalAlpha = this.life;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        if (this.explosive) {
            this.drawExplosiveBullet(ctx);
        } else {
            this.drawRegularBullet(ctx);
        }
    }
    
    drawRegularBullet(ctx) {
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
        
        // Screen shake
        if (gameEngine.triggerScreenShake) {
            gameEngine.triggerScreenShake(8, 4, this.radius);
        }
    }
    
    createDisappearEffect() {
        // Create small spray of particles in the same color as the bullet
        const gameEngine = window.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;
        
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
    
    checkCollision(target) {
        if (!this.active || !target.active) return false;
        
        const dx = this.x - target.x;
        const dy = this.y - target.y;
        const distance = Math.hypot(dx, dy);
        const collisionRadius = this.radius + (target.radius || 10);
        
        return distance < collisionRadius;
    }
} 