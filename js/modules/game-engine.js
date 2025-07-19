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
        this.enemyPool = new PoolManager(Enemy, 15);
        this.enemyBulletPool = new PoolManager(EnemyBullet, 50);
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
        
        // Reset enhanced wave state
        this.waveTimer = 0;
        this.lastEnemySpawn = 0;
        this.waveInProgress = false;
        this.currentSubWave = 0;
        this.subWaveTimer = 0;
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
        
        // Generate all color stars at once using generative method
        this.generateInitialColorStars();
        this.generateBackgroundStars();
        
        // Initialize first wave with enhanced wave system
        this.game.currentWave = 1;
        this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 1500);
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
        this.uiManager.showMessage(`WAVE ${this.game.currentWave + 1}`, '', 1500);
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // Reset player state at wave start
        this.playerState = PLAYER_STATES.NORMAL;
        
        // Restore player health to full between waves
        this.player.health = this.player.maxHealth;
        
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
    
    // Enhanced wave management with sub-waves
    updateWaves() {
        if (this.game.state !== GAME_STATES.PLAYING) return;
        
        const now = Date.now();
        
        // Check if current wave is complete (all enemies AND asteroids eliminated)
        if (this.waveInProgress && 
            this.enemyPool.activeObjects.length === 0 && 
            this.asteroidPool.activeObjects.length === 0 &&
            this.currentSubWave >= GAME_CONFIG.SUB_WAVES_PER_WAVE &&
            this.enemiesRemainingInSubWave <= 0) {
            
            this.completeWave();
            return;
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
                    // Check if current sub-wave is complete
                    if (this.enemiesRemainingInSubWave <= 0 && 
                        now - this.subWaveTimer > GAME_CONFIG.SUB_WAVE_INTERVAL) {
                        this.currentSubWave++;
                        if (this.currentSubWave < GAME_CONFIG.SUB_WAVES_PER_WAVE) {
                            this.startEnemySubWave();
                        }
                    }
                    
                    // Spawn enemies in current sub-wave
                    if (this.enemiesRemainingInSubWave > 0 && 
                        now - this.lastEnemySpawn > 800) { // Faster spawning within sub-waves
                        this.spawnRandomEnemy();
                        this.enemiesRemainingInSubWave--;
                        this.lastEnemySpawn = now;
                    }
                }
                break;
        }
    }
    
    completeWave() {
        this.waveInProgress = false;
        this.game.currentWave++;
        this.waveTimer = Date.now() + 3000; // 3 second break between waves
        this.wavePhase = 'waiting';
        
        console.log(`✅ Wave ${this.game.currentWave} complete! Next wave in 3 seconds...`);
    }
    
    startNewWave() {
        this.waveInProgress = true;
        this.wavePhase = 'asteroids';
        this.wavePhaseTimer = Date.now();
        this.currentSubWave = 0;
        this.enemiesRemainingInSubWave = 0;
        
        // Spawn asteroids first
        this.spawnWaveAsteroids();
        
        console.log(`🚨 Wave ${this.game.currentWave} starting!`);
        console.log(`🪨 Spawning asteroids first...`);
        console.log(`👾 ${GAME_CONFIG.SUB_WAVES_PER_WAVE} enemy sub-waves incoming!`);
    }
    
    spawnWaveAsteroids() {
        const numAsteroids = GAME_CONFIG.INITIAL_AST_COUNT + Math.floor(this.game.currentWave / 2);
        
        for (let i = 0; i < numAsteroids; i++) {
            setTimeout(() => {
                const asteroid = this.asteroidPool.get();
                if (asteroid) {
                    this.initializeWaveAsteroid(asteroid);
                }
            }, i * 200); // Stagger asteroid spawning
        }
    }
    
    startEnemySubWave() {
        this.enemiesRemainingInSubWave = GAME_CONFIG.ENEMIES_PER_SUB_WAVE + 
                                        Math.floor(this.game.currentWave / 3); // Scale with wave
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
        
        asteroid.initializeAsteroid(x, y, r);
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
        
        const enemy = this.enemyPool.get(x, y, enemyType);
        if (enemy) {
            console.log(`👾 ${enemyType} spawned at wave ${this.game.currentWave}`);
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
                    triggerHapticFeedback(60);
                    this.audioManager.playHit();
                    
                    // Damage the asteroid
                    ast.health -= 1;

                    // Impart momentum from bullet
                    const impulse = 0.05; // Adjust for desired push effect
                    ast.vel.x += bullet.vel.x * impulse;
                    ast.vel.y += bullet.vel.y * impulse;
                    
                    // Orange explosion effects for player bullets
                    this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', ast.baseRadius * 0.5);
                    for (let p = 0; p < 10; p++) {
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
                    for (let p = 0; p < 7; p++) {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionRedOrange');
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
                    this.game.score += GAME_CONFIG.BURST_STAR_MONEY;
                    this.game.money += GAME_CONFIG.BURST_STAR_MONEY;
                    
                    // Heal player for collecting burst star
                    const healAmount = GAME_CONFIG.BURST_STAR_HEAL_AMOUNT;
                    const oldHealth = this.player.health;
                    this.player.health = Math.min(this.player.maxHealth, this.player.health + healAmount);
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
        
        // Player-enemy collisions
        this.enemyPool.activeObjects.forEach(enemy => {
            if (this.player.active && collision(this.player, enemy)) {
                this.handlePlayerEnemyCollision(this.player, enemy);
            }
        });
        
        // Bullet-enemy collisions
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active || bullet.dying || bullet.hasHit) continue;
            
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
                    
                    // Orange explosion effects for player bullets
                    for (let p = 0; p < 12; p++) {
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
                        
                        console.log(`💥 ${reward.type} destroyed! +${reward.points} points`);
                        
                        this.enemyPool.release(enemy);
                    }
                    
                    bullet.startDying(bullet.x, bullet.y);
                    break;
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
                                            newRadius
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
        // Damage player
        const damage = 5; // Reduced collision damage
        player.health -= damage;
        
        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.maxHealth;
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
        this.particlePool.get(player.x, player.y, 'damageNumber', damage);
        
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
        // Damage player
        player.health -= bullet.damage;
        
        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.maxHealth;
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
        this.particlePool.get(player.x, player.y, 'damageNumber', bullet.damage);
        
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
            this.bulletPool.updateActive(this.particlePool, this.asteroidPool);
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
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
            this.asteroidPool.drawActive(this.ctx);
            this.enemyPool.drawActive(this.ctx);
            this.enemyBulletPool.drawActive(this.ctx);
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