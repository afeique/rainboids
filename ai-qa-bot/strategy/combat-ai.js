/**
 * AI QA Bot — Combat AI
 *
 * Enhanced tactical AI that handles movement, aiming, firing, and skill usage.
 * Supports degraded skill levels for learning simulation.
 */

import { SKILL_PRESETS } from '../core/config.js';

const DANGER_RADIUS = 180;
const WALL_MARGIN = 100;
const SKILL_HEALTH_THRESHOLD = 0.5; // Use defensive skills below 50% health

export class CombatAI {
    constructor(driver, config = {}) {
        this.driver = driver;
        this.skillLevel = config.skillLevel || 'advanced';
        this.preset = SKILL_PRESETS[this.skillLevel] || SKILL_PRESETS.advanced;
        this._lastReaction = 0;
        this._pendingInputs = null;
        this._skillCooldownTimers = [0, 0, 0, 0]; // Track our own cooldown awareness
        this._lastChargeShot = 0;
        this._chargeShotInterval = 5000 + Math.random() * 3000; // 5-8 seconds
    }

    /**
     * Compute one tick of combat decisions given current game state.
     * Returns the input object to send to the driver.
     */
    computeInputs(state) {
        if (!state?.player) return null;

        const now = Date.now();
        const player = state.player;
        const field = state.field;
        const entities = state.entities;

        // Reaction delay simulation
        if (now - this._lastReaction < this.preset.reactionMs) {
            return this._pendingInputs; // Repeat last decision during reaction delay
        }
        this._lastReaction = now;

        // Collect threats
        const threats = this._collectThreats(player, entities);
        const nearestThreat = threats[0] || null;
        const nearestEnemy = this._findNearestEnemy(player, entities);

        // Compute movement
        let moveX = 0, moveY = 0;

        // Dodge nearest threat
        if (nearestThreat && nearestThreat.dist < DANGER_RADIUS) {
            // Random chance to actually dodge (skill-based)
            if (Math.random() < this.preset.dodgeProb) {
                const dx = player.x - nearestThreat.x;
                const dy = player.y - nearestThreat.y;
                const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
                // Move perpendicular + away
                moveX = (dx / len) * 0.7 + (-dy / len) * 0.3;
                moveY = (dy / len) * 0.7 + (dx / len) * 0.3;
            }
        } else if (nearestEnemy && nearestEnemy.dist > DANGER_RADIUS) {
            // Approach nearest target when safe (close enough to aim, far enough to dodge)
            const toTargetX = nearestEnemy.x - player.x;
            const toTargetY = nearestEnemy.y - player.y;
            moveX = toTargetX / nearestEnemy.dist * 0.4;
            moveY = toTargetY / nearestEnemy.dist * 0.4;
        } else {
            // Drift toward center when no targets
            const cx = field.width / 2;
            const cy = field.height / 2;
            const toCenterX = cx - player.x;
            const toCenterY = cy - player.y;
            const toCenterDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
            if (toCenterDist > 80) {
                moveX = toCenterX / toCenterDist * 0.3;
                moveY = toCenterY / toCenterDist * 0.3;
            }
        }

        // Wall avoidance
        if (player.x < WALL_MARGIN) moveX += 0.5;
        if (player.x > field.width - WALL_MARGIN) moveX -= 0.5;
        if (player.y < WALL_MARGIN) moveY += 0.5;
        if (player.y > field.height - WALL_MARGIN) moveY -= 0.5;

        // Map world-space movement to WASD keys directly
        // (up = -Y in screen space, right = +X)
        const inputs = {
            up: moveY < -0.15,
            down: moveY > 0.15,
            left: moveX < -0.15,
            right: moveX > 0.15,
            fire: true, // Always fire
            fireSecondary: false,
            skill1: false,
            skill2: false,
            skill3: false,
            skill4: false,
        };

        // Aiming with accuracy simulation
        if (nearestEnemy) {
            let targetX = nearestEnemy.x;
            let targetY = nearestEnemy.y;

            // Add aim error based on skill level
            const aimError = (1 - this.preset.aimAccuracy) * nearestEnemy.dist * 0.5;
            targetX += (Math.random() - 0.5) * 2 * aimError;
            targetY += (Math.random() - 0.5) * 2 * aimError;

            inputs.aimX = targetX;
            inputs.aimY = targetY;
        } else {
            // Aim forward when no enemies (use player's current angle)
            const angle = player.angle || 0;
            inputs.aimX = player.x + Math.cos(angle) * 200;
            inputs.aimY = player.y + Math.sin(angle) * 200;
        }

        // Skill usage
        if (this.preset.useSkills) {
            this._computeSkillInputs(inputs, state, nearestThreat);
        }

        // Charge shot usage — fire ASAP when min charge reached (replicates
        // aggressive player behavior that triggers auto-fire bug).
        // minChargeTime is 3000ms → chargeLevel ~0.6 at default maxChargeTime 5000ms.
        if (player.chargeLevel >= 0.6 || player.isFullyCharged) {
            inputs.fireSecondary = true;
        }

        this._pendingInputs = inputs;
        return inputs;
    }

    _collectThreats(player, entities) {
        const threats = [];

        for (const a of entities.asteroids) {
            const dist = Math.hypot(a.x - player.x, a.y - player.y);
            threats.push({ x: a.x, y: a.y, dist, type: 'asteroid' });
        }

        for (const e of entities.enemies) {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            threats.push({ x: e.x, y: e.y, dist, type: 'enemy', enemyType: e.type });
        }

        for (const b of entities.enemyBullets) {
            const dist = Math.hypot(b.x - player.x, b.y - player.y);
            threats.push({ x: b.x, y: b.y, dist, type: 'bullet' });
        }

        threats.sort((a, b) => a.dist - b.dist);
        return threats;
    }

    _findNearestEnemy(player, entities) {
        let nearest = null;
        let minDist = Infinity;

        // Prioritize enemies over asteroids
        for (const e of entities.enemies) {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            // Priority weighting: TITAN and PROWLER are higher priority
            const priority = (e.type === 'TITAN' || e.type === 'PROWLER') ? 0.7 : 1.0;
            const weightedDist = dist * priority;
            if (weightedDist < minDist) {
                minDist = weightedDist;
                nearest = { x: e.x, y: e.y, dist, type: e.type };
            }
        }

        if (!nearest) {
            for (const a of entities.asteroids) {
                const dist = Math.hypot(a.x - player.x, a.y - player.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { x: a.x, y: a.y, dist, type: 'asteroid' };
                }
            }
        }

        // Also check for closer asteroids even when enemies exist (don't ignore nearby rocks)
        if (nearest && nearest.type !== 'asteroid') {
            for (const a of entities.asteroids) {
                const dist = Math.hypot(a.x - player.x, a.y - player.y);
                if (dist < nearest.dist * 0.5) {
                    nearest = { x: a.x, y: a.y, dist, type: 'asteroid' };
                    break;
                }
            }
        }

        return nearest;
    }

    _computeSkillInputs(inputs, state, nearestThreat) {
        const player = state.player;
        const healthPct = player.health / player.maxHealth;
        const slots = player.skillSlots;
        const cooldowns = player.skillCooldowns;

        for (let i = 0; i < 4; i++) {
            if (!slots[i] || cooldowns[i] > 0) continue;

            const skill = slots[i];
            const key = `skill${i + 1}`;

            switch (skill) {
                case 'BULWARK':
                    // Use when health is low and threats are near
                    if (healthPct < SKILL_HEALTH_THRESHOLD && nearestThreat && nearestThreat.dist < 250) {
                        inputs[key] = true;
                    }
                    break;
                case 'REPAIR_NANITES':
                    // Use when health is below 60%
                    if (healthPct < 0.6) {
                        inputs[key] = true;
                    }
                    break;
                case 'PHASE_DASH':
                    // Use to escape when surrounded or health critical
                    if (healthPct < 0.3 || (nearestThreat && nearestThreat.dist < 80)) {
                        inputs[key] = true;
                    }
                    break;
                case 'DEFLECTOR_ORBS':
                    // Use when lots of enemy bullets nearby
                    if (state.entities.enemyBullets.length > 5) {
                        inputs[key] = true;
                    }
                    break;
                case 'EMP_PULSE':
                    // Use when multiple enemies are close
                    if (state.entities.enemies.filter(e =>
                        Math.hypot(e.x - player.x, e.y - player.y) < 300
                    ).length >= 3) {
                        inputs[key] = true;
                    }
                    break;
                case 'TRACTOR_SHIELD':
                    // Use when enemy bullets are heading our way
                    if (state.entities.enemyBullets.length > 3 && nearestThreat?.type === 'bullet') {
                        inputs[key] = true;
                    }
                    break;
            }
        }
    }
}
