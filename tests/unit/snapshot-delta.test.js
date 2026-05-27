/**
 * tests/unit/snapshot-delta.test.js — field-level snapshot delta round-trips.
 *
 * The core invariant: applyDelta(prev, buildDelta(prev, next)) deep-equals next
 * (modulo the `t`/`full` envelope fields). Covers moves, field changes, adds,
 * removes, and scalar (wave/ws) changes — plus the SnapshotStream keyframe/delta
 * sequence.
 */

import { describe, it, expect } from '@jest/globals';
import { buildDelta, applyDelta } from '../../js/sim/snapshot-delta.js';
import { SnapshotStream } from '../../js/mp/netcode/snapshot-stream.js';

const GROUPS = ['ships', 'asteroids', 'bullets', 'enemies', 'drops'];

function full(tick, over = {}) {
  return {
    t: 'snapshot', tick, wave: 1, ws: 'active',
    ships: [], asteroids: [], bullets: [], enemies: [], drops: [],
    ...over,
  };
}

// Compare only the meaningful payload (ignore t/full envelope; order-insensitive per group).
function sameState(a, b) {
  expect(a.tick).toBe(b.tick);
  expect(a.wave).toBe(b.wave);
  expect(a.ws).toBe(b.ws);
  for (const g of GROUPS) {
    const sort = (arr) => [...arr].sort((x, y) => x.id - y.id);
    expect(sort(a[g])).toEqual(sort(b[g]));
  }
}

describe('buildDelta / applyDelta round-trip', () => {
  it('reconstructs moved + unchanged entities', () => {
    const prev = full(10, {
      ships: [{ id: 1, x: 0, y: 0, hp: 100, mhp: 100 }],
      asteroids: [{ id: 9, x: 50, y: 50, a: 0, r: 30 }],
    });
    const next = full(11, {
      ships: [{ id: 1, x: 5, y: 0, hp: 100, mhp: 100 }], // moved; hp unchanged
      asteroids: [{ id: 9, x: 51, y: 50, a: 0.1, r: 30 }],
    });
    const delta = buildDelta(prev, next);
    // hp/mhp must NOT be in the ship delta (unchanged).
    expect(delta.ships.u[0]).toEqual({ id: 1, x: 5 });
    sameState(applyDelta(prev, delta), next);
  });

  it('handles added and removed entities', () => {
    const prev = full(1, { enemies: [{ id: 2, x: 0, y: 0, hp: 3, mhp: 3, ty: 'chaser' }] });
    const next = full(2, {
      enemies: [{ id: 3, x: 9, y: 9, hp: 3, mhp: 3, ty: 'chaser' }], // 2 removed, 3 added
      drops: [{ id: 4, x: 1, y: 1, k: 'gold' }],
    });
    const delta = buildDelta(prev, next);
    expect(delta.enemies.r).toContain(2);
    expect(delta.enemies.u.find((e) => e.id === 3)).toMatchObject({ id: 3, ty: 'chaser' });
    sameState(applyDelta(prev, delta), next);
  });

  it('omits unchanged groups and carries scalar changes', () => {
    const prev = full(1, { ships: [{ id: 1, x: 0, y: 0 }] });
    const next = full(2, { ships: [{ id: 1, x: 0, y: 0 }], wave: 2, ws: 'intermission' });
    const delta = buildDelta(prev, next);
    expect(delta.ships).toBeUndefined(); // no ship change → group omitted
    expect(delta.wave).toBe(2);
    expect(delta.ws).toBe('intermission');
    sameState(applyDelta(prev, delta), next);
  });

  it('survives a multi-tick chain of deltas', () => {
    let prev = full(0, { ships: [{ id: 1, x: 0, y: 0, hp: 100, mhp: 100 }] });
    let reconstructed = prev;
    for (let t = 1; t <= 20; t++) {
      const next = full(t, { ships: [{ id: 1, x: t * 3, y: t, hp: 100 - t, mhp: 100 }] });
      reconstructed = applyDelta(reconstructed, buildDelta(prev, next));
      sameState(reconstructed, next);
      prev = next;
    }
  });
});

describe('SnapshotStream', () => {
  it('reconstructs a keyframe + delta sequence', () => {
    const s = new SnapshotStream();
    const k = { ...full(1, { ships: [{ id: 1, x: 0, y: 0, hp: 100 }] }), full: true };
    expect(s.ingest(k).ships[0].x).toBe(0);

    const next = full(2, { ships: [{ id: 1, x: 7, y: 0, hp: 100 }] });
    const delta = { t: 'snapshot', full: false, ...buildDelta(k, next) };
    const out = s.ingest(delta);
    expect(out.ships[0].x).toBe(7);
    expect(out.ships[0].hp).toBe(100); // carried from baseline
  });

  it('skips a delta that arrives before any keyframe', () => {
    const s = new SnapshotStream();
    expect(s.ingest({ t: 'snapshot', full: false, tick: 5 })).toBeNull();
  });
});
