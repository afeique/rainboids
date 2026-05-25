# Rainboids — Implementation Plan (consolidated dispatch board)

作成 2026-05-22 · consolidated 2026-05-24 · **cleaned 2026-05-25** (archived completed work; foregrounded remaining). Single source of truth for **open work**, ordered for execution, broken into small per-file parallel-dispatchable tasks. Shipped history → `CHANGELOG.md`.

Task IDs are `DOMAIN-NN`. Domains: **BOSS · ENMY · SKILL · ITEM · META · RUN · UI · CD**.

## Dispatch rules
- **One owner per file** (`∥group` = disjoint files, safe to dispatch together). Subagents never run git — the orchestrator verifies, bumps VERSION/CHANGELOG, commits per task. Each task ships its own test. ⚠ **Shared hubs** (`enemy.js`, `collision-system.js`, `weapon-data.js`, `wave-*.js`, `shop-dom.js`): serialize or split per-feature.
- Pattern proven this session: NEW per-mechanic helper module (pure, unit-tested) → wire into the live path **gated on a flag, default-safe** (no behavior change until a type/config opts in) → verify (node --check + artifact grep + unit + targeted QA) → commit.

---

# ★ DIR — Director & Adaptive Difficulty: full §14 model *(TOP PRIORITY — authoritative)*

**Authoritative spec:** `Passive Skills & Run Difficulty – 2026-05-24` **§14** (PWR §14.1 · control loop §14.2 · composer §14.3 · reward §14.4 · baseline §14.5 · constants §14.6 · mode-gating §14.7). Cross-ref Balance Model §6/§6b and `Tuning the Flow Channel`.

**Current state:** the shipped director (`wave/difficulty-director.js`, RUN-04/05a) is a **first-pass** — a *reactive two-axis* controller (Po/Pd → D_hp/D_thr) with a flat 35 s expected-clear and **no** PWR, **no** absolute baseline, **no** difficulty mode. This track evolves it to the **§14 model**: a **PWR-aware pre-load** + **absolute monotonic baseline curve** + **difficulty MODE (Easy→Legendary)** that biases a **single-pressure control loop**, with **mode-gated reward scaling**. Every constant in §14.6 is a *starting value* for the RUN-07 balance pass — implement the **shapes**.

**Discipline:** DIR-04/10 modify a LIVE, wired module/path — keep the public API shape working for RUN-05a, default-safe (absent mode→Normal, absent PWR→neutral pre-load), suite green. NEW-file tasks (DIR-01/02) are pure + fully parallel.

### ∥group J — foundation *(NEW pure files; dispatch together first)*
| ID | FILE (owned) | DOES | DEP |
|----|----|----|----|
| DIR-01 | NEW `wave/power-level.js` + test | `computePWR(player)` per §14.1: geometric `K_PWR·O^0.45·S^0.35·U^0.20` (K_PWR so a starter build ≈ 100) + pure `offense`/`survivability`/`utility` sub-fns (read passed player-like getters; no double-count). Unit-test the §4.1 worked examples: starter ≈100, Glass-Nuke ≈ designed-mid (geometric blend cancels its offense), Synergy-God ≈ 2.3× | — |
| DIR-02 | NEW `wave/difficulty-constants.js` + test | The §14.6 constants table (MODE_BAND/UP_RATE/DOWN_RATE/MULT_MIN/MAX/MODE_BASE/MODE_RESIST/A/B/W_* weights/PWR_REF/SUSTAIN_WINDOW/reward+rarity consts) + pure `baseline(wave)=1+A·wave+B·wave^1.5` (§14.5). Unit-test baseline(30)≈15.4, baseline(90)≈65, strictly monotonic | — |

### ∥group K — control loop *(depends J)*
| ID | FILE (owned) | DOES | DEP |
|----|----|----|----|
| DIR-03 | `core/constants.js` + runConfig | Add `mode` to `runConfig` (Easy/Normal/Hard/Epic/Legendary; default Normal; default-safe absent→Normal). Accessor `getRunMode(game)`; persist in save | DIR-02 |
| DIR-04 ⚠ | `wave/difficulty-director.js` (refactor) | Implement the §14.2 single-pressure loop: `P = W_HP·(1−hpEnd)+W_DMG·dmgTaken+W_CLEAR·(clearRatio/2)+W_ND·nearDeath`; mode-band steer (Plo/Phi, UP/DOWN_RATE asymmetry, DRIFT settle, clamp MULT_MIN/MAX); `enemyPower = baseline·MODE_BASE·directorMult·pwrPreload(PWR)`, `pwrPreload=clamp((PWR/PWR_REF)^0.5,0.8,3.0)`; distribute → `hpMult=enemyPower^.5 · dmgMult^.3 · densityMult^.2` + toughnessDR + resistDrift; speeds clamped. **Keep createDirector/recordWave/updateDifficulty/tickWave/getDifficulty/getThreatLevel/lockForBoss working** (extend, don't break RUN-05a). Keep ±12%/wave + cold-start | DIR-01/02/03 |

### ∥group L — wiring + surfacing *(depends K; mostly disjoint files)*
| ID | FILE (owned) | DOES | DEP |
|----|----|----|----|
| DIR-05 | `game-engine.js` (+ read player getters) | Compute + cache `game.playerPWR` on every build change (card pick / gear equip / passive swap / loadout / weapon change); feed the director pre-load | DIR-01 |
| DIR-06 | `hud/status.js` | HUD shield badge → **"P" + PWR number** (§13.6); keep the CD-16 threat meter. PWR vs THREAT legibility | DIR-05 |
| DIR-07 | `wave/difficulty-director.js` + `wave-manager.js` | Reference-dependent `expectedClearMs = threatBudget(wave)/estimatedPlayerDPS(PWR)` × pacing — replaces RUN-05a's flat 35 s, so "fast/slow" is judged vs the build's own power | DIR-01/04 |
| DIR-08 | `world/reward-dial.js` (extend) | §14.4 reward: `rewardMult = MODE_REWARD·depthReward·perfBonus`; `rarityBias` + **`rollRarity(bias, ceiling)`** rarity-ceiling gate (Transcendental only Legendary-deep); itemLevel scaling. Folds in/extends the shipped RUN-03 dial | DIR-03 |
| DIR-09 | `shop/shop-dom.js` (RUN SETUP) + meta | Mode selector (Easy→Legendary; Epic/Legendary gated by `rainboidsMeta.maxModeCleared`, §14.7) + reward/PWR readout; unlock-on-clear logic (Epic after ≥stage-5 Hard, Legendary after ≥stage-5 Epic) | DIR-03 |
| DIR-10 ⚠ | `wave-manager.js` / `applyEnemyLevelScaling` (refactor RUN-05a) | Apply the §14 `enemyPower` knobs live (hpMult/dmgMult/densityMult/toughnessDR/resistDrift), replacing the current raw D_hp/D_thr application; density→spawn count (overlaps RUN-05b composer — coordinate) | DIR-04 |

*(Wave composer §14.3 = **RUN-05b** (P5 below). Telemetry to tune all constants = **CD-17** (P2). Final calibration of every §14.6 constant = **RUN-07** (P2).)*

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
