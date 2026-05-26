# Rainboids — Implementation Plan (consolidated dispatch board)

作成 2026-05-22 · consolidated 2026-05-24 · **cleaned 2026-05-25** (archived completed work; foregrounded remaining). Single source of truth for **open work**, ordered for execution, broken into small per-file parallel-dispatchable tasks. Shipped history → `CHANGELOG.md`.

Task IDs are `DOMAIN-NN`. Domains: **BOSS · ENMY · SKILL · ITEM · META · RUN · UI · CD**.

## Dispatch rules
- **One owner per file** (`∥group` = disjoint files, safe to dispatch together). Subagents never run git — the orchestrator verifies, bumps VERSION/CHANGELOG, commits per task. Each task ships its own test. ⚠ **Shared hubs** (`enemy.js`, `collision-system.js`, `weapon-data.js`, `wave-*.js`, `shop-dom.js`): serialize or split per-feature.
- Pattern proven this session: NEW per-mechanic helper module (pure, unit-tested) → wire into the live path **gated on a flag, default-safe** (no behavior change until a type/config opts in) → verify (node --check + artifact grep + unit + targeted QA) → commit.

---

# ▶▶ ADAPTIVE-DIFFICULTY IMPROVEMENT ROADMAP (priority order)
From the `Director & Codebase Audit – 2026-05-25` report. The core design is validated; these make it *better*. Execute top→bottom:
0. **FIX** — quick correctness fixes (rate-limit breach, signal guards, reflect range, etc.) — cheap, each its own PATCH, **mostly parallel**. ↓ below.
1. **DIR ∥J/∥K** — structural core: PWR estimator + absolute baseline + **PWR pre-load** + §14 control-loop refactor (kills the ~9.7-wave ramp lag + deep-run saturation). ↓ DIR section.
2. **DIR ∥L** — surfacing (PWR HUD, reference-clear, mode + mode-gated rewards) + **density/composer** (RUN-05b / DIR-10: spread pressure across count+elites, not just HP — the channel-coverage fix + the "spectacle not sponges" win).
3. **Signals & calibration** — CD-17 telemetry + RUN-07 balance pass (calibrate every §14.6 constant against real play) — **after the CD no-downsides track lands** (CD is the prerequisite for safely tuning the threat axis: per-hit cap + Bloodshield).

---

# ★★ FIX — quick correctness fixes *(PRIORITY 0 — do first; cheap; each its own PATCH + test)*
Audit detail + verified line numbers: `docs/Bug-Pass Audit — Findings & Fixes – 2026-05-25.md` + the synthesis report. **∥group X — all disjoint files, dispatch together.**
| ID | FILE (owned) | DOES | ∥ |
|----|----|----|----|
| FIX-01 | `wave/difficulty-director.js` + `tests/unit/difficulty-director.test.js` | **Rate-limit breach** — `updateDifficulty` rate-limits *per block*, so deadband-step + escalation `stomp` bump (and deadband + mercy ease) compound to ~±25%/wave vs the documented ≤12%. Snapshot `D_hp`/`D_thr` at entry; apply all of deadband/cross-term/mercy/escalation; then clamp the **NET** per-wave change to ±`maxStep` once at the end. Unit-test: no axis moves >maxStep in one `updateDifficulty` under ANY combo (deadband+stomp, deadband+mercy, stomp+cross-term) | X |
| FIX-02 | `wave/wave-manager.js` (director-feed + boss-gold) | **(M2) Po-spike guard:** in `feedDirectorOnWaveClear`/`buildDirectorOutcome`, if `_waveStartMs` is unset/0, treat as no-signal — default `actualClearTime = targetClearTime` (neutral ratio) instead of clamping to 1 ms. **(M1) boss-gold wps:** line ~1804 `isBossWave(justCleared)` → `isBossWave(justCleared, runWavesPerStage(this.game))`. Unit/QA as feasible | X |
| FIX-03 | `enemy/abilities/reflect.js` + `enemy/enemy-data.js` + `tests/qa/25-reflect.spec.js` + unit test | **(H1) reflect range gate** — `bulletInReflectArc` tests angle only (the maw sibling gates `range`); a mirror reflects bullets anywhere in its 120° arc across the field. Add `range` to `REFLECT_DEFAULTS` (~120) + `PRISM_MIRROR.reflectOpts`; short-circuit `dist2 > range²` (keep the degenerate on-top check). Add a "far in-arc bullet NOT reflected" QA case + unit test | X |
| FIX-04 | `player/progression.js` + `enemy/enemy-bullet.js` | **(L3)** `addPowerup` `return true` on the success path (currently `undefined`). **(L5)** add `this.reflected = false;` to `EnemyBullet.reset()` (latent pool-reuse footgun). Tiny hygiene; extend a unit test if a natural one exists | X |

*(H2 run-config boss path → **interim fix shipped 6.191.1** — boss-spawn decoupled from the fixed `isBoss` table position (drives off `isBossWave(wave, wps)`) + `getWaveConfig` cycles the authored 30-wave pattern past wave 30 instead of collapsing to wave-1. Default 10×3 byte-for-byte unchanged. The full procedural composer **RUN-05b** (P5) eventually replaces the cycled-config synthesis. L4/L6/D1/D2 → RUN-07 tuning.)*

---

# ★ DIR — Director & Adaptive Difficulty: full §14 model *(PRIORITY 1 — authoritative)*

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
> **CD ADDITIVE BATCH COMPLETE (6.197.0→6.207.1, 12 commits):** energy economy (stats+powerups+power-crit), blood archetype (Bloodshield/Bloodlust/Sanguine/Hemoglutton), sustain (Regeneration/Regenerator/Life-on-Kill/Ablative Plating), + the status-applicator wrapper bug fix (un-broke Kindling/Conduit). All default-safe, director-absorbed. **Composition integration coverage:** `tests/qa/46-cd-build-integration.spec.js` (energy+blood stacked compose, no NaN leaks, director finite). **REMAINING CD needs USER (design/playtest):** R1 base-dmg tuning, CD-02 no-downsides removal + keystone restructure, CD-11/12/13 ability reworks, Overclock keystone.
> **PROGRESS — energy-economy slice DONE (6.197.0):** the 3 energy SP stats (Capacitor/Reactor/Efficiency) shipped end-to-end — `core/sp-stats.js` defs + auto-surfaced in the SP grid (CD-14 ✅ for energy) + default-safe getters `getEffectiveMaxEnergy/EnergyRegenMult/PowerCost` (`player/progression.js`, CD-06 ✅ energy portion) wired into player.js/weapons.js read sites + `EFFICIENCY_CAP=0.5` in constants.js (CD-05 ✅ efficiency cap). **STILL TODO in CD-01:** the stat-value buffs (CritDmg+20%/Health+40/Thorns→30%), the ability reworks (FIELD_PROJECTOR/Attune/Overcharge-Core/Nanite-Swarm/Decoy + ring fills), and **"remove all downside fields"** (needs coordinated data+code with CD-09/10 — downsides are consumed in lifecycle/collision/progression; the cosmetic `downside:` strings are separate from the mechanical `maxHpMult`/tax code). CD-05 still has the rest of the caps (toughness/dodge/regen/Bloodshield/per-hit). CD-06 still has Bloodshield/Bloodlust/Regeneration.
| ID | FILE | DOES |
|----|----|----|
| CD-01 | `combat/weapon-data.js` (+`defense-data.js`) | STATS: add Capacitor/Reactor/Efficiency/Regeneration; CritDmg +20%, Health +40; Thorns→30%+status (R-THORNS). ABILITIES: 4 fields→**FIELD_PROJECTOR**, ELEMENTAL_INFUSION→**Attune**, add Overcharge-Core/Nanite-Swarm/Decoy; fill ATTUNEMENT/UPGRADE rings (BLINK/SNARE/DESIGNATOR/SECOND_WIND/FIELD_PROJECTOR). Remove all downside fields |
| ~~CD-02~~ ✅ | `combat/passive-data.js` | **NO-DOWNSIDES REWORK COMPLETE (B1–B6, 6.208.0→6.213.0): all 11 original passive downsides removed/reworked.** B1 HOARDERS/FRENZY/TWIN_CAST · B2 GUNSLINGER/PURIST · B3 FAILSAFE/EYE_OF_THE_STORM · B4 OVERFLOW_CAPACITOR(wired)/GRAVITY_WELL · B5 GLASS_CANNON↔BERSERKER merge→HP-scaling · **B6 ✅ 6.213.0** (Apex Predator keystone added — execute <15% HP; HEAT_SINK downside cleared → 0 remain). **REMAINING (separate, NOT downside-removal):** ~~Capacitor-Bank~~ ✅ **6.214.0** (energy overcharge to 150% + decay + ×1.25 power while overcharged). ~~Overclock keystone~~ ✅ **6.215.0** (powers ignore meter → flat 2.5s cd, 0 cost, ×0.6 effect — economy inversion). **Energy-build keystone set DONE (Overflow Capacitor/Capacitor Bank/Overclock).** ~~HEAT_SINK full mechanic~~ ✅ **6.216.0** (uncapped fire-rate ramp floored at 18ms + HEAT vent AoE, no lockout). **ALL CD MECHANICS BUILT.** Remaining: only `synergies:[ids]` metadata (inert until the CD-12 synergy-tooltip display — low value now). **⚠⚠ THE big USER gate, now unblocked: enemy-HP re-tune + extremes playtest (§7) — the full no-downsides + energy + blood + sustain kit is in; the difficulty-director D-bounds need validation against min-build & god-build via playtest.** |
| CD-03 | `world/item-names.js` | Affixes: maxEnergy/energyRegen/energyCost/lifeOnKill/overheal + score weights |
| CD-04 ◐ | `world/powerup.js` | ~~Regenerator/Life-on-Kill~~ 6.202.0 · ~~Ablative Plating~~ 6.203.0 · ~~Surge Battery/Flux~~ 6.205.0 · ~~Overflow-Discharge~~ 6.206.0 · ~~Resonant-Surge (new status→+6 energy)~~ ✅ **6.207.0** — **the energy/sustain powerup set is DONE.** **STILL TODO:** Reinforced-Hull (overlaps Bloodshield — skip/reconsider); remove downsides; consolidate 7 heal micro-mods→1–2; `synergies` metadata. **NOTE 6.207.0 also FIXED the status-applicator wrappers (game-engine.js) to forward `this` — this activated the previously-inert KINDLING + CONDUIT passives (a balance-affecting bug fix; the non-player applicators stun/slow/freeze/oil/bleed left as-is — check for consistency).** |
| CD-05 | `core/constants.js` | R-CAP: centralize caps (toughness 75 · dodge 50 · energy-cost −50 · regen 3/5 · Bloodshield 35% · per-hit 45%) |

### CD Phase 1 — player mechanics *(CD-06 first, then ∥group G)*
| ID | FILE | DOES | DEP |
|----|----|----|----|
| CD-06 ✅ | `player/player.js` | ~~getEffectiveMaxEnergy/EnergyRegen/PowerCost~~ ✅ 6.197.0 · ~~Bloodshield buffer~~ ✅ 6.199.0 · ~~Bloodlust stacks~~ ✅ **6.200.0** (on-kill stack in combat-manager `onEnemyKill`, +4%/stack cap +40% mult in collision `applyDamageToEnemy`, decay in player.update; BLOODLUST passive) · ~~Regeneration into regen~~ ✅ 6.198.0. **DONE.** | CD-01/02/05 |
| CD-07 ◐ | `combat/collision-system.js` | ~~route power-weapon dmg through the player damage/crit pipeline~~ ✅ **6.204.0** (AoE powers now crit via `canCrit` on `damageEnemy`; passive mults already applied via applyDamageToEnemy; default-safe). ~~Efficiency+cap~~ ✅ 6.197.0. **STILL TODO:** Overclock keystone cooldown-mode (powers on flat ~2.5s cd, no meter — involved). **⚠ R1 BALANCE TUNING** (base power-weapon dmg "so energy builds measurably out-perform") = deliberate playtest pass, NOT done — the load-bearing assumption per the Energy doc. | CD-06 |
| CD-08 ✅ | `player/progression.js` | ~~getEffectiveRegen += Regeneration~~ ✅ 6.198.0 (REGENERATION SP stat +2 HP/s) · ~~cap→5 w/ Regenerator~~ ✅ **6.202.0** (cap conditional on the Regenerator powerup) · energy regen tick uses getEffectiveEnergyRegenMult ✅ 6.197.0. **DONE.** | CD-06 |
| CD-09 ◐ | `player/lifecycle.js` | ~~takeDamage: Bloodshield soak-first~~ ✅ **6.199.0** (soak after FAILSAFE, before HP; over-heal feed in accumulateOverflowToTank; default-safe). **STILL TODO:** per-hit cap 45% (generalize FAILSAFE); remove HOARDERS/FRENZY taxes; Thorns reflect+status | CD-06 |
| CD-10 ◐⚠ | `combat/collision-system.js` | ~~Bloodlust mult~~ ✅ 6.200.0 · ~~Hemoglutton (lifesteal ×2 vs status)~~ ✅ **6.201.0** · ~~Sanguine on-kill heal (4%)~~ ✅ **6.201.0** (in combat-manager onEnemyKill). **STILL TODO:** lifesteal→Bloodshield feed (currently over-heal feed only), Designator mark crit/detonate, Sentry targeting, Retribution nova. ⚠ hot hub — serialize | CD-06 |

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
| ~~ENMY-08~~ ✅ | `enemy/enemy-data.js` + `wave/wave-data.js` + `enemy/shapes.js` | **DONE (6.192.0)** — Conduit Node: Volt SUPPORT, SYS-7 ally **HEAL** aura (mends escort HP; counterpart to Lumen Drone's shield + distinct from Null Drone's suppress). Debuts 1-count on wave 25. 5 unit + 4 QA. |
| ENMY-09b | `enemy/enemy-data.js` + AI | Remaining batch-4 type: **Beacon** (the other 3 — Phantom/Prism-Mirror/Devourer — shipped) |
| ENMY-10b | `enemy/enemy-data.js` + AI | Batch-5: ~~**Juggernaut** (telegraphed ram, SYS-11)~~ ✅ **6.193.0** (`abilities/charge.js`; wave 22; +50% rear-exposed). ~~**Thornback** (counter-burst on hit)~~ ✅ **6.194.0** (`abilities/thorns.js` retaliatory proximity pulse; wave 25; throttled enemy→player counter via takeDamage). **Remaining: artillery/controllers** (Pyrewing/Hailmother/Storm-Diver/Bile-Mortar/Singularity-Mite — need designs). Wraithworm/Null-Drone/Leech shipped |
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
| ~~UI-02~~ ✅ | `tests/qa/31-build-flow.spec.js` (NEW) | **DONE** — 7-test end-to-end BUILD/RUN-SETUP QA: open→review every cluster tab→select loadout→configure run shape+mode→START round-trips into `game.runConfig` + live player loadout; `meta.loadout` seeds next open; no fatal JS errors. Test-only (no version bump). | 

---

## P7 — Mobile Controls & AI Co-Pilot Overhaul *(implement LAST — after every track above)*
> Source: `docs/Mobile Controls — One-Thumb Play & AI Co-Pilot – 2026-05-25.md` (design rationale) + `docs/Controls, Co-Pilot & Inventory UI — Implementation Checklist (Gap-Focused) – 2026-05-25.md` (authoritative "what's left", re-baselined ~v6.194). Scope = the **mobile + Co-Pilot** work (AS/FB/MB); the sibling GP-gamepad / IT-items workstreams from the gap-focused checklist are **out of this track** (fold in separately if wanted). Goal: complete one-thumb play — steer + tap-to-dash while the **AI Co-Pilot** (the mobile front-end of the unified Assist System) handles aim/fire/power/abilities — and make that automation *legible* and *tunable*.

**⚠ RE-BASELINE — already DONE, do NOT rebuild** (verified ~v6.194; supersedes the design doc's "implementation phases"): unified Assist System Sense/Decide/Act (`assist/assist-system.js`, ticked `game-engine.js:3370`); 3 assist levels (MANUAL_TOUCH/CO_PILOT/AUTOPILOT); relative-velocity TTI + homing detection (M2); landing-position dodge scoring (M3); split-rate sense (dodge/frame, cast/100ms, M1); role-based auto-cast for 14/14 abilities + 11/11 powers (M6); autoDodge intensity logic (engine only — no UI); analog stick + tap-dash + forced auto-aim/fire (`mobile-touch.js`, `player.js:694-705`); ability-cooldown slot-bar HUD (`status.js:1753`). The remaining work is **surfacing/persistence/feedback/mobile-polish**, below. *(NOTE: the user has this overhaul in-flight on/around v6.195.0 — re-confirm the re-baseline against the committed tree before starting this track; many rows may already be closed.)*

### ∥group AS — Assist / Co-Pilot UI depth & persistence *(engine supports level/aggression/autoDodge-intensity; none user-settable yet; touch-only mobile can't reach the ASSISTS tab)*
| ID | FILES | DOES |
|----|----|----|
| ~~AS-1~~ ✅ | `game-engine.js`, NEW `assist/assist-config.js` | **DONE 6.217.0** — persisted `rainboidsAssists` extended with `level`/`aggression`/`autoDodge`; AssistSystem **seeded from saved** at construction; per-frame reconcile mirrors `this.assists` (touch force-bakes Co-Pilot baseline, desktop/gamepad honor saved); `setAssist` type-aware; `_assistSystemActive()` gate. Pure `defaultAssistConfig`/`mergeStoredAssists` (sanitize+clamp) = 13 unit. **Unblocks AS-2/3/4/5.** |
| ~~AS-2~~ ✅ | `static-dom.js`, `ui-manager.js` | **DONE 6.218.0** — segmented LEVEL preset (Manual/Co-Pilot/Autopilot) → `setAssist('level')` + applies a bundled toggle preset; active-segment highlight + re-sync. |
| ~~AS-3~~ ✅ | `static-dom.js`, `ui-manager.js` | **DONE 6.218.0** — segmented Auto-Dodge intensity (Off/Normal/Aggressive) → `setAssist('autoDodge')`; `decideDodge` thresholds already wired. +6 unit (off/conservative/aggressive/autopilot). |
| ~~AS-4~~ ✅ | `static-dom.js`, `ui-manager.js` | **DONE 6.218.0** — Aggression slider (10–100% → 0.1–1.0) → `setAssist('aggression')` (clamped). All three persist + QA round-trip (`52-assists-tuning`, 6 tests). Also fixed `switchTab(undefined)` blanking the menu. |
| AS-5 | mobile UI (ASSISTS tab hidden on touch `game-engine.js:5051`, `static-dom.js:277`) | **Mobile-native Assists screen** (explicit user ask) — touch-reachable Co-Pilot screen (from pause / settings) exposing AS-2/3/4 + auto-cast toggles + stick side; stop force-baking assists so mobile players can tune. **MINOR.** |
| AS-6 | mobile HUD | *(optional)* **Smart-Cast button** (default hidden) → fires `decideCast`/`decidePower`'s top pick on demand. Unit: best-pick selection. **MINOR.** |

### ∥group FB — Co-Pilot & death feedback *(`_lastAssistCast` written but never read; no auto-cast cue; game-over shows no cause)*
| ID | FILES | DOES |
|----|----|----|
| ~~FB-1~~ ✅ | `hud/status.js` | **DONE 6.216.1** — auto-casts surfaced: new-cast edge-detect on `player._lastAssistCast` → pip flash (per-slot timer) + "↑ ABILITY" `_assistToast`. Additive, default-safe. 8 unit + 5 QA. |
| FB-2 | ship render | *(optional)* **Auto-dodge cue** — subtle ship glow when `_assistDashAngle` drove the dash. **PATCH.** |
| ~~FB-3~~ ✅ | NEW `hud/death-cause.js`, `player/lifecycle.js`, `hud/overlays.js` | **DONE 6.219.0** — one-line death cause under the GAME OVER wave/time summary; `classifyDamageSource(opts.source)` stamps `player.lastDamageSource` on every lethal hit + snapshots at death; pure `deathCauseString` map (default-safe, never blames Co-Pilot). Collision sites already passed the source. 18 unit. |

### ∥group MB — Mobile wiring & polish *(three built modules are dead/never-imported; several polish items absent)*
| ID | FILES | DOES |
|----|----|----|
| ~~MB-1~~ ✅ | `game-engine.js` | **DONE 6.216.3** — `_reconcileWakeLock()` (driven each frame from `gameLoop`, acts only on state change) acquires on PLAYING/WAVE_TRANSITION, releases otherwise; `attachAutoReacquireHandler()` installed once at boot (re-takes lock on tab-return). isMobile-gated, default-safe. Covered by wake-lock unit suite + QA pause cycle. |
| ~~MB-2~~ ✅ | `core/utils.js`, `assist-system.js` | **DONE 6.216.2** — `triggerHapticFeedback` routed through `platform/haptic.js` (real Vibration API, isMobile-gated); Co-Pilot cues (auto-dodge=MEDIUM, auto-cast=LIGHT); `setHapticsEnabled`/`isHapticsEnabled` persist `rainboids:haptics` (default on). 4 unit. *(settings-screen UI toggle deferred to AS-5/settings.)* |
| ~~MB-3~~ ✅ | `main.js`, `ui/mobile-tutorial.js` | **DONE 6.216.4** — `mountMobileTutorial()` called from `main.js start()` (self-gates isMobile + seen-flag); copy rewritten for one-thumb + Co-Pilot (drag-steer / tap-dash / Co-Pilot aims&fires / auto-cast). 14 unit + QA load 12/12. |
| MB-4 | `mobile-touch.js`/camera | **Ship-under-finger offset** — anchor ship ~50px above the touch point so the thumb doesn't occlude it. **PATCH.** |
| MB-5 | camera | **Mobile camera zoom** — tune (~0.75 portrait / ~0.9 landscape) for a moving ship; verify with deadband-follow. **PATCH.** |
| MB-6 | crit-flash gating | **Verify crit-flash suppression covers mobile** (5.99.2 `3695b94`); fix if mis-gated → no full crit screen-flash on mobile. **PATCH (or none if correct). Verify-first.** |
| MB-7 | `hud/combat.js drawDamageNumbers` | **Canvas-space damage numbers on mobile** — stay readable at mobile zoom. **PATCH.** |

**Sequencing (this track):** AS-1 first (persistence/seeding) → unblocks AS-2/3/4/5. FB-1 + MB-1/2/3 are independent cheap wins (wire dead modules + make the Co-Pilot legible). Suggested first sub-sprint = FB-1 + AS-1+AS-3 + MB-1/2/3 (biggest perceived-quality jump for least code). AS-6/FB-2 optional.
**Verification gate:** unit (new AS-3/4 thresholds, FB cause-mapping); **survival sims** via `tools/ai-qa-bot/` as a *positioning-only* bot across all difficulty MODEs (assert Co-Pilot keeps player alive + watch director thrash since a deterministic Co-Pilot is periodic); **fun-score A/B** (accept only if no dimension regresses >5 pts); **fairness** (an Autopilot run must not farm an un-escalated game for full rewards). Devices: iOS Safari + Android Chrome, portrait/landscape, notch safe-areas, both stick sides.

---

## Notes / known items
- **DROPPED/SUPERSEDED:** SKILL-02 (new-skills batch — folded into CD); META-07 (→ RUN-07).
- **Pre-existing, not regressions:** none open — the 3 stale e2e wave-1 assertions were fixed (6.187.1).
- Each task = its own solo semver bump + CHANGELOG entry; keep the 1456+ unit + QA + e2e suites green.
