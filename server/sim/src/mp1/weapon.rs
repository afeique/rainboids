//! Phase 4 step 4 — weapon dispatcher.
//!
//! Routes a `weapon_kind: u8` to the matching per-weapon `fire`
//! function and exposes the per-weapon cooldown via `cooldown_ticks`.
//! Both server (`mp1_room.rs::process_fire_inputs`) and WASM client
//! (`consume_bullet_spawn`) consult this module so the per-weapon
//! gameplay constants (damage / piercing / lifetime / speed) live in
//! exactly one place.
//!
//! Wave 1 authored four parallel weapon modules:
//!   - `weapon_pulse_cannon` (the existing PULSE_CANNON behavior,
//!     extracted into the family by Wave 2 integration)
//!   - `weapon_storm_needles`
//!   - `weapon_scatter_gun`
//!   - `weapon_rail_driver`
//!
//! Each exposes the same shape: a `fire(ship, rng) -> Vec<WeaponBulletSpawn>`
//! function plus per-weapon `pub const`s (COOLDOWN_TICKS, DAMAGE,
//! BULLET_SPEED_MULT, BULLET_LIFETIME_MULT, PIERCING).

use crate::mp1::rng_ctx::RngCtx;
use crate::mp1::state::ShipState;
use crate::mp1::{
    weapon_rail_driver, weapon_scatter_gun, weapon_storm_needles,
};

/// Weapon discriminator on the wire and in `ShipState.weapon_kind`.
/// Dense u8 so the wire cost is fixed.
pub const KIND_PULSE_CANNON: u8 = 0;
pub const KIND_STORM_NEEDLES: u8 = 1;
pub const KIND_SCATTER_GUN: u8 = 2;
pub const KIND_RAIL_DRIVER: u8 = 3;

/// Shared spawn-intent shape. Each per-weapon `fire()` returns a Vec
/// of these; the room actor / WASM mirror converts each one into a
/// `BulletState` via `BulletState::spawn(..., damage, piercing,
/// speed_mult, lifetime_mult)`.
///
/// Re-defined here so the dispatcher doesn't have to pick one of the
/// per-weapon modules' identical local definitions. Each per-weapon
/// module returns `Vec<weapon_X::WeaponBulletSpawn>` which we
/// translate field-for-field. Wave 1 authored them identically by
/// contract; if any drift later, this is the single conversion point.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WeaponBulletSpawn {
    pub origin_x: f64,
    pub origin_y: f64,
    pub angle: f64,
    pub damage: f64,
    pub piercing: u8,
    pub lifetime_mult: f64,
    pub speed_mult: f64,
}

/// Per-weapon cooldown in sim ticks. Used by the fire-rate gate in
/// `mp1_room.rs::process_fire_inputs`. Unknown weapon kinds fall back
/// to PULSE_CANNON's cooldown.
pub fn cooldown_ticks(weapon_kind: u8) -> u32 {
    match weapon_kind {
        KIND_PULSE_CANNON => crate::mp1::bullet::PULSE_CANNON_COOLDOWN_TICKS,
        KIND_STORM_NEEDLES => weapon_storm_needles::COOLDOWN_TICKS,
        KIND_SCATTER_GUN => weapon_scatter_gun::COOLDOWN_TICKS,
        KIND_RAIL_DRIVER => weapon_rail_driver::COOLDOWN_TICKS,
        _ => crate::mp1::bullet::PULSE_CANNON_COOLDOWN_TICKS,
    }
}

/// Fire the weapon. Returns the bullets to spawn this firing event.
/// Caller assigns each bullet an id + spawn_tick and pushes onto
/// `RoomState.bullets`. Unknown weapon kinds emit a debug log and
/// fall back to PULSE_CANNON.
pub fn fire(weapon_kind: u8, ship: &ShipState, rng: &mut RngCtx) -> Vec<WeaponBulletSpawn> {
    match weapon_kind {
        KIND_PULSE_CANNON => pulse_cannon_fire(ship),
        KIND_STORM_NEEDLES => weapon_storm_needles::fire(ship, rng)
            .into_iter()
            .map(adapt_storm)
            .collect(),
        KIND_SCATTER_GUN => weapon_scatter_gun::fire(ship, rng)
            .into_iter()
            .map(adapt_scatter)
            .collect(),
        KIND_RAIL_DRIVER => weapon_rail_driver::fire(ship, rng)
            .into_iter()
            .map(adapt_rail)
            .collect(),
        _ => pulse_cannon_fire(ship),
    }
}

/// PULSE_CANNON's spawn pattern, inlined here as the "default" weapon.
/// Mirrors the same per-weapon `fire` shape so the dispatcher's match
/// stays uniform. Single bullet, no jitter, fixed damage + lifetime.
fn pulse_cannon_fire(ship: &ShipState) -> Vec<WeaponBulletSpawn> {
    vec![WeaponBulletSpawn {
        origin_x: ship.x,
        origin_y: ship.y,
        angle: ship.angle,
        damage: crate::mp1::bullet::PULSE_CANNON_DAMAGE,
        piercing: 0,
        lifetime_mult: 1.0,
        speed_mult: 1.0,
    }]
}

fn adapt_storm(s: weapon_storm_needles::WeaponBulletSpawn) -> WeaponBulletSpawn {
    WeaponBulletSpawn {
        origin_x: s.origin_x,
        origin_y: s.origin_y,
        angle: s.angle,
        damage: s.damage,
        piercing: s.piercing,
        lifetime_mult: s.lifetime_mult,
        speed_mult: s.speed_mult,
    }
}

fn adapt_scatter(s: weapon_scatter_gun::WeaponBulletSpawn) -> WeaponBulletSpawn {
    WeaponBulletSpawn {
        origin_x: s.origin_x,
        origin_y: s.origin_y,
        angle: s.angle,
        damage: s.damage,
        piercing: s.piercing,
        lifetime_mult: s.lifetime_mult,
        speed_mult: s.speed_mult,
    }
}

fn adapt_rail(s: weapon_rail_driver::WeaponBulletSpawn) -> WeaponBulletSpawn {
    WeaponBulletSpawn {
        origin_x: s.origin_x,
        origin_y: s.origin_y,
        angle: s.angle,
        damage: s.damage,
        piercing: s.piercing,
        lifetime_mult: s.lifetime_mult,
        speed_mult: s.speed_mult,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ship() -> ShipState {
        ShipState {
            x: 100.0,
            y: 100.0,
            angle: 0.5,
            ..ShipState::default()
        }
    }

    #[test]
    fn pulse_cannon_returns_one_bullet() {
        let ship = make_ship();
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(KIND_PULSE_CANNON, &ship, &mut rng);
        assert_eq!(bullets.len(), 1);
        assert_eq!(bullets[0].damage, crate::mp1::bullet::PULSE_CANNON_DAMAGE);
        assert_eq!(bullets[0].piercing, 0);
    }

    #[test]
    fn storm_needles_returns_one_bullet_with_jitter() {
        let ship = make_ship();
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(KIND_STORM_NEEDLES, &ship, &mut rng);
        assert_eq!(bullets.len(), 1);
        assert_eq!(bullets[0].damage, weapon_storm_needles::DAMAGE);
    }

    #[test]
    fn scatter_gun_returns_five_pellets() {
        let ship = make_ship();
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(KIND_SCATTER_GUN, &ship, &mut rng);
        assert_eq!(bullets.len(), 5);
        for b in &bullets {
            assert_eq!(b.damage, weapon_scatter_gun::DAMAGE);
        }
    }

    #[test]
    fn rail_driver_returns_piercing_bullet() {
        let ship = make_ship();
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(KIND_RAIL_DRIVER, &ship, &mut rng);
        assert_eq!(bullets.len(), 1);
        assert_eq!(bullets[0].damage, weapon_rail_driver::DAMAGE);
        assert_eq!(bullets[0].piercing, weapon_rail_driver::PIERCING);
    }

    #[test]
    fn unknown_weapon_falls_back_to_pulse_cannon() {
        let ship = make_ship();
        let mut rng = RngCtx::from_seed(1);
        let bullets = fire(255, &ship, &mut rng);
        assert_eq!(bullets.len(), 1);
        assert_eq!(bullets[0].damage, crate::mp1::bullet::PULSE_CANNON_DAMAGE);
    }

    #[test]
    fn cooldown_lookup_matches_per_weapon_consts() {
        assert_eq!(
            cooldown_ticks(KIND_PULSE_CANNON),
            crate::mp1::bullet::PULSE_CANNON_COOLDOWN_TICKS
        );
        assert_eq!(cooldown_ticks(KIND_STORM_NEEDLES), weapon_storm_needles::COOLDOWN_TICKS);
        assert_eq!(cooldown_ticks(KIND_SCATTER_GUN), weapon_scatter_gun::COOLDOWN_TICKS);
        assert_eq!(cooldown_ticks(KIND_RAIL_DRIVER), weapon_rail_driver::COOLDOWN_TICKS);
    }
}
