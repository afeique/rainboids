# Rainboids — Primary Game Codebase Cleanup Report

**Date:** 2026-05-27  
**Scope:** Solo/primary game only: `index.html`, `css/`, `js/main.js`, `js/modules/`, and solo tests. Multiplayer, Rust, deployment tooling, benchmark tooling, Electron packaging, and AI QA tooling are intentionally out of scope except where they affect primary-game cleanup.  
**Current solo version observed:** `7.1.0`  
**Method:** Static code audit, import graph scan, line-count/module-size pass, DOM/global usage scan, and targeted reads of the main orchestrator, collision, persistence, UI, wave, player, enemy, and rendering modules.

---

## Executive Summary

Rainboids is no longer a small Asteroids clone with a few add-ons. The primary game is a feature-rich browser roguelite with persistent meta progression, gear, crafting, 10-stage runs, adaptive difficulty, multiple input modes, bosses, effects layers, and a sizeable automated test suite. The codebase shows real strengths: it is already modularized, it has no detected ES module import cycles, many newer systems are pure/testable, and the file organization mostly reflects domain boundaries.

The cleanup opportunity is concentrated in a few high-gravity integration files:

- `js/modules/game-engine.js` is 5,590 LOC, imports 79 modules, and still owns orchestration, persistence, rendering setup, pools, starfield/orb rendering, run state, pre-run flow, wrapper methods, and main loop behavior.
- `js/modules/combat/collision-system.js` is 3,880 LOC and mixes broad-phase collision, damage routing, status application, enemy special cases, reward drops, boss part routing, haptics, and some UI feedback.
- `js/modules/player/weapons.js`, `js/modules/combat/combat-manager.js`, `js/modules/wave/wave-manager.js`, `js/modules/hud/status.js`, `js/modules/ui/ui-manager.js`, `js/modules/enemy/movement.js`, and `css/styles.css` are each large enough that small changes are easy to make but hard to reason about globally.
- Runtime globals are widely distributed: about 634 `Math.random` references, 278 `Date.now` references, 584 `document.` references, 187 `window.` references, 79 `localStorage` references, and 43 `setTimeout` references under the solo JS entry/module tree.
- Tests are substantial but often need browser shims. At least 40 unit-test files mention browser/global shims, which is a symptom that too many modules do import-time DOM/platform work.

The recommended strategy is not a big rewrite. The safest path is a sequence of thin extraction passes that preserve behavior:

1. Move low-risk rendering/data helpers out of `game-engine.js`.
2. Split collision into collision detection, damage resolution, enemy special reactions, and reward/drop handling.
3. Centralize runtime services for clock, RNG, DOM, storage, timers, and platform checks.
4. Move overlay DOM/style construction into dedicated UI component modules and keep game systems DOM-agnostic.
5. Turn large data catalogs into smaller catalogs plus validation tests.
6. Delete or archive dormant primary-game files only after import/test confirmation.

---

## Current Shape

### Size By Area

Approximate solo JS module size under `js/modules/`:

| Area | LOC | Notes |
|---|---:|---|
| `enemy/` | 16,601 | Largest domain; includes entity, movement/firing, abilities, shapes, bosses. |
| `player/` | 10,753 | Player entity, weapons, abilities, progression, skins. |
| `combat/` | 10,743 | Collision, combat manager, weapon data, effects, elements, passives. |
| `ui/` | 9,772 | DOM overlays, input, gamepad, mobile touch, armory/loadout/inventory/settings. |
| `hud/` | 7,278 | Canvas HUD, overlays, status, cursor, navigation, health bars. |
| `world/` | 7,130 | Asteroids, particles, orbs, items, bounty/matrix/run-shop systems. |
| `wave/` | 4,863 | Wave manager, difficulty director, wave data, run randomizer/templates. |
| `shop/` | 3,320 | Shop/armory/crafting/income. |
| `performance/` | 2,950 | WebGL renderers, spatial grid, batching. |
| `audio/` | 2,669 | Audio manager, music player, generated sound definitions. |
| `core/` | 2,476 | Constants, state machine, storage, event bus, pools, utilities. |
| `render/` | 1,353 | Shared shape renderer. |
| `platform/` | 471 | Haptics, wake lock, platform detection. |
| `assist/` | 379 | Assist config/system. |
| `debug/` | 153 | VFX telemetry. |

There are about 179 solo JS files and about 87k lines under `js/`, excluding CSS and HTML. CSS is also significant: `css/styles.css` is 5,264 LOC.

### Largest Files

| File | LOC | Main Concern |
|---|---:|---|
| `js/modules/game-engine.js` | 5,590 | God-object/integration hub; 79 imports; very broad ownership. |
| `js/modules/combat/collision-system.js` | 3,880 | Collision, damage, reactions, rewards, boss routing, and UI feedback in one place. |
| `js/modules/player/weapons.js` | 2,704 | Weapon firing, projectile behavior, mods, special cases. |
| `js/modules/combat/combat-manager.js` | 2,683 | Kill flow, drops, powerups, status helpers, displays. |
| `js/modules/enemy/movement.js` | 2,375 | Many enemy movement behaviors in one procedural module. |
| `js/modules/wave/wave-manager.js` | 2,335 | Spawning, transitions, missions, draft/shop overlays, timers. |
| `js/modules/hud/status.js` | 2,099 | Canvas HUD plus DOM touches and animation state. |
| `js/modules/ui/ui-manager.js` | 2,073 | Pause/menu UI state, input routing, overlay coordination. |
| `js/modules/enemy/enemy.js` | 2,028 | Entity core plus boss/ability integration. |
| `js/modules/hud/overlays.js` | 1,982 | Title/game-over/completion overlays and animated text. |
| `js/modules/combat/weapon-data.js` | 1,837 | Catalogs plus derivation helpers and compatibility layers. |
| `js/modules/player/player.js` | 1,799 | Player state plus compatibility fields and multiple systems. |
| `js/modules/shop/shop-dom.js` | 1,734 | DOM construction/rendering for shop tree. |
| `js/modules/audio/sound-defs.js` | 1,593 | Generated/source SFX catalog; not runtime-imported by primary game. |

### Import Graph

The graph scan found **no static ES module import cycles**, which is excellent. The coupling problem is therefore not circular imports; it is concentration of responsibilities.

Most imported modules:

| Module | Inbound Imports | Meaning |
|---|---:|---|
| `js/modules/core/constants.js` | 48 | Global constants are a shared dependency for nearly everything. |
| `js/modules/core/utils.js` | 37 | Utilities include pure math plus haptics/DOM import-time behavior. |
| `js/modules/core/color-cache.js` | 24 | Rendering helper is broadly useful and appropriately shared. |
| `js/modules/platform/platform-detect.js` | 24 | Platform/mobile checks are spread through gameplay and UI. |
| `js/modules/combat/weapon-data.js` | 21 | Catalogs are widely consumed by player, UI, combat, HUD, shop, wave. |
| `js/modules/core/frame-clock.js` | 19 | Good pattern, but not consistently adopted. |

Most outgoing imports:

| Module | Outgoing Imports | Meaning |
|---|---:|---|
| `js/modules/game-engine.js` | 79 | Central integration hub. |
| `js/modules/enemy/enemy.js` | 24 | Entity core wires many enemy subfeatures. |
| `js/modules/wave/wave-manager.js` | 20 | Wave manager reaches across world, enemy, UI, combat, and economy. |
| `js/modules/combat/collision-system.js` | 18 | Collision reaches into enemy abilities, boss state, platform, combat, and core. |
| `js/modules/player/player.js` | 15 | Player entity depends on many systems. |
| `js/modules/combat/combat-manager.js` | 13 | Combat manager is another coordination hub. |
| `js/modules/hud/status.js` | 13 | HUD imports gameplay data and UI icons directly. |

---

## What Is Working Well

### 1. Domain Directories Are Mostly Honest

The current directories map to real concepts: `player`, `enemy`, `combat`, `wave`, `world`, `shop`, `ui`, `hud`, `audio`, `platform`, `performance`, and `core`. This is a good foundation. Most cleanup can happen by moving code inside the existing directory structure rather than creating a new top-level architecture.

### 2. Pure Modules Already Exist

Several modules are intentionally pure or close to it:

- `wave/difficulty-constants.js`
- `wave/difficulty-director.js`
- `wave/director-telemetry.js`
- `wave/run-randomizer.js`
- `combat/elements.js`
- `combat/card-draft.js`
- `world/item-system.js` for most item math
- `shop/crafting.js`
- `core/game-state.js`
- `core/event-bus.js`

This proves the codebase can support a cleaner style without a rewrite.

### 3. State Machine And Event Bus Are Good Seeds

`core/game-state.js` has explicit transition validation and an epoch guard pattern for stale callbacks. `core/event-bus.js` is small and synchronous with safe snapshot dispatch. These are exactly the kind of lightweight primitives the rest of the cleanup should lean on.

### 4. Tests Are Substantial

Current counts observed:

- 179 unit test files under `tests/unit/`
- 52 QA specs under `tests/qa/`
- 21 E2E specs under `tests/e2e/`
- 7 performance specs under `tests/performance/`
- About 34.6k LOC across unit/e2e/performance tests, excluding helpers and QA details

Coverage is not uniform, but the project has enough tests to support incremental refactoring.

### 5. Runtime Rendering Layers Are Intentionally Separated

The three-canvas setup in `index.html` is clear:

- `glCanvas` for WebGL particles/starfield.
- `gameCanvas` for core Canvas2D world/HUD work.
- `bulletCanvas` for WebGL bullets above the game canvas.

That layered approach is a strong base for performance work.

---

## Main Cleanup Themes

## 1. Shrink `game-engine.js` Into A Real Orchestrator

### Current Problem

`game-engine.js` has become both a composition root and a subsystem implementation file. It currently includes:

- Constructor and boot state.
- Pool initialization.
- Debug setup.
- Mobile class/zoom/drift behavior.
- Save serialization/restoration.
- Persistent profile and meta progression.
- Weapon fabrication and stash commits.
- Background star generation.
- WebGL star/orb pushing.
- Canvas2D gold/health shape rendering.
- Nebula generation.
- Wave/shop/combat/collision wrapper methods.
- Main update loop.
- Main draw loop.
- HUD/overlay draw wrappers.
- Pause, inventory, armory, hangar, settings, pre-run, loadout, stats flows.
- Survival record formatting.
- Title animation state.

The wrapper-method section alone runs for hundreds of lines and creates the appearance that `GameEngine` owns every capability, even when the implementation lives elsewhere.

### Why It Hurts

- New features are tempted to add one more property/method to `GameEngine`.
- Tests require constructing or faking a very wide object.
- Real subsystem dependencies are hidden behind `.call(this)` wrappers.
- Persistence, rendering, and UI flows are harder to reason about than they need to be.
- The file is too large for safe review; unrelated edits collide.

### Recommended Cleanup

Do this in small behavior-preserving passes:

1. **Extract run persistence into `js/modules/core/run-save.js` or `js/modules/world/run-save.js`.**
   Move `serializeRunState`, `persistWaveStartSave`, `restoreRunState`, and the save-shape helpers out of `GameEngine`. Keep `GameEngine` as the owner of when saves happen, but not how snapshots are shaped.

2. **Extract persistent meta/profile into `js/modules/player/meta-profile.js`.**
   Move `savePersistentProfile`, `applyPersistentProfile`, `saveProgress`, `markMetaDirty`, `flushMeta`, banked progression migration, loadout normalization glue, and account wallet/stash persistence.

3. **Extract starfield/orb renderer glue into `js/modules/world/orb-renderer.js` and `js/modules/world/starfield-system.js`.**
   Move `_pushOrbsToWebGL`, `_drawGoldShapesCanvas2D`, `_drawGoldSparklesCanvas2D`, `_drawHealthShapesCanvas2D`, `_drawHealthShape3D`, `_pushOrbInstance`, `_populateWebGLNebula`, `_dimNebulaColor`, `_parseStarColor`, and starfield dirty flushing. This removes a large block of rendering detail from the engine without changing the render path.

4. **Replace wrapper methods gradually with explicit subsystem objects.**
   Instead of hundreds of methods like `spawnAsteroids(count) { return wave.spawnAsteroids.call(this, count); }`, give the engine `this.wave`, `this.combat`, `this.collision`, and `this.shop` adapters that receive a narrow context object. This can be done one subsystem at a time.

5. **Define a `GameContext` shape for subsystem adapters.**
   It does not need TypeScript. A short JSDoc typedef or README-style module comment is enough:
   - pools
   - player
   - game state
   - events
   - audio
   - camera
   - random/clock
   - UI bridges

### Target Outcome

Get `game-engine.js` under roughly 2,500 LOC. It should boot services, run the frame loop, and coordinate high-level state transitions. It should not contain rendering geometry, save serialization detail, or long subsystem logic.

---

## 2. Split Collision And Damage Resolution

### Current Problem

`combat/collision-system.js` is the biggest risk file in the primary game. It knows about:

- Spatial-grid broad phase.
- Player vs asteroid/enemy/enemy bullet.
- Bullet vs asteroid/enemy.
- Weapon effect collisions for beams, mines, nova, lightning, missiles, deflector orbs, tractor shield, cryo, prism beam.
- Damage application and elemental multipliers.
- Boss part/core/phase/intro routing.
- Enemy special abilities: cloak targeting, reflect, projectile absorb, buff strip, charge/rear exposure, thorn retaliation, suppress aura.
- Player haptics.
- Pickup/drop behavior.
- Damage numbers and FX.
- Mobile asteroid split caps duplicated from wave manager.

The top comment says every function is called with `.call(gameEngine)`, which confirms this file is not a self-contained collision service; it is effectively an extension of the engine object.

### Why It Hurts

- Weapon, enemy, boss, and reward changes all touch the same file.
- Combat bugs are difficult to isolate because detection, damage, status, rewards, and FX happen together.
- Special enemies add import pressure to collision.
- Tests need large fake engine objects.
- There are hard-to-notice duplicated constants, such as the mobile asteroid split cap mirrored locally to avoid importing wave manager.

### Recommended Module Split

Keep the public `handleCollisions()` entry point initially, but delegate internally:

| New Module | Responsibility |
|---|---|
| `combat/collision-detection.js` | Generic circle/swept checks, pool iteration helpers, spatial-grid retrieval helpers. |
| `combat/damage-resolver.js` | `applyDamageToEnemy`, crits, elemental multipliers, armor/resist, boss part routing, status triggers. |
| `combat/player-contact.js` | Player vs asteroid/enemy/enemy bullet and damage-to-player rules. |
| `combat/projectile-collisions.js` | Bullet/weapon-effect collisions against asteroids/enemies. |
| `combat/enemy-reactions.js` | Reflect, absorb, buff strip, rear exposure, thorn retaliation, suppress aura gates. |
| `combat/reward-drops.js` | Gold/health/item/powerup drop decisions and drop-profile resolution. |
| `combat/combat-fx.js` | Damage numbers, hit flash, haptics bridge, pickup toasts, particles. |

### First Safe Extraction

Start with the least behaviorally risky pieces:

1. Move `COLLISION_CONFIG` to `combat/collision-config.js`.
2. Move `applyBuffStrip` and `UNSTRIPPABLE_POWERUPS` to `combat/enemy-reactions.js`.
3. Move mobile asteroid split caps to a shared config module or `core/constants.js`.
4. Move boss damage routing helpers into `combat/damage-resolver.js`.
5. Add unit tests around the extracted helpers before moving the large loops.

### Target Outcome

`collision-system.js` becomes a thin coordinator under 1,200 LOC, and damage/status/reward behavior becomes unit-testable without a fake full engine.

---

## 3. Centralize Clock, RNG, Timers, Storage, And Platform Services

### Current Problem

The codebase has good primitives but they are not consistently used:

- `core/frame-clock.js` exists and documents the desired pattern.
- `wave/run-randomizer.js` injects RNG properly.
- `shop/crafting.js` supports injected RNG.
- But the broader code still has many direct global reads:
  - 634 `Math.random`
  - 278 `Date.now`
  - 43 `setTimeout`
  - 79 `localStorage`
  - 187 `window.`
  - 584 `document.`

This is not automatically wrong in a browser game, but it makes deterministic tests, replay, pause/resume correctness, and mobile/desktop behavior harder.

### Recommended Cleanup

1. **Adopt a `RuntimeServices` object.**
   Add a small module such as `core/runtime.js`:
   - `now()`
   - `frameNow()`
   - `rng()`
   - `setTimer(fn, ms, token?)`
   - `clearTimer(id)`
   - `storage`
   - `dom`
   - `platform`

2. **Make gameplay randomness injectable.**
   Visual randomness can remain non-deterministic. Gameplay-affecting randomness should go through a run RNG:
   - enemy spawn choices
   - drops
   - gear rolls
   - draft choices
   - mission selection
   - crit/dodge/proc rolls

3. **Use `frameClock.now` inside frame code.**
   `Date.now` is fine for boot/user-interface events, but per-frame draw/update code should use the cached frame clock. This reduces jitter and makes frame behavior easier to test.

4. **Wrap stateful timers with epoch guards by default.**
   `core/game-state.js` already documents the epoch pattern. Create a helper:
   `scheduleForState(stateMachine, delay, callback)`.
   This would simplify wave transitions, tutorial sequences, notifications, audio retry, and lifecycle delayed effects.

5. **Route all persistence through `core/storage.js`.**
   `core/storage.js` already wraps localStorage safely, but direct localStorage uses remain across the codebase. Expand storage helpers for:
   - haptics setting
   - mobile stick side
   - font/display settings
   - threat peak
   - debug mode persistence
   - any account/run profile fields

### Target Outcome

Gameplay systems become replayable/testable in isolation, UI modules can still use browser APIs directly where appropriate, and unit tests need fewer bespoke browser shims.

---

## 4. Reduce Import-Time Browser Side Effects

### Current Problem

At least 40 unit-test files mention browser shims or global window/navigator/document setup. A major source is modules that touch browser APIs at import time.

Example: `core/utils.js` is broadly imported and mostly looks like a math/render utility file, but it also:

- imports `platform/haptic.js`
- registers document listeners for user interaction at module load
- reads `localStorage` at module load for haptics settings

Because `core/utils.js` has 37 inbound imports, these side effects spread widely.

### Why It Hurts

- Pure logic tests need DOM shims.
- Import order matters.
- Node/Jest tests are more fragile than necessary.
- Utility modules are harder to reuse.

### Recommended Cleanup

Split `core/utils.js` into narrower modules:

| New Module | Contents |
|---|---|
| `core/math.js` | `random`, `collision`, `wrap`, interpolation, clamp, vector helpers. |
| `core/noise.js` | `NoiseGenerator`, star/noise generation. |
| `core/sprite-cache.js` | cached icon/bullet sprites. |
| `platform/haptics-preferences.js` | haptics preference, user interaction tracking, localStorage access. |
| `world/collectible-collision.js` | `starCollision` and pickup-radius logic. |

Then keep `core/utils.js` temporarily as a compatibility re-export. New code should import the smaller modules directly.

### Target Outcome

Pure math/combat/wave tests stop needing browser shims simply because they import a common helper.

---

## 5. Clarify UI vs HUD vs Game Systems

### Current Problem

The codebase has both:

- Canvas HUD modules under `hud/`
- DOM overlay modules under `ui/`
- DOM-building code in `ui/static-dom.js`
- DOM construction inside `wave/wave-manager.js`
- DOM construction inside `hud/combat.js`
- DOM touches inside `hud/status.js`
- CSS injection inside dormant overlay modules like `ui/draft-overlay.js` and `ui/bounty-overlay.js`

`ui/static-dom.js` was created to prevent index/JS drift, which is good. But it is now 1,189 LOC and owns many overlay stubs in a single file. Meanwhile some runtime systems still create or mutate overlay DOM directly.

### Recommended Cleanup

1. **Split `ui/static-dom.js` by overlay.**
   Suggested structure:
   - `ui/dom/root-stubs.js`
   - `ui/dom/pause-dom.js`
   - `ui/dom/stats-dom.js`
   - `ui/dom/inventory-dom.js`
   - `ui/dom/shop-dom-shell.js`
   - `ui/dom/wave-pick-dom.js`
   - `ui/dom/tutorial-dom.js`
   - `ui/dom/hud-button-dom.js`

   Keep `buildStaticDom()` as the public entry point, but make it call focused builders.

2. **Move wave-pick and shop-suggest DOM out of `wave-manager.js`.**
   `wave-manager.js` should decide when a draft/shop-suggest happens; UI modules should render the cards and actions.

3. **Keep canvas HUD modules DOM-light.**
   `hud/status.js` currently draws HUD but also creates shield tank DOM. Move DOM-backed widgets to `ui/` or a dedicated `hud/dom-widgets.js`.

4. **Create a small overlay controller interface.**
   A consistent shape would help:
   - `open(data)`
   - `close(reason)`
   - `isOpen()`
   - `render(data)`
   - `destroy()`

5. **Move inline style injection into CSS or scoped CSS modules.**
   `ui/bounty-overlay.js` and `ui/draft-overlay.js` inject large style strings. Even if those systems are dormant, this pattern should not spread. The main stylesheet is already large, but discoverability is better than runtime CSS injection for primary UI.

### Target Outcome

Game systems request UI state changes; UI modules render them. Wave/combat/player code should not know how to create buttons.

---

## 6. Tame Large Catalog/Data Files

### Current Problem

Several files are part catalog, part derivation logic, part compatibility layer:

- `combat/weapon-data.js` contains primary weapons, power weapons, upgrades, attunements, abilities, stats, streak tiers, stack-cost scaling, archetype mapping, and helpers.
- `enemy/enemy-data.js` contains enemy definitions, element maps, resist maps, armor maps, shield maps, shape maps, and type keys.
- `core/constants.js` contains game config, enemy bullet config, game states, run config, speedrun tiers, drop tiers, enemy drop profiles, combat passive constants, and helper functions.
- `world/item-system.js` contains item creation, affix rolling, derived labels, crafting/reroll/tier-up helpers, resist targeting, passive rolling, and scoring.

These files are not wrong, but they have become overloaded.

### Recommended Cleanup

#### `combat/weapon-data.js`

Split into:

- `combat/data/primary-weapons.js`
- `combat/data/power-weapons.js`
- `combat/data/abilities.js`
- `combat/data/weapon-upgrades.js`
- `combat/data/attunements.js`
- `combat/data/stats.js`
- `combat/data/streak-tiers.js`
- `combat/weapon-data.js` as a compatibility barrel/re-export

Add validation tests:

- every weapon ID has upgrade entries or an explicit empty upgrade list
- every upgrade target references an existing weapon/ability/stat
- every attunement references a valid element
- every icon slug resolves
- every cost array length matches max stacks
- hidden/retired entries are excluded unless `includeHidden`

#### `enemy/enemy-data.js`

Split into:

- `enemy/data/enemy-types.js`
- `enemy/data/enemy-elements.js`
- `enemy/data/enemy-resists.js`
- `enemy/data/enemy-armor.js`
- `enemy/data/enemy-shapes.js`
- `enemy/data/enemy-validation.js`

Add validation tests:

- every enemy type has a shape draw mapping
- every typed resist/weakness refers to a valid element
- every boss/miniboss flag has expected health/drop profile
- mobile-specific size changes are explicit rather than hidden in wave/collision paths

#### `core/constants.js`

Split by stability:

- `core/game-config.js` for field dimensions and low-level runtime config
- `core/game-states.js`
- `core/run-config.js`
- `core/drop-config.js`
- `combat/combat-constants.js`
- `enemy/enemy-bullet-config.js`

Keep `constants.js` as a compatibility re-export while migrating imports.

### Target Outcome

Catalog changes become safer, validation catches broken references, and compatibility aliases can be retired intentionally.

---

## 7. Isolate Enemy Behavior Into Per-Type Modules Over Time

### Current Problem

Enemy code has improved with `enemy/abilities/` and `enemy/bosses/`, but normal enemy behavior is still spread across:

- `enemy/enemy.js`
- `enemy/movement.js`
- `enemy/firing.js`
- `enemy/ai.js`
- `enemy/shapes.js`
- `enemy/enemy-data.js`
- `combat/collision-system.js` for some special reactions

`enemy/movement.js` alone is 2,375 LOC. This means adding or changing a single enemy often touches multiple large files.

### Recommended Cleanup

Create a behavior registry:

```js
// enemy/behaviors/index.js
export const ENEMY_BEHAVIORS = {
    HUNTER: hunterBehavior,
    WARDEN: wardenBehavior,
    DEVOURER: devourerBehavior,
};
```

Each behavior module can expose only what it needs:

```js
export const hunterBehavior = {
    create(enemy, ctx) {},
    update(enemy, ctx, dt) {},
    fire(enemy, ctx) {},
    drawBase(ctx, enemy) {},
    drawGlow(ctx, enemy) {},
    onHit(enemy, hit, ctx) {},
    onContactPlayer(enemy, player, ctx) {},
};
```

Do not migrate all enemies at once. Start with special-case-heavy enemies that already have unique ability state:

1. Devourer
2. Prism Mirror
3. Leech
4. Juggernaut
5. Thornback
6. Wraithworm/Phantom

### Target Outcome

Common enemy update code remains shared, but per-enemy special behavior lives near that enemy rather than being scattered across movement, firing, collision, and rendering.

---

## 8. Clean Up Compatibility And Legacy Layers

### Current Problem

There are many intentional compatibility comments and fields. Some are needed for save migration or tests, but many appear to be long-lived scaffolding from older systems:

- Back-compat ability slot 0 accessors.
- Legacy shop/tree stubs.
- Hidden legacy DOM selectors for tests.
- Legacy upgrade fields and cost migration.
- Legacy powerup/shop paths.
- Retired ability/weapon aliases.
- Comments in `player.js`, `weapon-data.js`, `shop-manager.js`, `static-dom.js`, `collision-system.js`, and `wave-manager.js`.

Compatibility is valuable when it protects saves or external APIs. It becomes costly when it protects old internal paths that no longer exist.

### Recommended Cleanup

Create a `docs/Compatibility Debt Register.md` or a section in this report's follow-up work:

| Compatibility Item | File | Protects Save Data? | Protects Tests? | Can Remove After? |
|---|---|---|---|---|
| legacy ability slot 0 accessors | `player/player.js` | maybe | yes | after input paths use loadout slots directly |
| hidden shop DOM stubs | `ui/static-dom.js` | no | yes | after tests target new selectors |
| `PRIMARY_UPGRADES_LEGACY` | `combat/weapon-data.js` | maybe | yes | after migration test confirms no readers |
| legacy money wallet migration | `shop/armory.js` | yes | yes | keep until save schema bump |

Then remove one category per patch, with tests proving the new path.

### Target Outcome

Compatibility stays deliberate. Test-only selectors and retired internal paths stop shaping production code forever.

---

## 9. Improve CSS Maintainability

### Current Problem

`css/styles.css` is 5,264 LOC. It carries title screen, HUD, overlays, shop/build tree, inventory, mobile, fonts, scrollbars, and responsive behavior. Current scan:

- 5 media queries
- 10 `!important`
- 11 `position: fixed`
- 42 `z-index` references

The issue is not that CSS is broken; the issue is that all UI systems share a single global namespace and z-index universe.

### Recommended Cleanup

1. **Add section-level ownership comments.**
   The file already has some section comments. Make them consistent and map them to modules:
   - `static-dom.js`
   - `ui-manager.js`
   - `armory-overlay.js`
   - `inventory-overlay.js`
   - `stats-overlay.js`
   - `loadout-overlay.js`
   - `mobile-touch.js`

2. **Create z-index tokens.**
   Use CSS custom properties:
   ```css
   :root {
     --z-canvas: 0;
     --z-hud: 10;
     --z-overlay: 100;
     --z-modal: 200;
     --z-debug: 900;
   }
   ```

3. **Move overlay-specific styles near overlay ownership.**
   This can still be one file, but all `armory-*`, `inventory-*`, `stats-*`, `shop-*`, and `tutorial-*` blocks should be contiguous and labeled.

4. **Remove runtime-injected overlay styles.**
   Fold dormant `draft-overlay` and `bounty-overlay` CSS into the stylesheet if those overlays are revived, or archive the files if they remain unused.

5. **Add CSS smoke tests for overlay visibility states.**
   Existing Playwright tests can catch regressions by opening pause, inventory, stats, armory, loadout, settings, and tutorial at desktop/mobile widths.

### Target Outcome

CSS remains global but becomes navigable, with fewer accidental z-index/display regressions.

---

## 10. Review Dormant Or Test-Only Runtime Files

### Observed Zero-Inbound Runtime Files

The static import graph found these primary-game JS modules with no inbound imports from `js/`:

| File | Current Evidence | Recommendation |
|---|---|---|
| `js/modules/audio/sound-defs.js` | Used by `tools/scripts/generate-sfx.js`, not runtime. | Keep, but consider moving to `tools/` if it is truly generator-only. |
| `js/modules/player/class-system.js` | Imported by `tests/unit/class-system.test.js`; comments in `classes.js` mention future hooks. | Mark as planned/future or wire into runtime; otherwise move to docs/archive later. |
| `js/modules/ui/bounty-overlay.js` | References `world/bounty-engine.js`; no runtime import. | Either wire into UI flow or archive with bounty system. |
| `js/modules/ui/draft-overlay.js` | Intended for run randomizer; no runtime import. | Either wire into wave/draft flow or archive. |
| `js/modules/wave/run-randomizer.js` | Tested, pure, not runtime-imported. | Keep only if next-run route selection is planned; otherwise mark dormant. |
| `js/modules/world/bounty-engine.js` | Tested, not runtime-imported. | Same as bounty overlay. |

This does not mean these files are bad. It means the repo would benefit from a clear status label:

- `live runtime`
- `generator source`
- `planned but dormant`
- `test-only`
- `archived`

### Hidden Agent State Under Source

There are hidden `.claude` state files under `js/modules/performance/.claude/state/`. They are tiny, but source directories should not contain agent/runtime artifact folders. Move them to an appropriate non-source location or delete them if disposable.

### Root Hygiene Note

The audit noticed some non-code documents at the project root, such as `Plans.md` and `blog-article-on-fun.md`. This report is focused on primary game code, but those files appear inconsistent with the documented root hygiene rule that planning/analysis docs belong in `docs/`.

---

## 11. Strengthen Testability Around Refactors

### Current Problem

The project has many tests, but the largest files are not directly easy to test. Unit tests often work by importing slices and shimming browser globals.

### Recommended Test Additions

#### Before splitting `game-engine.js`

Add characterization tests for:

- run save serialization/restoration shape
- profile save/load merge behavior
- stash commit behavior
- resume stack behavior
- pre-run flow transitions

#### Before splitting collision

Add table tests for:

- damage resolver with armor/resist/weakness/crit
- boss part routing
- reflect/absorb/buff-strip gates
- powerup/gold/drop profile decisions
- mobile asteroid split cap
- player contact damage modifiers

#### Before splitting UI

Add DOM tests for:

- `buildStaticDom()` idempotency
- required IDs exist after build
- no legacy hidden selectors are required by production code
- pause/armory/loadout/settings open-close behavior

#### Before splitting catalogs

Add validation tests for:

- weapon IDs, power IDs, ability IDs
- upgrade target validity
- passive IDs
- item template validity
- enemy element/resist maps
- icon slug resolution

### Recommended Test Helper Cleanup

Create a shared `tests/helpers/browser-shim.js` for unit tests that truly need DOM/browser APIs. Today many tests repeat local shims. A shared helper would make import-time side effects more obvious and reduce test maintenance.

---

## Phased Cleanup Plan

## Phase 0: Guardrails And Inventory

**Goal:** make cleanup safe before moving code.

Tasks:

- Add import-graph and dormant-file checks as a local script under `tools/scripts/` if desired.
- Add catalog validation tests for weapons, enemies, upgrades, and icons.
- Add `tests/helpers/browser-shim.js`.
- Add tests around `buildStaticDom()` idempotency.
- Create a compatibility debt register.
- Decide status of dormant bounty/draft/class-system/run-randomizer files.

Expected risk: low.  
Expected payoff: prevents refactor regressions.

## Phase 1: Low-Risk Extractions From `game-engine.js`

**Goal:** reduce file size without touching combat behavior.

Tasks:

- Extract run save serialization/restoration.
- Extract persistent meta/profile persistence.
- Extract starfield/orb rendering helpers.
- Extract survival record formatting and speedrun display helpers if not already isolated.

Expected risk: low to medium.  
Expected payoff: `game-engine.js` becomes meaningfully smaller and easier to review.

## Phase 2: Collision/Damage Boundary

**Goal:** separate detection from damage/reactions/rewards.

Tasks:

- Move collision constants/config.
- Extract enemy reaction helpers.
- Extract damage resolver.
- Extract reward/drop logic.
- Keep `handleCollisions()` as compatibility coordinator until tests pass.

Expected risk: medium.  
Expected payoff: biggest reduction in combat-change risk.

## Phase 3: Runtime Service Cleanup

**Goal:** reduce direct globals in gameplay code.

Tasks:

- Split `core/utils.js`.
- Introduce runtime/clock/RNG/storage service boundaries.
- Replace gameplay `Math.random` in drops/spawns/procs with injected RNG.
- Replace frame-loop `Date.now` with `frameClock.now`.
- Wrap delayed state transitions with epoch-aware timer helper.

Expected risk: medium.  
Expected payoff: better deterministic testing and fewer pause/resume/timer edge cases.

## Phase 4: UI/HUD Separation

**Goal:** make overlay rendering less entangled with wave/combat/player systems.

Tasks:

- Split `ui/static-dom.js`.
- Move wave-pick/shop-suggest DOM out of `wave-manager.js`.
- Move DOM-backed HUD widgets out of `hud/status.js`.
- Establish overlay controller interface.
- Consolidate overlay CSS ownership and z-index tokens.

Expected risk: medium.  
Expected payoff: easier UI work and fewer accidental overlay regressions.

## Phase 5: Enemy Behavior Registry

**Goal:** make per-enemy changes localized.

Tasks:

- Create behavior registry shape.
- Migrate special-case-heavy enemies one by one.
- Split base/glow drawing if doing renderer batching.
- Move collision special reactions closer to enemy behavior modules where practical.

Expected risk: medium to high if done broadly; low if one enemy at a time.  
Expected payoff: cleaner enemy additions and better gameplay iteration speed.

---

## Specific High-Value Cleanup Tickets

### Ticket A: Extract Run Save Module

**Files:** `game-engine.js`, new `core/run-save.js`, tests under `tests/unit/`.  
**Why first:** low gameplay risk, high readability payoff.  
**Acceptance criteria:**

- `game-engine.js` no longer contains save snapshot shape details.
- Save/load tests cover current schema.
- Existing Continue/New Game behavior unchanged.

### Ticket B: Split `core/utils.js`

**Files:** `core/utils.js`, new `core/math.js`, `core/noise.js`, `platform/haptics-preferences.js`, `world/collectible-collision.js`.  
**Why:** reduces browser-shim spread.  
**Acceptance criteria:**

- Pure tests can import math/collision helpers without `window` or `document`.
- Existing imports keep working through compatibility re-exports.
- New code uses smaller modules.

### Ticket C: Move Wave-Pick DOM Out Of Wave Manager

**Files:** `wave/wave-manager.js`, new `ui/wave-pick-overlay.js`, CSS as needed.  
**Why:** wave logic should not create buttons.  
**Acceptance criteria:**

- Wave manager passes draft data and callbacks to UI module.
- UI module owns DOM rendering and click binding.
- E2E stage-clear/draft tests still pass.

### Ticket D: Damage Resolver Characterization

**Files:** `combat/collision-system.js`, new tests first.  
**Why:** before extraction, lock down behavior.  
**Acceptance criteria:**

- Tests cover armor/resist/weakness/crit/status/boss-part cases.
- Extraction can proceed without changing test expectations.

### Ticket E: Catalog Validation

**Files:** `combat/weapon-data.js`, `enemy/enemy-data.js`, `world/item-templates.js`, tests.  
**Why:** catches broken content references cheaply.  
**Acceptance criteria:**

- Invalid IDs, missing icons, missing upgrade targets, and invalid elements fail unit tests.
- Future catalog splits are safer.

### Ticket F: Dormant Feature Status Pass

**Files:** `ui/bounty-overlay.js`, `world/bounty-engine.js`, `ui/draft-overlay.js`, `wave/run-randomizer.js`, `player/class-system.js`, `audio/sound-defs.js`.  
**Why:** avoid source tree ambiguity.  
**Acceptance criteria:**

- Each dormant/test-only/generator-only module has a clear owner/status.
- Unused primary-runtime code is either wired, archived, or documented as planned.

---

## Suggested End State

The primary game can remain vanilla ES modules and Canvas/WebGL. It does not need a framework or TypeScript migration to become cleaner.

The ideal near-term shape:

- `GameEngine` is a composition root and frame-loop coordinator.
- `wave` owns run pacing, not overlay DOM.
- `combat` owns damage and collisions through focused services.
- `enemy` owns per-enemy behavior modules.
- `ui` owns DOM overlays.
- `hud` owns Canvas HUD drawing.
- `core` owns pure constants/state/storage/runtime primitives.
- `platform` owns browser/device APIs.
- Catalog modules are data-first and validated by tests.
- Compatibility shims are tracked and removed intentionally.

This is achievable incrementally. The biggest trap would be trying to "fix architecture" in one branch. The codebase is healthy enough that the best cleanup is boring, staged, and test-backed.

