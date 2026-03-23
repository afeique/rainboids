/**
 * AI QA Bot — Combat AI
 *
 * Enhanced tactical AI with:
 *   1. Context steering (interest/danger maps) for movement
 *   2. Predictive (lead) aiming via quadratic intercept
 *   3. Weighted target prioritization
 *   4. Weapon-specific engagement ranges
 *   5. Bullet dodging via velocity obstacle projection
 *
 * All parameters are skill-level tunable via SKILL_PRESETS.combat.
 */

import { SKILL_PRESETS } from '../core/config.js';

// Number of directions in the context steering map
const STEERING_DIRS = 16;
const TWO_PI = Math.PI * 2;
const DIR_STEP = TWO_PI / STEERING_DIRS;

// Pre-compute direction unit vectors
const DIR_VECTORS = [];
for (let i = 0; i < STEERING_DIRS; i++) {
    const angle = i * DIR_STEP;
    DIR_VECTORS.push({ x: Math.cos(angle), y: Math.sin(angle) });
}

const WALL_MARGIN = 100;
const SKILL_HEALTH_THRESHOLD = 0.5;

// Weapon engagement profiles
const WEAPON_ENGAGEMENT = {
    PULSE_CANNON:   { min: 250, max: 420, style: 'tracking' },
    STORM_NEEDLES:  { min: 180, max: 350, style: 'tracking' },
    SCATTER_GUN:    { min: 80,  max: 220, style: 'snapshot' },
    RAIL_DRIVER:    { min: 400, max: 700, style: 'snapshot' },
    LANCE_BEAM:     { min: 200, max: 380, style: 'tracking' },
};

// Default engagement range when weapon is unknown or adaptation is off
const DEFAULT_ENGAGEMENT = { min: 150, max: 400, style: 'tracking' };

// Enemy threat rankings (higher = more dangerous)
const ENEMY_THREAT = {
    WASP: 1.0, STALKER: 0.9, HUNTER: 0.8, WEAVER: 0.7,
    TANGERINE: 0.6, GUARDIAN: 0.5, PROWLER: 0.5, DRIFTER: 0.3,
    SENTINEL: 0.4, TITAN: 0.7,
};

export class CombatAI {
    constructor(driver, config = {}) {
        this.driver = driver;
        this.skillLevel = config.skillLevel || 'advanced';
        this.preset = SKILL_PRESETS[this.skillLevel] || SKILL_PRESETS.advanced;
        this.combat = this.preset.combat || SKILL_PRESETS.advanced.combat;

        // Reaction delay state
        this._lastReaction = 0;
        this._pendingInputs = null;

        // Target tracking
        this._currentTarget = null;
        this._targetSwitchTime = 0;

        // Bullet dodge timing
        this._lastDodgeReaction = 0;

        // Skill degradation state
        this._driftAngle = Math.random() * TWO_PI;
        this._driftChangeTime = 0;
        this._panicMode = false;
        this._aimWanderAngle = 0;

        // Threat blindness — enemies the AI ignores entirely
        this._blindToEntities = new Set(); // Set of "type:x:y" keys
        this._lastBlindUpdate = 0;

        // Respawn protection state
        this._respawnTime = 0;
        this._prevHealth = null;

        // Interest/danger maps (reused each tick to avoid allocation)
        this._interest = new Float32Array(STEERING_DIRS);
        this._danger = new Float32Array(STEERING_DIRS);
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

        // Detect respawn: health jumped up from 0 or near-0
        if (this._prevHealth !== null && this._prevHealth <= 0 && player.health > 0) {
            this._respawnTime = now;
        }
        this._prevHealth = player.health;

        // Respawn protection: flee toward center for 2.5 seconds after respawn
        const respawnGracePeriod = 2500;
        if (now - this._respawnTime < respawnGracePeriod && this._respawnTime > 0) {
            const cx = field.width / 2;
            const cy = field.height / 2;
            const fleeAngle = Math.atan2(cy - player.y, cx - player.x);
            const inputs = {
                up: Math.sin(fleeAngle) < -0.3,
                down: Math.sin(fleeAngle) > 0.3,
                left: Math.cos(fleeAngle) < -0.3,
                right: Math.cos(fleeAngle) > 0.3,
                fire: true,
                fireSecondary: false,
                skill1: false, skill2: false, skill3: false, skill4: false,
                aimX: player.x + Math.cos(player.angle || 0) * 200,
                aimY: player.y + Math.sin(player.angle || 0) * 200,
            };
            this._pendingInputs = inputs;
            return inputs;
        }

        // Reaction delay simulation with jitter
        const jitter = this.combat.reactionJitter || 0;
        const effectiveReaction = this.preset.reactionMs * (1 + (Math.random() - 0.5) * jitter);
        if (now - this._lastReaction < effectiveReaction) {
            return this._pendingInputs;
        }
        this._lastReaction = now;

        // Update threat blindness (re-evaluate every 2s)
        this._updateBlindness(entities.enemies, now);

        // Select target using weighted scoring
        const target = this._selectTarget(player, entities, now);

        // Get weapon engagement profile
        const engagement = this.combat.weaponAdaptation
            ? (WEAPON_ENGAGEMENT[player.activePrimary] || DEFAULT_ENGAGEMENT)
            : DEFAULT_ENGAGEMENT;

        // Build context steering maps
        this._buildSteeringMaps(player, entities, field, target, engagement);

        // Resolve movement from steering maps
        let move = this._resolveMovement();

        // Apply skill-level degradation to movement
        move = this._degradeMovement(move, player, now);

        // Map movement to WASD inputs
        const inputs = {
            up: move.y < -0.15,
            down: move.y > 0.15,
            left: move.x < -0.15,
            right: move.x > 0.15,
            fire: true,
            fireSecondary: false,
            skill1: false, skill2: false, skill3: false, skill4: false,
        };

        // Compute aim with lead prediction
        if (target) {
            const aim = this._computeAim(player, target);
            inputs.aimX = aim.x;
            inputs.aimY = aim.y;
        } else {
            const angle = player.angle || 0;
            inputs.aimX = player.x + Math.cos(angle) * 200;
            inputs.aimY = player.y + Math.sin(angle) * 200;
        }

        // Skill usage
        if (this.preset.useSkills) {
            this._computeSkillInputs(inputs, state, entities);
        }

        // Charge shot — fire when minimum charge reached
        if (player.chargeLevel >= 0.6 || player.isFullyCharged) {
            inputs.fireSecondary = true;
        }

        this._pendingInputs = inputs;
        return inputs;
    }

    // ── Target Selection ──────────────────────────────────────────

    _selectTarget(player, entities, now) {
        const allTargets = [];

        // Score enemies (skip blind enemies)
        for (const e of entities.enemies) {
            if (this._isBlind(e)) continue;
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            const threat = ENEMY_THREAT[e.type] || 0.5;
            const healthRatio = e.health / Math.max(1, e.maxHealth);

            // Weighted composite score (higher = better target)
            const distScore = 1 / (1 + dist / 500); // closer = higher
            const threatScore = threat * this.combat.threatAwareness;
            const healthScore = (1 - healthRatio) * this.combat.opportunism; // low health = high score
            const angleScore = this._angleProximity(player, e) * 0.3;

            const score = distScore + threatScore + healthScore + angleScore;
            allTargets.push({ x: e.x, y: e.y, vx: e.vx || 0, vy: e.vy || 0, dist, score, type: e.type, isEnemy: true, radius: e.radius || 15 });
        }

        // Score asteroids (lower priority than enemies)
        for (const a of entities.asteroids) {
            const dist = Math.hypot(a.x - player.x, a.y - player.y);
            const distScore = 1 / (1 + dist / 500);
            // Only target asteroids if close or no enemies
            const score = distScore * (entities.enemies.length === 0 ? 1.0 : 0.3);
            allTargets.push({ x: a.x, y: a.y, vx: 0, vy: 0, dist, score, type: 'asteroid', isEnemy: false, radius: a.radius || 20 });
        }

        if (allTargets.length === 0) {
            this._currentTarget = null;
            return null;
        }

        // Sort by score descending
        allTargets.sort((a, b) => b.score - a.score);
        const best = allTargets[0];

        // Target switching with cooldown and hysteresis
        if (this._currentTarget && now - this._targetSwitchTime < this.combat.targetSwitchCooldown) {
            // Stay on current target if still alive
            const still = allTargets.find(t =>
                Math.hypot(t.x - this._currentTarget.x, t.y - this._currentTarget.y) < 50 &&
                t.type === this._currentTarget.type
            );
            if (still) return still;
        }

        // Switch target
        this._currentTarget = best;
        this._targetSwitchTime = now;
        return best;
    }

    _angleProximity(player, entity) {
        const angle = player.angle || 0;
        const toEntity = Math.atan2(entity.y - player.y, entity.x - player.x);
        let diff = Math.abs(angle - toEntity);
        if (diff > Math.PI) diff = TWO_PI - diff;
        return 1 - diff / Math.PI; // 1 = directly ahead, 0 = behind
    }

    // ── Context Steering ──────────────────────────────────────────

    _buildSteeringMaps(player, entities, field, target, engagement) {
        const interest = this._interest;
        const danger = this._danger;
        interest.fill(0);
        danger.fill(0);

        // Health-aware retreat: when hurt, increase desire to keep distance
        const healthPct = player.health / Math.max(1, player.maxHealth);
        const retreatUrgency = healthPct < 0.4 ? (0.4 - healthPct) * 2.0 : 0; // 0-0.8 urgency

        // Threat count modifier: more enemies = more cautious approach
        const visibleEnemies = entities.enemies.filter(e => !this._isBlind(e)).length;
        const crowdCaution = Math.min(0.4, visibleEnemies * 0.1); // 0.1 per enemy, max 0.4

        // Interest: move toward target at weapon-ideal range
        if (target) {
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const dist = target.dist;
            const idealCenter = (engagement.min + engagement.max) / 2;

            // Effective pursuit reduced by health pressure and crowd
            const effectivePursuit = Math.max(0.1, this.combat.pursuitAggression - retreatUrgency - crowdCaution);

            if (dist > engagement.max) {
                // Too far — pursue (but cautiously when hurt or surrounded)
                const toTargetAngle = Math.atan2(dy, dx);
                this._addInterest(interest, toTargetAngle, effectivePursuit);
            } else if (dist < engagement.min || retreatUrgency > 0.3) {
                // Too close OR health-critical — retreat
                const awayAngle = Math.atan2(-dy, -dx);
                this._addInterest(interest, awayAngle, 0.6 + retreatUrgency);
            } else {
                // In sweet spot — circle strafe
                if (this.combat.circleStrafePreference > 0) {
                    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
                    this._addInterest(interest, perpAngle, this.combat.circleStrafePreference);
                }
                // Slight interest toward ideal center (reduced when hurt)
                if (dist > idealCenter && retreatUrgency < 0.1) {
                    const toAngle = Math.atan2(dy, dx);
                    this._addInterest(interest, toAngle, 0.15);
                }
            }
        } else {
            // No target — drift toward center
            const cx = field.width / 2;
            const cy = field.height / 2;
            const toCenterDist = Math.hypot(cx - player.x, cy - player.y);
            if (toCenterDist > 80) {
                const toCenter = Math.atan2(cy - player.y, cx - player.x);
                this._addInterest(interest, toCenter, 0.3);
            }
        }

        // Danger: enemies within close range (skip blind enemies)
        for (const e of entities.enemies) {
            if (this._isBlind(e)) continue;
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            const threatLevel = ENEMY_THREAT[e.type] || 0.5;
            const dangerRadius = 200 * threatLevel;
            if (dist < dangerRadius) {
                const angle = Math.atan2(e.y - player.y, e.x - player.x);
                const intensity = (1 - dist / dangerRadius) * this.combat.dangerSensitivity * threatLevel;
                this._addDanger(danger, angle, intensity);
            }
        }

        // Danger: enemy bullets (velocity obstacle)
        if (this.combat.bulletAwareness > 0) {
            const reactionS = (this.preset.reactionMs || 200) / 1000;

            for (const b of entities.enemyBullets) {
                // Skip bullets based on awareness (random cull)
                if (Math.random() > this.combat.bulletAwareness) continue;

                const dx = b.x - player.x;
                const dy = b.y - player.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 400) continue; // Too far to care

                // Check if bullet is approaching
                const dot = dx * b.vx + dy * b.vy;
                if (dot > 0) continue; // Moving away

                // Time to closest approach
                const bSpeed2 = b.vx * b.vx + b.vy * b.vy;
                if (bSpeed2 < 0.01) continue;
                const bSpeed = Math.sqrt(bSpeed2);
                const t = -dot / bSpeed2;
                const closestX = dx + b.vx * t;
                const closestY = dy + b.vy * t;
                const closestDist = Math.hypot(closestX, closestY);

                // Dynamic threshold: bullet speed * reaction time, clamped 60-150px
                const dodgeThreshold = Math.min(150, Math.max(60, bSpeed * reactionS * 1.5));

                if (closestDist < dodgeThreshold) {
                    const bulletAngle = Math.atan2(dy, dx);
                    const intensity = (1 - closestDist / dodgeThreshold) * this.combat.dangerSensitivity;
                    this._addDanger(danger, bulletAngle, intensity * 0.8);
                }
            }
        }

        // Danger: arena boundaries (scales with proximity — closer = more danger)
        const wallProximity = (margin, pos) => Math.max(0, 1 - pos / margin);
        if (player.x < WALL_MARGIN) {
            this._addDanger(danger, Math.PI, 0.5 * wallProximity(WALL_MARGIN, player.x));
        }
        if (player.x > field.width - WALL_MARGIN) {
            this._addDanger(danger, 0, 0.5 * wallProximity(WALL_MARGIN, field.width - player.x));
        }
        if (player.y < WALL_MARGIN) {
            this._addDanger(danger, -Math.PI / 2, 0.5 * wallProximity(WALL_MARGIN, player.y));
        }
        if (player.y > field.height - WALL_MARGIN) {
            this._addDanger(danger, Math.PI / 2, 0.5 * wallProximity(WALL_MARGIN, field.height - player.y));
        }

        // Danger: asteroids nearby (scale danger radius with asteroid size)
        for (const a of entities.asteroids) {
            const dist = Math.hypot(a.x - player.x, a.y - player.y);
            const asteroidRadius = a.radius || 20;
            const dangerDist = 120 + asteroidRadius * 2; // Bigger asteroids need more clearance
            if (dist < dangerDist) {
                const angle = Math.atan2(a.y - player.y, a.x - player.x);
                const intensity = (1 - dist / dangerDist) * 0.7 * this.combat.dangerSensitivity;
                this._addDanger(danger, angle, intensity);
            }
        }

        // Cap danger so flee fallback has meaningful differentiation
        // and interest can compete with multiple simultaneous threats
        const maxDanger = Math.max(...danger);
        if (maxDanger > 1.5) {
            const scale = 1.5 / maxDanger;
            for (let i = 0; i < STEERING_DIRS; i++) danger[i] *= scale;
        }
    }

    _addInterest(map, angle, intensity) {
        for (let i = 0; i < STEERING_DIRS; i++) {
            const dirAngle = i * DIR_STEP;
            let diff = Math.abs(angle - dirAngle);
            if (diff > Math.PI) diff = TWO_PI - diff;
            const weight = Math.max(0, 1 - diff / (Math.PI * 0.6));
            map[i] += weight * intensity;
        }
    }

    _addDanger(map, angle, intensity) {
        for (let i = 0; i < STEERING_DIRS; i++) {
            const dirAngle = i * DIR_STEP;
            let diff = Math.abs(angle - dirAngle);
            if (diff > Math.PI) diff = TWO_PI - diff;
            const weight = Math.max(0, 1 - diff / (Math.PI * 0.5));
            map[i] += weight * intensity;
        }
    }

    _resolveMovement() {
        const interest = this._interest;
        const danger = this._danger;

        let bestDir = -1;
        let bestScore = -Infinity;

        for (let i = 0; i < STEERING_DIRS; i++) {
            const score = interest[i] * Math.max(0, 1 - danger[i]);
            if (score > bestScore) {
                bestScore = score;
                bestDir = i;
            }
        }

        if (bestDir < 0 || bestScore < 0.01) {
            // All directions blocked — flee the LEAST dangerous direction
            let minDanger = Infinity;
            let fleeDir = 0;
            for (let i = 0; i < STEERING_DIRS; i++) {
                if (danger[i] < minDanger) {
                    minDanger = danger[i];
                    fleeDir = i;
                }
            }
            // Only freeze if there's truly no danger at all (no enemies)
            if (minDanger <= 0) return { x: 0, y: 0 };
            return { x: DIR_VECTORS[fleeDir].x * 0.5, y: DIR_VECTORS[fleeDir].y * 0.5 };
        }

        // Blend the best direction with its neighbors for smooth steering
        const prev = (bestDir - 1 + STEERING_DIRS) % STEERING_DIRS;
        const next = (bestDir + 1) % STEERING_DIRS;
        const prevScore = interest[prev] * Math.max(0, 1 - danger[prev]);
        const nextScore = interest[next] * Math.max(0, 1 - danger[next]);
        const totalWeight = bestScore + prevScore + nextScore;

        if (totalWeight < 0.001) return { x: 0, y: 0 };

        const x = (DIR_VECTORS[bestDir].x * bestScore +
                   DIR_VECTORS[prev].x * prevScore +
                   DIR_VECTORS[next].x * nextScore) / totalWeight;
        const y = (DIR_VECTORS[bestDir].y * bestScore +
                   DIR_VECTORS[prev].y * prevScore +
                   DIR_VECTORS[next].y * nextScore) / totalWeight;

        // Normalize to magnitude ~0.5 for reasonable movement
        const mag = Math.hypot(x, y);
        if (mag < 0.01) return { x: 0, y: 0 };
        return { x: x / mag * 0.5, y: y / mag * 0.5 };
    }

    // ── Threat Blindness ──────────────────────────────────────────

    /**
     * Update which enemies the AI is blind to.
     * Re-evaluated every 2 seconds. Each enemy has a chance
     * of being ignored based on threatBlindness.
     */
    _updateBlindness(enemies, now) {
        const blindness = this.combat.threatBlindness || 0;
        if (blindness <= 0) {
            this._blindToEntities.clear();
            return;
        }
        // Re-evaluate every 2 seconds
        if (now - this._lastBlindUpdate < 2000) return;
        this._lastBlindUpdate = now;

        this._blindToEntities.clear();
        for (const e of enemies) {
            if (Math.random() < blindness) {
                this._blindToEntities.add(`${e.type}:${Math.round(e.x)}:${Math.round(e.y)}`);
            }
        }
    }

    _isBlind(enemy) {
        if (this._blindToEntities.size === 0) return false;
        return this._blindToEntities.has(`${enemy.type}:${Math.round(enemy.x)}:${Math.round(enemy.y)}`);
    }

    // ── Skill Degradation ──────────────────────────────────────────

    /**
     * Degrade movement quality based on skill level.
     * Novice: random drift, hesitation, panic under pressure.
     * Advanced: clean, optimal movement (passes through unchanged).
     */
    _degradeMovement(move, player, now) {
        const skillFactor = this.preset.movementSkill || this.preset.aimAccuracy; // 0.1 (novice) to 0.97 (expert)
        const commitMs = this.combat.movementCommitment || (500 + (1 - skillFactor) * 1500);
        // Quadratic curve: high-skill players get much less degradation
        // novice(0.08): 51%/30%, beginner(0.25): 34%/20%, intermediate(0.55): 12%/7%, advanced(0.88): 0.9%/0.5%, expert(0.97): 0.05%/0.03%
        const driftChance = Math.max(0, 0.6 * (1 - skillFactor) ** 2);
        const hesitationChance = Math.max(0, 0.35 * (1 - skillFactor) ** 2);

        // Panic mode — when health is low, low-skill players move erratically
        const healthPct = player.health / Math.max(1, player.maxHealth);
        if (healthPct < 0.4 && skillFactor < 0.5) {
            this._panicMode = true;
        } else if (healthPct > 0.6 || skillFactor >= 0.5) {
            this._panicMode = false;
        }

        if (this._panicMode) {
            // Panic: rapid random direction changes
            if (now - this._driftChangeTime > 200) {
                this._driftAngle = Math.random() * TWO_PI;
                this._driftChangeTime = now;
            }
            return {
                x: Math.cos(this._driftAngle) * 0.5,
                y: Math.sin(this._driftAngle) * 0.5,
            };
        }

        // Random drift — novice wanders off course, committed for movementCommitment ms
        if (Math.random() < driftChance) {
            if (now - this._driftChangeTime > commitMs) {
                this._driftAngle = Math.random() * TWO_PI;
                this._driftChangeTime = now;
            }
            // Blend steering with random drift (novice: mostly drift, advanced: mostly steering)
            const driftWeight = 1 - skillFactor; // novice: 0.7, advanced: 0.05
            return {
                x: move.x * (1 - driftWeight) + Math.cos(this._driftAngle) * 0.5 * driftWeight,
                y: move.y * (1 - driftWeight) + Math.sin(this._driftAngle) * 0.5 * driftWeight,
            };
        }

        // Movement hesitation — novice sometimes freezes
        if (Math.random() < hesitationChance) {
            return { x: 0, y: 0 };
        }

        return move;
    }

    // ── Predictive Aiming ──────────────────────────────────────────

    _computeAim(player, target) {
        const leadFactor = this.combat.leadFactor;

        // Base aim at current position
        let aimX = target.x;
        let aimY = target.y;

        // Apply lead prediction if target has velocity and leadFactor > 0
        if (leadFactor > 0 && (target.vx !== 0 || target.vy !== 0)) {
            const bulletSpeed = 8; // BULLET_SPEED px/frame (from player/bullet.js)
            const intercept = this._computeIntercept(player, target, bulletSpeed);

            if (intercept) {
                // Blend between current position and predicted intercept
                aimX = target.x + (intercept.x - target.x) * leadFactor;
                aimY = target.y + (intercept.y - target.y) * leadFactor;
            }
        }

        // Add prediction noise
        if (this.combat.predictionNoise > 0 && target.dist > 50) {
            const noise = this.combat.predictionNoise * target.dist * 0.1;
            aimX += (Math.random() - 0.5) * 2 * noise;
            aimY += (Math.random() - 0.5) * 2 * noise;
        }

        // Add aim accuracy error (base skill)
        const aimError = (1 - this.preset.aimAccuracy) * target.dist * 0.5;
        aimX += (Math.random() - 0.5) * 2 * aimError;
        aimY += (Math.random() - 0.5) * 2 * aimError;

        // Aim wander — low-skill players have a slow drifting bias
        // This creates consistent "missing to one side" instead of random scatter
        if (this.preset.aimAccuracy < 0.8) {
            const wanderSpeed = 0.02 + (1 - this.preset.aimAccuracy) * 0.05; // novice: 0.055, advanced: 0.02
            this._aimWanderAngle += (Math.random() - 0.5) * wanderSpeed;
            const wanderMag = (1 - this.preset.aimAccuracy) * target.dist * 0.25;
            aimX += Math.cos(this._aimWanderAngle) * wanderMag;
            aimY += Math.sin(this._aimWanderAngle) * wanderMag;
        }

        return { x: aimX, y: aimY };
    }

    _computeIntercept(player, target, bulletSpeed) {
        // Quadratic intercept: find time t where bullet reaches target's future position
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const tvx = target.vx;
        const tvy = target.vy;

        const a = tvx * tvx + tvy * tvy - bulletSpeed * bulletSpeed;
        const b = 2 * (dx * tvx + dy * tvy);
        const c = dx * dx + dy * dy;

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return null; // No intercept possible

        const sqrtD = Math.sqrt(discriminant);

        let t;
        if (Math.abs(a) < 0.001) {
            // Linear case (bullet speed ≈ target speed)
            t = -c / Math.max(0.001, b);
        } else {
            const t1 = (-b - sqrtD) / (2 * a);
            const t2 = (-b + sqrtD) / (2 * a);
            // Take smallest positive root
            if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
            else if (t1 > 0) t = t1;
            else if (t2 > 0) t = t2;
            else return null;
        }

        // Cap prediction horizon (30 frames max)
        t = Math.min(t, 30);

        return {
            x: target.x + tvx * t,
            y: target.y + tvy * t,
        };
    }

    // ── Skill Usage ──────────────────────────────────────────────

    _computeSkillInputs(inputs, state, entities) {
        const player = state.player;
        const healthPct = player.health / player.maxHealth;
        const slots = player.skillSlots;
        const cooldowns = player.skillCooldowns;

        // Find nearest threat distance for context
        let nearestThreatDist = Infinity;
        for (const e of entities.enemies) {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (dist < nearestThreatDist) nearestThreatDist = dist;
        }

        for (let i = 0; i < 4; i++) {
            if (!slots[i] || cooldowns[i] > 0) continue;

            const skill = slots[i];
            const key = `skill${i + 1}`;

            switch (skill) {
                case 'BULWARK':
                    if (healthPct < SKILL_HEALTH_THRESHOLD && nearestThreatDist < 250) {
                        inputs[key] = true;
                    }
                    break;
                case 'REPAIR_NANITES':
                    if (healthPct < 0.6) inputs[key] = true;
                    break;
                case 'PHASE_DASH':
                    if (healthPct < 0.3 || nearestThreatDist < 80) inputs[key] = true;
                    break;
                case 'DEFLECTOR_ORBS':
                    if (entities.enemyBullets.length > 5) inputs[key] = true;
                    break;
                case 'EMP_PULSE':
                    if (entities.enemies.filter(e =>
                        Math.hypot(e.x - player.x, e.y - player.y) < 300
                    ).length >= 3) {
                        inputs[key] = true;
                    }
                    break;
                case 'TRACTOR_SHIELD':
                    if (entities.enemyBullets.length > 3 && nearestThreatDist < 200) {
                        inputs[key] = true;
                    }
                    break;
            }
        }
    }
}
