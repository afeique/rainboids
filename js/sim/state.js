// GameState: canonical entity collections for the pure simulation.
//
// JSDoc-typed for autocomplete and `tsc --noEmit` checking. Mirrors
// `server/src/sim/state.rs` field-by-field. Every shape declared here has
// a counterpart in the wire protocol (`schema/protocol.toml`).
//
// IMPORTANT: this module must stay free of DOM, audio, and rendering
// imports. The pure simulation is the boundary; the engine driver pulls
// state out for presentation.

/**
 * @typedef {bigint} PlayerId   - 64-bit unsigned, monotonic per process
 * @typedef {bigint} EnemyId
 * @typedef {bigint} AsteroidId
 * @typedef {bigint} BulletId
 * @typedef {bigint} DropId
 * @typedef {bigint} RoomId
 * @typedef {number} PowerupId  - u16, see PowerupId in schema/protocol.toml
 */

/**
 * Prediction-relevant fields are typed as Fxp on the wire-deterministic
 * subset. See schema/protocol.toml [prediction] for the canonical list.
 *
 * @typedef {Object} Ship
 * @property {PlayerId} player          - owning player id
 * @property {import('./fxp.js').Fxp} x  - world coordinate (fixed-point)
 * @property {import('./fxp.js').Fxp} y
 * @property {import('./fxp.js').Fxp} vx - velocity (fixed-point)
 * @property {import('./fxp.js').Fxp} vy
 * @property {number} angle             - aim angle in radians (cosmetic, f32)
 * @property {number} hp                - server-authoritative
 * @property {number} maxHp
 * @property {number} shield
 * @property {number} gold
 * @property {number} score
 * @property {number} xp
 * @property {number} level
 * @property {number} weaponId
 * @property {number} weaponCooldown
 * @property {boolean} alive
 * @property {boolean} downed
 * @property {boolean} frozenInvulnerable
 * @property {number} invulnUntil       - tick count
 */

/**
 * @typedef {Object} Enemy
 * @property {EnemyId} id
 * @property {number} kind              - u8 enemy kind discriminator
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} hp
 * @property {boolean} alive
 */

/**
 * @typedef {Object} Asteroid
 * @property {AsteroidId} id
 * @property {number} size
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} hp
 * @property {boolean} alive
 */

/**
 * @typedef {Object} Drop
 * @property {DropId} id
 * @property {number} kind
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {boolean} alive
 */

/**
 * @typedef {Object} Bullet
 * @property {BulletId} id
 * @property {PlayerId|null} owner
 * @property {number} weapon
 * @property {import('./fxp.js').Fxp} x
 * @property {import('./fxp.js').Fxp} y
 * @property {import('./fxp.js').Fxp} vx
 * @property {import('./fxp.js').Fxp} vy
 * @property {number} lifetime  - seconds remaining
 * @property {boolean} alive
 */

/**
 * @typedef {Object} WaveState
 * @property {number} current
 * @property {number} startedAtTick
 * @property {number} remainingToSpawn
 */

/**
 * @typedef {Object} Field
 * @property {number} width   - world bounds (f32 px)
 * @property {number} height
 */

/**
 * Canonical simulation state. Owned by the simulation; rendering reads
 * a snapshot of it; nothing outside the sim mutates these collections.
 *
 * @typedef {Object} GameState
 * @property {Field} field
 * @property {Ship[]} ships
 * @property {Enemy[]} enemies
 * @property {Asteroid[]} asteroids
 * @property {Drop[]} drops
 * @property {Bullet[]} bullets
 * @property {WaveState} wave
 * @property {number} tick                  - integer 60Hz tick counter
 * @property {import('./rng.js').Pcg64} rng - seeded PRNG
 */

import { Pcg64 } from './rng.js';

const DEFAULT_FIELD_WIDTH = 1920;
const DEFAULT_FIELD_HEIGHT = 1080;

/**
 * Construct a fresh GameState. `seed` is the RNG seed for deterministic
 * replay; the same seed produces the same wave/enemy/drop sequences.
 *
 * @param {bigint|number} seed
 * @returns {GameState}
 */
export function freshGameState(seed) {
    return {
        field: { width: DEFAULT_FIELD_WIDTH, height: DEFAULT_FIELD_HEIGHT },
        ships: [],
        enemies: [],
        asteroids: [],
        drops: [],
        bullets: [],
        wave: { current: 0, startedAtTick: 0, remainingToSpawn: 0 },
        tick: 0,
        rng: new Pcg64(typeof seed === 'bigint' ? seed : BigInt(seed >>> 0)),
    };
}

// ─── Enemy (Phase-1 round-2 extraction, agent D) ─────────────────────────────
//
// Minimal typedef set added by the orchestrator during salvage; the
// upstream `Enemy` class still owns the per-tick state object today,
// so `updateEnemy` operates over that object directly. When the wiring
// session extracts the wrapper properly, this typedef will document
// the canonical shape — for now it's a structural hint.

/**
 * @typedef {Object} EnemyState
 * @property {*}      id
 * @property {string} type   one of HUNTER, GUARDIAN, WASP, STALKER, DRIFTER,
 *                           PROWLER, WEAVER, SENTINEL, TANGERINE, TITAN
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} angle
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} firingCooldown
 * @property {number} lastShot
 * @property {boolean} active
 */

/**
 * @typedef {Object} EnemyUpdateContext
 * @property {ShipState[]} ships
 * @property {Field}       field
 * @property {number}      dt
 * @property {Pcg64}       rng
 * @property {*}           gameEngine  back-reference for the wrapper-era
 *                                     `firing.js` / `movement.js` helpers
 *                                     that still live on the engine
 */

/**
 * Factory for a fresh enemy state. The wiring session will replace this
 * with a richer constructor; for now it's a thin convenience.
 *
 * @param {string} type
 * @param {object} overrides
 * @returns {EnemyState}
 */
export function freshEnemyState(type, overrides = {}) {
    return {
        id: overrides.id ?? null,
        type,
        x: overrides.x ?? 0,
        y: overrides.y ?? 0,
        vx: overrides.vx ?? 0,
        vy: overrides.vy ?? 0,
        angle: overrides.angle ?? 0,
        hp: overrides.hp ?? 1,
        maxHp: overrides.maxHp ?? 1,
        firingCooldown: overrides.firingCooldown ?? 0,
        lastShot: overrides.lastShot ?? 0,
        active: overrides.active ?? true,
    };
}
