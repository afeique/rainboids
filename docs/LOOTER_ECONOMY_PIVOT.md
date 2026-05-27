# Looter-Economy Pivot — Design Plan

> **Status: PROPOSED / not yet implemented.** Living design, last revised 2026-05-27.
> Folds into (and partly reverses) the uncommitted 7.x. Organized **in build
> order** — each Phase is the next thing to implement. See
> [[project_economy_locking_debug_overhaul]] in memory for what 7.x already built.

---

## A. Vision & pillars

Rainboids becomes a **looter-shooter**: free build access, loot you chase and craft,
and a different run every time.

- **Free access, looted power.** Every weapon archetype, ability, and class is
  available from the start — *power* comes from looted/crafted **weapons + gear +
  Matrices**, not from unlock grinds.
- **Two progression axes, cleanly separated:**
  - *Per-run (resets):* **class pick + level + SP** — the in-run weak→strong climb.
  - *Persistent (carries over):* **Rainshards + weapons + gear + Matrices + cosmetics.**
- **Rainshards (R$)** are the one currency — earned by skill + depth + difficulty +
  R$-find + bounties; spent entirely in the **inventory** on crafting (the sink).
- **Everything scales with player level** — weapons and gear are weak early, strong
  late; variety/strength comes from *traits*, not from trivializing early waves.
- **Every run is randomized AND drafted** — pick your next stage from 2–3 options.
- **Bounties** drive experimentation + retention (directed goals, no unlock grind).

### Build-identity layers (each a *distinct kind* of decision — no redundancy)
| Layer | Source | Resets? | What it decides |
|---|---|---|---|
| **Class** | per-run pick | yes | run archetype + a unique mechanic + a signature ability |
| **Weapons** | looted/crafted items | persist | your *offense verb* (archetype) + traits |
| **Gear + Matrices** | looted/crafted items | persist | your *defensive/stat* build (level-ramped SP amp) |
| **SP** | leveling | yes | the in-run stat climb |
| **Abilities** | 4 free slots (1-4) | — | active verbs |

## B. Decisions locked (2026-05-26/27)

- Everything **unlocked**; power is looted. Cosmetics + gear/weapon power stay aspirational.
- **Per-run class + level + SP**; Rainshards/weapons/gear/Matrices persist.
- **Currency = Rainshards (R$)** (global rename of Gold/money). **Cores eliminated**
  (salvage → R$; all crafting costs R$).
- **Weapons are LOOT** — `archetype + rolled traits`. Traits **subsume attunements,
  mechanic mods, AND powerups** (multishot/rapidfire/explosive/… are now weapon
  traits). One weapon-loot system replaces four old systems.
- **Remove the in-game card draft + powerup picks entirely** (powerups → weapon
  traits; in-run power growth is now leveling/SP only).
- **All items scale with player level** (weapons + gear).
- **Hybrid loot** — drops (weapons + Matrices the jackpots) **and** inventory crafting.
- **All gear/Matrix bonuses are % amplifiers of SP, scaled by level**; pure-SP amp
  + legibility UX.
- **Matrix resonance + item set bonuses** reward build commitment.
- **No shop UI** — all economy in the inventory.
- **Classes** — per-run pick; **soft** stat lens + unique mechanic + a free
  signature ability (NOT hard ability-gating); optional persistent class mastery.
- **Fully randomized, drafted runs**; **gear/level-aware** difficulty director.
- **Fold into the uncommitted 7.x.**

**Kept from 7.x:** cheat removal, radial gating, `?debug`, compact Loadout UI,
pause LOADOUT tab, health/tank/regen fixes, 1-4 controls.

---

# IMPLEMENTATION PHASES (in build order)

## Phase 0 — Foundation rip-out & rename
*Fast, unblocks everything; mostly deletion + a rename.*

1. **Unlock everything** — rip out weapon/ability locking + the milestone gift;
   simplify the loadout list to "list everything."
2. **Rename Gold/money → Rainshards (R$)** everywhere (currency, HUD, pickups,
   particles, strings, tests). One isolated mechanical pass.
3. **Remove the card draft + powerup picks** — no stage-clear card menu. Stage clear
   now yields **R$ + drops + the next-stage draft**. The old powerup effects move to
   weapon traits (Phase 3). In-run power growth = leveling (Phase 1) only.
4. **Eliminate Cores** — salvage → R$; convert reroll/tier-up costs to R$. (Migrate
   banked Cores → R$ once on load. QA-08d Cores specs → gold specs.)

## Phase 1 — Per-run progression + PWR

5. **Per-run level/SP.** Start each run at level 1 / 0 SP; kills → XP → level → SP →
   allocate into the SP pool (HEALTH, TOUGHNESS, VAMPIRISM, THORNS, CRIT_CHANCE,
   CRIT_DAMAGE, DODGE, SPEED, CAPACITOR, REACTOR, EFFICIENCY, REGENERATION). Resets
   next run, so points can be **strong** (no permanent power-creep to nerf). XP curve
   tuned to ~level 25–30 by a full run. **Migration:** banked meta level/SP → R$ once.
6. **PWR recompute.** Keep the geometric blend `PWR = round(K·O^0.45·S^0.35·U^0.20)`
   (it punishes one-dimensional builds). Change the **inputs**: the effective-stat
   getters now fold level-scaled gear (Phase 2) + weapon power (Phase 3) + SP, so
   **PWR becomes LIVE current power that ramps within a run**. Recompute on wave
   start + **level-up** + gear/weapon/loadout change. Add THORNS/SPEED terms.
   Re-anchor `K_PWR` so a fresh L1/0-SP build ≈ 100 (`calibrateKpwr` auto-does this).
   - **PWR vs. threat readout (IN):** the draft (§Phase 4) shows each stage's
     **threat** on the same scale as PWR ("PWR 1,240 vs threat 1,400 → risky"). PWR
     stays one number; threat is the per-stage comparison number the director also reads.

## Phase 2 — Gear, Matrices & the crafting economy

### 2.1 Gear = level-scaled %-amplifiers of SP
```
effective(stat) = SP_value(stat) × (1 + ampPct(stat) × levelRamp(level))
ampPct(stat)    = Σ (gear-affix % + Matrix % + Matrix-resonance % + set-bonus %)
levelRamp(level)= clamp01((level − 1) / (LEVEL_SOFTCAP − 1))   // LEVEL_SOFTCAP ≈ 25
```
- All gear affixes + Matrix bonuses are **% amplifiers of an SP stat**, never flat.
- `levelRamp` ⇒ gear **dormant early, full late** (can't faceroll early waves; grows
  with the run). Gear amplifies **invested** SP only → rewards specialization.
- **Legibility UX:** tooltips read "Amplifies CRIT — you have 8 SP → +X eff"; an
  affix on an un-invested stat shows `INACTIVE ⚠`.

### 2.2 Matrices (gear augments)
- Every gear piece has 1 socket (2 at Transcendental / via add-socket, R$);
  weapons CANNOT socket Matrices (they have traits). Un-socket costs R$.
- A Matrix's % bonus **depends on the slot** (same Matrix, different stat/strength
  per slot). **Combine** 3×Tn→1×T(n+1) (R$). Matrices **drop** (jackpot) + craftable.
- **Resonance:** each Matrix gains a bonus per OTHER gear piece running the same
  Matrix type (shown on hover: "3/5 → +9%"). Rewards committing a build to a family.

| Matrix | COCKPIT | HULL | SHIELDING | CHASSIS | NANITES |
|---|---|---|---|---|---|
| **Vital** | +8% HEALTH | +12% HEALTH | +6% HEALTH | +6% HEALTH | +10% REGEN |
| **Aegis** | +6% DODGE | +8% HEALTH | +10% TOUGHNESS | +8% TOUGHNESS | +8% REGEN |
| **Predator** | +10% CRIT_CHANCE | +12% CRIT_DAMAGE | +5% CRIT_CHANCE | +10% THORNS | +8% VAMPIRISM |
| **Reactor** | +12% CAPACITOR | +12% REACTOR | +10% EFFICIENCY | +10% CAPACITOR | +12% REACTOR |
| **Sanguine** | +8% VAMPIRISM | +10% VAMPIRISM | +8% HEALTH | +8% THORNS | +6% VAMP, +6% REGEN |
| **Velocity** | +10% SPEED | +6% SPEED | +6% DODGE | +8% SPEED | +8% REGEN |
| **Thornguard** | +10% THORNS | +12% THORNS | +6% THORNS | +14% THORNS | +6% REGEN |
| **Evasion** | +8% DODGE | +6% DODGE | +12% DODGE | +6% TOUGHNESS | +8% SPEED |

### 2.3 Gear item templates + rarity + set bonuses
Rarity sets affix COUNT + % RANGE (+ sockets):

| Tier | Affixes | % range |
|---|---|---|
| Common | 1 | 4–8% |
| Rare | 2 | 6–12% |
| Exceptional | 3 | 8–16% |
| Legendary | 4 | 10–20% |
| Epic | 5 | 12–24% |
| Godlike | 6 | 14–28% |
| Divine | 7 | 16–32% |
| Transcendental | 8 + 2-socket | 18–36% |

Build templates (affix pool + set; 5-pc = a build-defining twist; set progress shown on hover):

| Template | Affix pool | 2-pc | 3-pc | **5-pc signature** |
|---|---|---|---|---|
| **Assassin** | CRIT_CHANCE, CRIT_DAMAGE, SPEED | +10% C.CHANCE | +20% C.DMG | crits fire a free splinter |
| **Juggernaut** | TOUGHNESS, HEALTH, THORNS | +10% TOUGH | +20% HEALTH | knockback-immune; thorns +50% |
| **Vampire** | VAMPIRISM, HEALTH, REGEN | +10% VAMP | +20% HEALTH | overheal banks as a shield |
| **Reactor** | CAPACITOR, REACTOR, EFFICIENCY | +12% REACTOR | +12% CAP | power weapons fire a bonus shot |
| **Duelist** | CRIT_CHANCE, SPEED, DODGE | +10% SPEED | +12% DODGE | a dodge guarantees next crit |
| **Bulwark** | TOUGHNESS, DODGE, THORNS | +10% DODGE | +12% TOUGH | a dodge reflects the hit |
| **Berserker** | CRIT_DAMAGE, VAMPIRISM, SPEED | +12% C.DMG | +12% VAMP | +damage as HP falls |
| **Sentinel** | REGEN, TOUGHNESS, HEALTH | +12% REGEN | +12% TOUGH | regen also ticks in combat (½) |
| **Retaliator** | THORNS, TOUGHNESS, HEALTH | +12% THORNS | +12% HEALTH | thorns can crit |
| **Overcharger** | CAPACITOR, CRIT_DAMAGE, EFFICIENCY | +12% CAP | +12% C.DMG | power shots can crit |

- Slot constrains which pool stats appear (slot personality, §2.1). Higher rarity may
  add ONE *secondary*-template stat (hybrids). Transcendental can roll a **signature**
  twist (e.g. "+CRIT also grants ½ DODGE").

### 2.4 Rainshard income (the faucet)
`per-kill R$ = 25 × waveScale(w) × difficultyMult × killstreakMult × R$findMult`
- `waveScale(w)=1+(w−1)·0.08`; `difficultyMult` EASY .7/NORMAL 1/HARD 1.4/EPIC 1.9/LEGENDARY 2.5;
  `killstreakMult` 1–1.5; `R$findMult` 1→~3 (gear affixes + Hoarder's Greed + a Matrix line).
- Bosses/elites pay kill bonuses; harder draft picks pay more; bounties pay lump sums.

**Measured run income** (30-wave run, streak 1.15, find 1.0):

| Mode | EASY | NORMAL | HARD | EPIC | LEGENDARY |
|---|---|---|---|---|---|
| Full-run R$ | 27.5k | **39.3k** | 55k | 74.7k | 98.2k |

NORMAL × find: ×1.5→59k · ×2→79k · ×3→118k. LEGENDARY × find 2.5 → ~246k.
Cumulative NORMAL: ~2.5k by W5 · 6.5k by W10 · 18k by W20 · 39k by W30.

**Wallet:** with no card draft, there's **no in-run R$ sink** — R$ banks to one
persistent wallet, spent in the inventory between runs.

### 2.5 Crafting (the sink) — all in the inventory, no shop UI
Umbrella **Crafting**; create-verb **FABRICATE** ("the Fabricator"). Every craft is a
**calculated gamble: pay more to narrow the outcome — but values always roll** (the
residual RNG that keeps it a gamble even at max precision). Verbs:

- **FABRICATE** (gear *or* weapon): pick **slot/archetype**, pay a **rarity floor**,
  add **template/trait lean** (None/Lean/Strong/Pure) + **focus** (Boost-odds /
  Guarantee one type). Live cost readout.
- **REROLL TRAIT (surgical):** pick ONE affix/trait → **Reroll** (random type) /
  **Calibrate** (lock type, reroll *value* — perfection endgame) / **Target**
  (force a specific type, premium).
- **UPGRADE TIER:** +1 rarity (keeps rolls, widens band, +1 affix slot). R$ only.
- **AUGMENT:** socket / un-socket / add-socket / **Combine** Matrices.
- **SALVAGE:** item → R$ (always < fab; the faucet/cleaner).

**Costs** (`rarityFactor`: 1/3/8/20/50/120/300/700; `rarityMult`: 1/1.5/2.5/4/6/9/13/18):
- FABRICATE = `300 × rarityFactor × templateMult(1/1.5/2.5/4) × traitMult(1/1.4/2.2)`
- REROLL = `500 × rarityMult × 1.4^n × modeMult(Reroll 1/Calibrate .8/Target 3)`
- UPGRADE = next-tier blind fab × 1.5 · COMBINE = 500/1.5k/4k/10k · Un-socket 1k×tier
- SALVAGE refund ≈ 35% of blind-fab cost.

**Calibration (validated vs. 39k NORMAL run):** blind Legendary 6k (0.15 run);
Pure+Guaranteed Legendary 53k (~1.3 runs); blind Epic 15k; Epic Pure+Guar 132k (~3.4
runs); Transcendental blind 210k (~5.3 NORMAL / ~2 LEGENDARY). → one good run = a
*meaningful step*, never a god item; perfect/Transcendental gear is a multi-run goal.
The exponential `rarityFactor` + `1.4^n` + forever-Calibrate keep the sink ahead of income.

**Crafting UI** (in inventory):
```
┌─ INVENTORY ──────────────────────────────────────── R$ 48,210 ──┐
│ EQUIPPED         STASH                ┌─ FABRICATE ───────────┐  │
│ ◧ Cockpit   [≡] │ ▤ ▤ ▤ ▤ ▤ ▤ ▤ ▤    │ Slot   ◧ Cockpit   ▾  │  │
│ ◧ Hull      [≡] │ ▤ ▤ ▤ ▤ ▤ ▤ ▤ ▤    │ Rarity Legendary   ▾  │  │
│ ◧ Shielding [≡] │ ── SELECTED ──     │ Lean   Pure·Assassin  │  │
│ ◧ Chassis   [≡] │ Legendary Cockpit  │ Focus  Guarantee CRIT │  │
│ ◧ Nanites   [≡] │ «Assassin» 3/5     │ ─────────  R$ 52,800  │  │
│ 🔫 Primary  [≡] │ +18% CRIT_CHANCE   │    [ FABRICATE ]      │  │
│ 🔫 Power    [≡] │ +14% SPEED (0 SP⚠) └───────────────────────┘  │
│                 │ ◆ «Predator T3» (res 3/5 +9%)                 │
│                 │ [REROLL▾][CALIBRATE][TARGET▾][UPGRADE][SALV]   │
└──────────────────────────────────────────────────────────────────┘
```

## Phase 3 — Weapons as loot
*The big rework: weapons become items; subsumes attunements + mods + powerups.*

### 3.1 Weapon = Archetype + Traits
- **Archetype** (fixed base = the *firing pattern*, the thing that makes a weapon
  *feel* different): primaries — Pulse (stream) · Storm (needles) · Scatter (spread)
  · Rail (pierce-line) · Cluster (lob) · Splitter · Ricochet · Boomerang · Spin
  (ramp) · Flak (airburst) · Gravity Lance. Powers — Charge · Mine · Nova (ring) ·
  Missile · Lance (beam) · Lightning (chain) · Singularity · Prism · Orbital · Cryo
  Burst · Overdrive. Base damage **scales with player level** (always level-appropriate).
- **Traits** (rolled, count by rarity), four classes:
  1. **Element** (the old *attunement*): Pyro/Cryo/Volt/Toxic/Void/Radiant + status.
  2. **Behavior** (the old *mechanic mods*): Pierce · Explosive · Homing · Chain ·
     Ricochet · Split · Knockback · Stun.
  3. **Powerup** (the old *card powerups*): Multishot · Rapidfire · Big Bullets ·
     Overcharge · Long Range · Volley, etc.
  4. **Stat %** (weapon-local): +% damage · +% fire rate · +% projectile speed ·
     +% crit chance/damage.
- **Rarity** sets trait count + roll ranges (same 8-tier ladder as gear). Weapons
  **drop** (a headline jackpot) **and** Fabricate (pick archetype + lean toward trait types).
- Example: *Legendary Pulse Cannon — Pyro · Multishot×2 · Pierce · +18% fire rate.*

### 3.2 Why this works
- **One system replaces four** (weapons + attunements + mods + powerups) — a net
  *simplification* despite the variety.
- **Variety = combinatorial** (archetype × element × behavior × powerup × stats ×
  rarity) → a "vast multitude," Borderlands-style.
- **Feel-variety > stat-variety:** distinct archetypes (stream vs. charge vs. beam)
  + behavior traits (pierce/home/bounce) change the *verb*, so players actually swap.
- **Scaling avoids early trivialization:** base damage scales with level (like gear),
  so a lucky early drop isn't a faceroll — its **traits** make it feel strong, and
  raw power tracks the wave curve.
- **Loadout:** equip 1 primary + 1 power weapon item (from stash, locked for the run,
  in-flight swap optional) — like gear, not a separate "owned weapons" set.

## Phase 4 — Randomized + drafted runs

Runs are **fully randomized** (themes/modifiers/enemies/elites/bosses, incl. stage 1
and finale — nothing anchored). Variety is delivered via a **draft**: at each stage
transition pick from **2–3 options** previewing `theme + modifier + threat + reward`.

### 4.1 Draft UI
```
┌─ CHOOSE YOUR NEXT STAGE ─────────────────── PWR 1,240 ──┐
│ ┌────────────┐  ┌────────────┐  ┌────────────┐          │
│ │ OVERLOAD   │  │ DEEP FREEZE│  │ THE VOID   │          │
│ │ Elite Pack │  │ Sudden Dth │  │ Swarm      │          │
│ │ threat 1100│  │ threat 1400│  │ threat 900 │          │
│ │ +25% R$    │  │ ◆ Matrix   │  │ standard   │          │
│ │ ◇ bounty ✓ │  │            │  │            │          │
│ │  [ PICK ]  │  │  [ PICK ]  │  │  [ PICK ]  │          │
│ └────────────┘  └────────────┘  └────────────┘          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Balance strategies (what keeps random fair)
1. **Per-stage difficulty budget** rises with depth — the randomizer "spends" it on
   enemies/modifiers/elites, bounding the curve no matter what you pick.
2. **Risk/reward spread** in every draft (a safe/lean option + a risky/rich one).
3. **Reward scales with chosen risk** (harder modifier/elite → more R$/better drops).
4. **Modifier-compat rules** (no two punishing mutators; cap elites by depth; no
   dup modifier twice in a row).
5. **Role-spread rule** (balanced composition; potent roles rarer). **Solvability
   guarantee** (kinetic always works; never all-immune-to-your-damage).
6. **Bounty-aware** — bias one option toward an active bounty.

### 4.3 Stage themes / modifiers / named challenge templates
- **Themes:** Wildfire/Pyro · Deep Freeze/Cryo · Overload/Volt · Outbreak/Toxic ·
  Hall of Mirrors/Void · Iron Wall/armor · Crossfire/snipers · First Contact/swarm ·
  Apocalypse/all · The Void/cloak.
- **Modifiers:** Swarm · Juggernaut · Elite Pack · Glass · Meteor Storm · Fog ·
  Elemental Surge · Toxic Atmosphere · Low Gravity · Sudden Death · Treasure ·
  Conduit Field · Mirror.
- **Named challenge presets** (curated combos the draft surfaces): **The Gauntlet**
  (3 elites + no heals + +100% R$) · **Glass Storm** · **The Hunt** (mega-elite) ·
  **Blackout** (fog + cloakers) · **Conduit Nightmare** · **Elemental Trial** ·
  **Last Breath** · **Swarm Apocalypse** · **Mirror Match** · **Treasure Vault** (safe/reward).

### 4.4 Enemies, elites & bosses (role-templated)
- **Role profiles** (× wave/director-scaled base): Swarmer (HP .5/spd 1.3/dmg .7) ·
  Skirmisher (.8/1.4/.9) · Sniper (.9/.6/1.6) · Tank (2.5/.5/1) · Bomber (1/.8/1.4) ·
  Support (1.2/.7/heal) · Disruptor (1/.9/strip) · Trickster (1.2/1/trick) · Bruiser
  (2/1.1/1.5) · Splitter (splits). Randomizer composes balanced spreads.
- **Elite combos** (base enemy + 1–3 affixes by depth; HP ×3–5; pays bonus R$/drops):
  Shielded · Vampiric · Volatile · Teleporter · Summoner · Frenzied · Reflective ·
  Regenerating · Hazardous · Arcane · Magnetic · auras · Conduit · Juggernaut ·
  Berserker · Phasing · Splitter · Warded · Hexer · Leech. Named: Warden, Reaver,
  Sapper, Hexweaver, Bulwark Lord, Phase Reaper, Conduit Tyrant.
- **Boss 3-phase frame:** P1 signature pattern → P2 +mechanic, faster → P3 enrage +
  telegraphed big attack + vuln window. Pattern pool: rotating weak-points · element
  plates · shield-drone reflector · twin · summoner · turret fortress · adaptive
  resist wall · devourer maw · conduit-storm · all-element finale. Bosses roll 1–2
  elite affixes for variety.

## Phase 5 — Bounties
Board: **~3 dailies** (24h local refresh) + **2 persistent contracts** (no FOMO).
Reward R$ (difficulty-scaled) + occasional Matrix or **Fabricate token**. Reroll a
bounty for R$. The §4 draft biases one option toward an active bounty.

**Catalog** (`{…}` randomized): *Combat* — kill {N}; kill {25} w/ {weapon archetype};
kill {50} w/ {element}; {2/3} bosses; {5/10} elites. *Build* — win running a {template}
(3-pc set); reach 5-pc; {3/4} Matrices socketed; resonance {3+}; equip Exceptional+
in every slot. *Skill* — reach wave {15} on HARD+; clear Sudden-Death; no-damage
stage; {30/50} streak; clear without firing primary. *Economy* — Fabricate a
{Legendary}+; Reroll {10}×; Combine {3} Matrices; Salvage {20}; bank {30k} in a run.
*Element* — clear Elemental Surge w/ counter; {Freeze/Ignite/Corrode} {50}; {20}
reactions. *Variety* — {3} themes in one run; beat {mode}; pick the high-risk draft {3}×.

## Phase 6 — Classes (per-run pick)
Picked at run start (in BUILD, alongside weapons/gear/SP); **resets each run**. A class
is a **soft lens, not a gate**: a stat lean + a **unique mechanic** + a **free
signature ability** (the normal ability pool stays open to all). Each class's mechanic
must be something no gear/set can replicate (so classes ≠ "another +crit%").

| Class | Favored stats | Unique mechanic | Signature ability |
|---|---|---|---|
| **Striker** | CRIT_CHANCE/DAMAGE | kills stack fire-rate (momentum); execute low-HP | Overdrive burst |
| **Bulwark** | TOUGHNESS/HEALTH | regenerating overshield; can't be one-shot | Fortress (root + big DR) |
| **Reaper** | VAMPIRISM | heal-on-kill; overheal banks as shield | Harvest (AoE drain) |
| **Engineer** | CAPACITOR/REACTOR | deploys a turret/drone; power weapons cost less | Deploy Sentry |
| **Tempest** | SPEED/DODGE | dash has no cooldown + leaves a damaging trail | Slipstream |
| **Elementalist** | (status) | reactions stronger / statuses spread | Elemental Nova |
| **Wildcard** | R$-FIND | extra loot/R$; a random buff each wave | Jackpot (random boon) |

- **Stat lean** = a class passive granting `+X%` to its favored SP-stat family (or
  auto-allocating some leveling SP toward it). Synergizes with matching gear/weapons.
- **Class mastery (optional persistent hook):** account XP per class → cosmetic
  titles/skins (+ maybe a tiny perk). "Main your class" retention **without**
  power-gating newcomers.
- Pairs with bounties ("win a run as the Engineer").

## Phase 7 — Balance & ship
- **Gear/level-aware director:** reads live **PWR** (which now includes level-scaled
  gear + weapon power) and offsets enemy HP/threat to keep the curve taut — subtle
  enough that gear still gives a clear net edge. (Threat scale = PWR scale, §Phase 1.)
- **Global stat caps:** TOUGHNESS 75% (exists); add DODGE ~60%, effective CRIT,
  VAMPIRISM, etc., so SP + gear + Matrices + sets + class can't reach invincibility.
- **Anti-trivialization recap:** level-scaled weapons+gear (no early faceroll) +
  caps + difficulty-mode/R$-by-difficulty routing + endless-depth endgame +
  %/scaling (not flat) bonuses.
- **Balance pass** (income vs. sink — recalibrate §2.4/2.5 together if income
  outruns the sink), tests, README/CHANGELOG, version bump.

---

## C. Open questions
1. **Economy tuning** — income vs. the escalating sink; needs a playtest pass.
2. **`levelRamp` curve** — linear vs. ease-in; `LEVEL_SOFTCAP` (≈25?).
3. **Weapon level-scaling shape** — how steeply base damage tracks level.
4. **Per-run SP/level migration** — banked → R$ conversion rate.
5. **Drop vs. craft ratio** + weapon/Matrix drop rates.
6. **Class count for v1** — start with ~5 of the 7, expand later.

## D. Complexity budget (watch this)
The build stack is large (class · weapons+traits · gear+affixes · Matrices+resonance
· set bonuses · SP). It stays coherent only because **each layer owns a distinct
role** (weapons subsume attunements/mods/powerups; classes give *mechanics*, not
stats) and **good defaults make depth opt-in** (a class ships with a sensible
starter lean + recommended weapon/gear, so a new player is guided while the full
crafting/Matrix/set depth waits for those who want it). Resist any new system that's
just "another way to get +crit%."
