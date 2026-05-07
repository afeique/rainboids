A planning document for a **Node.js authoritative WebSocket server** for Rainboids co-op multiplayer, as an alternative to the Rust server proposed in `Multiplayer Planning – 2026-05-06.md`.

The thesis of this document: **the single biggest engineering risk in shipping multiplayer is server↔client simulation drift**. A Rust server doubles the simulation surface area (Rust copy + JS copy, both maintained, both required to agree on ship physics for prediction). A Node.js server collapses that to one codebase: the same `simulateTick(state, inputs, dt)` function that runs on the client also runs on the server. Drift becomes impossible by construction.

That advantage — *one simulation, one bug fix, one truth* — is the load-bearing reason to choose Node.

---

## TL;DR

- **Recommendation:** ship the v1 multiplayer server in **Node.js (LTS)** using **`uWebSockets.js`** for the transport and a **shared ES module** (`js/sim/`) imported by both client and server. Same authoritative-server, snapshot+events, client-prediction architecture as the Rust plan — different language, dramatically lower drift risk.
- **Why Node is fast enough:** V8 JIT-compiles hot paths to native machine code. For a 60Hz simulation of ~50 entities, ~150 bullets, and 2–4 players, V8 produces code that is 1.5–4× slower than Rust *for this workload* — well under the headroom we have on a $5–10/month VPS.
- **Why Node beats Rust *for this project*:** zero-cost code sharing with the JS client. Server-side simulation bugs and client-side simulation bugs are the same bug, fixed once. No FFI, no two-language CI, no protocol-codec drift, no two-language `Vec2` math libraries.
- **Cost of choosing Node over Rust:** ~2× higher CPU per room; higher tail latency under GC pressure (mitigatable with object pooling and `Buffer` reuse); a single-threaded event loop per process (mitigatable with worker threads or process-per-shard).
- **What we keep identical to the Rust plan:** WebSocket transport, server-authoritative simulation, 60Hz tick / 20Hz snapshot / on-demand events, snapshot interpolation + local-ship prediction, drop-in/drop-out semantics, matchmaking shape.

---

## Why Node, and the honest case against it

### The case for Node

**One simulation, two runtimes.** The single biggest reason. The client already has `simulateTick` (after the Phase 1 refactor). The server imports the same module. Add a new bullet weapon? Edit `js/sim/bullet.js` once. Rebalance ship acceleration? Edit `js/sim/ship.js` once. The Rust plan requires two implementations of every simulation rule, with golden-output tests trying to keep them in sync — a class of work that simply does not exist in the Node plan.

**One protocol codec.** Same trick — `js/sim/protocol.js` is the wire format, used by client to encode/decode, used by server to encode/decode. The Rust plan needs a Rust `bincode` schema and a JS `bincode`-compatible decoder, kept in lockstep manually. With Node, the schema *is* the implementation.

**One language for the whole project.** No context-switching. CI is one Node toolchain. Local dev is one `npm run` away. The new contributor learning curve is "you already know JS."

**Hot reload during dev.** With `--watch`, simulation code changes restart the server in <500ms. The Rust plan has 30–90s incremental compiles for any sim change. Multiplied across thousands of dev iterations, that's weeks of tightening-the-feedback-loop value.

**The JIT compiles to machine code.** This is the user's framing in the prompt and it deserves direct treatment (next section). V8's TurboFan is a real optimizing compiler. It's not as good as `rustc`/LLVM, but the gap is narrower than the folklore.

### The case against Node

**GC pauses.** V8's garbage collector is generational and concurrent, but it is not pauseless. A young-gen scavenge runs in 1–5ms; a major old-gen mark/compact can run in 30–80ms. At 60Hz our budget per tick is 16.6ms. A bad-luck major GC mid-tick *will* skip a tick.
- *Mitigation:* aggressive object pooling for hot per-frame allocations (bullets, vectors, snapshot diffs). The same pools the JS client already uses.
- *Mitigation:* `Buffer` reuse for outbound snapshots; encode into a pre-allocated buffer rather than allocating per-frame.
- *Realistic:* at our scale, major GCs happen every few minutes per process. A skipped tick every few minutes is invisible in a 60Hz sim with 20Hz snapshots and client-side interp.

**Single-threaded event loop.** One V8 isolate per process; one event loop. CPU-heavy simulation blocks I/O. For 100 concurrent rooms this is fine if a tick completes well under 16ms. If it doesn't, you scale horizontally (multiple processes) or use `worker_threads` to put each shard of rooms on its own isolate.

**Less CPU efficiency than Rust.** Honest number: ~1.5–4× slower for tight numerical loops, somewhat narrower for I/O-bound code. For Rainboids' 60Hz sim with modest entity counts, this is well within budget on commodity hardware. Quantified below.

**Tooling for binary protocols is less polished than Rust's `bincode`/`postcard`.** The Node ecosystem has `protobuf`, `msgpack`, `flatbuffers`, and several hand-rolled binary codecs. None are quite as ergonomic as `bincode`. Mitigation: write a 200-line custom binary codec — straightforward and faster than any general-purpose lib for our specific message shapes.

**A long-running Node process can leak.** Node's GC will reclaim unreachable objects, but accidental retainers (closures over large objects, growing maps, event-listener-attached references) are easier to ship by accident in JS than in Rust. Mitigation: a weekly process restart cron during low-traffic hours, plus heap-growth alerting.

### What we are *not* arguing

We are **not** arguing Node is faster than Rust. Rust is faster. The argument is that for this workload, on this team, with this codebase:

- Node is *fast enough* (with margin).
- Node eliminates a class of bugs (server↔client drift) that Rust introduces.
- The eliminated-bug-class is the **dominant** engineering cost of multiplayer; raw server CPU is not.

If Rainboids were a 64-player bullet-hell with hundreds of thousands of projectiles, the calculus flips — Rust's headroom becomes load-bearing. At 4-player co-op with our entity counts, it is not.

---

## Performance: V8 JIT vs native Rust

The user's prompt specifically asks: V8 compiles down to machine code, so what is the actual perf gap?

### How V8 reaches machine code

V8's pipeline:

1. **Parser** — JS source → AST.
2. **Ignition** — AST → bytecode. This runs immediately. ~5× slower than optimized code; how cold-started JS first executes.
3. **TurboFan** — hot bytecode → optimized native machine code. Triggered by execution-count thresholds; produces SSA-form IR, applies inlining, escape analysis, bounds-check elimination, register allocation, peephole optimization. Output is x86-64 / ARM64 native instructions, comparable in shape to what an LLVM backend produces, *but* with type-feedback-driven specialization rather than ahead-of-time type knowledge.
4. **Sparkplug** (intermediate tier) — bytecode → unoptimized native code, used between Ignition and TurboFan to smooth the warmup cliff.
5. **Maglev** (newer, V8 11+) — between Sparkplug and TurboFan; cheaper to compile, ~70% as fast as TurboFan output. In Node 22+ this kicks in for medium-hot code.

The key fact: **TurboFan produces real native machine code**. It is not interpreted at steady state. A tight numerical loop, after warmup, runs as a sequence of `mov` / `add` / `mulss` / `cmp` / `jcc` instructions — same instruction families Rust emits.

The gap to Rust comes from:

- **Type instability.** A function called with `Number`s and then once with a `String` deoptimizes. Rust types are static. Mitigation: write hot-path code with monomorphic shapes; never share helpers between numeric paths and "could be a string" paths.
- **Hidden classes.** V8 specializes objects based on the order properties were added. Two "ship" objects with the same fields in different orders are different shapes and cause inline-cache misses. Mitigation: construct objects in canonical order; use the same `class` constructor everywhere.
- **Memory layout.** JS objects are heap-allocated boxed structures with header overhead (~16 bytes). Cache density is worse than Rust's `Vec<Ship>` which is contiguous. Mitigation for the hottest entity pools: **typed arrays** (`Float32Array`, `Int32Array`) holding flat SoA layouts. The renderer already does this for stars; the sim can do the same for bullets.
- **Bounds checks on arrays.** JS `arr[i]` always bounds-checks. TurboFan eliminates many checks via range analysis but not all. Rust's `arr[i]` also bounds-checks (panics) but range checks are easier for LLVM to remove. Mitigation: minor, ignore.
- **Function-call overhead.** TurboFan inlines aggressively but not as aggressively as `rustc -O3`. Mitigation: keep hot loops shallow; mark obvious helpers as small/leaf; avoid megamorphic call sites in tight loops.

### Quantified expectation

For a 60Hz Rainboids tick with realistic entity counts (50 enemies, 150 bullets, 8 asteroids, 4 ships, ~30 drops):

| Metric | Rust estimate | Node estimate | Ratio |
|---|---|---|---|
| `simulate_tick` median | ~80 µs | ~250 µs | ~3× |
| `simulate_tick` p99 | ~150 µs | ~600 µs (sometimes GC-spike to ~5ms) | ~4× + GC outliers |
| Snapshot encode | ~25 µs | ~75 µs | ~3× |
| Bytes/sec per player | identical | identical | wire is the same |
| Memory per room | ~50 KB | ~400 KB | ~8× |
| CPU at 100 rooms | ~3% | ~9–12% | ~3–4× |

Numbers are estimates pending benchmark; the ratio is the load-bearing claim. Our budget is **16,600 µs per tick**. Even pessimistically, Node finishes a tick in <1% of budget. The headroom is enormous.

The metric that matters is *p99 tick time* including GC. With pools and `Buffer` reuse, p99 should stay under 2ms. Even with an unexpected major GC, we skip at most 1 tick (16ms) every several minutes, which is below the 50ms snapshot interval and *invisible* to clients running interpolation 50ms behind real-time.

### When the math would change

Node becomes the wrong choice if any of these change:

- Entity counts grow 10× (e.g. 1500 bullets in flight).
- Tick rate goes to 120Hz or higher.
- Player counts per room exceed ~16.
- Real-time PvP with rollback netcode.

For our actual scope — 4-player PvE co-op, 60Hz sim, hundreds of total entities — Node is comfortably in budget.

---

## High-level architecture

```
                    ┌──────────────────────────────────────────┐
                    │  rainboids-server  (Node 22+, single bin)│
                    │                                          │
   ┌──────────┐     │  ┌────────────────────────────────────┐  │
   │ Browser  │ WSS │  │  uWebSockets.js HTTP/WS listener  │  │
   │  client  │ ◀──▶│  └────────────┬───────────────────────┘  │
   └──────────┘     │               │                          │
                    │               ▼                          │
                    │  ┌────────────────────────────────────┐  │
                    │  │  Connection (per-socket state)     │  │
                    │  │  - inbound mailbox                 │  │
                    │  │  - outbound buffer reuse           │  │
                    │  │  - hello/auth/version              │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │     ┌─────────┴────────┐                 │
                    │     ▼                  ▼                 │
                    │  ┌──────────┐   ┌──────────────┐         │
                    │  │ Match-   │   │ Room (1..N)  │ 60Hz    │
                    │  │ making   │   │ - GameState  │ tick    │
                    │  │ Manager  │◀──│ - InputBufs  │         │
                    │  │ (single) │   │ - SimRunner  │         │
                    │  └──────────┘   │ - Broadcast  │         │
                    │                 └──────────────┘         │
                    │                                          │
                    │  shared ES module: js/sim/*  ◀──── same  │
                    │                                code as   │
                    │                                client    │
                    └──────────────────────────────────────────┘
                                    ▲
                                    │  same module graph
                                    │
                    ┌──────────────────────────────────────────┐
                    │   Browser client                         │
                    │   js/sim/*  (used for prediction +       │
                    │              for solo offline play)      │
                    │   js/net/*  (network glue)               │
                    │   js/render/*, js/audio/*, etc.          │
                    └──────────────────────────────────────────┘
```

One process. One event loop. Inside: one matchmaking manager, N rooms (each a stateful object with a tick timer), per-connection state. The simulation modules are the same files imported in the browser. The server is the *consumer* of those modules; the renderer in the browser is another consumer.

### Process model

Single-process for v1. Node is single-threaded per isolate; we lean on that simplicity.

If/when we outgrow one process:

- **Vertical scale first**: more rooms in the same process, until tick-time p99 approaches budget.
- **Then `worker_threads`**: each worker hosts a shard of rooms; a thin main-thread router accepts WS upgrades and forwards to the right worker via `MessageChannel`. (This requires zero-copy `SharedArrayBuffer` for snapshots if we don't want serialization cost between threads; otherwise a normal `postMessage` is fine at our throughput.)
- **Or a process-per-shard**: simpler than worker threads. Each process listens on its own port; nginx routes by `room_id` cookie. No shared memory; rooms never migrate.

For v1, none of this is built. Single process. Document the threshold (e.g. "if tick p99 > 8ms or CPU > 60%, shard").

---

## Tech stack

- **Runtime:** **Node.js 22+ LTS**. Reasons: stable Maglev tier, `node:test` built-in, native `--watch` for dev, native `fetch`, TLS 1.3.
- **WebSocket:** **`uWebSockets.js`** (`uNetworking/uWebSockets.js`). C++ core with JS bindings. ~10× the throughput of `ws` for our broadcast pattern; built-in HTTP server; built-in pub/sub primitive useful for room broadcasts. The popular alternative `ws` is fine too but uWS is the standard for serious game-server work in Node.
- **Wire codec:** **hand-rolled binary**, in `js/sim/protocol.js`. ~200 lines. Each message has a 1-byte tag and a fixed-shape payload. Faster than msgpack/protobuf at our message sizes; bonus: no build step.
- **TypeScript:** optional. The shared `js/sim/` is written in modern JS with **JSDoc-typed** signatures and consumed by `tsc --noEmit` for type checking. This avoids a build step on the client (Vite already handles it) and avoids `ts-node` on the server. If the project later adopts TypeScript wholesale, the migration is straightforward — but JSDoc is a good waypoint that gives 90% of the type-check value with 0% of the build complexity.
- **Object pooling:** in-house, mirrors `js/modules/core/pool-manager.js`. Same code, used on both sides.
- **Math:** `Vec2` literal `{x, y}` objects pooled, or `Float32Array` for SoA hot pools. No external lib (no `glam` equivalent needed).
- **PRNG:** seedable `pcg32` or `mulberry32`. ~30 lines. Same source on client and server so seeded RNG agrees.
- **Logging:** `pino` — fast structured JSON logger. Pipe to journald in prod.
- **Metrics:** `prom-client` — Prometheus exporter.
- **CLI / config:** `node --env-file=.env`, plus a tiny `process.env`-reading config module. No `commander`/`yargs` needed.
- **Tests:** built-in `node:test`. No Jest. Shared `js/sim/*.test.js` files run in both Node CI and the browser via the existing Jest config (or migrate Jest tests to `node:test`).
- **No transpiler.** Modern V8 supports every ES feature we need. ES modules natively. This keeps the dev loop instant.

---

## Repo layout

The defining structural choice: **the simulation module lives in the existing `js/` tree** so the browser imports it directly, and the server imports the same files via path.

```
rainboids-2/
├── js/
│   ├── sim/                              ◀──── NEW. Pure simulation. Imports nothing browser-specific.
│   │   ├── index.js                      Re-exports the public surface.
│   │   ├── state.js                      GameState shape; pools; resets.
│   │   ├── input.js                      PlayerInput shape; bounds validation.
│   │   ├── ship.js                       updateShip(ship, input, dt, events)
│   │   ├── enemy.js                      updateEnemy / AI / firing
│   │   ├── asteroid.js                   updateAsteroid / split
│   │   ├── bullet.js                     integrateBullet
│   │   ├── collision.js                  broadphase + narrowphase
│   │   ├── drops.js                      orb spawn / attract / collect
│   │   ├── wave.js                       wave schedule + clear gate
│   │   ├── difficulty.js                 per-player scaling
│   │   ├── rng.js                        seeded PRNG
│   │   ├── events.js                     GameEvent enum + emit helpers
│   │   ├── protocol.js                   ClientMsg / ServerMsg encode/decode
│   │   ├── version.js                    WIRE_VERSION + SIM_VERSION
│   │   ├── tick.js                       simulateTick(state, inputs, dt, rng, events)
│   │   └── *.test.js                     pure unit tests run on both sides
│   ├── net/                              ◀──── NEW. Browser-side network glue.
│   │   ├── ws-client.js                  reconnect, ping, framing
│   │   ├── prediction.js                 input buffer + replay
│   │   ├── interpolation.js              snapshot lerp
│   │   ├── matchmaking.js                title-screen MM
│   │   └── session.js                    localStorage session token
│   ├── modules/                          existing — to be slimmed down by the refactor
│   │   ├── core/
│   │   ├── combat/
│   │   ├── player/
│   │   └── ...
│   ├── main.js
│   └── ...
├── server/                               ◀──── NEW. Server-only code. Imports js/sim/*.
│   ├── package.json                      separate from the root package.json (different deps)
│   ├── README.md
│   ├── .env.example
│   ├── deploy/
│   │   ├── nginx.conf.example
│   │   ├── rainboids-server.service
│   │   └── Dockerfile
│   ├── benches/
│   │   ├── tick.bench.mjs
│   │   └── snapshot.bench.mjs
│   ├── src/
│   │   ├── index.mjs                     entrypoint: cfg load, signals, listen
│   │   ├── config.mjs                    env -> Config
│   │   ├── log.mjs                       pino setup
│   │   ├── metrics.mjs                   prom-client setup
│   │   ├── server.mjs                    uWS app, /health, /metrics, /ws
│   │   ├── connection.mjs                Connection class; per-socket state
│   │   ├── matchmaking.mjs               MatchmakingManager
│   │   ├── room.mjs                      Room class (the work-horse)
│   │   ├── snapshot.mjs                  snapshot construction + delta
│   │   ├── safe-spawn.mjs                find_safe_spawn equivalent
│   │   ├── grace.mjs                     grace timer machinery
│   │   ├── auth.mjs                      session token issue + verify
│   │   └── admin.mjs                     /admin/* handlers
│   └── test/
│       ├── room.integration.test.mjs
│       ├── matchmaking.integration.test.mjs
│       ├── dropin.integration.test.mjs
│       ├── grace.integration.test.mjs
│       └── lag.integration.test.mjs
└── tests/                                existing browser-side tests
```

`server/src/*.mjs` does:

```js
import { simulateTick, GameState, PlayerInput } from '../../js/sim/index.js'
```

That single line — the server reading code out of the client tree — is the entire architectural advantage of choosing Node.

### Why a separate `server/package.json`

The browser doesn't need `uWebSockets.js`, `pino`, or `prom-client`. The server doesn't need `vite`. Keep them split. Both `package.json`s share the project root but list disjoint dependencies. The shared `js/sim/` has zero runtime dependencies and is consumed by both sides as plain ES modules.

### Why not a shared root `package.json`?

Could work but pollutes browser bundles with server deps unless tree-shaking is perfect. Cleaner to split. CI installs both with two `npm ci` invocations.

---

## Wire protocol

Same shape as the Rust plan; concrete encoding adapted for hand-rolled JS codec.

### Versioning

```js
// js/sim/version.js
export const WIRE_VERSION = 1
export const SIM_VERSION  = 1
```

Hello carries both. Server compares; mismatch closes the socket with a structured close-code + reason.

### Frame format

Each WS frame is one binary message. First byte is the message tag. Remaining bytes are the encoded payload, fixed-shape per tag.

```
┌────┬───────────────────────────────────────────┐
│ T  │  payload (fixed shape per T)              │
└────┴───────────────────────────────────────────┘
 1 B            ...
```

### Message tags

```js
// js/sim/protocol.js  (excerpt)
export const C2S = {
  HELLO:           0x01,
  QUICK_MATCH:     0x02,
  BROWSE_ROOMS:    0x03,
  CREATE_ROOM:     0x04,
  JOIN_ROOM:       0x05,
  JOIN_BY_CODE:    0x06,
  LEAVE_ROOM:      0x07,
  INPUT:           0x08,   // 30Hz
  ACK:             0x09,
  PONG:            0x0A,
  POWERUP_CHOOSE:  0x0B,
  REVIVE:          0x0C,
  CHAT:            0x0D,
}

export const S2C = {
  WELCOME:         0x80,
  ERROR:           0x81,
  ROOM_LIST:       0x82,
  ROOM_JOINED:     0x83,
  ROOM_LEFT:       0x84,
  PEER_JOINED:     0x85,
  PEER_LEFT:       0x86,
  SNAPSHOT:        0x87,
  EVENT:           0x88,
  PING:            0x89,
}

export const EVT = {
  BULLET_SPAWN:    0x01,
  BULLET_DESPAWN:  0x02,
  ENEMY_DESTROY:   0x03,
  ASTEROID_DESTROY:0x04,
  ORB_COLLECT:     0x05,
  PLAYER_DAMAGED:  0x06,
  PLAYER_DOWNED:   0x07,
  PLAYER_REVIVED:  0x08,
  WAVE_START:      0x09,
  WAVE_CLEAR:      0x0A,
  POWERUP_OFFER:   0x0B,
  POWERUP_CHOSEN:  0x0C,
  HIT_FLASH:       0x0D,
  DAMAGE_NUMBER:   0x0E,
}
```

### Codec sketch

```js
// js/sim/protocol.js
const enc = new TextEncoder()
const dec = new TextDecoder()

export class Writer {
  constructor(buf = Buffer.alloc(4096)) { this.buf = buf; this.off = 0 }
  ensure(n) { if (this.off + n > this.buf.length) this._grow(this.off + n) }
  _grow(n) { const b = Buffer.alloc(Math.max(this.buf.length*2, n)); this.buf.copy(b); this.buf = b }
  u8(v)  { this.ensure(1); this.buf.writeUInt8(v, this.off); this.off += 1 }
  u16(v) { this.ensure(2); this.buf.writeUInt16LE(v, this.off); this.off += 2 }
  u32(v) { this.ensure(4); this.buf.writeUInt32LE(v, this.off); this.off += 4 }
  i8(v)  { this.ensure(1); this.buf.writeInt8(v, this.off); this.off += 1 }
  f32(v) { this.ensure(4); this.buf.writeFloatLE(v, this.off); this.off += 4 }
  str(s) { const b = enc.encode(s); this.u16(b.length); this.ensure(b.length); Buffer.from(b).copy(this.buf, this.off); this.off += b.length }
  bytes() { return this.buf.subarray(0, this.off) }
}

export function encodeInput(input) {
  const w = new Writer(Buffer.alloc(16))
  w.u8(C2S.INPUT)
  w.u32(input.tick)
  w.i8(Math.round(input.moveX * 127))
  w.i8(Math.round(input.moveY * 127))
  w.f32(input.aimX)
  w.f32(input.aimY)
  w.u8(input.buttons)
  return w.bytes()
}

export function decodeInput(buf, off = 1) {
  return {
    tick:    buf.readUInt32LE(off),
    moveX:   buf.readInt8(off + 4) / 127,
    moveY:   buf.readInt8(off + 5) / 127,
    aimX:    buf.readFloatLE(off + 6),
    aimY:    buf.readFloatLE(off + 10),
    buttons: buf.readUInt8(off + 14),
  }
}
```

A pre-allocated `Writer` is reused per connection for outbound traffic. Inbound is read directly from the `ArrayBuffer`/`Buffer` uWS hands us; no allocation.

### Buffer reuse for snapshots

Per-room snapshot encoding writes into a single per-room `Buffer` reused tick after tick. Per-connection outbound queues hold *references* (`Buffer.subarray`) into a frame-shared snapshot buffer rather than per-client copies. This is the single most important Node-specific optimization; it reduces per-tick allocations from O(players) to O(1).

### Snapshot vs event split

Identical to the Rust plan:

- **Snapshots** (~20Hz) — slow-moving, bulk state: ship positions/velocities/HP, enemy positions/velocities/HP, asteroid positions/rotation, drop positions, wave-state. Delta-coded against the receiver's last-acked tick where present; full snapshot if no ack within N ticks.
- **Events** — discrete moments: bullet spawn/despawn, enemy destroy, wave start/clear, orb collect, hit-flash, damage number. Sent immediately on the next outbound flush after they happen.

The split lets bullet spawns (high-frequency, small) ride the event stream while ship positions (continuous, lerpable) ride the snapshot stream.

---

## Per-room simulation loop

The single most important class on the server.

```js
// server/src/room.mjs
import { simulateTick, GameState, PlayerInput, makeRng } from '../../js/sim/index.js'
import { encodeSnapshot, encodeEvent, encodeRoomJoined, encodePeerLeft } from '../../js/sim/protocol.js'

const TICK_MS = 1000 / 60
const SNAPSHOT_EVERY = 3   // 60/3 = 20Hz

export class Room {
  constructor(id, code, config) {
    this.id = id
    this.code = code
    this.config = config
    this.state = GameState.fresh(config.seed)
    this.rng = makeRng(config.seed)
    this.tick = 0
    this.connections = []                 // { playerId, conn, slot, lagging, lastAck }
    this.inputBuf = new Map()             // playerId -> { latest: PlayerInput }
    this.events = []                      // pending GameEvents this tick
    this.grace = new Map()                // playerId -> { ship, deadline }
    this.history = []                     // last 64 snapshots for delta base
    this.encodeBuf = Buffer.alloc(64 * 1024)
    this._loop = null
    this._lastTickWall = 0
  }

  start() {
    let drift = 0
    const step = () => {
      const now = Date.now()
      const dueTicks = Math.max(1, Math.min(4, Math.floor((now - (this._lastTickWall || now)) / TICK_MS)))
      this._lastTickWall = (this._lastTickWall || now) + dueTicks * TICK_MS
      for (let i = 0; i < dueTicks; i++) this._oneTick()
      const next = this._lastTickWall + TICK_MS - Date.now()
      this._loop = setTimeout(step, Math.max(0, next))
    }
    this._lastTickWall = Date.now()
    step()
  }

  stop() { if (this._loop) clearTimeout(this._loop) }

  _oneTick() {
    this.tick++
    const inputs = this._collectInputs()
    simulateTick(this.state, inputs, TICK_MS / 1000, this.rng, this.events)
    if (this.tick % SNAPSHOT_EVERY === 0) this._broadcastSnapshot()
    this._broadcastEvents()
    this._reapGrace()
    if (this.connections.length === 0 && this.grace.size === 0) {
      this.stop()
      this.config.onClose(this)
    }
  }

  _collectInputs() {
    const out = new Map()
    for (const c of this.connections) {
      const buf = this.inputBuf.get(c.playerId)
      out.set(c.playerId, buf?.latest ?? PlayerInput.zero())
    }
    return out
  }

  _broadcastSnapshot() {
    const payload = encodeSnapshot(this.encodeBuf, this.tick, this.state)
    this.history.push({ tick: this.tick, payload })
    if (this.history.length > 64) this.history.shift()
    for (const c of this.connections) {
      if (c.lagging) continue
      c.conn.sendBinary(payload)
    }
  }

  _broadcastEvents() {
    if (this.events.length === 0) return
    for (const c of this.connections) {
      if (c.lagging) continue
      for (const ev of this.events) c.conn.sendBinary(encodeEvent(this.encodeBuf, this.tick, ev))
    }
    this.events.length = 0
  }

  _reapGrace() {
    const now = Date.now()
    for (const [pid, g] of this.grace) {
      if (now > g.deadline) {
        this.grace.delete(pid)
        // promote to voluntary leave
        this.state.removeShip(pid)
        for (const c of this.connections) c.conn.sendBinary(encodePeerLeft(this.encodeBuf, pid, 'grace_expired'))
      }
    }
  }

  enqueueInput(playerId, input) {
    let buf = this.inputBuf.get(playerId)
    if (!buf) { buf = { latest: input }; this.inputBuf.set(playerId, buf) }
    else buf.latest = input
  }

  onJoin(conn, playerId, slot) { /* ... */ }
  onLeave(playerId, reason)    { /* ... */ }
  onDisconnect(playerId)       { /* ... mark in grace ... */ }
  onReconnect(playerId, conn)  { /* ... un-grace; full-snapshot ... */ }
}
```

A few things to call out:

- **Catch-up cap**: at most 4 ticks per real-time step. Prevents spiral-of-death if a GC pause stalls the loop.
- **Drift correction**: tick wall-clock anchored to `_lastTickWall + TICK_MS`. Simulation stays at a true 60Hz long-term.
- **`setTimeout` not `setInterval`**: avoids the cumulative-drift bug `setInterval` has under load.
- **Single shared `encodeBuf` per room**: reused across snapshot/event encoding within a tick. Frees the GC from per-tick allocations.
- **No per-connection clone**: `sendBinary` accepts a `Buffer`. uWS does its own copy/queue. We pass references.

### Why not `setImmediate` for hot loops

uWS schedules I/O on the libuv event loop. Mixing `setImmediate`-driven ticks would interleave I/O between simulation steps, which is what we want — but `setTimeout` with a near-zero delay achieves the same and is more readable.

---

## Connection lifecycle

```js
// server/src/connection.mjs
import { decode, encodeWelcome, encodeError, C2S, WIRE_VERSION } from '../../js/sim/protocol.js'

export class Connection {
  constructor(ws, mm) {
    this.ws = ws
    this.mm = mm
    this.playerId = null
    this.session = null
    this.room = null
    this.lagging = false
    this.lastAck = 0
  }

  onOpen() { this._helloDeadline = setTimeout(() => this.close(1002, 'no_hello'), 3000) }

  onMessage(buf) {
    const tag = buf.readUInt8(0)
    switch (tag) {
      case C2S.HELLO:        return this._onHello(buf)
      case C2S.INPUT:        return this.room?.enqueueInput(this.playerId, decode(buf))
      case C2S.ACK:          return this._onAck(buf)
      case C2S.PONG:         return this._onPong(buf)
      case C2S.QUICK_MATCH:
      case C2S.BROWSE_ROOMS:
      case C2S.CREATE_ROOM:
      case C2S.JOIN_ROOM:
      case C2S.JOIN_BY_CODE: return this.mm.handle(this, tag, buf)
      case C2S.LEAVE_ROOM:   return this.room?.onLeave(this.playerId, 'voluntary')
      default: this.close(1003, 'bad_tag')
    }
  }

  onClose() {
    if (this.room) this.room.onDisconnect(this.playerId)
  }

  sendBinary(payload) {
    const ok = this.ws.send(payload, true /* binary */, false /* compress */)
    if (!ok) this._onBackpressure()
  }

  _onBackpressure() {
    this.lagging = true
    setTimeout(() => { this.lagging = this.ws.getBufferedAmount() > 256 * 1024 }, 100)
  }
}
```

**Backpressure**: uWS exposes `getBufferedAmount()`. If the kernel TCP buffer is full and the JS-side outbound queue is growing, we set `lagging = true` and the room skips snapshots for this connection. After 5s of continuous lag we close the socket; the player's room slot enters grace.

---

## Matchmaking

Single-process, single-instance. Holds the registry of active rooms.

```js
// server/src/matchmaking.mjs
import { customAlphabet } from 'nanoid'
import { Room } from './room.mjs'
import { encodeRoomJoined, encodeRoomList } from '../../js/sim/protocol.js'

const codeFor = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)

export class MatchmakingManager {
  constructor(cfg) {
    this.cfg = cfg
    this.rooms = new Map()             // roomId -> Room
    this.byCode = new Map()            // code -> roomId
  }

  handle(conn, tag, buf) {
    switch (tag) {
      case C2S.QUICK_MATCH:    return this._quickMatch(conn)
      case C2S.BROWSE_ROOMS:   return this._browse(conn)
      case C2S.CREATE_ROOM:    return this._create(conn, buf)
      case C2S.JOIN_ROOM:      return this._join(conn, buf)
      case C2S.JOIN_BY_CODE:   return this._joinByCode(conn, buf)
    }
  }

  _quickMatch(conn) {
    const candidates = [...this.rooms.values()]
      .filter(r => r.config.public && r.connections.length < r.config.maxPlayers)
      .sort((a, b) => a.state.wave - b.state.wave)
    const room = candidates[0] ?? this._spawnRoom({ public: true })
    this._enroll(conn, room)
  }

  _spawnRoom({ public: pub, name }) {
    if (this.rooms.size >= this.cfg.maxRooms) throw new Error('room cap reached')
    const id = crypto.randomUUID()
    const code = codeFor()
    const room = new Room(id, code, {
      seed: crypto.getRandomValues(new Uint32Array(2))[0],
      maxPlayers: this.cfg.maxPlayersPerRoom,
      public: pub,
      name,
      onClose: r => { this.rooms.delete(r.id); this.byCode.delete(r.code) },
    })
    this.rooms.set(id, room)
    this.byCode.set(code, id)
    room.start()
    return room
  }

  _enroll(conn, room) {
    if (room.connections.length >= room.config.maxPlayers) return conn.sendError('room_full')
    const slot = room.connections.length
    room.onJoin(conn, conn.playerId, slot)
    conn.room = room
    conn.sendBinary(encodeRoomJoined(room, slot))
  }
}
```

Browse + code-join + private rooms layer on the same primitives. Codes use a confusables-free alphabet.

### Reconnect

`Hello` carries an optional `session` UUID. The connection task asks the matchmaking manager: "do you have a room with player `session=X` in grace?" If yes, the new connection adopts that player's slot. If no, fresh path.

---

## Drop-in / drop-out

Identical semantics to the Rust plan. Sketches:

```js
// server/src/safe-spawn.mjs
const HALTON_2 = (i) => { let f = 1, r = 0; while (i) { f /= 2; r += f * (i & 1); i >>= 1 } return r }
const HALTON_3 = (i) => { let f = 1, r = 0; while (i) { f /= 3; r += f * (i % 3); i = (i / 3) | 0 } return r }

export function findSafeSpawn(state) {
  const W = state.field.width, H = state.field.height
  let best = null, bestDist = -Infinity
  for (let i = 1; i <= 32; i++) {
    const px = HALTON_2(i) * W, py = HALTON_3(i) * H
    let nearest = Infinity
    for (const e of state.enemies)   nearest = Math.min(nearest, dist2(px, py, e.x, e.y))
    for (const a of state.asteroids) nearest = Math.min(nearest, dist2(px, py, a.x, a.y))
    for (const b of state.bullets)   if (b.hostile) nearest = Math.min(nearest, dist2(px, py, b.x, b.y))
    if (nearest > bestDist) { bestDist = nearest; best = { x: px, y: py } }
  }
  return best
}
```

```js
// server/src/grace.mjs  (sketch — actual impl folds into Room)
room.onDisconnect = (playerId) => {
  const ship = room.state.ships.get(playerId)
  if (!ship) return
  ship.frozenInvulnerable = true
  room.grace.set(playerId, { ship, deadline: Date.now() + room.cfg.graceMs })
  // remove the connection but keep the slot/state
  const idx = room.connections.findIndex(c => c.playerId === playerId)
  if (idx >= 0) room.connections.splice(idx, 1)
}

room.onReconnect = (playerId, conn) => {
  const g = room.grace.get(playerId)
  if (!g) return false
  g.ship.frozenInvulnerable = false
  room.grace.delete(playerId)
  room.connections.push({ playerId, conn, slot: g.ship.slot })
  conn.sendBinary(encodeFullSnapshot(room.encodeBuf, room.tick, room.state))
  return true
}
```

The all-disconnect "pause" path is a subset: when `connections.length === 0 && grace.size > 0`, the room sets a `pauseDeadline = Date.now() + 5min` and skips ticks until the deadline elapses (then closes) or someone reconnects.

---

## State, pools, and zero-allocation hot paths

Node performance under sustained load lives or dies by allocation pressure. The simulation must reuse objects.

### Pools

`js/sim/state.js` exports an `EntityPool` class. Same shape as the existing `js/modules/core/pool-manager.js`. Bullets, particles (client-only), enemies, asteroids, drops all live in pools. `ship.x`, `bullet.vx`, etc. are mutable fields; "destroy" sets `alive = false` and the pool reuses the slot.

### Float32 arrays for hottest pools

Bullets are the volume entity. After v1 ships, profile shows bullet integration as a hot loop. Convert bullets to **SoA `Float32Array`s**:

```js
// js/sim/bullet-pool.js  (post-v1 optimization)
export class BulletPool {
  constructor(cap = 1024) {
    this.cap = cap
    this.alive = new Uint8Array(cap)
    this.x = new Float32Array(cap)
    this.y = new Float32Array(cap)
    this.vx = new Float32Array(cap)
    this.vy = new Float32Array(cap)
    this.weapon = new Uint8Array(cap)
    this.owner = new Int32Array(cap)
    this.lifetime = new Float32Array(cap)
    this.next = 0
  }
  spawn() { /* find first dead slot or grow */ }
  integrate(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      this.lifetime[i] -= dt
      if (this.lifetime[i] <= 0) this.alive[i] = 0
    }
  }
}
```

Cache-friendly, zero allocation, type-stable. V8 optimizes this into tight native loops. The same pool is consumed by the renderer in the browser (which reads positions to build the WebGL bullet batch), so we get the perf win on both sides.

This is *the* concrete answer to "but Node is slow": for hot pools we can match Rust's data layout without leaving JS.

---

## Configuration

Same shape as the Rust plan; loaded from env.

| Variable | Default | Description |
|---|---|---|
| `RAINBOIDS_BIND_ADDR` | `0.0.0.0:8443` | uWS listen socket |
| `RAINBOIDS_TLS_CERT_PATH` | unset | If unset, plaintext WS (front with nginx) |
| `RAINBOIDS_TLS_KEY_PATH` | unset | Companion to cert |
| `RAINBOIDS_LOG_LEVEL` | `info` | pino level |
| `RAINBOIDS_MAX_ROOMS` | `200` | Hard cap |
| `RAINBOIDS_MAX_PLAYERS_PER_ROOM` | `4` | |
| `RAINBOIDS_TICK_HZ` | `60` | Sim tick rate |
| `RAINBOIDS_SNAPSHOT_HZ` | `20` | Snapshot broadcast rate |
| `RAINBOIDS_GRACE_SECS` | `30` | Disconnect grace |
| `RAINBOIDS_PAUSE_TIMEOUT_SECS` | `300` | All-disconnect destruction timeout |
| `RAINBOIDS_METRICS_BIND` | `127.0.0.1:9090` | Prom exporter; internal only |
| `RAINBOIDS_ADMIN_TOKEN` | unset | Static token for `/admin/*` |
| `RAINBOIDS_NODE_HEAP_MB` | `768` | Passed to `--max-old-space-size` via systemd |

---

## Deployment

### Topology

```
[ Player browser ]
       │ HTTPS / WSS
       ▼
[   nginx   ] ── TLS termination, /metrics protected, rate limiting
       │ HTTP / WS upstream
       ▼
[ rainboids-server ] ── single Node process, systemd-managed
```

### systemd unit

```ini
[Unit]
Description=Rainboids multiplayer server
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/rainboids/env
ExecStart=/usr/bin/node --max-old-space-size=768 /opt/rainboids/server/src/index.mjs
Restart=on-failure
RestartSec=5s
User=rainboids
Group=rainboids
LimitNOFILE=65536
MemoryMax=1500M
ProtectSystem=strict
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### nginx

```nginx
upstream rainboids_ws {
    server 127.0.0.1:8443;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name play.rainboids.example;
    ssl_certificate     /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    location /ws {
        proxy_pass http://rainboids_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout  600s;
        proxy_send_timeout  600s;
    }

    location /health  { proxy_pass http://rainboids_ws; }
    location /metrics { deny all; }
}
```

### Releases

Tag-driven. `server-vX.Y.Z` triggers GitHub Actions:

1. `cd server && npm ci`
2. `node --test test/**/*.test.mjs`
3. `tar -cz js/sim/ js/net/ server/src/ server/package.json server/package-lock.json` → release artifact.
4. Deploy script SSHes to VPS, untars, runs `npm ci --omit=dev`, restarts systemd.

Zero-downtime is **not** a v1 goal. Reconnect logic absorbs a 2–3s restart. Players see "reconnecting…" briefly.

### Sizing

Estimate: **2 vCPU / 2 GB RAM** handles ~150 concurrent rooms (~600 players). Numbers firm up after load tests. Same VPS class as the Rust plan; we use more of it.

### Upgrade path

If a v2 needs more performance than Node can deliver, the path is:

1. Profile and prove the bottleneck.
2. If it's the simulation: port hot inner loops to **C++ via N-API** (`napi-rs` or hand-rolled). Keep the JS shape. This is the same pattern uWS uses.
3. If it's I/O: shard via `worker_threads` or processes.
4. Only consider a full Rust port if (1) and (2) genuinely don't suffice and the code-sharing advantage has decayed for some other reason.

Realistically: we never need (1)–(3) for this game.

---

## Observability

### Metrics (prom-client)

Counters:
- `rainboids_rooms_created_total`
- `rainboids_rooms_destroyed_total`
- `rainboids_players_joined_total`
- `rainboids_players_left_total{reason}`
- `rainboids_messages_received_total{kind}`
- `rainboids_messages_sent_total{kind}`

Gauges:
- `rainboids_rooms_active`
- `rainboids_players_online`
- `rainboids_players_in_grace`
- `rainboids_event_loop_lag_ms` — captured via `perf_hooks.monitorEventLoopDelay()`
- `rainboids_heap_used_bytes` — from `process.memoryUsage()`

Histograms:
- `rainboids_tick_duration_ms`
- `rainboids_snapshot_size_bytes`
- `rainboids_input_age_ms`
- `rainboids_gc_pause_ms` — from `perf_hooks.PerformanceObserver({ entryTypes: ['gc'] })`

### Logging (pino)

```js
import pino from 'pino'
export const log = pino({ level: process.env.RAINBOIDS_LOG_LEVEL ?? 'info' })
```

Per-event fields: `room_id`, `player_id`, `tick`, `event`. JSON to stdout; journald handles persistence. Per-room debug toggleable via `/admin/room/:id/log_level`.

### Admin endpoints

- `GET /admin/rooms` — active rooms + player counts + current wave + tick p50/p99.
- `POST /admin/room/:id/kick/:player`.
- `POST /admin/room/:id/log_level`.

All gated by static admin token from env, IP-restricted at nginx.

---

## Testing

### Unit (`node:test`, runs in CI)

Each `js/sim/*.test.js` file is a pure unit test against pure functions. Same files run in:

- **Browser CI**: under existing Jest harness (or migrate Jest tests to `node:test` for parity).
- **Server CI**: `node --test js/sim/*.test.js`.

This is the *concrete payoff* of code sharing: a ship-physics test catches client and server bugs simultaneously.

A few golden-output tests pin invariants. E.g. `simulateTick` from a fixed seed and fixed input sequence produces a known final state hash. Run on both sides; tests fail if they ever disagree.

### Integration

`server/test/*.integration.test.mjs` spawns the server in-process and connects synthetic WS clients:

- `room.integration.test.mjs` — create room, two clients join, simulate inputs, verify state propagation.
- `matchmaking.integration.test.mjs` — quick-match, codes, browse.
- `dropin.integration.test.mjs` — third client joins mid-wave, safe spawn placement, invuln window.
- `grace.integration.test.mjs` — kill connection, reconnect within 30s, state resumed; let grace expire and verify clean leave.
- `lag.integration.test.mjs` — synthetic slow-client; backpressure; eventual kick.

### Load

`server/benches/loadgen.mjs` opens N WS connections, simulates inputs, measures wall-time. Pre-public-beta target: **100 concurrent rooms (400 players) at <50% CPU on a 2-vCPU box**.

### Determinism

Cross-language determinism is *not required* with this plan — server and client run *the same* simulation code. We only need within-process determinism for replays and golden tests. Floating-point determinism inside V8 is good enough across runs on the same architecture; a "replay produces the same final state" test pins this.

(If a future port to a non-V8 runtime ever happened, we'd need to revisit. Not a v1 concern.)

---

## Build & CI

### Local dev

```bash
# server
cd server && npm ci && npm run dev    # node --watch src/index.mjs

# client
npm run dev                           # vite, points to ws://localhost:8443/ws
```

`--watch` restarts the server on `js/sim/**` or `server/src/**` changes. Connected clients reconnect automatically.

### CI

GitHub Actions:

- Job `client`: existing.
- Job `sim-tests`: `node --test js/sim/*.test.js`. Fast; runs first.
- Job `server`: `cd server && npm ci && node --test test/**/*.test.mjs`.
- Job `lint`: `eslint js/sim/ js/net/ server/src/`.
- Job `bench` (nightly only): runs `server/benches/*.mjs`, posts trend chart.

The `sim-tests` job is the lynchpin: a sim-rule change in a PR is gated on tests that run *the same code* both sides will run in production.

---

## Comparison: Rust server vs Node server

A side-by-side that honestly weighs both choices.

| Axis | Rust plan | Node plan |
|---|---|---|
| **Server↔client sim drift risk** | High. Two implementations. | **None.** One implementation. |
| **Lines of code (server src)** | ~6,000–10,000 | ~2,500–4,000 (rest is shared with client) |
| **Languages a contributor must know** | 2 (JS + Rust) | 1 (JS) |
| **Hot-reload dev loop** | 30–90s incremental | <500ms |
| **Steady-state CPU per 100 rooms** | ~3% on 2 vCPU | ~9–12% on 2 vCPU |
| **Steady-state memory per 100 rooms** | ~5 MB | ~40 MB |
| **p99 tick time (no GC)** | ~150 µs | ~600 µs |
| **p99 tick time (worst GC pause)** | ~150 µs | ~5 ms (rare; <1×/min) |
| **Headroom on a $5/mo VPS** | enormous | comfortable |
| **Wire protocol drift risk** | Medium. Two codecs. | None. One codec. |
| **Anti-cheat** | identical (server-authoritative) | identical |
| **Operational complexity** | single static binary | single process; same systemd unit |
| **Crash safety** | extremely high | very high (uncaught exceptions handled, process restart) |
| **Determinism for replay** | tight (Rust + bincode + seeded PRNG) | tight enough (same V8 build = same FP behavior) |
| **Type safety** | strong static | gradual via JSDoc / opt-in TS |
| **Time-to-first-multiplayer-prototype** | ~10 weeks | **~5 weeks** |
| **Risk of "we ship and it's subtly wrong"** | medium-high | low |
| **Risk of "we run out of CPU"** | very low | low |

**Net:** Rust trades shipping speed and bug-class elimination for raw efficiency and operational tidiness we don't need at this scale.

---

## Risks and open questions

### Unique-to-Node risks

- **GC pauses spike tick time.** Mitigation: pools + Buffer reuse + `--max-old-space-size=768` (smaller heap → faster major GCs). Monitor `rainboids_gc_pause_ms`. If we ever see p99 GC > 30ms, lean harder on typed-array pools.
- **Single-thread bottleneck.** Mitigation: profile, then `worker_threads` shard if needed. Document the threshold.
- **Memory leaks from accidental retainers.** Mitigation: weekly low-traffic process restart (cron or systemd timer); heap-growth alert on `heap_used_bytes`.
- **`uWebSockets.js` is a binary native dep.** Less ergonomic than pure-JS `ws`. Mitigation: pin a Node major version; document the install path; have `ws` as a tested fallback if native install fails on a developer's machine.
- **Floating-point determinism across V8 versions.** Tiny risk; pin Node version in production. If a future Node update changes math output, golden-tests will scream and we update.

### Risks shared with the Rust plan

- **Engine refactor is invasive.** Same risk as Rust plan; same mitigation (Phase 1 ships a no-functional-change refactor first).
- **Hosting cost is small but ongoing.** $5–10/mo. Same.
- **Wave-pool spawn timing.** Server drives. Same.
- **Mobile players on flaky networks.** Same. Grace timer absorbs.

### Open questions

- **Should the shared `js/sim/` have a `package.json` with `"type": "module"` and be importable as `@rainboids/sim`?** Probably yes, even within the monorepo, for cleaner import paths. Not v1-blocking.
- **Should we adopt TypeScript wholesale before starting?** Tempting. Decision: stay JS+JSDoc for v1. TS migration is incremental and orthogonal.
- **Is `uWebSockets.js` the right call vs `ws`?** `uWS` for v1 (the perf headroom matters). Document `ws` as the swap-in if uWS becomes a deployment headache.

---

## What we explicitly choose against

For symmetry with the Rust plan's "what we choose against" section:

- **Rust server.** The simulation-drift cost is too high for the perf win we don't need. Re-evaluate only if entity counts grow ~10× or PvP enters scope.
- **Go server.** Sensible alternative; simpler runtime than Rust, faster than Node, but loses code-sharing — same downside as Rust.
- **TypeScript-only server.** Adds build step. JSDoc gets us 90% of the type-safety value with 0% of the build complexity for v1.
- **Mongoose / Express / Socket.IO.** Heavier than needed. uWS + hand-rolled binary protocol is a fraction of the dependency surface and dramatically faster.
- **`ws` over `uWebSockets.js` for v1.** `ws` is fine but uWS's broadcast and HTTP server are markedly better at the throughputs we expect.
- **Worker-threads from day one.** Premature. Single-process scales to comfortably past our launch target.

---

## Implementation milestones

Solo-dev pace, anchor numbers, not commitments. Compare to the Rust plan's 15-week milestones; this Node plan condenses to ~10 weeks because the simulation port is *not happening*.

| Week | Goal |
|---|---|
| 1 | JS engine refactor steps 1–2 (extract `simulateTick`, extract effect emission). Solo play unchanged. |
| 2 | JS engine refactor steps 3–5 (extract input, render-reads-state, parity). `js/sim/` exists as a pure module. |
| 3 | Server scaffolding: `server/`, uWS hello-world, Hello/Welcome handshake, structured logging, metrics endpoint. |
| 4 | Connection class + matchmaking (no rooms yet). Title-screen Quick Match button hooks up. |
| 5 | Room class. Tick loop. Sim integration (just import `simulateTick`). Snapshot fanout. Two clients see each other in the same room. |
| 6 | Drop-in / drop-out: mid-wave joining, safe spawn, drift-out animation, grace timer. |
| 7 | Co-op design: revives, individual gold/score, shared wave-clear gate, friendly fire off, drop attribution. |
| 8 | Matchmaking polish: Quick Match, Browse, code-based private rooms. Lobby UX. |
| 9 | Observability: metrics, structured logs, admin endpoint. Initial load tests. Buffer-reuse / pool optimization pass. |
| 10 | Closed beta: deploy to VPS, invite 8–12 testers, telemetry, patch cycle. |

The omitted weeks 6–8 from the Rust plan ("port `simulate_tick` from JS to Rust") simply don't exist here. That is the deliverable advantage of choosing Node.

---

## Acceptance criteria for "v1 multiplayer ships"

Same set as the Rust plan; reproduced for completeness.

- [ ] Two players can quick-match into a room and play through wave 1 cooperatively.
- [ ] Either player disconnecting does not break the other's game.
- [ ] A third player can drop into a wave-2 game; spawns safely; gameplay continues.
- [ ] Player progression (gold, score, level) is per-player and visible to all.
- [ ] All players see consistent enemy/asteroid positions to within ~50ms.
- [ ] Downed players can be revived by another player.
- [ ] Wave-clear powerup picks are individual; the room advances when all alive players have picked.
- [ ] No crashes under 1h of normal play with 4 players.
- [ ] Solo-play is unchanged from pre-multiplayer (same feel, same performance).
- [ ] Server has metrics endpoint scrapable by Prometheus.
- [ ] CI runs all tests on every push.
- [ ] Server and client *cannot* disagree on simulation rules — enforced by code sharing.

The last bullet is the new one. It is not just a property; it is the entire reason this document exists.

---

## Bottom line

Choosing Node for the multiplayer server is choosing **shipping speed and correctness over raw performance we do not need**. The single shared simulation module is the difference between "ship multiplayer in 10 weeks with low drift risk" and "ship multiplayer in 15 weeks while continually fighting cross-language drift bugs."

V8 is fast enough. The gap to Rust is real but well within budget. The eliminated bug class is enormous. For Rainboids' scale and shape, this is the right trade.

Build it in Node. Keep the door open to native acceleration later if profiling ever demands it. Re-evaluate if entity counts or player counts grow by an order of magnitude.
