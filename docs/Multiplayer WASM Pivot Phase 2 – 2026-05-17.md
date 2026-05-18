## Implementation Status (2026-05-17)

**Phase 2 is feature-complete in code.** Two `/mp` browser tabs can
connect to a running `rainboids-server` and see each other's ships
move via WASM-side prediction + 20Hz server snapshot interpolation.
What remains is automated two-tab regression testing, performance
profiling under load, and the Phase 4 prediction-reconciliation work.

The design sections below are preserved as the historical spec.
Where the shipped implementation diverged from the spec, the
divergence is captured here, NOT inline in the design sections.
Notable shifts from the original plan:

- **Wire format is binary bincode, not tagged JSON.** Decided
  during Wave 1 of implementation. `mp1::codec` (bincode 1.x,
  externally-tagged enums, fixint LE) replaces the `serde_json`
  text-frame approach. Cost: a hand-rolled JS decoder
  (`wire-codec.js`, ~325 lines). Benefit: ~6× smaller wire +
  byte-exact match with the legacy `protocol::codec` conventions
  + no `deserialize_any` dependency.
- **All `mp1` scalars are f64, not f32.** Eliminates implicit
  widening/narrowing at the wasm-bindgen boundary so the WASM
  client and native server can do byte-identical math in Phase 4
  reconciliation.
- **`Snapshot.acked_input_tick` wire field added.** Phase 2
  doesn't consume it; Phase 4 reconciliation will.
- **Module names.** Final layout is `server-bin/src/mp1_room.rs` +
  `mp1_connection.rs` (sibling of `server/`), not the
  spec's `server/mp_connection.rs` + `mp_protocol.rs`. Wire types
  live in `sim/src/mp1/wire.rs`, owned by the sim crate so both
  native + WASM consumers share one definition.
- **Tier 1 debug logging** behind `?mp-debug=1` URL flag on the
  client — not in the original spec but a cheap quality-of-life
  add during testing.

### Shipped

| Version | Subject | Files |
|---|---|---|
| `mp 0.3.0` | f64 + binary bincode wire (sim + WASM bindings) | `server/sim/src/mp1/{state,input,ship,wire,codec,mod}.rs`, `server/client-wasm/src/lib.rs` |
| `mp 0.3.1` | server-bin `/mp/ws` room actor + connection | `server/server-bin/src/{mp1_room,mp1_connection}.rs` + `server/http.rs` / `main.rs` / `lib.rs` wiring |
| `mp 0.3.2` | client WS transport + remote-ship rendering | `js/mp/{wire-codec,mp-ws,mp-engine,mp-renderer}.js` |

### Deferred to later phases

- **Prediction reconciliation** — Phase 4. Local prediction in `/mp`
  may drift from server truth within a session; not snap-corrected.
  The `Snapshot.acked_input_tick` field is wire-ready.
- **Multi-room / matchmaking** — Phase 5. Single global room for now.
- **Reconnect with grace** — Phase 5. Tab-close mints a fresh slot.
- **Enemies / asteroids / bullets** — Phase 3. Ships-only for now.
- **Delta-encoded snapshots** — Phase 5+. Full snapshot every 20Hz
  is fine at Phase 2 wire volume.
- **TLS / deploy** — Phase 5+. Localhost-only `ws://` for now.
- **Application-level ping/pong** — Phase 5. Tab-close = clean
  socket-close drop for Phase 2.
- **Cheat protection / input clamping** — Phase 5+. Server trusts
  client input verbatim.

### Tests

| Layer | Suite | Status |
|---|---|---|
| Rust unit | `cargo test -p rainboids-sim` | 11 pass (6 JSON + 5 bincode round-trips) |
| Rust integration | `cargo test --workspace` | 54 pass total, zero regressions in legacy `/ws` suite |
| WASM build | `npm run wasm:build:dev` | succeeds (~7s incr, ~135KB output) |
| Browser Phase 1 | `tests/qa/12-mp-smoke.spec.js` | 4 tests (single-client) |
| Browser Phase 2 | `tests/qa/13-mp2-ws.spec.js` | pending (sibling subagent in flight) |

### To manually verify the two-tab demo

```
npm run dev           # starts http-server + cargo + wasm-pack
# wait for the cargo build (~30s cold)
# open TWO http://localhost:8090/mp tabs side by side
# add ?mp-debug=1 to either for DevTools console logging
```

Within a few seconds both tabs should show their own white ship +
the other player's colored ship + a `P<n>` label. Move with WASD;
the other tab follows ~100 ms behind via interpolation.

### Open questions — status after implementation

The "Open questions for the user" section at the bottom of this doc
was answered in the course of implementation. Status as of `mp 0.3.2`:

1. **Room policy (single global room)** — ✅ resolved. Shipped as
   the spec's default: one global `Mp1Room` actor, all `/mp/ws`
   connections join it. Per-URL-hash rooms deferred to Phase 5
   matchmaking.
2. **Spawn positions** — ⏳ deferred to Phase 4. `Welcome.spawn_x/y`
   IS sent by the server, but the WASM `World` has no position
   setter yet, so the client logs but does not apply it. Local
   prediction starts at the WASM default `(960, 540)`. Snap-to-
   server-truth lands with Phase 4 reconciliation.
3. **Friendly fire** — ❓ still open. Not relevant in Phase 2 (no
   weapons); revisit when Phase 3 introduces bullets.
4. **Display name** — ⏳ deferred to Phase 5 polish. Defaults to
   `"Pilot"` in `mp-engine.js`'s `start({ name = 'Pilot' })`
   signature. No prompt, no title screen — punt as recommended.
5. **Local-ship "ghost" debug overlay** — ⏳ deferred. Not shipped
   in Phase 2; the `?mp-debug=1` console logging proved sufficient
   for the smoke testing actually performed. Revisit if Phase 4
   reconciliation tuning needs visual aid.
6. **Per-player input clamping** — ❓ still open. Server currently
   trusts client `aim_x`/`aim_y` verbatim. Harmless in Phase 2;
   matters in Phase 3 when bullets fire from those coordinates.

---

# Multiplayer WASM Pivot — Phase 2 — 2026-05-17

**Goal**: two browser tabs at `/mp` see each other's ships move via the
Rust server (the MVD2 — Minimum Viable Demo, second iteration).

**Predecessor**: Phase 1 (commit `d7c53b8`, CHANGELOG-MP `0.2.0`/`0.2.1`)
— single-client WASM round-trip working. Local ship driven by
`rainboids_sim::mp1::tick_phase1` runs in the browser via
`server/client-wasm/src/lib.rs`'s `World` API.

**Reference**: `docs/Multiplayer WASM Pivot – 2026-05-17.md` (canonical
pivot plan; this doc inherits all architectural decisions there and
fills in Phase 2 specifics).

---

## TL;DR

- **New endpoint**: `/mp/ws` on the existing `rainboids-server` binary,
  parallel to the legacy `/ws`. Legacy stays bit-identical so the 44
  integration tests keep passing.
- **Fresh room actor**: `server/server-bin/src/mp1_room.rs` wraps a
  multi-ship variant of `rainboids_sim::mp1::GameState`. One global
  room for Phase 2 — matchmaking is Phase 5.
- **Wire format**: tagged JSON (`serde_json`), not bincode. Phase 2
  wire volume is ~5 KB/s per player; debuggability in DevTools beats
  byte-efficiency until we measure a problem.
- **Client networking**: new `js/mp/mp-ws.js` opens the socket, sends
  `Hello`, awaits `Welcome`, streams `Snapshot`s to the engine. Local
  ship still uses WASM prediction; remote ships interpolate snapshots
  ~100ms behind the server.

---

## Architecture

### New server endpoint

The existing axum router in `server/server-bin/src/server/http.rs:29-34`
mounts `/health` + `/ws`. Phase 2 adds a third route, `/mp/ws`, on the
same listener:

```rust
Router::new()
    .route("/health", get(health))
    .route("/ws",     get(ws_upgrade))      // legacy — unchanged
    .route("/mp/ws",  get(mp_ws_upgrade))   // NEW — Phase 2
    .with_state(state)
```

`mp_ws_upgrade` is a sibling of `ws_upgrade` that calls into a fresh
`server::mp_connection::run(socket, mp1_room_handle)` instead of
`super::connection::run`. The legacy path keeps using `Matchmaker` +
`SessionRegistry` + the legacy `room/`; the MP path uses a single
hand-rolled `Mp1Room` handle obtained from app state.

`AppState` gains one field:

```rust
pub struct AppState {
    pub mm: Matchmaker,                       // legacy
    pub sessions: Arc<SessionRegistry>,       // legacy
    pub cfg: Arc<Config>,                     // shared
    pub mp1_room: mp1_room::Handle,           // NEW — Phase 2
}
```

The Phase 2 room is spawned once at server startup
(`server-bin/src/main.rs`), and every `/mp/ws` connection joins that
same room. Multi-room support is Phase 5.

### Wire format (JSON for Phase 2)

`serde_json` over text WebSocket frames. Two enums, both `#[serde(tag = "kind")]`
so the JS side can `switch (msg.kind) { case "Welcome": ... }` directly.
Lives in a new module `server/server-bin/src/mp_protocol.rs` (parallel
to the legacy `protocol/`).

```rust
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "kind")]
pub enum ClientMsg {
    Hello {
        name: String,
        client_version: String,  // matches build_info() Phase 2 build tag
    },
    Input {
        client_tick: u32,        // monotonic, client-side
        up: bool, down: bool, left: bool, right: bool,
        aim_x: f32, aim_y: f32,
    },
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "kind")]
pub enum ServerMsg {
    Welcome {
        player_id: u32,          // slot id, 0..MAX_PLAYERS
        server_tick: u32,        // current server tick at attach
        field_w: f32,            // 1920.0
        field_h: f32,            // 1080.0
    },
    Snapshot {
        tick: u32,
        server_t_ms: u64,        // for interp clock sync
        ships: Vec<SnapshotShip>,
    },
    PeerJoined { player_id: u32, name: String },
    PeerLeft   { player_id: u32 },
    Error      { code: String, message: String },
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SnapshotShip {
    pub player_id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32,
}
```

**Why JSON over bincode for Phase 2**: a 4-ship snapshot at 20 Hz is
~80 bytes payload uncompressed (24 bytes per ship + envelope); even
inflated to ~250 bytes by JSON-text overhead that's 5 KB/s per player
— negligible. Bincode buys us ~3x and costs us DevTools network-tab
inspection, browser-side debugger ergonomics, and an extra codegen
step. Reverse the decision in Phase 5 if profiling shows wire cost
dominating. Legacy `/ws` keeps its binary protocol; no shared codec.

**Why no Pong/Ping/Ack/Reattach in Phase 2**: those are the legacy
connection's robustness layers and they belong to a session/grace
system that doesn't exist yet on the `/mp` side. Tab-close drops the
ship; reopen mints a fresh `player_id`. Robustness is Phase 5.

### Sim crate additions (`rainboids_sim::mp1`)

Phase 1's `mp1::GameState` holds **one** `ShipState`. Phase 2 needs
**N** ships keyed by `player_id` (slot 0..MAX). Two new structs in
`server/sim/src/mp1/state.rs`:

```rust
pub const MAX_PLAYERS: usize = 8;

pub struct PlayerSlot {
    pub active: bool,           // false = unused slot, ship invisible
    pub player_id: u32,
    pub ship: ShipState,
}

// New: multi-ship variant. The existing single-ship GameState
// stays as-is for the Phase-1 WASM client path.
pub struct RoomState {
    pub slots: [PlayerSlot; MAX_PLAYERS],
    pub field_w: f32,
    pub field_h: f32,
    pub tick: u32,
}
```

A matching `tick_room(state, inputs: &[PlayerInput; MAX_PLAYERS], dt)`
helper in `mp1/ship.rs` runs `update_ship` per active slot in slot
order. Determinism is not yet a requirement (no rollback in Phase 2),
but slot-ordered iteration sets up cleanly for it.

The single-ship `GameState` + `tick_phase1` **stay unchanged** — the
WASM client keeps using them for local prediction of its own ship. The
authoritative server uses `RoomState`. This deliberate duplication
avoids forcing the WASM client to allocate `MAX_PLAYERS` slots when it
only predicts one.

### Room actor (fresh, parallel to legacy `room/mod.rs`)

New module `server/server-bin/src/mp1_room.rs`. Mirrors the **shape**
of legacy `room/mod.rs:80-189` (actor pattern, mpsc inbound channel,
tokio interval-driven tick loop) but is fresh code and trivially
simpler: no `Matchmaker` integration, no `SessionRegistry`, no grace
timer, no `PeerInfo`, no Pcg64 (no random spawns yet).

```rust
pub enum Inbound {
    Join {
        name: String,
        out: mpsc::Sender<ServerMsg>,
        reply: oneshot::Sender<u32>,  // assigned player_id
    },
    Input  { player_id: u32, input: PlayerInput },
    Leave  { player_id: u32 },
}

pub struct Mp1Room {
    state: RoomState,
    inputs: [PlayerInput; MAX_PLAYERS],
    players: Vec<Player>,    // (id, name, out_tx)
    cmd_rx: mpsc::Receiver<Inbound>,
}
```

Run loop, called once at server startup:

```rust
async fn run(mut room: Mp1Room) {
    let mut tick = interval(Duration::from_micros(16_667)); // 60 Hz
    tick.set_missed_tick_behavior(MissedTickBehavior::Burst);
    let mut snapshot_tick = interval(Duration::from_millis(50)); // 20 Hz

    loop {
        tokio::select! {
            biased;
            Some(msg) = room.cmd_rx.recv() => room.handle(msg),
            _ = tick.tick() => room.advance(),
            _ = snapshot_tick.tick() => room.broadcast_snapshot(),
        }
    }
}
```

`room.advance()` calls `tick_room(&mut room.state, &room.inputs, DT)`
and increments `room.state.tick`. `room.broadcast_snapshot()` builds
one `ServerMsg::Snapshot` from active slots and `try_send`s it to every
player. A full outbound queue drops that frame for that player (no
retry, no disconnect-on-stall) — at 20Hz the next snapshot is 50ms
away.

Slot assignment on Join: linear scan for `!slots[i].active`, set
`active = true`, position at `(field_w/2 + slot*60, field_h/2)` so
multiple ships don't spawn on top of each other. Reject the join (send
`Error { code: "RoomFull" }`) if no slot is free.

Leave: clear `slots[i].active`, broadcast `PeerLeft`. No grace window
in Phase 2; reconnects are fresh joins.

### Connection task

New module `server/server-bin/src/server/mp_connection.rs`. Mirrors the
shape of `connection.rs:32-239` — split socket, writer task, await
Hello with timeout, then `tokio::select!` loop on inbound frames — but
is much shorter:

- ~80 lines vs. legacy's 257
- No `Matchmaker.handle(...)` dispatch (no `QuickMatch`/`BrowseRooms`/etc.)
- No grace/session bookkeeping on disconnect
- No periodic ping/pong (Phase 5; tab-close = clean drop for Phase 2)
- Text WS frames + `serde_json::from_str` / `to_string` instead of
  binary + `codec::decode/encode`

On Hello: send `Inbound::Join` to the room, await the `oneshot` reply
with `player_id`, send `ServerMsg::Welcome { player_id, ... }` to
client. From there: every inbound `ClientMsg::Input` is forwarded to
the room as `Inbound::Input { player_id, input }`. Outbound: drain the
room-fed `mpsc::Receiver<ServerMsg>` into JSON text frames.

On socket close / read error: send `Inbound::Leave { player_id }` to
the room. Done.

### Client-side WS integration

New module `js/mp/mp-ws.js`. Pure transport — no game logic.

```javascript
export function connect({ name, onWelcome, onSnapshot, onPeer, onError }) {
    const url = new URL("/mp/ws", window.location.href);
    url.protocol = url.protocol.replace("http", "ws");
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => {
        ws.send(JSON.stringify({
            kind: "Hello",
            name,
            client_version: "mp 0.3.0-dev",
        }));
    });
    ws.addEventListener("message", (ev) => { /* dispatch by msg.kind */ });
    ws.addEventListener("close", () => { /* mark disconnected */ });
    return {
        sendInput(input) {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ kind: "Input", ...input }));
        },
        close() { ws.close(); },
    };
}
```

`js/mp/mp-engine.js` extends as follows:

- `start(World, debugEl, canvas)` becomes `start(World, debugEl, canvas, { name })`.
- After constructing the WASM `World`, open the WS via `mp-ws.connect`.
- Maintain a `remoteShips: Map<player_id, InterpTrack>`. Each track
  buffers the last ~6 snapshots (300ms of history) so the renderer
  can interpolate.
- On each RAF frame:
  1. Read input from `mp-input.js`.
  2. Call `world.set_input(...)` + `world.tick(dt)` — this is local
     prediction for THIS player's ship only.
  3. At 30 Hz upload throttle (every other frame at 60fps), send the
     same input to the server via `ws.sendInput(...)`.
  4. Interpolate every remote ship to `(server_t_ms - 100ms)`.
  5. Render local ship from `world.ship_x()` + remote ships from
     interpolated tracks.
- On `Welcome`: store our `player_id` so we can ignore our own ship in
  the snapshot stream (the server includes everyone; we trust local
  prediction for ourselves in Phase 2).
- On `Snapshot`: push each non-self ship into its interp track.

**No reconciliation in Phase 2.** Local prediction may drift from the
server within a session; we don't correct it. Phase 4 introduces a
prediction error budget and a snap-back rule.

### Remote-ship rendering

`js/mp/mp-renderer.js` `render(ctx, canvas, world, aim)` extends to
`render(ctx, canvas, world, aim, remoteShips)`. The local-ship branch
is unchanged. After it paints the local ship, it iterates `remoteShips`
and paints each one in a different color (slot-indexed palette — e.g.,
cyan, magenta, yellow, lime). The triangle geometry is identical; only
fill color differs.

Remote-ship positions come from the engine's interpolation step, NOT
from a WASM call. Renderer is stateless; it just consumes whatever
positions the engine computed.

A floating name label above each remote ship (slot index for Phase 2;
real names if we wire the `name` field through `PeerJoined` —
recommended low-cost addition).

---

## Tick rates / wire volume

| Channel | Rate | Direction | Per-message size (JSON) | Per-second per player |
|---------|------|-----------|-------------------------|----------------------|
| Server sim | 60 Hz | internal | — | — |
| Snapshot broadcast | 20 Hz | server → client | ~80 bytes × N ships | ~5 KB (4 ships) |
| Input upload | 30 Hz | client → server | ~95 bytes | ~3 KB |
| Total per player | | both ways | | ~8 KB/s |

At 4 concurrent players in one room: server sends ~5 KB/s × 4 = 20 KB/s
egress; receives ~3 KB/s × 4 = 12 KB/s ingress. Trivial on any host;
the cargo server's listener is the same one already running on
`0.0.0.0:8443`, no new port. WSS/TLS termination is Phase 5.

Interpolation buffer: 100 ms behind server time (`2 snapshots`).
Standard snapshot-interp practice — gives one frame of grace if the
20 Hz tick stutters without showing extrapolation jitter.

---

## Out of scope for Phase 2

- **Matchmaking / room browsing** — single global room only (Phase 5)
- **Drop-in / drop-out at safe sync points** — Phase 5
- **Reconnect with grace window** — tab-close mints a fresh slot
  (Phase 5)
- **Prediction reconciliation** — local prediction may drift from
  server; we don't correct in Phase 2 (Phase 4)
- **Enemies, bullets, asteroids, drops** — ships only (Phase 3)
- **HP, death, respawn** — ships are immortal targets in Phase 2
  (Phase 3 introduces HP; Phase 4 the death model)
- **Binary wire format** — JSON suffices at Phase 2 wire volume
  (Phase 5+ if profiling demands)
- **TLS / WSS / deployment** — `ws://localhost:8443/mp/ws` only
  (Phase 5)
- **Cheat protection** — server trusts client input verbatim
  (Phase 5+)
- **Disconnect detection beyond socket-close** — no application-level
  ping in Phase 2

---

## Implementation breakdown — what subagents can run in parallel

Strict file ownership, no overlap. Per the parallel-dispatch lessons
in `memory/feedback_parallel_dispatch.md`: new-file dispatches are the
safest pattern; existing-file edits stay orchestrator-led and serial.

**Wave 1 — Parallel (all new files, no existing-file edits)**

| Agent | Owns (new files only) | Brief |
|-------|----------------------|-------|
| **A** | `server/server-bin/src/mp_protocol.rs` | Define `ClientMsg` + `ServerMsg` + `SnapshotShip` per the wire-format sketch above. Pure types; no I/O. `serde_json` is already a transitive dep through axum, but add it explicitly to `server/server-bin/Cargo.toml` (done in Wave 2 by orchestrator). Includes round-trip unit tests (`#[test]` modules) for each variant. |
| **B** | `server/server-bin/src/mp1_room.rs` | Implement `Mp1Room` + `Handle` + `Inbound` + `run(room)`. Imports `rainboids_sim::mp1::{RoomState, PlayerInput, tick_room, MAX_PLAYERS}` (these are added by Agent D). Spawn helper `Mp1Room::spawn(cfg) -> Handle`. Drops players on `Inbound::Leave`. Spawn slot 0..7. |
| **C** | `server/server-bin/src/server/mp_connection.rs` | Implement `pub async fn run(socket, room_handle)`. Hello timeout 3s. Reads `ClientMsg`, forwards Input to room, on close sends `Leave`. Mirrors the structure of `connection.rs:32-239` but trimmed: no Matchmaker, no SessionRegistry, no ping, JSON instead of bincode. |
| **D** | `server/sim/src/mp1/room_state.rs` (new file in existing mp1/ dir) | Add `RoomState` + `PlayerSlot` + `MAX_PLAYERS`. Add `tick_room(state, inputs, dt)` in same file or a new `mp1/room_ship.rs`. Re-export from `mp1/mod.rs` (orchestrator does the `mod.rs` edit in Wave 2). Native unit tests covering: empty room ticks no-op; single active slot moves; eight slots tick independently. |
| **E** | `js/mp/mp-ws.js` | Implement `connect({ name, onWelcome, onSnapshot, onPeer, onError })`. Pure transport — no game state. Auto-reconnect is OUT of scope. Test by-hand only; no JS unit tests (the existing `tests/qa/` suite doesn't cover MP yet). |

These five agents touch zero overlapping files and zero existing
production code. Safe to run in one parallel dispatch.

**Wave 2 — Orchestrator foreground (small, low-risk edits to existing files)**

The orchestrator drives these in order, verifying after each. Roughly
the same ergonomics as Phase 0's Wave 3.

1. Edit `server/sim/src/mp1/mod.rs`: add `pub mod room_state;` and the
   `pub use room_state::{RoomState, PlayerSlot, MAX_PLAYERS, tick_room};`
   re-exports.
2. Edit `server/server-bin/src/lib.rs`: add `pub mod mp1_room;`,
   `pub mod mp_protocol;`. Edit `server/server-bin/src/server/mod.rs`
   to add `pub mod mp_connection;`.
3. Edit `server/server-bin/Cargo.toml`: add `serde_json = "1"` to deps
   if not already transitively pulled. Verify with `cargo tree`.
4. Edit `server/server-bin/src/server/http.rs:29-34`: add the
   `/mp/ws` route + `mp_ws_upgrade` handler. Extend `AppState` with
   `pub mp1_room: mp1_room::Handle`.
5. Edit `server/server-bin/src/main.rs`: at server boot, spawn
   the global `Mp1Room` and stash the handle in `AppState`.
6. Edit `js/mp/mp-engine.js`: accept the WS handle, maintain
   `remoteShips` map, throttle input upload to 30 Hz, interpolate
   remote tracks, pass `remoteShips` to `render(...)`.
7. Edit `js/mp/mp-renderer.js`: render remote ships from passed-in
   positions with slot-indexed palette + name label.
8. Edit `js/mp/mp-main.js`: read the player's display name from a
   simple `prompt()` (or hardcode `"Player"` for Phase 2 — punt the
   UI), pass it through `start(World, ..., { name })`.
9. **Verify**: `cd server && cargo check --workspace` clean.
10. **Verify**: `cd server && cargo test --workspace` — 44+ pass
    (no `rainboids-server` regressions; Agent A's protocol tests and
    Agent D's `mp1::tick_room` tests should add to this count).
11. **Verify**: `npm run wasm:build:dev` succeeds. (No WASM changes
    in Phase 2 — but rebuild to confirm.)
12. **Verify**: Open two tabs at `http://localhost:8090/mp`. Each
    should see its own ship react instantly, and the other tab's
    ship moving smoothly with ~100ms latency.

**Wave 3 — Orchestrator foreground (versioning + docs)**

13. Bump `VERSION-MP` to `0.3.0`.
14. Add a `## [0.3.0] - 2026-05-17` entry in `CHANGELOG-MP.md` under
    Phase 2 banner. Sections: `### Added` (server `/mp/ws`,
    `Mp1Room`, JSON wire protocol, `mp-ws.js`, multi-ship rendering),
    `### Changed` (`mp-engine.js` now drives both prediction + WS).

---

## Acceptance criteria

- [ ] `cd server && cargo check --workspace` clean (no new warnings)
- [ ] `cd server && cargo test --workspace` ≥ 44 pass (no regressions
      in legacy `rainboids-server` tests; Agent A + Agent D add new
      tests on top)
- [ ] `npm run wasm:build:dev` succeeds (Phase 1 client untouched)
- [ ] `npm run dev` starts http-server + cargo server + wasm watch
- [ ] Two browser tabs at `/mp` both see each other's ships moving
- [ ] Each player's ship reacts instantly to its own input (local
      prediction; <16ms input-to-pixel latency)
- [ ] Remote ships are smooth (no visible jitter from 20Hz snapshot
      rate; 100ms interp buffer absorbs the gap)
- [ ] Disconnecting one tab (close, reload) doesn't crash the other
      tab or the server; remaining tab sees the `PeerLeft` removal
      within ~50ms (one snapshot tick)
- [ ] Opening a third tab adds a third ship; up to `MAX_PLAYERS = 8`
- [ ] Ninth tab gets a clean `Error { code: "RoomFull" }` in the
      console and a friendly overlay message
- [ ] `cargo test --workspace` + `npm run test:unit` + `npm run test:qa`
      all pass (solo regression check)

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Local prediction diverges from server within the session** (player's local ship visibly snaps to a different position than what other tabs see). Cause: `tick_phase1` runs at the browser's RAF rate (~60 fps but variable); server runs at fixed 60 Hz interval. Drift accumulates. | Accept it for Phase 2. The local ship is the same ship in both — both run `update_ship` with the same per-tick constants — but timing differences will drift. Symptom shows up as remote tabs lagging "behind" where the local tab thinks the ship is. Phase 4 introduces server-authoritative snap-back. If drift is visually distracting in Phase 2 testing, the fix is to send the server's snapshot of the local ship to mp-renderer as a faint ghost so the player can self-debug; this is a one-day add. |
| **Snapshot bandwidth grows non-linearly** in Phase 3+ when enemies and bullets enter the picture (potentially 100+ entities per snapshot, ~25 KB JSON at 20 Hz = 500 KB/s per player). | Out of scope for Phase 2 but worth flagging. The Phase 5 bincode switch is the obvious mitigation; an earlier and cheaper one is per-entity-type delta encoding (only send what changed since last ack). Don't pre-optimize in Phase 2; ship JSON, measure in Phase 3. |
| **Port conflict on `:8443`** if a developer already has the legacy server bound. | The Phase 2 server is the SAME binary; there's no second listener. Both `/ws` and `/mp/ws` share the axum router and the one bound socket. |
| **Tab-close doesn't propagate cleanly on some browsers** (Safari's lifecycle is famously inconsistent re: unload events). | The server-side `mp_connection::run` detects close via the WS read returning `None` / err. Browser doesn't need to send anything special — the OS-level TCP RST or graceful close fires the server's read branch. Tested on Chrome + Firefox + Safari in Phase 2 acceptance. |
| **Phase 1 client breaks on Phase 2 server build** because `rainboids-client-wasm` doesn't link to the new types. | It doesn't have to — `client-wasm` consumes only `mp1::tick_phase1` + the single-ship `GameState`. `RoomState` is a new type in the same module, not a modification of existing ones. Phase 2 leaves the WASM API untouched. |

---

## Reversibility

Phase 2 backs out cleanly if needed:

1. **At any point during Wave 1**: subagents own new files; `git rm`
   them and the tree is back to Phase 1.
2. **After Wave 2**: revert the 8 orchestrator commits in order. The
   diffs are surgical (route addition, module declaration, engine.js
   extension). Phase 1 functionality is preserved by design — the
   legacy `/ws` route and the WASM client both stay independent of
   anything Phase 2 adds.
3. **After Phase 2 ships and Phase 3 starts**: revert is no longer
   meaningful because Phase 3 builds on the same `Mp1Room` actor.
   Phase 3+ would have to be reverted alongside.

The architectural commitment point is the same as for Phase 1: the
shape of `mp1::RoomState` + the JSON wire format. If either turns out
to be wrong, the cleanup is `git revert` + redesign; the legacy `/ws`
and the 44 integration tests are untouched throughout, so the worst
case is "Phase 2 was wasted effort, no collateral damage."

---

## Open questions for the user

These need a decision before Phase 2 starts (or a "punt to defaults"
ack):

1. **Room policy**: one global room shared by all `/mp` connections is
   the Phase 2 default. Acceptable? If you want per-URL-hash rooms
   (`/mp#abc123`) as an early matchmaking shim, that's a 2-hour add
   to Agent C's brief.
2. **Spawn positions**: default plan is `(field_w/2 + slot*60, field_h/2)`
   — eight ships in a horizontal line at center. Acceptable? Or do
   you want randomized spawns (needs an Rng in `Mp1Room`) or
   slot-anchored corners?
3. **Friendly fire**: not relevant in Phase 2 (no weapons), but the
   answer affects Phase 3's bullet/collision design. Defaults to OFF;
   confirm or override.
4. **Display name**: simple `prompt()` on `/mp` page load is the
   Phase 2 default. If you want a proper title screen for `/mp` with
   a name input + JOIN button, that's a 1-day add to Agent E + a new
   `mp-title.js` module. Recommend punting to Phase 5 polish.
5. **Local-ship "ghost" debug overlay**: should the local player see
   a faint outline of where the server thinks their ship is (useful
   for spotting prediction drift early)? Recommend yes — adds ~30
   lines to `mp-renderer.js` and pays for itself the first time a
   real divergence shows up.
6. **Per-player input clamping**: should the server reject `aim_x` /
   `aim_y` outside `[0, field_w]` / `[0, field_h]`? Defaults to clamp
   silently. Alternative: trust client and let the ship aim at
   nonsense world coords (harmless in Phase 2; matters in Phase 3
   when bullets fire).
