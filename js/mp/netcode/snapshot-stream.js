// js/mp/netcode/snapshot-stream.js — client-side snapshot reconstruction.
//
// The server sends keyframes (`full:true`, the whole snapshot) interspersed with
// field-level deltas (`full:false`). `ingest()` keeps the last full snapshot as
// a baseline, applies deltas to it, and always returns a FULL snapshot with the
// exact shape mp-main reads — so nothing downstream changes. Returns null for a
// delta received before any keyframe (can't reconstruct; caller skips it).

import { applyDelta } from '../../sim/snapshot-delta.js';

export class SnapshotStream {
  constructor() {
    this.baseline = null;
  }

  ingest(msg) {
    if (msg.full) {
      this.baseline = msg;
      return msg;
    }
    if (!this.baseline) return null; // delta before a keyframe — skip
    const full = applyDelta(this.baseline, msg);
    this.baseline = full;
    return full;
  }
}
