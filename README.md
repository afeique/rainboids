<div align="center">

<img src="Rainboids%20-%20Banner.png" alt="RAINBOIDS — Supercharged Asteroids" width="660">

### A twin-stick arcade shooter set in one open arena.

Free-roam a single open field and blast **endless escalating waves** of enemies + asteroids until you die. Asteroids and your ship render as glowing 3D wireframe geometry; enemies keep their hand-drawn 2D silhouettes. All in your browser, no install.

> **v12.0.0 — back to one open arena.** The v11 multi-map Campaign (distinct map encounters connected by exit portals) was removed: its per-map movement rules confined the ship and left the field smaller than the screen. The game is once again a **single fixed-size open map** with **free roam + endless waves**. (v11 had earlier removed elemental effects, attunements, and draft cards in favor of **simple, straightforward damage** and **full 3D-wireframe rendering**; those stay. Powerups remain in the codebase.)

# ▶ Play free now at [**rainboids.com**](https://rainboids.com/)

[![PLAY NOW at rainboids.com](https://img.shields.io/badge/▶%20PLAY%20NOW-rainboids.com-22c55e?style=for-the-badge&labelColor=14532d)](https://rainboids.com/)

![Version](https://img.shields.io/badge/version-6.195.0-8b5cf6?style=flat-square)
&nbsp;![Stack](https://img.shields.io/badge/Canvas2D_+_WebGL2-f59e0b?style=flat-square)
&nbsp;![Platforms](https://img.shields.io/badge/desktop_·_mobile_·_gamepad-3b82f6?style=flat-square)
&nbsp;[![License: PolyForm-NC 1.0.0](https://img.shields.io/badge/license-PolyForm--NC_1.0.0-64748b?style=flat-square)](LICENSE)

[Changelog](CHANGELOG.md) &nbsp;·&nbsp; [Community](#-community)

</div>

---

## 🎮 Controls

Open **[rainboids.com](https://rainboids.com/)** in any modern desktop or mobile browser. Plug in a gamepad and it just works.

| Action | ⌨️ Mouse + Keyboard | 🎮 Gamepad |
|---|---|---|
| Move | `WASD` | Left stick |
| Aim | Mouse cursor (or `←`/`→`) | Right stick (twin-stick) |
| Dash (i-frames) | `Shift` | `R1` / `RB` |
| Fire primary | Hold `L-click` / `↑` | `R2` |
| Fire power weapon | `Space` / `R-click` / `↓` | `L2` |
| Weapon radials (swap weapon mid-run) | Hold `F` primary · `E` power | L1 / R1 hold |
| Activate abilities (4 slots) | `1` `2` `3` `4` | `✕/A` · `◯/B` · `□/X` · `△/Y` |
| Toggle auto-aim · Lock-on (hold) | — | `L3` · `R3` |
| Inventory · Stats · Pause | `I` · `` ` `` · `Esc` | — · — · `Start` |

**📱 Mobile** is one-thumb play: drag the analog stick to move, tap to dash, and the Co-Pilot handles aim, primary fire, smart power use, and ability timing. Positioning and dash timing are the active verbs.

**Assists** (pause → ASSISTS): aim-snap, auto-aim, auto-fire, auto-cast abilities, laser sight. &nbsp; **Cheats:** `[` +1000 gold · `]` +5 SP · `P` spawn a powerup.

**Fonts** (title **SETTINGS** or pause → DISPLAY): pick the menu typography — separate header/tab and body fonts from a roster of pixel faces (Press Start 2P, Silkscreen, Pixelify Sans, Fira Code) and modern ones (Inter, Roboto, Montserrat, Helvetica Neue, System UI), and **scale header/body text size** (70–160%) for readability. Retro pixel and a large, readable default; choices persist.

---

## ⚙️ How It Works

**🔫 Arsenal** — **11 primary** + **11 power** weapons (the active pair is set in the pre-run loadout). Primaries fire continuously; **power weapons run on a passive-regen energy meter** (the sphere next to health) — it fills automatically over time, the ship visibly charges up as it fills, and a power shot fires the instant you have enough energy banked. Weapons are **permanent account unlocks** bought with **account-gold** in the pre-run **BUILD** screen, where you also customize each one with **Attunements** and **Mechanic Mods** (see below). `Phase Dash` is a free movement primitive on `Shift`.

**🧬 Mechanic Mods** — *attunements (the elemental tuning) were removed in v11.0.0.* **Mechanic Mods** still add behavior to a weapon (pierce, explosive, homing, stun/knockback procs + per-weapon capstones). They're permanent account-gold unlocks, toggled active per run as bubbles orbiting each weapon in the BUILD tree.

**✨ Abilities** — a 4-slot loadout (keys `1`–`4`) of **unique-verb** abilities: Bulwark (on-demand resist window), **Field Medic** (burst heal **+ status cleanse**), Deflector Orbs, EMP Pulse, Sentry Drone, **Blink** (teleport + i-frames), **Gravity Snare** (yank enemies inward), **Designator** (AoE MARK), **Second Wind** (cheat death once), **Elemental Infusion** (re-element your shots), **Cryo Field** (freeze zone), **Stasis Field** (slow zone), **Storm Cell** (shock zone), **Pyre Aura** (burn zone). The base kit (Bulwark + Field Medic, plus the free `Shift` Phase Dash) is available from run one; more are unlocked in the Armory. Most abilities can also be **attuned** to a single element in the BUILD tree's DEFENSE cluster — one element each (a radio choice), landing that element's status through the ability's verb (EMP freezes/ignites caught enemies, Sentry rounds ignite/chain, Bulwark burns attackers, Blink leaves an elemental burst, …).

**⚔️ Simple damage** — *v11.0.0 removed all elemental effects, attunements, and status effects.* Damage is now plain and straightforward: base damage × crit × your passive multipliers, minus flat enemy armor / shields. No resistances, no burn/freeze/chill/corrode, no rock-paper-scissors matchups — just shoot things and they take damage.

**💎 Loot, inventory & Cores** — 5 gear slots (cockpit/hull → HP, shielding/chassis → toughness, **nanites** → regen). Drops roll across an **8-tier rarity ladder** (Common → Rare → Exceptional → Legendary → Epic → Godlike → Divine → Transcendental) with multi-affix stats *and* per-element resist rolls. Gear is **reviewed and managed in the pre-run BUILD screen's GEAR tab, locked once a run starts** — mid-run pickups no longer auto-equip; they stream into the loot feed (press `I` for a graphical card/stat-sheet view) and bank to a **persistent stash** the moment you grab them, so a mid-run quit or crash never loses loot. In the BUILD screen's GEAR tab you equip stash items into the 5 slots (with score deltas) and spend **Cores** (✦) — the item-crafting currency earned by **salvaging** gear — to **reroll** an item's affixes or **tier-up** its rarity (keeping its rolls and adding the new tier's affix slot).

**🪙 Gold economy** — two wallets. **Run-gold** starts at **0** each run, accrues from kills, is spent at the **card-draft moment** (paid **reroll**, escalating **Repair Kit** heal, a **6th/7th card**, or a one-per-run **Revive Token** that cheats death), and **banks into account-gold** when the run ends — win, death, or abandoning a run early to start fresh — so it's **never lost**. **Account-gold** is the persistent wallet you spend in the pre-run **BUILD** screen on permanent weapon/ability unlocks (abilities cost more). Every in-run purchase is gold you don't bank — spend deep or save to grow the account.

**🧿 Passives** — build-defining **rule-modifier** relics (distinct from the numeric STATS), bought permanently with account-gold and equipped into a small set of slots in the BUILD screen's PASSIVES tab. Slots open as you clear stages (3 in a standard run, scaling up to 5 in longer runs), and **at most 2 may be build-defining keystones**; the rest are modular passives that stack safely (Opportunist, Catalyst, Ricochet…). **No-downsides design:** a keystone is defined by the *build it unlocks*, not by an imposed penalty — fragility is emergent (all-offense slotting), never a tax. This anchors distinct **build archetypes**: a **crit/execute** path (Glass Cannon — +40% damage scaling to +90% as your HP falls — plus Apex Predator, which executes enemies under 15% HP); a **blood / lifesteal** path (Bloodshield banks over-heal as a damage-soaking buffer, Bloodlust ramps damage on kills, Sanguine + Hemoglutton feed sustain); and a **power-weapon energy** path (Capacitor/Reactor/Efficiency stats + Overflow Capacitor, Capacitor Bank's overcharge, and the Overclock keystone that fires powers on a flat cooldown with no meter). They're **swappable mid-run** from the pause menu's PASSIVES tab, and **top-tier gear can also roll a passive** (modular on Exceptional+, a keystone only on Transcendental) that's active without using a slot. *(Rolling out — the full system + a curated set of working effects are live; the rest of the catalog lands incrementally.)*

**📈 Progression** — *draft cards were removed in v11.0.0.* Progression is the **endless wave climb itself**: each cleared wave ramps the enemy level (and wave size) for the next, to a cap. A **20-tier kill-streak ladder** (EMPOWERED → … → RAINBOIDS GOD) still buffs damage until you take a hit, and account-gold spent in the BUILD screen still unlocks weapons/abilities. **Powerups** remain in the codebase (orbs, stacks, effects) even though they're no longer drafted.

**🗺️ The arena** — *v12.0.0 collapsed the v11 multi-map Campaign back into a **single open field**.* One fixed-size **1920×1080** arena: full free roam, no movement confinement, no exit portals. Enemies + asteroids spawn from the field edges in **endless escalating waves** — clear a wave and the next rolls in, bigger and tougher. You play until you die; CONTINUE / RESTART WAVE resumes on the wave you fell on.

Each cleared map **lifts the enemy level** for the maps that follow. **Meta persists** across runs in `localStorage` — account-gold, unlocks, gear, and upgrades carry over: `NEW GAME` opens the **BUILD** screen (a tabbed bubble tree) where you unlock weapons/abilities with account-gold and pick your loadout, then `START RUN`.

**🚀 Ship skins** — a cosmetic-only **HANGAR** (opened from the title screen) lets you pick from **12 ship hulls** with a live animated preview: the default spectral interceptor, the restored classic fighter, a detailed flagship, and homages to genre favorites (a forked-prow saucer, a split-S-foil strike fighter, a Yamato-charging capital ship, and more). Every hull shares the same fixed collision size, so the choice is **purely visual** and never affects gameplay.

> **20+ enemy types** with distinct movement, attacks, and elemental identities — from the orbiting **Hunter** and the freeze-shattering **Wasp** swarm to the anti-meta **Warden** that adapts its resistance to whatever element you keep using, forcing you to switch.

---

## 🖼️ Screenshots

<div align="center">

<img src="screenshots/title-screen.png" width="49%" alt="Title screen"> <img src="screenshots/action-02-bullet-hell.png" width="49%" alt="Bullet-hell skirmish">
<img src="screenshots/action-04-titan-boss.png" width="49%" alt="Heavy enemy assault"> <img src="screenshots/epic-10-enemy-variety.png" width="49%" alt="Enemy variety">

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
    player/             # entity, weapons, abilities, progression, lifecycle, renderer, skins/
    assist/             # Co-Pilot sense/decide/act helpers for mobile and opt-in assists
    enemy/              # entity, data/archetypes, firing, shapes, abilities/ (cloak, charge, reflect, …)
                        #   steering AI: steering.js (Reynolds + momentum), context-steering.js,
                        #   strategy.js + brain.js (brain adds a dart/juke burst overlay)
    combat/             # collision, weapon-data, combat-manager (simple damage — elements removed v11)
    world/              # asteroid, particle, powerup, explosion.js (procgen fireball+smoke), starfield, camera
                        #   map/  — open arena: world-map (bounds+wall geometry),
                        #           map-modes (single OPEN map + endless waves), mode-manager, portal (dormant)
    render/             # shapes (2D enemy/ship silhouettes), mesh3d (3D wireframe renderer), entity-meshes (player ship mesh)
    hud/ · shop/ · ui/ · wave/ (spawn helpers) · audio/ · performance/
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

- **Music** — most tracks are original compositions by **afeique** (licensed **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**); 10 royalty-free tracks are **"Music by Karl Casey @ White Bat Audio"** ([whitebataudio.com](https://whitebataudio.com/) · [YouTube](https://www.youtube.com/@WhiteBatAudio)), used under [his license](https://whitebataudio.com/license-agreement/): *Aura · Beyond the Shadows · Dangerous · Inferno · Iridium · Legend · Midnight · Out for Blood · Salvation · World Eater*.
- **SFX** — every sound is SFXR-generated (no third-party sample packs).
- **Key-hint sprites** — "[SimpleKeys](https://beamedeighth.itch.io/simplekeys-animated-pixel-keyboard-keys)" by **beamedeighth**, used under its free-use license.
- Builds on the original **[Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic)** with extensive modularization.
- **License** — source code is **source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE)**: free to use, study, modify, and share for *noncommercial* purposes; commercial use requires a separate license. Original **music is [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**; artwork and the "Rainboids" name are reserved. Full details in **[NOTICE](NOTICE)**.

<div align="center"><sub>made with 🌈 by <a href="https://github.com/afeique">@afeique</a></sub></div>
