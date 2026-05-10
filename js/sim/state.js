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

// ─────────────────────────────────────────────────────────────────────────────
// Round-2 additions (agent F — sim/wave-drops-extract).
//
// WaveState + DropState typedefs, their `*UpdateContext` bags, and
// `freshWaveState` / `freshDropState` factories. Appended at the END
// of the file so siblings D (enemy) and E (projectile) can also append
// their typedefs cleanly without merge conflicts on this file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Working WaveState used by the pure wave sim (`js/sim/wave.js`).
 *
 * Supersedes the bare 3-field `WaveState` typedef earlier in this file
 * (which was a placeholder for the future server snapshot shape — kept
 * around to avoid breaking the `GameState.wave` reference there). The
 * shape below is the **current** plain-data shape consumed by
 * `updateWave` and produced by `freshWaveState`.
 *
 * Phase machine — explicit, drives the pure step:
 *   - 'intro'    : wave just started; sub-wave 0 has not yet spawned.
 *                  The wrapper transitions intro → spawning when the
 *                  intro overlay lifts (legacy timing: ~700 ms after
 *                  startNextWave).
 *   - 'spawning' : at least one sub-wave has spawned, more may follow.
 *                  This is the steady state during gameplay.
 *   - 'clearing' : all sub-waves have spawned but enemies remain.
 *                  No further spawn events fire; we're waiting for
 *                  the player to clear the field.
 *   - 'complete' : all sub-waves spawned AND zero enemies. Terminal —
 *                  the wrapper observes this and triggers wave-clear
 *                  flow (mission resolve, bonus XP/coins, powerups
 *                  menu). Next wave allocates a fresh WaveState.
 *
 * @typedef {Object} WaveState
 * @property {number} number             current wave (1..20)
 * @property {number} startedAtTick      tick this wave started on
 * @property {number} remainingToSpawn   sub-waves not yet emitted
 *                                       (informational; tests + the
 *                                       server mirror use it, the
 *                                       wrapper does not).
 * @property {number} subWaveIndex       index of the next sub-wave
 *                                       to spawn (0..subWaves.length).
 * @property {number} spawnTimer         ms accumulated since the last
 *                                       sub-wave spawn — feeds the
 *                                       12 000 ms stale-fallback that
 *                                       advances even when enemies
 *                                       are still alive. Reset to 0
 *                                       on every spawn.
 * @property {string} phase              'intro' | 'spawning' | 'clearing'
 *                                       | 'complete'
 */

/**
 * Working DropState used by the pure drop sim (`js/sim/drops.js`).
 *
 * Distinct from the wire `Drop` typedef earlier in this file — that
 * one is the prediction-relevant subset for snapshots. This one is the
 * **current** plain-data shape consumed by `updateDrop` in the
 * collectible-orb branch of `js/modules/world/color-star.js`.
 *
 * Discriminator semantics:
 *   - 'health'      blue 3D-shape orb, magnet-attractive (the two-tier
 *                   320 / 120 px health-orb magnet from 5.80.x)
 *   - 'money_shape' gold shape orb (the 1-3 "big" gold drops per kill,
 *                   tractor-only)
 *   - 'money_pixel' gold pixel orb (the 10-25 "tiny" gold drops per kill,
 *                   tractor-only, no sparkle for pool budget reasons)
 *   - 'powerup'     reserved for future powerup pickups (no game state
 *                   uses this kind at pure-sim level today)
 *
 * @typedef {Object} DropState
 * @property {DropId|number} id          per-spawn id (Number for solo)
 * @property {string} kind               'health' | 'money_shape' |
 *                                       'money_pixel' | 'powerup'
 * @property {number} x                  world x (f32 px)
 * @property {number} y                  world y (f32 px)
 * @property {number} vx                 velocity x (f32 px/tick)
 * @property {number} vy                 velocity y (f32 px/tick)
 * @property {number} life               ticks remaining until despawn
 *                                       (legacy 7200 ticks ≈ 120 s @60Hz)
 * @property {number} radius             collision radius for pickup
 * @property {number} value              heal-amount or money-value
 *                                       (reserved for collision-extract)
 * @property {number} [opacity]          0..1 fade output (computed by
 *                                       updateDrop; renderer reads).
 * @property {number} [z]                parallax depth (1.5..3.0 for
 *                                       collectibles); used by the
 *                                       tractor pull as a force scale.
 * @property {boolean} active
 */

/**
 * Per-tick context bag for `updateWave`.
 *
 * @typedef {Object} WaveUpdateContext
 * @property {number} enemyCount         count of live enemies (used to
 *                                       gate sub-wave advance).
 * @property {(import('./state.js').ShipState[]|Object[])} ships  active player
 *                                       ships. Currently informational —
 *                                       reserved for future
 *                                       co-op-aware spawning.
 * @property {number} dt                 seconds (typically 1/60).
 * @property {(import('./rng.js').Pcg64|null)} rng  seeded RNG (unused
 *                                       today; reserved for randomized
 *                                       enemy-mix variance).
 */

/**
 * Per-tick context bag for `updateDrop`.
 *
 * @typedef {Object} DropUpdateContext
 * @property {(import('./state.js').ShipState[]|Object[])} ships   active
 *                                       player ships. The pure step
 *                                       picks the nearest as the magnet/
 *                                       tractor anchor.
 * @property {(import('./state.js').Field|null)} field  world bounds
 *                                       (currently unused — drops don't
 *                                       bounce off the field; they
 *                                       expire via the lifetime tick).
 * @property {number} dt                 seconds (typically 1/60).
 * @property {boolean} tractorEngaged    true when the player's tractor
 *                                       skill is active this tick.
 * @property {number} [tractorAttraction]  passed by the wrapper —
 *                                         GAME_CONFIG.ACTIVE_STAR_ATTR * 1500
 *                                         in the legacy code.
 * @property {number} [tractorRange]     passed by the wrapper —
 *                                       GAME_CONFIG.ACTIVE_STAR_ATTRACT_DIST.
 */

/**
 * Construct a fresh WaveState anchored at the start of the given wave.
 *
 * Defaults match the legacy `wave-manager.startNextWave()` behavior:
 * `subWaveIndex=0` (sub-wave 0 spawns first), `phase='intro'` (the
 * intro overlay holds for ~2.8 s), `spawnTimer=0`, `startedAtTick=0`.
 *
 * @param {number} waveNumber                1..MAX_WAVES
 * @param {Partial<WaveState>} [overrides]
 * @returns {WaveState}
 */
export function freshWaveState(waveNumber, overrides = {}) {
    const o = overrides;
    const n = Math.max(1, waveNumber | 0);
    return {
        number: o.number !== undefined ? o.number : n,
        startedAtTick: o.startedAtTick !== undefined ? o.startedAtTick : 0,
        remainingToSpawn: o.remainingToSpawn !== undefined ? o.remainingToSpawn : 0,
        subWaveIndex: o.subWaveIndex !== undefined ? o.subWaveIndex : 0,
        spawnTimer: o.spawnTimer !== undefined ? o.spawnTimer : 0,
        phase: o.phase !== undefined ? o.phase : 'intro',
    };
}

/**
 * Construct a fresh DropState. `kind` is the discriminator; the other
 * fields default to a plausible drift-orb shape so unit tests can
 * exercise the magnet/tractor formulas without pulling in the live
 * combat-manager helpers.
 *
 * @param {string} kind                 'health' | 'money_shape' |
 *                                       'money_pixel' | 'powerup'
 * @param {Partial<DropState>} [overrides]
 * @returns {DropState}
 */
export function freshDropState(kind, overrides = {}) {
    const o = overrides;
    return {
        id: o.id !== undefined ? o.id : 0,
        kind,
        x: o.x !== undefined ? o.x : 0,
        y: o.y !== undefined ? o.y : 0,
        vx: o.vx !== undefined ? o.vx : 0,
        vy: o.vy !== undefined ? o.vy : 0,
        life: o.life !== undefined ? o.life : 7200,
        radius: o.radius !== undefined ? o.radius : 14,
        value: o.value !== undefined ? o.value : (kind === 'health' ? 1 : 5),
        opacity: o.opacity !== undefined ? o.opacity : 1,
        z: o.z !== undefined ? o.z : 2,
        active: o.active !== undefined ? o.active : true,
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
