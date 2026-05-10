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

// ── Round-2 agent E (sim/projectile-extract) additions ───────────────
//
// Working AsteroidState + BulletState used by the f32 sims
// (`js/sim/asteroid.js`, `js/sim/bullet.js`). Distinct from the
// `Asteroid` / `Bullet` typedefs above (those are the eventual fixed-
// point design). Plain-f32 shapes mirror the wire types in
// `js/sim/protocol-generated.js` for the prediction-relevant subset,
// with extras for the per-tick step. The wrappers in `Asteroid.update`
// / `Bullet.update` / `EnemyBullet.update` populate these structs from
// `this` each tick, call the pure functions, and write the result back.

/**
 * @typedef {Object} AsteroidState
 * @property {AsteroidId|number} id
 * @property {number} size
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} radius
 * @property {number} rotX
 * @property {number} rotY
 * @property {number} rotZ
 * @property {number} rotVelX
 * @property {number} rotVelY
 * @property {number} rotVelZ
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} level
 * @property {boolean} active
 * @property {boolean} warping
 * @property {number} deathFlash
 */

/**
 * @typedef {Object} AsteroidUpdateContext
 * @property {Field|null} field
 * @property {number} tickScale
 * @property {number} wrapWidth
 * @property {number} wrapHeight
 */

/**
 * Bullet state for player AND enemy projectiles.
 * @typedef {Object} BulletState
 * @property {BulletId|number} id
 * @property {string} kind                       'player' | 'enemy'
 * @property {string|null} shape
 * @property {string} [movementPattern]          enemy-only
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} startX
 * @property {number} startY
 * @property {number} baseVx                     enemy-only pre-pattern velocity
 * @property {number} baseVy
 * @property {number} angle
 * @property {number} rotation
 * @property {number} rotationSpeed
 * @property {number} life                       0..1 (enemy) | int frames (player)
 * @property {number} maxLife                    player frames before expiry
 * @property {number} fadeFactor                 player final-stretch shrink
 * @property {number} damage
 * @property {number} radius
 * @property {number} baseRadius                 player radius at full life
 * @property {number} maxRange                   px before despawn
 * @property {number} rangeMultiplier            player LONG_RANGE upgrade
 * @property {boolean} active
 * @property {PlayerId|number|null} owner
 * @property {boolean} homing                    player powerup
 * @property {number} homingStrength
 * @property {boolean} helixActive               Rail-Driver helix mode
 * @property {number} helixFreq
 * @property {number} helixPhase
 * @property {number} helixAmplitude
 * @property {number} piercing
 * @property {number} piercedEnemies
 * @property {boolean} explosive
 * @property {number} explosionRadius
 * @property {number} patternTimer               enemy seconds-since-spawn
 * @property {number} patternPhase
 * @property {boolean} isPersistent              time-based lifetime (mines)
 * @property {number} maxLifetimeOverride
 * @property {number} creationTime               ms
 * @property {object|null} targetPlayer          for homing patterns
 * @property {boolean} bossRageHoming
 * @property {number} sinePhase
 * @property {number} sineFreq
 * @property {number} sineAmp
 * @property {number} sinePerpX
 * @property {number} sinePerpY
 * @property {number} health                     mine HP
 * @property {number} maxHealth                  mine HP cap
 * @property {number} rocketSpeed                titan_rocket
 * @property {number} maxDistance
 * @property {number} distanceTraveled
 * @property {number} deceleration               missile_decelerate
 * @property {number} minSpeed
 * @property {number} slashProgress              energy_slash
 * @property {boolean} expiredByRange            despawn flags — wrapper FX
 * @property {boolean} expiredByBounds
 * @property {boolean} expiredByDistance
 */

/**
 * @typedef {Object} BulletUpdateContext
 * @property {number} tickScale
 * @property {number} logicTickSeconds
 * @property {number} bulletSpeed                GAME_CONFIG.BULLET_SPEED
 * @property {number} boundaryWidth
 * @property {number} boundaryHeight
 * @property {number} now                        frameClock.now (ms)
 * @property {object|null} targetPlayer          for enemy homing
 * @property {object|null} homingTarget          for player homing
 * @property {Function} rngFloat                 [0,1) for jitter
 */

const ASTEROID_DEFAULT_RADIUS = 30;

/**
 * Construct a fresh AsteroidState.
 * @param {AsteroidId|number} id
 * @param {Partial<AsteroidState>} [overrides]
 * @returns {AsteroidState}
 */
export function freshAsteroidState(id, overrides = {}) {
    return {
        id,
        size: overrides.size !== undefined ? overrides.size : ASTEROID_DEFAULT_RADIUS,
        x: overrides.x !== undefined ? overrides.x : 0,
        y: overrides.y !== undefined ? overrides.y : 0,
        vx: overrides.vx !== undefined ? overrides.vx : 0,
        vy: overrides.vy !== undefined ? overrides.vy : 0,
        radius: overrides.radius !== undefined ? overrides.radius : ASTEROID_DEFAULT_RADIUS,
        rotX: overrides.rotX !== undefined ? overrides.rotX : 0,
        rotY: overrides.rotY !== undefined ? overrides.rotY : 0,
        rotZ: overrides.rotZ !== undefined ? overrides.rotZ : 0,
        rotVelX: overrides.rotVelX !== undefined ? overrides.rotVelX : 0,
        rotVelY: overrides.rotVelY !== undefined ? overrides.rotVelY : 0,
        rotVelZ: overrides.rotVelZ !== undefined ? overrides.rotVelZ : 0,
        hp: overrides.hp !== undefined ? overrides.hp : 1,
        maxHp: overrides.maxHp !== undefined ? overrides.maxHp : 1,
        level: overrides.level !== undefined ? overrides.level : 1,
        active: overrides.active !== undefined ? overrides.active : true,
        warping: overrides.warping !== undefined ? overrides.warping : false,
        deathFlash: overrides.deathFlash !== undefined ? overrides.deathFlash : 0,
    };
}

/**
 * Construct a fresh BulletState. `kind` selects the per-tick step.
 * @param {BulletId|number} id
 * @param {string} kind                          'player' | 'enemy'
 * @param {Partial<BulletState>} [overrides]
 * @returns {BulletState}
 */
export function freshBulletState(id, kind, overrides = {}) {
    return {
        id,
        kind,
        shape: overrides.shape !== undefined ? overrides.shape : null,
        movementPattern: overrides.movementPattern !== undefined ? overrides.movementPattern : 'aimed',
        x: overrides.x !== undefined ? overrides.x : 0,
        y: overrides.y !== undefined ? overrides.y : 0,
        vx: overrides.vx !== undefined ? overrides.vx : 0,
        vy: overrides.vy !== undefined ? overrides.vy : 0,
        startX: overrides.startX !== undefined ? overrides.startX : 0,
        startY: overrides.startY !== undefined ? overrides.startY : 0,
        baseVx: overrides.baseVx !== undefined ? overrides.baseVx : 0,
        baseVy: overrides.baseVy !== undefined ? overrides.baseVy : 0,
        angle: overrides.angle !== undefined ? overrides.angle : 0,
        rotation: overrides.rotation !== undefined ? overrides.rotation : 0,
        rotationSpeed: overrides.rotationSpeed !== undefined ? overrides.rotationSpeed : 0,
        life: overrides.life !== undefined ? overrides.life : (kind === 'player' ? 0 : 1.0),
        maxLife: overrides.maxLife !== undefined ? overrides.maxLife : 60,
        fadeFactor: overrides.fadeFactor !== undefined ? overrides.fadeFactor : 1.0,
        damage: overrides.damage !== undefined ? overrides.damage : 1,
        radius: overrides.radius !== undefined ? overrides.radius : 4,
        baseRadius: overrides.baseRadius !== undefined ? overrides.baseRadius : 4,
        maxRange: overrides.maxRange !== undefined ? overrides.maxRange : 600,
        rangeMultiplier: overrides.rangeMultiplier !== undefined ? overrides.rangeMultiplier : 1.0,
        active: overrides.active !== undefined ? overrides.active : true,
        owner: overrides.owner !== undefined ? overrides.owner : null,
        homing: overrides.homing !== undefined ? overrides.homing : false,
        homingStrength: overrides.homingStrength !== undefined ? overrides.homingStrength : 0,
        helixActive: overrides.helixActive !== undefined ? overrides.helixActive : false,
        helixFreq: overrides.helixFreq !== undefined ? overrides.helixFreq : 0,
        helixPhase: overrides.helixPhase !== undefined ? overrides.helixPhase : 0,
        helixAmplitude: overrides.helixAmplitude !== undefined ? overrides.helixAmplitude : 0,
        piercing: overrides.piercing !== undefined ? overrides.piercing : 0,
        piercedEnemies: overrides.piercedEnemies !== undefined ? overrides.piercedEnemies : 0,
        explosive: overrides.explosive !== undefined ? overrides.explosive : false,
        explosionRadius: overrides.explosionRadius !== undefined ? overrides.explosionRadius : 30,
        patternTimer: overrides.patternTimer !== undefined ? overrides.patternTimer : 0,
        patternPhase: overrides.patternPhase !== undefined ? overrides.patternPhase : 0,
        isPersistent: overrides.isPersistent !== undefined ? overrides.isPersistent : false,
        maxLifetimeOverride: overrides.maxLifetimeOverride,
        creationTime: overrides.creationTime !== undefined ? overrides.creationTime : 0,
        targetPlayer: overrides.targetPlayer !== undefined ? overrides.targetPlayer : null,
        bossRageHoming: overrides.bossRageHoming !== undefined ? overrides.bossRageHoming : false,
        sinePhase: overrides.sinePhase !== undefined ? overrides.sinePhase : 0,
        sineFreq: overrides.sineFreq !== undefined ? overrides.sineFreq : 0,
        sineAmp: overrides.sineAmp !== undefined ? overrides.sineAmp : 0,
        sinePerpX: overrides.sinePerpX !== undefined ? overrides.sinePerpX : 0,
        sinePerpY: overrides.sinePerpY !== undefined ? overrides.sinePerpY : 0,
        expiredByRange: false,
        expiredByBounds: false,
        expiredByDistance: false,
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
