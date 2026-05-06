# Changelog

All notable changes to Rainboids will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- **MAJOR** = fundamental gameplay or architectural overhaul
- **MINOR** = new features, systems, or significant content
- **PATCH** = bug fixes, balance tuning, polish

---

## [5.76.2] - 2026-05-06

Performance hygiene + tech-debt rollup. State-resume stack consolidation, soft-cap bullet eviction, and a regression test for the 5.74.14 wave-clear pause race.

### Profiling (J1)
- Ran `perf-06-combined` matrix. Particle peak ~103 (cap 2500), star peak ~845 (cap 4000) — both have huge headroom. Bullet pool at the 300 soft-cap is the only realistic concern under stress (Twin Cannon + Multi-Shot 4 + Cone of Fire). **No constant bumps**; the eviction fix below is the actual remediation.

### Changed
- **J2. Bullet pool soft-cap now evicts instead of refusing.** When `bulletPool.activeObjects.length >= 300` in `firePrimary`, we now call `bulletPool.softCapAndEvict(300, b => !b.piercing)` to release the oldest non-piercing bullet and free a slot. Piercing bullets are kept (they're high-value rail/capstone shots with longer effective uptime). New `PoolManager.softCapAndEvict(cap, pred)` helper; reusable across pools.
- **K (D2). Single state-resume stack** replaces the `_pausedFromWaveClear` flag and `shopReturnState` field divergence. New `_stateResumeStack` array of `{ state, fromWaveClear? }` frames. `togglePause` and `closeShopAndReturn` both push/pop. Wave-clear pause tags its frame with `fromWaveClear: true` so the resume routes through `startNextWave`. `_pausedFromWaveClear` and `shopReturnState` survive as back-compat read proxies that peek at the stack top.

### Tests
- **K (D3). New e2e** `tests/e2e/11-wave-pause-race.spec.js` exercises the full sequence: start game → force wave 1 complete → pause during the 2.7s setTimeout window → wait past 2.7s while paused → resume → assert the wave advances. Catches both the 5.74.14 setTimeout-gate bug and any future regression in the 5.76.2 stack consolidation. Passes on master.
- 62/62 unit tests still pass.

---

## [5.76.1] - 2026-05-06

Powerup cap retune + defense HUD widgets + capstone toast + sub-wave phase toast + wave-clear recap. Visual feedback pass for the 5.75–5.76 mechanics that work silently.

### Changed
- **Powerup `maxStacks` retuned** based on per-powerup gameplay analysis (where each stack stops being meaningful):
  - `BIG_BULLETS` 4 → 3 (4 stacks turn bullets into physics objects).
  - `PIERCING` 3 → 4 (sub-waves spawn denser groups; 4th pierce is the difference between sweep and waste).
  - `CRIT_CHANCE` 8 → 6 (6 stacks + base = 50% crit; further is noise).
  - `SHIELD_BOOST` 5 → 4 (`getEffectiveShield` clamps at 75%; 5th stack is a no-op).
  - `MEDPACK` 4 → 3, `PAYDAY` 4 → 3, `HEALTH_ORB_DROP_CHANCE` 5 → 4, `MONEY_ORB_DROP_CHANCE` 5 → 4 (drop rate already clamps at 0.95–1.0).

### Added
- **Defense HUD indicators** (left edge, above the loadout squares). Only render when the player owns the upgrade:
  - **Reflexes** — green ring fills as the 30s post-use cooldown ticks down to ready; full ring + soft glow when armed.
  - **Last Stand** — ✊ icon framed by a red glowing ring while armed; greys + dims after consumed.
  - **Static Field** — vertical shield meter showing `current / cap` with a numeric overlay; fills with a blue gradient.
- **Defense trigger feedback**:
  - REFLEXES dodge → 16 cyan-blue arc particles + `audio:shield`.
  - LAST_STAND save → 24 red explosion particles + screen flash + screen shake + `audio:powerup` + `audio:player-explosion`.
  - STATIC_FIELD soak → 6 blue crackle sparks + `audio:shield` per absorbed hit.
- **🎖️ MASTERY UNLOCKED toast.** First time each tier-2 capstone becomes available, a 2.8s toast announces it. Tracked in a `_seenCapstoneUnlocks` set so re-opens don't re-spam. Also re-checked after every shop purchase so the unlock hits the moment the prereq's last stack is bought.
- **Sub-wave phase toast.** Sub-waves > 0 now emit a `WAVE N · PHASE 2 of 3` 1.6s top-banner so the player notices the next group spawning. Sub-wave 0 keeps the existing WAVE INTRO splash.
- **Wave-clear recap** in the WAVE COMPLETE message subtitle: `+G GOLD · +N PICKS · MISSION ✓/✗/—`. Renders during the existing 2.4s pre-menu window. Pulls bonus gold + mission state from a per-wave `_waveClearRecap` stash.

---

## [5.76.0] - 2026-05-06

Big economy + difficulty rebalance: SP currency removed, all DEFENSE upgrades now cost gold, every upgrade tier ~2× cost, late-game HP curve scaled up, damage numbers aggregate per-enemy, and crit numbers zoom toward the camera.

### Removed
- **SP (Skill Points) currency entirely.** Every upgrade now uses gold. Shop currency row hides the SP element. Level-up still grants `+1 skillPoints` internally for back-compat with stats but it no longer affects gameplay. Cheat code `]` now grants `+5000 Gold` (was `+5 SP`).

### Changed
- **DEFENSE shop items migrated SP → COINS** with prices that match the late-game economy:
  - Health Boost 1 SP → 1200g; Shielding 1 SP → 1500g; Afterburner 2 SP → 2200g; Triage 2 SP → 1800g.
  - Reflexes 4 SP → 5500g; Last Stand 6 SP → 8000g; Static Field 3 SP → 3200g.
  - Spare Ship: 5000g → 12000g (still flat-cost, only existing item that was already gold).
- **All weapon and skill upgrades scaled up.**
  - PRIMARY tier-1: 400-1750g → 900-3700g (~2×). Tier-2 capstones: 4500-5500g → 7500-9000g (~1.5×).
  - POWER tier-1: 700-2000g → 1500-4300g.
  - SKILL upgrades: SP cost × 1500g (e.g. 2 SP → 3000g, 3 SP → 4500g) and currency now COINS uniformly.
- **Late-game HP curve scaled up** to keep up with stacked DPS post-Twin Cannon / Hailstorm / Overcharged Beam. `getLevelScaledEnemyStats` HP multiplier `1 + t × 6.5 + pow(t, 2.5) × 4` → `1 + t × 8.0 + pow(t, 2.5) × 6.5`. Wave 5 ~3.0× (was ~2.5×), wave 10 ~5.5× (was ~4.5×), wave 20 ~15.5× (was ~11.5×).
- **Damage numbers aggregate per-enemy on a 1-second window.** Hitting the same enemy 30 times in a second now produces ONE growing number that ticks up in place, instead of 30 overlapping floaters. Crits, player-hit numbers, and one-shot AOE blasts (mines without a single target) bypass the aggregator and pop fresh — those are individually meaningful events. Each `createDamageNumber` call site now passes `{ target }` so the aggregator can key on identity.
- **Two-word weapon and skill names render as two lines in the radial center.** "Pulse Cannon" / "Charge Shot" / "Phase Dash" now spawn one word per line instead of word-wrapping. Cleaner read at the small hub diameter.

### Added
- **Crit damage numbers zoom toward the camera.** Font scales 22 → 56 px over the 1-second life of the floater, with an 80 ms scale-pulse "punch" at impact and a soft white-hot edge glow. The CRIT! tag scales with the number. Pairs with the crit-rush fire-rate boost (5.75.0 B3) so crits land as a real visual burst.

### Tests
- HP-curve test bounds updated for the new multiplier. 62/62 pass.

---

## [5.75.1] - 2026-05-06

### Added
- **Tier-2 weapon mastery upgrades (B1).** One capstone per primary weapon. Each is a single-stack high-cost upgrade hidden from the shop until its tier-1 prereq is at maxStacks; picking up the capstone changes the weapon's *feel*, not just its numbers.
  - **Pulse Cannon — Twin Cannon** (4500g, requires OVERCHARGE × 4): fires two extra bullets at ±8° angles at half damage.
  - **Storm Needles — Hailstorm** (4500g, requires NEEDLE_STORM × 4): +1 needle per shot AND every needle gets +1 piercing.
  - **Scatter Gun — Cone of Fire** (4500g, requires BUCKSHOT × 2): +2 pellets AND every pellet pierces 1 enemy.
  - **Rail Driver — Resonance Drive** (5000g, requires PENETRATOR × 3): rails effectively unlimited piercing (99).
  - **Lance Beam — Overcharged Beam** (5500g, requires BEAM_WIDTH × 3): +120% beam damage, +50% width, +50% range.
  - **Lightning Arc — Tesla Overcharge** (4500g, requires AMPLIFIER × 3): +30% arc damage, +50% chain range.
- **Shop visibility gate** in `_buildPrimaryTabItems` reads `upg.requires.{id, stacks}` and only lists capstones once the prereq stacks are met. Late-game gold finally has somewhere meaningful to land after tier-1 saturates.

---

## [5.75.0] - 2026-05-06

Big balance + content rollup. Late-game HP, wave structure, powerup caps, defensive depth, mission system, streak qualitative bonus, and a few hot-path cleanups.

### Added
- **Sub-wave system.** Waves now spawn in 2–3 staggered groups instead of one burst. New sub-wave fires when ≤2 enemies remain (or after a 12s fallback). Each wave's `WAVE_DATA` entry uses `subWaves: [[group, ...], ...]`. Wave-complete check now requires all sub-waves spawned AND pool empty. Boss waves hold the boss until the final sub-wave so the escort softens the player up first. Total wave duration roughly doubles.
- **Mid-wave mini-bosses (A3).** From wave 4 onward, non-boss enemy spawns have a wave-scaled chance (capped at 45%) of promoting one enemy in the group to a "mini-boss": 1.7× HP, 1.25× size, 2× points. Adds threat spikes between scripted boss waves.
- **Defense overhaul (B4).** Three new SP-priced shop items:
  - **Reflexes** (4 SP, 1 stack): one free dodge per 30s — next bullet that would damage you misses.
  - **Last Stand** (6 SP, 1 stack): on lethal hit, survive at 1 HP. One-time per run.
  - **Static Field** (3 SP, 3 stacks): +2 HP regenerating shield per stack. Refills after 8s of no damage at 1 HP/s.
- **Crit feedback loop (B3).** Landing a crit grants a 30% fire-rate cooldown reduction for 800ms. Stacks multiplicatively with RAPID_FIRE. Gives CRIT_CHANCE / CRIT_DAMAGE builds a moment-to-moment payoff.
- **LEGENDARY streak qualitative bonus (C2).** At 15+ kill streak, every primary bullet gains a +22 px explosion radius (additive with the EXPLOSIVE powerup).
- **Wave missions (C3).** One random objective per wave: TAKE NO DAMAGE / BLITZKRIEG (5 kills in 8s) / ROCK BREAKER / KEEP THE FIRE (12-streak) / PRECISION (25 crits). Boss waves always assign TAKE NO DAMAGE. Reward: +1 powerup pick. Mission announcement banner at wave start; success/fail toasts.

### Changed
- **Late-game HP curve recalibrated (A4).** `getLevelScaledEnemyStats` now `1 + t × 6.5 + pow(t, 2.5) × 4`. Wave 5 ~2.5×, wave 10 ~4.5×, wave 15 ~6.8×, wave 20 ~11.5× (was capped at 7.5×). Player DPS scales similarly with stacked upgrades, so late waves feel like a fight again.
- **POWERUP `maxStacks` everywhere (B2).** Per-powerup caps added to `POWERUP_TYPES`: RAPID_FIRE 5, MULTI_SHOT 4, HOMING 3, BIG_BULLETS 4, SPEED_BOOST 3, PIERCING 3, EXPLOSIVE 3, CRIT_CHANCE 8, CRIT_DAMAGE 6, SHIELD_BOOST 5, LONG_RANGE 3, KNOCKBACK 3; DROPS family 3–5. `addPowerup` and `purchasePowerup` both gate on the cap; pause-menu cards display `×N / cap` and disable at MAX. No more silently dumping picks into one infinite-stack powerup.

### Fixed / cleanup
- **D1 — Autofire diagnostic disabled by default in production.** `autofireDiag.enabled = false` initially; toggle via `window.__autofireDiag.enable()` for debugging. Was on every fire tick + record(snap) + buffer write per shot.
- **D4 — Nebula renderer caches the global blink phase term once per frame** instead of recomputing `now × 5 × 2π` per star, per frame. Same shape, ~25 fewer multiplies per frame.

### Tests
- Unit tests updated to walk the new `subWaves` shape and the recalibrated HP/speed bounds. 62 tests pass.

---

## [5.74.36] - 2026-05-06

### Changed
- **Targeting circles around enemies are now centered on the canonical position.** `drawTargetingEffect` had a Guardian-specific forward offset (`radius × 0.3` along `faceAngle`) that pushed the highlight ring off the actual enemy center, making the ring read as drifting/misaligned. Removed; every enemy's targeting circle now sits on `(this.x, this.y)` — consistent with collision and every other enemy draw.
- **Killstreak indicator fades to ~20% opacity when the player ship or mouse cursor overlaps it.** New AABB check around the block (~200×95 centered on the streak HUD anchor). When the ship hull (radius-aware) or mouse cursor enters the AABB, `_streakFade` lerps toward 0.20 at 0.12/frame; otherwise lerps back to 1.0. The streak still updates underneath; it just gets out of the way of whatever the player is doing or hovering on.

---

## [5.74.35] - 2026-05-05

### Changed
- **Asteroid wireframe edges now have a black stroke outline.** Pre-pass in `drawAsteroidShape` strokes every edge once at `lineWidth = 4.5` in opaque-ish black (`globalAlpha = 0.85`, `lineCap = round`) BEFORE the existing colored bucketed pass paints the visible 2px wireframe on top. Result: every line has a dark halo around it so the asteroid silhouette and 3D structure stay legible even when overlapping a bright nebula cloud or saturated lens-flare star. One extra `beginPath` + `stroke` per asteroid — negligible cost.

---

## [5.74.34] - 2026-05-05

### Changed
- **Kill-streak now scales gold drop RATE in addition to amount.** 5.74.33 only multiplied the budget; 5.74.34 hoists `streakGoldMult = min(2.5, 1 + streakCount × 0.06)` to also apply to `moneyDropRate` (still clamped at 0.95). High streaks now earn both more *frequent* and *larger* gold drops, so the reward compounds in both axes. Sample stack at level 10 on a 15-kill streak: ~3.6× drop probability AND ~3.6× per-drop budget vs base.

---

## [5.74.33] - 2026-05-05

### Changed
- **Gold Find scaling per level doubled.** `getGoldFindMultiplier` now returns `1 + (level − 1) × 0.10` (was `× 0.05`). Level 1 = 1.0×, level 5 = 1.40×, level 10 = 1.90×, level 20 = 2.90×. Applies to both money drop rate and money budget per drop, so leveling now meaningfully accelerates the economy.
- **Kill-streak gold multiplier added.** `dropOrbsFromEntity` now multiplies the money budget by `min(2.5, 1 + killStreakCount × 0.06)` — +6% gold per streak count, capped at 2.5× at 25 kills. Stacks multiplicatively with Gold Find: a level-10 player on a 15-kill streak gets ~3.6× the base gold per drop (1.90 × 1.90). Encourages chaining kills before the 10s idle timer expires.

---

## [5.74.32] - 2026-05-05

### Changed
- **Killstreak indicator: clean stacked layout, always-active color.** Removed every overlap and the gray-out SAVED state. Block now lays out as cleanly stacked rows from top to bottom:
  - `y+0`  — `N KILLS` big number (22px), tier-colored.
  - `y+30` — tier label (12px). Pre-tier shows `STREAK`; max tier appends `(MAX)`.
  - `y+50` — tier progress bar (5px) toward next tier (full bar at max).
  - `y+62` — idle-countdown drain bar (5px), green → red over 10s.
  - `y+74` — `X.Xs` numeric countdown (8px), placed BELOW the bar.
  - **Removed:** the `+N% DMG` line that overlapped the tier-progress bar caption, the `→ NEXT TIER @ N` / `▲ MAX TIER` text inside the tier bar, the `▶ KILL TO RE-ARM` text that overlapped the idle bar, the gray-out fade alpha + dim grey-white SAVED state. The streak now reads in the active tier color the entire time the streak is alive.

---

## [5.74.31] - 2026-05-05

### Fixed
- **Bullet-killed and collision-killed asteroids now feed the kill streak.** 5.74.18 wired `destroyAsteroid` into `onEnemyKill`, but two asteroid-destruction paths inline the destruction sequence instead of calling `destroyAsteroid`: the bullet-hits-asteroid path in `handleBulletAsteroidCollisions` (the most common kill path — small/large asteroid death-flash branches), and the player↔asteroid collision kill. Both now call `onEnemyKill(asteroid)` so primary-weapon-only kills and ramming kills both count toward the streak counter, refresh the idle timer, and earn streak-tier buffs.

---

## [5.74.30] - 2026-05-05

### Changed
- **Nebulae sized back up while staying dim.** 5.74.29 cut both size and alpha; the user wanted bigger silhouettes but kept the lower brightness. Sizes pushed ~1.7× toward the 5.74.28 footprint, alphas unchanged from 5.74.29:
  - Region scale `0.45-0.85 → 0.70-1.30`.
  - Halo size `320-450 → 520-740` px (alpha still `0.05-0.09`).
  - Wispy filament size `220-330 → 360-540` px (alpha still `0.07-0.13`); along-axis spread `220 → 360`, across `70 → 110`.
  - Core size `140-230 → 230-380` px (alpha still `0.10-0.16`); jitter `90 → 150`.
  - Drift size `180-280 → 300-480` px (alpha still `0.04-0.07`).
  - Region count `4`, drift count `3` unchanged. Each region now has more presence as a background structure but the dim alpha keeps the gameplay area legible.

---

## [5.74.29] - 2026-05-05

### Changed
- **Nebulae dimmer, smaller, and more focused.** The 5.74.28 sky-spanning JWST regions were dominating the screen and washing out the gameplay area. Cuts across the board:
  - Regions `5 → 4`, drift clouds `5 → 3`.
  - Region scale `0.7-1.4× → 0.45-0.85×` — base size halved.
  - **Halo size** `550-800 → 320-450` px, **alpha** `0.08-0.15 → 0.05-0.09`.
  - **Wispy filament size** `380-580 → 220-330` px, **alpha** `0.10-0.20 → 0.07-0.13`. Filament count fixed at 2 (was 2-3).
  - **Core size** `220-380 → 140-230` px, **alpha** `0.14-0.24 → 0.10-0.16`. Count fixed at 1 (was 1-2).
  - **Drift haze size** `280-500 → 180-280` px, **alpha** `0.06-0.12 → 0.04-0.07`.
  - Region jitter offsets reduced proportionally so each region stays compact rather than sprawling. Net result: each nebula reads as a discrete focused cloud against the field instead of an overwhelming wash; gameplay area is clear again.

---

## [5.74.28] - 2026-05-05

### Added
- **JWST-style nebula regions.** Replaced the scattered single-color cloud blobs from 5.74.20 with coherent multi-layered nebula regions inspired by Webb Space Telescope imagery (Pillars of Creation, Cosmic Cliffs / Carina, Tarantula, Southern Ring, NGC 6334, Eagle).
  - **2 new atlas slots (`nebula_wispy`, `nebula_core`)** painted via 3-octave value-noise FBM. `wispy` uses anisotropic frequency (X 2× Y) → elongated filamentary streamers like the gas pillars in Eagle/Carina. `core` uses a sharp inner exp-falloff plus noise-modulated halo → dense ionization-front cores like the Cosmic Cliffs ridge. Atlas now 15 slots (1920 × 128 px).
  - **8 hand-tuned palettes** with `{core, mid, edge}` color triplets matching famous JWST images. E.g., Pillars: gold core + amber mid + deep red edge; Cosmic Cliffs: gold ridge + orange + cyan H II; Tarantula: pink core + magenta + electric blue.
  - **5 nebula regions per scene**, each spawning **5–8 layered clouds** at related positions: 1–2 huge soft outer halos (edge color, slot 8), 2–3 wispy filaments aligned to a per-region rotation axis (mid color, slot 13), 1–2 dense bright cores (core color, slot 14). Filaments coherently align so each region reads as a directional gas structure rather than a scatter. 5 small cool-tinted drift clouds fill background atmosphere between regions.
  - **Shader update**: flicker/twinkle exemption widened — was slot 8 only, now slots 8 + 13 + 14 (all nebula content). 3D shape stars (slots 9–12) still flicker. Range gate uses two `step()`s (`step(7.5, a_shape) * (1 - step(8.5, a_shape)) + step(12.5, a_shape)`). Zero new draw calls — entire nebula still renders through the existing instanced starfield pipeline.

---

## [5.74.27] - 2026-05-05

### Fixed
- **Lens-flare stars perceptible again.** Previous trim pass (5.74.23: counts 14, core 0.7-2.0px) plus the per-star animation amplitudes from 5.74.25 (twinkle 0.20-0.40, slide 0.15-0.30, blink dip 0.45) combined to a worst-case alpha of ~0.23 on already-tiny sprites — visually the stars dipped below perception and read as "missing." Three coordinated tweaks:
  - **Counts bumped 14 → 25 total** (4/5/7/9 per layer). Camera parallax leaves roughly half off-screen at any time; 25 total → ~12 visible at once instead of ~7.
  - **Sizes bumped:** core `0.7-2.0` → `1.4-2.8` px, halo `5-10×` → `7-14×` core, spike `0.7-1.1×` → `1.0-1.5×` halo. Brightness floor `0.7` → `0.85`. Dimmest layer luminance `0.55` → `0.70` so deepest stars still have presence.
  - **Animation amps reduced** so the combined runtime alpha never dips far enough to hide a star: twinkleAmp `0.20-0.40` → `0.10-0.20`, slideAmp `0.15-0.30` → `0.08-0.18`, blink dip `0.45` → `0.30`. Worst-case alpha now ~0.50 (was 0.23). Twinkle/blink/slide still visible — just no longer self-obliterating.

---

## [5.74.26] - 2026-05-05

### Fixed
- **Lens-flare stars were drawing way off-screen.** The 5.74.25 per-star refactor flipped the parallax offset sign — stars were drawn at `star.x − cameraX × (1 − depth)` but the canvas was already pre-translated by `−cameraX`, which combined to `screen = star.x − cameraX × (2 − depth)` instead of the intended `screen = star.x − cameraX × depth`. Stars rendered at huge negative screen coords and never appeared. Sign corrected to `+ camOffX`, matching the original layer-canvas formula.
- **Nebula clouds no longer flicker or twinkle.** The 5.74.24 flicker layer was applying to every WebGL instance, including the oversized cloud quads — which turned the entire haze layer into a 5 Hz strobe. Vertex shader now `step(7.5, a_shape)` gates flicker + twinkle to slot 0–7 (stars only); slot 8 (cloud) renders with its static base alpha. Clouds are background atmosphere; they should drift, not pulse.

---

## [5.74.25] - 2026-05-05

### Changed
- **Lens-flare stars now rotate, twinkle, blink, and opacity-slide.** Refactored `nebula-renderer.js` from baked-per-layer canvases to per-star sprites + per-frame draw. Each lens-flare star is pre-rendered once into its own small offscreen sprite (halo + 4-arm cross spikes + 45° cross + saturated core + white-hot center), then per frame drawn with:
  - **Rotation** — `random(0.1, 0.4)` rad/s with a sign coin-flip, accumulated against `performance.now()`. Half spin CW, half CCW; the per-layer scene rotation (used by the title screen) still adds on top.
  - **Twinkle** — slow smooth sine, 0.7–1.6 rad/s, amplitude 0.20–0.40, per-star phase. Same shape as the WebGL field's twinkle.
  - **Blink** — fixed 5 Hz layer with `pow(sin, 8)` peaks (sharp on/off), per-star phase derived independently. Dips alpha by up to 45% briefly per cycle.
  - **Opacity slide** — very slow sine (0.08–0.20 rad/s, ~30–80s period) with 15–30% amplitude. Long-period brightness drift on top of the fast twinkle so the field feels alive even between blinks.
  - Final `alpha = twinkle × blink × slide`. Cost is ~14 `drawImage`/frame for the whole nebula layer — negligible. Legacy `_drawLensFlareStars` removed.

---

## [5.74.24] - 2026-05-05

### Added
- **Scanlines on the WebGL starfield/nebula layer.** Fragment shader multiplies RGB by `0.78 + 0.22 * sin(gl_FragCoord.y * π)` — every other framebuffer row is dimmed by ~22%, producing fine 1-pixel horizontal banding reminiscent of a CRT. Applied at the shader level so it only affects the WebGL star/nebula draws on `glCanvas`. The foreground action (entities, bullets, particles, HUD) renders on `gameCanvas` which sits on top — completely unaffected.
- **Global flicker layer on top of per-star twinkle.** New uniform 5 Hz blink across all stars, with per-star phase derived from `a_twinklePhase * 7.0` so stars stutter independently rather than blinking in unison. Power-shaped peaks (`pow(sin, 8)`) give stuttery on/off character; flicker alpha dips to ~0.55 briefly at each peak so stars never go fully dark. Multiplies onto the existing smooth twinkle, so the field reads as "real" twinkling rather than a pure sine-wave breath.

---

## [5.74.23] - 2026-05-05

### Changed
- **Lens-flare stars rarer + smaller.** Counts cut again `2/3/4/5` per layer (was `3/4/6/8`), totalling ~14 across the field. Core size `1.2–3.4` → `0.7–2.0` px, halo radius `8–18×` → `5–10×` core, spike length `1.0–1.6×` → `0.7–1.1×` halo. Each flare now reads as a precise pinpoint rather than a sprawling glare; the field has fewer "wow" stars but each one earns its place.
- **Kill-streak indicator now shows after every kill, with an idle countdown bar.** Was previously hidden until 3 kills (the first tier threshold). Now `drawStreakIndicator` shows from kill #1 with a "STREAK" label pre-tier, and adds an always-visible 10s drain bar (green→red gradient as it drains) plus a numeric "X.Xs" countdown so the player can see exactly how much time they have to land their next kill before the streak resets. The bar refills to full on every kill / asteroid destroy.

---

## [5.74.22] - 2026-05-05

### Added
- **3D shape stars: cube, octahedron, tetrahedron, prism.** Four new atlas slots (9–12) added to `webgl-starfield-atlas.js`. Each is a filled silhouette (full-alpha white) plus internal edges stroked at 45% alpha black so the shape reads as a dimensional solid against the silhouette tint. Cube uses the classic isometric "Y" projection (hex outline + 3 internal edges meeting at center). Octahedron is a vertical diamond with an equator line. Tetrahedron is a pointed-up triangle with internal edges to a centroid pulled slightly down for depth. Prism is an isometric box with slanted top edges. Added to the big-star shape pool in `ColorStar.reset` so they spawn naturally alongside the 2D `star4`/`star5`/`hexagon`/etc.

### Changed
- **Star rotation guaranteed bidirectional + minimum visible magnitude.** The old `random(-0.02, 0.02)` was uniform — half the stars ended up with `|rotationSpeed| ≈ 0` and looked statically oriented, and the few with appreciable speed happened to skew positive often enough that the field "looked like it rotated one way." New: explicit sign coin-flip × `random(0.008, 0.030)`, so every shape star visibly spins, half CW and half CCW. Initial rotation is also randomized so multiple stars of the same shape don't all line up at spawn.

---

## [5.74.21] - 2026-05-05

### Changed
- **Kill-streak idle timeout 30s → 10s.** Streak now needs a kill (enemy or asteroid) every 10 seconds to keep going, not 30. Tighter window keeps streak buffs feeling earned and active rather than passively maintained.
- **Lens-flare star counts cut roughly in half** across all four parallax layers (6/9/12/16 → 3/4/6/8). With the brighter, more saturated 5.74.20 render recipe each flare carries more visual weight, so fewer of them reads cleaner — they're punctuation, not wallpaper.

---

## [5.74.20] - 2026-05-05

### Added
- **WebGL nebula cloud layer.** Atlas extended to 9 slots — slot 8 is a `cloud` blob (wide gaussian × bilinear-interpolated 8×8 noise lattice) baked once at startup. `_populateWebGLNebula` spawns ~16 oversized "star" instances with size 300–700 px, parallax 0.02–0.07, alpha 0.10–0.20, slow rotation, and saturated nebula tints (cobalt / violet / magenta / amber / emerald / gold / etc.). They render through the existing instanced starfield pipeline — zero new draw calls, GPU cost rounds to nothing. Additive blend stacks overlapping clouds into mixed-hue patches.

### Changed
- **Lens-flare stars dramatically more vibrant.** Three-pronged change in `nebula-renderer.js`:
  - **Palettes overhauled.** Each palette now defines 5 fully-saturated accents from a hue family (was 3 desaturated); two new palettes added (`aurora`, `sunset`); 12 palettes total. The neutral "default star" tone shifted from `(220, 230, 255)` to `(240, 245, 255)` so neutral stars also pop.
  - **Accent rate flipped 30% → 70%.** Lens-flare stars are *meant* to be the colorful accents of the field, not sparse sprinkles. Most flares are now palette-tinted; only 30% are hot blue-white.
  - **Render recipe pumped.** Brightness floor 0.5 → 0.7. Core 0.8–2.4 → 1.2–3.4 px. Halo radius 6–14× → 8–18× core. Halo gradient hotter inner stop (`0.7 → 0.95` at center). Spike width bumped, spike falloff slower. Added a 45°-rotated cross-spike at 55% length for extra brilliance. White-hot center pixel now appears on every star (was only `brightness > 0.85`) at 32% of core size, so the saturated tint dominates while every flare still gets a hot pinpoint.

---

## [5.74.19] - 2026-05-05

### Fixed
- **Shape stars: actually vibrant now.** Three things were silently desaturating colors:
  - **Fragment shader was multiplying RGB by `BRIGHTNESS_GAIN = 1.3` then clamping to [0,1].** A palette color like `#ffd75c` (1.0, 0.84, 0.36) became (1.3, 1.09, 0.47) and clamped to (1.0, 1.0, 0.47) — yellow-gold turned to pale lemon because the two highest channels both saturated. Removed the gain entirely; brightness now comes from alpha (additive blend `SRC_ALPHA, ONE` already multiplies contribution by alpha, so a fully-saturated RGB at alpha=1 contributes its pure hue without any clamp-induced desaturation). Halo alpha bumped 0.5 → 0.9 to compensate for the lost gain.
  - **Vertex shader hot-shifted color toward white at the bright twinkle peak** (`mix(color, vec3(1.0), wave * 0.25)`). Removed — peaks are now where color is *most* visible, not where it washes out.
  - **JS-side now applies an aggressive desaturation-to-saturation pass** for shape stars: subtracts 75% of the min channel (kills the gray "white component" baked into pastel palette entries) then normalizes max-channel to 1.0. `#a6b3ff` (0.65, 0.70, 1.0) now becomes (0.31, 0.41, 1.0) — visibly *blue* instead of lavender pastel. Pure colors like (1, 0, 0) stay pure. Shape-star alpha floor lifted 0.65 → 0.95 so the saturated hue is also as bright as possible. Dot stars (the bulk of the field) still use their natural palette + size-inverse damp, so the field reads like a starscape, not a rave.

---

## [5.74.18] - 2026-05-05

### Changed
- **Kill streak no longer resets on damage; resets on 30s of inactivity instead.** Previously every player-damage path (`lifecycle.takeDamage`, player↔enemy collision, player↔enemy-bullet collision) called `_breakKillStreak()`, zeroing the count + clearing the streak buff the moment HP dropped. The streak buff payoff was effectively unreachable because most builds take chip damage. Now: `_breakKillStreak()` is a no-op (existing damage callsites preserved for back-compat), and `combat-manager.updateKillStreak` checks `now - killStreakTimer > 30000` each tick and resets the count + buff on idle. Buff window (`STREAK_BUFF_DURATION`) still independently expires for the damage-multiplier portion.
- **Asteroids now count toward the kill streak.** `destroyAsteroid` in `collision-system.js` calls `onEnemyKill(asteroid)` so asteroid kills increment `killStreakCount` + `killCount` and refresh the streak idle timer alongside enemy kills. Streak tier buffs work uniformly across both target types. Milestone notification copy updated from "enemies destroyed" → "targets destroyed".

---

## [5.74.17] - 2026-05-05

### Removed
- **Random "free" powerup grant on level-up.** `progression.grantLevelUpBonus` was awarding 2 random temporary stacks (45s) from a pool that included MULTI_SHOT, RAPID_FIRE, HOMING, BIG_BULLETS, etc. — which is why MULTI was randomly appearing without any pickup or purchase. Build determinism is back: level-up still grants `+1 SP` and `+1 powerup pick`, but no stealth stacks. `lastLevelUpBonus` now resolves to an empty array so any UI that reads it stays safe.
- **`P` cheat key (debug powerup spawn) removed.** Powerups are purchase-only via the POWERUPS pause-tab — this debug spawner has no place now that ground pickups and random grants are gone.

### Changed
- **Powerup HUD relocated from bottom-left to top-right vertical column.** `#powerup-hud` CSS rewritten to anchor at `top: 20px; right: 20px; bottom: 110px` with `flex-direction: column; flex-wrap: wrap-reverse`. First column starts at the top-right corner and fills downward; when full, additional columns open to the LEFT of the previous one (rightmost column = newest, build grows leftward). The 110px bottom reserve clears the bottom-right gold readout (`canvas.height - 76`) and survival timer (`canvas.height - 40`) plus a buffer, so powerup icons never overlap either readout regardless of how many stacks are active.

---

## [5.74.16] - 2026-05-05

### Changed
- **Purchased powerup cards now use a single bright-blue accent border** (`#00ccff` + soft cyan glow) instead of the per-powerup `cfg.color`. The rainbow-of-borders pattern from 5.74.15 was visually noisy across the strip; a uniform cyan reads cleanly as "purchased" without competing for attention.

---

## [5.74.15] - 2026-05-05

### Fixed
- **Shape stars no longer wash out to white.** The 5.74.13 halo pass summed `shape × 1.6 + halo × 1.6` then clamped, which pushed every channel of saturated colors past 1.0 — every shape star ended up rendered nearly white regardless of the palette pick. New shader: gain on the shape rebalanced 1.6 → 1.3, halo masked by `(1 - tex.a)` so it only fills the empty area around the silhouette (preserves hue) and bumped to 0.85 strength. Color burst is back; brightness is mostly preserved.

### Changed
- **Owned powerup cards now have a vibrant identity-colored border + lighter background** (mirrors the POWER pause-tab weapon-row EQUIPPED treatment). `renderPowerupsOverlay` inlines `cfg.color` as the border color and adds a soft 12px shadow at 25% opacity in that hue. The `.powerup-card--owned` base class flips the background from a 6%-opacity cyan tint to an 18%-opacity neutral white, and bumps border width 1 → 2px. Result: purchased powerups read as bought at a glance and each has its own visual identity instead of all sharing the same cyan accent. Hover on owned cards brightens via `filter: brightness(1.15)` to keep the inline border color intact.

---

## [5.74.14] - 2026-05-05

### Fixed
- **Wave sometimes refused to transition after killing every enemy.** Root cause: the wave-clear handler in `updateWaveSystem` immediately flips `state = WAVE_TRANSITION` and schedules a real-time `setTimeout(2700)` to open the powerups menu. The setTimeout's callback is gated by `if (state === WAVE_TRANSITION)`. If the player paused, alt-tabbed (browser timer throttling), or otherwise nudged the state out of `WAVE_TRANSITION` during that 2.7-second window, the gate failed and the menu never opened. `togglePause`'s resume path defaulted to `state = PLAYING` (because `_pausedFromWaveClear` was previously only set inside `openWaveClearPowerupsMenu`, which never ran). Result: empty enemy pool + `waveComplete = true` + `state = PLAYING` — and the regular wave-clear branch is gated by `!waveComplete`, so no progression was possible. Two-part fix:
  - **Set `_pausedFromWaveClear = true` immediately at wave clear** (instead of waiting for `openWaveClearPowerupsMenu` to set it). Any pause during the 2.7s window now routes the resume through `togglePause`'s wave-clear branch into `startNextWave()`, so the run can never get stuck even if the menu setTimeout misfires.
  - **Added a recovery branch in `updateWaveSystem`**: if `pool empty && waveComplete === true && state === PLAYING`, re-open the powerups menu. This single-shot catch-all (the menu flips state to `PAUSED`) handles any unforeseen path that lands in the stuck state. Belt and suspenders.

---

## [5.74.13] - 2026-05-05

### Changed
- **Colorful starfield + WebGL glow halo.** Three coordinated tweaks; no instance count change so frame cost is essentially flat.
  - `NORMAL_STAR_COLORS` palette expanded from 8 cool pastels to 18 saturated entries spanning violet, magenta, hot pink, electric blue, neon cyan, emerald, lime, gold, and amber. Sampled uniformly by shape stars in `color-star.js`, so every silhouette has a chance to land on a saturated nebula hue.
  - `BackgroundStar.reset` keeps blue-white / white / cyan / warm-gold as the dominant tones (75% combined) but adds a 15% chance for a saturated nebula tint (electric violet, hot magenta, amber, emerald, neon blue, gold). Result: the background reads like a real night sky most of the time with occasional bursts of color.
  - `webgl-starfield-renderer` fragment shader gains a radial halo glow. New `v_quadUV` varying carries the local 0..1 quad position; the fragment shader computes `halo = (1 - smoothstep(0,1,dist))²` (cheap — one `length` + one `smoothstep` per fragment) and adds `v_color.rgb × halo × 0.55` on top of the atlas silhouette. Star shapes now have a colored bloom around their edges instead of a hard cutoff. Brightness gain (1.6×) is unchanged so peak hot-white pixels still saturate.
  - Shape stars in `_tryAddColorStarToWebGL` push their RGB toward the palette by 1.15× (clamped) and use a higher alpha floor (0.65) + twinkle amplitude (0.55) than dot stars, so silhouette stars register as the nebula highlights they're meant to be. Dot stars (the bulk of the field) keep their existing size-inverse alpha damp so they stay quiet.

---

## [5.74.12] - 2026-05-05

### Changed
- **All 10 enemy types tougher from wave 1.** Base health bumped ~67% across the roster so early waves don't feel like a free shooting gallery — the bullet-hell-era values (3–12 HP) were tuned around an older damage curve and the player's current build chews through them too fast. New base HP: HUNTER 3→5, GUARDIAN 7→12, WASP 3→5, STALKER 4→7, DRIFTER 5→9, PROWLER 8→14, WEAVER 3→5, SENTINEL 6→10, TANGERINE 6→10, TITAN 12→20. Wave-scaled HP curve is unchanged — late-wave health still scales on top of the new bases, so high-wave enemies are proportionally tougher too.

---

## [5.74.11] - 2026-05-05

### Changed
- **Wave-clear pause auto-scrolls to the POWERUPS list.** When `openWaveClearPowerupsMenu` shows the pause overlay it now smooth-scrolls `#pause-menu` to `#powerups-tab.offsetTop − 12px` on the next animation frame, so the player lands directly on the spend-your-pick UI instead of the tab strip + CONTROLS panel above it. Manual pause (ESC) still opens at the top so the tab strip is visible.

---

## [5.74.10] - 2026-05-05

### Changed
- **Money drop rate clamped at 0.95.** Previously the post–Gold-Find money drop rate could reach 1.0, making every kill at high player level a guaranteed coin spawn. Cap lowered to 0.95 so there's always a small whiff chance — drops feel earned instead of mechanical. Health drops keep their 1.0 cap (already gated by the global health cooldown).

---

## [5.74.9] - 2026-05-05

### Changed
- **Gold Find now scales the money drop RATE, not just the amount.** Previously `getGoldFindMultiplier()` only multiplied the money budget in `dropOrbsFromEntity` (more coins per drop), but the per-kill probability of any drop was unaffected — so leveling up made each drop bigger but didn't make drops more frequent. The Gold Find multiplier (1 + (level − 1) × 0.05) is now also applied to `moneyDropRate` (clamped to 1.0). At level 10 the base 0.65 rate becomes ~0.94; at level 20 it's effectively guaranteed. Health drops are unchanged (Gold Find is a money stat).

---

## [5.74.8] - 2026-05-05

### Added
- **Powerup cards now have a hover effect** in the pause-menu POWERUPS tab. When the card is interactive (player has picks available), hovering lifts it 2px, swaps the background/border to a goldenrod tint with a soft glow, and pulses the inline `+1` chip pink. Owned cards keep their cyan accent on hover; locked cards (no picks) brighten back to full opacity to advertise that they're real, just-unbuyable powerups. Implemented via a new `.powerup-card--interactive` class added in `renderPowerupsOverlay` so cards without picks don't get a misleading "I can buy this" hover state.

---

## [5.74.7] - 2026-05-05

### Changed
- **Orb size now reflects amount, not random.** `MONEY_ORB_SIZE_*` and `HEALTH_ORB_SIZE_*` constants are now interpreted as **pixel radii** (was: multipliers), and the orb's actual radius is a linear map from `amount` (1..cap) to `[SIZE_MIN, SIZE_MAX]`. A 1-coin orb is `MONEY_ORB_SIZE_MIN` px; a 20-coin orb is `MONEY_ORB_SIZE_MAX` px; same for heal orbs. The `(z * 1.2 + 0.4) * scale * 3.2` random parallax baseRadius from `ColorStar.reset` is bypassed for collectibles (it produced a near-2× variance unrelated to amount, which is why bumping the SIZE constants previously had no visible effect on the biggest orbs). Render-path `sizeVariation` is also pinned to 1 on collectibles so SIZE_MIN/MAX are the sole controls. Defaults: heal orbs 6→18 px, money orbs 6→22 px.

---

## [5.74.6] - 2026-05-05

### Changed
- **Auto Fire only fires when something is in range AND roughly on-aim.** Previously the assist held `input.fire = true` every tick, so the ship spammed bullets into empty space and (worse) interrupted nothing — but visually it never stopped. Now it gates each tick on `findNearestTarget(player.x, player.y, range)` where `range = primary.range × 400 × LONG_RANGE multiplier`, plus a ±25° aim cone (`dot ≥ cos(25°)`) so the target also has to be in front of the ship. Power-weapon auto-release inherits the same gate — charge-based weapons keep charging passively, but the release only triggers when `canHit && isFullyCharged`; cooldown-based ones fire when `canHit && isPowerReady()`.

---

## [5.74.5] - 2026-05-05

### Changed
- **POWERUPS pause-tab — entire card is now a click-to-buy hit target.** Previously only the small `+1` chip on the right end spent a Pick; clicking anywhere else on the row did nothing, which caused players to think purchases were broken when they tapped the card body. The card itself now carries the same purchase click handler (with `stopPropagation` + `preventDefault`) so clicking any part of the row spends one Pick and stacks the powerup. The `+1` chip still works for players who target it directly.

### Fixed
- **Auto Aim / Aim Assist no longer track regular enemy bullets.** `GameEngine.findNearestTarget` was walking every active enemy bullet, so the reticle would snap onto incoming projectiles the player can't actually destroy — yanking the aim around as bullets streamed past. Now restricted to enemies, asteroids, and `shape === 'mine'` / `'homing_mine'` enemy bullets (the destructible Tangerine bombs).

---

## [5.74.4] - 2026-05-05

### Fixed
- **Powerup picks were silently failing during the wave-clear pause.** The pause-overlay's `dismissOnBackdrop` listener used `e.target.closest('#pause-menu')` to decide whether a click was inside the menu. The POWERUPS tab `+1` buy button calls `purchasePowerup` → `renderPowerupsOverlay` → `replaceChildren()` synchronously inside its click handler, which detaches the original `<button>` before the click event finishes bubbling. `closest()` on a detached node walks a null parent chain and returns `null`, so the overlay treated the click as "outside the menu" and ran `togglePause` — which during a wave-clear pause routes through `_pausedFromWaveClear` straight into `startNextWave()`, closing the menu without applying the pick. (`stopPropagation()` on the buy button didn't always cover this path because the same bug exists for any in-menu control whose handler replaces its DOM ancestor.) Switched the dismiss check to a direct identity test (`e.target === e.currentTarget`) so only literal clicks on the overlay backdrop dismiss it.

### Changed
- **Assists tab — checkboxes vertically centered with their row text.** `.assist-row` is now `align-items: center` with `align-self: center` on the input, replacing the prior `flex-start` + 2px top margin that left the box visually drifting above the title.

---

## [5.74.3] - 2026-05-05

### Changed
- **Gold is pickup-only.** Removed the silent `game.money += reward.points` increments that fired on every enemy kill (bullet-kill path, weapon-effect kill path, player-collision kill path), the per-asteroid collision-kill `+10`, the kill-streak coin milestone bonus (3/5/8/12/20 kills × 10), and the explosive-bullet AoE kill bonus. Killing an enemy now spawns its money-orb drops only — the player must fly over to grab them. Stops the "phantom +N" gold popups that fired several times per kill from these stacked award sites. XP gain on kill, score, and stats counters are unchanged. Wave-clear bonus, shop refund, run-complete bonus, the Tractor Shield deflect-for-coins skill payoff, and the cheat code are preserved as deliberate non-pickup income paths.

---

## [5.74.2] - 2026-05-05

### Changed
- **Wave clear no longer auto-opens the shop.** The pause menu opens to the POWERUPS tab instead so the player can spend the +1 pick they just earned without being forced into the gold/SP economy. Pressing Resume (or ESC, or backdrop click) bridges through `togglePause` → `startNextWave` so the wave-gating behavior the shop used to provide is preserved. The pause menu's SHOP button still works during this window for players who want to visit the shop.
- **Money-orb base drop rate bumped 0.45 → 0.65.** Closer to the user-targeted ~0.65 baseline before powerup stacks, Gold Find, and hit-streak multipliers.

---

## [5.74.1] - 2026-05-05

### Fixed
- **Enemies no longer "stand around" when the player drifts away.** `ai.updateTargetPriority` was switching `currentTarget` to `'patrol'` whenever the player left the enemy's territory or crossed `loseInterestDistance`, which routed the AI through `patrolTerritory()` — a slow meander to a random point inside the enemy's own territory. Removed the territorial-patrol branch entirely; every enemy now permanently locks `currentTarget = 'player'` and runs its native movePattern (chase / arc / weaver-spinup / etc.) toward the player.

---

## [5.74.0] - 2026-05-05

### Added
- **Arrow-key aim & fire bindings.** Movement is now WASD-only; the arrow keys drive aim and fire. `←`/`→` rotate the ship's aim at a constant rate (~210°/s); `↑` mirrors L-click (primary fire); `↓` mirrors Space / R-click (charge / fire power weapon). Mouse aim still works — the ship resumes mouse aim the moment arrow keys are released.
- **Assists pause-menu tab.** New tab between POWERUPS and TIMER with three accessibility toggles, each persisted to `localStorage` (`rainboidsAssists`):
  - **Aim Assist** — when the cursor passes within 90 world-px of an enemy / asteroid / enemy bullet, the reticle snaps onto the target.
  - **Auto Aim** — overrides mouse and arrow aim every tick to track the nearest threat (enemies, asteroids, enemy bullets / mines).
  - **Auto Fire** — auto-presses primary every tick. For charge-based power weapons, holds `fireSecondary` true at full charge to release peak shots; for cooldown-based ones, fires the moment `isPowerReady()` returns true.
- **`GameEngine.findNearestTarget(x, y, maxDist)`** helper — walks `enemyPool`, `asteroidPool`, `enemyBulletPool` and returns the nearest active object's position. Used by both Aim Assist (snap radius) and Auto Aim (unbounded).

### Changed
- **CONTROLS pause-tab** now lists arrow-key aim/fire alongside mouse/click bindings. WASD shown as the sole movement binding.
- **Pause-tab grid** moved from 4 columns to 3 columns to accommodate the 9 tabs cleanly (3×3).

---

## [5.73.0] - 2026-05-05

### Added
- **Gold Find player stat.** New `Player.getGoldFindMultiplier()` returning `1 + (level - 1) × 0.05`. Applied as a multiplier on the money-orb budget in `dropOrbsFromEntity` — both the gold AMOUNT per drop and the SYMBOL COUNT (post-split) scale with player level. Level 5 = 1.20×, level 10 = 1.45×, level 20 = 1.95×.
- **"+5% Gold Find" advertised on every level-up** alongside the existing +1 SP / +1 Pick / temp bonuses. Level-up subtitle now reads `+1 Skill Point  +1 Powerup Pick  +5% Gold Find` so the player sees the stat tick up.
- **Player-anchored gold popup**. The gold "+N" arc now spawns at TWO points per gain — at the bottom-right gold counter AND directly over the player's ship — so the feedback reads from both the action zone and the corner readout.
- **Homing bullets target enemy mines (Tangerine bombs).** `applyHoming` now also walks `enemyBulletPool` filtered to `shape === 'mine'` after enemies/asteroids are exhausted. Mines have HP and can be destroyed; this lets players "shoot the bombs."

### Changed
- **POWERUPS tab moved from shop to pause menu.** Shop is now strictly the gold + SP economy (HELP / PRIMARY / POWER / DEFENSE). The pause menu's POWERUPS tab gained a per-card "+1" buy button + a top banner showing the unspent Pick count. Buys decrement `player.powerupPicks` and call `addPowerup`. CSS picks-banner styling added.
- **Money-orb base drop rate bumped 0.20 → 0.45.** Gold drops are roughly 2.25× more frequent baseline, before powerup stacks / Gold Find / hit-streak multipliers.
- **Gold popup arc trajectory.** Was straight-up float + decel. Now spawns with a horizontal velocity component and a gravity term (`vx: ±2.4, vy: -3.6, gravity: 0.18`) so the popup describes a parabolic arc instead of a vertical line. Each popup also scale-pulses (1 → 1.25) at spawn for poppy emphasis.
- **Gold counter flash on every gain.** 280 ms bell-curve flash where the text scale-pulses (×1.18) and tints from gold to white-hot, with a soft glow that decays through the window. Visible without being subtle.
- **Old `drawMoneyPickupDisplay()` disabled.** Was rendering a stray "+N" at the obsolete top-left coin position (rogue popup the user spotted). Removed from the draw loop; the new `goldPopups` system replaces it.
- **HP scaling much steeper from wave 5.** Both enemy and asteroid HP curves linearised (exponent 1.6/1.5 → 1.0) with higher ceilings (4.5/4.0 → 6.5). Wave-5 enemies now ~2.4× HP (was 1.37×); wave-5 asteroids ~3.9× (was 1.94×); wave-20 enemies ~7.5× (was 5.5×).

---

## [5.72.2] - 2026-05-05

### Fixed
- **Wave-clear bonus never fired in actual gameplay.** The XP / coins / +1 powerup pick / "WAVE N CLEARED" notification all lived in `wave-manager.completeWave()`, which has been dead code in the live loop since the shop-gated wave system was introduced — only tests and the dev console call it. Players never got the +1 pick they were promised, and the bonus message never showed. Inlined the bonus directly into `updateWaveSystem()` so every wave clear in real gameplay grants `+20+(wave×10) XP`, `+50+(wave×25) coins`, and `+1 powerup pick`.

### Added
- **Animated gold readout.** The bottom-right gold counter now:
  - Spawns a "+N" popup near the readout on every gain (mirrors the damage-number popup style — gold colour, 16px bold, floats up + fades over ~1.1 s, slight x-jitter so back-to-back popups don't perfectly stack).
  - Rolls toward the real value like a casino slot reel — 18% lerp per frame with a min step of 2 so small trickles finish quickly, large bonuses (wave clear) roll visibly. While rolling, the counter gets a subtle gold glow.

### Changed
- **WAVE COMPLETE banner gets a clean window before the shop.** Bumped the auto-shop delay from 2000 ms → 2700 ms so the banner has ~700 ms of clear screen after its fade-out finishes, before the shop overlay covers the canvas.

---

## [5.72.1] - 2026-05-05

### Fixed
- **Healthbar lost its color gradient.** When the bar moved bottom-anchored in 5.72.0, the cached `LinearGradient` (created with hardcoded coordinates `60, 20, 60, 50` for the old top-left position) was rendered above the bar's new screen position — bar appeared flat / unfilled. Cache key now includes `barY` so the gradient is regenerated when the bar moves. Bar reads correctly again at any anchor.
- **Loadout squares overlapped the healthbar.** The 14 px gap between loadout-square bottom and bar top was too tight; rounded corners crashed into the bar's top edge. Bumped to 32 px (now moot — see HUD reshuffle below — but the constant is correct for any future layout that puts loadout above the bar).

### Changed
- **Shop always lands on POWERUPS tab.** Was: `POWERUPS` if any unspent picks, `HELP` otherwise. The HELP fallback never matched the player's intent — they're opening the shop to spend, not to read instructions. POWERUPS is the canonical entry tab now.
- **TIMER tab moved from shop to pause menu.** Builds the same speedrun-tier reference card (label / finish-under / multiplier columns + live elapsed-time readout). The shop is now build-mode only; the timer reference is meta information that fits the pause menu better.
- **HUD reshuffle (final, post-iteration):**
  - Minimap: **commented out** (per user request — was top-left after 5.72.0 toggling, now disabled entirely).
  - Healthbar / triforce / LV shield / level number / heart+HP text → **back to top-left** (5.72.0 moved them BL; this restores the original top-left layout).
  - Weapon + skill loadout squares (PRM / PWR / SKL) → **stay in bottom-left**, anchored independently to canvas bottom (no longer relative to the bar).
  - Pause + shop buttons → **bottom-middle** along the bottom edge (was bottom-right above timer). Centered around screen midline with a 12 px gap.
  - Killstreak indicator → still bottom-center, but raised to clear the pause+shop buttons (`y = canvas.height - 180`).
  - Gold above timer in BR + powerup-icon vertical column on right edge — unchanged.

---

## [5.72.0] - 2026-05-05

### Fixed
- **Powerups capped at 1 stack** — every powerup in the new POWERUPS shop tab refused a second purchase. POWERUP_TYPES doesn't define `maxStacks` per entry, and `_buildPowerupsTabItems` was defaulting to 1. Bumped the default to 99 (effectively unlimited within a run); per-powerup tuning can land later if specific powerups need real caps.
- **Enemies warped across the screen at high waves.** Compound speed was 4.34× base at wave 20 (campaign mul 2.55 × level mul 1.70). Reduced both ceilings: campaign mul cap 2.55 → 1.75, per-level speed mul cap 1.70 → 1.40. New worst-case wave-20 speed: ~2.45× base.
- **GAME COMPLETE title was oversized**, dwarfing the stats below it. Cut roughly 40% (110→64 cap, 64→40 floor, screen-width divisor 14→22).

### Changed
- **Level-up no longer auto-opens the shop.** The 5.71.0 auto-open was disruptive — every level threshold during a fight pre-empted gameplay. Picks accumulate silently; the shop opens only at wave-end now.
- **XP curve drastically slowed.** Base `experienceToNextLevel` 100 → 400, exponent 1.5 → 1.7, per-kill XP `points/3` → `points/6`. Combined effect: leveling drops from ~1/wave to ~1 every 2-3 waves.
- **Shop landing tab simplified.** Removed the 5.70.0 random-tab fallback (PRIMARY / POWER / DEFENSE). Now: POWERUPS if the player has unspent picks, HELP otherwise.
- **HUD reshuffle (again — final layout):**
  - Minimap → **top-left** (was bottom-left in 5.71.0).
  - Healthbar / lives stack → **bottom-left**. Triforce sits LEFT of the bar; LV shield + level number sits to the RIGHT of the bar on the same row (was below it); heart icon + HP text below.
  - Loadout squares (PRM / PWR / SKL) → directly **above** the healthbar (was below the coins display).
  - Gold readout → **bottom-right above timer** (was below healthbar). New `drawBottomRightGold(ctx)` in `hud/status.js`.
  - Powerup-stack icons → **right edge, vertical column** (was top-right horizontal). When a column fills, the next icon wraps to a new column to the LEFT. Top reserve = 20 px, bottom reserve = 110 px so the column never overlaps gold + timer.
  - Killstreak indicator → **bottom-center** (was top-right). Centered alignment, sits above the timer/gold lane.
  - LEVEL X! announce → **upper third** of screen (was near bottom). Avoids overlap with the bottom-center killstreak.

---

## [5.71.0] - 2026-05-05

### Fixed
- **Game froze on shop close from mid-wave.** Pressing Escape (or the X button) on a shop opened during PLAYING hid the shop overlay but left `game.state === 'SHOP'`. The state machine's transition table was missing `SHOP → PLAYING` — `closeShopToPlaying()` was calling `this.game.state = PLAYING`, the validator silently rejected the transition with `[GameState] Invalid transition: SHOP → PLAYING`, and the game loop (gated on PLAYING/WAVE_TRANSITION) stopped updating entities. Added `PLAYING` to the SHOP row in `TRANSITION_TABLE` (game-state.js).

### Added
- **Shop auto-opens on level-up** — `progression.levelUp()` now schedules `openShop()` ~700 ms after the level-up animation, mirroring the wave-end auto-shop. Skips if state is no longer PLAYING / WAVE_TRANSITION (e.g. player died mid-animation). The auto-open uses the existing "land on POWERUPS if any unspent picks" logic, so the player goes straight to the build choice.
- **TIMER shop tab.** New info-only tab showing a live elapsed-time readout and the speedrun multiplier reference card. Tier table:
  ```
  GODLIKE      <  5:00     5.0×
  LEGENDARY    <  7:30     4.0×
  UNSTOPPABLE  < 10:00     3.0×
  EMPOWERED    < 12:30     2.5×
  STEADY       < 15:00     2.0×
  CASUAL       < 20:00     1.5×
  FINISHED     ≥ 20:00     1.0×
  ```
  Constants live in `core/constants.js` (`SPEEDRUN_TIERS`, `speedrunTierFor()`) so the Game Complete screen can apply them later. The current row highlights based on the live elapsed time, so the player can see what tier they're chasing in-shop.
- **Big `+` sigil for the PICKS currency.** Replaces the ⚡ icon — bigger, bolder, pink (#ff66cc) with a soft glow. Reads as "free pick" rather than as a numeric cost. Applies to both the shop header counter and the per-row price display.

### Changed
- **HUD layout reshuffled.** Cleaner left/right edge use:
  - Powerup-stack icons → **top-right** (was bottom-left). Stack right-to-left so the rightmost slot is the first powerup; new ones push leftward.
  - Run timer → **bottom-right** (was bottom-left). Right-aligned now: text hugs the right margin, stopwatch icon sits to its left.
  - Minimap → **bottom-left** (was bottom-right). Spawn-avoidance region in `wave-manager.js` updated to match.
  - HUD shop + pause buttons → **bottom-right**, above the timer (was top-right). Bottom offset 70 px clears the timer row.
- **Green health orbs are now mechanically identical to powerups.** They drift gently toward the player with the powerup-style soft magnet (k = 0.55× — same three-tier shape as money orbs but scaled), tick down their `life` counter, and fade out via the existing 120-frame opacity ramp before pool release. Money orbs keep the full-strength magnetic pull (k = 1.0) so coins still snap to the player. Tractor beam pulls both.

---

## [5.70.0] - 2026-05-05

### Changed
- **Powerup acquisition reworked end-to-end.** Powerups no longer drop from enemy or asteroid kills. Instead, the player earns **Powerup Picks** — a new currency — and spends them in the shop's new **POWERUPS** tab on whichever powerup they want. This gives every run a deliberate, custom build path:
  - **+1 Pick per wave clear** (alongside the existing XP + coins bonus).
  - **+1 Pick per player level-up** (asteroid kills now meaningfully shape the build because XP feeds directly into more picks).
  - Picks accumulate; skipping a shop visit doesn't waste them.
  - All 20 powerup types are purchasable. Each costs 1 Pick. Per-powerup `maxStacks` limits still apply.
  - Picks-currency items are non-refundable (no SELL button) — keeps the build choice meaningful and prevents churn-farming the same stack.
- **Shop auto-opens on the POWERUPS tab when the player has unspent Picks.** Otherwise it falls back to the old random-tab landing (PRIMARY / POWER / DEFENSE) so the open still feels fresh.
- **Money orbs keep their magnetic three-tier pull. Health (green) orbs no longer auto-home** — they drift with their burst velocity + ORB_FRIC drag, and the player has to fly close to collect them. Makes the asteroids-vs-enemies trade-off more deliberate (you commit to flying over there for the heal).

### Added
- **`Player.powerupPicks` field** + grant logic in `wave-manager.js completeWave()` and `progression.js levelUp()`.
- **`POWERUPS` shop category** (`shop-manager._buildPowerupsTabItems`) listing every entry in `POWERUP_TYPES` with currency `'PICKS'`.
- **`PICKS` currency support in `buyShopItem`** — affordability check, decrement, and the existing `addPowerup()` hook handles the rest of the player-state side.
- **Shop UI:** new `<button class="shop-tab" data-tab="POWERUPS">` in `index.html`, new `shop-currency--picks` counter in the header, new `shop-item-price--picks` style for the per-row cost. CSS picks accent: `#ff66cc`.
- **HELP-tab content updated** to introduce Picks alongside Gold / SP / XP, and to clarify the new "asteroid kills feed into XP feeds into Picks" loop.

### Removed
- All `dropPowerup()` calls from kill paths in `collision-system.js` (small + large asteroid splits, enemy bullet-kill, `destroyAsteroid()`, `damageEnemy()` death path). The function itself remains because the `P` debug cheat still uses it to spawn a test pickup.
- `COLLISION_CONFIG.POWERUP_DROP_CHANCE` constants are now unreferenced from kill paths (kept in `constants.js` for now in case the cheat or a future event-drop re-adopts them).

---

## [5.69.4] - 2026-05-05

### Changed
- **Enemy destruction sounds redesigned around a multi-band spectrum.** Earlier passes oscillated between two extremes — 5.69.2 was 87-98% sub-bass (massive thump on a woofer, inaudible on laptops); 5.69.3 was 1-6% sub-bass (audible everywhere but lacking weight on real subwoofers). 5.69.4 uses 3-layer designs that span both bands so the sounds work on either:
  - **L1 sub-bass** — sine ~80-180 Hz (`p_base_freq: 0.07-0.18`), no HPF, hard `p_env_punch: 0.7-0.9`. Provides chest-thump on woofers and good headphones; transparent on small speakers (they pass through silently).
  - **L2 mid body** — square ~420-550 Hz (`p_base_freq: 0.42-0.55`) with gentle `p_freq_ramp: -0.16 to -0.22` keeping the descent above 250 Hz. The "main" audible body across every speaker.
  - **L3 mid noise rumble** — broadband noise with `p_hpf_freq: 0.18-0.24` cutting its own sub overlap with L1 while keeping 400 Hz – 3 kHz texture for crackle/fireball feel.
- Per-user request, intentionally minimised bright high content (no HPF chirp tail). Energy concentrates in sub + low-mid + mid bands, reading as "weighty boom" rather than "sharp pop." Each variant retains its character signature (vibrato for WEAVER, phaser for STALKER, repeat-stutter shrapnel for PROWLER, freq_dramp for TANGERINE, etc.).
- **Post-fix spectral distribution** (sliding-window FFT over full clip):
  ```
  band         5.69.2     5.69.3     5.69.4
  sub-bass     87-98%     1.5-6%     14-60%   ← woofer thump restored
  bass         1-5%       0.4-17%    0.3-1.2%
  low-mid      0.2-7%     19-50%     17-34%   ← strong audible
  mid          0.1-1%     14-48%     9-20%    ← strong audible
  hmid+high    0-0.7%     19-47%     5-25%    ← dialled back per user req
  ```

### Added
- **`tools/scripts/sound/`** — diagnostic scripts for the SFXR audio pipeline. Four tools, all preserved from the 5.68.10 / 5.69.x debugging sessions:
  - `check-wavs.mjs` — peak / RMS / nonzero-sample audit per WAV (catches silent files).
  - `spectrum.mjs` — per-WAV sliding-window FFT lumped into 6 frequency bands (catches band-mismatch issues like the 5.69.2 sub-bass concentration bug).
  - `probe-event-dispatch.spec.js` — Playwright probe verifying `audio:enemy-destroy` → `playSound('enemyDestroy_<TYPE>')` end-to-end.
  - `probe-playsound-internals.spec.js` — Playwright probe instrumenting every step inside `playSound` (manifest hit, throttle, buffer lookup, `src.start()`, `src.onended`).
  - Includes a README documenting usage and the bug history each script was written to investigate.

### Internal
- 5.69.3 destruction WAVs preserved as `sfx/enemyDestroy*.wav.bak` for A/B reference.

---

## [5.69.3] - 2026-05-05

### Fixed
- **Enemy destruction sounds were inaudible because their energy lived below 150 Hz.** A spectrogram audit revealed that 5.69.2's destruction WAVs concentrated **87–98% of their acoustic energy in sub-bass (<150 Hz)** — a band most laptop and phone speakers physically cannot reproduce. Even though peak amplitudes were correct (-0.4 dB), the speakers were filtering all the content out. A runtime probe of `playSound()` confirmed every destruction was being queued correctly through the BufferSource → GainNode → AudioContext.destination chain (`onended` callbacks fired for each), and `audioContext.state` was `running` — the audio was playing, the user just couldn't hear it. The problem wasn't the dispatch; it was that I had designed the sounds for full-range studio monitors instead of integrated laptop / phone speakers.
- **Energy redistributed into the audible 400 Hz–3 kHz band.** Body layers moved from `p_base_freq: 0.08-0.22` (≈80-220 Hz) up to `0.42-0.6` (≈420-600 Hz). Frequency ramps gentled from `-0.30 to -0.42` to `-0.16 to -0.22` so the descent stays above 250 Hz instead of dropping into the inaudible sub. Mid noise layers got higher HPF cutoffs (`p_hpf_freq: 0.22-0.28`) to drop their own sub-bass content. Tail layers raised to `0.65-0.72` base freq (~750 Hz) with HPF 0.28-0.36 so they sit firmly in the high-mid where every speaker reads them.
- **Post-fix spectral distribution** (sliding-window FFT over full clip):
  ```
  band            5.69.2     5.69.3
  sub-bass        87-98%     1.5-6%      ← speakers can render now
  bass            1-5%       0.4-17%
  low-mid         0.2-7%     19-50%      ← strong audible content
  mid             0.1-1%     14-48%      ← strong audible content
  high-mid        0-0.5%     13-25%
  high            0-0.2%     6-22%
  ```
- **Caught a smaller bug**: `collision-system.js` had two `audio:enemy-destroy` emit sites, only one was passing `enemy.type` (line 523). The second (in `damageEnemy`, line 1455) was emitting with no payload, falling back to the generic `enemyDestroy` clip even for typed enemies. Both sites now pass `enemy.type`.

### Internal
- Diagnosed via two probes (intercepted `events.emit` + instrumented `playSound`) and a sliding-window FFT spectrum audit per WAV. Probes lived in `tests/qa/99-*` during diagnosis and have been removed; spectrum script is one-shot and not committed.

---

## [5.69.2] - 2026-05-04

### Fixed
- **Enemy destruction sounds were inaudible despite firing correctly.** A runtime probe (intercepting `events.emit` and `audioManager.playSound`) confirmed `audio:enemy-destroy` fires with `enemy.type` and `playSound('enemyDestroy_<TYPE>')` is called for every kill — the dispatch chain was correct end-to-end. The actual problem was **perceptual masking**: the 5.69.1 destruction sounds were too brief (HUNTER 79 ms, WASP 88 ms) and spectrally too similar to the `hit` tick that fires on the same frame, so the ear merged them into a single percussive event. **Fix:** rewrote all 11 destruction defs around four explicit perceptibility principles —
  - **Sub-bass anchor** — every body layer now sits at `p_base_freq: 0.08-0.22` so the destruction is spectrally distinct from the high-frequency hit it overlaps with.
  - **Long tails** — minimum ~320 ms even for HUNTER and WASP (was 79 ms / 88 ms). Below that threshold the sound is masked by surrounding gunfire.
  - **Hard envelope punch** — `p_env_punch: 0.65–0.85` on every body layer. Punch boosts the attack peak ~2× for ~10 ms, the critical "BOOM" character.
  - **Rumble stutter** — `p_repeat_speed: 0.32–0.55` on the body of every variant. Even a small stutter makes the sound read as "explosive" rather than "single tonal pop."
- New durations: HUNTER 327 ms, WASP 320 ms, DRIFTER 454 ms, WEAVER 474 ms, TANGERINE 533 ms, STALKER 625 ms, generic `enemyDestroy` 759 ms, SENTINEL 795 ms, PROWLER 907 ms, GUARDIAN 1241 ms, TITAN 1557 ms — all peak-normalized to −0.4 dB with 99-100% nonzero samples.

---

## [5.69.1] - 2026-05-04

### Added
- **Per-enemy destruction sounds.** Each of the 10 enemy types now has its own SFXR-rendered destruction clip — `enemyDestroy_HUNTER` through `enemyDestroy_TITAN` — tuned to the ship's mass and fighting character. Length scales from ~80 ms (HUNTER, WASP) up to ~1 s (TITAN). Per-enemy variants:
  - **HUNTER** — sharp pop with brief HPF chirp tail (light/agile).
  - **GUARDIAN** — deep slow boom, longest decay (~760 ms), rolling square arp tail (heavy/armored).
  - **WASP** — tinny stutter pop with `p_repeat_speed` chitter (small/electric).
  - **STALKER** — phaser-modulated body with vibrato HPF tail (charged-laser energy).
  - **DRIFTER** — heavy stuttered noise + arp square zap (arc-lightning crackle).
  - **PROWLER** — massive sub thump + stuttered "shrapnel" square (missile-launcher).
  - **WEAVER** — vibrato sine collapse, most tonal in the set (spiral-laser whorl).
  - **SENTINEL** — square-dominant with `p_duty_ramp` for "machinery winding down" feel.
  - **TANGERINE** — rising-then-falling HPF chirp with `p_freq_dramp` (energy core overload).
  - **TITAN** — cataclysmic ~1 s multi-stage with `p_repeat_speed` rolling thunder, longest in the library (boss-tier).

### Changed
- **Generic `enemyDestroy` rebuilt from scratch around a 3-phase classical explosion architecture**: phase-1 HPF transient (5-15 ms crack), phase-2 sub-bass body with vibrato + hard envelope punch (BWOOOM), phase-3 descending noise rumble (fireball), phase-4 square arp tail with `p_arp_mod` negative (debris fall-off). Now also serves as the registered fallback when a new enemy type is added without a per-enemy clip.
- **`audio:enemy-destroy` event now carries `enemy.type`** as its payload. The dispatch in `game-engine.js` tries `enemyDestroy_<TYPE>` first and falls back to `enemyDestroy` via `audioManager.playSound()`'s boolean return — graceful degrade for unknown types.
- **Per-enemy throttle windows** added to `audio-manager.js`: 40 ms (HUNTER, WASP) → 200 ms (TITAN). Heavy ships need wider gaps to avoid thunder-on-thunder when chain-killed; light ships keep the tight default so kill-streaks still pop crisply.

---

## [5.69.0] - 2026-05-04

### Added
- **11 new jsfxr sound definitions in `sound-defs.js`** filling every gap that previously routed to a Kenney mp3:
  - **Destruction** — `asteroidDestroy` (3-layer noise rumble + low square thump + HPF debris crackle), `enemyDestroy` (3-layer sub-bass thump + descending square pop + ascending HPF zap chirp).
  - **Defense skill activations** — `bulwark` (sub thump + sustained square hum), `repairNanites` (ascending sine arp + HPF shimmer), `phaseDash` (noise sweep + rising sine glide), `deflectorOrbs` (sine bell + HPF shimmer), `empPulse` (3-layer noise burst + descending square + rising HPF chirp), `tractorShield` (vibrato beam + slow square harmonic).
  - **Per-weapon hit** — `playerHit_LIGHTNING_ARC` (3-layer noise crackle + arp square + HPF chirp).
  - **Generic enemy-bullet-hit fallback** — `enemyHit` (light kinetic tick) for patterns without a dedicated `enemyHit_*` clip.
- **`menuClick` UI tick** — short HPF square blip pre-rendered as `sfx/menuClick.wav`. A new delegated capture-phase click listener in `UIManager.setupEventListeners()` plays it on every button-shaped element across the document (button, a, [role="button"], plus the project's tab/card/shop classes), with explicit opt-out via `data-no-click-sound` and an automatic skip for canvas clicks (gameplay input). Throttled to 50 ms so multi-click streaks don't buzz.

### Changed
- **All SFX are now SFXR-generated; every Kenney mp3 has been removed from `sfx/`.** The `audio-manager.js` MANIFEST is rewritten to reference only `.wav` files generated from `sound-defs.js`. 62 Kenney mp3s, the `Digital_SFX_Set.zip` source archive, and the Kenney `readme.txt` were deleted from `sfx/`. The `sfx/` directory now contains 37 WAVs + `manifest.json` only.
- **`asteroidDestroy` / `enemyDestroy` shape simplified.** Previously these were layered-bucket entries that picked one of several pre-mixed Kenney layer combinations per play. Now each is a single jsfxr WAV that's already 3-layer mixed offline — same per-call layered feel, less runtime work.
- **`UIManager.setupEventListeners()` is now invoked from `setAudioManager()`.** Was previously a placeholder that nothing called.

### Removed
- **`playerHitBullet` MANIFEST entry and throttle** — the name was never fired by any code path; the only paths reach `enemyHit_<pattern>` (specific) or `enemyHit` (generic fallback).
- **Kenney's Digital SFX assets** — 62 mp3 files, the Digital_SFX_Set.zip archive, and `sfx/readme.txt` (license attribution for the now-removed pack).

---

## [5.68.10] - 2026-05-04

### Fixed
- **All 26 jsfxr-generated WAVs were SILENT.** The 5.68.7 generator was passing partial params objects (only the fields each `sound-defs.js` entry chose to override) directly into `new SoundEffect(params)`. jsfxr's `Params` class defaults `p_lpf_freq` to `1` (low-pass wide open); when undefined, the engine treats it as `0` and runs every sample through a 0 Hz LPF — output is zero. Same trap affects every `p_*` field with a non-zero default. Files were the right length and format on disk (so `decodeAudioData` succeeded silently), but every single sample was 0. Confirmed via byte-level WAV audit: peak=0 and nonzero=0 across all 26 files. **Fix:** `tools/scripts/generate-sfx.js` now merges each layer's params onto a fresh `new Params()` so all 27 fields inherit jsfxr's documented defaults; partial fields override only what the def specifies. After regen, every WAV peaks between −9.4 dB and −0.4 dB with 99–100% nonzero samples — audible signal restored.

### Internal
- Verified by reading raw 16-bit PCM samples post-regeneration and tabulating peak / RMS / nonzero ratio per file. Audit script lives only in `/tmp/`; the production generator emits the same files via `npm run generate-sfx`.

---

## [5.68.9] - 2026-05-04

### Fixed
- **Defense skills were silent on activation.** `activateSkill()` in `skills.js` set the cooldown and effect-timer but never asked the audio manager for a clip — so BULWARK / REPAIR_NANITES / PHASE_DASH / DEFLECTOR_ORBS / EMP_PULSE / TRACTOR_SHIELD all played zero sound when the player triggered them. A `SKILL_ACTIVATE_SOUND` map now routes each skill id → its corresponding manifest entry (`bulwark`, `repairNanites`, `phaseDash`, `deflectorOrbs`, `empPulse`, `tractorShield`), with a `shield` fallback if a specific clip isn't registered.

### Changed
- **Default SFX volume bumped 0.5 → 0.8** (`AudioManager.sfxMasterVol`). Freshly-installed builds were quiet enough that several layered jsfxr clips read as inaudible against the music; the slider still tops out at 1.0, so headroom is unchanged.
- **Throttles loosened on high-rate events.** Per-name min-interval-ms tightened so back-to-back sounds aren't dropped into silence: `shoot` 40 → 30, `hit` 60 → 40, `enemyHit` 60 → 40, `explosion` 80 → 60, `playerHitBullet` 80 → 60. Per-weapon and per-pattern variants continue to use the 30 ms default.

---

## [5.68.8] - 2026-05-04

### Fixed
- **SFX slider was still showing/applying the old 0–20% cap.** `updateSfxVolumeDisplay()` in `ui-manager.js` was multiplying the slider value by `0.2` for display (leftover from when `maxSfxVolume = 0.2`). The audio-manager's actual cap was lifted to 1.0 in 5.68.6, but the UI was still telling users their max was 20%. Now: slider 0–100% maps directly to the displayed percentage AND to the gain 0..1.

---

## [5.68.7] - 2026-05-04

### Added
- **jsfxr SFX pipeline restored.** The original layered-sfxr offline generator is back:
  - `js/modules/audio/sound-defs.js` — 22 named sounds, each defined as 2-3 stacked sfxr voices (low body + mid impact + high sparkle / sweep, etc.). Single source of truth for the SFX library.
  - `tools/scripts/generate-sfx.js` — Node script that renders every entry in `SOUND_DEFS` to `/sfx/<name>.wav`, peak-normalized to -0.45 dB, mono 16-bit PCM at 44.1 kHz. Layered defs are sum-mixed before normalization. Writes a `manifest.json` alongside the WAVs.
  - **Run with**: `npm run generate-sfx` (script already wired in package.json).
- **26 jsfxr WAVs generated** (~904 KB total) covering: shoot, hit, coin, powerup, healthRegen, shield, tractorBeam, explosion, playerExplosion, playerHitAsteroid, playerHitEnemy, 5 per-weapon `playerHit_*` clips, and 10 per-firing-pattern `enemyHit_*` clips.

### Changed
- **`audio-manager.js` MANIFEST repointed at jsfxr WAVs as the primary set.** Kenney's Digital SFX clips remain for sounds the jsfxr defs don't cover (asteroid/enemy destruction layered pools, defense-skill activations, generic enemy-bullet-hit fallback, Lightning Arc weapon-hit). Result: the gameplay-critical sounds (firing, generic explosions, pickups, hits) are now from the layered jsfxr generator that gives a coherent futuristic synthetic vocabulary; Kenney accents fill the remaining gaps.

### Internal
- The audio-manager's existing layered-bucket playback path (`1/√N` per-layer gain bias) handles Kenney layered pools (asteroidDestroy, enemyDestroy, ram impacts) unchanged. jsfxr WAVs are pre-mixed offline, so they're single-file entries.

---

## [5.68.6] - 2026-05-04

### Changed
- **SFX volume cap removed.** `maxSfxVolume = 0.2 → 1.0`; the slider now maps directly to gain `0..1` instead of being clipped to a fifth of master. Default boots at 50% slider position. Old default was inaudible-quiet for combat with the new layered destruction sounds.
- **Asteroid + enemy destruction get layered sounds.** Manifest entries can now be EITHER a flat string array (pick one random clip) OR a layered-bucket array (pick one bucket, play ALL files in it simultaneously). Per-bucket gain is `1/√N` to keep peaks in check.
  - **`asteroidDestroy`** — rocky shatter pools combining `spaceTrash` crash with descending tones (`lowDown`, `phaserDown1/3`, `zapThreeToneDown`).
  - **`enemyDestroy`** — energy detonation pools layering `spaceTrash` + `zap1/2`/`zapTwoTone`/`zapThreeToneDown` + `lowDown`/`phaserDown1/2` for the "ship blowing apart" signature.
  - **`playerExplosion`** — heaviest layered booms (3-layer `spaceTrash5 + lowDown + phaserDown3`).
  - **`playerHitAsteroid` / `playerHitEnemy`** — collision rams now layered (`lowDown + spaceTrash2`, `lowRandom + zap1`) for proper thud + texture.
- **New events** `audio:asteroid-destroy` and `audio:enemy-destroy` fired from `collision-system.js` at the kill sites (small/large asteroid path, single-bullet kill path, and the unified `destroyAsteroid` / enemy-kill path). Generic `audio:explosion` stays for mines and missile detonations.

---

## [5.68.5] - 2026-05-04

### Added
- **Sound effects wired up.** `audio-manager.js` was a no-op shell since the jsfxr removal; it now loads Kenney's Digital SFX set from `sfx/` and plays an appropriate clip per gameplay event.
  - **Manifest** maps logical sound names → arrays of mp3 file paths. Names with multiple entries pick a random clip per play, so rapid-fire events get pleasant variation instead of buzz-saw repetition.
  - **Throttle** (`SOUND_THROTTLE_MS`) prevents the same sound from stacking on top of itself when events fire faster than the human ear can distinguish (Storm Needles at 130ms cadence, per-frame Lance Beam contact, etc).
  - **Per-weapon enemy-hit sounds**: pulse-cannon laser, storm-needles laser, scatter-gun crash, rail-driver zap, lance-beam zap, lightning-arc two-tone zap. Falls back to a generic hit clip if no per-weapon clip is registered.
  - Mappings (logical name → file): `shoot` → laser1-3, `explosion` → spaceTrash1/3/4, `playerExplosion` → spaceTrash5/lowDown, `coin` → pepSound2, `powerup` → powerUp3/7/10, `healthRegen` → powerUp1/4, `shield` → phaseJump1, `playerHitAsteroid` → lowDown, `playerHitEnemy` → lowRandom, plus skill-specific (phaseDash, bulwark, empPulse, deflectorOrbs, repairNanites, tractorShield, tractorBeam).
- **`playSound()` now returns a boolean** — true if the name exists in MANIFEST, false otherwise. Lets callers do specific→generic fallback (per-weapon hit → generic hit) without leaking knowledge of the manifest into the dispatch.

### Changed
- **SFX volume baseline bumped** `0.1 → 0.25` (default), max `0.2 → 0.5`. Old values were tuned for the silent stub; with real audio loaded the floor needs to be audible.
- **`game-engine.js` audio dispatcher** rewritten for `audio:player-hit-bullet` and `audio:enemy-hit-by-bullet` to use the new `playSound()` boolean fallback path. The old dispatcher checked `audioManager.sounds[name]` which never existed.

---

## [5.68.4] - 2026-05-04

### Changed
- **Q activates the equipped defense skill** (was TAB in 5.64.14–5.68.3). Sits naturally under the left hand on WASD — no pinky stretch. TAB is no longer a game binding (still `preventDefault`'d so an accidental TAB doesn't shift browser focus off the canvas).
- Updated `input-handler.js` (keydown), `event-setup.js` comment, `ui-manager.js` controls tab, `index.html` static controls list, the `wave1-fire-and-skill-v5` tutorial hint, and the README controls section.

---

## [5.68.3] - 2026-05-04

### Changed
- **Cycle keybinds rotated.** Mapping is now:
  - **E** — cycle defense skill (was: cycle primary).
  - **R** — cycle primary weapon (was: cycle power).
  - **F** — cycle power weapon (was: cycle skill).
  - All three keys still HOLD-to-open-radial as before; only the assignment to weapon/skill type changed. Updated in `event-setup.js` (keydown / keyup wiring), `index.html` controls list, the `wave1-cycle-weapons-v5` tutorial hint text, the `input-handler.js` comment block, and the README controls section.

---

## [5.68.2] - 2026-05-04

### Added
- **Hint overlay auto-dims when it overlaps gameplay.** If the player ship or the mouse cursor enters the tooltip's bounding rect (with a 24px buffer), the overlay drops to `opacity: 0.18` so it doesn't obscure action; lifts back to full when both leave. Driven by a new `updateHintDimming(playerScreenX, playerScreenY, playerRadius, mouseScreenX, mouseScreenY)` export from `hint-system.js`, called every frame from the engine update loop.

---

## [5.68.1] - 2026-05-04

### Changed
- **Enemy bullet speed decoupled from enemy movement and bumped at the floor.** New curve `1.15 + ((w-1)/19)^1.4 × 1.9` (waves 1→20: `1.15, 1.37, 1.83, 2.40, 3.05`). Wave 1 bullets are now ~2× faster than before (was `0.55×`); wave 20 bullets ~20% faster (was `2.55×`). Enemy MOVEMENT keeps its gentler `0.55..2.55` ramp so wave 1 still teaches positioning while bullets actually feel threatening.
- **Primary-weapon DPS rebalance.** All primaries now sit at ~3.0 DPS baseline (previously a 2.0–2.5 spread); Pulse Cannon got the biggest buff so the starter weapon doesn't feel anaemic.
  - PULSE_CANNON: damage `0.8 → 1.2` (DPS `2.00 → 3.00`).
  - STORM_NEEDLES: damage `0.30 → 0.40` (DPS `2.31 → 3.08`).
  - SCATTER_GUN: per-pellet damage `0.40 → 0.42` (5-pellet point-blank DPS `2.86 → 3.00`).
  - LANCE_BEAM: per-frame damage `0.034 → 0.05` (DPS `2.04 → 3.00`).
  - LIGHTNING_ARC: per-frame damage `0.034 → 0.05` (DPS `2.04 → 3.00`).
  - RAIL_DRIVER unchanged (`2.50` single / up to `5.00` with both helix bullets hitting).
- **Pause-menu CONTROLS tab rewritten.** The dynamic `updateControlsTab()` in `ui-manager.js` was still using the pre-5.64.14 layout with a "1 – 4 Defense skills" line. Replaced with the current keybind layout (E/R/F on one line; "hold to open radial menu" hint).

---

## [5.68.0] - 2026-05-04

### Merged
- **`webgl-starfield` branch landed** (5.64.16 → 5.64.18). Brings in the WebGL starfield layer and the brightness/dynamism passes. The branch had diverged from master at `dbf6026` (5.64.13) and the `radial-menus` work (5.65.0 → 5.67.1) landed on master in parallel; this merge unifies both feature lines. Resolved minor conflicts in `VERSION` and `CHANGELOG.md`; `game-engine.js` auto-merged cleanly.

---

## [5.67.1] - 2026-05-04

### Changed
- **Missile Salvo missiles spread across distinct targets.** At launch each missile is pre-assigned its own target (nearest-first enemy assignment, asteroid fallback), so a 3-missile salvo never stacks on the closest enemy when two more are right there. Re-acquisition (when a missile's target dies mid-flight) also prefers targets no other live missile is currently locked onto, falling back to duplicates only if every threat is already claimed.

---

## [5.67.0] - 2026-05-04

### Changed
- **Rail Driver fires a double-helix pair.** Each shot is now two bullets that spiral around a shared rail axis with opposite phase, crossing over each other every half period. The pair shares the rail's damage / range / piercing — the lateral oscillation is purely a visual signature, but the bullets cover a wider effective hit corridor as they wind. MULTI_SHOT now adds extra helix pairs (still narrowly fanned).
- **Rail Driver icon** swapped to 🧬 (DNA double helix) to match the new shot pattern.

### Internal
- Generic helix support added to the player `Bullet` entity (`helixActive`, `helixAmplitude`, `helixFreq`, `helixPhase`). The update step applies the *delta* of `sin(life·freq + phase)` perpendicular to `vel` each frame, so the underlying rail position still advances by `vel` exactly — collision math sees the displayed (helical) position. Reset to `false` in `Bullet.reset()` so non-helix shots from a recycled bullet aren't tainted.

---

## [5.66.1] - 2026-05-04

### Changed
- **Radial-menu type label abbreviated.** `PRIMARY WEAPON` → `PRM`, `POWER WEAPON` → `PWR`, `DEFENSE SKILL` → `SKILL`. Frees up the center-hub real-estate so the hovered option name is the dominant text.
- **Rail Driver icon swapped** from ⚡ (which clashed with Lightning Arc, now also a primary) to 🛤️ — railway tracks read as "rail" at a glance.

---

## [5.66.0] - 2026-05-04

### Changed
- **Lightning Arc moved from power weapon to primary weapon.** It now fires from left-click as a continuous lightning tether (same behavior as Lance Beam) and lives in the E radial menu instead of the R radial menu. Power-weapon roster drops to 4 (Charge Shot / Mine Layer / Nova Blast / Missile Salvo); primary roster grows to 6.
- **Lance Beam DPS dropped to match the projectile primaries.** Per-frame nibble damage 0.06 → 0.034 (60Hz × 0.034 ≈ 2.04 DPS), landing in the same bracket as Pulse Cannon (2.0), Storm Needles (2.31), and Rail Driver (2.5). Previously Lance Beam was the runaway DPS leader at 3.6.
- **Lightning Arc DPS now matches Lance Beam** at the same 0.034 per-frame nibble (~2.04 DPS at 60Hz).

### Removed
- The CONDUCTOR / STATIC_FIELD / TESLA_COIL upgrades (chain-pipeline-only) — they were already no-ops after the 5.64.15 continuous-tether rewrite. AMPLIFIER (per-frame damage scaling) survives and moves to PRIMARY_UPGRADES alongside the move.

---

## [5.65.3] - 2026-05-04

### Changed
- **Radial menu slices show only the icon now.** The hovered option's name moved into the center hub and word-wraps onto multiple pixel-font lines if it doesn't fit on one. Slices stay readable at any number of options without competing with per-slice text.

---

## [5.65.2] - 2026-05-04

### Changed
- **Radial menu pixel font swapped to Silkscreen.** Same 14px size and black-outline stroke; the smaller Silkscreen face packs longer weapon names into a slice without truncation while keeping the pixel aesthetic.

---

## [5.65.1] - 2026-05-04

### Changed
- **Radial menu typography.** All radial-menu text (slice names, type label, hover label) now renders in 14px Press Start 2P with a 3px black outline stroke, matching the rest of the in-game pixel-font HUD. Improves legibility on top of the dim backdrop.

---

## [5.65.0] - 2026-05-04

### Added
- **Radial weapon/skill menus.** Holding **E**, **R**, or **F** opens a radial menu in the center of the screen and pauses gameplay. The menu shows every primary weapon (E), power weapon (R), or defense skill (F) as a pie slice with the option's icon and name. Aim with the mouse cursor to highlight a slice, left-click to equip, or release the key to dismiss without changing the equipped item. Replaces the old single-press cycle behavior on the same keys — you now see all options at once instead of stepping through them one at a time.

### Internal
- New module `js/modules/ui/radial-menu.js` owns the menu state, hover hit-testing, draw, and commit/cancel logic. Wired into `game-engine.js` (gates the update loop and renders the overlay), `event-setup.js` (E/R/F keydown opens, keyup cancels, mousedown commits), and `input-handler.js` (suppresses primary fire while a radial is open).

---

## [5.64.18] - 2026-05-04

### Changed
- **Inverse-size brightness rule for WebGL stars** (the "astronomical" rule). Previously every WebGL star ran at full base alpha (`1.0`); the big color-star shapes consequently dominated the field and read as game entities. New rule:
  - **Tiny stars (≤ 2px)**: `alpha = 1.0` — punchy distant pinpoints.
  - **Mid stars (~6px)**: `alpha ≈ 0.85`.
  - **Big stars (~12px)**: `alpha ≈ 0.55`.
  - **Largest shape stars (~20+ px)**: `alpha ≈ 0.30` (clamped floor).
  - Curve: `1.0 - 0.8 × clamp((size - 2) / 28)`, floored at `0.20`.
  - **Mental model**: small bright dots = far away (high apparent surface brightness); big stars = closer with light spread out, atmospheric backdrop.
- **Color-star shape size bump tightened** `2.2× → 1.5×`. The largest shape silhouettes were dominating the field. Combined with the alpha-damp rule above they now feel atmospheric instead of game-relevant.
- **Pre-blend brightness gain in fragment shaders.** Using `clamp(tex.rgb × color.rgb × GAIN, 0, 1)` before output saturates hot pixels (white core pegs to 1.0) while letting dim halo pixels read proportionally brighter — emulates a screen-blend over-exposure feel with the existing additive blend mode (no need for an HDR float framebuffer).
  - Starfield: `BRIGHTNESS_GAIN = 1.6`.
  - Particles: `BRIGHTNESS_GAIN = 1.3`.

---

## [5.64.17] - 2026-05-04

### Changed
- **WebGL stars are brighter and more dynamic.**
  - Atlas dot widened (Gaussian coefficient `22 → 12`) and given a stronger halo (`0.5 × (1-r)^2.6 → 0.7 × (1-r)^2.0`); core occupies ~2× the pixel area.
  - Background star base alpha `0.7..1.0 depth-scaled → 1.0 flat`. Twinkle drives variation; baseline is full bright.
  - Background star quad size bumped `1.0× → 1.4×`.
  - Color star shape silhouettes (diamond/triangle/hexagon/star4-8) bumped `1.0× → 2.2×` so the silhouette is actually readable at typical depths. Dot stars match background bump.
  - Twinkle amplitude `0.15 → 0.35` (background) and `0.20 → 0.40` (color) — visible breathing.
  - **Size pulse**: vertex shader scales the quad by `0.94 + 0.18 × wave` in lockstep with the twinkle alpha. Stars literally breathe in and out.
  - **Hot-white peak shift**: vertex shader blends per-instance color toward white by 25% at the twinkle peak. Peak frames feel like a "hot flash" instead of just a brightness ramp.

- **Particle effects brightened.**
  - Particle atlas dot core widened (Gaussian coefficient `28 → 16`); halo amplitude `0.42 → 0.65` with shallower falloff (`(1-r)^3.0 → (1-r)^2.4`). Embers and small explosion fragments now read as proper hot motes.
  - `explosionEmber` alpha curve `pow(life, 0.55) → pow(life, 0.45)` — stays punchier through the mid-life. Quad `1.55× → 1.8×`.
  - `explosion` size `2.6× → 3.2×`, alpha multiplier `1.0 → 1.3`.
  - `starSparkle` size `7× → 8×`, alpha multiplier `2.5 → 3.0`.
  - `explosionFlash` alpha multiplier `0.6 → 0.95` — flash punch was being dampened unnecessarily. Quad `2.2× → 2.6×`.
  - `explosionRingColored` alpha multiplier `1.5 → 2.0`.

---

## [5.64.16] - 2026-05-04

### Added
- **WebGL starfield layer.** New `WebGLStarfieldRenderer` + `webgl-starfield-atlas.js` render the bulk of the starfield (background stars + simple-shape decorative color stars) via a single instanced draw call on the existing `glCanvas`. Twinkle, parallax, and rotation all happen in the vertex shader — per-star CPU cost is essentially zero.
  - **Atlas**: 1024×128 with 8 shape slots (dot, diamond, triangle, hexagon, star4, star5, star6, star8).
  - **Per-instance attributes (14 floats)**: base position, parallax factor, size, RGBA color, twinkle phase / speed / amplitude, shape slot, base angle, rotation rate.
  - **Vertex shader**: `pos = mod(basePos - drift × parallax, fieldSize)` for parallax+wrap; `angle = baseAngle + time × rotRate` for rotation; `alpha *= (1-amp) + amp × (0.5 + 0.5 sin(time × speed + phase))` for twinkle.
  - **Single context**: shares the WebGL2 context with `WebGLParticleRenderer` (same `glCanvas`); starfield draws first each frame, particles draw on top.
- **Star-count bumps when WebGL is active.** `BACKGROUND_STAR_COUNT × 6` and `COLOR_STAR_COUNT × 3` (configurable via `WEBGL_BACKGROUND_STAR_MULTIPLIER` / `WEBGL_COLOR_STAR_MULTIPLIER` in `core/constants.js`). Default total: ~435 stars on WebGL vs ~10 stars left on Canvas2D.
- **`WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS`** toggle in `core/constants.js`. Default `true` — keeps Canvas2D drawing the complex shapes WebGL doesn't handle (sparkle/burst stars, collectible orbs). Flip to `false` to disable Canvas star drawing entirely for pure WebGL performance, at the cost of losing those animated silhouettes.

### Changed
- **Per-frame GL clear ownership moved to the engine.** `WebGLParticleRenderer.drawParticles` no longer clears the layer (would have wiped the starfield). Engine clears `glCanvas` once per frame before any GL renderer draws.
- **Canvas2D depth-batch renderer now skips stars whose `_inWebGL` flag is set.** When a star is added to the WebGL renderer at population time, it's flagged so the Canvas pass doesn't double-draw it.

---

## [5.64.15] - 2026-05-04

### Changed
- **Beam-weapon category.** Lance Beam (primary) and Lightning Arc (power) are both now continuous-tether weapons that stop at the first object they hit. While the corresponding fire button is held, the beam is on; release to turn off.
  - **Lance Beam (LMB)**: discrete fire-rate / 2-second-duration cooldown is gone. The beam is on continuously while LMB is held. Each frame it picks the closest entity along the ray (smallest `proj`) within the beam-strip width and damages only that one. The renderer reads `p.beamHitDist` and clamps the visible beam length to the impact point — no more pierce.
  - **Lightning Arc (Space / RMB)**: 6-second cooldown gone. While held, the arc continuously targets the nearest enemy or asteroid within `chainRange` (no chain — single-target only) and applies `chainDamage` per frame as a nibble. Renderer draws a jagged-zigzag arc from player → target plus a bright inner core. Legacy chain-cast pipeline preserved as a no-op fallback for any old code paths.
- **Tutorial hints now re-show on every wave-1 start** (`{ once: false }`). Persistence was masking them for players who had already seen earlier versions. IDs bumped to v5/v4 to keep the localStorage keyspace clean.

### Removed
- The `beamTimer` countdown gate on Lance Beam in `player.update()`. Beam state is set directly from `input.fire` each frame in `weapons.js` now.

### Internal
- New player fields: `beamHitDist` (clamps Lance Beam render length), `lightningArcActive` + `lightningArcTarget` (continuous-tether state).

---

## [5.64.14] - 2026-05-04

### Changed
- **New keybind layout.**
  - **SPACE** — fire / charge POWER weapon (was: skill activate). Held to charge, released to fire. Mirrors right-click as a continuous trigger.
  - **TAB** — activate equipped DEFENSE skill (was: cycle primary). Browser-default focus advance is `preventDefault`'d.
  - **E** — cycle PRIMARY weapon (was: drop powerup cheat under SHIFT+E).
  - **R** — cycle POWER weapon (unchanged).
  - **F** — cycle DEFENSE skill (was: SHIFT-tap).
  - **SHIFT** is now FREE — no longer interpreted by the input handler.
  - Right-click stays as an alternate POWER-weapon trigger.
- **Tutorial hint IDs bumped to v4** so the new layout re-shows for players who dismissed earlier versions. New 12s hint ("hold Space or right-click for power, Tab for skill") replaces the old "tap Shift / press Space" copy.
- **Pause-menu CONTROLS tab** rewritten to list the new bindings explicitly (Space/Tab/E/R/F) instead of the abbreviated mouse-only summary.
- **README controls section** updated with the new layout.

### Removed
- **SHIFT-tap-to-cycle-skill bookkeeping** in `input-handler.js`. The press-timestamp + "did another key fire while shift was held" gates are gone — SHIFT is plain again.
- **`input.cycleSkill` flag.** The F key cycles directly via `event-setup.js` calling `player.cycleSkill()`; no input-flag pulse needed.

---

## [5.64.13] - 2026-05-04

### Changed
- **SKILL HUD square moved into the same row as PRM and PWR.** Layout is now `[PRM][PWR][SKILL]` in a single horizontal strip, with the same 12px horizontal `gap` between each square. `skillRowY = groupY` (same Y as PRM/PWR), `skillCx = groupX + 2 × (squareSize + gap) + squareSize / 2`.

---

## [5.64.12] - 2026-05-04

### Fixed
- **SKILL HUD square repositioned.** Left-aligned with the PRM weapon square (`skillCx = groupX + squareSize / 2`) instead of centered between PRM and PWR. Vertical spacing above the SKILL square now matches the gap above the PRM/PWR row (10px from the bottom of the row above): `skillRowY = groupY + squareSize + 26`. Math: PRM label baseline sits 14px below the square; 9px glyphs extend ~2px below baseline → label bottom at `squareBottom + 16` → SKILL top at `squareBottom + 26` for a clean 10px clearance.

---

## [5.64.11] - 2026-05-04

### Added
- **Single-equipped defense skill model.** Replaces the 4-slot system bound to keys 1-4. The player has ONE equipped skill at a time. **Tap SHIFT** to cycle through all skills (parallels Tab/R for primary/power); **press SPACE** to activate the equipped skill.
- **Skill HUD square.** New square BELOW the PRM/PWR pair on the top-left HUD, labeled "SKILL". Shows the equipped skill's icon in its color, with cooldown overlay (proportional dark fill from bottom up + remaining seconds) and active-effect ring while the skill is firing.
- **Pause-menu SKILLS tab restyled.** Same click-to-equip format as the PRIMARY and POWER tabs. All 6 skills are listed; click any row to equip it. Replaces the old slot-assignment UI.
- **Quick cheat keys: `[` → +1000 Gold, `]` → +5 SP.** Solo-key shortcuts that don't require Shift. Show a brief CHEAT toast.
- **Tutorial hints for cycling skills.** New `wave1-cycle-skills-v1` hint fires 11s into wave 1 explaining SHIFT (cycle) + SPACE (activate). The existing weapon-cycle hint id was bumped (`v2 → v3`) so it re-fires for players who already dismissed the previous version.

### Changed
- **All skills are FREE.** Same model as primaries / powers — every skill is selectable from the start via the pause-menu SKILLS tab. Shop SKILLS-tab purchases now equip-for-free instead of charging SP.
- **SPACE no longer fires the power weapon.** Power weapon is right-click only. SPACE is reserved for skill activation.
- **Cheat console banner reduced.** The SHIFT-letter cheat list is gone; banner now shows the bracket cheats and a pointer to console-driven dev cheats (`window.gameEngine.cheats.*`).

### Removed
- **All SHIFT+ cheat codes.** They didn't fire reliably (SHIFT is now the skill-cycle key, so shift+letter combos partially conflict with the input handler's tap-to-cycle bookkeeping). The bracket cheats above are the supported quick-test path.
- **`Player.skillSlots[4]` and `Player.skillCooldowns[4]`.** Replaced by `Player.activeSkill` (string id) and `Player.activeSkillCooldown` (single number).
- **`Player.buySkill` / `Player.assignSkillToSlot`.** Replaced by `Player.equipSkill(id)` and `Player.cycleSkill()`.
- **Digit1-4 → skill1-4 input bindings.** Number keys 1-4 are now free for future use.
- **Old 4-slot bottom-center skill bar** in the HUD.

### Fixed
- Tutorial hints now actually surface (bumped IDs forced re-show for players who dismissed earlier versions). Stagger adjusted: 4s / 11s / 19s into wave 1.

---

## [5.64.10] - 2026-05-04

### Changed
- **Sell button moved left of the cost / level display.** Inside the `.shop-item-right` flex wrapper the sell button is now appended FIRST and `costCol` second, so the red CTA reads first as the eye scans rightward and the price/level summary anchors the row's right edge.

### Added
- **Red "Level 0" tag for unpurchased upgrades.** New `.shop-item-status--zero` class colors the level tag `#ff6666` when `currentStacks === 0`, so the player can tell at a glance which upgrades they haven't put any stacks into yet.

---

## [5.64.9] - 2026-05-04

### Fixed
- **Sell button background was clipped to ~56px wide** (cutting off most of the "SELL +###" label). Root cause: `.shop-item` is a 3-column grid (`grid-template-columns: 56px 1fr auto`) and the sell button was being appended as the row's 4th child. CSS Grid auto-placed it into column 1 of an implicit second row — clamped to the icon column's 56px width, which clipped the red background to less than the SELL text. Fixed by wrapping `costCol` and `sellBtn` in a new `.shop-item-right` flex container that occupies the rightmost auto-sized grid column. The auto column now expands to fit cost + sell side-by-side, and the sell button's background spans the entire `SELL +1500SP` label.

---

## [5.64.8] - 2026-05-04

### Fixed
- **Damage number rendered twice on player hits.** Two parallel damage-number systems were both firing on every player hit:
  1. `createDamageNumber(...)` (the modern path) — pushes onto `this.damageNumbers` and renders via `hud/combat.js drawDamageNumbers` with crit, isPlayerHit, and isEmpowered styling.
  2. `particlePool.get(player.x, player.y, 'damageNumber', ...)` (the old path) — spawns a `Particle` of type `'damageNumber'` and renders via `Particle.draw()`'s switch case.
  Removed the three particle-pool spawn sites in `collision-system.js` (player hit by enemy / enemy bullet / asteroid). The `'damageNumber'` reset/update/draw branches in `particle.js` and the `DAMAGE_NUMBER_FONT` constant are also gone — dead code.

---

## [5.64.7] - 2026-05-04

### Changed
- **Enemy explosions now play in two clearly-delineated beats: BIG RING first, debris second.**
  - **Beat 1 (frame 0)** — `triggerEnemyFinalExplosion` now fires synchronously on impact instead of waiting until the death-window midpoint. Bright flash + 3 expanding wavefront rings + the entire screen punch (hitstop, screen flash, camera kick, screen shake). Ship vanishes immediately. Ring sizes bumped back up since they no longer compete with debris in the same frame: `0.55/0.75/0.9 → 1.4/1.9/2.5` (largest is ~2.5× the enemy radius — substantial wavefront).
  - **Beat 2 (frame 6, ≈100ms later)** — new `triggerEnemyDebrisBurst` fires from the enemy update loop. Dense shrapnel streaks (36+) + classic dust (24) + the ship's own outline pieces ripping outward via `createShapeDebris`, plus a tight 0.6× secondary ring chasing the wreckage out. Debris emerges through the still-expanding rings (which have reached ~12% of their max radius by this frame), so the wavefront edge is visibly defined when the wreckage starts flying.
- **Impact frame is now particle-free.** No more flash / small ring / shrapnel / shape debris on tick 0 — those used to mush in front of the main bang. The kill juice (hitstop, kick, shake, flash) now lives entirely inside the big-ring announce so the screen only punches once, on the actual explosion frame.
- New `triggerEnemyDebrisBurst` exported from `combat-manager.js` and wired through `game-engine.js`.

### Fixed
- Death-sequence flag `_debrisBurstFired` initialized in the enemy constructor and reset on every spawn so a recycled pool slot doesn't skip the debris beat.

---

## [5.64.6] - 2026-05-04

### Changed
- **Enemy big-bang rings cut hard.** The 5.64.5 reduction (2.0/2.7/2.2/3.2 → 1.2/1.6/1.3/1.9) wasn't enough — rings still washed out the ship-shred + shrapnel. New values:
  - **Big-bang final explosion**: dropped from 4 rings to 3, multipliers `1.2/1.6/1.3/1.9 → 0.55/0.75/0.9`. The 1.9× ring (the worst offender) is gone entirely; the largest remaining ring is now slightly smaller than the enemy ship itself.
  - **Initial impact**: `1.3/0.9 → 0.7/0.5`.
  - **Secondary outward ring**: `1.0 → 0.5`.
- Net effect: rings now read as tight wavefronts around the impact point rather than a halo larger than the wreckage. The shred + shrapnel carries the explosion mass.

---

## [5.64.5] - 2026-05-04

### Changed
- **Enemy ships now visibly tear apart on death.** `createShapeDebris` rewritten:
  - Each outline edge is **fragmented** into 2 half-segments before spawning, so a HUNTER goes from 6 pieces to ~12, a TITAN from 20 to ~40, etc.
  - Every fragment gets a high-velocity outward kick (radial speed 2.6× base × random 0.25-1.75 jitter) plus a tangential perpendicular component at ~25% of the radial speed, so pieces scatter chaotically instead of unraveling in a clean ring.
  - Rotation rate multiplied 2.4× — pieces visibly tumble.
  - Internal struts expanded per enemy type (HUNTER: +engine-block detail lines, GUARDIAN: +grid ribs, WASP: +wing detail, TITAN/TANGERINE: +deeper inner ring + 4 more spokes, STALKER: +arm-tip caps, default: +radial spokes).
- **Tighter enemy explosion rings.** Big-bang ring radius multipliers `2.0/2.7/2.2/3.2 → 1.2/1.6/1.3/1.9`. Initial-impact rings `2.2/1.4 → 1.3/0.9`. Secondary outward ring `1.8 → 1.0`. Rings no longer dominate the shrapnel + ship-shred signal — the actual blowup reads through.
- **`lineDebrisPool` 20 → 100.** Sized for the new 2× fragment count plus simultaneous deaths.
- **Hit/destruction effects redelineated** (5.64.4 wasn't enough — landed in this same version):
  - Asteroid hit: NO screen shake (was light shake).
  - Asteroid destruction: shake only — no screen flash (flash reserved for enemy kills).
  - Enemy hit: small screen shake (NEW).
  - Enemy destruction: flash + shake (unchanged).
- **Shop sell button refund is now full at-cost.** `Math.floor(cost × 0.5) → cost`. Players don't lose currency when selling, so the upgrade tree functions as a permanent collection that lets you experiment freely instead of a sunk cost. Both `shop-dom.js`, `shop-manager.js`, and `shop-renderer.js` updated in lockstep so displayed and actual refunds match.
- **Sell button restyled.** Padding `6px 10px → 9px 14px`, more opaque background (`0.7 → 0.92`), brighter border, subtle box-shadow for depth, hover lifts via `transform: translateY(-1px)`. The red background now pads evenly around the entire `SELL +### ` label.
- **Shop opens on a random non-HELP tab.** Lands on PRIMARY / POWER / DEFENSE / SKILLS at random instead of always HELP, so each shop visit surfaces a different category up-front. HELP is still reachable from the tab row.
- **DEFENSE / SKILLS tabs got header banners.** Mirrors the equipped-weapon banner above PRIMARY / POWER for visual consistency. DEFENSE shows a green 🛡️ "Defense" header; SKILLS shows a magenta ⚡ "Skills" header.

---

## [5.64.4] - 2026-05-04

### Changed
- **Hit/destruction effects redelineated between enemies and asteroids.** Enemies now feel "alive", asteroids "inert":
  - Enemy hit: small screen shake (was: nothing). Communicates contact through camera feel.
  - Enemy destruction: screen flash + screen shake (unchanged).
  - Asteroid hit: NO screen shake (was: light shake). Hit feedback through cursor flash + shrapnel/sparkles only.
  - Asteroid destruction: screen shake only (was: shake + screen flash). Flash is now reserved for enemy kills.
- **Ember lifespan halved.** Initial life `1.0-1.8s → 0.6-1.0s`; decay rate `0.009/tick → 0.020/tick`. With both adjustments, embers visibly cool from spawn to extinguish in ~1-1.5s instead of ~3-6s. Frees pool slots for the next burst and matches the "spark cooling" read better than "lingering glow."
- **Particle sprites sharpened further.** Second pass on the WebGL atlas:
  - **Ember (`dot`)**: hot-core Gaussian coefficient `18 → 28` (tighter); halo amplitude `0.55 → 0.42`, exponent `2.4 → 3.0` (smaller, steeper falloff). Embers now read as discrete pin-sharp glowing motes.
  - **Flash**: hotter radial body (Gaussian coefficient `6 → 8`); 4-point cross spike amplitude `0.45 → 0.6` and sigma tightened (`0.0008 → 0.0005`) so the spike is pixel-sharp.
  - **Sparkle (`spark`)**: pixel-thinner cardinal arms (`σ²=0.0006 → 0.00035`) and diagonals (`σ²=0.0009 → 0.0006`); diagonal amplitude `0.35 → 0.5`; central glow Gaussian `25 → 32`. True 8-point twinkling-star silhouette.
  - **Streak**: head taper `u^2.4 → u^2.8`; hot-tip boost `0.35 → 0.55` (sharper leading pixel-line).

---

## [5.64.3] - 2026-05-04

### Changed
- **Sharper, more defined WebGL particle sprites.** Rebuilt `js/modules/performance/webgl-particle-atlas.js` so each slot is rendered procedurally pixel-by-pixel from a custom alpha curve instead of a CSS radial gradient. Visual upgrades:
  - **Ember (`dot`)**: Gaussian hot-core (`exp(-r² × 18)`) plus a softer quadratic halo. The bright centre is concentrated in the inner ~15% rather than spread through the inner 70%, so embers read as discrete glowing points instead of soft fuzzy clouds. Per-instance quad size trimmed `(r+6)×1.8 → (r+4)×1.55` to match.
  - **Flash**: kept the cool-blue radial body but overlaid a thin 4-point cross spike that fades with radius. Adds visible "punch" to the destruction flash without dominating it. Slight peak-alpha boost (0.55 → 0.6) so the spike reads cleanly.
  - **Sparkle**: NEW dedicated `spark` atlas slot — a 4-point cross star (cardinal arms full intensity, diagonals at 35%) with a tight central glow. `starSparkle` now maps to this slot instead of sharing `dot`, so sparkles look like actual sparkles instead of small fuzzy dots.
  - **Streak**: steeper head taper (`u^1.7 → u^2.4`) plus a Gaussian hot-tip at u≈1. Streaks now have a defined leading edge that reads as fast directional motion.
  - **Ring**: tighter Gaussian annulus (σ=0.13) with a soft inner-edge cut at r<0.45 so the ring reads as a defined wavefront edge.
- **Atlas dimensions**: 1024×256 → 1280×256 (added one 256×256 slot for spark). VRAM cost: +256KB. Shader and renderer changes are minimal — the per-instance UV attribute already carried slot offset/scale, so adding a slot needed only a UV-table entry and a `TYPE_TO_SLOT` remap.

---

## [5.64.2] - 2026-05-04

### Changed
- **`MAX_PARTICLES` 600 → 2500.** The 5.64.0 WebGL particle layer renders the migrated types in one instanced draw call at ~50ns per particle, so the per-particle cost is essentially flat regardless of count. The old 600 cap was tuned for Canvas2D headroom (3-4 simultaneous big-bangs); the new cap supports 8+ simultaneous big-bangs alongside ambient bullet-hit activity with no measurable frame-time cost.
- QA pool-cap tests updated to assert against the new cap.

---

## [5.64.1] - 2026-05-04

### Removed
- **Lingering ember trails behind enemies during combat.** Every bullet-on-enemy hit was spawning 4 `explosionEmber` particles at the impact point, each with 1.0-1.8s lifetime. As an enemy moved and the player kept shooting it, those embers accumulated as a soft fading cloud along the enemy's path. The 5.64.0 WebGL atlas dot has a more uniform falloff than the previous Canvas2D `shadowBlur` glow, so the cloud read as a continuous soft haze rather than discrete fading specks — louder visual noise. Hit feedback is unchanged: shrapnel streaks (8) + sparkle motes (2) still fire on every hit. Same motion-only philosophy as 5.63.1's enemy-explosion cleanup.

---

## [5.64.0] - 2026-05-04

### Added
- **WebGL particle layer (`#glCanvas`) underneath the Canvas2D layer.** Bright/glowing particle types now render via a single instanced WebGL2 draw call per frame instead of one Canvas2D draw call per particle. Migrated types: `explosionEmber`, `explosionFlash`, `explosion`, `starSparkle`, `explosionShrapnel`, `explosionRingColored`. Architecture:
  - `js/modules/performance/webgl-particle-renderer.js` — single instanced draw, per-particle attributes (position, size, color, atlas UV, rotation), additive blending replaces Canvas2D's per-particle `globalCompositeOperation = 'screen'`.
  - `js/modules/performance/webgl-particle-atlas.js` — 1024×256 RGBA atlas with four 256×256 slots: dot (ember/sparkle/classic), flash gradient, hollow ring, horizontal streak. Baked once at module load.
  - GLSL shaders inline (vertex + fragment) — vertex transforms a unit quad to world coordinates, applies camera offset and per-instance rotation; fragment samples the atlas and multiplies by per-instance color.
  - `webglcontextlost` / `webglcontextrestored` listeners rebuild the program/atlas/VBOs on context loss.
- **`#glCanvas` element in `index.html`**, sized to viewport via the engine's resize handler.

### Changed
- **`drawParticlesBatched` is now single-pass.** The old two-pass screen-blend path is gone — every particle that used `globalCompositeOperation = 'screen'` now renders through WebGL with native additive blending. `SCREEN_BLEND_TYPES` removed.
- **`gameCanvas` clears to TRANSPARENT each frame** (was opaque-black). The black void of the game now comes from `#glCanvas`'s CSS background; the particle layer shows through wherever the Canvas2D layer hasn't drawn anything.
- **CSS layering**: both canvases occupy the same fixed viewport position; `#glCanvas` at z-index 0 with `background: #000`, `#gameCanvas` at z-index 1 with `background: transparent`.

### Removed
- **`Particle.draw()` cases for the 6 migrated types.** The Canvas2D draw paths are replaced by the WebGL renderer.
- **`radialGradientSpriteCache`** — no remaining consumers after `explosionFlash` migrated to the WebGL atlas.

### Performance
- One WebGL draw call replaces up to ~600 per-particle Canvas2D draws per frame. Frees ~0.5-1.2ms/frame in dense scenes and removes the `MAX_PARTICLES` cap pressure that drove the eviction issues fixed in 5.63.0.

---

## [5.63.1] - 2026-05-04

### Removed
- **All lingering particles from enemy explosions.** Enemy deaths now spawn motion-only particles — flash, expanding rings, outflying shrapnel, fast-velocity classic dust, and shape debris. Removed:
  - Initial impact: embers (6-14) + sparkles (6).
  - Midway big-bang: core glow ember cluster (6 slow embers at center), lingering embers (22-34), sparkle dust (22), cookoff embers (8).
  - Net per-kill pool pressure: ~145 → ~70 particles. With the 600 cap, that's headroom for 8 simultaneous big-bangs to render fully alongside ambient activity, instead of 3-4.

### Changed
- Midway big-bang's classic small particles bumped speed range `2-11 → 3-12` so even the slow tail of the burst has visible outward motion. Count `36 → 24` since each remaining particle contributes more.
- Initial-impact shrapnel count and shape-debris emission unchanged — those were already pure motion.

---

## [5.63.0] - 2026-05-04

### Fixed
- **Enemy explosions are now actually consistent.** Root cause identified and removed: every big-bang scheduled FOUR `setTimeout`-deferred ring spawns at 60/130/220ms, plus a 100ms-deferred secondary cookoff. Those `.get()` calls fired AFTER ambient bullet/asteroid particle activity had refilled the pool — and the late spawns then evicted THIS explosion's earlier shrapnel/embers via the FIFO eviction policy. Result: every other kill looked weak because half its own particles were gone before the deferred rings even spawned. All deferred spawns now fire **instantly in the same frame** as the rest of the explosion. Visual cascade is preserved because each ring particle has its own `0.9s` lifetime and expansion curve — four rings at different `maxRadius` values still look like concentric wavefronts radiating out.

### Changed
- **MAX_PARTICLES 320 → 600** to give 3-4 simultaneous big-bangs full headroom alongside ambient activity. The 5.60.0 sprite-cache renderer makes the higher cap effectively free.
- **Cached `cos/sin` for `explosionShrapnel`.** Angle and speed don't change after init, so the draw path no longer recomputes `Math.cos(angle)` / `Math.sin(angle)` / `Math.hypot(vel)` every frame per particle. ~3 trig ops per particle per frame eliminated. With 30-50 active shrapnel during enemy deaths, a small but free win.

### Documentation
- **`docs/WebGL Migration Analysis – 2026-05-04.md`** — full audit of the rendering surfaces, where Canvas2D wins now, where WebGL would help, realistic 4-6 week migration cost, and a hybrid (WebGL particles + Canvas2D everything else) middle path. Recommendation: stay on Canvas2D for now; revisit if we ever need >2-3K simultaneous particles or hit a wall the existing optimizations can't clear.

---

## [5.62.2] - 2026-05-04

### Removed
- **Per-frame popcorn cookoffs during enemy death drift.** The 9 small bursts during the 36-frame drift phase were inconsistent — sometimes clipped by particle pool eviction, sometimes hidden by the silhouette glow, sometimes interrupted by the wave-clear → shop transition. Every enemy now gets a single guaranteed big explosion at the death midpoint instead of trying to fire popcorn through a busy pool. Less chance for things to be cut off.

### Changed
- **Death sequence simplified to two beats.**
  - Ticks 0-11: wreck drifts (silhouette visible, no popcorn). 200ms beat for the player to register the kill.
  - Tick 12: BIG midway explosion (`triggerEnemyFinalExplosion`), ship vanishes, full debris cloud. Always fires.
  - Ticks 13-23: debris drifts via its own particle physics.
  - Tick 24: recycle.
  Total death duration: 24 frames / 400ms (was 36 / 600ms). Snappier pacing, single guaranteed big explosion, perfectly consistent across HUNTER / WASP / GUARDIAN / etc.
- **Wave-clear gate now waits for ALL death animations to fully complete.** Previously the gate filtered out enemies with `_deathFlash > 0`, so it fired the moment the last enemy STARTED dying — the shop could then pop over an in-progress explosion. Now uses `enemyPool.activeObjects.length` directly. Mid-death enemies still have `active = true`, so they keep the gate closed until their `_deathFlash` reaches 0 and they recycle. The big-bang always finishes before "WAVE COMPLETE" appears.
- **WAVE COMPLETE message + fade window before the shop opens.** Was: 700ms after wave-clear → shop. Now: WAVE COMPLETE message at full opacity 0-1300ms, fade-out across last 35% (1300-2000ms), shop opens at 2000ms. Player gets a clear visual / temporal pause between gameplay and shop interaction. Message duration is hardcoded to 2000ms (was the 5000ms `waveCountdownDuration`) so the fade aligns with the shop trigger.

---

## [5.62.1] - 2026-05-04

### Removed
- **`explosionFlash` particle on non-lethal enemy hits** across all damage paths:
  - Bullet → enemy collision (`enemy.radius * 0.45` flash at impact point)
  - Lance Beam → enemy contact (35%-throttled `enemy.radius` flash)
  - Nova wavefront crossing each enemy (`size 22` flash)
  - Lightning chain target (`size 28` flash)
  Sparks, embers, and sparkles still fire on every hit so the contact reads — only the bright pop is gone. Flash is now reserved entirely for the destruction event (impact frame `0.06α` + midway big-bang `0.12α`), so the visual punch lands harder when an enemy actually dies.

---

## [5.62.0] - 2026-05-04

### Added
- **Animated health bar.** The bar's fill smoothly eases toward the player's current HP each frame instead of snapping. Drain (taking damage) eases at 16% / frame and gain (heal/respawn) at 30% / frame — asymmetric curve makes hits read as a clear chunk leaving the bar while heals snap back faster. HP text below the bar still shows the live integer value, so the bar provides drama and the text provides truth. **XP bar is untouched** — it still uses live values exactly as before.
- **Screen flash on enemy destruction (only) restored.** Re-added small `triggerScreenFlash(0.06, 4)` on the impact frame and a bigger `triggerScreenFlash(0.12, 6)` on the midway big-bang. Non-lethal hits still don't flash. Reserves the visual punch for actual destruction events.

### Changed
- **Popcorn cookoffs are now actually visible.** The death-flash silhouette's additive glow was 3.0× the enemy radius — popcorn bursts spawning at 0.3-1.1× radius were drowning under the halo. Two changes:
  - Silhouette glow radius cut from 3.0× → 1.5× the enemy radius.
  - Popcorn now spawns at 1.4-2.2× radius (outside the halo) with bigger flashes (`r × 1.3` instead of `r × 0.85`) and bigger rings (`r × 1.6-2.4` instead of `r × 0.8-1.7`).
- **Popcorn particle count cut ~50% per burst, but each one is bigger and brighter.** From ~12 particles per burst down to 6: 1 flash + 1 ring + 3 sparks + 1 ember (was 1 flash + 2 rings + 5 sparks + 2 embers + 2 sparkles). Sparkles dropped — too small to read at gameplay scale. Total popcorn-phase particles drop from ~108 → ~54 across the 9 bursts before the midway big bang.
- **Consistent visibility across enemy colors.** Popcorn rings now alternate white / enemy color (was random per-burst), and shrapnel always leads with a white spark. So a HUNTER's red explosion reads with the same intensity as a WASP's yellow one — no more "red ships have worse explosions" because the bright reference particles are always present.

---

## [5.61.0] - 2026-05-04

### Changed
- **Background star count halved across the board.** Multiplier on `BACKGROUND_STAR_COUNT` cut from `4×` → `2×` (also in pool-init pre-allocation). Total background stars drop from 120 → 60. Parallax depth from the depth-bucket batched renderer carries the visual richness — 60 stars feel as full as 120 used to. Free perf for every frame in every wave.
- **Particle render is now two-pass batched by composite mode.** New `drawParticlesBatched(pool, ctx, ...)` helper (in `world/particle.js`) splits the pool into source-over particles (drawn first) and screen-blend particles (drawn second with composite set ONCE). Replaces the old per-particle composite toggle: in dense scenes with 100+ screen-blend particles, that's 200 `globalCompositeOperation` writes per frame collapsing to 2. `Particle.draw` for `explosionFlash`/`explosionEmber` no longer touches composite — the batched caller manages it. Game-engine render path now uses the batched function.
- **Late-wave AI throttle (waves 15+).** Each enemy's heavy spatial scans (`avoidAsteroids`, `maintainDistanceFromEnemies`, `dodgeEnemyBullets`, `dodgePlayerBullets`, `updateEvasiveManeuvers`, `maintainDistanceFromPlayer`, `patrolTerritory`) now run on alternating frames, staggered per-enemy via a random `_aiOffset` set at spawn. Half the enemies tick AI on even frames, half on odd. Movement, facing, and shooting still update every frame so the action stays smooth. Cuts AI cost ~50% in waves 15-20.
- **Asteroid projection stagger.** `_projectionDirty` is now flipped every-other-frame per asteroid (random `_projOffset` per spawn), so only half the field re-projects 3D vertices each frame. Rotations still advance every frame; the projected vertices just lag by at most one frame (16ms at 60fps — imperceptible for tumbling rocks). Warping asteroids force-project every frame so the warp-in animation stays crisp.
- **`frameClock.tick` is now an integer counter** (was the function name). Renamed the function to `frameClock.advance()`. Used by the new AI throttle and asteroid stagger to do cheap parity checks. Single call site (`game-engine.gameLoop`) updated.

### Notes
- Combined with the 5.60.0 sprite-baking pass, particle render cost should be down ~60% from pre-perf-plan baseline. Sustained 60fps in late-wave dense scenes is now the target.
- Items still on the perf plan: spatial-grid bullet dodge, adaptive particle quality (fail-safe), classic-for-loop conversions for the dodge functions. Most-impactful wins are landed.

---

## [5.60.0] - 2026-05-04

### Changed
- **Pre-baked glow sprites for the two hottest particle types — major particle render speedup.** This is item #1 from `docs/Performance Optimization Plan – 2026-05-03.md`.
  - **`explosionFlash`**: was building a fresh 4-stop radial gradient on every draw call (`createRadialGradient` is one of the heaviest Canvas2D ops, ~0.05ms each), then `arc + fill`. New `radialGradientSpriteCache` bakes the 128×128 multi-stop sprite ONCE at module load and reuses it via `drawImage` — single GPU bitblt per particle. With ~30-50 concurrent flashes during a mine explosion or enemy death cluster, this saves multiple milliseconds per frame.
  - **`explosionEmber`**: was doing two `arc + fill` passes (body + halo) with a `globalCompositeOperation` toggle in between. Now uses the existing `glowSpriteCache.draw()` (per-color cached sprite with shadowBlur baked in) — single `drawImage`. Eliminates the second arc/fill entirely. Embers are the most numerous particle in the game (~24 per enemy death + 6-12 per popcorn burst), so this scales well.
- **Particle pool now has the headroom to actually USE 320 active particles** without the framerate caving — the bottleneck wasn't the count, it was the per-particle render cost. Should make late-wave dense scenes (boss + 5 enemies dying simultaneously) hold solid 60fps.

### Notes
- The flash sprite uses the same color stops as before — bakes pure white at 0.85α tapering through blue-white to transparent, so the on-screen look is preserved.
- Ember sprite uses the existing `glowSpriteCache` shadowBlur recipe (blur=8). The visual is slightly softer than the old hand-drawn body+halo combo (one larger soft glow vs separate body+halo), but reads identically at gameplay scale.
- Future wins from the perf plan still on the table: sort particles by composite mode (eliminates per-frame `globalCompositeOperation` toggles), throttle late-wave enemy AI to 30Hz, asteroid projection skip on small angle deltas. See `docs/Performance Optimization Plan – 2026-05-03.md` for the full priority list.

---

## [5.59.4] - 2026-05-03

### Removed
- **Fullscreen screen flash on enemy damage / death.** Both `triggerScreenFlash` calls in the enemy death pipeline are gone — the impact-frame `0.10` and the midway-explosion `0.16`. Stacked enemy kills used to wash the screen white. Hitstop, camera kick, and screen shake still carry the impact, and the localized particle flashes do the visual work without globally tinting the canvas.

### Changed
- **Particle pool cap raised 220 → 320** for consistency. The 36-frame multi-stage enemy death sequence (impact + 9 popcorn bursts + midway big-bang + lingering debris) emits ~230 particles concurrently. With the old 220 cap, ambient bullets/asteroid hits could evict the death sequence's own particles mid-flight, making enemy explosions look weak or missing parts. The 320 cap gives the full sequence room to breathe alongside ~90 particles of ambient activity. QA tests updated to spawn 500-600 and assert `≤ 330`.

---

## [5.59.3] - 2026-05-03

### Changed
- **Enemy death sequence reorganized — big bang at the midpoint, ship vanishes, debris keeps flying.**
  - **Popcorn now starts immediately**, every **2 frames** (was every 3, gated until after impact). The wreck is constantly cooking off from frame 1 onwards.
  - **Big final explosion now fires at the midpoint** (frame 18 of a 36-frame death window) instead of at the end. Triggered exactly once via a new `_shipDestroyed` flag.
  - **Ship suddenly disappears** the moment the big explosion fires — `enemy.draw` early-returns when `_shipDestroyed`, so the silhouette is gone and only the debris cloud remains.
  - **Popcorn stops** once the ship vanishes (gated on `!_shipDestroyed`) — it was the ship cooking off, so once the ship's gone, no more cooking. Existing debris drifts under its own particle physics for the remaining ~18 frames before recycle.
  - **Bumped final-explosion debris counts** so the midway pop reads as the ship physically breaking apart:
    - Shrapnel `22-34 → 36-54` pieces, speed range `5-14 → 6-18`.
    - Lingering embers `14-22 → 22-34`.
    - Classic small particles `22 → 36`, speed range `2-9 → 2-11`.
    - Sparkle dust `14 → 22`, spread `1.4× → 1.8×` radius.
    - **Shape debris fires a second time** at the big bang (in addition to the impact-frame scatter) so a fresh batch of outline pieces flies out alongside the ship vanishing.
  - `_deathFlash` and `_shipDestroyed` reset at every spawn so a recycled pool slot doesn't start out destroyed.

---

## [5.59.2] - 2026-05-03

### Changed
- **Enemy explosions are significantly more epic.** Enemies are a big deal — the player should feel every kill from impact through finale.
  - **Phase A (initial impact)** now triggers a real screen shake (14 frames @ 7 magnitude, scaled by radius), bumped hitstop 5 → 6 frames, screen flash 0.07 → 0.10, and camera kick 14 → 18.
  - **Phase B (drift popcorn)** fires every **3** frames instead of 5 (≈12 popcorn bursts across the 36-frame death window, was ≈7). Each burst now spawns:
    - 2 expanding rings (was 1) — bright core + colored halo
    - 5 directional sparks (was 3)
    - 2 embers (was 1) + 2 sparkle motes (was 1)
    - **A small screen shake** (4 frames, magnitude 2-4.5 tapering with the wreck's remaining life) so the player feels every secondary cookoff
  - **Phase C (final explosion)** got the biggest punch in the sequence: hitstop 4 → 7, screen flash 0.10 → 0.16, camera kick 11 → 18, screen shake **28/14 → 38/22** (frames/magnitude) with magnitude scaled at 3.0× radius (was 2.4×). The finale is unmistakable.

---

## [5.59.1] - 2026-05-03

### Fixed
- **`ReferenceError: i is not defined` on every enemy explosion** that crashed the game loop. The popcorn-burst code in `enemy.update`'s death-flash branch (added in 5.59.0) referenced the for-loop counter `i` after the loop body ended — `i` is `let`-scoped and wasn't visible at the ember-spawn line. Replaced with `tickIntoDeath % 2` so the ember color still alternates without leaning on the dead loop variable.

---

## [5.59.0] - 2026-05-03

### Changed
- **Multi-stage epic enemy death sequence.** Replaces the single-burst `createEnemyDebris` pop with a three-phase death:
  - **Phase A — initial impact** (frame 0): bright flash + 2 expanding rings (white + enemy color), 10-22 directional shrapnel, 6-14 embers, 6 sparkle motes, shape debris, hitstop + screen flash + camera kick. Screen shake is held back for the finale.
  - **Phase B — drift + popcorn** (frames 1-35, ≈600ms): the wreck keeps drifting under inertia (friction 0.97/frame, faceAngle wobble +0.04/frame). Every 5 frames a small popcorn burst spawns at a random offset around the body — flash + colored ring + 3 sparks + ember + sparkle. Reads as "the wreck is breaking apart as it tumbles."
  - **Phase C — final explosion** (frame 36, just before recycle): big core flash (×2.4 radius), four staggered rings spaced 0/60/130/220ms, 22-34 directional shrapnel in a 4-color rotation (white/gold/enemy color/orange), 6-element core glow cluster, 14-22 lingering embers, 22 classic small particles, 14 sparkles, screen flash + camera kick + screen shake (28 frames @ 14 mag), plus a 100ms-delayed cookoff with 8 scattered embers + a final ring. Position is captured at function entry so pool recycling can never desync the spawn coords.
  - Death-flash duration extended from 8 frames → 36 (~600ms) to give the drift phase room to read.
- **Explosions are now guaranteed.** The final explosion fires from inside the enemy's update branch the tick `_deathFlash` hits 0 — same code path as the active-flag flip, so there's no way the enemy can deactivate without explode-trigger running. Wrapped in try/catch and `typeof === 'function'` gates so a transient missing engine ref can't silently swallow it.

---

## [5.58.1] - 2026-05-03

### Removed
- **Free health top-up between waves.** `startNextWave` no longer sets `player.health = getEffectiveMaxHealth()`. The player keeps whatever HP they finished the wave with — health orbs, MEDPACK pickups, and the shop are the only legitimate heals now. Current health is still clamped to the live max in case a Health Boost stack purchased between waves changed the cap.

---

## [5.58.0] - 2026-05-03

### Added
- **Damage numbers when the player gets hit.** All four player-damage paths (player↔enemy collision, player↔asteroid collision, enemy bullet hit, generic `lifecycle.takeDamage`) now spawn a damage number above the player. Renders red and bold with a leading "−" prefix (e.g. `−12`) so it's instantly distinguishable from the gold enemy/asteroid hit numbers. New `isPlayerHit` opt on `createDamageNumber` drives the styling in `hud/combat.js drawDamageNumbers`.
- **Epic player-hit FX** — every player damage event now fires a unified `triggerPlayerHitFX(impactX, impactY, damage)` helper:
  - Bright red-tinted impact flash + 90-150 px shockwave ring at the player.
  - 12-28 directional shrapnel pieces in a white/red/orange/crimson rotation.
  - 6-14 lingering embers + 8-16 sparkle motes scattered around.
  - Screen flash alpha 0.18 → 0.36 (scaled by damage), shake duration 16-30 frames at 6-15 magnitude, hitstop 3-7 frames.
  - Camera kicks AWAY from the impact point — direction computed from impact vector — so the world feels like it just got shoved.
  - All counts/intensities scale on a `severity = clamp(damage/25, 0.4, 1.0)` curve so a graze still reads while a 25-damage cataclysm shakes the screen apart.

### Changed
- `lifecycle.takeDamage` swapped its legacy `particlePool.get(..., 'damageNumber', ...)` call out for the proper `createDamageNumber` system — consistent rendering with all other damage numbers.

---

## [5.57.2] - 2026-05-03

### Removed
- **Reverted the asteroid wave-clear gate.** Wave now completes the moment all enemies are dead — the asteroid threshold + ENEMIES CLEARED pulse + asteroid-easy-mode HP halving all gone. The cleanup phase felt off in practice, and accumulating rocks across waves was tanking perf. Asteroids are back to "obstacles/loot you can ignore."

### Changed
- **Asteroid spawn counts trimmed across the roster** to compensate for asteroids bleeding forward into the next wave (no more clear-the-field gate to reset things):
  - Waves 1-4: 5/6/6/5 → 3/3/3/3
  - Waves 6-8: 4 each → 3 each
  - Wave 9: 3 → 2
  - Waves 11-13: 3 each → 2 each
  - Boss + late waves unchanged (already low).
  Wave 14+ counts were already at 2; carryover keeps the field meaningfully populated without overloading.

---

## [5.57.1] - 2026-05-03

### Added
- **Asteroid-vs-asteroid collision response is back — but no position correction.** Real impacts now bounce, while still-overlapping or already-separating pairs are left alone. The trick is gating the elastic-velocity-exchange on the relative-velocity-along-normal sign:
  - `(v2 − v1) · n̂ < 0` → pair is closing → swap normal velocity components, keep tangential. Real impact bounce.
  - `≥ 0` → already separating (or stationary-overlapping) → skip. Lets fragments from a split fly apart on their own velocity; lets stuck-overlapping rocks rest peacefully without jittering.
  No positional displacement is ever applied — the visible "shift/jump" that prompted disabling collisions in 5.54.6 stays gone. Light debris particles spawn on real impacts (2-3, on-screen only) so the bump reads.

---

## [5.57.0] - 2026-05-03

### Added
- **"ENEMIES CLEARED" pulse** — the moment the last enemy of a wave dies, the player gets:
  - A green-tinted shockwave ring (radius 240) + bright flash + 18 directional sparks + 14 lingering embers anchored on the player's position.
  - A camera kick + screen shake + screen flash (alpha 0.18) for tactile feedback.
  - A "ENEMIES CLEARED — Mop up the rocks" toast at the top of the screen.
  - **Asteroid HP is halved across the entire field**, and any fragments spawned during the rest of the wave inherit halved HP too (`asteroidEasyMode` flag). The cleanup phase is breezy instead of grindy.
  Pulse fires exactly once per wave (`enemiesClearedThisWave` gates it). Both flags reset on the next `spawnWaveEntities`.

### Changed
- **Power-curve scaling formulas** — replaces the linear-per-level math so early waves are easy and late waves climb sharply.
  - **Enemy HP**: `1 + ((L-1)/19)^1.6 · 4.5`. L1: 1.0×, L5: 1.36× (was 1.72×), L10: 2.34× (was 2.62×), L15: 3.82×, L20: 5.50× (was 4.42×).
  - **Enemy points**: `1 + ((L-1)/19)^1.4 · 5.5`. L1: 1.0×, L5: 1.50× (was 2.0×), L20: 6.50× (was 5.75×).
  - **Enemy speed level**: `1 + ((L-1)/19)^1.4 · 0.7`. L1: 1.0×, L5: 1.06× (was 1.24×), L20: 1.70× (was 2.14×). Gentle on top of the campaign mult.
  - **Enemy speed campaign**: `0.55 + ((w-1)/19)^1.5 · 2.0`. W1: 0.55×, W5: 0.74× (was 1.03×), W10: 1.20× (was 1.63×), W15: 1.82×, W20: 2.55× (was 2.83×).
  - **Asteroid HP**: `1 + ((L-1)/9)^1.5 · 4.0`. L1: 1.0×, L3: 1.21× (was 1.56×), L5: 1.94× (was 2.12×), L10: 5.0× (was 3.52×).
  Net effect: waves 1-5 feel meaningfully easier than 5.56.x; waves 15-20 are roughly on-par or harder.
- **Asteroid fragmentation reduced from 3-4 → 2 pieces per split.** Stops the field from exponentially accumulating after a few large-asteroid kills, while still preserving the satisfying split feel.
- **Asteroid wave-clear threshold relaxed.** Was "live ≤ floor(start/2)" → now "live ≤ ceil(start · 0.40)". Some leftovers are intentional — they bleed into the next wave and make the late game feel chaotic.

### Removed
- The previous "must destroy half the asteroids" gate that contributed to the asteroid-accumulation problem. Replaced by the enemies-cleared-pulse + lenient threshold combo.

---

## [5.56.1] - 2026-05-03

### Changed
- **Smallest health/money orbs now ~75% larger.** `HEALTH_ORB_SIZE_MIN` 1.3 → 2.28, `MONEY_ORB_SIZE_MIN` 1.3 → 2.28. Max sizes bumped proportionally (1.4 → 2.45 health, 1.6 → 2.55 money) so big drops still feel meaningfully larger than small ones. Tiny low-value orbs are now legible at a glance instead of vanishing into the asteroid debris.

### Documentation
- **README — full run instructions for every npm script.** Fleshed out the "Running Scripts & Services" section: dev/build, asset generators (`generate-playlist`, `generate-sfx`), all unit / QA / E2E / perf test variants, Allure reports, mitata microbenchmarks (with per-suite shortcuts), and the AI QA bot (`qa:bot:*` — quick / long / headed / bugs / balance / novice / report). Added infrastructure notes covering Playwright browser install, Allure bundling, Node version, and the shared `tests/helpers/game-ai.js` API.

---

## [5.56.0] - 2026-05-03

### Added
- **Wave-clear gate now requires destroying half the wave's asteroids** in addition to killing all enemies. The starting asteroid count is captured when the wave spawns; the player must reduce the live count to ≤ floor(start/2) before the wave will complete. Forces actual engagement with the asteroid field instead of dancing around it.
- **Performance optimization plan** authored at `docs/Performance Optimization Plan – 2026-05-03.md` — audits suspected bottlenecks (particle render, O(N²) AI loops, asteroid 3D projection per-frame, shadowBlur cost), proposes 7+ technical and 5+ gameplay optimizations, and prioritizes by estimated payoff.

### Changed
- **Steeper enemy/asteroid scaling** (second pass — the difficulty curve in 5.55.0 was still too gentle):
  - Enemy HP per level: +14% → +18% (wave 20 = 4.42× base, was 3.66×).
  - Enemy speed per level: +5% → +6%.
  - Enemy points per level: +20% → +25% (wave 20 = 5.75× base reward).
  - Campaign-wide speed multiplier: 0.60→2.50 → 0.55→2.83 across waves 1-20.
  - Asteroid HP per level: +23% → +28% (wave-20 rocks 3.52× base, was 3.07×).
- **Sell button stays on one line.** Added `white-space: nowrap`, `flex-shrink: 0`, and explicit `text-align: center` to `.shop-item-sell` so labels like `SELL +1500SP` no longer wrap onto two lines on narrower rows.

---

## [5.55.0] - 2026-05-03

### Changed
- **Game-wide balance pass — rarer but more potent powerups, steeper enemy/asteroid scaling, smaller late-wave rosters.**
  - **Powerup drop rates cut ~65–70%.** Small asteroid 15% → 5%, large asteroid 20% → 8%, WASP 65% → 22%, TITAN 80% → 50%, TANGERINE 70% → 28%, default enemy 55% → 18%.
  - **Per-stack powerup effects bumped 25–50%** to compensate for the lower drop rate — every pickup now meaningfully changes the build:
    - RAPID_FIRE: −15% → −22% fire delay per stack (compounding)
    - BIG_BULLETS: +1.5px → +2.2px radius per stack
    - HOMING: 0.06 → 0.09 strength per stack (caps at 0.4)
    - SPEED_BOOST: +50% → +65% thrust per stack
    - LONG_RANGE: +40% → +55% range per stack
    - SHIELD_BOOST: +5% → +8% damage reduction per stack
    - HEALTH_BOOST: +25 → +35 max HP per stack (cap raised 525 → 600)
    - CRIT_CHANCE: +5% → +7% per stack (cap 50% → 60%)
    - CRIT_DAMAGE: +10% → +15% per stack (cap 500% → 550%)
    - KNOCKBACK: +30% → +40% per stack (cap 3.0× → 3.5×)
  - **Enemy scaling steepened** for the 20-wave campaign:
    - Per-level HP: +10% → +14% (wave 20 enemies have 3.66× base HP, was 2.9×)
    - Per-level speed: +4% → +5% (gentle scaling on top of campaign mult)
    - Per-level points: +15% → +20% (reward keeps up with risk)
    - Campaign-wide speed multiplier: 0.65→2.17 → 0.60→2.50 across waves 1–20
  - **Asteroid HP scaling steepened**: +18% → +23% per level (wave 20 rocks ~3.07× base HP, was 2.6×).
  - **Late-wave roster trimmed** so the steeper HP/speed scaling — not raw entity count — is what makes endgame hard, keeping perf solid:
    - Waves 6–9: asteroid count cut by 1, total enemy count down by ~1 per wave.
    - Waves 11–14: asteroid count cut by 1, enemy count cut by 1–2 per wave.
    - Waves 16–19: asteroid + enemy counts both cut. Wave 19 dropped from 9 enemies → 7.
    - Final boss (Wave 20): 4× TITAN + 2× GUARDIAN + 2× SENTINEL → 3× TITAN + 1× GUARDIAN + 2× SENTINEL.

---

## [5.54.7] - 2026-05-03

### Added
- **Enemies actively steer around asteroids.** The previously-disabled `avoidAsteroids` AI hook is re-enabled and tuned: detection threshold now factors in BOTH the enemy's and the asteroid's radii (plus a 70-px buffer) so a small enemy near a large rock starts dodging early; force scales inversely with distance (gentle at threshold, strong near impact); skips warping / death-flashing asteroids; capped at 1.7× the enemy's base speed so stacked pushes can't fling the enemy across the field. Bumped from 0.08 → 0.14 force for decisive clearing.
- The existing enemy-vs-asteroid collision handler already deals no damage to either party (the "No damage to enemy" / "No enemy destruction" path) — it only transfers momentum + rotation. Behavior preserved: enemies and asteroids can bump into each other without dealing damage; AI just tries hard not to.

---

## [5.54.6] - 2026-05-03

### Removed
- **Asteroid-vs-asteroid collision response.** The elastic-bounce + positional-overlap-displacement pass on every overlapping pair was producing visible shifts/jumps every frame two rocks touched (especially right after a split, where fragments would jam into each other). Asteroids now overlap freely. They still register all other collision paths intact: player, bullets, lance beam, mines, nova, lightning, missiles, enemies. Just no rock-on-rock pushing.

---

## [5.54.5] - 2026-05-03

### Changed
- **Powerup pickup description now uses Press Start 2P (matching the name).** Same pixel font as the wavy title above it. 14px is the largest size that keeps the longer blurbs (~40 chars) on one line while still being chunky-pixel legible. Stroke 4 + shadowBlur 6 halo preserved for contrast on any background.

---

## [5.54.4] - 2026-05-03

### Changed
- **Powerup pickup description is much more legible.** Bumped from 13px Silkscreen (nearly invisible against the busy starfield/effects) to 22px Arial. Stroke width 3 → 5, soft black `shadowBlur: 6` halo behind the stroke for additional contrast, and the descY offset bumped 28 → 38 to clear the larger title's wave amplitude.

---

## [5.54.3] - 2026-05-03

### Fixed
- **Powerup pickup descriptions actually surface now.** The 5.54.2 fix added descriptions to `getPowerupConfig`, but the actual pickup path uses `POWERUP_TYPES[type]` (which already had description fields). The real bug was the engine dispatcher: `showPowerupDisplay(name, color)` only forwarded TWO args, dropping the third `description` arg even though `combat.showPowerupDisplay` accepted it and the HUD render code consumed it. Engine method now forwards all three args.
- **Title-screen launch animations stay centered on the actual title.** Two issues compounded into a leftward bias on every animation:
  - `_measureLetterPositions` returned each letter's left-edge x; `_titleLetterDraw` then re-rendered a single-char `drawWavyText` whose internal `textAlign='center'` shifted it half-a-letter-width further left. Fix: helper now returns the letter's visual center (left edge + width/2) so the static and animated rendering perfectly overlap.
  - Wave / cascade / warpdrive used a hardcoded `baseSpacing = 70` and a `+6` rightward bias for layout, then scaled outward against `centerX` — but the actual title row sits at `centerX + 10` (an optical-alignment nudge in the static rendering), so the row's expansion was asymmetric. All three animations now read positions directly from the static-title `staticPositions` array and scale outward from the row's own midpoint (`(staticPositions[0].x + staticPositions[N-1].x) / 2`), so the row stays symmetric throughout the zoom.
  - Twister, explosion, and pinwheel all projected toward `(centerX, centerY)` instead of the title's actual center. They now project toward the title midpoint so the column / explosion / ring is anchored on the static title.
  - Explosion was using fully-random per-letter directions, which could cluster the burst toward one side. Now evenly distributes the N letters around the unit circle plus a small per-letter jitter so each launch still varies but the spread is balanced.

---

## [5.54.2] - 2026-05-03

### Fixed
- **Powerup pickup blurbs now actually show.** The HUD's `drawPowerupDisplay` was already wired to render `powerupDisplay.description` under the powerup name, and `collectPowerup` was already piping `powerup.config.description` into it — but the configs returned from `getPowerupConfig` had no `description` field, so the blurb was always empty. Added a one-line description for every powerup type (Shielding, Rapid Fire, Multi Shot, Afterburner, Big Bullets, Piercing, Explosive, Homing, Medpack, Health Boost, Triage, Critical Chance, Critical Damage, Long Range, Charge Speed, Charge Power, Health/Money Orb Luck/Bounty, Doctor, Payday, High Roller) plus a passthrough for weapon/skill upgrades that already carry `description` in weapon-data.js.

---

## [5.54.1] - 2026-05-03

### Added
- **Title-screen lens-flare nebula now also rotates with parallax.** `nebulaRenderer.draw()` takes an optional `rotation` (radians) plus `viewW/viewH` for the on-screen pivot, and rotates each layer about the viewport center scaled by `layer.depth` — so the closest layer (depth 0.65) rotates about 4.5× more than the deepest (depth 0.00), matching the parallax-drift depth feel rotationally as well as positionally. The title-screen update branch drives it with a slow combined-frequency oscillator (≈35s and ≈90s periods) summing to a ±0.19 rad swing, so the lens flare stars tumble gently without ever spinning fast enough to distract.

---

## [5.54.0] - 2026-05-03

### Changed
- **Weapon effects across the board are now significantly more epic.**
  - **Seeker mine explosion**: 5 staggered shockwave rings (was 3) including a white-hot ring and a cyan energy-core ring; shrapnel doubled (22 → 44) with white/cyan/orange-bright color rotation; small particles 18 → 32; embers 12 → 24; new sparkle dust pass (22 specks); secondary cookoff doubled with its own mini flash; new late-game ember rain at +280ms for an afterglow tail. Camera kick 9 → 14, screen shake 8/4 → 14/7, hitstop 4 → 6, screen-flash alpha 0.06 → 0.12.
  - **Lance Beam**: per-frame ionized-air glitter spawns along the beam path (~55% / frame); bright muzzle hotspot at the player's gun mouth; per-hit spark burst on every enemy contact (3 streaks + bright impact flash, throttled per-enemy); per-hit asteroid sparks colored from the rock's own HSL family.
  - **Lightning Arc**: each chain target gets a bright impact flash + 8-spark cyan/white/purple burst + 4 trailing embers; 3 sparkle motes glitter along each segment between links so the bolt path itself shimmers.
  - **Nova Blast**: wavefront crackle — 3-5 sparkles/embers spawn around the ring perimeter every frame; first-frame core flash (size 80) + 14 directional sparks at the origin so the nova has a real "bang" point; per-target impact flash + 6-spark burst as the wavefront crosses each enemy.
  - **Missile impact**: flash size 24 → 36; new ring wavefront; shrapnel 8 → 16 with 4-color cycle; embers 4 → 10; sparkle dust pass; small camera kick + screen shake.
  - **Primary bullet hits (asteroid + enemy)**: shrapnel pieces bumped (4 → 7 / 5 → 8); embers doubled; flash radius bumped 35-40%; sparkle motes added on most hits.
- **MAX_PARTICLES raised 50 → 220** so the pool can hold the new burst sizes without auto-evicting the very particles that just spawned. QA tests updated to spawn 400 and assert ≤ 230.

---

## [5.53.2] - 2026-05-03

### Fixed
- **Cooldown-based power weapons' charging glow now persists through the fully-charged state.** The dispatch site in `player/renderer.js` was guarded by `else if ((this.powerCooldown || 0) > 0)`, so the moment the cooldown reached zero (weapon ready to fire) the glow disappeared entirely — the exact opposite of the charge shot, whose bright ring sustains while fully charged. The gate is removed: cooldown-based weapons (Mine Layer, Nova Blast, Lightning Arc, Missile Salvo) now render the glow continuously — building up as the cooldown elapses, then sustaining the bright fully-charged pulse (powered by `drawChargingGlowCore`'s `isFull` branch) until the player fires, after which the cycle restarts. Now identical to the charge shot's behavior.

---

## [5.53.1] - 2026-05-03

### Added
- **Lens-flare nebula parallax on the title screen.** The nebula renderer's `draw()` now accepts an optional `(driftX, driftY)` offset that's applied per-layer scaled by `layer.depth` — closer layers drift more, deepest barely moves — so the lens flare stars wander even when the camera is fixed. The title-screen update branch integrates the existing sandstorm drift vector into a low-multiplier (0.18×) accumulator and feeds it as that drift offset, so the lens flare layers parallax in the same direction as the foreground starfield but at a much slower rate. The accumulator is clamped to ±8000 px to keep numerics tidy across long title-screen visits.

---

## [5.53.0] - 2026-05-03

### Added
- **Post-init fade-in to the playfield.** When the title launch animation finishes (screen fully black), `init()` now arms a 700ms black-to-clear overlay that fades in to reveal the player on the empty playfield. After a brief orientation beat (≈400ms), the wave-1 entities warp in. Picks up exactly where the title fade-out left off so the screen never flashes between title and gameplay. Wave 1 timeline is now: 0-700ms fade in → 1100ms spawn entities + grant invincibility → 3400ms state → PLAYING.

### Changed
- **Title launch animation reuses the static title's letters.** Each launch animation now receives the per-letter screen positions of the idle "RAINBOIDS" title (measured from the same `drawWavyText` rendering geometry) and lerps every letter from its static position into the animation's pose over the first 250ms. The on-screen letters appear to BECOME the animation rather than disappearing as a new set of letters spawns elsewhere. Subtitle ("SUPERCHARGED ASTEROIDS"), "PRESS ANY KEY TO START", and the survival-record line stay rendered throughout the launch — they no longer vanish when the animation begins.
- **Cascade animation reworked into a bounce-wave.** The old cascade (letters falling from above with staggered start) implied letters that didn't yet exist, which fought the "use existing letters" rule. The replacement is a bounce-wave ripple: each letter pops up ~78px and back down with a damped sine, staggered left-to-right at 70ms per letter, then the row zooms toward the camera.
- **Title-screen starfield is now a sandstorm.** Replaced the slow ellipse-pattern drift with a multi-frequency chaotic vector — three sine/cosine waves at distinct frequencies sum into a fast, direction-shifting motion. Near-depth stars rip across the field while far ones drift more gently thanks to the existing parallax factor, giving the screen a swirling-sand feel.

---

## [5.52.1] - 2026-05-03

### Changed
- **Asteroid warp-in subtler and more nuanced.** Asteroids are passive rocks, not energy-projectile arrivals — the previous warp shared the enemy's bright streak with white-hot tip and saturated halo, which felt too "energy-y" for them. The trail now stays in the asteroid's own HSL hue family the entire way (no white tip), the streak is shorter (peak length ~4× the rock vs 11× before), the trail alpha caps at 0.28 (was full opacity), the halo alpha caps at 0.14 (was 0.35), and the scale ramp opens at 0.5 instead of 0.15 so it reads as a quiet phase-in rather than a hard zoom. Warp duration tightened from 700-1500ms to 600-1300ms so rocks don't linger.
- **HUD primary/power weapon squares larger with rounded corners.** Square size 38 → 50 (≈31% larger), corner radius 12, gap between PRM and PWR widened from 8 → 12 to keep proportional breathing room. Label sits 14px below the square (was 12) to match the new size. The cycle-animation glow now strokes a rounded path so the highlight matches the square geometry. Group-X and group-Y anchors unchanged so the squares still align with the gold/coin display directly above.

---

## [5.52.0] - 2026-05-03

### Added
- **Wave-start invincibility grace window.** When wave entities spawn (700ms into the wave intro), the player is given 3000ms of invincibility — long enough for the 700-1500ms warp-in to complete plus a beat to orient. Stops the player from being ganked by enemies finishing their warp-in animation right on top of them. Applies to wave 1 and every subsequent wave start.
- **Six title-launch animations, picked randomly.** triggerTitleStart now rolls one of `{twister, explosion, wave, cascade, warpdrive, pinwheel}` and seeds per-letter random data so each press feels fresh:
  - **Twister** (existing) — letters orbit a vertical axis with 3D perspective; column hurtles toward the camera.
  - **Explosion** — letters cluster at center, then fly outward in random 3D directions while spinning; trajectories bias toward the camera so the debris rushes the viewer.
  - **Wave** — horizontal letter row oscillates vertically; both amplitude (14 → 144px) and frequency build as the wave thrashes harder, then the row zooms toward the camera.
  - **Cascade** — letters drop from above the screen with staggered start times, rotating as they fall; once landed, the row zooms toward the viewer.
  - **Warpdrive** — letters streak inward from the screen edges along straight-line vectors, converge in a row at center, then the title zooms in. Like dropping out of hyperspace.
  - **Pinwheel** — letters arranged in a ring spin around screen center; the ring radius pulses, then collapses inward as the camera zooms.

### Changed
- **Wave intro dark overlay disabled.** Both call sites of `drawWaveIntroOverlay` are commented out so the warp-in animations stay visible during wave starts. Re-enable by uncommenting either call. (The `drawWaveIntroOverlay` function itself is preserved.)

---

## [5.51.1] - 2026-05-03

### Changed
- **Title launch animation reworked into a twister.** Replaced the "spiral the whole title then zoom" treatment with a per-letter twister: each letter of RAINBOIDS orbits a vertical screen-center axis at staggered heights with proper 3D perspective projection (focal length 600), so front-facing letters appear large while back-facing letters fade and shrink. Phases:
  - **0–1100ms — twister formation**: letters spin around the column at 5.5 rad/s; orbit radius eases from 240 → 132 as the column drifts 45% closer.
  - **1100–1500ms — zoom collapse**: orbit radius collapses from 132 → 0 while the column hurtles 95% of the way to the camera; per-letter perspective scale rockets.
  - **1500–1900ms — fade**: final approach + black wash overlays the screen, fading the last sliver of the twister out.
  Total duration 1900ms (was 1700ms). Letter alpha is depth-driven so the back-arc letters dim naturally as they orbit away from the viewer, giving the column visible front/back rotation depth instead of a flat ring.

---

## [5.51.0] - 2026-05-03

### Added
- **Animated parallax starfield on the title screen.** The starfield + nebula now generate at engine `start()` (before the title screen renders) and the camera anchors at the gameField center. A synthetic ellipse-pattern drift driven from `update()`'s new TITLE_SCREEN branch keeps the field gently wandering, with each depth layer parallaxing at its own rate via the existing background-star parallax factor. The title text and "PRESS ANY KEY" pulse render on top of the live starfield instead of a black void.
- **RAINBOIDS launch animation when the player presses a key.** The press fires a 1700ms cinematic intro before the actual run starts:
  - **0–700ms — spiral**: the title sweeps two full turns around the screen center while the orbit radius eases from 220px → 0, knotting tighter with each frame.
  - **700–1200ms — zoom**: scale rockets from 1.0 → 6.0 as the title hurtles toward the viewer.
  - **1200–1700ms — fade**: scale grows further while a black wash climbs to full opacity, taking over the screen.
  - When the fade reaches full at 1700ms, `init()` fires and the wave-1 intro overlay (already opaque from frame 1) hands off seamlessly. As the entities warp in and the wave-1 overlay fades out, the player gets a smooth reveal of the playfield.

### Changed
- `start()` now pre-builds the parallax starfield + nebula and centers the camera on the gameField so the title screen has a real animated backdrop.
- Title-screen draw skips the entity / HUD passes (player ship, minimap, powerup HUD, etc.) since pools are empty pre-init and the player ship would otherwise sit at the center of the menu.
- Press-to-start (keypress / click on the title screen) now triggers the launch animation via `gameEngine.triggerTitleStart(callback)`; `init()` runs from the animation's onComplete callback instead of synchronously, so the cinematic plays before gameplay begins.

---

## [5.50.1] - 2026-05-03

### Fixed
- **Flash of game world before the wave intro overlay.** The intro overlay was fading IN over 500ms from alpha 0, which meant the first ~30 frames of the wave transition rendered the world (or shop background) through a near-transparent layer — read as a flash. The overlay now snaps to full opacity on the very first frame of the wave intro; only the fade OUT at the end is animated, so the player gets a clean cut to black followed by a smooth reveal of the warped-in entities.

---

## [5.50.0] - 2026-05-03

### Added
- **20-wave speedrun campaign with four boss waves.** The run is now a single 20-wave arc — meta-goal is "finish as fast as possible." Bosses at waves 5 (Iron Giant — TITAN bossTier 1), 10 (Twin Iron — 2× bossTier 2), 15 (Triple Threat — 3× bossTier 3), and 20 (FINAL BOSS — The Last Stand — 4× bossTier 4 + escorts). Boss enemies receive HP/size/speed multipliers on top of normal level scaling (4×–8× HP, 1.35×–1.75× size, +0–15% speed). When the final wave clears the run transitions to the new GAME_COMPLETE state instead of opening the shop.
- **Game Complete stats screen.** New `GAME_COMPLETE` state renders a dark-backdrop full-screen panel with: total run time (headline stat — speedrun framing), accuracy %, total shots fired, shots on target, damage dealt, damage taken, enemies killed, asteroids destroyed, bosses defeated, coins earned, and preferred weapon (most-fired primary).
- **Run-wide stats tracking.** Every run now tracks: shots fired (per primary weapon), shots that hit, total damage dealt, total damage taken, enemies/asteroids/bosses killed, coins earned, and elapsed time. Stats reset at run start; consumed by the Game Complete screen.

### Changed
- **Wave roster compressed from 100 → 20 waves.** Replaced the multi-act 100-wave roster with a tight 20-wave campaign: Acts I (1-4), Boss 1 (5), II (6-9), Boss 2 (10), III (11-14), Boss 3 (15), IV (16-19), Final Boss (20). Each act has a clear identity, and the final act puts every enemy type on screen at once before the closing boss rush.
- **Scaling re-tuned for a 20-wave arc.** Enemy level now equals wave number (1 → 20 directly, no plateaus). Asteroid level lifts every other wave (1 → 10). Per-level multipliers compressed so the cumulative end-state still feels meaningful at wave 20: enemy HP +10%/level (≈2.9× at wave 20), enemy points +15%/level, asteroid HP +18%/level. Campaign-wide enemy speed multiplier curves from 0.65× at wave 1 to 2.17× at wave 20 — gentle intro, fast late game. Enemy bullet speed scales with the same curve so projectiles match their owners.
- **Enemies never stand still.** Idle states for WASP fish-dart, STALKER knight-move, DRIFTER laser-charge, and TITAN boulder no longer decay velocity to zero — each enemy maintains a slow orbital strafe around the player even between bursts of "real" movement, so the player has to track them every frame instead of ignoring them between actions.

### Fixed
- DRIFTER enemies used to lock to a dead-stop while charging or cooling down their laser, which made them feel asleep. They now slow-strafe around the player throughout charge/cooldown.
- TITAN bosses no longer come to a complete halt between charges — the brake state seeds a fresh orbit sign and the idle state drives a slow tangential drift.

---

## [5.49.9] - 2026-05-03

### Added
- **Wave-start dark intro overlay.** WAVE_TRANSITION now renders a full-screen near-opaque dark overlay with the wave title (and pithy subtitle) dead center. The overlay fades in over 500ms, holds for the wave's spawn-and-warp window, then fades out over 700ms (total intro = 2800ms). The existing top-of-screen wavy text is reserved for shorter notifications (WAVE COMPLETE, queued toasts) — wave starts get the cinematic centered treatment.
- **Asteroid warp-in entry animation.** Asteroids now warp in like enemies — streak gradient, scale ramp, and brief soft halo at the materialization point. The streak color is sampled from the asteroid's own HSL palette so each rock's entry feels coherent with its body color. Warping asteroids skip player/bullet/enemy/asteroid/lance/mine/nova/missile collisions while warping (they're not "really there" until the warp finishes).

### Changed
- **Refined warp-in animation — smoother, with scale.** Replaced the cubic-ease-in-then-snap "Star Trek" curve with smoothstep position interpolation (no hard arrival snap) and an ease-out scale ramp from 0.15 → 1.0. Entities now grow visibly as they warp in instead of flashing into existence at full size. Warp duration baseline lifted to 700-1500ms (was 400-1200ms) so the scale-in reads clearly. The streak's stretch intensity follows `sin(πt)` so it peaks at the smoothstep's max-velocity midpoint and tapers smoothly at both ends, and the bright "snap" arrival flash is replaced with a soft halo that fades alongside the streak.
- **All asteroid spawn paths now use warp-in.** Wave-start asteroids warp into the visible viewport from just outside the closest viewport edge (220-380px) so the pre-wave dark overlay fades to reveal them already on-camera. Continuous in-wave spawns and force-spawn / cheat asteroids warp from outside the gameField edge to a random target inside the play area's middle 60%. The previous "drift in slowly from off-map" behavior is gone — every asteroid arrival is now a deliberate warp event.
- **Wave intro timing reordered.** Wave-start spawning now fires at t=700ms (overlay near peak darkness) instead of t=2000ms, so the 700-1500ms warp animation finishes during the overlay's fade-out window. State flips to PLAYING at t=2800ms.

---

## [5.49.8] - 2026-05-03

### Changed
- **Wave-start asteroids and enemies now spawn inside the visible viewport.** Previously wave-start entities were placed at the gameField edges (asteroids 120–240px, enemies 200–400px outside the 1920×1080 world) and had to drift / warp in. If the player was moving at the moment the wave kicked off, those entities would pop onto the screen mid-warp or appear well behind the player. Wave-start spawning now picks positions inside the camera's current viewport at a safe minimum distance from the player (220px+ radius for asteroids, 260px for enemies), avoiding the minimap overlay, with an inner edge pad so nothing spawns flush against the screen edge. Enemies still warp in, but the warp source is now just outside the closest viewport edge (220–380px) so the streak is brief and visually anchored to the screen — they're already on-camera from frame one of the wave. Continuous in-wave spawns and cheat-key spawns keep the original off-gameField behavior so they still feel like they're entering from far away.

---

## [5.49.7] - 2026-05-02

### Changed
- **Nebula renderer simplified to lens-flare stars only.** All blob, halo, and core gas-cloud rendering passes removed. Each parallax layer now bakes only bright pinpoint stars with soft halos and 4-arm diffraction spikes — the dark canvas shows through between them instead of being washed by a haze of overlapping gas fields. Star counts cut sharply (6 / 9 / 12 / 16 across the four parallax depths) so the lens-flare stars read as sparse accents sprinkled across the void rather than a dense field.
- **Background and color star brightness raised.** `depth-batch-renderer` opacity floors bumped (background 0.4 → 0.7, color stars 0.5 → 0.8) so even far-depth stars are clearly visible. `background-star` radius scales increased and brightness baseline lifted to 230-255, with the twinkle amplitude tightened to 0.10-0.20 — stars stay consistently bright instead of fading to half-visible at the bottom of each twinkle cycle. No new draw calls; depth-bucket batching path unchanged.
- **Charging body-glow now plays for every power weapon.** Previously only `CHARGE_SHOT` showed the building cyan-blue body glow while charging. Cooldown-based powers (Mine Layer, Nova Blast, Lightning Arc, Missile Salvo) now show the same animated glow as their cooldown elapses — progress derived from `1 - powerCooldown/powerCooldownMax`, transitioning through "charging → basic charged → fully charged" states with matching pulse speeds and ring/spark effects. The shared rendering body is factored into a single `drawChargingGlowCore` helper consumed by both `drawChargingEffects` (charge-based) and the new `drawCooldownChargingEffects` (cooldown-based); dispatch picks one or the other based on the active power weapon's `isChargeBased` flag.

---

## [5.49.6] - 2026-05-03

### Removed
- **All "haze" passes from the nebula renderer.** Cumulatively they were laying a uniform fog over the entire canvas. Gone:
  - **Stardust speckles** — 30-90 tiny dots per layer biased to blob interiors. `_drawStardust` deleted.
  - **Filament threads** — 12-22 short streaky bright gradients per layer. `_drawFilament` deleted.
  - **Dust lanes** — 0-3 dark absorbing silhouettes per blob. `_drawDustLane` deleted.
  - **Wisps** — bowed gradient chains connecting blob centers. `_drawWisp` deleted.
  - **Sky tint** — faint full-canvas radial wash per layer. `_drawSkyTint` deleted.
- LAYER_CONFIG fields removed: `speckles`, `speckleAlpha`, `wispCount`, `dustLanesPerBlob`, `filamentCount`.

### Result
- Each nebula layer now renders only **structured passes**: blob bodies (with shadow + body + edge halo + hot core, density-profile mix, ellipse asymmetry, palette-pool sampling, HSL jitter — all preserved) and the **lens-flare embedded stars** (bright pinpoints with halos and 4-pointy diffraction spikes). Blobs sit cleanly on the dark canvas instead of bleeding through a global haze.

---

## [5.49.5] - 2026-05-03

### Added
- **Nebula realism pass — embedded stars, dust lanes, filament threads.** Three new render passes per layer that turn the gas fields from "smooth color blobs" into something that reads as a real space photograph.
  - **Embedded stars** (6-12 per layer, biased to blob interiors) — bright pinpoint cores with soft halos and 4-arm diffraction spikes (cross pattern, random rotation per star). Star colors mix 70% hot blue-white / 20% palette accent / 10% highlight; the brightest stars get a hot white center pixel. THE iconic "this is a space photograph" cue.
  - **Dust lanes** (0-3 per blob, denser on near layers) — dark elongated absorption silhouettes painted *over* the gas, mimicking the dust lanes that bisect Trifid / Eagle / Lagoon-type emission nebulae. Drawn as a long thin ellipse with a shadow-color radial gradient that fades at the ends.
  - **Filament threads** (12-22 per layer) — short streaky bright gradients tangent to blob outer edges, where shock fronts produce thin filament structures in real nebulae. Sampled tone, ellipse-stretched, biased to the outer 0.55-1.05× radius.

---

## [5.49.4] - 2026-05-03

### Changed
- **Nebula color richness pass — pool sampling + per-blob HSL jitter.**
  - Each scene palette now declares **6-7 body tones + 2-3 accents** instead of fixed primary/secondary/tertiary/accent slots. Per-blob renders pick 3 distinct random tones for the gradient stops + 1 random accent for the halo, so different blobs in the same scene have visibly different color personalities while staying in the family.
  - **Per-blob HSL hue/saturation/lightness jitter** (±15° hue, ±0.08 sat, ±0.05 light) shifts the picked colors before drawing — even the same triplet won't render identically twice. Sub-blobs within a blob get a small additional jitter on top so the volumetric layering reads as naturally varying gas, not flat repeats.
  - **Two new scene palettes**: `twilight-spectrum` (multi-hue blue→violet→pink dusk) and `solar-corona` (burning yellow/orange/red-hot). 10 total palettes.
  - **Body gradient widened to 6 stops** (was 4) — smoother transitions through the 3 sampled tones.
  - **Hot core now blends `highlight + inner tone`** instead of always neutral white, so the nucleus inherits palette identity.
  - **Wisps and sky tints sample tones randomly per render** rather than always using primary/secondary/tertiary, so connecting filaments and the layer wash also vary in color.
  - **Speckles**: 75% pure white / 18% random accent (from the accents pool) / 7% highlight — colored stardust diversifies the field.

---

## [5.49.3] - 2026-05-03

### Changed
- **Nebula refinement pass — depth, asymmetry, and detail.**
  - **Two new scene palettes**: `emerald-jade` (rare verdant accent) and `rose-petal` (gentle pink/magenta), bringing the total to 8.
  - **Per-palette `accent` color** added to every scene palette; used for chromatic edge halos around blobs and 15% of speckles, so the gas has visible color complexity rather than a single hue ramp.
  - **Sky tint per layer** — faint full-canvas radial wash in the layer's secondary color anchors each layer in the palette and prevents detached-patches feel. Strength scales with layer luminance.
  - **Density profiles per blob** — each blob is randomly assigned `bright` (25%, vivid + halo + hot core), `normal` (55%, the workhorse), or `haze` (20%, oversized + dim + no core). Visual rhythm replaces the previous uniform brightness.
  - **Elliptical sub-blobs** — sub-blobs now render as ellipses with random aspect (0.6× to 1.6×) and random rotation, not perfect circles. Overall nebula shape reads as gas/cloud rather than bubbles.
  - **Edge halos** — thin chromatic ring at the outer 22% of bright/normal blobs in the accent color. Adds silhouette interest.
  - **Stardust variety** — speckle colors mix 80% pure speckle / 15% accent / 5% highlight; sizes mix 70% small / 25% medium / 5% bright stars (with a tiny corona on the brightest).

---

## [5.49.2] - 2026-05-03

### Changed
- **Nebula generation rebuilt for stronger parallax, depth, and palette consistency.**
  - **Strong parallax**: layer depth range expanded from 0.02–0.12 (max ~12% relative motion) to **0.0–0.65** (5.4× stronger). Far layer is now fully locked to camera; near layer moves at 65% of camera speed. Player movement actually parallaxes the background.
  - **One palette per scene**: `generate()` commits a single `SCENE_PALETTES` entry (cobalt-deep / violet-nursery / teal-aurora / ember-warmth / periwinkle-dream / crimson-ultraviolet) and every layer + blob + wisp + speckle pulls from it. No more per-sub-blob palette mixing that produced clashing color salads.
  - **Per-layer atmospheric perspective**: each of the 4 layers gets a `lumMul` (0.45 / 0.65 / 0.85 / 1.00) that shades the scene palette darker for far layers, brighter for near layers — sells "this is depth, not just stacking."
  - **Faux-3D blob structure**: each blob now renders in 3 passes — shadow body (offset, dark, oversized), main body (multi-stop palette gradient), and a small bright off-center hot core. Layered together they read as volumetric clouds rather than flat radial disks.
  - **Filament wisps**: 1–4 elongated soft gradient chains per layer connect random pairs of blob centers along bowed paths, suggesting gas streams between density peaks.
  - **Stardust speckle**: 30–90 tiny dots per layer biased toward blob centers (sqrt-distance distribution for higher density at the core), giving the gas a grainy texture.

---

## [5.49.1] - 2026-05-03

### Changed
- **Powerup acronym refinements** — bumped 6 to 4 letters where the 3-letter form was unclear or ambiguous: `SHD → SHLD`, `CRT → CRIT`, `CDM → CDMG`, `EXP → EXPL`, `KBK → KNCK`, `AFB → BURN`. The other 14 stay at 3 letters.
- **Lance Beam tuned for "low DPS, long uptime."** Per-frame damage halved (0.15 → 0.06; 9 dps → 3.6 dps), beam duration 5× longer (400ms → 2000ms), cooldown bumped 1200ms → 2200ms. The beam stays on far longer per activation but chips at targets gently — feels sustained rather than burst-y. Description updated to "Sustained energy beam — low DPS, long uptime".

---

## [5.49.0] - 2026-05-03

### Removed
- **All jsfxr-generated SFX gone.** `js/modules/audio/sound-defs.js`, `tools/scripts/generate-sfx.js`, `tools/scripts/probe-audio-polyphony.mjs`, and the entire `sfx/` directory (manifest + 28 WAVs) deleted. They were causing audio glitches in flight. The `AudioManager` class is preserved as a no-op silent layer so every `playShoot()` / `playHit()` / `playSound(name)` call short-circuits without touching the audio context. Background music continues to play via `MusicPlayer` and `HTMLAudioElement`. External WAV assets will be wired into `playSound()` later.

### Fixed
- **Lance Beam now actually damages and pushes asteroids.** `checkLanceBeamCollisions` previously only hit enemies. It now sweeps the same point-to-line test against the asteroid pool, applies damage, sets a hit-flash, and shoves each hit asteroid forward by `0.4 px/frame × knockMul × 0.6` (gentler than enemies because asteroids are heavier). Lethal damage routes through `destroyAsteroid` for the proper destruction sequence. Snapshots `asteroidPool.activeObjects` before iterating so spawned fragments don't enter the same scan.
- **Lance Beam grows in instead of popping on at full size.** `weapon-effects-renderer` now reads `beamMaxDuration - beamTimer` to derive a 0→1 ease-out cubic over the first 150ms, scaling both width and reach. Beam line is also broken into 6+ jagged zig-zag segments with perpendicular jitter — sustained sister of the lightning-arc visual.
- **Stale benchmark suite paths fixed.** Imports under `tools/benchmark/scripts/*.bench.js` referenced `../../js/...` which resolved to `tools/js/...` (one level too shallow). Bumped to `../../../js/...`. All 7 microbenchmarks now run cleanly.

### Changed
- **Bottom-of-screen powerup HUD is compact** — full names replaced with 3-letter abbreviations (RPD, MUL, HOM, BIG, AFB, PRC, EXP, CRT, CDM, SHD, RNG, KBK, MED, DOC, PAY, HRL, HLK, GLK, HBT, GBT). New `abbr` field on each entry in `POWERUP_TYPES`; the HUD reads it (with a fallback to `name.slice(0, 3).toUpperCase()`).
- **Hover tooltip on each HUD powerup badge.** `data-tooltip="Full Name — full description"` set in `syncPowerupHUD`; CSS `:hover::after` pops a 12px Silkscreen panel above the badge with an arrow pointer (zero delay, mirrors the music-player tooltip pattern).
- **Powerups pause-menu cards now show "Name (ABV)"** so the player learns the codes that show up on the HUD.

### Tests
- Unit suite: 68/68 passing.
- QA smoke suite: 95/95 passing.
- All 7 microbenchmarks run cleanly.

---

## [5.48.0] - 2026-05-03

### Changed
- **Bullet-hell pass: frenetic intro, faster economy, faster scaling.**
  - **Enemy HP slashed across the board** (~30-40% off the 5.45-era values): Hunter 5→3, Wasp 4→3, Weaver 5→3, Stalker 6→4, Drifter 7→5, Bomber 8→6, Sentinel 8→6, Guardian 10→7, Prowler 11→8, Titan 18→12.
  - **Asteroid HP halved**: big tier 4-7 → 3-5, medium 2-4 → 1-3, small now one-shot (was 1-2).
  - **Enemy reward points bumped ~60%** so kills feed the economy fast: Hunter 75→120, Wasp 60→100, Stalker 80→130, Weaver 100→160, Bomber 100→160, Drifter 120→180, Guardian 120→200, Sentinel 140→220, Prowler 150→240, Titan 200→320.
  - **XP gain doubled per hit** (asteroid 2→4, enemy 3→6) and kill-XP ratio bumped (was `points/5`, now `points/3`) — the player levels up quickly enough to engage with skills/upgrades within the first few waves.
- **Early waves are now dense.** Wave 1: 6 asteroids + 3 hunters (was 2+1). Waves 2-15 scaled accordingly — 8-11 asteroids, 3-5 enemies each. Steeper feel, more pressure, designed to push the player into the shop early for upgrades.
- **Difficulty scaling is steeper**: enemy level now climbs every 3 waves (was every 5); per-level enemy stats grow 25% HP / 15% speed / 20% points (was 20/10/20).
- **Concurrent caps raised** to support the density without choking: `MAX_ASTEROIDS` 4 → 16, `MAX_WAVE_ASTEROIDS` 12 → 16.

### Tests
- `tests/unit/wave.test.js` updated for the new wave-data shape — strict per-phase enemy-type counts replaced with average-of-phase assertions, MAX_WAVE_ASTEROIDS bumped to 16, procedural-types test scoped to `> 100` only.
- `tests/qa/05-entities.spec.js` — explosion-particle test now drains the pool first so `MAX_PARTICLES` saturation can't make `before === after`.
- `tests/qa/06-pools.spec.js` — release-back-to-pool test rewritten to compare `freeAfterGet` vs `freeAfterRelease` rather than relying on initial pool length being zero.
- `tests/qa/07-weapons.spec.js` — shop-tab tests rewritten for the new layout (5 tabs: HELP/PRIMARY/POWER/DEFENSE/SKILLS, no OFFENSE/DROPS, DOM-based selectors), weapon-purchase tests removed (weapons equipped from pause menu, not bought from shop), Tab-cycle test added.

### Test results
- Unit suite: **68/68 passing**.
- QA smoke suite: **95/95 passing** in ~2:20.

---

## [5.47.1] - 2026-05-03

### Fixed
- **Game no longer skips straight to wave 2.** Two race conditions in the wave-start sequence were letting `checkWaveComplete` see `state === PLAYING && totalEnemies === 0 && !waveComplete` for a moment before the wave's enemies actually spawned, instantly declaring the wave complete and popping the shop for wave 2:
  - `init()` set `state = PLAYING` early on line 382 before later flipping to `WAVE_TRANSITION` on line 435. Now `init()` lands in `WAVE_TRANSITION` directly.
  - The wave-1 spawn timer (and the per-wave `startNextWave` timer) flipped state to `PLAYING` *before* calling `spawnWaveEntities()`. Order swapped — spawn first, then flip state — so the wave-complete check can never observe the empty-pool window.

---

## [5.47.0] - 2026-05-03

### Changed
- **Mine Layer renamed to Seeker Mines.** Description: "Magnetic seekers that hunt and detonate". Mines now actively pursue enemies and asteroids and self-detonate if they fail to make contact.
- **Seeker behavior**: once armed, each mine acquires the nearest enemy/asteroid within 360px and steers toward it via smooth angle interpolation. Slow creeper speed (`MINE_MAX_SPEED = 1.4 px/frame`, `MINE_ACCEL = 0.06`, `MINE_TURN = 0.08`). Re-acquires when its target dies; drifts with a gentle 0.95 drag if no target is in sight. Magnetic pull on nearby entities still applies — mines and targets converge from both sides.
- **12s self-detonation lifetime** with a 2s urgent-blink telegraph at the end. `mine.lifeTimer` ticks down once armed; when it hits 0 the mine sets `mine.expired = true` and `collision-system.checkMineCollisions` fires the same explosion path as a proximity trigger.
- **Renderer urgent state** in the last 2s of life: blink rate ramps from ~0.012 to ~0.052, casing tints toward red (`#3a0000` body, `#ff2200` stroke when blink-on), core pulses orange-red. Calm state and pre-arm visuals unchanged.

---

## [5.46.3] - 2026-05-02

### Changed
- **Missiles fan out from the ship's wings.** Per-slot launch position now offsets along the ship's perpendicular axis (`±9px × slot`), so each missile visibly leaves a different point across the wings instead of all spawning at the ship's center. Per-slot fan angle bumped 0.3 → 0.5 rad for a more dramatic spread.
- **Missile silhouette rebuilt as a proper rocket** with sharper nose cone, cylindrical body with a band, two swept-back aft fins (top + bottom, filled), and a small centered tail fin. Pulsing nose light + amber side LEDs preserved.
- **Missiles blink out as their range expires.** Mirrors the powerup-expiry blink — frequency ramps from ~2Hz at 800ms remaining up to ~14Hz right before the missile times out. `fireMissiles` stashes `maxLife: 3000` for any future range tuning.

---

## [5.46.2] - 2026-05-02

### Changed
- **Centered the "Click a weapon to equip it" hint** in the PRIMARY and POWER pause-menu tabs (added `text-align: center` to both `<div>` instances).

---

## [5.46.1] - 2026-05-02

### Fixed
- **Lightning Arc origin tracks the player ship.** The first chain link's `targets[0]` is now refreshed every frame from `player.x/y` during the 500ms visual window, so the arc visibly follows the ship as it moves instead of frozen at the cast position.

### Changed
- **Powerups menu moved back into the normal pause-menu tab strip** alongside Music / SFX / Skills. Removed the standalone `#powerups-overlay`, the `pause-powerups-button` action button, and the ESC-overlay handling. The Powerups pause-tab itself contains the OFFENSE / DROPS sub-tab row + card list and renders via `switchTab('powerups')`. Title centered.

### Removed
- **"Chiplight" track removed** from the music library (`music/chiplight.mp3` deleted, playlist regenerated → 67 tracks).

---

## [5.46.0] - 2026-05-02

### Added
- **`KNOCKBACK` powerup** — new offense pickup. +30% knockback per stack on **all** power weapons (Mine, Nova, Lightning, Missile), capped at 3×. Drives a new `Player.getKnockbackMultiplier()` method consulted by every collision handler that applies impulse.
- **All power weapons now apply knockback to enemies AND asteroids**:
  - Mine (already pushed) — multiplier-aware now.
  - Nova (already pushed) — multiplier-aware now.
  - **Lightning Arc**: each chain link nudges its target along the bolt direction (`6 × knockMul` for enemies, `0.6×` of that for asteroids). Visibly drags targets along the chain.
  - **Missiles**: hits push the target along the missile's heading (`9 × knockMul` for enemies, `0.6×` for asteroids).
- **Powerups overlay** — Shop-like page (`#powerups-overlay`) with **OFFENSE** and **DROPS** sub-tabs that lists every powerup type, owned or not, with stack counts. Cards show name, color-coded icon, description, and `×N` stack badge (or `—` for unowned). Driven by `UIManager.renderPowerupsOverlay()`.
- **Pause menu Powerups action button** — `pause-powerups-button` sits at the top of the pause menu alongside SHOP and RESUME. Clicking it opens the Powerups overlay. ESC closes overlay back to pause.

### Changed
- **All powerup pickups are now permanent and stacking** — no temporary timers. `Player.addPowerup` ignores the `duration` field on the config and treats every pickup as `isPermanent: true` with infinite `timeRemaining`. Drop powerups now persist for the rest of the run instead of expiring after 30s.
- **POWERUP_TYPES gained a `category` field** (`OFFENSE` or `DROPS`) on every entry. Drop-rarity values lowered across the board (rare permanent stacking — economy needed re-tuning to avoid runaway scaling).
- **Removed OFFENSE and DROPS shop categories.** The shop now only sells PRIMARY/POWER weapons, DEFENSE upgrades, and SKILLS. The corresponding offense/drops upgrades are picked up as permanent powerups in-game. SPARE_SHIP moved from OFFENSE to DEFENSE (still gold-priced). Updated both the DOM shop tabs (`index.html`) and the legacy canvas-renderer tabs list (`shop-renderer.js`).
- **POWERUPS pause-tab removed** from the tab strip — that view was promoted to a top-level overlay accessed via the new action button. The old `#powerups-tab` panel was deleted from HTML; `UIManager.updatePowerupsList()` is kept as a back-compat shim that calls `renderPowerupsOverlay()`.
- BIG_BULLETS description updated to reflect the additive `+1.5px per stack` behavior introduced in 5.40.15.

---

## [5.45.1] - 2026-05-02

### Fixed
- **Power weapons now produce full asteroid destruction (debris, color stars, orb drops, powerup chance, screen shake, fragmentation)** when they kill an asteroid, instead of the asteroid silently disappearing with just a death flash. Mine, Nova, Lightning, and Missile kill paths all routed through a new shared `destroyAsteroid()` helper that mirrors the bullet-hit kill sequence — including spawning 3-4 fragments for large asteroids. Each AOE loop snapshots `asteroidPool.activeObjects` before iterating so newly-spawned fragments don't re-trigger the same blast frame.

---

## [5.45.0] - 2026-05-02

### Changed
- **All player mines are now magnetic by default** — they pull nearby enemies and asteroids toward themselves. Pull radius is `1.8 ×` the trigger radius (so BLAST_RADIUS investments grow magnetism too); pull force scales with `(1 - dist/pullR)`. Asteroids feel a gentler tug than enemies (heavier mass).
  - Removed the `MAGNETIC_MINE` upgrade from `POWER_UPGRADES` and `MINE_LAYER.upgrades` since it's now baseline.
  - Added a faint dashed blue magnetic-field ring outside the trigger ring on the mine renderer so the pull radius is visible. The dash offset shifts over time for a "field rotating" feel.
  - Mine description updated: "Drop magnetic proximity mines".
- **Nova Blast is now a real shockwave**: ringRadius bumped 200 → 320, ringDamage 2.5 → 4, duration 500 → 600ms. Casting now spawns an immediate explosive burst at the player (flash + ring + 24 shrapnel streaks + 14 embers) plus 4-frame hitstop, screen flash, and screen shake.
- **Nova damages and pushes asteroids too**, not only enemies. Both enemies and asteroids get an outward velocity shove on first ring contact (`KNOCK_ENEMY=16`, `KNOCK_AST=9`). Lethal damage flips `_deathFlash` and deactivates asteroids.
- **Lightning Arc chains through asteroids too.** Chain-target search now considers both `enemyPool` and `asteroidPool`; collision applies falloff damage to whichever kind of target each link is. Asteroids get hit-flash + death-flash on lethal damage.
- **Missiles also impact and damage asteroids.** Homing target acquisition prefers enemies, falls back to nearest asteroid if none in sight. Collision check iterates both pools; impact spawns a flash + shrapnel + embers burst.

---

## [5.44.0] - 2026-05-02

### Fixed
- **Nova Blast actually does damage now.** Three latent bugs: `p.novaActive` was never set so collision/render gated out entirely; `ring.active` was never set; skills.js wrote `ring.radius` while collision/render read `ring.currentRadius`. Fixed all three: `fireNova` flips `novaActive=true` and `active=true` on each ring, skills.js writes `currentRadius`, and `novaActive` is cleared when the rings array drains.
- **Lightning Arc actually damages enemies now.** `chain.targets` was never populated and `chain.active` was never set, so the renderer drew nothing and collision iterated an empty list. `fireLightning` now eagerly builds the chain: pulls `enemyPool` from `this.gameEngine`, repeatedly picks the nearest unvisited enemy within `chainRange` of the previous link, up to `maxChains` hops. Targets render as zig-zag arcs and collision applies falloff damage along the chain.
- **Missile Salvo actually homes and connects now.** Skills update never applied homing — missiles flew straight ignoring `homingStrength`. Renderer also accessed non-existent `missile.vx` / `missile.vy` (data has `missile.vel.x` / `missile.vel.y`). Now missiles re-acquire the nearest active enemy and steer toward it via smooth angular interpolation.

### Changed
- **Missiles redrawn vector-style** with a dart-shaped body, fins, gradient thruster flame trail, pulsing nose-cone light, and steady amber side LEDs. Rotates to face its current heading.
- **Homing is always on for missiles**; `LOCK_ON` upgrade removed. Base `missileHomingStrength` bumped from 0.08 → 0.18 so the always-on homing actually grabs targets. `MISSILE_SALVO.upgrades` array no longer references `LOCK_ON`.

---

## [5.43.0] - 2026-05-02

### Fixed
- **Nova / Lightning / Missile power weapons had no cooldown without their per-weapon upgrade.** `fireNova` / `fireLightning` / `fireMissiles` only set `powerCooldown` when their respective upgrade (`RESONANCE` / `TESLA_COIL` / `QUICK_RELOAD`) had at least 1 stack — without the upgrade, the weapon was spammable. Now each weapon always sets its base cooldown; the upgrade just shortens it.

### Added
- **Universal power-weapon readiness ring on the player ship.** The cooldown timer (formerly only drawn for `CHARGE_SHOT` while charging) now fires for every power weapon. For cooldown-based weapons (Mine Layer, Nova, Lightning, Missiles) the ring fills as `1 - powerCooldown/powerCooldownMax`, then pulses fully-charged white/cyan when ready to fire — same visual language across all power weapons. Each weapon's fire path now stashes `this.powerCooldownMax` so the renderer can draw progress.
- **Mines now produce a fantastic explosion**: bright core flash (1.2× blast radius), three staggered colored rings (orange / dim / bright wavefronts), 22 directional shrapnel streaks, 18 dense classic particles, 12 lingering embers, and a delayed cookoff burst at +120ms. Plus 4-frame hitstop, screen flash, camera kick, screen shake, and an explosion audio cue. Modeled on the asteroid-death debris recipe in `combat-manager.createDebris`.
- **Mines push enemies and asteroids around with momentum**: outward velocity push scales linearly with proximity to the mine. `KNOCK_BASE = 12` for enemies (lighter, fly farther), `KNOCK_BASE = 6` for asteroids (heavier). Close-range targets get nearly the full impulse; targets at the edge of the blast barely move.

---

## [5.42.0] - 2026-05-02

### Fixed
- **Mines actually arm and explode now.** `mine.armed` was never set anywhere in the codebase — `collision-system.checkMineCollisions` short-circuited with `if (!mine.armed) continue;` so the explosion path never fired. `skills.js` now flips `mine.armed = true` once `armTimer <= 0`. Latent bug since the mine system landed.

### Changed
- **Mines now explode near asteroids too**, not only enemies. Trigger detection iterates `asteroidPool` in addition to `enemyPool`; the blast also damages asteroids with the same falloff (and applies a hit-flash + outward knockback for impact feel). Lethal damage flips `_deathFlash` and deactivates the asteroid.
- **`BLAST_RADIUS` upgrade now boosts trigger range too** (+20px per stack alongside the existing +30px blast radius). Description updated to reflect both effects. Investing in the upgrade now genuinely extends the mine's *effective range* — the spirit the user asked about.
- **Mines redesigned to look physical and tangible.** Replaced the 8px circle with a chunky 12px casing: 4 spike protrusions, dark filled body with colored outline, a pulsing inner core, a 6-LED rotating ring with chase-pattern blink, a status blinker on top, and a flashing trigger-radius ring while armed. Pre-arm visuals are dimmer with a faster telegraph blink.
- **Mine explosion VFX upgraded** — was 8 generic particles, now uses the same flash + colored ring + 14 shrapnel streaks + 6 embers that powerup-expiry uses, scaled to blast radius.

---

## [5.41.8] - 2026-05-02

### Added
- **Powerup pickup display now shows what the powerup does**, not just its name. A one-line effect blurb (e.g. "Increases the max amount of health per orb" for Doctor) renders directly below the wavy powerup name. Description is pulled from `POWERUP_TYPES[type].description` in `powerup.js`. Threaded through `collectPowerup` → `showPowerupDisplay(name, color, description)` → `powerupDisplay.description` → `drawPowerupDisplay` (renders white Silkscreen text with a black outline). Removes the "what does Doctor do?" mystery on every pickup.

---

## [5.41.7] - 2026-05-02

### Changed
- **Weapon squares' vertical gap to the coin icon now matches the shield→coin gap exactly.** The 30px shield and 30px coin icons sit 40px center-to-center, giving a 10px edge-to-edge gap. The squares previously sat 40px below the coin *center* (25px edge-to-edge gap) — visually inconsistent with the column above. Now `groupY = coinsY + coinIconSize/2 + 10` so all three vertical gaps (shield↔coin, coin↔squares) are an even 10px.

---

## [5.41.6] - 2026-05-02

### Changed
- **Top-left HUD has more screen-edge breathing room and the weapon squares now align with the gold icon.**
  - Bumped the shared `livesX` anchor from 24 → 36 (across `drawCanvasTriforce`, `drawLevelAndCoinsDisplay`, `drawEquippedWeaponSquares`, `drawMoneyPickupDisplay`); health-bar `barX` shifted 74 → 86 to keep the gap to the triforce.
  - Primary weapon square's **left edge now aligns with the gold-coin icon's left edge** instead of the HUD column's left margin. Computed via the same `triforceCenterX - coinIconSize/2` formula the gold display uses.
  - Both weapon squares moved further down: vertical gap from coin icon → squares is now 40px (matching the level→coin icon-to-icon spacing of the column above), so the weapon row breathes instead of crowding the gold number.

---

## [5.41.5] - 2026-05-02

### Changed
- **Tab and R now cycle through every weapon in the game one-by-one**, not just the player's currently-owned set. Pressing Tab walks through all 5 primaries (Pulse Cannon → Storm Needles → Scatter Gun → Rail Driver → Lance Beam → back); R walks through all 5 power weapons (Charge Shot → Mine Layer → Nova Blast → Lightning Arc → Missile Salvo → back). The newly-equipped weapon is auto-added to `ownedPrimaries` / `ownedPowers` so the rest of the game (shop upgrade trees, sell paths) treats it as owned — mirrors the existing pause-menu PRIMARY/POWER tab behavior. Removed the no-op hints that fired when only one weapon was owned (no longer reachable).

---

## [5.41.4] - 2026-05-02

### Fixed
- **Top-left HUD column now has a clear left margin.** Bumped the shared anchor from `livesX = 10` → `livesX = 24` in all four sites that anchor to it: `drawCanvasTriforce`, `drawLevelAndCoinsDisplay`, `drawEquippedWeaponSquares`, `drawMoneyPickupDisplay`. Health-bar `barX` shifted from 60 → 74 to preserve the gap to the triforce.
- **Tab/R cycle: clearer feedback when only one weapon is owned.** Previously the HUD square pulsed but nothing else happened, leaving the player wondering whether the binding was broken or whether they simply lacked a second weapon. Now in that case a non-persistent hint fires: "Equip another primary in the **pause menu (ESC → PRIMARY)** to cycle weapons with **Tab**" (and the analogous message for R / power weapons). Each instance is freshly shown (the hint uses `{ once: false }`) so the prompt isn't suppressed by the once-per-browser persistence layer that gates the wave-1 onboarding hints.

---

## [5.41.3] - 2026-05-02

### Fixed
- **PRM weapon square no longer clips off the left edge of the screen.** Was centered under the 60px triforce width with a 84px-wide group → `groupX = -2`. Switched to left-anchored at `livesX = 10` so both squares share the same left margin as the rest of the top-left HUD column.
- **Tab / R weapon cycling now also works during WAVE_TRANSITION** (between-wave usability), not just `PLAYING`.
- **Tab / R always pulse the HUD square** even when the player owns only one weapon of that type. Previously the keys were silent no-ops in that case, making it look like the binding was broken. Now the player always gets visual confirmation the key was received; the actual weapon swap only happens when 2+ weapons are owned.

---

## [5.41.2] - 2026-05-02

### Changed
- **Tab now cycles primary weapons; R cycles power weapons.** R was previously the only cycle key (primary-only). Tab needs `e.preventDefault()` so the browser doesn't shift focus to the next page element.
- HUD cycle animation extended: `_weaponCycleAnim` now carries a `slot` field (`'primary'` or `'power'`) and `drawEquippedWeaponSquares` pulses whichever square just changed.
- Wave-1 onboarding hint updated to: "Press **Tab** to cycle primary weapons, **R** to cycle power weapons." Hint id bumped to `wave1-cycle-weapons-v2` so players who already saw the old "Press R" hint see the new dual-key version once.
- README controls updated for both keys.

---

## [5.41.1] - 2026-05-02

### Added
- **Shop PRIMARY / POWER tabs now show which weapon you're upgrading.** A banner at the top of each tab displays "Upgrading Primary Weapon" / "Upgrading Power Weapon" with the equipped weapon's icon, name, and color (`buildEquippedBanner` in `shop-dom.js`). Removes ambiguity about which upgrade tree the listed items will modify.
- **Equipped-weapons HUD: two squares below the gold display** showing the equipped Primary and Power weapons. Each square has the weapon's icon centered in its weapon color, with **PRM** / **PWR** labels below. New `drawEquippedWeaponSquares` exported from `hud/status.js` and called after `drawLevelAndCoinsDisplay`.
- **R-cycle animation**: pressing R now triggers a 350ms scale-pulse + glow halo on the Primary HUD square via a new `triggerWeaponCycleAnim()` on the game engine and a `_weaponCycleAnim` state object read by the HUD renderer. The animation auto-clears when its duration elapses.

---

## [5.41.0] - 2026-05-02

### Added
- **R cycles through primary weapons during gameplay.** Rotates through the player's owned primaries (`activePrimary` → next entry in `ownedPrimaries`). No-op when only one weapon is owned. Ignored while Shift is held to avoid colliding with Shift+R cheat patterns.
- **Contextual hint overlay system** (`js/modules/ui/hint-system.js`). One-at-a-time tooltip pinned above the HUD, fades in/out, auto-dismisses after a configurable duration. Each hint id is shown at most once per browser via `localStorage` (key `rainboids:hints-shown:v1`). Authors can pass `<strong>` to highlight key glyphs in hint text. Exports `showHint(id, text, durationMs)`, `hideHint()`, and `resetHints()` (for dev/testing). New `#hint-overlay` element in `index.html` plus styling in `css/styles.css`.
- **Two onboarding hints during wave 1** (queued via `GameTimer` so they pause with the game):
  - At ~5s: "Press **R** to cycle through your primary weapons." Auto-dismisses after 7s, or instantly when the player actually presses R.
  - At ~13s: "Open the **shop** any time — pause menu (**ESC**) or the **🛒** button in the top-right." Auto-dismisses after 8s.

### Changed
- README.md `Controls` section updated: documents R-cycle, and corrects the shop entry-point note (top-right HUD button + pause menu, not "pause menu only").

---

## [5.40.15] - 2026-05-02

### Changed
- **Temporary powerups now apply consistently across every primary weapon.** Three previously-divergent powerups harmonized:
  - **BIG_BULLETS** — switched from multiplicative (`radius *= 1 + stacks * 0.3`) to **additive** (`radius += 1.5px * stacks`). Old behavior under-served small-bullet weapons: at 1 stack, Pulse Cannon grew from r=4 to r=5.2 (+1.2px) but Storm Needles only grew from r=2 to r=2.6 (+0.6px) — barely visible. New behavior gives every weapon the same Δpx per stack regardless of base bullet size, so the "bullets are bigger now" promise reads visually on every primary.
  - **HOMING** — unified the per-stack formula. Was `min(0.4, stacks * 0.05)` in `applyGlobalBulletUpgrades` (Storm Needles, Scatter Gun, Rail Driver) but `min(0.25, stacks * 0.08)` in `createChargedBullets` (Pulse Cannon). Now `min(0.4, stacks * 0.06)` everywhere — slightly weaker per stack on Pulse Cannon at low stack counts, but the cap is now identical (0.4) and the per-stack rate matches across the roster.
  - **PIERCING** — `createChargedBullets` was overwriting `bullet.piercing = stacks`, while `applyGlobalBulletUpgrades` added to the existing piercing (`= (bullet.piercing||0) + stacks`). Now both are additive — consistent semantics.

---

## [5.40.14] - 2026-05-02

### Fixed
- **MULTI_SHOT now carries over to every primary weapon, not just Pulse Cannon.** Previously only `firePulseCannon` (via `createChargedBullets`) consulted `MULTI_SHOT`; `fireStormNeedles`, `fireScatterGun`, and `fireRailDriver` ignored it entirely, firing exactly 1 bullet/pellet-spread/rail per shot regardless of stacks.
  - Storm Needles: now fires `1 + multiShotStacks` needles fanned across a small spread (≤0.5 rad).
  - Scatter Gun (pellet path): adds `multiShotStacks` to `pelletCount` on top of `BUCKSHOT`.
  - Scatter Gun (slug path): fires `1 + multiShotStacks` slugs in a tight fan (≤0.4 rad).
  - Rail Driver: fires `1 + multiShotStacks` rails in a narrow fan (≤0.3 rad — wider would feel chaotic at rail range).
  - Lance Beam: unchanged; multi-shot is a no-op for continuous-beam weapons.

### Note
- BIG_BULLETS already applies to all primary weapons via `applyGlobalBulletUpgrades`. Its effect on Storm Needles looks subtle because needles have a 0.5× base bullet size — at 1 stack you get `0.5 × 1.3 = 0.65×` of the base bullet radius. Stack BIG_BULLETS more times to see the visible growth.

---

## [5.40.13] - 2026-05-02

### Changed
- **KeyP debug powerup cheat: rewrote spawn logic to be uniform-random within the viewport** with two simple constraints — at least `MARGIN=80px` from the screen edges (so the powerup is fully visible) and at least `MIN_DIST=250px` from the player (so they actually have to fly to it). Rejection sampling: tries up to 20 random points and falls through with the last one if none satisfies the player-distance constraint. Replaces the previous edge-based selection logic.

---

## [5.40.12] - 2026-05-02

### Changed
- **KeyP debug powerup cheat: bumped inset from 40–80px to 140–220px** so powerups land solidly inside the play area instead of sliding behind HUD overlays / clipping at the visible boundary. The powerup's glow halo extends well beyond its 18px center radius, so a near-edge spawn looked off-screen even when technically inside. Also added a 200px corner padding along the chosen edge so powerups don't pile up in screen corners.

---

## [5.40.11] - 2026-05-02

### Changed
- **KeyP debug powerup cheat now spawns on-screen near a random edge** instead of off-screen. Picks a random edge (top/right/bottom/left), inset 40–80px so the powerup is fully visible, and converts to world coords via the camera offset. The previous off-screen behavior made it hard to verify quick-test scenarios because the powerup had to drift in before it became visible.

---

## [5.40.10] - 2026-05-02

### Changed
- **Music player progress bar contrast tuned.** Unbuffered track background went from `rgba(255,255,255,0.2)` (moderately bright tint) to `rgba(0,0,0,0.75)` so the empty region reads as truly empty. Buffered ghost fill went from `rgba(255,255,255,0.28)` to `rgba(255,255,255,0.15)` so it sits clearly between the dark unbuffered region and the bright cyan playback fill.

---

## [5.40.9] - 2026-05-02

### Added
- **Buffered-load indicator on the music player progress bar.** A translucent ghost fill behind the playback fill shows how much of the current track has been downloaded. Driven by the audio element's `progress` event (fires while the browser fetches more data) reading `audio.buffered.end(last)` / `audio.duration`. New `MusicPlayer.onBufferedUpdate(fraction)` callback bound to a new `#music-player-buffered` div layered behind `#music-player-progress` via absolute positioning. Resets at track-change and re-emits a fresh reading immediately so a promoted-from-preload track that already has data shows it right away.

---

## [5.40.8] - 2026-05-02

### Fixed
- **Music player no longer auto-skips through every track after pressing Next/Prev/Random/Shuffle.** Regression introduced in 5.40.7: `_disposeAudio()` set `src=''` and called `load()` to cancel in-flight fetches, which fires an `error` event on the abandoned `<audio>`. The `error` listener installed earlier called `setTimeout(() => this.next(), 1000)` — so every track change scheduled a phantom `next()` from the disposed audio, fired 1s later, disposed that audio, scheduled another `next()`, and so on in a runaway loop. `_attachAudioListeners()` now stashes bound handlers on the element, `_disposeAudio()` removes them before clearing `src`, and the error handler short-circuits on a `_disposing` flag for belt-and-suspenders.

---

## [5.40.7] - 2026-05-02

### Changed
- **Music player loading is now smarter about bandwidth.** Three concrete improvements to `MusicPlayer`:
  - **Dropped `prevAudio` entirely.** Backward navigation is rare; keeping a third Audio element alive cost ~1/3 of speculative bandwidth for almost no benefit. Pressing Previous now triggers a fresh fetch (acceptable tradeoff).
  - **Reuse the preloaded `nextAudio` instead of refetching.** `loadTrack()` now tracks `nextAudioIndex` and promotes the speculative preload to `currentAudio` when its index matches the requested one. Eliminates the redundant fetch that fired on every linear advance (Next button, auto-advance on track end).
  - **Skip preload after random jumps.** `playRandomTrack()` passes `{ skipPreload: true }` to `loadTrack()` so the player doesn't eagerly buffer `currentTrackIndex+1` after a non-linear jump — that buffer would just be discarded the next time the user hits random anyway. After shuffle, preload resumes normally (shuffled playback typically continues linearly through the new order).
  - Added `_disposeAudio(audio)` helper that actively cancels in-flight loads via `src=''; load()` rather than waiting for garbage collection. Also removed a duplicate `setVolume` definition.

---

## [5.40.6] - 2026-05-02

### Changed
- **Shuffle button now scrolls the playlist back to the top** so the user sees the freshly-shuffled order from track 0 (the one that just started playing) instead of remaining wherever the previous scroll position was.

### Added
- **Instant custom tooltips on all six music player buttons** (shuffle / random / prev / play-pause / next / repeat). Replaced native `title` (which has a ~700ms browser-imposed delay) with `data-tooltip` + a CSS `:hover::after` pseudo-element that fires the moment the cursor enters the button. Includes a small arrow pointer pointing at the button for clear association.

---

## [5.40.5] - 2026-05-02

### Fixed
- **Shuffle button: highlighted playlist row now matches the actually-playing track.** The bug: `shuffleAndPlay()` reordered `musicPlayer.playlist` but only `populatePlaylist()` rebuilds the rendered DOM list. After shuffle the DOM still showed the *old* order, so toggling `.playing` on index 0 highlighted whatever happened to live there in the stale list while the audio played the new track 0. Result: highlighted track and playing track diverged.
- Added an `onPlaylistChange` callback on `MusicPlayer`; `shuffleAndPlay()` fires it after reordering. The UI binds it to `populatePlaylist()` so the rendered list is rebuilt before `loadTrack(0)` triggers `onTrackChange`. Highlight and audio are now always in consensus.

### Changed
- **Random button now scrolls the playlist to the picked track** via a new `scrollToCurrentTrack()` helper (`scrollIntoView({ block: 'center', behavior: 'smooth' })`). Without this, the player would silently start a track buried far down in the list with no visible indication of which one.

---

## [5.40.4] - 2026-05-02

### Changed
- **Music player layout: shuffle + random grouped on the left, prev/play/next truly centered, repeat on the right.** Wrapped each side in a `.music-side-controls` div and switched `#music-controls` from `flex space-between` to `grid 1fr auto 1fr` so the center column stays centered regardless of how many buttons live in the side groups. Removed dead `.music-control-btn.left/.right` rules.

---

## [5.40.3] - 2026-05-02

### Fixed
- **Music player shuffle button now works on the first click.** The bug: `MusicPlayer.shufflePlaylist()` always set `isShuffled = true`, and the constructor calls it on init. So `isShuffled` was already `true` when the user first clicked, and `toggleShuffle()` flipped it to `false` — skipping the reshuffle entirely. Removed the flag mutation from `shufflePlaylist()`.

### Changed
- **Shuffle button is now an action, not a toggle.** Clicking it re-shuffles the playlist *and* loads + plays new track 0 — visible side effect (track changes, audio plays) confirms the action. New helper: `MusicPlayer.shuffleAndPlay()`.

### Added
- **Random-track button (🎲) in the music player.** Jumps to a uniformly random track and plays it without reordering the playlist (so prev/next still walks the existing order). New helper: `MusicPlayer.playRandomTrack()`. Bound to a new `#music-random` button placed next to the shuffle button. Both buttons briefly flash the `.active` class for visual feedback.

---

## [5.40.2] - 2026-05-02

### Changed
- **Enemy bullets travel faster, especially in early waves.** `ENEMY_BULLET_CONFIG.BASE_SPEED_MULTIPLIER` raised from `0.85` → `1.05` so level-1 bullets fire at full declared speed rather than 85% of it. Per-level scaling already existed; bumped `LEVEL_SPEED_BONUS_PER_LEVEL` `0.08` → `0.10` and `MAX_LEVEL_SPEED_BONUS` `0.4` → `0.6` so the curve is steeper and tops out at +60% at level 7+ (was +40% at level 6+). Net effect: level-1 bullets are ~24% faster than before, late-game bullets ~41% faster. Existing per-pattern `SPEED_LIMITS` clamps remain unchanged and still accommodate the new range.

---

## [5.40.1] - 2026-05-02

### Changed
- **Closing the shop now returns the player to whichever state they came from.** Previously the X button (and ESC) always routed `SHOP → PAUSED`, even if the player opened the shop mid-fight via the HUD shop button — which was disorienting (game suddenly paused with menu showing). Now `openShop()` captures `shopReturnState` before transitioning, and a new dispatcher `closeShopAndReturn()` routes:
  - opened from `PLAYING` (HUD shop button mid-fight) → resume gameplay via new `closeShopToPlaying()`
  - opened from `WAVE_TRANSITION` (auto-shop on wave complete) → `closeShop()` starts next wave (unchanged)
  - opened from `PAUSED` (pause-menu shop button) → `closeShopToPause()` returns to pause menu (unchanged)
- Wired through the DOM close button (`shop-dom.js`), the canvas-overlay close hit-region (`event-setup.js`), and the ESC handler (`game-engine.togglePause`).

---

## [5.39.16] - 2026-05-02

### Changed
- **Asteroids hit harder by the early-wave easing pass — now 4–7 / 2–4 / 1–2 HP** (was 5–9 / 2–5 / 1–3). Big asteroids drop from 3.5–4.5s TTK to 2.0–3.5s with the starter Pulse Cannon. Small fragments now die in one or two hits, keeping wave clears snappy.
- **Enemy HP dialed back another ~15%** so players can build momentum and reach later waves faster: Hunter 6→5, Wasp 5→4, Weaver 6→5, Stalker 7→6, Drifter 8→7, Bomber 9→8, Sentinel 10→8, Guardian 12→10, Prowler 13→11, Titan 22→18. Trash mobs now die in 2.0–2.5s with starter weapon; mid-tier in 3.5–4.0s; Titan in 9s.

---

## [5.39.15] - 2026-05-02

### Changed
- **KeyP debug powerup cheat now spawns just beyond the viewport** instead of within ±50px of the player. Picks a random angle, places the powerup at half-diagonal + 40–120px so it drifts in from off-screen — better mimics organic spawn behavior for testing magnetism, blink, and the new expiry burst.

---

## [5.39.14] - 2026-05-02

### Changed
- **Normalized ID3 title tags across all 68 music tracks to consistent Title Case.** Mix of all-lowercase and Title Case titles caused inconsistent display in the in-game playlist. Applies AP-style rules: capitalize first/last word and all major words; small English words (a/the/and/or/in/of/to/etc.) and Romance-language particles (de/la/el/du/le/etc.) stay lowercase mid-title. Apostrophes preserved (`don't` → `Don't`). Playlist regenerated from updated tags. Notable fixes: leading-space stripped from `" Solace de violencia"` → `Solace de Violencia`, `Not Here Nor There` → `Not Here nor There`.

### Added
- `tools/scripts/normalize-id3-tags.js` — idempotent script that reads, Title-Cases, and rewrites ID3 title tags. Re-run any time new tracks land with sloppy casing.

---

## [5.39.13] - 2026-05-02

### Changed
- **Base enemy and asteroid HP cut by ~50% across the board** to fix early-wave slog. Per-level scaling unchanged (+20%/level enemies, +30%/level asteroids), so the early game eases dramatically while late waves stay ~half today's values — the player's DPS scales faster than the easing once weapons unlock and upgrades stack.
- **Enemies (was → new):** Hunter 12→6, Guardian 24→12, Wasp 11→5, Stalker 15→7, Drifter 17→8, Prowler 27→13, Weaver 12→6, Sentinel 21→10, Bomber 18→9, Titan 45→22.
- **Asteroids:** Big tier (40+r) 10–18→5–9, Medium (20–40r) 4–10→2–5, Small (5–20r) 2–5→1–3.
- TTK reference at level 1 with starter Pulse Cannon (2.0 DPS): Wasp 2.5s, Hunter 3.0s, Drifter 4.0s, Guardian 6.0s, Titan 11.0s, big asteroid 4.5s.

---

## [5.39.12] - 2026-05-02

### Changed
- **Powerup lifetime tuned to 25s** (from the 8s testing value). Anchored to the 30s effect duration of most powerups — pickup window slightly shorter than the buff window so late pickups never waste effect time. Blink window narrowed to the last ~35% of life (~8.75s), enough warning to react without dominating the powerup's on-screen presence.

---

## [5.40.0] - 2026-05-02

### Added
- **15 new music tracks** picked up by `tools/scripts/generate-playlist.js`: chiplight, chipper-to-meet-you, chipstrike, comet-coma, commander-chipknight, dark-lightning, deep-in-battle, jewel-of-light, lightning-step, lightning-strikes-twice, longia, not-here-nor-there, sip-of-life, target-found, tetrapyramid.

### Removed
- **10 Karl Casey @ White Bat Audio tracks removed** (aura, beyond-shadows, dangerous, inferno, iridium, legends, midnight, out-for-blood, salvation, world-eater) along with all README credits and the Music Credits section. Net library is now 68 tracks.

---

## [5.39.11] - 2026-05-02

### Added
- **Powerups burst into particles when their lifetime expires.** Previously they just vanished. Now `Powerup.update()` calls a new `emitExpiryBurst()` on life ≤ 0 that spawns a central `explosionFlash` (scaled to 2× radius), a colored `explosionRingColored` ring in the powerup's primary gradient color, 12 evenly-spaced `explosionShrapnel` streaks, and 8 `explosionEmber` lingerers in the secondary gradient color. `game-engine.js` now passes `particlePool` through the powerup update call so the entity can spawn its own expiry FX.

### Changed
- **Powerup lifetime drastically shortened (90s → 8s) and blink window widened (50% → 75% of lifetime) for testing visibility.** Restore via `this.life = 90 * GAME_CONFIG.LOGIC_HZ` and `this.fadeDuration = this.life / 2` once the new burst+blink combo is dialed in.

---

## [5.39.10] - 2026-05-02

### Changed
- **Powerup wind-down switched from opacity fade to ramping blink.** Removed all `fadeAlpha` multipliers from the draw — body, glow sprite, sparkles, and label all render at full opacity. During the fade window (last half of lifetime) the entire `draw()` early-returns on "off" frames driven by `Math.sin((frameClock.now / 1000) * hz * 2π) < 0`. Blink rate ramps from ~1.5Hz at the start of the window to ~14Hz right before expiry, so the powerup blinks lazily at first then strobes urgently — communicating "running out" without depending on globalAlpha at all.

---

## [5.39.9] - 2026-05-02

### Changed
- **Powerup fade is now actually gradual.** `fadeDuration` was 8s of LOGIC_HZ ticks (~16s real), about 9% of a powerup's ~180s lifetime — so they sat at full opacity for the vast majority of life and only faded in a brief tail. Now `fadeDuration = maxLife / 2`: the last half of the lifetime is a smooth linear fade from full to zero. Sprite caching (`glowSpriteCache`) was suspected as the cause — it isn't; `ctx.globalAlpha` multiplies through `drawImage` of cached canvases correctly. The visible "snap" was simply the fade window being too small relative to lifetime.

---

## [5.39.8] - 2026-05-02

### Fixed
- **Powerups now actually fade out instead of popping off.** The pre-rendered glow sprite (`glowSpriteCache.draw`) sets `ctx.globalAlpha` internally, which clobbered the `fadeAlpha` set just before it — so the body, hexagon/star/etc. shape, and icon all rendered at constant `0.6` alpha for the entire lifetime, then disappeared instantly when `life ≤ 0`. Only the sparkle ring and name label faded (they re-set `globalAlpha` later in the draw). Now the glow's alpha is multiplied by `fadeAlpha`, and `globalAlpha` is re-applied as `fadeAlpha` afterward so the entire pickup participates in the fade.
- **Fade curve switched from sqrt to linear.** The previous `sqrt(life/fadeDuration)` curve held alpha high for most of the fade window then dropped sharply in the last ~1s — perceptually still a "snap." Linear gives an even, gradual decay across the full 16s fade tail.

---

## [5.39.7] - 2026-05-02

### Changed
- **Debug `P` powerup spawn now drops just beyond the viewport.** Previously dropped within ±50px of the player (visible pop-in). Now spawns at a random angle at `viewport-diagonal/2 + 40–120px` from the player so the pickup drifts in from off-screen.

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
