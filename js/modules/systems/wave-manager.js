/**
 * WaveManager — wave lifecycle, spawning, notifications, and level scaling.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_CONFIG, GAME_STATES, getEnemyFiringCooldown } from '../constants.js';
import { Asteroid } from '../entities/asteroid.js';
import { Enemy } from '../entities/enemy.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, getLevelScaledEnemyStats, getLevelScaledAsteroidStats } from '../wave-data.js';
import { random } from '../utils.js';
import { GameTimer } from '../core/game-timer.js';
import { ENEMY_TYPES } from '../entities/enemy.js';
import { PRIMARY_WEAPONS } from '../weapon-data.js';

// Local constant to avoid circular import with game-engine.js
const PLAYER_STATES = { NORMAL: 'normal' };

// Fixed wave system with object limits for performance
export function updateWaveSystem() {
    if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) {
        return;
    }

    // Clean up dead entities first
    this.enemyPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();

    // Check if current wave is complete (only enemies count — asteroids are obstacles/loot)
    const totalEnemies = this.enemyPool.activeObjects.length;

    if (totalEnemies === 0 && !this.game.waveComplete && this.game.state === GAME_STATES.PLAYING) {
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

export function getWaveSubtitle(waveNumber) {
    const subtitles = {
        1:  "Don't worry, they die easy.",
        2:  "Okay maybe worry a little.",
        3:  "They brought friends.",
        4:  "These ones are chonky.",
        5:  "The green means GO AWAY.",
        6:  "Fast and angry. Like bees. Space bees.",
        7:  "Bzz bzz bzz bzz.",
        8:  "They have LASERS now?!",
        9:  "Laser tag, but unfair.",
        10: "Shocking, really.",
        11: "They float weird and it's unsettling.",
        12: "Missile lock! ...that's bad, right?",
        13: "Webs. In space. Sure, why not.",
        14: "Shields up! ...theirs, not yours.",
        15: "Watch your step. Or your float.",
        16: "He's a big boy.",
        17: "Red vs Green. You vs both.",
        18: "Speed and spite in equal measure.",
        19: "Double the shields, double the pain.",
        20: "Stay out of the crosshairs.",
        21: "Invisible AND angry. Great.",
        22: "Dodge THIS.",
        23: "They learned teamwork. Rude.",
        24: "More mines than a Minecraft server.",
        25: "Halfway to glory. Or doom.",
        26: "They're evolving. You're sweating.",
        27: "The welcoming committee got bigger.",
        28: "Not a great time to sneeze.",
        29: "They're just showing off now.",
        30: "Boss rush, baby!",
        31: "Welcome to the gauntlet.",
        32: "Three flavors of pain.",
        33: "This is fine. Everything is fine.",
        34: "Your shield called in sick today.",
        35: "Asteroids are the LEAST of your problems.",
        36: "Skill issue incoming.",
        37: "The difficulty curve just went vertical.",
        38: "Brought a ship to a knife fight.",
        39: "It's not a party without explosions.",
        40: "Round number! Celebrate by not dying.",
        41: "Past the point of no return.",
        42: "The answer to everything is MORE BULLETS.",
        43: "They're not even trying to be fair.",
        44: "Duck, weave, and pray.",
        45: "The math is not in your favor.",
        46: "Panic is an acceptable strategy.",
        47: "Survival is a strong word.",
        48: "Almost to the war zone!",
        49: "One more and it gets REALLY bad.",
        50: "Welcome to the war zone.",
    };

    if (subtitles[waveNumber]) return subtitles[waveNumber];

    // Generic pool for waves beyond 50
    const generic = [
        "Good luck. You'll need it.",
        "Still alive? Impressive.",
        "They keep coming!",
        "This is getting ridiculous.",
        "You're built different.",
        "No one said this would be easy.",
        "Just another day at the office.",
        "More enemies, more problems.",
        "Are you even blinking?",
        "Legend says no one survives this.",
        "Your keyboard is begging for mercy.",
        "Error 404: Easy mode not found.",
        "Respawn? Never heard of it.",
        "They're REALLY mad now.",
        "Insert coin to continue. Oh wait.",
    ];
    return generic[(waveNumber * 7 + 3) % generic.length];
}

export function showWaveComplete() {
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

export function startNextWave() {
    // Clean up inactive objects in all pools before starting the next wave
    this.bulletPool.cleanupInactive();
    this.particlePool.cleanupInactive();
    this.lineDebrisPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();
    this.enemyPool.cleanupInactive();
    this.enemyBulletPool.cleanupInactive();
    this.colorStarPool.cleanupInactive();
    this.backgroundStarPool.cleanupInactive();

    this.game.currentWave++;
    this.game.waveComplete = false;
    this.game.state = GAME_STATES.WAVE_TRANSITION;

    // Reset player state at wave start
    this.playerState = PLAYER_STATES.NORMAL;

    // Restore player health to full between waves
    this.player.health = this.player.getEffectiveMaxHealth();

    // Show wave start message with pithy subtitle
    this.waveMessage = {
        active: true,
        startTime: Date.now(),
        duration: 3000,
        title: `WAVE ${this.game.currentWave}`,
        subtitle: this.getWaveSubtitle(this.game.currentWave),
    };

    // Delay spawning until message has been read (GameTimer — pauses with game)
    this._gameTimers.push(new GameTimer(2000, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.PLAYING;
            this.spawnWaveEntities();
        }
    }));
}

export function spawnWaveEntities() {
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

export function spawnAsteroids(count) {
    for (let i = 0; i < count; i++) {
        const asteroid = this.asteroidPool.get();
        if (asteroid) {
            this.initializeWaveAsteroid(asteroid);
        }
    }
}

export function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        const enemy = this.enemyPool.get();
        if (enemy) {
            const enemyType = this.getRandomEnemyType();
            const sp = this.getRandomSpawnPosition();
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            enemy.startWarpIn(sp.targetX, sp.targetY);
        }
    }
}

export function spawnLeveledAsteroids(count) {
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

export function spawnLeveledEnemies(enemyType, count) {
    for (let i = 0; i < count; i++) {
        const enemy = this.enemyPool.get();
        if (enemy) {
            const sp = this.getRandomSpawnPosition();
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            this.applyEnemyLevelScaling(enemy);
            enemy.startWarpIn(sp.targetX, sp.targetY);
        }
    }
}

export function initializeLeveledAsteroid(asteroid) {
    // Use existing initialization but with level scaling
    this.initializeWaveAsteroid(asteroid);

    // Apply level scaling to health
    const baseHealth = asteroid.health;
    asteroid.health = getLevelScaledAsteroidStats(baseHealth, this.game.asteroidLevel);
    asteroid.maxHealth = asteroid.health;
}

export function applyEnemyLevelScaling(enemy) {
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

export function completeWave() {
    const clearedWave = this.game.currentWave;
    this.waveInProgress = false;
    this.game.currentWave++;
    this.waveTimer = Date.now() + GAME_CONFIG.WAVE_BREAK_TIME;
    this.wavePhase = 'waiting';

    // Use canonical level formulas from wave-data.js
    this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
    this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);

    // Wave clear bonus: XP + coins scale with wave number
    const bonusXP = 20 + clearedWave * 10;
    const bonusCoins = 50 + clearedWave * 25;
    this.player.gainExperience(bonusXP);
    this.game.money += bonusCoins;
    this.queueNotification(`WAVE ${clearedWave} CLEARED`,
        `+${bonusXP} XP  +${bonusCoins} coins`, 2500);

    // Auto-unlock primary weapons at wave milestones
    for (const [id, weapon] of Object.entries(PRIMARY_WEAPONS)) {
        if (weapon.unlockWave > 0 &&
            this.game.currentWave >= weapon.unlockWave &&
            !this.player.ownedPrimaries.has(id)) {
            this.player.ownedPrimaries.add(id);
            this.queueNotification(`NEW WEAPON UNLOCKED`,
                `${weapon.name} — ${weapon.description}`, 4000);
        }
    }
}

export function queueNotification(title, subtitle, duration) {
    if (!this.notificationQueue) this.notificationQueue = [];
    this.notificationQueue.push({ title, subtitle, duration, queued: Date.now() });

    // Start processing if not already
    if (!this.notificationActive) {
        this.processNotificationQueue();
    }
}

export function processNotificationQueue() {
    if (!this.notificationQueue || this.notificationQueue.length === 0) {
        this.notificationActive = false;
        return;
    }

    this.notificationActive = true;
    const notif = this.notificationQueue.shift();

    this.events.emit('ui:show-message', { title: notif.title, subtitle: notif.subtitle, duration: notif.duration, position: 'top' });

    // Process next notification after this one finishes (with small gap)
    setTimeout(() => this.processNotificationQueue(), notif.duration + 300);
}

export function startNewWave() {
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
        this.events.emit('ui:show-message', { title: `WAVE ${this.game.currentWave}`, subtitle: '', duration: 7000, position: 'top' });


    } catch (error) {
        console.error('❌ Error in startNewWave:', error);
        console.error('❌ Stack trace:', error.stack);
    }
}

export function initializeWaveAsteroid(asteroid) {
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

    const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
    const vel = {
        x: random(-spd, spd) || 0.2,
        y: random(-spd, spd) || 0.2
    };

    asteroid.initializeAsteroid(x, y, r, this.game.asteroidLevel, this);
    asteroid.vel = vel;
}

export function getRandomSpawnPosition() {
    // Spawn enemies well beyond the map edge so they fly in visibly
    const margin = 200 + Math.random() * 200; // 200-400px offscreen
    let x, y, targetX, targetY;

    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
        case 0: // Top
            x = Math.random() * this.gameField.width;
            y = -margin;
            targetX = x + random(-100, 100);
            targetY = 80 + Math.random() * (this.gameField.height * 0.3);
            break;
        case 1: // Right
            x = this.gameField.width + margin;
            y = Math.random() * this.gameField.height;
            targetX = this.gameField.width - 80 - Math.random() * (this.gameField.width * 0.3);
            targetY = y + random(-100, 100);
            break;
        case 2: // Bottom
            x = Math.random() * this.gameField.width;
            y = this.gameField.height + margin;
            targetX = x + random(-100, 100);
            targetY = this.gameField.height - 80 - Math.random() * (this.gameField.height * 0.3);
            break;
        case 3: // Left
            x = -margin;
            y = Math.random() * this.gameField.height;
            targetX = 80 + Math.random() * (this.gameField.width * 0.3);
            targetY = y + random(-100, 100);
            break;
        default: x = 0; y = 0; targetX = 200; targetY = 200; break;
    }

    // Clamp target inside field
    targetX = Math.max(60, Math.min(this.gameField.width - 60, targetX));
    targetY = Math.max(60, Math.min(this.gameField.height - 60, targetY));

    return { x, y, targetX, targetY };
}

export function getRandomEnemyType() {
    let availableTypes = ['HUNTER', 'WASP'];
    if (this.game.currentWave >= 2) availableTypes.push('GUARDIAN', 'STALKER');
    if (this.game.currentWave >= 4) availableTypes.push('TANGERINE');
    if (this.game.currentWave >= 6) availableTypes.push('TITAN');
    return availableTypes[Math.floor(Math.random() * availableTypes.length)];
}

// ── Spawning Methods (Phase 3.8) ──

export function spawnAsteroidOffscreen() {
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

export function spawnWaveAsteroids() {
    const desiredAsteroids = GAME_CONFIG.INITIAL_AST_COUNT;
    const currentAsteroids = this.asteroidPool.activeObjects.length;
    const asteroidsToSpawn = Math.max(0, desiredAsteroids - currentAsteroids);

    for (let i = 0; i < asteroidsToSpawn; i++) {
        setTimeout(() => {
            const asteroid = this.asteroidPool.get();
            if (asteroid) {
                this.initializeWaveAsteroid(asteroid);
            }
        }, i * 200);
    }
}

export function startEnemySubWave() {
    this.enemiesRemainingInSubWave = GAME_CONFIG.ENEMIES_PER_SUB_WAVE;
    this.subWaveStartTime = Date.now();
    this.subWaveTimer = Date.now();
    this.lastEnemySpawn = 0;
}

export function forceSpawnEntity() {
    const activeEnemies = this.enemyPool.activeObjects.length;
    const activeAsteroids = this.asteroidPool.activeObjects.length;
    const totalEntities = activeEnemies + activeAsteroids;

    if (totalEntities === 0) {
        if (this.forceSpawnEnemy()) return true;
        if (this.forceSpawnAsteroid()) return true;
    }

    let spawnEnemy = Math.random() < 0.5;
    if (activeAsteroids >= GAME_CONFIG.MAX_ASTEROIDS) {
        spawnEnemy = true;
    }

    if (spawnEnemy) {
        if (this.forceSpawnEnemy()) return true;
    } else {
        if (this.forceSpawnAsteroid()) return true;
    }

    if (spawnEnemy) {
        if (this.forceSpawnAsteroid()) return true;
    } else {
        if (this.forceSpawnEnemy()) return true;
    }

    if (this.forceSpawnEnemy()) return true;
    if (this.forceSpawnAsteroid()) return true;

    console.error('❌ ALL SPAWN METHODS EXHAUSTED!');
    return false;
}

export function forceSpawnEnemy() {
    const enemy = this.enemyPool.get();
    if (enemy) {
        const sp = this.getRandomSpawnPosition();
        const enemyType = this.getRandomEnemyType();
        enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
        enemy.startWarpIn(sp.targetX, sp.targetY);
        return true;
    }

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

export function forceSpawnAsteroid() {
    if (this.asteroidPool.activeObjects.length >= GAME_CONFIG.MAX_ASTEROIDS) {
        return false;
    }

    const asteroid = this.asteroidPool.get();
    if (asteroid) {
        this.initializeWaveAsteroid(asteroid);
        return true;
    }

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

export function isInMinimapArea(worldX, worldY) {
    const screenX = worldX - this.camera.x;
    const screenY = worldY - this.camera.y;

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

export function spawnContinuousAsteroid() {
    const asteroid = this.asteroidPool.get();
    if (asteroid) {
        this.initializeWaveAsteroid(asteroid);
    } else {
        console.warn('⚠️ Failed to get asteroid from pool!');
        const newAsteroid = new Asteroid();
        this.initializeWaveAsteroid(newAsteroid);
        this.asteroidPool.activeObjects.push(newAsteroid);
    }
}

export function spawnRandomEnemy() {
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
