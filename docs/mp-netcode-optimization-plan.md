# MP Netcode Optimization — Parallel Implementation Plan

**Scope:** Three independent MP-client/server optimizations, organized so three
subagents can implement them **in parallel** after a small sequential prep step.

1. **Binary codec** — msgpackr behind `js/sim/codec.js` (replace JSON wire).
2. **Delta snapshots** — server sends changed fields only; client reconstructs.
3. **OffscreenCanvas render worker** — move MP Canvas2D drawing off the main thread.

All three are **multiplayer-only** (`VERSION-MP` / `CHANGELOG-MP`). None touches solo.

> **Status:** planning doc. Non-versionable (no runtime effect). Do not bump
> VERSION-MP for this file.

---

## 1. Why these three can run in parallel

The current netcode stack is layered cleanly, so each feature lives at a
different layer:

```
                        owns WHAT goes on the wire   ← Feature 2 (delta)
  room.js / mp-main.js ─────────────────────────────────────────────
                        owns HOW it's encoded         ← Feature 1 (binary codec)
  codec.js ─────────────────────────────────────────────────────────
                        owns WHERE it's drawn          ← Feature 3 (worker)
  mp-renderer.js ───────────────────────────────────────────────────
```

- **Feature 1** only changes `codec.js` *internals* + dependency plumbing. As
  long as the `encode/decode` **signature contract** (below) holds, layers above
  don't care whether the bytes are JSON or msgpack.
- **Feature 2** only changes *what object* is built (server) and reconstructed
  (client). It is indifferent to the byte encoding underneath.
- **Feature 3** only changes *where* `render()` runs. It is indifferent to both
  the wire format and the snapshot shape.

The **only** files two features would both want to edit are:

| Contended file | Feature 1 | Feature 2 | Feature 3 |
|---|---|---|---|
| `js/sim/protocol.js` (`WIRE_VERSION`) | wants bump (binary) | wants bump (delta) | — |
| `js/mp/mp-main.js` | — | wants delta-apply hook | wants worker-wiring hook |

**Phase 0 (lead, sequential) resolves both contention points up front** by
bumping `WIRE_VERSION` once and carving two stub seams into `mp-main.js`. After
that, the three agents own strictly disjoint file sets and run concurrently.

> Follows the parallel-dispatch rules: **strict file ownership, new-file work is
> safest, subagents never run git, the lead does all shared-file integration and
> all version/changelog/README edits.**

---

## 2. The invariant contracts (must not change during Phase 1)

These are frozen once Phase 0 lands. Agents code *against* them, not over them.

### 2.1 Codec signature (protects Features 2 & 3 from Feature 1)
```js
// js/sim/codec.js — unchanged signature, changed internals
encode(msg: object) -> Uint8Array            // was: string
decode(data: Uint8Array|ArrayBuffer|Buffer|string) -> object | null
```
- `room.js` `sendRaw(payload)` → `ws.send(Uint8Array)` sends a **binary frame**
  automatically (the `ws` lib handles it). No change needed there.
- Client transport already sets `ws.binaryType = 'arraybuffer'`
  (`websocket-transport.js:20`) and calls `decode(e.data)`. No change needed there.
- `decode` must remain tolerant of `string` input (legacy/test robustness).

### 2.2 Snapshot reconstruction seam (protects Feature 3 from Feature 2)
```js
// js/mp/netcode/snapshot-stream.js  (NEW — Phase 0 ships a pass-through stub)
snapStream.ingest(msg) -> fullSnapshot   // identical SHAPE to today's S2C.SNAPSHOT
```
- Feature 2 reuses the existing `S2C.SNAPSHOT` message type with an added
  internal `full: boolean` flag (and delta payload fields). **No new protocol
  type is required**, so `protocol.js` is touched by the lead only.
- `ingest()` returns an object with the exact keys `mp-main` already reads:
  `{ tick, wave, ws, ships[], asteroids[], bullets[], enemies[], drops[] }`.
  Everything downstream (`interp.add`, reconcile, `latestBullets`) is unchanged.

### 2.3 Render bridge seam (protects Feature 2 from Feature 3)
```js
// js/mp/render-bridge.js  (NEW — Phase 0 ships a direct-draw stub)
const bridge = new RenderBridge(canvasEl);   // takes the raw <canvas>, NOT a ctx
bridge.present(state);                        // same state object render() takes today
```
- `present(state)` accepts the exact object `mp-main` builds at `mp-main.js:255`.
- The bridge **owns context acquisition**, because `transferControlToOffscreen()`
  throws if the canvas already has a 2D context. Phase 0 therefore removes the
  `const ctx = canvas.getContext('2d')` line from `mp-main.js:48`.

---

## 3. Phase 0 — Seam prep (LEAD only, sequential, behavior-preserving)

One small commit, **no behavior change**, gates the parallel phase. Run + pass
`npm run test:mp` and `npm run test:qa -- 12-mp2-ws` before dispatching agents.

**P0.1 — `js/sim/protocol.js`**
- Bump `WIRE_VERSION` 1 → 2 (covers binary + delta; mismatched clients are
  rejected at handshake, so no mixed-format clients can connect).
- Comment: "v2 = binary (msgpack) wire + delta snapshots."

**P0.2 — `js/mp/netcode/snapshot-stream.js` (NEW, stub)**
```js
export class SnapshotStream {
  ingest(msg) { return msg; }   // pass-through until Feature 2 fills it
}
```

**P0.3 — `js/mp/render-bridge.js` (NEW, stub)**
```js
import { render } from './mp-renderer.js';
export class RenderBridge {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }
  present(state) { render(this.ctx, this.canvas, state); }  // direct draw until Feature 3 fills it
}
```

**P0.4 — `js/mp/mp-main.js` (rewire to seams, no behavior change)**
- Delete `const ctx = canvas.getContext('2d');` (line ~48). Keep `canvas`.
- Construct `const snapStream = new SnapshotStream();` and
  `const bridge = new RenderBridge(canvas);`.
- In the `S2C.SNAPSHOT` case: `const full = snapStream.ingest(msg);` then use
  `full` everywhere the code currently uses `msg` (`full.bullets`, `full.ships`,
  `interp.add(full)`, etc.).
- Replace the `render(ctx, canvas, {…})` call with `bridge.present({…})`.

After P0 lands, **`mp-main.js` and `protocol.js` are frozen** for Phase 1.

---

## 4. Phase 1 — Parallel implementation (3 agents, disjoint ownership)

Dispatch all three in **one message** (concurrent). Each agent works in the same
working tree on its owned files only. **No agent runs git, edits VERSION-MP /
CHANGELOG-MP / README.md, or touches `mp-main.js` / `protocol.js`.**

### Agent A — Binary codec (Feature 1)

**Owns (disjoint):**
- `js/sim/codec.js` — replace JSON with msgpackr.
- `js/vendor/msgpackr.js` — **NEW**, vendored prebuilt **ESM** build (no bundler exists).
- `mp.html` — add an **import map** so the browser resolves the bare specifier.
- `server/package.json` + root `package.json` — add `msgpackr` dependency.
- `tests/unit/codec.test.js` — **NEW**.

**Deliverables:**
1. In `codec.js`, use a single shared `Packr`/`Unpackr` (or `pack`/`unpack`):
   ```js
   import { Packr, Unpackr } from 'msgpackr';
   const packr = new Packr({ useRecords: true });   // records = big win for repeated snapshot shapes
   const unpackr = new Unpackr({ useRecords: true });
   export function encode(msg) { return packr.pack(msg); }       // -> Uint8Array
   export function decode(data) { /* normalize to Uint8Array, unpackr.unpack; tolerate string; return null on throw */ }
   ```
2. Vendor the **browser ESM** build to `js/vendor/msgpackr.js` (e.g. pull
   `msgpackr@<pinned>/+esm` from jsdelivr/esm.sh). **Pin the same version** the
   Node side installs — records mode requires matching builds on both ends.
3. Add the import map to `mp.html` **before** the module script:
   ```html
   <script type="importmap">{ "imports": { "msgpackr": "./js/vendor/msgpackr.js" } }</script>
   ```
   Node resolves `msgpackr` from `node_modules`; the browser from the vendored ESM.
4. Unit test: round-trip parity (`decode(encode(x))` deep-equals `x`) for a
   representative snapshot; assert `encode()` returns a `Uint8Array`; assert
   `decode` tolerates a legacy JSON string and malformed input (returns `null`).

**Contract:** preserve the §2.1 signature. Do **not** change any message shape.

**Risks / notes:**
- `useRecords: true` shrinks repeated snapshot structures dramatically but ties
  the wire to matching msgpackr builds — hence the version pin. If cross-build
  trouble appears, fall back to `useRecords: false` (still smaller than JSON).
- Confirm `npm run test:unit` (Jest, Node) can import the codec — that's why
  msgpackr goes in **root** deps too, not just the server.

### Agent B — Delta snapshots (Feature 2)

**Owns (disjoint):**
- `js/sim/snapshot.js` — **NEW**. Move `buildSnapshot(world)` here (out of
  `room.js`) + add the delta encoder.
- `js/mp/netcode/snapshot-stream.js` — fill the Phase 0 stub (reconstruction).
- `server/src/room.js` — use the encoder in `_tick` (sole owner of this file).
- `tests/unit/server-room.test.js` — extend (delta round-trip parity).

**Deliverables:**
1. `js/sim/snapshot.js`:
   - `buildFullSnapshot(world)` — today's `buildSnapshot` body, returns
     `{ t: S2C.SNAPSHOT, full: true, tick, wave, ws, ships, asteroids, bullets, enemies, drops }`.
   - `class SnapshotEncoder { encode(world): msg }` — holds the last full
     snapshot as a **global baseline**; emits a delta (`full: false`) of
     changed/added entities + a `rem` list of removed ids per array; emits a
     **keyframe** (`full: true`) every `K` ticks (e.g. 30) **and** on the tick
     after any join (`encoder.forceKeyframe()`), so late/lossy clients resync.
   - Delta diffing is per-entity-id within each array. Ships move every tick, so
     they'll almost always be present in the delta — that's fine.
2. `js/mp/netcode/snapshot-stream.js`:
   - `ingest(msg)`: if `msg.full`, store as the running full state and return it;
     else apply the delta (upsert changed, drop `rem` ids) onto the stored full
     state and return the merged full snapshot **in the exact §2.2 shape**.
3. `room.js`: construct one `SnapshotEncoder` per `Room`; in `_tick`,
   `const snapRaw = encode(this.snapEncoder.encode(this.world));`. In `join()`,
   call `this.snapEncoder.forceKeyframe()` so the next broadcast is a full frame
   the new client can baseline against.
4. Unit test: `ingest(encoder.encode(world))` reconstructs a snapshot deep-equal
   to `buildFullSnapshot(world)` across a sequence of ticks incl. spawns/removals
   and a forced keyframe.

**Contract:** reconstructed object matches §2.2 exactly. Reuse `S2C.SNAPSHOT`
(+`full` flag) — do **not** add a protocol type or touch `protocol.js`.

**Risks / notes:**
- Baseline is **global** (one encoded broadcast for all clients — `room.js` encodes
  once, sends to all). Safe over TCP (no loss). The periodic keyframe is the
  resync mechanism for late joiners and future lossy transport (WebTransport).
- Events frames (`S2C.EVENT`) are untouched — deltas apply to snapshots only.

### Agent C — OffscreenCanvas render worker (Feature 3)

**Owns (disjoint):**
- `js/mp/render-bridge.js` — fill the Phase 0 stub (feature-detect + worker path
  + direct-draw fallback).
- `js/mp/render-worker.js` — **NEW**, `type: module` worker.
- `js/mp/mp-renderer.js` — verify worker-safe; own any minor tweaks (it's already
  pure Canvas2D with no DOM/window access — should need none).
- `tests/qa/13-mp-render-worker.spec.js` — **NEW** (do not edit `12-mp2-ws`).

**Deliverables:**
1. `render-bridge.js`:
   ```js
   constructor(canvas) {
     this.supported = typeof canvas.transferControlToOffscreen === 'function'
                      && typeof Worker !== 'undefined';
     if (this.supported) {
       this.worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
       const offscreen = canvas.transferControlToOffscreen();
       this.worker.postMessage({ type: 'init', canvas: offscreen, w: canvas.width, h: canvas.height }, [offscreen]);
     } else {
       this.ctx = canvas.getContext('2d'); this.canvas = canvas;   // fallback
     }
   }
   present(state) {
     if (this.supported) this.worker.postMessage({ type: 'frame', state });
     else render(this.ctx, this.canvas, state);
   }
   ```
2. `render-worker.js`: on `init`, keep the OffscreenCanvas + `getContext('2d')`;
   on `frame`, `render(ctx, canvas, msg.state)`. Imports `render` from
   `mp-renderer.js`.
3. Ensure the posted `state` is structured-cloneable: it already is (Maps +
   arrays of plain objects). Post a **plain pose** for the local ship
   (`{x,y,angle,...}`), not the live `predictor.ship` instance, to keep clone
   cheap and side-effect-free.
4. QA smoke: with the worker path active, `window.__mp` counts still advance and
   the canvas is non-blank after connect (reuse the `12-mp2-ws` patterns).

**Contract:** `present(state)` takes the §2.3 state object; the bridge owns the
canvas. The **fallback path is mandatory** (Safari without module workers / no
`transferControlToOffscreen`).

**Risks / notes:**
- Per-frame `structuredClone` of the state has a cost, but it offloads all
  Canvas2D drawing (fills/strokes/arcs/text) and frees the main thread for
  input + prediction + networking — a net win that grows with entity count.
- **Follow-up (out of scope):** if clone cost dominates, move the `Interpolator`
  into the worker and post only raw snapshots (tick-rate) + the local pose
  (per-frame). Left for a later pass to keep this PR bounded and decoupled from
  Feature 2's reconstruction format.

---

## 5. File ownership matrix (the contract that makes it parallel)

| File | Phase 0 (lead) | Agent A (binary) | Agent B (delta) | Agent C (worker) |
|---|:---:|:---:|:---:|:---:|
| `js/sim/protocol.js` | ✏️ WIRE_VERSION | — | — | — |
| `js/mp/mp-main.js` | ✏️ seams | — | — | — |
| `js/mp/netcode/snapshot-stream.js` | ➕ stub | — | ✏️ fill | — |
| `js/mp/render-bridge.js` | ➕ stub | — | — | ✏️ fill |
| `js/sim/codec.js` | — | ✏️ | — | — |
| `js/vendor/msgpackr.js` | — | ➕ | — | — |
| `mp.html` | — | ✏️ import map | — | — |
| `package.json` (root) | — | ✏️ dep | — | — |
| `server/package.json` | — | ✏️ dep | — | — |
| `js/sim/snapshot.js` | — | — | ➕ | — |
| `server/src/room.js` | — | — | ✏️ | — |
| `js/mp/render-worker.js` | — | — | — | ➕ |
| `js/mp/mp-renderer.js` | — | — | — | ✏️ (verify) |
| `tests/unit/codec.test.js` | — | ➕ | — | — |
| `tests/unit/server-room.test.js` | — | — | ✏️ | — |
| `tests/qa/13-mp-render-worker.spec.js` | — | — | — | ➕ |

`➕` new file · `✏️` edit existing · No file is edited by two parallel agents.

---

## 6. Phase 2 — Integration & verification (LEAD only, sequential)

1. **Verify stubs are fully replaced** (no pass-through `ingest`, no direct-draw
   in the bridge when supported).
2. **Install deps:** `npm install` (root) + `cd server && npm install`.
3. **Automated:**
   - `npm run test:unit` — codec round-trip + delta reconstruction parity.
   - `npm run test:mp` — MP smoke.
   - `npm run test:qa -- 12-mp2-ws 13-mp-render-worker`.
4. **Manual:** `npm run mp:server`, open `mp.html` in two tabs:
   - identical gameplay/behavior to pre-change;
   - DevTools → Network → WS frames are **binary** and smaller than the old JSON;
     most frames are deltas with periodic full keyframes;
   - Performance panel shows a **separate worker thread** doing the rendering;
   - join a 3rd client mid-run → it renders correctly within one keyframe.
5. **Versioning (lead, per CLAUDE.md — three separable changes = three bumps):**
   - `VERSION-MP` + `CHANGELOG-MP.md`: one MINOR entry each
     (binary codec → delta snapshots → render worker), landed in sequence.
   - **README.md:** structural change (new `js/vendor/`, `js/mp/render-worker.js`,
     `js/sim/snapshot.js`) → update the MP architecture / project-structure
     section. This is a blocking step.

---

## 7. Dispatch checklist (guardrails)

- [ ] Phase 0 committed and `test:mp` + `12-mp2-ws` green **before** dispatch.
- [ ] Launch Agents A, B, C in a **single message** (concurrent).
- [ ] Each agent prompt states: **own only these files; do not run git; do not
      edit `mp-main.js`, `protocol.js`, VERSION-MP, CHANGELOG-MP, or README.**
- [ ] Each agent runs only its **own** tests; the lead runs the full suite in
      Phase 2.
- [ ] Lead performs all integration, version bumps, and README updates.

## 8. Rollback

Each feature is independently revertable:
- **Binary:** restore JSON `encode/decode` in `codec.js`, drop the import map +
  vendored file. (`WIRE_VERSION` stays bumped or reverts with it.)
- **Delta:** `SnapshotEncoder.encode` returns `buildFullSnapshot` unconditionally
  (`full: true` every tick); `ingest` already handles all-full streams.
- **Worker:** `RenderBridge` forces `this.supported = false` (direct-draw path).
