# Rainboids — Implementation Plan (consolidated dispatch board)

作成 2026-05-22 · consolidated 2026-05-24 · **cleaned 2026-05-25** (archived completed work; foregrounded remaining). Single source of truth for **open work**, ordered for execution, broken into small per-file parallel-dispatchable tasks. Shipped history → `CHANGELOG.md`.

Task IDs are `DOMAIN-NN`. Domains: **BOSS · ENMY · SKILL · ITEM · META · RUN · UI · CD**.

## Dispatch rules
- **One owner per file** (`∥group` = disjoint files, safe to dispatch together). Subagents never run git — the orchestrator verifies, bumps VERSION/CHANGELOG, commits per task. Each task ships its own test. ⚠ **Shared hubs** (`enemy.js`, `collision-system.js`, `weapon-data.js`, `wave-*.js`, `shop-dom.js`): serialize or split per-feature.
- Pattern proven this session: NEW per-mechanic helper module (pure, unit-tested) → wire into the live path **gated on a flag, default-safe** (no behavior change until a type/config opts in) → verify (node --check + artifact grep + unit + targeted QA) → commit.

---

# ✅ COMPLETED (archived for traceability — detail in CHANGELOG)

- **BOSS track — COMPLETE** (6.159.0–6.168.0): chassis (boss-phases/parts/intro/fx/render/healthbar) + **all 10 unique bosses** (Harbinger→Prismarch) spawn / render / fight / die in-game; weak-point hit-routing; final-boss→GAME_COMPLETE; 7 smoke tests (`17-bosses.spec.js`). *(BOSS-01..15)*
- **ENMY enabling systems — COMPLETE**: SYS-1 player elemental statuses (`player-status.js`), SYS-2 hazards (`hazard-field.js`), SYS-3 mid-fight spawning (`enemy.spawner`), SYS-7 ally aura (`support-aura.js`) — all live. **+ all 7 new helper modules** (telegraph/cloak/reflect/projectile-absorb/buff-strip/suppress-aura/blink-burrow, 6.169–6.170) wired **live** (6.180–6.185) as **6 new enemies** (Phantom/Wraithworm/Null-Drone/Prism-Mirror/Devourer/Leech), all **now spawning in live waves** (6.187.0, non-boss mid/late, director-absorbed). *(ENMY-01..07 + ENMY-09/10 partial)*
- **RUN — Adaptive Difficulty system LIVE**: Director (RUN-04, 6.171) + Threat HUD (CD-16, 6.172) → **live in-game** (RUN-05a, 6.177); runConfig plumbing (RUN-01a, 6.173) + card-every-stage-except-last (RUN-01b, 6.174); Reward Dial (RUN-03, 6.175); RUN SETUP UI (RUN-06, 6.176).
- **ITEM/META**: tier-gated gear resists + readout (ITEM-01, 6.178); Cores resist-targeting (META-03, 6.179); gear-passive reroll (META-04, 6.186) — full ARMORY crafting set (reroll/tier-up/target-resist/reroll-passive).
- Test suite: **1456 unit + Playwright QA + e2e**, all green @ **6.187.1**.

---

# ▶ REMAINING WORK — prioritized

> **Critical path:** the difficulty director is live but balancing against the *current* (pre-CD) player. The **CD no-downsides expansion** makes the player dramatically stronger — so CD must land **before** RUN-07 balance can be meaningfully tuned. CD is therefore the top priority; it is also the marquee design (the `Tuning the Flow Channel` + Balance + Energy&Health + Abilities docs are its rationale).

## P1 — CD: Combat-Depth "no-downsides" expansion *(the big one; ~16 tasks)*
Full spec: `docs/Combat Depth — Implementation Plan (consolidated) – 2026-05-24.md` + the three 05-24 docs. **Contract: no downsides; depth via equip-economy + synergy; difficulty via the RUN-04 director; stats = flat baseline, powerups = conditional synergy.** ✅ CD-16 (Threat HUD) already shipped.

### CD Phase 0 — foundation data *(fully parallel — disjoint files; ∥group F) — START HERE*
| ID | FILE | DOES |
|----|----|----|
| CD-01 | `combat/weapon-data.js` (+`defense-data.js`) | STATS: add Capacitor/Reactor/Efficiency/Regeneration; CritDmg +20%, Health +40; Thorns→30%+status (R-THORNS). ABILITIES: 4 fields→**FIELD_PROJECTOR**, ELEMENTAL_INFUSION→**Attune**, add Overcharge-Core/Nanite-Swarm/Decoy; fill ATTUNEMENT/UPGRADE rings (BLINK/SNARE/DESIGNATOR/SECOND_WIND/FIELD_PROJECTOR). Remove all downside fields |
| CD-02 | `combat/passive-data.js` | Remove ALL downside clauses (re-anchor, Balance §6c); merge GLASS_CANNON+BERSERKERS→free a slot→add keystone **Apex Predator** (R-KEYSTONE); add Bloodshield/Bloodlust/Sanguine/Hemoglutton/Overclock/Capacitor-Bank; rework OVERFLOW_CAPACITOR/OVERFLOW_SPARK; add `synergies:[ids]` + icons |
| CD-03 | `world/item-names.js` | Affixes: maxEnergy/energyRegen/energyCost/lifeOnKill/overheal + score weights |
| CD-04 | `world/powerup.js` | Reflavor dupes→Bloodshield/Reinforced-Hull/Ablative-Plating; add Flux/Overflow-Discharge/Resonant-Surge/Surge-Battery/Regenerator; remove downsides; consolidate 7 heal micro-mods→1–2; `synergies` |
| CD-05 | `core/constants.js` | R-CAP: centralize caps (toughness 75 · dodge 50 · energy-cost −50 · regen 3/5 · Bloodshield 35% · per-hit 45%) |

### CD Phase 1 — player mechanics *(CD-06 first, then ∥group G)*
| ID | FILE | DOES | DEP |
|----|----|----|----|
| CD-06 | `player/player.js` | getEffectiveMaxEnergy/EnergyRegen/PowerCost (−50% cap); Bloodshield buffer (accumulate/decay/soak); Bloodlust stacks; Regeneration into regen | CD-01/02/05 |
| CD-07 | `player/weapons.js` | R-POWERPIPE: route power-weapon dmg through the player damage/crit pipeline; Efficiency+cap; Overclock cooldown-mode | CD-06 |
| CD-08 | `player/progression.js` | getEffectiveRegen += Regeneration; cap→5 w/ Regenerator; energy tick uses getEffectiveEnergyRegen | CD-06 |
| CD-09 | `player/lifecycle.js` | takeDamage: Bloodshield soak-first; per-hit cap 45% (generalize FAILSAFE); remove HOARDERS/FRENZY taxes; Thorns reflect+status | CD-06 |
| CD-10 ⚠ | `combat/collision-system.js` | applyDamageToEnemy: Bloodlust mult, Hemoglutton, Sanguine on-kill, lifesteal→Bloodshield feed, Designator mark crit/detonate, Sentry targeting, Retribution nova. ⚠ hot hub — serialize | CD-06 |

### CD Phase 2 — abilities *(∥group H)*
| ID | FILE | DOES | DEP |
|----|----|----|----|
| CD-11 | `player/abilities.js` | FIELD_PROJECTOR per-element, Attune, Sentry retune+targeting, Designator/Second-Wind reworks, Overcharge-Core/Nanite-Swarm/Decoy | CD-01/06 |
| CD-12 | `shop/shop-dom.js` | Route ABILITY_UPGRADES into the DEFENSE ring + synergy tooltips (R-SYNERGY) | CD-01/02/04 |
| CD-13 | `ui/radial-menu.js` | Sentry radial = unlocked attunements; selection → retune | CD-11 |

### CD Phase 3 — surfacing *(∥group I)*
| ID | FILE | DOES | DEP |
|----|----|----|----|
| CD-14 | `ui/sp-allocation.js` | Surface Capacitor/Reactor/Efficiency/Regeneration in SP grid | CD-01 |
| CD-15 | `ui/icons.js` | Icons for new stats/abilities/passives | CD-01/02 |

## P2 — RUN-07: balance pass + director enrichment *(after CD lands; needs playtesting)*
| ID | FILE | DOES |
|----|----|----|
| RUN-07 | `wave-data.js` + `wave/difficulty-director.js` + tuning | AI-survival on 10×3 + 100×9 on a meta account; tune target band + baseline + reward + enemy-HP curve. **+ director enrichment (the flow-channel doc's fuller model, currently first-pass only):** PWR power-level estimator (geometric `O^0.45·S^0.35·U^0.20`, Tuning §4) + **PWR pre-load** (§6.2), monotonic `baseline(wave)=1+A·wave+B·wave^1.5` (§5), reference-dependent `expectedClearMs` (replaces the flat 35s). Folds in CD-17/18. |
| CD-17 | `tools/` telemetry | Log Po/Pd/D + per-wave outcomes (feeds RUN-07 tuning) |

## P3 — META: economy/meta remainders
| ID | FILE | DOES | DEP |
|----|----|----|----|
| META-05 | `combat/card-draft.js` + `weapon-data.js` + ARMORY | W7: **global efficacy card = 5th draft slot** (1 primary+1 power+1 global+2 ability); flat per-item unlock cost; per-attunement VFX/tooltips; gold→Cores exchange | CD-01 |
| META-06 | `world/` mastery + `cores.js` | W8: per-item Mastery tracks (infinite, exponential gold, diminishing power) + gold→Cores sink | META-05 |
| META-01 | `shop/shop-manager.js` (+ HUD shop btn) | Remove the mid-wave gold UPGRADES shop entirely (upgrades are cards now); rework `07-weapons` shop tests. ⚠ removes a player-facing system — un-playtestable here, wants user confirm |
| META-02 | `shop/*` PASSIVE-tab path | Stat passives SP-only — remove the gold PASSIVE-tab path. ⚠ same caveat |

## P4 — ENMY: remaining types + uniqueness *(systems all live; this is roster breadth)*
| ID | FILE | DOES |
|----|----|----|
| ENMY-08 | `enemy/enemy-data.js` + AI | Conduit Node (Volt support, SYS-7) |
| ENMY-09b | `enemy/enemy-data.js` + AI | Remaining batch-4 type: **Beacon** (the other 3 — Phantom/Prism-Mirror/Devourer — shipped) |
| ENMY-10b | `enemy/enemy-data.js` + AI | Remaining batch-5: **Juggernaut** (telegraphed ram, uses SYS-11), **Thornback**, artillery/controllers (Pyrewing/Hailmother/Storm-Diver/Bile-Mortar/Singularity-Mite). Wraithworm/Null-Drone/Leech shipped |
| ENMY-11 | per-type AI modules | Distinct movement/attack AI for the new types (currently use generic chase/keep_distance) — feel-polish, better with user's eye |
| ENMY-12 | per-type AI modules | Deferred flourishes: Glacier brittle-shatter, TANGERINE oil mines (SYS-1/2), TITAN demote→roving elite |
| ENMY-ELITE | NEW elite-variant mechanic | elite = non-boss mult-of-3 waves: stat-bumped/affixed variant + visual tag. Fold into RUN-05b composer or own task |

## P5 — RUN composer + card layering *(deferred / design-gap)*
| ID | FILE | DOES |
|----|----|----|
| RUN-05b | NEW `wave/wave-composer.js` + `wave-manager.js` | Procedural wave composer: director threat-budget→randomized roster + themes + telegraphed modifiers; **D_hp→spawn COUNT** + elite injection drawn from budget; replaces static `WAVE_DATA[1..30]`. High-risk — sequence with/after RUN-07. The "right" home for the new enemy roster + elites |
| RUN-02 | `combat/card-draft.js` | Card-pool layering: efficacy→**economy** fallback. ⚠ DESIGN-GAP: the old economy/drop upgrade pool (MEDPACK/PAYDAY) was removed from constants.js — **clarify the economy-card source before building** |

## P6 — SKILL / UI polish *(low priority)*
| ID | FILE | DOES |
|----|----|----|
| SKILL-01 | `ui/` loadout-assign | Assign any owned ability → specific slot 1-4 (selection-order already controls slots, so this is QoL — low value) |
| UI-01 | `css/styles.css` + `shop/shop-dom.js` | BUILD-tree polish: spacing/contrast/responsive, hover/active, tooltip completeness, mobile, legend states — subjective, better with user's eye |
| UI-02 | `tests/qa/07-weapons.spec.js` + new BUILD-flow spec | QA: open→review each tab→select loadout→START; pre-run seeding round-trips | 

---

## Notes / known items
- **DROPPED/SUPERSEDED:** SKILL-02 (new-skills batch — folded into CD); META-07 (→ RUN-07).
- **Pre-existing, not regressions:** none open — the 3 stale e2e wave-1 assertions were fixed (6.187.1).
- Each task = its own solo semver bump + CHANGELOG entry; keep the 1456+ unit + QA + e2e suites green.
