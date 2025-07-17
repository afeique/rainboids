// Optimized entity base classes that minimize canvas state changes
import { pathCache } from './path-cache.js';

// Base class for optimized entities
export class OptimizedEntity {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.radius = 10;
        this.active = false;
    }
    
    // Get render state for batching
    getRenderState() {
        return {
            strokeStyle: '#ffffff',
            fillStyle: null,
            globalAlpha: 1,
            lineWidth: 1
        };
    }
    
    // Draw without save/restore - assumes correct transform
    drawBatched(ctx) {
        // Override in subclasses
    }
}

// Optimized player that uses Path2D
export class OptimizedPlayer extends OptimizedEntity {
    constructor() {
        super();
        this.angle = 0;
        this.size = 12;
        this.isThrusting = false;
        this.thrustAnimation = 0;
    }
    
    getRenderState() {
        return {
            strokeStyle: this.invincible && Math.sin(Date.now() * 0.02) > 0 ? 
                'rgba(255, 255, 255, 0.5)' : '#ffffff',
            fillStyle: null,
            globalAlpha: 1,
            lineWidth: 2
        };
    }
    
    drawBatched(ctx) {
        // Use cached Path2D
        const shipPath = pathCache.getShipPath(this.size);
        
        // Apply transform
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Draw ship
        ctx.stroke(shipPath);
        
        // Draw thrust if active
        if (this.isThrusting) {
            const thrusterPath = pathCache.getThrusterPath(this.size);
            ctx.strokeStyle = '#ff6600';
            ctx.stroke(thrusterPath);
        }
        
        // Reset transform
        ctx.rotate(-this.angle);
        ctx.translate(-this.x, -this.y);
    }
}

// Optimized bullet that uses Path2D
export class OptimizedBullet extends OptimizedEntity {
    constructor() {
        super();
        this.radius = 3;
    }
    
    getRenderState() {
        return {
            strokeStyle: null,
            fillStyle: '#ffff00',
            globalAlpha: 1,
            lineWidth: 0
        };
    }
    
    drawBatched(ctx) {
        const bulletPath = pathCache.getBulletPath(this.radius);
        ctx.translate(this.x, this.y);
        ctx.fill(bulletPath);
        ctx.translate(-this.x, -this.y);
    }
}

// Optimized star that uses Path2D
export class OptimizedStar extends OptimizedEntity {
    constructor() {
        super();
        this.shape = 'circle';
        this.color = '#ffffff';
        this.borderColor = '#ffffff';
    }
    
    getRenderState() {
        return {
            strokeStyle: this.borderColor,
            fillStyle: this.color,
            globalAlpha: this.opacity || 1,
            lineWidth: 1
        };
    }
    
    drawBatched(ctx) {
        const starPath = pathCache.getStarPath(this.shape, this.radius);
        ctx.translate(this.x, this.y);
        
        if (this.color) {
            ctx.fill(starPath);
        }
        if (this.borderColor) {
            ctx.stroke(starPath);
        }
        
        ctx.translate(-this.x, -this.y);
    }
}

// Optimized particle for batch rendering
export class OptimizedParticle extends OptimizedEntity {
    constructor() {
        super();
        this.type = 'basic';
        this.life = 1;
        this.color = { r: 255, g: 255, b: 255 };
    }
    
    // Particles are rendered through ParticleBatch, not individually
    drawBatched(ctx) {
        // Not used - particles go through particle batch system
    }
    
    // Convert to pixel data for particle batch
    toPixelData() {
        return {
            x: this.x,
            y: this.y,
            r: this.color.r,
            g: this.color.g,
            b: this.color.b,
            a: this.life,
            radius: this.radius
        };
    }
}