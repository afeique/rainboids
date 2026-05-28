# Rainboids — Multiplayer Server (Node.js)

Authoritative, headless co-op multiplayer server. By **default** it runs the
**actual single-player simulation headless** (`src/sim/sp-host.js`, Path A) — the
real SP weapons, enemies, collisions, waves, tier bosses, drops, and co-op
downed+revive — so multiplayer plays and looks like single-player (one codebase,
no parity drift). The original lightweight toy sim (`../js/sim/`) is kept as a
selectable fallback via `MP_SIM=toy`. WebSocket transport today; a WebTransport
seam is stubbed for later (see `src/transport/` and `js/mp/net/`).

> This is the experimental MP product. It versions independently via the
> repo-root `VERSION-MP` / `CHANGELOG-MP.md`. The shelved Rust/WASM attempt under
> `../multiplayer/` is unrelated.

## Run locally

```bash
cd server && npm install      # installs `ws`
npm start                     # serves WS + /healthz on MP_PORT (default 8091)
```

Serve the browser client separately (static), from the repo root:

```bash
npm run dev                   # http-server on :8090
# open http://localhost:8090/mp.html
```

- Point the client at a non-default server: `/mp.html?server=host:port`
- Join a private room: `/mp.html?room=CODE` (blank → shared `public` room)
- Two tabs in the same room see each other; different codes are isolated.

Env:

| Var | Default | Meaning |
|-----|---------|---------|
| `MP_PORT` | `8091` | port for WebSocket + `GET /healthz` |
| `MP_SIM` | `sphost` | sim backend: `sphost` (real SP sim, default) or `toy`/`legacy` |

## Architecture

```
src/
  index.js              Hello → join → Input loop → leave; closes empty rooms
  room-manager.js       rooms keyed by join code (matchmaking); roomClassFor()
                        picks SpRoom (default) or the toy Room (MP_SIM=toy)
  sim/
    sp-host.js          DEFAULT: headless host for the REAL SP sim — N co-op
                        player slots, real entities/collisions/waves/bosses,
                        downed+revive, snapshot + EV.* event derivation
    browser-shim.js     minimal window/document/localStorage shim for Node
  sp-room.js            one SpRoom: 60 Hz tick → SpHost.frame() → Snapshot+Event
  room.js               LEGACY toy-sim Room (MP_SIM=toy fallback)
  transport/
    transport.js        the Transport seam (transport-agnostic above it)
    websocket.js        ws implementation + /healthz + ping heartbeat
    (webtransport.js)   DEFERRED Phase 8 — client stub lives in js/mp/net/
../js/modules/          the real SP game code SpHost binds + runs headless
../js/sim/              wire layer (protocol/codec/snapshot-delta) + the toy sim
```

Netcode: authoritative server; client predicts its own ship + interpolates
everything else from snapshots, reconciling against `lastInputTick`. Bullets are
snapshotted for now (a later pass can switch to spawn-event + client sim). The
client re-derives cosmetics (particles, sounds, banners) from the per-tick `EV.*`
event stream, so the wire stays lean while MP renders SP-identically.

## Deploy

The server needs a host (GitHub Pages is static and can't run it). WebSocket
rides plain TCP — **no UDP/QUIC needed** (that's only the deferred WebTransport
path).

- **Docker** — build from the repo root (the image bundles the server + shared sim):
  ```bash
  docker build -f server/Dockerfile -t rainboids-mp .
  docker run -p 8091:8091 rainboids-mp
  ```
- **systemd** — `deploy/rainboids-mp.service` (deploy the repo to `/opt/rainboids`).
- **TLS** — browsers on `https://` pages must use `wss://`. Terminate TLS at a
  reverse proxy and forward the upgrade; see `deploy/nginx.conf.example`.
- **Scale** — rooms are independent, so scale horizontally: run one process per
  core (a thin matchmaker can route room codes to processes/boxes). Object
  pooling in the sim keeps per-tick GC quiet.

## Tests

```bash
npm run test:unit   # (from repo root) sim/codec/room — js/sim + server/src
npm run test:qa     # two-client WebSocket e2e: tests/qa/12-mp2-ws.spec.js
```

The e2e covers connect/handshake, input propagation, asteroids, combat, enemy
waves, room isolation, and auto-reconnect after a server restart.
