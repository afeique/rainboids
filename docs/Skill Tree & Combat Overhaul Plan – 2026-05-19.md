# Skill Tree & Combat Overhaul — Plan

**Created:** 2026-05-19
**Status:** Draft, awaiting implementation approval
**Owner:** Claude + Afeique

## Scope

Seven separable changes, sequenced as **seven commits**. The first six are
mechanical / data; the seventh is a UI rewrite that consumes the now-cleaned
upgrade structure.

1. PASSIVE upgrade class — new category for always-on, weapon-agnostic upgrades
2. HOMING & PIERCING become per-weapon upgrades (removed from global powerups)
3. BRN / STUN elemental status system (foundation for Nova lightning + per-weapon procs)
4. Nova Blast lightning + stun + chain-reaction upgrades
5. Mine defensive shield zone (plasma aura that protects player)
6. CLUSTER_LAUNCHER — new 6th primary weapon
7. Diablo-style skill-tree UI replacing the shop screen

## User decisions (locked in)

- **Sequencing**: Phased, multiple commits, plan first.
- **BRN/STUN mechanics**: Standard DOT + freeze, **no stun-immunity window** —
  enemies can be repeatedly stunned.
- **Cluster Launcher**: Adds a 6th primary, doesn't replace any existing weapon.
- **Skill tree UI**: Replaces SHOP screen only. Level-up 3-card pick UI untouched.
- **HOMING / PIERCING**: Become per-weapon upgrades; applicable only where they
  make sense.

## Phase ordering — why this sequence

The first three phases are **foundation**: they restructure data and add the
status-effect engine that later phases depend on. Phases 4-6 are **features**
that consume the foundation. Phase 7 is **UI** that consumes all of phases 1-6.

```
Phase 1 (PASSIVE class) ─┐
Phase 2 (per-weapon HOMING/PIERCING) ─┐
Phase 3 (BRN/STUN engine) ─┬──┐
Phase 4 (Nova lightning/chain) ──┤
Phase 5 (Mine shield zone) ──────┤
Phase 6 (Cluster Launcher) ──────┤
                                  ▼
                          Phase 7 (Skill Tree UI)
```

Phases 1-3 unblock phase 4. Phases 4-6 are independent and can be reordered
if priorities change. Phase 7 must come last to consume the final data shape.

---

## Phase 1 — PASSIVE upgrade class

**Goal:** Establish a clean fourth category alongside PRIMARY / POWER / SKILL.
PASSIVE upgrades are always-on, no weapon binding, no skill binding. Moves
existing upgrades that fit this shape; doesn't add new mechanics.

**Estimated LOC:** ~300 (mostly data movement + minor renames)

### Files touched

- `js/modules/combat/weapon-data.js` — add `PASSIVE_UPGRADES` export
- `js/modules/combat/combat-manager.js` — wherever PRIMARY_UPGRADES is iterated for "general" upgrades, add PASSIVE_UPGRADES branch
- `js/modules/shop/shop-manager.js` — register PASSIVE category for shop browse
- `js/modules/player/progression.js` — level-up pick generator may need PASSIVE branch
- `js/modules/player/player.js` — `getPowerupStacks` already namespace-agnostic; just verify
- `tests/unit/` — add test that PASSIVE_UPGRADES exports + iterates correctly

### Upgrades moving to PASSIVE

```
THORNS              VAMPIRISM           EXECUTIONER
HEALTH_BOOST        SHIELD_BOOST        SPEED_BOOST
CRIT_CHANCE         CRIT_DAMAGE         LONG_RANGE
SPARE_SHIP          RAPID_FIRE          MULTI_SHOT
IRON_WILL           EXPLOSIVE*
```

`*EXPLOSIVE` is a global powerup today (adds AoE to bullets). It's a judgment
call whether it should be per-weapon or stay global. Recommendation: keep
global as a PASSIVE (universal AoE on bullet impact); skip the cluster
launcher and beam weapons in the apply-path.

### Acceptance criteria

- New `PASSIVE_UPGRADES` export with the upgrades above.
- Existing references to those IDs in code still work (no rename of the IDs
  themselves; just the category they belong to).
- Shop still shows the upgrades (under a PASSIVE tab or in the same browse
  list — design decision deferred to Phase 7).
- Unit tests: 1 test that iterates and verifies all expected IDs are in
  `PASSIVE_UPGRADES`.

### Risks

- Anything iterating `Object.values(PRIMARY_UPGRADES)` and expecting global
  upgrades will break. Grep + fix at refactor time.

---

## Phase 2 — Per-weapon HOMING & PIERCING

**Goal:** Remove HOMING / PIERCING as global powerups. Each weapon that
semantically supports them gets its own per-weapon upgrade. Cluster Launcher,
Lance Beam, Nova Blast, Mine Layer, Lightning Arc do NOT receive these
upgrades.

**Estimated LOC:** ~400 (4 weapons × 2 upgrades, plus removal of global
HOMING/PIERCING handling)

### Files touched

- `js/modules/combat/weapon-data.js` — remove HOMING/PIERCING from global
  powerups; add per-weapon variants:
  - `PULSE_HOMING`, `PULSE_PIERCING`
  - `NEEDLE_HOMING`, `NEEDLE_PIERCING`
  - `SCATTER_PIERCING` (HOMING n/a for pellets)
  - `RAIL_PIERCING` (HOMING n/a for kinetic slug)
  - `CHARGE_HOMING`, `CHARGE_PIERCING`
  - `MISSILE_PIERCING` (HOMING is already innate; upgrade boosts homing strength via existing path)
- `js/modules/player/weapons.js` — `getPowerupStacks('HOMING')` calls become
  `getPowerupStacks('PULSE_HOMING')` (etc.) at each per-weapon firing path
- `js/modules/player/bullet.js` — `powerups.has('PIERCING')` becomes
  per-weapon. The bullet already carries `weaponId`; gate at the source path
  instead, OR keep a derived `bullet.piercing` boolean set on spawn.
- `js/modules/combat/collision-system.js:1452-53` — DROP_RATES table loses
  HOMING/PIERCING entries since they're no longer global powerups.
- `js/modules/world/powerup.js:917` — remove `HOMING` powerup spawn case.
- `js/modules/hud/cursor.js:295` — piercing-count display logic adapts to
  per-weapon (or hides for cluster).

### Per-weapon applicability matrix

| Weapon            | HOMING upgrade | PIERCING upgrade |
| ----------------- | -------------- | ---------------- |
| PULSE_CANNON      | ✓              | ✓                |
| STORM_NEEDLES     | ✓              | ✓                |
| SCATTER_GUN       | —              | ✓                |
| RAIL_DRIVER       | —              | ✓                |
| LANCE_BEAM        | —              | innate           |
| CHARGE_SHOT       | ✓              | ✓                |
| MINE_LAYER        | —              | —                |
| NOVA_BLAST        | —              | —                |
| MISSILE_SALVO     | innate         | ✓                |
| LIGHTNING_ARC     | —              | — (chains)       |
| CLUSTER_LAUNCHER  | —              | —                |

### Acceptance criteria

- Global HOMING/PIERCING powerups removed from drop pool and POWERUP_TYPES.
- Each weapon's per-weapon HOMING/PIERCING upgrade visibly affects only that
  weapon's bullets in playtest.
- Bullet behavior preserved for existing builds: a player who previously
  had `HOMING:3` running PULSE_CANNON now has `PULSE_HOMING:3` (migration
  not needed since saves aren't persistent across runs).

### Risks

- Bullet objects may need a `homing` flag set at spawn time (replacing the
  current "checked-at-update-time global-stack lookup"). This is a small
  semantic shift; existing tests should still pass since behavior is
  identical for any single weapon.

---

## Phase 3 — BRN / STUN elemental status system

**Goal:** Add two reusable status effects that any weapon can apply. Both
attach to the enemy object as a timer + state, are rendered as HUD
indicators on the enemy, and decay independently. Foundation for Phase 4.

**Estimated LOC:** ~500

### Mechanics — locked

| Effect | Behavior |
| ------ | -------- |
| **BRN (burn)** | Tick **10% of source damage every 0.5s for 3s**. Max **3 stacks** (each new application increments stack; duration refreshes on each apply). Per-tick damage scales with stack count linearly. Enemies dying from BRN ticks award normal XP + kill counters. |
| **STUN** | Enemy stops moving (vel → 0 over 4 frames), stops firing, loses AI target. Lasts **1.5s**. **No immunity window** — repeated stun applies refresh the timer. Stunned enemies still take damage normally (no vulnerability multiplier in v1). Visual: enemy outline tints electric blue + halts in place. |

### Files touched

- `js/modules/enemy/enemy.js` — new fields on Enemy reset:
  - `this.brnStacks = 0; this.brnTickAt = 0; this.brnUntil = 0; this.brnSource = 0`
  - `this.stunUntil = 0`
- `js/modules/enemy/enemy.js` update path — apply BRN ticks, enforce STUN
  freeze (skip movement/firing branches when `stunUntil > now`).
- `js/modules/combat/combat-manager.js` — new helpers:
  - `applyBurn(enemy, damage, duration?)` — adds stack, sets BRN state
  - `applyStun(enemy, duration?)` — refreshes stun timer
- `js/modules/combat/collision-system.js` — call `applyStun` from Arc
  Lightning hit path with `Math.random() < 0.25`; call `applyBurn` from
  Lance Beam hit-tick with `Math.random() < 0.15`.
- `js/modules/hud/combat.js` or new `js/modules/hud/status-icons.js` —
  render small BRN/STUN icons over affected enemies (flame icon + bolt icon).
- `js/modules/world/particle.js` — new particle types:
  - `burnFlame` — small flickering flame attached to enemy
  - `stunArc` — short electric arcs above stunned enemy
- `tests/unit/` — new unit tests:
  - BRN ticks correct N times over 3s
  - BRN stacks cap at 3 + refresh duration
  - STUN freezes velocity + firing
  - Repeated STUN extends timer (no immunity gap)

### Integration with existing damage path

`applyDamageToEnemy(enemy, damage, opts)` gains optional `opts.applyBurn` and
`opts.applyStun` flags; weapons that should proc check `Math.random()` at
the call site and set the flag. BRN ticks fire as auto-damage events through
the same `applyDamageToEnemy` path (with `opts.showNumber: false` so the
number floaters don't spam) — they hit damage stats, vampirism, kill
streaks just like normal hits.

### Acceptance criteria

- Damage numbers from BRN ticks appear faintly red and float upward.
- Stunned enemy outline visibly cycles between enemy-color and electric blue.
- Arc Lightning visibly procs stun roughly 1 in 4 hits.
- Lance Beam visibly procs burn roughly 1 in 7 hits.
- BRN ticks contribute to kills, XP, and gold drops correctly.

### Risks

- Status icon rendering adds per-frame cost. Mitigate by only walking
  enemies with active status (most won't have any).
- BRN through hit-stop / pause: pause the timers when game is paused.

---

## Phase 4 — Nova Blast lightning + chain-reaction

**Goal:** Beyond the existing `SHOCKWAVE`, `AFTERSHOCK`, `DOUBLE_PULSE`,
`RESONANCE` upgrades, add three new ones that consume the Phase 3 status
system. Chain reaction is the marquee upgrade.

**Estimated LOC:** ~400

### New upgrades

| ID | Name | Effect |
| -- | ---- | ------ |
| `NOVA_LIGHTNING` | Static Discharge | 30% chance per enemy hit to stun (uses Phase 3 STUN). +1 stack reaches 60% / +2 stacks 100%. Max 2 stacks. |
| `NOVA_CHAIN`     | Chain Reaction   | Each enemy killed by Nova triggers a smaller secondary Nova at its position (60% radius, 40% damage). Secondary novas CAN trigger their own chains, up to **3 hops** total. Max 1 stack. |
| `NOVA_INFERNO`   | Inferno          | Nova's expanding shockwave applies BRN to every enemy it passes through. Max 1 stack. |

### Files touched

- `js/modules/combat/weapon-data.js` — add 3 new upgrade IDs under
  `POWER_UPGRADES` with `weapon: 'NOVA_BLAST'`.
- `js/modules/combat/collision-system.js` `checkNovaCollisions` — on each
  enemy hit:
  - if `NOVA_INFERNO` stack > 0 → `applyBurn(enemy, baseDamage)`
  - if `NOVA_LIGHTNING` rolled true → `applyStun(enemy)`
  - if enemy killed AND `NOVA_CHAIN` > 0 AND hops remaining → enqueue a
    secondary nova spawn (60% radius, 40% damage, hopsRemaining-1)
- `js/modules/game-engine.js` (or wherever nova spawning lives) — secondary
  nova spawn helper that takes `(x, y, radius, damage, hops)`.
- `js/modules/world/particle.js` — chain-reaction visual: arcing white
  energy between the killed enemy and the new nova center (~150ms).

### Acceptance criteria

- A Nova with all 3 new upgrades + max ranks visibly chains across a
  cluster of enemies, applying burn + stun to survivors.
- Chain depth caps at 3 hops (visible in playtest by chasing a long enemy
  line — only 3 secondary detonations).
- No frame-rate hit on chain detonations (use existing nova FX, no new
  particle pool needed beyond the chain arc).

### Risks

- Recursive chain could blow up if we don't enforce hop cap correctly.
  Defensive: per-spawn `hops` counter, hard ceiling of 3.

---

## Phase 5 — Mine defensive shield zone

**Goal:** Each armed mine emits a soft plasma shield around itself. While
the player is inside any mine's shield zone, incoming damage is reduced.
Visualizes as a glowing plasma aura using gradient + additive blend.

**Estimated LOC:** ~300

### Mechanics

- **Zone radius**: 120px (independent of mine trigger radius, which is
  smaller).
- **Damage reduction**: 40% on player damage taken while inside any zone.
  Doesn't stack — being inside two mines' zones still gives 40%.
- **Visual**: each armed mine renders a radial gradient (plasma blue →
  transparent) with `globalCompositeOperation = 'lighter'`. Pulses on a
  slow sine. When the player crosses into the zone, briefly bright-flashes
  the edge they crossed.
- **Mine trigger behavior unchanged**: mines still detonate on enemy
  contact / proximity as before.

### Files touched

- `js/modules/enemy/enemy-bullet.js` (mines live here) — add `shieldRadius`
  field on mine init.
- `js/modules/combat/combat-manager.js` `handlePlayerEnemyBulletCollision`
  + `handlePlayerEnemyCollision` — wrap incoming damage with mine-shield
  multiplier:
  - new helper `getMineShieldMultiplier(player)`: returns 0.6 if any active
    mine within `shieldRadius` of player, else 1.0
- `js/modules/enemy/enemy-bullet.js` draw path — mine renders an extra
  plasma aura layer (gradient + additive composite).
- `js/modules/world/particle.js` — new particle type `mineShieldCrossing`
  for the edge-flash effect.
- `tests/unit/` — verify multiplier returns 0.6 inside zone, 1.0 outside.

### Acceptance criteria

- Plasma aura is clearly visible around each armed mine.
- Player taking damage inside the zone visibly takes less.
- Performance: rendering 5 simultaneous mine auras costs <0.5ms/frame.

### Risks

- Additive blending with the starfield + bloom could oversaturate; cap
  alpha at 0.45 max and tune in playtest.
- If the player camps inside a mine zone, gameplay becomes too easy.
  Acceptable — mines have a finite count + lifetime; this is a deliberate
  reward for clever play.

---

## Phase 6 — CLUSTER_LAUNCHER (new 6th primary)

**Goal:** Add a new primary weapon with novel mechanics — projectile
arcs to cursor, decelerates via friction, halts, sits, detonates on
timer or enemy proximity, spawns secondary bomblets.

**Estimated LOC:** ~600

### Mechanics

| Stage | Behavior |
| ----- | -------- |
| Travel | Projectile fires from player toward cursor. Initial velocity high (~12 px/frame), friction multiplier 0.92 per frame. Reaches near-zero velocity in ~30 frames. |
| Halt | When `|vel| < 0.3`, projectile snaps to stationary, starts armed timer. |
| Armed | Idle for 0.8s. Pulses red/white. Auto-detonates if any enemy enters proximity radius (60px) or timer expires. |
| Detonation | Primary blast: 90px AoE, big damage (~50 base). Spawns **5 sub-bombs** at random angles, velocity 4 px/frame each, friction 0.94/frame, travel ~20 frames. Sub-bombs detonate on enemy contact OR end-of-flight. Sub-blast: 50px AoE, 25 damage. |

### Files touched

- `js/modules/combat/weapon-data.js` — add `CLUSTER_LAUNCHER` to
  `PRIMARY_WEAPONS` with `cooldown: 800ms`, `damage: 50`, `range: 800`.
- `js/modules/player/weapons.js` — new firing path that spawns a
  `ClusterBomb` projectile (or extends existing Bullet with a `cluster`
  shape).
- `js/modules/player/bullet.js` — `ClusterBomb` class (or `Bullet` extension)
  with stages: travel → halt → armed → detonate.
- `js/modules/combat/collision-system.js` — detection branch for cluster
  bomb proximity to enemies (cheap because there's typically <3 in flight).
- `js/modules/combat/combat-manager.js` — `detonateCluster(x, y)` and
  `spawnSubBomblet(x, y, angle, speed)` helpers.
- New per-weapon upgrades:
  - `CLUSTER_PAYLOAD` — +20% damage per stack (max 3)
  - `MORE_BOMBLETS` — +1 sub-bomb per stack (max 2)
  - `SHORT_FUSE` — −0.3s armed time per stack (max 2)
  - `MEGA_CLUSTER` — primary blast +30px radius (max 2)
- New particle/effect types: cluster bomb sprite (drawn in player bullet path),
  pulsing armed-ring, secondary blast FX (reuses Nova-style ring).

### Acceptance criteria

- Cluster bomb visibly arcs and halts at the cursor (or near it; not pixel
  perfect — friction is realistic).
- Sub-bombs visibly spread in random directions, each detonating with a
  smaller burst.
- Damage on primary + secondary detonations registers correctly with stats,
  vampirism, BRN/STUN apply paths.
- Cluster bullets do NOT receive HOMING / PIERCING / EXPLOSIVE upgrades
  (Phase 2 already enforces this).

### Risks

- Friction tuning matters — too short and the bomb lands on the player; too
  long and it overshoots cursor by half the screen. Likely needs in-game
  tuning pass.
- 5 sub-bombs × N cluster bombs in flight can spike particle counts if
  upgrades stack — already handled by Phase 6.16.1 pool growth.

---

## Phase 7 — Diablo-style skill tree (replaces shop screen)

**Goal:** Replace the existing shop browse UI with a visual skill-tree
diagram. Grouped visually by category (Primary / Power / Skill / Passive),
no dependency lines, every node always available to purchase.

**Estimated LOC:** ~1200 (mostly HTML/CSS + interaction layer)

### Visual design

- Full-screen overlay (existing shop modal).
- Top: gold balance + wave indicator (unchanged).
- Body: 4-5 cluster regions, each a category. Within each cluster, nodes
  are arranged in a hexagonal grid (Diablo II style), with the
  category-icon weapon/skill at the center and its upgrade nodes orbiting it.
- Each node: circular button, icon + name + cost. Border color = state
  (unaffordable: gray, affordable: gold, owned: blue with stack count).
- Hover: tooltip with full description.
- Click: buy. Animates a brief "lock-in" flash.
- Bottom: legend + close button.

### Files touched

- `js/modules/shop/shop-dom.js` — REWRITE. Replaces the existing list-based
  layout with the skill-tree layout. Reuses existing data sources
  (`PRIMARY_WEAPONS`, `POWER_WEAPONS`, `DEFENSE_SKILLS`, `PASSIVE_UPGRADES`
  etc. from Phase 1).
- `js/modules/shop/shop-manager.js` — minimal changes; mostly the rendering
  helper signatures change. Purchase logic stays the same.
- `css/styles.css` — significant additions for the tree visual:
  - node grid layout
  - category cluster outlines
  - tooltip styling
  - hover/affordable/owned states
  - subtle background (radial gradient, scrollable parchment-style)
- New SVG / canvas: maybe one decorative connecting-vine between nodes
  within a category (purely visual, NOT a dependency line).
- `tests/qa/` — update or replace `07-weapons.spec.js` shop assertions to
  target the new DOM structure.

### Out of scope for Phase 7

- Dependency lines between nodes (user said: no dependencies).
- Persistent skill points across runs.
- Respec / refund.
- Animation between shop visits.
- Mobile-specific layout polish (will be a follow-up commit).

### Acceptance criteria

- Visiting the shop shows the skill-tree visual instead of the list view.
- All existing upgrades are purchasable through the tree.
- Affordability state updates live as the player buys.
- All existing QA / E2E tests for the shop pass (after targeting the new
  DOM).
- Mobile fallback: tree scales down gracefully (no broken layout).

### Risks

- Highest UI complexity in the codebase to date. Realistically a 1-2 day
  effort by itself. Worth allotting a separate day.
- Custom node positions per category may want JSON-driven layout instead
  of hard-coded CSS grid; deferred decision.
- Tooltip positioning on mobile is fiddly.

---

## Cross-cutting concerns

### Testing strategy

- **Unit tests**: each phase ships its own. BRN/STUN need numeric
  correctness tests (tick count, refresh behavior). Nova chain needs hop-cap
  tests.
- **QA / E2E**: phase 6 (cluster) and phase 7 (UI) need Playwright coverage.
  Phase 5 (mine shield) should have a smoke test that damage is reduced.
- **AI playtester (game-ai.js)**: existing 2-minute survival run should
  still pass after each phase (regression gate).

### Performance budget

- Phase 3 status effects: enemies-with-status will be a small subset; cost
  budget <0.3ms/frame.
- Phase 4 chain reactions: capped at 3 hops, no recursion explosion.
- Phase 5 mine shield: <0.5ms/frame for 5 simultaneous shields.
- Phase 6 cluster bomblets: pool growth already handled in 6.16.1.
- Phase 7 UI: shop is paused; no frame-rate concern.

### Versioning

Each phase = at minimum one MINOR or PATCH version bump, separate commit.
Approximate version targets (relative to current HEAD):

| Phase | Type | Approx version |
| ----- | ---- | -------------- |
| 1     | MINOR (refactor + new category) | x.(y+1).0 |
| 2     | MINOR (new per-weapon upgrades) | x.(y+1).0 |
| 3     | MINOR (new mechanic) | x.(y+1).0 |
| 4     | MINOR (new upgrades) | x.(y+1).0 |
| 5     | MINOR (new defensive mechanic) | x.(y+1).0 |
| 6     | MINOR (new weapon) | x.(y+1).0 |
| 7     | MAJOR or MINOR (UI overhaul) | (x+1).0.0 or x.(y+1).0 |

### Documentation updates per phase

- README.md: update weapon count, controls, upgrade categories.
- CHANGELOG.md: detailed entry per CLAUDE.md format.
- This plan doc: tick each phase off as complete, link to commit hash.

---

## Open questions / decisions deferred

1. **EXPLOSIVE powerup**: Keep global or split per-weapon? Recommend keep
   global as PASSIVE; revisit if Phase 2 reveals integration issues.
2. **Status icon rendering**: HUD overlay vs in-world on the enemy. Recommend
   in-world (small flame + bolt sprites near the enemy outline) — Phase 3 detail.
3. **Cluster bomb friction values**: tune in playtest. Plan-doc numbers are
   starting points only.
4. **Skill-tree node positions**: JSON-driven layout vs hand-tuned CSS.
   Deferred to Phase 7 implementation.
5. **Mobile UX for skill tree**: full Phase 7 mobile pass deferred to a
   follow-up commit after desktop ships.

## Out of scope (deferred indefinitely)

- Save/persist upgrades across runs.
- Skill respec or refund.
- Multiplayer integration of any of the new mechanics (MP is on its own
  separate timeline).
- New enemy types that resist BRN or STUN (could be a future "elemental
  immunity" upgrade pass).
- Difficulty tuning of the new weapons against existing balance — assume
  initial tuning is rough, will be refined post-launch.

---

## Implementation order (recommended commit cadence)

| # | Phase | Commit title | Est. session length |
| - | ----- | ------------ | ------------------- |
| 1 | PASSIVE class | `feat(weapons): introduce PASSIVE upgrade category` | 1-2h |
| 2 | Per-weapon HOMING/PIERCING | `feat(weapons): per-weapon HOMING + PIERCING, remove globals` | 2-3h |
| 3 | BRN/STUN engine | `feat(combat): BRN + STUN elemental status system` | 3-4h |
| 4 | Nova chain | `feat(nova): lightning + chain-reaction + inferno upgrades` | 2h |
| 5 | Mine shield | `feat(mines): defensive plasma shield zone for player` | 2h |
| 6 | Cluster Launcher | `feat(weapons): CLUSTER_LAUNCHER 6th primary weapon` | 3-4h |
| 7 | Skill-tree UI | `feat(shop): Diablo-style skill tree replaces shop screen` | 4-6h |

**Total: ~17-23 hours** of focused implementation + review time.

Phases 1-3 are the highest-leverage early work (unblock 4+). Phase 7 is the
biggest single chunk and should land in its own session.

---

## Approval

Awaiting sign-off from Afeique on:

- [ ] Sequencing and version-bump policy
- [ ] BRN/STUN concrete numbers (10% / 0.5s / 3s ; 1.5s stun)
- [ ] Mine shield numbers (120px radius, 40% reduction)
- [ ] Cluster launcher numbers (friction 0.92, 5 sub-bombs)
- [ ] Skill-tree visual scope (shop-only, no level-up replacement, no
  persistent tree)
- [ ] EXPLOSIVE powerup disposition (keep global PASSIVE recommended)

Reply in chat with any of the above changed; otherwise proceed to Phase 1.
