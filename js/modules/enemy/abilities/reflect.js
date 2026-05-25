// SYS-6 / ENMY-04 — projectile reflection. A "mirror" enemy (Prism Mirror) with
// a front-arc MIRROR bounces player bullets back at them instead of taking the
// hit: when a bullet strikes inside the front arc, the enemy spawns an ENEMY
// bullet flying back along the reflected vector and the original is consumed —
// the enemy takes NO damage. Beams and melee BYPASS the mirror (they're not
// reflectable projectiles), and an already-reflected bullet can't be reflected
// again so two facing mirrors can't ping-pong forever.
//
// CONVENTION: the front arc is centered on `reflect.facingRad` (world radians,
// the direction the mirror faces). A bullet is "in arc" when the direction from
// the enemy TO the bullet falls within `reflect.halfAngleRad` of `facingRad` —
// i.e. the bullet is approaching the enemy's mirror face from the front. The
// reflected bullet is sent back OUT along that enemy→bullet direction at
// `reflect.speed` (a clean, deterministic "bounce straight back the way it came"
// model that never depends on the bullet's exact incoming velocity).
//
// The enemy holds a `reflect` config + a `reflects` flag; the bullet is a plain
// {x,y,vx,vy,angle,damage,element} with optional isBeam/isMelee/reflected/
// bypassReflect flags. Pure given (enemy, bullet); no Date.now / globals / DOM /
// imports. Returns specs/values; the caller does the pooling/spawn. Unit-tests
// cleanly.

export const REFLECT_DEFAULTS = {
    halfAngleRad: Math.PI / 3, // 60° half-angle → 120° mirror arc across the front
    speed: 7,                  // speed of the reflected enemy bullet
};

/**
 * Smallest signed angular difference a→b, wrapped to (-π, π]. Lets the arc test
 * work correctly across the ±π seam.
 */
function angleDelta(a, b) {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
}

/**
 * True when `bullet` is approaching within the enemy's front mirror arc: the
 * direction from the enemy TO the bullet is within `reflect.halfAngleRad` of
 * `reflect.facingRad`. Uses enemy.x/y + bullet.x/y; angle wraparound is handled.
 * A bullet AT the enemy (zero offset) counts as in-arc (degenerate but safe).
 */
export function bulletInReflectArc(enemy, bullet) {
    if (!enemy || !enemy.reflect || !bullet) return false;
    const r = enemy.reflect;
    const dx = bullet.x - enemy.x;
    const dy = bullet.y - enemy.y;
    if (dx === 0 && dy === 0) return true; // degenerate: on top of the mirror
    const toBullet = Math.atan2(dy, dx);
    return Math.abs(angleDelta(r.facingRad, toBullet)) <= r.halfAngleRad;
}

/**
 * The single gate collision code calls: should THIS bullet be reflected by THIS
 * enemy right now? True only when the enemy `reflects`, has a `reflect` config,
 * the bullet is a reflectable projectile (NOT a beam/melee/already-reflected/
 * bypass), and the bullet is in the front arc.
 */
export function shouldReflect(enemy, bullet) {
    if (!enemy || !enemy.reflects || !enemy.reflect || !bullet) return false;
    if (bullet.isBeam || bullet.isMelee || bullet.reflected || bullet.bypassReflect) return false;
    return bulletInReflectArc(enemy, bullet);
}

/**
 * The reflected bullet's velocity: sent back OUT along the enemy→bullet
 * direction (away from the mirror, back toward where it came from) at
 * `reflect.speed`. Returns { vx, vy, angle }. Falls back to the negated bullet
 * heading if the bullet sits exactly on the enemy (degenerate). Pure +
 * deterministic.
 */
export function reflectVector(enemy, bullet) {
    const r = (enemy && enemy.reflect) || REFLECT_DEFAULTS;
    const speed = r.speed;
    const dx = bullet.x - enemy.x;
    const dy = bullet.y - enemy.y;
    const len = Math.hypot(dx, dy);
    let angle;
    if (len > 0) {
        angle = Math.atan2(dy, dx); // enemy → bullet: send it back this way
    } else if (typeof bullet.angle === 'number') {
        angle = bullet.angle + Math.PI; // degenerate: bounce straight back
    } else {
        angle = (r.facingRad || 0);
    }
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle };
}

/**
 * Build the spec for the ENEMY bullet to spawn when reflecting. Positioned at the
 * enemy's mirror face (enemy.x/y), velocity from `reflectVector`, carrying over
 * the original bullet's `damage` and `element` (so a reflected shot hits like the
 * shot that was fired), and flagged `reflected:true` so it can't be reflected
 * again. The caller does the actual pooling/spawn — this only returns the spec.
 */
export function makeReflectedBullet(enemy, bullet) {
    const r = (enemy && enemy.reflect) || REFLECT_DEFAULTS;
    const v = reflectVector(enemy, bullet);
    const damage = typeof bullet.damage === 'number' ? bullet.damage
        : (typeof r.damage === 'number' ? r.damage : 0);
    return {
        x: enemy.x,
        y: enemy.y,
        vx: v.vx,
        vy: v.vy,
        angle: v.angle,
        speed: r.speed,
        damage,
        element: bullet.element,
        reflected: true,
    };
}
