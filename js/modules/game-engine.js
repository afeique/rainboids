// Main game engine and state management
import { GAME_CONFIG, GAME_STATES, getEnemyFiringCooldown } from './constants.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, getLevelScaledEnemyStats, getLevelScaledAsteroidStats } from './wave-data.js';
import { random, collision, starCollision, triggerHapticFeedback, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon, glowSpriteCache } from './utils.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { SpatialGrid } from './performance/spatial-grid.js';
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

const _charWidthCache = new Map();

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
        
        // Set game engine reference in input handler for coordinate transformation
        this.inputHandler.gameEngine = this;
        
        // Make game engine globally accessible for entities
        window.gameEngine = this;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Initialize game state properties
        this.initializeGameState();
        
        // Initialize input handler aim coordinates to center of game field
        this.inputHandler.input.aimX = this.gameField.width / 2;
        this.inputHandler.input.aimY = this.gameField.height / 2;
        
        // Hide DOM title screen so we only see the wavy canvas version
        // this.uiManager.hideTitleScreen();
        
        this.initializePools();
        this.setupEventListeners();
        this.playerCanFire = true;
        this.previousFire = false;
        this.baseDamage = 1; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();
        
        // Bulletproof continuous spawning system
        this.spawnInterval = 5000; // Spawn something every 5 seconds
        this.lastSpawnTime = 0; // Track last spawn
        this.gameStartTime = Date.now();
        this.forceSpawnEnabled = false; // Disabled - wave-based spawning only
        
        // BACKUP SPAWNING SYSTEM - independent emergency spawner
        this.emergencySpawnInterval = 5000; // Emergency spawn every 5 seconds
        this.lastEmergencySpawn = 0;
        
        // Ghost preview positions (stored to prevent flickering)
        this.ghostEnemyPosition = this.generateGhostPosition();
        this.ghostAsteroidPosition = this.generateGhostPosition();
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
            money: 0,
            survivalTime: 0, // Time survived in milliseconds
            survivalRecord: parseInt(localStorage.getItem('rainboidsSurvivalRecord')) || 0, // Best survival time
            gameStartTime: 0, // When the current game started
            currentWave: 0,
            lives: 3, // Start with 3 lives
            state: GAME_STATES.TITLE_SCREEN,
            lastState: GAME_STATES.TITLE_SCREEN,
            screenShakeDuration: 0,
            screenShakeMagnitude: 0,
            enemyLevel: 1,    // Enemy level increases each wave
            asteroidLevel: 1,  // Asteroid level increases each wave
            waveComplete: false,
            waveCountdownTime: 0,
            waveCountdownDuration: 5000, // 5 seconds between waves
            respawning: false,
            respawnStartTime: 0,
            respawnDuration: 5000 // 5 seconds respawn sequence
        };
        
        // Initialize cursor system
        this.cursor = {
            isOverTarget: false,
            x: 0,
            y: 0,
            hoveredEntity: null
        };
        
        // Targeted entity system (click-based targeting)
        this.targetedEntity = null;
        
        // Target info display system
        this.targetInfo = {
            active: false,
            target: null,
            displayTime: 0,
            maxDisplayTime: 3000 // 3 seconds
        };
        
        // Money pickup display system
        this.moneyPickupDisplay = {
            amount: 0,
            displayTime: 0,
            maxDisplayTime: 3000, // 3 seconds
            fadeStartTime: 2000 // Start fading after 2 seconds
        };
        
        // Damage numbers system
        this.damageNumbers = [];
        
        // Initialize wave message system
        this.waveMessage = {
            active: false,
            startTime: 0,
            duration: 0,
            title: '',
            subtitle: ''
        };

        // Pause button hit rect (top-right corner, updated each frame by drawPauseButton)
        const btnSize = 44;
        const margin = 16;
        this.pauseButtonRect = {
            x: window.innerWidth - margin - btnSize,
            y: margin,
            w: btnSize,
            h: btnSize
        };
        
        // Camera and game field system
        this.gameField = {
            width: 1920,  // 1080p width for better performance
            height: 1080  // 1080p height for better performance
        };
        
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            smoothing: 0.1 // Camera smoothing factor
        };
        
        // Initialize cheat flags
        this.cheats = {
            onePunchMan: false,    // Player destroys everything with one hit
        };

        // Powerup HUD DOM ref cache
        this._powerupHudCache = new Map();

        // Shop filtered items cache
        this.shopFilteredItems = [];

        // Expose cheat functions globally (case insensitive)
        this.setupCheatCodes();

    }
    
    setupCheatCodes() {
        // Display available keyboard cheats
        console.log(`
  CHEAT CODES (keyboard, during gameplay):
  SHIFT+1  – spawn HUNTER
  SHIFT+2  – spawn GUARDIAN
  SHIFT+3  – spawn WASP
  SHIFT+4  – spawn TITAN
  SHIFT+5  – spawn STALKER
  SHIFT+6  – spawn TANGERINE
  SHIFT+7  – spawn DRIFTER
  SHIFT+8  – spawn PROWLER
  SHIFT+9  – toggle one-hit kill (ONE PUNCH MAN)
  SHIFT+-  – add 100,000 coins (FREE WILLY)
  SHIFT+0  – add 100 SP

  DROP POWERUPS (Shift+letter):
  SHIFT+Q  – Rapid Fire      ⚡
  SHIFT+W  – Multi-Shot      ✳️
  SHIFT+E  – Homing Bullets  🎯
  SHIFT+R  – Big Bullets     🔵
  SHIFT+T  – Speed Boost     💨
  SHIFT+Y  – Piercing Shots  🏹
  SHIFT+U  – Spread Shot     📐
  SHIFT+I  – Explosive       💣
  SHIFT+O  – Crit Chance     ⭐
  SHIFT+P  – Crit Damage     🗡️
  SHIFT+A  – Shield Boost    🛡
  SHIFT+S  – Medpack         💊
  SHIFT+D  – Charge Shot     🔮`);
    }
    
    initializePools() {
        this.player = new Player();
        // Position player at center of game field
        this.player.x = this.gameField.width / 2;
        this.player.y = this.gameField.height / 2;
        
        this.bulletPool = new PoolManager(Bullet, 10);     // Reduced from 20  
        this.particlePool = new PoolManager(Particle, 32); // Cap is MAX_PARTICLES=30
        this.lineDebrisPool = new PoolManager(LineDebris, 20); // Reduced from 100
        this.asteroidPool = new PoolManager(Asteroid, 5);  // Reduced from 20
        this.enemyPool = new PoolManager(Enemy, 5);        // Reduced from 15
        this.enemyBulletPool = new PoolManager(EnemyBullet, 20); // Reduced from 50
        this.colorStarPool = new PoolManager(ColorStar, GAME_CONFIG.COLOR_STAR_COUNT + 10);
        this.backgroundStarPool = new PoolManager(BackgroundStar, GAME_CONFIG.BACKGROUND_STAR_COUNT * 4);
        this.powerupPool = new PoolManager(Powerup, 5); // Reduced from 20

        // OPT-8: Spatial grid for O(1) insert / O(k) collision query
        this.spatialGrid = new SpatialGrid(this.gameField.width, this.gameField.height, 8, 6);

        // OPT-7: Temporal upsampling — 30fps logic, 60fps render with interpolation.
        // Halves the cost of all game logic (collision, movement, AI, physics).
        this.useTemporalUpsampling = true;
        this.logicTickRate = 1000 / 30;        // 30 Hz fixed timestep
        this.logicAccumulator = 0;
        this.maxLogicStepsPerFrame = 3;         // spiral-of-death guard
        this.lastFrameTime = performance.now();

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
        // Cursor hover detection is handled by input-handler.js using world coordinates
        
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
            }
            // Debug cheat codes (Shift+key, gameplay only)
            if (e.shiftKey && this.game.state === GAME_STATES.PLAYING) {
                // Shift+1–8: spawn individual enemy ship types
                const debugEnemyTypes = ['HUNTER','GUARDIAN','WASP','TITAN','STALKER','TANGERINE','DRIFTER','PROWLER'];
                const shipKeyMap = {'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7};
                if (shipKeyMap[e.code] !== undefined) {
                    const type = debugEnemyTypes[shipKeyMap[e.code]];
                    this.spawnLeveledEnemies(type, 1);
                    this.uiManager.showMessage('CHEAT', `Spawned ${type}`, 1500);
                }
                // Shift+9: toggle one-hit kill
                if (e.code === 'Digit9') {
                    this.cheats.onePunchMan = !this.cheats.onePunchMan;
                    const status = this.cheats.onePunchMan ? 'ON' : 'OFF';
                    this.uiManager.showMessage('ONE PUNCH MAN', `One-hit kills ${status}`, 2000);
                }
                // Shift+-: add 100,000 coins
                if (e.code === 'Minus') {
                    this.game.money += 100000;
                    this.uiManager.showMessage('FREE WILLY', '+100,000 Coins!', 2000);
                }
                // Shift+0: add 100 SP
                if (e.code === 'Digit0') {
                    this.player.skillPoints += 100;
                    this.uiManager.showMessage('CHEAT', '+100 SP', 1500);
                }
                // Shift+letter: drop specific powerup near player
                const powerupKeyMap = {
                    'KeyQ': 'RAPID_FIRE',
                    'KeyW': 'MULTI_SHOT',
                    'KeyE': 'HOMING',
                    'KeyR': 'BIG_BULLETS',
                    'KeyT': 'SPEED_BOOST',
                    'KeyY': 'PIERCING',
                    'KeyU': 'SPREAD_SHOT',
                    'KeyI': 'EXPLOSIVE',
                    'KeyO': 'CRIT_CHANCE',
                    'KeyP': 'CRIT_DAMAGE',
                    'KeyA': 'SHIELD_BOOST',
                    'KeyS': 'MEDPACK',
                    'KeyD': 'CHARGE_SHOT',
                };
                if (powerupKeyMap[e.code] && this.player) {
                    const type = powerupKeyMap[e.code];
                    const offsetX = random(-40, 40);
                    const offsetY = random(-40, 40);
                    this.dropPowerup(this.player.x + offsetX, this.player.y + offsetY, type);
                    this.uiManager.showMessage('CHEAT', `Dropped ${type.replace(/_/g, ' ')}`, 1500);
                }
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
        }, { passive: true });
        
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Enter' && this.game.state === GAME_STATES.GAME_OVER) {
                this.init();
            }
            if (e.code === 'Space' && this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                this.closeShop();
            }
        });
        
        // Auto-pause when window loses focus
        window.addEventListener('blur', () => {
            // Only auto-pause if currently playing (not already paused, in shop, etc.)
            if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.togglePause();
            }
        });
        
        // Optional: Resume when window regains focus (commented out to avoid accidental resume)
        // window.addEventListener('focus', () => {
        //     // Could auto-resume here, but might be annoying for users
        //     // if (this.game.state === GAME_STATES.PAUSED) {
        //     //     this.togglePause();
        //     // }
        // });
        
        // Entity targeting click handling (for gameplay)
        this.canvas.addEventListener('click', (e) => {
            if (this.game.state === GAME_STATES.PLAYING) {
                e.preventDefault();
                e.stopPropagation();
                
                const rect = this.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                
                // Convert screen coordinates to world coordinates
                const worldX = clickX + this.camera.x;
                const worldY = clickY + this.camera.y;
                
                this.handleEntityTargeting(worldX, worldY);
                return;
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
                        this.closeShop();
                        return;
                    }
                }
                
                // Check for close button click
                if (this.shopCloseBounds &&
                    clickX >= this.shopCloseBounds.x &&
                    clickX <= this.shopCloseBounds.x + this.shopCloseBounds.width &&
                    clickY >= this.shopCloseBounds.y &&
                    clickY <= this.shopCloseBounds.y + this.shopCloseBounds.height) {
                    this.closeShopToPause();
                    return;
                }

                // Check for tab clicks first
                if (this.shopTabBounds) {
                    // Check OFFENSE tab
                    if (clickX >= this.shopTabBounds.offense.x && 
                        clickX <= this.shopTabBounds.offense.x + this.shopTabBounds.offense.width &&
                        clickY >= this.shopTabBounds.offense.y && 
                        clickY <= this.shopTabBounds.offense.y + this.shopTabBounds.offense.height) {
                        this.shopCategory = 'OFFENSE';
                        this.shopScrollOffset = 0; // Reset scroll when switching tabs
                        this._rebuildShopCache();
                        return;
                    }
                    
                    // Check DEFENSE tab
                    if (clickX >= this.shopTabBounds.defense.x && 
                        clickX <= this.shopTabBounds.defense.x + this.shopTabBounds.defense.width &&
                        clickY >= this.shopTabBounds.defense.y && 
                        clickY <= this.shopTabBounds.defense.y + this.shopTabBounds.defense.height) {
                        this.shopCategory = 'DEFENSE';
                        this.shopScrollOffset = 0; // Reset scroll when switching tabs
                        this._rebuildShopCache();
                        return;
                    }
                }
                
                // Check for scrollbar interactions
                if (this.shopScrollbarBounds) {
                    // Check up arrow
                    if (clickX >= this.shopScrollbarBounds.upArrow.x && 
                        clickX <= this.shopScrollbarBounds.upArrow.x + this.shopScrollbarBounds.upArrow.width &&
                        clickY >= this.shopScrollbarBounds.upArrow.y && 
                        clickY <= this.shopScrollbarBounds.upArrow.y + this.shopScrollbarBounds.upArrow.height) {
                        this.shopScrollOffset = Math.max(0, this.shopScrollOffset - 40);
                        return;
                    }
                    
                    // Check down arrow
                    if (clickX >= this.shopScrollbarBounds.downArrow.x && 
                        clickX <= this.shopScrollbarBounds.downArrow.x + this.shopScrollbarBounds.downArrow.width &&
                        clickY >= this.shopScrollbarBounds.downArrow.y && 
                        clickY <= this.shopScrollbarBounds.downArrow.y + this.shopScrollbarBounds.downArrow.height) {
                        // Calculate max scroll based on content
                        const filteredItems = this.shopFilteredItems;
                        const itemsPerRow = 2;
                        const rows = Math.ceil(filteredItems.length / itemsPerRow);
                        const itemHeight = 120;
                        const totalContentHeight = rows * (itemHeight + 10);
                        const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));
                        
                        this.shopScrollOffset = Math.min(maxScroll, this.shopScrollOffset + 40);
                        return;
                    }
                    
                    // Check thumb drag start
                    if (clickX >= this.shopScrollbarBounds.x && 
                        clickX <= this.shopScrollbarBounds.x + this.shopScrollbarBounds.width &&
                        clickY >= this.shopScrollbarBounds.thumbY && 
                        clickY <= this.shopScrollbarBounds.thumbY + this.shopScrollbarBounds.thumbHeight) {
                        this.shopScrollThumbDrag = true;
                        this.shopScrollDragStartY = clickY;
                        this.shopScrollDragStartOffset = this.shopScrollOffset;
                        return;
                    }
                    
                    // Check track click (jump to position)
                    if (clickX >= this.shopScrollbarBounds.x && 
                        clickX <= this.shopScrollbarBounds.x + this.shopScrollbarBounds.width &&
                        clickY >= this.shopScrollbarBounds.trackY && 
                        clickY <= this.shopScrollbarBounds.trackY + this.shopScrollbarBounds.trackHeight) {
                        // Calculate max scroll
                        const filteredItems = this.shopFilteredItems;
                        const itemsPerRow = 2;
                        const rows = Math.ceil(filteredItems.length / itemsPerRow);
                        const itemHeight = 120;
                        const totalContentHeight = rows * (itemHeight + 10);
                        const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));
                        
                        // Jump to clicked position
                        const clickRatio = (clickY - this.shopScrollbarBounds.trackY) / this.shopScrollbarBounds.trackHeight;
                        this.shopScrollOffset = Math.max(0, Math.min(maxScroll, clickRatio * maxScroll));
                        return;
                    }
                }
                
                // Check for sell button clicks before buy clicks
                if (this.shopSellButtonBounds) {
                    for (const sb of this.shopSellButtonBounds) {
                        if (clickX >= sb.x && clickX <= sb.x + sb.w &&
                            clickY >= sb.y && clickY <= sb.y + sb.h) {
                            this.sellShopItem(sb.itemId);
                            return;
                        }
                    }
                }

                // Check for item clicks
                if (this.shopItemBounds) {
                    for (const bound of this.shopItemBounds) {
                        if (clickX >= bound.x && clickX <= bound.x + bound.width &&
                            clickY >= bound.y && clickY <= bound.y + bound.height) {
                            const success = this.buyShopItem(bound.item.id);
                            if (success) {
                            }
                            break;
                        }
                    }
                }
            }
        });
        
        // Mouse move tracking for hover effects and cursor
        this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouseX = e.clientX - rect.left;
                this.mouseY = e.clientY - rect.top;
                
                // Update cursor position for canvas rendering
                this.cursor.x = this.mouseX;
                this.cursor.y = this.mouseY;
                
                // Handle scrollbar dragging
                if (this.shopScrollThumbDrag && this.game.state === GAME_STATES.SHOP) {
                    const dragDelta = this.mouseY - this.shopScrollDragStartY;
                    const filteredItems = this.shopFilteredItems;
                    const itemsPerRow = 2;
                    const rows = Math.ceil(filteredItems.length / itemsPerRow);
                    const itemHeight = 120;
                    const totalContentHeight = rows * (itemHeight + 10);
                    const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));
                    
                    if (maxScroll > 0 && this.shopScrollbarBounds) {
                        const scrollRatio = dragDelta / this.shopScrollbarBounds.trackHeight;
                        const newOffset = this.shopScrollDragStartOffset + (scrollRatio * maxScroll);
                        this.shopScrollOffset = Math.max(0, Math.min(maxScroll, newOffset));
                    }
                }
                
                // Update hover states for scrollbar arrows
                if (this.game.state === GAME_STATES.SHOP && this.shopScrollbarBounds) {
                    this.shopScrollUpHover = this.mouseX >= this.shopScrollbarBounds.upArrow.x && 
                                           this.mouseX <= this.shopScrollbarBounds.upArrow.x + this.shopScrollbarBounds.upArrow.width &&
                                           this.mouseY >= this.shopScrollbarBounds.upArrow.y && 
                                           this.mouseY <= this.shopScrollbarBounds.upArrow.y + this.shopScrollbarBounds.upArrow.height;
                    
                    this.shopScrollDownHover = this.mouseX >= this.shopScrollbarBounds.downArrow.x && 
                                             this.mouseX <= this.shopScrollbarBounds.downArrow.x + this.shopScrollbarBounds.downArrow.width &&
                                             this.mouseY >= this.shopScrollbarBounds.downArrow.y && 
                                             this.mouseY <= this.shopScrollbarBounds.downArrow.y + this.shopScrollbarBounds.downArrow.height;
                }
        });
        
        // Mouse up to stop dragging
        this.canvas.addEventListener('mouseup', (e) => {
            this.shopScrollThumbDrag = false;
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
        }, { passive: false });
        
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
                        this.closeShop();
                        return;
                    }
                }
                
                // Store touch start position for scrolling
                touchStartY = touchY;
                touchStartScrollOffset = this.shopScrollOffset || 0;
            }
        }, { passive: false });
        
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
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (this.game.state === GAME_STATES.SHOP) {
                e.preventDefault();
                
                const rect = this.canvas.getBoundingClientRect();
                const touch = e.changedTouches[0];
                const touchX = touch.clientX - rect.left;
                const touchY = touch.clientY - rect.top;
                
                // Check for item taps (only if not much scrolling happened)
                const scrollDelta = Math.abs((this.shopScrollOffset || 0) - touchStartScrollOffset);
                if (scrollDelta < 20) {
                    // Sell button taps take priority
                    let tappedSell = false;
                    if (this.shopSellButtonBounds) {
                        for (const sb of this.shopSellButtonBounds) {
                            if (touchX >= sb.x && touchX <= sb.x + sb.w &&
                                touchY >= sb.y && touchY <= sb.y + sb.h) {
                                this.sellShopItem(sb.itemId);
                                tappedSell = true;
                                break;
                            }
                        }
                    }
                    if (!tappedSell && this.shopItemBounds) {
                        for (const bound of this.shopItemBounds) {
                            if (touchX >= bound.x && touchX <= bound.x + bound.width &&
                                touchY >= bound.y && touchY <= bound.y + bound.height) {
                                const success = this.buyShopItem(bound.item.id);
                                if (success) {
                                }
                                break;
                            }
                        }
                    }
                }
            }
        });
    }
    
    init() {
        // Reset core game state (money, wave, survival timer)
        this.initializeGameState();
        this.game.state = GAME_STATES.PLAYING;
        this.game.gameStartTime = Date.now(); // Start survival timer
        // Reset player
        this.player = new Player();
        // Position player at center of game field
        this.player.x = this.gameField.width / 2;
        this.player.y = this.gameField.height / 2;
        // Initialize lives display
        this.uiManager.updateLives(this.game.lives);
        // Wave bonus shield system removed
        // Reset shields
        this.playerShields = 25; // Start with 25 health
        this.shieldTanks = 1; // Start with 1 shield tank for survivability
        this.displayShields = 25; // Match starting health
        this.displayTanks = 1;
        this.animatingDamage = false;
        this.pendingDamage = 0; // Reset pending damage
        
        // Reset bulletproof spawning state
        this.gameStartTime = Date.now();
        this.lastSpawnTime = 0; // Reset spawn timer
        this.lastEmergencySpawn = 0; // Reset emergency timer
        this.nextShopTime = Date.now() + this.shopInterval;
        this.forceSpawnEnabled = false; // Keep disabled for wave-based spawning
        
        
        // Reset ghost preview positions
        this.ghostEnemyPosition = this.generateGhostPosition();
        this.ghostAsteroidPosition = this.generateGhostPosition();
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
        
        // Initialize first wave with fixed wave system
        this.game.currentWave = 1;
        this.game.waveComplete = false;
        this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 3000, 'top');
        this.uiManager.updateLives(this.game.lives); // Initialize lives display
                this.game.state = GAME_STATES.PLAYING;
        
        // Spawn initial wave (asteroids only for wave 1)
        this.spawnWaveEntities();
    }
    
    // Generate all initial color stars using purely generative method
    generateInitialColorStars() {
        // Use game field dimensions for full coverage, same as background stars
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        
        const starPositions = generateStarPositions(spawnWidth, spawnHeight, GAME_CONFIG.COLOR_STAR_COUNT);
        
        starPositions.forEach(({ x, y, z, density }) => {
            const colorStar = this.colorStarPool.get(x, y, false, z, density);
        });
    }
    
    // Generate background stars using same generative logic
    generateBackgroundStars() {
        // Use game field dimensions for full coverage
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        
        // Use moderate multiplier for visual depth while maintaining performance (was 36x, now 4x)
        const scaledStarCount = GAME_CONFIG.BACKGROUND_STAR_COUNT * 4;
        
        const backgroundStarPositions = generateStarPositions(spawnWidth, spawnHeight, scaledStarCount);
        
        backgroundStarPositions.forEach(({ x, y, z, density }) => {
            const backgroundStar = this.backgroundStarPool.get(x, y, z, density);
        });
    }
    
    // Spawn a single color star using simple random generation (for replacement color stars)
    spawnColorStar() {
        // Use game field dimensions for full coverage, same as other star generation
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        
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
        let attempts = 0;
        const r = random(30, 60);
        const spawnBuffer = r * 4;
        
        do {
            const edge = Math.floor(random(0, 4));
            switch (edge) {
                case 0: x = random(0, this.width); y = -spawnBuffer; break;
                case 1: x = this.width + spawnBuffer; y = random(0, this.height); break;
                case 2: x = random(0, this.width); y = this.height + spawnBuffer; break;
                default: x = -spawnBuffer; y = random(0, this.height); break;
            }
            attempts++;
        } while (this.isInMinimapArea(x, y) && attempts < 10);
        
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
            this.lineDebrisPool.get(ast.x, ast.y, p1, p2, '#88aacc');
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
    
    // Fixed wave system with object limits for performance
    updateWaveSystem() {
        if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) {
            return;
        }
        
        // Clean up dead entities first
        this.enemyPool.cleanupInactive();
        this.asteroidPool.cleanupInactive();
        
        // Check if current wave is complete
        const totalEnemies = this.enemyPool.activeObjects.length;
        const totalAsteroids = this.asteroidPool.activeObjects.length;
        const totalEntities = totalEnemies + totalAsteroids;
        
        if (totalEntities === 0 && !this.game.waveComplete && this.game.state === GAME_STATES.PLAYING) {
            // Wave completed!
            this.game.waveComplete = true;
            this.game.waveCountdownTime = Date.now() + this.game.waveCountdownDuration;
            this.game.state = GAME_STATES.WAVE_TRANSITION;
            
            this.showWaveComplete();
        }
        
        // Handle wave countdown
        if (this.game.waveComplete && this.game.state === GAME_STATES.WAVE_TRANSITION) {
            const timeLeft = this.game.waveCountdownTime - Date.now();
            
            if (timeLeft <= 0) {
                // Start next wave
                this.startNextWave();
            }
        }
    }
    
    showWaveComplete() {
        // Show WAVE COMPLETE message with next wave number
        const nextWave = this.game.currentWave + 1;
        
        // Set up canvas-based wavy text animation
        this.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: this.game.waveCountdownDuration,
            title: 'WAVE COMPLETE!',
            subtitle: `WAVE ${nextWave} INCOMING...`
        };
        
        // Also show DOM message as backup
        // this.uiManager.showMessage('WAVE COMPLETE!', `WAVE ${nextWave} INCOMING...`, this.game.waveCountdownDuration, 'center');
    }
    
    // Method to draw wavy rainbow text for wave messages
    // Mobile-aware: scales font to fit within screen width with padding.
    drawWavyText(text, x, y, fontSize = 48) {
        if (!text) return;

        const time = Date.now() * 0.001;
        const chars = text.split('');
        const isMobile = this.inputHandler.isMobile();

        // ── Mobile-responsive font sizing ────────────────────────────────────
        // On mobile, clamp fontSize so the full string fits within the viewport
        // with 20px padding on each side. Account for portrait vs landscape.
        let effectiveFontSize = fontSize;
        if (isMobile) {
            const pad = 40; // 20px each side
            const availableWidth = this.width - pad;
            // 'Press Start 2P' at size N is roughly 0.6*N per character
            const estimatedWidth = text.length * fontSize * 0.6;
            if (estimatedWidth > availableWidth) {
                effectiveFontSize = Math.floor(availableWidth / (text.length * 0.6));
            }
            // Also cap at a sensible maximum for small screens
            const maxMobile = Math.min(this.width, this.height) * 0.08;
            effectiveFontSize = Math.min(effectiveFontSize, maxMobile, fontSize);
            effectiveFontSize = Math.max(effectiveFontSize, 10); // floor
        }

        this.ctx.save();
        this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
        
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Calculate total text width for centering
        const totalWidth = this.ctx.measureText(text).width;
        let currentX = x - totalWidth / 2;

        // Wave amplitude scales with font size
        const waveAmp = effectiveFontSize * 20 / 72;

        chars.forEach((char, index) => {
            if (char === ' ') {
                currentX += effectiveFontSize * 0.5;
                return;
            }

            const waveOffset = Math.sin(time * 3 + index * 0.8) * waveAmp; 

            // Rainbow color cycling
            const colorTime = (time * 0.15 + index * 0.1) % 1;
            let color;
            
	    if      (colorTime < 0.16) color = '#FF0000';
            else if (colorTime < 0.32) color = '#FF8000';
            else if (colorTime < 0.48) color = '#FFFF00';
            else if (colorTime < 0.64) color = '#00FF00';
            else if (colorTime < 0.80) color = '#0080FF';
            else                       color = '#8000FF';

            // Glow via double-draw: slightly larger translucent pass + crisp pass.
            // Cheaper than shadowBlur (1 extra fillText vs GPU blur kernel per char).
            this.ctx.globalAlpha = 0.35;
            this.ctx.fillStyle = color;
            this.ctx.font = `${effectiveFontSize + 2}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            this.ctx.globalAlpha = 1;
            this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            currentX += this.ctx.measureText(char).width;
        });

        this.ctx.restore();
    }
    
    drawTitleScreen() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const isMobile = this.inputHandler.isMobile();

        // Mobile-responsive helper: scale font to fit within screen width
        const fitFont = (baseFontSize, text) => {
            if (!isMobile) return baseFontSize;
            const pad = 40;
            const availW = this.width - pad;
            const estimated = text.length * baseFontSize * 0.6;
            let fs = baseFontSize;
            if (estimated > availW) fs = Math.floor(availW / (text.length * 0.6));
            const maxMobile = Math.min(this.width, this.height) * 0.08;
            return Math.max(10, Math.min(fs, maxMobile, baseFontSize));
        };

        // Main title - RAINBOIDS
        this.drawWavyText('RAINBOIDS', centerX, centerY - 100, 72);

        // Subtitle
        const subFS = fitFont(24, 'SUPERCHARGED ASTEROIDS');
        this.ctx.save();
        this.ctx.font = `${subFS}px "Press Start 2P", monospace`;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('SUPERCHARGED ASTEROIDS', centerX, centerY - 20);
        this.ctx.restore();

        // Animated "Press Any Key" text
        const time = Date.now() * 0.001;
        const pulseAlpha = 0.5 + Math.sin(time * 3) * 0.3;
        const startText = isMobile ? 'TAP TO START' : 'PRESS ANY KEY TO START';
        const startFS = fitFont(18, startText);

        this.ctx.save();
        this.ctx.font = `${startFS}px "Press Start 2P", monospace`;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(startText, centerX, centerY + 80);
        this.ctx.restore();

        // Survival record display (if available)
        if (this.game.survivalRecord > 0) {
            const recText = `Survival Record: ${this.formatSurvivalTime(this.game.survivalRecord)}`;
            const recFS = fitFont(16, recText);
            this.ctx.save();
            this.ctx.font = `${recFS}px "Press Start 2P", monospace`;
            this.ctx.fillStyle = '#FFD700';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(recText, centerX, centerY + 120);
            this.ctx.restore();
        }
    }
    
    startNextWave() {
        this.game.currentWave++;
        this.game.waveComplete = false;
        this.game.state = GAME_STATES.PLAYING;
        
        // Update levels
        this.game.enemyLevel = Math.floor(this.game.currentWave / 2) + 1;
        this.game.asteroidLevel = Math.floor(this.game.currentWave / 3) + 1;
        
        
        // Spawn wave entities based on wave number
        this.spawnWaveEntities();
        
        // Show wave start message with wavy animation
        this.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: 3000,
            title: `WAVE ${this.game.currentWave}`,
            subtitle: 'FIGHT!'
        };
        
        // Also show DOM message as backup
        // this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, 'FIGHT!', 3000, 'top');
    }
    
    spawnWaveEntities() {
        // Get wave configuration from wave data
        const waveConfig = getWaveConfig(this.game.currentWave);
        
        // Calculate levels for this wave
        this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
        this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);
        
        // Spawn asteroids with level scaling
        this.spawnLeveledAsteroids(waveConfig.asteroids);
        
        // Spawn enemies by type with level scaling
        for (const enemyGroup of waveConfig.enemies) {
            this.spawnLeveledEnemies(enemyGroup.type, enemyGroup.count);
        }
    }
    
    spawnAsteroids(count) {
        for (let i = 0; i < count; i++) {
            const asteroid = this.asteroidPool.get();
            if (asteroid) {
                this.initializeWaveAsteroid(asteroid);
            }
        }
    }
    
    spawnEnemies(count) {
        for (let i = 0; i < count; i++) {
            const enemy = this.enemyPool.get();
            if (enemy) {
                const enemyType = this.getRandomEnemyType();
                const spawnPos = this.getRandomSpawnPosition();
                enemy.reset(spawnPos.x, spawnPos.y, enemyType, this.game.enemyLevel, this);
            }
        }
    }
    
    spawnLeveledAsteroids(count) {
        // Respect MAX_ASTEROIDS limit for performance
        const activeAsteroids = this.asteroidPool.activeObjects.length;
        const maxToSpawn = Math.min(count, GAME_CONFIG.MAX_ASTEROIDS - activeAsteroids);
        
        for (let i = 0; i < maxToSpawn; i++) {
            const asteroid = this.asteroidPool.get(undefined, undefined, undefined, 1, this);
            if (asteroid) {
                this.initializeLeveledAsteroid(asteroid);
            }
        }
    }
    
    spawnLeveledEnemies(enemyType, count) {
        for (let i = 0; i < count; i++) {
            const enemy = this.enemyPool.get();
            if (enemy) {
                const spawnPos = this.getRandomSpawnPosition();
                enemy.reset(spawnPos.x, spawnPos.y, enemyType, this.game.enemyLevel, this);
                this.applyEnemyLevelScaling(enemy);
            }
        }
    }
    
    initializeLeveledAsteroid(asteroid) {
        // Use existing initialization but with level scaling
        this.initializeWaveAsteroid(asteroid);
        
        // Apply level scaling to health
        const baseHealth = asteroid.health;
        asteroid.health = getLevelScaledAsteroidStats(baseHealth, this.game.asteroidLevel);
        asteroid.maxHealth = asteroid.health;
    }
    
    applyEnemyLevelScaling(enemy) {
        // Get base stats from enemy type
        const baseStats = ENEMY_TYPES[enemy.type];
        
        // Apply level scaling
        const scaledStats = getLevelScaledEnemyStats(baseStats, this.game.enemyLevel);
        
        // Update enemy properties
        enemy.health = scaledStats.health;
        enemy.maxHealth = scaledStats.health;
        enemy.config.speed = scaledStats.speed;
        
        // Set level-based firing cooldown
        enemy.firingCooldown = getEnemyFiringCooldown(enemy.type, this.game.enemyLevel);
        
        // Update points value for higher level enemies
        enemy.config.points = scaledStats.points;
    }
    
    // Legacy wave methods removed - replaced by continuous spawning system
    
    completeWave() {
        this.waveInProgress = false;
        this.game.currentWave++;
        this.waveTimer = Date.now() + GAME_CONFIG.WAVE_BREAK_TIME; // Short break between waves
        this.wavePhase = 'waiting';
        
        // Increase enemy and asteroid levels each wave for scaling difficulty
        this.game.enemyLevel = Math.floor(this.game.currentWave / 2) + 1; // Level 1-2 = wave 1-3, Level 3 = wave 5-6, etc.
        this.game.asteroidLevel = Math.floor(this.game.currentWave / 3) + 1; // Slower asteroid scaling
        
        
        // Shop removed from wave completion - players can access via pause menu
        // setTimeout(() => {
        //     this.openShop();
        // }, 500); // Brief delay to ensure clean transition
        
    }
    
    sellShopItem(itemId) {
        const item = this.shopItems.find(i => i.id === itemId);
        if (!item) return false;

        const currentStacks = this.player.getPowerupStacks(itemId);
        if (currentStacks === 0) return false;

        // Calculate refund: 50% of the cost of the most-recently-bought stack
        let lastStackCost = item.cost;
        if (item.id === 'SPREAD_SHOT') {
            if (currentStacks === 1) lastStackCost = 5000;
            else if (currentStacks === 2) lastStackCost = 10000;
            else if (currentStacks >= 3) lastStackCost = 20000;
        } else if (item.id === 'CHARGE_SPEED') {
            if (currentStacks === 1) lastStackCost = 10000;
            else if (currentStacks === 2) lastStackCost = 15000;
            else if (currentStacks >= 3) lastStackCost = 20000;
        }
        const refund = Math.floor(lastStackCost * 0.5);

        if (itemId === 'SPARE_SHIP') {
            if (this.game.lives <= 1) return false;
            this.game.lives--;
            this.uiManager.updateLives(this.game.lives);
        } else {
            const entry = this.player.powerups.get(itemId);
            if (!entry) return false;
            if (entry.stacks <= 1) {
                this.player.powerups.delete(itemId);
            } else {
                entry.stacks--;
            }
            // Clamp health after selling HEALTH_BOOST
            if (itemId === 'HEALTH_BOOST') {
                this.player.health = Math.min(this.player.health, this.player.getEffectiveMaxHealth());
            }
        }

        if (item.currency === 'SP') {
            this.player.skillPoints += refund;
        } else {
            this.game.money += refund;
        }
        this.audioManager.playCoin();
        return true;
    }

    openShop() {

        // Hide any active wave messages when opening shop
        this.uiManager.hideMessage();
        
        // Shop button will be naturally hidden behind shop overlay (z-index)
        
        // Store the time when shop opened to adjust spawn timers later
        this.shopOpenTime = Date.now();
        
        // Transition to shop state from any valid state
        this.game.state = GAME_STATES.SHOP;
        document.body.classList.add('shop-open'); // Dim HUD DOM elements behind canvas overlay

        // Pause the charge shot system when opening shop
        if (this.player) {
            this.player.pauseChargeShot();
        }
        
        
        // Initialize shop state
        this.shopCategory = 'OFFENSE'; // Current tab: 'OFFENSE' or 'DEFENSE'
        
        // Define shop items with categories and currency types
        this.shopItems = [
            {
                id: 'MEDPACK',
                name: 'Medpack',
                description: 'Increases green health orb healing by 1',
                cost: 1,
                icon: '💊',
                maxStacks: 5,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'HEALTH_BOOST',
                name: 'Health Boost', 
                description: 'Increases max health by 25',
                cost: 1,
                icon: '❤️',
                maxStacks: 20,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'SPEED_BOOST',
                name: 'Speed Boost',
                description: 'Move 30% faster',
                cost: 1,
                icon: '💨',
                maxStacks: 4,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'RAPID_FIRE',
                name: 'Rapid Fire',
                description: 'Shoot 25% faster',
                cost: 1500,
                icon: '⚡',
                maxStacks: 5,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'SHIELD_BOOST',
                name: 'Shielding',
                description: 'Reduces damage by 5%',
                cost: 1,
                icon: '🛡️',
                maxStacks: 15,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'MULTI_SHOT',
                name: 'Multi Shot',
                description: 'Fire one extra bullet',
                cost: 2000,
                icon: '✳️',
                maxStacks: 5,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'SPREAD_SHOT',
                name: 'Spread Shot',
                description: 'Fire spread bullets (3/5/7)',
                cost: 5000,
                icon: '📐',
                maxStacks: 3,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'HOMING',
                name: 'Homing',
                description: 'Bullets track enemies',
                cost: 1500,
                icon: '🎯',
                maxStacks: 5,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'PIERCING',
                name: 'Piercing',
                description: 'Bullets go through enemies',
                cost: 5000,
                icon: '🏹',
                maxStacks: 5,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'EXPLOSIVE',
                name: 'Explosive',
                description: 'Bullets explode on impact',
                cost: 3000,
                icon: '💣',
                maxStacks: 3,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'CRIT_CHANCE',
                name: 'Critical Chance',
                description: 'Increases crit chance by 5%',
                cost: 3000,
                icon: '⭐',
                maxStacks: 10,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'CRIT_DAMAGE',
                name: 'Critical Damage',
                description: 'Increases crit damage by 10%',
                cost: 1500,
                icon: '🗡️',
                maxStacks: 15,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'HEALTH_ORB_DROP_CHANCE',
                name: 'Health Orb Luck',
                description: 'Increases health orb drop chance by 5%',
                cost: 1,
                icon: '🍀',
                maxStacks: 16,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'MONEY_ORB_DROP_CHANCE',
                name: 'Money Orb Luck',
                description: 'Increases money orb drop chance by 5%',
                cost: 1,
                icon: '💰',
                maxStacks: 10,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'HEALTH_ORB_DROP_QUANTITY',
                name: 'Health Orb Bounty',
                description: 'Increases health orbs dropped by 1',
                cost: 1,
                icon: '💚',
                maxStacks: 3,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'MONEY_ORB_DROP_QUANTITY',
                name: 'Money Orb Bounty',
                description: 'Increases money orbs dropped by 1',
                cost: 1,
                icon: '🪙',
                maxStacks: 4,
                category: 'DEFENSE',
                currency: 'SP'
            },
            {
                id: 'CHARGE_SHOT',
                name: 'Charge Shot',
                description: 'Unlocks the charge shot ability',
                cost: 5000,
                icon: '🔮',
                maxStacks: 1,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'CHARGE_SPEED',
                name: 'Charge Speed',
                description: 'Reduces charge time by 1 second (requires Charge Shot)',
                cost: 5000,
                icon: '⏱️',
                maxStacks: 3,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'CHARGE_DAMAGE',
                name: 'Charge Power',
                description: 'Increases charge shot base damage by 1 (requires Charge Shot)',
                cost: 2500,
                icon: '🔋',
                maxStacks: 10,
                category: 'OFFENSE',
                currency: 'COINS'
            },
            {
                id: 'SPARE_SHIP',
                name: 'Spare Ship',
                description: 'Adds an extra life (max 3)',
                cost: 1000,
                icon: '🚀',
                maxStacks: 1,
                flatCost: true,
                category: 'OFFENSE',
                currency: 'COINS'
            }
        ];

        this._rebuildShopCache();

    }

    _rebuildShopCache() {
        this.shopFilteredItems = this.shopItems.filter(i => i.category === this.shopCategory);
    }

    closeShop() {
        try {
            
            if (!this.game) {
                console.error('❌ Game object is undefined in closeShop!');
                return;
            }
            
            // Shop button will be naturally visible again (z-index)
            
            // Adjust spawn timers for the time spent in shop
            if (this.shopOpenTime) {
                const timeInShop = Date.now() - this.shopOpenTime;
                this.lastSpawnTime += timeInShop; // Adjust last spawn time instead of next spawn time
                this.lastEmergencySpawn += timeInShop; // Adjust emergency timer too
                this.nextShopTime += timeInShop;
            }
            
            this.game.state = GAME_STATES.WAVE_TRANSITION;
            document.body.classList.remove('shop-open'); // Restore HUD DOM element visibility

            // Resume the charge shot system when closing shop
            if (this.player) {
                this.player.resumeChargeShot();
            }

            // Clear shop bounds to prevent memory leaks
            this.shopItemBounds = null;

            // Respect the WAVE_BREAK_TIME timer instead of immediately starting the wave
            const remainingTime = this.waveTimer - Date.now();
            if (remainingTime > 0) {
                setTimeout(() => {
                    if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                        this.startNewWave();
                    }
                }, remainingTime);
            } else {
                this.startNewWave();
            }
            
            
        } catch (error) {
            console.error('❌ Error in closeShop:', error);
            console.error('❌ Stack trace:', error.stack);
        }
    }
    
    buyShopItem(itemId) {
        try {
            
            const item = this.shopItems.find(i => i.id === itemId);
            if (!item) {
                console.error(`❌ Item not found: ${itemId}`);
                return false;
            }
            
            
            if (!this.player) {
                console.error(`❌ Player is undefined!`);
                return false;
            }
            
            // Special check for Spare Ship - can't buy if already at 3 lives
            if (itemId === 'SPARE_SHIP' && this.game.lives >= 3) {
                return false;
            }
            
            const currentStacks = this.player.getPowerupStacks(itemId);
            if (currentStacks >= item.maxStacks) {
                if (item.maxStacks === 1) {
                } else {
                }
                return false;
            }
            
            if (!this.game) {
                console.error(`❌ Game object is undefined!`);
                return false;
            }
            
            // Calculate dynamic cost for special items
            let actualCost = item.cost;
            if (item.flatCost) {
                // Items with flat cost don't scale (like Spare Ship)
                actualCost = item.cost;
            } else if (item.id === 'SPREAD_SHOT') {
                const currentStacks = this.player.getPowerupStacks(item.id);
                if (currentStacks === 0) actualCost = 5000;      // First purchase
                else if (currentStacks === 1) actualCost = 10000; // Second purchase  
                else if (currentStacks === 2) actualCost = 20000; // Third purchase
            } else if (item.id === 'CHARGE_SPEED') {
                const currentStacks = this.player.getPowerupStacks(item.id);
                if (currentStacks === 0) actualCost = 10000;     // First purchase
                else if (currentStacks === 1) actualCost = 15000; // Second purchase  
                else if (currentStacks === 2) actualCost = 20000; // Third purchase
            }
            
            // Check affordability based on currency type
            if (item.currency === 'SP') {
                if (this.player.skillPoints < actualCost) {
                    return false;
                }
            } else {
            if (this.game.money < actualCost) {
                return false;
                }
            }
            
            // Purchase successful - deduct appropriate currency
            if (item.currency === 'SP') {
                this.player.skillPoints -= actualCost;
            } else {
            this.game.money -= actualCost;
            }
            
            // Special handling for Spare Ship
            if (itemId === 'SPARE_SHIP') {
                this.game.lives = Math.min(3, this.game.lives + 1); // Cap at 3 lives
                this.uiManager.updateLives(this.game.lives);
            } else {
                // Add powerup to player (permanent for the run)
                const powerupConfig = this.getPowerupConfig(itemId);
                if (!powerupConfig) {
                    console.error(`❌ Powerup config not found for: ${itemId}`);
                    return false;
                }
                
                this.player.addPowerup(itemId, {
                    ...powerupConfig,
                    duration: Infinity // Permanent for the run
                }, true); // isShopItem = true
            }
            
            
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
        // Return powerup configurations for shop items (includes icon + colors for HUD display)
        const configs = {
            'SHIELD_BOOST':             { name: 'Shielding',          duration: Infinity, icon: '🛡️', gradientColors: ['#33ff99', '#006644'] },
            'RAPID_FIRE':               { name: 'Rapid Fire',          duration: Infinity, icon: '⚡', gradientColors: ['#ff6600', '#ff0000'] },
            'CHARGE_SHOT':              { name: 'Charge Shot',         duration: Infinity, icon: '🔮', gradientColors: ['#00ffff', '#0033aa'] },
            'MULTI_SHOT':               { name: 'Multi Shot',          duration: Infinity, icon: '✳️', gradientColors: ['#66aaff', '#0033cc'] },
            'SPREAD_SHOT':              { name: 'Spread Shot',         duration: Infinity, icon: '📐', gradientColors: ['#66ddff', '#0099cc'] },
            'SPEED_BOOST':              { name: 'Speed Boost',         duration: Infinity, icon: '💨', gradientColors: ['#ffff33', '#cc9900'] },
            'PIERCING':                 { name: 'Piercing',            duration: Infinity, icon: '🏹', gradientColors: ['#ffcc66', '#cc6600'] },
            'EXPLOSIVE':                { name: 'Explosive',           duration: Infinity, icon: '💣', gradientColors: ['#ff9933', '#cc3300'] },
            'HOMING':                   { name: 'Homing',              duration: Infinity, icon: '🎯', gradientColors: ['#ff66cc', '#cc0066'] },
            'MEDPACK':                  { name: 'Medpack',             duration: Infinity, icon: '💊', gradientColors: ['#ff99cc', '#cc3366'] },
            'HEALTH_BOOST':             { name: 'Health Boost',        duration: Infinity, icon: '❤️', gradientColors: ['#ff6666', '#cc0000'] },
            'CRIT_CHANCE':              { name: 'Critical Chance',     duration: Infinity, icon: '⭐', gradientColors: ['#ffff66', '#cc9900'] },
            'CRIT_DAMAGE':              { name: 'Critical Damage',     duration: Infinity, icon: '🗡️', gradientColors: ['#ff3399', '#cc0033'] },
            'CHARGE_SPEED':             { name: 'Charge Speed',        duration: Infinity, icon: '⏱️', gradientColors: ['#ffcc00', '#cc8800'] },
            'CHARGE_DAMAGE':            { name: 'Charge Power',        duration: Infinity, icon: '🔋', gradientColors: ['#ff6600', '#cc3300'] },
            'HEALTH_ORB_DROP_CHANCE':   { name: 'Health Orb Luck',     duration: Infinity, icon: '🍀', gradientColors: ['#33ff99', '#009944'] },
            'MONEY_ORB_DROP_CHANCE':    { name: 'Money Orb Luck',      duration: Infinity, icon: '💰', gradientColors: ['#ffdd00', '#cc8800'] },
            'HEALTH_ORB_DROP_QUANTITY': { name: 'Health Orb Bounty',   duration: Infinity, icon: '💚', gradientColors: ['#66ff66', '#009900'] },
            'MONEY_ORB_DROP_QUANTITY':  { name: 'Money Orb Bounty',    duration: Infinity, icon: '🪙', gradientColors: ['#ffcc00', '#996600'] },
        };
        return configs[type];
    }
    
    drawShop() {
        // Initialize scroll offset if not set
        if (this.shopScrollOffset === undefined) {
            this.shopScrollOffset = 0;
        }
        // Reset hit-test arrays each frame
        this.shopItemBounds = [];
        this.shopSellButtonBounds = [];
        
        // Draw semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Calculate shop window dimensions - make it shorter
        const shopWindowWidth = Math.min(600, this.width - 40);
        const shopWindowHeight = Math.min(this.height - 160, 500); // Reduced height from 650 to 500
        const shopWindowX = (this.width - shopWindowWidth) / 2;
        const shopWindowY = 100; // Moved down slightly for better spacing
        
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
        
        // Close (X) button — square, margin from border, opacity + glow on hover
        const closeBtnSize = 28;
        const closeBtnMargin = 12;
        const closeBtnX = shopWindowX + closeBtnMargin;
        const closeBtnY = shopWindowY + closeBtnMargin;
        const closeBtnCorner = 5;
        this.shopCloseBounds = { x: closeBtnX, y: closeBtnY, width: closeBtnSize, height: closeBtnSize };

        const closeHovered = this.mouseX !== undefined &&
            this.mouseX >= closeBtnX && this.mouseX <= closeBtnX + closeBtnSize &&
            this.mouseY >= closeBtnY && this.mouseY <= closeBtnY + closeBtnSize;

        this.ctx.save();
        this.ctx.globalAlpha = closeHovered ? 1.0 : 0.5;

        // Fill
        this.ctx.fillStyle = closeHovered ? 'rgba(220, 50, 50, 1.0)' : 'rgba(150, 25, 25, 1.0)';
        this.ctx.beginPath();
        this.ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, closeBtnCorner);
        this.ctx.fill();

        // Stroke with glow on hover
        if (closeHovered) {
            this.ctx.shadowColor = 'rgba(255, 80, 80, 0.9)';
            this.ctx.shadowBlur = 14;
        }
        this.ctx.strokeStyle = closeHovered ? '#ff9999' : '#993333';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.roundRect(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, closeBtnCorner);
        this.ctx.stroke();

        // X lines (no shadow)
        this.ctx.shadowBlur = 0;
        const closeCx = closeBtnX + closeBtnSize / 2;
        const closeCy = closeBtnY + closeBtnSize / 2;
        const xOff = 6;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(closeCx - xOff, closeCy - xOff);
        this.ctx.lineTo(closeCx + xOff, closeCy + xOff);
        this.ctx.moveTo(closeCx + xOff, closeCy - xOff);
        this.ctx.lineTo(closeCx - xOff, closeCy + xOff);
        this.ctx.stroke();
        this.ctx.restore();

        // Shop title - larger and more prominent
        this.ctx.fillStyle = '#FFD700';
        this.ctx.font = 'bold 32px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('SHOP', this.width / 2, 60);
        
        // Currency display — single line, centered: [💰 amount]   [amount SP]
        const centerX      = shopWindowX + shopWindowWidth / 2;
        const currencyRowY = shopWindowY + 52;
        const iconSize     = 18;
        const labelGap     = 8;   // gap between coin icon and coin amount
        const sectionGap   = 28;  // gap between coin section and SP section
        const spLabelGap   = 4;   // tight gap between SP number and "SP" label

        this.ctx.font = 'bold 14px "Press Start 2P", monospace';
        this.ctx.textBaseline = 'middle';

        const coinStr  = `${Math.floor(this.game.money)}`;
        const spNum    = `${this.player.skillPoints}`;
        const spLabel  = 'SP';

        const coinTextW  = this.ctx.measureText(coinStr).width;
        const spNumW     = this.ctx.measureText(spNum).width;
        const spLabelW   = this.ctx.measureText(spLabel).width;

        // Total line width: [icon + gap + coinAmount] [sectionGap] [spAmount + labelGap + SP]
        const coinSectionW = iconSize + labelGap + coinTextW;
        const spSectionW   = spNumW + spLabelGap + spLabelW;
        const totalLineW   = coinSectionW + sectionGap + spSectionW;
        const lineLeft     = centerX - totalLineW / 2;

        // Coin icon + amount
        drawCachedMoneyIcon(this.ctx, lineLeft + iconSize / 2, currencyRowY, iconSize, '#FFD700', '#B8860B');
        this.ctx.fillStyle = '#FFD700';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(coinStr, lineLeft + iconSize + labelGap, currencyRowY);

        // SP amount + label (tight gap)
        const spStartX = lineLeft + coinSectionW + sectionGap;
        this.ctx.fillStyle = '#6AB7FF';
        this.ctx.fillText(spNum, spStartX, currencyRowY);
        this.ctx.fillStyle = '#4A90E2';
        this.ctx.fillText(spLabel, spStartX + spNumW + spLabelGap, currencyRowY);

        // Draw category tabs below currency display
        const tabsY = currencyRowY + 34; // keeps tabs at same absolute position as before
        this.drawShopTabs(shopWindowX, tabsY, shopWindowWidth);
        
        // Setup clipping for scrollable area (adjusted for tabs)
        const contentStartY = tabsY + 40; // Start content below tabs
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(shopWindowX + 10, contentStartY, shopWindowWidth - 20, shopWindowHeight - (contentStartY - shopWindowY) - 20);
        this.ctx.clip();
        
        // Calculate scrollable list layout
        const scrollBarWidth = 25; // Reserve space for scrollbar
        const itemWidth = shopWindowWidth - 40 - scrollBarWidth; // Leave space for scrollbar
        const itemHeight = 100; // Increased from 80 to accommodate larger fonts
        const padding = 12; // Slightly increased padding
        const startX = shopWindowX + 20;
        
        // Filter items by current category
        const filteredItems = this.shopFilteredItems;
        
        // Calculate total content height for scroll limits
        const totalContentHeight = filteredItems.length * (itemHeight + padding);
        const availableHeight = shopWindowHeight - (contentStartY - shopWindowY) - 20; // Height available for items
        const maxScroll = Math.max(0, totalContentHeight - availableHeight);
        
        // Clamp scroll offset
        this.shopScrollOffset = Math.max(0, Math.min(maxScroll, this.shopScrollOffset));
        
        // Calculate start Y position after clamping scroll offset
        const startY = contentStartY + 10 - this.shopScrollOffset;
        
        // Draw filtered shop items with hover detection
        filteredItems.forEach((item, index) => {
            const x = startX;
            const y = startY + index * (itemHeight + padding);
            
            // Only draw items that are visible in the scroll area
            if (y + itemHeight >= shopWindowY + 20 && y <= shopWindowY + shopWindowHeight - 60) {
                // Check for hover if mouse position is available
                let isHovered = false;
                if (this.mouseX !== undefined && this.mouseY !== undefined) {
                    isHovered = this.mouseX >= x && this.mouseX <= x + itemWidth &&
                               this.mouseY >= y && this.mouseY <= y + itemHeight &&
                               this.mouseX >= shopWindowX + 10 && this.mouseX <= shopWindowX + shopWindowWidth - 35 && // Account for scrollbar space
                               this.mouseY >= shopWindowY + 20 && this.mouseY <= shopWindowY + shopWindowHeight - 60;
                }
                
                this.drawShopItem(item, x, y, itemWidth, itemHeight, index, isHovered);
            }
        });
        
        this.ctx.restore(); // Remove clipping
        
        // Draw scroll indicators if needed
        if (maxScroll > 0) {
            const scrollBarWidth = 25; // Wider scrollbar to match reserved space
            const scrollBarX = shopWindowX + shopWindowWidth - scrollBarWidth - 5;
            const arrowButtonHeight = 20;
            const scrollBarY = shopWindowY + 20 + arrowButtonHeight;
            const scrollBarHeight = shopWindowHeight - 80 - (arrowButtonHeight * 2);
            const scrollThumbHeight = Math.max(20, scrollBarHeight * (shopWindowHeight - 80) / totalContentHeight);
            const scrollThumbY = scrollBarY + (this.shopScrollOffset / maxScroll) * (scrollBarHeight - scrollThumbHeight);
            
            // Store scrollbar bounds for interaction
            this.shopScrollbarBounds = {
                x: scrollBarX,
                y: scrollBarY - arrowButtonHeight,
                width: scrollBarWidth,
                height: scrollBarHeight + (arrowButtonHeight * 2),
                thumbY: scrollThumbY,
                thumbHeight: scrollThumbHeight,
                trackY: scrollBarY,
                trackHeight: scrollBarHeight,
                upArrow: { x: scrollBarX, y: scrollBarY - arrowButtonHeight, width: scrollBarWidth, height: arrowButtonHeight },
                downArrow: { x: scrollBarX, y: scrollBarY + scrollBarHeight, width: scrollBarWidth, height: arrowButtonHeight }
            };
            
            // Up arrow button
            this.ctx.fillStyle = this.shopScrollUpHover ? 'rgba(255, 215, 0, 0.8)' : 'rgba(150, 150, 150, 0.8)';
            this.ctx.fillRect(scrollBarX, scrollBarY - arrowButtonHeight, scrollBarWidth, arrowButtonHeight);
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(scrollBarX, scrollBarY - arrowButtonHeight, scrollBarWidth, arrowButtonHeight);
            
            // Up arrow
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.moveTo(scrollBarX + scrollBarWidth/2, scrollBarY - arrowButtonHeight + 4);
            this.ctx.lineTo(scrollBarX + 4, scrollBarY - 4);
            this.ctx.lineTo(scrollBarX + scrollBarWidth - 4, scrollBarY - 4);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Scroll track
            this.ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
            this.ctx.fillRect(scrollBarX, scrollBarY, scrollBarWidth, scrollBarHeight);
            
            // Scroll thumb
            this.ctx.fillStyle = this.shopScrollThumbDrag ? '#FFF700' : '#FFD700';
            this.ctx.fillRect(scrollBarX, scrollThumbY, scrollBarWidth, scrollThumbHeight);
            this.ctx.strokeStyle = '#FFA500';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(scrollBarX, scrollThumbY, scrollBarWidth, scrollThumbHeight);
            
            // Down arrow button
            this.ctx.fillStyle = this.shopScrollDownHover ? 'rgba(255, 215, 0, 0.8)' : 'rgba(150, 150, 150, 0.8)';
            this.ctx.fillRect(scrollBarX, scrollBarY + scrollBarHeight, scrollBarWidth, arrowButtonHeight);
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(scrollBarX, scrollBarY + scrollBarHeight, scrollBarWidth, arrowButtonHeight);
            
            // Down arrow
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.moveTo(scrollBarX + scrollBarWidth/2, scrollBarY + scrollBarHeight + arrowButtonHeight - 4);
            this.ctx.lineTo(scrollBarX + 4, scrollBarY + scrollBarHeight + 4);
            this.ctx.lineTo(scrollBarX + scrollBarWidth - 4, scrollBarY + scrollBarHeight + 4);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        // Instructions - larger and more visible
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '14px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Click items to purchase • Press SPACE or click outside to continue', this.width / 2, this.height - 30);
    }
    
    drawShopTabs(shopX, tabY, shopWidth) {
        const tabWidth = 120;
        const tabHeight = 30;
        const tabSpacing = 10;
        const totalTabsWidth = (tabWidth * 2) + tabSpacing;
        const tabStartX = shopX + (shopWidth - totalTabsWidth) / 2;
        
        // Check hover states
        const offenseHovered = this.mouseX >= tabStartX && this.mouseX <= tabStartX + tabWidth &&
                              this.mouseY >= tabY && this.mouseY <= tabY + tabHeight;
        const defenseTabX = tabStartX + tabWidth + tabSpacing;
        const defenseHovered = this.mouseX >= defenseTabX && this.mouseX <= defenseTabX + tabWidth &&
                              this.mouseY >= tabY && this.mouseY <= tabY + tabHeight;
        
        // Draw OFFENSE tab
        const offenseActive = this.shopCategory === 'OFFENSE';
        let offenseFillStyle, offenseTextStyle;

        if (offenseActive) {
            offenseFillStyle = 'rgba(180, 130, 0, 1.0)';
            offenseTextStyle = '#FFFFFF';
        } else if (offenseHovered) {
            offenseFillStyle = 'rgba(140, 100, 0, 0.95)';
            offenseTextStyle = '#FFFFFF';
        } else {
            offenseFillStyle = 'rgba(100, 70, 0, 0.85)';
            offenseTextStyle = '#FFFFFF';
        }
        
        const tabCorner = 6;

        // OFFENSE tab
        this.ctx.save();
        if (offenseHovered && !offenseActive) {
            this.ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
            this.ctx.shadowBlur = 6;
        }
        this.ctx.fillStyle = offenseFillStyle;
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.roundRect(tabStartX, tabY, tabWidth, tabHeight, tabCorner);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.fillStyle = offenseTextStyle;
        this.ctx.font = 'bold 12px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('OFFENSE', tabStartX + tabWidth/2, tabY + tabHeight/2);

        // Draw DEFENSE tab
        const defenseActive = this.shopCategory === 'DEFENSE';
        let defenseFillStyle, defenseTextStyle;

        if (defenseActive) {
            defenseFillStyle = 'rgba(50, 100, 200, 1.0)';
            defenseTextStyle = '#FFFFFF';
        } else if (defenseHovered) {
            defenseFillStyle = 'rgba(40, 80, 160, 0.95)';
            defenseTextStyle = '#FFFFFF';
        } else {
            defenseFillStyle = 'rgba(25, 55, 110, 0.85)';
            defenseTextStyle = '#FFFFFF';
        }

        // DEFENSE tab
        this.ctx.save();
        if (defenseHovered && !defenseActive) {
            this.ctx.shadowColor = 'rgba(74, 144, 226, 0.3)';
            this.ctx.shadowBlur = 6;
        }
        this.ctx.fillStyle = defenseFillStyle;
        this.ctx.strokeStyle = '#4A90E2';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.roundRect(defenseTabX, tabY, tabWidth, tabHeight, tabCorner);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.fillStyle = defenseTextStyle;
        this.ctx.font = 'bold 12px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DEFENSE', defenseTabX + tabWidth/2, tabY + tabHeight/2);
        
        // Store tab bounds for click detection
        this.shopTabBounds = {
            offense: { x: tabStartX, y: tabY, width: tabWidth, height: tabHeight },
            defense: { x: defenseTabX, y: tabY, width: tabWidth, height: tabHeight }
        };
    }
    
    drawShopItem(item, x, y, width, height, index, isHovered = false) {
        const currentStacks = this.player.getPowerupStacks(item.id);
        
        // Calculate dynamic cost for special items
        let actualCost = item.cost;
        if (item.id === 'SPREAD_SHOT') {
            if (currentStacks === 0) actualCost = 5000;      // First purchase
            else if (currentStacks === 1) actualCost = 10000; // Second purchase  
            else if (currentStacks === 2) actualCost = 20000; // Third purchase
        } else if (item.id === 'CHARGE_SPEED') {
            if (currentStacks === 0) actualCost = 10000;     // First purchase
            else if (currentStacks === 1) actualCost = 15000; // Second purchase  
            else if (currentStacks === 2) actualCost = 20000; // Third purchase
        }
        
        const canAfford = item.currency === 'SP' ? 
            this.player.skillPoints >= actualCost : 
            this.game.money >= actualCost;
        const maxedOut = currentStacks >= item.maxStacks;
        
        // Item background — rounded corners
        const itemCorner = 8;
        if (maxedOut) {
            this.ctx.fillStyle = isHovered ? 'rgba(150, 150, 150, 0.6)' : 'rgba(100, 100, 100, 0.5)';
        } else if (canAfford) {
            this.ctx.fillStyle = isHovered ? 'rgba(0, 255, 0, 0.4)' : 'rgba(0, 255, 0, 0.2)';
        } else {
            this.ctx.fillStyle = isHovered ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 0, 0, 0.2)';
        }
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, itemCorner);
        this.ctx.fill();

        // Item border with hover glow
        this.ctx.save();
        if (isHovered && !maxedOut) {
            this.ctx.shadowColor = canAfford ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 68, 68, 0.6)';
            this.ctx.shadowBlur = 14;
        }
        this.ctx.strokeStyle = isHovered
            ? (maxedOut ? '#AAAAAA' : (canAfford ? '#00FF88' : '#FF4444'))
            : (maxedOut ? '#666666' : (canAfford ? '#00FF00' : '#FF0000'));
        this.ctx.lineWidth = isHovered ? 3 : 2;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, width, height, itemCorner);
        this.ctx.stroke();
        this.ctx.restore();
        
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
        
        // Handle multi-line names (like "Critical\nDamage")
        const nameLines = item.name.split('\n');
        const nameLineHeight = 18;
        
        nameLines.forEach((line, index) => {
            // Truncate line if too long
            let displayLine = line;
            let lineWidth = this.ctx.measureText(displayLine).width;
            if (lineWidth > textWidth) {
                while (lineWidth > textWidth - 30 && displayLine.length > 3) {
                    displayLine = displayLine.slice(0, -1);
                    lineWidth = this.ctx.measureText(displayLine + '...').width;
                }
                displayLine += '...';
            }
            this.ctx.fillText(displayLine, textX, y + 32 + (index * nameLineHeight)); // +7px top margin
        });
        
        // Item description - larger, more readable font
        this.ctx.font = '12px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#CCCCCC';
        this.ctx.textAlign = 'left'; // Ensure description is left-justified
        
        // Word wrap description to fit in available space (shifted down by 20px)
        const maxDescLines = 2;
        const lineHeight = 16; // Increased line height for larger font
        const descStartY = y + 66; // Shifted down to match name top-margin increase
        
        this.drawMultilineText(item.description, textX, descStartY, textWidth, lineHeight, maxDescLines);
        
        // Cost (right side) - larger, more visible
        const costX = x + width - padding;
        this.ctx.font = 'bold 16px "Press Start 2P", monospace';

        if (item.currency === 'SP') {
            // SP cost: number and "SP" on the same line
            this.ctx.fillStyle = canAfford ? '#4A90E2' : '#FF6666';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`${actualCost} SP`, costX, y + 35);
        } else {
            // Coin cost: icon to the left of the number, both vertically centered on same Y
            const costCenterY = y + 35;
            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = 'right';
            this.ctx.fillStyle = canAfford ? '#FFD700' : '#FF6666';
            const costStr = `${actualCost}`;
            const costTextWidth = this.ctx.measureText(costStr).width;
            const coinIconSize = 20;
            const coinIconGap = 5;
            const coinIconX = costX - costTextWidth - coinIconGap - coinIconSize / 2;
            drawCachedMoneyIcon(this.ctx, coinIconX, costCenterY, coinIconSize, '#FFD700', '#B8860B');
            this.ctx.fillText(costStr, costX, costCenterY);
        }
        
        // Item level beneath cost (right side)
        this.ctx.font = '10px "Press Start 2P", monospace';
        this.ctx.fillStyle = maxedOut ? '#666' : '#00FFFF';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.fillText(`Level ${currentStacks}`, costX, y + 72);

        // Sell button — only when player owns at least one stack
        if (currentStacks > 0) {
            // Calculate sell refund for display
            let sellCost = item.cost;
            if (item.id === 'SPREAD_SHOT') {
                if (currentStacks === 1) sellCost = 5000;
                else if (currentStacks === 2) sellCost = 10000;
                else sellCost = 20000;
            } else if (item.id === 'CHARGE_SPEED') {
                if (currentStacks === 1) sellCost = 10000;
                else if (currentStacks === 2) sellCost = 15000;
                else sellCost = 20000;
            }
            const refund = Math.floor(sellCost * 0.5);
            const sellLabel = item.currency === 'SP' ? `SELL +${refund}SP` : `SELL +${refund}`;

            const sbW = 80, sbH = 18;
            const sbX = costX - sbW;
            const sbY = y + height - sbH - 6;

            const sellHovered = this.mouseX !== undefined &&
                this.mouseX >= sbX && this.mouseX <= sbX + sbW &&
                this.mouseY >= sbY && this.mouseY <= sbY + sbH;

            this.ctx.save();
            this.ctx.fillStyle = sellHovered ? 'rgba(220,80,80,0.9)' : 'rgba(160,40,40,0.7)';
            this.ctx.beginPath();
            this.ctx.roundRect(sbX, sbY, sbW, sbH, 4);
            this.ctx.fill();
            this.ctx.strokeStyle = sellHovered ? '#ff9999' : '#993333';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.roundRect(sbX, sbY, sbW, sbH, 4);
            this.ctx.stroke();
            this.ctx.font = '8px "Press Start 2P", monospace';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(sellLabel, sbX + sbW / 2, sbY + sbH / 2);
            this.ctx.restore();

            // Store sell button bounds
            if (!this.shopSellButtonBounds) this.shopSellButtonBounds = [];
            this.shopSellButtonBounds.push({ x: sbX, y: sbY, w: sbW, h: sbH, itemId: item.id });
        }

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
            
            if (!this.game) {
                console.error('❌ Game object is undefined in startNewWave!');
                return;
            }
            
        this.waveInProgress = true;
        this.wavePhase = 'asteroids';
        this.wavePhaseTimer = Date.now();
        this.currentSubWave = 0;
        this.enemiesRemainingInSubWave = 0;
            
        
        // Spawn asteroids first
        this.spawnWaveAsteroids();
        
        // Show wave notification
            if (this.uiManager) {
                this.uiManager.showMessage(`WAVE ${this.game.currentWave}`, '', 7000, 'top');
            } else {
                console.error('❌ UIManager is undefined!');
            }
        
            
        } catch (error) {
            console.error('❌ Error in startNewWave:', error);
            console.error('❌ Stack trace:', error.stack);
        }
    }
    
    spawnWaveAsteroids() {
        // Use fixed asteroid count for consistent gameplay
        const desiredAsteroids = GAME_CONFIG.INITIAL_AST_COUNT; // Fixed count of 8 asteroids
        
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
        
    }
    
    startEnemySubWave() {
        // Single enemy per sub-wave for focused combat
        this.enemiesRemainingInSubWave = GAME_CONFIG.ENEMIES_PER_SUB_WAVE;
        this.subWaveStartTime = Date.now(); // Track when sub-wave started for timeout
        this.subWaveTimer = Date.now();
        this.lastEnemySpawn = 0; // Spawn first enemy immediately
        
    }
    
    initializeWaveAsteroid(asteroid) {
        // Spawn asteroid at random edge position using gameField dimensions, avoiding minimap
        let x, y;
        let attempts = 0;
        const r = random(30, 60);
        const spawnBuffer = r * 4;
        
        do {
            const edge = Math.floor(random(0, 4));
            switch (edge) {
                case 0: x = random(0, this.gameField.width); y = -spawnBuffer; break;
                case 1: x = this.gameField.width + spawnBuffer; y = random(0, this.gameField.height); break;
                case 2: x = random(0, this.gameField.width); y = this.gameField.height + spawnBuffer; break;
                case 3: x = -spawnBuffer; y = random(0, this.gameField.height); break;
            }
            attempts++;
        } while (this.isInMinimapArea(x, y) && attempts < 10);
        
        const spd = Math.min(2.5, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.1);
        const vel = {
            x: random(-spd, spd) || 0.2,
            y: random(-spd, spd) || 0.2
        };
        
        asteroid.initializeAsteroid(x, y, r, this.game.asteroidLevel, this);
        asteroid.vel = vel;
    }
    
    // Legacy method - replaced by startNewWave and sub-wave system
    
    forceSpawnEntity() {
        // ULTRA-AGGRESSIVE spawning - WILL NOT FAIL
        const activeEnemies = this.enemyPool.activeObjects.length;
        const activeAsteroids = this.asteroidPool.activeObjects.length;
        
        
        // Try both types - don't respect limits if we're empty
        const totalEntities = activeEnemies + activeAsteroids;
        
        // If battlefield is empty, ignore all limits
        if (totalEntities === 0) {
            if (this.forceSpawnEnemy()) {
                return true;
            }
            if (this.forceSpawnAsteroid()) {
                return true;
            }
        }
        
        // Normal spawn logic - randomly balance between enemy and asteroid types
        let spawnEnemy = Math.random() < 0.5;

        // Override if asteroids are at their limit
        if (activeAsteroids >= GAME_CONFIG.MAX_ASTEROIDS) {
            spawnEnemy = true; // Force enemy when asteroid cap is reached
        }
        
        // Try to spawn the chosen type
        if (spawnEnemy) {
            if (this.forceSpawnEnemy()) {
                return true;
            }
        } else {
            if (this.forceSpawnAsteroid()) {
                return true;
            }
        }
        
        // If first choice failed, try the other type
        if (spawnEnemy) {
            if (this.forceSpawnAsteroid()) {
                return true;
            }
        } else {
            if (this.forceSpawnEnemy()) {
                return true;
            }
        }
        
        // LAST RESORT - try both again
        if (this.forceSpawnEnemy()) return true;
        if (this.forceSpawnAsteroid()) return true;
        
        console.error('❌ ALL SPAWN METHODS EXHAUSTED!');
        return false;
    }
    
    forceSpawnEnemy() {
        // Method 1: Try normal pool
        const enemy = this.enemyPool.get();
        if (enemy) {
            const { x, y } = this.getRandomSpawnPosition();
            const enemyType = this.getRandomEnemyType();
            enemy.reset(x, y, enemyType, this.game.enemyLevel, this);
            return true;
        }
        
        
        // Method 2: Force create new enemy if pool failed
        try {
            const newEnemy = new Enemy();
            const { x, y } = this.getRandomSpawnPosition();
            const enemyType = this.getRandomEnemyType();
            newEnemy.reset(x, y, enemyType, this.game.enemyLevel, this);
            this.enemyPool.activeObjects.push(newEnemy);
            return true;
        } catch (error) {
            console.error('❌ Failed to create new enemy:', error);
            return false;
        }
    }
    
    forceSpawnAsteroid() {
        // Check MAX_ASTEROIDS limit first
        if (this.asteroidPool.activeObjects.length >= GAME_CONFIG.MAX_ASTEROIDS) {
            return false;
        }
        
        // Method 1: Try normal pool
        const asteroid = this.asteroidPool.get();
        if (asteroid) {
            this.initializeWaveAsteroid(asteroid);
            return true;
        }
        
        
        // Method 2: Force create new asteroid if pool failed
        try {
            const newAsteroid = new Asteroid();
            this.initializeWaveAsteroid(newAsteroid);
            this.asteroidPool.activeObjects.push(newAsteroid);
            return true;
        } catch (error) {
            console.error('❌ Failed to create new asteroid:', error);
            return false;
        }
    }
    
    isInMinimapArea(worldX, worldY) {
        // Convert world coordinates to screen coordinates
        const screenX = worldX - this.camera.x;
        const screenY = worldY - this.camera.y;
        
        // Minimap area: top-right corner (170px from right, 170px from top)
        const minimapLeft = this.width - 170;
        const minimapTop = 20;
        const minimapRight = this.width - 20;
        const minimapBottom = 170;
        
        return screenX >= minimapLeft && screenX <= minimapRight && 
               screenY >= minimapTop && screenY <= minimapBottom;
    }
    
    getRandomSpawnPosition() {
        let attempts = 0;
        let x, y;
        
        do {
            const edge = Math.floor(Math.random() * 4);
            switch (edge) {
                case 0: x = Math.random() * this.gameField.width; y = -50; break; // Top
                case 1: x = this.gameField.width + 50; y = Math.random() * this.gameField.height; break; // Right
                case 2: x = Math.random() * this.gameField.width; y = this.gameField.height + 50; break; // Bottom
                case 3: x = -50; y = Math.random() * this.gameField.height; break; // Left
                default: x = 0; y = 0; break;
            }
            attempts++;
        } while (this.isInMinimapArea(x, y) && attempts < 10);
        
        return { x, y };
    }
    
    getRandomEnemyType() {
        let availableTypes = ['HUNTER', 'WASP'];
        if (this.game.currentWave >= 2) availableTypes.push('GUARDIAN', 'STALKER');
        if (this.game.currentWave >= 4) availableTypes.push('TANGERINE');
        if (this.game.currentWave >= 6) availableTypes.push('TITAN');
        return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }
    
    spawnContinuousAsteroid() {
        const asteroid = this.asteroidPool.get();
        if (asteroid) {
            this.initializeWaveAsteroid(asteroid);
        } else {
            console.warn('⚠️ Failed to get asteroid from pool!');
            // Force create a new asteroid if pool is empty
            const newAsteroid = new Asteroid();
            this.initializeWaveAsteroid(newAsteroid);
            this.asteroidPool.activeObjects.push(newAsteroid);
        }
    }
    
    spawnRandomEnemy() {
        // Choose enemy type based on wave progression
        const enemyTypes = Object.keys(ENEMY_TYPES);
        let availableTypes = ['HUNTER', 'WASP']; // Start with basic types
        
        if (this.game.currentWave >= 2) availableTypes.push('GUARDIAN', 'STALKER');
        if (this.game.currentWave >= 4) availableTypes.push('TANGERINE');
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
        } else {
            console.warn('⚠️ Failed to get enemy from pool!');
            // Force create a new enemy if pool is empty
            const newEnemy = new Enemy();
            newEnemy.reset(x, y, enemyType, this.game.enemyLevel, this);
            this.enemyPool.activeObjects.push(newEnemy);
        }
    }
    
    createEnemyDebris(enemy) {
        // EPIC EXPLOSION EFFECTS!
        
        // Multiple explosion rings with different sizes and colors
        for (let ring = 0; ring < 4; ring++) {
            const ringDelay = ring * 50; // Stagger the rings
            setTimeout(() => {
                const explosionRing = this.particlePool.get(enemy.x, enemy.y, 'explosionPulse');
                if (explosionRing) {
                    explosionRing.maxRadius = 30 + ring * 25; // Growing rings
                    explosionRing.color = ring === 0 ? '#ffffff' : 
                                        ring === 1 ? enemy.color : 
                                        ring === 2 ? '#ffaa00' : '#ff4400';
                }
            }, ringDelay);
        }
        
        // Massive amount of explosion particles
        for (let i = 0; i < 60; i++) {
            const particle = this.particlePool.get(enemy.x, enemy.y, 'explosion');
            if (particle) {
                particle.color = i < 20 ? '#ffffff' : 
                               i < 40 ? enemy.color : '#ffaa00';
                // Vary the explosion velocities for more chaos
                const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.5;
                const speed = 2 + Math.random() * 4;
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Additional fiery explosion particles
        for (let i = 0; i < 30; i++) {
            const particle = this.particlePool.get(enemy.x, enemy.y, 'explosionRedOrange');
            if (particle) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 3;
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Sparkle effects
        for (let i = 0; i < 15; i++) {
            const sparkle = this.particlePool.get(enemy.x, enemy.y, 'starSparkle');
            if (sparkle) {
                sparkle.color = '#ffffff';
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.5 + Math.random() * 2;
                sparkle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Create colored line debris based on enemy shape
        this.createShapeDebris(enemy);
        
        // EPIC screen shake for enemy deaths (only if on screen)!
        if (this.isEntityOnScreen(enemy)) {
            this.triggerScreenShake(25, 15, enemy.radius * 2);
        }
        
        // Additional delayed explosion effects
        setTimeout(() => {
            // Secondary explosion burst
            for (let i = 0; i < 20; i++) {
                const particle = this.particlePool.get(
                    enemy.x + (Math.random() - 0.5) * 40,
                    enemy.y + (Math.random() - 0.5) * 40,
                    'explosion'
                );
                if (particle) {
                    particle.color = '#ff6600';
                }
            }
        }, 100);
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
                    
                case 'TANGERINE': // Spiked circle debris
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
    
    // Create health orbs that heal the player
    createHealthOrb(x, y) {
        const healthOrb = this.colorStarPool.get(x, y, 'health'); // health orb type
        if (healthOrb) {
            // Assign random heal amount and corresponding size
            const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN;
            const maxHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX;
            healthOrb.healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
            
            // Scale size based on heal amount
            const healRatio = (healthOrb.healAmount - minHeal) / (maxHeal - minHeal);
            const minSize = GAME_CONFIG.HEALTH_ORB_SIZE_MIN;
            const maxSize = GAME_CONFIG.HEALTH_ORB_SIZE_MAX;
            healthOrb.sizeMultiplier = minSize + (healRatio * (maxSize - minSize));
            
            // Apply size multiplier to radius
            const baseRadius = healthOrb.baseRadius || healthOrb.radius;
            healthOrb.radius = baseRadius * healthOrb.sizeMultiplier;
            
            // Give it some random velocity to scatter from the entity position
            const angle = random(0, Math.PI * 2);
            const speed = random(1, 3);
            healthOrb.vel.x = Math.cos(angle) * speed;
            healthOrb.vel.y = Math.sin(angle) * speed;
        }
    }
    
    // Create money orbs that give coins to the player
    createMoneyOrb(x, y) {
        const moneyOrb = this.colorStarPool.get(x, y, 'money'); // money orb type
        if (moneyOrb) {
            // Assign random money amount and corresponding size
            const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN;
            const maxMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX;
            moneyOrb.moneyAmount = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;
            
            // Scale size based on money amount
            const moneyRatio = (moneyOrb.moneyAmount - minMoney) / (maxMoney - minMoney);
            const minSize = GAME_CONFIG.MONEY_ORB_SIZE_MIN;
            const maxSize = GAME_CONFIG.MONEY_ORB_SIZE_MAX;
            moneyOrb.sizeMultiplier = minSize + (moneyRatio * (maxSize - minSize));
            
            // Apply size multiplier to radius
            const baseRadius = moneyOrb.baseRadius || moneyOrb.radius;
            moneyOrb.radius = baseRadius * moneyOrb.sizeMultiplier;
            
            // Give it some random velocity to scatter from the entity position
            const angle = random(0, Math.PI * 2);
            const speed = random(1, 3);
            moneyOrb.vel.x = Math.cos(angle) * speed;
            moneyOrb.vel.y = Math.sin(angle) * speed;
        }
    }
    
    dropStarsFromEntity(x, y) {
        // Create both health and money orbs when an entity is destroyed
        this.createHealthOrb(x, y);
        this.createMoneyOrb(x, y);
    }
    
    // Drop orbs based on configuration and upgrades
    dropOrbsFromEntity(x, y, entity = null) {
        // Get upgrade stacks for drop chances and quantities
        const healthDropChanceStacks = this.player.getPowerupStacks('HEALTH_ORB_DROP_CHANCE');
        const moneyDropChanceStacks = this.player.getPowerupStacks('MONEY_ORB_DROP_CHANCE');
        const healthDropQuantityStacks = this.player.getPowerupStacks('HEALTH_ORB_DROP_QUANTITY');
        const moneyDropQuantityStacks = this.player.getPowerupStacks('MONEY_ORB_DROP_QUANTITY');
        
        // Get hit streak multiplier for increased orb drops
        const hitStreakMultiplier = this.player.getHitStreakMultiplier();
        
        // Check if entity is an enemy (has type property) for bonus drops
        const isEnemy = entity && entity.type && typeof entity.type === 'string';
        const enemyDropRateBonus = isEnemy ? 0.4 : 0; // +40% drop rate for enemies
        const enemyQuantityMultiplier = isEnemy ? 1.8 : 1; // +80% more orbs for enemies
        
        // Get level-based bonuses (higher level entities have better drop rates and quantities)
        const entityLevel = entity?.level || 1;
        const levelDropRateBonus = (entityLevel - 1) * 0.15; // 15% increased drop rate per level
        const levelQuantityMultiplier = 1 + (entityLevel - 1) * 0.25; // 25% more orbs per level
        
        // Calculate effective drop rates with upgrades, level bonuses, and enemy bonuses
        const baseHealthDropRate = GAME_CONFIG.HEALTH_ORB_BASE_DROP_RATE + (healthDropChanceStacks * GAME_CONFIG.HEALTH_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;
        const baseMoneyDropRate = GAME_CONFIG.MONEY_ORB_BASE_DROP_RATE + (moneyDropChanceStacks * GAME_CONFIG.MONEY_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;
        
        const healthDropRate = Math.min(1.0, baseHealthDropRate);
        const moneyDropRate = Math.min(1.0, baseMoneyDropRate);
        
        // Drop health orbs
        if (Math.random() < healthDropRate) {
            const baseHealthOrbCount = Math.floor(Math.random() * (GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MAX - GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MIN + 1)) + GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MIN;
            const upgradeHealthOrbCount = baseHealthOrbCount + (healthDropQuantityStacks * GAME_CONFIG.HEALTH_ORB_DROP_QUANTITY_UPGRADE);
            const levelScaledHealthOrbCount = Math.floor(upgradeHealthOrbCount * levelQuantityMultiplier);
            const enemyScaledHealthOrbCount = Math.floor(levelScaledHealthOrbCount * enemyQuantityMultiplier);
            const totalHealthOrbCount = Math.floor(enemyScaledHealthOrbCount * hitStreakMultiplier);
            
            for (let i = 0; i < totalHealthOrbCount; i++) {
                this.createHealthOrb(x, y);
            }
        }
        
        // Drop money orbs
        if (Math.random() < moneyDropRate) {
            const baseMoneyOrbCount = Math.floor(Math.random() * (GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MAX - GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MIN + 1)) + GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MIN;
            const upgradeMoneyOrbCount = baseMoneyOrbCount + (moneyDropQuantityStacks * GAME_CONFIG.MONEY_ORB_DROP_QUANTITY_UPGRADE);
            const levelScaledMoneyOrbCount = Math.floor(upgradeMoneyOrbCount * levelQuantityMultiplier);
            const enemyScaledMoneyOrbCount = Math.floor(levelScaledMoneyOrbCount * enemyQuantityMultiplier);
            const totalMoneyOrbCount = Math.floor(enemyScaledMoneyOrbCount * hitStreakMultiplier);
            
            for (let i = 0; i < totalMoneyOrbCount; i++) {
                this.createMoneyOrb(x, y);
            }
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
        } else {
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
        
        // Position at top center, below HUD elements to avoid overlap
        const centerX = this.width / 2;
        const topY = 120; // Moved down to clear HUD elements (health bar + level/coins + margin)
        
        // Set font to Press Start 2P for consistency (avoid font loading flash)
        ctx.font = "32px 'Press Start 2P', monospace";
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

    syncPowerupHUD() {
        const hudEl = document.getElementById('powerup-hud');
        if (!hudEl) return;

        if (!this.player || !this.player.powerups ||
                this.game.state === GAME_STATES.TITLE_SCREEN) {
            hudEl.innerHTML = '';
            this._powerupHudCache.clear();
            return;
        }

        const currentTypes = new Set(this.player.powerups.keys());

        // Remove DOM items for expired powerups
        hudEl.querySelectorAll('.powerup-hud-item').forEach(item => {
            if (!currentTypes.has(item.dataset.type)) {
                this._powerupHudCache.delete(item.dataset.type);
                item.remove();
            }
        });

        // Add or update one item per active powerup
        for (const [type, powerupData] of this.player.powerups.entries()) {
            const colors = powerupData.config.gradientColors || ['#ff4444', '#990000'];
            const isTemporary = powerupData.timeRemaining !== Infinity &&
                                powerupData.config.duration !== Infinity;

            let cached = this._powerupHudCache.get(type);

            if (!cached) {
                const item = document.createElement('div');
                item.className = 'powerup-hud-item';
                item.dataset.type = type;

                // Countdown label above circle (temporary powerups only)
                let countdown = null;
                if (isTemporary) {
                    countdown = document.createElement('div');
                    countdown.className = 'powerup-hud-countdown';
                    item.appendChild(countdown);
                }

                const circle = document.createElement('div');
                circle.className = 'powerup-hud-circle';
                circle.style.borderColor = colors[0];
                circle.style.boxShadow = `0 0 8px ${colors[0]}80`;
                circle.textContent = powerupData.config.icon || '⭐';
                item.appendChild(circle);

                let bar = null;
                if (isTemporary) {
                    const timerWrap = document.createElement('div');
                    timerWrap.className = 'powerup-hud-timer';
                    bar = document.createElement('div');
                    bar.className = 'powerup-hud-timer-bar';
                    bar.style.background = colors[0];
                    timerWrap.appendChild(bar);
                    item.appendChild(timerWrap);
                }

                // Powerup name label beneath timer bar
                const nameEl = document.createElement('div');
                nameEl.className = 'powerup-hud-name';
                nameEl.textContent = (powerupData.config.name || type).toUpperCase();
                item.appendChild(nameEl);

                hudEl.appendChild(item);

                cached = { item, countdown, bar, lastSec: -1, lastPct: -1 };
                this._powerupHudCache.set(type, cached);
            }

            // Sync countdown text (seconds remaining) with colour: green → yellow → red
            if (isTemporary && cached.countdown && isFinite(powerupData.timeRemaining)) {
                const newSec = Math.ceil(powerupData.timeRemaining / 1000);
                if (cached.lastSec !== newSec) {
                    cached.lastSec = newSec;
                    cached.countdown.textContent = newSec + 's';
                    const frac = isFinite(powerupData.config.duration)
                        ? Math.max(0, powerupData.timeRemaining / powerupData.config.duration)
                        : 1;
                    cached.countdown.style.color = frac > 0.6 ? '#44ff88'   // green
                                                 : frac > 0.25 ? '#ffdd44'  // yellow
                                                 : '#ff4444';                // red
                }
            }

            // Sync stack count badge — "2x" format, anchored to bottom-right of circle
            let stacksEl = cached.item.querySelector('.powerup-hud-stacks');
            if (powerupData.stacks > 1) {
                if (!stacksEl) {
                    stacksEl = document.createElement('div');
                    stacksEl.className = 'powerup-hud-stacks';
                    const circleEl = cached.item.querySelector('.powerup-hud-circle');
                    (circleEl || cached.item).appendChild(stacksEl);
                }
                stacksEl.textContent = powerupData.stacks + 'x';
            } else if (stacksEl) {
                stacksEl.remove();
            }

            // Sync timer bar width — only write style when value changes by >0.1%
            if (isTemporary && cached.bar && isFinite(powerupData.timeRemaining) && isFinite(powerupData.config.duration)) {
                const newPct = Math.round((powerupData.timeRemaining / powerupData.config.duration) * 1000) / 10;
                if (Math.abs(cached.lastPct - newPct) > 0.1) {
                    cached.lastPct = newPct;
                    const pct = Math.max(0, Math.min(100, newPct));
                    cached.bar.style.width = `${pct}%`;
                    cached.bar.style.background = pct < 30 ? '#ff3333' : colors[0];
                }
            }
        }
    }

    setTargetInfo(target) {
        this.targetInfo.active = true;
        this.targetInfo.target = target;
        this.targetInfo.displayTime = 0;
    }
    
    updateTargetInfo(deltaTime) {
        if (this.targetInfo.active) {
            this.targetInfo.displayTime += deltaTime;
            if (this.targetInfo.displayTime >= this.targetInfo.maxDisplayTime || 
                (this.targetInfo.target && this.targetInfo.target.health <= 0)) {
                this.targetInfo.active = false;
                this.targetInfo.target = null;
            }
        }
    }
    
    handleEntityTargeting(worldX, worldY) {
        let clickedEntity = null;
        
        // Check enemies first (higher priority)
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active) continue;
            
            const dx = worldX - enemy.x;
            const dy = worldY - enemy.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance <= enemy.radius + 15) { // 15px click tolerance
                clickedEntity = enemy;
                break;
            }
        }
        
        // Check asteroids if no enemy clicked
        if (!clickedEntity) {
            for (const asteroid of this.asteroidPool.activeObjects) {
                if (!asteroid.active) continue;
                
                const dx = worldX - asteroid.x;
                const dy = worldY - asteroid.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance <= asteroid.radius + 15) { // 15px click tolerance
                    clickedEntity = asteroid;
                    break;
                }
            }
        }
        
        // Update targeted entity only if a new entity was clicked
        // Keep previous target if clicking empty space
        if (clickedEntity) {
            this.targetedEntity = clickedEntity;
            this.setTargetInfo(clickedEntity);
        }
        // If clicking empty space, keep the current target unchanged
    }

    updateHoverDetection() {
        if (this.game.state !== GAME_STATES.PLAYING) {
            this.cursor.hoveredEntity = null;
            return;
        }
        
        // Convert screen coordinates to world coordinates
        const worldX = this.cursor.x + this.camera.x;
        const worldY = this.cursor.y + this.camera.y;
        
        let hoveredEntity = null;
        
        // Check enemies first (higher priority)
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active) continue;
            
            const dx = worldX - enemy.x;
            const dy = worldY - enemy.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance <= enemy.radius + 10) { // 10px hover tolerance
                hoveredEntity = enemy;
                break;
            }
        }
        
        // Check asteroids if no enemy hovered
        if (!hoveredEntity) {
            for (const asteroid of this.asteroidPool.activeObjects) {
                if (!asteroid.active) continue;
                
                const dx = worldX - asteroid.x;
                const dy = worldY - asteroid.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance <= asteroid.radius + 10) { // 10px hover tolerance
                    hoveredEntity = asteroid;
                    break;
                }
            }
        }
        
        this.cursor.hoveredEntity = hoveredEntity;
        this.cursor.isOverTarget = hoveredEntity !== null;
    }
    
    addMoneyPickup(amount) {
        // Add to existing amount or start new display
        this.moneyPickupDisplay.amount += amount;
        this.moneyPickupDisplay.displayTime = 0; // Reset timer
    }
    
    updateMoneyPickupDisplay(deltaTime) {
        if (this.moneyPickupDisplay.amount > 0) {
            this.moneyPickupDisplay.displayTime += deltaTime;
            
            if (this.moneyPickupDisplay.displayTime >= this.moneyPickupDisplay.maxDisplayTime) {
                this.moneyPickupDisplay.amount = 0;
                this.moneyPickupDisplay.displayTime = 0;
            }
        }
    }
    
    drawMoneyPickupDisplay() {
        if (this.moneyPickupDisplay.amount <= 0) return;
        
        const ctx = this.ctx;
        ctx.save();
        
        // Position to the right of the coin number in HUD (matching drawLevelAndCoinsDisplay exactly)
        const barX = 80; // From updateHUD
        const barY = 20; // From updateHUD  
        const barHeight = 30; // From updateHUD
        const livesX = 10;
        const triforceWidth = 60;
        const triforceCenterX = livesX + triforceWidth / 2;
        const levelY = barY + barHeight + 26;
        const coinsY = levelY + 40; // Exact match from drawLevelAndCoinsDisplay
        
        const coinIconSize = 30;
        const coinIconX = triforceCenterX - coinIconSize / 2;
        const coinsTextX = coinIconX + coinIconSize + 10;
        
        // Calculate width of coins text to position pickup display after it
        ctx.font = "14px 'Press Start 2P', monospace";
        const coinsText = `${Math.floor(this.game.money)}`;
        const coinsTextWidth = ctx.measureText(coinsText).width;
        
        const x = coinsTextX + coinsTextWidth + 15; // 15px margin after coins text
        const y = coinsY; // Exact same Y position as coins display
        
        // Calculate fade effect
        let alpha = 1;
        if (this.moneyPickupDisplay.displayTime > this.moneyPickupDisplay.fadeStartTime) {
            const fadeProgress = (this.moneyPickupDisplay.displayTime - this.moneyPickupDisplay.fadeStartTime) / 
                               (this.moneyPickupDisplay.maxDisplayTime - this.moneyPickupDisplay.fadeStartTime);
            alpha = 1 - fadeProgress;
        }
        
        // Draw darker gold +amount text
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillStyle = `rgba(184, 134, 11, ${alpha})`; // Darker gold
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
        ctx.lineWidth = 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const text = `+${this.moneyPickupDisplay.amount}`;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        
        ctx.restore();
    }
    
    createDamageNumber(x, y, damage) {
        const damageNumber = {
            x: x,
            y: y,
            damage: Math.round(damage),
            life: 1.0,
            maxLife: 1.5, // 1.5 seconds
            vel: {
                x: (Math.random() - 0.5) * 2, // Random horizontal velocity
                y: -2 - Math.random() * 2 // Upward velocity with randomness
            },
            gravity: 0.1,
            creationTime: Date.now()
        };
        
        this.damageNumbers.push(damageNumber);
    }
    
    updateDamageNumbers(deltaTime) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const dmgNum = this.damageNumbers[i];
            
            // Update position with parabolic trajectory
            dmgNum.x += dmgNum.vel.x;
            dmgNum.y += dmgNum.vel.y;
            dmgNum.vel.y += dmgNum.gravity; // Apply gravity
            
            // Update life
            dmgNum.life -= deltaTime / 1000;
            
            // Remove expired damage numbers
            if (dmgNum.life <= 0) {
                this.damageNumbers.splice(i, 1);
            }
        }
    }
    
    drawDamageNumbers() {
        const ctx = this.ctx;
        
        this.damageNumbers.forEach(dmgNum => {
            ctx.save();
            
            // Calculate alpha based on life remaining
            const alpha = Math.max(0, dmgNum.life);
            
            // Convert world coordinates to screen coordinates
            const screenX = dmgNum.x - this.camera.x;
            const screenY = dmgNum.y - this.camera.y;
            
            // Only draw if on screen
            if (screenX >= -50 && screenX <= this.width + 50 && 
                screenY >= -50 && screenY <= this.height + 50) {
                
                // Golden damage number without stroke
                ctx.font = "16px 'Press Start 2P', monospace";
                ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`; // Golden
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const text = dmgNum.damage.toString();
                ctx.fillText(text, screenX, screenY);
            }
            
            ctx.restore();
        });
    }
    
    drawTargetInfo() {
        // Show info for currently targeted entity (clicked entity)
        if (!this.targetedEntity) return;
        
        const target = this.targetedEntity;
        const ctx = this.ctx;
        
        // Position flush with right border with padding
        const paddingRight = 15; // Padding from right edge
        const paddingTop = 25;   // Padding from top edge
        const x = this.width - paddingRight; // Flush with right border minus padding
        const y = paddingTop;  // Top padding
        
        ctx.save();
        
        // Draw target name (all caps) - GOLD STYLING TO MATCH ENEMY NAMES
        ctx.font = "16px 'Press Start 2P', monospace"; // Increased from 14px to 16px
        ctx.letterSpacing = '1px'; // Added letter spacing
        ctx.fillStyle = 'rgba(255, 215, 0, 1.0)'; // Same gold color as enemy names
        ctx.textAlign = 'right'; // Align right since positioned at top right
        ctx.textBaseline = 'top';
        
        const targetName = target.config ? target.config.name.toUpperCase() : 'ASTEROID';
        ctx.fillText(targetName, x, y);
        
        // Draw health bar
        const barWidth = 100;
        const barHeight = 4;
        const barY = y + 25;
        const barX = x - barWidth; // Align right edge with text (flush with right border)
        
        const healthPercentage = target.health / target.maxHealth;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health bar gradient
        let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        if (healthPercentage > 0.5) {
            healthGradient.addColorStop(0, '#66ff66');
            healthGradient.addColorStop(1, '#00cc00');
        } else if (healthPercentage > 0.25) {
            healthGradient.addColorStop(0, '#ffff99');
            healthGradient.addColorStop(1, '#ffcc00');
        } else {
            healthGradient.addColorStop(0, '#ff6666');
            healthGradient.addColorStop(1, '#cc0000');
        }
        
        ctx.fillStyle = healthGradient;
        ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);
        
        // Draw LV and HP numbers below health bar with proper spacing
        const displayHealth = target.health > 0 && target.health < 1 ? 1 : Math.round(target.health);
        const healthNumber = `${displayHealth}/${Math.round(target.maxHealth)}`;
        const levelText = `LV${target.level || 1}`;
        
        ctx.font = "12px 'Press Start 2P', monospace"; // Increased from 10px to 12px
        ctx.letterSpacing = '0.5px'; // Added letter spacing
        
        // Measure text widths for proper spacing
        const levelWidth = ctx.measureText(levelText).width;
        const healthWidth = ctx.measureText(healthNumber).width;
        const spacing = 20; // Minimum space between LV and HP text
        const totalWidth = levelWidth + spacing + healthWidth;
        
        // Calculate positions to align right with the text and health bar
        const startX = x - totalWidth;
        const levelX = startX;
        const healthX = startX + levelWidth + spacing;
        const numberY = barY + 18;
        
        // Level text in light blue
        ctx.fillStyle = '#88ccff';
        ctx.textAlign = 'left';
        ctx.strokeText(levelText, levelX, numberY);
        ctx.fillText(levelText, levelX, numberY);
        
        // Health number in gold
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left'; // Changed to left align for consistent positioning
        ctx.strokeText(healthNumber, healthX, numberY);
        ctx.fillText(healthNumber, healthX, numberY);
        
        ctx.restore();
    }
    
    handleCollisions() {
        // OPT-8: Populate spatial grid for broad-phase collision culling
        this.spatialGrid.clear();
        this.spatialGrid.insertPool(this.asteroidPool);
        this.spatialGrid.insertPool(this.enemyPool);
        this.spatialGrid.insertPool(this.enemyBulletPool);

        // Player-asteroid collisions
        this.asteroidPool.activeObjects.forEach(ast => {
            if (this.player.active && collision(this.player, ast)) {
                this.handlePlayerAsteroidCollision(this.player, ast);
            }
        });

        // Bullet-asteroid collisions — OPT-8: spatial grid broad-phase
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active) continue;
            const nearby = this.spatialGrid.retrieve(bullet);
            for (let j = nearby.length - 1; j >= 0; j--) {
                const ast = nearby[j];
                if (!ast.active || ast.constructor.name !== 'Asteroid') continue;

                // Skip if this piercing bullet has already hit this asteroid
                if (bullet.piercing > 0 && bullet.hasHitEnemy(ast)) {
                    continue;
                }

                if (collision(bullet, ast)) {
                    triggerHapticFeedback(60);
                    
                    // Set targeting for hit asteroid (target info display removed)
                    this.targetedEntity = ast;
                    
                    // Only play hit sound if asteroid is on screen
                    if (this.isEntityOnScreen(ast)) {
                        this.audioManager.playHit();
                    }
                    
                    // Register hit for combo system
                    this.player.registerHit();
                    
                    // Damage the asteroid (One Punch Man cheat: instant kill)
                    const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || 1);
                    ast.health = Math.max(0, ast.health - damage);

                    // Show damage number (same as enemy ships)
                    if (this.isEntityOnScreen(ast)) {
                        this.createDamageNumber(ast.x, ast.y - ast.baseRadius, damage);
                    }
                    
                    // Award XP for hitting asteroid
                    this.player.gainExperience(2);

                    // Impart momentum from bullet
                    const impulse = 0.05; // Adjust for desired push effect
                    ast.vel.x += bullet.vel.x * impulse;
                    ast.vel.y += bullet.vel.y * impulse;
                    
                    // Enhanced satisfying explosion effects
                    // Orange explosion pulse (main effect)
                    this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', ast.baseRadius * 0.8);
                    
                    // Secondary orange ring
                    setTimeout(() => {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', ast.baseRadius * 1.2);
                    }, 50);
                    
                    // More explosion particles for satisfaction
                    for (let p = 0; p < 8; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosion');
                        if (particle) {
                            particle.color = p < 4 ? '#ff8800' : '#ffaa44'; // Orange variations
                            // Add random velocity for explosion effect
                            const angle = random(0, Math.PI * 2);
                            const speed = random(2, 6);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // Additional fiery particles
                    for (let p = 0; p < 4; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosionRedOrange');
                        if (particle) {
                            const angle = random(0, Math.PI * 2);
                            const speed = random(1, 3);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // Light screen shake for asteroid hits (only if on screen)
                    if (this.isEntityOnScreen(ast)) {
                        this.triggerScreenShake(8, ast.baseRadius * 0.3, ast.baseRadius);
                    }
                    
                    // Use small tolerance for floating-point precision issues
                    if (ast.health <= 0.001) {
                        if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                            // Only play explosion sound if asteroid is on screen
                            if (this.isEntityOnScreen(ast)) {
                                this.audioManager.playExplosion();
                            }
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
                            // Drop health and money orbs
                            this.dropOrbsFromEntity(ast.x, ast.y, ast);
                            // Chance to drop powerup (15% chance)
                            if (Math.random() < 0.15) {
                                this.dropPowerup(ast.x, ast.y);
                            }
                            // Enhanced screen shake for small asteroid destruction (only if on screen)
                            if (this.isEntityOnScreen(ast)) {
                                this.triggerScreenShake(12, ast.baseRadius * 0.5, ast.baseRadius);
                            }
                            this.asteroidPool.release(ast);
                        } else {
                            // Make the explosion really dramatic
                            // Only play explosion sound if asteroid is on screen
                            if (this.isEntityOnScreen(ast)) {
                                this.audioManager.playExplosion();
                            }
                            // Add a bunch of particle effects
                            this.particlePool.get(ast.x, ast.y, 'explosionPulse', ast.baseRadius * 1.5);
                            this.particlePool.get(ast.x, ast.y, 'fieryExplosionRing', ast.baseRadius * 1.2);
                            for (let p = 0; p < 40; p++) {
                                    this.particlePool.get(ast.x, ast.y, 'explosionRedOrange');
                                }
                                this.createDebris(ast);
                                this.createColorStarBurst(ast.x, ast.y);
                                // Drop health and money orbs from splitting asteroids too
                                this.dropOrbsFromEntity(ast.x, ast.y, ast);
                                // Chance to drop powerup from large asteroids (20% chance)
                                if (Math.random() < 0.2) {
                                    this.dropPowerup(ast.x, ast.y);
                                }
                            
                            // Massive screen shake for large asteroid destruction (only if on screen)
                            if (this.isEntityOnScreen(ast)) {
                                this.triggerScreenShake(25, ast.baseRadius * 0.8, ast.baseRadius);
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
                    bullet.onHit(ast);
                    
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
                    
                    // Play explosion sound only if collision is on screen
                    if (this.isEntityOnScreen(a1) || this.isEntityOnScreen(a2)) {
                        this.audioManager.playExplosion();
                    }
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
        
        // Player vs Collectible Orbs (health and money orbs from entity destruction are collectible)
        if (this.player && this.player.active) {
            for (let i = this.colorStarPool.activeObjects.length - 1; i >= 0; i--) {
                const colorStar = this.colorStarPool.activeObjects[i];
                // Only check collision for collectible orbs using enhanced collision detection
                // Uses larger radius + predictive collision to prevent fast orbs from passing through player
                if (colorStar.isCollectible && starCollision(this.player, colorStar)) {
                    if (colorStar.starType === 'health') {
                        // Health orb collected - use the orb's individual heal amount
                        const baseHealAmount = colorStar.healAmount || GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN; // Fallback for legacy orbs
                        const healAmount = this.player.getEffectiveHealthOrbHealing(baseHealAmount);
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
                    } else if (colorStar.starType === 'money') {
                        // Money orb collected - use the orb's individual money amount
                        const moneyAmount = colorStar.moneyAmount || GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN; // Fallback for legacy orbs
                        this.game.money += moneyAmount;
                        
                        // Add to pickup display
                        this.addMoneyPickup(moneyAmount);
                        
                        // Play pickup sound (always play regardless of music beat)
                        this.audioManager.playCoin();
                        
                        // Create golden money particle
                        const moneyParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
                        if (moneyParticle) {
                            moneyParticle.color = '#FFD700'; // Gold for money
                            moneyParticle.radius = 6;
                            moneyParticle.life = 0.6;
                        }
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
        
        // Bullet-enemy collisions — OPT-8: spatial grid broad-phase
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active) continue;
            const nearbyEn = this.spatialGrid.retrieve(bullet);
            for (let j = nearbyEn.length - 1; j >= 0; j--) {
                const enemy = nearbyEn[j];
                if (!enemy.active || enemy.constructor.name !== 'Enemy') continue;

                // Skip if this piercing bullet has already hit this enemy
                if (bullet.piercing > 0 && bullet.hasHitEnemy(enemy)) {
                    continue;
                }

                if (collision(bullet, enemy)) {
                    triggerHapticFeedback(40);
                    
                    // Set targeting for hit enemy (target info display removed)
                    this.targetedEntity = enemy;
                    
                    // Only play hit sound if enemy is on screen
                    if (this.isEntityOnScreen(enemy)) {
                        this.audioManager.playHit();
                    }
                    
                    // Register hit for combo system
                    this.player.registerHit();
                    
                    // Damage the enemy (One Punch Man cheat: instant kill)
                    const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || this.baseDamage);
                    const destroyed = enemy.takeDamage(damage);
                    
                    // Award XP for hitting enemy
                    this.player.gainExperience(3);
                    
                    // Enhanced satisfying explosion effects for enemy hits
                    // Orange explosion pulse (main effect)
                    this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', enemy.radius * 0.9);
                    
                    // Secondary orange ring with delay
                    setTimeout(() => {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionPulse', enemy.radius * 1.3);
                    }, 40);
                    
                    // More explosion particles for satisfaction
                    for (let p = 0; p < 10; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosion');
                        if (particle) {
                            particle.color = p < 5 ? '#ff8800' : '#ffaa44'; // Orange variations
                            // Add random velocity for explosion effect
                            const angle = random(0, Math.PI * 2);
                            const speed = random(2, 7);
                            particle.vel = {
                                x: Math.cos(angle) * speed,
                                y: Math.sin(angle) * speed
                            };
                        }
                    }
                    
                    // Additional fiery particles
                    for (let p = 0; p < 6; p++) {
                        const particle = this.particlePool.get(bullet.x, bullet.y, 'explosionRedOrange');
                        if (particle) {
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
                        // Award money
                        const reward = enemy.getDestructionReward();
                        this.game.money += reward.points;
                        
                        // Play explosion sound only if enemy is on screen
                        if (this.isEntityOnScreen(enemy)) {
                            this.audioManager.playExplosion();
                        }
                        
                        // Create colored explosion effects (includes screen shake)
                        this.createEnemyDebris(enemy);
                        
        // Drop health and money orbs
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
                        
                        // Chance to drop powerup (higher chance for stronger enemies)
                        const powerupChance = enemy.type === 'WASP' ? 0.4 : 
                                            enemy.type === 'TITAN' ? 0.5 : 
                                            enemy.type === 'TANGERINE' ? 0.45 : 0.25;
                        const roll = Math.random();
                        if (roll < powerupChance) {
                            this.dropPowerup(enemy.x, enemy.y);
                        }
                        
                        
                        this.enemyPool.release(enemy);
                    }
                    
                    // Handle bullet hit with powerup effects
                    if (bullet.explosive) {
                        bullet.explode(this);
                    }
                    bullet.onHit(enemy);
                    
                    // Only break if bullet is destroyed (no piercing left)
                    if (!bullet.active) {
                        break;
                    }
                }
            }
        }
        
        // Player bullet vs homing mines
        for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
            const bullet = this.bulletPool.activeObjects[i];
            if (!bullet.active) continue;
            for (const mine of this.enemyBulletPool.activeObjects) {
                if (!mine.active || mine.shape !== 'mine' || mine.health === undefined) continue;
                if (collision(bullet, mine)) {
                    const dmg = this.cheats?.onePunchMan ? 99999 : (bullet.damage || 1);
                    mine.health = Math.max(0, mine.health - dmg);
                    this.createDamageNumber(mine.x, mine.y - mine.radius, dmg);
                    for (let p = 0; p < 4; p++) {
                        const pt = this.particlePool.get(bullet.x, bullet.y, 'hit');
                        if (pt) pt.color = '#ff8844';
                    }
                    if (mine.health <= 0) {
                        mine.active = false;
                        this.audioManager.playExplosion();
                        this.particlePool.get(mine.x, mine.y, 'explosionPulse', mine.radius * 2);
                        for (let p = 0; p < 8; p++) {
                            const pt = this.particlePool.get(mine.x, mine.y, 'explosion');
                            if (pt) pt.color = '#ff8844';
                        }
                    } else {
                        this.audioManager.playHit();
                    }
                    bullet.onHit(mine);
                    if (!bullet.active) break;
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
                // Notify that bullet was destroyed (for combo tracking)
                if (bullet.onOffScreen) {
                    bullet.onOffScreen();
                }
            }
        });
        
        // Enemy bullet-asteroid collisions - DISABLED
        // Enemy shots now travel through asteroids without collision
        // This allows for more dynamic combat where enemy fire isn't blocked by asteroids
        
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
        // Apply damage only if not invincible
        if (!this.player.invincible) {
            // Apply balanced damage with shield calculation and enemy level scaling
            const baseDamage = enemy.getLevelScaledDamage(25); // Level-scaled collision damage (scaled back down)
            const effectiveShield = player.getEffectiveShield();
            const reducedDamage = baseDamage * (1 - effectiveShield / 100);
            const finalDamage = Math.round(reducedDamage);
            player.health = Math.max(0, player.health - finalDamage);
        
            // Award XP for surviving enemy collision
            this.player.gainExperience(5);
            
            // Check for death/shield tank usage
            if (player.health <= 0) {
                if (this.shieldTanks > 0) {
                    // Use shield tank to restore health (no life lost)
                    this.shieldTanks--;
                    this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                    player.health = player.getEffectiveMaxHealth();
                    this.audioManager.playCoin(); // Tank used sound
                    player.makeInvincible(2000); // Brief invincibility after revival
                } else {
                    // No shield tanks - lose a life and respawn
                    this.handlePlayerDeath();
                    return;
                }
            }
            
            // Visual feedback for player damage
            this.triggerScreenShake(18, 10, enemy.radius); // Strong screen shake for collision
            
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
            
            // Make player invulnerable briefly after taking damage
            this.player.makeInvincible(1500);
        }
        
        // Always damage the enemy when colliding with player (massive damage)
        const enemyCollisionDamage = 50; // Massive damage to enemies
        const destroyed = enemy.takeDamage(enemyCollisionDamage);
        
        if (destroyed) {
            const reward = enemy.getDestructionReward();
            this.game.money += reward.points; // Full money for collision kill (player took risk)
            
            // Create colored explosion effects (includes screen shake)
            this.createEnemyDebris(enemy);
            // Drop health and money orbs
            this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
            this.enemyPool.release(enemy);
        }
        
        // Physics-based bounce with conservation of momentum
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance > 0) {
            // Normalize collision direction
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Calculate relative velocity
            const relativeVelX = player.vel.x - enemy.vel.x;
            const relativeVelY = player.vel.y - enemy.vel.y;
            
            // Calculate relative velocity in collision normal direction
            const velAlongNormal = relativeVelX * nx + relativeVelY * ny;
            
            // Don't resolve if velocities are separating
            if (velAlongNormal > 0) return;
            
            // Calculate restitution (bounciness)
            const restitution = 0.8; // 80% energy retained
            
            // Calculate impulse scalar
            const playerMass = this.player.mass || 1;
            const enemyMass = enemy.mass || 1;
            const impulseScalar = -(1 + restitution) * velAlongNormal / (playerMass + enemyMass);
            
            // Apply impulse
            const impulseX = impulseScalar * nx;
            const impulseY = impulseScalar * ny;
            
            // Enhanced collision force for more dramatic effect
            const forceMultiplier = 6.0; // Increased from 3.0 for more visible bounce
            
            player.vel.x += impulseX * enemyMass * forceMultiplier;
            player.vel.y += impulseY * enemyMass * forceMultiplier;
            
            if (!destroyed) {
                enemy.vel.x -= impulseX * playerMass * forceMultiplier;
                enemy.vel.y -= impulseY * playerMass * forceMultiplier;
            }
            
            // Separate overlapping objects
            const overlap = player.radius + enemy.radius - distance;
            if (overlap > 0) {
                const separationForce = overlap * 0.6; // 60% separation
                player.x += nx * separationForce;
                player.y += ny * separationForce;
                if (!destroyed) {
                    enemy.x -= nx * separationForce;
                    enemy.y -= ny * separationForce;
                }
            }
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
        player.health = Math.max(0, player.health - finalDamage);
        
        // Award XP for surviving enemy bullet hit
        this.player.gainExperience(3);
        
        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                // Use shield tank to restore health (no life lost)
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.getEffectiveMaxHealth();
                this.audioManager.playCoin(); // Tank used sound
                player.makeInvincible(2000); // Brief invincibility after revival
            } else {
                // No shield tanks - lose a life and respawn
                this.handlePlayerDeath();
                return;
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
        // Screen shake removed for enemy-asteroid collisions
        
        // Only play hit sound if enemy is on screen
        if (this.isEntityOnScreen(enemy)) {
            this.audioManager.playHit(); // Lighter sound than explosion
        }
        
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
            // Update survival timer
            if (this.game.gameStartTime > 0) {
                this.game.survivalTime = Date.now() - this.game.gameStartTime;
            }
            
            const input = this.inputHandler.getInput();
            // Add the update method to the input object so player can call it
            input.updateAimForPlayerMovement = this.inputHandler.updateAimForPlayerMovement.bind(this.inputHandler);

            // Mobile auto-aim: point at nearest enemy, fall back to movement direction
            if (this.inputHandler.isMobile() && this.player && this.player.active) {
                const target = this.findNearestEnemy();
                if (target) {
                    input.aimX = target.x;
                    input.aimY = target.y;
                } else if (input.up || input.down || input.left || input.right) {
                    let mx = 0, my = 0;
                    if (input.left)  mx -= 1;
                    if (input.right) mx += 1;
                    if (input.up)    my -= 1;
                    if (input.down)  my += 1;
                    const len = Math.hypot(mx, my) || 1;
                    input.aimX = this.player.x + (mx / len) * 500;
                    input.aimY = this.player.y + (my / len) * 500;
                }
                // No enemy and no movement → keep current angle unchanged
            }

            // Respawn is now instant - no animation needed

            // Calculate tractor beam state - active when not charging
            const tractorEngaged = !this.player.isCharging;

            // Normal gameplay updates
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.colorStarPool, tractorEngaged, this.gameField);
            
            // Update camera to follow player
            this.updateCamera();
            
            // Target info updates removed for cleaner UI
            // this.updateTargetInfo(16); // Assume 60fps
            
            // Update money pickup display
            this.updateMoneyPickupDisplay(16); // Assume 60fps
            
            // Update damage numbers
            this.updateDamageNumbers(16); // Assume 60fps
            
            // Update hover detection
            this.updateHoverDetection();
            
            // Clean up targeted entity if it's no longer active
            if (this.targetedEntity && !this.targetedEntity.active) {
                this.targetedEntity = null;
            }
            
            this.bulletPool.activeObjects.forEach(bullet => 
                bullet.update(this.particlePool, this.asteroidPool, this.enemyPool, this, this.gameField));
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.powerupPool.activeObjects.forEach(p => p.update(this.player));
            this.asteroidPool.updateActive(this.gameField);
            
            // Update enemies and enemy bullets (only during active gameplay)
            this.enemyPool.activeObjects.forEach(enemy => enemy.update(this.player, this, this.gameField));
            this.enemyBulletPool.updateActive();
            
            // Update color stars with player position and tractor beam state
            this.colorStarPool.activeObjects.forEach(s => s.update(this.player.vel, this.player, tractorEngaged, this.gameField));
            // Update background stars with just player velocity for parallax
            this.backgroundStarPool.activeObjects.forEach(s => s.update(this.player.vel, this.gameField));
            
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
            if (Math.floor(this.game.survivalTime / 1000) % GAME_CONFIG.PARTICLE_CLEANUP_INTERVAL === 0) {
                this.particlePool.cleanupInactive();
                this.lineDebrisPool.cleanupInactive();
                this.powerupPool.cleanupInactive();
            }
            
            // Update wave system to check for completion and progression
            this.updateWaveSystem();
            
            this.uiManager.updateScore(this.game.money);
        } else if (this.game.state === GAME_STATES.GAME_OVER || this.game.state === GAME_STATES.PAUSED) {
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            // Stars twinkle but don't drift when paused — player can't move in these states
            const zeroVel = { x: 0, y: 0 };
            this.backgroundStarPool.activeObjects.forEach(s => s.update(zeroVel, this.gameField));
        } else if (this.game.state === GAME_STATES.SHOP) {
            // When in shop, only update background stars for ambiance (no parallax)
            const zeroVel = { x: 0, y: 0 };
            this.backgroundStarPool.activeObjects.forEach(s => s.update(zeroVel, this.gameField));
            // Keep existing particles moving but don't create new ones
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
        }
    }
    
    draw() {
        // Clear canvas completely (motion blur disabled)
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
            // Apply camera transformation for world objects
            this.ctx.save();
            this.ctx.translate(-this.camera.x, -this.camera.y);
            
            // Viewport culling for performance - only render stars visible in camera
            const visibleBackgroundStars = this.getVisibleStars(this.backgroundStarPool.activeObjects);
            const visibleColorStars = this.getVisibleStars(this.colorStarPool.activeObjects);
            
            // Depth-based batched starfield rendering for optimal performance
            depthBatchRenderer.groupStarsByDepth(
                visibleBackgroundStars, 
                visibleColorStars
            );
            depthBatchRenderer.renderDepthBatches(this.ctx);
            
            // Render complex color stars that need special effects (not batched)
            visibleColorStars.forEach(star => {
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
            
            // Draw game field boundaries
            this.drawGameFieldBoundaries();
            
            this.ctx.restore();
            
            // Draw UI elements without camera transformation
            // Sync DOM powerup HUD
            this.syncPowerupHUD();
            
            // Draw powerup display at top
            this.drawPowerupDisplay();
            
            // Draw minimap
            this.drawMinimap();
            
            // Draw spawn countdown timer (hidden per user request)
            // this.drawSpawnTimer();
            
            // Draw jitter circle to show bullet spread area
            this.drawJitterCircle();
            
            // Respawn is now instant - no countdown needed
            
            // Draw invincibility countdown timer only after respawn (not during hits)
            if (this.player.active && this.player.invincible && this.player.justRespawned) {
                this.drawInvincibilityCountdown();
            }
        }
    }
    
    drawHUD() {
        if (this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            // Draw health bar and UI elements
            this.updateHUD();
            // Show shop button during gameplay (but not when shop is open)
            this.uiManager.showShopButton();
            // Show DOM pause button on desktop; use canvas button on mobile
            if (this.inputHandler.isMobile()) {
                this.uiManager.hideHudPauseBtn();
                this.drawPauseButton();
            } else {
                this.uiManager.showHudPauseBtn();
            }
        } else {
            // Hide shop button on title screen and when shop is open
            this.uiManager.hideShopButton();
            this.uiManager.hideHudPauseBtn();
        }
        
        // Draw level up text if active
        if (this.player && this.player.levelUpTextInfo && this.player.levelUpTextInfo.active) {
            this.drawLevelUpText();
        }
        
        // Draw wave message if active
        if (this.waveMessage.active) {
            const now = Date.now();
            const elapsed = now - this.waveMessage.startTime;
            
            if (elapsed < this.waveMessage.duration) {
                // Calculate fade effect
                const fadeProgress = elapsed / this.waveMessage.duration;
                const alpha = fadeProgress < 0.8 ? 1 : (1 - fadeProgress) / 0.2; // Fade out in last 20%
                
                this.ctx.save();
                this.ctx.globalAlpha = alpha;
                
                // Draw title (larger, centered horizontally, near top of screen)
                const centerX = this.width / 2;
                const topY = 80;
                this.drawWavyText(this.waveMessage.title, centerX, topY, 48);

                // Draw subtitle (smaller, below title)
                if (this.waveMessage.subtitle) {
                    this.drawWavyText(this.waveMessage.subtitle, centerX, topY + 60, 24);
                }
                
                this.ctx.restore();
            } else {
                // Message expired
                this.waveMessage.active = false;
            }
        }
        
        // Draw title screen with wavy text
        if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            this.drawTitleScreen();
        }
    }
    
    drawCursorCooldownTimer() {
        if (!this.player || !this.cursor) return;
        
        // Use actual cursor position (doesn't move with player)
        if (!this.cursor.x && !this.cursor.y) return; // No cursor position available
        
        const now = Date.now();
        const timeSinceLastShot = now - this.player.lastShotTime;
        const cooldownProgress = Math.min(1, timeSinceLastShot / this.player.shotCooldownTime);
        
        // Only draw if cooldown is active (not fully ready)
        if (cooldownProgress >= 1) return;
        
        const cursorX = this.cursor.x;
        const cursorY = this.cursor.y;
        const timerRadius = 20; // Larger radius for better visibility and no overlap
        
        this.ctx.save();
        
        // Calculate remaining time (countdown)
        const remainingProgress = 1 - cooldownProgress; // Invert for countdown
        
        // Calculate color based on remaining time (red -> yellow -> green as time counts down)
        let color;
        if (remainingProgress > 0.5) {
            // Yellow to green (1.0 to 0.5 remaining)
            const t = (remainingProgress - 0.5) * 2; // 0 to 1
            const red = Math.floor(255 * (1 - t));
            const green = 255;
            color = `rgb(${red}, ${green}, 0)`;
        } else {
            // Red to yellow (0.5 to 0 remaining)
            const t = remainingProgress * 2; // 0 to 1
            const red = 255;
            const green = Math.floor(255 * t);
            color = `rgb(${red}, ${green}, 0)`;
        }
        
        // Draw background circle (dark, thinner)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(cursorX, cursorY, timerRadius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw countdown arc (colored, empties as cooldown completes)
        const startAngle = -Math.PI / 2; // Start at top
        const endAngle = startAngle + (remainingProgress * Math.PI * 2);
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        
        // shadowBlur on stroked arcs — cannot be replaced with filled glow sprites
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 6;

        this.ctx.beginPath();
        this.ctx.arc(cursorX, cursorY, timerRadius, startAngle, endAngle);
        this.ctx.stroke();
        
        // Draw inner fill for better visibility (only if significant time remaining)
        if (remainingProgress > 0.1) {
            this.ctx.shadowBlur = 0;
            this.ctx.globalAlpha = 0.2;
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.moveTo(cursorX, cursorY);
            this.ctx.arc(cursorX, cursorY, timerRadius - 1, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    updateCamera() {
        if (!this.player || !this.player.active) return;
        
        // Set camera target to follow player
        this.camera.targetX = this.player.x - this.width / 2;
        this.camera.targetY = this.player.y - this.height / 2;
        
        // Clamp camera to game field boundaries
        this.camera.targetX = Math.max(0, Math.min(this.gameField.width - this.width, this.camera.targetX));
        this.camera.targetY = Math.max(0, Math.min(this.gameField.height - this.height, this.camera.targetY));
        
        // Smooth camera movement
        this.camera.x += (this.camera.targetX - this.camera.x) * this.camera.smoothing;
        this.camera.y += (this.camera.targetY - this.camera.y) * this.camera.smoothing;
    }
    
    screenToWorldCoordinates(screenX, screenY) {
        // Convert screen coordinates to world coordinates accounting for camera
        return {
            x: screenX + this.camera.x,
            y: screenY + this.camera.y
        };
    }
    
    isEntityOnScreen(entity, buffer = 50) {
        if (!entity || !entity.active) return false;
        
        // Calculate entity bounds
        const entityLeft = entity.x - entity.radius - buffer;
        const entityRight = entity.x + entity.radius + buffer;
        const entityTop = entity.y - entity.radius - buffer;
        const entityBottom = entity.y + entity.radius + buffer;
        
        // Calculate screen bounds in world coordinates
        const screenLeft = this.camera.x;
        const screenRight = this.camera.x + this.canvas.width;
        const screenTop = this.camera.y;
        const screenBottom = this.camera.y + this.canvas.height;
        
        // Check if entity overlaps with screen
        return !(entityRight < screenLeft || 
                entityLeft > screenRight || 
                entityBottom < screenTop || 
                entityTop > screenBottom);
    }
    
    getVisibleStars(stars) {
        // Calculate viewport bounds with some padding for smooth transitions
        const padding = 100;
        const viewLeft = this.camera.x - padding;
        const viewRight = this.camera.x + this.width + padding;
        const viewTop = this.camera.y - padding;
        const viewBottom = this.camera.y + this.height + padding;
        
        return stars.filter(star => {
            if (!star.active) return false;
            
            // Check if star is within viewport bounds
            return star.x >= viewLeft && 
                   star.x <= viewRight && 
                   star.y >= viewTop && 
                   star.y <= viewBottom;
        });
    }
    
    drawGameFieldBoundaries() {
        this.ctx.save();
        this.ctx.strokeStyle = '#444444';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.strokeRect(0, 0, this.gameField.width, this.gameField.height);
        this.ctx.setLineDash([]);
        this.ctx.restore();
    }
    
    drawMinimap() {
        const minimapSize = 150;
        const minimapX = this.width - minimapSize - 20;
        const minimapY = this.height - minimapSize - 20; // Move to bottom right
        const scaleX = minimapSize / this.gameField.width;
        const scaleY = minimapSize / this.gameField.height;
        
        this.ctx.save();
        
        // Draw minimap background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
        
        // Draw minimap border
        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
        
        // Draw camera view area
        const cameraViewX = minimapX + this.camera.x * scaleX;
        const cameraViewY = minimapY + this.camera.y * scaleY;
        const cameraViewW = this.width * scaleX;
        const cameraViewH = this.height * scaleY;
        
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(cameraViewX, cameraViewY, cameraViewW, cameraViewH);
        
        // Draw player as blue dot
        if (this.player && this.player.active) {
            const playerX = minimapX + this.player.x * scaleX;
            const playerY = minimapY + this.player.y * scaleY;
            
            this.ctx.fillStyle = '#00ffff';
            this.ctx.beginPath();
            this.ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw asteroids as gray dots
        this.asteroidPool.activeObjects.forEach(asteroid => {
            if (asteroid.active) {
                const astX = minimapX + asteroid.x * scaleX;
                const astY = minimapY + asteroid.y * scaleY;
                
                this.ctx.fillStyle = '#888888';
                this.ctx.beginPath();
                this.ctx.arc(astX, astY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        
        // Draw enemies as red dots
        this.enemyPool.activeObjects.forEach(enemy => {
            if (enemy.active) {
                const enemyX = minimapX + enemy.x * scaleX;
                const enemyY = minimapY + enemy.y * scaleY;
                
                this.ctx.fillStyle = '#ff4444';
                this.ctx.beginPath();
                this.ctx.arc(enemyX, enemyY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        
        // Minimap label removed - it's obvious what it is
        
        this.ctx.restore();
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
            this.ctx.arc(input.screenAimX, input.screenAimY, currentRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }
    
    gameLoop() {
        const frameStart = performance.now();

        // OPT-7: Fixed-timestep accumulator — logic runs at 30 Hz, render at display refresh.
        if (this.useTemporalUpsampling) {
            const dt = Math.min(frameStart - this.lastFrameTime, 100); // cap large gaps
            this.lastFrameTime = frameStart;
            this.logicAccumulator += dt;
            let steps = 0;
            while (this.logicAccumulator >= this.logicTickRate && steps < this.maxLogicStepsPerFrame) {
                this.update();
                this.logicAccumulator -= this.logicTickRate;
                steps++;
            }
            // Spiral-of-death guard: drop accumulated time if we fell too far behind
            if (steps >= this.maxLogicStepsPerFrame) this.logicAccumulator = 0;
        } else {
            this.update();
        }

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
        
        // Target info display removed for cleaner UI
        // this.drawTargetInfo();
        
        // Draw money pickup display
        this.drawMoneyPickupDisplay();
        
        // Draw damage numbers
        this.drawDamageNumbers();
        
        // Draw cursor cooldown timer
        if (this.game.state === GAME_STATES.PLAYING) {
            this.drawCursorCooldownTimer();
        }
        
        if (this.game.state === GAME_STATES.GAME_OVER) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
        
        if (this.game.state === GAME_STATES.SHOP) {
            this.drawShop();
        }
        
        // Draw custom cursor (always on top, after all UI elements)
        this.drawCustomCursor();
        
        // Performance monitoring - warn if frame takes too long
        const frameTime = performance.now() - frameStart;
        if (frameTime > 16.67) { // More than 60fps budget
            // Skip some non-critical updates next frame if we're running slow
            this.performanceMode = true;
        } else {
            this.performanceMode = false;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    togglePause() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            // Playing → Paused
            this.game.state = GAME_STATES.PAUSED;
            this.uiManager.togglePause();
            // Pause the charge shot system
            if (this.player) {
                this.player.pauseChargeShot();
            }
            // Removed thruster sound on pause to reduce noise issues
        } else if (this.game.state === GAME_STATES.PAUSED) {
            // Paused → Playing
            this.game.state = GAME_STATES.PLAYING;
            this.uiManager.togglePause();
            // Resume the charge shot system
            if (this.player) {
                this.player.resumeChargeShot();
            }
        } else if (this.game.state === GAME_STATES.SHOP) {
            // Shop → Paused (close shop and show pause menu)
            this.closeShopToPause();
        }
    }
    
    closeShopToPause() {
        try {
            
            if (!this.game) {
                console.error('❌ Game object is undefined in closeShopToPause!');
                return;
            }
            
            // Shop button will be naturally visible again (z-index)
            
            // Adjust spawn timers for the time spent in shop
            if (this.shopOpenTime) {
                const timeInShop = Date.now() - this.shopOpenTime;
                this.lastSpawnTime += timeInShop;
                this.lastEmergencySpawn += timeInShop;
                this.nextShopTime += timeInShop;
            }
            
            // Set state to paused instead of wave transition
            this.game.state = GAME_STATES.PAUSED;
            document.body.classList.remove('shop-open'); // Restore HUD DOM element visibility
            this.uiManager.togglePause(); // Show pause menu

            // Clear shop bounds to prevent memory leaks
            this.shopItemBounds = null;
            
        } catch (error) {
            console.error('❌ Error in closeShopToPause:', error);
            // Fallback: just set to paused state
            this.game.state = GAME_STATES.PAUSED;
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
    
    loadSurvivalRecord() {
        this.game.survivalRecord = parseInt(localStorage.getItem('rainboidsSurvivalRecord')) || 0;
    }
    
    checkSurvivalRecord() {
        if (this.game.survivalTime > this.game.survivalRecord) {
            this.game.survivalRecord = this.game.survivalTime;
            localStorage.setItem('rainboidsSurvivalRecord', this.game.survivalRecord);
        }
    }
    
    formatSurvivalTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
        } else if (minutes > 0) {
            return `${minutes} minutes, ${seconds} seconds`;
        } else {
            return `${seconds} seconds`;
        }
    }
    
    start() {
        this.loadSurvivalRecord();
        this.uiManager.checkOrientation();
        // this.uiManager.setupTitleScreen();
        // this.uiManager.showTitleScreen();
        // this.uiManager.updateHighScore(this.game.highScore);
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
        // Check if cursor is over any enemy
        for (const enemy of this.enemyPool.activeObjects) {
            if (enemy.active) {
                const dx = mouseX - enemy.x;
                const dy = mouseY - enemy.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= enemy.radius) {
                    return 'enemy';
                }
            }
        }
        
        // Check if cursor is over any asteroid
        for (const ast of this.asteroidPool.activeObjects) {
            if (ast.active) {
                const dx = mouseX - ast.x;
                const dy = mouseY - ast.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= ast.radius) {
                    return 'asteroid';
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
                
                // Use enhanced collision radius for orbs to match collection behavior
                let targetRadius = colorStar.radius;
                if (colorStar.isBurst) {
                    // Use appropriate orb collection radius based on type
                    const collectionRadius = colorStar.starType === 'health' ? 
                        GAME_CONFIG.HEALTH_ORB_COLLECTION_RADIUS : 
                        GAME_CONFIG.MONEY_ORB_COLLECTION_RADIUS;
                    targetRadius += collectionRadius;
                }
                
                if (distance <= targetRadius) {
                    return colorStar.isBurst ? 'star' : 'colorStar';
                }
            }
        }
        
        return 'none';
    }
    
    setCursorState(isOverTarget) {
        this.cursor.isOverTarget = isOverTarget;
    }
    
    drawCustomCursor() {
        if (!this.cursor.x && !this.cursor.y) return; // Don't draw if no mouse position
        
        const ctx = this.ctx;
        ctx.save();
        
        if (this.cursor.isOverTarget) {
            // Red targeting cursor (like the original asteroid-hover)
            this.drawRedTargetingCursor(ctx, this.cursor.x, this.cursor.y);
        } else {
            // Default cyan crosshair (like the original canvas cursor)
            this.drawDefaultCrosshair(ctx, this.cursor.x, this.cursor.y);
        }
        
        ctx.restore();
    }
    
    drawDefaultCrosshair(ctx, x, y) {
        // Original cyan crosshair design
        const color = '#00ffff';
        const size = 12;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Outer circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        
        // Cross lines
        ctx.beginPath();
        // Vertical line (top)
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y - 21);
        // Vertical line (bottom)
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x, y + 21);
        // Horizontal line (left)
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 21, y);
        // Horizontal line (right)
        ctx.moveTo(x + 7, y);
        ctx.lineTo(x + 21, y);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawRedTargetingCursor(ctx, x, y) {
        // Red targeting cursor design (like original asteroid-hover)
        const color = '#ff0000';
        const size = 12;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Outer targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        
        // Targeting lines (like crosshairs but with gaps)
        ctx.beginPath();
        // Top
        ctx.moveTo(x, y - size - 5);
        ctx.lineTo(x, y - size - 12);
        // Bottom
        ctx.moveTo(x, y + size + 5);
        ctx.lineTo(x, y + size + 12);
        // Left
        ctx.moveTo(x - size - 5, y);
        ctx.lineTo(x - size - 12, y);
        // Right
        ctx.moveTo(x + size + 5, y);
        ctx.lineTo(x + size + 12, y);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    
    takeDamage(damageAmount = this.baseDamage) {
        if (this.player.invincible) return;

        // Apply shield damage reduction (including powerup boosts)
        const effectiveShield = this.player.getEffectiveShield();
        const reducedDamage = damageAmount * (1 - effectiveShield / 100);
        this.player.health = Math.max(0, this.player.health - reducedDamage);

        if (this.player.health <= 0) {
            if (this.shieldTanks > 0) {
                // Use shield tank to restore health (no life lost)
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                this.player.health = this.player.getEffectiveMaxHealth();
                this.audioManager.playCoin(); // Tank used sound
                this.player.makeInvincible(2000); // Brief invincibility after revival
            } else {
                // No shield tanks - lose a life and respawn
                this.handlePlayerDeath();
                return;
            }
        }

        this.player.makeInvincible(3000); // 3 seconds of invincibility
        this.audioManager.playHit();
        this.particlePool.get(this.player.x, this.player.y, 'damageNumber', Math.round(reducedDamage));
        this.triggerScreenShake(15, 8);
    }
    
    handlePlayerDeath() {
        // Store death location for safe respawn calculation
        this.deathLocation = { x: this.player.x, y: this.player.y };
        
        // Lose a life
        this.game.lives--;
        console.log(`💀 Player died! Lives remaining: ${this.game.lives}`);
        this.uiManager.updateLives(this.game.lives);
        
        // Create player explosion effect
        this.audioManager.playPlayerExplosion();
        for (let i = 0; i < 30; i++) {
            this.particlePool.get(this.player.x, this.player.y, 'playerExplosion');
        }
        this.triggerScreenShake(40, 20, 60); // Strong screen shake for player death
        
        if (this.game.lives <= 0) {
            // True game over - no lives left
            this.game.state = GAME_STATES.GAME_OVER;
            this.player.active = false;
            this.checkSurvivalRecord();
            this.uiManager.showMessage('GAME OVER', 'Press Enter or click to restart');
        } else {
            // Still have lives - respawn after brief delay
            this.player.active = false; // Deactivate player during respawn delay
            setTimeout(() => {
                this.respawnPlayerSafely();
            }, 1500); // 1.5 second delay for dramatic effect
        }
    }

    gameOver() {
        // Lose a life first
        this.game.lives--;
        console.log(`💀 Player died! Lives remaining: ${this.game.lives}`); // Always show player death
        
        // Update lives display
        this.uiManager.updateLives(this.game.lives);
        
        this.audioManager.playPlayerExplosion();
        
        // Create spectacular colorful death explosion
        const explosionX = this.player.x;
        const explosionY = this.player.y;
        
        // Store death location for safe respawn calculation
        this.deathLocation = { x: explosionX, y: explosionY };
        
        // Start death explosion animation
        this.deathExplosionActive = true;
        this.deathExplosionStartTime = Date.now();
        this.deathExplosionDuration = 2000; // 2 second explosion animation
        
        // Massive colorful particle explosion
        for (let i = 0; i < 200; i++) {
            const particle = this.particlePool.get(explosionX, explosionY, 'explosion');
            if (particle) {
                // Multi-layered explosion with different speeds
                const layer = Math.floor(Math.random() * 3);
                let speed, life, radius;
                
                if (layer === 0) {
                    // Inner fast explosion
                    speed = 8 + Math.random() * 12;
                    life = 40 + Math.random() * 30;
                    radius = 3 + Math.random() * 5;
                } else if (layer === 1) {
                    // Middle medium explosion
                    speed = 4 + Math.random() * 8;
                    life = 60 + Math.random() * 40;
                    radius = 2 + Math.random() * 4;
                } else {
                    // Outer slow explosion
                    speed = 2 + Math.random() * 6;
                    life = 80 + Math.random() * 50;
                    radius = 1 + Math.random() * 3;
                }
                
                const angle = Math.random() * Math.PI * 2;
                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;
                particle.life = life;
                particle.radius = radius;
                
                // Rainbow explosion colors
                const colors = [
                    '#ff0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ffff00',
                    '#ccff00', '#99ff00', '#66ff00', '#33ff00', '#00ff00', '#00ff33',
                    '#00ff66', '#00ff99', '#00ffcc', '#00ffff', '#00ccff', '#0099ff',
                    '#0066ff', '#0033ff', '#0000ff', '#3300ff', '#6600ff', '#9900ff',
                    '#cc00ff', '#ff00ff', '#ff00cc', '#ff0099', '#ff0066', '#ff0033',
                    '#ffffff', '#ffcccc', '#ccffcc', '#ccccff'
                ];
                particle.color = colors[Math.floor(Math.random() * colors.length)];
            }
        }
        
        // Dramatic line debris explosion
        for (let i = 0; i < 60; i++) {
            // Create random line debris with proper p1 and p2 points
            const angle = Math.random() * Math.PI * 2;
            const length = 10 + Math.random() * 20;
            const p1 = { x: 0, y: 0 };
            const p2 = { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
            
            const lineDebris = this.lineDebrisPool.get(explosionX, explosionY, p1, p2);
            if (lineDebris) {
                const speed = 3 + Math.random() * 10;
                lineDebris.vel.x = Math.cos(angle) * speed;
                lineDebris.vel.y = Math.sin(angle) * speed;
                lineDebris.life = 100 + Math.random() * 60;
                lineDebris.length = 20 + Math.random() * 40;
                lineDebris.width = 2 + Math.random() * 3;
                
                // Bright rainbow colors for line debris
                const colors = [
                    '#ff0044', '#ff4400', '#ffaa00', '#aaff00', '#44ff00', '#00ff44',
                    '#00ffaa', '#00aaff', '#0044ff', '#4400ff', '#aa00ff', '#ff00aa',
                    '#ffffff', '#ffff88', '#88ffff', '#ff88ff'
                ];
                lineDebris.color = colors[Math.floor(Math.random() * colors.length)];
            }
        }
        
        // Additional sparkle effects
        for (let i = 0; i < 80; i++) {
            const particle = this.particlePool.get(explosionX, explosionY, 'starSparkle');
            if (particle) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 8;
                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;
                particle.life = 60 + Math.random() * 80;
                particle.radius = 1 + Math.random() * 2;
                
                // Sparkly bright colors
                const sparkleColors = ['#ffffff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#88ff00'];
                particle.color = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
            }
        }
        
        // Explosion pulse rings with rainbow colors
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const pulse = this.particlePool.get(explosionX, explosionY, 'explosionPulse', 40 + i * 25);
                if (pulse) {
                    const pulseColors = ['#ff0000', '#ff8800', '#ffff00', '#88ff00', '#00ff88', '#0088ff', '#8800ff', '#ff0088'];
                    pulse.color = pulseColors[i % pulseColors.length];
                }
            }, i * 120);
        }
        
        // Fiery explosion rings with varied colors
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const ring = this.particlePool.get(explosionX, explosionY, 'fieryExplosionRing', 60 + i * 40);
                if (ring) {
                    const ringColors = ['#ff4400', '#ff8800', '#ffcc00', '#88ff44', '#44ff88'];
                    ring.color = ringColors[i % ringColors.length];
                }
            }, i * 180);
        }
        
        // Massive screen shake for player death
        this.triggerScreenShake(80, 45); // Much stronger and longer shake
        
        if (this.game.lives <= 0) {
            // True game over - no lives left
            this.game.state = GAME_STATES.GAME_OVER;
            this.player.active = false;
            this.checkSurvivalRecord();
            this.uiManager.showMessage('GAME OVER', 'Press Enter or click to restart');
        } else {
            // Still have lives - wait for explosion animation then respawn player
            this.player.active = false; // Deactivate player during explosion
            setTimeout(() => {
                this.respawnPlayerSafely();
            }, this.deathExplosionDuration);
        }
    }
    
    respawnPlayer() {
        // Legacy method - redirect to safe respawn
        this.respawnPlayerSafely();
    }
    
    respawnPlayerSafely() {
        // Find a safe location away from danger
        const safeLocation = this.findSafeRespawnLocation();
        
        this.player.x = safeLocation.x;
        this.player.y = safeLocation.y;
        this.player.vel.x = 0;
        this.player.vel.y = 0;
        this.player.angle = 0;
        this.player.active = true;
        
        // Reset health and shields
        this.player.health = this.player.getEffectiveMaxHealth();
        this.playerShields = this.player.health;
        this.displayShields = this.player.health;
        
        // Give player invincibility and mark as just respawned
        this.player.makeInvincible(5000); // 5 seconds of invincibility
        this.player.justRespawned = true; // Show invincibility timer
        this.player.firingDisabled = false; // Allow immediate firing
        
        // Clear area around new spawn location
        this.clearAreaAroundPlayer(200);
        
        // End death explosion animation
        this.deathExplosionActive = false;
        this.game.respawning = false;
    }
    
    findSafeRespawnLocation() {
        const gameField = this.gameField;
        const margin = 100; // Stay away from edges
        const minSafeDistance = 250; // Minimum distance from enemies/asteroids
        const maxAttempts = 50;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Try random locations within the game field
            const x = margin + Math.random() * (gameField.width - 2 * margin);
            const y = margin + Math.random() * (gameField.height - 2 * margin);
            
            let isSafe = true;
            
            // Check distance from all enemies
            for (const enemy of this.enemyPool.activeObjects) {
                const dx = x - enemy.x;
                const dy = y - enemy.y;
                const distance = Math.hypot(dx, dy);
                if (distance < minSafeDistance) {
                    isSafe = false;
                    break;
                }
            }
            
            if (!isSafe) continue;
            
            // Check distance from all asteroids
            for (const asteroid of this.asteroidPool.activeObjects) {
                const dx = x - asteroid.x;
                const dy = y - asteroid.y;
                const distance = Math.hypot(dx, dy);
                if (distance < minSafeDistance) {
                    isSafe = false;
                    break;
                }
            }
            
            if (!isSafe) continue;
            
            // Check distance from all enemy bullets
            for (const bullet of this.enemyBulletPool.activeObjects) {
                const dx = x - bullet.x;
                const dy = y - bullet.y;
                const distance = Math.hypot(dx, dy);
                if (distance < minSafeDistance * 0.6) { // Smaller safe distance for bullets
                    isSafe = false;
                    break;
                }
            }
            
            if (isSafe) {
                return { x, y };
            }
        }
        
        // If no safe location found, use center of screen as fallback
        return { 
            x: gameField.width / 2, 
            y: gameField.height / 2 
        };
    }
    
    updateRespawnAnimation(input) {
        const now = Date.now();
        const elapsed = now - this.game.respawnStartTime;
        const progress = Math.min(1, elapsed / this.game.respawnDuration);
        
        // Update particles and other systems that should continue during respawn
        this.particlePool.updateActive();
        this.lineDebrisPool.updateActive();
        this.backgroundStarPool.activeObjects.forEach(s => s.update({ x: 0, y: 0 }, this.gameField)); // No parallax during respawn
        
        // Generate blue particles that converge on the player position
        if (Math.random() < 0.8) { // High frequency for dramatic effect
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 200; // Start particles from a distance
            const startX = this.player.x + Math.cos(angle) * distance;
            const startY = this.player.y + Math.sin(angle) * distance;
            
            // Create spawn particle that moves toward player (renamed from tractor beam)
            const particle = this.particlePool.get(startX, startY, 'spawnParticle', this.player.x, this.player.y, this.player);
            if (particle) {
                // Override color to bright blue
                particle.color = `hsl(210, 100%, ${70 + Math.random() * 30}%)`;
                particle.radius = 2 + Math.random() * 2;
            }
        }
        
        // Check if respawn animation is complete
        if (progress >= 1) {
            // Activate player and start invincibility
            this.player.active = true;
            this.player.makeInvincible(this.game.respawnDuration); // 5 seconds of invincibility
            this.player.firingDisabled = true; // Disable firing during invincibility
            
            // End respawn animation
            this.game.respawning = false;
            
            // Respawn message removed - unnecessary UI clutter
            
        }
    }
    
    clearAreaAroundPlayer(radius) {
        // Clear enemies near player spawn
        this.enemyPool.activeObjects.forEach(enemy => {
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < radius) {
                enemy.active = false;
                // Create small explosion effect
                for (let i = 0; i < 5; i++) {
                    this.particlePool.get(enemy.x, enemy.y, 'explosion');
                }
            }
        });
        
        // Clear enemy bullets near player spawn
        this.enemyBulletPool.activeObjects.forEach(bullet => {
            const dx = bullet.x - this.player.x;
            const dy = bullet.y - this.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < radius) {
                bullet.active = false;
                // Note: This is for enemy bullets, not player bullets, so no combo tracking needed
            }
        });
        
    }
    
    updateHUD() {
        const ctx = this.ctx;
        const barX = 60; // Close to triforce (triforce rightmost pixel ≈ x=53)
        const barY = 20;
        const barHeight = 30;
        const barWidth = 220;
        const bevelSize = 12;
        const segments = 10; // Number of segments for the bar
        
        ctx.save();

        // Draw triforce (lives indicator) on canvas — same layer as HP bar, coins, level
        this.drawCanvasTriforce(ctx, this.game.lives, 10, barY);

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
        
        // Draw background container
        createHealthBarPath(barWidth);
        ctx.fillStyle = 'rgba(10, 40, 80, 0.8)';
        ctx.fill();
        
        // Draw subtle border
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
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)'; // Fixed opacity instead of undefined pulseIntensity
            ctx.lineWidth = 3;
            createHealthBarPath(barWidth);
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw filled health bar with gradient
        if (filledWidth > 0) {

            // Lazily create and cache the 3 tier gradients (constant coordinates)
            if (!this._hpGradients) {
                const gHigh = ctx.createLinearGradient(60, 20, 60, 50);
                gHigh.addColorStop(0, 'rgba(0, 150, 255, 0.95)');
                gHigh.addColorStop(0.3, 'rgba(0, 120, 255, 0.9)');
                gHigh.addColorStop(0.7, 'rgba(0, 90, 255, 0.85)');
                gHigh.addColorStop(1, 'rgba(0, 60, 220, 0.8)');

                const gMid = ctx.createLinearGradient(60, 20, 60, 50);
                gMid.addColorStop(0, 'rgba(255, 255, 0, 0.95)');
                gMid.addColorStop(0.3, 'rgba(255, 220, 0, 0.9)');
                gMid.addColorStop(0.7, 'rgba(255, 180, 0, 0.85)');
                gMid.addColorStop(1, 'rgba(220, 140, 0, 0.8)');

                const gLow = ctx.createLinearGradient(60, 20, 60, 50);
                gLow.addColorStop(0, 'rgba(255, 50, 50, 0.95)');
                gLow.addColorStop(0.3, 'rgba(255, 20, 20, 0.9)');
                gLow.addColorStop(0.7, 'rgba(220, 0, 0, 0.85)');
                gLow.addColorStop(1, 'rgba(180, 0, 0, 0.8)');

                this._hpGradients = { high: gHigh, mid: gMid, low: gLow };
            }

            const tier = healthPercentage > 0.6 ? 'high' : healthPercentage > 0.3 ? 'mid' : 'low';
            const gradient = this._hpGradients[tier];

            createHealthBarPath(filledWidth);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Add subtle inner glow
            createHealthBarPath(filledWidth);
            ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // Remove segmentation lines for cleaner look
        
        // Draw XP bar at the bottom of the health bar
        this.drawXPBar(ctx, barX, barY, barWidth, barHeight);

        // Draw HP text below the health bar with matching colors
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
        const textY = barY + barHeight + 12; // Position below the bar with more margin
        
        // Draw heart icon to the left of health text
        const hpTextWidth = ctx.measureText(hpText).width;
        
        const heartIconSize = 24;
        const heartIconX = textX - hpTextWidth/2 - heartIconSize - 4; // Position to the left of health text with margin
        const heartIconY = textY + 5;
        
        drawCachedHeartIcon(ctx, heartIconX, heartIconY, heartIconSize, '#800000', '#DC143C');
        
        // Draw text outline
        ctx.strokeText(hpText, textX, textY);
        // Draw text fill
        ctx.fillText(hpText, textX, textY);

        // Shield icon and level display moved to bottom bar next to coins for cleaner layout

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
        
        // Shield tanks display removed - was causing green square overlay
        // Tanks are now managed internally without DOM elements
        
        // Draw level and coins beneath lives and health bar
        this.drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight);
        
        // Draw survival timer at bottom left
        this.drawSurvivalTimer(ctx);
    }
    
    findNearestEnemy() {
        if (!this.player) return null;
        let nearest = null;
        let nearestDist = Infinity;
        const check = (obj) => {
            if (!obj.active) return;
            const dx = obj.x - this.player.x;
            const dy = obj.y - this.player.y;
            const dist = Math.hypot(dx, dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = obj;
            }
        };
        this.enemyPool.activeObjects.forEach(check);
        this.asteroidPool.activeObjects.forEach(check);
        return nearest;
    }

    drawSurvivalTimer(ctx) {
        // Position at bottom left of screen
        const timerX = 20;
        const timerY = this.canvas.height - 40;
        
        ctx.save();
        
        // Format survival time as H:M:SS:mmm
        const totalMs = this.game.survivalTime || 0;
        const hours = Math.floor(totalMs / (1000 * 60 * 60));
        const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
        const milliseconds = totalMs % 1000;
        
        const timeString = `${hours}:${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
        
        // Draw stopwatch SVG icon
        const iconSize = 24;
        const iconX = timerX;
        const iconY = timerY - iconSize/2;
        
        this.drawStopwatchIcon(ctx, iconX, iconY, iconSize);
        
        // Draw time text
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFA500'; // Subdued orange color
        ctx.strokeStyle = '#CC8400'; // Darker orange for outline
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const textX = iconX + iconSize + 8;
        
        // Draw text outline
        ctx.strokeText(timeString, textX, timerY);
        // Draw text fill
        ctx.fillText(timeString, textX, timerY);
        
        ctx.restore();
    }
    
    drawPauseButton() {
        const btnSize = 44; // touch-friendly hit area
        const margin = 16;
        const cx = this.canvas.width - margin - btnSize / 2;
        const cy = margin + btnSize / 2;

        // Store rect in screen coords for tap detection
        this.pauseButtonRect = { x: cx - btnSize / 2, y: cy - btnSize / 2, w: btnSize, h: btnSize };

        const ctx = this.ctx;
        ctx.save();

        // Subtle dark backing circle
        ctx.beginPath();
        ctx.arc(cx, cy, btnSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();

        // Two vertical bars — match timer color
        const barW = Math.round(btnSize * 0.16);
        const barH = Math.round(btnSize * 0.48);
        const gap  = Math.round(btnSize * 0.11);
        const barTop = cy - barH / 2;

        ctx.fillStyle = '#FFA500';
        ctx.strokeStyle = '#CC8400';
        ctx.lineWidth = 1;

        // Left bar
        ctx.beginPath();
        ctx.rect(cx - gap - barW, barTop, barW, barH);
        ctx.fill();
        ctx.stroke();

        // Right bar
        ctx.beginPath();
        ctx.rect(cx + gap, barTop, barW, barH);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    drawStopwatchIcon(ctx, x, y, size) {
        ctx.save();
        
        // Scale and position the SVG
        const scale = size / 24; // Original SVG is 24x24
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        
        // Set subdued orange color for the stopwatch
        ctx.strokeStyle = '#FFA500';
        ctx.fillStyle = 'none';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Main circle (outer)
        ctx.beginPath();
        ctx.arc(11.7, 13.5, 7, 0, Math.PI * 2);
        ctx.stroke();
        
        // Center dot
        ctx.beginPath();
        ctx.arc(11.2125, 13.965, 1.5, 0, Math.PI * 2);
        ctx.stroke();
        
        // Top button
        ctx.beginPath();
        ctx.moveTo(10.95, 6.5);
        ctx.lineTo(10.95, 3.5);
        ctx.lineTo(12.45, 3.5);
        ctx.lineTo(12.45, 6.5);
        ctx.stroke();
        
        // Clock hand
        ctx.beginPath();
        ctx.moveTo(11.2125, 13.965);
        ctx.lineTo(15.1279, 11.0236);
        ctx.stroke();
        
        // Top crown
        ctx.beginPath();
        ctx.moveTo(9.75, 2.75);
        ctx.lineTo(13.65, 2.75);
        ctx.stroke();
        
        // Side buttons (simplified)
        ctx.beginPath();
        ctx.moveTo(17.9637, 5.90252);
        ctx.lineTo(16.0137, 8.10252);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(4.338, 6.92358);
        ctx.lineTo(6.3855, 9.02358);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawCanvasTriforce(ctx, lives, baseX, baseY) {
        const triangleSize = 12;
        const spacing = 2;
        const centerX = baseX + 30; // Center of the 60px-wide triforce slot
        const topY = baseY + 8;
        const bottomY = topY + triangleSize + spacing - 1;

        const drawTri = (cx, cy) => {
            const h = triangleSize * 0.866;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h / 2);
            ctx.lineTo(cx - triangleSize / 2, cy + h / 2);
            ctx.lineTo(cx + triangleSize / 2, cy + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };

        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 1;

        const topTri  = { x: centerX, y: topY };
        const btmLeft = { x: centerX - (triangleSize / 2 + spacing / 2), y: bottomY };
        const btmRight = { x: centerX + (triangleSize / 2 + spacing / 2), y: bottomY };

        if (lives >= 3) {
            drawTri(topTri.x, topTri.y);
            drawTri(btmLeft.x, btmLeft.y);
            drawTri(btmRight.x, btmRight.y);
        } else if (lives === 2) {
            drawTri(btmLeft.x, btmLeft.y);
            drawTri(btmRight.x, btmRight.y);
        } else if (lives === 1) {
            drawTri(btmLeft.x, btmLeft.y);
        }

        ctx.restore();
    }

    drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) {
        const livesX = 10; // Same as lives display position
        const triforceWidth = 60; // Triforce canvas width from ui-manager.js
        const triforceCenterX = livesX + triforceWidth / 2; // Center of triforce at x=40
        
        ctx.save();
        
        // Level display beneath the triforce (lives) - first line
        const levelY = barY + barHeight + 26; // 20px below health bar for more space
        
        // Draw shield icon with "LV" text beneath lives, centered with triforce
        const shieldIconSize = 30; // Slightly larger shield icon
        const shieldIconX = triforceCenterX - shieldIconSize / 2; // Center shield with triforce
        const shieldCenterX = shieldIconX + shieldIconSize / 2;
        const shieldCenterY = levelY;
        
        // Draw shield icon
        drawCachedShieldIcon(ctx, shieldCenterX, shieldCenterY, shieldIconSize);
        
        // Draw "LV" text inside the shield icon
        ctx.save();
        ctx.font = "10px 'Press Start 2P', monospace"; // Larger font for larger icon
        ctx.fillStyle = '#102342'; // Dark blue color
        ctx.strokeStyle = '#155379'; // gray-blue stroke outline
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw "LV" text with stroke outline inside shield
        ctx.strokeText('LV', shieldCenterX, shieldCenterY);
        ctx.fillText('LV', shieldCenterX, shieldCenterY);
        ctx.restore();
        
        // Draw level number to the right of shield
        const levelNumberX = shieldIconX + shieldIconSize + 10;
        ctx.font = "14px 'Press Start 2P', monospace"; // Original level number size
        ctx.fillStyle = '#4A90E2'; // Blue color for level number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const levelNumber = `${this.player.level}`;
        ctx.strokeText(levelNumber, levelNumberX, levelY);
        ctx.fillText(levelNumber, levelNumberX, levelY);
        
        // Coins display on its own line beneath the level - second line
        const coinsY = levelY + 40; // 30px below level for more spacing
        
        // Draw coin icon, centered with triforce
        const coinIconSize = 30; // Larger coin icon
        const coinIconX = triforceCenterX - coinIconSize / 2; // Center coin with triforce
        const coinIconY = coinsY - coinIconSize/2;
        
        drawCachedMoneyIcon(ctx, coinIconX + coinIconSize/2, coinIconY + coinIconSize/2, coinIconSize, '#FFD700', '#B8860B');
        
        // Draw coins text
        const coinsTextX = coinIconX + coinIconSize + 10;
        ctx.font = "14px 'Press Start 2P', monospace"; // Original coins text size
        ctx.fillStyle = '#FFD700'; // Gold color for coins
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const coinsText = `${Math.floor(this.game.money)}`;
        ctx.strokeText(coinsText, coinsTextX, coinsY);
        ctx.fillText(coinsText, coinsTextX, coinsY);
        
        ctx.restore();
    }
    
    drawLevelUpText() {
        if (!this.player || !this.player.levelUpTextInfo || !this.player.levelUpTextInfo.active) {
            return;
        }
        
        const { level, progress } = this.player.levelUpTextInfo;
        const screenWidth = this.width;
        const screenHeight = this.height;
        
        // Position text at the bottom of the screen
        const textY = screenHeight - 80; // 80px from bottom
        const centerX = screenWidth / 2;
        
        this.ctx.save();
        
        // Calculate fade in/out effect
        let textAlpha = 1;
        if (progress < 0.2) {
            // Fade in for first 20% of animation
            textAlpha = progress / 0.2;
        } else if (progress > 0.7) {
            // Fade out for last 30% of animation
            textAlpha = (1 - progress) / 0.3;
        }
        
        // Pulsing effect
        const pulseIntensity = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
        const scale = 1 + pulseIntensity * 0.1;
        
        this.ctx.globalAlpha = textAlpha * pulseIntensity;
        this.ctx.translate(centerX, textY);
        this.ctx.scale(scale, scale);
        
        // Draw level up text with outline
        this.ctx.font = 'bold 32px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Text outline (black)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(`LEVEL ${level}!`, 0, -15);
        
        // Main text (gold)
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillText(`LEVEL ${level}!`, 0, -15);
        
        // Subtitle text
        this.ctx.font = '16px "Press Start 2P", monospace';
        this.ctx.fillStyle = '#FFA500';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeText('Skill Point Gained!', 0, 15);
        this.ctx.fillText('Skill Point Gained!', 0, 15);
        
        this.ctx.restore();
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
            this.player.health = Math.max(0, this.player.health - finalDamage);
            
            // Award XP for surviving asteroid collision
            this.player.gainExperience(4);

            // Handle death/shield tank usage
            if (this.player.health <= 0) {
                if (this.shieldTanks > 0) {
                    // Use shield tank to restore health (no life lost)
                    this.shieldTanks--;
                    this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                    this.player.health = this.player.getEffectiveMaxHealth();
                    this.audioManager.playCoin(); // Tank used sound
                    this.player.makeInvincible(2000); // Brief invincibility after revival
                } else {
                    // No shield tanks - lose a life and respawn
                    this.handlePlayerDeath();
                    return;
                }
            }

            // Visual and audio feedback
            this.player.makeInvincible(3000); // 3 seconds of invincibility
            this.audioManager.playHit();
            this.particlePool.get(this.player.x, this.player.y, 'damageNumber', finalDamage);
            this.particlePool.get(this.player.x, this.player.y, 'shieldHit', this.player.radius);
            this.audioManager.playShield();
            
            // Screen shake for asteroid collision
            this.triggerScreenShake(20, 12, asteroid.radius); // Significant screen shake
        }

        // Always damage the asteroid when colliding with player (massive damage)
        const asteroidCollisionDamage = 25; // Massive damage to asteroids
        asteroid.health = Math.max(0, asteroid.health - asteroidCollisionDamage);
        if (this.isEntityOnScreen(asteroid)) {
            this.createDamageNumber(asteroid.x, asteroid.y - asteroid.baseRadius, asteroidCollisionDamage);
        }
        
        // Check if asteroid is destroyed
        if (asteroid.health <= 0) {
            // Award XP and money for destroying asteroid
            this.player.gainExperience(8);
            this.game.money += 10; // Bonus money for collision destruction
            
            // Screen shake for collision destruction (only if on screen)
            if (this.isEntityOnScreen(asteroid)) {
                this.triggerScreenShake(20, asteroid.baseRadius * 0.7, asteroid.baseRadius);
            }
            
            // Create destruction effects
            this.createDebris(asteroid);
            this.dropOrbsFromEntity(asteroid.x, asteroid.y, asteroid);
            this.asteroidPool.release(asteroid);
            return; // Exit early if asteroid is destroyed
        }

        // Asteroid bounces off player
        const astSpeed = Math.hypot(asteroid.vel.x, asteroid.vel.y);
        const knockbackAngle = Math.atan2(this.player.y - asteroid.y, this.player.x - asteroid.x);

        // Calculate knockback magnitude based on asteroid's trajectory and player's mass
        const totalMass = this.player.mass + asteroid.mass;
        const dvn = (this.player.vel.x - asteroid.vel.x) * Math.cos(knockbackAngle) + (this.player.vel.y - asteroid.vel.y) * Math.sin(knockbackAngle);
        const enhancedImpulse = 2 * dvn / totalMass;

        // Apply MUCH MORE DRASTIC knockback multiplier
        const knockbackMultiplier = 12.0; // Increased from 8.0 to 12.0 for more visible bounce
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
        
        // No screen shake for asteroid-asteroid collisions - only player-related events should shake
    }
    
    drawSpawnTimer() {
        const ctx = this.ctx;
        const now = Date.now();
        
        // Calculate time until next spawn (based on last spawn + interval)
        const timeSinceLastSpawn = now - this.lastSpawnTime;
        const timeUntilSpawn = Math.max(0, this.spawnInterval - timeSinceLastSpawn);
        const spawnProgress = Math.min(1, timeSinceLastSpawn / this.spawnInterval);
        
        // Calculate time until next shop
        const timeUntilShop = Math.max(0, this.nextShopTime - now);
        const shopProgress = 1 - (timeUntilShop / this.shopInterval);
        
        // Timer position - vertically stacked on the right side
        const timerX = this.width - 60; // Right side of screen
        const startY = 40;
        const radius = 20; // Smaller radius
        const verticalSpacing = 60;
        
        ctx.save();
        ctx.globalAlpha = 0.7; // More in background
        
        // Draw spawn timer (top) - shows generic "entity" icon
        const spawnY = startY;
        this.drawCircularTimer(ctx, timerX, spawnY, radius, spawnProgress, '#00ff88', '⚡', timeUntilSpawn);
        
        // Draw shop timer (bottom) - disabled per user request
        // if (timeUntilShop > 30000) {
        //     const shopY = startY + verticalSpacing;
        //     this.drawCircularTimer(ctx, timerX, shopY, radius, shopProgress, '#ffaa00', '🛒', timeUntilShop);
        // }
        
        // Draw hit streak combo counter (bottom right)
        if (this.player.hitStreak >= 2) {
            const comboX = this.width - 20;
            const comboY = this.height - 40;
            
            ctx.save();
            
            // shadowBlur on text — glow follows text shape
            const glowSize = Math.min(10, this.player.hitStreak * 0.5);
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = glowSize;
            
            // Draw combo text
            ctx.font = `${Math.min(32, 20 + this.player.hitStreak * 0.5)}px 'Press Start 2P', monospace`;
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            
            const comboText = `${this.player.hitStreak}x`;
            ctx.strokeText(comboText, comboX, comboY);
            ctx.fillText(comboText, comboX, comboY);
            
            // Draw "COMBO" label below
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowBlur = 0;
            ctx.strokeText('COMBO', comboX, comboY + 15);
            ctx.fillText('COMBO', comboX, comboY + 15);
        
        ctx.restore();
        }
        
        ctx.restore();
    }
    
    drawXPBar(ctx, barX, barY, barWidth, barHeight) {
        // XP bar dimensions - positioned at the bottom of the health bar
        const xpBarHeight = 8;
        const xpBarY = barY + barHeight - xpBarHeight;
        const bevelSize = 12; // Match health bar bevel exactly
        
        // Calculate XP progress
        const xpProgress = this.player.getExperienceProgress();
        const filledWidth = barWidth * xpProgress;
        
        ctx.save();
        
        // Use the EXACT same health bar clipping path, then clip to bottom section
        const createHealthBarPath = (width) => {
            ctx.beginPath();
            // Exact copy of health bar path
            ctx.moveTo(barX + bevelSize, barY);
            ctx.lineTo(barX + width - bevelSize * 0.5, barY);
            ctx.lineTo(barX + width, barY + bevelSize);
            ctx.lineTo(barX + width, barY + barHeight - bevelSize);
            ctx.lineTo(barX + width - bevelSize, barY + barHeight);
            ctx.lineTo(barX + bevelSize * 0.5, barY + barHeight);
            ctx.lineTo(barX, barY + barHeight - bevelSize);
            ctx.lineTo(barX, barY + bevelSize);
            ctx.closePath();
        };
        
        // First, clip to the health bar shape
        createHealthBarPath(barWidth);
        ctx.clip();
        
        // Then clip to just the bottom portion for XP bar
        ctx.beginPath();
        ctx.rect(barX - 5, xpBarY, barWidth + 10, xpBarHeight);
        ctx.clip();
        
        // Draw XP bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(barX - 5, xpBarY, barWidth + 10, xpBarHeight);
        
        // Draw segmented XP fill with precise clipping
        if (filledWidth > 0) {
            // Lazily create and cache the XP bar gradient (constant coordinates)
            if (!this._xpBarGradient) {
                const g = ctx.createLinearGradient(barX, xpBarY, barX, xpBarY + xpBarHeight);
                g.addColorStop(0, '#FF6B35'); // Bright orange-vermilion top
                g.addColorStop(0.5, '#FF4500'); // Orange-red middle
                g.addColorStop(1, '#CC3300'); // Deep vermilion bottom
                this._xpBarGradient = g;
            }
            const gradient = this._xpBarGradient;
            
            // Draw the filled area as one solid shape
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, xpBarY, filledWidth, xpBarHeight);
            
            // Add inner highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(barX, xpBarY, filledWidth, 1);
            
            // Draw segment separators over the filled area
            const segments = 20;
            const segmentWidth = barWidth / segments;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            
            for (let i = 1; i < segments; i++) {
                const separatorX = barX + (i * segmentWidth);
                if (separatorX < barX + filledWidth) {
                    ctx.fillRect(separatorX, xpBarY, 0.5, xpBarHeight);
                }
            }
        }
        
        ctx.restore();
    }
    
    drawCircularTimer(ctx, x, y, radius, progress, color, icon, timeRemaining) {
        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw progress arc
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
        ctx.stroke();
        
        // Draw icon in center
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x, y);
        
        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        let timeText;
        if (totalSeconds >= 60) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            timeText = `${totalSeconds}s`;
        }
        
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(timeText, x, y + radius + 6);
    }
    
    drawRespawnCountdown() {
        const ctx = this.ctx;
        const now = Date.now();
        const elapsed = now - this.game.respawnStartTime;
        const progress = Math.min(1, elapsed / this.game.respawnDuration);
        const timeRemaining = this.game.respawnDuration - elapsed;
        
        // Draw at center of screen
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 40;
        
        ctx.save();
        
        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw progress arc (countdown)
        ctx.strokeStyle = '#00aaff'; // Blue color
        ctx.lineWidth = 6;
        ctx.beginPath();
        // Start from top and go clockwise, showing remaining time
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + ((1 - progress) * Math.PI * 2));
        ctx.stroke();
        
        // Draw respawn icon in center
        ctx.font = '24px "Press Start 2P", monospace';
        ctx.fillStyle = '#00aaff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', centerX, centerY);
        
        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        const timeText = `${totalSeconds}s`;
        
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Removed "RESPAWNING" text - only show countdown
        ctx.fillText(timeText, centerX, centerY + radius + 10);
        
        ctx.restore();
    }
    
    drawInvincibilityCountdown() {
        const ctx = this.ctx;
        const timeRemaining = this.player.invincibilityTimer;
        const totalDuration = this.game.respawnDuration; // 5 seconds
        const progress = 1 - (timeRemaining / totalDuration);
        
        // Draw at center of screen, smaller than respawn timer
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 30;
        
        ctx.save();
        
        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw progress arc (countdown) - showing remaining time
        ctx.strokeStyle = '#ffaa00'; // Orange color for invincibility
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Start from top and go clockwise, showing remaining time
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + ((1 - progress) * Math.PI * 2));
        ctx.stroke();
        
        // Draw shield icon in center
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡', centerX, centerY);
        
        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        const timeText = `${totalSeconds}s`;
        
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('INVINCIBLE', centerX, centerY + radius + 8);
        ctx.fillText(timeText, centerX, centerY + radius + 24);
        
        ctx.restore();
    }
    
    drawGhostPreviews(spawnProgress) {
        const ctx = this.ctx;
        
        // Only show ghost when progress is > 0.5 (last 50% of countdown)
        if (spawnProgress > 0.5) {
            // Randomly show either enemy or asteroid ghost (50/50 chance)
            if (Math.random() < 0.5) {
                this.drawGhostEnemy(spawnProgress);
            } else {
                this.drawGhostAsteroid(spawnProgress);
            }
        }
    }
    
    generateGhostPosition() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        
        switch (side) {
            case 0: // Top
                x = Math.random() * this.gameField.width;
                y = -50;
                break;
            case 1: // Right
                x = this.gameField.width + 50;
                y = Math.random() * this.gameField.height;
                break;
            case 2: // Bottom
                x = Math.random() * this.gameField.width;
                y = this.gameField.height + 50;
                break;
            case 3: // Left
                x = -50;
                y = Math.random() * this.gameField.height;
                break;
        }
        
        return { x, y };
    }
    
    drawGhostEnemy(progress) {
        const ctx = this.ctx;
        
        // Use stored ghost position
        const ghostX = this.ghostEnemyPosition.x;
        const ghostY = this.ghostEnemyPosition.y;
        
        ctx.save();
        
        // Ghost effect - semi-transparent and flickering
        const alpha = 0.3 + (Math.sin(Date.now() * 0.01) * 0.1);
        ctx.globalAlpha = alpha * (progress - 0.3) / 0.7; // Fade in as progress increases
        
        // Draw ghost enemy outline
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed outline
        
        // Draw basic enemy shape (triangle)
        const size = 15;
        ctx.beginPath();
        ctx.moveTo(ghostX, ghostY - size);
        ctx.lineTo(ghostX - size, ghostY + size);
        ctx.lineTo(ghostX + size, ghostY + size);
        ctx.closePath();
        ctx.stroke();
        
        // Draw construction progress indicator
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ghostX, ghostY, size + 5, -Math.PI / 2, -Math.PI / 2 + ((progress - 0.3) / 0.7) * Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawGhostAsteroid(progress) {
        const ctx = this.ctx;
        
        // Use stored ghost position
        const ghostX = this.ghostAsteroidPosition.x;
        const ghostY = this.ghostAsteroidPosition.y;
        
        ctx.save();
        
        // Ghost effect - semi-transparent and flickering
        const alpha = 0.3 + (Math.sin(Date.now() * 0.008) * 0.1);
        ctx.globalAlpha = alpha * (progress - 0.3) / 0.7; // Fade in as progress increases
        
        // Draw ghost asteroid outline
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed outline
        
        // Draw basic asteroid shape (irregular polygon)
        const size = 20;
        const sides = 8;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const variance = 0.7 + Math.sin(i * 2.3) * 0.3; // Irregular shape
            const x = ghostX + Math.cos(angle) * size * variance;
            const y = ghostY + Math.sin(angle) * size * variance;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
        
        // Draw construction progress indicator
        ctx.setLineDash([]);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ghostX, ghostY, size + 5, -Math.PI / 2, -Math.PI / 2 + ((progress - 0.3) / 0.7) * Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
} 
