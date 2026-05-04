// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './core/constants.js';
import { random, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon, glowSpriteCache } from './core/utils.js';
import { rgba } from './core/color-cache.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { nebulaRenderer } from './performance/nebula-renderer.js';
import { SpatialGrid } from './performance/spatial-grid.js';
import { PoolManager } from './core/pool-manager.js';
import { frameClock } from './core/frame-clock.js';
import { Player } from './player/player.js';
import { Bullet } from './player/bullet.js';
import { Asteroid } from './world/asteroid.js';
import { Enemy } from './enemy/enemy.js';
import { EnemyBullet } from './enemy/enemy-bullet.js';
import { Particle } from './world/particle.js';
import { ColorStar } from './world/color-star.js';
import { BackgroundStar } from './world/background-star.js';
import { LineDebris } from './world/line-debris.js';
import { Powerup } from './world/powerup.js';
import { DEFENSE_SKILLS, PRIMARY_WEAPONS, POWER_WEAPONS } from './combat/weapon-data.js';
import { GameStateMachine } from './core/game-state.js';
import { EventBus } from './core/event-bus.js';
import { GameTimer } from './core/game-timer.js';
import * as hudStatus from './hud/status.js';
import * as hudCombat from './hud/combat.js';
import * as hudNav from './hud/navigation.js';
import * as hudOverlays from './hud/overlays.js';
import * as hudCursor from './hud/cursor.js';
import * as shopRenderer from './shop/shop-renderer.js';
import * as shopDom from './shop/shop-dom.js';
import * as cam from './world/camera-manager.js';
import { recordVFXFrame } from './debug/vfx-telemetry.js';
import * as shop from './shop/shop-manager.js';
import * as wave from './wave/wave-manager.js';
import * as col from './combat/collision-system.js';
import * as combat from './combat/combat-manager.js';
import * as lifecycle from './player/lifecycle.js';
import * as weaponFx from './combat/weapon-effects-renderer.js';
import * as events from './ui/event-setup.js';
import { showHint } from './ui/hint-system.js';

export const PLAYER_STATES = {
    NORMAL: 'normal'
};

export class GameEngine {
    constructor(canvas, uiManager, audioManager, inputHandler) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.uiManager = uiManager;
        this.audioManager = audioManager;
        // Expose weapon catalogs to ui-manager for the pause-menu PRIMARY/POWER tabs.
        this.PRIMARY_WEAPONS_LIST = PRIMARY_WEAPONS;
        this.POWER_WEAPONS_LIST = POWER_WEAPONS;
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

        // Wire audio events — systems emit events, AudioManager handles playback
        this.events.on('audio:hit', () => this.audioManager.playHit());
        this.events.on('audio:explosion', () => this.audioManager.playExplosion());
        this.events.on('audio:coin', () => this.audioManager.playCoin());
        this.events.on('audio:shield', () => this.audioManager.playShield());
        this.events.on('audio:health-regen', () => this.audioManager.playHealthRegen());
        this.events.on('audio:powerup', () => this.audioManager.playPowerup());
        this.events.on('audio:player-explosion', () => this.audioManager.playPlayerExplosion());

        // Granular hit SFX — fall back to generic 'hit' if the named sound
        // isn't registered (so adding new patterns degrades gracefully).
        this.events.on('audio:player-hit-asteroid', () => this.audioManager.playSound('playerHitAsteroid'));
        this.events.on('audio:player-hit-enemy', () => this.audioManager.playSound('playerHitEnemy'));
        this.events.on('audio:player-hit-bullet', (pattern) => {
            const name = `enemyHit_${pattern || ''}`;
            if (this.audioManager.sounds && this.audioManager.sounds[name]) {
                this.audioManager.playSound(name);
            } else {
                this.audioManager.playHit();
            }
        });
        this.events.on('audio:enemy-hit-by-bullet', (weaponId) => {
            const name = `playerHit_${weaponId || ''}`;
            if (this.audioManager.sounds && this.audioManager.sounds[name]) {
                this.audioManager.playSound(name);
            } else {
                this.audioManager.playHit();
            }
        });

        // Wire UI events — systems emit events, UIManager handles display
        this.events.on('ui:show-message', (d) => this.uiManager.showMessage(d.title, d.subtitle, d.duration, d.position));
        this.events.on('ui:hide-message', () => this.uiManager.hideMessage());
        this.events.on('ui:update-lives', (d) => this.uiManager.updateLives(d.lives));
        this.events.on('ui:check-orientation', () => this.uiManager.checkOrientation());
        this.events.on('ui:toggle-pause', () => this.uiManager.togglePause());
        this.events.on('ui:show-shop-button', () => this.uiManager.showShopButton());
        this.events.on('ui:hide-shop-button', () => this.uiManager.hideShopButton());
        this.events.on('ui:show-pause-btn', () => this.uiManager.showHudPauseBtn());
        this.events.on('ui:hide-pause-btn', () => this.uiManager.hideHudPauseBtn());
        this.events.on('ui:show-hud-shop-btn', () => this.uiManager.showHudShopBtn());
        this.events.on('ui:hide-hud-shop-btn', () => this.uiManager.hideHudShopBtn());

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
        // Wire HTML shop overlay (#shop-overlay) — replaces the old canvas
        // shop. Tabs, items, sell buttons, close button all go through DOM.
        shopDom.initShopDom(this);
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
        this.lastHealthOrbDropAt = 0; // Throttle health orb drops (cooldown gate in dropOrbsFromEntity)
        this.gameStartTime = Date.now();
        this.forceSpawnEnabled = false; // Disabled - wave-based spawning only
        
        // BACKUP SPAWNING SYSTEM - independent emergency spawner
        this.emergencySpawnInterval = 5000; // Emergency spawn every 5 seconds
        this.lastEmergencySpawn = 0;
        
        // Ghost preview positions (stored to prevent flickering)
        this.ghostEnemyPosition = this.generateGhostPosition();
        this.ghostAsteroidPosition = this.generateGhostPosition();
    }
    
    // Performance monitoring — call from console: gameEngine.showPerformanceStats()
    showPerformanceStats() {
        const pools = [
            this.particlePool, this.bulletPool, this.enemyPool, this.asteroidPool,
            this.enemyBulletPool, this.colorStarPool, this.backgroundStarPool,
            this.lineDebrisPool, this.powerupPool
        ];
        console.log('📊 Pool Stats:');
        console.table(pools.map(p => p.getStats()));
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
            respawnDuration: 5000, // 5 seconds respawn sequence
            // Run-wide stats — drive the Game Complete screen + speedrun meta.
            stats: {
                gameStartTime: 0,        // set when run actually starts
                finalTimeMs: 0,          // populated on run completion
                completed: false,
                shotsFired: 0,
                shotsHit: 0,
                totalDamageDealt: 0,
                totalDamageTaken: 0,
                enemiesKilled: 0,
                asteroidsDestroyed: 0,
                bossesKilled: 0,
                deaths: 0,
                coinsEarned: 0,
                weaponShots: {},         // weaponId → shots fired
            },
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
        
        // Targeted entity system (click-based targeting). Drives the cursor
        // crosshair and asteroid/enemy outlines.
        this.targetedEntity = null;

        // Last target the player damaged (enemy ship OR asteroid). Drives
        // the top-center info panel. While the entity is alive, the panel
        // reads its live HP via `lastHitEnemy`. When it dies (or the pool
        // recycles it), `lastHitInfo` keeps the snapshot visible for a
        // short grace period so the panel doesn't flicker between rapid
        // kills (e.g. Storm Needles cycling 7+ enemies/sec).
        this.lastHitEnemy = null;
        this.lastHitInfo = null;          // { name, level, health, maxHealth, expireAt, ref }
        this.LAST_HIT_GRACE_MS = 900;     // how long the snapshot lingers after death
        
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
        this.player.gameEngine = this; // Inject ref so player doesn't need window.gameEngine
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
            description: '',
            color: '#ffffff',
            opacity: 1.0,
            fadeTimer: 0,
            maxFadeTime: 180 // 3 seconds fade out
        };
    }
    
    setupEventListeners() { return events.setupEventListeners.call(this); }
    
    init() {
        // Cancel any pending game timers from previous game
        for (let i = 0; i < this._gameTimers.length; i++) this._gameTimers[i].cancel();
        this._gameTimers.length = 0;

        // Reset core game state (money, wave, survival timer)
        this.initializeGameState();
        // Start in WAVE_TRANSITION (the "WAVE 1" intro screen). The
        // wave-1 spawn timer below flips to PLAYING once entities are
        // in the pool. Setting PLAYING here prematurely would let
        // checkWaveComplete race-fire on a 0-enemies tuple before the
        // wave-1 hunter actually spawns, skipping the player straight
        // to the wave-2 shop popup.
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        this.game.gameStartTime = Date.now(); // Start survival timer
        // Reset player
        this.player = new Player();
        this.player.gameEngine = this; // Inject ref so player doesn't need window.gameEngine
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
        this.lastHealthOrbDropAt = 0; // Reset health orb drop cooldown
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
        // Reset stats for the new run — Game Complete pulls from this object.
        this.game.stats = {
            gameStartTime: Date.now(),
            finalTimeMs: 0,
            completed: false,
            shotsFired: 0,
            shotsHit: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            enemiesKilled: 0,
            asteroidsDestroyed: 0,
            bossesKilled: 0,
            deaths: 0,
            coinsEarned: 0,
            weaponShots: {},
        };

        // Wave 1 intro: title fade-out hands off to a 700ms fade-IN that
        // reveals the player on the empty playfield, then a brief beat,
        // then wave-1 entities warp in. The wave intro overlay text is
        // disabled per the user request — fade transition only.
        this.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: 3400,
            title: 'WAVE 1',
            subtitle: this.getWaveSubtitle(1),
            phase: 'intro',
        };

        // Black-to-clear fade over the first 700ms — picks up where the
        // title launch animation's fade-to-black left off so the screen
        // never flashes between the two.
        this._postInitFade = { startTime: Date.now(), duration: 700 };

        // Timeline:
        //   0-700ms    fade in (black → clear, revealing player)
        //   700-1100ms hold (player visible, empty field, orientation beat)
        //   1100ms     spawn wave-1 entities + grant invincibility
        //   3400ms     state → PLAYING
        this._gameTimers.push(new GameTimer(1100, () => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.spawnWaveEntities();
                if (this.player && this.player.active) {
                    this.player.makeInvincible(3000);
                    this.player.justRespawned = false;
                }
            }
        }));
        this._gameTimers.push(new GameTimer(3400, () => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
            }
        }));

        // Wave-1 onboarding hints (each shown at most once per browser via
        // localStorage in hint-system.js). Staggered so they don't overlap.
        // GameTimer ensures they pause with the game.
        this._gameTimers.push(new GameTimer(5000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'wave1-cycle-weapons-v2',
                'Press <strong>Tab</strong> to cycle primary weapons, <strong>R</strong> to cycle power weapons.',
                7000,
            );
        }));
        this._gameTimers.push(new GameTimer(13000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'wave1-open-shop',
                'Open the <strong>shop</strong> any time — pause menu (<strong>ESC</strong>) or the <strong>🛒</strong> button in the top-right.',
                8000,
            );
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
    

    
    spawnAsteroidOffscreen() { return wave.spawnAsteroidOffscreen.call(this); }
    
    createDebris(ast) { return combat.createDebris.call(this, ast); }
    createColorStarBurst(x, y) { return combat.createColorStarBurst.call(this, x, y); }
    
    updateWaveSystem() { return wave.updateWaveSystem.call(this); }

    getWaveSubtitle(waveNumber) { return wave.getWaveSubtitle.call(this, waveNumber); }

    showWaveComplete() { return wave.showWaveComplete.call(this); }
    
    // Wavy rainbow text used for wave-message overlays and the title screen.
    drawWavyText(text, x, y, options) { return hudOverlays.drawWavyText.call(this, text, x, y, options); }
    
    drawTitleScreen() { return hudOverlays.drawTitleScreen.call(this); }
    
    startNextWave() { return wave.startNextWave.call(this); }

    spawnWaveEntities() { return wave.spawnWaveEntities.call(this); }

    spawnAsteroids(count) { return wave.spawnAsteroids.call(this, count); }

    spawnEnemies(count) { return wave.spawnEnemies.call(this, count); }

    spawnLeveledAsteroids(count, opts) { return wave.spawnLeveledAsteroids.call(this, count, opts); }

    spawnLeveledEnemies(enemyType, count, opts) { return wave.spawnLeveledEnemies.call(this, enemyType, count, opts); }

    initializeLeveledAsteroid(asteroid, opts) { return wave.initializeLeveledAsteroid.call(this, asteroid, opts); }
    
    applyEnemyLevelScaling(enemy) { return wave.applyEnemyLevelScaling.call(this, enemy); }

    completeWave() { return wave.completeWave.call(this); }
    completeRun() { return wave.completeRun.call(this); }
    triggerEnemiesClearedPulse() { return wave.triggerEnemiesClearedPulse.call(this); }
    
    sellShopItem(itemId) { return shop.sellShopItem.call(this, itemId); }

    openShop() { return shop.openShop.call(this); }

    _rebuildShopCache() { return shop._rebuildShopCache.call(this); }

    _buildPrimaryTabItems() { return shop._buildPrimaryTabItems.call(this); }

    _buildPowerTabItems() { return shop._buildPowerTabItems.call(this); }

    _buildSkillsTabItems() { return shop._buildSkillsTabItems.call(this); }

    closeShop() { return shop.closeShop.call(this); }
    closeShopToPlaying() { return shop.closeShopToPlaying.call(this); }
    closeShopAndReturn() { return shop.closeShopAndReturn.call(this); }

    buyShopItem(itemId) { return shop.buyShopItem.call(this, itemId); }

    _handleWeaponBuyOrEquip(item) { return shop._handleWeaponBuyOrEquip.call(this, item); }

    _handleSkillBuy(item) { return shop._handleSkillBuy.call(this, item); }

    _handleUpgradeBuy(item) { return shop._handleUpgradeBuy.call(this, item); }
    
    getPowerupConfig(type) { return combat.getPowerupConfig.call(this, type); }
    onEnemyKill(enemy) { return combat.onEnemyKill.call(this, enemy); }
    updateKillStreak() { return combat.updateKillStreak.call(this); }

    queueNotification(title, subtitle, duration) { return wave.queueNotification.call(this, title, subtitle, duration); }

    processNotificationQueue() { return wave.processNotificationQueue.call(this); }

    drawShop() { return shopRenderer.drawShop.call(this); }
    
    drawShopTabs(shopX, tabY, shopWidth) { return shopRenderer.drawShopTabs.call(this, shopX, tabY, shopWidth); }
    
    drawShopItem(item, x, y, width, height, index, isHovered = false) { return shopRenderer.drawShopItem.call(this, item, x, y, width, height, index, isHovered); }
    
    drawMultilineText(text, x, startY, maxWidth, lineHeight, maxLines = null) { return shopRenderer.drawMultilineText.call(this, text, x, startY, maxWidth, lineHeight, maxLines); }
    
    startNewWave() { return wave.startNewWave.call(this); }
    
    spawnWaveAsteroids() { return wave.spawnWaveAsteroids.call(this); }
    startEnemySubWave() { return wave.startEnemySubWave.call(this); }
    
    initializeWaveAsteroid(asteroid, opts) { return wave.initializeWaveAsteroid.call(this, asteroid, opts); }

    // Legacy method - replaced by startNewWave and sub-wave system

    forceSpawnEntity() { return wave.forceSpawnEntity.call(this); }
    forceSpawnEnemy() { return wave.forceSpawnEnemy.call(this); }
    forceSpawnAsteroid() { return wave.forceSpawnAsteroid.call(this); }
    isInMinimapArea(worldX, worldY) { return wave.isInMinimapArea.call(this, worldX, worldY); }

    getRandomSpawnPosition(opts) { return wave.getRandomSpawnPosition.call(this, opts); }
    getOnScreenSpawnPosition(opts) { return wave.getOnScreenSpawnPosition.call(this, opts); }

    getRandomEnemyType() { return wave.getRandomEnemyType.call(this); }
    
    spawnContinuousAsteroid() { return wave.spawnContinuousAsteroid.call(this); }
    spawnRandomEnemy() { return wave.spawnRandomEnemy.call(this); }
    
    createEnemyDebris(enemy) { return combat.createEnemyDebris.call(this, enemy); }
    createShapeDebris(enemy) { return combat.createShapeDebris.call(this, enemy); }
    
    createHealthOrb(x, y) { return combat.createHealthOrb.call(this, x, y); }
    createMoneyOrb(x, y) { return combat.createMoneyOrb.call(this, x, y); }
    dropStarsFromEntity(x, y) { return combat.dropStarsFromEntity.call(this, x, y); }
    dropOrbsFromEntity(x, y, entity = null) { return combat.dropOrbsFromEntity.call(this, x, y, entity); }
    
    dropPowerup(x, y, type = null) { return combat.dropPowerup.call(this, x, y, type); }
    collectPowerup(powerup) { return combat.collectPowerup.call(this, powerup); }
    showPowerupDisplay(name, color, description) { return combat.showPowerupDisplay.call(this, name, color, description); }
    
    drawPowerupDisplay() { return hudCombat.drawPowerupDisplay.call(this); }
    
    drawPowerupIndicators() { return hudCombat.drawPowerupIndicators.call(this); }

    syncPowerupHUD() { return hudCombat.syncPowerupHUD.call(this); }

    setTargetInfo(target) { return combat.setTargetInfo.call(this, target); }
    updateTargetInfo(deltaTime) { return combat.updateTargetInfo.call(this, deltaTime); }
    handleEntityTargeting(worldX, worldY) { return combat.handleEntityTargeting.call(this, worldX, worldY); }
    updateHoverDetection() { return combat.updateHoverDetection.call(this); }
    
    addMoneyPickup(amount) { return combat.addMoneyPickup.call(this, amount); }
    updateMoneyPickupDisplay(deltaTime) { return combat.updateMoneyPickupDisplay.call(this, deltaTime); }
    
    drawMoneyPickupDisplay() { return hudCombat.drawMoneyPickupDisplay.call(this); }
    
    createDamageNumber(x, y, damage, opts) { return combat.createDamageNumber.call(this, x, y, damage, opts); }
    updateDamageNumbers(deltaTime) { return combat.updateDamageNumbers.call(this, deltaTime); }

    drawDamageNumbers() { return hudCombat.drawDamageNumbers.call(this); }

    drawTargetInfo() { return hudCombat.drawTargetInfo.call(this); }

    // Reset the kill streak + clear any active damage buff. Called from the
    // three player-damage paths (lifecycle.takeDamage, player↔enemy
    // collision, player↔enemy-bullet collision) whenever HP actually drops
    // — Phase Dash invuln zeros damage at the source so this never fires
    // during a successful dash.
    _breakKillStreak() {
        this.killStreakCount = 0;
        if (this.player) {
            this.player.streakDamageMult = 1;
            this.player.streakTierLabel = null;
            this.player.streakBuffEndTime = 0;
        }
    }

    // Snapshot the most recently hit target so the top-center info panel
    // can keep rendering for a grace period after the entity dies / the
    // pool recycles it. Same target re-hits just refresh the snapshot
    // (no flicker). A new target replaces it.
    _setLastHit(target) {
        if (!target || !target.active) return;
        this.lastHitEnemy = target;
        const name = (target.config && target.config.name)
            ? target.config.name.toUpperCase()
            : 'ASTEROID';
        this.lastHitInfo = {
            ref: target,
            name,
            level: target.level || 1,
            health: target.health,
            maxHealth: target.maxHealth,
            expireAt: Date.now() + this.LAST_HIT_GRACE_MS,
        };
    }
    
    handleCollisions() { return col.handleCollisions.call(this); }
    handleWeaponEffectCollisions() { return col.handleWeaponEffectCollisions.call(this); }
    checkLanceBeamCollisions() { return col.checkLanceBeamCollisions.call(this); }
    checkMineCollisions() { return col.checkMineCollisions.call(this); }
    checkNovaCollisions() { return col.checkNovaCollisions.call(this); }
    checkLightningCollisions() { return col.checkLightningCollisions.call(this); }
    checkMissileCollisions() { return col.checkMissileCollisions.call(this); }
    checkDeflectorOrbCollisions() { return col.checkDeflectorOrbCollisions.call(this); }
    checkTractorShieldCollisions() { return col.checkTractorShieldCollisions.call(this); }
    damageEnemy(enemy, damage) { return col.damageEnemy.call(this, enemy, damage); }
    destroyAsteroid(ast) { return col.destroyAsteroid.call(this, ast); }
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

            // Last-hit panel: while the entity is alive, mirror its current
            // HP into the snapshot. When it dies (or the pool recycles it
            // for a different entity), keep the last snapshot for the grace
            // period so the panel doesn't disappear-then-reappear between
            // rapid kills.
            const now = Date.now();
            if (this.lastHitEnemy && this.lastHitEnemy.active &&
                this.lastHitInfo && this.lastHitInfo.ref === this.lastHitEnemy) {
                this.lastHitInfo.health = this.lastHitEnemy.health;
                this.lastHitInfo.expireAt = now + this.LAST_HIT_GRACE_MS;
            }
            if (this.lastHitEnemy && !this.lastHitEnemy.active) {
                this.lastHitEnemy = null;
            }
            if (this.lastHitInfo && now > this.lastHitInfo.expireAt) {
                this.lastHitInfo = null;
            }
            
            this.bulletPool.activeObjects.forEach(bullet =>
                bullet.update(this.particlePool, this.asteroidPool, this.enemyPool, this, this.gameField));
            this.bulletPool.cleanupInactive();
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.powerupPool.activeObjects.forEach(p => p.update(this.player, tractorEngaged, this.particlePool));
            // Inject gameEngine ref for asteroids (needed for targeting highlight in draw)
            for (const a of this.asteroidPool.activeObjects) a.gameEngine = this;
            this.asteroidPool.updateActive(this.gameField);
            this.asteroidPool.cleanupInactive();

            // Update enemies and enemy bullets (only during active gameplay)
            this.enemyPool.activeObjects.forEach(enemy => enemy.update(this.player, this, this.gameField));
            this.enemyPool.cleanupInactive();
            // Inject gameEngine ref for enemy bullets (needed for particle effects on death)
            for (const eb of this.enemyBulletPool.activeObjects) eb.gameEngine = this;
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
        } else if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            // Sandstorm-grade chaotic drift — multiple sine waves at
            // distinct frequencies sum into a fast, direction-shifting
            // motion. Near-depth stars rip across the field while far
            // ones drift more gently thanks to background-star.js's
            // parallaxFactor.
            const t = Date.now() * 0.001;
            const drift = {
                x: Math.cos(t * 1.7) * 7
                 + Math.sin(t * 0.4) * 4.5
                 + Math.cos(t * 3.1) * 2.5,
                y: Math.sin(t * 1.3) * 5.5
                 + Math.cos(t * 0.7) * 3
                 + Math.sin(t * 2.9) * 2.5,
            };
            this.backgroundStarPool.activeObjects.forEach(s => s.update(drift, this.gameField));

            // Lens-flare nebula drift accumulator — multiplier kept low
            // so the lens flare stars feel much further away than the
            // foreground starfield. We negate so the nebula drifts in the
            // same direction as the background stars (which move opposite
            // to `drift`).
            const NEB_DRIFT_MUL = 0.18;
            const NEB_DRIFT_LIMIT = 8000;
            let nx = (this._titleNebulaDriftX || 0) - drift.x * NEB_DRIFT_MUL;
            let ny = (this._titleNebulaDriftY || 0) - drift.y * NEB_DRIFT_MUL;
            if (nx >  NEB_DRIFT_LIMIT) nx =  NEB_DRIFT_LIMIT;
            if (nx < -NEB_DRIFT_LIMIT) nx = -NEB_DRIFT_LIMIT;
            if (ny >  NEB_DRIFT_LIMIT) ny =  NEB_DRIFT_LIMIT;
            if (ny < -NEB_DRIFT_LIMIT) ny = -NEB_DRIFT_LIMIT;
            this._titleNebulaDriftX = nx;
            this._titleNebulaDriftY = ny;

            // Slow combined-frequency rotation for the lens flare layers.
            // Two slow sinusoids sum into a wandering angular offset of
            // ≈ ±0.19 rad. Per-layer scaling by depth (inside
            // nebula-renderer.js) keeps the deepest layer nearly still
            // while the closest layer rotates noticeably — same depth feel
            // as the drift parallax, just rotational instead of positional.
            //   sin(t*0.18)·0.13  →  period ≈ 35s
            //   cos(t*0.07)·0.06  →  period ≈ 90s
            this._titleNebulaRotation =
                Math.sin(t * 0.18) * 0.13 + Math.cos(t * 0.07) * 0.06;

            // Tick the title-launch animation if it's running. When it
            // completes, fire the stored callback (which kicks off init()).
            const a = this._titleAnimState();
            if (a.phase === 'launch' && Date.now() - a.startTime >= a.duration) {
                a.phase = 'done';
                if (a.onComplete) {
                    const cb = a.onComplete;
                    a.onComplete = null;
                    cb();
                }
            }
        }
    }
    
    draw() {
        // Clear canvas completely (motion blur disabled)
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Render the parallax starfield + nebula on every state EXCEPT the
        // pre-init splash. Title screen now uses the same world background
        // (with a synthetic camera drift driven by update()) so the menu
        // sits on top of an animated starfield instead of a black void.
        {
            // Apply camera transformation for world objects
            this.ctx.save();
            this.ctx.translate(-this.camera.x, -this.camera.y);
            
            // Nebula layer — deepest background, before all stars
            // Title screen feeds an extra drift to the nebula so the lens
            // flare layers wander even when the camera isn't moving — and
            // applies it scaled by depth, so the closest layer drifts most
            // (but the deepest barely moves, giving a "much-farther-away"
            // parallax feel relative to the foreground starfield). Also
            // pipes a slow rotation so the lens flare layers tumble.
            const onTitle = this.game.state === GAME_STATES.TITLE_SCREEN;
            const nebDriftX = onTitle ? (this._titleNebulaDriftX || 0) : 0;
            const nebDriftY = onTitle ? (this._titleNebulaDriftY || 0) : 0;
            const nebRot    = onTitle ? (this._titleNebulaRotation || 0) : 0;
            nebulaRenderer.draw(
                this.ctx,
                this.camera.x, this.camera.y,
                nebDriftX, nebDriftY,
                nebRot, this.width, this.height,
            );

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

            // Entity / HUD rendering — skipped on the pre-init title screen
            // since pools are empty and the player ship would otherwise
            // appear at the center of the menu.
            if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
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
            }

            this.ctx.restore();

            if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
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
    }
    
    drawHUD() { return hudStatus.drawHUD.call(this); }

    drawWaveIntroOverlay() { return hudStatus.drawWaveIntroOverlay.call(this); }

    /**
     * Black overlay that fades from opaque to clear over `duration` ms after
     * the title launch animation hands off to init(). Picks up where the
     * launch fade-to-black left off so the screen never flashes between
     * the title sequence and the playfield reveal.
     */
    drawPostInitFadeIn() {
        const f = this._postInitFade;
        if (!f) return;
        const elapsed = Date.now() - f.startTime;
        if (elapsed >= f.duration) {
            this._postInitFade = null;
            return;
        }
        const alpha = 1 - elapsed / f.duration;
        if (alpha <= 0.001) return;
        this.ctx.save();
        this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawGameComplete() { return hudStatus.drawGameComplete.call(this); }

    drawWeaponEffects() { return weaponFx.drawWeaponEffects.call(this); }

    drawSkillCooldownHUD() { return hudStatus.drawSkillCooldownHUD.call(this); }
    
    drawCursorCooldownTimer() { return hudCursor.drawCursorCooldownTimer.call(this); }
    
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
    
    drawOffScreenIndicators() { return hudNav.drawOffScreenIndicators.call(this); }

    drawMinimap() { return hudNav.drawMinimap.call(this); }
    
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

    drawJitterCircle() { return hudCursor.drawJitterCircle.call(this); }
    
    triggerHitstop(frames) { return cam.triggerHitstop.call(this, frames); }
    triggerCameraKick(dx, dy, magnitude) { return cam.triggerCameraKick.call(this, dx, dy, magnitude); }
    triggerScreenFlash(alpha, duration) { return cam.triggerScreenFlash.call(this, alpha, duration); }

    gameLoop() {
      try {
        frameClock.tick();
        const frameStart = performance.now();

        // ── Hitstop: selective freeze — entities stop, VFX/player keep going ──
        if (this._hitstopFrames > 0) {
            this._hitstopFrames--;
            // Keep lastFrameTime current so temporal upsampling doesn't burst-update after hitstop
            this.lastFrameTime = frameStart;

            // Keep VFX alive during hitstop — particles and debris continue expanding
            // while gameplay entities are frozen. This contrast sells "impact" not "lag".
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();

            // Player keeps moving during offensive hitstop (movement is survival)
            if (this.player && this.player.active &&
                (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION)) {
                const input = this.inputHandler.getInput();
                input.updateAimForPlayerMovement = this.inputHandler.updateAimForPlayerMovement.bind(this.inputHandler);
                // Update player movement only (firing is suppressed by not running collisions)
                this.player.update(input, this.particlePool, this.bulletPool, this.audioManager,
                    this.colorStarPool, !this.player.isCharging, this.gameField);
                this.updateCamera();
            }

            // Damage numbers and money pickups keep animating
            this.updateDamageNumbers(GAME_CONFIG.LOGIC_TICK_MS);
            this.updateMoneyPickupDisplay(GAME_CONFIG.LOGIC_TICK_MS);

            // Render full frame
            this.ctx.save();
            const kickX = this._cameraKickX || 0;
            const kickY = this._cameraKickY || 0;
            if (kickX || kickY) this.ctx.translate(kickX, kickY);
            this.draw();
            this.ctx.restore();
            this.drawHUD();
            // FLICKER FIX: hitstop fires on every hit (3-5 frames), and used
            // to skip drawTargetInfo — making the top-center enemy panel
            // pop out for the duration of the freeze, then back in. Now we
            // draw it during hitstop too, so the panel stays solid.
            this.drawTargetInfo();
            this.drawMoneyPickupDisplay();
            this.drawDamageNumbers();
            // Screen flash overlay
            if (this._screenFlashAlpha > 0) {
                this.ctx.fillStyle = `rgba(255,255,255,${this._screenFlashAlpha})`;
                this.ctx.fillRect(0, 0, this.width, this.height);
                this._screenFlashAlpha -= this._screenFlashAlpha / (this._screenFlashDuration || 1);
            }
            // Wave intro overlay — disabled for now so the warp-in visuals
            // stay visible. Re-enable by uncommenting the call below.
            // this.drawWaveIntroOverlay();
            this.drawPostInitFadeIn();
            recordVFXFrame(this);
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
                // Advance the audio scheduling cursor before running the
                // tick so any sounds emitted by this update() get stamped
                // at this tick's logical time, not the wall-clock instant
                // we happen to be running it on. Without this, multi-step
                // catch-up frames pile every sound onto the same audio
                // currentTime → audible "burst after delay" pattern.
                this.audioManager.beginLogicTick(this.logicTickRate);
                this.update();
                this.logicAccumulator -= this.logicTickRate;
                steps++;
            }
            // Spiral-of-death guard: drop accumulated time if we fell too far behind
            if (steps >= this.maxLogicStepsPerFrame) this.logicAccumulator = 0;
        } else {
            this.audioManager.beginLogicTick(GAME_CONFIG.LOGIC_TICK_MS || 16.6667);
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
        
        // Top-center panel for the most recently hit enemy.
        this.drawTargetInfo();
        
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
        
        // Shop UI is rendered as an HTML overlay (#shop-overlay) — no canvas
        // drawing needed. See js/modules/shop/shop-dom.js for the renderer
        // and the open/close lifecycle in shop-manager.js.
        
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

        // Wave intro full-screen darken — disabled for now so the warp-in
        // visuals stay visible. Re-enable by uncommenting the call below.
        // this.drawWaveIntroOverlay();
        // Post-init black-to-clear fade-in (wave 1 only, ~700ms).
        this.drawPostInitFadeIn();

        // Final-victory screen — replaces all HUD chrome with the stats readout.
        this.drawGameComplete();

        // Draw custom cursor (always on top, after all UI elements)
        this.drawCustomCursor();
        
        // VFX telemetry — record effect state for automated analysis
        recordVFXFrame(this);

        // Performance monitoring - warn if frame takes too long
        const frameTime = performance.now() - frameStart;
        if (frameTime > GAME_CONFIG.LOGIC_TICK_MS) { // Over budget for target tick rate
            // Skip some non-critical updates next frame if we're running slow
            this.performanceMode = true;
        } else {
            this.performanceMode = false;
        }
        
        requestAnimationFrame(() => this.gameLoop());
      } catch (err) {
        console.error('Game loop error:', err);
        // Keep the loop alive even if a frame throws
        requestAnimationFrame(() => this.gameLoop());
      }
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
            // Shop → return to whichever state the shop was opened from
            // (PLAYING / WAVE_TRANSITION / PAUSED).
            this.closeShopAndReturn();
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
        // Pre-build the parallax starfield + nebula so the title screen has
        // a real animated backdrop instead of an empty void. The full init()
        // path runs again when the player presses a key — this just front-
        // loads the visual pieces.
        this.generateInitialColorStars();
        this.generateBackgroundStars();
        nebulaRenderer.generate(this.gameField.width, this.gameField.height);
        // Center the camera in the gameField so the title screen view is
        // anchored on the playable area's middle (no out-of-field artifacts).
        this.camera.x = (this.gameField.width  - this.width)  / 2;
        this.camera.y = (this.gameField.height - this.height) / 2;
        this.gameLoop();
    }

    // Title-start launch animation state. Driven by drawTitleScreen and
    // gameLoop's title-screen update path.
    _titleAnimState() {
        if (!this._titleAnim) {
            this._titleAnim = {
                phase: 'idle',     // 'idle' → 'launch' → 'done'
                startTime: 0,
                duration: 1900,    // total animation time before init() fires
                onComplete: null,
            };
        }
        return this._titleAnim;
    }

    /**
     * Trigger the title-start launch animation. Stored callback fires once
     * the animation completes; the caller wires init() into the callback so
     * the actual run starts immediately after the screen is fully black.
     *
     * Each press picks a random animation style and seeds per-letter random
     * data — direction vectors, phase offsets, drop delays — so even if the
     * same style is rolled twice it doesn't look identical.
     */
    triggerTitleStart(onComplete) {
        const a = this._titleAnimState();
        if (a.phase === 'launch') return false;
        a.phase = 'launch';
        a.startTime = Date.now();
        a.onComplete = onComplete || null;

        const STYLES = ['twister', 'explosion', 'wave', 'cascade', 'warpdrive', 'pinwheel'];
        a.style = STYLES[Math.floor(Math.random() * STYLES.length)];

        // Per-letter random seeds — fixed for the lifetime of one launch.
        const N = 9; // RAINBOIDS
        const seeds = [];
        for (let i = 0; i < N; i++) {
            seeds.push({
                angle:  Math.random() * Math.PI * 2,
                pitch:  (Math.random() - 0.5) * 0.55,
                speed:  0.85 + Math.random() * 0.35,
                phase:  Math.random() * Math.PI * 2,
                delay:  Math.random() * 280,
                spinDir: Math.random() < 0.5 ? -1 : 1,
            });
        }
        a.letterSeeds = seeds;
        return true;
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
    
    drawCustomCursor() { return hudCursor.drawCustomCursor.call(this); }
    
    drawDefaultCrosshair(ctx, x, y) { return hudCursor.drawDefaultCrosshair.call(this, ctx, x, y); }
    drawRedTargetingCursor(ctx, x, y) { return hudCursor.drawRedTargetingCursor.call(this, ctx, x, y); }

    
    takeDamage(damageAmount = this.baseDamage) { return lifecycle.takeDamage.call(this, damageAmount); }
    handlePlayerDeath() { return lifecycle.handlePlayerDeath.call(this); }
    createPlayerShipDebris(x, y, angle) { return lifecycle.createPlayerShipDebris.call(this, x, y, angle); }
    respawnPlayer() { return lifecycle.respawnPlayer.call(this); }
    respawnPlayerSafely() { return lifecycle.respawnPlayerSafely.call(this); }
    findSafeRespawnLocation() { return lifecycle.findSafeRespawnLocation.call(this); }
    updateRespawnAnimation(input) { return lifecycle.updateRespawnAnimation.call(this, input); }
    clearAreaAroundPlayer(radius) { return lifecycle.clearAreaAroundPlayer.call(this, radius); }
    
    updateHUD() { return hudStatus.updateHUD.call(this); }
    
    findNearestEnemy() { return col.findNearestEnemy.call(this); }

    drawSurvivalTimer(ctx) { return hudOverlays.drawSurvivalTimer.call(this, ctx); }
    drawPauseButton() { return hudOverlays.drawPauseButton.call(this); }
    drawStopwatchIcon(ctx, x, y, size) { return hudOverlays.drawStopwatchIcon.call(this, ctx, x, y, size); }
    drawCanvasTriforce(ctx, lives, baseX, baseY) { return hudStatus.drawCanvasTriforce.call(this, ctx, lives, baseX, baseY); }
    drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) { return hudStatus.drawLevelAndCoinsDisplay.call(this, ctx, barX, barY, barHeight); }
    drawEquippedWeaponSquares(ctx, barX, barY, barHeight) { return hudStatus.drawEquippedWeaponSquares.call(this, ctx, barX, barY, barHeight); }
    triggerWeaponCycleAnim(slot = 'primary') {
        this._weaponCycleAnim = { start: Date.now(), duration: 350, slot };
    }
    drawLevelUpText() { return hudStatus.drawLevelUpText.call(this); }
    
    explodeTank(tankIndex) { return lifecycle.explodeTank.call(this, tankIndex); }

    handlePlayerAsteroidCollision(player, asteroid) { return col.handlePlayerAsteroidCollision.call(this, player, asteroid); }
    
    drawSpawnTimer() { return hudOverlays.drawSpawnTimer.call(this); }
    drawStreakIndicator() { return hudOverlays.drawStreakIndicator.call(this); }
    drawXPBar(ctx, barX, barY, barWidth, barHeight) { return hudStatus.drawXPBar.call(this, ctx, barX, barY, barWidth, barHeight); }
    drawCircularTimer(ctx, x, y, radius, progress, color, icon, timeRemaining) { return hudOverlays.drawCircularTimer.call(this, ctx, x, y, radius, progress, color, icon, timeRemaining); }
    drawRespawnCountdown() { return hudOverlays.drawRespawnCountdown.call(this); }
    drawInvincibilityCountdown() { return hudOverlays.drawInvincibilityCountdown.call(this); }
    drawGhostPreviews(spawnProgress) { return hudOverlays.drawGhostPreviews.call(this, spawnProgress); }

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
    
    drawGhostEnemy(progress) { return hudOverlays.drawGhostEnemy.call(this, progress); }
    drawGhostAsteroid(progress) { return hudOverlays.drawGhostAsteroid.call(this, progress); }
} 
