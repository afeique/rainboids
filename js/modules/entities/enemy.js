// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG } from '../constants.js';
import { random, GameDimensions } from '../utils.js';

// Enemy type definitions with unique characteristics
export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',        // Red
        health: 10,
        speed: 1.6,              // Reduced from 2.2 - more manageable chase speed
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
        speed: 1.0,              // Reduced from 1.4 - slower patrol movement
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
        speed: 1.9,              // Further reduced from 2.4 - still quick but not crazy
        size: 22,                // Increased from 18
        shootPattern: 'rapid',
        shootRate: 1.0,          // Reduced from 1.2 - still rapid but less overwhelming
        movePattern: 'swarm',
        points: 35
    },
    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 30,
        speed: 0.7,              // Reduced from 0.9 - slow and steady
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
        speed: 1.8,              // Significantly reduced from 2.6 - less frantic
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
        speed: 1.2,              // Reduced from 1.6 - steady bomber approach
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
        
        // Enhanced rotation for visual effect and agility (toned down)
        this.rotation = random(0, Math.PI * 2);
        // Faster rotation for WASP, moderate for others (reduced for calmer feel)
        if (this.type === 'WASP') {
            this.rotationSpeed = random(-0.05, 0.05); // Reduced from 0.08
        } else {
            this.rotationSpeed = random(-0.025, 0.025); // Reduced from 0.04
        }
        
        // Behavior state
        this.active = true;
        this.creationTime = Date.now();
        this.lastShot = 0;
        this.targetPlayer = null;
        
        // Movement pattern state
        this.patrolAngle = random(0, Math.PI * 2);
        this.patrolDirection = Math.random() < 0.5 ? 1 : -1; // Random initial patrol direction
        this.lastDirectionChange = Date.now();
        this.orbitalAngle = random(0, Math.PI * 2);
        this.swarmOffset = { x: random(-50, 50), y: random(-50, 50) };
        this.stealthTimer = 0;
        
        // Enhanced agility properties
        this.lastEvasiveManeuver = 0;
        this.evasiveDirection = { x: 0, y: 0 };
        this.evasiveTimer = 0;
        this.lastPlayerPosition = { x: 0, y: 0 };
    }
    

    
    update(playerRef, gameEngine) {
        if (!this.active) return;
        
        this.targetPlayer = playerRef;
        
        // Update movement based on pattern
        this.updateMovement(gameEngine);
        
        // Enhanced evasive maneuvers
        this.updateEvasiveManeuvers(gameEngine);
        
        // Apply asteroid avoidance
        this.avoidAsteroids(gameEngine);
        
        // Apply enemy bullet dodging
        this.dodgeEnemyBullets(gameEngine);
        
        // Dodge player bullets
        this.dodgePlayerBullets(gameEngine);
        
        // Update shooting
        this.updateShooting(gameEngine);
        
        // Update rotation with agility-based speed
        this.rotation += this.rotationSpeed;
        
        // Add random micro-movements for agility
        this.addMicroMovements();
        
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
                // Enhanced straight movement with subtle course corrections
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    // Very subtle course correction toward player
                    if (distance > 0) {
                        const correctionStrength = 0.01;
                        this.vel.x += (dx / distance) * correctionStrength;
                        this.vel.y += (dy / distance) * correctionStrength;
                    }
                    
                    // Add slight wobble to make it harder to predict
                    const wobble = Math.sin(Date.now() * 0.01 + this.x * 0.005) * 0.1;
                    this.vel.x += wobble;
                    this.vel.y += Math.cos(Date.now() * 0.01 + this.y * 0.005) * 0.1;
                }
                break;
        }
    }
    
    chasePlayer() {
        if (!this.targetPlayer) return;
        
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Enhanced acceleration with agility (toned down)
            const acceleration = 0.025; // Reduced from 0.035 - more reasonable chase
            let targetVelX = (dx / distance) * acceleration;
            let targetVelY = (dy / distance) * acceleration;
            
            // Add weaving movement for agility (reduced)
            const weaveAngle = Math.atan2(dy, dx) + Math.PI / 2;
            const weaveStrength = Math.sin(Date.now() * 0.005 + this.x * 0.01) * 0.3; // Reduced strength and frequency
            targetVelX += Math.cos(weaveAngle) * weaveStrength * acceleration;
            targetVelY += Math.sin(weaveAngle) * weaveStrength * acceleration;
            
            this.vel.x += targetVelX;
            this.vel.y += targetVelY;
            
            // Cap speed with higher maximum for agility (reduced)
            const speed = Math.hypot(this.vel.x, this.vel.y);
            const maxSpeed = this.config.speed * 1.15; // Reduced from 1.3 - less crazy speed
            if (speed > maxSpeed) {
                this.vel.x = (this.vel.x / speed) * maxSpeed;
                this.vel.y = (this.vel.y / speed) * maxSpeed;
            }
        }
    }
    
    patrolMovement() {
        if (!this.targetPlayer) return;
        
        // Calculate distance to player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distanceToPlayer = Math.hypot(dx, dy);
        
        // Calculate distance to screen center
        const centerX = GameDimensions.width / 2;
        const centerY = GameDimensions.height / 2;
        const dxCenter = centerX - this.x;
        const dyCenter = centerY - this.y;
        const distanceToCenter = Math.hypot(dxCenter, dyCenter);
        
        // Base patrol pattern (circular movement) with direction changes
        const now = Date.now();
        
        // Occasionally change patrol direction for unpredictability
        if (now - this.lastDirectionChange > 3000 && Math.random() < 0.02) {
            this.patrolDirection *= -1;
            this.lastDirectionChange = now;
        }
        
        this.patrolAngle += 0.02 * this.patrolDirection;
        let baseVelX = Math.cos(this.patrolAngle) * this.config.speed;
        let baseVelY = Math.sin(this.patrolAngle) * this.config.speed;
        
        // Add bias toward player if too far away (> 300 pixels)
        let playerBias = 0;
        if (distanceToPlayer > 300) {
            playerBias = Math.min(0.4, (distanceToPlayer - 300) / 200);
            baseVelX += (dx / distanceToPlayer) * playerBias * this.config.speed;
            baseVelY += (dy / distanceToPlayer) * playerBias * this.config.speed;
        }
        
        // Add bias toward center if too far from center (> 250 pixels)
        if (distanceToCenter > 250) {
            const centerBias = Math.min(0.3, (distanceToCenter - 250) / 150);
            baseVelX += (dxCenter / distanceToCenter) * centerBias * this.config.speed;
            baseVelY += (dyCenter / distanceToCenter) * centerBias * this.config.speed;
        }
        
        // Add some defensive repositioning - move perpendicular to player occasionally
        if (distanceToPlayer < 150 && Math.random() < 0.1) {
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
            baseVelX += Math.cos(perpAngle) * this.config.speed * 0.5;
            baseVelY += Math.sin(perpAngle) * this.config.speed * 0.5;
        }
        
        // Set velocity
        this.vel.x = baseVelX;
        this.vel.y = baseVelY;
        
        // Cap speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > this.config.speed * 1.2) { // Allow slightly higher speed for repositioning
            this.vel.x = (this.vel.x / speed) * this.config.speed * 1.2;
            this.vel.y = (this.vel.y / speed) * this.config.speed * 1.2;
        }
    }
    
    swarmMovement() {
        if (!this.targetPlayer) return;
        
        // Enhanced swarm movement with more agility
        const targetX = this.targetPlayer.x + this.swarmOffset.x;
        const targetY = this.targetPlayer.y + this.swarmOffset.y;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 50) {
            this.vel.x += (dx / distance) * 0.035; // Reduced from 0.05 - less aggressive acceleration
            this.vel.y += (dy / distance) * 0.035;
        }
        
        // Enhanced erratic movement for WASP agility (further toned down)
        const erraticStrength = this.type === 'WASP' ? 0.12 : 0.08;
        this.vel.x += random(-erraticStrength, erraticStrength);
        this.vel.y += random(-erraticStrength, erraticStrength);
        
        // Add sine wave movement for unpredictability (further reduced)
        const time = Date.now() * 0.005; // Even slower oscillation
        this.vel.x += Math.sin(time + this.x * 0.02) * 0.08; // Further reduced
        this.vel.y += Math.cos(time + this.y * 0.02) * 0.08;
        
        // Cap speed with higher maximum for swarm agility (further reduced)
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 1.1; // Further reduced from 1.2
        if (speed > maxSpeed) {
            this.vel.x = (this.vel.x / speed) * maxSpeed;
            this.vel.y = (this.vel.y / speed) * maxSpeed;
        }
    }
    
    orbitalMovement() {
        if (!this.targetPlayer) return;
        
        // Enhanced orbital movement with variable radius and speed
        this.orbitalAngle += 0.015; // Slightly faster orbit
        const baseOrbitRadius = 180;
        const radiusVariation = Math.sin(Date.now() * 0.003) * 50; // Varying orbit radius
        const orbitRadius = baseOrbitRadius + radiusVariation;
        
        const targetX = this.targetPlayer.x + Math.cos(this.orbitalAngle) * orbitRadius;
        const targetY = this.targetPlayer.y + Math.sin(this.orbitalAngle) * orbitRadius;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        
        // Enhanced movement with acceleration
        const acceleration = 0.018; // Increased from 0.01
        this.vel.x = dx * acceleration;
        this.vel.y = dy * acceleration;
        
        // Add some orbital wobble for unpredictability
        const wobbleAngle = this.orbitalAngle * 3 + Date.now() * 0.008;
        this.vel.x += Math.cos(wobbleAngle) * 0.3;
        this.vel.y += Math.sin(wobbleAngle) * 0.3;
    }
    
    stealthMovement(now) {
        this.stealthTimer += 16; // Assume 60fps
        
        if (this.stealthTimer < 1500) {
            // Enhanced approach phase - aggressive pursuit with weaving
            this.chasePlayer();
            
            // Add unpredictable darting movements
            if (Math.random() < 0.1) {
                const dartAngle = random(0, Math.PI * 2);
                this.vel.x += Math.cos(dartAngle) * 1.5;
                this.vel.y += Math.sin(dartAngle) * 1.5;
            }
        } else if (this.stealthTimer < 2000) {
            // Brief stop phase with micro-adjustments
            this.vel.x *= 0.9;
            this.vel.y *= 0.9;
            
            // Small positioning adjustments
            this.vel.x += random(-0.2, 0.2);
            this.vel.y += random(-0.2, 0.2);
        } else if (this.stealthTimer < 4000) {
            // Enhanced retreat phase - faster escape with evasion
            if (this.targetPlayer) {
                const dx = this.x - this.targetPlayer.x;
                const dy = this.y - this.targetPlayer.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance > 0) {
                    this.vel.x += (dx / distance) * 0.06; // Faster retreat
                    this.vel.y += (dy / distance) * 0.06;
                    
                    // Add evasive zigzag during retreat
                    const zigzagAngle = Math.atan2(dy, dx) + Math.PI / 2;
                    const zigzag = Math.sin(Date.now() * 0.02) * 0.4;
                    this.vel.x += Math.cos(zigzagAngle) * zigzag;
                    this.vel.y += Math.sin(zigzagAngle) * zigzag;
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
    
    updateEvasiveManeuvers(gameEngine) {
        if (!this.targetPlayer) return;
        
        const now = Date.now();
        const dx = this.targetPlayer.x - this.lastPlayerPosition.x;
        const dy = this.targetPlayer.y - this.lastPlayerPosition.y;
        const playerSpeed = Math.hypot(dx, dy);
        
        // If player is moving fast or we haven't evaded recently, perform evasive maneuver
        if (playerSpeed > 2 && now - this.lastEvasiveManeuver > 1500) {
            this.lastEvasiveManeuver = now;
            this.evasiveTimer = 30; // 30 frames of evasion
            
            // Choose random evasive direction
            const evasiveAngle = random(0, Math.PI * 2);
            this.evasiveDirection.x = Math.cos(evasiveAngle);
            this.evasiveDirection.y = Math.sin(evasiveAngle);
        }
        
        // Apply evasive movement if timer is active
        if (this.evasiveTimer > 0) {
            const evasiveStrength = 0.8 * (this.evasiveTimer / 30); // Fade out over time
            this.vel.x += this.evasiveDirection.x * evasiveStrength;
            this.vel.y += this.evasiveDirection.y * evasiveStrength;
            this.evasiveTimer--;
        }
        
        // Update last player position
        this.lastPlayerPosition.x = this.targetPlayer.x;
        this.lastPlayerPosition.y = this.targetPlayer.y;
    }
    
    dodgePlayerBullets(gameEngine) {
        if (!gameEngine.bulletPool) return;
        
        let totalDodgeX = 0;
        let totalDodgeY = 0;
        
        // Check for nearby player bullets
        gameEngine.bulletPool.activeObjects.forEach(bullet => {
            if (!bullet.active) return;
            
            const dx = bullet.x - this.x;
            const dy = bullet.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            // Enhanced dodge radius based on enemy type (reduced for WASPs)
            const baseDodgeRadius = this.type === 'WASP' ? 50 : 45;
            const dodgeRadius = baseDodgeRadius * (this.config.speed / 2); // Faster enemies detect farther
            const lookaheadTime = 25; // Predict bullet path
            
            // Predicted bullet position
            const futureX = bullet.x + bullet.vel.x * lookaheadTime;
            const futureY = bullet.y + bullet.vel.y * lookaheadTime;
            
            // Distance to predicted position
            const futureDistance = Math.hypot(futureX - this.x, futureY - this.y);
            
            // If bullet is threatening, dodge it
            if (distance < dodgeRadius || futureDistance < dodgeRadius) {
                const dodgeForce = (dodgeRadius - Math.min(distance, futureDistance)) / dodgeRadius;
                
                // Dodge perpendicular to bullet direction with some randomness
                const bulletAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
                const perpAngle = bulletAngle + Math.PI / 2 + random(-0.3, 0.3);
                
                            // Choose smarter dodge direction
            const crossProduct = dx * bullet.vel.y - dy * bullet.vel.x;
            const dodgeDirection = crossProduct > 0 ? 1 : -1;
            
            const dodgeStrength = dodgeForce * dodgeDirection * 1.8; // Reduced dodge strength
                totalDodgeX += Math.cos(perpAngle) * dodgeStrength;
                totalDodgeY += Math.sin(perpAngle) * dodgeStrength;
            }
        });
        
        // Enhanced dodge force limits based on enemy type (further reduced)
        const maxDodgeForce = this.type === 'WASP' ? 1.6 : 1.4; // Much more reasonable dodge force
        const dodgeSpeed = Math.hypot(totalDodgeX, totalDodgeY);
        if (dodgeSpeed > maxDodgeForce) {
            totalDodgeX = (totalDodgeX / dodgeSpeed) * maxDodgeForce;
            totalDodgeY = (totalDodgeY / dodgeSpeed) * maxDodgeForce;
        }
        
        // Apply dodging with momentum
        this.vel.x += totalDodgeX;
        this.vel.y += totalDodgeY;
    }
    
    addMicroMovements() {
        // Small random movements to make enemies harder to hit (toned down)
        const microStrength = this.type === 'WASP' ? 0.08 : 0.04; // Halved the strength
        
        // Add random micro-adjustments every few frames (less frequent)
        if (Math.random() < 0.15) { // Reduced from 0.3 to 0.15
            this.vel.x += random(-microStrength, microStrength);
            this.vel.y += random(-microStrength, microStrength);
        }
        
        // Add subtle oscillation based on time and position (much more subtle)
        const time = Date.now() * 0.003; // Slower oscillation
        const oscillation = 0.025; // Halved the oscillation strength
        this.vel.x += Math.sin(time + this.x * 0.01) * oscillation;
        this.vel.y += Math.cos(time + this.y * 0.01) * oscillation;
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