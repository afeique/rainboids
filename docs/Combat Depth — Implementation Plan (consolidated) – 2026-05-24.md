# Combat Depth — Consolidated Implementation Plan
*2026-05-24 — the build instructions for the no-downsides / energy-health / builds / adaptive-difficulty work designed across the three 05-24 brainstorm docs (Energy & Health, Ability Attunements & New Abilities, Balance Model). **Review before dispatch — nothing is built yet.***

Source-of-truth design docs (read for the *why*; this doc is the *how*):
- `Energy & Health Systems — Brainstorm + Ability Audit` (decisions, builds, no-downsides pillar)
- `Ability Attunements & New Abilities — Brainstorm` (§5 tuned ability numbers)
- `Balance Model — Build Math, Enemy Tuning & Adaptive Difficulty` (§4 tuned values, §6/6b adaptive, §8–10 fun-tuned numbers)

---

## 0. Governing contract (applies to every task)
1. **No downsides.** Every stat/powerup/passive/ability is pure upside. Delete all drawback clauses. Depth = the tight equip economy (4 abilities, limited passive slots, finite SP/gold) + synergy.
2. **Difficulty lives in the Adaptive Director + enemy scaling**, not in player taxes. (Phase 5.)
3. **Stats vs powerups = complementary roles:** stats are flat baseline scalars; powerups/passives are conditional/synergistic. No identical-flat duplicates.
4. **Numbers come from the Balance Model** (§4/§8/§10). Where a value is unspecified, use the JND rule (≥10–15% per increment) and round.

## How to use this doc (parallelism model)
- **One owner per file.** Tasks are grouped so a single subagent owns a file (or a tight cluster) end-to-end — two agents must never edit the same file concurrently. Each task lists **FILES (owned)**, **DOES**, **DEPENDS ON**, **PARALLEL-SAFE WITH**, **ACCEPTANCE**, **VERSION**.
- **Dispatch a phase's tasks together** (they touch disjoint files), then gate the next phase on the listed dependencies.
- ⚠ **Active-conflict files:** `js/modules/combat/collision-system.js` and `js/modules/enemy/enemy.js` are under live edit by the **boss-phases** work. Tasks touching them (T9, T17) must be **sequenced after that lands or coordinated** — do not dispatch them blind.
- **Versioning (per `CLAUDE.md`):** each task is its own solo semver bump + CHANGELOG entry. Suggested bump noted per task. Don't auto-commit.

---

## 1. Build sequence (dependency graph)
```
PHASE 0  Foundation DATA (4 tasks, fully parallel — disjoint files)
            T1 weapon-data  · T2 passive-data · T3 item-names · T4 powerup
                                   │ (ids/fields now exist)
PHASE 1  PLAYER MECHANICS           ▼
            T5 player.js (getters/state)  ──► then parallel: T6 weapons · T7 progression · T8 lifecycle · T9 collision⚠
                                   │
PHASE 2  ABILITIES                  ▼  (needs T1 ability data + T5 state)
            T10 abilities.js · T11 shop-dom (rings/synergy tooltips) · T12 radial (sentry)
                                   │
PHASE 3  STATS/UI SURFACING         ▼  (needs T1/T2/T3 data)
            T13 sp-allocation · T14 icons · T15 Threat-Level UI (new)
                                   │
PHASE 4  ADAPTIVE DIFFICULTY        ▼
            T16 difficulty-director (NEW, parallel anytime) ──► T17 wave integration⚠ · T18 wave-data HP re-tune
                                   │
PHASE 5  BALANCE / TELEMETRY / TUNE ▼  (last — needs everything live)
            T19 telemetry · T20 playtest tuning pass
```
**Rationale:** data before mechanics before UI; abilities depend on their data; the Director is an orthogonal new module that can be *written* anytime but *integrated + tuned* last (it needs the live kit to tune against). Enemy HP re-tune and the tuning pass come last so they target the finished player power curve.

---

## 2. Task breakdown

### PHASE 0 — Foundation data (parallel)

**T1 — Stats + Abilities + Attunements + Upgrades data**
- **FILES:** `js/modules/combat/weapon-data.js` (STATS, ABILITIES, ABILITY_ATTUNEMENTS/`_ABILITY_ATTUNE_SPEC`, ABILITY_UPGRADES). Reconcile with `js/modules/combat/defense-data.js` if any stat defs live there.
- **DOES:**
  - **STATS:** add **Capacitor** (+15%/pt ×5 max energy), **Reactor** (+12%/pt ×5 regen), **Efficiency** (−6%/pt ×5 cost), **Regeneration** (+0.4/pt ×5 HP/s). Bump **Crit Damage** +15→**+20%/pt** (→320%), **Health** +35→**+40/pt**. Mark **Thorns** for rework (see Refinement R-THORNS) — change to 30%/pt + status-on-reflect flag.
  - **ABILITIES:** **collapse** CRYO_FIELD/STASIS_FIELD/STORM_CELL/PYRE_AURA → one **FIELD_PROJECTOR** (cd 16s, r220, 5s); **rework** ELEMENTAL_INFUSION → **Attune** (cd14s, 8s, lock 1 element +25% +1 status); **add** Overcharge Core (cd20s), Nanite Swarm (cd20s, 6s), Decoy (cd16s, 5s). Keep SENTRY_DRONE. Numbers from Abilities §5.
  - **ABILITY_ATTUNEMENTS:** add FIELD_PROJECTOR's 4 element attunements (Pyro/Cryo/Volt/Void); keep SENTRY's 6; remove the 4 dead field abilities' entries; add the BLINK/GRAVITY_SNARE/DESIGNATOR/SECOND_WIND upgrade-set hooks.
  - **ABILITY_UPGRADES:** add upgrade sets for BLINK, GRAVITY_SNARE, DESIGNATOR, SECOND_WIND, FIELD_PROJECTOR, and the new abilities (fills empty BUILD rings) — lists in Abilities §2/§5. Designator/Second-Wind reworks per §5.
  - Remove any downside fields anywhere in this file.
- **DEPENDS ON:** none. **PARALLEL-SAFE WITH:** T2, T3, T4. **VERSION:** MINOR (new stats/abilities).
- **ACCEPTANCE:** all new ids resolve; no dangling references to removed field abilities; unit test for STATS/ABILITIES shape.

**T2 — Passives (no downsides + new synergy passives)**
- **FILES:** `js/modules/combat/passive-data.js`.
- **DOES:**
  - **Remove every downside clause** (GLASS_CANNON −50%HP, FRENZY/HOARDERS +taken, FAILSAFE −15%HP, PURIST no-crit, GUNSLINGER slot-lock, TWIN_CAST +30%cost, EYE_OF_THE_STORM, GRAVITY_WELL, HEAT_SINK lockout). Re-anchor each per Balance §6c.
  - **Merge** GLASS_CANNON + BERSERKERS_PACT → "+40% dmg, →+90% as HP falls"; **free a keystone slot** → add the new keystone (R-KEYSTONE).
  - **Add** Bloodshield, Bloodlust, Sanguine Engine (pure, no orbs/regen disable), Hemoglutton, Overclock (keystone), Capacitor Bank. **Rework** OVERFLOW_CAPACITOR (pure 2×regen/+50%max), OVERFLOW_SPARK (→ +power dmg at full, R4).
  - Add a **`synergies: [ids]`** field to every passive (R-SYNERGY); add `icon` for new passives (coordinate slugs with T14).
- **DEPENDS ON:** none. **PARALLEL-SAFE WITH:** T1, T3, T4. **VERSION:** MINOR.
- **ACCEPTANCE:** no `downside`/`maxHpMult<1` clauses remain; passives unit test (ids + hooks + synergies present).

**T3 — Gear affixes (energy + health traits)**
- **FILES:** `js/modules/world/item-names.js` (ITEM_AFFIX_POOL, AFFIX_SCORE_WEIGHT). Maybe `world/item-system.js` for the read.
- **DOES:** add `maxEnergy` (+8/pt), `energyRegen` (+3%/pt), `energyCost` (−2%/pt, feeds the −50% cap), `lifeOnKill` (+HP/kill), `overheal` (overheal→shield). Add score weights. 
- **DEPENDS ON:** none. **PARALLEL-SAFE WITH:** T1, T2, T4. **VERSION:** MINOR.
- **ACCEPTANCE:** affixes roll + display; item-tier unit test updated.

**T4 — Powerups (reflavor dupes + new synergy powerups + de-bloat)**
- **FILES:** `js/modules/world/powerup.js`.
- **DOES:**
  - **Reflavor stat-duplicates:** Vampirism powerup → **Bloodshield**; Health → **Reinforced Hull** (overheal→shield + tanks fill faster); Toughness → **Ablative Plating** (first hit/wave fully blocked, recharges).
  - **Add synergy powerups:** Flux, Overflow Discharge, Resonant Surge, Surge Battery (energy); Regenerator (in-combat +0.5/s, raises regen cap to 5), Life-on-Kill, Sanguine Rounds.
  - **Remove all downsides.** **Consolidate** the 7 heal-drop micro-modifiers (FIELD_RATIONS/TRIAGE_SURGE/COMBAT_MEDIC/SALVAGE_PLATING/TRIAGE_NET/…) → **1–2 meaningful ones** (R7). Replace the out-of-combat-only REGEN with Regenerator.
  - Add `synergies: [ids]` (R-SYNERGY).
- **DEPENDS ON:** none. **PARALLEL-SAFE WITH:** T1–T3. **VERSION:** MINOR.

### PHASE 1 — Player mechanics

**T5 — Energy/health getters + Bloodshield/Bloodlust state** *(do first in this phase — others read its getters)*
- **FILES:** `js/modules/player/player.js`.
- **DOES:** `getEffectiveMaxEnergy()` (base ×(1+Capacitor)×OVERFLOW + maxEnergy affix), `getEffectiveEnergyRegen()` (Reactor + energyRegen affix + OVERFLOW), update `getPowerEnergyCost()` to apply Efficiency + the **−50% global cost cap** (R3). Add **Bloodshield** buffer state (accumulate on any lifesteal, decay 2.5%/s, cap 35% maxHP, expose `soakDamage()`), **Bloodlust** stack state (+2%/heal, cap +30%, 3s decay), Regeneration into the regen path.
- **DEPENDS ON:** T1 (stat ids), T2 (passive ids). **PARALLEL-SAFE WITH:** — (gates T6/T7/T8/T9). **VERSION:** MINOR.

**T6 — Power-weapon damage pipeline + cost** 
- **FILES:** `js/modules/player/weapons.js`.
- **DOES:** **R1 — route power-weapon damage through the player outgoing-damage path** (apply `getPassiveDamageMult` + crit, like primaries) so energy builds scale with the kit; apply Efficiency + cost cap via T5's `getPowerEnergyCost`; implement **Overclock** keystone path (powers on a flat cooldown, no meter). 
- **DEPENDS ON:** T5, T1/T2. **PARALLEL-SAFE WITH:** T7, T8, (T9 if no overlap). **VERSION:** MINOR.

**T7 — Regen + energy tick**
- **FILES:** `js/modules/player/progression.js`.
- **DOES:** `getEffectiveRegen()` += Regeneration stat; raise cap to 5 when Regenerator powerup held; energy tick uses `getEffectiveEnergyRegen()`.
- **DEPENDS ON:** T5. **PARALLEL-SAFE WITH:** T6, T8, T9. **VERSION:** PATCH/MINOR.

**T8 — takeDamage: Bloodshield soak + global per-hit cap + remove taxes**
- **FILES:** `js/modules/player/lifecycle.js`.
- **DOES:** Bloodshield soaks **before** HP; implement the **global per-hit cap = 45% current max HP** (generalize FAILSAFE into a system rule, R-CAP); **remove** HOARDERS_GREED/FRENZY damage-taken multipliers (no downsides); keep dodge→shield→resist order.
- **DEPENDS ON:** T5 (Bloodshield state), T2. **PARALLEL-SAFE WITH:** T6, T7. **VERSION:** MINOR.

**T9 — applyDamageToEnemy: Bloodlust/Hemoglutton/Sanguine/Designator + Sentry targeting** ⚠
- **FILES:** `js/modules/combat/collision-system.js` *(⚠ boss-phases conflict — sequence/coordinate)*.
- **DOES:** add Bloodlust outgoing mult; Hemoglutton (lifesteal ×2 vs status); Sanguine on-kill heal (4%, overkill ×2); route lifesteal to feed Bloodshield (T5); Designator marked-enemy +20% + auto-crit + detonate-on-death; Sentry aim/mark targeting + per-kill fire-rate. Remove any downside taxes here.
- **DEPENDS ON:** T5, T1/T2; **boss-phases landing.** **PARALLEL-SAFE WITH:** T6/T7/T8 (different file) but **NOT** with boss-phases edits. **VERSION:** MINOR.

### PHASE 2 — Abilities

**T10 — Ability effects (FIELD_PROJECTOR, Attune, Sentry retune, new abilities, reworks)**
- **FILES:** `js/modules/player/abilities.js` (+ effect spawns; coordinate any collision/effect hooks with T9).
- **DOES:** implement FIELD_PROJECTOR zone + per-element behavior (Abilities §5); Attune; **Sentry retune via radial** (consumes the radial selection) + targeting; Designator/Second-Wind reworks; Overcharge Core / Nanite Swarm / Decoy. 
- **DEPENDS ON:** T1 (ability data), T5. **PARALLEL-SAFE WITH:** T11, T12. **VERSION:** MINOR.

**T11 — BUILD tree: DEFENSE upgrade rings + synergy tooltips**
- **FILES:** `js/modules/shop/shop-dom.js`.
- **DOES:** **route ABILITY_UPGRADES into the DEFENSE ring** as orbiting upgrade bubbles (the empty-ring fix — confirm tree sources upgrades, not just attunements); render **`synergies`** in node tooltips ("Synergizes with: …", R-SYNERGY) + optional connecting glow.
- **DEPENDS ON:** T1, T2/T4 (synergy fields). **PARALLEL-SAFE WITH:** T10, T12. **VERSION:** MINOR.

**T12 — Sentry radial input**
- **FILES:** `js/modules/ui/radial-menu.js` (+ input-handler hook).
- **DOES:** while Sentry deployed, ability key opens the radial populated with the drone's **unlocked attunements**; selection calls into T10's retune. Mobile = long-press (existing).
- **DEPENDS ON:** T10. **PARALLEL-SAFE WITH:** T11. **VERSION:** PATCH.

### PHASE 3 — Stats / UI surfacing

**T13 — SP grid: new stats**
- **FILES:** `js/modules/ui/sp-allocation.js` (+ stats-overlay if needed).
- **DOES:** surface Capacitor/Reactor/Efficiency/Regeneration in the SP-allocation UI with icons + per-point text.
- **DEPENDS ON:** T1. **PARALLEL-SAFE WITH:** T14, T15. **VERSION:** PATCH.

**T14 — Icons for new content**
- **FILES:** `js/modules/ui/icons.js`.
- **DOES:** add slugs for the new stats (energy/regen), abilities (field-projector, attune, overcharge, nanite, decoy), passives (bloodshield, bloodlust, sanguine, hemoglutton, overclock). Coordinate names with T1/T2/T13.
- **DEPENDS ON:** none (additive). **PARALLEL-SAFE WITH:** all. **VERSION:** PATCH.

**T15 — Threat-Level UI** *(see R-THREATUI spec)*
- **FILES:** new `js/modules/hud/threat-level.js` + a draw call in the HUD (`hud/combat.js` or `overlays.js`); CSS only if DOM.
- **DEPENDS ON:** T16 (`director.getThreatLevel()`). **PARALLEL-SAFE WITH:** T13, T14. **VERSION:** MINOR.

### PHASE 4 — Adaptive difficulty

**T16 — Difficulty Director (NEW, pure, unit-testable)**
- **FILES:** new `js/modules/wave/difficulty-director.js` + `tests/unit/difficulty-director.test.js`.
- **DOES:** implement the controller from Balance §6b/§8: composite `Po`/`Pd` (EMA α0.4), `D_hp`∈[0.6,3.0], `D_thr`∈[0.6,1.8], deadband ±12%, ≤12%/wave rate-limit, cold-start (D=1 waves 1–2), cross-term mastery gate, mercy/escalation band, `getThreatLevel()` (1–5). Pure functions in/out (signals→D); no DOM. Targets: wave 35s, trash TTK 0.7s, HP-retained 60%, per-hit cap 45%.
- **DEPENDS ON:** none (orthogonal). **PARALLEL-SAFE WITH:** everything. **VERSION:** MINOR.

**T17 — Wave integration (apply D + feed signals)** ⚠
- **FILES:** `js/modules/wave/wave-manager.js`, `js/modules/wave/wave-data.js` *(⚠ enemy.js touch — boss-phases conflict)*.
- **DOES:** feed per-wave signals (clear-time, DPS-on-target, HP-retained, hits-survived) to the Director; apply `D_hp` to enemy HP×count×elite-injection (with density ceiling), `D_thr` to enemy damage/bullet-density/cadence (with the per-hit cap); boss-lock D at spawn.
- **DEPENDS ON:** T16. **PARALLEL-SAFE WITH:** T18 (different concern, same-ish files — assign one owner for wave/*). **VERSION:** MINOR.

**T18 — Enemy HP re-tune for the designed build**
- **FILES:** `js/modules/wave/wave-data.js` (scaling formula).
- **DOES:** retune `getLevelScaledEnemyStats` HP curve so a *designed* build hits the target trash-TTK/wave-time (Balance §5/§8); the Director multiplies on top.
- **DEPENDS ON:** T16/T17 conceptually; **owner = same agent as T17** (shared file). **VERSION:** PATCH (tuning).

### PHASE 5 — Balance / telemetry / tuning (last)
**T19 — Telemetry:** log Po/Pd/D + per-wave outcomes (hook into the existing fun-score tooling under `tools/`). VERSION: PATCH.
**T20 — Playtest tuning pass:** run the AI playtester + manual at the extremes (god/min/tank/glass builds); tune D bounds, enemy HP, stat values. VERSION: PATCH(es).

---

## 3. Refinements (concrete specs — each maps to a task)

### R-THORNS — Thorns rework (→ T1 data + T8/T9 effect)
*Problem: +25%/stack reflect rewards getting hit → dead pick in a dodge game.* **Rework into the Reflect-Bruiser anchor (pure upside):**
- **Thorns stat:** reflect **30%/pt ×4 (→120%)**; reflected damage **applies your most-recently-used element's status** to the attacker.
- **New passive "Retribution Field"** (the build engine): taking a hit emits a **retaliating nova** — radius `90 + 15×ThornsStacks`, damage `1.5 × reflected`. Stacks with the reflect.
- **Why it works now:** with no-downside EHP stacking (Bloodshield/Regen/Toughness), *deliberately* tanking hits to reflect+nova+status is a viable **aggressive-tank** playstyle. Pairs with GUARDIAN_ECHO + BACKLASH + Bloodshield. Getting hit is *fuel you built for*, not punishment.
- **Effect sites:** reflect+status in `lifecycle.js takeDamage` (T8); nova spawn in `collision-system.js`/effects (T9).

### R-THREATUI — Threat-Level UI (→ T15)
- **Data:** `director.getThreatLevel()` → **1–5**, from `(D_hp_norm + D_thr_norm)/2` bucketed.
- **Render:** a row of **5 chevron pips** by the wave/stage indicator (top-center). Filled = current; **color ramp cool→hot** (cyan 1 → gold 3 → red 5). Canvas-drawn in the HUD (matches existing canvas HUD), respects the menu-font system only if DOM.
- **Behavior:** updates at **wave start**; on **increase**, brief pulse + a small **"THREAT ↑"** toast; on mercy-decrease, a subtler "THREAT ↓". Desktop tooltip / settings blurb: *"Scales to your power — stronger builds face a higher threat."*
- **A11y:** optional numeric label; never the *only* channel.

### R-SYNERGY — Synergy discoverability (→ data fields in T1/T2/T4, render in T11)
- Add **`synergies: [ids]`** to STATS/PASSIVES/POWERUPS. BUILD-tree (and pause) tooltips append **"Synergizes with: A, B."** Optional: a faint connecting line/glow between a hovered node and its listed partners. *Without this, the conditional/synergy design is invisible and goes unused (Balance R8).*

### R-KEYSTONE — Fill the freed keystone slot (→ T2)
Glass Cannon+Berserker merge frees one keystone. Candidates (pick 1, all pure-upside):
- **Cataclysm** — every 20th kill triggers a screen-wide damage pulse (tempo/clear fantasy).
- **Singularity Heart** — kills leave a brief damaging gravity-well that pulls + ticks (zone/element synergy).
- **Apex Predator** — your damage executes enemies below 15% HP instantly (anchors crit/assassin; very "fun to feel"). **← recommended** (clean, build-defining, pairs with Crit Assassin).

### R-CAP — Centralize caps (→ T5/T8 + a constants home)
One place defining the caps so they can't drift: toughness 75%, dodge 50%, **energy cost-reduction 50%** (R3), regen 3.0/s (5.0 with Regenerator), Bloodshield 35% maxHP, per-hit 45% maxHP. Put in `core/constants.js` and read everywhere.

### R-POWERPIPE — Power damage through the pipeline (→ T6)
*The load-bearing R1 fix.* Power weapons currently deal raw per-hit damage that doesn't ride the build. Route power damage through the same outgoing-mult + crit path as primaries (in `weapons.js` fire paths / `applyDamageToEnemy`), so energy builds scale with crit/passives and the whole energy axis pays off. Verify whether powers already hit `applyDamageToEnemy` (assumption flagged in Balance §7).

### R-SPARK — OVERFLOW_SPARK retarget (→ T2)
Change from "+25% **primary** damage at full energy" to "+25% **power** damage at full energy" so it belongs in the energy build (it was anti-synergistic with the power-caster identity).

### R-OVERCLOCK — Overclock as a mode, not a downside (→ T2/T6)
Overclock = "powers fire on a flat ~2.5s cooldown at ~60% effect, ignoring the meter." Frame as an **alternate economy** (a *choice*, neither pro nor con) for a machine-gun-power build, not a drawback. Gate the global "free cast" so Efficiency+affixes can't reach free *without* it (R-CAP).

### R-INCOMBAT-REGEN — (→ T4/T7)
Replace the weak out-of-combat-only REGEN powerup with **Regenerator** (+0.5/s **in combat**, raises the regen cap to 5.0/s) so regen builds are viable mid-fight, not just in lulls.

### R-MERCY-FEEL — Adaptive mercy/escalation feel (→ T16)
Mercy: ≥2 deaths/tank-pops on a wave → ease both axes ~20% next wave, decaying back. Escalation: full-HP clear in <60% target time → bump D_hp (and D_thr only if Pd also high). Keep the player in the "challenged but winning" channel; ~70% of adaptation rides D_hp/count (power-fantasy outlet).

### R-MOBILE — Mobile parity (→ T12/T15)
Sentry radial = long-press (existing radial). Threat UI scales with the (already-shipped) menu/HUD layout. Confirm the Director's "DPS-on-target" signal works with mobile auto-fire.

---

## 4. Out of scope for THIS plan (separate tracks — listed so nothing's lost)
These open backlog items are real but **not** part of the combat-depth/no-downsides build; track separately:
- **W7/W8** (Weapon Element Identity): global efficacy-card slot, per-item unlock cost, per-attunement VFX, gold→Cores; Mastery + Ascension treadmill.
- **Phase X1–X3, X6, X7** (Run Configurator, etc.) — *X4 Director / X5 wave-composer are subsumed by T16/T17 here.*
- **D.B0 remainder + D.B1–B5** (boss healthbar UI, hit-routing, intro/death FX, the 10 bosses) — **owns collision-system.js/enemy.js right now** (the T9/T17 conflict).
- **A.E8 remaining enemy types / A.E9 uniqueness / A.E10 flourishes.**
- **B.S4** (loadout-assign UI) — *B.S5 new skills are subsumed by T1/T10 new abilities here.*
- **C.I2** (resist-roll display). **R2.4-full, R7.4, R8.7, R8.9** (R-BAL1 ≈ Phase 5 here). **Rust/Bevy port** (parked).

## 5. Testing & acceptance (cross-cutting)
- **Unit:** STATS/ABILITIES/PASSIVES shape tests (T1/T2); affix tests (T3); **difficulty-director.test.js** (T16 — assert deadband, bounds, cross-term, cold-start, mercy).
- **QA (Playwright):** BUILD-tree renders new rings + synergy tooltips (T11); SP grid shows new stats (T13); Sentry radial opens with attunements (T12); Threat UI renders (T15); no fatal errors through a full run.
- **Balance:** T20 AI-playtester runs at the 4 extreme profiles (Balance §9/§10) → verify wave-time/near-miss targets; tune.
- **No-regression:** the existing 900+ unit + QA suites stay green after each phase.
