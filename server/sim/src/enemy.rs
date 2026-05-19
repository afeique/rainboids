//! Phase 3 enemy sim — HUNTER chase + arc-orbit.
//!
//! Fresh rewrite from solo's `js/modules/enemy/{enemy-data,movement,
//! ai}.js`. Deterministic: every random draw goes through
//! `RngCtx` (seeded per-spawn from the `EnemySpawn` event's
//! `rng_subseed`), and every trig op goes through `super::trig::*`
//! (polynomial-bit-exact across native + WASM).
//!
//! Phase 3 ships ONE enemy kind: HUNTER. Reserves kind discriminator
//! 0 for HUNTER; 1+ left open for Phase 4 enemies (GUARDIAN, WASP,
//! STALKER, ...). No enemy-bullet firing in Phase 3 — body-collision
//! damage only.
//!
//! Behavioral deviations from solo's `hunterArcMovement` (intentional,
//! determinism-driven):
//!   - No `frameClock.now`-based lunge/slingshot dice. Solo rolls
//!     these against wall-clock; the sim has no wall-clock. Phase 3
//!     keeps the orbit's core read (one-way strafe at a chosen
//!     radius/omega around the closest player) and drops the
//!     stochastic per-tick state.
//!   - No velocity damping/friction (`vel *= 0.92`). The Phase 3
//!     enemy moves at constant `HUNTER_BASE_SPEED` along its facing
//!     vector; the arc emerges from the offset chase-target, not
//!     from accumulated velocity. Same visual read with a simpler
//!     state vector.
//!   - Angle is lerped toward the desired heading at `t = 0.08` per
//!     tick (solo's `turnSpeed`). Mirrors solo's `updateFaceDirection`
//!     turn rate so the visual feel ports forward.

use serde::{Deserialize, Serialize};

use super::trig;

/// HUNTER kind discriminator. Reserves 0-9 for future enemy kinds
/// (GUARDIAN=1, WASP=2, ...) when Phase 4+ ports them.
pub const KIND_HUNTER: u8 = 0;

/// Base HP for a HUNTER. 3 PULSE_CANNON hits at 1.2 dmg = 3.6 > 3.0.
pub const HUNTER_MAX_HP: f64 = 3.0;
/// Body radius (px). Matches solo's HUNTER `size` (visual + collider).
pub const HUNTER_RADIUS: f64 = 18.0;
/// Movement speed (px/tick at 60 Hz).
pub const HUNTER_BASE_SPEED: f64 = 1.4;
/// Minimum arc-orbit radius (px) — closest the orbit pulls in.
pub const HUNTER_ARC_RADIUS_MIN: f64 = 120.0;
/// Maximum arc-orbit radius (px) — widest the orbit swings out.
pub const HUNTER_ARC_RADIUS_MAX: f64 = 200.0;
/// Upper bound on arc-orbit angular velocity (radians/tick).
pub const HUNTER_ARC_OMEGA_RANGE: f64 = 0.02;
/// Contact damage dealt to a ship on body-touch (Phase 3 only damage source).
pub const HUNTER_CONTACT_DAMAGE: f64 = 5.0;

/// Lerp factor used to turn the enemy's facing angle toward its
/// desired heading per tick. 0.08 mirrors solo's
/// `enemy.turnSpeed = 0.08` in `js/modules/enemy/enemy.js`.
const ANGLE_TURN_T: f64 = 0.08;

/// Lightweight read-only view of a ship that an enemy can target.
/// Caller passes a slice of these built from the room's active
/// ships — keeps enemy update decoupled from RoomState shape.
#[derive(Debug, Clone, Copy)]
pub struct TargetView {
    /// Server-assigned player id (stable for the ship's session).
    pub player_id: u32,
    /// Ship x position (px, field-local).
    pub x: f64,
    /// Ship y position (px, field-local).
    pub y: f64,
    /// True if the ship is alive + targetable. Downed ships are skipped.
    pub alive: bool,
}

/// Deterministic enemy state. Serialized verbatim into snapshot /
/// checksum payloads. Every field is f64 or a fixed-width int —
/// no `String`s, no `Vec`s — so wire size is constant per enemy.
///
/// **Phase 4 step 5** — this struct unifies all 10 enemy kinds. Each
/// kind reads/writes only the per-kind movement-state fields relevant
/// to it; unused fields default to `0.0` / `0`. The union approach
/// (instead of a tagged enum) keeps the wire shape constant per enemy
/// and avoids serialization complexity. Memory cost is ~64 extra bytes
/// per enemy, trivial at `MAX_ENEMIES = 4`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EnemyState {
    /// Server-assigned enemy id (stable for the enemy's lifetime).
    pub id: u32,
    /// Kind discriminator. See `KIND_HUNTER`, `enemy_wasp::KIND_WASP`,
    /// etc. for the dense u8 enumeration (0-9 across the 10 kinds).
    pub kind: u8,
    /// X position (px, field-local).
    pub x: f64,
    /// Y position (px, field-local).
    pub y: f64,
    /// X velocity component (px/tick).
    pub vx: f64,
    /// Y velocity component (px/tick).
    pub vy: f64,
    /// Face-direction in radians (lerped toward desired heading).
    pub angle: f64,
    /// Current HP (depletes on bullet hits; <= 0 → `active = false`).
    pub hp: f64,
    /// Max HP at spawn — used for HP-bar rendering.
    pub max_hp: f64,
    /// Body radius (px) for collision + visuals.
    pub radius: f64,
    /// True while alive + in the field; false after destroy.
    pub active: bool,
    /// Phase 4 — tick at which this enemy last fired. Per-kind cooldown
    /// is consulted via the per-module `XXX_FIRE_COOLDOWN_TICKS` const.
    pub last_fire_tick: u32,

    // ── Arc-orbit fields (HUNTER, STALKER, WEAVER, SENTINEL) ──
    /// Arc-orbit direction: +1 = orbit clockwise, -1 = counterclockwise.
    /// Seeded at spawn; never changes during life.
    pub arc_dir: f64,
    /// Arc-orbit radius (px). Seeded at spawn.
    pub arc_radius: f64,
    /// Arc-orbit angular velocity (radians/tick). Seeded at spawn.
    pub arc_omega: f64,
    /// Current arc-orbit phase angle (radians). Advances by arc_omega per tick.
    pub arc_phase: f64,

    // ── WASP zigzag ──
    pub zigzag_phase: f64,
    pub zigzag_amplitude: f64,

    // ── GUARDIAN square-perimeter ──
    pub square_corner_idx: u8,
    pub square_dir: f64,

    // ── STALKER charged-laser ──
    pub charge_progress: u32,

    // ── DRIFTER sinusoidal wave ──
    pub wave_phase: f64,
    pub wave_amplitude: f64,

    // ── WEAVER / SENTINEL spinup + orbit ──
    pub spinup_progress: u32,
    pub orbit_phase: f64,
    /// WEAVER spiral fire phase (advances per shot). Also reused for
    /// SENTINEL sweep_phase to keep the struct compact — kind dictates
    /// which semantics apply.
    pub spiral_phase: f64,
    /// SENTINEL / TITAN sweep oscillation phase (advances per tick).
    pub sweep_phase: f64,

    // ── TITAN momentum-based boulder movement ──
    pub momentum_dir: f64,
    pub momentum_t: f64,
}

impl Default for EnemyState {
    /// Zero-initialized enemy. Per-kind `spawn_xxx_from_seed` populates
    /// the relevant fields; unused fields remain at 0.0/0/false.
    fn default() -> Self {
        Self {
            id: 0,
            kind: 0,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: 0.0,
            max_hp: 0.0,
            radius: 0.0,
            active: false,
            last_fire_tick: 0,
            arc_dir: 0.0,
            arc_radius: 0.0,
            arc_omega: 0.0,
            arc_phase: 0.0,
            zigzag_phase: 0.0,
            zigzag_amplitude: 0.0,
            square_corner_idx: 0,
            square_dir: 0.0,
            charge_progress: 0,
            wave_phase: 0.0,
            wave_amplitude: 0.0,
            spinup_progress: 0,
            orbit_phase: 0.0,
            spiral_phase: 0.0,
            sweep_phase: 0.0,
            momentum_dir: 0.0,
            momentum_t: 0.0,
        }
    }
}

/// Spawn a HUNTER at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce the same enemy.
pub fn spawn_hunter_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    // Per-spawn RngCtx, seeded by the event's sub-seed. Sub-seed is
    // generated by the room's main `RngCtx` and shipped on the wire,
    // so server + client construct identical streams here without
    // contaminating the room's main RNG state.
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the enemy just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -HUNTER_RADIUS,
            0.0,
            HUNTER_BASE_SPEED,
        ),
        1 => (
            field_w + HUNTER_RADIUS,
            rng.range_f64(0.0, field_h),
            -HUNTER_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + HUNTER_RADIUS,
            0.0,
            -HUNTER_BASE_SPEED,
        ),
        _ => (
            -HUNTER_RADIUS,
            rng.range_f64(0.0, field_h),
            HUNTER_BASE_SPEED,
            0.0,
        ),
    };

    // Sticky one-way strafe direction (solo's `_arcDirection`).
    let arc_dir = if rng.range_f64(0.0, 1.0) < 0.5 { -1.0 } else { 1.0 };
    let arc_radius = rng.range_f64(HUNTER_ARC_RADIUS_MIN, HUNTER_ARC_RADIUS_MAX);
    // Lower bound 0.005 matches the solo lower bound (slowest orbit ~
    // 0.3°/tick); upper bound caps at HUNTER_ARC_OMEGA_RANGE.
    let arc_omega = rng.range_f64(0.005, HUNTER_ARC_OMEGA_RANGE);
    let arc_phase = rng.unit_circle_angle();

    EnemyState {
        id,
        kind: KIND_HUNTER,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: HUNTER_MAX_HP,
        max_hp: HUNTER_MAX_HP,
        radius: HUNTER_RADIUS,
        arc_dir,
        arc_radius,
        arc_omega,
        arc_phase,
        active: true,
        last_fire_tick: 0,
        ..EnemyState::default()
    }
}

/// Per-tick enemy update dispatcher — routes to the per-kind module's
/// `update_xxx_movement` function based on `e.kind`. Phase 4 step 5
/// added the 9 non-HUNTER kinds; each has its own movement-pattern
/// module under `sim::enemy_{wasp,guardian,stalker,...}`.
pub fn update_enemy(e: &mut EnemyState, targets: &[TargetView], field_w: f64, field_h: f64) {
    if !e.active {
        return;
    }
    match e.kind {
        KIND_HUNTER => update_hunter_movement(e, targets, field_w, field_h),
        k if k == super::enemy_wasp::KIND_WASP => {
            super::enemy_wasp::update_wasp_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_guardian::KIND_GUARDIAN => {
            super::enemy_guardian::update_guardian_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_stalker::KIND_STALKER => {
            super::enemy_stalker::update_stalker_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_drifter::KIND_DRIFTER => {
            super::enemy_drifter::update_drifter_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_prowler::KIND_PROWLER => {
            super::enemy_prowler::update_prowler_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_weaver::KIND_WEAVER => {
            super::enemy_weaver::update_weaver_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_sentinel::KIND_SENTINEL => {
            super::enemy_sentinel::update_sentinel_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_tangerine::KIND_TANGERINE => {
            super::enemy_tangerine::update_tangerine_movement(e, targets, field_w, field_h)
        }
        k if k == super::enemy_titan::KIND_TITAN => {
            super::enemy_titan::update_titan_movement(e, targets, field_w, field_h)
        }
        _ => {} // unknown kind — no-op
    }
}

/// HUNTER-specific per-tick update. Picks closest alive ship as
/// target, runs arc-orbit chase, clamps to field, bounces off
/// edges. Mirrors solo's `hunterArcMovement` + `chasePlayer` pattern
/// from `movement.js` / `ai.js`.
fn update_hunter_movement(
    e: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !e.active || e.kind != KIND_HUNTER {
        return;
    }

    // Pick closest alive target. If none, drift toward field center.
    let target = closest_target(targets, e.x, e.y);

    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    // Arc-orbit chase: target a point offset from the player along
    // the arc, rather than the player directly. The orbit phase
    // advances by `arc_omega * arc_dir` each tick — sticky CW/CCW
    // strafe (solo's `_arcDirection`).
    e.arc_phase += e.arc_omega * e.arc_dir;
    let arc_offset_x = trig::cos64(e.arc_phase) * e.arc_radius;
    let arc_offset_y = trig::sin64(e.arc_phase) * e.arc_radius;
    let chase_target_x = tx + arc_offset_x;
    let chase_target_y = ty + arc_offset_y;

    let to_dx = chase_target_x - e.x;
    let to_dy = chase_target_y - e.y;
    let desired_angle = trig::atan2_64(to_dy, to_dx);

    // Smoothly turn toward the desired angle (avoid snap-rotation).
    e.angle = lerp_angle(e.angle, desired_angle, ANGLE_TURN_T);

    // Velocity along facing. Constant speed — no friction term; the
    // arc emerges from the offset chase-target.
    e.vx = trig::cos64(e.angle) * HUNTER_BASE_SPEED;
    e.vy = trig::sin64(e.angle) * HUNTER_BASE_SPEED;

    e.x += e.vx;
    e.y += e.vy;

    // Bounce off field edges (matches solo's boundary clamp).
    let r = e.radius;
    if e.x - r < 0.0 {
        e.x = r;
        e.vx = e.vx.abs();
    } else if e.x + r > field_w {
        e.x = field_w - r;
        e.vx = -e.vx.abs();
    }
    if e.y - r < 0.0 {
        e.y = r;
        e.vy = e.vy.abs();
    } else if e.y + r > field_h {
        e.y = field_h - r;
        e.vy = -e.vy.abs();
    }
}

/// Internal: find the closest alive target. `None` if all dead/empty.
fn closest_target(targets: &[TargetView], x: f64, y: f64) -> Option<TargetView> {
    let mut best: Option<(f64, TargetView)> = None;
    for t in targets {
        if !t.alive {
            continue;
        }
        let dx = t.x - x;
        let dy = t.y - y;
        let d2 = dx * dx + dy * dy;
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, *t));
        }
    }
    best.map(|(_, t)| t)
}

/// Internal: angle lerp via shortest path (handles ±π wrap so the
/// turn always takes the short way around the circle).
fn lerp_angle(a: f64, b: f64, t: f64) -> f64 {
    let mut d = b - a;
    while d > trig::PI {
        d -= trig::TAU;
    }
    while d < -trig::PI {
        d += trig::TAU;
    }
    a + d * t
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView {
            player_id,
            x,
            y,
            alive,
        }
    }

    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_hunter_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_hunter_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        assert_eq!(a.id, b.id);
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.vx.to_bits(), b.vx.to_bits());
        assert_eq!(a.vy.to_bits(), b.vy.to_bits());
        assert_eq!(a.angle.to_bits(), b.angle.to_bits());
        assert_eq!(a.hp.to_bits(), b.hp.to_bits());
        assert_eq!(a.max_hp.to_bits(), b.max_hp.to_bits());
        assert_eq!(a.radius.to_bits(), b.radius.to_bits());
        assert_eq!(a.arc_dir.to_bits(), b.arc_dir.to_bits());
        assert_eq!(a.arc_radius.to_bits(), b.arc_radius.to_bits());
        assert_eq!(a.arc_omega.to_bits(), b.arc_omega.to_bits());
        assert_eq!(a.arc_phase.to_bits(), b.arc_phase.to_bits());
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let e = spawn_hunter_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            // The enemy is at one of the four edges. On the spawning
            // axis it sits exactly ±HUNTER_RADIUS outside the field;
            // on the orthogonal axis it sits inside [0, field].
            let at_top = (e.y - (-HUNTER_RADIUS)).abs() < 1e-9;
            let at_right = (e.x - (fw + HUNTER_RADIUS)).abs() < 1e-9;
            let at_bottom = (e.y - (fh + HUNTER_RADIUS)).abs() < 1e-9;
            let at_left = (e.x - (-HUNTER_RADIUS)).abs() < 1e-9;
            assert!(
                at_top || at_right || at_bottom || at_left,
                "seed {seed}: not at an edge — pos=({}, {})",
                e.x,
                e.y
            );
            if at_top || at_bottom {
                assert!(e.x >= 0.0 && e.x <= fw, "seed {seed}: x out of field");
            }
            if at_left || at_right {
                assert!(e.y >= 0.0 && e.y <= fh, "seed {seed}: y out of field");
            }
            // Arc params seeded into expected ranges.
            assert!(e.arc_dir == 1.0 || e.arc_dir == -1.0);
            assert!(e.arc_radius >= HUNTER_ARC_RADIUS_MIN && e.arc_radius < HUNTER_ARC_RADIUS_MAX);
            assert!(e.arc_omega >= 0.005 && e.arc_omega < HUNTER_ARC_OMEGA_RANGE);
            assert!(e.arc_phase >= 0.0 && e.arc_phase < trig::TAU);
        }
    }

    #[test]
    fn update_moves_toward_target() {
        let mut e = spawn_hunter_from_seed(1, 42, 1920.0, 1080.0);
        // Override spawn position + facing so the test starts at a
        // controlled point regardless of which edge the seed picked.
        e.x = 1000.0;
        e.y = 500.0;
        e.vx = -HUNTER_BASE_SPEED;
        e.vy = 0.0;
        e.angle = trig::atan2_64(0.0, -1.0);
        let start_x = e.x;
        let targets = [target(99, 100.0, 500.0, true)];
        for _ in 0..60 {
            update_enemy(&mut e, &targets, 1920.0, 1080.0);
        }
        assert!(
            e.x < start_x,
            "x should decrease toward target at x=100, got {} -> {}",
            start_x,
            e.x
        );
    }

    #[test]
    fn update_no_target_drifts_toward_center() {
        let mut e = spawn_hunter_from_seed(2, 13, 1920.0, 1080.0);
        e.x = 100.0;
        e.y = 100.0;
        e.vx = HUNTER_BASE_SPEED;
        e.vy = HUNTER_BASE_SPEED;
        e.angle = trig::atan2_64(1.0, 1.0);
        let start_x = e.x;
        let targets: [TargetView; 0] = [];
        for _ in 0..100 {
            update_enemy(&mut e, &targets, 1920.0, 1080.0);
        }
        assert!(
            e.x > start_x,
            "x should drift toward center 960, got {} -> {}",
            start_x,
            e.x
        );
    }

    #[test]
    fn update_bounces_off_edge() {
        let mut e = spawn_hunter_from_seed(3, 99, 1920.0, 1080.0);
        e.x = 10.0;
        e.y = 540.0;
        e.vx = -5.0;
        e.vy = 0.0;
        // Face pointing left so the per-tick velocity recompute also
        // produces a negative vx that the bounce branch can flip.
        e.angle = trig::PI;
        // Empty targets → drifts toward center, but the immediate
        // bounce branch fires first because we start inside the wall.
        let targets: [TargetView; 0] = [];
        update_enemy(&mut e, &targets, 1920.0, 1080.0);
        assert!(
            e.vx > 0.0,
            "vx should be positive after bounce, got {}",
            e.vx
        );
        assert!(
            e.x >= e.radius - 1e-6,
            "x should be clamped to radius, got {}",
            e.x
        );
    }

    #[test]
    fn closest_target_picks_nearest_alive() {
        let near_x = 0.0;
        let near_y = 0.0;
        let targets = [
            target(1, 100.0, 0.0, true), // dist 100
            target(2, 50.0, 0.0, true),  // dist 50  (closest)
            target(3, 200.0, 0.0, true), // dist 200
        ];
        let picked = closest_target(&targets, near_x, near_y).expect("alive target exists");
        assert_eq!(picked.player_id, 2);

        // Mark the 50-distance one dead → 100 wins.
        let targets = [
            target(1, 100.0, 0.0, true),
            target(2, 50.0, 0.0, false),
            target(3, 200.0, 0.0, true),
        ];
        let picked = closest_target(&targets, near_x, near_y).expect("alive target exists");
        assert_eq!(picked.player_id, 1);

        // All dead → None.
        let targets = [
            target(1, 100.0, 0.0, false),
            target(2, 50.0, 0.0, false),
        ];
        assert!(closest_target(&targets, near_x, near_y).is_none());
    }

    #[test]
    fn lerp_angle_wraps_correctly() {
        // 3.0 → -3.0 should NOT go through 0 (that's ~6 rad the long
        // way). The short way crosses ±π in ~0.28 rad.
        let result = lerp_angle(3.0, -3.0, 0.5);
        let dist_to_zero = result.abs();
        let dist_to_pi = (result.abs() - trig::PI).abs();
        assert!(
            dist_to_pi < dist_to_zero,
            "lerp_angle(3, -3, 0.5) = {} should be closer to ±π than to 0",
            result
        );
    }
}
