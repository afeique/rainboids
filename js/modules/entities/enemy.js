// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG, ENEMY_BULLET_CONFIG, getEnemyFiringCooldown } from '../constants.js';
import { random, GameDimensions } from '../utils.js';
import { rgba } from '../color-cache.js';
import { frameClock } from '../frame-clock.js';

// ── Feature toggles ────────────────────────────────────────────────────────
// Set window.SHOW_ENEMY_NAMES = false in the browser console to hide name labels
const showEnemyNames = () => window.SHOW_ENEMY_NAMES !== false; // default: true

// Enemy type definitions with unique characteristics
export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',        // Red
        health: 16,
        speed: 1.6,
        size: 38,
        shootPattern: 'hunter_single',
        shootRate: 1.5,
        movePattern: 'triangle',
        points: 75
    },
    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',        // Green
        health: 32,
        speed: 1.0,
        size: 57,
        shootPattern: 'guardian_spread',
        shootRate: 0.3,
        movePattern: 'square',
        points: 120
    },
    WASP: {
        name: 'Wasp',
        color: '#ffff44',        // Yellow
        health: 14,
        speed: 2.8,
        size: 42,
        shootPattern: 'wasp_machinegun',
        shootRate: 0.7,
        movePattern: 'wasp_zigzag',
        points: 60
    },
    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 60,
        speed: 1.2,
        size: 75,
        shootPattern: 'sweep_laser',
        shootRate: 0.15,
        movePattern: 'boulder',
        points: 200
    },
    STALKER: {
        name: 'Stalker',
        color: '#44ffff',        // Cyan
        health: 20,
        speed: 2.5,
        size: 45,
        shootPattern: 'charged_laser',
        shootRate: 0.3,
        movePattern: 'arc',
        points: 80
    },
    TANGERINE: {
        name: 'Bomber',
        color: '#ff8844',        // Orange
        health: 24,
        speed: 1.6,
        size: 53,
        shootPattern: 'lay_mine',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 100
    },
    DRIFTER: {
        name: 'Drifter',
        color: '#00ffff',        // Cyan
        health: 22,
        speed: 2.5,
        size: 45,
        shootPattern: 'arc_lightning',
        shootRate: 0.1,
        movePattern: 'drifter_wave',
        points: 120
    },
    PROWLER: {
        name: 'Prowler',
        color: '#ff00ff',        // Magenta
        health: 36,
        speed: 0.6,
        size: 53,
        shootPattern: 'missile',
        shootRate: 0.5,
        movePattern: 'keep_distance',
        points: 150
    },
    WEAVER: {
        name: 'Weaver',
        color: '#ffff00',        // Yellow
        health: 16,
        speed: 2.2,
        size: 38,
        shootPattern: 'spiral_laser',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 100
    },
    SENTINEL: {
        name: 'Sentinel',
        color: '#00ff00',        // Green
        health: 28,
        speed: 2.0,
        size: 48,
        shootPattern: 'sentinel_sweep',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 140
    }
};

export class Enemy {
    constructor(x, y, type = 'HUNTER', level = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.firingCooldown = getEnemyFiringCooldown(type, level);
        this.initializeEnemy(x, y);
    }
    
    reset(x, y, type = 'HUNTER', level = 1, gameEngine = null) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.firingCooldown = getEnemyFiringCooldown(type, level);
        this.initializeEnemy(x, y, gameEngine);
    }
    
    initializeEnemy(x, y, gameEngine = null) {
        // Use gameField dimensions if available, otherwise fall back to screen dimensions
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        
        this.x = x !== undefined ? x : random(0, fieldWidth);
        this.y = y !== undefined ? y : random(0, fieldHeight);
        
        // Scale health based on level (15% increase per level — gentle curve)
        const levelMultiplier = 1 + (this.level - 1) * 0.15;
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
        
        // Calculate mass based on radius (for collision physics)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.8; // Slightly denser than player
        
        // Scale speed based on level (15% increase per level)
        const speedMultiplier = 1 + (this.level - 1) * 0.15;
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
        this.creationTime = frameClock.now;
        this.lastShot = 0;
        this.firingCooldown = 2000; // Will be set based on type and level
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
        this.lastDirectionChange = frameClock.now;
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
        
        // Weaver spin-up state (initialized lazily in weaverSpinupMovement)
        this.weaverState = undefined;

        // Wasp zigzag movement state (initialized lazily in waspZigzagMovement)
        this.waspZigzagState = undefined;

        // Boulder (Titan) movement state (initialized lazily in boulderMovement)
        this.boulderState = undefined;

        // Sweep laser state (initialized lazily in updateSweepLaserSystem)
        this.sweepState = undefined;

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
        const levelMultiplier = 1 + (this.level - 1) * 0.25;
        return Math.round(baseDamage * levelMultiplier);
    }

    startWarpIn(targetX, targetY) {
        this.warping = true;
        this.warpTargetX = targetX;
        this.warpTargetY = targetY;
        this.warpStartX = this.x;
        this.warpStartY = this.y;
        this.warpStartTime = frameClock.now;
        // Star Trek style: fast stretch toward target, then snap into place
        const dist = Math.hypot(targetX - this.x, targetY - this.y);
        this.warpDuration = Math.min(1200, 400 + dist * 0.4); // 400-1200ms based on distance
        this.warpAngle = Math.atan2(targetY - this.y, targetX - this.x);
        this.faceAngle = this.warpAngle; // Face the warp direction
        this.warpTrail = []; // Store trail positions for streak effect
    }

    updateWarpIn() {
        const now = frameClock.now;
        const elapsed = now - this.warpStartTime;
        const t = Math.min(1, elapsed / this.warpDuration);

        // Star Trek warp curve: slow start, massive acceleration, snap to stop
        // Ease-in-cubic for first 70%, then ease-out for final 30%
        let progress;
        if (t < 0.7) {
            // Accelerating phase — cubic ease-in (slow then fast)
            const p = t / 0.7;
            progress = p * p * p * 0.7;
        } else {
            // Deceleration snap — ease-out (fast then stop)
            const p = (t - 0.7) / 0.3;
            progress = 0.7 + (1 - Math.pow(1 - p, 3)) * 0.3;
        }

        this.x = this.warpStartX + (this.warpTargetX - this.warpStartX) * progress;
        this.y = this.warpStartY + (this.warpTargetY - this.warpStartY) * progress;

        // Store trail points for the streak effect
        this.warpTrail.push({ x: this.x, y: this.y, time: now });
        // Keep trail to last 600ms
        while (this.warpTrail.length > 0 && now - this.warpTrail[0].time > 600) {
            this.warpTrail.shift();
        }

        if (t >= 1) {
            this.warping = false;
            this.x = this.warpTargetX;
            this.y = this.warpTargetY;
            this.warpTrail = [];
        }
    }

    drawWarpEffect(ctx) {
        if (!this.warping || this.warpTrail.length < 2) return;

        const now = frameClock.now;
        const elapsed = now - this.warpStartTime;
        const t = Math.min(1, elapsed / this.warpDuration);

        ctx.save();

        // Star Trek warp streak: elongated light trail behind the ship
        // The trail stretches in the direction of travel
        const dx = Math.cos(this.warpAngle);
        const dy = Math.sin(this.warpAngle);

        // Stretch factor: peaks during acceleration phase (t ~0.4-0.7)
        const stretchIntensity = t < 0.3 ? t / 0.3
            : t < 0.7 ? 1.0
            : 1.0 - (t - 0.7) / 0.3;
        const streakLength = this.radius * (3 + stretchIntensity * 12); // Up to 15x radius

        // Draw the warp streak — bright core fading to transparent tail
        const gradient = ctx.createLinearGradient(
            this.x - dx * streakLength, this.y - dy * streakLength,
            this.x + dx * this.radius, this.y + dy * this.radius
        );

        const c = this.color;
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.3, c + '33');
        gradient.addColorStop(0.7, c + '99');
        gradient.addColorStop(0.9, '#ffffffcc');
        gradient.addColorStop(1, '#ffffffff');

        // Draw tapered streak shape
        const perpX = -dy;
        const perpY = dx;
        const headWidth = this.radius * (0.8 + stretchIntensity * 0.5);
        const tailWidth = this.radius * 0.15;

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(this.x + perpX * headWidth, this.y + perpY * headWidth);
        ctx.lineTo(this.x - perpX * headWidth, this.y - perpY * headWidth);
        ctx.lineTo(this.x - dx * streakLength - perpX * tailWidth,
                   this.y - dy * streakLength - perpY * tailWidth);
        ctx.lineTo(this.x - dx * streakLength + perpX * tailWidth,
                   this.y - dy * streakLength + perpY * tailWidth);
        ctx.closePath();
        ctx.fill();

        // Bright flash at arrival point when snapping in (final 20%)
        if (t > 0.8) {
            const flashAlpha = (1 - (t - 0.8) / 0.2) * 0.6;
            const flashRadius = this.radius * (2 + (1 - flashAlpha) * 3);
            const flash = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, flashRadius);
            flash.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
            flash.addColorStop(0.4, c + Math.round(flashAlpha * 99).toString(16).padStart(2, '0'));
            flash.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = flash;
            ctx.beginPath();
            ctx.arc(this.x, this.y, flashRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    update(playerRef, gameEngine, gameField = null) {
        if (!this.active) return;

        // Handle warp-in — skip normal AI during warp
        if (this.warping) {
            this.updateWarpIn();
            return;
        }

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
        
        // Update shooting (sweep laser system handles itself separately)
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
            const time = frameClock.now * 0.001;
            const fallbackPhase = (time * 2.2 * Math.PI) + this.shield.basePulsePhase; // ~132 BPM equivalent
            musicIntensity = 0.5 + Math.sin(fallbackPhase) * 0.3;
        }
        
        // Store music intensity for use in drawing
        this.shield.currentIntensity = musicIntensity;
        
        // Add random micro-movements for agility
        this.addMicroMovements();
        
        // Add fish-like swimming motion
        this.addFishLikeMovement();
        
        // Update position (scaled for tick rate)
        this.x += this.vel.x * GAME_CONFIG.TICK_SCALE;
        this.y += this.vel.y * GAME_CONFIG.TICK_SCALE;
        
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
            const fieldWidth = GameDimensions.width;
            const fieldHeight = GameDimensions.height;
            
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
        // Weaver and Sentinel control their own faceAngle while spinning/arcing
        if ((this.type === 'WEAVER' || this.type === 'SENTINEL') && (this.weaverState === 'spinning_up' || this.weaverState === 'arcing')) {
            return;
        }

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
        const now = frameClock.now;
        
        switch (this.config.movePattern) {
            case 'chase':
                this.chasePlayer();
                break;
            case 'patrol':
                this.patrolMovement();
                break;
            case 'drifter_wave':
                this.drifterWaveMovement();
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
            case 'weaver_spinup':
                this.weaverSpinupMovement(gameEngine);
                break;
            case 'wasp_zigzag':
                this.waspZigzagMovement();
                break;
            case 'boulder':
                this.boulderMovement();
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
            case 'keep_distance':
                this.keepDistanceMovement();
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
                    const wobble = Math.sin(frameClock.now * 0.01 + this.x * 0.005) * 0.1;
                    this.vel.x += wobble;
                    this.vel.y += Math.cos(frameClock.now * 0.01 + this.y * 0.005) * 0.1;
                }
                break;
            default:
                // Default movement - simple chase
                this.chasePlayer();
                break;
        }
    }
    
    chasePlayer() {
        if (!this.targetPlayer) return;

        const fieldWidth  = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        const now = frameClock.now;

        // ── TANGERINE (Bomber): player-seeking patrol with wall avoidance + mine-stop ──
        if (this.type === 'TANGERINE') {
            // Stop briefly after laying a mine
            if (this.mineJustLaid && now - this.mineJustLaid < 700) {
                this.vel.x *= 0.82;
                this.vel.y *= 0.82;
                return;
            }

            const toPlayer = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
            const distToPlayer = Math.hypot(this.targetPlayer.x - this.x, this.targetPlayer.y - this.y);

            // Lazy-init roaming direction state
            if (!this.bomberRoamDir) {
                this.bomberRoamDir = toPlayer + (Math.random() - 0.5) * Math.PI * 0.5;
                this.bomberRoamChange = now + 800 + Math.random() * 800;
            }

            // Shorter roam intervals; strongly biased toward player when far away
            if (now > this.bomberRoamChange) {
                const spread = distToPlayer > 250 ? 0.35 : 0.85; // tight toward player when far
                this.bomberRoamDir = toPlayer + (Math.random() - 0.5) * Math.PI * spread;
                this.bomberRoamChange = now + 700 + Math.random() * 900;
            }

            // Stronger wall repulsion with larger margin
            const wallMargin = 180;
            let repX = 0, repY = 0;
            if (this.x < wallMargin) repX += ((wallMargin - this.x) / wallMargin) * 0.2;
            if (this.x > fieldWidth  - wallMargin) repX -= ((this.x - (fieldWidth  - wallMargin)) / wallMargin) * 0.2;
            if (this.y < wallMargin) repY += ((wallMargin - this.y) / wallMargin) * 0.2;
            if (this.y > fieldHeight - wallMargin) repY -= ((this.y - (fieldHeight - wallMargin)) / wallMargin) * 0.2;

            // When near wall, blend repulsion with player direction to pull back toward center
            if (Math.hypot(repX, repY) > 0.07) {
                const blendAngle = Math.atan2(
                    repY + Math.sin(toPlayer) * 0.6,
                    repX + Math.cos(toPlayer) * 0.6
                );
                this.bomberRoamDir = blendAngle;
                this.bomberRoamChange = now + 700;
            }

            const acc = 0.042;
            this.vel.x += Math.cos(this.bomberRoamDir) * acc + repX;
            this.vel.y += Math.sin(this.bomberRoamDir) * acc + repY;

            const speed = Math.hypot(this.vel.x, this.vel.y);
            if (speed > this.config.speed) {
                this.vel.x = (this.vel.x / speed) * this.config.speed;
                this.vel.y = (this.vel.y / speed) * this.config.speed;
            }
            return;
        }

        // ── Standard chase for other enemies ──────────────────────────────────
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const acceleration = 0.012;
            let targetVelX = (dx / distance) * acceleration;
            let targetVelY = (dy / distance) * acceleration;

            const weaveAngle = Math.atan2(dy, dx) + Math.PI / 2;
            const weaveStrength = Math.sin(now * 0.002 + this.x * 0.01) * 0.1;
            targetVelX += Math.cos(weaveAngle) * weaveStrength * acceleration;
            targetVelY += Math.sin(weaveAngle) * weaveStrength * acceleration;

            this.vel.x += targetVelX;
            this.vel.y += targetVelY;

            const speed = Math.hypot(this.vel.x, this.vel.y);
            const maxSpeed = this.config.speed * 1.08;
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
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        const centerX = fieldWidth / 2;
        const centerY = fieldHeight / 2;
        const dxCenter = centerX - this.x;
        const dyCenter = centerY - this.y;
        const distanceToCenter = Math.hypot(dxCenter, dyCenter);
        
        // Base patrol pattern (circular movement) with direction changes
        const now = frameClock.now;
        
        // Occasionally change patrol direction for unpredictability
        if (now - this.lastDirectionChange > 3000 && Math.random() < 0.02) {
            this.patrolDirection *= -1;
            this.lastDirectionChange = now;
        }
        
        this.patrolAngle += 0.02 * this.patrolDirection;
        let baseVelX = Math.cos(this.patrolAngle) * this.config.speed;
        let baseVelY = Math.sin(this.patrolAngle) * this.config.speed;
        
        // Add bias toward player if too far away (> 250 pixels) - more aggressive for Drifter
        let playerBias = 0;
        if (distanceToPlayer > 250) {
            playerBias = Math.min(0.6, (distanceToPlayer - 250) / 150); // Stronger bias
            baseVelX += (dx / distanceToPlayer) * playerBias * this.config.speed;
            baseVelY += (dy / distanceToPlayer) * playerBias * this.config.speed;
        }
        
        // Drifter-specific: try to maintain optimal shooting distance (150-200 pixels)
        if (this.type === 'DRIFTER') {
            const optimalDistance = 175;
            const distanceDiff = distanceToPlayer - optimalDistance;
            
            if (Math.abs(distanceDiff) > 50) {
                const approachBias = distanceDiff > 0 ? 0.3 : -0.2; // Move closer if too far, back off if too close
                baseVelX += (dx / distanceToPlayer) * approachBias * this.config.speed;
                baseVelY += (dy / distanceToPlayer) * approachBias * this.config.speed;
            }
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

    // ── Drifter Wave Movement ────────────────────────────────────────────────
    // Orbits the player at a fixed distance (~220 px) using a sinusoidal
    // tangential velocity so it traces an undulating wave arc rather than
    // a clean circle.  The radial component continuously corrects distance.
    drifterWaveMovement() {
        if (!this.targetPlayer) return;

        // Freeze in place while charging or in post-fire cooldown
        if (this.laserCharging || (this.laserCooldown !== undefined && frameClock.now < this.laserCooldown)) {
            this.vel.x = 0;
            this.vel.y = 0;
            return;
        }

        if (this.drifterWavePhase === undefined) {
            this.drifterWavePhase = Math.random() * Math.PI * 2;
            this.drifterOrbitDir  = Math.random() < 0.5 ? 1 : -1;
            this.drifterOptimalDist = 220; // px — fixed orbit distance
        }

        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return;

        // Unit vectors: radial (toward player) and tangential (perpendicular)
        const rx =  dx / dist;
        const ry =  dy / dist;
        const tx = -ry * this.drifterOrbitDir;
        const ty =  rx * this.drifterOrbitDir;

        // Advance sinusoidal phase
        this.drifterWavePhase += 0.042;
        const wave = Math.sin(this.drifterWavePhase); // −1 … +1

        // Radial: proportional correction to reach optimal distance
        const distErr = dist - this.drifterOptimalDist;
        const radialSpeed = Math.sign(distErr) * Math.min(Math.abs(distErr) * 0.06, this.config.speed * 0.8);

        // Tangential: sinusoidal wave (full amplitude at peak)
        const tangentialSpeed = wave * this.config.speed * 1.6;

        this.vel.x = rx * radialSpeed + tx * tangentialSpeed;
        this.vel.y = ry * radialSpeed + ty * tangentialSpeed;
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
        const time = frameClock.now * 0.002; // Much slower oscillation
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
            const radiusVariation = Math.sin(frameClock.now * 0.002) * 30; // Smaller variation
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
            const radiusVariation = Math.sin(frameClock.now * 0.003) * 50; // Varying orbit radius
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
            const wobbleAngle = this.orbitalAngle * 3 + frameClock.now * 0.008;
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
                    const zigzag = Math.sin(frameClock.now * 0.02) * 0.4;
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
        
        const now = frameClock.now;
        
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
        this.knightMoveStartTime = frameClock.now;
    }
    
    spiralBurstMovement() {
        if (!this.targetPlayer) return;
        
        const now = frameClock.now;
        
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
        const heavyWobble = Math.sin(frameClock.now * 0.003) * 0.05;
        this.vel.x += heavyWobble;
        this.vel.y += Math.cos(frameClock.now * 0.003) * 0.05;
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
        
        // All enemy types limited to 1 screen size territory maximum
        switch (this.type) {
            case 'TITAN': return avgScreenSize * 1.0; // Reduced from 1.8 to 1.0
            case 'TANGERINE': return avgScreenSize * 1.0; // Reduced from 1.6 to 1.0
            case 'GUARDIAN': return avgScreenSize * 1.0; // Reduced from 1.4 to 1.0
            case 'HUNTER': return avgScreenSize * 1.0; // Reduced from 1.2 to 1.0
            case 'STALKER': return avgScreenSize * 1.0; // Same as before
            case 'WASP': return avgScreenSize * 0.8; // Same as before
            // Turrets have smaller territories since they're stationary
            case 'DRIFTER': return avgScreenSize * 1.0; // Same as before
            case 'PROWLER': return avgScreenSize * 1.0; // Reduced from 1.8 to 1.0
            case 'WEAVER': return avgScreenSize * 0.8; // Same as before
            case 'SENTINEL': return avgScreenSize * 0.9; // Same as before
            default: return avgScreenSize * 1.0; // Reduced from 1.2 to 1.0
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
        const now = frameClock.now;
        
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
            // WASP: shorter burst, much longer wait; others: standard timing
            this.triangleBurstDuration = this.type === 'WASP' ? 400  : 1000;
            this.triangleWaitDuration  = this.type === 'WASP' ? 2800 : 1800;
            this.burstDirection = { x: 0, y: 0 };
            this.burstStartPos = { x: this.x, y: this.y };
            this.burstDistance = 0;
        }

        this.triangleBurstTimer += 16; // Assume 60fps

        // Screen-based burst distance — WASPs dart farther per burst
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        const minBurstDistance = this.type === 'WASP' ? screenSize / 5 : screenSize / 7;
        const maxBurstDistance = this.type === 'WASP' ? screenSize / 3 : screenSize / 5;

        switch (this.triangleBurstState) {
            case 'waiting':
                // Apply friction to slow down
                this.vel.x *= 0.88;
                this.vel.y *= 0.88;

                if (this.triangleBurstTimer >= this.triangleWaitDuration) {
                    // Choose burst direction — WASPs bias away from player when too close
                    let angle = Math.random() * Math.PI * 2;
                    if (this.type === 'WASP') {
                        const dxP = this.targetPlayer.x - this.x;
                        const dyP = this.targetPlayer.y - this.y;
                        const distP = Math.hypot(dxP, dyP);
                        if (distP < 280) {
                            // Retreat: bias burst in the direction away from player
                            angle = Math.atan2(-dyP, -dxP) + (Math.random() - 0.5) * 0.8;
                        }
                    }
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
            this.tankMoveDuration = 2000; // 2.0 seconds of movement for longer arcs
            this.tankAimDuration = 300; // 0.3 seconds to aim turret (faster, was 500)
            this.tankFiringDuration = 1000; // 1.0 seconds firing window (longer, was 800)
            this.tankRotationDuration = 200; // 0.2 seconds to rotate hull (faster, was 300)
            
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
                // Smart tactical movement - try to flank player
                const dx = this.targetPlayer.x - this.x;
                const dy = this.targetPlayer.y - this.y;
                const distanceToPlayer = Math.hypot(dx, dy);
                
                // Calculate ideal flanking position (perpendicular to player's movement)
                const playerVelX = this.targetPlayer.vel ? this.targetPlayer.vel.x : 0;
                const playerVelY = this.targetPlayer.vel ? this.targetPlayer.vel.y : 0;
                const playerSpeed = Math.hypot(playerVelX, playerVelY);
                
                let targetAngle = this.tankHullAngle;
                
                if (playerSpeed > 0.5) {
                    // Player is moving - try to flank them
                    const playerAngle = Math.atan2(playerVelY, playerVelX);
                    const flankAngle = playerAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
                    
                    // Calculate position to move toward for flanking
                    const flankDistance = 200 + Math.random() * 100; // 200-300 pixels away
                    const flankX = this.targetPlayer.x + Math.cos(flankAngle) * flankDistance;
                    const flankY = this.targetPlayer.y + Math.sin(flankAngle) * flankDistance;
                    
                    targetAngle = Math.atan2(flankY - this.y, flankX - this.x);
                } else {
                    // Player is stationary - circle around them
                    const circleAngle = Math.atan2(dy, dx) + Math.PI/2;
                    targetAngle = circleAngle;
                }
                
                // Smooth rotation toward target angle
                let angleDiff = targetAngle - this.tankHullAngle;
                if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                const rotationSpeed = 0.03; // Faster rotation for better positioning
                this.tankHullAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), rotationSpeed);
                
                // Move forward
                const moveSpeed = this.config.speed * 2.2;
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
                
                // Smart turret aiming with lead prediction
                const aimDx = this.targetPlayer.x - this.x;
                const aimDy = this.targetPlayer.y - this.y;
                const distance = Math.hypot(aimDx, aimDy);
                
                // Calculate player velocity for lead prediction
                const aimPlayerVelX = this.targetPlayer.vel ? this.targetPlayer.vel.x : 0;
                const aimPlayerVelY = this.targetPlayer.vel ? this.targetPlayer.vel.y : 0;
                const aimPlayerSpeed = Math.hypot(aimPlayerVelX, aimPlayerVelY);
                
                // Predict where player will be in 0.5 seconds
                const predictionTime = 0.5;
                const predictedX = this.targetPlayer.x + aimPlayerVelX * predictionTime;
                const predictedY = this.targetPlayer.y + aimPlayerVelY * predictionTime;
                
                // Calculate angle to predicted position
                const predDx = predictedX - this.x;
                const predDy = predictedY - this.y;
                let desiredAngle = Math.atan2(predDy, predDx);
                
                // If player is moving slowly or close, aim directly at player
                if (aimPlayerSpeed < 0.5 || distance < 150) {
                    desiredAngle = Math.atan2(aimDy, aimDx);
                }
                
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
        
        // Initialize wasp strategic movement properties
        if (this.waspMovementState === undefined) {
            this.waspMovementState = {
                zigzagPhase: Math.random() * Math.PI * 2, // Random starting phase
                arcPhase: Math.random() * Math.PI * 2,
                lastDirectionChange: frameClock.now,
                currentDirection: Math.random() * Math.PI * 2, // Random initial direction
                directionChangeInterval: 1200 + Math.random() * 800, // 1.2-2.0 seconds between direction changes (more strategic)
                preferredDistance: 140 + Math.random() * 60, // 140-200 pixels from player (more consistent)
                strategicPhase: 0, // For more controlled movement phases
            };
        }
        
        const state = this.waspMovementState;
        const now = frameClock.now;
        
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distanceToPlayer = Math.hypot(dx, dy);
        const angleToPlayer = Math.atan2(dy, dx);
        
        // Update phases for more controlled motion
        state.zigzagPhase += 0.12; // Slower zig-zag frequency for more controlled movement
        state.arcPhase += 0.05; // Slower arc frequency
        state.strategicPhase += 0.03; // Strategic positioning phase
        
        // Change direction periodically for strategic wasp movement
        if (now - state.lastDirectionChange > state.directionChangeInterval) {
            state.lastDirectionChange = now;
            state.directionChangeInterval = 1000 + Math.random() * 1000; // Longer intervals for more strategic movement
            
            // Strategic positioning based on distance and player movement
            if (Math.random() < 0.7) {
                // Strategic circling - maintain optimal distance
                const circleDirection = Math.random() < 0.5 ? 1 : -1;
                const angleVariation = (Math.random() - 0.5) * 0.4; // Reduced randomness
                state.currentDirection = angleToPlayer + (Math.PI * 0.5 * circleDirection) + angleVariation;
            } else {
                // Strategic approach/retreat based on distance
                if (distanceToPlayer > state.preferredDistance * 1.3) {
                    // Too far - strategic approach
                    state.currentDirection = angleToPlayer + (Math.random() - 0.5) * 0.3; // More precise approach
                } else if (distanceToPlayer < state.preferredDistance * 0.8) {
                    // Too close - strategic retreat
                    state.currentDirection = angleToPlayer + Math.PI + (Math.random() - 0.5) * 0.4; // More controlled retreat
                } else {
                    // Optimal distance - strategic flanking
                    const flankDirection = Math.random() < 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5;
                    state.currentDirection = angleToPlayer + flankDirection + (Math.random() - 0.5) * 0.2;
                }
            }
        }
        
        // Create strategic wasp movement with controlled zig-zag and positioning
        const zigzagIntensity = 0.3; // Reduced zig-zag intensity for more controlled movement
        const arcIntensity = 0.2; // Reduced arc intensity
        const strategicIntensity = 0.4; // Strategic positioning influence
        
        // Combine base direction with controlled motions
        const zigzagOffset = Math.sin(state.zigzagPhase) * zigzagIntensity;
        const arcOffset = Math.sin(state.arcPhase) * Math.cos(state.arcPhase * 0.7) * arcIntensity;
        const strategicOffset = Math.sin(state.strategicPhase) * strategicIntensity;
        
        const finalAngle = state.currentDirection + zigzagOffset + arcOffset + strategicOffset;
        
        // Wasp speed is more consistent with strategic variations
        const baseSpeed = this.config.speed * 1.5; // Slightly reduced base speed
        const speedVariation = 1 + Math.sin(state.strategicPhase * 0.8) * 0.15; // ±15% speed variation (reduced)
        const currentSpeed = baseSpeed * speedVariation;
        
        // Apply movement
        this.vel.x = Math.cos(finalAngle) * currentSpeed;
        this.vel.y = Math.sin(finalAngle) * currentSpeed;
        
        // Face movement direction for realistic wasp orientation
        this.faceAngle = finalAngle;
        
        // Add minimal strategic micro-adjustments (reduced frequency and intensity)
        if (Math.random() < 0.15) { // Reduced frequency
            this.vel.x += (Math.random() - 0.5) * 0.3; // Reduced intensity
            this.vel.y += (Math.random() - 0.5) * 0.3;
        }
        
        // Apply speed limit
        const totalSpeed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 2.2; // Reduced max speed for more controlled movement
        if (totalSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / totalSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / totalSpeed) * maxSpeed;
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
            this.circleRadius = 320; // Much larger distance from player (was 220)
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
        
        // Prowler-specific: Retreat if player gets too close (cautious behavior)
        if (this.type === 'PROWLER' && distanceToPlayer < 180) {
            const retreatStrength = 0.8;
            this.vel.x += (dx / distanceToPlayer) * retreatStrength;
            this.vel.y += (dy / distanceToPlayer) * retreatStrength;
            // Increase orbit radius when retreating
            this.circleRadius = Math.min(400, this.circleRadius + 2);
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
    
    keepDistanceMovement() {
        // Prowler: aggressive dive/strafe/retreat state machine
        if (!this.targetPlayer) return;

        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const now = frameClock.now;

        // Lazy-init state machine
        if (!this.prowlerState) {
            this.prowlerState = 'patrol';
            this.prowlerStateEnd = now + 2000 + Math.random() * 1500;
            this.prowlerStrafeDir = Math.random() > 0.5 ? 1 : -1;
        }

        // State transitions
        if (now > this.prowlerStateEnd) {
            if (this.prowlerState === 'patrol') {
                // Decide: dive in if reasonably close, otherwise keep patrolling
                if (distance < 400) {
                    this.prowlerState = 'dive';
                    this.prowlerStateEnd = now + 700 + Math.random() * 500;
                } else {
                    this.prowlerStrafeDir *= -1; // reverse strafe
                    this.prowlerStateEnd = now + 1500 + Math.random() * 1500;
                }
            } else if (this.prowlerState === 'dive') {
                this.prowlerState = 'retreat';
                this.prowlerStateEnd = now + 1000 + Math.random() * 800;
            } else { // retreat
                this.prowlerState = 'patrol';
                this.prowlerStateEnd = now + 1800 + Math.random() * 1200;
                this.prowlerStrafeDir *= -1;
            }
        }

        const strafeAngle = angle + Math.PI / 2 * this.prowlerStrafeDir;

        switch (this.prowlerState) {
            case 'patrol': {
                // Orbit at ~280px, drifting laterally
                const idealDist = 280 + Math.sin(now * 0.0009) * 40;
                if (distance < idealDist - 30) {
                    this.vel.x += Math.cos(angle + Math.PI) * 0.06;
                    this.vel.y += Math.sin(angle + Math.PI) * 0.06;
                } else if (distance > idealDist + 30) {
                    this.vel.x += Math.cos(angle) * 0.05;
                    this.vel.y += Math.sin(angle) * 0.05;
                }
                // Lateral strafe
                this.vel.x += Math.cos(strafeAngle) * 0.04;
                this.vel.y += Math.sin(strafeAngle) * 0.04;
                break;
            }
            case 'dive': {
                // Rush toward player
                this.vel.x += Math.cos(angle) * 0.18;
                this.vel.y += Math.sin(angle) * 0.18;
                break;
            }
            case 'retreat': {
                // Pull back hard + strafe to avoid return fire
                this.vel.x += Math.cos(angle + Math.PI) * 0.14;
                this.vel.y += Math.sin(angle + Math.PI) * 0.14;
                this.vel.x += Math.cos(strafeAngle) * 0.05;
                this.vel.y += Math.sin(strafeAngle) * 0.05;
                break;
            }
        }

        // Speed cap (dive is faster)
        const maxSpd = this.config.speed * (this.prowlerState === 'dive' ? 3.0 : 1.8);
        const spd = Math.hypot(this.vel.x, this.vel.y);
        if (spd > maxSpd) {
            this.vel.x = (this.vel.x / spd) * maxSpd;
            this.vel.y = (this.vel.y / spd) * maxSpd;
        }

        // Always face the player for aiming
        this.targetFaceAngle = angle;
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
        
        const now = frameClock.now;
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
        const time = frameClock.now * 0.003; // Slower oscillation
        const oscillation = 0.025; // Halved the oscillation strength
        this.vel.x += Math.sin(time + this.x * 0.01) * oscillation;
        this.vel.y += Math.cos(time + this.y * 0.01) * oscillation;
    }
    
    addFishLikeMovement() {
        // Fish-like swimming motion with undulating body movement
        const time = frameClock.now * 0.001; // Convert to seconds
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
        
        const playerDistance = Math.hypot(this.x - this.targetPlayer.x, this.y - this.targetPlayer.y);
        // Limit shooting range to 1 screen maximum
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const avgScreenSize = (screenWidth + screenHeight) / 2;
        const maxShootingRange = Math.min(this.getTerritorySize() * 1.5, avgScreenSize * 1.0);
        
        if (playerDistance > maxShootingRange) return;
        
        // Check line of sight - don't shoot if player is blocked by asteroids
        if (!this.hasLineOfSight(this.targetPlayer, gameEngine)) return;
        
        const now = frameClock.now;
        
        // Wasp machine-gun: fully self-managed state machine
        if (this.config.shootPattern === 'wasp_machinegun') {
            this.updateWaspMachineGun(gameEngine);
            return;
        }

        // Sweep laser has its own timing system
        if (this.config.shootPattern === 'sweep_laser') {
            this.updateSweepLaserSystem(gameEngine);
            return;
        }

        // Sentinel sweep: rotating green beam handled in updateSentinelSweep()
        if (this.config.shootPattern === 'sentinel_sweep') {
            this.updateSentinelSweep(gameEngine);
            return;
        }

        // Spiral laser: shooting is triggered inside weaverSpinupMovement() during arc phase
        if (this.config.shootPattern === 'spiral_laser') return;

        // Aim check: don't fire unless roughly facing the player (~30°).
        // Exempts charging patterns (laser/arc_lightning) which need per-frame calls to advance state.
        const isChargingPattern = this.config.shootPattern === 'laser' || this.config.shootPattern === 'arc_lightning';
        if (!isChargingPattern && this.targetPlayer) {
            const aimDx = this.targetPlayer.x - this.x;
            const aimDy = this.targetPlayer.y - this.y;
            const toPlayer = Math.atan2(aimDy, aimDx);
            let aimDiff = toPlayer - this.faceAngle;
            while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
            while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
            if (Math.abs(aimDiff) > Math.PI / 6) return; // ~30° tolerance
        }

        // Handle burst patterns
        if (this.config.shootPattern === 'burst_3' || this.config.shootPattern === 'burst_2' || this.config.shootPattern === 'square_burst') {
            this.handleBurstShooting(gameEngine, now);
        } else if (isChargingPattern) {
            // Charging patterns need per-frame calls to advance charge state
            this.shoot(gameEngine);
        } else {
            // Handle non-burst patterns (circle_6, homing, etc.)
            // Use level-based firing cooldown instead of shootRate
        if (now - this.lastShot > this.firingCooldown) {
            this.shoot(gameEngine);
            this.lastShot = now;
            // Update cooldown for next shot (in case level changed)
            this.firingCooldown = getEnemyFiringCooldown(this.type, this.level || 1);

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
                this.burstState.shotDelay = 150;
            } else if (this.config.shootPattern === 'burst_2') {
                this.burstState.shotsRemaining = 2;
                this.burstState.shotDelay = 200;
            } else if (this.config.shootPattern === 'square_burst') {
                this.burstState.shotsRemaining = 3;
                this.burstState.shotDelay = 180;
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
                    this.burstState.cooldownUntil = now + 2000;
                } else if (this.config.shootPattern === 'burst_2') {
                    this.burstState.cooldownUntil = now + 1800;
                } else if (this.config.shootPattern === 'square_burst') {
                    this.burstState.cooldownUntil = now + 4000; // 4s cooldown for guardians
                } else {
                    this.burstState.cooldownUntil = now + 1500;
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
            case 'hunter_single':
                this.shootBurst3(gameEngine, targetX, targetY);
                break;
            case 'guardian_spread':
                this.shootGuardianSpread(gameEngine, targetX, targetY);
                break;
            case 'burst_3':
                this.shootBurst3(gameEngine, targetX, targetY);
                break;
            case 'burst_2':
                this.shootBurst2(gameEngine, targetX, targetY);
                break;
            case 'lay_mine':
                this.layMine(gameEngine, targetX, targetY);
                break;
            case 'spiral_laser':
                this.shootSpiralLaser(gameEngine);
                break;
            case 'sweep_laser':
                // handled by updateSweepLaserSystem
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
            case 'titan_rocket':
                this.shootTitanRocket(gameEngine, targetX, targetY);
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
            case 'arc_lightning':
                this.shootArcLightning(gameEngine, targetX, targetY);
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
            case 'sentinel_sweep':
                // handled by updateSentinelSweep()
                break;
            default:
                this.shootAimed(gameEngine, targetX, targetY);
                break;
        }
    }

    // Check if enemy is a stationary turret
    isStationary() {
        return this.config.movePattern === 'stationary' ||
               this.type === 'PROWLER';
    }
    
    shootAimed(gameEngine, targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const angle = Math.atan2(dy, dx);
        // faceAngle is smoothly updated by updateFaceDirection() — no snap here
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
            this.laserTargetAngle = 0;
        }
        
        const now = frameClock.now;
        
        // Handle cooldown after firing
        if (this.laserCooldown > now) {
            return;
        }
        
        if (!this.laserCharging) {
            // Start charging
            this.laserCharging = true;
            this.laserChargeStartTime = now;
            this.laserTargetAngle = Math.atan2(targetY - this.y, targetX - this.x);
        }
        
        const chargeTime = now - this.laserChargeStartTime;
        const maxChargeTime = 1500; // 1.5 seconds to charge - faster and more aggressive
        this.laserCharge = Math.min(1, chargeTime / maxChargeTime);
        
        // Charging particle effects removed - now only player has them
        // if (this.laserCharging && this.laserCharge < 1) {
        //     this.createLaserChargingEffect(gameEngine);
        // }
        
        if (this.laserCharge >= 1) {
            // Fire wide screen-spanning laser beam
            this.createWideLaserBeam(gameEngine, this.laserTargetAngle);
            
            // Reset charging and set cooldown
            this.laserCharging = false;
            this.laserCharge = 0;
            this.laserCooldown = now + 2000; // 2 second cooldown - more aggressive
        }
    }
    
    createLaserChargingEffect(gameEngine) {
        // Charging particle effects removed - now only player has them
        // This method is kept for compatibility but does nothing
        return;
    }

    // ── Arc Lightning (Drifter) ──────────────────────────────────────────────
    // Charges up then fires a jagged cyan lightning bolt toward the player.
    // Reuses laserCharge/laserCharging/laserTargetAngle so existing draw
    // methods (drawLaserTargetingLine, drawLaserChargingBall) still work.
    shootArcLightning(gameEngine, targetX, targetY) {
        if (this.laserCharge === undefined) {
            this.laserCharge = 0;
            this.laserCharging = false;
            this.laserCooldown = 0;
            this.laserTargetAngle = 0;
            this.lightningTargetX = 0;
            this.lightningTargetY = 0;
        }

        const now = frameClock.now;
        if (this.laserCooldown > now) return;

        if (!this.laserCharging) {
            this.laserCharging = true;
            this.laserChargeStartTime = now;
            this.laserTargetAngle = Math.atan2(targetY - this.y, targetX - this.x);
            this.lightningTargetX = targetX;
            this.lightningTargetY = targetY;
        }

        const maxChargeTime = 1200; // ms
        this.laserCharge = Math.min(1, (now - this.laserChargeStartTime) / maxChargeTime);

        if (this.laserCharge >= 1) {
            this.createArcLightningBolt(gameEngine, this.lightningTargetX, this.lightningTargetY);
            this.laserCharging = false;
            this.laserCharge = 0;
            this.laserCooldown = now + 1600;
        }
    }

    // ── Fractal Lightning (Drifter) ──────────────────────────────────────────
    // Builds a recursive midpoint-displacement bolt path, generates branches,
    // stores everything on `this.lightningBolt` for drawLightningBolt(), and
    // drops a handful of zero-velocity bullets along the main spine for damage.
    createArcLightningBolt(gameEngine, targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const totalDist = Math.hypot(dx, dy);
        if (totalDist < 1) return;

        // ── Build fractal main-bolt path ──────────────────────────────────
        const mainPath = this.buildLightningPath(
            this.x, this.y, targetX, targetY, 5  // 5 iterations → 2^5 = 32 segments
        );

        // ── Build branches off random points along the first 70% of the bolt ─
        const branches = [];
        const numBranches = 2 + Math.floor(Math.random() * 3); // 2-4
        for (let b = 0; b < numBranches; b++) {
            const startIdx = Math.floor(mainPath.length * (0.12 + Math.random() * 0.58));
            const origin   = mainPath[startIdx];
            const mainAngle = Math.atan2(dy, dx);
            const branchAngle  = mainAngle + (Math.random() - 0.5) * Math.PI * 0.9;
            const branchLength = totalDist * (0.18 + Math.random() * 0.32);
            const branchPath = this.buildLightningPath(
                origin.x, origin.y,
                origin.x + Math.cos(branchAngle) * branchLength,
                origin.y + Math.sin(branchAngle) * branchLength,
                3  // 3 iterations → 8 segments per branch
            );
            branches.push({ path: branchPath, depth: 1 });

            // Occasional sub-branch off a branch
            if (Math.random() < 0.55) {
                const si = Math.floor(branchPath.length * (0.3 + Math.random() * 0.4));
                const so = branchPath[si];
                const subAngle  = branchAngle + (Math.random() - 0.5) * Math.PI * 0.7;
                const subLength = branchLength * (0.25 + Math.random() * 0.3);
                const subPath = this.buildLightningPath(
                    so.x, so.y,
                    so.x + Math.cos(subAngle) * subLength,
                    so.y + Math.sin(subAngle) * subLength,
                    2
                );
                branches.push({ path: subPath, depth: 2 });
            }
        }

        // ── Store for canvas rendering ────────────────────────────────────
        this.lightningBolt = {
            mainPath,
            branches,
            startTime: frameClock.now,
            lifetime: 460  // ms total display duration
        };

        // ── Damage bullets along main spine (every 5th point) ────────────
        if (gameEngine?.enemyBulletPool) {
            const step = Math.max(1, Math.floor(mainPath.length / 8));
            for (let i = 0; i < mainPath.length; i += step) {
                const pt = mainPath[i];
                const b = gameEngine.enemyBulletPool.get();
                if (b) {
                    b.reset(pt.x, pt.y, 0, 0, '#44ffff', false);
                    b.radius = 5;
                    b.glowRadius = 0; // visual handled by drawLightningBolt
                    b.damage = this.getLevelScaledDamage(2);
                    b.maxLifetimeOverride = 460;
                    b.life = 1.0;
                }
            }
        }

        // ── Impact sparks ─────────────────────────────────────────────────
        if (gameEngine?.particlePool) {
            for (let i = 0; i < 14; i++) {
                const p = gameEngine.particlePool.get(targetX, targetY, 'starSparkle');
                if (p) {
                    const a = Math.random() * Math.PI * 2;
                    const s = 2 + Math.random() * 6;
                    p.vel.x = Math.cos(a) * s;
                    p.vel.y = Math.sin(a) * s;
                    p.color = '#88ffff';
                    p.radius = 1.5 + Math.random() * 3;
                    p.life   = 18 + Math.random() * 20;
                }
            }
        }
    }

    // Iterative midpoint-displacement: each pass halves segment lengths and
    // displaces midpoints perpendicular to the original line.
    buildLightningPath(x1, y1, x2, y2, iterations) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

        const perpX = -dy / len;
        const perpY =  dx / len;

        let pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        let disp = len * 0.38;

        for (let iter = 0; iter < iterations; iter++) {
            const next = [pts[0]];
            for (let j = 1; j < pts.length; j++) {
                const mid = {
                    x: (pts[j - 1].x + pts[j].x) * 0.5 + perpX * (Math.random() - 0.5) * disp,
                    y: (pts[j - 1].y + pts[j].y) * 0.5 + perpY * (Math.random() - 0.5) * disp
                };
                next.push(mid, pts[j]);
            }
            pts  = next;
            disp *= 0.58;  // fractal roughness: smaller each pass
        }
        return pts;
    }

    // Draw stored lightning bolt (canvas lines, NOT bullet pool visuals).
    // Called every frame from draw() until the bolt expires.
    drawLightningBolt(ctx) {
        if (!this.lightningBolt) return;
        const now = frameClock.now;
        const age = now - this.lightningBolt.startTime;
        if (age >= this.lightningBolt.lifetime) {
            this.lightningBolt = null;
            return;
        }

        const t = age / this.lightningBolt.lifetime;
        // Brightest at start, fast fade
        const baseAlpha = Math.pow(1 - t, 1.2);
        // Intense white flash during the first 80 ms
        const flash = age < 80 ? (1 - age / 80) * 0.9 : 0;
        const alpha = Math.min(1, baseAlpha + flash);

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        const drawStroke = (pts, widthMult, alphaMult) => {
            if (pts.length < 2) return;
            const a = alpha * alphaMult;

            // Wide outer glow
            // OPT-2: live GPU blur removed — multi-pass stroke provides glow
            ctx.shadowBlur   = 0;
            ctx.shadowColor  = '#00e8ff';
            ctx.strokeStyle  = rgba(0, 200, 255, 0.28 * a);
            ctx.lineWidth    = 14 * widthMult;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();

            // Mid glow
            ctx.shadowBlur   = 0;
            ctx.strokeStyle  = rgba(80, 230, 255, 0.60 * a);
            ctx.lineWidth    = 5 * widthMult;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();

            // Bright white core
            ctx.shadowBlur   = 0;
            ctx.shadowColor  = '#ffffff';
            ctx.strokeStyle  = rgba(220, 255, 255, 0.95 * a);
            ctx.lineWidth    = 1.8 * widthMult;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
        };

        // Main bolt (full thickness)
        drawStroke(this.lightningBolt.mainPath, 1.0, 1.0);

        // Branches (thinner / more transparent by depth)
        for (const branch of this.lightningBolt.branches) {
            const wm = branch.depth === 1 ? 0.55 : 0.28;
            const am = branch.depth === 1 ? 0.75 : 0.50;
            drawStroke(branch.path, wm, am);
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    createWideLaserBeam(gameEngine, angle) {
        // Limit beam to ~1 screen length
        const screenWidth = gameEngine.canvas.width;
        const screenHeight = gameEngine.canvas.height;
        const avgScreenSize = (screenWidth + screenHeight) / 2;
        const beamLength = avgScreenSize * 0.8; // Limited to ~0.8 screen size
        const beamWidth = 80; // Wide beam
        
        // Create the main laser beam as a series of wide bullets
        const segments = Math.floor(beamLength / 20); // One segment every 20 pixels
        
        for (let i = 0; i < segments; i++) {
            const distance = i * 20;
            const x = this.x + Math.cos(angle) * distance;
            const y = this.y + Math.sin(angle) * distance;
            
            // Create multiple bullets across the width for wide beam effect
            const widthSegments = 8;
            for (let w = 0; w < widthSegments; w++) {
                const widthOffset = (w - widthSegments/2) * (beamWidth / widthSegments);
                const perpAngle = angle + Math.PI/2;
                const beamX = x + Math.cos(perpAngle) * widthOffset;
                const beamY = y + Math.sin(perpAngle) * widthOffset;
                
                // Create bullet at the calculated beam position
                const bullet = gameEngine.enemyBulletPool.get();
                if (bullet) {
                    bullet.reset(
                        beamX,
                        beamY,
                        Math.cos(angle) * 15,
                        Math.sin(angle) * 15,
                        '#ff0000',
                        false
                    );
                    bullet.radius = 4;
                    bullet.glowRadius = 12;
                    bullet.damage = this.getLevelScaledDamage(3);
                    bullet.movementPattern = 'laser_beam';
                    bullet.life = 0.3;
                }
            }
        }
        
        // Create massive explosion effect at firing point
        for (let i = 0; i < 30; i++) {
            const flashAngle = angle + (Math.random() - 0.5) * 1.0;
            const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
            if (particle) {
                particle.color = '#ff0000';
                particle.vel.x = Math.cos(flashAngle) * (5 + Math.random() * 8);
                particle.vel.y = Math.sin(flashAngle) * (5 + Math.random() * 8);
                particle.radius = 3 + Math.random() * 4;
            }
        }
        
        // Screen shake for powerful laser (only if on screen)
        if (gameEngine.isEntityOnScreen(this)) {
            gameEngine.triggerScreenShake(30, 20, 100);
        }
    }
    
    shootMissile(gameEngine, targetX, targetY) {
        if (this.type === 'TITAN') {
            // Titan tank - purple accelerating missile fired from turret
            const turretAngle = this.tankTurretAngle || 0;
            
            // Fire straight from turret direction (accelerating missile) with very slow initial speed
            const titanConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_TOMAHAWK;
            this.createEnemyBullet(gameEngine, turretAngle, titanConfig.INITIAL_SPEED, '#8A2BE2', true, 'titan_tonahawk', null);
        } else {
            // Prowler - fires missile in the direction the ship is facing
            const angle = this.faceAngle;
            const bullet = this.createEnemyBullet(gameEngine, angle, 12, '#cc44ff', true, 'missile_fast_slow');
            if (bullet) {
                // Spawn from the front of the ship
                const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
                const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
                bullet.x = frontX; bullet.y = frontY;
                bullet.startX = frontX; bullet.startY = frontY;
                bullet.shape = 'missile_shape';
                bullet.targetPlayer = this.targetPlayer;
                bullet.rotation = angle;
                bullet.rotationSpeed = 0;
                bullet.radius = 7;
                bullet.glowRadius = 14;
                bullet.color = '#cc44ff';
                bullet.damage = this.getLevelScaledDamage(3);
                bullet.maxLifetimeOverride = 8000;
            }
        }
    }
    
    shootPulse(gameEngine, targetX, targetY) {
        // Fire 3 rapid pulses toward target
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        // faceAngle smoothly updated by updateFaceDirection() — no snap
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                if (this.active) {
                    this.createEnemyBullet(gameEngine, baseAngle, 4, '#ffff00', false, 'pulse');
                }
            }, i * 100);
        }
    }

    shootSpiralLaser(gameEngine) {
        // Fire a yellow laser in the current faceAngle — called while spinning during arc phase
        const bullet = this.createEnemyBullet(gameEngine, this.faceAngle, 6, '#ffff44', false, 'aimed');
        if (bullet) {
            bullet.radius = 3;
            bullet.glowRadius = 8;
            bullet.damage = this.getLevelScaledDamage(2);
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
        // Hunter - fires in the direction the ship is facing
        const angle = this.faceAngle;
        const bullet = this.createEnemyBullet(gameEngine, angle, 4, '#ff4444', false, 'aimed');
        if (bullet) {
            // Spawn from the front of the ship
            const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
            const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
            bullet.x = frontX; bullet.y = frontY;
            bullet.startX = frontX; bullet.startY = frontY;
            bullet.shape = 'triangle';
            bullet.rotation = angle; // Point in travel direction
            bullet.rotationSpeed = 0.1; // Spin as they fly
            bullet.radius = 7;
            bullet.glowRadius = 14;
            bullet.maxLifetimeOverride = 10000; // Long-range single shot — ~1120px
        }
    }

    shootBurst2(gameEngine, targetX, targetY) {
        // Legacy burst_2 — small random spread
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const baseAngle = Math.atan2(dy, dx);
        // faceAngle smoothly updated by updateFaceDirection() — no snap
        const spread = 0.15;
        const angle = baseAngle + (Math.random() - 0.5) * spread;
        this.createEnemyBullet(gameEngine, angle, 3.5, this.color, false, 'aimed');
    }

    updateWaspMachineGun(gameEngine) {
        // 2-3s rapid fire, then 2-3s reload — self-managed state machine
        if (!this.targetPlayer) return;
        const now = frameClock.now;
        if (this.waspGunState === undefined) {
            this.waspGunState = 'firing';
            this.waspGunPhaseStart = now;
            this.waspGunPhaseDuration = 4000 + Math.random() * 1000; // 4-5s firing phase
            this.waspGunLastShot = 0;
            this.waspSinePhase = 0; // global phase tracker for coherent wave
        }
        // Advance global phase each call (~60fps) so it stays in sync with bullet sineFreq
        this.waspSinePhase = (this.waspSinePhase || 0) + 0.12;

        if (now - this.waspGunPhaseStart > this.waspGunPhaseDuration) {
            this.waspGunState = this.waspGunState === 'firing' ? 'charging' : 'firing';
            this.waspGunPhaseStart = now;
            // 4-5s firing, 2-3s reloading
            this.waspGunPhaseDuration = this.waspGunState === 'firing' ? 4000 + Math.random() * 1000 : 2000 + Math.random() * 1000;
        }
        if (this.waspGunState === 'firing' && now - this.waspGunLastShot > 520) {
            // Aim check before firing — 30° tolerance
            const aimDx = this.targetPlayer.x - this.x;
            const aimDy = this.targetPlayer.y - this.y;
            const toPlayer = Math.atan2(aimDy, aimDx);
            let aimDiff = toPlayer - this.faceAngle;
            while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
            while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
            if (Math.abs(aimDiff) <= Math.PI / 6) {
                this.shootWaspBullet(gameEngine, this.targetPlayer.x, this.targetPlayer.y);
            }
            this.waspGunLastShot = now;
        }
    }

    shootWaspBullet(gameEngine, targetX, targetY) {
        // Wasp - fires yellow circle in the direction the ship is facing
        const angle = this.faceAngle;
        const bullet = this.createEnemyBullet(gameEngine, angle, 6, '#ffff44', false, 'sine_wave_nospin');
        if (bullet) {
            // Spawn from the front of the ship
            const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
            const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
            bullet.x = frontX; bullet.y = frontY;
            bullet.startX = frontX; bullet.startY = frontY;
            bullet.shape = null; // circle (default)
            bullet.rotation = 0;
            bullet.rotationSpeed = 0;
            bullet.radius = 3.5;
            bullet.glowRadius = 6;
            bullet.color = '#ffff44';
            bullet.damage = this.getLevelScaledDamage(1);
            bullet.maxLifetimeOverride = 12000; // 2x extended range
            // Synchronized phase: all bullets from this wasp share the same phase
            bullet.sineAmp   = 2.2;
            bullet.sineFreq  = 0.12;
            bullet.sinePhase = this.waspSinePhase || 0;
            bullet.sinePerpX = -Math.sin(angle);
            bullet.sinePerpY =  Math.cos(angle);
        }
    }

    shootGuardianSpread(gameEngine, targetX, targetY) {
        // Guardian - 5-bullet fan spread alternating between rectangles and triangles
        // Each volley fires the same shape; shapes alternate: 0=rectangle, 1=triangle
        // All bullets originate from the front face of the Guardian, firing in faceAngle direction
        const baseAngle = this.faceAngle;

        // Front spawn point (center of forward face)
        const frontX = this.x + Math.cos(baseAngle) * this.radius;
        const frontY = this.y + Math.sin(baseAngle) * this.radius;

        // Advance the shared sinusoidal phase each volley so successive volleys stay coherent
        if (this.guardianSinePhase === undefined) this.guardianSinePhase = 0;
        this.guardianSinePhase += 0.45;

        // Track which volley we're on (even = rectangle/square, odd = triangle)
        if (this.guardianVolleyIndex === undefined) this.guardianVolleyIndex = 0;
        const shape = (this.guardianVolleyIndex % 2 === 0) ? 'square' : 'triangle';
        this.guardianVolleyIndex++;

        const offsets = [-0.5, -0.25, 0, 0.25, 0.5];
        for (const offset of offsets) {
            const angle = baseAngle + offset;
            const bullet = this.createEnemyBullet(gameEngine, angle, 4.5, '#44ff44', false, 'sine_wave_nospin');
            if (bullet) {
                // Override spawn to come from the front face
                bullet.x = frontX;
                bullet.y = frontY;
                bullet.startX = frontX;
                bullet.startY = frontY;
                bullet.shape = shape;
                bullet.rotation = angle;
                bullet.rotationSpeed = 0;    // no spin
                bullet.radius = 6;
                bullet.glowRadius = 12;
                bullet.color = '#44ff44';
                bullet.damage = this.getLevelScaledDamage(2);
                bullet.maxLifetimeOverride = 5000;
                bullet.sineAmp   = 2.5;
                bullet.sineFreq  = 0.10;
                bullet.sinePhase = this.guardianSinePhase; // same phase for all = in-phase wave
                bullet.sinePerpX = -Math.sin(angle);
                bullet.sinePerpY =  Math.cos(angle);
            }
        }
    }

    layMine(gameEngine, targetX, targetY) {
        // Tangerine/Bomber - drop a homing proximity mine that slowly crawls toward the player
        if (!gameEngine.enemyBulletPool) return;
        const mine = gameEngine.enemyBulletPool.get();
        if (!mine) return;
        mine.reset(this.x, this.y, 0, 0, '#ff8844', false);
        mine.shape = 'mine';
        mine.isPersistent = true;
        mine.maxLifetimeOverride = 60000; // 60-second lifetime
        mine.radius = 12;
        mine.glowRadius = 22;
        mine.damage = this.getLevelScaledDamage(4);
        mine.movementPattern = 'homing_mine'; // slowly crawl toward player
        mine.rotation = Math.random() * Math.PI * 2;
        mine.rotationSpeed = 0.015;
        mine.targetPlayer = this.targetPlayer;
        // Health scales with Tangerine level
        const baseHealth = 5;
        mine.maxHealth = Math.floor(baseHealth * (1 + (this.level - 1) * 0.25));
        mine.health = mine.maxHealth;
        // Signal bomber to briefly stop after laying this mine
        this.mineJustLaid = frameClock.now;
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
    
    shootTitanRocket(gameEngine, targetX, targetY) {
        // Titan tank - fast direct rockets
        const turretAngle = this.tankTurretAngle || 0;
        
        // Fire fast rocket directly at player
        this.createEnemyBullet(gameEngine, turretAngle, ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.SPEED, '#ff44ff', false, 'titan_rocket', null);
    }
    
    shootChargedLaser(gameEngine, targetX, targetY) {
        // STALKER - fires laser in the direction the ship is facing
        this.createLaserBeam(gameEngine, this.faceAngle);
    }
    
    createLaserBeam(gameEngine, angle) {
        if (!gameEngine) return;
        
        // Create close-range laser slice
        const beamLength = 150; // Close-range slice (half screen)
        const beamWidth = 30; // Narrower beam for close-range attack
        const segments = 8; // Number of beam segments for visual effect
        
        // Spawn from the front of the ship (faceAngle direction)
        const startX = this.x + Math.cos(this.faceAngle) * this.radius;
        const startY = this.y + Math.sin(this.faceAngle) * this.radius;
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
                    Math.cos(angle) * 4, // Much slower speed for better gameplay
                    Math.sin(angle) * 4,
                    '#44ffff', // Cyan laser color
                    false
                );
                
                laserBullet.radius = 2 + Math.abs(offset) * 0.05; // Thinner for close-range
                laserBullet.glowRadius = 6 + Math.abs(offset) * 0.1;
                laserBullet.damage = this.getLevelScaledDamage(3); // Moderate damage for close-range
                laserBullet.movementPattern = 'laser_beam';
                laserBullet.deathBurst = true; // Fade and burst with particles on expire
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
        
        // No screen shake for enemy attacks - only player-related events should shake
    }
    
    shootCrescentWave(gameEngine, targetX, targetY) {
        // GUARDIAN - crescent energy beam like Stalker's laser but curved
        const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
        // faceAngle smoothly updated by updateFaceDirection() — no snap
        this.createCrescentBeam(gameEngine, baseAngle);
    }
    
    createCrescentBeam(gameEngine, baseAngle) {
        if (!gameEngine) return;
        
        // Crescent beam parameters
        const beamLength = 200; // Close-range crescent (half screen)
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
                    laserBullet.damage = this.getLevelScaledDamage(2); // Reduced from 5 to 2 - much lower damage
                    laserBullet.movementPattern = 'crescent_slice';
                    laserBullet.life = 0.15; // Reduced from 0.25 for ~1 screen range
                    laserBullet.maxLife = 0.15; // Store max life for opacity calculations
                    
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
        
        // No screen shake for enemy attacks - only player-related events should shake
    }
    
    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) {
        if (!gameEngine.enemyBulletPool) return null;

        // Accuracy jitter — low-level enemies aim poorly (up to ±0.35 rad at level 1, 0 at level 5+)
        const aimJitter = Math.max(0, 0.35 * (1 - (this.level - 1) / 4));
        if (aimJitter > 0) {
            angle += (Math.random() - 0.5) * 2 * aimJitter;
        }

        // Apply level scaling to bullet speed using constants
        // Titan rockets are exempt from global speed reduction for better effectiveness
        const isTitanRocket = movementPattern === 'titan_rocket';
        const baseSpeedMultiplier = isTitanRocket ? 1.0 : ENEMY_BULLET_CONFIG.BASE_SPEED_MULTIPLIER;
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
            
            // Make titan rockets fast and powerful
            if (movementPattern === 'titan_rocket') {
                bullet.radius = 5; // Medium-large rockets
                bullet.glowRadius = 10; // Strong glow effect
                bullet.damage = this.getLevelScaledDamage(ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.DAMAGE);
                
                // Set rocket properties from constants
                const rocketConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET;
                bullet.maxDistance = rocketConfig.MAX_DISTANCE;
                bullet.rocketSpeed = rocketConfig.SPEED;
            }
            
            // Make laser bullets more visible and powerful
            if (movementPattern === 'laser') {
                bullet.radius = 5; // Larger laser bullets
                bullet.glowRadius = 15; // Strong glow effect
                bullet.damage = this.getLevelScaledDamage(2); // Reduced from 8 to 2 - much lower damage
                bullet.life = 0.4; // Reduced from 0.8 for ~1 screen range
            }
            
            // Make missile turret bullets larger and spiky
            if (movementPattern === 'missile_decelerate') {
                bullet.radius = 6; // Large spiky orbs
                bullet.glowRadius = 12; // Strong glow
                bullet.damage = this.getLevelScaledDamage(5); // High damage
                
                // Set level-scaled max distance and deceleration for Prowler missiles
                const turretConfig = ENEMY_BULLET_CONFIG.MISSILE.PROWLER_PIKE;
                bullet.maxDistance = turretConfig.MAX_DISTANCE;
                
                // Scale deceleration and initial speed based on level
                const levelProgress = Math.min(1, (this.level - 1) / 5); // Normalize to 0-1 over 6 levels
                bullet.deceleration = turretConfig.MIN_DECELERATION + 
                    (turretConfig.MAX_DECELERATION - turretConfig.MIN_DECELERATION) * levelProgress;
                bullet.initialSpeed = turretConfig.MIN_INITIAL_SPEED + 
                    (turretConfig.MAX_INITIAL_SPEED - turretConfig.MIN_INITIAL_SPEED) * levelProgress;
            }
            
            // Set unique movement pattern for this bullet
            bullet.movementPattern = movementPattern;
            bullet.patternTimer = 0;
            bullet.patternPhase = Math.random() * Math.PI * 2; // Random starting phase
            
            // Scale bullet range with enemy level — 15% more range per level
            // Base 600px; level 5 = ~960px (half screen), level 8+ = full screen
            bullet.maxRange = 600 * (1 + (this.level - 1) * 0.15);
            
            // For homing missiles and homing shots, provide player reference
            if (movementPattern === 'missile' || movementPattern === 'homing' || movementPattern === 'titan_homing') {
                bullet.targetPlayer = target || this.targetPlayer;
            }
            
            // Titan accelerating missiles don't need target reference (they fly straight)

            // Enemy shooting sounds removed to reduce audio confusion
            return bullet;
        }
        return null;
    }
    

    
    draw(ctx) {
        if (!this.active) return;

        // Draw warp streak effect (behind everything)
        if (this.warping) {
            this.drawWarpEffect(ctx);
        }

        // Draw laser targeting line first (behind everything else)
        if (this.type === 'DRIFTER' && this.laserCharging && this.laserCharge > 0) {
            this.drawLaserTargetingLine(ctx);
        }

        // Draw TITAN sweep laser (behind enemy body)
        if (this.type === 'TITAN' && this.sweepState && this.sweepState !== 'idle' && this.sweepState !== 'cooldown') {
            this.drawSweepLaser(ctx);
        }


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

        // Hit flash — non-rotating square burst with debris (world-space)
        if (this._hitFlashTimer > 0) {
            const maxT = 6;
            const t = this._hitFlashTimer;
            const alpha = t / maxT;
            const progress = 1 - alpha;
            const fr = this.radius * 1.15;
            const hfT = frameClock.now * 0.001;

            // Slight jitter on the main flash
            const jx = Math.sin(hfT * 141) * 2;
            const jy = Math.cos(hfT * 179) * 2;
            const cx = this.x + jx;
            const cy = this.y + jy;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Main flash square — bright, non-rotating
            const flashAlpha = alpha * alpha * 0.85; // quadratic falloff, starts very bright
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);

            // Debris squares bursting outward
            const seed = ((this.x * 7.3 + this.y * 13.7) | 0) & 0xffff;
            const debrisCount = 7;
            const colors = [
                '255,255,255',
                '120,235,255',
                '255,90,210',
                '255,255,150',
                '190,150,255',
                '255,255,255',
                '120,235,255',
            ];
            for (let i = 0; i < debrisCount; i++) {
                const angle = (i / debrisCount) * Math.PI * 2 + (seed + i * 137) % 100 * 0.063;
                const speed = 0.7 + ((seed + i * 31) % 10) * 0.06;
                const dist = progress * fr * 3.0 * speed;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                // Size: starts visible, shrinks as it flies out
                const sz = fr * (0.28 - progress * 0.18);
                if (sz <= 0) continue;

                const debrisAlpha = alpha * 0.55 * (1 - progress * 0.5);
                ctx.fillStyle = `rgba(${colors[i]}, ${debrisAlpha})`;
                ctx.fillRect(cx + dx - sz, cy + dy - sz, sz * 2, sz * 2);
            }

            ctx.restore();
            this._hitFlashTimer--;
        }

        // Draw laser charging ball (outside of transform, in front of drifter)
        if (this.type === 'DRIFTER' && this.laserCharging && this.laserCharge > 0) {
            this.drawLaserChargingBall(ctx);
        }

        // Draw fractal lightning bolt (Drifter) — canvas-rendered, not bullet pool
        if (this.type === 'DRIFTER' && this.lightningBolt) {
            this.drawLightningBolt(ctx);
        }
        
        // Draw pulsating circle only when targeted (outside of transform)
        if (window.gameEngine && window.gameEngine.targetedEntity === this) {
            this.drawPulsatingCircle(ctx);
        }
        
        // Draw health bar (outside of transform)
        this.drawHealthBar(ctx);

        // Draw level + name label BENEATH the enemy (only after first hit)
        if (showEnemyNames() && this.health < this.maxHealth) {
            ctx.save();
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';

            const lvText   = 'LV';
            const numText  = String(this.level || 1);
            const nameText = ' ' + this.config.name.toUpperCase();

            ctx.font = '13px "Silkscreen", monospace';
            const lvWidth   = ctx.measureText(lvText).width;
            const numWidth  = ctx.measureText(numText).width;
            const nameWidth = ctx.measureText(nameText).width;
            const startX = this.x - (lvWidth + numWidth + nameWidth) / 2;
            const textY  = this.y + this.radius + 10;

            // OPT: double-draw glow instead of shadowBlur
            // First pass: slightly larger font at low alpha for glow
            ctx.globalAlpha = 0.4;
            ctx.font = '14px "Silkscreen", monospace';

            ctx.fillStyle = '#ffffff';
            ctx.fillText(lvText, startX, textY);
            ctx.fillStyle = '#88ccff';
            ctx.fillText(numText, startX + lvWidth, textY);
            ctx.fillStyle = 'goldenrod';
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            // Second pass: crisp text on top at full alpha
            ctx.globalAlpha = 1.0;
            ctx.font = '13px "Silkscreen", monospace';

            ctx.fillStyle = '#ffffff';   // "LV" — white
            ctx.fillText(lvText, startX, textY);

            ctx.fillStyle = '#88ccff';   // level number — light blue
            ctx.fillText(numText, startX + lvWidth, textY);

            ctx.fillStyle = 'goldenrod'; // enemy name — goldenrod
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            ctx.restore();
        }
    }
    
    drawLaserTargetingLine(ctx) {
        // Draw targeting line showing where the charged attack will fire
        if (!this.laserTargetAngle) return;

        ctx.save();

        const gameEngine = window.gameEngine;
        if (!gameEngine) return;

        const screenDiagonal = Math.hypot(gameEngine.canvas.width, gameEngine.canvas.height);
        const lineLength = screenDiagonal * 1.2;

        const endX = this.x + Math.cos(this.laserTargetAngle) * lineLength;
        const endY = this.y + Math.sin(this.laserTargetAngle) * lineLength;

        const basePulse = Math.sin(frameClock.now * 0.08) * 0.3 + 0.7;
        const chargeAlpha = this.laserCharge * 0.6 + 0.2;
        const finalAlpha = basePulse * chargeAlpha;

        // Cyan for Drifter arc lightning, red for other lasers
        const lineColor = this.type === 'DRIFTER'
            ? rgba(0, 220, 255, finalAlpha)
            : rgba(255, 0, 0, finalAlpha);

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3 + this.laserCharge * 2;
        ctx.setLineDash([10, 5]);

        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.restore();
    }
    
    drawLaserChargingBall(ctx) {
        // Draw growing energy ball in front of the enemy while charging
        if (!this.laserTargetAngle || this.laserCharge <= 0) return;

        ctx.save();

        const ballDistance = this.radius + 15;
        const ballX = this.x + Math.cos(this.laserTargetAngle) * ballDistance;
        const ballY = this.y + Math.sin(this.laserTargetAngle) * ballDistance;

        const maxBallRadius = 40;
        const ballRadius = this.laserCharge * maxBallRadius;
        const pulseIntensity = Math.sin(frameClock.now * 0.02) * 0.3 + 0.7;

        // Drifter uses cyan lightning ball; others use red
        const isDrifter = this.type === 'DRIFTER';
        const c1 = isDrifter ? rgba(0, 220, 255, 0.8 * pulseIntensity) : rgba(255, 0, 0, 0.8 * pulseIntensity);
        const c2 = isDrifter ? rgba(0, 160, 255, 0.4 * pulseIntensity) : rgba(255, 100, 0, 0.4 * pulseIntensity);
        const c3 = isDrifter ? 'rgba(0, 220, 255, 0)'                        : 'rgba(255, 0, 0, 0)';
        const c4 = isDrifter ? rgba(0, 200, 255, 0.9 * pulseIntensity)  : rgba(255, 50, 0, 0.9 * pulseIntensity);
        const cSpark = isDrifter ? rgba(100, 255, 255, 0.6 * pulseIntensity) : rgba(255, 255, 0, 0.6 * pulseIntensity);

        // Outer glow
        const gradient = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, ballRadius * 2);
        gradient.addColorStop(0,   c1);
        gradient.addColorStop(0.5, c2);
        gradient.addColorStop(1,   c3);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Main energy ball
        ctx.fillStyle = c4;
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = rgba(255, 255, 255, 0.7 * pulseIntensity);
        ctx.beginPath();
        ctx.arc(ballX, ballY, ballRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Orbiting sparks
        if (this.laserCharge > 0.3) {
            for (let i = 0; i < 6; i++) {
                const sparkAngle = (i / 6) * Math.PI * 2 + frameClock.now * 0.005;
                const sparkDist = ballRadius + 10 + Math.sin(frameClock.now * 0.01 + i) * 5;
                const sparkX = ballX + Math.cos(sparkAngle) * sparkDist;
                const sparkY = ballY + Math.sin(sparkAngle) * sparkDist;

                ctx.fillStyle = cSpark;
                ctx.beginPath();
                ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
    
    drawTargetingEffect(ctx) {
        ctx.save();
        
        // Pulsing glow effect
        const time = frameClock.now * 0.003;
        const pulseIntensity = 0.5 + Math.sin(time) * 0.3;
        
        // Calculate center position (adjust for Guardian visual offset)
        let centerX = this.x;
        let centerY = this.y;
        
        // Guardian-specific adjustment to center the targeting circle better
        if (this.type === 'GUARDIAN') {
            // Adjust forward to account for Guardian's visual center offset
            centerX += Math.cos(this.faceAngle) * (this.radius * 0.3);
            centerY += Math.sin(this.faceAngle) * (this.radius * 0.3);
        }
        
        // Outer glow — shadowBlur on stroked arcs (ring outline, not fillable)
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
            case 'TANGERINE':
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
        // Predatory hunter fighter — swept wings, engine glow, cockpit
        const size = this.radius * 0.9;
        const t = frameClock.now * 0.001;
        const pulse = 0.82 + Math.sin(t * 3.8) * 0.18;

        ctx.save();

        // ── Main elongated body ───────────────────────────────────────────────
        ctx.fillStyle = '#1a0000';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(size * 1.15, 0);            // sharp nose
        ctx.lineTo(size * 0.18, -size * 0.3);  // upper shoulder
        ctx.lineTo(-size * 0.52, -size * 0.2); // upper rear
        ctx.lineTo(-size * 0.72, 0);           // tail center
        ctx.lineTo(-size * 0.52, size * 0.2);  // lower rear
        ctx.lineTo(size * 0.18, size * 0.3);   // lower shoulder
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Swept wings ───────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255, 40, 40, 0.15)';
        ctx.strokeStyle = '#ff6666';
        ctx.lineWidth = 1.5;
        // Upper wing
        ctx.beginPath();
        ctx.moveTo(size * 0.18, -size * 0.3);
        ctx.lineTo(-size * 0.08, -size * 1.05);
        ctx.lineTo(-size * 0.62, -size * 0.38);
        ctx.lineTo(-size * 0.52, -size * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Lower wing (mirror)
        ctx.beginPath();
        ctx.moveTo(size * 0.18, size * 0.3);
        ctx.lineTo(-size * 0.08, size * 1.05);
        ctx.lineTo(-size * 0.62, size * 0.38);
        ctx.lineTo(-size * 0.52, size * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Hull spine line ────────────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255, 110, 110, 0.65)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(size * 0.85, 0);
        ctx.lineTo(-size * 0.45, 0);
        ctx.stroke();

        // ── Engine exhaust glow ────────────────────────────────────────────────
        const engGrad = ctx.createRadialGradient(-size * 0.72, 0, 0, -size * 0.72, 0, size * 0.38);
        engGrad.addColorStop(0,   rgba(255, 220, 120, pulse));
        engGrad.addColorStop(0.35, rgba(255, 80, 0, 0.75 * pulse));
        engGrad.addColorStop(1,   'rgba(255, 0, 0, 0)');
        ctx.fillStyle = engGrad;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(-size * 0.72, 0, size * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // ── Cockpit glow ──────────────────────────────────────────────────────
        ctx.shadowBlur = 0;
        ctx.fillStyle = rgba(255, 150, 150, 0.7 * pulse);
        ctx.beginPath();
        ctx.ellipse(size * 0.32, 0, size * 0.14, size * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
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
        // Lightning Entity — a living being of pure electricity
        const size = this.radius * 0.85;
        const t = frameClock.now * 0.001;
        const pulse = 0.7 + Math.sin(t * 5.5) * 0.3;
        const charging = this.laserCharging;
        const chargeBoost = charging ? 1.5 : 1.0;

        ctx.save();

        // ── Outer arc-discharge ring ──────────────────────────────────────────
        const outerPts = 18;
        ctx.strokeStyle = rgba(0, 220, 255, 0.4 * pulse);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= outerPts; i++) {
            const angle = (i / outerPts) * Math.PI * 2;
            const jitter = Math.sin(t * 11 + i * 2.3) * size * 0.14;
            const r = size * 1.5 + jitter;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // ── Six radial lightning bolts ─────────────────────────────────────
        for (let i = 0; i < 6; i++) {
            const baseAngle = (i / 6) * Math.PI * 2 + t * 1.2;
            const opacity = 0.45 + Math.sin(t * 9 + i * 1.5) * 0.35;
            ctx.strokeStyle = rgba(120, 250, 255, opacity);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            const numSteps = 5;
            for (let s = 1; s <= numSteps; s++) {
                const prog = s / numSteps;
                const boltX = Math.cos(baseAngle) * size * prog;
                const boltY = Math.sin(baseAngle) * size * prog;
                const perpX = -Math.sin(baseAngle);
                const perpY =  Math.cos(baseAngle);
                const jag = Math.sin(t * 15 + i * 3.1 + s * 7.3) * size * 0.2 * prog;
                ctx.lineTo(boltX + perpX * jag, boltY + perpY * jag);
            }
            ctx.stroke();
        }

        // ── Body: jagged electric star ────────────────────────────────────────
        const bodyPts = 10;
        ctx.fillStyle = '#000a10';
        ctx.strokeStyle = rgba(0, 255, 255, 0.85 + pulse * 0.15);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < bodyPts; i++) {
            const angle = (i / bodyPts) * Math.PI * 2;
            const jitter = Math.sin(t * 7 + i * 1.9) * size * 0.07;
            const r = (i % 2 === 0) ? size * 0.88 + jitter : size * 0.48 + jitter;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Inner sheen ────────────────────────────────────────────────────────
        ctx.strokeStyle = `rgba(0, 180, 255, 0.4)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < bodyPts; i++) {
            const angle = (i / bodyPts) * Math.PI * 2;
            const r = (i % 2 === 0) ? size * 0.52 : size * 0.28;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // ── Core glow ─────────────────────────────────────────────────────────
        const coreSize = size * (0.3 + pulse * 0.08) * chargeBoost;
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
        coreGrad.addColorStop(0,    '#ffffff');
        coreGrad.addColorStop(0.25, '#88ffff');
        coreGrad.addColorStop(0.6,  '#0055ff');
        coreGrad.addColorStop(1,    'transparent');
        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = (0.8 + pulse * 0.2) * Math.min(chargeBoost, 1.2);
        ctx.beginPath();
        ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }
    
    drawMissileTurret(ctx) {
        // Armored missile fortress — angular hull, visible warheads, targeting sensor array
        const size = this.radius * 0.8;
        const t = frameClock.now * 0.001;
        const pulse = 0.75 + Math.sin(t * 2.5) * 0.25;

        ctx.save();

        // ── Main armored hull (angular hexagon) ──────────────────────────────
        ctx.fillStyle = '#1a0028';
        ctx.strokeStyle = '#cc44ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Asymmetric angular hull — wider at rear
        ctx.moveTo( size * 1.1,  0);           // nose
        ctx.lineTo( size * 0.6,  size * 0.7);  // front flare r
        ctx.lineTo(-size * 0.5,  size * 0.9);  // rear r
        ctx.lineTo(-size * 1.1,  size * 0.4);  // rear spur r
        ctx.lineTo(-size * 1.1, -size * 0.4);  // rear spur l
        ctx.lineTo(-size * 0.5, -size * 0.9);  // rear l
        ctx.lineTo( size * 0.6, -size * 0.7);  // front flare l
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Armor plate seams ────────────────────────────────────────────────
        ctx.strokeStyle = '#8822cc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.4, 0);  ctx.lineTo(-size * 0.6, 0);
        ctx.moveTo(size * 0.0, size * 0.55);  ctx.lineTo(-size * 0.8, size * 0.35);
        ctx.moveTo(size * 0.0, -size * 0.55); ctx.lineTo(-size * 0.8, -size * 0.35);
        ctx.stroke();

        // ── Missile pods (3 tubes visible per side) ───────────────────────────
        for (const side of [-1, 1]) {
            const podY = side * size * 0.55;
            // Pod housing
            ctx.fillStyle = '#220033';
            ctx.strokeStyle = '#aa33ee';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(size * 0.1, podY - size * 0.22, size * 0.7, size * 0.44);
            ctx.fill();
            ctx.stroke();
            // Individual missile tubes
            for (let tube = 0; tube < 3; tube++) {
                const tubeX = size * (0.18 + tube * 0.2);
                const tubeY = podY;
                // Tube bore
                ctx.fillStyle = '#110022';
                ctx.beginPath();
                ctx.ellipse(tubeX, tubeY, size * 0.07, size * 0.13, 0, 0, Math.PI * 2);
                ctx.fill();
                // Warhead tip (purple glow if loaded)
                const tipGrad = ctx.createRadialGradient(tubeX, tubeY, 0, tubeX, tubeY, size * 0.08);
                tipGrad.addColorStop(0, rgba(220, 100, 255, 0.8 * pulse));
                tipGrad.addColorStop(1, 'rgba(100,0,180,0)');
                ctx.fillStyle = tipGrad;
                ctx.beginPath();
                ctx.ellipse(tubeX, tubeY, size * 0.08, size * 0.14, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── Targeting sensor array (rotating dish at nose) ───────────────────
        ctx.save();
        ctx.translate(size * 0.85, 0);
        ctx.rotate(t * 2.2); // spin
        ctx.strokeStyle = rgba(255, 100, 255, 0.7 * pulse);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * size * 0.22, Math.sin(a) * size * 0.22);
            ctx.stroke();
        }
        ctx.restore();
        // Sensor center dot
        const sensorGrad = ctx.createRadialGradient(size * 0.85, 0, 0, size * 0.85, 0, size * 0.14 * pulse);
        sensorGrad.addColorStop(0, '#ffffff');
        sensorGrad.addColorStop(0.4, '#ff44ff');
        sensorGrad.addColorStop(1, 'rgba(180,0,200,0)');
        ctx.fillStyle = sensorGrad;
        ctx.beginPath();
        ctx.arc(size * 0.85, 0, size * 0.14 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // ── Rear engine glows ─────────────────────────────────────────────────
        for (const side of [-1, 1]) {
            const engGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.2, 0,
                                                      -size * 0.95, side * size * 0.2, size * 0.22);
            engGrad.addColorStop(0,   rgba(220, 100, 255, 0.9 * pulse));
            engGrad.addColorStop(0.5, 'rgba(100,0,180,0.4)');
            engGrad.addColorStop(1,   'rgba(60,0,120,0)');
            ctx.fillStyle = engGrad;
            ctx.beginPath();
            ctx.ellipse(-size * 0.95, side * size * 0.2, size * 0.22, size * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    
    drawPulseTurret(ctx) {
        // Spinning wheel laser turret — shape and glow react to weaverState
        const size = this.radius * 0.8;

        // Determine charge level: 0 during cooldown, 0→1 during spin_up, 1 during arc
        let charge = 0;
        const now = frameClock.now;
        if (this.weaverState === 'spinning_up') {
            charge = Math.min(1, (now - (this.weaverStateStart || now)) / (this.weaverSpinUpDuration || 2400));
            charge = charge * charge; // ease-in
        } else if (this.weaverState === 'arcing') {
            charge = 1;
        } else if (this.weaverState === 'cooldown') {
            const p = Math.min(1, (now - (this.weaverStateStart || now)) / (this.weaverCooldownDuration || 2600));
            charge = 1 - p;
        }

        // Outer glow ring scales with charge
        if (charge > 0.05) {
            ctx.shadowBlur = 0;
            ctx.shadowColor = '#ffff00';
            ctx.strokeStyle = '#ffff44';
            ctx.lineWidth = 3 + charge * 4;
            ctx.beginPath();
            ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1;

        // Outer body ring
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color + '40';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 3 spoke arms (like a wheel / turbine)
        const spokeColor = charge > 0 ? `rgba(255, 255, ${Math.floor(200 * (1 - charge))}, 1)` : this.color;
        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            ctx.strokeStyle = spokeColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * size * 0.85, Math.sin(angle) * size * 0.85);
            ctx.stroke();

            // Tip nozzle
            const tx = Math.cos(angle) * size;
            const ty = Math.sin(angle) * size;
            ctx.fillStyle = charge > 0 ? '#ffffff' : this.color;
            ctx.globalAlpha = 0.6 + charge * 0.4;
            ctx.beginPath();
            ctx.arc(tx, ty, size * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        // Central core — white-hot when fully charged
        const coreColor = charge > 0.8 ? '#ffffff' : this.color;
        ctx.fillStyle = coreColor;
        ctx.shadowColor = '#ffff00';
        ctx.beginPath();
        ctx.arc(0, 0, size * (0.28 + charge * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    drawShieldTurret(ctx) {
        // Orbital sentinel — nested spinning hex rings, rotating emitter arms
        const size = this.radius * 0.8;
        const t = frameClock.now * 0.001;
        const pulse = 0.8 + Math.sin(t * 3.2) * 0.2;
        const spinAngle = t * 0.8; // independent slow spin for decoration

        ctx.save();

        // ── Outer rotating hex ring ──────────────────────────────────────────
        ctx.save();
        ctx.rotate(spinAngle);
        ctx.strokeStyle = rgba(0, 255, 100, 0.5 * pulse);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
            else         ctx.lineTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // ── Inner counter-rotating hex ring ──────────────────────────────────
        ctx.save();
        ctx.rotate(-spinAngle * 1.4);
        ctx.strokeStyle = rgba(100, 255, 160, 0.6 * pulse);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
            else         ctx.lineTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // ── Emitter arms (6, rotating with faceAngle) ────────────────────────
        ctx.strokeStyle = '#00cc55';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const innerR = size * 0.28;
            const outerR = size * 0.75;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
            ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
            ctx.stroke();
            // Emitter node at tip
            const glow = ctx.createRadialGradient(
                Math.cos(a) * outerR, Math.sin(a) * outerR, 0,
                Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse
            );
            glow.addColorStop(0,   '#ffffff');
            glow.addColorStop(0.4, '#00ff88');
            glow.addColorStop(1,   'rgba(0,200,80,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Solid inner hex hull ─────────────────────────────────────────────
        ctx.fillStyle = '#001a0a';
        ctx.strokeStyle = '#00ff55';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
            else         ctx.lineTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Pulsing core ─────────────────────────────────────────────────────
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.22 * pulse);
        coreGrad.addColorStop(0,   '#ffffff');
        coreGrad.addColorStop(0.3, '#88ffcc');
        coreGrad.addColorStop(1,   'rgba(0,200,100,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.22 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
    
    drawWaspShip(ctx) {
        // Sleek aggressive interceptor with glowing engine trails and blade wings
        const size = this.radius * 0.8;
        const t = frameClock.now * 0.001;
        const pulse = 0.85 + Math.sin(t * 6) * 0.15; // fast flicker like an insect

        ctx.save();

        // ── Engine exhaust glow (behind body) ────────────────────────────────
        for (const side of [-1, 1]) {
            const exhaustGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.18, 0,
                                                          -size * 0.95, side * size * 0.18, size * 0.35);
            exhaustGrad.addColorStop(0,   rgba(255, 220, 0, 0.9 * pulse));
            exhaustGrad.addColorStop(0.4, 'rgba(255,120,0,0.5)');
            exhaustGrad.addColorStop(1,   'rgba(200,80,0,0)');
            ctx.fillStyle = exhaustGrad;
            ctx.beginPath();
            ctx.ellipse(-size * 0.95, side * size * 0.18, size * 0.35, size * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Razor blade wings ─────────────────────────────────────────────────
        for (const side of [-1, 1]) {
            // Outer swept blade
            ctx.fillStyle = 'rgba(200,200,0,0.35)';
            ctx.strokeStyle = '#cccc00';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(size * 0.15, 0);
            ctx.lineTo(size * 0.8,  side * size * 0.22);
            ctx.lineTo(-size * 0.05, side * size * 1.05);
            ctx.lineTo(-size * 0.65, side * size * 0.9);
            ctx.lineTo(-size * 0.75, side * size * 0.28);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Inner secondary blade
            ctx.fillStyle = 'rgba(255,255,0,0.25)';
            ctx.strokeStyle = '#ffff44';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-size * 0.1, 0);
            ctx.lineTo(-size * 0.3, side * size * 0.55);
            ctx.lineTo(-size * 0.65, side * size * 0.45);
            ctx.lineTo(-size * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Glowing wing edge stripe
            ctx.strokeStyle = rgba(255, 255, 100, 0.7 * pulse);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(size * 0.7, side * size * 0.18);
            ctx.lineTo(-size * 0.05, side * size * 0.95);
            ctx.stroke();
        }

        // ── Abdomen (rear tapered segment) ────────────────────────────────────
        ctx.fillStyle = '#1a1a00';
        ctx.strokeStyle = '#aaaa00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(-size * 0.45, 0, size * 0.55, size * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Abdomen stripes
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const x = -size * 0.25 - i * size * 0.2;
            ctx.beginPath();
            ctx.moveTo(x, -size * 0.24);
            ctx.lineTo(x, size * 0.24);
            ctx.stroke();
        }

        // ── Thorax (center body) ──────────────────────────────────────────────
        const thoraxGrad = ctx.createRadialGradient(-size * 0.05, 0, 0, -size * 0.05, 0, size * 0.42);
        thoraxGrad.addColorStop(0,   '#ffff66');
        thoraxGrad.addColorStop(0.5, '#aaaa00');
        thoraxGrad.addColorStop(1,   '#333300');
        ctx.fillStyle = thoraxGrad;
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(-size * 0.05, 0, size * 0.42, size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // ── Head + stinger ────────────────────────────────────────────────────
        ctx.fillStyle = '#222200';
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(size * 0.38, 0, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Eyes (two bright dots)
        for (const ey of [-1, 1]) {
            ctx.fillStyle = rgba(255, 255, 0, pulse);
            ctx.beginPath();
            ctx.arc(size * 0.44, ey * size * 0.1, size * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }
        // Stinger tip
        ctx.fillStyle = '#ffff88';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.75, 0);
        ctx.lineTo(size * 0.58, -size * 0.1);
        ctx.lineTo(size * 0.58,  size * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
    
    drawEmeraldGuardian(ctx) {
        // Armored emerald fortress — glowing energy core, swept shield wings, battle scarred
        const size = this.radius * 0.8;
        const pulse = 0.8 + Math.sin(frameClock.now * 0.004) * 0.2;

        ctx.save();

        // ── Outer shield ring ────────────────────────────────────────────────
        ctx.strokeStyle = rgba(0, 255, 80, 0.35 * pulse);
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Swept battle wings (large, aggressive) ───────────────────────────
        const wingColor = '#00bb44';
        const wingFill  = 'rgba(0,180,60,0.45)';
        ctx.lineWidth = 1.8;

        for (const side of [-1, 1]) {
            // Primary swept wing
            ctx.fillStyle = wingFill;
            ctx.strokeStyle = wingColor;
            ctx.beginPath();
            ctx.moveTo(size * 0.25, 0);            // root
            ctx.lineTo(size * 1.5,  side * size * 0.3);  // swept forward tip
            ctx.lineTo(size * 1.25, side * size * 0.9);  // outer tip
            ctx.lineTo(-size * 0.5, side * size * 1.1);  // rear outer
            ctx.lineTo(-size * 0.7, side * size * 0.35); // rear root
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Secondary rear blade
            ctx.fillStyle = 'rgba(0,200,70,0.3)';
            ctx.strokeStyle = '#00dd55';
            ctx.beginPath();
            ctx.moveTo(-size * 0.4, side * size * 0.2);
            ctx.lineTo(-size * 1.2, side * size * 0.85);
            ctx.lineTo(-size * 0.95, side * size * 0.38);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Wing energy veins
            ctx.strokeStyle = rgba(120, 255, 160, 0.6 * pulse);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(size * 0.1, side * size * 0.05);
            ctx.lineTo(size * 1.1, side * size * 0.55);
            ctx.moveTo(size * 0.0, side * size * 0.12);
            ctx.lineTo(size * 0.6, side * size * 0.75);
            ctx.stroke();
        }

        // ── Central hexagonal hull ───────────────────────────────────────────
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#00ff66';
        ctx.fillStyle = '#001a08';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = size * (i % 2 === 0 ? 0.68 : 0.58); // alternating for interest
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Faceted armor panels ─────────────────────────────────────────────
        for (let i = 0; i < 6; i++) {
            const a1 = (i / 6) * Math.PI * 2;
            const a2 = ((i + 1) / 6) * Math.PI * 2;
            const brightness = i % 2 === 0 ? '88' : '44';
            ctx.fillStyle = '#00ff44' + brightness;
            ctx.strokeStyle = '#00cc33';
            ctx.lineWidth = 1;
            const r1 = size * (i % 2 === 0 ? 0.68 : 0.58);
            const r2 = size * ((i+1) % 2 === 0 ? 0.68 : 0.58);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
            ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // ── Glowing energy core ──────────────────────────────────────────────
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.32 * pulse);
        coreGrad.addColorStop(0,   '#ffffff');
        coreGrad.addColorStop(0.25,'#aaffcc');
        coreGrad.addColorStop(0.6, '#00ff66');
        coreGrad.addColorStop(1,   'rgba(0,200,80,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.32 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // ── Forward cannon barrel ────────────────────────────────────────────
        ctx.fillStyle = '#005522';
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(size * 0.55, -size * 0.1, size * 0.7, size * 0.2);
        ctx.fill();
        ctx.stroke();
        // Muzzle glow
        const muzzleGrad = ctx.createRadialGradient(size * 1.25, 0, 0, size * 1.25, 0, size * 0.18 * pulse);
        muzzleGrad.addColorStop(0, '#ffffff');
        muzzleGrad.addColorStop(0.4,'#00ff88');
        muzzleGrad.addColorStop(1, 'rgba(0,200,80,0)');
        ctx.fillStyle = muzzleGrad;
        ctx.beginPath();
        ctx.arc(size * 1.25, 0, size * 0.18 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
    
    drawTitanTank(ctx) {
        // Imposing hexagonal juggernaut with glowing energy core and armored plating
        const size = this.radius * 0.9;
        const pulse = 0.85 + Math.sin(frameClock.now * 0.003) * 0.15; // 0.7–1.0 pulse

        ctx.save();

        // ── Outer armor ring (thick hex outline) ─────────────────────────────
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ff44ff';
        ctx.fillStyle = '#1a0020';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const s = i === 0 ? 1.35 : 1.0; // forward stretch
            if (i === 0) ctx.moveTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
            else         ctx.lineTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Corner spikes on each hex vertex ─────────────────────────────────
        ctx.fillStyle = '#ff00ff';
        ctx.strokeStyle = '#ff88ff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const s = i === 0 ? 1.35 : 1.0;
            const vx = Math.cos(a) * size * s;
            const vy = Math.sin(a) * size * s;
            const tipLen = size * 0.22;
            ctx.beginPath();
            ctx.moveTo(vx + Math.cos(a) * tipLen, vy + Math.sin(a) * tipLen);
            ctx.lineTo(vx + Math.cos(a + 0.35) * size * 0.15, vy + Math.sin(a + 0.35) * size * 0.15);
            ctx.lineTo(vx + Math.cos(a - 0.35) * size * 0.15, vy + Math.sin(a - 0.35) * size * 0.15);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // ── Inner hex with energy gradient ───────────────────────────────────
        const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.72);
        innerGrad.addColorStop(0,   'rgba(255, 80, 255, 0.9)');
        innerGrad.addColorStop(0.5, 'rgba(120, 0, 180, 0.7)');
        innerGrad.addColorStop(1,   'rgba(30, 0, 50, 0.5)');
        ctx.fillStyle = innerGrad;
        ctx.strokeStyle = '#cc00cc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
            else         ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Energy lines from center to hex midpoints ─────────────────────────
        ctx.strokeStyle = rgba(255, 180, 255, 0.4 * pulse);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6 + 1 / 12) * Math.PI * 2; // midpoints between vertices
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
            ctx.stroke();
        }

        // ── Pulsing energy core ──────────────────────────────────────────────
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.28 * pulse);
        coreGrad.addColorStop(0,   '#ffffff');
        coreGrad.addColorStop(0.3, '#ff88ff');
        coreGrad.addColorStop(1,   'rgba(200, 0, 200, 0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.28 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // ── Rear exhaust pods ────────────────────────────────────────────────
        for (const side of [-1, 1]) {
            const podX = -size * 0.55;
            const podY = side * size * 0.38;
            const podGrad = ctx.createRadialGradient(podX, podY, 0, podX, podY, size * 0.22);
            podGrad.addColorStop(0,   rgba(255, 120, 255, 0.9 * pulse));
            podGrad.addColorStop(0.5, 'rgba(120, 0, 160, 0.6)');
            podGrad.addColorStop(1,   'rgba(60, 0, 80, 0)');
            ctx.fillStyle = podGrad;
            ctx.beginPath();
            ctx.ellipse(podX, podY, size * 0.22, size * 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // ── Turret (independently rotated) ───────────────────────────────────
        ctx.save();
        const turretAngle = this.tankTurretAngle || 0;
        const relativeAngle = turretAngle - (this.faceAngle || 0);
        ctx.rotate(relativeAngle);

        // Turret base ring
        ctx.fillStyle = '#2a0035';
        ctx.strokeStyle = '#ff44ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Barrel body
        const barrelLen = size * 1.5;
        const barrelW   = size * 0.13;
        ctx.fillStyle = '#aa00cc';
        ctx.strokeStyle = '#ff66ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(size * 0.28, -barrelW * 0.5, barrelLen, barrelW);
        ctx.fill();
        ctx.stroke();

        // Barrel highlight stripe
        ctx.strokeStyle = 'rgba(255,180,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.28, -barrelW * 0.12);
        ctx.lineTo(size * 0.28 + barrelLen * 0.9, -barrelW * 0.12);
        ctx.stroke();

        // Glowing muzzle tip
        const muzzleX = size * 0.28 + barrelLen;
        const muzzleGrad = ctx.createRadialGradient(muzzleX, 0, 0, muzzleX, 0, barrelW * 1.4 * pulse);
        muzzleGrad.addColorStop(0,   '#ffffff');
        muzzleGrad.addColorStop(0.4, '#ff88ff');
        muzzleGrad.addColorStop(1,   'rgba(200,0,200,0)');
        ctx.fillStyle = muzzleGrad;
        ctx.beginPath();
        ctx.arc(muzzleX, 0, barrelW * 1.4 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // end turret

        ctx.restore(); // end main transform
    }
    
    drawStalkerSword(ctx) {
        // Cloaked stealth interceptor — mantis-like blade wings, plasma edges, shimmer
        const size = this.radius * 0.92;
        const t = frameClock.now * 0.001;
        const pulse = 0.75 + Math.sin(t * 4.2) * 0.25;
        const shimmer = Math.sin(t * 11.3) * 0.15; // fast flicker for cloak shimmer

        ctx.save();

        // ── Main hull — narrow swept fuselage ─────────────────────────────────
        ctx.fillStyle = '#000d10';
        ctx.strokeStyle = rgba(0, 220, 255, 0.75 + shimmer);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo( size * 1.3,  0);            // sharp nose tip
        ctx.lineTo( size * 0.4, -size * 0.22);  // upper shoulder
        ctx.lineTo(-size * 0.5, -size * 0.18);  // upper rear
        ctx.lineTo(-size * 0.75, 0);            // tail
        ctx.lineTo(-size * 0.5,  size * 0.18);  // lower rear
        ctx.lineTo( size * 0.4,  size * 0.22);  // lower shoulder
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Upper mantis blade arm ────────────────────────────────────────────
        ctx.fillStyle = `rgba(0, 30, 40, 0.85)`;
        ctx.strokeStyle = rgba(0, 255, 220, 0.65 + shimmer);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo( size * 0.55, -size * 0.2);   // root at hull
        ctx.lineTo( size * 1.05, -size * 0.85);  // blade tip (forward-angled)
        ctx.lineTo( size * 0.05, -size * 1.1);   // swept back wingtip
        ctx.lineTo(-size * 0.45, -size * 0.55);  // rear root
        ctx.lineTo(-size * 0.35, -size * 0.18);  // hull attach
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Lower mantis blade arm (mirror) ───────────────────────────────────
        ctx.beginPath();
        ctx.moveTo( size * 0.55,  size * 0.2);
        ctx.lineTo( size * 1.05,  size * 0.85);
        ctx.lineTo( size * 0.05,  size * 1.1);
        ctx.lineTo(-size * 0.45,  size * 0.55);
        ctx.lineTo(-size * 0.35,  size * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Cloaking interference grid ────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.10 + Math.abs(shimmer) * 0.5;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 0.8;
        for (let i = -3; i <= 3; i++) {
            const xOff = i * size * 0.22 + Math.sin(t * 8 + i * 1.7) * size * 0.04;
            ctx.beginPath();
            ctx.moveTo(xOff, -size * 0.2);
            ctx.lineTo(xOff,  size * 0.2);
            ctx.stroke();
        }
        ctx.restore();

        // ── Plasma edge glow (additive blend) ─────────────────────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * pulse;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        // Hull edge glow
        ctx.beginPath();
        ctx.moveTo( size * 1.3,  0);
        ctx.lineTo( size * 0.4, -size * 0.22);
        ctx.lineTo(-size * 0.5, -size * 0.18);
        ctx.lineTo(-size * 0.75, 0);
        ctx.lineTo(-size * 0.5,  size * 0.18);
        ctx.lineTo( size * 0.4,  size * 0.22);
        ctx.closePath();
        ctx.stroke();
        // Blade tip plasma accents
        ctx.globalAlpha = 0.55 * pulse;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(size * 1.05, -size * 0.85);
        ctx.lineTo(size * 0.05, -size * 1.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(size * 1.05,  size * 0.85);
        ctx.lineTo(size * 0.05,  size * 1.1);
        ctx.stroke();
        ctx.restore();

        // ── Rear engine exhaust pods ───────────────────────────────────────────
        const engGrad = ctx.createRadialGradient(-size * 0.75, 0, 0, -size * 0.75, 0, size * 0.3);
        engGrad.addColorStop(0,   rgba(200, 255, 255, pulse));
        engGrad.addColorStop(0.4, rgba(0, 180, 220, 0.6 * pulse));
        engGrad.addColorStop(1,   'rgba(0, 50, 80, 0)');
        ctx.fillStyle = engGrad;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(-size * 0.75, 0, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // ── Core sensor orb ────────────────────────────────────────────────────
        const coreGrad = ctx.createRadialGradient(size * 0.15, 0, 0, size * 0.15, 0, size * 0.18);
        coreGrad.addColorStop(0,   '#ffffff');
        coreGrad.addColorStop(0.3, '#88ffff');
        coreGrad.addColorStop(1,   'rgba(0, 200, 255, 0)');
        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = 0.9 * pulse;
        ctx.beginPath();
        ctx.arc(size * 0.15, 0, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }
    
    drawPulsatingCircle(ctx) {
        ctx.save();
        
        // Use music-synchronized intensity
        const pulseIntensity = this.shield.currentIntensity || 0.5;
        
        // Simplified shield pattern for performance
        const time = frameClock.now * 0.001;
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
        
        const now = frameClock.now;
        
        // Draw trail as connected line segments with fading opacity
        for (let i = 1; i < this.trail.positions.length; i++) {
            const prevPoint = this.trail.positions[i - 1];
            const currentPoint = this.trail.positions[i];
            
            // Calculate fade based on age
            const age = now - currentPoint.age;
            const fadeRatio = 1 - (age / this.trail.fadeTime);
            const opacity = Math.max(0, fadeRatio * 0.8); // Max 80% opacity
            
            if (opacity <= 0) continue;

            // OPT: use simple rgba color instead of per-segment gradient
            ctx.strokeStyle = rgba(255, 255, 255, opacity);
            ctx.lineWidth = 3 * fadeRatio; // Thinner as it fades
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
            ctx.stroke();
            
            // OPT-2: live GPU blur removed — trail already visible from stroke
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
        const barY = this.y - this.radius - 8; // Moved closer since no name above

        // Enemy names removed for better performance and cleaner UI

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

        // Health text above the bar: "6/9"
        const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
        const healthText = `${displayHealth}/${Math.round(this.maxHealth)}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // OPT: double-draw glow instead of shadowBlur
        // First pass: slightly larger font at low alpha for glow
        ctx.globalAlpha = 0.4;
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = 'goldenrod';
        ctx.fillText(healthText, this.x, barY - 6);

        // Second pass: crisp text on top at full alpha
        ctx.globalAlpha = 1.0;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = 'goldenrod';
        ctx.fillText(healthText, this.x, barY - 6);

        // Health calculation
        const healthPercentage = this.health / this.maxHealth;

        // OPT: cache the gradient per tier so createLinearGradient() is only called
        // when the tier boundary (>50% / >25% / <=25%) changes, not every frame.
        const tier = healthPercentage > 0.5 ? 'green' : healthPercentage > 0.25 ? 'yellow' : 'red';
        if (tier !== this._healthBarTier || !this._healthBarGradient) {
            this._healthBarTier = tier;
            let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
            let backgroundColor;
            if (tier === 'green') {
                healthGradient.addColorStop(0, '#66ff66');
                healthGradient.addColorStop(1, '#00cc00');
                backgroundColor = 'rgba(0, 102, 0, 0.6)';
            } else if (tier === 'yellow') {
                healthGradient.addColorStop(0, '#ffff99');
                healthGradient.addColorStop(1, '#cccc00');
                backgroundColor = 'rgba(102, 102, 0, 0.6)';
            } else {
                healthGradient.addColorStop(0, '#ff6666');
                healthGradient.addColorStop(1, '#cc0000');
                backgroundColor = 'rgba(102, 0, 0, 0.6)';
            }
            this._healthBarGradient   = healthGradient;
            this._healthBarBackground = backgroundColor;
        }
        let healthGradient = this._healthBarGradient;
        let backgroundColor = this._healthBarBackground;
        
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
        const pulseIntensity = 0.8 + Math.sin(frameClock.now * 0.02) * 0.2;
        
        // Outer energy ring
        const outerGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, chargeRadius);
        outerGradient.addColorStop(0, rgba(68, 255, 255, intensity * pulseIntensity));
        outerGradient.addColorStop(0.5, rgba(68, 255, 255, intensity * 0.6));
        outerGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');
        
        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        ctx.arc(chargeX, 0, chargeRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner energy core
        const coreRadius = chargeRadius * 0.4;
        const coreGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, coreRadius);
        coreGradient.addColorStop(0, rgba(255, 255, 255, intensity * pulseIntensity));
        coreGradient.addColorStop(0.7, rgba(68, 255, 255, intensity * 0.8));
        coreGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');
        
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(chargeX, 0, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Energy sparks around the charge point
        if (progress > 0.3) {
            const sparkCount = Math.floor(progress * 8);
            for (let i = 0; i < sparkCount; i++) {
                const angle = (i / sparkCount) * Math.PI * 2 + frameClock.now * 0.01;
                const distance = chargeRadius * 0.8 + Math.sin(frameClock.now * 0.03 + i) * 5;
                const sparkX = chargeX + Math.cos(angle) * distance;
                const sparkY = Math.sin(angle) * distance;
                
                ctx.fillStyle = rgba(255, 255, 255, intensity * 0.8);
                ctx.beginPath();
                ctx.arc(sparkX, sparkY, 1 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Charging beam preview (thin line showing where laser will fire)
        if (progress > 0.5) {
            const beamLength = 100 + progress * 200;
            const beamAlpha = (progress - 0.5) * 2 * intensity;
            
            ctx.strokeStyle = rgba(68, 255, 255, beamAlpha);
            ctx.lineWidth = 2 + progress * 3;
            ctx.beginPath();
            ctx.moveTo(chargeX, 0);
            ctx.lineTo(chargeX + beamLength, 0);
            ctx.stroke();
            
            // Beam glow
            ctx.strokeStyle = rgba(255, 255, 255, beamAlpha * 0.5);
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
        const now = frameClock.now;
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
        // Invulnerable during warp-in
        if (this.warping) return false;

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
    
    // ── Weaver Spin-Up Movement ──────────────────────────────────────────────
    weaverSpinupMovement(gameEngine) {
        if (!this.targetPlayer) return;
        const now = frameClock.now;

        if (this.weaverState === undefined) {
            this.weaverState = 'spinning_up';
            this.weaverStateStart = now;
            this.weaverSpinRate = 0;
            this.weaverMaxSpinRate = 0.26;    // rad/frame at full spin
            this.weaverSpinUpDuration = 2400; // ms to reach full spin
            this.weaverArcDuration = 3600;    // ms spent zooming in an arc
            this.weaverCooldownDuration = 2600;
            this.weaverArcAngle = Math.atan2(this.y - this.targetPlayer.y, this.x - this.targetPlayer.x);
            this.weaverArcRadius = 220;
            this.weaverArcDirection = Math.random() < 0.5 ? 1 : -1; // CW or CCW
            this.weaverLastShot = 0;
            this.weaverFireInterval = 130; // ms between spiral shots
        }

        switch (this.weaverState) {

            case 'spinning_up': {
                // Hold position with friction
                this.vel.x *= 0.88;
                this.vel.y *= 0.88;

                const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverSpinUpDuration);
                // Ease-in acceleration curve
                const easedProgress = progress * progress;
                this.weaverSpinRate = easedProgress * this.weaverMaxSpinRate;
                this.faceAngle += this.weaverSpinRate;

                // Spark particles intensify as spin builds
                const ge = gameEngine || window.gameEngine;
                if (ge?.particlePool && Math.random() < 0.25 * easedProgress) {
                    const sparkAngle = Math.random() * Math.PI * 2;
                    const sparkDist = this.radius * (0.8 + Math.random() * 0.5);
                    const p = ge.particlePool.get(
                        this.x + Math.cos(sparkAngle) * sparkDist,
                        this.y + Math.sin(sparkAngle) * sparkDist,
                        'starSparkle'
                    );
                    if (p) {
                        p.vel.x = Math.cos(sparkAngle) * (1 + easedProgress * 3);
                        p.vel.y = Math.sin(sparkAngle) * (1 + easedProgress * 3);
                        p.color = this.type === 'SENTINEL' ? '#44ff88' : '#ffff44';
                        p.radius = 1 + Math.random() * 2;
                        p.life = 10 + Math.random() * 20;
                    }
                }

                if (progress >= 1) {
                    // Sentinel must fire 3 bursts before it arcs/moves
                    if (this.type === 'SENTINEL' && (this.sentinelBurstsFired || 0) < 3) {
                        // Hold at max spin rate while waiting for remaining bursts
                        this.weaverSpinRate = this.weaverMaxSpinRate;
                        break;
                    }
                    this.weaverState = 'arcing';
                    this.weaverStateStart = now;
                    // Lock arc orbit parameters to current distance
                    const dx = this.x - this.targetPlayer.x;
                    const dy = this.y - this.targetPlayer.y;
                    this.weaverArcAngle = Math.atan2(dy, dx);
                    const dist = Math.hypot(dx, dy);
                    this.weaverArcRadius = Math.max(140, Math.min(dist, 280));
                    this.weaverArcDirection = Math.random() < 0.5 ? 1 : -1;
                    this.weaverLastShot = now;
                    // Sentinel: reset sweep angle for the new arc cycle
                    if (this.type === 'SENTINEL') {
                        this.sentinelSweepAngle = Math.random() * Math.PI * 2;
                        this.sentinelSweepLastDamage = 0;
                        this.sentinelArcPhase = 0; // Reset sinusoidal arc phase
                    }
                }
                break;
            }

            case 'arcing': {
                const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverArcDuration);

                // Continue spinning at full rate
                this.faceAngle += this.weaverSpinRate;

                // Orbit around player — angular velocity creates the arc
                const orbitRate = 0.028 * this.weaverArcDirection; // rad/frame
                this.weaverArcAngle += orbitRate;

                // Compute effective orbit radius — Sentinel adds sinusoidal radial wave
                let orbitR = this.weaverArcRadius;
                if (this.type === 'SENTINEL') {
                    if (this.sentinelArcPhase === undefined) this.sentinelArcPhase = 0;
                    this.sentinelArcPhase += 0.052; // wave frequency
                    orbitR += Math.sin(this.sentinelArcPhase) * 70; // ±70 px radial oscillation
                    orbitR = Math.max(60, orbitR); // never collapse to center
                }

                const targetX = this.targetPlayer.x + Math.cos(this.weaverArcAngle) * orbitR;
                const targetY = this.targetPlayer.y + Math.sin(this.weaverArcAngle) * orbitR;
                const tdx = targetX - this.x;
                const tdy = targetY - this.y;
                const dist = Math.hypot(tdx, tdy);
                const arcSpeed = this.config.speed * 2.8;
                if (dist > 0) {
                    this.vel.x = (tdx / dist) * arcSpeed;
                    this.vel.y = (tdy / dist) * arcSpeed;
                }

                if (this.type !== 'SENTINEL') {
                    // Weaver: fire spiral lasers — each shot fires in the CURRENT faceAngle direction,
                    // creating the spiral pattern as faceAngle rotates at weaverMaxSpinRate
                    if (now - this.weaverLastShot > this.weaverFireInterval) {
                        this.shootSpiralLaser(gameEngine || window.gameEngine);
                        this.weaverLastShot = now;
                    }
                }
                // Sentinel firing is handled by updateSentinelSweep() via updateShooting()

                // Trailing sparks during arc
                const ge = gameEngine || window.gameEngine;
                if (ge?.particlePool && Math.random() < 0.35) {
                    const p = ge.particlePool.get(this.x, this.y, 'starSparkle');
                    if (p) {
                        p.vel.x = -this.vel.x * 0.3 + (Math.random() - 0.5) * 2;
                        p.vel.y = -this.vel.y * 0.3 + (Math.random() - 0.5) * 2;
                        p.color = this.type === 'SENTINEL' ? '#00ff00' : '#ffff00';
                        p.radius = 1 + Math.random() * 2;
                        p.life = 12 + Math.random() * 18;
                    }
                }

                if (progress >= 1) {
                    this.weaverState = 'cooldown';
                    this.weaverStateStart = now;
                    // Sentinel: reset burst counter so it fires 3 more times next spin-up
                    if (this.type === 'SENTINEL') this.sentinelBurstsFired = 0;
                }
                break;
            }

            case 'cooldown': {
                // Friction to brake
                this.vel.x *= 0.9;
                this.vel.y *= 0.9;

                // Wind down spin
                this.weaverSpinRate *= 0.965;
                if (this.weaverSpinRate > 0.001) {
                    this.faceAngle += this.weaverSpinRate;
                }

                const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverCooldownDuration);
                if (progress >= 1) {
                    this.weaverState = 'spinning_up';
                    this.weaverStateStart = now;
                    this.weaverSpinRate = 0;
                }
                break;
            }
        }
    }

    // ── Wasp Zigzag Movement ────────────────────────────────────────────────
    waspZigzagMovement() {
        if (!this.targetPlayer) return;
        const now = frameClock.now;

        if (this.waspZigzagState === undefined) {
            this.waspZigzagState = 'zigzagging';
            this.waspZigzagCount = 0;
            this.waspZigzagMax = 3 + Math.floor(Math.random() * 3); // 3–5 segments
            this.waspZigzagDirection = Math.random() < 0.5 ? 1 : -1;
            this.waspZigzagTimer = now;
            this.waspZigzagSegmentDuration = 350 + Math.random() * 150;
            this.waspZigzagCooldownTimer = 0;
            this.waspZigzagCooldownDuration = 2200 + Math.random() * 600;
        }

        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const dist = Math.hypot(dx, dy);
        const toPlayerAngle = dist > 0 ? Math.atan2(dy, dx) : 0;
        // Perpendicular to player direction, flipping each segment
        const perpAngle = toPlayerAngle + (Math.PI / 2) * this.waspZigzagDirection;

        switch (this.waspZigzagState) {
            case 'zigzagging': {
                const zigSpeed = this.config.speed * 2.6;
                this.vel.x = Math.cos(perpAngle) * zigSpeed;
                this.vel.y = Math.sin(perpAngle) * zigSpeed;
                // Slight drift toward player
                if (dist > 0) {
                    this.vel.x += (dx / dist) * 0.4;
                    this.vel.y += (dy / dist) * 0.4;
                }
                if (now - this.waspZigzagTimer > this.waspZigzagSegmentDuration) {
                    this.waspZigzagDirection *= -1;
                    this.waspZigzagCount++;
                    this.waspZigzagTimer = now;
                    this.waspZigzagSegmentDuration = 280 + Math.random() * 200;
                    if (this.waspZigzagCount >= this.waspZigzagMax) {
                        this.waspZigzagState = 'cooldown';
                        this.waspZigzagCooldownTimer = now;
                        this.waspZigzagCount = 0;
                        this.waspZigzagMax = 3 + Math.floor(Math.random() * 3);
                        this.waspZigzagCooldownDuration = 2000 + Math.random() * 800;
                    }
                }
                break;
            }
            case 'cooldown':
                // Friction to slow to a hover
                this.vel.x *= 0.88;
                this.vel.y *= 0.88;
                if (now - this.waspZigzagCooldownTimer > this.waspZigzagCooldownDuration) {
                    this.waspZigzagState = 'zigzagging';
                    this.waspZigzagTimer = now;
                    this.waspZigzagDirection = Math.random() < 0.5 ? 1 : -1;
                }
                break;
        }
    }

    // ── Boulder (Titan) Movement ─────────────────────────────────────────────
    boulderMovement() {
        if (!this.targetPlayer) return;
        const now = frameClock.now;

        if (this.boulderState === undefined) {
            this.boulderState = 'idle';
            this.boulderIdleTimer = now;
            this.boulderIdleDuration = 1500 + Math.random() * 1000;
            this.boulderAngle = 0;
            this.boulderMaxSpeed = this.config.speed * 3.0;
            this.boulderAccel = 0.06;
        }

        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distToPlayer = Math.hypot(dx, dy);
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);

        switch (this.boulderState) {
            case 'idle':
                // Friction to halt
                this.vel.x *= 0.92;
                this.vel.y *= 0.92;
                if (now - this.boulderIdleTimer > this.boulderIdleDuration) {
                    this.boulderState = 'approaching';
                    this.boulderAngle = Math.atan2(dy, dx); // Lock direction now
                    this.boulderMaxSpeed = this.config.speed * 3.0;
                }
                break;

            case 'approaching': {
                // Accelerate in locked direction
                this.vel.x += Math.cos(this.boulderAngle) * this.boulderAccel;
                this.vel.y += Math.sin(this.boulderAngle) * this.boulderAccel;
                // Cap speed
                if (currentSpeed > this.boulderMaxSpeed) {
                    this.vel.x = (this.vel.x / currentSpeed) * this.boulderMaxSpeed;
                    this.vel.y = (this.vel.y / currentSpeed) * this.boulderMaxSpeed;
                }
                // Dot product of velocity with direction to player: negative = passed player
                const velDotToPlayer = this.vel.x * dx + this.vel.y * dy;
                const passedPlayer = velDotToPlayer < 0 && distToPlayer < 180;
                if (passedPlayer || currentSpeed >= this.boulderMaxSpeed * 0.92) {
                    this.boulderState = 'braking';
                }
                break;
            }

            case 'braking':
                // Strong friction
                this.vel.x *= 0.93;
                this.vel.y *= 0.93;
                if (currentSpeed < 0.18) {
                    this.vel.x = 0;
                    this.vel.y = 0;
                    this.boulderState = 'idle';
                    this.boulderIdleTimer = now;
                    this.boulderIdleDuration = 1200 + Math.random() * 1000;
                }
                break;
        }
    }

    // ── Sweep Laser System ───────────────────────────────────────────────────
    updateSweepLaserSystem(gameEngine) {
        if (!this.targetPlayer) return;
        const now = frameClock.now;

        if (this.sweepState === undefined) {
            this.sweepState = 'cooldown';
            this.sweepCooldownEnd = now + 4000; // First sweep after 4s
            this.sweepAngle = 0;
            this.sweepStartAngle = 0;
            this.sweepEndAngle = 0;
            this.sweepStartTime = 0;
            this.sweepDuration = 1600;
            this.sweepWarningStart = 0;
            this.sweepWarningDuration = 1800;
            this.sweepLastDamage = 0;
            this.sweepLastBeam = 0;
        }

        switch (this.sweepState) {
            case 'cooldown':
                if (now >= this.sweepCooldownEnd) {
                    // Transition to warning
                    this.sweepState = 'warning';
                    this.sweepWarningStart = now;
                    // Save current turret angle so warning lerps smoothly from it
                    this.sweepTurretStartAngle = this.tankTurretAngle || 0;
                    const toPlayer = Math.atan2(
                        this.targetPlayer.y - this.y,
                        this.targetPlayer.x - this.x
                    );
                    this.sweepStartAngle = toPlayer - Math.PI / 9; // ±20° sweep (was ±60°)
                    this.sweepEndAngle   = toPlayer + Math.PI / 9;
                    this.sweepAngle = this.sweepStartAngle;
                }
                break;

            case 'warning': {
                // Smoothly rotate turret from its current angle to sweepStartAngle — no jump
                const warningProg = Math.min(1, (now - this.sweepWarningStart) / this.sweepWarningDuration);
                let turretDiff = this.sweepStartAngle - (this.sweepTurretStartAngle || 0);
                while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
                while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
                this.tankTurretAngle = (this.sweepTurretStartAngle || 0) + turretDiff * warningProg;
                if (warningProg >= 1) {
                    this.sweepState = 'sweeping';
                    this.sweepStartTime = now;
                    this.sweepAngle = this.sweepStartAngle;
                }
                break;
            }

            case 'sweeping': {
                const elapsed = now - this.sweepStartTime;
                const progress = Math.min(1, elapsed / this.sweepDuration);
                // Ease-in-out
                const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
                this.sweepAngle = this.sweepStartAngle + (this.sweepEndAngle - this.sweepStartAngle) * eased;
                // Turret tracks the laser as it sweeps
                this.tankTurretAngle = this.sweepAngle;

                // Deal damage to player if in beam
                const beamLength = Math.min(window.innerWidth, window.innerHeight) * 0.65;
                const beamHalfWidth = 28;
                if (now - this.sweepLastDamage > 180 && this.isPlayerInSweepBeam(this.targetPlayer, this.sweepAngle, beamLength, beamHalfWidth)) {
                    // Spawn a very-short-lived bullet at player position so existing collision handles damage
                    const hitBullet = gameEngine.enemyBulletPool.get();
                    if (hitBullet) {
                        hitBullet.reset(this.targetPlayer.x, this.targetPlayer.y, 0, 0, '#aa44ff', false);
                        hitBullet.radius = 8;
                        hitBullet.damage = this.getLevelScaledDamage(3);
                        hitBullet.movementPattern = 'aimed';
                        hitBullet.isPersistent = false;
                        hitBullet.maxLifetimeOverride = 120; // Dies in ~120ms
                    }
                    this.sweepLastDamage = now;

                    // Visual spark at player
                    if (gameEngine.particlePool) {
                        for (let i = 0; i < 4; i++) {
                            const p = gameEngine.particlePool.get(this.targetPlayer.x, this.targetPlayer.y, 'starSparkle');
                            if (p) { p.color = '#cc66ff'; }
                        }
                    }
                }

                if (progress >= 1) {
                    this.sweepState = 'cooldown';
                    this.sweepCooldownEnd = now + 8000; // 8s between sweeps
                }
                break;
            }
        }
    }

    isPlayerInSweepBeam(player, beamAngle, beamLength, beamHalfWidth) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > beamLength) return false;
        const angleToPlayer = Math.atan2(dy, dx);
        let angleDiff = angleToPlayer - beamAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const perpDist = Math.abs(Math.sin(angleDiff) * dist);
        return perpDist < beamHalfWidth + (player.radius || 12);
    }

    // ── Sentinel Weapon: 8-bullet circle burst ───────────────────────────────
    // Fires when NOT arcing (during spin-up or cooldown phases).
    updateSentinelSweep(gameEngine) {
        if (!this.targetPlayer) return;
        const now = frameClock.now;

        // Fire during spin-up and cooldown phases (not while arcing)
        if (this.weaverState === 'arcing') return;

        if (this.sentinelLastShot === undefined) this.sentinelLastShot = 0;
        if (this.sentinelBurstsFired === undefined) this.sentinelBurstsFired = 0;

        // Reduced interval (1400ms) so 3 bursts happen before the arc move
        if (now - this.sentinelLastShot > 1400) {
            this.shootCircleBurst(gameEngine, 8);
            this.sentinelLastShot = now;
            this.sentinelBurstsFired++;
        }
    }

    shootCircleBurst(gameEngine, count = 8) {
        // Fire `count` green hexagon bullets evenly spaced around 360°, from center
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const bullet = this.createEnemyBullet(gameEngine, angle, 4, '#00ff44', false, 'aimed');
            if (bullet) {
                bullet.shape = 'hexagon';
                bullet.rotation = angle;
                bullet.rotationSpeed = 0.12; // visibly spinning
                bullet.radius = 7;
                bullet.glowRadius = 14;
                bullet.color = '#00ff88';
                bullet.damage = this.getLevelScaledDamage(2);
                bullet.maxLifetimeOverride = 4000;
            }
        }
    }

    // ── Draw Sweep Laser (called from draw() outside ctx.translate/rotate) ──
    drawSweepLaser(ctx) {
        if (!this.sweepState || this.sweepState === 'idle' || this.sweepState === 'cooldown') return;

        // Muzzle world position — barrel tip of the turret
        const size = this.radius * 0.9;
        const muzzleOffset = size * 0.28 + size * 1.5; // barrel start + barrel length
        const turretAngle = this.tankTurretAngle || 0;
        const muzzleX = this.x + Math.cos(turretAngle) * muzzleOffset;
        const muzzleY = this.y + Math.sin(turretAngle) * muzzleOffset;

        const beamLength = Math.min(window.innerWidth, window.innerHeight) * 0.65;
        ctx.save();

        if (this.sweepState === 'warning') {
            const pulse = Math.sin(frameClock.now * 0.015) * 0.35 + 0.65;
            const progress = (frameClock.now - this.sweepWarningStart) / this.sweepWarningDuration;

            // Warning arc showing sweep range (from muzzle)
            ctx.strokeStyle = rgba(180, 60, 255, 0.25 * pulse);
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 6]);
            ctx.beginPath();
            ctx.arc(muzzleX, muzzleY, 100, this.sweepStartAngle, this.sweepEndAngle);
            ctx.stroke();
            ctx.setLineDash([]);

            // Dashed warning line from muzzle
            const warningAngle = this.sweepStartAngle + (this.sweepEndAngle - this.sweepStartAngle) * progress;
            const wEndX = muzzleX + Math.cos(warningAngle) * beamLength;
            const wEndY = muzzleY + Math.sin(warningAngle) * beamLength;
            ctx.strokeStyle = rgba(200, 80, 255, 0.45 * pulse);
            ctx.lineWidth = 4;
            ctx.setLineDash([16, 8]);
            ctx.beginPath();
            ctx.moveTo(muzzleX, muzzleY);
            ctx.lineTo(wEndX, wEndY);
            ctx.stroke();
            ctx.setLineDash([]);

        } else if (this.sweepState === 'sweeping') {
            // Fade in at start, fade out at end using sin curve
            const sweepElapsed = frameClock.now - this.sweepStartTime;
            const sweepProg = Math.min(1, sweepElapsed / this.sweepDuration);
            const fadeAlpha = Math.sin(sweepProg * Math.PI); // 0 → 1 → 0

            const endX = muzzleX + Math.cos(this.sweepAngle) * beamLength;
            const endY = muzzleY + Math.sin(this.sweepAngle) * beamLength;

            ctx.lineCap = 'round';

            // Outer wide glow
            // OPT-2: live GPU blur removed — multi-pass stroke provides glow
            ctx.shadowBlur = 0;
            ctx.shadowColor = '#aa44ff';
            ctx.strokeStyle = rgba(170, 68, 255, 0.25 * fadeAlpha);
            ctx.lineWidth = 50;
            ctx.beginPath();
            ctx.moveTo(muzzleX, muzzleY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Middle glow
            ctx.shadowBlur = 0;
            ctx.strokeStyle = rgba(200, 100, 255, 0.55 * fadeAlpha);
            ctx.lineWidth = 22;
            ctx.beginPath();
            ctx.moveTo(muzzleX, muzzleY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Inner bright core
            ctx.shadowBlur = 0;
            ctx.shadowColor = '#ffffff';
            ctx.strokeStyle = rgba(240, 200, 255, 0.95 * fadeAlpha);
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(muzzleX, muzzleY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            ctx.shadowBlur = 0;
        }

        ctx.restore();
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