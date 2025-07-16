// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './constants.js';
import { random, collision, triggerHapticFeedback, generatePoissonStarPosition } from './utils.js';
import { PoolManager } from './pool-manager.js';
import { Player } from './entities/player.js';
import { Bullet } from './entities/bullet.js';
import { Asteroid } from './entities/asteroid.js';
import { Particle } from './entities/particle.js';
import { Star } from './entities/star.js';
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
        this.initializePools();
        this.setupEventListeners();
        this.playerCanFire = true;
        this.previousFire = false;
        this.baseDamage = 20; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();
        this.shieldIcon.src = 'assets/shield-icon.svg';
    }
    
    initializePools() {
        this.player = new Player();
        
        this.bulletPool = new PoolManager(Bullet, 20);
        this.particlePool = new PoolManager(Particle, 200);
        this.lineDebrisPool = new PoolManager(LineDebris, 100);
        this.asteroidPool = new PoolManager(Asteroid, 20);
        this.starPool = new PoolManager(Star, GAME_CONFIG.STAR_COUNT + 100);
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
        
        this.uiManager.elements.mobilePauseButton.addEventListener('click', () => {
            this.togglePause();
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
        this.game.score = 0;
        this.game.money = 0;
        this.game.currentWave = 0;
        this.game.state = GAME_STATES.PLAYING;
        // Reset player
        this.player = new Player();
        // Reset energy
        this.playerEnergy = this.maxEnergy;
        this.energyTanks = 0; // Reset to zero tanks
        this.displayEnergy = this.maxEnergy;
        this.displayTanks = 0;
        this.animatingDamage = false;
        this.pendingDamage = 0; // Reset pending damage
        // Clear all pools
        this.bulletPool.activeObjects = [];
        this.particlePool.activeObjects = [];
        this.lineDebrisPool.activeObjects = [];
        this.asteroidPool.activeObjects = [];
        this.starPool.activeObjects = [];
        // Spawn initial stars
        for (let i = 0; i < GAME_CONFIG.STAR_COUNT; i++) {
            this.spawnStar();
        }
        this.startNextWave();
        this.uiManager.hideMessage();
    }
    
    startNextWave() {
        // Clean up inactive objects in all pools before starting the next wave
        this.bulletPool.cleanupInactive();
        this.particlePool.cleanupInactive();
        this.lineDebrisPool.cleanupInactive();
        this.asteroidPool.cleanupInactive();
        this.starPool.cleanupInactive();
        this.game.currentWave++;
        this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 1500);
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // Reset player state at wave start
        this.playerState = PLAYER_STATES.NORMAL;
        const numAsteroids = GAME_CONFIG.INITIAL_AST_COUNT + (this.game.currentWave - 1) * 2;
        for (let i = 0; i < numAsteroids; i++) {
            this.spawnAsteroidOffscreen();
        }
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
            }
        }, 1500);
        // No rapid recharge between waves - energy persists
        // Only restore energy at game start
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
    
    spawnStar() {
        // Use landscape dimensions for star spawning to ensure consistency
        const spawnWidth = Math.max(this.width, this.height);
        const spawnHeight = this.height;

        // 1. Determine target depth (z) for this star
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

        // 2. Use Poisson disk sampling with variable density to find a position
        const existingStars = this.starPool ? this.starPool.activeObjects : [];
        const positionData = generatePoissonStarPosition(spawnWidth, spawnHeight, existingStars, z);
        
        // 3. If a valid position is found, create the star
        if (positionData) {
            const { x, y, density } = positionData;
            const star = this.starPool.get(x, y, false, z, density);
            
            // Add the new star to the existing stars array for subsequent checks
            if (star) {
                existingStars.push(star);
            }
        }
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
    
    createStarBurst(x, y) {
        for (let i = 0; i < 5; i++) {
            this.starPool.get(x, y, true);
        }
    }
    
    handleCollisions() {
        // Player-asteroid collisions
        this.asteroidPool.activeObjects.forEach(ast => {
            if (this.player.active && !this.player.invincible && collision(this.player, ast)) {
                this.handlePlayerAsteroidCollision(this.player, ast);
            }
        });

        // Bullet-asteroid collisions
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active) continue;
            for (let j = this.asteroidPool.activeObjects.length - 1; j >= 0; j--) {
                const ast = this.asteroidPool.activeObjects[j];
                if (!ast.active) continue;
                if (collision(bullet, ast)) {
                    this.game.score += 50; // 50 points for hit
                    this.game.money += 50; // 50 money for hit
                    triggerHapticFeedback(20);
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
                            this.createStarBurst(ast.x, ast.y);
                            this.asteroidPool.release(ast);
                            // No screen shake for asteroid destruction
                        } else {
                            // Make the explosion really dramatic
                            this.audioManager.playExplosion();
                            this.triggerScreenShake(20, ast.baseRadius * 0.25, ast.baseRadius);

                            // Add a bunch of particle effects
                            this.particlePool.get(ast.x, ast.y, 'explosionPulse', ast.baseRadius * 1.5);
                            this.particlePool.get(ast.x, ast.y, 'fieryExplosionRing', ast.baseRadius * 1.2);
                            for (let p = 0; p < 40; p++) {
                                this.particlePool.get(ast.x, ast.y, 'explosionRedOrange');
                            }
                            this.createDebris(ast);
                            this.createStarBurst(ast.x, ast.y);
                            
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
                    this.bulletPool.release(bullet);
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
        
        // Player vs Stars
        if (this.player && this.player.active) {
            for (let i = this.starPool.activeObjects.length - 1; i >= 0; i--) {
                const star = this.starPool.activeObjects[i];
                if (collision(this.player, star)) {
                    this.game.score += star.isBurst ? GAME_CONFIG.BURST_STAR_SCORE : GAME_CONFIG.STAR_SCORE;
                    this.game.money += star.isBurst ? GAME_CONFIG.BURST_STAR_SCORE : GAME_CONFIG.STAR_SCORE;
                    this.audioManager.playCoin();
                    
                    // Create enhanced golden blip effect
                    // Central bright flash
                    const blip = this.particlePool.get(star.x, star.y, 'starBlip');
                    if (blip) {
                        blip.color = '#FFD700'; // Gold color
                        blip.radius = 3; // Slightly larger
                        blip.life = 0.3; // Slightly longer
                        blip.fadeRate = 0.1;
                        blip.growthRate = 0.2; // Slight expansion
                    }
                    
                    // Ring of smaller sparkles
                    for (let i = 0; i < 6; i++) {
                        const angle = (i / 6) * Math.PI * 2;
                        const dist = 8;
                        const sparkle = this.particlePool.get(
                            star.x + Math.cos(angle) * dist,
                            star.y + Math.sin(angle) * dist,
                            'starSparkle'
                        );
                        if (sparkle) {
                            sparkle.color = '#FFD700';
                            sparkle.radius = 1;
                            sparkle.life = 0.4;
                            sparkle.vel = {
                                x: Math.cos(angle) * 2,
                                y: Math.sin(angle) * 2
                            };
                        }
                    }
                    
                    // Add energy up to max capacity (999 total)
                    const currentTotalEnergy = this.energyTanks * this.maxEnergy + this.playerEnergy;
                    const maxTotalEnergy = 999;
                    
                    if (currentTotalEnergy < maxTotalEnergy) {
                        const addAmount = star.isBurst ? GAME_CONFIG.BURST_STAR_ENERGY : GAME_CONFIG.STAR_ENERGY;
                        let newTotalEnergy = Math.min(currentTotalEnergy + addAmount, maxTotalEnergy);
                        
                        // Calculate new tanks and energy
                        this.energyTanks = Math.floor(newTotalEnergy / this.maxEnergy);
                        this.playerEnergy = newTotalEnergy % this.maxEnergy;
                        
                        // Special case: if we have exactly 999 energy
                        if (newTotalEnergy === 999) {
                            this.energyTanks = 10;
                            this.playerEnergy = 99;
                        }
                    }
                    if (!star.isBurst) this.spawnStar();
                    this.starPool.release(star);
                }
            }
        }
    }
    
    update() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            const input = this.inputHandler.getInput();

            // Always allow normal player movement
            const tractorEngaged = !input.up && !input.down && !input.left && !input.right && !input.fire;
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.starPool, tractorEngaged);
            this.bulletPool.updateActive(this.particlePool, this.asteroidPool);
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidPool.updateActive();
            // Update stars with player position and tractor beam state
            this.starPool.activeObjects.forEach(s => s.update(this.player.vel, this.player, tractorEngaged));
            
            this.handleCollisions();
            
            if (this.game.state === GAME_STATES.PLAYING && this.asteroidPool.activeObjects.length === 0) {
                this.game.state = GAME_STATES.WAVE_TRANSITION;
                setTimeout(() => this.startNextWave(), 2000);
            }
            
            this.uiManager.updateScore(this.game.money);
        } else if (this.game.state === GAME_STATES.GAME_OVER || this.game.state === GAME_STATES.PAUSED) {
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
        }
    }
    
    draw() {
        // Clear with semi-transparent black for trail effect
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
            this.starPool.drawActive(this.ctx);
            this.lineDebrisPool.drawActive(this.ctx);
            this.particlePool.drawActive(this.ctx);
            this.asteroidPool.drawActive(this.ctx);
            this.bulletPool.drawActive(this.ctx);
            this.player.draw(this.ctx);
            
            // Draw health bar and UI elements
            this.updateEnergyDisplay();
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
        const sizeMultiplier = Math.max(1, asteroidSize / 30); // Larger asteroids = more shake
        const enhancedMagnitude = baseMagnitude * sizeMultiplier;
        
        // Add some randomness to make it feel more natural
        const randomDuration = duration + Math.floor(Math.random() * 5);
        const randomMagnitude = enhancedMagnitude + Math.random() * 3;
        
        this.game.screenShakeDuration = randomDuration;
        this.game.screenShakeMagnitude = randomMagnitude;
        
        // Store the original values for smooth decay
        this.game.originalShakeMagnitude = randomMagnitude;
        this.game.shakeDecayRate = randomMagnitude / randomDuration;
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
        for (const star of this.starPool.activeObjects) {
            if (star.active) {
                const dx = mouseX - star.x;
                const dy = mouseY - star.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= star.radius) {
                    return 'star';
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
            if (this.energyTanks > 0) {
                this.energyTanks--;
                this.explodeTank(this.energyTanks); // Visual effect for tank explosion
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
    
    updateEnergyDisplay() {
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
        
        // Draw text outline
        ctx.strokeText(hpText, textX, textY);
        // Draw text fill
        ctx.fillText(hpText, textX, textY);

        // Draw Shield Icon with layered effect
        const shieldIconX = barX + barWidth + 20;
        const shieldIconY = barY;
        const iconSize = 30;
        
        // Function to draw shield shape using exact SVG path coordinates
        const drawShieldPath = (centerX, centerY, size) => {
            const scale = size / 16; // SVG viewBox is 16x16
            ctx.beginPath();
            
            // Exact SVG path: M4.35009 13.3929L8 16L11.6499 13.3929C13.7523 11.8912 15 9.46667 15 6.88306V3L8 0L1 3V6.88306C1 9.46667 2.24773 11.8912 4.35009 13.3929Z
            // Transform coordinates to center on (centerX, centerY)
            const offsetX = centerX - 8 * scale;
            const offsetY = centerY - 8 * scale;
            
            // Start at top center (8,0)
            ctx.moveTo(offsetX + 8 * scale, offsetY + 0 * scale);
            // Line to left top corner (1,3)
            ctx.lineTo(offsetX + 1 * scale, offsetY + 3 * scale);
            // Line down left side to (1, 6.88306)
            ctx.lineTo(offsetX + 1 * scale, offsetY + 6.88306 * scale);
            // Curve to bottom left (4.35009, 13.3929)
            ctx.bezierCurveTo(
                offsetX + 1 * scale, offsetY + 9.46667 * scale,
                offsetX + 2.24773 * scale, offsetY + 11.8912 * scale,
                offsetX + 4.35009 * scale, offsetY + 13.3929 * scale
            );
            // Line to bottom center (8,16)
            ctx.lineTo(offsetX + 8 * scale, offsetY + 16 * scale);
            // Line to bottom right (11.6499, 13.3929)
            ctx.lineTo(offsetX + 11.6499 * scale, offsetY + 13.3929 * scale);
            // Curve to right side
            ctx.bezierCurveTo(
                offsetX + 13.7523 * scale, offsetY + 11.8912 * scale,
                offsetX + 15 * scale, offsetY + 9.46667 * scale,
                offsetX + 15 * scale, offsetY + 6.88306 * scale
            );
            // Line up right side to (15,3)
            ctx.lineTo(offsetX + 15 * scale, offsetY + 3 * scale);
            // Line to top center, completing the path
            ctx.lineTo(offsetX + 8 * scale, offsetY + 0 * scale);
            ctx.closePath();
        };
        
        const centerX = shieldIconX + iconSize / 2;
        const centerY = shieldIconY + iconSize / 2;
        
        // Draw single shield with border and gradient fill
        ctx.globalAlpha = 0.9;
        drawShieldPath(centerX, centerY, iconSize);
        
        // Create gradient fill
        const shieldGradient = ctx.createLinearGradient(centerX, centerY - iconSize/2, centerX, centerY + iconSize/2);
        shieldGradient.addColorStop(0, 'rgba(135, 206, 250, 0.95)'); // Light sky blue
        shieldGradient.addColorStop(0.5, 'rgba(100, 180, 255, 0.9)'); // Sky blue
        shieldGradient.addColorStop(1, 'rgba(70, 150, 220, 0.85)'); // Deeper sky blue
        
        // Fill the shield
        ctx.fillStyle = shieldGradient;
        ctx.fill();
        
        // Add border stroke
        ctx.strokeStyle = 'rgba(120, 180, 255, 0.8)'; // Lighter shield-blue border
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.globalAlpha = 0.9;
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.fillStyle = textColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const shieldText = `${this.player.shield}%`;
        const shieldTextX = shieldIconX + iconSize + 8;
        const shieldTextY = shieldIconY + iconSize / 2;
        
        // Draw shield text with outline
        ctx.strokeText(shieldText, shieldTextX, shieldTextY);
        ctx.fillText(shieldText, shieldTextX, shieldTextY);


        // Draw energy tanks
        const tankSize = 25;
        const tankMargin = 8;
        const tanksY = barY + barHeight + 10;
        
        // Update energy tanks display
        let energyTanksContainer = document.getElementById('energy-tanks');
        if (!energyTanksContainer) {
            // Create energy tanks container if it doesn't exist
            const container = document.createElement('div');
            container.id = 'energy-tanks';
            container.style.position = 'absolute';
            container.style.top = '40px';
            container.style.left = '70px'; // Align with energy bar (24px base + 45px margin)
            container.style.display = 'flex';
            container.style.gap = '3px';
            container.style.zIndex = '90';
            document.body.appendChild(container);
        } else {
            // Clear existing tanks
            energyTanksContainer.innerHTML = '';
        }
        
        // Create only the tanks the player has (max 10 visible)
        energyTanksContainer = document.getElementById('energy-tanks');
        const visibleTanks = Math.min(this.displayTanks, 10);
        for (let i = 0; i < visibleTanks; i++) {
            const tank = document.createElement('div');
            tank.className = 'energy-tank';
            tank.dataset.tankIndex = i;
            tank.style.width = '14px';
            tank.style.height = '14px';
            tank.style.borderRadius = '3px';
            tank.style.background = 'rgba(0,255,0,0.8)';
            tank.style.position = 'relative';
            energyTanksContainer.appendChild(tank);
        }
    }    
    explodeTank(tankIndex) {
        const tanks = document.querySelectorAll('.energy-tank');
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
        if (this.player.invincible) return;

        // Player takes damage
        this.takeDamage(asteroid.mass * 0.1);
        this.particlePool.get(this.player.x, this.player.y, 'shieldHit', this.player.radius);
        this.audioManager.playShield();

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

        // Separate overlapping objects
        const overlap = this.player.radius + asteroid.radius - Math.hypot(this.player.x - asteroid.x, this.player.y - asteroid.y);
        const separationForce = overlap / 2;
        this.player.x -= nx * separationForce;
        this.player.y -= ny * separationForce;
        asteroid.x += nx * separationForce;
        asteroid.y += ny * separationForce;

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