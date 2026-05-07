# Rust Server — Multiplayer Plan — 

A planning document for a **Rust authoritative WebSocket server** for Rainboids co-op multiplayer, as the alternative path to the Node server proposed in `NodeJS Server.md`.

The thesis of this document: **the long-term operational and performance properties of a Rust server are markedly better than Node's** — bounded tail latency (no GC), an order of magnitude lower CPU and memory per room, a static-binary deploy model, and a type system that catches whole classes of bugs at compile time. Rust pays for these properties with one cost: the simulation must be implemented twice, once in JS for the client (solo + prediction) and once in Rust for the server (authoritative). The bulk of this document — and its companion `Rust Multiplayer Engine and Client.md` — is about how to keep those two implementations honest.

That asymmetric trade — *raw efficiency and operational tidiness, paid for in cross-language sync work* — is the load-bearing reason to choose Rust if you choose it.

---

## TL;DR

- **Recommendation:** ship the v1 multiplayer server in **Rust (latest stable)** using **`axum` + `tokio-tungstenite`** for transport, **`bincode`** (or **`postcard`**) for the wire codec, and a **dedicated `server/` crate** that holds an authoritative reimplementation of the simulation. Same authoritative-server, snapshot+events, client-prediction architecture as the Node plan — different language, different cost profile.
- **Why Rust is dramatically faster:** native machine code, no GC, contiguous data layouts, fearless multi-threaded async. Expect ~3–4× lower CPU per room, ~8× lower memory, and bounded p99 tick time.
- **Why Rust beats Node *at scale and for long-term maintenance*:** operational simplicity (single static binary, systemd), memory safety, type-checked exhaustive state machines, clean concurrency, mature profiling tooling. The properties compound for any long-running server.
- **Cost of choosing Rust over Node:** the simulation lives in two languages. Wire protocol lives in two languages. Cross-language drift is a real, ongoing engineering cost — addressable but never zero. Slower dev loop. Longer time-to-first-multiplayer-prototype.
- **What we keep identical to the Node plan:** WebSocket transport, server-authoritative simulation, 60Hz tick / 20Hz snapshot / on-demand events, snapshot interpolation + local-ship prediction, drop-in/drop-out semantics, matchmaking shape.

---

## Why Rust, and the honest case against it

### The case for Rust

**No garbage collector, ever.** The single most important property for a long-running game server. Rust's drop semantics deallocate as scopes end; there is no concurrent collector that can stall the simulation tick. Tail latency is *bounded by your code*, not by V8's heap heuristics. p99 tick time on a Rust server is essentially p50 tick time — if you measured a 200µs simulation, you will see 200µs nearly always.

**Native, contiguous data layouts.** A `Vec<Bullet>` is 24 bytes of header plus 1024 bullets packed end-to-end with no boxing, no JS-object headers, no hidden classes. A struct of bullets is exactly the cache-friendly layout the CPU wants. Iteration is a `mov` and an `add` per bullet — almost literally what the SIMD engine inside the CPU was designed for.

**Fearless concurrency.** `tokio` provides real OS-thread parallelism. Rooms run on a multi-thread async runtime; CPU-heavy ticks for room A do not block room B. Compare to Node's single-isolate event loop where 100 rooms fight for one core. For our scope this isn't a hard requirement (one core is enough), but it removes a class of "what if a tick gets long" worry.

**Type-checked state machines.** Rooms transition `WaitingForPlayers → Playing → WaveTransition → ... → Closing`. In Rust this is an enum and the compiler enforces every transition site handles every variant. Forget a case in `match` and the code does not compile. In JS, that's a runtime "did I miss a case" hunt with telemetry.

**Memory safety.** No use-after-free. No double-free. No null-deref. No data race. The borrow checker is annoying for ~3 weeks and then becomes invisible. The bug class it eliminates is exactly the bug class that haunts long-running C/C++/JS servers in production.

**Single static binary.** `cargo build --release` produces one ELF file. Copy to the VPS, run it. No `node_modules`, no runtime version pinning, no native-binding ABI mismatches, no `npm ci` failing on the production box because some transitive dep dropped its prebuilt artifact. Operations are *boring*, which is what you want.

**Profiling and tooling.** `cargo flamegraph`, `perf`, `dhat-rs` for heap profiling, `criterion` for benchmarks, `tokio-console` for runtime introspection. The mature tooling stack for systems work translates directly to game-server work.

**Long-term maintenance properties.** A Rust process you forget about for three months stays performant. Refactors are checked at compile time across the whole crate graph. Adding a new event variant to the protocol enum is a "fix every match site" exercise, all compile-time.

### The case against Rust

**The simulation lives in two languages.** Every gameplay change costs two edits — one in `js/sim/` for client prediction and solo play, one in `server/src/sim/` for the authoritative server — plus a parity test to confirm they agree. Forgetting the second edit means the client predicts something the server never honors. This is the dominant ongoing cost of the Rust path; the entire `Rust Multiplayer Engine and Client.md` companion document is structured around mitigating it.

**The wire protocol lives in two languages.** Same problem at smaller scale. A `bincode` schema in Rust must be hand-mirrored by a JS encoder/decoder. Drift between them is silent until a client crashes mid-snapshot.

**Slower dev loop.** Cold compile of the server crate: 30–90s. Incremental: 2–10s. Hot reload via `cargo watch -x run`: 5–15s end-to-end. Compare to Node `--watch` at <500ms. Multiplied across a feature dev session, that's real.

**Longer time-to-first-multiplayer-prototype.** Porting `simulateTick` from JS to Rust is roughly 2–3 weeks of focused work even with a clean Phase 1 refactor. Node skips this entirely.

**Cross-language determinism is harder.** Rust's `f32::sin` and V8's `Math.sin` are *not* bit-identical on all inputs (different libm implementations). For client-side prediction to reconcile cleanly to authoritative server state, the math used by both sides for the predicted subset must agree. Mitigation: fixed-point math for the prediction-relevant subset (ship movement), discussed in detail in the engine doc. But it is one more thing to design and maintain.

**Two-language CI.** Two toolchains, two `cargo test` / `npm test` runs, one extra parity test stage. Each adds friction.

**Team needs Rust experience.** A solo dev coming off a JS-only project either invests in Rust or fights the borrow checker for 6+ weeks before reaching productive velocity. Real cost, often underestimated.

### What we are *not* arguing

We are **not** arguing that Rust eliminates more bugs than Node *for this codebase*. Node eliminates the drift class entirely. Rust eliminates a different class (use-after-free, data race, null-deref) that JS already eliminated for free. The bug-class accounting is roughly:

| Bug class | Node server | Rust server |
|---|---|---|
| Server↔client sim drift | impossible by construction | possible; addressed by parity tests |
| Wire protocol skew | impossible by construction | possible; addressed by parity tests |
| Memory unsafety | impossible (JS) | impossible (Rust) |
| Data race | rare (single thread) | impossible (compiler) |
| Type confusion | possible (JSDoc-checked) | impossible (compiler) |
| Unhandled state transition | possible | impossible (exhaustive match) |
| GC stall | possible | impossible (no GC) |
| Memory leak (retainer) | possible | very rare (drop-on-scope) |

Each side has its eliminated and its non-eliminated. The Node case argued the drift class is the *dominant* one. The Rust case is that for **a server you intend to operate for years at scale**, the bounded-tail-latency and ops-simplicity properties pay rent every day, while the drift cost can be controlled by engineering discipline (tests, schemas, codegen).

Both arguments are honest. Choose based on which property set matters more for your operating constraints.

---

## Performance: native machine code vs V8 JIT

The Node companion doc treated V8's JIT honestly and quoted ratios. This section returns the favor for Rust.

### How Rust reaches machine code

Rust's pipeline:

1. **Parser / type checker** — source → typed HIR.
2. **Borrow checker** — HIR → MIR; lifetimes proven.
3. **Codegen via LLVM** — MIR → LLVM IR → optimized native machine code. LLVM applies inlining, loop unrolling, vectorization (SIMD where applicable), bounds-check elimination, dead-store elimination, escape analysis, register allocation, peephole optimization — the full optimizing-compiler suite. Output is the same instruction-set families V8 produces, but with **all type information known statically**, so specialization is unconditional.
4. **Optional LTO** — link-time optimization across crate boundaries; `cargo build --release` with `lto = "thin"` is standard.

Compared to V8's TurboFan:

- LLVM's optimizer is ~2× more aggressive at vectorization and ~30% better at loop optimization.
- LLVM has more time budget per function; it doesn't have to tradeoff JIT-warmup cost.
- Rust's monomorphization (generic specialization) means generic functions inline as if they were hand-written for each type. JS has no generics, so V8's equivalent is shape-specialization, which is heuristic.
- Rust's lack of inheritance, dynamic dispatch by default, or polymorphic call sites means almost every call inlines or devirtualizes statically. V8 must guard hot calls with type checks (inline caches).

The **result**: tight numerical loops in Rust are typically 2–4× faster than the equivalent in optimized JavaScript, and this gap widens for SIMD-amenable code.

### Quantified expectation

Same workload, fresh estimates for Rust:

| Metric | Rust estimate | Node estimate (recap) | Node:Rust ratio |
|---|---|---|---|
| `simulate_tick` median | ~80 µs | ~250 µs | ~3× |
| `simulate_tick` p99 | ~150 µs | ~600 µs (sometimes GC-spike to ~5ms) | ~4×, plus tail |
| Snapshot encode | ~25 µs | ~75 µs | ~3× |
| Bytes/sec per player | identical | identical | wire is the same |
| Memory per room | ~50 KB | ~400 KB | ~8× |
| CPU at 100 rooms | ~3% | ~9–12% | ~3–4× |
| CPU at 1000 rooms (extrapolated) | ~30% | ~90–120% (would need sharding) | n/a |
| Tail behavior | flat | GC-spike outliers | qualitative |

Numbers are estimates pending benchmark; the *shape* of the gap is the load-bearing claim.

### Where Rust's lead matters most

- **Tail latency.** A Rust server's p99 tick time is essentially its p50. A Node server's p99 includes occasional major-GC stalls. For a 60Hz game running 50ms-behind interpolation, both are usually fine — but if you ever push to 120Hz, or scale to many rooms per process, the Rust tail wins.
- **Headroom on a small VPS.** A $5/mo box (1 vCPU, 1 GB RAM) hosts ~150 rooms in Rust comfortably. Node would need 2× the box.
- **Headroom for game features.** "What if we add 500 enemies per wave?" In Node, you'd profile and rework hot paths. In Rust, you've already got the budget.
- **Cold-start performance.** Rust runs at full speed on tick 1. V8 runs at Ignition speed for the first ~500ms while TurboFan compiles hot functions. Not a real concern at server scale (the server runs continuously) but matters during dev cycles.

### Where Rust's lead doesn't matter

- **Wire bytes.** Identical between languages.
- **Database / disk / network I/O.** Rust isn't faster at TCP than Node when the kernel is the bottleneck.
- **Algorithmic complexity.** A bad O(n²) collision check is bad in both languages. Rust just hits the wall at higher n.

### When the math would change toward Node

If our scale stayed at <50 concurrent rooms forever, the Rust performance lead is *unutilized*. Node would never be the bottleneck; the only thing Rust's win bought us is "cheaper VPS class," which is $5/mo of savings. Then Node's drift-elimination dominates.

Conversely, if we ever go to 1000+ concurrent rooms, 120Hz tick rates, or PvP with rollback, Rust's lead becomes load-bearing.

For Rainboids' actual launch scope (4-player co-op, 60Hz, hundreds of rooms target), **either runtime is technically fit**. The choice is dominated by which engineering cost you'd rather pay: cross-language sim sync (Rust) or higher operational and resource overhead (Node).

---

## High-level architecture

```
                    ┌──────────────────────────────────────────┐
                    │  rainboids-server (Rust, single binary)  │
                    │                                          │
   ┌──────────┐     │  ┌────────────────────────────────────┐  │
   │ Browser  │ WSS │  │  axum HTTP / WS listener           │  │
   │  client  │ ◀──▶│  └────────────┬───────────────────────┘  │
   └──────────┘     │               │                          │
                    │               ▼                          │
                    │  ┌────────────────────────────────────┐  │
                    │  │  ConnectionTask (1 per WS)         │  │
                    │  │  - reads frames                    │  │
                    │  │  - writes frames                   │  │
                    │  │  - hello/auth/version              │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │     ┌─────────┴────────┐                 │
                    │     ▼                  ▼                 │
                    │  ┌──────────┐   ┌──────────────┐         │
                    │  │ Match-   │   │ RoomActor    │ 60Hz    │
                    │  │ making   │   │ (1..N)       │ tick    │
                    │  │ Actor    │   │ - GameState  │ async   │
                    │  │ (single) │◀──│ - InputBufs  │ task    │
                    │  └──────────┘   │ - SimRunner  │         │
                    │                 │ - Broadcast  │         │
                    │                 └──────────────┘         │
                    │                                          │
                    │  src/sim/* — authoritative Rust          │
                    │              implementation of           │
                    │              simulation rules            │
                    └──────────────────────────────────────────┘
                                    │  wire protocol
                                    │  (bincode/postcard)
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │   Browser client                         │
                    │   js/sim/*  — JS implementation of       │
                    │              simulation (solo + predict) │
                    │   js/net/*  — codec mirror + glue        │
                    └──────────────────────────────────────────┘

                              ┌─────────────────────────┐
                              │  Parity harness         │
                              │  (CI, runs both sides)  │
                              │  - golden fixtures      │
                              │  - codec round-trip     │
                              │  - sim cross-replay     │
                              └─────────────────────────┘
```

One Rust process. One axum app. Inside: a singleton matchmaking actor and a pool of room actors, each its own async task running a 60Hz simulation tick. WebSockets fan in/out via per-connection actors.

The Rust simulation is canonical. The JS client carries an independent simulation of its own (described in the engine doc); a parity harness in CI keeps the two honest.

### Process model

Single-process for v1. Tokio multi-thread runtime; rooms scheduled across worker threads. The runtime saturates available cores naturally.

Scaling beyond one process:

- **Vertical scale first**: more rooms per process. A 2-vCPU box should comfortably hold 150–300 rooms.
- **Then horizontal**: multiple processes behind nginx; routing by `room_id` cookie or short-circuit at matchmaking time. No shared state between processes; matchmaking can be replicated by sharing a tiny KV store (Redis) for the room registry, but most deployments need only one process.
- **Then sharding by region**: out of v1 scope.

For v1: one process, document the threshold, do not pre-build sharding.

---

## Tech stack

- **Rust** stable, latest at time of writing (1.79+).
- **`tokio`** — multi-threaded async runtime. `flavor = "multi_thread"`, `worker_threads = num_cpus`.
- **`axum`** — HTTP/WS routing. Plays nicely with `tower` middleware (rate limiting, tracing, request IDs).
- **`tokio-tungstenite`** — WebSocket protocol; `axum::extract::ws::WebSocket` wraps it.
- **`serde`** — derive macros for serialize/deserialize.
- **`bincode`** — compact binary encoding for the wire. Mature, well-tooled, default choice. (`postcard` is a hair smaller and `no_std`-friendly; pick `bincode` unless that matters.)
- **`dashmap`** — concurrent map for room registry without an outer lock.
- **`glam`** — `Vec2` / `Mat3` math. SIMD where supported.
- **`rand_pcg`** — seeded PCG64 PRNG. Fast, statistically sound, tiny state. Same algorithm used on the JS side for parity.
- **`fixed`** — fixed-point arithmetic (used for cross-language-deterministic ship physics; see engine doc).
- **`tracing` + `tracing-subscriber`** — structured logging with span correlation.
- **`metrics` + `metrics-exporter-prometheus`** — counters / gauges / histograms; Prometheus exporter.
- **`clap` v4** — CLI args.
- **`dotenvy`** — `.env` file loader.
- **`thiserror`** — typed error enums for libs.
- **`anyhow`** — error context propagation in app code.
- **`uuid`** — session token generation (v4).
- **`nanoid`** — short, unambiguous-alphabet room codes.
- **`criterion`** — benchmarking harness for `simulate_tick` and snapshot encoding.
- **`tokio-test`** — async test utilities.
- **`pretty_assertions`** — better diff output for golden tests.
- **`insta`** — snapshot testing for deterministic golden fixtures.

Optional and worth considering as the project grows:

- **`tokio-console`** — async runtime introspection during dev.
- **`dhat`** — heap profiling.
- **`flamegraph`** — perf-based flamegraphs from `cargo flamegraph`.
- **`hecs`** or **`bevy_ecs`** — ECS storage if entity counts ever justify the layer (probably not for v1).

---

## Repo layout

```
rainboids-2/
├── js/
│   ├── sim/                              client-side simulation (solo + prediction)
│   │   ├── ...                           (see Rust Multiplayer Engine and Client.md)
│   ├── net/                              browser network glue
│   ├── modules/                          existing
│   └── ...
├── schema/                               ◀──── NEW. Single source of truth for shared types.
│   ├── README.md
│   ├── protocol.toml                     declarative spec (or `protocol.rs` macro-input)
│   ├── codegen.rs                        compiles spec to Rust types and JS encoders
│   └── snapshots/                        golden cross-language fixtures
│       ├── tick_01.bin
│       ├── tick_01.expected.json
│       └── ...
├── server/                               ◀──── NEW. Rust server crate.
│   ├── Cargo.toml
│   ├── README.md
│   ├── .env.example
│   ├── deploy/
│   │   ├── nginx.conf.example
│   │   ├── rainboids-server.service
│   │   └── Dockerfile
│   ├── benches/
│   │   ├── tick.rs                       criterion bench for simulate_tick
│   │   └── snapshot.rs
│   ├── tests/
│   │   ├── integration_room.rs
│   │   ├── integration_matchmaking.rs
│   │   ├── integration_dropin.rs
│   │   ├── integration_grace.rs
│   │   ├── integration_lag.rs
│   │   └── integration_parity.rs         ◀──── cross-language parity smoke
│   └── src/
│       ├── main.rs                       entry: CLI, config, signals, listen
│       ├── config.rs                     env + CLI -> Config
│       ├── error.rs                      AppError, Result alias
│       ├── server/
│       │   ├── mod.rs
│       │   ├── http.rs                   axum router; HTTP + WS upgrade
│       │   ├── connection.rs             per-WS task
│       │   └── auth.rs                   session tokens, reconnect handshake
│       ├── protocol/
│       │   ├── mod.rs                    ClientMsg / ServerMsg / GameEvent enums
│       │   ├── codec.rs                  bincode encode/decode helpers
│       │   └── version.rs                WIRE_VERSION + compat checks
│       ├── matchmaking/
│       │   ├── mod.rs                    MatchmakingActor (singleton)
│       │   ├── quickmatch.rs             find-or-create policy
│       │   └── browse.rs                 public-room listing
│       ├── room/
│       │   ├── mod.rs                    RoomActor; per-room state
│       │   ├── handle.rs                 RoomHandle (mpsc sender wrapper)
│       │   ├── lifecycle.rs              create / join / leave / grace / close
│       │   ├── snapshot.rs               snapshot construction + delta encoding
│       │   └── safe_spawn.rs             mid-wave spawn-point picker
│       ├── sim/
│       │   ├── mod.rs                    pub use; top-level simulate_tick
│       │   ├── state.rs                  GameState; entity collections
│       │   ├── input.rs                  PlayerInput; bounds validation
│       │   ├── ship.rs                   ship physics; fixed-point movement
│       │   ├── enemy.rs                  enemy types; AI; attack patterns
│       │   ├── asteroid.rs               asteroid spawn + split
│       │   ├── bullet.rs                 bullet integration; projectile events
│       │   ├── wave.rs                   wave spawn schedule + clear gate
│       │   ├── collision.rs              broadphase + narrowphase
│       │   ├── drops.rs                  orbs: spawn, attract, collect
│       │   ├── difficulty.rs             per-player count scaling
│       │   ├── rng.rs                    seeded PCG64 wrapper
│       │   └── fxp.rs                    fixed-point types and ops
│       ├── obs/
│       │   ├── mod.rs
│       │   ├── metrics.rs                Prometheus exporter
│       │   └── tracing.rs                tracing-subscriber setup
│       └── util/
│           ├── mod.rs
│           ├── id.rs                     RoomId, PlayerId, BulletId, ...
│           └── time.rs                   monotonic clock helpers
└── ...
```

The defining structural choices:

- **`schema/` at the repo root** holds the single source of truth for the wire protocol and the prediction-deterministic subset of the simulation (ship physics + RNG). Codegen produces the Rust types in `server/src/protocol/` and the JS codec in `js/sim/protocol-generated.js`. The shape of `schema/` is detailed in `Rust Multiplayer Engine and Client.md`.
- **`server/` at the repo root** holds the entire Rust crate. CLAUDE.md disallows new top-level dirs without approval — this is an explicit decision to take. The alternative `tools/server/` undersells it; `tools/` houses dev infra and a deployable game server is something else.
- **The two simulations are deliberately parallel directory structures**: `js/sim/` and `server/src/sim/` have the same module names. A reader can open `ship.js` and `ship.rs` side by side and see the same algorithm in two languages. This is structural pressure toward parity.

---

## Wire protocol

Identical shape to the Node plan. The implementation differs because the canonical encoding is `bincode` and the JS side decodes it.

### Versioning

```rust
// server/src/protocol/version.rs
pub const WIRE_VERSION: u16 = 1;
pub const SIM_VERSION:  u16 = 1;
```

Hello carries both. Server compares; mismatch closes the socket with code `1002` and a reason payload.

### Frame format

Each WebSocket frame is one binary message containing one bincode-encoded `ClientMsg` or `ServerMsg`. Bincode embeds the variant tag automatically when deriving `Serialize`. No batching for v1.

### Message enums

Same shape as in `Multiplayer Planning – 2026-05-06.md`; reproduced for completeness.

```rust
// server/src/protocol/mod.rs
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ClientMsg {
    Hello {
        wire_version: u16,
        sim_version: u16,
        client_version: String,
        display_name: String,
        session: Option<Uuid>,
    },
    QuickMatch,
    BrowseRooms,
    CreateRoom { name: String, public: bool, max_players: u8 },
    JoinRoom { room_id: RoomId },
    JoinRoomByCode { code: String },
    LeaveRoom,
    Input { tick: u32, packed: PackedInput },   // 30Hz
    Ack { snapshot_tick: u32 },
    Pong { client_t: u32, server_t: u32 },
    PowerupChoose { powerup: PowerupId },
    Revive { target: PlayerId },
    Chat { text: String },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ServerMsg {
    Welcome { player_id: PlayerId, session: Uuid, server_t_ms: u64 },
    Error { code: ErrCode, msg: String },
    RoomList { rooms: Vec<RoomSummary> },
    RoomJoined {
        room_id: RoomId,
        code: String,
        slot: u8,
        peers: Vec<PeerInfo>,
        wave: u32,
        seed: u64,
    },
    RoomLeft { reason: LeaveReason },
    PeerJoined { peer: PeerInfo, slot: u8 },
    PeerLeft { slot: u8, reason: LeaveReason },
    Snapshot { tick: u32, base_tick: Option<u32>, payload: SnapshotPayload },
    Event { tick: u32, event: GameEvent },
    Ping { client_t: u32, server_t: u32 },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum GameEvent {
    BulletSpawn { id: BulletId, owner: PlayerId, weapon: WeaponId, x: Fxp, y: Fxp, vx: Fxp, vy: Fxp },
    BulletDespawn { id: BulletId, reason: DespawnReason },
    EnemyDestroy { id: EnemyId, by: Option<PlayerId>, drops: Vec<DropId> },
    AsteroidDestroy { id: AsteroidId, by: Option<PlayerId>, fragments: Vec<AsteroidId> },
    OrbCollect { id: DropId, by: PlayerId, value: u32 },
    PlayerDamaged { player: PlayerId, hp: f32 },
    PlayerDowned { player: PlayerId },
    PlayerRevived { player: PlayerId, by: PlayerId },
    WaveStart { wave: u32, enemy_count: u32 },
    WaveClear { wave: u32, time_ms: u32 },
    PowerupOffer { player: PlayerId, picks: u8 },
    PowerupChosen { player: PlayerId, powerup: PowerupId },
    HitFlash { entity: EntityRef, intensity: f32 },     // cosmetic
    DamageNumber { x: f32, y: f32, value: i32, kind: DmgKind },  // cosmetic
}
```

The `Fxp` type for entity coordinates is fixed-point (i32 micrometers): the prediction-relevant subset is bit-deterministic across the Rust↔JS boundary. Cosmetic-only fields (HP for HUD interpolation, damage-number positions) stay as `f32` because cross-language exactness isn't needed for them.

### Input packing

```rust
#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct PackedInput {
    pub move_x: i8,        // -127..127, normalized
    pub move_y: i8,
    pub aim_x: f16,
    pub aim_y: f16,
    pub buttons: u8,       // bitfield
}
```

Roughly 7 bytes; 30Hz upstream is ~210 B/s per player. Negligible.

### Snapshots vs events

Identical split to the Node plan:

- **Snapshots** (~20Hz): bulk slow-changing state, delta-coded against the receiver's last-acked tick where present.
- **Events** (on-demand): bullet spawn/despawn, enemy destroy, wave transitions, collects.

Snapshot encoding is a hot path; bincode encoding into a per-room reusable `Vec<u8>` keeps allocation pressure off the global allocator. After v1, swap to a custom encoder using `bytes::BytesMut` for ref-counted shared snapshot frames across all room members (one encode, N transmits).

---

## Server architecture (actor model)

```
                 ┌──────────────────────┐
                 │   axum HTTP server   │
                 │   /health  /metrics  │
                 │   /ws                │
                 └─────────┬────────────┘
                           │ WS upgrade
                           ▼
              ┌──────────────────────────┐
              │  ConnectionTask (1/conn) │
              │  reads/writes WS frames  │
              └────┬─────────────────┬───┘
                   │                 ▲
                   ▼              ServerMsg
        ┌──────────────────┐
        │ MatchmakingActor │
        │  (1 global)      │
        └────────┬─────────┘
                 │ enroll
                 ▼
        ┌──────────────────────┐
        │  RoomActor (1/room)  │
        │  60Hz sim tick       │
        │  ~20Hz snapshot      │
        └──────────────────────┘
```

- One `ConnectionTask` per WebSocket; owns the read/write halves and a small outbound mpsc.
- One `MatchmakingActor` (singleton); handles room create / browse / quick-match / code lookup.
- One `RoomActor` per active room; owns its authoritative `GameState`, runs the simulation tick, fans out snapshots and events.

### Channels

- `Connection → Matchmaking`: shared `mpsc::Sender<MMInbound>`.
- `Connection → Room` (after join): per-room `mpsc::Sender<RoomInbound>`.
- `Room → Connection` (snapshots, events): each connection holds an `mpsc::Sender<ServerMsg>` whose receiver feeds the WS write half. Rooms broadcast by iterating `Vec<PlayerHandle>` and calling `try_send`.

### Backpressure & slow-client policy

- **Inbound:** `ConnectionTask` reads frames and routes via bounded mpsc. If the actor is busy, the read awaits — natural backpressure since channels are async.
- **Outbound:** `ConnectionTask` drains its outbound mpsc and writes to the WS. If the WS write blocks, the mpsc backs up. When `try_send` returns `Full`, the room flags the client as `lagging` and skips snapshots until the channel drains. After 5s of continuous lag, the room kicks the client.

### Connection lifecycle

```
1. WS upgrade  -> ConnectionTask spawned.
2. Await Hello with 3s timeout. Bad/missing Hello -> close.
3. Validate WIRE_VERSION + SIM_VERSION. Mismatch -> close 1002.
4. Reply Welcome { player_id, session, server_t_ms }.
5. Forward subsequent ClientMsgs to MatchmakingActor.
6. On MM-driven RoomJoined, the connection is given a RoomHandle.
7. Forward Input/Ack/LeaveRoom/etc. to that RoomHandle.
8. On WS close (clean or unclean), notify the room so it can begin grace handling.
```

### Reconnect

`Hello` carries an optional `session: Uuid`. If matchmaking recognizes the session as belonging to a recently disconnected player still in a room's grace window, the new connection re-attaches to that room slot; the room sends a full snapshot to bring it up to speed. Otherwise the session is treated as a fresh connection.

### Code sketch — connection task

```rust
// server/src/server/connection.rs
async fn connection_task(ws: WebSocket, mm: MatchmakingHandle) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMsg>(256);

    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            let bytes = match protocol::encode(&msg) {
                Ok(b) => b,
                Err(e) => { tracing::warn!(?e, "encode failed"); continue; }
            };
            if ws_tx.send(Message::Binary(bytes)).await.is_err() { break; }
        }
    });

    let hello = match read_hello(&mut ws_rx).await {
        Ok(h) => h,
        Err(_) => { writer.abort(); return; }
    };
    if hello.wire_version != WIRE_VERSION || hello.sim_version != SIM_VERSION {
        let _ = out_tx.send(ServerMsg::Error {
            code: ErrCode::Version,
            msg: format!("server v{}/{}", WIRE_VERSION, SIM_VERSION),
        }).await;
        writer.abort();
        return;
    }
    let player_id = PlayerId::new();
    let session = Uuid::new_v4();
    let _ = out_tx.send(ServerMsg::Welcome { player_id, session, server_t_ms: now_ms() }).await;

    let mut current_room: Option<RoomHandle> = None;
    while let Some(Ok(frame)) = ws_rx.next().await {
        let Message::Binary(buf) = frame else { continue };
        let Ok(msg) = protocol::decode(&buf) else { continue };
        match (&msg, &current_room) {
            (
                ClientMsg::Input { .. } | ClientMsg::Ack { .. } |
                ClientMsg::LeaveRoom | ClientMsg::Revive { .. } |
                ClientMsg::PowerupChoose { .. } | ClientMsg::Chat { .. },
                Some(room),
            ) => {
                let _ = room.send(RoomInbound::FromPlayer(player_id, msg)).await;
            }
            _ => {
                if let Some(new_room) = mm.handle_msg(player_id, msg, out_tx.clone()).await {
                    current_room = Some(new_room);
                }
            }
        }
    }

    if let Some(room) = current_room {
        let _ = room.send(RoomInbound::Disconnected(player_id)).await;
    }
    writer.abort();
}
```

---

## Per-room simulation loop

The single most important task on the server.

### Tick pacing

```rust
// server/src/room/mod.rs
async fn run_room(mut room: Room) {
    let mut tick_interval = tokio::time::interval(Duration::from_millis(16));
    tick_interval.set_missed_tick_behavior(MissedTickBehavior::Burst);
    let mut tick_counter = 0u32;
    loop {
        tokio::select! {
            biased;
            cmd = room.cmd_rx.recv() => {
                match cmd {
                    Some(c) => room.enqueue_inbound(c),
                    None => break,
                }
            }
            _ = tick_interval.tick() => {
                room.drain_inbound();
                let started = Instant::now();
                room.simulate_one_tick();
                room.metrics.tick_duration.record(started.elapsed());

                tick_counter = tick_counter.wrapping_add(1);
                if tick_counter % 3 == 0 {     // 60/3 = 20Hz
                    room.broadcast_snapshot();
                }
                room.broadcast_pending_events();
                room.reap_grace();
                if room.should_shutdown() { break; }
            }
        }
    }
    room.cleanup();
}
```

Inbound messages buffer between ticks; simulation stays in lockstep with its own clock regardless of message-arrival jitter. `MissedTickBehavior::Burst` plus a `max_steps_per_real_frame = 4` guard prevents catch-up loops from compounding.

`biased` in the `select!` macro favors draining inbound commands before ticking — important because input drift up to 16ms before being applied is acceptable, but tick drift causes visible rubber-banding.

### Per-room state

```rust
pub struct Room {
    id: RoomId,
    code: String,
    config: RoomConfig,
    state: GameState,
    inputs: HashMap<PlayerId, InputBuffer>,
    rng: Pcg64,
    tick: u32,
    players: Vec<PlayerHandle>,
    cmd_rx: mpsc::Receiver<RoomInbound>,
    pending_events: Vec<GameEvent>,
    snapshot_history: VecDeque<(u32, SnapshotPayload)>,   // last 64 for delta base
    grace_disconnects: HashMap<PlayerId, GraceTimer>,
    pause_state: PauseState,
    encode_buf: Vec<u8>,
    metrics: RoomMetrics,
}

#[derive(Default)]
pub struct InputBuffer {
    pub latest: PlayerInput,
    pub last_tick: u32,
}
```

### Simulation function shape

```rust
// server/src/sim/mod.rs
pub fn simulate_tick(
    state: &mut GameState,
    inputs: &PlayerInputs,
    dt: Fxp,
    rng: &mut Pcg64,
    events: &mut Vec<GameEvent>,
) {
    ship::update_all(&mut state.ships, inputs, dt, events);
    enemy::update_all(&mut state.enemies, &state.ships, dt, rng, events);
    asteroid::update_all(&mut state.asteroids, dt, events);
    bullet::integrate(&mut state.bullets, dt);
    collision::detect_and_resolve(state, events);
    drops::update(&mut state.drops, &state.ships, dt, events);
    wave::tick(&mut state.wave, &mut state.enemies, dt, rng, events);
    cull::cull_dead(state);
}
```

Ship physics use fixed-point `Fxp` (typically a `Fixed<I32, U16>` — 16 fractional bits, ~15 µm precision over a 32k-meter playfield). Movement integration on both Rust and JS produces bit-identical positions; client-side prediction therefore never drifts from server reconciliation due to floating-point variance.

Other subsystems (enemy AI heuristics, drop attraction smoothing, wave spawn timing) use `f32` because cross-language determinism isn't needed there — the client doesn't predict enemies or drops; it interpolates server snapshots.

### Room state machine

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomState {
    WaitingForPlayers,    // newly created; lobby; up to 30s
    Playing,              // wave in progress
    WaveTransition,       // wave clear; awaiting picks
    Paused,               // all players in grace
    Closing,              // marked for cleanup
}
```

The compiler enforces every transition site handles every variant — the type-system payoff for a state-heavy server.

---

## Drop-in / drop-out implementation

Identical semantics to the Node plan; the Rust implementation follows the same shape.

### Drop-in: between waves

1. Player joins via matchmaking → `RoomActor::handle_join`.
2. Room is in `WaveTransition` → join succeeds at the next free slot.
3. Server sends `RoomJoined` with current snapshot, wave info, RNG seed.
4. New player participates in the next wave-start with everyone else.

### Drop-in: mid-wave

1. Player joins → room is `Playing`.
2. Server runs `find_safe_spawn(state)`:
   - Sample 32 candidate points across the playfield (Halton sequence).
   - For each candidate, compute distance to nearest enemy, asteroid, hostile bullet.
   - Pick the candidate with the largest minimum distance.
3. Server creates the new ship there with a 3-second invulnerability and a warp-in animation event.
4. New player receives a full snapshot + the spawn event.
5. Server broadcasts `PeerJoined` to existing players; their clients render the warp-in.

### Drop-out: voluntary

1. Player sends `LeaveRoom`.
2. Room emits warp-out event → broadcast → 1s warp-out animation → remove ship from state → broadcast `PeerLeft`.
3. The leaving player's drops on the ground stay (free for everyone).
4. Difficulty re-scales at the next wave-start.

### Drop-out: connection lost

1. `ConnectionTask` exits (WS error).
2. Room receives `RoomInbound::Disconnected { player_id }`.
3. Room marks the player's ship `frozen_invulnerable` in place; starts a 30s grace timer.
4. If a reconnect arrives within 30s with matching session → un-freeze; full snapshot to catch up.
5. Otherwise → promote to voluntary leave path.

### All-disconnect: room pause

1. If all players grace-out, room transitions to `Paused`.
2. No tick runs while paused (zero CPU cost).
3. If anyone reconnects within 5 minutes, room resumes.
4. After 5 minutes, room is destroyed and matchmaking removes it from the registry.

### Code sketch — safe spawn

```rust
// server/src/room/safe_spawn.rs
use glam::Vec2;

pub fn find_safe_spawn(state: &GameState) -> Vec2 {
    const SAMPLES: usize = 32;
    let mut best = (Vec2::ZERO, 0.0_f32);
    let halton = HaltonSequence::new(2, 3);
    for i in 0..SAMPLES {
        let (hx, hy) = halton.point(i);
        let p = Vec2::new(hx * state.field.width, hy * state.field.height);
        let d = state.enemies.iter().map(|e| e.pos.distance(p))
            .chain(state.asteroids.iter().map(|a| a.pos.distance(p)))
            .chain(state.bullets.iter().filter(|b| b.hostile).map(|b| b.pos.distance(p)))
            .fold(f32::INFINITY, f32::min);
        if d > best.1 { best = (p, d); }
    }
    best.0
}
```

---

## Matchmaking

Single-process, single-instance. Holds the registry of active rooms.

```rust
// server/src/matchmaking/mod.rs
pub struct MatchmakingActor {
    rooms: DashMap<RoomId, RoomHandle>,
    by_code: DashMap<String, RoomId>,
    cfg: Arc<Config>,
}

impl MatchmakingActor {
    pub async fn handle_msg(
        &self,
        player_id: PlayerId,
        msg: ClientMsg,
        out_tx: mpsc::Sender<ServerMsg>,
    ) -> Option<RoomHandle> {
        match msg {
            ClientMsg::QuickMatch        => self.quick_match(player_id, out_tx).await,
            ClientMsg::BrowseRooms       => { self.browse(out_tx).await; None }
            ClientMsg::CreateRoom { name, public, max_players } =>
                self.create(player_id, name, public, max_players, out_tx).await,
            ClientMsg::JoinRoom { room_id }     => self.join(room_id, player_id, out_tx).await,
            ClientMsg::JoinRoomByCode { code }  => self.join_by_code(&code, player_id, out_tx).await,
            _ => None,
        }
    }

    async fn quick_match(&self, p: PlayerId, out: mpsc::Sender<ServerMsg>) -> Option<RoomHandle> {
        let candidate = self.rooms.iter()
            .filter(|r| r.value().is_joinable())
            .min_by_key(|r| r.value().wave());
        let room = match candidate {
            Some(r) => r.value().clone(),
            None => self.spawn_room(RoomConfig::default_quickmatch())?,
        };
        room.send(RoomInbound::Join { player_id: p, out }).await.ok()?;
        Some(room)
    }
}
```

Browse, code-join, and private rooms layer on the same primitives. Codes use a confusables-free alphabet via `nanoid::nanoid!(6, &CODE_ALPHABET)`.

---

## State, pools, and hot paths

Rust performance is good "for free" but excellent with care. The patterns:

### Contiguous storage

`Vec<Bullet>` is a pointer + len + cap, then 1024 bullets packed. Iterating is cache-friendly:

```rust
pub struct Bullets {
    pub pos: Vec<FxpVec2>,
    pub vel: Vec<FxpVec2>,
    pub owner: Vec<PlayerId>,
    pub weapon: Vec<WeaponId>,
    pub lifetime: Vec<f32>,
    pub alive: Vec<bool>,
}

impl Bullets {
    pub fn integrate(&mut self, dt: Fxp) {
        for i in 0..self.alive.len() {
            if !self.alive[i] { continue; }
            self.pos[i].x += self.vel[i].x * dt;
            self.pos[i].y += self.vel[i].y * dt;
            self.lifetime[i] -= dt.to_f32();
            if self.lifetime[i] <= 0.0 { self.alive[i] = false; }
        }
    }
}
```

This is the SoA (Struct of Arrays) layout, well-suited for SIMD vectorization. LLVM auto-vectorizes the integrate loop with `-C target-cpu=native`.

### Free-lists for entity slots

Bullets, enemies, asteroids, drops are pooled. Slot allocation:

```rust
pub struct Pool<T> {
    items: Vec<T>,
    alive: Vec<bool>,
    free: Vec<usize>,
}

impl<T: Default> Pool<T> {
    pub fn alloc(&mut self) -> usize {
        match self.free.pop() {
            Some(i) => { self.alive[i] = true; i }
            None => {
                let i = self.items.len();
                self.items.push(T::default());
                self.alive.push(true);
                i
            }
        }
    }
    pub fn free(&mut self, i: usize) {
        if self.alive[i] {
            self.alive[i] = false;
            self.free.push(i);
        }
    }
}
```

Same shape on both sides; client and server pools stay parallel.

### Snapshot encoding into a reused buffer

```rust
impl Room {
    fn broadcast_snapshot(&mut self) {
        self.encode_buf.clear();
        let payload = SnapshotPayload::from_state(&self.state, self.tick);
        let msg = ServerMsg::Snapshot { tick: self.tick, base_tick: None, payload };
        bincode::serialize_into(&mut self.encode_buf, &msg).expect("encode");
        let bytes = self.encode_buf.as_slice();
        for p in &self.players {
            if p.lagging.load(Ordering::Relaxed) { continue; }
            let _ = p.tx.try_send(ServerMsg::Snapshot { /* re-encode unwise; share via Bytes */ });
        }
    }
}
```

For v1 we re-encode per recipient to keep the channel type as `mpsc<ServerMsg>`. Post-v1 optimization: switch the per-room broadcast to `Bytes` so a single encoded snapshot fans out by ref-count. Saves ~3× snapshot CPU at 4-player scale.

### Why no ECS yet

`hecs` or `bevy_ecs` would shine if entity counts went into the thousands or query patterns got complex. For ~250 entities per room with direct `Vec` iteration, the ECS abstraction is overhead. Revisit if v2 features push entity counts up.

---

## Configuration

Same shape as the Node plan; loaded from env, CLI overrides env.

| Variable | Default | Description |
|---|---|---|
| `RAINBOIDS_BIND_ADDR` | `0.0.0.0:8443` | WS listen socket |
| `RAINBOIDS_TLS_CERT_PATH` | unset | If unset, plaintext WS (front with nginx) |
| `RAINBOIDS_TLS_KEY_PATH` | unset | Companion to cert |
| `RAINBOIDS_LOG_LEVEL` | `info` | `info` / `debug` / `trace` |
| `RAINBOIDS_LOG_FORMAT` | `json` | `json` (prod) / `pretty` (dev) |
| `RAINBOIDS_MAX_ROOMS` | `200` | Hard cap |
| `RAINBOIDS_MAX_PLAYERS_PER_ROOM` | `4` | |
| `RAINBOIDS_TICK_HZ` | `60` | Sim tick rate |
| `RAINBOIDS_SNAPSHOT_HZ` | `20` | Snapshot broadcast rate |
| `RAINBOIDS_GRACE_SECS` | `30` | Disconnect grace |
| `RAINBOIDS_PAUSE_TIMEOUT_SECS` | `300` | All-disconnect destruction timeout |
| `RAINBOIDS_METRICS_BIND` | `127.0.0.1:9090` | Prom exporter; internal only |
| `RAINBOIDS_ADMIN_TOKEN` | unset | Static token for `/admin/*` |
| `RAINBOIDS_TOKIO_WORKERS` | `auto` | Threads in tokio runtime; `auto` = `num_cpus` |

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
[ rainboids-server ] ── single ELF, systemd-managed
```

### systemd unit

```ini
[Unit]
Description=Rainboids multiplayer server
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/rainboids/env
ExecStart=/usr/local/bin/rainboids-server
Restart=on-failure
RestartSec=5s
User=rainboids
Group=rainboids
LimitNOFILE=65536
MemoryMax=512M
ProtectSystem=strict
PrivateTmp=true
NoNewPrivileges=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

Note: `MemoryMax=512M` is a third of the Node equivalent because Rust runs comfortably in that much.

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

Tag-driven. Pushing `server-vX.Y.Z` triggers GitHub Actions:

1. `cargo fmt --check`
2. `cargo clippy -- -D warnings`
3. `cargo test --workspace`
4. `cargo build --release`
5. `strip target/release/rainboids-server` → ~3 MB binary.
6. Upload binary to GitHub Releases.
7. Deploy script: SSH, copy binary, `systemctl restart rainboids-server`.

Restart cost: ~1s. Reconnect logic absorbs it. Players see a brief "reconnecting…" toast.

### Sizing

- 1 vCPU / 1 GB RAM box: ~150 concurrent rooms.
- 2 vCPU / 2 GB RAM box: ~400 concurrent rooms.

Numbers firm up after load tests.

### Container variant (optional)

```dockerfile
# server/deploy/Dockerfile
FROM rust:1.79-slim AS build
WORKDIR /src
COPY . .
RUN cargo build --release && strip /src/target/release/rainboids-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/rainboids-server /usr/local/bin/
EXPOSE 8443 9090
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/rainboids-server"]
```

~50 MB image. Static binary; no runtime dependencies.

---

## Observability

### Metrics (`metrics-exporter-prometheus`)

Counters:
- `rainboids_rooms_created_total`
- `rainboids_rooms_destroyed_total`
- `rainboids_players_joined_total`
- `rainboids_players_left_total{reason}`
- `rainboids_messages_received_total{kind}`
- `rainboids_messages_sent_total{kind}`
- `rainboids_decode_errors_total{kind}`

Gauges:
- `rainboids_rooms_active`
- `rainboids_players_online`
- `rainboids_players_in_grace`
- `rainboids_tokio_alive_tasks`
- `rainboids_memory_resident_bytes`

Histograms:
- `rainboids_tick_duration_seconds`
- `rainboids_snapshot_size_bytes`
- `rainboids_input_age_ms`
- `rainboids_room_lifetime_seconds`

### Logging

Structured JSON via `tracing-subscriber` JSON formatter. Per-event fields: `room_id`, `player_id`, `tick`, `event`. Level `info` in prod; per-room debug toggleable via `/admin/room/:id/log_level`.

### Admin endpoints

- `GET /admin/rooms` — active rooms + player counts + current wave + tick p50/p99.
- `POST /admin/room/:id/kick/:player`.
- `POST /admin/room/:id/log_level`.

All gated by static admin token from env, IP-restricted at nginx.

### Profiling

`cargo flamegraph --bin rainboids-server` produces a perf-based flamegraph for any local profiling session. In production, a 30-second `perf record` on the running pid exports a flamegraph at any time without restart.

---

## Testing

### Unit (`cargo test`)

Each `sim/*.rs` module has unit tests against pure functions.

Examples:
- `ship.rs` test: `update_ship(state, input, dt)` produces expected position delta.
- `collision.rs` test: bullet-vs-asteroid hit produces expected event sequence.
- `wave.rs` test: wave 1 schedule with seed 42 produces expected enemy spawn times.

### Integration (`tests/integration_*.rs`)

Spawn the server in-process; connect synthetic WS clients via `tokio-tungstenite`.

- `integration_room.rs` — create room, two clients join, simulate inputs, verify state propagation.
- `integration_matchmaking.rs` — quick-match returns same room for two simultaneous joiners; codes round-trip; browse listing matches reality.
- `integration_dropin.rs` — third client joins mid-wave; verifies safe spawn placement and invuln window.
- `integration_grace.rs` — kill connection mid-game, reconnect within 30s, verify state resumption; let grace expire and verify clean leave.
- `integration_lag.rs` — synthetic slow-client (delayed `try_send` consumer); verify backpressure handling and eventual kick.

### Cross-language parity (`integration_parity.rs`)

The headline new test class for Rust. Detailed fully in `Rust Multiplayer Engine and Client.md` — summary here.

The harness:

1. Generates a sequence of `(seed, input_log)` fixtures.
2. Runs the Rust `simulate_tick` over each fixture for N ticks; serializes the resulting `GameState` to a deterministic JSON.
3. Runs the JS `simulateTick` over the same fixture for the same N ticks; serializes to JSON.
4. Diffs the two. Any divergence in the prediction-relevant subset (ship physics, RNG state) is a fatal test failure.

Fixtures are checked into `schema/snapshots/`. CI runs the harness on every PR; a divergence blocks merge.

### Golden replay tests (`insta`)

`insta`-managed snapshots pin invariants:

- "Wave 1 with seed 42 and a fixed input log produces this final state hash."
- "Kill an asteroid, get this exact event sequence."
- "Bullet trajectory at `(t=0, vx=100, vy=0)` after 60 ticks lands at this position."

Run on every CI; intentional changes regenerate the fixture; reviewers see the diff.

### Load (`benches/loadgen.rs`)

A separate binary opens N WS connections and pushes synthetic inputs. Used to characterize:

- CPU per concurrent room.
- Memory per concurrent room.
- Outbound bandwidth per player.
- Tail latency under load.

Pre-public-beta target: 200 concurrent rooms (800 players) at <30% CPU on a 2-vCPU box.

---

## Build & CI

### Local dev

```bash
cd server
cargo run                    # debug build, ~5s warm
cargo run --release          # release build, ~30-60s cold

# hot reload
cargo install cargo-watch
cargo watch -x run
```

Rebuild on `js/sim/**` change isn't applicable — the JS side is the client; server cares only about its own crate. But schema changes (`schema/protocol.toml`) trigger a regen of `server/src/protocol/generated.rs` via a `build.rs` step.

### CI (GitHub Actions)

Jobs:

- `client` — existing browser test job.
- `client-sim-tests` — `npm run test:sim` (runs `js/sim/*.test.js`).
- `server-fmt` — `cd server && cargo fmt --check`.
- `server-clippy` — `cd server && cargo clippy --all-targets -- -D warnings`.
- `server-test` — `cd server && cargo test --workspace`.
- `parity` — runs the Rust↔JS cross-replay harness; fails if any fixture diverges.
- `server-build` — `cd server && cargo build --release` (cached); produces release artifact.
- `bench` (nightly only) — `cargo bench`; posts trend chart.

The `parity` job is the lynchpin of correctness. A sim rule change that touches `js/sim/ship.js` but not `server/src/sim/ship.rs` (or vice versa) fails CI before reaching review. Detailed in the engine doc.

---

## Comparison: Node server vs Rust server

A side-by-side mirror of the table in `NodeJS Server.md`, with both sides honestly assessed.

| Axis | Node plan | Rust plan |
|---|---|---|
| **Server↔client sim drift risk** | None. One implementation. | Real. Two implementations. Mitigated by parity harness. |
| **Lines of code (server src)** | ~2,500–4,000 (rest shared with client) | ~6,000–10,000 (full sim reimpl) |
| **Languages a contributor must know** | 1 (JS) | 2 (JS + Rust) |
| **Hot-reload dev loop** | <500ms (`node --watch`) | ~5–15s (`cargo watch`) |
| **Steady-state CPU per 100 rooms** | ~9–12% on 2 vCPU | ~3% on 2 vCPU |
| **Steady-state memory per 100 rooms** | ~40 MB | ~5 MB |
| **p99 tick time (no GC)** | ~600 µs | ~150 µs |
| **p99 tick time (worst case)** | ~5 ms (rare GC) | ~150 µs (no GC) |
| **Tail-latency stability** | occasional outliers | flat |
| **Deploy artifact** | Node + node_modules + script | single 3MB ELF |
| **Operational complexity** | Node version pin, npm install on server | binary copy; nothing else |
| **Crash safety** | high (uncaught exceptions handled) | very high (compiler-enforced) |
| **Determinism for in-process replay** | tight (V8 FP) | tighter (deterministic by language) |
| **Cross-language determinism (for prediction)** | not needed | requires fixed-point or libm care |
| **Type safety** | gradual via JSDoc / opt-in TS | strong static |
| **Compile-time correctness** | none | exhaustive enum matches, lifetimes, etc. |
| **Profiling tooling** | `--prof`, `clinic.js` | `perf`, `flamegraph`, `dhat`, `tokio-console` |
| **Memory leak risk** | possible (accidental retainers) | very rare (drop-on-scope) |
| **Time-to-first-multiplayer-prototype** | ~5 weeks | ~10 weeks |
| **Time-to-add a new gameplay rule** | edit one file | edit two files + add parity test |
| **Risk of "we run out of CPU"** | low | very low |
| **Risk of "client and server disagree"** | very low | medium without rigor; low with rigor |
| **Long-term maintenance properties** | good with discipline | great by default |

**Net:** Rust trades shipping speed and a managed-risk drift class for raw efficiency, ops simplicity, and long-term maintenance properties. The "right" answer depends on which kind of cost the project budget can absorb.

---

## Risks and open questions

### Unique-to-Rust risks

- **Cross-language determinism for prediction.** `f32::sin` differs between Rust libm and V8 in the last 1–2 ULPs. Without care, predicted ship state can drift from the server snapshot in ways the reconciliation handles but doesn't make invisible. Mitigation: fixed-point math for the prediction-relevant subset of physics; libm-free trig via either CORDIC tables or polynomial approximation, both implementations sharing the same coefficients. Detailed in the engine doc.
- **Schema drift between Rust and JS.** Adding a new `GameEvent` variant in Rust and forgetting the JS decoder is silent until the client crashes. Mitigation: codegen the JS codec from the Rust enum (or vice versa); failing that, a parity test that exhaustively round-trips every variant.
- **Compile-time fatigue.** 30s incremental rebuilds during heavy iteration sessions. Mitigation: `mold` linker (~5× faster link), `cargo-watch` with `-x check` instead of `-x run` for the no-bin-rebuild path, careful crate splitting.
- **Borrow checker friction during sim porting.** The first Rust port of `simulateTick` will fight the borrow checker over mutually-referenced entities. Mitigation: use indices instead of references in the simulation step (e.g. `state.bullets.get_mut(i)` not `&mut bullet`); split-borrow patterns; ECS if it gets gnarly.
- **Two-language CI complexity.** Two install steps, two test runners, one parity harness. More moving pieces; harder to keep green during major refactors.

### Risks shared with the Node plan

- **Engine refactor is invasive.** Same risk as Node plan; same mitigation (Phase 1 ships a no-functional-change refactor first).
- **Hosting cost is small but ongoing.** $5–10/mo. Same.
- **Wave-pool spawn timing.** Server-driven; tick-based timers replace `setTimeout`. Same.
- **Mobile players on flaky networks.** Same. Grace timer absorbs.

### Open questions

- **Schema source of truth: hand-mirrored or codegen?** Codegen is the disciplined answer (`schema/protocol.toml` → both sides). Hand-mirroring is faster initially. Recommendation: hand-mirror for Phase 2–3 to validate the protocol shape, then codegen before public beta. Detailed in the engine doc.
- **`tokio` vs `async-std`?** `tokio` — bigger ecosystem, better tools, default choice.
- **`bincode` vs `postcard` vs `flatbuffers`?** `bincode` — sufficient, wider tooling. Revisit only if wire bytes become a bottleneck (they won't).
- **Multi-process sharding when?** Threshold: when one process exceeds 60% CPU during target-load tests, or when memory growth signals leak.
- **`hecs`/`bevy_ecs` ever?** Probably never for v1. Direct `Vec` storage is fine at 250 entities.

---

## What we explicitly choose against

For symmetry with the Node plan's section:

- **Node server.** Better drift profile but worse perf headroom and ops profile. Acceptable if the team has more JS bandwidth than Rust bandwidth; chosen against here for the long-term property set.
- **Go server.** Sensible alternative; easier learning curve; loses the same code-sharing as Rust. If we're going to pay the two-language cost, Rust's properties are stronger than Go's.
- **C++ server.** Same perf, much worse safety story. Ruled out.
- **WebRTC DataChannels.** Same reasoning as in the original `Multiplayer Planning – 2026-05-06.md`: latency wins are real but operational cost (TURN, signaling, fallbacks, debugging tooling) is too high for a PvE shooter.
- **P2P host-authoritative.** Same reasoning. Host migration is a frontier of bugs.
- **Lockstep deterministic simulation.** Rejected because we have non-deterministic spawn timing and floating-point variability that would need an order more rigor.
- **Rollback netcode.** Overkill for PvE.
- **Multi-region servers in v1.** Latency to a single server is acceptable; multi-region is later.
- **Custom binary codec instead of `bincode`.** `bincode`'s schema-via-derive is too good to leave behind; swap only if profiling demands it.
- **`actix` instead of `axum`.** `axum` integrates more cleanly with `tower` middleware and the `tokio` ecosystem.

---

## Implementation milestones

Solo-dev pace, anchor numbers, not commitments. Compares against the Node plan's 10-week schedule.

| Week | Goal |
|---|---|
| 1 | JS engine refactor steps 1–2 (extract `simulateTick`, extract effect emission). Solo play unchanged. |
| 2 | JS engine refactor steps 3–5 (input capture, render-reads-state, parity verification). `js/sim/` clean; replay-determinism test added. |
| 3 | Schema source of truth (`schema/`); hand-mirror initial protocol enums; codec parity test green. |
| 4 | Rust scaffolding: `cargo new`, deps, `axum` Hello-World WS endpoint, protocol enums, codec encode/decode, Hello/Welcome handshake. |
| 5 | ConnectionTask + MatchmakingActor (no rooms yet). Title-screen Quick Match button hooks up to "send Hello" and lights green. |
| 6 | RoomActor scaffolding. Tick loop. Empty `simulate_tick` placeholder. Snapshot fanout to connected clients. Two clients see each other connected to the same room. |
| 7–9 | Port `simulate_tick` from JS to Rust: ships, enemies, asteroids, bullets, collisions, drops, waves. Cross-language parity harness green for ship physics. End of block: 1-player "online" run plays the same as solo. |
| 10 | True multi-player: 2-player co-op end-to-end. Both players see each other; both can damage shared enemies. |
| 11 | Drop-in / drop-out: mid-wave joining, safe spawn, drift-out animation, grace timer. |
| 12 | Co-op design: revives, individual gold/score, shared wave-clear gate, friendly fire off, drop attribution. |
| 13 | Matchmaking polish: Quick Match, Browse, code-based private rooms. Lobby UX. |
| 14 | Observability: metrics, structured logs, admin endpoint. Initial load tests. |
| 15 | Closed beta: deploy to single VPS, invite 8–12 testers, gather telemetry. |
| 16 | Beta-feedback patch cycle. Ship public beta. Codegen-replace hand-mirrored schemas. |

The Rust path adds **~6 weeks** vs the Node path. The bulk is "port simulate_tick" (weeks 7–9). The schema work in week 3 and the parity-test plumbing across weeks 4–9 are the visible Rust tax.

---

## Acceptance criteria for "v1 multiplayer ships"

The minimum set:

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
- [ ] **Parity harness in CI green:** Rust and JS simulations agree byte-for-byte on every prediction-relevant fixture.
- [ ] **Wire codec parity green:** every `ServerMsg` and `GameEvent` variant round-trips Rust→JS→Rust without loss.
- [ ] **p99 tick time** under 1ms over a 1-hour load test at 50 rooms.
- [ ] **Memory residency** stays bounded over a 24-hour soak test.

The last four bullets are the new ones, all about defending against the drift class Rust chose to take on.

---

## What v1 explicitly defers

- Per-region servers and cross-region matchmaking.
- Persistent accounts.
- Friend lists, parties, direct invites.
- Voice chat.
- Ranked or skill-based matchmaking.
- Mobile / cross-platform multiplayer.
- Replays.
- Spectator mode.
- Anti-cheat beyond "server is authoritative."
- Custom rooms with modded waves, modded difficulty, or non-default rules.
- Cosmetic ship customization beyond per-slot palette colors.
- Switching `bincode` for a more compact codec.
- Multi-process sharding.
- ECS storage.
- WebRTC fallback transport.

---

## Bottom line

A Rust authoritative server speaking WebSocket, with client-side prediction for the local ship over a fixed-point physics subset and snapshot interpolation for everything else, is the highest-headroom path to shipping co-op Rainboids — *if* the project budget can absorb the cross-language cost.

The properties Rust delivers — bounded p99 tick time, single-binary deploys, multi-threaded async, type-checked state machines, contiguous data layouts — are exactly the properties a long-running game server wants. They compound for years.

The cost is real and ongoing: the simulation lives in two languages, the wire protocol lives in two languages, every gameplay change costs two edits. The discipline that contains this cost — schema codegen, parity harness in CI, fixed-point math for the prediction-relevant subset — is itself an engineering investment.

Build it in Rust if you intend to operate this server for years and the team has Rust capacity. Build it in Node if you want to ship faster and accept higher resource overhead. Both are reasonable. The companion document `Rust Multiplayer Engine and Client.md` details the engine and client work that implements either choice — with the Rust-specific cross-language sections layered in.
