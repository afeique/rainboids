These are plans for how to assign a unique SKU to every "build" (commit) of Rainboids. SKU stands for "Stock Keeping Unit."
# Rainboids — SKU Deployment Plan 

## Current Architecture

Rainboids is a Canvas 2D browser game built with **Vite** (dev server on port 8090, output to `dist/`). Key characteristics:

- **Rendering**: Canvas 2D API only (no WebGL dependency)
- **Audio**: 58 MP3 music tracks (~336MB total), SFX generated via sfxr.me CDN scripts
- **Typography**: 4 Google Fonts families loaded via CDN (Orbitron, Exo 2, Press Start 2P, Audiowide)
- **Storage**: localStorage for survival records and settings
- **Input**: Keyboard + mouse (desktop), partial touch controls (mobile) — see [Touch Controls](#mobile-touch-controls) section
- **Build**: `vite build` produces static files in `dist/`

## Deployment Blockers (Must Fix for All Offline SKUs)

### 1. sfxr.me CDN Dependency
The game loads sound effect scripts from `https://sfxr.me`:
```html
<script src="https://sfxr.me/riffwave.js"></script>
<script src="https://sfxr.me/sfxr.js"></script>
```
**Fix**: Download `riffwave.js` and `sfxr.js` locally into `js/vendor/` and update `index.html` to reference local copies. These are small JS files (~15KB combined).

### 2. Google Fonts CDN Dependency
Four font families loaded from Google Fonts CDN:
- Orbitron (HUD, titles)
- Exo 2 (body text)
- Press Start 2P (retro elements)
- Audiowide (display text)

**Fix**: Self-host fonts as WOFF2 files (~65-90KB total). Download from [google-webfonts-helper](https://gwfh.mranftl.com/), place in `assets/fonts/`, add `@font-face` declarations to CSS.

### 3. Music File Size (336MB)
The `music/` directory contains 58 MP3 tracks totaling ~336MB. This is the single largest deployment challenge:
- Exceeds iOS App Store OTA download limit (200MB)
- Makes PWA caching impractical (iOS Safari 50MB cache limit)
- Inflates all native app bundles significantly

**Mitigation options**:
- Re-encode tracks at lower bitrate (128kbps → ~170MB estimated)
- Use Opus/OGG for platforms that support it (30-50% smaller than MP3)
- Implement on-demand music downloading (download packs post-install)
- Ship a "lite" SKU with fewer tracks, offer music as DLC/expansion

---

## SKU Breakdown

### 1. Web (Current) — Ready Now
| Item | Status |
|------|--------|
| Build | `vite build` → `dist/` |
| Deploy | Any static host (Netlify, Vercel, GitHub Pages, S3) |
| Size | ~340MB (mostly music) |
| Changes needed | None (works today) |

**Notes**: Already fully functional. Host `dist/` on any static file server or CDN.

---

### 2. PWA (Progressive Web App) — Minor Work
| Item | Status |
|------|--------|
| Build | Vite + vite-plugin-pwa |
| Deploy | Same as web, with service worker |
| Size | ~340MB (cached assets) |
| Changes needed | Low |

**Required changes**:
- Add `vite-plugin-pwa` to generate service worker and manifest
- Create `manifest.json` with app name, icons, theme colors
- Generate app icons (192x192, 512x512 PNG)
- Vendor sfxr.me and Google Fonts (see blockers above)

**Limitations**:
- iOS Safari limits cache to ~50MB — music files won't cache reliably
- Best suited as "installable web app" on desktop Chrome/Edge
- On mobile, consider a "stream music" mode or reduced track list

---

### 3-5. Desktop Standalone — macOS, Windows, Linux (Tauri v2)
| Item | macOS | Windows | Linux |
|------|-------|---------|-------|
| Runtime | System WebKit | System WebView2 (Win 10+) | System WebKitGTK |
| App overhead | ~2.5-5MB | ~2.5-5MB | ~2.5-5MB |
| Distribution | DMG, .app, Mac App Store | MSI, NSIS, Microsoft Store | AppImage, .deb, .rpm |

**Use for non-Steam distribution:** itch.io, direct download, Mac App Store, Microsoft Store. For selling on Steam, use the Electron build (SKU #6) instead — Tauri lacks Steam overlay support and has no mature Steamworks JS integration.

**Required changes** (shared Tauri config across all 3 platforms):
- `npm install -D @tauri-apps/cli@^2` + `npx tauri init`
- Vendor sfxr.me scripts and Google Fonts locally
- Configure `tauri.conf.json`: window size, title, app identifier
- Music files bundled as Tauri resources

**Prerequisites**: Rust toolchain (`rustup`), Xcode Command Line Tools (macOS)

**Pros**: Smallest binary overhead (~3MB vs ~100MB for Electron), native OS integration
**Cons**: No Steam overlay, system WebView rendering may differ from Chrome — test Canvas 2D fidelity on each platform. Linux WebKitGTK not bundled by Steam Runtime.

---

### 6. Steam (Electron) — Recommended for Desktop Sales
| Item | Status |
|------|--------|
| Framework | [Electron](https://www.electronjs.org/) (v41+) + [steamworks.js](https://github.com/ceifa/steamworks.js) |
| Runtime | Bundled Chromium |
| App overhead | 80-150MB |
| Total size | ~420-490MB |
| Distribution | Steam (Win/Mac/Linux), Steam Deck |

**Why Electron over Tauri for Steam:**
- **Steam Overlay does not work with Tauri/WebView2** — confirmed in [tauri-apps/tauri#6196](https://github.com/tauri-apps/tauri/issues/6196). The overlay requires a D3D device in the app process, which WebView2 doesn't create.
- **steamworks.js** (`npm install steamworks.js`) provides mature JS bindings for the Steamworks SDK — achievements, cloud saves, leaderboards, friends, rich presence. It requires Node.js native modules, which Tauri doesn't support.
- **No proven Tauri Steamworks integration** — `tauri-plugin-hal-steamworks` (v0.0.4) is experimental; you'd need to write Rust backend commands and invoke via Tauri IPC.
- **Linux/Steam Deck** — Tauri relies on system WebKitGTK, which is NOT bundled by Steam's Linux Runtime. Electron bundles Chromium, so it works out of the box.

**Steamworks account setup:**
- Register at [partner.steamgames.com](https://partner.steamgames.com) (requires $5+ spent on Steam, 2FA)
- $100 USD per game (non-refundable until $1,000+ revenue, then recoupable)
- Tax info (W-9 or W-8BEN), banking details, Steam Distribution Agreement
- Review process: 2-5 business days for store page + build

**Revenue split:** 70/30 (developer/Valve). Drops to 75/25 after $10M, 80/20 after $50M.

**Required changes:**
- `npm install -D electron electron-builder steamworks.js`
- Create `electron-main.js` (BrowserWindow loading `dist/index.html`, `contextIsolation: false`, `nodeIntegration: true` for steamworks.js)
- Vendor CDN dependencies
- Configure `electron-builder` in `package.json` for Win/Mac/Linux targets
- Integrate steamworks.js for:
  - **Achievements** — define in Steamworks App Admin, call `steamworks.achievement.activate("ACH_NAME")`
  - **Cloud saves** — configure sync directories in App Admin; write localStorage data to a file that Steam syncs
  - **Leaderboards** — create in App Admin, read/write scores via the API
  - **Rich presence** — show current wave, score in friends list

**Steam store page requirements:**
- 5+ gameplay screenshots (1920x1080, 16:9, no concept art)
- 1+ trailer (up to 1920x1080, 30/60fps)
- Header capsule (460x215), small capsule (231x87), large capsule (467x181), hero graphic (3840x1240), logo (1280x720)
- Content rating via Steam's own questionnaire (free)
- Detailed game description with rich formatting

**Build upload (SteamPipe):**
1. Download Steamworks SDK, use `ContentBuilder` tools
2. Create depot build VDF scripts describing app structure
3. Upload via `steamcmd.exe +login <name> <password> +run_app_build script.vdf +quit`
4. Set builds live on branches (default, beta, testing) from Steamworks App Admin
5. Automatable with CI/CD (GitHub Actions)

**Steam Deck compatibility:**
- Runs via Proton (Wine-based) for Windows builds, or as native Linux build
- Steam Input API translates Deck controls into keyboard/mouse input — Rainboids works out of the box
- For proper gamepad glyphs, implement the Gamepad API (`navigator.getGamepads()`)
- Known issue: Electron >26.6.10 has broken gamepad detection through Proton — use Electron 26.x or ship native Linux build

**DRM/Anti-cheat:** Not required. Steam provides optional lightweight DRM stub; most indie games skip it.

**Notable web-tech games on Steam:** CrossCode (NW.js, 500K+ sales), Game Dev Tycoon (HTML5/NW.js), Moonstone Island (Construct/WebView), 5,700+ RPG Maker MV/MZ games (NW.js).

---

### 6b. Desktop Standalone (Tauri v2) — Non-Steam Distribution
| Item | Status |
|------|--------|
| Framework | [Tauri v2](https://v2.tauri.app/) |
| Runtime | System WebView |
| App overhead | ~2.5-5MB |
| Total size | ~340-345MB |
| Distribution | Direct download, itch.io, Mac App Store, Microsoft Store |

**When to use Tauri instead of Electron:**
- Direct distribution (not Steam) where overlay/Steamworks integration isn't needed
- itch.io, Mac App Store, Microsoft Store, or self-hosted downloads
- When minimal binary size matters
- Windows 7/8 is NOT a target (WebView2 requires Windows 10+)

**Required changes:**
- `npm install -D @tauri-apps/cli@^2` + `npx tauri init`
- Vendor CDN dependencies
- Configure `tauri.conf.json`: window size, title, app identifier

**Cons**: No Steam overlay, no proven Steamworks integration, system WebView rendering may differ from Chrome

---

### 7. Android (Capacitor 8)
| Item | Status |
|------|--------|
| Framework | [Capacitor](https://capacitorjs.com/) v8 |
| Runtime | Android WebView (Chrome-based) |
| App overhead | ~5-10MB |
| Total size | ~345-350MB (APK/AAB) |
| Distribution | Google Play Store, APK sideload |

**Required changes**:
- `npm install @capacitor/core @capacitor/cli`
- `npx cap init` + `npx cap add android`
- Vendor sfxr.me and Google Fonts
- Touch controls need significant upgrade — see [Touch Controls](#mobile-touch-controls) section
- Music: consider AAB + Play Asset Delivery for files >150MB
- Handle Android back button (pause/menu)
- Test on Android 8+ (API 26+, WebView is Chrome-based)

**Google Play considerations**:
- APK size limit: 150MB (use AAB + asset packs for music)
- AAB with Play Asset Delivery: up to 2GB
- Content rating: likely "Everyone" or "Everyone 10+"

**Notes**: Basic touch input exists but needs the full dual-stick + ability button overhaul detailed in the [Touch Controls](#mobile-touch-controls) section before mobile SKUs are viable.

---

### 8. iOS (Capacitor 8)
| Item | Status |
|------|--------|
| Framework | Capacitor v8 |
| Runtime | WKWebView (Safari/WebKit) |
| App overhead | ~5-10MB |
| Total size | ~345-350MB |
| Distribution | App Store, TestFlight |

**Required changes**:
- Same Capacitor setup as Android + `npx cap add ios`
- Vendor all CDN dependencies
- Touch controls need significant upgrade — see [Touch Controls](#mobile-touch-controls) section
- Handle iOS safe areas (notch, home indicator) — may need CSS adjustments
- Audio: iOS requires user gesture to start AudioContext — verify first-tap handling
- Add launch storyboard and app icons (required for App Store)

**App Store considerations**:
- OTA download limit: 200MB (users on cellular won't auto-download larger apps)
- Total size limit: 4GB, but keep under 200MB if possible
- Consider On Demand Resources for music tracks
- Requires Apple Developer account ($99/year)
- Requires Xcode on macOS for building

**iOS-specific risks**:
- WKWebView performance with Canvas 2D — generally good but test particle-heavy scenes
- iOS audio restrictions (auto-play blocked until user interaction)
- Memory pressure on older devices (iPhone 8, SE) with 336MB of music loaded

---

### 9. Xbox One / Xbox Series X|S (UWP + WebView2)
| Item | Status |
|------|--------|
| Framework | UWP app with WebView2 (Chromium-based) |
| Runtime | Xbox WebView2 |
| App overhead | ~10-20MB |
| Total size | ~350-360MB |
| Distribution | Microsoft Store / ID@Xbox |

Xbox is the **most viable console target** for web-tech games. Xbox runs a Windows-based OS and officially supports WebView2 in UWP apps.

**Technical path:**
- Package Rainboids as a UWP app using WebView2
- Canvas 2D rendering, Web Audio, and localStorage all work in WebView2
- The Gamepad API (`navigator.getGamepads()`) works in WebView2/Chromium — Xbox controllers map natively
- WebView2 on Xbox is only supported via UWP (NOT the GDK)

**ID@Xbox program:**
- Apply at [xbox.com/developers/id](https://www.xbox.com/en-US/developers/id)
- Free program for indie developers
- Provides 2 free dev kits, documentation, and publishing support
- Revenue split: 70/30 (developer/Microsoft)

**Required changes:**
- Package as UWP app with WebView2
- Vendor all CDN dependencies
- Implement full gamepad controls (see [Gamepad Input](#gamepad-input) section)
- Xbox button prompt icons (A/B/X/Y)
- Handle Xbox Quick Resume (suspend/resume state management)
- Integrate Xbox Live APIs for achievements and leaderboards
- Content rating via IARC (free questionnaire — Microsoft Store participates)

**Xbox certification (XR — Xbox Requirements):**
- Must pass Xbox certification checklist (under NDA, available after ID@Xbox approval)
- Common failure points: suspend/resume handling, Quick Resume, button prompts, accessibility
- Resubmission delay: 2-4 weeks per rejection

**Risks:**
- WebView2 on Xbox is still maturing — Construct 3 developers have reported blank screens and compatibility bugs
- UWP apps are "community-supported only" — Microsoft's managed programs prefer Win32 + GDK
- Canvas 2D performance on Xbox One S (weakest target) needs testing

**Precedent:** Microsoft MakeCode Arcade Kiosk runs as a WebView2 app on Xbox. No major commercial web-wrapped game has shipped on Xbox Store yet, but the technical path is officially supported.

**Feasibility: MODERATE.** Estimated effort: 2-4 months. Cost: $5K-$20K if done in-house.

---

### 10. Nintendo Switch / Switch 2
| Item | Status |
|------|--------|
| Framework | Native port required (no web runtime available) |
| Runtime | N/A |
| Distribution | Nintendo eShop |

**There is no way to ship an Electron/Tauri/WebView app on Nintendo Switch.** The Switch has no user-accessible browser, no WebView runtime, and no HTML5 game framework equivalent to the discontinued Wii U "Nintendo Web Framework."

**Developer program:**
- Register free at [developer.nintendo.com](https://developer.nintendo.com)
- After concept approval, request a dev kit (~$450 subsidized for OLED)
- All development docs, SDKs, and specs are under strict NDA
- Switch 2: dev kits are available but Nintendo is actively filtering out low-quality titles

**Possible paths (all require significant rewrite):**
1. **Defold Engine** — free, open-source engine that supports both HTML5 export AND native Switch export. Would require porting Rainboids' game logic into Defold's framework. The Canvas 2D rendering, input handling, and game loop would all need rewriting.
2. **Custom C++ port** — rewrite rendering in C++/NVN (Switch's proprietary API, similar to Vulkan/OpenGL). Game logic could run via an embedded JS engine (QuickJS, V8), but this is non-trivial.
3. **Hire a porting house** — companies like Abstraction Games, BlitWorks, or Deck13 specialize in console ports. CrossCode (originally NW.js) was ported to Switch natively by Deck13/RadicalFish.

**Cost estimate:** $30K-$100K+ for a professional port, 3-6+ months timeline.

**Feasibility: LOW.** Only pursue if Steam/mobile revenue justifies the investment.

---

### 11. PlayStation 5
| Item | Status |
|------|--------|
| Framework | Native port required (no web runtime available) |
| Runtime | N/A |
| Distribution | PlayStation Store |

**PS5 has no user-accessible browser, no WebView API for games, and no Electron/Tauri runtime.** Sony has stated they do not intend to add a web browser to PS5. The internal WebKit engine (used for system UI) is not exposed to developers.

**PlayStation Partners program:**
- Register at [partners.playstation.com](https://partners.playstation.com)
- Requires proven development experience (shipped titles preferred), solid prototype, financial resources
- Sony provides 1 free PS5 dev kit + 1 test kit after approval (must return within 2 years)
- Applications evaluated individually based on team experience and project viability

**Possible paths:** Same as Switch — Defold, custom C++ port, or porting house. No web-technology game has ever shipped on PlayStation in web-wrapped form.

**PlayStation certification (TRC — Technical Requirements Checklist):**
- Must pass Sony's checklist (under NDA)
- Trophy integration mandatory
- Resubmission delay: 2-4 weeks per rejection

**Content rating:** ESRB/PEGI required. PlayStation Store participates in IARC (free questionnaire for digital-only releases).

**Cost estimate:** $50K-$150K+ for a professional port, 4-8+ months timeline.

**Feasibility: VERY LOW.** Sony's program is more selective than Nintendo's, and the same full native rewrite is required.

---

### <a name="gamepad-input"></a>Gamepad Input (Required for Steam Deck, Xbox, Desktop Controllers)

Rainboids currently has no gamepad support. This is required for Steam Deck, Xbox, and is strongly recommended for all desktop SKUs.

**Implementation approach:**
- Use the standard Gamepad API (`navigator.getGamepads()`) — works in Electron, WebView2, and all modern browsers
- Steam Input API handles controller translation at the OS level, so basic Gamepad API support covers Steam Deck, Xbox, PlayStation, Switch Pro, and generic controllers

**Recommended mapping:**

| Gamepad input | Game action |
|---------------|-------------|
| Left stick | Movement (replaces WASD) |
| Right stick | Aim direction (replaces mouse) |
| Right trigger (R2) | Fire primary weapon |
| Left trigger (L2) | Fire power weapon |
| A / Cross | Confirm (menus), interact |
| B / Circle | Cancel, pause |
| X / Square | Skill 1 |
| Y / Triangle | Skill 2 |
| L1 / R1 | Cycle primary / power weapons |
| D-pad up/down | Navigate shop items |
| D-pad left/right | Switch shop tabs |
| Start | Pause |
| Select / Back | Open shop (during wave transition) |

**Platform-specific button prompts:**
- Xbox: A/B/X/Y letter glyphs
- PlayStation: Cross/Circle/Square/Triangle shape glyphs
- Nintendo: B/A/Y/X (swapped layout)
- Steam Deck: follows Xbox layout by default
- Detect active controller type via `gamepad.id` string and show correct icons

**Dead zone handling:**
- Radial dead zone of 15% on both sticks (prevents drift)
- Aim stick: convert angle to world-space aim coordinates, same as the mobile aim joystick

**Implementation location:** Add a `GamepadHandler` class in `js/modules/input-handler.js` that polls `navigator.getGamepads()` each frame and maps to the existing `input.*` properties.

---

## Content Rating Summary

| Board | Region | Digital cost | Process |
|-------|--------|-------------|---------|
| Steam | Global | Free | Steam's own content questionnaire |
| IARC | Global (PSN, Xbox, Google Play, Nintendo eShop) | Free | Single online questionnaire → ESRB, PEGI, USK, GRAC ratings simultaneously |
| ESRB | North America | Free via IARC | Automatic for digital storefronts that participate |
| PEGI | Europe | Free via IARC | Automatic for digital storefronts that participate |
| Apple App Store | Global | Free | Apple's own age rating questionnaire |

For digital-only distribution on major storefronts, content rating is **free** — either the store uses its own system (Steam, Apple) or participates in IARC (PlayStation, Xbox, Nintendo, Google Play).

---

## Recommended Implementation Order

| Priority | SKU | Effort | Cost | Reasoning |
|----------|-----|--------|------|-----------|
| 1 | **Web (optimize)** | Low | $0 | Vendor CDN deps — benefits all other SKUs |
| 2 | **PWA** | Low | $0 | Minimal work on top of web, instant "install" on desktop |
| 3 | **Steam (Electron)** | Medium | $100 fee | Largest PC gaming marketplace; proven web-game path; includes Steam Deck |
| 4 | **Desktop standalone (Tauri)** | Medium | $0 | itch.io, direct download, Mac App Store — shares Vite build |
| 5 | **Android (Capacitor)** | Medium-High | $25 (Play) | Requires dual-stick touch controls first |
| 6 | **iOS (Capacitor)** | Medium-High | $99/yr (Apple) | Requires dual-stick touch controls first |
| 7 | **Xbox (UWP/WebView2)** | High | $0 (ID@Xbox) | Only console viable without native port; WebView2 path is official but immature |
| 8 | **Switch (native port)** | Very High | $30K-$100K+ | Only if revenue justifies; requires full native rewrite or porting house |
| 9 | **PS5 (native port)** | Very High | $50K-$150K+ | Most selective program; same native rewrite required |

## Proposed npm Scripts

```jsonc
{
  "scripts": {
    // Existing
    "dev": "vite --host",
    "build": "vite build",
    "preview": "vite preview",

    // Steam / Electron
    "electron:dev": "vite build && electron .",
    "electron:build": "vite build && electron-builder",
    "electron:build:mac": "vite build && electron-builder --mac",
    "electron:build:win": "vite build && electron-builder --win",
    "electron:build:linux": "vite build && electron-builder --linux",
    "steam:upload": "steamcmd +login $STEAM_USER +run_app_build steam/app_build.vdf +quit",

    // Desktop standalone (Tauri)
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:build:mac": "tauri build --target universal-apple-darwin",
    "tauri:build:win": "tauri build --target x86_64-pc-windows-msvc",
    "tauri:build:linux": "tauri build --target x86_64-unknown-linux-gnu",

    // Mobile (Capacitor)
    "cap:sync": "cap sync",
    "cap:android": "cap open android",
    "cap:ios": "cap open ios",
    "cap:build:android": "vite build && cap sync android",
    "cap:build:ios": "vite build && cap sync ios"
  }
}
```

## Pre-requisites Checklist

Before starting any native SKU work:

- [ ] Vendor `riffwave.js` and `sfxr.js` into `js/vendor/`
- [ ] Self-host Google Fonts (Orbitron, Exo 2, Press Start 2P, Audiowide) as WOFF2
- [ ] Update `index.html` to use local font/script references
- [ ] Decide music strategy (full bundle vs. on-demand download vs. reduced tracklist)
- [ ] Create app icons in required sizes (16, 32, 128, 256, 512, 1024px)

**For Steam (Electron):**
- [ ] Register Steamworks account ($100 fee)
- [ ] Create `electron-main.js` with steamworks.js integration
- [ ] Prepare store page assets (5+ screenshots, trailer, capsule images, hero graphic)
- [ ] Define achievements, leaderboards, and cloud save config in Steamworks App Admin
- [ ] Set up SteamPipe depot build scripts
- [ ] Implement gamepad support (Gamepad API) for Steam Deck / controller users

**For standalone desktop (Tauri):**
- [ ] Install Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

**For mobile (Android/iOS):**
- [ ] Implement dual-stick touch controls (Phase 1-2)
- [ ] Implement ability/weapon buttons (Phase 2)

**For Xbox:**
- [ ] Apply to ID@Xbox program
- [ ] Implement full gamepad controls with Xbox button prompts
- [ ] Package as UWP app with WebView2

## Music Size Reduction Options

| Strategy | Estimated Size | Tradeoff |
|----------|---------------|----------|
| Current (MP3, mixed bitrate) | 336MB | No quality loss |
| Re-encode all MP3 at 128kbps | ~170MB | Slight quality loss on complex tracks |
| Convert to Opus (96kbps) | ~110MB | Best compression, not supported in Safari <15.4 |
| Dual-encode (Opus + MP3 fallback) | ~280MB | Universal support, larger total |
| Ship 20 "core" tracks, DLC rest | ~115MB | Under App Store OTA limit, post-install download |
| On-demand streaming from CDN | ~5MB (app) | Requires internet, adds hosting cost |

---

## <a name="mobile-touch-controls"></a>Mobile Touch Controls

### Current State Assessment

Rainboids has **partial** touch support — enough to technically play, but far from a polished mobile experience. Here's what exists and what's missing:

**What works today:**
- Dynamic movement joystick (appears at first touch point, 160px base, 30px handle)
- Single-touch movement mapped to WASD directional input (up/down/left/right with 0.2 dead zone)
- Pause button (top-right, 56px + 10px hit padding = 76px touch target)
- Touch scrolling and tap-to-buy in the shop overlay
- Haptic feedback on joystick start (20ms) and pause tap (30ms)
- Mobile detection via `(hover: none) and (pointer: coarse), (max-width: 768px)`
- Viewport meta tags (user-scalable=no, mobile-web-app-capable)
- `touch-action: none` on body and canvas
- Multi-touch tracking infrastructure (`activeTouches` Map, `maxTouchPoints` detection, `testMultiTouch()` method)

**What's missing (critical for mobile SKUs):**
- **No aiming control** — `aimTouchId` property exists but is unused; player can't aim on mobile
- **No fire control** — auto-fire is not triggered; no way to shoot
- **No ability/skill buttons** — skills require keyboard number keys (1-6), completely inaccessible on mobile
- **No weapon switch buttons** — weapon cycling requires keyboard, inaccessible on mobile
- **No second-touch handling** — only the first touch (joystick) does anything; additional touches are ignored
- **Joystick is DOM-based** — updates `style.left`/`style.top` every frame, causing layout recalculation
- **No visual distinction** between control zones
- **No haptic feedback** for combat events (firing, damage, kills)
- **No settings** for control customization (size, opacity, layout)

**Verdict:** The current touch system is a movement-only prototype. A full dual-stick control system with ability buttons is required before Android or iOS deployment.

---

### Control Architecture: Dual-Stick + Ability Buttons

The recommended control scheme follows the industry-standard **dual-stick** pattern used by Brawl Stars, Geometry Wars Touch, and similar mobile shooters.

#### Screen Layout (Landscape)

```
+-------------------------------------------------------------------+
|  [HP/Shield]        [Score | Wave 12]           [Pause] [Pwr Wpn] |
|  [Lives]            [Powerup icons]             [Pri Wpn]         |
|                                                                    |
|                         GAME AREA                            [Sk3] |
|                                                              [Sk2] |
|   LEFT 45%                              RIGHT 55%            [Sk1] |
|   Movement zone                         Aim+Fire zone             |
|       (dynamic joystick                    (dynamic joystick       |
|        appears here)                        appears here)          |
+-------------------------------------------------------------------+
     ◄─── thumb arc ───►                      ◄─── thumb arc ───►
```

#### Zone Split
- **Left 45%** of screen width → movement joystick zone
- **Right 55%** of screen width → aim joystick zone (biased right because aiming needs more precision)
- Both zones constrained to bottom 70% of screen height (top 30% reserved for HUD)

#### Movement Joystick (Left Hand)
- **Trigger**: First touch in left zone
- **Behavior**: Dynamic — appears at touch point, disappears on release
- **Base diameter**: 160px (existing)
- **Handle diameter**: 30px (existing)
- **Max distance**: 80px from center (existing)
- **Dead zone**: Radial, 12px (15% of max) — prevents drift from resting thumb
- **Input mapping**: Normalized X/Y → `input.up/down/left/right` with 0.2 threshold (existing)

#### Aim Joystick (Right Hand)
- **Trigger**: First touch in right zone
- **Behavior**: Dynamic — appears at touch point
- **Base diameter**: 140px (slightly smaller than movement)
- **Handle diameter**: 30px
- **Max distance**: 70px from center
- **Dead zone**: Radial, 10px (14% of max)
- **Input mapping**: Angle from stick center → `input.aimX/aimY` (converted to world coordinates relative to player position); distance from center is ignored (aim is directional only)
- **Firing**: `input.fire = true` while the aim stick is held; `input.fire = false` on release
- **On release**: Maintain last aim direction (player keeps facing that way)

#### Auto-Fire Option
- Configurable in settings: when enabled, the game fires at the nearest enemy automatically without needing the aim stick
- Auto-aim assist (default ON): when using the aim stick, snap within 15 degrees to the nearest enemy — reduces frustration on small screens

---

### Ability & Weapon Buttons

#### Skill Buttons (Right Edge)

The game has up to 6 defense skills (BULWARK, REPAIR_NANITES, PHASE_DASH, DEFLECTOR_ORBS, EMP_PULSE, TRACTOR_SHIELD). On mobile, show only the skills the player has equipped (typically 1-3).

**Position**: Right edge of screen, vertically stacked, bottom button at 35% from screen bottom, 20px from right edge. Each button spaced 68px apart (52px button + 16px gap).

**Dimensions**:
- Visual size: 52x52px
- Touch target: 64x64px (6px invisible padding on each side)
- Corner radius: 12px

**States**:
| State | Appearance |
|-------|------------|
| Ready | Full color, subtle outer glow |
| On cooldown | Darkened to 30% brightness, radial sweep overlay (clock-wipe), cooldown seconds displayed as centered text |
| Just became ready | 0.5s pulse glow animation |
| Pressed | Scale to 0.9x for 50ms, then back to 1.0x over 100ms |
| Not owned | Hidden |

#### Weapon Buttons (Top Corners)

**Primary weapon** (top-left area, below HUD):
- Position: 12px from left edge, 70px from top
- Size: 48x48px visual, 60x60px touch target
- Shows current primary weapon icon
- Tap to cycle to next owned primary weapon
- Weapon name appears briefly (1s fade-out) on switch

**Power weapon** (top-right area, below pause button):
- Position: 12px from right edge, 70px from top
- Size: 48x48px visual, 60x60px touch target
- Same tap-to-cycle behavior

**Why tap-to-cycle, not swipe:** Swipe gestures conflict with the joystick zones. Accidental swipes during combat would switch weapons at the worst time.

---

### Visual Design: Space/Neon Aesthetic

The touch controls should feel like holographic HUD elements — translucent, glowing, consistent with the game's space theme.

#### Color Palette

| Element | Color | Usage |
|---------|-------|-------|
| Movement controls | `rgb(100, 180, 255)` — cool blue | Joystick base border, handle fill |
| Aim controls | `rgb(255, 130, 50)` — warm orange | Joystick base border, handle fill |
| Skill buttons | `rgb(80, 160, 255)` — HUD blue | Border, icon tint |
| Weapon buttons | `rgb(80, 160, 255)` — HUD blue | Border, icon tint |
| Backgrounds | `rgb(10, 20, 40)` — dark blue-black | Button fills at 0.7 opacity |
| Ready flash | `rgb(200, 220, 255)` — bright white-blue | Pulse animations |

#### Opacity Levels

| State | Joystick base | Joystick handle | Buttons |
|-------|---------------|-----------------|---------|
| Idle (not touched) | 0.35 | 0.60 | 0.50 |
| Active (touched) | 0.55 | 0.85 | 0.80 |
| Faded (after 2s continuous use) | 0.25 | 0.50 | n/a |

#### Movement Joystick Styling
- **Base**: `rgba(0, 0, 0, 0.25)` fill, `rgba(100, 180, 255, 0.4)` border (2px), border-radius 50%
- **Handle**: `rgba(100, 180, 255, 0.6)` fill, `rgba(150, 220, 255, 0.8)` edge highlight
- **Active**: Border brightens to `rgba(100, 180, 255, 0.7)`, handle to `rgba(130, 200, 255, 0.85)`
- **Appear**: Fade in over 100ms
- **Disappear**: Fade out over 150ms

#### Aim Joystick Styling
- **Base**: `rgba(0, 0, 0, 0.25)` fill, `rgba(255, 100, 50, 0.4)` border (2px)
- **Handle**: `rgba(255, 130, 50, 0.6)` fill
- **While firing**: Border pulses to `rgba(255, 160, 80, 0.8)` at 2Hz
- Color difference from movement joystick provides instant visual identification

#### Button Styling
```css
/* Shared style for skill and weapon buttons */
background: rgba(10, 20, 40, 0.7);
border: 1.5px solid rgba(80, 160, 255, 0.5);
border-radius: 12px;
color: rgba(200, 220, 255, 0.9);
backdrop-filter: blur(4px);
-webkit-backdrop-filter: blur(4px);
```
- Ready glow: `box-shadow: 0 0 8px rgba(80, 160, 255, 0.3)`
- Cooldown overlay: `conic-gradient` sweep or SVG arc
- Pressed: `transform: scale(0.9)` over 50ms

---

### Haptic Feedback Patterns

Expand beyond the current two haptic events. Uses `navigator.vibrate()` (Android only — iOS Safari does not support the Vibration API).

| Event | Pattern (ms) | Notes |
|-------|-------------|-------|
| Joystick touch start | `vibrate(15)` | Subtle tick |
| Firing (per shot) | `vibrate(8)` | Throttle to max 10Hz for rapid-fire weapons |
| Taking damage | `vibrate([30, 20, 30])` | Double buzz |
| Low health warning | `vibrate([20, 40, 20, 40, 20])` | Triple quick pulse |
| Shield break | `vibrate([50, 30, 80])` | Escalating intensity |
| Enemy kill | `vibrate(12)` | Short confirmation |
| Powerup pickup | `vibrate([15, 30, 25])` | Pleasant "pick up" |
| Ability activated | `vibrate(25)` | Medium pulse |
| Ability ready | `vibrate([10, 20, 10])` | Gentle double-tap |
| Wave complete | `vibrate([30, 50, 30, 50, 60])` | Celebratory |
| Player death | `vibrate([100, 50, 150])` | Heavy, dramatic |
| Weapon switch | `vibrate(10)` | Minimal click |
| Pause toggle | `vibrate(30)` | Already implemented |

**Rules**: Never exceed 200ms total per event. Provide a "Haptic Feedback" toggle in settings (default ON). Skip haptics during menus/transitions.

---

### HUD Adaptation for Mobile

The existing HUD must reflow to avoid overlapping with touch control zones.

| Element | Desktop | Mobile Adaptation |
|---------|---------|-------------------|
| Health bar | Top-left, 220px wide | Shrink to 160px, keep top-left |
| Shield bar | Below health | Same, match width |
| Lives | Top-left icons | Keep as-is (small enough) |
| Level / XP | Near health | Compact single-line below shield |
| Coins | Near health | Top-left cluster |
| Score | Top-center | Reduce font 25%, single line with wave |
| Wave counter | Top-center | Merge with score: "Wave 12 · 45,230" |
| Powerup icons | Variable | Horizontal strip below top HUD, 28px icons (vs 36px desktop) |
| Wave message | Center | Smaller font (28px vs 48px), already handled |
| Custom cursor | Follows mouse | Hidden on mobile (already disabled) |

**Safe area insets**: Use `env(safe-area-inset-top)` etc. for notch/Dynamic Island devices. Add 10px top margin on notched devices.

---

### Thumb Ergonomics

**Phone in landscape (e.g., iPhone 15: 393x852pt logical):**

| Zone | Position | Usage |
|------|----------|-------|
| Natural (comfortable) | Bottom 40%, left/right 35% | Joysticks, frequently-used buttons |
| Stretch (reachable) | Center-bottom, mid-edges | Occasional buttons (weapon switch) |
| Unreachable | Top-center | Display-only HUD (no interactive elements) |
| Avoid | Bottom 20px | iOS home indicator / Android nav bar |
| Avoid | Left/right 10px edges | OS gesture zones |
| Avoid | Bottom corners 60x60px | Bezel interference |

**Tablet (iPad):** Controls should use 30px margin from edges (vs 10-20px on phone). Buttons can be slightly larger (60x60px). Consider offering "compact" vs "spread" layout.

---

### Accessibility

**Touch target sizing:**
- All interactive elements: minimum 44x44pt (Apple HIG) / 48x48dp (Material)
- Action game recommendation: 52-56px visual, 64px touch target
- Minimum 8px spacing between targets; 16px recommended for action gameplay

**Customization options (Settings menu):**
- Control opacity slider: 30% → 100% (default 50%)
- Button size multiplier: 0.8x → 1.5x (default 1.0x)
- Joystick size multiplier: 0.8x → 1.5x (default 1.0x)
- Left-handed mode: mirror all controls (movement right, aim left)
- Fixed vs dynamic joystick toggle
- Auto-fire toggle
- Auto-aim assist toggle
- Haptic feedback toggle
- HUD scale: 0.75x → 1.25x

**Color-blind support:** Movement and aim joysticks are distinguished by both color (blue vs orange) AND position (left vs right zone). Cooldown visualization uses sweep + number text, not color alone.

---

### Implementation Plan

#### Rendering Strategy: Hybrid

| Element | Render method | Reason |
|---------|---------------|--------|
| Joysticks | Canvas | Updates every frame; avoids DOM layout recalc; consistent with game visuals; enables glow/particle effects |
| Skill buttons | HTML/CSS overlay | Static position; CSS handles transitions/animations natively; semantic `<button>` for accessibility; `conic-gradient` for cooldown sweep |
| Weapon buttons | HTML/CSS overlay | Same as skill buttons |

**Current DOM joystick removal:** The existing `dynamic-joystick-base` and `dynamic-joystick-handle` elements (created in `showDynamicJoystick()`) should be replaced with Canvas-rendered equivalents drawn in the game's render loop after entities, before final HUD text.

#### Implementation Phases

**Phase 1 — Dual-Stick Core** (prerequisite for mobile SKUs)
1. Refactor `input-handler.js`: split screen into left/right zones
2. Implement aim joystick (second touch in right zone → aim direction + fire)
3. Move joystick rendering from DOM to Canvas (draw in game render loop)
4. Wire `aimTouchId` to actually track the aim touch
5. Add auto-fire toggle and auto-aim assist to settings
6. Test on physical Android + iOS devices

**Phase 2 — Ability & Weapon Buttons**
1. Add `#mobile-controls` container with skill button elements
2. Wire skill button taps to `input.skill1`–`input.skill4`
3. Add weapon cycle buttons, wire to weapon switching logic
4. Implement cooldown sweep visualization (CSS `conic-gradient` or SVG arc)
5. Show/hide buttons based on owned skills/weapons
6. Add haptic feedback for button presses

**Phase 3 — Polish & Settings**
1. Implement mobile settings panel (opacity, size, layout, left-handed mode)
2. Add full haptic feedback pattern library (damage, kills, powerups, etc.)
3. HUD reflow for mobile (compact layout, smaller fonts/bars)
4. Safe area inset handling for notched devices
5. Tablet layout variant (larger buttons, more spacing)
6. Fade controls during sustained use (reduce to 25% opacity after 2s)

**Phase 4 — Testing & Refinement**
1. Test on physical devices: iPhone SE, iPhone 15, Pixel 7, Galaxy S24, iPad
2. Tune dead zones, joystick sensitivity, aim assist snap angle
3. Performance profiling (Canvas joystick rendering cost)
4. A/B test fixed vs dynamic joystick preference
5. Verify no input conflicts between joystick zones, buttons, and pause overlay

#### Files to Modify

| File | Changes |
|------|---------|
| `js/modules/input-handler.js` | Zone split, aim joystick, refactored touch handlers, Canvas joystick rendering |
| `js/modules/game-engine.js` | Draw joystick visuals in render loop, HUD reflow logic |
| `js/modules/ui-manager.js` | Mobile settings panel, skill/weapon button management |
| `css/styles.css` | Skill/weapon button styles, mobile HUD adjustments, safe area insets |
| `index.html` | Skill/weapon button elements inside `#mobile-controls` |
| `js/modules/utils.js` | Expanded haptic feedback patterns |

#### Estimated Element Count
- 0 new DOM elements for joysticks (moved to Canvas)
- 3-4 skill buttons (DOM)
- 2 weapon buttons (DOM)
- 1 container div (existing `#mobile-controls`)
- Total: ~7 new DOM elements
