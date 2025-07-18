// Background star entity for non-collectible parallax starfield
import { GAME_CONFIG } from '../constants.js';
import { random, wrap } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class BackgroundStar {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, z, density) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.density = density;
        
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        
        // Simple white point stars - larger and more visible
        const densityFactor = 0.5 + (this.density || 0.5) * 0.5;
        this.radius = (this.z * 0.8 + 0.3) * scale * densityFactor; // Larger and more visible
        
        // Twinkling properties
        this.opacity = 0;
        this.opacityOffset = Math.random() * Math.PI * 2;
        this.twinkleSpeed = random(0.005, 0.02) * (1 + this.z * 0.2) * densityFactor;
        
        // White color with slight variations
        const brightness = 200 + Math.floor(Math.random() * 55); // 200-255
        this.color = `rgb(${brightness}, ${brightness}, ${brightness})`;
        
        this.active = true;
    }
    
    update(shipVel) {
        if (!this.active) return;
        
        // Simple twinkling - brighter
        this.opacityOffset += this.twinkleSpeed;
        this.opacity = (Math.sin(this.opacityOffset) + 1) / 2 * 0.6 + 0.5; // 0.5 to 1.1 opacity (brighter)
        
        // Enhanced parallax effect - same as collectible stars
        const parallaxFactor = Math.pow(this.z, 2.5) * 0.25;
        this.x -= shipVel.x * parallaxFactor;
        this.y -= shipVel.y * parallaxFactor;
        wrap(this, this.width, this.height);
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Store rendering properties for batch rendering
        this.depthOpacity = Math.min(1, 0.4 + Math.pow(this.z / 4, 1.0));
        this.finalOpacity = this.opacity * this.depthOpacity;
        
        // Background stars will be batch rendered - this method just prepares properties
    }
    
    // Direct rendering fallback (used by starfield renderer when needed)
    drawDirect(ctx) {
        ctx.save();
        
        // Adjust opacity based on depth - brighter overall
        ctx.globalAlpha = this.finalOpacity;
        
        // Simple point star
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.restore();
    }
} 