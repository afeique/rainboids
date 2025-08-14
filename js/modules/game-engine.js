// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './constants.js';
import { random, collision, burstStarCollision, triggerHapticFeedback, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon } from './utils.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { PoolManager } from './pool-manager.js';
import { Player } from './entities/player.js';
import { Bullet } from './entities/bullet.js';
import { Asteroid } from './entities/asteroid.js';
import { Enemy, ENEMY_TYPES } from './entities/enemy.js';
import { EnemyBullet } from './entities/enemy-bullet.js';
import { Particle } from './entities/particle.js';
import { ColorStar } from './entities/color-star.js';
import { BackgroundStar } from './entities/background-star.js';
import { LineDebris } from './entities/line-debris.js';
import { Powerup } from './entities/powerup.js';

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
        this.baseDamage = 1; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();
        
        // Enhanced wave management
        this.waveTimer = 0;
        this.lastEnemySpawn = 0;
        this.waveInProgress = false;
        
        // Sub-wave tracking
        this.currentSubWave = 0;
        this.subWaveTimer = 0;
        this.subWaveStartTime = 0; // Track sub-wave start time for timeout
        this.enemiesRemainingInSubWave = 0;
        
        // Wave phase tracking
        this.wavePhase = 'waiting'; // 'waiting', 'asteroids', 'enemies', 'complete'
        this.wavePhaseTimer = 0;
        
        // Depth-based starfield rendering initialized
        console.log('🌟 Starfield Depth Batching Active');
        console.log('  gameEngine.debugStarfieldPerformance() - Show performance stats');
        console.log('  gameEngine.showDepthBatchStats() - Show depth batching details');
        console.log('🤖 Enemy System Ready:');
        console.log('  🔴 HUNTER (Triangle) - 10 HP - Fast aggressive chaser');
        console.log('  🟢 GUARDIAN (Square) - 20 HP - Defensive spread shooter');
        console.log('  🟡 WASP (Diamond) - 8 HP - Fast swarm enemy');
        console.log('  🟣 TITAN (Hexagon) - 30 HP - Heavy orbital enemy');
        console.log('  🔵 STALKER (Cross) - 10 HP - Stealth approach enemy');
        console.log('  🟠 BOMBER (Spiked Circle) - 15 HP - Explosive projectiles');
        console.log('💥 Combat System: Player bullets = 1 dmg, Enemy bullets = 2 dmg');
        console.log(`💚 Health System: Burst stars heal ${GAME_CONFIG.BURST_STAR_HEAL_AMOUNT}HP each! Enemies drop ${GAME_CONFIG.BURST_STAR_DROP_COUNT} per kill!`);
        console.log(`🪨 Asteroid Interactions: Enemy bullets deal ${GAME_CONFIG.ENEMY_BULLET_ASTEROID_DAMAGE} damage to asteroids, enemies bounce off (no damage)`);
        console.log('💥 Player Damage Feedback: Screen shake, red damage numbers, and colored explosions when hit');
        console.log('🎆 Bullet Impact Effects: Colored particle explosions for all enemy bullet impacts');
        console.log('🟠 Player Bullet Effects: Satisfying orange explosions on all player bullet hits');
        console.log('♻️  Enemy Bullet Lifecycle: No fade decay, recycled when off-screen for efficiency');
        console.log('👻 Enemy Phase-Through: Enemies pass through each other and enemy bullets');
        console.log('🕶️ Enemy Dodging: Enemies actively dodge each other\'s bullets with predictive AI');
        console.log('💊 Tunable Healing: Burst star heal amount now configurable in constants');
        console.log('🌊 Enhanced Waves: Multi-phase waves with asteroids first, then enemy sub-waves');
        console.log('⚡ Performance Optimizations Active:');
        console.log('  🔧 Reduced particle counts for explosions and effects');
        console.log('  🧹 Automatic particle cleanup and limits');
        console.log('  📊 gameEngine.showPerformanceStats() - View current object counts');
        console.log('🎁 Powerup System Active:');
        console.log('  💨 Rapid Fire - Faster shooting (stacks up to 5x)');
        console.log('  🎯 Homing Bullets - Track enemies automatically');
        console.log('  💥 Multi-Shot & Spread Shot - More bullets per shot');
        console.log('  🔸 Big Bullets - Easier to hit agile enemies');
        console.log('  ⚡ Speed Boost - Enhanced movement speed');
        console.log('  🏹 Piercing Shots - Bullets go through enemies');
        console.log('  💣 Explosive Rounds - Area damage on impact');
        console.log('  🛡️ Shield Boost - +15% damage reduction per stack');
        console.log('✨ Enhanced Star System:');
        console.log('  ⭐ Larger stars to showcase beautiful geometric shapes');
        console.log('  🎭 15% chance for spectacular big stars');
        console.log('  🔶 Complex shapes: stars, hexagons, diamonds, sparkles & bursts');
        console.log('  💫 Enhanced animations: rotation, pulsing, and glow effects');
        console.log('😌 Calmed Down All Enemies:');
        console.log('  🐌 Significantly reduced all enemy speeds (STALKER: 2.6→1.8, HUNTER: 2.2→1.6)');
        console.log('  🎯 Toned down dodge mechanics, erratic movement, and acceleration');
        console.log('  💨 Reduced weaving, sine waves, and speed multipliers');
        console.log('  🎮 Much more manageable and less frantic gameplay');
        console.log('🚀 Enhanced WASD + Mouse Controls:');
        console.log('  ⬆️ WASD = Move in 8 directions with tight control');
        console.log('  🖱️ Mouse = Aim direction (ship faces mouse cursor)');
        console.log('  🔫 Auto-fire = Ship continuously fires (no fire button!)');
        console.log('  📱 Mobile = Joystick: WASD movement, touch for aiming');
        console.log('');
        console.log('🎮 Simplified Gameplay:');
        console.log('  🪨 Max 5 asteroids on field at once');
        console.log('  👾 Max 3 enemies on field at once');
        console.log('  🎯 Single enemy per sub-wave for focused combat');
        console.log('  ⏰ Sub-waves auto-progress after 2 minutes');
        console.log('  🎨 Much less agile enemies - easier to hit!');
        console.log('');
        console.log('🎁 Enhanced Powerup System:');
        console.log('  ✨ Spectacular gradient visual effects and distinctive shapes');
        console.log('  🎯 Unique icons: ⚡💨🎯●💥🛡 etc. for each powerup type');
        console.log('  🔊 Magical treasure pickup sound with pitch variations');
        console.log('  📊 Console shows powerup drop rolls and spawns');
        console.log('  🎮 Beautiful gradient UI indicators at bottom of screen');
        console.log('  ⏱️ Timer bars show remaining duration (1 minute each)');
        console.log('  📺 Powerup names display at top in Silkscreen font with smooth fade');
        console.log('  🎨 Bullets change shape/color based on active powerups');
        console.log('  🧪 Press "P" key to test spawn a powerup near player');
    }
    
    // Performance monitoring
    showPerformanceStats() {
        console.log('📊 Performance Stats:');
        console.log(`  Particles: ${this.particlePool.activeObjects.length}/${GAME_CONFIG.MAX_PARTICLES}`);
        console.log(`  Bullets: ${this.bulletPool.activeObjects.length}`);
        console.log(`  Enemies: ${this.enemyPool.activeObjects.length}`);
        console.log(`  Asteroids: ${this.asteroidPool.activeObjects.length}`);
        console.log(`  Enemy Bullets: ${this.enemyBulletPool.activeObjects.length}`);
        console.log(`  Color Stars: ${this.colorStarPool.activeObjects.length}`);
        console.log(`  Background Stars: ${this.backgroundStarPool.activeObjects.length}`);
        console.log(`  Line Debris: ${this.lineDebrisPool.activeObjects.length}`);
        console.log(`  Powerups: ${this.powerupPool.activeObjects.length}`);
        
        const totalObjects = this.particlePool.activeObjects.length + 
                           this.bulletPool.activeObjects.length + 
                           this.enemyPool.activeObjects.length + 
                           this.asteroidPool.activeObjects.length + 
                           this.enemyBulletPool.activeObjects.length + 
                           this.colorStarPool.activeObjects.length + 
                           this.backgroundStarPool.activeObjects.length + 
                           this.lineDebrisPool.activeObjects.length + 
                           this.powerupPool.activeObjects.length;
        console.log(`  Total Objects: ${totalObjects}`);
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
            screenShakeMagnitude: 0,
            enemyLevel: 1,    // Enemy level increases each wave
            asteroidLevel: 1  // Asteroid level increases each wave
        };
    }
    
    initializePools() {
        this.player = new Player();
        
        this.bulletPool = new PoolManager(Bullet, 20);
        this.particlePool = new PoolManager(Particle, 200);
        this.lineDebrisPool = new PoolManager(LineDebris, 100);
        this.asteroidPool = new PoolManager(Asteroid, 20);
        this.enemyPool = new PoolManager(Enemy, 15);
        this.enemyBulletPool = new PoolManager(EnemyBullet, 50);
        this.colorStarPool = new PoolManager(ColorStar, GAME_CONFIG.COLOR_STAR_COUNT + 100);
        this.backgroundStarPool = new PoolManager(BackgroundStar, GAME_CONFIG.BACKGROUND_STAR_COUNT);
        this.powerupPool = new PoolManager(Powerup, 20);
        
        // Powerup display system
        this.powerupDisplay = {
            active: false,
            text: '',
            color: '#ffffff',
            opacity: 1.0,
            fadeTimer: 0,
            maxFadeTime: 180 // 3 seconds fade out
        };
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
        
        // Handle pause and test keys
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                this.togglePause();
            }
            // Test powerup spawn (for debugging)
            if (e.code === 'KeyP' && this.game.state === GAME_STATES.PLAYING) {
                const offsetX = random(-50, 50);
                const offsetY = random(-50, 50);
                this.dropPowerup(this.player.x + offsetX, this.player.y + offsetY);
                console.log('🧪 Test powerup spawned near player');
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
            if (e.code === 'Space' && this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                this.closeShop();
            }
        });
        
        // Shop click handling with click-outside-to-close
        this.canvas.addEventListener('click', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                e.stopPropagation();
                
                const rect = this.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                // Check if click is outside shop window
                if (this.shopWindowBounds) {
                    const isOutsideShop = clickX < this.shopWindowBounds.x || 
                                        clickX > this.shopWindowBounds.x + this.shopWindowBounds.width ||
                                        clickY < this.shopWindowBounds.y || 
                                        clickY > this.shopWindowBounds.y + this.shopWindowBounds.height;
                    
                    if (isOutsideShop) {
                        console.log('🛒 Clicked outside shop, closing...');
                        this.closeShop();
                        return;
                    }
                }
                
                // Check for item clicks
                if (this.shopItemBounds) {
                    for (const bound of this.shopItemBounds) {
                        if (clickX >= bound.x && clickX <= bound.x + bound.width &&
                            clickY >= bound.y && clickY <= bound.y + bound.height) {
                            console.log(`🛒 Attempting to buy ${bound.item.name}...`);
                            const success = this.buyShopItem(bound.item.id);
                            if (success) {
                                console.log(`🛒 Purchase successful!`);
                            }
                            break;
                        }
                    }
                }
            }
        });
        
        // Mouse move tracking for hover effects
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });
        
        // Shop scroll support
        this.canvas.addEventListener('wheel', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                
                // Check if mouse is over shop window
                if (this.shopWindowBounds && this.mouseX !== undefined && this.mouseY !== undefined) {
                    const isOverShop = this.mouseX >= this.shopWindowBounds.x && 
                                     this.mouseX <= this.shopWindowBounds.x + this.shopWindowBounds.width &&
                                     this.mouseY >= this.shopWindowBounds.y && 
                                     this.mouseY <= this.shopWindowBounds.y + this.shopWindowBounds.height;
                    
                    if (isOverShop) {
                        const scrollSpeed = 40;
                        if (this.shopScrollOffset === undefined) {
                            this.shopScrollOffset = 0;
                        }
                        this.shopScrollOffset += e.deltaY > 0 ? scrollSpeed : -scrollSpeed;
                    }
                }
            }
        });
        
        // Mobile touch support for shop
        let touchStartY = 0;
        let touchStartScrollOffset = 0;
        
        this.canvas.addEventListener('touchstart', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.touches[0];
                const touchX = touch.clientX - rect.left;
                const touchY = touch.clientY - rect.top;
                
                // Check if touch is outside shop window - close if so
                if (this.shopWindowBounds) {
                    const isOutsideShop = touchX < this.shopWindowBounds.x || 
                                        touchX > this.shopWindowBounds.x + this.shopWindowBounds.width ||
                                        touchY < this.shopWindowBounds.y || 
                                        touchY > this.shopWindowBounds.y + this.shopWindowBounds.height;
                    
                    if (isOutsideShop) {
                        e.preventDefault();
                        console.log('🛒 Touched outside shop, closing...');
                        this.closeShop();
                        return;
                    }
                }
                
                // Store touch start position for scrolling
                touchStartY = touchY;
                touchStartScrollOffset = this.shopScrollOffset || 0;
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                e.preventDefault(); // Prevent page scroll
                
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.touches[0];
                const touchY = touch.clientY - rect.top;
                
                // Update scroll offset based on touch movement
                const deltaY = touchStartY - touchY;
                if (this.shopScrollOffset === undefined) {
                    this.shopScrollOffset = 0;
                }
                this.shopScrollOffset = touchStartScrollOffset + deltaY;
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.changedTouches[0];
                const touchX = touch.clientX - rect.left;
                const touchY = touch.clientY - rect.top;
                
                // Check for item taps (only if not much scrolling happened)
                const scrollDelta = Math.abs((this.shopScrollOffset || 0) - touchStartScrollOffset);
                if (scrollDelta < 20 && this.shopItemBounds) { // 20px tolerance for tap vs scroll
                    for (const bound of this.shopItemBounds) {
                        if (touchX >= bound.x && touchX <= bound.x + bound.width &&
                            touchY >= bound.y && touchY <= bound.y + bound.height) {
                            console.log(`🛒 Attempting to buy ${bound.item.name}...`);
                            const success = this.buyShopItem(bound.item.id);
                            if (success) {
                                console.log(`🛒 Purchase successful!`);
                            }
                            break;
                        }
                    }
                }
            }
        });
    }
    
    init() {
        // Reset core game state (score, money, wave)
        this.initializeGameState();
        this.game.state = GAME_STATES.PLAYING;
        // Reset player
        this.player = new Player();
        // Wave bonus shield system removed
        // Reset shields
        this.playerShields = 10; // Start with 10 health
        this.shieldTanks = 0; // Reset to zero tanks
        this.displayShields = 10; // Match starting health
        this.displayTanks = 0;
        this.animatingDamage = false;
        this.pendingDamage = 0; // Reset pending damage
        
        // Reset enhanced wave state
        this.waveTimer = 0;
        this.lastEnemySpawn = 0;
        this.waveInProgress = false;
        this.currentSubWave = 0;
        this.subWaveTimer = 0;
        this.subWaveStartTime = 0;
        this.enemiesRemainingInSubWave = 0;
        this.wavePhase = 'waiting';
        this.wavePhaseTimer = 0;
        // Clear all pools
        this.bulletPool.activeObjects = [];
        this.particlePool.activeObjects = [];
        this.lineDebrisPool.activeObjects = [];
        this.asteroidPool.activeObjects = [];
        this.enemyPool.activeObjects = [];
        this.enemyBulletPool.activeObjects = [];
        this.colorStarPool.activeObjects = [];
        this.backgroundStarPool.activeObjects = [];
        this.powerupPool.activeObjects = [];
        
        // Generate all color stars at once using generative method
        this.generateInitialColorStars();
        this.generateBackgroundStars();
        
        // Initialize first wave with enhanced wave system
        this.game.currentWave = 1;
        this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 7000, 'top');
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
            }
        }, 1500);
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
        this.enemyPool.cleanupInactive();
        this.enemyBulletPool.cleanupInactive();
        this.colorStarPool.cleanupInactive();
        this.backgroundStarPool.cleanupInactive();
        // Note: Wave increment now handled by enhanced wave system (completeWave method)
        this.uiManager.showMessage(`WAVE ${this.game.currentWave + 1}`, '', 7000, 'top');
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // Reset player state at wave start
        this.playerState = PLAYER_STATES.NORMAL;
        
        // Restore player health to full between waves
        this.player.health = this.player.getEffectiveMaxHealth();
        
        // Note: Asteroid spawning now handled by enhanced wave system
        // via spawnWaveAsteroids() in startNewWave()
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
        
        const newAst = this.asteroidPool.get(x, y, r, this.game.asteroidLevel);
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
    
    // Enhanced wave management with sub-waves
    updateWaves() {
        if (this.game.state !== GAME_STATES.PLAYING) return;
        
        const now = Date.now();
        
        // Check if current wave is complete - automatic progression after all sub-waves
        if (this.waveInProgress) {
            const activeEnemies = this.enemyPool.activeObjects.length;
            const activeAsteroids = this.asteroidPool.activeObjects.length;
            
            // Natural completion: all enemies and asteroids eliminated and all sub-waves completed
            const naturalCompletion = activeEnemies === 0 && activeAsteroids === 0 && 
            this.currentSubWave >= GAME_CONFIG.SUB_WAVES_PER_WAVE &&
                                    this.enemiesRemainingInSubWave <= 0;
            
            // Forced completion: all sub-waves finished (automatically progress regardless of enemies)
            const forcedCompletion = this.currentSubWave >= GAME_CONFIG.SUB_WAVES_PER_WAVE;
            
            if (naturalCompletion || forcedCompletion) {
            this.completeWave();
            return;
            }
        }
        
        // Start new wave
        if (!this.waveInProgress && now > this.waveTimer) {
            this.startNewWave();
            return;
        }
        
        // Handle wave phases
        if (this.waveInProgress) {
            this.updateWavePhases(now);
        }
    }
    
    updateWavePhases(now) {
        switch (this.wavePhase) {
            case 'asteroids':
                // Asteroids should spawn immediately when wave starts
                if (now - this.wavePhaseTimer > GAME_CONFIG.WAVE_ASTEROID_DELAY) {
                    this.wavePhase = 'enemies';
                    this.wavePhaseTimer = now;
                    this.currentSubWave = 0;
                    this.startEnemySubWave();
                }
                break;
                
            case 'enemies':
                // Handle enemy sub-wave spawning
                if (this.currentSubWave < GAME_CONFIG.SUB_WAVES_PER_WAVE) {
                    // Check if current sub-wave is complete OR timed out OR interval elapsed
                    const subWaveTimedOut = (now - this.subWaveStartTime) > GAME_CONFIG.SUB_WAVE_TIMEOUT;
                    const subWaveComplete = this.enemiesRemainingInSubWave <= 0;
                    const intervalElapsed = now - this.subWaveTimer > GAME_CONFIG.SUB_WAVE_INTERVAL;
                    
                    // Force progression if any condition is met (no waiting for both conditions)
                    if (subWaveComplete || subWaveTimedOut || intervalElapsed) {
                        
                        if (subWaveTimedOut) {
                            console.log(`⏰ Sub-wave ${this.currentSubWave + 1} timed out after ${GAME_CONFIG.SUB_WAVE_TIMEOUT/1000} seconds`);
                        } else if (intervalElapsed && !subWaveComplete) {
                            console.log(`🚀 Sub-wave ${this.currentSubWave + 1} auto-progressed after ${GAME_CONFIG.SUB_WAVE_INTERVAL/1000} seconds`);
                        }
                        
                        this.currentSubWave++;
                        if (this.currentSubWave < GAME_CONFIG.SUB_WAVES_PER_WAVE) {
                            this.startEnemySubWave();
                        }
                    }
                    
                    // Spawn enemies in current sub-wave (respect MAX_ENEMIES limit)
                    const currentEnemies = this.enemyPool.activeObjects.length;
                    const canSpawnMore = currentEnemies < GAME_CONFIG.MAX_ENEMIES;
                    
                    if (this.enemiesRemainingInSubWave > 0 && 
                        canSpawnMore &&
                        now - this.lastEnemySpawn > 1000) { // Spawn one enemy at a time
                        this.spawnRandomEnemy();
                        this.enemiesRemainingInSubWave--;
                        this.lastEnemySpawn = now;
                        console.log(`👾 Spawned enemy (${currentEnemies + 1}/${GAME_CONFIG.MAX_ENEMIES} active)`);
                    }
                }
                break;
        }
    }
    
    completeWave() {
        this.waveInProgress = false;
        this.game.currentWave++;
        this.waveTimer = Date.now() + GAME_CONFIG.WAVE_BREAK_TIME; // Short break between waves
        this.wavePhase = 'waiting';
        
        // Increase enemy and asteroid levels each wave for scaling difficulty
        this.game.enemyLevel = Math.floor(this.game.currentWave / 2) + 1; // Level 1-2 = wave 1-3, Level 3 = wave 5-6, etc.
        this.game.asteroidLevel = Math.floor(this.game.currentWave / 3) + 1; // Slower asteroid scaling
        
        console.log(`🌊 Wave ${this.game.currentWave} completed! Enemy Level: ${this.game.enemyLevel}, Asteroid Level: ${this.game.asteroidLevel}`);
        
        // Open shop immediately after wave completion
        setTimeout(() => {
            this.openShop();
        }, 500); // Brief delay to ensure clean transition
        
        console.log(`✅ Wave ${this.game.currentWave} complete! Opening shop...`);
    }
    
    openShop() {
        // Pause the game and show shop interface
        this.game.state = GAME_STATES.SHOP;
        
        // Define shop items with balanced costs based on power output
        this.shopItems = [
            {
                id: 'MEDPACK',
                name: 'Medpack',
                description: 'Increases burst star healing by 1',
                cost: 500,  // Premium healing upgrade
                icon: '💊',
                maxStacks: 5  // 5 stacks for max +5 healing (1 base + 5 bonus = 6 total)
            },
            {
                id: 'HEALTH_BOOST',
                name: 'Health Boost', 
                description: 'Increases max health by 20',
                cost: 1000,  // Very expensive for significant health increase
                icon: '❤️',
                maxStacks: 20   // 20 stacks × 20 = 400 extra health (100 base + 400 = 500 max)
            },
            {
                id: 'SPEED_BOOST',
                name: 'Speed Boost',
                description: 'Move 30% faster',
                cost: 5000,  // Ultra expensive utility upgrade
                icon: '💨',
                maxStacks: 4
            },
            {
                id: 'RAPID_FIRE',
                name: 'Rapid Fire',
                description: 'Shoot 25% faster',
                cost: 1500,  // Expensive DPS increase
                icon: '⚡',
                maxStacks: 5
            },
            {
                id: 'SHIELD_BOOST',
                name: 'Shielding',
                description: 'Reduces damage by 5%',
                cost: 1500, // Premium shield enhancement
                icon: '🛡️', // Shield icon
                maxStacks: 15  // 15 stacks × 5% = 75% max
            },
            {
                id: 'MULTI_SHOT',
                name: 'Multi Shot',
                description: 'Fire one extra bullet',
                cost: 2000, // Very expensive DPS boost
                icon: '🎯',
                maxStacks: 5   // Unlimited stacking for high cost
            },
            {
                id: 'SPREAD_SHOT',
                name: 'Spread Shot',
                description: 'Fire spread bullets (3/5/7)',
                cost: 2000, // Base cost, escalates with purchases
                icon: '📐',
                maxStacks: 3   // Now upgradeable 3 times
            },
            {
                id: 'HOMING',
                name: 'Homing',
                description: 'Bullets track enemies',
                cost: 1500, // Very expensive utility upgrade
                icon: '🎪',
                maxStacks: 5   // More stacks for scaling effect
            },
            {
                id: 'PIERCING',
                name: 'Piercing',
                description: 'Bullets go through enemies',
                cost: 5000, // Ultra expensive for game-changing effect
                icon: '🏹',
                maxStacks: 5   // More stacks for multiple piercing
            },
            {
                id: 'EXPLOSIVE',
                name: 'Explosive',
                description: 'Bullets explode on impact',
                cost: 3000, // Ultra expensive for massive area damage
                icon: '💣',
                maxStacks: 3
            },
            {
                id: 'CRIT_CHANCE',
                name: 'Critical Chance',
                description: 'Increases crit chance by 5%',
                cost: 3000, // Ultra expensive DPS multiplier
                icon: '🎯',
                maxStacks: 10  // Max 50% crit chance
            },
            {
                id: 'CRIT_DAMAGE',
                name: 'Critical Damage',
                description: 'Increases crit damage by 10%',
                cost: 1500, // Expensive damage scaling
                icon: '💥',
                maxStacks: 15  // Max 300% crit damage (150% base + 150% from upgrades)
            }
        ];
        
        console.log('🛒 Shop opened!');
    }
    
    closeShop() {
        try {
            console.log('🛒 Closing shop...');
            
            if (!this.game) {
                console.error('❌ Game object is undefined in closeShop!');
                return;
            }
            
            this.game.state = GAME_STATES.WAVE_TRANSITION;
            console.log(`🎮 Game state changed to: ${this.game.state}`);
            
            // Clear shop bounds to prevent memory leaks
            this.shopItemBounds = null;
            console.log('🧹 Shop bounds cleared');
            
            // Respect the WAVE_BREAK_TIME timer instead of immediately starting the wave
            const remainingTime = this.waveTimer - Date.now();
            if (remainingTime > 0) {
                console.log(`⏱️ Waiting ${remainingTime}ms before starting next wave (respecting WAVE_BREAK_TIME)`);
                setTimeout(() => {
                    if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                        console.log('🚀 Starting new wave after timer...');
                        this.startNewWave();
                    }
                }, remainingTime);
            } else {
                console.log('🚀 Timer expired, starting new wave immediately...');
                this.startNewWave();
            }
            
            console.log('🛒 Shop closed!');
            
        } catch (error) {
            console.error('❌ Error in closeShop:', error);
            console.error('❌ Stack trace:', error.stack);
        }
    }
    
    buyShopItem(itemId) {
        try {
            console.log(`🛒 buyShopItem called with itemId: ${itemId}`);
            
            const item = this.shopItems.find(i => i.id === itemId);
            if (!item) {
                console.error(`❌ Item not found: ${itemId}`);
                return false;
            }
            
            console.log(`🛒 Found item: ${item.name}`);
            
            if (!this.player) {
                console.error(`❌ Player is undefined!`);
                return false;
            }
            
            const currentStacks = this.player.getPowerupStacks(itemId);
            if (currentStacks >= item.maxStacks) {
                if (item.maxStacks === 1) {
                    console.log(`❌ ${item.name} can only be purchased once`);
                } else {
                    console.log(`❌ ${item.name} is already at max level (${item.maxStacks})`);
                }
                return false;
            }
            
            if (!this.game) {
                console.error(`❌ Game object is undefined!`);
                return false;
            }
            
            // Calculate dynamic cost for spread shot
            let actualCost = item.cost;
            if (item.id === 'SPREAD_SHOT') {
                const currentStacks = this.player.getPowerupStacks(item.id);
                if (currentStacks === 0) actualCost = 2000;      // First purchase
                else if (currentStacks === 1) actualCost = 4000; // Second purchase  
                else if (currentStacks === 2) actualCost = 10000; // Third purchase
            }
            
            if (this.game.money < actualCost) {
                console.log(`❌ Not enough coins for ${item.name} (need ${actualCost}, have ${this.game.money})`);
                return false;
            }
            
            // Purchase successful
            this.game.money -= actualCost;
            console.log(`💰 Money deducted. New balance: ${this.game.money}`);
            
            // Add powerup to player (permanent for the run)
            const powerupConfig = this.getPowerupConfig(itemId);
            if (!powerupConfig) {
                console.error(`❌ Powerup config not found for: ${itemId}`);
                return false;
            }
            
            console.log(`🛒 Adding powerup to player...`);
            this.player.addPowerup(itemId, {
                ...powerupConfig,
                duration: Infinity // Permanent for the run
            }, true); // isShopItem = true
            
            console.log(`✅ Purchased ${item.name} for ${actualCost} coins!`);
            
            if (!this.audioManager) {
                console.error(`❌ AudioManager is undefined!`);
                return true; // Purchase was successful, just no sound
            }
            
            this.audioManager.playCoin(); // Play purchase sound
            return true;
            
        } catch (error) {
            console.error(`❌ Error in buyShopItem:`, error);
            console.error(`❌ Stack trace:`, error.stack);
            return false;
        }
    }
    
    getPowerupConfig(type) {
        // Return powerup configurations for shop items
        const configs = {
            'SHIELD_BOOST': { name: 'Shielding', duration: Infinity },
            'RAPID_FIRE': { name: 'Rapid Fire', duration: Infinity },
            'MULTI_SHOT': { name: 'Multi Shot', duration: Infinity },
            'SPREAD_SHOT': { name: 'Spread Shot', duration: Infinity },
            'SPEED_BOOST': { name: 'Speed Boost', duration: Infinity },
            'PIERCING': { name: 'Piercing', duration: Infinity },
            'EXPLOSIVE': { name: 'Explosive', duration: Infinity },
            'HOMING': { name: 'Homing', duration: Infinity },
            'MEDPACK': { name: 'Medpack', duration: Infinity },
            'HEALTH_BOOST': { name: 'Health Boost', duration: Infinity },
            'CRIT_CHANCE': { name: 'Critical Chance', duration: Infinity },
            'CRIT_DAMAGE': { name: 'Critical Damage', duration: Infinity }
        };
        return configs[type];
    }
    
    drawShop() {
        // Initialize scroll offset if not set
        if (this.shopScrollOffset === undefined) {
            this.shopScrollOffset = 0;
        }
        
        // Draw semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Calculate shop window dimensions
        const shopWindowWidth = Math.min(600, this.width - 40);
        const shopWindowHeight = Math.min(this.height - 160, 600);
        const shopWindowX = (this.width - shopWindowWidth) / 2;
        const shopWindowY = 120;
        
        // Store shop window bounds for click detection
        this.shopWindowBounds = {
            x: shopWindowX,
            y: shopWindowY,
            width: shopWindowWidth,
            height: shopWindowHeight
        };
        
        // Draw shop window background
        this.ctx.fillStyle = 'rgba(20, 20, 30, 0.95)';
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 3;
        this.ctx.fillRect(shopWindowX, shopWindowY, shopWindowWidth, shopWindowHeight);
        this.ctx.strokeRect(shopWindowX, shopWindowY, shopWindowWidth, shopWindowHeight);
        
        // Shop title - larger and more prominent
        this.ctx.fillStyle = '#FFD700';
        this.ctx.font = 'bold 32px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SHOP', this.width / 2, 60);
        
        // Money display - larger and more visible
        this.ctx.fillStyle = '#00FF00';
        this.ctx.font = 'bold 20px "Press Start 2P", monospace';
        this.ctx.fillText(`Coins: ${this.game.money}`, this.width / 2, 90);
        
        // Setup clipping for scrollable area
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(shopWindowX + 10, shopWindowY + 20, shopWindowWidth - 20, shopWindowHeight - 80);
        this.ctx.clip();
        
        // Calculate scrollable list layout
        const itemWidth = shopWindowWidth - 40;
        const itemHeight = 100; // Increased from 80 to accommodate larger fonts
        const padding = 12; // Slightly increased padding
        const startX = shopWindowX + 20;
        
        // Calculate total content height for scroll limits
        const totalContentHeight = this.shopItems.length * (itemHeight + padding);
        const maxScroll = Math.max(0, totalContentHeight - (shopWindowHeight - 80));
        
        // Clamp scroll offset
        this.shopScrollOffset = Math.max(0, Math.min(maxScroll, this.shopScrollOffset));
        
        // Calculate start Y position after clamping scroll offset
        const startY = shopWindowY + 30 - this.shopScrollOffset;
        
        // Draw shop items with hover detection
        this.shopItems.forEach((item, index) => {
            const x = startX;
            const y = startY + index * (itemHeight + padding);
            
            // Only draw items that are visible in the scroll area
            if (y + itemHeight >= shopWindowY + 20 && y <= shopWindowY + shopWindowHeight - 60) {
                // Check for hover if mouse position is available
                let isHovered = false;
                if (this.mouseX !== undefined && this.mouseY !== undefined) {
                    isHovered = this.mouseX >= x && this.mouseX <= x + itemWidth &&
                               this.mouseY >= y && this.mouseY <= y + itemHeight &&
                               this.mouseX >= shopWindowX + 10 && this.mouseX <= shopWindowX + shopWindowWidth - 10 &&
                               this.mouseY >= shopWindowY + 20 && this.mouseY <= shopWindowY + shopWindowHeight - 60;
                }
                
                this.drawShopItem(item, x, y, itemWidth, itemHeight, index, isHovered);
            }
        });
        
        this.ctx.restore(); // Remove clipping
        
        // Draw scroll indicators if needed
        if (maxScroll > 0) {
            const scrollBarX = shopWindowX + shopWindowWidth - 15;
            const scrollBarY = shopWindowY + 20;
            const scrollBarHeight = shopWindowHeight - 80;
            const scrollThumbHeight = Math.max(20, scrollBarHeight * (shopWindowHeight - 80) / totalContentHeight);
            const scrollThumbY = scrollBarY + (this.shopScrollOffset / maxScroll) * (scrollBarHeight - scrollThumbHeight);
            
            // Scroll track
            this.ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
            this.ctx.fillRect(scrollBarX, scrollBarY, 10, scrollBarHeight);
            
            // Scroll thumb
            this.ctx.fillStyle = '#FFD700';
            this.ctx.fillRect(scrollBarX, scrollThumbY, 10, scrollThumbHeight);
        }
        
        // Instructions - larger and more visible
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '14px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click items to purchase • Press SPACE or click outside to continue', this.width / 2, this.height - 30);
    }
    
    drawShopItem(item, x, y, width, height, index, isHovered = false) {
        const currentStacks = this.player.getPowerupStacks(item.id);
        
        // Calculate dynamic cost for spread shot
        let actualCost = item.cost;
        if (item.id === 'SPREAD_SHOT') {
            if (currentStacks === 0) actualCost = 2000;      // First purchase
            else if (currentStacks === 1) actualCost = 4000; // Second purchase  
            else if (currentStacks === 2) actualCost = 10000; // Third purchase
        }
        
        const canAfford = this.game.money >= actualCost;
        const maxedOut = currentStacks >= item.maxStacks;
        
        // Item background with hover effect
        if (maxedOut) {
            this.ctx.fillStyle = isHovered ? 'rgba(150, 150, 150, 0.6)' : 'rgba(100, 100, 100, 0.5)';
        } else if (canAfford) {
            this.ctx.fillStyle = isHovered ? 'rgba(0, 255, 0, 0.4)' : 'rgba(0, 255, 0, 0.2)';
        } else {
            this.ctx.fillStyle = isHovered ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 0, 0, 0.2)';
        }
        this.ctx.fillRect(x, y, width, height);
        
        // Item border with hover effect
        if (isHovered) {
            this.ctx.strokeStyle = maxedOut ? '#AAA' : (canAfford ? '#00FF88' : '#FF4444');
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = maxedOut ? '#666' : (canAfford ? '#00FF00' : '#FF0000');
            this.ctx.lineWidth = 2;
        }
        this.ctx.strokeRect(x, y, width, height);
        
        // Horizontal layout for list items - larger, more visible fonts
        const iconSize = 32; // Increased from 24 for better visibility
        const padding = 15; // Increased padding for better spacing
        const iconAreaWidth = iconSize + padding; // Width allocated for icon area
        
        // Item icon (centered in icon area, shifted up by 10px)
        this.ctx.font = `${iconSize}px "Press Start 2P", monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = maxedOut ? '#666' : '#FFFFFF';
        const iconCenterX = x + padding + iconAreaWidth / 2;
        this.ctx.fillText(item.icon, iconCenterX, y + height / 2 + iconSize / 4 - 10);
        
        // Text content area (right of icon area)
        const textX = x + padding + iconAreaWidth + padding;
        const costAreaWidth = 100; // Fixed width for cost area
        const textWidth = width - (padding + iconAreaWidth + padding + costAreaWidth + padding);
        
        // Item name - larger, more visible font
        this.ctx.font = 'bold 16px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#FFFFFF';
        this.ctx.textAlign = 'left'; // Left-justified text
        
        // Truncate name if too long
        let displayName = item.name;
        let nameWidth = this.ctx.measureText(displayName).width;
        if (nameWidth > textWidth) {
            while (nameWidth > textWidth - 30 && displayName.length > 3) {
                displayName = displayName.slice(0, -1);
                nameWidth = this.ctx.measureText(displayName + '...').width;
            }
            displayName += '...';
        }
        this.ctx.fillText(displayName, textX, y + 22);
        
        // Item description - larger, more readable font
        this.ctx.font = '12px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#CCCCCC';
        this.ctx.textAlign = 'left'; // Ensure description is left-justified
        
        // Word wrap description to fit in available space (shifted down by 20px)
        const maxDescLines = 2;
        const lineHeight = 16; // Increased line height for larger font
        const descStartY = y + 62; // Shifted down by 20px from original y + 42
        
        this.drawMultilineText(item.description, textX, descStartY, textWidth, lineHeight, maxDescLines);
        
        // Level info (if applicable) - more visible (also shifted down)
        if (currentStacks > 0) {
            this.ctx.fillStyle = '#00FFFF';
            this.ctx.font = '11px "Press Start 2P", monospace';
            this.ctx.textAlign = 'left'; // Ensure level info is left-justified
            this.ctx.fillText(`Lv ${currentStacks}/${item.maxStacks}`, textX, y + 92); // Shifted down by 20px from y + 72
        }
        
        // Cost (right side) - larger, more visible
        const costX = x + width - padding;
        this.ctx.font = 'bold 16px "Press Start 2P", monospace';
        this.ctx.fillStyle = canAfford ? '#FFD700' : '#FF6666';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${actualCost}`, costX, y + 35);
        
        // "coins" label larger
        this.ctx.font = '12px "Press Start 2P", monospace';
        this.ctx.fillStyle = canAfford ? '#B8860B' : '#CC4444'; // Darker versions
        this.ctx.fillText('coins', costX, y + 52);
        
        // Store item bounds for click detection
        if (!this.shopItemBounds) this.shopItemBounds = [];
        this.shopItemBounds[index] = { x, y, width, height, item };
    }
    
    drawMultilineText(text, x, startY, maxWidth, lineHeight, maxLines = null) {
        const words = text.split(' ');
        let line = '';
        let y = startY;
        let lineCount = 0;
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && i > 0) {
                // Check if we've hit max lines
                if (maxLines && lineCount >= maxLines - 1) {
                    // Truncate with ellipsis
                    let truncatedLine = line.trim();
                    while (this.ctx.measureText(truncatedLine + '...').width > maxWidth && truncatedLine.length > 0) {
                        truncatedLine = truncatedLine.slice(0, -1);
                    }
                    this.ctx.fillText(truncatedLine + '...', x, y);
                    return;
                }
                
                // Draw the current line and start a new one
                this.ctx.fillText(line.trim(), x, y);
                line = words[i] + ' ';
                y += lineHeight;
                lineCount++;
            } else {
                line = testLine;
            }
        }
        
        // Draw the last line if we haven't hit max lines
        if (line.trim().length > 0 && (!maxLines || lineCount < maxLines)) {
            this.ctx.fillText(line.trim(), x, y);
        }
    }
    
    startNewWave() {
        try {
            console.log('🚀 startNewWave called');
            
            if (!this.game) {
                console.error('❌ Game object is undefined in startNewWave!');
                return;
            }
            
        this.waveInProgress = true;
        this.wavePhase = 'asteroids';
        this.wavePhaseTimer = Date.now();
        this.currentSubWave = 0;
        this.enemiesRemainingInSubWave = 0;
            
            console.log('📊 Wave state initialized');
        
        // Spawn asteroids first
            console.log('🪨 Spawning asteroids...');
        this.spawnWaveAsteroids();
        
        // Show wave notification
            if (this.uiManager) {
                console.log('📢 Showing wave notification...');
                this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 7000, 'top');
            } else {
                console.error('❌ UIManager is undefined!');
            }
        
        console.log(`🚨 Wave ${this.game.currentWave} starting!`);
        console.log(`🪨 Spawning asteroids first...`);
        console.log(`👾 ${GAME_CONFIG.SUB_WAVES_PER_WAVE} enemy sub-waves incoming!`);
            
        } catch (error) {
            console.error('❌ Error in startNewWave:', error);
            console.error('❌ Stack trace:', error.stack);
        }
    }
    
    spawnWaveAsteroids() {
        // Respect MAX_ASTEROIDS limit for simpler gameplay
        const desiredAsteroids = Math.min(
            GAME_CONFIG.INITIAL_AST_COUNT + Math.floor(this.game.currentWave / 2),
            GAME_CONFIG.MAX_ASTEROIDS
        );
        
        // Only spawn if we're under the limit
        const currentAsteroids = this.asteroidPool.activeObjects.length;
        const asteroidsToSpawn = Math.max(0, desiredAsteroids - currentAsteroids);
        
        for (let i = 0; i < asteroidsToSpawn; i++) {
            setTimeout(() => {
                const asteroid = this.asteroidPool.get();
                if (asteroid) {
                    this.initializeWaveAsteroid(asteroid);
                }
            }, i * 200); // Stagger asteroid spawning
        }
        
        console.log(`🪨 Spawning ${asteroidsToSpawn} asteroids (${currentAsteroids} already active, max: ${GAME_CONFIG.MAX_ASTEROIDS})`);
    }
    
    startEnemySubWave() {
        // Single enemy per sub-wave for focused combat
        this.enemiesRemainingInSubWave = GAME_CONFIG.ENEMIES_PER_SUB_WAVE;
        this.subWaveStartTime = Date.now(); // Track when sub-wave started for timeout
        this.subWaveTimer = Date.now();
        this.lastEnemySpawn = 0; // Spawn first enemy immediately
        
        console.log(`🔥 Sub-wave ${this.currentSubWave + 1}/${GAME_CONFIG.SUB_WAVES_PER_WAVE}: ${this.enemiesRemainingInSubWave} enemies!`);
    }
    
    initializeWaveAsteroid(asteroid) {
        // Spawn asteroid at random edge position
        let x, y;
        const edge = Math.floor(random(0, 4));
        const r = random(30, 60);
        const spawnBuffer = r * 4;
        
        switch (edge) {
            case 0: x = random(0, this.width); y = -spawnBuffer; break;
            case 1: x = this.width + spawnBuffer; y = random(0, this.height); break;
            case 2: x = random(0, this.width); y = this.height + spawnBuffer; break;
            case 3: x = -spawnBuffer; y = random(0, this.height); break;
        }
        
        const spd = Math.min(2.5, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.1);
        const vel = {
            x: random(-spd, spd) || 0.2,
            y: random(-spd, spd) || 0.2
        };
        
        asteroid.initializeAsteroid(x, y, r, this.game.asteroidLevel);
        asteroid.vel = vel;
    }
    
    // Legacy method - replaced by startNewWave and sub-wave system
    
    spawnRandomEnemy() {
        // Choose enemy type based on wave progression
        const enemyTypes = Object.keys(ENEMY_TYPES);
        let availableTypes = ['HUNTER', 'WASP']; // Start with basic types
        
        if (this.game.currentWave >= 2) availableTypes.push('GUARDIAN', 'STALKER');
        if (this.game.currentWave >= 4) availableTypes.push('BOMBER');
        if (this.game.currentWave >= 6) availableTypes.push('TITAN');
        
        const enemyType = availableTypes[Math.floor(random(0, availableTypes.length))];
        
        // Spawn at random edge position
        const edge = Math.floor(random(0, 4)); // 0=top, 1=right, 2=bottom, 3=left
        let x, y;
        
        switch (edge) {
            case 0: // Top
                x = random(50, this.width - 50);
                y = -50;
                break;
            case 1: // Right
                x = this.width + 50;
                y = random(50, this.height - 50);
                break;
            case 2: // Bottom
                x = random(50, this.width - 50);
                y = this.height + 50;
                break;
            case 3: // Left
                x = -50;
                y = random(50, this.height - 50);
                break;
        }
        
        const enemy = this.enemyPool.get(x, y, enemyType, this.game.enemyLevel);
        if (enemy) {
            console.log(`👾 ${enemyType} LV.${this.game.enemyLevel} spawned at wave ${this.game.currentWave}`);
        }
    }
    
    createEnemyDebris(enemy) {
        // Create explosion particles
        for (let i = 0; i < 20; i++) {
            const particle = this.particlePool.get(enemy.x, enemy.y, 'explosion');
            if (particle) {
                particle.color = enemy.color;
            }
        }
        
        // Create colored line debris based on enemy shape
        this.createShapeDebris(enemy);
        
        // Screen shake
        this.triggerScreenShake(12, 8, enemy.radius);
    }
    
    createShapeDebris(enemy) {
        const debrisCount = 6; // Number of debris pieces
        const size = enemy.radius * 0.8;
        
        for (let i = 0; i < debrisCount; i++) {
            // Create line segments based on enemy shape
            let p1, p2;
            
            switch (enemy.type) {
                case 'HUNTER': // Triangle debris
                    const triangleAngle = (i / 3) * Math.PI * 2 / 3;
                    p1 = { x: Math.cos(triangleAngle) * size * 0.5, y: Math.sin(triangleAngle) * size * 0.5 };
                    p2 = { x: Math.cos(triangleAngle + Math.PI * 2/3) * size * 0.5, y: Math.sin(triangleAngle + Math.PI * 2/3) * size * 0.5 };
                    break;
                    
                case 'GUARDIAN': // Square debris
                    const squareAngle = (i / 4) * Math.PI * 2;
                    p1 = { x: Math.cos(squareAngle) * size * 0.5, y: Math.sin(squareAngle) * size * 0.5 };
                    p2 = { x: Math.cos(squareAngle + Math.PI/2) * size * 0.5, y: Math.sin(squareAngle + Math.PI/2) * size * 0.5 };
                    break;
                    
                case 'WASP': // Diamond debris
                    const diamondAngle = (i / 4) * Math.PI * 2 + Math.PI/4;
                    p1 = { x: Math.cos(diamondAngle) * size * 0.4, y: Math.sin(diamondAngle) * size * 0.4 };
                    p2 = { x: Math.cos(diamondAngle + Math.PI/2) * size * 0.4, y: Math.sin(diamondAngle + Math.PI/2) * size * 0.4 };
                    break;
                    
                case 'TITAN': // Hexagon debris
                    const hexAngle = (i / 6) * Math.PI * 2;
                    p1 = { x: Math.cos(hexAngle) * size * 0.6, y: Math.sin(hexAngle) * size * 0.6 };
                    p2 = { x: Math.cos(hexAngle + Math.PI/3) * size * 0.6, y: Math.sin(hexAngle + Math.PI/3) * size * 0.6 };
                    break;
                    
                case 'STALKER': // Cross debris
                    if (i < 2) {
                        // Horizontal pieces
                        p1 = { x: -size * 0.5, y: 0 };
                        p2 = { x: size * 0.5, y: 0 };
                    } else {
                        // Vertical pieces
                        p1 = { x: 0, y: -size * 0.5 };
                        p2 = { x: 0, y: size * 0.5 };
                    }
                    break;
                    
                case 'BOMBER': // Spiked circle debris
                    const spikeAngle = (i / 8) * Math.PI * 2;
                    p1 = { x: Math.cos(spikeAngle) * size * 0.3, y: Math.sin(spikeAngle) * size * 0.3 };
                    p2 = { x: Math.cos(spikeAngle) * size * 0.6, y: Math.sin(spikeAngle) * size * 0.6 };
                    break;
                    
                default:
                    // Default random debris
                    const angle = (i / debrisCount) * Math.PI * 2;
                    p1 = { x: Math.cos(angle) * size * 0.3, y: Math.sin(angle) * size * 0.3 };
                    p2 = { x: Math.cos(angle) * size * 0.6, y: Math.sin(angle) * size * 0.6 };
            }
            
            this.lineDebrisPool.get(enemy.x, enemy.y, p1, p2, enemy.color);
        }
    }
    
    createEnemyBurstStar(x, y) {
        // Create a collectible burst star that heals the player
        const burstStar = this.colorStarPool.get(x, y, true); // true = is burst star
        if (burstStar) {
            // Give it some random velocity to scatter from the enemy position
            const angle = random(0, Math.PI * 2);
            const speed = random(1, 3);
            burstStar.vel.x = Math.cos(angle) * speed;
            burstStar.vel.y = Math.sin(angle) * speed;
        }
    }
    
    dropPowerup(x, y, type = null) {
        const powerup = this.powerupPool.get(x, y, type);
        if (powerup) {
            // Give it some random velocity
            const angle = random(0, Math.PI * 2);
            const speed = random(0.5, 1.5);
            powerup.vel.x = Math.cos(angle) * speed;
            powerup.vel.y = Math.sin(angle) * speed;
            console.log(`🎁 Powerup spawned: ${powerup.type} at (${Math.round(x)}, ${Math.round(y)})`);
        } else {
            console.log('❌ Failed to spawn powerup - pool issue');
        }
        return powerup;
    }
    
    collectPowerup(powerup) {
        if (!this.player || !this.player.active) return;
        
        // Add powerup to player's active powerups (stacking system)
        this.player.addPowerup(powerup.type, powerup.config);
        
        // Visual feedback
        this.particlePool.get(powerup.x, powerup.y, 'pickupPulse');
        for (let i = 0; i < 8; i++) {
            const particle = this.particlePool.get(powerup.x, powerup.y, 'starSparkle');
            if (particle) {
                particle.color = powerup.color;
                const angle = (i / 8) * Math.PI * 2;
                particle.vel.x = Math.cos(angle) * 2;
                particle.vel.y = Math.sin(angle) * 2;
            }
        }
        
        // Audio feedback - magical powerup sound
        this.audioManager.playPowerup();
        
        console.log(`🎁 Collected ${powerup.config.name}! Current stacks: ${this.player.getPowerupStacks(powerup.type)}`);
        
        // Display powerup name at top of screen
        this.showPowerupDisplay(powerup.config.name, powerup.powerupColor);
    }
    
    showPowerupDisplay(name, color) {
        this.powerupDisplay.active = true;
        this.powerupDisplay.text = name.toUpperCase();
        this.powerupDisplay.color = color;
        this.powerupDisplay.opacity = 1.0;
        this.powerupDisplay.fadeTimer = this.powerupDisplay.maxFadeTime;
    }
    
    drawPowerupDisplay() {
        if (!this.powerupDisplay.active) return;
        
        const ctx = this.ctx;
        ctx.save();
        
        // Position at top center, above wave number
        const centerX = this.width / 2;
        const topY = 60; // Above where wave number appears
        
        // Set font to Silkscreen with fallback
        ctx.font = "32px 'Silkscreen', 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Apply fade opacity
        ctx.globalAlpha = this.powerupDisplay.opacity;
        
        // Glow effect removed for performance
        
        // Draw text with outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.powerupDisplay.text, centerX, topY);
        
        // Draw main text
        ctx.fillStyle = this.powerupDisplay.color;
        ctx.fillText(this.powerupDisplay.text, centerX, topY);
        
        ctx.restore();
    }
    
    drawPowerupIndicators() {
        if (!this.player || !this.player.powerups || this.player.powerups.size === 0) return;
        
        const ctx = this.ctx;
        const margin = 20;
        const iconSize = 40;
        const spacing = 50;
        const bottomY = this.height - margin - iconSize;
        
        let index = 0;
        
        ctx.save();
        
        for (const [type, powerupData] of this.player.powerups.entries()) {
            const x = margin + index * spacing;
            const y = bottomY;
            
            // Draw background circle
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x + iconSize/2, y + iconSize/2, iconSize/2 + 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw powerup border with gradient
            const borderGradient = ctx.createRadialGradient(
                x + iconSize/2, y + iconSize/2, 0,
                x + iconSize/2, y + iconSize/2, iconSize/2
            );
            const gradientColors = powerupData.config.gradientColors || ['#ff0000', '#990000'];
            borderGradient.addColorStop(0, gradientColors[0]);
            borderGradient.addColorStop(1, gradientColors[1]);
            
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + iconSize/2, y + iconSize/2, iconSize/2, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw powerup icon with enhanced visibility
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.font = `bold ${iconSize * 0.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(powerupData.config.icon, x + iconSize/2, y + iconSize/2);
            ctx.fillText(powerupData.config.icon, x + iconSize/2, y + iconSize/2);
            
            // Draw stack count if > 1
            if (powerupData.stacks > 1) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${iconSize * 0.3}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeText(powerupData.stacks.toString(), x + iconSize - 8, y + iconSize - 8);
                ctx.fillText(powerupData.stacks.toString(), x + iconSize - 8, y + iconSize - 8);
            }
            
            // Draw timer bar (only for temporary powerups, not permanent shop items)
            if (powerupData.timeRemaining !== Infinity && powerupData.config.duration !== Infinity) {
            const timePercent = powerupData.timeRemaining / powerupData.config.duration;
                
                // Ensure timePercent is finite and valid
                if (isFinite(timePercent) && timePercent >= 0 && timePercent <= 1) {
            const barWidth = iconSize * 0.8;
            const barHeight = 4;
            const barX = x + (iconSize - barWidth) / 2;
            const barY = y + iconSize + 5;
            
            // Background bar
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
                    // Timer bar with gradient - ensure gradient coordinates are finite
                    const gradientEndX = barX + barWidth * timePercent;
                    if (isFinite(gradientEndX)) {
                        const timerGradient = ctx.createLinearGradient(barX, barY, gradientEndX, barY);
            if (timePercent > 0.3) {
                const gradientColors = powerupData.config.gradientColors || ['#ff0000', '#990000'];
                timerGradient.addColorStop(0, gradientColors[0]);
                timerGradient.addColorStop(1, gradientColors[1]);
            } else {
                timerGradient.addColorStop(0, '#ff9999');
                timerGradient.addColorStop(1, '#ff3333');
            }
            ctx.fillStyle = timerGradient;
            ctx.fillRect(barX, barY, barWidth * timePercent, barHeight);
                    }
                }
            }
            
            index++;
        }
        
        ctx.restore();
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
            if (!bullet.active || bullet.hasHit) continue; // Skip inactive/used bullets
            for (let j = this.asteroidPool.activeObjects.length - 1; j >= 0; j--) {
                const ast = this.asteroidPool.activeObjects[j];
                if (!ast.active) continue;
                if (collision(bullet, ast)) {
                    triggerHapticFeedback(60);
                    this.audioManager.playHit();
                    
                    // Damage the asteroid
                    ast.health -= 1;

                    // Impart momentum from bullet
                    const impulse = 0.05; // Adjust for desired push effect
                    ast.vel.x += bullet.vel.x * impulse;
                    ast.vel.y += bullet.vel.y * impulse;
                    
                    // Reduced explosion effects for performance
                    this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', ast.baseRadius * 0.5);
                    for (let p = 0; p < 3; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosion');
                        if (particle) {
                            particle.color = '#ff8800'; // Orange color
                            // Add random velocity for explosion effect
                            const angle = random(0, Math.PI * 2);
                            const speed = random(1, 4);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // No screen shake for asteroid hits
                    
                    if (ast.health <= 0) {
                        if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                            this.audioManager.playExplosion();
                            // Multiple fiery shockwave pulses for destruction
                            const pulseCount = 4;
                            for (let n = 0; n < pulseCount; n++) {
                                setTimeout(() => {
                                    this.particlePool.get(ast.x, ast.y, 'explosionPulse', ast.baseRadius * (1.2 + n * 0.5));
                                    this.particlePool.get(ast.x, ast.y, 'fieryExplosionRing', ast.baseRadius * (1.1 + n * 0.2));
                                }, n * 80);
                            }
                            for (let p = 0; p < 8; p++) {
                                this.particlePool.get(ast.x, ast.y, 'explosionRedOrange');
                            }
                            this.createDebris(ast);
                            this.createColorStarBurst(ast.x, ast.y);
                            // Chance to drop powerup (15% chance)
                            if (Math.random() < 0.15) {
                                this.dropPowerup(ast.x, ast.y);
                            }
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
                                // Chance to drop powerup from large asteroids (20% chance)
                                if (Math.random() < 0.2) {
                                    this.dropPowerup(ast.x, ast.y);
                                }
                            
                            const count = (Math.random() < 0.5 ? 2 : 3) + 1; // Now 3 or 4
                            const newR = ast.baseRadius / Math.sqrt(count);
                            const angleSlice = (2 * Math.PI) / count;
                                
                                for (let k = 0; k < count; k++) {
                                // Spawn fragments around the parent's center with jitter
                                const spawnX = ast.x + random(-ast.radius * 0.2, ast.radius * 0.2);
                                const spawnY = ast.y + random(-ast.radius * 0.2, ast.radius * 0.2);

                                const newAst = this.asteroidPool.get(spawnX, spawnY, newR, ast.level);
                                
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
                    // Handle bullet hit with powerup effects
                    if (bullet.explosive) {
                        bullet.explode(this);
                    }
                    bullet.onHit();
                    
                    // Only break if bullet is destroyed (no piercing left)
                    if (!bullet.active) {
                        break;
                    }
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
                    // Reduced debris particles for performance
                    const debrisCount = Math.floor(random(3, 6));
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
                    this.game.score += GAME_CONFIG.BURST_STAR_MONEY;
                    this.game.money += GAME_CONFIG.BURST_STAR_MONEY;
                    
                    // Heal player for collecting burst star (use player's effective healing amount)
                    const healAmount = this.player.getEffectiveBurstStarHealing();
                    const oldHealth = this.player.health;
                    this.player.health = Math.min(this.player.getEffectiveMaxHealth(), this.player.health + healAmount);
                    const actualHeal = this.player.health - oldHealth;
                    
                    if (actualHeal > 0) {
                        this.audioManager.playHealthRegen(); // Play healing sound
                        // Create green healing particle
                        const healParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
                        if (healParticle) {
                            healParticle.color = '#00ff00'; // Green for healing
                            healParticle.radius = 6;
                            healParticle.life = 0.6;
                        }
                    } else {
                        this.audioManager.playCoin(); // Normal sound if already at max health
                    }
                    
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
        
        // Player-powerup collisions
        for (let i = this.powerupPool.activeObjects.length - 1; i >= 0; i--) {
            const powerup = this.powerupPool.activeObjects[i];
            if (powerup.checkCollision(this.player)) {
                this.collectPowerup(powerup);
                this.powerupPool.release(powerup);
            }
        }
        
        // Player-enemy collisions
        this.enemyPool.activeObjects.forEach(enemy => {
            if (this.player.active && collision(this.player, enemy)) {
                this.handlePlayerEnemyCollision(this.player, enemy);
            }
        });
        
        // Bullet-enemy collisions
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active || bullet.hasHit) continue;
            
            for (let j = this.enemyPool.activeObjects.length - 1; j >= 0; j--) {
                const enemy = this.enemyPool.activeObjects[j];
                if (!enemy.active) continue;
                
                if (collision(bullet, enemy)) {
                    triggerHapticFeedback(40);
                    this.audioManager.playHit();
                    
                    // Mark bullet as having hit to prevent multiple damage
                    bullet.hasHit = true;
                    
                    // Damage the enemy
                    const destroyed = enemy.takeDamage(this.baseDamage);
                    
                    // Reduced explosion effects for performance
                    for (let p = 0; p < 4; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosion');
                        if (particle) {
                            particle.color = '#ff8800'; // Orange color
                            // Add random velocity for explosion effect
                            const angle = random(0, Math.PI * 2);
                            const speed = random(1, 4);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // Hit effects with enemy color for additional detail
                    for (let p = 0; p < 6; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'hit');
                        if (particle) {
                            particle.color = enemy.color; // Use enemy color for hit particles
                        }
                    }
                    
                    if (destroyed) {
                        // Award points
                        const reward = enemy.getDestructionReward();
                        this.game.score += reward.points;
                        this.game.money += reward.points;
                        
                        // Create colored explosion effects
                        this.createEnemyDebris(enemy);
                        
                        // Drop burst stars for health
                        for (let i = 0; i < GAME_CONFIG.BURST_STAR_DROP_COUNT; i++) {
                            this.createEnemyBurstStar(enemy.x, enemy.y);
                        }
                        
                        // Chance to drop powerup (higher chance for stronger enemies)
                        const powerupChance = enemy.type === 'WASP' ? 0.4 : 
                                            enemy.type === 'TITAN' ? 0.5 : 
                                            enemy.type === 'BOMBER' ? 0.45 : 0.25;
                        const roll = Math.random();
                        console.log(`🎲 Powerup roll for ${enemy.type}: ${roll.toFixed(3)} vs ${powerupChance}`);
                        if (roll < powerupChance) {
                            this.dropPowerup(enemy.x, enemy.y);
                        }
                        
                        console.log(`💥 ${reward.type} destroyed! +${reward.points} points`);
                        
                        this.enemyPool.release(enemy);
                    }
                    
                    // Handle bullet hit with powerup effects
                    if (bullet.explosive) {
                        bullet.explode(this);
                    }
                    bullet.onHit();
                    
                    // Only break if bullet is destroyed (no piercing left)
                    if (!bullet.active) {
                        break;
                    }
                }
            }
        }
        
        // Enemy bullet-player collisions
        this.enemyBulletPool.activeObjects.forEach(bullet => {
            if (bullet.active && this.player.active && bullet.checkCollision(this.player)) {
                this.handlePlayerEnemyBulletCollision(this.player, bullet);
                
                // Explode if it's an explosive bullet
                if (bullet.explosive) {
                    bullet.explode(this);
                }
                
                bullet.active = false;
            }
        });
        
        // Enemy bullet-asteroid collisions
        for (let i = this.enemyBulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.enemyBulletPool.activeObjects[i];
            if (!bullet.active) continue;
            
            for (let j = this.asteroidPool.activeObjects.length - 1; j >= 0; j--) {
                const ast = this.asteroidPool.activeObjects[j];
                if (!ast.active) continue;
                
                if (bullet.checkCollision(ast)) {
                    // Damage the asteroid
                    ast.health -= GAME_CONFIG.ENEMY_BULLET_ASTEROID_DAMAGE;
                    this.audioManager.playHit(); // Sound for impact
                    
                    // Impart momentum from enemy bullet
                    const impulse = 0.03; // Slightly less than player bullets
                    ast.vel.x += bullet.vel.x * impulse;
                    ast.vel.y += bullet.vel.y * impulse;
                    
                    // Handle asteroid destruction
                    if (ast.health <= 0) {
                        if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                            this.audioManager.playExplosion();
                            // Create destruction effects
                            this.createDebris(ast);
                            this.createColorStarBurst(ast.x, ast.y);
                            this.asteroidPool.release(ast);
                            this.triggerScreenShake(8, ast.baseRadius * 0.3, ast.baseRadius);
                        } else {
                            // Split larger asteroids
                            this.audioManager.playExplosion();
                            this.triggerScreenShake(12, ast.baseRadius * 0.4, ast.baseRadius);
                            
                            // Create 2-3 smaller asteroids
                            const numFragments = Math.floor(random(2, 4));
                            for (let f = 0; f < numFragments; f++) {
                                const fragment = this.asteroidPool.get();
                                if (fragment) {
                                    const newRadius = ast.baseRadius * random(0.4, 0.7);
                                    if (newRadius >= GAME_CONFIG.MIN_AST_RAD) {
                                        const angle = random(0, Math.PI * 2);
                                        const distance = ast.baseRadius * 0.8;
                                        fragment.initializeAsteroid(
                                            ast.x + Math.cos(angle) * distance,
                                            ast.y + Math.sin(angle) * distance,
                                            newRadius,
                                            ast.level
                                        );
                                        fragment.vel.x = Math.cos(angle) * random(1, 3);
                                        fragment.vel.y = Math.sin(angle) * random(1, 3);
                                    } else {
                                        this.asteroidPool.release(fragment);
                                    }
                                }
                            }
                            this.createDebris(ast);
                            this.asteroidPool.release(ast);
                        }
                    }
                    
                    // Create explosion particles with bullet color
                    for (let p = 0; p < 8; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosion');
                        if (particle) {
                            particle.color = bullet.color;
                            // Add random velocity for explosion effect
                            const angle = random(0, Math.PI * 2);
                            const speed = random(1, 3);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // Additional hit particles at impact point
                    for (let p = 0; p < 4; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'hit');
                        if (particle) {
                            particle.color = bullet.color;
                        }
                    }
                    
                    // Explode if it's an explosive bullet
                    if (bullet.explosive) {
                        bullet.explode(this);
                    }
                    
                    // Destroy the bullet
                    bullet.active = false;
                    break;
                }
            }
        }
        
        // Enemy-asteroid collisions
        this.enemyPool.activeObjects.forEach(enemy => {
            if (!enemy.active) return;
            
            this.asteroidPool.activeObjects.forEach(ast => {
                if (!ast.active) return;
                
                if (collision(enemy, ast)) {
                    this.handleEnemyAsteroidCollision(enemy, ast);
                }
            });
        });
    }
    
    handlePlayerEnemyCollision(player, enemy) {
        // Apply balanced damage with shield calculation and enemy level scaling
        const baseDamage = enemy.getLevelScaledDamage(25); // Level-scaled collision damage (scaled back down)
        const effectiveShield = player.getEffectiveShield();
        const reducedDamage = baseDamage * (1 - effectiveShield / 100);
        const finalDamage = Math.round(reducedDamage);
        player.health -= finalDamage;
        
        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.getEffectiveMaxHealth();
                this.audioManager.playCoin(); // Tank used sound
            } else {
                this.gameOver();
                return; // Exit early if game over
            }
        }
        
        // Visual feedback
        this.triggerScreenShake(18, 10, enemy.radius); // Strong screen shake for collision
        this.audioManager.playExplosion();
        
        // Show red damage number
        this.particlePool.get(player.x, player.y, 'damageNumber', finalDamage);
        
        // Create explosion particles at player position with enemy color
        for (let i = 0; i < 15; i++) {
            const particle = this.particlePool.get(player.x, player.y, 'explosion');
            if (particle) {
                particle.color = enemy.color;
                // Add random velocity for explosion effect
                const angle = random(0, Math.PI * 2);
                const speed = random(2, 6);
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Damage the enemy too (collision damage)
        const destroyed = enemy.takeDamage(2); // Reduced enemy collision damage
        
        if (destroyed) {
            const reward = enemy.getDestructionReward();
            this.game.score += reward.points / 2; // Reduced points for collision kill
            this.createEnemyDebris(enemy);
            // Drop burst stars for healing
            for (let i = 0; i < GAME_CONFIG.BURST_STAR_DROP_COUNT; i++) {
                this.createEnemyBurstStar(enemy.x, enemy.y);
            }
            this.enemyPool.release(enemy);
        }
        
        // Push player away
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            const pushForce = 5;
            player.vel.x += (dx / distance) * pushForce;
            player.vel.y += (dy / distance) * pushForce;
        }
        
        // Additional impact particles at collision point
        for (let i = 0; i < 8; i++) {
            const particle = this.particlePool.get((player.x + enemy.x) / 2, (player.y + enemy.y) / 2, 'hit');
            if (particle) {
                particle.color = enemy.color;
            }
        }
        
        // Make player invulnerable briefly
        player.makeInvincible(1500);
    }
    
    handlePlayerEnemyBulletCollision(player, bullet) {
        // Apply balanced damage with shield calculation
        const baseDamage = bullet.damage || 15; // Default 15 damage for enemy bullets (scaled back down)
        const effectiveShield = player.getEffectiveShield();
        const reducedDamage = baseDamage * (1 - effectiveShield / 100);
        const finalDamage = Math.round(reducedDamage);
        player.health -= finalDamage;
        
        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.getEffectiveMaxHealth();
                this.audioManager.playCoin(); // Tank used sound
            } else {
                this.gameOver();
                return; // Exit early if game over
            }
        }
        
        // Visual feedback
        this.triggerScreenShake(12, 6, bullet.radius); // Increased screen shake
        this.audioManager.playHit();
        
        // Show red damage number
        this.particlePool.get(player.x, player.y, 'damageNumber', finalDamage);
        
        // Create explosion particles at player position with bullet color
        for (let i = 0; i < 12; i++) {
            const particle = this.particlePool.get(player.x, player.y, 'explosion');
            if (particle) {
                particle.color = bullet.color;
                // Add some random velocity for explosion effect
                const angle = random(0, Math.PI * 2);
                const speed = random(1, 4);
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Additional hit particles at bullet impact point
        for (let i = 0; i < 5; i++) {
            const particle = this.particlePool.get(bullet.x, bullet.y, 'hit');
            if (particle) {
                particle.color = bullet.color;
            }
        }
        
        // Make player invulnerable briefly
        player.makeInvincible(1000);
    }
    
    handleEnemyAsteroidCollision(enemy, asteroid) {
        // No damage to enemy - just momentum transfer and bouncing
        
        // Calculate collision direction
        const dx = enemy.x - asteroid.x;
        const dy = enemy.y - asteroid.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Push enemy away from asteroid
            const enemyPushForce = 4;
            enemy.vel.x += (dx / distance) * enemyPushForce;
            enemy.vel.y += (dy / distance) * enemyPushForce;
            
            // Impart momentum to asteroid (like bullet impact)
            const asteroidPushForce = 2;
            asteroid.vel.x += enemy.vel.x * 0.3; // Transfer some of enemy's momentum
            asteroid.vel.y += enemy.vel.y * 0.3;
            asteroid.vel.x -= (dx / distance) * asteroidPushForce;
            asteroid.vel.y -= (dy / distance) * asteroidPushForce;
            
            // Add rotation to asteroid from collision
            const rotationForce = random(-0.02, 0.02);
            if (asteroid.rotationSpeed !== undefined) {
                asteroid.rotationSpeed += rotationForce;
            }
        }
        
        // Light visual feedback (no damage, just bump)
        this.triggerScreenShake(4, 2, enemy.radius);
        this.audioManager.playHit(); // Lighter sound than explosion
        
        // Create small impact particles
        for (let i = 0; i < 3; i++) {
            const particle = this.particlePool.get((enemy.x + asteroid.x) / 2, (enemy.y + asteroid.y) / 2, 'hit');
            if (particle) {
                particle.color = enemy.color;
                particle.life = 0.3; // Shorter lived particles
            }
        }
        
        // No enemy destruction from asteroid collisions
    }
    
    update() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            const input = this.inputHandler.getInput();

            // Always allow normal player movement
            const tractorEngaged = !input.up && !input.down && !input.left && !input.right && !input.fire;
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.colorStarPool, tractorEngaged);
            this.bulletPool.activeObjects.forEach(bullet => 
                bullet.update(this.particlePool, this.asteroidPool, this.enemyPool));
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.powerupPool.activeObjects.forEach(p => p.update(this.player));
            this.asteroidPool.updateActive();
            
            // Update enemies and enemy bullets
            this.updateWaves();
            this.enemyPool.activeObjects.forEach(enemy => enemy.update(this.player, this));
            this.enemyBulletPool.updateActive();
            
            // Update color stars with player position and tractor beam state
            this.colorStarPool.activeObjects.forEach(s => s.update(this.player.vel, this.player, tractorEngaged));
            // Update background stars with just player velocity for parallax
            this.backgroundStarPool.activeObjects.forEach(s => s.update(this.player.vel));
            
            this.handleCollisions();
            
            // Update powerup display fade
            if (this.powerupDisplay.active) {
                this.powerupDisplay.fadeTimer--;
                if (this.powerupDisplay.fadeTimer <= 0) {
                    this.powerupDisplay.active = false;
                } else {
                    // Smooth fade out
                    this.powerupDisplay.opacity = this.powerupDisplay.fadeTimer / this.powerupDisplay.maxFadeTime;
                }
            }

            // Performance: Clean up inactive particles periodically
            if (this.game.score % GAME_CONFIG.PARTICLE_CLEANUP_INTERVAL === 0) {
                this.particlePool.cleanupInactive();
                this.lineDebrisPool.cleanupInactive();
                this.powerupPool.cleanupInactive();
            }
            
            // Note: Wave completion now handled by enhanced wave system in updateWaves()
            // Old asteroid-only trigger removed to prevent conflicts
            
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
            // Depth-based batched starfield rendering for optimal performance
            depthBatchRenderer.groupStarsByDepth(
                this.backgroundStarPool.activeObjects, 
                this.colorStarPool.activeObjects
            );
            depthBatchRenderer.renderDepthBatches(this.ctx);
            
            // Render complex color stars that need special effects (not batched)
            this.colorStarPool.activeObjects.forEach(star => {
                if (star.active && (star.isBurst || star.shape === 'sparkle' || star.shape === 'burst')) {
                    star.draw(this.ctx); // Complex stars use their full draw method
                }
            });
            
            // Regular rendering for other game objects
            this.lineDebrisPool.drawActive(this.ctx);
            this.particlePool.drawActive(this.ctx);
            this.powerupPool.drawActive(this.ctx);
            this.asteroidPool.drawActive(this.ctx);
            this.enemyPool.drawActive(this.ctx);
            this.enemyBulletPool.drawActive(this.ctx);
            this.bulletPool.drawActive(this.ctx, this);
            this.player.draw(this.ctx);
            
            // Draw powerup indicators
            this.drawPowerupIndicators();
            
            // Draw powerup display at top
            this.drawPowerupDisplay();
            
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
        
        if (this.game.state === GAME_STATES.SHOP) {
            this.drawShop();
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    togglePause() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.PAUSED;
            this.uiManager.togglePause();
            // Removed thruster sound on pause to reduce noise issues
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
            colorStars: this.colorStarPool.activeObjects.length
        };
        
        return stats;
    }
    
    // Debug method - call from console: gameEngine.debugStarfieldPerformance()
    debugStarfieldPerformance() {
        const stats = this.getStarfieldStats();
        const batchStats = depthBatchRenderer.getStats();
        
        return {
            mode: 'depth-batching',
            totalStars: stats.totalStars,
            backgroundStars: stats.backgroundStars,
            colorStars: stats.colorStars,
            depthBuckets: batchStats.depthBuckets,
            batchedStars: batchStats.totalStars,
            frameCount: batchStats.frameCount,
            efficiency: batchStats.depthBuckets <= 5 ? 'excellent' : 
                       batchStats.depthBuckets <= 10 ? 'good' : 'needs optimization'
        };
    }
    
    // Debug method to show live depth batching performance
    showDepthBatchStats() {
        const batchStats = depthBatchRenderer.getStats();
        const totalStars = this.backgroundStarPool.activeObjects.length + this.colorStarPool.activeObjects.length;
        
        return {
            mode: 'depth-batching',
            activeBuckets: batchStats.depthBuckets,
            batchedStars: batchStats.totalStars,
            totalStars: totalStars,
            framesProcessed: batchStats.frameCount,
            efficiency: batchStats.depthBuckets <= 5 ? 'excellent' : 
                       batchStats.depthBuckets <= 10 ? 'good' : 'needs optimization',
            avgStarsPerBucket: batchStats.depthBuckets > 0 ? Math.round(batchStats.totalStars / batchStats.depthBuckets) : 0
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
                    targetRadius += GAME_CONFIG.BURST_STAR_COLLECTION_RADIUS; // Match the enhanced collection radius
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

        // Apply shield damage reduction (including powerup boosts)
        const effectiveShield = this.player.getEffectiveShield();
        const reducedDamage = damageAmount * (1 - effectiveShield / 100);
        this.player.health -= reducedDamage;

        if (this.player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                this.player.health = this.player.getEffectiveMaxHealth();
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

        // Outer glow effect removed for performance
        
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
        
        // Shadow effects removed for performance

        // Calculate health percentage using effective max health
        const effectiveMaxHealth = this.player.getEffectiveMaxHealth();
        const healthPercentage = this.player.health / effectiveMaxHealth;
        const filledWidth = barWidth * healthPercentage;
        
        // Add warning glow effect for low health
        if (healthPercentage <= 0.3) {
            ctx.save();
            // Static red glow for low health warning (performance optimized)
            
            // Draw warning glow around the entire health bar area
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)'; // Fixed opacity instead of undefined pulseIntensity
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
        const textHealthPercentage = this.player.health / effectiveMaxHealth;
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
        
        const hpText = `${Math.round(this.player.health)}/${effectiveMaxHealth}`;
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
        
        const effectiveShield = Math.round(this.player.getEffectiveShield());
        const shieldText = `${effectiveShield}`;
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
            
            // Damage calculation: 10-20 base range based on size and speed (scaled back down)
            const sizeDamage = 10 + (sizeRatio * 6); // 10-16 damage from size
            const speedDamage = speedRatio * 4; // 0-4 additional damage from speed
            const baseDamage = sizeDamage + speedDamage; // 10-20 base damage range
            
            // Apply level scaling to damage
            const totalDamage = asteroid.getLevelScaledCollisionDamage(baseDamage);
            
                    // Apply shield damage reduction and round to integer (including powerup boosts)
        const effectiveShield = this.player.getEffectiveShield();
        const reducedDamage = totalDamage * (1 - effectiveShield / 100);
            const finalDamage = Math.round(reducedDamage);
            
            // Apply the calculated damage
            this.player.health -= finalDamage;

            // Handle death/shield tank usage
            if (this.player.health <= 0) {
                if (this.shieldTanks > 0) {
                    this.shieldTanks--;
                    this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                    this.player.health = this.player.getEffectiveMaxHealth();
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