# Enemy & Boss Revamp — Design Plan

**Created:** 2026-05-22
**Status:** Design plan — awaiting go-ahead
**Scope:** Solo (`/`) only. Multiplayer is on its own timeline.
**Author:** Claude + Afeique
**Companions:**
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (§5 elements, §7 enemies)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (E1–E8)
- `Plans.md` — this doc deepens **Phase A.E8** and adds a new **boss-design pillar** the
  prior docs only gestured at ("TITAN: rotating telegraphed weak point").

---

## 0. TL;DR — the thesis

The element system (Plans.md Phase A) gives every weapon, enemy, and item a shared
elemental language. But two things still hold combat back:

1. **The roster is shallow.** 10 enemy types, all currently Kinetic/neutral, mostly
   differentiated by *bullet pattern* rather than by a **mechanical verb** that changes
   how you fight them. We have a rich behavior engine (≈30 movement patterns, ≈20 firing
   patterns, formations, statuses) that almost no enemy fully exploits.
2. **Bosses don't exist as bosses.** Every "boss" in the game is a **scaled-up TITAN**
   (`BOSS_TIER_STATS` 4–8× HP, 1.35–1.75× size) spawned in a formation of 1–5, with a
   single rage trigger at 33% HP. No unique silhouettes, no real phases (Tier-4 only
   swaps *movement*, not attacks), no boss healthbar, no names, no intro, no music sting,
   no death spectacle. Ten "boss waves" all feel like the same fight at different counts.

This plan does three things:

- **A — Revamps the existing 10** with elements + a distinct *mechanical verb* each
  (armor, bastion shield, swarm-split, adaptive resist, …) so weapon/element choice
  becomes tactical, not flavor.
- **B — Adds ~22 new enemy types** across all 7 elements and 6 roles, every one built
  around a behavior the game can't currently do (bullet-eating, tethers, gravity wells,
  burrowing, decoys, reflect, time-dilation, …).
- **C — Replaces "scaled TITAN" bosses with 10 hand-designed, named, multi-phase boss
  fights** — one per stage — each big, bombastic, element-themed, with telegraphed
  signature attacks, weak-point mechanics, an enrage, a death sequence, and the UI/audio
  to make it an event. Each boss *teaches and exploits* a slice of the element system,
  and the campaign is sequenced so the bosses walk you through all 7 elements.

Nothing here changes the 10-stage / 30-wave / boss-on-every-third-wave structure
(`MAX_WAVES=30`, `BOSS_WAVES=[3,6,…,30]`). It changes *what's in the box*.

---

## 1. Where we stand (grounded snapshot)

### 1.1 The 7 elements (shipped E1, `combat/elements.js`)
Kinetic · Pyro · Cryo · Volt · Toxic · Void · Radiant. Signature statuses (E3): BRN,
CHILL→FREEZE(+brittle/SHATTER), CONDUCT, CORRODE(+BLEED), MARK(+pull), PURGE. Damage =
`base × elementalMultiplier(resist, element)` clamped [0,2]; `1.0` resist = immune,
negative = weakness.

### 1.2 The current 10 enemies (`enemy/enemy-data.js`) — element fields are still neutral stubs
| Enemy | Role today | Move pattern | Fire pattern | The one thing it does |
|---|---|---|---|---|
| HUNTER | fast skirmisher | `hunter_arc` (orbit + lunge + slingshot) | `hunter_single` 3-burst | aggressive orbital strafing |
| GUARDIAN | mid bruiser | `square` (cardinal bursts) | `guardian_spread` 5-fan | fan suppression |
| WASP | swarm | `wasp_zigzag` | `wasp_machinegun` | dodgy in-phase needle stream |
| STALKER | sniper | `arc` | `charged_laser` | telegraphed close laser |
| DRIFTER | beam | `drifter_wave` (undulating orbit) | `arc_lightning` (fractal bolt) | charged lightning beam |
| PROWLER | standoff | `keep_distance` (stationary) | `missile` (homing) | homing missiles from range |
| WEAVER | evasive | `weaver_spinup` (spin→arc→cooldown) | `spiral_laser` | spiral-laser arc passes |
| SENTINEL | turret | `weaver_spinup` | `sentinel_sweep` 8-burst | circle bursts on cooldown |
| TANGERINE | bomber | `chase` | `lay_mine` (homing mine) | proximity mines |
| TITAN | "boss" | `boulder`/`hexagon` | `sweep_laser` | sweeping beam; **doubles as every boss** |

We also have, unused or underused by the roster: `diamondMovement`, `knightMovement`
(L-shaped hops), `stealthMovement` (approach/retreat phases), `spiralBurstMovement`,
`tankMovement` (hull+turret), `heavyCrawlMovement`, formation types
(orbit/weave/flank/cross/figure8), and bullet behaviors (`titan_tomahawk`,
`missile_fast_slow`, `homing_mine`, persistent lightning). **A lot of the new content
below is just wiring existing behaviors to new bodies + the new element/status hooks.**

### 1.3 The boss reality (`enemy/boss-rage.js`, `wave/wave-data.js`)
- Every boss is `{ type:'TITAN', isBoss:true, bossTier:1–4 }`. `BOSS_TIER_STATS` multiplies
  HP ×4–8, size ×1.35–1.75, speed ×1.0–1.15.
- Rage: telegraph 24f → 1.5s invuln → 16-bullet tantrum → fire-rate ×0.66 + homing for
  the rest of the fight, **once**, at ≤33% HP.
- Tiers add *formation* only: T2 pair (partner-death enrage), T3 triple orbit, T4
  12s formation↔free phase toggle. **No phase has unique attacks.**
- HUD: no boss bar — bosses reuse the transient `drawTargetInfo` panel that any hit shows.
- No intro, no name, no music change, no special death.

This is the biggest gap-to-payoff ratio in the game.

---

## 2. Design pillars for the revamp

1. **Every enemy owns a verb.** If you can describe two enemies the same way ("shoots a
   spread"), one is redundant. Each type below has a single sentence that no other type's
   sentence matches.
2. **Elements make the verb tactical.** An enemy's element/resist isn't decoration — it
   should change *which tool* you reach for. Weakness = a 1.5–2× damage swing; immunity =
   "do not bring that here."
3. **Bosses are encounters, not big mobs.** A boss has a name, a healthbar, an arena, a
   beginning/middle/end, and at least one mechanic you can *fail* (a telegraph you must
   answer). It should be screenshot-worthy.
4. **Teach by fighting.** The 10-boss campaign is a guided tour of the element system:
   each boss spotlights an element (or the resistance mechanic itself), in roughly the
   order the player unlocks counters for it.
5. **Reuse the engine.** Prefer composing existing movement/firing/formation/FX primitives
   over net-new systems. Net-new systems (boss healthbar, weak-points, multi-part bodies,
   arena modifiers) are called out explicitly in §6 as shared infrastructure.

---

## 3. Revamp the existing 10 (element + a verb each)

This extends the brainstorm's §7.1 table into concrete behavior changes. Resist values use
the E1 convention (`+` resist, `−` weak, `1.0` immune). "Verb" = the new mechanic to add.

| Enemy | Attack element | Resists | Weak to | **New verb to add** |
|---|---|---|---|---|
| **HUNTER** | Kinetic | — | — | *Pack tactics:* when ≥3 Hunters alive, they sync lunges (`hunter_arc` slingshot) so dives arrive together. Baseline of the roster; no resist quirks. |
| **GUARDIAN** | Kinetic | Kinetic **+0.45** | Volt **−0.5** | **Armor / damage floor:** subtract a flat amount per hit (chip damage wasted), so big hits + CORRODE matter. Frontal plate only — rear takes full damage. |
| **WASP** | Kinetic | — | Cryo **−0.6** | **True swarm:** spawns in packs of 4–6 sharing a `swarmMovement` flock; CHILL→FREEZE one and a SHATTER clears the cluster. Rewards Cryo AoE. |
| **STALKER** | Radiant (laser) | Radiant **+0.5** | Void **−0.6** | **Sniper line + cloak:** longer charge, draws a persistent targeting line; briefly cloaks (`stealthMovement` retreat) after firing. Void MARK reveals + punishes. |
| **DRIFTER** | Volt (arc) | Volt **+0.75** | Toxic **−0.5** | **Self-CONDUCT field:** sits in a CONDUCT puddle that buffs *its own* and allies' Volt; you must CORRODE it to bypass the Volt resist. |
| **PROWLER** | Kinetic (missiles) | Cryo **+0.4** | Pyro **−0.5** | **Standoff swarm-launcher:** volleys of `missile_fast_slow`; missiles are destructible. Burn it down before the next volley. |
| **WEAVER** | Radiant (spiral) | — | Cryo **−0.5** | **Untouchable while arcing:** evasion spikes during `arcing`; FREEZE during the spin-up window is the only clean opening. |
| **SENTINEL** | Radiant (sweep) | Radiant **+0.6** front | Kinetic **−0.4** rear | **Directional bastion shield:** frontal arc blocks/reflects projectiles entirely; flank, bounce a Carom, Void-pull to spin it, or Radiant-PURGE the shield. |
| **TANGERINE** | Pyro (mines) | Pyro **+1.0 (immune)** | Cryo **−0.6** | **OIL bomber:** mines leave an **OIL** slick on detonation; a Pyro hit on the slick flares (synergy bait *against* you). Don't fight fire with fire. |
| **TITAN** | mixed | high all-around, **rotating weak point** | the exposed element | **Demoted from "boss":** becomes a genuine elite/mini-boss — a roving heavy with a rotating elemental weak-core (hit the exposed facet with the matching element). TITAN is **no longer the stand-in for stage bosses** (§5 replaces those). |

> Shipping just **GUARDIAN-armor + WASP-swarm + SENTINEL-bastion + TANGERINE-OIL** turns
> four "shoots a pattern" enemies into four distinct tactical problems, before a single new
> type ships. This is the cheapest, highest-impact slice.

---

## 4. New enemy roster (~22 types, all 7 elements, 6 roles)

Builds on the brainstorm's §7.2/§7.3 (Cinder, Glacier, Tesla Wraith, Plaguebearer,
Devourer, Prism Mirror, Mender, Phantom, Hydra, Warden, Leech, Null Drone, Bulwark Drone)
and adds new verbs to fill the gaps. **Bold rows are new beyond the brainstorm.** Each
maps to existing engine primitives where possible (noted in *italics*).

### 4.1 Pyro (fire — DoT, OIL, area denial)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Cinder** | swarm | Pyro / Pyro-immune, weak Cryo | Fast suicide-divers (`fishDartMovement`); contact applies BRN. Die in a small fire puff. AoE/Cryo clears them. |
| **Pyrewing** *(new)* | artillery | Pyro / Pyro-immune, weak Cryo | Strafing bomber that paints **lines of fire** behind it (persistent EMBER_FIELD bullets) — denies lanes. *reuse `lay_mine` lifetime + a trail emitter.* |
| **Ashen Detonator** *(new)* | specialist | Pyro / weak Cryo | On death, drops a 1.5s telegraphed circle then a **delayed flare** — punishes face-tanking the kill. *reuse rage tantrum ring FX.* |

### 4.2 Cryo (ice — slow, freeze, brittle)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Glacier** | bruiser/tank | Cryo / Cryo-immune, weak Pyro | Slow `heavyCrawlMovement`; chills the player on proximity; **becomes brittle if you over-freeze it** (a heavy Pyro hit shatters it for AoE). High HP, low threat alone. |
| **Frost Lance** *(new)* | sniper | Cryo / weak Pyro | Charges a beam that applies **CHILL on graze, FREEZE on direct** — turns *you* into the brittle one (sets up enemy melee). Pyro resist makes it tanky to the obvious counter. |
| **Hailmother** *(new)* | artillery | Cryo / weak Pyro | Lobs arcing shards that **leave CHILL pools** on the ground; standing in them slows your thrust. Area-denial controller. |

### 4.3 Volt (lightning — chains, teleport, CONDUCT)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Tesla Wraith** | skirmisher | Volt / Volt-immune, weak Toxic | Short-range **teleports** (blink to a new orbit slot) then chains a shock. CORRODE first, then burst — it can't blink while FROZEN. |
| **Conduit Node** *(new, support)* | support | Volt / Volt resist | Stationary pylon that **tethers a damaging arc to every nearby enemy** and grants them CONDUCT. Kill the node to drop the buff + the lane-cutting arcs. *reuse a beam-segment bullet between two points.* |
| **Storm Diver** *(new)* | bruiser | Volt / weak Toxic | Telegraphed dive that leaves a **lingering CONDUCT puddle** where it lands — if you're standing in it, the next Volt hit crits you. |

### 4.4 Toxic (acid/bio — CORRODE, DoT, spawns)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Plaguebearer** | controller | Toxic / Toxic resist, weak Radiant | Leaves **acid trails** (persistent CORRODE pools) and periodically births spore-lings. Area denial + add pressure. |
| **Spore Carrier** *(new, carrier)* | carrier | Toxic / weak Radiant | A slow flyer that **spawns 2–3 drones every few seconds** until killed; the drones inherit a weak CORRODE-on-hit. The "kill the source" target-priority lesson. |
| **Bile Mortar** *(new)* | artillery | Toxic / weak Radiant | Lobs blobs that **burst into expanding CORRODE clouds**; lingering vulnerability zones you must move through carefully. |

### 4.5 Void (gravity/dark — pull, MARK, stealth, eat)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Devourer** | specialist | Void / Void-immune, weak Radiant | **Eats your projectiles** in a frontal cone (gains a temp shield per bullet absorbed); pulls you toward it. Beams (continuous) and melee bypass the eat. |
| **Phantom** | skirmisher | Void / — | Periodic **invisibility** (untargetable, no homing lock); only MARK / persistent AoE / a lucky hit reveals it. Punishes lazy auto-aim builds. |
| **Singularity Mite** *(new)* | controller | Void / weak Radiant | Drops a tiny **gravity well** that drags *both* the player and bullets toward a point — disrupts your aim and dodge. *reuse Singularity power-weapon pull math, inverted.* |
| **Wraithworm** *(new)* | bruiser | Void / weak Radiant | **Burrows** (submerges = untargetable) and re-emerges under the player for a contact lunge. A timing/positioning fight, not a DPS one. |

### 4.6 Radiant (plasma/light — shields, reflect, PURGE, beams)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Prism Mirror** | specialist | Radiant / Radiant resist, weak Kinetic | **Reflects projectiles** back at you (immune to its own reflected element). Melee / Photon Blade / non-projectile AoE are the answers. |
| **Lumen Drone** *(new, support)* | support | Radiant / Radiant resist | Projects a **regenerating bubble shield over nearby allies** (the §7.3 Bulwark Drone, Radiant-flavored). Kill it first or PURGE the shield. |
| **Beacon** *(new, decoy)* | specialist | Radiant / — | A bright **homing/MARK magnet** — soaks all your seeking shots and marked-target priority, protecting the real threats. Anti-"set it and forget it." |

### 4.7 Kinetic / neutral & anti-meta (keep builds honest)
| Type | Role | Element / resist | Verb |
|---|---|---|---|
| **Hydra** | bruiser | Kinetic / — | **Splits into two on death** unless the killing blow is AoE or overkills it. Rewards burst / Overkill / Executioner traits. |
| **Juggernaut** *(new)* | bruiser | Kinetic / Kinetic resist, weak Volt | Telegraphed **charge-and-ram** down a lane; lethal on contact, but **stunned + rear-exposed** for ~1.5s after slamming a wall. Read-the-tell fight. |
| **Warden / Adaptive** | anti-meta | adaptive | **Gains resistance to whatever element hit it last** (decays over time). Forces element-switching; the foil for Prismatic Soul. |
| **Leech** | anti-meta | Void / — | **Strips a player buff on hit** (a skill window, an overshield). Counters buff-stacking; makes skill *timing* matter. |
| **Null Drone** | anti-meta | Volt / — | Projects an aura where **skills cost more / cool slower**. Punishes skill-spam; rewards positioning + killing it. |
| **Thornback** *(new)* | bruiser | Kinetic / Kinetic resist | **Counter-attacks when hit** (emits a small retaliatory burst on each damage instance) — punishes mindless full-auto into it; reward measured bursts / range. |

### 4.8 Roster math & sequencing
That's **10 revamped + 22 new = 32 distinct enemies** across 6 roles
(skirmisher / bruiser / artillery / controller / support / specialist) and all 7 elements.
Ship in **batches that pair with the boss they precede** (see §5.5), each batch ≥1 MINOR:

- **Batch 1 (cheap, huge):** the 4 existing-enemy verbs (GUARDIAN armor, WASP swarm,
  SENTINEL bastion, TANGERINE OIL) + Warden. *Pure retrofit, no new art beyond shields/OIL FX.*
- **Batch 2 (Pyro/Cryo):** Cinder, Glacier, Ashen Detonator, Frost Lance.
- **Batch 3 (Volt/Toxic):** Tesla Wraith, Conduit Node, Plaguebearer, Spore Carrier.
- **Batch 4 (Void/Radiant):** Devourer, Phantom, Prism Mirror, Lumen Drone, Beacon.
- **Batch 5 (anti-meta + bruisers):** Leech, Null Drone, Hydra, Juggernaut, Thornback,
  Wraithworm, + the remaining artillery/controllers.

---

## 5. BOSSES — 10 unique, named, multi-phase fights ⭐ (the marquee)

**The replacement thesis:** retire "scaled TITAN in a formation" as the stage-boss. Each of
the 10 stage finals (waves 3,6,9,…,30) becomes a **single hand-designed boss** (sometimes
with adds), with a name, a healthbar, HP-gated **phases that each carry their own attack
set**, telegraphed signature moves, a weak-point/counterplay mechanic, an enrage, and a
death sequence. The campaign is sequenced so the bosses tour all 7 elements in roughly the
order the player gains counters.

> The existing `bossTier`/`BOSS_TIER_STATS`/`boss-rage.js` machinery is **reused as the
> chassis** (HP/size scaling, rage telegraph, invuln window, formation math) but each boss
> overlays a unique phase script. The Tier-2 partner-death enrage and Tier-3/4 formation
> code are repurposed for the multi-body bosses (GEMINI, MAELSTROM).

### 5.0 Boss campaign at a glance
| Stage | Wave | Boss | Element | Core teaching |
|---|---|---|---|---|
| 1 | 3 | **THE HARBINGER** | Kinetic | phases, telegraphs, weak-points (tutorial boss) |
| 2 | 6 | **THE AEGIS** | Kinetic / armor | flanking + CORRODE vs. armor & directional shields |
| 3 | 9 | **LUMEN, THE PRISM SOVEREIGN** | Radiant | reflect/shield/PURGE; don't faceroll projectiles |
| 4 | 12 | **GEMINI** (fire + ice twins) | Pyro + Cryo | element-switching mid-fight; opposite weaknesses; partner enrage |
| 5 | 15 | **MAELSTROM, THE STORM CROWN** | Volt | CONDUCT zones, chain lightning, conduit priority |
| 6 | 18 | **THE HIVEMOTHER** | Toxic | add management, CORRODE zones, kill-the-source |
| 7 | 21 | **THE IRON THRONE** | mixed (multi-turret) | combined arms; per-element turret weak-points |
| 8 | 24 | **THE WARDEN PRIME** | adaptive | the resistance system itself; forced element rotation |
| 9 | 27 | **NULLMAW, THE DEVOURER** | Void | gravity wells, bullet-eating, MARK; positioning over DPS |
| 10 | 30 | **THE PRISMARCH (OMEGA)** | all 7 / prismatic | the final exam — remixes every prior boss, cycles all elements |

Each boss below: **identity & look · stats & arena · phases (with per-phase attacks) ·
signature telegraphed attacks · weak-point/counterplay · enrage · death · what it teaches.**
HP figures are *relative budgets* (× a normal-enemy-of-its-wave) to tune in playtest, not
final numbers; sizes are × normal enemy radius.

---

### BOSS 1 — THE HARBINGER (Stage 1-3, Kinetic) — *the tutorial boss*
- **Look:** a slab-sided Kinetic dreadnought, ~3× a normal enemy, with **three glowing
  bolt-heads** (the existing "aim for the bolts" subtitle becomes literal weak-points).
- **Stats/arena:** HP ≈ 12× normal; size ×2.6; slow `boulder` drift. Open arena, light
  asteroid cover. Modest add pressure (2 WASP between phases).
- **Phases (2):**
  - **P1 (100→50%) — Suppression:** slow drifts; `guardian_spread` 5-fans + periodic
    `sweep_laser` you walk around. The three bolt-heads are armored; **only an exposed,
    pulsing bolt-head takes damage** (rotates every ~6s). Teaches "find the weak point."
  - **P2 (50→0%) — Bombard:** all three bolt-heads expose; faster fans + a telegraphed
    cross-screen beam. Standard rage telegraph at 33% kicks in (reused).
- **Signature:** "BOLT VOLLEY" — winds up (1.5s telegraph) then fires three aimed heavy
  triangles at your *predicted* position; sidestep on the tell.
- **Weak-point/counterplay:** the rotating bolt-heads — the whole game's "telegraphed weak
  point" lesson, with no resist trickery yet (Kinetic = always works).
- **Enrage:** reuse rage tantrum (16-bullet ring) + homing.
- **Death:** the three heads pop in sequence, then a big white shatter + slow-mo beat.
- **Teaches:** phases exist, telegraphs must be answered, hit the glowing bit.

### BOSS 2 — THE AEGIS (Stage 2-6, Kinetic / heavy armor) — *the wall*
- **Look:** a hexagonal fortress ringed by **6 rotating armor plates**; ~3× size. Reads as
  "a Guardian that became a building."
- **Stats/arena:** HP ≈ 14×; size ×2.8; very slow. Plates spin slowly; a **gap** in the ring
  rotates around it.
- **Phases (2):**
  - **P1 — Turtle:** plated front is near-immune (flat damage floor like GUARDIAN armor);
    you must shoot **through the rotating gap** or hit the rear. Fires `crescent_wave`
    slices along the plate edges. **CORRODE bypasses the armor floor** — the intended answer.
  - **P2 (≤50%) — Plate shed:** sheds plates one by one (each a destructible add that
    bursts into shrapnel), exposing more core. Faster crescent sweeps.
- **Signature:** "BULWARK SLAM" — pulls inward, then expands all plates outward as a
  ring-burst; bait it near a plate gap.
- **Weak-point/counterplay:** the moving gap, the rear, and **CORRODE** to melt the armor
  floor. First boss that *demands* a status to be efficient.
- **Enrage:** spins plates fast + continuous crescent ring.
- **Death:** plates blow off radially, core implodes.
- **Teaches:** armor & directional defense; CORRODE as the universal solvent; positioning.

### BOSS 3 — LUMEN, THE PRISM SOVEREIGN (Stage 3-9, Radiant) — *the beam boss*
- **Look:** a faceted crystalline eye, ~2.8×, suspended in a slowly rotating ring of
  mirror-shards. White-gold glow.
- **Stats/arena:** HP ≈ 13×; floats and repositions (`orbitalMovement`). The shard-ring
  **reflects your projectiles** (Prism Mirror mechanic at boss scale).
- **Phases (3):**
  - **P1 — Refraction:** sweeping Radiant beams (`sweep_laser`, wider) + the reflective
    shard-ring. Shooting the ring sends your shots back — **PURGE / Radiant / melee /
    beams** pass through; brute projectile spam punishes you.
  - **P2 (≤66%) — Prism array:** spawns 4 **Lumen Drones** that project a bubble shield over
    Lumen — kill the drones (target-priority) to drop the shield.
  - **P3 (≤33%) — Starfall:** arena-wide telegraphed light-pillars (safe-spot bullet-hell);
    plus a charged "DISJUNCTION" beam that PURGES one of *your* buffs on hit.
- **Signature:** "DISJUNCTION" — a slow, bright cross-arena beam; standing in it strips a
  buff and deals heavy Radiant. Big visual tell.
- **Weak-point/counterplay:** don't out-DPS the mirror — bring Radiant/PURGE/melee/beams;
  kill the shield drones; dodge the pillars.
- **Enrage:** the shard-ring spins into a continuous reflect-wall; pillars come faster.
- **Death:** the crystal cracks along its facets, then a prismatic light-burst (reuse
  rainbow-cycle FX — on-brand).
- **Teaches:** reflect/shield mechanics; Radiant's anti-defensive identity; that some
  enemies punish raw projectile spam.

### BOSS 4 — GEMINI (Stage 4-12, Pyro **+** Cryo twins) — *element switching, hard*
- **Look:** **two** linked cores orbiting a shared center on a glowing **tether** —
  **PYRA** (orange, fire) and **GLACIA** (cyan, ice). ~2.4× each. Stage 4 is literally
  "Twin Iron"; this is the payoff.
- **Stats/arena:** HP ≈ 8× each. They share the Tier-2 `_bossPair` link and `bossFormation`
  orbit (reused). The **tether between them is a damaging beam** — don't stand in it.
- **The hook — opposite resists:**
  - PYRA: **Pyro-immune, weak Cryo.** GLACIA: **Cryo-immune, weak Pyro.**
  - You *must switch elements* between targets (Elemental Infusion skill / Prismatic /
    swapping weapons) — bringing one element makes one twin unkillable.
- **Phases (2 shared + enrage):**
  - **P1 — Duet:** PYRA paints fire-lines (EMBER_FIELD) while GLACIA drops CHILL pools; the
    tether sweeps. You fight the geometry, not just the bullets.
  - **P2 (one twin dies):** **partner-death enrage** (reused) — the survivor goes berserk:
    PYRA → arena fire-ring pulses; GLACIA → freeze-then-shatter waves. Killing them close
    together avoids the worst of the enrage.
- **Signature:** "THERMAL SHOCK" — both charge, then fire a **fire wall and an ice wall**
  from opposite sides that converge; the safe lane is the moving tether gap.
- **Weak-point/counterplay:** element discipline; manage the kill *order/timing* to control
  the enrage; respect the tether.
- **Death:** the two cores collapse into each other — a fire/ice annihilation burst.
- **Teaches:** the element system's whole point — *bring the right element, switch on the
  fly.* The single most important boss for selling §5.

### BOSS 5 — MAELSTROM, THE STORM CROWN (Stage 5-15, Volt) — *the storm*
- **Look:** a roiling storm-cell crown with **three orbiting conduit nodes**; arcs of
  purple lightning between them. ~3× core.
- **Stats/arena:** HP ≈ 16×; the three Conduit Nodes (reused new type, boss-scaled) tether
  damaging arcs across the arena and grant the core CONDUCT (Volt resist amped).
- **Phases (3 = "Triple Threat"):**
  - **P1 — Static field:** the three arcs rotate as moving walls; the core is **Volt-resist
    while a node lives** — kill nodes (they respawn slowly) to open damage windows.
  - **P2 (≤60%) — Downpour:** **CONDUCT rain** marks puddles on the ground; getting hit by
    Volt while wet crits you. Chain-lightning bursts seek the nearest player position.
  - **P3 (≤30%) — Tempest:** all nodes dead = core enrages; spiraling bullet-hell
    (`shootSpiral` at boss scale) + a screen-wide chain it telegraphs by lighting all
    puddles at once.
- **Signature:** "THUNDERCALL" — 2s wind-up, every CONDUCT puddle detonates simultaneously;
  get out of the wet before it fires.
- **Weak-point/counterplay:** node priority; stay dry or eat crits; CORRODE the core to
  ignore its Volt resist.
- **Death:** the storm collapses inward, one final cross-arena chain, blackout, pop.
- **Teaches:** CONDUCT setup→payoff, conduit/support priority, ground-hazard awareness.

### BOSS 6 — THE HIVEMOTHER (Stage 6-18, Toxic) — *add management*
- **Look:** a bloated, segmented bio-carrier with pulsing egg-sacs; ~3.4×, the biggest yet.
  Trails acid.
- **Stats/arena:** HP ≈ 15× but **most of the threat is the adds.** Leaves **CORRODE acid
  trails** as it crawls (`heavyCrawlMovement`).
- **Phases (3):**
  - **P1 — Brood:** periodically **vents Cinder/Spore-ling swarms** from egg-sacs (reuses
    Spore Carrier). The egg-sacs are destructible weak-points — pop them to stop the
    spawns.
  - **P2 (≤66%) — Bile barrage:** Bile Mortar lobs that bloom into expanding CORRODE clouds;
    the arena fills with vulnerability zones.
  - **P3 (≤33%) — Frenzy birth:** continuous spawns + a charged "PLAGUE WAVE" that CORRODEs
    the whole arena briefly (all your damage to *everything* spikes — risk/reward to burst).
- **Signature:** "EGG BURST" — telegraphed sacs glow then burst into a ring of spore-lings;
  shoot the sac during the tell to cancel it.
- **Weak-point/counterplay:** **Radiant** (its weakness) + AoE for the swarms; pop sacs;
  don't drown in CORRODE clouds. Kill-the-source target priority.
- **Death:** the body deflates, sacs rupture in a green cascade.
- **Teaches:** add management, source-killing, navigating persistent hazard fields.

### BOSS 7 — THE IRON THRONE (Stage 7-21, mixed multi-turret) — *combined arms*
- **Look:** a colossal throne-fortress (the "Iron Crown" stage made literal), ~3.6×, with
  **four independently-targetable turrets**, each a different element. Slow, imperious.
- **Stats/arena:** HP ≈ 18× core, **but the core is invulnerable while turrets live.** Each
  turret: a Pyro flamer, a Cryo frost-lance, a Volt arc, a Radiant beam — each with its own
  element/resist, so you cycle elements to kill them efficiently.
- **Phases (turret-gated, not just HP):**
  - **P1 — Full battery:** all four turrets fire their signature patterns at once (combined
    arms — fire lines + freeze pools + arcs + sweeping beam). Kill turrets in any order.
  - **P2 — Core exposed (turrets down):** the throne-core opens; it cycles a **rotating
    elemental weak-facet** (TITAN-style) — hit the exposed facet with the matching element.
  - **Turret respawn:** at ≤33% the core re-arms **two** turrets — a soft enrage.
- **Signature:** "CROWN BARRAGE" — all live turrets charge and fire simultaneously in a
  coordinated cross-pattern; a brief unified telegraph.
- **Weak-point/counterplay:** target-priority across four elements; element-cycling to clear
  turrets fast; the rotating core facet. The element system's "midterm."
- **Death:** turrets blow off one by one, the throne topples and detonates.
- **Teaches:** prioritization under combined arms; element-cycling fluency.

### BOSS 8 — THE WARDEN PRIME (Stage 8-24, adaptive) — *the resistance system, embodied*
- **Look:** a smooth, shifting obelisk whose **color changes to match the element it's
  currently resisting** — a living readout. ~3×.
- **Stats/arena:** HP ≈ 17×. "The Long Walk" = a grinding war of attrition where one element
  is never enough.
- **The hook — adaptive resistance (Warden at boss scale):**
  - Builds **stacking resistance to whatever element hit it most recently** (up to immune),
    decaying slowly. Its color/aura telegraphs the *currently-walled* element so you can
    read when to switch.
  - **Prismatic Soul item trait / Elemental Infusion skill is the dream answer** — this boss
    is the explicit reason those exist.
- **Phases (3, defined by adaptation speed):**
  - **P1:** adapts slowly; punishes one-note builds gently. Standard mixed bullet patterns.
  - **P2 (≤60%):** adapts faster; periodically **hard-locks** to one element (telegraphed),
    daring you to switch off it.
  - **P3 (≤30%):** **rapid cycle** — the wall shifts every few seconds; only fluid
    element-switching keeps DPS up. Bullet patterns intensify.
- **Signature:** "ADAPTIVE PURGE" — when it hard-locks an element, it fires a wave *of that
  element*, turning your own crutch against you.
- **Weak-point/counterplay:** read the color, switch elements, value Prismatic/Infusion.
  Kinetic (no resist quirks) is your reliable fallback but lowest ceiling.
- **Death:** the obelisk cycles through all 7 colors rapidly, then shatters into prisms.
- **Teaches:** mastery of the *whole* resistance system; the value of element flexibility.

### BOSS 9 — NULLMAW, THE DEVOURER (Stage 9-27, Void) — *positioning over DPS*
- **Look:** a vast, dark maw ringed by a swirling accretion disk; ~4× (visually the biggest
  before the finale). "Apocalypse."
- **Stats/arena:** HP ≈ 18×. Sits central and **pulls the player inward** (constant gravity);
  fighting it is a constant fight against the drag.
- **Phases (3):**
  - **P1 — Hunger:** **eats your projectiles** in a frontal cone (Devourer at boss scale),
    healing/shielding per absorbed shot. You must hit it from off-angle or with
    pierce/beams; spamming into the maw *feeds* it.
  - **P2 (≤66%) — Singularity:** spawns roaming **gravity wells** (Singularity Mites) that
    drag you and your bullets — dodge becomes a navigation puzzle. MARKs you periodically
    (homing void bolts seek the mark).
  - **P3 (≤33%) — Event horizon:** the pull intensifies + a telegraphed **implosion**: the
    whole arena sucks inward to a point then erupts; you must thrust *out* during the wind-up.
- **Signature:** "IMPLOSION" — screen edges darken and pull hard for 2s, then a massive
  central Void burst. Distance + dash to survive.
- **Weak-point/counterplay:** **Radiant** (its weakness) cuts through; attack off the eat-cone;
  fight the gravity with positioning and dash; don't feed the maw.
- **Death:** it collapses on itself, an inverted implosion, then a white-out (light beating
  the void) — leads into the finale tonally.
- **Teaches:** Void mechanics (pull/eat/MARK), positioning under constant pressure, that DPS
  alone can lose.

### BOSS 10 — THE PRISMARCH / OMEGA (Stage 10-30, all 7 elements) — *the final exam*
- **Look:** a colossal, shifting prismatic war-engine that **cycles through all 7 element
  colors**, with multiple destructible sub-structures. ~4.5× — the largest entity in the
  game. Animated rainbow core (the Transcendental aesthetic).
- **Stats/arena:** HP ≈ 24×, multi-bar (one bar per phase). The arena itself shifts theme
  per phase. This is a **gauntlet** — the campaign's capstone.
- **Phases (5+ — a tour of the whole game):**
  - **P1 — Aspect of War (Kinetic):** rotating weak-cores + bolt volleys (echoes Harbinger).
  - **P2 — Aspect of Light (Radiant):** reflect-ring + DISJUNCTION beam (echoes Lumen).
  - **P3 — Aspect of Storm/Flux (Volt+Toxic):** CONDUCT rain + CORRODE clouds + chain
    (echoes Maelstrom/Hivemother).
  - **P4 — Aspect of the Void (Void):** pull + implosion + bullet-eat (echoes Nullmaw).
  - **P5 — OMEGA (adaptive/prismatic):** **rapid full-element cycle** like Warden Prime, plus
    a screen-filling bullet-hell finale that remixes every prior signature attack. Demands a
    flexible build (Prismatic Soul, Elemental Infusion, a 4-skill loadout).
  - **Desperation:** at ≤10% in P5, "FINAL JUDGMENT" — a beautiful, dense, fully-telegraphed
    pattern; survive it and the run is won.
- **Signature:** each phase reuses that boss's signature; OMEGA layers two at once.
- **Weak-point/counterplay:** everything you learned — element-switching, weak-points,
  positioning, add control, hazard-reading, skill timing. The build you assembled all run
  is the answer.
- **Death:** a multi-stage, ~4-second cinematic detonation — each aspect's color blows out
  in sequence, ending in a full-spectrum supernova and a victory beat. Roll the run-summary.
- **Teaches:** nothing new — it *tests* the whole system. The payoff.

### 5.5 Boss → enemy-batch pairing
Ship each boss alongside the enemy batch whose mechanics it leans on, so the stage's normal
waves *teach* the boss's tricks:
- B1/B2 ← Batch 1 (existing-enemy verbs + Warden).
- B4 ← Batch 2 (Pyro/Cryo). B5/B6 ← Batch 3 (Volt/Toxic). B3/B9 ← Batch 4 (Void/Radiant).
- B7/B8/B10 ← Batch 5 (anti-meta + the multi-element exotics).

---

## 6. Shared boss infrastructure (the net-new systems)

These are the engine additions the §5 fights need. Build them once; all 10 bosses use them.

1. **Boss healthbar UI** (`hud/` — new) — an always-visible top-of-screen bar while a boss
   is alive: boss **name**, big segmented HP bar, **phase pips**, current-element indicator
   (for Warden/Prismarch), and an enrage flash. Replaces relying on the transient
   `drawTargetInfo` panel. Multi-bar variant for the Prismarch (one segment per phase).
2. **Phase system** (`enemy/boss-phases.js` — new) — a small declarative phase script per
   boss: `{ atHpPct, onEnter(), attacks[], movement }`. Generalizes today's one-shot rage
   into N HP-gated phases, each swapping the *attack set*, not just movement. The existing
   rage telegraph/invuln becomes the phase-transition primitive (telegraph → brief invuln →
   new phase).
3. **Weak-points / multi-part bodies** (`enemy/boss-parts.js` — new) — a boss can own child
   colliders (turrets, plates, egg-sacs, bolt-heads, the rotating elemental facet) with
   their own HP, element/resist, and "core invulnerable while parts live" gating. Reuses the
   enemy collider + health pipeline; parts are lightweight sub-entities.
4. **Arena modifiers** (optional, `world/`) — persistent hazard fields (CONDUCT puddles,
   CORRODE clouds, EMBER lines, CHILL pools, gravity wells). Most already exist as
   bullet/particle primitives (`lay_mine` lifetime, Singularity pull, Cryo Burst) — wrap
   them as boss-spawnable hazards.
5. **Intro & death sequences** (`enemy/boss-intro.js` — new) — a dramatic warp-in (bigger,
   slower than normal `startWarpIn`), a **name card** ("THE HARBINGER" + a one-line epithet,
   reusing the stage-subtitle slot), a brief camera/zoom beat, and a multi-stage death
   detonation. Hooks the existing screen-shake/hitstop/flash juice helpers.
6. **Boss music sting** (audio) — on boss spawn, swap to a boss track or layer an intensity
   stem; on enrage, intensify; on death, a victory sting. The music system is menu-driven
   today — add a programmatic "boss mode" trigger. *(Lowest priority; gate behind asset
   availability.)*

> **Reuse map:** rage telegraph/invuln/tantrum (`boss-rage.js`) → phase transitions;
> `_bossPair` partner-death → GEMINI; `bossFormationMovement` → MAELSTROM nodes & GEMINI
> orbit; `sweep_laser`, `crescent_wave`, `shootSpiral`, `arc_lightning`, Singularity pull,
> Cryo Burst, Nova ring, rainbow-cycle FX → boss attacks. The *only* genuinely new code is
> the healthbar UI, the phase script runner, and the weak-point sub-entity layer.

---

## 7. Implementation phasing (slots into Plans.md)

This work depends on the element system (Plans.md Phase A). It extends **A.E8** (which
already names Cinder/Glacier/Tesla Wraith/Warden) and adds a **Phase D: Bosses**. Each row
is ≥1 MINOR, its own commit(s) per CLAUDE.md.

| Phase | Task | Depends | Notes |
|---|---|---|---|
| **A.E8a** | Existing-10 element/resist retrofit + the 4 cheap verbs (GUARDIAN armor floor, WASP swarm-flock, SENTINEL bastion shield, TANGERINE OIL) + Warden adaptive resist | A.E2, A.E3, A.E5 | Highest impact / lowest cost. Mostly data + small AI hooks. |
| **A.E8b** | New enemy Batch 2 (Pyro/Cryo): Cinder, Glacier, Ashen Detonator, Frost Lance | A.E8a | Persistent-hazard + brittle/shatter hooks. |
| **A.E8c** | Batch 3 (Volt/Toxic): Tesla Wraith, Conduit Node, Plaguebearer, Spore Carrier | A.E8a | Teleport, tether-beam, spawner, acid trails. |
| **A.E8d** | Batch 4 (Void/Radiant): Devourer, Phantom, Prism Mirror, Lumen Drone, Beacon | A.E8a | Bullet-eat, invis, reflect, ally-shield, decoy. |
| **A.E8e** | Batch 5 (anti-meta + bruisers): Leech, Null Drone, Hydra, Juggernaut, Thornback, Wraithworm, remaining artillery/controllers | A.E8a, B.S1 (Leech/Null need the skill model) | Honest-build enforcers. |
| **D.B0** | **Boss infrastructure:** healthbar UI, phase-script runner, weak-point sub-entities, intro/death sequences | A.E8a | The shared chassis; all bosses need it. |
| **D.B1** | Bosses 1–2 (Harbinger, Aegis) — Kinetic/armor; validate the chassis | D.B0 | Tutorial + armor lesson. |
| **D.B2** | Bosses 3–4 (Lumen, Gemini) | D.B0, A.E8b, A.E8d | Radiant + dual-element. |
| **D.B3** | Bosses 5–6 (Maelstrom, Hivemother) | D.B0, A.E8c | Volt + Toxic. |
| **D.B4** | Bosses 7–8 (Iron Throne, Warden Prime) | D.B0, A.E8e | Combined arms + adaptive. |
| **D.B5** | Bosses 9–10 (Nullmaw, Prismarch) | D.B0, all above | Void + the finale gauntlet. |

**Wave-data changes:** replace each boss wave's `{ type:'TITAN', isBoss, bossTier }` entry
with the corresponding `{ type:'<BOSS_ID>', isBoss:true }` and re-tune the escort. Keep
`BOSS_WAVES`/`MAX_WAVES`. TITAN stays in the game as a roving elite (§3).

---

## 8. Cross-cutting concerns

- **Performance:** the status/element walk already gates on "has any status." Boss
  weak-point sub-entities are few (≤6) and pooled. Arena hazards reuse existing
  bullet/particle pools — cap concurrent hazards per boss. Gate per-frame phase logic the
  same way `boss-rage.js` gates on `isBoss && active && !dying`.
- **Testing:** unit tests for the phase-script runner (HP gates fire once, in order;
  invuln during transition), weak-point gating ("core invulnerable while parts live"),
  Warden adaptive-resist accumulation/decay, and GEMINI partner-enrage. The **AI 2-minute
  survival run** is the regression gate; add a **boss-fight smoke test** per boss (spawn it
  via cheat, AI-pilot to verify each phase reachable and the boss is killable).
- **Balance posture:** bosses should take **45–120s** for a competent build — long enough to
  see every phase, short enough not to slog. Tune HP budgets in §5 against the *expected
  build at that wave*. Adaptive/forced-switch bosses (Warden, Prismarch) must always leave
  Kinetic as a viable-if-slow fallback so a player without Prismatic isn't walled.
- **Accessibility:** every "you can fail this" attack needs a **clear telegraph** (≥1.2s
  wind-up + a distinct color/sound). No untelegraphed one-shots. Player-side statuses from
  bosses stay short and non-stunlocking (per the E5 risk note).
- **Versioning (CLAUDE.md):** each enemy batch and each boss pair = its own MINOR, own
  commit; balance re-tunes are PATCHes. **This doc is non-versionable.**
- **README:** update when the enemy count and the boss roster change (project structure +
  feature set). New files (`boss-phases.js`, `boss-parts.js`, `boss-intro.js`, boss
  healthbar in `hud/`) must be reflected in the structure section.

---

## 9. Open questions for Afeique

1. **Boss-per-stage commitment** — confirm replacing all 10 "scaled-TITAN" boss waves with
   the 10 unique bosses in §5 (TITAN demoted to roving elite). This is the central call.
2. **Stage names** — keep the existing "Iron X" stage subtitles, or rename stages to match
   the new boss identities (e.g. Stage 9 "Apocalypse" → "The Devourer")? I lean: keep stage
   names, add a boss **name card** on top.
3. **Roster size** — 22 new types is a lot. Ship all five batches, or stop after Batch 3 and
   evaluate? (Recommend: Batch 1 + bosses are the must-ship; 2–5 are content cadence.)
4. **GEMINI dual-element** — comfortable that one boss *requires* element-switching to kill
   efficiently (gated behind Elemental Infusion / a second weapon / Prismatic), or should it
   stay killable-but-slow with a single element?
5. **Multi-bar Prismarch** — one long bar with phase pips, or a literal stack of 5 bars?
6. **Boss music** — is there appetite/assets for a boss track + enrage stem + victory sting,
   or defer audio and ship the visual/mechanical fight first?
7. **Weak-point sub-entities** — OK to add a lightweight child-collider layer to the enemy
   system (`boss-parts.js`), or keep bosses single-body and fake "parts" as draw-only with
   hit-region checks?
