/**
 * AI QA Bot — Proximity Tracker
 *
 * Tracks near-miss events and dodge outcomes by monitoring enemy bullet
 * trajectories relative to the player. A near-miss is when a bullet's
 * closest approach to the player is within the near-miss radius but
 * doesn't actually collide (i.e., it passes close by).
 */

const NEAR_MISS_RADIUS = 40;   // px — close enough to feel dangerous
const PLAYER_HIT_RADIUS = 15;  // px — approximate player collision radius

export class ProximityTracker {
    constructor() {
        // Track previous bullet positions to detect closest-approach moments
        // Key: bulletKey string, Value: {x, y, dist}
        this._prevBullets = new Map();
        this._tickNearMisses = 0;
    }

    /**
     * Update with current state. Call once per tick.
     * @returns {number} Number of near-miss events this tick
     */
    update(player, entities) {
        this._tickNearMisses = 0;
        if (!player) return 0;

        const px = player.x;
        const py = player.y;
        const currentKeys = new Set();

        for (let i = 0; i < entities.enemyBullets.length; i++) {
            const b = entities.enemyBullets[i];
            const key = `${Math.round(b.x * 10)}_${Math.round(b.y * 10)}_${i}`;
            currentKeys.add(key);

            const dist = Math.hypot(b.x - px, b.y - py);
            const prev = this._prevBullets.get(key);

            if (prev) {
                // Bullet was approaching and is now receding = closest approach happened
                // Near-miss if closest approach was within threshold but outside hit radius
                if (prev.dist < dist && prev.dist < NEAR_MISS_RADIUS && prev.dist > PLAYER_HIT_RADIUS) {
                    this._tickNearMisses++;
                }
            }

            this._prevBullets.set(key, { x: b.x, y: b.y, dist });
        }

        // Prune bullets that no longer exist (keep map from growing)
        if (this._prevBullets.size > entities.enemyBullets.length * 2) {
            for (const key of this._prevBullets.keys()) {
                if (!currentKeys.has(key)) {
                    this._prevBullets.delete(key);
                }
            }
        }

        return this._tickNearMisses;
    }

    /**
     * Reset tracker state (e.g., between waves or on respawn).
     */
    reset() {
        this._prevBullets.clear();
        this._tickNearMisses = 0;
    }
}
