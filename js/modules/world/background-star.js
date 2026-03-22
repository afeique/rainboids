// Background star entity for non-collectible parallax starfield
import { GAME_CONFIG } from '../core/constants.js';
import { random, wrap } from '../core/utils.js';

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
        
        // Background stars are always simple circles
        this.shape = 'circle';
        
        // Twinkling properties
        this.opacity = 0;
        this.opacityOffset = Math.random() * Math.PI * 2;
        this.twinkleSpeed = random(0.004, 0.018) * (1 + this.z * 0.25) * densityFactor;
        this.twinkleAmplitude = random(0.25, 0.45); // Vary how much each star twinkles

        // Star colors: cool tones that contrast well with red danger indicators
        const colorRoll = Math.random();
        const brightness = 200 + Math.floor(Math.random() * 55); // 200-255
        if (colorRoll < 0.45) {
            // Blue-white (hot stars) — most common
            const b = Math.min(255, brightness + 15);
            const g = Math.min(255, brightness + 5);
            this.color = `rgb(${brightness}, ${g}, ${b})`;
        } else if (colorRoll < 0.70) {
            // Pure white
            this.color = `rgb(${brightness}, ${brightness}, ${brightness})`;
        } else if (colorRoll < 0.85) {
            // Cyan-white (blue giant)
            const g = Math.min(255, brightness + 10);
            const b = Math.min(255, brightness + 20);
            this.color = `rgb(${brightness - 15}, ${g}, ${b})`;
        } else {
            // Warm gold-white (sun-like, no red push)
            const r = Math.min(255, brightness + 5);
            const g = Math.min(255, brightness);
            const b = Math.max(185, brightness - 15);
            this.color = `rgb(${r}, ${g}, ${b})`;
        }
        
        this.active = true;
    }
    
    update(shipVel, gameField = null) {
        if (!this.active) return;
        
        // Natural twinkling with per-star amplitude variation
        this.opacityOffset += this.twinkleSpeed;
        const twinkle = (Math.sin(this.opacityOffset) + 1) / 2; // 0–1
        this.opacity = (1 - this.twinkleAmplitude) + twinkle * this.twinkleAmplitude; // varies by star
        
        // Reduced parallax effect for less distraction
        const parallaxFactor = Math.pow(this.z, 1.8) * 0.12;
        this.x -= shipVel.x * parallaxFactor;
        this.y -= shipVel.y * parallaxFactor;
        
        // Use game field dimensions if available, otherwise fall back to screen dimensions
        const wrapWidth = gameField ? gameField.width : this.width;
        const wrapHeight = gameField ? gameField.height : this.height;
        wrap(this, wrapWidth, wrapHeight);
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Calculate final opacity for depth batching
        const depthOpacity = Math.min(1, 0.4 + Math.pow(this.z / 4, 1.0));
        this.finalOpacity = this.opacity * depthOpacity;
        
        // No rendering here - will be handled by depth batch renderer
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