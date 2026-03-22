/**
 * AI QA Bot — Fun Metrics Collector
 *
 * Runs alongside the state reader at each tick. Collects raw signals
 * needed for fun scoring by maintaining per-wave WaveBuckets and
 * tracking near-miss / proximity events.
 */

import { WaveBucket } from './wave-bucket.js';
import { ProximityTracker } from './proximity-tracker.js';

export class FunMetricsCollector {
    constructor() {
        /** @type {Map<number, WaveBucket>} */
        this.waveBuckets = new Map();
        this.currentWave = null;
        this.proximityTracker = new ProximityTracker();
        this._prevInputs = null;
        this._prevPlayerBulletCount = 0;
    }

    /**
     * Process one tick of game state + events.
     * Called every tick from bot.js after state read.
     *
     * @param {object} state - Current game state snapshot
     * @param {Array} events - Delta events from this tick
     * @param {object|null} botInputs - Combat AI inputs for this tick
     */
    tick(state, events, botInputs) {
        if (!state || !state.player) return;

        const now = Date.now();

        // Handle wave transitions in ALL states (events fire during SHOP too)
        for (const event of events) {
            if (event.type === 'wave_start') {
                this._onWaveStart(event.wave, now);
            }
        }

        // Ensure we have a bucket (first tick may not have a wave_start event)
        if (!this.currentWave && state.wave) {
            this._onWaveStart(state.wave, now);
        }

        // Only sample gameplay metrics during active states
        if (state.gameState !== 'PLAYING' && state.gameState !== 'WAVE_TRANSITION') return;

        const bucket = this.waveBuckets.get(this.currentWave);
        if (!bucket) return;

        // Count input changes for activity tracking
        const inputChanges = this._countInputChanges(botInputs);

        // Track near-misses
        const nearMisses = this.proximityTracker.update(state.player, state.entities);

        // Sample per-tick state
        bucket.sampleTick(state, inputChanges, nearMisses);

        // Process events into bucket
        for (const event of events) {
            switch (event.type) {
                case 'enemy_killed':
                    bucket.recordKill(now, state.player.health / Math.max(1, state.player.maxHealth));
                    // Approximate damage dealt from the kill (enemy maxHealth serves as proxy)
                    bucket.recordDamageDealt(1, now);
                    break;
                case 'damage_taken':
                    bucket.recordDamageTaken(event.amount || 1, now);
                    break;
                case 'death':
                    bucket.deaths++;
                    break;
            }
        }

        // Track bullets fired (delta of player bullet count)
        const curBullets = state.entities.playerBulletCount || 0;
        if (curBullets > this._prevPlayerBulletCount) {
            bucket.bulletsFired += curBullets - this._prevPlayerBulletCount;
        }
        this._prevPlayerBulletCount = curBullets;

        this._prevInputs = botInputs;
    }

    /**
     * Finalize all open wave buckets and return results.
     * @returns {Map<number, WaveBucket>} Finalized wave buckets
     */
    finalize() {
        const now = Date.now();
        for (const bucket of this.waveBuckets.values()) {
            if (!bucket.endTime) {
                bucket.finalize(now);
            }
        }
        return this.waveBuckets;
    }

    /**
     * Get all wave buckets as a JSON-serializable array.
     */
    toJSON() {
        return [...this.waveBuckets.values()].map(b => b.toJSON());
    }

    // ── Internal ───────────────────────────────────────────────

    _onWaveStart(wave, now) {
        // Finalize previous wave bucket
        if (this.currentWave !== null) {
            const prevBucket = this.waveBuckets.get(this.currentWave);
            if (prevBucket && !prevBucket.endTime) {
                prevBucket.finalize(now);
            }
        }
        this.currentWave = wave;
        if (!this.waveBuckets.has(wave)) {
            this.waveBuckets.set(wave, new WaveBucket(wave, now));
        }
        this.proximityTracker.reset();
    }

    _countInputChanges(inputs) {
        if (!inputs || !this._prevInputs) return 0;
        let changes = 0;
        for (const key of ['up', 'down', 'left', 'right', 'fire', 'fireSecondary']) {
            if (inputs[key] !== this._prevInputs[key]) changes++;
        }
        return changes;
    }
}
