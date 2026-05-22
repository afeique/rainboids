# Enemy Uniqueness & Enabling Systems — Plan

**Created:** 2026-05-22
**Status:** Plan — captures all deferred enemy/system work so it gets done eventually
**Companions:** `Enemy & Boss Revamp – 2026-05-22.md` (Plan D), `Element & Resistance System – 2026-05-22.md` (A-track), `Arsenal & Combat-Depth Expansion – 2026-05-22.md` (brainstorm)
**Tracked in:** `Plans.md` → Phase **A.E9** (enabling systems) + **A.E10** (uniqueness) + the per-type rows under A.E8c–e.

---

## 0. Why this doc exists

The elements A-track shipped a complete, live system (6.57.0–6.74.0): 7 elements,
two-way resistance, a 6-status engine, synergy reactions, weapon status-on-hit,
item resist affixes, enemy retrofit + 4 archetype behaviors, and 7 new enemy
types built by **pattern-reuse** (Cinder, Glacier, Frost Lance, Ashen, Tesla
Wraith, Plaguebearer, Warden).

But the *remaining* enemy roster — and the deferred "flourishes" on the shipped
types — depend on **enabling systems that don't exist yet**. This doc inventories
those systems, the uniqueness pass that de-reskins the new types, and the
remaining type roster, all dependency-ordered so nothing is lost.

**Guiding principle:** build the *system* once; it unlocks several enemies AND
deepens existing ones. Highest-leverage systems first.

---

## 1. Enabling systems (each unlocks types + deepens the roster)

Ordered by leverage. Each says what it unlocks and a rough approach.

| # | System | Unlocks / deepens | Approach sketch |
|---|---|---|---|
| **SYS-1** | **Player-side elemental statuses** — enemy elemental hits apply BURN / CHILL / CORRODE / SHOCK / MARK to the *player* (HUD indicators, durations). | Cinder contact-ignite, Plaguebearer corrode, Frost Lance chill-graze, TANGERINE oil — **and makes every elemental enemy attack (Stalker Radiant, Drifter Volt, Tangerine Pyro) actually threatening.** The single highest-leverage system. | Mirror the E3 enemy status engine on the player: player status fields + tick in `player.update`/`lifecycle`, applied from `takeDamage(opts.element)` with per-element effects (chill→reduced thrust, burn→DoT, corrode→+dmg-taken). HUD via `hud/status.js`. Cleansed by the **Second Wind** ability. |
| **SYS-2** | **Persistent hazard entities** — ground zones (acid pool, fire field, frost patch) that DoT/status anything inside for a lifetime. | Plaguebearer acid trails, Ember Field (Pyre Stream), Scorched Earth power, Caustic Sprayer weapon. | A pooled `Hazard` entity (pos, radius, element, dps, life) checked each frame against player + enemies; reuse particle FX. |
| **SYS-3** | **Mid-fight enemy spawning** — an enemy spawns other enemies during a wave. | Spore Carrier (drones), Hydra (split-on-death), Hivemother boss (egg-sacs). | A helper the enemy calls to request a spawn from the wave/enemy pool at a position; cap concurrent spawns. |
| **SYS-4** | **Projectile absorption** — enemy consumes player bullets in a cone/radius, gaining shield. | Devourer. | In the bullet-vs-enemy collision, if the enemy `eatsProjectiles` and the bullet enters its maw cone, consume the bullet (no damage) + grant the enemy temp shield; beams/melee bypass. |
| **SYS-5** | **Cloak / invisibility** — periodic invisibility (skip render + reduce targetability), revealed by MARK or AoE. | Phantom. | `cloakUntil` toggling; render skips; homing/aim ignores while cloaked unless MARKed. |
| **SYS-6** | **Projectile reflection** — enemy reflects player bullets back as enemy bullets. | Prism Mirror. | On bullet hit, if `reflects`, spawn an enemy bullet back along the reflected vector instead of taking damage (front arc); beams/melee bypass. |
| **SYS-7** | **Ally support auras** — an enemy shields / heals / buffs nearby allies. | Lumen Drone (ally shield), Conduit Node (ally damage buff + tether), Bulwark Drone (frontal shield over allies). | Per-frame aura: find allies in radius, apply a temp shield/heal/buff flag they read in their damage/fire paths. "Kill the support first" tactic. |
| **SYS-8** | **Player-buff removal** — enemy strips a random player powerup/buff on contact. | Leech. | On player contact, remove or suppress one active powerup/skill-buff for a duration; FX + toast. Reads the powerup map + 4-slot skill model. |
| **SYS-9** | **Skill-suppress aura** — enemy aura that lengthens player skill cooldowns / locks skills nearby. | Null Drone. | While the player is in the aura, scale skill cooldown regen / block activation; HUD cue. Reads the 4-slot skill model. |
| **SYS-10** | **Enemy teleport / burrow** — short blink or burrow→re-emerge movement. | Tesla Wraith teleport, Wraithworm. | A movement mode that periodically relocates the enemy (with telegraph), guarded so it can't blink while frozen. |
| **SYS-11** | **Generalized telegraphed strike** — warning → committed attack (TITAN sweep already does a bespoke version). | Ashen telegraph, Juggernaut ram, boss attacks. | Extract TITAN's telegraph into a reusable "wind-up → strike" helper. |

---

## 2. Enemy uniqueness pass (de-reskin)

The 7 shipped new types reuse existing **shapes** (tinted) and **patterns**.
Make them visually + behaviorally distinct.

- **UNIQ-1 — Distinct render shapes:** new draw methods in `render/shapes.js` +
  `SHAPE_DRAW_MAP` for Cinder (ember), Glacier (ice crystal), Frost Lance (icicle
  lance), Ashen (cracked bomb), Tesla Wraith (arc node), Plaguebearer (bloated
  sac), Warden (faceted prism). *(Parallelizable — disjoint from logic.)*
- **UNIQ-2 — Distinct behaviors:** give each a signature movement/attack beyond
  the reused pattern (e.g. Cinder kamikaze dive, Glacier slow advance + slam,
  Warden color-telegraphed resist wall).
- **UNIQ-3 — Wire deferred flourishes** once their system lands: Cinder
  contact-ignite (SYS-1), Glacier brittle-shatter (custom), Frost Lance chill
  (SYS-1), Ashen telegraph (SYS-11), Tesla teleport (SYS-10), Plaguebearer acid
  trails (SYS-2), TANGERINE oil mines (SYS-1/2), TITAN demote → roving elite +
  rotating weak-core (Plan D).

---

## 3. Remaining new enemy types (mapped to the system each needs)

| Type | Element | Needs | Batch |
|---|---|---|---|
| Conduit Node | Volt | SYS-7 (ally buff + tether) | A.E8c |
| Spore Carrier | Toxic | SYS-3 (spawn) | A.E8c |
| Devourer | Void | SYS-4 (bullet-eat) | A.E8d |
| Phantom | Void | SYS-5 (cloak) + MARK reveal | A.E8d |
| Prism Mirror | Radiant | SYS-6 (reflect) | A.E8d |
| Lumen Drone | Radiant | SYS-7 (ally shield) | A.E8d |
| Beacon | Radiant | aggro/decoy + MARK magnet | A.E8d |
| Leech | — | SYS-8 (buff strip) | A.E8e |
| Null Drone | — | SYS-9 (skill suppress) | A.E8e |
| Hydra | Kinetic | SYS-3 (split on death, AoE/overkill-gated) | A.E8e |
| Juggernaut | Kinetic | SYS-11 (telegraphed ram) | A.E8e |
| Thornback | — | counter-burst on hit (reuse RETALIATION pulse) | A.E8e |
| Wraithworm | — | SYS-10 (burrow→lunge) | A.E8e |
| Artillery/controllers (Pyrewing, Hailmother, Storm Diver, Bile Mortar, Singularity Mite) | mixed | SYS-2 / SYS-11 / reuse | A.E8e |

---

## 4. Dependency-ordered roadmap

1. **SYS-1 (player statuses)** — biggest single deepening; unblocks 3 deferred
   flourishes + makes the existing elemental roster bite. **Do first.**
2. **UNIQ-1 (shapes)** — parallelizable (subagent on `shapes.js`); makes the
   7 shipped types look distinct. Can run alongside SYS-1.
3. **SYS-2 (hazards)** + **SYS-3 (spawn)** — unlock Plaguebearer trails, Spore
   Carrier, Hydra, and feed the Pyre/Caustic/Scorched-Earth weapons.
4. **SYS-7 (ally auras)** — unlocks Conduit Node, Lumen Drone, Bulwark Drone.
5. **SYS-4/5/6 (eat / cloak / reflect)** — unlock Devourer, Phantom, Prism
   Mirror (the "tactical puzzle" types).
6. **SYS-8/9 (buff-strip / skill-suppress)** — unlock Leech, Null Drone
   (anti-meta; read the 4-slot skill model).
7. **SYS-10/11 (teleport / telegraph)** — Wraithworm, Juggernaut + the deferred
   Tesla teleport / Ashen telegraph.
8. **Remaining types + UNIQ-2/3** — fill each in as its system lands.
9. Then (or interleaved): the **roguelite overhaul (Plans E–I)** and **Plan D
   bosses** (the bosses lean on these same systems — turrets/spawns/adaptive).

Each system = its own MINOR(s) + tests; each type = a small follow-up once its
system exists. Run the AI survival e2e per batch.

---

## 5. Open questions

1. **Player-status severity** — how punishing should player burn/chill/corrode
   be? (Lean light + cleansable, since the player can't always avoid elemental
   hits.)
2. **Hazard density cap** — max simultaneous hazards on screen (perf + fairness)?
3. **Spawn caps** — max enemies a Spore Carrier / Hydra can add (perf + balance)?
4. **Uniqueness priority** — distinct shapes (UNIQ-1) before or after the
   enabling systems? (Recommend alongside — it's parallelizable and improves the
   already-shipped types immediately.)
5. **This track vs roguelite** — keep building enemy systems to completion, or
   interleave with the roguelite overhaul? (Bosses (Plan D) need these systems,
   so finishing systems first also unblocks bosses.)
