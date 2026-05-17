//! Per-player input — server-side normalized form of `PackedInput`.

use crate::protocol::PackedInput;

#[derive(Debug, Clone, Copy, Default)]
pub struct PlayerInput {
    pub move_x: f32,
    pub move_y: f32,
    pub aim_x: f32,
    pub aim_y: f32,
    pub shoot: bool,
    pub dash: bool,
    pub ability1: bool,
    pub ability2: bool,
}

const BTN_SHOOT: u8 = 1 << 0;
const BTN_DASH: u8 = 1 << 1;
const BTN_AB1: u8 = 1 << 2;
const BTN_AB2: u8 = 1 << 3;

impl From<PackedInput> for PlayerInput {
    fn from(p: PackedInput) -> Self {
        PlayerInput {
            move_x: (p.move_x as f32) / 127.0,
            move_y: (p.move_y as f32) / 127.0,
            aim_x: (p.aim_x as f32) / 32767.0,
            aim_y: (p.aim_y as f32) / 32767.0,
            shoot: p.buttons & BTN_SHOOT != 0,
            dash: p.buttons & BTN_DASH != 0,
            ability1: p.buttons & BTN_AB1 != 0,
            ability2: p.buttons & BTN_AB2 != 0,
        }
    }
}
