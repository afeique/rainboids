// Player ship entity
import { GAME_CONFIG } from '../constants.js';
import { random, wrap } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Player {
    constructor() {
        // One-time setup properties
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.lastX = 0;
        this.lastY = 0;
        this.rotation = 0;
        this.radius = 12;
        this.health = 50;
        this.maxHealth = 50;
        this.shieldTanks = 1; // Start with 1 shield tank
        this.shield = 0; // 0% damage reduction (start with no armor)
        this.invulnerable = false;
        this.lastHitTime = 0;
        this.lastBlinkTime = 0;
        
        // Shooting intensity tracking
        this.shootingIntensity = 0;
        this.maxShootingIntensity = 1; // Now represents 0-1 scale instead of 0-10
        this.shootingDecayRate = 0.98; // How fast intensity decays when not shooting
        this.lastShotTime = 0;
        this.continuousShootingStartTime = 0; // When continuous shooting started
        this.maxIntensityTime = 3000; // 3 seconds to reach maximum intensity
        
        this.initializePlayer();
    }
    
    // Helper method to initialize/reset player properties
    initializePlayer() {
        this.x = this.width / 2;
        this.y = this.height / 2;
        this.lastX = this.x;
        this.lastY = this.y;
        this.vel = { x: 0, y: 0 };
        this.angle = -Math.PI / 2;
        this.isThrusting = false;
        this.active = true;
        this.canShoot = true;
        this.thrustersDisabled = false;
        this.invincible = false;
        this.invincibilityTimer = 0;
        
        // Reset shooting intensity
        this.shootingIntensity = 0;
        this.lastShotTime = 0;
        this.continuousShootingStartTime = 0;
        
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        this.radius = (GAME_CONFIG.SHIP_SIZE * scale) / 2;
        // Player mass (smaller than most asteroids)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.5;
    }
    
    reset() {
        this.initializePlayer();
    }

    disableThrusters(duration) {
        this.thrustersDisabled = true;
        setTimeout(() => {
            this.thrustersDisabled = false;
        }, duration);
    }
    
    makeInvincible(duration) {
        this.invincible = true;
        this.invincibilityTimer = duration;
    }
    
    update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged) {
        if (!this.active) return;
        
        // Update invincibility timer
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= 16; // Assuming 60fps, ~16ms per frame
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.invincibilityTimer = 0;
            }
        }

        // Update shooting intensity - decay over time
        const currentTime = Date.now();
        const timeSinceLastShot = currentTime - this.lastShotTime;
        
        // Reset continuous shooting timer if player hasn't shot for a while (500ms)
        if (timeSinceLastShot > 500) {
            this.continuousShootingStartTime = 0;
            this.shootingIntensity = 0;
        }

        // Aiming
        const dx = input.aimX - this.x;
        const dy = input.aimY - this.y;
        this.angle = Math.atan2(dy, dx);

        this.isMoving = input.up || input.down || input.left || input.right;

        if (this.isMoving && !this.thrustersDisabled) {
            let moveX = 0;
            let moveY = 0;
            if (input.left) moveX -= 1;
            if (input.right) moveX += 1;
            if (input.up) moveY -= 1;
            if (input.down) moveY += 1;

            const moveAngle = Math.atan2(moveY, moveX);
            this.vel.x += Math.cos(moveAngle) * GAME_CONFIG.SHIP_THRUST;
            this.vel.y += Math.sin(moveAngle) * GAME_CONFIG.SHIP_THRUST;

            const rear = moveAngle + Math.PI;
            const dist = this.radius * 1.2;
            const spread = this.radius * 0.8;

            for (let i = 0; i < 4; i++) {
                const p_angle = rear + random(-0.3, 0.3);
                const p_dist = random(0, spread);
                const p_x = this.x + Math.cos(p_angle) * dist + Math.cos(p_angle + Math.PI / 2) * p_dist;
                const p_y = this.y + Math.sin(p_angle) * dist + Math.sin(p_angle + Math.PI / 2) * p_dist;
                particlePool.get(p_x, p_y, 'thrust', rear);
            }
            audioManager.playThruster();
        }

        // Automatic tractor beam visual
        if (tractorEngaged) {
            // Spawn multiple neon-blue particles in a radius around the ship
            for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 60 + Math.random() * 40;
                const px = this.x + Math.cos(angle) * dist;
                const py = this.y + Math.sin(angle) * dist;
                particlePool.get(px, py, 'tractorBeamParticle', this.x, this.y);
            }
        }

        // Natural friction
        this.vel.x *= GAME_CONFIG.SHIP_FRICTION;
        this.vel.y *= GAME_CONFIG.SHIP_FRICTION;

        // Limit velocity
        const mag = Math.hypot(this.vel.x, this.vel.y);
        if (mag > GAME_CONFIG.MAX_V) {
            this.vel.x = (this.vel.x / mag) * GAME_CONFIG.MAX_V;
            this.vel.y = (this.vel.y / mag) * GAME_CONFIG.MAX_V;
        }

        this.x += this.vel.x;
        this.y += this.vel.y;
        wrap(this, this.width, this.height);

        // Handle continuous shooting with intensity tracking
        if (input.fire && this.canShoot) {
            // Start continuous shooting timer if not already started
            if (this.continuousShootingStartTime === 0) {
                this.continuousShootingStartTime = currentTime;
            }
            
            // Calculate time-based shooting intensity (0-1 over 5 seconds)
            const continuousShootingDuration = currentTime - this.continuousShootingStartTime;
            this.shootingIntensity = Math.min(1, continuousShootingDuration / this.maxIntensityTime);
            this.lastShotTime = currentTime;
            
            // Pass shooting intensity (0-1) to bullet
            bulletPool.get(this.x, this.y, this.angle, this.shootingIntensity);
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
        
        // Flash effect during invincibility
        if (this.invincible) {
            const flash = Math.sin(Date.now() * 0.02) > 0;
            ctx.globalAlpha = flash ? 0.4 : 0.8;
        }
        
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
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