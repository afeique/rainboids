/**
 * AI QA Bot — Invariant Checker
 *
 * Continuously validates game state invariants during play.
 * Reports violations as bugs with severity and reproduction context.
 */

export class InvariantChecker {
    constructor(logger) {
        this.logger = logger;
        this._seenBugs = new Set(); // Deduplicate by bug ID
        this._checkCount = 0;
        // Reset stateful invariants for fresh session
        for (const inv of INVARIANTS) {
            if (inv._maxWave !== undefined) inv._maxWave = 0;
            // _canShootFalseSince removed — checker now uses lastShotTime comparison
        }
    }

    /**
     * Run all invariant checks against current state.
     * @param {object} state - Game state snapshot from StateReader
     * @returns {Array} List of violations found
     */
    check(state) {
        if (!state) return [];
        this._checkCount++;
        const violations = [];

        // Run each checker, collect violations
        for (const checker of INVARIANTS) {
            try {
                const result = checker.check(state);
                if (result) {
                    const bugId = `${checker.id}:${typeof result.key === 'string' ? result.key : ''}`;
                    if (!this._seenBugs.has(bugId)) {
                        this._seenBugs.add(bugId);
                        const bug = {
                            id: bugId,
                            title: result.title || checker.title,
                            category: checker.category,
                            severity: checker.severity,
                            details: result.details || '',
                            state: result.stateSnapshot || null,
                            wave: state.wave,
                            gameState: state.gameState,
                        };
                        violations.push(bug);
                        this.logger.logBug(bug);
                    }
                }
            } catch (e) {
                // Checker itself failed — log but don't crash
                violations.push({
                    id: `checker_error:${checker.id}`,
                    title: `Invariant checker "${checker.id}" threw: ${e.message}`,
                    category: 'internal',
                    severity: 'low',
                    details: e.stack,
                });
            }
        }

        return violations;
    }

    /** Total number of checks performed */
    get totalChecks() { return this._checkCount; }

    /** Total unique bugs found */
    get uniqueBugsFound() { return this._seenBugs.size; }
}

// ── Invariant Definitions ────────────────────────────────────────

const INVARIANTS = [
    {
        id: 'health_bounds',
        title: 'Player health out of bounds',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            const p = state.player;
            if (!p) return null;
            if (p.health < 0) {
                return { title: 'Player health is negative', details: `health=${p.health}`, key: 'negative' };
            }
            // effectiveMaxHealth includes HEALTH_BOOST stacks (+25 each)
            // so compare against that, not raw maxHealth
            const healthBoostStacks = p.powerups?.HEALTH_BOOST?.stacks || 0;
            const effectiveMax = p.maxHealth + healthBoostStacks * 25;
            if (p.health > effectiveMax * 1.1) { // 10% tolerance for rounding
                return {
                    title: 'Player health exceeds effective maxHealth',
                    details: `health=${p.health}, effectiveMax=${effectiveMax} (base=${p.maxHealth}, HEALTH_BOOST×${healthBoostStacks})`,
                    key: 'over_max',
                };
            }
            return null;
        },
    },

    {
        id: 'valid_game_state',
        title: 'Invalid game state',
        category: 'state_invariant',
        severity: 'critical',
        check(state) {
            const valid = ['PLAYING', 'PAUSED', 'GAME_OVER', 'WAVE_TRANSITION', 'SHOP', 'TITLE_SCREEN', 'ORIENTATION_LOCK'];
            if (!valid.includes(state.gameState)) {
                return { details: `state="${state.gameState}"`, key: state.gameState };
            }
            return null;
        },
    },

    {
        id: 'money_non_negative',
        title: 'Money is negative',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            if (state.money < 0) {
                return { details: `money=${state.money}`, key: 'negative' };
            }
            return null;
        },
    },

    {
        id: 'lives_non_negative',
        title: 'Lives is negative',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            if (state.lives < 0) {
                return { details: `lives=${state.lives}`, key: 'negative' };
            }
            return null;
        },
    },

    {
        id: 'wave_monotonic',
        title: 'Wave number decreased',
        category: 'state_invariant',
        severity: 'high',
        _maxWave: 0,
        check(state) {
            if (state.wave > this._maxWave) {
                this._maxWave = state.wave;
            } else if (state.wave < this._maxWave && state.gameState !== 'TITLE_SCREEN') {
                return {
                    details: `wave=${state.wave}, previously saw wave=${this._maxWave}`,
                    key: `${state.wave}`,
                };
            }
            return null;
        },
    },

    {
        id: 'player_position_bounds',
        title: 'Player outside game field',
        category: 'physics_anomaly',
        severity: 'medium',
        check(state) {
            const p = state.player;
            if (!p) return null;
            const margin = 50; // tolerance
            const f = state.field;
            if (p.x < -margin || p.x > f.width + margin ||
                p.y < -margin || p.y > f.height + margin) {
                return {
                    details: `position=(${p.x.toFixed(1)}, ${p.y.toFixed(1)}), field=${f.width}x${f.height}`,
                    key: 'oob',
                };
            }
            return null;
        },
    },

    {
        id: 'nan_player_position',
        title: 'Player position is NaN',
        category: 'state_invariant',
        severity: 'critical',
        check(state) {
            const p = state.player;
            if (!p) return null;
            if (!isFinite(p.x) || !isFinite(p.y)) {
                return { details: `x=${p.x}, y=${p.y}`, key: 'nan' };
            }
            return null;
        },
    },

    {
        id: 'nan_entity_positions',
        title: 'Entity has NaN position',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            for (const enemy of state.entities.enemies) {
                if (!isFinite(enemy.x) || !isFinite(enemy.y)) {
                    return { details: `enemy type=${enemy.type} pos=(${enemy.x}, ${enemy.y})`, key: `enemy_${enemy.type}` };
                }
            }
            for (const ast of state.entities.asteroids) {
                if (!isFinite(ast.x) || !isFinite(ast.y)) {
                    return { details: `asteroid pos=(${ast.x}, ${ast.y})`, key: 'asteroid' };
                }
            }
            return null;
        },
    },

    {
        id: 'enemy_health_positive',
        title: 'Active enemy has non-positive health',
        category: 'state_invariant',
        severity: 'medium',
        check(state) {
            for (const enemy of state.entities.enemies) {
                if (enemy.health <= 0) {
                    return {
                        details: `enemy type=${enemy.type} health=${enemy.health}`,
                        key: `${enemy.type}_dead`,
                    };
                }
            }
            return null;
        },
    },

    {
        id: 'pool_size_bounds',
        title: 'Entity pool exceeds expected maximum',
        category: 'performance',
        severity: 'medium',
        check(state) {
            const ent = state.entities;
            if (ent.enemies.length > 50) {
                return { details: `enemies=${ent.enemies.length}`, key: 'enemies' };
            }
            if (ent.asteroids.length > 30) {
                return { details: `asteroids=${ent.asteroids.length}`, key: 'asteroids' };
            }
            if (ent.enemyBullets.length > 200) {
                return { details: `enemyBullets=${ent.enemyBullets.length}`, key: 'bullets' };
            }
            if (ent.playerBulletCount > 500) {
                return { details: `playerBullets=${ent.playerBulletCount}`, key: 'player_bullets' };
            }
            return null;
        },
    },

    {
        id: 'sp_non_negative',
        title: 'Skill points are negative',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            if (state.player && state.player.skillPoints < 0) {
                return { details: `skillPoints=${state.player.skillPoints}`, key: 'negative' };
            }
            return null;
        },
    },

    {
        id: 'auto_fire_active',
        title: 'Auto-fire stopped working',
        category: 'state_invariant',
        severity: 'high',
        check(state) {
            const p = state.player;
            if (!p) return null;

            // Only check during active gameplay states
            const activeStates = ['PLAYING', 'WAVE_TRANSITION'];
            if (!activeStates.includes(state.gameState)) {
                this._canShootFalseSince = 0;
                return null;
            }

            // Check for chargePaused during gameplay — should never happen
            if (p.chargePaused && (state.gameState === 'PLAYING' || state.gameState === 'WAVE_TRANSITION')) {
                return {
                    title: 'Charge is paused during active gameplay',
                    details: `chargePaused=true, gameState=${state.gameState}, chargeLevel=${p.chargeLevel}`,
                    key: 'charge_paused',
                };
            }

            // Track if primary weapon hasn't fired for too long using lastShotTime.
            // NOTE: We compare lastShotTime (a Date.now() value from the browser)
            // against the current timestamp. canShoot is only true for 1/24 ticks
            // at 60Hz, making it unreliable for 10Hz polling — use lastShotTime instead.
            if (state.gameState === 'PLAYING' && p.lastShotTime > 0) {
                const timeSinceLastShot = state.timestamp - p.lastShotTime;
                if (timeSinceLastShot > 5000) {
                    return {
                        title: 'Primary weapon has not fired for over 5 seconds',
                        details: `No shot for ${(timeSinceLastShot / 1000).toFixed(1)}s, lastShotTime=${p.lastShotTime}, now=${state.timestamp}, activePrimary=${p.activePrimary}`,
                        key: 'no_fire',
                        stateSnapshot: {
                            canShoot: p.canShoot,
                            lastShotTime: p.lastShotTime,
                            chargeLevel: p.chargeLevel,
                            chargePaused: p.chargePaused,
                            isCharging: p.isCharging,
                            activePrimary: p.activePrimary,
                            activePower: p.activePower,
                        },
                    };
                }
            }

            return null;
        },
    },
];
