// js/sim/protocol.js — shared wire-protocol definitions.
//
// Imported by BOTH the server (server/src/*) and the MP client (js/mp/net/*).
// Bumping WIRE_VERSION forces a handshake mismatch so old clients can't speak
// to a newer server with an incompatible message shape.

export const WIRE_VERSION = 1;

// Client → Server message types.
export const C2S = Object.freeze({
  HELLO: 'hello',
  INPUT: 'input',
  BYE: 'bye',
});

// Server → Client message types.
export const S2C = Object.freeze({
  WELCOME: 'welcome',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  PEER_JOINED: 'peer_joined',
  PEER_LEFT: 'peer_left',
  ERROR: 'error',
});

// Default WebSocket path the server upgrades on / the client connects to.
export const WS_PATH = '/mp/ws';

// Default server port (override via env / URL param).
export const DEFAULT_PORT = 8091;
