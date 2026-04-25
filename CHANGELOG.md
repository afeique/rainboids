# Changelog

All notable changes to Rainboids will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- **MAJOR** = fundamental gameplay or architectural overhaul
- **MINOR** = new features, systems, or significant content
- **PATCH** = bug fixes, balance tuning, polish

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
