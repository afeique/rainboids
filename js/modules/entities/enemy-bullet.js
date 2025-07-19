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
        
        // Damage
        this.damage = explosive ? 3 : 2;
    }
    
    update() {
        if (!this.active) return;
        
        // Store trail positions
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > this.trailLength) {
            this.trail.pop();
        }
        
        // Update position
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Update rotation
        this.rotation += this.rotationSpeed;
        
        // Don't fade over time - bullets stay strong until they hit something or go off-screen
        
        // Check bounds - recycle if off screen (no fade decay)
        const margin = 50;
        if (this.x < -margin || this.x > GameDimensions.width + margin ||
            this.y < -margin || this.y > GameDimensions.height + margin) {
            this.active = false; // Will be recycled by pool manager
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
        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.glowRadius);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.5, this.color + '88');
        gradient.addColorStop(1, this.color + '00');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Core bullet
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawExplosiveBullet(ctx) {
        // Pulsing glow effect
        const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
        const glowSize = this.glowRadius * pulse;
        
        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(0.3, this.color + 'aa');
        gradient.addColorStop(0.7, this.color + '44');
        gradient.addColorStop(1, this.color + '00');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Spinning core with spikes
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const innerRadius = this.radius * 0.6;
            const outerRadius = this.radius;
            
            const x1 = Math.cos(angle) * innerRadius;
            const y1 = Math.sin(angle) * innerRadius;
            const x2 = Math.cos(angle) * outerRadius;
            const y2 = Math.sin(angle) * outerRadius;
            
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        
        // Center core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3, 0, Math.PI * 2);
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