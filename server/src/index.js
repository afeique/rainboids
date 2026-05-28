// server/src/index.js — Rainboids multiplayer server entry point.
//
// Wires the WebSocket transport to the room manager and drives the per-
// connection handshake: Hello → join → Input loop → leave. The game logic and
// the wire protocol are shared with the browser client via ../../js/sim/*.

import { WebSocketTransport } from './transport/websocket.js';
import { RoomManager } from './room-manager.js';
import { WIRE_VERSION, C2S, S2C, WS_PATH, DEFAULT_PORT } from '../../js/sim/protocol.js';

const PORT = Number(process.env.MP_PORT) || DEFAULT_PORT;
const HELLO_TIMEOUT_MS = 5000;

const transport = new WebSocketTransport({ port: PORT, path: WS_PATH });
const rooms = new RoomManager();

transport.onConnection((conn) => {
  let joined = false;
  let playerId = null;
  let room = null;

  // Drop connections that never say Hello (probes, bad clients).
  const helloTimer = setTimeout(() => {
    if (!joined) {
      conn.send({ t: S2C.ERROR, code: 'hello_timeout', message: 'no hello before timeout' });
      conn.close();
    }
  }, HELLO_TIMEOUT_MS);

  conn.onMessage((msg) => {
    if (!msg || typeof msg.t !== 'string') return;

    if (!joined) {
      if (msg.t !== C2S.HELLO) {
        conn.send({ t: S2C.ERROR, code: 'expected_hello', message: 'first message must be hello' });
        conn.close();
        return;
      }
      if (msg.wireVersion !== WIRE_VERSION) {
        conn.send({
          t: S2C.ERROR,
          code: 'wire_version_mismatch',
          message: `server expects ${WIRE_VERSION}, client sent ${msg.wireVersion}`,
        });
        conn.close();
        return;
      }
      clearTimeout(helloTimer);
      room = rooms.getOrCreateRoom(msg.room);
      playerId = room.join(conn, msg.name);
      joined = true;
      console.log(`[mp] player ${playerId} joined room "${room.id}" (pop ${room.population})`);
      return;
    }

    switch (msg.t) {
      case C2S.INPUT:
        room.setInput(playerId, msg);
        break;
      case C2S.BYE:
        conn.close();
        break;
      default:
        // Unknown post-join message — ignore (forward-compat).
        break;
    }
  });

  conn.onClose(() => {
    clearTimeout(helloTimer);
    if (joined && room) {
      room.leave(playerId);
      console.log(`[mp] player ${playerId} left room "${room.id}" (pop ${room.population})`);
      // Reclaim the tick loop once a room empties out.
      if (room.population === 0) {
        rooms.closeRoom(room.id);
        console.log(`[mp] closed empty room "${room.id}"`);
      }
    }
  });
});

await transport.listen();
console.log(`[mp] Rainboids server listening on :${PORT}${WS_PATH} (wire v${WIRE_VERSION})`);

function shutdown() {
  console.log('[mp] shutting down…');
  rooms.stopAll();
  transport.close().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
