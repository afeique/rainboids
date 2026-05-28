# MP Netcode Optimization — Status & Remaining Work

> **Status (2026-05-27):** Phase 0 + **Features 1 & 2 SHIPPED** (mp 0.12.0 →
> 0.14.0). **Feature 3 (render worker) DEFERRED.** This was originally a
> 3-subagent *parallel* plan; it was implemented **sequentially by one agent**
> because `master` was shared with the looter-pivot work at the time. The full
> original parallel-dispatch plan lives in git history (commit `9b7a3ff`,
> "docs(mp): netcode optimization roadmap") — see §6 for why it wasn't used.

**Original scope (three MP-only optimizations, `VERSION-MP` / `CHANGELOG-MP`):**

1. **Binary codec** — replace the JSON wire in `js/sim/codec.js`.
2. **Delta snapshots** — server sends changed fields only; client reconstructs.
3. **OffscreenCanvas render worker** — move MP Canvas2D drawing off the main thread.

> This file is a planning/status doc — **non-versionable** (no runtime effect).
> Do not bump `VERSION-MP` for editing it.

---

## 1. Status at a glance

| # | Feature | State | Version | Shipped as | Deviation from original plan |
|---|---|---|---|---|---|
| 0 | Seams (`SnapshotStream`, `RenderBridge`, `WIRE_VERSION`→2) | ✅ done | mp 0.12.0 | `3773755` | none |
| 2 | Delta snapshots | ✅ done | mp 0.13.0 | `bf6c780` | delta logic in `js/sim/snapshot-delta.js` (not `js/sim/snapshot.js`); `buildSnapshot` stayed in `room.js` |
| 1 | Binary codec | ✅ done | mp 0.14.0 | `500e6b4` | **hand-rolled MessagePack** in `codec.js` — no `msgpackr`, no `js/vendor/`, no import map |
| 3 | OffscreenCanvas render worker | ⏸️ deferred | — | — | not started; seam (`RenderBridge`) is in place for later |

The three **frozen contracts** from Phase 0 all held in practice and are still
true today (see §3) — that's why Features 1 and 2 dropped in without disturbing
each other or the renderer.

---

## 2. As-built architecture (what actually shipped)

### 2.0 Phase 0 — seams (mp 0.12.0)
Behavior-preserving. In place today:
- `js/mp/netcode/snapshot-stream.js` — `SnapshotStream.ingest(msg)`.
- `js/mp/render-bridge.js` — `RenderBridge`, owns context acquisition.
- `js/sim/protocol.js` — `WIRE_VERSION = 2`.
- `js/mp/mp-main.js` — constructs `snapStream` (`:51`) + `bridge` (`:52`); calls
  `snapStream.ingest(msg)` in the `SNAPSHOT` case (`:118`) and `bridge.present({…})`
  in the render loop (`:260`). No `getContext('2d')` on the main thread.

### 2.1 Feature 1 — binary codec (mp 0.14.0) — **deviated, for the better**
`js/sim/codec.js` now encodes **hand-rolled MessagePack** → `Uint8Array`:
- **No `msgpackr` dependency, no `js/vendor/msgpackr.js`, no `mp.html` import
  map.** This sidesteps the original plan's biggest risk (a no-bundler project
  vendoring an ESM build + pinning matching versions across Node/browser).
- Supports exactly the JSON-shaped value subset the wire carries (null, bool,
  int, float64, string, array, plain object). `encode(msg) → Uint8Array`;
  `decode` accepts `string | Buffer | ArrayBuffer | Uint8Array`, still tolerates
  a JSON string (legacy/tests), returns `null` on malformed input.
- Transports were already binary-capable, so nothing above the seam changed.
- Tests: `tests/unit/codec.test.js` (round-trips incl. mixed int/float,
  negatives, unicode, empty containers, large ints; Buffer/ArrayBuffer decode;
  JSON-string tolerance).

> **The original §2.1 "Agent A" plan (vendor msgpackr / import map / package.json
> deps) is obsolete.** Ignore it; the hand-rolled codec is the shipped reality
> and is strictly simpler. Do not reintroduce a dependency unless profiling shows
> the hand-rolled path is a measurable bottleneck (it isn't today).

### 2.2 Feature 2 — delta snapshots (mp 0.13.0) — **deviated file layout**
- `js/sim/snapshot-delta.js` — pure `buildDelta(prev, next)` (server) and
  `applyDelta(baseline, delta)` (client). Per-entity-id diff within each group;
  `applyDelta` upserts changed entities and drops removed ids.
- `buildSnapshot(world)` **stayed in `server/src/room.js`** (was *not* moved to a
  new `js/sim/snapshot.js` — that file does not exist).
- Server (`room.js`): holds `_lastFull` / `_forceKeyframe` / `_sinceKeyframe`;
  emits a **full keyframe** on first tick, on join (`forceKeyframe`), and every
  `KEYFRAME_TICKS = 30` ticks; field-level deltas in between. Reuses
  `S2C.SNAPSHOT` with a `full: boolean` flag (no new protocol type).
- Client (`snapshot-stream.js`): keeps the last full as `baseline`, applies
  deltas, always returns a full-shaped snapshot. Returns `null` for a delta
  received **before** any keyframe (caller skips it).
- Tests: `tests/unit/snapshot-delta.test.js` + `server-room.test.js`.

### 3. The frozen contracts (still true — the basis for any future Feature 3 work)

These held and remain the integration surface:

- **Codec signature** — `encode(obj) → Uint8Array`, `decode(bytes|string) → obj|null`.
  Layers above are agnostic to the byte format.
- **Snapshot reconstruction** — `snapStream.ingest(msg) → fullSnapshot` returns
  the exact shape `mp-main` reads: `{ tick, wave, ws, ships[], asteroids[],
  bullets[], enemies[], drops[] }` (`+ full`). Everything downstream
  (`interp.add`, reconcile, `latestBullets`) is unchanged.
- **Render bridge** — `new RenderBridge(canvasEl)` (raw `<canvas>`, not a ctx);
  `bridge.present(state)` takes the exact object built at `mp-main.js:260`:
  `{ localShip, remoteShips, asteroids, enemies, drops, bullets, effects, now,
  localId, localDowned, localReviveProgress, banner }`. The bridge owns context
  acquisition so a worker can later call `transferControlToOffscreen()`.

---

## 4. Remaining work — Feature 3: OffscreenCanvas render worker (DEFERRED)

### 4.1 Why it's deferred (the rationale stands)
The MP renderer (`js/mp/mp-renderer.js`) is **pure Canvas2D drawing a few dozen
primitives per frame** — ships, asteroids, enemies, drops, bullets, a few
effects. It is **not** a main-thread bottleneck today. A render worker adds real
complexity (worker lifecycle, `transferControlToOffscreen`, per-frame state
transfer, a mandatory non-worker fallback) and is **hard to verify headlessly**
in the QA harness — poor risk/reward right now. The `RenderBridge` seam is in
place, so this can be filled later with **no change above the seam**.

### 4.2 Revisit trigger (pick it up when *any* of these is true)
- The MP client ports to the full single-player **WebGL** renderer (bullets /
  particles / starfield), so rendering actually becomes the per-frame cost; **or**
- Entity counts climb enough that profiling shows Canvas2D draw dominating the
  main-thread frame budget; **or**
- Main-thread input/prediction/networking jank is traced to render cost.

### 4.3 Grounded plan if/when picked up
Scope is now small — Features 1 & 2 are done, so this is a **single, self-contained
change** (no parallel dispatch needed). Files:

| File | Action |
|---|---|
| `js/mp/render-bridge.js` | edit — feature-detect + worker path + **direct-draw fallback** |
| `js/mp/render-worker.js` | **new** — `type: module` worker; `import { render }`; on `init` keep the OffscreenCanvas + `getContext('2d')`; on `frame` call `render(ctx, canvas, state)` |
| `js/mp/mp-renderer.js` | verify worker-safe (already pure Canvas2D, no DOM/window) — expected no change |
| `tests/qa/13-mp-render-worker.spec.js` | **new** — do not edit `12-mp2-ws` |

Bridge shape (fills the current stub at `js/mp/render-bridge.js`):
```js
constructor(canvas) {
  this.supported = typeof canvas.transferControlToOffscreen === 'function'
                   && typeof Worker !== 'undefined';
  if (this.supported) {
    this.worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
    const offscreen = canvas.transferControlToOffscreen();
    this.worker.postMessage({ type: 'init', canvas: offscreen, w: canvas.width, h: canvas.height }, [offscreen]);
  } else {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');   // current behavior
  }
}
present(state) {
  if (this.supported) this.worker.postMessage({ type: 'frame', state });
  else render(this.ctx, this.canvas, state);
}
```

Caveats (unchanged from the original analysis):
- **`localShip` is a live `predictor.ship` instance** (`mp-main.js:261`). Post a
  **plain pose** (`{x, y, angle, …}`), not the live object, so the per-frame
  `structuredClone` stays cheap and side-effect-free. (The rest of the state —
  `remoteShips`/`asteroids`/`enemies`/`drops` Maps, `bullets`/`effects` arrays —
  is already structured-cloneable.)
- **Fallback is mandatory** (Safari without module workers / no
  `transferControlToOffscreen`).
- **Follow-up, not v1:** if per-frame clone cost dominates, move the
  `Interpolator` into the worker and post only raw snapshots (tick-rate) + the
  local pose (per-frame). Deferred to keep the change bounded.

---

## 5. Rollback (per shipped feature)
- **Binary codec:** restore JSON `encode`/`decode` in `codec.js`. No other files
  involved (no deps / import map were ever added).
- **Delta snapshots:** make `room.js` emit `{ ...buildSnapshot(world), full: true }`
  every tick; `snapshot-stream.ingest` already handles all-full streams.
- **Render worker (if ever built):** force `RenderBridge.supported = false`
  (direct-draw path — today's behavior).

---

## 6. Why the parallel-dispatch plan wasn't used
The original doc designed three subagents (A/B/C) with a strict file-ownership
matrix to run concurrently after a lead-only Phase 0. In practice the features
were implemented **one commit at a time by a single agent**, because `master` was
simultaneously hosting the looter-pivot work and concurrent agents on a shared
branch violate the project's parallel-dispatch safety rules (strict file
ownership + no two agents touching the same tree). The sequential path produced
the same end state (0.12.0 → 0.14.0) with less coordination risk. The full
parallel plan (file-ownership matrix, dispatch checklist, agent prompts) remains
in git history at commit `9b7a3ff` for reference if a future multi-feature MP
epic warrants real parallel dispatch (ideally on separate worktrees/branches).
