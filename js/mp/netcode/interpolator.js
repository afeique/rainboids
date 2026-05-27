// js/mp/netcode/interpolator.js — smooth rendering of REMOTE entities.
//
// The client never simulates remote ships (or, later, enemies/asteroids). It
// buffers recent snapshots and renders them ~INTERP_DELAY_MS in the past,
// linearly interpolating between the two snapshots that straddle that render
// time. This trades a small constant latency for smooth motion that's immune to
// jitter and tolerant of dropped/duplicate snapshots.

const INTERP_DELAY_MS = 100; // render slightly in the past for smoothness
const BUFFER_CAP = 60;

function lerp(a, b, f) { return a + (b - a) * f; }

function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

export class Interpolator {
  constructor() {
    this.buf = []; // [{ recv, tick, ships: Map(id -> shipState) }]
  }

  add(snapshot, recvTime = performance.now()) {
    const ships = new Map();
    for (const s of snapshot.ships) ships.set(s.id, s);
    this.buf.push({ recv: recvTime, tick: snapshot.tick, ships });
    if (this.buf.length > BUFFER_CAP) this.buf.shift();
  }

  /**
   * Sample interpolated remote-ship render states at `now`, excluding `localId`.
   * @returns {Map<number, {x,y,angle,hp,mhp}>}
   */
  sample(now, localId) {
    const out = new Map();
    if (this.buf.length === 0) return out;

    const t = now - INTERP_DELAY_MS;
    let a = null;
    let b = null;
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].recv <= t && this.buf[i + 1].recv >= t) {
        a = this.buf[i];
        b = this.buf[i + 1];
        break;
      }
    }
    if (!a) { a = b = this.buf[this.buf.length - 1]; } // not enough history: snap to latest

    const span = (b.recv - a.recv) || 1;
    const f = Math.max(0, Math.min(1, (t - a.recv) / span));

    for (const [id, sb] of b.ships) {
      if (id === localId) continue;
      const sa = a.ships.get(id) || sb;
      out.set(id, {
        x: lerp(sa.x, sb.x, f),
        y: lerp(sa.y, sb.y, f),
        angle: lerpAngle(sa.a, sb.a, f),
        hp: sb.hp,
        mhp: sb.mhp,
      });
    }
    return out;
  }
}
