//! Phase 4 step 6 NOVA_BLAST power weapon — radial damage shockwave.
//!
//! Fresh rewrite from solo's `js/modules/combat/weapon-data.js`
//! `NOVA_BLAST` block and `js/modules/player/weapons.js` `fireNova`.
//! Pure deterministic, RNG-free: on activation, iterates every enemy
//! and returns one `NovaHit` per enemy inside the blast radius. The
//! caller (Wave 2 integration in `room.rs`) applies the damage +
//! push to `RoomState.enemies[idx]` and emits the cosmetic
//! `EventPayload::NovaBlast` so clients can spawn the expanding
//! chromatic ring particle.
//!
//! NOVA_BLAST is a one-shot effect — no entity is persisted in the
//! sim. The visible ring is JS-side cosmetic; from the sim's
//! perspective every enemy inside `NOVA_RING_RADIUS` takes
//! `NOVA_RING_DAMAGE` at the moment of cast and gains an outward
//! radial velocity bump of magnitude `NOVA_PUSH_STRENGTH`.
//!
//! Date: 2026-05-19. Solo `weapon-data.js:441-455` + `weapons.js:898-967`
//! studied; the cosmetic particle burst, double pulse, hit-set
//! bookkeeping, and "ring expands over `ringDuration` ms" tween are
//! all renderer-side concerns and don't belong in the sim.
//!
//! **MVP simplifications (Phase 4 step 6 deferred):**
//!   - `SHOCKWAVE` (+40 px ring radius / stack) — radius is constant.
//!   - `AFTERSHOCK` (slow enemies 30% for 2 s) — no status effects yet.
//!   - `DOUBLE_PULSE` (second smaller ring 0.3 s later) — single pulse.
//!   - `RESONANCE` (−1.5 s cooldown / stack) — flat 8 s cooldown.
//!   - `NOVA_LIGHTNING` (30%/stack stun chance) — no stun mechanic yet.
//!   - `NOVA_CHAIN` (kills spawn smaller novas) — no recursion.
//!   - `NOVA_INFERNO` (burn DoT) — no burn status yet.
//! These all layer onto the same `activate` surface in Phase 5 — the
//! per-hit `NovaHit` record will grow extra fields, callers won't
//! need new entry points.

use crate::enemy::EnemyState;
use crate::state::ShipState;

/// Power-weapon kind discriminator. `0 = CHARGE_SHOT`, `1 = MINE_LAYER`,
/// `2 = NOVA_BLAST`, `3 = MISSILE_SALVO`, `4 = LANCE_BEAM`,
/// `5 = LIGHTNING_ARC`. See `state::ShipState::power_weapon_kind` doc
/// for the dense u8 enumeration.
pub const KIND_NOVA_BLAST: u8 = 2;

/// Cooldown between activations in sim ticks. Solo's `cooldown: 8000`
/// ms ÷ (1000 / 60) = 480 ticks. RESONANCE upgrade (deferred) shortens
/// this; MVP holds it flat.
pub const NOVA_COOLDOWN_TICKS: u32 = 480;

/// Blast radius (px). Mirrors solo's `ringRadius: 320`. SHOCKWAVE
/// upgrade (deferred) adds +40 px / stack — MVP holds it flat.
pub const NOVA_RING_RADIUS: f64 = 320.0;

/// Damage dealt to each enemy inside the blast radius. Mirrors solo's
/// `ringDamage: 4`.
pub const NOVA_RING_DAMAGE: f64 = 4.0;

/// Outward radial velocity bump (px/tick) applied to every hit enemy.
/// Solo applies push implicitly through the renderer's ring-collision
/// reaction; the sim materializes it as a constant velocity delta so
/// the visual "everything blown outward" read carries over.
///
/// 3.5 px/tick = 210 px/s — a satisfying but not catastrophic shove.
/// At 60 Hz with no friction (Phase 4 enemies have no damping) the
/// push persists until the enemy's per-tick velocity recompute
/// overrides it; in practice that's the next movement update, so the
/// shove is a single-frame impulse that still reads as a knockback.
pub const NOVA_PUSH_STRENGTH: f64 = 3.5;

/// Per-enemy result of a NOVA_BLAST hit. Wave 2 dispatcher applies
/// `damage` to `room.enemies[idx].hp` (and toggles `active = false`
/// at hp ≤ 0), adds `(push_vx, push_vy)` to the enemy's velocity, and
/// emits an `EventPayload::EnemyDamaged` event keyed on `enemy_id`.
///
/// Intermediate type so Wave-1 weapon agents don't depend on future
/// `EnemyState` / event-shape changes; integration owns the conversion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NovaHit {
    /// Id of the enemy hit. Matches `EnemyState::id`.
    pub enemy_id: u32,
    /// Damage to apply to the enemy. Equal to `NOVA_RING_DAMAGE` in
    /// MVP; per-hit damage scaling enters Phase 5 with AFTERSHOCK /
    /// DOUBLE_PULSE.
    pub damage: f64,
    /// X component of the outward velocity bump (px/tick).
    pub push_vx: f64,
    /// Y component of the outward velocity bump (px/tick).
    pub push_vy: f64,
}

/// Activate the nova blast at the ship's current position. Caller has
/// already verified `current_tick >= ship.power_weapon_cooldown_tick`
/// and is responsible for setting the new cooldown:
/// `ship.power_weapon_cooldown_tick = current_tick + NOVA_COOLDOWN_TICKS`.
///
/// Returns one `NovaHit` per active enemy inside `NOVA_RING_RADIUS`.
/// Pure deterministic — no RNG, no side effects. Identical inputs
/// produce bit-identical outputs across native + WASM (push vectors
/// use only `sqrt` and division, both IEEE-754 deterministic).
///
/// **Zero-distance behavior:** if an enemy occupies the exact same
/// position as the ship (`dx == 0 && dy == 0`), the push direction is
/// ill-defined. We return `push_vx = push_vy = 0.0` for that hit —
/// the enemy still takes the damage, just no shove. Avoids `NaN` from
/// `0 / 0` and matches the intuition that "everything pinned on the
/// player gets vaporized rather than launched in an arbitrary
/// direction."
pub fn activate(ship: &ShipState, enemies: &[EnemyState]) -> Vec<NovaHit> {
    let mut hits = Vec::new();
    let r2 = NOVA_RING_RADIUS * NOVA_RING_RADIUS;
    for e in enemies {
        if !e.active {
            continue;
        }
        let dx = e.x - ship.x;
        let dy = e.y - ship.y;
        let d2 = dx * dx + dy * dy;
        if d2 > r2 {
            continue;
        }
        // Radial outward unit vector × push strength. Zero-distance
        // case yields (0, 0) — see fn-doc above.
        let (push_vx, push_vy) = if d2 > 0.0 {
            let inv_d = 1.0 / d2.sqrt();
            (dx * inv_d * NOVA_PUSH_STRENGTH, dy * inv_d * NOVA_PUSH_STRENGTH)
        } else {
            (0.0, 0.0)
        };
        hits.push(NovaHit {
            enemy_id: e.id,
            damage: NOVA_RING_DAMAGE,
            push_vx,
            push_vy,
        });
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::{spawn_hunter_from_seed, EnemyState};
    use crate::state::ShipState;

    /// Build a ship at a known position. Other fields default.
    fn make_ship(x: f64, y: f64) -> ShipState {
        ShipState {
            x,
            y,
            ..ShipState::default()
        }
    }

    /// Build a minimal active enemy at (x, y) with a given id. Uses
    /// HUNTER spawn as a base then overrides position so test setup
    /// is independent of the seeded spawn edge.
    fn make_enemy(id: u32, x: f64, y: f64) -> EnemyState {
        let mut e = spawn_hunter_from_seed(id, id as u64, 1920.0, 1080.0);
        e.x = x;
        e.y = y;
        e.active = true;
        e
    }

    #[test]
    fn activate_no_enemies_returns_empty() {
        let ship = make_ship(960.0, 540.0);
        let hits = activate(&ship, &[]);
        assert!(hits.is_empty(), "no enemies → no hits");
    }

    #[test]
    fn activate_hits_enemy_inside_radius() {
        let ship = make_ship(0.0, 0.0);
        // Enemy at distance 100 < 320.
        let enemies = [make_enemy(1, 100.0, 0.0)];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 1, "1 enemy at d=100 < 320 → 1 hit");
        assert_eq!(hits[0].enemy_id, 1);
    }

    #[test]
    fn activate_skips_enemy_outside_radius() {
        let ship = make_ship(0.0, 0.0);
        // Enemy at distance 400 > 320.
        let enemies = [make_enemy(1, 400.0, 0.0)];
        let hits = activate(&ship, &enemies);
        assert!(hits.is_empty(), "enemy at d=400 > 320 → no hit");
    }

    #[test]
    fn activate_hits_multiple_enemies() {
        let ship = make_ship(0.0, 0.0);
        let enemies = [
            make_enemy(1, 50.0, 0.0),    // d=50
            make_enemy(2, 0.0, 200.0),   // d=200
            make_enemy(3, -100.0, 100.0), // d≈141
        ];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 3, "3 enemies all inside d=320 → 3 hits");
        let ids: Vec<u32> = hits.iter().map(|h| h.enemy_id).collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&2));
        assert!(ids.contains(&3));
    }

    #[test]
    fn activate_skips_inactive_enemies() {
        let ship = make_ship(0.0, 0.0);
        let mut e1 = make_enemy(1, 50.0, 0.0);
        e1.active = false;
        let e2 = make_enemy(2, 60.0, 0.0);
        let enemies = [e1, e2];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 1, "only active enemy hit");
        assert_eq!(hits[0].enemy_id, 2);
    }

    #[test]
    fn nova_hit_damage_matches_const() {
        let ship = make_ship(0.0, 0.0);
        let enemies = [
            make_enemy(1, 30.0, 0.0),
            make_enemy(2, 0.0, 100.0),
            make_enemy(3, 200.0, 200.0),
        ];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 3);
        for h in &hits {
            assert_eq!(
                h.damage.to_bits(),
                NOVA_RING_DAMAGE.to_bits(),
                "every hit deals exactly NOVA_RING_DAMAGE"
            );
        }
    }

    #[test]
    fn nova_hit_push_is_radially_outward() {
        // Ship at origin, enemy along +x axis → push must be along +x.
        let ship = make_ship(0.0, 0.0);
        let enemies = [make_enemy(1, 100.0, 0.0)];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 1);
        let h = hits[0];
        assert!(h.push_vx > 0.0, "push_vx should be positive (outward +x), got {}", h.push_vx);
        assert!(h.push_vy.abs() < 1e-12, "push_vy should be ~0, got {}", h.push_vy);

        // Same probe, +y axis.
        let enemies = [make_enemy(1, 0.0, 100.0)];
        let hits = activate(&ship, &enemies);
        let h = hits[0];
        assert!(h.push_vx.abs() < 1e-12, "push_vx should be ~0, got {}", h.push_vx);
        assert!(h.push_vy > 0.0, "push_vy should be positive (outward +y), got {}", h.push_vy);

        // Ship offset → push points from ship → enemy.
        let ship = make_ship(500.0, 500.0);
        let enemies = [make_enemy(1, 400.0, 500.0)]; // enemy to the left of ship
        let hits = activate(&ship, &enemies);
        let h = hits[0];
        assert!(h.push_vx < 0.0, "push should be in -x (toward enemy), got {}", h.push_vx);
        assert!(h.push_vy.abs() < 1e-12);
    }

    #[test]
    fn nova_hit_push_magnitude_matches_const() {
        let ship = make_ship(0.0, 0.0);
        // Probe several non-zero distances + directions; magnitude
        // must always equal NOVA_PUSH_STRENGTH (within fp epsilon).
        let enemies = [
            make_enemy(1, 50.0, 0.0),
            make_enemy(2, 0.0, 200.0),
            make_enemy(3, 100.0, 100.0),
            make_enemy(4, -150.0, 50.0),
            make_enemy(5, -200.0, -200.0),
        ];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 5);
        for h in &hits {
            let mag = (h.push_vx * h.push_vx + h.push_vy * h.push_vy).sqrt();
            assert!(
                (mag - NOVA_PUSH_STRENGTH).abs() < 1e-9,
                "enemy {}: push magnitude {} ≠ NOVA_PUSH_STRENGTH {}",
                h.enemy_id,
                mag,
                NOVA_PUSH_STRENGTH
            );
        }
    }

    #[test]
    fn activate_at_enemy_exact_position_doesnt_panic() {
        // Enemy at exact ship position — push direction is ill-defined.
        // Documented choice: return (0, 0) push, still deal damage, no
        // NaN / panic.
        let ship = make_ship(500.0, 500.0);
        let enemies = [make_enemy(7, 500.0, 500.0)];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 1, "zero-distance enemy still gets hit");
        let h = hits[0];
        assert_eq!(h.enemy_id, 7);
        assert_eq!(h.damage.to_bits(), NOVA_RING_DAMAGE.to_bits());
        assert!(!h.push_vx.is_nan(), "push_vx must not be NaN");
        assert!(!h.push_vy.is_nan(), "push_vy must not be NaN");
        assert_eq!(h.push_vx, 0.0, "zero-distance → zero push_vx");
        assert_eq!(h.push_vy, 0.0, "zero-distance → zero push_vy");
    }

    #[test]
    fn consts_match_solo() {
        // Solo `weapon-data.js:441-455` NOVA_BLAST block:
        //   cooldown: 8000 ms → 480 ticks @ 60 Hz
        //   ringRadius: 320
        //   ringDamage: 4
        assert_eq!(NOVA_COOLDOWN_TICKS, 480, "8000ms / (1000/60) = 480 ticks");
        assert_eq!(NOVA_RING_RADIUS.to_bits(), 320.0_f64.to_bits());
        assert_eq!(NOVA_RING_DAMAGE.to_bits(), 4.0_f64.to_bits());
        // KIND discriminator from state.rs power_weapon_kind doc:
        //   2 = NOVA_BLAST
        assert_eq!(KIND_NOVA_BLAST, 2);
    }

    #[test]
    fn activate_boundary_at_exactly_ring_radius() {
        // Enemy at exact d=320 should be hit (inclusive boundary —
        // d2 <= r2). Documents the boundary convention.
        let ship = make_ship(0.0, 0.0);
        let enemies = [make_enemy(1, NOVA_RING_RADIUS, 0.0)];
        let hits = activate(&ship, &enemies);
        assert_eq!(hits.len(), 1, "enemy at exactly RING_RADIUS is inside the blast");
    }
}
