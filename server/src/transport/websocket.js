// server/src/transport/websocket.js — WebSocket implementation of the Transport
// seam (Phase 2). Binary-capable but v1 sends JSON strings (see js/sim/codec.js).
//
// Attaches a WebSocketServer to a plain http.Server so the same port also
// answers GET /healthz for liveness checks and dev tooling.

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { encode, decode } from '../../../js/sim/codec.js';

// Liveness: ping every client on an interval; a client that hasn't ponged since
// the last sweep is considered dead and terminated (its 'close' fires the
// connection's onClose → room.leave). Browsers auto-respond to WS pings.
const HEARTBEAT_MS = 15000;

class WsConnection {
  constructor(ws, id) {
    this.ws = ws;
    this.id = id;
    this._onMessage = null;
    this._onClose = null;

    ws.on('message', (data) => {
      // Hand the decoded message up; codec.decode tolerates string/Buffer.
      if (this._onMessage) this._onMessage(decode(data));
    });
    ws.on('close', () => { if (this._onClose) this._onClose(); });
    ws.on('error', () => { /* swallow; 'close' follows */ });
  }

  get isOpen() { return this.ws.readyState === this.ws.OPEN; }

  /** Encode + send one message object. */
  send(msg) {
    if (this.isOpen) this.ws.send(encode(msg));
  }

  /** Send an already-encoded payload (broadcast fast-path). */
  sendRaw(payload) {
    if (this.isOpen) this.ws.send(payload);
  }

  onMessage(cb) { this._onMessage = cb; }
  onClose(cb) { this._onClose = cb; }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

export class WebSocketTransport {
  constructor({ port, path }) {
    this.port = port;
    this.path = path;
    this._onConnection = null;
    this._nextId = 1;
    this.httpServer = null;
    this.wss = null;
  }

  async listen() {
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer, path: this.path });
    this.wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      const conn = new WsConnection(ws, this._nextId++);
      if (this._onConnection) this._onConnection(conn);
    });

    // Heartbeat sweep: terminate connections that missed the last ping.
    this._heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (ws.isAlive === false) { ws.terminate(); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* ignore */ }
      }
    }, HEARTBEAT_MS);
    this.wss.on('close', () => clearInterval(this._heartbeat));

    await new Promise((resolve) => this.httpServer.listen(this.port, resolve));
  }

  onConnection(cb) { this._onConnection = cb; }

  async close() {
    if (this._heartbeat) clearInterval(this._heartbeat);
    if (this.wss) {
      // Terminate live connections so close() resolves promptly (otherwise
      // httpServer.close() blocks on the upgraded WS sockets).
      for (const ws of this.wss.clients) { try { ws.terminate(); } catch { /* ignore */ } }
      await new Promise((r) => this.wss.close(r));
    }
    if (this.httpServer) await new Promise((r) => this.httpServer.close(r));
  }
}
