// js/mp/net/transport.js — client-side Transport seam.
//
// Mirror of the server seam (server/src/transport/transport.js). The MP client
// (netcode, render loop) talks only to this interface, never to a socket
// directly. WebSocket is the first implementation; WebTransport (deferred) will
// be a second implementation of the same surface, selected by feature
// detection with a WebSocket fallback.
//
//   connect(url) -> Promise            resolves when the link is open
//   send(msg)                          reliable channel (handshake, bye)
//   sendInput(msg)                     "datagram" channel; latest-wins
//   onMessage(cb)  cb(decodedMsg)      every inbound message
//   onClose(cb) / onError(cb)
//   close()
//   get isOpen
//
// On WebSocket, send() and sendInput() are the same ordered channel; the
// distinction exists so a WebTransport implementation can route sendInput()
// over unreliable datagrams and send() over a reliable stream without any
// change above this seam.

export class ClientTransport {
  async connect(_url) { throw new Error('ClientTransport.connect() not implemented'); }
  send(_msg) { throw new Error('ClientTransport.send() not implemented'); }
  sendInput(msg) { return this.send(msg); }
  onMessage(_cb) { throw new Error('ClientTransport.onMessage() not implemented'); }
  onClose(_cb) {}
  onError(_cb) {}
  close() {}
  get isOpen() { return false; }
}
