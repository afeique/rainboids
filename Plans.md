# Rainboids — Combat-Depth Expansion Plans.md

作成日: 2026-05-22 · 最終整理: 2026-05-22 (synced to 6.83.0 — shipped work moved to the ledger below)

Source design docs (in `docs/`):
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (what/why)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (Plan A)
- `Unified Skills (4-Slot) — Implementation Plan – 2026-05-22.md` (Plan B)
- `Item Tiers, Resistances & Traits — Implementation Plan – 2026-05-22.md` (Plan C)
- `Enemy & Boss Revamp — Design Plan – 2026-05-22.md` (Plan D — enemy batches + 10 unique bosses)
- `Run-Meta Overhaul — Loadout, Leveling, Inventory & Cores — Implementation Plan – 2026-05-22.md` (Plans E–I — roguelite meta-progression)
- `Enemy Uniqueness & Enabling Systems — Plan – 2026-05-22.md` (Phase A.E9 enabling systems + A.E10 uniqueness)

> **⚠️ Pending re-plan:** new plans that SUPERSEDE parts of the below are being
> integrated. Phases D / E–I / R and the remaining item & ability work may be
> replaced. Treat the **Shipped ledger** as authoritative for what exists today;
> treat the task tables as the pre-supersession backlog until the new plans land.

---

## ✅ Shipped ledger (6.57.0 – 6.83.0) — done, not re-plannable

**Element & Resistance foundation (Phase A core):**
- A.E1 (6.57.0) element taxonomy + `combat/elements.js` + element/resist on all weapons/enemies/bullets
- A.E2 (6.58.0) player→enemy resistance in `applyDamageToEnemy` + damage cues
- A.E3 (6.62.0) enemy status engine: CORRODE / CHILL / FREEZE+brittle / CONDUCT / OIL / MARK / BLEED
- A.E4 (6.63.0) synergy reactions: FREEZE→SHATTER, OIL+Pyro flare, CONDUCT/CORRODE amps
- A.E5 (6.64.0) enemy→player resistance + enemy bullets carry element
- A.E6 (6.66.0) weapon element identity — primary on-hit status dispatcher
- A.E7 (6.65.0) item resistance affixes in `ITEM_AFFIX_POOL`
- A.E8a (6.67.0–6.70.0) 10-enemy retrofit + GUARDIAN armor floor + SENTINEL frontal shield + WASP swarm-flock

**Enabling systems (Phase A.E9):**
- A.E9-S1 (6.75.0–6.76.0) **player-side statuses** — CHILL/CORRODE/BURN (lethal-safe via extracted `_resolvePlayerLethal`); `player/player-status.js`
- A.E9-S2 (6.78.0) **persistent hazards** — `world/hazard-field.js` HazardField + `spawnHazard()`
- A.E9-S3 (6.80.0) **mid-fight spawning** — `requestEnemySpawn` + `canSpawn` (concurrent cap 40)
- A.E9-S7 (6.83.0) **ally support auras** — `enemy/support-aura.js` runAura (shield/heal) + allyShieldMult

**Enemy roster — 20 types (10 original + 10 new):**
- A.E10-U1 (6.77.0) distinct silhouettes for the new types + fixed the default-triangle render bug
- New: Cinder + Glacier (6.71.0), Frost Lance + Ashen Detonator death-flare (6.72.0), Tesla Wraith + Plaguebearer (6.73.0; Plaguebearer **acid-trails** 6.79.0), Warden adaptive-resist (6.74.0), Hydra split-on-death (6.81.0), Spore Carrier drone-spawner (6.82.0), Lumen Drone ally-shield (6.83.0)
- Elemental flourishes auto-live: Cinder ignite / Plaguebearer corrode / Frost chill (via S1)

**Skills (Phase B):**
- B.S1 (6.59.0) 4-slot model (`equippedSkills[4]`, `skillCooldowns[4]`, `activateSkill(slot)`)
- B.S2 (6.61.0) keys 1–4 + retired TAB/Q · B.S3 (6.61.0) 4-slot HUD bar

**Items (Phase C):**
- C.I1 (6.60.0) 8-tier rarity ladder (Common…Transcendental) + affix/resist counts by tier

---

## Phase A — remaining enemy types + enabling systems

### A.E8 — remaining new enemy types (each gated on its enabling system)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| A.E8c-rem | **Conduit Node** (Volt support) — the last of Batch 3 | Spawns + buffs/heals allies; killing it drops the buff; AI survival green | A.E9-S7 | cc:TODO |
| A.E8d-rem | Batch 4 (Void/Radiant) remaining: **Devourer** (eats projectiles→shield), **Phantom** (periodic invis, MARK reveals), **Prism Mirror** (reflects projectiles), **Beacon** (homing/MARK decoy) | Each verb live + counterplay; beams/melee bypass Devourer; MARK reveals Phantom; AI survival green | A.E9-S4, A.E9-S5, A.E9-S6 | cc:TODO |
| A.E8e-rem | Batch 5 (anti-meta + bruisers) remaining: **Leech** (strips a buff), **Null Drone** (skill-suppress aura), **Juggernaut** (telegraphed ram), **Thornback** (counter-burst), **Wraithworm** (burrow→lunge) + artillery (Pyrewing, Hailmother, Storm Diver, Bile Mortar, Singularity Mite) | Each verb live + counterplay; Leech/Null read the 4-slot model; AI survival green | A.E9-S8, A.E9-S9, A.E9-S10, A.E9-S11 | cc:TODO |

### A.E9 — remaining enabling systems

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| A.E9-S4 | **Projectile absorption** (Devourer): enemy eats player bullets in a maw cone → temp shield; beams/melee bypass | Bullets in the maw are consumed (no dmg) + shield ticks up; beams still hit; unit test the cone check | - | cc:TODO |
| A.E9-S5 | **Cloak/invisibility** (Phantom): periodic invis (skip render + de-target), revealed by MARK/AoE | Cloaked enemy isn't auto-targeted; MARK/AoE reveals; unit test the targetability gate | - | cc:TODO |
| A.E9-S6 | **Projectile reflection** (Prism Mirror): front-arc reflects player bullets back as enemy bullets; beams/melee bypass | Frontal bullets bounce back; flank/beam bypass; unit test the reflect decision | - | cc:TODO |
| A.E9-S8 | **Player-buff removal** (Leech): strips/suppresses a player powerup/skill-buff on contact | A buff is removed/suppressed on hit (reads powerup map + 4-slot skills); FX/toast; unit test the strip | - | cc:TODO |
| A.E9-S9 | **Skill-suppress aura** (Null Drone): aura lengthens skill-cooldown regen / blocks activation nearby | In-aura skill cooldowns stall / activation blocked; HUD cue; unit test the gate | - | cc:TODO |
| A.E9-S10 | **Enemy teleport/burrow** (Tesla teleport flourish, Wraithworm): periodic blink/burrow→re-emerge w/ telegraph; can't blink while frozen | Enemy relocates on a cadence w/ telegraph; frozen blocks it; unit test the frozen-guard | - | cc:TODO |
| A.E9-S11 | **Generalized telegraphed strike**: extract TITAN's wind-up→strike into a reusable helper (Ashen telegraph, Juggernaut ram, boss attacks) | A wind-up→strike runs via the shared helper; unit test the phase timing | - | cc:TODO |

### A.E10 — enemy uniqueness + remaining flourishes

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| A.E10-U2 | **Distinct behaviors** for the 10 new types beyond reused patterns (Cinder kamikaze dive, Glacier slam, Warden color-telegraph, etc.) | Each reads as its own enemy in playtest; AI survival green | - | cc:TODO |
| A.E10-U3 | **Remaining deferred flourishes**: Glacier brittle-shatter, Ashen telegraph (S11), Tesla teleport (S10), TANGERINE oil (S1/S2), TITAN demote (Plan D). *(Cinder ignite / Plaguebearer corrode+trails / Frost chill already LIVE.)* | Each shipped type's signature live + counterplay; AI survival green | A.E9-S10, A.E9-S11 | cc:TODO |

## Phase B — remaining skills

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| B.S4 | Loadout UI: assign any owned skill to slots 1-4 (coordinate w/ Phase-7 skill-tree UI) | Player places any owned skill into any slot; loadout drives HUD + keybinds | - | cc:TODO |
| B.S5 | New skills batch (~8): Overdrive (power→skill), Bullet Time, Bloodlust, Designator, Elemental Infusion, Aegis Barrier, Blink, Gravity Snare | Each works in any slot; every config has a live consumer; README power-weapon count reflected | A.E3 | cc:TODO |

## Phase C — remaining item tiers/traits

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| C.I2 | Resist roll display + tier-gated resist counts | Resist rolls appear on Exceptional+ and scale with tier | - | cc:TODO |
| C.I3a | Self-contained traits: Glass Cannon, Bullet Bloom, Echo, Orb Magnet, Hoarder's Greed, Momentum, Executioner's Edge, Second Heart, Reactive Plating (NEW `item-traits.js`) | Transcendental visibly stacks 5 traits; each has a live consumer | - | cc:TODO |
| C.I3b | Element traits: Hex Touch, Frostbite, Conductor, Elemental Overflow, Prismatic Soul | Each applies its status via the A.E3 helpers | C.I3a | cc:TODO |
| C.I3c | Skill traits: Twin Cast, Adrenaline Junkie, Overcharged | Each affects the 4-slot skill model | C.I3a | cc:TODO |
| C.I4 | Keystone reconcile: shared `ITEM_TRAITS` pool, two delivery channels (drop + stage-clear keystone card) | A rule-change acquirable via Legendary+ drop OR keystone card | C.I3a | cc:TODO |

## Phase D — Bosses (10 unique, multi-phase) — may be superseded

D.B0 is the shared chassis; every boss pair depends on it. Reuses `boss-rage.js`.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| D.B0 | Boss infra: always-visible boss healthbar UI (name + segmented HP + phase pips + element); declarative phase-script runner `enemy/boss-phases.js`; weak-point sub-entity layer `enemy/boss-parts.js`; intro/death sequences `enemy/boss-intro.js` | Unit tests: phase gates fire once in order + invuln during transition; weak-point gating; a stub boss reaches every phase + is killable; healthbar shows name/phase/element | - | cc:TODO |
| D.B1 | Bosses 1–2: THE HARBINGER (1-3, Kinetic — rotating bolt-head weak-points) + THE AEGIS (2-6, armor — rotating plate-gap, CORRODE-bypass, plate-shed). Validates the chassis | Both spawn w/ name card + healthbar; weak-points + armor gating work; enrage fires; killable in 45–120s; boss smoke tests green | D.B0 | cc:TODO |
| D.B2 | Bosses 3–4: LUMEN THE PRISM SOVEREIGN (3-9, Radiant — reflect-ring, shield drones, DISJUNCTION) + GEMINI (4-12, Pyro+Cryo twins — opposite resists, tether, partner-enrage) | Lumen reflect/shield/PURGE works; Gemini forces element-switching + partner-enrage; smoke tests green | D.B0 | cc:TODO |
| D.B3 | Bosses 5–6: MAELSTROM THE STORM CROWN (5-15, Volt — conduit nodes, CONDUCT rain) + THE HIVEMOTHER (6-18, Toxic — egg-sac spawns, CORRODE clouds) | Node-priority opens windows; Hivemother egg-sacs cancellable + adds manageable; smoke tests green | D.B0 | cc:TODO |
| D.B4 | Bosses 7–8: THE IRON THRONE (7-21, 4 per-element turrets, core-invuln-while-turrets-live) + THE WARDEN PRIME (8-24, adaptive resist wall, ADAPTIVE PURGE) | Iron Throne element-cycling clears turrets; Warden forces rotation; smoke tests green | D.B0 | cc:TODO |
| D.B5 | Bosses 9–10: NULLMAW THE DEVOURER (9-27, Void — pull, projectile-eat cone, IMPLOSION) + THE PRISMARCH/OMEGA (10-30, all 7 — 5-aspect gauntlet). Wire `isFinalBoss` → run-complete | Nullmaw punishes feeding the maw; Prismarch reaches all 5 aspects + death cinematic + run summary; smoke tests green | D.B0, D.B1, D.B2, D.B3, D.B4 | cc:TODO |

---

## Phase R — Roguelite Restructure (Gold, Cards, Loadout & Abilities)

**This section is authoritative and self-contained.** It supersedes and absorbs the former
exploratory Phases E–I (rename / progression / inventory / Cores) and Phase H (loadout) — those
are now folded in as R1/R7/R8/R5. Full rationale: `docs/Roguelite Restructure — Gold Economy,
Cards & Abilities — Design Plan – 2026-05-22.md` (+ the Run-Meta doc for inventory/Cores detail).
Builds on **shipped** B.S1–S3 (4-slot ability model, Digit1-4 input, HUD bar) + Plan A (elements)
+ Plan C (item tiers, C.I1 shipped).

**MODEL (read once before starting any task):**
- A **run** = one finite **30-wave** attempt (boss every 3rd wave → 10 stages; Plan D). Ends in
  `GAME_COMPLETE` or death. **No mastery** — weapons/abilities are flat, always-viable tools.
- **Four non-overlapping progression lanes:** ① **Gold** — run-gold starts at 0, accrues from
  kills, **banks to account-gold at run end**; account-gold buys permanent **unlocks**; optionally
  spent in-run (opportunity cost). ② **Account level → SP → Stats** (separate system) — permanent
  character stats. ③ **Items + Cores** — persistent gear stash + salvage/craft. ④ **Cards** —
  5/run, relevance-filtered weapon/ability **powerups**.
- **Pre-run flow:** `NEW GAME → ARMORY (buy unlocks w/ gold · equip gear · salvage/craft Cores) →
  LOADOUT (pick 4 primary + 4 power + 4 ability from the unlocked pool) → run`. `CONTINUE` resumes
  mid-run, skipping the screens.
- **Wave clear:** `(card draft, if a card stage) → (Stats menu, if leveled) → next wave`. In-run
  gold spending happens at the card moment.

**FILE MAP:** cards/wave-clear `wave/wave-manager.js` (`openWaveClearPowerupsMenu`,
`openWavePickOverlay`, `#wave-pick-overlay`); new-game/loadout `game-engine.js` (`startNewRun`,
`_rollRandomLoadout`), states `core/constants.js` `GAME_STATES`; loadout/weapons `player.js`
(`activePrimary`/`activePower`/`equippedAbilities`), tabs `ui/ui-manager.js`
(`updatePrimaryTab`/`updatePowerTab`); abilities `combat/weapon-data.js`
(`SKILLS`/`SKILL_UPGRADES`), `player/skills.js`, `ui/radial-menu.js`; shop `shop/shop-manager.js`
(`openShop`,`buyShopItem`,`UPGRADE_COST_MULT`); gold `game.money`, drops
`combat/combat-manager.js` `dropOrbsFromEntity`, `world/gold-*.js`; items `world/item-system.js`
(`createItem`,`scoreItem`,`isUpgrade`), `world/item-names.js` (`RARITY_TIERS`,`ITEM_AFFIX_POOL`),
`player.js` (`equippedItems`,`registerItemDrop`), `ui/inventory-overlay.js`,
`player/progression.js` (`getItemAffixTotal`,`getEffective*`); leveling `player.js`
(`level`/`experience`, inert since 6.0.0).

**EXECUTION ORDER:** R1 → R2 → R8 → R6 → R5 → R3 → R4 → R7 (R6/R7 parallelizable). Follow each
task's Depends. **Versioning:** these are code changes — bump VERSION + CHANGELOG.md per task/phase.

> **✅ Phase R — SHIPPED 6.84.0 → 6.93.0** (full detail + concerns in
> `docs/Roguelite Restructure — Phase R progress report – 2026-05-23.md`):
> - **R1** rename (6.84.0) · **R2.1–3** gold economy + ARMORY + unlocks (6.85.0) ·
>   **R8.1–8** stash + Cores salvage/reroll/tier-up + no-auto-equip + equip screen
>   (6.86–6.88.0) · **R6.1/2** Field Medic + base kit, Tractor cut (6.89.0) ·
>   **R5** LOADOUT screen + chosen 4+4+4 (6.90.0) · **R3.1–3** card draft (6.91.0) ·
>   **R4** card-moment gold sinks — reroll/repair/6th-7th card/Revive (6.92.0+6.94.0) ·
>   **R7.1–3** leveling→SP→Stats validated + auto-open fixed (6.93.0) ·
>   post-card shop retired (6.92.0).
> - The full loop is playable: TITLE → ARMORY → LOADOUT → run (cards + sinks) →
>   bank gold + loot. 593 unit + QA 08–11 green. **R1–R8 essentially complete.**
> - **DEFERRED / remaining:** **R6.3** (~14 new abilities — biggest chunk) ·
>   **R2.4-full** mid-wave gold UPGRADES shop removal + **R7.4** gold PASSIVE tab
>   removal (would churn 07-weapons shop tests) · **R8.7/R8.9** blocked on Phase C
>   (C.I2 / C.I3) · **R-BAL** balance pass + AI-survival run on a meta account.

### R1 — Terminology: Skills → Abilities  *(do first; ~15 files)*

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R1.1 | Data + exports (`combat/weapon-data.js`, `defense-data.js`): `SKILLS`→`ABILITIES`, retire `DEFENSE_SKILLS` alias; `SKILL_UPGRADES`→`ABILITY_UPGRADES` | Build green; new exports used; old aliases removed | - | cc:TODO |
| R1.2 | Player props/functions (`player.js`, `player/skills.js`→`abilities.js`): `equippedSkills`→`equippedAbilities`, `skillCooldowns(Max)`→`abilityCooldowns(Max)`, `activeSkillEffects`→`activeAbilityEffects`, `activeSkill`→`activeAbility`, `equip/activate/cycleSkill`→`…Ability` | No dangling `skill` refs in player/combat; unit + QA green | R1.1 | cc:TODO |
| R1.3 | UI/labels/CSS: radial (`ui/radial-menu.js`) `type:'skill'`→`'ability'`; tutorial/control labels (`ui/static-dom.js`); CSS `[data-tab="skills"]`/`[data-tab="SKILLS"]`; gamepad comments; shop-tree labels | Every visible string says "Ability/Abilities"; QA text assertions updated | R1.1 | cc:TODO |
| R1.4 | Sweep: test selectors, README arsenal section, memory note | Full suite green; README uses "Abilities"; no "defense skill" in player-facing text | R1.2, R1.3 | cc:TODO |

### R2 — Gold economy + pre-run flow

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R2.1 | Pre-run meta-flow scaffold: add `GAME_STATES` `ARMORY` + `LOADOUT` (`core/constants.js`); route NEW GAME (`main.js` `launch('new')` / `game-engine.js` `startNewRun`) → Armory → Loadout → run; CONTINUE skips to the resumed run | NEW GAME enters Armory then Loadout before wave 1; CONTINUE resumes mid-run; back/confirm nav works | R1.2 | cc:TODO |
| R2.2 | Two gold pools: run-gold (starts 0, accrues from kills — `game.money`) + persistent **account-gold** (localStorage); run end banks run-gold → account-gold (default: no death forfeit); HUD shows both | Run starts 0 gold; kills add run-gold; run end banks it; account-gold persists + survives reload | R2.1 | cc:TODO |
| R2.3 | Armory unlock store: spend account-gold on permanent weapon/ability **unlocks**; abilities price-gated higher than weapons; **retire `unlockWave`** | Unlocks bought w/ account-gold + persist; abilities cost more; unlockWave gating removed | R2.2 | cc:TODO |
| R2.4 | Retire the gold-purchased **upgrade-tree shop** (`shop/shop-manager.js`) — upgrades become cards (R3); repurpose/remove the Phase-7 skill-tree UI | No in-run purchase of upgrade-tree stacks; old shop UI removed/repurposed; tests updated | R3.1 | cc:TODO |

### R3 — Cards (relevance-filtered powerup draft)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R3.1 | Repurpose card overlay (`wave/wave-manager.js` `openWavePickOverlay`, `#wave-pick-overlay`) → per-run powerup draft; build pool from weapon upgrade types (MULTI/RAPID/PIERCING/BIG/EXPLODE/HOMING/STUN/KNOCK + per-weapon capstones) + ability upgrade pools | Draft offers powerups from a defined pool; selection applies for the run; pool-build unit test | - | cc:TODO |
| R3.2 | Cadence: **5 cards/run**, one every 2 stages (of 10) | Exactly 5 draft moments per full 30-wave run at the right stages; none on the others | R3.1 | cc:TODO |
| R3.3 | Relevance filter + composition: each draft = **2 weapon + 1 ability** card, all filtered to equipped weapons/abilities; never offer an inapplicable card; ability card only if an ability is equipped | Every offered card applies to a loadout item; 2:1 composition; filter unit test | R3.1, R5.1 | cc:TODO |
| R3.4 | Coexist with the SP Stats menu (R7.3) at wave clear: sequence card draft (card stages) then Stats menu (if leveled); no menu stacking / double-open | Both can occur at a stage clear in order; resume works | R3.2, R7.3 | cc:TODO |

### R4 — In-run gold sinks (optional spend)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R4.1 | **6th/7th card** purchase at the card moment: steeply escalating cost, hard cap 7; spend reduces run-gold (→ less banked) | Extra cards buyable at escalating cost; cap 7; spent gold not banked; cost-curve unit test | R3.3, R2.2 | cc:TODO |
| R4.2 | **Paid reroll/banish** of a card offer (modest cost, once per offer) | Reroll/banish consumes run-gold once per offer; new offer respects filter + 2:1 | R3.3 | cc:TODO |
| R4.3 | **Emergency consumables**: Repair Kit (heal, escalating per stage) + Revive Token (very steep, 1/run) | Both buyable with run-gold; revive capped 1/run; costs scale; spent not banked | R2.2 | cc:TODO |

### R5 — Loadout & unlocks  *(folds in former Phase H)*

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R5.1 | Chosen loadout model: 4 primary + 4 power + 4 ability picked at run start from the **unlocked** pool, locked for the run; replace `_rollRandomLoadout` + single `activePrimary`/`activePower`; reuse shipped B.S1 4-slot model for abilities | Carries chosen 4+4+4; locked once run starts; fire paths read active selection per category | R2.3 | cc:TODO |
| R5.2 | Loadout selection screen (pre-run LOADOUT state) from unlocked pool only; **base ability kit** (Phase Dash + Field Medic + Bulwark) available from run one | Player fills 3×4 from unlocked items; base kit present at start; can't pick locked; confirm locks run | R2.1, R5.1, R6.2 | cc:TODO |
| R5.3 | In-run switching among the 4 of each: abilities Digit 1-4 (shipped B.S2); primaries/powers cycle (`[`/`]` or Q/E); gamepad mirror; HUD shows loadout + active (extends shipped B.S3) | Switch active primary/power mid-run; abilities fire per-slot; HUD reflects; gamepad parity; no auto-repeat | R5.1 | cc:TODO |

### R6 — Abilities: unique-verb rule + roster

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R6.1 | Adopt the **"non-redundant verb"** design rule (an ability must do what no card/stat/gear can); audit existing: cut/rework **Tractor Shield**; consolidate the two heals into **Field Medic** (burst heal + status cleanse) | No ability duplicates a card/stat/gear effect; Tractor cut/reworked; single heal ability; tests updated | R1.2 | cc:TODO |
| R6.2 | Base kit: **Phase Dash** (dash+i-frames), **Field Medic** (burst heal + cleanse), **Bulwark** (on-demand invuln window) — all unique verbs, available run one | All three work as unique verbs; present from start | R6.1 | cc:TODO |
| R6.3 | First purchasable ability batch (unique verbs only): Blink, Bullet Time, Stasis Field, Gravity Snare, EMP Pulse, Sentry Drone, Decoy Beacon, Deflector Orbs, Second Wind, Elemental Infusion, Cryo Field, Storm Cell/Pyre Aura, Catalyst, Designator. **Cut as redundant:** Hunter's Mark (homing), Focus Fire (crit), Bloodlust (lifesteal), Last Stand (dmg), Afterburner (speed), Overdrive, Repulsor Nova, Magnetize, Prism Surge | Each kept ability is a non-redundant verb w/ a live consumer; buyable via R2.3; element abilities use Plan A status helpers | R6.1 | cc:TODO |

### R7 — Leveling → SP → Stats  *(separate retained system; folds in former Phase F.P2–P4)*

> Old F.P1 (comment out cards) is **dropped** — cards are kept (R3). Old F.P5/P6 (passive-migration / upgrade-tree reset) are **superseded** by R2/R3 (no gold upgrade trees exist). Passive STATS still live in the SP tree (R7.4).

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R7.1 | Meta account level + XP + SP: reactivate `player.level`/`experience` as a **persistent** system (localStorage); curve so a 30-wave run yields ~2–3 levels (≈ wave 10/20/30); each level = +N SP | XP accrues on wave clear; ~2–3 level-ups per run; level + SP persist; waves→levels unit test | - | cc:TODO |
| R7.2 | Stats allocation menu: SP buys permanent HP/DEF/critChance/critDamage/dodge/speed/regen/vampirism/thorns (via `progression.js` `getEffective*`); pauses while open | Spending SP raises the stat; persists; no overspend; per-stat caps respected | R7.1 | cc:TODO |
| R7.3 | Auto-open Stats menu at wave clear when SP is unspent (sequenced with cards per R3.4) | Leveling → Stats menu auto-pops at that wave's clear; close → next; no double-open | R7.2 | cc:TODO |
| R7.4 | Stat passives are SP-driven only (CRIT, HEALTH/SHIELD, VAMPIRISM, THORNS, DODGE, SPEED) — no gold purchase (gold buys unlocks) | Passives raised only via SP; no gold path; no orphaned refs | R7.2 | cc:TODO |

### R8 — Inventory as meta + Cores  *(folds in former Phases G + I)*

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R8.1 | Persistent item stash (localStorage), separate from in-run state; run-end commits the run's loot to the stash | Items from run N present in stash at start of run N+1; survives reload | R2.1 | cc:TODO |
| R8.2 | Remove auto-equip (`player.js` `registerItemDrop`/`isUpgrade`): in-run loot just accrues (HUD feed = collected-this-run ticker) | Pickup never changes equipped gear mid-run; feed shows collection only | - | cc:TODO |
| R8.3 | Inventory screen (in the Armory): equip ≤1 item per gear slot (5 slots) with live stat deltas; locked at run start | Up to 5 stash items equipped; gear drives `getItemAffixTotal`/`getEffective*`; frozen once run begins | R2.1, R8.1 | cc:TODO |
| R8.4 | Run-end reconciliation: death/clear commits collected loot to stash; GAME_OVER/COMPLETE → title/Armory; no loot lost on death | Loot from a finished run in stash at next NEW GAME, win or lose | R8.1, R8.2 | cc:TODO |
| R8.5 | Cores currency + salvage (`world/item-system.js`): add `cores` to meta save; salvage → Cores scaled by rarity × level × affix/trait count; bulk "salvage all below equipped" | Salvage grants Cores by formula; bulk works; Cores persist; formula unit test | C.I1, R8.3 | cc:TODO |
| R8.6 | Reroll affixes within tier bounds for Cores (`ITEM_AFFIX_POOL`) | Reroll consumes Cores, produces in-bounds affixes; cost + bound unit test | R8.5 | cc:TODO |
| R8.7 | Resist targeting: add/swap an elemental resist (A.E7 / C.I2) for Cores; tier caps respected | Chosen resist appears/changes; tier-gated count enforced | R8.5, C.I2 | cc:TODO |
| R8.8 | Tier-up one rarity tier (8-tier ladder C.I1) for Cores, rolling the added slot; cost scales w/ target tier | Tier-up raises rarity + adds the tier's slot; cost-curve unit test | R8.5, C.I1 | cc:TODO |
| R8.9 | Trait reroll (C.I3*) + traited-item salvage value for Cores | Trait reroll works; traited items yield Cores per defined rule; consistent w/ C.I4 | R8.5, C.I3a | cc:TODO |

### R-BAL — Balance (cross-cutting, ongoing)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R.BAL1 | Tune difficulty around permanent meta power (SP stats + gear + unlocks) since weapons are flat (no mastery); co-tune enemy/boss scaling with Plan A.E8*/Plan D | Early runs non-trivial, late runs winnable; AI survival run green on a meta-progressed account | R5, R6, R7, R8 | cc:TODO |

---

## Phase W — Weapon Attunements, Mechanic Mods & Efficacy Cards  *(2026-05-23 · ACTIVE)*

Source: `docs/Weapon Element Identity & Meta-Progression — Design Plan – 2026-05-23.md`.
**Supersedes** the weapon-card parts of R2.4 / R3 / R4 (card composition becomes 1 primary + 1 power + 2 ability; per-weapon upgrades split into upfront **Attunements** + **Mechanic Mods** vs in-run **Efficacy Cards**).

**Vocabulary (locked):** **Attunements** = per-weapon element upgrades (stackable; *damage divides evenly per active element* — focus vs coverage). **Mechanic Mods** = element-agnostic behavior upgrades (pierce/explode/home/stun/knock + weapon capstones). **Efficacy Cards** = in-run draftable amplifiers (no elements, no new mechanics). **Cores** = untouched gear-salvage currency. Base weapons are element-agnostic (KINETIC); everything build-defining is chosen UPFRONT; all unlocks permanent (account-gold, dialed up).

### W0 — Unified pre-run BUILD screen (tabbed bubble UI)
- [x] Route `openArmory()` → bubble tree in pre-run BUILD mode (flat `ArmoryOverlay` open commented out, code kept)
- [x] Parent weapon/ability bubbles = EQUIP toggles (≤4/cat, ✓ badge, locked dimming); BUILD footer (BACK · status · START RUN); account-gold header
- [x] **GEAR tab** in the tree: review + manage gear (equip/unequip, salvage, reroll, tier-up) by factoring `ArmoryOverlay` gear panels into `renderGearInto(container)`
- [x] GEAR tab visible only in BUILD mode; hidden in the in-run shop
- [x] Locked parent bubble click → unlock with account-gold (`unlockPreRunItem`) + auto-equip (closes the unlock-access gap; partial W5)
- [x] CSS polish: selected/locked node states, GEAR layout, footer, tabs
- [x] Update QA `08-armory`, `09-loadout`, `12-abilities` (+ `02-start`, `07-weapons`) to the new BUILD-tree flow — full unit (625) + QA suites green
- [x] VERSION (6.103.0) + CHANGELOG + README (pre-run flow now `NEW GAME → BUILD tree → run`) · commit

**W0 DONE (6.103.0).** Pre-run is a tabbed bubble BUILD screen (gear + weapon/ability selection + unlock). Next: W1 (Attunement data model).

### W1 — Attunement data model  ✅ DONE (6.104.0)
- [x] `ATTUNEMENTS` table (`{id,name,element,weapon,description,behavior,cost}`) + per-weapon lists (design §5/§7) — ~93 attunements; `getAttunementsForWeapon`, `attunementElements`
- [x] Multi-element bullet stamping: `bullet.elements[]` (KINETIC when empty); `bullet.element` = `elements[0]`
- [x] Damage-split: averaged resist multiplier (`multiElementMultiplier`) applied once in `applyDamageToEnemy`; each active element applies its signature status (scaled by share)
- [x] Override priority (`weapons.js`): ELEMENTAL_INFUSION / Overdrive > equipped attunements > base element (KINETIC) — via `resolveBulletElements`
- [x] Unit tests (18): split math, element priority, table integrity, damage split through `applyDamageToEnemy` — 643 unit green · commit
- Note: behavior-preserving for current weapons (single base element). `player.activeAttunements` map init'd; populated from loadout in W5.

### W2 — Attunement behaviors (per element batch)  ✅ DONE (6.106.0–6.111.0)
- [x] PYRO (fire SPREAD — burn jumps to nearby enemies on a follow-up hit; oil ignition already live via W1 flare) + 3 tests · commit (6.106.0)
- [x] CRYO (sustained cold — a soft hit on an already-chilled enemy escalates to FREEZE; hard hit freezes outright; shatter via existing reaction) + 3 tests · commit (6.107.0)
- [x] VOLT (chain FORK — every hit arcs reduced Volt damage + conduct to the nearest enemy; lethal fork runs the full kill pipeline; one hop) + 4 tests · commit (6.108.0)
- [x] TOXIC (corrosion PLAGUE — a follow-up hit on a corroded enemy spreads corrode to nearby; base corrode+bleed via W1) + 3 tests · commit (6.109.0)
- [x] VOID (gravity GATHER — a follow-up hit on a marked enemy tugs nearby enemies toward it; base mark via W1; also deepens Gravity Lance) + 3 tests · commit (6.110.0)
- [x] RADIANT (PURGE — hits bypass flat armor + SENTINEL frontal shield; empowers Lance/Prism vs armor) + 3 tests · commit (6.111.0)

### W3 — Mechanic Mods (reclassify + per-weapon)  ✅ DONE (6.112.0)
- [x] Classification: `isMechanicMod` (pierce/explode/home/stun/knock suffixes + capstone set) + `getMechanicMods` / `getEfficacyUpgrades` per weapon. Inert groundwork; 6 tests pin the split (668 unit). · commit (6.112.0)
- [ ] Per-weapon mod NODES in the BUILD tree (W5) + removal from the card pool (W4) consume this classification.

### W4 — Efficacy Cards + recomposition  ✅ DONE (6.114.0)
- [x] Cards are efficacy-only — mechanic mods excluded via the W3 `isMechanicMod` classification (they're upfront now); reuses the existing per-weapon upgrade tables as the amplifier pool
- [x] `card-draft.js` → **1 primary + 1 power + 2 ability** with backfill (`primaryCards`/`powerCards` split; `weaponCards` back-compat); unit tests rewritten (670 unit) · commit (6.114.0)
- [ ] *Deferred to W7:* new conditional/handling efficacy cards (design §6 B/C — Executioner, Point-Blank, Hot Loads…) + a tighter per-weapon `cardPool` curation matrix (Lance Beam no Rapid/Multishot). Current pool = the existing amplifier upgrades, which already curate per weapon.

### W5 — BUILD tree: attunement/mod nodes + LOADOUT toggles  ✅ DONE (6.105.0 + 6.113.0)
- [x] Orbit nodes render **attunements** (account-gold unlock + active toggle) → `player.activeAttunements` on START RUN — element-colored bubbles, ✓ badge; in-run shop unchanged · 6.105.0
- [x] Orbit nodes render **mechanic mods** (account-gold unlock + active toggle) → granted as powerup stacks at run start via `player.addPowerup`; `mods` unlock category; ring radius scales for the combined ring · 6.113.0
- [x] Selection/toggle happens directly in the BUILD tree (no separate LOADOUT screen needed); `beginPreRunFromTree` carries `loadout.attunements` + `loadout.mods`, both validated vs owned/known
- Note: finer ring layout (two rings / grouping) is a W7 polish item.

### W6 — Ability attunements  (decisions locked — design doc §15)
- [ ] `abilityAttunements` data: ONE element per ability (not stacking); element-agnostic base; per-ability element options (design §15.1) · tests
- [ ] `player.activeAbilityAttune[abilityId] = elementId`; applied on activate (`player/abilities.js`) — element status through the ability's verb
- [ ] BUILD tree DEFENSE cluster: ability-attunement nodes (unlock + one-active toggle), `abilityAttunements` unlock category · commit

### W7 — Economy + balance + polish  🟡 PARTIAL
- [x] Dial up unlock costs: primary 8k / power 10k / ability 12k / attunement 7k / mod 5k · commit (6.114.1)
- [x] README sweep — attunement/mod/efficacy-card system documented · commit (docs)
- [ ] **Enemy weakness telegraph** — element-colored **pip** above enemies with `resist ≤ −0.3` (distinct from body tint) + **damage-number effectiveness cue** (weakness = big/bright/element-colored + spark; resisted = small/grey)
- [ ] **Global efficacy cards (5th draft slot)** — §6 group B (conditional dmg) + C (handling/tradeoff) as GLOBAL powerups; `card-draft.js` → **1 primary + 1 power + 1 global + 2 ability**; damage-path consumers (Executioner already wired) · tests
- [ ] **Per-item unlock cost** refactor (flat, no signature/exotic; lets outliers like Spectrum Split price higher)
- [ ] Per-attunement VFX + tooltips
- [ ] **gold → Cores exchange** (W8 bridge sink; reroll/tier-up cost already scales with rarity × level)

### W8 — Endgame: Mastery + Ascension treadmill  (design doc §15.4)
- [ ] **Mastery tracks** — infinite per-item (weapon/attunement/mod/ability/ability-attunement) levels, exorbitant+exponential gold cost, small diminishing power; focused mastery = build identity
- [ ] **Ascension** — escalating endless difficulty after first clear: enemy HP/dmg/density + rising resistances; higher item-level gear drops + more gold
- [ ] **gold → Cores** sink + crafting costs scaling with rarity × item level (heavy top-end sink)
- [ ] Balance: ascension slightly outpaces *affordable* mastery (synergy/coverage/gear > brute grind); the weakness telegraph becomes the endgame skill layer

### Resolved (design doc §15)
- Draft = 1 primary + 1 power + 1 global + 2 ability · Ability attunements one-at-a-time · Flat per-item cost · Telegraph = pip + hit cue
- OQ-A slot budget: damage-split + cost are the limiters (no hard cap for now); OQ-B: even `dmg/N` (chosen)
