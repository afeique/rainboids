// js/mp/net/websocket-transport.js — browser WebSocket implementation of the
// client Transport seam. Pure transport; no game logic.

import { ClientTransport } from './transport.js';
import { encode, decode } from '../../sim/codec.js';

export class WebSocketClientTransport extends ClientTransport {
  constructor() {
    super();
    this.ws = null;
    this._onMessage = null;
    this._onClose = null;
    this._onError = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => { settled = true; resolve(); };
      ws.onerror = (e) => {
        if (this._onError) this._onError(e);
        if (!settled) { settled = true; reject(new Error('websocket connect failed')); }
      };
      ws.onclose = () => { if (this._onClose) this._onClose(); };
      ws.onmessage = (e) => {
        const msg = decode(e.data);
        if (msg && this._onMessage) this._onMessage(msg);
      };
    });
  }

  get isOpen() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  send(msg) { if (this.isOpen) this.ws.send(encode(msg)); }

  onMessage(cb) { this._onMessage = cb; }
  onClose(cb) { this._onClose = cb; }
  onError(cb) { this._onError = cb; }
  close() { if (this.ws) try { this.ws.close(); } catch { /* ignore */ } }
}
