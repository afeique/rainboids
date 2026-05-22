# Arsenal & Combat-Depth Expansion — Brainstorm

**Created:** 2026-05-22
**Last revised:** 2026-05-22 (integrated: unified Skills, core Elements + resistance,
deeper enemies, multi-tier game-changing items)
**Status:** Brainstorm / design exploration — no implementation approved yet
**Author:** Claude + Afeique
**Scope:** Solo (`/`) only. Multiplayer is on its own timeline.

---

## 0. TL;DR — the thesis

After 6.56.0, Rainboids has a *huge* arsenal (11 primaries, 11 power weapons,
7 defense skills, 8 passives) sitting on top of *thin* systems. The arsenal
isn't the problem — the connective tissue is. This doc proposes **four
load-bearing systems** that make everything already in the game deeper, plus
new content that plugs into them:

1. **Elements & elemental resistance become a core mechanic** — every weapon,
   enemy, and item speaks the same elemental language, and resistances/weaknesses
   make weapon choice tactical (§5).
2. **"Defense Skills" become just "Skills"** — a unified 4-slot loadout on keys
   **1–4** (TAB binding retired). Skills do *anything*: buff, debuff, heal, CC,
   summon, mobility, economy. A big, imaginative pool (§6).
3. **Enemies get elements + resistances + new archetypes** — and several new
   types, including "anti-meta" enemies that punish lazy play (§7).
4. **Items get a deep rarity ladder + resistance rolls + game-changing traits**
   — Common → Rare → Exceptional → Legendary → Epic → Godlike → Divine →
   Transcendental, where the top tiers stack multiple build-defining traits so a
   single drop can make you *insane* (§8).

New weapons (§10) are the *least* urgent thing — they only matter once the
systems above exist to make them interact.

---

## 1. Where things stand today (self-contained snapshot)

- **Primaries (11):** Pulse, Storm Needles, Scatter, Rail Driver, Cluster
  Launcher, Mitosis, Caroms, Boomerang, Spin Cannon, Flak, Gravity Lance.
- **Power weapons (11):** Charge Shot, Seeker Mines, Nova Blast, Missile Salvo,
  Lance Beam, Arc Lightning, Singularity, Prism Beam, Orbital Strike, Cryo Burst,
  Overdrive.
- **Defense skills (7):** Bulwark, Repair Nanites, Deflector Orbs, EMP Pulse,
  Tractor Shield, Sentry Drone (+ dash is a core SHIFT primitive). **Only ONE is
  equipped at a time — triggered by TAB / Q.**
- **Passives (8):** Crit Chance, Crit Damage, Health, Toughness, Vampirism,
  Thorns, Evasion, Speed — all flat `+X%`.
- **Statuses (3):** BRN (burn DoT), STUN (halt+no-fire), SLOW (×0.7 move).
- **Items:** 5 slots (cockpit/hull = HP, shielding/chassis = toughness, nanites =
  regen). 3 rarities (common/rare/epic) that already **scale affix count 1/2/3**.
  Affixes mirror the passive stat set. Auto-equip by unified score; loot feed
  keeps recent drops.

> The item system **already rolls more affixes at higher rarity** — so the
> 8-tier / game-changing-trait ladder in §8 is an *extension* of existing code,
> not a rewrite. Likewise statuses already attach as enemy timers, so the
> element system in §5 extends a pattern that exists.

---

## 2. Status of the *previous session's* plans

Most of the prior weapon/skill arc already shipped (verified against
`weapon-data.js`): PASSIVE class, per-weapon homing/pierce, BRN/STUN engine,
Nova lightning/chain/inferno, mine shield, Cluster Launcher, the dead-skills
sweep (6.38–6.45), and the 6.56.0 drop (6 primaries + 5 powers + Sentry Drone).
The one big outstanding item is the **Diablo-style skill-tree shop UI** (verify
status before assuming). This doc moves past "build the planned weapons" to
"add the systems that make 22 weapons interesting."

---

## 3. Diagnosis — what's missing

- **A — Weapons don't combo.** 22 weapons, none changes what another does. → §5.
- **B — Enemies are undifferentiated.** No resistances, shields, or weaknesses,
  so weapon choice is flavor, never tactics. → §5 + §7.
- **C — Builds have no identity.** Passives are numbers, never rules. → §8/§9.
- **D — One skill, one button, all defensive.** No offense/utility/summon layer
  and no loadout choice. → §6.
- **E — Items are stat sticks.** Higher rarity = bigger numbers, never *new
  behavior*. → §8.

---

## 4. Design pillars at a glance (how the four systems interlock)

```
        ┌──────────────── ELEMENTS (§5) ────────────────┐
        │  every weapon has an element + status          │
        │  every enemy has resistances + weaknesses      │
        └───────┬───────────────────────┬────────────────┘
                │                        │
        weapons apply               items roll
        statuses                    +resistances (§8)
                │                        │
   ┌────────────▼───────────┐   ┌────────▼─────────────────┐
   │ SKILLS (§6)            │   │ ITEMS (§8)               │
   │ 4 equipped, keys 1-4   │   │ 8 rarity tiers           │
   │ buff/debuff/heal/CC/   │   │ game-changing traits     │
   │ summon/element-swap    │   │ resistance affixes       │
   └────────────┬───────────┘   └────────┬─────────────────┘
                │                         │
        ENEMIES (§7): elements + resistances + archetypes +
        new types + "anti-meta" units that punish lazy builds
```

The point: a player's *element*, *4 skills*, and *item traits* should combine
into a build with a recognizable identity, and the *enemy roster* should reward
or punish that identity so each run plays differently.

---

## 5. SYSTEM — Elements & elemental resistance (the new core) ⭐

**Goal:** make element a first-class property of damage. Every weapon deals an
element; every element carries a signature status; every enemy and the player
have resistances and weaknesses; items roll resistance. This single system
delivers Gap A (combos) *and* Gap B (tactics) at once.

### 5.1 The elemental roster (7)

| Element | Color | Signature status | Identity / synergy |
|---|---|---|---|
| **Kinetic** | white/steel | KNOCKBACK / BLEED | Physical baseline (most current bullets). Reliable, no resist quirks; the "always works" element. |
| **Pyro** (fire) | orange-red | **BRN** (DoT) | Ignites **OIL**-coated enemies for an AoE flare. Melts swarms. |
| **Cryo** (ice) | pale cyan | **CHILL→FREEZE** | Chill slows; full freeze halts + makes the enemy *brittle* (a hard hit **SHATTERS** for AoE that re-freezes neighbors). |
| **Volt** (lightning) | electric purple | **SHOCK/STUN**, chains | **CONDUCT** (wet) targets take +50% Volt and chain farther. |
| **Toxic** (acid/bio) | acid green | **CORRODE** (vulnerability) + poison DoT | CORRODE = target takes **+X% from ALL sources**. The universal amplifier; sets up every other element. |
| **Void** (gravity/dark) | violet-black | **PULL / MARK** | Drags enemies together (combo setup) and **MARK**s them (homing + crit + loot). Anti-clustered-wave. |
| **Radiant** (plasma/light) | white-gold | **PURGE / blind** | Cuts through shields and armor (anti-defensive). The beam/prism element. |

### 5.2 Damage formula (core)

```
finalDamage = baseDamage × (1 − resistance[element])
```
- `resistance` ranges roughly **−0.75 (weak: +75% taken) → +0.90 (resistant)**,
  with **immune (1.0)** reserved for thematic enemies (a fire elemental is
  immune to Pyro).
- Negative resistance = **weakness** = a damage *bonus*. This is what makes
  "bring the right element" matter.
- The **player** also has per-element resistances (vs. enemy elemental attacks)
  — that's what item resistance rolls (§8) protect.

### 5.3 The synergy matrix (set-up → pay-off)

| Setup | + Trigger | = Pay-off |
|---|---|---|
| OIL (Toxic/oil weapon) | any **Pyro** hit | AoE fire flare to neighbors |
| CONDUCT/wet | any **Volt** hit | +50% damage, longer chain |
| CHILL/FREEZE | any heavy hit | **SHATTER** AoE → re-freeze neighbors |
| CORRODE | *any* damage | flat amplification for the whole team |
| MARK (Void) | homing weapons + crits | seek + crit + bonus loot |

**Design rule:** every weapon (existing and new) gets tagged with the element it
**deals** and the statuses it **applies/exploits**. Re-theming the current 22
weapons into the element grid is most of the work and instantly makes them
combo. Players can also *change* their element on demand via the **Elemental
Infusion** skill (§6) or **Prismatic** item traits (§8).

### 5.4 Implementation grounding
- Statuses already attach as enemy timers (`brnUntil`, `stunUntil`, `slowUntil`)
  read in `enemy.js _processStatusEffects()`. Add `corrodeStacks/Until`,
  `chillUntil`/`freezeUntil`+`brittle`, `conductUntil`, `oilUntil`, `markUntil`.
- CORRODE is one multiplier in `applyDamageToEnemy` → affects *everything*.
- Per-element resistance = a small lookup on the enemy + on the player; one
  multiply in the damage path.
- Reuse FX pools (`explosionRingColored`, `enemyShockwave`, `starSparkle`) and
  juice helpers (`triggerHitstop`, `triggerScreenShake`) for shatter/flare pops.

---

## 6. SYSTEM — Skills: unified 4-slot loadout ⭐ (your request)

### 6.1 The change
- **Rename "Defense Skills" → "Skills".** They are no longer defensive-only.
- **Equip up to 4 skills**, bound to **number keys 1–4**.
- **Retire the TAB binding** (and the Q alias) — TAB currently fires the single
  equipped skill; that whole single-slot model is replaced.
- A skill can do **anything**: buff, debuff, heal, crowd-control, summon,
  mobility, economy, element-swap.
- Loadout is chosen in the shop / skill screen; the 6 existing defense skills
  fold into the unified pool unchanged.

### 6.2 Loadout-economy design notes (decide before building)
- **Cost model:** keep per-skill cooldowns; consider a *shared* light resource
  (or per-slot cooldowns) so 4 skills don't trivialize danger. Recommend
  **independent cooldowns** (simplest, readable) with the existing energy/SP
  costs retuned.
- **No global "press all 4"** — keys 1–4 fire individually so loadout + timing
  is a skill expression.
- **Input:** keys 1–4 are currently unbound for skills (only TAB/Q today). Add
  rising-edge one-shot pulses per slot in `input-handler.js`, mirror on
  gamepad (d-pad / face buttons).

### 6.3 The skill pool (imaginative; ★ = existing, migrated)

**Offense / buff**
| Skill | Effect |
|---|---|
| Overdrive ★ (move from power weapon → skill) | Supercharge primary: +fire rate/damage, optional pierce, for a few seconds. |
| Bloodlust | For ~5s, damage **scales as your HP drops** (up to +80% near death) + lifesteal up. |
| Bullet Time (Focus) | Brief **personal slow-mo** — everything but you runs ~35% speed. (No slow-mo exists today.) |
| Killing Spree (Frenzy) | Fire rate **ramps per kill** during a window that refreshes on kill. |
| Designator | **MARK** every on-screen enemy → all shots home + crit + bonus loot. |
| Elemental Infusion | Coat your primary with a chosen **element** (Pyro/Cryo/Volt/Toxic/Void/Radiant) for a window — lets any gun join the §5 combos. |
| Berserker Roar | AoE shout: **buffs you** (damage/speed) and **debuffs/fears** nearby enemies. |

**Heal / sustain**
| Skill | Effect |
|---|---|
| Repair Nanites ★ | Regen HP/s for a few seconds. |
| Phoenix Pulse | Instant heal; overheal converts to a temporary **overshield**. |
| Siphon Field | Lifesteal aura — damage dealt near you heals harder for the duration. |
| Second Wind | **Cleanse all debuffs** + brief regen + i-frame blink. |

**Defense**
| Skill | Effect |
|---|---|
| Bulwark ★ | 50–65% damage resistance window. |
| Deflector Orbs ★ | Orbiting orbs block/reflect bullets. |
| Tractor Shield ★ | Forward shield absorbs bullets → coins. |
| Aegis Barrier | Flat **absorb buffer** (e.g. soak next N damage) — different math than %-reduction; eats one-shots. |
| Spectral Shift | ~2s **intangibility** (pass through bullets), can't fire. |
| Pulse Ward | Sustained **knockback + bullet-deflect aura** — makes space. |
| Riposte | ~1s **parry window**; absorbing a hit → retaliatory nova **+ cooldown refund**. |
| Bunker | Root in place; **near-invulnerable but immobile**. |

**Crowd-control / debuff**
| Skill | Effect |
|---|---|
| EMP Pulse ★ | AoE stun. |
| Cryo Nova | AoE **freeze** (sets up SHATTER). |
| Gravity Snare | Root + **pull enemies into a point** (combo setup with AoE). |
| Hex Field | AoE that applies **CORRODE** to all nearby (pure vulnerability debuff). |
| Terrify | Nearby enemies briefly **flee / stop firing**. |

**Summon**
| Skill | Effect |
|---|---|
| Sentry Drone ★ | Orbiting auto-fire drones. |
| Wingman | A temporary **AI ally ship** that mirrors your primary. |
| Swarm Hive | Releases **suicide-dive drones** that seek and detonate. |
| Heavy Turret | Drop a **stationary heavy turret** for the duration. |

**Mobility / economy / utility**
| Skill | Effect |
|---|---|
| Blink | **Teleport to cursor**, leaving a damaging afterimage. |
| Afterburner | Big speed burst + **damaging fire trail**. |
| Midas Touch | For a window, **% of damage → gold**, kills drop double. |
| Magnet Pulse | **Vacuum all orbs** on screen to you. |
| Bounty Mark | Mark one enemy; killing it drops a **jackpot**. |

> **Curation:** that's ~26 skills. Ship the 6 existing + ~8 strongest new ones
> first (Overdrive, Bullet Time, Bloodlust, Designator, Elemental Infusion,
> Aegis Barrier, Blink, Gravity Snare), then expand. The point is the **4-slot
> loadout** turns "which skill" into "which *four*, and when."

---

## 7. SYSTEM — Enemies: elements, resistances, new types ⭐

### 7.1 Retrofit the existing 10 with element + resist (makes weapon choice tactical)

| Enemy | Element (its attacks) | Resists | Weak to | Archetype tweak |
|---|---|---|---|---|
| HUNTER | Kinetic | — | — | Agile baseline (no resist) |
| GUARDIAN | Kinetic | **Kinetic** (armor) | Volt | **Armored** — subtracts flat dmg/hit; rewards big hits + CORRODE |
| WASP | Kinetic | — | **Cryo** | **Swarm** — freeze-shatter clears packs |
| STALKER | Radiant (laser) | Radiant | Void | Sniper; punish with pull/disrupt |
| DRIFTER | Volt (arc) | **Volt** | Toxic | Ranged beam; corrode to bypass resist |
| PROWLER | Kinetic (missiles) | Cryo | **Pyro** | Standoff tank; burn it down |
| WEAVER | Radiant (spiral) | — | Cryo | Evasive; freeze to land hits |
| SENTINEL | Radiant (sweep) | Radiant | Kinetic (rear) | **Bastion** — frontal shield; flank/bounce/pull-flip |
| TANGERINE | Pyro (mines) | **Pyro** | Cryo | Bomber; don't fight fire with fire |
| TITAN (boss) | mixed | high all-around | **rotating telegraphed weak point** | Boss; reward element-switching |

### 7.2 New enemy types (tied to elements + archetypes)

| Type | Behavior | Element | Resist / Immune | Weak | Demands |
|---|---|---|---|---|---|
| **Cinder** | Fast fire swarmers; ignite player on contact | Pyro | Pyro-immune | Cryo | AoE / Cryo |
| **Glacier** | Slow ice tank; chills player; brittle if frozen | Cryo | Cryo-immune | Pyro | Pyro burst |
| **Tesla Wraith** | Teleports; chains shock | Volt | Volt-immune | Toxic | Corrode + burst |
| **Plaguebearer** | Leaves acid trails; corrodes player; spawns spores | Toxic | Toxic | Radiant | Radiant / focus |
| **Devourer** | Pulls you in; **eats your bullets** | Void | Void-immune | Radiant | Beams / melee |
| **Prism Mirror** | **Reflects projectiles**; immune to its own element | Radiant | Radiant | Kinetic | Melee / non-projectile AoE |
| **Mender** | Heals nearby allies; low threat alone | — | — | — | Focus-fire / MARK |
| **Phantom** | Periodic invisibility | Void | — | — | AoE / persistent hazards / MARK reveals it |
| **Hydra** | Splits on death unless killed by AoE/overkill | Kinetic | — | — | Burst / Overkill trait |

### 7.3 "Anti-meta" enemies (keep builds honest) — the spice

| Type | Mechanic | Why it's great |
|---|---|---|
| **Warden / Adaptive** | Gains **resistance to whatever element hit it last** | Forces element-switching mid-fight — makes the whole §5 system *sing*, and is a perfect foil for the Prismatic item trait. |
| **Leech** | **Strips/steals player buffs** on hit | A counter to the §6 buff-stacking meta; makes timing skills matter. |
| **Null Drone** | Suppresses skills in an aura (skills cost more / cool slower nearby) | Punishes skill-spam; rewards positioning. |
| **Bulwark Drone** | Projects a **frontal shield over OTHER enemies** | A support unit you must kill first — adds target-priority tactics. |

> Even shipping **GUARDIAN-armored + WASP-swarm + SENTINEL-bastion + Warden**
> would transform combat from "DPS check" to "read the room, bring the tool."

---

## 8. SYSTEM — Items: tiers, resistances, game-changing traits ⭐

The item code **already scales affix count by rarity** (common 1 / rare 2 /
epic 3). We extend that into a deep ladder where higher tiers add **stat
affixes**, **resistance rolls**, and — at the top — **game-changing traits**.

### 8.1 The rarity ladder (8 tiers, unique colorations)

Ordered low → high. Trait counts match your spec (Legendary 1 → Transcendental 5).

| # | Tier | Color | Glow | Stat affixes | Resist rolls | **Game-changing traits** | Feel |
|---|---|---|---|---|---|---|---|
| 1 | **Common** | `#b8c0cc` steel-gray | 0.45 | 1 | 0 | 0 | filler |
| 2 | **Rare** | `#5cc6ff` sky-blue | 0.85 | 2 | 0 | 0 | a keeper |
| 3 | **Exceptional** | `#36e6a0` emerald | 1.05 | 3 | 0–1 | 0 | strong roll |
| 4 | **Legendary** | `#ffb43a` amber-gold | 1.35 | 3 | 1 | **1** | build seed |
| 5 | **Epic** | `#c060ff` violet | 1.6 | 4 | 1 | **2** | build core |
| 6 | **Godlike** | `#ff3d6e` crimson-rose | 1.9 | 4 | 1–2 | **3** | run-defining |
| 7 | **Divine** | `#fff0a0` radiant white-gold | 2.3 | 5 | 2 | **4** | absurd |
| 8 | **Transcendental** | **prismatic / animated rainbow** | 2.8 | 5 | 2 | **5** | *insane* (on-brand for Rainboids) |

- **Tiers are discerned by how many things they roll** (your idea): stat affixes
  + resistance rolls + traits all climb with tier.
- **Drop weights** plummet up the ladder (Transcendental is a once-a-run-if-lucky
  event). Boss kills bias the roll up; deep waves widen the band.
- **Coloration:** each tier has a distinct glow color *and* glow strength so you
  can read a drop's tier at a glance across the field; **Transcendental shimmers
  through the spectrum** (reuse the rainbow-cycle the game already loves).
- The existing `RARITY_TIERS` map + `rollRarity()` + `affixCount` logic in
  `item-names.js` / `item-system.js` extends directly to this table.

### 8.2 Resistance affixes (ties items to §5)

Add **per-element resistance** to the affix pool (`ITEM_AFFIX_POOL`):
`+X% Pyro resist`, `+X% Cryo resist`, … one entry per element, plus a rare
**`+X% All-Element resist`** roll on high tiers. Now a stage full of Cinders
makes you want a Pyro-resist item — gear becomes situational, and the loot feed
becomes a toolbox you *swap*, not just a number you maximize.

### 8.3 Game-changing TRAITS (the marquee — distinct from stat affixes)

Traits are a **separate modifier class** from stat affixes: they change a
*rule*, not a number. A Legendary rolls 1; each tier up adds one; a
**Transcendental stacks 5** → a single drop can rewrite your run.

**Trait catalog (imaginative; grouped by what they change):**

*Projectile behavior*
- **Bullet Bloom** — every shot fires +2 extra projectiles in a spread.
- **Echo Rounds** — every shot fires a delayed ghost copy.
- **Overpenetration** — your shots pierce +3 and gain damage per pierce.
- **Ricochet Soul** — shots that miss bounce once toward the nearest enemy.

*Element / status*
- **Hex Touch** — your hits apply **CORRODE**.
- **Frostbite** — your hits **CHILL**; chilled enemies that die freeze-shatter.
- **Conductor** — your hits apply **CONDUCT**; lightning chains +2.
- **Elemental Overflow** — your element's status applies at **max stacks** instantly.
- **Prismatic Soul** — your weapon's **element rotates** every few seconds (covers every weakness; hard-counters the Warden).

*Economy / loot*
- **Orb Magnet** — all orbs auto-collect from anywhere, +25% gold.
- **Hoarder's Greed** — +1% damage per 1,000 *unspent* gold.
- **Midas Hits** — a % of all damage drops as collectable gold.

*Risk / power*
- **Glass Cannon** — +60% damage, −40% max HP.
- **Berserker's Pact** — fire rate scales as HP drops.
- **Momentum Engine** — damage scales with your movement speed.
- **Executioner's Edge** — enemies below ~15% HP die instantly.
- **Crit Cascade** — crits can chain to a second enemy.

*Survival / defense*
- **Second Heart** — revive once per wave at 50% HP.
- **Reactive Plating** — taking a hit emits a retaliatory nova.
- **Glass Reflection** — reflect 50% of bullets that hit you.
- **Phase Walker** — dash has no cooldown.

*Skill / power-weapon*
- **Twin Cast** — your **skills activate twice**.
- **Adrenaline Junkie** — kills refund skill cooldown.
- **Overcharged** — power weapons cost 40% less energy.

### 8.4 "A single item can make you insane" — embracing it
Stacking 5 traits (e.g. *Glass Cannon + Bullet Bloom + Hex Touch + Crit Cascade
+ Orb Magnet*) is **intentionally** broken-feeling — that's the Transcendental
fantasy. It's gated by brutal rarity, not by nerfing the traits. Design guards:
- **Anti-synergy is allowed** — a Transcendental can roll traits that fight each
  other (Glass Cannon + Second Heart), so not every god-roll is perfect.
- **Tier ≠ slot lock** — any of the 5 slots can roll any tier, so the *jackpot
  moment* can come from any drop.
- **The Warden enemy (§7.3)** is the deliberate check on "I deal one element
  forever" god-rolls — Prismatic Soul becomes the answer, a trait worth chasing.

---

## 9. Rule-changing modifiers: keystones vs. item traits (reconcile)

§8 game-changing traits and the previously-proposed "keystone passives" are the
**same concept** delivered two ways. Recommend **one shared pool of
rule-changing modifiers** with two delivery channels:

- **Item traits** — rolled randomly on Legendary+ drops (RNG / loot-chase).
- **Keystone cards** — a deliberate *pick* offered occasionally at stage-clear
  (agency / build-planning).

Same effects, different acquisition fantasy (gamble vs. choose). Keeps one
balance surface instead of two parallel ones.

---

## 10. New weapons (lowest priority — verb-gaps only)

Only worthwhile *after* §5 exists, because their value is in the element grid.

**Primaries**
- **Pyre Stream** (Pyro) — short continuous flame cone; heavy BRN/OIL applicator;
  `EMBER_FIELD` leaves a burning patch. Fills the short-range-continuous gap.
- **Caustic Sprayer** (Toxic) — lobs **persistent acid pools** that DoT + CORRODE.
  The CORRODE source; area denial. Fills the persistent-hazard gap.
- **Tesla Chain** (Volt) — reliable auto-chaining bolts; applies/exploits CONDUCT.
  No-aim crowd-clear. Fills the chain-as-primary gap.
- **Photon Blade** (Kinetic/Radiant) — melee arc swing that **deflects bullets**.
  The only counter to Prism Mirror; fills the melee + parry gap.
- **Midas Rounds** (economy) — lower damage, kills drop bonus gold + damage→coins.
  Engages the gold system; the "greed run."

**Power weapons**
- **Chronosphere** — deploy a **time-dilation bubble** (enemies + bullets ~30%
  inside). New game-feel (no slow-mo exists).
- **Scorched Earth** — napalm strike that leaves a **persistent fire field**
  (distinct from Orbital Strike via persistence; big Pyro/OIL payoff).
- **Reflector Pulse** — convert all on-screen enemy bullets into **outgoing
  damage**. The bullet-hell "oh-no" button.

---

## 11. Cross-cutting concerns

- **Input rework (skills):** retire TAB/Q skill activation; add one-shot pulses
  on keys **1–4** in `input-handler.js`; mirror to gamepad. Update the HUD skill
  bar from 1 slot → 4 slots.
- **Shop / skill screen:** the unified Skills loadout (pick any 4) and the item
  trait/resistance display both want UI — this is where the outstanding Phase-7
  skill-tree UI should land.
- **Balance posture:** elements + resistances are the highest-variance change;
  budget real playtest time. Items at Godlike+ will feel overpowered *by design*
  — gate with rarity, not nerfs.
- **Performance:** per-enemy status/element rendering gates on "has any status"
  (most won't), same mitigation as today's BRN/STUN icons.
- **Versioning (per CLAUDE.md):** each element, each enemy, each skill batch,
  each item tier-ladder step = its own MINOR. This doc is non-versionable.
- **README:** any of these shipping changes weapon/skill counts, controls
  (1–4 keys), and systems — must update README.

---

## 12. Roadmap (re-ranked with the new systems)

Depth before breadth. Each tier makes the existing arsenal better before adding more.

| Tier | What | Why here |
|---|---|---|
| **0** | **Elements + resistance core** (§5): roster, damage formula, CORRODE + FREEZE + CONDUCT statuses, retro-tag existing weapons | Unlocks combos *and* tactics for all 22 weapons at once. Foundation for everything else. |
| **1** | **Enemy retrofit** (§7.1) + 3 archetypes (Armored/Swarm/Bastion) + **Warden** | Makes element choice matter; cheap, no new weapons. |
| **2** | **Skills unification** (§6): 1→4 slots, keys 1–4, retire TAB, migrate 6 + ship ~8 new | Your requested change; reuses the elemental + status systems (Elemental Infusion, Hex Field, Cryo Nova). |
| **3** | **Item ladder + resistances + traits** (§8): extend rarity tiers, add resist affixes, add the trait class + first ~12 traits | The loot-chase payoff; depends on §5 (resistances) being live. |
| **4** | **New enemy types** (§7.2) + remaining anti-meta units (§7.3) | Content that exercises the systems. |
| **5** | **New weapons** (§10): Pyre Stream + Caustic Sprayer first (the §5 applicators) | New verbs, valuable only once elements exist. |
| **6** | **New power weapons** (§10) | Spectacle; lowest urgency. |
| **—** | Finish **Phase-7 skill-tree / loadout UI** | Houses the 4-slot loadout + item trait display; verify status, schedule independently. |

---

## 13. Open questions for Afeique

1. **Element count** — is 7 (Kinetic/Pyro/Cryo/Volt/Toxic/Void/Radiant) right,
   or do you want fewer (tighter) or more (Psi/charm, etc.)?
2. **Player elemental damage** — should enemies' *attacks* be elemental too (so
   player resist rolls matter defensively), or keep elements offense-only at first?
3. **Skill loadout economy** — independent cooldowns (recommended) or a shared
   resource so 4 skills can't all fire at once?
4. **Trait/keystone unification** — agree to one shared modifier pool with two
   delivery channels (drop vs. pick)?
5. **Tier ordering** — confirm the ladder Common→Rare→Exceptional→Legendary→
   Epic→Godlike→Divine→Transcendental (your trait counts 1–5 map to the top 5).
   If you want the conventional Epic\<Legendary order instead, we swap two names.
6. **Transcendental coloration** — animated prismatic shimmer (proposed), or a
   single signature color?
7. **First commit** — want me to turn **Tier 0 (elements + resistance core)**
   into a phased implementation plan like the 2026-05-19 overhaul doc?
