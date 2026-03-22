/**
 * AI QA Bot — State Reader (Rainboids-specific)
 *
 * Extracts complete game state snapshots via page.evaluate().
 * Also detects state transitions and derives events from deltas.
 */

export class StateReader {
    constructor(page) {
        this.page = page;
        this._prev = null;
        this._killBufferInitialized = false;
    }

    /**
     * Read a complete game state snapshot.
     * @returns {object} Full state snapshot
     */
    async read() {
        const state = await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge) return null;

            const player = ge.player;
            const game = ge.game;

            // Powerups → plain object
            const powerups = {};
            if (player?.powerups) {
                for (const [k, v] of player.powerups) {
                    powerups[k] = { stacks: v.stacks, timeRemaining: v.timeRemaining };
                }
            }

            // Active entities (minimal data for performance)
            const enemies = (ge.enemyPool?.activeObjects || []).map(e => ({
                x: e.x, y: e.y, type: e.type, level: e.level,
                health: e.health, maxHealth: e.maxHealth, radius: e.radius,
                vx: e.vel?.x || 0, vy: e.vel?.y || 0,
            }));

            const asteroids = (ge.asteroidPool?.activeObjects || []).map(a => ({
                x: a.x, y: a.y, radius: a.radius, health: a.health,
            }));

            const enemyBullets = (ge.enemyBulletPool?.activeObjects || []).map(b => ({
                x: b.x, y: b.y, vx: b.vel?.x || 0, vy: b.vel?.y || 0,
            }));

            const powerupDrops = (ge.powerupPool?.activeObjects || []).map(p => ({
                x: p.x, y: p.y, type: p.type,
            }));

            return {
                timestamp: Date.now(),
                gameState: game?.state,
                wave: game?.currentWave,
                money: game?.money,
                lives: game?.lives,
                enemyLevel: game?.enemyLevel,

                player: player ? {
                    x: player.x,
                    y: player.y,
                    health: player.health,
                    maxHealth: player.maxHealth,
                    shield: player.shield,
                    level: player.level,
                    skillPoints: player.skillPoints,
                    experience: player.experience,
                    activePrimary: player.activePrimary,
                    activePower: player.activePower,
                    skillSlots: player.skillSlots ? [...player.skillSlots] : [],
                    skillCooldowns: player.skillCooldowns ? [...player.skillCooldowns] : [],
                    ownedPrimaries: player.ownedPrimaries ? [...player.ownedPrimaries] : [],
                    ownedPowers: player.ownedPowers ? [...player.ownedPowers] : [],
                    ownedSkills: player.ownedSkills ? [...player.ownedSkills] : [],
                    isCharging: player.isCharging || false,
                    chargeLevel: player.chargeLevel || 0,
                    chargePaused: player.chargePaused || false,
                    canShoot: player.canShoot || false,
                    lastShotTime: player.lastShotTime || 0,
                    vx: player.vel?.x || 0,
                    vy: player.vel?.y || 0,
                    angle: player.angle,
                    powerups,
                } : null,

                entities: {
                    enemies,
                    asteroids,
                    enemyBullets,
                    playerBulletCount: ge.bulletPool?.activeObjects?.length || 0,
                    particleCount: ge.particlePool?.activeObjects?.length || 0,
                    powerupDrops,
                    orbCount: ge.colorStarPool?.activeObjects?.length || 0,
                },

                field: {
                    width: ge.gameField?.width || 1920,
                    height: ge.gameField?.height || 1080,
                },

                // Wave sub-state
                waveState: {
                    subWave: ge.currentSubWave,
                    totalSubWaves: ge.totalSubWaves,
                    waveTimer: ge.waveTimer,
                },
            };
        });

        return state;
    }

    /**
     * Read state and compute delta events from previous read.
     * @returns {{ state: object, events: Array }}
     */
    async readWithEvents() {
        const state = await this.read();
        if (!state) return { state: null, events: [] };

        // Initialize kill buffer on first read (once per session)
        if (!this._killBufferInitialized) {
            await this.page.evaluate(() => { window._qaBotKillBuffer = []; });
            this._killBufferInitialized = true;
        }

        const events = [];
        const prev = this._prev;

        if (prev) {
            // Wave changes
            if (state.wave !== prev.wave && state.wave > prev.wave) {
                events.push({ type: 'wave_start', wave: state.wave });
            }

            // Game state changes
            if (state.gameState !== prev.gameState) {
                events.push({ type: 'state_change', from: prev.gameState, to: state.gameState });

                if (state.gameState === 'SHOP') {
                    events.push({ type: 'shop_open', wave: state.wave });
                }
                if (prev.gameState === 'SHOP' && state.gameState !== 'SHOP') {
                    events.push({ type: 'shop_close', wave: state.wave });
                }
                if (state.gameState === 'GAME_OVER') {
                    events.push({ type: 'game_over', wave: state.wave });
                }
            }

            // Health changes
            if (state.player && prev.player) {
                const healthDelta = state.player.health - prev.player.health;
                if (healthDelta < 0) {
                    events.push({ type: 'damage_taken', amount: -healthDelta, healthAfter: state.player.health });
                }
                if (state.player.health <= 0 && prev.player.health > 0) {
                    events.push({ type: 'death', wave: state.wave });
                }

                // Level up
                if (state.player.level > prev.player.level) {
                    events.push({ type: 'level_up', level: state.player.level });
                }

                // Money changes
                const moneyDelta = state.money - prev.money;
                if (moneyDelta > 0) {
                    events.push({ type: 'money_earned', amount: moneyDelta });
                }
                if (moneyDelta < 0) {
                    events.push({ type: 'money_spent', amount: -moneyDelta });
                }

                // SP changes
                const spDelta = state.player.skillPoints - prev.player.skillPoints;
                if (spDelta > 0) {
                    events.push({ type: 'sp_earned', amount: spDelta });
                }
            }
        }

        // Enemy kills — drain authoritative kill buffer from game engine.
        // This replaces the old delta-based inference which missed kills during
        // state transitions (PLAYING → WAVE_TRANSITION) and pool cleanup.
        const kills = await this.page.evaluate(() => {
            const buf = window._qaBotKillBuffer;
            if (!buf || buf.length === 0) return [];
            const result = buf.splice(0);
            return result;
        });
        for (const kill of kills) {
            events.push({ type: 'enemy_killed', enemyType: kill.type });
        }

        this._prev = state;
        return { state, events };
    }

    /**
     * Reset delta tracking (e.g., on new game).
     */
    reset() {
        this._prev = null;
    }
}
