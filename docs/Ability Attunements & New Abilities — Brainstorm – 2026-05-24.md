# Ability Attunements, Upgrades & New Abilities — Brainstorm
*2026-05-24 — for review. Nothing here is implemented yet; this is the design backlog the user asked for.*

> **★ DECISIONS (2026-05-24, refined w/ afeique) — read first.** See the companion
> `Energy & Health Systems — Brainstorm + Ability Audit` doc for the master decision log. Key calls that
> reshape §2 below:
> - **The 4 elemental fields collapse into ONE `FIELD_PROJECTOR` ability** whose element is the attunement
>   (Pyro→burn, Cryo→freeze, Volt→shock, Void→heavy slow+pull). The per-field "upgrades" in §2 (CRYO_FIELD /
>   STASIS_FIELD / STORM_CELL / PYRE_AURA) become **FIELD_PROJECTOR's attunement behaviors + shared upgrades**
>   (radius / duration / lingering trail / a cross-element reaction capstone). This frees 3 ability slots.
> - **ELEMENTAL_INFUSION is reworked → "Attune"**: lock shots to ONE chosen element + amplify (Prismatic Soul
>   stays the auto-cycler). So §2's ELEMENTAL_INFUSION upgrades fold into the reworked single-element ability.
>   *(Open: rework vs. cut — afeique to confirm.)*
> - **SENTRY_DRONE: keep + rework** (aim-targeted, gains fire rate per kill, recast-to-reposition) and **trim
>   its 6 elemental attunements to 3** (Pyro incendiary / Volt chain-shot / Cryo chilling).
> - **BLINK / GRAVITY_SNARE / DESIGNATOR / SECOND_WIND** get the upgrades proposed in §2 (fills their rings).

## Why this doc
Two asks:
1. **Every Defense ability should have something unlockable** in the BUILD tree (an attunement and/or upgrade). Today several abilities show an empty ring — no orbiting bubbles — because they have no ability-attunements *and* no ability-upgrades wired into the tree.
2. **Brainstorm new abilities** (do NOT implement) — captured in §3.

Data shapes (from `js/modules/combat/weapon-data.js`):
- **Ability attunement** spec row: `[SUFFIX, ELEMENT, 'Name', 'Description']` in `_ABILITY_ATTUNE_SPEC[ABILITY]`; expands to `ABILITY_ATTUNEMENTS[ABILITY_SUFFIX] = { id, name, element, ability, description, cost }`. Unlock category `abilityAttunements` (6000 gold each).
- **Ability upgrade**: `ABILITY_UPGRADES[ID] = { id, name, description, cost, maxStacks, ability, icon }` (e.g. BULWARK's FORTIFY/IRON_WILL/RETALIATION). *Open question for the user: are ABILITY_UPGRADES surfaced as BUILD-tree bubbles, or only as in-run cards? If not in the tree, wiring them as orbiting "upgrade" nodes (like weapon mechanic-mods) is the cleanest way to fill empty rings.*

---

## 1. Current coverage audit (14 Defense abilities)

| Ability | Elemental attunements | Upgrades | Ring today |
|---|---|---|---|
| BULWARK | 4 (Pyro/Volt/Cryo/Void) | FORTIFY, IRON_WILL, RETALIATION | full |
| FIELD_MEDIC | 2 (Radiant/Pyro) | POTENCY, EMERGENCY_PROTOCOL | full |
| DEFLECTOR_ORBS | 3 (Volt/Pyro/Cryo) | EXTRA_ORB, HARDENED_ORBS, REFLECT | full |
| EMP_PULSE | 4 (Volt/Cryo/Pyro/Void) | WIDE_BAND, EMP_OVERLOAD, CASCADE | full |
| SENTRY_DRONE | 6 (all) | EXTRA_DRONE, RAPID_DRONE, DRONE_CALIBER | full |
| BLINK | 4 (Pyro/Volt/Void/Cryo) | **none** | attunements only |
| GRAVITY_SNARE | 4 (Void/Cryo/Pyro/Toxic) | **none** | attunements only |
| DESIGNATOR | 3 (Toxic/Pyro/Cryo) | **none** | attunements only |
| SECOND_WIND | 3 (Pyro/Volt/Cryo) | **none** | attunements only |
| ELEMENTAL_INFUSION | **none** (already all-element) | **none** | **EMPTY** |
| CRYO_FIELD | **none** (already Cryo) | **none** | **EMPTY** |
| STASIS_FIELD | **none** (already Cryo) | **none** | **EMPTY** |
| STORM_CELL | **none** (already Volt) | **none** | **EMPTY** |
| PYRE_AURA | **none** (already Pyro) | **none** | **EMPTY** |

**Gaps to fix:** the 5 EMPTY abilities need *something*; the 4 "attunements only" abilities should get upgrades so their rings match the established ones.

Design principle for the 5 already-elemental fields: an elemental attunement doesn't fit (they ARE an element). Give them **mechanic/behavior UPGRADES** instead — radius, duration, a second element overlay (a *reaction* rather than a re-element), or a unique twist.

---

## 2. Proposed attunements & upgrades (fills the gaps)

> Format mirrors the existing systems so these drop in cleanly. Upgrades use `maxStacks: 1` unless noted. Costs follow the existing tiers (attunement 6000; upgrades use the SP `cost` field like 2–3).

### CRYO_FIELD (freeze zone) — upgrades
- **DEEP_FREEZE** — enemies that stay in the field >1.5s FREEZE solid (not just chill).
- **PERMAFROST** — +40% field radius and +2s duration.
- **COLD_SNAP** — leaving the field leaves a lingering chill trail for 2s.
- *(Cross-element reaction upgrade)* **FLASH_FROST** — frozen enemies in-field that take any Pyro damage SHATTER for AoE (enables the freeze→shatter combo without re-elementing the field).

### STASIS_FIELD (slow zone) — upgrades
- **TIME_DILATION** — slow strengthened 40% → 65%; also slows enemy projectiles in-field.
- **EVENT_BUBBLE** — +50% radius.
- **GRAVITY_LOCK** — enemies in-field are also pulled gently toward center (groups them).
- **REWIND** — when the field ends, briefly knock back everything still inside.

### STORM_CELL (shock zone) — upgrades
- **OVERVOLT** — the zone arcs a chain bolt between in-zone enemies every 0.5s.
- **STATIC_FIELD** — conducted enemies take +25% from all your sources.
- **TESLA_TOWER** — +50% radius and the center emits a periodic stun pulse.
- **GROUNDING** — you gain a small shield while standing in your own storm.

### PYRE_AURA (burn zone) — upgrades
- **CONFLAGRATION** — burn stacks in-zone tick 50% faster.
- **BACKDRAFT** — enemies dying in the zone explode for fire AoE.
- **EMBER_WAKE** — leaves a 2s burning trail where the aura passed.
- **OIL_IGNITION** — oiled (Toxic) enemies that enter the aura instantly FLARE.

### ELEMENTAL_INFUSION (re-element your shots, cycles) — upgrades
- **ATTUNED_FLOW** — hold to LOCK the current element instead of auto-cycling.
- **PRISM_OVERCHARGE** — infused shots deal +20% and apply +1 status stack.
- **RESONANT_INFUSION** — +50% duration; the buff persists 2s after the timer if you keep firing.
- **DUAL_CHANNEL** — infuses TWO elements at once (damage splits, à la weapon attunements).

### BLINK (teleport + i-frames) — upgrades
- **DOUBLE_JUMP** — 2 charges (recharge independently).
- **PHASE_TRAIL** — leaves a damaging afterimage line along the blink path.
- **DISPLACE** — arriving shoves nearby enemies outward.
- **LONG_WARP** — +40% blink distance and +0.2s i-frames.

### GRAVITY_SNARE (yank inward) — upgrades
- **SINGULARITY_CORE** — snared cluster takes a Void implosion on release.
- **WIDE_GRASP** — +50% pull radius.
- **CRUSH** — enemies held >1s take ramping damage.
- **TETHER** — the snare lingers 1.5s longer at reduced strength.

### DESIGNATOR (AoE MARK) — upgrades
- **PAINT_THE_TOWN** — +60% mark radius.
- **EXECUTION_ORDER** — marked enemies take +15% from everything (not just you).
- **RELAY** — killing a marked enemy spreads the mark to the nearest unmarked one.
- **LINGER** — marks last 50% longer.

### SECOND_WIND (cheat death once) — upgrades
- **ADRENALINE** — on trigger, +30% fire rate & move speed for 4s.
- **PHOENIX** — trigger also emits a knockback + ignite nova.
- **FORTIFIED_REVIVE** — revive at 50% HP instead of 30%.
- **FAST_RECOVERY** — shorter post-revive i-frame cooldown before it can re-arm (run-long).

### (Optional) upgrades for abilities that already have some
Round these out to 3 each if desired — FIELD_MEDIC could get **TRIAGE** (overheal → temp shield), EMP_PULSE a **SHORT_CIRCUIT** (disables enemy firing briefly), etc. Not required to clear the "empty ring" problem.

---

## 3. New ability ideas (brainstorm only — DO NOT implement)

Grouped by archetype. Each notes the unique verb so it doesn't overlap the 14 existing abilities.

### Mobility / tempo
- **Slipstream** — dash leaves a speed-boost lane allies (and you) can ride; chains into a second dash if you stay in it.
- **Grapple Line** — fire a tether to an enemy/asteroid and yank YOURSELF to it (repositioning + i-frames on arrival).
- **Time Skip** — freeze your own position in time for 1s (fully invulnerable, can't act), then resume — a "wait out the bullet wall" button.

### Zone / control
- **Black Hole** — a stronger, stationary Gravity Snare that also damages; pulls projectiles in too.
- **Mirror Wall** — a deployable barrier segment that blocks/reflects enemy shots for a few seconds.
- **Quarantine** — dome that traps enemies inside (and your shots in), preventing reinforcements from entering.

### Offense / burst
- **Overcharge Core** — next power weapon fires at 3× for free (no energy).
- **Spectral Volley** — fires a fan of homing element-cycling bolts.
- **Detonate** — instantly consume all statuses on all enemies on screen as a big reaction (synergizes with Detonator passive).

### Sustain / defense
- **Nanite Swarm** — a healing/repair cloud that follows you and slowly mends HP + cleanses.
- **Aegis Drone** — a drone that intercepts the next N enemy bullets aimed at you.
- **Last Light** — channel: stand still to rapidly regen, but you can't move while channeling.

### Summon
- **Decoy** — drop a hologram of your ship that draws enemy fire/aggro for a few seconds.
- **Turret Nest** — deploy 2 short-lived stationary auto-turrets.

**Recommended first batch to consider (if/when implemented):** Grapple Line (mobility), Mirror Wall (control), Overcharge Core (offense), Nanite Swarm (sustain), Decoy (summon) — one per archetype, each a clearly new verb.

---

## 4. Implementation notes (for when this is greenlit)
- New ability-attunements: add rows to `_ABILITY_ATTUNE_SPEC` (auto-expands + auto-unlockable). Wire effects where the ability resolves (e.g., the field tick / dash trigger).
- New ability-upgrades: add to `ABILITY_UPGRADES` and **confirm/route them into the BUILD-tree DEFENSE ring** (the empty-ring fix depends on the tree sourcing upgrades, not just attunements).
- Each new unlockable needs a slug icon (`js/modules/ui/icons.js`) for its bubble.
- New abilities: out of scope until reviewed; each needs a cooldown, an activation hook, FX, and an entry in `ABILITIES` + unlock wiring.

---

## 5. Tuned ability numbers (v1 — no-downsides era)
*Concrete values, tuned so each ability **anchors a build** (see Balance Model §3 / build doc). Cooldowns kept close to current; magnitudes pushed up because there are no drawbacks and difficulty scales to meet them (Balance §6).*

### Reworked / collapsed
- **FIELD_PROJECTOR** — cd **16 s**, deploy a zone r **220**, duration **5 s**. Element = chosen attunement:
  - *Pyro:* burn **8 dmg/s** in-zone (rides status/Hex Touch). *Cryo:* chill → **freeze after 1.5 s** in-zone (2.5 s freeze). *Volt:* shock pulse **every 0.5 s**, conducted enemies take **+25%**. *Void:* **slow 65%** + gentle pull to center.
  - Upgrades: **Wide Field** (+40% r), **Sustained** (+2 s), **Lingering** (2 s trail after it ends), capstone **Reaction Core** (in-zone status reactions deal +50%). Anchors: Status Reactionist / Freeze-Shatter / Volt Chain / Zone Controller.
- **Attune** (ex-Elemental Infusion) — cd **14 s**, duration **8 s**: lock shots to ONE chosen element, **+25% that element's damage** and **+1 status stack per hit**. Complements Prismatic Soul (auto-cycle). Anchors: Conduit Caster / any single-element build.
- **Sentry Drone** — cd **18 s**, duration **8 s** (recast repositions). Drone DPS = **~55% of your current primary DPS** (rides the player damage pipeline, so it scales with the build). **6 attunements**, **radial retune** (free). Upgrades: **Extra Drone** (+1, stacks), **Rapid Servo** (+40% RoF), **Heavy Caliber** (+50% drone dmg). Anchors: Swarm Commander.

### Build-anchor reworks
- **Designator** — cd **16 s**, r **360**, mark **6 s**. Reworked payoff: marked enemies take **+20% from all sources**, **your next hit on a marked enemy auto-crits**, and **marked enemies detonate their statuses + drop bonus energy/heal on death**. Anchors: Crit Assassin / Reactionist. (Fixes "useful but not fun" — now it's a burst enabler.)
- **Second Wind** — cd **45 s**. On cast (immediate, fun-to-press): **+30% fire-rate & move-speed for 5 s** AND arms a death-save for that window; if the save triggers, emit a **knockback + ignite nova**. Anchors: aggressive Assassin. (No longer pure insurance.)
- **Bulwark** — cd **20 s**, **50% DR for 4 s** (IRON_WILL → 65%). Universal dive-enabler; glues every bruiser. Keep.

### New abilities (numbers for when greenlit)
- **Overcharge Core** — cd **20 s**: instantly **+60 energy** (or fill to max). Anchors Spellslinger (the "cast NOW" button).
- **Nanite Swarm** — cd **20 s**: a healing cloud follows you **6 s**, **4% max HP/s + cleanse**. Anchors Vampire Bruiser / Regen Juggernaut (sustained vs Field Medic's burst).
- **Decoy** — cd **16 s**: hologram of your ship for **5 s** that draws enemy aggro/fire. Anchors Swarm Commander / Hit-and-Run.

### Existing kept (confirm numbers)
- Field Medic 22 s / 45% burst + cleanse (POTENCY +10%×2). Deflector Orbs 15 s / 3 orbs / 5 s. EMP Pulse 22 s / 2 s stun / r200. Blink 9 s / 220 px / 350 ms i-frames (+ upgrades: 2 charges, phase trail, displace, +40% dist). Gravity Snare 14 s / r320 / pull 0.6 (+ upgrades: implosion, +radius, crush, tether).

> **Tuning lens:** every cooldown/magnitude above is sized for the *designed* build; the adaptive system (Balance §6) absorbs the spread to god-builds. If an ability still anchors no build after tuning, cut or re-theme it (the test that produced FIELD_PROJECTOR).
