//! Per-player count scaling. Stub.

pub fn enemy_count_multiplier(player_count: usize) -> f32 {
    match player_count {
        0 | 1 => 1.0,
        2 => 1.6,
        3 => 2.1,
        _ => 2.5,
    }
}
