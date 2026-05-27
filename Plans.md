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
- [ ] **T20** 🔴 Unlock everything + remove milestone gift; loadout lists all [T21]
- [ ] **T22** 🔴 Remove card draft + powerup picks (powerups→weapon traits) [T21]
- [ ] **T23** 🔴 Eliminate Cores → salvage to R$; crafting costs in R$ [T21]
### Phase 1 — progression + PWR
- [ ] **T24** 🔴 Per-run level/SP + migration (banked→R$)
- [ ] **T25** 🟡 PWR recompute: level-scaled inputs + THORNS/SPEED + recompute on level-up [T03,T24]
### Phase 2 — gear, matrices, income, crafting wiring
- [ ] **T26** 🔴 Gear amplification into effective-stat getters (`amplifySP`) [T03,T24]
- [ ] **T27** 🔴 Gear roll + crafting wired into inventory/GEAR [T11,T13]
- [ ] **T28** 🔴 Matrix integration (sockets + amp + resonance into getters) [T12,T26]
- [ ] **T29** 🔴 Income into drops/pickup (wave/difficulty/streak/find) [T01,T21]
### Phase 3 — weapons as loot
- [ ] **T30** 🔴 Weapon-as-loot core: archetypes + traits stamp bullets + weapon level-scaling [T04,T10]
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
