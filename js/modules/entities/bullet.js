// Bullet projectile entity
import { GAME_CONFIG } from '../constants.js';
import { wrap } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Bullet {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, angle, shootingIntensity = 0) {
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        
        // Apply jitter based on shooting intensity - max 30 degrees (0.524 radians) after 5 seconds
        const jitterAmount = shootingIntensity * 0.524; // 30 degrees = ~0.524 radians
        const jitterAngle = angle + (Math.random() - 0.5) * jitterAmount;
        
        // Debug logging
        if (shootingIntensity > 0) {
            const angleChangeDegrees = ((jitterAngle - angle) * 180 / Math.PI);
            console.log(`Bullet jitter: intensity=${shootingIntensity.toFixed(3)}, jitterAmount=${jitterAmount.toFixed(3)}, angleChange=${angleChangeDegrees.toFixed(1)}°`);
        }
        
        this.x = x + Math.cos(jitterAngle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.y = y + Math.sin(jitterAngle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.radius = 2 * scale; // Smaller bullets
        this.angle = jitterAngle; // Use the jittered angle
        this.vel = {
            x: Math.cos(jitterAngle) * GAME_CONFIG.BULLET_SPEED,
            y: Math.sin(jitterAngle) * GAME_CONFIG.BULLET_SPEED
        };
        this.life = 0;
        this.active = true;
        this.mass = 1;
        this.trail = []; // Reset trail for reused bullets
        this.shootingIntensity = shootingIntensity; // Store for trail effects
    }
    
    update(particlePool, asteroidPool) {
        if (!this.active) return;
        
        this.life++;
        
        // Store previous position for trail
        if (!this.trail) {
            this.trail = [];
        }
        this.trail.push({ x: this.x, y: this.y });
        
        // Much longer trail length (25-30 segments based on shooting intensity)
        const baseTrailLength = 25;
        const maxTrailLength = 30;
        const trailLength = baseTrailLength + Math.floor(this.shootingIntensity * (maxTrailLength - baseTrailLength));
        
        if (this.trail.length > trailLength) {
            this.trail.shift();
        }
        
        // Simple straight movement - no homing or wave motion
        this.x += this.vel.x;
        this.y += this.vel.y;
    }

    draw(ctx) {
        if (!this.active) return;
        
        // Draw much longer and more dramatic trail
        if (this.trail && this.trail.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#FF6B00'; // Fiery orange
            ctx.lineCap = 'round';
            
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = i / this.trail.length; // Fade from 0 to 1
                const width = alpha * 4 + (this.shootingIntensity * 0.5); // Thicker trails with intensity
                
                ctx.globalAlpha = alpha * 0.9;
                ctx.lineWidth = width;
                
                ctx.beginPath();
                ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Draw main bullet - elongated bullet shape
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.fillStyle = '#FF4500'; // Bright fiery orange
        ctx.shadowColor = '#FF6B00';
        ctx.shadowBlur = 8 + (this.shootingIntensity * 2); // Enhance glow with intensity
        
        // Draw elongated bullet body (cylinder)
        const length = this.radius * 3; // Make it 3x longer than radius
        const width = this.radius;
        
        ctx.beginPath();
        // Main cylindrical body
        ctx.rect(-length/2, -width/2, length * 0.8, width);
        ctx.fill();
        
        // Pointed tip (triangle)
        ctx.beginPath();
        ctx.moveTo(length/2 - length * 0.2, 0); // Point at front
        ctx.lineTo(length/2 - length * 0.8, -width/2); // Top of body
        ctx.lineTo(length/2 - length * 0.8, width/2); // Bottom of body
        ctx.closePath();
        ctx.fill();
        
        // Add bright inner core (smaller elongated shape)
        ctx.fillStyle = '#FFFF00'; // Bright yellow center
        ctx.shadowBlur = 4 + (this.shootingIntensity * 1);
        
        ctx.beginPath();
        const coreLength = length * 0.6;
        const coreWidth = width * 0.5;
        
        // Core body
        ctx.rect(-coreLength/2, -coreWidth/2, coreLength * 0.8, coreWidth);
        ctx.fill();
        
        // Core tip
        ctx.beginPath();
        ctx.moveTo(coreLength/2 - coreLength * 0.2, 0);
        ctx.lineTo(coreLength/2 - coreLength * 0.8, -coreWidth/2);
        ctx.lineTo(coreLength/2 - coreLength * 0.8, coreWidth/2);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
}