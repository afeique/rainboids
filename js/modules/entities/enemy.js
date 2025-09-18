// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG } from '../constants.js';
import { random, GameDimensions } from '../utils.js';

// Enemy type definitions with unique characteristics
export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',        // Red
        health: 12,              // Reduced to 12 - destroyable in a few hits
        speed: 1.6,              // Reduced from 2.2 - more manageable chase speed
        size: 25,
        shootPattern: 'burst_3',  // 3-round bursts
        shootRate: 1.5,          // Slower rate for burst pattern
        movePattern: 'triangle',   // Triangle geometric movement
        points: 50
    },
    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',        // Green  
        health: 18,              // Reduced to 18 - still tanky but manageable
        speed: 1.0,              // Reduced from 1.4 - slower patrol movement
        size: 35,
        shootPattern: 'spread',
        shootRate: 2.0,  // Increased for testing
        movePattern: 'square',     // Square geometric movement
        points: 75
    },
    WASP: {
        name: 'Wasp',
        color: '#ffff44',        // Yellow
        health: 10,              // Reduced to 10 - fast but fragile
        speed: 1.9,              // Further reduced from 2.4 - still quick but not crazy
        size: 22,                // Increased from 18
        shootPattern: 'line_4',  // Line of 4 shots
        shootRate: 1.8,          // Slower rate for line pattern
        movePattern: 'diamond',        // Diamond geometric movement
        points: 35
    },
    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 20,              // Reduced to 20 - boss-like but not overwhelming
        speed: 0.8,              // Slightly faster for spiral movement
        size: 45,
        shootPattern: 'circle_6', // Six shots in a circle
        shootRate: 1.2,          // Slower rate for circle pattern
        movePattern: 'hexagon',       // Hexagon geometric movement
        points: 100
    },
    STALKER: {
        name: 'Stalker',
        color: '#44ffff',        // Cyan
        health: 14,              // Reduced to 14 - stealthy but not too tanky
        speed: 2.5,              // Higher speed for burst knight movement
        size: 22,
        shootPattern: 'burst',
        shootRate: 2.0,  // Increased for testing
        movePattern: 'cross',    // Cross/Plus geometric movement
        points: 45
    },
    BOMBER: {
        name: 'Bomber',
        color: '#ff8844',        // Orange
        health: 20,              // Reduced to 20 - heavy but not excessive
        speed: 0.3,              // Much slower - crawling speed
        size: 35,                // Slightly bigger to show their bulk
        shootPattern: 'homing',  // Slow but homing shots
        shootRate: 0.8,          // Very slow rate for homing shots
        movePattern: 'circle',       // Circle geometric movement
        points: 65
    },
    LASER_TURRET: {
        name: 'Laser Turret',
        color: '#00ffff',        // Cyan
        health: 16,              // Reduced to 16 - durable turret
        speed: 0,                // Completely stationary
        size: 30,
        shootPattern: 'laser',
        shootRate: 0.15,         // Much slower rate - long charging
        movePattern: 'stationary',
        points: 80
    },
    MISSILE_TURRET: {
        name: 'Missile Turret',
        color: '#ff00ff',        // Magenta
        health: 15,              // Reduced to 15 - medium durability turret
        speed: 0,                // Completely stationary
        size: 28,
        shootPattern: 'missile',
        shootRate: 0.4,          // Much slower rate
        movePattern: 'stationary',
        points: 90
    },
    PULSE_TURRET: {
        name: 'Pulse Turret',
        color: '#ffff00',        // Yellow
        health: 12,              // Reduced to 12 - lighter turret
        speed: 0,                // Completely stationary
        size: 25,
        shootPattern: 'pulse',
        shootRate: 0.8,          // Much slower rate
        movePattern: 'stationary',
        points: 70
    },
    SHIELD_TURRET: {
        name: 'Shield Turret',
        color: '#00ff00',        // Green
        health: 18,              // Reduced to 18 - very durable but not excessive
        speed: 0,                // Completely stationary
        size: 32,
        shootPattern: 'shield_burst',
        shootRate: 0.5,          // Much slower rate
        movePattern: 'stationary',
        points: 100
    }
};

export class Enemy {
    constructor(x, y, type = 'HUNTER', level = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.initializeEnemy(x, y);
    }
    
    reset(x, y, type = 'HUNTER', level = 1, gameEngine = null) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.initializeEnemy(x, y, gameEngine);
    }
    
    initializeEnemy(x, y, gameEngine = null) {
        // Use gameField dimensions if available, otherwise fall back to screen dimensions
        const fieldWidth = gameEngine?.gameField?.width || window.gameEngine?.gameField?.width || GameDimensions.width;
        const fieldHeight = gameEngine?.gameField?.height || window.gameEngine?.gameField?.height || GameDimensions.height;
        
        this.x = x !== undefined ? x : random(0, fieldWidth);
        this.y = y !== undefined ? y : random(0, fieldHeight);
        
        // Scale health based on level (35% increase per level)
        const levelMultiplier = 1 + (this.level - 1) * 0.35;
        this.maxHealth = Math.round(this.config.health * levelMultiplier);
        this.health = this.maxHealth;
        
        // Safeguard: ensure health never exceeds maxHealth
        if (this.health > this.maxHealth) {
            console.warn(`🐛 Enemy health bug detected: ${this.health} > ${this.maxHealth}, fixing...`);
            this.health = this.maxHealth;
        }
        
        // Scale size slightly based on level (10% increase per level, max 2x)
        const sizeMultiplier = Math.min(2.0, 1 + (this.level - 1) * 0.1);
        this.radius = this.config.size * sizeMultiplier;
        this.baseRadius = this.config.size * sizeMultiplier;
        this.color = this.config.color;
        
        // Scale speed based on level (20% increase per level)
        const speedMultiplier = 1 + (this.level - 1) * 0.2;
        const scaledSpeed = this.config.speed * speedMultiplier;
        
        // Initialize movement
        this.vel = {
            x: random(-scaledSpeed, scaledSpeed) || 0.2,
            y: random(-scaledSpeed, scaledSpeed) || 0.2
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
        
        // Burst firing properties
        this.burstState = {
            active: false,
            shotsRemaining: 0,
            shotDelay: 0,
            cooldownUntil: 0,
            lastBurstShot: 0
        };
        
        // Turret cooldown visualization
        this.cooldownTimer = {
            isActive: false,
            startTime: 0,
            duration: 0
        };
        
        // Line-of-sight caching for performance
        this.lastLOSCheck = 0;
        this.cachedLOSResult = undefined;
        
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
        
        // Light trail system
        this.trail = {
            positions: [], // Array of {x, y, age} objects
            maxLength: 15, // Maximum number of trail points
            updateInterval: 50, // Milliseconds between trail updates
            lastUpdate: 0,
            fadeTime: 800 // How long trail points last (ms)
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
        
        // Fish dart movement properties
        this.dartState = 'idle'; // 'idle', 'darting', 'slowing'
        this.dartDirection = { x: 0, y: 0 };
        this.dartTimer = 0;
        this.dartCooldown = 0;
        this.dartAngle = 0; // Current movement angle (45-degree increments)
        
        // Cardinal grid movement properties
        this.gridDirection = { x: 0, y: 0 };
        this.gridDistance = 0;
        this.gridTargetDistance = 0;
        this.gridDirections = [
            { x: 0, y: -1 }, // Up
            { x: 1, y: 0 },  // Right
            { x: 0, y: 1 },  // Down
            { x: -1, y: 0 }  // Left
        ];
        
        // Wavy movement properties
        this.wavyBaseAngle = random(0, Math.PI * 2);
        this.wavyTime = 0;
        this.wavyAmplitude = 30;
        this.wavyFrequency = 0.02;
        
        // Knight movement properties (L-shaped like chess knight)
        this.knightMoveTimer = 0;
        this.knightMoveDuration = 800 + Math.random() * 400; // 800-1200ms between moves
        this.knightTargetX = this.x;
        this.knightTargetY = this.y;
        this.knightMoving = false;
        this.knightMoveStartTime = 0;
        
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

    
    update(playerRef, gameEngine, gameField = null) {
        if (!this.active) return;
        
        this.targetPlayer = playerRef;
        
        // Calculate distance to player
        const playerDistance = Math.hypot(this.x - playerRef.x, this.y - playerRef.y);
        
        // Distance-based behavior
        this.updateTargetPriority(playerDistance, gameEngine);
        
        // Update face direction to look at current target
        this.updateFaceDirection();
        
        // Update movement based on pattern
        this.updateMovement(gameEngine);
        
        // Enhanced evasive maneuvers
        this.updateEvasiveManeuvers(gameEngine);
        
        // Asteroid avoidance removed - enemies focus on player and patrol only
        
        // Maintain distance from player when targeting them
        if (this.currentTarget === 'player') {
            this.maintainDistanceFromPlayer();
        }
        
        // Maintain distance from other enemies to prevent clustering
        this.maintainDistanceFromEnemies(gameEngine.enemyPool.active);
        
        // Handle patrol behavior when no targets available
        if (this.currentTarget === 'patrol') {
            this.patrolTerritory();
        }
        
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
        
        // Add fish-like swimming motion
        this.addFishLikeMovement();
        
        // Update position
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Update light trail
        this.updateLightTrail();
        
        // Create colored trail particles to show movement patterns
        this.createTrailParticles(gameEngine);
        
        // Boundary bouncing instead of wrapping
        if (gameField) {
            // Bounce off left/right boundaries
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vel.x = Math.abs(this.vel.x) * 0.8; // Bounce with energy loss
            } else if (this.x + this.radius > gameField.width) {
                this.x = gameField.width - this.radius;
                this.vel.x = -Math.abs(this.vel.x) * 0.8;
            }
            
            // Bounce off top/bottom boundaries
            if (this.y - this.radius < 0) {
                this.y = this.radius;
                this.vel.y = Math.abs(this.vel.y) * 0.8;
            } else if (this.y + this.radius > gameField.height) {
                this.y = gameField.height - this.radius;
                this.vel.y = -Math.abs(this.vel.y) * 0.8;
            }
        } else {
            // Fallback to wrapping using gameField dimensions if available
            const fieldWidth = window.gameEngine?.gameField?.width || GameDimensions.width;
            const fieldHeight = window.gameEngine?.gameField?.height || GameDimensions.height;
            
            if (this.x < -this.radius) this.x = fieldWidth + this.radius;
            if (this.x > fieldWidth + this.radius) this.x = -this.radius;
            if (this.y < -this.radius) this.y = fieldHeight + this.radius;
            if (this.y > fieldHeight + this.radius) this.y = -this.radius;
        }
        
        // Death check (use tolerance for floating-point precision)
        if (this.health <= 0.001) {
            this.active = false;
        }
    }
    
    updateFaceDirection() {
        let targetX, targetY;
        
        // Determine what to face based on current target
        if (this.currentTarget === 'player' && this.targetPlayer) {
            targetX = this.targetPlayer.x;
            targetY = this.targetPlayer.y;
        } else if (this.currentTarget === 'asteroid' && this.targetAsteroid) {
            targetX = this.targetAsteroid.x;
            targetY = this.targetAsteroid.y;
        } else if (this.currentTarget === 'patrol' && this.patrolTarget) {
            targetX = this.patrolTarget.x;
            targetY = this.patrolTarget.y;
        } else if (this.targetPlayer) {
            // Fallback to player
            targetX = this.targetPlayer.x;
            targetY = this.targetPlayer.y;
        } else {
            return; // No valid target to face
        }
        
        // Calculate angle to target
        const dx = targetX - this.x;
        const dy = targetY - this.y;
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
            case 'fish_dart':
                this.fishDartMovement();
                break;
            case 'cardinal_grid':
                this.cardinalGridMovement();
                break;
            case 'wavy':
                this.wavyMovement();
                break;
            case 'triangle':
                this.triangleMovement();
                break;
            case 'square':
                this.squareMovement();
                break;
            case 'diamond':
                this.diamondMovement();
                break;
            case 'hexagon':
                this.hexagonMovement();
                break;
            case 'cross':
                this.crossMovement();
                break;
            case 'circle':
                this.circleMovement();
                break;
            case 'stationary':
                this.stationaryMovement();
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
        
        // Calculate distance to game field center
        const fieldWidth = window.gameEngine?.gameField?.width || GameDimensions.width;
        const fieldHeight = window.gameEngine?.gameField?.height || GameDimensions.height;
        const centerX = fieldWidth / 2;
        const centerY = fieldHeight / 2;
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
    
    fishDartMovement() {
        if (!this.targetPlayer) return;
        
        // Update timers
        this.dartTimer -= 16; // Assume 60fps
        this.dartCooldown -= 16;
        
        switch (this.dartState) {
            case 'idle':
                // Apply friction when idle
                this.vel.x *= 0.95;
                this.vel.y *= 0.95;
                
                // Check if ready to dart (cooldown finished and random chance)
                if (this.dartCooldown <= 0 && Math.random() < 0.02) {
                    this.startFishDart();
                }
                break;
                
            case 'darting':
                // Move in the dart direction at full speed
                const dartSpeed = this.config.speed * 1.8;
                this.vel.x = this.dartDirection.x * dartSpeed;
                this.vel.y = this.dartDirection.y * dartSpeed;
                
                // Check if dart duration is over
                if (this.dartTimer <= 0) {
                    this.dartState = 'slowing';
                    this.dartTimer = 800; // Slowing duration (800ms)
                }
                break;
                
            case 'slowing':
                // Apply strong friction to slow down
                this.vel.x *= 0.88;
                this.vel.y *= 0.88;
                
                // Check if slowing duration is over
                if (this.dartTimer <= 0) {
                    this.dartState = 'idle';
                    this.dartCooldown = random(1000, 2500); // Random cooldown between darts
                }
                break;
        }
        
        // Slight bias toward player when idle
        if (this.dartState === 'idle') {
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance > 0) {
                const bias = 0.008;
                this.vel.x += (dx / distance) * bias;
                this.vel.y += (dy / distance) * bias;
            }
        }
    }
    
    startFishDart() {
        // Choose one of 8 possible 45-degree angles
        const angleIndex = Math.floor(random(0, 8));
        this.dartAngle = (angleIndex * Math.PI) / 4; // 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
        
        // Set dart direction
        this.dartDirection.x = Math.cos(this.dartAngle);
        this.dartDirection.y = Math.sin(this.dartAngle);
        
        // Bias toward player direction
        if (this.targetPlayer) {
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance > 0) {
                const playerAngle = Math.atan2(dy, dx);
                
                // Find the closest 45-degree angle to the player
                let bestAngle = 0;
                let smallestDiff = Math.PI * 2;
                
                for (let i = 0; i < 8; i++) {
                    const testAngle = (i * Math.PI) / 4;
                    let diff = Math.abs(testAngle - playerAngle);
                    if (diff > Math.PI) diff = Math.PI * 2 - diff;
                    
                    if (diff < smallestDiff) {
                        smallestDiff = diff;
                        bestAngle = testAngle;
                    }
                }
                
                // Use the best angle with some randomness
                if (Math.random() < 0.7) { // 70% chance to dart toward player
                    this.dartAngle = bestAngle;
                    this.dartDirection.x = Math.cos(this.dartAngle);
                    this.dartDirection.y = Math.sin(this.dartAngle);
                }
            }
        }
        
        this.dartState = 'darting';
        this.dartTimer = random(400, 800); // Dart duration (400-800ms)
    }
    
    cardinalGridMovement() {
        // Update distance traveled in current direction
        this.gridDistance += Math.hypot(this.vel.x, this.vel.y);
        
        // Check if we need to change direction
        if (this.gridDistance >= this.gridTargetDistance || 
            (this.gridDirection.x === 0 && this.gridDirection.y === 0)) {
            this.chooseNewGridDirection();
        }
        
        // Move at constant speed in the chosen direction
        const speed = this.config.speed;
        this.vel.x = this.gridDirection.x * speed;
        this.vel.y = this.gridDirection.y * speed;
        
        // Add slight bias toward player when choosing directions
        if (this.targetPlayer && Math.random() < 0.3) {
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            
            // Find the cardinal direction that gets us closest to the player
            let bestDirection = this.gridDirection;
            let bestDot = -2;
            
            for (const dir of this.gridDirections) {
                const dot = dir.x * dx + dir.y * dy;
                if (dot > bestDot) {
                    bestDot = dot;
                    bestDirection = dir;
                }
            }
            
            // Sometimes use the best direction toward player
            if (Math.random() < 0.4) {
                this.gridDirection = bestDirection;
            }
        }
    }
    
    chooseNewGridDirection() {
        // Choose a random cardinal direction
        const dirIndex = Math.floor(random(0, this.gridDirections.length));
        this.gridDirection = this.gridDirections[dirIndex];
        
        // Set a new target distance to travel
        this.gridTargetDistance = random(60, 150); // Distance before changing direction
        this.gridDistance = 0; // Reset distance counter
    }
    
    wavyMovement() {
        if (!this.targetPlayer) return;
        
        // Update wavy time
        this.wavyTime += 16; // Assume 60fps, add ~16ms per frame
        
        // Calculate base direction toward player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Base movement toward player
            const baseSpeed = this.config.speed * 0.6; // Reduced base speed
            let baseVelX = (dx / distance) * baseSpeed;
            let baseVelY = (dy / distance) * baseSpeed;
            
            // Add wavy motion perpendicular to the player direction
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
            const waveOffset = Math.sin(this.wavyTime * this.wavyFrequency) * this.wavyAmplitude;
            
            // Convert wave offset to velocity
            const waveVelX = Math.cos(perpAngle) * waveOffset * 0.01;
            const waveVelY = Math.sin(perpAngle) * waveOffset * 0.01;
            
            // Combine base movement with wave motion
            this.vel.x = baseVelX + waveVelX;
            this.vel.y = baseVelY + waveVelY;
            
            // Apply speed limit to prevent too fast movement
            const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
            const maxSpeed = this.config.speed * 1.1; // Allow slightly higher speed
            
            if (currentSpeed > maxSpeed) {
                this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
                this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
            }
        }
    }
    
    knightMovement() {
        if (!this.targetPlayer) return;
        
        const now = Date.now();
        
        // Update knight move timer
        this.knightMoveTimer += 16; // Assume 60fps, ~16ms per frame
        
        if (!this.knightMoving) {
            // Time to start a new knight move
            if (this.knightMoveTimer >= this.knightMoveDuration) {
                this.startKnightMove();
            } else {
                // Drift slowly toward player when not making knight moves
                const dx = this.targetPlayer.x - this.x;
                const dy = this.targetPlayer.y - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance > 1) {
                    const driftSpeed = 0.3;
                    this.vel.x = (dx / distance) * driftSpeed;
                    this.vel.y = (dy / distance) * driftSpeed;
                }
            }
        } else {
            // Execute the knight move with burst movement
            const moveProgress = (now - this.knightMoveStartTime) / 300; // 300ms move duration
            
            if (moveProgress >= 1) {
                // Move completed
                this.knightMoving = false;
                this.knightMoveTimer = 0;
                this.knightMoveDuration = 800 + Math.random() * 400; // Next move in 800-1200ms
                this.vel.x = 0;
                this.vel.y = 0;
            } else {
                // Burst movement toward target with easing
                const easeProgress = 1 - Math.pow(1 - moveProgress, 3); // Ease out cubic
                const dx = this.knightTargetX - this.x;
                const dy = this.knightTargetY - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance > 1) {
                    const burstSpeed = this.config.speed * 3; // 3x normal speed for burst
                    this.vel.x = (dx / distance) * burstSpeed * (1 - easeProgress);
                    this.vel.y = (dy / distance) * burstSpeed * (1 - easeProgress);
                }
            }
        }
    }
    
    startKnightMove() {
        if (!this.targetPlayer) return;
        
        // Calculate L-shaped knight moves (like chess knight: 2 squares in one direction, 1 in perpendicular)
        const knightMoves = [
            { x: 2, y: 1 },   { x: 2, y: -1 },
            { x: -2, y: 1 },  { x: -2, y: -1 },
            { x: 1, y: 2 },   { x: 1, y: -2 },
            { x: -1, y: 2 },  { x: -1, y: -2 }
        ];
        
        // Choose a random knight move
        const move = knightMoves[Math.floor(Math.random() * knightMoves.length)];
        const moveDistance = 80; // Distance for each "square" in the L-move
        
        // Calculate target position
        this.knightTargetX = this.x + (move.x * moveDistance);
        this.knightTargetY = this.y + (move.y * moveDistance);
        
        // Keep target within screen bounds
        const margin = 50;
        this.knightTargetX = Math.max(margin, Math.min(this.width - margin, this.knightTargetX));
        this.knightTargetY = Math.max(margin, Math.min(this.height - margin, this.knightTargetY));
        
        // Start the move
        this.knightMoving = true;
        this.knightMoveStartTime = Date.now();
    }
    
    spiralBurstMovement() {
        if (!this.targetPlayer) return;
        
        const now = Date.now();
        
        // Initialize spiral properties if not set
        if (this.spiralAngle === undefined) {
            this.spiralAngle = 0;
            this.spiralRadius = 150;
            this.spiralCenter = { x: this.targetPlayer.x, y: this.targetPlayer.y };
            this.burstTimer = 0;
            this.burstCooldown = 0;
            this.spiralState = 'spiraling'; // 'spiraling' or 'bursting'
        }
        
        // Update timers
        this.burstTimer += 16; // Assume 60fps
        this.burstCooldown -= 16;
        
        switch (this.spiralState) {
            case 'spiraling':
                // Spiral movement using sinusoids
                this.spiralAngle += 0.02; // Spiral speed
                
                // Update spiral center to slowly follow player
                const centerLerpSpeed = 0.005;
                this.spiralCenter.x += (this.targetPlayer.x - this.spiralCenter.x) * centerLerpSpeed;
                this.spiralCenter.y += (this.targetPlayer.y - this.spiralCenter.y) * centerLerpSpeed;
                
                // Calculate spiral position with sinusoidal variation
                const radiusVariation = Math.sin(this.spiralAngle * 3) * 30; // Radius varies with sine wave
                const currentRadius = this.spiralRadius + radiusVariation;
                
                // Double sinusoid for complex spiral pattern
                const spiralX = this.spiralCenter.x + Math.cos(this.spiralAngle) * currentRadius;
                const spiralY = this.spiralCenter.y + Math.sin(this.spiralAngle * 1.3) * currentRadius; // Different frequency for Y
                
                // Move toward spiral position
                const dx = spiralX - this.x;
                const dy = spiralY - this.y;
                const spiralAcceleration = 0.015;
                this.vel.x = dx * spiralAcceleration;
                this.vel.y = dy * spiralAcceleration;
                
                // Check if ready to burst (random chance and cooldown)
                if (this.burstCooldown <= 0 && Math.random() < 0.015) {
                    this.startSpiralBurst();
                }
                break;
                
            case 'bursting':
                // Burst toward player like other enemies
                if (this.burstTimer >= 800) { // 800ms burst duration
                    this.spiralState = 'spiraling';
                    this.burstTimer = 0;
                    this.burstCooldown = 2000 + Math.random() * 1000; // 2-3 second cooldown
                }
                // Burst movement is handled by the burst velocity set in startSpiralBurst
                break;
        }
    }
    
    startSpiralBurst() {
        if (!this.targetPlayer) return;
        
        // Calculate burst direction toward player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Set burst velocity
            const burstSpeed = this.config.speed * 3; // 3x normal speed for burst
            this.vel.x = (dx / distance) * burstSpeed;
            this.vel.y = (dy / distance) * burstSpeed;
        }
        
        this.spiralState = 'bursting';
        this.burstTimer = 0;
    }
    
    heavyCrawlMovement() {
        if (!this.targetPlayer) return;
        
        // Slow, relentless movement toward player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Very slow but steady movement
            const crawlSpeed = this.config.speed * 0.5; // Even slower than base speed
            this.vel.x = (dx / distance) * crawlSpeed;
            this.vel.y = (dy / distance) * crawlSpeed;
        }
        
        // Add heavy momentum - resist velocity changes (makes them harder to knock around)
        const momentum = 0.95; // High momentum retention
        this.vel.x *= momentum;
        this.vel.y *= momentum;
        
        // Add slight wobble to show the weight/effort of movement
        const heavyWobble = Math.sin(Date.now() * 0.003) * 0.05;
        this.vel.x += heavyWobble;
        this.vel.y += Math.cos(Date.now() * 0.003) * 0.05;
    }
    
    updateTargetPriority(playerDistance, gameEngine) {
        // Initialize targeting and territorial properties
        if (this.currentTarget === undefined) {
            this.currentTarget = 'player'; // Only 'player' or 'patrol'
            this.loseInterestDistance = this.getTerritorySize() * 0.8; // Lose interest at 80% of territory size
            this.keepDistanceFromPlayer = 120 + this.radius; // Dynamic distance based on enemy size
            this.keepDistanceFromEnemies = 40 + this.radius; // Dynamic distance based on enemy size
            
            // Initialize territory system
            this.initializeTerritory(gameEngine);
        }
        
        // Check if player is within our territory
        const playerInTerritory = this.isPlayerInTerritory(this.targetPlayer);
        
        // Territorial behavior - patrol if player is outside territory
        if (!playerInTerritory) {
            // Player is outside our territory, patrol to defend our area
                this.currentTarget = 'patrol';
            return;
        }
        
        // Player is in territory - prioritize chasing them out
        if (playerDistance > this.loseInterestDistance) {
            // Player is at edge of territory, patrol to maintain presence
            this.currentTarget = 'patrol';
        } else {
            // Player is in our territory, chase them aggressively
                this.currentTarget = 'player';
        }
    }
    
    initializeTerritory(gameEngine) {
        if (!gameEngine || !gameEngine.gameField) return;
        
        // Define territory based on enemy type and spawn position
        const territorySize = this.getTerritorySize();
        
        // Territory is centered around spawn position
        this.territory = {
            centerX: this.x,
            centerY: this.y,
            radius: territorySize,
            // Rectangular territory bounds (alternative to circular)
            left: this.x - territorySize,
            right: this.x + territorySize,
            top: this.y - territorySize,
            bottom: this.y + territorySize
        };
        
        // Clamp territory to game field bounds
        this.territory.left = Math.max(0, this.territory.left);
        this.territory.right = Math.min(gameEngine.gameField.width, this.territory.right);
        this.territory.top = Math.max(0, this.territory.top);
        this.territory.bottom = Math.min(gameEngine.gameField.height, this.territory.bottom);
        
        // Update center based on clamped bounds
        this.territory.centerX = (this.territory.left + this.territory.right) / 2;
        this.territory.centerY = (this.territory.top + this.territory.bottom) / 2;
        this.territory.radius = Math.min(
            (this.territory.right - this.territory.left) / 2,
            (this.territory.bottom - this.territory.top) / 2
        );
    }
    
    getTerritorySize() {
        // Get screen dimensions for territory scaling
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const avgScreenSize = (screenWidth + screenHeight) / 2;
        
        // Different enemy types have different territory sizes (1-2 screen sizes)
        switch (this.type) {
            case 'TITAN': return avgScreenSize * 1.8; // Large territory ~1.8 screen sizes
            case 'BOMBER': return avgScreenSize * 1.6; // Large territory ~1.6 screen sizes
            case 'GUARDIAN': return avgScreenSize * 1.4; // Medium-large territory ~1.4 screen sizes
            case 'HUNTER': return avgScreenSize * 1.2; // Medium territory ~1.2 screen sizes
            case 'STALKER': return avgScreenSize * 1.0; // Smaller territory ~1 screen size
            case 'WASP': return avgScreenSize * 0.8; // Small territory ~0.8 screen sizes
            // Turrets have smaller territories since they're stationary
            case 'LASER_TURRET': return avgScreenSize * 1.0; // Medium range for laser
            case 'MISSILE_TURRET': return avgScreenSize * 1.2; // Longer range for missiles
            case 'PULSE_TURRET': return avgScreenSize * 0.8; // Shorter range for rapid fire
            case 'SHIELD_TURRET': return avgScreenSize * 0.9; // Medium-short range
            default: return avgScreenSize * 1.2; // Default medium territory ~1.2 screen sizes
        }
    }
    
    isPlayerInTerritory(player) {
        if (!this.territory || !player) return true; // Default to true if no territory set
        
        // Use circular territory check for simplicity
        const dx = player.x - this.territory.centerX;
        const dy = player.y - this.territory.centerY;
        const distanceFromCenter = Math.hypot(dx, dy);
        
        return distanceFromCenter <= this.territory.radius;
    }
    
    findNearestAsteroid(gameEngine) {
        if (!gameEngine || !gameEngine.asteroidPool) {
            this.targetAsteroid = null;
            return;
        }
        
        let nearestAsteroid = null;
        let nearestDistance = this.asteroidSearchRadius;
        
        for (const asteroid of gameEngine.asteroidPool.activeObjects) {
            if (asteroid.active) {
                // Only consider asteroids within our territory
                if (this.territory && !this.isAsteroidInTerritory(asteroid)) {
                    continue;
                }
                
                const distance = Math.hypot(this.x - asteroid.x, this.y - asteroid.y);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestAsteroid = asteroid;
                }
            }
        }
        
        this.targetAsteroid = nearestAsteroid;
    }
    
    isAsteroidInTerritory(asteroid) {
        if (!this.territory || !asteroid) return true;
        
        const dx = asteroid.x - this.territory.centerX;
        const dy = asteroid.y - this.territory.centerY;
        const distanceFromCenter = Math.hypot(dx, dy);
        
        return distanceFromCenter <= this.territory.radius;
    }
    
    maintainDistanceFromPlayer() {
        if (!this.targetPlayer) return;
        
        const dx = this.x - this.targetPlayer.x;
        const dy = this.y - this.targetPlayer.y;
        const distance = Math.hypot(dx, dy);
        
        // If too close to player, add repulsion force
        if (distance < this.keepDistanceFromPlayer && distance > 0) {
            const repulsionStrength = (this.keepDistanceFromPlayer - distance) / this.keepDistanceFromPlayer;
            const repulsionForce = repulsionStrength * 0.5;
            
            this.vel.x += (dx / distance) * repulsionForce;
            this.vel.y += (dy / distance) * repulsionForce;
        }
    }
    
    maintainDistanceFromEnemies(enemies) {
        if (!enemies || enemies.length === 0) return;
        
        // Check distance to all other active enemies
        for (const otherEnemy of enemies) {
            if (otherEnemy === this || !otherEnemy.active) continue;
            
            const dx = this.x - otherEnemy.x;
            const dy = this.y - otherEnemy.y;
            const distance = Math.hypot(dx, dy);
            
            // Calculate minimum distance based on both enemies' sizes
            const combinedRadius = this.radius + otherEnemy.radius;
            const minDistance = Math.max(this.keepDistanceFromEnemies, combinedRadius + 20);
            
            // If too close to another enemy, add repulsion force
            if (distance < minDistance && distance > 0) {
                const repulsionStrength = (minDistance - distance) / minDistance;
                const repulsionForce = repulsionStrength * 0.3; // Slightly weaker than player avoidance
                
                this.vel.x += (dx / distance) * repulsionForce;
                this.vel.y += (dy / distance) * repulsionForce;
            }
        }
    }
    
    patrolTerritory() {
        if (!this.territory) return;
        
        // Initialize patrol properties
        if (this.patrolTarget === undefined) {
            this.patrolTarget = { x: this.territory.centerX, y: this.territory.centerY };
            this.patrolTimer = 0;
            this.patrolChangeInterval = 8000 + Math.random() * 4000; // 8-12 seconds between patrol points for larger territories
        }
        
        this.patrolTimer += 16; // Assume 60fps
        
        // Check if we need a new patrol target
        const dx = this.patrolTarget.x - this.x;
        const dy = this.patrolTarget.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        
        if (distanceToTarget < 80 || this.patrolTimer >= this.patrolChangeInterval) {
            // Generate new patrol point within territory
            this.generateNewPatrolPoint();
            this.patrolTimer = 0;
        }
        
        // Move toward patrol target at reduced speed
        if (distanceToTarget > 5) {
            const patrolSpeed = this.config.speed * 0.3; // Slow patrol speed
            this.vel.x = (dx / distanceToTarget) * patrolSpeed;
            this.vel.y = (dy / distanceToTarget) * patrolSpeed;
        }
    }
    
    generateNewPatrolPoint() {
        if (!this.territory) return;
        
        // Generate random point within circular territory
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.territory.radius * 0.8; // Stay within 80% of territory
        
        this.patrolTarget.x = this.territory.centerX + Math.cos(angle) * distance;
        this.patrolTarget.y = this.territory.centerY + Math.sin(angle) * distance;
        
        // Ensure patrol point is within game bounds
        this.patrolTarget.x = Math.max(this.territory.left, Math.min(this.territory.right, this.patrolTarget.x));
        this.patrolTarget.y = Math.max(this.territory.top, Math.min(this.territory.bottom, this.patrolTarget.y));
    }
    
    updateLightTrail() {
        const now = Date.now();
        
        // Add new trail point if enough time has passed
        if (now - this.trail.lastUpdate > this.trail.updateInterval) {
            this.trail.positions.push({
                x: this.x,
                y: this.y,
                age: now
            });
            
            // Remove old trail points
            this.trail.positions = this.trail.positions.filter(point => 
                now - point.age < this.trail.fadeTime
            );
            
            // Limit trail length
            if (this.trail.positions.length > this.trail.maxLength) {
                this.trail.positions.shift();
            }
            
            this.trail.lastUpdate = now;
        }
    }
    
    createTrailParticles(gameEngine) {
        if (!gameEngine || !gameEngine.particlePool) return;
        
        // Initialize trail properties if not set
        if (this.trailTimer === undefined) {
            this.trailTimer = 0;
            this.lastTrailX = this.x;
            this.lastTrailY = this.y;
        }
        
        this.trailTimer += 16; // Assume 60fps
        
        // Create trail particles every few frames based on movement speed
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const trailInterval = Math.max(50, 150 - speed * 30); // Faster enemies = more frequent trails
        
        if (this.trailTimer >= trailInterval && speed > 0.1) {
            // Calculate distance moved since last trail
            const dx = this.x - this.lastTrailX;
            const dy = this.y - this.lastTrailY;
            const distanceMoved = Math.hypot(dx, dy);
            
            if (distanceMoved > 5) { // Only create trail if enemy has moved significantly
                // Create trail particle at previous position
                const trailParticle = gameEngine.particlePool.get(
                    this.lastTrailX, 
                    this.lastTrailY, 
                    'enemyTrail',
                    this.color,
                    this.type
                );
                
                if (trailParticle) {
                    // Set trail-specific properties
                    trailParticle.enemyColor = this.color;
                    trailParticle.enemyType = this.type;
                }
                
                this.trailTimer = 0;
                this.lastTrailX = this.x;
                this.lastTrailY = this.y;
            }
        }
    }
    
    // Geometric Movement Patterns
    triangleMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize triangle burst movement properties
        if (this.triangleBurstState === undefined) {
            this.triangleBurstState = 'waiting'; // 'waiting', 'bursting'
            this.triangleBurstTimer = 0;
            this.triangleBurstDuration = 1000; // 1 second burst
            this.triangleWaitDuration = 1800; // 1.8 second wait between bursts
            this.burstDirection = { x: 0, y: 0 };
            this.burstStartPos = { x: this.x, y: this.y };
            this.burstDistance = 0;
        }
        
        this.triangleBurstTimer += 16; // Assume 60fps
        
        // Calculate screen-based burst distance (1/5 to 1/7 of screen size)
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        const minBurstDistance = screenSize / 7;
        const maxBurstDistance = screenSize / 5;
        
        switch (this.triangleBurstState) {
            case 'waiting':
                // Apply friction to slow down
                this.vel.x *= 0.88;
                this.vel.y *= 0.88;
                
                if (this.triangleBurstTimer >= this.triangleWaitDuration) {
                    // Choose random direction (any angle)
                    const angle = Math.random() * Math.PI * 2;
                    this.burstDistance = minBurstDistance + Math.random() * (maxBurstDistance - minBurstDistance);
                    
                    this.burstDirection.x = Math.cos(angle);
                    this.burstDirection.y = Math.sin(angle);
                    
                    this.burstStartPos.x = this.x;
                    this.burstStartPos.y = this.y;
                    this.triangleBurstState = 'bursting';
                    this.triangleBurstTimer = 0;
                }
                break;
                
            case 'bursting':
                // Calculate how far we've moved from start position
                const movedDistance = Math.hypot(
                    this.x - this.burstStartPos.x,
                    this.y - this.burstStartPos.y
                );
                
                // Continue bursting if we haven't reached target distance
                if (movedDistance < this.burstDistance && this.triangleBurstTimer < this.triangleBurstDuration) {
                    const burstSpeed = this.config.speed * 3.5; // Very fast burst speed
                    this.vel.x = this.burstDirection.x * burstSpeed;
                    this.vel.y = this.burstDirection.y * burstSpeed;
                } else {
                    // Burst complete, switch to waiting
                    this.triangleBurstState = 'waiting';
                    this.triangleBurstTimer = 0;
                }
                break;
        }
    }
    
    calculateTriangleVertices() {
        if (!this.targetPlayer) return [];
        
        const radius = 120;
        const vertices = [];
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 - Math.PI / 2; // Start at top
            vertices.push({
                x: this.targetPlayer.x + Math.cos(angle) * radius,
                y: this.targetPlayer.y + Math.sin(angle) * radius
            });
        }
        return vertices;
    }
    
    squareMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize square burst movement properties
        if (this.squareBurstState === undefined) {
            this.squareBurstState = 'waiting'; // 'waiting', 'bursting'
            this.squareBurstTimer = 0;
            this.squareBurstDuration = 1200; // 1.2 second burst
            this.squareWaitDuration = 2000; // 2 second wait between bursts
            this.burstDirection = { x: 0, y: 0 };
            this.burstStartPos = { x: this.x, y: this.y };
            this.burstDistance = 0;
        }
        
        this.squareBurstTimer += 16; // Assume 60fps
        
        // Calculate screen-based burst distance (1/5 to 1/7 of screen size)
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        const minBurstDistance = screenSize / 7;
        const maxBurstDistance = screenSize / 5;
        
        switch (this.squareBurstState) {
            case 'waiting':
                // Apply friction to slow down
                this.vel.x *= 0.85;
                this.vel.y *= 0.85;
                
                if (this.squareBurstTimer >= this.squareWaitDuration) {
                    // Choose random horizontal or vertical direction
                    const isHorizontal = Math.random() < 0.5;
                    this.burstDistance = minBurstDistance + Math.random() * (maxBurstDistance - minBurstDistance);
                    
                    if (isHorizontal) {
                        this.burstDirection.x = Math.random() < 0.5 ? 1 : -1;
                        this.burstDirection.y = 0;
                    } else {
                        this.burstDirection.x = 0;
                        this.burstDirection.y = Math.random() < 0.5 ? 1 : -1;
                    }
                    
                    this.burstStartPos.x = this.x;
                    this.burstStartPos.y = this.y;
                    this.squareBurstState = 'bursting';
                    this.squareBurstTimer = 0;
                }
                break;
                
            case 'bursting':
                // Calculate how far we've moved from start position
                const movedDistance = Math.hypot(
                    this.x - this.burstStartPos.x,
                    this.y - this.burstStartPos.y
                );
                
                // Continue bursting if we haven't reached target distance
                if (movedDistance < this.burstDistance && this.squareBurstTimer < this.squareBurstDuration) {
                    const burstSpeed = this.config.speed * 3.0; // Fast burst speed
                    this.vel.x = this.burstDirection.x * burstSpeed;
                    this.vel.y = this.burstDirection.y * burstSpeed;
                } else {
                    // Burst complete, switch to waiting
                    this.squareBurstState = 'waiting';
                    this.squareBurstTimer = 0;
                }
                break;
        }
    }
    
    calculateSquareVertices() {
        if (!this.targetPlayer) return [];
        
        const radius = 100;
        const vertices = [];
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 + Math.PI / 4; // 45 degree offset
            vertices.push({
                x: this.targetPlayer.x + Math.cos(angle) * radius,
                y: this.targetPlayer.y + Math.sin(angle) * radius
            });
        }
        return vertices;
    }
    
    diamondMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize diamond movement properties
        if (this.diamondProgress === undefined) {
            this.diamondProgress = 0;
            this.diamondVertices = this.calculateDiamondVertices();
            this.currentVertex = 0;
            this.diamondBurstState = 'waiting'; // 'waiting', 'bursting'
            this.diamondBurstTimer = 0;
            this.diamondBurstDuration = 400; // 400ms quick burst
            this.diamondWaitDuration = 800; // 800ms wait between bursts
        }
        
        this.diamondBurstTimer += 16; // Assume 60fps
        
        // Quick burst movement system for diamonds
        switch (this.diamondBurstState) {
            case 'waiting':
                // Apply strong friction to stop quickly
                this.vel.x *= 0.85;
                this.vel.y *= 0.85;
                
                if (this.diamondBurstTimer >= this.diamondWaitDuration) {
                    this.diamondBurstState = 'bursting';
                    this.diamondBurstTimer = 0;
                }
                break;
                
            case 'bursting':
                // Quick darting movement toward current vertex
                const currentTarget = this.diamondVertices[this.currentVertex];
                const dx = currentTarget.x - this.x;
                const dy = currentTarget.y - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance < 15) { // Reached vertex
                    this.currentVertex = (this.currentVertex + 1) % 4;
                    this.diamondVertices = this.calculateDiamondVertices(); // Recalculate around player
                }
                
                // Very fast darting movement
                if (distance > 0) {
                    const dartSpeed = this.config.speed * 3.0; // Very fast burst
                    this.vel.x = (dx / distance) * dartSpeed;
                    this.vel.y = (dy / distance) * dartSpeed;
                }
                
                if (this.diamondBurstTimer >= this.diamondBurstDuration) {
                    this.diamondBurstState = 'waiting';
                    this.diamondBurstTimer = 0;
                }
                break;
        }
    }
    
    calculateDiamondVertices() {
        if (!this.targetPlayer) return [];
        
        const radius = 80;
        return [
            { x: this.targetPlayer.x, y: this.targetPlayer.y - radius }, // Top
            { x: this.targetPlayer.x + radius, y: this.targetPlayer.y }, // Right
            { x: this.targetPlayer.x, y: this.targetPlayer.y + radius }, // Bottom
            { x: this.targetPlayer.x - radius, y: this.targetPlayer.y }  // Left
        ];
    }
    
    hexagonMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize hexagon movement properties
        if (this.hexagonProgress === undefined) {
            this.hexagonProgress = 0;
            this.hexagonVertices = this.calculateHexagonVertices();
            this.currentVertex = 0;
            this.hexagonBurstState = 'waiting'; // 'waiting', 'bursting'
            this.hexagonBurstTimer = 0;
            this.hexagonBurstDuration = 1200; // 1.2 second burst
            this.hexagonWaitDuration = 4000; // 4 second LONG wait between bursts (Titans are slow)
        }
        
        this.hexagonBurstTimer += 16; // Assume 60fps
        
        // Slow, heavy burst movement system for hexagons (Titans)
        switch (this.hexagonBurstState) {
            case 'waiting':
                // Apply heavy friction to come to near halt
                this.vel.x *= 0.95;
                this.vel.y *= 0.95;
                
                if (this.hexagonBurstTimer >= this.hexagonWaitDuration) {
                    this.hexagonBurstState = 'bursting';
                    this.hexagonBurstTimer = 0;
                }
                break;
                
            case 'bursting':
                // Heavy, imposing movement toward current vertex
                const currentTarget = this.hexagonVertices[this.currentVertex];
                const dx = currentTarget.x - this.x;
                const dy = currentTarget.y - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance < 30) { // Reached vertex
                    this.currentVertex = (this.currentVertex + 1) % 6;
                    this.hexagonVertices = this.calculateHexagonVertices(); // Recalculate around player
                }
                
                // Powerful but measured burst movement
                if (distance > 0) {
                    const titanBurstSpeed = this.config.speed * 2.0; // Strong but not too fast
                    this.vel.x = (dx / distance) * titanBurstSpeed;
                    this.vel.y = (dy / distance) * titanBurstSpeed;
                }
                
                if (this.hexagonBurstTimer >= this.hexagonBurstDuration) {
                    this.hexagonBurstState = 'waiting';
                    this.hexagonBurstTimer = 0;
                }
                break;
        }
    }
    
    calculateHexagonVertices() {
        if (!this.targetPlayer) return [];
        
        const radius = 140;
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            vertices.push({
                x: this.targetPlayer.x + Math.cos(angle) * radius,
                y: this.targetPlayer.y + Math.sin(angle) * radius
            });
        }
        return vertices;
    }
    
    crossMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize cross scrolling movement properties
        if (this.crossScrollState === undefined) {
            this.crossScrollState = 'moving';
            this.scrollDirection = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            this.scrollSign = Math.random() < 0.5 ? 1 : -1; // Direction within axis
            this.scrollStartPos = { x: this.x, y: this.y };
            this.scrollDistance = 0;
            this.maxScrollDistance = (window.innerWidth + window.innerHeight) / 4; // 1/4 of combined screen dimensions
            this.scrollTimer = 0;
            this.scrollDuration = 3000 + Math.random() * 2000; // 3-5 seconds per direction
        }
        
        this.scrollTimer += 16; // Assume 60fps
        
        // Calculate how far we've scrolled from start position
        if (this.scrollDirection === 'horizontal') {
            this.scrollDistance = Math.abs(this.x - this.scrollStartPos.x);
        } else {
            this.scrollDistance = Math.abs(this.y - this.scrollStartPos.y);
        }
        
        // Check if we should reverse direction
        const shouldReverse = this.scrollDistance >= this.maxScrollDistance || 
                             this.scrollTimer >= this.scrollDuration;
        
        if (shouldReverse) {
            // Reverse direction
            this.scrollSign *= -1;
            this.scrollStartPos.x = this.x;
            this.scrollStartPos.y = this.y;
            this.scrollDistance = 0;
            this.scrollTimer = 0;
            
            // Occasionally switch between horizontal and vertical
            if (Math.random() < 0.3) { // 30% chance to switch axis
                this.scrollDirection = this.scrollDirection === 'horizontal' ? 'vertical' : 'horizontal';
            }
        }
        
        // Apply scrolling movement
        const scrollSpeed = this.config.speed * 1.2; // Steady scrolling speed
        
        if (this.scrollDirection === 'horizontal') {
            this.vel.x = this.scrollSign * scrollSpeed;
            this.vel.y *= 0.95; // Slight friction on perpendicular axis
        } else {
            this.vel.y = this.scrollSign * scrollSpeed;
            this.vel.x *= 0.95; // Slight friction on perpendicular axis
        }
    }
    
    circleMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize circle movement properties
        if (this.circleAngle === undefined) {
            this.circleAngle = Math.random() * Math.PI * 2;
            this.circleRadius = 150; // Maintain distance from player
            this.circleDirection = Math.random() < 0.5 ? 1 : -1; // Random clockwise/counterclockwise
        }
        
        // Calculate distance to player
        const dx = this.x - this.targetPlayer.x;
        const dy = this.y - this.targetPlayer.y;
        const distanceToPlayer = Math.hypot(dx, dy);
        
        // Adjust radius based on distance to maintain consistent orbit
        const targetRadius = this.circleRadius;
        const radiusDifference = distanceToPlayer - targetRadius;
        
        // Gradually adjust angle to orbit around player
        this.circleAngle += this.circleDirection * 0.015; // Steady orbital speed
        
        // Calculate ideal orbital position
        const idealX = this.targetPlayer.x + Math.cos(this.circleAngle) * targetRadius;
        const idealY = this.targetPlayer.y + Math.sin(this.circleAngle) * targetRadius;
        
        // Move toward ideal orbital position
        const toIdealX = idealX - this.x;
        const toIdealY = idealY - this.y;
        
        // Apply movement with bomber's slow speed
        const moveSpeed = this.config.speed * 0.8;
        this.vel.x = toIdealX * moveSpeed * 0.05;
        this.vel.y = toIdealY * moveSpeed * 0.05;
        
        // Add slight distance correction if too close or far from player
        if (Math.abs(radiusDifference) > 20) {
            const correctionStrength = 0.02;
            this.vel.x += (dx / distanceToPlayer) * radiusDifference * correctionStrength;
            this.vel.y += (dy / distanceToPlayer) * radiusDifference * correctionStrength;
        }
    }
    
    stationaryMovement() {
        // Turrets are completely stationary - no movement
        this.vel.x = 0;
        this.vel.y = 0;
        
        // Turrets still rotate to face the player for aiming
        if (this.targetPlayer) {
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            this.targetFaceAngle = Math.atan2(dy, dx);
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
        
        // Add line-of-sight avoidance
        this.avoidPlayerLineOfSight();
    }
    
    avoidPlayerLineOfSight() {
        if (!this.targetPlayer) return;
        
        // Calculate angle from player to enemy
        const dx = this.x - this.targetPlayer.x;
        const dy = this.y - this.targetPlayer.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0 && distance < 200) { // Only avoid when relatively close
            // Calculate if we're in the player's potential line of fire
            const angleToEnemy = Math.atan2(dy, dx);
            
            // Add evasive movement perpendicular to line of sight
            const perpAngle = angleToEnemy + Math.PI / 2;
            const avoidanceStrength = 0.3 * (200 - distance) / 200; // Stronger when closer
            
            // Randomly choose left or right evasion, but be consistent for a while
            if (!this.evasionDirection || Math.random() < 0.01) { // Change direction occasionally
                this.evasionDirection = Math.random() < 0.5 ? 1 : -1;
            }
            
            this.vel.x += Math.cos(perpAngle) * avoidanceStrength * this.evasionDirection;
            this.vel.y += Math.sin(perpAngle) * avoidanceStrength * this.evasionDirection;
        }
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
    
    addFishLikeMovement() {
        // Fish-like swimming motion with undulating body movement
        const time = Date.now() * 0.001; // Convert to seconds
        const fishId = this.x + this.y; // Unique phase offset for each enemy
        
        // Calculate current movement direction
        const currentAngle = Math.atan2(this.vel.y, this.vel.x);
        const speed = Math.hypot(this.vel.x, this.vel.y);
        
        if (speed > 0.1) { // Only apply fish movement when actually moving
            // Undulating side-to-side motion perpendicular to movement direction
            const undulationFrequency = 3.0; // How fast the fish "swims"
            const undulationAmplitude = 0.15; // How much side-to-side motion
            
            // Create undulation based on time and unique fish ID
            const undulation = Math.sin(time * undulationFrequency + fishId) * undulationAmplitude;
            
            // Calculate perpendicular direction to current movement
            const perpAngle = currentAngle + Math.PI / 2;
            
            // Apply undulating motion perpendicular to movement direction
            this.vel.x += Math.cos(perpAngle) * undulation;
            this.vel.y += Math.sin(perpAngle) * undulation;
            
            // Add slight forward pulsing (like fish tail propulsion)
            const propulsionFrequency = 4.0;
            const propulsionAmplitude = 0.08;
            const propulsion = Math.sin(time * propulsionFrequency + fishId) * propulsionAmplitude;
            
            this.vel.x += Math.cos(currentAngle) * propulsion;
            this.vel.y += Math.sin(currentAngle) * propulsion;
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
        if (!gameEngine.enemyBulletPool) return;
        if (!this.targetPlayer) return;
        
        const playerDistance = Math.hypot(this.x - this.targetPlayer.x, this.y - this.targetPlayer.y);
        const maxShootingRange = this.getTerritorySize() * 1.5;
        
        if (playerDistance > maxShootingRange) return;
        
        // Check line of sight - don't shoot if player is blocked by asteroids
        if (!this.hasLineOfSight(this.targetPlayer, gameEngine)) return;
        
        const now = Date.now();
        
        // Handle burst patterns (only burst_3 now, line_4 shoots all at once)
        if (this.config.shootPattern === 'burst_3') {
            this.handleBurstShooting(gameEngine, now);
        } else {
            // Handle non-burst patterns (circle_6, homing, etc.)
            const shootInterval = 1000 / this.config.shootRate;
        if (now - this.lastShot > shootInterval) {
            this.shoot(gameEngine);
            this.lastShot = now;
                
                // Start cooldown timer for turrets
                if (this.config.movePattern === 'stationary') {
                    this.cooldownTimer.isActive = true;
                    this.cooldownTimer.startTime = now;
                    this.cooldownTimer.duration = shootInterval;
                }
            }
        }
    }
    
    handleBurstShooting(gameEngine, now) {
        // Check if we're in cooldown
        if (now < this.burstState.cooldownUntil) {
            return;
        }
        
        // Start new burst if not active
        if (!this.burstState.active) {
            this.burstState.active = true;
            this.burstState.shotsRemaining = this.config.shootPattern === 'burst_3' ? 3 : 4;
            this.burstState.shotDelay = this.config.shootPattern === 'burst_3' ? 150 : 100; // ms between shots in burst
            this.burstState.lastBurstShot = 0;
        }
        
        // Fire shots in burst
        if (this.burstState.shotsRemaining > 0 && now - this.burstState.lastBurstShot > this.burstState.shotDelay) {
            this.shoot(gameEngine);
            this.burstState.shotsRemaining--;
            this.burstState.lastBurstShot = now;
            
            // End burst and start cooldown
            if (this.burstState.shotsRemaining <= 0) {
                this.burstState.active = false;
                this.burstState.cooldownUntil = now + (this.config.shootPattern === 'burst_3' ? 2000 : 1500); // Cooldown period
            }
        }
    }
    
    shoot(gameEngine) {
        // Only shoot at the player
        if (!this.targetPlayer) return;
        
        const targetX = this.targetPlayer.x;
        const targetY = this.targetPlayer.y;
        
        switch (this.config.shootPattern) {
            case 'burst_3':
                this.shootBurst3(gameEngine, targetX, targetY);
                break;
            case 'line_4':
                this.shootLine4(gameEngine, targetX, targetY);
                break;
            case 'circle_6':
                this.shootCircle6(gameEngine, targetX, targetY);
                break;
            case 'homing':
                this.shootHoming(gameEngine, targetX, targetY);
                break;
            // Keep existing patterns for other enemies
            case 'spread':
                this.shootSpread(gameEngine, targetX, targetY);
                break;
            case 'laser':
                this.shootLaser(gameEngine, targetX, targetY);
                break;
            case 'missile':
                this.shootMissile(gameEngine, targetX, targetY);
                break;
            case 'pulse':
                this.shootPulse(gameEngine, targetX, targetY);
                break;
            case 'shield_burst':
                this.shootShieldBurst(gameEngine, targetX, targetY);
                break;
            default:
                this.shootAimed(gameEngine, targetX, targetY);
                break;
        }
    }
    
    shootAimed(gameEngine, targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.createEnemyBullet(gameEngine, angle, 3, this.color, false, 'aimed');
    }
    
    shootSpread(gameEngine, targetX, targetY) {
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Single bullet with spreading movement pattern
        this.createEnemyBullet(gameEngine, baseAngle, 2.5, this.color, false, 'spread');
    }
    
    shootRapid(gameEngine, targetX, targetY) {
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Single bullet with rapid/erratic movement pattern
        this.createEnemyBullet(gameEngine, angle, 4, this.color, false, 'rapid');
    }
    
    shootSpiral(gameEngine, targetX, targetY) {
        if (!this.spiralAngle) this.spiralAngle = 0;
        this.spiralAngle += 0.3;
        
        // Single bullet with spiral movement pattern
        this.createEnemyBullet(gameEngine, this.spiralAngle, 2, this.color, false, 'spiral');
    }
    
    shootBurst(gameEngine, targetX, targetY) {
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Single bullet with burst/explosive movement pattern
        this.createEnemyBullet(gameEngine, baseAngle, 2, this.color, false, 'burst');
    }
    
    shootExplosive(gameEngine, targetX, targetY) {
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Single explosive bullet with unique movement pattern
        this.createEnemyBullet(gameEngine, angle, 2.5, this.color, true, 'explosive');
    }
    
    shootLaser(gameEngine, targetX, targetY) {
        // Laser turret needs charging - only shoot when fully charged
        if (!this.laserCharge) {
            this.laserCharge = 0;
            this.laserCharging = false;
        }
        
        if (!this.laserCharging) {
            // Start charging
            this.laserCharging = true;
            this.laserChargeStartTime = Date.now();
            return;
        }
        
        const chargeTime = Date.now() - this.laserChargeStartTime;
        const maxChargeTime = 2000; // 2 seconds to charge
        this.laserCharge = Math.min(1, chargeTime / maxChargeTime);
        
        if (this.laserCharge >= 1) {
            // Fire powerful laser beam
            const angle = Math.atan2(targetY - this.y, targetX - this.x);
            this.createEnemyBullet(gameEngine, angle, 5, '#00ffff', false, 'laser');
            
            // Reset charging
            this.laserCharging = false;
            this.laserCharge = 0;
        }
    }
    
    shootMissile(gameEngine, targetX, targetY) {
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Create homing missile
        this.createEnemyBullet(gameEngine, angle, 2, '#ff00ff', true, 'missile');
    }
    
    shootPulse(gameEngine, targetX, targetY) {
        // Fire 3 rapid pulses
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (this.active) {
                    this.createEnemyBullet(gameEngine, baseAngle, 4, '#ffff00', false, 'pulse');
                }
            }, i * 100); // 100ms between pulses
        }
    }
    
    shootShieldBurst(gameEngine, targetX, targetY) {
        // Fire 5 bullets in a spread pattern
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        const spread = Math.PI / 6; // 30 degree spread
        
        for (let i = 0; i < 5; i++) {
            const angle = baseAngle + (i - 2) * (spread / 4);
            this.createEnemyBullet(gameEngine, angle, 3, '#00ff00', false, 'shield_burst');
        }
    }
    
    // New shooting patterns
    shootBurst3(gameEngine, targetX, targetY) {
        // Red triangles - single aimed shot (burst handled by updateShooting)
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.createEnemyBullet(gameEngine, angle, 4, '#ff4444', false, 'aimed');
    }
    
    shootLine4(gameEngine, targetX, targetY) {
        // Yellow squares - horizontal plane of 4 shots
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const baseAngle = Math.atan2(dy, dx);
        
        // Create 4 shots in a horizontal spread
        const spreadAngle = Math.PI / 8; // 22.5 degrees spread between shots
        const angles = [
            baseAngle - spreadAngle * 1.5,  // Far left
            baseAngle - spreadAngle * 0.5,  // Left
            baseAngle + spreadAngle * 0.5,  // Right
            baseAngle + spreadAngle * 1.5   // Far right
        ];
        
        // Fire all 4 shots simultaneously
        angles.forEach(angle => {
            this.createEnemyBullet(gameEngine, angle, 3.5, '#ffff44', false, 'aimed');
        });
    }
    
    shootCircle6(gameEngine, targetX, targetY) {
        // Titans - fire 6 shots in a circle
        const angleStep = (Math.PI * 2) / 6; // 60 degrees between shots
        
        for (let i = 0; i < 6; i++) {
            const angle = i * angleStep;
            this.createEnemyBullet(gameEngine, angle, 2.5, '#ff44ff', false, 'aimed');
        }
    }
    
    shootHoming(gameEngine, targetX, targetY) {
        // Bombers - slow homing shot
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.createEnemyBullet(gameEngine, angle, 1.5, '#ff8844', false, 'homing', this.targetPlayer);
    }
    
    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) {
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
            
            // For homing missiles and homing shots, provide player reference
            if (movementPattern === 'missile' || movementPattern === 'homing') {
                bullet.targetPlayer = target || this.targetPlayer;
            }
            
            // Enemy shooting sounds removed to reduce audio confusion
        }
    }
    

    
    draw(ctx) {
        if (!this.active) return;
        
        // Draw light trail first (behind enemy)
        this.drawLightTrail(ctx);
        
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
        
        // Draw cooldown timer for turrets (outside of transform)
        if (this.config.movePattern === 'stationary') {
            this.drawCooldownTimer(ctx);
        }
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
                this.drawSquare(ctx);
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
            case 'LASER_TURRET':
                this.drawLaserTurret(ctx);
                break;
            case 'MISSILE_TURRET':
                this.drawMissileTurret(ctx);
                break;
            case 'PULSE_TURRET':
                this.drawPulseTurret(ctx);
                break;
            case 'SHIELD_TURRET':
                this.drawShieldTurret(ctx);
                break;
            default:
                this.drawTriangle(ctx);
        }
        
        // Draw red aiming triangle for all enemy types (except turrets which have their own indicators)
        if (this.config.movePattern !== 'stationary') {
            this.drawAimingTriangle(ctx);
        }
    }
    
    drawAimingTriangle(ctx) {
        // Draw a white triangle pointing outward with arrow line
        const size = this.radius * 0.3; // Slightly larger triangle
        
        ctx.save();
        
        // Calculate aiming angle (toward player if targeting)
        let aimAngle = 0;
        if (this.targetPlayer && this.targetPlayer.active) {
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            aimAngle = Math.atan2(dy, dx) - this.faceAngle; // Relative to enemy's facing direction
        }
        
        ctx.rotate(aimAngle);
        
        // Draw white triangle pointing outward
        ctx.beginPath();
        ctx.moveTo(size, 0); // Point forward
        ctx.lineTo(-size * 0.5, -size * 0.5); // Left back
        ctx.lineTo(-size * 0.5, size * 0.5); // Right back
        ctx.closePath();
        
        ctx.fillStyle = '#ffffff'; // White color
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        
        // Draw arrow line extending from the bottom of the triangle
        ctx.beginPath();
        ctx.moveTo(-size * 0.5, 0); // Start from bottom center of triangle
        ctx.lineTo(-size * 1.2, 0); // Extend backward to create arrow shaft
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
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
    }
    
    drawSquare(ctx) {
        // Defensive square
        const size = this.radius * 0.7;
        ctx.beginPath();
        ctx.rect(-size, -size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
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
    }
    
    drawLaserTurret(ctx) {
        // Laser turret - crystalline structure with charging indicator
        const size = this.radius * 0.8;
        
        // Base platform
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Laser barrel
        ctx.beginPath();
        ctx.rect(-size * 0.2, -size * 0.1, size * 1.2, size * 0.2);
        ctx.fill();
        ctx.stroke();
        
        // Charging indicator
        if (this.laserCharging && this.laserCharge) {
            const chargeGlow = this.laserCharge;
            ctx.fillStyle = `rgba(0, 255, 255, ${chargeGlow})`;
            ctx.beginPath();
            ctx.arc(size * 0.8, 0, 3 + chargeGlow * 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawMissileTurret(ctx) {
        // Missile turret - angular launcher with missile pods
        const size = this.radius * 0.8;
        
        // Base
        ctx.beginPath();
        ctx.rect(-size, -size * 0.6, size * 2, size * 1.2);
        ctx.fill();
        ctx.stroke();
        
        // Missile pods
        for (let i = -1; i <= 1; i += 2) {
            ctx.beginPath();
            ctx.rect(size * 0.2, i * size * 0.3, size * 0.6, size * 0.2);
            ctx.fill();
            ctx.stroke();
        }
        
        // Targeting array
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(size * 0.8, 0, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawPulseTurret(ctx) {
        // Pulse turret - rapid-fire energy cannon
        const size = this.radius * 0.8;
        
        // Base ring
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Energy chambers (3 barrels)
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * size * 0.5;
            const y = Math.sin(angle) * size * 0.5;
            
            ctx.beginPath();
            ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        
        // Central energy core
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawShieldTurret(ctx) {
        // Shield turret - defensive barrier generator
        const size = this.radius * 0.8;
        
        // Hexagonal base
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * size;
            const y = Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Shield projectors
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const x = Math.cos(angle) * size * 0.7;
            const y = Math.sin(angle) * size * 0.7;
            
            ctx.fillStyle = '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
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
    
    drawLightTrail(ctx) {
        if (this.trail.positions.length < 2) return;
        
        ctx.save();
        
        const now = Date.now();
        
        // Draw trail as connected line segments with fading opacity
        for (let i = 1; i < this.trail.positions.length; i++) {
            const prevPoint = this.trail.positions[i - 1];
            const currentPoint = this.trail.positions[i];
            
            // Calculate fade based on age
            const age = now - currentPoint.age;
            const fadeRatio = 1 - (age / this.trail.fadeTime);
            const opacity = Math.max(0, fadeRatio * 0.8); // Max 80% opacity
            
            if (opacity <= 0) continue;
            
            // Create gradient from previous to current point
            const gradient = ctx.createLinearGradient(
                prevPoint.x, prevPoint.y,
                currentPoint.x, currentPoint.y
            );
            
            const prevAge = now - prevPoint.age;
            const prevFadeRatio = 1 - (prevAge / this.trail.fadeTime);
            const prevOpacity = Math.max(0, prevFadeRatio * 0.8);
            
            gradient.addColorStop(0, `rgba(255, 255, 255, ${prevOpacity})`);
            gradient.addColorStop(1, `rgba(255, 255, 255, ${opacity})`);
            
            // Draw trail segment
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3 * fadeRatio; // Thinner as it fades
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
            
            // Add glow effect
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 8 * fadeRatio;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        ctx.restore();
    }
    
    drawHealthBar(ctx) {
        if (this.health >= this.maxHealth) return;
        
        ctx.save();
        
        // Make bar longer to accommodate level display
        const barWidth = this.radius * 2.2; // Increased from 1.8 to 2.2
        const barHeight = 3;
        const barY = this.y - this.radius - 18;

        // Health number and level text setup
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Bright gold for health number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Round up health display when between 0-1 to show 1 HP
        const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
        const healthNumber = `${displayHealth}/${Math.round(this.maxHealth)}`;
        const numberY = barY - 6;
        
        // Measure text widths for proper centering
        const healthWidth = ctx.measureText(healthNumber).width;
        const levelText = `LV${this.level || 1}`;
        const levelWidth = ctx.measureText(levelText).width;
        const spacing = 8; // Space between level and health
        
        // Calculate total width of combined LV + HP text
        const totalTextWidth = levelWidth + spacing + healthWidth;
        
        // Center the health bar under the combined text
        const barX = this.x - barWidth / 2;
        const textCenterX = this.x; // Center the combined text over the enemy
        
        // Calculate positions for level and health text
        const levelX = textCenterX - (totalTextWidth / 2);
        const numberX = levelX + levelWidth + spacing + (healthWidth / 2);
        
        // Draw level text in light blue
        ctx.fillStyle = '#88ccff'; // Light blue color
        ctx.textAlign = 'left';
        ctx.strokeText(levelText, levelX, numberY);
        ctx.fillText(levelText, levelX, numberY);
        
        // Draw health number outline first, then fill
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.strokeText(healthNumber, numberX, numberY);
        ctx.fillText(healthNumber, numberX, numberY);

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



        ctx.restore();
    }
    
    drawCooldownTimer(ctx) {
        if (!this.cooldownTimer.isActive) return;
        
        const now = Date.now();
        const elapsed = now - this.cooldownTimer.startTime;
        const progress = Math.min(elapsed / this.cooldownTimer.duration, 1);
        
        // Deactivate timer when complete
        if (progress >= 1) {
            this.cooldownTimer.isActive = false;
            return;
        }
        
        ctx.save();
        
        // Position at enemy center
        const centerX = this.x;
        const centerY = this.y;
        const radius = this.radius * 0.6; // Smaller than enemy
        
        // Color transition: blue -> orange -> red
        let color;
        if (progress < 0.33) {
            // Blue to orange (0 to 0.33)
            const t = progress / 0.33;
            const r = Math.floor(0 + (255 - 0) * t);
            const g = Math.floor(100 + (165 - 100) * t);
            const b = Math.floor(255 + (0 - 255) * t);
            color = `rgb(${r}, ${g}, ${b})`;
        } else if (progress < 0.66) {
            // Orange to red (0.33 to 0.66)
            const t = (progress - 0.33) / 0.33;
            const r = Math.floor(255 + (255 - 255) * t);
            const g = Math.floor(165 + (0 - 165) * t);
            const b = Math.floor(0 + (0 - 0) * t);
            color = `rgb(${r}, ${g}, ${b})`;
        } else {
            // Stay red (0.66 to 1)
            color = 'rgb(255, 0, 0)';
        }
        
        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw progress arc
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
        ctx.stroke();
        
        // Add glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        ctx.restore();
    }
    
    hasLineOfSight(target, gameEngine) {
        if (!target || !gameEngine) return false;
        
        // Calculate line from enemy to target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        // If target is very close, always have line of sight
        if (distance < 50) return true;
        
        // Cache line-of-sight check for performance (check every 100ms)
        const now = Date.now();
        if (this.lastLOSCheck && (now - this.lastLOSCheck < 100) && this.cachedLOSResult !== undefined) {
            return this.cachedLOSResult;
        }
        
        // Normalize direction vector
        const dirX = dx / distance;
        const dirY = dy / distance;
        
        // Adaptive step size based on distance - fewer checks for longer distances
        const stepSize = Math.min(25, Math.max(15, distance / 20));
        const steps = Math.floor(distance / stepSize);
        
        for (let i = 1; i < steps; i++) {
            const checkX = this.x + (dirX * stepSize * i);
            const checkY = this.y + (dirY * stepSize * i);
            
            // Check if this point intersects with any active asteroid
            for (const asteroid of gameEngine.asteroidPool.activeObjects) {
                if (!asteroid.active) continue;
                
                const astDx = checkX - asteroid.x;
                const astDy = checkY - asteroid.y;
                const astDistance = Math.hypot(astDx, astDy);
                
                // If line passes through asteroid, no line of sight
                if (astDistance < asteroid.radius) {
                    this.lastLOSCheck = now;
                    this.cachedLOSResult = false;
                    return false;
                }
            }
            
            // Check if this point intersects with any other active enemy (larger enemies only)
            for (const enemy of gameEngine.enemyPool.activeObjects) {
                if (!enemy.active || enemy === this || enemy.radius < 25) continue; // Skip self and small enemies
                
                const enemyDx = checkX - enemy.x;
                const enemyDy = checkY - enemy.y;
                const enemyDistance = Math.hypot(enemyDx, enemyDy);
                
                // If line passes through another large enemy, no line of sight
                if (enemyDistance < enemy.radius) {
                    this.lastLOSCheck = now;
                    this.cachedLOSResult = false;
                    return false;
                }
            }
        }
        
        // Cache the result
        this.lastLOSCheck = now;
        this.cachedLOSResult = true;
        return true; // No obstacles found
    }
    
    takeDamage(damage) {
        this.health -= damage;
        
        // Safeguard: clamp health between 0 and maxHealth
        this.health = Math.max(0, Math.min(this.health, this.maxHealth));
        
        // Use small tolerance for floating-point precision issues
        return this.health <= 0.001;
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