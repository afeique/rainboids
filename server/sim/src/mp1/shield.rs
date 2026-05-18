//! Phase 4 step 2 — shield + spare-tank helpers (HP/death parity
//! with solo's basic survivability).
//!
//! Pure functions taking primitive mutable refs. The orchestrator's
//! Wave 2 integration in `damage.rs` wires these into the existing
//! `apply_damage` flow (which currently goes straight from `hp` to
//! downed at zero, with no shield or spare-tank consideration).
//!
//! Solo parity:
//! - `MAX_SHIELD = 50.0` matches solo's basic-shield starting value
//!   (the rarity-item shield from the inventory step 9 is separate)
//! - `STARTING_SPARE_TANKS = 3` matches v6.12.4 — "player starts
//!   with 3 spare tanks (was 1)"
//! - On HP 0 with spare tanks left: consume one, restore HP to
//!   max, stay upright. Otherwise: downed.

/// Starting shield value. Phase 4 MVP — no rarity items yet, so every
/// ship spawns with this fixed amount. Step 9 widens to inventory-
/// based shield via the rarity-roll system.
pub const STARTING_SHIELD: f64 = 50.0;
pub const MAX_SHIELD: f64 = 50.0;

/// Starting spare tank count. Mirrors solo v6.12.4. Step 9 may widen
/// this with rarity items / talents.
pub const STARTING_SPARE_TANKS: u8 = 3;

/// What happened when damage was applied through the shield layer.
/// Caller emits the matching cosmetic wire event.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ShieldDamageOutcome {
    /// Entire damage absorbed by shield; HP untouched. `shield_remaining`
    /// is the new shield value after absorption.
    FullyAbsorbed { shield_remaining: f64 },
    /// Shield dropped to 0; partial damage rolled to HP.
    /// `hp_damage` is the residual damage applied to HP (`amount - shield_at_start`).
    /// Caller is responsible for the HP delta + downed check.
    PartialAbsorb { hp_damage: f64 },
    /// Shield was already 0 (or non-positive). All damage applies to HP.
    /// `hp_damage` equals `amount`.
    NoShield { hp_damage: f64 },
}

/// Apply incoming damage through the shield layer. Mutates `shield`
/// (subtracts absorbed amount, clamped at 0). Does NOT touch `hp` —
/// the caller does that based on the returned outcome's `hp_damage`.
///
/// The return value tells the caller how much HP damage to apply (if
/// any) so it can emit a precise wire event (shield-flash, shield-down,
/// etc.) for cosmetic feedback.
pub fn apply_shield_damage(shield: &mut f64, amount: f64) -> ShieldDamageOutcome {
    if amount <= 0.0 {
        return ShieldDamageOutcome::FullyAbsorbed {
            shield_remaining: *shield,
        };
    }
    if *shield <= 0.0 {
        *shield = 0.0;
        return ShieldDamageOutcome::NoShield { hp_damage: amount };
    }
    if *shield >= amount {
        *shield -= amount;
        ShieldDamageOutcome::FullyAbsorbed {
            shield_remaining: *shield,
        }
    } else {
        let leftover = amount - *shield;
        *shield = 0.0;
        ShieldDamageOutcome::PartialAbsorb {
            hp_damage: leftover,
        }
    }
}

/// What happened when a downed-state trigger checked for spare tanks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpareTankOutcome {
    /// A spare tank was consumed. `hp` is now `max_hp` (caller checks
    /// `shield` separately — typically shield does NOT refill on tank
    /// consumption, but Phase 4 step 2 leaves that to caller policy).
    /// `tanks_remaining` is the post-consumption count.
    Consumed { tanks_remaining: u8 },
    /// No tanks left; caller proceeds with normal downed transition.
    NoneLeft,
}

/// Attempt to consume a spare tank to avoid going downed. Mutates
/// `spare_tanks` (decrements by 1 if available) AND `hp` (restored
/// to `max_hp` on consumption). Caller decides what to do with shield.
pub fn try_consume_spare_tank(
    spare_tanks: &mut u8,
    hp: &mut f64,
    max_hp: f64,
) -> SpareTankOutcome {
    if *spare_tanks == 0 {
        return SpareTankOutcome::NoneLeft;
    }
    *spare_tanks -= 1;
    *hp = max_hp;
    SpareTankOutcome::Consumed {
        tanks_remaining: *spare_tanks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Shield tests ---

    #[test]
    fn shield_fully_absorbs_when_enough() {
        let mut shield = 50.0;
        let outcome = apply_shield_damage(&mut shield, 30.0);
        assert_eq!(
            outcome,
            ShieldDamageOutcome::FullyAbsorbed {
                shield_remaining: 20.0
            }
        );
        assert_eq!(shield, 20.0);
    }

    #[test]
    fn shield_partial_when_damage_exceeds() {
        let mut shield = 5.0;
        let outcome = apply_shield_damage(&mut shield, 12.0);
        assert_eq!(outcome, ShieldDamageOutcome::PartialAbsorb { hp_damage: 7.0 });
        assert_eq!(shield, 0.0);
    }

    #[test]
    fn shield_already_zero() {
        let mut shield = 0.0;
        let outcome = apply_shield_damage(&mut shield, 8.0);
        assert_eq!(outcome, ShieldDamageOutcome::NoShield { hp_damage: 8.0 });
        assert_eq!(shield, 0.0);
    }

    #[test]
    fn shield_exactly_matches_damage() {
        let mut shield = 7.0;
        let outcome = apply_shield_damage(&mut shield, 7.0);
        // Boundary: exact match goes to FullyAbsorbed (no HP damage rolled).
        assert_eq!(
            outcome,
            ShieldDamageOutcome::FullyAbsorbed {
                shield_remaining: 0.0
            }
        );
        assert_eq!(shield, 0.0);
    }

    #[test]
    fn shield_negative_damage_is_noop() {
        let mut shield = 50.0;
        let outcome = apply_shield_damage(&mut shield, -5.0);
        assert_eq!(
            outcome,
            ShieldDamageOutcome::FullyAbsorbed {
                shield_remaining: 50.0
            }
        );
        assert_eq!(shield, 50.0);
    }

    #[test]
    fn shield_zero_damage_is_noop() {
        let mut shield = 30.0;
        let outcome = apply_shield_damage(&mut shield, 0.0);
        assert_eq!(
            outcome,
            ShieldDamageOutcome::FullyAbsorbed {
                shield_remaining: 30.0
            }
        );
        assert_eq!(shield, 30.0);
    }

    #[test]
    fn shield_negative_starting_treated_as_zero() {
        let mut shield = -5.0;
        let outcome = apply_shield_damage(&mut shield, 10.0);
        assert_eq!(outcome, ShieldDamageOutcome::NoShield { hp_damage: 10.0 });
        assert_eq!(shield, 0.0);
    }

    // --- Spare-tank tests ---

    #[test]
    fn tank_consumed_restores_hp() {
        let mut tanks: u8 = 3;
        let mut hp: f64 = 0.0;
        let max_hp = 100.0;
        let outcome = try_consume_spare_tank(&mut tanks, &mut hp, max_hp);
        assert_eq!(outcome, SpareTankOutcome::Consumed { tanks_remaining: 2 });
        assert_eq!(hp, 100.0);
        assert_eq!(tanks, 2);
    }

    #[test]
    fn tank_none_left() {
        let mut tanks: u8 = 0;
        let mut hp: f64 = 0.0;
        let max_hp = 100.0;
        let outcome = try_consume_spare_tank(&mut tanks, &mut hp, max_hp);
        assert_eq!(outcome, SpareTankOutcome::NoneLeft);
        assert_eq!(hp, 0.0);
        assert_eq!(tanks, 0);
    }

    #[test]
    fn tank_consume_decrements_to_zero() {
        let mut tanks: u8 = 1;
        let mut hp: f64 = 0.0;
        let max_hp = 100.0;
        let first = try_consume_spare_tank(&mut tanks, &mut hp, max_hp);
        assert_eq!(first, SpareTankOutcome::Consumed { tanks_remaining: 0 });
        assert_eq!(tanks, 0);
        assert_eq!(hp, 100.0);

        // Reset HP to simulate another lethal hit before second attempt.
        hp = 0.0;
        let second = try_consume_spare_tank(&mut tanks, &mut hp, max_hp);
        assert_eq!(second, SpareTankOutcome::NoneLeft);
        assert_eq!(hp, 0.0);
        assert_eq!(tanks, 0);
    }

    // --- Const guards ---

    #[test]
    fn consts_match_solo_spec() {
        assert_eq!(STARTING_SHIELD, 50.0);
        assert_eq!(MAX_SHIELD, 50.0);
        assert_eq!(STARTING_SPARE_TANKS, 3);
    }
}
