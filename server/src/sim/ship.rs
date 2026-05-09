//! Ship physics. Stub: integrates input → velocity → position with f32 for
//! now. Replaced by fixed-point integration once the parity harness lands.

use crate::protocol::ShipState;

use super::input::PlayerInput;
use super::state::PlayerInputs;

const ACCEL: f32 = 600.0;
const MAX_SPEED: f32 = 300.0;
const DRAG: f32 = 0.92;

pub fn update_all(
    ships: &mut [ShipState],
    inputs: &PlayerInputs,
    dt: f32,
    _events: &mut Vec<crate::protocol::GameEvent>,
) {
    for ship in ships.iter_mut() {
        let input = inputs
            .get(&ship.player)
            .copied()
            .unwrap_or(PlayerInput::default());
        ship.vx += input.move_x * ACCEL * dt;
        ship.vy += input.move_y * ACCEL * dt;
        ship.vx *= DRAG;
        ship.vy *= DRAG;
        let speed = (ship.vx * ship.vx + ship.vy * ship.vy).sqrt();
        if speed > MAX_SPEED {
            let s = MAX_SPEED / speed;
            ship.vx *= s;
            ship.vy *= s;
        }
        ship.x += ship.vx * dt;
        ship.y += ship.vy * dt;
        if input.aim_x != 0.0 || input.aim_y != 0.0 {
            ship.angle = input.aim_y.atan2(input.aim_x);
        }
    }
}
