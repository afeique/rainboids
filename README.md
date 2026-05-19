# Rainboids — Supercharged Asteroids

A modern space combat game with deep weapon systems, 10 enemy types, a **10-stage / 30-wave speedrun campaign** (1-1 / 1-2 / 1-3 → 2-1 …) with bosses on every stage final, survivor-card powerup picks on every stage clear (boss waves grant a bonus pick on top), a Diablo-style 5-slot defensive inventory with rarity-tiered rolled stats, a unified gold-only shop (POWERUPS / INVENTORY / per-weapon upgrades, all in one menu), and a desperation-curve health-drop system. Built on Canvas 2D with a WebGL2 particle layer for bright/glowing effects.

## Screenshots

<img width="1280" height="720" alt="00-title-screen" src="https://github.com/user-attachments/assets/74c7c388-5992-4651-930d-1ad24d62023c" />

<img width="1280" height="720" alt="action-01-wave-skirmish" src="https://github.com/user-attachments/assets/42957ad6-1ea3-47e8-8fcb-ee486058f442" />

<img width="1280" height="720" alt="action-03-low-health-clutch" src="https://github.com/user-attachments/assets/bd69cd27-915b-4dc6-b962-3b3d7b7b6ed8" />

<img width="1280" height="720" alt="starfield-3" src="https://github.com/user-attachments/assets/a585c1de-0197-47ef-8361-3441687d3606" />



## Play Now

Visit **[rainboids.cat.computer](https://rainboids.cat.computer)** in any modern browser on a desktop or laptop.

### Plays on desktop and mobile

Rainboids runs on both **desktop / laptop** (mouse + keyboard) and **mobile / tablet** (touch). The mobile build (5.98.0) is a **turret-defense RPG** — same RPG progression as desktop (weapon upgrades, damage multipliers, kill streaks, XP and level matter) but with a stationary ship and press-and-hold touch controls:

- **The player is stationary.** Movement input is gated off entirely — the ship holds position and the player only aims + fires. The viewport is stable since the camera tracks a fixed point at the field centre.
- **Press-and-hold to fire, drag to aim (5.97.0)**. Press anywhere on the canvas to start continuous primary fire; **drag** the finger across the screen to retarget every frame as the ship rotates to track the touch; release to stop firing. The equipped power weapon auto-fires the instant it's ready / fully charged. Touches within ~48 px of an entity's centre snap aim to that entity. Shots do **normal damage** (RPG progression) with an early-wave damage ramp (3.0× on wave 1, decaying to 1.0× by wave 6) so the first couple of waves are killable in 1-2 shots while the player learns the controls.
- **Survivable early game (5.98.0).** Incoming damage on mobile is multiplied by a wave-based curve — 0.25× on wave 1, 0.35× wave 2, 0.50× wave 3, ramping back to 1.0× by wave 6. Pairs with the outgoing-damage ramp so the first few waves feel forgiving while the player adapts.
- **Random powerup pick on wave clear (5.98.0).** Instead of opening the pause menu with +1 SP to spend, mobile wave-clear shows a 3-card random-powerup overlay. Tap a card to claim a free stack and continue to the next wave. SP only comes from level-ups on mobile.
- **Permanent stat drops (5.98.0).** Mobile-only rare drops from enemy kills: **HP_UP** (cyan, permanent +5 max HP) and **TOUGHNESS** (amber, permanent +3% damage reduction). Boss kills triple the rates. Stack indefinitely (subject to the 75% shield cap).
- **Full-screen drop magnet (5.98.0).** All drops — gold, health, stat pickups — fly to the stationary player from anywhere on the visible screen on mobile (3000 px radius, snappy pull force). Desktop magnet behavior is unchanged.
- **Dynamic parallax background (5.97.0).** The starfield drifts during play via a synthetic sum-of-sines so the world feels alive even though the ship is fixed.
- **Camera zoom-out (5.96.0)**. The world transform scales by `0.65` in portrait and `0.8` in landscape, so a phone-sized viewport shows MORE of the playfield per pixel. Player ship + enemies appear smaller; the field is more navigable on a 400-px-wide screen. Desktop stays at `1.0` (no zoom).
- **Top-left HUD restored (5.96.0)**. Health bar, triforce (spare-tank visualization), and XP/level are visible on mobile again — they're essential for an RPG. The 5.92.0 simplification still hides the secondary loadout squares, gold readout, and survival timer.
- **Enemies kamikaze, don't shoot (5.95.0).** All 10 enemy types divebomb the player every tick. None of them fire bullets in mobile mode — the player never has projectiles to dodge. Contact damage still applies when an enemy reaches the ship.
- **Auto-magnet drops (5.95.0).** Health orbs and gold coins fly to the player automatically with a generous attraction radius (~600 px for health, ~400 px for gold). No MAGNET upgrade required.
- **Smaller asteroids (5.95.0 → 5.95.1).** Asteroid spawn radius is capped at 36 px on landscape-mobile and 28 px on portrait-mobile. Combined with the camera zoom-out the playfield reads much less cluttered.
- **PRM and PWR side buttons (5.94.0).** Two square 64×64 buttons sit on the left and right edges of the canvas, vertically centred. Tap **PRM** (left) to open the primary-weapon radial; tap **PWR** (right) to open the power-weapon radial. The long-press radial gesture from 5.91–5.93 was removed in favor of these dedicated buttons.
- **Responsive layout** (5.92.0) — the title screen stacks NEW GAME / CONTINUE / MULTIPLAYER vertically in portrait and keeps the side-by-side layout (at a slightly smaller scale) in landscape. Title text auto-shrinks to fit phone-sized viewports. The pause menu's tab/action-button text shrinks proportionally in portrait so labels fit within bounds (5.94.0). The Controls tab fits in narrow portrait viewports too (5.95.0).

Force a specific mode for testing with the URL: `?mobile=1` enables mobile mode on a desktop, `?mobile=0` disables it on a touch device.

## Version and History

Current version: **6.22.0**

See **[CHANGELOG](CHANGELOG.md)** for recent changes and version history.

---

## Game Overview

Rainboids is a supercharged asteroids game featuring:
- **5 primary weapons** and **5 power weapons** — both free, both selectable from the start (pause-menu PRIMARY / POWER tabs); spend coins on per-weapon upgrades in the shop. Phase Dash is a core **Shift-key** movement primitive available to every player at all times. *(5.101.0 — the defensive skill system was retired; defensive progression now flows through powerups + survivor cards + the inventory.)*
- **10 unique enemy types** with distinct movement, attack patterns, and visual designs. Enemy visuals stay at base size at every wave (5.101.0) — only HP / damage / speed scale.
- **Offensive + defensive powerups** with stacking mechanics and visual indicators — offense (Rapid Fire, Multi Shot, Homing, Big Bullets, Piercing, Explosive, Crit Chance, Crit Damage, Knockback) and defense (Health Boost, Toughness, Regen, Vampirism, Thorns, Guardian, Phase Echo) PLUS a full **health-drop family**: Triage, Lucky Drops, Field Rations, Triage Surge, Combat Medic, Salvage Plating, Triage Net, Adrenal Reserve, Field Surgeon, Blood Bank. **Buy with GOLD** in the unified shop's POWERUPS tab (6.1.0 — moved from pause menu) any time.
- **Survivor cards every stage clear (6.1.0)** — clearing waves 3 / 6 / 9 / … / 30 opens a 3-card overlay (2 offense + 1 defense) for a free pick. Followed by a 3-card QUICK BUY overlay listing weapon upgrades tailored to the equipped primary + power. **Stage finals are boss waves, and each grants a BONUS random powerup on top of the survivor card.** Mid-stage clears (1-1 / 1-2 / 2-1 / 2-2 / etc.) give just a brisk gold bonus + WAVE CLEAR toast.
- **Diablo-style 5-slot inventory with rolled rarities (6.0.0)** — helm, armor (HP), shield, plating (toughness), and the new **trinket** slot (regen primary). Items drop in three rarities — common / rare / **epic** — with rolled primary stats (epic ≈ 2× common at the same wave). Glow color signals tier from across the screen. **Drop suppression**: only items that are a strict upgrade over the equipped slot spawn as pickups, so anything visible is worth chasing. Auto-equip on contact; no menu interruption.
- **Kill-streak damage tiers** — 20-tier ladder firing every 10 kills, ordered by epicness from EMPOWERED (10 kills, +25%) to RAINBOIDS GOD (200 kills, +200%). Five narrative bands of four tiers each: Momentum (EMPOWERED → RELENTLESS → UNSTOPPABLE → INDOMITABLE) → Mortal-extraordinary (OUTRAGEOUS → HERCULEAN → LEGENDARY → MYTHIC) → Divine (IMMORTAL → GODLIKE → INVINCIBLE → ETERNAL) → Cosmic (APOCALYPTIC → ASTRONOMICAL → GALACTIC → COSMIC) → Beyond physical (TRANSCENDENT → OMNIPOTENT → INFINITE → RAINBOIDS GOD). Streak resets when you take damage. LEGENDARY (70 kills) and every tier above also grants auto-explosive splash on every shot.
- **10-stage / 30-wave speedrun campaign (6.1.0)** — `1-1` → `10-3`. Every stage final is a boss (10 bosses total). Game Complete stats screen at the end. Each stage typically introduces a new enemy type, with the boss + escort showcasing the stage's headliners.
- **Unified gold-only shop (6.1.0)** — one menu, opened by the prominent SHOP button at the top of the pause menu (or the 🛒 HUD button). Tabs: **POWERUPS** (every powerup, gold-priced), **INVENTORY** (read-only 5-slot equipped display), per-weapon upgrade trees (PULSE / NEEDLES / SCATTER / RAIL / LANCE / CHARGE / MINES / NOVA / MISSILES / ARC), and HELP. No SP, no XP, no player level.
- **Desperation drop curve (6.0.0)** — health-drop chance scales up quadratically as the player loses HP. Below 25% HP the cooldown floor halves. At full HP it's a no-op; at 10% HP with maxed TRIAGE_SURGE the player sees roughly 4× the normal drop rate. Resets when an energy tank pops.
- **Save / Continue** (5.79.0): wave-start auto-save lets the player resume from the title screen's **CONTINUE** button. **NEW GAME** rolls a randomized starting loadout (primary, power, skill) and clears the save.
- **Diablo-style stats screen** (5.79.0): press \` to pause and inspect vitals / offense / economy / world-scaling with hover tooltips explaining every formula. (6.0.0 — level / XP rows removed since leveling is retired.)
- **Persistent volume settings** (5.79.0): music + SFX sliders save to localStorage.
- **Rich juice systems**: hitstop, camera kick, screen flash, shockwave rings, directional shrapnel
- **73 background music tracks** spanning chiptune, synthwave, and electronic — including 10 royalty-free tracks graciously provided by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/) ([YouTube](https://www.youtube.com/@WhiteBatAudio))
- **Curated futuristic SFX library** — every sound is a 2–3 layer SFXR composition (sub-bass + mid carrier + HPF transient), pre-rendered to 47 WAVs; granular hit sounds per enemy bullet pattern, per player primary weapon, and per enemy-type destruction (10 ships, each with a unique destruction signature), plus per-skill activation accents and a UI click tick
- **Modular ES6 architecture** — domain managers, extracted renderers, state machine, event bus, and frame-counted timers, built with Vite

---

## Controls

### Desktop (mouse + keyboard)

- **Movement**: WASD
- **Dash**: Shift (5.93.0) — 135 px burst over 250 ms, 1.5 s cooldown, brief i-frames during the burst. Dashes in the current movement direction if you're thrusting, otherwise in the aim direction. Pure movement primitive — works in singleplayer and multiplayer.
- **Aim**: Mouse cursor (ship faces cursor); ←/→ arrows rotate the aim at a constant rate. A red laser-pointer beam shows where your next primary shot will land — with a tick at the bullet's max range, a reticle around the first enemy/asteroid in line, and fading reticles around any further targets piercing builds will punch through. (Desktop-only since 5.95.1.)
- **Fire primary**: Hold left-click or ↑ arrow
- **Fire / charge power weapon**: Spacebar, right-click, or ↓ arrow
- **Pick primary weapon (radial menu)**: Hold F — aim with mouse, click to equip, release to cancel
- **Pick power weapon (radial menu)**: Hold E — same flow
- **Assists** (pause menu → ASSISTS tab — persisted): Aim Assist (cursor snap to nearest target), Auto Aim (lock onto nearest threat), Auto Fire (auto-trigger primary + power)
- **Switch primary weapon**: Pause menu → PRIMARY tab (all 5 free, click to equip)
- **Switch power weapon**: Pause menu → POWER tab (all 5 free, click to equip)
- **Defensive progression**: pause-menu POWERUPS tab (Health Boost, Toughness, Regen, Vampirism, Thorns, Guardian, Phase Echo, plus the new health-drop family — all bought with GOLD), inventory (auto-equip from drops, 5 slots including the new trinket), and the per-wave survivor card overlay plus boss-wave bonus pick. *(6.0.0 — player leveling, XP, and SP fully retired. Defensive skills retired in 5.101.0; the SKILLS tab and Q/R key bindings are no-ops.)*
- **Shop**: 🛒 button in the top-right of the HUD, or in the pause menu
- **Pause**: Escape

### Mobile (touch) — turret-defense RPG (5.98.0)

- **Movement**: None. The player ship is **stationary**. Position is locked at the Player.update level; velocity stays at 0.
- **Aim + fire (press-and-hold, 5.97.0)**: Press anywhere on the canvas to start continuous primary fire — the ship rotates to face the finger and the primary weapon fires at its native rate while you hold. **Drag** the finger across the screen to retarget every frame; the ship tracks the finger like a turret. Release to stop firing. The equipped power weapon auto-fires the instant it's ready/fully charged. Touch points within ~48 px of an entity's centre snap to that entity. Shots do **normal damage** (RPG progression) plus a temporary **early-wave damage ramp** (5.97.0): wave 1 = 3.0×, wave 2 = 2.3×, wave 3 = 1.7×, ramping back to 1.0× by wave 6 so the first few waves are killable in 1-2 shots while the player learns the controls.
- **Survivable early game (5.98.0)**: Incoming damage is reduced on mobile by a wave-based curve — wave 1 = 0.25×, wave 2 = 0.35×, wave 3 = 0.50×, wave 4 = 0.65×, wave 5 = 0.80×, wave 6+ = 1.0× (no reduction). Applied AFTER shield% reduction so SHIELD_BOOST upgrades still scale on top.
- **3-card wave-clear pick (5.98.0)**: On wave clear, instead of opening the pause-menu POWERUPS tab, a full-screen `#wave-pick-overlay` shows three random non-maxed powerup cards. Tap a card to claim a free stack and resume into the next wave. If every powerup is maxed, the overlay auto-falls-through (no dead-end). SP on mobile only comes from level-ups (wave clear and mission completion no longer award SP).
- **Permanent stat drops (5.98.0)**: Two new rare pickup types drop from enemy kills (mobile only): **HP_UP** (cyan +heart, ~0.8% normal / 2.4% boss) gives permanent +5 max HP and +5 current HP; **TOUGHNESS** (amber +sigil, ~0.6% / 1.8%) gives permanent +3% damage reduction. Cap with the rest of the shield formula at 75%. Stat drops use the same full-screen magnet so they fly to the stationary player.
- **Full-screen drop magnet (5.98.0)**: All drops — gold coins, gold shapes, health orbs, stat pickups — magnet from anywhere on the visible playfield. Mobile far radius bumped 600 → 3000 px (health) and 400 → 3000 px (gold). Pull force bumped to 18-40 (health) and 32-60 (gold) so drops actually *fly* rather than gently drift.
- **Dynamic parallax background (5.97.0)**: Even though the ship is stationary, the starfield wanders during play via a synthetic drift (a tamer version of the title-screen sandstorm sum-of-sines). Near-depth stars drift more than far ones, so the playfield reads as alive instead of frozen.
- **Camera zoom-out (5.96.0)**: The world transform applies `scale(zoom, zoom)` around the canvas centre — `0.65` in portrait, `0.8` in landscape, `1.0` on desktop. The visible window in world coords grows by `1/zoom`, so MORE of the field fits on a phone-sized viewport. `screenToWorldCoordinates`, `isEntityOnScreen`, `getVisibleStars`, and the camera clamp all honour the zoom, so tap-to-aim, collision, off-screen culling and snap-to-entity all still work. Zoom is recomputed on resize / orientation flip via `_refreshCameraZoom()`.
- **Top-left HUD restored (5.96.0)**: Health bar, triforce (spare-tank visualization), and XP/level are visible on mobile again — they're essential for an RPG. The 5.92.0 simplification still hides the secondary loadout squares, gold readout, and survival timer.
- **Enemies don't fire on mobile (5.95.0 → 5.95.1)**: All 10 enemy types have their firing branch suppressed in mobile mode — both the sim-layer `decideEnemyShooting` path and the legacy wrapper `Enemy.updateShooting` + inline Weaver spiral-laser paths. The player never has projectiles to dodge.
- **Enemies divebomb + zigzag (5.95.0 → 5.95.1)**: Every non-boss enemy gets a strong velocity bias toward the player each tick (`MOBILE_KAMIKAZE_FORCE = 2.5` px / tick) plus a per-tick random-walk perturbation that reads as evasive motion. Velocity is hard-capped at `MOBILE_MAX_KAMIKAZE_SPEED = 6.0` px / tick so the cumulative pull doesn't fling enemies off-screen. Contact damage on collision destroys the ramming enemy.
- **Aiming reticle at touch (5.95.1)**: A 24-px cyan crosshair tracks the last-touched canvas coordinate. The desktop laser-pointer aim trace is hidden on mobile (replaced by the reticle).
- **Aim assists disabled (5.95.1)**: Auto Aim / Aim Assist / Auto Fire all force-off on mobile — the tap-to-aim input model is intentionally hands-on. (Desktop assists still work.)
- **Asteroids are small (5.95.0 → 5.95.1)**: Spawn radius is capped at 36 px on landscape-mobile and **28 px on portrait-mobile** (vs 30–60 px on desktop). Split fragments use the same per-orientation cap. Enemy spawn radii also multiply by 0.7 in portrait-mobile so the playfield feels less crowded on narrow displays. Combined with the 5.96.0 camera zoom-out, the playfield reads much less cluttered.
- **Auto-magnet drops (5.95.0)**: Health orbs use a 600 / 240 px far/near magnet (vs 320 / 120 on desktop). Gold coins and gold shapes get a new 400 / 80 px mobile-only proximity pull on top of the desktop tractor-beam path. No MAGNET upgrade required.
- **Power weapon (auto-fire, 5.92.0)**: Even without a tap, the equipped power weapon fires automatically as soon as it's ready — cooldown weapons the instant their cooldown clears; the Charge Shot the instant it's fully charged. Tap-fire and auto-fire pathways are idempotent.
- **PRM and PWR side buttons (5.94.0)**: Two square 64×64 buttons flank the canvas — PRM (left) opens the primary-weapon radial; PWR (right) opens the power-weapon radial. The radials read the live touch position for wedge hover and commit on release.
- **Bottom button bar (5.92.0)**: SHOP / STATS / PAUSE buttons centered along the bottom of the screen. Direct tap routes to the matching action — they do not fall through to fire-a-shot.
- **Responsive title (5.92.0 → 5.97.0)**: NEW GAME / CONTINUE / MULTIPLAYER stack vertically in portrait, sit inline in landscape. **5.97.0** tightens font caps roughly a third across every full-screen overlay: title (RAINBOIDS) 48 → 36 px portrait cap, Game Over title 72 → 40 px portrait cap with vertical button stack, Wave Intro 120 → 46 px portrait cap, Game Complete responsive. Pause / shop DOM panels scale at 0.82 (was 0.92). Pause menu tab + action-button labels shrink in portrait (5.94.0); the Controls tab fits in portrait (5.95.0).

### Cheat Codes
- **`[`**: +1000 Gold
- **`]`**: +5 SP
- **`P`**: Spawn a random powerup at a random on-screen point (≥250 px from the player so you have to fly to it)
- For full dev access, drive cheats from the browser console (`window.gameEngine.cheats.onePunchMan = true`, etc.)

---

## Weapons & Skills

### Primary Weapons (6)
Primary weapons are free — they auto-unlock at wave milestones as you progress:

| Icon | Weapon | Unlocks | Description |
|------|--------|---------|-------------|
| 🔫 | Pulse Cannon | Start | Reliable stream of energy shots |
| 🌧️ | Storm Needles | Wave 3 | Rapid tiny shots — saturation fire |
| 💥 | Scatter Gun | Wave 5 | Shotgun burst, devastating up close |
| ⚡ | Arc Lightning | Wave 5 | Continuous lightning tether — frayed forward static when out of range, focused beam when locked on (range 360 px, 5.79.0) |
| 🧬 | Rail Driver | Wave 8 | Slow, powerful piercing rail — fires a double-helix pair |
| 🔦 | Lance Beam | Wave 12 | Continuous beam tether — stops at first hit |

### Power Weapons (4)
| Icon | Weapon | Description |
|------|--------|-------------|
| 🔋 | Charge Shot | Hold to charge, release for powerful blast |
| 💣 | Mine Layer | Drop proximity mines |
| 💫 | Nova Blast | Expanding damage ring |
| 🚀 | Missile Salvo | Homing missiles seek targets |

### Defense Skills (5)
*5.93.0 — Phase Dash was promoted out of the defense-skill pool and is now a core movement primitive on the **Shift** key (see Controls above). Five defense skills remain.*

| Icon | Skill | Description |
|------|-------|-------------|
| 🛡️ | Bulwark | 50% damage resistance for 4s |
| 💚 | Repair Nanites | Regen 3 HP/s for 5s |
| 🔮 | Deflector Orbs | Orbiting orbs block bullets for 5s |
| 📡 | EMP Pulse | Stun nearby enemies for 2s |
| 🧲 | Tractor Shield | Forward shield absorbs bullets for coins |

---

## Enemy Types

### Hunter (Triangle) — Red
Predator that orbits the player one direction (CW or CCW per spawn) on a vortex-paced arc — angular speed accelerates on one side and decelerates on the other, with a perpendicular weave that snakes the path. Periodic slingshot contractions tighten the orbit to ~130 px before snapping back, and frequent lunges (~one per 4 s) dive straight at the player. Fires tight 3-shot rapid bursts of oversized red triangle projectiles every 600 ms (high-level), pausing only between bursts. Second-fastest non-boss; demands active dodging.

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

**5.70.0 redesign — picks-only.** Powerups no longer drop from kills. The player earns **Powerup Picks** (a new currency: +1 per wave clear, +1 per level-up) and spends them in the shop's **POWERUPS** tab on whichever powerup they want. Every powerup is purchasable, so each run becomes a deliberate, custom build. Picks accumulate; killing asteroids matters because XP feeds level-ups, which grant more picks.

Per-powerup `maxStacks` limits still apply. Picks-currency items are non-refundable (no SELL button) — keeps the build choice meaningful.

### Offensive (9)
| Icon | Powerup | Effect per stack |
|------|---------|-----------------|
| ⚡ | Rapid Fire | +25% fire rate (max 5 stacks) |
| ✳️ | Multi-Shot | +1 bullet per shot (max 3 stacks) |
| 🎯 | Homing | Bullets track enemies |
| 🏹 | Piercing | Bullets penetrate through multiple enemies |
| 💣 | Explosive | Area damage on impact |
| 🔵 | Big Bullets | +30% bullet size |
| 💨 | Speed Boost | +50% thrust and top speed |
| 🏹 | Long Range | +40% bullet range |
| ⭐ | Crit Chance | +5% critical hit chance |

### Defensive / Utility (3)
| Icon | Powerup | Effect per stack |
|------|---------|-----------------|
| 🗡️ | Crit Damage | +10% critical hit damage |
| 🛡 | Shield Boost | Temporary damage reduction |
| ⏳ | Triage | -5s on the global health-orb drop cooldown (60s base → 30s floor at 6 stacks) |

### Drop Economy — Auto-Scales With Player Level (5.78.2)
The DROPS-category powerups (Medpack, Doctor, Payday, High Roller, Health/Money Drop Chance / Quantity) were removed in 5.78.2. The drop economy now scales **automatically with player level** instead of being bought as discrete picks:
- **Drop rate**: +1.5%/level past 1 (level 20 → +28.5% on top of the base + entity bonuses).
- **Drop quantity ceiling**: +1 max orb every 5 levels (L5 +1, L10 +2, L15 +3, L20 +4).
- **Health orb amount**: +0.6 HP/level on the floor, +0.75 HP/level on the ceiling.
- **Money orb amount**: +3 / +5 per level on min/max (Gold Find still applies on top).

### Player Damage — Static (5.79.0 Reset)
Player base damage **does NOT scale with player level**. The 5.78.2 `+4%/level` curve was reverted in 5.79.0 — DPS growth comes exclusively from shop upgrades, CRIT_CHANCE / CRIT_DAMAGE, RAPID_FIRE / MULTI_SHOT / BIG_BULLETS / PIERCING / EXPLOSIVE / LONG_RANGE / HOMING, and the kill-streak damage tier. To compensate, enemy and asteroid level scaling was steepened (enemy HP +0.22/lvl, dmg +0.30/lvl; asteroid HP +0.35/lvl, collision dmg +0.30/lvl). High-wave encounters require building DPS through the shop, not coasting on level-ups.

### Pickup Magnetism
**Money orbs** use the strong three-tier magnetic pull (always-on long-range homing, stronger inside 100 px, magnetic snap inside 40 px). Tractor-beam key adds an extra long-range pull. **Green health orbs** (5.71.0 redesign) drift gently toward the player with the powerup-style soft magnet (same three-tier shape, 0.55× scale) and have a `life` countdown that fades them out before pool release — mechanically identical to powerup pickups. The player still has to commit toward the orb to collect it quickly; if they ignore it, it expires. Health-orb drops are still globally throttled (default 60 s between drop events) — see the Triage shop upgrade.

### Drop Sizes
Money and green orbs are size-capped (`HEALTH_ORB_SIZE_MAX = 1.4`, `MONEY_ORB_SIZE_MAX = 1.6`). When a drop's reward budget exceeds the per-orb cap (`HEALTH_ORB_MAX_HEAL_PER_ORB = 2`, `MONEY_ORB_MAX_MONEY_PER_ORB = 20`), the drop is split into many small orbs that sum to the same total — preventing a single huge orb from dominating the screen.

---

## Kill Streak System

Stack consecutive enemy kills without taking damage to climb a four-tier damage buff. The buff timer (4 s) refreshes on every new kill while alive; the streak count itself **only resets when the player takes damage**. Shift-key dash i-frames preserve the streak (5.93.0 — was Phase Dash); Bulwark damage reduction does not.

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

The shop has six tabs: **Help**, **Powerups**, **Primary**, **Power**, **Defense**, and **Timer**. The shop opens automatically between waves AND on level-up (5.71.0). If the player has unspent **Powerup Picks**, the **Powerups** tab is the default landing tab; otherwise the shop lands on a random purchasable tab. **Powerups** (5.70.0) is picks-priced — every powerup is purchasable, 1 Pick each, with per-powerup `maxStacks` limits. **Primary** and **Power** are gold-priced and show upgrades for whichever weapon is currently equipped (selection happens in the pause menu — see Controls above). Switching weapons in the pause menu instantly repopulates the shop with that weapon's upgrades. **Defense** is SP-priced (survivability — note: SPARE_SHIP retired in 5.88.0 with the lives system; energy tanks now act as the safety net). **Timer** (5.71.0) is info-only — shows the live run timer plus the speedrun multiplier tiers (GODLIKE 5× under 5 min, LEGENDARY 4× under 7:30, …, CASUAL 1.5× under 20 min). The three spendable currencies — **Gold**, **SP**, and **Picks** (big pink `+`) — show in the shop header.

**The shop auto-opens between waves.** When a wave clears, a brief "WAVE COMPLETE!" toast plays, then the shop pops up. The next wave only starts when the player closes the shop — there is no countdown. A SHOP button in the top-right HUD (next to the pause button) lets the player jump in mid-wave at any time.

The shop is fullscreen with a transparent backdrop matching the pause menu — game world stays faintly visible behind. The whole UI is HTML (`#shop-overlay`) — tabs, items, sell buttons, and the scroll list are real DOM elements sharing CSS conventions with the pause menu. Close with the X button or ESC; both return to the pause menu.

---

## Wave System

### 30-wave speedrun campaign (5.101.0)
The campaign is a single 30-wave run with six scripted boss waves. The meta-goal is finishing as fast as possible — total time, accuracy, damage dealt, and preferred weapon are tallied on a Game Complete screen when wave 30 falls.

| Act | Waves | Theme |
|-----|-------|-------|
| I — First Contact     | 1-4   | Gentle intro, low threat density |
| **Boss — Iron Giant** | **5** | **TITAN bossTier 1 + escort** |
| II — Escalation       | 6-9   | Combined arms, type variety |
| **Boss — Twin Iron**  | **10** | **2× TITAN bossTier 2** |
| III — The Gauntlet    | 11-14 | Full type roster, dense |
| **Boss — Triple Threat** | **15** | **3× TITAN bossTier 3** |
| IV — Endgame Approach | 16-19 | Everything at once |
| **MID BOSS — Iron Quartet** | **20** | **4× TITAN bossTier 3 + escort** |
| V — The Long Walk     | 21-24 | Compounding pressure |
| **BOSS — Iron Crown** | **25** | **4× TITAN bossTier 4 + escort** |
| VI — Edge of Doom     | 26-29 | Everything, longer |
| **FINAL BOSS — The Last Stand** | **30** | **4× TITAN bossTier 4 + heavier escort** |

Each wave features 3-4 sub-waves (each wave is ~50% longer than pre-5.101.0). Other features:
- Wave-start full-screen dark intro overlay with the wave title — entities warp in during the dark hold and settle as the overlay fades
- Asteroids and enemies both warp in (with scale + streak animation)
- Asteroid count capped at 12 (MAX_WAVE_ASTEROIDS)
- **Survivor cards (5.101.0)**: wave clear on a wave divisible by 3 opens a 3-card overlay (2 offense + 1 defense) for a FREE pick, then a 3-card QUICK BUY overlay listing weapon upgrades tailored to your equipped primary + power. 30 ÷ 3 = exactly 10 free picks per playthrough.
- Off-cadence wave clears (waves 1/2/4/5/7/…) slide straight into the next wave. The pause-menu POWERUPS tab is always reachable for SP spending.

Boss-tier TITANs at waves 5/10/15/20/25/30 receive an HP/speed multiplier on top of normal level scaling (4×–8× HP, +0–15% speed). Visual size no longer scales with level (5.101.0). Enemy speed and bullet speed scale across the campaign — wave 1 ≈ 0.65× base speed (gentle), wave 30 ≈ 2.17× base.

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
- **73 background music tracks** spanning chiptune, synthwave, and electronic — including 10 royalty-free tracks graciously provided by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/) ([YouTube](https://www.youtube.com/@WhiteBatAudio))
- **Curated futuristic SFX library** — 47 hand-tuned multi-layer WAVs (~1.5 MB), pre-rendered offline from stacked SFXR voices (sub-bass body + mid carrier + HPF brightness layer) and decoded once via WebAudio. Covers fire, hits, pickups, destructions (one per enemy type), defense-skill activations, and UI clicks — every sound in the game is SFXR-generated, no third-party sample packs.
- Built-in music player with playlist support
- Individual sound effect toggles and volume control

---

# Development

## Getting Started

### Local Development (solo only)

```bash
git clone https://github.com/user/rainboids.git
cd rainboids
npm install
npm run dev:sp     # Static server on http://localhost:8090 (no MP)
```

### Local Development (with multiplayer)

Multiplayer is an experimental separate product (see "Multiplayer (`/mp`)" below). Running it locally requires the Rust toolchain plus `wasm-pack`:

```bash
# One-time prereqs
rustup toolchain install stable    # if you don't have Rust
cargo install wasm-pack            # WASM build tool

# Then either:
npm run dev                        # http-server + cargo + wasm-pack --watch (all three concurrent)
# or one-shot:
npm run wasm:build && npm run dev:sp
```

The first `cargo run -p rainboids-server` and `wasm-pack build` are slow (cold compile). Subsequent runs are fast. Open `http://localhost:8090/mp` to reach the multiplayer page.

### Browser Requirements
- Modern browser with ES6 module support
- Canvas 2D support
- WebGL2 (used for the particle layer; if unavailable the game still runs but explosion sprites are skipped)
- Web Audio API for sound effects
- WebAssembly support (multiplayer only; baseline in every browser since 2017)

### Three products, three versions

- **Solo** (`/`) — the canonical single-player game. Versioned via `VERSION` + `CHANGELOG.md`. Currently at `sp 6.2.0`.
- **Multiplayer** (`/mp`) — experimental WASM-backed co-op product. Versioned via `VERSION-MP` + `CHANGELOG-MP.md`. Currently at `mp 0.1.0`. See `docs/Multiplayer WASM Pivot – 2026-05-17.md` for architectural context.
- **Desktop** (Electron) — native wrapper around the browser build. Versioned via `VERSION-DESKTOP` + `CHANGELOG-DESKTOP.md`. Currently at `desktop 0.3.0` (Phases 1–3 done; packaging is Phase 4). See `docs/Electron Desktop Port Plan – 2026-05-18.md`.

### Desktop wrapper (Electron)

The `electron/` subproject wraps the existing browser build in an Electron shell so the game can ship as a native macOS / Windows / Linux app. **Phases 1–4 are complete** — solo + multiplayer both run; music streams from the CDN with local disk caching; fonts are bundled locally so the app works offline; binaries can be built and shipped via `electron-builder`. Override the MP server with `RAINBOIDS_MP_WS_URL=wss://… npm run electron:dev`.

**Run from a dev checkout:**
```bash
npm run electron:install   # one-time: installs Electron into electron/node_modules (~200 MB)
npm run electron:dev       # launches the desktop wrapper
```

**Build standalone binaries** (no installer — drag-and-run on macOS, portable .exe on Windows, AppImage on Linux):
```bash
npm run electron:build:mac     # → electron/dist/Rainboids-<v>-mac.zip
npm run electron:build:linux   # → electron/dist/Rainboids-<v>.AppImage
npm run electron:build:win     # → electron/dist/Rainboids-<v>-portable.exe + zip
```

macOS and Linux builds work natively from any Mac. Windows builds locally require [Wine](https://wiki.winehq.org/MacOS) (`brew install --cask wine-stable`); the recommended path for Windows builds is the CI matrix below.

**Tagged releases** (`git tag desktop-v0.x.y && git push --tags`) trigger `.github/workflows/desktop-release.yml`, which builds all three platforms on native runners (`macos-latest`, `windows-latest`, `ubuntu-latest`) and attaches the standalone binaries to a GitHub Release. No code signing on the v1 releases — users get a Gatekeeper / SmartScreen warning on first launch (right-click → Open / More Info → Run Anyway to bypass).

---

## Running Scripts & Services

All commands are run with `npm run <script>` from the project root after `npm install`. The `package.json` groups scripts into logical sections — the headers prefixed with `__` (e.g. `__UNIT_TESTS__`) are visual separators only and not executable.

### Dev / build
```bash
npm run dev                # All three: http-server + Rust MP server + wasm-pack --watch
npm run dev:sp             # Static server only (no MP) — fastest for solo iteration
npm run dev:mp             # Rust MP server only (cargo run -p rainboids-server)
npm run dev:wasm           # One-shot wasm-pack dev build → js/mp/wasm/
npm run wasm:build         # wasm-pack release build (smaller binary)
npm start                  # Alias for `dev:sp`
```

### Multiplayer (`/mp`)

The MP product is a separate, experimental page backed by a Rust simulation crate (`server/sim/`) that compiles natively (for the server binary at `server/server-bin/`) AND to WebAssembly (for the browser client via `server/client-wasm/`). One simulation, two consumers — no JS↔Rust drift. See `docs/Multiplayer WASM Pivot – 2026-05-17.md` for the full plan.

Cargo workspace lives under `server/`:
```bash
cargo check --manifest-path server/Cargo.toml --workspace
cargo test --manifest-path server/Cargo.toml --workspace
```

### Asset generators
```bash
npm run generate-playlist  # Rebuild the music playlist manifest from music/
npm run generate-sfx       # Regenerate the SFXR-baked WAV library
```

### Tests
```bash
# Unit tests — Jest, no browser, ~1s
npm run test:unit
npm run test:unit:watch
npm run test:unit:verbose

# QA smoke — Playwright "qa" project (~20-30s)
npm run test:qa

# Full E2E — sequential, comprehensive
npm run test:e2e
npm run test:e2e:menu        # Title / menu interactions
npm run test:e2e:hud         # HUD elements
npm run test:e2e:weapons     # Primary / power weapons
npm run test:e2e:music       # Music player controls
npm run test:e2e:asteroids   # Asteroid behaviors
npm run test:e2e:enemies     # All 10 enemy type tests
npm run test:e2e:powerups    # Powerup pickups + effects
npm run test:e2e:waves       # Wave progression
npm run test:e2e:survival    # 2-minute AI survival run

# Performance FPS tests — Playwright "performance" project
npm run test:perf
npm run test:perf:gpu        # Same suite under the GPU-enabled config

# Run everything in order: unit → qa → e2e → perf
npm test
npm run test:all             # All Playwright projects in parallel (no order guarantee)
```

### Reports (Allure HTML)
```bash
npm run report:pw            # Playwright's built-in HTML report
npm run report:allure        # Aggregate Allure across all suites
npm run report:unit          # Unit-only Allure report
npm run report:e2e           # E2E-only Allure report
npm run report:perf          # Perf-only Allure report
```

### Microbenchmarks (mitata, on V8)
```bash
npm run bench                # Full benchmark suite
npm run bench:pool           # Object pool benchmarks
npm run bench:collision      # Spatial-grid collision benchmarks
npm run bench:wave           # Wave scaling math
npm run bench:math           # Hot math inner loops
npm run bench:noise          # Noise generators
npm run bench:all-engines    # Compare V8 / JSC / SpiderMonkey side-by-side
npm run bench:compare        # Compare benchmark output against a baseline
```

### AI QA bot (automated playtesting)
The QA bot is a reactive AI player that drives a real headless browser via Playwright, plays through wave N, and reports anomalies (stuck states, invariant violations, FPS drops, balance outliers). Implementation in `tools/ai-qa-bot/`.
```bash
npm run qa:bot               # Default run (one session, ~5-10 min)
npm run qa:bot:quick         # 3-minute spot check
npm run qa:bot:long          # 30-minute deep run
npm run qa:bot:headed        # Watch the bot play in a real Chrome window
npm run qa:bot:bugs          # Bug-detection mode only — skips balance metrics
npm run qa:bot:balance       # 5 sessions × 10 min, all builds — balance pass
npm run qa:bot:novice        # Run with the "novice" skill profile
npm run qa:bot:report        # Generate a report from the most recent session
```

The bot writes session logs + Allure artifacts to `allure-results/qa-bot/`. Pair with `npm run report:allure` to inspect.

### Test infrastructure notes
- All Playwright suites need browsers installed once: `npx playwright install` (Chromium is enough for the default projects).
- Allure CLI is bundled as a dev dependency — no global install required.
- The unit suite uses `--experimental-vm-modules`, so it requires a recent Node (≥18 recommended).
- The **AI playtester helper** (`tests/helpers/game-ai.js`) is the underlying steering logic shared by both the in-test reactive bot AND the QA bot's session controller. `GameAI(page)` exposes `run(durationMs)`, `waitForEnemyDeath(type, timeout)`, `waitForAsteroidCount(n, timeout)` for use in your own specs.

---

## Project Structure

```
├── index.html                 # Solo game entry point (/)
├── mp.html                    # Multiplayer entry point (/mp) — experimental
├── package.json               # Dependencies and scripts
├── VERSION                    # Solo semantic version
├── VERSION-MP                 # Multiplayer semantic version (independent)
├── VERSION-DESKTOP            # Electron desktop wrapper semantic version (independent)
├── CHANGELOG.md               # Solo version history
├── CHANGELOG-MP.md            # Multiplayer version history
├── CHANGELOG-DESKTOP.md       # Desktop wrapper version history
├── CLAUDE.md                  # Claude Code project instructions
├── js/
│   ├── main.js                # Solo game initialization
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
│       │   ├── game-timer.js  #   Frame-counted timers (freeze during pause/shop)
│       │   ├── version.js     #   VERSION export (single-source build tag)
│       │   └── storage.js     #   localStorage helpers — settings + wave-start save (5.79.0)
│       ├── platform/          # Device + viewport detection (5.91.0)
│       │   └── platform-detect.js # isMobile / isPortrait / isTouchDevice + URL override
│       ├── player/            # Player entity and subsystems
│       │   ├── player.js      #   Player entity (movement, update, draw orchestration)
│       │   ├── weapons.js     #   35 weapon methods (primary + power fire, charging, equip)
│       │   ├── skills.js      #   5 defense skill methods
│       │   ├── progression.js #   18 leveling, powerup, stat methods
│       │   ├── renderer.js    #   5 player draw methods
│       │   ├── lifecycle.js   #   Damage, energy tanks, game-over (5.88.0)
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
│       │   ├── status.js      #   Health bar, energy tanks (triforce + spare), level/coins, XP
│       │   ├── combat.js      #   Damage numbers, target info, powerups, money pickup
│       │   ├── navigation.js  #   Minimap, off-screen enemy indicators
│       │   ├── overlays.js    #   Title screen, wavy text, timers, ghosts
│       │   ├── cursor.js      #   Crosshairs, targeting cursor, jitter, charge timer, laser-pointer aim (desktop-only since 5.95.1)
│       │   ├── mobile-reticle.js #  Touch-position aiming reticle (5.95.1) — replaces desktop laser-pointer on mobile
│       │   └── hud-buttons.js #   Canvas SHOP/STATS/PAUSE bar + mobile PRM/PWR side buttons (5.94.0)
│       ├── world/             # Game world entities and environment
│       │   ├── asteroid.js    #   Asteroid entity (3D wireframe, splitting)
│       │   ├── particle.js    #   Particle entity (explosions, sparks, etc.)
│       │   ├── color-star.js  #   Decorative starfield + health orbs (collectible)
│       │   ├── gold-coin.js   #   Floating gold pixel coin (drift, no homing, 120s)
│       │   ├── gold-shape.js  #   Floating gold shape orb (drift, no homing, 120s)
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
│       │   └── wave-data.js   #   30-wave campaign + boss tier scaling
│       ├── shop/              # Shop system
│       │   ├── shop-manager.js #  Shop logic, purchases, tab builders
│       │   ├── shop-dom.js     #  HTML overlay renderer (active)
│       │   └── shop-renderer.js # (Legacy canvas renderer — unused)
│       ├── audio/             # Audio pipeline
│       │   ├── audio-manager.js # WebAudio playback of pre-rendered WAV variants
│       │   ├── sound-defs.js   #   Source-of-truth SFX registry (presets + custom params)
│       │   └── music-player.js #  Background music player with playlist
│       ├── ui/                # DOM UI and input
│       │   ├── ui-manager.js  #   DOM-based UI (pause menu, shop button)
│       │   ├── input-handler.js # Keyboard + mouse input (desktop)
│       │   ├── mobile-touch.js # Tap-to-aim-and-fire + PRM/PWR HUD routing — tower-defense mode (5.94.0)
│       │   ├── event-setup.js #   All event listeners: input, shop, cheats, resize
│       │   ├── radial-menu.js #   Held E/R/F radial picker for primary/power/skill
│       │   ├── stats-overlay.js # Diablo-style stats screen (` key, 5.79.0)
│       │   ├── icons.js       #   SVG icon registry (53 paths) + DOM/Canvas renderers (5.79.37)
│       │   └── hint-system.js #   Onboarding hint toasts
│       ├── performance/       # Spatial grid, depth/nebula renderers, WebGL particle renderer + atlas
│       └── debug/             # VFX telemetry (per-frame effect state recording)
├── js/mp/                     # Multiplayer entry point + thin client layer (2026-05-17, Phase 0 stub)
│   ├── mp-main.js             #   /mp boot: loads WASM, runs smoke harness
│   ├── mp-engine.js           #   (Phase 1+) tick loop, WebSocket, WASM prediction
│   ├── mp-renderer.js         #   (Phase 1+) canvas renderer over WASM linear memory
│   ├── mp-input.js            #   (Phase 1+) input → wire-format PackedInput
│   ├── mp-particles.js        #   (Phase 1+) cosmetic events → particle effects
│   ├── mp-audio.js            #   (Phase 1+) sim events → SFX triggers (audio files shared with solo)
│   ├── mp-hud.js              #   (Phase 1+) own + partner ship HUD, shared wave indicator
│   └── wasm/                  #   wasm-pack output (generated; not committed if .gitignored)
├── js/engine/                 # Mode-aware driver (legacy MP path; unreachable post-2026-05-17 pivot)
│   ├── engine-driver.js       #   EngineDriver: startSolo / startOnline — only solo path now used
│   └── …                      #   archives in Phase 1 with the legacy MP modal
├── js/net/                    # Legacy MP networking (unreachable post-pivot; archives in Phase 1)
├── js/sim/                    # Legacy JS sim (relocated 5.89-era port; archives in Phase 1)
├── schema/                    # Cross-language wire-protocol source-of-truth
│   └── protocol.toml          #   codegen source → server/sim/src/protocol/generated.rs (+ js/sim/protocol-generated.js)
├── server/                    # Rust workspace (WASM pivot, 2026-05-17)
│   ├── Cargo.toml             #   [workspace] root
│   ├── sim/                   #   rainboids-sim — canonical simulation (compiles native + WASM)
│   │   └── src/{ship,enemy,bullet,asteroid,collision,drops,wave,…}.rs
│   ├── server-bin/            #   rainboids-server — authoritative multiplayer server binary
│   │   ├── src/{main,config,error,lib}.rs + server/, room/, matchmaking/, obs/, util/
│   │   └── tests/             #   integration tests (handshake, room lifecycle, snapshots, wire goldens)
│   └── client-wasm/           #   rainboids-client-wasm — wasm-bindgen wrapper exposing sim to JS
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
│   ├── check-schema.mjs       #   Wire-protocol parity checker (Rust ↔ schema ↔ JS) (5.84.0)
│   ├── parity-runner.mjs      #   Byte-level parity runner for schema/snapshots (5.84.0)
│   └── juice-capture.mjs      #   Juice tuning screen capture
├── tests/
│   ├── unit/                  # Jest unit tests (972 tests as of 5.96.0)
│   │   ├── sim/               #   Engine-refactor primitives (rng, trig, fxp, codec, protocol)
│   │   └── wire-codec.test.js #   Hello/Welcome golden-byte regression
│   ├── qa/                    # Playwright smoke tests (95 tests)
│   ├── e2e/                   # Playwright E2E suite
│   ├── performance/           # FPS benchmark tests
│   └── helpers/               # Game helpers and AI playtester
├── server/                    # Rust authoritative multiplayer server (scaffold)
│   ├── Cargo.toml             #   axum + tokio + bincode wire protocol
│   ├── src/                   #   lib.rs facade + server/, protocol/, matchmaking/, room/, sim/, obs/, util/
│   ├── tests/                 #   wire-golden, handshake, room-lifecycle, grace+reconnect (25 tests)
│   └── deploy/                #   systemd unit, nginx config, Dockerfile
├── electron/                  # Electron desktop wrapper (Phases 1–3 done — desktop 0.3.0)
│   ├── package.json           #   Isolated subproject (own node_modules); deps: electron
│   ├── main.js                #   Main process — app:// custom protocol + BrowserWindow
│   └── preload.js             #   contextBridge → window.rainboids = { isDesktop, platform }
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

## Music Credits

Most tracks are original compositions by **afeique**. The remaining 10 tracks are royalty-free music graciously provided by **Karl Casey @ White Bat Audio**:

- Aura
- Beyond the Shadows
- Dangerous
- Inferno
- Iridium
- Legend
- Midnight
- Out for Blood
- Salvation
- World Eater

Support White Bat Audio:

- [Bandcamp](https://karlcasey.bandcamp.com/)
- [YouTube](https://www.youtube.com/@WhiteBatAudio)

Karl Casey's music is used under the royalty-free license documented on the White Bat Audio channel.

---

## License

This project builds upon the original [Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic) with extensive enhancements and modularization.

Music by Karl Casey @ White Bat Audio is included under his royalty-free license.
