# Rainboids — Implementation Plan (active dispatch board)

> **2026-05-27 — AUDIT CORRECTION.** A full pivot audit found the prior board's
> "ALL FUNCTIONAL SYSTEMS DONE" claim was **optimistic**. The engine *foundation*
> (T01–T35, T60–T61) is built+tested, but the looter loop is **not connected to the
> spawn/combat layer** and the **player-facing BUILD UI is still the old roguelite
> shop**. Two whole systems the draft/classes depend on do nothing yet. The real
> remaining work is the **LOOTER COMPLETION** board below.
>
> Design: `docs/LOOTER_ECONOMY_PIVOT.md` (+ `…_IMPLEMENTATION.md`). VERSION 8.0.0,
> on `master`, NOT pushed (live GitHub-Pages deploy). MAJOR ship is gated on this board.

## Dispatch rules
- **Exclusive file ownership.** Tags: 🟢 NEW-FILE (zero contention, fan out) · 🟡
  ISOLATED (one rarely-touched file) · 🔴 SHARED (hot orchestration file — run
  one-at-a-time). Effort: CHEAP / MED / EXP. Subagents never run git; the
  orchestrator verifies + commits.
- Each task ends green (`npm run test:unit` + `node --check`); write QA when it
  changes player-facing behavior. **Inert new modules/tests/docs = NO version bump**;
  **integration that changes the running game = version bump** (solo → `VERSION`+`CHANGELOG.md`).
- Status: `[ ]` todo · `[~]` in progress · `[x]` done.
- **Hot/contended files** (never double-dispatch): `game-engine.js`, `player.js`,
  `progression.js`, `combat-manager.js`, `wave-manager.js`, `weapons.js`,
  `shop-dom.js`, `collision-system.js`, `lifecycle.js`, `abilities.js`.

---

# ▶ LOOTER COMPLETION — post-audit board (2026-05-27)

The two load-bearing epics are **A (make the draft real)** + **D (make the build
reachable)**. **C (power weapons as gear)** is the new user requirement. B/E add
depth + polish. Recommended order: D-core → A → C → B → E throughout → F ship.

## EPIC A — Content wiring: make the drafted stage actually spawn
*The draft picks theme/modifiers/elites; spawns ignore all of it (only R$ payout reads it). `entity.isElite` has no setter → elites never spawn. All 13 modifiers are no-ops.*
- [ ] **A1** 🟢 CHEAP `wave/stage-overlay.js` (new) + `tests/unit/stage-overlay.test.js` — pure `buildStageOverlay(runStage, wave, wps)` (→ null when no draft = non-regression), `stampStageElement(enemy, element)` (sets `enemy.element` + `resist[el]≥0.5` + counter-weakness), `pickEliteIndices(count, n, seed, wave)` (deterministic from `compositionSeed`). Pre-collapses modifier semantics → `{element, stampElement, countMult, hpMult, dmgMult, eliteIds, elitePack, seed, modifierIds}`.
- [ ] **A2** 🔴 CHEAP `wave/wave-manager.js` — read `this._stageOverlay = buildStageOverlay(...)` once in `spawnWaveEntities` (~:738); apply `countMult` at the group level in `spawnSubWave` (:814) + `tryAdvanceSubWave` (:922) (never scale bosses); apply `hpMult`+`stampElement` per-enemy in `applyEnemyLevelScaling` (after :1284). Covers SWARM/JUGGERNAUT/GLASS/ELEMENTAL_SURGE/TREASURE + theme element. [A1]
- [ ] **A3** 🟢+🔴 CHEAP `enemy/elite.js` (new) + wire into `wave-manager.spawnLeveledEnemies` (~:1166, copy the `miniBossIdx` pattern) — `promoteToElite(enemy, eliteIds, wave, wps)` = **the `isElite` setter** (sets `isElite=true`, HP×3–5 by depth, `eliteAffixes`, radius+glow tag) + `applyAffix(enemy, id)` reusing existing config hooks: SHIELDED→`frontalShield`, REFLECTIVE→`reflect`, SPLITTER→`splitOnDeath`, SUMMONER→`spawner`, HAZARDOUS→`trailHazard`, VOLATILE→`deathFlare`, WARDED→`adaptive`, CONDUIT/AURA→`aura`, LEECH→`stripsBuff`, TELEPORTER→`blink`, JUGGERNAUT→knockback-immune+HP. Unmapped affix = no-op that still flips `isElite` (so it still spawns + pays ×3 R$). Verifies the dormant `combat-manager.js:1022/1057/1075` elite reads. [A1, A2]
- [ ] **A4** 🔴 CHEAP `wave/wave-manager.js` + `combat-manager.js` — cheap modifier injections/gates: CONDUIT_FIELD/MIRROR inject 1 CONDUIT_NODE/PRISM_MIRROR per sub-wave; SUDDEN_DEATH gates `createHealthOrb` (combat-manager:695); LOW_GRAVITY sets a `game._lowGravity` flag read in player physics. [A2]
- [ ] **A5** 🔴 EXP — new-logic affixes (no existing hook): VAMPIRIC (enemy-side lifesteal in the player-damage path), FRENZIED/BERSERKER (HP/time-keyed speed+fire ramp tick), MAGNETIC (pull-player force), HEXER/ARCANE (debuff bolt). [A3]
- [ ] **A6** 🔴 EXP — new-system modifiers: METEOR_STORM (periodic asteroid spawner in `updateWaveSystem`), TOXIC_ATMOSPHERE (ambient player DoT tick), FOG (visibility overlay render). Optional cheap nebula theme-tint (single low-alpha fillRect) if it doesn't force a nebula-atlas regen. [A2]
- [ ] **A7** 🟡 CHEAP `tests/qa/` — new `08-stage-draft.spec.js` (drafted SWARM+eliteIds → more enemies, ≥1 `isElite`, stamped element, elite ×3 R$ payout) + a non-regression baseline guard (`runStage=null` ⇒ WAVE_DATA-identical counts). Version bump when A2/A3 land (player-visible).

## EPIC B — Class mechanics: make the 7 classes more than a stat lens
*The +20% favored-stat lens works; the 7 `classMechanicId` hooks have ZERO consumers; signature abilities are v1 aliases. ~Most map onto existing precedent blocks.*
- [ ] **B0** 🟢 CHEAP `player/class-mechanics.js` (new) + one-line `initClassMechanic(player)` at `game-engine.js:1167` — seeds per-class state; pure math helpers for unit-testing. Unblocks B1–B9.
- [ ] **B1** 🔴 CHEAP Elementalist `reaction_amplifier` — clone the CATALYST block (`collision-system.js:3096`): reactions +50%/stronger, chain depth +1; optional status-spread (KINDLING pattern). [B0]
- [ ] **B2** 🔴 CHEAP Bulwark `regen_overshield` — reuse the `bloodshield` buffer (regen toward cap in the player update timer block) + clone FAILSAFE (`lifecycle.js:389`) for can't-be-one-shot. [B0]
- [ ] **B3** 🔴 CHEAP Reaper `heal_on_kill_overheal` — clone SANGUINE heal-on-kill (`combat-manager.js:1253`) + bank overheal via `addBloodshield` (BLOODSHIELD overheal path). [B0]
- [ ] **B4** 🔴 CHEAP Striker `momentum_killstack` — APEX-execute clone (`collision-system.js:2749`) + Bloodlust-style stack/decay (`combat-manager.onEnemyKill` + player update) + fire-rate divisor in `getEffectivePrimaryFireRate` (weapons.js:2516). [B0]
- [ ] **B5** 🔴 CHEAP Wildcard `loot_gambit` — loot/R$ multipliers in `dropOrbsFromEntity` (combat-manager:898/994/1043) + per-wave random buff at `spawnWaveEntities` (wave-manager ~:754, beside the per-wave recharges). [B0]
- [ ] **B6** 🔴 CHEAP — Engineer power-cost discount (one line in `getEffectivePowerCost`, progression.js:668) + Tempest free-dash (one line in `_triggerDash`, player.js:1640). [B0]
- [ ] **B7** 🔴 MED Tempest `free_dash_trail` — `player.dashTrail` entity list, emit on dash, tick+AoE-damage in `updateActiveAbilities` (cryoRings template), render the trail. [B6]
- [ ] **B8** 🔴 MED Engineer `deploy_construct` — dedicated `player.classConstructs` array (separate from ability-cooldown sentries so it persists), reuse the sentry orbit/fire loop + `spawnSentryDroneBullet`, add a render call. [B0]
- [ ] **B9** 🔴 CHEAP/MED signature differentiation in `activateAbility` (abilities.js:545) — let signature ids read their own bespoke config (already in weapon-data.js:1615-1656) instead of the alias: FORTRESS (DR 0.6 + root), HARVEST (AoE drain), ELEMENTAL_NOVA (stun + element blast) = CHEAP; OVERDRIVE_BURST (→ real overdrive) = MED; keep SLIPSTREAM/JACKPOT as v1 aliases. [B0]

## EPIC C — Power weapons as gear/loot (NEW — all weapons are now loot)
*Primaries became loot (T30/T31); power weapons still use the fixed `activePower`/`POWER_WEAPONS` + charge/energy model. Make power weapons rolled loot ITEMs with rarity + traits/attunements, equippable from the inventory. Per-power payloads (Nova ring/mine/missile/beam) are NOT pooled bullets, so they bypass `applyWeaponTraits` — element/scaling must stamp the payload entity directly.*
- [ ] **C1** 🟡 CHEAP `combat/weapon-data.js` + `combat/weapon-traits.js` (+tests) — add `POWER_ARCHETYPES` (CHARGE/MINE/NOVA/MISSILE/LANCE/LIGHTNING/SINGULARITY/PRISM/ORBITAL/CRYO/OVERDRIVE) + `POWER_ARCHETYPE_TO_WEAPON` map + `powerArchetypeToWeaponId()`. Extend `ARCHETYPE_TRAIT_EXCLUSIONS` for the new power archetypes (AoE/placed/beam exclude PIERCE/RICOCHET/SPLIT/HOMING/LONG_RANGE; CHARGE/MISSILE keep MULTISHOT/VOLLEY = +projectiles). Power-meaningful traits = ELEMENT (attunement), DAMAGE_PCT, CRIT_*_PCT, BIG_BULLETS→AoE radius, FIRE_RATE_PCT/RAPIDFIRE→cooldown, KNOCKBACK/STUN (Nova/Cryo/Orbital). `rollWeapon` is already archetype-generic — no roller change. *(no behavior change)*
- [ ] **C2** 🔴 CHEAP `player/player.js` + `player/weapons.js` — add `equippedPowerWeapon` field (parallel to `equippedWeapon`) + `equipPowerWeaponItem(item)` (sets field + `activePower = powerArchetypeToWeaponId(archetype)`, resets charge/cooldown) + `getEquippedPowerWeapon()` + player wrappers. Legacy `activePower`/`ownedPowers`/`equipPower` stay as the no-item fallback. [C1]
- [ ] **C3** 🔴 MED `player/weapons.js` — fire integration: in `firePower` (:1465) clone+scale `config` via `boostPowerDamage`/`TWIN_CAST_DMG_FIELDS` with `weaponLevelScale(level) × (1+DAMAGE_PCT/100)`; `FIRE_RATE_PCT`→`config.cooldown` scalar (+ optional energy discount); `BIG_BULLETS`→AoE radius; **stamp `equippedPowerWeapon.element` onto the ring/mine/missile/beam payload entity** (and CHARGE_SHOT bullets via the `fireChargedShot` effectMult/element path, since they already hit `applyWeaponTraits`). Element overrides the base `WEAPON_ELEMENTS` table; no ELEMENT trait → base element. Status-apply on payload via the element-system hook. Default-safe: no item ⇒ today's behavior. [C2]
- [ ] **C4** 🔴 CHEAP `world/item-system.js` + `combat/combat-manager.js` + `game-engine.js`/`shop/crafting.js` — `createPowerWeaponItem(level,rarity,archetype)` + a `weaponKind:'primary'|'power'` discriminator on `decorateWeaponItem` (keep `slot:'weapon'`/`kind:'weapon'` for stash compat); `_weaponArchetypeName` consults `POWER_WEAPONS` for power archetypes; add a power-weapon drop roll in combat-manager (~:1022); Fabricate validates archetype against the correct pool by `weaponKind`. [C1]
- [ ] **C5** 🔴 CHEAP `player/weapons.js` save schema + `ui/radial-menu.js` + tests — persist `equippedPowerWeapon` + reload routing by `weaponKind`; convert the in-run radial power picker (radial-menu.js:33/88, currently picks static `POWER_WEAPONS`) to choose among **owned power-weapon ITEMs** → `equipPowerWeaponItem`. +`power-weapon-gen`/`power-level-scale`/equip unit specs + QA in 07-weapons. Version bump (player-visible). [C2, C3, C4]
- *(UI equip-from-stash for power weapons is built in D4.)*

## EPIC D — BUILD / Inventory UI: make the persistent build reachable
*The live pre-run screen is the OLD `#shop-overlay` UPGRADES ability-tree (`openArmory`→`showShopDom(true)`). Class/weapon-loot/Matrix axes have full engine support, ZERO UI. The modern pattern is the self-contained overlay (draft/bounty); the GEAR tab is the only looter-aware panel and it runs the LEGACY `cores.js` crafting backend.*
- [ ] **D1** 🟢 MED `ui/build-overlay.js` (new, modeled on `draft-overlay.js`/`bounty-overlay.js`: own DOM + scoped `<style>`, `open/close/isOpen/refresh`) — header (R$ wallet + title + BOUNTIES btn) + tab rail (CLASS/WEAPONS/GEAR/STASH) + reused RUN-SETUP/START footer (call exported `loadoutReadiness`/`runSetupReadout`/`clampRunConfig`). Repoint `game-engine.openArmory` (:4891) to it; keep the shop-tree for the in-run gold path only.
- [ ] **D2** 🟡 CHEAP CLASS tab — 7 cards from `CLASSES`/`CLASS_ORDER` (+ NO-CLASS) → `setSelectedClass`/`getSelectedClass`; selected highlight. [D1]
- [ ] **D3** 🟡 MED `ui/item-card.js` upgrade (opt-gated so existing callers unaffected) — 8-tier rarity pill, `{stat,pct}` amp affixes + `INACTIVE ⚠` on 0-SP stats, weapon-trait grouping (Element/Behavior/Powerup/Stat%), socket strip (`◆`/`◇`), set 2/3/5-pc progress, resonance readout. Feeds D4/D5.
- [ ] **D4** 🟡 MED WEAPONS tab — primary + power slot tiles + the weapon-loot stash (`stash.filter(kind==='weapon')`, **un-filters** what armory-overlay hides); equip via `equipWeaponItem` / feature-detected `equipPowerWeaponItem` (C2). [D1, D3]
- [ ] **D5** 🔴 MED GEAR tab + Matrix socketing — 5 slots + equip-from-stash (`inventory.equipFromStash`/`stashForSlot`/`equipDelta`); socket strip → `socketMatrixAt`/`unsocketMatrixAt`. **Adds `meta.matrixStash`** (matrices have no drop/stash source today) seeded by Combine + a future drop. [D1, D3]
- [ ] **D6** 🔴 MED CRAFTING panel + backend swap — add `engine.craftReroll/craftUpgrade/craftSalvage/craftCombine` thin methods over `shop/crafting.js` (mirror existing `fabricateGear/Weapon`); FABRICATE + per-item Reroll/**Calibrate**/**Target**/Upgrade/Salvage/**Combine** in the overlay; **retire the `world/cores.js` crafting path** in armory-overlay. [D5]
- [ ] **D7** 🟡 CHEAP STASH tab + QoL + BOUNTIES button — sort/filter/lock/auto-salvage/bulk-salvage (`sortStash`/`partitionBulkSalvage`/`setAutoSalvage`); header BOUNTIES button → `openBountyBoard` (fixes the orphaned bounty overlay). [D1, D3]
- [ ] **D8** 🔴 MED retire legacy + tests — delete `loadout-overlay.js`+`openLoadout`; retire the shop-tree pre-run mode + GEAR/PASSIVES tabs + unlock store (`unlockPreRunItem`/`sellUnlock`) + card-draft/wave-pick/shop-suggest DOM; rewrite the 12 stale pre-pivot QA specs (08-armory/09-loadout/31-build-flow/12/13/19) + new `53-build-overlay.spec.js`; MINOR version bump; README structure (+build-overlay, −loadout-overlay). [D1–D7]

## EPIC E — HUD + text + dead-code cleanup
- [ ] **E1** 🔴 CHEAP `hud/combat.js` — gate off the stale powerup pickup label (:269-329) + the timed powerup-indicator column (:331-463) for the looter model.
- [ ] **E2** 🟡 CHEAP `hud/status.js` — "Coins Earned" (:479) → "Rainshards" / R$; relook the Game Complete "speedrun" framing (TIME/Refresh) as a looter run summary.
- [ ] **E3** 🔴 CHEAP `wave/wave-manager.js` — remove the phantom `skillPoints += 1` + "+1 SP" toasts (:577,:770 — `skillPoints` is a dead field; real SP is `addXp`→`sp`); delete dead `completeWave` (:1310). PWR mid-run recompute: add `recomputePlayerPWR()` to `equipItem`/`socketMatrixAt`/`addPowerup`.
- [ ] **E4** 🟡 CHEAP — Rainshards icon: replace the gold-coin sprite (`stats-overlay.js:337`) with an R$ glyph; remove vestigial ✦/⬢ Cores glyphs (`shop-dom.js:1338/1380/1417/1454/1497`) + dead `game.cores`/`meta.cores` plumbing (`updateShopCurrencyDom` :665).
- [ ] **E5** 🟡 CHEAP `ui/static-dom.js` tutorial — replace "Spend gold in UPGRADES (🛒)" / "+% GOLD" / "survivor-card pick" (:124-136) with looter wording (loot/craft/draft); fix drifted weapon names.
- [ ] **E6** 🔴 CHEAP dead-module deletion + hygiene — delete `combat/card-draft.js` + `world/run-shop.js` + `#wave-pick-overlay`/`#shop-suggest-overlay` DOM (inert; remove the stuck-wave recovery that can still fire the old card overlay at wave-manager:187-189); rename `world/cores.js` → a `crafting-costs`-style module (its cost math is live, only the name is stale); move `js/modules/autofire-diag.js` under `debug/`. README structure update.

## EPIC F — Balance & ship (gated)
- [ ] **F1** 🟡 Balance pass — PLAYTEST-GATED (income vs. crafting sink, `levelRamp` softcap, weapon/power level-scaling shape, draft difficulty budget, elite HP band). Tunables flagged `@T71` in source.
- [ ] **F2** 🔴 Ship — full README prose rewrite (looter-shooter); CHANGELOG; `git push origin master` (live deploy = USER's call).

---

# ✅ ENGINE FOUNDATION — DONE (T01–T35, T60–T61; detail in git + CHANGELOG)
*Built+tested on `master`, suite ~2348. These are the pure modules + engine hooks the
COMPLETION board consumes. Inert until wired by the epics above.*

- **Wave 1 data (T01–T09):** `income.js`, `crafting-costs.js`, `gear-scaling.js`,
  `weapon-traits.js`, `matrix-data.js`, `item-templates.js`, `classes.js`,
  `bounty-data.js`, `run-templates.js`.
- **Wave 2 logic+UI (T10–T16, T40, T41):** `weapon-gen.js`, `gear-gen.js`,
  `matrix-system.js`, `crafting.js`, `run-randomizer.js`, `bounty-engine.js`,
  `class-system.js`, `draft-overlay.js`, `bounty-overlay.js`.
- **Serial spine (T20–T35, T60–T61):** unlock-everything at boot
  (`setAllUnlocked(true)`); Gold→R$ display rename (internal `money`/`accountGold`
  retained); card-draft disabled (`fireSurvivorOverlay=false`); Cores eliminated at
  the salvage/craft sites; per-run level/SP reset + banked→R$ migration; PWR
  level/SP recompute (gear/loadout hook still MISSING → E3); gear `amplifySP`
  getters + Matrix amp/resonance; income-scaled drops; weapons-as-loot core +
  drops/Fabricate; stage-draft overlay wired into stage-clear (spawns DON'T read it
  → EPIC A); class lens + signature aliases (mechanics NOT wired → EPIC B); stat
  caps; starter kit; account migration.
- **Partial UI (T42/T43/T45 `[~]`):** GEAR-tab Fabricate exists (on legacy cores
  backend → D6); class-pick + bounty-board engine hooks exist but **no UI**
  (→ D2/D7); draft + bounty overlays built (bounty orphaned → D7).

> **Integration gotchas (still live):** (a) canonical rarity = the **1–8** ladder
> (`RARITY_LADDER`), superseding the legacy 1–5 `RARITY_TIERS`. (b) doc "REGEN" =
> real SP id `REGENERATION`. (c) `crafting-costs.js` keys rarities Capitalized;
> gen/ladder modules use lowercase/tier-number — `crafting.js` normalizes.
> (d) matrices have **no drop/stash source** yet — D5 adds `meta.matrixStash`.
> (e) `equipPowerWeaponItem` doesn't exist until C2 — D4 feature-detects it.

---

# ✅ ARCHIVED — pre-pivot roadmaps (detail in CHANGELOG + docs/)
- **Combat-Depth / Director §14** — FIX-01..04 + DIR-01..10 COMPLETE; CD kit
  (no-downsides, energy, blood, sustain) COMPLETE (6.197→6.221).
- **BOSS** (10 unique bosses), **ENMY** (6 trick enemies + Conduit/Juggernaut/
  Thornback + enabling systems), **RUN** (adaptive director), **ITEM/META**
  (tier-gated resists, Cores crafting — now folded into R$) — COMPLETE.
- **P7 Mobile/Co-Pilot** — AS/FB/MB core COMPLETE; remaining device/eye-gated.
- **7.x economy/locking/debug** — folded into the pivot (locking/flat-gold/card
  parts reversed; `?debug`, compact loadout, 1-4 controls kept).
- Older plans (multiplayer, WebGL, mobile, refactors, perf) → `docs/` + `CHANGELOG.md`.
