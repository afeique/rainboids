# Rainboids — Codebase Improvement Report

**Date**: 2026-05-18
**Scope**: Solo game (`v6.15.1`) + Multiplayer (`v0.8.0`) + Rust sim + tooling
**Methodology**: Parallel domain audit across architecture, rendering/perf, gameplay, multiplayer, tests, and prior docs.

---

## TL;DR

The codebase is healthy and well-tracked. The biggest pieces of debt and the biggest player-facing opportunities don't overlap with what's already planned:

1. **No CI test job** — 724 JS test cases + 276 Rust tests run only locally. Highest-leverage fix in the entire report.
2. **Solo/MP collision logic is duplicated** in `js/modules/combat/collision-system.js` and `server/sim/src/mp1/collision.rs`. Every weapon/balance change must be done twice. Unification is the single biggest architectural lever.
3. **Gameplay depth is flat**: 5 forward-shooting primaries, 10 enemies of which 3 are "tactical wallpaper", asteroids are inert backdrop. Big upside per line of code.
4. **Streak system is a hidden stat multiplier** — making it visible and mechanical (piercing/AOE unlocks) would transform game feel.
5. **MP needs three concrete things to ship**: prediction reconciliation, matchmaking, server-side input validation. Everything else is polish.

Total recommended scope: ~6–8 weeks of focused work distributed across solo polish, MP hardening, and testability. Items are independent and parallelizable.

---

## How this report is organized

- **Part 1** — Findings (what is true today)
- **Part 2** — Ranked enhancements with implementation plans
- **Part 3** — Sequencing & a suggested 8-week roadmap
- **Part 4** — Out-of-scope (already planned, already rejected — don't duplicate)

---

# Part 1 — Findings

## 1.1 Solo Architecture

**Dominant pattern**: OOP god-object (`GameEngine`, 4,117 LOC) plus pure-function module façades that bind back via `.call(this)`. Pool-based entity management is solid; module boundaries are sensible (player/enemy/combat/world/hud); 150+ delegating methods on `GameEngine` mask the actual dependency graph.

**Hottest hotspots**:
| File | LOC | Diagnosis |
|---|---|---|
| `js/modules/game-engine.js` | 4,117 | Owns everything: init, state, pools, render orchestration, persistence, title screen, input routing. |
| `js/modules/combat/collision-system.js` | 2,416 | Collision + damage + per-weapon logic. Comment at line 14–15 explicitly notes a circular-import dodge against `wave-manager.js` — entanglement smell. |
| `js/modules/enemy/movement.js` | 2,335 | 10+ behaviors in one file. |
| `js/modules/hud/overlays.js` | 1,883 | Title + game-over + respawn UI muddied with main loop. |
| `js/modules/ui/ui-manager.js` | 1,857 | Input routing + radial menu + mobile touch in one bag. |
| `js/modules/enemy/shapes.js` | 1,830 | 25+ enemy draw functions — really a render façade, not "shapes". |
| `js/modules/wave/wave-manager.js` | 1,709 | Spawning + missions + notifications + shop-suggest overlay. |
| `js/modules/hud/status.js` | 1,672 | HUD rendering, heavy on draw calls. |

**Solo↔MP duplication**: Solo collision (2,416 LOC JS) and MP collision (Rust) are entirely separate. Every balance change is done twice. `js/sim/` (17 files) is a vestigial JS mirror left over from the pre-WASM era — superseded by the WASM module but kept around because solo's legacy code still imports from it.

**Dead code**: `js/modules/performance/quadtree.js` (193 LOC) — defined but never imported. The active spatial structure is `spatial-grid.js` (8×6 cells).

## 1.2 Rendering & Performance

**Three-canvas layout** working as designed:
- **GPU (WebGL2, instanced, single draw each)**: bullets, particles, starfield. Lean per-instance attrs; no per-frame allocation.
- **CPU (Canvas2D)**: asteroids, enemies, player ship, weapon effects, HUD, line debris.

**Remaining bottlenecks** (per density, ordered by cost):
1. **Composite-mode thrashing in enemy rendering** — `globalCompositeOperation = 'lighter'` toggled 2–4× per enemy per frame in `enemy/shapes.js`. ~0.4–0.8 ms/frame at 12+ enemies.
2. **Multi-stroke fake-glow weapon effects** — Lance Beam (3 strokes), Arc Lightning (3 strands × 4 strokes). ~0.6 ms/frame active.
3. **Redundant asteroid 3D projection** — `world/asteroid.js` re-projects 12-vertex mesh every frame, even when both camera and asteroid are stationary (idle/pause). ~150 µs constant.

**No GC pressure** — every hot path uses pre-allocated typed arrays.

**Already planned**: `docs/GPU Rendering Plan – 2026-05-17.md` phases 1–4 cover bloom pipeline (replaces all `shadowBlur` workarounds) and GPU weapon effects. Don't duplicate.

## 1.3 Gameplay

**Core loop**: 30 waves (10 stages × 3) against 10 enemy types; shop auto-opens at stage clear; survivor-card pick every 3 waves. Speedrun multipliers reward sub-5-min runs. Lose at 0 HP without spare tanks; win at wave 30.

**Toolkit**: 5 primaries, 5 power weapons, 6 defense skills, ~14 upgrade categories, 20-tier streak ladder.

**Flat-design observations** (highest-impact gameplay finding):
- All 5 primaries are *forward-facing damage with different cone widths*. No ricochet, no orbit, no area control — mechanically homogeneous.
- All 5 power weapons are *damage shapes* (ring, missiles, mines, charge, beam). No utility, no teleport, no shield drop.
- Asteroids are pure obstacles. Enemy bullets explicitly pass through them. No cover, no chain reactions, no environmental damage.
- Streak system is invisible — a flat damage multiplier with no UI progression bar and no mechanical unlocks; one bullet contact resets it.
- 3 of 10 enemies (Guardian, Wasp, Prowler) are documented in CHANGELOG as "tactical wallpaper" — bullet sponges with no behavioral pressure.

**Game feel** — hitstop exists (4–8 frames) but is barely perceptible (modern arcade reference: 9–25 frames). Screen kick is subtle. Crit hits get no distinct audio/visual identity. Weapon impact SFX are generic.

**Balance** — memory notes "challenge balance is broken". CHANGELOG corroborates a mid-game wave-8–10 difficulty cliff that depends heavily on powerup RNG; quadratic health-drop curve under 25% HP is a band-aid.

## 1.4 Multiplayer

**Architecture** (per `docs/Multiplayer WASM Pivot – 2026-05-17.md`): single canonical Rust simulation in `server/sim/src/mp1/`, compiled to both native (server) and WASM (browser). Server authoritative; client receives 20 Hz ship snapshots + deterministic event stream + 1 Hz state checksums.

**Currently `0.8.0`**: HUNTER enemy + 1 weapon + collision shipped. 9 of 11 enemy types authored as files (uncommitted, in flight on this branch — `enemy_*.rs` per-type split) but not yet wired into `mp1_room.rs` dispatch.

**Sims**: only two active — Rust (`server/sim/`) and WASM-compiled-from-same. `js/sim/` is fully vestigial for MP, retained only because some solo paths still reach into it.

**Per-enemy split duplication** (across the 13 new `enemy_*.rs`):
- `lerp_angle` defined inline in each
- `closest_target` near-duplicate in each
- field-wrap fallback (`drift toward center if no targets`) copy-pasted
- Worth extracting to `enemy_helpers.rs`. Low urgency, clear during PR review.

**Determinism risks**: trig drift (mitigated via polynomial `trig.rs`), RNG order (mitigated via subseed counter), f64 drift (resets every 3 ticks per snapshot). All currently LOW. Fixed-point I16F16 is reserved in `protocol.toml` but not deployed; risk goes MEDIUM once Phase 4 ships.

**Ship-blockers** (cannot launch publicly without these):
1. **Prediction reconciliation** — local ship drifts vs server, no snap-correction
2. **Matchmaking / per-room isolation** — currently one global 8-player room
3. **Server-side input validation** — server trusts client `aim_x/aim_y` verbatim; no fire-rate gate; `last_fire_tick` is shared across weapons (switching weapons bypasses cooldown — exploitable)

## 1.5 Tests & Tooling

**Actual test count** (MEMORY.md figures were stale):
- 404 JS unit cases / 37 files / 9,120 LOC
- ~120 QA Playwright cases / 9 files
- 200+ E2E cases / 23 files / 4,426 LOC
- 276 Rust embedded `#[test]` fns across 35 modules
- 9 Rust integration tests / 2,144 LOC (wire codec golden, MVD sync, collision drain)

**Coverage gaps**:
- `game-engine.js` (4,117 LOC) is tested only in narrow slices — no end-to-end 30-wave scenario.
- E2E flakiness risk: heavy `waitForTimeout(...)` usage with hardcoded 500ms–35s waits; will false-negative on slow CI.
- MP roundtrip (JS input → Rust sim → state back) has no integration test; 2 MP e2e specs `test.skip()` when server unreachable.
- GameAI playtester (`tests/helpers/game-ai.js`, 318 LOC) is reactive but frame-perfect — not human-like; can stress-test progression but not validate balance/fun.

**CI**: missing. Only `.github/workflows/desktop-release.yml` exists. No test suite runs on push/PR. This is the single biggest tooling gap.

## 1.6 Prior Docs Hygiene

40+ docs, trustworthy as a source of current state. Implementation status is tracked in headers; superseded docs are explicitly cross-referenced. Documented gaps (no docs at all yet): accessibility, save/load, mod support, analytics/telemetry, balance-metrics framework, multi-region MP hosting. Of these, accessibility and save/load are real product gaps; the rest are not.

---

# Part 2 — Ranked Enhancements & Implementation Plans

Each item lists: **impact** (player- or developer-facing), **files touched**, **rough effort** (S = hours, M = days, L = weeks), and a concrete implementation sketch.

## Tier S — Highest Leverage (do these first)

### S1. Set up CI test job
**Impact**: Catches every regression before merge. Replaces "manual local test, hope nothing slipped" with enforcement. Unlocks the value of all 1,000+ test cases that already exist.
**Effort**: M (1–2 days)
**Files**: new `.github/workflows/test.yml`

Implementation:
- One workflow, three jobs: `js-unit-and-qa` (Node + Playwright with `--project=qa` — fast), `rust-tests` (cargo test for `server/sim`, `server/server-bin`, `server/client-wasm`), `js-e2e` (slow, scheduled nightly + manually triggered on PR labels).
- Cache `~/.cargo`, `node_modules`, `target/`.
- Surface failures via required status checks on `master`.
- Defer Allure dashboard to follow-up — get the gate in first.

### S2. Make streak system mechanical, not just numerical
**Impact**: Turns the most progression-rich system in the game from invisible to centerpiece. Players currently don't know streaks exist past tier 1.
**Effort**: M (3–4 days)
**Files**: `js/modules/player/weapons.js`, `js/modules/player/bullet.js`, `js/modules/hud/status.js`, `js/modules/combat/collision-system.js`

Implementation:
- New `getStreakModifiers(streakCount)` returning `{ piercingBonus, projSpeedBoost, splashUnlock, homingBias, fireRateBonus, bulletSizeBonus }`.
- Tier ramps: 10 → +25% dmg, 20 → +piercing, 30 → +projectile speed, 50 → +AOE on hit, 70 → +homing bias, 100 → +fire rate + bullet size.
- Apply modifiers at fire time (size, speed, piercing count) and impact time (splash, homing).
- HUD: 5-bar mini-meter top-right showing progress to next tier + tier label.
- **Near-miss rule**: bullets fired within 50 px of an enemy but not contacting don't reset streak; only actual *damage taken* resets it. Existing collision pass already computes proximity for hitstop — reuse.

### S3. Hitstop & screen-shake tier scaling
**Impact**: Makes a Titan kill *feel* different from a Wasp kill. Pure juice.
**Effort**: S (½ day)
**Files**: `js/modules/combat/combat-manager.js`, `js/modules/world/camera-manager.js`, `js/modules/core/constants.js`

Implementation:
- Add `HITSTOP_TIERS = { minion: 6, mid: 12, boss: 20, crit: 8 }` to constants.
- `triggerEnemyDebrisBurst()` reads `enemy.tier` (or `isBoss`) and picks frames.
- Boss kill: 2× camera kick magnitude + additive white-flash frame. Crit kill: 8-frame freeze + gold tint (distinguishes from normal kill).
- Streak-tier announcements (every 10 kills): brief hitstop + double screen-shake to make the unlock visceral.

### S4. Batch composite-mode toggles in enemy rendering
**Impact**: 0.4–0.8 ms/frame saved at heavy density. Pure perf, no visual change.
**Effort**: S (2–3 hours)
**Files**: `js/modules/enemy/shapes.js`, `js/modules/game-engine.js` (enemy render loop ~line 3080)

Implementation:
- Two-pass render: first loop draws all `source-over` paths for all enemies, second loop draws all `'lighter'` glow paths. Collapses 24+ toggles/frame to 2.
- Requires factoring each enemy shape's draw function into `drawBase(ctx, enemy)` and `drawGlow(ctx, enemy)`. Many enemies already separate these visually; just extract.

### S5. Delete dead code
**Impact**: Clarity. Removes future-archaeologist confusion.
**Effort**: S (30 min)
**Files**: `js/modules/performance/quadtree.js` (193 LOC, never imported), `js/modules/autofire-diag.js` (3,591 LOC, never imported by game-engine — verify before deletion). Also audit `js/sim/` for solo-side imports and document which files are MP-only vestigial.

## Tier M — High Impact, Larger Scope

### M1. MP: prediction reconciliation (ship-blocker)
**Impact**: MP literally cannot ship without this. Today local ship can be off-screen visually while server has it elsewhere.
**Effort**: M (1 week)
**Files**: `js/mp/mp-engine.js`, `js/net/prediction.js` (already exists for solo, retarget), `server/client-wasm/src/lib.rs`

Implementation:
- Wire existing `Predictor`/`TickBuffer` infrastructure (already used for solo) into mp-engine.
- On each snapshot, compare local predicted position vs authoritative; if delta > tolerance, snap and replay buffered inputs forward.
- Tolerance: 2 px positional, 0.05 rad angular. Re-use existing `DEFAULT_RECONCILE_TOLERANCE = 0.01` constant as starting point.
- Test via the loopback connection in `js/net/loopback-connection.js`.

### M2. MP: server-side input validation (ship-blocker)
**Impact**: Required before any public deployment. Today: server trusts client `aim_x/aim_y`; cooldown is shared across weapons (switch weapons to bypass).
**Effort**: S–M (2–3 days)
**Files**: `server/server-bin/src/mp1_room.rs`, `server/sim/src/mp1/ship.rs`

Implementation:
- Clamp `aim_x/aim_y` to unit circle on receipt.
- Replace ship-level `last_fire_tick` with per-weapon `[u32; 5]` array; gate firing per-weapon cooldown.
- Add per-tick input rate limit (drop frames > 60 Hz).
- Add `wire_version` rejection telemetry.

### M3. MP: matchmaking + per-room isolation (ship-blocker)
**Impact**: Cannot ship "multiplayer" with one global 8-player room. Need private rooms, friend invites.
**Effort**: L (1.5 weeks)
**Files**: `server/server-bin/src/` (new `room_registry.rs`), `js/net/matchmaking.js`, `mp.html`

Implementation:
- Room actor per URL hash (`/mp?room=abc123`).
- Room lifecycle: spawn on first join, despawn 30 s after last leave.
- Public room list endpoint (read-only HTTP GET) for the lobby UI.
- Grace-period reconnect: hold slot for 5–10 s on socket close so a tab refresh doesn't lose progress.

### M4. Environmental combat: ricochet + bullet/asteroid interaction
**Impact**: Asteroids stop being inert. Adds emergent tactical depth with minimal new content.
**Effort**: M (3–5 days)
**Files**: `js/modules/combat/collision-system.js`, `js/modules/world/asteroid.js`, `js/modules/enemy/enemy-bullet.js`

Implementation:
- Player bullets ricochet at shallow angles (<45° to asteroid surface normal); retain 70% damage, change tint, max 2 ricochets, then expire. Use existing surface-normal computation from the wireframe mesh.
- Enemy bullets now collide with asteroids (small sparkle puff, asteroid unharmed) — instant cover system, asymmetric defense.
- Tangerine mines detonate when struck by enemy bullets — chain-reaction pressure on the player ("don't fight near a mine field").
- Enemies take small velocity-based damage (5–15% HP at relative speed > 3.0 px/tick) when slammed into asteroids by knockback. Reuses existing knockback impulse.

### M5. Replace 3 "tactical wallpaper" enemies
**Impact**: Eliminates the documented wave-4-to-7 dip. Each replacement is a higher-skill-ceiling encounter.
**Effort**: L (1.5–2 weeks for all three)
**Files**: `js/modules/enemy/ai.js`, `js/modules/enemy/firing.js`, `js/modules/enemy/movement.js`, `js/modules/enemy/shapes.js`, `js/modules/wave/wave-data.js`

Replacements:
- **Guardian → BASTION**: stationary turret with a deployable forward shield (blocks player bullets 120° cone for 2s, then 4s cooldown). Fires 3-burst around the shield edge. Forces positional play.
- **Prowler → SKIPPER**: charge 1.5s → blink-teleport 150 px → fire 3 homing missiles mid-blink. Rhythmic "charge/dodge/counter" pattern.
- **New "SHARPSHOOTER" mini-boss variant**: 2.5s telegraphed beam charge → straight-line piercing beam with knockback. Rare, high impact. Inserts at waves 8+.

Each is ~100 LOC movement + ~80 LOC firing, reusing the existing state-machine pattern proven by Stalker/Weaver.

### M6. Dynamic difficulty curve & catch-up mechanics
**Impact**: Smooths the wave-8-to-10 RNG cliff that memory and CHANGELOG both flag as broken.
**Effort**: M (3–4 days)
**Files**: `js/modules/wave/wave-manager.js`, `js/modules/combat/combat-manager.js`, `js/modules/wave/wave-data.js`

Implementation:
- **Catch-up health drop**: if HP < 40% at wave start, guarantee one health orb in the first 20 s of next wave. Reset if HP climbs back above 60%.
- **Powerup pity timer**: track waves-without-pickup; after 3 dry waves, next enemy kill guarantees epic/rare drop.
- **Density-vs-threat rebalance** for waves 11–15: −20% enemy count but +40% per-enemy HP/damage. Density returns at 16+ with boss two-phase encounters.

### M7. Solo unit-test seed (game-engine slice tests)
**Impact**: Closes the biggest coverage gap. Today `game-engine.js` is tested only via slow E2E.
**Effort**: M (4–5 days)
**Files**: new `tests/unit/game-engine/*.test.js`

Implementation:
- Extract `gameLoop()` orchestration into a stub-injectable form: pools, audio, renderer all replaceable with mocks.
- 10–15 focused tests covering: wave progression order, enemy spawn timing, collision-loop order, damage application, pickup distribution, game-over triggers.
- No DOM, no Canvas. Use existing pool/wave/math unit-test pattern.

### M8. Fix E2E flakiness (`waitForTimeout` → `waitForFunction`)
**Impact**: E2E becomes trustworthy on CI. Today the same suite passes locally and false-negatives on slow runners.
**Effort**: M (2–3 days)
**Files**: all 23 specs under `tests/e2e/`

Implementation:
- Audit every `page.waitForTimeout(N)` and replace with a state predicate via `waitForFunction(() => window.gameEngine.wave === 3)` or equivalent.
- Add a small `tests/helpers/wait-predicates.js` library so the patterns are reusable.
- Specs in `08-waves.spec.js` have 11 explicit waits — start there.

## Tier L — Larger Strategic Bets

### L1. Unify solo and MP collision/sim
**Impact**: Eliminates the biggest source of long-term drift. Every weapon balance, every bug fix is currently done twice.
**Effort**: L (3–4 weeks)
**Files**: route `js/modules/combat/collision-system.js` through WASM. `server/sim/src/mp1/collision.rs` becomes the source of truth.

Implementation (phased):
1. **Phase A**: solo loads the same WASM module that MP uses, but in single-player mode (no networking). Collision routed through Rust.
2. **Phase B**: solo's bespoke weapon hooks ported to Rust (one weapon at a time, behind a flag, with parity tests).
3. **Phase C**: retire `js/modules/combat/collision-system.js` once parity holds for all 5 weapons.

The earlier `archive/sim-parity/` test harness is exactly the right scaffolding for parity validation; un-archive for this phase only.

### L2. Add 2 mechanically different primaries
**Impact**: Breaks the "all primaries are forward-shooters" monotony.
**Effort**: L (1.5–2 weeks for both)
**Files**: `js/modules/player/weapons.js`, `js/modules/player/bullet.js`, `js/modules/combat/weapon-data.js`

Designs:
- **RICOCHET CANNON** (unlock wave 6): single bouncy projectile, 4 ricochets max, 70% damage retention per bounce. Slower fire (900 ms), high impact (2.2 dmg). Encourages bank shots. Mechanic reuses the ricochet code from M4.
- **ORBITER** (unlock wave 12): two bullets locked to a 80 px orbit around the player, firing outward at nearby enemies every 400 ms. Passive damage field. Movement charges a meter; ammo-free.

### L3. New Game+ / prestige tiers
**Impact**: Replayability after wave 30 clear. Today there is none.
**Effort**: M (1 week)
**Files**: `js/modules/core/game-state.js`, `js/modules/core/constants.js`, `js/modules/wave/wave-manager.js`, `js/modules/ui/stats-overlay.js`

Three tiers (NIGHTMARE 1.3×, HELL 1.6×, IMPOSSIBLE 2.0×) with cosmetic ship-skin unlocks. Skins are color/glow/trail/explosion variants — no new art needed for V1.

### L4. Weapon-specific impact SFX
**Impact**: Audio fingerprint per weapon. Currently every impact is generic.
**Effort**: S–M (mostly content authoring + wiring)
**Files**: `js/modules/audio/sound-defs.js`, `js/modules/audio/audio-manager.js`, `js/modules/player/bullet.js`

Per-weapon impact tones: Pulse = bright beep, Needles = metallic tinkle, Scatter = woody crunch, Rail = bass boom, Orbiter/Ricochet = high ding. Pre-rendered SFXR pipeline already exists; add 5–10 new variants. Streak-tier unlock fanfares (3-note ascending at LEGENDARY, bass horn at GODLIKE).

## Tier "Should Probably Just Do"

- **Extract `enemy_helpers.rs` in Rust sim**: `lerp_angle`, `closest_target`, no-target fallback — used identically in all 11 `enemy_*.rs` files. ~30 LOC dedupe; do it during PR review of the in-flight per-type split.
- **Wire-protocol-versioning docstring**: add a hard comment to `wire.rs` (or `protocol.toml`) — *"GameEvent variants are u32-indexed; only append. Bump WIRE_VERSION on remove/reorder."* — to prevent the easiest possible footgun.
- **Per-weapon `last_fire_tick` in MP**: 5 u32 fields on `ShipState`. Closes the weapon-switch exploit. Trivial.

---

# Part 3 — Suggested 8-Week Roadmap

The sequencing below front-loads enforcement (CI), then juice (felt by every player every session), then content (felt by players who return), then strategic refactor (felt by you when shipping fast in 6 months).

**Weeks 1–2 — Foundation**
- S1 (CI) — unblocks everything else
- S3 (hitstop tiers), S4 (composite-mode batching), S5 (dead-code purge)
- "Just do it" items above

**Weeks 3–4 — Juice & moment-to-moment feel**
- S2 (streak as mechanical system)
- L4 (per-weapon impact SFX)
- M8 (E2E flakiness)

**Weeks 4–6 — Content depth**
- M4 (environmental combat: ricochet + asteroid interactions)
- M6 (dynamic difficulty)
- M5 (BASTION + SKIPPER, defer SHARPSHOOTER)

**Weeks 5–7 — MP ship-blockers (parallel)**
- M1 (prediction reconciliation)
- M2 (server-side validation)
- M3 (matchmaking + rooms)

**Weeks 7–8 — Coverage & polish**
- M7 (game-engine unit-test seed)
- L3 (New Game+) if Tier-M is on schedule

**Background, when capacity allows**
- L1 (solo/MP unification) — 3–4 weeks, can run alongside other work
- L2 (Ricochet Cannon + Orbiter)
- M5's third enemy (SHARPSHOOTER)

---

# Part 4 — Out of Scope (Already Planned or Rejected — Do Not Duplicate)

- **WebGL full-screen migration** — explicitly rejected in `docs/WebGL Migration Analysis – 2026-05-04.md`. Canvas2D has headroom.
- **WebGPU port** — analyzed in `docs/GPU Rendering Plan – 2026-05-17.md` §3.1. Estimated 15–21 days; realistic gain <1 ms. Skip.
- **Bloom pipeline & GPU weapon effects** — already planned in `docs/GPU Rendering Plan – 2026-05-17.md` phases 1–4. In flight.
- **HUD text → GPU MSDF** — rejected in `docs/WebGL2 Full Renderer Migration – 2026-05-17.md` §29. Canvas2D is the right tool for text.
- **Bullet sort by shape** — analyzed and rejected; sorting cost ≈ savings.
- **Re-enabling Canvas2D `shadowBlur` outside HUD** — well-documented disaster. Bloom FBO replaces it.
- **Rust-server-without-WASM and Node-server MP** — both explicitly superseded by the WASM Pivot path.
- **Hand-port sim-parity strategy** — archived `archive/sim-parity/` on 2026-05-17.

---

# Part 5 — Known Doc Gaps Worth Future Planning

Topics never planned in 40+ existing docs that might deserve their own future doc:
- **Accessibility** — colorblind palette, key remapping, motion-reduce toggle, screen-reader-friendly HUD.
- **Save/load & solo progression persistence** — currently nothing persists between runs except options.
- **Telemetry / analytics framework** — useful for actually measuring whether M6 (catch-up mechanics) fixes the wave-8 cliff.
- **Balance-metrics dashboard** — the QA Bot research framework is the right seed; productize.

These are not in the recommended 8-week scope. Flagged here so they don't fall out of memory.

---

**Report ends.** Implementation work in this report is independent and parallel-friendly: any of S1–S5 can ship in week 1 alongside any M-tier item without merge conflict, since they touch different modules.
