# Changelog — Rainboids Desktop

All notable changes to **Rainboids Desktop** (the Electron wrapper under
`electron/`) are documented here. Desktop versions independently of solo
and multiplayer; for solo see `CHANGELOG.md`, for MP see `CHANGELOG-MP.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Desktop stays in `0.x` while pre-1.0; promotes to `1.0.0` when the wrapper
is feature-complete (solo + MP + cached music + cross-platform installers).

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
