// Player ship entity
import { GAME_CONFIG } from '../constants.js';
import { random, wrap } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Player {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.isThrusting = false;
        this.active = false;
        this.reset();
    }
    
    reset() {
        this.x = this.width / 2;
        this.y = this.height / 2;
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        this.radius = (GAME_CONFIG.SHIP_SIZE * scale) / 2;
        this.angle = -Math.PI / 2;
        this.vel = { x: 0, y: 0 };
        this.canShoot = true;
        this.active = true;
        this.isThrusting = false;
        // Player mass (smaller than most asteroids)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.5;
    }
    
    update(input, particlePool, bulletPool, audioManager) {
        if (!this.active) return;
        // On mobile, instantly set angle to joystick direction if joystick is active
        if ((typeof input.joystickX === 'number' && typeof input.joystickY === 'number') && (input.joystickX !== 0 || input.joystickY !== 0)) {
            // Joystick Y is negative up, so flip for screen coordinates
            this.angle = Math.atan2(input.joystickY, input.joystickX);
        } else {
            // Handle rotation (desktop/keyboard)
            this.angle += GAME_CONFIG.TURN_SPEED * input.rotation;
        }
        
        // Handle thrust - use joystick Y-axis for thrust control
        this.isThrusting = input.up;
        
        if (this.isThrusting) {
            this.vel.x += Math.cos(this.angle) * GAME_CONFIG.SHIP_THRUST;
            this.vel.y += Math.sin(this.angle) * GAME_CONFIG.SHIP_THRUST;
            
            const rear = this.angle + Math.PI;
            const dist = this.radius * 1.2;
            const spread = this.radius * 0.8;
            
            for (let i = 0; i < 4; i++) {
                const p_angle = rear + random(-0.3, 0.3);
                const p_dist = random(0, spread);
                const p_x = this.x + Math.cos(p_angle) * dist + Math.cos(p_angle + Math.PI/2) * p_dist;
                const p_y = this.y + Math.sin(p_angle) * dist + Math.sin(p_angle + Math.PI/2) * p_dist;
                particlePool.get(p_x, p_y, 'thrust', rear);
            }
        } else if (input.down) {
            // Deceleration (still available for keyboard controls)
            this.vel.x *= GAME_CONFIG.SHIP_FRICTION * 0.95;
            this.vel.y *= GAME_CONFIG.SHIP_FRICTION * 0.95;
        } else {
            // Natural friction
            this.vel.x *= GAME_CONFIG.SHIP_FRICTION;
            this.vel.y *= GAME_CONFIG.SHIP_FRICTION;
        }
        
        if (this.isThrusting) {
            audioManager.playThruster();
        }
        
        // Limit velocity
        const mag = Math.hypot(this.vel.x, this.vel.y);
        if (mag > GAME_CONFIG.MAX_V) {
            this.vel.x = (this.vel.x / mag) * GAME_CONFIG.MAX_V;
            this.vel.y = (this.vel.y / mag) * GAME_CONFIG.MAX_V;
        }
        
        this.x += this.vel.x;
        this.y += this.vel.y;
        wrap(this, this.width, this.height);
        
        // Handle shooting (only with input.firePressed and cooldown)
        if (input.firePressed && this.canShoot) {
            bulletPool.get(this.x, this.y, this.angle);
            audioManager.playShoot();
            this.canShoot = false;
            setTimeout(() => this.canShoot = true, 200);
        }
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);
        
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 15;
        ctx.globalCompositeOperation = 'lighter';
        
        const r = this.radius;
        const w = 1.15;
        
        // Draw ship body
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.96 * w, r * 0.9);
        ctx.lineTo(r * 0.6 * w, r * 0.9);
        ctx.lineTo(0, -r * 0.1);
        ctx.closePath();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(-r * 0.96 * w, r * 0.9);
        ctx.lineTo(-r * 0.6 * w, r * 0.9);
        ctx.lineTo(0, -r * 0.1);
        ctx.closePath();
        ctx.stroke();
        
        // Draw visual-only direction triangle (guillemet/raquo) at the head (blue)
        ctx.save();
        ctx.shadowColor = '#3399ff';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#3399ff'; // blue
        ctx.lineWidth = 3;
        const triangleOffset = -r; // tip of ship
        const triangleLength = r * 1.5;
        const tip = triangleOffset - triangleLength; // tip of triangle
        const base = triangleOffset - triangleLength * 0.45; // base closer to tip
        const side = r * 0.37;
        ctx.beginPath();
        ctx.moveTo(0, tip);
        ctx.lineTo(side, base);
        ctx.lineTo(-side, base);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Draw visual-only thruster triangles (at the base/rear of the ship, red)
        const thrusterAngle = Math.PI / 5; // angle outward from rear
        const thrusterDistance = r * 0.7; // how far from center (rear)
        const thrusterLength = r * 1.2; // length of thruster triangle
        const thrusterBase = r * 0.35; // base width of thruster triangle
        // Left thruster
        ctx.save();
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ff3333'; // red
        ctx.lineWidth = 2.5;
        ctx.rotate(Math.PI + thrusterAngle); // rear left
        ctx.beginPath();
        ctx.moveTo(0, -thrusterDistance - thrusterLength); // tip
        ctx.lineTo(-thrusterBase, -thrusterDistance - thrusterLength * 0.45); // left base
        ctx.lineTo(thrusterBase, -thrusterDistance - thrusterLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        // Right thruster
        ctx.save();
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ff3333'; // red
        ctx.lineWidth = 2.5;
        ctx.rotate(Math.PI - thrusterAngle); // rear right
        ctx.beginPath();
        ctx.moveTo(0, -thrusterDistance - thrusterLength); // tip
        ctx.lineTo(-thrusterBase, -thrusterDistance - thrusterLength * 0.45); // left base
        ctx.lineTo(thrusterBase, -thrusterDistance - thrusterLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Draw long blue wing triangles pointing downward/outward from the sides
        const wingAngle = Math.PI / 1.5; // steeper angle, about 120 degrees from forward
        const wingDistance = r * 0.2; // how far from center (side)
        const wingLength = r * 2.2; // long wing triangle
        const wingBase = r * 0.32; // base width of wing triangle
        // Left wing
        ctx.save();
        ctx.shadowColor = '#a259ff';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#a259ff'; // purple
        ctx.lineWidth = 2.2;
        ctx.rotate(-wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -wingDistance - wingLength); // tip
        ctx.lineTo(-wingBase, -wingDistance - wingLength * 0.45); // left base
        ctx.lineTo(wingBase, -wingDistance - wingLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        // Right wing
        ctx.save();
        ctx.shadowColor = '#a259ff';
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#a259ff'; // purple
        ctx.lineWidth = 2.2;
        ctx.rotate(wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -wingDistance - wingLength); // tip
        ctx.lineTo(-wingBase, -wingDistance - wingLength * 0.45); // left base
        ctx.lineTo(wingBase, -wingDistance - wingLength * 0.45); // right base
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        
        ctx.restore();
    }
    
    die(particlePool, audioManager, uiManager, game, triggerScreenShake) {
        this.active = false;
        game.state = 'GAME_OVER';
        
        audioManager.playPlayerExplosion();
        particlePool.get(this.x, this.y, 'playerExplosion');
        
        // Dramatic screen shake for player death
        if (triggerScreenShake) {
            triggerScreenShake(25, 15, 50); // Much more intense than asteroid destruction
        }
        
        // Show game over message
        const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
        const restartPrompt = isMobile ? "Tap Screen to Restart" : "Press Enter to Restart";
        const roundedScore = Math.round(game.score);
        const roundedHighScore = Math.round(game.highScore);
        const subtitle = `YOUR SCORE: ${roundedScore}\nHIGH SCORE: ${roundedHighScore}\n\n${restartPrompt}`;
        uiManager.showMessage('GAME OVER', subtitle);
    }
} 