# Weapon Element Identity & Meta-Progression — Design Plan

**Date:** 2026-05-23
**Status:** DRAFT v2 — for review before implementation (supersedes the v1 mutually-exclusive draft)
**Builds on:** *Element & Resistance System — Implementation Plan (2026-05-22)*, *Arsenal & Combat-Depth Expansion (2026-05-22)*, Phase R roguelite restructure.

---

## 1. Vision & locked rules

Split progression into a deliberate **upfront build** plus an **in-run efficacy ratchet**:

- **Meta-progression (the grind):** spend **account-gold** to permanently unlock weapons, their **unique upgrades** (attunements + mechanic mods), abilities, and ability upgrades.
- **Pre-run build (the identity):** from what you've unlocked, assemble your loadout — pick weapons, **stack attunements + mechanic mods onto them**, pick abilities + their upgrades. This + gear **is your build**, locked when the run starts.
- **In-run cards (the ratchet):** draft **efficacy-only** powerups (more/faster/bigger/harder of what you already brought). No elements, no new mechanics.

### Locked rules (settled with the user)

1. **Base weapons are element-agnostic** (KINETIC). Elements come *only* from unique upgrades.
2. **Three upgrade categories** (defined in §4):
   - **Attunements** — add an element + element-flavored behavior. *Upfront.*
   - **Mechanic Mods** — add/transform a behavior (pierce, explode, home, stun-proc, weapon-specific capstones), element-agnostic. *Upfront.*
   - **Efficacy Cards** — pure amplifiers (damage, fire rate, size, counts, radius, cooldown…). *In-run draft only.*
3. **Elements STACK.** A weapon can carry multiple attunements. **Drawback: damage divides evenly across active elements** — focus vs coverage (§4.4). This is the load-bearing balance rule.
4. **Everything build-defining is chosen UPFRONT.** Cards never add elements or mechanics.
5. **All unlocks are permanent** (account-gold). No re-buying weapons each run.
6. **Costs dialed way up** — unlocks are long-term goals.
7. **Cards = 1 primary + 1 power + 2 ability** per draft.
8. **Gear stays a separate screen**, launched from the same pre-run hub.

---

## 2. Current state (what we build on)

### Economy (Phase R)
- **Two gold pools** (`armory.js`): `run-gold` (per-run, banks into account-gold at run end) and `account-gold` (persistent, spent on permanent unlocks).
- **Current unlock costs:** primaries 1200, powers 2000, abilities 3500.
- **Loadout:** `LOADOUT_SLOTS = 4` per category. `BASE_LOADOUT = { primaries:[PULSE_CANNON], powers:[CHARGE_SHOT], abilities:[BULWARK, FIELD_MEDIC] }`.

### Screens
- **ARMORY** (`armory-overlay.js`) — pre-run flat-list store. **Replaced** by the repurposed tree.
- **Bubble tree** (`#shop-tree` in `static-dom.js`, rendered by `shop-dom.js`) — Diablo-style 4-cluster visual (PRIMARY/POWER/DEFENSE/PASSIVE); each weapon = a parent node with orbiting upgrade nodes; tab strip + floating tooltip. **Repurposed as the pre-run build hub.**
- **LOADOUT** (`loadout-overlay.js`) — per-run equip picker (≤4/category).

### Upgrades & cards
- `PRIMARY_UPGRADES` / `POWER_UPGRADES` / `ABILITY_UPGRADES` (`weapon-data.js`) already mix efficacy (MULTI/RAPID/BIG, class amps like FLECHETTE/SHOCKWAVE/BEAM_WIDTH) and mechanics (PIERCING/EXPLODE/HOMING/STUN/KNOCK + capstones like DAISY_CHAIN/REFRACTION/MEIOSIS). **The reclassification work is mostly sorting existing IDs into the three buckets + adding attunements.**
- `card-draft.js` — drafts at stage-clears, currently 2 weapon + 1 ability, filtered to loadout.

### Element system (built, dormant on primaries)
- `elements.js`: 7 elements, each a signature status + resist/weakness multiplier (weakness up to +100%).
- Status helpers (`combat-manager.js`): `applyBurn`, `applyChill`/`applyFreeze`, `applyConduct`, `applyCorrode`, `applyBleed`, `applyMark`, `applyStun`.
- On-hit: `applyWeaponElementStatus()` reads `bullet.element`.
- Reactions: **SHATTER** (frozen + ≥6 dmg → AoE re-freeze), **OIL FLARE** (oiled + PYRO → AoE burn).
- **Runtime override exists:** `ELEMENTAL_INFUSION` → `player._infusedElement` → `weapons.js:1048`. The build-chosen attunements are a persistent, *multi-element* version of this.

---

## 3. The new model

### 3.1 Flow

```
  (meta)  earn account-gold → permanently UNLOCK weapons / attunements / mods / abilities
  (prerun)  TITLE → BUILD (bubble tree) → [GEAR screen ↔] → LOADOUT → RUN
  (inrun)   card drafts: 1 primary + 1 power + 2 ability — EFFICACY ONLY
```

- **BUILD hub** = the repurposed `#shop-tree`. Header shows **account-gold**; relabel `UPGRADES` → **ARSENAL/BUILD**.
  - Parent weapon node = the **unlock** (buyable, high cost).
  - Orbiting nodes = that weapon's **Attunements + Mechanic Mods** (each a permanent unlock).
  - DEFENSE cluster = ability unlock + its upgrades. PASSIVE cluster stays read-only.
- **GEAR** stays a separate screen, reachable by a button/tab from BUILD.
- **LOADOUT** = equip ≤4/category, and for each equipped weapon toggle which **owned attunements + mods** are active this run (this is where stacking is assembled).
- **In-run** = efficacy cards only; no tree access mid-run.

### 3.2 Two things "owning" vs "equipping"

- **Own** (permanent): you've bought the weapon/attunement/mod with account-gold. It's in your collection forever.
- **Equip/slot** (per run, free): in LOADOUT you choose which owned weapons go in your 4 slots and which owned attunements/mods are active on each. *Optional:* a per-weapon **slot budget** could cap how many attunements/mods you can run at once (§13 OQ-A) — otherwise the damage-split + unlock cost are the only limiters.

---

## 4. The three upgrade categories (definitions)

### 4.1 Attunements (upfront, stackable)
Add an **element** + an element-flavored **behavior** expressed through the weapon's verb. Stackable across elements (damage splits, §4.4). Full per-weapon list in §5; folded into the per-weapon sheets in §7.

> **Terminology:** these are **Attunements** — *not* to be confused with **Cores**, which is the established gear-crafting/salvage currency (`js/modules/world/cores.js`). The two are unrelated; "Cores" stays reserved for itemization.

### 4.2 Mechanic Mods (upfront, element-agnostic)
Add or transform a **behavior** without an element. The generic set (offered where it fits):
- **Piercing** — projectile passes through enemies.
- **Explosive** — AoE blast on impact.
- **Homing** — projectile seeks the nearest enemy.
- **Stun Proc** — % chance to stun on hit.
- **Knockback Proc** — % chance to knock back on hit.

Plus **weapon-specific mechanic capstones** (mostly existing IDs): Meiosis, Charged Caroms, Razor Edge, Implosion, Proximity Fuse, Daisy Chain, Seeker Missiles, Cluster Warhead, Double Pulse, Chain Reaction, Aftershock, Refraction, Overload, Event Horizon, Prism Seek, Orbital Barrage, Afterburn, etc.

### 4.3 Efficacy Cards (in-run, draftable)
Pure amplifiers — the §6 catalog. Filtered per weapon to what's coherent.

### 4.4 The stacking drawback — **damage divides per element**

> A weapon's per-hit damage is **split evenly across its active elements.** Each portion applies that element's own resist/weakness multiplier and its own signature status.

- **0 attunements** → 100% KINETIC (no resist quirks; reliable baseline — KINETIC stays a real choice).
- **1 attunement** → 100% that element: full focused damage, full weakness burst, strong single status. *The single-target / boss build.*
- **2–3 attunements** → damage split 1/2, 1/3…: weaker per element, but applies multiple statuses, near-guaranteed to hit *some* weakness, and can't be hard-walled by one resistance. *The crowd / mixed-wave build.*
- **Prism's Spectrum Split** → all 6 at once: maximum coverage, minimum per-element punch — the natural extreme, self-balanced, and opt-in as a Prism mechanic upgrade so you spend a slot to choose it.

**Net:** stacking trades focus for coverage. Crazily strong against mixed/resistant waves; weaker than a focused build against a single fat target. Not a strict upgrade → balanced.

---

## 5. Attunements — full list (stackable; damage splits per §4.4)

Signature = the element that best fits the weapon (for already-elemental weapons, "stay native, enhanced").

### Primaries
- **Pulse Cannon** (6): Tracer Ignition (PYRO), Frost Lock (CRYO), Arc Coupler (VOLT), Hollow-Point Venom (TOXIC), Phase Rounds (RADIANT), Gravlock Rounds (VOID).
- **Storm Needles** (4): Venom Weave (TOXIC, sig), Ember Hail (PYRO), Static Mesh (VOLT), Glaciate (CRYO).
- **Scatter Shot** (5): Dragon's Breath (PYRO, sig), Cryo Choke (CRYO), Caustic Spray (TOXIC), Tesla Shells (VOLT), Slug Converter (RADIANT).
- **Rail Driver** (5): Lance of Dawn (RADIANT, sig), Absolute Zero (CRYO), Railgun Capacitor (VOLT), Disintegration Scar (TOXIC), Singularity Round (VOID).
- **Cluster Launcher** (4): Napalm Cluster (PYRO, sig), Cryo Cluster (CRYO), Toxic Cluster (TOXIC), Singularity Charge (VOID).
- **Mitosis Rounds** (5): Viral Split (TOXIC, sig), Spark Mitosis (VOLT), Cryo Cells (CRYO), Phosphor Cells (PYRO), Mitogen Surge (VOID).
- **Caroms** (4): Chain Conductor (VOLT, sig), Ember Bounce (PYRO), Cryo Carom (CRYO), Hunter's Carom (VOID).
- **Boomerang Discs** (5): Frost Disc (CRYO, sig), Cinder Disc (PYRO), Corroding Edge (TOXIC), Tesla Disc (VOLT), Event Disc (VOID).
- **Spin Cannon** (3): Overheat Coil (PYRO, sig), Storm Spool (VOLT), Cryo Barrel (CRYO).
- **Flak Cannon** (4): Incendiary Burst (PYRO, sig), Cryo Burst (CRYO), EMP Burst (VOLT), Gas Burst (TOXIC).
- **Gravity Lance** (4): Event Horizon Rounds (VOID, sig), Accretion Burn (PYRO), Cryo Well (CRYO), Charged Singularity (VOLT).

### Powers
- **Charge Shot** (4): Plasma Lance (RADIANT), Fireball (PYRO), Glacial Spike (CRYO), Thunderhead (VOLT).
- **Seeker Mines** (4): Incendiary (PYRO), Cryo (CRYO), Tesla (VOLT), Toxic (TOXIC).
- **Nova Blast** (4): Static Nova (VOLT, sig), Plasma Nova (RADIANT), Frost Nova (CRYO), Gravity Nova (VOID).
- **Missile Salvo** (4): Thermite (PYRO), Cryo (CRYO), Corrosive (TOXIC), Singularity (VOID).
- **Lance Beam** (4): Solar Lance (RADIANT, sig), Flamethrower Sweep (PYRO), Frostbeam (CRYO), Disintegration Beam (TOXIC).
- **Arc Lightning** (4): Tesla Cascade (VOLT, sig), Plasma Arc (RADIANT), Cryo Arc (CRYO), Ignition Arc (PYRO).
- **Singularity** (4): Event Horizon (VOID, sig), Hellpit (PYRO), Absolute Cold (CRYO), Plasma Collapse (RADIANT).
- **Prism Beam** (4 + Spectrum): Spectrum Split (all-element, sig — see §4.4), Chromatic Burn (PYRO), Refractive Freeze (CRYO), Focused Prism (RADIANT single-beam).
- **Orbital Strike** (4): Hellfire Column (PYRO), Glacial Column (CRYO), Ion Cannon (VOLT), Acid Rain (TOXIC).
- **Cryo Burst** (3): Absolute Zero (CRYO, sig), Frostfire (PYRO+CRYO), Static Frost (VOLT).
- **Overdrive** (4): Pyro / Cryo / Volt / Toxic Overdrive — lends the element to your equipped primary while active (temporarily overrides the primary's own attunements).

*(Behavior descriptions for each attunement are in the brainstorm history; condensed here for the sheet. They reuse existing status helpers — burn pools, freeze, conduct, mark, shatter.)*

---

## 6. Efficacy card catalog (in-run draft)

Filtered per weapon/ability to what's coherent. The **borderline set is deferred** (per the user, not included yet — see §13 OQ-E).

### A. Weapon — universal
1. **Caliber Up** — +% damage
2. **Overclock** — +% fire rate
3. **Velocity** — +% projectile speed
4. **Big Bore** — +% projectile size
5. **Split Fire** — +1 projectile per shot
6. **Keen Edge** — +crit chance
7. **Lethality** — +crit damage
8. **Long Barrel** — +range / projectile lifetime

### B. Weapon — conditional damage
9. **Point-Blank** — +dmg to nearby enemies
10. **Marksman** — +dmg to distant enemies
11. **Executioner** — +dmg to low-HP enemies
12. **Opening Strike** — first hit on a fresh target +dmg
13. **Giant Slayer** — +dmg vs elites/bosses
14. **Cull the Weak** — +dmg vs basic/small enemies
15. **Momentum** — +dmg while moving
16. **Adrenaline** — +dmg & fire rate while low HP
17. **Cold Blood** — +dmg while undamaged for N seconds

### C. Weapon — handling & tradeoffs
18. **Trigger Discipline** — +fire rate while undamaged
19. **Steady Aim** — −spread (spread weapons)
20. **Stabilizers** — −spread growth during sustained fire
21. **Light Frame** — +speed & range, −size *(tradeoff)*
22. **Heavy Frame** — +size & knockback, −speed *(tradeoff)*
23. **Hot Loads** — +damage, −fire rate *(tradeoff)*
24. **Hair Trigger** — +fire rate, −damage *(tradeoff)*

### D. Weapon — class amplifiers (boost INNATE behavior only; auto-filtered)
25. **Extra Pellet / Needle** (Scatter / Storm)
26. **More Bounces** (Caroms)
27. **More Shards** (Mitosis)
28. **More Shrapnel** (Flak)
29. **Stronger Pull** — +pull radius/strength (Gravity Lance)
30. **More Bomblets** (Cluster)
31. **Long Throw** — +distance/return speed (Boomerang)
32. **Beam Width** (Lance / Prism)
33. **Beam Duration** (beams)
34. **Bigger Blast** — +blast radius/damage (Nova/Cluster/Flak/Orbital/Cryo Burst)
35. **Extra Mine** (Mine Layer)
36. **Extra Missile** (Missile Salvo)
37. **Extra Ray** (Prism)
38. **Fast Charge** (Charge Shot)
39. **Fast Spool** (Spin Cannon)
40. **Quick Cooldown** — −cooldown (cooldown-based powers)

### E. Ability — universal
41. **Recharge** — −% cooldown
42. **Endurance** — +duration (timed abilities)
43. **Potency** — +effect magnitude (heal %, damage-reduction %, slow %, stun length…)
44. **Quick Cast** — faster activation / less self-stagger

### F. Ability — class-specific (auto-filtered)
45. **Wide Band** — +radius (EMP, Cryo/Stasis/Storm/Pyre fields, Snare, Designator)
46. **Extra Orb** (Deflector Orbs)
47. **Hardened** — +hits per orb (Deflector Orbs)
48. **Extra Drone** (Sentry Drone)
49. **Rapid Servos** — −drone fire interval (Sentry)
50. **Heavy Caliber** — +drone damage (Sentry)
51. **Reach** — +pull/effect range (Snare, Designator)
52. **Lingering Field** — field zones persist longer after you leave

---

## 7. FINALIZED per-weapon upgrade sheets

Each weapon: **Base element = none (KINETIC).** Existing upgrade IDs are sorted into the new buckets (E = becomes efficacy card, M = becomes upfront mechanic mod); **Attunements** are new upfront unlocks.

### PRIMARIES

**Pulse Cannon** — versatile chassis
- **Attunements (6):** Tracer Ignition (PYRO), Frost Lock (CRYO), Arc Coupler (VOLT), Hollow-Point Venom (TOXIC), Phase Rounds (RADIANT), Gravlock Rounds (VOID)
- **Mechanic Mods:** Piercing `PULSE_PIERCING`, Explosive `PULSE_EXPLODE`, Homing `PULSE_HOMING`, Stun `PULSE_STUN`, Knockback `PULSE_KNOCK`
- **Efficacy cards:** Caliber, Overclock, Velocity, Big Bore, Split Fire (`PULSE_MULTI`), Keen Edge, Lethality, Long Barrel + conditional/handling

**Storm Needles** — status-stacker
- **Attunements (4):** Venom Weave (TOXIC), Ember Hail (PYRO), Static Mesh (VOLT), Glaciate (CRYO)
- **Mechanic Mods:** Piercing `NEEDLE_PIERCING`, Explosive `NEEDLE_EXPLODE`, Homing `NEEDLE_HOMING`, Stun `NEEDLE_STUN`, Knockback `NEEDLE_KNOCK`
- **Efficacy cards:** Caliber, Overclock, Big Bore, Split Fire (`NEEDLE_MULTI`), Extra Needle, Steady Aim, conditional dmg

**Scatter Shot** — point-blank burst
- **Attunements (5):** Dragon's Breath (PYRO), Cryo Choke (CRYO), Caustic Spray (TOXIC), Tesla Shells (VOLT), Slug Converter (RADIANT)
- **Mechanic Mods:** Piercing `SCATTER_PIERCING`, Explosive `SCATTER_EXPLODE`, Homing `SCATTER_HOMING`, Stun `SCATTER_STUN`, Knockback `SCATTER_KNOCK`
- **Efficacy cards:** Caliber, Overclock, Big Bore, Extra Pellet (`SCATTER_MULTI`), Steady Aim/Choke, Point-Blank, Heavy Frame

**Rail Driver** — heavy pierce line (innate pierce 99)
- **Attunements (5):** Lance of Dawn (RADIANT), Absolute Zero (CRYO), Railgun Capacitor (VOLT), Disintegration Scar (TOXIC), Singularity Round (VOID)
- **Mechanic Mods:** Explosive `RAIL_EXPLODE`, Homing `RAIL_HOMING`, Stun `RAIL_STUN`, Knockback `RAIL_KNOCK` *(pierce innate)*
- **Efficacy cards:** Caliber, Overclock, Big Bore, Twin Rail (`RAIL_MULTI`), Giant Slayer, Marksman, Hot Loads

**Cluster Launcher** — lobbed area denial
- **Attunements (4):** Napalm Cluster (PYRO), Cryo Cluster (CRYO), Toxic Cluster (TOXIC), Singularity Charge (VOID)
- **Mechanic Mods:** Stun `CLUSTER_STUN`, Knockback `CLUSTER_KNOCK`, *(new)* Sticky Payload
- **Efficacy cards:** Caliber, Extra Bomb (`CLUSTER_MULTI`), More Bomblets, Bigger Blast, Fast Charge

**Mitosis Rounds** — split-on-kill cascade
- **Attunements (5):** Viral Split (TOXIC), Spark Mitosis (VOLT), Cryo Cells (CRYO), Phosphor Cells (PYRO), Mitogen Surge (VOID)
- **Mechanic Mods:** Homing `SPLITTER_HOMING`, Stun `SPLITTER_STUN`, Knockback `SPLITTER_KNOCK`, Meiosis `MEIOSIS`
- **Efficacy cards:** Caliber, Overclock, Big Bore, Split Fire (`SPLITTER_MULTI`), More Shards (`SPLIT_CELLS`), Executioner

**Caroms** — bounce/bank
- **Attunements (4):** Chain Conductor (VOLT), Ember Bounce (PYRO), Cryo Carom (CRYO), Hunter's Carom (VOID)
- **Mechanic Mods:** Explosive `RICOCHET_EXPLODE`, Stun `RICOCHET_STUN`, Knockback `RICOCHET_KNOCK`, Charged Caroms `CHARGED_CAROMS`
- **Efficacy cards:** Caliber, Overclock, Big Bore, Double Bank (`RICOCHET_MULTI`), More Bounces (`EXTRA_BOUNCE`)

**Boomerang Discs** — out-and-back
- **Attunements (5):** Frost Disc (CRYO), Cinder Disc (PYRO), Corroding Edge (TOXIC), Tesla Disc (VOLT), Event Disc (VOID)
- **Mechanic Mods:** Piercing `BOOMERANG_PIERCING`, Stun `BOOMERANG_STUN`, Knockback `BOOMERANG_KNOCK`, Razor Edge `RAZOR_EDGE`
- **Efficacy cards:** Caliber, Overclock, Big Bore, Twin Discs (`BOOMERANG_MULTI`), Long Throw (`LONG_THROW`)

**Spin Cannon** — spin-up hose
- **Attunements (3):** Overheat Coil (PYRO), Storm Spool (VOLT), Cryo Barrel (CRYO)
- **Mechanic Mods:** Piercing `SPIN_PIERCING`, Homing `SPIN_HOMING`, Stun `SPIN_STUN`, Knockback `SPIN_KNOCK`
- **Efficacy cards:** Caliber, Overclock (`SPIN_RAPID`), Big Bore, Fast Spool (`FLYWHEEL`), Overspin (`OVERSPIN`), Stabilizers

**Flak Cannon** — airburst wall
- **Attunements (4):** Incendiary Burst (PYRO), Cryo Burst (CRYO), EMP Burst (VOLT), Gas Burst (TOXIC)
- **Mechanic Mods:** Stun `FLAK_STUN`, Knockback `FLAK_KNOCK`, Proximity Fuse `PROXIMITY_FUSE`
- **Efficacy cards:** Caliber, Overclock (`FLAK_RAPID`), Big Bore, More Shrapnel (`FLECHETTE`), Long Fuse (`LONG_FUSE`), Bigger Blast

**Gravity Lance** — pull/setup (signature VOID)
- **Attunements (4):** Event Horizon Rounds (VOID), Accretion Burn (PYRO), Cryo Well (CRYO), Charged Singularity (VOLT)
- **Mechanic Mods:** Explosive `GRAVITY_EXPLODE`, Stun `GRAVITY_STUN`, Implosion `IMPLOSION`
- **Efficacy cards:** Caliber, Twin Wells (`GRAVITY_MULTI`), Big Bore, Stronger Pull (`EVENT_WAKE` / `SINGULAR_PULL`)

### POWERS

**Charge Shot** — charge/release
- **Attunements (4):** Plasma Lance (RADIANT), Fireball (PYRO), Glacial Spike (CRYO), Thunderhead (VOLT)
- **Mechanic Mods:** Explosive (Overcharge `CHARGE_OVERCHARGE`), Homing `CHARGE_HOMING`, Piercing `CHARGE_PIERCING`
- **Efficacy cards:** Charge Power (`CHARGE_POWER`), Fast Charge (`CHARGE_SPEED`), Lethality, Giant Slayer

**Seeker Mines** — deployable turrets
- **Attunements (4):** Incendiary (PYRO), Cryo (CRYO), Tesla (VOLT), Toxic (TOXIC)
- **Mechanic Mods:** Daisy Chain `DAISY_CHAIN`, Seeker Missiles `MINE_MISSILES`, Mine Shield `MINE_SHIELD_RADIUS`
- **Efficacy cards:** Extra Mine (`EXTRA_PAYLOAD`), Bigger Blast (`BLAST_RADIUS`), Quick Cooldown (`RAPID_DEPLOY`)

**Nova Blast** — shockwave ring (signature VOLT)
- **Attunements (4):** Static Nova (VOLT), Plasma Nova (RADIANT), Frost Nova (CRYO), Gravity Nova (VOID)
- **Mechanic Mods:** Aftershock `AFTERSHOCK`, Double Pulse `DOUBLE_PULSE`, Chain Reaction `NOVA_CHAIN`, Stun (`NOVA_LIGHTNING`)
- **Efficacy cards:** Bigger Blast (`SHOCKWAVE`), Quick Cooldown (`RESONANCE`), Caliber

**Missile Salvo** — homing missiles
- **Attunements (4):** Thermite (PYRO), Cryo (CRYO), Corrosive (TOXIC), Singularity (VOID)
- **Mechanic Mods:** Piercing `MISSILE_PIERCING`, Cluster Warhead `CLUSTER_WARHEAD`
- **Efficacy cards:** Extra Missile (`EXTRA_ORDNANCE`), Quick Cooldown (`QUICK_RELOAD`), Caliber

**Lance Beam** — sweeping arc (signature RADIANT)
- **Attunements (4):** Solar Lance (RADIANT), Flamethrower Sweep (PYRO), Frostbeam (CRYO), Disintegration Beam (TOXIC)
- **Mechanic Mods:** Refraction `REFRACTION`, Overload `OVERLOAD_BEAM`, Triple Beam `TRIPLE_BEAM`
- **Efficacy cards:** Beam Width (`BEAM_WIDTH`), Beam Duration (`LINGER`), Caliber (`LANCE_VELOCITY`), Quick Cooldown

**Arc Lightning** — tether (signature VOLT)
- **Attunements (4):** Tesla Cascade (VOLT), Plasma Arc (RADIANT), Cryo Arc (CRYO), Ignition Arc (PYRO)
- **Mechanic Mods:** *(new)* Ground Loop (auto-jump on target death), Tesla Overcharge `ARC_OVERCHARGE`
- **Efficacy cards:** Caliber (`AMPLIFIER`), Beam Duration, Quick Cooldown

**Singularity** — black hole (signature VOID)
- **Attunements (4):** Event Horizon (VOID), Hellpit (PYRO), Absolute Cold (CRYO), Plasma Collapse (RADIANT)
- **Mechanic Mods:** Event Horizon (collapse) `EVENT_HORIZON`, Stun
- **Efficacy cards:** Wider Maw (`SINGULARITY_RADIUS`), Void Grasp (`VOID_GRASP`), Stable Well (`SINGULARITY_DURATION`), Quick Cooldown

**Prism Beam** — rainbow fan (signature RADIANT)
- **Attunements (4 + Spectrum):** Spectrum Split (all-element — §4.4 drawback), Chromatic Burn (PYRO), Refractive Freeze (CRYO), Focused Prism (RADIANT)
- **Mechanic Mods:** Prism Seek `PRISM_SEEK`
- **Efficacy cards:** Extra Ray (`PRISM_BEAMS`), Beam Width (`PRISM_WIDTH`), Beam Duration (`PRISM_DURATION`)

**Orbital Strike** — telegraph column
- **Attunements (4):** Hellfire Column (PYRO), Glacial Column (CRYO), Ion Cannon (VOLT), Acid Rain (TOXIC)
- **Mechanic Mods:** Barrage `ORBITAL_BARRAGE`, Stun
- **Efficacy cards:** Wider Impact (`ORBITAL_RADIUS`), Heavier Payload (`ORBITAL_POWER`), Rapid Paint (`RAPID_PAINT`)

**Cryo Burst** — freeze ring (signature CRYO)
- **Attunements (3):** Absolute Zero (CRYO), Frostfire (PYRO+CRYO), Static Frost (VOLT)
- **Mechanic Mods:** Shatter `SHATTER`, Stun
- **Efficacy cards:** Cold Front (`CRYO_RADIUS`), Deep Freeze (`DEEP_FREEZE`), Quick Cooldown (`COLD_SNAP`)

**Overdrive** — primary buff (no projectile)
- **Attunements (4):** Pyro / Cryo / Volt / Toxic Overdrive (lends element to the equipped primary)
- **Mechanic Mods:** Afterburn `AFTERBURN` (+pierce while active)
- **Efficacy cards:** Endurance (`OVERDRIVE_DURATION`), Redline (`REDLINE`), Quick Cooldown (`NITRO`)

---

## 8. Abilities

Base abilities are **element-agnostic**. Same three-bucket structure:
- **Ability behavior/element upgrades (upfront):** the existing mechanic-changing ability upgrades — Iron Will, Retaliation, Reflect, Cascade, EMP Overload, Emergency Protocol — plus a future **element-flavored ability upgrade set** (the ability equivalent of weapon attunements; e.g. "Ion Burst" makes EMP also CONDUCT). *To brainstorm next.*
- **Ability efficacy cards (in-run):** §6 E/F — Recharge, Endurance, Potency, Wide Band, Extra Orb, Hardened, Extra Drone, Rapid Servos, Heavy Caliber, Reach, Lingering Field, Quick Cast.

Roster (16): BULWARK, FIELD_MEDIC, DEFLECTOR_ORBS, EMP_PULSE, SENTRY_DRONE, BLINK, GRAVITY_SNARE, DESIGNATOR, SECOND_WIND, ELEMENTAL_INFUSION, CRYO_FIELD, STASIS_FIELD, STORM_CELL, PYRE_AURA. *(ELEMENTAL_INFUSION is now even more central — it's the on-demand answer to a resisted build.)*

---

## 9. Elemental counterplay

Stacking + resist gives real matchup texture:
- **Focused build (1 element):** huge weakness burst, but a resistant wave hurts — bring a 2nd weapon on another element, or use ELEMENTAL_INFUSION.
- **Coverage build (stacked):** never hard-walled, applies many statuses, but lower single-target punch.
- **KINETIC:** no resist quirks — the always-reliable fallback (so a un-attuned weapon is fine).
- **Weakness payoff:** +100% on a weakness makes hitting the right element feel great.
- **Stretch:** telegraph resistant/weak enemies visually (tint/icon) so matchups are readable.

---

## 10. Technical / data model

- **`ATTUNEMENTS`** (new, `weapon-data.js`): `{ id, name, element, weapon, description, behavior:{…flags}, cost }`. Account-gold unlock; **multiple can be active per weapon**.
- **`MECHANIC_MODS`**: re-tag the existing mechanic-changing upgrade IDs (PIERCING/EXPLODE/HOMING/STUN/KNOCK + capstones) as upfront unlocks (not cards).
- **`EFFICACY_CARDS`**: the §6 catalog. Re-tag the existing efficacy IDs (MULTI/RAPID/BIG + class amps) into this pool; add the new conditional/handling cards. Per-weapon `cardPool` filter list.
- **Damage-split:** in the damage path, if a bullet/source has N active elements, deal `dmg/N` per element through `elementalMultiplier` and apply each signature status. Stamp `bullet.elements = [...]` (array) instead of a single `element`; KINETIC when empty.
- **Override priority** (`weapons.js`): ELEMENTAL_INFUSION / Overdrive element > equipped attunements (array) > KINETIC.
- **Attunement behaviors** gated by per-attunement flags in fire path / `bullet.update` / `collision-system`, reusing existing status + reaction systems.
- **BUILD tree** (`shop-dom.js` / `static-dom.js`): buyable parent nodes; orbit nodes = attunements + mods; account-gold header; relabel; retire flat `armory-overlay.js` list (gear → separate, linked).
- **LOADOUT** (`loadout-overlay.js`): per-weapon active attunement/mod toggles.
- **Cards** (`card-draft.js`): 1 primary + 1 power + 2 ability; draw from `EFFICACY_CARDS` filtered by equipped `cardPool`; backfill when a pool is dry.

---

## 11. Economy (permanent unlocks, dialed up)

Proposed **account-gold** costs (placeholders — tune vs income; a 30-wave run banks a fraction of ~100k run-gold minus in-run sinks):

| Item | Proposed cost |
|---|---|
| Primary weapon unlock | 8,000 |
| Power weapon unlock | 12,000 |
| Ability unlock | 10,000 |
| Attunement (each) | 5,000–9,000 (signature cheaper) |
| Mechanic mod (each) | 4,000–7,000 |
| Ability behavior upgrade | 4,000–7,000 |

Goal: one new weapon + one attunement ≈ several runs of saving; a full collection (~93 attunements + mods + weapons + abilities) is a long-haul grind.

---

## 12. Affected files & phases

**Files:** `weapon-data.js` (new ATTUNEMENTS, re-tag MECHANIC_MODS / EFFICACY_CARDS, costs), `weapons.js` (multi-element stamping + override priority), `collision-system.js` (damage-split + attunement behaviors), `bullet.js` (multi-element + attunement projectile behaviors), `shop-dom.js`/`static-dom.js` (BUILD tree), `armory.js` (attunement/mod unlocks), `loadout-overlay.js` (attunement/mod toggles), `armory-overlay.js` (retire), `card-draft.js` (1+1+2 efficacy filter + backfill), `run-shop.js` (confirm pricing), `tests/`, `README.md`/`CHANGELOG.md`/`VERSION` (structural → MAJOR or large-MINOR).

**Phases:**
1. Data foundation — ATTUNEMENTS + re-tag buckets + multi-element stamping + damage-split (console-testable).
2. Attunement behaviors — by element batch (PYRO/CRYO first), reusing status helpers.
3. Card recomposition — 1+1+2 efficacy-only + filter + backfill + tests.
4. BUILD tree — buyable parents, attunement/mod orbit nodes, account-gold, relabel; retire flat Armory.
5. LOADOUT — per-weapon attunement/mod toggles.
6. Economy + balance pass — costs, damage-split tuning, KINETIC viability, resist telegraphing.
7. Ability behavior/element upgrades (separate brainstorm) + polish (VFX, tooltips, README/CHANGELOG).

---

## 13. Open questions for review

- **OQ-A — Per-weapon slot budget?** Is there a cap on how many attunements/mods can be *active* at once (forcing trade-offs), or do unlock cost + damage-split alone limit stacking? Proposed: a soft slot budget per weapon (e.g. 3 active attunements + 2 active mods) to keep loadout decisions sharp. **Confirm.**
- **OQ-B — Stacking drawback math.** Even split (`dmg/N`) vs a gentler curve (e.g. each extra element −25%). Proposed: even split — simplest and most legible. **Confirm.**
- **OQ-C — Gear placement.** Separate screen linked from BUILD (recommended). **Confirm.**
- **OQ-D — Ability behavior/element upgrades.** Brainstorm these next (the ability equivalent of weapon attunements)?
- **OQ-E — Borderline cards** (Double Tap, Warm Barrel, Salvage, Battery, Recovery): **deferred** per request — revisit as efficacy vs mechanic later.
- **OQ-F — Cost numbers** (§11): agree on the *shape* before fine-tuning.
- **OQ-G — Migration.** New keys default to "none owned." Owned weapons stay owned; nothing else to grandfather.

---

## 15. Addendum — W6/W7 decisions, ability attunements & endgame sink (2026-05-24)

Locked decisions from review (supersede the matching open questions above):

- **Card draft is now 5 cards: `1 primary + 1 power + 1 GLOBAL mod + 2 ability`.** The new
  global slot draws from a **global efficacy pool** (the §6 group B/C cards — conditional
  damage + handling/tradeoff — that apply to *any* weapon).
- **Ability attunements are ONE element at a time** (strategic commit, like a single weapon
  attunement — they do NOT stack). Bought upfront, toggled per run.
- **Flat attunement/mod cost** — no signature/exotic distinction. The economy refactor just
  makes the unlock path read a **per-item `cost`** (so individual outliers like Prism's
  all-element Spectrum Split can be priced higher), defaulting to the flat category cost.
- **Enemy weakness telegraph = pip + hit cue** (both): a small element-colored **weakness pip**
  above enemies with a notable weakness (`resist ≤ −0.3`), distinct from the body tint; plus
  **damage-number effectiveness cues** (weakness = big bright element-colored + spark; resisted
  = small grey).

### 15.1 Ability attunements (one element each; element-agnostic base)

Already-elemental abilities (Cryo/Stasis/Storm/Pyre fields, Elemental Infusion) need none.
The rest each pick ONE element to flavor their verb:

- **EMP Pulse** — Ion Burst (Volt: stunned also conduct) · Cryo Pulse (also freezes) ·
  Overload (Pyro: burns) · Null Pulse (Void: marks the group).
- **Sentry Drone** — elemental rounds: Pyro (ignite) · Volt (chain-fork) · Cryo (chill) ·
  Toxic (corrode) · Void (mark) · Radiant (armor-pierce).
- **Bulwark** — element on the retaliation/contact: Searing (Pyro) · Static (Volt) ·
  Frostguard (Cryo) · Null (Void).
- **Deflector Orbs** — orbs apply an element on contact + reflected bullets inherit it:
  Volt / Pyro / Cryo.
- **Gravity Snare** — Singularity (Void: mark + implode) · Glacial (Cryo: freeze the clump) ·
  Pyre (Pyro: burn) · Caustic (Toxic: corrode).
- **Blink** — exit-point burst: Flash Step (Pyro nova) · Storm Step (Volt) · Void Step
  (gravity gather) · Frost Step (freeze).
- **Designator** — the mark also applies an element status to painted targets (Toxic/Pyro/Cryo).
- **Field Medic** — the heal-flash also hits nearby enemies (Radiant purge/blind, or Pyro nova).
- **Second Wind** — the survival trigger emits an element nova (Pyro/Volt/Cryo) to buy space.

Runtime: a `player.activeAbilityAttune[abilityId] = elementId` map (one element), applied when
the ability activates (`player/abilities.js`). Bought via a new `abilityAttunements` unlock
category; toggled in the BUILD tree's DEFENSE cluster (parallels weapon attunements).

### 15.2 Global efficacy cards (the 5th "mod" slot)

Group B (conditional damage) + C (handling/tradeoff) from §6, as GLOBAL powerups (apply to the
active weapon regardless of type), read in the damage path via `getPowerupStacks`:
- B: Point-Blank, Marksman, Giant Slayer, Cull the Weak, Momentum, Adrenaline, Cold Blood,
  Opening Strike. (Executioner already wired.)
- C: Trigger Discipline, Steady Aim, Stabilizers, Light Frame, Heavy Frame, Hot Loads, Hair Trigger.
`card-draft.js` adds a `globalCards` pool + `composeDraft` → 1 primary + 1 power + 1 global + 2 ability.

### 15.3 Endgame gold sink (post-full-unlock) — design options

Problem: account-gold buys permanent unlocks; once everything's owned it has no sink. The
in-run RUN-gold sinks (R4: reroll / repair / +card / revive) already exist — this is about
ACCOUNT-gold after the collection is complete. Candidates, ranked:

1. **Per-run "loadout blessings" (TRULY perpetual, no permanent creep)** — at the BUILD screen,
   spend account-gold on ONE-RUN-ONLY boosts that don't persist: Warchest (+starting run-gold),
   Pre-charged (power weapon ready at start), Veteran Start (begin a few waves in for a
   score/gold-rate bonus), Extra Draft (+1 card on the first draft), Insurance (a free revive).
   Consumed each run → continuous sink, zero balance creep. **Lead recommendation.**
2. **Gold → Cores exchange (bridge; reuses the gear treadmill)** — let account-gold buy Cores so
   it always feeds gear reroll/tier-up. Long sink (until near-perfect gear across 5 slots), low
   effort, no new content. Bounded by the 8-tier rarity cap per item, so finite-but-deep.
3. **Cosmetics (ideal; needs art)** — ship skins / engine trails / bullet colors / UI themes for
   account-gold. Infinite, zero balance impact. The classic endgame sink — gated on cosmetic assets.
4. **Mastery / prestige (powerful; creep risk)** — infinite, steeply-diminishing per-weapon or
   account levels, or a prestige reset for a small permanent multiplier + badge. Use only with a
   hard cap + exponential cost; otherwise power creep. Lowest priority.

Recommendation: ship **(1) per-run blessings** as the perpetual sink + **(2) gold→Cores** as the
immediate bridge; add **(3) cosmetics** when art bandwidth exists; avoid (4)'s creep.
