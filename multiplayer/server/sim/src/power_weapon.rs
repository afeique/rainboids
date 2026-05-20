//! Phase 4 step 6 power-weapon dispatcher (2026-05-19). Routes a
//! `power_weapon_kind: u8` to the right per-weapon module's activation
//! / tick entry points. Analogous to `weapon.rs` for primary weapons.
//!
//! The dispatcher itself owns no state — every per-weapon module either
//! takes `&mut ShipState` (charge / beam / arc state machines) or
//! returns a spawn-descriptor Vec the caller translates. The caller
//! (Wave 2D `room.rs`) is responsible for:
//!   - cooldown gating: `current_tick >= ship.power_weapon_cooldown_tick`
//!   - per-weapon cap gating: `room.player_mines.count(...) < max_mines` etc.
//!   - id assignment + push onto the right `RoomState` Vec
//!   - emitting the matching `EventPayload::*` variants
//!
//! Per-weapon contracts (each module's `activate` / `tick_*` reference):
//!
//! | Kind            | Module                          | Entry                                                       | Cooldown ticks |
//! |-----------------|----------------------------------|-------------------------------------------------------------|----------------|
//! | CHARGE_SHOT  0  | `power_weapon_charge_shot`       | `tick_charge(ship, power_fire_held) -> Option<ChargeShotSpawn>` | 0 (charge-gated) |
//! | MINE_LAYER   1  | `power_weapon_mine_layer`        | `activate(ship, active_mine_count) -> Option<MineLayerSpawn>`   | 240            |
//! | NOVA_BLAST   2  | `power_weapon_nova_blast`        | `activate(ship, enemies) -> Vec<NovaHit>`                       | 480            |
//! | MISSILE_SALVO 3 | `power_weapon_missile_salvo`     | `activate(ship) -> Vec<MissileSalvoSpawn>`                      | 600            |
//! | LANCE_BEAM   4  | `power_weapon_lance_beam`        | `activate(ship)` + `tick_beam(ship, enemies)`                   | 480            |
//! | LIGHTNING_ARC 5 | `power_weapon_lightning_arc`     | `activate(ship)` + `tick_arc(ship, enemies)`                    | 480            |
//!
//! The per-module `KIND_*` consts (re-exported below for convenience)
//! provide the dense u8 enumeration. New power weapons add entries here
//! AND a new module — both halves of the dispatch.

pub use crate::power_weapon_charge_shot::KIND_CHARGE_SHOT;
pub use crate::power_weapon_lance_beam::KIND_LANCE_BEAM;
pub use crate::power_weapon_lightning_arc::KIND_LIGHTNING_ARC;
pub use crate::power_weapon_mine_layer::KIND_MINE_LAYER;
pub use crate::power_weapon_missile_salvo::KIND_MISSILE_SALVO;
pub use crate::power_weapon_nova_blast::KIND_NOVA_BLAST;

/// Look up the per-weapon cooldown (in 60 Hz ticks). Returns `0` for
/// CHARGE_SHOT (charge-gated, no cooldown) and the matching const for
/// every other kind. Unknown kinds clamp to MINE_LAYER's 240-tick
/// cooldown as a sensible default.
pub fn cooldown_ticks(kind: u8) -> u32 {
    match kind {
        k if k == KIND_CHARGE_SHOT => 0,
        k if k == KIND_MINE_LAYER => crate::power_weapon_mine_layer::MINE_LAYER_COOLDOWN_TICKS,
        k if k == KIND_NOVA_BLAST => crate::power_weapon_nova_blast::NOVA_COOLDOWN_TICKS,
        k if k == KIND_MISSILE_SALVO => crate::power_weapon_missile_salvo::MISSILE_SALVO_COOLDOWN_TICKS,
        k if k == KIND_LANCE_BEAM => crate::power_weapon_lance_beam::LANCE_BEAM_COOLDOWN_TICKS,
        k if k == KIND_LIGHTNING_ARC => crate::power_weapon_lightning_arc::ARC_COOLDOWN_TICKS,
        _ => crate::power_weapon_mine_layer::MINE_LAYER_COOLDOWN_TICKS,
    }
}

/// True if a kind is "instant" (single-frame activation, no per-tick
/// follow-up loop on the ship). MINE_LAYER, NOVA_BLAST, MISSILE_SALVO
/// are instant; CHARGE_SHOT, LANCE_BEAM, LIGHTNING_ARC are stateful
/// (room.rs ticks them every frame).
pub fn is_instant(kind: u8) -> bool {
    matches!(
        kind,
        k if k == KIND_MINE_LAYER || k == KIND_NOVA_BLAST || k == KIND_MISSILE_SALVO
    )
}

/// True if a kind is charge-based (CHARGE_SHOT). Such weapons gate on
/// charge_progress, not power_weapon_cooldown_tick.
pub fn is_charge_based(kind: u8) -> bool {
    kind == KIND_CHARGE_SHOT
}

/// True if a kind sustains an active beam / arc on the ship for N ticks.
/// LANCE_BEAM + LIGHTNING_ARC. Caller checks `ship.beam_remaining_ticks > 0`
/// to know if the beam is currently active.
pub fn is_beam_based(kind: u8) -> bool {
    kind == KIND_LANCE_BEAM || kind == KIND_LIGHTNING_ARC
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cooldown_ticks_returns_per_weapon_consts() {
        assert_eq!(cooldown_ticks(KIND_CHARGE_SHOT), 0);
        assert_eq!(
            cooldown_ticks(KIND_MINE_LAYER),
            crate::power_weapon_mine_layer::MINE_LAYER_COOLDOWN_TICKS,
        );
        assert_eq!(
            cooldown_ticks(KIND_NOVA_BLAST),
            crate::power_weapon_nova_blast::NOVA_COOLDOWN_TICKS,
        );
        assert_eq!(
            cooldown_ticks(KIND_MISSILE_SALVO),
            crate::power_weapon_missile_salvo::MISSILE_SALVO_COOLDOWN_TICKS,
        );
        assert_eq!(
            cooldown_ticks(KIND_LANCE_BEAM),
            crate::power_weapon_lance_beam::LANCE_BEAM_COOLDOWN_TICKS,
        );
        assert_eq!(
            cooldown_ticks(KIND_LIGHTNING_ARC),
            crate::power_weapon_lightning_arc::ARC_COOLDOWN_TICKS,
        );
    }

    #[test]
    fn cooldown_ticks_unknown_kind_clamps() {
        // 99 is not a valid kind — clamp to MINE_LAYER's cooldown as
        // a defensive default. Tests verify the contract; production
        // code should never hit this branch.
        assert_eq!(
            cooldown_ticks(99),
            crate::power_weapon_mine_layer::MINE_LAYER_COOLDOWN_TICKS,
        );
    }

    #[test]
    fn is_instant_picks_the_right_three() {
        assert!(is_instant(KIND_MINE_LAYER));
        assert!(is_instant(KIND_NOVA_BLAST));
        assert!(is_instant(KIND_MISSILE_SALVO));
        assert!(!is_instant(KIND_CHARGE_SHOT));
        assert!(!is_instant(KIND_LANCE_BEAM));
        assert!(!is_instant(KIND_LIGHTNING_ARC));
    }

    #[test]
    fn is_charge_based_only_charge_shot() {
        assert!(is_charge_based(KIND_CHARGE_SHOT));
        assert!(!is_charge_based(KIND_MINE_LAYER));
        assert!(!is_charge_based(KIND_NOVA_BLAST));
        assert!(!is_charge_based(KIND_MISSILE_SALVO));
        assert!(!is_charge_based(KIND_LANCE_BEAM));
        assert!(!is_charge_based(KIND_LIGHTNING_ARC));
    }

    #[test]
    fn is_beam_based_lance_and_arc() {
        assert!(is_beam_based(KIND_LANCE_BEAM));
        assert!(is_beam_based(KIND_LIGHTNING_ARC));
        assert!(!is_beam_based(KIND_CHARGE_SHOT));
        assert!(!is_beam_based(KIND_MINE_LAYER));
        assert!(!is_beam_based(KIND_NOVA_BLAST));
        assert!(!is_beam_based(KIND_MISSILE_SALVO));
    }

    #[test]
    fn kind_consts_are_dense() {
        // 0..=5 contiguous so the dispatcher can use a single u8 on the
        // wire without needing a sparse mapping table.
        let kinds = [
            KIND_CHARGE_SHOT,
            KIND_MINE_LAYER,
            KIND_NOVA_BLAST,
            KIND_MISSILE_SALVO,
            KIND_LANCE_BEAM,
            KIND_LIGHTNING_ARC,
        ];
        let mut sorted = kinds;
        sorted.sort();
        assert_eq!(sorted, [0u8, 1, 2, 3, 4, 5]);
    }
}
