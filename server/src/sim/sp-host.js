// Path A — headless host for the REAL single-player simulation.
//
// This is the linchpin of "play like SP": instead of the toy sim (js/sim/), the
// server runs the actual SP entity classes (js/modules/*) bound to a headless
// context, under the deterministic clock (S1) + seeded RNG (S2) + a browser
// shim. Cosmetic side-effects (particles, audio, camera shake, damage numbers)
// are no-op'd via stub pools / methods (the FX seam, S3 — clients re-derive
// cosmetics from the snapshot + event stream).
//
// Incremental build-out:
//   • Player movement + firing → real Bullets.
//   • Enemies (AI / movement / firing) → real EnemyBullets.
//   • Collisions (THIS step): bullets damage + kill enemies, enemy bullets +
//     bodies damage the player, asteroids split, orbs/gold/powerups collect.
//     The real collision-system + combat-manager + player-lifecycle SIM logic
//     runs here, bound to SpHost as its engine context (exactly as the SP
//     `fn.call(this)` modules expect). Only the genuinely-cosmetic engine hooks
//     (screen shake, hitstop, debris, damage numbers, notifications) are stubbed.
//
// The single-process determinism note from engine-context.js applies
// (frameClock/utils.random are globals → one sim per process; the MP server
// scales process-per-room).

import { installBrowserShim } from './browser-shim.js';
import { frameClock } from '../../../js/modules/core/frame-clock.js';
import { setRandomSource, random } from '../../../js/modules/core/utils.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel } from '../../../js/modules/wave/wave-data.js';
import { GAME_CONFIG, GAME_STATES, MAX_WAVES } from '../../../js/modules/core/constants.js';
import { makeRng } from '../../../js/sim/rng.js';
import * as col from '../../../js/modules/combat/collision-system.js';
import * as combat from '../../../js/modules/combat/combat-manager.js';
import * as lifecycle from '../../../js/modules/player/lifecycle.js';
import { EventBus } from '../../../js/modules/core/event-bus.js';

// Headless stand-ins for the presentation systems the SP update() paths take as
// arguments. A pool stub swallows .get()/.updateActive() (no cosmetic particles
// server-side); audio is a no-op proxy (any playX() call is ignored).
const noopPool = {
  get() { return null; },
  getActive() { return []; },
  activeObjects: [],
  updateActive() {},
  cleanupInactive() {},
  release() {},
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
    // VFX pools the SP sim reaches for directly (e.g.
    // `this.particlePool.get(...)` — null-guarded on the RESULT, not the pool).
    // Server-side these are the no-op stub: .get() returns null, so the
    // null-guarded cosmetic spawns become no-ops. Clients re-derive cosmetics.
    this.particlePool = noopPool;
    this.lineDebrisPool = noopPool;
    this.asteroidShardPool = noopPool;
    this.backgroundStarPool = noopPool;
    // The semantic event stream the client turns into particles/sounds/shake.
    // EventBus is fire-and-forget pub/sub; wrap emit() so every event the SP sim
    // raises (audio:*, enemy:killed, …) is also buffered into a per-tick stream
    // that tick() drains and ships to clients on the reliable channel.
    this.events = new EventBus();
    this._eventBuffer = [];
    const origEmit = this.events.emit.bind(this.events);
    this.events.emit = (event, data) => {
      this._eventBuffer.push(data === undefined ? [event] : [event, data]);
      return origEmit(event, data);
    };
    this.events.drain = () => {
      const b = this._eventBuffer;
      this._eventBuffer = [];
      return b;
    };
    // Cheats off (handleCollisions reads cheats.onePunchMan).
    this.cheats = { onePunchMan: false };
    // Kill-streak / combat accounting (combat-manager initializes lazily, but
    // declaring them keeps the shape explicit + snapshot-friendly).
    this.killCount = 0;
    this.killStreakCount = 0;
    this.killStreakTimer = 0;
    // Spare energy tanks (SP lives model). 0 for now → lethal hit ends the run;
    // co-op (P5) swaps this for downed+revive.
    this.healthTanks = 0;
    // UI accumulator the money-pickup path writes to (display only).
    this.moneyPickupDisplay = { amount: 0, displayTime: 0 };
    // Headless wave driver (off by default so manual-spawn tests are unaffected).
    // When on, tick() self-drives enemy spawns from the REAL wave-data tables.
    this.autoWaves = false;
    this.waveStarted = false;
  }

  /**
   * Construct the real SP entities + pools (dynamic import, shim-first). SpHost
   * itself is the engine context: the SP entity code binds to it via the
   * `gameEngine` argument AND via `window.gameEngine`, reading the pools/game/
   * stubs below.
   */
  async init() {
    const [
      { Player }, { PoolManager }, { Bullet }, { Enemy }, { EnemyBullet },
      { Asteroid }, { ColorStar }, { GoldCoin }, { GoldShape }, { Powerup },
      { SpatialGrid }, { createDefaultGameState },
    ] = await Promise.all([
      import('../../../js/modules/player/player.js'),
      import('../../../js/modules/core/pool-manager.js'),
      import('../../../js/modules/player/bullet.js'),
      import('../../../js/modules/enemy/enemy.js'),
      import('../../../js/modules/enemy/enemy-bullet.js'),
      import('../../../js/modules/world/asteroid.js'),
      import('../../../js/modules/world/color-star.js'),
      import('../../../js/modules/world/gold-coin.js'),
      import('../../../js/modules/world/gold-shape.js'),
      import('../../../js/modules/world/powerup.js'),
      import('../../../js/modules/performance/spatial-grid.js'),
      import('../../../js/sim/engine-context.js'),
    ]);
    this.player = new Player();
    this.player.x = this.gameField.width / 2;
    this.player.y = this.gameField.height / 2;
    // Real SP pools (entity ctors read window — shimmed).
    this.bulletPool = new PoolManager(Bullet, 64);
    this.enemyPool = new PoolManager(Enemy, 32);
    this.enemyBulletPool = new PoolManager(EnemyBullet, 128);
    this.asteroidPool = new PoolManager(Asteroid, 16);
    // Collectible / pickup pools — sim entities (drops, gold, powerups).
    this.colorStarPool = new PoolManager(ColorStar, (GAME_CONFIG.COLOR_STAR_COUNT || 30) + 10);
    this.goldCoinPool = new PoolManager(GoldCoin, 60);
    this.goldShapePool = new PoolManager(GoldShape, 20);
    this.powerupPool = new PoolManager(Powerup, 8);
    // Broad-phase grid for collisions (sim).
    this.spatialGrid = new SpatialGrid(this.gameField.width, this.gameField.height, 8, 6);
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

  // ── Spawning / target queries the SP entity code calls on the engine ───────
  spawnHazard() {}
  detonateSubBomblet(x, y, baseDamage, baseRadius) { return combat.detonateSubBomblet.call(this, x, y, baseDamage, baseRadius); }
  requestEnemySpawn(type = 'HUNTER', x, y, opts = {}) {
    // combat-manager's split-on-death uses (type, x, y, {onSpawn}); spawnEnemy
    // uses (x, y, type, level). Normalize to the spawnEnemy order.
    if (typeof type === 'number') return this.spawnEnemy(type, x, y ?? 1); // legacy (x,y,type)
    const e = this.spawnEnemy(x, y, type, 1);
    if (e && typeof opts.onSpawn === 'function') opts.onSpawn(e);
    return e;
  }
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

  // ── Headless wave driver ───────────────────────────────────────────────────
  // Reuses the REAL wave-data tables (getWaveConfig / getEnemyLevel /
  // getAsteroidLevel) so spawn composition + scaling match SP — it is NOT a
  // second sim. What it intentionally OMITS (vs the SP wave-manager) is the
  // DOM-coupled between-wave orchestration: the draft/shop overlay + pause + the
  // sub-wave pacing timers. Those require the co-op "shared draft + everyone
  // ready" design (plan §4), so for now a wave spawns its full roster at once
  // and the next wave starts when every enemy is cleared. P5/P6 refine this.

  /** A random spawn point just inside a field edge (no camera headless). */
  _edgeSpawnPoint() {
    const { width: w, height: h } = this.gameField;
    const m = 60;
    switch (Math.floor(random(0, 4))) {
      case 0: return { x: random(m, w - m), y: m };           // top
      case 1: return { x: w - m, y: random(m, h - m) };       // right
      case 2: return { x: random(m, w - m), y: h - m };       // bottom
      default: return { x: m, y: random(m, h - m) };          // left
    }
  }

  /** Spawn the full roster (asteroids + every sub-wave's enemies) for wave n. */
  startWave(n) {
    this.game.currentWave = n;
    const playerLevel = (this.player && this.player.level) || 1;
    this.game.enemyLevel = getEnemyLevel(n, playerLevel);
    const cfg = getWaveConfig(n) || {};
    const astLevel = getAsteroidLevel(n);
    for (let i = 0; i < (cfg.asteroids | 0); i++) {
      const p = this._edgeSpawnPoint();
      this.asteroidPool.get(p.x, p.y, random(30, 60), astLevel);
    }
    // NOTE: boss groups (group.isBoss / bossTier) currently spawn as ordinary
    // enemies of that type — the modular boss-spawn path (boss descriptors,
    // intro/phases) is a later P7 parity step.
    for (const sub of (cfg.subWaves || [])) {
      for (const group of sub) {
        for (let i = 0; i < (group.count | 0); i++) {
          const p = this._edgeSpawnPoint();
          this.spawnEnemy(p.x, p.y, group.type, this.game.enemyLevel);
        }
      }
    }
    this.waveStarted = true;
    if (this.events?.emit) this.events.emit('wave:start', { wave: n });
  }

  /** Advance the wave driver: start wave 1, then the next when fully cleared. */
  _updateWaves() {
    if (this.game.state !== GAME_STATES.PLAYING) return;
    if (!this.waveStarted) { this.startWave(1); return; }
    // Enemies in their death animation keep active=true and stay pooled;
    // cleanupInactive (run in tick) frees them only once fully dead — so an
    // empty pool is the true "wave cleared" signal.
    if (this.enemyPool.activeObjects.length === 0 && this.game.currentWave < MAX_WAVES) {
      this.startWave(this.game.currentWave + 1);
    }
  }

  // ── Real SIM systems, bound exactly as game-engine.js delegates them ───────
  // Collision-system (the authoritative damage/kill/pickup core).
  handleCollisions() { return col.handleCollisions.call(this); }
  handleWeaponEffectCollisions() { return col.handleWeaponEffectCollisions.call(this); }
  checkLanceBeamCollisions() { return col.checkLanceBeamCollisions.call(this); }
  checkMineCollisions() { return col.checkMineCollisions.call(this); }
  checkNovaCollisions() { return col.checkNovaCollisions.call(this); }
  checkLightningCollisions() { return col.checkLightningCollisions.call(this); }
  checkMissileCollisions() { return col.checkMissileCollisions.call(this); }
  checkDeflectorOrbCollisions() { return col.checkDeflectorOrbCollisions.call(this); }
  checkTractorShieldCollisions() { return col.checkTractorShieldCollisions.call(this); }
  checkCryoCollisions() { return col.checkCryoCollisions.call(this); }
  checkPrismBeamCollisions() { return col.checkPrismBeamCollisions.call(this); }
  handlePlayerAsteroidCollision(p, a) { return col.handlePlayerAsteroidCollision.call(this, p, a); }
  handlePlayerEnemyCollision(p, e) { return col.handlePlayerEnemyCollision.call(this, p, e); }
  handlePlayerEnemyBulletCollision(p, b) { return col.handlePlayerEnemyBulletCollision.call(this, p, b); }
  handleEnemyAsteroidCollision(e, a) { return col.handleEnemyAsteroidCollision.call(this, e, a); }
  destroyAsteroid(a) { return col.destroyAsteroid.call(this, a); }
  damageEnemy(e, d, el, cc) { return col.damageEnemy.call(this, e, d, el, cc); }
  applyDamageToEnemy(e, d, o) { return col.applyDamageToEnemy.call(this, e, d, o); }
  applyAbilityElement(e, el, dealt = 30) { return col.applyWeaponElementStatus.call(this, e, el, dealt); }
  findNearestEnemy() { return col.findNearestEnemy.call(this); }
  applyGravityWell() { return col.applyGravityWell.call(this); }
  applyEyeOfTheStorm() { return col.applyEyeOfTheStorm.call(this); }
  applySuppressAura() { return col.applySuppressAura.call(this); }

  // Combat-manager (kill rewards, drops, gold, status effects, splits).
  onEnemyKill(e) { return combat.onEnemyKill.call(this, e); }
  updateKillStreak() { return combat.updateKillStreak.call(this); }
  dropOrbsFromEntity(x, y, e) { return combat.dropOrbsFromEntity.call(this, x, y, e); }
  dropStarsFromEntity(x, y) { return combat.dropStarsFromEntity.call(this, x, y); }
  dropPowerup(x, y, t) { return combat.dropPowerup.call(this, x, y, t); }
  collectPowerup(p) { return combat.collectPowerup.call(this, p); }
  getPowerupConfig(t) { return combat.getPowerupConfig.call(this, t); }
  createHealthOrb(x, y, h) { return combat.createHealthOrb.call(this, x, y, h); }
  createMoneyOrb(x, y, m, px) { return combat.createMoneyOrb.call(this, x, y, m, px); }
  harvestBonus(e) { return combat.harvestBonus.call(this, e); }
  addMoneyPickup(a) { return combat.addMoneyPickup.call(this, a); }
  applyVampirism(d) { return combat.applyVampirism.call(this, d); }
  applyThorns(d, s) { return combat.applyThorns.call(this, d, s); }
  mitosisSplit(b, x, y) { return combat.mitosisSplit.call(this, b, x, y); }
  spawnSplitShards(x, y, o) { return combat.spawnSplitShards.call(this, x, y, o); }
  tryConsumeGuardian() { return combat.tryConsumeGuardian.call(this); }
  tickStaticDischarge() { return combat.tickStaticDischarge.call(this); }
  tickWhirlwind() { return combat.tickWhirlwind.call(this); }
  isPlayerInMineShield(p, x) { return combat.isPlayerInMineShield.call(this, p, x); }
  // Status effects.
  applyBurn(e, s, d, sp) { return combat.applyBurn.call(this, e, s, d, sp); }
  applyStun(e, d) { return combat.applyStun.call(this, e, d); }
  applySlow(e, d, f) { return combat.applySlow.call(this, e, d, f); }
  applyCorrode(e, d, m, sp) { return combat.applyCorrode.call(this, e, d, m, sp); }
  applyChill(e, d) { return combat.applyChill.call(this, e, d); }
  applyFreeze(e, d) { return combat.applyFreeze.call(this, e, d); }
  applyConduct(e, d) { return combat.applyConduct.call(this, e, d); }
  applyOil(e, d) { return combat.applyOil.call(this, e, d); }
  applyMark(e, d) { return combat.applyMark.call(this, e, d); }
  applyBleed(e, s, d, m) { return combat.applyBleed.call(this, e, s, d, m); }

  // Player lifecycle (takes damage → resists / death → drops via combat).
  takeDamage(d, o) { return lifecycle.takeDamage.call(this, d, o); }

  // Consume a spare energy tank: restore to full HP, decrement the count.
  _consumeTank() {
    if (this.healthTanks > 0) {
      this.healthTanks -= 1;
      const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
        ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
      this.player.health = maxHp;
      if (this.events?.emit) this.events.emit('audio:tank-recharge');
    }
  }

  // Headless death flow (single player for now). The heavyweight SP version is
  // pure FX + the game-over overlay; the SIM essentials are: drop the ship out
  // of collisions and flip the run to GAME_OVER. P5 replaces this with
  // downed+revive for co-op.
  handlePlayerDeath() {
    if (this.player) this.player.active = false;
    if (this.game) this.game.state = GAME_STATES.GAME_OVER;
    if (this.events?.emit) this.events.emit('audio:player-explosion');
  }

  // ── Cosmetic / UI hooks — no-op on the server (clients re-derive these) ────
  triggerScreenShake() {}
  triggerHitstop() {}
  triggerCameraKick() {}
  triggerScreenFlash() {}
  triggerPickupToast() {}
  triggerPlayerHitFX() {}
  triggerEnemyDebrisBurst() {}
  triggerEnemyFinalExplosion() {}
  createDamageNumber() {}
  createDebris() {}
  createEnemyDebris() {}
  createShapeDebris() {}
  queueNotification() {}
  showPowerupDisplay() {}
  setTargetInfo() {}
  spawnTankRecharge() {}
  applyHealthOrbToTanks() {}
  recordBountyEvent() {}
  checkMissionOnKill() {}
  checkMissionOnCrit() {}
  checkMissionOnAsteroidDestroy() {}
  checkMissionOnDamage() {}
  _breakKillStreak() { /* kill-streak now decays on a timer, not on hit */ }
  _setLastHit() {}
  isEntityOnScreen() { return true; } // single shared arena: everything is "on screen"

  /** Advance one fixed (LOGIC_TICK_MS) sim tick with the given input frame. */
  tick(input = NEUTRAL_INPUT) {
    frameClock.advance();
    this.tickCount += 1;
    const inp = { ...NEUTRAL_INPUT, ...input };

    // 1. Player movement + firing (spawns real Bullets into bulletPool).
    this.player.update(inp, noopPool, this.bulletPool, noopAudio, noopPool, false, this.gameField);

    // 2. Entity pools — sim physics (bullets, asteroids, enemies, enemy bullets).
    for (const b of this.bulletPool.activeObjects) {
      b.update(noopPool, this.asteroidPool, this.enemyPool, this, this.gameField);
    }
    this.asteroidPool.updateActive(this.gameField);
    for (const e of this.enemyPool.activeObjects) e.update(this.player, this, this.gameField);
    for (const eb of this.enemyBulletPool.activeObjects) eb.update();

    // 3. Collectibles — drift / blink-fade / tractor magnet (no particles).
    this.colorStarPool.updateActive(this.player.vel, this.player, false, this.gameField, null);
    this.goldCoinPool.updateActive(this.player, false);
    this.goldShapePool.updateActive(this.player, false);
    this.powerupPool.updateActive(this.player, false, null);

    // 4. Authoritative collisions — the core sim (damage, deaths, drops, gold).
    this.handleCollisions();

    // 5. Reclaim everything the tick deactivated.
    this.bulletPool.cleanupInactive();
    this.enemyPool.cleanupInactive();
    this.enemyBulletPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();
    this.colorStarPool.cleanupInactive();
    this.goldCoinPool.cleanupInactive();
    this.goldShapePool.cleanupInactive();
    this.powerupPool.cleanupInactive();

    // 6. Wave progression (opt-in; reuses the real wave-data tables).
    if (this.autoWaves) this._updateWaves();

    // 7. Drain + return the per-tick semantic event stream for the client.
    return this.events.drain ? this.events.drain() : [];
  }

  /** Serialize the player to the snapshot wire shape. */
  snapshotPlayer() {
    const p = this.player;
    return {
      x: p.x, y: p.y, vx: p.vel.x, vy: p.vel.y, a: p.angle,
      hp: p.health, mhp: p.maxHealth,
      money: this.game?.money | 0,
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

  /** Serialize active asteroids. */
  snapshotAsteroids() {
    return this.asteroidPool.activeObjects.map((a) => ({
      x: a.x, y: a.y, a: a.angle, r: a.radius,
    }));
  }

  /** Serialize collectibles (health/credit orbs, gold) for the client. */
  snapshotOrbs() {
    const orbs = [];
    for (const s of this.colorStarPool.activeObjects) orbs.push({ x: s.x, y: s.y, k: s.starType || 'health' });
    for (const c of this.goldCoinPool.activeObjects) orbs.push({ x: c.x, y: c.y, k: 'coin' });
    for (const g of this.goldShapePool.activeObjects) orbs.push({ x: g.x, y: g.y, k: 'gold' });
    return orbs;
  }
}
