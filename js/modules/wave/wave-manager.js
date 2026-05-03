/**
 * WaveManager — wave lifecycle, spawning, notifications, and level scaling.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_CONFIG, GAME_STATES, getEnemyFiringCooldown } from '../core/constants.js';
import { Asteroid } from '../world/asteroid.js';
import { Enemy } from '../enemy/enemy.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, getLevelScaledEnemyStats, getLevelScaledAsteroidStats, WAVE_SUBTITLES, WAVE_SUBTITLES_GENERIC } from './wave-data.js';
import { random } from '../core/utils.js';
import { GameTimer } from '../core/game-timer.js';
import { ENEMY_TYPES } from '../enemy/enemy.js';
import { PRIMARY_WEAPONS } from '../combat/weapon-data.js';

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
    // Exclude enemies in death flash — they're visually dying but haven't been cleaned up yet
    const totalEnemies = this.enemyPool.activeObjects.filter(e => !e._deathFlash).length;

    if (totalEnemies === 0 && !this.game.waveComplete && this.game.state === GAME_STATES.PLAYING) {
        // Wave completed! Roguelite flow: brief "WAVE COMPLETE!" toast,
        // then auto-pop the shop. closeShop() routes back through
        // startNextWave() so the player decides when the next wave kicks
        // off — they can browse upgrades for as long as they want.
        this.game.waveComplete = true;
        this.game.waveCountdownTime = Date.now() + this.game.waveCountdownDuration;
        this.game.state = GAME_STATES.WAVE_TRANSITION;

        this.showWaveComplete();

        // Short delay so the WAVE COMPLETE! toast registers, then shop
        // takes over. No fallback countdown to startNextWave anymore —
        // the shop is the gate between waves.
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) this.openShop();
        }, 700);
    }

    // (Removed) Auto-advance countdown — the shop now gates the next
    // wave. closeShop() calls startNextWave() when the player is ready.
}

export function getWaveSubtitle(waveNumber) {
    if (WAVE_SUBTITLES[waveNumber]) return WAVE_SUBTITLES[waveNumber];
    return WAVE_SUBTITLES_GENERIC[(waveNumber * 7 + 3) % WAVE_SUBTITLES_GENERIC.length];
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
    // Same ordering constraint as the wave-1 init: spawn FIRST, then flip
    // to PLAYING, so checkWaveComplete can never see a "0 enemies +
    // PLAYING + !waveComplete" tuple before the new wave's entities
    // exist.
    this._gameTimers.push(new GameTimer(2000, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.spawnWaveEntities();
            this.game.state = GAME_STATES.PLAYING;
        }
    }));
}

export function spawnWaveEntities() {
    // Get wave configuration from wave data
    const waveConfig = getWaveConfig(this.game.currentWave);

    // Calculate levels for this wave
    this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
    this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);

    // Wave-start spawning places entities INSIDE the visible viewport so the
    // player sees the threats before the wave begins instead of having them
    // drift in from beyond the gameField edge — important when the player
    // moves quickly during the WAVE-START message and would otherwise lose
    // sight of newly spawned entities.
    this.spawnLeveledAsteroids(waveConfig.asteroids, { onScreen: true });

    for (const enemyGroup of waveConfig.enemies) {
        this.spawnLeveledEnemies(enemyGroup.type, enemyGroup.count, { onScreen: true });
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

export function spawnLeveledAsteroids(count, opts = {}) {
    // Respect MAX_ASTEROIDS limit for performance
    const activeAsteroids = this.asteroidPool.activeObjects.length;
    const maxToSpawn = Math.min(count, GAME_CONFIG.MAX_ASTEROIDS - activeAsteroids);

    for (let i = 0; i < maxToSpawn; i++) {
        const asteroid = this.asteroidPool.get(undefined, undefined, undefined, 1, this);
        if (asteroid) {
            this.initializeLeveledAsteroid(asteroid, opts);
        }
    }
}

export function spawnLeveledEnemies(enemyType, count, opts = {}) {
    for (let i = 0; i < count; i++) {
        const enemy = this.enemyPool.get();
        if (enemy) {
            const sp = this.getRandomSpawnPosition(opts);
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            this.applyEnemyLevelScaling(enemy);
            enemy.startWarpIn(sp.targetX, sp.targetY);
        }
    }
}

export function initializeLeveledAsteroid(asteroid, opts = {}) {
    // Use existing initialization but with level scaling
    this.initializeWaveAsteroid(asteroid, opts);

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

export function initializeWaveAsteroid(asteroid, opts = {}) {
    // Default behavior: spawn at random gameField edge so asteroids drift in
    // from off-map. With opts.onScreen, spawn inside the current viewport at
    // a safe minimum distance from the player so the wave's threats are
    // already visible the instant it starts.
    let x, y;
    let attempts = 0;
    const r = random(30, 60);
    const spawnBuffer = r * 4;

    if (opts.onScreen) {
        const pos = this.getOnScreenSpawnPosition({
            minDistFromPlayer: r + 220,
            edgePad: r + 12,
        });
        x = pos.x;
        y = pos.y;
    } else {
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
    }

    const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
    const vel = {
        x: random(-spd, spd) || 0.2,
        y: random(-spd, spd) || 0.2
    };

    asteroid.initializeAsteroid(x, y, r, this.game.asteroidLevel, this);
    asteroid.vel = vel;
}

export function getRandomSpawnPosition(opts = {}) {
    // Default behavior: spawn enemies well beyond the gameField edge so the
    // warp-in animation streaks them in visibly. With opts.onScreen, anchor
    // the warp TARGET inside the visible viewport (at safe distance from
    // the player) and place the warp source just outside the corresponding
    // viewport edge — the warp animation stays brief and the enemy is
    // visible immediately when the wave starts.
    let x, y, targetX, targetY;

    if (opts.onScreen) {
        const target = this.getOnScreenSpawnPosition({
            minDistFromPlayer: 260,
            edgePad: 90,
        });
        targetX = target.x;
        targetY = target.y;

        // Pick the closest viewport edge to start the warp from, so the
        // streak enters from the side it would appear on visually.
        const camX = this.camera.x, camY = this.camera.y;
        const camR = camX + this.width, camB = camY + this.height;
        const dL = targetX - camX, dR = camR - targetX;
        const dT = targetY - camY, dB = camB - targetY;
        const minDist = Math.min(dL, dR, dT, dB);
        const sourceMargin = 220 + Math.random() * 160; // 220-380 px outside viewport edge

        if (minDist === dT) {
            x = targetX + random(-120, 120);
            y = camY - sourceMargin;
        } else if (minDist === dB) {
            x = targetX + random(-120, 120);
            y = camB + sourceMargin;
        } else if (minDist === dL) {
            x = camX - sourceMargin;
            y = targetY + random(-120, 120);
        } else {
            x = camR + sourceMargin;
            y = targetY + random(-120, 120);
        }
    } else {
        // Original off-gameField behavior for continuous / cheat spawns.
        const margin = 200 + Math.random() * 200; // 200-400px offscreen
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
            case 0:
                x = Math.random() * this.gameField.width;
                y = -margin;
                targetX = x + random(-100, 100);
                targetY = 80 + Math.random() * (this.gameField.height * 0.3);
                break;
            case 1:
                x = this.gameField.width + margin;
                y = Math.random() * this.gameField.height;
                targetX = this.gameField.width - 80 - Math.random() * (this.gameField.width * 0.3);
                targetY = y + random(-100, 100);
                break;
            case 2:
                x = Math.random() * this.gameField.width;
                y = this.gameField.height + margin;
                targetX = x + random(-100, 100);
                targetY = this.gameField.height - 80 - Math.random() * (this.gameField.height * 0.3);
                break;
            case 3:
                x = -margin;
                y = Math.random() * this.gameField.height;
                targetX = 80 + Math.random() * (this.gameField.width * 0.3);
                targetY = y + random(-100, 100);
                break;
            default: x = 0; y = 0; targetX = 200; targetY = 200; break;
        }
    }

    // Clamp target inside field
    targetX = Math.max(60, Math.min(this.gameField.width - 60, targetX));
    targetY = Math.max(60, Math.min(this.gameField.height - 60, targetY));

    return { x, y, targetX, targetY };
}

/**
 * Pick a world-space position inside the visible viewport, at least
 * `minDistFromPlayer` away from the player ship, avoiding the minimap
 * overlay region. Used for wave-start spawning so the player can see the
 * entities that just appeared.
 */
export function getOnScreenSpawnPosition({ minDistFromPlayer = 240, edgePad = 80 } = {}) {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const fieldW = this.gameField.width;
    const fieldH = this.gameField.height;
    // Viewport bounds clamped within the gameField, with an inner edge pad
    // so entities don't spawn flush against the screen edge.
    const left   = Math.max(edgePad, camX + edgePad);
    const right  = Math.min(fieldW - edgePad, camX + this.width - edgePad);
    const top    = Math.max(edgePad, camY + edgePad);
    const bottom = Math.min(fieldH - edgePad, camY + this.height - edgePad);

    // Degenerate viewport (very small / mis-clamped): fall back to gameField
    // center within bounds.
    const safeLeft   = Math.min(left, right);
    const safeRight  = Math.max(left, right);
    const safeTop    = Math.min(top, bottom);
    const safeBottom = Math.max(top, bottom);

    const px = (this.player && this.player.active) ? this.player.x : (camX + this.width / 2);
    const py = (this.player && this.player.active) ? this.player.y : (camY + this.height / 2);

    let x = px, y = py;
    for (let attempt = 0; attempt < 24; attempt++) {
        x = random(safeLeft, safeRight);
        y = random(safeTop, safeBottom);
        if (this.isInMinimapArea(x, y)) continue;
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy >= minDistFromPlayer * minDistFromPlayer) {
            return { x, y };
        }
    }

    // Fallback: project the last candidate outward from the player to satisfy
    // the minimum-distance constraint, clamped to the safe viewport rect.
    const dx = x - px, dy = y - py;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (dx / len) * minDistFromPlayer;
    const oy = (dy / len) * minDistFromPlayer;
    return {
        x: Math.max(safeLeft, Math.min(safeRight, px + ox)),
        y: Math.max(safeTop, Math.min(safeBottom, py + oy)),
    };
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
