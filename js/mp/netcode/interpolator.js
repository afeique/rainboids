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
    const toMap = (arr) => {
      const m = new Map();
      for (const e of arr || []) m.set(e.id, e);
      return m;
    };
    this.buf.push({
      recv: recvTime,
      tick: snapshot.tick,
      ships: toMap(snapshot.ships),
      asteroids: toMap(snapshot.asteroids),
      enemies: toMap(snapshot.enemies),
      drops: toMap(snapshot.drops),
    });
    if (this.buf.length > BUFFER_CAP) this.buf.shift();
  }

  /** Find the two buffered snapshots bracketing render time `t` + the blend f. */
  _bracket(now) {
    if (this.buf.length === 0) return null;
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
    return { a, b, f };
  }

  /**
   * Sample interpolated remote-ship render states at `now`, excluding `localId`.
   * @returns {Map<number, {x,y,angle,hp,mhp}>}
   */
  sample(now, localId) {
    const out = new Map();
    const br = this._bracket(now);
    if (!br) return out;
    const { a, b, f } = br;
    for (const [id, sb] of b.ships) {
      if (id === localId) continue;
      const sa = a.ships.get(id) || sb;
      out.set(id, {
        x: lerp(sa.x, sb.x, f),
        y: lerp(sa.y, sb.y, f),
        angle: lerpAngle(sa.a, sb.a, f),
        hp: sb.hp,
        mhp: sb.mhp,
        downed: !!sb.dn,
        reviveProgress: sb.rp || 0,
      });
    }
    return out;
  }

  /**
   * Sample interpolated asteroid render states at `now`.
   * @returns {Map<number, {x,y,angle,r}>}
   */
  sampleAsteroids(now) {
    const out = new Map();
    const br = this._bracket(now);
    if (!br) return out;
    const { a, b, f } = br;
    for (const [id, sb] of b.asteroids) {
      const sa = a.asteroids.get(id) || sb;
      out.set(id, {
        x: lerp(sa.x, sb.x, f),
        y: lerp(sa.y, sb.y, f),
        angle: lerpAngle(sa.a, sb.a, f),
        r: sb.r,
      });
    }
    return out;
  }

  /**
   * Sample interpolated enemy render states at `now`.
   * @returns {Map<number, {x,y,angle,r,hp,mhp,type}>}
   */
  sampleEnemies(now) {
    const out = new Map();
    const br = this._bracket(now);
    if (!br) return out;
    const { a, b, f } = br;
    for (const [id, sb] of b.enemies) {
      const sa = a.enemies.get(id) || sb;
      out.set(id, {
        x: lerp(sa.x, sb.x, f),
        y: lerp(sa.y, sb.y, f),
        angle: lerpAngle(sa.a, sb.a, f),
        r: sb.r,
        hp: sb.hp,
        mhp: sb.mhp,
        type: sb.ty,
      });
    }
    return out;
  }

  /**
   * Sample interpolated drop render states at `now`.
   * @returns {Map<number, {x,y,kind}>}
   */
  sampleDrops(now) {
    const out = new Map();
    const br = this._bracket(now);
    if (!br) return out;
    const { a, b, f } = br;
    for (const [id, sb] of b.drops) {
      const sa = a.drops.get(id) || sb;
      out.set(id, { x: lerp(sa.x, sb.x, f), y: lerp(sa.y, sb.y, f), kind: sb.k });
    }
    return out;
  }
}
