// server/src/room-manager.js — room registry + lifecycle.
//
// v1 routes everyone into a single shared "default" room (mirrors the archived
// Phase-2 single-room model). Multi-room matchmaking (quick-match / code-based
// join) lands in Phase 7; the interface here is meant to grow into that without
// touching the connection-handling code in index.js.

import { Room } from './room.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getDefaultRoom() {
    let room = this.rooms.get('default');
    if (!room) {
      room = new Room({ id: 'default', seed: (Date.now() >>> 0) || 1 });
      room.start();
      this.rooms.set('default', room);
    }
    return room;
  }

  stopAll() {
    for (const [, room] of this.rooms) room.stop();
    this.rooms.clear();
  }
}
