# Changelog — Rainboids Multiplayer

All notable changes to **Rainboids Multiplayer** (`/mp`) are documented
here. MP versions independently of single-player; for solo changes see
`CHANGELOG.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
MP stays in `0.x` while experimental; promotes to `1.0.0` when stable.

## [0.5.0] - 2026-05-18

**Phase 4 step 1 — Wave system + drop orbs.** The Phase 3 placeholder
"one HUNTER every 10 s forever" is gone; `/mp` now plays through
structured waves with gold + health orbs dropping from enemy and
asteroid kills.

Wave 1 of the rollout was three parallel new-file dispatches (27 new
unit tests across `mp1/wave.rs`, `mp1/drops.rs`, `mp1/wave_table.rs`);
Wave 2 was the orchestrator-serial integration covered below.

### Changed — `WIRE_VERSION` 3 → 4

Adds four new `EventPayload` variants and an `OrbWire` Resync record;
extends `Resync` with `orbs` + four `wave_*` fields. Clients running
WIRE_VERSION 3 are rejected with `wire_version_mismatch`.

### Added — `server/sim/src/mp1/wave.rs` (~380 LOC)

Deterministic wave state machine. `WaveState { current_wave,
sub_wave_idx, phase, phase_started_tick }`, `WavePhase { Intro,
Spawning, Clearing, Complete }`, `WaveSpawnGroup`, `WaveConfig`,
`WaveSpawnRequest`, and the pure `tick_wave(state, config,
alive_enemy_count, current_tick) -> Vec<WaveSpawnRequest>` driver.

Mirrors solo's `js/sim/wave.js` byte-for-byte:
- Sub-wave advance when alive enemies ≤ 2 OR 720 ticks (12 s @ 60 Hz)
  have elapsed
- Wave complete when last sub-wave spawned + 0 enemies alive
- Caller owns the `Complete → wave++ → Intro` transition

8 unit tests cover the four phase transitions, stale fallback, spawn
expansion, and the boss-tier propagation.

### Added — `server/sim/src/mp1/drops.rs` (~500 LOC)

Gold + health orb sim. Deterministic spawn via
`spawn_orb_from_seed(id, kind, src_x, src_y, sub_seed)` using
`RngCtx::from_sub_seed` + `trig::cos64`/`sin64` for cross-runtime
bit-exact initial outward kick. `update_orb` mirrors solo's
`js/sim/drops.js`: friction (0.92 for health to tame the magnet pump,
0.985 for gold), lifetime decrement (gold 7200 ticks; health
permanent per the solo 5.102.0 rule), opacity fade-out, two-tier
health magnet (110 px gentle / 45 px snap), field-edge wrap.

Phase 4 step 1 divergences from solo (documented in module header):
no tractor branch (Phase 5 — tractor skill not yet implemented), no
`healthMagnetScale` powerup, and `downed = true` ships don't pull
orbs (added vs solo which only checked `active`).

11 unit tests cover spawn determinism, velocity bounds, lifetime
semantics, magnet behavior, downed-ship filter, and field wrap.

### Added — `server/sim/src/mp1/wave_table.rs` (~400 LOC)

Static wave configs for waves 1–10, ported verbatim from solo's
`js/modules/wave/wave-data.js`. Defines the 10 `KIND_*: u8` enemy
discriminators (HUNTER=0..TITAN=9, dense). `get_wave_config(n)`
clamps `[1, MAX_WAVE_NUMBER=10]`. Only `KIND_HUNTER` has a spawn
function today; `mp1_room.rs` substitutes HUNTER for unimplemented
kinds with a `tracing::debug!` log until Phase 4 step 5 ports the
other 9 enemy types.

8 unit tests cover waves 1, 3 (boss tier 1), 6 (boss tier 1), 9
(boss tier 2); the out-of-range clamp; and that all 10 kind consts
are exactly `0..=9`.

### Changed — `server/sim/src/mp1/state.rs`

`RoomState` gains `orbs: Vec<OrbState>`, `next_orb_id: u32`,
`wave: WaveState`, and `MAX_ORBS = 32` (soft cap mirroring solo's
drop-pool behavior). `enemy_spawn_at_tick` removed (the wave machine
replaces it).

### Changed — `server/sim/src/mp1/collision.rs`

- New `CollisionEvent::OrbCollected { orb_id, by_player_id, kind, x, y }`
- New `run_collisions` parameter: `orbs: &mut [OrbState]`
- New pair: ship × orb pickup. Health orbs heal the picker
  (`ORB_HEALTH_HEAL = 25.0`, clamped to `max_hp`). Gold orbs only
  emit the event for now (server-side accounting is Phase 4 step 9).
- Downed ships can't collect

### Changed — `server/sim/src/mp1/wire.rs`

`WIRE_VERSION` bumped 3 → 4. New `EventPayload` variants:
- `OrbSpawn { orb_id, kind, x, y, rng_subseed }`
- `OrbCollected { orb_id, by_player_id, kind, at_tick, x, y }`
- `WaveStart { wave_number, asteroid_count, is_boss_wave, boss_tier, at_tick }`
- `WaveClear { wave_number, at_tick }`

New `OrbWire` struct for Resync; `ServerMsg::Resync` extended with
`orbs: Vec<OrbWire>` + `wave_number`, `wave_sub_wave_idx`,
`wave_phase`, `wave_phase_started_tick`.

### Changed — `server/server-bin/src/mp1_room.rs`

- `step()` order extended: ship physics → enemy AI → asteroid drift
  → bullet integration → **orb drift/magnet/lifetime** →
  fire-to-bullet spawns → **wave cadence drive** → collision →
  event translation (now rolls for drop spawns on enemy/asteroid
  death) → revive ticking → cull dead orbs.
- `drive_wave()` reads `wave_table::get_wave_config`, calls
  `wave::tick_wave`, spawns asteroids on Intro→Spawning, emits
  `WaveStart` / `WaveClear` at the right boundaries, and bumps
  `current_wave` on Complete.
- Drop chances: enemy kills → 65 % gold / 10 % health; small
  asteroid terminal kills → 35 % gold.
- `seed_initial_asteroids` replaced with `spawn_wave_asteroids(n)`
  fired by `WaveStart` (the room now boots empty; wave 1's asteroids
  appear ~1.5 s in when Intro → Spawning).
- `build_checksum` now hashes orbs together with asteroids
  (`hash_asteroids_and_orbs`) preserving the four-hash wire shape.
- `build_resync` carries `orbs` + the four `wave_*` fields.

### Changed — `server/client-wasm/src/lib.rs`

New `World` accessors: `orb_count`, `orb_id`, `orb_kind`, `orb_x`,
`orb_y`, `orb_opacity`, `wave_number`, `wave_phase`. New consumers:
`consume_orb_spawn`, `consume_orb_collected`, `consume_wave_start`,
`consume_wave_clear`. `tick()` now updates orbs each frame (mirrors
server's step 4.5) and passes them to `collision::run_collisions`.
`checksum_asteroids` now bundles orbs to stay in lockstep with the
server.

### Changed — `js/mp/wire-codec.js`

`WIRE_VERSION` bumped 3 → 4. New decoders for the four
`EventPayload` variants, new `readOrbWire`, extended `Resync`
decoder for orbs + wave fields.

### Changed — `js/mp/mp-engine.js`

- Dispatches `OrbSpawn` / `OrbCollected` / `WaveStart` / `WaveClear`
  events to the new `world.consume_*` methods
- Local `localGold` counter increments when an `OrbCollected` event
  credits the local player (HUD-only; authoritative score lands in
  Phase 4 step 9)
- Resync handler re-populates orbs (with synthesized sub-seeds, same
  caveat as Phase 3's enemy/asteroid Resync path) and re-aligns the
  local wave state

### Added — orb rendering + HUD elements

- `js/mp/mp-renderer.js`: `drawOrb(x, y, kind, opacity, scale)`
  — gold = yellow disc + ring outline, health = green disc + white
  cross. Z-order: between asteroids and enemies.
- `js/mp/mp-hud.js`: top-center `WAVE N` indicator, top-right
  `GOLD N` counter. Same `'11px 'Press Start 2P', monospace'` font
  as the existing HUD elements.
- `js/mp/mp-particles.js`: `spawnOrbPickup(x, y, kind)` — 10
  color-matched sparks (gold = yellow, health = pale green).

### Build health

- `cargo test --workspace`: **138 passed, 0 failed** (was 95
  before Wave 1; 27 new mp1 sim tests + integration coverage).
- `cargo check --workspace`: clean
- `npm run wasm:build:dev`: clean (~9 s)
- `npm run test:qa --grep QA-13`: 4/4 pass — Phase 3 deterministic
  two-tab smoke regression intact

### Known limitations / Phase 4 follow-ups

- Only `KIND_HUNTER` has a spawn function; the other 9 wave-table
  kinds spawn HUNTERs with a `tracing::debug!` log (Phase 4 step 5).
- Gold orb collection increments a per-client `localGold` counter
  only — no authoritative server-side score state (Phase 4 step 9).
- `OrbWire` doesn't carry the original `rng_subseed`, so Resync
  reconstructs orbs from synthesized sub-seeds (same Phase 5 pattern
  as enemies/asteroids — will diverge from server in any future
  RNG-driven orb state until widened).
- Wave 11+ clamps to wave 10 (table size). Phase 4 step 5 widens to
  30 alongside the remaining enemies.

## [0.4.3] - 2026-05-18

Renderer-side hook for embedder-provided WS URLs. Enables the Electron
desktop wrapper (desktop 0.3.0) to override `discoverDefaultUrl()` with
a verbatim production URL, since `window.location.hostname` inside
Electron resolves to `rainboids` (the `app://` host) and would
otherwise produce an unconnectable fallback.

### Added — Priority-0 URL source in `js/mp/mp-ws.js`

`discoverDefaultUrl()` now checks `window.rainboids?.mpServerUrl` first.
If present and non-empty, returns it verbatim — no proto/host/port
munging. Falls through to the existing three-tier chain otherwise:

  0. `window.rainboids.mpServerUrl` (new — embedder override)
  1. `?mp-ws=<host>[:<port>]` URL param
  2. `js/mp/dev-mp-port.json` discovery file
  3. `${proto}//${hostname}:8443/mp/ws` default

Try/catch-guarded so a missing `window.rainboids` (web build) is a
no-op fallthrough. Web behaviour is unchanged.

Patch bump (0.4.2 → 0.4.3) — small additive client-side change, no
wire protocol change, no server change.

## [0.4.2] - 2026-05-17

Phase 3 integration fixes — `/mp` now actually connects and the
two-tab Playwright smoke (QA-13, 4 tests) passes end-to-end.

### Fixed — `new World()` constructor

`mp-engine.js` was calling `World.new()` (static method), but
wasm-bindgen's `#[wasm_bindgen(constructor)]` exposes the Rust
`pub fn new() -> World` as JS constructor syntax `new World()`,
NOT as a static method. Page-load console showed
`World.new is not a function`. Fixed to `const world = new World()`.

### Fixed — WS URL points to the right port

`mp-ws.js`'s `defaultUrl()` used `window.location.host`, which is
`:8090` (the http-server serving the static page). The Rust server
listens on `:8443`. So the WebSocket was trying `ws://localhost:8090/mp/ws`
and silently failing (http-server returns 404 / closes). Fixed:
URL now uses the same hostname + port `8443` (and a `?mp-ws=`
URL override for testing against remote servers).

### Fixed — `VERSION_MP` constant stale

`js/modules/core/version.js` had `VERSION_MP = '0.1.0'` since Phase 0
never bumped. Updated to `'0.4.1'` so the title screen + debug
overlay show the correct version. Will keep this in sync with
`VERSION-MP` going forward.

### Test result

```
QA-13 pids: page1=1, page2=2
✓ Two tabs both reach ws:open state (3.3s)
✓ Each tab sees the OTHER in its peers count (2.2s)
✓ Ship movement in one tab is visible to the other (5.2s)
  movement: page1 |Δ|=200.3, page2 srvTick 12279 → 12420 (Δ=141)
✓ Disconnecting one tab cleanly removes it from the other (3.3s)
4 passed (22.5s)
```

**Phase 3 deterministic MP architecture is validated end-to-end.**
Two tabs at `/mp` connect to the Rust server, exchange ships +
events, ship movement propagates ~141 server-ticks during a 1.5s
hold (matches the 20Hz snapshot rate + tick budget), and clean
disconnect cleanup works.

### Build health

- `cargo check --workspace`: clean (no Rust changes this commit)
- `npm run test:qa --grep QA-13`: 4/4 pass
- `node --check js/mp/*.js`: clean

---

## [0.4.1] - 2026-05-17

Phase 3 follow-up — Welcome carries the room RNG seed, particles +
HUD light up. End-to-end determinism is now seeded from the
authoritative source (no more `BigInt(server_tick)` placeholder),
and combat is visually legible.

### Changed — WIRE_VERSION 2 → 3

`ServerMsg::Welcome` gains a `rng_seed: u64` field. Server constructs
its room with a seed derived from `SystemTime::UNIX_EPOCH` (already
stored on `Mp1RoomHandle.rng_seed`), now also broadcasts it in the
Welcome so the client's WASM `World` can call `World::seed(rng_seed)`
and consume the identical PCG-64 stream.

The engine drops its `BigInt(server_tick)` placeholder and uses
`msg.rng_seed` directly. First `Resync` round-trip no longer
required to align the deterministic stream — alignment is correct
from tick 0.

### Added — `js/mp/mp-particles.js` (~+200 LOC)

Pooled cosmetic burst system. 256-slot pool, oldest-dies-first
eviction, no per-spawn allocation. Six spawn methods wired in the
engine's `dispatchEvent`:

- `spawnBulletHit(x, y)` — 6 cyan PULSE_CANNON sparks (~0.4 s)
- `spawnEnemyDestroy(x, y)` — red expanding ring + 16 orange sparks
- `spawnAsteroidSplit(x, y)` — 12 gray debris chunks (line segments + rotation)
- `spawnShipDamaged(x, y)` — yellow ring + 8 yellow sparks
- `spawnShipDowned(x, y)` — white shockwave + 20 white sparks
- `spawnShipRevived(x, y)` — 16 pale-green sparkles biased upward

Line widths counter-scaled by `1/scale` so thickness stays
screen-stable inside the letterbox transform. Particles are
intentionally non-deterministic (each tab spawns its own; cosmetic
only).

### Added — `js/mp/mp-hud.js` (~+150 LOC)

Screen-coord HUD (resets the canvas transform internally so it's
unaffected by the letterbox). Components:

- **Local HP bar** (bottom center, 240×14 px) — color-tiered fill
  (red < 33%, yellow < 67%, green ≥ 67%); numeric overlay
  `HP: 7 / 10`
- **DOWNED overlay** (when `world.ship_downed()`) — 24px red text +
  240×8 cyan revive progress bar (`world.ship_revive_meter() / 180`)
  + "Hold near an ally to revive" hint when revive_meter is near 0
- **Peer status list** (top right) — `P3: 8/10` color-coded by
  palette index, `(down)` suffix when downed
- **HOSTILES counter** (top left) — red `HOSTILES: N` shown only
  when enemies are alive

Uses the same `'11px 'Press Start 2P', monospace'` font as solo's
overlay.

### Changed — `js/mp/mp-engine.js`

- Imports + constructs `Particles` + `Hud` instances at start
- `world.tick(dt)` followed by `particles.update(dt)` per frame
- `render(...)` followed by `particles.draw(ctx, scale)` (world
  coords) and `hud.draw(ctx, canvas, world)` (screen coords) per
  frame
- `dispatchEvent` calls the matching `particles.spawn*` for each
  cosmetic-bearing event
- `onWelcome` calls `world.seed(msg.rng_seed)` (replaces placeholder)

### Build health

- `cargo check --workspace`: clean
- `cargo test --workspace`: 112 pass (no regressions)
- `npm run wasm:build:dev`: clean (~18s incremental)
- `node --check js/mp/*.js`: all clean

### Manual two-tab validation

Pre-built WASM + servers running:
```
npm run dev
# open two http://localhost:8090/mp tabs
```

Expected (visible improvements over 0.4.0):
- HP bar always visible at bottom; numbers update as you take damage
- Bullet impacts produce cyan spark bursts
- HUNTER kills produce red+orange explosions
- Asteroid splits produce gray debris bursts
- When downed: big red DOWNED text + cyan revive bar fills as
  ally hovers nearby; sparkly green burst on revive

---

## [0.4.0] - 2026-05-17

Phase 3 Wave 4 — JS client integration. End-to-end Phase 3
deterministic mirror lands: WASM runs the full sim client-side,
consumes server Event frames, drifts checked via StateChecksum,
Resync round-trip available for recovery. Renderer draws enemies +
asteroids + bullets directly from the WASM mirror. **The deterministic
architecture is now wired end-to-end** — full validation needs a live
two-tab session.

Minor-version bump (0.3.5 → 0.4.0) marks the architectural completion
of Phase 3 wave-by-wave rollout.

### Added — `js/mp/wire-codec.js` Phase 3 extensions (~+128 LOC → 501 total)

- `WIRE_VERSION` bumped 1 → 2
- Decoders for `ServerMsg::Event` (with all 9 `EventPayload` variants),
  `StateChecksum`, `Resync`
- New `EnemyWire` / `AsteroidWire` / `BulletWire` record readers
  used by Resync
- `encodeResync(clientTick)` ClientMsg encoder
- `Reader.u64Big()` for the `rng_subseed` / `rng_seed` fields that
  genuinely span the full u64 range (everything else stays Number)
- `EnemySpawn` and `EnemyDestroy` payloads rename the wire `kind: u8`
  field to `kind_u8` in the decoded JS object to avoid colliding with
  the JS dispatch `kind: 'EnemySpawn'` etc.

### Added — `server/client-wasm/src/lib.rs` Phase 3 World API (~+400 LOC)

`World` now wraps `mp1::state::RoomState` and exposes a full mirror
surface. Local-ship accessors (`ship_x`, `ship_y`, …) preserved and
now resolve via `local_player_id`.

New methods:
- `seed(BigInt)` — re-seed RngCtx + reset RoomState
- `set_local_player(player_id)` — set the local pid (after Welcome)
- `ensure_ship` / `remove_ship` / `apply_snapshot_ship`
- `tick(dt)` — runs the FULL Phase 3 pipeline (ship → enemy → asteroid
  → bullet → collision → revive → cull → tick++) matching server's
  `mp1_room.rs::step` byte-for-byte
- `consume_enemy_spawn` / `consume_asteroid_spawn` / `consume_bullet_spawn` / `consume_bullet_hit` / `consume_enemy_destroy` / `consume_asteroid_split` / `consume_ship_damaged` / `consume_ship_downed` / `consume_ship_revived` — one per EventPayload variant
- Per-entity accessors: `remote_ship_*(idx)`, `enemy_*(idx)`,
  `asteroid_*(idx)`, `bullet_*(idx)` + `_count()` for each
- `checksum_ships` / `checksum_enemies` / `checksum_asteroids` /
  `checksum_bullets` — match server's hash byte-for-byte (same
  DefaultHasher, same fields, same order)
- `reset_for_resync(seed: BigInt, tick: u32)`

### Changed — `js/mp/mp-engine.js` Phase 3 wiring

Replaces Phase 2's JS-side `remoteShips: Map<player_id, InterpTrack>`
with WASM-driven state. Per-frame flow now:

1. read input → set on World
2. `world.tick(dt)` — runs full sim
3. build remote-ship array via `world.remote_ship_*(i)` accessors
4. render (renderer queries enemies/asteroids/bullets directly)

New WS callbacks wired:
- `onEvent({tick, payloads})` — dispatch each EventPayload to the
  matching `world.consume_*` method
- `onStateChecksum({tick, ships_hash, enemies_hash, asteroids_hash, bullets_hash})`
  — compare to local `world.checksum_*()`; on mismatch + 2 s
  throttle, send Resync
- `onResync({tick, rng_seed, ships, enemies, asteroids, bullets})`
  — `world.reset_for_resync(seed, tick)` + repopulate via
  apply_snapshot_ship / consume_*_spawn

Debug overlay extended: enemies/asteroids/bullets counts, hp/max_hp,
conditional downed + revive %, last Event tick, last checksum tick,
Resync miss + applied counts.

`wire_version_mismatch` errors now render a fatal overlay so the
problem is loud, not silent.

### Changed — `js/mp/mp-renderer.js` Phase 3 draws (~+148 LOC → 285 total)

New entity draws in z-order (back → front):

1. Asteroids — gray wireframe 12-gons; HP bar above (suppressed at
   full HP to keep idle field clean)
2. Enemies — red triangles (`#ff4444` matches solo HUNTER); always-on
   HP bar
3. Bullets — small cyan dots (`#00ccff` matches solo PULSE_CANNON)
4. Remote ships (existing, extended for downed state)
5. Local ship (existing, extended for downed state)

Downed ships (local or remote) render at 40% alpha with a deterministic
pulsing cyan revive-radius hint (80 px) so nearby live players can see
where to hover. Pulse driven by `world.tick_count()` — replay-safe;
no wall-clock dependency.

`render` signature preserved: `(ctx, canvas, world, aim, remoteShips = [])`.

### Changed — `js/mp/mp-ws.js` Phase 3 routing

Dispatches new `Event` / `StateChecksum` / `Resync` ServerMsg
variants to caller callbacks. Adds `sendResync(clientTick)` to the
return object. Tier 1 debug logging unchanged (decoded msgs visible
in DevTools console behind `?mp-debug=1`).

### Known limitations / TODO for follow-up

- `Welcome.rng_seed` not yet on the wire — engine uses
  `BigInt(server_tick)` as a placeholder seed at Welcome time; the
  first StateChecksum / Resync round-trip self-heals to the
  authoritative seed. Wire bump deferred until validated in the
  two-tab smoke.
- `Resync` entity ingestion synthesizes deterministic sub-seeds via
  `splitmix64(rng_seed ^ tag ^ id)` since `BulletWire` /
  `AsteroidWire` / `EnemyWire` don't carry the original sub-seed.
  Documented as a Phase 5 follow-up.
- `mp-particles.js` + `mp-hud.js` (HP bars, revive UI overlay,
  cosmetic bursts) are stubs — kept minimal in Wave 4; orchestrator
  will iterate in a follow-up commit.
- Welcome wire bump pending (server stores `rng_seed` on the handle
  but doesn't yet transmit it).

### Build health

- `cargo check --workspace`: clean
- `cargo test --workspace`: 112 pass (no regressions)
- `npm run wasm:build:dev`: clean (~5s incremental)

### Manual two-tab validation pending

```
npm run dev
# wait for cargo + wasm-pack
# open TWO http://localhost:8090/mp tabs side by side
# ?mp-debug=1 on either tab for DevTools logging
```

Expected: both tabs see each other's ships, see asteroids drifting,
see HUNTER spawn after ~1s, can fire (LMB) at HUNTER, see HUNTER
die after ~3 PULSE_CANNON hits, see asteroids split when shot,
take contact damage from HUNTER, drop to 0 HP → downed state with
revive hint, partner hovers to revive.

---

## [0.3.5] - 2026-05-17

Phase 3 Wave 3 — server-bin's `mp1_room` adopts the deterministic
`RoomState`. The Rust server now drives the full Phase-3 sim
pipeline every tick: ship physics → enemy AI → asteroid drift →
bullet integration → fire spawn → enemy spawn → collision detection
→ revive ticking → entity cull. Events fan out as `ServerMsg::Event`
frames coincident with the 20 Hz snapshot; StateChecksum heartbeat
at ~1 Hz; Resync handles checksum-miss replies.

### Architectural shape

`Slot` no longer holds a ship — ships live in `room_state.ships`,
indexed by `player_id`. `Slot` keeps per-connection metadata:
`latest_input`, `last_input_tick`, `last_fire_tick`, `out_tx`.

`Mp1RoomState` wraps `rainboids_sim::mp1::state::RoomState` (multi-
entity) instead of a bespoke `HashMap<u32, Slot{ship,…}>`.

### Per-tick pipeline

1. **Ship physics** — `update_ship` per ship; downed ships get a
   neutral input so they don't move.
2. **Enemy AI** — `update_enemy` per HUNTER; targets built from
   alive non-downed ships.
3. **Asteroid drift** — `update_asteroid` per asteroid (wraps at
   field edges).
4. **Bullet integration** — `update_bullet` per bullet (cull
   off-field / expired lifetime).
5. **Fire input → spawn** — edge-triggered with
   `PULSE_CANNON_COOLDOWN_TICKS = 24` (400 ms). Emits
   `EventPayload::BulletSpawn`.
6. **Enemy spawn** — every `ENEMY_SPAWN_PERIOD = 600` ticks (10 s),
   `spawn_hunter_from_seed` via `rng::sub_seed`. Emits
   `EventPayload::EnemySpawn`.
7. **Collision** — `collision::run_collisions` on the 4 Phase 3
   pairs. Returns a `Vec<CollisionEvent>` translated to
   `EventPayload::{BulletHit, EnemyDestroy, AsteroidSplit,
   ShipDamaged, ShipDowned}`.
8. **Revive ticking** — for each downed ship, count nearby alive
   ships within `REVIVE_RADIUS`, call `damage::tick_revive_meter`.
   On `JustRevived`, call `damage::revive_ship` + emit
   `EventPayload::ShipRevived`.
9. **Cull** — `retain(|e| e.active)` for enemies / asteroids /
   bullets to keep vecs tight.

### Broadcasts

- **Every tick with events**: `ServerMsg::Event { tick, payloads }`
  to all slots. Carries spawn/hit/destroy/damage/revive moments
  at tick precision (cosmetic timing).
- **Every 3 ticks (~20 Hz)**: `ServerMsg::Snapshot` to all slots.
  Ship state only — deterministic kinds reconstructed client-side.
- **Every 60 ticks (~1 Hz)**: `ServerMsg::StateChecksum`. Four
  u64 hashes (ships / enemies / asteroids / bullets) computed
  via `f64::to_bits().hash()` for cross-runtime stability.

### Resync round-trip

- `ClientMsg::Resync { client_tick }` → `RoomCmd::Resync { player_id }`
- Room actor builds a `ServerMsg::Resync { tick, rng_seed, ships,
  enemies, asteroids, bullets }` payload (one-shot full-state) and
  sends to ONLY the requesting slot via `send_resync_to`.
- Client re-seeds its RngCtx from `rng_seed` and replaces its local
  entity state with the wire records.

### Initial state

- Room boot spawns `INITIAL_ASTEROIDS = 4` asteroids via
  `seed_initial_asteroids` (deterministic from room seed).
- First enemy spawns at `tick = 60` (1 s in).

### Welcome

`Welcome.rng_seed` field is **plumbed through `Mp1RoomHandle.rng_seed`**
and stored on the room. The wire still uses the Phase-2 Welcome
shape (no `rng_seed` field yet) — Wave 4 adds the field when the
JS client adopts the deterministic mirror. Until then the seed is
"server-only knowledge" used to construct the deterministic stream;
clients running the Phase-2 protocol see the same ship snapshots as
before, plus the new Event/Snapshot/StateChecksum frames (which
they'll start consuming in Wave 4).

### Build health

- `cargo check --workspace`: clean
- `cargo test --workspace`: 112 pass (no regressions)

### Pending (Wave 4 — client integration)

- `js/mp/wire-codec.js` extended for Event/StateChecksum/Resync
- `js/mp/mp-engine.js` runs the deterministic sim (via the same
  WASM compile + new World API exports) and consumes Event frames
- `js/mp/mp-renderer.js` draws enemies/asteroids/bullets from the
  WASM-state mirror
- Welcome wire bumps to carry `rng_seed`
- Two-tab smoke validates the full Phase-3 combat loop

---

## [0.3.4] - 2026-05-17

Phase 3 Wave 2 — state + wire reshape. Foundations land for the
Phase 3 deterministic sim integration. `WIRE_VERSION` bumps 1→2.

### Changed — `mp1::state::ShipState` gains `downed` + `revive_meter`

Plus `player_id: u32`. The single-ship `GameState` surface (used by
the WASM client's Phase-2 `World` API) stays — same struct, just
with more fields, all defaulted in `ShipState::default()`. Existing
accessors (`ship_x`, `ship_y`, etc.) unaffected.

`damage.rs` drops its local pinned `ShipState` copy and re-exports
`super::state::ShipState` instead — the two shapes are now one,
canonically owned by state.rs. All `damage::*` callers (collision,
future room actor) get the same type.

### Added — `mp1::state::RoomState`

Multi-entity authoritative state for Phase 3:

```rust
pub struct RoomState {
    pub tick: u32,
    pub field_w: f64,
    pub field_h: f64,
    pub ships:     Vec<ShipState>,      // up to MAX_PLAYERS (8)
    pub enemies:   Vec<EnemyState>,     // up to MAX_ENEMIES (4)
    pub asteroids: Vec<AsteroidState>,  // up to MAX_ASTEROIDS (16)
    pub bullets:   Vec<BulletState>,    // up to MAX_BULLETS (64)
    pub next_enemy_id:    u32,
    pub next_asteroid_id: u32,
    pub next_bullet_id:   u32,
    pub enemy_spawn_at_tick: u32,
    pub rng: RngCtx,
}
```

Constructed via `RoomState::from_seed(seed)`. Server picks the seed
at room boot; clients receive it (Wave 3 will add the field to
`Welcome`) and seed their mirror identically — same RNG stream,
both sides.

`GameState` (single-ship) stays for backward compatibility with
the WASM client's existing `World` API. They share `ShipState`.
Phase 4+ unifies them when the WASM client adopts the full
deterministic sim.

### Added — Wire-format Phase 3 extensions

New variants on `ServerMsg`:
- `Event { tick, payloads: Vec<EventPayload> }` — bundled one-shot
  moments (spawns, hits, destroys, damage, downed, revived)
- `StateChecksum { tick, ships_hash, enemies_hash, asteroids_hash,
  bullets_hash }` — periodic safety heartbeat (~1 Hz)
- `Resync { tick, rng_seed, ships, enemies, asteroids, bullets }`
  — full-state recovery payload sent only on client request

New variant on `ClientMsg`:
- `Resync { client_tick }` — client signals checksum miss

New `EventPayload` enum (11 variants): `EnemySpawn`, `AsteroidSpawn`,
`BulletSpawn`, `BulletHit`, `EnemyDestroy`, `AsteroidSplit`,
`ShipDamaged`, `ShipDowned`, `ShipRevived` (+ reserved slots).

New wire records for Resync: `EnemyWire`, `AsteroidWire`, `BulletWire`
— carry every field needed to bootstrap the deterministic mirror.

### Changed — `WIRE_VERSION` 1 → 2

Servers running 0.3.4+ reject Hellos with `wire_version: 1`. Clients
running 0.3.4+ send `wire_version: 2`. The JS-side wire codec
(`js/mp/wire-codec.js`) needs to bump its `WIRE_VERSION` const to
2 too in Wave 3 client integration.

### Server-bin minor extension

`mp1_connection.rs` adds a `ClientMsg::Resync` arm — currently
just logs the request; the Phase-3 Wave-3 room actor rewrite will
wire it through to `ServerMsg::Resync` reply.

### Tests + build

- `cargo test --workspace`: **112 pass** (no regressions)
- `npm run wasm:build:dev`: succeeds, WASM rebuild OK

### Pending (Wave 3)

- `server-bin::mp1_room` adopts `RoomState` (drops Phase-2 HashMap
  shape, drives multi-entity, emits events)
- Welcome carries `rng_seed`
- StateChecksum broadcast loop in the room tick
- Resync request → reply
- JS-side wire-codec extended for the new wire variants
- WASM client begins running the deterministic sim modules

---

## [0.3.3] - 2026-05-17

Phase 3 Wave 1 — leaf simulation modules in `server/sim/src/mp1/`.
Foundation for the deterministic-first MP combat roster. All seven
new modules compile + test in isolation; **integration into the room
actor + wire format lands in Wave 2.** Nothing player-visible yet.

### Added — `mp1::trig`

Polynomial sin/cos/atan2 over f64. 11-degree odd Taylor for sin
(reduced into [-π/2, π/2] via integer round + fold); cos via
`sin(x + π/2)` so Pythagoras is exact-by-construction; atan2 via
quadrant fold + anchored-cubic polynomial from
`archive/sim-parity/js-sim/trig.js`. Realistic accuracy ~3e-5 vs
`f64::sin` — **accuracy isn't the goal; determinism is**. Uses ONLY
`+ - * /`, comparisons, and `f64::abs`. No transcendentals, no
sqrt, no platform-sensitive ops.

### Added — `mp1::rng_ctx`

Per-room PCG-64 wrapper with a sub-seed generator. `sub_seed()` lets
each spawn/split event derive its own deterministic sub-RNG without
contaminating the room's main stream (proven via the
`sub_seed_does_not_contaminate_main` test). Convenience samplers:
`range_f64`, `range_i32`, `bool_at_prob`, `pick_index`,
`unit_circle_angle` — all built on `next_u64` + IEEE-754 bit
conversions (top-53-bits → mantissa).

### Added — `mp1::asteroid`

Drift + deterministic split. `AsteroidState` holds id / pos / vel /
rot / radius / hp. `spawn_from_seed(id, rng_subseed, field)` produces
the same asteroid byte-for-byte from the same inputs.
`compute_split_children(parent, rng_subseed, child_id_start)` derives
3-4 children from the sub-seed; both server and client compute the
same split outcome from the AsteroidSplit event's seed. Uses
`super::trig::*` throughout — no `f64::sin`.

### Added — `mp1::bullet`

Straight-line projectile. `BulletState::position_at(current_tick)` is
**bit-exact** across runtimes — pure `+` and `*` on f64, no trig.
Spawn parameters (origin, velocity, spawn_tick) carried in the
`BulletSpawn` wire event; client integrates trajectory locally.
`update_bullet` decrements lifetime + culls off-field. PULSE_CANNON
constants: BULLET_SPEED = 8.0 px/tick, DAMAGE = 1.2, LIFETIME = 240
ticks (4 s).

### Added — `mp1::enemy`

HUNTER chase + arc-orbit AI. `EnemyState` carries chase-arc params
(arc_dir, arc_radius, arc_omega, arc_phase) seeded once at spawn
from `rng_subseed`. `update_enemy(e, targets, field)` picks the
closest alive target, runs the arc-offset chase, and bounces at
field edges. Constant-omega arc replaces solo's wall-clock-keyed
vortex (since the sim has no wall clock by Phase 3 design). Lerp
angle factor = 0.08 matches solo's `enemy.turnSpeed`.

### Added — `mp1::damage`

Energy-tank HP model + Diablo-style revive. `apply_damage` returns
`DamageOutcome::{Damaged, JustDowned, NoOp}`. Downed ships are
**not respawned** — another alive ship hovering within
`REVIVE_RADIUS = 80 px` for 3 s (180 ticks at 60 Hz) fills the
revive meter; leaving the radius drains it at 2× the fill rate.
`all_downed(ships)` predicate signals game-over for the room when
true. Phase 3 explicitly omits powerup / shield / reflex / spare-
ship branches from solo's `takeDamage`.

### Added — `mp1::collision`

Phase-3-relevant collision pairs: bullet × enemy, bullet × asteroid
(with deterministic split call), ship × enemy contact, ship × asteroid
contact. N² over ~50 entities — trivial; broadphase deferred.
**Friendly fire is OFF by omission** — no bullet × ship pair test
exists. `CollisionEvent` enum returned to caller for wire-event
mapping (Wave 2). Emits BulletHit, EnemyDestroyed, AsteroidDestroyed
(with split children + sub-seed), ShipDamaged, ShipDowned.

### Tests

`cargo test --workspace` — **112 pass** (up from 54). New: 7
`asteroid` tests, 6 `bullet` tests, 8 `enemy` tests, 14 `damage`
tests, 11 `collision` tests, 8 `rng_ctx` tests, 6 `trig` tests.
Determinism invariants verified: same-seed-same-output for spawn,
sub-seed-doesn't-contaminate-main, deterministic split children
match bit-for-bit across two calls.

`npm run wasm:build:dev` — succeeds (~9s incremental, ~135KB
unoptimized — the new modules add ~50KB compressed).

### Pending (Wave 2)

- `mp1::state` reshape: multi-ship + multi-entity `RoomState`
  replacing the Phase-1 single-ship `GameState`
- `mp1::wire` extensions: `EventPayload` enum + `StateChecksum`
  variant + `Resync` round-trip
- WIRE_VERSION bump 1→2
- `server-bin::mp1_room` adopts new RoomState; emits events instead
  of (or alongside) snapshots for deterministic entity kinds
- `js/mp/` integration: WASM client also calls the deterministic
  sim modules; remote-ship rendering extends to enemies/asteroids/
  bullets via the same Rust code path

---

## [0.3.2] - 2026-05-17

Client-side Phase 2 lands. The `/mp` browser page now connects to
`rainboids-server` over the binary `/mp/ws` channel, runs local
WASM-side prediction for the user's own ship, and renders remote
ships from server snapshots with ~100 ms interpolation.

### Added — `js/mp/wire-codec.js` (~325 lines)

Self-contained JS bincode 1.x reader matching the Rust mp1::wire
byte layout (externally-tagged enums, f64 scalars, u64 fixint LE,
length-prefixed strings/Vecs).

Exports: `WIRE_VERSION`, `decodeServerMsg`, `decodeWireVersion`,
`encodeClientMsg`, `encodeHello`, `encodeInput`, `encodeBye`.

`u64` is decoded/encoded via Number (split into hi/lo u32 pairs).
Safe up to `Number.MAX_SAFE_INTEGER` — Phase 2 never sends a value
beyond `Vec` lengths in the hundreds. If Phase 4+ ever needs true
u64 ids, switch to BigInt; for now the Number API avoids friction.

### Added — `js/mp/mp-ws.js` (~155 lines)

Pure transport. `connect({name, onWelcome, onSnapshot, onPeerJoined,
onPeerLeft, onError, onClose})` opens a binary WS to `/mp/ws`, sends
`Hello` on open (with `VERSION_MP` + `WIRE_VERSION`), dispatches
incoming `ServerMsg` variants to callbacks. Returns
`{sendInput, sendBye, close, isOpen}`.

**Tier 1 debug logging** behind `?mp-debug=1` URL flag OR
`localStorage.rainboidsMpDebug='1'`. When on, every frame in/out is
console.log'd as a decoded JS object — DevTools shows it as an
expandable tree. When off, the `if (MP_DEBUG)` gates are
JIT-eliminated; zero production cost.

Decode failures `console.error` unconditionally (a corrupt frame
is always worth surfacing); the MP_DEBUG gate only silences the
per-frame trace.

### Changed — `js/mp/mp-engine.js` extended for WS + interp

New signature: `start(World, debugEl, canvas, { name = 'Pilot' } = {})`.

- `?solo=1` URL flag skips WS entirely (pure-local prediction).
- WS callbacks maintain `remoteShips: Map<player_id, InterpTrack>`,
  each track holding the last 6 samples (~300 ms at 20 Hz).
- 30 Hz input upload throttle (`INPUT_SEND_INTERVAL_MS = 33`) gated
  on `ws.isOpen()`. `client_tick` increments per send.
- Each RAF frame: local prediction first (`world.tick(dt)` — instant
  feel), then sample each remote track at `now - 100 ms` via shortest-
  path angle interpolation, then render.
- Debug overlay shows: tick / pos / aim / fps / **ws state / peers /
  pid / last server tick** / `mp X.Y.Z` build tag.

`Welcome.spawn_x/y` from the server is logged but NOT applied to the
WASM `World` (no position setter yet). Local prediction starts at
the WASM default; Phase 4 reconciliation will snap to server truth.

### Changed — `js/mp/mp-renderer.js` extended for remote ships

New signature: `render(ctx, canvas, world, aim, remoteShips = [])`.

- Helper extracted: `drawShipTriangle(ctx, x, y, angle, fill, stroke, scale)`.
  Local ship rendering byte-identical to before.
- Remote ships drawn in palette-indexed colors via
  `player_id % palette.length`: cyan, magenta, yellow, lime,
  orange, purple.
- Each remote ship gets a `P<player_id>` label 8 px above the tip,
  counter-scaled by `1/scale` so the label stays screen-stable
  across letterbox sizes. No label above the local ship (it's "you").

### How to see it

```
npm run dev           # starts http-server + cargo + wasm-pack
# wait for the cargo build (~30s cold)
# open TWO http://localhost:8090/mp tabs side by side
# add ?mp-debug=1 to either for DevTools console logging
```

Within a few seconds both tabs should show their own white ship +
the other player's colored ship + a `P<n>` label. Move with WASD;
the other tab follows ~100 ms behind.

### Tests

JS-side has no automated tests yet — the Rust round-trips (cargo
test) cover the wire format byte-exact. A Playwright two-tab smoke
spec lands in a follow-up.

---

## [0.3.1] - 2026-05-17

Server-side Phase 2 lands. The Rust binary now serves a fresh
`/mp/ws` WebSocket endpoint parallel to the legacy `/ws` — same
process, same port (`:8443`), different room actor. Legacy `/ws`
keeps its 44-test integration coverage; `/mp/ws` is the new path
clients will use.

### Added — Single global mp1 room actor

`server/server-bin/src/mp1_room.rs` (~300 lines). One `Mp1RoomState`
holding a `HashMap<u32, Slot>` (Phase 5 will add real matchmaking),
per-slot input cache, per-slot outbound mpsc channel. Async actor
ticks every `1_000_000 / 60` µs (precise 60 Hz); broadcasts a
`Snapshot` every 3rd tick (~20 Hz). Each receiver gets their own
snapshot with their own `acked_input_tick`.

`Slot` carries the player's `ShipState` + `latest_input` + outbound
channel. `update_ship` is called per-slot per-tick with that
slot's input.

`select!` uses `biased;` so the tick interval wins over the command
backstop — a flood of inputs can't starve simulation. Inputs and
Leave commands are drained at the top of each tick from an
`mpsc::unbounded_channel<RoomCmd>`. Snapshots and PeerJoined/PeerLeft
broadcasts use cloneable `Vec<u8>` of pre-encoded bytes.

### Added — Per-connection task for `/mp/ws`

`server/server-bin/src/mp1_connection.rs` (~180 lines). Per-WS
async task:
1. Wait for `Hello` (5s timeout). Reject if not received or wrong
   wire_version.
2. Join the room, get `(player_id, spawn_x, spawn_y)`, send `Welcome`.
3. Broadcast `PeerJoined` to other slots.
4. Spawn a writer task draining the per-slot outbound queue → WS sink.
5. Reader loop: decode `ClientMsg::Input` → enqueue
   `RoomCmd::Input { player_id, msg }` to the room. `ClientMsg::Bye`
   or WS close → enqueue `RoomCmd::Leave` (which triggers `PeerLeft`).

### Added — `/mp/ws` HTTP route in axum

`server/server-bin/src/server/http.rs`: new `mp1_ws_upgrade` handler
mounted at `/mp/ws`. `AppState` gains a `mp1: Mp1RoomHandle` field;
`main.rs` spawns the single global handle at boot via
`Mp1RoomHandle::spawn()`.

### Architecture note

The server's `Mp1RoomState` is intentionally a SEPARATE shape from
`mp1::state::GameState` (the WASM client's single-ship state). The
client's `World` runs one ship; the server's room runs N ships in a
HashMap. Both call the same `mp1::ship::update_ship` for physics —
the only difference is the container around it.

Phase 2 single-global-room is deliberate; matchmaking + multi-room
ship in Phase 5.

### Tests

`cargo test --workspace`: 54 pass (no regressions). The legacy
integration tests in `tests/common/mod.rs` now stub
`mp1: Mp1RoomHandle::spawn()` into AppState since the field is
required.

---

## [0.3.0] - 2026-05-17

Foundation for Phase 2 wire integration: switch `mp1` from JSON-tagged
to binary bincode wire format, and convert all scalars to f64 to match
JavaScript Number precision (eliminates implicit narrowing at the
wasm-bindgen boundary).

### Changed — All `mp1` scalars are now f64 (was f32)

`mp1::state::ShipState` (x, y, vx, vy, angle, hp, max_hp, radius),
`mp1::input::PlayerInput` (aim_x, aim_y, speed_mult, thrust_power),
`mp1::ship::update_ship` math, tuning constants (`MAX_V`, `VEL_EPSILON`,
`BOUNCE_DAMP`, `TICK_SCALE`, `THRUST_PER_TICK`, `friction_per_tick`),
the WASM `World` accessors (`ship_x`, `ship_y`, `ship_vx`, `ship_vy`,
`ship_angle`, `ship_radius`, `field_width`, `field_height`,
`set_input`, `tick`), and the wire-format `SnapshotShip` /
`ClientMsg::Input` / `ServerMsg::Welcome` fields — all f64.

**Why**: JS Number is f64. WASM↔JS marshalling of f32 goes through
implicit widening/narrowing which can break byte-identical math
between the WASM client and the native server. f64 throughout =
same math, both sides. Future Phase 4 prediction reconciliation
benefits directly. Wire cost: ~70% larger snapshot (228 B vs 132 B
for 4 ships), still trivial at Phase 2 wire volume.

### Changed — Wire format is now bincode (binary), not JSON

`mp1` ships a `codec` module (`server/sim/src/mp1/codec.rs`) exposing
`encode_server` / `decode_client` / `encode_client` / `decode_server`
helpers using `bincode 1.x` with `DefaultOptions + with_fixint_encoding
+ with_little_endian` — matches the legacy `protocol::codec` so the
JS-side decoder mirrors the same conventions.

Sample wire sizes:
- `Hello { name="pilot", client_version="0.2.1", wire_version=1 }`: 34 bytes
- `Welcome` (player_id, server_tick, spawn_x, spawn_y): 28 bytes
- `Input` (28 bytes): 4 (variant) + 4 (tick) + 4 (4×bool) + 16 (2×f64)
- `Snapshot` (4 ships): ~228 bytes
- `Bye`: 4 bytes

At 4 players × 20 Hz snapshot + 30 Hz input: ~4.5 KB/s server-out per
client, ~0.84 KB/s upload per client — ~6× smaller than JSON would be.

Tier 1 debug visibility is still possible because the same wire types
also serialize to JSON via `serde_json` (dev-dep). The browser-side
WS layer (mp-ws.js, landing in 0.3.2) logs decoded JS objects behind
`?mp-debug=1` for DevTools inspection.

### Changed — Externally-tagged enum encoding

Removed `#[serde(tag = "kind")]` from `ClientMsg` and `ServerMsg` —
internally-tagged enums need `deserialize_any` which bincode 1.x
(non-self-describing) doesn't support. Externally-tagged works for
both bincode (`<u32 variant index><fields>`) AND JSON
(`{"VariantName": {field: ...}}`). Cost: slightly less pretty JSON
keys, but all encoders/decoders work cleanly.

### Added — `Snapshot.acked_input_tick` field (4 bytes, forward-compat)

Server's Snapshot now carries the client's last-applied input tick
number. Phase 2 doesn't use it; Phase 4 reconciliation will replay
pending local-prediction inputs from `acked_input_tick + 1` forward
when the server's authoritative position diverges from prediction.
Cheap to add now (4 bytes per snapshot), expensive to retrofit later.

### Tests

- `cargo test -p rainboids-sim`: 11 pass (6 wire JSON round-trips + 5
  codec bincode round-trips + 1 size-floor regression + 1 cross-format
  invariant + 1 legacy protocol test).
- `cargo test --workspace`: 54 pass (no `rainboids-server` regressions).
- `npm run wasm:build:dev`: succeeds (~7s incremental, ~135 KB output).

---

## [0.2.1] - 2026-05-17

### Fixed — WASM build dependencies

`server/client-wasm/Cargo.toml` now declares `getrandom = { features = ["js"] }`
and `uuid = { features = ["js"] }` as direct deps so Cargo feature
unification enables the browser-crypto randomness backend on
`wasm32-unknown-unknown`. Native (server-bin) builds ignore these.

Without this, `wasm-pack build` failed with:
```
error: the wasm*-unknown-unknown targets are not supported by default,
       you may need to enable the "js" feature.
```

`npm run wasm:build:dev` now succeeds (~28s cold compile, ~135KB
unoptimized output). The browser side of Phase 1 is unblocked.

---

## [0.2.0] - 2026-05-17

Phase 1 — WASM round-trip: a single player-controlled ship visible on `/mp`,
moving under WASD + mouse aim, driven entirely by Rust simulation compiled
to WebAssembly. No server, no networking — local single-client prediction
only. The architectural goal is proven end-to-end.

### Added — `rainboids-sim::mp1` fresh-rewrite submodule

Phase-1 minimal simulation authored fresh from current solo behavior
(`js/sim/ship.js`, `js/modules/core/constants.js`). Mirrors solo's ship
physics step-for-step:

- `mp1::state::ShipState` + `GameState` — single ship + world bounds. Centered
  at `(960, 540)`, facing up (`angle = -π/2`), 100 HP, `radius = 15`.
- `mp1::input::PlayerInput` — WASD bools + world-space aim + speed_mult /
  thrust_power / thrusters_disabled / fire. Constants pulled directly from
  solo: `MAX_V = 3.5`, `VEL_EPSILON = 0.05`, `BOUNCE_DAMP = 0.8`,
  `friction = pow(0.5, 0.5) ≈ 0.7071`.
- `mp1::ship::update_ship` + `tick_phase1` — aim atan2 → WASD move-integration
  → friction → snap-to-zero → max-speed clamp (with 70%-boost rule) → position
  update → boundary bounce with damp. Byte-for-byte equivalent to solo.

The legacy `sim::state` / `input` / `ship` modules stay at the crate root
unchanged; `mp1` is a parallel submodule. This preserves the 44-test
`rainboids-server` integration suite while the WASM client gets a clean
fresh implementation. Legacy modules archive as Phase 1+ rewrites land.

### Added — `rainboids-client-wasm` `World` API

Replaces the Phase-0 smoke stub with the real Phase-1 surface:

- `World::new()` — construct one Phase-1 `GameState`
- `set_input(up, down, left, right, aim_x, aim_y)` — push this frame's input
- `tick(dt)` — advance one tick of ship physics
- `ship_x() / ship_y() / ship_vx() / ship_vy() / ship_angle() / ship_radius()`
- `field_width() / field_height() / tick_count()`

`smoke_test()` + `build_info()` preserved for the boot-time WASM check.

### Added — `/mp` Phase-1 client (`js/mp/`)

Fresh, thin client layer wired around the WASM module:

- `mp-main.js` — boots, dynamic-imports `./wasm/rainboids_client_wasm.js`,
  awaits `init()`, hands the `World` constructor to the engine. On import
  failure, the debug overlay prompts the user to run `npm run wasm:build`.
- `mp-engine.js` — RAF loop. Reads input, projects mouse pixel coords into
  world coords (inverse of the renderer's letterbox transform), calls
  `world.set_input(...)` + `world.tick(dt)` + `render(...)`. dt clamped to
  `[0, 0.1]s`. Debug overlay refreshes every 10 frames with tick / pos /
  aim / FPS.
- `mp-renderer.js` — Canvas2D. Letterboxes the 1920×1080 world into the
  viewport. Draws field outline, aim crosshair (cyan), ship triangle (white,
  pointing along `ship_angle`).
- `mp-input.js` — window keydown/keyup for WASD + arrows, canvas mousemove
  for aim, mousedown/up for `fire`. `preventDefault` on movement keys to
  suppress page scroll. Clears all keys on `window.blur` so focus-loss
  mid-press doesn't leave the ship drifting.

### To actually see the ship

Requires the WASM toolchain (one-time install):

```bash
cargo install wasm-pack
rustup target add wasm32-unknown-unknown
```

Then build + serve:

```bash
npm run wasm:build:dev    # outputs to js/mp/wasm/
npm run dev:solo          # http-server on :8090
# open http://localhost:8090/mp
```

### Build health
- `cargo check --workspace`: clean (all 3 crates)
- `cargo test --workspace`: 44/44 pass (no `rainboids-server` regressions)

---

## [0.1.0] - 2026-05-17

Initial scaffold for the WASM pivot. MP becomes a deliberately separate
product from solo, built on one canonical Rust simulation crate
(`rainboids-sim`) that compiles both natively (for the server binary)
and to WebAssembly (for the browser client at `/mp`).

See `docs/Multiplayer WASM Pivot – 2026-05-17.md` for full rationale.

### Added
- `server/` restructured as a Cargo workspace with three member crates:
  - `rainboids-sim` — canonical simulation (compiles native + WASM)
  - `rainboids-server` — authoritative multiplayer server binary
  - `rainboids-client-wasm` — wasm-bindgen wrapper exposing the sim to JS
- `mp.html` page at project root — minimal canvas + debug overlay,
  loads `js/mp/mp-main.js`.
- `js/mp/` MP entry point and stub modules (`mp-main.js`, `mp-engine.js`,
  `mp-renderer.js`, `mp-input.js`, `mp-particles.js`, `mp-audio.js`,
  `mp-hud.js`). Phase 0 is a smoke harness; real game arrives Phase 1+.
- `VERSION-MP` + `CHANGELOG-MP.md` — MP versions independently.
- Title screen now shows `sp 6.2.0` and `mp 0.1.0` lines (mp dimmer).
- `server/client-wasm/src/lib.rs` exports `smoke_test()` returning 42
  and `build_info()` returning a static version string, used by
  `mp-main.js` to verify the WASM round-trip works.

### Changed
- Title-screen MULTIPLAYER button is now visible to all players (was
  gated behind `?multiplayer=1` query param / `localStorage.rainboidsMultiplayer='1'`).
  Per the WASM-pivot decision: visible, no EXPERIMENTAL badge.
- MULTIPLAYER click handler navigates to `/mp` instead of opening the
  legacy modal that connected via the old EngineDriver online path.
  The modal source remains on disk but unreachable from the UI;
  archives in Phase 1.
- `js/net/ws-client.js` `multiplayerEnabled()` now returns `true`
  unconditionally; the feature flag is vestigial.

### Removed
- Parity-test scaffolding archived to `archive/sim-parity/`:
  - `server/tests/parity_*.rs` (8 files) + `pcg64_trace.rs`
  - `tests/unit/sim/` (13 Jest tests)
  - `schema/SIM_SPEC.md`
- The hand-port simulation strategy described in
  `docs/Multiplayer Planning — 2026-05-06.md` and the Phase 2.5
  collision rollout are formally superseded; the coordination doc has
  been updated to point at the WASM pivot plan as canonical.

### Deferred to Phase 1+
- `js/sim/*.js` (17 files) — stays in place because legacy MP imports
  still reference it; archives when the WASM round-trip is proven.
- `server/sim/src/*.rs` — relocated 9-month-stale port; overwritten
  module-by-module as each subsystem is authored fresh from current
  solo behavior.
- Legacy MP modal + EngineDriver/LoopbackConnection/Predictor/Interpolator
  wiring in `js/net/` and `js/engine/` — now unreachable, archives
  with `js/sim/` in Phase 1.
