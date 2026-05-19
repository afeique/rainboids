//! Phase 4 Wave 2 enemy-bullet pattern helpers — pure functional
//! generators that compose 1+ `EnemyBulletState` instances on top of
//! the `enemy_bullet::spawn` primitive. Used by the per-enemy fire
//! dispatcher (Wave 2 work in `mp1_room.rs`) to materialize the
//! multi-bullet shapes that solo's `firing.js` encodes inline.
//!
//! Pure-functional, allocation-light (a `Vec` only when N > 1
//! bullets need to come out at once). NO module-level state — all
//! phase/sweep state lives on the enemy in `state.rs`. Each helper
//! computes velocities through `trig::cos64`/`sin64` so server and
//! WASM client produce bit-identical bullets from identical inputs.
//!
//! Solo sources studied (2026-05-18):
//! - `js/modules/enemy/firing.js::shootGuardianSpread` — the 5-bullet
//!   fan that inspired `spawn_spread`. Solo hand-codes the offsets
//!   `[-0.5, -0.25, 0, 0.25, 0.5]`; here we parameterize as
//!   `(count, total_spread_radians)` so the same helper handles
//!   Guardian's 5-wide and any future 3-wide / 7-wide variants.
//! - `js/modules/enemy/firing.js::shootSpiralLaser` — single shot at
//!   `this.faceAngle` while the enemy spins. Solo advances the spin
//!   on the enemy itself; we mirror that by taking `spiral_phase` as
//!   a caller-managed input.
//! - `js/modules/enemy/firing.js::updateSweepLaserSystem` /
//!   `isPlayerInSweepBeam` — TITAN's sweeping beam. Solo's sweep is
//!   an instantaneous beam check, not a bullet — but the planned MP
//!   port models it as a bullet whose angle is offset by an
//!   instantaneous sweep oscillation. Same shape as Sentinel.
//! - `js/modules/enemy/firing.js::updateSentinelSweep` — Sentinel's
//!   variant; same `base + offset` aiming formula.
//!
//! Contract (Wave 2 callers MUST honor):
//! - Caller owns id assignment. `spawn_spread` returns N bullets with
//!   sequential ids starting at `id_start`; caller bumps
//!   `room.next_enemy_bullet_id` by the returned length.
//! - Caller owns spiral/sweep phase state. These helpers read the
//!   phase as a scalar input; they do NOT mutate or accumulate.
//! - Speed / lifetime use `enemy_bullet::ENEMY_BULLET_*` defaults
//!   unless the helper takes explicit overrides (only `spawn_explosive`
//!   does — for TITAN's heavier projectile).

use crate::mp1::enemy_bullet::{
    spawn, spawn_aimed_default, EnemyBulletState, ENEMY_BULLET_LIFETIME_TICKS,
    ENEMY_BULLET_SPEED,
};

/// Generate `count` bullets in an evenly-distributed fan centered on
/// `base_angle`. Total angular spread is `total_spread_radians`; if
/// `count == 1` this is a single shot at `base_angle`. If `count` is
/// even, no bullet sits on `base_angle` (symmetric pairs around the
/// axis); if odd, the middle bullet sits on `base_angle`.
///
/// Speed/damage/radius/lifetime per bullet use the enemy_bullet
/// defaults from `super::enemy_bullet::*`.
///
/// Caller assigns sequential ids starting at `id_start`. Returned
/// `Vec` length equals `count` (0 for `count == 0`, defensive).
///
/// Distribution formula:
/// - count == 1 → angle = base_angle
/// - count >= 2 → step = total_spread / (count - 1); angle_i =
///   base_angle - total_spread/2 + i*step  for i in 0..count
///   This gives endpoints at base ± total_spread/2 regardless of
///   even/odd, and the middle bullet at base_angle when count is odd.
pub fn spawn_spread(
    id_start: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    base_angle: f64,
    count: u8,
    total_spread_radians: f64,
) -> Vec<EnemyBulletState> {
    if count == 0 {
        return Vec::new();
    }
    if count == 1 {
        return vec![spawn_aimed_default(
            id_start,
            owner_enemy_id,
            origin_x,
            origin_y,
            base_angle,
        )];
    }
    let n = count as usize;
    let mut out = Vec::with_capacity(n);
    let step = total_spread_radians / ((count - 1) as f64);
    let start = base_angle - total_spread_radians * 0.5;
    for i in 0..n {
        let angle = start + (i as f64) * step;
        out.push(spawn_aimed_default(
            id_start + i as u32,
            owner_enemy_id,
            origin_x,
            origin_y,
            angle,
        ));
    }
    out
}

/// Spawn one bullet at `base_angle + spiral_phase`. The Wave 2 caller
/// owns advancing `spiral_phase` between calls (the accumulator lives
/// on the enemy state in `state.rs`, NOT in this module).
pub fn spawn_spiral(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    base_angle: f64,
    spiral_phase: f64,
) -> EnemyBulletState {
    spawn_aimed_default(
        id,
        owner_enemy_id,
        origin_x,
        origin_y,
        base_angle + spiral_phase,
    )
}

/// Spawn one bullet at `base_angle + sweep_offset`. `sweep_offset` is
/// the caller-computed instantaneous oscillation — typically
/// `amplitude * sin64(phase)` evaluated against an enemy-side phase
/// that the Wave 2 caller advances each tick.
pub fn spawn_sweep(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    base_angle: f64,
    sweep_offset: f64,
) -> EnemyBulletState {
    spawn_aimed_default(
        id,
        owner_enemy_id,
        origin_x,
        origin_y,
        base_angle + sweep_offset,
    )
}

/// Spawn one bullet with explicit per-pattern `damage` and `radius`
/// overrides — used by TITAN's explosive variant where the projectile
/// is bigger and hits harder than the default. Speed and lifetime
/// still come from the module defaults (solo's TITAN explosive uses
/// the same flight time, only the impact differs).
///
/// Thin wrapper around `enemy_bullet::spawn` — exists so the Wave 2
/// dispatcher has a single named entry point for the "heavy bullet"
/// shape rather than threading raw `spawn` calls through.
pub fn spawn_explosive(
    id: u32,
    owner_enemy_id: u32,
    origin_x: f64,
    origin_y: f64,
    angle: f64,
    damage: f64,
    radius: f64,
) -> EnemyBulletState {
    spawn(
        id,
        owner_enemy_id,
        origin_x,
        origin_y,
        angle,
        ENEMY_BULLET_SPEED,
        damage,
        radius,
        ENEMY_BULLET_LIFETIME_TICKS,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mp1::enemy_bullet::{ENEMY_BULLET_DAMAGE, ENEMY_BULLET_RADIUS};
    use crate::mp1::trig::{cos64, sin64, PI, PI_2, PI_4};

    /// Polynomial-trig tolerance — matches the `enemy_bullet::tests`
    /// rationale (~1e-4 worst-case vs `f64::sin`/`cos`).
    const TRIG_TOL: f64 = 1e-4;

    /// count=1 returns a Vec of length 1 with angle = base_angle.
    /// Verifies the count==1 short-circuit fires and the lone bullet
    /// is aimed exactly at base_angle (vx,vy match trig of base).
    #[test]
    fn spread_single_bullet() {
        let base = 0.5;
        let bullets = spawn_spread(100, 7, 0.0, 0.0, base, 1, 1.5);
        assert_eq!(bullets.len(), 1);
        let b = &bullets[0];
        assert_eq!(b.id, 100);
        assert_eq!(b.owner_enemy_id, 7);
        let expect_vx = cos64(base) * ENEMY_BULLET_SPEED;
        let expect_vy = sin64(base) * ENEMY_BULLET_SPEED;
        assert!((b.vx - expect_vx).abs() < TRIG_TOL, "vx={} expect={}", b.vx, expect_vx);
        assert!((b.vy - expect_vy).abs() < TRIG_TOL, "vy={} expect={}", b.vy, expect_vy);
    }

    /// count=3 → middle (index 1) bullet sits on base_angle exactly
    /// (via the symmetric `start + i*step` formula: i=1 gives
    /// base - spread/2 + spread/2 = base, no float drift).
    #[test]
    fn spread_odd_count_has_center_bullet() {
        let base = 1.0;
        let spread = PI_2; // π/2 total
        let bullets = spawn_spread(0, 0, 0.0, 0.0, base, 3, spread);
        assert_eq!(bullets.len(), 3);
        let mid = &bullets[1];
        let expect_vx = cos64(base) * ENEMY_BULLET_SPEED;
        let expect_vy = sin64(base) * ENEMY_BULLET_SPEED;
        // Middle bullet should be aimed exactly at base_angle.
        assert!((mid.vx - expect_vx).abs() < TRIG_TOL, "mid vx={}", mid.vx);
        assert!((mid.vy - expect_vy).abs() < TRIG_TOL, "mid vy={}", mid.vy);
    }

    /// count=2 → no bullet on base_angle; the pair is at
    /// base ± total_spread/2 (the two endpoints).
    #[test]
    fn spread_even_count_has_no_center_bullet() {
        let base = 0.0;
        let spread = PI_2; // π/2 total → endpoints at ±π/4
        let bullets = spawn_spread(0, 0, 0.0, 0.0, base, 2, spread);
        assert_eq!(bullets.len(), 2);

        let expect_left_vx = cos64(base - spread * 0.5) * ENEMY_BULLET_SPEED;
        let expect_left_vy = sin64(base - spread * 0.5) * ENEMY_BULLET_SPEED;
        let expect_right_vx = cos64(base + spread * 0.5) * ENEMY_BULLET_SPEED;
        let expect_right_vy = sin64(base + spread * 0.5) * ENEMY_BULLET_SPEED;

        assert!((bullets[0].vx - expect_left_vx).abs() < TRIG_TOL);
        assert!((bullets[0].vy - expect_left_vy).abs() < TRIG_TOL);
        assert!((bullets[1].vx - expect_right_vx).abs() < TRIG_TOL);
        assert!((bullets[1].vy - expect_right_vy).abs() < TRIG_TOL);

        // Sanity: neither bullet is aimed at base_angle. Default speed
        // along +x at base=0 would give vx ≈ 4.5, vy ≈ 0. Both
        // endpoints rotate well off that.
        let base_vx = cos64(base) * ENEMY_BULLET_SPEED;
        assert!((bullets[0].vx - base_vx).abs() > 0.1, "left should NOT be on axis");
        assert!((bullets[1].vx - base_vx).abs() > 0.1, "right should NOT be on axis");
    }

    /// count=5 → angular step between consecutive bullets is constant.
    /// Derived: we know angle_i = base + (i - 2)*step, so
    /// (i+1) - i = step in angle space. Verify by reconstructing
    /// angle via atan2-ish (use the cos-difference identity instead
    /// to avoid pulling in atan).
    #[test]
    fn spread_evenly_distributed() {
        let base = 0.0;
        let spread = PI; // π total → 4 steps of π/4 each
        let bullets = spawn_spread(0, 0, 0.0, 0.0, base, 5, spread);
        assert_eq!(bullets.len(), 5);
        let expected_step = spread / 4.0;
        // For each consecutive pair, the angle-from-origin should
        // differ by exactly `expected_step`. We verify via the
        // velocity components (vx,vy) reconstructing the angle through
        // the SAME trig functions used to spawn — so any drift is
        // captured by the f64 arithmetic only.
        for i in 0..4 {
            let angle_i = base - spread * 0.5 + (i as f64) * expected_step;
            let angle_next = base - spread * 0.5 + ((i + 1) as f64) * expected_step;
            let expect_vx_i = cos64(angle_i) * ENEMY_BULLET_SPEED;
            let expect_vx_next = cos64(angle_next) * ENEMY_BULLET_SPEED;
            assert!(
                (bullets[i].vx - expect_vx_i).abs() < TRIG_TOL,
                "i={} vx={} expect={}", i, bullets[i].vx, expect_vx_i,
            );
            assert!(
                (bullets[i + 1].vx - expect_vx_next).abs() < TRIG_TOL,
                "i+1={} vx={} expect={}", i+1, bullets[i+1].vx, expect_vx_next,
            );
        }
    }

    /// Returned ids are id_start, id_start+1, ..., id_start+count-1.
    /// Wave 2 dispatcher relies on this to bump
    /// `room.next_enemy_bullet_id` by `bullets.len()` after a volley.
    #[test]
    fn spread_assigns_sequential_ids() {
        let bullets = spawn_spread(42, 3, 10.0, 20.0, 0.0, 4, 1.0);
        assert_eq!(bullets.len(), 4);
        assert_eq!(bullets[0].id, 42);
        assert_eq!(bullets[1].id, 43);
        assert_eq!(bullets[2].id, 44);
        assert_eq!(bullets[3].id, 45);
        // All share the same owner.
        for b in &bullets {
            assert_eq!(b.owner_enemy_id, 3);
        }
    }

    /// Defensive: count=0 returns empty Vec (don't crash, don't
    /// divide by zero in step computation).
    #[test]
    fn spread_zero_count_returns_empty() {
        let bullets = spawn_spread(0, 0, 0.0, 0.0, 0.0, 0, 1.0);
        assert!(bullets.is_empty());
    }

    /// spawn_spiral with phase=0 vs phase=π/2 from same base_angle
    /// produces bullets whose velocity vectors differ in the
    /// expected way. At base=0, phase=0 aims along +x (vx>0, vy≈0).
    /// At base=0, phase=π/2 aims along +y (vx≈0, vy>0). The vy
    /// direction flips from ~0 to ~+speed — a clear, qualitative
    /// rotation.
    #[test]
    fn spiral_advances_with_phase() {
        let a = spawn_spiral(1, 0, 0.0, 0.0, 0.0, 0.0);
        let b = spawn_spiral(2, 0, 0.0, 0.0, 0.0, PI_2);
        // At phase=0: aimed along +x.
        assert!((a.vx - ENEMY_BULLET_SPEED).abs() < TRIG_TOL, "a.vx={}", a.vx);
        assert!(a.vy.abs() < TRIG_TOL, "a.vy={}", a.vy);
        // At phase=π/2: aimed along +y. vx swung from ~+SPEED to ~0,
        // vy swung from ~0 to ~+SPEED.
        assert!(b.vx.abs() < TRIG_TOL, "b.vx={}", b.vx);
        assert!((b.vy - ENEMY_BULLET_SPEED).abs() < TRIG_TOL, "b.vy={}", b.vy);
    }

    /// sweep_offset=0 → bullet aimed exactly at base_angle.
    /// Tolerance is the polynomial-trig band from
    /// `enemy_bullet::tests` (1e-4).
    #[test]
    fn sweep_offset_zero_matches_base() {
        let base = 0.7;
        let b = spawn_sweep(1, 0, 100.0, 200.0, base, 0.0);
        let expect_vx = cos64(base) * ENEMY_BULLET_SPEED;
        let expect_vy = sin64(base) * ENEMY_BULLET_SPEED;
        assert!((b.vx - expect_vx).abs() < TRIG_TOL, "vx={} expect={}", b.vx, expect_vx);
        assert!((b.vy - expect_vy).abs() < TRIG_TOL, "vy={} expect={}", b.vy, expect_vy);
        // Position passes through.
        assert_eq!(b.x, 100.0);
        assert_eq!(b.y, 200.0);
    }

    /// sweep_offset = +π/4 from base=0 rotates the aim CCW: the new
    /// angle is +π/4, so vx drops from ~SPEED to ~SPEED*cos(π/4) and
    /// vy rises from ~0 to ~SPEED*sin(π/4) (i.e., vy becomes
    /// positive, the CCW direction in screen coords where +y is down
    /// — convention-agnostic, what matters is that vy changes sign
    /// in the +offset case).
    #[test]
    fn sweep_offset_nonzero_rotates_aim() {
        let zero_off = spawn_sweep(1, 0, 0.0, 0.0, 0.0, 0.0);
        let pos_off = spawn_sweep(2, 0, 0.0, 0.0, 0.0, PI_4);
        // Zero-offset has vy ≈ 0; +π/4 offset gives vy ≈ +SPEED·sin(π/4)
        // ≈ +3.18, clearly positive and well above any trig-tolerance
        // noise. This is the CCW rotation the test asserts.
        assert!(zero_off.vy.abs() < TRIG_TOL, "zero_off.vy={}", zero_off.vy);
        assert!(pos_off.vy > 0.5, "pos_off.vy should be clearly positive, got {}", pos_off.vy);
        // vx shrinks because the rotated bullet sheds x-component.
        assert!(pos_off.vx < zero_off.vx, "vx should shrink under CCW rotation: zero={} pos={}",
                zero_off.vx, pos_off.vx);
    }

    /// spawn_explosive carries the caller-supplied damage and radius
    /// through to the bullet, but speed and lifetime still come from
    /// the module defaults (TITAN's heavy projectile flies the same
    /// duration as a normal enemy bullet — only impact differs).
    #[test]
    fn explosive_carries_custom_damage_and_radius() {
        let b = spawn_explosive(99, 4, 50.0, 60.0, 0.0, 3.0, 14.0);
        assert_eq!(b.id, 99);
        assert_eq!(b.owner_enemy_id, 4);
        assert_eq!(b.damage, 3.0);
        assert_eq!(b.radius, 14.0);
        // Defaults intact.
        assert_eq!(b.life_remaining, ENEMY_BULLET_LIFETIME_TICKS);
        assert!((b.vx - ENEMY_BULLET_SPEED).abs() < TRIG_TOL, "vx={}", b.vx);
        assert!(b.vy.abs() < TRIG_TOL, "vy={}", b.vy);
    }

    /// Sanity check that every helper routes through `trig::cos64`
    /// (and not, say, `f64::cos`) by spawning at angle 0 and asserting
    /// vx ≈ ENEMY_BULLET_SPEED. If anyone swaps in the platform `cos`
    /// in a future edit, vx would still pass this test — but a
    /// stronger guard exists at the workspace level (the trig module
    /// is the only sin/cos source). This test catches the obvious
    /// regression of "helper forgets to multiply by speed."
    #[test]
    fn all_helpers_use_polynomial_trig() {
        let spread = spawn_spread(0, 0, 0.0, 0.0, 0.0, 1, 0.0);
        let spiral = spawn_spiral(0, 0, 0.0, 0.0, 0.0, 0.0);
        let sweep = spawn_sweep(0, 0, 0.0, 0.0, 0.0, 0.0);
        let explosive = spawn_explosive(0, 0, 0.0, 0.0, 0.0, 2.0, 9.0);
        for (name, vx) in &[
            ("spread", spread[0].vx),
            ("spiral", spiral.vx),
            ("sweep", sweep.vx),
            ("explosive", explosive.vx),
        ] {
            assert!(
                (vx - ENEMY_BULLET_SPEED).abs() < TRIG_TOL,
                "{}: vx={} expected ≈{}", name, vx, ENEMY_BULLET_SPEED,
            );
        }
    }

    /// count=3, total_spread=π/2 — bullet 0 aimed at base - π/4,
    /// bullet 2 aimed at base + π/4 — verify velocities reconstruct
    /// via cos64/sin64 at those angles.
    #[test]
    fn spread_velocities_match_angles() {
        let base = 0.3;
        let spread = PI_2;
        let bullets = spawn_spread(0, 0, 0.0, 0.0, base, 3, spread);
        assert_eq!(bullets.len(), 3);

        let left_angle = base - PI_4;
        let right_angle = base + PI_4;

        let expect_left_vx = cos64(left_angle) * ENEMY_BULLET_SPEED;
        let expect_left_vy = sin64(left_angle) * ENEMY_BULLET_SPEED;
        let expect_right_vx = cos64(right_angle) * ENEMY_BULLET_SPEED;
        let expect_right_vy = sin64(right_angle) * ENEMY_BULLET_SPEED;

        assert!((bullets[0].vx - expect_left_vx).abs() < TRIG_TOL,
                "bullet0 vx={} expect={}", bullets[0].vx, expect_left_vx);
        assert!((bullets[0].vy - expect_left_vy).abs() < TRIG_TOL,
                "bullet0 vy={} expect={}", bullets[0].vy, expect_left_vy);
        assert!((bullets[2].vx - expect_right_vx).abs() < TRIG_TOL,
                "bullet2 vx={} expect={}", bullets[2].vx, expect_right_vx);
        assert!((bullets[2].vy - expect_right_vy).abs() < TRIG_TOL,
                "bullet2 vy={} expect={}", bullets[2].vy, expect_right_vy);
    }

    /// Defaults sanity: every helper that doesn't take overrides
    /// produces bullets with `ENEMY_BULLET_DAMAGE` / `ENEMY_BULLET_RADIUS`
    /// / `ENEMY_BULLET_LIFETIME_TICKS` from the module consts.
    #[test]
    fn pattern_defaults_match_enemy_bullet_consts() {
        let spread = spawn_spread(0, 0, 0.0, 0.0, 0.0, 1, 0.0);
        let spiral = spawn_spiral(0, 0, 0.0, 0.0, 0.0, 0.0);
        let sweep = spawn_sweep(0, 0, 0.0, 0.0, 0.0, 0.0);
        for b in &[spread[0], spiral, sweep] {
            assert_eq!(b.damage, ENEMY_BULLET_DAMAGE);
            assert_eq!(b.radius, ENEMY_BULLET_RADIUS);
            assert_eq!(b.life_remaining, ENEMY_BULLET_LIFETIME_TICKS);
            assert!(b.active);
        }
    }
}
