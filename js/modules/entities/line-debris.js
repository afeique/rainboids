// Line debris from destroyed asteroids
import { random } from '../utils.js';

export class LineDebris {
    constructor() {
        this.active = false;
    }
    
    reset(x, y, p1, p2, color = null) {
        this.x = x;
        this.y = y;
        this.life = 1;
        this.p1 = p1;
        this.p2 = p2;
        this.active = true;
        
        // Use provided color or default to rainbow
        if (color) {
            this.useFixedColor = true;
            this.fixedColor = color;
            this.hue = 0; // Not used when fixed color is set
            this.hueShift = 0;
        } else {
            this.useFixedColor = false;
            this.hue = random(0, 360);
            this.hueShift = random(2, 5); // Speed of color change
        }
        
        // Calculate velocity based on midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const ang = Math.atan2(midY, midX);
        const spd = random(2, 5);
        
        this.vel = { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd };
        this.rot = 0;
        this.rotVel = random(-0.1, 0.1);
    }
    
    update() {
        if (!this.active) return;
        
        this.x += this.vel.x;
        this.y += this.vel.y;
        this.rot += this.rotVel;
        this.life -= 0.02;
        
        // Only update hue if using rainbow colors
        if (!this.useFixedColor) {
            this.hue = (this.hue + this.hueShift) % 360;
        }
        
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        ctx.globalAlpha = Math.max(0, this.life);
        
        // Use fixed color or rainbow HSL
        if (this.useFixedColor) {
            ctx.strokeStyle = this.fixedColor;
        } else {
            ctx.strokeStyle = `hsl(${this.hue}, 100%, 50%)`;
        }
        
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(this.p1.x, this.p1.y);
        ctx.lineTo(this.p2.x, this.p2.y);
        ctx.stroke();
        
        ctx.restore();
    }
} 