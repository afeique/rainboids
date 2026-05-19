//! Phase 4 step 5 (2026-05-18) — STALKER enemy sim.
//!
//! STALKER is a fast mid-HP arc-orbiter that **charges** before
//! firing a powerful aimed shot. Solo's STALKER orbits at a tight
//! preferred range and "winds up" a laser before unleashing it; our
//! sim port keeps the orbit shape and reduces the laser windup to
//! a single MVP per-shot **charge timer**.
//!
//! Fresh port from solo sources studied:
//!   - `js/modules/enemy/enemy-data.js` (STALKER row, line 125):
//!     `health: 7, speed: 3.1, size: 38, shootPattern: 'charged_laser',
//!     movePattern: 'arc', cooldown 1500-6000 ms, preferredRange: 200,
//!     evasion: 0.6`.
//!   - `js/modules/enemy/movement.js` (`arcMovement`, line 1425): the
//!     generic 'arc' movement. Solo's version is a three-state FSM
//!     (`swooping → charging → firing`) with wall-clock `arcTimer`
//!     advancing in ms. Our sim port reads the orbit-radius / sweep
//!     direction core and drops the FSM in favor of a continuous
//!     orbit + a per-shot charge tick (see "MVP simplification"
//!     below).
//!   - `js/modules/enemy/firing.js` (`shootChargedLaser`, line 793):
//!     fires a wide laser beam (8 segments) at `faceAngle`. The
//!     enemy-bullet wire shape in MP1 doesn't model beam segments —
//!     Wave 2 will emit a single aimed bullet via
//!     `enemy_bullet::spawn_aimed_default` and the visual segment
//!     fan is a Phase 5+ concern.
//!
//! Behavioral deviations from solo (intentional, determinism /
//! MVP-driven):
//!   - **MVP simplification — per-shot charge timer.** Solo's STALKER
//!     enters a `charging` FSM state after each swoop and only
//!     becomes shootable for an 800 ms firing window. We model this
//!     as a single `charge_progress` counter that increments each
//!     idle tick; the Wave 2 fire dispatcher uses
//!     `is_charge_complete()` to gate the emit, then calls
//!     `reset_charge()` after the bullet ships. No chargeable cancel,
//!     no release-on-LOS-break — those are Phase 5+ polish.
//!   - **No `frameClock.now` random rolls.** Solo's `arcMovement`
//!     and HUNTER's `hunter_arc` both roll wall-clock dice for
//!     lunge/slingshot timing; the sim has no wall-clock. We borrow
//!     HUNTER's deterministic arc-orbit shape (`arc_dir`, `arc_radius`,
//!     `arc_omega`, `arc_phase`) with STALKER-specific consts
//!     (orbit further out, slightly faster sweep).
//!   - **No velocity damping.** Constant `STALKER_BASE_SPEED` along
//!     the facing vector; arc emerges from the offset chase-target
//!     (matches `enemy.rs` discipline).
//!   - **Angle lerp at `t = 0.08` per tick.** Matches solo's
//!     `enemy.turnSpeed = 0.08`; same as HUNTER. STALKER's solo
//!     `movement.turnSpeed = 0.12` is for the charging-state
//!     aim-snap, which our continuous-orbit port doesn't have a
//!     separate state for — using the standard `enemy.turnSpeed`
//!     keeps the visual feel consistent with other arc-orbiters.
//!
//! **Phase 4 step 5 (Wave 2A) — unified `EnemyState`.** STALKER now
//! reads/writes the shared `super::enemy::EnemyState` struct. It reuses
//! the arc-orbit fields (`arc_dir`, `arc_radius`, `arc_omega`,
//! `arc_phase`) introduced for HUNTER and its own `charge_progress`
//! field. All other per-kind fields default to 0.0 / 0 / false.

use super::enemy::{EnemyState, TargetView};
use super::trig;

/// STALKER kind discriminator. Matches `wave_table::KIND_STALKER`.
pub const KIND_STALKER: u8 = 3;

/// Base HP for a STALKER. Solo `health: 7` ports verbatim.
pub const STALKER_MAX_HP: f64 = 7.0;

/// Body radius (px). Solo `size: 38` → radius 19 (diameter convention).
pub const STALKER_RADIUS: f64 = 19.0;

/// Movement speed (px/tick at 60 Hz). Solo speed 3.1 is for the
/// raw `vel` field used in a damping system; calibrating to our
/// constant-speed/no-friction model puts the felt speed between
/// HUNTER (1.4) and WASP (~2.3) — STALKER reads as the "fastest of
/// the arc-orbiters." Set to 2.0 for MVP playability.
pub const STALKER_BASE_SPEED: f64 = 2.0;

/// Contact damage dealt to a ship on body-touch. Solo doesn't
/// surface a numeric contact-damage field per-enemy; we set 4.0 to
/// sit just below HUNTER's 5.0 (STALKER is meant to threaten via
/// the charged laser, not body checks).
pub const STALKER_CONTACT_DAMAGE: f64 = 4.0;

/// Fire cooldown in ticks. Solo cooldown range 1500-6000 ms midpoint
/// is ~3750 ms ≈ 225 ticks at 60 Hz; we set to 150 ticks (2.5 s) for
/// MVP playability — STALKER felt sluggish at the solo midpoint when
/// the per-shot charge windup is added on top.
pub const STALKER_FIRE_COOLDOWN_TICKS: u32 = 150;

/// Charge windup in ticks before a shot actually fires. 60 ticks =
/// 1 s at 60 Hz, the perceptible "STALKER is winding up" beat that
/// players can dodge / interrupt by killing it.
pub const STALKER_CHARGE_TICKS: u32 = 60;

/// Minimum arc-orbit radius (px). Tighter inner bound than HUNTER
/// (which is 120) — STALKER is meant to orbit FURTHER OUT to give
/// itself line of sight for the charged laser. Solo
/// `preferredRange: 200` informs the midpoint.
pub const STALKER_ARC_RADIUS_MIN: f64 = 180.0;

/// Maximum arc-orbit radius (px). Outer bound mirrors HUNTER's
/// (200) shifted out by the same delta as MIN.
pub const STALKER_ARC_RADIUS_MAX: f64 = 240.0;

/// Upper bound on arc-orbit angular velocity (radians/tick).
/// Slightly faster than HUNTER's 0.02 — STALKER's solo `speed` is
/// higher and the visual read should match.
pub const STALKER_ARC_OMEGA_RANGE: f64 = 0.025;

/// Preferred orbit-target range (px). Surfaced for Wave 2 / future
/// AI tuning that wants to read STALKER's intended engage distance.
pub const STALKER_PREFERRED_RANGE: f64 = 200.0;

/// Lerp factor for facing-angle turn per tick. Same 0.08 as HUNTER
/// (`enemy.turnSpeed`). See module docs for why we don't use solo's
/// STALKER-specific 0.12.
const ANGLE_TURN_T: f64 = 0.08;

/// Spawn a STALKER at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce bit-identical state.
pub fn spawn_stalker_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left). Same
    // pattern as `spawn_hunter_from_seed`.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -STALKER_RADIUS,
            0.0,
            STALKER_BASE_SPEED,
        ),
        1 => (
            field_w + STALKER_RADIUS,
            rng.range_f64(0.0, field_h),
            -STALKER_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + STALKER_RADIUS,
            0.0,
            -STALKER_BASE_SPEED,
        ),
        _ => (
            -STALKER_RADIUS,
            rng.range_f64(0.0, field_h),
            STALKER_BASE_SPEED,
            0.0,
        ),
    };

    let arc_dir = if rng.range_f64(0.0, 1.0) < 0.5 { -1.0 } else { 1.0 };
    let arc_radius = rng.range_f64(STALKER_ARC_RADIUS_MIN, STALKER_ARC_RADIUS_MAX);
    // Lower bound 0.006 — slightly above HUNTER's 0.005 floor to keep
    // STALKER's orbits visibly more active.
    let arc_omega = rng.range_f64(0.006, STALKER_ARC_OMEGA_RANGE);
    let arc_phase = rng.unit_circle_angle();

    EnemyState {
        id,
        kind: KIND_STALKER,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: STALKER_MAX_HP,
        max_hp: STALKER_MAX_HP,
        radius: STALKER_RADIUS,
        active: true,
        last_fire_tick: 0,
        arc_dir,
        arc_radius,
        arc_omega,
        arc_phase,
        charge_progress: 0,
        ..EnemyState::default()
    }
}

/// Per-tick movement update. Picks closest alive target, runs
/// arc-orbit chase, clamps to field with edge bounce, advances
/// `charge_progress`. Does NOT decide whether to fire — Wave 2's
/// fire dispatcher checks `is_charge_complete()` and a separate
/// per-room cooldown gate.
pub fn update_stalker_movement(
    s: &mut EnemyState,
    targets: &[TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_STALKER {
        return;
    }

    let target = closest_target(targets, s.x, s.y);

    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    // Arc-orbit chase: target a point offset from the player along
    // the arc. Same shape as `enemy::update_enemy`'s HUNTER orbit.
    s.arc_phase += s.arc_omega * s.arc_dir;
    let arc_offset_x = trig::cos64(s.arc_phase) * s.arc_radius;
    let arc_offset_y = trig::sin64(s.arc_phase) * s.arc_radius;
    let chase_target_x = tx + arc_offset_x;
    let chase_target_y = ty + arc_offset_y;

    let to_dx = chase_target_x - s.x;
    let to_dy = chase_target_y - s.y;
    let desired_angle = trig::atan2_64(to_dy, to_dx);

    s.angle = lerp_angle(s.angle, desired_angle, ANGLE_TURN_T);

    s.vx = trig::cos64(s.angle) * STALKER_BASE_SPEED;
    s.vy = trig::sin64(s.angle) * STALKER_BASE_SPEED;

    s.x += s.vx;
    s.y += s.vy;

    // Bounce off field edges.
    let r = s.radius;
    if s.x - r < 0.0 {
        s.x = r;
        s.vx = s.vx.abs();
    } else if s.x + r > field_w {
        s.x = field_w - r;
        s.vx = -s.vx.abs();
    }
    if s.y - r < 0.0 {
        s.y = r;
        s.vy = s.vy.abs();
    } else if s.y + r > field_h {
        s.y = field_h - r;
        s.vy = -s.vy.abs();
    }

    // Advance the per-shot windup. Saturates at u32::MAX (sim won't
    // run for ~2 years of ticks at 60 Hz so wraparound isn't a
    // practical concern, but `saturating_add` is the safe idiom).
    s.charge_progress = s.charge_progress.saturating_add(1);
}

/// Compute the aim angle from STALKER to a target. Wave 2 fire
/// dispatcher passes this to `enemy_bullet::spawn_aimed_default`.
pub fn aim_stalker(s: &EnemyState, target: &TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// True if the windup counter has reached `STALKER_CHARGE_TICKS`.
/// Wave 2's fire dispatcher uses this as a precondition for emitting
/// the aimed bullet.
pub fn is_charge_complete(s: &EnemyState) -> bool {
    s.charge_progress >= STALKER_CHARGE_TICKS
}

/// Reset the windup counter to 0. Wave 2's fire dispatcher calls
/// this AFTER the bullet ships so the next shot starts a fresh
/// charge cycle.
pub fn reset_charge(s: &mut EnemyState) {
    s.charge_progress = 0;
}

// ── Internal helpers (mirror enemy.rs shape) ──

/// Find the closest alive target. `None` if all dead/empty.
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

/// Angle lerp via shortest path (handles ±π wrap).
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
    use crate::mp1::enemy::TargetView;

    fn target(player_id: u32, x: f64, y: f64, alive: bool) -> TargetView {
        TargetView {
            player_id,
            x,
            y,
            alive,
        }
    }

    /// Same (id, sub_seed) inputs produce bit-identical state on
    /// both server and WASM client. Bit-exact equality on every f64
    /// guards against accidental nondeterminism in spawn.
    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_stalker_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
        let b = spawn_stalker_from_seed(7, 0xDEAD_BEEF, 1920.0, 1080.0);
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
        assert_eq!(a.charge_progress, b.charge_progress);
        assert_eq!(a.active, b.active);
    }

    /// 100 random seeds all spawn at a field edge with arc params
    /// inside the declared ranges.
    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_stalker_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-STALKER_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + STALKER_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + STALKER_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-STALKER_RADIUS)).abs() < 1e-9;
            assert!(
                at_top || at_right || at_bottom || at_left,
                "seed {seed}: not at an edge — pos=({}, {})",
                s.x,
                s.y
            );
            if at_top || at_bottom {
                assert!(s.x >= 0.0 && s.x <= fw, "seed {seed}: x out of field");
            }
            if at_left || at_right {
                assert!(s.y >= 0.0 && s.y <= fh, "seed {seed}: y out of field");
            }
            assert!(s.arc_dir == 1.0 || s.arc_dir == -1.0);
            assert!(
                s.arc_radius >= STALKER_ARC_RADIUS_MIN
                    && s.arc_radius < STALKER_ARC_RADIUS_MAX
            );
            assert!(s.arc_omega >= 0.006 && s.arc_omega < STALKER_ARC_OMEGA_RANGE);
            assert!(s.arc_phase >= 0.0 && s.arc_phase < trig::TAU);
            assert_eq!(s.charge_progress, 0);
            assert_eq!(s.hp, STALKER_MAX_HP);
            assert_eq!(s.max_hp, STALKER_MAX_HP);
            assert_eq!(s.radius, STALKER_RADIUS);
            assert_eq!(s.kind, KIND_STALKER);
            assert!(s.active);
            assert_eq!(s.last_fire_tick, 0);
        }
    }

    /// Different sub-seeds produce different spawn states (positions,
    /// arc params) — guards against accidentally hashing all sub-seeds
    /// to the same RNG stream.
    #[test]
    fn spawn_seed_variation() {
        let a = spawn_stalker_from_seed(1, 1, 1920.0, 1080.0);
        let b = spawn_stalker_from_seed(1, 2, 1920.0, 1080.0);
        let c = spawn_stalker_from_seed(1, 3, 1920.0, 1080.0);
        // At least one of (x, y, arc_phase) must differ across the
        // three sub-seeds — any one identical pair is OK, all three
        // identical means the RNG didn't advance.
        let all_same =
            a.x == b.x && a.x == c.x && a.y == b.y && a.y == c.y
                && a.arc_phase == b.arc_phase && a.arc_phase == c.arc_phase;
        assert!(!all_same, "three sub-seeds produced identical states");
    }

    /// No target: STALKER drifts toward field center deterministically
    /// (same as HUNTER's fallback behavior).
    #[test]
    fn update_no_target_drifts_predictably() {
        let mut s = spawn_stalker_from_seed(2, 13, 1920.0, 1080.0);
        s.x = 100.0;
        s.y = 100.0;
        s.vx = STALKER_BASE_SPEED;
        s.vy = STALKER_BASE_SPEED;
        s.angle = trig::atan2_64(1.0, 1.0);
        let start_x = s.x;
        let start_y = s.y;
        let targets: [TargetView; 0] = [];
        for _ in 0..120 {
            update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Drift toward center (960, 540) — both x and y should
        // increase from (100, 100).
        assert!(
            s.x > start_x,
            "x should drift toward center 960, got {} -> {}",
            start_x,
            s.x
        );
        assert!(
            s.y > start_y,
            "y should drift toward center 540, got {} -> {}",
            start_y,
            s.y
        );
    }

    /// Over 120 ticks with a stationary target (after warmup),
    /// STALKER's distance to the target stays inside the arc-orbit
    /// band `[ARC_MIN - 60, ARC_MAX + 60]` — i.e. the orbit shape
    /// holds (does not spiral away or collapse onto the target).
    ///
    /// The wide band (±60) is intentional: the offset-chase orbit
    /// has natural radial oscillation as the chase-target rotates
    /// around the player; the STALKER's actual distance breathes
    /// in/out of the configured arc_radius. The PROPERTY we test is
    /// "stays in an orbit band centered on arc_radius", not "is
    /// pinned to exactly arc_radius."
    #[test]
    fn update_arc_orbits_target() {
        let mut s = spawn_stalker_from_seed(5, 0xABCD, 1920.0, 1080.0);
        // Place STALKER inside the field at a known offset from the
        // target so the orbit settles into its stable band.
        s.x = 960.0 + s.arc_radius;
        s.y = 540.0;
        s.angle = trig::PI; // facing -x toward target
        let tgt = target(1, 960.0, 540.0, true);
        let targets = [tgt];

        // Burn 300 ticks of warmup so the angle lerp + radial
        // oscillation settle into the stable orbit band.
        for _ in 0..300 {
            update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        }

        // Sample distance over the next 120 ticks. Wide band to
        // accommodate offset-chase radial breathing.
        let lo = STALKER_ARC_RADIUS_MIN - 60.0;
        let hi = STALKER_ARC_RADIUS_MAX + 60.0;
        for tick in 0..120 {
            update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
            let dx = s.x - tgt.x;
            let dy = s.y - tgt.y;
            let dist = (dx * dx + dy * dy).sqrt();
            assert!(
                dist >= lo && dist <= hi,
                "tick {tick}: dist {} outside [{}, {}]",
                dist,
                lo,
                hi
            );
        }
    }

    /// `charge_progress` increments by 1 per update tick;
    /// `is_charge_complete` flips true once it crosses
    /// `STALKER_CHARGE_TICKS`.
    #[test]
    fn update_charges_over_time() {
        let mut s = spawn_stalker_from_seed(11, 77, 1920.0, 1080.0);
        s.x = 500.0;
        s.y = 500.0;
        let targets = [target(1, 600.0, 500.0, true)];
        assert_eq!(s.charge_progress, 0);
        assert!(!is_charge_complete(&s));

        for tick in 1..=STALKER_CHARGE_TICKS {
            update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
            assert_eq!(s.charge_progress, tick, "tick {tick} progress");
        }
        assert!(
            is_charge_complete(&s),
            "should be complete after {} ticks",
            STALKER_CHARGE_TICKS
        );

        // One more tick — still complete.
        update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        assert!(is_charge_complete(&s));
        assert_eq!(s.charge_progress, STALKER_CHARGE_TICKS + 1);
    }

    /// After `reset_charge`, `charge_progress` is 0 and
    /// `is_charge_complete` is false.
    #[test]
    fn reset_charge_zeroes() {
        let mut s = spawn_stalker_from_seed(99, 999, 1920.0, 1080.0);
        s.charge_progress = 500;
        assert!(is_charge_complete(&s));
        reset_charge(&mut s);
        assert_eq!(s.charge_progress, 0);
        assert!(!is_charge_complete(&s));
    }

    /// STALKER moving into an edge bounces back (vx flips sign,
    /// position clamped to the radius).
    #[test]
    fn update_bounces_off_edge() {
        let mut s = spawn_stalker_from_seed(3, 99, 1920.0, 1080.0);
        s.x = 10.0;
        s.y = 540.0;
        s.vx = -5.0;
        s.vy = 0.0;
        s.angle = trig::PI;
        let targets: [TargetView; 0] = [];
        update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        assert!(
            s.vx > 0.0,
            "vx should be positive after bounce, got {}",
            s.vx
        );
        assert!(
            s.x >= s.radius - 1e-6,
            "x should be clamped to radius, got {}",
            s.x
        );
    }

    /// `aim_stalker` returns atan2 of (dy, dx) — pointing the angle
    /// from enemy to target. Loose tolerance reflects polynomial
    /// trig's accuracy vs `f64::atan2` (see trig.rs SIN_ABS_TOLERANCE).
    #[test]
    fn aim_stalker_points_at_target() {
        let s = EnemyState {
            id: 0,
            kind: KIND_STALKER,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: STALKER_MAX_HP,
            max_hp: STALKER_MAX_HP,
            radius: STALKER_RADIUS,
            active: true,
            last_fire_tick: 0,
            arc_dir: 1.0,
            arc_radius: 200.0,
            arc_omega: 0.01,
            arc_phase: 0.0,
            charge_progress: 0,
            ..EnemyState::default()
        };
        // Target straight right → angle 0.
        let right = target(1, 200.0, 100.0, true);
        assert!(aim_stalker(&s, &right).abs() < 1e-9, "right target");

        // Target straight down → angle PI/2.
        let down = target(2, 100.0, 200.0, true);
        assert!(
            (aim_stalker(&s, &down) - trig::PI_2).abs() < 1e-9,
            "down target"
        );

        // Target straight left → angle ±PI.
        let left = target(3, 0.0, 100.0, true);
        let a = aim_stalker(&s, &left).abs();
        assert!((a - trig::PI).abs() < 1e-9, "left target (got {a})");
    }

    /// Cooldown + charge constants compose sensibly: charge must be
    /// less than cooldown (otherwise the Wave 2 dispatcher's gating
    /// is ambiguous — does cooldown or charge expire first?), and
    /// both must be > 0.
    #[test]
    fn cooldown_and_charge_consts_sensible() {
        assert!(STALKER_CHARGE_TICKS > 0, "charge must be > 0");
        assert!(STALKER_FIRE_COOLDOWN_TICKS > 0, "cooldown must be > 0");
        assert!(
            STALKER_CHARGE_TICKS < STALKER_FIRE_COOLDOWN_TICKS,
            "charge ({}) should be < cooldown ({}) so the Wave 2 \
             dispatcher's timing is unambiguous (cooldown expires \
             first, then charge ticks up to the firing window).",
            STALKER_CHARGE_TICKS,
            STALKER_FIRE_COOLDOWN_TICKS,
        );
        // Range consts also sensible.
        assert!(STALKER_ARC_RADIUS_MIN < STALKER_ARC_RADIUS_MAX);
        assert!(STALKER_ARC_RADIUS_MIN > 0.0);
        assert!(STALKER_ARC_OMEGA_RANGE > 0.0);
        assert!(STALKER_MAX_HP > 0.0);
        assert!(STALKER_BASE_SPEED > 0.0);
        assert!(STALKER_CONTACT_DAMAGE > 0.0);
        assert!(STALKER_RADIUS > 0.0);
        assert!(STALKER_PREFERRED_RANGE > 0.0);
        // KIND_STALKER matches wave_table::KIND_STALKER (canonical
        // discriminator). If wave_table reassigns this we want a test
        // failure here, NOT silent wire-shape drift.
        assert_eq!(KIND_STALKER, super::super::wave_table::KIND_STALKER);
    }

    /// `closest_target` internal helper: picks nearest alive, skips
    /// dead, returns None when all dead. Mirrors enemy.rs's coverage.
    #[test]
    fn closest_target_picks_nearest_alive() {
        let targets = [
            target(1, 100.0, 0.0, true),
            target(2, 50.0, 0.0, true),
            target(3, 200.0, 0.0, true),
        ];
        let picked = closest_target(&targets, 0.0, 0.0).expect("alive");
        assert_eq!(picked.player_id, 2);

        let targets = [
            target(1, 100.0, 0.0, true),
            target(2, 50.0, 0.0, false),
            target(3, 200.0, 0.0, true),
        ];
        let picked = closest_target(&targets, 0.0, 0.0).expect("alive");
        assert_eq!(picked.player_id, 1);

        let targets = [
            target(1, 100.0, 0.0, false),
            target(2, 50.0, 0.0, false),
        ];
        assert!(closest_target(&targets, 0.0, 0.0).is_none());
    }

    /// `update_stalker_movement` guards against being called on an
    /// inactive enemy or one with a non-STALKER kind. Mirrors
    /// `enemy::update_enemy`'s defensive guard.
    #[test]
    fn update_guards_on_inactive_or_wrong_kind() {
        let mut s = spawn_stalker_from_seed(1, 42, 1920.0, 1080.0);
        let saved_x = s.x;
        let saved_y = s.y;
        let saved_charge = s.charge_progress;
        let targets = [target(1, 500.0, 500.0, true)];

        // Inactive: no state change.
        s.active = false;
        update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x, saved_x);
        assert_eq!(s.y, saved_y);
        assert_eq!(s.charge_progress, saved_charge);

        // Wrong kind: no state change.
        s.active = true;
        s.kind = 0; // KIND_HUNTER
        update_stalker_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x, saved_x);
        assert_eq!(s.y, saved_y);
        assert_eq!(s.charge_progress, saved_charge);
    }
}
