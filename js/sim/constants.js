// js/sim/constants.js — shared headless-sim constants.
//
// These mirror the single-player values in js/modules/core/constants.js so the
// authoritative server and the client predictor reproduce single-player feel.
// This module is imported by BOTH the browser (MP client) and Node (server),
// so it must stay pure: no browser globals, no imports of browser-only code.
//
// Physics calibration note (matches SP): the original tuning was authored at
// 30 Hz; SP runs logic at 60 Hz and scales the 30 Hz constants by
// TICK_SCALE = 30/60 = 0.5. We tick the authoritative sim at the same 60 Hz
// with the same scaled constants, so no rescaling / no behavioral drift.

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SCALE = 30 / 60; // 0.5

// Arena bounds (SP GAME_CONFIG.FIELD_WIDTH/HEIGHT).
export const FIELD_WIDTH = 1920;
export const FIELD_HEIGHT = 1080;

// Ship physics (SP: thrustPower = 2.0 * TICK_SCALE, friction = 0.5^TICK_SCALE,
// MAX_V = 7 * TICK_SCALE, boundary bounce damping 0.8).
export const SHIP_THRUST_PER_TICK = 2.0 * TICK_SCALE; // 1.0
export const SHIP_FRICTION = Math.pow(0.5, TICK_SCALE); // ≈ 0.70710678
export const SHIP_MAX_V = 7 * TICK_SCALE; // 3.5
export const SHIP_VEL_EPSILON = 0.05; // snap-to-zero threshold
export const SHIP_BOUNCE_DAMP = 0.8;
export const SHIP_RADIUS = 15; // SP SHIP_SIZE (30) / 2
export const SHIP_MAX_HP = 100;

// Asteroids — drifting, rotating field hazards. Wrap around the arena edges.
export const ASTEROID_COUNT = 8; // initial field population
export const ASTEROID_MIN_R = 20;
export const ASTEROID_MAX_R = 50;
export const ASTEROID_MIN_SPD = 0.3; // px/tick
export const ASTEROID_MAX_SPD = 1.2;
export const ASTEROID_MAX_SPIN = 0.03; // rad/tick
