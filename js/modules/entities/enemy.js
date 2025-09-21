// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG, ENEMY_BULLET_CONFIG } from '../constants.js';
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
        size: 38,
        shootPattern: 'crescent_wave',
        shootRate: 0.25, // Very long cooldown - 4 second intervals between attacks
        movePattern: 'square',     // Square geometric movement
        points: 75
    },
    WASP: {
        name: 'Wasp',
        color: '#ffff44',        // Yellow
        health: 10,              // Reduced to 10 - fast but fragile
        speed: 2.2,              // Quick and agile like a real wasp
        size: 28,                // Increased from 18
        shootPattern: 'pulse', // Three-round bursts
        shootRate: 0.6,          // Slower rate with time between bursts
        movePattern: 'wasp_dart',   // Fast darting movement like triangles but more frequent
        points: 35
    },
    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 20,              // Reduced to 20 - boss-like but not overwhelming
        speed: 0.8,              // Tank movement speed
        size: 45,
        shootPattern: 'missile', // Tank missiles with weak homing
        shootRate: 0.6,          // Slower rate for powerful missiles
        movePattern: 'tank',          // Tank-like movement: rotate, move, stop, repeat
        points: 100
    },
    STALKER: {
        name: 'Stalker',
        color: '#44ffff',        // Cyan
        health: 14,              // Reduced to 14 - stealthy but not too tanky
        speed: 2.5,              // Higher speed for swooping arcs
        size: 30,
        shootPattern: 'charged_laser',
        shootRate: 0.3,          // Slower rate for powerful laser attacks
        movePattern: 'arc',      // Arc swooping movement
        points: 45
    },
    TANGERINE_BOMBER: {
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
    DRIFTER: {
        name: 'Drifter',
        color: '#00ffff',        // Cyan
        health: 16,              // Reduced to 16 - durable but mobile
        speed: 0.8,              // Slow, methodical movement
        size: 30,
        shootPattern: 'laser',
        shootRate: 0.3,          // Increased rate - still slow but more responsive
        movePattern: 'patrol',   // Slow patrol movement
        points: 80
    },
    PROWLER: {
        name: 'Prowler',
        color: '#ff00ff',        // Magenta
        health: 15,              // Reduced to 15 - medium durability
        speed: 0.8,              // Slower speed for better positioning
        size: 28,
        shootPattern: 'missile',
        shootRate: 0.6,          // Increased rate for more consistent firing
        movePattern: 'circle',   // Circular movement pattern
        points: 90
    },
    WEAVER: {
        name: 'Weaver',
        color: '#ffff00',        // Yellow
        health: 12,              // Reduced to 12 - lighter but agile
        speed: 1.8,              // Fast and agile
        size: 25,
        shootPattern: 'pulse',
        shootRate: 1.0,          // Increased rate for pulse turret rapid fire
        movePattern: 'swarm',    // Swarm movement for agility
        points: 70
    },
    SENTINEL: {
        name: 'Sentinel',
        color: '#00ff00',        // Green
        health: 18,              // Reduced to 18 - very durable
        speed: 0.6,              // Very slow but steady
        size: 32,
        shootPattern: 'shield_burst',
        shootRate: 0.7,          // Increased rate for shield turret
        movePattern: 'slow_orbit', // Slow orbital movement
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
        
        // Cooldown timer removed - all enemies are now mobile
        
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
            case 'zigzag':
                this.zigzagMovement();
                break;
            case 'tactical_hover':
                this.tacticalHoverMovement();
                break;
            case 'wasp_dart':
                this.waspDartMovement();
                break;
            case 'hexagon':
                this.hexagonMovement();
                break;
            case 'tank':
                this.tankMovement();
                break;
            case 'arc':
                this.arcMovement();
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
        
        // Initialize orbital state for Shield Turret
        if (this.type === 'SENTINEL') {
            if (this.orbitalState === undefined) {
                this.orbitalState = 'moving'; // 'moving', 'stopping', 'firing'
                this.orbitalTimer = 0;
                this.orbitalStopDuration = 800; // 0.8 seconds stopped before firing
            }
            
            this.orbitalTimer += 16; // Assume 60fps
            
            // Shield Turret specific behavior - larger orbit, slower movement, stops to fire
            this.orbitalAngle += 0.008; // Much slower orbit
            const baseOrbitRadius = 280; // Larger orbit radius
            const radiusVariation = Math.sin(Date.now() * 0.002) * 30; // Smaller variation
            const orbitRadius = baseOrbitRadius + radiusVariation;
            
            const targetX = this.targetPlayer.x + Math.cos(this.orbitalAngle) * orbitRadius;
            const targetY = this.targetPlayer.y + Math.sin(this.orbitalAngle) * orbitRadius;
            
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            
            switch (this.orbitalState) {
                case 'moving':
                    // Slow orbital movement
                    const acceleration = 0.008; // Much slower acceleration
                    this.vel.x = dx * acceleration;
                    this.vel.y = dy * acceleration;
                    
                    // Check if it's time to stop and fire
                    if (this.orbitalTimer >= 3000) { // Stop every 3 seconds
                        this.orbitalState = 'stopping';
                        this.orbitalTimer = 0;
                    }
                    break;
                    
                case 'stopping':
                    // Come to a complete stop
                    this.vel.x *= 0.85;
                    this.vel.y *= 0.85;
                    
                    if (this.orbitalTimer >= this.orbitalStopDuration) {
                        this.orbitalState = 'moving';
                        this.orbitalTimer = 0;
                    }
                    break;
            }
        } else {
            // Original orbital movement for other enemies
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
            case 'TANGERINE_BOMBER': return avgScreenSize * 1.6; // Large territory ~1.6 screen sizes
            case 'GUARDIAN': return avgScreenSize * 1.4; // Medium-large territory ~1.4 screen sizes
            case 'HUNTER': return avgScreenSize * 1.2; // Medium territory ~1.2 screen sizes
            case 'STALKER': return avgScreenSize * 1.0; // Smaller territory ~1 screen size
            case 'WASP': return avgScreenSize * 0.8; // Small territory ~0.8 screen sizes
            // Turrets have smaller territories since they're stationary
            case 'DRIFTER': return avgScreenSize * 1.0; // Medium range for laser
            case 'PROWLER': return avgScreenSize * 1.2; // Longer range for missiles
            case 'WEAVER': return avgScreenSize * 0.8; // Shorter range for rapid fire
            case 'SENTINEL': return avgScreenSize * 0.9; // Medium-short range
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
    
    tankMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize tank movement properties
        if (this.tankState === undefined) {
            this.tankState = 'moving'; // 'moving', 'aiming', 'firing', 'rotating'
            this.tankTimer = 0;
            this.tankMoveDuration = 1500; // 1.5 seconds of straight movement (faster)
            this.tankAimDuration = 500; // 0.5 seconds to aim turret (faster)
            this.tankFiringDuration = 800; // 0.8 seconds firing window (longer firing)
            this.tankRotationDuration = 300; // 0.3 seconds to rotate hull (faster)
            
            // Separate hull and turret angles
            this.tankHullAngle = Math.random() * Math.PI * 2; // Random initial direction
            this.tankTurretAngle = 0;
            this.tankTurretTargetAngle = 0;
            this.tankTurretStartAngle = 0;
            this.tankHullStartAngle = 0;
            this.tankHullTargetAngle = 0;
        }
        
        this.tankTimer += 16; // Assume 60fps
        
        switch (this.tankState) {
            case 'moving':
                // Move in straight line bursts at constant speed
                const moveSpeed = this.config.speed * 1.8; // Fast burst movement
                this.vel.x = Math.cos(this.tankHullAngle) * moveSpeed;
                this.vel.y = Math.sin(this.tankHullAngle) * moveSpeed;
                
                if (this.tankTimer >= this.tankMoveDuration) {
                    // Sudden stop and start aiming
                    this.tankState = 'aiming';
                    this.tankTimer = 0;
                    this.tankTurretStartAngle = this.tankTurretAngle;
                }
                break;
                
            case 'aiming':
                // Come to sudden stop
                this.vel.x *= 0.7; // Quick deceleration
                this.vel.y *= 0.7;
                
                // Calculate turret target angle toward player with 120° rotation limit
                const dx = this.targetPlayer.x - this.x;
                const dy = this.targetPlayer.y - this.y;
                const desiredAngle = Math.atan2(dy, dx);
                
                // Limit turret rotation to ±60° from hull direction
                const maxTurretOffset = Math.PI / 3; // 60 degrees
                const hullAngle = this.tankHullAngle;
                
                // Calculate relative angle from hull direction
                let relativeAngle = desiredAngle - hullAngle;
                if (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
                if (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
                
                // Clamp to ±60° range
                relativeAngle = Math.max(-maxTurretOffset, Math.min(maxTurretOffset, relativeAngle));
                this.tankTurretTargetAngle = hullAngle + relativeAngle;
                
                // Smoothly rotate turret toward target with easing
                const aimProgress = this.tankTimer / this.tankAimDuration;
                if (aimProgress >= 1) {
                    this.tankTurretAngle = this.tankTurretTargetAngle;
                    this.tankState = 'firing';
                    this.tankTimer = 0;
                } else {
                    // Smooth interpolation with easing
                    const easedProgress = 1 - Math.pow(1 - aimProgress, 3); // Ease-out cubic
                    const angleDiff = this.tankTurretTargetAngle - this.tankTurretStartAngle;
                    let adjustedAngleDiff = angleDiff;
                    if (adjustedAngleDiff > Math.PI) adjustedAngleDiff -= Math.PI * 2;
                    if (adjustedAngleDiff < -Math.PI) adjustedAngleDiff += Math.PI * 2;
                    
                    this.tankTurretAngle = this.tankTurretStartAngle + adjustedAngleDiff * easedProgress;
                }
                break;
                
            case 'firing':
                // Stay completely still while firing
                this.vel.x *= 0.9;
                this.vel.y *= 0.9;
                
                // Keep turret aimed at player within rotation limits
                const fireDx = this.targetPlayer.x - this.x;
                const fireDy = this.targetPlayer.y - this.y;
                const fireDesiredAngle = Math.atan2(fireDy, fireDx);
                
                // Apply same rotation limits during firing
                const fireMaxTurretOffset = Math.PI / 3; // 60 degrees
                const fireHullAngle = this.tankHullAngle;
                
                let fireRelativeAngle = fireDesiredAngle - fireHullAngle;
                if (fireRelativeAngle > Math.PI) fireRelativeAngle -= Math.PI * 2;
                if (fireRelativeAngle < -Math.PI) fireRelativeAngle += Math.PI * 2;
                
                fireRelativeAngle = Math.max(-fireMaxTurretOffset, Math.min(fireMaxTurretOffset, fireRelativeAngle));
                this.tankTurretAngle = fireHullAngle + fireRelativeAngle;
                
                if (this.tankTimer >= this.tankFiringDuration) {
                    // Start rotation to new direction
                    this.tankState = 'rotating';
                    this.tankTimer = 0;
                    
                    // Choose new movement direction that's compatible with turret position
                    // Hull should face roughly the same direction as turret (within ±120°)
                    const currentTurretAngle = this.tankTurretAngle;
                    const maxHullOffset = Math.PI * 2/3; // 120 degrees
                    const randomOffset = (Math.random() - 0.5) * maxHullOffset * 2;
                    
                    this.tankHullStartAngle = this.tankHullAngle;
                    this.tankHullTargetAngle = currentTurretAngle + randomOffset;
                }
                break;
                
            case 'rotating':
                // Stay still while rotating hull and turret together
                this.vel.x *= 0.9;
                this.vel.y *= 0.9;
                
                // Animate hull rotation with easing
                const rotationProgress = this.tankTimer / this.tankRotationDuration;
                if (rotationProgress >= 1) {
                    // Rotation complete, start moving
                    this.tankHullAngle = this.tankHullTargetAngle;
                    this.tankTurretAngle = this.tankHullTargetAngle; // Turret follows hull
                    this.tankState = 'moving';
                    this.tankTimer = 0;
                } else {
                    // Smooth interpolation with easing
                    const easedProgress = 1 - Math.pow(1 - rotationProgress, 3); // Ease-out cubic
                    let angleDiff = this.tankHullTargetAngle - this.tankHullStartAngle;
                    
                    // Handle angle wrapping
                    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    this.tankHullAngle = this.tankHullStartAngle + angleDiff * easedProgress;
                    this.tankTurretAngle = this.tankHullAngle; // Turret rotates with hull
                }
                break;
        }
        
        // Update visual rotation for drawing (hull faces movement direction)
        this.faceAngle = this.tankHullAngle;
        
        // Store turret angle for drawing
        if (!this.tankTurretAngle) this.tankTurretAngle = 0;
    }
    
    arcMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize arc movement properties
        if (this.arcState === undefined) {
            this.arcState = 'swooping'; // 'swooping', 'charging', 'firing'
            this.arcTimer = 0;
            this.arcSwoopDuration = 3000; // 3 seconds of swooping
            this.arcChargeDuration = 1200; // 1.2 seconds to charge laser
            this.arcFiringDuration = 800; // 0.8 seconds firing window
            
            // Arc parameters
            this.arcCenter = { x: this.x, y: this.y };
            this.arcRadius = 120 + Math.random() * 80; // 120-200 radius
            this.arcStartAngle = Math.random() * Math.PI * 2;
            this.arcSweepDirection = Math.random() > 0.5 ? 1 : -1; // Clockwise or counter-clockwise
            this.arcSweepSpeed = 0.8 + Math.random() * 0.4; // 0.8-1.2 radians per second
            
            // Laser charging properties
            this.laserCharging = false;
            this.laserChargeProgress = 0;
            this.canShoot = false;
        }
        
        this.arcTimer += 16; // Assume 60fps
        
        switch (this.arcState) {
            case 'swooping':
                this.canShoot = false; // Cannot shoot while swooping
                
                // Update arc center to slowly follow player
                const centerFollowSpeed = 0.02;
                this.arcCenter.x += (this.targetPlayer.x - this.arcCenter.x) * centerFollowSpeed;
                this.arcCenter.y += (this.targetPlayer.y - this.arcCenter.y) * centerFollowSpeed;
                
                // Calculate current position on arc
                const arcProgress = (this.arcTimer / this.arcSwoopDuration);
                const currentAngle = this.arcStartAngle + (this.arcSweepDirection * this.arcSweepSpeed * arcProgress * 2 * Math.PI);
                
                // Target position on arc
                const targetX = this.arcCenter.x + Math.cos(currentAngle) * this.arcRadius;
                const targetY = this.arcCenter.y + Math.sin(currentAngle) * this.arcRadius;
                
                // Move toward arc position with swooping speed
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance > 0) {
                    const swoopSpeed = this.config.speed * 1.2; // Fast swooping
                    this.vel.x = (dx / distance) * swoopSpeed;
                    this.vel.y = (dy / distance) * swoopSpeed;
                    
                    // Face movement direction for swooping
                    this.faceAngle = Math.atan2(dy, dx);
                }
                
                if (this.arcTimer >= this.arcSwoopDuration) {
                    this.arcState = 'charging';
                    this.arcTimer = 0;
                    this.laserCharging = true;
                    this.laserChargeProgress = 0;
                }
                break;
                
            case 'charging':
                // Come to a complete stop and charge laser
                this.vel.x *= 0.8;
                this.vel.y *= 0.8;
                
                // Smoothly aim at player while charging
                const chargeDx = this.targetPlayer.x - this.x;
                const chargeDy = this.targetPlayer.y - this.y;
                const targetAngle = Math.atan2(chargeDy, chargeDx);
                
                // Smooth rotation animation
                let angleDiff = targetAngle - this.faceAngle;
                if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                const rotationSpeed = 0.08; // Smooth rotation speed
                this.faceAngle += angleDiff * rotationSpeed;
                
                // Update charge progress
                this.laserChargeProgress = Math.min(this.arcTimer / this.arcChargeDuration, 1);
                
                if (this.arcTimer >= this.arcChargeDuration) {
                    this.arcState = 'firing';
                    this.arcTimer = 0;
                    this.canShoot = true; // Enable shooting
                    this.laserCharging = false;
                }
                break;
                
            case 'firing':
                // Stay completely still while firing
                this.vel.x *= 0.9;
                this.vel.y *= 0.9;
                
                // Keep aiming at player
                const fireDx = this.targetPlayer.x - this.x;
                const fireDy = this.targetPlayer.y - this.y;
                this.faceAngle = Math.atan2(fireDy, fireDx);
                
                if (this.arcTimer >= this.arcFiringDuration) {
                    // Prepare for next arc
                    this.arcState = 'swooping';
                    this.arcTimer = 0;
                    this.canShoot = false;
                    this.laserCharging = false;
                    this.laserChargeProgress = 0;
                    
                    // Generate new arc parameters
                    this.arcRadius = 120 + Math.random() * 80;
                    this.arcStartAngle = Math.atan2(this.y - this.targetPlayer.y, this.x - this.targetPlayer.x); // Start from current relative position
                    this.arcSweepDirection = Math.random() > 0.5 ? 1 : -1;
                    this.arcSweepSpeed = 0.8 + Math.random() * 0.4;
                }
                break;
        }
    }
    
    zigzagMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize zigzag movement properties
        if (this.zigzagState === undefined) {
            this.zigzagState = 'moving';
            this.zigzagTimer = 0;
            this.zigzagDirection = { x: 0, y: 0 };
            this.zigzagChangeInterval = 300 + Math.random() * 400; // 300-700ms between direction changes
            this.zigzagIntensity = 0.8 + Math.random() * 0.4; // 0.8-1.2 intensity
            this.zigzagBaseSpeed = this.config.speed;
        }
        
        this.zigzagTimer += 16; // Assume 60fps
        
        // Change direction randomly like a real wasp/hummingbird
        if (this.zigzagTimer >= this.zigzagChangeInterval) {
            this.zigzagTimer = 0;
            this.zigzagChangeInterval = 300 + Math.random() * 400; // Randomize next interval
            this.zigzagIntensity = 0.8 + Math.random() * 0.4; // Randomize intensity
            
            // Calculate general direction toward player
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance > 0) {
                const baseDirectionX = dx / distance;
                const baseDirectionY = dy / distance;
                
                // Add random zigzag component
                const zigzagAngle = Math.random() * Math.PI * 2;
                const zigzagStrength = 0.6 + Math.random() * 0.8; // 0.6-1.4 strength
                
                // Combine base direction with random zigzag
                this.zigzagDirection.x = baseDirectionX * 0.7 + Math.cos(zigzagAngle) * zigzagStrength;
                this.zigzagDirection.y = baseDirectionY * 0.7 + Math.sin(zigzagAngle) * zigzagStrength;
                
                // Normalize and apply intensity
                const zigzagMagnitude = Math.hypot(this.zigzagDirection.x, this.zigzagDirection.y);
                if (zigzagMagnitude > 0) {
                    this.zigzagDirection.x = (this.zigzagDirection.x / zigzagMagnitude) * this.zigzagIntensity;
                    this.zigzagDirection.y = (this.zigzagDirection.y / zigzagMagnitude) * this.zigzagIntensity;
                }
            }
        }
        
        // Apply zigzag movement with some smoothing
        const smoothing = 0.15; // Smooth transitions between direction changes
        const targetVelX = this.zigzagDirection.x * this.zigzagBaseSpeed;
        const targetVelY = this.zigzagDirection.y * this.zigzagBaseSpeed;
        
        this.vel.x += (targetVelX - this.vel.x) * smoothing;
        this.vel.y += (targetVelY - this.vel.y) * smoothing;
        
        // Add small random jitter for wasp-like twitchiness
        const jitterStrength = 0.1;
        this.vel.x += (Math.random() - 0.5) * jitterStrength;
        this.vel.y += (Math.random() - 0.5) * jitterStrength;
        
        // Face movement direction
        if (Math.hypot(this.vel.x, this.vel.y) > 0.1) {
            this.faceAngle = Math.atan2(this.vel.y, this.vel.x);
        }
        
        // Occasional hover behavior (like hummingbirds)
        if (Math.random() < 0.005) { // 0.5% chance per frame
            this.vel.x *= 0.3;
            this.vel.y *= 0.3;
            this.zigzagTimer = this.zigzagChangeInterval - 100; // Force direction change soon
        }
    }
    
    tacticalHoverMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize tactical hover state
        if (this.tacticalState === undefined) {
            this.tacticalState = 'positioning'; // positioning, hovering, darting
            this.tacticalTimer = 0;
            this.hoverPosition = null;
            this.dartTarget = null;
            this.burstCount = 0;
            this.lastBurstTime = 0;
            this.safeDistance = 180 + Math.random() * 120; // 180-300px safe distance
            this.hoverDuration = 1500 + Math.random() * 1000; // 1.5-2.5s hover time
            this.dartSpeed = this.config.speed * 3.5; // Fast dart speed
        }
        
        this.tacticalTimer += 16; // Assume 60fps
        
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distanceToPlayer = Math.hypot(dx, dy);
        
        switch (this.tacticalState) {
            case 'positioning':
                // Move to a safe distance from player
                if (distanceToPlayer < this.safeDistance) {
                    // Too close - retreat
                    const retreatAngle = Math.atan2(-dy, -dx);
                    this.vel.x += Math.cos(retreatAngle) * 0.3;
                    this.vel.y += Math.sin(retreatAngle) * 0.3;
                } else if (distanceToPlayer > this.safeDistance + 80) {
                    // Too far - approach
                    const approachAngle = Math.atan2(dy, dx);
                    this.vel.x += Math.cos(approachAngle) * 0.2;
                    this.vel.y += Math.sin(approachAngle) * 0.2;
                } else {
                    // Good distance - start hovering
                    this.tacticalState = 'hovering';
                    this.tacticalTimer = 0;
                    this.hoverPosition = { x: this.x, y: this.y };
                    this.burstCount = 0;
                }
                
                // Apply drag to slow down
                this.vel.x *= 0.85;
                this.vel.y *= 0.85;
                break;
                
            case 'hovering':
                // Hover in place with small movements
                if (this.hoverPosition) {
                    const hoverDx = this.hoverPosition.x - this.x;
                    const hoverDy = this.hoverPosition.y - this.y;
                    this.vel.x += hoverDx * 0.02;
                    this.vel.y += hoverDy * 0.02;
                }
                
                // Add small random hover movements
                this.vel.x += (Math.random() - 0.5) * 0.1;
                this.vel.y += (Math.random() - 0.5) * 0.1;
                
                // Apply strong drag for hovering
                this.vel.x *= 0.7;
                this.vel.y *= 0.7;
                
                // Check if it's time to dart away
                if (this.tacticalTimer >= this.hoverDuration || distanceToPlayer < this.safeDistance * 0.7) {
                    this.tacticalState = 'darting';
                    this.tacticalTimer = 0;
                    
                    // Choose dart direction - perpendicular to player direction with some randomness
                    const playerAngle = Math.atan2(dy, dx);
                    const perpAngle = playerAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
                    const randomOffset = (Math.random() - 0.5) * Math.PI * 0.4; // ±36 degrees
                    const dartAngle = perpAngle + randomOffset;
                    
                    const dartDistance = 150 + Math.random() * 100; // 150-250px dart
                    this.dartTarget = {
                        x: this.x + Math.cos(dartAngle) * dartDistance,
                        y: this.y + Math.sin(dartAngle) * dartDistance
                    };
                }
                break;
                
            case 'darting':
                // Dart rapidly to new position
                if (this.dartTarget) {
                    const dartDx = this.dartTarget.x - this.x;
                    const dartDy = this.dartTarget.y - this.y;
                    const dartDistance = Math.hypot(dartDx, dartDy);
                    
                    if (dartDistance > 20) {
                        // Still darting
                        const dartAngle = Math.atan2(dartDy, dartDx);
                        this.vel.x = Math.cos(dartAngle) * this.dartSpeed;
                        this.vel.y = Math.sin(dartAngle) * this.dartSpeed;
                    } else {
                        // Reached dart target - return to positioning
                        this.tacticalState = 'positioning';
                        this.tacticalTimer = 0;
                        this.dartTarget = null;
                        this.hoverPosition = null;
                        this.safeDistance = 180 + Math.random() * 120; // Randomize new safe distance
                        this.hoverDuration = 1500 + Math.random() * 1000; // Randomize new hover duration
                    }
                }
                break;
        }
        
        // Limit maximum speed
        const maxSpeed = this.tacticalState === 'darting' ? this.dartSpeed : this.config.speed;
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
        if (currentSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
        }
    }
    
    waspDartMovement() {
        if (!this.targetPlayer) return;
        
        // Initialize wasp zig-zag attack movement properties
        if (this.waspAttackState === undefined) {
            this.waspAttackState = 'approaching'; // 'approaching', 'shooting', 'rotating', 'retreating'
            this.waspAttackTimer = 0;
            this.waspApproachDuration = 1200; // 1.2 seconds zig-zagging toward player
            this.waspShootDuration = 400; // 0.4 seconds shooting
            this.waspRotateDuration = 300; // 0.3 seconds rotating
            this.waspRetreatDuration = 800; // 0.8 seconds zig-zagging away
            this.zigzagOffset = 0;
            this.zigzagDirection = 1; // 1 or -1 for left/right zig-zag
            this.safeDistance = 150; // Preferred distance from player
            this.targetAngle = 0;
            this.startAngle = 0;
        }
        
        this.waspAttackTimer += 16; // Assume 60fps
        
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distanceToPlayer = Math.hypot(dx, dy);
        const angleToPlayer = Math.atan2(dy, dx);
        
        switch (this.waspAttackState) {
            case 'approaching':
                // Zig-zag toward player
                this.zigzagOffset += 0.15; // Zig-zag frequency
                const zigzagAmplitude = 40; // How wide the zig-zag is
                const zigzagAngle = angleToPlayer + Math.sin(this.zigzagOffset) * this.zigzagDirection * 0.8;
                
                const approachSpeed = this.config.speed * 1.8;
                this.vel.x = Math.cos(zigzagAngle) * approachSpeed;
                this.vel.y = Math.sin(zigzagAngle) * approachSpeed;
                
                // Face movement direction
                this.faceAngle = zigzagAngle;
                
                // Switch to shooting when close enough or time runs out
                if (distanceToPlayer < 100 || this.waspAttackTimer >= this.waspApproachDuration) {
                    this.waspAttackState = 'shooting';
                    this.waspAttackTimer = 0;
                    this.vel.x *= 0.3; // Slow down for shooting
                    this.vel.y *= 0.3;
                }
                break;
                
            case 'shooting':
                // Come to near stop and shoot at player
                this.vel.x *= 0.7;
                this.vel.y *= 0.7;
                
                // Face player for shooting
                this.faceAngle = angleToPlayer;
                
                if (this.waspAttackTimer >= this.waspShootDuration) {
                    this.waspAttackState = 'rotating';
                    this.waspAttackTimer = 0;
                    this.startAngle = this.faceAngle;
                    // Choose retreat direction (away from player)
                    this.targetAngle = angleToPlayer + Math.PI + (Math.random() - 0.5) * Math.PI * 0.6;
                }
                break;
                
            case 'rotating':
                // Smooth rotation to retreat direction
                this.vel.x *= 0.8;
                this.vel.y *= 0.8;
                
                const rotationProgress = this.waspAttackTimer / this.waspRotateDuration;
                if (rotationProgress >= 1) {
                    this.faceAngle = this.targetAngle;
                    this.waspAttackState = 'retreating';
                    this.waspAttackTimer = 0;
                    this.zigzagOffset = 0;
                    this.zigzagDirection *= -1; // Switch zig-zag direction for next approach
                } else {
                    // Smooth interpolation with easing
                    const easedProgress = 1 - Math.pow(1 - rotationProgress, 3);
                    let angleDiff = this.targetAngle - this.startAngle;
                    
                    // Handle angle wrapping
                    if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    this.faceAngle = this.startAngle + angleDiff * easedProgress;
                }
                break;
                
            case 'retreating':
                // Zig-zag away from player to safe distance
                this.zigzagOffset += 0.12; // Slightly slower zig-zag when retreating
                const retreatZigzagAngle = this.targetAngle + Math.sin(this.zigzagOffset) * this.zigzagDirection * 0.6;
                
                const retreatSpeed = this.config.speed * 2.2; // Fast retreat
                this.vel.x = Math.cos(retreatZigzagAngle) * retreatSpeed;
                this.vel.y = Math.sin(retreatZigzagAngle) * retreatSpeed;
                
                // Face movement direction
                this.faceAngle = retreatZigzagAngle;
                
                // Switch back to approaching when far enough or time runs out
                if (distanceToPlayer > this.safeDistance || this.waspAttackTimer >= this.waspRetreatDuration) {
                    this.waspAttackState = 'approaching';
                    this.waspAttackTimer = 0;
                    this.zigzagOffset = 0;
                }
                break;
        }
        
        // Apply speed limit
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 2.5; // Reasonable speed limit
        if (currentSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
        }
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
            this.circleRadius = 220; // Maintain larger distance from player
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
        
        // Apply movement with reduced speed for safer approach
        const moveSpeed = this.config.speed * 0.5; // Reduced from 0.8 to 0.5
        this.vel.x = toIdealX * moveSpeed * 0.03; // Reduced from 0.05 to 0.03
        this.vel.y = toIdealY * moveSpeed * 0.03;
        
        // Add conservative distance correction if too close or far from player
        if (Math.abs(radiusDifference) > 40) { // Increased tolerance from 20 to 40
            const correctionStrength = 0.01; // Reduced from 0.02 to 0.01
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
        
        // Arc movement enemies can only shoot when stopped
        if (this.config.movePattern === 'arc' && !this.canShoot) return;
        
        // Tank movement enemies can only shoot when in firing state
        if (this.config.movePattern === 'tank' && this.tankState !== 'firing') return;
        
        // Shield Turret can only shoot when stopped
        if (this.type === 'SENTINEL' && this.orbitalState !== 'stopping') return;
        
        const playerDistance = Math.hypot(this.x - this.targetPlayer.x, this.y - this.targetPlayer.y);
        const maxShootingRange = this.getTerritorySize() * 1.5;
        
        if (playerDistance > maxShootingRange) return;
        
        // Check line of sight - don't shoot if player is blocked by asteroids
        if (!this.hasLineOfSight(this.targetPlayer, gameEngine)) return;
        
        const now = Date.now();
        
        // Handle burst patterns (burst_3 and burst_2)
        if (this.config.shootPattern === 'burst_3' || this.config.shootPattern === 'burst_2') {
            this.handleBurstShooting(gameEngine, now);
        } else if (this.config.shootPattern === 'laser') {
            // Laser turrets need frequent updates for charging mechanism
            this.shoot(gameEngine);
        } else {
            // Handle non-burst patterns (circle_6, homing, etc.)
            const shootInterval = 1000 / this.config.shootRate;
        if (now - this.lastShot > shootInterval) {
            this.shoot(gameEngine);
            this.lastShot = now;
                
                // Cooldown timer removed - turrets are now mobile
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
            if (this.config.shootPattern === 'burst_3') {
                this.burstState.shotsRemaining = 3;
                this.burstState.shotDelay = 150; // ms between shots in burst
            } else if (this.config.shootPattern === 'burst_2') {
                this.burstState.shotsRemaining = 2;
                this.burstState.shotDelay = 200; // ms between shots in burst (slightly slower for wasps)
            } else {
                this.burstState.shotsRemaining = 4;
                this.burstState.shotDelay = 100;
            }
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
                if (this.config.shootPattern === 'burst_3') {
                    this.burstState.cooldownUntil = now + 2000; // 2 second cooldown for hunters
                } else if (this.config.shootPattern === 'burst_2') {
                    this.burstState.cooldownUntil = now + 1800; // 1.8 second cooldown for wasps
                } else {
                    this.burstState.cooldownUntil = now + 1500; // Default cooldown
                }
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
            case 'burst_2':
                this.shootBurst2(gameEngine, targetX, targetY);
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
            case 'titan_missile':
                this.shootTitanMissile(gameEngine, targetX, targetY);
                break;
            case 'charged_laser':
                this.shootChargedLaser(gameEngine, targetX, targetY);
                break;
            case 'crescent_wave':
                this.shootCrescentWave(gameEngine, targetX, targetY);
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
    
    // Check if enemy is a stationary turret
    isStationary() {
        return this.config.movePattern === 'stationary' || 
               this.type === 'DRIFTER' || 
               this.type === 'PROWLER' || 
               this.type === 'WEAVER' || 
               this.type === 'SENTINEL';
    }
    
    shootAimed(gameEngine, targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        
        // Update facing direction for non-turret, non-titan enemies
        if (!this.isStationary() && this.type !== 'TITAN') {
            this.rotation = angle;
            this.faceAngle = angle;
        }
        
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
        // Initialize laser charging state
        if (!this.laserCharge) {
            this.laserCharge = 0;
            this.laserCharging = false;
            this.laserCooldown = 0;
        }
        
        const now = Date.now();
        
        // Handle cooldown after firing
        if (this.laserCooldown > now) {
            return;
        }
        
        if (!this.laserCharging) {
            // Start charging
            this.laserCharging = true;
            this.laserChargeStartTime = now;
            
            // Create charging visual effect
            this.createLaserChargingEffect(gameEngine);
        }
        
        const chargeTime = now - this.laserChargeStartTime;
        const maxChargeTime = 800; // 0.8 seconds to charge
        this.laserCharge = Math.min(1, chargeTime / maxChargeTime);
        
        if (this.laserCharge >= 1) {
            // Fire powerful laser beam with cool effect
            const angle = Math.atan2(targetY - this.y, targetX - this.x);
            this.createLaserBeam(gameEngine, angle);
            
            // Reset charging and set cooldown
            this.laserCharging = false;
            this.laserCharge = 0;
            this.laserCooldown = now + 2000; // 2 second cooldown
        }
    }
    
    createLaserChargingEffect(gameEngine) {
        // Create charging particles around the turret
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const distance = this.radius + 10;
            const x = this.x + Math.cos(angle) * distance;
            const y = this.y + Math.sin(angle) * distance;
            
            const particle = gameEngine.particlePool.get(x, y, 'starSparkle');
            if (particle) {
                particle.color = '#00ffff';
                particle.life = 0.8;
                particle.vel = { x: 0, y: 0 }; // Stationary charging effect
            }
        }
    }
    
    createLaserBeam(gameEngine, angle) {
        // Create multiple laser bullets for beam effect
        const beamLength = 5; // Number of laser segments
        const segmentSpacing = 15; // Distance between segments
        
        for (let i = 0; i < beamLength; i++) {
            const offsetX = Math.cos(angle) * segmentSpacing * i;
            const offsetY = Math.sin(angle) * segmentSpacing * i;
            
            this.createEnemyBullet(gameEngine, angle, 12, '#00ffff', false, 'laser');
        }
        
        // Create muzzle flash effect
        for (let i = 0; i < 8; i++) {
            const flashAngle = angle + (Math.random() - 0.5) * 0.5;
            const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
            if (particle) {
                particle.color = '#00ffff';
                particle.vel.x = Math.cos(flashAngle) * 3;
                particle.vel.y = Math.sin(flashAngle) * 3;
            }
        }
    }
    
    shootMissile(gameEngine, targetX, targetY) {
        if (this.type === 'TITAN') {
            // Titan tank - purple accelerating missile fired from turret
            const turretAngle = this.tankTurretAngle || 0;
            
            // Fire straight from turret direction (accelerating missile) with very slow initial speed
            const titanConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_ACCELERATING;
            this.createEnemyBullet(gameEngine, turretAngle, titanConfig.INITIAL_SPEED, '#8A2BE2', true, 'titan_accelerating', null);
        } else {
            // Regular missile turret - homing missile that decelerates
            const angle = Math.atan2(targetY - this.y, targetX - this.x);
            const turretConfig = ENEMY_BULLET_CONFIG.MISSILE.TURRET_DECELERATE;
            this.createEnemyBullet(gameEngine, angle, turretConfig.INITIAL_SPEED, '#ff00ff', true, 'missile_decelerate');
        }
    }
    
    shootPulse(gameEngine, targetX, targetY) {
        // Fire 3 rapid pulses
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Update facing direction for non-turret, non-titan enemies
        if (!this.isStationary() && this.type !== 'TITAN') {
            this.rotation = baseAngle;
            this.faceAngle = baseAngle;
        }
        
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (this.active) {
                    this.createEnemyBullet(gameEngine, baseAngle, 4, '#ffff00', false, 'pulse');
                }
            }, i * 100); // 100ms between pulses
        }
    }
    
    shootShieldBurst(gameEngine, targetX, targetY) {
        // Fire 8 bullets in a 360° circle pattern
        const bulletCount = 8;
        const angleStep = (Math.PI * 2) / bulletCount; // 45 degrees between shots
        
        for (let i = 0; i < bulletCount; i++) {
            const angle = i * angleStep;
            this.createEnemyBullet(gameEngine, angle, 2.5, '#00ff00', false, 'shield_burst');
        }
    }
    
    // New shooting patterns
    shootBurst3(gameEngine, targetX, targetY) {
        // Red triangles - single aimed shot (burst handled by updateShooting)
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        
        // Update facing direction for non-turret, non-titan enemies
        if (!this.isStationary() && this.type !== 'TITAN') {
            this.rotation = angle;
            this.faceAngle = angle;
        }
        
        this.createEnemyBullet(gameEngine, angle, 4, '#ff4444', false, 'aimed');
    }
    
    shootBurst2(gameEngine, targetX, targetY) {
        // Yellow wasps - aimed shot with slight spread for wasp-like behavior
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const baseAngle = Math.atan2(dy, dx);
        
        // Update facing direction for non-turret, non-titan enemies
        if (!this.isStationary() && this.type !== 'TITAN') {
            this.rotation = baseAngle;
            this.faceAngle = baseAngle;
        }
        
        // Small random spread to simulate wasp agility
        const spread = 0.15; // Slightly wider spread than precise aiming
        const angle = baseAngle + (Math.random() - 0.5) * spread;
        
        this.createEnemyBullet(gameEngine, angle, 3.5, '#ffff44', false, 'aimed');
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
    
    shootTitanMissile(gameEngine, targetX, targetY) {
        // Titan tank - purple accelerating missile fired from turret
        const turretAngle = this.tankTurretAngle || 0;
        
        // Fire straight from turret direction (no homing)
        this.createEnemyBullet(gameEngine, turretAngle, 1.0, '#8A2BE2', false, 'titan_accelerating', null);
    }
    
    shootChargedLaser(gameEngine, targetX, targetY) {
        // STALKER - wide beam laser attack
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Create wide laser beam effect
        this.createLaserBeam(gameEngine, angle);
    }
    
    createLaserBeam(gameEngine, angle) {
        if (!gameEngine) return;
        
        // Create wide laser beam effect
        const beamLength = 600; // Long range laser
        const beamWidth = 40; // Wide beam
        const segments = 8; // Number of beam segments for visual effect
        
        const startX = this.x + Math.cos(angle) * this.radius;
        const startY = this.y + Math.sin(angle) * this.radius;
        const endX = startX + Math.cos(angle) * beamLength;
        const endY = startY + Math.sin(angle) * beamLength;
        
        // Create multiple laser segments for wide beam effect
        for (let i = 0; i < segments; i++) {
            const offsetAngle = angle + (Math.PI / 2); // Perpendicular to beam direction
            const offset = (i - segments / 2) * (beamWidth / segments);
            const segmentStartX = startX + Math.cos(offsetAngle) * offset;
            const segmentStartY = startY + Math.sin(offsetAngle) * offset;
            const segmentEndX = endX + Math.cos(offsetAngle) * offset;
            const segmentEndY = endY + Math.sin(offsetAngle) * offset;
            
            // Create laser bullet for each segment
            const laserBullet = gameEngine.enemyBulletPool.get();
            if (laserBullet) {
                laserBullet.reset(
                    segmentStartX,
                    segmentStartY,
                    Math.cos(angle) * 8, // Reduced laser speed for shorter range
                    Math.sin(angle) * 8,
                    '#44ffff', // Cyan laser color
                    false
                );
                
                laserBullet.radius = 3 + Math.abs(offset) * 0.1; // Varying thickness
                laserBullet.glowRadius = 8 + Math.abs(offset) * 0.2;
                laserBullet.damage = this.getLevelScaledDamage(6); // High damage
                laserBullet.movementPattern = 'laser_beam';
                laserBullet.life = 0.15; // Even shorter-lived for much reduced range
            }
        }
        
        // Create particle effects at firing point
        if (gameEngine.particlePool) {
            for (let i = 0; i < 15; i++) {
                const particle = gameEngine.particlePool.get(startX, startY, 'starSparkle');
                if (particle) {
                    const particleAngle = angle + (Math.random() - 0.5) * 0.5;
                    const speed = 2 + Math.random() * 4;
                    particle.vel.x = Math.cos(particleAngle) * speed;
                    particle.vel.y = Math.sin(particleAngle) * speed;
                    particle.color = '#44ffff';
                    particle.radius = 1 + Math.random() * 2;
                    particle.life = 20 + Math.random() * 20;
                }
            }
        }
        
        // Screen shake for powerful laser
        if (gameEngine.triggerScreenShake) {
            gameEngine.triggerScreenShake(15, 8);
        }
    }
    
    shootCrescentWave(gameEngine, targetX, targetY) {
        // GUARDIAN - crescent energy beam like Stalker's laser but curved
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        
        // Update facing direction for non-turret, non-titan enemies
        if (!this.isStationary() && this.type !== 'TITAN') {
            this.rotation = baseAngle;
            this.faceAngle = baseAngle;
        }
        
        // Create curved laser beam effect
        this.createCrescentBeam(gameEngine, baseAngle);
    }
    
    createCrescentBeam(gameEngine, baseAngle) {
        if (!gameEngine) return;
        
        // Crescent beam parameters
        const beamLength = 400; // Long range crescent
        const waveSpread = Math.PI * 0.6; // 108 degrees total spread
        const beamSegments = 12; // Number of beam rays in the crescent (reduced from 15)
        const beamThickness = 2; // Parallel rays per beam segment for thickness (reduced from 3)
        
        const startX = this.x + Math.cos(baseAngle) * this.radius;
        const startY = this.y + Math.sin(baseAngle) * this.radius;
        
        // Create crescent slice - all bullets travel parallel in same direction
        const crescentWidth = 120; // Width of the crescent formation
        const travelDirection = baseAngle; // All bullets travel toward target
        const perpAngle = baseAngle + Math.PI / 2; // Perpendicular to travel direction
        
        for (let i = 0; i < beamSegments; i++) {
            const progress = i / (beamSegments - 1); // 0 to 1
            
            // Position along the crescent arc (perpendicular to travel direction)
            const crescentOffset = (progress - 0.5) * crescentWidth;
            
            // Create curved crescent shape using sine function
            const curveHeight = Math.sin(progress * Math.PI) * 25; // Curve depth
            
            // Calculate starting position for this segment
            const segmentStartX = this.x + Math.cos(perpAngle) * crescentOffset + Math.cos(travelDirection) * (this.radius + curveHeight);
            const segmentStartY = this.y + Math.sin(perpAngle) * crescentOffset + Math.sin(travelDirection) * (this.radius + curveHeight);
            
            // Create multiple parallel bullets for beam thickness
            for (let thickness = 0; thickness < beamThickness; thickness++) {
                const thicknessOffset = (thickness - beamThickness / 2) * 6; // Spacing between parallel rays
                
                const rayStartX = segmentStartX + Math.cos(perpAngle) * thicknessOffset;
                const rayStartY = segmentStartY + Math.sin(perpAngle) * thicknessOffset;
                
                // Create laser bullet for this ray segment
                const laserBullet = gameEngine.enemyBulletPool.get();
                if (laserBullet) {
                    laserBullet.reset(
                        rayStartX,
                        rayStartY,
                        Math.cos(travelDirection) * (6 * 0.7 * (1 + Math.min(0.4, (this.level - 1) * 0.08))), // Apply same speed scaling as other bullets
                        Math.sin(travelDirection) * (6 * 0.7 * (1 + Math.min(0.4, (this.level - 1) * 0.08))),
                        '#44ff44', // Green energy color
                        false
                    );
                    
                    // Laser beam properties - thicker in middle of crescent
                    const distanceFromCenter = Math.abs(progress - 0.5);
                    laserBullet.radius = 3 - distanceFromCenter * 1.5; // Thicker in center
                    laserBullet.glowRadius = 10 - distanceFromCenter * 3;
                    laserBullet.damage = this.getLevelScaledDamage(5); // High damage
                    laserBullet.movementPattern = 'crescent_slice';
                    laserBullet.life = 0.25; // Short-lived for quick fade effect
                    laserBullet.maxLife = 0.25; // Store max life for opacity calculations
                    
                    // Store beam properties
                    laserBullet.beamProgress = progress;
                    laserBullet.crescentOffset = crescentOffset;
                    laserBullet.beamBaseAngle = baseAngle;
                }
            }
        }
        
        // Create dramatic launch effect at Guardian
        if (gameEngine.particlePool) {
            for (let i = 0; i < 15; i++) {
                const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
                if (particle) {
                    const particleAngle = baseAngle + (Math.random() - 0.5) * waveSpread * 1.3;
                    const speed = 3 + Math.random() * 6;
                    particle.vel.x = Math.cos(particleAngle) * speed;
                    particle.vel.y = Math.sin(particleAngle) * speed;
                    particle.color = '#44ff44'; // Green energy color
                    particle.radius = 1 + Math.random() * 3;
                    particle.life = 25 + Math.random() * 30;
                }
            }
            
            // Add energy burst rings
            for (let ring = 0; ring < 3; ring++) {
                const ringParticle = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', 20 + ring * 15);
                if (ringParticle) {
                    ringParticle.color = '#44ff44';
                    ringParticle.life = 0.6; // Slightly longer for dramatic effect
                }
            }
        }
        
        // Screen shake for powerful crescent beam
        if (gameEngine.triggerScreenShake) {
            gameEngine.triggerScreenShake(12, 6);
        }
    }
    
    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) {
        if (!gameEngine.enemyBulletPool) return;
        
        // Apply level scaling to bullet speed using constants
        const baseSpeedMultiplier = ENEMY_BULLET_CONFIG.BASE_SPEED_MULTIPLIER;
        const levelSpeedBonus = Math.min(
            ENEMY_BULLET_CONFIG.MAX_LEVEL_SPEED_BONUS, 
            (this.level - 1) * ENEMY_BULLET_CONFIG.LEVEL_SPEED_BONUS_PER_LEVEL
        );
        let scaledSpeed = speed * baseSpeedMultiplier * (1 + levelSpeedBonus);
        
        // Apply speed limits based on bullet type
        const speedLimits = ENEMY_BULLET_CONFIG.SPEED_LIMITS[movementPattern.toUpperCase()];
        if (speedLimits) {
            scaledSpeed = Math.max(speedLimits.MIN, Math.min(speedLimits.MAX, scaledSpeed));
        }
        
        const bullet = gameEngine.enemyBulletPool.get();
        if (bullet) {
            bullet.reset(
                this.x + Math.cos(angle) * this.radius,
                this.y + Math.sin(angle) * this.radius,
                Math.cos(angle) * scaledSpeed,
                Math.sin(angle) * scaledSpeed,
                color,
                explosive
            );
            
            // Set level-scaled damage (scaled back down)
            const baseDamage = explosive ? 3 : 2;
            bullet.damage = this.getLevelScaledDamage(baseDamage);
            
            // Make titan missiles larger and more powerful
            if (movementPattern === 'titan_homing' || movementPattern === 'titan_accelerating') {
                bullet.radius = 6; // Larger than normal bullets (usually 3-4)
                bullet.glowRadius = 12; // Larger glow effect
                bullet.damage = this.getLevelScaledDamage(4); // Higher damage than normal bullets
                
                // For accelerating missiles, track distance traveled and set level-scaled properties
                if (movementPattern === 'titan_accelerating') {
                    bullet.distanceTraveled = 0;
                    bullet.startX = bullet.x;
                    bullet.startY = bullet.y;
                    
                    // Use level-scaled max distance from constants
                    const titanConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_ACCELERATING;
                    bullet.maxDistance = titanConfig.MAX_DISTANCE;
                    
                    // Set level-scaled acceleration and max speed
                    const levelProgress = Math.min(1, (this.level - 1) / 5); // Normalize to 0-1 over 6 levels
                    bullet.acceleration = titanConfig.MIN_ACCELERATION + 
                        (titanConfig.MAX_ACCELERATION - titanConfig.MIN_ACCELERATION) * levelProgress;
                    bullet.maxSpeed = titanConfig.MIN_MAX_SPEED + 
                        (titanConfig.MAX_MAX_SPEED - titanConfig.MIN_MAX_SPEED) * levelProgress;
                }
            }
            
            // Make laser bullets more visible and powerful
            if (movementPattern === 'laser') {
                bullet.radius = 5; // Larger laser bullets
                bullet.glowRadius = 15; // Strong glow effect
                bullet.damage = this.getLevelScaledDamage(8); // High laser damage
                bullet.life = 0.8; // Longer life for visibility
            }
            
            // Make missile turret bullets larger and spiky
            if (movementPattern === 'missile_decelerate') {
                bullet.radius = 6; // Large spiky orbs
                bullet.glowRadius = 12; // Strong glow
                bullet.damage = this.getLevelScaledDamage(5); // High damage
            }
            
            // Set unique movement pattern for this bullet
            bullet.movementPattern = movementPattern;
            bullet.patternTimer = 0;
            bullet.patternPhase = Math.random() * Math.PI * 2; // Random starting phase
            
            // Apply lifetime scaling based on bullet type and level
            const lifetimeLimits = ENEMY_BULLET_CONFIG.LIFETIME_LIMITS[movementPattern.toUpperCase()];
            if (lifetimeLimits && !bullet.life) { // Don't override if already set (like laser bullets)
                const baseLifeMultiplier = ENEMY_BULLET_CONFIG.BASE_LIFE_MULTIPLIER;
                const levelLifeBonus = Math.min(
                    ENEMY_BULLET_CONFIG.MAX_LEVEL_LIFE_BONUS,
                    (this.level - 1) * ENEMY_BULLET_CONFIG.LEVEL_LIFE_BONUS_PER_LEVEL
                );
                const scaledLife = lifetimeLimits.MIN * baseLifeMultiplier * (1 + levelLifeBonus);
                bullet.life = Math.max(lifetimeLimits.MIN, Math.min(lifetimeLimits.MAX, scaledLife));
            }
            
            // For homing missiles and homing shots, provide player reference
            if (movementPattern === 'missile' || movementPattern === 'homing' || movementPattern === 'titan_homing') {
                bullet.targetPlayer = target || this.targetPlayer;
            }
            
            // Titan accelerating missiles don't need target reference (they fly straight)
            
            // Enemy shooting sounds removed to reduce audio confusion
        }
    }
    

    
    draw(ctx) {
        if (!this.active) return;
        
        // Draw light trail first (behind enemy)
        this.drawLightTrail(ctx);
        
        // Draw targeting effect if this enemy is currently targeted (clicked)
        if (window.gameEngine && window.gameEngine.targetedEntity === this) {
            this.drawTargetingEffect(ctx);
        }
        
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
        
        // Draw pulsating circle only when targeted (outside of transform)
        if (window.gameEngine && window.gameEngine.targetedEntity === this) {
            this.drawPulsatingCircle(ctx);
        }
        
        // Draw health bar (outside of transform)
        this.drawHealthBar(ctx);
        
        // Cooldown timer removed - turrets are now mobile
    }
    
    drawTargetingEffect(ctx) {
        ctx.save();
        
        // Pulsing glow effect
        const time = Date.now() * 0.003;
        const pulseIntensity = 0.5 + Math.sin(time) * 0.3;
        
        // Calculate center position (adjust for Guardian visual offset)
        let centerX = this.x;
        let centerY = this.y;
        
        // Guardian-specific adjustment to center the targeting circle better
        if (this.type === 'GUARDIAN') {
            // Adjust slightly forward to account for Guardian's visual center
            centerX += Math.cos(this.faceAngle) * (this.radius * 0.1);
            centerY += Math.sin(this.faceAngle) * (this.radius * 0.1);
        }
        
        // Outer glow
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15 * pulseIntensity;
        ctx.globalAlpha = 0.4 * pulseIntensity;
        
        // Draw subtle ring around entity
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner highlight ring
        ctx.shadowBlur = 8 * pulseIntensity;
        ctx.globalAlpha = 0.6 * pulseIntensity;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
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
                this.drawEmeraldGuardian(ctx);
                break;
            case 'WASP':
                this.drawWaspShip(ctx);
                break;
            case 'TITAN':
                this.drawTitanTank(ctx);
                break;
            case 'STALKER':
                this.drawStalkerSword(ctx);
                break;
            case 'TANGERINE_BOMBER':
                this.drawSpikedCircle(ctx);
                break;
            case 'DRIFTER':
                this.drawLaserTurret(ctx);
                break;
            case 'PROWLER':
                this.drawMissileTurret(ctx);
                break;
            case 'WEAVER':
                this.drawPulseTurret(ctx);
                break;
            case 'SENTINEL':
                this.drawShieldTurret(ctx);
                break;
            default:
                this.drawTriangle(ctx);
        }
        
        // Aiming triangles removed - not working as intended
    }
    
    // drawAimingTriangle method removed - not working as intended
    
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
    
    drawWaspShip(ctx) {
        // Sleek wasp-like ship with triangular wings
        const size = this.radius * 0.8;
        
        ctx.save();
        
        // Main wasp body - elongated oval
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Body segments (wasp-like segmentation)
        const bodyLength = size * 1.4;
        const bodyWidth = size * 0.6;
        
        // Front segment (head)
        ctx.beginPath();
        ctx.ellipse(bodyLength * 0.3, 0, bodyWidth * 0.4, bodyWidth * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Middle segment (thorax)
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyWidth * 0.5, bodyWidth * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Rear segment (abdomen)
        ctx.beginPath();
        ctx.ellipse(-bodyLength * 0.4, 0, bodyWidth * 0.6, bodyWidth * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Triangular wings - sleek and dangerous
        ctx.fillStyle = this.color + '60'; // Semi-transparent wings
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        
        // Upper wings
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, 0); // Wing root
        ctx.lineTo(-size * 0.8, -size * 0.9); // Wing tip
        ctx.lineTo(-size * 0.6, -size * 0.3); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, 0); // Wing root
        ctx.lineTo(-size * 0.8, size * 0.9); // Wing tip
        ctx.lineTo(-size * 0.6, size * 0.3); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Lower wings (smaller)
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, 0); // Wing root
        ctx.lineTo(-size * 0.9, -size * 0.6); // Wing tip
        ctx.lineTo(-size * 0.7, -size * 0.2); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, 0); // Wing root
        ctx.lineTo(-size * 0.9, size * 0.6); // Wing tip
        ctx.lineTo(-size * 0.7, size * 0.2); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Stinger/weapon at front
        ctx.strokeStyle = '#FFFF00'; // Bright yellow stinger
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bodyLength * 0.5, 0);
        ctx.lineTo(bodyLength * 0.8, 0);
        ctx.stroke();
        
        // Wing veins for detail
        ctx.strokeStyle = this.color + 'AA';
        ctx.lineWidth = 1;
        
        // Upper wing veins
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, -size * 0.1);
        ctx.lineTo(-size * 0.7, -size * 0.7);
        ctx.moveTo(-size * 0.4, -size * 0.2);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, size * 0.1);
        ctx.lineTo(-size * 0.7, size * 0.7);
        ctx.moveTo(-size * 0.4, size * 0.2);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.stroke();
        
        ctx.restore();
        
        // Draw laser charging effect if charging
        if (this.laserCharging && this.laserChargeProgress > 0) {
            this.drawLaserChargingEffect(ctx);
        }
    }
    
    drawEmeraldGuardian(ctx) {
        // Emerald gemstone-like ship with triangular wings
        const size = this.radius * 0.8;
        
        ctx.save();
        
        // Main emerald body - faceted gemstone shape
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Central emerald facets
        const facets = [
            // Top facet
            [0, -size * 0.8, size * 0.4, -size * 0.3, 0, -size * 0.1],
            // Bottom facet
            [0, size * 0.8, size * 0.4, size * 0.3, 0, size * 0.1],
            // Left facets
            [-size * 0.6, 0, -size * 0.3, -size * 0.4, 0, -size * 0.1],
            [-size * 0.6, 0, -size * 0.3, size * 0.4, 0, size * 0.1],
            // Right facets
            [size * 0.6, 0, size * 0.3, -size * 0.4, 0, -size * 0.1],
            [size * 0.6, 0, size * 0.3, size * 0.4, 0, size * 0.1]
        ];
        
        facets.forEach((facet, index) => {
            ctx.beginPath();
            ctx.moveTo(facet[0], facet[1]);
            ctx.lineTo(facet[2], facet[3]);
            ctx.lineTo(facet[4], facet[5]);
            ctx.closePath();
            
            // Vary the brightness for different facets
            const brightness = 0.6 + (index % 3) * 0.2;
            ctx.fillStyle = this.color + Math.floor(brightness * 255).toString(16).padStart(2, '0');
            ctx.fill();
            ctx.stroke();
        });
        
        // Triangular wings - crystalline and sharp
        ctx.fillStyle = this.color + '50'; // Semi-transparent wings
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Upper triangular wings
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, -size * 0.2); // Wing root
        ctx.lineTo(-size * 1.1, -size * 1.0); // Wing tip
        ctx.lineTo(-size * 0.8, -size * 0.1); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, size * 0.2); // Wing root
        ctx.lineTo(-size * 1.1, size * 1.0); // Wing tip
        ctx.lineTo(-size * 0.8, size * 0.1); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Lower triangular wings (smaller, more swept)
        ctx.beginPath();
        ctx.moveTo(-size * 0.5, -size * 0.1); // Wing root
        ctx.lineTo(-size * 1.2, -size * 0.6); // Wing tip
        ctx.lineTo(-size * 0.9, 0); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.5, size * 0.1); // Wing root
        ctx.lineTo(-size * 1.2, size * 0.6); // Wing tip
        ctx.lineTo(-size * 0.9, 0); // Wing trailing edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Crystalline details on wings
        ctx.strokeStyle = '#FFFFFF'; // White crystal veins
        ctx.lineWidth = 1;
        
        // Wing crystal veins
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, -size * 0.15);
        ctx.lineTo(-size * 0.9, -size * 0.7);
        ctx.moveTo(-size * 0.5, -size * 0.3);
        ctx.lineTo(-size * 0.8, -size * 0.5);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, size * 0.15);
        ctx.lineTo(-size * 0.9, size * 0.7);
        ctx.moveTo(-size * 0.5, size * 0.3);
        ctx.lineTo(-size * 0.8, size * 0.5);
        ctx.stroke();
        
        // Central emerald highlight
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(size * 0.1, -size * 0.2, size * 0.15, size * 0.1, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    drawTitanTank(ctx) {
        // Heavy hexagon-shaped tank with magenta armor plating
        const size = this.radius * 0.9;
        
        ctx.save();
        
        // Main hexagon hull - based on original hexagon but tank-like
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        
        // Create hexagon hull with forward stretch like original
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            // Stretch the first point forward to create directionality like original
            const stretch = i === 0 ? 1.4 : 1;
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
        
        // Magenta armor plating on each hexagon face
        ctx.fillStyle = '#FF00FF'; // Magenta
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        
        // Front armor plate (on the stretched forward face)
        ctx.beginPath();
        const frontStretch = 1.4;
        const frontX = Math.cos(0) * size * frontStretch * 0.8;
        const frontY1 = Math.cos(Math.PI / 3) * size * 0.6;
        const frontY2 = Math.cos(Math.PI / 3) * size * -0.6;
        ctx.moveTo(frontX, 0);
        ctx.lineTo(frontX * 0.7, frontY1);
        ctx.lineTo(frontX * 0.7, frontY2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Side armor plates on each hexagon face
        for (let i = 1; i < 6; i++) {
            const angle1 = (i / 6) * Math.PI * 2;
            const angle2 = ((i + 1) / 6) * Math.PI * 2;
            
            const x1 = Math.cos(angle1) * size * 0.8;
            const y1 = Math.sin(angle1) * size * 0.8;
            const x2 = Math.cos(angle2) * size * 0.8;
            const y2 = Math.sin(angle2) * size * 0.8;
            
            // Create armor plate on each face
            ctx.beginPath();
            ctx.moveTo(x1 * 0.9, y1 * 0.9);
            ctx.lineTo(x2 * 0.9, y2 * 0.9);
            ctx.lineTo(x2 * 0.7, y2 * 0.7);
            ctx.lineTo(x1 * 0.7, y1 * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        
        // Hexagonal turret - smaller, centered
        const turretSize = size * 0.5;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Hexagonal turret shape
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * turretSize;
            const y = Math.sin(angle) * turretSize;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Turret armor edges - magenta
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 2;
        
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x1 = Math.cos(angle) * turretSize * 0.7;
            const y1 = Math.sin(angle) * turretSize * 0.7;
            const x2 = Math.cos(angle) * turretSize;
            const y2 = Math.sin(angle) * turretSize;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        // Turret will be drawn at the end to appear on top
        
        // Hexagonal tank treads following the hull shape
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = 4;
        
        // Outer hexagonal track
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const stretch = i === 0 ? 1.4 : 1;
            const x = Math.cos(angle) * size * stretch * 1.1;
            const y = Math.sin(angle) * size * stretch * 1.1;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Inner hexagonal track
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const stretch = i === 0 ? 1.4 : 1;
            const x = Math.cos(angle) * size * stretch * 0.9;
            const y = Math.sin(angle) * size * stretch * 0.9;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Track tread marks on each hexagon face
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        
        for (let face = 0; face < 6; face++) {
            const angle1 = (face / 6) * Math.PI * 2;
            const angle2 = ((face + 1) / 6) * Math.PI * 2;
            const stretch1 = face === 0 ? 1.4 : 1;
            const stretch2 = (face + 1) % 6 === 0 ? 1.4 : 1;
            
            const x1 = Math.cos(angle1) * size * stretch1;
            const y1 = Math.sin(angle1) * size * stretch1;
            const x2 = Math.cos(angle2) * size * stretch2;
            const y2 = Math.sin(angle2) * size * stretch2;
            
            // Draw tread marks along each face
            for (let i = 0; i < 4; i++) {
                const t = (i + 1) / 5;
                const x = x1 + (x2 - x1) * t;
                const y = y1 + (y2 - y1) * t;
                
                // Outer tread mark
                ctx.beginPath();
                ctx.moveTo(x * 1.05, y * 1.05);
                ctx.lineTo(x * 1.15, y * 1.15);
                ctx.stroke();
                
                // Inner tread mark
                ctx.beginPath();
                ctx.moveTo(x * 0.85, y * 0.85);
                ctx.lineTo(x * 0.95, y * 0.95);
                ctx.stroke();
            }
        }
        
        // Armor detail lines - magenta highlights on each face
        ctx.strokeStyle = '#FF66FF'; // Lighter magenta
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const stretch = i === 0 ? 1.4 : 1;
            const x = Math.cos(angle) * size * stretch * 0.8;
            const y = Math.sin(angle) * size * stretch * 0.8;
            
            // Radial armor detail lines
            ctx.beginPath();
            ctx.moveTo(x * 0.6, y * 0.6);
            ctx.lineTo(x * 0.9, y * 0.9);
            ctx.stroke();
        }
        
        // Warning stripes on front armor
        ctx.strokeStyle = '#FFFF00'; // Yellow warning stripes
        ctx.lineWidth = 2;
        
        const frontArmorX = Math.cos(0) * size * 1.4 * 0.8;
        for (let i = 0; i < 3; i++) {
            const y = -size * 0.3 + (i / 2) * size * 0.6;
            ctx.beginPath();
            ctx.moveTo(frontArmorX * 0.7, y);
            ctx.lineTo(frontArmorX * 0.9, y - size * 0.1);
            ctx.stroke();
        }
        
        // Hexagonal armor panel outlines
        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 1;
        
        // Draw hexagonal panel lines on turret
        for (let i = 0; i < 6; i++) {
            const angle1 = (i / 6) * Math.PI * 2;
            const angle2 = ((i + 1) / 6) * Math.PI * 2;
            
            const x1 = Math.cos(angle1) * turretSize * 0.8;
            const y1 = Math.sin(angle1) * turretSize * 0.8;
            const x2 = Math.cos(angle2) * turretSize * 0.8;
            const y2 = Math.sin(angle2) * turretSize * 0.8;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        // Draw turret on top of everything else
        // Save context for independent turret rotation
        ctx.save();
        
        // Rotate turret independently from hull
        const turretAngle = this.tankTurretAngle || 0;
        const hullAngle = this.faceAngle || 0;
        const relativeAngle = turretAngle - hullAngle;
        ctx.rotate(relativeAngle);
        
        // Tank cannon - extending forward from hexagon
        const cannonLength = size * 1.3;
        const cannonWidth = size * 0.15;
        
        ctx.fillStyle = '#CCCCCC'; // Metallic cannon
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.roundRect(turretSize * 0.8, -cannonWidth * 0.5, cannonLength, cannonWidth, 3);
        ctx.fill();
        ctx.stroke();
        
        // Cannon muzzle
        ctx.fillStyle = '#666666';
        ctx.beginPath();
        ctx.arc(turretSize * 0.8 + cannonLength, 0, cannonWidth * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.restore(); // Restore context after turret drawing
        
        ctx.restore();
    }
    
    drawStalkerSword(ctx) {
        // Sharp, sword-like design for stealth and speed
        const size = this.radius * 0.9;
        
        ctx.save();
        
        // Main sword blade - long and sharp
        const bladeLength = size * 1.8;
        const bladeWidth = size * 0.4;
        
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Sword blade - pointed diamond shape
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.6, 0); // Sharp tip
        ctx.lineTo(bladeLength * 0.1, -bladeWidth * 0.5); // Top edge
        ctx.lineTo(-bladeLength * 0.4, -bladeWidth * 0.3); // Taper to hilt
        ctx.lineTo(-bladeLength * 0.6, 0); // Hilt connection
        ctx.lineTo(-bladeLength * 0.4, bladeWidth * 0.3); // Bottom taper
        ctx.lineTo(bladeLength * 0.1, bladeWidth * 0.5); // Bottom edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Sword fuller (blood groove) - central line for sharpness
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.5, 0);
        ctx.lineTo(-bladeLength * 0.3, 0);
        ctx.stroke();
        
        // Cross guard - sharp and angular
        const guardWidth = size * 0.8;
        const guardThickness = size * 0.15;
        
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        // Angular cross guard with sharp points
        ctx.beginPath();
        ctx.moveTo(-bladeLength * 0.4, -guardWidth * 0.5); // Top point
        ctx.lineTo(-bladeLength * 0.3, -guardThickness * 0.5); // Top inner
        ctx.lineTo(-bladeLength * 0.3, guardThickness * 0.5); // Bottom inner
        ctx.lineTo(-bladeLength * 0.4, guardWidth * 0.5); // Bottom point
        ctx.lineTo(-bladeLength * 0.5, guardWidth * 0.4); // Bottom outer
        ctx.lineTo(-bladeLength * 0.6, 0); // Center back
        ctx.lineTo(-bladeLength * 0.5, -guardWidth * 0.4); // Top outer
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Sword hilt/handle
        const hiltLength = size * 0.6;
        const hiltWidth = size * 0.2;
        
        ctx.fillStyle = '#CCCCCC'; // Metallic hilt
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.roundRect(-bladeLength * 0.6, -hiltWidth * 0.5, hiltLength, hiltWidth, 3);
        ctx.fill();
        ctx.stroke();
        
        // Hilt grip details
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 4; i++) {
            const x = -bladeLength * 0.55 + (i / 3) * (hiltLength * 0.8);
            ctx.beginPath();
            ctx.moveTo(x, -hiltWidth * 0.3);
            ctx.lineTo(x, hiltWidth * 0.3);
            ctx.stroke();
        }
        
        // Pommel - weighted end
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(-bladeLength * 0.6 - hiltLength * 0.1, 0, hiltWidth * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Sharp edge highlights
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        
        // Top blade edge highlight
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.6, 0);
        ctx.lineTo(bladeLength * 0.2, -bladeWidth * 0.4);
        ctx.lineTo(-bladeLength * 0.2, -bladeWidth * 0.25);
        ctx.stroke();
        
        // Bottom blade edge highlight
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.6, 0);
        ctx.lineTo(bladeLength * 0.2, bladeWidth * 0.4);
        ctx.lineTo(-bladeLength * 0.2, bladeWidth * 0.25);
        ctx.stroke();
        
        // Secondary blade edges for extra sharpness
        ctx.strokeStyle = this.color + 'CC';
        ctx.lineWidth = 1;
        
        // Inner edge lines
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.4, 0);
        ctx.lineTo(0, -bladeWidth * 0.2);
        ctx.lineTo(-bladeLength * 0.3, -bladeWidth * 0.15);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.4, 0);
        ctx.lineTo(0, bladeWidth * 0.2);
        ctx.lineTo(-bladeLength * 0.3, bladeWidth * 0.15);
        ctx.stroke();
        
        // Energy/stealth effect - subtle glow
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = this.color + '40';
        ctx.lineWidth = 4;
        
        // Blade glow outline
        ctx.beginPath();
        ctx.moveTo(bladeLength * 0.6, 0);
        ctx.lineTo(bladeLength * 0.1, -bladeWidth * 0.5);
        ctx.lineTo(-bladeLength * 0.4, -bladeWidth * 0.3);
        ctx.lineTo(-bladeLength * 0.6, 0);
        ctx.lineTo(-bladeLength * 0.4, bladeWidth * 0.3);
        ctx.lineTo(bladeLength * 0.1, bladeWidth * 0.5);
        ctx.closePath();
        ctx.stroke();
        
        ctx.restore();
        
        ctx.restore();
    }
    
    drawPulsatingCircle(ctx) {
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

        // Ship name setup (above level and health) - GOLD TEXT ONLY
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = 'rgba(255, 215, 0, 1.0)'; // Golden text only, no stroke
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const shipName = (this.config.name || 'Unknown Ship').toUpperCase();
        const nameY = barY - 3; // Position ship name closer to health bar
        
        // Draw ship name (fill only, no stroke)
        ctx.fillText(shipName, this.x, nameY);

        // Health number and level text setup - COMMENTED OUT (now shown in target display)
        /*
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Bright gold for health number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Round up health display when between 0-1 to show 1 HP
        const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
        const healthNumber = `${displayHealth}/${Math.round(this.maxHealth)}`;
        const numberY = barY + barHeight + 6; // Position below the health bar
        
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
        */
        
        // Center the health bar under the ship name
        const barX = this.x - barWidth / 2;

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
    
    drawLaserChargingEffect(ctx) {
        if (!this.laserChargeProgress || this.laserChargeProgress <= 0) return;
        
        ctx.save();
        
        // Position at enemy center
        ctx.translate(this.x, this.y);
        ctx.rotate(this.faceAngle);
        
        const progress = this.laserChargeProgress;
        const intensity = 0.3 + progress * 0.7; // Increase intensity as charging
        
        // Charging energy buildup at the front of the ship
        const chargeX = this.radius * 0.8; // In front of the ship
        const chargeRadius = 5 + progress * 15; // Growing charge effect
        
        // Pulsing energy core
        const pulseIntensity = 0.8 + Math.sin(Date.now() * 0.02) * 0.2;
        
        // Outer energy ring
        const outerGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, chargeRadius);
        outerGradient.addColorStop(0, `rgba(68, 255, 255, ${intensity * pulseIntensity})`);
        outerGradient.addColorStop(0.5, `rgba(68, 255, 255, ${intensity * 0.6})`);
        outerGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');
        
        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        ctx.arc(chargeX, 0, chargeRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner energy core
        const coreRadius = chargeRadius * 0.4;
        const coreGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, coreRadius);
        coreGradient.addColorStop(0, `rgba(255, 255, 255, ${intensity * pulseIntensity})`);
        coreGradient.addColorStop(0.7, `rgba(68, 255, 255, ${intensity * 0.8})`);
        coreGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');
        
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(chargeX, 0, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Energy sparks around the charge point
        if (progress > 0.3) {
            const sparkCount = Math.floor(progress * 8);
            for (let i = 0; i < sparkCount; i++) {
                const angle = (i / sparkCount) * Math.PI * 2 + Date.now() * 0.01;
                const distance = chargeRadius * 0.8 + Math.sin(Date.now() * 0.03 + i) * 5;
                const sparkX = chargeX + Math.cos(angle) * distance;
                const sparkY = Math.sin(angle) * distance;
                
                ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
                ctx.beginPath();
                ctx.arc(sparkX, sparkY, 1 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Charging beam preview (thin line showing where laser will fire)
        if (progress > 0.5) {
            const beamLength = 100 + progress * 200;
            const beamAlpha = (progress - 0.5) * 2 * intensity;
            
            ctx.strokeStyle = `rgba(68, 255, 255, ${beamAlpha})`;
            ctx.lineWidth = 2 + progress * 3;
            ctx.beginPath();
            ctx.moveTo(chargeX, 0);
            ctx.lineTo(chargeX + beamLength, 0);
            ctx.stroke();
            
            // Beam glow
            ctx.strokeStyle = `rgba(255, 255, 255, ${beamAlpha * 0.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Cooldown timer method removed - turrets are now mobile
    
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
        
        // Create damage number
        if (window.gameEngine) {
            window.gameEngine.createDamageNumber(this.x, this.y - this.radius, damage);
        }
        
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