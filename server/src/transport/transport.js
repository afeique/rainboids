// server/src/transport/transport.js — the server-side Transport seam.
//
// Everything above this interface (RoomManager, Room, sim) is transport-
// agnostic. WebSocket is the first implementation (./websocket.js). WebTransport
// (Phase 8, deferred) will be a second implementation of the SAME interface and
// must not require any change above this seam.
//
// A Transport is a listener that emits Connection objects. A Connection is a
// single client link with these methods:
//
//   conn.id                      - stable per-connection id (number)
//   conn.send(msgObject)         - encode + send one message
//   conn.sendRaw(encodedString)  - send an already-encoded payload (broadcast
//                                  fast-path: encode once, send to many)
//   conn.onMessage(cb)           - cb(decodedMessage|rawData) per inbound frame
//   conn.onClose(cb)             - cb() once when the link closes
//   conn.close()                 - close the link
//   conn.isOpen                  - boolean
//
// WebSocket delivers reliably and in order, so "datagram" messages (inputs,
// snapshots) simply arrive in order; the receiver applies latest-wins by tick.
// A WebTransport implementation would map inputs/snapshots to real datagrams
// and the handshake/events to a reliable stream — behind this same surface.

export class Transport {
  /** Begin listening. Returns a promise that resolves once bound. */
  async listen() { throw new Error('Transport.listen() not implemented'); }
  /** Register the new-connection handler: cb(connection). */
  onConnection(_cb) { throw new Error('Transport.onConnection() not implemented'); }
  /** Stop listening and close all connections. */
  async close() { throw new Error('Transport.close() not implemented'); }
}
