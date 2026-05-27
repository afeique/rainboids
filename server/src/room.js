// server/src/room.js — one authoritative game instance.
//
// Owns a World, the set of connected players, and the fixed-step tick loop.
// Each tick: gather latest inputs → sim.tick() → broadcast a Snapshot (+ an
// Event frame if anything happened this tick).

import { createWorld, addShip, removeShip, spawnPointFor, spawnAsteroids } from '../../js/sim/world.js';
import { tick } from '../../js/sim/tick.js';
import { EMPTY_INPUT } from '../../js/sim/ship.js';
import { TICK_MS, ASTEROID_COUNT } from '../../js/sim/constants.js';
import { S2C } from '../../js/sim/protocol.js';
import { encode } from '../../js/sim/codec.js';

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

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function buildSnapshot(world) {
  const ships = [];
  for (const [, s] of world.ships) {
    ships.push({
      id: s.playerId,
      x: round(s.x), y: round(s.y),
      vx: round(s.vx), vy: round(s.vy),
      a: round(s.angle, 3),
      hp: s.hp, mhp: s.maxHp,
      al: s.alive,
      li: s.lastInputTick, // per-ship acked input tick (owning client reconciles)
    });
  }
  const asteroids = [];
  for (const [, a] of world.asteroids) {
    asteroids.push({
      id: a.id,
      x: round(a.x), y: round(a.y),
      a: round(a.angle, 3),
      r: round(a.radius, 1),
    });
  }
  const bullets = [];
  for (const [, b] of world.bullets) {
    bullets.push({ id: b.id, x: round(b.x), y: round(b.y), o: b.ownerId });
  }
  return { t: S2C.SNAPSHOT, tick: world.tick, ships, asteroids, bullets };
}

export class Room {
  constructor({ id, seed }) {
    this.id = id;
    this.world = createWorld({ seed });
    spawnAsteroids(this.world, ASTEROID_COUNT);
    this.players = new Map(); // playerId -> { conn, input, name }
    this.nextPlayerId = 1;
    this._timer = null;
  }

  get running() { return this._timer !== null; }
  get population() { return this.players.size; }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  roster() { return [...this.players.keys()]; }

  join(conn, name) {
    const playerId = this.nextPlayerId++;
    const sp = spawnPointFor(this.world);
    addShip(this.world, playerId, sp.x, sp.y);
    this.players.set(playerId, { conn, input: { ...EMPTY_INPUT }, name: name || `player${playerId}` });

    conn.send({
      t: S2C.WELCOME,
      playerId,
      serverTick: this.world.tick,
      seed: this.world.seed,
      spawnX: sp.x,
      spawnY: sp.y,
      roster: this.roster(),
    });
    this._broadcast({ t: S2C.PEER_JOINED, playerId, roster: this.roster() }, playerId);
    return playerId;
  }

  leave(playerId) {
    if (!this.players.has(playerId)) return;
    removeShip(this.world, playerId);
    this.players.delete(playerId);
    this._broadcast({ t: S2C.PEER_LEFT, playerId, roster: this.roster() });
  }

  setInput(playerId, msg) {
    const p = this.players.get(playerId);
    if (p) p.input = sanitizeInput(msg);
  }

  _tick() {
    const inputs = new Map();
    for (const [pid, p] of this.players) inputs.set(pid, p.input);

    const events = tick(this.world, inputs);

    const snapRaw = encode(buildSnapshot(this.world));
    for (const [, p] of this.players) p.conn.sendRaw(snapRaw);

    if (events.length) {
      const evRaw = encode({ t: S2C.EVENT, tick: this.world.tick, payloads: events });
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
