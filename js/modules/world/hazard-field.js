// A.E9-S2 — persistent hazard zones (acid pools, fire fields, frost patches).
// A circular zone that ticks damage (+ its element's status) onto the player
// while they stand inside it, for a lifetime. Density-capped. The element drives
// the player status because the damage routes through takeDamage(opts.element)
// → applyPlayerStatus (e.g. a Toxic acid pool corrodes; a Pyro field burns).
//
// Self-contained + unit-testable: the damage application is INJECTED as a
// callback, so this module has no engine deps. The engine owns one HazardField,
// updates it each gameplay frame, and exposes spawnHazard() for enemies (e.g.
// Plaguebearer trails) and, later, player weapons (Caustic / Scorched Earth —
// those would harm enemies via a separate target set).

const MAX_HAZARDS = 24;        // density cap (perf + fairness)
const DAMAGE_TICK_MS = 300;    // how often a hazard ticks the occupant

export class HazardField {
    constructor() {
        this.hazards = [];
    }

    /** Drop all hazards (new run / wave reset). */
    clear() {
        this.hazards.length = 0;
    }

    get count() {
        return this.hazards.length;
    }

    /**
     * Spawn a hazard zone. `opts`: { radius, element, dps, lifeMs }. `now` is
     * frameClock.now (so the lifetime + tick schedule are absolute). Oldest is
     * dropped when at the density cap.
     */
    spawn(x, y, opts = {}, now = 0) {
        const { radius = 70, element = 'TOXIC', dps = 6, lifeMs = 4000 } = opts;
        if (this.hazards.length >= MAX_HAZARDS) this.hazards.shift();
        const h = { x, y, radius, element, dps, expireAt: now + lifeMs, nextTick: now + DAMAGE_TICK_MS };
        this.hazards.push(h);
        return h;
    }

    /**
     * Per-frame update. Culls expired zones; for any zone the player is inside,
     * applies `dps`-scaled damage ticks via `applyDamage(amount, element)` (the
     * engine routes that through takeDamage so resist + the player status +
     * the death pipeline all apply). `player` may be null.
     */
    update(now, player, applyDamage) {
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const h = this.hazards[i];
            if (now >= h.expireAt) { this.hazards.splice(i, 1); continue; }
            if (!player || typeof applyDamage !== 'function') continue;
            const dx = player.x - h.x, dy = player.y - h.y;
            if (dx * dx + dy * dy <= h.radius * h.radius) {
                while (now >= h.nextTick) {
                    applyDamage(h.dps * (DAMAGE_TICK_MS / 1000), h.element);
                    h.nextTick += DAMAGE_TICK_MS;
                }
            } else if (now > h.nextTick) {
                // Stepped out — don't let the tick schedule fall far behind, so
                // re-entering doesn't dump a burst of back-dated ticks.
                h.nextTick = now;
            }
        }
    }

    /** Test/helper: is (x, y) inside any active hazard? */
    contains(x, y) {
        for (const h of this.hazards) {
            const dx = x - h.x, dy = y - h.y;
            if (dx * dx + dy * dy <= h.radius * h.radius) return true;
        }
        return false;
    }
}
