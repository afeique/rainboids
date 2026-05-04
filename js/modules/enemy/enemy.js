// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG, ENEMY_BULLET_CONFIG, getEnemyFiringCooldown } from '../core/constants.js';
import { random, GameDimensions } from '../core/utils.js';
import { rgba } from '../core/color-cache.js';
import { frameClock } from '../core/frame-clock.js';
import { ENEMY_TYPES } from './enemy-data.js';
import * as movement from './movement.js';
import * as firing from './firing.js';
import * as shapes from './shapes.js';
import * as ai from './ai.js';

// Re-export for consumers that import from enemy.js
export { ENEMY_TYPES };

// ── Feature toggles ────────────────────────────────────────────────────────
// Set window.SHOW_ENEMY_NAMES = false in the browser console to hide name labels
const showEnemyNames = () => window.SHOW_ENEMY_NAMES !== false; // default: true

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
        // Smoothstep position curve + ease-out scale; longer baseline so the
        // entity grows in visibly instead of flashing into existence.
        const dist = Math.hypot(targetX - this.x, targetY - this.y);
        this.warpDuration = Math.min(1500, 700 + dist * 0.35);
        this.warpAngle = Math.atan2(targetY - this.y, targetX - this.x);
        this.faceAngle = this.warpAngle; // Face the warp direction
        this.warpTrail = [];
        this.warpScale = 0.15;            // grows to 1.0 by warp end
    }

    updateWarpIn() {
        const now = frameClock.now;
        const elapsed = now - this.warpStartTime;
        const t = Math.min(1, elapsed / this.warpDuration);

        // Smoothstep for position — gentle accelerate, gentle decelerate, no
        // snap at arrival. Scale uses ease-out quad so the entity becomes
        // visible quickly then settles into final size.
        const tPos = t * t * (3 - 2 * t);
        const tScale = 1 - Math.pow(1 - t, 2);

        this.x = this.warpStartX + (this.warpTargetX - this.warpStartX) * tPos;
        this.y = this.warpStartY + (this.warpTargetY - this.warpStartY) * tPos;
        this.warpScale = 0.15 + 0.85 * tScale;

        this.warpTrail.push({ x: this.x, y: this.y, time: now });
        while (this.warpTrail.length > 0 && now - this.warpTrail[0].time > 500) {
            this.warpTrail.shift();
        }

        if (t >= 1) {
            this.warping = false;
            this.x = this.warpTargetX;
            this.y = this.warpTargetY;
            this.warpTrail = [];
            this.warpScale = 1.0;
        }
    }

    drawWarpEffect(ctx) { return shapes.drawWarpEffect.call(this, ctx); }

    update(playerRef, gameEngine, gameField = null) {
        if (!this.active) return;
        this.gameEngine = gameEngine; // Cache ref for draw/takeDamage (removes window.gameEngine dependency)

        // Death sequence — enemy DRIFTS while emitting small popcorn
        // explosions, then a big final explosion fires when the timer hits
        // zero. Multi-stage death feels more dramatic than a single burst.
        //
        //   _deathFlash counts DOWN from _deathFlashMax.
        //   While > 0:  drift at gentle speed, emit small bursts every
        //               few frames (rings, embers, sparkles).
        //   At 0:       fire the big final explosion via the engine,
        //               then deactivate.
        if (this._deathFlash > 0) {
            // Continue drifting under inertia, gradually decelerating.
            const drag = 0.97;
            this.vel.x *= drag;
            this.vel.y *= drag;
            this.x += this.vel.x * GAME_CONFIG.TICK_SCALE;
            this.y += this.vel.y * GAME_CONFIG.TICK_SCALE;
            // Small wobble rotation so the wreck visibly tumbles.
            this.faceAngle = (this.faceAngle || 0) + 0.04;

            // Periodic mini-bursts — every 3 frames so the wreck looks
            // like it's continuously cooking off as it tumbles. More
            // particles per burst, plus a small screen shake on each
            // pop so the player FEELS every secondary explosion.
            const tickIntoDeath = (this._deathFlashMax || 36) - this._deathFlash;
            if (gameEngine && gameEngine.particlePool && tickIntoDeath % 3 === 0) {
                const r = this.radius || 18;
                const a = Math.random() * Math.PI * 2;
                const dist = r * (0.3 + Math.random() * 0.8);
                const sx = this.x + Math.cos(a) * dist;
                const sy = this.y + Math.sin(a) * dist;
                const c = (this.color || '#ff6644');
                // Two flashes — bright core + colored halo — so each pop
                // reads even on a busy screen.
                gameEngine.particlePool.get(sx, sy, 'explosionFlash', r * 0.85);
                gameEngine.particlePool.get(sx, sy, 'explosionRingColored', r * (0.8 + Math.random() * 0.8),
                    Math.random() < 0.5 ? '#ffffff' : c);
                gameEngine.particlePool.get(sx, sy, 'explosionRingColored', r * (1.1 + Math.random() * 0.6),
                    Math.random() < 0.4 ? '#ffcc66' : c);
                // 5 sparks (was 3) flying in random directions
                for (let i = 0; i < 5; i++) {
                    const sa = Math.random() * Math.PI * 2;
                    const sp = 1.5 + Math.random() * 3.0;
                    const col = i === 0 ? '#ffffff'
                              : i === 1 ? '#ffcc66'
                              : c;
                    gameEngine.particlePool.get(sx, sy, 'explosionShrapnel', sa, sp, col);
                }
                // Two embers + two sparkles — visible afterglow on each pop
                const emberC = (tickIntoDeath % 2) ? c : '#ffcc66';
                gameEngine.particlePool.get(sx, sy, 'explosionEmber', emberC);
                gameEngine.particlePool.get(sx, sy, 'explosionEmber', '#ffffff');
                gameEngine.particlePool.get(sx, sy, 'starSparkle');
                gameEngine.particlePool.get(sx, sy, 'starSparkle');

                // Tactile feedback — small shake on each secondary pop.
                // Only on-screen so off-screen wrecks don't shake the
                // camera for no visible reason. Magnitude tapers as the
                // wreck winds down.
                if (typeof gameEngine.isEntityOnScreen === 'function'
                    && gameEngine.isEntityOnScreen(this)
                    && typeof gameEngine.triggerScreenShake === 'function') {
                    const fade = this._deathFlash / (this._deathFlashMax || 36);
                    gameEngine.triggerScreenShake(4, 2 + fade * 2.5);
                }
            }

            this._deathFlash--;
            if (this._deathFlash <= 0) {
                // Final big explosion before we recycle. Wrapped in a try
                // so a missing engine ref can't ever silently swallow the
                // explosion (the user's complaint: explosions sometimes
                // missing). If something explodes here we want to know.
                if (gameEngine && typeof gameEngine.triggerEnemyFinalExplosion === 'function') {
                    try { gameEngine.triggerEnemyFinalExplosion(this); }
                    catch (err) { console.error('triggerEnemyFinalExplosion failed', err); }
                }
                this.active = false;
            }
            return;
        }

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
        
        // Asteroid avoidance — enemies now actively steer away from rocks.
        // Collision still registers on contact (handlEnemyAsteroidCollision)
        // and remains non-damaging for both enemy and asteroid; the AI just
        // tries not to fly into them in the first place.
        this.avoidAsteroids(gameEngine);
        
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
        if (this.health <= 0.001 && this.active) {
            this.active = false;
            // QA bot kill tracking — catch kills not routed through collision system
            if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: this.type, wave: this.gameEngine?.game?.currentWave, ts: Date.now(), maxHealth: this.maxHealth });
        }
    }
    
    updateFaceDirection() { return ai.updateFaceDirection.call(this); }
    
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
    
    chasePlayer() { return movement.chasePlayer.call(this); }
    
    patrolMovement() { return movement.patrolMovement.call(this); }

    drifterWaveMovement() { return movement.drifterWaveMovement.call(this); }

    swarmMovement() { return movement.swarmMovement.call(this); }
    
    orbitalMovement() { return movement.orbitalMovement.call(this); }
    
    stealthMovement(now) { return movement.stealthMovement.call(this, now); }
    
    fishDartMovement() { return movement.fishDartMovement.call(this); }

    startFishDart() { return movement.startFishDart.call(this); }
    
    cardinalGridMovement() { return movement.cardinalGridMovement.call(this); }

    chooseNewGridDirection() { return movement.chooseNewGridDirection.call(this); }
    
    wavyMovement() { return movement.wavyMovement.call(this); }
    
    knightMovement() { return movement.knightMovement.call(this); }

    startKnightMove() { return movement.startKnightMove.call(this); }
    
    spiralBurstMovement() { return movement.spiralBurstMovement.call(this); }

    startSpiralBurst() { return movement.startSpiralBurst.call(this); }
    
    heavyCrawlMovement() { return movement.heavyCrawlMovement.call(this); }
    
    updateTargetPriority(playerDistance, gameEngine) { return ai.updateTargetPriority.call(this, playerDistance, gameEngine); }
    
    initializeTerritory(gameEngine) { return ai.initializeTerritory.call(this, gameEngine); }
    
    getTerritorySize() { return ai.getTerritorySize.call(this); }
    
    isPlayerInTerritory(player) { return ai.isPlayerInTerritory.call(this, player); }
    
    findNearestAsteroid(gameEngine) { return ai.findNearestAsteroid.call(this, gameEngine); }
    
    isAsteroidInTerritory(asteroid) { return ai.isAsteroidInTerritory.call(this, asteroid); }
    
    maintainDistanceFromPlayer() { return ai.maintainDistanceFromPlayer.call(this); }
    
    maintainDistanceFromEnemies(enemies) { return ai.maintainDistanceFromEnemies.call(this, enemies); }
    
    patrolTerritory() { return ai.patrolTerritory.call(this); }
    
    generateNewPatrolPoint() { return ai.generateNewPatrolPoint.call(this); }
    
    updateLightTrail() { return ai.updateLightTrail.call(this); }
    
    createTrailParticles(gameEngine) { return ai.createTrailParticles.call(this, gameEngine); }
    
    // Geometric Movement Patterns
    triangleMovement() { return movement.triangleMovement.call(this); }

    calculateTriangleVertices() { return movement.calculateTriangleVertices.call(this); }

    squareMovement() { return movement.squareMovement.call(this); }

    calculateSquareVertices() { return movement.calculateSquareVertices.call(this); }

    diamondMovement() { return movement.diamondMovement.call(this); }

    calculateDiamondVertices() { return movement.calculateDiamondVertices.call(this); }

    hexagonMovement() { return movement.hexagonMovement.call(this); }

    calculateHexagonVertices() { return movement.calculateHexagonVertices.call(this); }
    
    tankMovement() { return movement.tankMovement.call(this); }
    
    arcMovement() { return movement.arcMovement.call(this); }

    zigzagMovement() { return movement.zigzagMovement.call(this); }

    tacticalHoverMovement() { return movement.tacticalHoverMovement.call(this); }

    waspDartMovement() { return movement.waspDartMovement.call(this); }

    crossMovement() { return movement.crossMovement.call(this); }

    circleMovement() { return movement.circleMovement.call(this); }

    stationaryMovement() { return movement.stationaryMovement.call(this); }

    keepDistanceMovement() { return movement.keepDistanceMovement.call(this); }
    
    
    avoidAsteroids(gameEngine) { return ai.avoidAsteroids.call(this, gameEngine); }
    
    updateEvasiveManeuvers(gameEngine) { return ai.updateEvasiveManeuvers.call(this, gameEngine); }
    
    dodgePlayerBullets(gameEngine) { return ai.dodgePlayerBullets.call(this, gameEngine); }
    
    avoidPlayerLineOfSight() { return ai.avoidPlayerLineOfSight.call(this); }
    
    addMicroMovements() { return ai.addMicroMovements.call(this); }
    
    addFishLikeMovement() { return ai.addFishLikeMovement.call(this); }
    
    dodgeEnemyBullets(gameEngine) { return ai.dodgeEnemyBullets.call(this, gameEngine); }
    
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
    
    handleBurstShooting(gameEngine, now) { return firing.handleBurstShooting.call(this, gameEngine, now); }

    shoot(gameEngine) { return firing.shoot.call(this, gameEngine); }

    isStationary() { return firing.isStationary.call(this); }

    shootAimed(gameEngine, targetX, targetY) { return firing.shootAimed.call(this, gameEngine, targetX, targetY); }

    shootSpread(gameEngine, targetX, targetY) { return firing.shootSpread.call(this, gameEngine, targetX, targetY); }

    shootRapid(gameEngine, targetX, targetY) { return firing.shootRapid.call(this, gameEngine, targetX, targetY); }

    shootSpiral(gameEngine, targetX, targetY) { return firing.shootSpiral.call(this, gameEngine, targetX, targetY); }

    shootBurst(gameEngine, targetX, targetY) { return firing.shootBurst.call(this, gameEngine, targetX, targetY); }

    shootExplosive(gameEngine, targetX, targetY) { return firing.shootExplosive.call(this, gameEngine, targetX, targetY); }

    shootLaser(gameEngine, targetX, targetY) { return firing.shootLaser.call(this, gameEngine, targetX, targetY); }

    createLaserChargingEffect(gameEngine) { return firing.createLaserChargingEffect.call(this, gameEngine); }

    shootArcLightning(gameEngine, targetX, targetY) { return firing.shootArcLightning.call(this, gameEngine, targetX, targetY); }

    createArcLightningBolt(gameEngine, targetX, targetY) { return firing.createArcLightningBolt.call(this, gameEngine, targetX, targetY); }

    buildLightningPath(x1, y1, x2, y2, iterations) { return firing.buildLightningPath.call(this, x1, y1, x2, y2, iterations); }

    // Draw stored lightning bolt (canvas lines, NOT bullet pool visuals).
    // Called every frame from draw() until the bolt expires.
    drawLightningBolt(ctx) { return shapes.drawLightningBolt.call(this, ctx); }

    createWideLaserBeam(gameEngine, angle) { return firing.createWideLaserBeam.call(this, gameEngine, angle); }

    shootMissile(gameEngine, targetX, targetY) { return firing.shootMissile.call(this, gameEngine, targetX, targetY); }

    shootPulse(gameEngine, targetX, targetY) { return firing.shootPulse.call(this, gameEngine, targetX, targetY); }

    shootSpiralLaser(gameEngine) { return firing.shootSpiralLaser.call(this, gameEngine); }

    shootShieldBurst(gameEngine, targetX, targetY) { return firing.shootShieldBurst.call(this, gameEngine, targetX, targetY); }

    shootBurst3(gameEngine, targetX, targetY) { return firing.shootBurst3.call(this, gameEngine, targetX, targetY); }

    shootBurst2(gameEngine, targetX, targetY) { return firing.shootBurst2.call(this, gameEngine, targetX, targetY); }

    updateWaspMachineGun(gameEngine) { return firing.updateWaspMachineGun.call(this, gameEngine); }

    shootWaspBullet(gameEngine, targetX, targetY) { return firing.shootWaspBullet.call(this, gameEngine, targetX, targetY); }

    shootGuardianSpread(gameEngine, targetX, targetY) { return firing.shootGuardianSpread.call(this, gameEngine, targetX, targetY); }

    layMine(gameEngine, targetX, targetY) { return firing.layMine.call(this, gameEngine, targetX, targetY); }

    shootLine4(gameEngine, targetX, targetY) { return firing.shootLine4.call(this, gameEngine, targetX, targetY); }

    shootCircle6(gameEngine, targetX, targetY) { return firing.shootCircle6.call(this, gameEngine, targetX, targetY); }

    shootHoming(gameEngine, targetX, targetY) { return firing.shootHoming.call(this, gameEngine, targetX, targetY); }

    shootTitanRocket(gameEngine, targetX, targetY) { return firing.shootTitanRocket.call(this, gameEngine, targetX, targetY); }

    shootChargedLaser(gameEngine, targetX, targetY) { return firing.shootChargedLaser.call(this, gameEngine, targetX, targetY); }

    createLaserBeam(gameEngine, angle) { return firing.createLaserBeam.call(this, gameEngine, angle); }

    shootCrescentWave(gameEngine, targetX, targetY) { return firing.shootCrescentWave.call(this, gameEngine, targetX, targetY); }

    createCrescentBeam(gameEngine, baseAngle) { return firing.createCrescentBeam.call(this, gameEngine, baseAngle); }

    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) { return firing.createEnemyBullet.call(this, gameEngine, angle, speed, color, explosive, movementPattern, target); }
    

    
    draw(ctx) {
        if (!this.active) return;

        // Death flash — BIG white silhouette that starts scaled up and fades/shrinks
        if (this._deathFlash > 0) {
            const maxT = this._deathFlashMax || 8;
            const t = this._deathFlash;
            const progress = 1 - t / maxT; // 0→1 over lifetime

            // Start at 1.5x scale, shrink to 0.3x while fading out
            // The initial large scale is immediately visible during hitstop
            const scale = 1.5 - progress * 1.2;
            const alpha = Math.max(0, 1.0 - progress * 1.1);

            // Draw bright additive glow behind the silhouette
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const glowR = this.radius * scale * 3.0;
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.7})`);
            grad.addColorStop(0.3, `rgba(200, 230, 255, ${alpha * 0.35})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Draw enemy shape as solid white silhouette at scaled size
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.faceAngle);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;
            this._deathFlashRendering = true;
            this.drawEnemyShape(ctx);
            this._deathFlashRendering = false;
            ctx.restore();

            return;
        }

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
        if (this.gameEngine && this.gameEngine.targetedEntity === this) {
            this.drawTargetingEffect(ctx);
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.faceAngle); // Rotate to face direction
        if (this.warping && this.warpScale != null && this.warpScale < 1) {
            // Entity grows from 15% → 100% during warp-in.
            ctx.scale(this.warpScale, this.warpScale);
        }

        // Health-based transparency
        const healthRatio = this.health / this.maxHealth;
        const baseAlpha = 0.7 + (healthRatio * 0.3);
        ctx.globalAlpha = baseAlpha;

        // Draw distinct geometric shape based on enemy type
        this.drawEnemyShape(ctx);

        // Damage flash — redraw hull as white silhouette overlay on hit
        // Single additive pass to match asteroid flash intensity
        if (this._hitFlashTimer > 0) {
            const flashAlpha = Math.min(1, (this._hitFlashTimer / 10) * 0.9);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = flashAlpha;
            this._deathFlashRendering = true;
            this.drawEnemyShape(ctx);
            this._deathFlashRendering = false;
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();

        // Hit flash — localized at bullet impact point (world-space)
        if (this._hitFlashTimer > 0) {
            const maxT = 10;
            const t = this._hitFlashTimer;
            const alpha = t / maxT;
            const progress = 1 - alpha;
            const fr = this.radius * 0.75; // localized flash

            // Use stored impact point, or fall back to entity center
            const hp = this._hitPoint || { x: this.x, y: this.y };
            // Clamp impact point to within entity radius (bullet may be slightly outside)
            const dx0 = hp.x - this.x;
            const dy0 = hp.y - this.y;
            const d0 = Math.hypot(dx0, dy0);
            const maxDist = this.radius * 0.9;
            const cx = d0 > maxDist ? this.x + (dx0 / d0) * maxDist : hp.x;
            const cy = d0 > maxDist ? this.y + (dy0 / d0) * maxDist : hp.y;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Localized flash — radial gradient at impact point
            const flashAlpha = alpha * 0.8;
            const flashRadius = fr * (1 + progress * 0.5);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
            grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
            grad.addColorStop(0.5, `rgba(200, 230, 255, ${flashAlpha * 0.4})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
            ctx.fill();

            // Small expanding ring from impact point
            if (progress > 0.1) {
                const ringProgress = (progress - 0.1) / 0.9;
                const ringRadius = fr * (0.4 + ringProgress * 2.0);
                const ringAlpha = (1 - ringProgress) * 0.35;
                ctx.strokeStyle = `rgba(180, 220, 255, ${ringAlpha})`;
                ctx.lineWidth = Math.max(1, fr * 0.10 * (1 - ringProgress));
                ctx.beginPath();
                ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Directional debris sparks from impact point
            const hitAngle = this._hitAngle || 0;
            const debrisCount = 5;
            const colors = ['255,255,255', '120,235,255', '255,255,150', '190,150,255', '255,200,100'];
            for (let i = 0; i < debrisCount; i++) {
                // Sparks spread in a cone away from the impact direction
                const angle = hitAngle + (i / debrisCount - 0.5) * 1.8;
                const speed = 0.5 + ((i * 31) % 10) * 0.07;
                const dist = progress * fr * 3.0 * speed;
                const ddx = Math.cos(angle) * dist;
                const ddy = Math.sin(angle) * dist;

                const sz = fr * (0.20 - progress * 0.10);
                if (sz <= 0) continue;

                const debrisAlpha = alpha * 0.55;
                ctx.fillStyle = `rgba(${colors[i]}, ${debrisAlpha})`;
                ctx.beginPath();
                ctx.arc(cx + ddx, cy + ddy, sz, 0, Math.PI * 2);
                ctx.fill();
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
        if (this.gameEngine && this.gameEngine.targetedEntity === this) {
            this.drawPulsatingCircle(ctx);
        }
        
        // Draw health bar (outside of transform)
        this.drawHealthBar(ctx);

        // Level + name label BENEATH the enemy is intentionally disabled —
        // this info now lives only in the top-center info panel (see
        // hud/combat.js drawTargetInfo). Keeping the block as a comment for
        // reference rather than deleting outright.
        /*
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

            ctx.globalAlpha = 0.4;
            ctx.font = '14px "Silkscreen", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(lvText, startX, textY);
            ctx.fillStyle = '#88ccff';
            ctx.fillText(numText, startX + lvWidth, textY);
            ctx.fillStyle = 'goldenrod';
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            ctx.globalAlpha = 1.0;
            ctx.font = '13px "Silkscreen", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(lvText, startX, textY);
            ctx.fillStyle = '#88ccff';
            ctx.fillText(numText, startX + lvWidth, textY);
            ctx.fillStyle = 'goldenrod';
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            ctx.restore();
        }
        */
    }
    
    drawLaserTargetingLine(ctx) { return shapes.drawLaserTargetingLine.call(this, ctx); }
    
    drawLaserChargingBall(ctx) { return shapes.drawLaserChargingBall.call(this, ctx); }
    
    drawTargetingEffect(ctx) { return shapes.drawTargetingEffect.call(this, ctx); }
    
    drawEnemyShape(ctx) { return shapes.drawEnemyShape.call(this, ctx); }
    
    // drawAimingTriangle method removed - not working as intended

    drawTriangle(ctx) { return shapes.drawTriangle.call(this, ctx); }
    
    drawSquare(ctx) { return shapes.drawSquare.call(this, ctx); }
    
    drawDiamond(ctx) { return shapes.drawDiamond.call(this, ctx); }
    
    drawHexagon(ctx) { return shapes.drawHexagon.call(this, ctx); }
    
    drawCross(ctx) { return shapes.drawCross.call(this, ctx); }
    
    drawSpikedCircle(ctx) { return shapes.drawSpikedCircle.call(this, ctx); }
    
    drawLaserTurret(ctx) { return shapes.drawLaserTurret.call(this, ctx); }
    
    drawMissileTurret(ctx) { return shapes.drawMissileTurret.call(this, ctx); }
    
    drawPulseTurret(ctx) { return shapes.drawPulseTurret.call(this, ctx); }
    
    drawShieldTurret(ctx) { return shapes.drawShieldTurret.call(this, ctx); }
    
    drawWaspShip(ctx) { return shapes.drawWaspShip.call(this, ctx); }
    
    drawEmeraldGuardian(ctx) { return shapes.drawEmeraldGuardian.call(this, ctx); }
    
    drawTitanTank(ctx) { return shapes.drawTitanTank.call(this, ctx); }
    
    drawStalkerSword(ctx) { return shapes.drawStalkerSword.call(this, ctx); }
    
    drawPulsatingCircle(ctx) { return shapes.drawPulsatingCircle.call(this, ctx); }
    
    drawLightTrail(ctx) { return shapes.drawLightTrail.call(this, ctx); }
    
    drawHealthBar(ctx) { return shapes.drawHealthBar.call(this, ctx); }
    
    drawLaserChargingEffect(ctx) { return shapes.drawLaserChargingEffect.call(this, ctx); }
    
    // Cooldown timer method removed - turrets are now mobile
    
    hasLineOfSight(target, gameEngine) { return ai.hasLineOfSight.call(this, target, gameEngine); }
    
    takeDamage(damage, opts = {}) {
        // opts: { isCrit?: bool, isEmpowered?: bool }
        // Invulnerable during warp-in or death flash
        if (this.warping || this._deathFlash > 0) return false;

        this.health -= damage;

        // Create damage number — pass through crit/empowered flags so the
        // popup renders distinctly (bigger font, hot color, "CRIT!" label).
        if (this.gameEngine) {
            this.gameEngine.createDamageNumber(this.x, this.y - this.radius, damage, opts);
        }
        
        // Safeguard: clamp health between 0 and maxHealth
        this.health = Math.max(0, Math.min(this.health, this.maxHealth));
        
        // Use small tolerance for floating-point precision issues
        return this.health <= 0.001;
    }
    
    weaverSpinupMovement(gameEngine) { return movement.weaverSpinupMovement.call(this, gameEngine); }

    waspZigzagMovement() { return movement.waspZigzagMovement.call(this); }

    boulderMovement() { return movement.boulderMovement.call(this); }

    updateSweepLaserSystem(gameEngine) { return firing.updateSweepLaserSystem.call(this, gameEngine); }

    isPlayerInSweepBeam(player, beamAngle, beamLength, beamHalfWidth) { return firing.isPlayerInSweepBeam.call(this, player, beamAngle, beamLength, beamHalfWidth); }

    updateSentinelSweep(gameEngine) { return firing.updateSentinelSweep.call(this, gameEngine); }

    shootCircleBurst(gameEngine, count = 8) { return firing.shootCircleBurst.call(this, gameEngine, count); }

    // ── Draw Sweep Laser (called from draw() outside ctx.translate/rotate) ──
    drawSweepLaser(ctx) { return shapes.drawSweepLaser.call(this, ctx); }

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