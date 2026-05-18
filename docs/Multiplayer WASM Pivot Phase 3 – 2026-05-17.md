# Multiplayer WASM Pivot — Phase 3 — 2026-05-17

> ## ⚡ Architecture Revision (2026-05-17, deterministic-first)
>
> **Open questions answered + significant architecture shift.** Per
> user decision, Phase 3 commits to **full determinism** for
> bullets / asteroids / enemies — the client predicts ALL entities
> locally via the same WASM-compiled sim that the server runs natively.
> Server stops broadcasting per-snapshot entity state for the
> deterministic kinds; sends only spawn / death / state-divergence
> events plus a periodic state-checksum heartbeat. **~4× bandwidth
> reduction** vs the original Phase 3 plan below.
>
> ### Decisions locked in
>
> 1. **First enemy: HUNTER** (chase + arc-orbit). Per recommendation.
> 2. **Fire button: LMB only.** Held W stays movement.
> 3. **Death model: energy tanks + Diablo revive.** Player has energy
>    tanks that deplete on hit; at 0 the player is **downed** (game-
>    over for that player if alone). In MP, another player can
>    **hover within a revive radius** for a fixed period to fill a
>    revive meter that revives the downed player. If the reviver
>    leaves the radius the meter **drains**; re-entering resumes
>    fill. Solo's energy-tank model ports forward verbatim from
>    `js/modules/player/lifecycle.js`. **No respawn timer.** Game
>    ends when all players in the room are downed simultaneously.
> 4. **Friendly fire: OFF.** Bullets exclude `owner_player_id ==
>    ship.player_id`.
> 5. **Asteroid splits: DETERMINISTIC** (revised from "server picks +
>    broadcasts"). See determinism section below.
> 6. **Bullets: DETERMINISTIC** (revised from "snapshots + events").
>    See determinism section below.
>
> ### What determinism buys us (bandwidth)
>
> | Approach | Snapshot size (4 ships + 4 enemies + 16 asteroids + 30 bullets) | @ 20 Hz × 4 clients |
> |---|---|---|
> | **Original Phase 3 plan** (per-snapshot entity state) | ~3 KB | ~240 KB/s aggregate |
> | **Deterministic** (snapshot = ships only; entity state = client-computed) | ~228 B | ~18 KB/s aggregate |
> | **Reduction** | ~13× | **~13×** |
>
> Plus event stream (spawn/hit/destroy) at ~1–2 KB/s/client, plus
> state-checksum heartbeat at ~12 B/sec/client. Net Phase 3 server-
> out per client: **~6 KB/s typical, ~12 KB/s peak combat** — within
> rounding error of Phase 2 (which was ship-only at ~5 KB/s).
>
> ### What determinism requires (discipline)
>
> Three invariants the sim code MUST hold for the deterministic
> architecture to survive contact with reality:
>
> 1. **All math is f64 IEEE 754** (already done in 0.3.0). `+`, `-`,
>    `*`, `/` are bit-exact across WASM + x86_64. **`sin`/`cos`/
>    `atan2` are NOT** — they can differ by 1 ULP between compilers.
>    Solution: **`mp1::trig`** — polynomial approximations of sin/cos/
>    atan2 written in pure arithmetic, ported forward from
>    `archive/sim-parity/js-sim/trig.js`. Both the WASM client and
>    the native server import and use these instead of `f64::sin`
>    etc. inside the sim.
>
> 2. **All RNG goes through a per-room seeded source.** No
>    `rand::random()`, no `Math.random()`, no `tokio::time::Instant`,
>    no wall-clock dependencies inside the sim. Server seeds the
>    PCG-64 once at room boot, client receives the seed in `Welcome`
>    and seeds its mirror identically. Every spawn/jitter/split call
>    consumes from `ctx.rng`.
>
> 3. **A safety net for when determinism breaks** (and it will,
>    eventually). Server broadcasts a small `ServerMsg::StateChecksum
>    { tick, ships_hash, enemies_hash, asteroids_hash, bullets_hash }`
>    every 60 ticks (1 second). Client computes the same hash over
>    its predicted state; on mismatch, requests a `ClientMsg::Resync`
>    and the server replies with a one-shot full-snapshot
>    `ServerMsg::Resync { tick, ships, enemies, asteroids, bullets,
>    rng_state }`. ~12 B/sec/client overhead; covers all rare
>    determinism-break scenarios (packet loss of a spawn event,
>    transcendental drift, browser-bug-day).
>
> ### What's on the wire (revised)
>
> **Server → Client every 20 Hz**:
> - `Snapshot { tick, acked_input_tick, ships: Vec<SnapshotShip> }`
>   — ship positions ONLY. Other entities are client-computed from
>   the deterministic sim.
>
> **Server → Client coincident with snapshots**:
> - `Event { tick, payloads: Vec<EventPayload> }` — discrete moments
>   the deterministic sim alone can't fully express:
>   - `EnemySpawn { enemy_id, kind, x, y, vx, vy, rng_subseed }` —
>     when the server's enemy-spawn timer fires; client immediately
>     instantiates the same enemy from the seed.
>   - `BulletSpawn { bullet_id, owner_player_id, x, y, vx, vy,
>     spawn_tick, weapon }` — when a player's `fire` triggers a
>     spawn. Client integrates the bullet forward from this point.
>   - `AsteroidSpawn { asteroid_id, x, y, vx, vy, rot, rot_vel,
>     radius, rng_subseed }` — emitted at room boot (3-4 asteroids)
>     and any time the server spawns a fresh asteroid.
>   - `BulletHit { bullet_id, target_kind, target_id, hit_tick }` —
>     server-authoritative hit confirmation. Client snaps its bullet
>     to dead and triggers spark cosmetic at the named tick.
>   - `EnemyDestroy { enemy_id, by_bullet_id, kill_tick }` —
>     authoritative death confirmation.
>   - `AsteroidSplit { parent_id, kill_tick, rng_subseed }` —
>     deterministic split outcome derived from `rng_subseed` so
>     client and server compute the same children.
>   - `ShipDamaged { player_id, by_kind, by_id, hit_tick, amount }`,
>     `ShipDowned { player_id, at_tick }`, `ShipRevived { by_player_id,
>     revived_id, at_tick }` — energy-tank / revive lifecycle.
>
> **Server → Client every 60 ticks (1 Hz)**:
> - `StateChecksum { tick, ships_hash, enemies_hash, asteroids_hash,
>   bullets_hash }` — 20-byte safety heartbeat.
>
> **Client → Server**:
> - `Input { client_tick, up, down, left, right, fire, aim_x, aim_y }`
>   — unchanged from Phase 2 except `fire` is now load-bearing.
> - `Resync { client_tick }` — NEW. Client sends on checksum mismatch.
>   Server responds with `ServerMsg::Resync`.
>
> ### Sim-code additions (revised)
>
> | File | Purpose | Notes vs original plan |
> |---|---|---|
> | `server/sim/src/mp1/trig.rs` | Polynomial `sin64`/`cos64`/`atan2_64` | **NEW.** Ported forward from `archive/sim-parity/js-sim/trig.js`. Both server + WASM use these instead of `f64::*` builtins to guarantee bit-exact trig across runtimes. |
> | `server/sim/src/mp1/rng_ctx.rs` | `RngCtx { pcg: Pcg64, subseed_counter: u64 }` + helpers | **NEW.** Thin wrapper around `mp1::rng::Pcg64` with a sub-seed generator for split / spawn events (so each split has its own deterministic sub-RNG without state-contamination). |
> | `server/sim/src/mp1/enemy.rs` | HUNTER chase + arc using `trig::*` | Per original plan; trig swap is the only change |
> | `server/sim/src/mp1/bullet.rs` | Straight-line projectile | Per original plan; trivially deterministic |
> | `server/sim/src/mp1/asteroid.rs` | Drift + deterministic split | Split logic now derives from `rng_subseed`; both sides compute the same children |
> | `server/sim/src/mp1/collision.rs` | Phase 3 pairs | Per original plan |
> | `server/sim/src/mp1/damage.rs` | Energy tanks + revive meter | **REVISED.** No respawn; downed state + Diablo revive (`REVIVE_RADIUS = 80 px`, `REVIVE_DURATION_TICKS = 180` = 3 s, drains 2× faster than it fills if reviver leaves the radius) |
> | `server/sim/src/mp1/weapon.rs` | PULSE_CANNON cooldown + spawn | Per original plan |
> | `server/sim/src/mp1/room.rs` | Unified `RoomState` driving all the above | Per original plan; checksum hash added |
>
> ### Open questions resolved
>
> - **Q1 — HUNTER** ✅
> - **Q2 — LMB only** ✅
> - **Q3 — Energy tanks + Diablo revive, no respawn** ✅ (revised)
> - **Q4 — Friendly fire OFF** ✅
> - **Q5 — Deterministic asteroid splits** ✅ (revised from
>   "server-authoritative split + broadcast")
> - **Q6 — Deterministic bullets** ✅ (revised from "snapshot + event
>   both")
>
> ### Reading the rest of this doc
>
> The original Phase 3 design content below — Wire format additions,
> Sim additions table, Wire-volume estimates, etc. — describes the
> NON-deterministic approach. **Read those sections as historical
> reasoning for the deterministic pivot above; the architecture
> revision overrides them where they differ.** The acceptance criteria
> + parallel-dispatch tables remain mostly applicable with the
> module additions noted above (trig.rs, rng_ctx.rs, damage.rs revised
> for revive). The Risks and Reversibility sections are still
> accurate.
>
> ### Tests + invariants determinism adds
>
> - **Cross-runtime trig parity**: unit test (Rust native) computes
>   `trig::sin64(x)` for 1000 sample angles and checks against a
>   pre-computed table. Smoke test (WASM in browser) does the same;
>   results must match exactly.
> - **RNG sequence parity**: seed Pcg64 with `42`, draw 100 values,
>   compare native vs WASM output. Already passing in legacy parity
>   tests (`archive/sim-parity/rust-parity/pcg64_trace.rs`); needs
>   to keep passing.
> - **End-to-end determinism**: integration test spawns 4 ships +
>   3 asteroids + 1 enemy, runs the sim for 600 ticks (10 s) with a
>   recorded input sequence, asserts the state hash at tick 600
>   matches a baked golden value. If a sim change breaks
>   determinism, this test fails immediately and surfaces the
>   regression before it reaches a player.
>
> ---
>
># Multiplayer WASM Pivot — Phase 3 (original plan, partially superseded by the revision above)

**Goal**: two browser tabs at `/mp` can cooperate to shoot a HUNTER
enemy and see it die. Phase 3 adds the **MVP combat roster** — one
enemy type, one weapon, one asteroid type, basic HP. No drops, no
shop, no leveling, no waves yet.

**Predecessor**: Phase 2 (`mp 0.3.0`–`0.3.2`, commits `28d1ccc` /
`f9994f9` / `1930917`) — two-tab WS round-trip live; ship-only
prediction + interpolation across `/mp/ws`.

**Reference**: `docs/Multiplayer WASM Pivot – 2026-05-17.md` (the
canonical pivot — Phase 3 inherits every architectural decision there)
and `docs/Multiplayer WASM Pivot Phase 2 – 2026-05-17.md` (the doc
this one structurally mirrors).

---

## TL;DR

- One enemy: **HUNTER**. Chase-the-player AI fresh-rewritten from
  `js/modules/enemy/{enemy,enemy-data,ai,movement,firing}.js`. No
  enemy bullets in Phase 3 — body-collision damage only. (Hunter's
  `hunter_single` burst becomes Phase 4 once enemy bullets exist on
  the wire.)
- One weapon: **PULSE_CANNON**. Single bullet on left-click. Damage
  `1.2`, fire rate `400 ms`, range = full field. Fresh-rewritten from
  `js/modules/player/weapons.js:275` (`firePulseCannon`) and
  `js/modules/player/bullet.js`.
- One asteroid type: drifts, takes damage, splits on death if the
  parent's `baseRadius >= MIN_AST_RAD + 5`. Fresh-rewritten from
  `js/modules/world/asteroid.js`.
- Basic HP: enemies and asteroids carry HP and die. Ships carry HP
  and die. Hunter contact deals collision damage. On ship death:
  3-second respawn at field center (no game-over yet — Phase 4
  picks the death model after enemy bullets land).
- Continuous enemy trickle: server spawns a HUNTER every 5 s up to
  `MAX_ENEMIES = 4`. Asteroids: 3 large rocks at room creation. No
  wave system; that's the first Phase 4 item.
- `WIRE_VERSION` bumps to `2`. Snapshot adds three new entity vectors
  (`enemies`, `asteroids`, `bullets`). One new `Event` server-msg
  variant carries bullet-spawn / enemy-death / asteroid-split /
  ship-damaged moments that snapshots can't capture.
- Client extends `mp-renderer.js` for the three new entity types.
  `mp-engine.js` adds interp tracks for enemies + asteroids (bullets
  are render-only from server snapshots; no client prediction for
  bullets in Phase 3).

---

## Authoring discipline reminder

Per the canonical pivot doc's "Authoring discipline" section
(`Multiplayer WASM Pivot – 2026-05-17.md:535-558`): every Rust sim
module added in Phase 3 is **fresh-rewritten from current solo
source**. Do NOT port from `archive/sim-parity/` — the archived
hand-port is a structural-reference template, not a behavioral
source. The behavioral source is today's `js/modules/enemy/*.js`,
`js/modules/player/weapons.js`, `js/modules/world/asteroid.js`,
`js/modules/combat/collision-system.js`.

Required at the top of each new `.rs` file:

```rust
//! Phase-3 fresh-rewrite from solo. Authored 2026-05-17.
//!
//! Solo source studied:
//!   - js/modules/enemy/enemy-data.js   (HUNTER row only)
//!   - js/modules/enemy/movement.js     (hunterArcMovement; chase fallback)
//!   - js/modules/enemy/ai.js           (updateFaceDirection, avoidAsteroids)
//!
//! Phase-3 simplifications from solo (intentional):
//!   - No territory system (one big field, all enemies hunt all players)
//!   - No bullet-dodge (no enemy bullets yet)
//!   - No level scaling (HUNTER HP fixed at 5 — solo's L1 baseline)
//!   - No microMovements / fishMotion (cosmetic; defer to Phase 5 polish)
```

The header is non-optional. Future maintainers will need to know which
solo file is canonical for each behavior, and which simplifications
are Phase-3-shortcuts vs deliberate divergence.

---

## What gets added

### Wire format additions (`server/sim/src/mp1/wire.rs`)

Bump `WIRE_VERSION` from `1` → `2`. Server still accepts only Hellos
where `wire_version` matches; the client-side `wire-codec.js` already
reads it from the Hello reply path so a mismatch surfaces immediately
in DevTools.

New snapshot rows + a new server-msg variant:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SnapshotEnemy {
    pub enemy_id: u32,         // server-assigned, stable for entity lifetime
    pub kind: u8,              // 0 = HUNTER (room for 9 more in Phase 4)
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub angle: f64,            // face-angle, radians
    pub hp: f64,               // 0..=max_hp; clients show damage flash from delta
    pub max_hp: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SnapshotAsteroid {
    pub asteroid_id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub rot: f64,              // current 2D facing for wireframe spin
    pub rot_vel: f64,
    pub radius: f64,           // current size (split shrinks this)
    pub hp: f64,
    pub max_hp: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SnapshotBullet {
    pub bullet_id: u32,
    pub owner_player_id: u32,  // for friendly-fire / scoreboard
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub life_ticks_remaining: u32, // for fade-out at end of life
}
```

`ServerMsg::Snapshot` grows three new fields appended to the existing
struct (additive — old `tick` / `acked_input_tick` / `ships` stay in
place at the same byte offsets):

```rust
Snapshot {
    tick: u32,
    acked_input_tick: u32,
    ships: Vec<SnapshotShip>,
    enemies: Vec<SnapshotEnemy>,      // NEW Phase 3
    asteroids: Vec<SnapshotAsteroid>, // NEW Phase 3
    bullets: Vec<SnapshotBullet>,     // NEW Phase 3
}
```

New `ServerMsg::Event` variant for moments that snapshots
can't capture (a bullet that spawned and despawned between two snapshot
frames; a damaged-flash trigger; an asteroid split):

```rust
ServerMsg::Event {
    tick: u32,
    payloads: Vec<EventPayload>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum EventPayload {
    BulletSpawn   { bullet_id: u32, owner_player_id: u32, x: f64, y: f64, angle: f64 },
    BulletHit     { bullet_id: u32, x: f64, y: f64 },
    EnemyDestroy  { enemy_id: u32, x: f64, y: f64, kind: u8 },
    AsteroidSplit { parent_id: u32, x: f64, y: f64, child_count: u8 },
    ShipDamaged   { player_id: u32, x: f64, y: f64, amount: f64 },
    ShipDestroyed { player_id: u32, x: f64, y: f64 },
    ShipRespawn   { player_id: u32, x: f64, y: f64 },
}
```

Events are emitted at the **tick they happen** and broadcast in the
**very next snapshot tick** (i.e., bundled into one outbound message
per 50ms slot, alongside Snapshot but as a separate top-level frame).
Clients use events for one-shot cosmetics: spawn-flash particles, hit
sparks, kill explosions, damage-flash on the player ship. The
snapshot itself is the authoritative state; events are the "what
happened between snapshots" reel.

`ClientMsg::Input.fire` already exists in the struct (Phase 1 reserved
the field; the server ignores it). Phase 3 wires it: each tick where
the server sees `fire == true` AND the player's per-weapon cooldown
has elapsed, the server spawns a bullet from the player's current
position along their `angle`.

### Wire-volume estimates (Phase 3 entity density)

| Entity | Per-row size (bincode, f64) | Worst-case count | Bytes |
|--------|-----------------------------|------------------|-------|
| `SnapshotShip` | 4 + 5×8 = 44 | 4 ships | 176 |
| `SnapshotEnemy` | 4 + 1 + 7×8 = 61 | 4 enemies (`MAX_ENEMIES`) | 244 |
| `SnapshotAsteroid` | 4 + 8×8 = 68 | 16 (mirrors solo's `MAX_ASTEROIDS`) | 1088 |
| `SnapshotBullet` | 8 + 5×8 = 48 | 30 (4 players × 7-shot burst window) | 1440 |
| Envelope (3× `Vec` len prefixes + variant tag + tick + acked) | 24 | — | 24 |
| **Snapshot total (worst case)** | | | **~2.97 KB** |

At 20 Hz: ~60 KB/s server-out per client worst-case;
~240 KB/s aggregate for a full 4-player room. Still trivial on
localhost; would matter on a residential uplink. **Delta encoding
stays deferred to Phase 5+** per the original plan — Phase 3 ships
full snapshots and measures actual peak. If real Phase-3 wire volume
exceeds 100 KB/s per client during smoke testing, the Phase 4
prediction-reconciliation work absorbs delta encoding as a sibling.

`Event` frames are bursty by nature but small per-event
(~32 bytes per `EventPayload` worst case). At an estimated 50
events / second peak (heavy bullet flurry), that's another ~1.5 KB/s
per client. Fine.

### Simulation additions (new files in `server/sim/src/mp1/`)

| File | Solo source studied | Purpose | Est. LOC |
|------|---------------------|---------|----------|
| `enemy.rs` | `js/modules/enemy/enemy.js` (constructor + `update`) + `enemy-data.js` (HUNTER row) + `ai.js` (`updateFaceDirection`, `avoidAsteroids`) + `movement.js` (`hunterArcMovement` — simplified) | `EnemyKind::Hunter` only. `EnemyState { id, kind, x, y, vx, vy, angle, hp, max_hp, radius, arc_dir, arc_angle, arc_radius, arc_omega }`. `update_enemy(&mut state, &targets, &asteroids, &field, dt)` mutates one enemy per tick. Picks closest active ship as target; runs arc-orbit; clamps speed; bounces off field bounds. | ~250 |
| `bullet.rs` | `js/modules/player/bullet.js` (constructor + `update`) + solo's `BULLET_SPEED = 8 px/tick`, `maxLife = 480 ticks` | `BulletState { id, owner_player_id, x, y, vx, vy, life_remaining }`. `update_bullet(&mut state, dt)` advances pos + decrements life. Out-of-bounds or life=0 → mark dead, room reaps. | ~80 |
| `asteroid.rs` | `js/modules/world/asteroid.js` (constructor + `update` + the relevant size/HP tiering at lines 98-125) | `AsteroidState { id, x, y, vx, vy, rot, rot_vel, radius, base_radius, hp, max_hp }`. `update_asteroid(&mut state, &field, dt)` advances pos + spin + wraps at field edges. No split logic here — splits are a collision response, handled in `collision.rs`. | ~110 |
| `collision.rs` | `js/modules/combat/collision-system.js` — only the Phase-3-relevant pairs: bullet × enemy (lines ~140-200), bullet × asteroid (lines ~210-307), ship × enemy (search for `PLAYER_ENEMY_COLLISION_DAMAGE`), ship × asteroid (similar) | `check_all(&mut RoomState, &mut events) -> ()`. Circle-vs-circle for each pair. Emits damage / destroy / split events into the passed-in event buffer. No quadtree yet — N² over the worst-case ~50 entities is ~2500 ops/tick, trivial. | ~250 |
| `damage.rs` | `js/modules/player/lifecycle.js` (`takeDamage` — first ~70 lines; ignore powerup branches) | `apply_ship_damage(&mut ShipState, amount: f64) -> ShipDamageOutcome`. Outcomes: `Survived`, `Killed(respawn_in_ticks)`. No spare-tanks, no shields, no reflexes — Phase 3 is HP-only. | ~60 |
| `weapon.rs` | `js/modules/player/weapons.js:275` (`firePulseCannon`) + `weapon-data.js` `PULSE_CANNON` row | `WeaponKind::PulseCannon` constants (`FIRE_RATE_MS = 400`, `DAMAGE = 1.2`, `BULLET_SPEED = 8 px/tick`). `try_fire(player_id, ship, fire_held, last_fire_tick, current_tick) -> Option<BulletSpawn>`. Returns `Some` if cooldown elapsed and fire held. | ~80 |
| `room.rs` (renamed from current `mp1_room.rs` server-side state shape — see "Server-bin additions" below for the new RoomState shape) | n/a — Phase 3 puts the actual `RoomState` shape inside the sim crate so the room actor and the (Phase 4) WASM client both see the same shape | Reshape — see "Simulation reshape" section below | net +~150 |

**Total new sim LOC: ~830 plus ~150 reshape = ~980.** Native
`#[cfg(test)]` modules expected to add another ~400 lines (HUNTER
chase converges on a stationary target; bullet hits asteroid; bullet
hits enemy; split spawns child count matches solo; ship-at-zero-HP
emits ShipDestroyed once not repeatedly).

### Simulation reshape — single `RoomState` (no more Phase-2 server-only shape)

Phase 2 deliberately kept two state shapes: the WASM client's
single-ship `mp1::GameState` (Phase 1's), and the server-bin's
`Mp1RoomState` (Phase 2's, `HashMap<u32, Slot>`). Phase 3 unifies them
**in the sim crate** so collision/event emission code lives in one
place and the WASM client can begin running an authoritative copy
locally in Phase 4.

New `mp1::room` module:

```rust
pub const MAX_PLAYERS:   usize = 8;   // matches Phase 2's slot ceiling
pub const MAX_ENEMIES:   usize = 4;   // Phase 3 trickle target
pub const MAX_ASTEROIDS: usize = 16;  // mirrors solo's MAX_ASTEROIDS
pub const MAX_BULLETS:   usize = 64;  // 8 players × ~8-shot in-flight ceiling

pub struct RoomState {
    pub tick: u32,
    pub field_w: f64,
    pub field_h: f64,
    pub ships:     Vec<ShipSlot>,     // sparse; ShipSlot { active, player_id, ship, weapon_cooldown_tick, respawn_at_tick, ... }
    pub enemies:   Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub bullets:   Vec<BulletState>,
    pub next_enemy_id:    u32,
    pub next_asteroid_id: u32,
    pub next_bullet_id:   u32,
    pub enemy_spawn_at_tick: u32,
}

pub struct TickEvents {
    pub payloads: Vec<EventPayload>,
}

pub fn tick_room(state: &mut RoomState, inputs: &[(u32, PlayerInput)], dt: f64) -> TickEvents { ... }
```

The single-ship `GameState` + `tick_phase1` from Phase 1 **stays
unchanged** — `client-wasm`'s Phase-2 build still calls them for
local prediction of the local player's ship. Phase 4 will switch
the WASM client to `RoomState` once prediction reconciliation lands;
Phase 3 leaves the WASM-client surface alone.

### Server-bin additions

| File | Change | Brief |
|------|--------|-------|
| `server/server-bin/src/mp1_room.rs` | **Significant rewrite** | Drop the Phase-2 `HashMap<u32, Slot>` in favor of `mp1::room::RoomState`. Inbound channel + 60 Hz tick + 20 Hz snapshot stay. New: enemy-spawn timer (`if state.tick == state.enemy_spawn_at_tick`); asteroid seeding at room boot (3 × `Asteroid::new(random_pos, radius=50)`); per-tick `EventPayload` buffer that flushes to a separate `ServerMsg::Event` broadcast right before the snapshot. Same bias-`tick`-then-handle-then-snapshot select pattern. |
| `server/server-bin/src/mp1_connection.rs` | **Minor extension** | Pass-through of `ClientMsg::Input.fire`; no new logic. Event frames go down the same per-slot mpsc as snapshots. |
| `server/sim/src/mp1/mod.rs` | **Re-exports** | Add `pub mod {enemy, bullet, asteroid, collision, damage, weapon, room};` and pub-use the new types. |

No new server-bin files; the existing two grow modestly.

### Client-bin additions

| File | Change | Brief |
|------|--------|-------|
| `js/mp/wire-codec.js` | **Decoder extension** | Add `decodeSnapshotEnemy`, `decodeSnapshotAsteroid`, `decodeSnapshotBullet` and decode them into the existing `Snapshot` variant (post-`ships` field). Add `decodeEvent` for the new `ServerMsg::Event` variant with its `Vec<EventPayload>`. `WIRE_VERSION` const bumps to `2`. |
| `js/mp/mp-engine.js` | **Track maintenance** | New `remoteEnemies: Map<enemy_id, InterpTrack>` and `remoteAsteroids: Map<asteroid_id, InterpTrack>`, populated from each snapshot exactly like Phase 2's `remoteShips`. Bullets are render-from-snapshot-direct (no interp — 8 px/tick is fast enough that snap-to-current is fine; interp would just add 100ms ghosting). Event frames dispatched to `mp-particles.js` for cosmetic playback. |
| `js/mp/mp-renderer.js` | **Three new draw paths** | `drawEnemy(ctx, e)` — red triangle for HUNTER (matches solo's `#ff4444`), HP bar above. `drawAsteroid(ctx, a)` — wireframe polygon (12-gon at scale `a.radius`, rotated by `a.rot`; matches solo's tumbling-3D-projected-down look, simplified to flat 2D for Phase 3). `drawBullet(ctx, b)` — small cyan circle (matches solo's PULSE_CANNON `#00ccff`). Order: asteroids → enemies → bullets → ships (matches solo's z-order). |
| `js/mp/mp-particles.js` | **Event-driven cosmetics** | Currently empty stub. Phase 3 implements minimal `BulletHit`, `EnemyDestroy`, `ShipDamaged` particle bursts. ~150 lines. |
| `js/mp/mp-input.js` | **Wire `fire`** | Left-click held → `input.fire = true`. Already wired in Phase 1; this just confirms the boolean reaches `mp-engine.js`'s `sendInput` call which already serializes it. Zero net change expected; flagged here only so the cross-checklist catches it. |
| `js/mp/mp-hud.js` | **Minimal scoreboard** | Show each player's HP (0-100 bar) + a kill counter that increments on `EnemyDestroy` events whose `kind == HUNTER`. Phase 3 has no shared score; per-player counters only. |

---

## Tick rates + wire volume (Phase 3 vs Phase 2)

| Channel | Phase 2 | Phase 3 | Notes |
|---------|---------|---------|-------|
| Server sim tick | 60 Hz | 60 Hz | unchanged |
| Snapshot broadcast | 20 Hz | 20 Hz | unchanged |
| Snapshot payload (4 ships) | ~228 B | **~3 KB worst case** (4 ships + 4 enemies + 16 asteroids + 30 bullets) | ~13× growth |
| Event broadcast | n/a | 20 Hz coincident, ~32 B × per-tick events | new — bursty |
| Input upload | 30 Hz | 30 Hz | unchanged; `fire` bit now load-bearing |
| Per-client server-out | ~4.5 KB/s | **~60 KB/s peak**, ~25 KB/s typical | well under any modern uplink |

**Recommendation: do NOT switch to delta snapshots in Phase 3.** Full
snapshots keep the room actor stateless across snapshot ticks (no
per-client diff tracking), keep `wire-codec.js` simple, and the wire
budget remains well under broadband floors. Revisit in Phase 5 when
Phase 4's prediction reconciliation needs delta-style "what's
changed since acked_input_tick" anyway.

---

## Acceptance criteria

- [ ] Two browser tabs at `/mp` both see a HUNTER spawn within 5 s
      of the second tab joining
- [ ] Either player can fire bullets (left-click; W still movement-only)
- [ ] Bullets visibly travel from player → enemy and disappear on hit
- [ ] Bullets hit HUNTER; HP bar drops by `1.2` per hit; HUNTER
      explodes at 0 HP and both tabs see the same `EnemyDestroy` event
- [ ] HUNTER collision with player ship deals damage (5 HP per contact
      per solo's `PLAYER_ENEMY_COLLISION_DAMAGE`); player HP bar drops
- [ ] At 0 HP, ship is removed from the snapshot; 3 s later (`180`
      ticks) a `ShipRespawn` event puts the ship back at field center
      with full HP
- [ ] Asteroids are visible from room boot; bullets damage them;
      large rocks (`base_radius >= MIN_AST_RAD + 5 = 20`) split into
      3-4 children on death with HP `70-90%` of parent (matches
      `collision-system.js:280-292`)
- [ ] `cargo test --workspace` clean (no regressions; new unit tests
      pass)
- [ ] `WIRE_VERSION` bumps to `2` in both Rust (`mp1::wire::WIRE_VERSION`)
      and JS (`wire-codec.js` const), and Hello with `wire_version: 1`
      is rejected with `Error { code: "wire_version_mismatch" }`
- [ ] `npm run test:qa` regression unchanged (solo path untouched)
- [ ] `npm run wasm:build:dev` succeeds (Phase 4-ready WASM surface
      builds, even though the client doesn't consume the new sim
      modules yet)

---

## Parallel-dispatch plan

Strict file ownership, per the lessons in
`memory/feedback_parallel_dispatch.md`: new-file dispatches are the
safest pattern; existing-file edits stay orchestrator-led and serial.

**Wave 1 — Parallel (all new files, no existing-file edits)**

| Agent | Owns (new files only) | Brief |
|-------|----------------------|-------|
| **A** | `server/sim/src/mp1/enemy.rs` | Implement `EnemyState`, `EnemyKind` (Hunter only), `update_enemy(state, targets, asteroids, field, dt)`. Closest-target picker + simplified arc-orbit (constant `omega = 0.025`; no slingshot/lunge/vortex/weave — those are Phase 5 polish). Native unit tests: (a) no targets → enemy idles; (b) one target at (0,0), enemy at (300,0) → enemy orbits and closes within `arc_radius ± tolerance`; (c) bouncing off field bounds preserves speed. |
| **B** | `server/sim/src/mp1/bullet.rs` | Implement `BulletState`, `update_bullet`. `BULLET_SPEED = 8.0`, `MAX_LIFE_TICKS = 480` (mirrors `bullet.js:81`). Tests: integrate-3-ticks-moves-correct-distance; life=0 → marked dead; out-of-bounds → marked dead. |
| **C** | `server/sim/src/mp1/asteroid.rs` | Implement `AsteroidState`, `update_asteroid`. `AST_SPEED = 1.75` (matches `GAME_CONFIG.AST_SPEED`); wraps at field edges (NOT bounces — solo asteroids wrap per `js/sim/asteroid.js`). Size-tiered HP per `asteroid.js:108-114`. Tests: wraps correctly past left edge; HP tiering returns 3..=5 for radius ≥ 40, 1..=3 for ≥ 20, 1 for < 20. |
| **D** | `server/sim/src/mp1/weapon.rs` | Implement `WeaponKind::PulseCannon` const block + `try_fire`. Tests: rapid `fire=true` requests within `FIRE_RATE_MS / 16.67 ≈ 24 ticks` return Some-once-then-None; fire=false always returns None. |
| **E** | `server/sim/src/mp1/damage.rs` | Implement `apply_ship_damage` + `ShipDamageOutcome`. Tests: HP ≥ amount → Survived with new HP; HP < amount → Killed(180). |
| **F** | `js/mp/mp-particles.js` | Implement `playEvent(payload)`. Empty-stub today; Phase-3 adds tiny canvas particle bursts for the 5 event kinds the renderer cares about. Pure JS, no Rust touch. Self-contained — no other JS file imports change. |

These six agents touch zero overlapping files and zero existing
production code. Safe for one parallel dispatch.

**Wave 2 — Orchestrator foreground (serial, must follow Wave 1)**

The orchestrator drives these in order; some touch the wire crate
(used by every Wave-1 module via re-export) and some touch
`mp1_room.rs` (which integrates everything Wave 1 built).

1. Write `server/sim/src/mp1/collision.rs` from scratch — depends on
   `enemy.rs`, `bullet.rs`, `asteroid.rs`, `damage.rs` types all
   existing. Unit tests for each pair.
2. Write `server/sim/src/mp1/room.rs` — the unified `RoomState` +
   `tick_room`. Depends on collision.rs.
3. Edit `server/sim/src/mp1/mod.rs` — add `pub mod {enemy, bullet,
   asteroid, weapon, damage, collision, room};` + re-exports.
4. Edit `server/sim/src/mp1/wire.rs` — add `SnapshotEnemy` / 
   `SnapshotAsteroid` / `SnapshotBullet` / `EventPayload` types;
   extend `ServerMsg::Snapshot` with the three new fields; add
   `ServerMsg::Event` variant. Bump `WIRE_VERSION` to `2`.
   Round-trip tests for each new variant (bincode + JSON).
5. Verify: `cd server && cargo test --workspace` clean.
6. Rewrite `server/server-bin/src/mp1_room.rs` to drive
   `mp1::room::RoomState` and emit Event frames. Preserves Phase-2's
   actor + biased select shape.
7. Tiny edit to `server/server-bin/src/mp1_connection.rs` —
   pass-through of `fire` (no new struct fields; bit already exists).
8. Verify: `cd server && cargo test --workspace` clean,
   `cargo build -p rainboids-server --release` clean.
9. Edit `js/mp/wire-codec.js` — bump `WIRE_VERSION` const, add
   the four new decoders, extend `decodeSnapshot` for the three
   new fields, add `decodeEvent`.
10. Edit `js/mp/mp-engine.js` — wire `remoteEnemies` /
    `remoteAsteroids` interp tracks; dispatch `Event` frames to
    `mp-particles.js`; pass entity arrays to renderer.
11. Edit `js/mp/mp-renderer.js` — add `drawEnemy`, `drawAsteroid`,
    `drawBullet`. Solo's z-order: asteroids → enemies → bullets →
    ships.
12. Edit `js/mp/mp-hud.js` — minimal HP bar + kill counter.
13. Manual two-tab verification per the Acceptance criteria.
14. Bump `VERSION-MP` to `0.4.0` (MINOR — Phase 3 is "new system /
    significant content" per the CLAUDE.md MP semver rule).
15. Add `CHANGELOG-MP.md` `## [0.4.0]` entry covering the Phase 3
    wire + sim + client changes. Separate the Rust shipping (new
    `mp1/{enemy,bullet,asteroid,collision,damage,weapon,room}.rs`)
    from the JS shipping (wire-codec extension, renderer, particles,
    HUD) for clarity in case a hotfix has to back one side out.

**Estimated effort**: Wave 1 ~6 hours total wall clock (parallel).
Wave 2 ~6 hours serial. **Total ≈ 12 hours** for Phase 3 end-to-end,
assuming no design rework during integration.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Enemy AI non-determinism between WASM and native server.** Phase 3 server is authoritative for enemies — the client doesn't predict them. So this is a Phase-4 concern, not Phase 3. But: if Phase 4 reconciliation requires WASM-side enemy prediction, the simplified `hunterArcMovement` (constant omega, no random lunge/sling) is intentionally deterministic given `(targets, enemy_state)` — no `Math.random()` calls per tick. Stays Phase-4-safe by construction. |
| **Bullet spawn timing.** Server sees `fire=true` at its 60 Hz tick; client sends inputs at 30 Hz; a bullet may visibly delay by up to 33 ms after click. Mitigation: client-side cosmetic muzzle flash on click (pure local; no entity emitted) for instant feedback; the actual bullet appears on the next snapshot. Solo solo-mode does effectively the same thing (predict-spawn locally, server isn't in the loop), so this matches mental model. Document the 33 ms delay in CHANGELOG. |
| **Collision performance.** N² over 4 ships + 4 enemies + 16 asteroids + 30 bullets = 54² = ~2900 pair-checks per tick × 60 Hz = ~175 K/s. Native Rust does this in microseconds. Skip the quadtree. If Phase 4 raises any of `MAX_*` significantly, revisit. |
| **Asteroid split spawns exceed `MAX_ASTEROIDS = 16`.** Split adds 3-4 children; a chain of large-rock kills can spike the count. Mitigation: cap inserts in `tick_room` — if `asteroids.len() >= MAX_ASTEROIDS`, drop the new spawns and emit an `AsteroidSplit { child_count: 0 }` for cosmetic playback only. Matches solo's pool soft-cap behavior. |
| **Wire-volume cliff if a real test session sees 64 bullets in flight.** Worst-case snapshot is ~3 KB. Even at 8 KB peak (very pathological), still under 200 KB/s per client — fine. Defense in depth: log a warning in the room actor if any snapshot exceeds 8 KB; surface in CHANGELOG follow-up if it fires. |
| **Body-collision damage feels punishing with no enemy bullets to interleave.** Without enemy bullets (Phase 3) the only player threat is contact. May make HUNTER feel either trivial (player just kites and shoots) or unfairly stick-grabby (the arc-orbit closes faster than the player can strafe). Mitigation: tune `arc_radius = 230` and `omega = 0.025` to match solo's default-engagement feel; if it plays wrong in two-tab smoke testing, the orbit constants are cheap to tweak. Real fix is Phase 4's `hunter_single` enemy bullet pattern. |
| **`ShipRespawn` after 3 s might leave a player permanently disconnected if the network drops them during respawn.** Phase 2's `Mp1Room` already handles `Leave` cleanly — Phase 3's slot's `respawn_at_tick` is just a timer; if the slot's `out` mpsc is gone (player left), the slot is freed normally. No new bug surface. |

---

## Open questions for the user

These need a decision before Phase 3 starts (or a "punt to defaults"
ack). Recommended answers in **bold**.

1. **Which enemy type first?** Recommendation: **HUNTER**. Chase-the-
   player AI is the simplest of solo's 10 enemy types and matches the
   structural template the archived hand-port used for its first
   enemy implementation (so the function shapes — `update`, `shoot`,
   `target_pick` — are well-validated even though the behavioral
   logic is being fresh-rewritten from `js/modules/enemy/movement.js`).
   Alternative would be TANGERINE (pure chase, no orbit) which is
   even simpler — but HUNTER's arc-orbit is more visually
   recognizable as "an enemy is attacking you" without enemy bullets
   to telegraph intent, which matters in Phase 3 where contact damage
   is the only threat.

2. **Fire button.** Recommendation: **left mouse button only**. Held
   W stays movement-only — overloading it with fire breaks the WASD
   mental model and creates a "I can't move without shooting"
   awkwardness. Solo uses LMB for primary fire; matching it makes
   the `/mp` mode immediately legible to solo players. Mobile-tap
   binding is out of scope (Phase 3 is desktop-only).

3. **Player death model.** Recommendation: **3-second respawn at
   field center, no game-over**. Phase 3 has no waves, no win
   condition, and no formal session lifecycle — game-over is
   meaningless. Respawn lets two friends keep playing through
   experimentation. Phase 4 picks the real death model alongside
   the wave system (death-with-shared-lives? lives-per-player?
   server-side decision — Phase 4 PR).

4. **Friendly fire.** Recommendation: **OFF** (bullets pass through
   allied ships). Co-op with friendly fire = forever frustrating;
   the `bullet × ship` collision check simply excludes
   `bullet.owner_player_id == ship.player_id` AND any active ally,
   which is "all ships" in Phase 3 (no team mechanic yet). Server
   enforces this in `collision.rs`; clients don't need to know.

5. **Asteroid split determinism.** Recommendation: **server picks
   split outcome and broadcasts the result via `AsteroidSplit` event
   + the next snapshot's `asteroids` vec**. The alternative —
   client-side deterministic re-derivation from a server-seeded RNG —
   is overkill for Phase 3 where the client doesn't predict
   asteroids at all; even Phase 4 reconciliation works at the
   snapshot-state level, not at the spawn-event level. Pure
   server-authoritative split sidesteps the whole RNG-sync question
   for now. Phase 5+ can switch if deterministic replay becomes a
   feature.

6. **Per-snapshot vs per-event for bullets.** Recommendation: **both,
   but with different roles**. Snapshots carry the canonical
   `bullets` vec (so a client joining mid-flight sees the bullets
   that are alive RIGHT NOW). Events carry `BulletSpawn` / `BulletHit`
   for cosmetic timing (muzzle flash on the exact tick of spawn;
   spark effect on the exact tick of hit, NOT delayed to the next
   20 Hz snapshot frame). This matches the
   `Multiplayer Planning – 2026-05-06.md` analysis that flagged
   bullets as "the wire-cost wildcard" — events keep the **cosmetic
   reaction** at server-tick precision without paying for
   per-snapshot bullet inclusion at the high rate that would
   require. Yes it's some redundancy (a bullet appears in both the
   event stream AND the next snapshot) — accepted as the cost of
   tight cosmetic timing without delta-encoding the snapshot.

---

## Reversibility

Phase 3 backs out cleanly:

1. **During Wave 1**: subagents own new files; `git rm` them and the
   tree is back to Phase 2 functionality. WIRE_VERSION still `1` at
   this point (Wave 1 doesn't touch wire.rs).
2. **After Wave 2 steps 1-5 (sim crate only)**: `git revert` the sim
   commits. The Phase-2 server-bin still compiles against the prior
   `mp1::wire` (no Snapshot field changes yet). Phase-2 functionality
   intact.
3. **After Wave 2 step 6 (`mp1_room.rs` rewrite)**: revert window
   closes — this is the integration commitment point. To back out
   after this, both server-bin and the wire would need a coordinated
   revert; the Phase-2 functionality survives but at higher cost.
4. **After Phase 3 ships and Phase 4 builds on `mp1::room::RoomState`**:
   revert is no longer meaningful. Phase 4 would have to be reverted
   alongside.

The Phase-2 two-tab smoke test is the regression anchor throughout —
if at any point during Phase 3 development a server build breaks
that test, that build doesn't merge.

---

## Out of scope for Phase 3 (deferred to Phase 4+)

- **Wave system** — Phase 4 step 1. Continuous trickle is the
  Phase-3 placeholder.
- **HP / death model parity with solo** (spare tanks, shields,
  reflexes, last-stand) — Phase 4 step 2. Phase 3 is HP-only.
- **Drops** — Phase 4 step 3. No gold orbs, no health orbs.
- **The remaining 4 base weapons** (Storm Needles, Scatter Gun,
  Rail Driver, Lance Beam) — Phase 4 step 4. One PR each.
- **The remaining 9 enemy types** — Phase 4 step 5. One PR each.
- **Power weapons / defense skills** — Phase 4 steps 6-7.
- **Damage modifiers** (crit, piercing, explosive, homing) —
  Phase 4 step 8.
- **6.0.x economy** (gold-only, rarities, trinket slot, health-
  powerup variants) — Phase 4 step 9.
- **Prediction reconciliation** for enemies/bullets — Phase 4
  alongside wave system; Snapshot.acked_input_tick is wire-ready.
- **Delta-encoded snapshots** — Phase 5+. Full snapshots remain
  fine at Phase-3 wire volume.
- **Enemy bullets** — bundled with the Phase 4 "remaining enemy
  types" rollout, since most other enemy types fire and HUNTER's
  `hunter_single` makes more sense to land alongside them than as
  a Phase-3 special case.
- **Cosmetic enemy AI** (microMovements, fishMotion, bullet-dodge,
  line-of-sight checks) — Phase 5 polish.
- **Title screen / matchmaking UI for `/mp`** — Phase 5.

---

## Phase 3 size at a glance

- **New Rust files**: 7 in `server/sim/src/mp1/` (enemy, bullet,
  asteroid, weapon, damage, collision, room). ~980 LOC + ~400 LOC
  of `#[cfg(test)]` modules.
- **Modified Rust files**: 3 (`mp1/mod.rs` re-exports,
  `mp1/wire.rs` schema, `server-bin/src/mp1_room.rs` rewrite).
  ~300 LOC delta.
- **Modified JS files**: 5 (`wire-codec.js`, `mp-engine.js`,
  `mp-renderer.js`, `mp-hud.js`, `mp-particles.js`). ~450 LOC
  delta.
- **No new top-level directories** (per CLAUDE.md hygiene rule).
- **`WIRE_VERSION` bumps `1 → 2`**; `VERSION-MP` bumps `0.3.2 → 0.4.0`.

Phase 3 is the largest single increment of the WASM pivot so far —
twice Phase 2's surface and four times Phase 1's. The size is
unavoidable because combat brings the entire collision pipeline
online, and there's no further-decomposable Phase-3 increment
where "two players shoot a HUNTER and see it die" is true. Once
this lands, every Phase-4 content addition is structural copy-paste
on top of these scaffolds.
