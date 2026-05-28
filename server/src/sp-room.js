// server/src/sp-room.js — an authoritative room backed by the REAL SP sim.
//
// Drop-in alternative to room.js (the toy sim) that runs the actual
// single-player simulation headless via SpHost (Path A). Same public API
// (join / leave / setInput / start / stop / population / roster) and the SAME
// wire shape (ships / enemies / asteroids / bullets / drops + EV.* events), so
// the existing SP-shape MP client renders it unchanged — now with the real SP
// weapons, enemies, collisions, drops, and waves.
//
// Scope: ONE controlling player (the P4 milestone — "one player, MP plays
// exactly like SP"). SpHost is still single-player; co-op N players is P5, at
// which point this room generalizes to N slots. Additional joiners spectate.
// Selected via MP_SIM=sphost (room-manager.js); the toy sim stays the default.

import { SpHost } from './sim/sp-host.js';
import { S2C } from '../../js/sim/protocol.js';
import { encode } from '../../js/sim/codec.js';
import { buildDelta } from '../../js/sim/snapshot-delta.js';
import { TICK_MS } from '../../js/sim/constants.js';

// Send a full keyframe at least this often (and whenever a player joins) so new
// clients get a baseline and any drift is bounded. Deltas in between.
const KEYFRAME_TICKS = 30;

const EMPTY_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false, fire: false,
  aimX: null, aimY: null, clientTick: 0,
});

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
      .then(() => { this.host.autoWaves = true; this.ready = true; })
      .catch((err) => { console.error(`[mp] SpRoom "${id}" init failed`, err); });
    this.players = new Map(); // playerId -> { conn, name }
    this.controllerId = null; // the single player driving the SpHost ship
    this.nextPlayerId = 1;
    this._pendingInput = { ...EMPTY_INPUT };
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

  join(conn, name) {
    const playerId = this.nextPlayerId++;
    this.players.set(playerId, { conn, name: name || `player${playerId}` });
    // First joiner controls the ship; bind the SpHost ship to its id so the
    // client reconciles against the right snapshot ship.
    if (this.controllerId == null) {
      this.controllerId = playerId;
      this.host.playerId = playerId;
    }
    this._forceKeyframe = true;
    const sx = this.host.gameField.width / 2;
    const sy = this.host.gameField.height / 2;
    conn.send({
      t: S2C.WELCOME,
      playerId,
      room: this.id,
      serverTick: this.host.tickCount,
      seed: this.seed,
      spawnX: sx,
      spawnY: sy,
      roster: this.roster(),
    });
    this._broadcast({ t: S2C.PEER_JOINED, playerId, roster: this.roster() }, playerId);
    return playerId;
  }

  leave(playerId) {
    if (!this.players.has(playerId)) return;
    this.players.delete(playerId);
    if (playerId === this.controllerId) this.controllerId = this.roster()[0] ?? null;
    this._broadcast({ t: S2C.PEER_LEFT, playerId, roster: this.roster() });
  }

  setInput(playerId, msg) {
    // Only the controlling player drives the (single) SpHost ship for now.
    if (playerId === this.controllerId) this._pendingInput = sanitizeInput(msg);
  }

  _tick() {
    if (!this.ready) return; // host still importing the SP modules

    const { snapshot, events } = this.host.frame(this._pendingInput);
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
