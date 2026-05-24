# Rainboids — Combat-Depth Expansion Plans.md

作成日: 2026-05-22 · 最終整理: 2026-05-24 (completed/shipped work removed — see `CHANGELOG.md` for shipped history; this file now tracks the **open backlog** only)

Source design docs (in `docs/`):
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (what/why)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (Plan A)
- `Unified Skills (4-Slot) — Implementation Plan – 2026-05-22.md` (Plan B)
- `Item Tiers, Resistances & Traits — Implementation Plan – 2026-05-22.md` (Plan C)
- `Enemy & Boss Revamp — Design Plan – 2026-05-22.md` (Plan D — enemy batches + 10 unique bosses)
- `Run-Meta Overhaul — Loadout, Leveling, Inventory & Cores — Implementation Plan – 2026-05-22.md` (Plans E–I, folded into Phase R)
- `Enemy Uniqueness & Enabling Systems — Plan – 2026-05-22.md` (Phase A.E9 enabling systems + A.E10 uniqueness)
- `Weapon Element Identity & Meta-Progression — Design Plan – 2026-05-23.md` (Phase W — active)
- `Roguelite Restructure — Phase R progress report – 2026-05-23.md` (Phase R shipped detail)

> **Shipped history lives in `CHANGELOG.md`.** The following are **done** and have been
> removed from this backlog: Phase A core (element taxonomy/resistances/status engine/
> synergy reactions, 6.57.0–6.66.0), the 20-enemy roster (6.67.0–6.83.0), Phase B 4-slot
> abilities + HUD (6.59.0–6.61.0), Phase C tier ladder C.I1 (6.60.0), the entire **Phase R**
> roguelite restructure (gold economy · ARMORY · cards · loadout · 4-slot abilities incl.
> the R6.3 ability batch, 6.84.0–6.93.0), and Phase **W0–W5** (BUILD tree + attunement data
> & behaviors for all 6 elements + mechanic-mod nodes + efficacy-only cards, 6.103.0–6.114.1).

> **⚠️ Pending re-plan:** Phase W supersedes the weapon-card parts of the old R2.4 / R3 / R4.
> Phases A / B / C / D below are the pre-supersession backlog — some may still be replaced as
> new plans land. Treat `CHANGELOG.md` as authoritative for what exists today.

---

## Phase U — Pre-run BUILD & Gear-Review UI  *(2026-05-24 · ACTIVE — user priority)*

The pre-run start-of-game screen where the player **reviews everything before a run**:
gear, the weapon bubble trees (primary/power), the ability/attunement tree, passives, and
(later, X4) run setup. Built on the existing tabbed bubble tree (`shop-dom.js` pre-run
mode + `static-dom._buildShopOverlay`): tabs **GEAR · PRIMARY · POWER · DEFENSE · PASSIVE**,
a pre-run footer (BACK / loadout status / START RUN), legend, and floating tooltips already
exist. Goal: make it a polished, complete "review & confirm your loadout" experience.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| U1 | **Pre-run chrome**: title reads "BUILD" (not "UPGRADES") in pre-run mode; clear sub/instructions; show account-gold **and** Cores in the header; legend reflects pre-run states (equipped/active vs owned/affordable) | Pre-run header/title/legend read correctly; in-run shop unchanged; QA green | - | ✅ 6.119.0 (title + Cores readout shipped; legend states still TODO in U4) |
| U2 | **Loadout summary / readiness** in the footer: show chosen counts + names (e.g. "4/4 primary · 4/4 power · 4/4 ability"); START RUN reflects readiness; per-tab "selected" affordances | Footer shows the live loadout; selecting/deselecting updates it; START communicates readiness | U1 | ✅ 6.119.0 (counts + ⚠/✓ readiness + START gating; `loadoutReadiness` unit test + QA-08e) |
| U3 | **Tab completeness**: every tab renders + is reviewable in pre-run — GEAR (equip/salvage/reroll/tier-up), PRIMARY/POWER (parent select + attunement/mod orbit), DEFENSE (ability select + ability-attunement orbit), PASSIVE (stats today; Phase P passives later). Keyboard/gamepad tab cycling | Each tab is browsable + actionable pre-run; no dead tabs; input works | U1 | ✅ 6.120.0 (keyboard ◂▸/Q-E/Tab + gamepad D-pad cycling; pre-run hint; legend relabel; `nextTab` unit test + gamepad-tab-cycle unit test + QA-08e). All 5 tabs already render/are actionable pre-run from prior phases. |
| U4 | **Polish pass**: spacing/contrast/responsive; bubble hover/active states; tooltip content (cost/desc/state); mobile layout | Reads cleanly desktop + mobile; bubbles legible; tooltips complete | U1, U2, U3 | cc:TODO |
| U5 | **QA tests**: rework `07-weapons` + add BUILD-tree flow specs (open → review each tab → select loadout → START RUN); pre-run seeding round-trips (attunements/mods/ability-attune) | New/updated QA specs green; covers the review→start flow | U1–U4 | cc:TODO |
| U6 | Fold **X4 RUN SETUP** into this screen as a tab/panel (stages · waves/stage · difficulty + live readout) once Phase X1/X2 land | RUN SETUP lives in the BUILD screen; writes `runConfig`; QA green | X1, X2, U3 | cc:TODO (after X) |

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
| ~~C.I3a/b/c~~ | **FOLDED into Phase P** — self-contained / element / skill traits are now entries in the unified PASSIVES rule-modifier pool (built once, in P6) | superseded | → Phase P | folded |
| ~~C.I4~~ | **FOLDED into Phase P** — keystone delivery (drop + stage-clear card) becomes alternate delivery channels for the PASSIVES pool (P7) | superseded | → Phase P | folded |

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

## Phase R — Roguelite Restructure — SHIPPED (6.84.0–6.93.0); remaining items only

The full Phase R loop shipped 6.84.0–6.93.0 (gold economy · ARMORY · cards · loadout · 4-slot
abilities incl. the R6.3 ability batch). Detail: `CHANGELOG.md` + `docs/Roguelite Restructure —
Phase R progress report – 2026-05-23.md`. Still open:

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| R2.4-full | Remove the mid-wave gold **UPGRADES shop** entirely (`shop/shop-manager.js`) — upgrades are cards now | No in-run gold upgrade purchases; 07-weapons shop tests reworked | - | cc:TODO |
| R7.4 | Stat passives SP-only — remove the gold **PASSIVE tab** path (CRIT/HEALTH/SHIELD/VAMP/THORNS/DODGE/SPEED) | Passives raised only via SP; no gold path; no orphaned refs | - | cc:TODO |
| R8.7 | Resist targeting: add/swap an elemental resist for Cores; tier caps respected | Chosen resist appears/changes; tier-gated count enforced | C.I2 | cc:TODO (blocked on C.I2) |
| R8.9 | Trait reroll (C.I3*) + traited-item salvage value for Cores | Trait reroll works; traited items yield Cores per rule; consistent w/ C.I4 | C.I3a | cc:TODO (blocked on C.I3) |
| R-BAL1 | Tune difficulty around permanent meta power (SP stats + gear + unlocks); co-tune enemy/boss scaling | Early runs non-trivial, late runs winnable; AI-survival green on a meta account | A.E8*, D, W | cc:TODO |

---

## Phase W — Weapon Attunements, Mechanic Mods & Efficacy Cards  *(2026-05-23 · ACTIVE)*

Source: `docs/Weapon Element Identity & Meta-Progression — Design Plan – 2026-05-23.md`.
**W0–W5 shipped (6.103.0–6.114.1)**: unified pre-run BUILD tree, attunement data model +
behaviors for all 6 elements (Pyro/Cryo/Volt/Toxic/Void/Radiant), mechanic-mod classification +
BUILD-tree nodes, efficacy-only card draft (1 primary + 1 power + 2 ability). Remaining:

### W6 — Ability attunements  ✅ SHIPPED (6.116.0 data/plumbing → 6.118.0 runtime)
- [x] `abilityAttunements` data: ONE element per ability (not stacking); element-agnostic base; per-ability element options (design §15.1) · tests
- [x] `player.activeAbilityAttune[abilityId] = elementId` (+ cached `activeAbilityAttuneElement`); applied at each ability's verb (`abilities.js` / `lifecycle.js` / deflector reflect) — element status through the ability's verb · `ability-attunements-w6-runtime` tests
- [x] BUILD tree DEFENSE cluster: ability-attunement nodes (unlock + one-active radio), `abilityAttunements` unlock category, `setPreRunAbilityAttune` seeding · commit

### W7 — Economy + balance + polish  🟡 PARTIAL (unlock-cost dial-up + README sweep shipped)
- [x] **Enemy weakness telegraph** — element-colored chevron **pip** above enemies (`weaknessElement`, `resist ≤ −0.3`, distinct from body tint, gentle pulse) + **damage-number effectiveness cue** (weakness = bigger/green/"WEAK"; resisted = small/grey) · 5 unit tests · commit (6.115.0)
- [ ] **Global efficacy cards (5th draft slot)** — §6 group B (conditional dmg) + C (handling/tradeoff) as GLOBAL powerups; `card-draft.js` → **1 primary + 1 power + 1 global + 2 ability**; damage-path consumers (Executioner already wired) · tests
- [ ] **Per-item unlock cost** refactor (flat, no signature/exotic; lets outliers like Spectrum Split price higher)
- [ ] Per-attunement VFX + tooltips
- [ ] **gold → Cores exchange** (W8 bridge sink; reroll/tier-up cost already scales with rarity × level)

### W8 — Endgame: Mastery + Ascension treadmill  (design doc §15.4)
- [ ] **Mastery tracks** — infinite per-item (weapon/attunement/mod/ability/ability-attunement) levels, exorbitant+exponential gold cost, small diminishing power; focused mastery = build identity
- [ ] ~~**Ascension**~~ — **FOLDED into Phase X** (Run Configurator & Difficulty). Player-chosen difficulty tiers above the first clear *are* Ascension: enemy HP/dmg/density + rising resistances scaling, higher item-level gear + more gold.
- [ ] **gold → Cores** sink + crafting costs scaling with rarity × item level (heavy top-end sink)
- [ ] Balance: ascension slightly outpaces *affordable* mastery (synergy/coverage/gear > brute grind); the weakness telegraph becomes the endgame skill layer

### Resolved (design doc §15)
- Draft = 1 primary + 1 power + 1 global + 2 ability · Ability attunements one-at-a-time · Flat per-item cost · Telegraph = pip + hit cue
- OQ-A slot budget: damage-split + cost are the limiters (no hard cap for now); OQ-B: even `dmg/N` (chosen)

---

## Phase P — Passive Skills (rule-modifier layer)  *(2026-05-24 · PLANNED)*

Source: `docs/Passive Skills & Run Difficulty — Design Plan – 2026-05-24.md`.
**3 gold-bought, slot-gated, mid-run-swappable gameplay-modifier passives** (rule-changers, not stat
increments). **Absorbs the unbuilt C.I3 traits + C.I4 keystones** into one unified `PASSIVES` registry
with multiple delivery channels (equip slot now; keystone card + top-tier item roll later).
**Open forks (see design doc §8) need sign-off before P1** — naming, trait-merge, swap rules,
slot-unlock timing.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| P1 | Registry + reconciliation: rename `PASSIVE_UPGRADES`→`STATS` + `PASSIVE_REWARD_IDS`→`STAT_CARD_IDS` (drop *both* "passive" and "upgrade"; they're Stats); new **shared** `PASSIVES` registry (`passive-data.js`) w/ hook metadata + tags + delivery flags (`slot`/`item`/`itemTierMin`/`stack`); add `passives` unlock category (`armory.js`) + `unlockedPassives` meta key | New registry + unlock category build green; stat rename has no behavior change; unit tests pin the split + delivery flags | - | ✅ 6.121.0 (rename + `getStats`; `combat/passive-data.js` w/ ~28-entry catalog + `getPassive`/`getSlotPassives`/`getItemPassives`; `passives` category, starters Opportunist+Last Bastion; `passives-registry` + renamed `stats-pool` tests) |
| P2 | Player state + apply pipeline: `equippedPassives[]` (len = maxSlots, cap **5**), `ownedPassives` Set, `activePassives` Set rebuilt on change, `hasPassive(id)`, `getPassiveMod(key)` folded into `getEffective*` getters, **keystone budget ≤2** | Equipping a passive flips its flag/modifier; getters read it like SP/items; unit test | P1 | ✅ 6.122.0 + 6.122.1 (`player/passives.js`: 5-slot array, equip/own/slot gating + rebuild + `hasPassive`/`getPassiveMod`/`equipPassive`/`setOwnedPassives`/`setPassiveSlotsUnlocked` + `KEYSTONE_BUDGET`=2 enforcement; `_passiveMod` folded into crit/maxHP/shield/regen getters; ownedPassives seeded at init; `passives-player` test) |
| P3 | Slot gating (round-3 §11.A): `maxSlots = 3 + floor(stages/30)` (cap **5**); slot 1 from start, the rest unlock **progressively** at evenly-spaced stage milestones via the wave-clear hook (`wave-manager.js` → `player.setPassiveSlotsUnlocked`). Pre-Phase-X default stages=10 → maxSlots 3. | Nth slot opens at the right stage clear; caps at maxSlots(stages); persists; unit test the threshold | P2, X1 | ✅ 6.123.0 (`maxPassiveSlots`/`passiveSlotsUnlockedAfter` in passive-data.js — unlock after stages 0/4/7 @10-stage, 0/20/40/60/80 @100-stage; wired at wave-manager stage-clear hook, reads runConfig.stages when X lands; slot-scaling tests in `passives-registry`) |
| P4 | Pre-run BUILD-tree **PASSIVES cluster** (account-gold unlock + pick into this run's chosen pool) + loadout carry (`loadout.passives` → `game-engine` init) | Buy/own passives; chosen pool carried into the run; QA BUILD-tree flow green | P1, P2 | ✅ 6.124.0 (new PASSIVES tab/cluster in shop-dom+static-dom; old PASSIVE tab → STATS; equip bubbles w/ slot badge + keystone ★/budget + cap; `setPreRunPassives`/`getPreRunPassives`/`_togglePassive`; `beginPreRunFromTree` carries `loadout.passives`, init equips into slots; QA-08f). NOTE: Continue-restore of equippedPassives/passiveSlotsUnlocked across reload TBD (save serialization — P5/save concern). |
| P5 | In-run **swap menu** (pause panel, reuses loadout rows): assign any owned passive to any *unlocked* slot at any time; ramping passives reset accrued state on swap (anti-cheese) | Mid-run swap works from pause; ramps reset on swap; QA green | P2, P4 | ✅ SHIPPED — **P5a CONTINUE-restore (6.124.1)** + **P5b in-run pause-menu PASSIVES tab (6.131.0)**: `ui-manager.updatePassivesTab()` swap panel — equip/unequip owned passives into unlocked slots mid-run via `player.equipPassive` (keystone budget + ramp-reset enforced); `static-dom` PASSIVES tab + CSS; QA-14 (5 tests). Completes the equip lifecycle (BUILD → slot-unlock → swap → CONTINUE). |
| P6 | Catalog **batch 1** (~10–12, one per archetype…) — each w/ a live consumer at its hook + unit test | Each shipped passive measurably changes play; at least 3 synergy clusters demonstrably stack; unit tests | P2 | 🟡 IN PROGRESS — full **~46-entry catalog data shipped** (§10 + §10.1, 6.125.0). **Effects batch 1 LIVE (6.125.0):** Glass Cannon (+60% dmg via `getPassiveDamageMult` on `applyDamageToEnemy` + −50% maxHP via `getPassiveMaxHpMult`), Opportunist (+15% vs status-afflicted), Last Bastion (+20% dodge <30% HP). Data-driven `damageMult`/`maxHpMult` fields. **Batch 2 LIVE (6.126.0):** Predator (first-hit-on-full-HP crit), Vampiric Rounds (crits heal 2 HP), Hoarder's Greed (+100% gold via `getGoldFindMultiplier` / +15% dmg-taken). **Batch 3 LIVE (6.127.0):** Overflow Spark (+25% primary at full energy), Failsafe (per-hit cap 50% maxHP + −15% maxHP), Second Heart (lethal save once/stage @30% HP). **Batch 4 LIVE (6.128.0):** Scavenger (+50% gear drop rate), Purist (+40% dmg / no crit). **Batch 5 LIVE (6.129.0):** Prismatic Soul (bullet element cycle), Catalyst (+50% reactions + extra shatter chain). **Batch 6 LIVE (6.130.0):** Killing Spree (×2 streak damage bonus). **Batch 7 LIVE (6.133.0):** Gunslinger (+50% primary dmg / +30% fire rate, disables power+abilities). **Batch 8 LIVE (6.134.0):** Hex Touch (+20% burn/bleed DoT). **Batch 9 LIVE (6.135.0):** Frostbite (freeze threshold −25%), Static Charge (every-5th-hit conduct zap). **Batch 10 LIVE (6.136.0):** Overkill (kill-excess splash to nearest), Ricochet (kill bounces 50% shot to nearest) — shared `_passiveKillSplash` one-hop helper. **Batch 11 LIVE (6.137.0):** Detonator (status-afflicted kill → 110px AoE burst + status spread, `_detonateStatuses`). **21 live.** **Remaining:** Harvest (status-DoT-kill bonus drops — hook enemy.js DoT-death branch @676), tempo/streak (Killing Spree/Slipstream/Siege/Frenzy), wild (Twin Cast/Gunslinger), misc (Guardian Echo/Reactive/Resonance/Kinetic Battery + Purist-pierce), element (Catalyst/Detonator/Prismatic Soul/Conductor…), tempo/streak (Killing Spree/Slipstream/Siege/Frenzy…), wild (Twin Cast/Gunslinger/Purist…). |
| P7 | **Gear-roll delivery** (folds C.I3; the keystone-CARD channel is DROPPED — passives aren't powerup cards): top-tier gear can roll a passive AFFIX — **modular on Exceptional+**, a **keystone only on Transcendental**. Item-system rolls it; equipped-item passives contribute to `activePassives` (binary = on) + `getPassiveMult`/`getPassiveMod` (additive) WITHOUT consuming a slot (§10 stacking) | A passive acquirable via a Transcendental/Exceptional+ gear roll, sharing the P6 consumers; binary gear+slot = no double | P6 | ✅ SHIPPED 6.132.0 — `item-system.eligibleItemPassives`/`rollItemPassive` (rarity-gated) sets `item.passive` in createItem; `_rebuildActivePassives` unions equipped-item passives (no slot); rebuild after equippedItems in applyPersistentProfile; `passives-gear` tests. **Passive SYSTEM COMPLETE.** |

## Phase X — Run Configurator & Difficulty Scaling  *(2026-05-24 · PLANNED)*

Source: `docs/Passive Skills & Run Difficulty — Design Plan – 2026-05-24.md` (**round-4 §12** — supersedes the round-3 chosen-tier model).
**MAJOR PIVOT (round-4):** difficulty is **AUTO-TUNED, not player-chosen.** The player picks only run
**length** (stages 10–100) + **waves/stage** (3/6/9) — a *commitment-for-reward* dial. `runConfig = {stages, wavesPerStage}`
(**no `difficulty` field**). An **Adaptive Difficulty Director** auto-tunes the challenge to the player + a
**procedural wave composer** randomizes each wave. **Replaces hardcoded `MAX_WAVES=30`.** Within a stage:
last wave = BOSS, other mult-of-3 = ELITE; **powerup-card pick every stage EXCEPT the last** (cards = stages−1).

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| X1 | `runConfig = {stages, wavesPerStage}` on `game` + save; replace `MAX_WAVES` reads (`constants.js`/`wave-*`/`game-engine`) with `stages×wavesPerStage`; **boss = last wave/stage, elite = other mult-of-3, powerup-card every stage EXCEPT last (cards = stages−1)**; `isStageClear`/run-complete read config | A 10-stage/3 and a 100-stage/9 run both run start→finish; bosses = stages; elite cadence correct; cards = stages−1; CONTINUE restores config; unit tests | - | cc:TODO |
| X2 | **Powerup-card pool layering** (§12.2): `card-draft.js buildDraft` falls back efficacy → **economy** (Cores/gold) so a 99-card run never runs dry; `CARDS_PER_RUN` derived = stages−1. (NOTE: passives are NOT powerup cards — the passive-card tier was dropped; cards are weapon/ability efficacy + economy only.) | A long run keeps serving meaningful cards after efficacy caps; unit test the fallback tiers | X1 | cc:TODO |
| X3 | **Reward dial** (§12.3): waves/stage reward multiplier (3→×1.0 / 6→×1.3 / 9→×1.6) on drop-rate/gold/rarity/Cores; stages → endurance curve (rarity ceiling + item level + gold rise with depth-reached). Reward keys off **achieved threat × performance**, not a chosen tier | Bigger run-shape = more/better loot; deep stages unlock top rarities; unit test the multipliers | X1 | cc:TODO |
| X4 | **Adaptive Difficulty Director** (§12.4a): per-run controller reading signals (dmg-taken/HP%, time-to-clear, DPS/overkill, near-death) → a challenge index vs a target HP-band; rate-limited knobs (enemy HP/dmg/toughness/resist/density/aggression; speeds clamped); slow upward baseline + player-power pre-load (card count/passives/gear level). Survives §11.D absolute curve as baseline | Director ramps when dominated, eases on death-spiral; baseline trends up; a 99-card late game stays lethal; unit-test the controller math | X1 | cc:TODO |
| X5 | **Procedural wave composer** (§12.4b): Director hands a threat budget/wave; composer spends it on a randomized roster + **wave themes** (swarm/artillery/armored/elemental-surge/ambush/mixed) + telegraphed **wave modifiers** (explode-on-death, fast-fragile, no-health-drops, shielded-anchor, bounty…); elites/bosses draw from the same budget. Replaces the static `WAVE_DATA[1..30]` loop | Waves are fresh each run, budget-tuned; themes/modifiers telegraphed; reaches wave 900 without replaying 1–30; smoke green | X4 | cc:TODO |
| X6 | **RUN SETUP** UI (pre-run / folded into BUILD→START, = Phase U U6): stages + waves/stage selectors with a live **reward-dial** readout (NOT a difficulty number); writes `runConfig`. Optional HUD **threat meter** (§12.4 open-q). Persist `peakThreatReached` meta (replaces `maxDifficultyCleared`) | Player sets length+waves/stage; readout matches reward scaling; START proceeds; QA green | X1, X3, U3 | cc:TODO |
| X7 | Balance pass: AI-survival on a short (10×3) and a long (100×9) run on a meta-progressed account; tune the Director's target band + baseline climb + reward curve; co-tune R-BAL1 | Both shapes winnable-but-non-trivial; Director holds the band; no runaway loot/HP | X4, X5 | cc:TODO |
