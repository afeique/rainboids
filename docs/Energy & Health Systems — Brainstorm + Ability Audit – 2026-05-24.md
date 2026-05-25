# Energy & Health Systems — Design Brainstorm + Ability/Attunement Audit
*2026-05-24 — for review. Nothing here is implemented; this is a design backlog.*

---

## ★ DECISIONS — locked direction (2026-05-24, refined w/ afeique)
*The agreed plan. The brainstorm sections below are the menu these were chosen from. **Implementation is on hold until this section is finalized.***

### ⭐ DESIGN PILLAR: No downsides — pure upside, depth via synergy (decided)
**Every stat, powerup, passive, and ability is ALL UPSIDE. No drawbacks, no inverse pressure, even at the risk of "overpowered."** The game's depth and difficulty come from:
1. **A tight equip economy** — only 4 ability slots, a small number of passive slots, finite SP, finite gold. You can't take everything, so *what you pick* is the decision.
2. **Synergy discovery** — the fun is finding combinations that multiply (e.g. crit → heal → damage-ramp). Builds, not gambles.
3. **Enemy/difficulty scaling tuned around a strong player** — the player is *meant* to feel powerful; the challenge is authored on top of that (more HP / density / mechanics), not by taxing the player's kit.

**This SUPERSEDES every downside currently in the game.** Remove the drawback clauses from:
- Keystones: GLASS_CANNON (−50% HP), GUNSLINGER (no powers/abilities), PURIST (can't crit), FRENZY (+30% taken), HOARDERS_GREED (+15% taken), FAILSAFE (−15% HP), TWIN_CAST (+30% energy cost), OVERFLOW_CAPACITOR (its rework downside — see below), EYE_OF_THE_STORM ("sitting target"), GRAVITY_WELL ("pulls danger to you"), HEAT_SINK (vent lockout).
- All powerup/ability drawbacks likewise.

**Honest implication:** keystones lose their risk/reward identity, so they must now differentiate by **what build they unlock** (magnitude + an enabling mechanic), not by a tax. The "fragility" of a glass-cannon playstyle is now **emergent from the equip economy** (you spent every slot on offense, none on defense) — *that* is the downside, self-imposed. **Glass Cannon (resolved): merge with Berserker's Pact** → "+40% damage, scaling up to +90% as HP falls" (pure upside; name stays literal; frees a keystone slot). Full keystone re-anchoring is in **Balance Model §6c**. **Net:** the player ramps to very strong; the design contract is that **enemy scaling + the adaptive system absorb it** (the load-bearing work item — see review R0 / Balance §6).

### Policy: Stats vs. Powerups — "complementary roles" (decided)
Both systems may touch the same axis, but they play **different roles**, and there are **no identical-flat duplicates**:
- **Stats (SP / meta)** = flat **baseline scalars**, always-on, account-wide. Home for: max HP, toughness, crit, dodge, speed, lifesteal %, **+ new: max energy, energy regen, energy efficiency, HP regen**.
- **Powerups / passives (per-run)** = **conditional / multiplicative / synergistic** effects layered on top; they must *reward* the stat, never copy it.
- **Why not identical duplicates:** they clog the per-run draft (the prime "make runs different" space), split identity, and double-dip the power budget. The "double-down" fantasy is served by **synergy** (stat + a conditional that amplifies it), not duplication.

**Action:** the duplicate powerups (Health / Toughness / Vampirism that copy a stat) are removed-or-reflavored into synergy effects (see below). *(Open Q3: full delete vs. reflavor — leaning reflavor so the pool doesn't shrink.)*

### Energy — add the missing investment axis (decided)
- **3 new SP stats:** **Capacitor** (+max energy /pt), **Reactor** (+energy regen /pt), **Efficiency** (−power cost /pt). Cap total cost-reduction across ALL sources (see risk R3).
- **New gear affixes:** `maxEnergy`, `energyRegen`, `energyCost`.
- **Energy powerups are SYNERGY, not flat dupes — the strong set:**
  - **Flux** — each power cast grants **+X% energy regen for 4s, stacking** (casting begets casting; a power-spam ramp).
  - **Overflow Discharge** — at full energy your **next power is FREE and +40%** (rewards holding/timing instead of wasting overcap).
  - **Resonant Surge** — applying an elemental status grants **+6 energy** (element builds fuel power builds — on-theme).
  - **Overclock** *(keystone)* — powers cost **0 energy but fire at ~60% effect on a flat ~2.5s internal cooldown** (no meter): a machine-gun-power build, total economy inversion.

### Health — add regen as a stat + great lifesteal synergies (decided)
- **New SP stat:** **Regeneration** (+HP/s passive; shares the 3.0 cap) — regen is currently only a powerup/affix, oddly absent from the SP grid.
- **Lifesteal cleanup → the "dive in, heal through it, get stronger" fantasy:**
  - Baseline stays the **Vampirism stat + gear affix**. **Remove the duplicate Vampirism powerup**, reborn as **Bloodshield** — **EVERY lifesteal heal feeds a Bloodshield buffer** (not just overheal — overheal is too rare to feel good). The Bloodshield **soaks damage FIRST** (ablative, in front of HP) and **decays over time** (~X/s), capped ~30–40% max HP. So sustained DPS keeps a self-replenishing shield up; you're always buffered while you're dishing damage. *(This is the headline lifesteal synergy — always-on, not conditional.)*
  - **Bloodlust** *(passive)* — each lifesteal heal adds a **stacking damage buff** (~+2%/stack to +30%, decays after 3s without healing). Heal → hurt → heal: an aggression flywheel.
  - **Sanguine Engine** *(keystone — pure upside)* — **every kill heals 4% max HP and overkill damage heals double.** (No orbs/regen disable — that's gone per the no-downsides pillar.) Turns the HP bar into a resource you refill by being lethal.
  - **Hemoglutton** *(passive)* — lifesteal is **×2 vs. status-afflicted enemies** (ties blood to the element game).
  - Keep **Vampiric Rounds** passive (flat crit-heal — distinct trigger).

### OVERFLOW_CAPACITOR — pure upside ✓ RESOLVED (revised by the no-downsides pillar)
- **2× energy regen, +50% max energy. No downside** (the −30%-primary idea is dropped — superseded by the no-downsides pillar). It's now simply *the* energy-build keystone: the power-caster identity comes from CHOOSING it + the energy stats + power weapons, not from a tax on your gun. (Still re-point OVERFLOW_SPARK to buff POWERS at full energy so it belongs in the same build — see R4.)

### FIELD_PROJECTOR — collapse the 4 fields → 1 ability (decided)
- One zone ability (radius ~200, ~5s, ~16s cd); **element chosen by attunement**: Pyro→burn, Cryo→freeze, Volt→shock, Void→heavy slow + pull (the old Stasis). Removes the samey CRYO_FIELD/STASIS_FIELD/STORM_CELL/PYRE_AURA quartet, **fills its BUILD ring** (4 attunements + upgrades), and **frees 3 ability slots** for new verbs.

### ELEMENTAL_INFUSION → reworked to "Attune" ✓ RESOLVED
- **Prismatic Soul** is *the* auto-cycler. **Elemental Infusion → "Attune"**: lock shots to ONE chosen element + amplify it (controllable single-element burst; complements Prismatic).

### SENTRY_DRONE — keep all 6 attunements + on-the-fly retune ✓ RESOLVED
- **Keep all 6 elemental attunements** — being the one power with *every* element IS its selling point (flexibility).
- **New mechanic — radial retune:** while the drone is deployed, pressing the ability key **opens the existing weapon-radial UI, populated with the drone's UNLOCKED attunements** (the same engineered radial used for weapon swaps — reuse it). Pick an element → the drone instantly retunes to it. Deploying is the cooldown cost; *re-tuning is free* and as fast as the radial. The only "micro-managed pet" in the kit; its power IS the on-the-fly flexibility.
- **NOT auto-weakness-targeting** (that would delete the element-matching decision the whole game is built on). Player-driven via the radial. Mobile already has the radial (long-press), so this works there natively.
- Also rework: drone prioritizes your aimed/marked target + gains fire rate per kill while deployed.

### Duplicate powerups → reflavor into synergy ✓ RESOLVED
- Don't delete (keeps the draft pool full). Reflavor each stat-duplicate powerup into a **conditional** sibling: Vampirism→**Bloodshield**; Health→e.g. **"Reinforced Hull"** (overheal banks a shield / +max HP *and* tanks fill faster); Toughness→e.g. **"Ablative Plating"** (first hit each wave fully blocked, recharges) — i.e. each becomes a *behavior*, not a number you could already buy with SP.

---

## 🏗 BUILD ARCHETYPES & SYNERGIES
*With downsides gone, the game becomes a synergy sandbox. These are the builds we want to **bank on** — each should be powerful, distinct, and obvious enough that a player goes "oh, THESE go together." Tune the listed pieces toward each build. A piece appearing in multiple builds is good (flexible glue). Loadout = 4 abilities + ~4 primary/power weapons + passive slots + SP stats + gear.*

### Synergy engines (the reusable loops everything plugs into)
These are the "verbs" builds are assembled from — design so each has multiple feeders + payoffs:
- **Kill → X:** heal (Sanguine Engine), max-HP shield, cut cooldowns (Flow State), streak damage (Killing Spree), energy (Flywheel), bounce shot (Ricochet), splash (Overkill), spread mark (Designator·Relay), detonate statuses (Detonator), drop energy/gold (Harvest).
- **Heal → X:** shield (Bloodshield), damage stacks (Bloodlust). *(Lifesteal is now a build engine, not just survival.)*
- **Status → X:** reaction damage (Catalyst), spread (Kindling), AoE on kill (Detonator), energy (Resonant Surge / Harvest), ×2 lifesteal (Hemoglutton), faster ticks (Conduit/Hex Touch).
- **Full energy → X:** free empowered cast (Overflow Discharge), +power damage (reworked Overflow Spark).
- **Cast power → X:** regen ramp (Flux), fires twice (Twin Cast), 3rd free (Resonance).
- **Dash → X:** energy (Kinetic Battery), firing clone (Afterimage), i-frame window, retaliate (Backlash on dodge).
- **Crit → X:** heal (Vampiric Rounds), guaranteed first-hit (Predator), ramp on target (Tracer Lock).
- **Stand still → X:** damage ramp (Siege), slow nearby (Eye of the Storm).

### The builds

**OFFENSE**
1. **Spellslinger (Energy Caster)** — *spam power weapons like a primary.*
   - Stats: Capacitor + Reactor + Efficiency. Passives: OVERFLOW_CAPACITOR, RESONANCE, Overflow-Spark(→powers), Flux. Abilities: Overcharge Core, Twin Cast(passive), Attune. Powers: cheap ones (Charge/Mine/Lightning) for uptime, or Overclock keystone for machine-gun powers.
   - Loop: cast → Flux ramps regen → status from the cast → Resonant Surge energy → cast again; at full, Overflow Discharge free+empowered. **Tune:** power-weapon damage must reward this (R1); make Charge/Lightning feel like a primary at high regen.
2. **Crit Assassin** — *delete priority targets in one burst.*
   - Stats: Crit Chance + Crit Damage + Speed. Passives: PREDATOR, Vampiric Rounds, TRACER_LOCK, OVERKILL. Abilities: Designator (mark = crit-enabler), Blink (reposition for fresh first-hits).
   - Loop: Blink to a fresh full-HP target → Predator guaranteed crit → Vampiric heal + Overkill splash → Tracer ramps the next. **Tune:** Designator marks should *guarantee* the next hit crits (turns "mark" into the assassin enabler).
3. **Glass Nuke (raw damage)** — *everything is a damage multiplier, stacked.*
   - Passives: GLASS_CANNON (now pure +60%), FRENZY (+8%/enemy), SIEGE (stand-still ramp), OPPORTUNIST (+vs afflicted). Stats: Crit/CritDmg. 
   - Loop: wade into a crowd (Frenzy) standing your ground (Siege) → multiplicative stack. **Tune:** ensure the mults compose (additive vs multiplicative matters — pick so it's exciting but enemy HP keeps pace).
4. **Streak Snowball (Tempo)** — *never stop killing; everything refreshes.*
   - Passives: KILLING_SPREE (streak ×2, no reset), FLOW_STATE (kills cut cooldowns), FRENZY. Abilities: any — they come back fast under Flow State.
   - Loop: kills → streak damage ↑ + ability cooldowns ↓ → more kills → abilities up nonstop. **Tune:** Flow State % so a good streak ≈ near-permanent ability uptime (feels amazing, the build's whole point).
5. **Status Reactionist (Elements)** — *the screen is on fire/frozen/poisoned and it all chains.*
   - Passives: CATALYST, DETONATOR, KINDLING, HEX_TOUCH, CONDUIT, HARVEST, Hemoglutton. Attunements: stack 2–3 elements per weapon. Abilities: Field Projector (zone status), Attune.
   - Loop: apply statuses → Catalyst amps reactions → kill → Detonator AoE → Harvest/Resonant energy → Field Projector for more. **Tune:** make reactions (shatter/flare) visually + numerically *big* so the build feels explosive.
6. **Freeze-Shatter** — *lock the room, shatter it.* FROSTBITE + CATALYST + DETONATOR; Cryo attunements + Field Projector(Cryo). Freeze → Pyro/Volt shatter → chain. **Tune:** shatter splash radius/damage.
7. **Volt Chain** — *one shot hits everything.* STATIC_CHARGE + CHAIN_REACTION + CONDUIT; Volt attunements + Field Projector(Volt) + Sentry(Volt chain-shot). **Tune:** chain count/falloff.
8. **DoT Plague (Burn/Toxic)** — *they die after you've moved on.* HEX_TOUCH + CONDUIT + KINDLING + Hemoglutton; Pyro/Toxic attunements + Pyre Field. Lifesteal feeds off ticks (Hemoglutton). **Tune:** tick damage + spread so DoT clears crowds.
9. **Projectile Trickster** — *bullets that pierce, bounce, and grow.* PURIST (pierce, now no anti-crit), RICOCHET, MOMENTUM_ROUNDS, TRACER_LOCK; ricochet/boomerang weapons. **Tune:** ricochet target-seeking + momentum ramp.

**SUSTAIN / BRUISER**
10. **Vampire Bruiser** — *dive in, heal through it, hit harder for healing.*
   - Stats: Vampirism + Health + Toughness. Passives: Bloodshield, Bloodlust, Sanguine Engine, Hemoglutton. Abilities: Bulwark, Nanite Swarm (new), Gravity Snare (group for lifesteal). Weapon: high-fire-rate primary (lifesteal uptime).
   - Loop: high RoF → constant lifesteal → Bloodshield always up + Bloodlust damage ramp → kills heal (Sanguine) → dive deeper. **Tune:** lifesteal % + Bloodshield decay so it's a *playstyle* (R2), not just safety.
11. **Bloodshield Fortress (Overheal Tank)** — *a wall of shields.* Bloodshield + Transfusion(overheal→shield) + Regeneration stat + Ablative Plating powerup + Toughness. Abilities: Bulwark, Deflector Orbs. **Tune:** shield magnitudes so you can face-tank a stage boss window.
12. **Regen Juggernaut** — *unkillable attrition.* Regeneration stat (maxed) + Toughness + Health + in-combat-regen powerup + Constitution (shorter gate). Abilities: Bulwark, Field Medic. **Tune:** the regen cap + in-combat fraction so it's viable but not infinite.

**SUMMON / CONTROL / MOBILITY**
13. **Swarm Commander (Summoner)** — *your pets fight; you dodge.* Abilities: Sentry Drone (radial-retune!), Decoy (new), Deflector Orbs, Nanite Swarm. Passives: AFTERIMAGE (dash clone fires), drone upgrades (Extra/Rapid/Caliber). **Tune:** drone damage + extra-drone scaling so a 2–3-drone board is a real DPS source; retune lets one Sentry cover all elements.
14. **Hit-and-Run (Mobility)** — *never stop moving; movement IS damage.* Stats: Speed + Dodge. Passives: KINETIC_BATTERY (dash→energy), AFTERIMAGE, ONE_WITH_THE_VOID (no-hit→dodge), BACKLASH (dodge→retaliate). Abilities: Blink, Phase Dash, EMP Pulse. **Tune:** dash energy refund + afterimage damage so dashing is offense, not just escape.
15. **Zone Controller** — *herd them, then delete the herd.* Passives: GRAVITY_WELL (pull to reticle), EYE_OF_THE_STORM (now pure-upside slow). Abilities: Gravity Snare, Field Projector, Designator, Nova-type powers. **Tune:** pull strength + field damage so grouping → AoE is satisfying.

**HYBRID GLUE**
16. **Conduit Caster (Element × Energy)** — *statuses fuel spells fuel statuses.* Resonant Surge + Harvest + OVERFLOW_CAPACITOR + element attunements + power weapons that apply statuses (Cryo Burst, Lightning). Loop: cast status-power → Resonant/Harvest energy → cast again. The bridge between #1 and #5.
17. **Reflect Bruiser (if THORNS reworked)** — *punish the swarm by being hit.* reworked THORNS (status-on-reflect) + GUARDIAN_ECHO + BACKLASH + Toughness + Bloodshield. **Tune:** thorns scaling + the reworked "thorns applies a status" so it's a *chosen* build, not a dead stat.

### Ability loadout combos (the 4-slot picks per build)
- **Spellslinger:** Overcharge Core · Attune · Field Projector · Designator
- **Vampire Bruiser:** Bulwark · Nanite Swarm · Gravity Snare · Field Medic
- **Crit Assassin:** Blink · Designator · Sentry Drone · Second Wind
- **Swarm Commander:** Sentry Drone · Decoy · Deflector Orbs · Nanite Swarm
- **Hit-and-Run:** Blink · Phase Dash · EMP Pulse · Gravity Snare
- **Zone Controller:** Gravity Snare · Field Projector · Designator · Bulwark

### Ability tuning principles (no downsides → tune for the build it anchors)
- Every ability should **anchor at least one build** and **glue into 2–3 others.** If an ability anchors nothing, rework it (this is what flagged the elemental fields → FIELD_PROJECTOR).
- **Designator** → make marks *crit-enable* + *detonate-on-death* (anchors Assassin + Reactionist). **Second Wind** → on cast, immediate offense buff (fun to press, not just insurance — anchors aggressive Assassin). **Bulwark** → the universal dive-enabler (glues every bruiser). **Sentry** → the only summon, radial-retune is its identity (anchors Swarm). **Field Projector** → the element-build zone (anchors Reactionist/Freeze/Volt). **Blink/Phase Dash** → mobility glue + Afterimage/Kinetic synergy.
- Backfill the 3 freed slots (from collapsing the fields) with **Nanite Swarm**, **Decoy**, **Overcharge Core** — each anchors a build above (Bruiser, Swarm, Spellslinger).

---

## ⚠ Honest review — risks, weaknesses & unaddressed gaps
*Reviewed through the lens: "every stat / powerup / ability should be powerful and interesting enough that the player WANTS to use it, or at least try it." The above is exciting on paper; here's where it can fall flat.*

- **R0 — (now THE dependency) Enemy/difficulty scaling is the real work item the no-downsides pillar creates.** With every drawback removed, the player ramps to *very* strong by design. That's fine — but the game only stays a *game* if enemy HP / damage / density / mechanics are re-authored to meet a buffed player across the whole curve (early game especially, where a few stacked upsides can trivialize things). **This is no longer optional polish — it's the load-bearing companion task.** Concretely: re-tune wave/stage scaling and boss budgets *after* the kit changes land, and expect a dedicated balance pass. Also: removing downsides removes the cheapest balancing lever, so future tuning must come from numbers + enemy design, not player taxes.
- **R1 — Energy investment is decoration unless power weapons are a viable CARRY.** Capacitor/Reactor/Efficiency, the affixes, Flux/Overflow/Overclock, the OVERFLOW_CAPACITOR keystone — *all* of it assumes power weapons are worth building a whole identity around. If a primary build simply out-DPSes a full energy build, nobody touches any of it. **Action: tune power-weapon damage/feel so an energy build measurably out-performs in its niche BEFORE shipping the energy axis.** This is the load-bearing assumption.
- **R2 — Tanking must be a real, fun playstyle, not just insurance.** Bloodshield / Bloodlust / Sanguine Engine / Regeneration sell "dive in and heal through it." In a dodge-centric bullet-hell that only works if combat lets you *trade hits profitably* — i.e. there's a survivable-with-sustain damage band and enemies that reward bruising in. If everything either misses or chunks you, sustain is a safety net, not a build. **Action: confirm/author a "bruiser" encounter profile so health investment is a strategy.**
- **R3 — Energy cost-reduction can stack to "free."** Efficiency stat + OVERFLOW_CAPACITOR + Resonance + Overclock + `energyCost` affixes could drive cost to ~0 → infinite power spam. **Cap total %-cost-reduction (~50%)**; keep true "free casts" as deliberate exceptions (Resonance's every-3rd, Overclock's tradeoff), never a stackable permanent state.
- **R4 — OVERFLOW_SPARK is now anti-synergistic.** It buffs *primary* damage at full energy, but the energy keystone (OVERFLOW_CAPACITOR) gives −30% primary. A power-caster won't want a primary buff. **Re-point OVERFLOW_SPARK to buff POWER damage / fire-rate at full energy** so it lives in the energy-build space its name implies.
- **R5 — Some abilities are "useful but not fun to press."** DESIGNATOR (mark) and SECOND_WIND (death-save) are utility/insurance, not satisfying activations. **Give them active juice:** marked enemies drop bonus energy/heal on death (and detonate statuses); Second Wind grants an immediate offense buff on cast so popping it feels good *before* you'd have died.
- **R6 — THORNS stat is a likely dead pick.** Reflecting 25% of damage taken rewards *getting hit* — anti-synergy with dodge/toughness, and a dodge game minimizes hits. **Rework into a deliberate verb:** thorns also ignites/statuses attackers, or emits a knockback nova on hit, so it anchors a "punish-the-swarm" build instead of being a scalar nobody allocates.
- **R7 — The 60+ powerup pool has dead weight.** "Every powerup desirable" is currently false — e.g. **seven** heal-drop micro-modifiers (FIELD_RATIONS / TRIAGE_SURGE / COMBAT_MEDIC / SALVAGE_PLATING / TRIAGE_NET / …) and the out-of-combat-only REGEN (0.5/s, ~useless in a fast fight). **Action: a dedicated pick-rate/quality audit** — consolidate the heal-drop modifiers to 1–2 meaningful ones, replace REGEN with the new Regeneration stat + an *in-combat* regen powerup, cut/merge the bottom quartile.
- **R8 — Synergies are invisible.** All this conditional design dies if the player can't SEE the combos — nobody tries Bloodlust if nothing says it pairs with the Vampirism stat. **Action: tooltips that name synergistic partners; BUILD tree visually grouping related nodes.** This is what converts "small random effect" into "ooh, I want that with my build."
- **R9 — SP-grid dilution.** +4 stats on a ~100-SP cap: verify the budget still lets a build *max* an axis and feel it, rather than spreading thin so every point feels marginal. (Build-dependent stats like energy are fine — they're "off" for non-power builds — but check the math.)
- **R10 — Don't leave the 3 freed ability slots empty.** Collapsing the fields frees slots; backfill with distinct verbs from the abilities doc (Grapple Line, Mirror Wall, Overcharge Core, Nanite Swarm, Decoy) or the roster *shrinks* — the opposite of "more to try."

**Two things we haven't addressed that R1/R4/R7 depend on:** (a) **primary vs. power weapon balance** (the energy axis rides on it), and (b) a **powerup pick-rate audit**. Recommend sequencing those alongside (or just before) the energy implementation.

---

## Current state (the numbers to design against)

**Energy meter** (`player.js`, `weapons.js`)
- `maxEnergy = 100`; passive regen fills empty→full in **12s** (≈8.33/s), always on (not combat-gated).
- Power costs (`POWER_ENERGY_COST`): Charge Shot 20 · Mine 25 · Lightning 30 · Cryo Burst 40 · Nova 45 · Overdrive 45 · Prism 50 · Missiles 55 · Lance 60 · Singularity 60 · Orbital 65.
- Modifiers today: **OVERFLOW_CAPACITOR** (2× regen, +50% max, but power cost ×1.5), **RESONANCE** (every 3rd cast free), **KINETIC_BATTERY** (dash refunds 20), **OVERFLOW_SPARK** (+25% primary dmg at full), **TWIN_CAST** (cost ×1.3), **CHARGE_SPEED** (Charge Shot charge-time only).
- **Gap: NO SP stat and NO gear affix touch energy.** The whole "invest in energy" axis is missing.

**Health** (`player.js`, `progression.js`)
- `maxHealth = 40`, base shield **15% DR**, up to 3 health **tanks** (overheal banks).
- Passive regen is **out-of-combat only** (4s no-damage gate, cap **3.0 HP/s**), sourced from the REGEN powerup (0.5/s/stack) + `regen` gear affix (0.3/s/pt). **Innate combat regen = 0.**
- Heal/sustain: FIELD_MEDIC (45% burst + cleanse, 22s), health orbs (wave-scaled, ×2 cap), VAMPIRISM (5% lifesteal — stat *and* powerup), VAMPIRIC_ROUNDS (2 HP/crit), HOARDERS_GREED (1 HP/gold orb), COMBAT_MEDIC, FIELD_RATIONS, etc.
- Death-saves: SECOND_HEART (passive), SECOND_WIND (ability), GUARDIAN (powerup). Damage cap: FAILSAFE.

**Stats (SP, 8):** Crit Chance, Crit Damage, Health (+35 HP), Toughness (+8% DR, cap 75%), Vampirism (5% lifesteal), Thorns, Evasion, Speed. **No energy stat; no regen stat.**

**Gear affixes (16):** hp, toughness, vampirism, thorns, critChance, critDamage, dodge, speed, regen, +6 element resists. **No energy affix.**

---

## 1. ENERGY meter — new traits & ideas

The cleanest framing: energy has three levers — **capacity** (max), **regen** (fill rate), **economy** (cost per cast) — plus **burst** (instant gain). Spread ideas across all four so builds can specialize.

### 1a. SP stats (new)
- **Capacitor** — +15% max energy per point (maxStacks ~5 → +75%). Mirrors HEALTH_BOOST as the energy analog.
- **Reactor** — +12% energy regen per point (maxStacks ~5). The "fire power weapons more often" stat.
- *(optional)* **Efficiency** — −6% power-weapon energy cost per point (cap ~−40%, maxStacks ~5). High-value, so cap it.

### 1b. Gear affixes (new — fills the "no energy affix" gap)
- `maxEnergy` — +N max energy (flat, wave-scaled like `hp`).
- `energyRegen` — +N% regen.
- `energyCost` — −N% power cost (rare, capped per item).
- Rationale: energy gear lets a power-weapon build itemize for it, exactly like `regen`/`vampirism` do for survivability.

### 1c. Passives (new)
- **Overclock** *(keystone)* — power weapons cost 0 energy, but they only fire at, say, 50% effect / on a flat internal cooldown instead of a meter. Inverts the whole economy for a build.
- **Flywheel** — kills grant +4 energy (small, additive, stacks). Turns clear-speed into power uptime.
- **Capacitor Bank** — energy can overcharge to 150%; the overcharge decays but powers fired from it deal +25%.
- **Cold Boot** — start each wave at full energy + a free first cast.
- **Conduit Tap** *(synergy)* — landing an elemental status refunds 2 energy (ties energy to the element game).
- **Discharge** — when energy hits full, auto-emit a small free nova (turns "wasted overcap" into value).
- **Frugal Casting** — every cast that *doesn't* empty the meter refunds 10% of its cost.

### 1d. Powerups (run-pickups)
- **Energy Cell** — +20 max energy per stack (the powerup analog of the Capacitor stat).
- **Fast Charge** — +15% regen per stack (analog of Reactor).
- **Power Siphon** — picking up a gold orb grants +5 energy.
- **Surge Battery** (1-stack) — first power weapon each wave is free.

### 1e. Abilities (new, energy-themed)
- **Overcharge Core** — instantly fill the energy meter (or grant +60), short cooldown. The "I need a power shot NOW" button. *(also listed in the abilities brainstorm doc)*
- **Energy Vent** — dump all current energy into a damage burst scaled by the amount spent (high-risk dump).
- **Siphon Beam** — channel a beam that drains energy from… nothing, but converts overcap to a shield.

### 1f. Items / loot traits (gear set-style)
- A **"Reactor Core" gear theme**: items that roll `maxEnergy`/`energyRegen` and, at high rarity, a passive like "powers cost 1 less per stack."
- **Transcendental energy affix**: "−20% power cost" as a chase roll (mirrors how top-tier gear can roll a passive).

---

## 2. HEALTH — new traits & ideas

Currently health is **burst-heal + orbs + out-of-combat trickle + lifesteal**. The missing axes: **in-combat passive regen**, **overheal→buffer**, **scaling/conditional heals**, and **defensive uptime that isn't a death-save**.

### 2a. SP stats (new)
- **Regeneration** — +0.4 HP/s passive regen per point (maxStacks ~5 → +2.0/s, sharing the 3.0 cap). The SP analog of the REGEN powerup; today regen is *only* a powerup/affix, oddly absent from the SP grid.
- **Constitution** *(optional)* — shortens the out-of-combat regen gate (4s → 2s) and/or lets a fraction of regen tick *in* combat.

### 2b. Gear affixes (new)
- `lifeOnKill` — +N HP per kill (flat). A different sustain curve than %-lifesteal (rewards clear speed, not big hits).
- `overheal` — overheal converts to a temporary shield buffer (caps at N% max HP).

### 2c. Passives (new)
- **Bloodletter** — lifesteal also applies to status-tick damage (not just direct hits) — ties health to the element game.
- **Second Wind (passive form)** — out-of-combat regen is **doubled** and ignores the 3.0 cap.
- **Transfusion** — overheal banks as a shield instead of a tank; the shield blocks one hit.
- **Adrenal Surge** — dropping below 30% HP triggers a one-time 20% heal (per stage), cooldown-gated.
- **Sanguine Engine** *(keystone)* — you have **no passive regen and no orbs heal**, but every kill heals 3% max HP. All-in on aggression-sustain.
- **Bulwark Plating** — a slow-recharging 1-hit "plate" that absorbs the next hit fully (recharges after Xs out of combat) — sustain via mitigation, not HP.
- **Leech Field** — nearby dying enemies leak healing motes toward you.

### 2d. Powerups (new)
- **Regenerator** — +0.5 HP/s **in combat** (small, separate cap) — the first true in-combat trickle.
- **Lifedrain Rounds** — hits heal 1% of damage (the powerup analog so non-passive builds get lifesteal).
- **Nanite Cloud** (1-stack) — after a kill, drop a small healing zone.

### 2e. Abilities (new)
- **Nanite Swarm** — a healing cloud that follows you, mending + cleansing over its duration (vs. FIELD_MEDIC's instant burst). *(also in the abilities brainstorm doc)*
- **Sacrifice** — spend 20% current HP to massively buff damage for 5s (risk/reward).
- **Last Light** — channel: stand still to regen fast, but can't move while channeling.

---

## 3. Audit — excessive / redundant / unlikely-to-be-used

### 3a. Genuine redundancies (recommend consolidating)
- **Lifesteal exists 4 ways**: VAMPIRISM stat (5%), VAMPIRISM powerup (5% — *identical*), VAMPIRIC_ROUNDS passive (2 HP/crit), `vampirism` gear affix (2%/pt). The stat and powerup are the **same effect from two systems** — confusing. *Recommend:* keep lifesteal as the **stat + gear affix**; repurpose the VAMPIRISM *powerup* into something distinct (e.g., the new **Lifedrain Rounds**), and keep VAMPIRIC_ROUNDS as the crit-specific flavor.
- **HEALTH_BOOST and SHIELD_BOOST each exist as BOTH a stat card and a powerup** with identical effects. Pick one home per effect (stat grid for permanent investment; powerups for run variety) so they don't double-dip / confuse.

### 3b. Overlapping / samey content
- **The four elemental field abilities — CRYO_FIELD, STASIS_FIELD, STORM_CELL, PYRE_AURA** — are nearly identical in shape (deploy a ~180–210px zone, 5s, 16–18s cd) differing only by element/status, and **all four have empty BUILD rings** (no attunements/upgrades). Risk: they feel like one ability painted four colors and several will go unpicked. *Recommend:* either (a) give each a distinct mechanic + upgrades (see the abilities-brainstorm doc), or (b) collapse to **one "Field Projector" ability** whose element is chosen by attunement — freeing 3 ability slots for more distinct verbs.
- **ELEMENTAL_INFUSION (ability) vs PRISMATIC_SOUL (keystone passive)** both "cycle your shots through elements." Overlap. *Recommend:* differentiate — make Infusion a *single locked* element of choice (burst, controllable) vs. Prismatic's auto-cycle.
- **Three death-saves** — SECOND_HEART (passive), SECOND_WIND (ability), GUARDIAN (powerup). Different cadences (per-stage / per-cast / per-wave), so not strictly redundant, but stacking all three is likely overkill; consider a shared "you may only carry one death-save" rule or making them clearly tiered.

### 3c. Possibly-weak / confusing (re-examine numbers)
- **OVERFLOW_CAPACITOR** — "2× regen, +50% max" but "power cost ×1.5." The cost penalty largely cancels the regen/capacity gain (you fill faster but each cast costs more), so the net uptime gain is murky and it reads as a downside-heavy keystone. *Recommend:* drop the cost penalty and find the balance via the keystone slot opportunity-cost, OR change the downside to something orthogonal (e.g., "−15% primary damage").
- **Expensive powers vs. no energy investment** — Orbital 65 / Singularity 60 / Lance 60 against a 12s full-fill means ~7–8s between casts with *no way to invest* in faster energy (no stat/affix). This makes the priciest powers feel bad on most builds. The energy stats/affixes in §1 directly fix this; until then, those powers are arguably **under-supported**, not excessive.
- **SENTRY_DRONE's 6 attunements (one per element)** is the most of any ability — likely several are rarely chosen. The "one attunement per element" pattern generates breadth but low per-option pick-rate. *Recommend:* trim abilities to **2–3 signature attunements** that meaningfully change the verb, rather than a full elemental sweep, except where all six clearly matter.

### 3d. Net recommendations (priority order)
1. **Add the energy SP stats + gear affixes** (§1a–b) — biggest gap; unlocks the whole power-weapon-investment fantasy and rescues the expensive powers.
2. **Add a Regeneration SP stat** (§2a) — regen is conspicuously absent from the SP grid.
3. **De-duplicate lifesteal & the stat/powerup doubles** (§3a).
4. **Differentiate or consolidate the four elemental fields** (§3b) — fills empty rings or frees slots.
5. **Re-examine OVERFLOW_CAPACITOR's downside** (§3c).

---

## Implementation notes (when greenlit)
- New SP stats: add to `STATS` (weapon-data.js) + the SP-allocation grid; energy stats need new player getters (`getEffectiveMaxEnergy`, `getEffectiveEnergyRegen`, `getPowerEnergyCost` already exists for the cost lever).
- New gear affixes: add to `ITEM_AFFIX_POOL` + `AFFIX_SCORE_WEIGHT` (item-names.js) and a `getItemAffixTotal('maxEnergy')`-style read in the energy getters.
- New passives: `PASSIVES` (passive-data.js) + effect hooks + an icon slug.
- Energy regen already flows through one place (`progression.js` energy tick) — easy to multiply by a regen stat; max energy reads `this.maxEnergy` everywhere, so a `getEffectiveMaxEnergy()` indirection is the clean refactor.
