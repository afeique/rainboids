# Changelog

All notable changes to Rainboids will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- **MAJOR** = fundamental gameplay or architectural overhaul
- **MINOR** = new features, systems, or significant content
- **PATCH** = bug fixes, balance tuning, polish

---

## [6.4.3] - 2026-04-30

### Changed
- **Falling asteroids cannot travel upward, ever.** Each frame in `Asteroid.update`, `vel.y` is floored to `0.4` (after applying the gravity tick). Collisions, bullet impacts, asteroid-asteroid bumps, and any other impulse that would push an asteroid northward are corrected on the next frame — asteroids always make southward progress and recycle from the bottom edge.

---

## [6.4.2] - 2026-04-30

### Changed
- **Asteroids drift downward + recycle to top.** Galaxian falling-asteroid update applies a constant `vel.y += 0.025` per frame so every asteroid eventually exits the bottom edge regardless of its initial speed. On bottom-exit (or side-exit) the asteroid is **recycled** in place — `x` reset to a random top-band position, `y` snapped above the top edge, velocity reseeded, HP restored — instead of being released to the pool and replaced by a fresh allocation. Keeps the field populated with zero pool churn. Asteroid max speed bumped from 2.0 to 2.5 to accommodate the gravity buildup.

---

## [6.4.1] - 2026-04-30

### Fixed
- **Score HUD no longer overlaps the pause button.** Score-combo overlay moved from top-right to top-center (via `transform: translateX(-50%)`); pause button (top-right) and HP/lives stack (top-left) are now both clear.
- **Pause button now responds to mobile taps.** Added an explicit `touchend` listener on `#hud-pause-btn` (with `preventDefault`) — the prior `click`-only binding could be swallowed by the canvas touchstart's `preventDefault` on some Android browsers.

---

## [6.4.0] - 2026-04-30

### Changed
- **Player aim locked straight up.** Mouse aiming is bypassed in galaxian mode — `player.angle = -π/2` every frame. The ship sprite faces north and bullets fly vertical only. WASD/arrows still drive movement (no aim coupling).
- **Auto-fire while playing.** Galaxian mode sets `input.fire = true` each frame in the engine update loop so the player only focuses on dodging + positioning. Holding left-click is no longer required.
- **Mobile re-enabled.** The `isMobileOrTabletDevice` desktop-only gate in `main.js` is removed. Phones and tablets now load the game directly.

### Added
- **Touch press-drag analog controls** in `InputHandler.setupTouchControls`. Touchstart anchors a drag origin; touchmove computes a normalized vector (8 px deadzone, 90 px saturation radius). Player movement consumes `input.touchVecX/Y` with magnitude scaling thrust force, so light drags = slow, full-radius drags = full speed. Touchstart also pulls the fire trigger.

---

## [6.3.4] - 2026-04-30

### Changed
- **Galaxian-mode enemy bullets are now charged-shot sized.** Standard aimed/spread/burst bullets bumped to `radius 11` (explosive 14) with `glowRadius 24/30` (was 3/6 and 6/12). Velocity doubled at the end of `createEnemyBullet`. Bespoke patterns — laser, mines, titan rockets, prowler missiles, homing — skip the override so their existing sizing is preserved.

---

## [6.3.3] - 2026-04-30

### Changed
- **Player primary bullets now have full-screen range in galaxian mode.** `Bullet.update` replaces life-based range expiry with a screen-bounds check — bullets travel until they actually leave the playfield, regardless of the weapon's `config.range` (Lance Beam 0.6, Rail Driver 0.85, etc.) or `LONG_RANGE` stack count. Legacy free-flight mode keeps the lifetime cap (necessary because that mode wraps).

---

## [6.3.2] - 2026-04-30

### Changed
- **Background stars stream downward in galaxian mode.** Previously parallaxed against player velocity (built for free-flight); now they scroll straight south at a depth-scaled constant speed (`pow(z, 1.5) * 0.35` for background, `0.45` for color stars). Reinforces the top-down flow — the world reads as moving with the enemy stream, not against the player. Legacy free-flight parallax preserved when `galagaMode = false`.

---

## [6.3.1] - 2026-04-30

### Changed
- **Enemy face angle locked to downward.** After `updateFaceDirection` runs each frame, galaxian-mode enemies (path, dive, or formation) have `faceAngle` snapped to `π/2`. Sprites no longer pivot up; the squadron always faces the player below.
- **Enemy fire clamped to the downward semicircle.** Formation-fire's aim target is floored to `this.y + 8` so the computed bullet trajectory never has a negative y-component, even if the player slipped above the enemy. No more upward shots.
- **Title screen now reads `RAINAXIAN`** (`js/modules/hud/overlays.js`).

---

## [6.3.0] - 2026-04-30

### Changed
- **Enemies cannot travel north.** Galaxian-mode enemies have `vel.y` clamped to ≥ 0 in the integration step. Movement is restricted to the downward 180° semicircle (south + east + west). Native dive patterns that previously had upward components no longer do; horizontal motion is unrestricted.
- **Enemy + asteroid HP halved in galaxian mode.** Applied at `Enemy.initializeEnemy` and `Asteroid.initializeAsteroid` (also at `applyEnemyLevelScaling` since it overwrites health). Stream-paced shooters punish bullet-sponge enemies; halving keeps kills snappy and combos building.
- **Player hard-locked to the lower half.** Replaces the previous soft 45%-thrust damp with a hard clamp at `gameField.height / 2 + radius`. Player spawn position moved to 82% Y. Top boundary zeroes (rather than bounces) `vel.y` to prevent jitter at the seam.

---

## [6.2.0] - 2026-04-30

### Changed
- **True top-down shooter.** Galaxian mode pivots from formation-hold to a continuous top-to-bottom path stream. Every spawned enemy is in motion southward from the moment it appears; nothing sits still. No formation grid, no scripted dive triggers — the whole stage is a flowing river of enemies on fixed trajectories.
- **Game board locked to one screen** (`GAME_CONFIG.FIELD_WIDTH/HEIGHT` set to `window.innerWidth/innerHeight` at engine init and on `resize` in galaxian mode). Camera no longer scrolls — the playfield is exactly the viewport. Asteroids and enemies that exit any side disappear permanently.
- **Off-screen = gone.** Path enemies and falling asteroids that exit any side (left/right/bottom) release back to their pools immediately. No bounce, no wrap. Top is the only open edge (where new spawns enter).

### Added
- **`js/modules/wave/spawn-paths.js`** — six fixed top-down paths: `straight`, `sine`, `zigzag`, `diagonal`, `swoop`, `drift`. `pickPathForType` maps each enemy archetype to a flavored path pool (Wasps zigzag, Guardians drift, Hunters swoop, etc.). `applyPath` is called from `Enemy.updateMovement` per frame when `enemy.galaxianPath` is set.
- **Path-fire on every galaxian enemy.** The formation-fire path (consistent 2.2–4.5s cadence, no aim-cone gate, global token-bucket throttle) now applies to all path enemies, not just formation-held ones. Squadrons fire reliably from the moment they enter screen.

### Removed
- **Formation hold model** is no longer used in galaxian mode. `formation.js` and `formationHoldMovement` remain in the codebase but are dormant — no spawn path uses them. Stage data's `formation` field is ignored. (Keep for potential future modes.)

---

## [6.1.0] - 2026-04-30

### Fixed
- **Formation enemies stopped firing after settling.** The aim-cone gate in `enemy.js:670–681` (`if (Math.abs(aimDiff) > Math.PI/6) return`) requires the enemy's `faceAngle` to be within 30° of the angle to the player. `formationHoldMovement` lerps `faceAngle` at 0.04/frame — too slow when the player moves laterally below the formation. The enemy's facing oscillates around the gate and rarely satisfies it, so the squadron sits silent. Galaxian-mode now bypasses the aim/LOS gates entirely (new `Enemy.updateFormationFire`) and fires aimed straight at the player on its own cadence.

### Added
- **Formation-fire path** (`Enemy.updateFormationFire`). Per-enemy 2.2–4.5s randomized cooldown, no aim-cone gate, no line-of-sight gate. Initial cooldown staggered by slot phase so the squadron doesn't volley simultaneously on spawn.
- **Global formation-fire token bucket** (`gameEngine.formationShooterTokens`, default 2). Refills every frame; an enemy must claim a token to fire. Caps simultaneous formation bullets at 2 per frame regardless of squadron size — dodgeable density even with 12+ enemies.
- **Continuous-flow stage runner.** Stages run for `duration` ms with continuous formation refill (`refillEvery`), periodic dive waves (`diveEvery` + `diveCount`), and a steady asteroid stream (`asteroidEvery` + `asteroidCount`). No more dead air between scripted spawns.
- **Vertical asteroid stream.** New `SortieRunner.spawnFallingAsteroid` spawns asteroids above the top edge with downward velocity and slight horizontal drift. Asteroids tagged `fallingAsteroid` skip top/bottom bounce and release on bottom-edge exit.
- **Top-down dive enforcement.** Diving enemies set `diveSouth = true`; their `vel.y` is clamped to ≥ 0.6 so dives never crawl back upward, and they release to the pool when they exit below the playfield.
- **Player Y soft-damp.** Upward thrust force is reduced to 55% in the upper 45% of the playfield. Soft, not a hard clamp — the player can still go up briefly to dodge but is discouraged from camping the formation row.

### Changed
- **Stage data v2** — replaced the hand-authored event-list schema with continuous-flow parameters (`duration`, `pool`, `refillEvery`, `diveEvery`, `diveCount`, `asteroidEvery`, `asteroidCount`). One-shot events (`banner`, `spawn`, `asteroid`) still supported via optional `events` array.
- **Stage 7+ procedural scaling** rebalanced to scale cadence ranges and dive/asteroid counts (vs. the previous spawn-count + speedup model).

---

## [6.0.0] - 2026-04-30

### Changed
- **Galaga-mode conversion — fundamental gameplay overhaul.** The free-flight roguelite is replaced with a fast, formation-driven arcade shooter. Stages flow into each other; the between-wave shop is bypassed. Existing 10-enemy roster, weapons, and skills are reused — the conversion is rewiring, not re-art.

### Added
- **Sortie script + formation slot system** (`js/modules/wave/formation.js`, `wave/sortie-script.js`, `wave/stage-data.js`). Stages spawn enemies into a slot grid (or chevron), where they hold position with breathing sway. Scheduled timeline events trigger dives — slot occupants release back to their native movement pattern. Runner ticks once per frame.
- **6 hand-authored stages** (Stage 1–6) with stage 7+ procedurally scaled (loops the 6 with +difficulty modifier). Replaces the 100-wave flat enemy-list system.
- **`formationHoldMovement`** in `enemy/movement.js` — soft-attract steering toward the assigned slot with sine-wave breath; AI evasion suppressed while in formation.
- **Combo meter** (`js/modules/combat/combo.js`) — kills within 1.5s extend; combo×10 grants 5s overdrive (1.5× damage, 2× fire rate); drop multiplier scales 1.0/1.4/2.0/2.5; score multiplier scales 1×/1.5×/2×/3×.
- **Archetype-flavored pickup drops** (`combat-manager.dropArchetypePickup`). Each enemy type drops a flavored pickup pool (HUNTER → RAPID/BIG, WASP → RAPID/MULTI, TITAN → all). Drop rate amplified by combo multiplier.
- **Milestone perk overlay** (`js/modules/ui/milestone-perk.js`) — every 10k score, non-blocking 3-card pick (1/2/3 keys or click). Game keeps running underneath. 6s auto-default.
- **Score + Combo HUD** (`js/modules/ui/score-combo-hud.js`) — top-right DOM panel showing unified score, combo count, overdrive flash.
- **`game.score`** unified score field (Galaga-mode primary number).

### Removed
- **Between-wave shop popup.** In Galaga mode (`galagaMode = true`, default) the shop never opens between waves; stages chain directly. Shop module remains in the codebase as fallback for legacy mode (toggleable for A/B comparison).
- **HUD shop buttons** are hidden in Galaga mode.

---

## [5.39.9] - 2026-04-30

### Fixed
- **Powerup body alpha-leak bug — fade-out actually works now.** The expiry fade in `Powerup.draw` set `ctx.globalAlpha = fadeAlpha` before drawing the body, but `glowSpriteCache.draw()` (which is called between the alpha set and the body `fill()`/`stroke()`) ends with `ctx.globalAlpha = alpha` and never restores it. The hard-coded glow alpha was `0.6`, so the powerup body and stroke rendered at a fixed `0.6` regardless of `fadeAlpha`, while only the icon/sparkle/label faded. Net effect: the bulk of the powerup stayed at full visibility right up until despawn, then "popped" out. Fix is two lines in `powerup.js:420-421`: pass `0.6 * fadeAlpha` to the glow sprite, then re-set `ctx.globalAlpha = fadeAlpha` so the body fill/stroke fades with the rest. (Color-star orbs already wrap their `glowSpriteCache.draw` calls in `ctx.save()/ctx.restore()`, so they were unaffected.)

---

## [5.39.8] - 2026-04-30

### Changed
- **`P` debug key now spawns a powerup somewhere on the map.** Previously the test-spawn placed the powerup at a ±50 px offset from the player, which made it auto-collected the next frame and useless for actually testing pickup behavior. Spawn position is now a random angle around the player at distance `400–800 px`, clamped to stay 80 px inside the `gameField` bounds, so the player has to fly to it to pick it up.

---

## [5.39.7] - 2026-04-30

### Changed
- **Health / money orbs fade out gradually instead of popping.** The dropped pickup orbs (called powerups colloquially) used to be fully opaque for ~28s of their 30s lifetime and then ramp linearly to zero only across the final 2s — with the 60Hz tick this read as a sudden disappearance, especially when the orb was off to one side of the screen. Fade window extended `120 → 360` frames (~2s → ~6s) and the curve is now `sqrt`-eased so the tail lingers, matching the easing used by the larger Powerup entities.

---

## [5.39.6] - 2026-04-30

### Changed
- **Player friction increased again — even faster stop.** Friction baseline `0.70 → 0.50` (per-frame @60Hz: `0.837 → 0.707`). Coasting halflife drops from `~65ms → ~33ms`; full decay to the 0.05 snap-threshold goes from ~24 frames (~400ms) to ~13 frames (~217ms). Top speed is preserved — with `thrustPower 2.0`, velocity now asymptotes at ~3.41 (still 97% of the 3.5 `MAX_V` cap), so peak feel is unchanged but stops are noticeably crisper.

---

## [5.39.5] - 2026-04-30

### Changed
- **Player movement: momentum minimized further — now near-instant.** Pushed both knobs harder so the ship stops the frame after release and reaches top speed in a few frames:
  - `thrustPower`: `0.38 → 2.0` (per-frame delta @60Hz: `0.19 → 1.0`).
  - Friction at 30Hz baseline: `0.97 → 0.70` (per-frame @60Hz: `0.985 → 0.837`).
  - Coasting halflife @60Hz: `~450ms → ~65ms` (~7× tighter than before this version, ~30× tighter than the original `0.988` floaty feel).
  - Time to reach `MAX_V` cap: `~14 frames (235ms) → ~5 frames (80ms)`.
  - Direction reversal time at full speed: roughly `30+ frames → 4–5 frames`.
  - Top-speed cap (`MAX_V`) and snap-to-zero threshold (`0.05`) unchanged. Net feel: arrow key in = move; arrow key out = stop. Almost no glide.

---

## [5.39.4] - 2026-04-30

### Removed
- **Music player marquee effect removed.** The scrolling marquee on the now-playing track name and on overflowing playlist entries (both the auto-scroll for the active row and the hover-scroll for the others) is gone. Track titles now render as static text. Playback, progress bar, time display, playlist selection, and the ♪ indicator on the active row are all preserved. Removed code paths: `ensureMarquee`, `applyPlaylistMarquee`, `checkPlaylistMarquees`, `addPlaylistTrackHoverEffects`, the `.marquee-text` / `.marquee-container` markup, the `.has-marquee` CSS, and all `_marqueeRAF` / `_marqueeChecked` bookkeeping.

## [5.39.3] - 2026-04-30

### Changed
- **Player controls tightened — less floaty, more instant.** Two coordinated tweaks so the ship stops and turns where the player tells it to, without losing the top-speed feel:
  - `thrustPower`: `0.18 → 0.38` (more acceleration → reaches top speed faster on key-press, so taps register immediately instead of as a slow ramp).
  - Friction at 30Hz baseline: `0.988 → 0.97` (much more drag → velocity decays in ~0.77s halflife instead of ~1.9s, so coasting is roughly 2.5× shorter when keys release).
  - Net effect: controls feel one-to-one — press a direction, the ship moves; release, the ship stops quickly. Top speed (`MAX_V` cap) and direction-change behavior are unchanged. The snap-to-zero threshold was deliberately left at `0.05`: at 60Hz the `TICK_SCALE` factor shrinks the per-frame thrust delta to ~0.19, so a larger threshold would clamp acceleration to zero every frame and freeze the ship.

---

## [5.39.2] - 2026-04-30

### Removed
- **CRT scanline overlay.** The `#scanline-overlay` div + its `linear-gradient` 4px stripe + 10s scanline animation are gone. Borrowed from the pixel-art arcade aesthetic, the overlay didn't suit Rainboids' glow-heavy vector visuals — it muted the brightness on every other row (25%-dark stripe at 4px pitch), reduced HUD legibility for the small enemy-header and damage-number text, and ran at z-index 500 over the whole viewport every frame. Removed the div from `index.html`, the `#scanline-overlay` rule and `@keyframes scanline` from `styles.css`. May reintroduce as an optional Controls/SFX toggle later if desired.

---

## [5.39.1] - 2026-04-30

### Changed
- **Top-of-screen target HP readout enlarged.** The "X / Y" HP numbers under the enemy health bar bumped from 12px → 16px so they read at a glance. `numberY` recomputed as `barY + barHeight + 14` so the larger glyphs sit ~14px below the bar bottom.
- **Whole `LV.N  ENEMY` row now centered as a single block.** Previously the name was centered on screen and the LV.N tag hung off its left edge, which pushed the visual mass off-center to the right. Now the renderer measures the full `LV. + level number + gap + name` width once and places the entire row so the block (not just the name) is centered. All three glyphs still bottom-align to the name's baseline.

---

## [5.39.0] - 2026-04-30

### Added
- **HELP tab in shop, now the landing tab.** Explains the three resources and the upgrade flow before the player browses items. Three entries:
  - **GOLD** — dropped by destroyed enemies and asteroids, picks up automatically; spend on OFFENSE / PRIMARY / POWER (gold-priced).
  - **SKILL POINTS (SP)** — awarded on level-up; spend on DEFENSE / DROPS / SKILLS (SP-priced).
  - **EXPERIENCE (XP)** — awarded for every hit you land; tracked by the red bar under the health bar; filling it grants a level + 1 SP.
  Lives in `shop-dom.js` `buildHelpPanel()`; styled by `.shop-help-*` rules. New `data-tab="HELP"` button uses neutral silver tab color matching the controls tab convention.
- **HUD SHOP button (top-right, next to pause).** New `#hud-shop-btn` element matches the goldenrod styling/dim-until-hover pattern of `#hud-pause-btn`. Click opens the shop overlay directly during play — `gameEngine.openShop()` on click. Hidden during title screen and while shop is already open. New `ui:show-hud-shop-btn` / `ui:hide-hud-shop-btn` events route through `uiManager.showHudShopBtn()` / `hideHudShopBtn()`.

### Changed
- **Shop auto-opens after every wave clears.** Previously the wave-complete countdown counted to zero and started the next wave automatically. Now the countdown is removed: 700ms after the "WAVE COMPLETE!" toast registers, the shop pops up. The player browses for as long as they want and the next wave only starts when they close the shop (`closeShop()` already calls `startNextWave()`). Combined with the HELP tab as the landing page, this turns each between-wave moment into a roguelite progression beat — earn loot during the wave, spend it before the next.
- **Shop tab grid widened to 4 columns** (`repeat(3, …)` → `repeat(4, …)`) to fit the new HELP tab. Layout: row 1 = HELP / OFFENSE / PRIMARY / POWER; row 2 = DEFENSE / DROPS / SKILLS. Strip width capped at `min(960px, 100%)` so cells don't stretch on ultrawide screens.

---

## [5.38.7] - 2026-04-29

### Changed
- **Pulse Cannon now respects `config.range` like every other primary.** `createChargedBullets` (the path used by Pulse Cannon and the Charge Shot power weapon) was hard-coding range from `Math.max(1, speedMultiplier * 0.5)` and never reading the weapon's `config.range`. Added an optional `rangeOverride` parameter (default `1`, so Charge Shot is unchanged) that gets multiplied into both `bullet.rangeMultiplier` and `bullet.maxLife` — same formula the other weapons use. `firePulseCannon` now passes `config.range`. The range pipeline is finally consistent across all 5 primaries: change one number in `weapon-data.js` to retune any weapon's reach.
- **Re-tuned ranges to keep ~240px on-screen travel** now that Pulse Cannon respects R:
  - PULSE_CANNON: `1.5 → 1.0` (was unused before; effective travel unchanged at ~240px)
  - STORM_NEEDLES: `1.0` (unchanged)
  - SCATTER_GUN: `1.0` (unchanged)
  - RAIL_DRIVER: `0.7 → 0.85` (5.38.6 over-shortened this; the math is quadratic in R, so 0.7 → 165px not 240px. 0.85² × 11.2 × 30 ≈ 240px ✓)
  - LANCE_BEAM: `0.6` (unchanged — raycast `R × 400 = 240px`)

---

## [5.38.6] - 2026-04-29

### Fixed
- **Non-Pulse-Cannon primaries traveled past the screen edge.** 5.38.5 set every primary to `range: 1.5`, but `firePulseCannon` calls `createChargedBullets` which **does not read `config.range`** (line 876 in `player/weapons.js`) — it uses the bullet's default `maxLife` (~30 frames × default speed ≈ 240px). The other weapons (Storm Needles, Scatter Gun, Rail Driver, Lance Beam) DO multiply `bullet.maxLife * config.range`, so they were flying ~360–600px while Pulse Cannon stayed at ~240px. Re-tuned each weapon's `config.range` so its effective on-screen travel matches Pulse Cannon:
  - STORM_NEEDLES: `1.5 → 1.0` (45 → 30 frames × 8 px ≈ 240px)
  - SCATTER_GUN: `1.5 → 1.0` (~240px)
  - RAIL_DRIVER: `1.5 → 0.7` — compensates for its `bulletSpeed: 1.4` velocity boost (`8 × 1.4 × 21 ≈ 240px`)
  - LANCE_BEAM: `1.5 → 0.6` (raycast distance `0.6 × 400 = 240px`)
  - PULSE_CANNON: `1.5` (unchanged — value is unused but kept as documentation)
- Range upgrades (LONG_RANGE / PENETRATOR / VELOCITY) still multiply on top, so investing in them remains the path to longer reach.

---

## [5.38.5] - 2026-04-29

### Changed
- **All primary weapons now share the same base range (1.5).** Followed up the 5.38.4 range bump by flattening Storm Needles (1.4 → 1.5), Scatter Gun (1.2 → 1.5), Lance Beam (1.6 → 1.5), and Rail Driver (1.8 → 1.5) to match Pulse Cannon. No primary out-ranges another at base; differentiation now comes from fire rate, damage, spread, piercing, and per-weapon range upgrades (LONG_RANGE / PENETRATOR / VELOCITY) rather than baseline reach.

---

## [5.38.4] - 2026-04-29

### Changed
- **Base range increased on all 5 primary weapons** so every weapon can engage threats at roughly half-screen to three-quarter-screen distance before bullets expire. `config.range = 1.0` ≈ 460px ≈ ~43% of typical screen height (1080px), so the new band ≈ 0.5–0.75 of screen height. Relative ordering preserved (Scatter shortest, Rail longest); LONG_RANGE / PENETRATOR / VELOCITY upgrades still multiply on top.
  - PULSE_CANNON: `0.85 → 1.5` (~65% of screen height)
  - STORM_NEEDLES: `0.7 → 1.4` (~60%)
  - SCATTER_GUN: `0.5 → 1.2` (~52%)
  - LANCE_BEAM: `1.2 → 1.6` (~69%)
  - RAIL_DRIVER: `1.5 → 1.8` (~77%)

---

## [5.38.3] - 2026-04-29

### Changed
- **Shop tabs grouped by currency.** Reorganized into two rows: row 1 holds the three gold-priced tabs (OFFENSE / PRIMARY / POWER), row 2 holds the three SP-priced tabs (DEFENSE / DROPS / SKILLS). Switched `.shop-tabs` grid from `repeat(4, …)` (4 + 2 layout) to `repeat(3, …)` so each currency group fills its own row, making "what does this cost" obvious at a glance from the tab strip alone.

---

## [5.38.2] - 2026-04-29

### Changed
- **Shop now uses the HUD's coin-stack icon instead of the 💰 emoji.** The HUD renders a stylized coin-stack icon via `drawCachedMoneyIcon` (path data in `core/utils.js`); the shop was using the generic Unicode money-bag emoji, so the two read as different currencies at a glance. Inlined the same SVG path in `shop-dom.js` as `COIN_SVG_PATH` and added a `makeCoinIconSvg(size)` helper. The currency header now swaps in a 20px SVG, and every item-row coin price uses `makeCoinPrice(amount)` (16px SVG + cost number) instead of `'💰 ${cost}'` text. Visually consistent across HUD and shop with no canvas hop — pure SVG scales crisply at any size.

---

## [5.38.1] - 2026-04-29

### Fixed
- **Shop overlay was being dimmed to 25% by its own HUD-dimming rule.** The new `#shop-overlay` carries class `ui-element` (so it inherits the shared HUD z-index / font setup), but `body.shop-open .ui-element { opacity: 0.25 }` — which is meant to dim the score, lives, and other HUD chrome behind the shop — also matched the shop overlay itself, making the whole panel translucent. Narrowed the selector to `body.shop-open .ui-element:not(#shop-overlay)` so the shop renders at full opacity.

---

## [5.38.0] - 2026-04-29

### Changed
- **Shop UI converted from canvas rendering to HTML overlay.** The shop now mirrors the pause-menu pattern: a fullscreen `#shop-overlay` containing `#shop-menu` with a header (close X, title, currency display), a 4-column tab strip, and a scrollable item list — all DOM, all styled via CSS. Tabs are real `<button class="shop-tab" data-tab="…">` elements; items are `<button class="shop-item">` elements with nested icon/body/cost/sell sub-elements. Per-tab category colors mirror the canvas palette via `data-tab[…]` selectors with `--tab-color` custom properties. Clicks, hover effects, and scrolling are now native DOM behaviors instead of canvas hit-testing — no more `shopTabBounds` / `shopItemBounds` / `shopScrollbarBounds` / `shopScrollThumbDrag` ad-hoc state. Item state classes (`--equipped`, `--owned`, `--maxed`, `--cant-afford`) drive all visual styling. Files added: `js/modules/shop/shop-dom.js` (renderer + event delegation). The legacy `js/modules/shop/shop-renderer.js` is no longer called from the draw loop — `drawShop()` is replaced with a comment pointing at the DOM module.
- **Shop tabs now use the same boilerplate as pause-menu tabs.** Both menus share the 4-column grid, 18px font, color-mix hover/active patterns, and `data-tab[…]` per-tab color hooks, just under separate selectors (`.pause-tab` vs `.shop-tab`). Items reuse the same row-card visual language as the pause menu's primary/power weapon lists.

### Fixed
- **`drawShop` no longer runs once per frame while the shop is open.** Frees up the canvas frame budget — every gradient, hit-test array, and scroll-thumb computation that used to render every tick is now zero. The shop is fully responsive HTML.

---

## [5.37.10] - 2026-04-29

### Changed
- **Shop tabs reflowed to 4-per-row to match pause-menu width.** `tabsPerRow` 3 → 4, so the 6 shop tabs lay out as **4 + 2** rows instead of **3 + 3**, giving each tab a narrower cell that matches the pause-menu strip. Tab colors / fonts / heights unchanged.
- **Pause-menu tabs gained per-category colors mirroring the shop palette.** The 7 pause tabs no longer share a single white border. Each tab now uses a CSS custom property `--tab-color` driven by its `data-tab` attribute, with hover/active states tinting the background and border via `color-mix`. Width stays the 4-column grid from 5.37.8. Color assignments:
  - `controls` — neutral silver `#cccccc`
  - `primary` — shop cyan `#00ccff`
  - `power` — shop red `#ff4444`
  - `skills` — shop purple `#aa66ff`
  - `powerups` — shop gold `#ffd700`
  - `music` — shop green `#44dd88`
  - `sfx` — orange `#ffa500`

---

## [5.37.9] - 2026-04-29

### Changed
- **Shop tab labels enlarged.** Tab font bumped from 14px → 18px (matching the pause-menu tab size set in 5.37.8); tab cell height grew 36 → 44 to keep proportional padding around the bigger glyphs. The 3 × 2 grid layout from 5.37.7 is unchanged — `drawShopTabs` still returns the strip's full height so the scrollable item region below adjusts automatically.

---

## [5.37.8] - 2026-04-29

### Changed
- **Pause-menu tab strip enlarged and reflowed to a 4×2 grid.** The 7 pause-menu tabs (CONTROLS / PRIMARY / POWER / SKILLS / POWERUPS / MUSIC / SFX) used to ride a single flex row with 14px labels, which crammed them into a thin strip on wide screens. Switched `.pause-tabs` from `flex` to `grid-template-columns: repeat(4, minmax(0, 1fr))` so the tabs always wrap to two rows (4 + 3 layout), capped the strip at `min(720px, 100%)` and centered it. `.pause-tab` font bumped 14px → 18px, padding 9px/14px → 14px/18px, with `white-space: nowrap` and `text-align: center` so the labels stay tidy in their grid cells.

---

## [5.37.7] - 2026-04-29

### Changed
- **Shop category tabs reflowed to 3 × 2 grid with bigger labels.** The 6 shop tabs (OFFENSE, DEFENSE, DROPS, PRIMARY, POWER, SKILLS) used to be crammed into a single row at 28px tall with 10px font, which left each tab narrow and the labels small. Now: two rows × three columns, 36px tall per row, 14px label font (was 10px), 6px row gap. `drawShopTabs` returns the full tab-strip height so the scrollable item region below adjusts automatically — no more hard-coded `tabsY + 40`. Click hit-testing tracks each tab's per-row Y, so all 6 tabs remain clickable in their new positions.

---

## [5.37.6] - 2026-04-29

### Fixed
- **Shop SKILLS tab showed a gold-coin icon for items priced in SP.** Skills set `isSkill: true` and `currency: 'SP'`, but the row renderer in `shop-renderer.js` lumped them into the same `isWeaponOrSkill` branch as primary/power weapons. That branch always slapped a gold-coin icon next to `actualCost`, treating the SP cost as if it were coins. Added an explicit `item.currency === 'SP'` sub-branch ahead of the dual-cost path: for SP-only items it now renders a single blue "X SP" line (color matches the existing canAfford logic), no gold-coin icon. The dual-cost rendering is preserved for weapons that genuinely mix coins + SP.

---

## [5.37.5] - 2026-04-29

### Changed
- **Destruction flash refined — present and obvious, no longer in-your-face.** Three coordinated changes so kills still feel weighty without washing the screen white:
  - **Particle alpha cap** (`world/particle.js` `explosionFlash` draw): peak `globalAlpha` reduced from 0.9 → 0.55, life curve switched from linear to `pow(life, 1.5)` so the flash eases out instead of sitting at peak. Inner gradient stops softened (center 1.0 → 0.85, mid 0.7 → 0.45, fringe 0.2 → 0.12).
  - **Spawn radius** scaled back: asteroid `baseRadius * 2.2` → `baseRadius * 1.5`; enemy `radius * 3.0` → `radius * 2.0`. The flash still reaches well past the silhouette but no longer dominates the screen.
  - **Screen flash overlay** (`triggerScreenFlash` strength): asteroid small `0.07 → 0.035`, asteroid large `0.12 → 0.06`, enemy `0.15 → 0.07`. Roughly halved across the board.

---

## [5.37.4] - 2026-04-29

### Changed
- **Destroyed enemies now scatter full-silhouette debris like asteroids do.** `createShapeDebris` previously emitted only 6 short stubs (each ≤ `radius * 0.5` long), so enemy explosions felt visually empty next to asteroid kills which throw 30 wireframe edge segments outward. Replaced with a per-type vertex list that traces the actual hull outline at full radius plus a few internal struts/spokes, then emits one debris segment per consecutive outline pair plus all struts via the existing `lineDebrisPool`. Counts by type:
  - HUNTER (triangle-ish ship): 4 outline + 2 hull braces = 6 segments
  - GUARDIAN (square): 4 outline + 2 diagonals = 6
  - WASP (diamond): 4 outline + 2 cross braces = 6
  - TITAN / TANGERINE (8-sided): 8 outline + 8 inner ring + 4 spokes = 20
  - STALKER (plus/cross): 12 outline + 2 cross braces = 14
  - All others (DRIFTER / PROWLER / WEAVER / SENTINEL): 6 outline + 6 inner-ring struts = 12
- Each segment uses the enemy's color and inherits the existing `LineDebris` physics/fade. The existing per-frame asteroid debris debris-vs-fade behavior is unchanged.

---

## [5.37.3] - 2026-04-29

### Changed
- **Powerup body gradients now cached per color pair.** The previous draw built **two fresh `createRadialGradient` objects every frame for every onscreen powerup** (outer aura + body fill). Each call allocates a CanvasGradient and uploads its color stops to the GPU, so with 3–6 powerups onscreen this was 6–12 gradient allocations per frame just for pickups. Replaced with a module-level `Map` keyed on `gradientColors[0]+'|'+gradientColors[1]` — there are 19 powerup types, so the cache fills once and stays small. The pulse-scaling effect (`pulse` oscillates 0.7→1.0) is now applied via `ctx.scale(pulse, pulse)` so the cached gradient and the body path stay in sync without rebuilding the gradient at the new radius. Side benefit: the icon font string (`bold ${currentRadius * 0.8}px Arial`) is no longer reallocated per frame either — `POWERUP_ICON_FONT` is a module constant since the unscaled radius is fixed at 18. Net: zero per-frame gradient/string allocations in the powerup draw path.

---

## [5.37.2] - 2026-04-29

### Changed
- **Render perf quick wins.** Six low-risk hot-path edits surfaced by a rendering audit:
  - `powerup.js`: `Date.now()` → `frameClock.now` (the cached per-frame timestamp), and dropped `shadowBlur=3/shadowColor='#000000'` on the icon — the existing stroked-black outline already provides legibility, and `shadowBlur` runs a Gaussian pass per glyph.
  - `asteroid.js` `drawTargetingEffect` and `enemy/shapes.js` targeting effect: replaced live `shadowBlur` on stroked rings (one of the slowest canvas patterns) with a fake-glow trick — a wider, fainter ring underneath plus a sharp ring on top. Visually equivalent, no Gaussian pass.
  - `enemy-bullet.js`: dropped `shadowBlur=4` on the BOMB label; replaced with `strokeText` (a black outline pass), which is far cheaper.
  - `world/particle.js`: hoisted the damage-number font string into a module-level `DAMAGE_NUMBER_FONT` constant so the template literal isn't reallocated once per particle per frame.

These don't change visuals meaningfully but eliminate repeated Gaussian-blur work on every frame for any active targeting reticle, every onscreen powerup, and every onscreen bomb projectile.

---

## [5.37.1] - 2026-04-29

### Fixed
- **Powerups dropped by enemies now last a long time and fade out gracefully.** The Powerup class set `this.life = 20s` in `reset()` but `update()` never decremented it, so the surrounding code claimed "powerups never despawn." In practice players reported them disappearing — most likely from off-screen wraps making them hard to find. Replaced the dead `life` field with a real explicit lifetime: 90s of full visibility, then a smooth `sqrt`-eased fade over the final 8s, then released by the pool's normal `cleanupInactive` sweep. The fade alpha is multiplied into every existing `globalAlpha` override (body, sparkle ring, label) so all visuals dim together rather than the body vanishing while the label hangs in the air.

---

## [5.37.0] - 2026-04-29

### Changed
- **Ramming is no longer a viable strategy against asteroids or enemy ships.** Previously the player dealt 25 damage to asteroids (10–18 HP → instant kill) and 50 damage to enemies on contact, so flying head-first into things was a faster, safer "weapon" than actually shooting. Now contact does only a 2-damage scrape to asteroids and 5 damage to enemies — enough to finish a near-dead target but never enough to make ramming the optimal play.
- **Stronger collision deflection.** To match, the player now gets launched off whatever it hits. `ASTEROID_KNOCKBACK_MULTIPLIER` 12.0 → 22.0, `BOUNCE_FORCE_MULTIPLIER` 6.0 → 12.0, `BOUNCE_RESTITUTION` 0.8 → 0.9, `OVERLAP_PUSH_FORCE` 2.0 → 5.0, `SEPARATION_BUFFER` 5 → 6. Combined with the lower contact damage, the player is now shoved decisively away from the surface instead of being able to sit inside the hitbox grinding it down.
- **Asteroid hit-spark embers fade more gracefully.** The soft circular glowing dots that linger when a bullet strikes an asteroid (`explosionEmber`) now fade with a `pow(life, 0.55)` curve so they hold their brightness through most of the lifetime and ease out gently at the tail instead of dimming linearly. Lifetime stretched ~67% (decay 0.015 → 0.009/frame, roughly 1.1–1.8s → 1.8–3.0s) so they feel like cooling embers rather than flickering out. Both the inner dot and the additive `screen`-composited halo follow the same curve. (The line-debris segments from destroyed asteroids are unchanged — an earlier experiment with shadowBlur there hurt perf and was reverted.)

---

## [5.36.3] - 2026-04-29

### Changed
- **Target HP header now uses three distinct font sizes.** Previously `LV.` and the level number shared one font size (22px) and the name was 16px. Split into three independent sizes, each bottom-aligned with the name baseline so the row reads cleanly: `LV.` label at 12px (blue `#5DA9FF`, smallest), level number at 18px (red `#E74057`, middle), enemy name at 22px (gold `#FFD700`, largest). Each piece is measured at its own font size before layout so the LV block stays flush to the name's left edge regardless of digit count.

---

## [5.36.2] - 2026-04-29

### Changed
- **Top-of-screen target HP display rebalanced.** The `LV.N` indicator and the enemy name swapped visual weight: level font bumped from 14px → 22px so it reads at a glance, enemy name dropped from 22px → 16px so it no longer dominates the row. Existing bottom-alignment math keeps the (now larger) LV block flush with the (now smaller) name's baseline, and the health bar slides up the few pixels naturally — no manual layout tweaks needed.

---

## [5.36.1] - 2026-04-29

### Changed
- **Pause-menu controls list font enlarged.** Each control row in the CONTROLS tab now uses 1.25rem with 1.4 line-height (was inheriting the smaller default), and the boxed `.control-symbol` chips bumped from 1.5rem to 1.75rem so labels like `WASD` / `LEFT-CLICK` read clearly. Row spacing nudged from 6px to 10px to keep the list breathing at the larger size.

---

## [5.36.0] - 2026-04-29

### Changed
- **Asteroid hit flash now propagates as a wave across every edge.** Previously the damage flash filled the entire dodecahedron silhouette uniformly white for the duration of the timer — every face lit at once, no spatial cue from where the bullet struck. Replaced with a per-edge propagation: each edge's brightness follows a Gaussian centered on a wavefront that expands outward from the world-space impact point, so the lattice lights up in a ring that sweeps across all 30 edges of the dodecahedron over the 10-frame window. Edge midpoint distance is normalized by the asteroid's diameter, the wave moves 0→1.1 over the flash duration, and intensity below 2% is culled. The localized hit-point glow, expanding ring, and directional debris remain unchanged.

---

## [5.35.2] - 2026-04-29

### Fixed
- **Charge Shot kept charging past full.** `updateChargingSystem` clamped the visual `chargeLevel` to 1.0 and toggled `isFullyCharged` once the configured max was reached, but `fireChargedShot` then read the *raw* unclamped elapsed-time value when computing size, speed, damage bonus, and crit-chance bonus — so holding the fire button past the max charge window kept making the shot bigger and stronger forever, despite the HUD showing "fully charged." Fixed by clamping `chargeTime` to `reducedMaxChargeTime` before the multiplier math in `fireChargedShot`, so all derived values cap at the intended ceiling (~3 damage / +20% crit / 3× size at 5s default).

---

## [5.35.1] - 2026-04-27

### Fixed
- **Asteroid fragments visibly "jumped" apart on split.** Three things conspired: (1) fragment trajectories were assigned random angles, so two siblings could end up flying nearly the same direction and stay overlapping; (2) spawn used a `±20% of radius` positional jitter that pre-scattered fragments in an artificial-feeling way; (3) the 750ms collision-immunity window sometimes expired while fragments were still overlapping, at which point the asteroid-vs-asteroid collision system applied its positional `overlap` displacement and teleported them apart in one frame. Fixed by distributing fragment angles evenly around 360° (with ±25% slice-width jitter for organic feel — guarantees every pair diverges), spawning at the parent's exact center (velocity does all the separation, no artificial scatter), and bumping the immunity window to 2500ms so even the slowest-separating pair has cleared overlap before collisions kick in. Verified with a probe: fragments now separate monotonically (~85px/sec gap growth) and are 90px clear of overlap by the time immunity expires.

---

## [5.35.0] - 2026-04-27

### Changed
- **Every SFX redesigned for richness and futuristic character.** All 26 sounds in `sound-defs.js` are now multi-layer (most 3 layers, a few 2) — including the basic `shoot` / `hit` / `coin` / `explosion` / `playerExplosion` ones that previously rode bare sfxr presets. Common sonic vocabulary across the library:
  - **Sub-bass body** (sine / low square): adds weight and "felt" impact under every hit.
  - **Mid-impact carrier** (square, often duty-modulated): the recognizable note of the sound.
  - **High HPF'd transient or arpeggiated tail**: brightness, sparkle, tech sheen.
  - **Sweeps + arp_mod + vibrato**: most layers move in pitch (descending energy bursts, rising chimes, warbling beams) instead of staying static.
- **Specific upgrades**:
  - `shoot`: square pew with downward sweep + sub-bass thump + HPF brightness flash. Replaces the bare `laserShoot` preset.
  - `hit`: synthetic kinetic slap with arp + HPF noise transient (was bare `hitHurt` preset).
  - `coin`: 3-tone crystalline tinkle — sine root with rising sweep + square harmonic with vibrato + HPF arpeggio sparkle (was bare `pickupCoin`).
  - `explosion` / `playerExplosion`: sub-bass boom + LPF noise body + HPF crackle. `playerExplosion` adds a sawtooth power-down whine for the cataclysmic feel.
  - `tractorBeam`: square hum + sine harmonic, both with vibrato — sustained energy field instead of a static drone.
  - `shield`: noise wash + crystal sine ping with rising sweep — force-field bloom.
  - `healthRegen`: warm LPF'd sawtooth + healing sine harmonic with arp.
  - `playerHitAsteroid`: noise punch + sub-bass rumble + metallic ring layer.
  - `playerHitEnemy`: square clang + sub-impact + bright HPF alarm pip.
  - All `enemyHit_*` and `playerHit_*` sounds gained a 3rd layer (where appropriate) — high HPF transients on small hits, sub-bass impacts on heavy hits, arpeggiated tails on energy weapons.
- **Library size**: 26 files / 620 KB → 26 files / 904 KB (still tiny). File counts unchanged — same 26 sounds, just denser per file.

---

## [5.34.0] - 2026-04-26

### Changed
- **SFX library redesigned with multi-layer SFXR compositions.** sfxr is monophonic — one wave, one envelope per voice — so the previous library felt thin. The generator now supports a `{ layers: [...] }` def shape: each layer is a separate sfxr render summed sample-wise into one WAV, then peak-normalized to 0.95. The result is a single playable WAV that carries body + impact + sparkle. Highlights:
  - **`powerup`**: 3-layer ascending chime — sine bell with rising arpeggio + square shimmer with vibrato + high HPF'd twinkle tail. Reads as a chord, not a synth voice.
  - **`playerHitAsteroid`** (player ship rams asteroid): noise punch + sub-bass sine rumble.
  - **`playerHitEnemy`** (player ship rams enemy): square clang with downward arp + bright HPF'd alarm pip.
  - **`playerHit_*`** (per-weapon bullet→enemy/asteroid): each weapon now has weight appropriate to its damage profile — PULSE_CANNON gets a punchy plasma blast over a low warm body; STORM_NEEDLES stays a thin tick (one voice — it's a fast SFX); SCATTER_GUN gets a noise-crunch over low body; RAIL_DRIVER gets a heavy arp'd clang with sub-bass; LANCE_BEAM gets a saw fizz with a high zap.
  - **`enemyHit_*`** (per-pattern bullet→player): hunter gets a clean kinetic ping; guardian a warm chord; missile a deep boom + ringing tail; arc_lightning a noise crackle + zap pip; lay_mine a bassy thud + ring; etc. Each pattern is sonically distinct so the player learns to read incoming threats by ear.
- **Generator output simplified to one WAV per sound.** No more 10-variant directories. `sfx/<name>.wav` lives at the manifest root; manifest is `{ sounds: { name: 'sfx/name.wav' } }`. Library shrank from 260 files / 2.7 MB to 26 files / 620 KB.
- **Generator emits 16-bit PCM at 44.1 kHz.** Previous output rode jsfxr's 8-bit WAV encoder; layered mixing needs floating-point intermediate samples and 16-bit gives the headroom to encode the mix without quantization audible on the bass layers.

### Removed
- **Re-roll feature.** With one curated WAV per sound, the per-sound 🎲 button and the "REROLL ALL" button serve no purpose. Removed:
  - `audioManager.rerollSound(name)` and `audioManager.rerollAllSounds()`
  - The per-sound reroll button in `createSfxToggles()`
  - `setupRerollAllButton()` and the `#reroll-all-sfx` element reference
  - The "🎲 REROLL ALL" button div in `index.html`
  - `.sfx-reroll-button` styles in `styles.css`
- **Variant tracking** in `AudioManager` (`activeVariant` map, `_loadRandomVariant`) — replaced with a single decode pass over the manifest URLs.

---

## [5.33.0] - 2026-04-26

### Changed
- **SFX pipeline replaced with pre-rendered WAV library.** Sounds were previously synthesized live via the SFXR CDN bundle (`sfxr.toWebAudio(params, ctx)` rendering an AudioBuffer at init from a JS params object). Now `tools/scripts/generate-sfx.js` runs offline, generating 10 distinct variants per sound (260 WAVs total under `sfx/<name>/<NN>.wav`) plus a `sfx/manifest.json` that maps sound name → variant URLs. At game load, `AudioManager.init()` fetches the manifest, picks one random variant per sound, and decodes it into an `AudioBuffer` via `decodeAudioData`. `playSound()` is back to its simplest form — `createBufferSource` + `GainNode` + `start(0)` — with no scheduling cursor, no per-sound throttle, no decode-on-the-fly. Removes the runtime dependency on the sfxr CDN scripts (`https://sfxr.me/{riffwave,sfxr}.js` no longer loaded).

### Added
- **`sfx/` directory** holding 260 pre-rendered SFX variants (~2.7 MB). Regenerable any time via `npm run generate-sfx` (`--clean` to wipe first, `--variants=N` to change the count).
- **`js/modules/audio/sound-defs.js`** — single source of truth for SFX. Each entry is either `{ preset: 'laserShoot', overrides? }` (re-rolled per variant via `sfxr.generate`) or `{ params: {...}, jitter? }` (mutated per variant via `jitterParams`). Both the offline generator and the runtime import this module.
- **Per-sound re-roll wired through to swap variants live.** The pause menu's SFX tab `🎲` button calls `audioManager.rerollSound(name)`, which picks a different variant from the manifest, fetches+decodes it, and replaces the cached buffer. Subsequent `playSound(name)` calls use the new variant.
- **`npm run generate-sfx`** script.

### Removed
- Inline `sfxr.generate(...)` and custom params object inside `audio-manager.js` constructor — moved to `sound-defs.js`.
- Sfxr-readiness wait + 5s timeout in `main.js` `setupAudio()` — no longer needed (no global `sfxr` dependency at runtime).
- `audioCursor` / `beginLogicTick` cross-tick spreading and per-sound `nextPlayTime` throttle (introduced in 5.32.4–5.32.5, neutralized in 5.32.6) — fully removed; `beginLogicTick` retained as a no-op for engine call-site compatibility.
- The complex `rerollSound` switch statement that had per-sound regeneration logic in code — replaced with a one-liner that picks a different variant URL from the manifest.

---

## [5.32.6] - 2026-04-25

### Fixed
- **Collision SFX silently dropped after the v5.32.5 per-sound throttle.** The throttle was scheduled to drop repeats of the same sound name when `nextPlayTime` queued more than 0.5s ahead of `currentTime` — but in real continuous combat (rapid-fire onto multiple enemies, asteroid impacts, sustained beam contact) `nextPlayTime` accumulated faster than I modeled and the cap kicked in within seconds, silencing player-bullet hits, asteroid bumps, and enemy-bullet hits. A 2-second probe only saw mild drops; longer sustained gameplay hit the cap hard.

### Reverted
- Removed the `audioCursor` / `beginLogicTick` cross-tick spreading mechanism (v5.32.4) and the `nextPlayTime` per-sound repeat throttle (v5.32.5). `playSound()` is back to plain `src.start(0)` — same as v5.32.3. The "delayed then all at once" burst the cursor and throttle were trying to fix is a real but lower-priority phenomenon than dropped collision SFX; better to live with occasional same-tick stacking than have entire categories of sound silently disappear. `beginLogicTick(dtMs)` is kept as a no-op so the engine call site stays compatible if we revisit scheduling.

---

## [5.32.5] - 2026-04-25

### Fixed
- **SFX still bursting "all at once after a delay" despite the v5.32.4 cursor fix.** The cursor only spread sounds across logic *ticks* — but multi-pellet weapons (SCATTER_GUN's 5 pellets), hitstop releases (a frame's worth of bullets all landing in the catch-up tick), and rapid-fire onto clusters all generate multiple plays of the *same* sound name *within one tick*. Same-tick plays share an audio timestamp by design, so Web Audio fired them simultaneously and the user heard one loud blast instead of distinct hits. Added a per-sound rolling cursor `nextPlayTime[soundName]` enforcing a 30ms minimum gap between repeats of the same name; different names coexist freely (a `playerHit_PULSE_CANNON` and an `explosion` in the same tick still play together — they're meant to). Repeats queued more than 500ms ahead of `currentTime` drop, so a sustained spray of one sound doesn't accumulate seconds of trailing audio that play after the action stopped.

---

## [5.32.4] - 2026-04-25

### Fixed
- **SFX bursting after a perceived delay.** The game loop uses a fixed-step accumulator (`game-engine.js:1037`) that runs multiple `update()` ticks inside one `requestAnimationFrame` whenever the renderer hitches (long frame, hitstop release, post-pause catch-up). Every collision in those bunched-up ticks called `playSound()` synchronously, and each `src.start(0)` resolved to the same `AudioContext.currentTime` — Web Audio honored that and played them all at one instant instead of across the logical 16.67ms gaps the ticks actually represented. Now `AudioManager` carries an `audioCursor` that the engine advances via `beginLogicTick(dtMs)` before each fixed-step tick; `playSound()` schedules at the cursor (clamped to `currentTime`). Sounds inside one tick still share a stamp (correct — they happened "together" in game time), but sounds across bunched ticks march out by the tick interval. Clamping to `currentTime` keeps a stale cursor (e.g., long background-tab pause) from scheduling deep in the past.

---

## [5.32.3] - 2026-04-25

### Fixed
- **Per-weapon hit SFX (`playerHit_<weaponId>`) were silent for every primary weapon.** Only `createChargedBullets` (the charge-shot power) was stamping `bullet.weaponId`; the bullet pools spun up by `firePulseCannon`, `fireStormNeedles`, `fireScatterGun`, and `fireRailDriver` left `weaponId` undefined, so `audio:enemy-hit-by-bullet` resolved to the generic fallback `playHit`. Stamping moved into `applyGlobalBulletUpgrades` (the one chokepoint every primary fire path runs through) and unconditionally overwrites — bullets are pooled, so a stale weaponId from a previous use must be replaced, not preserved.
- **LANCE_BEAM hit-SFX never played.** The beam doesn't go through the bullet pool, so it bypassed the `audio:enemy-hit-by-bullet` emit in the bullet-vs-enemy collision branch. `checkLanceBeamCollisions` now emits the same event with `'LANCE_BEAM'` once per beam-tick, throttled to ~6/sec via `player._lastBeamHitSfx` so the short sustained tone doesn't smear into a buzz at 60fps.

---

## [5.32.2] - 2026-04-25

### Changed
- **SFX engine swapped to WebAudio.** Each `playSound()` now spins up a fresh `AudioBufferSourceNode` + `GainNode` per call, so concurrent voices are unbounded — no pool, no throttle, no rewinding of in-flight playback. The old HTMLAudioElement pool capped each sound at 2 simultaneous instances and rewound the oldest on overflow, which silenced rapid-fire SFX (player shoot, swarm bullet hits, multi-enemy explosions). Buffers are rendered once at init via `sfxr.toWebAudio(params, ctx)` (`AudioBufferSourceNode.buffer` extracted directly — no WAV byte round-trip). AudioContext is created lazily and resumed on the first user gesture (`initializeAudio()`) to satisfy autoplay policy. `rerollSound()` re-renders the buffer when params change. Background music stays on `HTMLAudioElement` (single long track, no concurrency need).

---

## [5.32.1] - 2026-04-26

### Added
- **17 new procedural SFX** generated via SFXR for granular combat audio:
  - **Player damage**: `playerHitAsteroid` (low rocky thud), `playerHitEnemy` (sharp metallic clang).
  - **Enemy bullet hits player** — one per `shootPattern` (10 sounds): `hunter_single`, `guardian_spread`, `wasp_machinegun`, `charged_laser`, `arc_lightning`, `missile`, `spiral_laser`, `sentinel_sweep`, `lay_mine`, `sweep_laser`.
  - **Player bullet hits enemy/asteroid** — one per primary weapon (5 sounds): `PULSE_CANNON`, `STORM_NEEDLES`, `SCATTER_GUN`, `RAIL_DRIVER`, `LANCE_BEAM`.
- Player bullets now stamped with `bullet.weaponId = activePrimary` in `createChargedBullets`. Enemy bullets stamped with `firingPattern` via a thread-local `gameEngine._activeShotPattern` set by the `shoot()` dispatch wrapper and read in `EnemyBullet.reset()`.
- 5 new audio events on the engine bus (`audio:player-hit-asteroid`, `audio:player-hit-enemy`, `audio:player-hit-bullet`, `audio:enemy-hit-by-bullet`) with graceful fallback to generic `playHit` when a sound name isn't registered.

### Changed
- **Music playlist regenerated** — picked up 8 new tracks (55 → 63). Fixed stale `tools/music` relative path in `tools/scripts/generate-playlist.js` (was `../music`, needed to be `../../music` to resolve from `tools/scripts/`).

### Fixed
- **New SFX were silently dropped at runtime.** `playSound()` gates on `this.soundEnabled[soundName]`, but the new sounds weren't in the explicit 9-entry whitelist set in the constructor. Now `init()` auto-enables any sound registered in `audioCache` after the explicit list is built — original 9 keep their stable ordering for the SFX-toggle UI, all new SFX work without manual roster updates.

---

## [5.32.0] - 2026-04-26

### Added
- **Pause-menu PRIMARY tab** — lists every primary weapon (Pulse Cannon, Storm Needles, Scatter Gun, Rail Driver, Lance Beam). Click a row to equip. Primaries are free and always available. Active weapon shows an `EQUIPPED` badge in its signature color.
- **Pause-menu POWER tab** — same model as PRIMARY: lists all 5 power weapons (Charge Shot, Mine Layer, Nova Blast, Lightning Arc, Missile Salvo), free + click-to-equip. Adds to `ownedPowers` automatically on click for back-compat with `equipPower`'s gate.
- New `ui-manager._buildWeaponRow()` shared row builder using `createElement` + `textContent` (zero `innerHTML` — no XSS surface). Click handler wraps `onClick` with `e.stopPropagation()` so the click never reaches the pause-overlay's `dismissOnBackdrop`.
- Engine exposes `PRIMARY_WEAPONS_LIST` / `POWER_WEAPONS_LIST` so `ui-manager` can render the catalogs without importing `weapon-data` directly.

### Changed
- **Shop fullscreen redesign** matching the pause menu — drops the centered 600×500 windowed look. Now spans full viewport with 78% backdrop, edge margins, and a centered 900px-max content column for readability (mirrors the pause-menu's `min(900px, 100%)` rule).
- **Goldenrod scrollbar** — thin (12px) track + thumb, no arrow buttons, anchored to the right edge of the centered column. Track `#5a4509`, thumb `#FFC107`, hover/drag `#FFD740` — exactly matches the music-player CSS scrollbar.
- **Shop PRIMARY tab** now shows ONLY upgrades for the currently-equipped primary. Weapon SELECTION moved to the pause menu. Switching primaries in the pause menu causes the shop tab to repopulate with the new weapon's upgrades.
- **Shop POWER tab** mirrors PRIMARY — only shows upgrades for the currently-equipped power weapon, no buy items. (Power weapons are now free, granted on first click in the pause menu.)
- **Tab order** in pause menu: CONTROLS / PRIMARY / POWER / SKILLS / POWERUPS / MUSIC / SFX.
- **ESC inside the shop** routes to `closeShopToPause` via the existing `togglePause` SHOP→PAUSED branch, returning to the pause menu instead of gameplay.
- Updated shop footer instructions: `Click items to purchase  •  Press X or ESC to return to the pause menu`.

### Removed
- **Wave-gating** removed from both weapon catalog display (`_buildPrimaryTabItems`) and purchase logic (`_handleWeaponBuyOrEquip`). Every weapon was already free (cost: 0); they now appear and are equippable from wave 1. Bug: previously the `unlockWave` check silently returned `false` when clicking a wave-locked weapon, looking like the click did nothing.
- **Click-outside-shop-to-close** removed — easy to misclick. Shop only closes via the X button or ESC, both routed to `closeShopToPause`.

### Fixed
- **Pause menu closed on weapon-row click.** Sequence was: click row → row's listener calls `replaceChildren()` (re-render) → row is detached from DOM → click bubbles up to `dismissOnBackdrop` → `e.target.closest('#pause-menu')` returns null on the detached node → backdrop misclassifies as "click outside menu" → calls `togglePause()`. Fix: `e.stopPropagation()` in the row click wrapper before re-render. Applies to both PRIMARY and POWER tabs since they share `_buildWeaponRow`.

---

## [5.31.0] - 2026-04-26

### Added
- **Streak tier damage buff system** — kill streaks now grant tiered damage multipliers, replacing the previous one-tier "empowered" concept:
  | Kills | Tier         | Damage  | Color      |
  |-------|--------------|---------|------------|
  | 3+    | EMPOWERED    | +25%    | cyan       |
  | 6+    | UNSTOPPABLE  | +50%    | orange     |
  | 10+   | GODLIKE      | +75%    | pink-red   |
  | 15+   | LEGENDARY    | +100%   | gold (cap) |
- **Streak indicator HUD** (top-right corner, clear of pause button + minimap + enemy info + wave message). Three render modes:
  - **ACTIVE**: tier-colored count + label + `+X% DMG` + progress bar to the next tier (or `▲ MAX TIER` at LEGENDARY); pulses with shadow glow.
  - **SAVED**: dim grey-white when streak ≥ 3 but buff timer expired — `N KILLS / SAVED / ▶ KILL TO RE-ARM`.
  - **HIDDEN**: streak < 3 or 0.
- New constants in `weapon-data.js`: `STREAK_TIERS` (array of tier objects), `STREAK_BUFF_DURATION` (4000ms — buff timer refreshes on each new kill).

### Changed
- **No time-based streak reset.** Streak count persists indefinitely as long as the player avoids damage. Removed the old `STREAK_RESET_TIMEOUT = 3000ms` window and the corresponding decay in `updateKillStreak`.
- **Damage resets the streak.** New `_breakKillStreak()` engine helper hooked from all three player-damage paths: `lifecycle.takeDamage`, the direct `player.health -=` in `collision-system.js` for player↔enemy collision, and the same in player↔enemy-bullet collision. Phase Dash's `reducedDamage = 0` short-circuit means dashing through enemies preserves the streak. Bulwark's reduction still triggers (any HP loss counts).
- **`damageEnemy()`** now passes the bullet's `isCrit` / `isEmpowered` opts through to `enemy.takeDamage(damage, opts)` for AOE hits (mines, lightning, nova, missiles).

---

## [5.30.1] - 2026-04-26

### Changed
- **Power weapon damage scale-down** — Charge Shot was the worst offender (one-shotting most enemies):
  - **Charge Shot**: `baseDamage` per stack +1 → +0.5; per-second damage +1.2 → +0.6; per-second crit chance +8% → +4%
  - **Mine Layer**: 5 → 3
  - **Nova Blast**: 4 → 2.5
  - **Lightning Arc**: 3 → 2
  - **Missile Salvo**: 2 → 1.5
- **Enemy stats overhaul** — all 10 enemies tuned for "starts off more intensely":
  - **Speed +25%** (HUNTER 1.6→2.0, GUARDIAN 1.0→1.25, WASP 2.8→3.5, etc.)
  - **Turn speed +50%** (`movement.turnSpeed: 0.08 → 0.12`, Titan 0.04→0.06)
  - **Evasion +50%** (`ai.evasion`, capped at 0.7 for Wasp)
  - **Burst delay −30%**, **fire cooldown floor −25%** (more aggressive firing)
  - **Health −25%** (e.g., HUNTER 16→12, TITAN 60→45)
  - **Size −15%** (smaller silhouettes are harder to land hits on)

### Fixed
- **`firePower` was overwriting `powerCooldown`** AFTER each weapon's discount-aware setter ran — silently cancelling Resonance / Tesla Coil / Quick Reload / new Rapid Deploy upgrades. Now `firePower` no longer touches `powerCooldown` and each weapon's fire fn owns its own cooldown.

---

## [5.30.0] - 2026-04-26

### Added
- **Mine Layer cooldown reducer** — new `RAPID_DEPLOY` upgrade (-25% cooldown per stack, max 2 stacks: 4s → 3s → 2.25s). Mine Layer was the only power weapon without a cooldown upgrade.
- **Per-primary velocity-and-damage upgrades** — 5 new shop entries (one per primary weapon), +12% bullet velocity AND +12% damage per stack, max 3 stacks (~+36% sustained DPS at max):
  - PULSE_CANNON → `PULSE_VELOCITY` (High-Velocity Rounds 🚄)
  - STORM_NEEDLES → `NEEDLE_VELOCITY` (Hypersonic Needles 🚄)
  - SCATTER_GUN → `SCATTER_VELOCITY` (Powder Charge 🚄)
  - RAIL_DRIVER → `RAIL_VELOCITY` (Tungsten Slug 🚄)
  - LANCE_BEAM → `LANCE_VELOCITY` (Focused Lens 🚄, range/damage variant since beam has no projectile speed)
- **Crit visualization** — damage-number popups now render distinctly:
  - **CRIT**: 26px bold orange-red with white outline + `CRIT!` tag above (was indistinguishable from normal hits — that's why "I am not seeing any crits" was the user's perception)
  - **EMPOWERED**: 20px cyan
  - **Standard**: 16px gold (unchanged)
- **`isCrit` / `isEmpowered` propagation** — `createDamageNumber(x, y, damage, opts)` accepts the flags, `enemy.takeDamage(damage, opts)` forwards them, all collision-system call sites updated.
- **Top-center enemy info panel** — large gold name + 280px health bar + LV / HP/Max numbers, driven by `lastHitEnemy` (most recently damaged target, not click-targeted). Asteroids show too with synthesized "ASTEROID" name. Snapshot system with 900ms grace prevents flicker between rapid kills.

### Changed
- **Auto-fire removed.** Left-click is now press-and-hold to fire primary; releasing stops fire. `InputHandler` tracks left mouse button as `input.fire`.
- **Power weapon trigger** is now right-click OR Spacebar (mirrored via `input.fireSecondary`). Spacebar `e.preventDefault()` stops page scroll.
- **Page-blur** clears both fire flags so a tab-switch mid-click doesn't strand the input.
- **Base crit chance** bumped 5% → 8% so crits show up more reliably during play.
- **Around-enemy nameplate stripped** — only the raw HP bar floats above each enemy now (no level / name / HP numbers there). All that info lives in the top-center panel.
- **Wave message + powerup pickup label pushed down** to clear the new top-center enemy panel (wave title y=80 → 200; powerup pickup y=120 → 250).
- **Orb minimum sizes bumped** — `HEALTH_ORB_SIZE_MIN` 0.8 → 1.3, `MONEY_ORB_SIZE_MIN` 1.0 → 1.3. Smallest drops were unreadable.
- **Controls panel** in pause menu rewritten: LEFT-CLICK fires primary (held), RIGHT-CLICK or SPACE fires power weapon, 1-4 activate skills.

### Fixed
- **Top-center enemy info panel flickered on every player hit.** Hitstop fires on every hit (3-5 frames), and the hitstop-branch render path called `drawHUD()` and `drawDamageNumbers()` but **not** `drawTargetInfo()`. The panel popped out for the duration of the freeze, then back in. Adding `this.drawTargetInfo()` to the hitstop branch keeps it solid.
- **One-frame staleness** in the panel — `_setLastHit` captured pre-damage HP, then snapshot-mirror updated post-damage HP next tick. Caused per-tick bar/numbers jitter on every Storm-Needles tick. Now the panel reads `info.ref.health` LIVE at draw time when the entity is alive, falls back to snapshot during the grace period after death.
- **Latent bug** in `combat-manager.getPowerupConfig` dynamic fallback path now correctly handles the new upgrade IDs (PULSE_VELOCITY etc.) without manual registration in the explicit configs map.

---

## [5.29.0] - 2026-04-25

### Added
- **Desktop-only gate at boot.** A new `isMobileOrTabletDevice()` check at the top of `js/main.js` runs before any game code initializes. If the browser reports a coarse pointer with no hover (`(hover: none) and (pointer: coarse)`) OR a viewport narrower than 1024 px, the game is **not** initialized — no audio download, no canvas loop, no input handlers — and a fullscreen "Desktop only" panel is shown instead.
- **`#desktop-only-block` overlay** in `index.html` + CSS — fullscreen `Press Start 2P` panel with a 🖥️ icon, "Desktop only" headline, and a body explaining the game requires mouse and keyboard. `body.desktop-only-blocked > *:not(#desktop-only-block) { display: none !important }` ensures no leftover DOM peeks through behind it.

### Removed
- **All mobile / touch support** — Rainboids is now keyboard + mouse only. This is a behavior change for any users who were previously playing on a phone or tablet (movement-only mode); they will now hit the desktop-only block.
- **Touch input system in `InputHandler`** — `setupTouchControls`, dynamic two-finger joystick (`showDynamicJoystick`, `updateDynamicJoystick`, `hideDynamicJoystick`, `resetDynamicJoystick`), `testMultiTouch`, all `touchstart` / `touchmove` / `touchend` listeners, the `activeTouches`/`joystickTouchId`/`aimTouchId`/`joystickCenter` state, and the entire `isMobile()` method. Replaced with a clean keyboard + mouse only implementation.
- **Mobile auto-aim** in `game-engine.js update()` — the branch that locked the player's aim onto the nearest enemy when no mouse was present is gone.
- **Mobile branch in `updateControlsTab`** — the "LEFT THUMB / RIGHT THUMB / || BTN" instructions are removed; only the keyboard + mouse layout remains.
- **All canvas touch listeners in `event-setup.js`** — including the shop scroll/tap touch handlers.
- **Pause-menu touch listeners in `ui-manager.js`** — backdrop dismissal, shop button, resume button, HUD pause button, and tab switching all relied on `touchstart` to defeat synthetic-click suppression on mobile. Removed.
- **Window `touchstart` startGame listener** in `js/main.js`.
- **Mobile font-scaling** — the `fitFont` helper in `drawTitleScreen`, the `isMobile`-conditional font branches in `drawWavyText` (`hud/overlays.js`) and the wave message HUD (`hud/status.js`), and the "TAP TO START" alternate prompt are all gone. Title-screen text uses fixed sizes.
- **Mobile cursor early-return** in `hud/cursor.js`.
- **Mobile portrait restart prompt** in `player.js` — the "Tap Screen to Restart" alternate text was removed; game-over now always says "Press Enter to Restart".
- **`MOBILE_SCALE` constant** in `core/constants.js`, plus the 7 local `isMobile()` functions in `world/asteroid.js`, `world/color-star.js`, `world/background-star.js`, `player/player.js`, `player/bullet.js`, `player/weapons.js` that scaled entities by 0.65 on mobile. Replaced with always-1.
- **`<div id="orientation-overlay">`** (rotate-to-landscape message) and its CSS (`#orientation-overlay`, `.rotate-icon`).
- **`<div id="mobile-controls">`** container and its CSS (`#mobile-controls`, `.control-button`).
- **All mobile CSS media queries** — both `@media (max-width: 768px), (hover: none) and (pointer: coarse)` blocks (pause-menu scaling and `#mobile-controls` / `#score` / `#music-info` overrides).
- **`checkOrientation()` and `isPortrait()`** from `core/utils.js`. `triggerHapticFeedback()` is reduced to a no-op so existing call sites in `collision-system.js` keep linking but vibration code is gone.
- **Stub fall-through `inputHandler.setupTouchControls()`** call in `game-engine.start()`.
- Net code removal: ~500+ lines across `js/`, `css/`, `index.html`.

### Changed
- **Controls section in README** rewritten to a single keyboard + mouse list with a one-line note that the game is desktop / laptop only.
- **`InputHandler` rewritten from scratch** as a focused keyboard + mouse handler. Mouse-move no longer needs to skip synthetic touch events.
- **`updateControlsTab()`** simplified to a single layout (no platform branching).
- **`drawHUD()`** in `hud/status.js` no longer toggles between DOM and canvas pause buttons — always uses the DOM `#hud-pause-btn`.

### Verified
- Chromium @ 1280×720: desktop-only block hidden, `gameEngine` boots, state = `TITLE_SCREEN`, no console errors.
- Chromium emulating iPhone 13 (390×844, `hasTouch`, `isMobile`): desktop-only block visible, `body.desktop-only-blocked` set, `window.gameEngine` is `undefined` (game never initialized), no console errors.

---

## [5.28.2] - 2026-04-25

### Removed
- **Dead loading code purged from `js/main.js`** — removed `setupLoadingScreen`, `loadAssets`, `hideLoadingScreen`, the `assetLoader`/`loadingScreen` instance fields, the orphaned `AssetLoader` import, and several empty `if(canvas)` debug branches. The loading screen had been DOM-commented for a while; the JS plumbing is now gone too.
- **`js/modules/asset-loader.js` deleted** — no remaining importers anywhere in `js/`, `tests/`, `tools/`, or `index.html`.
- **Five orphan performance modules moved to `deprecated/js/modules/performance/`** — `enhanced-performance-manager.js`, `optimized-pool-manager.js`, `optimized-entities.js`, `particle-system-wrapper.js`, `performance-manager.js`. None had any importers. Active `js/modules/performance/` retains the 11 modules that are actually imported.

---

## [5.28.1] - 2026-04-25

### Fixed
- **Powerup-indicator icons not vertically centered in their circles** — `textBaseline: 'middle'` doesn't visually center emoji because the glyph's visual center isn't the em-box midpoint, so icons like ⭐ (Critical Chance) rode noticeably low. `drawPowerupIndicators` (`js/modules/hud/combat.js`) now measures each glyph with `ctx.measureText(...)` and offsets by `(actualBoundingBoxAscent − actualBoundingBoxDescent) / 2` from the alphabetic baseline, with constant fallbacks for browsers (older Safari) that report 0 metrics for emoji. All powerup icons now sit at their true visual center.

---

## [5.28.0] - 2026-04-25

### Added
- **Global health-orb drop cooldown** — green orbs now drop at most once every 60s by default (`HEALTH_DROP_COOLDOWN_BASE`). Without this throttle the player was effectively continuously healed and the game became trivial. Cooldown resets on game restart.
- **Triage defense upgrade** ⏳ — new SP-cost upgrade (2 SP, max 6 stacks) reduces the health-drop cooldown by 5s per stack down to a 30s floor. Available in the shop's DEFENSE tab; powerup-config + HUD indicator wired up.

### Changed
- **Game difficulty raised** — combination of the health-drop cooldown + smaller orb values means survival pressure is materially higher. Players who want pre-5.28.0 healing density should buy Triage stacks.

---

## [5.27.1] - 2026-04-25

### Changed
- **Money and health orb size caps lowered** — `HEALTH_ORB_SIZE_MAX` 2.5 → 1.4 and `MONEY_ORB_SIZE_MAX` 3.5 → 1.6. Orbs no longer balloon to massive sizes on big drops.
- **Drops split into many small orbs instead of one big one** — added per-orb value caps (`HEALTH_ORB_MAX_HEAL_PER_ORB: 2`, `MONEY_ORB_MAX_MONEY_PER_ORB: 20`). `dropOrbsFromEntity` now computes the legacy heal/money budget and splits it across `ceil(budget / cap)` smaller orbs whose values sum to the same total. Same total reward, denser visual feedback, no individual orb dominates the screen.
- **`createHealthOrb`/`createMoneyOrb` accept a value override** — used by the budget splitter; falls back to the existing min/max random formula when called without an override (back-compat for any other call sites).

---

## [5.27.0] - 2026-04-25

### Added
- **Powerup pickups now have full magnetism** — the spinning powerup entities use the same layered magnet behavior as money/health orbs in `color-star.js`: always-on base homing pull, ramped attraction inside 100px and again inside 40px, plus tractor-beam long-range pull when not charging. Forces are scaled by 0.55 since powerups are larger/heavier visually so they don't rocket into the player. Friction now matches `GAME_CONFIG.ORB_FRIC` for consistent feel. Replaces the previous weak 120px attraction radius.
- **`tractorEngaged` plumbed to `Powerup.update()`** — `game-engine.js` now passes the same flag the orbs already get.

---

## [5.26.1] - 2026-04-25

### Changed
- **Title screen optical alignment** — `RAINBOIDS` shifted +10px right to optically center with the subtitle below it (the wavy "R" leading edge sits left of where monospace baseline-centering suggests).
- **Subtitle/prompt text no longer bobs** — `SUPERCHARGED ASTEROIDS`, `PRESS ANY KEY TO START` / `TAP TO START`, `Survival Record`, and the in-game wave subtitle (`WAVE N INCOMING…`) now use `amplitude: 0` — gradient still slides across the text, but no vertical motion, for cleaner readability beneath the bigger wavy headline above each one.

---

## [5.26.0] - 2026-04-25

### Added
- **Wavy rainbow text rendering system** — new `drawWavyText(text, x, y, options)` API in `js/modules/hud/overlays.js` accepting `{ fontSize, colors, amplitude, speed, colorSpeed }`. Builds a single horizontal `CanvasGradient` spanning the whole word (2× text width with the palette laid down twice end-to-end), then slides it left over time. Every glyph uses the same gradient as `fillStyle`, so each pixel samples its color from its actual canvas-x position — adjacent letters blend continuously and the cycle wraps seamlessly without visible color snaps. Supports `amplitude: 0` for gradient-only / no vertical motion, and `colors` palettes wrap automatically (no need to duplicate the first stop at the end).
- **`pulsePalette(hex)` helper** (exported from `overlays.js`) — derives a 4-stop tint/shade pulse palette around any base color, cached per input hex. Used by the powerup pickup label so each powerup's identifying color reads instantly while the text shimmers.
- **Per-call-site palettes** in `WAVY_PALETTES`: `title` (vivid 6-stop rainbow), `waveTitle` (cyan→lime→yellow), `waveSubtext` (peach→pink→violet pastels), `gold`, `orange`, `combo`, `whiteShimmer`.

### Changed
- **All prominent screen-overlay text now uses wavy gradient rendering** — title (`RAINBOIDS`), subtitle (`SUPERCHARGED ASTEROIDS`), start prompt (`PRESS ANY KEY TO START` / `TAP TO START`), survival record, in-game wave indicator title and subtitle, powerup pickup name (top center), level-up text and its subtitle (bottom center). Each gets a hand-tuned palette derived from the color it was previously rendered in.
- **`drawWavyText` respects caller's outer `globalAlpha`** — captured once at entry and multiplied through its internal glow/crisp passes, so the powerup pickup fade-out, level-up fade in/out, and press-any-key alpha pulse all keep working correctly under the new wavy renderer.

---

## [5.25.2] - 2026-04-13

### Changed
- **Enemy hit flash toned down to match asteroid intensity** — removed double-pass rendering (was additive + normal overlay), reduced fill opacity from 100% to 80%, and added 0.9 alpha multiplier. Enemy and asteroid hit flashes now have consistent visual weight.

---

## [5.25.1] - 2026-04-12

### Fixed
- **Enemy hit flash now fills entire hull** — shape draw functions were overriding white flash colors with their own per-component colors (body, wings, cockpit, engines). Fixed with a Proxy that intercepts all `fillStyle`/`strokeStyle` assignments during flash rendering, forcing them to white. All 10 enemy types now flash solid white on hit.
- **Enemy hit flash strengthened** — increased fill opacity to 100%, added double-pass rendering (additive + normal overlay), and removed the 0.9 alpha multiplier for a punchier impact read.

---

## [5.25.0] - 2026-04-12

### Added
- **Selective hitstop** — player ship, particles, line debris, and damage numbers keep updating during hitstop. Only enemies, asteroids, bullets, and collisions freeze. This sells "impact" instead of "lag" and keeps the player in control during combat.
- **Global hitstop budget** — max 10 frames of hitstop per second prevents stutter during intense combat. When budget is exhausted, hits still get flash/sound/shake but no freeze. Budget resets each second.
- **Per-weapon hitstop scaling** — heavy weapons (Rail Driver, Charge Shot: damage ≥ 2) get more hitstop than light rapid-fire weapons (Pulse Cannon, Storm Needles). Hit: 3f heavy / 2f light. Crit: 5f heavy / 3f light. Kill: 7f heavy / 5f light.
- **Kill hitstop for weapon effects** — mines, lightning, nova, and other damageEnemy() kills now trigger 4-frame hitstop.

### Changed

---

## [5.24.3] - 2026-04-12

### Changed
- **Hitstop rebalance** — inflated all hitstop durations for better game-feel weight: asteroid hit 1→2f, enemy hit 3→4f, enemy crit 4→6f, player hit (bullet) 3→4f, player hit (enemy) 5→6f, player hit (asteroid) 4→6f.
- **Kill hitstop** — added dedicated hitstop on kills: enemy kill 7f (117ms), small asteroid kill 4f (67ms), large asteroid split 5f (83ms). Kills now feel distinctly punchier than regular hits.
- **Hitstop cooldown bypass** — lowered threshold from 5→4 frames so all kill hitstops punch through the 200ms rate-limit.
- **VFX test thresholds** — adjusted hitstop ratio and hit flash timer assertions to accommodate the intentionally heavier hitstop values.

---

## [5.24.2] - 2026-04-12

### Fixed
- **Waves stop progressing after 2-3 waves** — wave completion check counted enemies in death flash animation as alive (they have `active = true` until the flash finishes), preventing the wave from ever completing. Now excludes enemies with `_deathFlash > 0` from the alive count.

---

## [5.24.1] - 2026-04-12

### Fixed
- **Asteroid destroy freeze/screen tearing** — death flash and hit flash code referenced non-existent `vertices2D` property; asteroids use `projectedVertices`. Death flash threw TypeError every frame (causing freeze/tearing), hit flash silently failed (white flash never rendered).
- **Hit flash visibility on enemies and asteroids** — switched from `source-over` to `lighter` (additive) composite blending so white hull flash actually pops against the existing colored shape.

---

## [5.24.0] - 2026-04-12

### Added
- **VFX telemetry system** — per-frame recording of all visual effect state (hitstop, screen shake, camera kick, screen flash, muzzle flash, entity hit/death flashes, particle counts) into a 3600-frame ring buffer. Enabled via `window.__VFX_TELEMETRY__ = true`. Zero cost when disabled.
- **VFX telemetry E2E tests** — 6 automated tests validating: full combat VFX analysis (15s AI gameplay), hit flash countdown, death flash sequence completion, muzzle flash telemetry detection, hitstop freeze-loop prevention, and screen shake decay. Includes analysis/report generation utilities.
- **Game loop error protection** — try/catch around the entire game loop prevents uncaught exceptions from killing the rAF chain.

### Fixed
- **Enemy death flash never rendered on bullet kills** — bullet-enemy collision called `enemyPool.release(enemy)` immediately, bypassing the `_deathFlash = 8` state set by `createEnemyDebris`. Removed the premature release; enemies now persist through their death flash animation and are cleaned up by `cleanupInactive()`.
- **White damage flash was a visible rectangle** — `source-atop` composite fills ALL non-transparent pixels on the canvas (including the background), creating a white square instead of a hull-shaped flash. Replaced with re-drawing the entity shape in white at flash alpha: enemies use `_deathFlashRendering` flag, asteroids use `vertices2D` polygon, player uses hull outline path.

## [5.23.2] - 2026-04-12

### Added
- **Enemy/asteroid damage white flash** — entity body now briefly tints white on bullet hit via `source-atop` compositing, making damage immediately visible on the entity silhouette (not just the localized impact glow).

### Fixed
- **Game freeze after 1-2 minutes** — hitstop frames did not update `lastFrameTime`, causing temporal upsampling to burst 4 logic updates at once after each hitstop. This killed more enemies, triggering more hitstop in a feedback loop. Fix: `lastFrameTime = frameStart` during hitstop prevents time accumulation.
- **Muzzle flash invisible** — core flash was only 6px radius with a 0.9px streak. Tripled flash size (core `r*0.8` → `r*1.4`), widened streak (`r*0.06` → `r*0.25`), added side flare spikes for heavy weapons, and increased duration (2-5 → 3-8 frames).

## [5.23.1] - 2026-04-12

### Fixed
- **Game freeze from hitstop stacking** — rapid-fire weapons could lock the game in permanent hitstop. Added 200ms cooldown between non-death hitstops so frames expire before re-triggering.
- **HUD disappearing during hitstop** — hitstop rendering path now includes the full pipeline (HUD, damage numbers, money display, screen flash) instead of only calling `draw()`.
- **Death flash invisible for enemies** — death silhouette now starts at 1.5x scale (was 1.0x) so the white flash is immediately distinct from the normal enemy appearance.
- **Charge shot missing muzzle flash** — `fireChargedShot` now triggers heavy muzzle flare matching other heavy weapons.

### Changed
- Increased hit flash radius: enemy 0.55x → 0.75x, asteroid 0.5x → 0.65x for more visible localized impacts.
- Increased hit hitstop: regular 2→3 frames, crit 3→4 frames for more tactile feedback.

## [5.23.0] - 2026-04-12

### Added
- **Muzzle flare** — player weapons now emit additive flash + directional sparks at the barrel tip on every shot. Intensity scales by weapon type: light (Storm Needles), medium (Pulse Cannon), heavy (Scatter Gun, Rail Driver, power weapons).
- **Hit hitstop** — brief frame-freeze on bullet impacts: 2 frames for regular hits, 3 for crits, 1 for asteroid hits. Combined with screen shake, gives every hit tactile weight.

### Changed
- **Death animation overhaul** — enemies and asteroids now persist for 6-8 frames after death, rendering as a bright white silhouette that scales up 30-35% then fades/shrinks. This replaces the previous invisible gradient approach where entities vanished instantly during hitstop. A large additive glow radiates behind the white silhouette for dramatic visibility.
- **Localized damage effects** — hit flash now emanates from the bullet impact point on the enemy hull instead of the entity center. Flash radius reduced from 1.15x to 0.55x entity radius. Debris sparks fly in a directional cone away from bullet travel direction instead of radiating uniformly.
- **Explosion flash particles** — `explosionFlash` uses radial gradient rendering (bright core → soft blue edge), starts at 30% radius (visible during hitstop), lives 50% longer. `explosionRingColored` also starts partially visible.
- **Enemy death effects** — hitstop 8→5 frames, bigger flash (3x radius), 4 staggered rings, core glow cluster, more shrapnel (20-30), two cascading delayed bursts.
- **Asteroid death effects** — hitstop reduced, bigger flash, third ring at 150ms, core glow cluster, two delayed bursts.
- **Ember particles** — larger (1.2-3.5, was 1-3) and longer-lived (1.0-1.8s, was 0.8-1.5s).

## [5.22.2] - 2026-03-24

### Fixed
- **QA Bot: novice aim too weak** — aimAccuracy raised from 0.10 to 0.25 with minimal lead aiming (0.05). Previous value caused infinite-duration waves where novice couldn't kill enemies, hanging sessions for hours.

### Changed
- **QA Bot: health-aware retreat** — all skill levels now reduce pursuit aggression when health < 40% and increase retreat urgency. Bots also become more cautious when surrounded by multiple visible enemies.
- **QA Bot: wider engagement ranges** — all weapon engagement ranges increased (e.g., STORM_NEEDLES min 100->180px) so bots fight from safer distances.
- **QA Bot: reduced pursuit aggression** — expert lowered from 0.95 to 0.65, advanced from 0.82 to 0.55. Prevents higher-skill bots from rushing into danger and dying faster than lower-skill bots.

## [5.22.1] - 2026-03-24

### Fixed
- **QA Bot: weakest-link floor** — composite fun score no longer zeroes out when any dimension scores 0. Multiplier now has 0.3x floor (minimum 30% of weighted average preserved).

## [5.22.0] - 2026-03-22

### Changed
- **QA Bot: fun score recalibration** — all dimension scorers rebuilt with lower baselines: engagement starts at 60 (was 100), challenge balance at 65 (was 100), pacing at 50 (was 100). Scores now earn points for quality rather than losing points from a perfect start.
- **QA Bot: pacing scorer earns-based** — must earn points via tension arcs (+20), tension variety (+12), rest quality (+8), and intensity escalation (+8). Expected range 25-80 instead of 80-100.
- **QA Bot: engagement penalties harsher** — low action density (<0.3 events/s) now -8 per wave (was -5). Compounding penalty for 3+ low-action waves. Near-zero dips penalized -7 each.
- **QA Bot: challenge balance tightened** — "too easy" threshold lowered from 12:1 to 8:1 damage ratio. Deaths now penalized (-3 per death, -10 per extra). Sweet spot narrowed to 2-6:1.
- **QA Bot: excitement death penalty** — high death rate (>0.5/wave) now penalizes up to -20. Desperation bonuses (health crises, survival recoveries) capped lower (+5/+6 instead of +8/+10).
- **QA Bot: competence growth R² gating** — slope rewards require R² > 0.15 (statistical significance). Noisy trends no longer get free credit.
- **QA Bot: composite weakest-link penalty** — if any dimension scores below 35, the composite is multiplied by (min/35), preventing one terrible dimension from being hidden.
- **QA Bot: rating labels adjusted** — Excellent ≥80 (was 85), Good ≥60 (was 70), Fair ≥45 (was 55), Poor ≥30 (was 40).

## [5.21.0] - 2026-03-22

### Fixed
- **QA Bot: freeze when surrounded** — bot no longer returns zero movement when all 16 steering directions have danger ≥ 1.0. Now flees toward the least dangerous direction instead of freezing in place and dying.
- **QA Bot: bullet dodge threshold** — dynamic threshold scaled by bullet speed and reaction time (60-150px) instead of fixed 60px. Gives all skill levels adequate reaction distance.
- **QA Bot: danger curve overflow** — danger map now capped at 1.5 maximum per direction. Prevents 3+ enemies from making all directions impassable and triggering the freeze bug.
- **QA Bot: wall danger trapping** — wall danger now scales with proximity (0-0.5) instead of flat 0.7 inside WALL_MARGIN. Eliminates corner trapping when combined with enemy danger.
- **QA Bot: respawn chain deaths** — 2.5s grace period after respawn where bot flees toward arena center instead of fighting. Prevents immediate re-death near edge spawns.
- **QA Bot: degradation curve** — changed from linear to quadratic. Advanced (0.88 skill) now gets 0.9% drift (was 9%) and 0.5% hesitation (was 5%). Novice retains substantial degradation.

### Changed
- **QA Bot: skill presets widened further** — beginner pulled down (aimAccuracy 0.4→0.30, bulletAwareness 0.3→0.20, threatBlindness 0.3→0.40), advanced pushed up (movementSkill 0.85→0.88, bulletAwareness 0.9→0.92, threatBlindness 0.05→0.03). Novice made more extreme (reactionMs 600→700, aimAccuracy 0.15→0.10). Creates wider gaps between all 5 skill tiers.

## [5.20.0] - 2026-03-22

### Added
- **QA Bot: expert skill level** — new peak-human-capability tier with 50ms reaction time, 0.98 aim accuracy, 0.97 movement skill, full bullet awareness, and near-perfect lead aiming. Five skill levels now span novice → beginner → intermediate → advanced → expert.
- **QA Bot: tension arc analysis** — per-tick tension signal computed from enemy proximity, bullet density, health pressure, and damage spikes. Analyzes build-to-peak-to-release cycles, rest period quality (short recovery after combat = good, long dead time = bad), and intensity escalation across the session.
- **QA Bot: combat effectiveness metric** — replaces broken "accuracy" proxy with geometric mean of offense (damage ratio) and defense (health floor). Used for competence growth trend analysis.
- **QA Bot: threat blindness** — low-skill AI now ignores a fraction of enemies entirely (50% for novice, 0% for expert), creating realistic tunnel vision behavior.
- **QA Bot: reaction jitter** — low-skill AI has inconsistent reaction times (±40% for novice, ±1% for expert), simulating human inconsistency.
- **QA Bot: movement commitment** — low-skill AI commits to bad movement directions for longer (2s for novice, 50ms for expert), simulating poor spatial awareness.
- **QA Bot: separate movementSkill parameter** — movement degradation (drift, hesitation, panic) now controlled independently from aimAccuracy, allowing finer skill tuning.

### Changed
- **QA Bot: pacing scorer rewritten** — now measures tension arcs, tension variety, rest quality, intensity escalation, and tension-based monotony instead of action density oscillation and idle ratio penalties.
- **QA Bot: engagement scorer updated** — idle time only penalized when rest quality is poor (< 40%), not unconditionally above 30%.
- **QA Bot: skill presets widened** — all parameter ranges expanded for clearer differentiation. Novice aimAccuracy lowered from 0.3 to 0.15; advanced reactionMs changed from 100 to 120; intermediate values adjusted for smoother progression.

### Fixed
- **QA Bot: damage dealt always 1 per kill** — kill buffer now includes enemy `maxHealth`. Damage ratio reflects actual enemy HP destroyed vs damage taken, fixing universally poor challenge balance scores.
- **QA Bot: competence growth always 35** — replaced kills/(kills+damageTaken) accuracy proxy with combat effectiveness (offense × defense geometric mean). Competence growth now reflects actual improvement.
- **QA Bot: dead code removed** — removed fire hesitation code (`input.fire` is never consumed by game engine), removed unused `dodgeReactionMs` and `dodgeCommitment` parameters from all skill presets.

## [5.19.1] - 2026-03-22

### Added
- **QA Bot: skill-dependent movement degradation** — novice AI now exhibits random drift, movement hesitation, panic-mode erratic movement at low health, aim wander (consistent directional bias), and fire hesitation. Creates visible differentiation: novice reaches 73% of advanced's wave count and takes 17% more damage per wave.

### Fixed
- **QA Bot: near-miss detection always zero** — rewrote proximity tracker with velocity-prediction-based bullet matching and line segment interpolation for closest approach between 10Hz samples. Widened near-miss radius from 40px to 80px. Sessions now detect 47-147 near-misses per run.
- **QA Bot: engagement score too strict** — lowered action density thresholds (1.0→0.3 events/s for low density, 5.0→3.0 for chaos). Added close_encounter (enemy within 200px) and bullet_threat (approaching bullet within 150px) action event types. Engagement scores now 92-97 across skill levels.
- **QA Bot: duplicate `const now` declaration** — removed redeclared variable in fun-metrics-collector.js tick method.

## [5.19.0] - 2026-03-22

### Added
- **QA Bot: context steering combat AI** — replaced simple approach/flee movement with 16-direction interest/danger map system. Bot now pursues enemies to weapon-effective range, circle-strafes during engagement, dodges incoming bullets via velocity obstacle projection, and avoids arena boundaries and asteroids. All parameters tunable per skill level.
- **QA Bot: predictive lead aiming** — quadratic intercept calculation predicts where moving enemies will be when bullets arrive. Lead factor ranges from 0 (novice, aims at current position) to 0.95 (advanced, near-perfect prediction).
- **QA Bot: weighted target prioritization** — targets scored by threat level, distance, health remaining, and angle proximity instead of simple nearest-enemy selection. Includes target switch cooldown and hysteresis to prevent oscillation.
- **QA Bot: weapon-specific engagement** — combat AI adjusts ideal engagement distance per weapon type (SCATTER_GUN: 50-200px close range, RAIL_DRIVER: 350-650px long range, etc.).
- **QA Bot: utility-based shop AI** — replaces hardcoded priority lists with need-score system driven by session telemetry. Tracks health ratio, death rate, kill rate across waves; computes per-upgrade need scores; applies value=need/cost scoring with build archetype bias. Adaptive build strategy re-evaluates archetype every 5 waves based on performance.
- **QA Bot: session telemetry tracking** — shop AI records wave-by-wave stats (health, kills, deaths, damage events) to inform purchase decisions.
- **QA Bot: enhanced skill presets** — SKILL_PRESETS now include nested `combat` and `shop` parameter blocks with 12+ tunable parameters per skill level.

### Fixed
- **QA Bot: wave skipping during shop visits** — bot was opening shop during WAVE_TRANSITION and closeShop() called startNextWave(), skipping the current wave's enemy spawn entirely. Added `closeShopSilent()` driver method that restores WAVE_TRANSITION state without triggering startNextWave.
- **QA Bot: fun metrics missing wave data** — fun metrics collector was only called during PLAYING state, missing wave_start events during SHOP and WAVE_TRANSITION. Moved event processing before state guard; added funCollector.tick calls on all early-return paths.
- **QA Bot: enemy velocity not tracked** — state reader now captures enemy `vx`/`vy` for predictive aiming.
- **QA Bot: asteroid dodge weakness** — increased asteroid danger radius (scales with asteroid size) and danger intensity from 0.4 to 0.7 * dangerSensitivity.

## [5.18.3] - 2026-03-22

### Fixed
- **QA Bot: kill tracking accuracy** — replaced delta-based kill inference (compared enemy counts between 100ms ticks, missed kills during state transitions) with an authoritative event buffer. Kill events are now pushed from all three game-side kill paths (bullet-enemy collision, power weapon `damageEnemy`, player-enemy body collision) and a fallback in `enemy.update()`. State reader drains the buffer each tick for 100% accurate kill counts regardless of timing.

## [5.18.2] - 2026-03-22

### Fixed
- **QA Bot: wave progression fix** — adapter `startSequence` was forcing game state to PLAYING immediately after `init()`, which prevented the 2-second wave intro timer from spawning wave 1 entities; bot now waits for the natural WAVE_TRANSITION → PLAYING transition

## [5.18.1] - 2026-03-22

### Fixed
- **Shop close → wave progression bug** — `closeShop()` was calling the broken `startNewWave()` (which doesn't increment wave counter, doesn't spawn enemies, and never transitions back to PLAYING) instead of the correct `startNextWave()`; this caused the game to get permanently stuck after closing the shop during a wave transition

## [5.18.0] - 2026-03-22

### Added
- **QA Bot: Fun Metrics System** — New analysis pipeline that quantifies "fun" across six research-backed dimensions:
  - **Engagement** — action density, threat saturation, idle ratio, engagement dips
  - **Challenge Balance** — death rate, damage ratios, wave clear time, difficulty spikes
  - **Competence Growth** — accuracy trends, kill efficiency trends, damage ratio progression
  - **Choice Depth** — Shannon entropy of upgrade/build diversity across sessions
  - **Pacing** — intensity oscillation, monotony detection, density trends
  - **Excitement** — near-miss tracking, health crises, clutch kills, multi-kill bursts, survival recoveries
- **Near-miss proximity tracker** (`analysis/proximity-tracker.js`) — detects bullets that pass close to the player without hitting, measuring combat tension
- **Per-wave analysis buckets** (`analysis/wave-bucket.js`) — accumulates granular per-wave statistics for intensity curves and hotspot detection
- **Fun Analyzer** (`analysis/fun-analyzer.js`) — scores each dimension 0-100, computes weighted composite fun score, identifies problem waves, generates actionable recommendations
- **Fun Report Generator** (`analysis/fun-report-generator.js`) — produces both human-readable markdown and machine-readable JSON fun reports per session and aggregated across sessions
- Fun scores now printed in CLI output after each session
- Aggregate fun reports generated automatically when running multiple sessions
- Cross-session choice depth analysis using Shannon entropy of upgrade distributions

## [5.17.2] - 2026-03-22

### Changed
- **Drifter lightning orbs now linger as visible electric hazards** — Lightning damage bullets persist for 1–1.5s (up from 460ms) with a smooth fade over their final 40% of lifetime. Orbs are now visible with a cyan glow and drift slightly from their spawn point, making them readable area-denial hazards rather than invisible instant damage zones.

## [5.17.1] - 2026-03-22

### Fixed
- **Drifter lightning bullets persist forever** — Arc lightning damage bullets were created with `maxLifetimeOverride = 460` but `isPersistent` was never set to `true`, so the lifetime check never ran. Since the bullets have zero velocity, the distance-based expiry also never triggered. Every lightning bolt spawned ~4 invisible immortal bullets that accumulated indefinitely, causing progressive performance degradation. Fixed by setting `isPersistent = true` on lightning damage bullets.

## [5.17.0] - 2026-03-22

### Changed
- **Architecture: Domain-oriented directory reorganization** — Restructured `js/modules/` from technical-layer grouping (entities/, systems/, rendering/) to domain-oriented grouping where related code is colocated:
  - `player/` — player entity, weapons, skills, progression, renderer, lifecycle, bullet (7 files)
  - `enemy/` — enemy entity, data, movement, firing, AI, shapes, enemy-bullet (7 files)
  - `hud/` — all HUD rendering split by domain: status, combat, navigation, overlays, cursor (6 files)
  - `world/` — game world entities: asteroid, particle, color-star, background-star, line-debris, powerup, camera (7 files)
  - `combat/` — collision system, combat manager, weapon data, weapon effects renderer (4 files)
  - `wave/` — wave manager + wave data (2 files)
  - `shop/` — shop manager + shop renderer (2 files)
  - `audio/` — audio manager + music player (2 files)
  - `ui/` — UI manager, input handler, event setup (3 files)
  - `core/` — absorbed loose infrastructure: constants, utils, frame-clock, color-cache, pool-manager (8 files)
  - `game-engine.js`, `asset-loader.js`, `autofire-diag.js` remain at module root
  - Old directories (entities/, systems/, rendering/) removed
- All import paths updated across game code, unit tests, and benchmark scripts. No code logic changes.

## [5.16.1] - 2026-03-22

### Changed
- **Architecture: Phase 10.1 — Externalize wave subtitles** — Moved 50 hand-written wave subtitle strings and 15 generic fallback subtitles from `wave-manager.js` to `wave-data.js` as `WAVE_SUBTITLES` and `WAVE_SUBTITLES_GENERIC` exports. `getWaveSubtitle()` now reads from the imported data. Pure data relocation, no behavior change.

## [5.16.0] - 2026-03-22

### Changed
- **Architecture: Phase 9.1 — Split hud-renderer.js** — Decomposed monolithic `hud-renderer.js` (2,058 LOC, 32 functions) into 5 focused modules:
  - `hud-status.js` — health bar, lives, level/coins, XP bar, skill cooldowns, updateHUD orchestrator (7 functions)
  - `hud-combat.js` — damage numbers, target info, powerup display/indicators/sync, money pickup (6 functions)
  - `hud-navigation.js` — minimap, off-screen enemy edge glow indicators (2 functions)
  - `hud-overlays.js` — title screen, wavy text, survival timer, pause button, spawn/respawn/invincibility timers, ghost previews (12 functions)
  - `hud-cursor.js` — crosshairs, targeting cursor, jitter circle, charge cooldown timer (5 functions)
  - Original `hud-renderer.js` retained as barrel re-export for backward compatibility. No behavior change.

## [5.15.0] - 2026-03-22

### Changed
- **Architecture: Phase 8.2 — Collision Config** — Extracted 15 hardcoded collision physics values (knockback, restitution, damage, drop chances, push forces, separation buffers) into a named `COLLISION_CONFIG` object at the top of `collision-system.js` for easy tuning and discoverability.
- **Architecture: Phase 8.3 — Split handleWeaponEffectCollisions** — Decomposed monolithic `handleWeaponEffectCollisions()` into 7 focused handler functions: `checkLanceBeamCollisions`, `checkMineCollisions`, `checkNovaCollisions`, `checkLightningCollisions`, `checkMissileCollisions`, `checkDeflectorOrbCollisions`, `checkTractorShieldCollisions`. No behavior change.

## [5.14.0] - 2026-03-22

### Changed
- **Architecture: Phase 7 — Player Subsystem Extraction** — Decomposed `player.js` (2,263 lines) into 5 focused modules:
  - `systems/player-weapons.js` (924 lines) — 35 weapon methods: charging, primary/power firing, bullet creation, charge shot, weapon equip/buy
  - `systems/player-skills.js` (158 lines) — 5 skill methods: activation, cooldowns, equip, buy
  - `systems/player-progression.js` (284 lines) — 18 methods: leveling, powerups, stat getters
  - `rendering/player-renderer.js` (513 lines) — 5 draw methods: ship, charging effects, level-up, cooldown timers
  - `player.js` reduced from 2,263 to 702 lines (69% reduction). No behavior change.

## [5.13.0] - 2026-03-22

### Changed
- **Architecture: Phase 6.5 — Enemy AI Extraction** — Extracted 21 enemy AI/evasion/territory methods (~700 lines) from `enemy.js` to new `systems/enemy-ai.js`. Includes face direction, targeting priority, territory system (initialize, patrol, bounds), evasion (dodge bullets, avoid asteroids, line-of-sight), distance maintenance, micro-movements, fish-like motion, and trail particles. `enemy.js` reduced from 1,649 to 1,011 lines (85% reduction from original 6,655). No behavior change.

## [5.12.0] - 2026-03-22

### Changed
- **Architecture: Phase 6.4 — Rendering Shape Extraction** — Extracted all 25 enemy drawing/rendering methods (~1,800 lines) from `enemy.js` to new `rendering/enemy-shapes.js`. Includes all shape renderers (drawTriangle, drawWaspShip, drawEmeraldGuardian, drawTitanTank, drawStalkerSword, etc.), effect renderers (drawWarpEffect, drawLightningBolt, drawSweepLaser, drawLaserChargingEffect, etc.), and HUD elements (drawHealthBar, drawLightTrail, drawTargetingEffect, drawPulsatingCircle). Enemy class methods become one-liner `.call(this)` delegators. The main `draw()` orchestrator remains in `enemy.js`. `enemy.js` reduced from ~3,400 to ~1,650 lines. No behavior change.

## [5.11.0] - 2026-03-22

### Changed
- **Architecture: Phase 6.3 — Firing Strategy Extraction** — Extracted 38 enemy firing/shooting functions from `enemy.js` to new `systems/enemy-firing.js`. Includes all shooting patterns (shootAimed, shootSpread, shootLaser, shootArcLightning, shootMissile, etc.), the core `createEnemyBullet` bullet factory, burst/sweep/sentinel state machines, and lightning bolt generation. Enemy class methods become one-liner `.call(this)` delegators. Drawing methods (`drawLightningBolt`, `drawSweepLaser`) and the `updateShooting` dispatcher remain in `enemy.js`. No behavior change.

## [5.10.0] - 2026-03-22

### Changed
- **Architecture: Phase 6.2 — Movement Strategy Extraction** — Extracted 36 enemy movement functions (~2,170 lines) from `enemy.js` to new `systems/enemy-movement.js`. Includes all 28 movement patterns (chase, patrol, drifter_wave, triangle, square, boulder, weaver_spinup, wasp_zigzag, tank, arc, etc.) plus 8 helper functions (startFishDart, calculateTriangleVertices, etc.). Enemy class methods become one-liner `.call(this)` delegators. `enemy.js` reduced from 6,544 to 4,443 lines (32% reduction). No behavior change.

## [5.9.0] - 2026-03-22

### Changed
- **Architecture: Phase 6.1 — Extract Enemy Config** — Moved `ENEMY_TYPES` (10 enemy type definitions) from `enemy.js` to new `entities/enemy-data.js`. Expanded each type's config with structured `movement`, `firing`, `visual`, and `ai` parameter blocks for future strategy registry consumption (Phases 6.2–6.4). Added `ENEMY_TYPE_KEYS` and `SHAPE_DRAW_MAP` convenience exports. Pure data extraction — no behavior change.

## [5.8.0] - 2026-03-22

### Changed
- **Architecture: Phase 3.9 — EventSetup extraction** — Extracted `setupEventListeners` (~434 lines) into `systems/event-setup.js`: window resize/orientation, keyboard shortcuts, cheat codes, game restart handlers, shop interaction, entity targeting, auto-pause
- **Architecture: Phase 4.1 — EventBus wiring** — Activated the existing EventBus for cross-system communication. All 31 `audioManager` calls and 16 `uiManager` calls in extracted modules now use `this.events.emit()` instead of direct method calls. Audio events: `audio:hit`, `audio:explosion`, `audio:coin`, `audio:shield`, `audio:health-regen`, `audio:powerup`, `audio:player-explosion`. UI events: `ui:show-message`, `ui:hide-message`, `ui:update-lives`, `ui:check-orientation`, `ui:toggle-pause`, `ui:show-shop-button`, `ui:hide-shop-button`, `ui:show-pause-btn`, `ui:hide-pause-btn`
- Removed all direct `audioManager` and `uiManager` references from extracted system modules (collision-system, player-lifecycle, combat-manager, shop-manager, event-setup, wave-manager) and rendering modules (hud-renderer)
- **Architecture: Phase 4.2 — Remove `window.gameEngine` from game code** — All entity files (enemy.js, player.js, enemy-bullet.js, asteroid.js) and ui-manager.js no longer read from `window.gameEngine` or `window.game`. Entities receive gameEngine via injected `this.gameEngine` ref; UIManager receives it via `setGameEngine()`. Global assignment kept only for test instrumentation.
- **Architecture: Phase 5.3 — Pool high-water-mark tracking** — Added `highWaterMark`, `totalAllocations`, `overflowAllocations` tracking to PoolManager. Call `gameEngine.showPerformanceStats()` in console to see pool sizing audit data via `console.table()`.
- `game-engine.js` reduced from 3,081 to ~1,260 lines (84% reduction from original 7,746)

## [5.7.0] - 2026-03-22

### Changed
- **Architecture: Phase 3.5 — CombatManager extraction** — Extracted 22 combat/effects methods (~611 lines) into `combat-manager.js`: debris effects (asteroid + enemy), orb creation/drops, powerup collection, kill streak tracking, damage numbers, money pickup display, entity targeting/hover detection
- **Architecture: Phase 3.6 — PlayerLifecycle extraction** — Extracted 9 player death/respawn methods (~379 lines) into `player-lifecycle.js`: `takeDamage`, `handlePlayerDeath`, `createPlayerShipDebris`, `respawnPlayer`, `respawnPlayerSafely`, `findSafeRespawnLocation`, `updateRespawnAnimation`, `clearAreaAroundPlayer`, `explodeTank`
- **Architecture: Phase 3.7 — WeaponEffectsRenderer extraction** — Extracted `drawWeaponEffects` (~196 lines) into `rendering/weapon-effects-renderer.js`: lance beam, mines, nova rings, lightning chains, missiles, deflector orbs, bulwark, tractor shield, EMP pulse, phase dash
- Removed unused `PRIMARY_UPGRADES`, `POWER_UPGRADES`, `SKILL_UPGRADES`, `PRIMARY_WEAPONS`, `POWER_WEAPONS` imports from `game-engine.js`
- **Architecture: Phase 3.8 — Spawning methods moved to WaveManager** — Moved 9 spawning methods (~196 lines) into existing `wave-manager.js`: `spawnAsteroidOffscreen`, `spawnWaveAsteroids`, `startEnemySubWave`, `forceSpawnEntity`, `forceSpawnEnemy`, `forceSpawnAsteroid`, `isInMinimapArea`, `spawnContinuousAsteroid`, `spawnRandomEnemy`
- **Architecture: Phase 3.9 — EventSetup extraction** — Extracted `setupEventListeners` (~434 lines) into `systems/event-setup.js`: window resize/orientation, keyboard shortcuts, cheat codes, game restart handlers, shop click/touch/scroll handling, entity targeting, auto-pause on blur
- `game-engine.js` reduced from 3,081 to 1,248 lines (total 84% reduction from original 7,746)

## [5.6.0] - 2026-03-21

### Changed
- **Architecture: Phase 3.4 — CollisionSystem extraction** — Extracted 8 collision methods (~1,142 lines) into `collision-system.js`: `handleCollisions`, `handleWeaponEffectCollisions`, `damageEnemy`, `handlePlayerEnemyCollision`, `handlePlayerEnemyBulletCollision`, `handleEnemyAsteroidCollision`, `handlePlayerAsteroidCollision`, `findNearestEnemy`
- **Architecture: Phase 4 — GameDimensions fix** — Added `FIELD_WIDTH`/`FIELD_HEIGHT` constants to `GAME_CONFIG`, updated `GameDimensions` singleton to return fixed game field dimensions (1920×1080) instead of window viewport size, and removed all `window.gameEngine?.gameField` fallback chains from entity code (enemy.js, asteroid.js, enemy-bullet.js)
- `game-engine.js` reduced from 4,206 to 3,081 lines (total 60% reduction from original 7,746)

### Fixed
- Duplicate shield initialization in `enemy.js` (lines 221-229 and 299-307 were identical; removed the first redundant copy)
- `GameDimensions` was returning window viewport size instead of game field dimensions, which could cause entity boundary checks to use incorrect values on non-1080p displays

## [5.5.1] - 2026-03-21

### Changed
- **Project reorganization** — Moved 10 planning/analysis docs (including REFACTOR.md) into `docs/` and development tools (`benchmark/`, `ai-qa-bot/`, `scripts/`, `juice-capture.mjs`) into `tools/` to declutter the project root
- Updated all internal path references in `package.json`, `.gitignore`, `benchmark/compare.js`, `benchmark/run.js`, `ai-qa-bot/run.js`, and `ai-qa-bot/core/config.js` to reflect new locations

## [5.5.0] - 2026-03-21

### Changed
- **Architecture: Phase 1 Foundation** — Added `GameStateMachine` (validated state transitions with epoch guards), `EventBus` (cross-system pub/sub), and `GameTimer` (frame-counted timers that freeze during pause/shop)
- **Architecture: Phase 2 Renderer Extraction** — Extracted 32 HUD draw methods (~2,058 lines) into `hud-renderer.js` and 4 shop draw methods (~619 lines) into `shop-renderer.js`
- **Architecture: Phase 3 System Extraction** — Extracted camera management (~109 lines) into `camera-manager.js`, shop logic (~528 lines) into `shop-manager.js`, and wave system (~441 lines) into `wave-manager.js`
- `game-engine.js` reduced from 7,746 lines to 4,206 lines (46% reduction) while preserving identical feature-set and behavior
- All game-logic `setTimeout` calls replaced with `GameTimer` instances that respect pause/shop state — eliminates stale-callback bugs
- All state transitions now validated against a transition table — prevents invalid state changes

### Fixed
- Wave spawn timers no longer fire during PAUSED or SHOP states (was a source of ghost spawning bugs)
- State transition validation prevents impossible state changes (e.g., GAME_OVER → SHOP)
- Respawn timer now uses epoch guard to prevent stale respawn callbacks after game restart

## [5.4.1] - 2026-03-21

### Fixed
- Weapons were purchasable in shop before reaching their unlockWave milestone, bypassing wave-gating entirely
- Shop PRIMARY tab now hides locked weapons until the player reaches the required wave
- `buyShopItem()` now rejects purchases of wave-locked weapons even if called programmatically

### Added
- E2E weapon economy analysis test suite (simulated 15-wave playthrough with purchase tracking)
- Wave-gating verification tests (shop visibility + purchase blocking per wave)
- Weapon stat differentiation test (verifies Pulse Cannon rebalance + unique damage values)

## [5.4.0] - 2026-03-21

### Changed
- Primary weapons are now free — no coin or SP cost to acquire
- Primary weapons auto-unlock at wave milestones (Storm Needles at wave 3, Scatter Gun at wave 5, Rail Driver at wave 8, Lance Beam at wave 12)
- Reduced all 19 primary weapon upgrade costs by ~30% to redirect spending toward build depth
- Pulse Cannon rebalanced: damage 1.0→0.8, range 1.0→0.85 to incentivize weapon switching
- Shop chrome shifted from gold (#FFD700) to cyan (#00ccff) to match game's HUD aesthetic — title, border, scrollbar all cyan; gold preserved only for coin currency display
- Shop tab label font size increased from 9px to 10px for readability
- Purchase feedback: green flash on successful buy, red flash on insufficient funds

### Added
- AI playtester weapon-switching support (`switchWeapons` option in `GameAI.run()`)
- `switchRandomPrimary()` method on GameAI for periodic weapon variety testing
- Weapon test helpers: `getActivePrimary()`, `getOwnedPrimaries()`, `equipPrimary()`
- QA tests for free weapon costs, wave-milestone auto-unlock, and AI weapon switching

## [5.3.3] - 2026-03-18

### Removed
- Dead `gameOver()` method (~150 lines of unused rainbow explosion code)

## [5.3.2] - 2026-03-18

### Fixed
- Game starting at wave 2 due to `main.js` and `startGame()` force-setting
  state to PLAYING, bypassing the wave transition setTimeout
- Wave progression broken after wave 1 (entities never spawned because
  setTimeout callback checked for WAVE_TRANSITION but state was forced
  to PLAYING)
- Duplicate `startNextWave()` method (old dead version at line 847 merged
  into the real one with pool cleanup, health restore, player state reset)

## [5.3.1] - 2026-03-18

### Fixed
- Depth-batch-renderer NaN crash: `Math.max`/`Math.min` passes NaN through;
  replaced with bitwise `|0` coercion + ternary bounds check

## [5.3.0] - 2026-03-18

### Added
- Four-phase player death effect: impact freeze, ship fragmentation, main
  blast with shockwave rings, and delayed aftershock re-ignition pops
- Ship hull debris: player hull fragments into 12 line-debris pieces along
  actual hull geometry on death, flung outward with rotation
- Death overlay: brief dark-blue tint after death (holds longer on game over)
- Three sequential camera kicks on player death (25px, 18px, 10px)
- 15-frame hitstop on player death (longest in the game)
- Pithy/humorous wave subtitles for all 50 hand-written waves plus a rotating
  pool of 15 generic quips for waves 51+
- Wave 1 intro message with 2-second delay before spawning
- Wave transition delay on all waves (2s message → spawn)

### Changed
- Player death is now the most dramatic effect in the game, strictly above
  enemy kills in every feedback channel (hitstop, flash, shake, rings)

---

## [5.2.3] - 2026-03-15

### Changed
- Background star colors improved: 55% blue-white, 25% white, 12% warm,
  8% orange-red
- Asteroid hue range narrowed to teal/cyan/blue/violet (150-280°) with 20%
  warm gold accents (40-60°) for stylistic cohesion
- Hit flash timer increased from 3 to 6 frames
- MAX_PARTICLES raised from 30 to 50

## [5.2.2] - 2026-03-15

### Changed
- HSL color cache added to color-cache.js: quantizes and caches `hsl()`
  string construction (~50-100 fewer string allocations per frame)
- Gradient caching for engine exhaust, health bars, and asteroid tiers
  (~30-60 fewer `createLinearGradient`/`createRadialGradient` calls per frame)
- Reduced `ctx.save()`/`restore()` calls by ~70-140 per frame in particle.js
  (replaced with manual property resets)
- HSL template literals in particle.js and line-debris.js replaced with
  cached `hsl()` calls
- `Date.now()` calls in player.js `draw()` replaced with `frameClock.now`
- Pre-allocated typed arrays (Float32Array) for off-screen indicators
- Swap-and-pop removal for damage numbers (O(1) vs splice O(n))

## [5.2.1] - 2026-03-15

### Fixed
- Depth-batch-renderer crash after several waves: bucket index could exceed
  0-10 range; added `Math.max`/`Math.min` clamping
- Stars drifting when player is stationary: added epsilon snap
  (`if abs(vel) < 0.05, vel = 0`)
- Stars moving during PAUSE/SHOP: pass `{x:0,y:0}` instead of player velocity

## [5.2.0] - 2026-03-15

### Added
- Hull outline glow on player ship: full silhouette stroke that dims/brightens
  with thrust level but stays visible at idle (cyan, lineWidth 2.5)
- Non-rotating hit flash aesthetic for enemies and asteroids: world-space white
  square with 6-7 debris squares (cyan, magenta, yellow, lavender) bursting
  outward radially
- Hit flash jitter (high-frequency sine displacement)
- Kill juice hierarchy: deaths use stronger effects than hits
  - Enemy kill: hitstop 8, camera kick 14px, screen flash 0.12/3f
  - Asteroid kill: hitstop 4-6, camera kick 7-12px, screen flash 0.06-0.1/2f
- Screen flash overlay system: `triggerScreenFlash(alpha, duration)` renders
  additive white fullscreen rect after HUD
- Camera kick system: `triggerCameraKick(dx, dy, magnitude)` with directional
  lurch and exponential decay
- Hitstop system: `triggerHitstop(frames)` freezes game logic while still
  rendering
- Staggered explosion rings on enemy/asteroid death (3 rings, 50ms apart)
- Directional shrapnel streaks on death (16-24 pieces in entity color)
- Lingering embers on death (10-16 slow-drifting glowing dots)
- Delayed secondary burst sparks (80ms after death)

### Fixed
- Hit flash rotating for enemies but not asteroids: moved all flash drawing
  outside entity rotation transforms to world-space
- Chromatic aberration fuzz looking sloppy on large entities: replaced offset
  colored rectangles with small debris squares

## [5.1.2] - 2026-03-15

### Changed
- Rendering optimizations for sustained frame rate

## [5.1.1] - 2026-03-15

### Fixed
- Auto-fire bug where player couldn't fire

## [5.1.0] - 2026-03-15

### Added
- AI QA bot: autonomous playtesting bot with combat AI, shop AI, bug
  detection (stuck states, invariant violations), and performance monitoring
  (16 modules in ai-qa-bot/ directory, created 2026-03-14)
- Halo-style red glow indicator for off-screen enemies
- Autofire diagnostics module (autofire-diag.js)
- Frame clock module (frame-clock.js) for consistent timing
- juice-capture.mjs for recording gameplay clips

---

## [5.0.3] - 2026-03-10

### Changed
- Game logic running at fixed 60 Hz tick rate (decoupled from render)
- Pause menu redesigned to fit all buttons including weapon tabs

## [5.0.2] - 2026-03-10

### Changed
- Further orb drop rate and upgrade scaling changes

## [5.0.1] - 2026-03-10

### Changed
- Money/health orb drop rates decreased; game now starts dropping only
  1 orb, must be upgraded through shop and powerups
- Silkscreen font for small text (enemy names, levels, powerup labels)

## [5.0.0] - 2026-03-10

### Added
- Weapon system with 5 primary weapons (Pulse Cannon, Storm Needles,
  Scatter Gun, Rail Driver, Lance Beam)
- 5 power weapons (Charge Shot, Mine Layer, Nova Blast, Lightning Arc,
  Missile Salvo)
- 6 defense skills (Bulwark, Repair Nanites, Phase Dash, Deflector Orbs,
  EMP Pulse, Tractor Shield)
- Weapon upgrade trees (54+ upgrades across primary, power, and defense)
- Skill slot system with assignable defense skills
- Nebula background renderer (pre-rendered, no per-frame cost)
- Comprehensive wave data system: 100 explicitly designed waves across
  5 acts (First Contact, Escalation, Gauntlet, War Zone, Endgame)
  plus procedural scaling for waves 101+

### Changed
- Secondary weapon changed from built-in charge shot to selectable power
  weapon slot

---

## [4.28.4] - 2026-03-08

### Fixed
- Package.json main entry corrected to js/main.js (was index.js)

## [4.28.3] - 2026-03-08

### Changed
- Title screen and wavy text scale to fit mobile viewport

## [4.28.2] - 2026-03-08

### Fixed
- Mobile: hide mouse cursor (was appearing on touch devices)
- Mobile: increase pause button size for easier tapping

## [4.28.1] - 2026-03-08

### Added
- CSS color string caching (color-cache.js with rgba() cache)
- Pre-allocated depth buckets in depth-batch-renderer replacing Maps/Arrays

### Changed
- Moved perf/ to benchmark/ directory

## [4.28.0] - 2026-03-08

### Added
- Test infrastructure: Jest for unit tests, Playwright for E2E/QA tests,
  mitata for microbenchmarks
- Allure Report integration for HTML test reporting
- 68 Jest unit tests (pool, wave, math)
- 92 Playwright QA smoke tests
- Comprehensive E2E test suite (menu, HUD, weapons, music, asteroids,
  enemies, powerups, waves, survival)
- Performance FPS benchmark tests (baseline, asteroids, particles,
  starfield, enemies, combined)
- AI playtester (game-ai.js) with reactive gameplay and one-punch-man cheat
- Microbenchmarks for pool, collision, wave, math, and noise systems
- Benchmark comparison tool (`npm run perf:compare <refA> <refB>`)

## [4.27.1] - 2026-03-07

### Changed
- Benchmark table formatting cleanup
- Configurable number of averaged runs for benchmarking
- Benchmark README added

## [4.27.0] - 2026-03-07

### Added
- Performance benchmarking scripts and tools
- Comprehensive performance analysis output

## [4.26.5] - 2026-03-04

### Fixed
- Pause menu minor fixes on mobile

## [4.26.4] - 2026-03-03

### Changed
- Powerup icon text polish: font choices, colors, sizing

## [4.26.3] - 2026-03-03

### Changed
- Powerup icons now display powerup name, remaining time in seconds,
  and number of stacks
- Enemy names and levels restored above health bars
- Enemy levels now scale with the number of waves

## [4.26.2] - 2026-03-03

### Changed
- Much more variety in enemy movement and firing patterns
- Enemies now rotate more smoothly
- Enemies have more distinctive firing styles and bullet types

## [4.26.1] - 2026-03-03

### Fixed
- Pause button working on desktop and mobile
- Shop and resume text/icon alignment in pause menu

## [4.26.0] - 2026-03-03

### Added
- Cheats for spawning individual enemies (SHIFT+1-8)
- One-punch-man cheat (SHIFT+9)
- Add coins cheat (SHIFT+-)
- Pause button in top right (mobile support)

### Fixed
- HP bar moved closer to triforce (number of lives)
- Coin and SP display in Shop menu

### Changed
- Removed hard enemy cap

## [4.25.1] - 2026-03-02

### Added
- Close button for Shop

### Changed
- Powerup icon and timer bar aligned
- Powerup icons moved up to avoid collision with play timer
- Hover effects added to pause menu buttons

## [4.25.0] - 2026-03-02

### Added
- Charge shot as purchasable upgrade (was built-in)
- Unique upgrade and powerup icons
- Auto-aim for mobile
- Auto-fire system

## [4.24.0] - 2026-02-24

### Changed
- Reduced map size for tighter combat encounters
- Switched from continuous enemy spawning to discrete waves
- Reduced star rendering to ensure performance

---

## [4.23.18] - 2025-09-20

### Added
- Respawn invincibility system (1.5-3 seconds)
- Enemy collision damage (50 dmg) and asteroid collision damage (25 dmg)
  when ramming player
- Collision rewards: full money for collision kills, bonus XP for asteroids

### Fixed
- Player invincibility during respawn (critical collision vulnerability)

## [4.23.17] - 2025-09-20

### Added
- Automatic bullet-hit targeting: shooting enemies/asteroids now selects them
- Hit enemies immediately show pulsating targeting circle and top display info

## [4.23.16] - 2025-09-20

### Added
- Survival timer replacing score system
- Survival record persistence in localStorage
- Intelligent time formatting (hours/minutes/seconds as needed)

### Fixed
- Level up text overlapping shop button (moved 180px higher)

### Changed
- Score system fully replaced with survival timer
- `rainboidsHighScore` localStorage key replaced with `rainboidsSurvivalRecord`

## [4.23.15] - 2025-09-20

### Added
- `ENEMY_BULLET_CONFIG` constants in constants.js for all bullet types
- Speed and lifetime limits (min/max) for all bullet types
- Level-based scaling for missile acceleration and max speed

### Changed
- Titan missiles: initial speed 1.0→0.5, acceleration 0.08→0.12,
  max speed 8→12, range 600px→800px
- All enemy bullets now use centralized constants

## [4.23.14] - 2025-09-20

### Fixed
- Damage number styling: removed outer stroke for cleaner gold fill
- Persistent targeting: clicking empty space no longer clears current target

## [4.23.13] - 2025-09-20

### Changed
- Renamed `drawCirculatingShield()` to `drawPulsatingCircle()` for clarity

## [4.23.12] - 2025-09-20

### Fixed
- Shield circles removed from all enemies; now only appear on targeted entity

## [4.23.11] - 2025-09-20

### Added
- Click-based targeting system replacing hover effects
- Persistent target selection (clicking different entity to change)
- Target info display for clicked/selected entity

### Fixed
- Guardian targeting circle centering (visual offset adjustment)

## [4.23.10] - 2025-09-20

### Fixed
- Enemy name styling: removed stroke, now clean gold text only
- Target info display: enemy names use consistent gold color

## [4.23.9] - 2025-09-20

### Fixed
- Enemy name font size restored to 10px with gold text and darker gold border
- Target info LV/HP number spacing fixed (20px minimum, centered alignment)

## [4.23.8] - 2025-09-20

### Fixed
- Enemy name font size increased from 10px to 12px for visibility
- Health bar moved closer to enemy name (gap 8px→3px)
- Target info display centered horizontally without overlapping health bar
- Money pickup display: positioned next to coin number instead of overlapping HP

## [4.23.7] - 2025-09-20

### Added
- Laser turret charging/beam effects with cyan particles and muzzle flash
  (Drifter enemy)
- Enemy ship names in ALL-CAPS above health bars
- Target info display: name, health bar, stats at top of screen when hit
- Hover effects: pulsing glow rings on enemies/asteroids under cursor
- Money pickup display: darker gold +amount with 3-second fade
- Damage numbers with parabolic trajectory and fade-out animation
- Animated Titan turret rotation system (turret follows body)
- VERSION file and CHANGELOG.md

### Changed
- Titan tank rotation: smooth animation over 0.3 seconds
- Titan tank frequency: 1.5s movement, 0.5s aim, 0.8s firing, 0.3s rotation
- Level up text: smaller (24px), positioned above Shop button

### Fixed
- Laser turret: fires consistently with proper charging mechanism
- Titan tank: body no longer faces opposite direction from cannon

## [4.23.6] - 2025-09-19

### Changed
- Game map reduced from 3x to 2x screen size (33% smaller play area)
- Asteroid count fixed at 8 per wave (was scaling 3+ per wave)
- MAX_ASTEROIDS increased from 4 to 8
- Sentinel: orbit radius 180→280px, speed reduced 55%, stops before firing
- Stalker: smooth animated rotation when aiming (no instant snapping)
- All mobile enemies (Hunters, Guardians, Wasps, Stalkers) now face their
  shooting direction
- Orb value randomization: health and money orbs now have min/max ranges
  for heal amounts, money values, and visual sizes

## [4.23.5] - 2025-09-19

### Changed
- Turrets converted from stationary to mobile enemies with distinct
  movement patterns: LASER_TURRET→DRIFTER (patrol), MISSILE_TURRET→PROWLER
  (circle), PULSE_TURRET→WEAVER (swarm), SHIELD_TURRET→SENTINEL (slow_orbit)
- Enemy renaming: BOMBER→TANGERINE, turrets use ship names
  (DRIFTER, PROWLER, WEAVER, SENTINEL)
- Wasp: new wasp_dart movement pattern replacing zigzag, speed 1.9→2.2,
  shoot pattern changed to pulse
- Wave data updated across all 50 waves for new enemy type names
- Cooldown timer system removed (all enemies now mobile)

## [4.23.4] - 2025-09-18

### Changed
- Enemy firing behaviors made more distinctive per type

## [4.23.3] - 2025-09-18

### Changed
- Enemy spawning patterns revised for better pacing

## [4.23.2] - 2025-09-18

### Fixed
- Enemy bullet fade-out (bullets now become transparent before despawning)

## [4.23.1] - 2025-09-18

### Fixed
- Custom cursor rendering and hover-red state

## [4.23.0] - 2025-09-18

### Added
- Updated enemy geometries with more distinctive visual designs
- New enemy shooting patterns (spread shots, burst fire, laser sweeps)
- Additional music tracks added to playlist

---

## [4.22.1] - 2025-09-16

### Changed
- Charge shot tuning (charge time, damage scaling, visual feedback)
- Money orbs and health orbs cleaned up and rebalanced
- Enemy movement patterns revised

## [4.22.0] - 2025-09-16

### Added
- Charge shot weapon (hold to charge, release for powerful blast)
- Player leveling system with XP from kills
- Skill point awards on level-up
- Offensive upgrades: rapid fire, multi-shot, homing, piercing, big bullets
- Defensive upgrades: health boost, shield boost, speed boost
- Hit streak system for consecutive hits

## [4.21.0] - 2025-09-14

### Added
- Player lives system (start with 3 lives)
- Player respawning after death (safe location finding)
- Money orbs (dropped by enemies, collected for currency)
- Health orbs (renamed from "burst stars", heal player on collection)
- Constants for fine-tuning health/money orb drop rates and values
- Upgrades for health/money orb drop chance and quantity
- Player lives display in HUD (Triforce-style icons)
- Shop button in HUD (replaced Pause button)

### Changed
- Continuous enemy spawning disabled (switched to wave-based)
- Burst stars renamed to health orbs
- Pause button removed from HUD (accessible via keyboard/shop)

---

## [4.20.3] - 2025-08-14

### Changed
- Further balance polish ("now super fun for a few minutes at a time")
- Mobile joystick now supports simultaneous rotation and thrust

## [4.20.2] - 2025-08-14

### Changed
- Shop costs adjusted for progression curve
- Powerup durations and stacking limits tuned

## [4.20.1] - 2025-08-14

### Changed
- Extensive shop and powerup rebalancing across multiple iterations

## [4.20.0] - 2025-08-14

### Added
- Complete shop system with upgrade categories (offensive, defensive, utility)
- Multi-touch support for mobile (simultaneous movement + firing)
- Dynamic joystick positioning (spawns where finger touches)
- Piercing bullets upgrade (bullets pass through multiple targets)

---

## [4.10.1] - 2025-08-13

### Changed
- Major balancing pass on all game systems
- Visual fine-tuning across entities and effects
- Visibility improvements for game elements

## [4.10.0] - 2025-08-13

### Added
- Sound effects for various game events (explosions, pickups, firing)
- Inter-wave messages ("WAVE COMPLETE", countdown to next wave)
- 19 new background music tracks (White Bat Audio)

---

## [4.0.0] - 2025-07-22

### Added
- Powerup drop system (12 types: rapid fire, multi-shot, homing, piercing,
  big bullets, speed boost, spread shot, explosive, crit chance, crit damage,
  shield boost, medpack)
- Powerup stacking mechanics (each pickup extends duration and adds a stack)
- Powerup timer bars in HUD showing remaining duration

---

## [3.4.5] - 2025-07-18

### Changed
- Visual fidelity improvements ("it looks amazing")
- Overall game feel polished and responsive

## [3.4.4] - 2025-07-18

### Changed
- Bullet speed increased for better game feel
- Asteroid health reduced for faster destruction

## [3.4.3] - 2025-07-18

### Changed
- Extensive performance tuning ("clean, fast, good")

## [3.4.2] - 2025-07-17

### Changed
- Star generation optimized with fewer stars, better distribution
- Starfield parameters tuned for visual quality

## [3.4.1] - 2025-07-17

### Fixed
- Asteroid collision detection bug
- Burst star homing behavior (now properly curves toward player)

## [3.4.0] - 2025-07-17

### Added
- Burst star attraction mechanic (stars home toward player)
- Starfield depth parameters tuned for parallax effect

## [3.3.0] - 2025-07-16

### Added
- Enhanced visual rendering (depth-based effects, opacity layers)
- State saving for development iteration

## [3.2.0] - 2025-07-15

### Added
- Star attraction mechanic (collectible stars gravitate toward player)
- Custom cursor crosshairs
- Hit point system for player and entities
- Health bars on enemies and asteroids
- Invincibility frames after taking damage

## [3.1.0] - 2025-07-14

### Added
- Marquee scrolling text in audio player (track name display)
- Pause button in UI

### Changed
- Converted project to Node.js with npm for package management

## [3.0.0] - 2025-07-13

### Added
- Music player with play/pause controls and track info display
- Energy bar system remade from scratch with energy tanks
- Health bars on asteroids showing remaining HP

### Changed
- Energy system completely redesigned with tank-based display

---

## [2.3.5] - 2025-07-08

### Changed
- Firing changed from continuous to manual ('Z' key to fire)
- Mobile joystick made larger and more responsive
- Pause menu controls updated
- Favicon updated

## [2.3.4] - 2025-07-08

### Fixed
- Black screen bug on some devices (ctx reference fix)

## [2.3.3] - 2025-07-08

### Fixed
- Stars not rendering correctly if cellphone starts in portrait orientation

## [2.3.2] - 2025-07-08

### Fixed
- Font decoding issues (switched from local font to Google CDN)

## [2.3.1] - 2025-07-08

### Fixed
- Ghost bullet bug (bullets spawning at wrong positions)

## [2.3.0] - 2025-07-08

### Added
- Homing bullets (track nearest enemy/asteroid)
- Energy bar and critical energy state (visual warning when low)
- Tractor beam for collecting stars and recharging energy
- Asteroid explosion particles and debris effects
- Asteroid collision sounds
- Loading screen for remote play
- Enhanced screen shake on impacts
- Ship rendering improved with triangular detail for visibility
- Mobile controls: combined movement/rotation analog stick
- Instant rotation with joystick on mobile

## [2.2.0] - 2025-07-07

### Changed
- Codebase refactored from single monolithic file into separate ES6 modules:
  game-engine.js, input-handler.js, audio-manager.js, ui-manager.js, and
  entity classes (player, asteroid, bullet, particle, etc.)
- CSS extracted into separate stylesheet
- All external dependencies (Google Fonts, sfxr.js, riffwave.js) bundled
  locally so the game runs fully offline

---

## [2.1.1] - 2025-06-16

### Fixed
- Game over state bug (game not properly resetting)

## [2.1.0] - 2025-06-16

### Added
- Centralized game state management
- Screen shake effect on collisions
- Local high score persistence (localStorage)
- Mobile touch support (basic)
- Background music (BGM) system with procedural audio
- Thruster engine sound effects
- Different sounds for burst stars vs normal stars
- Motion blur rendering option (experimental)

### Changed
- Visual fidelity improved (point-star palettes, attraction effects)
- Points system tuned

## [2.0.0] - 2025-06-16

### Added
- Wave-based spawning system for asteroids
- Player-asteroid collision detection with damage
- Sound effects (SFXR procedural audio)
- Blending effects (additive rendering for stars/particles)
- 3D wireframe asteroid rendering with opacity-based depth
- Improved asteroid spawning (offscreen, varied sizes)
- Physics: momentum conservation on collisions

### Changed
- Starfield effect made subtler
- Collision system improved for accuracy

---

## [1.0.0] - 2025-06-16

### Added
- Initial release of Rainboids
- Player ship with thrust-based movement and rotation
- Asteroids spawning and drifting across the play field
- Bullet firing system
- Basic collision detection (bullets vs asteroids)
- Parallax starfield background with depth layers
- Decorative color stars with twinkling animation
- Canvas-based rendering
- GitHub Pages deployment (CNAME setup)
