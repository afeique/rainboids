Companion to `Rust Server.md`. This document plans the **client and engine** changes required to move Rainboids from a single-player monolith to a server-authoritative multiplayer architecture, given that the authoritative server is **Rust** and the client is JavaScript.

The premise of this plan is fundamentally different from the Node version: with a Rust server, **the simulation is implemented twice — once in JS for the client, once in Rust for the server — and a parity infrastructure keeps them honest**. Roughly half this document is the same engine refactor work the Node plan describes (extract `simulateTick`, clean event queue, single input capture, etc.). The other half is *new* and Rust-specific:

- **A schema source of truth** that drives both Rust types and JS codecs.
- **A cross-language parity harness** that runs in CI and blocks divergence.
- **Fixed-point math** for the prediction-relevant subset of the simulation, so client prediction reconciles bit-perfectly to server snapshots.
- **A more conservative client prediction model** because cross-language drift is no longer impossible.
- **Schema-driven codegen** as a maturity gate for the protocol layer.

That asymmetric burden — the engine refactor the Node plan describes, plus a parity stack that the Node plan never needs — is the load-bearing engineering cost of choosing Rust.

---

## Overview of all changes

A bird's-eye view before the architectural deep-dive. Items are roughly ordered by depth; foundational refactors first, online-only and cross-language items last.

### Foundational refactors (gate to everything; same as the Node plan)

1. **Extract `simulateTick` into `js/sim/`.** Pure function. No DOM, no audio, no rendering, no `requestAnimationFrame`. Solo play and online prediction both call this.
2. **Define a single canonical `GameState` shape** in JS, documented with JSDoc. The Rust server has a parallel `GameState` struct; the parity harness ensures they describe the same world.
3. **Replace inline-effect emission with an event queue.** Particles, screen shake, damage numbers, sounds — the simulation pushes events; a separate effect layer consumes them. No simulation code touches the DOM, audio context, or particle pool ever again.
4. **Collapse input capture into a single point.** One `PlayerInput` struct produced per frame. Read by the local simulation in solo mode; encoded over the wire in online mode.
5. **Renderer reads `state`, not engine pools.** Pools become an implementation detail of the simulation.
6. **Seed all RNG.** `Math.random()` in the simulation path becomes `state.rng.next()`. The PRNG algorithm is shared between JS and Rust (PCG64).
7. **Decouple `requestAnimationFrame` from the simulation tick.** Fixed-step accumulator drives a 60Hz logical tick; rendering runs at the display refresh rate.

### Cross-language sync infrastructure (NEW vs Node plan)

8. **`schema/` directory as source of truth.** Holds wire-protocol definitions, fixed-point math constants, and documentation of the prediction-deterministic simulation subset.
9. **JS protocol codec** mirroring the Rust `bincode` schema, in `js/sim/protocol.js`. Hand-mirrored for v1, codegen'd before public beta.
10. **Fixed-point math module.** `js/sim/fxp.js` exposes a `Fxp` type implemented over `Int32Array`; the Rust server uses the `fixed` crate with the same scaling. Ship physics use `Fxp` on both sides; everything else uses `f32`.
11. **Cross-language parity harness.** A test rig that generates fixtures, runs Rust `simulate_tick` and JS `simulateTick` over them, and diffs the results. CI gate on every PR.
12. **Schema-driven codec round-trip tests.** Every `ServerMsg`, `ClientMsg`, and `GameEvent` variant generated in Rust is encoded, decoded in JS, re-encoded, and compared byte-for-byte against the Rust output.
13. **Wire-version + sim-version handshake.** Hello carries both; mismatch closes the socket cleanly.

### Network layer (online-only; same shape as Node plan)

14. **`js/net/ws-client.js`** — WebSocket wrapper with reconnect, ping, session token persistence.
15. **`js/net/prediction.js`** — input buffer + replay-from-server-snapshot reconciliation, **using fixed-point math** so reconciliation snaps cleanly.
16. **`js/net/interpolation.js`** — render-time-shifted lerp of remote entities.
17. **`js/net/event-firehose.js`** — consumes server events, dispatches to the existing effect layer.
18. **`js/net/matchmaking.js`** — Quick Match / Browse / Create / Join-by-Code over the same WS.
19. **`js/net/session.js`** — UUID stored in `localStorage`; survives reconnects within grace.

### Engine wiring (mode-aware glue; same as Node plan)

20. **Online vs solo mode flag** on the engine. Solo mode runs `simulateTick` locally each tick using JS `js/sim/`. Online mode runs prediction for the local ship and consumes snapshots for everything else.
21. **Engine "tick budget" rework.** Fixed-step accumulator with a max-catch-up cap.
22. **HUD updates** — show partner ships' HP, gold, score, downed state.
23. **Ship palette assignment** — server-assigned slot color.

### Co-op gameplay (same as Node plan)

24. **Revive interaction** — hold-to-revive button, downed-state ship rendering.
25. **Per-player wave-clear powerup picks.**
26. **Drop attribution.**
27. **Friendly fire off.**

### UX (same as Node plan)

28. **Title-screen multiplayer panel.**
29. **Lobby screen for room creation.**
30. **Reconnection toast.**
31. **Room-status HUD.**

### Solo-play preservation

32. **Solo mode still uses `js/sim/`.** Same code path as prediction. Solo doesn't need the Rust server.
33. **Solo replay** — seeded RNG + recorded inputs produces deterministic state hashes.

The first 7 items and the last items mirror the Node plan; **items 8–13 are unique to the Rust path**. Those six items account for most of the additional engineering cost beyond what the Node plan asks of the client.

---

## Pre-refactor baseline

Identical baseline to the Node plan, repeated for completeness.

`js/modules/game-engine.js` is ~2,555 lines and acts as:

- The single owner of all entity pools (enemies, asteroids, bullets, particles, drops, debris, stars).
- The input reader (keyboard, mouse, touch, gamepad polled inside the update loop).
- The simulation driver (calls `update()` on each entity inside the same loop).
- The collision handler (narrow-phase code lives inline on collision sites).
- The effect emitter (particle spawns, screen shake, damage numbers — invoked inline).
- The renderer driver (calls `draw()` paths after each update).
- The wave / boss orchestrator (uses `setTimeout` for spawn schedules).
- The audio trigger (calls `audioManager.play()` inline from simulation events).

There is no clean line between simulation and presentation; every refactor step in this plan draws one of those lines. The same starting point regardless of which server we choose; the difference is what we build on top.

---

## Target architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  Rainboids client                                                 │
│                                                                   │
│  ┌────────────────────────────┐                                   │
│  │  js/sim/  (pure)           │  Lives in JS only.                │
│  │   simulateTick             │  Used for solo play.              │
│  │   GameState / pools        │  Used for prediction online.      │
│  │   ship / enemy / bullet    │  Mirrors `server/src/sim/` shape. │
│  │   collision / drops / wave │                                   │
│  │   protocol / version       │                                   │
│  │   fxp / rng                │  ◀─── must agree with Rust on    │
│  └─────────────┬──────────────┘       prediction-relevant subset │
│                │                                                  │
│                ▼                                                  │
│  ┌────────────────────────────┐                                   │
│  │  js/engine/                │  Mode-aware driver                │
│  └────┬─────────┬──────────┬──┘                                   │
│       ▼         ▼          ▼                                      │
│  ┌────────┐ ┌────────┐ ┌────────────┐                             │
│  │ Render │ │ Audio  │ │ Effect     │                             │
│  │ layer  │ │ layer  │ │ layer (FX) │                             │
│  └────────┘ └────────┘ └────────────┘                             │
│                                                                   │
│  ┌──────────────────────────┐                                     │
│  │  js/net/                 │ Online-only.                        │
│  │   ws-client / prediction │                                     │
│  │   interpolation / FH     │                                     │
│  │   matchmaking / session  │                                     │
│  └──────────────────────────┘                                     │
└───────────────────────────────────────────────────────────────────┘

           │ wire protocol (bincode/postcard, hand-mirrored
           │  in JS for v1, codegen'd before beta)
           ▼

┌───────────────────────────────────────────────────────────────────┐
│  rainboids-server (Rust, single binary)                           │
│                                                                   │
│  src/sim/ — authoritative Rust implementation of the same         │
│             simulation rules as js/sim/                           │
│  src/protocol/ — bincode-derived encoders matching the JS codec   │
│  src/room/ — actor model, snapshot fanout                         │
│  src/server/ — axum + tokio-tungstenite                           │
└───────────────────────────────────────────────────────────────────┘

           ▲
           │
┌──────────┴───────────────────────────────────────────────────────┐
│  schema/  (root of repo)                                          │
│   Single source of truth for shared types.                        │
│   Generates Rust types and JS codecs.                             │
│   Holds golden cross-language fixtures.                           │
│                                                                   │
│   protocol.toml  — declarative spec                               │
│   codegen.rs     — emits Rust + JS                                │
│   snapshots/     — fixture inputs and expected outputs            │
└───────────────────────────────────────────────────────────────────┘

           ▲
           │
┌──────────┴───────────────────────────────────────────────────────┐
│  Parity harness (CI)                                              │
│   1. Generates (seed, input log) fixtures.                        │
│   2. Runs Rust simulate_tick → emits canonical state.             │
│   3. Runs JS simulateTick → emits canonical state.                │
│   4. Diffs. Any divergence in prediction-relevant subset = fail.  │
└──────────────────────────────────────────────────────────────────┘
```

Three "layers" of code on the client:

1. **Pure** — `js/sim/`. No DOM, no audio. Mirrored by `server/src/sim/` in Rust.
2. **Glue** — `js/engine/`, `js/net/`, `js/input/`. Drives the pure layer based on mode.
3. **Presentation** — `js/render/`, `js/audio/`, `js/ui/`. Consumes state and events; never mutates the simulation.

And one cross-cutting concern, *unique to the Rust path*:

4. **Parity** — `schema/`, codegen'd codec, parity harness. Lives across the whole repo as a discipline.

---

## Detailed plan: engine architectural changes

This entire section is **identical** to the Node engine plan. The simulation we extract on the client is the same simulation regardless of which server we ship. The Rust-specific work is layered on top in later sections.

### Step 1 — Extract `simulateTick`

Today's `update()` looks roughly like:

```js
// Today (paraphrase of game-engine.js)
update(dt) {
  this.input.poll()
  this.player.update(dt, this.input)
  for (const e of this.enemies.active) e.update(dt, this.player)
  for (const b of this.bullets.active) b.update(dt)
  this.collisions.detect()       // mutates state, spawns particles inline, plays sounds
  this.waveManager.tick(dt)      // uses setTimeout
  this.particles.update(dt)
  this.audio.flush()
}
```

The target:

```js
// js/engine/engine.js  (driver)
update(dt) {
  this.input.capture()
  const playerInput = this.input.snapshot()

  if (this.mode === 'solo') {
    simulateTick(this.state, mapOf({ p1: playerInput }), dt, this.state.rng, this.events)
  } else {
    this.predictor.applyLocalInput(playerInput, dt)
    this.interpolator.advance(performance.now())
  }

  this.fx.consume(this.events)
  this.events.length = 0
  this.renderer.draw(this.state)
}
```

```js
// js/sim/tick.js  (pure)
import { updateShips }       from './ship.js'
import { updateEnemies }     from './enemy.js'
import { updateAsteroids }   from './asteroid.js'
import { integrateBullets }  from './bullet.js'
import { resolveCollisions } from './collision.js'
import { updateDrops }       from './drops.js'
import { tickWave }          from './wave.js'
import { cullDead }          from './state.js'

export function simulateTick(state, inputs, dt, rng, events) {
  updateShips(state.ships, inputs, dt, events)
  updateEnemies(state.enemies, state.ships, dt, rng, events)
  updateAsteroids(state.asteroids, dt, events)
  integrateBullets(state.bullets, dt)
  resolveCollisions(state, events)
  updateDrops(state.drops, state.ships, dt, events)
  tickWave(state.wave, state.enemies, dt, rng, events)
  cullDead(state)
}
```

Each `updateXxx` is moved out of the engine into the relevant `js/sim/xxx.js`. The Rust counterpart `server/src/sim/xxx.rs` shadows the file name and the algorithm. **A reader can open the JS and Rust files side by side and see the same algorithm in two languages.** This structural pressure is one of the loudest mitigations against drift.

### Step 2 — `GameState` canonical shape

A typed container; JSDoc gives autocomplete and `tsc --noEmit` checking.

```js
// js/sim/state.js
/**
 * @typedef {Object} Ship
 * @property {number} id
 * @property {number} slot
 * @property {Fxp} x       - fixed-point world coordinate
 * @property {Fxp} y
 * @property {Fxp} vx
 * @property {Fxp} vy
 * @property {number} facing      - radians; cosmetic, not predicted
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} gold
 * @property {number} score
 * @property {number} xp
 * @property {number} level
 * @property {number} weaponId
 * @property {number} weaponCooldown
 * @property {boolean} alive
 * @property {boolean} downed
 * @property {boolean} frozenInvulnerable
 * @property {number} invulnUntil
 */
```

The fields that participate in cross-language prediction (`x`, `y`, `vx`, `vy`) are typed as `Fxp` (fixed-point). Everything else is regular `number`. The Rust counterpart:

```rust
// server/src/sim/state.rs
pub struct Ship {
    pub id: PlayerId,
    pub slot: u8,
    pub x: Fxp,
    pub y: Fxp,
    pub vx: Fxp,
    pub vy: Fxp,
    pub facing: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub gold: u32,
    pub score: u32,
    pub xp: u32,
    pub level: u8,
    pub weapon_id: u8,
    pub weapon_cooldown: f32,
    pub alive: bool,
    pub downed: bool,
    pub frozen_invulnerable: bool,
    pub invuln_until: u32,
}
```

Field-by-field parity: same names (with case convention), same types (with the language's natural form), same units. The schema source-of-truth (described later) generates the Rust struct from the spec; the JS JSDoc is hand-mirrored for v1.

### Steps 3–7 — Same as Node plan

The remaining engine refactor steps are identical to the Node plan and are not repeated in detail here:

- **Step 3** — replace inline effects with an event queue (`js/sim/events.js`); `FxLayer` consumes events.
- **Step 4** — single input capture point (`js/input/input-capture.js`).
- **Step 5** — renderer reads from `state`, not engine pools.
- **Step 6** — seed all RNG (`js/sim/rng.js`); the PCG64 algorithm matches the Rust `rand_pcg::Pcg64` exactly so seeded sequences agree across languages.
- **Step 7** — fixed-step accumulator (`js/engine/loop.js`); 60Hz logical tick decoupled from `requestAnimationFrame`.

For full code sketches of these steps, see `NodeJS Multiplayer Engine and Client.md`. The work is the same; the consumer downstream is what changes.

---

## Cross-language parity strategy

This is the marquee section of this document — the engineering investment that pays for the Rust server's other advantages.

### The drift problem

Every gameplay rule, every entity field, every protocol variant exists *twice* — once in JS, once in Rust. Drift can occur at three levels:

1. **Protocol drift.** Rust adds a new `GameEvent::FlamingDeath { who, hot }`. JS doesn't know about it. Server sends the event; JS decodes garbage. Symptom: client crashes or silently misrenders.
2. **Field drift.** Rust changes `Ship.hp` from `f32` to `u8` (0–100). JS still expects `f32`. Decoding misaligns; everything after that field is wrong.
3. **Algorithm drift.** Rust's `update_ship` now applies thrust *before* gravity; JS still applies them in the original order. The predicted state diverges from the server snapshot. Visible as constant micro-corrections.

Drift class 3 is the most dangerous because it can be silent under playtest and only visible at scale.

### The strategy: three concentric rings

```
            ┌──────────────────────────────────┐
            │  Ring 3: written discipline      │
            │  - parallel directory structure  │
            │  - PR template asks "did you     │
            │    edit both sides?"             │
            │  - documented sim spec doc       │
            └──────────────────────────────────┘
                              ▲
            ┌──────────────────────────────────┐
            │  Ring 2: schema-driven codegen   │
            │  - schema/protocol.toml          │
            │  - emits Rust types and JS codec │
            │  - one source for both sides     │
            └──────────────────────────────────┘
                              ▲
            ┌──────────────────────────────────┐
            │  Ring 1: parity harness in CI    │
            │  - golden fixtures               │
            │  - cross-language replay         │
            │  - blocks merge on divergence    │
            └──────────────────────────────────┘
```

Ring 1 is the safety net: if anything slips past rings 2 and 3, CI catches it before merge. Ring 1 is non-negotiable. Rings 2 and 3 are the *productivity* layer — they reduce how often ring 1 fires and how much friction each fire causes.

### Ring 1 — parity harness

The single most important new test class.

#### Mechanics

A test binary in `server/tests/integration_parity.rs`:

```rust
#[test]
fn parity_ship_movement_basic() {
    let fixture = include_str!("../../schema/snapshots/ship_basic.fixture.json");
    let f: Fixture = serde_json::from_str(fixture).unwrap();

    // 1. Rust side
    let mut state = GameState::from_fixture(&f.initial);
    let mut rng = Pcg64::seed_from_u64(f.seed);
    let mut events = Vec::new();
    for input in &f.inputs {
        let mut inputs = PlayerInputs::new();
        inputs.insert(f.local_player_id, input.clone());
        simulate_tick(&mut state, &inputs, FXP_DT, &mut rng, &mut events);
    }
    let rust_canonical = state.canonical_serialize();

    // 2. JS side via embedded V8 (or external Node process)
    let js_canonical = run_js_simulation(&fixture).expect("js sim");

    // 3. Diff
    pretty_assertions::assert_eq!(rust_canonical, js_canonical);
}
```

Implementation notes:

- **`canonical_serialize`** is a deterministic JSON serializer that orders fields, normalizes float representation (e.g. `0.0` vs `-0.0`), and emits prediction-relevant fields only (so cosmetic-only fields can drift without failing the test).
- **`run_js_simulation`** invokes a Node subprocess (`node tools/parity-runner.mjs <fixture>`) that imports `js/sim/` and runs the same fixture. The JS side serializes its result the same way.
- **Fixtures** live in `schema/snapshots/`. Each is a JSON document: `{ seed, initial: GameState, inputs: [PlayerInput], expected_after_n_ticks: GameState }`.

#### Fixtures we generate

For v1, the parity harness covers:

- **Ship movement basics**: thrust forward, strafe, decelerate, turn. 1-second sequences (60 ticks).
- **Ship-bullet emission**: hold-fire for 1 second; verify bullet spawn positions and velocities.
- **Bullet integration**: spawn a bullet, integrate 100 ticks, verify final position.
- **Boundary wrap**: ship moves past world edge; verify wrap behavior matches.
- **Multi-tick determinism**: 600 ticks (10 seconds) of recorded inputs; final state hash must match.
- **RNG sequence**: seed 42, 1000 calls, expected output sequence.

For v2:

- **Asteroid split**: ship hits asteroid; verify fragment positions and velocities.
- **Drop attraction**: drop near ship; verify pickup tick and final ship gold.
- **Wave 1 schedule**: seed + initial state; verify spawn-tick sequence.

Asteroid-split, drop-attraction, and wave-schedule are **not** prediction-relevant (the client doesn't predict them), so they can ship behind v1 without strict parity. But adding them to the harness catches algorithm drift before it ships.

#### When the harness fails

A failing parity test means one of:

1. The Rust and JS implementations diverge — fix one or the other.
2. The fixture is stale (an intentional algorithm change): regenerate via `cargo run --bin generate-fixtures`.
3. A floating-point edge case crept in — likely needs to be fixed-point.

Each failure mode has an obvious resolution. The harness is loud and honest.

### Ring 2 — schema-driven codegen

For v1 we hand-mirror the protocol enums and field shapes. Before public beta, we generate them.

#### v1: hand-mirrored discipline

A single `schema/protocol.toml` describes intent, even if not yet machine-readable:

```toml
# schema/protocol.toml
wire_version = 1
sim_version = 1

[[message.client]]
name = "Hello"
fields = [
    { name = "wire_version", type = "u16" },
    { name = "sim_version",  type = "u16" },
    { name = "client_version", type = "string" },
    { name = "display_name", type = "string" },
    { name = "session", type = "uuid?", doc = "absent on first connect" },
]

[[message.client]]
name = "Input"
fields = [
    { name = "tick", type = "u32" },
    { name = "packed", type = "PackedInput" },
]

[[message.server]]
name = "Welcome"
fields = [
    { name = "player_id", type = "PlayerId" },
    { name = "session", type = "uuid" },
    { name = "server_t_ms", type = "u64" },
]

# ... etc
```

For v1 this file is *documentation*. Both sides reference it during PRs. A PR that changes the protocol should also update this file; reviewers compare.

A simple `tools/check-schema.mjs` parses the TOML and asserts that:

- Every `[message.client.*]` exists as a `ClientMsg` variant in Rust.
- Every `[message.server.*]` exists as a `ServerMsg` variant in Rust.
- Every variant has a corresponding entry in `js/sim/protocol.js`'s tag map.
- Field names line up.

This is name-level checking, not type-level — but it catches "I added a Rust variant and forgot to update JS" 90% of the time.

#### v2: real codegen

Before public beta:

```rust
// tools/codegen-protocol/src/main.rs
fn main() {
    let spec = parse_toml("schema/protocol.toml");
    write_rust("server/src/protocol/generated.rs", &spec);
    write_js("js/sim/protocol-generated.js", &spec);
}
```

A `build.rs` in `server/` runs this on every build. The JS side has it as a `prebuild` npm script. Running CI without regenerated artifacts fails the PR.

The codegen handles:

- Enum variant tags + payload encoding.
- Struct field offsets.
- Fixed-point types (correct conversion both ways).
- Cosmetic vs prediction-relevant field separation.

The codegen does **not** handle simulation algorithms. Those remain hand-mirrored, which is what the parity harness is for.

#### Why not codegen the simulation too

Tempting but premature. The simulation is too rich and too domain-specific to express declaratively. We'd be writing a domain-specific language whose maintenance cost exceeds the parity harness's. The parity harness handles algorithm drift directly without inventing a DSL.

If, several versions in, the simulation surface stabilizes enough that ~80% of changes are mechanical, revisit. For v1: hand-mirror, parity-test, accept the cost.

### Ring 3 — written discipline

The parts of the strategy that are about humans, not code.

#### Parallel directory structure

`js/sim/ship.js` and `server/src/sim/ship.rs` exist side by side. Same file names, same module-level structure, same function names (with case convention). A diff tool can show them next to each other; reviewers compare.

#### PR template

Pull requests touching the simulation get a checkbox:

```
- [ ] If this PR changes simulation behavior, both `js/sim/` and `server/src/sim/` are updated.
- [ ] Parity harness fixtures regenerated if needed.
- [ ] schema/protocol.toml updated if wire format changed.
```

Reviewers eyeball before approving. Bot-checkable for the schema field.

#### Sim spec doc

A `schema/SIM_SPEC.md` documents the rules a contributor must follow when modifying simulation code:

- "Ship physics is fixed-point. Changes go through `js/sim/fxp.js` and `server/src/sim/fxp.rs`."
- "Trig is via `js/sim/trig.js` polynomial approximation; `server/src/sim/trig.rs` mirrors. Don't call `Math.sin` or `f32::sin` in the simulation path."
- "RNG is `state.rng`; never `Math.random()` or `rand::random()`."
- "Adding a new event variant: update `schema/protocol.toml`, `server/src/protocol/mod.rs`, `js/sim/protocol.js`, and the parity codec round-trip test."

This document is short and updated as patterns crystallize.

---

## Wire protocol mirror in JS

Where the Node plan has a single shared `js/sim/protocol.js`, the Rust plan has *parallel* implementations. The JS side decodes what the Rust server encoded, and encodes what the Rust server expects.

### The codec layout

```js
// js/sim/protocol.js
export const WIRE_VERSION = 1
export const SIM_VERSION  = 1

// Tag values must match server/src/protocol/mod.rs exactly.
export const C2S = {
  HELLO: 0x01, QUICK_MATCH: 0x02, BROWSE_ROOMS: 0x03,
  CREATE_ROOM: 0x04, JOIN_ROOM: 0x05, JOIN_BY_CODE: 0x06,
  LEAVE_ROOM: 0x07, INPUT: 0x08, ACK: 0x09, PONG: 0x0A,
  POWERUP_CHOOSE: 0x0B, REVIVE: 0x0C, CHAT: 0x0D,
}

export const S2C = {
  WELCOME: 0x80, ERROR: 0x81, ROOM_LIST: 0x82,
  ROOM_JOINED: 0x83, ROOM_LEFT: 0x84, PEER_JOINED: 0x85,
  PEER_LEFT: 0x86, SNAPSHOT: 0x87, EVENT: 0x88, PING: 0x89,
}

export const EVT = {
  BULLET_SPAWN: 0x01, BULLET_DESPAWN: 0x02,
  ENEMY_DESTROY: 0x03, ASTEROID_DESTROY: 0x04,
  ORB_COLLECT: 0x05, PLAYER_DAMAGED: 0x06,
  PLAYER_DOWNED: 0x07, PLAYER_REVIVED: 0x08,
  WAVE_START: 0x09, WAVE_CLEAR: 0x0A,
  POWERUP_OFFER: 0x0B, POWERUP_CHOSEN: 0x0C,
  HIT_FLASH: 0x0D, DAMAGE_NUMBER: 0x0E,
}
```

### Bincode-compatible decoder

The Rust server uses `bincode::serialize` with default config (little-endian, fixed-int sizing, length-prefixed strings/sequences). The JS decoder mirrors this exactly:

```js
// js/sim/codec.js
const enc = new TextEncoder()
const dec = new TextDecoder()

export class Reader {
  constructor(buf, off = 0) { this.buf = buf; this.off = off }
  u8()  { const v = this.buf.getUint8(this.off); this.off += 1; return v }
  u16() { const v = this.buf.getUint16(this.off, true); this.off += 2; return v }
  u32() { const v = this.buf.getUint32(this.off, true); this.off += 4; return v }
  u64() { const v = this.buf.getBigUint64(this.off, true); this.off += 8; return v }
  i8()  { const v = this.buf.getInt8(this.off); this.off += 1; return v }
  i32() { const v = this.buf.getInt32(this.off, true); this.off += 4; return v }
  f32() { const v = this.buf.getFloat32(this.off, true); this.off += 4; return v }
  f64() { const v = this.buf.getFloat64(this.off, true); this.off += 8; return v }
  bool(){ return this.u8() !== 0 }
  fxp() { return Fxp.fromRaw(this.i32()) }
  str() {
    // bincode default: 8-byte length prefix
    const len = Number(this.u64())
    const bytes = new Uint8Array(this.buf.buffer, this.buf.byteOffset + this.off, len)
    this.off += len
    return dec.decode(bytes)
  }
  vec(itemFn) {
    const len = Number(this.u64())
    const out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = itemFn(this)
    return out
  }
  // ... option, enum tag, etc.
}

export class Writer {
  constructor(initial = 4096) {
    this.buf = new ArrayBuffer(initial)
    this.view = new DataView(this.buf)
    this.bytes = new Uint8Array(this.buf)
    this.off = 0
  }
  // ensure-capacity, u8/u16/u32/.../str/vec mirroring Reader
  // ...
}
```

A small detail: bincode has *two* int-sizing modes — fixed (default) and variable. We pin the server to fixed-int sizing via `bincode::config::standard().with_fixed_int_encoding()` so the JS side has a simpler decoder.

### Hand-written variant decoders (v1)

```js
// js/sim/protocol.js  (excerpt)
export function decodeServerMsg(arrayBuffer) {
  const r = new Reader(new DataView(arrayBuffer))
  const tag = r.u8()
  switch (tag) {
    case S2C.WELCOME: return {
      type: S2C.WELCOME,
      playerId: r.u32(),
      session: readUuid(r),
      serverTMs: Number(r.u64()),
    }
    case S2C.SNAPSHOT: return {
      type: S2C.SNAPSHOT,
      tick: r.u32(),
      baseTick: readOption(r, () => r.u32()),
      payload: readSnapshotPayload(r),
    }
    case S2C.EVENT: return {
      type: S2C.EVENT,
      tick: r.u32(),
      event: readGameEvent(r),
    }
    // ... etc
    default:
      throw new Error(`unknown server tag 0x${tag.toString(16)}`)
  }
}

function readGameEvent(r) {
  const tag = r.u8()
  switch (tag) {
    case EVT.BULLET_SPAWN: return {
      type: EVT.BULLET_SPAWN,
      id: r.u32(), owner: r.u32(), weapon: r.u8(),
      x: r.fxp(), y: r.fxp(), vx: r.fxp(), vy: r.fxp(),
    }
    case EVT.ENEMY_DESTROY: return {
      type: EVT.ENEMY_DESTROY,
      id: r.u32(),
      by: readOption(r, () => r.u32()),
      drops: r.vec(rr => rr.u32()),
    }
    // ...
    default:
      throw new Error(`unknown event tag 0x${tag.toString(16)}`)
  }
}
```

### Codegen-replaced decoders (v2)

Before public beta, `tools/codegen-protocol` reads `schema/protocol.toml` and produces the `decodeServerMsg` and `readGameEvent` functions automatically. Manual mirrors retire.

### Round-trip tests

Per-variant round-trip is the v1 baseline:

```js
// js/sim/protocol.test.js
test('Snapshot round-trips', () => {
  const original = sampleSnapshot()
  const encoded = encodeServerMsg(original)
  const decoded = decodeServerMsg(encoded)
  expect(decoded).toEqual(original)
})

test('Every GameEvent variant round-trips', () => {
  for (const variant of allEventVariants()) {
    const encoded = encodeGameEvent(variant)
    const decoded = readGameEvent(new Reader(new DataView(encoded)))
    expect(decoded).toEqual(variant)
  }
})
```

The Rust counterpart in `server/src/protocol/codec.rs`:

```rust
#[test]
fn every_event_variant_round_trips() {
    for variant in all_event_variants() {
        let bytes = bincode::serialize(&variant).unwrap();
        let decoded: GameEvent = bincode::deserialize(&bytes).unwrap();
        assert_eq!(variant, decoded);
    }
}
```

The cross-language round-trip — Rust encodes a variant, JS decodes, JS re-encodes, byte-compare to Rust output — lives in the parity harness.

---

## Determinism across languages

The hardest engineering problem in this plan. Fortunately, only a small subset of the simulation has to be cross-language deterministic.

### What has to agree (bit-by-bit)

Only the **prediction-relevant subset**: the parts of the simulation the client predicts locally, against which the server reconciles via snapshots.

For Rainboids, that means **ship movement physics only**. The client predicts:

- Position and velocity given input thrust.
- Boundary wrap.
- Friction and max-speed clamping.
- Powerup-modified acceleration and max-speed values.

The client does **not** predict:

- Ship-bullet collision (server-authoritative; visible as a slight phantom-hit tolerance).
- Enemy AI (interpolated from snapshots).
- Asteroid splits (server-authoritative; events).
- Drop attraction and pickup (server-authoritative; events).
- Wave timing (server-authoritative; events).
- Anything cosmetic (always client-driven from events).

This narrowing — only ship movement — makes cross-language determinism a tractable problem.

### Why floating-point is the enemy

`f32::sin(x)` in Rust and `Math.sin(x)` in V8 use different libm implementations. They agree to within ~1 ULP for most inputs and disagree at edge cases. Over a 60-tick prediction window, those tiny disagreements compound.

Worse, V8's JIT may use SSE, AVX, or pure x87 depending on the input shape and target arch. Rust uses the platform's libm directly. Even within JS, `Math.sin` is not portable across browsers with bit-for-bit guarantees.

For a non-prediction game, this doesn't matter — the server is canonical and the client interpolates. But predicted ship physics needs cross-language consensus.

### The fix: fixed-point ship physics

Ship positions, velocities, and movement integration use **fixed-point integer math** on both sides. Integer math is bit-identical across languages and platforms.

```rust
// server/src/sim/fxp.rs
use fixed::types::I16F16;
pub type Fxp = I16F16;          // 16 integer bits, 16 fractional bits, ~15µm precision

pub const FXP_ZERO: Fxp = I16F16::ZERO;
pub const FXP_DT: Fxp = I16F16::from_bits(1092);   // 1/60 second ≈ 0.01666

pub fn fxp_mul(a: Fxp, b: Fxp) -> Fxp { a * b }    // wraps Fixed's overflow-checked mul
pub fn fxp_add(a: Fxp, b: Fxp) -> Fxp { a + b }
```

```js
// js/sim/fxp.js
// I16F16: same shape as Rust. Stored as i32 (raw bits).
const FXP_FRACT_BITS = 16
const FXP_ONE = 1 << FXP_FRACT_BITS

export class Fxp {
  constructor(raw) { this.raw = raw | 0 }  // force i32

  static fromInt(n)   { return new Fxp((n << FXP_FRACT_BITS) | 0) }
  static fromFloat(f) { return new Fxp(Math.round(f * FXP_ONE) | 0) }
  static fromRaw(r)   { return new Fxp(r | 0) }

  toFloat() { return this.raw / FXP_ONE }

  add(other) { return new Fxp((this.raw + other.raw) | 0) }
  sub(other) { return new Fxp((this.raw - other.raw) | 0) }
  mul(other) {
    // 32-bit * 32-bit fits in 64-bit; shift back. Use BigInt for the intermediate.
    const big = BigInt(this.raw) * BigInt(other.raw)
    return new Fxp(Number(big >> BigInt(FXP_FRACT_BITS)) | 0)
  }
  // div, neg, abs, etc.
}

export const FXP_ZERO = new Fxp(0)
export const FXP_DT   = Fxp.fromFloat(1 / 60)   // beware: precomputed once, value = 1092
```

Both sides compute `a * b` as an integer multiply, shift right by 16. The result is identical down to the last bit.

#### Performance cost on the JS side

`BigInt` for the multiply is a 5–10× slowdown vs native `Math.imul`. For ship physics specifically, we can avoid `BigInt`:

```js
// Fast path for I16F16: split into 16-bit halves, multiply, recombine.
mul(other) {
  const aHi = (this.raw  >> 16) | 0,  aLo = this.raw  & 0xFFFF
  const bHi = (other.raw >> 16) | 0,  bLo = other.raw & 0xFFFF
  const ll = Math.imul(aLo, bLo)
  const lh = Math.imul(aLo, bHi)
  const hl = Math.imul(aHi, bLo)
  const hh = Math.imul(aHi, bHi)
  // result = (hh << 32) + ((lh + hl) << 16) + ll, then >> 16 (i.e. discard low 16 bits)
  const lowMid = ((lh + hl) | 0) << 16
  return new Fxp(((hh << 16) + ((ll + lowMid) >>> 16)) | 0)
}
```

A handful of `Math.imul` calls. ~3× faster than the `BigInt` version, ~2× slower than native f32 multiply. Acceptable for the ~10 multiplies per ship per tick.

#### Trig without libm

Ship facing rotates from input; the simulation needs `sin` and `cos` for thrust-vector decomposition. We replace `Math.sin` with a fixed-point polynomial:

```js
// js/sim/trig.js   (also mirrored in server/src/sim/trig.rs)
// 8-term Taylor polynomial for sin in [-π, π], with reduction.
// Same coefficients on both sides; produces bit-identical results from Fxp inputs.
const SIN_COEFFS = [
  Fxp.fromFloat(1.0),
  Fxp.fromFloat(-0.16666666),
  Fxp.fromFloat(0.0083333),
  Fxp.fromFloat(-0.000198413),
  Fxp.fromFloat(0.000002756),
]

export function fxpSin(x) {
  // reduce x to [-π, π], then evaluate polynomial
  const reduced = reduceModTwoPi(x)
  let result = SIN_COEFFS[4]
  const x2 = reduced.mul(reduced)
  result = result.mul(x2).add(SIN_COEFFS[3])
  result = result.mul(x2).add(SIN_COEFFS[2])
  result = result.mul(x2).add(SIN_COEFFS[1])
  result = result.mul(x2).add(SIN_COEFFS[0])
  return result.mul(reduced)
}
```

Both sides use the same coefficients (computed once and pinned in the spec) and the same reduction algorithm. Output is bit-identical given same input.

For higher precision, use a CORDIC algorithm or a longer polynomial. The 8-term Taylor is good to ~5 ULPs at f32 precision, which is more than enough for visible ship-physics fidelity.

#### Summary of fixed-point scope

```
Fixed-point, deterministic across languages:
- Ship.x, Ship.y, Ship.vx, Ship.vy
- Bullet spawn (x,y,vx,vy) — events emitted by ship code
- Trig (sin, cos, atan2)
- The integration step in update_ship

Floating-point, language-native:
- Ship.facing (read by client for cosmetic rendering only; predicted via integer
  rotation step but stored as a derived f32 for renderer ergonomics)
- Ship.hp, Ship.gold, Ship.score (server-authoritative, never predicted)
- Enemy.x, .y, .vx, .vy (interpolated from snapshots; never predicted)
- Asteroid, Drop, Particle, Wave timer fields
- All event payloads except those listing exact positions
```

### Reconciliation strategy

With fixed-point, prediction reconciliation is *exact*. The client's predicted state and the server's authoritative state agree byte-for-byte at the same `(seed, input_log)`.

```js
// js/net/prediction.js
import { updateShipPure } from '../sim/ship.js'

export class Predictor {
  constructor() {
    this.pending = []        // [{tick, input}, ...]
    this.localShipState = null
    this.tick = 0
  }

  applyLocalInput(input) {
    this.tick++
    this.pending.push({ tick: this.tick, input })
    this.localShipState = updateShipPure(this.localShipState, input, FXP_DT)
  }

  onSnapshot(serverTick, serverShip) {
    while (this.pending.length && this.pending[0].tick <= serverTick) this.pending.shift()
    let s = clone(serverShip)
    for (const p of this.pending) s = updateShipPure(s, p.input, FXP_DT)
    if (!shipsEqual(s, this.localShipState)) {
      // SHOULD NEVER HAPPEN with fixed-point. If it does, log loudly.
      log.warn('prediction divergence detected', { client: this.localShipState, replayed: s })
    }
    this.localShipState = s
  }
}
```

The "should never happen" branch is a tripwire. If it ever fires, the parity harness has a hole in it; we add a fixture and update the harness.

### Floating-point fallback path

If a future feature needs to predict something that *can't* reasonably be fixed-point (e.g. complex trajectory math through a force field), the fallback is **conservative prediction with snapping**:

- Predict using f32 best-effort.
- On every snapshot, if the position differs from the server by more than a threshold (say 50 pixels), snap to the server position.
- Below the threshold, smooth-interpolate from prediction to server over 100ms.

This is the standard approach in non-deterministic netcode (Quake 3, Source). It's a fallback for when full determinism isn't worth pursuing. For Rainboids' ship movement, full determinism *is* worth it; for hypothetical future systems, fall back gracefully.

---

## Detailed plan: client networking layer

The networking glue is similar to the Node version with a few Rust-specific tweaks.

### `js/net/ws-client.js`

Almost identical to the Node version. The differences:

- **Hello carries `wire_version` AND `sim_version`.** Both must match the server. The Node version cared only about wire version because the simulation was shared.
- **On version mismatch:** the client shows an "update required" message rather than reconnect-looping; the server sends a structured close with the version it speaks.
- **Decoding uses the Rust-bincode-compatible codec** described earlier rather than a shared module.

```js
import { WIRE_VERSION, SIM_VERSION, encodeHello, decodeServerMsg, S2C } from '../sim/protocol.js'

export class WsClient extends EventTarget {
  // ... (same shape as Node version)

  _onOpen() {
    this.reconnectAttempt = 0
    this.send(encodeHello({
      wireVersion: WIRE_VERSION,
      simVersion: SIM_VERSION,
      clientVersion: VERSION,
      displayName: nameFromStorage(),
      session: this.session,
    }))
  }

  _onMessage(buf) {
    const msg = decodeServerMsg(buf.buffer)
    switch (msg.type) {
      case S2C.WELCOME:     /* ... */ break
      case S2C.SNAPSHOT:    /* ... */ break
      case S2C.EVENT:       /* ... */ break
      case S2C.PING:        this.send(encodePong(msg.clientT, msg.serverT)); break
      case S2C.ERROR:
        if (msg.code === 'version_mismatch') showUpdateRequiredScreen()
        break
    }
  }
}
```

### `js/net/prediction.js`

Slightly stricter than the Node version because divergence between prediction and snapshot is a *bug to detect*, not a smoothing problem:

```js
export class Predictor {
  // ... (same fields)

  onSnapshot(serverTick, serverShip) {
    while (this.pending.length && this.pending[0].tick <= serverTick) this.pending.shift()
    let s = cloneFxp(serverShip)
    for (const p of this.pending) s = updateShipPure(s, p.input, FXP_DT)

    if (!fxpShipsEqual(s, this.localShipState)) {
      this.metrics.predictionDivergence.inc()
      log.warn('prediction divergence', {
        clientPos: this.localShipState,
        replayedFromServer: s,
        pendingInputs: this.pending.length,
      })
    }
    this.localShipState = s
  }
}
```

Logging divergences is the canary for cross-language drift bugs. If `predictionDivergence` ever counts up in production, we know either (a) parity-harness has a hole, or (b) something non-deterministic crept into ship physics.

### `js/net/interpolation.js`, `event-firehose.js`, `matchmaking.js`, `session.js`

Identical to the Node plan. The cross-language concerns don't reach these layers — they're purely consumers of decoded server messages. See `NodeJS Multiplayer Engine and Client.md` for the full sketches.

---

## Engine driver — mode-aware

Same shape as the Node plan; reproduced here briefly.

```js
// js/engine/engine.js
import { simulateTick, GameState, makeRng } from '../sim/index.js'
import { Predictor } from '../net/prediction.js'
import { Interpolator } from '../net/interpolation.js'
import { EventFirehose } from '../net/event-firehose.js'

export class Engine {
  constructor({ mode, renderer, fx, audio, input, ws }) {
    this.mode = mode
    // ... fields
  }

  startSolo(seed) {
    this.mode = 'solo'
    this.state = GameState.fresh(seed)
  }

  startOnline({ myId, baselineSnapshot, baselineTick }) {
    this.mode = 'online'
    this.myId = myId
    this.state = GameState.fromBaseline(baselineSnapshot)
    this.predictor = new Predictor()
    this.predictor.setBaseline(baselineSnapshot.ships.get(myId), baselineTick)
    this.interpolator = new Interpolator()
    this.firehose = new EventFirehose({ fxLayer: this.fx, hud: this.renderer.hud, audio: this.audio })
    this.ws.addEventListener('snapshot', (e) => this._onSnapshot(e.detail))
    this.ws.addEventListener('game_event', (e) => this.firehose.ingest(e.detail))
  }

  tick(dt) {
    this.input.capture()
    const localInput = this.input.snapshot()

    if (this.mode === 'solo') {
      const inputs = new Map([[this.myId ?? 'p1', localInput]])
      simulateTick(this.state, inputs, dt, this.state.rng, this.events)
    } else {
      this.predictor.applyLocalInput(localInput)
      this._sendInputCoalesced(localInput)
    }

    this.fx.consume(this.events)
    this.events.length = 0
  }

  render() {
    let renderState
    if (this.mode === 'solo') {
      renderState = this.state
    } else {
      renderState = this.interpolator.sample(this._serverNow())
      renderState.ships.set(this.myId, this.predictor.localShipState)
    }
    this.renderer.draw(renderState)
  }

  _onSnapshot(snap) {
    this.interpolator.ingest(snap.serverT, snap.state)
    const myShip = snap.state.ships.get(this.myId)
    if (myShip) this.predictor.onSnapshot(snap.tick, myShip)
  }

  _sendInputCoalesced(input) {
    if ((this.predictor.tick & 1) === 0) this.ws.sendInput({ tick: this.predictor.tick, ...input })
  }

  _serverNow() {
    return performance.now() + this.ws.serverTimeOffsetMs
  }
}
```

The engine itself is small — most of the logic lives in `js/sim/` (mirrored in Rust) and `js/net/` (online-only).

---

## Solo mode preservation guarantees

A blocking requirement: **solo play must feel and benchmark identically to before**.

The same guarantees as the Node plan, with one Rust-specific note:

- Solo runs `js/sim/simulateTick`. Same physics, same RNG, same event stream.
- Solo's `FxLayer` is the same one online uses.
- The renderer reads from the same `GameState` it always did.
- The `setTimeout`-based wave spawns become tick-driven timers.
- **Solo doesn't depend on the Rust server in any way.** If the server is down, solo still runs. The "online" code path is opt-in from the title screen.

**Verification gate** before networking work begins:

- All existing tests pass.
- Frame timing in benchmarks within ±2% of pre-refactor.
- Manual playthroughs of waves 1, 5, 10, boss waves: visually indistinguishable from `master`.
- Replay mode: a fixed seed + recorded inputs produces a known final state hash.

These don't require the Rust server to exist yet. The engine refactor and parity infrastructure can land without any networking.

---

## Co-op gameplay implementation

Identical to the Node plan. Each co-op rule is a simulation rule that lives in *both* `js/sim/` and `server/src/sim/`. The Rust path just doubles the implementation cost; the behavior is the same.

Briefly:

- **Reviving downed players** — `js/sim/ship.js` and `server/src/sim/ship.rs` both implement the revive-progress timer and emit `PLAYER_REVIVED`.
- **Per-player wave-clear powerup picks** — server-authoritative gating; client UI sends `POWERUP_CHOOSE`.
- **Drop attribution** — `js/sim/drops.js` and `server/src/sim/drops.rs` both run "any-ship-collects-orb" logic.
- **Friendly fire off** — `js/sim/collision.js` and `server/src/sim/collision.rs` both skip player-vs-player.

For each, the parity harness adds a fixture covering the rule.

---

## UX changes

Identical to the Node plan:

- Title-screen multiplayer panel.
- Lobby screen for room creation flow.
- Reconnection toast (with one extra state: "version mismatch — please update").
- Room-status HUD.

The UX layer doesn't touch the simulation, so the Rust path doesn't add anything here.

---

## Testing strategy (client side)

### Pure simulation tests

`js/sim/*.test.js` — same files run in:

- **Browser CI** under existing Jest (or migrated to `node:test`).
- **Server CI** as part of the parity harness.

Each test covers one piece of the JS-side simulation. Examples:

- `ship.test.js` — `updateShipPure(state, {moveX: 1}, FXP_DT)` produces expected position delta.
- `collision.test.js` — bullet-vs-asteroid hit produces expected event sequence.
- `wave.test.js` — wave 1 schedule with seed 42 produces expected enemy spawn times.
- `fxp.test.js` — fixed-point arithmetic matches a hand-computed reference table.
- `trig.test.js` — `fxpSin(0)`, `fxpSin(PI/2)`, etc. match expected reference values.

The Rust counterparts in `server/src/sim/*.rs::tests` cover the same logical cases with Rust-flavored idioms.

### Cross-language parity harness

The headline test class for the Rust path. Detailed earlier in this document. Required to be green for any merge to `main`.

### Engine integration tests (Playwright)

Same as the Node plan:

- Solo: starts a run, plays 30s of recorded inputs, asserts state hash matches golden.
- Online (against in-process Rust server): two headless browsers connect, quick-match, see each other in same room, both fire, both kills register on shared enemies.

The Rust integration test harness uses `tokio-test` to spin up the server in-process and connects via `tokio-tungstenite`, mirroring the browser-side test path.

### Replay-determinism test

`tools/replay.mjs` — load a recorded input log + seed; run JS `simulateTick` N times; compare final state hash against expected. Run on every CI green; pins simulation determinism.

### Codec round-trip tests

For every `ServerMsg`, `ClientMsg`, and `GameEvent` variant:

- Rust round-trip: encode, decode, compare. (`server/src/protocol/codec.rs::tests`)
- JS round-trip: encode, decode, compare. (`js/sim/protocol.test.js`)
- Cross-language round-trip in CI: Rust encodes a representative payload, writes bytes to file; JS decodes the bytes; JS re-encodes; compare byte-for-byte to Rust's bytes. Any divergence = bug.

This test class catches schema drift before it ships.

---

## Migration plan (rolling out without breaking solo)

The refactor is the heaviest piece. Done wrong, it lands as a multi-thousand-line PR that breaks solo play in subtle ways and is impossible to bisect.

**Done right:** every step lands as a separate PR, each of which is solo-equivalent on its own. The Rust path adds extra PRs for the parity infrastructure.

Recommended sequence:

1. **PR 1**: Create `js/sim/` directory; move `state.js`, `rng.js`, `events.js` skeletons in. No engine changes yet.
2. **PR 2**: Migrate ship physics into `js/sim/ship.js`. Engine calls `updateShips(...)`. Solo unchanged.
3. **PR 3**: Migrate enemies. Same shape.
4. **PR 4**: Migrate asteroids, bullets.
5. **PR 5**: Migrate collisions; events queue replaces inline particle/sound calls. `FxLayer` introduced. Solo unchanged.
6. **PR 6**: Migrate drops, waves. `setTimeout` spawns become tick-based.
7. **PR 7**: Renderer reads from `state` not from engine pools.
8. **PR 8**: Single input capture point. Engine driver shape.
9. **PR 9**: Replay determinism test added; gates further changes.
10. **PR 10**: `simulateTick` exists. Engine calls it. Solo plays through simulation as a black box.
11. **PR 11**: Fixed-point math module (`js/sim/fxp.js`); ship physics converted; replay-determinism stays green. (RUST-PATH-SPECIFIC)
12. **PR 12**: Trig polynomial module (`js/sim/trig.js`); ship facing arithmetic converted. (RUST-PATH-SPECIFIC)
13. **PR 13**: Schema source-of-truth (`schema/protocol.toml`) + spec doc + PR template. (RUST-PATH-SPECIFIC)
14. **PR 14**: JS protocol codec (`js/sim/protocol.js`) hand-mirroring an empty Rust enum; round-trip tests pass for the empty case. (RUST-PATH-SPECIFIC)
15. **PR 15**: Rust server scaffolding (separate from client; covered in `Rust Server.md`).
16. **PR 16**: Rust simulation port — ship physics with parity harness green for ship fixtures. (RUST-PATH-SPECIFIC)
17. **PR 17**: Rust simulation port — bullets, collisions, asteroids, drops, waves with parity harness green for new fixtures. (RUST-PATH-SPECIFIC)
18. **PR 18**: `js/net/ws-client.js`, `prediction.js`, `interpolation.js`. Online mode opt-in via debug flag.
19. **PR 19**: Title screen MP panel (UI only).
20. **PR 20**: End-to-end MP behind a feature flag.
21. **PR 21+**: Co-op design (revives, drop attribution, etc.), one PR each — touching JS sim, Rust sim, parity fixture per PR.
22. **PR 22**: Codec codegen replaces hand-mirrored decoders. (RUST-PATH-SPECIFIC)
23. **PR final**: Feature flag flipped to default-on.

The Node plan has 16 PRs. The Rust plan has ~23. The extra ~7 PRs are the cross-language infrastructure: fixed-point, trig polynomial, schema, hand-mirrored codec, Rust ports for sim subsections, codegen migration. None are individually large; collectively they account for the additional engineering cost.

Each PR is small, reviewable, revertible. None of them break solo play.

---

## Risks specific to the Rust client/engine path

Repeating the most important ones from the Node plan and adding Rust-specific ones.

### Shared with the Node plan

- **`game-engine.js` has years of accreted shortcuts.** Same risk; same mitigation (incremental refactor PRs, replay-determinism test).
- **`setTimeout` wave spawns.** Replacing with tick-driven timers is a behavior change. Same mitigation.
- **Pool ownership.** Renderers that hold long-lived references to engine pools must be re-pointed.
- **JSDoc isn't enforced like TS.** Same mitigation: `tsc --noEmit` in CI.
- **Pure-function discipline drift.** ESLint rule restricting `Math.random` and `Date.now` inside `js/sim/`.

### Unique to the Rust path

- **Fixed-point math is unfamiliar.** Most JS devs haven't touched fixed-point. Mitigation: small, well-documented `Fxp` class with a clear scope ("only ship coords, vel, and trig"); rest of the codebase stays in float.
- **Polynomial trig is harder to get right than libm.** Bugs in `fxpSin` look like physics weirdness. Mitigation: the trig polynomial is a 30-line file with a comprehensive test against reference values from a high-precision lib (run once, pinned).
- **Cross-language schema drift is silent.** Rust adds `Snapshot.foo: u32`; JS still reads the old layout. Mitigation: `schema/protocol.toml` + name-level checker as v1; codegen as v2.
- **Cross-language algorithm drift is silent.** Server changes ship friction; JS still uses the old constant. Mitigation: parity harness in CI; physics constants in `schema/SIM_SPEC.md`; PR template.
- **Compile-time fatigue.** Server rebuilds on every sim-rule change. Mitigation: `mold` linker, `cargo check` in the inner loop, well-split crate modules.
- **Cognitive cost of two languages.** Every contributor switches between JS and Rust mentally. Mitigation: parallel directory structure, side-by-side reviews, structural pressure toward consistency.
- **Floating-point determinism within JS.** The fixed-point conversion (`Fxp.fromFloat`) uses `Math.round` — this is fine *within JS* across browsers because IEEE-754 round-half-to-even is universal — but a future feature using f32 trig in the prediction path would break this property. Mitigation: spec doc forbids float trig in prediction path; ESLint or grep-CI rule rejects it.
- **Browser-vs-Node f32 semantics.** A test that runs in Node and a test that runs in a browser may disagree on edge cases of `Math.fround`. Mitigation: pin to fixed-point everywhere this could matter; v1 doesn't run sim tests under the browser harness, only Node.

---

## What is explicitly not in this plan

Same as the Node plan, plus:

- **Full TypeScript migration.** Adopt JSDoc-typed JS for v1; revisit later. Adding TS would multiply the migration work.
- **WebAssembly compilation of Rust sim into JS.** Tempting and elegant — the same Rust simulation crate compiled to wasm could *be* the JS sim, restoring the Node plan's drift-elimination for free. But: real engineering complexity (wasm-bindgen wrappers, performance characteristics, build-tool friction, debug story), and the simulation surface in Rust would need to be `no_std`-friendly. **Not v1 scope.** A potential v2 unifying path; document it as a bridge if cross-language pain becomes load-bearing.
- **In-game schema introspection.** The server doesn't ship its protocol spec to clients; clients just speak it. Mitigation: version mismatch closes the connection cleanly with an upgrade prompt.
- **Hot-swap of server during a run.** Out of scope; restart costs ~1s and reconnect handles it.
- **Mid-run rebalancing** (e.g. "if all players join late, rewind to wave 1"). Joiners adopt the run's current wave.

---

## Acceptance criteria for "engine refactor is complete"

Before any networking PR lands:

- [ ] `js/sim/` exists and exports a pure `simulateTick(state, inputs, dt, rng, events)`.
- [ ] No file under `js/sim/` imports from `js/render/`, `js/audio/`, `js/ui/`, or anything DOM-touching.
- [ ] No `Math.random()`, `performance.now()`, `Date.now()`, `setTimeout`, `setInterval` inside `js/sim/`.
- [ ] No `Math.sin()`, `Math.cos()`, `Math.atan2()` inside `js/sim/` (use `js/sim/trig.js`).
- [ ] `js/sim/*.test.js` runs identically under Jest (browser CI) and `node --test` (Rust path CI).
- [ ] Solo play: replay mode loads a fixed seed + input log, produces deterministic final state hash.
- [ ] Solo play: visual A/B against `master` shows no perceivable difference across waves 1, 5, 10, boss.
- [ ] Solo play: benchmark frame time within ±2% of `master`.
- [ ] All existing tests pass.
- [ ] Fixed-point math (`js/sim/fxp.js`) implemented; ship physics converted; replay-determinism still green.
- [ ] Polynomial trig (`js/sim/trig.js`) implemented; ship facing converted.

After all networking PRs land (per `Rust Server.md` acceptance):

- [ ] Two players can quick-match into a room and play wave 1 cooperatively.
- [ ] Local-ship reconciliation never logs `predictionDivergence` under typical play.
- [ ] Remote-ship interpolation is smooth at typical 50ms render-delay.
- [ ] HUD, audio, particles, screen shake feel identical to solo for events that occur in both modes.
- [ ] **Cross-language parity harness in CI green** on every commit.
- [ ] **Codec round-trip tests green** for every protocol variant.
- [ ] **No `predictionDivergence` warnings** in production telemetry over a 24-hour soak test.

The last three bullets are the new ones, all about defending against the drift class the Rust server chose to take on.

---

## Bottom line

The engine refactor is the load-bearing work — and it is identical regardless of whether the server is Node or Rust. Choosing Rust adds a parallel discipline on top: a schema source of truth, fixed-point math for the prediction-relevant subset, and a parity harness that gates merges.

That discipline is a real and ongoing cost. It is also what makes Rust's other advantages — bounded p99 tick time, single-binary deploys, strong static typing, fearless concurrency — *safe* to take. Without rings 1, 2, and 3, the cross-language gap turns into a stream of intermittent bugs that look like "the game feels weird sometimes" and are nearly impossible to triage.

With the discipline in place, the Rust path delivers a server that runs forever on a small VPS, fits in a 3MB binary, has flat tail latency, and never garbage-collects. The client carries a JS simulation it would have needed for solo play anyway. The two stay in sync because we built the harness that makes that property hold.

Build the engine refactor first — it's valuable independent of the server choice. Build the parity infrastructure (fixed-point math, trig polynomial, schema, harness) before porting any simulation code to Rust. Port simulation modules one at a time, each gated on parity-green. Wire the network layer last. Ship behind a feature flag; flip when the soak tests are clean.

The Rust path is the disciplined path. Pick it if the discipline is worth the long-term properties it protects.
