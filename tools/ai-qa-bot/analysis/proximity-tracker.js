/**
 * AI QA Bot — Proximity Tracker
 *
 * Tracks near-miss events by monitoring enemy bullet trajectories
 * relative to the player. A near-miss is when a bullet's closest
 * approach is within the near-miss radius but doesn't collide.
 *
 * Uses index-based bullet tracking (not position-based keys) since
 * bullets move every frame, making position-based keys unstable.
 * Also interpolates closest approach between samples to handle the
 * 10Hz bot tick rate vs 60Hz game tick rate gap.
 */

const NEAR_MISS_RADIUS = 80;   // px — widened from 40 for 10Hz sampling
const PLAYER_HIT_RADIUS = 18;  // px — approximate player collision radius

export class ProximityTracker {
    constructor() {
        // Track previous bullet states by index-based matching
        // [{x, y, dist, vx, vy}]
        this._prevBullets = [];
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
        const bullets = entities.enemyBullets;
        const prevBullets = this._prevBullets;

        // Match current bullets to previous bullets by proximity
        // (bullets move predictably frame-to-frame)
        const used = new Set();

        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            const dist = Math.hypot(b.x - px, b.y - py);

            // Find the best matching previous bullet
            let bestMatch = -1;
            let bestMatchDist = 60; // max px a bullet could move in 100ms at 7px/tick * 6 ticks

            for (let j = 0; j < prevBullets.length; j++) {
                if (used.has(j)) continue;
                const p = prevBullets[j];
                // Predict where previous bullet should be now
                const predX = p.x + p.vx * 6; // ~6 game ticks per bot tick
                const predY = p.y + p.vy * 6;
                const matchDist = Math.hypot(b.x - predX, b.y - predY);
                if (matchDist < bestMatchDist) {
                    bestMatchDist = matchDist;
                    bestMatch = j;
                }
            }

            if (bestMatch >= 0) {
                used.add(bestMatch);
                const prev = prevBullets[bestMatch];

                // Interpolate closest approach between prev and current positions
                // relative to player. This handles the case where a bullet passes
                // through the near-miss zone between samples.
                const closestDist = this._interpolateClosestApproach(
                    prev.x, prev.y, b.x, b.y, px, py
                );

                // Near-miss: closest approach was within threshold but outside hit radius
                if (closestDist < NEAR_MISS_RADIUS && closestDist > PLAYER_HIT_RADIUS) {
                    // Only count if bullet was approaching (prev farther than current or interpolated closest)
                    if (prev.dist > closestDist || dist > closestDist) {
                        this._tickNearMisses++;
                    }
                }
            }
        }

        // Store current bullets for next tick
        this._prevBullets = bullets.map(b => ({
            x: b.x, y: b.y,
            dist: Math.hypot(b.x - px, b.y - py),
            vx: b.vx || 0, vy: b.vy || 0,
        }));

        return this._tickNearMisses;
    }

    /**
     * Interpolate closest point on line segment (x1,y1)→(x2,y2) to point (px,py).
     * Returns the minimum distance from the player to the bullet's path.
     */
    _interpolateClosestApproach(x1, y1, x2, y2, px, py) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;

        if (lenSq < 0.001) {
            // Bullet didn't move (or barely moved)
            return Math.hypot(x1 - px, y1 - py);
        }

        // Project player position onto bullet path
        const t = Math.max(0, Math.min(1,
            ((px - x1) * dx + (py - y1) * dy) / lenSq
        ));

        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;
        return Math.hypot(closestX - px, closestY - py);
    }

    /**
     * Reset tracker state (e.g., between waves or on respawn).
     */
    reset() {
        this._prevBullets = [];
        this._tickNearMisses = 0;
    }
}
