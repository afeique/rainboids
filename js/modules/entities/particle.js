// Particle effects system
import { random } from '../utils.js';

export class Particle {
    constructor() {
        this.active = false;
    }
    
    reset(x, y, type, ...args) {
        this.x = x;
        this.y = y;
        this.active = true;
        this.type = type;
        
        switch (type) {
            case 'explosion':
                this.radius = random(1, 3);
                this.vel = { x: random(-3, 3), y: random(-3, 3) };
                this.life = 1;
                this.color = `hsl(${random(0, 360)}, 100%, 70%)`;
                break;
                
            case 'playerExplosion':
                this.life = 1;
                this.radius = 0;
                this.maxRadius = 150;
                this.color = '#0ff';
                break;
                
            case 'thrust':
                const [angle] = args;
                const cols = ['#ff4500', '#ff8c00', '#ffa500'];
                this.color = cols[Math.floor(random(0, cols.length))];
                const a = angle + random(-0.26, 0.26);
                const s = random(1.5, 3);
                this.radius = random(1, 2.5);
                this.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                this.life = 1;
                break;
                
            case 'phantom':
                const [color, radius] = args;
                this.color = color;
                this.radius = radius * 0.8;
                this.life = 0.5;
                this.vel = { x: 0, y: 0 };
                break;
                
            case 'pickupPulse':
                this.life = 1;
                this.radius = 0;
                this.maxRadius = 30;
                this.color = 'white';
                break;
                
            case 'starBlip':
                this.life = args[0] || 0.3;
                this.radius = args[1] || 3;
                this.maxRadius = this.radius * 2;
                this.color = '#FFD700';
                this.fadeRate = 0.1;
                this.growthRate = 0.2;
                break;
                
            case 'starSparkle':
                this.life = 0.4;
                this.radius = 1;
                this.color = '#FFD700';
                this.vel = { x: 0, y: 0 };
                break;
            case 'explosionPulse':
                this.life = 0.5;
                this.radius = 0;
                this.maxRadius = args[0] || 60;
                this.color = 'rgba(255,80,0,1)';
                break;
            case 'explosionRedOrange':
                this.radius = random(4, 8); // larger
                this.vel = { x: random(-5, 5), y: random(-5, 5) };
                this.life = random(0.7, 1.2); // longer-lived
                this.hue = random(10, 45); // wider fiery range
                this.sat = random(95, 100); // more saturated
                this.light = random(55, 70); // lighter
                break;
            case 'asteroidCollisionDebris':
                this.radius = random(2, 8); // More size variation
                const debrisSpeed = random(2, 6); // Initial speed
                const debrisAngle = random(0, Math.PI * 2);
                this.vel = { x: Math.cos(debrisAngle) * debrisSpeed, y: Math.sin(debrisAngle) * debrisSpeed };
                this.life = random(0.4, 0.8);
                const gray = Math.floor(random(80, 180));
                this.color = `rgb(${gray},${gray},${gray})`;
                break;
            case 'fieryExplosionRing':
                this.life = 0.9; // longer visible
                this.radius = 0;
                this.maxRadius = args[0] || 60;
                // Randomize start and end colors in red-orange range
                this.startHue = random(10, 20); // deeper red-orange
                this.endHue = random(25, 45);   // more orange
                this.sat = random(95, 100);     // more saturated
                this.light = random(55, 70);    // lighter
                break;
            case 'tractorBeamRing':
                this.life = 1;
                this.radius = args[0] || 80;
                this.maxRadius = this.radius;
                this.color = 'rgba(0,255,255,0.7)';
                break;
            case 'tractorCircle':
                this.life = 1;
                this.radius = args[0] || 120;
                this.maxRadius = this.radius;
                this.colorStart = 'rgba(80,255,80,0.7)';
                this.colorEnd = 'rgba(0,80,0,0.2)';
                break;
            case 'tractorBeamParticle': {
                // args: targetX, targetY
                const [targetX, targetY] = args;
                this.targetX = targetX;
                this.targetY = targetY;
                this.radius = random(1, 3);
                this.baseRadius = this.radius;
                this.life = 1;
                this.maxLife = 1;
                // Blue palette for richer neon effect
                const bluePalette = [
                    'rgba(0,200,255,1)', // neon blue
                    'rgba(0,120,255,1)', // deep blue
                    'rgba(0,180,255,1)', // cyan blue
                    'rgba(0,80,200,1)',  // rich blue
                    'rgba(40,120,255,1)', // electric blue
                    'rgba(0,255,255,1)'  // light blue
                ];
                this.color = bluePalette[Math.floor(random(0, bluePalette.length))];
                this.glowColor = this.color.replace(',1)', ',0.7)');
                this.neonColor = this.color.replace(',1)', ',0.5)');
                // Decrease speed: lower velocity multiplier
                this.vel = { x: (targetX - this.x) * random(0.02, 0.045), y: (targetY - this.y) * random(0.02, 0.045) };
                break;
            }
            
            case 'damageNumber':
                const [damage] = args;
                this.damage = damage;
                this.life = 1;
                this.vel = { x: random(-0.5, 0.5), y: -2 }; // Float upward
                this.fontSize = 16;
                break;
        }
    }
    
    update() {
        if (!this.active) return;
        
        switch (this.type) {
            case 'explosion':
            case 'thrust':
            case 'phantom':
            case 'explosionRedOrange':
                this.x += this.vel?.x || 0;
                this.y += this.vel?.y || 0;
                this.life -= 0.04;
                if (this.type === 'explosionRedOrange') {
                    this.hue += random(-2, 2); // animate color
                }
                break;
                
            case 'phantom':
                this.life -= 0.05;
                break;
                
            case 'playerExplosion':
                this.life -= 0.02;
                this.radius = (1 - this.life ** 2) * this.maxRadius;
                break;
                
            case 'pickupPulse':
                this.life -= 0.04;
                this.radius = (1 - this.life) * this.maxRadius;
                break;
                
            case 'starBlip':
                this.life -= this.fadeRate || 0.1;
                this.radius += (this.growthRate || 0.15) * this.radius;
                if (this.radius > this.maxRadius) this.radius = this.maxRadius;
                break;
                
            case 'starSparkle':
                this.x += this.vel.x;
                this.y += this.vel.y;
                this.life -= 0.025;
                this.radius *= 0.95; // Shrink as it moves
                break;
            case 'explosionPulse':
                this.life -= 0.06;
                this.radius = (1 - this.life) * this.maxRadius;
                break;
            case 'asteroidCollisionDebris':
                this.x += this.vel.x;
                this.y += this.vel.y;
                // Apply velocity dampening to slow down
                this.vel.x *= 0.92;
                this.vel.y *= 0.92;
                this.life -= 0.03;
                break;
            case 'fieryExplosionRing':
                this.radius = (1 - this.life) * this.maxRadius;
                this.life -= 0.025;
                break;
            case 'tractorBeamRing':
                this.radius = this.maxRadius * this.life;
                this.life -= 0.06;
                break;
            case 'tractorCircle':
                this.radius = this.maxRadius * this.life;
                this.life -= 0.04;
                break;
            case 'tractorBeamParticle': {
                this.x += this.vel.x;
                this.y += this.vel.y;
                // Fade out as it nears the ship
                this.life -= 0.04 + 0.02 * Math.random();
                // Shrink as it fades
                this.radius = this.baseRadius * this.life;
                break;
            }
            
            case 'damageNumber':
                this.x += this.vel.x;
                this.y += this.vel.y;
                this.vel.y += 0.1; // Gravity effect
                this.life -= 0.025; // Fade out quickly
                break;
        }
        
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        
        switch (this.type) {
            case 'explosion':
            case 'thrust':
            case 'phantom':
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'explosionRedOrange':
                ctx.fillStyle = `hsl(${this.hue}, ${this.sat}%, ${this.light}%)`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'explosionPulse':
                ctx.strokeStyle = 'rgba(255,80,0,0.7)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
                
            case 'playerExplosion':
            case 'pickupPulse':
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
                
            case 'starBlip':
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life * 2); // Brighter
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 30; // More glow
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                // Add inner bright core
                ctx.globalAlpha = Math.max(0, this.life * 3);
                ctx.fillStyle = '#FFFFE0'; // Light yellow
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
                break;
                
            case 'starSparkle':
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life * 2);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
                break;
            case 'asteroidCollisionDebris':
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life);
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
                break;
            case 'fieryExplosionRing': {
                ctx.save();
                // Animate hue from start to end
                const t = 1 - this.life / 0.9;
                const hue = this.startHue + (this.endHue - this.startHue) * t;
                ctx.globalAlpha = Math.max(0, this.life * 1.7); // higher alpha
                ctx.strokeStyle = `hsl(${hue}, ${this.sat}%, ${this.light}%)`;
                ctx.lineWidth = 12 * (this.life + 0.2); // thicker ring
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'tractorBeamRing':
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life * 1.2);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 4 + 8 * this.life;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
                break;
            case 'tractorCircle': {
                ctx.save();
                // Interpolate color from bright to dark green
                const t = 1 - this.life;
                const r1 = 80 + (0 - 80) * t;
                const g1 = 255 + (80 - 255) * t;
                const b1 = 80 + (0 - 80) * t;
                const a1 = 0.7 * this.life;
                ctx.shadowColor = `rgba(80,255,80,0.7)`;
                ctx.shadowBlur = 18 * this.life;
                ctx.strokeStyle = `rgba(${r1},${g1},${b1},${a1})`;
                ctx.lineWidth = 6 + 10 * this.life;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'tractorBeamParticle': {
                // Draw main glowing particle only (no trail)
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life);
                ctx.shadowColor = this.glowColor;
                ctx.shadowBlur = 32;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.restore();
                break;
            }
            
            case 'damageNumber':
                ctx.save();
                ctx.font = `${this.fontSize}px 'Press Start 2P', monospace`;
                ctx.fillStyle = '#ff0000';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = Math.max(0, this.life);
                // Draw black outline
                ctx.strokeText(`-${this.damage}`, this.x, this.y);
                // Draw red text
                ctx.fillText(`-${this.damage}`, this.x, this.y);
                ctx.restore();
                break;
        }
        
        ctx.restore();
    }
} 