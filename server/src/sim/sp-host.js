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
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, BOSS_TIER_STATS } from '../../../js/modules/wave/wave-data.js';
import { REVIVE_RADIUS, REVIVE_TICKS, REVIVE_DECAY } from '../../../js/sim/constants.js';
import { GAME_CONFIG, GAME_STATES, MAX_WAVES } from '../../../js/modules/core/constants.js';
import { makeRng } from '../../../js/sim/rng.js';
import * as col from '../../../js/modules/combat/collision-system.js';
import * as combat from '../../../js/modules/combat/combat-manager.js';
import * as lifecycle from '../../../js/modules/player/lifecycle.js';
import { EventBus } from '../../../js/modules/core/event-bus.js';
import { EV } from '../../../js/sim/events.js';

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

// Co-op spawn/join invulnerability window (ms of i-frames).
const SPAWN_IFRAMES_MS = 2500;

// Breather between waves (ticks) — the wave-clear interlude before the next wave.
const INTER_WAVE_TICKS = 90; // ~1.5 s at 60 Hz

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
    // `frameClock` + the random source are PROCESS GLOBALS, so multiple SpHosts
    // in one process (e.g. several MP rooms) would clobber each other's clock/RNG.
    // We hold this room's clock state here and install it at the top of every
    // tick() (and re-point the RNG), so concurrent rooms stay isolated.
    this._clockNow = 0;
    this._clockTick = 0;
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
    this.startWaveAt = 1;       // wave the auto-driver opens on (debug/test hook)
    this._clearPending = false; // true during the wave-clear breather
    this._interWave = 0;        // ticks left in the breather
    // ── Snapshot / network identity ──
    // The owning ship's network id (SpRoom assigns the real player id; default 1
    // for headless single-player tests). The client reconciles its ship by this.
    this.playerId = 1;
    this._lastInputTick = 0;
    // Stable per-entity network ids. Every pool acquisition (spawn / split /
    // bullet fire) stamps a FRESH id (see init's pool-get wrap), so a recycled
    // pool object never reuses an id — keeping snapshot diffs + client-side
    // interpolation correct across deaths and respawns.
    this._netCounter = 0;
    // Previous-tick entity views, keyed by net id, for diff-derived FX events
    // (deaths/spawns/collects carry the LAST-known position the SP audio stream
    // can't provide).
    this._lastEnemies = new Map();
    this._lastAsteroids = new Map();
    this._lastDrops = new Map();
    this._lastBulletIds = new Set();
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
      { SpatialGrid }, { createDefaultGameState }, bosses,
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
      import('../../../js/modules/enemy/bosses/index.js'),
    ]);
    this._getBossForStage = bosses.getBossForStage;
    this._getBossById = bosses.getBossById;
    this._PlayerClass = Player; // for addPlayer() (co-op N slots)
    this.player = new Player();
    this.player.x = this.gameField.width / 2;
    this.player.y = this.gameField.height / 2;
    // Co-op player slots. `this.player` always points at the slot currently
    // being updated / collision-resolved (the SP sim code reads `this.player`
    // singular); it's rebound per-slot in tick() and left on slot 0 at rest.
    // Slot 0 is the primary (back-compat: single-player tests use host.player).
    this.players = [{ id: this.playerId, player: this.player, input: { ...NEUTRAL_INPUT }, lastInputTick: 0 }];
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
    // Stamp a fresh network id on every pool acquisition. This covers ALL spawn
    // sites — including the ones SpHost doesn't call directly (asteroid splits +
    // bullet fire happen inside collision-system / weapons via `this.X.get()`) —
    // so a recycled pool slot never carries a stale id into the snapshot.
    for (const pool of [this.bulletPool, this.enemyPool, this.enemyBulletPool,
      this.asteroidPool, this.colorStarPool, this.goldCoinPool, this.goldShapePool,
      this.powerupPool]) {
      const origGet = pool.get.bind(pool);
      pool.get = (...args) => {
        const o = origGet(...args);
        if (o) o._netId = ++this._netCounter;
        return o;
      };
    }
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

  // ── Co-op player slots (P5) ───────────────────────────────────────────────

  /**
   * Add a co-op player. The primary slot 0 (built in init) already carries
   * `this.playerId`, so a joiner with that id reuses it — single-player isn't
   * double-allocated; any other id allocates a fresh slot.
   */
  addPlayer(id, spawnX = this.gameField.width / 2, spawnY = this.gameField.height / 2) {
    const existing = this.players.find((s) => s.id === id);
    if (existing) { this._grantSpawnProtection(existing.player); return existing; }
    const player = new this._PlayerClass();
    player.x = spawnX;
    player.y = spawnY;
    this._grantSpawnProtection(player);
    const slot = { id, player, input: { ...NEUTRAL_INPUT }, lastInputTick: 0 };
    this.players.push(slot);
    return slot;
  }

  // Brief spawn/join invulnerability so a pilot dropping into a live wave isn't
  // instantly downed before they can react (co-op spawn protection).
  _grantSpawnProtection(player) {
    if (player && typeof player.makeInvincible === 'function') player.makeInvincible(SPAWN_IFRAMES_MS);
  }

  /** Remove a co-op player slot. */
  removePlayer(id) {
    const i = this.players.findIndex((s) => s.id === id);
    if (i >= 0) this.players.splice(i, 1);
    // Keep `this.player` valid (collision/serialization read it at rest).
    if (this.players.length) this.player = this.players[0].player;
  }

  /** Store a slot's latest input frame. */
  setSlotInput(id, input) {
    const slot = this.players.find((s) => s.id === id);
    if (slot) {
      slot.input = input;
      if (typeof input.clientTick === 'number') slot.lastInputTick = input.clientTick;
    }
  }

  /** Nearest living (active, non-downed) player to (x, y), or null. */
  _nearestLivingPlayer(x, y) {
    let best = null;
    let bd = Infinity;
    for (const s of this.players) {
      const p = s.player;
      if (!p || p.active === false || p.downed) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
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
    // Cap the field's asteroid population at SP's concurrent cap. Previously each
    // wave dumped cfg.asteroids on top of whatever survived (and the splits), so
    // rocks accumulated endlessly across waves (and flooded gem/gold drops). SP
    // maintains a bounded population (GAME_CONFIG.MAX_ASTEROIDS); top up toward it
    // instead of spawning unconditionally. (random(30,60) radius matches SP.)
    const astCap = GAME_CONFIG.MAX_ASTEROIDS || 16;
    const want = Math.max(0, Math.min(cfg.asteroids | 0, astCap - this.asteroidPool.activeObjects.length));
    for (let i = 0; i < want; i++) {
      const p = this._edgeSpawnPoint();
      this.asteroidPool.get(p.x, p.y, random(30, 60), astLevel);
    }
    // A boss group spawns the REAL modular boss for this stage (multi-phase +
    // orbiting parts + intro, run headless by the descriptor driver). If no
    // descriptor exists for the stage, fall back to a tier-scaled boss
    // (BOSS_TIER_STATS). Escort (non-boss) groups spawn normally.
    const wps = (this.game.runConfig && this.game.runConfig.wavesPerStage) || 3;
    const bossCx = this.gameField.width / 2;
    const bossCy = this.gameField.height * 0.28; // top-center dramatic entrance
    for (const sub of (cfg.subWaves || [])) {
      for (const group of sub) {
        if (group.isBoss) {
          const stage = Math.max(1, Math.ceil(n / wps));
          const mb = this.spawnModularBoss(stage, { x: bossCx, y: bossCy });
          if (!mb) {
            const e = this.spawnEnemy(bossCx, bossCy, group.type, this.game.enemyLevel);
            if (e) this._applyBossTier(e, group.bossTier || 1);
          }
          continue; // one boss per boss group (ignore count)
        }
        for (let i = 0; i < (group.count | 0); i++) {
          const p = this._edgeSpawnPoint();
          this.spawnEnemy(p.x, p.y, group.type, this.game.enemyLevel);
        }
      }
    }
    this.waveStarted = true;
    if (this.events?.emit) this.events.emit('wave:start', { wave: n });
  }

  /**
   * Promote a freshly-spawned enemy to a tier boss (mirrors the SP forceSpawnEnemy
   * bossTier overlay): inflate HP + size + speed and stamp the boss flags.
   */
  _applyBossTier(enemy, tierNum) {
    const tier = BOSS_TIER_STATS[tierNum] || BOSS_TIER_STATS[1];
    enemy.isBoss = true;
    enemy.bossTier = tierNum;
    enemy.health *= tier.hpMul;
    enemy.maxHealth *= tier.hpMul;
    if (enemy.config && typeof enemy.config.speed === 'number') enemy.config.speed *= tier.speedMul;
    if (typeof enemy.radius === 'number') enemy.radius *= tier.sizeMul;
    enemy.bossSizeMul = tier.sizeMul;
  }

  /**
   * Spawn a modular multi-phase boss (the real SP descriptor — phases, orbiting
   * parts, intro, death script) bound to SpHost as its engine context. The
   * descriptor's per-frame driver runs automatically via enemy.update's BOSS-04
   * wiring (`this._bossDriver`), so the boss fights headless. Mirrors the SP
   * spawnModularBoss minus the camera/warp-in presentation.
   * @param {number|string|object} which - stage number, boss id, or descriptor
   */
  spawnModularBoss(which, opts = {}) {
    let desc = which;
    if (typeof which === 'number') desc = this._getBossForStage(which);
    else if (typeof which === 'string') desc = this._getBossById(which);
    if (!desc || typeof desc !== 'object') return null;
    const boss = this.enemyPool.get();
    if (!boss) return null;
    const level = (opts.level != null) ? opts.level : (this.game.enemyLevel || 1);
    boss.reset(0, 0, 'TITAN', level, this); // heaviest base chassis; desc overlays HP/size
    boss.x = opts.x ?? this.gameField.width / 2;
    boss.y = opts.y ?? this.gameField.height * 0.28;
    boss.angle = 0;
    try {
      if (typeof desc.initBoss === 'function') desc.initBoss(boss, this, frameClock.now);
    } catch (err) {
      console.error('SpHost.spawnModularBoss: initBoss failed', err);
      this.enemyPool.release(boss);
      return null;
    }
    boss.isBoss = true;
    boss.bossId = desc.id;
    boss.name = desc.name;
    boss.element = desc.element;
    if (desc.size) { boss.size = desc.size; boss.radius = desc.size / 2; boss.baseRadius = boss.radius; }
    boss.phaseCount = desc.phaseCount || boss.phaseCount;
    boss.isFinalBoss = !!desc.isFinalBoss;
    boss._bossDriver = desc.updateBoss;      // ticked by enemy.update (BOSS-04)
    boss._buildBossDeathScript = desc.buildDeathScript;
    boss.bossTier = boss.bossTier || 4;      // snapshot `b` → client boss UI
    if (typeof boss.radius === 'number') boss.mass = Math.PI * boss.radius * boss.radius * 0.8;
    return boss;
  }

  /** Advance the wave driver: start wave 1, then the next when fully cleared. */
  _updateWaves() {
    if (this.game.state !== GAME_STATES.PLAYING) return;
    if (!this.waveStarted) { this.startWave(this.startWaveAt || 1); return; }
    // Enemies in their death animation keep active=true and stay pooled;
    // cleanupInactive (run in tick) frees them only once fully dead — so an
    // empty pool is the true "wave cleared" signal.
    if (this.enemyPool.activeObjects.length > 0) { this._clearPending = false; return; }
    if (this.game.currentWave >= MAX_WAVES) return; // campaign finished
    if (!this._clearPending) {
      // First tick the wave reads empty: announce the clear + open a short
      // breather (SP shows a wave-clear interlude before the next wave).
      this._clearPending = true;
      this._interWave = INTER_WAVE_TICKS;
      if (this.events?.emit) this.events.emit('wave:clear', { wave: this.game.currentWave });
      return;
    }
    if (this._interWave > 0) { this._interWave -= 1; return; }
    this._clearPending = false;
    this.startWave(this.game.currentWave + 1);
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

  // Co-op death flow (P6): a lethal hit DOWNS the current player (active=false,
  // downed=true) rather than ending the run — a living teammate can revive them
  // (see _updateRevives). The run only ends (GAME_OVER) when EVERY player is
  // down. Single-player (1 slot) collapses to the old behavior: down → all-down
  // → game over. `this.player` is the slot being collision-resolved.
  handlePlayerDeath() {
    const p = this.player;
    if (!p) return;
    p.active = false;
    p.downed = true;
    p.reviveProgress = 0;
    if (this.events?.emit) this.events.emit('ship:downed', { x: p.x, y: p.y });
    if (this.players.every((s) => s.player.downed)) {
      if (this.game) this.game.state = GAME_STATES.GAME_OVER;
      if (this.events?.emit) this.events.emit('game:over');
    }
  }

  // Revive downed teammates (mirrors the toy sim's co-op revive). A downed ship
  // accrues reviveProgress while any LIVING teammate is within REVIVE_RADIUS;
  // at REVIVE_TICKS it comes back at half HP with brief i-frames. Progress
  // decays when no one is near.
  _updateRevives() {
    const r2 = REVIVE_RADIUS * REVIVE_RADIUS;
    for (const slot of this.players) {
      const p = slot.player;
      if (!p.downed) { p.reviveProgress = 0; continue; }
      let reviver = false;
      for (const o of this.players) {
        if (o === slot) continue;
        const op = o.player;
        if (op.downed || op.active === false) continue; // living teammate only
        const dx = op.x - p.x;
        const dy = op.y - p.y;
        if (dx * dx + dy * dy <= r2) { reviver = true; break; }
      }
      if (reviver) {
        p.reviveProgress = (p.reviveProgress || 0) + 1;
        if (p.reviveProgress >= REVIVE_TICKS) {
          p.active = true;
          p.downed = false;
          p.reviveProgress = 0;
          p.health = Math.max(1, Math.round((p.maxHealth || 40) * 0.5));
          if (typeof p.makeInvincible === 'function') p.makeInvincible(1500);
          if (this.events?.emit) this.events.emit('ship:revived', { x: p.x, y: p.y });
        }
      } else if (p.reviveProgress > 0) {
        p.reviveProgress = Math.max(0, p.reviveProgress - REVIVE_DECAY);
      }
    }
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

  /**
   * Advance one fixed (LOGIC_TICK_MS) sim tick.
   * @param {object} [input] back-compat: applied to slot 0 (single-player /
   *   the controller). Co-op callers set per-slot inputs via setSlotInput()
   *   first; an `input` here still overrides slot 0.
   */
  tick(input = null) {
    // Install this room's clock + RNG into the process globals (isolates
    // concurrent SpHosts — see constructor). Captured back at the end of tick().
    frameClock.now = this._clockNow;
    frameClock.tick = this._clockTick;
    setRandomSource(this.rng);
    frameClock.advance();
    this.tickCount += 1;
    if (input) {
      this.players[0].input = { ...NEUTRAL_INPUT, ...input };
      if (typeof input.clientTick === 'number') {
        this.players[0].lastInputTick = input.clientTick;
        this._lastInputTick = input.clientTick;
      }
    }

    // 1. Per-slot player movement + firing. Rebind `this.player` to the slot so
    //    the SP code's `this.player` / `window.gameEngine.player` reads (they're
    //    the same object) refer to the player being updated.
    for (const slot of this.players) {
      if (slot.player.downed) continue; // downed pilots lie still, awaiting revive
      this.player = slot.player;
      const inp = { ...NEUTRAL_INPUT, ...slot.input };
      slot.player.update(inp, noopPool, this.bulletPool, noopAudio, noopPool, false, this.gameField);
    }
    const primary = this.players[0].player;
    this.player = primary;

    // 2. Entity pools — sim physics. Bullets/asteroids/enemy-bullets are world
    //    state; enemies aggro the NEAREST LIVING player (co-op generalization).
    for (const b of this.bulletPool.activeObjects) {
      b.update(noopPool, this.asteroidPool, this.enemyPool, this, this.gameField);
    }
    this.asteroidPool.updateActive(this.gameField);
    for (const e of this.enemyPool.activeObjects) {
      e.update(this._nearestLivingPlayer(e.x, e.y) || primary, this, this.gameField);
    }
    for (const eb of this.enemyBulletPool.activeObjects) eb.update();

    // 3. Collectibles — drift / blink-fade / tractor magnet (toward the primary
    //    living player for the bulk update; per-player pickup is resolved in the
    //    collision passes below).
    const magnetTo = this._nearestLivingPlayer(this.gameField.width / 2, this.gameField.height / 2) || primary;
    this.colorStarPool.updateActive(magnetTo.vel, magnetTo, false, this.gameField, null);
    this.goldCoinPool.updateActive(magnetTo, false);
    this.goldShapePool.updateActive(magnetTo, false);
    this.powerupPool.updateActive(magnetTo, false, null);

    // 4. Authoritative collisions — run once PER PLAYER (rebinding `this.player`)
    //    so each ship resolves its own body / enemy-bullet / pickup collisions.
    //    World collisions (bullet↔enemy, enemy↔asteroid) deactivate their
    //    entities on the first pass, so they're effectively processed once.
    for (const slot of this.players) {
      if (slot.player.downed) continue; // downed pilots take no hits / pickups
      this.player = slot.player;
      this.handleCollisions();
    }
    this.player = primary;

    // 5. Reclaim everything the tick deactivated.
    this.bulletPool.cleanupInactive();
    this.enemyPool.cleanupInactive();
    this.enemyBulletPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();
    this.colorStarPool.cleanupInactive();
    this.goldCoinPool.cleanupInactive();
    this.goldShapePool.cleanupInactive();
    this.powerupPool.cleanupInactive();

    // 6. Co-op revives (downed pilots brought back by nearby teammates).
    this._updateRevives();

    // 7. Wave progression (opt-in; reuses the real wave-data tables).
    if (this.autoWaves) this._updateWaves();

    // 8. Capture this room's advanced clock back (so the next tick resumes from
    //    here even if another room ticked the global clock in between).
    this._clockNow = frameClock.now;
    this._clockTick = frameClock.tick;

    // 9. Drain + return the per-tick semantic event stream for the client.
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

  // ── Network serialization (the MP wire contract) ──────────────────────────
  // Produces the SAME snapshot shape the toy-sim room emits + the SP client
  // consumes (ships / enemies / asteroids / bullets / drops), so the existing
  // SP-shape MP renderer + interpolator render it unchanged.

  /** Active drops in wire shape: { id, x, y, k } (k ∈ health|gold). */
  _drops() {
    const drops = [];
    for (const s of this.colorStarPool.activeObjects) {
      drops.push({ id: s._netId, x: round(s.x), y: round(s.y), k: s.starType === 'money' ? 'gold' : 'health' });
    }
    for (const c of this.goldCoinPool.activeObjects) drops.push({ id: c._netId, x: round(c.x), y: round(c.y), k: 'gold' });
    for (const g of this.goldShapePool.activeObjects) drops.push({ id: g._netId, x: round(g.x), y: round(g.y), k: 'gold' });
    return drops;
  }

  /** Full authoritative snapshot in the MP wire shape. */
  buildSnapshot() {
    const ships = this.players.map((slot) => {
      const p = slot.player;
      return {
        id: slot.id,
        x: round(p.x), y: round(p.y), vx: round(p.vel.x), vy: round(p.vel.y), a: round(p.angle, 3),
        hp: Math.ceil(p.health), mhp: p.maxHealth,
        al: p.active !== false, dn: !!p.downed, rp: p.reviveProgress || 0,
        g: this.game?.money | 0,
        // HUD vitals (look-like-SP): level, in-level XP, power-weapon energy,
        // and spare health tanks (triforce). The delta codec diffs per field, so
        // these additive fields flow through keyframes + deltas unchanged.
        lv: (p.level | 0) || 1,
        xp: Math.max(0, p.xp | 0),
        e: Math.round(p.energy || 0),
        me: p.maxEnergy || 100,
        tk: this.healthTanks | 0,
        li: slot.lastInputTick,
      };
    });
    const enemies = this.enemyPool.activeObjects.map((e) => {
      const out = {
        id: e._netId, x: round(e.x), y: round(e.y), a: round(e.faceAngle ?? e.angle ?? 0, 3),
        r: e.radius, hp: Math.ceil(e.health), mhp: e.maxHealth, ty: e.type,
        b: e.isBoss ? (e.bossTier || 1) : 0, // boss tier (0 = ordinary enemy)
      };
      // Modular boss: serialize the living orbiting parts (the bolt-heads that
      // shield the core) so the client can render + the player can target them.
      const ps = e._partsState && e._partsState.parts;
      if (ps && ps.length) {
        const pt = [];
        for (const p of ps) {
          if (p.alive) pt.push({ x: round(p.x), y: round(p.y), r: round(p.radius, 1), hp: Math.ceil(p.health), mhp: p.maxHealth });
        }
        if (pt.length) out.pt = pt;
      }
      return out;
    });
    const asteroids = this.asteroidPool.activeObjects.map((a) => ({
      id: a._netId, x: round(a.x), y: round(a.y),
      // SP asteroids tumble in 3D (rot3D), not a flat `angle`; send rot3D.x as
      // the scalar tumble seed the client expands into its wireframe spin (the
      // client generates its own verts, exactly like the toy-sim path).
      a: round(a.rot3D ? a.rot3D.x : 0, 3), r: round(a.radius, 1),
    }));
    // `c` = the SP bullet's weapon colour (constant per bullet, so the delta
    // codec only sends it on the bullet's first frame) — lets the client tint
    // bullets like single-player instead of a single fixed hue.
    const bullets = this.bulletPool.activeObjects.map((b) => ({ id: b._netId, x: round(b.x), y: round(b.y), o: this.playerId, c: b.color || null }));
    // Enemy bullets — previously NOT serialized, so incoming fire was invisible
    // client-side even though it damaged the player. Same shape as player bullets
    // (id/x/y/colour); the client renders them in a menacing red palette.
    const ebullets = this.enemyBulletPool.activeObjects.map((b) => ({ id: b._netId, x: round(b.x), y: round(b.y), c: b.color || null }));
    const drops = this._drops();
    return {
      tick: this.tickCount,
      wave: this.game?.currentWave | 0,
      ws: this.enemyPool.activeObjects.length > 0 ? 'active' : 'intermission',
      ships, enemies, asteroids, bullets, ebullets, drops,
    };
  }

  /**
   * Translate one tick into the EV.* protocol event stream the SP client maps to
   * sounds + juice. Positioned FX (spawns / deaths / collects / bullet-spawn)
   * are DERIVED from the snapshot diff (the SP audio stream carries no coords);
   * positionless sounds (hits, downs, wave-start) come from the SP audio stream.
   * Call AFTER buildSnapshot for this tick (it diffs against the prior tick).
   */
  deriveEvents(snapshot, rawEvents) {
    const out = [];
    const curEnemies = new Map(snapshot.enemies.map((e) => [e.id, e]));
    const curAsteroids = new Map(snapshot.asteroids.map((a) => [a.id, a]));
    const curDrops = new Map(snapshot.drops.map((d) => [d.id, d]));
    const curBulletIds = new Set(snapshot.bullets.map((b) => b.id));

    // Spawns (new ids this tick).
    for (const [id, e] of curEnemies) if (!this._lastEnemies.has(id)) out.push({ type: EV.ENEMY_SPAWN, x: e.x, y: e.y });
    // Deaths / collects (ids that vanished) — positioned at last-known coords.
    for (const [id, e] of this._lastEnemies) if (!curEnemies.has(id)) out.push({ type: EV.ENEMY_DEATH, x: e.x, y: e.y, r: e.r });
    for (const [id, a] of this._lastAsteroids) if (!curAsteroids.has(id)) out.push({ type: EV.ASTEROID_DESTROYED, x: a.x, y: a.y, r: a.r });
    for (const [id, d] of this._lastDrops) if (!curDrops.has(id)) out.push({ type: EV.DROP_COLLECTED, x: d.x, y: d.y, kind: d.k });
    // Bullet fire: any new bullet id this tick → one shoot event (avoids N sounds
    // for a multishot volley).
    let firedThisTick = false;
    for (const id of curBulletIds) if (!this._lastBulletIds.has(id)) { firedThisTick = true; break; }
    if (firedThisTick) out.push({ type: EV.BULLET_SPAWN });

    // Positionless sounds from the SP audio stream.
    for (const ev of (rawEvents || [])) {
      switch (ev[0]) {
        case 'audio:hit': out.push({ type: EV.SHIP_HIT }); break;
        case 'audio:enemy-hit-by-bullet': out.push({ type: EV.ENEMY_HIT }); break;
        case 'ship:downed': out.push({ type: EV.SHIP_DOWNED, x: ev[1]?.x, y: ev[1]?.y }); break;
        case 'ship:revived': out.push({ type: EV.SHIP_REVIVED, x: ev[1]?.x, y: ev[1]?.y }); break;
        case 'wave:start': out.push({ type: EV.WAVE_START, wave: ev[1]?.wave | 0 }); break;
        case 'wave:clear': out.push({ type: EV.WAVE_CLEAR, wave: ev[1]?.wave | 0 }); break;
        default: break; // enemy-destroy/asteroid-destroy/coin/powerup owned by the diff
      }
    }

    this._lastEnemies = curEnemies;
    this._lastAsteroids = curAsteroids;
    this._lastDrops = curDrops;
    this._lastBulletIds = curBulletIds;
    return out;
  }

  /**
   * Convenience: advance one tick and return { snapshot, events } for the room.
   * Pass no input in co-op (slots already hold their inputs via setSlotInput);
   * an explicit `input` still overrides slot 0 (single-player / tests).
   */
  frame(input = null) {
    const rawEvents = this.tick(input);
    const snapshot = this.buildSnapshot();
    const events = this.deriveEvents(snapshot, rawEvents);
    return { snapshot, events };
  }
}

/** Round to `dp` decimal places (wire compactness; mirrors room.js). */
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
