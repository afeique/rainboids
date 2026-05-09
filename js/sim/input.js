// PackedInput ↔ PlayerInput conversion.
//
// PackedInput is the 7-byte wire form (matches PackedInput in
// server/src/protocol/mod.rs):
//   move_x: i8        (-127..127, normalized to -1..1)
//   move_y: i8
//   aim_x:  i16       (unit-vector x, encoded at 1/32767 scale)
//   aim_y:  i16
//   buttons: u8       bitfield: bit 0 shoot, 1 dash, 2 ability1, 3 ability2
//
// PlayerInput is the simulation-friendly normalized form.

export const BTN_SHOOT = 1 << 0;
export const BTN_DASH = 1 << 1;
export const BTN_AB1 = 1 << 2;
export const BTN_AB2 = 1 << 3;

/**
 * @typedef {Object} PackedInput
 * @property {number} moveX     - i8 in [-127, 127]
 * @property {number} moveY     - i8 in [-127, 127]
 * @property {number} aimX      - i16 in [-32767, 32767]
 * @property {number} aimY      - i16 in [-32767, 32767]
 * @property {number} buttons   - u8 bitfield
 */

/**
 * @typedef {Object} PlayerInput
 * @property {number} moveX     - f32 in [-1, 1]
 * @property {number} moveY     - f32 in [-1, 1]
 * @property {number} aimX      - f32 in [-1, 1]
 * @property {number} aimY      - f32 in [-1, 1]
 * @property {boolean} shoot
 * @property {boolean} dash
 * @property {boolean} ability1
 * @property {boolean} ability2
 */

/** @returns {PackedInput} */
export function emptyPacked() {
    return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0 };
}

/** @returns {PlayerInput} */
export function emptyPlayerInput() {
    return {
        moveX: 0,
        moveY: 0,
        aimX: 0,
        aimY: 0,
        shoot: false,
        dash: false,
        ability1: false,
        ability2: false,
    };
}

/**
 * Encode a normalized PlayerInput into the wire PackedInput form.
 * @param {PlayerInput} input
 * @returns {PackedInput}
 */
export function pack(input) {
    return {
        moveX: clampI8(Math.round(input.moveX * 127)),
        moveY: clampI8(Math.round(input.moveY * 127)),
        aimX: clampI16(Math.round(input.aimX * 32767)),
        aimY: clampI16(Math.round(input.aimY * 32767)),
        buttons:
            (input.shoot ? BTN_SHOOT : 0) |
            (input.dash ? BTN_DASH : 0) |
            (input.ability1 ? BTN_AB1 : 0) |
            (input.ability2 ? BTN_AB2 : 0),
    };
}

/**
 * Decode a wire PackedInput into the normalized simulation form.
 * @param {PackedInput} p
 * @returns {PlayerInput}
 */
export function unpack(p) {
    return {
        moveX: p.moveX / 127,
        moveY: p.moveY / 127,
        aimX: p.aimX / 32767,
        aimY: p.aimY / 32767,
        shoot: (p.buttons & BTN_SHOOT) !== 0,
        dash: (p.buttons & BTN_DASH) !== 0,
        ability1: (p.buttons & BTN_AB1) !== 0,
        ability2: (p.buttons & BTN_AB2) !== 0,
    };
}

function clampI8(v) {
    if (v < -127) return -127;
    if (v > 127) return 127;
    return v | 0;
}

function clampI16(v) {
    if (v < -32767) return -32767;
    if (v > 32767) return 32767;
    return v | 0;
}
