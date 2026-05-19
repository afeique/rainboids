//! Phase 4 PROWLER enemy sim — heavy keep-distance missile platform.
//!
//! Fresh rewrite from solo's
//! `js/modules/enemy/enemy-data.js` (PROWLER row ~line 195),
//! `js/modules/enemy/movement.js::keepDistanceMovement` (~line 1952),
//! and `js/modules/enemy/firing.js` ('missile' case ~line 139).
//! Deterministic: every random draw goes through `RngCtx`
//! (seeded per-spawn from the `EnemySpawn` event's `rng_subseed`),
//! and every trig op goes through `super::trig::*` (polynomial,
//! bit-exact across native + WASM).
//!
//! Date 2026-05-18.
//!
//! Behavioral deviations from solo's `keepDistanceMovement`
//! (intentional, determinism-driven):
//!   - Solo runs a 3-state machine (patrol / dive / retreat) gated
//!     on `frameClock.now` wall-clock deadlines and `Math.random()`
//!     timers. The sim has no wall-clock and no per-tick RNG roll —
//!     re-running an `Math.random()` ladder per-tick would
//!     corrupt determinism. The MP version is a simpler reactive
//!     distance-band controller: advance when too far, retreat when
//!     too close, idle within the tolerance band (±50px around 350).
//!     Same strategic read (stays out at range, fires missiles) with
//!     a state vector that's small + deterministic.
//!   - No velocity damping/friction. Movement is constant-speed
//!     along facing (matches HUNTER's pattern).
//!   - Angle is lerped toward the desired heading at `t = 0.12` per
//!     tick (solo's PROWLER `turnSpeed: 0.12`).
//!
//! Wave 2A unification: PROWLER no longer owns its own struct —
//! it reads/writes the shared `super::enemy::EnemyState`. Because
//! keep-distance is reactive (no per-tick phase / radius / omega
//! state), no per-kind movement fields on `EnemyState` are used —
//! PROWLER only touches the common fields (x, y, vx, vy, angle, hp,
//! max_hp, radius, active, last_fire_tick, id, kind).
//!
//! Wave 2 wiring contract:
//!   - This module owns spawn, movement, and aim for PROWLER.
//!   - Missile-projectile lifecycle (spawn, homing, lifetime, damage)
//!     is delegated to `enemy_missile.rs` (sibling). The Wave 2
//!     orchestrator in `room.rs` is responsible for:
//!       * gating `PROWLER_FIRE_COOLDOWN_TICKS` per prowler
//!       * calling `aim_prowler` to pick the missile launch angle
//!       * delegating actual missile construction to
//!         `enemy_missile::spawn_missile_from_prowler(...)`
//!       * emitting the corresponding `EnemyBulletSpawn` event so
//!         the WASM client mirrors it
//!   - This module deliberately exposes no firing function — keeps
//!     projectile ownership single-sourced in `enemy_missile.rs`.

use super::enemy::EnemyState;
use super::trig;

/// PROWLER kind discriminator. Matches `wave_table::KIND_PROWLER`.
pub const KIND_PROWLER: u8 = 8;

/// Base HP for a PROWLER. Solo 14 — heaviest non-boss enemy. Roughly
/// 12 PULSE_CANNON hits at 1.2 dmg = 14.4 > 14.0.
pub const PROWLER_MAX_HP: f64 = 14.0;
/// Movement speed (px/tick at 60 Hz). Solo's 0.75 is a per-frame
/// budget that includes friction; the constant-speed sim version is
/// calibrated to 0.5 so the on-screen drift rate matches solo's
/// average velocity under its damping.
pub const PROWLER_BASE_SPEED: f64 = 0.5;
/// Body radius (px). Solo size 45 / 2 ≈ 22 — fits collider + visual.
pub const PROWLER_RADIUS: f64 = 22.0;
/// Contact damage dealt to a ship on body-touch. Heavy class.
pub const PROWLER_CONTACT_DAMAGE: f64 = 8.0;
/// Per-prowler firing cooldown in ticks. 4 s at 60 Hz. Missiles are
/// powerful (homing); long cooldown keeps the encounter readable.
pub const PROWLER_FIRE_COOLDOWN_TICKS: u32 = 240;
/// Distance (px) the PROWLER tries to maintain from its target.
/// Solo's `ai.preferredRange = 400`; MP shortens to 350 so it stays
/// in screen view on smaller multiplayer fields.
pub const PROWLER_PREFERRED_RANGE: f64 = 350.0;
/// Half-width (px) of the idle band around `PROWLER_PREFERRED_RANGE`.
/// Within `[300, 400]` the PROWLER doesn't advance or retreat —
/// avoids jitter at the band boundary.
pub const PROWLER_RANGE_TOLERANCE: f64 = 50.0;

/// Lerp factor for turning facing toward desired heading per tick.
/// 0.12 mirrors solo's PROWLER `turnSpeed: 0.12` — slightly snappier
/// than the HUNTER baseline (0.08) because PROWLER aims missiles and
/// needs to track moving ships responsively.
const ANGLE_TURN_T: f64 = 0.12;

/// Spawn a PROWLER at the given seed. Both server and WASM client
/// call this with the SAME id + rng_subseed (carried in `EnemySpawn`
/// event) and produce identical state.
pub fn spawn_prowler_from_seed(
    id: u32,
    rng_subseed: u64,
    field_w: f64,
    field_h: f64,
) -> EnemyState {
    let mut rng = super::rng_ctx::RngCtx::from_seed(rng_subseed);

    // Pick a field edge (0=top, 1=right, 2=bottom, 3=left) and place
    // the enemy just outside it so it "enters" the play space.
    let edge = rng.range_f64(0.0, 4.0) as i32;
    let (x, y, vx, vy) = match edge {
        0 => (
            rng.range_f64(0.0, field_w),
            -PROWLER_RADIUS,
            0.0,
            PROWLER_BASE_SPEED,
        ),
        1 => (
            field_w + PROWLER_RADIUS,
            rng.range_f64(0.0, field_h),
            -PROWLER_BASE_SPEED,
            0.0,
        ),
        2 => (
            rng.range_f64(0.0, field_w),
            field_h + PROWLER_RADIUS,
            0.0,
            -PROWLER_BASE_SPEED,
        ),
        _ => (
            -PROWLER_RADIUS,
            rng.range_f64(0.0, field_h),
            PROWLER_BASE_SPEED,
            0.0,
        ),
    };

    EnemyState {
        id,
        kind: KIND_PROWLER,
        x,
        y,
        vx,
        vy,
        angle: trig::atan2_64(vy, vx),
        hp: PROWLER_MAX_HP,
        max_hp: PROWLER_MAX_HP,
        radius: PROWLER_RADIUS,
        active: true,
        last_fire_tick: 0,
        ..EnemyState::default()
    }
}

/// Per-tick update for a PROWLER. Picks closest alive ship as target,
/// computes distance, advances / idles / retreats per the band, clamps
/// to field, faces target while moving.
///
/// With no target alive, drifts toward field center (mirrors HUNTER's
/// fallback so a PROWLER that outlives the party still has predictable
/// motion).
pub fn update_prowler_movement(
    s: &mut EnemyState,
    targets: &[super::enemy::TargetView],
    field_w: f64,
    field_h: f64,
) {
    if !s.active || s.kind != KIND_PROWLER {
        return;
    }

    let target = closest_target(targets, s.x, s.y);

    let (tx, ty) = match target {
        Some(t) => (t.x, t.y),
        None => (field_w * 0.5, field_h * 0.5),
    };

    let to_dx = tx - s.x;
    let to_dy = ty - s.y;
    let dist2 = to_dx * to_dx + to_dy * to_dy;

    // Distance band:
    //   > preferred + tol  → advance toward target (facing tx,ty)
    //   < preferred - tol  → retreat from target (facing away)
    //   else               → idle (no translation, still face target)
    let far_thresh = PROWLER_PREFERRED_RANGE + PROWLER_RANGE_TOLERANCE;
    let near_thresh = PROWLER_PREFERRED_RANGE - PROWLER_RANGE_TOLERANCE;
    let far2 = far_thresh * far_thresh;
    let near2 = near_thresh * near_thresh;

    // Desired heading: always face the target (gives correct aim for
    // missile launches). Translation direction is decided by band.
    let face_angle = trig::atan2_64(to_dy, to_dx);
    s.angle = lerp_angle(s.angle, face_angle, ANGLE_TURN_T);

    if dist2 > far2 {
        // Too far — advance along facing.
        s.vx = trig::cos64(s.angle) * PROWLER_BASE_SPEED;
        s.vy = trig::sin64(s.angle) * PROWLER_BASE_SPEED;
    } else if dist2 < near2 {
        // Too close — retreat (move opposite of facing).
        s.vx = -trig::cos64(s.angle) * PROWLER_BASE_SPEED;
        s.vy = -trig::sin64(s.angle) * PROWLER_BASE_SPEED;
    } else {
        // Idle band — hold position. No translation; still rotating
        // to track target so aim stays warm for the next fire window.
        s.vx = 0.0;
        s.vy = 0.0;
    }

    s.x += s.vx;
    s.y += s.vy;

    // Clamp to field. PROWLER does NOT bounce — heavy-ship feel is
    // "sticks to the wall it touched" until it decides to retreat,
    // which is more predictable for a slow tanky enemy than a bounce.
    let r = s.radius;
    if s.x - r < 0.0 {
        s.x = r;
        if s.vx < 0.0 {
            s.vx = 0.0;
        }
    } else if s.x + r > field_w {
        s.x = field_w - r;
        if s.vx > 0.0 {
            s.vx = 0.0;
        }
    }
    if s.y - r < 0.0 {
        s.y = r;
        if s.vy < 0.0 {
            s.vy = 0.0;
        }
    } else if s.y + r > field_h {
        s.y = field_h - r;
        if s.vy > 0.0 {
            s.vy = 0.0;
        }
    }
}

/// Aim helper: the angle from PROWLER to the given target. Used by
/// Wave 2's missile-launch code path (`enemy_missile::spawn_missile_from_prowler`)
/// to pick the launch heading. Pure trig — no state mutation.
pub fn aim_prowler(s: &EnemyState, target: &super::enemy::TargetView) -> f64 {
    trig::atan2_64(target.y - s.y, target.x - s.x)
}

/// Internal: find the closest alive target. `None` if all dead/empty.
fn closest_target(
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
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, *t));
        }
    }
    best.map(|(_, t)| t)
}

/// Internal: angle lerp via shortest path (handles ±π wrap so the
/// turn always takes the short way around the circle). Mirrors the
/// helper in `enemy.rs` — duplicated here rather than re-exported to
/// keep this module's dependency on `enemy.rs` limited to `TargetView`.
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
    use super::super::enemy::TargetView;

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
        let a = spawn_prowler_from_seed(7, 0xCAFE_F00D, 1920.0, 1080.0);
        let b = spawn_prowler_from_seed(7, 0xCAFE_F00D, 1920.0, 1080.0);
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
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn spawn_within_field_bounds() {
        let fw = 1920.0;
        let fh = 1080.0;
        for seed in 0..100u64 {
            let s = spawn_prowler_from_seed(seed as u32, seed.wrapping_mul(7919), fw, fh);
            let at_top = (s.y - (-PROWLER_RADIUS)).abs() < 1e-9;
            let at_right = (s.x - (fw + PROWLER_RADIUS)).abs() < 1e-9;
            let at_bottom = (s.y - (fh + PROWLER_RADIUS)).abs() < 1e-9;
            let at_left = (s.x - (-PROWLER_RADIUS)).abs() < 1e-9;
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
            assert_eq!(s.hp.to_bits(), PROWLER_MAX_HP.to_bits());
            assert_eq!(s.max_hp.to_bits(), PROWLER_MAX_HP.to_bits());
            assert_eq!(s.radius.to_bits(), PROWLER_RADIUS.to_bits());
            assert_eq!(s.kind, KIND_PROWLER);
            assert!(s.active);
        }
    }

    #[test]
    fn spawn_seed_variation() {
        // Two different sub-seeds should generally produce different
        // spawn positions. Sample a handful and assert at least one
        // pair differs — guards against an accidental constant.
        let a = spawn_prowler_from_seed(1, 1, 1920.0, 1080.0);
        let b = spawn_prowler_from_seed(1, 2, 1920.0, 1080.0);
        let c = spawn_prowler_from_seed(1, 3, 1920.0, 1080.0);
        let d = spawn_prowler_from_seed(1, 4, 1920.0, 1080.0);
        let positions = [(a.x, a.y), (b.x, b.y), (c.x, c.y), (d.x, d.y)];
        let mut distinct = 0;
        for i in 0..positions.len() {
            for j in (i + 1)..positions.len() {
                if positions[i] != positions[j] {
                    distinct += 1;
                }
            }
        }
        assert!(
            distinct > 0,
            "expected at least one distinct pair across 4 sub-seeds"
        );
    }

    #[test]
    fn update_no_target_drifts_predictably() {
        // No targets → drifts toward field center. Start far from
        // center so the band logic picks "advance".
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let start_x = s.x;
        let start_y = s.y;
        let targets: [TargetView; 0] = [];
        for _ in 0..120 {
            update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Field center is (960, 540); both axes should increase.
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

    #[test]
    fn update_advances_when_too_far() {
        // PROWLER at (1000, 500), target at (400, 500) → distance 600,
        // well above PROWLER_PREFERRED_RANGE + tol = 400. Should
        // close the gap.
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 1000.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: trig::PI, // already facing left toward target
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let start_x = s.x;
        let targets = [target(1, 400.0, 500.0, true)];
        for _ in 0..60 {
            update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert!(
            s.x < start_x,
            "x should decrease toward target at x=400, got {} -> {}",
            start_x,
            s.x
        );
    }

    #[test]
    fn update_retreats_when_too_close() {
        // PROWLER at (500, 500), target at (400, 500) → distance 100,
        // well below PROWLER_PREFERRED_RANGE - tol = 300. Should
        // back off.
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: trig::PI, // facing target initially
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let start_x = s.x;
        let targets = [target(1, 400.0, 500.0, true)];
        for _ in 0..60 {
            update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        // Retreat moves opposite of facing — facing is toward target
        // at x=400, so retreat moves to higher x.
        assert!(
            s.x > start_x,
            "x should increase away from target at x=400, got {} -> {}",
            start_x,
            s.x
        );
    }

    #[test]
    fn update_idles_in_tolerance_band() {
        // Target placed at exactly PROWLER_PREFERRED_RANGE away.
        // PROWLER should barely move over 60 ticks (vx,vy = 0 in
        // the idle band).
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: trig::PI, // already facing the target
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        // Place target at distance == PROWLER_PREFERRED_RANGE (350px
        // to the left). Inside [300, 400] band → idle.
        let targets = [target(1, 500.0 - PROWLER_PREFERRED_RANGE, 500.0, true)];
        let start_x = s.x;
        let start_y = s.y;
        for _ in 0..60 {
            update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        let dx = (s.x - start_x).abs();
        let dy = (s.y - start_y).abs();
        // 60 ticks at PROWLER_BASE_SPEED would move 30px; in the band
        // the prowler doesn't translate. Allow 1px for any micro-
        // movement / clamp interaction.
        assert!(dx < 1.0, "x should barely change in idle band, got Δ={}", dx);
        assert!(dy < 1.0, "y should barely change in idle band, got Δ={}", dy);
    }

    #[test]
    fn update_clamps_inside_field() {
        // Start near left wall; target far to the LEFT (off-screen).
        // PROWLER tries to advance left → should clamp at x = radius
        // rather than escaping the field.
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 10.0,
            y: 540.0,
            vx: -PROWLER_BASE_SPEED,
            vy: 0.0,
            angle: trig::PI,
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let targets = [target(1, -500.0, 540.0, true)];
        for _ in 0..30 {
            update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        }
        assert!(
            s.x >= PROWLER_RADIUS - 1e-6,
            "x should be clamped to radius, got {}",
            s.x
        );
        // Confirm the field boundary held on the other axes too.
        assert!(s.x <= 1920.0 - PROWLER_RADIUS + 1e-6);
        assert!(s.y >= PROWLER_RADIUS - 1e-6);
        assert!(s.y <= 1080.0 - PROWLER_RADIUS + 1e-6);
    }

    #[test]
    fn update_guards_inactive_and_wrong_kind() {
        // Inactive PROWLER should not move.
        let mut s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: false,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let start_x = s.x;
        let start_y = s.y;
        let targets = [target(1, 0.0, 0.0, true)];
        update_prowler_movement(&mut s, &targets, 1920.0, 1080.0);
        assert_eq!(s.x.to_bits(), start_x.to_bits());
        assert_eq!(s.y.to_bits(), start_y.to_bits());

        // Wrong-kind enemy should also be a no-op.
        let mut s2 = EnemyState {
            id: 2,
            kind: 0, // KIND_HUNTER, not PROWLER
            x: 500.0,
            y: 500.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: 1.0,
            max_hp: 1.0,
            radius: 10.0,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let start_x2 = s2.x;
        let start_y2 = s2.y;
        update_prowler_movement(&mut s2, &targets, 1920.0, 1080.0);
        assert_eq!(s2.x.to_bits(), start_x2.to_bits());
        assert_eq!(s2.y.to_bits(), start_y2.to_bits());
    }

    #[test]
    fn aim_prowler_points_at_target() {
        // PROWLER at origin, target at (1, 0) → angle = 0.
        let s = EnemyState {
            id: 1,
            kind: KIND_PROWLER,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp: PROWLER_MAX_HP,
            max_hp: PROWLER_MAX_HP,
            radius: PROWLER_RADIUS,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        };
        let t = target(1, 1.0, 0.0, true);
        let a = aim_prowler(&s, &t);
        assert!(a.abs() < 1e-9, "expected ~0, got {}", a);

        // Target at (0, 1) → angle = +π/2.
        let t2 = target(1, 0.0, 1.0, true);
        let a2 = aim_prowler(&s, &t2);
        assert!((a2 - trig::PI_2).abs() < 1e-9, "expected π/2, got {}", a2);

        // Target at (-1, 0) → angle = ±π.
        let t3 = target(1, -1.0, 0.0, true);
        let a3 = aim_prowler(&s, &t3);
        assert!((a3.abs() - trig::PI).abs() < 1e-9, "expected ±π, got {}", a3);

        // Offset PROWLER — angle is relative to PROWLER position.
        let s2 = EnemyState { x: 100.0, y: 100.0, ..s };
        let t4 = target(1, 200.0, 100.0, true);
        let a4 = aim_prowler(&s2, &t4);
        assert!(a4.abs() < 1e-9, "expected ~0 from offset, got {}", a4);
    }

    #[test]
    fn consts_sensible() {
        // Sanity gate on the public constants — guards against
        // accidental zero / negative / unreasonable values from a
        // careless refactor.
        assert_eq!(KIND_PROWLER, 8);
        assert!(PROWLER_MAX_HP > 0.0);
        assert!(PROWLER_BASE_SPEED > 0.0);
        assert!(PROWLER_RADIUS > 0.0);
        assert!(PROWLER_CONTACT_DAMAGE > 0.0);
        assert!(PROWLER_FIRE_COOLDOWN_TICKS > 0);
        assert!(PROWLER_PREFERRED_RANGE > 0.0);
        assert!(PROWLER_RANGE_TOLERANCE > 0.0);
        // Tolerance must be strictly less than preferred range or the
        // "near" threshold goes negative and the retreat branch
        // becomes unreachable.
        assert!(
            PROWLER_RANGE_TOLERANCE < PROWLER_PREFERRED_RANGE,
            "tolerance ({}) must be < preferred range ({})",
            PROWLER_RANGE_TOLERANCE,
            PROWLER_PREFERRED_RANGE,
        );
        // Heavy class: should out-HP HUNTER (3.0) by a healthy margin.
        assert!(PROWLER_MAX_HP > 10.0);
        // Slow class: should be slower than HUNTER (1.4).
        assert!(PROWLER_BASE_SPEED < 1.0);
    }
}
