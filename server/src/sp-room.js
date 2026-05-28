// server/src/sp-room.js — an authoritative room backed by the REAL SP sim.
//
// Drop-in alternative to room.js (the toy sim) that runs the actual
// single-player simulation headless via SpHost (Path A). Same public API
// (join / leave / setInput / start / stop / population / roster) and the SAME
// wire shape (ships / enemies / asteroids / bullets / drops + EV.* events), so
// the existing SP-shape MP client renders it unchanged — now with the real SP
// weapons, enemies, collisions, drops, and waves.
//
// Co-op: N players share one arena (SpHost N slots — each joiner gets a real
// ship that moves/shoots/collides via the actual SP code). Selected via
// MP_SIM=sphost (room-manager.js); the toy sim stays the default until the
// real-sim path is browser-verified at co-op scale.

import { SpHost } from './sim/sp-host.js';
import { S2C } from '../../js/sim/protocol.js';
import { encode } from '../../js/sim/codec.js';
import { buildDelta } from '../../js/sim/snapshot-delta.js';
import { TICK_MS } from '../../js/sim/constants.js';

// Send a full keyframe at least this often (and whenever a player joins) so new
// clients get a baseline and any drift is bounded. Deltas in between.
const KEYFRAME_TICKS = 30;

function sanitizeInput(m) {
  return {
    up: !!m.up,
    down: !!m.down,
    left: !!m.left,
    right: !!m.right,
    fire: !!m.fire,
    aimX: typeof m.aimX === 'number' ? m.aimX : null,
    aimY: typeof m.aimY === 'number' ? m.aimY : null,
    clientTick: m.clientTick | 0,
  };
}

export class SpRoom {
  constructor({ id, seed }) {
    this.id = id;
    this.seed = (seed >>> 0) || 1;
    this.host = new SpHost({ seed: this.seed });
    // SpHost.init() is async (dynamic imports of the SP entity modules); kick it
    // off now and gate the tick loop on it. Spawn coords are deterministic
    // (field center), so join() can answer WELCOME before init resolves.
    this.ready = false;
    this._ready = this.host.init()
      .then(() => {
        this.host.autoWaves = true;
        // Debug/test hook: open on a specific wave (e.g. a boss wave) so QA can
        // reach late-game content without grinding through earlier waves.
        const sw = Number(process.env.MP_START_WAVE);
        if (Number.isFinite(sw) && sw >= 1) this.host.startWaveAt = sw | 0;
        this.ready = true;
      })
      .catch((err) => { console.error(`[mp] SpRoom "${id}" init failed`, err); });
    this.players = new Map(); // playerId -> { conn, name }
    this.nextPlayerId = 1;
    this._timer = null;
    this._lastFull = null;
    this._sinceKeyframe = 0;
    this._forceKeyframe = false;
  }

  get running() { return this._timer !== null; }
  get population() { return this.players.size; }
  roster() { return [...this.players.keys()]; }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // Spread joiners around the arena center so ships don't stack on spawn.
  _spawnFor(playerId) {
    const cx = this.host.gameField.width / 2;
    const cy = this.host.gameField.height / 2;
    const i = (playerId - 1) % 8;
    const ang = (i / 8) * Math.PI * 2;
    const r = i === 0 ? 0 : 90;
    return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
  }

  join(conn, name) {
    const playerId = this.nextPlayerId++;
    this.players.set(playerId, { conn, name: name || `player${playerId}` });
    const sp = this._spawnFor(playerId);
    // Give the joiner a real co-op ship slot in the shared SpHost arena. If the
    // host hasn't finished importing the SP modules yet, register the slot once
    // it's ready (WELCOME below still answers from the deterministic spawn).
    if (this.ready) this.host.addPlayer(playerId, sp.x, sp.y);
    else this._ready.then(() => this.host.addPlayer(playerId, sp.x, sp.y));
    this._forceKeyframe = true;
    conn.send({
      t: S2C.WELCOME,
      playerId,
      room: this.id,
      serverTick: this.host.tickCount,
      seed: this.seed,
      spawnX: sp.x,
      spawnY: sp.y,
      roster: this.roster(),
    });
    this._broadcast({ t: S2C.PEER_JOINED, playerId, roster: this.roster() }, playerId);
    return playerId;
  }

  leave(playerId) {
    if (!this.players.has(playerId)) return;
    this.players.delete(playerId);
    if (this.ready) this.host.removePlayer(playerId);
    else this._ready.then(() => this.host.removePlayer(playerId));
    this._broadcast({ t: S2C.PEER_LEFT, playerId, roster: this.roster() });
  }

  setInput(playerId, msg) {
    if (this.ready) this.host.setSlotInput(playerId, sanitizeInput(msg));
  }

  _tick() {
    if (!this.ready) return; // host still importing the SP modules

    // Co-op: each ship's input is already on its slot (setInput → setSlotInput);
    // advance with no override so all slots step from their latest inputs.
    const { snapshot, events } = this.host.frame();
    const full = { t: S2C.SNAPSHOT, ...snapshot };

    // Keyframe (full) on first tick / join / interval; field-level delta otherwise.
    let payload;
    if (!this._lastFull || this._forceKeyframe || this._sinceKeyframe >= KEYFRAME_TICKS) {
      payload = { ...full, full: true };
      this._sinceKeyframe = 0;
      this._forceKeyframe = false;
    } else {
      payload = { t: S2C.SNAPSHOT, full: false, ...buildDelta(this._lastFull, full) };
      this._sinceKeyframe += 1;
    }
    this._lastFull = full;
    const snapRaw = encode(payload);
    for (const [, p] of this.players) p.conn.sendRaw(snapRaw);

    if (events.length) {
      const evRaw = encode({ t: S2C.EVENT, tick: snapshot.tick, payloads: events });
      for (const [, p] of this.players) p.conn.sendRaw(evRaw);
    }
  }

  _broadcast(msg, exceptId) {
    const raw = encode(msg);
    for (const [pid, p] of this.players) {
      if (pid !== exceptId) p.conn.sendRaw(raw);
    }
  }
}
