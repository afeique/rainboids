// A.E9-S7 — ally support auras. A "support" enemy (Lumen Drone, Conduit Node,
// Bulwark Drone) periodically buffs nearby ALLY enemies: a SHIELD (incoming
// damage reduction the ally reads in applyDamageToEnemy) or a HEAL (HP regen).
// The buff is a timed stamp that LINGERS briefly, so killing the support — or
// the ally leaving the radius — lets it lapse: kill the support to drop it.
//
// Pure given (support, allies, now); the support holds the `aura` config, the
// allies hold the stamped fields. Unit-tests cleanly.

export const AURA_LINGER_MS = 400; // a shield stamp outlives the support by this

/**
 * Apply a support's aura to nearby allies (mutates ally fields). `support.aura`
 * = { radius, kind:'shield'|'heal', amount, intervalMs }. SHIELD stamps a
 * timed damage-reduction; HEAL restores HP. Skips self / inactive / out-of-
 * radius. Returns the number of allies affected (FX/tests).
 */
export function runAura(support, allies, now) {
    if (!support || !support.aura || !allies) return 0;
    const a = support.aura;
    const r2 = a.radius * a.radius;
    let n = 0;
    for (const e of allies) {
        if (!e || e === support || !e.active) continue;
        const dx = e.x - support.x, dy = e.y - support.y;
        if (dx * dx + dy * dy > r2) continue;
        if (a.kind === 'shield') {
            e._allyShieldUntil = now + AURA_LINGER_MS;
            e._allyShieldAmount = a.amount;
        } else if (a.kind === 'heal') {
            if (typeof e.health === 'number' && typeof e.maxHealth === 'number') {
                e.health = Math.min(e.maxHealth, e.health + a.amount);
            }
        }
        n++;
    }
    return n;
}

/**
 * Incoming-damage multiplier from an active ally SHIELD (read in
 * applyDamageToEnemy). 1 = none. Capped so a shield can't make an ally immune.
 */
export function allyShieldMult(enemy, now) {
    if (enemy && enemy._allyShieldUntil > now && enemy._allyShieldAmount > 0) {
        return 1 - Math.min(0.9, enemy._allyShieldAmount);
    }
    return 1;
}
