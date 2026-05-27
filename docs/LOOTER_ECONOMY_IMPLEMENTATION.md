# Looter-Economy Pivot — Implementation Tasks

> Bite-sized, dispatchable tasks derived from `LOOTER_ECONOMY_PIVOT.md` (the design
> doc — read it for the *why*; this is the *what/where*). Built for **parallel
> subagent dispatch**: each task lists its **owned files** + **deps** + a
> **parallel tag**. Status: 2026-05-27, none started.

## 0. How to use this (dispatch rules)

- **File ownership is exclusive.** Two tasks dispatched in the same wave must NOT
  edit the same file. Tags:
  - 🟢 **NEW-FILE** — creates new file(s) only; zero contention; fan out freely.
  - 🟡 **ISOLATED** — edits one existing file few others touch; safe in small groups.
  - 🔴 **SHARED** — edits a hot orchestration file (`game-engine.js`, `player.js`,
    `ui-manager.js`, `shop-dom.js`, `combat-manager.js`, `collision-system.js`,
    `wave-manager.js`, `weapon-data.js`, `progression.js`). **Run these one-at-a-time**
    (or partition by disjoint edit regions with care).
- **Subagents never run git** (no commit/branch/stash). The coordinator commits.
- **Each task ends green:** `npm run test:unit` passes; touched files `node --check`.
- **Dispatch order:** Wave 1 (all 🟢 data) → Wave 2 (🟢 logic + tests + new UI) →
  the **serial integration track** (🔴, ordered) → balance/ship. The §7 map is the
  fan-out guide.

---

## Wave 1 — Data & pure-math modules (🟢 all parallel, no deps)

### T01 · Rainshard income module 🟢
- **Files:** `js/modules/shop/income.js` (new) + `tests/unit/income.test.js`
- **Do:** pure `perKillRainshards({wave,difficulty,killstreak,findMult})` and a
  `runIncomeEstimate(...)` helper, per design §2.4 (`25 × waveScale × diffMult ×
  streak × find`). Export constants. No DOM/globals.

### T02 · Crafting cost formulas 🟢
- **Files:** `js/modules/shop/crafting-costs.js` (new) + test
- **Do:** pure cost fns — `fabricateCost(rarity,templateLean,traitFocus)`,
  `rerollCost(rarity,mode,n)`, `upgradeCost(rarity)`, `combineCost(tier)`,
  `salvageRefund(rarity)`. Constants from design §2.5 (`rarityFactor`, `rarityMult`,
  `templateMult`, `traitMult`, `modeMult`).

### T03 · Gear-scaling math 🟢
- **Files:** `js/modules/core/gear-scaling.js` (new) + test
- **Do:** pure `levelRamp(level, softcap=25)` and
  `amplifySP(spValue, ampPct, level)` = `spValue × (1 + ampPct × levelRamp)`. The
  single source of truth for §2.1. No game imports.

### T04 · Weapon trait pools 🟢
- **Files:** `js/modules/combat/weapon-traits.js` (new) + test
- **Do:** define the four trait classes (Element / Behavior / Powerup / Stat%) with
  ids, display, roll ranges, and per-rarity trait COUNT. Pure data + lookups
  (`traitsForRarity`, `rollableTraits(archetype)`). Design §3.1.

### T05 · Matrix data 🟢
- **Files:** `js/modules/world/matrix-data.js` (new) + test
- **Do:** the 8-archetype catalog (per-slot % SP-amp), tier scaling (×1.5/tier),
  combine recipe (3→1), resonance table. Design §2.2.

### T06 · Gear item templates 🟢
- **Files:** `js/modules/world/item-templates.js` (new) + test
- **Do:** 10 build templates (affix pool + set 2/3/5-pc + 5-pc signature), the
  rarity ladder (affix count + % range), slot-personality constraints. Design §2.3.

### T07 · Class definitions 🟢
- **Files:** `js/modules/player/classes.js` (new) + test
- **Do:** ~7 class defs — favored SP-stat family, unique-mechanic hook id, free
  signature ability id, display. Pure data. Design §Phase 6.

### T08 · Bounty templates 🟢
- **Files:** `js/modules/world/bounty-data.js` (new) + test
- **Do:** the catalog (§Phase 5) as templates with `{randomized}` fills, progress
  type, reward table (R$/Matrix/Fabricate-token), daily-vs-contract tag.

### T09 · Run templates 🟢
- **Files:** `js/modules/wave/run-templates.js` (new) + test
- **Do:** stage themes, stage modifiers, named challenge presets, elite affix
  combos, boss 3-phase frame + pattern pool, enemy role stat-profiles, the
  difficulty-budget curve. Design §4.3–4.4.

---

## Wave 2 — Logic modules (🟢 new files; deps on Wave 1) + tests

### T10 · Weapon generation/roll 🟢 — deps T04, T02
- **Files:** `js/modules/combat/weapon-gen.js` (new) + test
- **Do:** `rollWeapon({archetype, rarity, lean, focus})` → a weapon item object
  (archetype + rolled traits + stat%). Used by drops + Fabricate.

### T11 · Gear generation/roll 🟢 — deps T06, T03
- **Files:** `js/modules/world/gear-gen.js` (new) + test
- **Do:** `rollGear({slot, rarity, lean, focus})` → gear item (template + %-amp
  affixes + socket(s) + maybe signature). Mirrors T10 for gear.

### T12 · Matrix system 🟢 — deps T05
- **Files:** `js/modules/world/matrix-system.js` (new) + test
- **Do:** pure socket/un-socket/combine + `resonanceBonus(equippedGear, matrixType)`
  + total-amp aggregation per stat.

### T13 · Crafting engine 🟢 — deps T02, T10, T11, T12
- **Files:** `js/modules/shop/crafting.js` (new) + test
- **Do:** pure verbs over (item, R$) → {ok, item, R$}: `fabricate`, `rerollTrait`
  (Reroll/Calibrate/Target), `upgradeTier`, `combineMatrices`, `salvage`. "Narrow
  types, never values" rule. Escalation counter per item.

### T14 · Run randomizer + draft builder 🟢 — deps T09, T01
- **Files:** `js/modules/wave/run-randomizer.js` (new) + test
- **Do:** `nextDraft(depth, runState)` → 2–3 stage options (theme/modifier/threat/
  reward) respecting the difficulty budget + balance rules (§4.2). `threat` on the
  PWR scale.

### T15 · Bounty engine 🟢 — deps T08
- **Files:** `js/modules/world/bounty-engine.js` (new) + test
- **Do:** roll the board (3 daily + 2 contract), track progress events, grant
  rewards, reroll-a-bounty. Pure logic + a persistence shape (storage wires later).

### T16 · Class system 🟢 — deps T07
- **Files:** `js/modules/player/class-system.js` (new) + test
- **Do:** `applyClass(player, classId)` → favored-stat lean + register the unique
  mechanic hook + grant the signature ability. Pure-ish (mutates a passed player stub).

### T40 · Draft overlay UI 🟢 — deps T14
- **Files:** `js/modules/ui/draft-overlay.js` (new) + `css` block
- **Do:** the §4.1 draft screen (2–3 cards, PWR header, threat/reward/bounty marks).
  Self-contained overlay (like debug-menu). Wired into the run flow by T32.

### T41 · Bounty overlay UI 🟢 — deps T15
- **Files:** `js/modules/ui/bounty-overlay.js` (new) + css
- **Do:** the board (daily + contract, progress bars, claim, reroll). Self-contained;
  wired by T-wire later.

---

## Serial integration track (🔴 ordered — one owner at a time)

### Phase 0 — rip-out & rename
### T20 · Unlock everything + remove milestone gift 🔴 — deps none
- **Files:** `shop/armory.js`, `player/player.js`, `shop/shop-dom.js`,
  `game-engine.js`, `ui/ui-manager.js`, `ui/ability-gift.js`(delete) + tests
- **Do:** rip weapon/ability locking; loadout/BUILD list shows everything; delete the
  Stage-1 ability gift. Update QA-08/12/19/31 + armory unit tests.

### T21 · Rename Gold → Rainshards (R$) 🔴 SERIALIZATION POINT — deps none, run ALONE
- **Files:** wide — `game-engine.js`, `hud/*`, `ui-manager.js`, `collision-system.js`,
  `combat-manager.js`, `shop/*`, `core/storage.js`, `world/*`, tests
- **Do:** rename the currency + symbol (R$) everywhere; pickups/particles/HUD/strings.
  Mechanical; do solo so it doesn't collide with other 🔴 work.

### T22 · Remove card draft + powerup picks 🔴 — deps T21
- **Files:** `wave/wave-manager.js`, `ui-manager.js`, `shop/shop-manager.js`,
  `world/powerup.js`, the survivor/card overlay + tests
- **Do:** delete the stage-clear card menu + powerup buying; stage clear → R$ + drops
  + draft. Move Repair/Revive functions to abilities/passives (already exist).

### T23 · Eliminate Cores → salvage to R$ 🔴 — deps T21
- **Files:** `shop/armory.js`, `world/item-system.js`, `shop/shop-manager.js`,
  `shop/shop-dom.js` (GEAR tab) + tests (QA-08d)
- **Do:** remove Cores currency; salvage → R$; crafting costs → R$. Migrate banked Cores→R$.

### Phase 1 — progression + PWR
### T24 · Per-run level/SP + migration 🔴 — deps none
- **Files:** `player/progression.js`, `game-engine.js`, `core/storage.js`
- **Do:** reset level/SP each run; persist R$/items only; XP→level curve to ~25–30.
  Migrate banked meta level/SP → R$ once.

### T25 · PWR recompute extension 🟡 — deps T03, T24
- **Files:** `wave/power-level.js` (+ recompute hooks in `game-engine.js` 🔴)
- **Do:** inputs fold level-scaled gear/weapon power; add THORNS/SPEED terms;
  recompute on level-up; re-anchor `K_PWR`. Keep the geometric blend.

### Phase 2 — gear, matrices, income, crafting wiring
### T26 · Gear amplification into stat getters 🔴 — deps T03, T24
- **Files:** `player/progression.js`, `player/player.js`
- **Do:** effective-stat getters apply `amplifySP(SP, gearAmp, level)` (§2.1) so
  PWR + combat read level-scaled gear. Legibility data exposed for tooltips.

### T27 · Gear roll + crafting wired into inventory/GEAR 🔴 — deps T11, T13
- **Files:** `world/item-system.js`, `game-engine.js`
- **Do:** drops use `gear-gen`; inventory/GEAR equips + crafts via `crafting.js`.

### T28 · Matrix integration 🔴 — deps T12, T26
- **Files:** `player/player.js`, `player/progression.js`, `world/item-system.js`
- **Do:** sockets on gear; apply Matrix %-amp + resonance into the stat getters.

### T29 · Income into drops/pickup 🔴 — deps T01, T21
- **Files:** `combat/combat-manager.js`, `combat/collision-system.js`
- **Do:** per-kill R$ via `income.js` (wave/difficulty/streak/find); boss/elite
  bonuses; R$-find stat (gear/Hoarder's Greed/Matrix line).

### Phase 3 — weapons as loot
### T30 · Weapon-as-loot core 🔴 BIG — deps T04, T10
- **Files:** `combat/weapon-data.js` (→ archetypes), `player/weapons.js`,
  `combat/combat-manager.js`, `combat/collision-system.js`, `game-engine.js`
- **Do:** weapons = equipped items (archetype + traits); traits stamp bullets
  (element/behavior/powerup); weapon base damage scales with level. Subsumes the
  old attunement/mod/powerup application paths.

### T31 · Weapon drops + Fabricate weapons 🔴 — deps T30, T13
- **Files:** `combat/combat-manager.js`, `ui/inventory-overlay.js`
- **Do:** weapons drop (jackpot table); Fabricate weapons in the inventory.

### Phase 4 — randomized drafted runs
### T32 · Run randomizer + draft hook 🔴 — deps T14, T40
- **Files:** `wave/wave-manager.js`, `game-engine.js`, `core/constants.js`
- **Do:** replace fixed wave order with `run-randomizer`; open the draft overlay at
  each transition; apply the picked stage (theme/modifier/composition).

### Phase 6 — classes
### T33 · Class pick wired into run start 🔴 — deps T16
- **Files:** `game-engine.js`, `player/player.js`
- **Do:** apply the chosen class at run start (lens + mechanic + signature ability).

### Phase 7 — balance
### T34 · Gear/level-aware director 🟡 — deps T25, T26
- **Files:** `wave/difficulty-director.js` (+ small `game-engine.js` hook)
- **Do:** director reads live PWR (now incl. gear/weapons); enemy HP/threat offset;
  threat scale == PWR scale.

### T35 · Global stat caps 🔴 — deps T26
- **Files:** `player/progression.js`, `player/lifecycle.js`
- **Do:** cap DODGE ~60%, effective CRIT, VAMPIRISM, etc. (TOUGHNESS 75% exists).

---

## UI track (mixed)

### T42 · Crafting / inventory UI 🔴 — deps T13, T27
- **Files:** `ui/inventory-overlay.js`, `shop/shop-dom.js` (BUILD GEAR) + css
- **Do:** the §2.5 Fabricate/Reroll/Calibrate/Target/Upgrade/Combine/Salvage panel +
  legibility (`INACTIVE ⚠`, resonance/set progress on hover).

### T43 · Class-pick + loadout in BUILD 🔴 — deps T07, T33
- **Files:** `shop/shop-dom.js` + css
- **Do:** class picker + weapon/gear/Matrix loadout in the pre-run BUILD screen.

### T44 · Loot QoL 🟡 (stretch) — deps T27
- **Files:** `ui/inventory-overlay.js`
- **Do:** auto-salvage (rarity floor), item lock/favorite, stash sort/filter, save
  named loadout presets, compare-on-hover deltas.

### T45 · Bounty board wiring 🔴 — deps T15, T41
- **Files:** `game-engine.js`, `core/storage.js`
- **Do:** persist the board; fire progress events from kills/clears/crafts; surface
  the overlay from a HUD/menu button.

---

## Cold-start, migration & ship

### T60 · New-player starter kit 🔴 — deps T10, T11, T30, T27
- **Files:** `game-engine.js`, `shop/armory.js`
- **Do:** a fresh/empty account is granted a basic primary + power weapon + a Common
  gear piece so run 1 is playable; gentle early drop ramp.

### T61 · Account migration 🔴 — deps T21, T23, T24, T26
- **Files:** `core/storage.js`, `game-engine.js`
- **Do:** one-time convert old meta — gold + level/SP → R$; old flat-affix gear →
  re-roll into the %-amp model or salvage to R$; unlocks become moot.

### T70 · Tests pass 🟡 — deps all
- **Files:** `tests/**`
- **Do:** unit suite green; update QA specs broken by the pivot (loadout/economy/
  weapon/draft); add specs for the new modules.

### T71 · Balance pass 🟡 — deps T29, T13, T34
- **Files:** tuning constants across `income.js`, `crafting-costs.js`, `run-templates.js`
- **Do:** playtest income vs. sink; tune `levelRamp` curve, weapon-scaling shape,
  difficulty budget. Recalibrate `BASE`/`FAB_BASE` together if income outruns the sink.

### T72 · Docs + version 🔴 — deps all
- **Files:** `README.md`, `CHANGELOG.md`, `VERSION`, `core/version.js`
- **Do:** update player-facing docs + project structure; CHANGELOG entry; MAJOR bump.

---

## 7. Parallel dispatch map

| Wave | Tasks | Notes |
|---|---|---|
| **1** (fan out all) | T01 T02 T03 T04 T05 T06 T07 T08 T09 | 9 new data files, zero contention — dispatch simultaneously. |
| **2** (fan out) | T10 T11 T12 T13 T14 T15 T16 + T40 T41 | new logic + UI files; each owns its own file. Deps on Wave 1 only. |
| **3 — serial spine** | T21 → T20 → T22 → T23 | Phase 0 on shared files. **T21 (rename) runs ALONE first.** |
| **4 — serial** | T24 → T25 → T26 → T29 | progression + gear-amp + income. Sequential (shared files). |
| **5 — serial** | T27 → T28 → T30 → T31 → T32 → T33 | crafting/matrix/weapons/draft/class wiring. Sequential. |
| **6 — mixed** | T34 T35 (serial) · T42 T43 T45 (serial UI) · **T44 parallel-ok** | |
| **7** | T60 → T61 → T70 → T71 → T72 | cold-start, migration, ship. |

**Reality check:** the big parallel win is **Waves 1–2** (~18 self-contained new
files + tests + overlays — fan these out aggressively). The integration spine
(Waves 3–7) is mostly **serial** because it concentrates on a handful of hot files
(`game-engine.js`, `player.js`, `progression.js`, `combat-manager.js`,
`wave-manager.js`). Don't try to parallelize 🔴 tasks that share a file — partition
by file or sequence them.

**Contended-file owners (do not double-dispatch):** `game-engine.js` (T20,T25,T27,
T29… — sequence), `player.js` (T26,T28,T30,T35), `progression.js` (T24,T26,T28,T35),
`combat-manager.js` (T29,T30,T31), `wave-manager.js` (T22,T32), `shop-dom.js`
(T20,T23,T42,T43), `inventory-overlay.js` (T31,T42,T44).
