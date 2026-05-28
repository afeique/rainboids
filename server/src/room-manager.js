// server/src/room-manager.js — room registry + lifecycle (matchmaking).
//
// Rooms are keyed by a join code. A blank/absent code routes to the shared
// "public" room; any other code creates or joins that private room, so separate
// groups can play their own games. Empty rooms are closed by the connection
// handler (index.js) on last-leave to free their tick loop.

import { Room } from './room.js';
import { SpRoom } from './sp-room.js';

const PUBLIC_ROOM = 'public';

// MP_SIM=sphost runs the REAL single-player simulation headless (Path A) instead
// of the toy sim. Single-player for now (P4 milestone); the toy sim stays the
// default so the existing N-player path is unaffected until SpHost goes co-op.
const RoomClass = process.env.MP_SIM === 'sphost' ? SpRoom : Room;

function normalizeCode(code) {
  const c = (code == null ? '' : String(code)).trim();
  return c.length ? c.slice(0, 24) : PUBLIC_ROOM;
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /** Get the room for `code`, creating + starting it if needed. */
  getOrCreateRoom(code) {
    const id = normalizeCode(code);
    let room = this.rooms.get(id);
    if (!room) {
      room = new RoomClass({ id, seed: (Date.now() >>> 0) ^ (this.rooms.size * 2654435761) || 1 });
      room.start();
      this.rooms.set(id, room);
    }
    return room;
  }

  /** Stop and remove a room (used when it empties out). */
  closeRoom(id) {
    const room = this.rooms.get(id);
    if (room) {
      room.stop();
      this.rooms.delete(id);
    }
  }

  stopAll() {
    for (const [, room] of this.rooms) room.stop();
    this.rooms.clear();
  }
}
