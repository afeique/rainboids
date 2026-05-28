// Path A — headless host for the REAL single-player simulation.
//
// This is the linchpin of "play like SP": instead of the toy sim (js/sim/), the
// server runs the actual SP entity classes (js/modules/*) bound to a headless
// context, under the deterministic clock (S1) + seeded RNG (S2) + a browser
// shim. Cosmetic side-effects (particles, audio) are no-op'd via stub pools /
// audio (the FX seam, S3 — clients re-derive cosmetics from the event stream).
//
// Incremental build-out: this iteration runs the real Player (movement). Firing
// + bullets, enemies (AI/firing), collisions, and waves layer in next, each
// attaching its real SP system to this host. The single-process determinism
// note from engine-context.js applies (frameClock/utils.random are globals →
// one sim per process; the MP server scales process-per-room).

import { installBrowserShim } from './browser-shim.js';
import { frameClock } from '../../../js/modules/core/frame-clock.js';
import { setRandomSource } from '../../../js/modules/core/utils.js';
import { GAME_CONFIG } from '../../../js/modules/core/constants.js';
import { makeRng } from '../../../js/sim/rng.js';

// Headless stand-ins for the presentation systems the SP update() paths take as
// arguments. A pool stub swallows .get()/.updateActive() (no cosmetic particles
// server-side); audio is a no-op proxy (any playX() call is ignored).
const noopPool = {
  get() { return null; },
  getActive() { return []; },
  activeObjects: [],
  updateActive() {},
  cleanupInactive() {},
};
const noopAudio = new Proxy({}, { get: () => () => {} });

const NEUTRAL_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false,
  fire: false, fireSecondary: false,
  rotateLeft: false, rotateRight: false, shift: false, dashPulse: false,
  aimX: null, aimY: null,
  stickInput: { x: 0, y: 0, magnitude: 0 },
  aimStick: { x: 0, y: 0, magnitude: 0 },
  activateAbilitySlot: [false, false, false, false],
  gamepadActive: false,
});

export class SpHost {
  constructor({ seed = 1, width = GAME_CONFIG.FIELD_WIDTH, height = GAME_CONFIG.FIELD_HEIGHT } = {}) {
    installBrowserShim({ width, height });
    this.gameField = { width, height };
    this.seed = seed;
    this.rng = makeRng(seed);
    // Deterministic clock + seeded RNG for the whole sim.
    frameClock.setDeterministic(true, { startNow: 0, dtMs: GAME_CONFIG.LOGIC_TICK_MS });
    setRandomSource(this.rng);
    this.player = null;
    this.tickCount = 0;
  }

  /**
   * Construct the real SP entities + pools (dynamic import, shim-first). SpHost
   * itself is the engine context: the SP entity code binds to it via the
   * `gameEngine` argument AND via `window.gameEngine`, reading the pools/game/
   * stubs below.
   */
  async init() {
    const [{ Player }, { PoolManager }, { Bullet }, { Enemy }, { EnemyBullet }, { Asteroid }, { createDefaultGameState }] = await Promise.all([
      import('../../../js/modules/player/player.js'),
      import('../../../js/modules/core/pool-manager.js'),
      import('../../../js/modules/player/bullet.js'),
      import('../../../js/modules/enemy/enemy.js'),
      import('../../../js/modules/enemy/enemy-bullet.js'),
      import('../../../js/modules/world/asteroid.js'),
      import('../../../js/sim/engine-context.js'),
    ]);
    this.player = new Player();
    this.player.x = this.gameField.width / 2;
    this.player.y = this.gameField.height / 2;
    // Real SP pools (entity ctors read window — shimmed).
    this.bulletPool = new PoolManager(Bullet, 64);
    this.enemyPool = new PoolManager(Enemy, 32);
    this.enemyBulletPool = new PoolManager(EnemyBullet, 128);
    this.asteroidPool = new PoolManager(Asteroid, 16); // empty for now; spawned next step
    this.game = createDefaultGameState();
    // EngineContext fields the SP entity code reads off the engine.
    this.targetedEntity = null;
    this.uiManager = { musicPlayer: null };
    this._activeShotPattern = null;
    this._activeShotElement = null;
    // The SP code reads window.gameEngine in a few places — point it here.
    if (globalThis.window) globalThis.window.gameEngine = this;
    return this;
  }

  // ── EngineContext methods the SP entity code calls on the engine ──────────
  // Cosmetic / not-yet-wired hooks no-op; spawning routes to the real pools.
  spawnHazard() {}
  triggerEnemyDebrisBurst() {}
  triggerEnemyFinalExplosion() {}
  detonateSubBomblet() {}
  applyDamageToEnemy() {} // real damage arrives via collision wiring (next step)
  requestEnemySpawn(x, y, type = 'HUNTER', level = 1) { return this.spawnEnemy(x, y, type, level); }
  findNearestTarget(x, y, range = Infinity) {
    let best = null;
    let bd = range * range;
    for (const e of this.enemyPool.activeObjects) {
      if (e.active === false) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Spawn a real SP enemy at (x, y). */
  spawnEnemy(x, y, type = 'HUNTER', level = 1) {
    const e = this.enemyPool.get();
    e.reset(x, y, type, level, this);
    return e;
  }

  /** Advance one fixed (LOGIC_TICK_MS) sim tick with the given input frame. */
  tick(input = NEUTRAL_INPUT) {
    frameClock.advance();
    this.tickCount += 1;
    const inp = { ...NEUTRAL_INPUT, ...input };
    // Real SP player movement + firing (spawns real Bullets into bulletPool).
    this.player.update(inp, noopPool, this.bulletPool, noopAudio, noopPool, false, this.gameField);
    for (const b of this.bulletPool.activeObjects) {
      b.update(noopPool, this.asteroidPool, this.enemyPool, this, this.gameField);
    }
    this.bulletPool.cleanupInactive();
    // Real SP enemies (AI / movement / firing → enemy bullets).
    for (const e of this.enemyPool.activeObjects) e.update(this.player, this, this.gameField);
    this.enemyPool.cleanupInactive();
    for (const eb of this.enemyBulletPool.activeObjects) eb.update();
    this.enemyBulletPool.cleanupInactive();
  }

  /** Serialize the player to the snapshot wire shape. */
  snapshotPlayer() {
    const p = this.player;
    return {
      x: p.x, y: p.y, vx: p.vel.x, vy: p.vel.y, a: p.angle,
      hp: p.health, mhp: p.maxHealth,
    };
  }

  /** Serialize active bullets (rendered at latest position; no interp needed). */
  snapshotBullets() {
    return this.bulletPool.activeObjects.map((b) => ({ x: b.x, y: b.y }));
  }

  /** Serialize active enemies to the snapshot wire shape. */
  snapshotEnemies() {
    return this.enemyPool.activeObjects.map((e) => ({
      x: e.x, y: e.y,
      a: e.faceAngle ?? e.angle ?? 0,
      r: e.radius,
      hp: e.health, mhp: e.maxHealth,
      ty: e.type,
    }));
  }
}
