// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG } from '../constants.js';
import { random, GameDimensions } from '../utils.js';

// Enemy type definitions with unique characteristics
export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',        // Red
        health: 10,
        speed: 1.5,
        size: 25,
        shootPattern: 'aimed',
        shootRate: 0.8,
        movePattern: 'chase',
        points: 50
    },
    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',        // Green  
        health: 20,
        speed: 0.8,
        size: 35,
        shootPattern: 'spread',
        shootRate: 0.5,
        movePattern: 'patrol',
        points: 75
    },
    WASP: {
        name: 'Wasp',
        color: '#ffff44',        // Yellow
        health: 8,
        speed: 2.5,
        size: 18,
        shootPattern: 'rapid',
        shootRate: 1.2,
        movePattern: 'swarm',
        points: 35
    },
    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 30,
        speed: 0.5,
        size: 45,
        shootPattern: 'spiral',
        shootRate: 0.3,
        movePattern: 'slow_orbit',
        points: 100
    },
    STALKER: {
        name: 'Stalker',
        color: '#44ffff',        // Cyan
        health: 10,
        speed: 1.8,
        size: 22,
        shootPattern: 'burst',
        shootRate: 0.6,
        movePattern: 'stealth',
        points: 45
    },
    BOMBER: {
        name: 'Bomber',
        color: '#ff8844',        // Orange
        health: 15,
        speed: 1.0,
        size: 30,
        shootPattern: 'explosive',
        shootRate: 0.4,
        movePattern: 'straight',
        points: 65
    }
};

export class Enemy {
    constructor(x, y, type = 'HUNTER') {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.initializeEnemy(x, y);
    }
    
    reset(x, y, type = 'HUNTER') {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.initializeEnemy(x, y);
    }
    
    initializeEnemy(x, y) {
        this.x = x !== undefined ? x : random(0, GameDimensions.width);
        this.y = y !== undefined ? y : random(0, GameDimensions.height);
        
        this.health = this.config.health;
        this.maxHealth = this.config.health;
        this.radius = this.config.size;
        this.baseRadius = this.config.size;
        this.color = this.config.color;
        
        // Initialize movement
        this.vel = {
            x: random(-this.config.speed, this.config.speed) || 0.2,
            y: random(-this.config.speed, this.config.speed) || 0.2
        };
        
        // Simple rotation for visual effect
        this.rotation = random(0, Math.PI * 2);
        this.rotationSpeed = random(-0.02, 0.02);
        
        // Behavior state
        this.active = true;
        this.creationTime = Date.now();
        this.lastShot = 0;
        this.targetPlayer = null;
        
        // Movement pattern state
        this.patrolAngle = random(0, Math.PI * 2);
        this.orbitalAngle = random(0, Math.PI * 2);
        this.swarmOffset = { x: random(-50, 50), y: random(-50, 50) };
        this.stealthTimer = 0;
    }
    

    
    update(playerRef, gameEngine) {
        if (!this.active) return;
        
        this.targetPlayer = playerRef;
        
        // Update movement based on pattern
        this.updateMovement(gameEngine);
        
        // Apply asteroid avoidance
        this.avoidAsteroids(gameEngine);
        
        // Apply enemy bullet dodging
        this.dodgeEnemyBullets(gameEngine);
        
        // Update shooting
        this.updateShooting(gameEngine);
        
        // Update simple rotation
        this.rotation += this.rotationSpeed;
        
        // Update position
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Screen wrapping
        if (this.x < -this.radius) this.x = GameDimensions.width + this.radius;
        if (this.x > GameDimensions.width + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = GameDimensions.height + this.radius;
        if (this.y > GameDimensions.height + this.radius) this.y = -this.radius;
        
        // Death check
        if (this.health <= 0) {
            this.active = false;
        }
    }
    
    updateMovement(gameEngine) {
        const now = Date.now();
        
        switch (this.config.movePattern) {
            case 'chase':
                this.chasePlayer();
                break;
            case 'patrol':
                this.patrolMovement();
                break;
            case 'swarm':
                this.swarmMovement();
                break;
            case 'slow_orbit':
                this.orbitalMovement();
                break;
            case 'stealth':
                this.stealthMovement(now);
                break;
            case 'straight':
                // Maintains initial velocity
                break;
        }
    }
    
    chasePlayer() {
        if (!this.targetPlayer) return;
        
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            const acceleration = 0.02;
            this.vel.x += (dx / distance) * acceleration;
            this.vel.y += (dy / distance) * acceleration;
            
            // Cap speed
            const speed = Math.hypot(this.vel.x, this.vel.y);
            if (speed > this.config.speed) {
                this.vel.x = (this.vel.x / speed) * this.config.speed;
                this.vel.y = (this.vel.y / speed) * this.config.speed;
            }
        }
    }
    
    patrolMovement() {
        this.patrolAngle += 0.02;
        this.vel.x = Math.cos(this.patrolAngle) * this.config.speed;
        this.vel.y = Math.sin(this.patrolAngle) * this.config.speed;
    }
    
    swarmMovement() {
        if (!this.targetPlayer) return;
        
        // Move toward player but with offset and noise
        const targetX = this.targetPlayer.x + this.swarmOffset.x;
        const targetY = this.targetPlayer.y + this.swarmOffset.y;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 50) {
            this.vel.x += (dx / distance) * 0.03;
            this.vel.y += (dy / distance) * 0.03;
        }
        
        // Add noise
        this.vel.x += random(-0.1, 0.1);
        this.vel.y += random(-0.1, 0.1);
        
        // Cap speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > this.config.speed) {
            this.vel.x = (this.vel.x / speed) * this.config.speed;
            this.vel.y = (this.vel.y / speed) * this.config.speed;
        }
    }
    
    orbitalMovement() {
        if (!this.targetPlayer) return;
        
        this.orbitalAngle += 0.01;
        const orbitRadius = 200;
        
        const targetX = this.targetPlayer.x + Math.cos(this.orbitalAngle) * orbitRadius;
        const targetY = this.targetPlayer.y + Math.sin(this.orbitalAngle) * orbitRadius;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        
        this.vel.x = dx * 0.01;
        this.vel.y = dy * 0.01;
    }
    
    stealthMovement(now) {
        this.stealthTimer += 16; // Assume 60fps
        
        if (this.stealthTimer < 2000) {
            // Approach phase - move toward player
            this.chasePlayer();
        } else if (this.stealthTimer < 3000) {
            // Stop phase
            this.vel.x *= 0.95;
            this.vel.y *= 0.95;
        } else if (this.stealthTimer < 5000) {
            // Retreat phase - move away from player
            if (this.targetPlayer) {
                const dx = this.x - this.targetPlayer.x;
                const dy = this.y - this.targetPlayer.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance > 0) {
                    this.vel.x += (dx / distance) * 0.03;
                    this.vel.y += (dy / distance) * 0.03;
                }
            }
        } else {
            // Reset cycle
            this.stealthTimer = 0;
        }
    }
    
    avoidAsteroids(gameEngine) {
        if (!gameEngine.asteroidPool) return;
        
        const avoidanceRadius = this.radius + 60; // Detection radius for asteroids
        const avoidanceForce = 0.08; // Strength of avoidance
        
        let avoidanceX = 0;
        let avoidanceY = 0;
        let asteroidCount = 0;
        
        // Check all active asteroids
        for (const asteroid of gameEngine.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;
            
            const dx = this.x - asteroid.x;
            const dy = this.y - asteroid.y;
            const distance = Math.hypot(dx, dy);
            
            // If asteroid is within avoidance radius
            if (distance < avoidanceRadius && distance > 0) {
                // Add repulsive force (stronger when closer)
                const forceMultiplier = (avoidanceRadius - distance) / avoidanceRadius;
                avoidanceX += (dx / distance) * forceMultiplier;
                avoidanceY += (dy / distance) * forceMultiplier;
                asteroidCount++;
            }
        }
        
        // Apply averaged avoidance force
        if (asteroidCount > 0) {
            avoidanceX = (avoidanceX / asteroidCount) * avoidanceForce;
            avoidanceY = (avoidanceY / asteroidCount) * avoidanceForce;
            
            // Apply avoidance to velocity
            this.vel.x += avoidanceX;
            this.vel.y += avoidanceY;
            
            // Cap speed to prevent runaway velocity
            const speed = Math.hypot(this.vel.x, this.vel.y);
            const maxSpeed = this.config.speed * 1.5; // Allow slightly higher speed when avoiding
            
            if (speed > maxSpeed) {
                this.vel.x = (this.vel.x / speed) * maxSpeed;
                this.vel.y = (this.vel.y / speed) * maxSpeed;
            }
        }
    }
    
    dodgeEnemyBullets(gameEngine) {
        if (!gameEngine.enemyBulletPool) return;
        
        let totalDodgeX = 0;
        let totalDodgeY = 0;
        
        // Check for nearby enemy bullets
        gameEngine.enemyBulletPool.activeObjects.forEach(bullet => {
            if (!bullet.active) return;
            
            const dx = bullet.x - this.x;
            const dy = bullet.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            // Predict bullet path and check if we're in danger
            const dodgeRadius = 40; // How close bullets can get before we dodge
            const lookaheadTime = 30; // How far ahead to predict bullet position
            
            // Predicted bullet position
            const futureX = bullet.x + bullet.vel.x * lookaheadTime;
            const futureY = bullet.y + bullet.vel.y * lookaheadTime;
            
            // Distance to predicted position
            const futureDistance = Math.hypot(futureX - this.x, futureY - this.y);
            
            // If bullet is close or will be close, dodge it
            if (distance < dodgeRadius || futureDistance < dodgeRadius) {
                const dodgeForce = (dodgeRadius - Math.min(distance, futureDistance)) / dodgeRadius;
                
                // Dodge perpendicular to bullet direction
                const bulletAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
                const perpAngle = bulletAngle + Math.PI / 2;
                
                // Choose dodge direction (left or right of bullet path)
                const crossProduct = dx * bullet.vel.y - dy * bullet.vel.x;
                const dodgeDirection = crossProduct > 0 ? 1 : -1;
                
                totalDodgeX += Math.cos(perpAngle) * dodgeForce * dodgeDirection * 1.5;
                totalDodgeY += Math.sin(perpAngle) * dodgeForce * dodgeDirection * 1.5;
            }
        });
        
        // Cap total dodge force
        const maxDodgeForce = 1.5;
        const dodgeSpeed = Math.hypot(totalDodgeX, totalDodgeY);
        if (dodgeSpeed > maxDodgeForce) {
            totalDodgeX = (totalDodgeX / dodgeSpeed) * maxDodgeForce;
            totalDodgeY = (totalDodgeY / dodgeSpeed) * maxDodgeForce;
        }
        
        // Apply dodging
        this.vel.x += totalDodgeX;
        this.vel.y += totalDodgeY;
    }
    
    updateShooting(gameEngine) {
        if (!this.targetPlayer || !gameEngine.enemyBulletPool) return;
        
        const now = Date.now();
        const shootInterval = 1000 / this.config.shootRate; // Convert rate to milliseconds
        
        if (now - this.lastShot > shootInterval) {
            this.shoot(gameEngine);
            this.lastShot = now;
        }
    }
    
    shoot(gameEngine) {
        if (!this.targetPlayer) return;
        
        switch (this.config.shootPattern) {
            case 'aimed':
                this.shootAimed(gameEngine);
                break;
            case 'spread':
                this.shootSpread(gameEngine);
                break;
            case 'rapid':
                this.shootRapid(gameEngine);
                break;
            case 'spiral':
                this.shootSpiral(gameEngine);
                break;
            case 'burst':
                this.shootBurst(gameEngine);
                break;
            case 'explosive':
                this.shootExplosive(gameEngine);
                break;
        }
    }
    
    shootAimed(gameEngine) {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.createEnemyBullet(gameEngine, angle, 3, this.color);
    }
    
    shootSpread(gameEngine) {
        const baseAngle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        const spreadAngles = [-0.3, -0.15, 0, 0.15, 0.3];
        
        spreadAngles.forEach(offset => {
            this.createEnemyBullet(gameEngine, baseAngle + offset, 2.5, this.color);
        });
    }
    
    shootRapid(gameEngine) {
        // Multiple shots in quick succession
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const angle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
                this.createEnemyBullet(gameEngine, angle + random(-0.1, 0.1), 4, this.color);
            }, i * 50);
        }
    }
    
    shootSpiral(gameEngine) {
        const spiralAngle = (Date.now() / 100) % (Math.PI * 2);
        for (let i = 0; i < 6; i++) {
            const angle = spiralAngle + (i * Math.PI * 2 / 6);
            this.createEnemyBullet(gameEngine, angle, 2, this.color);
        }
    }
    
    shootBurst(gameEngine) {
        // Fire 3 shots in a tight burst
        const baseAngle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.createEnemyBullet(gameEngine, baseAngle + random(-0.05, 0.05), 3.5, this.color);
            }, i * 30);
        }
    }
    
    shootExplosive(gameEngine) {
        // Slower but larger projectiles
        const angle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        this.createEnemyBullet(gameEngine, angle, 2, this.color, true); // explosive flag
    }
    
    createEnemyBullet(gameEngine, angle, speed, color, explosive = false) {
        if (!gameEngine.enemyBulletPool) return;
        
        const bullet = gameEngine.enemyBulletPool.get();
        if (bullet) {
            bullet.reset(
                this.x + Math.cos(angle) * this.radius,
                this.y + Math.sin(angle) * this.radius,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                color,
                explosive
            );
        }
    }
    

    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Health-based transparency
        const healthRatio = this.health / this.maxHealth;
        const alpha = 0.7 + (healthRatio * 0.3);
        ctx.globalAlpha = alpha;
        
        // Draw distinct geometric shape based on enemy type
        this.drawEnemyShape(ctx);
        
        ctx.restore();
        
        // Draw health bar (outside of transform)
        this.drawHealthBar(ctx);
    }
    
    drawEnemyShape(ctx) {
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color + '40'; // Semi-transparent fill
        ctx.lineWidth = 2;
        
        switch (this.type) {
            case 'HUNTER':
                this.drawTriangle(ctx);
                break;
            case 'GUARDIAN':
                this.drawSquare(ctx);
                break;
            case 'WASP':
                this.drawDiamond(ctx);
                break;
            case 'TITAN':
                this.drawHexagon(ctx);
                break;
            case 'STALKER':
                this.drawCross(ctx);
                break;
            case 'BOMBER':
                this.drawSpikedCircle(ctx);
                break;
            default:
                this.drawTriangle(ctx);
        }
    }
    
    drawTriangle(ctx) {
        // Aggressive arrow pointing forward
        const size = this.radius * 0.8;
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, -size * 0.8);
        ctx.lineTo(-size * 0.6, size * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    drawSquare(ctx) {
        // Defensive square
        const size = this.radius * 0.7;
        ctx.beginPath();
        ctx.rect(-size, -size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
        
        // Inner cross for defense look
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, 0);
        ctx.lineTo(size * 0.4, 0);
        ctx.moveTo(0, -size * 0.4);
        ctx.lineTo(0, size * 0.4);
        ctx.stroke();
    }
    
    drawDiamond(ctx) {
        // Fast, agile diamond
        const size = this.radius * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    drawHexagon(ctx) {
        // Heavy, imposing hexagon
        const size = this.radius * 0.8;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * size;
            const y = Math.sin(angle) * size;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    
    drawCross(ctx) {
        // Stealth cross shape
        const size = this.radius * 0.7;
        const thickness = size * 0.3;
        
        ctx.beginPath();
        // Vertical bar
        ctx.rect(-thickness/2, -size, thickness, size * 2);
        // Horizontal bar
        ctx.rect(-size, -thickness/2, size * 2, thickness);
        ctx.fill();
        ctx.stroke();
    }
    
    drawSpikedCircle(ctx) {
        // Explosive circle with spikes
        const innerSize = this.radius * 0.5;
        const outerSize = this.radius * 0.8;
        
        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, innerSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Spikes
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const innerX = Math.cos(angle) * innerSize;
            const innerY = Math.sin(angle) * innerSize;
            const outerX = Math.cos(angle) * outerSize;
            const outerY = Math.sin(angle) * outerSize;
            
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
        }
        ctx.stroke();
    }
    
    drawHealthBar(ctx) {
        if (this.health >= this.maxHealth) return;
        
        ctx.save();
        
        const barWidth = this.radius * 1.8;
        const barHeight = 3;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 18;

        // Health calculation
        const healthPercentage = this.health / this.maxHealth;
        
        // Create vertical gradient for health bar based on health percentage
        let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        let backgroundColor;
        
        if (healthPercentage > 0.5) {
            // Green gradient: light green to dark green
            healthGradient.addColorStop(0, '#66ff66');
            healthGradient.addColorStop(1, '#00cc00');
            backgroundColor = 'rgba(0, 102, 0, 0.6)';
        } else if (healthPercentage > 0.25) {
            // Yellow gradient: light yellow to dark yellow
            healthGradient.addColorStop(0, '#ffff99');
            healthGradient.addColorStop(1, '#cccc00');
            backgroundColor = 'rgba(102, 102, 0, 0.6)';
        } else {
            // Red gradient: light red to dark red
            healthGradient.addColorStop(0, '#ff6666');
            healthGradient.addColorStop(1, '#cc0000');
            backgroundColor = 'rgba(102, 0, 0, 0.6)';
        }
        
        const cornerRadius = 1;
        
        // Colored background matching health state with full width
        ctx.fillStyle = backgroundColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.fill();

        // Health bar with gradient and rounded corners
        const filledWidth = barWidth * healthPercentage;
        if (filledWidth > 0) {
            ctx.fillStyle = healthGradient;
            ctx.beginPath();
            ctx.roundRect(barX, barY, filledWidth, barHeight, cornerRadius);
            ctx.fill();
        }

        // Health number centered above the health bar
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Bright gold for health number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const healthNumber = `${Math.round(this.health)}/${this.maxHealth}`;
        const numberX = barX + barWidth / 2;
        const numberY = barY - 6;
        
        // Draw health number outline first, then fill
        ctx.strokeText(healthNumber, numberX, numberY);
        ctx.fillText(healthNumber, numberX, numberY);

        ctx.restore();
    }
    
    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }
    
    getDestructionReward() {
        return {
            points: this.config.points,
            color: this.color,
            position: { x: this.x, y: this.y },
            shape: this.type,
            radius: this.radius,
            type: this.type
        };
    }
} 