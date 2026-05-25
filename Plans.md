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
| BOSS-02 | `js/modules/combat/collision-system.js` | Route player bullets → boss weak-points (`boss-parts.js`): hits on a live part damage it, core invuln while parts live. Unit test the hit-routing decision | boss-parts (shipped) | — (serialize) | TODO |
| BOSS-03 | `js/modules/enemy/boss-intro.js` + NEW `js/modules/enemy/boss-fx.js` | Intro/death canvas FX: name-card sweep, death detonation, camera-shake; driven by the shipped intro/death runner. QA: stub boss plays intro→death | boss-intro (shipped) | A | TODO |
| BOSS-04 | NEW `js/modules/enemy/bosses/index.js` + spawn hook in `wave/wave-manager.js` | Boss registry + "spawn the stage's boss on its last wave"; `isFinalBoss` flag wiring. Unit test registry lookup by stage | BOSS-01/02/03 | — | TODO |

### The 10 bosses — each its own file ⇒ **fully parallel** *(old D.B1–D.B5)*
All depend on BOSS-04 + chassis. Each: a phase-script (uses `boss-phases.js`) + weak-point parts (uses `boss-parts.js`) + element. DoD per boss: spawns w/ name-card + healthbar, weak-point/armor gating works, enrage fires, killable 45–120s, **boss smoke test green**.
| ID | FILE (owned) `js/modules/enemy/bosses/…` | Boss | ∥group |
|----|----|----|----|
| ~~BOSS-05~~ | `harbinger.js` | ✅ **6.163.0** — THE HARBINGER (1-3, Kinetic — rotating bolt-head weak-points); established the `enemy/bosses/` descriptor pattern + chassis-API usage for BOSS-06..14 | B |
| ~~BOSS-06~~ | `aegis.js` | ✅ **6.164.0** — THE AEGIS (2-6, armor — rotating plate-gap, CORRODE-bypass, plate-shed) | B |
| ~~BOSS-07~~ | `lumen.js` | ✅ **6.164.0** — LUMEN THE PRISM SOVEREIGN (3-9, Radiant — shield drones, DISJUNCTION) | B |
| BOSS-08 | `gemini.js` | GEMINI (4-12, Pyro+Cryo twins — opposite resists, tether, partner-enrage) | B |
| ~~BOSS-09~~ | `maelstrom.js` | ✅ **6.164.0** — MAELSTROM THE STORM CROWN (5-15, Volt — conduit nodes, CONDUCT rain) | B |
| BOSS-10 | `hivemother.js` | THE HIVEMOTHER (6-18, Toxic — egg-sac spawns, CORRODE clouds) | B |
| BOSS-11 | `iron-throne.js` | THE IRON THRONE (7-21, 4 per-element turrets, core-invuln-while-turrets-live) | B |
| BOSS-12 | `warden-prime.js` | THE WARDEN PRIME (8-24, adaptive resist wall, ADAPTIVE PURGE) | B |
| BOSS-13 | `nullmaw.js` | NULLMAW THE DEVOURER (9-27, Void — pull, projectile-eat cone, IMPLOSION) | B |
| BOSS-14 | `prismarch.js` | THE PRISMARCH / OMEGA (10-30, all 7 — 5-aspect gauntlet; wire `isFinalBoss`→run-complete + death cinematic + run summary) | B (after B05–B13) |
| BOSS-15 | NEW `tests/qa/17-bosses.spec.js` | Parameterized boss smoke tests (spawn → reach every phase → killable, per boss) | after bosses |

---

# 2. ENMY — enemy enabling systems + types + uniqueness *(old A.E8/E9/E10)*
⚠ Many attach to enemy entities — prefer **new per-mechanic helper modules** (parallel) over editing `enemy.js` directly; serialize any `enemy.js`/`collision-system.js` edits.
| ID | FILES (owned) | DOES *(old)* | DEPENDS | ∥group |
|----|----|----|----|----|
| ENMY-01 | NEW `js/modules/enemy/telegraph.js` + unit test | Reusable wind-up→strike helper *(A.E9-S11)* | — | D |
| ENMY-02 | NEW `js/modules/enemy/abilities/projectile-absorb.js` + test | Maw-cone eats bullets→shield; beams/melee bypass *(A.E9-S4)* | — | D |
| ENMY-03 | NEW `…/cloak.js` + test | Periodic invis + de-target; MARK/AoE reveals *(A.E9-S5)* | — | D |
| ENMY-04 | NEW `…/reflect.js` + test | Front-arc reflects player bullets *(A.E9-S6)* | — | D |
| ENMY-05 | NEW `…/buff-strip.js` + test | Strips a player powerup/skill-buff on hit *(A.E9-S8)* | — | D |
| ENMY-06 | NEW `…/suppress-aura.js` + test | Aura stalls skill cooldowns / blocks activation *(A.E9-S9)* | — | D |
| ENMY-07 | NEW `…/blink-burrow.js` + test | Periodic teleport/burrow w/ telegraph; frozen blocks *(A.E9-S10)* | ENMY-01 | D |
| ENMY-08 | `enemy/enemy-data.js` + AI | Conduit Node (Volt support) *(A.E8c)* | ENMY-S7(shipped) | — (serialize w/ 09/10) |
| ENMY-09 | `enemy/enemy-data.js` + AI | Batch-4 types: Devourer/Phantom/Prism-Mirror/Beacon *(A.E8d)* | ENMY-02/03/04 | — (serialize) |
| ENMY-10 | `enemy/enemy-data.js` + AI | Batch-5: Leech/Null-Drone/Juggernaut/Thornback/Wraithworm + artillery *(A.E8e)* | ENMY-01/05/06/07 | — (serialize) |
| ENMY-11 | per-type AI modules | Distinct behaviors for the 10 new types *(A.E10-U2)* | ENMY-08/09/10 | — |
| ENMY-12 | per-type AI modules | Deferred flourishes (Glacier shatter, TANGERINE oil, TITAN demote, …) *(A.E10-U3)* | ENMY-07/01 | — |

---

# 3. SKILL · ITEM *(old Phase B/C remainders)*
| ID | FILES (owned) | DOES | DEPENDS | Note |
|----|----|----|----|----|
| SKILL-01 | `js/modules/ui/` loadout-assign UI | Assign any owned ability → slots 1-4 *(B.S4)* | — | |
| ~~SKILL-02~~ | — | *(B.S5 new-skills batch)* | — | **SUPERSEDED** — its skills (Bloodlust/Designator/Blink/Gravity-Snare/Elemental-Infusion) are shipped or now in **CD** (Attune/new abilities). Dropped. |
| ITEM-01 | `world/item-system.js` + `shop/*` display | Resist-roll display + tier-gated resist counts *(C.I2)* | — | unblocks META-03 |

---

# 4. META — run-meta + economy remainders *(old Phase R remainder + W7/W8)*
| ID | FILES (owned) | DOES *(old)* | DEPENDS |
|----|----|----|----|
| META-01 | `js/modules/shop/shop-manager.js` (+ HUD shop button) | Remove the mid-wave gold UPGRADES shop entirely (upgrades are cards now) *(R2.4-full)*; rework `07-weapons` shop tests | — |
| META-02 | `shop/*` PASSIVE-tab path | Stat passives SP-only — remove the gold PASSIVE-tab path *(R7.4)* | — |
| META-03 | `world/cores.js` + ARMORY | Resist targeting: add/swap an elemental resist for Cores, tier-capped *(R8.7)* | ITEM-01 |
| META-04 | `world/item-system.js` + ARMORY | Trait reroll (gear passive-affix) + traited-item salvage value *(R8.9)* | — |
| META-05 | `combat/card-draft.js` + `weapon-data.js` + ARMORY | W7: **global efficacy card = 5th draft slot** (1 primary+1 power+1 global+2 ability); flat per-item unlock cost; per-attunement VFX/tooltips; gold→Cores exchange | CD-01 (data) |
| META-06 | `world/` mastery system + `cores.js` | W8: per-item Mastery tracks (infinite, exponential gold, diminishing power) + gold→Cores sink | META-05 |
| ~~META-07~~ | — | *(R-BAL1)* | **FOLDED into RUN-07** (single balance pass over meta power + adaptive director) |

---

# 5. RUN — Run Configurator + Adaptive Difficulty + Wave Composer *(old Phase X; round-4 §12)*
**Difficulty is AUTO-TUNED, not player-chosen.** Player picks run **length** (stages 10–100) + **waves/stage** (3/6/9). `runConfig={stages,wavesPerStage}` (no difficulty field). Replaces `MAX_WAVES=30`.
| ID | FILES (owned) | DOES *(old X)* | DEPENDS | ∥ |
|----|----|----|----|----|
| RUN-01 | `core/constants.js` + `wave/*` + `game-engine.js` | `runConfig` on game+save; replace MAX_WAVES reads; boss=last wave/stage, elite=other mult-of-3, card every stage EXCEPT last (cards=stages−1); run-complete reads config *(X1)* | — | — (hub) |
| RUN-02 | `combat/card-draft.js` | Card-pool layering: efficacy→economy fallback; `CARDS_PER_RUN=stages−1` *(X2)* | RUN-01 | — |
| RUN-03 | `world/` reward scaling | Reward dial: waves/stage mult (×1.0/1.3/1.6) on drop/gold/rarity/Cores; stage-depth endurance curve *(X3)* | RUN-01 | E |
| **RUN-04** | NEW `js/modules/wave/difficulty-director.js` + `tests/unit/difficulty-director.test.js` | **Adaptive Difficulty Director** *(X4 = CD's T16)* — composite Po/Pd (EMA), D_hp∈[0.6,3.0]/D_thr∈[0.6,1.8], deadband ±12%, ≤12%/wave, cold-start, cross-term, mercy, `getThreatLevel()`. Pure + unit-tested. Targets/bounds from **Balance Model §6b/§8** | — | E (new file) |
| RUN-05 | `wave/wave-manager.js` + NEW `wave/wave-composer.js` | Procedural wave composer: Director threat-budget→randomized roster + themes + telegraphed modifiers; elites/bosses draw from budget; replaces static `WAVE_DATA[1..30]` *(X5)* | RUN-04, RUN-01 | — |
| RUN-06 | `shop/shop-dom.js` (pre-run) + `static-dom.js` | RUN SETUP panel in BUILD→START: stages + waves/stage selectors + reward-dial readout; writes `runConfig`; persist `peakThreatReached` *(X6 = UI U6)* | RUN-01, RUN-03 | — |
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
| CD-16 | NEW `js/modules/hud/threat-level.js` + HUD hook | **R-THREATUI**: 5-pip cool→hot threat meter; "THREAT ↑" toast; fed by `director.getThreatLevel()` | RUN-04 |

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
