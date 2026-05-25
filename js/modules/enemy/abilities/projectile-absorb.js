// SYS-4 / ENMY-02 — projectile absorption. A "devourer" enemy with a MAW CONE
// consumes player bullets that fly into the cone: the bullet deals NO damage and
// is eaten, and in return the enemy banks a small TEMPORARY shield it reads in
// its damage path. The shield is a timed stamp that LAPSES on its own, so once
// the player stops feeding it bullets the absorb shield drains away. Beams and
// melee BYPASS the maw entirely (they're not consumable projectiles).
//
// The enemy holds a `maw` config + a `_absorbShield` accumulator; the bullet is
// a plain {x,y} with optional isBeam/isMelee/bypassAbsorb flags. The cap on the
// banked shield (`maxShield`) is the defensive guardrail — same mindset as
// support-aura's allyShieldMult clamp — so absorption can stall damage but can
// never make the devourer immune.
//
// Pure given (enemy, bullet, now); no Date.now / globals / DOM / imports. Unit-
// tests cleanly.

export const SHIELD_DURATION_MS = 3000; // a banked absorb shield lapses after this

export const MAW_DEFAULTS = {
    halfAngleRad: Math.PI / 4, // 45° half-angle → 90° cone in front of the maw
    range: 140,                // bullets only get eaten within this distance
    facingRad: 0,              // direction the maw points (world radians)
    shieldPerBullet: 6,        // shield banked per consumed bullet
    maxShield: 60,             // hard cap on banked shield (the defensive guardrail)
};

/**
 * Smallest signed angular difference a→b, wrapped to (-π, π]. Lets the cone test
 * work correctly across the ±π seam.
 */
function angleDelta(a, b) {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
}

/**
 * True when `bullet` sits within the enemy's maw cone: within `maw.range` of the
 * enemy AND within `maw.halfAngleRad` of `maw.facingRad`. Uses enemy.x/y +
 * bullet.x/y; angle wraparound is handled. A bullet AT the enemy (zero offset)
 * counts as inside the cone.
 */
export function bulletInMawCone(enemy, bullet) {
    if (!enemy || !enemy.maw || !bullet) return false;
    const m = enemy.maw;
    const dx = bullet.x - enemy.x;
    const dy = bullet.y - enemy.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > m.range * m.range) return false;
    if (dist2 === 0) return true; // degenerate: on top of the maw → inside
    const toBullet = Math.atan2(dy, dx);
    return Math.abs(angleDelta(m.facingRad, toBullet)) <= m.halfAngleRad;
}

/**
 * Eat a bullet: bank `maw.shieldPerBullet` onto the enemy's `_absorbShield`
 * (clamped to `maw.maxShield`) and (re)stamp `_absorbShieldUntil` to now +
 * SHIELD_DURATION_MS. Returns the new banked shield value. The caller is
 * responsible for consuming/deactivating the bullet entity.
 */
export function absorbBullet(enemy, bullet, now) {
    if (!enemy || !enemy.maw) return 0;
    const m = enemy.maw;
    const cur = enemy._absorbShield > 0 ? enemy._absorbShield : 0;
    enemy._absorbShield = Math.min(m.maxShield, cur + m.shieldPerBullet);
    enemy._absorbShieldUntil = now + SHIELD_DURATION_MS;
    return enemy._absorbShield;
}

/**
 * The single gate collision code calls: should THIS bullet be eaten by THIS
 * enemy right now? True only when the enemy `eatsProjectiles`, has a `maw`, the
 * bullet is a consumable projectile (NOT a beam/melee/bypass), and the bullet is
 * in the maw cone.
 */
export function shouldAbsorb(enemy, bullet, now) {
    if (!enemy || !enemy.eatsProjectiles || !enemy.maw || !bullet) return false;
    if (bullet.isBeam || bullet.isMelee || bullet.bypassAbsorb) return false;
    return bulletInMawCone(enemy, bullet);
}

/**
 * The enemy's effective banked shield right now (0 once the stamp has expired).
 * The damage path subtracts incoming damage from this first.
 */
export function absorbShieldRemaining(enemy, now) {
    if (!enemy) return 0;
    if (!(enemy._absorbShieldUntil > now)) return 0;
    return enemy._absorbShield > 0 ? enemy._absorbShield : 0;
}

/**
 * Spend the active banked shield against `amount` of incoming damage. Reduces
 * `_absorbShield` by what it can soak and returns the LEFTOVER damage that
 * passes through to HP (>= 0). If the shield has expired, `amount` is returned
 * unchanged and nothing is spent.
 */
export function consumeAbsorbShield(enemy, amount, now) {
    const dmg = amount > 0 ? amount : 0;
    const shield = absorbShieldRemaining(enemy, now);
    if (shield <= 0) return dmg;
    const soaked = Math.min(shield, dmg);
    enemy._absorbShield = shield - soaked;
    return dmg - soaked;
}
