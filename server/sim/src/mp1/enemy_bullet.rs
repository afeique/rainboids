//! Phase 4 enemy-bullet infrastructure. Hostile projectiles fired by
//! enemies; collide with ship × enemy_bullet (NOT bullet × bullet, NOT
//! enemy_bullet × asteroid). Phase 4 step 1 ships AIMED-only ballistics
//! (straight-line constant velocity). Movement patterns (homing,
//! weaving, mine, missile) are Phase 5+ polish.
//!
//! Separate type from `BulletState` so each can evolve independently:
//! - `BulletState` owner is a `player_id`, hits enemies + asteroids
//! - `EnemyBulletState` owner is an `enemy_id`, hits ships only
//!
//! Deterministic — server and WASM client construct identical bullets
//! from the same `(id, owner_enemy_id, origin_x, origin_y, angle,
//! speed, spawn_tick)` parameters.

use crate::mp1::trig::{cos64, sin64};

/// Default ballistic speed for an aimed enemy bullet (px/tick at 60 Hz).
/// Solo's enemy-bullet baseline. Per-enemy-pattern customization is a
/// Phase 5 concern; for now all enemy bullets share this speed.
pub const ENEMY_BULLET_SPEED: f64 = 4.5;

/// Body radius — used by collision detection (ship × enemy_bullet
/// pair, Wave 2 integration). Solo uses 9 for normal bullets.
pub const ENEMY_BULLET_RADIUS: f64 = 9.0;

/// Lifetime in ticks (~3 s at 60 Hz). Bullet despawns when this hits 0.
/// Solo's default ~3000 ms.
pub const ENEMY_BULLET_LIFETIME_TICKS: u32 = 180;

/// Default damage to a ship on contact. Solo: 2 for normal-bullet
/// patterns, 3 for explosive. Phase 4 step 1 only ships normal.
pub const ENEMY_BULLET_DAMAGE: f64 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EnemyBulletState {
    /// Server-assigned bullet id; stable across spawn → hit/expiry.
    pub id: u32,
    /// Enemy id of the shooter (for kill-credit when a player dies).
    pub owner_enemy_id: u32,
    /// World x in pixels.
    pub x: f64,
    /// World y in pixels.
    pub y: f64,
    /// Per-tick x velocity (px/tick).
    pub vx: f64,
    /// Per-tick y velocity (px/tick).
    pub vy: f64,
    /// Damage dealt to a ship on contact.
    pub damage: f64,
    /// Collision radius.
    pub radius: f64,
    /// Lifetime in ticks remaining. Decrements each tick; bullet
    /// dies at 0.
    pub life_remaining: u32,
    /// Whether the bullet is still alive in the sim.
    pub active: bool,
}

impl EnemyBulletState {
    /// True if this bullet should be culled at the next retain pass.
    pub fn dead(&self) -> bool {
        !self.active || self.life_remaining == 0
    }
}

/// Spawn one enemy bullet aimed at `angle` from the enemy's position.
/// Both server and WASM client construct from identical inputs and
/// produce bit-identical state (uses `trig::cos64`/`sin64`).
///
/// Caller (Wave 2 integration in `mp1_room.rs`) is responsible for:
/// - picking the angle (typically `atan2(target.y - enemy.y, target.x - enemy.x)`)
/// - assigning the `id` from `room.next_enemy_bullet_id`
/// - pushing the bullet onto `RoomState.enemy_bullets`
/// - emitting `EventPayload::EnemyBulletSpawn` so the WASM client mirrors it
pub fn spawn(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    angle: f64,
    speed: f64,
    damage: f64,
    radius: f64,
    lifetime_ticks: u32,
) -> EnemyBulletState {
    EnemyBulletState {
        id,
        owner_enemy_id,
        x: origin_x,
        y: origin_y,
        vx: cos64(angle) * speed,
        vy: sin64(angle) * speed,
        damage,
        radius,
        life_remaining: lifetime_ticks,
        active: true,
    }
}

/// Convenience: spawn an aimed enemy bullet with all defaults (speed,
/// damage, radius, lifetime). Use when the caller doesn't need
/// per-pattern customization.
pub fn spawn_aimed_default(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    angle: f64,
) -> EnemyBulletState {
    spawn(
        id,
        owner_enemy_id,
        origin_x,
        origin_y,
        angle,
        ENEMY_BULLET_SPEED,
        ENEMY_BULLET_DAMAGE,
        ENEMY_BULLET_RADIUS,
        ENEMY_BULLET_LIFETIME_TICKS,
    )
}

/// Per-tick update: drift + lifetime decrement + off-field cull.
/// Mirrors `bullet::update_bullet` pattern.
pub fn update_enemy_bullet(
    b: &mut EnemyBulletState,
    field_w: f64,
    field_h: f64,
) {
    if !b.active {
        return;
    }
    // Lifetime tick (decrement to zero → cull).
    if b.life_remaining == 0 {
        b.active = false;
        return;
    }
    b.life_remaining -= 1;
    if b.life_remaining == 0 {
        b.active = false;
        return;
    }
    // Drift.
    b.x += b.vx;
    b.y += b.vy;
    // Off-field cull. Enemy bullets do NOT wrap (unlike asteroids/
    // orbs) — they fly off-screen and despawn, matching solo behavior
    // where stray bullets disappear at the field edge.
    let r = b.radius;
    if b.x < -r || b.x > field_w + r || b.y < -r || b.y > field_h + r {
        b.active = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mp1::trig::PI_2;

    /// Spawn at angle 0 places bullet at origin with velocity along +x.
    /// Tolerance is the polynomial trig's worst-case error band
    /// (~3e-5; see `trig::tests::SIN_ABS_TOLERANCE` rationale) — NOT
    /// bit-exact `f64::cos`. The PROPERTY we need is determinism (two
    /// callers get the same value), not accuracy vs the platform's
    /// `sin`/`cos`.
    #[test]
    fn spawn_at_origin_with_velocity() {
        let b = spawn(
            7, 3, 100.0, 200.0, 0.0,
            ENEMY_BULLET_SPEED, ENEMY_BULLET_DAMAGE,
            ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME_TICKS,
        );
        assert_eq!(b.id, 7);
        assert_eq!(b.owner_enemy_id, 3);
        assert_eq!(b.x, 100.0);
        assert_eq!(b.y, 200.0);
        assert!((b.vx - 4.5).abs() < 1e-4, "vx = {}", b.vx);
        assert!(b.vy.abs() < 1e-4, "vy = {}", b.vy);
        assert!(b.active);
    }

    /// Convenience constructor wires the module constants and aims via
    /// trig::sin/cos. Angle = π/2 → vx ≈ 0, vy ≈ +ENEMY_BULLET_SPEED.
    /// Looser tolerance (1e-4) reflects the polynomial trig's accuracy
    /// vs `f64::sin` (see `trig::tests::SIN_ABS_TOLERANCE` rationale).
    #[test]
    fn spawn_aimed_default_uses_consts() {
        let b = spawn_aimed_default(11, 5, 0.0, 0.0, PI_2);
        assert_eq!(b.damage, ENEMY_BULLET_DAMAGE);
        assert_eq!(b.radius, ENEMY_BULLET_RADIUS);
        assert_eq!(b.life_remaining, ENEMY_BULLET_LIFETIME_TICKS);
        assert!(b.vx.abs() < 1e-4, "vx = {} (expected ~0)", b.vx);
        assert!(
            (b.vy - ENEMY_BULLET_SPEED).abs() < 1e-4,
            "vy = {} (expected ~{})", b.vy, ENEMY_BULLET_SPEED,
        );
        assert!(b.active);
    }

    /// One update advances position by exactly (vx, vy). Pure `+` on
    /// f64 so we assert exact equality.
    #[test]
    fn update_drifts_one_step() {
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 100.0, y: 100.0,
            vx: 2.0, vy: 3.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: ENEMY_BULLET_LIFETIME_TICKS,
            active: true,
        };
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        assert_eq!(b.x, 102.0);
        assert_eq!(b.y, 103.0);
        assert!(b.active);
    }

    /// After `life_remaining` updates, bullet is inactive.
    #[test]
    fn lifetime_decrements_to_zero() {
        // Zero velocity isolates the lifetime branch from off-field
        // cull.
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 500.0, y: 500.0,
            vx: 0.0, vy: 0.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: 3,
            active: true,
        };
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        assert!(b.active, "active after 1 update (life=2)");
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        assert!(b.active, "active after 2 updates (life=1)");
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        assert!(!b.active, "inactive after 3 updates (life=0)");
    }

    /// Right-edge cull: bullet already past field_w + radius gets
    /// marked inactive on the next update.
    #[test]
    fn off_field_culls() {
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 1925.0, y: 500.0,
            vx: 1.0, vy: 0.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: ENEMY_BULLET_LIFETIME_TICKS,
            active: true,
        };
        // field_w + radius = 1920 + 9 = 1929; after move x = 1926, still
        // inside the margin. Push past it.
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        // Step it again — now well past 1929.
        b.vx = 10.0;
        for _ in 0..2 {
            update_enemy_bullet(&mut b, 1920.0, 1080.0);
            if !b.active { break; }
        }
        assert!(!b.active, "should be culled past right edge");
    }

    /// Left-edge cull mirror: bullet past `-radius` going further off
    /// gets marked inactive.
    #[test]
    fn negative_x_culls() {
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: -15.0, y: 500.0,
            vx: -1.0, vy: 0.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: ENEMY_BULLET_LIFETIME_TICKS,
            active: true,
        };
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        // After one step: x = -16, which is past -radius (-9), so cull.
        assert!(!b.active, "should be culled past left edge");
    }

    /// Inactive bullets are a no-op — no field changes.
    #[test]
    fn inactive_bullet_no_op() {
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 100.0, y: 100.0,
            vx: 5.0, vy: 5.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: 50,
            active: false,
        };
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        assert_eq!(b.x, 100.0);
        assert_eq!(b.y, 100.0);
        assert_eq!(b.life_remaining, 50);
        assert!(!b.active);
    }

    /// `dead()` reflects both inactive and life-zero states.
    #[test]
    fn dead_helper_reflects_state() {
        let alive = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 0.0, y: 0.0, vx: 0.0, vy: 0.0,
            damage: 0.0, radius: 0.0,
            life_remaining: 10,
            active: true,
        };
        assert!(!alive.dead());

        let inactive = EnemyBulletState { active: false, ..alive };
        assert!(inactive.dead());

        let expired = EnemyBulletState { life_remaining: 0, ..alive };
        assert!(expired.dead());

        let both = EnemyBulletState { active: false, life_remaining: 0, ..alive };
        assert!(both.dead());
    }

    /// Contract: enemy bullets do NOT wrap (unlike asteroids/orbs).
    /// A bullet that crosses the right edge is culled, NOT teleported
    /// to the left edge. Wave 2 integration depends on this.
    #[test]
    fn enemy_bullets_do_not_wrap() {
        let mut b = EnemyBulletState {
            id: 1, owner_enemy_id: 0,
            x: 1925.0, y: 500.0,
            vx: 5.0, vy: 0.0,
            damage: ENEMY_BULLET_DAMAGE,
            radius: ENEMY_BULLET_RADIUS,
            life_remaining: ENEMY_BULLET_LIFETIME_TICKS,
            active: true,
        };
        update_enemy_bullet(&mut b, 1920.0, 1080.0);
        // x moved to 1930, past field_w + radius = 1929 — culled.
        assert!(!b.active, "should be culled, not wrapped");
        // Verify we did NOT teleport to the left edge.
        assert!(b.x > 0.0, "x = {} (should NOT have wrapped to left)", b.x);
    }

    /// Determinism sanity check: two spawns with identical inputs
    /// produce bit-identical state. Guards against accidental
    /// nondeterminism creeping into trig::cos64/sin64.
    #[test]
    fn spawn_velocity_determinism() {
        let a = spawn(
            42, 1, 0.0, 0.0, 1.234,
            ENEMY_BULLET_SPEED, ENEMY_BULLET_DAMAGE,
            ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME_TICKS,
        );
        let b = spawn(
            42, 1, 0.0, 0.0, 1.234,
            ENEMY_BULLET_SPEED, ENEMY_BULLET_DAMAGE,
            ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME_TICKS,
        );
        assert_eq!(a.vx, b.vx, "vx must be bit-identical");
        assert_eq!(a.vy, b.vy, "vy must be bit-identical");
    }
}
