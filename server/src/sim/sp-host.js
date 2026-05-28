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

  /** Construct the real SP Player (dynamic import keeps load order browser-shim-first). */
  async init() {
    const { Player } = await import('../../../js/modules/player/player.js');
    this.player = new Player();
    this.player.x = this.gameField.width / 2;
    this.player.y = this.gameField.height / 2;
    return this;
  }

  /** Advance one fixed (LOGIC_TICK_MS) sim tick with the given input frame. */
  tick(input = NEUTRAL_INPUT) {
    frameClock.advance();
    this.tickCount += 1;
    // Real SP player movement. Firing is held off until the bullet pool is
    // wired (next iteration), so force fire flags off for now.
    const inp = { ...NEUTRAL_INPUT, ...input, fire: false, fireSecondary: false };
    this.player.update(inp, noopPool, noopPool, noopAudio, noopPool, false, this.gameField);
  }

  /** Serialize the player to the snapshot wire shape. */
  snapshotPlayer() {
    const p = this.player;
    return {
      x: p.x, y: p.y, vx: p.vel.x, vy: p.vel.y, a: p.angle,
      hp: p.health, mhp: p.maxHealth,
    };
  }
}
