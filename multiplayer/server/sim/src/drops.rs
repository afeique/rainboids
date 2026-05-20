//! Phase 4 drop-orb sim — gold + health orbs from enemy/asteroid deaths.
//!
//! Mirrors solo's `js/sim/drops.js`. Pure step: drift + friction +
//! magnet + lifetime. Pickup is owned by `collision.rs` (Wave 2). Spawn
//! site (which enemy died → which orbs drop) is owned by `room.rs`
//! (Wave 2). This module owns the orb's "alive in the world" lifecycle.
//!
//! Deterministic: spawn uses `RngCtx::from_sub_seed(sub_seed)` for the
//! initial outward kick. update_orb is fully deterministic given inputs.
//!
//! Phase 4 step 1 divergences from solo's `js/sim/drops.js`:
//!   - Tractor branch (`tractorEngaged`) is skipped entirely. The
//!     tractor skill isn't implemented in sim yet (Phase 5 follow-up),
//!     so gold orbs in sim drift freely until contact pickup.
//!   - `healthMagnetScale` powerup branch is skipped (no powerups in
//!     Phase 4 step 1). Magnet uses scale = 1.0 verbatim.
//!   - Cross-runtime trig — initial spawn velocity uses `trig::cos64`
//!     and `trig::sin64` rather than `f64::cos`/`f64::sin` so server
//!     and WASM client produce bit-identical orb state.

use crate::rng_ctx::RngCtx;
use crate::state::ShipState;
use crate::trig::{cos64, sin64};

/// Gold orb kind discriminator. Tractor-only magnet (no passive pull
/// in Phase 4 step 1 since tractor skill isn't implemented).
pub const ORB_KIND_GOLD: u8 = 0;

/// Health orb kind discriminator. Two-tier passive magnet (gentle at
/// 110 px, snap at 45 px).
pub const ORB_KIND_HEALTH: u8 = 1;

/// Initial outward speed range when an orb spawns. Mirrors solo's
/// color-star.js spawn velocity (random direction, modest speed).
pub const ORB_SPAWN_SPEED_MIN: f64 = 0.4;
pub const ORB_SPAWN_SPEED_MAX: f64 = 1.6;

/// Lifetime (ticks). 7200 = 120 s at 60 Hz. Health orbs ignore this
/// (permanent until collected, per solo 5.102.0 rule).
pub const ORB_LIFETIME_TICKS: u32 = 7200;

/// Friction multipliers. Health orbs use heavier friction so the magnet
/// pump doesn't accelerate them absurdly (steady-state v ≈ F/(1-f)).
pub const ORB_FRICTION_HEALTH: f64 = 0.92;
pub const ORB_FRICTION_DEFAULT: f64 = 0.985;

/// Two-tier magnet radii + forces (health orbs only).
pub const ORB_MAGNET_FAR_RADIUS: f64 = 110.0;
pub const ORB_MAGNET_NEAR_RADIUS: f64 = 45.0;
pub const ORB_MAGNET_FAR_FORCE: f64 = 5.0;
pub const ORB_MAGNET_NEAR_FORCE: f64 = 14.0;

/// Opacity fade-out window for gold orbs (last 120 ticks). Pinned to
/// 1.0 for health orbs (permanent).
pub const ORB_OPACITY_FADE_FRAMES: u32 = 120;

/// Body radius for pickup detection. (Wave 2 collision.rs reads this.)
pub const ORB_RADIUS: f64 = 8.0;

#[derive(Debug, Clone, Copy)]
pub struct OrbState {
    pub id: u32,
    pub kind: u8,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub life_ticks: u32,
    pub opacity: f64,
    pub active: bool,
}

impl OrbState {
    /// True if the orb should be removed from the sim this tick.
    /// Health orbs are permanent (only become dead via `!active`),
    /// gold orbs become dead when their life counter hits zero.
    pub fn dead(&self) -> bool {
        !self.active || (self.kind != ORB_KIND_HEALTH && self.life_ticks == 0)
    }
}

/// Spawn an orb at a death site with a deterministic outward kick.
///
/// Both server and WASM client construct from the same `(id, kind,
/// src_x, src_y, sub_seed)` and get the same orb. Mirrors
/// `enemy::spawn_hunter_from_seed` shape.
pub fn spawn_orb_from_seed(
    id: u32,
    kind: u8,
    src_x: f64,
    src_y: f64,
    sub_seed: u64,
) -> OrbState {
    let mut rng = RngCtx::from_sub_seed(sub_seed);
    let angle = rng.unit_circle_angle();
    let speed = rng.range_f64(ORB_SPAWN_SPEED_MIN, ORB_SPAWN_SPEED_MAX);
    OrbState {
        id,
        kind,
        x: src_x,
        y: src_y,
        vx: cos64(angle) * speed,
        vy: sin64(angle) * speed,
        life_ticks: ORB_LIFETIME_TICKS,
        opacity: 1.0,
        active: true,
    }
}

/// Per-tick orb update. Mutates `orb`. Reads `ships` (live ones) for
/// magnet pull (health orbs). Wraps at field edges like asteroids do.
///
/// Pure deterministic — no RNG, no time queries. The pickup decision
/// is NOT here (collision.rs in Wave 2 will handle ship × orb contact).
pub fn update_orb(orb: &mut OrbState, ships: &[ShipState], field_w: f64, field_h: f64) {
    if !orb.active {
        return;
    }

    let is_health = orb.kind == ORB_KIND_HEALTH;

    // ── Lifetime tick ──
    // Mirrors `js/sim/drops.js` lines 149-155. Health drops are
    // permanent (5.102.0 rule); gold drops decrement and deactivate
    // when they hit zero.
    if !is_health {
        if orb.life_ticks == 0 {
            orb.active = false;
            return;
        }
        orb.life_ticks -= 1;
        if orb.life_ticks == 0 {
            orb.active = false;
            return;
        }
    }

    // ── Friction ──
    // Health orbs use heavier friction (0.92) so the magnet pump
    // doesn't accelerate them to absurd speeds. Gold orbs drift more
    // freely (0.985). Mirrors `js/sim/drops.js` lines 162-164.
    let friction = if is_health {
        ORB_FRICTION_HEALTH
    } else {
        ORB_FRICTION_DEFAULT
    };
    orb.vx *= friction;
    orb.vy *= friction;

    // ── Position update ──
    // Per-tick delta, not per-second integration (legacy behavior).
    // Mirrors `js/sim/drops.js` lines 169-170.
    orb.x += orb.vx;
    orb.y += orb.vy;

    // ── Wrap at field edges ──
    // Matches `asteroid::update_asteroid` modulo wrap with a radius
    // buffer so a half-off-screen orb pops back in fully off-screen
    // on the opposite side.
    let r = ORB_RADIUS;
    if orb.x < -r {
        orb.x = field_w + r;
    } else if orb.x > field_w + r {
        orb.x = -r;
    }
    if orb.y < -r {
        orb.y = field_h + r;
    } else if orb.y > field_h + r {
        orb.y = -r;
    }

    // ── Opacity fade ──
    // Health drops are permanent (pinned 1.0). Gold drops stay at
    // 1.0 for the long tail and fade out over the last
    // `ORB_OPACITY_FADE_FRAMES` ticks. Mirrors `js/sim/drops.js`
    // line 178.
    if is_health {
        orb.opacity = 1.0;
    } else {
        let ratio = orb.life_ticks as f64 / ORB_OPACITY_FADE_FRAMES as f64;
        orb.opacity = if ratio > 1.0 { 1.0 } else { ratio };
    }

    // ── Find the closest live ship for magnet calculations ──
    // Mirrors `js/sim/drops.js` lines 188-204. Skips inactive and
    // downed ships (downed ships shouldn't pull drops — they can't
    // collect them).
    let mut nearest_dx = 0.0_f64;
    let mut nearest_dy = 0.0_f64;
    let mut nearest_dist = f64::INFINITY;
    let mut found = false;
    for s in ships {
        if !s.active || s.downed {
            continue;
        }
        let dx = s.x - orb.x;
        let dy = s.y - orb.y;
        let dist = dx.hypot(dy);
        if dist < nearest_dist {
            nearest_dist = dist;
            nearest_dx = dx;
            nearest_dy = dy;
            found = true;
        }
    }
    if !found {
        return;
    }
    let dist = nearest_dist;

    // ── Health-orb passive magnet (two-tier) ──
    // Verbatim from `js/sim/drops.js` lines 229-238. Health orbs only;
    // gold orbs drift freely in Phase 4 step 1 (no tractor yet).
    //
    // Phase 4 step 1 — `healthMagnetScale` powerup is skipped (no
    // powerups yet). Scale = 1.0, so the constants apply verbatim.
    if is_health && dist > 1.0 && dist < ORB_MAGNET_FAR_RADIUS {
        let inv = 1.0 / dist;
        let far_factor = (ORB_MAGNET_FAR_RADIUS - dist) / ORB_MAGNET_FAR_RADIUS;
        orb.vx += nearest_dx * inv * ORB_MAGNET_FAR_FORCE * far_factor;
        orb.vy += nearest_dy * inv * ORB_MAGNET_FAR_FORCE * far_factor;
        if dist < ORB_MAGNET_NEAR_RADIUS {
            let near_factor = (ORB_MAGNET_NEAR_RADIUS - dist) / ORB_MAGNET_NEAR_RADIUS;
            orb.vx += nearest_dx * inv * ORB_MAGNET_NEAR_FORCE * near_factor;
            orb.vy += nearest_dy * inv * ORB_MAGNET_NEAR_FORCE * near_factor;
        }
    }

    // ── Tractor beam pull ──
    // Skipped in Phase 4 step 1. Solo's `js/sim/drops.js` lines
    // 246-255 implement a tractor scoop for gold orbs; sim will
    // wire this in Phase 5 once the tractor skill exists.
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ShipState;

    /// Build a synthetic ship at a known location, alive + not downed.
    fn live_ship(x: f64, y: f64) -> ShipState {
        let mut s = ShipState::default();
        s.x = x;
        s.y = y;
        s.active = true;
        s.downed = false;
        s
    }

    /// Build a synthetic downed ship at a known location.
    fn downed_ship(x: f64, y: f64) -> ShipState {
        let mut s = ShipState::default();
        s.x = x;
        s.y = y;
        s.active = true;
        s.downed = true;
        s
    }

    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_orb_from_seed(7, ORB_KIND_GOLD, 500.0, 300.0, 0xDEAD_BEEF);
        let b = spawn_orb_from_seed(7, ORB_KIND_GOLD, 500.0, 300.0, 0xDEAD_BEEF);
        assert_eq!(a.id, b.id);
        assert_eq!(a.kind, b.kind);
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.vx.to_bits(), b.vx.to_bits());
        assert_eq!(a.vy.to_bits(), b.vy.to_bits());
        assert_eq!(a.life_ticks, b.life_ticks);
        assert_eq!(a.opacity.to_bits(), b.opacity.to_bits());
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn spawn_position_is_at_src() {
        // Initial outward kick lives in vx/vy, not in position.
        for seed in 0u64..50 {
            let orb = spawn_orb_from_seed(1, ORB_KIND_HEALTH, 123.5, 678.25, seed);
            assert_eq!(orb.x.to_bits(), 123.5_f64.to_bits());
            assert_eq!(orb.y.to_bits(), 678.25_f64.to_bits());
        }
    }

    #[test]
    fn spawn_velocity_magnitude_within_range() {
        // For many sub-seeds, sqrt(vx^2 + vy^2) is in
        // [ORB_SPAWN_SPEED_MIN, ORB_SPAWN_SPEED_MAX). Slight slack on
        // the upper bound is fine — range_f64 is half-open.
        for seed in 0u64..200 {
            let orb = spawn_orb_from_seed(1, ORB_KIND_GOLD, 0.0, 0.0, seed);
            let mag = (orb.vx * orb.vx + orb.vy * orb.vy).sqrt();
            assert!(
                mag >= ORB_SPAWN_SPEED_MIN - 1e-9 && mag < ORB_SPAWN_SPEED_MAX + 1e-9,
                "seed {seed}: mag {mag} out of [{}, {})",
                ORB_SPAWN_SPEED_MIN,
                ORB_SPAWN_SPEED_MAX
            );
        }
    }

    #[test]
    fn gold_orb_lifetime_decrements_to_zero() {
        let mut orb = spawn_orb_from_seed(1, ORB_KIND_GOLD, 500.0, 500.0, 42);
        let ships: [ShipState; 0] = [];
        // Tick past the lifetime; ORB_LIFETIME_TICKS + a few extra to
        // guarantee the deactivate branch fires.
        for _ in 0..(ORB_LIFETIME_TICKS as usize + 10) {
            update_orb(&mut orb, &ships, 1920.0, 1080.0);
            if !orb.active {
                break;
            }
        }
        assert!(!orb.active, "gold orb should deactivate after lifetime");
    }

    #[test]
    fn health_orb_lifetime_is_permanent() {
        let mut orb = spawn_orb_from_seed(1, ORB_KIND_HEALTH, 960.0, 540.0, 42);
        // Park a ship far away so the magnet doesn't fire and disturb
        // anything — we only care about lifetime here.
        let ships = [live_ship(5000.0, 5000.0)];
        for _ in 0..(ORB_LIFETIME_TICKS as usize + 100) {
            update_orb(&mut orb, &ships, 1920.0, 1080.0);
        }
        assert!(orb.active, "health orb should be permanent");
        assert_eq!(
            orb.life_ticks, ORB_LIFETIME_TICKS,
            "health orb's life_ticks should never decrement"
        );
    }

    #[test]
    fn gold_orb_opacity_fades_at_end() {
        let mut orb = spawn_orb_from_seed(1, ORB_KIND_GOLD, 500.0, 500.0, 42);
        let ships: [ShipState; 0] = [];

        // Tick to a point well before the fade window — opacity should
        // still be pinned to 1.0.
        let pre_fade_ticks = (ORB_LIFETIME_TICKS - ORB_OPACITY_FADE_FRAMES - 100) as usize;
        for _ in 0..pre_fade_ticks {
            update_orb(&mut orb, &ships, 1920.0, 1080.0);
        }
        assert!(
            (orb.opacity - 1.0).abs() < 1e-9,
            "opacity should be 1.0 in long tail, got {}",
            orb.opacity
        );

        // Tick into the fade window. Take a sample after roughly half
        // the fade window has elapsed and verify opacity is around 0.5.
        let into_fade = (ORB_OPACITY_FADE_FRAMES / 2) as usize + 100;
        for _ in 0..into_fade {
            update_orb(&mut orb, &ships, 1920.0, 1080.0);
        }
        assert!(orb.active, "orb should still be active mid-fade");
        assert!(
            orb.opacity > 0.0 && orb.opacity < 1.0,
            "opacity should be partially faded, got {}",
            orb.opacity
        );
        // Verify the formula: opacity = life_ticks / FADE_FRAMES.
        let expected = orb.life_ticks as f64 / ORB_OPACITY_FADE_FRAMES as f64;
        assert!(
            (orb.opacity - expected).abs() < 1e-9,
            "opacity = {} expected ~{} from life_ticks {}",
            orb.opacity,
            expected,
            orb.life_ticks
        );
    }

    #[test]
    fn health_orb_magnet_pulls_toward_ship() {
        // Orb at (100, 100), ship at (200, 100) — dist = 100, inside
        // the FAR radius (110) but outside the NEAR radius (45). One
        // tick should push vx in the positive (rightward) direction.
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_HEALTH,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            life_ticks: ORB_LIFETIME_TICKS,
            opacity: 1.0,
            active: true,
        };
        let ships = [live_ship(200.0, 100.0)];
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        assert!(
            orb.vx > 0.0,
            "magnet should pull vx rightward, got {}",
            orb.vx
        );

        // Verify magnitude matches the verbatim formula. The orb's
        // pre-friction vx was 0; friction multiplies the (still-zero)
        // velocity; position is updated using the friction-applied
        // velocity (also zero); THEN the magnet draws from the orb's
        // POST-position-update location. So we need to compute the
        // magnet delta from (100 + 0, 100 + 0) = (100, 100).
        let dx: f64 = 200.0 - 100.0;
        let dy: f64 = 100.0 - 100.0;
        let dist = (dx * dx + dy * dy).sqrt(); // 100
        let inv = 1.0 / dist;
        let far_factor = (ORB_MAGNET_FAR_RADIUS - dist) / ORB_MAGNET_FAR_RADIUS;
        // dist 100 > NEAR radius 45 → near branch not engaged.
        let expected_vx = 0.0 * ORB_FRICTION_HEALTH + dx * inv * ORB_MAGNET_FAR_FORCE * far_factor;
        assert!(
            (orb.vx - expected_vx).abs() < 1e-9,
            "vx = {} expected {} from verbatim magnet formula",
            orb.vx,
            expected_vx
        );
    }

    #[test]
    fn gold_orb_no_magnet() {
        // Orb at (100, 100), ship at (200, 100). Gold orbs get no
        // magnet pull in Phase 4 step 1 — only friction applies.
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_GOLD,
            x: 100.0,
            y: 100.0,
            vx: 0.5,
            vy: 0.0,
            life_ticks: ORB_LIFETIME_TICKS,
            opacity: 1.0,
            active: true,
        };
        let ships = [live_ship(200.0, 100.0)];
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        // After friction: vx = 0.5 * 0.985 = 0.4925 (gold friction).
        let expected_vx = 0.5 * ORB_FRICTION_DEFAULT;
        assert!(
            (orb.vx - expected_vx).abs() < 1e-9,
            "vx = {} expected {} (friction-only, no magnet)",
            orb.vx,
            expected_vx
        );
        // No magnet → vy stays 0 after friction.
        assert!(orb.vy.abs() < 1e-9, "vy should remain 0, got {}", orb.vy);
    }

    #[test]
    fn magnet_ignores_downed_ships() {
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_HEALTH,
            x: 100.0,
            y: 100.0,
            vx: 0.0,
            vy: 0.0,
            life_ticks: ORB_LIFETIME_TICKS,
            opacity: 1.0,
            active: true,
        };
        // Only a downed ship in range — magnet should NOT pull.
        let ships = [downed_ship(150.0, 100.0)];
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        // Friction alone on 0 velocity = 0. No magnet.
        assert!(orb.vx.abs() < 1e-9, "vx should stay 0, got {}", orb.vx);
        assert!(orb.vy.abs() < 1e-9, "vy should stay 0, got {}", orb.vy);
    }

    #[test]
    fn wraps_at_field_edges() {
        // Orb just outside the +x edge with a small rightward velocity.
        // After tick: position passes the wrap threshold and snaps to
        // the negative side. Matches asteroid.rs wrap formula exactly.
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_GOLD,
            x: 1920.5,
            y: 540.0,
            vx: 0.1,
            vy: 0.0,
            life_ticks: ORB_LIFETIME_TICKS,
            opacity: 1.0,
            active: true,
        };
        let ships: [ShipState; 0] = [];
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        // Friction: vx = 0.1 * 0.985 = 0.0985.
        // Position: 1920.5 + 0.0985 = 1920.5985. This is > field_w + r
        // (1920 + 8 = 1928)? No, 1920.5985 < 1928, so NO wrap on this
        // tick. Adjust the test: start far enough past the edge for
        // the wrap to fire.
        // ... actually let's re-spawn with x > field_w + ORB_RADIUS.
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_GOLD,
            x: 1930.0,
            y: 540.0,
            vx: 0.1,
            vy: 0.0,
            life_ticks: ORB_LIFETIME_TICKS,
            opacity: 1.0,
            active: true,
        };
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        // Wrap branch: x > field_w + r → x becomes -r.
        assert!(
            (orb.x - (-ORB_RADIUS)).abs() < 1e-9,
            "x should wrap to -ORB_RADIUS ({}), got {}",
            -ORB_RADIUS,
            orb.x
        );
    }

    #[test]
    fn dead_orb_is_skipped() {
        let mut orb = OrbState {
            id: 1,
            kind: ORB_KIND_GOLD,
            x: 500.0,
            y: 500.0,
            vx: 1.0,
            vy: 1.0,
            life_ticks: 100,
            opacity: 0.5,
            active: false,
        };
        let snapshot = orb;
        let ships = [live_ship(500.0, 500.0)];
        update_orb(&mut orb, &ships, 1920.0, 1080.0);
        // No state change at all — early return on !active.
        assert_eq!(orb.x.to_bits(), snapshot.x.to_bits());
        assert_eq!(orb.y.to_bits(), snapshot.y.to_bits());
        assert_eq!(orb.vx.to_bits(), snapshot.vx.to_bits());
        assert_eq!(orb.vy.to_bits(), snapshot.vy.to_bits());
        assert_eq!(orb.life_ticks, snapshot.life_ticks);
        assert_eq!(orb.opacity.to_bits(), snapshot.opacity.to_bits());
        assert_eq!(orb.active, snapshot.active);
    }
}
