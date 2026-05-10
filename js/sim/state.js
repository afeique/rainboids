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
 * Working ShipState used by the f32 ship sim (`js/sim/ship.js`).
 *
 * Distinct from the `Ship` typedef above: that one points at the eventual
 * fixed-point design (`Fxp x/y/vx/vy`) which lands in a later session.
 * This `ShipState` is the **current** plain-f32 shape that mirrors the
 * wire `ShipState` in `js/sim/protocol-generated.js` field-for-field
 * for the prediction-relevant subset (`player, x, y, vx, vy, angle, hp,
 * shield`), with two locally-tracked extras for the physics step:
 *
 * - `maxHp` — kept here so the wrapper can carry it across the call;
 *   not on the wire (server-authoritative HP cap).
 * - `radius` — collision radius, used by the boundary-bounce step.
 * - `field` — `{ width, height }` of the world the ship lives in;
 *   per-ship rather than per-state because `updateShip` doesn't take
 *   a GameState argument (matches the design contract in the
 *   "Multiplayer Rust Client Engine" doc).
 * - `active` — false when the ship is destroyed; `updateShip` early-exits.
 *
 * The wrapper in `Player.update` populates this struct from `Player`
 * fields each tick, calls `updateShip`, and writes the result back.
 *
 * @typedef {Object} ShipState
 * @property {PlayerId|number} player   - owning player id (Number for solo)
 * @property {number} x                 - world x (f32 px)
 * @property {number} y                 - world y (f32 px)
 * @property {number} vx                - velocity x (f32 px/tick)
 * @property {number} vy                - velocity y (f32 px/tick)
 * @property {number} angle             - aim angle in radians
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} shield
 * @property {number} radius            - collision radius for boundary clamp
 * @property {Field}  field             - world bounds (per-ship copy)
 * @property {boolean} active
 */

/**
 * Snapshot of a single player's input for one simulation tick.
 *
 * Distinct from `PlayerInput` in `js/sim/input.js`: that one is the
 * normalized form of the wire `PackedInput` (analog axes + button
 * bitfield, used for online play). This `InputFrame` is the
 * **simulation-friendly** form the local engine uses today —
 * directional booleans + an absolute aim point in world coords +
 * the powerup-derived knobs the ship physics need (effective thrust
 * power, thrusters-disabled flag).
 *
 * The wrapper in `Player.update` populates this from the existing
 * `inputHandler` plus a couple of player-state reads (powerup speed
 * multiplier, thruster-disabled flag).
 *
 * @typedef {Object} InputFrame
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} left
 * @property {boolean} right
 * @property {number}  aimX               - absolute world coordinate
 * @property {number}  aimY               - absolute world coordinate
 * @property {number}  thrustPower        - per-tick velocity delta scalar
 *                                         (typically GAME_CONFIG.SHIP_THRUST
 *                                          equivalent: 2.0 * TICK_SCALE)
 * @property {number}  speedMult          - powerup speed multiplier (1.0 baseline)
 * @property {boolean} thrustersDisabled  - tractor / EMP / shop suppression
 * @property {number}  maxV               - base max velocity cap
 *                                         (`GAME_CONFIG.MAX_V`)
 * @property {number}  friction           - per-tick velocity multiplier
 *                                         (`Math.pow(0.50, TICK_SCALE)`)
 * @property {number}  velEpsilon         - snap-to-zero threshold (0.05)
 * @property {number}  bounceDamp         - boundary-bounce energy retention (0.8)
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

/**
 * Construct a fresh f32 ShipState anchored at the field center.
 *
 * Defaults match the live `Player` constructor so the wrapper can
 * call this for round-trip parity tests without divergence.
 *
 * @param {PlayerId|number} playerId
 * @param {Partial<ShipState>} [overrides]   - per-ship overrides (x, y, hp, etc.)
 * @returns {ShipState}
 */
export function freshShipState(playerId, overrides = {}) {
    const field = overrides.field || {
        width: DEFAULT_FIELD_WIDTH,
        height: DEFAULT_FIELD_HEIGHT,
    };
    return {
        player: playerId,
        x: overrides.x !== undefined ? overrides.x : field.width / 2,
        y: overrides.y !== undefined ? overrides.y : field.height / 2,
        vx: overrides.vx !== undefined ? overrides.vx : 0,
        vy: overrides.vy !== undefined ? overrides.vy : 0,
        angle: overrides.angle !== undefined ? overrides.angle : -Math.PI / 2,
        hp: overrides.hp !== undefined ? overrides.hp : 40,
        maxHp: overrides.maxHp !== undefined ? overrides.maxHp : 40,
        shield: overrides.shield !== undefined ? overrides.shield : 15,
        radius: overrides.radius !== undefined ? overrides.radius : 15,
        field,
        active: overrides.active !== undefined ? overrides.active : true,
    };
}
