//! Phase 4 step 6 — player-owned homing missile. Heavy-hit projectile
//! fired by the MISSILE_SALVO power weapon that steers its velocity
//! toward the nearest alive enemy each tick. Player-side mirror of
//! `enemy_missile::EnemyMissileState` — same structural shape, opposite
//! ownership polarity.
//!
//! Differences from `EnemyMissileState`:
//! - Owned by a PLAYER (`owner_player_id`) instead of an enemy. The
//!   Wave 2 collision system uses this so missiles never hit allied
//!   ships (no friendly fire): `player_missile × enemy` is the only
//!   collision pair this entity participates in.
//! - The homing target slice is `&[EnemyState]` (alive enemies) instead
//!   of `&[TargetView]` (alive ships). Each tick the missile re-aims
//!   at the closest active enemy and reprojects its velocity onto the
//!   new heading.
//! - Damage default is `1.5` to mirror solo's `weapon-data.js`
//!   `MISSILE_SALVO.missileDamage` exactly (player missiles are a
//!   spammy salvo, not a single big hit like the enemy missile).
//! - Speed default is `3.0` — slightly slower than aimed enemy bullets
//!   so the player can read and dodge their own salvo trail, and the
//!   missiles read as a managed threat rather than a hitscan delete.
//!
//! Determinism contract:
//! - NO RNG inside `update_missile`. Target pick + heading update are
//!   pure functions of (missile state, enemies slice).
//! - The caller (Wave 2 dispatcher) MUST pass the SAME enemies slice
//!   in the SAME order on server and WASM client. Standard order:
//!   `RoomState.enemies` in insertion order (id-asc by construction).
//! - `closest_alive_enemy` tie-breaks on lower slice index when two
//!   enemies are equidistant — caller's stable ordering keeps server
//!   and client trajectories bit-identical.
//! - All trig goes through `trig::cos64` / `sin64` / `atan2_64`
//!   (polynomial, bit-exact across native + WASM runtimes). Never
//!   `f64::sin/cos/atan2`.
//! - `f64::sqrt` IS used (only to preserve launch speed when
//!   reprojecting velocity onto the homed heading). IEEE 754 sqrt is
//!   correctly rounded and bit-exact across compliant runtimes, so
//!   this stays deterministic.
//!
//! Wave 2 wires:
//! - `state.rs` already has `player_missiles: Vec<PlayerMissileState>`
//!   + `MAX_PLAYER_MISSILES` cap + `next_player_missile_id`.
//! - `collision.rs` will add the `player_missile × enemy` pair.
//! - `power_weapon_missile_salvo.rs` calls `spawn_default(...)` three
//!   times per activation (matching solo's `MISSILE_SALVO.missileCount = 3`)
//!   with angle offsets fanning across the ship's heading, and emits
//!   a spawn event so the WASM client mirrors each missile.
//!
//! Date: 2026-05-19.

use serde::{Deserialize, Serialize};

use crate::trig::{atan2_64, cos64, sin64, PI, TAU};

/// Default missile speed (px/tick at 60 Hz). Slightly slower than
/// aimed enemy bullets (4.5 px/tick) so the salvo reads as a managed
/// threat the player can track visually, not a delete-instantly beam.
/// Solo's `weapon-data.js` MISSILE_SALVO.missileSpeed is `4`, but solo
/// runs the homing in ms-time per-frame; in tick-time the perceived
/// motion at 3.0 px/tick is comparable.
pub const PLAYER_MISSILE_DEFAULT_SPEED: f64 = 3.0;

/// Default damage to an enemy on contact. Mirrors solo's
/// `weapon-data.js` MISSILE_SALVO.missileDamage = 1.5 exactly — a
/// spammy salvo of 3 missiles delivering ~4.5 total damage on a
/// full-hit cluster.
pub const PLAYER_MISSILE_DEFAULT_DAMAGE: f64 = 1.5;

/// Default collision radius (px). Same as the enemy missile — homing
/// projectiles don't need a fat hitbox.
pub const PLAYER_MISSILE_DEFAULT_RADIUS: f64 = 8.0;

/// Default lifetime in ticks (~5 s at 60 Hz). Long enough to chase
/// across the field; short enough to keep the sim's active-projectile
/// count bounded.
pub const PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS: u32 = 300;

/// Max radians the missile can rotate its velocity heading toward
/// its target per tick. ~0.04 rad/tick ≈ 2.3°/tick ≈ 140°/sec at
/// 60 Hz. Solo's `missileHomingStrength` is 0.18 applied as a unit
/// lerp `t`; this is an absolute clamp roughly equivalent at the
/// missile's typical chase distance.
pub const PLAYER_MISSILE_TURN_RATE: f64 = 0.04;

/// Deterministic player-owned homing missile. Same wire shape as
/// `EnemyMissileState` modulo the owner-id flavor; the homing happens
/// entirely in `update_missile`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PlayerMissileState {
    /// Server-assigned missile id; stable from spawn through hit/expiry.
    pub id: u32,
    /// Player id of the launcher (for kill-credit and friendly-fire
    /// filtering in collision).
    pub owner_player_id: u32,
    /// World x in pixels.
    pub x: f64,
    /// World y in pixels.
    pub y: f64,
    /// Per-tick x velocity (px/tick). Recomputed each tick from the
    /// homed heading × speed.
    pub vx: f64,
    /// Per-tick y velocity (px/tick).
    pub vy: f64,
    /// Damage dealt to an enemy on contact.
    pub damage: f64,
    /// Collision radius.
    pub radius: f64,
    /// Lifetime in ticks remaining. Decrements each tick; missile
    /// dies at 0.
    pub life_remaining: u32,
    /// Whether the missile is still alive in the sim.
    pub active: bool,
}

impl PlayerMissileState {
    /// True if this missile should be culled at the next retain pass.
    pub fn dead(&self) -> bool {
        !self.active || self.life_remaining == 0
    }

    /// Current heading derived from velocity. Uses `trig::atan2_64`
    /// so server + client agree to the bit.
    pub fn heading(&self) -> f64 {
        atan2_64(self.vy, self.vx)
    }
}

/// Spawn one homing missile aimed at `initial_angle` from the
/// launcher's position. Both server and WASM client construct from
/// identical inputs and produce bit-identical state.
///
/// Caller (Wave 2 MISSILE_SALVO power-weapon dispatcher) is responsible for:
/// - picking `initial_angle` (typically `ship.angle + slot_offset`
///   where slot ∈ {-1, 0, +1} for a 3-missile fan)
/// - assigning `id` from `room.next_player_missile_id`
/// - pushing onto `RoomState.player_missiles`
/// - emitting `EventPayload::PlayerMissileSpawn` so the WASM client
///   mirrors each launch
pub fn spawn(
    id: u32,
    owner_player_id: u32,
    origin_x: f64,
    origin_y: f64,
    initial_angle: f64,
    speed: f64,
    damage: f64,
    radius: f64,
    lifetime_ticks: u32,
) -> PlayerMissileState {
    PlayerMissileState {
        id,
        owner_player_id,
        x: origin_x,
        y: origin_y,
        vx: cos64(initial_angle) * speed,
        vy: sin64(initial_angle) * speed,
        damage,
        radius,
        life_remaining: lifetime_ticks,
        active: true,
    }
}

/// Convenience: spawn a missile with all module defaults (speed,
/// damage, radius, lifetime). Used by the MISSILE_SALVO power-weapon
/// dispatcher — called 3 times per activation with angle offsets to
/// fan the salvo.
pub fn spawn_default(
    id: u32,
    owner_player_id: u32,
    origin_x: f64,
    origin_y: f64,
    initial_angle: f64,
) -> PlayerMissileState {
    spawn(
        id,
        owner_player_id,
        origin_x,
        origin_y,
        initial_angle,
        PLAYER_MISSILE_DEFAULT_SPEED,
        PLAYER_MISSILE_DEFAULT_DAMAGE,
        PLAYER_MISSILE_DEFAULT_RADIUS,
        PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
    )
}

/// Per-tick update: lifetime → home → drift → off-field cull.
///
/// `enemies` is the room's enemies slice (caller must order identically
/// on server + client; see module-header determinism contract).
/// Only `active` enemies are considered as homing targets.
pub fn update_missile(
    m: &mut PlayerMissileState,
    enemies: &[super::enemy::EnemyState],
    field_w: f64,
    field_h: f64,
) {
    if !m.active {
        return;
    }

    // Lifetime tick (decrement to zero → cull).
    if m.life_remaining == 0 {
        m.active = false;
        return;
    }
    m.life_remaining -= 1;
    if m.life_remaining == 0 {
        m.active = false;
        return;
    }

    // Home: pick closest alive enemy and rotate current heading toward
    // it, clamped to PLAYER_MISSILE_TURN_RATE.
    //
    // sqrt here only re-projects velocity onto the new heading at the
    // SAME magnitude — IEEE 754 sqrt is correctly rounded and bit-exact
    // across native + WASM runtimes (unlike sin/cos), so this preserves
    // determinism. The homing decision itself is sqrt-free (squared
    // distance comparison in `closest_alive_enemy`).
    let speed = (m.vx * m.vx + m.vy * m.vy).sqrt();
    if let Some((tx, ty)) = closest_alive_enemy(enemies, m.x, m.y) {
        let current = atan2_64(m.vy, m.vx);
        let desired = atan2_64(ty - m.y, tx - m.x);
        let new_heading = lerp_angle_clamped(current, desired, PLAYER_MISSILE_TURN_RATE);
        m.vx = cos64(new_heading) * speed;
        m.vy = sin64(new_heading) * speed;
    }
    // No live enemies → keep current vx/vy; missile coasts.

    // Drift.
    m.x += m.vx;
    m.y += m.vy;

    // Off-field cull. Player missiles do NOT wrap (same contract as
    // `enemy_missile`) — they fly off the field and despawn at the edge.
    let r = m.radius;
    if m.x < -r || m.x > field_w + r || m.y < -r || m.y > field_h + r {
        m.active = false;
    }
}

/// Internal: closest alive enemy by squared distance. Tie-break on
/// lower slice index (the first equally-close enemy wins). Returns
/// `None` when the slice is empty or every enemy is downed.
///
/// Returns `(x, y)` of the picked enemy rather than a reference so
/// the borrow on `enemies` ends with this call.
fn closest_alive_enemy(
    enemies: &[super::enemy::EnemyState],
    x: f64,
    y: f64,
) -> Option<(f64, f64)> {
    let mut best: Option<(f64, f64, f64)> = None; // (d2, ex, ey)
    for e in enemies {
        if !e.active {
            continue;
        }
        let dx = e.x - x;
        let dy = e.y - y;
        let d2 = dx * dx + dy * dy;
        // Strict `<` so the first-seen enemy wins ties — deterministic
        // when caller orders the slice consistently across runtimes.
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, e.x, e.y));
        }
    }
    best.map(|(_, ex, ey)| (ex, ey))
}

/// Internal: rotate `current` toward `desired` by at most `max_step`
/// radians, taking the shortest path around the circle (handles ±π
/// wrap). Mirrors `enemy_missile::lerp_angle_clamped` byte-for-byte —
/// the per-tick clamp model (absolute rad/tick, not a unit lerp `t`).
fn lerp_angle_clamped(current: f64, desired: f64, max_step: f64) -> f64 {
    let mut d = desired - current;
    // Wrap into (-π, π] so we always turn the short way.
    while d > PI {
        d -= TAU;
    }
    while d < -PI {
        d += TAU;
    }
    if d > max_step {
        current + max_step
    } else if d < -max_step {
        current - max_step
    } else {
        current + d
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::EnemyState;
    use crate::trig::PI_2;

    /// Build a minimal `EnemyState` at (x, y) with `active = alive`.
    /// All other union fields stay at `Default` zeros — they don't
    /// affect homing, which only reads (active, x, y).
    fn enemy(id: u32, x: f64, y: f64, alive: bool) -> EnemyState {
        EnemyState {
            id,
            x,
            y,
            active: alive,
            ..Default::default()
        }
    }

    /// Spawn at angle 0 → position at origin, velocity along +x.
    /// Trig tolerance matches `trig::tests::SIN_ABS_TOLERANCE`
    /// rationale (~3e-5 polynomial worst-case + roundoff). Property
    /// is determinism, not bit-identity with `f64::cos`.
    #[test]
    fn spawn_at_origin_with_velocity() {
        let m = spawn(
            7,
            3,
            100.0,
            200.0,
            0.0,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        assert_eq!(m.id, 7);
        assert_eq!(m.owner_player_id, 3);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 200.0);
        assert!(
            (m.vx - PLAYER_MISSILE_DEFAULT_SPEED).abs() < 1e-4,
            "vx = {}",
            m.vx
        );
        assert!(m.vy.abs() < 1e-4, "vy = {}", m.vy);
        assert_eq!(m.damage, PLAYER_MISSILE_DEFAULT_DAMAGE);
        assert_eq!(m.radius, PLAYER_MISSILE_DEFAULT_RADIUS);
        assert_eq!(m.life_remaining, PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// Convenience constructor wires the module constants. Angle =
    /// π/2 → vx ≈ 0, vy ≈ +PLAYER_MISSILE_DEFAULT_SPEED.
    #[test]
    fn spawn_default_uses_consts() {
        let m = spawn_default(11, 5, 0.0, 0.0, PI_2);
        assert_eq!(m.damage, PLAYER_MISSILE_DEFAULT_DAMAGE);
        assert_eq!(m.radius, PLAYER_MISSILE_DEFAULT_RADIUS);
        assert_eq!(m.life_remaining, PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS);
        assert!(m.vx.abs() < 1e-4, "vx = {} (expected ~0)", m.vx);
        assert!(
            (m.vy - PLAYER_MISSILE_DEFAULT_SPEED).abs() < 1e-4,
            "vy = {} (expected ~{})",
            m.vy,
            PLAYER_MISSILE_DEFAULT_SPEED,
        );
        assert!(m.active);
    }

    /// Two spawns with identical inputs → bit-identical state.
    /// Guards against accidental nondeterminism creeping into
    /// `trig::cos64/sin64`.
    #[test]
    fn spawn_determinism() {
        let a = spawn(
            42,
            1,
            100.0,
            200.0,
            1.234,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        let b = spawn(
            42,
            1,
            100.0,
            200.0,
            1.234,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        assert_eq!(a.vx.to_bits(), b.vx.to_bits(), "vx must be bit-identical");
        assert_eq!(a.vy.to_bits(), b.vy.to_bits(), "vy must be bit-identical");
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
    }

    /// With no enemies, the missile continues on its current heading
    /// unchanged. (vx, vy) after one tick should match (vx, vy) before
    /// — only position drifts.
    #[test]
    fn update_no_enemies_continues_on_heading() {
        let mut m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 500.0,
            y: 500.0,
            vx: 2.0,
            vy: 1.0,
            damage: PLAYER_MISSILE_DEFAULT_DAMAGE,
            radius: PLAYER_MISSILE_DEFAULT_RADIUS,
            life_remaining: PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
            active: true,
        };
        let enemies: [EnemyState; 0] = [];
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert_eq!(m.vx, 2.0, "vx must not change without an enemy");
        assert_eq!(m.vy, 1.0, "vy must not change without an enemy");
        assert_eq!(m.x, 502.0);
        assert_eq!(m.y, 501.0);
    }

    /// Over many ticks with a stationary enemy, the missile's heading
    /// converges toward the enemy direction. Launch perpendicular to
    /// the enemy line and verify the heading swings to point at the
    /// enemy.
    #[test]
    fn update_steers_toward_single_enemy() {
        // Missile at (500, 500) moving +x (heading 0).
        let mut m = spawn(
            1,
            0,
            500.0,
            500.0,
            0.0,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Enemy directly south of missile (perpendicular to heading).
        let enemies = [enemy(0, 500.0, 1000.0, true)];
        // After many ticks, heading should swing toward +y (~π/2).
        // 90° / 0.04 rad/tick ≈ 40 ticks minimum; give plenty of slack
        // because the missile moves and the relative angle drifts.
        for _ in 0..200 {
            update_missile(&mut m, &enemies, 5000.0, 5000.0);
            if !m.active {
                break;
            }
        }
        // After convergence, vy should dominate vx (missile turned south).
        assert!(m.vy > 0.0, "vy = {} should be positive (heading south)", m.vy);
        assert!(
            m.vy.abs() > m.vx.abs(),
            "vy ({}) should dominate vx ({}) after converging",
            m.vy,
            m.vx,
        );
    }

    /// With two enemies, the missile turns toward the closer one.
    /// Near enemy off heading and far enemy directly behind — after
    /// one tick the heading rotates toward the near enemy.
    #[test]
    fn update_picks_closest_enemy() {
        let mut m = spawn(
            1,
            0,
            500.0,
            500.0,
            0.0,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Near enemy south (alive, d=100).
        // Far enemy north (alive, d=2000).
        let enemies = [
            enemy(0, 500.0, 600.0, true),
            enemy(1, 500.0, -1500.0, true),
        ];
        let vy_before = m.vy;
        update_missile(&mut m, &enemies, 5000.0, 5000.0);
        // Should rotate toward the near (south) enemy → vy > 0.
        assert!(
            m.vy > vy_before,
            "vy delta {} should be positive (turning toward near south enemy)",
            m.vy - vy_before,
        );
    }

    /// An inactive enemy is ignored even if it would be closer. The
    /// missile homes on the active enemy instead.
    #[test]
    fn update_skips_inactive_enemy() {
        let mut m = spawn(
            1,
            0,
            500.0,
            500.0,
            0.0,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Closer inactive enemy south.
        // Farther active enemy north — should win.
        let enemies = [
            enemy(0, 500.0, 510.0, false),
            enemy(1, 500.0, 0.0, true),
        ];
        update_missile(&mut m, &enemies, 5000.0, 5000.0);
        // Missile should turn toward north (vy < 0), NOT south.
        assert!(
            m.vy < 0.0,
            "vy = {} should be negative (turning toward active north enemy)",
            m.vy,
        );
    }

    /// Place an enemy 90° off the missile's heading and verify that
    /// one tick rotates the heading by at most `PLAYER_MISSILE_TURN_RATE`.
    #[test]
    fn update_turn_rate_clamped() {
        let mut m = spawn(
            1,
            0,
            500.0,
            500.0,
            0.0,
            PLAYER_MISSILE_DEFAULT_SPEED,
            PLAYER_MISSILE_DEFAULT_DAMAGE,
            PLAYER_MISSILE_DEFAULT_RADIUS,
            PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Enemy directly south (desired heading = π/2, current = 0,
        // delta = π/2 ≈ 1.5708 — well over PLAYER_MISSILE_TURN_RATE).
        let enemies = [enemy(0, 500.0, 1000.0, true)];
        let heading_before = m.heading();
        update_missile(&mut m, &enemies, 5000.0, 5000.0);
        let heading_after = m.heading();
        let delta = (heading_after - heading_before).abs();
        // Tolerance budget: lerp_angle_clamped clamps algebraically to
        // PLAYER_MISSILE_TURN_RATE exactly, but the recovered heading
        // round-trips through cos64 → sin64 → atan2_64, each carrying
        // ~3e-5 polynomial error. 2e-3 fudge covers worst-case sum.
        // PROPERTY: "step never overshoots", not "step is bit-exact".
        let fudge = 2e-3;
        assert!(
            delta <= PLAYER_MISSILE_TURN_RATE + fudge,
            "heading delta {} should be ≤ PLAYER_MISSILE_TURN_RATE ({}) within {}",
            delta,
            PLAYER_MISSILE_TURN_RATE,
            fudge,
        );
        // And it actually rotated near the max (not just by 0).
        assert!(
            delta >= PLAYER_MISSILE_TURN_RATE - fudge,
            "heading delta {} should be near PLAYER_MISSILE_TURN_RATE ({}) within {}",
            delta,
            PLAYER_MISSILE_TURN_RATE,
            fudge,
        );
    }

    /// life_remaining decrements by 1 per update.
    #[test]
    fn update_lifetime_decrements() {
        let mut m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            damage: PLAYER_MISSILE_DEFAULT_DAMAGE,
            radius: PLAYER_MISSILE_DEFAULT_RADIUS,
            life_remaining: 10,
            active: true,
        };
        let enemies: [EnemyState; 0] = [];
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert_eq!(m.life_remaining, 9);
        assert!(m.active);
    }

    /// When life_remaining hits 0, the missile is marked inactive.
    #[test]
    fn lifetime_expires_marks_inactive() {
        // Zero velocity isolates lifetime branch from off-field cull.
        let mut m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            damage: PLAYER_MISSILE_DEFAULT_DAMAGE,
            radius: PLAYER_MISSILE_DEFAULT_RADIUS,
            life_remaining: 3,
            active: true,
        };
        let enemies: [EnemyState; 0] = [];
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert!(m.active, "active after 1 update (life=2)");
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert!(m.active, "active after 2 updates (life=1)");
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert!(!m.active, "inactive after 3 updates (life=0)");
    }

    /// A missile that drifts past the field edge is culled (no wrap).
    #[test]
    fn off_field_culls() {
        let mut m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 1925.0,
            y: 500.0,
            vx: 10.0,
            vy: 0.0,
            damage: PLAYER_MISSILE_DEFAULT_DAMAGE,
            radius: PLAYER_MISSILE_DEFAULT_RADIUS,
            life_remaining: PLAYER_MISSILE_DEFAULT_LIFETIME_TICKS,
            active: true,
        };
        // No enemies → no steering, just drift.
        let enemies: [EnemyState; 0] = [];
        // field_w + radius = 1920 + 8 = 1928; one step at vx=10 takes
        // x to 1935 → past edge → cull.
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert!(!m.active, "should be culled past right edge");
    }

    /// An inactive missile is a no-op — no field changes.
    #[test]
    fn inactive_missile_no_op() {
        let mut m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 100.0,
            y: 100.0,
            vx: 5.0,
            vy: 5.0,
            damage: PLAYER_MISSILE_DEFAULT_DAMAGE,
            radius: PLAYER_MISSILE_DEFAULT_RADIUS,
            life_remaining: 50,
            active: false,
        };
        let enemies = [enemy(0, 200.0, 200.0, true)];
        update_missile(&mut m, &enemies, 1920.0, 1080.0);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 100.0);
        assert_eq!(m.vx, 5.0);
        assert_eq!(m.vy, 5.0);
        assert_eq!(m.life_remaining, 50);
        assert!(!m.active);
    }

    /// `dead()` reflects both inactive and life-zero states.
    #[test]
    fn dead_helper_reflects_state() {
        let alive = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            damage: 0.0,
            radius: 0.0,
            life_remaining: 10,
            active: true,
        };
        assert!(!alive.dead());

        let inactive = PlayerMissileState { active: false, ..alive };
        assert!(inactive.dead());

        let expired = PlayerMissileState { life_remaining: 0, ..alive };
        assert!(expired.dead());

        let both = PlayerMissileState {
            active: false,
            life_remaining: 0,
            ..alive
        };
        assert!(both.dead());
    }

    /// `heading()` reflects current velocity via `trig::atan2_64`.
    #[test]
    fn heading_matches_velocity() {
        let m = PlayerMissileState {
            id: 1,
            owner_player_id: 0,
            x: 0.0,
            y: 0.0,
            vx: 1.0,
            vy: 0.0,
            damage: 0.0,
            radius: 0.0,
            life_remaining: 10,
            active: true,
        };
        assert!(m.heading().abs() < 1e-9, "heading = {} (expected 0)", m.heading());

        let m = PlayerMissileState {
            vx: 0.0,
            vy: 1.0,
            ..m
        };
        assert!(
            (m.heading() - PI_2).abs() < 1e-9,
            "heading = {} (expected π/2)",
            m.heading(),
        );
    }
}
