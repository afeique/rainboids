# Electron Desktop Port Plan — 2026-05-18

Plan of record for shipping Rainboids as a native desktop app (macOS / Windows / Linux) by wrapping the existing browser build in Electron. This document captures the architecture, phased rollout, decisions already made, and the small set of open questions still to resolve before implementation begins.

---

## 1. Goals & non-goals

**Goals**
- Ship Rainboids as installable desktop binaries on macOS, Windows, and Linux.
- Reuse the existing JS app (`index.html`, `mp.html`, `js/`, `css/`, WebGL2 pipeline) without rewrite.
- Preserve cross-client multiplayer: desktop and browser clients play together on the same hosted MP server.
- Minimize installer size by streaming music from the web and caching to disk on demand.
- Track desktop versioning independently from solo and MP, following the existing CLAUDE.md product-versioning pattern.

**Non-goals (for this initial port)**
- A native (non-Electron) rewrite using Rust + wgpu. Possible future direction, not on this plan.
- A bundled local MP server. Desktop only connects to the hosted server; local hosting can be a future phase.
- A UDP transport for multiplayer. Desktop stays on WebSocket so it remains interoperable with browser clients. UDP can be revisited later as a parallel transport on the same server.
- Auto-updates. First release will be downloaded manually from GitHub Releases.
- Code signing / notarization. First builds ship unsigned with platform-specific install instructions.
- Steam / store distribution.

---

## 2. Performance reality check

Electron uses the same V8, Chromium, and WebGL2 pipeline as Chrome. The renderer is the bottleneck and it is identical. **Wrapping in Electron is not a performance play.** Expected wins are in variance and UX, not throughput:

| Area | Browser | Electron | Notes |
|---|---|---|---|
| Average FPS | Same | Same | Identical renderer |
| Frame time variance | Worse | Slightly better | No other tabs / extensions competing |
| GPU acceleration | May be disabled by driver heuristics | Forceable via Chromium flags | `--enable-gpu-rasterization`, `--ignore-gpu-blocklist` |
| Background throttling | rAF + timers throttled | Controllable per window | Useful only if you want unfocused updates |
| Fullscreen | Requires permission, escape-key prompt | `win.setFullScreen(true)` | True exclusive fullscreen |
| Disk I/O for assets | IndexedDB / Cache API | Direct via custom protocol | Relevant for music caching |
| `performance.now()` resolution | Reduced post-Spectre | Restorable via flags | Mainly profiling value |
| Cold start | Instant (browser already running) | Slower | ~1-2s baseline |
| Memory baseline | Shared with browser | ~150MB resident | Pure overhead |

**If real performance ever becomes the goal**, the path is a native Rust + wgpu rewrite of the renderer reusing the existing `server/sim/` crate. Electron is the wrong tool for that.

---

## 3. Architecture

### 3.1 Layout

A new top-level `electron/` directory keeps Electron-specific code and dependencies out of the root `package.json`. The renderer side reuses the existing app files in-place.

```
electron/
  package.json                 ← Electron + electron-builder deps only
  main.js                      ← main process entry
  preload.js                   ← contextBridge → window.rainboids
  protocol/
    app-protocol.js            ← app:// handler → repo files
    music-protocol.js          ← music:// handler → cache-or-fetch
  bridge/
    music-cache.js             ← disk cache lifecycle
  build/
    icon.icns
    icon.ico
    icon.png
    entitlements.mac.plist
```

### 3.2 Process model

- **Main process** owns: window lifecycle, custom protocol handlers (`app://`, `music://`), music cache directory in `app.getPath('userData')/music-cache/`, optional spawn of helper child processes (none in scope for v1).
- **Preload script** exposes a minimal API to the renderer via `contextBridge.exposeInMainWorld('rainboids', { ... })`. The renderer can branch on `window.rainboids?.isDesktop` to know it is in Electron.
- **Renderer process** loads `app://rainboids/index.html` or `app://rainboids/mp.html`. The existing JS runs unchanged.

### 3.3 Why a custom protocol instead of `file://`

ES modules over `file://` are fragile: Chromium enforces same-origin rules that break dynamic imports and `fetch()` of repo-relative paths. Setting `webSecurity: false` to work around it forfeits standard origin guarantees. A custom `app://` protocol registered via the modern `protocol.handle()` API gives the renderer a clean, consistent origin while serving files straight from disk.

### 3.4 Renderer-facing API surface (preload)

Kept intentionally small:

```js
window.rainboids = {
  isDesktop: true,
  version: '<desktop version>',
  // music cache is transparent to the renderer — handled by the music:// protocol
};
```

The renderer code does not need to know about caching. It references tracks as `music://<filename>.mp3` and the main process handles fetch + cache + serve.

---

## 4. Asset strategy

### 4.1 Fonts

`index.html` currently links four Google Fonts families from the CDN. Desktop must work offline at launch, so fonts move local:

1. Download woff2 for `Press Start 2P`, `Silkscreen`, `Fira Code`, `Pixelify Sans`.
2. Place in `css/fonts/`.
3. Replace `<link>` tags with `@font-face` rules in `css/styles.css`.
4. Web build benefits too (no CDN dependency, no FOIT/FOUT).

This is a non-desktop-specific improvement and can be done before the Electron work starts.

### 4.2 Music — stream and cache

Music is **389 MB across 73 tracks** — larger than Electron itself. Bundling is out. The chosen design: ship installer with no mp3s, stream on demand, cache to disk for offline replay.

**CDN**: `https://rainboids.cat.computer/music/<filename>.mp3` (GitHub Pages, served with `access-control-allow-origin: *` and `cache-control: max-age=600`). Directory listing returns 404 — files must be addressed by name. The set of known track filenames is the `path` field of each entry in `js/playlist-data.js` (auto-generated by `tools/scripts/generate-playlist.js`), where `path` is `"music/<filename>.mp3"`. The desktop client treats `playlist-data.js` as the authoritative manifest — anything not in it is not fetchable.

**Implementation**

1. Register `music://` custom protocol in main process via `protocol.handle()`.
2. Handler logic (pseudocode):
   ```
   on music://<filename>:
     cachePath = userData/music-cache/<filename>
     if exists(cachePath):
       return stream(cachePath)
     else:
       fetch https://rainboids.cat.computer/music/<filename>
       tee response → stream to renderer AND write to cachePath.partial
       on completion: rename .partial → final to avoid corrupt cache
       on failure: delete .partial, return 5xx to renderer
   ```
3. Renderer references tracks as `music://<filename>.mp3`. The existing audio loader changes only in URL construction: a single helper that rewrites the `path` field from each `PLAYLIST_DATA` entry — `music/<file>` → `music://<file>` — when `window.rainboids?.isDesktop`.
4. Cache management: simple LRU eviction with a configurable cap (default 1 GB), surfaced in settings later.
5. Graceful degradation: if both cache miss and fetch fail, the audio system silently continues with SFX only (game stays playable).
6. Optional Phase 2+: a "Download all tracks" settings action that walks `PLAYLIST_DATA` and pre-warms the cache, for users who want full offline.

### 4.3 Sprites and SFX

- `sprites/` (~2.6 MB) and `sfx/` (~23 MB) are small enough to bundle. They ship inside the installer and are served via the `app://` protocol like any other repo file.

---

## 5. Multiplayer integration

The MP server (`server/server-bin/`) is a tokio binary speaking WebSocket. Desktop clients connect to it exactly like browser clients do, using the existing `js/net/ws-client.js` flow.

**Implementation**

1. Add a config knob in the desktop build (env var or hardcoded) for the production WS URL — e.g., `wss://rainboids.example/ws`.
2. The MP page reads `window.rainboids?.mpServerUrl` if present, otherwise falls back to the current browser default.
3. No server-side changes required. Desktop clients are indistinguishable from browser clients on the wire.

**Cross-client compatibility**: Because desktop stays on WebSocket, browser and desktop players share the same matchmaking pool and the same rooms with zero protocol divergence. This was a deliberate choice over going UDP-first.

**Future**: A second transport (raw UDP) could be added to `server-bin/` later, with desktop opting in. Both transports would feed the same authoritative sim. Out of scope for this plan.

---

## 6. Packaging

**Tool**: electron-builder. Mature, cross-platform, handles installers + auto-update metadata + signing infra when we get there.

**Targets**

| Platform | Format | Notes |
|---|---|---|
| macOS | `dmg` + `zip` | Unsigned initially; Gatekeeper bypass instructions in README |
| Windows | `nsis` | Unsigned; SmartScreen warning expected on first run |
| Linux | `AppImage` + `deb` | Both formats; AppImage is portable, .deb integrates with apt |

**Build matrix (CI)**: GitHub Actions with three runners (`macos-latest`, `windows-latest`, `ubuntu-latest`), each building its native target. Outputs uploaded as workflow artifacts and attached to GitHub Releases on tag push.

**Local scripts** (in `electron/package.json`):

```
electron:dev          → electron . with live reload of repo files
electron:start        → electron .  (production-like)
electron:build:mac    → electron-builder --mac
electron:build:win    → electron-builder --win
electron:build:linux  → electron-builder --linux
electron:build:all    → electron-builder -mwl   (only useful on macOS, requires Wine for Win build)
```

Outputs land in `electron/dist/`. Added to `.gitignore`.

---

## 7. Versioning, changelog, README

Following the existing CLAUDE.md product-versioning rule, desktop is a third independent product:

- `VERSION-DESKTOP` at repo root, starting at `0.1.0`.
- `CHANGELOG-DESKTOP.md` in Keep a Changelog format.
- A new "Desktop changes" section in `CLAUDE.md` describing what triggers a desktop version bump (anything under `electron/`, or a solo/MP change that requires a desktop-shell update to ship).
- `README.md` gains a desktop install section and updated project structure.

Desktop versioning is decoupled from solo/MP because some shell-only changes (Electron upgrade, packaging tweaks, signing) should not require pretending the gameplay changed.

---

## 8. Testing

- Playwright already drives Chromium. Add a third project named `desktop` in `playwright.config.js` that uses `_electron.launch()` to spawn the packaged app.
- Smoke spec: window opens → title screen renders → start a wave → no console errors → close cleanly.
- Most existing QA specs should run against the Electron build with minor path adjustments (custom protocol URLs).
- Music protocol behavior: a dedicated test that confirms first-play fetches from CDN, second-play serves from cache, and offline mode falls through to silent-SFX-only state.

---

## 9. Open questions

1. **Window chrome and icon.** Default OS chrome is fine for v1, but a custom icon set is needed before shipping. Source: probably from `favicon.png` upscaled, or a new asset.
2. **First-run experience.** Should the desktop client show a brief "first launch — pick mode" splash, or jump straight into the existing title screen? Default plan: jump straight in, identical to the web.

**Resolved decisions**
- Music CDN: `https://rainboids.cat.computer/music/<filename>.mp3` — GitHub Pages, CORS-open, no directory listing required because `js/playlist-data.js` enumerates the set.
- Local MP hosting: deferred indefinitely; desktop only connects to the hosted server.
- Versioning: independent `VERSION-DESKTOP` + `CHANGELOG-DESKTOP.md`.
- Platforms: macOS + Windows + Linux from day one, unsigned.

---

## 10. Phase order and effort

| Phase | Scope | Effort |
|---|---|---|
| 1 | Solo wrapper: `electron/` dir, `app://` protocol, BrowserWindow loads `index.html`, plays a wave end-to-end | ~1 day |
| 2 | Asset hygiene: local Google Fonts, `music://` protocol with disk cache | ~half day |
| 3 | MP wiring: config-driven WS URL, desktop connects to hosted server | hours |
| 4 | Packaging: electron-builder configs for mac/win/linux, CI matrix, GitHub Releases | ~half day per platform debugging |
| 5 | Versioning + docs: `VERSION-DESKTOP`, `CHANGELOG-DESKTOP.md`, CLAUDE.md amendment, README update | ~hour |
| 6 | Testing: Playwright `desktop` project, music cache spec | ~half day |

Total realistic estimate: 3–5 working days for a shippable v1 across all three platforms, assuming no signing / notarization work and assuming the music CDN is already provisioned.

---

## 11. What this plan does not lock in

- The choice of electron-builder over electron-forge (open to reconsider during Phase 4 if forge's tooling becomes more compelling).
- The exact preload API surface (will grow as needed during Phase 1–3).
- Whether the `app://` protocol serves the repo root directly or a built/bundled subset (initially: repo root, for dev simplicity).

These are deliberately left soft — the principles above are the load-bearing decisions.
