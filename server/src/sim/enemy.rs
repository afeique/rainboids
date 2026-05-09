//! Enemy AI + movement. Stub.

use crate::protocol::{EnemyState, GameEvent, ShipState};
use rand_pcg::Pcg64;

pub fn update_all(
    _enemies: &mut Vec<EnemyState>,
    _ships: &[ShipState],
    _dt: f32,
    _rng: &mut Pcg64,
    _events: &mut Vec<GameEvent>,
) {
    // 10 enemy types per CLAUDE.md memory: HUNTER, GUARDIAN, WASP, STALKER,
    // DRIFTER, PROWLER, WEAVER, SENTINEL, TANGERINE, TITAN. Behaviors live
    // in the JS sim today and get ported per the week 7–9 plan.
}
