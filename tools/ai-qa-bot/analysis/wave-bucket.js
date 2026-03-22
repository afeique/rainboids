/**
 * AI QA Bot — Wave Bucket
 *
 * Accumulates per-wave statistics for fun metrics analysis.
 * Created when a wave starts, finalized when it ends.
 */

export class WaveBucket {
    constructor(waveNumber, startTime) {
        this.wave = waveNumber;
        this.startTime = startTime;
        this.endTime = null;
        this.durationMs = 0;
        this.durationS = 0;

        // Action events (timestamped for density calculation)
        this.actionEvents = [];  // [{ts, type}]

        // Combat counts
        this.kills = 0;
        this.killTimestamps = [];  // for multi-kill burst detection
        this.damageEventsDealt = 0;
        this.damageEventsTaken = 0;
        this.totalDamageDealt = 0;
        this.totalDamageTaken = 0;
        this.deaths = 0;

        // Excitement signals
        this.nearMisses = 0;
        this.healthCrises = 0;        // frames where health < 25%
        this.clutchKills = 0;         // kills while health < 25%
        this.multiKillBursts = 0;     // 3+ kills in 2s
        this.survivalRecoveries = 0;  // health < 25% → > 60%
        this._inCrisis = false;       // tracking crisis state

        // Entity / threat samples (per tick)
        this.entitySamples = [];  // [{enemies, bullets, asteroids}]

        // Health samples (per tick, 0.0-1.0)
        this.healthSamples = [];
        this.healthFloor = 1.0;

        // Input activity
        this.inputChanges = 0;

        // Movement dynamism
        this.velocitySamples = [];

        // Competence tracking
        this.bulletsFired = 0;
        this.bulletsHit = 0;  // approximated from kill count + damage events

        // Derived (computed on finalize)
        this.actionDensity = 0;
        this.idleRatio = 0;
        this.threatSaturation = 0;
        this.inputRate = 0;
        this.velocityVariance = 0;
        this.damageRatio = 0;
        this.accuracy = 0;
        this.intensityCurve = [];
    }

    /**
     * Record an action event (kill, damage dealt/taken, dodge).
     */
    addActionEvent(type, ts) {
        this.actionEvents.push({ ts, type });
    }

    /**
     * Record a kill event.
     */
    recordKill(ts, healthRatio) {
        this.kills++;
        this.killTimestamps.push(ts);
        this.addActionEvent('kill', ts);

        // Clutch kill detection
        if (healthRatio < 0.25) {
            this.clutchKills++;
        }

        // Multi-kill burst detection: 3+ kills within 2s
        const recent = this.killTimestamps.filter(t => ts - t < 2000);
        if (recent.length >= 3) {
            // Only count each burst once (check if this kill creates a new burst)
            const prevRecent = this.killTimestamps.filter(t => t < ts && ts - t < 2000);
            if (prevRecent.length === 2) {
                this.multiKillBursts++;
            }
        }
    }

    /**
     * Record a damage-taken event.
     */
    recordDamageTaken(amount, ts) {
        this.damageEventsTaken++;
        this.totalDamageTaken += amount;
        this.addActionEvent('damage_taken', ts);
    }

    /**
     * Record a damage-dealt event.
     */
    recordDamageDealt(amount, ts) {
        this.damageEventsDealt++;
        this.totalDamageDealt += amount;
        this.addActionEvent('damage_dealt', ts);
    }

    /**
     * Sample per-tick state data.
     */
    sampleTick(state, inputChanges, nearMisses) {
        const player = state.player;
        if (!player) return;

        const healthRatio = player.health / Math.max(1, player.maxHealth);
        this.healthSamples.push(healthRatio);
        if (healthRatio < this.healthFloor) this.healthFloor = healthRatio;

        // Health crisis tracking
        if (healthRatio < 0.25) {
            this.healthCrises++;
            this._inCrisis = true;
        } else if (this._inCrisis && healthRatio > 0.60) {
            this.survivalRecoveries++;
            this._inCrisis = false;
        } else if (healthRatio >= 0.25) {
            this._inCrisis = false;
        }

        // Entity counts
        this.entitySamples.push({
            enemies: state.entities.enemies.length,
            bullets: state.entities.enemyBullets.length,
            asteroids: state.entities.asteroids.length,
        });

        // Movement
        const speed = Math.hypot(player.vx || 0, player.vy || 0);
        this.velocitySamples.push(speed);

        // Input + near-misses
        this.inputChanges += inputChanges;
        this.nearMisses += nearMisses;

        // Bullet tracking (approximate from player bullet count delta)
        this.bulletsFired += state.entities.playerBulletCount || 0;
    }

    /**
     * Finalize metrics when wave ends.
     */
    finalize(endTime) {
        this.endTime = endTime;
        this.durationMs = this.endTime - this.startTime;
        this.durationS = Math.max(0.1, this.durationMs / 1000);

        // Action density
        this.actionDensity = this.actionEvents.length / this.durationS;

        // Idle ratio: fraction of ticks with zero nearby threats
        const idleTicks = this.entitySamples.filter(
            s => s.enemies === 0 && s.bullets === 0
        ).length;
        this.idleRatio = idleTicks / Math.max(1, this.entitySamples.length);

        // Threat saturation (entities per 1000px² of screen area)
        const screenArea = 1280 * 720; // Default viewport
        if (this.entitySamples.length > 0) {
            const avgEntities = this.entitySamples.reduce(
                (sum, s) => sum + s.enemies + s.bullets + s.asteroids, 0
            ) / this.entitySamples.length;
            this.threatSaturation = (avgEntities / screenArea) * 1000;
        }

        // Input rate
        this.inputRate = this.inputChanges / this.durationS;

        // Velocity variance
        this.velocityVariance = stddev(this.velocitySamples);

        // Damage ratio
        this.damageRatio = this.totalDamageDealt / Math.max(1, this.totalDamageTaken);

        // Approximate accuracy (kills / bullets-fired-deltas is hard to track precisely,
        // so we approximate from damage events / action events as a rough proxy)
        this.accuracy = this.kills / Math.max(1, this.kills + this.damageEventsTaken);

        // Intensity curve (split wave into 4 quarters)
        this.intensityCurve = this._computeIntensityCurve();
    }

    _computeIntensityCurve() {
        if (this.actionEvents.length < 4 || this.durationMs < 100) return [0, 0, 0, 0];
        const quarters = [0, 0, 0, 0];
        const quarterDuration = this.durationMs / 4;
        for (const event of this.actionEvents) {
            const elapsed = event.ts - this.startTime;
            const qi = Math.min(3, Math.floor(elapsed / quarterDuration));
            quarters[qi]++;
        }
        // Normalize to events/second per quarter
        const quarterS = quarterDuration / 1000;
        return quarters.map(q => q / Math.max(0.1, quarterS));
    }

    toJSON() {
        return {
            wave: this.wave,
            durationS: this.durationS,
            actionDensity: round2(this.actionDensity),
            idleRatio: round2(this.idleRatio),
            threatSaturation: round4(this.threatSaturation),
            inputRate: round2(this.inputRate),
            kills: this.kills,
            deaths: this.deaths,
            damageRatio: round2(this.damageRatio),
            healthFloor: round2(this.healthFloor),
            nearMisses: this.nearMisses,
            healthCrises: this.healthCrises,
            clutchKills: this.clutchKills,
            multiKillBursts: this.multiKillBursts,
            survivalRecoveries: this.survivalRecoveries,
            velocityVariance: round2(this.velocityVariance),
            accuracy: round2(this.accuracy),
            intensityCurve: this.intensityCurve.map(round2),
        };
    }
}

// ── Utilities ──────────────────────────────────────────────────

function stddev(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
