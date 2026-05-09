//! Mid-wave spawn-point picker. 32-sample Halton sweep over the playfield;
//! pick the candidate with the largest minimum distance to any threat.

use glam::Vec2;

use crate::sim::state::GameState;

pub fn find_safe_spawn(state: &GameState) -> Vec2 {
    const SAMPLES: usize = 32;
    let mut best = (
        Vec2::new(state.field.width * 0.5, state.field.height * 0.5),
        0.0_f32,
    );
    for i in 0..SAMPLES {
        let (hx, hy) = halton(i as u32);
        let p = Vec2::new(hx * state.field.width, hy * state.field.height);
        let d = state
            .enemies
            .iter()
            .map(|e| Vec2::new(e.x, e.y).distance(p))
            .chain(
                state
                    .asteroids
                    .iter()
                    .map(|a| Vec2::new(a.x, a.y).distance(p)),
            )
            .fold(f32::INFINITY, f32::min);
        if d > best.1 {
            best = (p, d);
        }
    }
    best.0
}

fn halton(mut i: u32) -> (f32, f32) {
    fn van(mut i: u32, base: u32) -> f32 {
        let mut f = 1.0_f32;
        let mut r = 0.0_f32;
        while i > 0 {
            f /= base as f32;
            r += f * (i % base) as f32;
            i /= base;
        }
        r
    }
    i = i.wrapping_add(1);
    (van(i, 2), van(i, 3))
}
