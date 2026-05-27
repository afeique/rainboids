# Multiplayer WebTransport Migration — Plan – 2026-05-27

> **Status:** Proposal / planning. Nothing here is built yet. The previous
> multiplayer attempt is shelved under `multiplayer/` on `master` (see
> `multiplayer/RESTORE.md`), last shipped at MP `0.12.1`, `WIRE_VERSION = 9`.
>
> **Goal of this doc:** decide whether and how to bring multiplayer back using
> **WebTransport (over QUIC)** instead of WebSocket, and answer the specific
> questions raised: do we need an authoritative server sim, how does the sim
> work, does f64-everywhere fix the drift, how does the server work, and why we
> no longer need "parity."
>
> Written to be readable without a networking background. Each technical
> section opens with a **plain-language** paragraph.

---

## 0. The whole thing in one breath

We already have a Rust game simulation (the `sim` crate) that can run as a
**server** (native) and inside the **browser** (compiled to WebAssembly). The
last attempt connected them with **WebSockets** and tried to make the browser
copy of the sim match the server *exactly, bit-for-bit*. That exactness
requirement is what got painful and got it shelved.

The new plan does two things:

1. **Change the netcode philosophy** from "both sides run identical sims and must
   never disagree" to "**the server is the referee; the browser makes smart
   guesses and the server constantly corrects them.**" This removes the
   bit-for-bit requirement (no more "parity").

2. **Change the pipe** from WebSocket (TCP) to **WebTransport (QUIC/UDP)**, which
   lets us send game state as cheap "throwaway" packets where only the newest one
   matters — a much better fit for a real-time game, and a natural fit for the
   new netcode philosophy.

Most of the existing Rust code survives. The transport layer and the client-side
netcode are what we rewrite.

---

## 1. Where we are today (the shelved attempt)

What already exists in `multiplayer/` and is worth keeping:

| Piece | What it is | Keep? |
|---|---|---|
| `server/sim/` | The whole game as deterministic Rust: ships, 10 enemy types, bullets, asteroids, waves, power weapons, drops, collisions | **Keep — this is the crown jewel** |
| `server/server-bin/` | tokio + **axum WebSocket** server, room actor, tick loop | Keep the room/tick logic; **replace the WebSocket transport** |
| `server/client-wasm/` | `wasm-bindgen` wrapper that exposes `sim` to the browser | **Keep**, shrink its job (see §4) |
| `js-mp/mp-ws.js` | Browser-side **WebSocket** transport | **Replace** with a WebTransport version |
| `js-mp/wire-codec.js` | Encodes/decodes the binary messages | Keep, extend |
| `js-mp/mp-engine.js`, renderer, hud, input | Browser client glue | Keep, rewire to new netcode |

Three facts about the existing code that change the answers below — verified by
reading the source today:

- **The sim is already `f64` everywhere.** A search finds exactly one `f32` in
  the whole `sim/src`, and it's in dead legacy protocol code. So "switch to f64"
  is essentially **already done**.
- **There's already a custom deterministic math module** (`sim/src/trig.rs`):
  hand-written polynomial `sin`/`cos`/`atan2` using only `+ - * /`, *specifically
  because* the CPU's built-in `sin`/`cos` give slightly different answers on
  different machines/browsers. This was a hard-won lesson.
- **The old hand-written JavaScript copy of the sim is already gone.** Earlier
  (pre-2026-05-17) there were *two* sims — one in Rust, one hand-typed in JS — and
  making them agree (the dreaded "parity vectors", the PCG-64 RNG divergence) was
  the real swamp. The WASM pivot already deleted that swamp by compiling the *one*
  Rust sim to both targets. We are not going back into it.

**Why it was shelved (2026-05-19):** single-player took priority, and the
remaining MP work was the fiddly "make the browser's prediction agree with the
server under packet loss" wiring — which was hard *precisely because* the design
still leaned on near-perfect agreement. The new design makes that wiring easier.

---

## 2. The big idea, explained simply

Imagine a co-op game of 4 players shooting the same swarm of enemies.

**Option A — "everyone runs their own copy and we trust them to agree."**
Each player's browser simulates the whole battlefield. For this to work, every
browser must compute *exactly* the same thing down to the last decimal, forever,
or the players start seeing different enemy positions ("I clearly dodged that!").
This is called **deterministic lockstep**. It's powerful but brutal: one tiny
disagreement anywhere — a rounding difference, a random-number generator that
starts one step off — and the whole game silently desyncs. Making two independent
programs agree to the last bit is the "parity" problem, and it's where the last
attempt bled time.

**Option B — "one referee, everyone else guesses and gets corrected."**
A single **server** runs the real game. It's the referee: it alone decides where
every enemy is, who got hit, who died, what dropped. It mails out **snapshots**
("here's the true state of the world right now") many times a second. Each
player's browser:

- **Predicts** its *own* ship instantly when you press a key (so controls feel
  zero-lag), and
- **Interpolates** everything else — enemies, other players — smoothly between the
  snapshots it receives.

When a fresh snapshot arrives, the browser **reconciles**: "the referee says I'm
actually *here*; let me quietly correct my guess." Because corrections happen
constantly and the browser was guessing with the same math the server uses, the
corrections are tiny and invisible.

**We are choosing Option B.** Almost every modern online action game (Quake,
Counter-Strike, Overwatch, …) works this way. The crucial payoff: **the browser
no longer has to agree with the server perfectly — it just has to guess well and
accept corrections.** That single decision is what dissolves the parity problem.

---

## 3. "Do we need an authoritative server sim?" — Yes

**Plain terms:** Yes — and we already have one. Somebody has to be the referee.
In a co-op game where everyone shares the same enemies, if each browser decided
on its own where the enemies are and who died, the browsers would drift apart and
players would disagree about reality. A single authoritative server is the
referee that everyone trusts, so everyone sees the same fight.

More precisely, the server sim is responsible for:

- Spawning waves, moving all enemies/asteroids, firing enemy bullets.
- Applying each player's inputs to their ship.
- Resolving **all** collisions, damage, deaths, drops, score — the "truth."
- Sampling that truth into snapshots and broadcasting them.

The good news: **this is exactly what the `sim` crate already does**, and running
it on the server is unchanged by the move to WebTransport. WebTransport only
changes *how the snapshots travel*, not *who computes them*.

> The only alternative to an authoritative server is peer-to-peer lockstep
> (Option A — one player "hosts"). We're rejecting that: it re-introduces the
> exact bit-for-bit parity problem we're escaping, plus host-advantage and
> host-migration headaches. Authoritative server is the right call and the
> previous attempt already chose it.

---

## 4. How the sim works in the new model

**Plain terms:** The server runs the *whole* game. Your browser runs only a tiny
slice of it — just enough to predict your own ship so your controls feel instant.
Everything else your browser simply animates smoothly toward wherever the server
last said it was.

This is the most important architectural change, and it makes the WASM core's job
*much smaller and safer* than in the shelved attempt (which mirrored the entire
world in the browser).

```
        ┌─────────────────────────── SERVER (the referee) ───────────────────────────┐
        │  Full `sim` crate @ 30 ticks/sec                                            │
        │  • all players' ships   • all enemies   • asteroids   • bullets             │
        │  • collisions, damage, deaths, drops, waves, score  ← the single truth      │
        │  • every ~33–50 ms: sample state → broadcast a SNAPSHOT                     │
        └───────────────▲───────────────────────────────────────────────┬────────────┘
                        │ inputs (keys held)                  snapshots  │
                        │ as throwaway datagrams       as throwaway datagrams
        ┌───────────────┴───────────────────────────────────────────────▼────────────┐
        │  BROWSER (one per player)                                                    │
        │                                                                              │
        │  YOUR ship:        run the SAME sim (WASM) locally → instant response,       │
        │                    then RECONCILE to the server's snapshot when it arrives.  │
        │                                                                              │
        │  OTHER ships,      do NOT simulate. Just INTERPOLATE: smoothly slide each    │
        │  enemies,          object from its previous snapshot position to its newest  │
        │  asteroids,        one over the snapshot interval. (Optionally extrapolate   │
        │  bullets:          a little using the velocity in the snapshot.)             │
        └──────────────────────────────────────────────────────────────────────────────┘
```

What each layer does:

- **Server sim (native Rust):** unchanged from today — runs the full world at
  30 Hz. This is `sim` + the room/tick loop from `server-bin`.

- **Client WASM core (the shrunk job):** the same `sim` crate compiled to
  WebAssembly, but used **only** to predict *your own ship and your own bullets*.
  When you press thrust, the browser advances your ship one tick locally so the
  screen reacts on the next frame instead of waiting a network round-trip. It
  keeps a short history of "inputs I've sent but the server hasn't confirmed yet."

- **Reconciliation:** every snapshot carries `acked_input_tick` ("the last input
  of yours I applied"). The browser throws away its guessed position, snaps your
  ship to the server's authoritative position, then **re-applies** the handful of
  still-unconfirmed inputs on top. Net effect: your ship sits at the server's
  truth but feels instant. (This field already exists in the wire format — it was
  designed for exactly this.)

- **Interpolation (no sim needed):** enemies, asteroids, and other players are
  rendered by blending between the last two snapshots. This is cheap, robust, and
  immune to any math differences because the browser isn't *computing* those
  objects at all — it's just drawing where the server said they were.

**Consequence:** the browser's WASM sim only has to be a *good* predictor of your
own ship for ~3–6 ticks (~100–200 ms) before the next correction lands. It does
**not** have to reproduce the entire battlefield, and it does **not** have to
match the server forever. This is what makes the whole thing tractable.

---

## 5. "Can we fix the f32/f64 drift by using f64 everywhere in Rust?" — Mostly already done, and it now matters far less

**Plain terms:** Computers store decimal numbers in two common sizes: `f32`
(smaller, less precise) and `f64` (bigger, more precise). JavaScript only has
`f64`. If the server used `f32` and the browser used `f64`, their math would
slowly disagree. Using `f64` on both sides makes the basic math (`+ − × ÷`)
*identical*. We already do this. But `f64` alone doesn't make *everything*
identical, and — importantly — under the new "referee corrects you" design, it no
longer *has* to.

The honest, layered answer:

1. **Yes, and it's basically already true.** The sim is already `f64` throughout
   (one stray `f32` in dead code). JS `Number` is `f64`. WebAssembly's `f64` is
   strict IEEE-754. So `+ − × ÷` and comparisons give **bit-identical** results
   across server-native, server-as-WASM, and the surrounding JS. The old
   "cooldown drifts ~1 tick" symptom came from `f32` rounding in an early
   server-bin path; an all-`f64` sim doesn't have it.

2. **`f64` alone does *not* fix `sin`/`cos`/`sqrt`/`atan2`.** These "transcendental"
   functions are computed by each platform's own math library, and the answers
   can differ in the last bit between a server CPU and a browser. That's why
   `sim/src/trig.rs` exists — hand-written polynomial versions using only
   `+ − × ÷` so they're identical everywhere. **Keep using it; don't call the
   built-in `f64::sin` in sim code.** (Same care for any `sqrt` on a hot
   deterministic path — use a polynomial/Newton step or accept it's render-only.)

3. **The integer random-number generator (PCG-64) was a *separate* problem** and
   is **not** a float issue at all. It bit the old attempt because there were
   *two* implementations (Rust + hand-typed JS) that disagreed. With one Rust
   implementation compiled to both targets, it just works. No action needed beyond
   "don't hand-port it again."

4. **The point that changes everything:** under Option B, perfect determinism is
   an **optimization, not a correctness requirement.** Even if the browser's
   prediction drifted slightly from the server, the next snapshot corrects it.
   `f64`-everywhere + deterministic trig make the prediction *so close* that the
   corrections are sub-pixel and invisible — which is great — but a small drift is
   no longer a game-breaking desync. We get to keep the determinism work we
   already did as a *quality* win, without it being a *survival* requirement.

**Recommendation:** Keep `f64` everywhere (done). Keep `trig.rs` (done). Treat
determinism as "make prediction smooth," not "or the game explodes."

---

## 6. "Why don't we need parity anymore?"

**Plain terms:** "Parity" meant: *two completely separate programs (a Rust one and
a hand-written JavaScript one) must produce the exact same answer to the last
decimal, every tick, forever.* We don't need that anymore for **two** independent
reasons, either of which alone would be enough:

1. **There's only one program now, compiled twice.** We deleted the hand-written
   JavaScript sim back in the WASM pivot. The server and the browser run the *same*
   Rust `sim` crate — one as native code, one as WebAssembly. Two builds of one
   source agree by construction (the only wrinkle, transcendental math, is already
   handled by `trig.rs`). "Make two different programs match" was the hard problem;
   it no longer exists.

2. **The referee design means the browser doesn't *have* to match anyway.** Even if
   the browser's prediction were slightly off, the server's snapshots overwrite it
   continuously. The browser is allowed to be a little wrong between corrections.

So "parity vectors" stop being a **release gate** (a red test that blocks
shipping) and become at most a **prediction-quality metric** ("how big are the
reconciliation corrections? smaller = smoother"). The failing PCG-64 parity test
that haunted the coordination doc simply doesn't apply to the new architecture.

> Subtle but worth stating: we still want the *server's* sim to be deterministic
> **with respect to itself** — same seed + same inputs ⇒ same game — for
> reproducible bug reports, replays, and tests. That's easy and local (one
> machine, one build). The thing we're freed from is *cross-implementation,
> cross-machine* bit-equality.

---

## 7. WebTransport, concretely — and how we'll use its two "channels"

**Plain terms:** A WebSocket is like a single phone line where everything must
arrive in the exact order it was sent — if one word gets garbled, everyone waits
while it's repeated, even if newer words are already available. For a game sending
"here's the world right now" 20–30 times a second, waiting to re-hear an *old*
position is exactly wrong. WebTransport gives us two kinds of channels: a "postcard"
channel (send and forget; if one's lost, who cares, the next is already coming) and
a "registered mail" channel (guaranteed to arrive, in order) — and we pick the right
one per message.

WebTransport (which runs on QUIC, which runs on UDP) gives us:

- **Datagrams — unreliable, unordered, no waiting.** Perfect for data where *only
  the latest matters*:
  - **Server → client: snapshots.** If snapshot #100 is lost, we don't want it
    re-sent — #101 is already on the way and is newer. With WebSocket/TCP, losing
    #100 *delays #101, #102, …* until #100 is re-sent ("head-of-line blocking").
    Datagrams just skip it.
  - **Client → server: inputs.** Same logic — the newest "keys I'm holding" beats a
    stale one.

- **Reliable streams — guaranteed + ordered, independent of each other.** For data
  that *must* arrive exactly once:
  - The **handshake** (`Hello` → `Welcome`), room join/leave.
  - **Discrete events** that can't be missed: player downed, wave cleared, score
    commit, chat. (The wire already has an `Event` frame for these.)
  - Because QUIC streams are independent, a hiccup on the event stream does **not**
    stall snapshots (unlike everything sharing one TCP line).

**Channel plan:**

| Message | Direction | Channel | Why |
|---|---|---|---|
| `Hello` / `Welcome` | both | reliable stream | must arrive, exactly once, first |
| `Input` (keys held, client_tick) | C→S | **datagram** | newest wins; loss is harmless |
| `Snapshot` (world state @ tick) | S→C | **datagram** | newest wins; loss is harmless |
| `Event` (downed, wave, drops, deaths) | S→C | reliable stream | must not be missed |
| `PeerJoined` / `PeerLeft` | S→C | reliable stream | must not be missed |
| `Bye` / disconnect | both | reliable stream / close | clean teardown |

**Other QUIC perks we get for free:**

- **Connection migration:** a QUIC connection survives the phone switching from
  Wi-Fi to cellular without dropping. For a game with a strong mobile focus, this
  is a real, user-visible win — WebSocket would disconnect and force a rejoin.
- **Faster (re)connect:** QUIC folds the encryption handshake into the connection
  handshake (1 round-trip, 0 on resume), vs TCP+TLS+WS-upgrade.

---

## 8. How the server works

**Plain terms:** The server is a Rust program that holds the real game, ticks it
30 times a second, and mails snapshots to everyone in the room. Today it mails them
over WebSocket; we swap that mailing mechanism for WebTransport. The game logic in
the middle barely changes.

### 8.1 What stays the same
- The `sim` crate (the actual game).
- The **room actor** + **30 Hz tick loop**: collect inputs → `simulate_tick` →
  sample snapshot → broadcast. (Today in `server-bin/src/room.rs`.)
- The **binary wire codec** (`bincode`, `f64` scalars) in `sim/src/wire.rs` +
  `codec.rs`. We add no new *encoding*, just route messages onto datagram vs
  stream.

### 8.2 What changes — the transport swap
Replace the axum WebSocket endpoint with a QUIC/WebTransport endpoint:

- **Crate:** `axum` (`ws` feature) → **`wtransport`** (the maintained Rust
  WebTransport crate, built on **`quinn`** for QUIC). Keep a tiny `axum`/`hyper`
  HTTP listener if we still want a `/healthz` and the dev port-discovery file;
  the realtime traffic goes through `wtransport`.
- **Per-connection task** (today `connection.rs`): instead of
  `ws.split() → read/write binary frames`, it becomes:
  1. Accept the WebTransport session.
  2. Accept one **bidirectional stream** → read `Hello`, write `Welcome`,
     thereafter carry reliable `Event`/peer messages.
  3. Spawn a loop reading **datagrams** → decode `Input` → hand to room.
  4. Subscribe to the room's outbound queue → send `Snapshot`s as **datagrams**,
     `Event`s on the reliable stream.
- The `Hello`-timeout, wire-version check, join/leave logic all port over almost
  verbatim — only the read/write calls change shape.

### 8.3 TLS / certificates (new requirement)
WebTransport **requires** encryption — there is no plaintext `ws://localhost`
shortcut.
- **Production:** a real TLS certificate (Let's Encrypt) for the server's domain;
  QUIC served on **UDP/443** (or another UDP port we publish to the client).
- **Local dev:** generate a short-lived self-signed cert and pass its hash to the
  browser via the `serverCertificateHashes` option of `new WebTransport(...)`.
  Constraints to respect: ECDSA P-256 cert, validity ≤ 14 days. We'll script this
  in `npm run mp` so a fresh dev cert is generated on boot and its hash written to
  the dev-discovery file the client already fetches.

### 8.4 Deployment notes
- GitHub Pages (static) still **cannot** host the server — same as before. The
  server runs on a VPS/host. The shelved `server/deploy/` (Dockerfile, systemd
  unit) is a starting point; nginx WebSocket-proxying config is **dropped** —
  nginx's HTTP/3/WebTransport proxying is immature, so we terminate QUIC directly
  in the Rust process (open UDP/443 on the host firewall).
- **Caveat:** some restrictive networks block UDP. QUIC has TCP-ish fallback
  stories, but the clean answer for us is the **WebSocket fallback transport**
  (next section) for clients that can't do WebTransport at all.

---

## 9. The transport abstraction (and the Safari/UDP fallback)

**Plain terms:** Not every browser speaks WebTransport yet (Safari/iOS is the
question mark), and some office/coffee-shop networks block the UDP it rides on. So
we hide the "pipe" behind a small interface with two implementations: the fast
WebTransport pipe by default, and the old WebSocket pipe as a backup. The game code
above doesn't care which one is in use.

`mp-ws.js` is already described in its own header as "**pure transport — no game
logic**." We formalize that into an interface:

```
Transport (interface)
  connect(url) → Promise<ready>
  sendInput(bytes)         // hot path: datagram (WT) or frame (WS)
  sendReliable(bytes)      // stream (WT) or frame (WS)
  onSnapshot(cb) onEvent(cb) onPeer(cb) onError(cb)
  close()

  ├── WebTransportTransport   ← primary; datagrams + 1 reliable stream
  └── WebSocketTransport      ← fallback; the existing mp-ws.js, lightly adapted
```

Selection logic: `if ('WebTransport' in window) try WT, on failure fall back to
WS`. The server runs **both** listeners (a QUIC/WebTransport one and a WebSocket
one) during the transition; long-term we can drop WS if telemetry says nobody needs
it.

> **Open item to verify before committing effort:** current Safari/iOS WebTransport
> support. My knowledge is ~Jan 2026; this is the single biggest unknown. If
> iOS Safari can't do WebTransport and iOS is a target audience, the WS fallback
> isn't optional — it's load-bearing. (Easy to check live; flagged in §11.)

---

## 10. Migration phases (step by step)

Each phase is independently testable. Versioning resumes on `VERSION-MP` /
`CHANGELOG-MP.md` (MP stays in `0.x`); this planning doc itself is **not** a
version bump.

- **Phase A — Restore & green the existing build.**
  Follow `multiplayer/RESTORE.md` to move `multiplayer/*` back to `server/`,
  `js/mp/`, etc. Get the *existing WebSocket* MP building and running again
  (server ticks, two tabs see each other). This re-establishes a known-good
  baseline before we touch transport. *Exit:* two-tab WS smoke passes.

- **Phase B — Carve out the Transport interface.**
  Refactor `mp-ws.js` behind the `Transport` interface from §9 (still WebSocket
  underneath). No behavior change. *Exit:* MP still works, now through the
  interface.

- **Phase C — Server: add the WebTransport endpoint.**
  Add `wtransport`/`quinn` alongside the existing WS listener. Port
  `connection.rs` to a WebTransport session task (reliable stream for
  Hello/Welcome/Event, datagrams for Input/Snapshot). Dev cert scripting in
  `npm run mp`. *Exit:* a hand-written test client completes Hello→Welcome and
  receives snapshots over QUIC.

- **Phase D — Client: WebTransportTransport implementation.**
  Implement the WT side of the interface (`new WebTransport`, `.datagrams`,
  `.createBidirectionalStream`, `serverCertificateHashes` in dev). Feature-detect
  + fall back to WS. *Exit:* a tab connects over WebTransport and renders the
  authoritative snapshots.

- **Phase E — Netcode: commit to predict-and-reconcile.**
  This is the real work and the payoff.
  1. **Interpolation** for all non-local entities (enemies, asteroids, other
     ships): render between the last two snapshots. (Pure JS; no WASM needed.)
  2. **Local prediction** of your own ship via the WASM `sim`: advance locally on
     input, keep an unconfirmed-input ring buffer.
  3. **Reconciliation**: on each snapshot, snap your ship to authoritative state at
     `acked_input_tick`, replay unconfirmed inputs. Tune buffer/interp delay.
  *Exit:* movement feels instant; other entities are smooth; induced packet loss
  (drop X% of datagrams in a dev harness) degrades gracefully, no desync.

- **Phase F — Certs & deploy.**
  Real TLS on the host, UDP/443 open, `wtransport` terminating QUIC directly.
  Update `deploy/` (Dockerfile/systemd), drop the nginx WS-proxy config. *Exit:*
  two real devices on different networks play together over WebTransport.

- **Phase G — Resilience & tests.**
  Reconnect/heartbeat, connection-migration check (Wi-Fi↔cellular on mobile),
  Playwright smoke for both transports, a "prediction-quality" assertion (mean
  reconciliation correction below a pixel threshold under clean network).

---

## 11. Risks & open questions

1. **Safari / iOS WebTransport support** — *the* gating unknown. Verify before
   Phase C. If absent and iOS matters, the WS fallback (§9) is mandatory, not
   optional. **Mitigation already in plan:** transport interface + dual server
   listeners.
2. **UDP blocked on some networks** — datagrams won't traverse. Same mitigation
   (WS fallback). Telemetry later tells us how often it actually happens.
3. **Dev-cert friction** — `serverCertificateHashes` has rules (ECDSA P-256,
   ≤14-day validity). Mitigation: scripted in `npm run mp`; documented gotcha.
4. **`wtransport` crate maturity** — younger than `axum`'s WS. Mitigation: thin
   transport layer; the swap is contained to `connection.rs` + the new client
   transport; everything else (sim, room, codec) is insulated.
5. **Determinism on hot paths** — easy to accidentally call built-in `f64::sin` /
   `sqrt` in new sim code and reintroduce drift. Mitigation: lint/grep guard in CI
   that fails if sim code references the banned built-ins; keep using `trig.rs`.
   (Lower stakes now, since reconciliation forgives small drift — but free to keep.)

---

## 12. Net change vs the shelved attempt

| Dimension | Shelved attempt | This plan |
|---|---|---|
| Authoritative server | Yes | **Yes (unchanged)** |
| Browser's job | Mirror the *whole* world deterministically | **Predict only your own ship; interpolate the rest** |
| Determinism requirement | Hard requirement (desync = broken) | **Optimization for smooth prediction** |
| "Parity" (two impls must match) | Already eliminated by WASM pivot; tests still gated | **Not applicable; demoted to a quality metric** |
| Numeric type | `f64` (already) + deterministic `trig.rs` (already) | **Same — keep both** |
| Transport | WebSocket (TCP, head-of-line blocking) | **WebTransport (QUIC): datagrams + reliable streams** |
| Mobile network switch | Drops, must rejoin | **Connection migration survives it** |
| Fallback | n/a | **WebSocket fallback behind a transport interface** |
| Biggest risk | Cross-impl determinism | **Browser support (Safari/iOS) + UDP reachability** |

**Bottom line:** we keep the expensive, already-built parts (the Rust sim, f64,
deterministic trig, the room/tick loop, the binary codec), throw away the part that
hurt (the requirement that the browser match the server perfectly), and swap the
pipe for one whose "newest-wins, no waiting" datagrams are a natural fit for the
new design. The migration is mostly *transport + client netcode*, not a rewrite.
