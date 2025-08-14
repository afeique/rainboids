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
        
        // Damage (scaled 10x for new health system)
        this.damage = explosive ? 30 : 20;
        
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
        
        // Don't fade over time - bullets stay strong until they hit something or go off-screen
        
        // Check bounds - recycle if off screen (no fade decay)
        const margin = 50;
        if (this.x < -margin || this.x > GameDimensions.width + margin ||
            this.y < -margin || this.y > GameDimensions.height + margin) {
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
        
        ctx.globalAlpha = pulseIntensity * 0.8;
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, this.glowRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Middle glow layer
        const middleGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.glowRadius);
        middleGlow.addColorStop(0, this.color + 'CC');
        middleGlow.addColorStop(0.5, this.color + '88');
        middleGlow.addColorStop(1, this.color + '00');
        
        ctx.globalAlpha = pulseIntensity;
        ctx.fillStyle = middleGlow;
        ctx.beginPath();
        ctx.arc(0, 0, this.glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Core bullet with enhanced brightness
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright inner core for visibility
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight with pulsing effect
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.7 + pulseIntensity * 0.3;
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
        
        ctx.globalAlpha = pulse * 0.9;
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
        
        ctx.globalAlpha = pulse;
        ctx.fillStyle = middleGlow;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Spinning core with enhanced spikes
        ctx.globalAlpha = 1;
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
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        // Pulsing danger indicator
        ctx.fillStyle = '#ffff00'; // Yellow warning color
        ctx.globalAlpha = pulse * 0.8;
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
    
    checkCollision(target) {
        if (!this.active || !target.active) return false;
        
        const dx = this.x - target.x;
        const dy = this.y - target.y;
        const distance = Math.hypot(dx, dy);
        const collisionRadius = this.radius + (target.radius || 10);
        
        return distance < collisionRadius;
    }
} 