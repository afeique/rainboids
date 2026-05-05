/**
 * WaveManager — wave lifecycle, spawning, notifications, and level scaling.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_CONFIG, GAME_STATES, MAX_WAVES, getEnemyFiringCooldown } from '../core/constants.js';
import { Asteroid } from '../world/asteroid.js';
import { Enemy } from '../enemy/enemy.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, getLevelScaledEnemyStats, getLevelScaledAsteroidStats, getEnemySpeedMultiplier, getEnemyBulletSpeedMultiplier, WAVE_SUBTITLES, WAVE_SUBTITLES_GENERIC, BOSS_TIER_STATS, isBossWave } from './wave-data.js';
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

    // Wave-clear gate: every enemy must be FULLY dead — past the death
    // animation, not just mid-flash. cleanupInactive at the top of this
    // function releases enemies once `active` flips to false (which
    // happens at the end of the death sequence, see enemy.update). So
    // counting `activeObjects.length` directly is the correct test:
    // mid-death enemies still have `active=true` and stay in the pool;
    // only after the big-bang completes and the recycle frame fires do
    // they leave. This keeps the shop from popping over the explosion.
    const totalEnemies = this.enemyPool.activeObjects.length;

    if (totalEnemies === 0 && !this.game.waveComplete && this.game.state === GAME_STATES.PLAYING) {
        // Wave completed! If this is the final wave, the run is over —
        // route through GAME_COMPLETE instead of opening the shop.
        this.game.waveComplete = true;
        this.game.waveCountdownTime = Date.now() + this.game.waveCountdownDuration;
        this.game.state = GAME_STATES.WAVE_TRANSITION;

        // 5.72.2 — wave-clear bonuses inlined here. The old
        // `completeWave()` export was never called from the live
        // gameplay loop (only by tests / dev scripts), so the +1
        // powerup pick + XP + coins bonus that 5.70.0 added there
        // never actually fired in-game. Now it always does, on every
        // wave clear, before the shop opens.
        const clearedWave = this.game.currentWave;
        const bonusXP = 20 + clearedWave * 10;
        const bonusCoins = 50 + clearedWave * 25;
        this.player.gainExperience(bonusXP);
        this.game.money += bonusCoins;
        this.player.powerupPicks = (this.player.powerupPicks || 0) + 1;

        if (this.game.currentWave >= MAX_WAVES) {
            this.completeRun();
            return;
        }

        this.showWaveComplete();

        // Bumped the shop delay 2000 → 2700ms so the WAVE COMPLETE
        // banner has a clear ~700ms window to fully fade BEFORE the
        // shop overlay covers the canvas. (showWaveComplete uses
        // duration:2000 with the last 35% of that as fade-out.)
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) this.openShop();
        }, 2700);
    }

    // (Removed) Auto-advance countdown — the shop now gates the next
    // wave. closeShop() calls startNextWave() when the player is ready.
}

export function getWaveSubtitle(waveNumber) {
    if (WAVE_SUBTITLES[waveNumber]) return WAVE_SUBTITLES[waveNumber];
    return WAVE_SUBTITLES_GENERIC[(waveNumber * 7 + 3) % WAVE_SUBTITLES_GENERIC.length];
}

export function showWaveComplete() {
    // Show WAVE COMPLETE message with next wave number. Duration is
    // 2000ms — matches the openShop delay in updateWaveSystem so the
    // text finishes its fade-out (~last 30%) right before the shop UI
    // takes over. Visual heads-up + temporal pause between action and
    // shop interaction.
    const nextWave = this.game.currentWave + 1;
    this.waveMessage = {
        active: true,
        startTime: Date.now(),
        duration: 2000,
        title: 'WAVE COMPLETE!',
        subtitle: `WAVE ${nextWave} INCOMING...`,
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

    // Player keeps whatever health they finished the wave with — no
    // free top-up between waves. Health-orb pickups, MEDPACK powerup,
    // or the shop's repair option are the legitimate ways to heal.
    // Cap to current max in case Health Boost upgrades changed it
    // post-clear so we never report > max.
    const cap = this.player.getEffectiveMaxHealth();
    if (this.player.health > cap) this.player.health = cap;

    // Wave intro: full-screen dark overlay with "WAVE N" — entities warp
    // in during the dark hold, settling into place as the overlay fades.
    this.waveMessage = {
        active: true,
        startTime: Date.now(),
        duration: 2800,
        title: `WAVE ${this.game.currentWave}`,
        subtitle: this.getWaveSubtitle(this.game.currentWave),
        phase: 'intro',
    };

    // Spawn entities ~700ms in (overlay is fully dark by then) so the
    // ~700-1500ms warp-in animation finishes during the fade-out window.
    // Order matters: spawn FIRST, then flip to PLAYING — otherwise
    // checkWaveComplete can briefly see "0 enemies + PLAYING +
    // !waveComplete" and instantly jump to the next wave.
    this._gameTimers.push(new GameTimer(700, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.spawnWaveEntities();
            // Brief grace window so the player isn't ganked by enemies as
            // they finish warping in. ~3s covers the ~700-1500ms warp-in
            // plus a beat to orient before the field is "live" again.
            if (this.player && this.player.active) {
                this.player.makeInvincible(3000);
                this.player.justRespawned = false; // suppress respawn HUD ring
            }
        }
    }));
    this._gameTimers.push(new GameTimer(2800, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
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
        const opts = { onScreen: true };
        if (enemyGroup.isBoss && enemyGroup.bossTier) opts.bossTier = enemyGroup.bossTier;
        this.spawnLeveledEnemies(enemyGroup.type, enemyGroup.count, opts);
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
            this.applyEnemyLevelScaling(enemy, opts);
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

export function applyEnemyLevelScaling(enemy, opts = {}) {
    // Get base stats from enemy type
    const baseStats = ENEMY_TYPES[enemy.type];

    // Apply level scaling
    const scaledStats = getLevelScaledEnemyStats(baseStats, this.game.enemyLevel);

    // Campaign-wide speed ramps. Enemy MOVEMENT stays gentle on wave 1
    // (helps the player learn); enemy BULLET speed is decoupled and
    // starts at 1.15× — considerably faster than the old shared 0.55×
    // floor.
    const campaignSpeedMul = getEnemySpeedMultiplier(this.game.currentWave);
    const bulletSpeedMul = getEnemyBulletSpeedMultiplier(this.game.currentWave);

    enemy.health = scaledStats.health;
    enemy.maxHealth = scaledStats.health;
    enemy.config.speed = scaledStats.speed * campaignSpeedMul;
    enemy.bulletSpeedMul = bulletSpeedMul;

    // Set level-based firing cooldown
    enemy.firingCooldown = getEnemyFiringCooldown(enemy.type, this.game.enemyLevel);

    // Update points value for higher level enemies
    enemy.config.points = scaledStats.points;

    // Boss-tier overlays: HP × hpMul, points override, larger size, faster
    // speed multiplier on top of campaign scaling. Bosses also get a
    // visible bossTier marker for the renderer.
    if (opts.bossTier) {
        const tier = BOSS_TIER_STATS[opts.bossTier] || BOSS_TIER_STATS[1];
        enemy.isBoss = true;
        enemy.bossTier = opts.bossTier;
        enemy.health *= tier.hpMul;
        enemy.maxHealth *= tier.hpMul;
        enemy.config.speed *= tier.speedMul;
        enemy.config.points = tier.points;
        // Inflate radius/size for visual bossiness. The renderer reads
        // either `radius` or whatever the type uses; we set both for safety.
        if (typeof enemy.radius === 'number') enemy.radius *= tier.sizeMul;
        if (typeof enemy.bossSizeMul === 'undefined') enemy.bossSizeMul = tier.sizeMul;
    }
}

// Final-wave-cleared handler — finalize stats and transition to the
// Game Complete screen. Called from updateWaveSystem when the player
// clears the last wave of the campaign.
export function completeRun() {
    this.game.waveComplete = true;
    if (this.game.stats) {
        this.game.stats.finalTimeMs = Date.now() - (this.game.stats.gameStartTime || Date.now());
        this.game.stats.completed = true;
    }
    // Brief toast for the moment of victory, then transition.
    this.events.emit('ui:show-message', {
        title: 'CAMPAIGN COMPLETE',
        subtitle: 'The void is silent.',
        duration: 1800,
        position: 'top',
    });
    setTimeout(() => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.GAME_COMPLETE;
        }
    }, 1200);
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

    // Wave clear bonus: XP + coins scale with wave number, plus a
    // free powerup pick (5.70.0) the player redeems in the shop.
    // Picks accumulate, so skipping the shop one wave doesn't waste them.
    const bonusXP = 20 + clearedWave * 10;
    const bonusCoins = 50 + clearedWave * 25;
    this.player.gainExperience(bonusXP);
    this.game.money += bonusCoins;
    this.player.powerupPicks += 1;
    this.queueNotification(`WAVE ${clearedWave} CLEARED`,
        `+${bonusXP} XP  +${bonusCoins} coins  +1 powerup pick`, 2500);

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
    // All asteroids now warp in — wave-start spawns warp into the visible
    // viewport so the field is "ready" the instant the intro overlay lifts;
    // continuous spawns warp in from outside the gameField edge to a point
    // inside the play area.
    const r = random(30, 60);
    const spawnBuffer = r * 4;

    let targetX, targetY, srcX, srcY;

    if (opts.onScreen) {
        // Target inside the current viewport. Source is just outside the
        // closest viewport edge so the streak enters from the screen border.
        const target = this.getOnScreenSpawnPosition({
            minDistFromPlayer: r + 220,
            edgePad: r + 12,
        });
        targetX = target.x;
        targetY = target.y;
        const camX = this.camera.x, camY = this.camera.y;
        const camR = camX + this.width, camB = camY + this.height;
        const dL = targetX - camX, dR = camR - targetX;
        const dT = targetY - camY, dB = camB - targetY;
        const minDist = Math.min(dL, dR, dT, dB);
        const sourceMargin = 220 + Math.random() * 160;
        if (minDist === dT) { srcX = targetX + random(-120, 120); srcY = camY - sourceMargin; }
        else if (minDist === dB) { srcX = targetX + random(-120, 120); srcY = camB + sourceMargin; }
        else if (minDist === dL) { srcX = camX - sourceMargin; srcY = targetY + random(-120, 120); }
        else { srcX = camR + sourceMargin; srcY = targetY + random(-120, 120); }
    } else {
        // Continuous / cheat / wave-asteroid path: source on the gameField
        // edge, target somewhere in the middle 60% of the field.
        let attempts = 0;
        do {
            const edge = Math.floor(random(0, 4));
            switch (edge) {
                case 0: srcX = random(0, this.gameField.width); srcY = -spawnBuffer; break;
                case 1: srcX = this.gameField.width + spawnBuffer; srcY = random(0, this.gameField.height); break;
                case 2: srcX = random(0, this.gameField.width); srcY = this.gameField.height + spawnBuffer; break;
                case 3: srcX = -spawnBuffer; srcY = random(0, this.gameField.height); break;
            }
            attempts++;
        } while (this.isInMinimapArea(srcX, srcY) && attempts < 10);
        targetX = random(this.gameField.width * 0.2, this.gameField.width * 0.8);
        targetY = random(this.gameField.height * 0.2, this.gameField.height * 0.8);
    }

    const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
    const vel = {
        x: random(-spd, spd) || 0.2,
        y: random(-spd, spd) || 0.2
    };

    // Place asteroid at warp source so it streaks in toward the target.
    asteroid.initializeAsteroid(srcX, srcY, r, this.game.asteroidLevel, this);
    asteroid.vel = vel;
    asteroid.startWarpIn(targetX, targetY);
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
    newAst.startWarpIn(tx, ty);
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

    // 5.72.0 — minimap moved to TOP-LEFT (see hud/navigation.js).
    const minDim = Math.min(this.width, this.height);
    const mmSize = minDim < 500 ? Math.max(80, Math.floor(minDim * 0.22)) : 150;
    const mmMargin = mmSize < 120 ? 10 : 20;
    const minimapLeft = mmMargin;
    const minimapTop = mmMargin;
    const minimapRight = mmMargin + mmSize;
    const minimapBottom = mmMargin + mmSize;

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
