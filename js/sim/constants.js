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

// Player primary fire (simple straight-shot, server-authoritative).
export const BULLET_SPEED = 12; // px/tick
export const BULLET_RADIUS = 4;
export const BULLET_DAMAGE = 1;
export const BULLET_TTL = 120; // ticks (~2 s at 60 Hz)
export const FIRE_COOLDOWN_TICKS = 8; // ~7.5 shots/sec
export const BULLET_OOB_MARGIN = 50; // despawn this far outside the arena

// Enemies — v1 ships a single "chaser" type that homes on the nearest player.
export const ENEMY_MAX_COUNT = 6; // concurrent cap
export const ENEMY_SPAWN_INTERVAL = 90; // ticks between spawns (~1.5 s)
export const ENEMY_CHASER_HP = 3;
export const ENEMY_CHASER_RADIUS = 16;
export const ENEMY_CHASER_SPEED = 1.6; // px/tick
export const ENEMY_CONTACT_DAMAGE = 10;
export const ENEMY_CONTACT_COOLDOWN = 30; // ticks between contact hits (~0.5 s)

// Co-op revive: a living teammate lingering near a downed ship revives it.
export const REVIVE_RADIUS = 90; // px a reviver must be within
export const REVIVE_TICKS = 120; // ticks of nearby presence to revive (~2 s)
export const REVIVE_HP = 50; // HP a revived ship comes back with
export const REVIVE_DECAY = 2; // progress lost per tick when no reviver is near
