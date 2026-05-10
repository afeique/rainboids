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
