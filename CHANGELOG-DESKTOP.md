# Changelog — Rainboids Desktop

All notable changes to **Rainboids Desktop** (the Electron wrapper under
`electron/`) are documented here. Desktop versions independently of solo
and multiplayer; for solo see `CHANGELOG.md`, for MP see `CHANGELOG-MP.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Desktop stays in `0.x` while pre-1.0; promotes to `1.0.0` when the wrapper
is feature-complete (solo + MP + cached music + cross-platform installers).

## [0.4.0] - 2026-05-18

Phase 4 — Packaging. Adds electron-builder configuration so the desktop
app can ship as standalone, no-installer binaries on macOS / Windows /
Linux. Plus a GitHub Actions workflow that builds all three on native
runners and attaches the outputs to a GitHub Release on `desktop-v*`
tag push. Per `docs/Electron Desktop Port Plan – 2026-05-18.md`.

Minor bump (0.3.0 → 0.4.0) — the app can now be shipped, which is a
new capability even though no runtime behaviour changed.

### Added — electron-builder config in `electron/package.json`

- `appId`: `computer.cat.rainboids.desktop` (reverse-DNS of the public
  host).
- `productName`: `Rainboids` — drives the binary filename across
  platforms (`Rainboids.app`, `Rainboids.exe`, `Rainboids-*.AppImage`).
- `extraResources` copies the renderer files (`index.html`, `mp.html`,
  `js/`, `css/`, `sprites/`, `sfx/`, `favicon.png`) from the repo root
  into `resources/renderer/` in the packaged app. `js/mp/dev-mp-port.json`
  is filtered out — it's a dev-time artifact and would leak a stale
  loopback port into shipped builds.
- Per-platform targets — all standalone, no installers:
  - **macOS**: `zip` (drag the `.app` anywhere and double-click)
  - **Windows**: `portable` (single `.exe`) + `zip` (extract and run)
  - **Linux**: `AppImage` (`chmod +x && ./Rainboids-*.AppImage`)
- No code signing on the v1 release. macOS users get a Gatekeeper
  warning on first launch (right-click → Open to bypass); Windows
  users get a SmartScreen warning (More Info → Run Anyway). Signing
  is deferred until proper certificates are in place.

### Added — `electron/main.js` REPO_ROOT split

In dev (`npm run electron:dev`), `__dirname` is `<repo>/electron/`, so
`..` is the repo root and `app://rainboids/index.html` resolves to the
live source tree. In a packaged build, the renderer files live under
`process.resourcesPath + '/renderer/'` (placed there by
`extraResources`); `app.isPackaged` discriminates. The `app://`
protocol handler is otherwise unchanged — same path-traversal guard,
same `net.fetch(file://…)` body.

### Added — `.github/workflows/desktop-release.yml`

Three-runner matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`)
— each builds its native target. Steps per runner:

1. Checkout + Node 20 + Rust stable + wasm-pack
2. `npm run wasm:build` — produces `js/mp/wasm/` so `/mp` works in the
   shipped binary
3. `npm install` in `electron/`
4. `npm run build:<platform>` invokes electron-builder
5. Upload artifacts (`.zip`, `.exe`, `.AppImage`)

A final `release` job downloads all three sets of artifacts and attaches
them to a GitHub Release. Triggers on `desktop-v*` tag push (creates
Release) or manual `workflow_dispatch` (artifacts only). Prerelease
flag auto-set while the version is `0.x`.

### Added — root `package.json` build delegates

- `npm run electron:build:mac` / `:win` / `:linux` / `:all` — pass-throughs
  to the `electron/` subproject, mirroring the existing
  `electron:install` / `:dev` / `:start` pattern.

### Notes

- Default app icon is the stock Electron icon. The repo's `favicon.png`
  is 64×64 and too small for proper desktop icon sizes (mac wants 512×512+).
  Swap for a real icon at `electron/build/icon.png` (1024×1024 PNG)
  before a marketing-quality release.
- WASM bundling adds ~3 minutes per CI runner (Rust toolchain install +
  wasm-pack build). If MP turns out to be unnecessary in the shipped
  desktop binary, the WASM and Rust install steps can be removed and CI
  drops to ~2 minutes total.
- Wine is NOT required — neither for local dev (mac:zip + linux:AppImage
  build natively on macOS) nor for CI (each platform builds on its own
  runner).

## [0.3.0] - 2026-05-18

Phase 3 — Multiplayer wiring. Desktop builds can now connect to a
production MP WebSocket server. The renderer treats the URL as a
verbatim string sourced from the embedder, so the same JS runs unchanged
on the web (where it falls through to the existing discovery chain).
Per `docs/Electron Desktop Port Plan – 2026-05-18.md`. Minor bump
(0.2.0 → 0.3.0) — new shipping capability. Bridge commit — MP 0.4.3
gets the renderer-side priority-0 hook.

### Added

- `MP_WS_URL` constant in `electron/main.js`. Defaults to
  `wss://rainboids.cat.computer:8443/mp/ws` (matches the web build's
  current production fallback). Overridable per-launch with
  `RAINBOIDS_MP_WS_URL=wss://… npm run electron:dev`.
- Piped to the sandboxed preload via
  `webPreferences.additionalArguments: ['--rainboids-mp-ws-url=<URL>']`
  because sandboxed preloads can't read `process.env`. Preload parses
  the flag from `process.argv` and surfaces it on
  `window.rainboids.mpServerUrl`.
- Renderer hook in `js/mp/mp-ws.js → discoverDefaultUrl()` adds a
  priority-0 tier ahead of the existing URL-param / dev-port-discovery
  / hostname fallback chain. Returns the embedder URL verbatim — no
  proto/host/port munging — so the desktop wrapper has full control.
  See MP 0.4.3.

### Notes

- This change is the minimum needed to make MP work inside Electron at
  all. Without it, `window.location.hostname` resolves to `rainboids`
  (the `app://` host) and the renderer's existing fallback would
  produce `wss://rainboids:8443/mp/ws` — unconnectable.
- Default URL is a best-guess based on the public host and the
  renderer's existing fallback port. If production uses a different
  host or a reverse-proxied port (e.g., bare `:443`), override with
  the env var or a follow-up patch to `MP_WS_URL`.
- No server-side changes. Desktop clients are indistinguishable from
  browser clients on the wire.

## [0.2.0] - 2026-05-18

Phase 2 — Asset hygiene. Removes the desktop build's two runtime web
dependencies (Google Fonts CDN, music CDN at first play) so the app is
usable offline once tracks have been heard once. Per `docs/Electron
Desktop Port Plan – 2026-05-18.md`. Minor-version bump (0.1.0 → 0.2.0)
because both pieces add new shipping-blocking capabilities.

### Added — `music://` custom protocol with disk cache

`electron/main.js` registers a second privileged scheme, `music://`, and
its protocol handler does cache-or-fetch:

- Filename validated against `^[a-z0-9][a-z0-9._-]*\.mp3$` to stop path
  traversal at the URL layer.
- Cache hit → `net.fetch(file://…)` returns the cached mp3 with proper
  range-request support so the renderer's Audio element can seek freely.
- Cache miss → `net.fetch(https://rainboids.cat.computer/music/<file>)`,
  `.tee()` the body so the renderer plays the stream while a background
  pipeline writes to `<userData>/music-cache/<file>.partial`. On success,
  atomic rename to `<file>` — a half-written file is never mistaken for
  a valid cache hit.
- Renderer-side rewrite in `js/modules/audio/music-player.js`:
  `initializePlaylist()` checks `window.rainboids?.isDesktop` and, if
  desktop, rewrites each `PLAYLIST_DATA.path` from `music/<file>` to
  `music://rainboids/<file>`. Web build is unaffected.

### Added — Local Google Fonts

Bundled `Press Start 2P`, `Silkscreen`, `Fira Code`, and `Pixelify Sans`
woff2 latin subsets to `css/fonts/`, replacing the four CDN `<link>`
tags in `index.html` with `@font-face` rules in `css/styles.css`. Also
benefits the web build (no FOIT/FOUT, no CDN dependency). See solo
6.11.3 for the corresponding entry.

### Notes

- Music is fully functional in this phase. First play of each track
  fetches from `https://rainboids.cat.computer/music/<file>.mp3` and
  caches to `~/Library/Application Support/rainboids-desktop/music-cache/`
  on macOS (analogous paths on Win/Linux). Subsequent plays are offline.
- No cache eviction yet. The cache grows unbounded up to the full
  389 MB / 73-track playlist. LRU eviction with a configurable cap is a
  future polish task.
- MP still uses the WebSocket URL hardcoded in `js/net/ws-client.js`.
  Desktop-specific MP wiring lands in Phase 3.

## [0.1.0] - 2026-05-18

Phase 1 — Solo wrapper scaffold. Per `docs/Electron Desktop Port Plan –
2026-05-18.md`. The Electron main process now serves the existing JS app
over a custom `app://` protocol, opening a 1280×800 BrowserWindow pointed
at `app://rainboids/index.html`. Renderer code in `js/` runs unchanged.
Phase 2 (music streaming + local fonts) and Phase 3 (MP wiring) build on
this scaffold.

### Added

- New `electron/` top-level subproject with its own `package.json` and
  isolated `node_modules` so Electron's ~200 MB of native dependencies do
  not leak into the root install.
- `electron/main.js` — main process with `app://` custom-protocol handler
  registered via the modern `protocol.handle()` API. Maps
  `app://rainboids/<path>` to repo-root files, with path-traversal guard.
  Window is created with `contextIsolation: true`, `nodeIntegration:
  false`, `sandbox: true`.
- `electron/preload.js` — exposes a minimal `window.rainboids = {
  isDesktop: true, platform }` surface so the renderer can branch on
  desktop-vs-browser when needed.
- Root `package.json` scripts under a new `__ELECTRON__` section:
  `electron:install`, `electron:dev`, `electron:start`.

### Notes

- Electron 32.3.3 (latest stable at scaffold time).
- Music does not play in this phase — `playlist-data.js` references
  `music/<file>.mp3` which 404s under `app://` because the music
  directory is intentionally not bundled. The `music://` protocol with
  CDN streaming + disk cache lands in Phase 2; until then the game is
  fully playable with SFX only.
- Google Fonts still load from the CDN at runtime (online-only). Local
  font bundling is also Phase 2.
- No installer / no electron-builder yet. Run via `npm run electron:dev`
  from a development checkout. Packaging is Phase 4.
