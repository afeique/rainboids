//! Bullet integration. Stub.
//!
//! Production form is SoA pools (see plan §"Contiguous storage"); a Vec is
//! fine until profiling justifies the layout flip.

#[derive(Debug, Clone, Copy)]
pub struct Bullet {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub lifetime: f32,
    pub alive: bool,
}

pub fn integrate(bullets: &mut [Bullet], dt: f32) {
    for b in bullets.iter_mut() {
        if !b.alive {
            continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.lifetime -= dt;
        if b.lifetime <= 0.0 {
            b.alive = false;
        }
    }
}
