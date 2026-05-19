//! Phase 4 step 5 — homing enemy missile. Heavy-damage projectile
//! fired by the PROWLER enemy that steers its velocity toward the
//! nearest alive ship each tick. Adds a homing tier above plain
//! `EnemyBulletState` (straight-line ballistic).
//!
//! Differences from `EnemyBulletState`:
//! - Wire shape is functionally identical (id + owner + position +
//!   velocity + damage + radius + life_remaining + active), so Wave 2
//!   collision integration can largely mirror the ship × enemy_bullet
//!   pair logic — but missiles are a separate type because their
//!   per-tick update takes a `&[TargetView]` slice to home.
//! - `update_missile` re-aims heading toward closest alive target
//!   each tick (clamped by `MISSILE_TURN_RATE`), recomputes vx/vy
//!   from the new heading × speed, then drifts.
//!
//! Determinism contract:
//! - NO RNG inside the steering loop. Target pick + heading update
//!   are pure functions of (missile state, targets slice).
//! - Wave 2's dispatcher MUST pass the SAME visible-ships slice on
//!   server and WASM client so trajectories stay bit-identical.
//! - `closest_alive_target` tie-breaks on lower index in the slice
//!   when two targets are equidistant — caller must order the slice
//!   identically on both runtimes (typically: by `player_id` asc).
//! - All trig goes through `trig::cos64` / `sin64` / `atan2_64`
//!   (polynomial, bit-exact cross-runtime).
//!
//! Owned by PROWLER. Wave 2 wires:
//! - `state.rs` adds `enemy_missiles: Vec<EnemyMissileState>` + a
//!   `MAX_ENEMY_MISSILES` cap.
//! - `collision.rs` adds a ship × enemy_missile pair.
//! - `mp1_room.rs` PROWLER fire dispatcher calls `spawn_default(...)`
//!   at the PROWLER's position with `aim_prowler(...)` as the
//!   initial angle and an `EnemyMissileSpawn` event for client mirror.
//!
//! Date: 2026-05-18.

use crate::mp1::trig::{atan2_64, cos64, sin64, PI, TAU};

/// Default missile speed (px/tick at 60 Hz). Faster than aimed
/// bullets (4.5 px/tick) — missiles are a scarier threat by design.
pub const MISSILE_DEFAULT_SPEED: f64 = 3.0;

/// Default damage to a ship on contact. Heavier than a normal enemy
/// bullet (2.0) — missiles are a big-hit projectile.
pub const MISSILE_DEFAULT_DAMAGE: f64 = 5.0;

/// Default collision radius (px). Slightly smaller than the enemy-
/// bullet body — homing means it doesn't need a fat hitbox to hit.
pub const MISSILE_DEFAULT_RADIUS: f64 = 8.0;

/// Default lifetime in ticks (~5 s at 60 Hz). Long enough for a
/// missile to chase across the field; short enough that the sim
/// doesn't accumulate stragglers.
pub const MISSILE_DEFAULT_LIFETIME_TICKS: u32 = 300;

/// Max radians the missile can rotate its velocity heading toward
/// the target per tick. ~0.04 rad/tick ≈ 2.3°/tick ≈ 140°/sec at
/// 60 Hz — homes hard enough to be a threat but not snappy/snap-on.
/// Tunable; intentionally less than HUNTER's ANGLE_TURN_T (0.08)
/// because that's a unit lerp `t`, this is an absolute clamp.
pub const MISSILE_TURN_RATE: f64 = 0.04;

/// Deterministic homing missile state. Same wire shape as
/// `EnemyBulletState`; the homing happens entirely in `update_missile`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EnemyMissileState {
    /// Server-assigned missile id; stable across spawn → hit/expiry.
    pub id: u32,
    /// Enemy id of the launcher (for kill-credit when a ship dies).
    pub owner_enemy_id: u32,
    /// World x in pixels.
    pub x: f64,
    /// World y in pixels.
    pub y: f64,
    /// Per-tick x velocity (px/tick). Recomputed each tick from the
    /// homed heading × speed.
    pub vx: f64,
    /// Per-tick y velocity (px/tick).
    pub vy: f64,
    /// Damage dealt to a ship on contact.
    pub damage: f64,
    /// Collision radius.
    pub radius: f64,
    /// Lifetime in ticks remaining. Decrements each tick; missile
    /// dies at 0.
    pub life_remaining: u32,
    /// Whether the missile is still alive in the sim.
    pub active: bool,
}

impl EnemyMissileState {
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
/// Caller (Wave 2 PROWLER fire dispatcher) is responsible for:
/// - picking `initial_angle` (typically via `enemy_prowler::aim_prowler(...)`)
/// - assigning `id` from `room.next_enemy_missile_id`
/// - pushing onto `RoomState.enemy_missiles`
/// - emitting `EventPayload::EnemyMissileSpawn` so the WASM client mirrors it
pub fn spawn(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    initial_angle: f64,
    speed: f64,
    damage: f64,
    radius: f64,
    lifetime_ticks: u32,
) -> EnemyMissileState {
    EnemyMissileState {
        id,
        owner_enemy_id,
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

/// Convenience: spawn a missile with all defaults (speed, damage,
/// radius, lifetime). Used by the PROWLER fire dispatcher.
pub fn spawn_default(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    initial_angle: f64,
) -> EnemyMissileState {
    spawn(
        id,
        owner_enemy_id,
        origin_x,
        origin_y,
        initial_angle,
        MISSILE_DEFAULT_SPEED,
        MISSILE_DEFAULT_DAMAGE,
        MISSILE_DEFAULT_RADIUS,
        MISSILE_DEFAULT_LIFETIME_TICKS,
    )
}

/// Per-tick update: lifetime → home → drift → off-field cull.
///
/// `targets` is the visible-ships slice (caller must order identically
/// on server + client; see module-header determinism contract).
pub fn update_missile(
    m: &mut EnemyMissileState,
    targets: &[super::enemy::TargetView],
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

    // Home: pick closest alive target and rotate current heading
    // toward it, clamped to MISSILE_TURN_RATE.
    let speed = (m.vx * m.vx + m.vy * m.vy).sqrt();
    if let Some(t) = closest_alive_target(targets, m.x, m.y) {
        // Speed sqrt above uses platform sqrt — but only for re-projection
        // onto the new heading, AFTER homing. The homing step itself is
        // sqrt-free (uses squared distance). The re-projection preserves
        // the missile's launch speed exactly because both server and WASM
        // sqrt the same f64 magnitude. (IEEE 754 sqrt is correctly
        // rounded and bit-exact across compliant runtimes — unlike sin/cos.)
        let current = atan2_64(m.vy, m.vx);
        let desired = atan2_64(t.y - m.y, t.x - m.x);
        let new_heading = lerp_angle_clamped(current, desired, MISSILE_TURN_RATE);
        m.vx = cos64(new_heading) * speed;
        m.vy = sin64(new_heading) * speed;
    }
    // If no live targets, keep current vx/vy — missile coasts.

    // Drift.
    m.x += m.vx;
    m.y += m.vy;

    // Off-field cull. Missiles do NOT wrap (same contract as
    // `enemy_bullet`) — they fly off and despawn at the field edge.
    let r = m.radius;
    if m.x < -r || m.x > field_w + r || m.y < -r || m.y > field_h + r {
        m.active = false;
    }
}

/// Internal: closest alive target by squared distance. Tie-break on
/// lower index (the first equally-close target wins). Returns `None`
/// when the slice is empty or every target is downed.
fn closest_alive_target(
    targets: &[super::enemy::TargetView],
    x: f64,
    y: f64,
) -> Option<super::enemy::TargetView> {
    let mut best: Option<(f64, super::enemy::TargetView)> = None;
    for t in targets {
        if !t.alive {
            continue;
        }
        let dx = t.x - x;
        let dy = t.y - y;
        let d2 = dx * dx + dy * dy;
        // Strict `<` so the first-seen target wins ties — deterministic
        // when caller orders the slice consistently across runtimes.
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, *t));
        }
    }
    best.map(|(_, t)| t)
}

/// Internal: rotate `current` toward `desired` by at most `max_step`
/// radians, taking the shortest path around the circle (handles ±π
/// wrap). Similar to `enemy::lerp_angle` but uses an absolute clamp
/// instead of a unit `t` — the missile can rotate up to `max_step`
/// per tick, no more.
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
    use crate::mp1::enemy::TargetView;
    use crate::mp1::trig::PI_2;

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView { player_id, x, y, alive }
    }

    /// Spawn at angle 0 → position at origin, velocity along +x.
    /// Trig tolerance matches polynomial worst-case (~3e-5; see
    /// `trig::tests::SIN_ABS_TOLERANCE` rationale). Property is
    /// determinism, not bit-identity with `f64::cos`.
    #[test]
    fn spawn_at_origin_with_velocity() {
        let m = spawn(
            7, 3, 100.0, 200.0, 0.0,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        assert_eq!(m.id, 7);
        assert_eq!(m.owner_enemy_id, 3);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 200.0);
        assert!((m.vx - MISSILE_DEFAULT_SPEED).abs() < 1e-4, "vx = {}", m.vx);
        assert!(m.vy.abs() < 1e-4, "vy = {}", m.vy);
        assert_eq!(m.damage, MISSILE_DEFAULT_DAMAGE);
        assert_eq!(m.radius, MISSILE_DEFAULT_RADIUS);
        assert_eq!(m.life_remaining, MISSILE_DEFAULT_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// Convenience constructor wires the module constants. Angle =
    /// π/2 → vx ≈ 0, vy ≈ +MISSILE_DEFAULT_SPEED.
    #[test]
    fn spawn_default_uses_consts() {
        let m = spawn_default(11, 5, 0.0, 0.0, PI_2);
        assert_eq!(m.damage, MISSILE_DEFAULT_DAMAGE);
        assert_eq!(m.radius, MISSILE_DEFAULT_RADIUS);
        assert_eq!(m.life_remaining, MISSILE_DEFAULT_LIFETIME_TICKS);
        assert!(m.vx.abs() < 1e-4, "vx = {} (expected ~0)", m.vx);
        assert!(
            (m.vy - MISSILE_DEFAULT_SPEED).abs() < 1e-4,
            "vy = {} (expected ~{})", m.vy, MISSILE_DEFAULT_SPEED,
        );
        assert!(m.active);
    }

    /// Two spawns with identical inputs → bit-identical state.
    /// Guards against accidental nondeterminism creeping into
    /// trig::cos64/sin64.
    #[test]
    fn spawn_determinism() {
        let a = spawn(
            42, 1, 100.0, 200.0, 1.234,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        let b = spawn(
            42, 1, 100.0, 200.0, 1.234,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        assert_eq!(a.vx.to_bits(), b.vx.to_bits(), "vx must be bit-identical");
        assert_eq!(a.vy.to_bits(), b.vy.to_bits(), "vy must be bit-identical");
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
    }

    /// With no targets, the missile continues on its current heading
    /// unchanged. (vx, vy) after one tick should match (vx, vy)
    /// before — only position drifts.
    #[test]
    fn update_no_targets_continues_on_heading() {
        let mut m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 500.0, y: 500.0,
            vx: 2.0, vy: 1.0,
            damage: MISSILE_DEFAULT_DAMAGE,
            radius: MISSILE_DEFAULT_RADIUS,
            life_remaining: MISSILE_DEFAULT_LIFETIME_TICKS,
            active: true,
        };
        let targets: [TargetView; 0] = [];
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert_eq!(m.vx, 2.0, "vx must not change without a target");
        assert_eq!(m.vy, 1.0, "vy must not change without a target");
        assert_eq!(m.x, 502.0);
        assert_eq!(m.y, 501.0);
    }

    /// Over many ticks with a stationary target, the missile's
    /// heading converges toward the target direction. We launch
    /// perpendicular to the target line and verify that after enough
    /// ticks the heading is pointed (approximately) at the target.
    #[test]
    fn update_steers_toward_single_target() {
        // Missile at (500, 500) moving +x (heading 0).
        let mut m = spawn(
            1, 0, 500.0, 500.0, 0.0,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Target directly south of missile (perpendicular to heading).
        let targets = [target(0, 500.0, 1000.0, true)];
        // After many ticks, heading should swing toward +y (~π/2).
        // 90° / 0.04 rad/tick ≈ 40 ticks minimum; the target moves
        // relative as the missile moves, so give plenty of slack.
        for _ in 0..200 {
            update_missile(&mut m, &targets, 5000.0, 5000.0);
            if !m.active { break; }
        }
        // Heading should be pointing roughly toward target (downward).
        // After convergence, vy should dominate vx (missile turned south).
        assert!(
            m.vy > 0.0,
            "vy = {} should be positive (heading south)", m.vy,
        );
        assert!(
            m.vy.abs() > m.vx.abs(),
            "vy ({}) should dominate vx ({}) after converging",
            m.vy, m.vx,
        );
    }

    /// With two targets, the missile turns toward the closer one.
    /// Place a near target slightly off heading and a far target
    /// directly behind; after one tick the heading should rotate
    /// toward the near target, not the far.
    #[test]
    fn update_picks_closest_target() {
        let mut m = spawn(
            1, 0, 500.0, 500.0, 0.0,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Near target south (alive, d=100).
        // Far target north (alive, d=2000).
        let targets = [
            target(0, 500.0, 600.0, true),
            target(1, 500.0, -1500.0, true),
        ];
        let vy_before = m.vy;
        update_missile(&mut m, &targets, 5000.0, 5000.0);
        // Should rotate toward the near (south) target → vy > 0.
        assert!(
            m.vy > vy_before,
            "vy delta {} should be positive (turning toward near south target)",
            m.vy - vy_before,
        );
    }

    /// A downed target is ignored even if it would be closer. The
    /// missile homes on the alive target instead.
    #[test]
    fn update_skips_downed_targets() {
        let mut m = spawn(
            1, 0, 500.0, 500.0, 0.0,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Closer downed target south.
        // Farther alive target north — should win.
        let targets = [
            target(0, 500.0, 510.0, false),
            target(1, 500.0, 0.0, true),
        ];
        update_missile(&mut m, &targets, 5000.0, 5000.0);
        // Missile should turn toward north (vy < 0), NOT south.
        assert!(
            m.vy < 0.0,
            "vy = {} should be negative (turning toward alive north target, ignoring downed south)",
            m.vy,
        );
    }

    /// Place a target 90° off the missile's heading and verify that
    /// one tick rotates the heading by at most MISSILE_TURN_RATE.
    #[test]
    fn update_turn_rate_is_clamped() {
        let mut m = spawn(
            1, 0, 500.0, 500.0, 0.0,
            MISSILE_DEFAULT_SPEED, MISSILE_DEFAULT_DAMAGE,
            MISSILE_DEFAULT_RADIUS, MISSILE_DEFAULT_LIFETIME_TICKS,
        );
        // Target directly south (desired heading = π/2, current = 0,
        // delta = π/2 ≈ 1.5708 — well over MISSILE_TURN_RATE).
        let targets = [target(0, 500.0, 1000.0, true)];
        let heading_before = m.heading();
        update_missile(&mut m, &targets, 5000.0, 5000.0);
        let heading_after = m.heading();
        let delta = (heading_after - heading_before).abs();
        // Tolerance budget: lerp_angle_clamped clamps algebraically
        // to MISSILE_TURN_RATE exactly, but the recovered heading
        // round-trips through cos64 → sin64 → atan2_64, each
        // carrying ~3e-5 polynomial error (see trig::tests::
        // SIN_ABS_TOLERANCE rationale). A 2e-3 fudge covers the
        // worst-case sum cleanly. The PROPERTY being asserted is
        // "step never overshoots" not "step is bit-exact".
        let fudge = 2e-3;
        assert!(
            delta <= MISSILE_TURN_RATE + fudge,
            "heading delta {} should be ≤ MISSILE_TURN_RATE ({}) within {}",
            delta, MISSILE_TURN_RATE, fudge,
        );
        // And it actually rotated by close to the max (not just by 0).
        assert!(
            delta >= MISSILE_TURN_RATE - fudge,
            "heading delta {} should be near MISSILE_TURN_RATE ({}) within {}",
            delta, MISSILE_TURN_RATE, fudge,
        );
    }

    /// life_remaining decrements by 1 per update.
    #[test]
    fn update_lifetime_decrements() {
        let mut m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 500.0, y: 500.0,
            vx: 0.0, vy: 0.0,
            damage: MISSILE_DEFAULT_DAMAGE,
            radius: MISSILE_DEFAULT_RADIUS,
            life_remaining: 10,
            active: true,
        };
        let targets: [TargetView; 0] = [];
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert_eq!(m.life_remaining, 9);
        assert!(m.active);
    }

    /// When life_remaining hits 0, the missile is marked inactive.
    #[test]
    fn lifetime_expires_marks_inactive() {
        // Zero velocity isolates lifetime branch from off-field cull.
        let mut m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 500.0, y: 500.0,
            vx: 0.0, vy: 0.0,
            damage: MISSILE_DEFAULT_DAMAGE,
            radius: MISSILE_DEFAULT_RADIUS,
            life_remaining: 3,
            active: true,
        };
        let targets: [TargetView; 0] = [];
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert!(m.active, "active after 1 update (life=2)");
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert!(m.active, "active after 2 updates (life=1)");
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert!(!m.active, "inactive after 3 updates (life=0)");
    }

    /// A missile that drifts past the field edge is culled (no wrap).
    #[test]
    fn off_field_culls() {
        let mut m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 1925.0, y: 500.0,
            vx: 10.0, vy: 0.0,
            damage: MISSILE_DEFAULT_DAMAGE,
            radius: MISSILE_DEFAULT_RADIUS,
            life_remaining: MISSILE_DEFAULT_LIFETIME_TICKS,
            active: true,
        };
        // No targets → no steering, just drift.
        let targets: [TargetView; 0] = [];
        // field_w + radius = 1920 + 8 = 1928; one step at vx=10
        // takes x to 1935 → past edge → cull.
        update_missile(&mut m, &targets, 1920.0, 1080.0);
        assert!(!m.active, "should be culled past right edge");
    }

    /// An inactive missile is a no-op — no field changes.
    #[test]
    fn inactive_missile_no_op() {
        let mut m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 100.0, y: 100.0,
            vx: 5.0, vy: 5.0,
            damage: MISSILE_DEFAULT_DAMAGE,
            radius: MISSILE_DEFAULT_RADIUS,
            life_remaining: 50,
            active: false,
        };
        let targets = [target(0, 200.0, 200.0, true)];
        update_missile(&mut m, &targets, 1920.0, 1080.0);
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
        let alive = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 0.0, y: 0.0, vx: 0.0, vy: 0.0,
            damage: 0.0, radius: 0.0,
            life_remaining: 10,
            active: true,
        };
        assert!(!alive.dead());

        let inactive = EnemyMissileState { active: false, ..alive };
        assert!(inactive.dead());

        let expired = EnemyMissileState { life_remaining: 0, ..alive };
        assert!(expired.dead());

        let both = EnemyMissileState { active: false, life_remaining: 0, ..alive };
        assert!(both.dead());
    }

    /// `heading()` reflects current velocity via `trig::atan2_64`.
    #[test]
    fn heading_matches_velocity() {
        let m = EnemyMissileState {
            id: 1, owner_enemy_id: 0,
            x: 0.0, y: 0.0,
            vx: 1.0, vy: 0.0,
            damage: 0.0, radius: 0.0,
            life_remaining: 10,
            active: true,
        };
        assert!(m.heading().abs() < 1e-9, "heading = {} (expected 0)", m.heading());

        let m = EnemyMissileState { vx: 0.0, vy: 1.0, ..m };
        assert!(
            (m.heading() - PI_2).abs() < 1e-9,
            "heading = {} (expected π/2)", m.heading(),
        );
    }
}
