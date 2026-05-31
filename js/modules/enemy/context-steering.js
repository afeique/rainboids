// ─────────────────────────────────────────────────────────────────────────
// Context steering — smooth obstacle avoidance by sampling candidate headings
// ─────────────────────────────────────────────────────────────────────────
//
// Plain weighted-sum avoidance fights the goal force and can freeze when the
// two cancel. Context steering instead samples a ring of N candidate headings
// and scores each one twice:
//
//   interest[i] — how well heading i points at where we WANT to go (the goal)
//   danger[i]   — how much heading i runs INTO an obstacle
//
// We mask out interest wherever danger is high, then pick the best surviving
// heading. The agent "slides" around obstacles instead of oscillating, handles
// several obstacles at once, and never deadlocks against its own goal. If every
// heading is dangerous it returns the least-bad one (an escape route).
//
// Cost is a handful of dot products + distance checks per agent (N≈12),
// throttle-friendly. Feed it a SMALL obstacle set from the spatial grid.

const TAU = Math.PI * 2;

/**
 * Reusable scratch for one agent's context evaluation. Allocate once
 * (per-agent or a shared singleton if evaluated serially) and reuse.
 */
export class ContextMap {
    constructor(slots = 12) {
        this.slots = slots;
        this.dirX = new Float64Array(slots);
        this.dirY = new Float64Array(slots);
        this.interest = new Float64Array(slots);
        this.danger = new Float64Array(slots);
        for (let i = 0; i < slots; i++) {
            const a = (i / slots) * TAU;
            this.dirX[i] = Math.cos(a);
            this.dirY[i] = Math.sin(a);
        }
    }

    reset() {
        this.interest.fill(0);
        this.danger.fill(0);
    }
}

/**
 * Add interest toward a goal direction. Interest in slot i = max(0, dot(slot,
 * goalDir)) ^ sharpness — higher sharpness narrows the preferred cone.
 */
export function addInterest(map, goalDirX, goalDirY, weight = 1, sharpness = 1) {
    const len = Math.hypot(goalDirX, goalDirY);
    if (len < 1e-9) return;
    const gx = goalDirX / len, gy = goalDirY / len;
    const { slots, dirX, dirY, interest } = map;
    for (let i = 0; i < slots; i++) {
        let d = dirX[i] * gx + dirY[i] * gy;       // [-1, 1]
        if (d < 0) d = 0;
        if (sharpness !== 1) d = Math.pow(d, sharpness);
        interest[i] += d * weight;
    }
}

/**
 * Add danger from one obstacle. Danger spreads over the slots pointing toward
 * the obstacle, ramped by proximity (closer = more dangerous) and widened by
 * the obstacle's angular size so big/near rocks block a wider arc.
 *
 * @param px,py    agent position
 * @param ox,oy    obstacle position
 * @param oradius  obstacle radius (+ agent radius, caller pre-adds margin)
 * @param avoid    avoidance range; beyond this the obstacle is ignored
 */
export function addDanger(map, px, py, ox, oy, oradius, avoid) {
    const dx = ox - px, dy = oy - py;
    const dist = Math.hypot(dx, dy);
    if (dist > avoid || dist < 1e-6) return;
    const tx = dx / dist, ty = dy / dist;
    // Proximity ramp: 1 at contact → 0 at the avoid radius.
    const prox = 1 - (dist - oradius) / (avoid - oradius);
    const strength = prox < 0 ? 0 : prox > 1 ? 1 : prox;
    // Angular half-width the obstacle subtends (clamped) → how many slots it
    // poisons. Always at least a little so a dead-ahead point isn't missed.
    const ang = Math.min(Math.PI * 0.5, Math.atan2(oradius, dist) + 0.25);
    const cosCut = Math.cos(ang);
    const { slots, dirX, dirY, danger } = map;
    for (let i = 0; i < slots; i++) {
        const d = dirX[i] * tx + dirY[i] * ty;     // alignment with obstacle dir
        if (d > cosCut) {
            // Scale danger by how head-on the slot is plus the proximity.
            const dv = strength * (d - cosCut) / (1 - cosCut + 1e-9);
            if (dv > danger[i]) danger[i] = dv;     // keep the worst threat
        }
    }
}

/**
 * Pick the best heading. Masks interest where danger exceeds `dangerCut`, then
 * returns the surviving slot with the highest interest. If everything is
 * masked (boxed in), returns the lowest-danger slot as an escape route and
 * sets `out.blocked = true`.
 *
 * @returns out {x, y, blocked} — a unit heading vector
 */
export function chooseDirection(map, out, dangerCut = 0.5) {
    const { slots, dirX, dirY, interest, danger } = map;
    let bestI = -1, bestScore = -Infinity;
    for (let i = 0; i < slots; i++) {
        if (danger[i] <= dangerCut && interest[i] > bestScore) {
            bestScore = interest[i];
            bestI = i;
        }
    }
    if (bestI >= 0) {
        out.x = dirX[bestI]; out.y = dirY[bestI]; out.blocked = false;
        return out;
    }
    // Boxed in: take the least-dangerous heading (prefer one with some interest).
    let safe = 0, safeScore = Infinity;
    for (let i = 0; i < slots; i++) {
        const s = danger[i] - interest[i] * 0.25;
        if (s < safeScore) { safeScore = s; safe = i; }
    }
    out.x = dirX[safe]; out.y = dirY[safe]; out.blocked = true;
    return out;
}
