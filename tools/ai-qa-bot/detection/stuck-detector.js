/**
 * AI QA Bot — Stuck Detector
 *
 * Detects situations where the game is stuck or not progressing.
 */

export class StuckDetector {
    constructor(logger, config = {}) {
        this.logger = logger;
        this.stuckThresholdMs = config.stuckThresholdMs || 30_000;

        this._lastWaveChange = Date.now();
        this._lastPositionChange = Date.now();
        this._lastWave = 0;
        this._lastEntityCount = 0;
        this._lastPlayerPos = null;
        this._reported = new Set();
    }

    /**
     * Check for stuck conditions.
     * @param {object} state - Game state snapshot
     * @returns {Array} List of stuck conditions detected
     */
    check(state) {
        if (!state || state.gameState !== 'PLAYING') {
            // Reset timers when not playing
            this._lastWaveChange = Date.now();
            this._lastPositionChange = Date.now();
            return [];
        }

        const now = Date.now();
        const issues = [];

        // Wave progress check
        const totalEntities = state.entities.enemies.length + state.entities.asteroids.length;
        if (state.wave !== this._lastWave) {
            this._lastWave = state.wave;
            this._lastWaveChange = now;
            this._lastEntityCount = totalEntities;
        } else if (totalEntities !== this._lastEntityCount) {
            // Progress is being made (entities dying or spawning)
            this._lastWaveChange = now;
            this._lastEntityCount = totalEntities;
        } else if (now - this._lastWaveChange > this.stuckThresholdMs) {
            const bugId = `stuck_wave:${state.wave}`;
            if (!this._reported.has(bugId)) {
                this._reported.add(bugId);
                const bug = {
                    id: bugId,
                    title: `Wave ${state.wave} stuck for ${((now - this._lastWaveChange) / 1000).toFixed(0)}s — no entity count change`,
                    category: 'stuck_state',
                    severity: 'high',
                    details: `Enemies: ${state.entities.enemies.length}, Asteroids: ${state.entities.asteroids.length}`,
                    wave: state.wave,
                    gameState: state.gameState,
                };
                issues.push(bug);
                this.logger.logBug(bug);
            }
        }

        // Player position check (hasn't moved in 10s during combat)
        if (state.player) {
            const pos = { x: Math.round(state.player.x), y: Math.round(state.player.y) };
            if (this._lastPlayerPos &&
                (Math.abs(pos.x - this._lastPlayerPos.x) > 5 ||
                 Math.abs(pos.y - this._lastPlayerPos.y) > 5)) {
                this._lastPositionChange = now;
            }
            this._lastPlayerPos = pos;

            if (now - this._lastPositionChange > 20_000) {
                const bugId = 'stuck_player_position';
                if (!this._reported.has(bugId)) {
                    this._reported.add(bugId);
                    const bug = {
                        id: bugId,
                        title: 'Player position unchanged for 10+ seconds during gameplay',
                        category: 'stuck_state',
                        severity: 'medium',
                        details: `Position: (${pos.x}, ${pos.y})`,
                        wave: state.wave,
                        gameState: state.gameState,
                    };
                    issues.push(bug);
                    this.logger.logBug(bug);
                }
            }
        }

        // No enemies and wave not ending
        if (state.entities.enemies.length === 0 &&
            state.entities.asteroids.length === 0 &&
            now - this._lastWaveChange > 15_000) {
            const bugId = `empty_wave:${state.wave}`;
            if (!this._reported.has(bugId)) {
                this._reported.add(bugId);
                const bug = {
                    id: bugId,
                    title: `Wave ${state.wave}: no enemies/asteroids but wave not ending`,
                    category: 'stuck_state',
                    severity: 'high',
                    details: 'All enemies cleared but wave transition not triggered',
                    wave: state.wave,
                    gameState: state.gameState,
                };
                issues.push(bug);
                this.logger.logBug(bug);
            }
        }

        return issues;
    }
}
