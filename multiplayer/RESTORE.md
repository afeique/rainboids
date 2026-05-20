# Multiplayer — shelved archive

Multiplayer (`/mp`, the WASM-backed co-op product) was **shelved** on
2026-05-19 to focus on single-player. Everything needed to bring it
back lives in this `multiplayer/` directory. Nothing here is wired into
the running solo game.

Last shipped MP version: **0.12.1** (see `CHANGELOG-MP.md`). Last wire
protocol: `WIRE_VERSION = 9`.

## What's archived here

| Archived path | Original path | What it is |
|---|---|---|
| `multiplayer/js-mp/` | `js/mp/` | MP client (engine, renderer, input, particles, hud, ws, wire-codec, audio) |
| `multiplayer/mp.html` | `mp.html` | `/mp` entry page (3-canvas WebGL stack) |
| `multiplayer/server/` | `server/` | Rust workspace: `sim/` (deterministic sim), `server-bin/` (WS server), `client-wasm/` (wasm-bindgen) |
| `multiplayer/VERSION-MP` | `VERSION-MP` | MP version file |
| `multiplayer/CHANGELOG-MP.md` | `CHANGELOG-MP.md` | MP changelog |
| `multiplayer/tests/qa/12-mp-smoke.spec.js` | `tests/qa/12-mp-smoke.spec.js` | MP WASM smoke (Playwright) |
| `multiplayer/tests/qa/13-mp2-ws.spec.js` | `tests/qa/13-mp2-ws.spec.js` | MP two-tab WS smoke (Playwright) |
| `multiplayer/tests/e2e/multiplayer-mvd.spec.js` | `tests/e2e/multiplayer-mvd.spec.js` | Legacy MVD spec (already stale — missing helper) |

Regenerable build output was deleted, not archived: `server/target/`
(cargo) and `js/mp/wasm/` (wasm-pack). They rebuild from source.

## Shared code that stayed in solo (do NOT look for it here)

`js/modules/render/shapes.js` — the shared `drawAsteroidShape` /
`drawShipShape` / `drawEnemyShapeByType` helpers. Solo uses these now,
so they live in the solo tree. The archived MP renderer imports them
via a relative path that will need fixing on restore (see below).

## How to bring multiplayer back

1. **Move the source back to its original paths:**
   ```bash
   git mv multiplayer/js-mp js/mp
   git mv multiplayer/mp.html mp.html
   git mv multiplayer/server server
   git mv multiplayer/VERSION-MP VERSION-MP
   git mv multiplayer/CHANGELOG-MP.md CHANGELOG-MP.md
   git mv multiplayer/tests/qa/12-mp-smoke.spec.js tests/qa/12-mp-smoke.spec.js
   git mv multiplayer/tests/qa/13-mp2-ws.spec.js tests/qa/13-mp2-ws.spec.js
   git mv multiplayer/tests/e2e/multiplayer-mvd.spec.js tests/e2e/multiplayer-mvd.spec.js
   ```

2. **Title screen** — `js/modules/hud/overlays.js`: set `const _mpEnabled = true;`
   (search for "MULTIPLAYER shelved") to restore the title button.
   Optionally re-add the two-line SP/MP version tag (see the
   `## [6.27.1]` / git history of `overlays.js` for the prior block).

3. **Title nav** — `js/main.js`: re-add the `openMultiplayer()` handler
   (`window.location.href = '/mp'`), the `'multiplayer'` hit-test return
   in `hitId`, and the `'multiplayer'` cases in `onClick` / `onKey`.
   (search for "Multiplayer shelved" for the exact spots).

4. **Dev + build scripts** — `package.json`: restore
   ```json
   "dev": "concurrently -n http,cargo,wasm -c green,yellow,magenta \"npm:dev:sp\" \"npm:dev:mp\" \"npm:dev:wasm\"",
   "dev:mp": "cargo run --manifest-path server/Cargo.toml -p rainboids-server",
   "dev:wasm": "wasm-pack build server/client-wasm --target web --out-dir ../../js/mp/wasm --dev",
   "wasm:build": "wasm-pack build server/client-wasm --target web --out-dir ../../js/mp/wasm --release",
   "wasm:build:dev": "wasm-pack build server/client-wasm --target web --out-dir ../../js/mp/wasm --dev",
   ```
   While shelved, `dev` is the plain solo static server and the
   `dev:sp` / `dev:mp` / `dev:wasm` / `wasm:build*` scripts were removed
   — re-add them all when restoring.

5. **Playwright** — `playwright.config.js`: re-add the cargo `webServer`
   entry (the `:8443` `rainboids-server` block) alongside the
   http-server entry (it was removed; see git history of this file).

6. **Electron desktop wrapper** — `electron/package.json`: re-add the
   `extraResources` entry that packages `mp.html` into the build:
   ```json
   { "from": "../mp.html", "to": "renderer/mp.html" }
   ```
   (Removed while shelved because `mp.html` no longer existed at root and
   broke `electron:build`. The `js` extraResource's old
   `!mp/dev-mp-port.json` filter was dropped too — restore it only if you
   reintroduce that dev port file.)

7. **Rebuild WASM**: `npm run wasm:build:dev`, then `npm run dev`.

8. `js/modules/core/version.js` already keeps `VERSION_MP` exported, so
   the restored MP client can import it unchanged.

## Why it was shelved

Focus returned to single-player. MP reached Phase 4 step 6 (waves,
HP/death, drops, 4 base + 6 power weapons, all 10 enemy types + mines +
missiles, full solo-parity WebGL graphics) — a substantial vertical
slice — but is parked until co-op is prioritized again.
