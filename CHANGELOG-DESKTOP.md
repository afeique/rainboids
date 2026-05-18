# Changelog — Rainboids Desktop

All notable changes to **Rainboids Desktop** (the Electron wrapper under
`electron/`) are documented here. Desktop versions independently of solo
and multiplayer; for solo see `CHANGELOG.md`, for MP see `CHANGELOG-MP.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Desktop stays in `0.x` while pre-1.0; promotes to `1.0.0` when the wrapper
is feature-complete (solo + MP + cached music + cross-platform installers).

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
