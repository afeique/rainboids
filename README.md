<div align="center">

<img src="Rainboids%20-%20Banner.png" alt="RAINBOIDS — Supercharged Asteroids" width="660">

### A looter-shooter that fuses twin-stick arcade combat with deep itemization.

Elements & resistances, rolled rarity-tiered gear, kill-streak power tiers, and a 30-wave boss gauntlet — all in your browser, no install.

# ▶ Play free now at [**rainboids.com**](https://rainboids.com/)

[![PLAY NOW at rainboids.com](https://img.shields.io/badge/▶%20PLAY%20NOW-rainboids.com-22c55e?style=for-the-badge&labelColor=14532d)](https://rainboids.com/)

![Version](https://img.shields.io/badge/version-6.83.0-8b5cf6?style=flat-square)
&nbsp;![Stack](https://img.shields.io/badge/Canvas2D_+_WebGL2-f59e0b?style=flat-square)
&nbsp;![Platforms](https://img.shields.io/badge/desktop_·_mobile_·_gamepad-3b82f6?style=flat-square)
&nbsp;![License](https://img.shields.io/badge/license-ISC-64748b?style=flat-square)

[Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Community](#-community)

</div>

---

## 🎮 Controls

Open **[rainboids.com](https://rainboids.com/)** in any modern desktop or mobile browser. Plug in a gamepad and it just works.

| Action | ⌨️ Mouse + Keyboard | 🎮 Gamepad |
|---|---|---|
| Move | `WASD` | Left stick |
| Aim | Mouse cursor (or `←`/`→`) | Right stick (twin-stick) |
| Dash (i-frames) | `Shift` | `✕` / `A` |
| Fire primary | Hold `L-click` / `↑` | `R2` |
| Fire / charge power weapon | `Space` / `R-click` / `↓` | `L2` |
| Activate abilities (4 slots) | `1` `2` `3` `4` | `◯` / `B` |
| Primary · Power · Ability radial | hold `F` · `E` · `R` | hold `R1` · `L1` · `△`/`Y` |
| Inventory · Stats · Pause | `I` · `` ` `` · `Esc` | — · — · `Start` |

**📱 Mobile** runs a *turret-defense* mode: the ship is stationary — press-and-hold to aim + fire, drag to retarget, and the power weapon auto-fires when ready. `PRM`/`PWR` side buttons open the weapon radials.

**Assists** (pause → ASSISTS): aim-snap, auto-aim, auto-fire, laser sight. &nbsp; **Cheats:** `[` +1000 gold · `]` +5 SP · `P` spawn a powerup.

---

## ⚙️ How It Works

**🔫 Arsenal** — **11 primary** + **11 power** weapons, all free and swappable from the radial menus (auto-unlocked at wave milestones). Pour **gold** into per-weapon upgrade trees — Multishot, Rapid Fire, Piercing, Big Bullets, Explosive, Homing, Stun, Knockback, plus per-weapon capstones. `Phase Dash` is a free movement primitive on `Shift`.

**✨ Abilities** — 6 defense abilities on a 4-slot loadout (keys `1`–`4`): Bulwark, Repair Nanites, Deflector Orbs, EMP Pulse, Tractor Shield, Sentry Drone.

**🔥 Elements & resistances** — 7 elements (Kinetic · Pyro · Cryo · Volt · Toxic · Void · Radiant), each with a signature status (Burn, Corrode, Chill/Freeze, Conduct, Oil, Mark, Bleed). Enemies carry weaknesses and immunities, so bringing the right element matters — and statuses **chain into reactions**: frozen enemies SHATTER into neighbors, oiled enemies hit by fire FLARE. Elemental enemies afflict *you* back.

**💎 Loot & inventory** — 5 gear slots (cockpit/hull → HP, shielding/chassis → toughness, **nanites** → regen). Drops roll across an **8-tier rarity ladder** (Common → Rare → Exceptional → Legendary → Epic → Godlike → Divine → Transcendental) with multi-affix stats *and* per-element resist rolls. Better drops auto-equip; press `I` to review and re-equip. Everything streams into a left-edge loot feed.

**🪙 Gold & shop** — destroy enemies and asteroids for gold; spend it in the gold-only **UPGRADES** panel (Primary / Power / Defense / Passive tabs).

**📈 Progression** — every stage clear (waves 3, 6, … 30) deals a **survivor-card** pick (2 offense + 1 defense) plus a tailored weapon-upgrade quick-buy; boss waves add a bonus. Kills grant XP toward a **persistent account level** (cap 100); each level = 1 **SP** spent on permanent stats in the STATS screen. A **20-tier kill-streak ladder** (EMPOWERED → … → RAINBOIDS GOD) buffs damage until you take a hit.

**🏁 Campaign** — a **10-stage / 30-wave speedrun** (`1-1` → `10-3`); every stage final is a boss. Time, accuracy, and damage are tallied on the Game Complete screen. **Meta persists** across runs in `localStorage` — gold, gear, upgrades, and level/SP carry over: `CONTINUE` resumes where you left off, `NEW GAME` starts a fresh run but keeps your accumulated progression. Autosaves every ~15s and on tab close.

> **20+ enemy types** with distinct movement, attacks, and elemental identities — from the orbiting **Hunter** and the freeze-shattering **Wasp** swarm to the anti-meta **Warden** that adapts its resistance to whatever element you keep using, forcing you to switch.

---

## 🖼️ Screenshots

<div align="center">

<img src="screenshots/title-screen.png" width="49%" alt="Title screen"> <img src="screenshots/action-02-bullet-hell.png" width="49%" alt="Bullet-hell skirmish">
<img src="screenshots/action-04-titan-boss.png" width="49%" alt="Titan boss"> <img src="screenshots/epic-10-enemy-variety.png" width="49%" alt="Enemy variety">

</div>

---

## 🛠️ Development

Vanilla **ES6 modules** rendered on **Canvas 2D** with a **WebGL2** particle layer for glow. No build step for dev — just a static server.

```bash
git clone https://github.com/afeique/rainboids.git
cd rainboids && npm install
npm run dev          # → http://localhost:8090
```

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Unit tests (Jest) | `npm run test:unit` |
| QA smoke (Playwright) | `npm run test:qa` |
| Full E2E | `npm run test:e2e` &nbsp;(`:enemies` · `:waves` · `:survival` · …) |
| Performance / FPS | `npm run test:perf` |
| Run everything (unit→qa→e2e→perf) | `npm test` |
| AI QA bot (auto-playtester) | `npm run qa:bot` &nbsp;(`:quick` · `:long` · `:headed` · `:balance`) |
| Microbenchmarks (mitata) | `npm run bench` &nbsp;(`:pool` · `:collision` · `:wave` · `:math`) |
| Allure reports | `npm run report:allure` |
| Regenerate assets | `npm run generate-playlist` · `npm run generate-sfx` |
| Desktop app (Electron) | `npm run electron:dev` · `electron:build:mac\|win\|linux` |

> First Playwright run needs browsers: `npx playwright install`. Every Playwright run also writes `tests/report/results.json`; the `*:json` scripts emit pure JSON to stdout (pipe to `jq`).

<details>
<summary><b>Project structure</b></summary>

```
index.html              # Game entry point
VERSION · CHANGELOG.md  # Solo semantic version + history
CLAUDE.md               # Contributor / agent instructions
js/
  main.js               # Bootstrap
  modules/
    game-engine.js      # Game loop orchestrator
    core/               # constants, state machine, pools, event bus, timers, storage
    platform/           # device + viewport detection
    player/             # entity, weapons, abilities, progression, lifecycle, renderer
    enemy/              # entity, data, movement, firing, AI, shapes
    combat/             # elements, collision, weapon-data, combat-manager
    hud/ · world/ · shop/ · ui/ · wave/ · audio/ · performance/ · render/
css/                    # styles.css
sfx/                    # 47 pre-rendered SFXR WAVs (regen: npm run generate-sfx)
music/                  # background tracks
tests/                  # unit/ (Jest) · qa/ e2e/ performance/ (Playwright) · helpers/
tools/                  # benchmark/ · ai-qa-bot/ · scripts/
screenshots/ · electron/ · docs/
multiplayer/            # experimental WASM co-op — SHELVED (see multiplayer/RESTORE.md)
```
</details>

---

## 💬 Community

<div align="center">

<a href="https://discord.gg/PRKpC4HCcc"><img src="Rainboids%20-%20Discord%20Server.png" alt="Join the Rainboids Discord" width="160"></a>

**[Jump into the Rainboids Discord](https://discord.gg/PRKpC4HCcc)** — share builds, report bugs, and chase the leaderboard.

</div>

---

## 🎵 Credits & License

- **Music** — most tracks are original compositions by **afeique**; 10 royalty-free tracks come from **[Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/)** ([YouTube](https://www.youtube.com/@WhiteBatAudio)), used under his royalty-free license: *Aura · Beyond the Shadows · Dangerous · Inferno · Iridium · Legend · Midnight · Out for Blood · Salvation · World Eater*.
- **SFX** — every sound is SFXR-generated (no third-party sample packs).
- Builds on the original **[Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic)** with extensive modularization. Licensed **ISC**.

<div align="center"><sub>made with 🌈 by <a href="https://github.com/afeique">@afeique</a></sub></div>
