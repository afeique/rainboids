//! Phase-3 asteroid sim — drift + deterministic split.
//!
//! Authored fresh 2026-05-17 from `js/modules/world/asteroid.js`
//! (drift / wrap behavior) + `js/modules/combat/collision-system.js`
//! (split tiering at lines ~270-310). Per the WASM-pivot Phase-3
//! "Architecture Revision", all randomness is sourced from the
//! room's RngCtx via deterministic sub-seeds; both the WASM client
//! and the native server compute identical asteroid state every
//! tick.

use super::rng_ctx::RngCtx;
use super::trig::{atan2_64, cos64, sin64, TAU};

use serde::{Deserialize, Serialize};

/// Minimum asteroid radius (px). Matches solo's `MIN_AST_RAD = 15`.
pub const MIN_AST_RAD: f64 = 15.0;

/// Maximum asteroid radius (px). Matches solo's spawn upper bound.
pub const MAX_AST_RAD: f64 = 50.0;

/// Drift speed (px/tick). Matches `GAME_CONFIG.AST_SPEED = 3.5 * (30/60)`.
pub const AST_SPEED: f64 = 1.75;

/// Per-tick rotational drift range (radians). Matches solo's
/// `random(-0.04, 0.04)` rot-vel pattern in asteroid.js.
pub const ROT_VEL_RANGE: f64 = 0.04;

/// HP per radius unit. Matches solo's `hp = round(radius / 5)`
/// proportionality at asteroid.js construction time.
pub const HP_PER_RADIUS: f64 = 0.2;

/// Radius shrink factor sampled per split; chosen as a tight band
/// around solo's `1 / sqrt(child_count)` rule (≈ 0.577 for 3,
/// 0.5 for 4). The 0.70-0.85 range is slightly more generous than
/// strict 1/√n so split chains feel meaty without trivializing
/// fragment HP.
pub const SPLIT_RADIUS_FACTOR_MIN: f64 = 0.70;
pub const SPLIT_RADIUS_FACTOR_MAX: f64 = 0.85;

/// Probability of producing 3 (vs 4) children on split. Matches
/// solo's `Math.random() < 0.5 ? 2 : 3) + 1` 50/50 split.
pub const SPLIT_THREE_CHILD_PROB: f64 = 0.5;

/// Child-speed multiplier vs the parent's pre-split speed. Children
/// fly out a little faster than the parent drifted in, mirroring
/// solo's `random(4.5, 7.5)` burst speed (which is ~1.2-2x the
/// parent's AST_SPEED drift).
pub const SPLIT_CHILD_SPEED_FACTOR: f64 = 1.2;

/// Minimum parent `base_radius` required for splitting; smaller
/// asteroids destroy on death with no children. Matches
/// `collision-system.js:280-310` tiering threshold.
pub const SPLIT_THRESHOLD: f64 = MIN_AST_RAD + 5.0;

/// Plain-data asteroid snapshot. No methods beyond the free fns
/// below so both `server-bin` and the WASM client can construct,
/// serialize, and mutate the struct directly.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AsteroidState {
    /// Stable id assigned by the room's `next_asteroid_id` counter.
    pub id: u32,
    /// World-space X position (px).
    pub x: f64,
    /// World-space Y position (px).
    pub y: f64,
    /// Velocity X component (px/tick).
    pub vx: f64,
    /// Velocity Y component (px/tick).
    pub vy: f64,
    /// Current rotation (rad), in `[0, TAU)`.
    pub rot: f64,
    /// Per-tick rotational velocity (rad/tick).
    pub rot_vel: f64,
    /// Current collision radius (px).
    pub radius: f64,
    /// Size at spawn — used for the split-or-destroy threshold.
    pub base_radius: f64,
    /// Current hit points.
    pub hp: f64,
    /// HP at spawn — for normalized health-bar rendering.
    pub max_hp: f64,
    /// Whether the asteroid is live in the sim.
    pub active: bool,
}

impl AsteroidState {
    /// True if the asteroid should be removed from the sim this tick.
    pub fn dead(&self) -> bool {
        !self.active || self.hp <= 0.0
    }
}

/// Spawn a fresh asteroid from a sub-seed. Both server and WASM
/// client call this with identical `id` + `rng_subseed` (delivered
/// via the `AsteroidSpawn` event) and produce identical state.
pub fn spawn_from_seed(id: u32, rng_subseed: u64, field_w: f64, field_h: f64) -> AsteroidState {
    let mut rng = RngCtx::from_sub_seed(rng_subseed);
    // Spawn radius weighted toward the larger end so initial asteroids
    // have room to split. Matches solo's intent of "spawn big, split smaller".
    let radius = rng.range_f64(MIN_AST_RAD + 20.0, MAX_AST_RAD);
    let max_hp = (radius * HP_PER_RADIUS).max(1.0);
    let angle = rng.unit_circle_angle();
    AsteroidState {
        id,
        x: rng.range_f64(radius, field_w - radius),
        y: rng.range_f64(radius, field_h - radius),
        vx: cos64(angle) * AST_SPEED,
        vy: sin64(angle) * AST_SPEED,
        rot: rng.unit_circle_angle(),
        rot_vel: rng.range_f64(-ROT_VEL_RANGE, ROT_VEL_RANGE),
        radius,
        base_radius: radius,
        hp: max_hp,
        max_hp,
        active: true,
    }
}

/// Per-tick update: integrate position + rotation, wrap at edges.
/// Mirrors solo's `asteroid.update()` wrap behavior.
pub fn update_asteroid(a: &mut AsteroidState, field_w: f64, field_h: f64) {
    if !a.active {
        return;
    }

    a.x += a.vx;
    a.y += a.vy;
    a.rot += a.rot_vel;

    // Wrap at edges with a radius-sized buffer so a half-off-screen
    // asteroid pops back in fully off-screen on the opposite side.
    if a.x < -a.radius {
        a.x = field_w + a.radius;
    } else if a.x > field_w + a.radius {
        a.x = -a.radius;
    }
    if a.y < -a.radius {
        a.y = field_h + a.radius;
    } else if a.y > field_h + a.radius {
        a.y = -a.radius;
    }

    // Keep rot bounded for stable serialization / hashing.
    if a.rot >= TAU {
        a.rot -= TAU;
    } else if a.rot < 0.0 {
        a.rot += TAU;
    }
}

/// Compute the children produced by splitting `parent` using the
/// given sub-seed. Both server and client call this with the same
/// `parent` snapshot at the moment of split + the same sub-seed,
/// and they produce identical children (positions, velocities,
/// radii, hp). The caller assigns child ids monotonically from
/// the room's `next_asteroid_id` counter — both sides do this
/// identically because both sides agree on event ordering.
///
/// Mirrors `collision-system.js:280-310`: parent splits into 3-4
/// children iff `base_radius >= MIN_AST_RAD + 5`; otherwise the
/// parent destroys on death with no children.
pub fn compute_split_children(
    parent: &AsteroidState,
    rng_subseed: u64,
    child_id_start: u32,
) -> Vec<AsteroidState> {
    if parent.base_radius < SPLIT_THRESHOLD {
        return Vec::new();
    }
    let mut rng = RngCtx::from_sub_seed(rng_subseed);
    let child_count = if rng.range_f64(0.0, 1.0) < SPLIT_THREE_CHILD_PROB {
        3
    } else {
        4
    };
    let radius_factor = rng.range_f64(SPLIT_RADIUS_FACTOR_MIN, SPLIT_RADIUS_FACTOR_MAX);
    // Parent speed magnitude. `sqrt` is IEEE-754 deterministic across
    // WASM + x86_64 (unlike `sin`/`cos`/`atan2`), so using it directly
    // here does not break the cross-runtime parity invariant.
    let parent_speed = (parent.vx * parent.vx + parent.vy * parent.vy).sqrt();
    let parent_dir = atan2_64(parent.vy, parent.vx);
    let spread = TAU / child_count as f64;

    let mut children = Vec::with_capacity(child_count);
    for i in 0..child_count {
        // Symmetric spread around the parent direction so adjacent
        // fragments can't share a heading (matches solo's anti-overlap
        // sliceWidth pattern at collision-system.js:275-287).
        let theta = parent_dir + spread * (i as f64 - (child_count - 1) as f64 * 0.5);
        let child_radius = (parent.radius * radius_factor).max(MIN_AST_RAD);
        let child_speed = parent_speed * SPLIT_CHILD_SPEED_FACTOR;
        let child_hp = (child_radius * HP_PER_RADIUS).max(1.0);
        children.push(AsteroidState {
            id: child_id_start + i as u32,
            x: parent.x + cos64(theta) * (parent.radius * 0.6),
            y: parent.y + sin64(theta) * (parent.radius * 0.6),
            vx: cos64(theta) * child_speed,
            vy: sin64(theta) * child_speed,
            rot: rng.unit_circle_angle(),
            rot_vel: rng.range_f64(-ROT_VEL_RANGE, ROT_VEL_RANGE),
            radius: child_radius,
            base_radius: child_radius,
            hp: child_hp,
            max_hp: child_hp,
            active: true,
        });
    }
    children
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper — build a synthetic parent at a known position/velocity
    /// without going through `spawn_from_seed` (which would couple the
    /// test to the RNG sequence).
    fn make_parent(radius: f64) -> AsteroidState {
        let hp = (radius * HP_PER_RADIUS).max(1.0);
        AsteroidState {
            id: 0,
            x: 960.0,
            y: 540.0,
            vx: 1.0,
            vy: 0.5,
            rot: 0.0,
            rot_vel: 0.0,
            radius,
            base_radius: radius,
            hp,
            max_hp: hp,
            active: true,
        }
    }

    #[test]
    fn spawn_from_same_seed_is_identical() {
        let a = spawn_from_seed(1, 42, 1920.0, 1080.0);
        let b = spawn_from_seed(1, 42, 1920.0, 1080.0);
        assert_eq!(a.id, b.id);
        assert_eq!(a.x.to_bits(), b.x.to_bits());
        assert_eq!(a.y.to_bits(), b.y.to_bits());
        assert_eq!(a.vx.to_bits(), b.vx.to_bits());
        assert_eq!(a.vy.to_bits(), b.vy.to_bits());
        assert_eq!(a.rot.to_bits(), b.rot.to_bits());
        assert_eq!(a.rot_vel.to_bits(), b.rot_vel.to_bits());
        assert_eq!(a.radius.to_bits(), b.radius.to_bits());
        assert_eq!(a.base_radius.to_bits(), b.base_radius.to_bits());
        assert_eq!(a.hp.to_bits(), b.hp.to_bits());
        assert_eq!(a.max_hp.to_bits(), b.max_hp.to_bits());
        assert_eq!(a.active, b.active);
    }

    #[test]
    fn update_wraps_at_edges() {
        let field_w = 1920.0_f64;
        let field_h = 1080.0_f64;
        let radius = 20.0_f64;
        let mut a = AsteroidState {
            id: 7,
            x: -100.0,
            y: 540.0,
            vx: -1.0,
            vy: 0.0,
            rot: 0.0,
            rot_vel: 0.0,
            radius,
            base_radius: radius,
            hp: 4.0,
            max_hp: 4.0,
            active: true,
        };
        update_asteroid(&mut a, field_w, field_h);
        // x started at -100, moved -1 → -101; -101 < -radius (-20),
        // so wrap to field_w + radius = 1940.
        assert!((a.x - (field_w + radius)).abs() < 1e-9, "x = {}", a.x);
    }

    #[test]
    fn split_children_count_in_range() {
        let parent = make_parent(MAX_AST_RAD);
        for seed in 0u64..100 {
            let children = compute_split_children(&parent, seed, 1);
            let n = children.len();
            assert!(
                n == 3 || n == 4,
                "seed {} produced {} children (expected 3 or 4)",
                seed,
                n
            );
        }
    }

    #[test]
    fn split_below_threshold_returns_empty() {
        let parent = make_parent(15.0);
        let children = compute_split_children(&parent, 123, 1);
        assert!(
            children.is_empty(),
            "expected empty Vec for sub-threshold parent, got {} children",
            children.len()
        );
    }

    #[test]
    fn split_same_seed_same_children() {
        let parent = make_parent(MAX_AST_RAD);
        let a = compute_split_children(&parent, 999, 100);
        let b = compute_split_children(&parent, 999, 100);
        assert_eq!(a.len(), b.len());
        for (ca, cb) in a.iter().zip(b.iter()) {
            assert_eq!(ca.id, cb.id);
            assert_eq!(ca.x.to_bits(), cb.x.to_bits());
            assert_eq!(ca.y.to_bits(), cb.y.to_bits());
            assert_eq!(ca.vx.to_bits(), cb.vx.to_bits());
            assert_eq!(ca.vy.to_bits(), cb.vy.to_bits());
            assert_eq!(ca.radius.to_bits(), cb.radius.to_bits());
            assert_eq!(ca.base_radius.to_bits(), cb.base_radius.to_bits());
            assert_eq!(ca.hp.to_bits(), cb.hp.to_bits());
            assert_eq!(ca.max_hp.to_bits(), cb.max_hp.to_bits());
            assert_eq!(ca.rot.to_bits(), cb.rot.to_bits());
            assert_eq!(ca.rot_vel.to_bits(), cb.rot_vel.to_bits());
        }
    }

    #[test]
    fn each_child_is_smaller_than_parent() {
        // Originally tested "sum of children < parent.base_radius" but
        // with the chosen radius_factor band (0.70-0.85), 3 children
        // at 70-85% of parent sum to MORE than parent — that's how
        // solo's split actually works ("split into chunks that ARE
        // smaller individually but cumulatively larger because
        // they're separate entities"). The real invariant: each
        // child is individually smaller than the parent.
        let parent = make_parent(40.0);
        let children = compute_split_children(&parent, 7, 1);
        assert!(!children.is_empty(), "parent should split at radius 40");
        for c in &children {
            assert!(
                c.radius < parent.base_radius,
                "child radius {} should be less than parent.base_radius {}",
                c.radius,
                parent.base_radius
            );
        }
    }
}
