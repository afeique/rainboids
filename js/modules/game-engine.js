// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './constants.js';
import { random, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon, glowSpriteCache } from './utils.js';
import { rgba } from './color-cache.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { nebulaRenderer } from './performance/nebula-renderer.js';
import { SpatialGrid } from './performance/spatial-grid.js';
import { PoolManager } from './pool-manager.js';
import { frameClock } from './frame-clock.js';
import { Player } from './entities/player.js';
import { Bullet } from './entities/bullet.js';
import { Asteroid } from './entities/asteroid.js';
import { Enemy } from './entities/enemy.js';
import { EnemyBullet } from './entities/enemy-bullet.js';
import { Particle } from './entities/particle.js';
import { ColorStar } from './entities/color-star.js';
import { BackgroundStar } from './entities/background-star.js';
import { LineDebris } from './entities/line-debris.js';
import { Powerup } from './entities/powerup.js';
import { PRIMARY_WEAPONS, PRIMARY_UPGRADES, POWER_WEAPONS, POWER_UPGRADES, DEFENSE_SKILLS, SKILL_UPGRADES } from './weapon-data.js';
import { GameStateMachine } from './core/game-state.js';
import { EventBus } from './core/event-bus.js';
import { GameTimer } from './core/game-timer.js';
import * as hud from './rendering/hud-renderer.js';
import * as shopRenderer from './rendering/shop-renderer.js';
import * as cam from './systems/camera-manager.js';
import * as shop from './systems/shop-manager.js';
import * as wave from './systems/wave-manager.js';
import * as col from './systems/collision-system.js';

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
        this._defenseSkillsRef = DEFENSE_SKILLS; // Expose for UI manager skill slots
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // State machine — owns all game state transitions with validation + epoch guards
        this.stateMachine = new GameStateMachine(GAME_STATES.TITLE_SCREEN);

        // Event bus — cross-system pub/sub for decoupled communication
        this.events = new EventBus();

        // Frame-counted timers — only advance during PLAYING/WAVE_TRANSITION
        this._gameTimers = [];

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
        this.baseDamage = 2; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();

        // Pre-allocated typed arrays for drawOffScreenIndicators (avoid per-frame GC)
        const _SEGMENTS = 24;
        this._edgeGlow = [new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS)];
        this._blurTemp = new Float32Array(_SEGMENTS);

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
        // Reset state machine to title screen
        this.stateMachine.forceState(GAME_STATES.TITLE_SCREEN);

        this.game = {
            money: 0,
            survivalTime: 0, // Time survived in milliseconds
            survivalRecord: parseInt(localStorage.getItem('rainboidsSurvivalRecord')) || 0, // Best survival time
            gameStartTime: 0, // When the current game started
            currentWave: 0,
            lives: 3, // Start with 3 lives
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

        // Wire this.game.state as getter/setter to the state machine
        // so all existing reads (this.game.state === X) work unchanged
        // while writes go through validation
        const sm = this.stateMachine;
        Object.defineProperty(this.game, 'state', {
            get() { return sm.state; },
            set(newState) { sm.transition(newState); },
            enumerable: true,
            configurable: true
        });
        
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
        const btnSize = 56;
        const margin = 12;
        const hitPad = 10;
        this.pauseButtonRect = {
            x: window.innerWidth - margin - btnSize - hitPad,
            y: margin - hitPad,
            w: btnSize + hitPad * 2,
            h: btnSize + hitPad * 2
        };
        
        // Camera and game field system
        this.gameField = {
            width: GAME_CONFIG.FIELD_WIDTH,
            height: GAME_CONFIG.FIELD_HEIGHT
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
        this.particlePool = new PoolManager(Particle, 50); // Cap is MAX_PARTICLES=50
        this.lineDebrisPool = new PoolManager(LineDebris, 20); // Reduced from 100
        this.asteroidPool = new PoolManager(Asteroid, 5);  // Reduced from 20
        this.enemyPool = new PoolManager(Enemy, 5);        // Reduced from 15
        this.enemyBulletPool = new PoolManager(EnemyBullet, 20); // Reduced from 50
        this.colorStarPool = new PoolManager(ColorStar, GAME_CONFIG.COLOR_STAR_COUNT + 10);
        this.backgroundStarPool = new PoolManager(BackgroundStar, GAME_CONFIG.BACKGROUND_STAR_COUNT * 4);
        this.powerupPool = new PoolManager(Powerup, 5); // Reduced from 20

        // OPT-8: Spatial grid for O(1) insert / O(k) collision query
        this.spatialGrid = new SpatialGrid(this.gameField.width, this.gameField.height, 8, 6);

        // OPT-7: Temporal upsampling — 60Hz logic, display-rate render with interpolation.
        this.useTemporalUpsampling = true;
        this.logicTickRate = GAME_CONFIG.LOGIC_TICK_MS; // 60 Hz fixed timestep
        this.logicAccumulator = 0;
        this.maxLogicStepsPerFrame = 4;         // spiral-of-death guard (bumped for higher tick rate)
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
                    'KeyU': 'LONG_RANGE',
                    'KeyI': 'EXPLOSIVE',
                    'KeyO': 'CRIT_CHANCE',
                    'KeyP': 'CRIT_DAMAGE',
                    'KeyA': 'SHIELD_BOOST',
                    'KeyS': 'MEDPACK',
                    'KeyD': 'CHARGE_DAMAGE',
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
                    for (const [key, bounds] of Object.entries(this.shopTabBounds)) {
                        if (clickX >= bounds.x && clickX <= bounds.x + bounds.width &&
                            clickY >= bounds.y && clickY <= bounds.y + bounds.height) {
                            this.shopCategory = key.toUpperCase();
                            this.shopScrollOffset = 0;
                            this._rebuildShopCache();
                            return;
                        }
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
                                this._shopFlash = { time: performance.now(), color: 'rgba(0, 255, 128, 0.15)' };
                            } else {
                                this._shopFlash = { time: performance.now(), color: 'rgba(255, 60, 60, 0.2)' };
                            }
                            break;
                        }
                    }
                }
            }
        });

        // Mouse move tracking for hover effects and cursor (desktop only)
        this.canvas.addEventListener('mousemove', (e) => {
                // Skip on mobile — synthetic mouse events from touch must not set cursor
                if (this.inputHandler && this.inputHandler.isMobile()) return;

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
                                    this._shopFlash = { time: performance.now(), color: 'rgba(0, 255, 128, 0.15)' };
                                } else {
                                    this._shopFlash = { time: performance.now(), color: 'rgba(255, 60, 60, 0.2)' };
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
        // Cancel any pending game timers from previous game
        for (let i = 0; i < this._gameTimers.length; i++) this._gameTimers[i].cancel();
        this._gameTimers.length = 0;

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

        // Generate nebula background (pre-rendered, no per-frame cost)
        nebulaRenderer.generate(this.gameField.width, this.gameField.height);
        
        // Initialize first wave with intro message and delay
        this.game.currentWave = 1;
        this.game.waveComplete = false;
        this.uiManager.updateLives(this.game.lives);
        this.game.state = GAME_STATES.WAVE_TRANSITION;

        // Show wave 1 intro with personality
        this.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: 3000,
            title: 'WAVE 1',
            subtitle: this.getWaveSubtitle(1),
        };

        // Delay spawning until message has been read (GameTimer — pauses with game)
        this._gameTimers.push(new GameTimer(2000, () => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
                this.spawnWaveEntities();
            }
        }));
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
        const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
        newAst.vel = { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd };
    }
    
    createDebris(ast) {
        // Derive explosion color from the asteroid's unique hue
        const hue = ast.baseHue || 0;
        const sat = ast.saturation || 90;
        const lit = ast.lightness || 70;
        const baseColor = `hsl(${hue}, ${sat}%, ${lit}%)`;
        const brightColor = `hsl(${hue}, ${sat}%, ${Math.min(95, lit + 20)}%)`;
        const dimColor = `hsl(${(hue + 20) % 360}, ${sat}%, ${Math.max(40, lit - 15)}%)`;
        const sizeScale = Math.min(1.5, ast.baseRadius / 25);
        const onScreen = this.isEntityOnScreen(ast);
        const isLarge = ast.baseRadius > (GAME_CONFIG.MIN_AST_RAD + 5);

        // ── Kill juice: hitstop + camera kick + screen flash ──
        if (onScreen) {
            this.triggerHitstop(isLarge ? 6 : 4);
            this.triggerScreenFlash(isLarge ? 0.1 : 0.06, 2);
            const kdx = this.player.x - ast.x;
            const kdy = this.player.y - ast.y;
            this.triggerCameraKick(kdx, kdy, isLarge ? 12 : 7);
        }

        // 1. Bright white core flash — bigger pop
        this.particlePool.get(ast.x, ast.y, 'explosionFlash', ast.baseRadius * 1.8 * sizeScale);

        // 2. Expanding colored rings
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.5 * sizeScale, baseColor);
        setTimeout(() => {
            this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 3.2 * sizeScale, dimColor);
        }, 60);

        // 3. Directional shrapnel streaks in asteroid color
        const shrapnelCount = Math.floor(12 + 8 * sizeScale);
        for (let i = 0; i < shrapnelCount; i++) {
            const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.3, 0.3);
            const speed = random(5, 12) * sizeScale;
            const color = i % 3 === 0 ? brightColor : i % 3 === 1 ? baseColor : dimColor;
            this.particlePool.get(ast.x, ast.y, 'explosionShrapnel', angle, speed, color);
        }

        // 4. Lingering embers in asteroid's hue range
        const emberCount = Math.floor(8 + 5 * sizeScale);
        for (let i = 0; i < emberCount; i++) {
            const eHue = hue + random(-30, 30);
            const eColor = `hsl(${(eHue + 360) % 360}, ${sat}%, ${random(55, 80)}%)`;
            this.particlePool.get(ast.x, ast.y, 'explosionEmber', eColor);
        }

        // 5. Classic small particles for density
        for (let i = 0; i < 16; i++) {
            const p = this.particlePool.get(ast.x, ast.y, 'explosion');
            if (p) {
                p.color = i < 5 ? '#ffffff' : i < 10 ? baseColor : brightColor;
                const a = random(0, Math.PI * 2);
                const s = random(2, 7);
                p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                p.radius = random(1.5, 4.5);
            }
        }

        // 6. Line debris from wireframe edges
        ast.edges.forEach(edge => {
            const p1 = ast.vertices3D[edge[0]];
            const p2 = ast.vertices3D[edge[1]];
            this.lineDebrisPool.get(ast.x, ast.y, p1, p2, baseColor);
        });

        // 7. Delayed secondary burst (matches enemy death pattern)
        setTimeout(() => {
            for (let i = 0; i < 6; i++) {
                const ox = ast.x + random(-18, 18);
                const oy = ast.y + random(-18, 18);
                this.particlePool.get(ox, oy, 'explosionEmber', baseColor);
            }
        }, 70);
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
    
    updateWaveSystem() { return wave.updateWaveSystem.call(this); }

    getWaveSubtitle(waveNumber) { return wave.getWaveSubtitle.call(this, waveNumber); }

    showWaveComplete() { return wave.showWaveComplete.call(this); }
    
    // Method to draw wavy rainbow text for wave messages
    // Mobile-aware: scales font to fit within screen width with padding.
    drawWavyText(text, x, y, fontSize = 48) { return hud.drawWavyText.call(this, text, x, y, fontSize); }
    
    drawTitleScreen() { return hud.drawTitleScreen.call(this); }
    
    startNextWave() { return wave.startNextWave.call(this); }

    spawnWaveEntities() { return wave.spawnWaveEntities.call(this); }

    spawnAsteroids(count) { return wave.spawnAsteroids.call(this, count); }

    spawnEnemies(count) { return wave.spawnEnemies.call(this, count); }

    spawnLeveledAsteroids(count) { return wave.spawnLeveledAsteroids.call(this, count); }

    spawnLeveledEnemies(enemyType, count) { return wave.spawnLeveledEnemies.call(this, enemyType, count); }

    initializeLeveledAsteroid(asteroid) { return wave.initializeLeveledAsteroid.call(this, asteroid); }
    
    applyEnemyLevelScaling(enemy) { return wave.applyEnemyLevelScaling.call(this, enemy); }

    completeWave() { return wave.completeWave.call(this); }
    
    sellShopItem(itemId) { return shop.sellShopItem.call(this, itemId); }

    openShop() { return shop.openShop.call(this); }

    _rebuildShopCache() { return shop._rebuildShopCache.call(this); }

    _buildPrimaryTabItems() { return shop._buildPrimaryTabItems.call(this); }

    _buildPowerTabItems() { return shop._buildPowerTabItems.call(this); }

    _buildSkillsTabItems() { return shop._buildSkillsTabItems.call(this); }

    closeShop() { return shop.closeShop.call(this); }
    
    buyShopItem(itemId) { return shop.buyShopItem.call(this, itemId); }

    _handleWeaponBuyOrEquip(item) { return shop._handleWeaponBuyOrEquip.call(this, item); }

    _handleSkillBuy(item) { return shop._handleSkillBuy.call(this, item); }

    _handleUpgradeBuy(item) { return shop._handleUpgradeBuy.call(this, item); }
    
    getPowerupConfig(type) {
        // Return powerup configurations for shop items (includes icon + colors for HUD display)
        const configs = {
            'SHIELD_BOOST':             { name: 'Shielding',          duration: Infinity, icon: '🛡️', gradientColors: ['#33ff99', '#006644'] },
            'RAPID_FIRE':               { name: 'Rapid Fire',          duration: Infinity, icon: '⚡', gradientColors: ['#ff6600', '#ff0000'] },
            'MULTI_SHOT':               { name: 'Multi Shot',          duration: Infinity, icon: '✳️', gradientColors: ['#66aaff', '#0033cc'] },
            'SPEED_BOOST':              { name: 'Afterburner',         duration: Infinity, icon: '💨', gradientColors: ['#ffff33', '#cc9900'] },
            'BIG_BULLETS':              { name: 'Big Bullets',         duration: Infinity, icon: '🔵', gradientColors: ['#66ff66', '#009900'] },
            'PIERCING':                 { name: 'Piercing',            duration: Infinity, icon: '🏹', gradientColors: ['#ffcc66', '#cc6600'] },
            'EXPLOSIVE':                { name: 'Explosive',           duration: Infinity, icon: '💣', gradientColors: ['#ff9933', '#cc3300'] },
            'HOMING':                   { name: 'Homing',              duration: Infinity, icon: '🎯', gradientColors: ['#ff66cc', '#cc0066'] },
            'MEDPACK':                  { name: 'Medpack',             duration: Infinity, icon: '💊', gradientColors: ['#ff99cc', '#cc3366'] },
            'HEALTH_BOOST':             { name: 'Health Boost',        duration: Infinity, icon: '❤️', gradientColors: ['#ff6666', '#cc0000'] },
            'CRIT_CHANCE':              { name: 'Critical Chance',     duration: Infinity, icon: '⭐', gradientColors: ['#ffff66', '#cc9900'] },
            'CRIT_DAMAGE':              { name: 'Critical Damage',     duration: Infinity, icon: '🗡️', gradientColors: ['#ff3399', '#cc0033'] },
            'LONG_RANGE':               { name: 'Long Range',          duration: Infinity, icon: '🏹', gradientColors: ['#bbff66', '#448800'] },
            'CHARGE_SPEED':             { name: 'Charge Speed',        duration: Infinity, icon: '⏱️', gradientColors: ['#ffcc00', '#cc8800'] },
            'CHARGE_POWER':             { name: 'Charge Power',        duration: Infinity, icon: '🔋', gradientColors: ['#ff6600', '#cc3300'] },
            'HEALTH_ORB_DROP_CHANCE':   { name: 'Health Orb Luck',     duration: Infinity, icon: '🍀', gradientColors: ['#33ff99', '#009944'] },
            'MONEY_ORB_DROP_CHANCE':    { name: 'Money Orb Luck',      duration: Infinity, icon: '💰', gradientColors: ['#ffdd00', '#cc8800'] },
            'HEALTH_ORB_DROP_QUANTITY': { name: 'Health Orb Bounty',   duration: Infinity, icon: '💚', gradientColors: ['#66ff66', '#009900'] },
            'MONEY_ORB_DROP_QUANTITY':  { name: 'Money Orb Bounty',    duration: Infinity, icon: '🪙', gradientColors: ['#ffcc00', '#996600'] },
            'DOCTOR':                   { name: 'Doctor',              duration: Infinity, icon: '🏥', gradientColors: ['#ff6688', '#cc2244'] },
            'PAYDAY':                   { name: 'Payday',              duration: Infinity, icon: '💵', gradientColors: ['#66ff66', '#228822'] },
            'HIGH_ROLLER':              { name: 'High Roller',         duration: Infinity, icon: '🎰', gradientColors: ['#ffdd44', '#cc8800'] },
        };
        if (configs[type]) return configs[type];

        // Dynamic fallback for weapon/skill upgrades from weapon-data.js
        const allUpgrades = { ...PRIMARY_UPGRADES, ...POWER_UPGRADES, ...SKILL_UPGRADES };
        if (allUpgrades[type]) {
            const upg = allUpgrades[type];
            return { name: upg.name, duration: Infinity, icon: upg.icon, gradientColors: ['#aaaaff', '#4444aa'] };
        }
        return null;
    }

    onEnemyKill(enemy) {
        // Track kills for streak notifications
        if (!this.killCount) this.killCount = 0;
        if (!this.killStreakTimer) this.killStreakTimer = 0;
        if (!this.killStreakCount) this.killStreakCount = 0;

        this.killCount++;
        this.killStreakCount++;
        this.killStreakTimer = Date.now();

        // Rapid kill streak notifications (3+ kills within 3 seconds)
        const streakMessages = {
            3: 'TRIPLE KILL',
            5: 'RAMPAGE',
            8: 'UNSTOPPABLE',
            12: 'GODLIKE',
            20: 'LEGENDARY'
        };

        if (streakMessages[this.killStreakCount]) {
            this.queueNotification(streakMessages[this.killStreakCount],
                `+${this.killStreakCount * 10} bonus coins`, 2000);
            this.game.money += this.killStreakCount * 10;
        }

        // Milestone notifications
        const milestones = { 1: 'FIRST BLOOD', 25: '25 KILLS', 50: 'HALF CENTURY',
            100: 'CENTURION', 200: 'DESTROYER', 500: 'ANNIHILATOR' };
        if (milestones[this.killCount]) {
            this.queueNotification(milestones[this.killCount],
                `${this.killCount} enemies destroyed`, 2500);
        }
    }

    updateKillStreak() {
        // Reset streak if no kill in 3 seconds
        if (this.killStreakTimer && Date.now() - this.killStreakTimer > 3000) {
            this.killStreakCount = 0;
        }
    }

    queueNotification(title, subtitle, duration) { return wave.queueNotification.call(this, title, subtitle, duration); }

    processNotificationQueue() { return wave.processNotificationQueue.call(this); }

    drawShop() { return shopRenderer.drawShop.call(this); }
    
    drawShopTabs(shopX, tabY, shopWidth) { return shopRenderer.drawShopTabs.call(this, shopX, tabY, shopWidth); }
    
    drawShopItem(item, x, y, width, height, index, isHovered = false) { return shopRenderer.drawShopItem.call(this, item, x, y, width, height, index, isHovered); }
    
    drawMultilineText(text, x, startY, maxWidth, lineHeight, maxLines = null) { return shopRenderer.drawMultilineText.call(this, text, x, startY, maxWidth, lineHeight, maxLines); }
    
    startNewWave() { return wave.startNewWave.call(this); }
    
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
    
    initializeWaveAsteroid(asteroid) { return wave.initializeWaveAsteroid.call(this, asteroid); }
    
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
            const sp = this.getRandomSpawnPosition();
            const enemyType = this.getRandomEnemyType();
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            enemy.startWarpIn(sp.targetX, sp.targetY);
            return true;
        }

        // Method 2: Force create new enemy if pool failed
        try {
            const newEnemy = new Enemy();
            const sp = this.getRandomSpawnPosition();
            const enemyType = this.getRandomEnemyType();
            newEnemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            newEnemy.startWarpIn(sp.targetX, sp.targetY);
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

        // Minimap area: bottom-right corner (matches drawMinimap sizing)
        const minDim = Math.min(this.width, this.height);
        const mmSize = minDim < 500 ? Math.max(80, Math.floor(minDim * 0.22)) : 150;
        const mmMargin = mmSize < 120 ? 10 : 20;
        const minimapLeft = this.width - mmSize - mmMargin;
        const minimapTop = this.height - mmSize - mmMargin;
        const minimapRight = this.width - mmMargin;
        const minimapBottom = this.height - mmMargin;

        return screenX >= minimapLeft && screenX <= minimapRight &&
               screenY >= minimapTop && screenY <= minimapBottom;
    }
    
    getRandomSpawnPosition() { return wave.getRandomSpawnPosition.call(this); }

    getRandomEnemyType() { return wave.getRandomEnemyType.call(this); }
    
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
        const enemyType = this.getRandomEnemyType();
        const sp = this.getRandomSpawnPosition();

        const enemy = this.enemyPool.get();
        if (enemy) {
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            enemy.startWarpIn(sp.targetX, sp.targetY);
        } else {
            const newEnemy = new Enemy();
            newEnemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            newEnemy.startWarpIn(sp.targetX, sp.targetY);
            this.enemyPool.activeObjects.push(newEnemy);
        }
    }
    
    createEnemyDebris(enemy) {
        const color = enemy.color || '#ff4444';
        const sizeScale = Math.min(2, enemy.radius / 15);
        const onScreen = this.isEntityOnScreen(enemy);

        // ── Kill juice: hitstop + camera kick + screen flash ──
        if (onScreen) {
            this.triggerHitstop(8);   // longer than hit hitstop (3-5 frames)
            this.triggerScreenFlash(0.12, 3); // brief white overlay
            const kdx = this.player.x - enemy.x;
            const kdy = this.player.y - enemy.y;
            this.triggerCameraKick(kdx, kdy, 14);
        }

        // 1. Bright white core flash — the "pop"
        this.particlePool.get(enemy.x, enemy.y, 'explosionFlash', enemy.radius * 2.5 * sizeScale);

        // 2. Staggered colored rings in enemy color
        for (let ring = 0; ring < 3; ring++) {
            setTimeout(() => {
                const ringColor = ring === 0 ? '#ffffff' : color;
                this.particlePool.get(enemy.x, enemy.y, 'explosionRingColored',
                    (35 + ring * 30) * sizeScale, ringColor);
            }, ring * 50);
        }

        // 3. Directional shrapnel in enemy color — fast streaks flying outward
        const shrapnelCount = Math.floor(16 + 8 * sizeScale);
        for (let i = 0; i < shrapnelCount; i++) {
            const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.4, 0.4);
            const speed = random(6, 14) * sizeScale;
            const sColor = i % 3 === 0 ? '#ffffff' : color;
            this.particlePool.get(enemy.x, enemy.y, 'explosionShrapnel', angle, speed, sColor);
        }

        // 4. Lingering embers in enemy color
        const emberCount = Math.floor(10 + 6 * sizeScale);
        for (let i = 0; i < emberCount; i++) {
            this.particlePool.get(enemy.x, enemy.y, 'explosionEmber',
                i % 2 === 0 ? color : '#ffcc66');
        }

        // 5. Classic small particles for density (mix of white + enemy color)
        for (let i = 0; i < 20; i++) {
            const p = this.particlePool.get(enemy.x, enemy.y, 'explosion');
            if (p) {
                p.color = i < 6 ? '#ffffff' : color;
                const a = random(0, Math.PI * 2);
                const s = random(2, 8);
                p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                p.radius = random(1.5, 5);
            }
        }

        // 6. Create colored line debris based on enemy shape
        this.createShapeDebris(enemy);

        // 7. Screen shake (only if on screen)
        if (onScreen) {
            this.triggerScreenShake(30, 18, enemy.radius * 2.5);
        }

        // 8. Delayed secondary burst — scattered sparks
        setTimeout(() => {
            for (let i = 0; i < 10; i++) {
                const ox = enemy.x + random(-25, 25);
                const oy = enemy.y + random(-25, 25);
                this.particlePool.get(ox, oy, 'explosionEmber', color);
            }
        }, 80);
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
            // Assign random heal amount scaled by upgrades
            const medpackStacks = this.player.getPowerupStacks('MEDPACK');
            const doctorStacks = this.player.getPowerupStacks('DOCTOR');
            const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE);
            const maxHeal = Math.max(minHeal, GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE) + (doctorStacks * GAME_CONFIG.DOCTOR_HEAL_MAX_UPGRADE));
            healthOrb.healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
            
            // Scale size based on heal amount
            const healRatio = maxHeal > minHeal ? (healthOrb.healAmount - minHeal) / (maxHeal - minHeal) : 0;
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
            // Assign random money amount scaled by upgrades
            const paydayStacks = this.player.getPowerupStacks('PAYDAY');
            const highRollerStacks = this.player.getPowerupStacks('HIGH_ROLLER');
            const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE);
            const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE) + (highRollerStacks * GAME_CONFIG.HIGH_ROLLER_MONEY_MAX_UPGRADE));
            moneyOrb.moneyAmount = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;
            
            // Scale size based on money amount
            const moneyRatio = maxMoney > minMoney ? (moneyOrb.moneyAmount - minMoney) / (maxMoney - minMoney) : 0;
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
        const enemyDropRateBonus = isEnemy ? 0.15 : 0; // +15% drop rate for enemies
        const enemyQuantityMultiplier = isEnemy ? 1.3 : 1; // +30% more orbs for enemies
        
        // Get level-based bonuses (higher level entities have better drop rates and quantities)
        const entityLevel = entity?.level || 1;
        const levelDropRateBonus = (entityLevel - 1) * 0.05; // 5% increased drop rate per level
        const levelQuantityMultiplier = 1 + (entityLevel - 1) * 0.1; // 10% more orbs per level
        
        // Calculate effective drop rates with upgrades, level bonuses, and enemy bonuses
        const baseHealthDropRate = GAME_CONFIG.HEALTH_ORB_BASE_DROP_RATE + (healthDropChanceStacks * GAME_CONFIG.HEALTH_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;
        const baseMoneyDropRate = GAME_CONFIG.MONEY_ORB_BASE_DROP_RATE + (moneyDropChanceStacks * GAME_CONFIG.MONEY_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;
        
        const healthDropRate = Math.min(1.0, baseHealthDropRate);
        const moneyDropRate = Math.min(1.0, baseMoneyDropRate);
        
        // Drop health orbs
        if (Math.random() < healthDropRate) {
            const maxHealthOrbs = GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MAX + (healthDropQuantityStacks * GAME_CONFIG.HEALTH_ORB_DROP_QUANTITY_UPGRADE);
            const baseHealthOrbCount = Math.floor(Math.random() * maxHealthOrbs) + 1; // 1 to max
            const levelScaledHealthOrbCount = Math.floor(baseHealthOrbCount * levelQuantityMultiplier);
            const enemyScaledHealthOrbCount = Math.floor(levelScaledHealthOrbCount * enemyQuantityMultiplier);
            const totalHealthOrbCount = Math.max(1, Math.floor(enemyScaledHealthOrbCount * hitStreakMultiplier));

            for (let i = 0; i < totalHealthOrbCount; i++) {
                this.createHealthOrb(x, y);
            }
        }

        // Drop money orbs
        if (Math.random() < moneyDropRate) {
            const maxMoneyOrbs = GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MAX + (moneyDropQuantityStacks * GAME_CONFIG.MONEY_ORB_DROP_QUANTITY_UPGRADE);
            const baseMoneyOrbCount = Math.floor(Math.random() * maxMoneyOrbs) + 1; // 1 to max
            const levelScaledMoneyOrbCount = Math.floor(baseMoneyOrbCount * levelQuantityMultiplier);
            const enemyScaledMoneyOrbCount = Math.floor(levelScaledMoneyOrbCount * enemyQuantityMultiplier);
            const totalMoneyOrbCount = Math.max(1, Math.floor(enemyScaledMoneyOrbCount * hitStreakMultiplier));

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
    
    drawPowerupDisplay() { return hud.drawPowerupDisplay.call(this); }
    
    drawPowerupIndicators() { return hud.drawPowerupIndicators.call(this); }

    syncPowerupHUD() { return hud.syncPowerupHUD.call(this); }

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
    
    drawMoneyPickupDisplay() { return hud.drawMoneyPickupDisplay.call(this); }
    
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
            
            // Remove expired damage numbers (swap-and-pop to avoid O(n) splice)
            if (dmgNum.life <= 0) {
                this.damageNumbers[i] = this.damageNumbers[this.damageNumbers.length - 1];
                this.damageNumbers.pop();
            }
        }
    }
    
    drawDamageNumbers() { return hud.drawDamageNumbers.call(this); }
    
    drawTargetInfo() { return hud.drawTargetInfo.call(this); }
    
    handleCollisions() { return col.handleCollisions.call(this); }
    handleWeaponEffectCollisions() { return col.handleWeaponEffectCollisions.call(this); }
    damageEnemy(enemy, damage) { return col.damageEnemy.call(this, enemy, damage); }
    handlePlayerEnemyCollision(player, enemy) { return col.handlePlayerEnemyCollision.call(this, player, enemy); }
    handlePlayerEnemyBulletCollision(player, bullet) { return col.handlePlayerEnemyBulletCollision.call(this, player, bullet); }
    handleEnemyAsteroidCollision(enemy, asteroid) { return col.handleEnemyAsteroidCollision.call(this, enemy, asteroid); }
    
    update() {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            // Tick game timers (only during active gameplay — frozen during PAUSED/SHOP)
            const timerDt = GAME_CONFIG.LOGIC_TICK_MS;
            for (let i = this._gameTimers.length - 1; i >= 0; i--) {
                const t = this._gameTimers[i];
                t.tick(timerDt);
                if (t.done) this._gameTimers.splice(i, 1);
            }

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

            // Safety: chargePaused should never be true during gameplay — it's only
            // valid during SHOP/PAUSED states (when this code path doesn't run).
            // If it's stuck true from an edge case, force-clear it.
            if (this.player.chargePaused) {
                this.player.chargePaused = false;
            }

            // Calculate tractor beam state - active when not charging
            const tractorEngaged = !this.player.isCharging;

            // Normal gameplay updates
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.colorStarPool, tractorEngaged, this.gameField);
            
            // Update camera to follow player
            this.updateCamera();
            
            // Target info updates removed for cleaner UI
            // this.updateTargetInfo(16); // Assume 60fps
            
            // Update money pickup display
            this.updateMoneyPickupDisplay(GAME_CONFIG.LOGIC_TICK_MS);

            // Update damage numbers
            this.updateDamageNumbers(GAME_CONFIG.LOGIC_TICK_MS);
            
            // Update hover detection
            this.updateHoverDetection();

            // Update kill streak timer
            this.updateKillStreak();
            
            // Clean up targeted entity if it's no longer active
            if (this.targetedEntity && !this.targetedEntity.active) {
                this.targetedEntity = null;
            }
            
            this.bulletPool.activeObjects.forEach(bullet =>
                bullet.update(this.particlePool, this.asteroidPool, this.enemyPool, this, this.gameField));
            this.bulletPool.cleanupInactive();
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.powerupPool.activeObjects.forEach(p => p.update(this.player));
            this.asteroidPool.updateActive(this.gameField);
            
            // Update enemies and enemy bullets (only during active gameplay)
            this.enemyPool.activeObjects.forEach(enemy => enemy.update(this.player, this, this.gameField));
            this.enemyBulletPool.updateActive();
            this.enemyBulletPool.cleanupInactive();
            
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

            // Performance: Clean up inactive objects periodically
            if (Math.floor(this.game.survivalTime / 1000) % GAME_CONFIG.PARTICLE_CLEANUP_INTERVAL === 0) {
                this.particlePool.cleanupInactive();
                this.lineDebrisPool.cleanupInactive();
                this.powerupPool.cleanupInactive();
                this.bulletPool.cleanupInactive();
                this.enemyBulletPool.cleanupInactive();
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
            
            // Nebula layer — deepest background, before all stars
            nebulaRenderer.draw(this.ctx, this.camera.x, this.camera.y);

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
            
            // Viewport-culled rendering — off-screen objects skip draw() entirely.
            // Generous padding ensures particles/trails/glow don't pop in at edges.
            const pad = 120;
            const vL = this.camera.x - pad;
            const vT = this.camera.y - pad;
            const vR = this.camera.x + this.width + pad;
            const vB = this.camera.y + this.height + pad;

            this.lineDebrisPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.particlePool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.powerupPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.asteroidPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.enemyPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.enemyBulletPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
            this.bulletPool.drawActiveVisible(this.ctx, vL, vT, vR, vB, this);
            this.player.draw(this.ctx);
            this.drawWeaponEffects();

            // Draw game field boundaries
            this.drawGameFieldBoundaries();
            
            this.ctx.restore();
            
            // Draw UI elements without camera transformation
            // Sync DOM powerup HUD
            this.syncPowerupHUD();
            
            // Draw powerup display at top
            this.drawPowerupDisplay();
            
            // Draw off-screen entity indicators
            this.drawOffScreenIndicators();

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
    
    drawHUD() { return hud.drawHUD.call(this); }

    drawWeaponEffects() {
        if (!this.player || !this.player.active) return;
        const ctx = this.ctx;
        const p = this.player;

        // ─── Lance Beam ──────────────────────────────────────────────────
        if (p.beamActive && p.beamTimer > 0) {
            const config = PRIMARY_WEAPONS.LANCE_BEAM;
            const beamW = (config.beamWidth || 6) * (1 + this.player.getPowerupStacks('BEAM_WIDTH') * 0.3);
            const range = config.range * 400; // base beam range in px
            const dx = Math.cos(p.angle);
            const dy = Math.sin(p.angle);
            const endX = p.x + dx * range;
            const endY = p.y + dy * range;

            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = config.color;
            ctx.lineWidth = beamW;
            ctx.shadowColor = config.color;
            ctx.shadowBlur = beamW * 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            // Inner bright core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, beamW * 0.3);
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.restore();
        }

        // ─── Mines ──────────────────────────────────────────────────────
        if (p.activeMines) {
            for (const mine of p.activeMines) {
                if (!mine.active) continue;
                ctx.save();
                const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.005);
                ctx.globalAlpha = pulse;
                ctx.fillStyle = mine.armed ? '#ff6600' : '#884400';
                ctx.beginPath();
                ctx.arc(mine.x, mine.y, 8, 0, Math.PI * 2);
                ctx.fill();
                // Trigger radius indicator
                if (mine.armed) {
                    ctx.strokeStyle = 'rgba(255, 100, 0, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(mine.x, mine.y, mine.triggerRadius || 60, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // ─── Nova Ring ──────────────────────────────────────────────────
        if (p.novaActive && p.novaRings) {
            for (const ring of p.novaRings) {
                if (!ring.active) continue;
                const progress = ring.elapsed / ring.duration;
                ctx.save();
                ctx.globalAlpha = 1 - progress;
                ctx.strokeStyle = POWER_WEAPONS.NOVA_BLAST.color;
                ctx.lineWidth = 4 * (1 - progress);
                ctx.shadowColor = POWER_WEAPONS.NOVA_BLAST.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        // ─── Lightning Chains ───────────────────────────────────────────
        if (p.lightningChains && p.lightningChains.length > 0) {
            ctx.save();
            ctx.strokeStyle = POWER_WEAPONS.LIGHTNING_ARC.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = '#aaaaff';
            ctx.shadowBlur = 8;
            for (const chain of p.lightningChains) {
                if (!chain.active) continue;
                for (let j = 0; j < chain.targets.length - 1; j++) {
                    const from = chain.targets[j];
                    const to = chain.targets[j + 1];
                    // Jagged lightning line
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    const segs = 5;
                    for (let s = 1; s <= segs; s++) {
                        const t = s / segs;
                        const mx = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 20;
                        const my = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 20;
                        ctx.lineTo(mx, my);
                    }
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        // ─── Missiles ──────────────────────────────────────────────────
        if (p.activeMissiles) {
            for (const missile of p.activeMissiles) {
                if (!missile.active) continue;
                ctx.save();
                ctx.fillStyle = POWER_WEAPONS.MISSILE_SALVO.color;
                ctx.beginPath();
                ctx.arc(missile.x, missile.y, 4, 0, Math.PI * 2);
                ctx.fill();
                // Exhaust trail
                ctx.fillStyle = 'rgba(255, 200, 100, 0.5)';
                const trail = 8;
                ctx.beginPath();
                ctx.arc(missile.x - missile.vx * trail, missile.y - missile.vy * trail, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // ─── Deflector Orbs ─────────────────────────────────────────────
        if (p.deflectorOrbs && p.deflectorOrbs.length > 0) {
            for (const orb of p.deflectorOrbs) {
                if (!orb.active || orb.hits <= 0) continue;
                ctx.save();
                ctx.fillStyle = DEFENSE_SKILLS.DEFLECTOR_ORBS.color;
                ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
                ctx.shadowColor = DEFENSE_SKILLS.DEFLECTOR_ORBS.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // ─── Bulwark Aura ───────────────────────────────────────────────
        if (p.activeSkillEffects && p.activeSkillEffects.has('BULWARK')) {
            ctx.save();
            const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 0.004);
            ctx.globalAlpha = pulse;
            ctx.fillStyle = DEFENSE_SKILLS.BULWARK.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 35, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ─── Tractor Shield ────────────────────────────────────────────
        if (p.activeSkillEffects && p.activeSkillEffects.has('TRACTOR_SHIELD')) {
            const skill = DEFENSE_SKILLS.TRACTOR_SHIELD;
            const arc = skill.shieldArc + this.player.getPowerupStacks('WIDE_ANGLE') * (Math.PI / 6);
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = skill.color;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.arc(p.x, p.y, 50, p.angle - arc / 2, p.angle + arc / 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // ─── EMP Pulse ─────────────────────────────────────────────────
        if (p.empPulseActive) {
            const skill = DEFENSE_SKILLS.EMP_PULSE;
            const radius = skill.radius + this.player.getPowerupStacks('WIDE_BAND') * 60;
            const elapsed = Date.now() - (p.empPulseStartTime || 0);
            const progress = Math.min(1, elapsed / 500);
            ctx.save();
            ctx.globalAlpha = 0.6 * (1 - progress);
            ctx.strokeStyle = skill.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = skill.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * progress, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // ─── Phase Dash Trail ───────────────────────────────────────────
        if (p.activeSkillEffects && p.activeSkillEffects.has('PHASE_DASH')) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = DEFENSE_SKILLS.PHASE_DASH.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawSkillCooldownHUD() { return hud.drawSkillCooldownHUD.call(this); }
    
    drawCursorCooldownTimer() { return hud.drawCursorCooldownTimer.call(this); }
    
    updateCamera() { return cam.updateCamera.call(this); }
    screenToWorldCoordinates(screenX, screenY) { return cam.screenToWorldCoordinates.call(this, screenX, screenY); }
    isEntityOnScreen(entity, buffer = 50) { return cam.isEntityOnScreen.call(this, entity, buffer); }
    getVisibleStars(stars) { return cam.getVisibleStars.call(this, stars); }
    
    drawGameFieldBoundaries() {
        this.ctx.save();
        this.ctx.strokeStyle = '#444444';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.strokeRect(0, 0, this.gameField.width, this.gameField.height);
        this.ctx.setLineDash([]);
        this.ctx.restore();
    }
    
    drawOffScreenIndicators() { return hud.drawOffScreenIndicators.call(this); }

    drawMinimap() { return hud.drawMinimap.call(this); }
    
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

    drawJitterCircle() { return hud.drawJitterCircle.call(this); }
    
    triggerHitstop(frames) { return cam.triggerHitstop.call(this, frames); }
    triggerCameraKick(dx, dy, magnitude) { return cam.triggerCameraKick.call(this, dx, dy, magnitude); }
    triggerScreenFlash(alpha, duration) { return cam.triggerScreenFlash.call(this, alpha, duration); }

    gameLoop() {
        frameClock.tick();
        const frameStart = performance.now();

        // ── Hitstop: skip logic updates, keep rendering ──
        if (this._hitstopFrames > 0) {
            this._hitstopFrames--;
            // Still render (frozen frame) — but skip logic
            this.draw();
            requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // ── Camera kick decay ──
        if (this._cameraKickX) {
            this._cameraKickX *= 0.7; // fast exponential decay
            if (Math.abs(this._cameraKickX) < 0.3) this._cameraKickX = 0;
        }
        if (this._cameraKickY) {
            this._cameraKickY *= 0.7;
            if (Math.abs(this._cameraKickY) < 0.3) this._cameraKickY = 0;
        }

        // OPT-7: Fixed-timestep accumulator — logic runs at 60 Hz, render at display refresh.
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

        // ── Camera kick (directional impact lurch) ──
        let kickX = this._cameraKickX || 0;
        let kickY = this._cameraKickY || 0;

        if (this.game.screenShakeDuration > 0) {
            // Enhanced shake — stronger random component for punchier feel
            const time = Date.now() * 0.01;
            const shakeIntensity = this.game.screenShakeMagnitude * (this.game.screenShakeDuration / this.game.originalShakeMagnitude);

            // Multi-frequency shake with dominant random jitter (Vlambeer style)
            const dx = Math.sin(time * 17) * shakeIntensity * 0.25 +
                      (Math.random() - 0.5) * shakeIntensity * 0.75;
            const dy = Math.cos(time * 13) * shakeIntensity * 0.25 +
                      (Math.random() - 0.5) * shakeIntensity * 0.75;

            this.ctx.translate(dx + kickX, dy + kickY);
            this.game.screenShakeDuration--;

            // Smooth decay of shake magnitude
            if (this.game.screenShakeDuration > 0) {
                this.game.screenShakeMagnitude = Math.max(0, this.game.screenShakeMagnitude - this.game.shakeDecayRate);
            } else {
                this.game.screenShakeMagnitude = 0;
            }
        } else if (kickX || kickY) {
            this.ctx.translate(kickX, kickY);
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
        
        // Screen flash overlay (kill feedback — drawn over everything except cursor)
        if (this._screenFlashTimer > 0) {
            const flashAlpha = (this._screenFlashTimer / this._screenFlashDuration) * this._screenFlashAlpha;
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
            this._screenFlashTimer--;
        }

        // Death overlay — brief dark tint after player death
        if (this._deathOverlayTimer > 0) {
            const dt = this._deathOverlayTimer;
            const dd = this._deathOverlayDuration;
            // Ramp up quickly, fade out slowly
            const progress = 1 - dt / dd;
            const alpha = progress < 0.15
                ? (progress / 0.15) * 0.18  // ramp up
                : 0.18 * (dt / (dd * 0.85)); // fade out
            this.ctx.fillStyle = `rgba(0, 0, 20, ${Math.max(0, alpha)})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this._deathOverlayTimer--;
        }

        // Draw custom cursor (always on top, after all UI elements)
        this.drawCustomCursor();
        
        // Performance monitoring - warn if frame takes too long
        const frameTime = performance.now() - frameStart;
        if (frameTime > GAME_CONFIG.LOGIC_TICK_MS) { // Over budget for target tick rate
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
    
    closeShopToPause() { return shop.closeShopToPause.call(this); }
    
    triggerScreenShake(duration, magnitude, asteroidSize = 0) { return cam.triggerScreenShake.call(this, duration, magnitude, asteroidSize); }
    
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
    
    drawCustomCursor() { return hud.drawCustomCursor.call(this); }
    
    drawDefaultCrosshair(ctx, x, y) { return hud.drawDefaultCrosshair.call(this, ctx, x, y); }
    drawRedTargetingCursor(ctx, x, y) { return hud.drawRedTargetingCursor.call(this, ctx, x, y); }

    
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
        const dx = this.player.x;
        const dy = this.player.y;
        const playerAngle = this.player.angle || 0;

        // Store death location for safe respawn calculation
        this.deathLocation = { x: dx, y: dy };

        // Lose a life
        this.game.lives--;
        this.uiManager.updateLives(this.game.lives);
        this.audioManager.playPlayerExplosion();
        this.player.active = false;

        const isGameOver = this.game.lives <= 0;

        // ── Phase 0: Impact Freeze (immediate) ──────────────────────────
        this.triggerHitstop(15);
        this.triggerScreenFlash(0.28, 5);
        // Omnidirectional kick (no single "killer" direction)
        const kickAngle = playerAngle + Math.PI; // push camera away from ship facing
        this.triggerCameraKick(Math.cos(kickAngle), Math.sin(kickAngle), 25);

        // Death overlay (dark blue tint that fades)
        this._deathOverlayTimer = isGameOver ? 90 : 50;
        this._deathOverlayDuration = this._deathOverlayTimer;
        this._deathOverlayHold = isGameOver; // game-over holds longer

        // ── Phase 1: Ship Fragmentation (immediate) ─────────────────────
        // Core flash — big white pop
        this.particlePool.get(dx, dy, 'explosionFlash', 55);
        // Initial cyan ring
        this.particlePool.get(dx, dy, 'explosionRingColored', 70, '#00ccff');
        // Ship hull line debris
        this.createPlayerShipDebris(dx, dy, playerAngle);
        // Fast shrapnel streaks
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + random(-0.3, 0.3);
            const spd = random(10, 18);
            const c = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#00ccff' : '#78ebff';
            this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd, c);
        }

        // ── Phase 2: Main Blast (100-300ms) ─────────────────────────────
        setTimeout(() => {
            this.triggerCameraKick(
                Math.cos(kickAngle + random(-0.5, 0.5)),
                Math.sin(kickAngle + random(-0.5, 0.5)), 18
            );
            this.triggerScreenFlash(0.18, 4);
            this.triggerScreenShake(60, 30, 80);

            // Shockwave rings — staggered, in player palette
            const ringColors = ['#ffffff', '#78ebff', '#ff5ad2'];
            const ringRadii = [90, 130, 175];
            for (let r = 0; r < 3; r++) {
                setTimeout(() => {
                    this.particlePool.get(dx, dy, 'explosionRingColored',
                        ringRadii[r], ringColors[r]);
                }, r * 60);
            }
        }, 100);

        // Secondary shrapnel wave
        setTimeout(() => {
            const palette = ['#00ccff', '#ff5ad2', '#be96ff', '#ffffff', '#ffff96'];
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2 + random(-0.4, 0.4);
                const spd = random(4, 11);
                this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd,
                    palette[i % palette.length]);
            }
        }, 160);

        // Embers
        setTimeout(() => {
            const emberColors = ['#78ebff', '#ffffff', '#ff5ad2', '#be96ff'];
            for (let i = 0; i < 10; i++) {
                this.particlePool.get(dx, dy, 'explosionEmber',
                    emberColors[i % emberColors.length]);
            }
        }, 220);

        // ── Phase 3: Aftershock (400-1200ms) ────────────────────────────
        setTimeout(() => {
            this.triggerCameraKick(
                Math.cos(kickAngle + random(-1, 1)),
                Math.sin(kickAngle + random(-1, 1)), 10
            );
            this.triggerScreenFlash(0.08, 2);

            // Scattered embers around the death point
            for (let i = 0; i < 6; i++) {
                const ox = dx + random(-35, 35);
                const oy = dy + random(-35, 35);
                this.particlePool.get(ox, oy, 'explosionEmber',
                    i % 2 === 0 ? '#ff5ad2' : '#ffff96');
            }
        }, 400);

        // Final massive ring
        setTimeout(() => {
            this.particlePool.get(dx, dy, 'explosionRingColored', 220, '#be96ff');
        }, 650);

        // Delayed re-ignition pops
        for (let p = 0; p < 4; p++) {
            setTimeout(() => {
                const ox = dx + random(-45, 45);
                const oy = dy + random(-45, 45);
                this.particlePool.get(ox, oy, 'explosionFlash', random(15, 28));
                for (let s = 0; s < 3; s++) {
                    const a = random(0, Math.PI * 2);
                    this.particlePool.get(ox, oy, 'explosionShrapnel', a,
                        random(3, 7), s === 0 ? '#ffffff' : '#78ebff');
                }
            }, 650 + p * 120);
        }

        // ── Handle game state ───────────────────────────────────────────
        if (isGameOver) {
            this.game.state = GAME_STATES.GAME_OVER;
            this.checkSurvivalRecord();
            this.uiManager.showMessage('GAME OVER', 'Press Enter or click to restart');
        } else {
            const respawnEpoch = this.stateMachine.epoch;
            setTimeout(() => {
                if (this.stateMachine.epoch !== respawnEpoch) return; // stale callback
                this.respawnPlayerSafely();
            }, 1800);
        }
    }

    createPlayerShipDebris(x, y, angle) {
        const r = this.player.radius || 12;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Hull vertices in local space (matching player.js draw)
        const verts = [
            { x: 0,          y: -r },          // nose
            { x: r * 0.32,   y: -r * 0.18 },   // upper-right
            { x: r * 1.12,   y: r * 0.28 },     // wing-right
            { x: r * 1.42,   y: r * 0.08 },     // wingtip-right
            { x: r * 0.28,   y: r * 0.58 },     // lower-right
            { x: r * 0.42,   y: r * 0.78 },     // engine-right
            { x: 0,          y: r * 0.38 },      // tail
            { x: -r * 0.42,  y: r * 0.78 },     // engine-left
            { x: -r * 0.28,  y: r * 0.58 },     // lower-left
            { x: -r * 1.42,  y: r * 0.08 },     // wingtip-left
            { x: -r * 1.12,  y: r * 0.28 },     // wing-left
            { x: -r * 0.32,  y: -r * 0.18 },    // upper-left
        ];

        // Rotate vertices to world space and create debris between adjacent pairs
        for (let i = 0; i < verts.length; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % verts.length];
            // Rotate to world orientation
            const p1 = {
                x: v1.x * cos - v1.y * sin,
                y: v1.x * sin + v1.y * cos
            };
            const p2 = {
                x: v2.x * cos - v2.y * sin,
                y: v2.x * sin + v2.y * cos
            };
            const debris = this.lineDebrisPool.get(x, y, p1, p2, '#00ccff');
            if (debris) {
                // Boost outward speed for dramatic fragmentation
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const outAngle = Math.atan2(midY, midX);
                const spd = random(4, 10);
                debris.vel.x = Math.cos(outAngle) * spd;
                debris.vel.y = Math.sin(outAngle) * spd;
                debris.rotVel = random(-0.2, 0.2);
            }
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
        this.player.chargePaused = false; // Ensure charge system isn't stuck from a prior pause
        
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
    
    updateHUD() { return hud.updateHUD.call(this); }
    
    findNearestEnemy() { return col.findNearestEnemy.call(this); }

    drawSurvivalTimer(ctx) { return hud.drawSurvivalTimer.call(this, ctx); }
    drawPauseButton() { return hud.drawPauseButton.call(this); }
    drawStopwatchIcon(ctx, x, y, size) { return hud.drawStopwatchIcon.call(this, ctx, x, y, size); }
    drawCanvasTriforce(ctx, lives, baseX, baseY) { return hud.drawCanvasTriforce.call(this, ctx, lives, baseX, baseY); }
    drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) { return hud.drawLevelAndCoinsDisplay.call(this, ctx, barX, barY, barHeight); }
    drawLevelUpText() { return hud.drawLevelUpText.call(this); }
    
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

    handlePlayerAsteroidCollision(player, asteroid) { return col.handlePlayerAsteroidCollision.call(this, player, asteroid); }
    
    drawSpawnTimer() { return hud.drawSpawnTimer.call(this); }
    drawXPBar(ctx, barX, barY, barWidth, barHeight) { return hud.drawXPBar.call(this, ctx, barX, barY, barWidth, barHeight); }
    drawCircularTimer(ctx, x, y, radius, progress, color, icon, timeRemaining) { return hud.drawCircularTimer.call(this, ctx, x, y, radius, progress, color, icon, timeRemaining); }
    drawRespawnCountdown() { return hud.drawRespawnCountdown.call(this); }
    drawInvincibilityCountdown() { return hud.drawInvincibilityCountdown.call(this); }
    drawGhostPreviews(spawnProgress) { return hud.drawGhostPreviews.call(this, spawnProgress); }

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
    
    drawGhostEnemy(progress) { return hud.drawGhostEnemy.call(this, progress); }
    drawGhostAsteroid(progress) { return hud.drawGhostAsteroid.call(this, progress); }
} 
