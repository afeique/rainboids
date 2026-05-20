# rainboids-server

Authoritative WebSocket multiplayer server for Rainboids — Rust implementation
of the design in [`docs/Multiplayer Rust Server – 2026-05-07.md`](../docs/Multiplayer%20Rust%20Server%20%E2%80%93%202026-05-07.md).

## Status: scaffold

This crate is the **week 4–6 scaffold** from the plan: transport, protocol,
matchmaking, and per-room actor with a 60Hz tick loop are wired up and
compile. Simulation modules (`src/sim/*`) are stubs — porting `simulateTick`
from JS is weeks 7–9.

What works today:

- `axum` HTTP server with `/health` and `/ws` upgrade.
- Bincode wire codec (mirror of the JS encoder, hand-mirrored for v1).
- Hello / version handshake; `Welcome` issuance.
- `Matchmaker` (Quick Match, Browse, Create, Join, JoinByCode).
- `RoomActor` with 60Hz tick + 20Hz snapshot fanout, grace-timer disconnect
  handling, lagging-client detection.
- Prometheus metrics exporter on a separate listener.
- JSON / pretty `tracing` logs.
- Clean `Ctrl-C` / `SIGTERM` graceful shutdown.

What's deliberately stubbed:

- All `sim/*` subsystem updates are no-ops. Ship physics is the only one
  with real integration code, and it uses `f32` rather than fixed-point.
  Cross-language determinism (the `fxp` module) is left as a typed sketch.
- No reconnect-by-session logic yet (the protocol carries `session: Uuid`,
  but the registry that maps session → room is not built).
- No admin endpoints, no delta snapshots, no ECS, no shared `Bytes`
  broadcast — all called out in the plan as post-v1.

## Layout

```
server/
├── Cargo.toml
├── env.example
├── deploy/                       systemd, nginx, Dockerfile
├── src/
│   ├── main.rs                   entry: CLI, config, signals, listen
│   ├── config.rs                 env + CLI -> Config
│   ├── error.rs                  AppError, Result
│   ├── server/
│   │   ├── http.rs               axum router + WS upgrade
│   │   ├── connection.rs         per-WS task; hello, route to MM/room
│   │   └── auth.rs               session token issuance
│   ├── protocol/
│   │   ├── mod.rs                ClientMsg / ServerMsg / GameEvent
│   │   ├── codec.rs              bincode helpers
│   │   └── version.rs            WIRE_VERSION + SIM_VERSION
│   ├── matchmaking/mod.rs        Matchmaker (DashMap-backed registry)
│   ├── room/
│   │   ├── mod.rs                RoomActor + tick loop
│   │   ├── handle.rs             RoomHandle (mpsc sender wrapper)
│   │   ├── lifecycle.rs          RoomState enum, GraceTimer
│   │   ├── snapshot.rs           snapshot construction
│   │   └── safe_spawn.rs         Halton-sequence safe-spawn picker
│   ├── sim/                      authoritative simulation (stubs)
│   │   ├── mod.rs                simulate_tick top-level
│   │   ├── state.rs              GameState
│   │   ├── input.rs              PackedInput → PlayerInput
│   │   ├── ship.rs               (real f32 integrator)
│   │   ├── enemy.rs / asteroid.rs / bullet.rs / wave.rs
│   │   ├── collision.rs / drops.rs / difficulty.rs
│   │   ├── rng.rs                seeded PCG64
│   │   └── fxp.rs                fixed-point sketch (Q16.16)
│   ├── obs/
│   │   ├── metrics.rs            Prometheus exporter
│   │   └── tracing.rs            tracing-subscriber setup
│   └── util/
│       ├── id.rs                 typed entity ids
│       └── time.rs               wall-clock helpers
└── tests/                        (integration tests TBD — week 5+)
```

## Run

```bash
cd server
cp env.example .env
cargo run
```

Default listen: `0.0.0.0:8443` (plaintext WS — front with nginx for TLS in
prod). Metrics: `http://127.0.0.1:9090/metrics`.

```bash
# release build
cargo build --release
strip target/release/rainboids-server     # ~3 MB binary

# tests
cargo test
```

## Wire protocol parity

Bincode 1.x with little-endian fixed-int encoding. The JS encoder/decoder
must use the same configuration — see the *Multiplayer Rust Client Engine*
plan doc (`docs/Multiplayer Rust Client Engine – 2026-05-07.md`) for the
codegen path that replaces the v1 hand-mirror.

`WIRE_VERSION` and `SIM_VERSION` are bumped together when breaking.
The Hello handshake closes the socket with `ErrCode::Version` if either
side disagrees.

## Deploy

`deploy/rainboids-server.service` is a hardened systemd unit; the binary
sits at `/usr/local/bin/rainboids-server` with `EnvironmentFile=/etc/rainboids/env`.
`deploy/nginx.conf.example` terminates TLS and proxies `/ws` upstream.
`deploy/Dockerfile` produces a ~50 MB Debian-slim image with the static
binary.

## What ships next

Per the plan's milestones:

- **Week 5**: integration tests for room create/join, matchmaking,
  drop-in, grace, lag.
- **Week 6**: hooked up to the JS client through a basic `ConnectionTask`
  → `Welcome` round-trip from the title screen.
- **Weeks 7–9**: port `simulateTick` from `js/sim/` into `src/sim/`, with
  the cross-language parity harness in CI.
