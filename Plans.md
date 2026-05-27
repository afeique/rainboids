# Rainboids — Implementation Plan (active dispatch board)

> **Cleaned 2026-05-27.** ACTIVE WORK = the **Looter-Economy Pivot**. Execute
> top→bottom. Full task detail: `docs/LOOTER_ECONOMY_IMPLEMENTATION.md`; design
> rationale: `docs/LOOTER_ECONOMY_PIVOT.md`. Old roadmaps → **Archived** footer + `CHANGELOG.md`.

## Dispatch rules
- **Exclusive file ownership.** Tags: 🟢 NEW-FILE (zero contention, fan out) · 🟡
  ISOLATED (one rarely-touched file) · 🔴 SHARED (hot orchestration file — run
  one-at-a-time). Subagents never run git; the orchestrator verifies + commits.
- Each task ends green (`npm run test:unit` + `node --check`); write QA when it
  changes player-facing behavior. **Inert new modules/tests/docs = NO version bump**
  (no runtime effect yet); **integration that changes the running game = version bump**.
- Status: `[ ]` todo · `[~]` in progress · `[x]` done.

---

## ▶ WAVE 1 — data & pure-math modules (🟢 all parallel, no deps) ✅ DONE (2026-05-27, +142 unit tests)
- [x] **T01** 🟢 `shop/income.js` (+test) — Rainshard per-kill + run-income formula (§2.4)
- [x] **T02** 🟢 `shop/crafting-costs.js` (+test) — fab/reroll/upgrade/combine/salvage cost fns (§2.5)
- [x] **T03** 🟢 `core/gear-scaling.js` (+test) — `levelRamp` + `amplifySP` (§2.1)
- [x] **T04** 🟢 `combat/weapon-traits.js` (+test) — Element/Behavior/Powerup/Stat trait pools (§3.1)
- [x] **T05** 🟢 `world/matrix-data.js` (+test) — 8-Matrix per-slot catalog, tiers, resonance (§2.2)
- [x] **T06** 🟢 `world/item-templates.js` (+test) — 10 gear templates, affix pools, sets, rarity ladder (§2.3)
- [x] **T07** 🟢 `player/classes.js` (+test) — ~7 class defs: favored stats + mechanic hook + signature (§Phase 6)
- [x] **T08** 🟢 `world/bounty-data.js` (+test) — bounty templates + reward tables (§Phase 5)
- [x] **T09** 🟢 `wave/run-templates.js` (+test) — themes/modifiers/challenges/elite combos/boss frame/role profiles/budget (§4.3–4.4)

> **⚠ Integration notes (from Wave 1 — resolve during Phase 2/3 wiring):**
> (a) the new `RARITY_LADDER` (item-templates) + `traitCountForRarity` (weapon-traits) use **1–8 affixes** per §2.3; the EXISTING `world/item-names.js RARITY_TIERS` uses a compressed **1–5** — reconcile (the pivot's 1–8 is canonical) in T27/T30.
> (b) doc "REGEN" → real SP id `REGENERATION` (matrix-data + item-templates already map it).
> (c) 6 new class signature-ability ids (OVERDRIVE_BURST, FORTRESS, HARVEST, SLIPSTREAM, ELEMENTAL_NOVA, JACKPOT) need registering in the ability system in **T16/T33**; ENGINEER reuses existing `SENTRY_DRONE`.

## ▶ WAVE 2 — logic modules + new UI (🟢 parallel; deps on Wave 1) ✅ DONE (2026-05-27, +152 unit tests; suite 2233)
- [x] **T10** 🟢 `combat/weapon-gen.js` (+test) — roll a weapon item [T04,T02]
- [x] **T11** 🟢 `world/gear-gen.js` (+test) — roll a gear item [T06,T03]
- [x] **T12** 🟢 `world/matrix-system.js` (+test) — socket/combine/resonance/agg [T05]
- [x] **T13** 🟢 `shop/crafting.js` (+test) — fabricate/reroll/calibrate/target/upgrade/salvage (narrow-types-never-values) [T02,T10,T11,T12]
- [x] **T14** 🟢 `wave/run-randomizer.js` (+test) — drafted run builder + difficulty budget [T09,T01]
- [x] **T15** 🟢 `world/bounty-engine.js` (+test) — roll board / track / grant [T08]
- [x] **T16** 🟢 `player/class-system.js` (+test) — apply class lens/mechanic/signature [T07]
- [x] **T40** 🟢 `ui/draft-overlay.js` — 2–3 stage draft screen (PWR vs threat) [T14]
- [x] **T41** 🟢 `ui/bounty-overlay.js` — bounty board UI [T15]

> **Wave 2 note:** `crafting-costs.js` keys rarities capitalized (`Common`…); the
> gen/ladder modules use lowercase ids / tier numbers — `crafting.js` normalizes.
> Keep this in mind when wiring (T27/T42).

## ▶ SERIAL INTEGRATION SPINE (🔴 ordered — one owner per file at a time)
### Phase 0 — rip-out & rename
- [x] **T21** 🔴 Rename Gold→Rainshards (R$) — **DONE (display-layer)**: HUD readout, pickup feedback, stats/banner labels, shop/armory labels, streak "+N% R$" now show **R$ / Rainshards**. Internal `money`/`accountGold`/`createMoneyOrb` identifiers RETAINED (166 refs + save schema — display-only rename is the right scope; mapped to "Rainshards" at the display layer).
- [x] **T20** 🔴 Unlock everything + remove milestone gift — **DONE**: `armory.setAllUnlocked(true)` at boot → `getUnlockedSet` returns all (pure fn + unit tests unchanged; runtime layer). Milestone gift + `ability-gift.js` + `clearedStage1` removed. Compact-list store auto-hides (nothing locked); sell button suppressed while all-unlocked. Unit 2233 green + boot smoke 12/12.
>   ⚠ **Deferred QA:** specs `08-armory`/`12-abilities`/`19-run-setup`/`31-build-flow` assert the OLD locked/owned behavior → now stale; reconcile at **T70** (after weapons-as-loot T30 + UI T42/43 settle, to avoid churning them 2-3×).
- [x] **T22** 🔴 Remove card draft + powerup picks — **DONE**: stage-clear card menu disabled (`fireSurvivorOverlay=false` → stage clear proceeds via the existing next-wave path); recap subtitle no longer promises a powerup. The choose-moment moves to the run DRAFT (T32); powerups become weapon traits (T30). Dead card machinery (`openWaveClearPowerupsMenu`/`#wave-pick-overlay`/`card-draft.js`/shop powerup tab) left inert → cleaned in T30/T70. Unit 2233 green.
- [x] **T23** 🔴 Eliminate Cores → salvage to R$; crafting costs in R$ — **DONE**: GEAR salvage/reroll/tier-up/target-resist/passive-reroll in `armory-overlay.js` now spend the persistent Rainshard wallet (`accountGold`) instead of `game.cores` (`_cores()` getter repointed; all 6 save sites write `accountGold`). Every ✦/⬢ glyph relabeled to `R$` (header readout, GEAR head, UNLOCK buttons, REROLL/TIER-UP/SALVAGE/TARGET-RESIST/PASSIVE labels, empty-state). The redundant ✦ header readout + the BUILD-screen ✦ box (`shop-dom`) are hidden. Cost fns (`world/cores.js`) unchanged — numbers now read as R$ (recalibrated at T71). Vestigial `game.cores`/`meta.cores` plumbing left for the **T61** banked-Cores→R$ migration. Unit 2233 green. (No version bump — deferred to T72.)
### Phase 1 — progression + PWR
- [x] **T24** 🔴 Per-run level/SP + migration (banked→R$) — **DONE**: `progression.initMeta()` now resets the player to **L1 / 0 SP / empty spStats** at every run-start build (was loading persistent account level/SP); `saveMetaState()` is a no-op (level/SP no longer persist to account meta). `savePersistentProfile` drops level/xp/sp/spStats from the meta write. The wave-start run snapshot (`serializeRunState`) now carries the LIVE `level/xp/sp/spStats` (replacing the stale `experience/skillPoints` field names) and `restoreRunState` overlays them so **CONTINUE** resumes the in-run climb. Migration: `game-engine._migrateBankedProgression(meta)` converts banked account level → R$ ONCE (`(level−1) × 1500` R$, tunable@T71), clears level/xp/sp/spStats from meta, stamps `levelMigrated`. Unit 2233 green + boot smoke 12/12. (No version bump — deferred to T72.)
- [x] **T25** 🟡 PWR recompute: level-scaled inputs + THORNS/SPEED + recompute on level-up — **DONE**: added `thornsFrac` (offense credit = ½·reflect·primaryDPS, mirrors combat-manager) + `speedMult` (survivability EHP credit = ½ the movement bonus, CHILL-excluded) readers to `power-level.js`, folded into `offense()`/`survivability()`. Both read **0 / ×1** for the starter so `calibrateStarterK` still anchors a fresh L1/0-SP build at PWR 100 (verified: K_PWR 4.4610, starter=100, +60% thorns→111, ×1.8 speed→112, both→125). PWR now recomputes on **level-up** (`addXp`) and **SP allocate/deallocate** (`progression.js` → `gameEngine.recomputePlayerPWR()`), so it ramps live within a run as the per-run climb invests SP. The level-scaled GEAR inputs come online when `amplifySP` is wired into the effective-stat getters at **T26**. Unit 2233 green. (No version bump — deferred to T72.)
### Phase 2 — gear, matrices, income, crafting wiring
- [x] **T26** 🔴 Gear amplification into effective-stat getters (`amplifySP`) — **DONE**: `progression.js` now folds §2.1 amplification into every SP-driven getter. Added `_gearAmpPct(stat)` (Σ rolled `pct` of equipped `{stat,pct}` affixes /100; Matrices+resonance+sets join at T28) + `_ampSp(stat) = amplifySP(_spVal, ampPct, level)`. Rewired the 9 getters (HEALTH/TOUGHNESS/CRIT_CHANCE/CRIT_DAMAGE/SPEED/REGENERATION/CAPACITOR/REACTOR/EFFICIENCY) from `_spVal + flat getItemAffixTotal` → `_ampSp` (dropped the flat affix terms — gear is %-amp, never flat). `getSpStatValue` (spStatTotal) now returns the amplified value, so **combat-manager (THORNS/VAMPIRISM), lifecycle (DODGE), and power-level (PWR prior)** inherit amplification for free. Default-safe: 0 SP → 0; L1 or no gear → raw SP (starter unchanged). Old flat resist affixes (`{type,value}`) still read via `getItemAffixTotal` (untouched). Updated `cd-sustain-powerups` regen-cap test to drive its >3 HP/s dial through `getPassiveMod` (gear regen is now low-capped SP-amp). +6 new `gear-amplify-getters.test.js`. Unit **2239** green. Gear PRODUCER (new {stat,pct} rolls into inventory) wired at T27. (No version bump — deferred to T72.)
- [x] **T27** 🔴 Gear roll + crafting wired into inventory/GEAR — **DONE**: `item-system.createItem` now delegates to `gear-gen.rollGear` (the §2.1 `{stat,pct}` %-amplifier model) + a `_decorateGear` decorator that stamps the display/persistence fields (name, level, rarity styling, per-affix labels, `bonus/bonusType/bonusLabel`). `rerollItemAffixes`/`tierUpItem` rewritten to the new model via gear-gen (preserve legacy resist affixes, passive, sockets/signature/matrix, traits, level). `_refreshDerivedFromAffixes` + `scoreItem` handle the mixed amp/resist affix list (amp keyed by `.stat/.pct`, resist by `.type/.value` — disjoint, coexist). Canonical affix counts are now gear-gen's **RARITY_LADDER (1→8)**, superseding the legacy `RARITY_TIERS` (1→5); **dropped gear no longer rolls resists** (resists are TARGET-RESIST-craft-only). End-to-end verified: drop → gear-gen item → stash → equip → T26 amplified getters. Updated `item-tiers`/`cores-craft`/`item-resist-affixes` specs to the canonical ladder + `.stat` matching + no-resist-on-drop. Unit **2239** green + boot smoke 12/12. (Richer Fabricate/Calibrate/Target crafting UI = T42.) No version bump (deferred to T72).
- [x] **T28** 🔴 Matrix integration (sockets + amp + resonance into getters) — **DONE**: extended `progression._gearAmpPct` to fold socketed-Matrix amplification into the same per-stat amp% as gear affixes (§2.2) via `aggregateMatrixAmp(equipped)` — per-slot Matrix line × tier-factor + per-type resonance bonus — guarded to skip the aggregation when no socket is filled (early-game fast path). gear-gen already stamps `sockets:N`; added `player.socketMatrixAt(slot,matrix)` / `unsocketMatrixAt(slot)` thin wrappers (PURE matrix-system fns → reassign the slot, return displaced/removed Matrix, persist) for the T42 socketing UI. +4 Matrix cases in `gear-amplify-getters.test.js` (per-slot amp, affix+matrix stack, resonance flat +3%/extra piece, empty-socket no-op). Unit **2243** green + boot smoke 12/12. Set-bonus % folding (the last `ampPct` term) remains — small follow-on, fold into T42/polish. No version bump (deferred to T72).
- [x] **T29** 🔴 Income into drops/pickup (wave/difficulty/streak/find) — **DONE**: combat-manager's per-kill drop now uses `income.perKillRainshards({wave, difficultyMult, killstreakMult, findMult})` (BASE 25 × waveScale × mode-lens × streak × R$-find), REPLACING the 6.x flat model — late/harder kills now pay MORE (verified curve: w1=25→w30=83, HARD/streak boost, full NORMAL run ≈39k = design target). `difficultyMult` reads `runConfig.mode` (MODES align 1:1 with `INCOME.difficultyMult`); `killstreakMult` = `getStreakGoldMult`; `findMult` = `player.getGoldFindMultiplier()` (the revived R$-find axis hook, ×1 until R$-find content lands). Boss bounty = a milestone **multiple** of a normal kill (tiers 1-4 → ×6/9/13/18, scales with the curve); `isElite` flag pays ×3 (wired at T32/T34); asteroids pay a minor fraction (0.12/0.30). Pickup path (collision-system) unchanged — orbs carry the income-scaled value. Unit 2243 green + boot smoke 12/12. No version bump (deferred to T72).
### Phase 3 — weapons as loot
- [x] **T30** 🔴 Weapon-as-loot core: archetypes + traits stamp bullets + weapon level-scaling — **DONE** (3 sub-steps): weapons equip as rolled loot ITEMs (`weapon-gen` `{archetype,rarity,traits,element}`). **T30a** — `weapon-data.ARCHETYPE_TO_WEAPON`+`archetypeToWeaponId`+`weaponLevelScale` (+4%/lvl, cap L25); `player.equippedWeapon`+`equipWeaponItem`/`getEquippedWeapon`/`hasWeaponTrait`/`weaponTraitValue`; `applyWeaponTraits` at the `applyGlobalBulletUpgrades` chokepoint — ELEMENT trait overrides bullet element, BEHAVIOR (pierce/explosive/homing/split/ricochet/knockback/stun + chain hook) → same bullet fields the legacy mods used; `getEffectivePrimaryDamage` ×`weaponLevelScale` + DAMAGE_PCT/OVERCHARGE. **T30b** — `getEffectivePrimaryFireRate` folds FIRE_RATE_PCT/RAPIDFIRE; crit getters (progression) fold CRIT_CHANCE_PCT/CRIT_DAMAGE_PCT; per-bullet BIG_BULLETS/LONG_RANGE/PROJECTILE_SPEED_PCT. **T30c** — MULTISHOT/VOLLEY re-fire the weapon at ±angle offsets (silent, TWIN_CANNON idiom). **All four trait classes consumed.** Default-safe: `equippedWeapon` null until a drop (T31)/BUILD (T43) sets it → runtime unchanged. Legacy attunement/mod *stacks* are naturally 0 in the pivot (no shop) so they're inert (removal = T70 cleanup). +13 `weapon-loot.test.js`. Unit **2256** green + boot smoke 12/12. No version bump (deferred to T72).
  > **▶ T30 INTEGRATION MAP (surveyed 2026-05-27 — execute from this, no re-survey needed):**
  > **Firing path** (`js/modules/player/weapons.js`): input→`updateChargingSystem`(L195)→`firePrimary`(L470) dispatch→per-weapon `fireX()` (L571-1053) stamps bullet fields directly (damage/color/pierce/range/size + weapon-specific flags) then calls **`applyGlobalBulletUpgrades(bullet)`** (L1105-1262) ONCE — THIS is the single choke point that applies element attunements (L1132 reads `this.activeAttunements[activePrimary]`→`bullet.elements`), mechanic mods (homing L1189, pierce L1202, explosive L1209, stun/knock L1149-1152 via `_PER_WEAPON_*_ID` lookup tables L52-137 → `getPowerupStacks(upgradeId)`), and powerups (BIG_BULLETS L1196). Effective getters: `getEffectivePrimaryDamage` (L2408), `getEffectivePrimaryFireRate` (L2353 — rapid-fire L2376).
  > **Bullet fields** (`bullet.js reset` L33-144): element/elements, piercing, homing/homingStrength, explosive/explosionRadius, stunChance, knockbackChance — trait values materialize into the SAME fields (no bullet.js change needed). Behavior consumed in `update`(L252)/`applyHoming`(L586)/`explode`(L707)/`onHit`(L762).
  > **Trait model** (`weapon-traits.js`): trait = `{id,class,name,description,roll?{min,max}}`; classes ELEMENT(6)/BEHAVIOR(8: PIERCE,EXPLOSIVE,HOMING,CHAIN,RICOCHET,SPLIT,KNOCKBACK,STUN)/POWERUP(6: MULTISHOT,RAPIDFIRE,BIG_BULLETS,OVERCHARGE,LONG_RANGE,VOLLEY)/STAT(5: DAMAGE_PCT,FIRE_RATE_PCT,PROJECTILE_SPEED_PCT,CRIT_CHANCE_PCT,CRIT_DAMAGE_PCT). `rollWeapon()` (`weapon-gen.js`)→`{archetype,rarity,traits:[{id,class,value?}],element}`.
  > **Player storage** (`player.js` L161-167): `activePrimary`(id str), `ownedPrimaries`(Set), `activeAttunements`{weaponId:[ids]}; `getActivePrimaryConfig`(L2496)=`PRIMARY_WEAPONS[activePrimary]`; `equipPrimary`(L2504).
  > **PLAN:** (1) add `player.equippedWeapon` = a rollWeapon item; archetype→base `PRIMARY_WEAPONS` config (archetype ids map to weapon ids). (2) Add `applyWeaponTraits(bullet)` driven by `equippedWeapon.traits`, called from the `applyGlobalBulletUpgrades` choke point — ELEMENT→bullet.element(s), BEHAVIOR→pierce/explosive/homing/chain/ricochet/split/knock/stun flags, BIG_BULLETS/LONG_RANGE→size/range. (3) POWERUP MULTISHOT/VOLLEY→extra-bullet count at fire dispatch; (4) STAT + RAPIDFIRE → fold into `getEffectivePrimaryDamage`/`getEffectivePrimaryFireRate`/crit getters; weapon base damage ×`weaponLevelScale(player.level)`. (5) Subsume old per-weapon `_PER_WEAPON_*_ID`/attunement reads (gate behind "no equippedWeapon" fallback so legacy still works during transition; full removal at T70). Update weapon QA/e2e specs. **Test incrementally; commit in sub-steps** (trait-stamp core → level-scaling → powerup/stat fold → subsume legacy).
- [ ] **T31** 🔴 Weapon drops + Fabricate weapons [T30,T13]
### Phase 4 — randomized drafted runs
- [ ] **T32** 🔴 Run randomizer + draft hook into wave flow [T14,T40]
### Phase 6 — classes
- [ ] **T33** 🔴 Class pick wired into run start [T16]
### Phase 7 — balance
- [ ] **T34** 🟡 Gear/level-aware director (reads live PWR) [T25,T26]
- [ ] **T35** 🔴 Global stat caps (dodge/crit/vampirism) [T26]

## ▶ UI TRACK
- [ ] **T42** 🔴 Crafting/inventory UI panel (Fabricate/Reroll/Calibrate/Target/Upgrade/Combine/Salvage) [T13,T27]
- [ ] **T43** 🔴 Class-pick + loadout in BUILD [T07,T33]
- [ ] **T44** 🟡 Loot QoL (auto-salvage, lock, stash sort, loadout presets) [T27]
- [ ] **T45** 🔴 Bounty board wiring + progress events [T15,T41]

## ▶ COLD-START, MIGRATION & SHIP
- [ ] **T60** 🔴 New-player starter kit (basic weapons + gear) [T10,T11,T30,T27]
- [ ] **T61** 🔴 Account migration (old meta → R$ + gear convert) [T21,T23,T24,T26]
- [ ] **T70** 🟡 Tests pass (unit + QA updates + new-module specs)
- [ ] **T71** 🟡 Balance pass (income vs sink; levelRamp; weapon-scaling; budget)
- [ ] **T72** 🔴 README/CHANGELOG/VERSION (MAJOR bump)

### Parallel dispatch map
Wave 1 (T01–T09) all at once → Wave 2 (T10–T16, T40, T41) all at once → serial spine
(T21 alone → T20/T22/T23 → T24→T25→T26→T29 → T27→T28→T30→T31→T32→T33 → T34/T35) →
UI (T42/T43/T45 serial, T44 parallel) → T60→T61→T70→T71→T72.
**Contended files** (never double-dispatch): `game-engine.js`, `player.js`,
`progression.js`, `combat-manager.js`, `wave-manager.js`, `shop-dom.js`,
`inventory-overlay.js`.

---

# ✅ ARCHIVED — completed roadmaps (detail in CHANGELOG + docs/)
- **Combat-Depth / Director §14** — FIX-01..04 + DIR-01..10 COMPLETE (verified 2026-05-26);
  CD no-downsides + energy + blood + sustain kit COMPLETE (6.197→6.221); step-3
  CD-17 telemetry + RUN-07 balance pass = playtest-gated.
- **BOSS** (all 10 unique bosses), **ENMY** (enabling systems + 6 trick enemies +
  Conduit/Juggernaut/Thornback), **RUN** (adaptive director live), **ITEM/META**
  (tier-gated resists, Cores crafting) — all COMPLETE.
- **P7 Mobile/Co-Pilot** — AS/FB/MB core COMPLETE (6.216→6.221); remaining MB-4/5/7 +
  AS deferrals are device/eye-gated.
- **7.x economy/locking/debug** — built (uncommitted): `?debug` mode, cheat removal,
  radial gating, compact loadout UI, pause LOADOUT tab, health/tank/regen fixes,
  1-4 controls. **Being folded into the Looter Pivot** (the locking/flat-gold/card
  parts are reversed by Phase 0 above; the rest is kept).
- Older plans (multiplayer, WebGL, mobile, refactors, perf) → `docs/` + `CHANGELOG.md`.
