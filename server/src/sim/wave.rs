//! Wave schedule + clear gate. Stub.

use rand_pcg::Pcg64;

use crate::protocol::{EnemyState, GameEvent};

use super::state::WaveState;

pub fn tick(
    _wave: &mut WaveState,
    _enemies: &mut Vec<EnemyState>,
    _dt: f32,
    _rng: &mut Pcg64,
    _events: &mut Vec<GameEvent>,
) {
}
