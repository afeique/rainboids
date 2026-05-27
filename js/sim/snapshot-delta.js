// js/sim/snapshot-delta.js — field-level snapshot delta (server builds, client
// applies). Shared so both sides use one definition and round-trip tests prove
// `applyDelta(prev, buildDelta(prev, next))` reconstructs `next`.
//
// Snapshot shape: { t, tick, wave, ws, ships[], asteroids[], bullets[],
// enemies[], drops[] } — entity arrays of flat objects keyed by `id`.
//
// Delta shape: { tick, wave?, ws?, <group>?: { u:[{id, ...changedFields}], r:[id…] } }
//   - `u` (upsert): existing entities carry only changed fields (+ id); NEW
//     entities carry all fields (so a plain `{...base, ...u}` merge works for both)
//   - `r` (removed): ids gone since the baseline
//   - a group is omitted entirely when nothing changed; wave/ws only when changed

const GROUPS = ['ships', 'asteroids', 'bullets', 'enemies', 'drops'];

function indexById(arr) {
  const m = new Map();
  for (const e of arr || []) m.set(e.id, e);
  return m;
}

function diffGroup(prevArr, nextArr) {
  const prev = indexById(prevArr);
  const next = indexById(nextArr);
  const u = [];
  const r = [];
  for (const [id, ne] of next) {
    const pe = prev.get(id);
    if (!pe) { u.push({ ...ne }); continue; } // new entity → full
    const d = { id };
    let changed = false;
    for (const k in ne) {
      if (k === 'id') continue;
      if (ne[k] !== pe[k]) { d[k] = ne[k]; changed = true; }
    }
    if (changed) u.push(d);
  }
  for (const id of prev.keys()) if (!next.has(id)) r.push(id);
  return (u.length || r.length) ? { u, r } : null;
}

/** Build a delta that turns `prev` (full snapshot) into `next` (full snapshot). */
export function buildDelta(prev, next) {
  const delta = { tick: next.tick };
  if (next.wave !== prev.wave) delta.wave = next.wave;
  if (next.ws !== prev.ws) delta.ws = next.ws;
  for (const g of GROUPS) {
    const gd = diffGroup(prev[g], next[g]);
    if (gd) delta[g] = gd;
  }
  return delta;
}

function patchGroup(baseArr, gd) {
  const m = indexById(baseArr);
  if (gd) {
    for (const up of gd.u || []) {
      const ex = m.get(up.id);
      m.set(up.id, ex ? { ...ex, ...up } : { ...up });
    }
    for (const id of gd.r || []) m.delete(id);
  }
  return [...m.values()];
}

/** Apply a `delta` to a `baseline` full snapshot, returning a new full snapshot. */
export function applyDelta(baseline, delta) {
  const out = {
    t: 'snapshot',
    full: true,
    tick: delta.tick,
    wave: 'wave' in delta ? delta.wave : baseline.wave,
    ws: 'ws' in delta ? delta.ws : baseline.ws,
  };
  for (const g of GROUPS) out[g] = patchGroup(baseline[g], delta[g]);
  return out;
}
