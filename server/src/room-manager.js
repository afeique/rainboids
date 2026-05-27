// server/src/room-manager.js — room registry + lifecycle (matchmaking).
//
// Rooms are keyed by a join code. A blank/absent code routes to the shared
// "public" room; any other code creates or joins that private room, so separate
// groups can play their own games. Empty rooms are closed by the connection
// handler (index.js) on last-leave to free their tick loop.

import { Room } from './room.js';

const PUBLIC_ROOM = 'public';

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
      room = new Room({ id, seed: (Date.now() >>> 0) ^ (this.rooms.size * 2654435761) || 1 });
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
