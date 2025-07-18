// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './constants.js';
import { random, collision, burstStarCollision, triggerHapticFeedback, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon } from './utils.js';
import { starfieldRenderer } from './performance/starfield-renderer.js';
import { lightweightStarfieldOptimizer } from './performance/lightweight-starfield.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { PoolManager } from './pool-manager.js';
import { Player } from './entities/player.js';
import { Bullet } from './entities/bullet.js';
import { Asteroid } from './entities/asteroid.js';
import { Particle } from './entities/particle.js';
import { ColorStar } from './entities/color-star.js';
import { BackgroundStar } from './entities/background-star.js';
import { LineDebris } from './entities/line-debris.js';

export const PLAYER_STATES = {
    NORMAL: 'normal'
};

export class GameEngine {
    constructor(canvas, uiManager, audioManager, inputHandler) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.uiManager = uiManager;
        this.audioManager = audioManager;
        this.inputHandler = inputHandler;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Initialize game state properties
        this.initializeGameState();
        
        this.initializePools();
        this.setupEventListeners();
        this.playerCanFire = true;
        this.previousFire = false;
        this.baseDamage = 20; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();
        this.shieldIcon.src = 'assets/shield-icon.svg';
        
        // Initialize optimized starfield renderer
        starfieldRenderer.initialize();
        this.starfieldRenderMode = 'depth'; // Options: 'depth', 'lightweight', 'fallback', 'heavy'
    }
    
    // Helper method to initialize/reset game state
    initializeGameState() {
        this.game = {
            score: 0,
            money: 0,
            highScore: 0,
            currentWave: 0,
            state: GAME_STATES.TITLE_SCREEN,
            lastState: GAME_STATES.TITLE_SCREEN,
            screenShakeDuration: 0,
            screenShakeMagnitude: 0
        };
    }
    
    initializePools() {
        this.player = new Player();
        
        this.bulletPool = new PoolManager(Bullet, 20);
        this.particlePool = new PoolManager(Particle, 200);
        this.lineDebrisPool = new PoolManager(LineDebris, 100);
        this.asteroidPool = new PoolManager(Asteroid, 20);
        this.colorStarPool = new PoolManager(ColorStar, GAME_CONFIG.COLOR_STAR_COUNT + 100);
        this.backgroundStarPool = new PoolManager(BackgroundStar, GAME_CONFIG.BACKGROUND_STAR_COUNT);
    }
    
    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            this.uiManager.checkOrientation();
        });
        
        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            this.uiManager.checkOrientation();
        });
        
        // Handle mouse movement for cursor changes
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const target = this.checkCursorTarget(mouseX, mouseY);
            if (target === 'enemy') {
                this.canvas.classList.add('asteroid-hover');
            } else {
                this.canvas.classList.remove('asteroid-hover');
            }
        });
        
        // Handle pause
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                this.togglePause();
            }
        });
        
        // Handle game restart
        window.addEventListener('click', () => {
            if (this.game.state === GAME_STATES.GAME_OVER) {
                this.init();
            }
        });
        
        window.addEventListener('touchstart', () => {
            if (this.game.state === GAME_STATES.GAME_OVER) {
                this.init();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Enter' && this.game.state === GAME_STATES.GAME_OVER) {
                this.init();
            }
        });
    }
    
    init() {
        // Reset core game state (score, money, wave)
        this.initializeGameState();
        this.game.state = GAME_STATES.PLAYING;
        // Reset player
        this.player = new Player();
        // Reset shields
        this.playerShields = 50; // Start with 50 health
        this.shieldTanks = 0; // Reset to zero tanks
        this.displayShields = 50; // Match starting health
        this.displayTanks = 0;
        this.animatingDamage = false;
        this.pendingDamage = 0; // Reset pending damage
        // Clear all pools
        this.bulletPool.activeObjects = [];
        this.particlePool.activeObjects = [];
        this.lineDebrisPool.activeObjects = [];
        this.asteroidPool.activeObjects = [];
        this.colorStarPool.activeObjects = [];
        this.backgroundStarPool.activeObjects = [];
        
        // Generate all color stars at once using generative method
        this.generateInitialColorStars();
        this.generateBackgroundStars();
        
        this.startNextWave();
        this.uiManager.hideMessage();
    }
    
    // Generate all initial color stars using purely generative method
    generateInitialColorStars() {
        const spawnWidth = Math.max(this.width, this.height);
        const spawnHeight = this.height;
        
        const starPositions = generateStarPositions(spawnWidth, spawnHeight, GAME_CONFIG.COLOR_STAR_COUNT);
        
        starPositions.forEach(({ x, y, z, density }) => {
            const colorStar = this.colorStarPool.get(x, y, false, z, density);
        });
    }
    
    // Generate background stars using same generative logic
    generateBackgroundStars() {
        const spawnWidth = Math.max(this.width, this.height);
        const spawnHeight = this.height;
        
        const backgroundStarPositions = generateStarPositions(spawnWidth, spawnHeight, GAME_CONFIG.BACKGROUND_STAR_COUNT);
        
        backgroundStarPositions.forEach(({ x, y, z, density }) => {
            const backgroundStar = this.backgroundStarPool.get(x, y, z, density);
        });
    }
    
    // Spawn a single color star using simple random generation (for replacement color stars)
    spawnColorStar() {
        const spawnWidth = Math.max(this.width, this.height);
        const spawnHeight = this.height;
        
        // Simple random position
        const x = random(0, spawnWidth);
        const y = random(0, spawnHeight);
        
        // Same depth distribution as the generative method
        const depthRoll = Math.random();
        let z;
        if (depthRoll < 0.15) { z = random(0.1, 0.3); }      // 15% Very far
        else if (depthRoll < 0.35) { z = random(0.3, 0.6); } // 20% Far
        else if (depthRoll < 0.55) { z = random(0.6, 1.0); } // 20% Mid-far
        else if (depthRoll < 0.70) { z = random(1.0, 1.5); } // 15% Mid
        else if (depthRoll < 0.82) { z = random(1.5, 2.0); } // 12% Mid-close
        else if (depthRoll < 0.91) { z = random(2.0, 2.5); } // 9% Close
        else if (depthRoll < 0.97) { z = random(2.5, 3.0); } // 6% Very close
        else { z = random(3.0, 4.0); }                      // 3% Foreground
        
        // Simple density value (not using complex noise function for individual stars)
        const density = 0.5 + Math.random() * 0.3; // Random density between 0.5-0.8
        
        const colorStar = this.colorStarPool.get(x, y, false, z, density);
    }
    
    startNextWave() {
        // Clean up inactive objects in all pools before starting the next wave
        this.bulletPool.cleanupInactive();
        this.particlePool.cleanupInactive();
        this.lineDebrisPool.cleanupInactive();
        this.asteroidPool.cleanupInactive();
        this.colorStarPool.cleanupInactive();
        this.backgroundStarPool.cleanupInactive();
        this.game.currentWave++;
        this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 1500);
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // Reset player state at wave start
        this.playerState = PLAYER_STATES.NORMAL;
        
        // Restore player health to full between waves
        this.player.health = this.player.maxHealth;
        const numAsteroids = GAME_CONFIG.INITIAL_AST_COUNT + (this.game.currentWave - 1) * 2;
        for (let i = 0; i < numAsteroids; i++) {
            this.spawnAsteroidOffscreen();
        }
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
            }
        }, 1500);
        // No rapid recharge between waves - shields persist
        // Only restore shields at game start
    }

    
    spawnAsteroidOffscreen() {
        let x, y;
        const edge = Math.floor(random(0, 4));
        const r = random(30, 60);
        const spawnBuffer = r * 4;
        
        switch (edge) {
            case 0: x = random(0, this.width); y = -spawnBuffer; break;
            case 1: x = this.width + spawnBuffer; y = random(0, this.height); break;
            case 2: x = random(0, this.width); y = this.height + spawnBuffer; break;
            default: x = -spawnBuffer; y = random(0, this.height); break;
        }
        
        const newAst = this.asteroidPool.get(x, y, r);
        const tx = random(this.width * 0.3, this.width * 0.7);
        const ty = random(this.height * 0.3, this.height * 0.7);
        const ang = Math.atan2(ty - y, tx - x);
        const spd = Math.min(2.5, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.1);
        newAst.vel = { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd };
    }
    
    createDebris(ast) {
        for (let i = 0; i < 25; i++) {
            this.particlePool.get(ast.x, ast.y, 'explosion');
        }
        
        ast.edges.forEach(edge => {
            const p1 = ast.vertices3D[edge[0]];
            const p2 = ast.vertices3D[edge[1]];
            this.lineDebrisPool.get(ast.x, ast.y, p1, p2);
        });
    }
    
    createColorStarBurst(x, y) {
        for (let i = 0; i < 5; i++) {
            // Calculate explosion angle and speed for each collectible burst colorStar
            const angle = (i / 5) * Math.PI * 2 + random(-0.3, 0.3); // Spread evenly with some randomness
            const speed = random(2, 5); // Initial explosion speed
            
            const colorStar = this.colorStarPool.get(x, y, true);
            if (colorStar) {
                // Set initial explosion velocity
                colorStar.vel.x = Math.cos(angle) * speed;
                colorStar.vel.y = Math.sin(angle) * speed;
            }
        }
    }
    
    handleCollisions() {
        // Player-asteroid collisions
        this.asteroidPool.activeObjects.forEach(ast => {
            if (this.player.active && collision(this.player, ast)) {
                this.handlePlayerAsteroidCollision(this.player, ast);
            }
        });

        // Bullet-asteroid collisions
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active || bullet.dying || bullet.hasHit) continue; // Skip dying/used bullets
            for (let j = this.asteroidPool.activeObjects.length - 1; j >= 0; j--) {
                const ast = this.asteroidPool.activeObjects[j];
                if (!ast.active) continue;
                if (collision(bullet, ast)) {
                    this.game.score += 50; // 50 points for hit
                    this.game.money += 50; // 50 money for hit
                    triggerHapticFeedback(60);
                    this.audioManager.playHit();
                    
                    // Damage the asteroid
                    ast.health -= 1;

                    // Impart momentum from bullet
                    const impulse = 0.05; // Adjust for desired push effect
                    ast.vel.x += bullet.vel.x * impulse;
                    ast.vel.y += bullet.vel.y * impulse;
                    
                    // Hit effects
                    this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', ast.baseRadius * 0.5);
                    for (let p = 0; p < 7; p++) {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionRedOrange');
                    }
                    
                    // No screen shake for asteroid hits
                    
                    if (ast.health <= 0) {
                        if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                            this.game.score += 100; // 100 points for destroy
                            this.game.money += 100; // 100 money for destroy
                            this.audioManager.playExplosion();
                            // Multiple fiery shockwave pulses for destruction
                            const pulseCount = 4;
                            for (let n = 0; n < pulseCount; n++) {
                                setTimeout(() => {
                                    this.particlePool.get(ast.x, ast.y, 'explosionPulse', ast.baseRadius * (1.2 + n * 0.5));
                                    this.particlePool.get(ast.x, ast.y, 'fieryExplosionRing', ast.baseRadius * (1.1 + n * 0.2));
                                }, n * 80);
                            }
                            for (let p = 0; p < 54; p++) {
                                this.particlePool.get(ast.x, ast.y, 'explosionRedOrange');
                            }
                            this.createDebris(ast);
                            this.createColorStarBurst(ast.x, ast.y);
                            this.asteroidPool.release(ast);
                            // Enhanced screen shake for small asteroid destruction
                            this.triggerScreenShake(12, ast.baseRadius * 0.5, ast.baseRadius);
                        } else {
                            // Make the explosion really dramatic
                                this.audioManager.playExplosion();
                            // Massive screen shake for large asteroid destruction
                            this.triggerScreenShake(25, ast.baseRadius * 0.8, ast.baseRadius);

                            // Add a bunch of particle effects
                            this.particlePool.get(ast.x, ast.y, 'explosionPulse', ast.baseRadius * 1.5);
                            this.particlePool.get(ast.x, ast.y, 'fieryExplosionRing', ast.baseRadius * 1.2);
                            for (let p = 0; p < 40; p++) {
                                    this.particlePool.get(ast.x, ast.y, 'explosionRedOrange');
                                }
                                this.createDebris(ast);
                                this.createColorStarBurst(ast.x, ast.y);
                            
                            const count = (Math.random() < 0.5 ? 2 : 3) + 1; // Now 3 or 4
                            const newR = ast.baseRadius / Math.sqrt(count);
                            const angleSlice = (2 * Math.PI) / count;
                                
                                for (let k = 0; k < count; k++) {
                                // Spawn fragments around the parent's center with jitter
                                const spawnX = ast.x + random(-ast.radius * 0.2, ast.radius * 0.2);
                                const spawnY = ast.y + random(-ast.radius * 0.2, ast.radius * 0.2);

                                const newAst = this.asteroidPool.get(spawnX, spawnY, newR);
                                
                                if (newAst) {
                                    // Give fragments an explosive, outward velocity
                                    // Systematically spread angles to prevent overlap, with jitter
                                    const baseAngle = k * angleSlice;
                                    const angleJitter = random(-angleSlice / 5, angleSlice / 5);
                                    const angle = baseAngle + angleJitter;

                                    // Greater variance in speed, guaranteed non-zero
                                    const speed = random(1.2, 5.5);
                                    
                                    // Inherit a small amount of parent velocity and add the explosion force
                                    newAst.vel.x = ast.vel.x * 0.2 + Math.cos(angle) * speed;
                                    newAst.vel.y = ast.vel.y * 0.2 + Math.sin(angle) * speed;
                                }
                            }
                            this.asteroidPool.release(ast);
                        }
                    }
                    // Start death animation instead of instant removal
                    bullet.startDying(bullet.x, bullet.y);
                    break;
                }
            }
        }
        
        // Asteroid vs Asteroid collisions
        const activeAsteroids = this.asteroidPool.activeObjects;
        for (let i = 0; i < activeAsteroids.length; i++) {
            for (let j = i + 1; j < activeAsteroids.length; j++) {
                let a1 = activeAsteroids[i], a2 = activeAsteroids[j];
                if (!a1.active || !a2.active) continue;

                // Grant temporary immunity to newly spawned asteroids
                const now = Date.now();
                if (now - a1.creationTime < 750 || now - a2.creationTime < 750) {
                    continue;
                }

                if (collision(a1, a2)) {
                    let dx = a2.x - a1.x, dy = a2.y - a1.y, dist = Math.hypot(dx, dy);
                    if (dist === 0) continue;
                    
                    // Play explosion sound
                    this.audioManager.playExplosion();
                    // Spawn rocky debris particles at collision point
                    const debrisCount = Math.floor(random(10, 18));
                    const cx = (a1.x + a2.x) / 2;
                    const cy = (a1.y + a2.y) / 2;
                    for (let d = 0; d < debrisCount; d++) {
                        this.particlePool.get(cx, cy, 'asteroidCollisionDebris');
                    }
                    
                    let nx = dx / dist, ny = dy / dist, tx = -ny, ty = nx;
                    let dpTan1 = a1.vel.x * tx + a1.vel.y * ty, dpTan2 = a2.vel.x * tx + a2.vel.y * ty;
                    let dpNorm1 = a1.vel.x * nx + a1.vel.y * ny, dpNorm2 = a2.vel.x * nx + a2.vel.y * ny;
                    let m1 = (dpNorm1 * (a1.mass - a2.mass) + 2 * a2.mass * dpNorm2) / (a1.mass + a2.mass);
                    let m2 = (dpNorm2 * (a2.mass - a1.mass) + 2 * a1.mass * dpNorm1) / (a1.mass + a2.mass);
                    
                    a1.vel = { x: tx * dpTan1 + nx * m1, y: ty * dpTan1 + ny * m1 };
                    a2.vel = { x: tx * dpTan2 + nx * m2, y: ty * dpTan2 + ny * m2 };
                    
                    let overlap = 0.5 * (a1.radius + a2.radius - dist + 1);
                    a1.x -= overlap * nx; a1.y -= overlap * ny;
                    a2.x += overlap * nx; a2.y += overlap * ny;
                }
            }
        }
        
        // Player vs Burst ColorStars (only burst stars from asteroid destruction are collectible)
        if (this.player && this.player.active) {
            for (let i = this.colorStarPool.activeObjects.length - 1; i >= 0; i--) {
                const colorStar = this.colorStarPool.activeObjects[i];
                // Only check collision for burst stars using enhanced collision detection
                // Uses larger radius + predictive collision to prevent fast stars from passing through player
                if (colorStar.isBurst && burstStarCollision(this.player, colorStar)) {
                    this.game.score += GAME_CONFIG.BURST_STAR_SCORE;
                    this.game.money += GAME_CONFIG.BURST_STAR_SCORE;
                    this.audioManager.playCoin();
                    
                    // Create focused golden burst effect
                    // Central bright flash - smaller and more focused
                    const blip = this.particlePool.get(colorStar.x, colorStar.y, 'starBlip');
                    if (blip) {
                        blip.color = '#FFFF00'; // Bright golden-yellow
                        blip.radius = 4; // Smaller, more focused
                        blip.life = 0.4; // Shorter duration
                        blip.fadeRate = 0.1;
                        blip.growthRate = 0.2; // Less expansion
                    }
                    
                    // Enhanced ring of sparkles - more visible but balanced
                    for (let i = 0; i < 8; i++) {
                        const angle = (i / 8) * Math.PI * 2;
                        const dist = 12; // Slightly larger radius for better spread
                        const sparkle = this.particlePool.get(
                            colorStar.x + Math.cos(angle) * dist,
                            colorStar.y + Math.sin(angle) * dist,
                            'starSparkle'
                        );
                        if (sparkle) {
                            sparkle.color = '#FFFF00'; // Bright golden-yellow
                            sparkle.radius = 2.5; // Larger sparkles for better visibility
                            sparkle.life = 0.8; // Longer duration so they're visible longer
                            sparkle.vel = {
                                x: Math.cos(angle) * 1.8, // Slightly slower so they're visible longer
                                y: Math.sin(angle) * 1.8
                            };
                        }
                    }
                    
                    this.colorStarPool.release(colorStar);
                }
            }
        }
    }
    
    update() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            const input = this.inputHandler.getInput();

            // Always allow normal player movement
            const tractorEngaged = !input.up && !input.down && !input.left && !input.right && !input.fire;
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.colorStarPool, tractorEngaged);
            this.bulletPool.updateActive(this.particlePool, this.asteroidPool);
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidPool.updateActive();
            // Update color stars with player position and tractor beam state
            this.colorStarPool.activeObjects.forEach(s => s.update(this.player.vel, this.player, tractorEngaged));
            // Update background stars with just player velocity for parallax
            this.backgroundStarPool.activeObjects.forEach(s => s.update(this.player.vel));
            
            this.handleCollisions();
            
            if (this.game.state === GAME_STATES.PLAYING && this.asteroidPool.activeObjects.length === 0) {
                this.game.state = GAME_STATES.WAVE_TRANSITION;
                setTimeout(() => this.startNextWave(), 2000);
            }
            
            this.uiManager.updateScore(this.game.money);
        } else if (this.game.state === GAME_STATES.GAME_OVER || this.game.state === GAME_STATES.PAUSED) {
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            // Continue background star animation even when paused
            this.backgroundStarPool.activeObjects.forEach(s => s.update(this.player.vel));
        }
    }
    
    draw() {
        // Clear canvas completely (motion blur disabled)
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
            // Starfield rendering with multiple optimization approaches
            switch (this.starfieldRenderMode) {
                case 'sprite':
                    // Sprite caching - no batching, just render directly
                    this.backgroundStarPool.activeObjects.forEach(star => {
                        if (star.active) {
                            star.draw(this.ctx);
                        }
                    });
                    this.colorStarPool.activeObjects.forEach(star => {
                        if (star.active) {
                            star.draw(this.ctx);
                        }
                    });
                    break;
                    
                case 'lightweight':
                    // Lightweight optimization - reduces context switches without heavy caching
                    lightweightStarfieldOptimizer.groupStarsForRendering(
                        this.backgroundStarPool.activeObjects, 
                        this.colorStarPool.activeObjects
                    );
                    lightweightStarfieldOptimizer.renderGroupedStars(this.ctx);
                    
                    // Render complex color stars that weren't optimized
                    this.colorStarPool.activeObjects.forEach(star => {
                        if (star.active && (star.isBurst || star.shape === 'sparkle' || star.shape === 'burst')) {
                            star.draw(this.ctx); // Complex stars use their full draw method
                        }
                    });
                    break;
                    
                case 'heavy':
                    // Heavy optimization - sprite caching and batching (can cause throttling)
                    this.renderOptimizedStarfield();
                    break;
                    
                case 'fallback':
                default:
                    // Original direct rendering approach
                    this.backgroundStarPool.activeObjects.forEach(star => {
                        if (star.active) {
                            star.draw(this.ctx);
                            star.drawDirect(this.ctx);
                        }
                    });
                    this.colorStarPool.activeObjects.forEach(star => {
                        if (star.active) {
                            star.draw(this.ctx);
                            if (!star.isBurst && star.shape !== 'sparkle' && star.shape !== 'burst') {
                                star.drawDirectSimple(this.ctx);
                            }
                        }
                    });
                    break;
            }
            
            // Regular rendering for other game objects
            this.lineDebrisPool.drawActive(this.ctx);
            this.particlePool.drawActive(this.ctx);
            this.asteroidPool.drawActive(this.ctx);
            this.bulletPool.drawActive(this.ctx);
            this.player.draw(this.ctx);
            
            // Draw jitter circle to show bullet spread area
            this.drawJitterCircle();
        }
    }
    
    drawHUD() {
        if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
            // Draw health bar and UI elements
            this.updateShieldsDisplay();
        }
    }
    
    // Optimized starfield rendering with batching and sprite caching
    renderOptimizedStarfield() {
        // Background stars - all get batched (simple circles)
        for (const star of this.backgroundStarPool.activeObjects) {
            if (star.active) {
                star.draw(this.ctx); // Prepares rendering properties
                starfieldRenderer.addStarToBatch(star, 'background');
            }
        }
        
        // Color stars - simple shapes get batched, complex ones render directly
        for (const star of this.colorStarPool.activeObjects) {
            if (star.active) {
                star.draw(this.ctx); // Handles complex stars directly + prepares properties
                
                // Only add simple shapes to batch (complex ones already rendered by star.draw())
                if (!star.isBurst && star.shape !== 'sparkle' && star.shape !== 'burst') {
                    starfieldRenderer.addStarToBatch(star, 'color');
                }
            }
        }
        
        // Render all batched stars in one efficient pass
        starfieldRenderer.renderBatchedStars(this.ctx);
    }

    drawJitterCircle() {
        const input = this.inputHandler.getInput();
        const intensity = this.player.shootingIntensity || 0;
        
        // Initialize fade tracking if needed
        if (!this.jitterCircleFade) {
            this.jitterCircleFade = {
                visible: false,
                alpha: 0,
                targetAlpha: 0
            };
        }
        
        // Update target alpha based on shooting intensity
        if (intensity > 0) {
            this.jitterCircleFade.targetAlpha = Math.min(0.4, 0.1 + intensity * 0.3); // Fade to 0.1-0.4 alpha
            this.jitterCircleFade.visible = true;
        } else {
            this.jitterCircleFade.targetAlpha = 0;
        }
        
        // Smooth fade transition with gentle fade-out (60fps assumed, ~16ms per frame)
        if (this.jitterCircleFade.alpha < this.jitterCircleFade.targetAlpha) {
            // Fade-in: moderate speed
            const fadeInSpeed = 0.08;
            this.jitterCircleFade.alpha = Math.min(this.jitterCircleFade.targetAlpha, 
                this.jitterCircleFade.alpha + fadeInSpeed);
        } else if (this.jitterCircleFade.alpha > this.jitterCircleFade.targetAlpha) {
            // Fade-out: gentle, non-linear fade using easing
            const fadeOutSpeed = 0.04; // Slower base speed for gentler fade
            const alphaRatio = this.jitterCircleFade.alpha / 0.4; // Normalize to 0-1 range
            const easedSpeed = fadeOutSpeed * (0.3 + 0.7 * alphaRatio); // Slower as it gets more transparent
            
            this.jitterCircleFade.alpha = Math.max(this.jitterCircleFade.targetAlpha, 
                this.jitterCircleFade.alpha - easedSpeed);
        }
        
        // Hide when fully faded out
        if (this.jitterCircleFade.alpha <= 0.01) {
            this.jitterCircleFade.visible = false;
            this.jitterCircleFade.alpha = 0;
        }
        
        // Draw circle if visible
        if (this.jitterCircleFade.visible && this.jitterCircleFade.alpha > 0) {
            // Base radius starts at 20px, scales up to 80px based on intensity
            const baseRadius = 20;
            const maxRadius = 80;
            const currentRadius = baseRadius + (maxRadius - baseRadius) * intensity;
            
            this.ctx.save();
            this.ctx.globalAlpha = this.jitterCircleFade.alpha;
            this.ctx.fillStyle = '#666666'; // Gray color
            this.ctx.beginPath();
            this.ctx.arc(input.aimX, input.aimY, currentRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        this.update();
        
        this.ctx.save();
        if (this.game.screenShakeDuration > 0) {
            // Enhanced shake algorithm with multiple frequencies and smooth decay
            const time = Date.now() * 0.01;
            const shakeIntensity = this.game.screenShakeMagnitude * (this.game.screenShakeDuration / this.game.originalShakeMagnitude);
            
            // Combine multiple sine waves for more natural shake
            const dx = Math.sin(time * 15) * shakeIntensity * 0.3 + 
                      Math.sin(time * 7) * shakeIntensity * 0.2 + 
                      (Math.random() - 0.5) * shakeIntensity * 0.5;
            const dy = Math.cos(time * 13) * shakeIntensity * 0.3 + 
                      Math.cos(time * 5) * shakeIntensity * 0.2 + 
                      (Math.random() - 0.5) * shakeIntensity * 0.5;
            
            this.ctx.translate(dx, dy);
            this.game.screenShakeDuration--;
            
            // Smooth decay of shake magnitude
            if (this.game.screenShakeDuration > 0) {
                this.game.screenShakeMagnitude = Math.max(0, this.game.screenShakeMagnitude - this.game.shakeDecayRate);
            } else {
                this.game.screenShakeMagnitude = 0;
            }
        }
        
        this.draw();
        this.ctx.restore();
        
        // Draw HUD elements outside of screen shake transform
        this.drawHUD();
        
        if (this.game.state === GAME_STATES.GAME_OVER) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    togglePause() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.PAUSED;
            this.uiManager.togglePause();
            if (this.player && this.player.isThrusting) {
                this.audioManager.playThruster();
            }
        } else if (this.game.state === GAME_STATES.PAUSED) {
            this.game.state = GAME_STATES.PLAYING;
            this.uiManager.togglePause();
        }
    }
    
    triggerScreenShake(duration, magnitude, asteroidSize = 0) {
        // Enhanced screen shake based on asteroid size
        const baseMagnitude = magnitude;
        const sizeMultiplier = Math.max(1.5, asteroidSize / 20); // Larger asteroids = much more shake
        const enhancedMagnitude = baseMagnitude * sizeMultiplier;
        
        // Add more randomness and intensity for asteroid destructions
        const randomDuration = duration + Math.floor(Math.random() * 8);
        const randomMagnitude = enhancedMagnitude + Math.random() * 5;
        
        // Only apply new shake if it's stronger than current shake
        if (randomMagnitude > this.game.screenShakeMagnitude) {
            this.game.screenShakeDuration = randomDuration;
            this.game.screenShakeMagnitude = randomMagnitude;
            
            // Store the original values for smooth decay
            this.game.originalShakeMagnitude = randomMagnitude;
            this.game.shakeDecayRate = randomMagnitude / randomDuration;
        }
    }
    
    loadHighScore() {
        this.game.highScore = parseInt(localStorage.getItem('rainboidsHighScore')) || 0;
    }
    
    checkHighScore() {
        if (this.game.score > this.game.highScore) {
            this.game.highScore = this.game.score;
            localStorage.setItem('rainboidsHighScore', this.game.highScore);
        }
    }
    
    start() {
        this.loadHighScore();
        this.uiManager.checkOrientation();
        this.uiManager.setupTitleScreen();
        this.uiManager.showTitleScreen();
        this.uiManager.updateHighScore(this.game.highScore);
        this.inputHandler.setupTouchControls();
        this.gameLoop();
    }
    
    // Get performance statistics for starfield rendering
    getStarfieldStats() {
        const stats = {
            totalStars: this.backgroundStarPool.activeObjects.length + this.colorStarPool.activeObjects.length,
            backgroundStars: this.backgroundStarPool.activeObjects.length,
            colorStars: this.colorStarPool.activeObjects.length,
            cacheStats: starfieldRenderer.getCacheStats()
        };
        
        return stats;
    }
    
    // Debug method - call from console: gameEngine.debugStarfieldPerformance()
    debugStarfieldPerformance() {
        const stats = this.getStarfieldStats();
        
        if (this.starfieldRenderMode === 'depth') {
            const batchStats = depthBatchRenderer.getStats();
            return {
                mode: this.starfieldRenderMode,
                totalStars: stats.totalStars,
                depthBuckets: batchStats.depthBuckets,
                batchedStars: batchStats.totalStars,
                frameCount: batchStats.frameCount
            };
        } else if (this.starfieldRenderMode === 'lightweight') {
            const lightStats = lightweightStarfieldOptimizer.getStats();
            return {
                mode: this.starfieldRenderMode,
                totalStars: stats.totalStars,
                optimizedStars: lightStats.totalOptimized,
                frameCount: lightStats.frameCount
            };
        } else if (this.starfieldRenderMode === 'heavy') {
            return {
                mode: this.starfieldRenderMode,
                totalStars: stats.totalStars,
                cacheStats: stats.cacheStats
            };
        } else {
            return {
                mode: this.starfieldRenderMode,
                totalStars: stats.totalStars,
                drawCalls: stats.totalStars
            };
        }
    }
    
    // Debug method to cycle through rendering modes
    cycleStarfieldMode() {
        const modes = ['depth', 'lightweight', 'fallback', 'heavy'];
        const currentIndex = modes.indexOf(this.starfieldRenderMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.starfieldRenderMode = modes[nextIndex];
        
        return {
            newMode: this.starfieldRenderMode,
            description: {
                'depth': 'Depth-based batching (groups by depth/opacity)',
                'lightweight': 'Lightweight optimization (reduces context switches)',
                'fallback': 'Original direct rendering (baseline)',
                'heavy': 'Heavy optimization (sprite caching + batching - may throttle)'
            }[this.starfieldRenderMode]
        };
    }
    
    // Debug method to clear sprite cache (useful for testing)
    clearStarfieldCache() {
        if (this.starfieldRenderMode === 'heavy') {
            starfieldRenderer.clearCache();
            return { cleared: true, mode: 'heavy' };
        } else {
            return { cleared: false, reason: 'No cache to clear in current mode' };
        }
    }

    // Debug method to show live depth batching performance
    showDepthBatchStats() {
        if (this.starfieldRenderMode !== 'depth') {
            return { 
                error: 'Depth batching is not active in current mode. Switch to depth mode first.',
                currentMode: this.starfieldRenderMode
            };
        }
        
        const batchStats = depthBatchRenderer.getStats();
        return {
            activeBuckets: batchStats.depthBuckets,
            batchedStars: batchStats.totalStars,
            framesProcessed: batchStats.frameCount,
            efficiency: batchStats.depthBuckets <= 5 ? 'excellent' : 
                       batchStats.depthBuckets <= 10 ? 'good' : 'could be improved'
        };
    }

    checkCursorTarget(mouseX, mouseY) {
        // Check if cursor is over any asteroid (enemy)
        for (const ast of this.asteroidPool.activeObjects) {
            if (ast.active) {
                const dx = mouseX - ast.x;
                const dy = mouseY - ast.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= ast.radius) {
                    return 'enemy';
                }
            }
        }
        
        // Check if cursor is over player ship
        if (this.player && this.player.active) {
            const dx = mouseX - this.player.x;
            const dy = mouseY - this.player.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= this.player.radius) {
                return 'player';
            }
        }
        
        // Check if cursor is over any star
        for (const colorStar of this.colorStarPool.activeObjects) {
            if (colorStar.active) {
                const dx = mouseX - colorStar.x;
                const dy = mouseY - colorStar.y;
                const distance = Math.hypot(dx, dy);
                
                // Use enhanced collision radius for burst stars to match collection behavior
                let targetRadius = colorStar.radius;
                if (colorStar.isBurst) {
                    targetRadius += GAME_CONFIG.BURST_STAR_COLLECTION_BONUS; // Match the enhanced collection radius
                }
                
                if (distance <= targetRadius) {
                    return colorStar.isBurst ? 'star' : 'colorStar';
                }
            }
        }
        
        return 'none';
    }

    
    takeDamage(damageAmount = this.baseDamage) {
        if (this.player.invincible) return;

        // Apply shield damage reduction
        const reducedDamage = damageAmount * (1 - this.player.shield / 100);
        this.player.health -= reducedDamage;

        if (this.player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                this.player.health = this.player.maxHealth;
                this.audioManager.playCoin(); // Tank used sound
                } else {
                this.gameOver();
            }
        }

        this.player.makeInvincible(3000); // 3 seconds of invincibility
        this.audioManager.playHit();
        this.particlePool.get(this.player.x, this.player.y, 'damageNumber', Math.round(reducedDamage));
        this.triggerScreenShake(15, 8);
    }

    gameOver() {
        this.game.state = GAME_STATES.GAME_OVER;
        this.player.active = false;
        this.checkHighScore();
        this.audioManager.playPlayerExplosion();
        
        // Create death explosion
        for (let i = 0; i < 50; i++) {
            this.particlePool.get(this.player.x, this.player.y, 'explosion');
        }
        
        // Show game over message
        this.uiManager.showMessage('GAME OVER', 'Press Enter or click to restart');
        this.triggerScreenShake(30, 20);
    }
    
    updateShieldsDisplay() {
        const ctx = this.ctx;
        const barX = 20;
        const barY = 20;
        const barHeight = 30;
        const barWidth = 220;
        const bevelSize = 12;
        const segments = 10; // Number of segments for the bar
        
        ctx.save();
        
        // Create futuristic angled health bar geometry
        const createHealthBarPath = (width) => {
            ctx.beginPath();
            // Start from top-left with angled corner
            ctx.moveTo(barX + bevelSize, barY);
            // Top edge with slight angle
            ctx.lineTo(barX + width - bevelSize * 0.5, barY);
            // Angled top-right corner
            ctx.lineTo(barX + width, barY + bevelSize);
            // Right edge
            ctx.lineTo(barX + width, barY + barHeight - bevelSize);
            // Angled bottom-right corner
            ctx.lineTo(barX + width - bevelSize, barY + barHeight);
            // Bottom edge with angle
            ctx.lineTo(barX + bevelSize * 0.5, barY + barHeight);
            // Angled bottom-left corner
            ctx.lineTo(barX, barY + barHeight - bevelSize);
            // Left edge
            ctx.lineTo(barX, barY + bevelSize);
            // Close back to start
            ctx.closePath();
        };

        // Draw outer glow effect
        ctx.shadowColor = 'rgba(0, 180, 255, 0.5)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw background container with semi-transparency
        ctx.globalAlpha = 0.3;
        createHealthBarPath(barWidth);
        ctx.fillStyle = 'rgba(10, 40, 80, 0.8)';
        ctx.fill();
        
        // Draw subtle border
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Calculate health percentage and filled width
        const healthPercentage = this.player.health / this.player.maxHealth;
        const filledWidth = barWidth * healthPercentage;
        
        // Add warning glow effect for low health
        if (healthPercentage <= 0.3) {
            ctx.save();
            // Pulsing red glow effect
            const pulseIntensity = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
            ctx.shadowColor = `rgba(255, 50, 50, ${pulseIntensity * 0.8})`;
            ctx.shadowBlur = 20 + pulseIntensity * 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw warning glow around the entire health bar area
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = `rgba(255, 100, 100, ${pulseIntensity})`;
            ctx.lineWidth = 3;
            createHealthBarPath(barWidth);
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw filled health bar with gradient
        if (filledWidth > 0) {
            ctx.globalAlpha = 0.7;
            
            // Create enhanced gradient for health bar
            const gradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
            const radialGradient = ctx.createRadialGradient(
                barX + filledWidth / 2, barY + barHeight / 2, 0,
                barX + filledWidth / 2, barY + barHeight / 2, barHeight * 2
            );
            
            // Color based on health level with enhanced gradients
            if (healthPercentage > 0.6) {
                // Healthy - bright sky blue with subtle shimmer
                gradient.addColorStop(0, 'rgba(120, 240, 255, 0.95)');
                gradient.addColorStop(0.3, 'rgba(80, 200, 255, 0.9)');
                gradient.addColorStop(0.7, 'rgba(60, 180, 255, 0.85)');
                gradient.addColorStop(1, 'rgba(40, 140, 220, 0.8)');
            } else if (healthPercentage > 0.3) {
                // Warning - yellow-blue transition
                gradient.addColorStop(0, 'rgba(180, 240, 255, 0.95)');
                gradient.addColorStop(0.3, 'rgba(150, 200, 220, 0.9)');
                gradient.addColorStop(0.7, 'rgba(120, 180, 200, 0.85)');
                gradient.addColorStop(1, 'rgba(100, 140, 160, 0.8)');
                } else {
                // Critical - red-tinted with urgency
                gradient.addColorStop(0, 'rgba(255, 180, 180, 0.95)');
                gradient.addColorStop(0.3, 'rgba(240, 140, 160, 0.9)');
                gradient.addColorStop(0.7, 'rgba(220, 120, 150, 0.85)');
                gradient.addColorStop(1, 'rgba(180, 100, 120, 0.8)');
            }
            
            createHealthBarPath(filledWidth);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Add subtle inner glow
            ctx.globalAlpha = 0.4;
            createHealthBarPath(filledWidth);
            ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Remove segmentation lines for cleaner look

        // Draw HP text below the health bar with matching colors
        ctx.globalAlpha = 0.9;
        ctx.font = "12px 'Press Start 2P', monospace";
        
        // Match text color to health bar color
        const textHealthPercentage = this.player.health / this.player.maxHealth;
        let textColor, strokeColor;
        if (textHealthPercentage > 0.6) {
            textColor = 'rgba(100, 220, 255, 0.9)';
            strokeColor = 'rgba(60, 180, 255, 0.6)';
        } else if (textHealthPercentage > 0.3) {
            textColor = 'rgba(150, 220, 255, 0.9)';
            strokeColor = 'rgba(120, 180, 200, 0.6)';
            } else {
            textColor = 'rgba(255, 150, 150, 0.9)';
            strokeColor = 'rgba(220, 120, 150, 0.6)';
        }
        
        ctx.fillStyle = textColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        const hpText = `${Math.round(this.player.health)}/${this.player.maxHealth}`;
        const textX = barX + barWidth / 2;
        const textY = barY + barHeight + 8; // Position below the bar
        
        // Draw heart icon to the left of health text
        const hpTextWidth = ctx.measureText(hpText).width;
        
        const heartIconSize = 18;
        const heartIconX = textX - hpTextWidth/2 - heartIconSize; // Position to the left of health text
        const heartIconY = textY + 5;
        
        drawCachedHeartIcon(ctx, heartIconX, heartIconY, heartIconSize, '#800000', '#DC143C');
        
        // Draw text outline
        ctx.strokeText(hpText, textX, textY);
        // Draw text fill
        ctx.fillText(hpText, textX, textY);

        // Draw Shield Icon using cached sprite for better performance
        const shieldIconX = barX + barWidth + 20;
        const shieldIconY = barY;
        const iconSize = 30;
        
        const centerX = shieldIconX + iconSize / 2;
        const centerY = shieldIconY + iconSize / 2;
        
        // Use cached shield icon sprite instead of complex path drawing
        ctx.globalAlpha = 0.9;
        drawCachedShieldIcon(ctx, centerX, centerY, iconSize);
        
        ctx.globalAlpha = 0.9;
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillStyle = '#4A90E2'; // Consistent blue color for shield text
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; // Dark outline
        ctx.lineWidth = 0.5;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const shieldText = `${this.player.shield}`; // Remove % sign
        const shieldTextX = shieldIconX + iconSize + 8;
        const shieldTextY = shieldIconY + iconSize / 2;
        
        // Draw shield text with outline
        ctx.strokeText(shieldText, shieldTextX, shieldTextY);
        ctx.fillText(shieldText, shieldTextX, shieldTextY);

        // Draw money icon to the right of the shield text
        const shieldTextWidth = ctx.measureText(shieldText).width;
        const moneyIconX = shieldTextX + shieldTextWidth + 25; // Position to the right of shield text with extra margin (moved right by 10px)
        const moneyIconY = shieldTextY; // Align vertically with shield text
        const moneyIconSize = 16;
        
        // Draw money icon using cached sprite for better performance
        drawCachedMoneyIcon(ctx, moneyIconX, moneyIconY, moneyIconSize, '#FFFF00', '#B8860B');

        // Draw money text to the right of the money icon
        const moneyTextX = moneyIconX + moneyIconSize + 4; // Position to the right of icon with small margin
        const moneyTextY = moneyIconY;
        
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Gold color for money text
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 0.5;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const moneyText = `${Math.floor(this.game.money)}`;
        
        // Draw money text with outline
        ctx.strokeText(moneyText, moneyTextX, moneyTextY);
        ctx.fillText(moneyText, moneyTextX, moneyTextY);

        // Draw shield tanks
        const tankSize = 25;
        const tankMargin = 8;
        const tanksY = barY + barHeight + 10;
        
        // Update shield tanks display
        let shieldTanksContainer = document.getElementById('shield-tanks');
        if (!shieldTanksContainer) {
            // Create shield tanks container if it doesn't exist
            const container = document.createElement('div');
            container.id = 'shield-tanks';
            container.style.position = 'absolute';
            container.style.top = '40px';
            container.style.left = '70px'; // Align with shield bar (24px base + 45px margin)
            container.style.display = 'flex';
            container.style.gap = '3px';
            container.style.zIndex = '90';
            document.body.appendChild(container);
        } else {
            // Clear existing tanks
            shieldTanksContainer.innerHTML = '';
        }
        
        // Create only the tanks the player has (max 10 visible)
        shieldTanksContainer = document.getElementById('shield-tanks');
        const visibleTanks = Math.min(this.displayTanks, 10);
        for (let i = 0; i < visibleTanks; i++) {
            const tank = document.createElement('div');
            tank.className = 'shield-tank';
            tank.dataset.tankIndex = i;
            tank.style.width = '14px';
            tank.style.height = '14px';
            tank.style.borderRadius = '3px';
            tank.style.background = 'rgba(0,255,0,0.8)';
            tank.style.position = 'relative';
            shieldTanksContainer.appendChild(tank);
        }
    }    
    explodeTank(tankIndex) {
        const tanks = document.querySelectorAll('.shield-tank');
        if (tanks[tankIndex]) {
            const tank = tanks[tankIndex];
            const rect = tank.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Create explosion particles at tank location
            for (let i = 0; i < 12; i++) {
                const particle = document.createElement('div');
                particle.style.position = 'fixed';
                particle.style.left = centerX + 'px';
                particle.style.top = centerY + 'px';
                particle.style.width = '4px';
                particle.style.height = '4px';
                particle.style.background = '#00ff00';
                particle.style.borderRadius = '50%';
                particle.style.zIndex = '1000';
                particle.style.pointerEvents = 'none';
                document.body.appendChild(particle);
                
                // Animate particle
                const angle = (i / 12) * Math.PI * 2;
                const speed = 50 + Math.random() * 50;
                const duration = 500 + Math.random() * 500;
                
                particle.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${Math.cos(angle) * speed}px, ${Math.sin(angle) * speed}px) scale(0)`, opacity: 0 }
                ], {
                    duration: duration,
                    easing: 'ease-out'
                }).onfinish = () => particle.remove();
            }
            
            // Flash and fade the tank
            tank.animate([
                { opacity: 1, transform: 'scale(1)' },
                { opacity: 1, transform: 'scale(1.5)' },
                { opacity: 0, transform: 'scale(0)' }
            ], {
                duration: 300,
                easing: 'ease-out'
            });
        }
    }

    handlePlayerAsteroidCollision(player, asteroid) {
        // Apply damage only if not invincible
        if (!this.player.invincible) {
            // Calculate damage based on asteroid size and speed (10-20 damage range)
            const baseSize = 40; // Minimum asteroid radius
            const maxSize = 60; // Maximum asteroid radius
            const sizeRatio = (asteroid.radius - baseSize) / (maxSize - baseSize); // 0-1 range
            
            // Calculate speed factor
            const speed = Math.hypot(asteroid.vel.x, asteroid.vel.y);
            const maxSpeed = 4; // Typical max asteroid speed
            const speedRatio = Math.min(speed / maxSpeed, 1); // Cap at 1
            
            // Damage calculation: 10-20 range based on size and speed
            const sizeDamage = 10 + (sizeRatio * 6); // 10-16 damage from size
            const speedDamage = speedRatio * 4; // 0-4 additional damage from speed
            const totalDamage = sizeDamage + speedDamage; // 10-20 damage range
            
            // Apply shield damage reduction and round to integer
            const reducedDamage = totalDamage * (1 - this.player.shield / 100);
            const finalDamage = Math.round(reducedDamage);
            
            // Apply the calculated damage
            this.player.health -= finalDamage;

            // Handle death/shield tank usage
            if (this.player.health <= 0) {
                if (this.shieldTanks > 0) {
                    this.shieldTanks--;
                    this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                    this.player.health = this.player.maxHealth;
                    this.audioManager.playCoin(); // Tank used sound
                } else {
                    this.gameOver();
                }
            }

            // Visual and audio feedback
            this.player.makeInvincible(3000); // 3 seconds of invincibility
            this.audioManager.playHit();
            this.particlePool.get(this.player.x, this.player.y, 'damageNumber', finalDamage);
            this.particlePool.get(this.player.x, this.player.y, 'shieldHit', this.player.radius);
            this.audioManager.playShield();
        }

        // Asteroid bounces off player
        const astSpeed = Math.hypot(asteroid.vel.x, asteroid.vel.y);
        const knockbackAngle = Math.atan2(this.player.y - asteroid.y, this.player.x - asteroid.x);

        // Calculate knockback magnitude based on asteroid's trajectory and player's mass
        const totalMass = this.player.mass + asteroid.mass;
        const dvn = (this.player.vel.x - asteroid.vel.x) * Math.cos(knockbackAngle) + (this.player.vel.y - asteroid.vel.y) * Math.sin(knockbackAngle);
        const enhancedImpulse = 2 * dvn / totalMass;

        // Apply MUCH MORE DRASTIC knockback multiplier
        const knockbackMultiplier = 8.0; // Increased from ~1.0 to 8.0
        const enhancedKnockback = enhancedImpulse * knockbackMultiplier;

        // Apply jittered impulse to player velocity
        const jitter = random(-Math.PI / 4, Math.PI / 4);
        this.player.vel.x += Math.cos(knockbackAngle + jitter) * enhancedKnockback;
        this.player.vel.y += Math.sin(knockbackAngle + jitter) * enhancedKnockback;

        // Also apply some impulse to asteroid (but less dramatic, along original normal)
        const nx = Math.cos(knockbackAngle);
        const ny = Math.sin(knockbackAngle);
        asteroid.vel.x -= enhancedKnockback * 0.3 * this.player.mass * nx;
        asteroid.vel.y -= enhancedKnockback * 0.3 * this.player.mass * ny;

        // Separate overlapping objects with stronger force
        const distance = Math.hypot(this.player.x - asteroid.x, this.player.y - asteroid.y);
        const overlap = this.player.radius + asteroid.radius - distance;
        
        if (overlap > 0) {
            // Calculate normalized direction from asteroid to player
            const dx = (this.player.x - asteroid.x) / distance;
            const dy = (this.player.y - asteroid.y) / distance;
            
            // Apply full overlap distance plus a buffer to ensure separation
            const separationBuffer = 5; // Extra pixels to ensure they don't stick
            const totalSeparation = overlap + separationBuffer;
            
            // Move player away from asteroid by the full separation amount
            this.player.x += dx * totalSeparation;
            this.player.y += dy * totalSeparation;
            
            // Also apply velocity to push player away
            const pushForce = 2.0; // Additional velocity push
            this.player.vel.x += dx * pushForce;
            this.player.vel.y += dy * pushForce;
        }

        // Create enhanced collision effects
        // White pulse at impact point
        const impactX = this.player.x + nx * this.player.radius;
        const impactY = this.player.y + ny * this.player.radius;
        this.particlePool.get(impactX, impactY, 'explosionPulse', 40);
        
        // Enhanced blue particles explosion
        for (let i = 0; i < 30; i++) {
            const particle = this.particlePool.get(impactX, impactY, 'explosion');
            if (particle) {
                // Override color to bright blue
                particle.color = `hsl(210, 100%, ${60 + Math.random() * 40}%)`;
                // Make particles faster and larger for more dramatic effect
                particle.vel.x *= 1.5;
                particle.vel.y *= 1.5;
                particle.radius *= 1.3;
            }
        }
        
        this.audioManager.playHit();
        
        // Enhanced screen shake based on impact force
        const impactForce = Math.abs(enhancedKnockback) * totalMass;
        this.triggerScreenShake(25, 15, impactForce * 0.8);
    }
} 