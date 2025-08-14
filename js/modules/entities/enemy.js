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
    constructor(x, y, type = 'HUNTER', level = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.initializeEnemy(x, y);
    }
    
    reset(x, y, type = 'HUNTER', level = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.initializeEnemy(x, y);
    }
    
    initializeEnemy(x, y) {
        this.x = x !== undefined ? x : random(0, GameDimensions.width);
        this.y = y !== undefined ? y : random(0, GameDimensions.height);
        
        // Scale health based on level (35% increase per level)
        const levelMultiplier = 1 + (this.level - 1) * 0.35;
        this.maxHealth = Math.round(this.config.health * levelMultiplier);
        this.health = this.maxHealth;
        
        // Scale size slightly based on level (10% increase per level, max 2x)
        const sizeMultiplier = Math.min(2.0, 1 + (this.level - 1) * 0.1);
        this.radius = this.config.size * sizeMultiplier;
        this.baseRadius = this.config.size * sizeMultiplier;
        this.color = this.config.color;
        
        // Initialize movement
        this.vel = {
            x: random(-this.config.speed, this.config.speed) || 0.2,
            y: random(-this.config.speed, this.config.speed) || 0.2
        };
        
        // Enhanced rotation for visual effect and agility (toned down)
        this.rotation = random(0, Math.PI * 2);
        // Much slower rotation for easier targeting
        if (this.type === 'WASP') {
            this.rotationSpeed = random(-0.02, 0.02); // Much reduced
        } else {
            this.rotationSpeed = random(-0.01, 0.01); // Much reduced
        }
        
        // Behavior state
        this.active = true;
        this.creationTime = Date.now();
        this.lastShot = 0;
        this.targetPlayer = null;
        
        // Face direction for orientation (initialized once in constructor)
        if (this.turnSpeed === undefined) {
            this.turnSpeed = 0.08; // How fast enemy can turn
        }
        
        // Reset face direction
        this.faceAngle = Math.random() * Math.PI * 2; // Random starting direction
        this.targetFaceAngle = this.faceAngle;
        
        // Circulating shield indicator with music sync
        this.shield = {
            rotation: 0,
            rotationSpeed: 0.04 + Math.random() * 0.02, // Rotation speed (0.04 - 0.06)
            radius: this.radius + 18, // Shield distance from enemy center
            basePulsePhase: Math.random() * Math.PI * 2, // Random starting pulse phase
            segmentCount: 12 + Math.floor(Math.random() * 8), // 12-19 shield segments
            musicSyncIntensity: 0.7 + Math.random() * 0.6, // How strongly it responds to music (0.7-1.3)
            waveOffset: Math.random() * Math.PI * 2 // Phase offset for wave pattern
        }
        
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
        
        // Circulating shield indicator with music sync
        this.shield = {
            rotation: 0,
            rotationSpeed: 0.04 + Math.random() * 0.02, // Rotation speed (0.04 - 0.06)
            radius: this.radius + 18, // Shield distance from enemy center
            basePulsePhase: Math.random() * Math.PI * 2, // Random starting pulse phase
            segmentCount: 12 + Math.floor(Math.random() * 8), // 12-19 shield segments
            musicSyncIntensity: 0.7 + Math.random() * 0.6, // How strongly it responds to music (0.7-1.3)
            waveOffset: Math.random() * Math.PI * 2 // Phase offset for wave pattern
        }
    }
    
    // Get level-scaled damage for enemy attacks
    getLevelScaledDamage(baseDamage) {
        const levelMultiplier = 1 + (this.level - 1) * 0.25; // 25% damage increase per level
        return Math.round(baseDamage * levelMultiplier);
    }

    
    update(playerRef, gameEngine) {
        if (!this.active) return;
        
        this.targetPlayer = playerRef;
        
        // Update face direction to look at player
        this.updateFaceDirection();
        
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
        
        // Update circulating shield with music sync
        this.shield.rotation += this.shield.rotationSpeed;
        
        // Calculate music-synchronized pulse using different tempo assumptions
        const musicPlayer = gameEngine.uiManager?.musicPlayer;
        let musicTime = 0;
        let musicIntensity = 0.5; // Default fallback
        
        if (musicPlayer && musicPlayer.isPlaying && musicPlayer.currentAudio) {
            musicTime = musicPlayer.getCurrentTime();
            // Assume average BPM of ~120-140 for electronic music, create beat frequency
            const assumedBPM = 130; // beats per minute
            const beatFrequency = assumedBPM / 60; // beats per second
            const beatPhase = (musicTime * beatFrequency * Math.PI * 2) + this.shield.basePulsePhase;
            
            // Create layered sine waves for complex pulsing
            const primaryBeat = Math.sin(beatPhase);
            const harmonicBeat = Math.sin(beatPhase * 2) * 0.3; // Higher frequency harmonic
            const subBeat = Math.sin(beatPhase * 0.5) * 0.2; // Lower frequency sub-beat
            
            musicIntensity = 0.5 + (primaryBeat + harmonicBeat + subBeat) * 0.5 * this.shield.musicSyncIntensity;
            musicIntensity = Math.max(0.1, Math.min(1.0, musicIntensity)); // Clamp to reasonable range
        } else {
            // Fallback to time-based pulsing when no music
            const time = Date.now() * 0.001;
            const fallbackPhase = (time * 2.2 * Math.PI) + this.shield.basePulsePhase; // ~132 BPM equivalent
            musicIntensity = 0.5 + Math.sin(fallbackPhase) * 0.3;
        }
        
        // Store music intensity for use in drawing
        this.shield.currentIntensity = musicIntensity;
        
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
    
    updateFaceDirection() {
        if (!this.targetPlayer) return;
        
        // Calculate angle to player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        this.targetFaceAngle = Math.atan2(dy, dx);
        
        // Smoothly rotate to face target
        let angleDiff = this.targetFaceAngle - this.faceAngle;
        
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Apply turn speed
        this.faceAngle += angleDiff * this.turnSpeed;
        
        // Normalize face angle
        while (this.faceAngle > Math.PI) this.faceAngle -= Math.PI * 2;
        while (this.faceAngle < -Math.PI) this.faceAngle += Math.PI * 2;
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
            // Minimal acceleration for predictable movement
            const acceleration = 0.012; // Much reduced for easier targeting
            let targetVelX = (dx / distance) * acceleration;
            let targetVelY = (dy / distance) * acceleration;
            
            // Minimal weaving for easier targeting
            const weaveAngle = Math.atan2(dy, dx) + Math.PI / 2;
            const weaveStrength = Math.sin(Date.now() * 0.002 + this.x * 0.01) * 0.1; // Much reduced
            targetVelX += Math.cos(weaveAngle) * weaveStrength * acceleration;
            targetVelY += Math.sin(weaveAngle) * weaveStrength * acceleration;
            
            this.vel.x += targetVelX;
            this.vel.y += targetVelY;
            
            // Lower speed cap for predictable movement
            const speed = Math.hypot(this.vel.x, this.vel.y);
            const maxSpeed = this.config.speed * 1.08; // Much reduced
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
        
        // Minimal erratic movement for easier targeting
        const erraticStrength = this.type === 'WASP' ? 0.05 : 0.03; // Much reduced
        this.vel.x += random(-erraticStrength, erraticStrength);
        this.vel.y += random(-erraticStrength, erraticStrength);
        
        // Subtle sine wave movement
        const time = Date.now() * 0.002; // Much slower oscillation
        this.vel.x += Math.sin(time + this.x * 0.02) * 0.03; // Much reduced
        this.vel.y += Math.cos(time + this.y * 0.02) * 0.03;
        
        // Lower speed cap for predictable movement
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 1.02; // Much reduced
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
                    const baseDodgeRadius = this.type === 'WASP' ? 30 : 25; // Reduced dodge detection
        const dodgeRadius = baseDodgeRadius * (this.config.speed / 3); // Much smaller dodge range
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
            
            const dodgeStrength = dodgeForce * dodgeDirection * 0.8; // Much weaker dodge response
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
        const microStrength = this.type === 'WASP' ? 0.02 : 0.01; // Minimal micro-movements
        
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
        
        this.createEnemyBullet(gameEngine, angle, 3, this.color, false, 'aimed');
    }
    
    shootSpread(gameEngine) {
        const baseAngle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        
        // Single bullet with spreading movement pattern
        this.createEnemyBullet(gameEngine, baseAngle, 2.5, this.color, false, 'spread');
    }
    
    shootRapid(gameEngine) {
        const angle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        
        // Single bullet with rapid/erratic movement pattern
        this.createEnemyBullet(gameEngine, angle, 4, this.color, false, 'rapid');
    }
    
    shootSpiral(gameEngine) {
        if (!this.spiralAngle) this.spiralAngle = 0;
        this.spiralAngle += 0.3;
        
        // Single bullet with spiral movement pattern
        this.createEnemyBullet(gameEngine, this.spiralAngle, 2, this.color, false, 'spiral');
    }
    
    shootBurst(gameEngine) {
        const baseAngle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        
        // Single bullet with burst/explosive movement pattern
        this.createEnemyBullet(gameEngine, baseAngle, 2, this.color, false, 'burst');
    }
    
    shootExplosive(gameEngine) {
        const angle = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        
        // Single explosive bullet with unique movement pattern
        this.createEnemyBullet(gameEngine, angle, 2.5, this.color, true, 'explosive');
    }
    
    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed') {
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
            
            // Set level-scaled damage (scaled back down)
            const baseDamage = explosive ? 3 : 2;
            bullet.damage = this.getLevelScaledDamage(baseDamage);
            
            // Set unique movement pattern for this bullet
            bullet.movementPattern = movementPattern;
            bullet.patternTimer = 0;
            bullet.patternPhase = Math.random() * Math.PI * 2; // Random starting phase
            
            // Enemy shooting sounds removed to reduce audio confusion
        }
    }
    

    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.faceAngle); // Rotate to face direction
        
        // Health-based transparency
        const healthRatio = this.health / this.maxHealth;
        const alpha = 0.7 + (healthRatio * 0.3);
        ctx.globalAlpha = alpha;
        
        // Draw distinct geometric shape based on enemy type
        this.drawEnemyShape(ctx);
        
        ctx.restore();
        
        // Draw circulating shield indicator (outside of transform)
        this.drawCirculatingShield(ctx);
        
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
        // Aggressive arrow pointing forward (toward player)
        const size = this.radius * 0.8;
        ctx.beginPath();
        ctx.moveTo(size, 0); // Point (tip of arrow)
        ctx.lineTo(-size * 0.6, -size * 0.8); // Left back corner
        ctx.lineTo(-size * 0.6, size * 0.8); // Right back corner
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Add small directional indicator at tip
        ctx.beginPath();
        ctx.arc(size * 0.8, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    
    drawSquare(ctx) {
        // Defensive square with directional indicator
        const size = this.radius * 0.7;
        ctx.beginPath();
        ctx.rect(-size, -size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
        
        // Directional indicator - arrow pointing forward
        ctx.beginPath();
        ctx.moveTo(size * 0.6, 0);
        ctx.lineTo(size * 0.2, -size * 0.3);
        ctx.lineTo(size * 0.2, size * 0.3);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    
    drawDiamond(ctx) {
        // Fast, agile diamond with directional tip
        const size = this.radius * 0.6;
        ctx.beginPath();
        ctx.moveTo(size * 1.2, 0); // Extended tip pointing forward
        ctx.lineTo(0, -size);
        ctx.lineTo(-size * 0.6, 0); // Flattened back
        ctx.lineTo(0, size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Small highlight on the tip
        ctx.beginPath();
        ctx.arc(size, 0, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    
    drawHexagon(ctx) {
        // Heavy, imposing hexagon with directional point
        const size = this.radius * 0.8;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            // Stretch the first point forward to create directionality
            const stretch = i === 0 ? 1.3 : 1;
            const x = Math.cos(angle) * size * stretch;
            const y = Math.sin(angle) * size * stretch;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Central directional line
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(size * 0.8, 0);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    drawCross(ctx) {
        // Stealth cross shape with directional emphasis
        const size = this.radius * 0.7;
        const thickness = size * 0.3;
        
        ctx.beginPath();
        // Vertical bar
        ctx.rect(-thickness/2, -size, thickness, size * 2);
        // Horizontal bar (extended forward)
        ctx.rect(-size * 0.6, -thickness/2, size * 2.4, thickness);
        ctx.fill();
        ctx.stroke();
        
        // Forward direction indicator
        ctx.beginPath();
        ctx.arc(size * 1.3, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    
    drawSpikedCircle(ctx) {
        // Explosive circle with directional spikes
        const innerSize = this.radius * 0.5;
        const outerSize = this.radius * 0.8;
        
        // Inner circle
        ctx.beginPath();
        ctx.arc(0, 0, innerSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Spikes with forward emphasis
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            // Make forward spikes longer
            const lengthMultiplier = (i === 0) ? 1.5 : 1;
            const innerX = Math.cos(angle) * innerSize;
            const innerY = Math.sin(angle) * innerSize;
            const outerX = Math.cos(angle) * outerSize * lengthMultiplier;
            const outerY = Math.sin(angle) * outerSize * lengthMultiplier;
            
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
        }
        ctx.stroke();
        
        // Forward spike emphasis
        ctx.beginPath();
        ctx.moveTo(innerSize, 0);
        ctx.lineTo(outerSize * 1.5, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }
    
    drawCirculatingShield(ctx) {
        ctx.save();
        
        // Use music-synchronized intensity
        const pulseIntensity = this.shield.currentIntensity || 0.5;
        
        // Simplified shield pattern for performance
        const time = Date.now() * 0.001;
        const waveFrequency = 4; // Reduced from 8 for better performance
        const waveAmplitude = 2; // Reduced from 4 for better performance
        
        // Base radius with music-driven pulsing
        const baseRadius = this.shield.radius + (pulseIntensity - 0.5) * 6;
        
        // Draw shield ring with sine wave pattern
        ctx.translate(this.x, this.y);
        ctx.rotate(this.shield.rotation);
        
        // Draw outer glow with variable radius
        const maxGlowRadius = baseRadius + waveAmplitude + 8;
        const outerGlow = ctx.createRadialGradient(0, 0, baseRadius - 8, 0, 0, maxGlowRadius);
        outerGlow.addColorStop(0, this.color + '00');
        outerGlow.addColorStop(0.3, this.color + Math.floor(pulseIntensity * 0.6 * 255).toString(16).padStart(2, '0'));
        outerGlow.addColorStop(0.7, this.color + Math.floor(pulseIntensity * 0.4 * 255).toString(16).padStart(2, '0'));
        outerGlow.addColorStop(1, this.color + '00');
        
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, maxGlowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw main shield as a continuous sine wave path
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = pulseIntensity;
        
        ctx.beginPath();
        const angleStep = 0.3; // Increased from 0.1 for better performance
        for (let angle = 0; angle <= Math.PI * 2; angle += angleStep) {
            // Calculate sine wave modulation
            const wavePhase = angle * waveFrequency + this.shield.waveOffset + time * 2;
            const radiusVariation = Math.sin(wavePhase) * waveAmplitude * pulseIntensity;
            const currentRadius = baseRadius + radiusVariation;
            
            const x = Math.cos(angle) * currentRadius;
            const y = Math.sin(angle) * currentRadius;
            
            if (angle === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw secondary inner wave with different frequency
        ctx.lineWidth = 1;
        ctx.globalAlpha = pulseIntensity * 0.6;
        ctx.strokeStyle = '#ffffff';
        
        ctx.beginPath();
        for (let angle = 0; angle <= Math.PI * 2; angle += angleStep) {
            const wavePhase = angle * (waveFrequency * 1.5) + this.shield.waveOffset + time * 3;
            const radiusVariation = Math.sin(wavePhase) * (waveAmplitude * 0.5) * pulseIntensity;
            const currentRadius = baseRadius - 4 + radiusVariation;
            
            const x = Math.cos(angle) * currentRadius;
            const y = Math.sin(angle) * currentRadius;
            
            if (angle === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw energy particles following the sine wave pattern
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const particleAngle = (this.shield.rotation * 3 + (i / particleCount) * Math.PI * 2) % (Math.PI * 2);
            
            // Calculate particle position on the sine wave
            const wavePhase = particleAngle * waveFrequency + this.shield.waveOffset + time * 2;
            const radiusVariation = Math.sin(wavePhase) * waveAmplitude * pulseIntensity;
            const particleRadius = baseRadius + radiusVariation;
            
            const particleX = Math.cos(particleAngle) * particleRadius;
            const particleY = Math.sin(particleAngle) * particleRadius;
            
            // Particle intensity varies with wave position
            const particleIntensity = pulseIntensity * (0.6 + 0.4 * Math.sin(wavePhase));
            
            ctx.globalAlpha = particleIntensity;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(particleX, particleY, 2 + Math.sin(wavePhase) * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Bright center
            ctx.globalAlpha = particleIntensity * 0.8;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(particleX, particleY, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawHealthBar(ctx) {
        if (this.health >= this.maxHealth) return;
        
        ctx.save();
        
        // Make bar longer to accommodate level display
        const barWidth = this.radius * 2.2; // Increased from 1.8 to 2.2
        const barHeight = 3;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 18;

        // Draw level display to the left of the health bar
        const levelText = `LV.${this.level}`;
        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        // Draw "LV." in gray
        const lvX = barX - 4;
        const lvY = barY + barHeight / 2;
        ctx.fillStyle = '#888888'; // Gray color
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeText('LV.', lvX, lvY);
        ctx.fillText('LV.', lvX, lvY);
        
        // Measure "LV." width to position the level number
        const lvWidth = ctx.measureText('LV.').width;
        
        // Draw level number in blue
        const levelNumX = lvX + lvWidth;
        ctx.fillStyle = '#4488ff'; // Blue color
        ctx.strokeText(this.level.toString(), levelNumX, lvY);
        ctx.fillText(this.level.toString(), levelNumX, lvY);

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