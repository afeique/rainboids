// Star entity with various shapes and behaviors
import { GAME_CONFIG, NORMAL_STAR_COLORS, STAR_SHAPES } from '../constants.js';
import { random, wrap } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Star {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, burst = false) {
        this.x = x || random(0, this.width);
        this.y = y || random(0, this.height);
        
        // Create more depth layers with exponential distribution
        const depthRoll = Math.random();
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        
        // Create 10 distinct depth layers
        if (depthRoll < 0.15) {
            // Very far background stars (15%)
            this.z = random(0.1, 0.3);
        } else if (depthRoll < 0.35) {
            // Far background stars (20%)
            this.z = random(0.3, 0.6);
        } else if (depthRoll < 0.55) {
            // Mid-far stars (20%)
            this.z = random(0.6, 1.0);
        } else if (depthRoll < 0.70) {
            // Mid stars (15%)
            this.z = random(1.0, 1.5);
        } else if (depthRoll < 0.82) {
            // Mid-close stars (12%)
            this.z = random(1.5, 2.0);
        } else if (depthRoll < 0.91) {
            // Close stars (9%)
            this.z = random(2.0, 2.5);
        } else if (depthRoll < 0.97) {
            // Very close stars (6%)
            this.z = random(2.5, 3.0);
        } else {
            // Foreground stars (3%)
            this.z = random(3.0, 4.0);
        }
        
        this.radius = (this.z * 0.8 + 0.2) * scale;
        this.opacity = 0;
        this.opacityOffset = Math.random() * Math.PI * 2;
        // Slower twinkle for distant stars
        this.twinkleSpeed = random(0.01, 0.03) * (1 + this.z * 0.3);
        
        this.shape = STAR_SHAPES[Math.floor(Math.random() * STAR_SHAPES.length)];
        this.points = Math.floor(random(4, 7)) * 2;
        this.innerRadiusRatio = random(0.4, 0.8);
        
        this.isBurst = burst;
        this.vel = { x: 0, y: 0 };
        this.active = true;
        
        if (burst) {
            const ang = random(0, 2 * Math.PI);
            const spd = random(2, 5);
            this.vel = { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd };
            this.color = '#00ff7f';
            this.borderColor = '#ffd700';
            this.life = 900;
        } else {
            this.color = NORMAL_STAR_COLORS[Math.floor(Math.random() * NORMAL_STAR_COLORS.length)];
            this.borderColor = NORMAL_STAR_COLORS[Math.floor(Math.random() * NORMAL_STAR_COLORS.length)];
            this.life = -1;
        }
    }
    
    update(shipVel, playerPos, tractorEngaged) {
        if (!this.active) return;
        
        if (this.isBurst) {
            this.life--;
            if (this.life <= 0) {
                this.active = false;
                return;
            }
            
            this.vel.x *= GAME_CONFIG.STAR_FRIC;
            this.vel.y *= GAME_CONFIG.STAR_FRIC;
            this.x += this.vel.x;
            this.y += this.vel.y;
            
            this.opacity = Math.min(1, this.life / 120);
            
            // Attract to player
            const dx = playerPos.x - this.x;
            const dy = playerPos.y - this.y;
            const dist = Math.hypot(dx, dy);
            
            if (playerPos.active && dist < GAME_CONFIG.BURST_STAR_ATTRACT_DIST) {
                // Strong linear attraction for burst stars
                const strength = GAME_CONFIG.BURST_STAR_ATTR * this.z;
                this.vel.x += (dx / dist) * strength;
                this.vel.y += (dy / dist) * strength;
            }
        } else {
            // Normal star behavior
            const attractDist = tractorEngaged ? GAME_CONFIG.ACTIVE_STAR_ATTRACT_DIST : GAME_CONFIG.PASSIVE_STAR_ATTRACT_DIST;
            const attractStrength = tractorEngaged ? GAME_CONFIG.ACTIVE_STAR_ATTR : GAME_CONFIG.PASSIVE_STAR_ATTR;

            const dx = playerPos.x - this.x;
            const dy = playerPos.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (playerPos.active && dist < attractDist) {
                this.vel.x += (dx / dist) * attractStrength * this.z;
                this.vel.y += (dy / dist) * attractStrength * this.z;
            }

            this.vel.x *= GAME_CONFIG.STAR_FRIC;
            this.vel.y *= GAME_CONFIG.STAR_FRIC;
            this.x += this.vel.x;
            this.y += this.vel.y;

            this.opacityOffset += this.twinkleSpeed;
            this.opacity = (Math.sin(this.opacityOffset) + 1) / 2 * 0.9 + 0.1;
        }
        
        // Enhanced parallax effect with exponential scaling
        // Distant stars move much slower, close stars move faster
        const parallaxFactor = Math.pow(this.z, 2.2) * 0.15;
        this.x -= shipVel.x * parallaxFactor;
        this.y -= shipVel.y * parallaxFactor;
        wrap(this, this.width, this.height);
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        // Adjust opacity based on depth - distant stars are dimmer
        const depthOpacity = Math.min(1, 0.2 + Math.pow(this.z / 4, 1.5));
        ctx.globalAlpha = this.opacity * depthOpacity;
        
        if (this.shape === 'point') {
            const borderSize = 1;
            ctx.fillStyle = this.borderColor;
            ctx.fillRect(
                -this.radius / 2 - borderSize,
                -this.radius / 2 - borderSize,
                this.radius + borderSize * 2,
                this.radius + borderSize * 2
            );
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.radius / 2, -this.radius / 2, this.radius, this.radius);
        } else {
            ctx.beginPath();
            
            switch (this.shape) {
                case 'diamond':
                    ctx.moveTo(0, -this.radius);
                    ctx.lineTo(this.radius * 0.7, 0);
                    ctx.lineTo(0, this.radius);
                    ctx.lineTo(-this.radius * 0.7, 0);
                    ctx.closePath();
                    break;
                    
                case 'plus':
                    ctx.moveTo(0, -this.radius);
                    ctx.lineTo(0, this.radius);
                    ctx.moveTo(-this.radius, 0);
                    ctx.lineTo(this.radius, 0);
                    break;
                    
                case 'star4':
                    for (let i = 0; i < 8; i++) {
                        const a = i * Math.PI / 4;
                        const r = i % 2 === 0 ? this.radius : this.radius * 0.4;
                        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                    }
                    ctx.closePath();
                    break;
                    
                case 'star8':
                    for (let i = 0; i < this.points * 2; i++) {
                        const a = i * Math.PI / this.points;
                        const r = i % 2 === 0 ? this.radius : this.innerRadiusRatio;
                        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                    }
                    ctx.closePath();
                    break;
                    
                default:
                    ctx.moveTo(-this.radius, -this.radius);
                    ctx.lineTo(this.radius, this.radius);
                    ctx.moveTo(this.radius, -this.radius);
                    ctx.lineTo(-this.radius, this.radius);
                    break;
            }
            
            ctx.strokeStyle = this.borderColor;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 0.5 + this.z / 5;
            ctx.stroke();
        }
        
        ctx.restore();
    }
} 