# Rainboids — Supercharged Asteroids

A modern space combat game with deep weapon systems, 10 enemy types, wave-based progression across 100 hand-designed waves, and a full upgrade economy. Built on Canvas 2D.

**Play now at: https://rainboids.cat.computer**

**Current version: see [VERSION](VERSION)**

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/afbf1039-b46c-4717-9aa2-1a8bc4083354" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f1bfe140-5e6b-43df-969d-d1f49427aa02" />

---

## Game Overview

Rainboids is a supercharged asteroids game featuring:
- **5 primary weapons**, **5 power weapons**, and **6 defense skills** with upgrade trees
- **10 unique enemy types** with distinct movement, attack patterns, and visual designs
- **19 powerup types** with stacking mechanics and visual indicators
- **100 hand-designed waves** across 5 acts, plus procedural scaling beyond wave 100
- **Full shop and upgrade economy** with coins and skill points
- **Rich juice systems**: hitstop, camera kick, screen flash, shockwave rings, directional shrapnel
- **58 background music tracks** by Karl Casey @ White Bat Audio
- **Procedural SFX** via SFXR
- **Modular ES6 architecture** — domain managers, extracted renderers, state machine, event bus, and frame-counted timers, built with Vite

---

## Controls

### Desktop
- **Movement**: WASD
- **Aim**: Mouse cursor (ship faces cursor)
- **Fire**: Auto-fire while mouse button held
- **Power weapon**: Right-click
- **Skills**: Number keys (1-6) for equipped defense skills
- **Tractor Beam**: Spacebar (attracts collectibles)
- **Weapon cycling**: Q/E or scroll wheel
- **Pause**: Escape
- **Shop**: Click shop button or use pause menu

### Mobile (partial — movement only)
- **Movement**: Touch and drag (dynamic joystick appears at touch point)
- **Pause**: Touch pause button (top-right)

> Mobile touch controls currently support movement only. Aiming, firing, abilities, and weapon switching are not yet available on touch devices. A full dual-stick control system is planned — see [SKU_deployment.md](docs/SKU_deployment.md#mobile-touch-controls) for details.

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

### Defensive / Utility (10)
| Powerup | Effect per stack |
|---------|-----------------|
| Crit Damage | +10% critical hit damage |
| Shield Boost | Temporary damage reduction |
| Medpack | More health per orb pickup |
| Doctor | Increases max health per orb |
| Payday | More money per orb pickup |
| High Roller | Increases max money per orb |
| Health Orb Drop Chance | +5% health orb drop rate |
| Health Orb Drop Quantity | +1 health orbs per drop |
| Money Orb Drop Chance | +5% money orb drop rate |
| Money Orb Drop Quantity | +1 money orbs per drop |

---

## Shop & Upgrade System

The shop offers permanent upgrades using two currencies:
- **Coins**: Earned by destroying enemies and collecting money orbs
- **Skill Points (SP)**: Gained by leveling up through experience

The shop has six tabs: **Offense**, **Defense**, **Drops**, **Primary Weapons**, **Power Weapons**, and **Defense Skills**, each with their own upgrade trees (54+ upgrades total). Primary weapons unlock for free at wave milestones — spend your coins on upgrades that deepen your build instead.

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
- **58 background music tracks** by Karl Casey @ White Bat Audio
- **Procedural SFX** generated via SFXR
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
│       │   └── shop-renderer.js # Shop window, tabs, items, scrollbar
│       ├── audio/             # Audio pipeline
│       │   ├── audio-manager.js # SFX playback (procedural SFXR)
│       │   └── music-player.js #  Background music player with playlist
│       ├── ui/                # DOM UI and input
│       │   ├── ui-manager.js  #   DOM-based UI (pause menu, shop button, lives)
│       │   ├── input-handler.js # Keyboard, mouse, and touch input
│       │   └── event-setup.js #   All event listeners: input, shop, cheats, resize
│       └── performance/       # Spatial grid, depth-batch-renderer, nebula renderer
├── css/
│   └── styles.css             # Game styling and mobile layout
├── music/                     # 58 MP3 tracks (~336MB)
├── docs/                      # Planning docs, analysis, and research
│   ├── REFACTOR.md            #   Architecture plan, coding rules, extraction status
│   ├── SKU_deployment.md      #   Multi-platform deployment plan
│   ├── WEAPONS_PLANNING_2026-03-10.md
│   ├── ai-qa-bot-plan.md
│   └── ... (performance analyses, enemy permutations, etc.)
├── tools/                     # Development tools and automation
│   ├── benchmark/             #   Mitata microbenchmark suite
│   ├── ai-qa-bot/             #   AI QA bot for automated playtesting
│   ├── scripts/               #   Playlist generation and utilities
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

## Music Credits

Royalty-free background music graciously provided by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/).

Support White Bat Audio:
- [Bandcamp](https://karlcasey.bandcamp.com/)
- [YouTube](https://www.youtube.com/@WhiteBatAudio)

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

Music provided by Karl Casey @ White Bat Audio under royalty-free license.
