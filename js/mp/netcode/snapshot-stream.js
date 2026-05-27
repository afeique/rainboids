// js/mp/netcode/snapshot-stream.js — client-side snapshot reconstruction seam.
//
// `ingest(msg)` takes a raw S2C.SNAPSHOT and returns a FULL snapshot with the
// exact shape mp-main reads: { tick, wave, ws, ships[], asteroids[], bullets[],
// enemies[], drops[] }. Today it's a pass-through; the delta-snapshot feature
// fills it in (server sends changed fields + a `full` flag, client rebuilds the
// last full state) without any change above this seam.

export class SnapshotStream {
  ingest(msg) {
    return msg;
  }
}
