// js/mp/net/webtransport-transport.js — DEFERRED Phase-8 placeholder.
//
// The client Transport seam (transport.js) is already shaped so a WebTransport
// implementation can drop in with no changes above it. This stub documents the
// intended mapping and currently rejects connect(), so the transport selector
// (mp-main.js) cleanly falls back to WebSocket when WebTransport is requested
// but not yet implemented.
//
// To implement (see docs/Multiplayer WebTransport Migration — Plan – 2026-05-27.md):
//   - `const wt = new WebTransport(url); await wt.ready;`
//   - sendInput(msg)  → unreliable datagram on `wt.datagrams.writable`
//   - send(msg)       → length-framed write on one reliable bidi stream
//   - inbound: read datagrams (snapshots) + the reliable stream (Welcome/Event/
//     peer), feeding both through `decode()` to `onMessage`
//   - dev: pass `{ serverCertificateHashes }` for self-signed certs

import { ClientTransport } from './transport.js';

export class WebTransportClientTransport extends ClientTransport {
  // eslint-disable-next-line no-unused-vars
  async connect(url) {
    throw new Error('WebTransport transport not implemented yet (deferred Phase 8) — falling back to WebSocket');
  }

  send() { /* no-op until implemented */ }
  sendInput() { /* no-op until implemented */ }
  onMessage() {}
  onClose() {}
  onError() {}
  close() {}
  get isOpen() { return false; }
}
