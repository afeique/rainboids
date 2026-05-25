# Rainboids — Implementation Plan (consolidated dispatch board)

作成: 2026-05-22 · **consolidated 2026-05-24** — single source of truth for **all open work**, ordered for execution and broken into **small, per-file, parallel-dispatchable tasks**. Shipped history → `CHANGELOG.md`.

## Labeling strategy (replaces the A–X phase letters — we ran out of alphabet)
Tasks are `**DOMAIN-NN**`. **Domains** (not letters) group work; numbers are unique within a domain and never run out. Old phase IDs kept in *(parens)* for traceability.
- **BOSS** — 10 unique bosses + chassis *(old Phase D)*
- **ENMY** — enemy enabling systems + remaining types + uniqueness *(old A.E8/E9/E10)*
- **SKILL** — ability loadout *(old Phase B)* · **ITEM** — item traits *(old Phase C)*
- **META** — run-meta + economy remaining *(old Phase R remainder + W7/W8)*
- **RUN** — run configurator + adaptive difficulty + wave composer *(old Phase X)*
- **UI** — pre-run BUILD polish *(old Phase U)*
- **CD** — combat-depth "no-downsides" expansion *(new 2026-05-24 design)*

## Dispatch rules (for the implementation loop)
- **One owner per file.** Tasks list **FILES** owned; never run two agents on the same file. `∥group` = tasks safe to dispatch together (disjoint files).
- **Subagents never run git.** They implement + write tests; the orchestrator verifies, bumps VERSION/CHANGELOG, and commits per task (CLAUDE.md granularity).
- **Each task ships its own QA/unit test** (DoD includes a test).
- ⚠ **Shared hubs** (`enemy.js`, `collision-system.js`, `weapon-data.js`, `wave-*.js`): serialize edits or split into per-entity/per-feature modules.

## EXECUTION ORDER (top = first; finish in-flight work before new work)
1. **BOSS** (chassis → 10 bosses) — *already underway; finish first.*
2. **ENMY** (enabling systems → types → uniqueness)
3. **SKILL · ITEM** (small remainders)
4. **META** (economy/meta remainders)
5. **RUN** (run config + adaptive director + composer)
6. **UI** (BUILD polish)
7. **CD** (combat-depth expansion — last)

Source design docs in `docs/`: the 05-22 Plan A–D + Uniqueness, 05-23 Weapon-Element + Phase-R report, and the **05-24 trio** (Energy&Health · Ability Attunements · Balance Model) + the **05-24 Combat-Depth Implementation Plan** (the CD detail).

---

# 1. BOSS — bosses (finish first)
Chassis pure-cores SHIPPED (`boss-phases.js` 6.159.0 · `boss-parts.js` 6.160.0 · `boss-intro.js` 6.161.0). Remaining chassis + the 10 bosses below.

### Chassis remainder *(old D.B0)* — do before any boss
| ID | FILES (owned) | DOES | DEPENDS | ∥group | Status |
|----|----|----|----|----|----|
| ~~BOSS-01~~ | `js/modules/hud/boss-healthbar.js` + hook in `hud/status.js` | Boss healthbar (name·segmented-HP·phase-pips·element tint) + pure layout helper + 13 unit tests | boss-phases | A | ✅ 6.162.0 |
| ~~BOSS-02~~ | `js/modules/combat/collision-system.js` | ✅ **6.168.0** — weak-point hit-routing (`routeBulletToBossPart`): bullets hitting a live part damage it w/ element/resist; core invuln while shielding parts live | boss-parts | — | ✅ 6.168.0 |
| ~~BOSS-03~~ | NEW `js/modules/enemy/boss-fx.js` + hook in `hud/status.js` | ✅ **6.167.0** — name-card sweep, death detonation, camera-shake (pure helpers + 19 tests). NOTE: camera-shake offset exposed but not yet summed into the engine shake loop → finish in BOSS-04 | boss-intro | A | ✅ 6.167.0 |
| ~~BOSS-04~~ | `enemy/bosses/index.js` + `enemy/boss-render.js` + `wave-manager.js` + `enemy.js` + `combat-manager.js` + `game-engine.js` | ✅ **6.168.0** — registry + per-stage spawn (additive/gated), generic boss renderer, descriptor driver in the enemy update loop, final-boss→GAME_COMPLETE, camera-shake summed in, `spawnBoss` debug hook | BOSS-01/02/03 | — | ✅ 6.168.0 |

### The 10 bosses — each its own file ⇒ **fully parallel** *(old D.B1–D.B5)*
All depend on BOSS-04 + chassis. Each: a phase-script (uses `boss-phases.js`) + weak-point parts (uses `boss-parts.js`) + element. DoD per boss: spawns w/ name-card + healthbar, weak-point/armor gating works, enrage fires, killable 45–120s, **boss smoke test green**.
| ID | FILE (owned) `js/modules/enemy/bosses/…` | Boss | ∥group |
|----|----|----|----|
| ~~BOSS-05~~ | `harbinger.js` | ✅ **6.163.0** — THE HARBINGER (1-3, Kinetic — rotating bolt-head weak-points); established the `enemy/bosses/` descriptor pattern + chassis-API usage for BOSS-06..14 | B |
| ~~BOSS-06~~ | `aegis.js` | ✅ **6.164.0** — THE AEGIS (2-6, armor — rotating plate-gap, CORRODE-bypass, plate-shed) | B |
| ~~BOSS-07~~ | `lumen.js` | ✅ **6.164.0** — LUMEN THE PRISM SOVEREIGN (3-9, Radiant — shield drones, DISJUNCTION) | B |
| ~~BOSS-08~~ | `gemini.js` | ✅ **6.166.0** — GEMINI (4-12, Pyro+Cryo twins — opposite resists, tether, partner-enrage) | B |
| ~~BOSS-09~~ | `maelstrom.js` | ✅ **6.164.0** — MAELSTROM THE STORM CROWN (5-15, Volt — conduit nodes, CONDUCT rain) | B |
| ~~BOSS-10~~ | `hivemother.js` | ✅ **6.165.0** — THE HIVEMOTHER (6-18, Toxic — egg-sac spawns, CORRODE clouds) | B |
| ~~BOSS-11~~ | `iron-throne.js` | ✅ **6.165.0** — THE IRON THRONE (7-21, 4 per-element turrets, core-invuln-while-turrets-live) | B |
| ~~BOSS-12~~ | `warden-prime.js` | ✅ **6.166.0** — THE WARDEN PRIME (8-24, adaptive resist wall, ADAPTIVE PURGE) | B |
| ~~BOSS-13~~ | `nullmaw.js` | ✅ **6.165.0** — NULLMAW THE DEVOURER (9-27, Void — pull, projectile-eat cone, IMPLOSION) | B |
| ~~BOSS-14~~ | `prismarch.js` | ✅ **6.166.0** (module) — THE PRISMARCH / OMEGA (10-30, all 7 — 5-aspect gauntlet; `isFinalBoss` flag set). NOTE: run-complete + death cinematic + run summary wiring → BOSS-04 | B |
| ~~BOSS-15~~ | `tests/qa/17-bosses.spec.js` | ✅ **6.168.0** — 7 smoke tests: spawn, healthbar, core-invuln gating, killable, no fatal errors, final-boss→GAME_COMPLETE | done | ✅ |
| | | **🎉 BOSS TRACK COMPLETE** — all 10 bosses spawn, render, fight, and die in-game. (Optional follow-ups: per-boss attack-pattern bullet wiring + tuning live in RUN-07.) | | |

---

# 2. ENMY — enemy enabling systems + types + uniqueness *(old A.E8/E9/E10)*
⚠ Many attach to enemy entities — prefer **new per-mechanic helper modules** (parallel) over editing `enemy.js` directly; serialize any `enemy.js`/`collision-system.js` edits.
| ID | FILES (owned) | DOES *(old)* | DEPENDS | ∥group |
|----|----|----|----|----|
| ~~ENMY-01~~ | `js/modules/enemy/telegraph.js` + test | ✅ **6.169.0** — wind-up→strike→recover state machine (create/start/tick/phase/isStriking/progress); 15 tests | D |
| ~~ENMY-02~~ | `js/modules/enemy/abilities/projectile-absorb.js` + test | ✅ **6.169.0** — maw-cone eats bullets→capped shield; beams/melee bypass; 39 tests | D |
| ~~ENMY-03~~ | `…/cloak.js` + test | ✅ **6.169.0** — visible↔cloak cycle + fade; de-target unless MARK/AoE reveal; 21 tests | D |
| ~~ENMY-04~~ | `…/reflect.js` + test | ✅ **6.169.0** — front-arc reflects player bullets→enemy bullets; beams/melee/reflected bypass; 28 tests | D |
| ~~ENMY-05~~ | `…/buff-strip.js` + test | ✅ **6.170.0** — Leech contact strips a random player powerup + suppresses re-grant; injectable RNG; 24 tests | D |
| ~~ENMY-06~~ | `…/suppress-aura.js` + test | ✅ **6.170.0** — Null Drone aura stalls cooldown regen / blocks activation (linger-stamped, player-facing mirror of SYS-7); 26 tests | D |
| ~~ENMY-07~~ | `…/blink-burrow.js` + test | ✅ **6.170.0** — periodic teleport/burrow composing the ENMY-01 telegraph; relocate-on-strike, frozen-blocks, vanish-mid-blink; 25 tests | D |
| ENMY-08 | `enemy/enemy-data.js` + AI | Conduit Node (Volt support) *(A.E8c)* | ENMY-S7(shipped) | — (serialize w/ 09/10) |
| ENMY-09 | `enemy/enemy-data.js` + AI | Batch-4 types: Devourer/Phantom/Prism-Mirror/Beacon *(A.E8d)* | ENMY-02/03/04 | 🟡 **PARTIAL 6.180.0** — **PHANTOM** shipped: cloak helper wired LIVE (tick/draw-fade/de-target in homing+auto-aim, gated on `enemy.cloak`, default-safe) + MARK-reveal fix + `spawnPhantom` debug hook. **TODO:** Devourer(ENMY-02)/Prism-Mirror(ENMY-04)/Beacon + add all to WAVE_DATA roster |
| ENMY-10 | `enemy/enemy-data.js` + AI | Batch-5: Leech/Null-Drone/Juggernaut/Thornback/Wraithworm + artillery *(A.E8e)* | ENMY-01/05/06/07 | 🟡 **PARTIAL 6.181.0** — **WRAITHWORM** shipped: blink-burrow helper wired LIVE (tick-after-movement relocate-on-strike, windup telegraph tell, skip-render+de-target while vanished, gated on `enemy.blink`, default-safe) — composes telegraph (ENMY-01 also live now) + CHILL/FREEZE→`_frozenUntil` mirror blocks blink + `spawnWraithworm` debug hook. **TODO:** Leech(ENMY-05)/Null-Drone(ENMY-06)/Juggernaut/Thornback + artillery + add all to WAVE_DATA roster |
| ENMY-11 | per-type AI modules | Distinct behaviors for the 10 new types *(A.E10-U2)* | ENMY-08/09/10 | — |
| ENMY-12 | per-type AI modules | Deferred flourishes (Glacier shatter, TANGERINE oil, TITAN demote, …) *(A.E10-U3)* | ENMY-07/01 | — |

---

# 3. SKILL · ITEM *(old Phase B/C remainders)*
| ID | FILES (owned) | DOES | DEPENDS | Note |
|----|----|----|----|----|
| SKILL-01 | `js/modules/ui/` loadout-assign UI | Assign any owned ability → slots 1-4 *(B.S4)* | — | |
| ~~SKILL-02~~ | — | *(B.S5 new-skills batch)* | — | **SUPERSEDED** — its skills (Bloodlust/Designator/Blink/Gravity-Snare/Elemental-Infusion) are shipped or now in **CD** (Attune/new abilities). Dropped. |
| ~~ITEM-01~~ | `world/item-system.js` + `ui/inventory-overlay.js` | ✅ **6.178.0** — tier-gated resist counts (common 0 / rare ≤1 / epic ≤2 / godlike+ ≤3 via `maxResistAffixes`+`isResistAffix` in `rollAffixSet`, total count preserved) + grouped element-tinted RESIST readout on item cards. 13 unit + 3 QA | — | **unblocks META-03** |

---

# 4. META — run-meta + economy remainders *(old Phase R remainder + W7/W8)*
| ID | FILES (owned) | DOES *(old)* | DEPENDS |
|----|----|----|----|
| META-01 | `js/modules/shop/shop-manager.js` (+ HUD shop button) | Remove the mid-wave gold UPGRADES shop entirely (upgrades are cards now) *(R2.4-full)*; rework `07-weapons` shop tests | — |
| META-02 | `shop/*` PASSIVE-tab path | Stat passives SP-only — remove the gold PASSIVE-tab path *(R7.4)* | — |
| ~~META-03~~ | `world/cores.js` + `item-system.js` + ARMORY | ✅ **6.179.0** — Cores resist targeting: `applyResistTarget(item,element)` ADD(under cap)/SWAP(at cap), rejects tier-locked/duplicate/invalid; `resistTargetCost`; ARMORY TARGET RESIST row w/ 6-element picker + cap readout. 11 unit + 3 QA | ITEM-01 ✅ |
| META-04 | `world/item-system.js` + ARMORY | Trait reroll (gear passive-affix) + traited-item salvage value *(R8.9)* | — |
| META-05 | `combat/card-draft.js` + `weapon-data.js` + ARMORY | W7: **global efficacy card = 5th draft slot** (1 primary+1 power+1 global+2 ability); flat per-item unlock cost; per-attunement VFX/tooltips; gold→Cores exchange | CD-01 (data) |
| META-06 | `world/` mastery system + `cores.js` | W8: per-item Mastery tracks (infinite, exponential gold, diminishing power) + gold→Cores sink | META-05 |
| ~~META-07~~ | — | *(R-BAL1)* | **FOLDED into RUN-07** (single balance pass over meta power + adaptive director) |

---

# 5. RUN — Run Configurator + Adaptive Difficulty + Wave Composer *(old Phase X; round-4 §12)*
**Difficulty is AUTO-TUNED, not player-chosen.** Player picks run **length** (stages 10–100) + **waves/stage** (3/6/9). `runConfig={stages,wavesPerStage}` (no difficulty field). Replaces `MAX_WAVES=30`.
| ID | FILES (owned) | DOES *(old X)* | DEPENDS | ∥ |
|----|----|----|----|----|
| RUN-01a | `core/constants.js` + `wave/*` + `game-engine.js` | ✅ **6.173.0** — `runConfig {stages,wavesPerStage}` on game+save (default 10×3, behavior-preserving); accessors `getRunConfig`/`runMaxWaves`/`runWavesPerStage`; MAX_WAVES reads replaced (run-complete + scaling-curve maxWaves + runConfig-aware `isBossWave`/stage-helpers); persisted+restored. 28 unit tests | — | — (hub) |
| RUN-01b | `combat/card-draft.js` + `wave-manager.js` | ✅ **6.174.0** — **card every stage EXCEPT last** (cards=stages−1, runConfig-aware): `isCardStage(wave,game)` + `cardsPerRun(game)`; default 10×3 → 9 cards (waves 3..27, not 30). Updated card-draft unit + cards QA. *(X1 cont.)* | RUN-01a | — |
| ENMY-ELITE | NEW elite-variant mechanic (deferred from RUN-01b) | ⏳ **elite=other mult-of-3** injection — needs a net-new elite enemy-variant system (stat bump + visual tag); fold into RUN-05 composer or do as its own ENMY task | RUN-01a | — |
| RUN-02 | `combat/card-draft.js` | Card-pool layering: efficacy→economy fallback; `CARDS_PER_RUN=stages−1`(done in 01b) *(X2)* | RUN-01 | — | ⚠ DESIGN-GAP: "economy" upgrade pool (old MEDPACK/PAYDAY) was removed from constants.js — clarify economy-card source before building. buildDraft call sites in wave-manager (keep wiring inside card-draft.js to stay disjoint) |
| ~~RUN-03~~ | NEW `world/reward-dial.js` + `wave-manager.js` + `combat-manager.js` + `world/cores.js` | ✅ **6.175.0** — Reward Dial: waves/stage mult (×1.0/1.3/1.6) + stage-depth endurance curve (≈1.0→+40%) on gold/drop/rarity/Cores. `rewardMultiplier()`=**exactly 1.0 on default 3-wps run** (opt-in, lights up with RUN-06). 18 unit tests | RUN-01 | E |
| ~~**RUN-04**~~ | `js/modules/wave/difficulty-director.js` + `tests/unit/difficulty-director.test.js` | ✅ **6.171.0** — **Adaptive Difficulty Director**: composite Po/Pd (EMA α0.4), D_hp∈[0.6,3.0]/D_thr∈[0.6,1.8], ±12% deadband + ≤12%/wave, cold-start, cross-term gate, mercy + escalation bands, `getThreatLevel()` 1–5, `lockForBoss()`. Pure, 26 tests. API: createDirector/recordWave/updateDifficulty/tickWave/getDifficulty/getThreatLevel/lockForBoss | — | E (new file) |
| RUN-05a | `game-engine.js` + `wave-manager.js` + `player/lifecycle.js` | ✅ **6.177.0** — **director LIVE**: instantiate on `game.difficultyDirector`; D_hp→enemy HP (`applyEnemyLevelScaling`), D_thr→incoming dmg (`takeDamage`, pre-cap, top-level only); fed at wave clear (`tickWave`, baselines: target 35s/HP-ret 0.6). Threat HUD now lit live. Default/cold-start safe. 7 unit + 5 QA | RUN-04, RUN-01 | — |
| RUN-05b | NEW `wave/wave-composer.js` + `wave-manager.js` | ⏳ **DEFERRED** — procedural wave composer: director threat-budget→randomized roster + themes + telegraphed modifiers; **D_hp→spawn COUNT** + elite injection (ENMY-ELITE) drawn from budget; replaces static `WAVE_DATA[1..30]`. High-risk — needs RUN-07 balance. *(X5)* | RUN-05a | — |
| ~~RUN-06~~ | `static-dom.js` + `shop/shop-dom.js` + `game-engine.js` + `css` | ✅ **6.176.0** — RUN SETUP in BUILD footer: waves/stage 3/6/9 + stages 10–100 stepper + live readout (total waves + reward ×); START threads `runConfig` (persisted on loadout, clamped+applied in init); `peakThreatReached` localStorage scaffolding. Default untouched = 10×3. 13 unit + 7 QA | RUN-01, RUN-03 | — |
| RUN-07 | tuning (`wave-data.js` + director bounds) | Balance pass *(X7 + R-BAL1)*: AI-survival on 10×3 + 100×9 on a meta account; tune target band + baseline + reward + enemy HP curve | RUN-04/05, everything live | — (last) |

---

# 6. UI — pre-run BUILD polish *(old Phase U remainder)*
| ID | FILES (owned) | DOES *(old U)* | DEPENDS |
|----|----|----|----|
| UI-01 | `css/styles.css` + `shop/shop-dom.js` | Polish: spacing/contrast/responsive, bubble hover/active, tooltip completeness, mobile, pre-run legend states *(U4)* | — |
| UI-02 | `tests/qa/07-weapons.spec.js` + new BUILD-flow spec | QA: open→review each tab→select loadout→START; pre-run seeding round-trips *(U5)* | UI-01 |
| *(U6 → RUN-06)* | | | |

---

# 7. CD — Combat-Depth "no-downsides" expansion *(NEW 2026-05-24 — implement LAST)*
Full detail in `docs/Combat Depth — Implementation Plan (consolidated) – 2026-05-24.md` (governing contract, refinements R-THORNS/R-THREATUI/R-SYNERGY/R-KEYSTONE/R-CAP/R-POWERPIPE/R-SPARK/R-OVERCLOCK/R-INCOMBAT-REGEN/R-MERCY-FEEL/R-MOBILE) + the three 05-24 design docs. **Governing contract: no downsides; depth via equip-economy + synergy; difficulty via RUN-04 director + enemy scaling; stats=flat baseline, powerups=conditional synergy.**

### CD Phase 0 — foundation data *(fully parallel — disjoint files; ∥group F)*
| ID | FILES (owned) | DOES |
|----|----|----|
| CD-01 | `combat/weapon-data.js` (+`defense-data.js`) | STATS: add Capacitor/Reactor/Efficiency/Regeneration (Balance §10); bump CritDmg +20%, Health +40; Thorns→30%+status flag (R-THORNS). ABILITIES: collapse 4 fields→**FIELD_PROJECTOR**, ELEMENTAL_INFUSION→**Attune**, add Overcharge-Core/Nanite-Swarm/Decoy, keep Sentry(6). ABILITY_ATTUNEMENTS + ABILITY_UPGRADES: fill BLINK/SNARE/DESIGNATOR/SECOND_WIND/FIELD_PROJECTOR rings (Abilities §2/§5). Remove all downside fields |
| CD-02 | `combat/passive-data.js` | Remove ALL downside clauses (re-anchor per Balance §6c); merge GLASS_CANNON+BERSERKERS → free a slot → add **R-KEYSTONE** (Apex Predator); add Bloodshield/Bloodlust/Sanguine/Hemoglutton/Overclock/Capacitor-Bank; rework OVERFLOW_CAPACITOR(pure)/OVERFLOW_SPARK(→powers, R-SPARK); add `synergies:[ids]` (R-SYNERGY) + icons |
| CD-03 | `world/item-names.js` | Affixes: maxEnergy/energyRegen/energyCost/lifeOnKill/overheal + score weights |
| CD-04 | `world/powerup.js` | Reflavor dupes (Vampirism→Bloodshield, Health→Reinforced Hull, Toughness→Ablative Plating); add Flux/Overflow-Discharge/Resonant-Surge/Surge-Battery/Regenerator(in-combat, R-INCOMBAT-REGEN); remove downsides; consolidate the 7 heal-drop micro-mods→1–2 (R7); `synergies` |
| CD-05 | `core/constants.js` | R-CAP: centralize caps (toughness 75 · dodge 50 · energy-cost-reduction 50 · regen 3/5 · Bloodshield 35% · per-hit 45%) |

### CD Phase 1 — player mechanics *(CD-06 first; then ∥group G)*
| ID | FILES (owned) | DOES | DEPENDS |
|----|----|----|----|
| CD-06 | `player/player.js` | getEffectiveMaxEnergy/EnergyRegen/PowerCost (energy stats+affixes+OVERFLOW, −50% cap); Bloodshield buffer (accumulate/decay/soak); Bloodlust stacks; Regeneration into regen path | CD-01/02/05 |
| CD-07 | `player/weapons.js` | **R-POWERPIPE**: route power-weapon damage through the player damage/crit pipeline; apply Efficiency+cap; Overclock cooldown-mode | CD-06 |
| CD-08 | `player/progression.js` | getEffectiveRegen += Regeneration; cap→5 w/ Regenerator; energy tick uses getEffectiveEnergyRegen | CD-06 |
| CD-09 | `player/lifecycle.js` | takeDamage: Bloodshield soak-first; global per-hit cap 45% (generalize FAILSAFE, R-CAP); remove HOARDERS/FRENZY taxes; Thorns reflect+status (R-THORNS) | CD-06 |
| CD-10 ⚠ | `combat/collision-system.js` | applyDamageToEnemy: Bloodlust mult, Hemoglutton, Sanguine on-kill, lifesteal→Bloodshield feed, Designator mark crit/detonate, Sentry targeting, Retribution-Field nova (R-THORNS). ⚠ serialize w/ BOSS-02 | CD-06; BOSS-02 done |

### CD Phase 2 — abilities *(∥group H)*
| ID | FILES (owned) | DOES | DEPENDS |
|----|----|----|----|
| CD-11 | `player/abilities.js` | Effects: FIELD_PROJECTOR per-element, Attune, Sentry retune+targeting, Designator/Second-Wind reworks, Overcharge-Core/Nanite-Swarm/Decoy (Abilities §5) | CD-01/06 |
| CD-12 | `shop/shop-dom.js` | Route ABILITY_UPGRADES into the DEFENSE ring (empty-ring fix) + synergy tooltips (R-SYNERGY) | CD-01/02/04 |
| CD-13 | `ui/radial-menu.js` | Sentry radial = unlocked attunements; selection → retune | CD-11 |

### CD Phase 3 — surfacing *(∥group I)*
| ID | FILES (owned) | DOES | DEPENDS |
|----|----|----|----|
| CD-14 | `ui/sp-allocation.js` | Surface Capacitor/Reactor/Efficiency/Regeneration in SP grid | CD-01 |
| CD-15 | `ui/icons.js` | Icons for new stats/abilities/passives | — |
| ~~CD-16~~ | `js/modules/hud/threat-level.js` + `hud/status.js` hook | ✅ **6.172.0** — **R-THREATUI**: 5-chevron cool→hot threat meter (top-center) + THREAT ↑/↓ toast/pulse; pure layout/anim core; defensive hook reads `getThreatLevel()` (or `_debugThreatLevel` test seam), no-ops until director wired live (RUN-01/05). 25 unit + 4 QA tests | RUN-04 |

### CD Phase 4 — balance/telemetry *(last; merges into RUN-07)*
| ID | FILES (owned) | DOES |
|----|----|----|
| CD-17 | `tools/` fun-score telemetry | Log Po/Pd/D + per-wave outcomes |
| CD-18 | tuning | (folds into RUN-07 balance pass — AI-playtest the 4 extreme build profiles, Balance §9/§10) |

---

## Testing / acceptance (cross-cutting)
- Unit: STATS/ABILITIES/PASSIVES shapes (CD-01/02); affixes (CD-03); **difficulty-director.test.js** (RUN-04); enemy-helper unit tests (ENMY-01..07); boss phase-script tests (BOSS-05..14).
- QA (Playwright): boss smoke (BOSS-15), BUILD-tree rings+synergy tooltips (CD-12), SP grid (CD-14), Sentry radial (CD-13), Threat UI (CD-16), BUILD flow (UI-02), no fatal errors per run.
- The existing 900+ unit + QA suites stay green after each task. Each task = its own solo semver bump + CHANGELOG entry; commit per task.
