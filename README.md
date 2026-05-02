# Rainboids — Supercharged Asteroids

A modern space combat game with deep weapon systems, 10 enemy types, wave-based progression across 100 hand-designed waves, and a full upgrade economy. Built on Canvas 2D.

**Play now at: https://rainboids.cat.computer**

**Current version: see [VERSION](VERSION)**

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/afbf1039-b46c-4717-9aa2-1a8bc4083354" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f1bfe140-5e6b-43df-969d-d1f49427aa02" />

---

## Game Overview

Rainboids is a supercharged asteroids game featuring:
- **5 primary weapons**, **5 power weapons**, and **6 defense skills** — all free, all selectable from the start (pause-menu PRIMARY / POWER tabs); spend coins on per-weapon upgrades in the shop
- **10 unique enemy types** with distinct movement, attack patterns, and visual designs
- **20 powerup types** with stacking mechanics and visual indicators
- **Kill-streak damage tiers** (EMPOWERED → UNSTOPPABLE → GODLIKE → LEGENDARY) — sustained kills without taking damage build up to +100% damage
- **100 hand-designed waves** across 5 acts, plus procedural scaling beyond wave 100
- **Full shop economy** with coins and skill points; per-equipped-weapon upgrade trees
- **Rich juice systems**: hitstop, camera kick, screen flash, shockwave rings, directional shrapnel
- **68 background music tracks** spanning chiptune, synthwave, and electronic
- **Curated futuristic SFX library** — every sound is a 2–3 layer SFXR composition (sub-bass + mid carrier + HPF transient), pre-rendered to 26 WAVs; granular hit sounds per enemy bullet pattern and per player primary weapon
- **Modular ES6 architecture** — domain managers, extracted renderers, state machine, event bus, and frame-counted timers, built with Vite

---

## Controls

Rainboids is **desktop / laptop only** — mouse and keyboard required. Phones and tablets see a "desktop only" splash and the game does not initialize.

- **Movement**: WASD or arrow keys
- **Aim**: Mouse cursor (ship faces cursor)
- **Fire primary**: Hold left-click (no auto-fire — release to stop)
- **Fire / charge power weapon**: Right-click OR Spacebar
- **Defense skills**: Number keys 1-4 (assign in pause menu's SKILLS tab)
- **Pause**: Escape
- **Switch primary weapon**: Pause menu → PRIMARY tab (all 5 free, click to equip)
- **Switch power weapon**: Pause menu → POWER tab (all 5 free, click to equip)
- **Shop**: Click 🛒 button in pause menu — buy upgrades for the currently-equipped weapons

### Cheat Codes
- **SHIFT+1-8**: Spawn individual enemy types
- **SHIFT+9**: One-punch-man mode (one-hit kills)
- **SHIFT+-**: Add coins

---

## Weapons & Skills

### Primary Weapons (5)
Primary weapons are free — they auto-unlock at wave milestones as you progress:

| Weapon | Unlocks | Description |
|--------|---------|-------------|
| Pulse Cannon | Start | Reliable stream of energy shots |
| Storm Needles | Wave 3 | Rapid tiny shots — saturation fire |
| Scatter Gun | Wave 5 | Shotgun burst, devastating up close |
| Rail Driver | Wave 8 | Slow, powerful piercing rail shot |
| Lance Beam | Wave 12 | Precision sweep laser beam |

### Power Weapons (5)
| Weapon | Description |
|--------|-------------|
| Charge Shot | Hold to charge, release for powerful blast |
| Mine Layer | Drop proximity mines |
| Nova Blast | Expanding damage ring |
| Lightning Arc | Chain lightning between enemies |
| Missile Salvo | Homing missiles seek targets |

### Defense Skills (6)
| Skill | Description |
|-------|-------------|
| Bulwark | 50% damage resistance for 4s |
| Repair Nanites | Regen 3 HP/s for 5s |
| Phase Dash | Invulnerable dash 150px |
| Deflector Orbs | Orbiting orbs block bullets for 5s |
| EMP Pulse | Stun nearby enemies for 2s |
| Tractor Shield | Forward shield absorbs bullets for coins |

---

## Enemy Types

### Hunter (Triangle) — Red
Aggressive pursuer that surges at the player in sharp directional bursts. Fires 3-round bursts of red triangle projectiles with 2s cooldown. Darts a random direction at high speed, decelerates, waits, then bursts again.

### Guardian (Square) — Green
Armored patrol enemy that holds territory with axis-aligned movement. Fires 3-round bursts of spinning green squares with long 4s cooldown. Moves in strict horizontal or vertical bursts, then pauses. High health.

### Wasp (Wasp Ship) — Yellow
Agile harasser using the wasp-dart movement pattern. Fires fast yellow needle/dart projectiles. Darts back and forth in tight patterns at high speed, then hovers briefly before repeating. Low health but very hard to track.

### Stalker (Cross) — Cyan
Stealthy predator that positions itself through wide swooping arcs. Fires charged laser beams — a charging ball builds at its tip before releasing a close-range beam slice. Smooth animated rotation when aiming. Medium-high health.

### Drifter — Cyan
Mobile patrol enemy (formerly Laser Turret). Slowly patrols with occasional direction changes, stops to charge and fire precision arc lightning. Medium-high health.

### Prowler — Magenta
Mobile missile platform (formerly Missile Turret). Circles to maintain distance from the player. Fires missiles that launch fast, decelerate, and explode — dangerous area denial. Retreats if approached. High health.

### Weaver (Spinning Wheel) — Yellow
Three-phase spinning turbine. **Spin-up** (2.4s): holds position, spins faster, sparks fly. **Arc dash** (3.6s): zooms in tight orbit around player while spraying spiral lasers in all directions. **Cooldown** (2.6s): decelerates. Medium health, extremely dangerous during arc phase.

### Sentinel — Green
Slow orbital fortress (formerly Shield Turret). Orbits the player at 280px radius, decelerates to fire 8 bullets simultaneously in a full circle, then resumes. Stops before firing. High health, punishes close-range combat.

### Tangerine (Spiked Circle) — Orange
Slow, relentless mine-layer (formerly Bomber). Steadily chases the player at low speed, dropping spiky orange proximity mines that persist for 18 seconds. High health, denies space.

### Titan (Hexagon) — Magenta
Lumbering juggernaut boss. Sweeping purple laser beam telegraphed by a 1.8s dashed warning arc, then rotates ±60° over 1.6s. Locks onto player's direction, slowly builds momentum, brakes past, full stops, repeats. Very high health, 8s cooldown. Animated turret rotation system.

---

## Powerup System

Powerups drop from destroyed enemies and provide temporary or permanent enhancements. Each powerup stacks for increased effectiveness.

### Offensive (9)
| Powerup | Effect per stack |
|---------|-----------------|
| Rapid Fire | +25% fire rate (max 5 stacks) |
| Multi-Shot | +1 bullet per shot (max 3 stacks) |
| Homing | Bullets track enemies |
| Piercing | Bullets penetrate through multiple enemies |
| Explosive | Area damage on impact |
| Big Bullets | +30% bullet size |
| Speed Boost | +50% thrust and top speed |
| Long Range | +40% bullet range |
| Crit Chance | +5% critical hit chance |

### Defensive / Utility (11)
| Powerup | Effect per stack |
|---------|-----------------|
| Crit Damage | +10% critical hit damage |
| Shield Boost | Temporary damage reduction |
| Triage | -5s on the global health-orb drop cooldown (60s base → 30s floor at 6 stacks) |
| Medpack | More health per orb pickup |
| Doctor | Increases max health per orb |
| Payday | More money per orb pickup |
| High Roller | Increases max money per orb |
| Health Orb Drop Chance | +5% health orb drop rate |
| Health Orb Drop Quantity | +1 health orbs per drop |
| Money Orb Drop Chance | +5% money orb drop rate |
| Money Orb Drop Quantity | +1 money orbs per drop |

### Pickup Magnetism
All collectibles — money orbs, green health orbs, **and powerup pickups** — are magnetically pulled to the player. Pull strength ramps in three layers (always-on long-range homing, stronger at 100px, magnetic snap inside 40px). Holding the tractor-beam key adds an extra long-range pull. Health-orb drops are globally throttled (default 60s between drop events) — see the Triage upgrade above to shrink that cooldown.

### Drop Sizes
Money and green orbs are size-capped (`HEALTH_ORB_SIZE_MAX = 1.4`, `MONEY_ORB_SIZE_MAX = 1.6`). When a drop's reward budget exceeds the per-orb cap (`HEALTH_ORB_MAX_HEAL_PER_ORB = 2`, `MONEY_ORB_MAX_MONEY_PER_ORB = 20`), the drop is split into many small orbs that sum to the same total — preventing a single huge orb from dominating the screen.

---

## Kill Streak System

Stack consecutive enemy kills without taking damage to climb a four-tier damage buff. The buff timer (4 s) refreshes on every new kill while alive; the streak count itself **only resets when the player takes damage**. Phase Dash invincibility frames preserve the streak; Bulwark damage reduction does not.

| Streak | Tier         | Damage  |
|--------|--------------|---------|
| 3+     | EMPOWERED    | +25%    |
| 6+     | UNSTOPPABLE  | +50%    |
| 10+    | GODLIKE      | +75%    |
| 15+    | LEGENDARY    | +100%   |

LEGENDARY is capped — extra kills beyond 15 just refresh the buff timer. The HUD shows a top-right indicator with the kill count, tier label, current bonus, and a progress bar to the next tier (or `▲ MAX TIER` once at LEGENDARY). After the buff timer expires but before damage is taken, the indicator dims to `N KILLS / SAVED / ▶ KILL TO RE-ARM`.

---

## Shop & Upgrade System

The shop offers permanent upgrades using two currencies:
- **Coins**: Earned by destroying enemies and collecting money orbs
- **Skill Points (SP)**: Gained by leveling up through experience

The shop has seven tabs: **Help**, **Offense**, **Primary**, **Power**, **Defense**, **Drops**, and **Skills**. **Help** is the landing tab and explains how Gold, SP, and XP are earned. Gold-priced tabs (Offense / Primary / Power) sit on row 1; SP-priced tabs (Defense / Drops / Skills) on row 2. The **Primary** and **Power** tabs show only the upgrades for whichever weapon is currently equipped (selection happens in the pause menu — see Controls above). Switching weapons in the pause menu instantly repopulates the shop with that weapon's upgrades. ~55 upgrades total across all tabs.

**The shop auto-opens between waves.** When a wave clears, a brief "WAVE COMPLETE!" toast plays, then the shop pops up. The next wave only starts when the player closes the shop — there is no countdown. A SHOP button in the top-right HUD (next to the pause button) lets the player jump in mid-wave at any time.

The shop is fullscreen with a transparent backdrop matching the pause menu — game world stays faintly visible behind. The whole UI is HTML (`#shop-overlay`) — tabs, items, sell buttons, and the scroll list are real DOM elements sharing CSS conventions with the pause menu. Close with the X button or ESC; both return to the pause menu.

---

## Wave System

### Structure
100 hand-designed waves across 5 acts:

| Act | Waves | Theme |
|-----|-------|-------|
| I — First Contact | 1-15 | Solo enemy introductions |
| II — Escalation | 16-30 | Themed duo encounters |
| III — The Gauntlet | 31-50 | Synergistic trios |
| IV — War Zone | 51-75 | Quad+ combos, specialty waves |
| V — Endgame | 76-100 | Full-spectrum chaos |
| Beyond | 101+ | Procedurally scaled from wave 100 |

Each wave features:
- Asteroid phase with fixed count (MAX_WAVE_ASTEROIDS = 12)
- Enemy sub-waves with increasing variety and difficulty
- Wave transition messages with pithy subtitles
- Shop access between waves

Enemy health and damage scale with wave number. Enemy levels increase with wave progression.

---

## Visual & Audio

### Juice Systems (v5.2+)
- **Hitstop**: Brief freeze on kills (4-8 frames for enemies, 15 for player death)
- **Camera kick**: Directional lurch with exponential decay (7-25px)
- **Screen flash**: Additive white overlay on kills
- **Shockwave rings**: Staggered explosion rings on death (3 rings, 50ms apart)
- **Directional shrapnel**: 16-24 colored streaks in entity color
- **Lingering embers**: 10-16 slow-drifting glowing dots
- **Hull fragmentation**: Player ship breaks into 12 line-debris pieces on death
- **Death hierarchy**: Player death is the most dramatic effect (longer hitstop, bigger shake, multiple camera kicks)

### Visual Effects
- Parallax starfield with depth layers (55% blue-white, 25% white, 12% warm, 8% orange-red)
- Nebula background (pre-rendered, no per-frame cost)
- Hull outline glow on player ship (cyan, dims/brightens with thrust)
- Non-rotating hit flash with debris squares
- Particle systems for explosions, thrust trails, and impacts
- Damage numbers with parabolic trajectory
- Off-screen enemy indicators (red halo glow)
- Powerup indicators with remaining time, stack count, and name

### Audio
- **68 background music tracks** spanning chiptune, synthwave, and electronic
- **Curated futuristic SFX library** — 26 hand-tuned multi-layer WAVs (~900 KB), pre-rendered offline from stacked SFXR voices (sub-bass body + mid carrier + HPF brightness layer) and decoded once via WebAudio
- Built-in music player with playlist support
- Individual sound effect toggles and volume control

---

## Getting Started

### Playing Online
Visit https://rainboids.cat.computer in any modern browser.

### Local Development
```bash
git clone https://github.com/user/rainboids.git
cd rainboids
npm install
npm run dev        # Vite dev server on port 8090
```

### Build for Production
```bash
npm run build      # Output to dist/
npm run preview    # Preview production build
```

### Browser Requirements
- Modern browser with ES6 module support
- Canvas 2D support (no WebGL required)
- Web Audio API for sound effects

---

## Testing

Rainboids has a comprehensive test suite:

```bash
npm run test:unit         # 68 Jest unit tests (pool, wave, math)
npm run test:qa           # 92 Playwright smoke tests
npm run test:e2e          # Full E2E suite (menu, HUD, weapons, enemies, powerups, waves)
npm run test:e2e:enemies  # All 10 enemy type tests
npm run test:e2e:survival # 2-minute AI survival run
npm run perf              # Microbenchmarks (mitata)
npm run perf:compare <refA> <refB>  # Compare performance between git refs
npm run report:allure     # Generate Allure HTML report
```

Includes an **AI playtester** (`tests/helpers/game-ai.js`) — a reactive bot that pilots the ship, engages enemies, and detects stuck states and invariant violations.

---

## Project Structure

```
├── index.html                 # Game entry point
├── vite.config.js             # Vite build configuration
├── package.json               # Dependencies and scripts
├── VERSION                    # Current semantic version
├── CHANGELOG.md               # Full version history
├── CLAUDE.md                  # Claude Code project instructions
├── js/
│   ├── main.js                # Game initialization
│   ├── playlist-data.js       # Music playlist configuration
│   └── modules/
│       ├── game-engine.js     # Game loop orchestrator
│       ├── core/              # Foundation infrastructure
│       │   ├── constants.js   #   Game config, states, tuning constants
│       │   ├── utils.js       #   Utility functions (math, collision, noise)
│       │   ├── frame-clock.js #   Monotonic frame clock singleton
│       │   ├── color-cache.js #   RGBA string caching
│       │   ├── pool-manager.js #  O(1) object pooling system
│       │   ├── game-state.js  #   State machine with transition validation
│       │   ├── event-bus.js   #   Lightweight synchronous pub/sub
│       │   └── game-timer.js  #   Frame-counted timers (freeze during pause/shop)
│       ├── player/            # Player entity and subsystems
│       │   ├── player.js      #   Player entity (movement, update, draw orchestration)
│       │   ├── weapons.js     #   35 weapon methods (primary + power fire, charging, equip)
│       │   ├── skills.js      #   5 defense skill methods
│       │   ├── progression.js #   18 leveling, powerup, stat methods
│       │   ├── renderer.js    #   5 player draw methods
│       │   ├── lifecycle.js   #   Damage, death, respawn, shield tanks
│       │   └── bullet.js      #   Player projectile entity
│       ├── enemy/             # Enemy entity and subsystems
│       │   ├── enemy.js       #   Enemy entity (10 types, update/draw orchestration)
│       │   ├── enemy-data.js  #   ENEMY_TYPES config for all 10 enemy types
│       │   ├── movement.js    #   36 enemy movement strategies
│       │   ├── firing.js      #   38 enemy firing/shooting functions
│       │   ├── ai.js          #   21 enemy AI, evasion, territory functions
│       │   ├── shapes.js      #   25 enemy shape renderers and visual effects
│       │   └── enemy-bullet.js #  Enemy projectile entity
│       ├── hud/               # HUD rendering (split by domain)
│       │   ├── index.js       #   Barrel re-export
│       │   ├── status.js      #   Health bar, lives, level/coins, XP, skill cooldowns
│       │   ├── combat.js      #   Damage numbers, target info, powerups, money pickup
│       │   ├── navigation.js  #   Minimap, off-screen enemy indicators
│       │   ├── overlays.js    #   Title screen, wavy text, timers, respawn, ghosts
│       │   └── cursor.js      #   Crosshairs, targeting cursor, jitter, charge timer
│       ├── world/             # Game world entities and environment
│       │   ├── asteroid.js    #   Asteroid entity (3D wireframe, splitting)
│       │   ├── particle.js    #   Particle entity (explosions, sparks, etc.)
│       │   ├── color-star.js  #   Collectible orbs (health, money)
│       │   ├── background-star.js # Parallax starfield
│       │   ├── line-debris.js #   Wireframe debris fragments
│       │   ├── powerup.js     #   Powerup pickup entity
│       │   └── camera-manager.js # Camera follow, screen shake, kick, flash
│       ├── combat/            # Combat pipeline
│       │   ├── collision-system.js  # All collision detection and response
│       │   ├── combat-manager.js    # Debris, orbs, powerups, kill streaks, damage numbers
│       │   ├── weapon-data.js       # Weapon definitions and upgrade trees
│       │   └── weapon-effects-renderer.js # Weapon/skill visual effects
│       ├── wave/              # Wave system
│       │   ├── wave-manager.js #  Wave lifecycle, spawning, notifications
│       │   └── wave-data.js   #   100 wave definitions across 5 acts
│       ├── shop/              # Shop system
│       │   ├── shop-manager.js #  Shop logic, purchases, tab builders
│       │   ├── shop-dom.js     #  HTML overlay renderer (active)
│       │   └── shop-renderer.js # (Legacy canvas renderer — unused)
│       ├── audio/             # Audio pipeline
│       │   ├── audio-manager.js # WebAudio playback of pre-rendered WAV variants
│       │   ├── sound-defs.js   #   Source-of-truth SFX registry (presets + custom params)
│       │   └── music-player.js #  Background music player with playlist
│       ├── ui/                # DOM UI and input
│       │   ├── ui-manager.js  #   DOM-based UI (pause menu, shop button, lives)
│       │   ├── input-handler.js # Keyboard + mouse input (desktop-only build)
│       │   └── event-setup.js #   All event listeners: input, shop, cheats, resize
│       ├── performance/       # Spatial grid, depth-batch-renderer, nebula renderer
│       └── debug/             # VFX telemetry (per-frame effect state recording)
├── css/
│   └── styles.css             # Game styling
├── music/                     # 58 MP3 tracks (~336MB)
├── sfx/                       # Pre-rendered SFX library (one .wav per sound)
│   ├── manifest.json          #   Sound name → file URL
│   └── <sound-name>.wav       #   Layered SFXR renders (regenerate via npm run generate-sfx)
├── deprecated/                # Orphan modules retained for reference (no importers)
│   └── js/modules/performance/  # Pre-spatial-grid perf experiments
├── docs/                      # Planning docs, analysis, and research
│   ├── REFACTOR.md            #   Architecture plan, coding rules, extraction status
│   ├── SKU_deployment.md      #   Multi-platform deployment plan
│   ├── WEAPONS_PLANNING_2026-03-10.md
│   ├── ai-qa-bot-plan.md
│   └── ... (performance analyses, enemy permutations, etc.)
├── tools/                     # Development tools and automation
│   ├── benchmark/             #   Mitata microbenchmark suite
│   ├── ai-qa-bot/             #   AI QA bot for automated playtesting
│   ├── scripts/               #   Playlist generation, SFX generation, utilities
│   └── juice-capture.mjs      #   Juice tuning screen capture
├── tests/
│   ├── unit/                  # Jest unit tests
│   ├── qa/                    # Playwright smoke tests (95 tests)
│   ├── e2e/                   # Playwright E2E suite
│   ├── performance/           # FPS benchmark tests
│   └── helpers/               # Game helpers and AI playtester
└── dist/                      # Production build output
```

---

## Changelog

The full version history is maintained in [CHANGELOG.md](CHANGELOG.md).

<!-- CHANGELOG_START -->
<!--
  The changelog below is automatically included from CHANGELOG.md.
  On GitHub, follow the link above to see the rendered version.
  In-game and in builds, CHANGELOG.md is read directly.
-->
<!-- CHANGELOG_END -->

For a quick summary of recent changes, see the latest entries in [CHANGELOG.md](CHANGELOG.md).

---

## License

This project builds upon the original [Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic) with extensive enhancements and modularization.
