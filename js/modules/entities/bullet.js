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
    
    reset(x, y, angle) {
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        this.x = x + Math.cos(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.y = y + Math.sin(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.radius = 3 * scale;
        this.angle = angle;
        this.vel = {
            x: Math.cos(angle) * GAME_CONFIG.BULLET_SPEED,
            y: Math.sin(angle) * GAME_CONFIG.BULLET_SPEED
        };
        this.life = 0;
        this.waveAmp = 4;
        this.active = true;
        this.mass = 1;
    }
    
    update(particlePool, asteroidPool) {
        if (!this.active) return;
        
        this.life++;
        
        // Add wave motion
        const perp = this.angle + Math.PI / 2;
        const off = Math.sin(this.life * 0.2) * this.waveAmp;
        
        this.x += this.vel.x + Math.cos(perp) * off;
        this.y += this.vel.y + Math.sin(perp) * off;
        
        // Homing effect: curve toward nearest asteroid if close
        if (asteroidPool && asteroidPool.activeObjects && asteroidPool.activeObjects.length > 0) {
            let nearest = null;
            let minDist = 99999;
            for (const ast of asteroidPool.activeObjects) {
                if (!ast.active) continue;
                const dx = ast.x - this.x;
                const dy = ast.y - this.y;
                const dist = Math.hypot(dx, dy);
                if (dist < minDist && dist < 60) {
                    minDist = dist;
                    nearest = ast;
                }
            }
            if (nearest) {
                const dx = nearest.x - this.x;
                const dy = nearest.y - this.y;
                const angleToAst = Math.atan2(dy, dx);
                // Interpolate current velocity angle toward target, but clamp max turn
                const curAngle = Math.atan2(this.vel.y, this.vel.x);
                let angleDiff = angleToAst - curAngle;
                // Normalize angleDiff to [-PI, PI]
                angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
                // Clamp to max 20 degrees (PI/9 radians) per frame
                const maxTurn = Math.PI / 9;
                if (angleDiff > maxTurn) angleDiff = maxTurn;
                if (angleDiff < -maxTurn) angleDiff = -maxTurn;
                // Make homing much stronger the closer the bullet is
                let homingStrength = 1 - (minDist / 60);
                homingStrength = Math.max(0.5, Math.min(1, homingStrength));
                const newAngle = curAngle + angleDiff * homingStrength;
                const speed = Math.hypot(this.vel.x, this.vel.y);
                this.vel.x = Math.cos(newAngle) * speed;
                this.vel.y = Math.sin(newAngle) * speed;
            }
        }
        
        // Phantom trail particles disabled (motion blur disabled)
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = `hsl(${this.life * 5 % 360}, 100%, 50%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.fill();
    }
}