
Companion to `NodeJS Server.md`. This document plans the **client and engine** changes required to move Rainboids from a single-player monolith to a server-authoritative multiplayer architecture, while preserving an identical solo-play experience.

The premise of this plan rests on the Node-server choice: the **same simulation code runs on the client and the server**. That single fact reshapes the client work — we are not writing a "network client" that merely receives state; we are writing a client that *runs* the same simulation locally for solo play, runs a *predicted* version of it for the local ship online, and *consumes* server snapshots for the rest. One simulation, three modes of use.

---

## Overview of all changes

A bird's-eye view before the architectural deep-dive. Items are roughly ordered by depth; foundational refactors first, online-only features last.

### Foundational refactors (gate to everything)

1. **Extract `simulateTick` into `js/sim/`.** Pure function. No DOM, no audio, no rendering, no `requestAnimationFrame`, no `Math.random()`. Mirrors the eventual server import path.
2. **Define a single canonical `GameState` shape.** Documented with JSDoc. Replaces the implicit "engine fields" that are scattered across `game-engine.js` today.
3. **Replace inline-effect emission with an event queue.** Particles, screen shake, damage numbers, sounds — the simulation pushes events; a separate effect layer consumes them and produces cosmetics. No simulation code touches `ParticlePool` or `audioContext` ever again.
4. **Collapse input capture into a single point.** One `PlayerInput` struct produced per frame. Read by the simulation in solo mode; sent over the wire in online mode.
5. **Renderer reads `state`, not engine pools.** Today the renderers iterate engine-internal pool arrays. Tomorrow they iterate `state.enemies`, `state.asteroids`, etc. Pools become an implementation detail of the simulation.
6. **Seed all RNG.** Every `Math.random()` in the simulation path becomes `state.rng.next()`. Untouched outside the simulation (cosmetic randomness — particles, music shuffle — stays on `Math.random()`).
7. **Decouple `requestAnimationFrame` from the simulation tick.** The simulation runs at a *fixed* 60Hz logical tick driven by accumulator math; rendering runs at the display refresh rate. Today these are conflated.

### Network layer (new)

8. **`js/net/ws-client.js`** — connection lifecycle, ping/pong, exponential-backoff reconnect, session token persistence.
9. **`js/net/prediction.js`** — local-ship input buffer; replay-from-server-snapshot reconciliation.
10. **`js/net/interpolation.js`** — render-time-shifted lerp of remote entities from snapshot stream.
11. **`js/net/event-firehose.js`** — consumes server `Event` messages, dispatches to the existing effect layer (now event-driven).
12. **`js/net/matchmaking.js`** — Quick Match / Browse / Create / Join-by-Code over the same WS.
13. **`js/net/session.js`** — UUID stored in `localStorage`; survives reconnects within the grace window.

### Engine wiring (mode-aware glue)

14. **Online vs solo mode flag** on the engine. Solo mode runs `simulateTick` locally each tick. Online mode runs prediction for the local ship and consumes snapshots for everything else. Same engine class; same render path; same audio.
15. **Engine "tick budget" rework.** A clean fixed-step accumulator. In online mode, the local prediction tick runs only for the local ship.
16. **HUD updates** — show partner ships' HP, gold, score, downed state. Reuse existing HUD widgets.
17. **Ship palette assignment** — server-assigned slot color. Local rendering chooses tint by slot.

### Co-op gameplay

18. **Revive interaction** on the input layer (hold-to-revive button) and a downed-state ship rendering variant.
19. **Per-player wave-clear powerup picks** — the existing powerup-choice UI runs locally per-player; choices are sent as `PowerupChoose` events; the room aggregates and gates wave advance.
20. **Drop attribution** — orbs are visible to all; the simulation handles "anyone can collect" rules.
21. **Friendly fire off** — bullets owned by a player skip player-vs-player collision.

### UX

22. **Title screen** gains a multiplayer panel: Quick Match / Browse / Create Room / Join by Code.
23. **Lobby screen** for room creation flow: room name, public toggle, ready, start.
24. **Reconnection toast** — "reconnecting…" / "back" / "couldn't reconnect" states.
25. **Room-status HUD** — slot indicators top-right showing connected peers, pings, downed state.

### Solo-play preservation

26. **Solo mode still uses `simulateTick`.** No mock server, no wrapper. Engine just runs the function in-process. Same code; same feel.
27. **Solo replay** — the seeded RNG plus a recorded input stream lets us replay solo runs deterministically. (Not a multiplayer feature; a free side-effect of the refactor.)

The first 7 items are *the work*. Everything else builds on them.

---

## Pre-refactor baseline

A truthful summary of what we're starting from, so the gap is concrete.

`js/modules/game-engine.js` is ~2,555 lines and acts as:

- The single owner of all entity pools (enemies, asteroids, bullets, particles, drops, debris, stars).
- The input reader (keyboard, mouse, touch, gamepad polled inside the update loop).
- The simulation driver (calls `update()` on each entity inside the same loop).
- The collision handler (narrow-phase code lives inline on collision sites).
- The effect emitter (particle spawns, screen shake, damage numbers — invoked inline from collision callbacks and update functions).
- The renderer driver (calls `draw()` paths after each update).
- The wave / boss orchestrator (uses `setTimeout` for spawn schedules — a problem for server-driven sim).
- The audio trigger (calls `audioManager.play()` inline from simulation events).

There is no clean line between simulation and presentation. Every refactor step in this plan is a step that draws one of those lines.

The existing module structure (`js/modules/core/`, `combat/`, `player/`, `enemy/`, `wave/`, `world/`, `combat/`) is *good* — but the engine reaches across them informally. The refactor formalizes the boundary that already wants to exist.

---

## Target architecture

A diagram of where we are headed.

```
┌──────────────────────────────────────────────────────────────────┐
│  Rainboids client                                                │
│                                                                  │
│  ┌────────────────────────────┐                                  │
│  │  js/sim/  (pure)           │ ◀──── identical module imported  │
│  │   simulateTick             │      by the Node server          │
│  │   GameState / pools        │                                  │
│  │   ship / enemy / bullet    │                                  │
│  │   collision / drops / wave │                                  │
│  │   protocol / version       │                                  │
│  └─────────────┬──────────────┘                                  │
│                │ produces events / mutates state                 │
│                ▼                                                 │
│  ┌────────────────────────────┐                                  │
│  │  js/engine/                │  Mode-aware driver               │
│  │   solo:   tick(state)      │                                  │
│  │   online: predict(local)   │                                  │
│  │           + interp(remote) │                                  │
│  └────┬─────────┬──────────┬──┘                                  │
│       │         │          │                                     │
│       ▼         ▼          ▼                                     │
│  ┌────────┐ ┌────────┐ ┌────────────┐                            │
│  │ Render │ │ Audio  │ │ Effect     │   All consume state +      │
│  │ layer  │ │ layer  │ │ layer (FX) │   events; never mutate.    │
│  └────────┘ └────────┘ └────────────┘                            │
│                                                                  │
│  ┌──────────────────────────┐                                    │
│  │  js/net/                 │ Online-only.                       │
│  │   ws-client              │ Wraps WebSocket.                   │
│  │   prediction             │ Local ship reconcile.              │
│  │   interpolation          │ Remote entities lerp.              │
│  │   event-firehose         │ Server events → effect layer.      │
│  │   matchmaking / session  │                                    │
│  └──────────────────────────┘                                    │
│                                                                  │
│  ┌──────────────────────────┐                                    │
│  │  js/input/               │ Single capture point.              │
│  │   PlayerInput per frame  │                                    │
│  └──────────────────────────┘                                    │
│                                                                  │
│  ┌──────────────────────────┐                                    │
│  │  js/ui/  (title, lobby,  │ Existing UI; new screens for MP.   │
│  │           pause, shop)   │                                    │
│  └──────────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

Three "layers" of code:

1. **Pure** — `js/sim/`. No DOM, no audio, no `Math.random()`. Imported by the server.
2. **Glue** — `js/engine/`, `js/net/`, `js/input/`. Drives the pure layer based on mode.
3. **Presentation** — `js/render/`, `js/audio/`, `js/ui/`. Consumes state and events, never mutates the simulation.

The engine refactor is, fundamentally, *moving lines of code from layer 2 to layer 1, and from layer 1 to layer 3*. No new feature behavior; everything in service of the boundary.

---

## Detailed plan: engine architectural changes

### Step 1 — Extract `simulateTick`

The single most important step. Today's `update()` looks roughly like:

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
  // ... and so on
}
```

The target:

```js
// js/engine/engine.js  (driver)
update(dt) {
  this.input.capture()
  const playerInput = this.input.snapshot()           // PlayerInput per local player

  if (this.mode === 'solo') {
    simulateTick(this.state, mapOf({ p1: playerInput }), dt, this.state.rng, this.events)
  } else {
    this.predictor.applyLocalInput(playerInput, dt)
    this.interpolator.advance(performance.now())
  }

  this.fx.consume(this.events)                         // particles, sound, shake, damage numbers
  this.events.length = 0
  this.renderer.draw(this.state)
}
```

```js
// js/sim/tick.js  (pure)
import { updateShips }     from './ship.js'
import { updateEnemies }   from './enemy.js'
import { updateAsteroids } from './asteroid.js'
import { integrateBullets }from './bullet.js'
import { resolveCollisions } from './collision.js'
import { updateDrops }     from './drops.js'
import { tickWave }        from './wave.js'
import { cullDead }        from './state.js'

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

Each `updateXxx` is moved out of the engine into the relevant `js/sim/xxx.js`. Mechanical work, but invasive.

### Step 2 — `GameState` canonical shape

A typed container. JSDoc gives us autocomplete and `tsc --noEmit` checking.

```js
// js/sim/state.js
/**
 * @typedef {Object} Ship
 * @property {number} id
 * @property {number} slot           - 0..3
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} facing         - radians
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} gold
 * @property {number} score
 * @property {number} xp
 * @property {number} level
 * @property {number} weaponId
 * @property {number} weaponCooldown
 * @property {number} powerCharge
 * @property {boolean} alive
 * @property {boolean} downed
 * @property {boolean} frozenInvulnerable
 * @property {number} invulnUntil    - ms
 */

/** @typedef {Object} Bullet ... */
/** @typedef {Object} Enemy ... */
/** @typedef {Object} Asteroid ... */
/** @typedef {Object} Drop ... */
/** @typedef {Object} WaveState ... */
/** @typedef {Object} Field { width, height } */

export class GameState {
  /** @param {number} seed */
  static fresh(seed) {
    const s = new GameState()
    s.tick = 0
    s.field = { width: 1920, height: 1080 }
    s.ships = new Map()
    s.enemies = new EntityPool(/* ... */)
    s.asteroids = new EntityPool(/* ... */)
    s.bullets = new BulletPool(1024)
    s.drops = new EntityPool(/* ... */)
    s.wave = WaveState.fresh()
    s.rng = makeRng(seed)
    return s
  }

  removeShip(id) { this.ships.delete(id) }
}
```

`GameState` is a plain data class — no methods that mutate it (except `removeShip` for matchmaking). All mutation goes through `simulateTick` and its callees. This is the rule that makes the simulation testable and code-shareable.

### Step 3 — Replace inline effects with an event queue

Today: collision handler spawns particles and plays a sound *inline*. Tomorrow: simulation emits a `GameEvent`; an `FxLayer` consumes events and produces cosmetics.

```js
// js/sim/events.js
export const EVT = { /* same enum as protocol.js */ }

export function emitBulletSpawn(events, owner, weapon, x, y, vx, vy) {
  events.push({ type: EVT.BULLET_SPAWN, owner, weapon, x, y, vx, vy })
}
export function emitEnemyDestroy(events, id, by, x, y, color) {
  events.push({ type: EVT.ENEMY_DESTROY, id, by, x, y, color })
}
// ...
```

```js
// js/engine/fx-layer.js  (presentation)
export class FxLayer {
  constructor({ particles, audio, hud, shaker }) {
    this.particles = particles; this.audio = audio
    this.hud = hud;             this.shaker = shaker
  }
  consume(events) {
    for (const ev of events) {
      switch (ev.type) {
        case EVT.ENEMY_DESTROY:
          this.particles.spawnExplosion(ev.x, ev.y, ev.color)
          this.audio.play('explode_small')
          this.shaker.shake(0.4)
          break
        case EVT.BULLET_SPAWN:
          this.audio.play(weaponSfx(ev.weapon))
          break
        case EVT.PLAYER_DAMAGED:
          this.hud.flashHpBar(ev.player)
          this.shaker.shake(0.6)
          this.audio.play('player_hit')
          break
        // ... etc
      }
    }
  }
}
```

This split has three deep wins:

- **Solo runs the same path as online.** In solo, `simulateTick` pushes events; `FxLayer` consumes them. In online, server sends events over the wire; `FxLayer` consumes them. **One effect layer; one source of cosmetics.**
- **Cosmetics never accidentally mutate simulation.** Today there's a real risk of "the explosion particle's update() reaches into the entity pool." After the split, particles cannot influence simulation by construction.
- **Determinism stays clean.** Cosmetic randomness uses `Math.random()`; simulation randomness uses `state.rng.next()`. The two never cross.

### Step 4 — Single input capture point

Today: input is read inside `Player.update`, inside `Engine.update`, inside collision callbacks, etc. Tomorrow: one capture per frame.

```js
// js/input/input-capture.js
export class InputCapture {
  constructor(opts) { this.kbd = new Keyboard(); this.mouse = new Mouse(); this.gamepad = new Gamepad(); this.touch = new Touch() }
  capture()  { this.kbd.poll(); this.mouse.poll(); this.gamepad.poll(); this.touch.poll() }
  snapshot() {
    return {
      moveX:  clamp(this.kbd.axisX + this.gamepad.axisX, -1, 1),
      moveY:  clamp(this.kbd.axisY + this.gamepad.axisY, -1, 1),
      aimX:   this.mouse.worldX,
      aimY:   this.mouse.worldY,
      buttons: this._packButtons(),
    }
  }
  _packButtons() {
    return (this.mouse.down ? 1 : 0)
         | (this.kbd.power  ? 2 : 0)
         | (this.kbd.cycle  ? 4 : 0)
         | (this.kbd.revive ? 8 : 0)
  }
}
```

In solo mode, `engine.update(dt)` calls `input.capture(); const i = input.snapshot();` and passes `i` to `simulateTick`. In online mode, the same `i` is also encoded and sent over the wire (coalesced to 30Hz).

### Step 5 — Renderer reads `state`

The renderer should never know about the engine's internal pool. It iterates `state.ships`, `state.enemies`, `state.bullets`, `state.asteroids`, `state.drops`. Today some renderers already do this; some reach into engine pools. Audit and fix.

For the **online local ship**, the renderer reads from `predictor.localShipState` instead of `state.ships.get(myId)` — the predicted state diverges from the server snapshot intentionally, and the renderer needs to draw the predicted version.

For **online remote ships and other entities**, the renderer reads from `interpolator.sample(now)` which returns a lerped snapshot.

```js
// js/engine/engine.js  (render path)
render() {
  const renderState = this.mode === 'solo'
    ? this.state
    : this._buildOnlineRenderState()
  this.renderer.draw(renderState)
}

_buildOnlineRenderState() {
  const s = this.interpolator.sample(performance.now())
  s.ships.set(this.myId, this.predictor.localShipState)
  return s
}
```

`interpolator.sample` returns a *lightweight read view* — same shape as `GameState` but with positions lerped between two snapshots. Pooled to avoid per-frame allocation.

### Step 6 — Seed all RNG

Every `Math.random()` in `js/sim/` becomes `state.rng.next()`. Cosmetic `Math.random()` outside `js/sim/` is left alone.

```js
// js/sim/rng.js  -- mulberry32
export function makeRng(seed) {
  let a = seed | 0
  return {
    next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    rangeI(lo, hi) { return lo + Math.floor(this.next() * (hi - lo)) },
    range(lo, hi)  { return lo + this.next() * (hi - lo) },
  }
}
```

The shared `rng.js` is used identically on the server. Both sides walk the same PRNG state given the same seed and same input sequence — the basis for replay tests.

### Step 7 — Decouple render from sim tick

A clean fixed-step accumulator:

```js
// js/engine/loop.js
const TICK_MS = 1000 / 60

export class GameLoop {
  constructor(engine) { this.engine = engine; this.acc = 0; this.last = 0 }

  start() {
    const frame = (now) => {
      if (!this.last) this.last = now
      this.acc += now - this.last
      this.last = now
      let steps = 0
      while (this.acc >= TICK_MS && steps < 4) {
        this.engine.tick(TICK_MS / 1000)
        this.acc -= TICK_MS
        steps++
      }
      this.engine.render()
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
}
```

The simulation runs at exactly 60Hz logically. Rendering interpolates between sim ticks if it ever races ahead. Solo and online paths share this loop; the only difference is what `engine.tick()` does internally (run sim vs run prediction).

---

## Detailed plan: client networking layer

### `js/net/ws-client.js`

```js
import { encodeHello, encodeInput, encodePong, decode, S2C, WIRE_VERSION } from '../sim/protocol.js'

export class WsClient extends EventTarget {
  constructor(url, session) {
    super()
    this.url = url
    this.session = session              // null or stored UUID
    this.sock = null
    this.reconnectAttempt = 0
    this.serverTimeOffsetMs = 0
    this.outQueue = []                  // bursts of frames if not yet open
  }

  connect() {
    this.sock = new WebSocket(this.url)
    this.sock.binaryType = 'arraybuffer'
    this.sock.onopen    = () => this._onOpen()
    this.sock.onmessage = (e) => this._onMessage(new Uint8Array(e.data))
    this.sock.onclose   = (e) => this._onClose(e)
    this.sock.onerror   = () => { /* close handler will fire */ }
  }

  send(buf) {
    if (this.sock?.readyState === 1) this.sock.send(buf)
    else this.outQueue.push(buf)
  }

  sendInput(input) { this.send(encodeInput(input)) }

  _onOpen() {
    this.reconnectAttempt = 0
    this.send(encodeHello({ wireVersion: WIRE_VERSION, clientVersion: VERSION, displayName: nameFromStorage(), session: this.session }))
    while (this.outQueue.length) this.sock.send(this.outQueue.shift())
  }

  _onMessage(buf) {
    const tag = buf[0]
    const msg = decode(buf)
    switch (tag) {
      case S2C.WELCOME:     this.session = msg.session; saveSession(msg.session); this.dispatchEvent(new CustomEvent('welcome', { detail: msg })); break
      case S2C.ROOM_JOINED: this.dispatchEvent(new CustomEvent('room_joined', { detail: msg })); break
      case S2C.SNAPSHOT:    this.dispatchEvent(new CustomEvent('snapshot',    { detail: msg })); break
      case S2C.EVENT:       this.dispatchEvent(new CustomEvent('game_event',  { detail: msg })); break
      case S2C.PING:        this.send(encodePong(msg.client_t, msg.server_t)); break
      // ...
    }
  }

  _onClose(e) {
    this.dispatchEvent(new CustomEvent('disconnected', { detail: { code: e.code, reason: e.reason } }))
    if (e.code === 1002 /* version_mismatch */) return
    const delay = Math.min(16000, 1000 * 2 ** this.reconnectAttempt)
    this.reconnectAttempt++
    setTimeout(() => this.connect(), delay)
  }
}
```

Design notes:

- **EventTarget, not callbacks.** Multiple consumers (engine, HUD, lobby UI) listen for `welcome`/`room_joined`/`snapshot` events. Easier composition.
- **Session token in localStorage.** Survives tab reload; matches server grace window.
- **Exponential backoff.** Caps at 16s. 1002 close-code (version mismatch) is non-recoverable.
- **`outQueue`.** Lets callers send before the socket is open. Simplifies callers.
- **Server time offset.** Computed from ping/pong; used by the interpolator to align "now."

### `js/net/prediction.js`

The trickiest piece on the client.

```js
import { updateShipPure } from '../sim/ship.js'

const TICK_DT = 1 / 60

export class Predictor {
  constructor() {
    this.pending = []           // [{tick, input}, ...] for ticks we've predicted but server hasn't acked
    this.localShipState = null  // current rendered local-ship state
    this.lastAckedTick = 0
    this.tick = 0
  }

  setBaseline(serverShip, serverTick) {
    this.localShipState = clone(serverShip)
    this.lastAckedTick = serverTick
    this.tick = serverTick
    this.pending.length = 0
  }

  applyLocalInput(input) {
    this.tick++
    this.pending.push({ tick: this.tick, input })
    this.localShipState = updateShipPure(this.localShipState, input, TICK_DT)
  }

  onSnapshot(serverTick, serverShip) {
    while (this.pending.length && this.pending[0].tick <= serverTick) this.pending.shift()
    let s = clone(serverShip)
    for (const p of this.pending) s = updateShipPure(s, p.input, TICK_DT)
    this.localShipState = s
    this.lastAckedTick = serverTick
  }
}
```

Critical property: `updateShipPure` is the *same function* that the simulation tick uses for ships, that the server uses for ships. It is one function. The reconciliation guarantee — "predicted state converges to authoritative state when inputs match" — holds because there is one source of truth for ship physics. This is why we chose Node.

A subtle requirement: `updateShipPure(state, input, dt) → newState` must be a **pure** function. It cannot read from elsewhere in the world (no enemy positions, no global wind). For ship movement this is true today — the ship doesn't react to other entities for movement, only for collision. Movement and collision are separate steps; we predict movement, and the server is authoritative on collision (which is when reconciliation fires).

### `js/net/interpolation.js`

```js
const RENDER_DELAY_MS = 50

export class Interpolator {
  constructor() { this.snaps = [] /* {t, state} */ }

  ingest(serverT, state) {
    this.snaps.push({ t: serverT, state })
    while (this.snaps.length > 6) this.snaps.shift()
  }

  sample(nowServerT) {
    const renderT = nowServerT - RENDER_DELAY_MS
    if (this.snaps.length < 2) return this.snaps[this.snaps.length - 1]?.state
    let a = this.snaps[0], b = this.snaps[1]
    for (let i = 1; i < this.snaps.length; i++) {
      if (this.snaps[i].t >= renderT) { a = this.snaps[i - 1]; b = this.snaps[i]; break }
    }
    const u = clamp((renderT - a.t) / Math.max(1, b.t - a.t), 0, 1)
    return lerpState(a.state, b.state, u)
  }
}
```

`lerpState` produces a pooled read-only view. Does not allocate — fills a pre-allocated `RenderState` instance. Critical for GC pressure.

Render delay of ~50ms is the standard Quake-3 trick: the renderer always shows the world ~3 server snapshots in the past, so smooth interpolation is always possible. The cost is a fixed ~50ms latency to seeing other players' moves, which is invisible in PvE.

### `js/net/event-firehose.js`

```js
export class EventFirehose {
  constructor({ fxLayer, hud, audio }) { this.fx = fxLayer; this.hud = hud; this.audio = audio }
  ingest(ev) {
    // route to the same effect layer used by solo play
    this.fx.consume([ev])
    // additional online-only HUD work
    switch (ev.type) {
      case EVT.PEER_JOINED: this.hud.showJoinToast(ev.name, ev.slot); break
      case EVT.PEER_LEFT:   this.hud.showLeaveToast(ev.name, ev.reason); break
      case EVT.PLAYER_DOWNED: this.hud.flashDownedBanner(ev.player); break
      case EVT.PLAYER_REVIVED: this.hud.flashRevivedToast(ev.player, ev.by); break
    }
  }
}
```

The same `FxLayer` from the solo path consumes server events. Online-specific UI events layer on top.

### `js/net/matchmaking.js`

A thin client over `WsClient`.

```js
export class Matchmaking {
  constructor(ws) { this.ws = ws; this.rooms = [] }
  quickMatch()       { this.ws.send(encodeQuickMatch()) }
  browse()           { this.ws.send(encodeBrowse()) }
  create({ name, public: pub }) { this.ws.send(encodeCreateRoom(name, pub)) }
  join(roomId)       { this.ws.send(encodeJoinRoom(roomId)) }
  joinByCode(code)   { this.ws.send(encodeJoinByCode(code)) }
}
```

Title-screen UI calls these; `room_joined` event triggers transition into the in-game scene.

---

## Engine driver — mode-aware

The integration point. A single class with a `mode` field controls the whole machine.

```js
// js/engine/engine.js
import { simulateTick, GameState, makeRng } from '../sim/index.js'
import { Predictor } from '../net/prediction.js'
import { Interpolator } from '../net/interpolation.js'
import { EventFirehose } from '../net/event-firehose.js'

export class Engine {
  constructor({ mode, renderer, fx, audio, input, ws }) {
    this.mode = mode                    // 'solo' | 'online'
    this.renderer = renderer
    this.fx = fx
    this.audio = audio
    this.input = input
    this.ws = ws
    this.events = []
    this.state = null
    this.myId = null
    this.predictor = null
    this.interpolator = null
    this.firehose = null
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
    // 30Hz cadence: send every other 60Hz tick
    if ((this.predictor.tick & 1) === 0) this.ws.sendInput({ tick: this.predictor.tick, ...input })
  }

  _serverNow() {
    return performance.now() + this.ws.serverTimeOffsetMs
  }
}
```

The engine is small — most of the logic lives in `js/sim/` (shared) and `js/net/` (online-only). The engine's role is mode dispatch and orchestration.

---

## Solo mode preservation guarantees

A blocking requirement for shipping: **solo play must feel and benchmark identically to before**.

The refactor's structure makes this achievable:

- Solo runs the same `simulateTick` the server runs. Same physics, same RNG, same event stream.
- Solo's `FxLayer` is the same one online uses. Same particles, same sounds.
- The renderer reads from the same `GameState` it always did (just through a slightly different field path post-refactor).
- The `setTimeout`-based wave spawns become **simulation-driven timers** (`state.wave.spawnTimer -= dt; if (<=0) spawn()`). This is a one-time correctness win that helps both modes (no more drift between paused-tab and unpaused-tab in solo!).

**Verification gate** before networking work begins:

- All existing tests pass.
- Frame timing in benchmarks is within ±2% of pre-refactor.
- Manual playthroughs of waves 1, 5, 10, boss waves: visually indistinguishable from `master`.
- Replay mode: a fixed seed + recorded inputs produces a known final state hash. (New capability; gates regressions during the refactor.)

If these don't pass, we don't move to network work. The refactor is itself a deliverable that makes the codebase cleaner even if multiplayer slips.

---

## Co-op gameplay implementation

### Reviving downed players

A new input button (e.g. `E` or hold `F`). When the local ship is within radius `R` of a downed teammate and holds the button for 2 seconds, the simulation:

1. On each tick the local ship is in revive range and holding revive: increment `state.ships.get(target).reviveProgress += dt`.
2. When `reviveProgress >= 2.0`: clear `downed` flag, set `hp = 0.25 * maxHp`, emit `PLAYER_REVIVED` event, reset `reviveProgress = 0`.

The progress bar is HUD-only; the simulation just tracks the float. In online mode, the local client predicts the bar fill (so it feels responsive); the server is authoritative on the actual revive.

```js
// js/sim/ship.js  (excerpt)
export function updateShips(ships, inputs, dt, events) {
  for (const [id, ship] of ships) {
    if (ship.frozenInvulnerable) continue
    const input = inputs.get(id)
    if (ship.downed) {
      // drift; cannot move; no fire
      ship.x += ship.vx * dt
      ship.y += ship.vy * dt
      ship.vx *= 0.98; ship.vy *= 0.98
      // revive progress tracked by reviver-side update below
      continue
    }
    applyMovement(ship, input, dt)
    applyFiring(ship, input, dt, events)
  }
  // revive interactions
  for (const [reviverId, reviver] of ships) {
    if (reviver.downed || !inputs.get(reviverId)?.buttons & BTN_REVIVE) continue
    for (const [downedId, downed] of ships) {
      if (!downed.downed || dist2(reviver, downed) > REVIVE_R2) continue
      downed.reviveProgress = (downed.reviveProgress ?? 0) + dt
      if (downed.reviveProgress >= 2.0) {
        downed.downed = false
        downed.hp = downed.maxHp * 0.25
        downed.reviveProgress = 0
        events.push({ type: EVT.PLAYER_REVIVED, player: downedId, by: reviverId })
      }
    }
  }
}
```

### Per-player wave-clear powerup picks

Existing single-player flow: wave clears → modal opens → player picks → wave starts.

Multiplayer flow:

1. `WAVE_CLEAR` event received.
2. Each *local* player's powerup modal opens (only one local player per client in v1).
3. Player picks → client sends `POWERUP_CHOOSE` to server.
4. Server tracks which players have chosen; broadcasts `POWERUP_CHOSEN { player, powerup }` so other clients can show "P2 picked Triple Shot."
5. When all alive players have chosen (or grace-skipped), server emits `WAVE_START`.

Existing UI re-skinned with a "waiting for P2…" indicator after local pick.

### Drop attribution

Server-authoritative: orbs are visible to all; first ship to enter pickup radius collects. The simulation handles this in `updateDrops`:

```js
export function updateDrops(drops, ships, dt, events) {
  for (const drop of drops.alive()) {
    drop.lifetime -= dt
    if (drop.lifetime <= 0) { drop.alive = false; continue }
    drop.x += drop.vx * dt; drop.y += drop.vy * dt
    let collector = null, bestD = drop.pickupR2
    for (const [id, ship] of ships) {
      if (!ship.alive || ship.downed) continue
      const d = (ship.x - drop.x) ** 2 + (ship.y - drop.y) ** 2
      if (d < bestD) { bestD = d; collector = id }
    }
    if (collector) {
      ships.get(collector).gold += drop.value
      drop.alive = false
      events.push({ type: EVT.ORB_COLLECT, id: drop.id, by: collector, value: drop.value })
    }
  }
}
```

Same code, solo and online. Solo just happens to have one ship.

### Friendly fire off

```js
// js/sim/collision.js  (excerpt)
function bulletHitsShip(b, ship) {
  if (b.owner === ship.id) return false        // can't hit self
  if (b.ownerKind === 'player') return false   // friendly fire off
  // enemy bullets vs ships only
  return circlesOverlap(b, ship)
}
```

One line.

---

## UX changes

### Title screen multiplayer panel

```
┌────────────────────────────────────────┐
│              R A I N B O I D S         │
│                                        │
│           [  PLAY SOLO  ]              │
│                                        │
│           [  QUICK MATCH ]             │
│           [  BROWSE ROOMS ]            │
│           [  CREATE ROOM ]             │
│           [  JOIN BY CODE ]            │
│                                        │
│  v5.79.22  •  online: 27 in 9 rooms    │
└────────────────────────────────────────┘
```

The "online: …" line is a server-status fetch via `/health` JSON before WS connect; degrades gracefully if the server is offline.

### Lobby

Shown after Create Room or Join Code. Lists slot occupants, a "ready" toggle, and a Start button (room creator only) or "waiting for host" indicator. Closeable; closing transitions back to title.

### In-game peer HUD

Top-right corner: 1–3 mini-cards showing each peer's name, HP bar, gold, score, and a downed indicator. Same widget the existing HUD uses for the local ship, smaller.

### Reconnect toast

Existing toast component re-used. States: "reconnecting…" (pulsing yellow), "back" (green, 2s fade), "couldn't reconnect — return to title" (red, with button).

---

## Testing strategy (client side)

### Pure simulation tests

`js/sim/*.test.js` — same files run in both browser and Node CI. Examples:

- `ship.test.js` — `updateShipPure(state, {moveX: 1}, 0.016)` produces expected position delta. Run identically client-side.
- `collision.test.js` — bullet-vs-asteroid hit produces expected event sequence.
- `wave.test.js` — wave 1 schedule with seed 42 produces expected enemy spawn times.

### Engine integration tests

Use Playwright (existing). New scenarios:

- Solo: starts a run, plays 30s worth of recorded inputs, asserts state hash matches golden.
- Online (against in-process server): two headless browsers connect, quick-match, see each other in same room, both fire, both kills register on shared enemies.

### Replay-determinism test

`tools/replay.mjs` — load a recorded input log + seed; run `simulateTick` N times; compare final state hash against expected. Run on every CI green; pins simulation determinism across refactors.

---

## Migration plan (rolling out without breaking solo)

The refactor is the heaviest piece. Done wrong, it lands as a multi-thousand-line PR that breaks solo play in subtle ways and is impossible to bisect.

**Done right:** every step lands as a separate PR, each of which is solo-equivalent on its own.

Recommended sequence:

1. **PR 1**: Create `js/sim/` directory; move `state.js`, `rng.js`, `events.js` skeletons in. No engine changes yet. (Pure additions; non-breaking.)
2. **PR 2**: Migrate ship physics into `js/sim/ship.js`. Engine calls `updateShips(...)` instead of `Player.update`. Solo unchanged.
3. **PR 3**: Migrate enemies. Same shape.
4. **PR 4**: Migrate asteroids, bullets.
5. **PR 5**: Migrate collisions; events queue replaces inline particle/sound calls. `FxLayer` introduced. Solo unchanged.
6. **PR 6**: Migrate drops, waves. `setTimeout` spawns become tick-based.
7. **PR 7**: Renderer reads from `state` not from engine pools.
8. **PR 8**: Single input capture point. Engine driver shape.
9. **PR 9**: Replay determinism test added; gates further changes.
10. **PR 10**: `simulateTick` exists. Engine calls it. Solo plays through simulation as a black box.
11. **PR 11**: Server scaffolding (separate from client; covered in `NodeJS Server.md`).
12. **PR 12**: `js/net/ws-client.js`, `prediction.js`, `interpolation.js`. Online mode opt-in via debug flag.
13. **PR 13**: Title screen MP panel (UI only; no engine changes).
14. **PR 14**: End-to-end MP behind a feature flag.
15. **PR 15+**: Co-op design (revives, drop attribution, etc.), one PR each.
16. **PR final**: Feature flag flipped to default-on.

Each PR is small, reviewable, revertible. None of them break solo play.

---

## Risks specific to the engine refactor

Repeating the most important ones from `Multiplayer Planning – 2026-05-06.md` and adding Node-specific ones:

- **`game-engine.js` has years of accreted shortcuts.** Extracting clean pure functions will surface cases where simulation reaches into the renderer (e.g. an entity reads `canvas.width`). Each one needs to be teased out. Budget generously.
- **`setTimeout` wave spawns.** Replacing with tick-driven timers is a behavior change (waves no longer pause when the tab backgrounds). This is *correct*, but any wave-tuning that implicitly relied on the bug needs to be reviewed.
- **Pool ownership.** Today, the engine owns pools. After refactor, pools live inside `GameState`. Renderers that hold long-lived references to engine pools must be re-pointed.
- **JSDoc isn't enforced like TS.** It's possible to define a `Ship` JSDoc and then mutate a non-existent field somewhere; runtime will tolerate it. Mitigation: `tsc --noEmit` on the JSDoc'd files in CI.
- **Pure-function discipline drift.** Once code is "pure," the next contributor may add a `console.log` or a `Math.random()` and undo the property. Mitigation: ESLint rule restricting `Math.random` and `Date.now` inside `js/sim/`.

---

## What is explicitly not in this plan

- **Touch / mobile multiplayer UX.** Mobile solo is out of scope; multiplayer follows.
- **Spectator mode.** Out of scope.
- **In-game chat beyond simple text/emote pings.** Optional v1; default no.
- **Full TypeScript migration.** Adopt JSDoc-typed JS for v1; revisit later.
- **Server-side accounts, persistence, friend lists.** Out of scope.
- **Custom modes / modded waves.** Out of scope.
- **Cross-client replay sharing.** Replay is a debug tool only.
- **Mid-run rebalancing** (e.g. "if all players join late, rewind to wave 1"). Joiners adopt the run's current wave; their build catches up.

---

## Acceptance criteria for "engine refactor is complete"

Before any networking PR lands:

- [ ] `js/sim/` exists and exports a pure `simulateTick(state, inputs, dt, rng, events)`.
- [ ] No file under `js/sim/` imports from `js/render/`, `js/audio/`, `js/ui/`, or anything DOM-touching.
- [ ] No `Math.random()`, `performance.now()`, `Date.now()`, `setTimeout`, `setInterval` inside `js/sim/`.
- [ ] `js/sim/*.test.js` runs identically under Jest (browser CI) and `node --test` (server CI).
- [ ] Solo play: replay mode loads a fixed seed + input log, produces deterministic final state hash.
- [ ] Solo play: visual A/B against `master` shows no perceivable difference across waves 1, 5, 10, boss.
- [ ] Solo play: benchmark frame time within ±2% of `master`.
- [ ] All existing tests pass.

After all networking PRs land (per `NodeJS Server.md` acceptance):

- [ ] Two players can quick-match into a room and play wave 1 cooperatively.
- [ ] Server↔client sim disagreement is impossible by construction (sim modules are imported, not duplicated).
- [ ] Local-ship reconciliation snaps imperceptibly under typical latency.
- [ ] Remote-ship interpolation is smooth at typical 50ms render-delay.
- [ ] HUD, audio, particles, screen shake feel identical to solo for events that occur in both modes.

---

## Bottom line

The engine refactor is the load-bearing work. It is also the most valuable work in the entire multiplayer effort, because a clean simulation core makes everything downstream easier — *including* the parts of solo play that have been brittle for years (wave timers, paused-tab drift, ad-hoc randomness).

Networking glue layers on top of a clean core. Three new directories — `js/sim/`, `js/net/`, `js/engine/` — house the new code. The shape of the client doesn't dramatically change; the shape of the *boundaries* inside it does.

Choosing Node for the server multiplies the value of this refactor: the same `simulateTick` we write here runs unchanged in production on the server. We do not implement ship physics twice. We do not maintain two protocol codecs. We do not spend a month porting JS to Rust. We invest the saved time in feature work and polish.

Build the refactor first. The networking is straightforward once it's done.
